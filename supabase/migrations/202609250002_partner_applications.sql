-- ============================================================
-- MIGRATION: 202609250002_partner_applications.sql
-- WJ Partner Programı Başvuru Sistemi ve 14 Günlük Başvuru Limiti
-- ============================================================

-- 1. Partner Applications Tablosu
CREATE TABLE IF NOT EXISTS public.partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    instagram TEXT NOT NULL,
    follower_count TEXT NOT NULL,
    uses_crypto BOOLEAN NOT NULL DEFAULT true,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_partner_applications_user ON public.partner_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_applications_status ON public.partner_applications(status);
CREATE INDEX IF NOT EXISTS idx_partner_applications_created ON public.partner_applications(created_at DESC);

-- RLS Etkinleştir
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;

-- Kullanıcı sadece kendi başvurularını görebilir
DROP POLICY IF EXISTS "Users can view own partner applications" ON public.partner_applications;
CREATE POLICY "Users can view own partner applications"
    ON public.partner_applications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Kullanıcı sadece kendi adına başvuru ekleyebilir
DROP POLICY IF EXISTS "Users can insert own partner applications" ON public.partner_applications;
CREATE POLICY "Users can insert own partner applications"
    ON public.partner_applications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Adminler tüm başvuruları görebilir ve güncelleyebilir
DROP POLICY IF EXISTS "Admins can view and update partner applications" ON public.partner_applications;
CREATE POLICY "Admins can view and update partner applications"
    ON public.partner_applications
    FOR ALL
    USING (
        public.is_admin() = true
        OR EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        public.is_admin() = true
        OR EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 2. Güvenli RPC: Başvuru Gönder (14 Gün Limit Kontrolü ile)
CREATE OR REPLACE FUNCTION public.submit_partner_application(
    p_instagram TEXT,
    p_follower_count TEXT,
    p_uses_crypto BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID;
    v_last_app RECORD;
    v_days_left INT;
    v_new_id UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Oturum açmanız gerekiyor.';
    END IF;

    -- Validasyon
    IF trim(COALESCE(p_instagram, '')) = '' THEN
        RAISE EXCEPTION 'Instagram adresi boş bırakılamaz.';
    END IF;

    IF trim(COALESCE(p_follower_count, '')) = '' THEN
        RAISE EXCEPTION 'Takipçi sayısı seçilmelidir.';
    END IF;

    -- Kullanıcının son başvurusunu kontrol et
    SELECT * INTO v_last_app
    FROM public.partner_applications
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        -- Eğer beklemede olan bir başvuru varsa yeni başvuru yapılamaz
        IF v_last_app.status = 'pending' THEN
            RAISE EXCEPTION 'Zaten incelenmekte olan bir başvurunuz bulunmaktadır.';
        END IF;

        -- Eğer onaylandıysa ve zaten kodu varsa
        IF v_last_app.status = 'approved' THEN
            RAISE EXCEPTION 'Başvurunuz zaten onaylanmıştır.';
        END IF;

        -- Eğer reddedildiyse ve son 14 gün içindeyse
        IF v_last_app.status = 'rejected' THEN
            IF v_last_app.created_at > (timezone('utc'::text, now()) - INTERVAL '14 days') THEN
                v_days_left := 14 - EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_last_app.created_at))::INT;
                IF v_days_left <= 0 THEN v_days_left := 1; END IF;
                RAISE EXCEPTION 'Yeni bir başvuru yapabilmek için % gün beklemeniz gerekmektedir.', v_days_left;
            END IF;
        END IF;
    END IF;

    -- Yeni başvuru ekle
    INSERT INTO public.partner_applications (
        user_id,
        instagram,
        follower_count,
        uses_crypto,
        note,
        status
    ) VALUES (
        v_uid,
        trim(p_instagram),
        trim(p_follower_count),
        COALESCE(p_uses_crypto, true),
        trim(COALESCE(p_note, '')),
        'pending'
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'application_id', v_new_id,
        'message', 'Başvurunuz başarıyla alındı.'
    );
END;
$$;

-- 3. Kullanıcının En Son Başvuru Durumunu Getiren RPC
CREATE OR REPLACE FUNCTION public.get_my_partner_application()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID;
    v_app RECORD;
    v_days_since_created INT;
    v_days_left INT := 0;
    v_can_reapply BOOLEAN := true;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('has_application', false);
    END IF;

    SELECT * INTO v_app
    FROM public.partner_applications
    WHERE user_id = v_uid
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'has_application', false,
            'can_reapply', true
        );
    END IF;

    IF v_app.status = 'pending' THEN
        v_can_reapply := false;
    ELSIF v_app.status = 'approved' THEN
        v_can_reapply := false;
    ELSIF v_app.status = 'rejected' THEN
        v_days_since_created := EXTRACT(DAY FROM (timezone('utc'::text, now()) - v_app.created_at))::INT;
        IF v_days_since_created < 14 THEN
            v_can_reapply := false;
            v_days_left := 14 - v_days_since_created;
            IF v_days_left <= 0 THEN v_days_left := 1; END IF;
        ELSE
            v_can_reapply := true;
            v_days_left := 0;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'has_application', true,
        'id', v_app.id,
        'status', v_app.status,
        'instagram', v_app.instagram,
        'follower_count', v_app.follower_count,
        'uses_crypto', v_app.uses_crypto,
        'note', v_app.note,
        'admin_note', v_app.admin_note,
        'created_at', v_app.created_at,
        'can_reapply', v_can_reapply,
        'days_until_reapply', v_days_left
    );
END;
$$;

-- 4. Admin İşlemi: Başvuru Değerlendir (Onayla/Reddet ve Opsiyonel Kod Oluştur)
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

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'message', 'Başvuru güncellendi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_partner_application(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_partner_application(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_partner_application() TO authenticated;
