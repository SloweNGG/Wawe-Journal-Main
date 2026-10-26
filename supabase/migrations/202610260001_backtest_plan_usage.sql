-- ============================================================
-- WAWE JOURNAL - BACKTEST "PLAN AND USAGE" (settings window tab)
-- Migration: 202610260001_backtest_plan_usage.sql
-- Description:
--   get_backtest_plan_usage(): everything the "Plan and usage" tab shows, read from the database in one call (read only):
--     { premium, plan, plan_expires_at,
--       accounts: { used, limit }                     active backtest accounts of the caller, quota as in
--                                                     check_backtest_account_limit() (free 1, active Premium 10),
--       trades:   { used, limit, month, resets_at }   backtest_trade_usage of this month (UTC) and backtest_trade_limit()
--                                                     (system_settings.backtest_limits); Premium is not limited,
--       server_now }
--   The account quota is still hard-coded in check_backtest_account_limit(); the verification script checks both agree.
--   No table, trigger or policy changes.
-- Run order: after 202610240003. Rollback: supabase/rollbacks/202610260001_backtest_plan_usage.down.sql
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_trade_usage') IS NULL OR to_regprocedure('public.backtest_trade_limit()') IS NULL
     OR to_regprocedure('public.check_backtest_account_limit()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION/ORDER: migrations 202610180002 and 202610240002 must be applied first.';
  END IF;
  IF to_regprocedure('public.get_backtest_plan_usage()') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.get_backtest_plan_usage() already exists (this migration was already applied).';
  END IF;
  IF pg_get_functiondef('public.check_backtest_account_limit()'::regprocedure) !~ 'WHEN v_is_premium THEN 10 ELSE 1 END' THEN
    RAISE EXCEPTION 'PRECONDITION: the account quota in check_backtest_account_limit() is no longer free 1 / Premium 10; update this function.';
  END IF;
END $$;

-- 1. FUNCTION -------------------------------------------------------------------------------------
CREATE FUNCTION public.get_backtest_plan_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_month    date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_plan     text;
  v_expires  timestamptz;
  v_premium  boolean;
  v_accounts integer;
  v_used     integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT up.plan, up.plan_expires_at INTO v_plan, v_expires FROM public.user_profiles up WHERE up.id = v_uid;
  v_premium := coalesce(v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now()), false);
  SELECT count(*) INTO v_accounts FROM public.backtest_accounts a WHERE a.user_id = v_uid AND a.is_active = true;
  SELECT u.trades INTO v_used FROM public.backtest_trade_usage u WHERE u.user_id = v_uid AND u.month = v_month;
  RETURN jsonb_build_object(
    'premium', v_premium,
    'plan', coalesce(v_plan, 'free'),
    'plan_expires_at', CASE WHEN v_expires IS NULL THEN NULL ELSE to_char(v_expires AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') END,
    'accounts', jsonb_build_object('used', v_accounts, 'limit', CASE WHEN v_premium THEN 10 ELSE 1 END),   -- = check_backtest_account_limit()
    'trades', jsonb_build_object(
      'used', coalesce(v_used, 0),
      'limit', public.backtest_trade_limit(),
      'month', to_char(v_month, 'YYYY-MM'),
      'resets_at', to_char(v_month + interval '1 month', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),   -- a UTC wall time: independent of the session TimeZone
    'server_now', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_backtest_plan_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_backtest_plan_usage() TO authenticated;

-- 2. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.get_backtest_plan_usage()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_backtest_plan_usage()', 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK: grants';
  END IF;
  RAISE NOTICE 'get_backtest_plan_usage OK';
END $$;

COMMIT;
