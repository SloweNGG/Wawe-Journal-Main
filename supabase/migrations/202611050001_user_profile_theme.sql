-- ============================================================
-- WAWE JOURNAL - THEME STUDIO SETTINGS ON THE ACCOUNT
-- Migration: 202611050001_user_profile_theme.sql
-- Description:
--   public.user_profiles.theme jsonb NULL: the Theme studio palette (Settings > Appearance), so a user's theme
--   is the same on every device. Written by the client (theme engine, src/scripts/theme-engine.js) with the
--   existing own-row UPDATE policy (live: update_own_profile); guard_user_profile_privileges() (202611050002)
--   does not restrict it.
--   Shape: { v: 2, ts, dark: {bg,surface,border,text,accent,preset}|null, light: {...}|null, fontSize?, + legacy keys }.
--   CHECK: a JSON object of at most 4 KB (a real value is ~0.5 KB), so the column cannot be used as free storage.
--   NULL for every existing user: nothing changes until someone saves a theme.
--   The client tolerates the column being absent (select error -> no sync), so the front end can ship first.
-- Run order: after 202610310002. Rollback: supabase/rollbacks/202611050001_user_profile_theme.down.sql
-- Verify: supabase/tests/user_profile_theme_verify.sql (one transaction, ends with ROLLBACK)
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.user_profiles not found.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'theme') THEN
    RAISE EXCEPTION 'ORDER: user_profiles.theme already exists (this migration was already applied).';
  END IF;
END $$;

-- no default: metadata-only change, no table rewrite
ALTER TABLE public.user_profiles ADD COLUMN theme jsonb;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_theme_shape
  CHECK (theme IS NULL OR (jsonb_typeof(theme) = 'object' AND pg_column_size(theme) <= 4096));

COMMENT ON COLUMN public.user_profiles.theme IS
  'Theme studio palette (client theme engine v2). NULL = site default. Max 4 KB JSON object.';

-- PostgREST: make the new column visible to the API right away
NOTIFY pgrst, 'reload schema';

COMMIT;
