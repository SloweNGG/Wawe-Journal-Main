-- ============================================================
-- ROLLBACK of 202610240001_backtest_drawings.sql
-- Drops public.backtest_drawings (policies, index and trigger go with it) and public.check_backtest_drawing().
-- DATA LOSS GUARD: refuses while the table has rows (users' saved drawings); to accept that loss run
--   SET wawe.allow_drawings_loss = 'on';  in the same session first.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first. Deploy the client without drawing saves first
-- (the page treats a missing table as "no saved drawings").
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE v_n bigint;
BEGIN
  IF to_regclass('public.backtest_drawings') IS NULL THEN
    RAISE EXCEPTION 'ORDER: public.backtest_drawings not found (migration 202610240001 is not applied).';
  END IF;
  SELECT count(*) INTO v_n FROM public.backtest_drawings;
  IF v_n > 0 AND coalesce(current_setting('wawe.allow_drawings_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATA LOSS: % saved drawing(s); SET wawe.allow_drawings_loss = ''on'' to drop them anyway.', v_n;
  END IF;
END $$;

DROP TABLE public.backtest_drawings;
DROP FUNCTION public.check_backtest_drawing();

DO $$
BEGIN
  IF to_regclass('public.backtest_drawings') IS NOT NULL OR to_regprocedure('public.check_backtest_drawing()') IS NOT NULL THEN
    RAISE EXCEPTION 'CHECK: rollback incomplete';
  END IF;
  RAISE NOTICE 'backtest_drawings rolled back';
END $$;

COMMIT;
