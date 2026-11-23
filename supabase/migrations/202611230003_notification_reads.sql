-- ============================================================
-- WAWE JOURNAL - READ STATE OF CLIENT-BUILT NOTIFICATIONS ON THE ACCOUNT
-- Migration: 202611230003_notification_reads.sql
-- Description:
--   The bell shows two kinds of notifications:
--     * rows of public.notifications (their is_read is already stored on the server), and
--     * notifications the browser builds itself: overtrade / daily-loss warnings (ot_*), Pro expiring / expired
--       (prem_*) and failed payments (pay_*).
--   The read state of the second kind lived only in localStorage, so after logging in on another device or browser,
--   in a PWA, in a private window or after Safari purged site data, every one of them came back as unread.
--   public.notification_reads stores those keys per user so "read" is the same everywhere.
--   Written by public/components/navbar/navbar.js (insert ... on conflict do nothing, own rows only).
--   Keys are short ASCII ids (ot_daily_2026-11-23, prem_expiring_2026-12-01, pay_<id>); at most 1000 rows per user
--   (the client also deletes its rows older than 120 days).
--   The client tolerates the table being absent (select error -> localStorage only), so the front end can ship first.
-- Run order: after 202611230002. Rollback: supabase/rollbacks/202611230003_notification_reads.down.sql
-- Verify: supabase/tests/notification_reads_verify.sql (read-only)
-- How to run: the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.notifications not found.';
  END IF;
  IF to_regclass('public.notification_reads') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.notification_reads already exists (this migration was already applied).';
  END IF;
END $$;

CREATE TABLE public.notification_reads (
  user_id   uuid        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  notif_key text        NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notif_key),
  CONSTRAINT notification_reads_key_shape CHECK (notif_key ~ '^(ot|prem|pay)_[A-Za-z0-9_.:-]{1,100}$')
);

COMMENT ON TABLE public.notification_reads IS
  'Read/dismissed keys of notifications the browser builds (ot_*, prem_*, pay_*), so the bell read state is the same on every device.';

ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_reads_select_own ON public.notification_reads
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY notification_reads_insert_own ON public.notification_reads
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY notification_reads_delete_own ON public.notification_reads
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.notification_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;

-- at most 1000 keys per user, so the table cannot be used as free storage
CREATE OR REPLACE FUNCTION public.notification_reads_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (SELECT count(*) FROM public.notification_reads WHERE user_id = NEW.user_id) >= 1000 THEN
    RAISE EXCEPTION 'notification_reads: limit of 1000 keys per user reached' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_reads_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER notification_reads_limit
  BEFORE INSERT ON public.notification_reads
  FOR EACH ROW EXECUTE FUNCTION public.notification_reads_limit();

-- PostgREST: make the new table visible to the API right away
NOTIFY pgrst, 'reload schema';

COMMIT;
