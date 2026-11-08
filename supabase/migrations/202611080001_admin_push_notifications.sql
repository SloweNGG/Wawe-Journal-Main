-- ============================================================
-- WAWE JOURNAL - ADMIN PHONE NOTIFICATIONS (WEB PUSH)
-- Migration: 202611080001_admin_push_notifications.sql
-- Description:
--   The admin gets a push notification on their phone for: a new member, a new bug report / suggestion and a new payout
--   request (Pro sales are pushed straight from creem-webhook / nowpayment-webhook, no database part).
--     - public.admin_push_subscriptions: one row per admin device (browser PushSubscription). Service role only: the admin
--       panel registers devices through the admin-notify Edge Function, which checks app_metadata.role = 'admin'.
--     - public.admin_push_events: keys of events already pushed, so a retried / repeated call never notifies twice.
--     - public.admin_push_enqueue(): AFTER INSERT trigger on user_profiles ('signup'), bug_reports ('report') and
--       payout_requests ('payout'). It only queues an async HTTP call (pg_net) with { event, id }; the request is sent
--       after the transaction commits, and any error is swallowed (RAISE WARNING), so a sign-up, report or payout
--       request can never fail because of a notification. admin-notify re-reads the row with the service role.
--   pg_net is enabled if it is not already (it is never dropped by the rollback; other features may use it).
--   Nothing existing is changed: no column, policy or function of the three tables is touched.
-- Requires: Edge Function admin-notify deployed with --no-verify-jwt (until then the queued calls just get a 404).
-- Run order: after 202610310002. Rollback: supabase/rollbacks/202611080001_admin_push_notifications.down.sql
-- Rehearsal: supabase/tests/rehearse_202611080001.mjs (PGlite)
-- How to run: SQL Editor (or psql -v ON_ERROR_STOP=1), the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 1. Admin devices
CREATE TABLE IF NOT EXISTS public.admin_push_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_admin_push_subscriptions_user ON public.admin_push_subscriptions (user_id);

-- 2. Events already pushed
CREATE TABLE IF NOT EXISTS public.admin_push_events (
  event_key  text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on, no policies: only the service role (Edge Functions) reads or writes these tables
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_push_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_push_subscriptions FROM anon, authenticated;
REVOKE ALL ON TABLE public.admin_push_events FROM anon, authenticated;

-- 3. Trigger function: queue { event, id } for admin-notify
CREATE OR REPLACE FUNCTION public.admin_push_enqueue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := 'https://odasapyhtdopbnlfhwde.supabase.co/functions/v1/admin-notify',
      body := jsonb_build_object('event', TG_ARGV[0], 'id', NEW.id),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'admin_push_enqueue(%): %', TG_ARGV[0], SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_push_enqueue() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_push_enqueue() FROM anon, authenticated;

-- 4. Triggers
DROP TRIGGER IF EXISTS admin_push_signup ON public.user_profiles;
CREATE TRIGGER admin_push_signup
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.admin_push_enqueue('signup');

DROP TRIGGER IF EXISTS admin_push_report ON public.bug_reports;
CREATE TRIGGER admin_push_report
  AFTER INSERT ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.admin_push_enqueue('report');

DROP TRIGGER IF EXISTS admin_push_payout ON public.payout_requests;
CREATE TRIGGER admin_push_payout
  AFTER INSERT ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.admin_push_enqueue('payout');

COMMIT;
