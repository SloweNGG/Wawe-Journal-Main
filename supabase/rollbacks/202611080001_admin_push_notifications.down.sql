-- ============================================================
-- ROLLBACK of 202611080001_admin_push_notifications.sql
-- Drops the three triggers, public.admin_push_enqueue(), public.admin_push_subscriptions (registered admin devices)
-- and public.admin_push_events. user_profiles, bug_reports and payout_requests are otherwise untouched.
-- The pg_net extension is left installed on purpose (other features may use it); drop it by hand only if nothing does.
-- Effect: no more phone notifications for new members, reports and payout requests (Pro sale pushes from the payment
-- webhooks simply find no device and send nothing). Devices must be registered again if the migration is re-applied.
-- How to run: SQL Editor (or psql -v ON_ERROR_STOP=1), the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DROP TRIGGER IF EXISTS admin_push_signup ON public.user_profiles;
DROP TRIGGER IF EXISTS admin_push_report ON public.bug_reports;
DROP TRIGGER IF EXISTS admin_push_payout ON public.payout_requests;

DROP FUNCTION IF EXISTS public.admin_push_enqueue();

DROP TABLE IF EXISTS public.admin_push_subscriptions;
DROP TABLE IF EXISTS public.admin_push_events;

COMMIT;
