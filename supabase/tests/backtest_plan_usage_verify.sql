-- ============================================================
-- Verification of 202610260001_backtest_plan_usage.sql. ONE transaction ending with ROLLBACK (safe on the live database):
-- two throw-away users; free below the limit, above 80 %, at the limit; Premium with and without an end date; expired Premium.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/backtest_plan_usage_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('u', gen_random_uuid()), ('other', gen_random_uuid()), ('a1', gen_random_uuid()), ('a2', gen_random_uuid()), ('a3', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-plan-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k IN ('u', 'other');
UPDATE public.user_profiles SET plan = 'free', plan_expires_at = NULL WHERE id IN (SELECT id FROM _v WHERE k IN ('u', 'other'));
-- the other user has usage and an account that must never show up for 'u'
INSERT INTO public.backtest_trade_usage (user_id, month, trades) VALUES ((SELECT id FROM _v WHERE k = 'other'), date_trunc('month', now() AT TIME ZONE 'UTC')::date, 55);
INSERT INTO public.backtest_accounts (user_id, name, symbol, timeframe, starting_balance, replay_time, data_source)
SELECT (SELECT id FROM _v WHERE k = 'other'), 'other', 'EURUSD', '1h', 10000, now(), 'synthetic';
-- a small limit for the test, the real one is restored by the ROLLBACK
UPDATE public.system_settings SET value = jsonb_set(value, '{ctrader_free_monthly_trades}', '10') WHERE key = 'backtest_limits';

CREATE OR REPLACE FUNCTION pg_temp.pu() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_backtest_plan_usage() $$;
CREATE OR REPLACE FUNCTION pg_temp.set_used(n int) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.backtest_trade_usage (user_id, month, trades) VALUES ((SELECT id FROM _v WHERE k = 'u'), date_trunc('month', now() AT TIME ZONE 'UTC')::date, n)
  ON CONFLICT (user_id, month) DO UPDATE SET trades = EXCLUDED.trades $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- anon cannot call it
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.get_backtest_plan_usage(); EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS anon cannot call get_backtest_plan_usage'; RETURN; END;
  RAISE EXCEPTION 'FAIL anon called it';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'u'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', (SELECT id FROM _v WHERE k = 'u')::text, true);

-- free, nothing used
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb := pg_temp.pu(); BEGIN
  IF (p ->> 'premium')::boolean OR p ->> 'plan' <> 'free' OR p -> 'plan_expires_at' <> 'null'::jsonb
     OR (p #>> '{accounts,used}')::int <> 0 OR (p #>> '{accounts,limit}')::int <> 1
     OR (p #>> '{trades,used}')::int <> 0 OR (p #>> '{trades,limit}')::int <> 10 THEN RAISE EXCEPTION 'FAIL free start %', p; END IF;
  IF p #>> '{trades,month}' <> to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
     OR (p #>> '{trades,resets_at}')::timestamptz <> (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' THEN RAISE EXCEPTION 'FAIL reset date %', p; END IF;
  RAISE NOTICE 'PASS free: 0/1 accounts, 0/10 trades (limit from system_settings), resets on the 1st 00:00 UTC, other user invisible';
END $$;
RESET ROLE;

-- free below the limit, above 80 %, at the limit (one account)
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, data_source)
SELECT (SELECT id FROM _v WHERE k = 'a1'), (SELECT id FROM _v WHERE k = 'u'), 'a1', 'EURUSD', '1h', 10000, now(), 'synthetic';
SELECT pg_temp.set_used(3);
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb := pg_temp.pu(); BEGIN
  IF (p #>> '{trades,used}')::int <> 3 OR (p #>> '{accounts,used}')::int <> 1 THEN RAISE EXCEPTION 'FAIL below %', p; END IF;
  RAISE NOTICE 'PASS free below the limit: 3/10 trades, 1/1 accounts'; END $$;
RESET ROLE;
SELECT pg_temp.set_used(9);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (pg_temp.pu() #>> '{trades,used}')::int <> 9 THEN RAISE EXCEPTION 'FAIL 80'; END IF; RAISE NOTICE 'PASS free above 80 %%: 9/10'; END $$;
RESET ROLE;
SELECT pg_temp.set_used(10);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (pg_temp.pu() #>> '{trades,used}')::int <> 10 THEN RAISE EXCEPTION 'FAIL at limit'; END IF; RAISE NOTICE 'PASS free at the limit: 10/10'; END $$;
RESET ROLE;

-- Premium with an end date: 3 accounts of 10, an inactive account is not counted
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '30 days' WHERE id = (SELECT id FROM _v WHERE k = 'u');
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, data_source)
SELECT (SELECT id FROM _v WHERE k = k2), (SELECT id FROM _v WHERE k = 'u'), k2, 'EURUSD', '1h', 10000, now(), 'synthetic' FROM unnest(ARRAY['a2', 'a3']) k2;
INSERT INTO public.backtest_accounts (user_id, name, symbol, timeframe, starting_balance, replay_time, data_source, is_active)
SELECT (SELECT id FROM _v WHERE k = 'u'), 'inactive', 'EURUSD', '1h', 10000, now(), 'synthetic', false;
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb := pg_temp.pu(); BEGIN
  IF NOT (p ->> 'premium')::boolean OR (p #>> '{accounts,used}')::int <> 3 OR (p #>> '{accounts,limit}')::int <> 10
     OR abs(extract(epoch FROM (p ->> 'plan_expires_at')::timestamptz - (now() + interval '30 days'))) > 1 THEN RAISE EXCEPTION 'FAIL premium %', p; END IF;
  RAISE NOTICE 'PASS premium: 3/10 active accounts, end date returned'; END $$;
RESET ROLE;

-- Premium without an end date, then expired Premium (free again, end date kept for the message)
UPDATE public.user_profiles SET plan_expires_at = NULL WHERE id = (SELECT id FROM _v WHERE k = 'u');
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb := pg_temp.pu(); BEGIN
  IF NOT (p ->> 'premium')::boolean OR p -> 'plan_expires_at' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL premium no end %', p; END IF;
  RAISE NOTICE 'PASS premium without an end date'; END $$;
RESET ROLE;
UPDATE public.user_profiles SET plan_expires_at = now() - interval '1 day' WHERE id = (SELECT id FROM _v WHERE k = 'u');
SET LOCAL ROLE authenticated;
DO $$ DECLARE p jsonb := pg_temp.pu(); BEGIN
  IF (p ->> 'premium')::boolean OR (p #>> '{accounts,limit}')::int <> 1 OR (p #>> '{accounts,used}')::int <> 3 THEN RAISE EXCEPTION 'FAIL expired %', p; END IF;
  RAISE NOTICE 'PASS expired premium: free limits, 3/1 accounts (over the quota)'; END $$;
RESET ROLE;

-- the account quota shown is the one the trigger enforces
DO $$ BEGIN
  IF pg_get_functiondef('public.check_backtest_account_limit()'::regprocedure) !~ 'WHEN v_is_premium THEN 10 ELSE 1 END' THEN RAISE EXCEPTION 'FAIL quota drift'; END IF;
  RAISE NOTICE 'PASS account quota matches check_backtest_account_limit()';
END $$;

ROLLBACK;
