-- ============================================================
-- WAWE JOURNAL - BACKTEST EXIT RULE
-- Migration: 202610290001_backtest_exit_rule.sql
-- Description:
--   backtest_account_trades.exit_rule records which rule decided an ambiguous exit, so a later pass on tick data can resolve
--   those trades again:
--     'pessimistic' : SL and TP were both reached inside one 1m bar (for an order filled in that bar: after the fill) -> SL
--     'bar_path'    : an order filled and closed inside one 1m bar with only one level reached; the bar path
--                     (open -> low -> high -> close, or open -> high -> low -> close) put the fill before the exit
--     NULL          : not ambiguous, or closed before this column existed (no backfill: closed trades are final, see
--                     check_backtest_trade, and the rule of an old same-bar order fill is not the current one)
--   CHECK: only an ambiguous exit (exit_ambiguous) has a rule. No trigger, policy or data change; the close UPDATE of an open
--   row may set it like the other exit columns.
--   The page (bt-engine.js) computes the rule from the same release; backtest.js sends the column only after EXIT_RULE_LIVE
--   is set to true, so the order is: run this migration, then deploy EXIT_RULE_LIVE = true.
-- Run order: after 202610260002. Rollback: supabase/rollbacks/202610290001_backtest_exit_rule.down.sql
-- Verification: supabase/tests/backtest_exit_rule_verify.sql
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_account_trades') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.backtest_account_trades is missing (202610180002 not applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'backtest_account_trades' AND column_name = 'exit_ambiguous') THEN
    RAISE EXCEPTION 'PRECONDITION: backtest_account_trades.exit_ambiguous is missing (optional block of 202610180002).';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'backtest_account_trades' AND column_name = 'exit_rule') THEN
    RAISE EXCEPTION 'ORDER: backtest_account_trades.exit_rule already exists (already applied).';
  END IF;
END $$;

-- 1. COLUMN (nullable, no default: no table rewrite) ---------------------------------------------------------
ALTER TABLE public.backtest_account_trades
  ADD COLUMN exit_rule text NULL;

ALTER TABLE public.backtest_account_trades
  ADD CONSTRAINT chk_backtest_account_trades_exit_rule
  CHECK (exit_rule IS NULL OR (exit_rule IN ('pessimistic', 'bar_path') AND exit_ambiguous));

COMMENT ON COLUMN public.backtest_account_trades.exit_rule IS
  'Rule that decided an ambiguous exit: pessimistic (SL and TP in one 1m bar -> SL) or bar_path (order filled and closed in one 1m bar, '
  'the bar path put the fill first). NULL: not ambiguous or closed before 202610290001. Kept to resolve these trades again on tick data.';

COMMIT;
