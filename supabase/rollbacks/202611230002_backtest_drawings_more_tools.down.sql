-- ============================================================
-- ROLLBACK of 202611230002_backtest_drawings_more_tools.sql: the tool and point checks of 202610240001 come back.
-- Refuses while drawings of the new tools (or with more than 3 points / over 2 KB) exist: delete those rows first, e.g.
--   DELETE FROM public.backtest_drawings WHERE tool IN ('vline','arrow','channel','fibext','pitchfork','ellipse','triangle','brush','callout');
-- Roll the page (bt-draw.js) back before or together with this, otherwise saving a new tool fails (the page keeps it for the session).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.backtest_drawings
              WHERE tool IN ('vline', 'arrow', 'channel', 'fibext', 'pitchfork', 'ellipse', 'triangle', 'brush', 'callout')
                 OR jsonb_array_length(points) > 3 OR pg_column_size(points) > 2048) THEN
    RAISE EXCEPTION 'ROLLBACK REFUSED: drawings of the new tools exist (see the header).';
  END IF;
END $$;

ALTER TABLE public.backtest_drawings DROP CONSTRAINT chk_backtest_drawings_tool;
ALTER TABLE public.backtest_drawings ADD CONSTRAINT chk_backtest_drawings_tool
  CHECK (tool IN ('trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure'));

ALTER TABLE public.backtest_drawings DROP CONSTRAINT chk_backtest_drawings_points;
ALTER TABLE public.backtest_drawings ADD CONSTRAINT chk_backtest_drawings_points
  CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 1 AND 3 AND pg_column_size(points) <= 2048);

COMMENT ON TABLE public.backtest_drawings IS
  'Chart drawings of a backtest account (Premium). points: [{"t": UTC seconds, "p": price}, ...]; style: {"color", "text", "locked"}. Written by public/interface/backtest/js/bt-draw.js.';

COMMIT;
