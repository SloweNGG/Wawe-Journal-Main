-- Rollback of 202611140001_coach_settings.sql (drops the members' coach settings: alerts on/off, time zone, trading plan).
BEGIN;
DROP TABLE IF EXISTS public.coach_settings;
DROP FUNCTION IF EXISTS public.coach_settings_touch();
DROP INDEX IF EXISTS public.idx_notifications_user_created;
COMMIT;
