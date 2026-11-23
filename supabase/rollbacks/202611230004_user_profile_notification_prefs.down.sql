-- Rollback of 202611230004_user_profile_notification_prefs.sql. The bell falls back to this browser's copy when the column is gone.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_notification_prefs_shape;
ALTER TABLE public.user_profiles DROP COLUMN IF EXISTS notification_prefs;
NOTIFY pgrst, 'reload schema';
COMMIT;
