-- ============================================================
-- Verification of 202611120002_ai_coach.sql. ONE transaction ending with ROLLBACK (safe on the live database):
-- throw-away free and premium users; the Edge Function side runs as service_role, the member side as authenticated.
-- Checks: closed tables, own rows only, member cannot write messages or the counter, daily limit by plan from system_settings,
-- refund, get_ai_usage, conversation delete cascades.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/ai_coach_verify.sql   (PASS lines; a failure aborts)
-- ============================================================
BEGIN;

CREATE TEMP TABLE _v (k text PRIMARY KEY, id uuid) ON COMMIT DROP;
GRANT ALL ON _v TO authenticated, service_role;
INSERT INTO _v VALUES ('free', gen_random_uuid()), ('pro', gen_random_uuid()), ('c1', gen_random_uuid()), ('c2', gen_random_uuid());
INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'verify-ai-' || id || '@example.invalid',
       '{}'::jsonb, jsonb_build_object('username', 'verify_' || replace(id::text, '-', '')), now(), now()
  FROM _v WHERE k IN ('free', 'pro');
UPDATE public.user_profiles SET plan = 'free', plan_expires_at = NULL WHERE id = (SELECT id FROM _v WHERE k = 'free');
UPDATE public.user_profiles SET plan = 'premium', plan_expires_at = now() + interval '30 days' WHERE id = (SELECT id FROM _v WHERE k = 'pro');
UPDATE public.system_settings SET value = '{"free_daily": 2, "premium_daily": 3}' WHERE key = 'ai_limits';

CREATE OR REPLACE FUNCTION pg_temp.expect_error(q text, pat text, what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~ pat THEN RAISE NOTICE 'PASS %', what; RETURN; END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error %', what, SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL %: no error', what;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(who text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid := (SELECT id FROM _v WHERE k = who);
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, service_role;

-- 1. structure and grants
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_messages'::regclass) OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_usage'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_conversations'::regclass) THEN RAISE EXCEPTION 'FAIL RLS off'; END IF;
  IF has_table_privilege('authenticated', 'public.ai_messages', 'INSERT') OR has_table_privilege('authenticated', 'public.ai_conversations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.ai_conversations', 'UPDATE') OR has_table_privilege('authenticated', 'public.ai_usage', 'UPDATE')
     OR has_table_privilege('anon', 'public.ai_messages', 'SELECT') THEN RAISE EXCEPTION 'FAIL member table privileges'; END IF;
  IF has_function_privilege('authenticated', 'public.ai_take_message(uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.ai_refund_message(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_ai_usage()', 'EXECUTE') OR NOT has_function_privilege('authenticated', 'public.get_ai_usage()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.ai_take_message(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'FAIL function grants'; END IF;
  RAISE NOTICE 'PASS structure and grants';
END $$;

-- 2. Edge Function side: limits by plan, refund
SET LOCAL ROLE service_role;
DO $$
DECLARE f uuid := (SELECT id FROM _v WHERE k = 'free'); p uuid := (SELECT id FROM _v WHERE k = 'pro'); r jsonb;
BEGIN
  r := public.ai_take_message(f); IF NOT (r ->> 'ok')::boolean OR (r ->> 'used')::int <> 1 OR (r ->> 'limit')::int <> 2 THEN RAISE EXCEPTION 'FAIL take 1 %', r; END IF;
  r := public.ai_take_message(f); IF NOT (r ->> 'ok')::boolean OR (r ->> 'used')::int <> 2 THEN RAISE EXCEPTION 'FAIL take 2 %', r; END IF;
  r := public.ai_take_message(f); IF (r ->> 'ok')::boolean OR (r ->> 'used')::int <> 2 OR (r ->> 'premium')::boolean THEN RAISE EXCEPTION 'FAIL free limit %', r; END IF;
  RAISE NOTICE 'PASS free plan: limit from system_settings (2), the 3rd message is refused and not counted';
  PERFORM public.ai_refund_message(f);
  r := public.ai_take_message(f); IF NOT (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'FAIL refund %', r; END IF;
  RAISE NOTICE 'PASS refund gives the message back';
  FOR i IN 1..3 LOOP r := public.ai_take_message(p); END LOOP;
  IF NOT (r ->> 'ok')::boolean OR (r ->> 'limit')::int <> 3 OR NOT (r ->> 'premium')::boolean THEN RAISE EXCEPTION 'FAIL premium %', r; END IF;
  r := public.ai_take_message(p); IF (r ->> 'ok')::boolean THEN RAISE EXCEPTION 'FAIL premium limit'; END IF;
  RAISE NOTICE 'PASS premium plan: its own limit (3)';
  PERFORM public.ai_refund_message(p); PERFORM public.ai_refund_message(p); PERFORM public.ai_refund_message(p); PERFORM public.ai_refund_message(p);
  IF (SELECT messages FROM public.ai_usage WHERE user_id = p) <> 0 THEN RAISE EXCEPTION 'FAIL refund below zero'; END IF;
  RAISE NOTICE 'PASS refund never goes below zero';
END $$;
-- conversations and messages written by the Edge Function
INSERT INTO public.ai_conversations (id, user_id, title) VALUES ((SELECT id FROM _v WHERE k = 'c1'), (SELECT id FROM _v WHERE k = 'free'), 'free chat'),
                                                               ((SELECT id FROM _v WHERE k = 'c2'), (SELECT id FROM _v WHERE k = 'pro'), 'pro chat');
INSERT INTO public.ai_messages (conversation_id, user_id, role, content, steps, model)
VALUES ((SELECT id FROM _v WHERE k = 'c1'), (SELECT id FROM _v WHERE k = 'free'), 'user', 'q', NULL, NULL),
       ((SELECT id FROM _v WHERE k = 'c1'), (SELECT id FROM _v WHERE k = 'free'), 'model', 'a', '[{"type":"model_output"}]', 'gemini-3.8-flash'),
       ((SELECT id FROM _v WHERE k = 'c2'), (SELECT id FROM _v WHERE k = 'pro'), 'user', 'secret', NULL, NULL);
SELECT pg_temp.expect_error($q$INSERT INTO public.ai_messages (conversation_id, user_id, role, content) VALUES ((SELECT id FROM _v WHERE k = 'c1'), (SELECT id FROM _v WHERE k = 'free'), 'system', 'x')$q$, 'chk_ai_messages_role', 'role is user or model');
RESET ROLE;

-- 3. member side
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('free');
DO $$
DECLARE r jsonb := public.get_ai_usage();
BEGIN
  IF (r ->> 'used')::int <> 2 OR (r ->> 'limit')::int <> 2 OR (r ->> 'premium')::boolean OR r ->> 'resets_at' !~ 'T00:00:00Z$' THEN RAISE EXCEPTION 'FAIL usage %', r; END IF;
  RAISE NOTICE 'PASS get_ai_usage: used, limit, plan, reset at 00:00 UTC';
  IF (SELECT count(*) FROM public.ai_conversations) <> 1 OR (SELECT count(*) FROM public.ai_messages) <> 2 OR (SELECT count(*) FROM public.ai_usage) <> 1 THEN
    RAISE EXCEPTION 'FAIL the member sees other rows';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ai_messages WHERE content = 'secret') THEN RAISE EXCEPTION 'FAIL foreign message visible'; END IF;
  RAISE NOTICE 'PASS the member reads only their own conversations, messages and usage';
END $$;
SELECT pg_temp.expect_error($q$INSERT INTO public.ai_messages (conversation_id, user_id, role, content) VALUES ((SELECT id FROM _v WHERE k = 'c1'), auth.uid(), 'model', 'fake answer')$q$, 'permission denied', 'the member cannot write messages');
SELECT pg_temp.expect_error($q$UPDATE public.ai_usage SET messages = 0$q$, 'permission denied', 'the member cannot reset the counter');
SELECT pg_temp.expect_error($q$SELECT public.ai_take_message(auth.uid())$q$, 'permission denied', 'the member cannot call ai_take_message');
DELETE FROM public.ai_conversations WHERE id = (SELECT id FROM _v WHERE k = 'c2');      -- someone else's: no row matches
DELETE FROM public.ai_conversations WHERE id = (SELECT id FROM _v WHERE k = 'c1');
RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_conversations WHERE id = (SELECT id FROM _v WHERE k = 'c2')) THEN RAISE EXCEPTION 'FAIL deleted a foreign conversation'; END IF;
  IF EXISTS (SELECT 1 FROM public.ai_messages WHERE conversation_id = (SELECT id FROM _v WHERE k = 'c1')) THEN RAISE EXCEPTION 'FAIL messages not cascaded'; END IF;
  RAISE NOTICE 'PASS the member deletes own conversations (messages go with them), not others';
END $$;

ROLLBACK;
