-- ============================================================
-- Rollback of 202611120002_ai_coach.sql
-- Undeploy (or stop) the ai-coach Edge Function FIRST. Deletes every AI conversation, message and usage counter.
-- ============================================================
BEGIN;

DROP FUNCTION IF EXISTS public.get_ai_usage();
DROP FUNCTION IF EXISTS public.ai_refund_message(uuid);
DROP FUNCTION IF EXISTS public.ai_take_message(uuid);
DROP FUNCTION IF EXISTS public.ai_daily_limit(uuid);

DROP TABLE IF EXISTS public.ai_messages;
DROP TABLE IF EXISTS public.ai_conversations;
DROP TABLE IF EXISTS public.ai_usage;

DELETE FROM public.system_settings WHERE key = 'ai_limits';

NOTIFY pgrst, 'reload schema';

COMMIT;
