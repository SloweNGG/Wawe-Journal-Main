-- Rollback of 202611170001_econ_calendar.sql: drops the cached calendar (it is re-fetched from Forex Factory on the next apply).
BEGIN;
DROP TABLE IF EXISTS public.econ_feed_state;
DROP TABLE IF EXISTS public.econ_events;
COMMIT;
