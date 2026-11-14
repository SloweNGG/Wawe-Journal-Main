-- ============================================================
-- WAWE JOURNAL - AI COACH SETTINGS (live alerts, time zone, trading plan)
-- Migration: 202611140001_coach_settings.sql
-- Description:
--   public.coach_settings: one row per member, read by the Edge Functions (service role) when new trades arrive.
--     alerts_enabled  live coach alerts after a sync (_shared/coach-alerts.ts), on by default (no row = on)
--     time_zone       the member's IANA zone, saved by the coach panel; "today" of the alerts (no row / NULL = UTC)
--     plan            the member's trading plan rules (max trades per day, max daily loss, ...); validated by the app
--   Members read, insert and update their own row (RLS); nobody deletes it except through the user's deletion (CASCADE).
-- Run order: after 202611120003. Rollback: supabase/rollbacks/202611140001_coach_settings.down.sql
-- Verify: supabase/tests/coach_settings_verify.sql (one transaction, ends with ROLLBACK).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction), as postgres. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.coach_settings') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.coach_settings already exists (this migration was already applied).';
  END IF;
  IF to_regclass('public.notifications') IS NULL OR to_regclass('public.ai_conversations') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.notifications and the AI coach tables (202611120002) must exist.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

CREATE TABLE public.coach_settings (
  user_id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alerts_enabled  boolean     NOT NULL DEFAULT true,
  time_zone       text        NULL,
  plan            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_coach_settings_tz CHECK (time_zone IS NULL OR (char_length(time_zone) BETWEEN 1 AND 64 AND time_zone ~ '^[A-Za-z0-9_+/-]+$')),
  CONSTRAINT chk_coach_settings_plan CHECK (jsonb_typeof(plan) = 'object' AND pg_column_size(plan) <= 16384)
);
COMMENT ON TABLE public.coach_settings IS 'AI coach settings per member: live alerts on/off, time zone for "today", trading plan rules (jsonb).';

CREATE OR REPLACE FUNCTION public.coach_settings_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_coach_settings_touch BEFORE UPDATE ON public.coach_settings FOR EACH ROW EXECUTE FUNCTION public.coach_settings_touch();

ALTER TABLE public.coach_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY coach_settings_select_own ON public.coach_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY coach_settings_insert_own ON public.coach_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY coach_settings_update_own ON public.coach_settings FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.coach_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coach_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_settings TO service_role;
REVOKE ALL ON FUNCTION public.coach_settings_touch() FROM PUBLIC, anon, authenticated;

-- coach alerts look up the member's recent coach notifications by title_key
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);

COMMIT;
