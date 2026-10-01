-- Migration: 202610010001_delete_partner_application_rpc.sql
-- Description: Admin partner başvurusu ve bağlı kazanç/kod kayıtlarını silme RPC'si

CREATE OR REPLACE FUNCTION public.admin_delete_partner_application(
    p_application_id UUID
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
    v_user_id UUID;
BEGIN
    v_admin_uid := auth.uid();
    IF v_admin_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim: Oturum bulunamadı.');
    END IF;

    -- Admin yetki kontrolü
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

    -- Başvuruyu bul
    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Başvuru bulunamadı.');
    END IF;

    v_user_id := v_app.user_id;

    -- 1. Kullanıcıya ait referral_codes (influencer kodu ve kazançları) sil
    IF v_user_id IS NOT NULL THEN
        DELETE FROM public.referral_codes
        WHERE influencer_user_id = v_user_id;

        -- 2. Kullanıcıya ait para çekme (payout_requests) taleplerini temizle
        DELETE FROM public.payout_requests
        WHERE user_id = v_user_id;
        
        -- 3. Kullanıcıya ait tüm partner başvurularını sil (böylece tekrar başvuru yapabilir)
        DELETE FROM public.partner_applications
        WHERE user_id = v_user_id;
    ELSE
        DELETE FROM public.partner_applications
        WHERE id = p_application_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Başvuru, bağlı referans kodu ve kazanç kayıtları başarıyla silindi. Kullanıcı artık yeniden başvuru yapabilir.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_partner_application(UUID) TO authenticated;
