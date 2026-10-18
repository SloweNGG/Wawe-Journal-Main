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
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:list_journals.live}}', '{{MD5:list_journals.v05}}') THEN
    RAISE EXCEPTION 'DRIFT: public.list_journals() differs from the 2026-10-18 snapshot (normalised md5 %). Re-base this file on SELECT pg_get_functiondef(''public.list_journals()''::regprocedure); first.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_platform_stats()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:get_platform_stats.live}}', '{{MD5:get_platform_stats.v05}}') THEN
    RAISE EXCEPTION 'DRIFT: public.get_platform_stats() differs from the 2026-10-18 snapshot (normalised md5 %). Re-base this file on SELECT pg_get_functiondef(''public.get_platform_stats()''::regprocedure); first.', v_md5;
  END IF;
END $$;

-- 1. list_journals(): live-only statistics -------------------------------------------------------------
{{FN:list_journals.v05}}

REVOKE ALL ON FUNCTION public.list_journals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated;

-- 2. get_platform_stats(): landing-page counters without backtest rows -----------------------------------
{{FN:get_platform_stats.v05}}

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Body versions (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:list_journals.v05}}' FROM pg_proc WHERE oid = 'public.list_journals()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:get_platform_stats.v05}}' FROM pg_proc WHERE oid = 'public.get_platform_stats()'::regprocedure;
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
