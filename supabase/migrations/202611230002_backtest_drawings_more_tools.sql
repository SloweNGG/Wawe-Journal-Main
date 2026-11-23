-- ============================================================
-- WAWE JOURNAL - BACKTEST DRAWINGS: NINE MORE TOOLS
-- Migration: 202611230002_backtest_drawings_more_tools.sql
-- Description:
--   The backtest chart gets nine more drawing tools (bt-draw.js, same release): vertical line, arrow, parallel channel,
--   trend-based Fibonacci extension, pitchfork, ellipse, triangle, brush and callout.
--   1. chk_backtest_drawings_tool: the nine new names join the list (the old nine stay).
--   2. chk_backtest_drawings_points: a brush stroke has up to 120 points (thinned and rounded by the page), so 1-120 points and
--      at most 8 KB instead of 1-3 points and 2 KB. Every existing row already fits (checked below before the change).
--   Nothing else changes: check_backtest_drawing() (ownership, own account, immutables, 500 per account), RLS, the style check.
-- Run order: after 202611230001. Rollback: supabase/rollbacks/202611230002_backtest_drawings_more_tools.down.sql
--   (refuses while rows of the new tools exist).
-- Verification: supabase/tests/backtest_drawings_verify.sql (updated for these rules).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS: the two checks are still the ones of 202610240001
DO $$
DECLARE v_tool text; v_pts text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_tool FROM pg_constraint WHERE conrelid = 'public.backtest_drawings'::regclass AND conname = 'chk_backtest_drawings_tool';
  SELECT pg_get_constraintdef(oid) INTO v_pts FROM pg_constraint WHERE conrelid = 'public.backtest_drawings'::regclass AND conname = 'chk_backtest_drawings_points';
  IF v_tool IS NULL OR v_pts IS NULL THEN RAISE EXCEPTION 'PRECONDITION: the checks of 202610240001 are missing.'; END IF;
  IF v_tool ~ 'callout' THEN RAISE EXCEPTION 'ORDER: chk_backtest_drawings_tool already has the new tools (already applied?).'; END IF;
  IF v_tool !~ 'measure' OR v_pts !~ '3' OR v_pts !~ '2048' THEN RAISE EXCEPTION 'DRIFT: unexpected checks: % / %', v_tool, v_pts; END IF;
END $$;

-- 1. TOOLS ----------------------------------------------------------------------------------------
ALTER TABLE public.backtest_drawings DROP CONSTRAINT chk_backtest_drawings_tool;
ALTER TABLE public.backtest_drawings ADD CONSTRAINT chk_backtest_drawings_tool
  CHECK (tool IN ('trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure',
                  'vline', 'arrow', 'channel', 'fibext', 'pitchfork', 'ellipse', 'triangle', 'brush', 'callout'));

-- 2. POINTS (a brush stroke) ------------------------------------------------------------------------
ALTER TABLE public.backtest_drawings DROP CONSTRAINT chk_backtest_drawings_points;
ALTER TABLE public.backtest_drawings ADD CONSTRAINT chk_backtest_drawings_points
  CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 1 AND 120 AND pg_column_size(points) <= 8192);

COMMENT ON TABLE public.backtest_drawings IS
  'Chart drawings of a backtest account. points: [{"t": UTC seconds, "p": price}, ...] (1-3, a brush stroke up to 120); style: {"color", "text", "locked", ...}. Written by public/interface/backtest/js/bt-draw.js.';

-- 3. CHECKS (read only) -------------------------------------------------------------------------
DO $$
DECLARE v_tool text; v_pts text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_tool FROM pg_constraint WHERE conrelid = 'public.backtest_drawings'::regclass AND conname = 'chk_backtest_drawings_tool';
  SELECT pg_get_constraintdef(oid) INTO v_pts FROM pg_constraint WHERE conrelid = 'public.backtest_drawings'::regclass AND conname = 'chk_backtest_drawings_points';
  IF v_tool !~ 'callout' OR v_tool !~ 'pitchfork' OR v_tool !~ 'measure' THEN RAISE EXCEPTION 'CHECK: tool list %', v_tool; END IF;
  IF v_pts !~ '120' OR v_pts !~ '8192' THEN RAISE EXCEPTION 'CHECK: points %', v_pts; END IF;
  IF (SELECT convalidated FROM pg_constraint WHERE conrelid = 'public.backtest_drawings'::regclass AND conname = 'chk_backtest_drawings_points') IS NOT TRUE THEN
    RAISE EXCEPTION 'CHECK: points check not validated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_backtest_drawing' AND tgrelid = 'public.backtest_drawings'::regclass) THEN
    RAISE EXCEPTION 'CHECK: trigger missing';
  END IF;
  RAISE NOTICE 'backtest_drawings_more_tools OK';
END $$;

COMMIT;
