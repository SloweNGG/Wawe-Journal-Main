-- ============================================================
-- ROLLBACK of 202611050001_user_profile_theme.sql: drops user_profiles.theme.
-- DATA LOSS GUARD: refuses to run while any user has a saved theme (their account copy would be lost; the copy in
-- their browser stays). To accept that loss run  SET wawe.allow_theme_loss = 'on';  in the same session first.
-- The client tolerates the missing column (no sync, local themes keep working).
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'theme') THEN
    RAISE EXCEPTION 'ORDER: user_profiles.theme not found (migration 202611050001 is not applied).';
  END IF;
  SELECT count(*) INTO v_n FROM public.user_profiles WHERE theme IS NOT NULL;
  IF v_n > 0 AND coalesce(current_setting('wawe.allow_theme_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATA LOSS: % user(s) have a saved theme; SET wawe.allow_theme_loss = ''on'' to drop it anyway.', v_n;
  END IF;
END $$;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_theme_shape;
ALTER TABLE public.user_profiles DROP COLUMN theme;

NOTIFY pgrst, 'reload schema';

COMMIT;
