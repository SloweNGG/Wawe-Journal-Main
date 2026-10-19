-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 3A: BACKTEST ACCOUNTS AND TRADES
-- Migration: 202610180002_backtest_accounts.sql
-- Description:
--   0. Preconditions: 202610180001 applied, required objects present, drift guard on the two replaced
--      functions, and the migration role bypasses RLS (the SECURITY DEFINER triggers below need it).
--   1. touch_updated_at(): created ONLY if missing (it exists live; it is never replaced or dropped).
--   2. public.backtest_accounts (R10) and public.backtest_account_trades (R11): columns per D3, named
--      CHECK constraints incl. NaN/Infinity guards and the open/closed consistency CHECK.
--      Two OPTIONAL columns on the trades table (owner decision D10): gross_pnl, exit_ambiguous.
--   3. Indexes.
--   4. RLS: 4 policies per table TO authenticated (<table>_select/insert/update/delete_own):
--      USING (user_id = auth.uid() OR public.is_admin()), WITH CHECK (user_id = auth.uid()) (D3).
--   5. Triggers:
--      - trg_backtest_accounts_updated_at   BEFORE UPDATE  -> touch_updated_at()
--      - trg_check_backtest_account_limit   BEFORE INSERT OR UPDATE -> check_backtest_account_limit():
--          journal ownership (same user, active) when journal_id is set or changed; quota on INSERT or
--          inactive -> active (free 1, active premium 10); id, user_id and symbol immutable;
--          spread_pips / commission_per_lot frozen while a position is open; replay_time never moves
--          backwards once the account has trades (D13). Modelled on the live check_prop_account_limit().
--      - trg_check_backtest_trade           BEFORE INSERT OR UPDATE on backtest_account_trades ->
--          check_backtest_trade(): the account belongs to the same user, symbol = account symbol,
--          initial_stop_loss / initial_take_profit copied from the levels at open (D13),
--          identity/entry/initial columns immutable, closed trades final.
--      Both refuse up front, for API callers (JWT role anon/authenticated, admins excepted), a row whose
--      user_id is not the caller's auth.uid(): BEFORE ROW triggers run before the RLS WITH CHECK and would
--      otherwise reveal another user's plan, account count or journal ownership in their error messages.
--   6. reset_user_data(): 202610180001 version + deletes of the two new tables before the journals step.
--   7. delete_journal(uuid): LIVE body (CRLF normalised to LF) + detach linked backtest accounts in both
--      branches.
--   8. ACLs: new trigger functions not executable through the API; reset_user_data / delete_journal
--      EXECUTE for authenticated only (anon and PUBLIC revoked; delete_journal had anon EXECUTE live).
-- Error codes raised by the triggers (the client maps them by substring, like journal.js does):
--   INVALID_JOURNAL, BACKTEST_LIMIT_EXCEEDED:<max>, BACKTEST_ACCOUNT_IMMUTABLE:<column>,
--   BACKTEST_OPEN_POSITIONS:<column>, BACKTEST_REPLAY_BACKWARD, INVALID_BACKTEST_ACCOUNT,
--   BACKTEST_SYMBOL_MISMATCH, BACKTEST_TRADE_IMMUTABLE, BACKTEST_TRADE_CLOSED (SQLSTATE P0001), and BACKTEST_NOT_OWNER (SQLSTATE 42501, a row for another user; RLS would reject
--   it too). Constraint violations surface as SQLSTATE 23514 with the chk_* constraint name.
-- Stage: 3A (database)
-- Run order: 2
-- Rollback: supabase/rollbacks/202610180002_backtest_accounts.down.sql
-- Prerequisites: 202610180001 applied. Run BEFORE deploying any client code that reads or writes the
--   new tables (Stage 3A settings.js fallback, Stage 4 /backtest page).
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
  v_bad text;
BEGIN
  -- 0a. Run order
  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610180001_drop_legacy_backtest_trades.sql first (public.backtest_trades still exists).';
  END IF;

  -- 0b. Objects this file relies on
  IF to_regclass('auth.users') IS NULL OR to_regclass('public.journals') IS NULL
     OR to_regclass('public.user_profiles') IS NULL OR to_regclass('public.trades') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: auth.users, public.journals, public.user_profiles, public.trades, auth.uid() and public.is_admin() must exist.';
  END IF;

  -- 0c. Drift guards on the two functions this file replaces
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.reset_user_data()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('5d0a2a09a51ff4e1479588a7e08c1fea', '053931abe8d9ac918922d85db0ff6aac') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() is not the 202610180001 version (normalised md5 %). Re-base this file before running it.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.delete_journal(uuid)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('84e56367a98105b0c0aadb7467c51285', 'afdbbce70341eeeaadb7c2a75f134d2d') THEN
    RAISE EXCEPTION 'DRIFT: public.delete_journal(uuid) differs from the 2026-10-18 snapshot (normalised md5 %). Re-base this file on SELECT pg_get_functiondef(''public.delete_journal(uuid)''::regprocedure); first.', v_md5;
  END IF;

  -- 0d. The SECURITY DEFINER trigger functions created below run as the current role. They read
  --     journals / user_profiles / backtest_accounts and must see every row, so that role must bypass
  --     RLS (superuser, BYPASSRLS, or owner of a table that does not FORCE RLS). postgres in the
  --     Supabase SQL Editor qualifies.
  SELECT string_agg(c.oid::regclass::text, ', ') INTO v_bad
    FROM pg_class c
   WHERE c.oid IN ('public.journals'::regclass, 'public.user_profiles'::regclass, 'public.trades'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
     AND NOT (pg_get_userbyid(c.relowner) = current_user AND NOT c.relforcerowsecurity);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS on %. Run this file as postgres in the Supabase SQL Editor.', current_user, v_bad;
  END IF;
END $$;

-- 1. touch_updated_at(): only if missing (live has it; never replaced, never dropped by a rollback) ------
DO $do$
BEGIN
  IF to_regprocedure('public.touch_updated_at()') IS NULL THEN
    -- Same definition as live (scratchpad db/fn_touch_updated_at.sql).
    EXECUTE $fn$CREATE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$$fn$;
  END IF;
END $do$;

-- 2. TABLES -------------------------------------------------------------------------------------------
-- NaN / Infinity guards: Postgres numeric accepts 'NaN' (also in numeric(p,s)) and sorts it ABOVE every
-- number, so "x > 0" alone lets NaN through. Unconstrained numeric (the price columns) also accepts
-- '+/-Infinity'; "x < 'Infinity'" rejects both NaN and +Infinity there. timestamptz accepts 'infinity',
-- hence isfinite().

CREATE TABLE IF NOT EXISTS public.backtest_accounts (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id         uuid          NULL REFERENCES public.journals(id) ON DELETE SET NULL,
  name               text          NOT NULL,
  symbol             text          NOT NULL,
  timeframe          text          NOT NULL DEFAULT '1h',
  starting_balance   numeric(14,2) NOT NULL,
  spread_pips        numeric(10,2) NOT NULL DEFAULT 0,
  commission_per_lot numeric(10,2) NOT NULL DEFAULT 0,
  replay_time        timestamptz   NOT NULL,
  is_active          boolean       NOT NULL DEFAULT true,
  created_at         timestamptz   NOT NULL DEFAULT now(),
  updated_at         timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_backtest_accounts_name
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT chk_backtest_accounts_symbol
    CHECK (symbol ~ '^[A-Z0-9]{3,12}$'),
  CONSTRAINT chk_backtest_accounts_timeframe
    CHECK (timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '1d')),
  CONSTRAINT chk_backtest_accounts_starting_balance
    CHECK (starting_balance <> 'NaN'::numeric AND starting_balance > 0 AND starting_balance <= 100000000),
  CONSTRAINT chk_backtest_accounts_spread_pips
    CHECK (spread_pips <> 'NaN'::numeric AND spread_pips >= 0 AND spread_pips <= 10000),
  CONSTRAINT chk_backtest_accounts_commission_per_lot
    CHECK (commission_per_lot <> 'NaN'::numeric AND commission_per_lot >= 0 AND commission_per_lot <= 10000),
  CONSTRAINT chk_backtest_accounts_replay_time
    CHECK (isfinite(replay_time))
);

COMMENT ON TABLE public.backtest_accounts IS
  'Backtest v2 accounts (R10). One symbol per account; the replay resumes at replay_time. Optional link to a journal (journal_id): the closed trades are mirrored into public.trades with platform_source = ''backtest'' and import_hash = ''backtest:<account id>:<trade id>''.';
COMMENT ON COLUMN public.backtest_accounts.symbol IS
  'Archive symbol (EURUSD, XAUUSD, BTCUSDT, ...). The symbol list and its pip/contract/price-precision settings live in public/interface/backtest/js/bt-symbols.js. Immutable.';
COMMENT ON COLUMN public.backtest_accounts.spread_pips IS
  'Spread in pips added to the BID archive prices (ask = bid + spread).';
COMMENT ON COLUMN public.backtest_accounts.commission_per_lot IS
  'Commission in USD per 1.0 lot, round-turn, booked when the trade closes.';
COMMENT ON COLUMN public.backtest_accounts.replay_time IS
  'Replay cursor (UTC): open time of the last revealed 1m bar + 60 s.';
COMMENT ON COLUMN public.backtest_accounts.is_active IS
  'Counts towards the account quota (free 1, premium 10) while true.';

CREATE TABLE IF NOT EXISTS public.backtest_account_trades (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backtest_account_id uuid          NOT NULL REFERENCES public.backtest_accounts(id) ON DELETE CASCADE,
  symbol              text          NOT NULL,
  direction           text          NOT NULL,
  lot                 numeric(12,2) NOT NULL,
  entry_price         numeric       NOT NULL,
  exit_price          numeric       NULL,
  stop_loss           numeric       NULL,
  take_profit         numeric       NULL,
  initial_stop_loss   numeric       NULL,
  initial_take_profit numeric       NULL,
  entry_time         timestamptz   NOT NULL,
  exit_time           timestamptz   NULL,
  pnl                 numeric(14,2) NULL,
  commission          numeric(14,2) NOT NULL DEFAULT 0,
  rr_ratio            numeric(10,2) NULL,
  exit_reason         text          NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_backtest_account_trades_direction
    CHECK (direction IN ('LONG', 'SHORT')),
  CONSTRAINT chk_backtest_account_trades_lot
    CHECK (lot <> 'NaN'::numeric AND lot > 0),
  CONSTRAINT chk_backtest_account_trades_prices
    CHECK (entry_price > 0 AND entry_price < 'Infinity'::numeric
           AND (exit_price  IS NULL OR (exit_price  > 0 AND exit_price  < 'Infinity'::numeric))
           AND (stop_loss   IS NULL OR (stop_loss   > 0 AND stop_loss   < 'Infinity'::numeric))
           AND (take_profit IS NULL OR (take_profit > 0 AND take_profit < 'Infinity'::numeric))
           AND (initial_stop_loss   IS NULL OR (initial_stop_loss   > 0 AND initial_stop_loss   < 'Infinity'::numeric))
           AND (initial_take_profit IS NULL OR (initial_take_profit > 0 AND initial_take_profit < 'Infinity'::numeric))),
  CONSTRAINT chk_backtest_account_trades_times
    CHECK (isfinite(entry_time) AND (exit_time IS NULL OR isfinite(exit_time))),
  CONSTRAINT chk_backtest_account_trades_pnl
    CHECK (pnl IS NULL OR pnl <> 'NaN'::numeric),
  CONSTRAINT chk_backtest_account_trades_commission
    CHECK (commission <> 'NaN'::numeric AND commission >= 0),
  CONSTRAINT chk_backtest_account_trades_rr_ratio
    CHECK (rr_ratio IS NULL OR (rr_ratio <> 'NaN'::numeric AND rr_ratio >= 0)),
  CONSTRAINT chk_backtest_account_trades_exit_reason
    CHECK (exit_reason IN ('tp', 'sl', 'manual')),
  -- Open position: all four exit columns NULL. Closed trade: all four NOT NULL.
  CONSTRAINT chk_backtest_account_trades_open_closed
    CHECK ((exit_time IS NULL AND exit_price IS NULL AND exit_reason IS NULL AND pnl IS NULL)
        OR (exit_time IS NOT NULL AND exit_price IS NOT NULL AND exit_reason IS NOT NULL AND pnl IS NOT NULL)),
  CONSTRAINT chk_backtest_account_trades_exit_after_entry
    CHECK (exit_time IS NULL OR exit_time >= entry_time)
);

COMMENT ON TABLE public.backtest_account_trades IS
  'Backtest v2 trades (R11). Open positions have exit_time/exit_price/exit_reason/pnl NULL (a reload resumes them); closed rows are final.';
COMMENT ON COLUMN public.backtest_account_trades.entry_time IS 'Replay market time (UTC) of the fill.';
COMMENT ON COLUMN public.backtest_account_trades.exit_time IS 'Replay market time (UTC) of the close; NULL while open.';
COMMENT ON COLUMN public.backtest_account_trades.pnl IS 'Net realised P&L in USD (gross minus commission); NULL while open.';
COMMENT ON COLUMN public.backtest_account_trades.commission IS 'Round-turn commission in USD, stored positive, booked at close.';
COMMENT ON COLUMN public.backtest_account_trades.stop_loss IS 'Current SL (editable while open).';
COMMENT ON COLUMN public.backtest_account_trades.take_profit IS 'Current TP (editable while open).';
COMMENT ON COLUMN public.backtest_account_trades.initial_stop_loss IS
  'SL at open, copied from stop_loss by trg_check_backtest_trade; immutable. Sent to the journal as trades.stop_loss.';
COMMENT ON COLUMN public.backtest_account_trades.initial_take_profit IS
  'TP at open, copied from take_profit by trg_check_backtest_trade; immutable. Sent to the journal as trades.take_profit.';
COMMENT ON COLUMN public.backtest_account_trades.rr_ratio IS
  'ROUND(|tp - entry| / |entry - sl|, 2) on the fill entry and the initial SL/TP; NULL if either is missing or the risk is 0 (the same expression as calc_trade_pnl on public.trades).';

-- 2b. >>> OPTIONAL BLOCK (owner decision D10, recommended): gross_pnl + exit_ambiguous >>>>>>>>>>>>>>>>>>>>
--   gross_pnl      : makes "net = gross - commission" checkable in the database.
--   exit_ambiguous : flags a trade whose TP and SL were both inside the same 1m bar (same-bar rule, D4).
--   To DECLINE: either delete everything from ">>> OPTIONAL BLOCK" to "<<< END OPTIONAL BLOCK" before the
--   first run, or uncomment the ONE line right after the block end (it can also be run on its own later).
ALTER TABLE public.backtest_account_trades
  ADD COLUMN IF NOT EXISTS gross_pnl      numeric(14,2) NULL,
  ADD COLUMN IF NOT EXISTS exit_ambiguous boolean       NOT NULL DEFAULT false;

DO $$
BEGIN
  -- open: NULL; closed: required, and net = gross - commission (all values in cents)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.backtest_account_trades'::regclass
                    AND conname = 'chk_backtest_account_trades_gross_pnl') THEN
    ALTER TABLE public.backtest_account_trades
      ADD CONSTRAINT chk_backtest_account_trades_gross_pnl
      CHECK ((gross_pnl IS NULL AND pnl IS NULL)
          OR (gross_pnl IS NOT NULL AND pnl IS NOT NULL AND gross_pnl <> 'NaN'::numeric
              AND pnl = gross_pnl - commission));
  END IF;

  -- only a closed trade that ended on TP or SL can be ambiguous
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.backtest_account_trades'::regclass
                    AND conname = 'chk_backtest_account_trades_exit_ambiguous') THEN
    ALTER TABLE public.backtest_account_trades
      ADD CONSTRAINT chk_backtest_account_trades_exit_ambiguous
      CHECK (NOT exit_ambiguous OR (exit_reason IS NOT NULL AND exit_reason IN ('tp', 'sl')));
  END IF;
END $$;

COMMENT ON COLUMN public.backtest_account_trades.gross_pnl IS
  'OPTIONAL: gross P&L in USD at the fill prices; pnl = gross_pnl - commission.';
COMMENT ON COLUMN public.backtest_account_trades.exit_ambiguous IS
  'OPTIONAL: TP and SL were both inside the same 1m bar; resolved by the same-bar rule (D4).';
-- <<< END OPTIONAL BLOCK <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- DECLINE switch for the OPTIONAL columns (drops both columns with their CHECK constraints and comments):
-- ALTER TABLE public.backtest_account_trades DROP COLUMN IF EXISTS gross_pnl, DROP COLUMN IF EXISTS exit_ambiguous;

-- 3. INDEXES ------------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_backtest_accounts_user_active
  ON public.backtest_accounts (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_backtest_accounts_journal_id
  ON public.backtest_accounts (journal_id)
  WHERE journal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_backtest_account_trades_account_entry
  ON public.backtest_account_trades (backtest_account_id, entry_time);

CREATE INDEX IF NOT EXISTS idx_backtest_account_trades_user_id
  ON public.backtest_account_trades (user_id);

-- 4. RLS ----------------------------------------------------------------------------------------------
-- No table GRANTs: Supabase default privileges + RLS, like every other app table. The policies are
-- TO authenticated only, so anon sees and writes nothing. Admins (is_admin()) can read and delete any
-- row but, per D3, not insert or modify other users' rows (WITH CHECK user_id = auth.uid()).
ALTER TABLE public.backtest_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_account_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backtest_accounts_select_own" ON public.backtest_accounts;
DROP POLICY IF EXISTS "backtest_accounts_insert_own" ON public.backtest_accounts;
DROP POLICY IF EXISTS "backtest_accounts_update_own" ON public.backtest_accounts;
DROP POLICY IF EXISTS "backtest_accounts_delete_own" ON public.backtest_accounts;

CREATE POLICY "backtest_accounts_select_own" ON public.backtest_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "backtest_accounts_insert_own" ON public.backtest_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_accounts_update_own" ON public.backtest_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_accounts_delete_own" ON public.backtest_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "backtest_account_trades_select_own" ON public.backtest_account_trades;
DROP POLICY IF EXISTS "backtest_account_trades_insert_own" ON public.backtest_account_trades;
DROP POLICY IF EXISTS "backtest_account_trades_update_own" ON public.backtest_account_trades;
DROP POLICY IF EXISTS "backtest_account_trades_delete_own" ON public.backtest_account_trades;

CREATE POLICY "backtest_account_trades_select_own" ON public.backtest_account_trades
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- The account must belong to the same user: enforced by trg_check_backtest_trade (section 5).
CREATE POLICY "backtest_account_trades_insert_own" ON public.backtest_account_trades
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_account_trades_update_own" ON public.backtest_account_trades
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_account_trades_delete_own" ON public.backtest_account_trades
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- 5. TRIGGERS -----------------------------------------------------------------------------------------

-- 5a. Ownership + quota + immutables for backtest_accounts (modelled on check_prop_account_limit)
CREATE OR REPLACE FUNCTION public.check_backtest_account_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan          text;
  v_expires       timestamptz;
  v_is_premium    boolean;
  v_max_accounts  int;
  v_current_count int;
BEGIN
  -- 0) BEFORE ROW triggers run BEFORE the RLS WITH CHECK. Without this guard an API caller (JWT role
  --    anon or authenticated; for anon auth.uid() is NULL) could send a row with someone else's user_id
  --    and read that user's plan/account count (quota error) or journal ownership (INVALID_JOURNAL)
  --    from this SECURITY DEFINER function before RLS rejects the row. Callers without an API JWT
  --    (postgres in the SQL Editor, supabase_auth_admin cascades) and service_role skip it.
  --    Admins skip it too: they can read every row anyway (no leak), RLS WITH CHECK still stops their
  --    direct writes for other users (D3), and their cascades (e.g. an admin deleting a user's journal ->
  --    ON DELETE SET NULL here) must not fail.
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'BACKTEST_NOT_OWNER' USING ERRCODE = '42501';
  END IF;

  -- A) Immutable columns. user_id: an account never changes owner. id: the journal mirrors are keyed
  --    'backtest:<account id>:<trade id>'. symbol: every backtest_account_trades row must carry the
  --    account symbol (trg_check_backtest_trade).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:user_id';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:id';
    END IF;
    IF NEW.symbol IS DISTINCT FROM OLD.symbol THEN
      RAISE EXCEPTION 'BACKTEST_ACCOUNT_IMMUTABLE:symbol';
    END IF;

    -- D) Spread and commission are frozen while a position is open (D13): its fill and its floating
    --    P&L were priced with the old values.
    IF (NEW.spread_pips IS DISTINCT FROM OLD.spread_pips
        OR NEW.commission_per_lot IS DISTINCT FROM OLD.commission_per_lot)
       AND EXISTS (SELECT 1 FROM public.backtest_account_trades t
                    WHERE t.backtest_account_id = NEW.id AND t.exit_time IS NULL) THEN
      RAISE EXCEPTION 'BACKTEST_OPEN_POSITIONS:%',
        CASE WHEN NEW.spread_pips IS DISTINCT FROM OLD.spread_pips THEN 'spread_pips' ELSE 'commission_per_lot' END;
    END IF;

    -- E) Go-to-date rule (D13): once the account has trades the replay never moves backwards, so a
    --    trade can never sit in the "future" of the cursor. Going back needs a reset that deletes the
    --    account's trades first (the client does that after a confirmation).
    IF NEW.replay_time < OLD.replay_time
       AND EXISTS (SELECT 1 FROM public.backtest_account_trades t
                    WHERE t.backtest_account_id = NEW.id) THEN
      RAISE EXCEPTION 'BACKTEST_REPLAY_BACKWARD';
    END IF;
  END IF;

  -- B) Journal ownership: a journal set on INSERT, or changed on UPDATE, must belong to the same user
  --    and be active. NULL (no link / unlink) is always allowed; it is also what the FK
  --    ON DELETE SET NULL and delete_journal() write.
  IF NEW.journal_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.journal_id IS DISTINCT FROM OLD.journal_id) THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.journals j
       WHERE j.id = NEW.journal_id
         AND j.user_id = NEW.user_id
         AND j.is_active = true
    ) THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
  END IF;

  -- C) Quota, only on INSERT of an active account or on inactive -> active (as in
  --    check_prop_account_limit): free 1, active premium 10. Accounts of a user whose premium expired
  --    keep working; only new or reactivated accounts above the quota are refused.
  IF (TG_OP = 'INSERT' AND NEW.is_active = true)
     OR (TG_OP = 'UPDATE' AND NEW.is_active = true AND OLD.is_active IS DISTINCT FROM true) THEN

    -- Serialise concurrent creations of the same user (double submit), so the count below is exact.
    PERFORM pg_advisory_xact_lock(hashtextextended('wawe.backtest_accounts.quota:' || NEW.user_id::text, 0));

    SELECT up.plan, up.plan_expires_at
      INTO v_plan, v_expires
      FROM public.user_profiles up
     WHERE up.id = NEW.user_id;

    v_is_premium := (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now()));
    v_max_accounts := CASE WHEN v_is_premium THEN 10 ELSE 1 END;

    SELECT count(*)
      INTO v_current_count
      FROM public.backtest_accounts a
     WHERE a.user_id = NEW.user_id
       AND a.is_active = true
       AND (TG_OP = 'INSERT' OR a.id <> NEW.id);

    IF v_current_count >= v_max_accounts THEN
      RAISE EXCEPTION 'BACKTEST_LIMIT_EXCEEDED:%', v_max_accounts;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5b. Integrity of backtest_account_trades
CREATE OR REPLACE FUNCTION public.check_backtest_trade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_symbol text;
BEGIN
  -- 0) Same guard as in check_backtest_account_limit: never evaluate another user's accounts for an
  --    API caller (BEFORE ROW triggers run before the RLS WITH CHECK). Admins: see there.
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'BACKTEST_NOT_OWNER' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- A) Identity, entry and initial-level columns never change, so the INSERT checks below and the
    --    rr_ratio computed at open stay valid.
    IF (NEW.id, NEW.user_id, NEW.backtest_account_id, NEW.symbol, NEW.direction, NEW.lot,
        NEW.entry_price, NEW.entry_time, NEW.initial_stop_loss, NEW.initial_take_profit,
        NEW.rr_ratio, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.backtest_account_id, OLD.symbol, OLD.direction, OLD.lot,
        OLD.entry_price, OLD.entry_time, OLD.initial_stop_loss, OLD.initial_take_profit,
        OLD.rr_ratio, OLD.created_at) THEN
      RAISE EXCEPTION 'BACKTEST_TRADE_IMMUTABLE';
    END IF;

    -- B) A closed trade is final: the balance and the journal mirror are built from it. Open positions
    --    stay editable (SL/TP changes, closing).
    IF OLD.exit_time IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'BACKTEST_TRADE_CLOSED';
    END IF;

    RETURN NEW;
  END IF;

  -- C) INSERT: the account belongs to the same user and the symbol is the account symbol.
  SELECT a.symbol
    INTO v_account_symbol
    FROM public.backtest_accounts a
   WHERE a.id = NEW.backtest_account_id
     AND a.user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_BACKTEST_ACCOUNT';
  END IF;

  IF NEW.symbol IS DISTINCT FROM v_account_symbol THEN
    RAISE EXCEPTION 'BACKTEST_SYMBOL_MISMATCH';
  END IF;

  -- D) The initial levels are the levels at open, whatever the client sent (D13).
  NEW.initial_stop_loss   := NEW.stop_loss;
  NEW.initial_take_profit := NEW.take_profit;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backtest_accounts_updated_at ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_updated_at
  BEFORE UPDATE ON public.backtest_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_check_backtest_account_limit ON public.backtest_accounts;
CREATE TRIGGER trg_check_backtest_account_limit
  BEFORE INSERT OR UPDATE ON public.backtest_accounts
  FOR EACH ROW EXECUTE FUNCTION public.check_backtest_account_limit();

DROP TRIGGER IF EXISTS trg_check_backtest_trade ON public.backtest_account_trades;
CREATE TRIGGER trg_check_backtest_trade
  BEFORE INSERT OR UPDATE ON public.backtest_account_trades
  FOR EACH ROW EXECUTE FUNCTION public.check_backtest_trade();

-- 6. reset_user_data(): 202610180001 version + the Backtest v2 tables (before the journals step) --------
CREATE OR REPLACE FUNCTION public.reset_user_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_default_jid UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Trades (this also removes the journal mirrors of backtest trades, import_hash 'backtest:%')
  DELETE FROM public.trades WHERE user_id = v_uid;

  -- 1b. Backtest v2 (migration 202610180002): account trades, then the accounts themselves
  IF to_regclass('public.backtest_account_trades') IS NOT NULL THEN
    DELETE FROM public.backtest_account_trades WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
    DELETE FROM public.backtest_accounts WHERE user_id = v_uid;
  END IF;

  -- 2. Stratejiler
  IF to_regclass('public.strategies') IS NOT NULL THEN
    DELETE FROM public.strategies WHERE user_id = v_uid;
  END IF;

  -- 3. Bildirimler
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE user_id = v_uid;
  END IF;

  -- 4. User Onboarding
  IF to_regclass('public.user_onboarding') IS NOT NULL THEN
    DELETE FROM public.user_onboarding WHERE user_id = v_uid;
  END IF;

  -- 5. Defterler (Journals)
  -- Özel defterleri sil, varsayılan defteri temizle/oluştur
  IF to_regclass('public.journals') IS NOT NULL THEN
    DELETE FROM public.journals WHERE user_id = v_uid AND is_default = false;

    SELECT id INTO v_default_jid FROM public.journals WHERE user_id = v_uid AND is_default = true LIMIT 1;
    IF v_default_jid IS NULL THEN
      INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
      VALUES (v_uid, 'Ana Hesap', 'Varsayılan işlem günlüğü', '#7c6dfa', 'folder', true, true);
    ELSE
      UPDATE public.journals
      SET name = 'Ana Hesap', description = 'Varsayılan işlem günlüğü', color = '#7c6dfa', icon = 'folder', is_active = true
      WHERE id = v_default_jid;
    END IF;
  END IF;

  -- 6. cTrader senkron imleci: işlemler silindiği için bir sonraki senkron tüm geçmişi (en fazla 90 gün) yeniden
  --    getirsin (eskiden imleç korunuyor ve yalnızca son 2 gün geri geliyordu).
  IF to_regclass('public.ctrader_accounts') IS NOT NULL THEN
    UPDATE public.ctrader_accounts
    SET last_deal_timestamp = NULL, last_error = NULL, updated_at = now()
    WHERE user_id = v_uid;
  END IF;
END;
$function$;

-- 7. delete_journal(uuid): LIVE body (LF) + detach linked backtest accounts in both branches -------------
CREATE OR REPLACE FUNCTION public.delete_journal(p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_default boolean;
    v_total_count int;
    v_other_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Lütfen oturum açın.';
    END IF;

    SELECT is_default INTO v_is_default
    FROM public.journals
    WHERE id = p_journal_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOURNAL_NOT_FOUND: Defter bulunamadı.';
    END IF;

    DELETE FROM public.trades WHERE journal_id = p_journal_id;
    DELETE FROM public.strategies WHERE journal_id = p_journal_id;

    -- Backtest v2 (migration 202610180002): detach the backtest accounts linked to this journal, in BOTH
    -- branches. The "last journal" branch below only resets the journal row, so the FK
    -- backtest_accounts.journal_id ON DELETE SET NULL would never fire there. The journal mirrors of their
    -- trades were already removed by the trades DELETE above.
    IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
        UPDATE public.backtest_accounts
           SET journal_id = NULL
         WHERE journal_id = p_journal_id
           AND user_id = v_user_id;
    END IF;

    SELECT count(*) INTO v_total_count
    FROM public.journals
    WHERE user_id = v_user_id AND is_active = true;

    -- Tek defter varsa sıfırla (409 hatası vermez)
    IF v_total_count <= 1 THEN
        UPDATE public.journals
        SET name = 'Ana Defter',
            description = NULL,
            color = '#7c6dfa',
            icon = 'book-open',
            is_default = true,
            platform = NULL,
            is_connected = false,
            connection_status = 'disconnected',
            last_synced_at = NULL,
            is_prop_firm = false,
            prop_firm_rules = NULL,
            prop_firm_status = 'none',
            prop_firm_stats = NULL,
            updated_at = now()
        WHERE id = p_journal_id;

        RETURN jsonb_build_object('success', true, 'message', 'Defter sıfırlandı.', 'reset', true);
    END IF;

    IF v_is_default THEN
        SELECT id INTO v_other_id
        FROM public.journals
        WHERE user_id = v_user_id AND id != p_journal_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_other_id IS NOT NULL THEN
            UPDATE public.journals SET is_default = true, updated_at = now() WHERE id = v_other_id;
        END IF;
    END IF;

    DELETE FROM public.journals WHERE id = p_journal_id AND user_id = v_user_id;
    RETURN jsonb_build_object('success', true, 'deleted_id', p_journal_id);
END;
$function$;

-- 8. ACLs ---------------------------------------------------------------------------------------------
-- Trigger functions are never called through the API. Postgres checks EXECUTE on a trigger function
-- only at CREATE TRIGGER time, so revoking it does not stop the triggers from firing.
REVOKE ALL ON FUNCTION public.check_backtest_account_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_backtest_trade() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

REVOKE ALL ON FUNCTION public.delete_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_journal(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only; run them one by one)
-- ------------------------------------------------------------
-- 1) Tables with RLS on (expect 2 rows, relrowsecurity = true):
--    SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--     WHERE oid IN ('public.backtest_accounts'::regclass, 'public.backtest_account_trades'::regclass);
--
-- 2) Policies (expect 8 rows, roles = {authenticated}):
--    SELECT tablename, policyname, cmd, roles, qual, with_check FROM pg_policies
--     WHERE schemaname = 'public' AND tablename IN ('backtest_accounts', 'backtest_account_trades') ORDER BY 1, 2;
--
-- 3) Constraints (expect 7 chk_backtest_accounts_*, 12 chk_backtest_account_trades_* (10 without the
--    OPTIONAL columns), 2 pkeys and 4 FKs: both user_id -> auth.users ON DELETE CASCADE,
--    journal_id -> journals ON DELETE SET NULL, backtest_account_id -> backtest_accounts ON DELETE CASCADE):
--    SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid IN ('public.backtest_accounts'::regclass, 'public.backtest_account_trades'::regclass) ORDER BY 1, 2;
--
-- 4) Indexes (expect 2 pkeys + the 4 idx_* above):
--    SELECT tablename, indexname, indexdef FROM pg_indexes
--     WHERE schemaname = 'public' AND tablename IN ('backtest_accounts', 'backtest_account_trades') ORDER BY 1, 2;
--
-- 5) Triggers (expect 3):
--    SELECT tgrelid::regclass, tgname, pg_get_triggerdef(oid) FROM pg_trigger
--     WHERE tgrelid IN ('public.backtest_accounts'::regclass, 'public.backtest_account_trades'::regclass)
--       AND NOT tgisinternal ORDER BY 1, 2;
--
-- 6) Function attributes and ACLs. Expect: both check_* functions prosecdef = true,
--    proconfig = {search_path=public}, proacl WITHOUT anon / authenticated / bare "=X" (PUBLIC);
--    reset_user_data and delete_journal: prosecdef = true, EXECUTE for authenticated (+ postgres,
--    service_role), no anon, no PUBLIC:
--    SELECT p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig, p.proacl FROM pg_proc p
--     WHERE p.oid IN ('public.check_backtest_account_limit()'::regprocedure, 'public.check_backtest_trade()'::regprocedure,
--                     'public.reset_user_data()'::regprocedure, 'public.delete_journal(uuid)'::regprocedure,
--                     'public.touch_updated_at()'::regprocedure);
--
-- 7) Body versions (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '053931abe8d9ac918922d85db0ff6aac' FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = 'afdbbce70341eeeaadb7c2a75f134d2d' FROM pg_proc WHERE oid = 'public.delete_journal(uuid)'::regprocedure;
--
-- 8) The trigger functions' owner bypasses RLS (expect true):
--    SELECT r.rolname, (r.rolsuper OR r.rolbypassrls) AS bypasses_rls FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
--     WHERE p.oid = 'public.check_backtest_account_limit()'::regprocedure;
--
-- 9) Functional test on live without leaving data: supabase/tests/backtest_v2_verify.sql (it rolls
--    itself back; still an owner-approved run because it writes inside the transaction).
-- ============================================================
