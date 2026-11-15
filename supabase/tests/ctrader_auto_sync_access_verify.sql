-- ============================================================
-- Verification of 202611090001_ctrader_auto_sync_access.sql. ONE transaction ending with ROLLBACK (safe on the live
-- database): two throw-away users with journals and cTrader account rows; as the API role (authenticated) each user may
-- switch auto sync only on their own accounts, a revoked account cannot be linked, re-linking the same account keeps its
-- sync cursor, the table stays closed to direct writes, anon cannot call the new RPC.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/ctrader_auto_sync_access_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated, anon;
INSERT INTO _v VALUES ('a', gen_random_uuid()), ('b', gen_random_uuid()),
                      ('ja', gen_random_uuid()), ('ja2', gen_random_uuid()), ('jb', gen_random_uuid()),
                      ('ca', gen_random_uuid()), ('cr', gen_random_uuid()), ('cb', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-ct-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k IN ('a', 'b');

INSERT INTO public.journals (id, user_id, name, is_active)
SELECT (SELECT id FROM _v WHERE k = j), (SELECT id FROM _v WHERE k = u), 'verify ' || j, true
  FROM (VALUES ('ja', 'a'), ('ja2', 'a'), ('jb', 'b')) AS t(j, u);

-- a: one healthy account linked to ja with a cursor, one revoked account; b: one account
INSERT INTO public.ctrader_accounts (id, user_id, ctid_trader_account_id, journal_id, last_deal_timestamp, access_revoked_at)
VALUES ((SELECT id FROM _v WHERE k = 'ca'), (SELECT id FROM _v WHERE k = 'a'), 990000001, (SELECT id FROM _v WHERE k = 'ja'), 1790000000000, NULL),
       ((SELECT id FROM _v WHERE k = 'cr'), (SELECT id FROM _v WHERE k = 'a'), 990000002, NULL, NULL, now()),
       ((SELECT id FROM _v WHERE k = 'cb'), (SELECT id FROM _v WHERE k = 'b'), 990000003, NULL, NULL, NULL);

-- 1. columns, defaults, grants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ctrader_accounts'
                  AND column_name = 'auto_sync' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION 'FAIL auto_sync column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ctrader_accounts'
                  AND column_name = 'access_revoked_at' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'FAIL access_revoked_at column';
  END IF;
  IF (SELECT count(*) FROM public.ctrader_accounts WHERE auto_sync) <> 0 THEN RAISE EXCEPTION 'FAIL existing rows must start with auto_sync off'; END IF;
  IF EXISTS (SELECT 1 FROM public.ctrader_accounts WHERE access_revoked_at IS NULL AND last_error ILIKE 'Unable to find cTID trader account%') THEN
    RAISE EXCEPTION 'FAIL an account with the "not found" error is not marked revoked';
  END IF;
  IF has_function_privilege('anon', 'public.set_ctrader_auto_sync(uuid, boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'FAIL anon may execute set_ctrader_auto_sync'; END IF;
  IF NOT has_function_privilege('authenticated', 'public.set_ctrader_auto_sync(uuid, boolean)', 'EXECUTE') THEN RAISE EXCEPTION 'FAIL authenticated cannot execute set_ctrader_auto_sync'; END IF;
  RAISE NOTICE 'PASS columns, defaults, grants';
END $$;

-- ---------------------------------------------------------------- as user a
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'a'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 2. status carries the new fields
DO $$
DECLARE s jsonb; acc jsonb;
BEGIN
  s := public.get_ctrader_status();
  IF jsonb_array_length(s -> 'accounts') <> 2 THEN RAISE EXCEPTION 'FAIL a sees % accounts', jsonb_array_length(s -> 'accounts'); END IF;
  SELECT x INTO acc FROM jsonb_array_elements(s -> 'accounts') x WHERE (x ->> 'ctid_trader_account_id')::bigint = 990000002;
  IF (acc ->> 'access_revoked')::boolean IS DISTINCT FROM true OR acc -> 'access_revoked_at' = 'null'::jsonb THEN RAISE EXCEPTION 'FAIL revoked flag %', acc; END IF;
  IF (acc ->> 'auto_sync')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL auto_sync default in status'; END IF;
  SELECT x INTO acc FROM jsonb_array_elements(s -> 'accounts') x WHERE (x ->> 'ctid_trader_account_id')::bigint = 990000001;
  IF (acc ->> 'access_revoked')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL healthy account marked revoked'; END IF;
  IF acc ->> 'balance_updated_at' IS NOT NULL OR NOT (acc ? 'balance_updated_at') THEN RAISE EXCEPTION 'FAIL older fields missing'; END IF;
  RAISE NOTICE 'PASS get_ctrader_status fields';
END $$;

-- 3. own auto sync on/off; other user's account and NULL refused
DO $$
DECLARE r jsonb;
BEGIN
  r := public.set_ctrader_auto_sync((SELECT id FROM _v WHERE k = 'ca'), true);
  IF (r ->> 'success')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL own enable %', r; END IF;
  IF (SELECT (x ->> 'auto_sync')::boolean FROM jsonb_array_elements(public.get_ctrader_status() -> 'accounts') x
       WHERE (x ->> 'ctid_trader_account_id')::bigint = 990000001) IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL enable not visible'; END IF;
  r := public.set_ctrader_auto_sync((SELECT id FROM _v WHERE k = 'cb'), true);
  IF (r ->> 'success')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL foreign enable allowed %', r; END IF;
  r := public.set_ctrader_auto_sync((SELECT id FROM _v WHERE k = 'ca'), NULL);
  IF (r ->> 'success')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL NULL accepted'; END IF;
  RAISE NOTICE 'PASS set_ctrader_auto_sync own only';
END $$;

-- 4. revoked account cannot be linked; healthy re-link keeps the cursor; switching journals frees the old one
DO $$
DECLARE r jsonb;
BEGIN
  r := public.link_ctrader_account((SELECT id FROM _v WHERE k = 'cr'), (SELECT id FROM _v WHERE k = 'ja2'));
  IF r ->> 'code' IS DISTINCT FROM 'ACCESS_REVOKED' THEN RAISE EXCEPTION 'FAIL revoked link %', r; END IF;
  r := public.link_ctrader_account((SELECT id FROM _v WHERE k = 'cb'), (SELECT id FROM _v WHERE k = 'ja2'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL foreign account linked'; END IF;
  r := public.link_ctrader_account((SELECT id FROM _v WHERE k = 'ca'), (SELECT id FROM _v WHERE k = 'jb'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'FAIL foreign journal linked'; END IF;
  r := public.link_ctrader_account((SELECT id FROM _v WHERE k = 'ca'), (SELECT id FROM _v WHERE k = 'ja'));
  IF (r ->> 'success')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL re-link %', r; END IF;
  RAISE NOTICE 'PASS link rules (revoked, foreign account, foreign journal, re-link)';
END $$;

-- 5. direct table access stays closed
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.ctrader_accounts;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL authenticated reads % ctrader_accounts rows', n; END IF;
  UPDATE public.ctrader_accounts SET auto_sync = true, access_revoked_at = NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL authenticated updated % rows directly', n; END IF;
  RAISE NOTICE 'PASS no direct table access';
END $$;

RESET ROLE;

-- 6. checks as owner: cursor kept on re-link, revoked row untouched, b untouched
DO $$
BEGIN
  IF (SELECT last_deal_timestamp FROM public.ctrader_accounts WHERE id = (SELECT id FROM _v WHERE k = 'ca')) IS DISTINCT FROM 1790000000000 THEN
    RAISE EXCEPTION 'FAIL re-linking the same journal reset the sync cursor';
  END IF;
  IF (SELECT journal_id FROM public.ctrader_accounts WHERE id = (SELECT id FROM _v WHERE k = 'cr')) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL revoked account got a journal';
  END IF;
  IF (SELECT auto_sync FROM public.ctrader_accounts WHERE id = (SELECT id FROM _v WHERE k = 'cb')) THEN
    RAISE EXCEPTION 'FAIL b auto_sync changed by a';
  END IF;
  RAISE NOTICE 'PASS owner-side state';
END $$;

-- 7. anon cannot call the RPC
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.set_ctrader_auto_sync(gen_random_uuid(), true);
    RAISE EXCEPTION 'FAIL anon call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon refused';
  END;
END $$;
RESET ROLE;

ROLLBACK;
