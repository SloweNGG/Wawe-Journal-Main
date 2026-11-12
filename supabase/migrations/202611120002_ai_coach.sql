-- ============================================================
-- WAWE JOURNAL - AI COACH (chat about the user's own trades, chart screenshots, strategy analysis)
-- Migration: 202611120002_ai_coach.sql
-- Description:
--   The ai-coach Edge Function answers questions with Google Gemini, using a summary of the caller's trades and strategies.
--   1. public.ai_conversations (one chat thread) and public.ai_messages (its turns). Members read and delete their own; only
--      the Edge Function (service role) writes. ai_messages.steps keeps the model's raw output steps (Gemini Interactions API),
--      which must be sent back unchanged in later turns (thought signatures) to the same model (ai_messages.model); another
--      model gets the plain text. Images are NOT stored (had_image only).
--   2. public.ai_usage (user, day UTC, messages): a counter written only by ai_take_message() / ai_refund_message().
--   3. system_settings 'ai_limits' = {"free_daily": 5, "premium_daily": 50}: messages per UTC day. Change without a release:
--        UPDATE public.system_settings SET value = jsonb_set(value, '{free_daily}', '10'), updated_at = now() WHERE key = 'ai_limits';
--   4. ai_take_message(user) / ai_refund_message(user): service role only. Take = check the plan's limit and count one message
--      (one user at a time); refund = give it back when Gemini failed.
--   5. get_ai_usage() (authenticated): { used, limit, premium, resets_at } for the panel.
-- Run order: after 202611090002. Rollback: supabase/rollbacks/202611120002_ai_coach.down.sql
-- Verify: supabase/tests/ai_coach_verify.sql (one transaction, ends with ROLLBACK).
-- How to run: psql -v ON_ERROR_STOP=1, the WHOLE file at once (one transaction), as postgres. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL OR to_regclass('public.system_settings') IS NULL
     OR to_regclass('public.journals') IS NULL OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: user_profiles, system_settings, journals and is_admin() must exist.';
  END IF;
  IF to_regclass('public.ai_conversations') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.ai_conversations already exists (this migration was already applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

-- 1. TABLES ---------------------------------------------------------------------------------------
CREATE TABLE public.ai_conversations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  journal_id  uuid        NULL REFERENCES public.journals(id) ON DELETE SET NULL,
  title       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ai_conversations_title CHECK (char_length(title) BETWEEN 1 AND 120)
);
CREATE INDEX idx_ai_conversations_user ON public.ai_conversations (user_id, updated_at DESC);

CREATE TABLE public.ai_messages (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid        NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text        NOT NULL,
  content          text        NOT NULL,
  steps            jsonb       NULL,
  model            text        NULL,
  had_image        boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_ai_messages_role CHECK (role IN ('user', 'model')),
  CONSTRAINT chk_ai_messages_content CHECK (char_length(content) <= 20000)
);
CREATE INDEX idx_ai_messages_conversation ON public.ai_messages (conversation_id, created_at);

CREATE TABLE public.ai_usage (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day         date        NOT NULL,
  messages    integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day),
  CONSTRAINT chk_ai_usage_messages CHECK (messages >= 0)
);

COMMENT ON TABLE public.ai_conversations IS 'AI coach chat threads. Written by the ai-coach Edge Function; members read and delete their own.';
COMMENT ON TABLE public.ai_messages IS 'AI coach turns. steps = raw Gemini output steps (sent back unchanged in later turns). Images are never stored.';
COMMENT ON TABLE public.ai_usage IS 'AI coach messages per user and UTC day. Written only by ai_take_message() / ai_refund_message().';

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_conversations_select_own ON public.ai_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_conversations_delete_own ON public.ai_conversations FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_messages_select_own ON public.ai_messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_usage_select_own ON public.ai_usage FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.ai_conversations, public.ai_messages, public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT ON public.ai_messages, public.ai_usage TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations, public.ai_messages, public.ai_usage TO service_role;

-- 2. SETTING --------------------------------------------------------------------------------------
INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('ai_limits', '{"free_daily": 5, "premium_daily": 50}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 3. LIMIT, TAKE, REFUND --------------------------------------------------------------------------
-- the caller's daily limit by plan (5 / 50 when the setting is missing or not a number)
CREATE OR REPLACE FUNCTION public.ai_daily_limit(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_plan text; v_exp timestamptz; v_prem boolean; v text;
BEGIN
  SELECT up.plan, up.plan_expires_at INTO v_plan, v_exp FROM public.user_profiles up WHERE up.id = p_user;
  v_prem := (v_plan = 'premium' AND (v_exp IS NULL OR v_exp > now()));
  SELECT s.value ->> CASE WHEN v_prem THEN 'premium_daily' ELSE 'free_daily' END INTO v
    FROM public.system_settings s WHERE s.key = 'ai_limits';
  IF v IS NULL OR v !~ '^[0-9]{1,6}$' THEN RETURN CASE WHEN v_prem THEN 50 ELSE 5 END; END IF;
  RETURN v::integer;
END;
$$;

-- { ok, used, limit, premium }: counts one message for today (UTC) unless the limit is reached
CREATE OR REPLACE FUNCTION public.ai_take_message(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_limit integer;
  v_used  integer;
  v_plan  text; v_exp timestamptz;
BEGIN
  IF p_user IS NULL THEN RAISE EXCEPTION 'AI_NO_USER'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wawe.ai_usage:' || p_user::text, 0));
  v_limit := public.ai_daily_limit(p_user);
  SELECT up.plan, up.plan_expires_at INTO v_plan, v_exp FROM public.user_profiles up WHERE up.id = p_user;
  SELECT u.messages INTO v_used FROM public.ai_usage u WHERE u.user_id = p_user AND u.day = v_day;
  v_used := coalesce(v_used, 0);
  IF v_used >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'used', v_used, 'limit', v_limit, 'premium', (v_plan = 'premium' AND (v_exp IS NULL OR v_exp > now())));
  END IF;
  INSERT INTO public.ai_usage AS u (user_id, day, messages, updated_at) VALUES (p_user, v_day, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE SET messages = u.messages + 1, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'used', v_used + 1, 'limit', v_limit, 'premium', (v_plan = 'premium' AND (v_exp IS NULL OR v_exp > now())));
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_refund_message(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_usage SET messages = greatest(messages - 1, 0), updated_at = now()
   WHERE user_id = p_user AND day = (now() AT TIME ZONE 'UTC')::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_day date := (now() AT TIME ZONE 'UTC')::date; v_used integer; v_plan text; v_exp timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT u.messages INTO v_used FROM public.ai_usage u WHERE u.user_id = v_uid AND u.day = v_day;
  SELECT up.plan, up.plan_expires_at INTO v_plan, v_exp FROM public.user_profiles up WHERE up.id = v_uid;
  RETURN jsonb_build_object(
    'used', coalesce(v_used, 0),
    'limit', public.ai_daily_limit(v_uid),
    'premium', (v_plan = 'premium' AND (v_exp IS NULL OR v_exp > now())),
    'resets_at', to_char((v_day + 1)::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END;
$$;

REVOKE ALL ON FUNCTION public.ai_daily_limit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_take_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_refund_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_take_message(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_refund_message(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_usage() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 4. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.ai_messages', 'INSERT') OR has_table_privilege('anon', 'public.ai_conversations', 'SELECT')
     OR has_function_privilege('authenticated', 'public.ai_take_message(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CHECK: grants';
  END IF;
  RAISE NOTICE 'ai_coach OK';
END $$;

COMMIT;
