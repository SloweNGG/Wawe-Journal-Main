-- ============================================================
-- ROLLBACK of 202610310001_fix_review_partner_application.sql
-- Restores review_partner_application exactly as 202610050001 defined it (copied verbatim below).
-- NOTE: that version is the broken one: approvals fail again with 'record "v_app" has no field "full_name"'
-- and no approval/rejection notification is sent. Only roll back if the new version itself causes a problem.
-- Run with psql -v ON_ERROR_STOP=1 (or the SQL Editor), the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regprocedure('public.review_partner_application(uuid, text, text, text, numeric, numeric, numeric)') IS NULL THEN
    RAISE EXCEPTION 'ORDER: public.review_partner_application(uuid, text, text, text, numeric, numeric, numeric) is missing.';
  END IF;
END $$;

-- Verbatim from supabase/migrations/202610050001_add_yearly_commission.sql (section 6)
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
    v_app RECORD;
    v_code_clean TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim. Sadece yöneticiler başvuruları inceleyebilir.');
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum. Sadece "approved" veya "rejected" olabilir.');
    END IF;

    SELECT * INTO v_app FROM public.partner_applications WHERE id = p_app_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Başvuru bulunamadı.');
    END IF;

    IF p_status = 'approved' AND (p_code IS NULL OR TRIM(p_code) = '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Onaylama işlemi için bir referans kodu belirlemelisiniz.');
    END IF;

    IF p_status = 'approved' THEN
        v_code_clean := UPPER(TRIM(p_code));

        IF EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = v_code_clean) THEN
            UPDATE public.referral_codes
            SET discount_percent = COALESCE(p_discount, 10),
                commission_rate = COALESCE(p_commission, 4),
                commission_rate_yearly = COALESCE(p_commission_yearly, 0),
                influencer_user_id = v_app.user_id,
                referrer_name = v_app.full_name,
                is_active = true,
                updated_at = now()
            WHERE upper(code) = v_code_clean;
        ELSE
            INSERT INTO public.referral_codes (
                code,
                discount_percent,
                commission_rate,
                commission_rate_yearly,
                influencer_user_id,
                referrer_name,
                is_active
            ) VALUES (
                v_code_clean,
                COALESCE(p_discount, 10),
                COALESCE(p_commission, 4),
                COALESCE(p_commission_yearly, 0),
                v_app.user_id,
                v_app.full_name,
                true
            );
        END IF;

        UPDATE public.partner_applications
        SET status = 'approved',
            admin_note = p_admin_note,
            assigned_code = v_code_clean,
            reviewed_at = now(),
            reviewed_by = auth.uid(),
            updated_at = now()
        WHERE id = p_app_id;
    ELSE
        UPDATE public.partner_applications
        SET status = 'rejected',
            admin_note = p_admin_note,
            reviewed_at = now(),
            reviewed_by = auth.uid(),
            updated_at = now()
        WHERE id = p_app_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'code', v_code_clean,
        'message', CASE WHEN p_status = 'approved' THEN 'Partner başvurusu onaylandı ve referans kodu oluşturuldu.' ELSE 'Partner başvurusu reddedildi.' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_partner_application(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

COMMIT;
