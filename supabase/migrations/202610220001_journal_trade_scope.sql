-- ============================================================
-- WAWE JOURNAL - PER-JOURNAL "WHICH TRADES ARE VISIBLE" SETTING
-- Migration: 202610220001_journal_trade_scope.sql
-- Description:
--   1. public.journals.trade_scope text NOT NULL DEFAULT 'live'  CHECK IN ('live','backtest','all').
--      Every existing journal becomes 'live' (the column default fills them), so no user's screen changes.
--   2. create_journal(p_name, p_description, p_color, p_icon, p_trade_scope DEFAULT 'live'):
--      the old 4-argument signature is replaced (an old client that sends 4 arguments keeps working).
--   3. update_journal(p_journal_id, p_name, p_description, p_color, p_icon, p_trade_scope DEFAULT NULL):
--      NULL keeps the current value (an old client that sends 5 arguments keeps the scope untouched).
--   4. list_journals(): returns trade_scope as the LAST column, and trade_count / total_pnl / win_rate /
--      last_trade_date count only the trades the journal's scope shows (live: platform_source IS DISTINCT FROM
--      'backtest' = the old behaviour; backtest: platform_source = 'backtest'; all: everything).
--   5. get_journals_equity_data(): same scope rule per journal (it had no backtest filter at all before;
--      no client calls it).
--   Untouched on purpose (always live trades only): evaluate_prop_firm_rules / prop cards, cTrader sync,
--   overtrade and notifications, get_platform_stats, get_total_trades_count, get_today_trades_count,
--   get_strategy_performance, sync_journal_trades.
-- Run order: after 202610180009. Rollback: docs/backtest-v2/sql/supabase/rollbacks/202610220001_journal_trade_scope.down.sql
-- How to run: Supabase SQL Editor or psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction).
--   Writes to the LIVE schema: backup first (docs/backtest-v2/KURALLAR.md sections 1 and 3).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS / DRIFT GUARDS ---------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  IF to_regclass('public.journals') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.journals not found.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'journals' AND column_name = 'trade_scope') THEN
    RAISE EXCEPTION 'ORDER: journals.trade_scope already exists (this migration was already applied).';
  END IF;
  -- list_journals must still be the migration-05 version (backtest rows excluded), not something newer
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'list_journals' AND p.pronargs = 0;
  IF v_src IS NULL THEN RAISE EXCEPTION 'DRIFT: public.list_journals() not found.'; END IF;
  IF position('platform_source IS DISTINCT FROM ''backtest''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'DRIFT: list_journals() is not the migration-05 version (no backtest filter); review before applying.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('create_journal', 'update_journal')) <> 2 THEN
    RAISE EXCEPTION 'DRIFT: expected exactly one create_journal and one update_journal.';
  END IF;
  IF to_regprocedure('public.create_journal(text,text,text,text)') IS NULL
     OR to_regprocedure('public.update_journal(uuid,text,text,text,text)') IS NULL
     OR to_regprocedure('public.get_journals_equity_data()') IS NULL THEN
    RAISE EXCEPTION 'DRIFT: create_journal / update_journal / get_journals_equity_data signatures differ from the live ones of 2026-10-22.';
  END IF;
END $$;

-- 1. Column ----------------------------------------------------------------------------------------
ALTER TABLE public.journals ADD COLUMN trade_scope text NOT NULL DEFAULT 'live';
ALTER TABLE public.journals ADD CONSTRAINT chk_journals_trade_scope
  CHECK (trade_scope IN ('live', 'backtest', 'all'));
COMMENT ON COLUMN public.journals.trade_scope IS
  'Which trades the journal shows on dashboard / premium dashboard / calendar / strategies / PDF / journal cards and as the Trades page default: live (normal trades, default), backtest (copies from linked backtest accounts), all. Prop, cTrader sync, overtrade and notifications always use live trades only.';

-- 2. create_journal ----------------------------------------------------------------------------------
DROP FUNCTION public.create_journal(text, text, text, text);

CREATE FUNCTION public.create_journal(
  p_name text, p_description text, p_color text, p_icon text, p_trade_scope text DEFAULT 'live')
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
  v_scope text := COALESCE(p_trade_scope, 'live');
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  IF v_scope NOT IN ('live', 'backtest', 'all') THEN
    RAISE EXCEPTION 'INVALID_TRADE_SCOPE';
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
    user_id, name, description, color, icon, is_default, is_active, trade_scope
  ) VALUES (
    v_uid,
    trim(p_name),
    p_description,
    COALESCE(p_color, '#7c6dfa'),
    COALESCE(p_icon, '📁'),
    v_is_first,
    true,
    v_scope
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_journal(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_journal(text, text, text, text, text) TO authenticated, service_role;

-- 3. update_journal ----------------------------------------------------------------------------------
DROP FUNCTION public.update_journal(uuid, text, text, text, text);

CREATE FUNCTION public.update_journal(
  p_journal_id uuid, p_name text, p_description text, p_color text, p_icon text, p_trade_scope text DEFAULT NULL)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  IF p_trade_scope IS NOT NULL AND p_trade_scope NOT IN ('live', 'backtest', 'all') THEN
    RAISE EXCEPTION 'INVALID_TRADE_SCOPE';
  END IF;

  UPDATE public.journals
  SET 
    name = trim(p_name),
    description = p_description,
    color = p_color,
    icon = p_icon,
    trade_scope = COALESCE(p_trade_scope, trade_scope)
  WHERE id = p_journal_id AND user_id = v_uid
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_journal(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_journal(uuid, text, text, text, text, text) TO authenticated, service_role;

-- 4. list_journals (return type changes: drop + create) ---------------------------------------------
DROP FUNCTION public.list_journals();

CREATE FUNCTION public.list_journals()
 RETURNS TABLE(id uuid, name text, description text, color text, icon text, is_default boolean, trade_count bigint, strategy_count bigint, total_pnl numeric, win_rate numeric, last_trade_date date, created_at timestamp with time zone, max_journals integer, can_create boolean, platform text, is_connected boolean, connection_status text, last_synced_at timestamp with time zone, is_prop_firm boolean, prop_firm_rules jsonb, prop_firm_status text, prop_firm_stats jsonb, trade_scope text)
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
    j.prop_firm_stats::jsonb,
    j.trade_scope::text
  FROM public.journals j
  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*) AS t_count,
      SUM(pnl) AS t_pnl,
      CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)) * 100 ELSE 0 END AS w_rate,
      MAX(trade_date)::date AS l_trade_date
    FROM public.trades tr
    WHERE tr.journal_id = j.id
      AND (j.trade_scope = 'all'
           OR (j.trade_scope = 'backtest' AND tr.platform_source = 'backtest')
           OR (j.trade_scope = 'live' AND tr.platform_source IS DISTINCT FROM 'backtest'))
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS s_count
    FROM public.strategies st WHERE st.journal_id = j.id
  ) s ON true
  WHERE j.user_id = v_uid AND j.is_active = true
  ORDER BY j.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_journals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated, service_role;

-- 5. get_journals_equity_data: same scope rule per journal ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_journals_equity_data()
 RETURNS TABLE(journal_id uuid, journal_name text, journal_color text, journal_icon text, trade_date date, pnl numeric, cumulative_pnl numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT 
      j.id AS jid,
      j.name AS jname,
      j.color AS jcolor,
      j.icon AS jicon,
      t.trade_date AS tdate,
      t.pnl AS tpnl,
      SUM(t.pnl) OVER (
        PARTITION BY j.id 
        ORDER BY t.trade_date, t.created_at 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cum_pnl
    FROM public.journals j
    INNER JOIN public.trades t ON t.journal_id = j.id
    WHERE j.user_id = v_uid 
      AND j.is_active = true 
      AND t.pnl IS NOT NULL
      AND (j.trade_scope = 'all'
           OR (j.trade_scope = 'backtest' AND t.platform_source = 'backtest')
           OR (j.trade_scope = 'live' AND t.platform_source IS DISTINCT FROM 'backtest'))
  )
  SELECT 
    r.jid::uuid,
    r.jname::text,
    COALESCE(r.jcolor, '#7c6dfa')::text,
    COALESCE(r.jicon, 'folder')::text,
    r.tdate::date,
    r.tpnl::numeric,
    r.cum_pnl::numeric
  FROM ranked r
  ORDER BY r.jid, r.tdate;
END;
$function$;

-- 6. CHECKS (read only) -------------------------------------------------------------------------------
DO $$
DECLARE v_bad int; v_total int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE trade_scope <> 'live') INTO v_total, v_bad FROM public.journals;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'CHECK: % of % existing journals are not live after the migration', v_bad, v_total;
  END IF;
  IF to_regprocedure('public.create_journal(text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.update_journal(uuid,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.create_journal(text,text,text,text)') IS NOT NULL
     OR to_regprocedure('public.update_journal(uuid,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK: journal function signatures are not as expected';
  END IF;
  RAISE NOTICE 'journal_trade_scope OK: % journals, all live', v_total;
END $$;

COMMIT;
