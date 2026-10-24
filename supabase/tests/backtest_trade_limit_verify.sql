-- ============================================================
-- Verification of 202610240002_backtest_trade_limit.sql. ONE transaction ending with ROLLBACK (safe on the live database):
-- a throw-away user with two cTrader-data accounts and one synthetic account, trades inserted as the API role.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/backtest_trade_limit_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('u', gen_random_uuid()), ('ct1', gen_random_uuid()), ('ct2', gen_random_uuid()), ('syn', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-limit-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k = 'u';
UPDATE public.user_profiles SET plan = 'free', plan_expires_at = NULL WHERE id = (SELECT id FROM _v WHERE k = 'u');
INSERT INTO public.ctrader_accounts (user_id, ctid_trader_account_id) VALUES ((SELECT id FROM _v WHERE k = 'u'), 990000001), ((SELECT id FROM _v WHERE k = 'u'), 990000002);
-- the account quota is not what is tested here: make room for three accounts
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '1 day' WHERE id = (SELECT id FROM _v WHERE k = 'u');
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, data_source, source_ctid_account, source_symbol_id, source_symbol_name)
SELECT (SELECT id FROM _v WHERE k = 'ct1'), (SELECT id FROM _v WHERE k = 'u'), 'ct 1', 'EURUSD', '1h', 10000, now(), 'ctrader', 990000001, 1, 'EURUSD';
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, data_source, source_ctid_account, source_symbol_id, source_symbol_name)
SELECT (SELECT id FROM _v WHERE k = 'ct2'), (SELECT id FROM _v WHERE k = 'u'), 'ct 2', 'EURUSD', '1h', 10000, now(), 'ctrader', 990000002, 1, 'EURUSD';
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, data_source)
SELECT (SELECT id FROM _v WHERE k = 'syn'), (SELECT id FROM _v WHERE k = 'u'), 'syn', 'EURUSD', '1h', 10000, now(), 'synthetic';
UPDATE public.user_profiles SET plan = 'free', plan_expires_at = NULL WHERE id = (SELECT id FROM _v WHERE k = 'u');
-- a small limit for the test, the real one is restored by the ROLLBACK
UPDATE public.system_settings SET value = jsonb_set(value, '{ctrader_free_monthly_trades}', '3') WHERE key = 'backtest_limits';

CREATE OR REPLACE FUNCTION pg_temp.trade(acc text, backdate boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.backtest_account_trades (id, user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time, created_at)
  VALUES (i, (SELECT id FROM _v WHERE k = 'u'), (SELECT id FROM _v WHERE k = acc), 'EURUSD', 'LONG', 0.1, 1.1, now(),
          CASE WHEN backdate THEN now() - interval '40 days' ELSE now() END);
  RETURN i;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.usage() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_backtest_trade_usage() $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'u'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', (SELECT id FROM _v WHERE k = 'u')::text, true);
SET LOCAL ROLE authenticated;

DO $$ BEGIN IF (pg_temp.usage() ->> 'limit')::int <> 3 OR (pg_temp.usage() ->> 'used')::int <> 0 OR (pg_temp.usage() ->> 'premium')::boolean THEN RAISE EXCEPTION 'FAIL usage start %', pg_temp.usage(); END IF;
  RAISE NOTICE 'PASS usage: limit read from system_settings, 0 used, free'; END $$;
-- synthetic: unlimited, not counted
SELECT pg_temp.trade('syn') FROM generate_series(1, 5);
DO $$ BEGIN IF (pg_temp.usage() ->> 'used')::int <> 0 THEN RAISE EXCEPTION 'FAIL synthetic counted'; END IF; RAISE NOTICE 'PASS synthetic-data trades are unlimited and not counted'; END $$;
-- cTrader: 3 over two accounts, the 4th is refused
SELECT pg_temp.trade('ct1'); SELECT pg_temp.trade('ct2', true);
INSERT INTO _v SELECT 'open', pg_temp.trade('ct1');
DO $$ BEGIN IF (pg_temp.usage() ->> 'used')::int <> 3 THEN RAISE EXCEPTION 'FAIL count %', pg_temp.usage(); END IF; RAISE NOTICE 'PASS cTrader trades of both accounts add up (3)'; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.backtest_account_trades WHERE created_at < now() - interval '1 day') THEN RAISE EXCEPTION 'FAIL backdated created_at kept'; END IF;
  RAISE NOTICE 'PASS created_at cannot be backdated to another month'; END $$;
SELECT pg_temp.expect_error($q$SELECT pg_temp.trade('ct2')$q$, 'BACKTEST_TRADE_LIMIT:3', 'free plan: the trade over the monthly limit is refused (any cTrader account)');
SELECT pg_temp.trade('syn');
-- an open position can still be closed
UPDATE public.backtest_account_trades SET exit_price = 1.11, exit_time = now(), pnl = 10, gross_pnl = 10, exit_reason = 'manual' WHERE id = (SELECT id FROM _v WHERE k = 'open');
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.backtest_account_trades WHERE id = (SELECT id FROM _v WHERE k = 'open') AND exit_time IS NOT NULL) THEN RAISE EXCEPTION 'FAIL close'; END IF;
  RAISE NOTICE 'PASS at the limit: open position closed, synthetic trades still possible'; END $$;
-- deleting trades does not give trades back
DELETE FROM public.backtest_account_trades WHERE backtest_account_id IN (SELECT id FROM _v WHERE k IN ('ct1', 'ct2'));
SELECT pg_temp.expect_error($q$SELECT pg_temp.trade('ct1')$q$, 'BACKTEST_TRADE_LIMIT', 'deleting trades (account reset) does not reset the monthly counter');
DO $$ BEGIN IF (SELECT count(*) FROM public.backtest_trade_usage) <> 1 THEN RAISE EXCEPTION 'FAIL RLS usage'; END IF; RAISE NOTICE 'PASS the user reads only their own usage row'; END $$;
SELECT pg_temp.expect_error($q$INSERT INTO public.backtest_trade_usage (user_id, month, trades) VALUES (auth.uid(), date_trunc('month', now())::date, 0)$q$, 'permission denied', 'the user cannot write the counter');
DO $$ BEGIN
  BEGIN UPDATE public.system_settings SET value = '{"ctrader_free_monthly_trades": 1000}' WHERE key = 'backtest_limits'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.backtest_trade_limit() <> 3 THEN RAISE EXCEPTION 'FAIL the user changed the limit'; END IF;
  RAISE NOTICE 'PASS the user cannot change the limit';
END $$;
RESET ROLE;

-- the limit is read at insert time: raising it allows more without a release
UPDATE public.system_settings SET value = jsonb_set(value, '{ctrader_free_monthly_trades}', '4') WHERE key = 'backtest_limits';
SET LOCAL ROLE authenticated;
SELECT pg_temp.trade('ct1');
SELECT pg_temp.expect_error($q$SELECT pg_temp.trade('ct1')$q$, 'BACKTEST_TRADE_LIMIT:4', 'a new limit in system_settings applies at once');
RESET ROLE;

-- premium: unlimited (still counted)
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '1 day' WHERE id = (SELECT id FROM _v WHERE k = 'u');
SET LOCAL ROLE authenticated;
SELECT pg_temp.trade('ct2') FROM generate_series(1, 3);
DO $$ BEGIN IF (pg_temp.usage() ->> 'used')::int <> 7 OR NOT (pg_temp.usage() ->> 'premium')::boolean THEN RAISE EXCEPTION 'FAIL premium %', pg_temp.usage(); END IF;
  RAISE NOTICE 'PASS premium: no limit (usage still counted: 7)'; END $$;
RESET ROLE;

ROLLBACK;
