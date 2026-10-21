-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180008 (backtest account data source)
-- Migration: 202610180008_backtest_data_source.down.sql
-- Rollback of: supabase/migrations/202610180008_backtest_data_source.sql
-- Description: drops the immutability trigger and its function, the two CHECK constraints and the
--   data_source column of public.backtest_accounts.
-- Stage: Phase 1 (rollback)
-- Run order: rollback, FIRST (reverse order: this file, 07, 06, 05, 04, 03, 02, 01, 00). Roll the app side back first
--   (a client that sends or reads data_source must not run against the old table).
-- Data loss: the data_source value itself. It is 'synthetic' on every row while only that value is allowed;
--   the file stops if another value exists (a later migration opened 'ctrader').
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  v_other int;
BEGIN
  IF to_regclass('public.backtest_accounts') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'data_source') THEN
    EXECUTE 'SELECT count(*) FROM public.backtest_accounts WHERE data_source <> ''synthetic''' INTO v_other;
    IF v_other > 0 THEN
      RAISE EXCEPTION 'DATA LOSS: % backtest account(s) have a data_source other than synthetic; dropping the column would lose which source their candles came from.', v_other;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_backtest_accounts_data_source_guard ON public.backtest_accounts;
DROP FUNCTION IF EXISTS public.backtest_accounts_data_source_guard();
ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_journal_needs_ctrader;
ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_data_source;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS data_source;

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) Column gone (expect 0 rows):
--    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'data_source';
-- 2) Function and trigger gone (expect NULL, 0 rows):
--    SELECT to_regprocedure('public.backtest_accounts_data_source_guard()');
--    SELECT tgname FROM pg_trigger WHERE tgname = 'trg_backtest_accounts_data_source_guard';
-- ============================================================
