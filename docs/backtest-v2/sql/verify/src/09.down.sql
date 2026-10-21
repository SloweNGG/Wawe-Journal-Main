-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180009 (cTrader data source of a backtest account)
-- Migration: 202610180009_backtest_ctrader_source.down.sql
-- Rollback of: supabase/migrations/202610180009_backtest_ctrader_source.sql
-- Description: restores the state after migration 08: data_source CHECK = 'synthetic' only, the 08 version of
--   the immutability guard, no source_* columns, no owner trigger, no ctrader_tokens.refreshing_since.
-- Run order: rollback, FIRST (reverse order: this file, then 08.down ...). Roll the app side back first
--   (the ctrader-candles Edge Function and ctrader-sync's shared refresh read refreshing_since: redeploy the
--   previous ctrader-sync before dropping the column, otherwise its refresh writes fail).
-- Data loss: the source_* values of cTrader accounts. The file stops while any 'ctrader' account exists:
--   export or delete those accounts first (they cannot exist in the 08 schema).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  v_ctrader int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'source_ctid_account') THEN
    EXECUTE 'SELECT count(*) FROM public.backtest_accounts WHERE data_source <> ''synthetic''' INTO v_ctrader;
    IF v_ctrader > 0 THEN
      RAISE EXCEPTION 'DATA LOSS: % cTrader backtest account(s) exist; the 08 schema cannot hold them. Export or delete them first.', v_ctrader;
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_backtest_accounts_ctrader_owner ON public.backtest_accounts;
DROP FUNCTION IF EXISTS public.backtest_accounts_ctrader_owner();

DROP TRIGGER IF EXISTS trg_backtest_accounts_data_source_guard ON public.backtest_accounts;

ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_source_fields;
ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_data_source;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_data_source
  CHECK (data_source = 'synthetic');

ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_ctid_account;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_broker_name;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_is_live;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_symbol_id;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_symbol_name;
ALTER TABLE public.backtest_accounts DROP COLUMN IF EXISTS source_digits;

-- the 08 guard (data_source only)
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

CREATE TRIGGER trg_backtest_accounts_data_source_guard
  BEFORE UPDATE ON public.backtest_accounts
  FOR EACH ROW
  WHEN (OLD.data_source IS DISTINCT FROM NEW.data_source)
  EXECUTE FUNCTION public.backtest_accounts_data_source_guard();

ALTER TABLE public.ctrader_tokens DROP COLUMN IF EXISTS refreshing_since;

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) source_* columns and refreshing_since gone (expect 0 rows):
--    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public'
--      AND ((table_name = 'backtest_accounts' AND column_name LIKE 'source\_%') OR (table_name = 'ctrader_tokens' AND column_name = 'refreshing_since'));
-- 2) CHECK is 08's again: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_backtest_accounts_data_source';
-- ============================================================
