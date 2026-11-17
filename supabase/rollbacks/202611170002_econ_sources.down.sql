-- Rollback of 202611170002_econ_sources.sql: drops the per-site impacts. Events that came only from CryptoCraft,
-- MetalsMine or EnergyExch stay as rows (the old functions show them like Forex Factory events until the next refresh
-- replaces the week); redeploy econ-calendar and ai-coach from before 202611170002 FIRST, they select this column.
BEGIN;
ALTER TABLE public.econ_events DROP CONSTRAINT IF EXISTS chk_econ_events_impacts;
ALTER TABLE public.econ_events DROP COLUMN IF EXISTS impacts;
DROP FUNCTION IF EXISTS public.econ_impacts_ok(jsonb);
COMMIT;
