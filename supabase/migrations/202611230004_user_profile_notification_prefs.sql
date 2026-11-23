-- ============================================================
-- WAWE JOURNAL - NOTIFICATION PREFERENCES ON THE ACCOUNT
-- Migration: 202611230004_user_profile_notification_prefs.sql
-- Description:
--   public.user_profiles.notification_prefs jsonb NULL: which notification categories the bell shows, so the choice is
--   the same on every device. Written by public/components/navbar/navbar.js (bell > gear) with the existing own-row
--   UPDATE policy; guard_user_profile_privileges() (202611050002) does not restrict it.
--   Shape: { v: 1, ts, risk: bool, coach: bool, partner: bool, system: bool }. A missing key = on.
--   Account & payment notifications are always shown; live AI coach alerts keep using coach_settings.alerts_enabled
--   (the server then stops creating them).
--   CHECK: a JSON object of at most 2 KB, so the column cannot be used as free storage.
--   NULL for every existing user (= everything on): nothing changes until someone turns a category off.
--   The client tolerates the column being absent (select error -> this browser only), so the front end can ship first.
-- Run order: after 202611230003. Rollback: supabase/rollbacks/202611230004_user_profile_notification_prefs.down.sql
-- Verify: supabase/tests/user_profile_notification_prefs_verify.sql (read-only)
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
              WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'notification_prefs') THEN
    RAISE EXCEPTION 'ORDER: user_profiles.notification_prefs already exists (this migration was already applied).';
  END IF;
END $$;

-- no default: metadata-only change, no table rewrite
ALTER TABLE public.user_profiles ADD COLUMN notification_prefs jsonb;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_notification_prefs_shape
  CHECK (notification_prefs IS NULL OR (jsonb_typeof(notification_prefs) = 'object' AND pg_column_size(notification_prefs) <= 2048));

COMMENT ON COLUMN public.user_profiles.notification_prefs IS
  'Bell notification categories on/off ({v,ts,risk,coach,partner,system}; missing key = on). NULL = all on. Max 2 KB JSON object.';

-- PostgREST: make the new column visible to the API right away
NOTIFY pgrst, 'reload schema';

COMMIT;
