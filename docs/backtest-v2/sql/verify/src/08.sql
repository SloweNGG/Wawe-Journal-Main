-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / PHASE 1 (PRACTICE MODE): DATA SOURCE OF A BACKTEST ACCOUNT
-- Migration: 202610180008_backtest_data_source.sql
-- Description (FAZ-E-VERI.md section 2, rules 3 and 5):
--   Adds public.backtest_accounts.data_source text NOT NULL DEFAULT 'synthetic'.
--   - chk_backtest_accounts_data_source: for now ONLY 'synthetic' is accepted. The 'ctrader' value is opened
--     by a later migration (next round) that replaces this CHECK.
--   - chk_backtest_accounts_journal_needs_ctrader: journal_id IS NULL OR data_source = 'ctrader'. A synthetic
--     account can never be linked to a journal (its candles are not market data), enforced in the database,
--     not only in the UI. Until 'ctrader' is open this means: no account can be linked at all.
--   - trg_backtest_accounts_data_source_guard (BEFORE UPDATE): data_source never changes after creation.
--   Nothing else changes: RLS, quota (free 1, premium 10) and the other triggers are untouched.
-- PRECONDITION: no account may still be linked to a journal. Unlink first
--   (UPDATE public.backtest_accounts SET journal_id = NULL WHERE journal_id IS NOT NULL;): the 202610180004
--   trigger trg_backtest_accounts_cleanup_relink then removes the journal mirrors from public.trades.
-- Stage: Phase 1 (practice mode)
-- Run order: 8 (after 00, 01, 02, 04, 05)
-- Rollback: supabase/rollbacks/202610180008_backtest_data_source.down.sql
-- How to run: Supabase SQL Editor or psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction).
--   Writes to the LIVE schema: owner approval and a fresh backup first (KURALLAR.md sections 1 and 3).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_linked int;
BEGIN
  IF to_regclass('public.backtest_accounts') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610180002_backtest_accounts.sql first (public.backtest_accounts not found).';
  END IF;
  IF to_regprocedure('public.backtest_accounts_cleanup_trades()') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610180004_backtest_journal_link_cleanup.sql first (unlinking must clean the journal mirrors).';
  END IF;

  SELECT count(*) INTO v_linked FROM public.backtest_accounts WHERE journal_id IS NOT NULL;
  IF v_linked > 0 THEN
    RAISE EXCEPTION 'PRECONDITION: % backtest account(s) are still linked to a journal. Unlink them first (UPDATE public.backtest_accounts SET journal_id = NULL WHERE journal_id IS NOT NULL;), then run this file again.', v_linked;
  END IF;
END $$;

-- 1. Column + CHECKs ------------------------------------------------------------
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'synthetic';

ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_data_source;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_data_source
  CHECK (data_source = 'synthetic');

ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_journal_needs_ctrader;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_journal_needs_ctrader
  CHECK (journal_id IS NULL OR data_source = 'ctrader');

-- 2. data_source is immutable ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.backtest_accounts_data_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.data_source IS DISTINCT FROM OLD.data_source THEN
    RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:data_source';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backtest_accounts_data_source_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_backtest_accounts_data_source_guard ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_data_source_guard
  BEFORE UPDATE ON public.backtest_accounts
  FOR EACH ROW
  WHEN (OLD.data_source IS DISTINCT FROM NEW.data_source)
  EXECUTE FUNCTION public.backtest_accounts_data_source_guard();

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) Column (expect: text, NO, 'synthetic'::text):
--    SELECT data_type, is_nullable, column_default FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'data_source';
-- 2) Constraints and trigger (expect 2 + 1 rows):
--    SELECT conname FROM pg_constraint WHERE conrelid = 'public.backtest_accounts'::regclass AND conname IN
--      ('chk_backtest_accounts_data_source', 'chk_backtest_accounts_journal_needs_ctrader');
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.backtest_accounts'::regclass AND tgname = 'trg_backtest_accounts_data_source_guard';
-- 3) All accounts synthetic, none linked (expect n, n, 0):
--    SELECT count(*), count(*) FILTER (WHERE data_source = 'synthetic'), count(*) FILTER (WHERE journal_id IS NOT NULL)
--      FROM public.backtest_accounts;
-- ============================================================
