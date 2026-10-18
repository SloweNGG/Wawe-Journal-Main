-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180005 (backtest-free SQL statistics)
-- Migration: 202610180005_exclude_backtest_from_stats.down.sql
-- Rollback of: supabase/migrations/202610180005_exclude_backtest_from_stats.sql
-- Description: restores the LIVE bodies of 2026-10-18 of list_journals() and get_platform_stats()
--   (CRLF normalised to LF, otherwise identical; same signatures and attributes).
-- Stage: 6 (rollback)
-- Run order: rollback, step 2 of 5 (reverse order: 06, then this file, then 04, 03, 02, 01)
-- Data loss: none. Consequence: backtest mirrors (platform_source = 'backtest') count as real trades
--   again in the journal cards / navbar counts and on the landing-page counters. If mirrors exist and
--   the backtest feature is being withdrawn, remove them first (owner decision, writes data):
--     DELETE FROM public.trades WHERE platform_source = 'backtest' AND left(import_hash, 9) = 'backtest:';
-- ACL note: list_journals() had EXECUTE for anon live (Supabase default privileges). This rollback keeps
--   anon revoked (the function rejects calls without auth.uid() anyway). For the exact pre-05 ACL,
--   uncomment the line marked [EXACT-ACL] or use the output of pre-flight query P1.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.list_journals()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:list_journals.v05}}', '{{MD5:list_journals.live}}') THEN
    RAISE EXCEPTION 'DRIFT: public.list_journals() is neither the 202610180005 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_platform_stats()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:get_platform_stats.v05}}', '{{MD5:get_platform_stats.live}}') THEN
    RAISE EXCEPTION 'DRIFT: public.get_platform_stats() is neither the 202610180005 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;
END $$;

-- 1. list_journals(): live body ------------------------------------------------------------------------
{{FN:list_journals.live}}

REVOKE ALL ON FUNCTION public.list_journals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated;
-- [EXACT-ACL] GRANT EXECUTE ON FUNCTION public.list_journals() TO anon;

-- 2. get_platform_stats(): live body ------------------------------------------------------------------
{{FN:get_platform_stats.live}}

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Live bodies again (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:list_journals.live}}' FROM pg_proc WHERE oid = 'public.list_journals()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:get_platform_stats.live}}' FROM pg_proc WHERE oid = 'public.get_platform_stats()'::regprocedure;
-- 2) The landing page still shows its counters (anon) and the journals page loads.
-- ============================================================
