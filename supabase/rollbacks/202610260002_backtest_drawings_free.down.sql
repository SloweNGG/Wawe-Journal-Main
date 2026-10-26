-- ============================================================
-- ROLLBACK of 202610260002_backtest_drawings_free.sql
-- Puts the Premium check back into check_backtest_drawing() (the body of 202610240001). Existing drawings of free users stay
-- readable and deletable; they can no longer be changed. Deploy a client that gates the drawings again first.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.check_backtest_drawing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan    text;
  v_expires timestamptz;
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

  -- Premium only (service role and the SQL editor have no API JWT and skip it)
  IF coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated') THEN
    SELECT up.plan, up.plan_expires_at INTO v_plan, v_expires FROM public.user_profiles up WHERE up.id = NEW.user_id;
    IF NOT (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now())) THEN
      RAISE EXCEPTION 'BACKTEST_DRAWINGS_PREMIUM';
    END IF;
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

DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5 FROM pg_proc p WHERE p.oid = to_regprocedure('public.check_backtest_drawing()');
  IF v_md5 IS DISTINCT FROM 'ae12176e650b2f91fa51a356c498dbf4' THEN RAISE EXCEPTION 'CHECK: body differs from 202610240001 (md5 %)', v_md5; END IF;
  RAISE NOTICE 'backtest_drawings_free rolled back';
END $$;

COMMIT;
