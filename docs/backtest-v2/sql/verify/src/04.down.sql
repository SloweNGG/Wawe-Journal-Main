-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180004 (journal-link cleanup triggers)
-- Migration: 202610180004_backtest_journal_link_cleanup.down.sql
-- Rollback of: supabase/migrations/202610180004_backtest_journal_link_cleanup.sql
-- Description: drops the two cleanup triggers on public.backtest_accounts and their function.
-- Stage: 5 (rollback)
-- Run order: rollback, step 3 of 5 (reverse order: 06, 05, then this file, then 03, 02, 01)
-- Data loss: none. Consequence: from now on, relinking/unlinking or deleting a backtest account no
--   longer removes its journal mirrors (platform_source = 'backtest') from public.trades. Roll back the
--   Stage 5 client (bt-sync.js) together with this file, or the mirrors can go stale.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_backtest_accounts_cleanup_relink ON public.backtest_accounts;
    DROP TRIGGER IF EXISTS trg_backtest_accounts_cleanup_delete ON public.backtest_accounts;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.backtest_accounts_cleanup_trades();

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Function gone (expect NULL):
--    SELECT to_regprocedure('public.backtest_accounts_cleanup_trades()');
-- 2) Triggers gone (expect 0 rows):
--    SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_backtest_accounts_cleanup_%';
-- ============================================================
