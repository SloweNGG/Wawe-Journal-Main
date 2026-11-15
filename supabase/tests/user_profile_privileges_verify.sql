-- ============================================================
-- Verification of 202611050002_user_profile_privileges.sql. ONE transaction ending with ROLLBACK (safe on the live
-- database). Throw-away users: u (normal), f (fake admin: role only in user_metadata), a (real admin: app_metadata).
-- Every check runs as the API role (SET ROLE authenticated + request.jwt.claims), like a browser request.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/user_profile_privileges_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid, email text) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated, service_role;
INSERT INTO _v VALUES ('u', gen_random_uuid()), ('f', gen_random_uuid()), ('a', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-priv-' || k || '-' || id || '@example.invalid',
       CASE WHEN k = 'a' THEN '{"role":"admin"}'::jsonb ELSE '{}'::jsonb END,
       jsonb_build_object('username', 'verify_' || replace(id::text, '-', ''), 'role', CASE WHEN k = 'f' THEN 'admin' ELSE 'user' END),
       now(), now()
  FROM _v;
UPDATE _v SET email = u.email FROM auth.users u WHERE u.id = _v.id;   -- the API role cannot read auth.users
-- handle_new_user may or may not exist on this database: make sure every test user has a profile row
INSERT INTO public.user_profiles (id, email, username, plan, role, is_active)
SELECT v.id, u.email, 'verify_' || v.k, 'free', 'user', true FROM _v v JOIN auth.users u ON u.id = v.id
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', what; END IF;
  RAISE NOTICE 'PASS %', what;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(k text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE u auth.users;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = (SELECT id FROM _v WHERE _v.k = as_user.k);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated', 'email', u.email,
    'app_metadata', u.raw_app_meta_data, 'user_metadata', u.raw_user_meta_data)::text, true);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, service_role;

SELECT pg_temp.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass AND tgname = 'guard_user_profile_privileges'), 'trigger installed');

-- ---------- normal user ----------
SELECT pg_temp.as_user('u');
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET plan = 'premium' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'self upgrade to premium blocked');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET plan_expires_at = now() + interval '10 years' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'plan_expires_at blocked');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET role = 'admin' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'self role admin blocked');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET is_active = false WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'is_active blocked (RPC only)');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET max_journals = 999 WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'max_journals blocked');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET created_at = now() - interval '5 years' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'managed by the server', 'created_at blocked');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET email = 'someone-else@example.invalid' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$, 'email must match', 'email of another account blocked');
-- what the app does (settings, onboarding, last-active, payout fallback) still works
UPDATE public.user_profiles
   SET username = 'verify_renamed', avatar_url = 'https://example.invalid/a.png', last_active = now(),
       email = (SELECT email FROM _v WHERE k = 'u'),
       onboarding_completed = true, onboarding_tour_completed = true, preferred_currency = 'EUR',
       btc_payout_address = 'bc1qverify', ltc_payout_address = 'ltc1qverify'
 WHERE id = (SELECT id FROM _v WHERE k = 'u');
SELECT pg_temp.ok((SELECT username = 'verify_renamed' AND preferred_currency = 'EUR' FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u')), 'normal profile fields still editable');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'theme') THEN
    EXECUTE $q$UPDATE public.user_profiles SET theme = '{"v":2}' WHERE id = (SELECT id FROM _v WHERE k = 'u')$q$;
    RAISE NOTICE 'PASS theme editable';
  END IF;
END $$;
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.user_profiles), 'normal user sees only their own profile');
-- deactivate_own_account is a SECURITY DEFINER RPC: it must still work
SELECT public.deactivate_own_account();
RESET ROLE;
SELECT pg_temp.ok((SELECT is_active = false FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u')), 'deactivate_own_account RPC still works');
SELECT pg_temp.ok((SELECT plan = 'free' AND role = 'user' FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u')), 'plan and role unchanged');

-- INSERT through the API: privileged fields forced to the safe defaults
DELETE FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u');
SELECT pg_temp.as_user('u');
SET LOCAL ROLE authenticated;
INSERT INTO public.user_profiles (id, email, username, plan, plan_expires_at, role, is_active, max_journals)
VALUES ((SELECT id FROM _v WHERE k = 'u'), NULL, 'verify_ins', 'premium', now() + interval '10 years', 'admin', true, 999);
RESET ROLE;
SELECT pg_temp.ok((SELECT plan = 'free' AND plan_expires_at IS NULL AND role = 'user' AND max_journals = 2
                     FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u')), 'API insert cannot create a premium / admin profile');

-- ---------- fake admin (role only in user_metadata) ----------
SELECT pg_temp.as_user('f');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.user_profiles), 'user_metadata admin cannot read other profiles');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET plan = 'premium' WHERE id = (SELECT id FROM _v WHERE k = 'f')$q$, 'managed by the server', 'user_metadata admin cannot upgrade');
SELECT pg_temp.expect_error($q$INSERT INTO public."references" DEFAULT VALUES$q$, 'row-level security', 'user_metadata admin cannot write references');
RESET ROLE;

-- ---------- real admin (app_metadata) ----------
SELECT pg_temp.as_user('a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT count(*) >= 3 FROM public.user_profiles), 'app_metadata admin reads all profiles');
-- the trigger lets an admin through (the admin panel changes other users via RPCs; RLS has no admin UPDATE policy)
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '30 days', max_journals = 5
 WHERE id = (SELECT id FROM _v WHERE k = 'a');
RESET ROLE;
SELECT pg_temp.ok((SELECT plan = 'premium' AND max_journals = 5 FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'a')), 'app_metadata admin passes the trigger');

-- ---------- server roles unaffected ----------
SET LOCAL ROLE service_role;
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '30 days' WHERE id = (SELECT id FROM _v WHERE k = 'u');
RESET ROLE;
SELECT pg_temp.ok((SELECT plan = 'premium' FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'u')), 'service_role (webhooks) can still change plans');

-- ---------- no public policy trusts user_metadata ----------
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname IN ('public', 'storage')
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%user_metadata%'),
  'no public / storage policy trusts user_metadata');

ROLLBACK;
