-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / PHASE 2: cTRADER DATA SOURCE FOR A BACKTEST ACCOUNT
-- Migration: 202610180009_backtest_ctrader_source.sql
-- Description (FAZ-E-VERI.md section 2):
--   1. Opens data_source = 'ctrader' (chk_backtest_accounts_data_source: 'synthetic' or 'ctrader').
--   2. Adds the source_* columns that describe WHERE the candles of a cTrader account come from:
--        source_ctid_account  bigint   broker account number (ctrader_accounts.ctid_trader_account_id)
--        source_broker_name   text     broker name at creation time (display only)
--        source_is_live       boolean  live or demo server
--        source_symbol_id     bigint   cTrader symbolId
--        source_symbol_name   text     broker symbol name as the broker spells it (XAUUSD, GOLD, EURUSD.r)
--        source_digits        int      price digits of the symbol
--      No foreign key: disconnect_ctrader() deletes the ctrader_accounts rows and a reconnect creates new
--      ids. The broker account number is kept, ownership is checked on every candle request by the
--      ctrader-candles Edge Function.
--   3. chk_backtest_accounts_source_fields: 'ctrader' needs ctid, symbol id and symbol name; 'synthetic' needs
--      every source_* column NULL.
--   4. The journal link rule of migration 08 stays as it is: chk_backtest_accounts_journal_needs_ctrader
--      (a synthetic account can never be linked to a journal).
--   5. data_source and every source_* column are immutable after creation (replaces the 08 guard).
--   6. A cTrader account can only be created by a user who has that broker account connected
--      (trg_backtest_accounts_ctrader_owner, BEFORE INSERT).
--   7. public.ctrader_tokens.refreshing_since: lease column for the shared, locked token refresh used by
--      ctrader-sync and ctrader-candles (two functions must never refresh the same refresh token at once:
--      the first refresh invalidates the old refresh token).
--   Nothing else changes: RLS, quota (free 1, premium 10) and the other triggers are untouched.
-- Stage: Phase 2 (cTrader data)
-- Run order: 9 (after 08)
-- Rollback: supabase/rollbacks/202610180009_backtest_ctrader_source.down.sql
-- How to run: Supabase SQL Editor or psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction).
--   Writes to the LIVE schema: backup first (KURALLAR.md sections 1 and 3).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_accounts') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610180002_backtest_accounts.sql first (public.backtest_accounts not found).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'data_source') THEN
    RAISE EXCEPTION 'ORDER: run 202610180008_backtest_data_source.sql first (backtest_accounts.data_source not found).';
  END IF;
  IF to_regclass('public.ctrader_accounts') IS NULL OR to_regclass('public.ctrader_tokens') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.ctrader_accounts / public.ctrader_tokens not found (202610120001_ctrader_integration.sql).';
  END IF;
END $$;

-- 1. Columns --------------------------------------------------------------------
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_ctid_account bigint;
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_broker_name  text;
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_is_live      boolean;
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_symbol_id    bigint;
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_symbol_name  text;
ALTER TABLE public.backtest_accounts ADD COLUMN IF NOT EXISTS source_digits       integer;

COMMENT ON COLUMN public.backtest_accounts.source_ctid_account IS
  'Broker account number (ctid_trader_account_id) the candles come from. No FK on purpose: ownership is checked per request by ctrader-candles.';

-- 2. CHECKs ---------------------------------------------------------------------
ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_data_source;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_data_source
  CHECK (data_source IN ('synthetic', 'ctrader'));

ALTER TABLE public.backtest_accounts DROP CONSTRAINT IF EXISTS chk_backtest_accounts_source_fields;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_source_fields
  CHECK (
    (data_source = 'synthetic'
      AND source_ctid_account IS NULL AND source_broker_name IS NULL AND source_is_live IS NULL
      AND source_symbol_id IS NULL AND source_symbol_name IS NULL AND source_digits IS NULL)
    OR
    (data_source = 'ctrader'
      AND source_ctid_account IS NOT NULL AND source_ctid_account > 0
      AND source_symbol_id IS NOT NULL AND source_symbol_id > 0
      AND source_symbol_name IS NOT NULL AND char_length(btrim(source_symbol_name)) BETWEEN 1 AND 40
      AND (source_broker_name IS NULL OR char_length(source_broker_name) <= 120)
      AND (source_digits IS NULL OR source_digits BETWEEN 0 AND 12))
  );

-- 3. Immutability: data_source and every source_* column (replaces the 08 guard) --------
CREATE OR REPLACE FUNCTION public.backtest_accounts_data_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.data_source IS DISTINCT FROM OLD.data_source THEN
    RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:data_source';
  END IF;
  IF (NEW.source_ctid_account, NEW.source_broker_name, NEW.source_is_live,
      NEW.source_symbol_id, NEW.source_symbol_name, NEW.source_digits)
     IS DISTINCT FROM
     (OLD.source_ctid_account, OLD.source_broker_name, OLD.source_is_live,
      OLD.source_symbol_id, OLD.source_symbol_name, OLD.source_digits) THEN
    RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:source';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backtest_accounts_data_source_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_backtest_accounts_data_source_guard ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_data_source_guard
  BEFORE UPDATE ON public.backtest_accounts
  FOR EACH ROW
  WHEN ((OLD.data_source, OLD.source_ctid_account, OLD.source_broker_name, OLD.source_is_live,
         OLD.source_symbol_id, OLD.source_symbol_name, OLD.source_digits)
        IS DISTINCT FROM
        (NEW.data_source, NEW.source_ctid_account, NEW.source_broker_name, NEW.source_is_live,
         NEW.source_symbol_id, NEW.source_symbol_name, NEW.source_digits))
  EXECUTE FUNCTION public.backtest_accounts_data_source_guard();

-- 4. A cTrader account needs that broker account connected by the same user -------------
-- SECURITY DEFINER: ctrader_accounts has RLS enabled without policies, a member cannot read it.
CREATE OR REPLACE FUNCTION public.backtest_accounts_ctrader_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.data_source = 'ctrader' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.ctrader_accounts c
       WHERE c.user_id = NEW.user_id
         AND c.ctid_trader_account_id = NEW.source_ctid_account
    ) THEN
      RAISE EXCEPTION 'CTRADER_ACCOUNT_NOT_LINKED';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backtest_accounts_ctrader_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_backtest_accounts_ctrader_owner ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_ctrader_owner
  BEFORE INSERT ON public.backtest_accounts
  FOR EACH ROW
  WHEN (NEW.data_source = 'ctrader')
  EXECUTE FUNCTION public.backtest_accounts_ctrader_owner();

-- 5. Token refresh lease (shared by ctrader-sync and ctrader-candles) ---------------------
ALTER TABLE public.ctrader_tokens ADD COLUMN IF NOT EXISTS refreshing_since timestamptz;

COMMENT ON COLUMN public.ctrader_tokens.refreshing_since IS
  'Lease for the token refresh: set atomically by the Edge Function that refreshes, cleared afterwards, ignored after 60 s.';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) Columns (expect 6 rows + 1 row):
--    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name LIKE 'source\_%';
--    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ctrader_tokens' AND column_name = 'refreshing_since';
-- 2) Constraints and triggers (expect 3 + 2 rows):
--    SELECT conname FROM pg_constraint WHERE conrelid = 'public.backtest_accounts'::regclass AND conname IN
--      ('chk_backtest_accounts_data_source', 'chk_backtest_accounts_source_fields', 'chk_backtest_accounts_journal_needs_ctrader');
--    SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.backtest_accounts'::regclass AND tgname IN
--      ('trg_backtest_accounts_data_source_guard', 'trg_backtest_accounts_ctrader_owner');
-- 3) Existing accounts untouched (expect n, n, 0):
--    SELECT count(*), count(*) FILTER (WHERE data_source = 'synthetic'), count(*) FILTER (WHERE journal_id IS NOT NULL)
--      FROM public.backtest_accounts;
-- ============================================================
