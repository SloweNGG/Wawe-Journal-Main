-- ============================================================
-- Verification of 202610240003_backtest_replay_sections.sql. ONE transaction ending with ROLLBACK (safe on the live database).
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/backtest_replay_sections_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('u', gen_random_uuid()), ('acc', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-sections-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k = 'u';
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '1 day' WHERE id = (SELECT id FROM _v WHERE k = 'u');

CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.acc() RETURNS public.backtest_accounts LANGUAGE sql AS $$ SELECT a FROM public.backtest_accounts a WHERE a.id = (SELECT id FROM _v WHERE k = 'acc') $$;
CREATE OR REPLACE FUNCTION pg_temp.trade(closed boolean, sec int DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.backtest_account_trades (id, user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time, section_no)
  VALUES (i, (SELECT id FROM _v WHERE k = 'u'), (SELECT id FROM _v WHERE k = 'acc'), 'EURUSD', 'LONG', 0.1, 1.1, '2026-03-02 10:00+00', coalesce(sec, 1));
  IF closed THEN
    UPDATE public.backtest_account_trades SET exit_price = 1.11, exit_time = '2026-03-02 11:00+00', pnl = 10, gross_pnl = 10, exit_reason = 'manual' WHERE id = i;
  END IF;
  RETURN i;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'u'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', (SELECT id FROM _v WHERE k = 'u')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time, section_no, sections)
SELECT (SELECT id FROM _v WHERE k = 'acc'), (SELECT id FROM _v WHERE k = 'u'), 'verify', 'EURUSD', '1h', 10000, '2026-03-10 00:00+00', 5, '[1,2,3]';
DO $$ BEGIN IF (pg_temp.acc()).section_no <> 1 OR jsonb_array_length((pg_temp.acc()).sections) <> 1 OR ((pg_temp.acc()).sections -> 0 ->> 'start')::timestamptz <> '2026-03-10 00:00+00' THEN
  RAISE EXCEPTION 'FAIL insert %', (pg_temp.acc()).sections; END IF; RAISE NOTICE 'PASS new account: section 1 from its start, client values ignored'; END $$;

SELECT pg_temp.trade(true);
INSERT INTO _v SELECT 'open', pg_temp.trade(false);
SELECT pg_temp.expect_error($q$UPDATE public.backtest_accounts SET replay_time = '2026-02-01 00:00+00' WHERE id = (SELECT id FROM _v WHERE k = 'acc')$q$,
  'BACKTEST_OPEN_POSITIONS:replay_time', 'going back with an open position is refused');
UPDATE public.backtest_accounts SET replay_time = '2026-03-12 00:00+00' WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN IF (pg_temp.acc()).section_no <> 1 THEN RAISE EXCEPTION 'FAIL forward'; END IF; RAISE NOTICE 'PASS going forward with an open position: allowed, same section'; END $$;
SELECT pg_temp.expect_error($q$UPDATE public.backtest_accounts SET spread_pips = 3 WHERE id = (SELECT id FROM _v WHERE k = 'acc')$q$,
  'BACKTEST_OPEN_POSITIONS:spread_pips', 'spread stays frozen while a position is open');
SELECT pg_temp.expect_error($q$UPDATE public.backtest_accounts SET symbol = 'GBPUSD' WHERE id = (SELECT id FROM _v WHERE k = 'acc')$q$,
  'BACKTEST_ACCOUNT_IMMUTABLE:symbol', 'symbol stays immutable');

UPDATE public.backtest_account_trades SET exit_price = 1.12, exit_time = '2026-03-11 00:00+00', pnl = 20, gross_pnl = 20, exit_reason = 'manual' WHERE id = (SELECT id FROM _v WHERE k = 'open');
UPDATE public.backtest_accounts SET replay_time = '2026-02-01 00:00+00' WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN
  IF (pg_temp.acc()).section_no <> 2 OR jsonb_array_length((pg_temp.acc()).sections) <> 2 OR ((pg_temp.acc()).sections -> 1 ->> 'start')::timestamptz <> '2026-02-01 00:00+00'
     OR (pg_temp.acc()).replay_time <> '2026-02-01 00:00+00' THEN RAISE EXCEPTION 'FAIL back %', (pg_temp.acc()).sections; END IF;
  RAISE NOTICE 'PASS going back without open positions: allowed, section 2 starts at the new replay time'; END $$;
SELECT pg_temp.trade(true, 9);
DO $$ BEGIN IF (SELECT count(*) FROM public.backtest_account_trades WHERE backtest_account_id = (SELECT id FROM _v WHERE k = 'acc') AND section_no = 2) <> 1
  OR (SELECT count(*) FROM public.backtest_account_trades WHERE backtest_account_id = (SELECT id FROM _v WHERE k = 'acc') AND section_no = 1) <> 2 THEN RAISE EXCEPTION 'FAIL trade sections'; END IF;
  RAISE NOTICE 'PASS new trades get the current section (the client value 9 is ignored), old trades keep section 1'; END $$;
SELECT pg_temp.expect_error($q$UPDATE public.backtest_account_trades SET section_no = 1 WHERE section_no = 2$q$, 'BACKTEST_TRADE_IMMUTABLE', 'a trade''s section cannot change');
UPDATE public.backtest_accounts SET section_no = 7, sections = '[]' WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN IF (pg_temp.acc()).section_no <> 2 OR jsonb_array_length((pg_temp.acc()).sections) <> 2 THEN RAISE EXCEPTION 'FAIL tamper'; END IF;
  RAISE NOTICE 'PASS the client cannot rewrite section_no or sections'; END $$;
UPDATE public.backtest_accounts SET replay_time = '2026-01-15 00:00+00' WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN IF (pg_temp.acc()).section_no <> 3 THEN RAISE EXCEPTION 'FAIL third'; END IF; RAISE NOTICE 'PASS each going back starts the next section (3)'; END $$;
-- reset: trades deleted, the next account update (any) leaves one section
DELETE FROM public.backtest_account_trades WHERE backtest_account_id = (SELECT id FROM _v WHERE k = 'acc');
UPDATE public.backtest_accounts SET replay_time = '2026-01-20 00:00+00' WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN IF (pg_temp.acc()).section_no <> 1 OR jsonb_array_length((pg_temp.acc()).sections) <> 1 OR ((pg_temp.acc()).sections -> 0 ->> 'start')::timestamptz <> '2026-01-20 00:00+00' THEN
  RAISE EXCEPTION 'FAIL reset %', (pg_temp.acc()).sections; END IF; RAISE NOTICE 'PASS after a reset the account has one section again'; END $$;
RESET ROLE;

ROLLBACK;
