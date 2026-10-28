-- ============================================================
-- Verification of 202610290001_backtest_exit_rule.sql. ONE transaction ending with ROLLBACK (safe on the live database).
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/backtest_exit_rule_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('u', gen_random_uuid()), ('acc', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-exit-rule-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k = 'u';

CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
-- an open trade with SL 1.09 and TP 1.11
CREATE OR REPLACE FUNCTION pg_temp.open_trade() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.backtest_account_trades (id, user_id, backtest_account_id, symbol, direction, lot, entry_price, stop_loss, take_profit, entry_time)
  VALUES (i, (SELECT id FROM _v WHERE k = 'u'), (SELECT id FROM _v WHERE k = 'acc'), 'EURUSD', 'LONG', 0.1, 1.1, 1.09, 1.11, '2026-03-02 10:00+00');
  RETURN i;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_account_trades'
                  AND column_name = 'exit_rule' AND data_type = 'text' AND is_nullable = 'YES' AND column_default IS NULL) THEN
    RAISE EXCEPTION 'FAIL column'; END IF;
  RAISE NOTICE 'PASS exit_rule: text, nullable, no default';
END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'u'), 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', (SELECT id FROM _v WHERE k = 'u')::text, true);
SET LOCAL ROLE authenticated;

INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time)
SELECT (SELECT id FROM _v WHERE k = 'acc'), (SELECT id FROM _v WHERE k = 'u'), 'verify', 'EURUSD', '1h', 10000, '2026-03-10 00:00+00';

-- the close of the page: pessimistic (SL and TP in one bar) and bar_path (order filled and closed in one bar)
INSERT INTO _v SELECT 'a', pg_temp.open_trade();
UPDATE public.backtest_account_trades SET exit_price = 1.09, exit_time = '2026-03-02 10:05+00', pnl = -100, gross_pnl = -100, exit_reason = 'sl',
       exit_ambiguous = true, exit_rule = 'pessimistic' WHERE id = (SELECT id FROM _v WHERE k = 'a');
INSERT INTO _v SELECT 'b', pg_temp.open_trade();
UPDATE public.backtest_account_trades SET exit_price = 1.11, exit_time = '2026-03-02 10:00+00', pnl = 100, gross_pnl = 100, exit_reason = 'tp',
       exit_ambiguous = true, exit_rule = 'bar_path' WHERE id = (SELECT id FROM _v WHERE k = 'b');
DO $$ BEGIN
  IF (SELECT array_agg(exit_rule ORDER BY exit_rule) FROM public.backtest_account_trades WHERE backtest_account_id = (SELECT id FROM _v WHERE k = 'acc'))
     IS DISTINCT FROM ARRAY['bar_path', 'pessimistic'] THEN RAISE EXCEPTION 'FAIL stored rules'; END IF;
  RAISE NOTICE 'PASS a close stores the rule of an ambiguous exit';
END $$;

-- a plain close leaves it NULL
INSERT INTO _v SELECT 'c', pg_temp.open_trade();
UPDATE public.backtest_account_trades SET exit_price = 1.105, exit_time = '2026-03-02 11:00+00', pnl = 50, gross_pnl = 50, exit_reason = 'manual'
 WHERE id = (SELECT id FROM _v WHERE k = 'c');
DO $$ BEGIN IF (SELECT exit_rule FROM public.backtest_account_trades WHERE id = (SELECT id FROM _v WHERE k = 'c')) IS NOT NULL THEN RAISE EXCEPTION 'FAIL null'; END IF;
  RAISE NOTICE 'PASS a plain close has no rule'; END $$;

INSERT INTO _v SELECT 'd', pg_temp.open_trade();
SELECT pg_temp.expect_error($q$UPDATE public.backtest_account_trades SET exit_price = 1.09, exit_time = '2026-03-02 10:05+00', pnl = -100, gross_pnl = -100,
  exit_reason = 'sl', exit_rule = 'pessimistic' WHERE id = (SELECT id FROM _v WHERE k = 'd')$q$,
  'chk_backtest_account_trades_exit_rule', 'a rule without exit_ambiguous is refused');
SELECT pg_temp.expect_error($q$UPDATE public.backtest_account_trades SET exit_price = 1.09, exit_time = '2026-03-02 10:05+00', pnl = -100, gross_pnl = -100,
  exit_reason = 'sl', exit_ambiguous = true, exit_rule = 'optimistic' WHERE id = (SELECT id FROM _v WHERE k = 'd')$q$,
  'chk_backtest_account_trades_exit_rule', 'an unknown rule is refused');
SELECT pg_temp.expect_error($q$UPDATE public.backtest_account_trades SET exit_rule = 'bar_path' WHERE id = (SELECT id FROM _v WHERE k = 'a')$q$,
  'BACKTEST_TRADE_CLOSED', 'the rule of a closed trade is final');
RESET ROLE;

ROLLBACK;
