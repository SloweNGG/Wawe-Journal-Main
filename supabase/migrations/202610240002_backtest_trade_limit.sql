-- ============================================================
-- WAWE JOURNAL - MONTHLY TRADE LIMIT ON cTRADER-DATA BACKTEST ACCOUNTS (free plan)
-- Migration: 202610240002_backtest_trade_limit.sql
-- Description:
--   1. system_settings row 'backtest_limits' = {"ctrader_free_monthly_trades": 100}. Change the limit without a release:
--        UPDATE public.system_settings SET value = jsonb_set(value, '{ctrader_free_monthly_trades}', '150'), updated_at = now()
--         WHERE key = 'backtest_limits';
--   2. public.backtest_trade_usage (user_id, month, trades): trades OPENED on cTrader-data backtest accounts per calendar month
--      (UTC). A counter, not a count of rows: deleting trades or resetting an account does not give trades back. Rows are
--      written only by the trigger below (and seeded with this month's existing cTrader-data trades); the user reads their own rows.
--   3. backtest_trade_limit(): the limit from system_settings (100 when the row or the value is missing or not a number).
--   4. check_backtest_trade_quota() BEFORE INSERT on backtest_account_trades: synthetic-data accounts are never counted or
--      limited. For a cTrader-data account the trade is counted for the month of now() (UTC, created_at is forced to now()),
--      and an API caller without an active Premium plan is refused with BACKTEST_TRADE_LIMIT:<limit> once the month's total over
--      ALL of the user's cTrader-data accounts reached the limit. Only INSERT is checked: open positions can still be modified
--      and closed. Runs after trg_check_backtest_trade (alphabetical), so ownership and account checks come first.
--   5. get_backtest_trade_usage(): { used, limit, premium, month, resets_at } of the caller for the page indicator.
--   The account quota (free 1, Premium 10) is unchanged (check_backtest_account_limit).
-- Run order: after 202610240001. Rollback: supabase/rollbacks/202610240002_backtest_trade_limit.down.sql
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_account_trades') IS NULL OR to_regclass('public.system_settings') IS NULL
     OR to_regclass('public.backtest_drawings') IS NULL OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION/ORDER: backtest_account_trades, system_settings, is_admin() and migration 202610240001 (backtest_drawings) must exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_accounts' AND column_name = 'data_source') THEN
    RAISE EXCEPTION 'PRECONDITION: backtest_accounts.data_source (migration 08/09) is missing.';
  END IF;
  IF to_regclass('public.backtest_trade_usage') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.backtest_trade_usage already exists (this migration was already applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

-- 1. SETTING --------------------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('backtest_limits', '{"ctrader_free_monthly_trades": 100}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 2. USAGE COUNTER --------------------------------------------------------------------------------
CREATE TABLE public.backtest_trade_usage (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month      date        NOT NULL,
  trades     integer     NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month),
  CONSTRAINT chk_backtest_trade_usage_month CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT chk_backtest_trade_usage_trades CHECK (trades >= 0)
);

COMMENT ON TABLE public.backtest_trade_usage IS
  'Trades opened on cTrader-data backtest accounts per user and calendar month (UTC). Written only by check_backtest_trade_quota(); free plan limit in system_settings.backtest_limits.';

ALTER TABLE public.backtest_trade_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backtest_trade_usage_select_own" ON public.backtest_trade_usage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
REVOKE ALL ON public.backtest_trade_usage FROM anon, authenticated;
GRANT SELECT ON public.backtest_trade_usage TO authenticated;

-- 2b. This month's trades already opened on cTrader-data accounts count from the start
INSERT INTO public.backtest_trade_usage (user_id, month, trades, updated_at)
SELECT t.user_id, date_trunc('month', now() AT TIME ZONE 'UTC')::date, count(*), now()
  FROM public.backtest_account_trades t
  JOIN public.backtest_accounts a ON a.id = t.backtest_account_id AND a.user_id = t.user_id
 WHERE a.data_source = 'ctrader'
   AND t.created_at >= (date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
 GROUP BY t.user_id;

-- 3. LIMIT FROM THE SETTINGS ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backtest_trade_limit()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v text; n integer;
BEGIN
  SELECT s.value ->> 'ctrader_free_monthly_trades' INTO v FROM public.system_settings s WHERE s.key = 'backtest_limits';
  IF v IS NULL OR v !~ '^[0-9]{1,7}$' THEN RETURN 100; END IF;
  n := v::integer;
  RETURN n;
END;
$$;

-- 4. TRIGGER --------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_backtest_trade_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source  text;
  v_month   date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_plan    text;
  v_expires timestamptz;
  v_used    integer;
  v_limit   integer;
BEGIN
  SELECT a.data_source INTO v_source FROM public.backtest_accounts a WHERE a.id = NEW.backtest_account_id AND a.user_id = NEW.user_id;
  IF v_source IS DISTINCT FROM 'ctrader' THEN
    RETURN NEW;                                   -- synthetic data: unlimited, not counted
  END IF;

  NEW.created_at := now();                        -- the month a trade counts for cannot be chosen by the client

  -- one user at a time, so two parallel inserts cannot both pass at limit - 1
  PERFORM pg_advisory_xact_lock(hashtextextended('wawe.backtest_trade_usage:' || NEW.user_id::text, 0));

  IF coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated') THEN
    SELECT up.plan, up.plan_expires_at INTO v_plan, v_expires FROM public.user_profiles up WHERE up.id = NEW.user_id;
    IF NOT (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now())) THEN
      SELECT u.trades INTO v_used FROM public.backtest_trade_usage u WHERE u.user_id = NEW.user_id AND u.month = v_month;
      v_limit := public.backtest_trade_limit();
      IF coalesce(v_used, 0) >= v_limit THEN
        RAISE EXCEPTION 'BACKTEST_TRADE_LIMIT:%', v_limit;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.backtest_trade_usage AS u (user_id, month, trades, updated_at)
  VALUES (NEW.user_id, v_month, 1, now())
  ON CONFLICT (user_id, month) DO UPDATE SET trades = u.trades + 1, updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_backtest_trade_quota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backtest_trade_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backtest_trade_limit() TO authenticated;

CREATE TRIGGER trg_check_backtest_trade_quota
  BEFORE INSERT ON public.backtest_account_trades
  FOR EACH ROW EXECUTE FUNCTION public.check_backtest_trade_quota();

-- 5. USAGE FOR THE PAGE ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_backtest_trade_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_month   date := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  v_plan    text;
  v_expires timestamptz;
  v_used    integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT up.plan, up.plan_expires_at INTO v_plan, v_expires FROM public.user_profiles up WHERE up.id = v_uid;
  SELECT u.trades INTO v_used FROM public.backtest_trade_usage u WHERE u.user_id = v_uid AND u.month = v_month;
  RETURN jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', public.backtest_trade_limit(),
    'premium', (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now())),
    'month', to_char(v_month, 'YYYY-MM'),
    'resets_at', to_char((v_month + interval '1 month') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END;
$$;

REVOKE ALL ON FUNCTION public.get_backtest_trade_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_backtest_trade_usage() TO authenticated;

-- 6. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF public.backtest_trade_limit() IS NULL OR public.backtest_trade_limit() < 0 THEN RAISE EXCEPTION 'CHECK: limit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_backtest_trade_quota' AND tgrelid = 'public.backtest_account_trades'::regclass) THEN
    RAISE EXCEPTION 'CHECK: trigger missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backtest_trade_usage'::regclass) THEN RAISE EXCEPTION 'CHECK: RLS'; END IF;
  RAISE NOTICE 'backtest_trade_limit OK (limit %)', public.backtest_trade_limit();
END $$;

COMMIT;
