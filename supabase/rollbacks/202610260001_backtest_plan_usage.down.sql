-- ============================================================
-- ROLLBACK of 202610260001_backtest_plan_usage.sql
-- Drops get_backtest_plan_usage(). No data is involved. Deploy the client first (the "Plan and usage" tab then shows
-- "Usage could not be loaded" instead of numbers).
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DROP FUNCTION public.get_backtest_plan_usage();

DO $$
BEGIN
  IF to_regprocedure('public.get_backtest_plan_usage()') IS NOT NULL THEN RAISE EXCEPTION 'CHECK: rollback incomplete'; END IF;
  RAISE NOTICE 'backtest_plan_usage rolled back';
END $$;

COMMIT;
