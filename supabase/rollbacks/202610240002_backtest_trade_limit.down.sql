-- ============================================================
-- ROLLBACK of 202610240002_backtest_trade_limit.sql
-- Drops the trigger, the usage counter table, the three functions and the 'backtest_limits' setting.
-- DATA LOSS GUARD: refuses while the counter has rows of the current month (the month's usage would restart at 0);
-- to accept that run  SET wawe.allow_usage_loss = 'on';  in the same session first.
-- Deploy the client without the indicator first (the page treats a missing RPC as "no limit shown").
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE v_n bigint;
BEGIN
  IF to_regclass('public.backtest_trade_usage') IS NULL THEN
    RAISE EXCEPTION 'ORDER: public.backtest_trade_usage not found (migration 202610240002 is not applied).';
  END IF;
  SELECT count(*) INTO v_n FROM public.backtest_trade_usage WHERE month = date_trunc('month', now() AT TIME ZONE 'UTC')::date AND trades > 0;
  IF v_n > 0 AND coalesce(current_setting('wawe.allow_usage_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATA LOSS: % user(s) have usage this month; SET wawe.allow_usage_loss = ''on'' to drop it anyway.', v_n;
  END IF;
END $$;

DROP TRIGGER trg_check_backtest_trade_quota ON public.backtest_account_trades;
DROP FUNCTION public.check_backtest_trade_quota();
DROP FUNCTION public.get_backtest_trade_usage();
DROP FUNCTION public.backtest_trade_limit();
DROP TABLE public.backtest_trade_usage;
DELETE FROM public.system_settings WHERE key = 'backtest_limits';

DO $$
BEGIN
  IF to_regclass('public.backtest_trade_usage') IS NOT NULL OR to_regprocedure('public.check_backtest_trade_quota()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_backtest_trade_quota') THEN
    RAISE EXCEPTION 'CHECK: rollback incomplete';
  END IF;
  RAISE NOTICE 'backtest_trade_limit rolled back';
END $$;

COMMIT;
