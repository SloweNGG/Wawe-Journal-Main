-- ============================================================
-- ROLLBACK of 202610290001_backtest_exit_rule.sql
-- Drops backtest_account_trades.exit_rule with its CHECK. The rules recorded so far are lost (exit_ambiguous stays).
-- Deploy a client with EXIT_RULE_LIVE = false (backtest.js) first: a close that still sends the column would fail.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'backtest_account_trades' AND column_name = 'exit_rule') THEN
    RAISE EXCEPTION 'ORDER: migration 202610290001 is not applied.';
  END IF;
END $$;

ALTER TABLE public.backtest_account_trades
  DROP CONSTRAINT chk_backtest_account_trades_exit_rule,
  DROP COLUMN exit_rule;

COMMIT;
