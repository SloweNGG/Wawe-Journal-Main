-- ============================================================
-- WAWE JOURNAL - BACKTEST DRAWINGS FREE FOR EVERY PLAN
-- Migration: 202610260002_backtest_drawings_free.sql
-- Description:
--   check_backtest_drawing() no longer requires an active Premium plan (BACKTEST_DRAWINGS_PREMIUM is gone): every signed-in
--   user saves the drawings of their own backtest accounts. Everything else stays: own user_id only (BACKTEST_NOT_OWNER), own
--   account (INVALID_BACKTEST_ACCOUNT), immutable id / user_id / account / created_at, at most 500 drawings per account,
--   RLS and the column checks of 202610240001. No table, policy or data change.
--   The page (backtest.js) offers every tool to every plan and saves to the account from the same release.
-- Run order: after 202610260001. Rollback: supabase/rollbacks/202610260002_backtest_drawings_free.down.sql
-- Verification: supabase/tests/backtest_drawings_verify.sql (updated for these rules).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS: the live body is the one of 202610240001 (md5 of the source without whitespace)
DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5 FROM pg_proc p WHERE p.oid = to_regprocedure('public.check_backtest_drawing()');
  IF v_md5 IS NULL THEN RAISE EXCEPTION 'PRECONDITION: public.check_backtest_drawing() is missing (202610240001 not applied).'; END IF;
  IF v_md5 IS DISTINCT FROM 'ae12176e650b2f91fa51a356c498dbf4' THEN
    RAISE EXCEPTION 'DRIFT/ORDER: check_backtest_drawing() differs from the body of 202610240001 (md5 %); already applied or changed elsewhere.', v_md5;
  END IF;
END $$;

-- 1. FUNCTION (same body without the Premium check) --------------------------------------------
CREATE OR REPLACE FUNCTION public.check_backtest_drawing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count   int;
BEGIN
  -- BEFORE ROW triggers run before the RLS WITH CHECK: never evaluate another user's rows for an API caller
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'BACKTEST_NOT_OWNER' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.user_id, NEW.backtest_account_id, NEW.created_at)
                          IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.backtest_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 'BACKTEST_DRAWING_IMMUTABLE';
  END IF;

  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.backtest_accounts a
                                       WHERE a.id = NEW.backtest_account_id AND a.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'INVALID_BACKTEST_ACCOUNT';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('wawe.backtest_drawings:' || NEW.backtest_account_id::text, 0));
    SELECT count(*) INTO v_count FROM public.backtest_drawings d WHERE d.backtest_account_id = NEW.backtest_account_id;
    IF v_count >= 500 THEN
      RAISE EXCEPTION 'BACKTEST_DRAWINGS_LIMIT:500';
    END IF;
    NEW.created_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_backtest_drawing() FROM PUBLIC, anon, authenticated;

-- 2. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF pg_get_functiondef('public.check_backtest_drawing()'::regprocedure) ~ 'BACKTEST_DRAWINGS_PREMIUM' THEN RAISE EXCEPTION 'CHECK: Premium check still there'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_backtest_drawing' AND tgrelid = 'public.backtest_drawings'::regclass) THEN
    RAISE EXCEPTION 'CHECK: trigger missing';
  END IF;
  RAISE NOTICE 'backtest_drawings_free OK';
END $$;

COMMIT;
