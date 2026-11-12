-- ============================================================
-- WAWE JOURNAL - AI COACH: CHART DATA OF AN ANSWER
-- Migration: 202611120003_ai_coach_visuals.sql
-- Description:
--   public.ai_messages.visuals jsonb NULL: the chart data of a model answer, keyed by the [[viz:...]] directive id in the text
--   (built by the ai-coach Edge Function from the member's own numbers, supabase/functions/_shared/visuals.ts), so a chat
--   opened again from the history shows the same charts. Written only by the Edge Function; members read it through the
--   existing ai_messages_select_own policy. Additive: nothing else changes.
-- Run order: after 202611120002. Rollback: supabase/rollbacks/202611120003_ai_coach_visuals.down.sql
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once, as postgres.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.ai_messages') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202611120002_ai_coach.sql first.';
  END IF;
END $$;

ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS visuals jsonb NULL;

ALTER TABLE public.ai_messages DROP CONSTRAINT IF EXISTS chk_ai_messages_visuals;
ALTER TABLE public.ai_messages ADD CONSTRAINT chk_ai_messages_visuals
  CHECK (visuals IS NULL OR (jsonb_typeof(visuals) = 'object' AND pg_column_size(visuals) <= 65536));

COMMENT ON COLUMN public.ai_messages.visuals IS
  'Chart data of a model answer, keyed by the [[viz:...]] directive id in content (ai-coach Edge Function, _shared/visuals.ts).';

NOTIFY pgrst, 'reload schema';

COMMIT;
