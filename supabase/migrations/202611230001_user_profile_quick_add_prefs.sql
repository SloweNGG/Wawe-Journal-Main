-- ============================================================
-- WAWE JOURNAL - QUICK ADD PREFERENCES ON THE ACCOUNT
-- Migration: 202611230001_user_profile_quick_add_prefs.sql
-- Description:
--   public.user_profiles.quick_add_prefs jsonb NULL: the trader's own symbols ("My symbols") and the
--   instrument / multiplier last used per symbol in the Quick Add window, so they are the same on every device.
--   Written by the client (public/interface/quick-add/js/quick-add.js) with the existing own-row UPDATE policy
--   (live: update_own_profile, auth.uid() = id); guard_user_profile_privileges() (202611050002) does not
--   restrict it.
--   Shape: { v: 1, ts, symbols: ["USOIL", ...] (<= 30), instruments: { "USOIL": { i: "other", m: 1000 }, ... } }.
--   CHECK: a JSON object of at most 8 KB (a full value is ~3 KB), so the column cannot be used as free storage.
--   NULL for every existing user: nothing changes until someone adds a symbol.
--   The client tolerates the column being absent (select error -> local only), so the front end can ship first.
-- Run order: after 202611170002. Rollback: supabase/rollbacks/202611230001_user_profile_quick_add_prefs.down.sql
-- Verify: supabase/tests/user_profile_quick_add_prefs_verify.sql (read-only)
-- How to run: the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.user_profiles not found.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'quick_add_prefs') THEN
    RAISE EXCEPTION 'ORDER: user_profiles.quick_add_prefs already exists (this migration was already applied).';
  END IF;
END $$;

-- no default: metadata-only change, no table rewrite
ALTER TABLE public.user_profiles ADD COLUMN quick_add_prefs jsonb;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_quick_add_prefs_shape
  CHECK (quick_add_prefs IS NULL OR (jsonb_typeof(quick_add_prefs) = 'object' AND pg_column_size(quick_add_prefs) <= 8192));

COMMENT ON COLUMN public.user_profiles.quick_add_prefs IS
  'Quick Add window preferences (own symbols, instrument per symbol). NULL = none saved. Max 8 KB JSON object.';

-- PostgREST: make the new column visible to the API right away
NOTIFY pgrst, 'reload schema';

COMMIT;
