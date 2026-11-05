-- ============================================================
-- ROLLBACK of 202611050002_user_profile_privileges.sql
-- WARNING: this RE-OPENS the holes (self-service plan / role changes, user_metadata "admin").
-- Only for an emergency where the trigger blocks a legitimate flow; fix forward instead when possible.
-- Restores the live state of 2026-11-05: no trigger on user_profiles, the four policies on user_metadata.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass AND tgname = 'guard_user_profile_privileges') THEN
    RAISE EXCEPTION 'ORDER: trigger guard_user_profile_privileges not found (migration 202611050002 is not applied).';
  END IF;
END $$;

DROP TRIGGER guard_user_profile_privileges ON public.user_profiles;
DROP FUNCTION public.guard_user_profile_privileges();

ALTER POLICY admin_select_profiles ON public.user_profiles
  USING (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

ALTER POLICY admin_all_references ON public."references"
  USING (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text)
  -- the live policy had no WITH CHECK (USING was used for new rows too): same expression = same behaviour
  WITH CHECK (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text);

DO $$
BEGIN
  ALTER POLICY "Admin resim yükleyebilir" ON storage.objects
    WITH CHECK ((bucket_id = 'references-images'::text) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text));
  ALTER POLICY "Admin resim silebilir" ON storage.objects
    USING ((bucket_id = 'references-images'::text) AND (((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = 'admin'::text));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'SKIPPED storage.objects: %', SQLERRM;
END $$;

COMMIT;
