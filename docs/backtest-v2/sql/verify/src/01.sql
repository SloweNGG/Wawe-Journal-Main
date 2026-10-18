-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 2: DROP THE LEGACY backtest_trades TABLE
-- Migration: 202610180001_drop_legacy_backtest_trades.sql
-- Description:
--   0. Preconditions (nothing is changed if one fails):
--      - public.backtest_trades must be EMPTY. It is counted under an ACCESS EXCLUSIVE lock, so no
--        insert can slip in between the count and the DROP (audit 2026-10-18: 0 rows, 0 users).
--      - public.reset_user_data() must still be the live body of the 2026-10-18 snapshot (drift guard).
--   1. reset_user_data(): rebuilt from the LIVE body (identical to
--      202610150003_ctrader_cursor_reset.sql:44-97). Only change: the guarded backtest_trades DELETE
--      (live lines 18-20) is removed and the step-1 comment is adjusted. Steps 2-6 are unchanged,
--      including step 6 (cTrader cursor reset). Attributes kept: SECURITY DEFINER,
--      SET search_path TO 'public', VOLATILE. ACL re-asserted: EXECUTE for authenticated only.
--   2. DROP TABLE public.backtest_trades (RESTRICT): an unexpected dependent aborts the transaction.
--      Its 4 policies, 4 indexes, PK, FK, grants and row types go with it. PostgREST reloads its
--      schema cache (pgrst_drop_watch event trigger; the NOTIFY below is a harmless extra).
-- Stage: 2 (removal of the old backtest)
-- Run order: 1
-- Rollback: supabase/rollbacks/202610180001_drop_legacy_backtest_trades.down.sql
-- Prerequisites:
--   * A FULL database backup taken IMMEDIATELY before this file (R48 / D11) and its location
--     reported to the owner. This is the first write of Backtest v2 to the live database.
--   * The Phase A client is deployed: src/pages/backtest.astro no longer inserts into backtest_trades.
--     (The settings.js fallback at public/settings/js/settings.js:2359-2363 still calls
--     sb.from('backtest_trades').delete(); supabase-js returns { error } instead of throwing and the result is
--     discarded, so it is harmless after the DROP until Phase B step 4 updates it.)
-- How to run: Supabase Dashboard -> SQL Editor, paste the WHOLE file, Run. It is one transaction.
--   Do not use `supabase db push` (supabase_migrations.schema_migrations is empty on the live project,
--   so every file would be treated as pending).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------

-- 0a. Drift guard: reset_user_data must be the 2026-10-18 live body (or this file's version on a re-run).
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.reset_user_data()');

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.reset_user_data() does not exist.';
  ELSIF v_md5 = '{{MD5:reset_user_data.v02}}' THEN
    RAISE EXCEPTION 'ALREADY SUPERSEDED: migration 202610180002 is applied (reset_user_data is its version). Do not re-run 202610180001; it would remove the Backtest v2 steps from reset_user_data.';
  ELSIF v_md5 NOT IN ('{{MD5:reset_user_data.live}}', '{{MD5:reset_user_data.v01}}') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() differs from the 2026-10-18 snapshot this file was built from (normalised md5 %). Re-base the file on SELECT pg_get_functiondef(''public.reset_user_data()''::regprocedure); before running it.', v_md5;
  END IF;
END $$;

-- 0b. The legacy table must be empty (checked under the lock that the DROP needs anyway).
DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    LOCK TABLE public.backtest_trades IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO v_rows FROM public.backtest_trades;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'ABORT: public.backtest_trades has % row(s). Export or migrate them first; nothing was changed.', v_rows;
    END IF;
  END IF;
END $$;

-- 1. reset_user_data(): LIVE body without the legacy backtest_trades block ----------------------
{{FN:reset_user_data.v01}}

REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

-- 2. Drop the legacy table ------------------------------------------------------------------------
DROP TABLE IF EXISTS public.backtest_trades;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only; run them one by one after the COMMIT)
-- ------------------------------------------------------------
-- 1) The table is gone (expect NULL):
--    SELECT to_regclass('public.backtest_trades');
--
-- 2) No function body still mentions it (expect 0 rows):
--    SELECT p.oid::regprocedure
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
--       AND p.prosrc ILIKE '%backtest_trades%';
--
-- 3) reset_user_data is this file's version (expect true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:reset_user_data.v01}}'
--      FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--
-- 4) Attributes and ACL (expect prosecdef = true, provolatile = 'v', proconfig = {search_path=public},
--    proacl with postgres, authenticated, service_role and WITHOUT anon or a bare "=X" PUBLIC entry):
--    SELECT prosecdef, provolatile, proconfig, proacl
--      FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--
-- 5) App smoke test (owner): Settings -> "delete all data" still succeeds (RPC reset_user_data).
-- ============================================================
