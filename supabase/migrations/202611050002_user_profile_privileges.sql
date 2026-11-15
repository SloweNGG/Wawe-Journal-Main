-- ============================================================
-- WAWE JOURNAL - CLOSE THE PROFILE PRIVILEGE HOLES (live, found 2026-11-05)
-- Migration: 202611050002_user_profile_privileges.sql
-- Problem on the live database (202608190001_security_baseline.sql was never applied there):
--   1. public.user_profiles had no trigger: a signed-in user could PATCH their own row through the API and set
--      plan = 'premium', plan_expires_at, role, is_active or max_journals (free Pro, raised limits).
--   2. Four policies trusted auth.jwt() -> user_metadata ->> 'role'. user_metadata is writable by the user
--      (supabase.auth.updateUser({ data: { role: 'admin' } })), so anyone could:
--        user_profiles.admin_select_profiles  -> read every profile (emails, plans, payout addresses)
--        references.admin_all_references       -> insert / update / delete references
--        storage.objects "Admin resim yükleyebilir" / "Admin resim silebilir" -> upload / delete in references-images
-- Fix:
--   1. guard_user_profile_privileges() BEFORE INSERT OR UPDATE on user_profiles. Restricts only requests made
--      directly by the API roles (current_user authenticated / anon) of a non-admin:
--        UPDATE: plan, plan_expires_at, role, is_active, max_journals, id, created_at may not change;
--                email may only be set to the signed-in account's email (auth.jwt() ->> 'email').
--        INSERT: those fields are forced to the safe defaults (free, user, active, 2 journals).
--      SECURITY DEFINER functions (deactivate_own_account, process_payment_finished, save_payout_addresses,
--      complete_user_onboarding, submit_payout_request) run as their owner and are not affected; neither are
--      service_role (Edge Functions, webhooks), postgres and supabase_auth_admin (handle_new_user on sign-up).
--      Admins are public.is_admin() = auth.jwt() -> app_metadata ->> 'role' = 'admin' (server-only metadata).
--   2. The four policies use public.is_admin() instead of user_metadata. The live admin account has the role in
--      both metadata objects (checked 2026-11-05), so the admin panel keeps working.
--      storage.objects belongs to supabase_storage_admin: if this role may not change its policies, that part is
--      skipped with a WARNING (the rest still applies) and must be done in the dashboard (see the WARNING text).
-- No data changes. Independent of 202611050001 (theme column).
-- Rollback: supabase/rollbacks/202611050002_user_profile_privileges.down.sql (re-opens the holes)
-- Verify:   supabase/tests/user_profile_privileges_verify.sql (one transaction, ends with ROLLBACK)
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.user_profiles not found.';
  END IF;
  IF to_regproc('public.is_admin') IS NULL
     OR (SELECT prosrc FROM pg_proc WHERE oid = to_regproc('public.is_admin')) NOT ILIKE '%app_metadata%' THEN
    RAISE EXCEPTION 'PRECONDITION: public.is_admin() must read app_metadata (it is what the new checks trust).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass AND tgname = 'guard_user_profile_privileges') THEN
    RAISE EXCEPTION 'ORDER: trigger guard_user_profile_privileges already exists (this migration was already applied).';
  END IF;
END $$;

-- 1. Trigger -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- only direct API requests are restricted (see the header); admins (app_metadata) may change anything
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan := 'free';
    NEW.plan_expires_at := NULL;
    NEW.role := 'user';
    NEW.is_active := true;
    NEW.max_journals := 2;
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.max_journals IS DISTINCT FROM OLD.max_journals
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'user_profiles: plan, role, account status and limits are managed by the server'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS DISTINCT FROM (auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'user_profiles: email must match the signed-in account' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_user_profile_privileges() FROM PUBLIC;

CREATE TRIGGER guard_user_profile_privileges
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_privileges();

-- 2. Policies that trusted user_metadata ----------------------------------------------------------
ALTER POLICY admin_select_profiles ON public.user_profiles
  USING (public.is_admin());

ALTER POLICY admin_all_references ON public."references"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$
BEGIN
  ALTER POLICY "Admin resim yükleyebilir" ON storage.objects
    WITH CHECK (bucket_id = 'references-images' AND public.is_admin());
  ALTER POLICY "Admin resim silebilir" ON storage.objects
    USING (bucket_id = 'references-images' AND public.is_admin());
  RAISE NOTICE 'storage.objects policies updated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'SKIPPED storage.objects (%): in Supabase Dashboard > Storage > Policies replace (auth.jwt() -> ''user_metadata'' ->> ''role'') = ''admin'' with public.is_admin() in "Admin resim yükleyebilir" and "Admin resim silebilir".', SQLERRM;
END $$;

-- nothing may still trust user_metadata for authorisation
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(c.relname || '.' || p.polname, ', ') INTO v
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%user_metadata%';
  IF v IS NOT NULL THEN RAISE EXCEPTION 'public policies still using user_metadata: %', v; END IF;
END $$;

COMMIT;
