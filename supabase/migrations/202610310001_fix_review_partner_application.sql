-- ============================================================
-- WAWE JOURNAL - FIX PARTNER APPLICATION REVIEW
-- Migration: 202610310001_fix_review_partner_application.sql
-- Description:
--   review_partner_application (202610050001) wrote columns that partner_applications does not have
--   (full_name, assigned_code, reviewed_at, reviewed_by), so every approval failed with
--   'record "v_app" has no field "full_name"' and the admin panel could not approve anyone.
--   This replaces the function with the SAME signature (the admin panel call in admin-data.js is unchanged) and:
--     - only touches columns that exist: partner_applications(status, admin_note, updated_at),
--       referral_codes(code, discount_percent, commission_rate, commission_rate_yearly, influencer_user_id,
--       referrer_name, is_active, updated_at)
--     - referrer_name = the applicant's Instagram handle ('@name'); a name already set on an existing code is kept
--     - refuses to move a code that already belongs to ANOTHER partner (before, it was silently reassigned)
--     - sends the approved / rejected notification again (it was dropped in 202610050001; same keys and payload as
--       admin_review_partner_application in 202610010002)
--     - admin check like admin_review_partner_application: is_admin() or user_profiles.role = 'admin'
--   No table, column, policy or data change.
-- Run order: after 202610290001. Rollback: supabase/rollbacks/202610310001_fix_review_partner_application.down.sql
-- Rehearsal: supabase/tests/rehearse_202610310001.mjs (PGlite)
-- How to run: psql -v ON_ERROR_STOP=1 (or the SQL Editor), the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.partner_applications') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.partner_applications is missing (202609250002 not applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'referral_codes' AND column_name = 'commission_rate_yearly') THEN
    RAISE EXCEPTION 'PRECONDITION: referral_codes.commission_rate_yearly is missing (202610050001 not applied).';
  END IF;
  IF to_regprocedure('public.review_partner_application(uuid, text, text, text, numeric, numeric, numeric)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.review_partner_application(uuid, text, text, text, numeric, numeric, numeric) is missing (202610050001 not applied).';
  END IF;
END $$;

-- 1. FUNCTION ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_partner_application(
    p_app_id UUID,
    p_status TEXT,
    p_admin_note TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_discount NUMERIC DEFAULT 10,
    p_commission NUMERIC DEFAULT 4,
    p_commission_yearly NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_uid UUID := auth.uid();
    v_is_admin BOOLEAN := false;
    v_app RECORD;
    v_code_clean TEXT;
    v_owner UUID;
    v_ref_name TEXT;
    v_note TEXT := NULLIF(trim(COALESCE(p_admin_note, '')), '');
    v_notif_sent BOOLEAN := false;
BEGIN
    IF v_admin_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim: Oturum bulunamadı.');
    END IF;

    IF public.is_admin() THEN
        v_is_admin := true;
    ELSE
        SELECT (role = 'admin') INTO v_is_admin FROM public.user_profiles WHERE id = v_admin_uid;
    END IF;
    IF NOT COALESCE(v_is_admin, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim. Sadece yöneticiler başvuruları inceleyebilir.');
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum. Sadece "approved" veya "rejected" olabilir.');
    END IF;

    SELECT * INTO v_app FROM public.partner_applications WHERE id = p_app_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Başvuru bulunamadı.');
    END IF;

    IF p_status = 'approved' THEN
        v_code_clean := upper(trim(COALESCE(p_code, '')));
        IF v_code_clean = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Onaylama işlemi için bir referans kodu belirlemelisiniz.');
        END IF;

        -- '@handle' from '@handle', 'handle' or 'https://www.instagram.com/handle/?x'
        v_ref_name := regexp_replace(trim(COALESCE(v_app.instagram, '')), '^(https?://)?(www\.)?instagram\.com/', '', 'i');
        v_ref_name := split_part(split_part(v_ref_name, '/', 1), '?', 1);
        v_ref_name := NULLIF(ltrim(v_ref_name, '@'), '');
        IF v_ref_name IS NOT NULL THEN
            v_ref_name := '@' || v_ref_name;
        END IF;

        SELECT influencer_user_id INTO v_owner
        FROM public.referral_codes WHERE upper(code) = v_code_clean
        FOR UPDATE;

        IF FOUND THEN
            IF v_owner IS NOT NULL AND v_owner <> v_app.user_id THEN
                RETURN jsonb_build_object('success', false, 'error', 'Bu referans kodu başka bir partnere ait. Farklı bir kod belirleyin.');
            END IF;

            UPDATE public.referral_codes
            SET discount_percent = COALESCE(p_discount, 10),
                commission_rate = COALESCE(p_commission, 4),
                commission_rate_yearly = COALESCE(p_commission_yearly, 0),
                influencer_user_id = v_app.user_id,
                referrer_name = COALESCE(NULLIF(trim(referrer_name), ''), v_ref_name),
                is_active = true,
                updated_at = now()
            WHERE upper(code) = v_code_clean;
        ELSE
            INSERT INTO public.referral_codes (
                code, discount_percent, commission_rate, commission_rate_yearly,
                influencer_user_id, referrer_name, is_active
            ) VALUES (
                v_code_clean, COALESCE(p_discount, 10), COALESCE(p_commission, 4), COALESCE(p_commission_yearly, 0),
                v_app.user_id, v_ref_name, true
            );
        END IF;
    END IF;

    UPDATE public.partner_applications
    SET status = p_status,
        admin_note = COALESCE(v_note, ''),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_app_id;

    -- Kullanıcıya sistem bildirimi (bildirim başarısız olsa da inceleme geçerli kalır)
    IF v_app.user_id IS NOT NULL THEN
        BEGIN
            IF p_status = 'approved' THEN
                INSERT INTO public.notifications (user_id, type, title_key, message_key, meta_data, is_read)
                VALUES (v_app.user_id, 'success', 'noti.partner_approved_title', 'noti.partner_approved_desc',
                        jsonb_build_object('code', v_code_clean), false);
            ELSE
                INSERT INTO public.notifications (user_id, type, title_key, message_key, meta_data, is_read)
                VALUES (v_app.user_id, 'warning', 'noti.partner_rejected_title',
                        CASE WHEN v_note IS NOT NULL THEN 'noti.partner_rejected_desc_reason' ELSE 'noti.partner_rejected_desc' END,
                        jsonb_build_object('reason', COALESCE(v_note, '')), false);
            END IF;
            v_notif_sent := true;
        EXCEPTION WHEN OTHERS THEN
            v_notif_sent := false;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'code', v_code_clean,
        'notification_sent', v_notif_sent,
        'message', CASE WHEN p_status = 'approved'
                        THEN 'Partner başvurusu onaylandı ve referans kodu oluşturuldu.'
                        ELSE 'Partner başvurusu reddedildi.' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_partner_application(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

COMMIT;
