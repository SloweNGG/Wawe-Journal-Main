-- ============================================================
-- WAWE JOURNAL - Geliştirici test modu (1 $'lık test planı)
-- Migration: 202610150004_dev_test_mode.sql
--
-- Amaç: Sandbox çalışmadığı için GERÇEK ödeme akışını (create-payment -> NOWPayments -> webhook -> plan uzatma)
-- uçtan uca denemek. Admin panelinden bir "geliştirici kodu" belirlenir; kodu bilen kullanıcı Ayarlar >
-- Gelişmiş sekmesinde girince Plan ekranında 1 $'lık, 1 günlük bir test planı görünür ve satın alınabilir.
--
-- Güvenlik:
--   * Kod düz metin SAKLANMAZ: bcrypt (pgcrypto crypt) hash'i tutulur. Hiçbir tablo istemciden okunamaz
--     (RLS açık, policy yok); her şey SECURITY DEFINER RPC'lerle yapılır.
--   * Kodu yalnızca admin belirler/değiştirir/kapatır. Kapatılınca (enabled=false) tüm erişimler anında geçersiz olur.
--   * Kod denemesi sınırlıdır: 15 dakikada en fazla 5 başarısız deneme.
--   * Erişim süreli: kod girildikten sonra 24 saat geçerlidir.
--   * Sunucu tarafı (create-payment) test planı her istekte dev_test_access_active() ile yeniden doğrular;
--     arayüzde bir butonu açmak yetmez. Test planı fiyatı sunucuda sabittir (1 USD, 1 gün).
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- Tablolar (istemciden erişilemez: RLS açık, policy yok)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dev_test_config (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),   -- tek satır
  code_hash   text,
  enabled     boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

CREATE TABLE IF NOT EXISTS public.dev_test_access (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dev_test_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  success       boolean NOT NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_test_attempts_user_time
  ON public.dev_test_attempts (user_id, attempted_at DESC);

ALTER TABLE public.dev_test_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_test_access   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_test_attempts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- ADMIN: kodu belirle / aç-kapat
--   p_code verilirse yeni kod (en az 8 karakter) hash'lenip kaydedilir.
--   p_code NULL ise yalnızca p_enabled değiştirilir (kod daha önce belirlenmiş olmalı).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_dev_test_code(
  p_code    text DEFAULT NULL,
  p_enabled boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_code text := NULLIF(BTRIM(COALESCE(p_code, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  END IF;

  IF v_code IS NOT NULL THEN
    IF char_length(v_code) < 8 OR char_length(v_code) > 128 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Kod en az 8, en fazla 128 karakter olmalıdır.');
    END IF;
    v_hash := crypt(v_code, gen_salt('bf', 10));

    INSERT INTO public.dev_test_config (id, code_hash, enabled, updated_at, updated_by)
    VALUES (true, v_hash, COALESCE(p_enabled, true), now(), auth.uid())
    ON CONFLICT (id) DO UPDATE
      SET code_hash = EXCLUDED.code_hash,
          enabled = EXCLUDED.enabled,
          updated_at = now(),
          updated_by = auth.uid();

    -- Kod değişince eski kodla alınmış tüm erişimler iptal edilir
    DELETE FROM public.dev_test_access WHERE true;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.dev_test_config WHERE code_hash IS NOT NULL) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Önce bir kod belirlemelisiniz.');
    END IF;
    UPDATE public.dev_test_config
    SET enabled = COALESCE(p_enabled, false), updated_at = now(), updated_by = auth.uid()
    WHERE id = true;
  END IF;

  RETURN jsonb_build_object('success', true, 'enabled', (SELECT enabled FROM public.dev_test_config WHERE id = true));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_dev_test_code(text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_dev_test_code(text, boolean) TO authenticated;

-- ------------------------------------------------------------
-- ADMIN: durum (kodun kendisi ASLA dönmez)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_dev_test_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_cfg public.dev_test_config%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  END IF;

  SELECT * INTO v_cfg FROM public.dev_test_config WHERE id = true;

  RETURN jsonb_build_object(
    'success', true,
    'configured', (v_cfg.code_hash IS NOT NULL),
    'enabled', COALESCE(v_cfg.enabled, false),
    'updated_at', v_cfg.updated_at,
    'active_users', (SELECT count(*) FROM public.dev_test_access WHERE expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_dev_test_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dev_test_status() TO authenticated;

-- ------------------------------------------------------------
-- KULLANICI: kodu gir (hız sınırlı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_dev_test_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_cfg      public.dev_test_config%ROWTYPE;
  v_fails    integer;
  v_ok       boolean := false;
  v_expires  timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oturum açmanız gerekiyor.');
  END IF;

  -- Aynı kullanıcının eşzamanlı denemeleri sıraya girer (sayaç aşılamasın)
  PERFORM pg_advisory_xact_lock(hashtext('devtest:' || v_uid::text));

  SELECT count(*) INTO v_fails
  FROM public.dev_test_attempts
  WHERE user_id = v_uid AND success = false AND attempted_at > now() - interval '15 minutes';

  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.');
  END IF;

  SELECT * INTO v_cfg FROM public.dev_test_config WHERE id = true;

  -- Kapalı/ayarsızsa da aynı genel hata döner (kodun var olup olmadığı sızdırılmaz)
  IF v_cfg.code_hash IS NOT NULL AND v_cfg.enabled AND p_code IS NOT NULL THEN
    v_ok := (crypt(p_code, v_cfg.code_hash) = v_cfg.code_hash);
  END IF;

  INSERT INTO public.dev_test_attempts (user_id, success) VALUES (v_uid, v_ok);

  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz kod.');
  END IF;

  v_expires := now() + interval '24 hours';
  INSERT INTO public.dev_test_access (user_id, granted_at, expires_at)
  VALUES (v_uid, now(), v_expires)
  ON CONFLICT (user_id) DO UPDATE SET granted_at = now(), expires_at = v_expires;

  -- Eski başarısız deneme kayıtlarını temizle (şişmesin)
  DELETE FROM public.dev_test_attempts WHERE attempted_at < now() - interval '7 days';

  RETURN jsonb_build_object('success', true, 'expires_at', v_expires);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_dev_test_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.redeem_dev_test_code(text) TO authenticated;

-- ------------------------------------------------------------
-- KULLANICI: durumum / çıkış
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dev_test_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exp timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  SELECT a.expires_at INTO v_exp
  FROM public.dev_test_access a
  JOIN public.dev_test_config c ON c.id = true AND c.enabled
  WHERE a.user_id = v_uid AND a.expires_at > now();

  RETURN jsonb_build_object('active', v_exp IS NOT NULL, 'expires_at', v_exp);
END;
$$;

REVOKE ALL ON FUNCTION public.get_dev_test_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_dev_test_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.exit_dev_test_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oturum açmanız gerekiyor.');
  END IF;
  DELETE FROM public.dev_test_access WHERE user_id = auth.uid();
  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.exit_dev_test_mode() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.exit_dev_test_mode() TO authenticated;

-- ------------------------------------------------------------
-- SUNUCU (edge function, service_role): bu kullanıcı şu an test planı alabilir mi?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dev_test_access_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dev_test_access a
    JOIN public.dev_test_config c ON c.id = true AND c.enabled
    WHERE a.user_id = p_user_id AND a.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.dev_test_access_active(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_test_access_active(uuid) TO service_role;

COMMIT;
