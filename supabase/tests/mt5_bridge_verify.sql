-- ============================================================
-- Verification of 202611090002_mt5_bridge.sql. ONE transaction ending with ROLLBACK (safe on the live database):
-- throw-away users and journals; the EA side (service_role) starts and polls pairings, the users claim codes through
-- the site RPCs. Checks: code/secret/token formats, one-time token delivery, re-pairing replaces the token and resets
-- the cursor, per-user accounts, link/unlink/disconnect rules, attempt limit, IP limit, expiry, closed tables, anon
-- refused, and that MT5 trade rows (position_id NULL) dedupe per journal without hitting the other unique indexes.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/mt5_bridge_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
CREATE TEMP TABLE _s (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON _v, _s TO authenticated, anon, service_role;
INSERT INTO _v VALUES ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('c', gen_random_uuid()),
                      ('ja', gen_random_uuid()), ('ja2', gen_random_uuid()), ('jb', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-mt5-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k IN ('a', 'b', 'c');

INSERT INTO public.journals (id, user_id, name, is_active)
SELECT (SELECT id FROM _v WHERE k = j), (SELECT id FROM _v WHERE k = u), 'verify ' || j, true
  FROM (VALUES ('ja', 'a'), ('ja2', 'a'), ('jb', 'b')) AS t(j, u);

-- 1. structure and grants
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mt5_accounts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mt5_pairings'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.mt5_pair_failures'::regclass) THEN
    RAISE EXCEPTION 'FAIL RLS off';
  END IF;
  IF has_table_privilege('authenticated', 'public.mt5_accounts', 'SELECT')
     OR has_table_privilege('anon', 'public.mt5_pairings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.mt5_pair_failures', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL API roles have table privileges';
  END IF;
  IF has_function_privilege('authenticated', 'public.mt5_pair_start(bigint,text,text,text,boolean,numeric,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.mt5_pair_poll(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mt5_pair_poll(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service functions callable from the API';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.mt5_pair_start(bigint,text,text,text,boolean,numeric,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role cannot start pairings';
  END IF;
  IF has_function_privilege('anon', 'public.claim_mt5_pairing(text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_mt5_status()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_mt5_pairing(text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.disconnect_mt5_account(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL site RPC grants';
  END IF;
  RAISE NOTICE 'PASS structure and grants';
END $$;

-- ---------------------------------------------------------------- EA side: start a pairing
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE r jsonb; p jsonb;
BEGIN
  r := public.mt5_pair_start(51234567, 'Verify-Server', 'Verify Broker Ltd', 'usd', false, 10000.5, 'verify-ip-1');
  IF (r ->> 'ok')::boolean IS DISTINCT FROM true OR r ->> 'code' !~ '^[0-9]{6}$' OR r ->> 'poll_secret' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FAIL pair_start %', r;
  END IF;
  INSERT INTO _s VALUES ('code1', r ->> 'code'), ('secret1', r ->> 'poll_secret');
  p := public.mt5_pair_poll(r ->> 'poll_secret');
  IF p ->> 'status' <> 'pending' OR (p ->> 'expires_in')::int NOT BETWEEN 800 AND 900 THEN RAISE EXCEPTION 'FAIL poll pending %', p; END IF;
  IF public.mt5_pair_poll(repeat('0', 64)) ->> 'status' <> 'unknown' OR public.mt5_pair_poll('nope') ->> 'status' <> 'unknown' THEN
    RAISE EXCEPTION 'FAIL unknown secret';
  END IF;
  IF (SELECT currency FROM public.mt5_pairings WHERE code = r ->> 'code' AND status = 'pending') <> 'USD' THEN
    RAISE EXCEPTION 'FAIL currency normalised';
  END IF;
  BEGIN
    PERFORM public.mt5_pair_start(0, 'x', NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL login 0 accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'MT5_BAD_INPUT%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS pair_start / pair_poll pending';
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT poll_hash FROM public.mt5_pairings WHERE code = (SELECT v FROM _s WHERE k = 'code1') AND status = 'pending')
     IS DISTINCT FROM encode(extensions.digest((SELECT v FROM _s WHERE k = 'secret1'), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'FAIL only the hash of the poll secret is stored';
  END IF;
  RAISE NOTICE 'PASS poll secret stored as SHA-256';
END $$;

-- ---------------------------------------------------------------- user a claims
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'a'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; code text := (SELECT v FROM _s WHERE k = 'code1');
BEGIN
  r := public.claim_mt5_pairing(CASE WHEN code = '000000' THEN '111111' ELSE '000000' END, NULL);
  IF r ->> 'error' IS DISTINCT FROM 'INVALID_CODE' THEN RAISE EXCEPTION 'FAIL wrong code %', r; END IF;
  r := public.claim_mt5_pairing(code, (SELECT id FROM _v WHERE k = 'jb'));
  IF r ->> 'error' IS DISTINCT FROM 'INVALID_JOURNAL' THEN RAISE EXCEPTION 'FAIL foreign journal %', r; END IF;
  r := public.claim_mt5_pairing(substr(code, 1, 3) || ' ' || substr(code, 4), (SELECT id FROM _v WHERE k = 'ja'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM true OR (r ->> 'login')::bigint <> 51234567 THEN RAISE EXCEPTION 'FAIL claim %', r; END IF;
  INSERT INTO _v VALUES ('acc_a', (r ->> 'account_id')::uuid);
  r := public.claim_mt5_pairing(code, (SELECT id FROM _v WHERE k = 'ja'));
  IF r ->> 'error' IS DISTINCT FROM 'INVALID_CODE' THEN RAISE EXCEPTION 'FAIL code reusable %', r; END IF;
  r := public.get_mt5_status();
  IF jsonb_array_length(r -> 'accounts') <> 1
     OR r -> 'accounts' -> 0 ->> 'journal_name' <> 'verify ja'
     OR (r -> 'accounts' -> 0 ->> 'connected')::boolean IS DISTINCT FROM false
     OR (r -> 'accounts' -> 0 ->> 'is_live')::boolean IS DISTINCT FROM false
     OR (r -> 'accounts' -> 0 ->> 'balance')::numeric <> 10000.5
     OR r -> 'accounts' -> 0 ->> 'broker_name' <> 'Verify Broker Ltd' THEN
    RAISE EXCEPTION 'FAIL status after claim %', r;
  END IF;
  RAISE NOTICE 'PASS claim (wrong code, foreign journal, spaced code, one use, status)';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- EA picks up the token once
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE p jsonb;
BEGIN
  p := public.mt5_pair_poll((SELECT v FROM _s WHERE k = 'secret1'));
  IF p ->> 'status' <> 'paired' OR p ->> 'token' !~ '^wwm5_[0-9a-f]{64}$' OR p ->> 'journal' <> 'verify ja' THEN
    RAISE EXCEPTION 'FAIL token delivery %', p;
  END IF;
  INSERT INTO _s VALUES ('token1', p ->> 'token');
  INSERT INTO _s SELECT 'hash1', token_hash FROM public.mt5_accounts WHERE id = (SELECT id FROM _v WHERE k = 'acc_a');
  p :=public.mt5_pair_poll((SELECT v FROM _s WHERE k = 'secret1'));
  IF p ->> 'status' <> 'used' OR p ? 'token' THEN RAISE EXCEPTION 'FAIL token delivered twice %', p; END IF;
  -- the EA's first sync sets a cursor (done by the Edge Function with the service key)
  UPDATE public.mt5_accounts SET cursor_server_ts = 1790000000, last_seen_at = now() WHERE id = (SELECT id FROM _v WHERE k = 'acc_a');
  -- second pairing of the same account (e.g. moved to a VPS)
  p := public.mt5_pair_start(51234567, 'Verify-Server', 'Verify Broker Ltd', 'USD', false, 10100, 'verify-ip-1');
  INSERT INTO _s VALUES ('code2', p ->> 'code'), ('secret2', p ->> 'poll_secret');
  RAISE NOTICE 'PASS one-time token';
END $$;
RESET ROLE;

DO $$
BEGIN
  IF (SELECT v FROM _s WHERE k = 'hash1') IS DISTINCT FROM encode(extensions.digest((SELECT v FROM _s WHERE k = 'token1'), 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'FAIL stored token hash';
  END IF;
  RAISE NOTICE 'PASS token stored as SHA-256';
END $$;

-- ---------------------------------------------------------------- re-pair into another journal
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'a'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.claim_mt5_pairing((SELECT v FROM _s WHERE k = 'code2'), (SELECT id FROM _v WHERE k = 'ja2'));
  IF (r ->> 'account_id')::uuid IS DISTINCT FROM (SELECT id FROM _v WHERE k = 'acc_a') THEN RAISE EXCEPTION 'FAIL re-pair made a new row %', r; END IF;
  r := public.get_mt5_status();
  IF jsonb_array_length(r -> 'accounts') <> 1 OR r -> 'accounts' -> 0 ->> 'journal_name' <> 'verify ja2'
     OR (r -> 'accounts' -> 0 ->> 'online')::boolean IS DISTINCT FROM true
     OR (r -> 'accounts' -> 0 ->> 'connected')::boolean IS DISTINCT FROM true
     OR (r -> 'accounts' -> 0 ->> 'balance')::numeric <> 10100 THEN
    RAISE EXCEPTION 'FAIL status after re-pair %', r;
  END IF;
  RAISE NOTICE 'PASS re-pair reuses the account and moves it';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE p jsonb;
BEGIN
  IF (SELECT cursor_server_ts FROM public.mt5_accounts WHERE id = (SELECT id FROM _v WHERE k = 'acc_a')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL journal change kept the cursor';
  END IF;
  p := public.mt5_pair_poll((SELECT v FROM _s WHERE k = 'secret2'));
  IF p ->> 'status' <> 'paired' OR p ->> 'token' = (SELECT v FROM _s WHERE k = 'token1') THEN RAISE EXCEPTION 'FAIL new token %', p; END IF;
  IF (SELECT token_hash FROM public.mt5_accounts WHERE id = (SELECT id FROM _v WHERE k = 'acc_a'))
     IS NOT DISTINCT FROM (SELECT v FROM _s WHERE k = 'hash1') THEN
    RAISE EXCEPTION 'FAIL old token still valid';
  END IF;
  -- user b pairs the same MT5 login: a separate row for b
  p := public.mt5_pair_start(51234567, 'Verify-Server', NULL, NULL, true, NULL, 'verify-ip-2');
  INSERT INTO _s VALUES ('code3', p ->> 'code');
  -- an expired code
  p := public.mt5_pair_start(7777, 'Verify-Server', NULL, NULL, NULL, NULL, 'verify-ip-3');
  INSERT INTO _s VALUES ('code_exp', p ->> 'code'), ('secret_exp', p ->> 'poll_secret');
  UPDATE public.mt5_pairings SET expires_at = now() - INTERVAL '1 second' WHERE code = p ->> 'code' AND status = 'pending';
  IF public.mt5_pair_poll(p ->> 'poll_secret') ->> 'status' <> 'expired' THEN RAISE EXCEPTION 'FAIL expired poll'; END IF;
  RAISE NOTICE 'PASS old token replaced, cursor reset, expiry';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'b'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.claim_mt5_pairing((SELECT v FROM _s WHERE k = 'code_exp'), NULL);
  IF r ->> 'error' IS DISTINCT FROM 'INVALID_CODE' THEN RAISE EXCEPTION 'FAIL expired code claimed %', r; END IF;
  r := public.claim_mt5_pairing((SELECT v FROM _s WHERE k = 'code3'), NULL);
  IF (r ->> 'success')::boolean IS DISTINCT FROM true OR (r ->> 'account_id')::uuid = (SELECT id FROM _v WHERE k = 'acc_a') THEN
    RAISE EXCEPTION 'FAIL b claim %', r;
  END IF;
  INSERT INTO _v VALUES ('acc_b', (r ->> 'account_id')::uuid);
  r := public.get_mt5_status();
  IF jsonb_array_length(r -> 'accounts') <> 1 OR r -> 'accounts' -> 0 -> 'journal_id' <> 'null'::jsonb THEN RAISE EXCEPTION 'FAIL b status %', r; END IF;
  -- b cannot touch a's account
  r := public.link_mt5_account((SELECT id FROM _v WHERE k = 'acc_a'), (SELECT id FROM _v WHERE k = 'jb'));
  IF r ->> 'error' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'FAIL foreign link %', r; END IF;
  r := public.disconnect_mt5_account((SELECT id FROM _v WHERE k = 'acc_a'));
  IF r ->> 'error' IS DISTINCT FROM 'NOT_FOUND' THEN RAISE EXCEPTION 'FAIL foreign disconnect %', r; END IF;
  r := public.link_mt5_account((SELECT id FROM _v WHERE k = 'acc_b'), (SELECT id FROM _v WHERE k = 'ja'));
  IF r ->> 'error' IS DISTINCT FROM 'INVALID_JOURNAL' THEN RAISE EXCEPTION 'FAIL link to foreign journal %', r; END IF;
  r := public.link_mt5_account((SELECT id FROM _v WHERE k = 'acc_b'), (SELECT id FROM _v WHERE k = 'jb'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL own link %', r; END IF;
  RAISE NOTICE 'PASS per-user accounts and link rules';
END $$;

-- direct table access is refused outright
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.mt5_accounts;
    RAISE EXCEPTION 'FAIL authenticated reads mt5_accounts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.mt5_pairings SET status = 'claimed';
    RAISE EXCEPTION 'FAIL authenticated writes mt5_pairings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.mt5_pair_start(1, 'x', NULL, NULL, NULL, NULL, NULL);
    RAISE EXCEPTION 'FAIL authenticated starts pairings';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS tables and service functions closed to the API';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- user a: unlink, re-link, disconnect
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'a'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb;
BEGIN
  r := public.link_mt5_account((SELECT id FROM _v WHERE k = 'acc_a'), NULL);
  IF (r ->> 'success')::boolean IS DISTINCT FROM true OR public.get_mt5_status() -> 'accounts' -> 0 -> 'journal_id' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL unlink %', r;
  END IF;
  r := public.disconnect_mt5_account((SELECT id FROM _v WHERE k = 'acc_a'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM true OR jsonb_array_length(public.get_mt5_status() -> 'accounts') <> 0 THEN
    RAISE EXCEPTION 'FAIL disconnect %', r;
  END IF;
  RAISE NOTICE 'PASS unlink and disconnect';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- attempt limit (user c) and IP limit
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE p jsonb; i int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.mt5_pairings WHERE account_id = (SELECT id FROM _v WHERE k = 'acc_a')) THEN
    RAISE EXCEPTION 'FAIL pairings of a deleted account remain';
  END IF;
  p := public.mt5_pair_start(8888, 'Verify-Server', NULL, NULL, NULL, NULL, 'verify-ip-4');
  INSERT INTO _s VALUES ('code_c', p ->> 'code');
  FOR i IN 1..9 LOOP
    p := public.mt5_pair_start(9000 + i, 'Verify-Server', NULL, NULL, NULL, NULL, 'verify-ip-5');
    IF (p ->> 'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL ip limit too early at %', i; END IF;
  END LOOP;
  p := public.mt5_pair_start(9100, 'Verify-Server', NULL, NULL, NULL, NULL, 'verify-ip-5');
  IF (p ->> 'ok')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL 10th start refused %', p; END IF;
  p := public.mt5_pair_start(9101, 'Verify-Server', NULL, NULL, NULL, NULL, 'verify-ip-5');
  IF p ->> 'error' IS DISTINCT FROM 'RATE_LIMIT' THEN RAISE EXCEPTION 'FAIL 11th start from one IP %', p; END IF;
  -- housekeeping removed the expired code
  IF EXISTS (SELECT 1 FROM public.mt5_pairings WHERE code = (SELECT v FROM _s WHERE k = 'code_exp') AND login = 7777) THEN
    RAISE EXCEPTION 'FAIL expired pairing not cleaned up';
  END IF;
  RAISE NOTICE 'PASS IP limit and cleanup';
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'c'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; i int; good text := (SELECT v FROM _s WHERE k = 'code_c');
BEGIN
  FOR i IN 1..10 LOOP
    r := public.claim_mt5_pairing(CASE WHEN good = '000000' THEN '999999' ELSE '000000' END, NULL);
    IF r ->> 'error' IS DISTINCT FROM 'INVALID_CODE' THEN RAISE EXCEPTION 'FAIL attempt % %', i, r; END IF;
  END LOOP;
  r := public.claim_mt5_pairing(good, NULL);
  IF r ->> 'error' IS DISTINCT FROM 'TOO_MANY_ATTEMPTS' THEN RAISE EXCEPTION 'FAIL attempt limit %', r; END IF;
  RAISE NOTICE 'PASS attempt limit';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- anon refused
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_mt5_pairing('123456', NULL);
    RAISE EXCEPTION 'FAIL anon claim succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.get_mt5_status();
    RAISE EXCEPTION 'FAIL anon status succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS anon refused';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- MT5 trade rows: dedupe per journal, no other unique hit
DO $$
DECLARE n int; uid uuid := (SELECT id FROM _v WHERE k = 'a');
BEGIN
  FOR n IN 1..2 LOOP
    INSERT INTO public.trades (user_id, journal_id, symbol, direction, instrument, lot, entry_price, exit_price, gross_pnl,
                               commission, swap, pnl, trade_date, exit_date, multiplier, platform_source, position_id, import_hash)
    SELECT uid, j, 'EURUSD', 'LONG', 'forex', 0.5, 1.1, 1.101, 50, 3.5, -1.2, 45.3, now(), now(), 100000, 'mt5', NULL,
           'mt5:verify-server:51234567:777'
      FROM (VALUES ((SELECT id FROM _v WHERE k = 'ja')), ((SELECT id FROM _v WHERE k = 'ja2'))) AS t(j)
    ON CONFLICT (user_id, journal_id, import_hash) DO NOTHING;
  END LOOP;
  SELECT count(*) INTO n FROM public.trades WHERE user_id = uid AND import_hash = 'mt5:verify-server:51234567:777';
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL expected one row per journal, got %', n; END IF;
  IF (SELECT pnl FROM public.trades WHERE user_id = uid AND journal_id = (SELECT id FROM _v WHERE k = 'ja') AND import_hash LIKE 'mt5:%') <> 45.3 THEN
    RAISE EXCEPTION 'FAIL pnl from the bridge was recalculated';
  END IF;
  RAISE NOTICE 'PASS trade rows dedupe per journal';
END $$;

ROLLBACK;
