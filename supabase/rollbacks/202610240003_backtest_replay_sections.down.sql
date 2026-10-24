-- ============================================================
-- ROLLBACK of 202610240003_backtest_replay_sections.sql
-- Restores check_backtest_account_limit() to the live body of 2026-10-24 (no going back once an account has trades), drops the
-- section triggers, functions and columns.
-- DATA LOSS GUARD: refuses while an account has more than one section (the section history and the trades' section numbers would
-- be lost); to accept that run  SET wawe.allow_sections_loss = 'on';  in the same session first.
-- Deploy the client of before this migration first (it does not read the section columns).
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE v_n bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'section_no') THEN
    RAISE EXCEPTION 'ORDER: migration 202610240003 is not applied.';
  END IF;
  SELECT count(*) INTO v_n FROM public.backtest_accounts WHERE section_no > 1;
  IF v_n > 0 AND coalesce(current_setting('wawe.allow_sections_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATA LOSS: % account(s) have more than one section; SET wawe.allow_sections_loss = ''on'' to drop them anyway.', v_n;
  END IF;
END $$;

DROP TRIGGER trg_backtest_accounts_sections ON public.backtest_accounts;
DROP TRIGGER trg_backtest_trade_section ON public.backtest_account_trades;
DROP FUNCTION public.backtest_account_sections();
DROP FUNCTION public.backtest_trade_section();
ALTER TABLE public.backtest_account_trades DROP COLUMN section_no;
ALTER TABLE public.backtest_accounts DROP COLUMN sections;
ALTER TABLE public.backtest_accounts DROP COLUMN section_no;

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
$function$;

DO $$
BEGIN
  IF position('BACKTEST_REPLAY_BACKWARD' IN (SELECT prosrc FROM pg_proc WHERE oid = 'public.check_backtest_account_limit()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'CHECK: rollback incomplete';
  END IF;
  RAISE NOTICE 'backtest_replay_sections rolled back';
END $$;

COMMIT;
