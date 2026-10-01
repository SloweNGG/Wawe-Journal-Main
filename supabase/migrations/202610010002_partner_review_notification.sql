-- Migration: 202610010002_partner_review_notification.sql
-- Description: admin_review_partner_application RPC'sine otomatik bildirim oluşturma desteği

CREATE OR REPLACE FUNCTION public.admin_review_partner_application(
    p_application_id UUID,
    p_status TEXT,
    p_admin_note TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_discount NUMERIC DEFAULT 10,
    p_commission NUMERIC DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_uid UUID;
    v_is_admin BOOLEAN := false;
    v_app RECORD;
    v_code_clean TEXT;
    v_notif_sent BOOLEAN := false;
BEGIN
    v_admin_uid := auth.uid();
    IF v_admin_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim: Oturum bulunamadı.');
    END IF;

    -- Admin kontrolü (is_admin fonksiyonu veya user_profiles.role = 'admin')
    IF public.is_admin() THEN
        v_is_admin := true;
    ELSE
        SELECT (role = 'admin') INTO v_is_admin
        FROM public.user_profiles
        WHERE id = v_admin_uid;
    END IF;

    IF NOT COALESCE(v_is_admin, false) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bu işlem için admin yetkisi gereklidir.');
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum. Sadece approved veya rejected olabilir.');
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Başvuru bulunamadı.');
    END IF;

    -- Eğer Onaylandıysa ve Kod girildiyse referral_codes tablosuna ekle
    IF p_status = 'approved' AND p_code IS NOT NULL AND trim(p_code) <> '' THEN
        v_code_clean := upper(trim(p_code));

        -- Kod benzersiz mi kontrol et
        IF EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = v_code_clean) THEN
            -- Mevcut kod varsa kullanıcıyı ata
            UPDATE public.referral_codes
            SET influencer_user_id = v_app.user_id,
                discount_percent = COALESCE(p_discount, 10),
                commission_rate = COALESCE(p_commission, 4),
                is_active = true
            WHERE upper(code) = v_code_clean;
        ELSE
            -- Yeni kod oluştur
            INSERT INTO public.referral_codes (
                code,
                influencer_user_id,
                discount_percent,
                commission_rate,
                is_active
            ) VALUES (
                v_code_clean,
                v_app.user_id,
                COALESCE(p_discount, 10),
                COALESCE(p_commission, 4),
                true
            );
        END IF;
    END IF;

    -- Başvuru durumunu güncelle
    UPDATE public.partner_applications
    SET status = p_status,
        admin_note = trim(COALESCE(p_admin_note, '')),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_application_id;

    -- Kullanıcıya sistem bildirimi gönder (notifications tablosu)
    IF v_app.user_id IS NOT NULL THEN
        BEGIN
            IF p_status = 'approved' THEN
                INSERT INTO public.notifications (
                    user_id,
                    type,
                    title_key,
                    message_key,
                    meta_data,
                    is_read
                ) VALUES (
                    v_app.user_id,
                    'success',
                    'noti.partner_approved_title',
                    'noti.partner_approved_desc',
                    jsonb_build_object('code', COALESCE(v_code_clean, '')),
                    false
                );
                v_notif_sent := true;
            ELSIF p_status = 'rejected' THEN
                INSERT INTO public.notifications (
                    user_id,
                    type,
                    title_key,
                    message_key,
                    meta_data,
                    is_read
                ) VALUES (
                    v_app.user_id,
                    'warning',
                    'noti.partner_rejected_title',
                    CASE WHEN trim(COALESCE(p_admin_note, '')) <> '' THEN 'noti.partner_rejected_desc_reason' ELSE 'noti.partner_rejected_desc' END,
                    jsonb_build_object('reason', trim(COALESCE(p_admin_note, ''))),
                    false
                );
                v_notif_sent := true;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_notif_sent := false;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'notification_sent', v_notif_sent,
        'message', 'Başvuru güncellendi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_partner_application(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;
