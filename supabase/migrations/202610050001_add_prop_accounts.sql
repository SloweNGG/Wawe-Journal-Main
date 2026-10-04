-- ============================================================
-- WAWE JOURNAL - PROP ACCOUNTS MIGRATION
-- Migration: 202610050001_add_prop_accounts.sql
-- Description:
--   1. Creates public.prop_accounts table with 1-1 active journal mapping
--      via partial unique index, cascade deletion, and validation constraints.
--   2. Enforces RLS following the existing project security baseline.
--   3. Adds check_prop_account_limit trigger:
--      - Validates ownership of journal_id (INVALID_JOURNAL)
--      - Validates timezone against pg_timezone_names (INVALID_TZ)
--      - Validates rules payload size (<20000 bytes)
--      - Enforces quota (Free: 1, Active Premium: 10) on INSERT and reactivation.
--        (Existing active accounts of expired premium users continue to work,
--         only new creations and reactivations are blocked).
--   4. Updates create_journal and list_journals RPCs with live definitions,
--      adjusting only the max_journals calculation to guarantee at least 10
--      for active premium users.
-- ============================================================

BEGIN;

-- 1. TABLO OLUŞTURMA: public.prop_accounts
CREATE TABLE IF NOT EXISTS public.prop_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  template_key TEXT NULL,
  template_version TEXT NULL,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  starting_balance NUMERIC NOT NULL CHECK (starting_balance > 0),
  start_date DATE NOT NULL,
  phase_index INT NOT NULL DEFAULT 0,
  reset_tz TEXT NOT NULL DEFAULT 'UTC',
  time_shift_hours NUMERIC NOT NULL DEFAULT 0 CHECK (time_shift_hours BETWEEN -14 AND 14),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_prop_rules_size CHECK (octet_length(rules::text) < 20000)
);

-- 2. İNDEKSLER
CREATE INDEX IF NOT EXISTS idx_prop_accounts_user_active 
  ON public.prop_accounts (user_id, is_active);

-- Kısmi Unique İndeks: Bir defterin aynı anda yalnızca TEK BİR AKTİF prop hesabı olabilir.
-- Defterin prop modu kapatıldığında (is_active = false) geçmiş kayıt korunur ve yeni kayıt açılabilir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_prop_accounts_active_journal 
  ON public.prop_accounts (journal_id) 
  WHERE is_active = true;

-- 3. RLS POLİTİKALARI (Mevcut desen)
ALTER TABLE public.prop_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prop_accounts_select_own" ON public.prop_accounts;
DROP POLICY IF EXISTS "prop_accounts_insert_own" ON public.prop_accounts;
DROP POLICY IF EXISTS "prop_accounts_update_own" ON public.prop_accounts;
DROP POLICY IF EXISTS "prop_accounts_delete_own" ON public.prop_accounts;

CREATE POLICY "prop_accounts_select_own" ON public.prop_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "prop_accounts_insert_own" ON public.prop_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "prop_accounts_update_own" ON public.prop_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "prop_accounts_delete_own" ON public.prop_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 4. PROP HESAP KOTA, SAHİPLİK VE DOĞRULAMA TRİGGER'I
CREATE OR REPLACE FUNCTION public.check_prop_account_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_expires TIMESTAMPTZ;
  v_is_premium BOOLEAN;
  v_max_prop INT;
  v_current_count INT;
BEGIN
  -- A) SAHİPLİK VE DEFTER KONTROLÜ
  -- INSERT anında: Defter kullanıcıya ait ve is_active = true olmalı
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journals 
      WHERE id = NEW.journal_id 
        AND user_id = NEW.user_id 
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
  -- UPDATE anında journal_id değiştiyse: Defter kullanıcıya ait olmalı
  ELSIF TG_OP = 'UPDATE' AND (NEW.journal_id IS DISTINCT FROM OLD.journal_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journals 
      WHERE id = NEW.journal_id 
        AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
  END IF;

  -- B) TIMEZONE GEÇERLİLİK DOĞRULAMASI
  IF NEW.reset_tz IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.reset_tz
  ) THEN
    RAISE EXCEPTION 'INVALID_TZ';
  END IF;

  -- C) RULES JSONB BOYUT DOĞRULAMASI (<20000 byte)
  IF pg_column_size(NEW.rules) >= 20000 THEN
    RAISE EXCEPTION 'RULES_TOO_LARGE';
  END IF;

  -- D) KOTA KONTROLÜ (Yalnızca INSERT veya inaktif -> aktif geçişinde çalışır)
  -- ÖNEMLİ: Mevcut açık prop hesapları üzerinde yapılan güncellemeler (is_active zaten true iken)
  -- veya SELECT/okuma işlemleri bu kontrole girmez. Böylece aboneliği free'ye düşen veya süresi dolan
  -- eski premium kullanıcıların mevcut prop hesapları çalışmaya/hesaplanmaya devam eder;
  -- ancak kotanın üzerinde YENİ bir prop hesabı açmaları ya da pasif bir hesabı tekrar aktifleştirmeleri engellenir.
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR 
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active IS DISTINCT FROM true)) THEN
    
    -- Kullanıcı profilini çek (NEW.user_id kullanılır)
    SELECT plan, plan_expires_at 
    INTO v_plan, v_expires
    FROM public.user_profiles
    WHERE id = NEW.user_id;

    -- Aktif premium kontrolü: plan = 'premium' VE (süresi null veya gelecekte)
    v_is_premium := (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now()));
    v_max_prop := CASE WHEN v_is_premium THEN 10 ELSE 1 END;

    -- Aktif prop hesabı sayısı (bağlı defteri de is_active = true olanlar)
    SELECT COUNT(*)
    INTO v_current_count
    FROM public.prop_accounts pa
    JOIN public.journals j ON j.id = pa.journal_id
    WHERE pa.user_id = NEW.user_id
      AND pa.is_active = true
      AND j.is_active = true
      AND (TG_OP = 'INSERT' OR pa.id <> NEW.id);

    IF v_current_count >= v_max_prop THEN
      RAISE EXCEPTION 'PROP_LIMIT_EXCEEDED:%', v_max_prop;
    END IF;
  END IF;

  -- updated_at zaman damgası güncellemesi
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := timezone('utc'::text, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_prop_account_limit ON public.prop_accounts;
CREATE TRIGGER trg_check_prop_account_limit
  BEFORE INSERT OR UPDATE ON public.prop_accounts
  FOR EACH ROW EXECUTE FUNCTION public.check_prop_account_limit();

-- 5. CREATE_JOURNAL RPC GÜNCELLEMESİ (Canlı tanım gövdesi korundu, sadece kota revize edildi)
CREATE OR REPLACE FUNCTION public.create_journal(p_name text, p_description text, p_color text, p_icon text)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_count int;
  v_is_first boolean;
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  -- Premium kullanıcı için en az 10, free kullanıcı için DB değeri veya varsayılan 2
  SELECT 
    CASE 
      WHEN plan = 'premium' AND (plan_expires_at IS NULL OR plan_expires_at > now()) 
      THEN GREATEST(COALESCE(max_journals, 2), 10)
      ELSE COALESCE(max_journals, 2)
    END
  INTO v_max
  FROM public.user_profiles
  WHERE id = v_uid;

  IF v_max IS NULL THEN
    v_max := 2;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journals
  WHERE user_id = v_uid AND is_active = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'JOURNAL_QUOTA_EXCEEDED:%', v_max;
  END IF;

  v_is_first := (v_count = 0);

  INSERT INTO public.journals (
    user_id, name, description, color, icon, is_default, is_active
  ) VALUES (
    v_uid,
    trim(p_name),
    p_description,
    COALESCE(p_color, '#7c6dfa'),
    COALESCE(p_icon, '📁'),
    v_is_first,
    true
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_journal(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_journal(text, text, text, text) TO authenticated;

-- 6. LIST_JOURNALS RPC GÜNCELLEMESİ (Canlı tanım gövdesi korundu, sadece kota revize edildi)
CREATE OR REPLACE FUNCTION public.list_journals()
 RETURNS TABLE(id uuid, name text, description text, color text, icon text, is_default boolean, trade_count bigint, strategy_count bigint, total_pnl numeric, win_rate numeric, last_trade_date date, created_at timestamp with time zone, max_journals integer, can_create boolean, platform text, is_connected boolean, connection_status text, last_synced_at timestamp with time zone, is_prop_firm boolean, prop_firm_rules jsonb, prop_firm_status text, prop_firm_stats jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_current_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Premium kullanıcı için en az 10, free kullanıcı için DB değeri veya varsayılan 2
  SELECT 
    CASE 
      WHEN up.plan = 'premium' AND (up.plan_expires_at IS NULL OR up.plan_expires_at > now()) 
      THEN GREATEST(COALESCE(up.max_journals, 2), 10)
      ELSE COALESCE(up.max_journals, 2)
    END
  INTO v_max
  FROM public.user_profiles up 
  WHERE up.id = v_uid;

  IF v_max IS NULL THEN v_max := 2; END IF;

  SELECT count(*) INTO v_current_count
  FROM public.journals WHERE user_id = v_uid AND is_active = true;

  RETURN QUERY
  SELECT 
    j.id::uuid,
    j.name::text,
    j.description::text,
    j.color::text,
    j.icon::text,
    j.is_default::boolean,
    COALESCE(t.t_count, 0)::bigint,
    COALESCE(s.s_count, 0)::bigint,
    COALESCE(t.t_pnl, 0)::numeric,
    COALESCE(t.w_rate, 0)::numeric,
    t.l_trade_date::date,
    j.created_at::timestamptz,
    v_max::int,
    (v_current_count < v_max)::boolean,
    j.platform::text,
    COALESCE(j.is_connected, false)::boolean,
    COALESCE(j.connection_status, 'disconnected')::text,
    j.last_synced_at::timestamptz,
    COALESCE(j.is_prop_firm, false)::boolean,
    j.prop_firm_rules::jsonb,
    COALESCE(j.prop_firm_status, 'none')::text,
    j.prop_firm_stats::jsonb
  FROM public.journals j
  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*) AS t_count,
      SUM(pnl) AS t_pnl,
      CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)) * 100 ELSE 0 END AS w_rate,
      MAX(trade_date)::date AS l_trade_date
    FROM public.trades tr WHERE tr.journal_id = j.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS s_count
    FROM public.strategies st WHERE st.journal_id = j.id
  ) s ON true
  WHERE j.user_id = v_uid AND j.is_active = true
  ORDER BY j.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_journals() FROM public;
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated;

COMMIT;
