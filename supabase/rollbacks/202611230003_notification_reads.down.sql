-- Rollback of 202611230003_notification_reads.sql. The front end falls back to localStorage when the table is gone.
BEGIN;
SET LOCAL lock_timeout = '10s';
DROP TABLE IF EXISTS public.notification_reads;
DROP FUNCTION IF EXISTS public.notification_reads_limit();
NOTIFY pgrst, 'reload schema';
COMMIT;
