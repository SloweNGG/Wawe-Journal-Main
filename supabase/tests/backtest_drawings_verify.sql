-- ============================================================
-- Verification of 202610240001_backtest_drawings.sql. Runs in ONE transaction and ends with ROLLBACK: it creates two
-- throw-away users (auth.users -> handle_new_user creates their profiles), a backtest account and drawings, checks the
-- rules as the API role `authenticated` with JWT claims, and leaves nothing behind. Safe on the live database.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/backtest_drawings_verify.sql   (every check prints PASS; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('a', gen_random_uuid()), ('b', gen_random_uuid()), ('acc', gen_random_uuid()), ('accb', gen_random_uuid()), ('d1', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-' || k || '-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k IN ('a', 'b');
UPDATE public.user_profiles SET plan = 'free', plan_expires_at = NULL WHERE id IN (SELECT id FROM _v WHERE k IN ('a', 'b'));
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time)
SELECT (SELECT id FROM _v WHERE k = 'acc'), (SELECT id FROM _v WHERE k = 'a'), 'verify', 'EURUSD', '1h', 10000, now();
INSERT INTO public.backtest_accounts (id, user_id, name, symbol, timeframe, starting_balance, replay_time)
SELECT (SELECT id FROM _v WHERE k = 'accb'), (SELECT id FROM _v WHERE k = 'b'), 'verify b', 'EURUSD', '1h', 10000, now();

CREATE OR REPLACE FUNCTION pg_temp.as_user(k text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE _v.k = as_user.k), 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', (SELECT id FROM _v WHERE _v.k = as_user.k)::text, true);
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- 1. free plan cannot write drawings
SELECT pg_temp.as_user('a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (id, user_id, backtest_account_id, tool, points) VALUES (%L, %L, %L, 'trend', '[{"t":1,"p":1.1},{"t":2,"p":1.2}]')$q$,
  (SELECT id FROM _v WHERE k = 'd1'), (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc')), 'BACKTEST_DRAWINGS_PREMIUM', 'free plan: insert refused');
RESET ROLE;

-- 2. premium writes, updates, reads; immutables, ownership, account of another user
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '30 days' WHERE id = (SELECT id FROM _v WHERE k = 'a');
SELECT pg_temp.as_user('a');
SET LOCAL ROLE authenticated;
INSERT INTO public.backtest_drawings (id, user_id, backtest_account_id, tool, points, style)
SELECT (SELECT id FROM _v WHERE k = 'd1'), (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc'), 'long',
       '[{"t":1,"p":1.1},{"t":5,"p":1.2},{"t":5,"p":1.05}]', '{"color":"#22c55e","locked":false}';
DO $$ BEGIN IF (SELECT count(*) FROM public.backtest_drawings) <> 1 THEN RAISE EXCEPTION 'FAIL premium insert'; END IF; RAISE NOTICE 'PASS premium: insert and read own drawing'; END $$;
UPDATE public.backtest_drawings SET style = '{"color":"#ef4444","locked":true}' WHERE id = (SELECT id FROM _v WHERE k = 'd1');
DO $$ BEGIN IF (SELECT style->>'color' FROM public.backtest_drawings) <> '#ef4444' THEN RAISE EXCEPTION 'FAIL premium update'; END IF; RAISE NOTICE 'PASS premium: update'; END $$;
SELECT pg_temp.expect_error(format($q$UPDATE public.backtest_drawings SET backtest_account_id = %L WHERE id = %L$q$, (SELECT id FROM _v WHERE k = 'accb'), (SELECT id FROM _v WHERE k = 'd1')),
  'BACKTEST_DRAWING_IMMUTABLE', 'account of a drawing cannot change');
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points) VALUES (%L, %L, 'hline', '[{"t":1,"p":1.1}]')$q$,
  (SELECT id FROM _v WHERE k = 'b'), (SELECT id FROM _v WHERE k = 'accb')), 'BACKTEST_NOT_OWNER', 'a row for another user is refused before RLS');
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points) VALUES (%L, %L, 'hline', '[{"t":1,"p":1.1}]')$q$,
  (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'accb')), 'INVALID_BACKTEST_ACCOUNT', 'another user''s account is refused');
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points) VALUES (%L, %L, 'circle', '[{"t":1,"p":1.1}]')$q$,
  (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc')), 'chk_backtest_drawings_tool', 'unknown tool refused');
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points, style) VALUES (%L, %L, 'text', '[{"t":1,"p":1.1}]', jsonb_build_object('text', repeat('x', 201)))$q$,
  (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc')), 'chk_backtest_drawings_style', 'text longer than 200 refused');
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points) VALUES (%L, %L, 'trend', '[1,2,3,4]')$q$,
  (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc')), 'chk_backtest_drawings_points', 'more than 3 points refused');
RESET ROLE;

-- 3. user b sees nothing of user a
SELECT pg_temp.as_user('b');
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM public.backtest_drawings) <> 0 THEN RAISE EXCEPTION 'FAIL RLS select'; END IF; RAISE NOTICE 'PASS RLS: another user reads no drawings'; END $$;
DELETE FROM public.backtest_drawings;   -- RLS: deletes nothing of user a
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.backtest_drawings) <> 1 THEN RAISE EXCEPTION 'FAIL RLS delete'; END IF; RAISE NOTICE 'PASS RLS: another user deletes nothing'; END $$;

-- 4. 500 per account
SELECT pg_temp.as_user('a');
SET LOCAL ROLE authenticated;
INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points)
SELECT (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc'), 'hline', jsonb_build_array(jsonb_build_object('t', g, 'p', 1.1)) FROM generate_series(1, 499) g;
SELECT pg_temp.expect_error(format($q$INSERT INTO public.backtest_drawings (user_id, backtest_account_id, tool, points) VALUES (%L, %L, 'hline', '[{"t":1,"p":1.1}]')$q$,
  (SELECT id FROM _v WHERE k = 'a'), (SELECT id FROM _v WHERE k = 'acc')), 'BACKTEST_DRAWINGS_LIMIT', 'the 501st drawing of an account is refused');
RESET ROLE;

-- 5. lapsed premium: no writes, delete still works; account deletion cascades
UPDATE public.user_profiles SET plan_expires_at = now() - interval '1 day' WHERE id = (SELECT id FROM _v WHERE k = 'a');
SELECT pg_temp.as_user('a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(format($q$UPDATE public.backtest_drawings SET style = '{}' WHERE id = %L$q$, (SELECT id FROM _v WHERE k = 'd1')), 'BACKTEST_DRAWINGS_PREMIUM', 'lapsed premium: update refused');
DELETE FROM public.backtest_drawings WHERE id = (SELECT id FROM _v WHERE k = 'd1');
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.backtest_drawings WHERE id = (SELECT id FROM _v WHERE k = 'd1')) THEN RAISE EXCEPTION 'FAIL delete'; END IF; RAISE NOTICE 'PASS lapsed premium: delete allowed'; END $$;
RESET ROLE;
DELETE FROM public.backtest_accounts WHERE id = (SELECT id FROM _v WHERE k = 'acc');
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.backtest_drawings WHERE backtest_account_id = (SELECT id FROM _v WHERE k = 'acc')) THEN RAISE EXCEPTION 'FAIL cascade'; END IF; RAISE NOTICE 'PASS account deletion removes its drawings'; END $$;

ROLLBACK;
