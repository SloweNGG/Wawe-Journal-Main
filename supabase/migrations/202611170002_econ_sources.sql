-- ============================================================
-- WAWE JOURNAL - ECONOMIC CALENDAR: FOUR SOURCES (Forex Factory + CryptoCraft, MetalsMine, EnergyExch)
-- Migration: 202611170002_econ_sources.sql
-- Description:
--   public.econ_events.impacts: each site's impact rating of the event ({"ff":"high","cc":"low","mm":"medium",...});
--     the sites rate impact for their own market. impact stays the highest of them (what the badge filters on).
--     The keys also tell where an event comes from: an event only on MetalsMine / EnergyExch / CryptoCraft moves only that
--     market's pairs (_shared/econ-calendar.ts moves()).
--   Existing rows came from Forex Factory only: impacts = {"ff": impact}.
--   econ_events.currency: "ALL" = a global event (the sites' country "All"), already allowed by the ^[A-Z]{3}$ check.
-- Run order: after 202611170001. Rollback: supabase/rollbacks/202611170002_econ_sources.down.sql
-- Verify: supabase/tests/econ_calendar_verify.sql (one transaction, ends with ROLLBACK).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction), as postgres. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.econ_events') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.econ_events (202611170001) must exist.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'econ_events' AND column_name = 'impacts') THEN
    RAISE EXCEPTION 'ORDER: econ_events.impacts already exists (this migration was already applied).';
  END IF;
END $$;

ALTER TABLE public.econ_events ADD COLUMN impacts jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.econ_events SET impacts = jsonb_build_object('ff', impact);
-- a CHECK cannot hold a subquery: the rule lives in an immutable function
CREATE FUNCTION public.econ_impacts_ok(p jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (SELECT 1 FROM jsonb_each(p) x
                     WHERE x.key NOT IN ('ff', 'cc', 'mm', 'ee')
                        OR jsonb_typeof(x.value) <> 'string'
                        OR (x.value #>> '{}') NOT IN ('high', 'medium', 'low', 'holiday'))
$$;
REVOKE ALL ON FUNCTION public.econ_impacts_ok(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.econ_impacts_ok(jsonb) TO service_role;
ALTER TABLE public.econ_events ADD CONSTRAINT chk_econ_events_impacts CHECK (public.econ_impacts_ok(impacts));
COMMENT ON COLUMN public.econ_events.impacts IS 'Impact per site: ff = Forex Factory, cc = CryptoCraft, mm = MetalsMine, ee = EnergyExch. impact = the highest.';

COMMIT;
