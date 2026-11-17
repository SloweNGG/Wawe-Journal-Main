-- ============================================================
-- WAWE JOURNAL - ECONOMIC CALENDAR (Forex Factory weekly export, cached)
-- Migration: 202611170001_econ_calendar.sql
-- Description:
--   public.econ_events: this week's economic calendar from Forex Factory's export (_shared/econ-calendar.ts), written by
--     the Edge Functions (service role) and served to members through econ-calendar (navbar countdown badge) and ai-coach.
--     Same data for everyone: members have no direct access (RLS on, no policies, grants revoked).
--   public.econ_feed_state: one row; when the export was last tried / loaded. The export allows ~2 requests per 5 minutes,
--     so a function first claims the refresh (UPDATE ... WHERE last_attempt_at < now() - interval) and only the winner fetches.
-- Run order: after 202611140001. Rollback: supabase/rollbacks/202611170001_econ_calendar.down.sql
-- Verify: supabase/tests/econ_calendar_verify.sql (one transaction, ends with ROLLBACK).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction), as postgres. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.econ_events') IS NOT NULL OR to_regclass('public.econ_feed_state') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.econ_events already exists (this migration was already applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

CREATE TABLE public.econ_events (
  id          text        PRIMARY KEY,
  title       text        NOT NULL,
  currency    text        NOT NULL,
  impact      text        NOT NULL,
  event_at    timestamptz NOT NULL,
  forecast    text        NULL,
  previous    text        NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_econ_events_id CHECK (id ~ '^[0-9a-f]{16}$'),
  CONSTRAINT chk_econ_events_title CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT chk_econ_events_currency CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT chk_econ_events_impact CHECK (impact IN ('high', 'medium', 'low', 'holiday')),
  CONSTRAINT chk_econ_events_values CHECK (char_length(coalesce(forecast, '')) <= 24 AND char_length(coalesce(previous, '')) <= 24)
);
COMMENT ON TABLE public.econ_events IS 'Economic calendar cached from Forex Factory''s weekly export; written and read by Edge Functions only.';
CREATE INDEX idx_econ_events_at ON public.econ_events (event_at);

CREATE TABLE public.econ_feed_state (
  id               smallint    PRIMARY KEY DEFAULT 1,
  last_attempt_at  timestamptz NOT NULL DEFAULT 'epoch',
  last_success_at  timestamptz NULL,
  last_status      text        NULL,
  CONSTRAINT chk_econ_feed_state_one CHECK (id = 1),
  CONSTRAINT chk_econ_feed_state_status CHECK (last_status IS NULL OR char_length(last_status) <= 80)
);
COMMENT ON TABLE public.econ_feed_state IS 'One row: when the Forex Factory export was last tried and loaded (refresh claim).';
INSERT INTO public.econ_feed_state (id) VALUES (1);

ALTER TABLE public.econ_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.econ_feed_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.econ_events, public.econ_feed_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.econ_events, public.econ_feed_state TO service_role;

COMMIT;
