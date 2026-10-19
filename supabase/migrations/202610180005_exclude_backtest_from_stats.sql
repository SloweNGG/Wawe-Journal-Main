-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 6: EXCLUDE BACKTEST ROWS FROM THE SQL STATISTICS
-- Migration: 202610180005_exclude_backtest_from_stats.sql
-- Description (R20, D6): the two SQL functions the app calls that aggregate public.trades get the
--   NULL-safe predicate  platform_source IS DISTINCT FROM 'backtest'  (NULL = manual/CSV trades stay in).
--   1. list_journals(): LIVE body; the only change is the predicate in the trades LATERAL, so
--      trade_count, total_pnl, win_rate and last_trade_date become live-only. Signature unchanged, so
--      CREATE OR REPLACE keeps the function (no DROP, no PostgREST signature change).
--      Callers: public/src/core/journal.js:65,73 (every app page via ensureActiveJournal), navbar
--      journal switcher, src/pages/journals.astro.
--   2. get_platform_stats(): LIVE body; totalTrades and todayTrades exclude backtest rows.
--      Caller: public/src/services/stats.js:35 (landing page, ANON) - so it stays anon-executable.
--   Both keep their attributes (SECURITY DEFINER, search_path, STABLE for get_platform_stats).
--   ACL re-asserted: list_journals EXECUTE for authenticated only (anon had it live through Supabase's
--   default privileges; the function rejects anon anyway); get_platform_stats for anon + authenticated.
-- Stage: 6 (statistics)
-- Run order: 5
-- Rollback: supabase/rollbacks/202610180005_exclude_backtest_from_stats.down.sql
-- Prerequisites: none in the database. Run it BEFORE the Stage 5+6 client is deployed, i.e. before the
--   first backtest mirror can exist in public.trades (D2: Stage 5 and 6 ship together).
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS (drift guards) ---------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.list_journals()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('f12fbef040de7b41cc2091c196e6e282', 'd4f0bce277a530a47cff7d18c4420590') THEN
    RAISE EXCEPTION 'DRIFT: public.list_journals() differs from the 2026-10-18 snapshot (normalised md5 %). Re-base this file on SELECT pg_get_functiondef(''public.list_journals()''::regprocedure); first.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_platform_stats()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('23ea1c0b396c9a56081f0c57788af182', '58059ba9418512361e746a2100713457') THEN
    RAISE EXCEPTION 'DRIFT: public.get_platform_stats() differs from the 2026-10-18 snapshot (normalised md5 %). Re-base this file on SELECT pg_get_functiondef(''public.get_platform_stats()''::regprocedure); first.', v_md5;
  END IF;
END $$;

-- 1. list_journals(): live-only statistics -------------------------------------------------------------
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
    FROM public.trades tr WHERE tr.journal_id = j.id AND tr.platform_source IS DISTINCT FROM 'backtest'
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
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated;

-- 2. get_platform_stats(): landing-page counters without backtest rows -----------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'totalUsers',   (select count(*) from public.user_profiles),
    'totalTrades',  (select count(*) from public.trades where platform_source is distinct from 'backtest'),
    'todayUsers',   (select count(*) from public.user_profiles where created_at >= current_date),
    'todayTrades',  (select count(*) from public.trades where created_at >= current_date and platform_source is distinct from 'backtest')
  );
$function$;

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Body versions (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = 'd4f0bce277a530a47cff7d18c4420590' FROM pg_proc WHERE oid = 'public.list_journals()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '58059ba9418512361e746a2100713457' FROM pg_proc WHERE oid = 'public.get_platform_stats()'::regprocedure;
-- 2) ACLs (expect list_journals without anon/PUBLIC; get_platform_stats with anon and authenticated):
--    SELECT oid::regprocedure, proacl FROM pg_proc
--     WHERE oid IN ('public.list_journals()'::regprocedure, 'public.get_platform_stats()'::regprocedure);
-- 3) Counters match a direct count (expect totalTrades = live_rows):
--    SELECT public.get_platform_stats();
--    SELECT count(*) FILTER (WHERE platform_source IS DISTINCT FROM 'backtest') AS live_rows,
--           count(*) FILTER (WHERE platform_source = 'backtest') AS backtest_rows FROM public.trades;
-- 4) list_journals as a given user, inside a transaction that is rolled back (read-only):
--    BEGIN;
--    SELECT set_config('request.jwt.claims', json_build_object('sub', '<your auth user id>', 'role', 'authenticated')::text, true);
--    SET LOCAL ROLE authenticated;
--    SELECT name, trade_count, total_pnl, win_rate, last_trade_date FROM public.list_journals();
--    ROLLBACK;
-- 5) App: the landing page counters and the journals page trade counts load without errors.
-- ============================================================
