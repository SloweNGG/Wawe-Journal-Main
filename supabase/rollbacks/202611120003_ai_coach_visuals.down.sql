-- Rollback of 202611120003_ai_coach_visuals.sql. Put the previous ai-coach Edge Function back FIRST (it writes the column).
-- The chart data of past answers is lost; their text keeps the [[viz:...]] lines, which the panel then hides.
BEGIN;
ALTER TABLE public.ai_messages DROP CONSTRAINT IF EXISTS chk_ai_messages_visuals;
ALTER TABLE public.ai_messages DROP COLUMN IF EXISTS visuals;
NOTIFY pgrst, 'reload schema';
COMMIT;
