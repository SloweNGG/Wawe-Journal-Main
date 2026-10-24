-- ============================================================
-- WAWE JOURNAL - BACKTEST: GO BACK IN TIME ON AN ACCOUNT WITH TRADES (SECTIONS)
-- Migration: 202610240003_backtest_replay_sections.sql
-- Description:
--   1. check_backtest_account_limit() rule E: the replay may move BACKWARDS on an account with trades as long as no position is
--      open (was: never backwards once the account has trades -> BACKTEST_REPLAY_BACKWARD). A backward move with an open position
--      raises BACKTEST_OPEN_POSITIONS:replay_time. Every other rule of the function (owner guard, immutable id/user_id/symbol,
--      journal ownership, quota, spread/commission frozen while a position is open) is the live body unchanged.
--   2. backtest_accounts.section_no (current section, >= 1) and backtest_accounts.sections (jsonb array of
--      {"no", "start" (replay time the section starts at), "at" (wall clock)}). Maintained ONLY by
--      backtest_account_sections() (BEFORE INSERT OR UPDATE, client values are ignored): a backward move on an account with
--      trades starts section n+1; an account without trades always has the single section 1 (a reset starts over).
--      Existing accounts get section 1 starting at their first trade's entry time (or their replay time).
--   3. backtest_account_trades.section_no: set on INSERT from the account's current section (backtest_trade_section(), the
--      client cannot choose it), immutable afterwards. Existing trades are section 1.
--   Journal mirrors (bt-sync) keep using the market times of the trades; nothing changes there.
-- Run order: after 202610240002. Rollback: supabase/rollbacks/202610240003_backtest_replay_sections.down.sql
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS / DRIFT GUARD -----------------------------------------------------------------
DO $$
DECLARE v_md5 text;
BEGIN
  IF to_regclass('public.backtest_trade_usage') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610240002_backtest_trade_limit.sql first.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'section_no') THEN
    RAISE EXCEPTION 'ORDER: backtest_accounts.section_no already exists (this migration was already applied).';
  END IF;
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5 FROM pg_proc p WHERE p.oid = to_regprocedure('public.check_backtest_account_limit()');
  IF v_md5 IS DISTINCT FROM '3432e8a3483ee0b26b1a36ac2edf79f5' THEN
    RAISE EXCEPTION 'DRIFT: check_backtest_account_limit() differs from the live body of 2026-10-24 (md5 %). Re-base this file.', v_md5;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

-- 1. COLUMNS ----------------------------------------------------------------------------------------
ALTER TABLE public.backtest_accounts ADD COLUMN section_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.backtest_accounts ADD COLUMN sections jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_section_no CHECK (section_no >= 1);
ALTER TABLE public.backtest_accounts ADD CONSTRAINT chk_backtest_accounts_sections
  CHECK (jsonb_typeof(sections) = 'array' AND pg_column_size(sections) <= 65536);
ALTER TABLE public.backtest_account_trades ADD COLUMN section_no integer NOT NULL DEFAULT 1;
ALTER TABLE public.backtest_account_trades ADD CONSTRAINT chk_backtest_account_trades_section_no CHECK (section_no >= 1);

COMMENT ON COLUMN public.backtest_accounts.sections IS
  'Sections of the replay: [{"no": 1, "start": replay time, "at": wall clock}, ...]. A new one starts when the replay goes back on an account with trades. Maintained by backtest_account_sections().';
COMMENT ON COLUMN public.backtest_account_trades.section_no IS 'Section of the account the trade was opened in (set by backtest_trade_section()).';

-- existing accounts: one section from their first trade (or their replay time)
ALTER TABLE public.backtest_accounts DISABLE TRIGGER USER;
UPDATE public.backtest_accounts a
   SET sections = jsonb_build_array(jsonb_build_object('no', 1,
         'start', coalesce((SELECT min(t.entry_time) FROM public.backtest_account_trades t WHERE t.backtest_account_id = a.id), a.replay_time),
         'at', a.created_at));
ALTER TABLE public.backtest_accounts ENABLE TRIGGER USER;

-- 2. GO-TO-DATE RULE (live body, rule E changed) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_backtest_account_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- E) Go-to-date rule (migration 202610240003): the replay may move backwards on an account with trades, but
    --    never while a position is open (its fill and its floating P&L belong to the current replay time).
    --    Going back starts a new section (trg_backtest_accounts_sections); closed trades keep their market times.
    IF NEW.replay_time < OLD.replay_time
       AND EXISTS (SELECT 1 FROM public.backtest_account_trades t
                    WHERE t.backtest_account_id = NEW.id AND t.exit_time IS NULL) THEN
      RAISE EXCEPTION 'BACKTEST_OPEN_POSITIONS:replay_time';
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
$function$;

-- 3. SECTIONS -----------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backtest_account_sections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_has boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.section_no := 1;
    NEW.sections := jsonb_build_array(jsonb_build_object('no', 1, 'start', NEW.replay_time, 'at', now()));
    RETURN NEW;
  END IF;
  -- never taken from the client
  NEW.section_no := OLD.section_no;
  NEW.sections := OLD.sections;
  v_has := EXISTS (SELECT 1 FROM public.backtest_account_trades t WHERE t.backtest_account_id = NEW.id);
  IF NOT v_has THEN
    -- no trades (new or reset account): one section, starting where the replay goes back to
    IF NEW.replay_time < OLD.replay_time OR OLD.section_no <> 1 OR jsonb_array_length(OLD.sections) <> 1 THEN
      NEW.section_no := 1;
      NEW.sections := jsonb_build_array(jsonb_build_object('no', 1, 'start', NEW.replay_time, 'at', now()));
    END IF;
  ELSIF NEW.replay_time < OLD.replay_time THEN
    -- back in time with trades: a new section (an open position is refused by check_backtest_account_limit)
    NEW.section_no := OLD.section_no + 1;
    NEW.sections := OLD.sections || jsonb_build_array(jsonb_build_object('no', NEW.section_no, 'start', NEW.replay_time, 'at', now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.backtest_trade_section()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.section_no := coalesce((SELECT a.section_no FROM public.backtest_accounts a WHERE a.id = NEW.backtest_account_id AND a.user_id = NEW.user_id), 1);
  ELSIF NEW.section_no IS DISTINCT FROM OLD.section_no THEN
    RAISE EXCEPTION 'BACKTEST_TRADE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.backtest_account_sections() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backtest_trade_section() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_backtest_accounts_sections
  BEFORE INSERT OR UPDATE ON public.backtest_accounts
  FOR EACH ROW EXECUTE FUNCTION public.backtest_account_sections();
CREATE TRIGGER trg_backtest_trade_section
  BEFORE INSERT OR UPDATE ON public.backtest_account_trades
  FOR EACH ROW EXECUTE FUNCTION public.backtest_trade_section();

-- 4. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF position('BACKTEST_REPLAY_BACKWARD' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.check_backtest_account_limit()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'CHECK: the old backward rule is still there';
  END IF;
  IF EXISTS (SELECT 1 FROM public.backtest_accounts WHERE jsonb_array_length(sections) <> 1 OR section_no <> 1) THEN
    RAISE EXCEPTION 'CHECK: existing accounts must have exactly one section';
  END IF;
  RAISE NOTICE 'backtest_replay_sections OK';
END $$;

COMMIT;
