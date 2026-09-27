-- ============================================================
-- MIGRATION: 202609280001_security_hardening.sql
-- Production Güvenlik Sıkılaştırma:
-- 1. journals tablosu RLS koruması
-- 2. payout_requests tablosu direkt insert koruması (sadece RPC)
-- 3. partner_applications tablosu direkt insert koruması (sadece RPC)
-- 4. notifications okundu ve sayaç RPC'lerinde yetkilendirme doğrulaması
-- ============================================================

BEGIN;

-- 1. JOURNALS TABLOSU RLS GÜVENLİĞİ
DO $$
BEGIN
  IF to_regclass('public.journals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.journals ENABLE ROW LEVEL SECURITY';

    -- Eski politikaları temizle
    EXECUTE 'DROP POLICY IF EXISTS "journals_select_own" ON public.journals';
    EXECUTE 'DROP POLICY IF EXISTS "journals_insert_own" ON public.journals';
    EXECUTE 'DROP POLICY IF EXISTS "journals_update_own" ON public.journals';
    EXECUTE 'DROP POLICY IF EXISTS "journals_delete_own" ON public.journals';

    -- Kullanıcı sadece kendi defterlerini görebilir
    EXECUTE 'CREATE POLICY "journals_select_own" ON public.journals
      FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_admin() = true)';

    -- Kullanıcı sadece kendi adına defter ekleyebilir (Fonksiyon ile ekleme tavsiye edilir)
    EXECUTE 'CREATE POLICY "journals_insert_own" ON public.journals
      FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid())';

    -- Kullanıcı sadece kendi defterini güncelleyebilir
    EXECUTE 'CREATE POLICY "journals_update_own" ON public.journals
      FOR UPDATE TO authenticated
      USING (user_id = auth.uid() OR public.is_admin() = true)
      WITH CHECK (user_id = auth.uid() OR public.is_admin() = true)';

    -- Kullanıcı sadece kendi defterini silebilir
    EXECUTE 'CREATE POLICY "journals_delete_own" ON public.journals
      FOR DELETE TO authenticated
      USING (user_id = auth.uid() OR public.is_admin() = true)';
  END IF;
END $$;


-- 2. PAYOUT_REQUESTS GÜVENLİK SIKILAŞTIRMASI
-- Kullanıcılar doğrudan payout_requests tablosuna INSERT yapamamalı.
-- Çekim talepleri SADECE submit_payout_request() RPC'si (SECURITY DEFINER) üzerinden
-- bakiye ve minimum tutar kontrolü yapılarak eklenmelidir.
DROP POLICY IF EXISTS "payout_requests_user_insert" ON public.payout_requests;


-- 3. PARTNER_APPLICATIONS GÜVENLİK SIKILAŞTIRMASI
-- Kullanıcılar doğrudan partner_applications tablosuna INSERT yapamamalı.
-- Doğrudan insert yapılırsa kullanıcı status='approved' enjekte edebilir veya 14 günlük limit RPC'sini atlayabilir.
-- Başvurular SADECE submit_partner_application() RPC'si (SECURITY DEFINER) üzerinden yapılmalıdır.
DROP POLICY IF EXISTS "Users can insert own partner applications" ON public.partner_applications;


-- 4. NOTIFICATIONS RPC YETKİLENDİRME GÜVENLİĞİ
-- Kullanıcıların başka kullanıcıların bildirimlerini okundu işaretlemesini veya
-- unread sayaçlarını okumasını engelleyen yetki kontrolü.

CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to notifications';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.notifications
    WHERE user_id = p_user_id AND is_read = false;
    
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to notifications';
    END IF;

    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = p_user_id AND is_read = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_user_id UUID, p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized access to notifications';
    END IF;

    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = p_user_id AND id = p_notification_id;
END;
$$;

COMMIT;
