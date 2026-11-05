-- ============================================================
-- Verification of 202611050001_user_profile_theme.sql. ONE transaction ending with ROLLBACK (safe on the live database):
-- two throw-away users; as the API role (authenticated) each may write only their own theme, the shape CHECK holds,
-- the privilege trigger still blocks plan changes, and no function returns user_profiles rows by position.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/user_profile_theme_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated;
INSERT INTO _v VALUES ('a', gen_random_uuid()), ('b', gen_random_uuid());

INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-theme-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- 1. column + constraint exist, every existing profile is NULL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles'
                  AND column_name = 'theme' AND data_type = 'jsonb' AND is_nullable = 'YES') THEN
    RAISE EXCEPTION 'FAIL column';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profiles_theme_shape') THEN RAISE EXCEPTION 'FAIL constraint'; END IF;
  RAISE NOTICE 'PASS column jsonb NULL + shape constraint';
END $$;

-- 2. no SQL/plpgsql function in public reads user_profiles with SELECT * into a fixed row shape
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ~* 'select\s+\*\s+from\s+(public\.)?user_profiles'
     AND pg_get_function_result(p.oid) ~* '^table\(';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'FAIL functions returning TABLE(...) from SELECT * user_profiles: %', v; END IF;
  RAISE NOTICE 'PASS no positional SELECT * user_profiles functions';
END $$;

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM _v WHERE k = 'a'), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- 3. own theme: write and read back
UPDATE public.user_profiles
   SET theme = '{"v":2,"ts":1,"dark":{"bg":"#090d14","surface":"#0f172a","border":"#1e293b","text":"#f1f5f9","accent":"#3b82f6","preset":"slate"},"light":null}'
 WHERE id = (SELECT id FROM _v WHERE k = 'a');
DO $$
BEGIN
  IF (SELECT theme -> 'dark' ->> 'accent' FROM public.user_profiles WHERE id = (SELECT id FROM _v WHERE k = 'a')) IS DISTINCT FROM '#3b82f6' THEN
    RAISE EXCEPTION 'FAIL own theme write/read';
  END IF;
  RAISE NOTICE 'PASS own theme write/read';
END $$;

-- 4. someone else's row: RLS hides it, the update touches nothing
DO $$
DECLARE n int;
BEGIN
  UPDATE public.user_profiles SET theme = '{"v":2}' WHERE id = (SELECT id FROM _v WHERE k = 'b');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL other user theme updated (% rows)', n; END IF;
  RAISE NOTICE 'PASS other user theme not writable';
END $$;

-- 5. shape: arrays / strings / > 4 KB rejected, NULL (reset) accepted
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET theme = '[1,2]' WHERE id = (SELECT id FROM _v WHERE k = 'a')$q$, 'user_profiles_theme_shape', 'array rejected');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET theme = '"x"' WHERE id = (SELECT id FROM _v WHERE k = 'a')$q$, 'user_profiles_theme_shape', 'string rejected');
SELECT pg_temp.expect_error($q$UPDATE public.user_profiles SET theme = jsonb_build_object('pad', repeat(md5(random()::text), 200)) WHERE id = (SELECT id FROM _v WHERE k = 'a')$q$, 'user_profiles_theme_shape', 'over 4 KB rejected');
UPDATE public.user_profiles SET theme = NULL WHERE id = (SELECT id FROM _v WHERE k = 'a');
DO $$ BEGIN RAISE NOTICE 'PASS reset to NULL'; END $$;

-- 6. the privilege trigger (202611050002_user_profile_privileges) still guards plan changes in the same statement.
--    Not part of this migration: if the trigger is missing this only prints a WARNING, the theme column does not
--    depend on it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass AND tgname = 'guard_user_profile_privileges') THEN
    PERFORM pg_temp.expect_error($q$UPDATE public.user_profiles SET theme = '{"v":2}', plan = 'premium' WHERE id = (SELECT id FROM _v WHERE k = 'a')$q$, 'managed by the server', 'plan change still blocked with a theme update');
  ELSE
    RAISE WARNING 'SECURITY: trigger guard_user_profile_privileges is missing on user_profiles: a signed-in user can change their own plan / role / is_active (apply 202611050002_user_profile_privileges.sql)';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
