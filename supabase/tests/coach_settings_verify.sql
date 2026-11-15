-- Verify 202611140001_coach_settings.sql: RLS (own row only), anon has nothing, constraints, touch trigger. Ends with ROLLBACK.
BEGIN;
DO $$
DECLARE a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n int; ok boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (a, a || '@t.local'), (b, b || '@t.local');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.coach_settings (user_id, time_zone, plan) VALUES (a, 'Europe/Istanbul', '{"max_trades_per_day": 3}');
  BEGIN INSERT INTO public.coach_settings (user_id) VALUES (b); RAISE EXCEPTION 'FAIL: inserted a row for another user';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; WHEN others THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF; END;
  UPDATE public.coach_settings SET alerts_enabled = false WHERE user_id = a;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: own update'; END IF;
  BEGIN UPDATE public.coach_settings SET time_zone = 'bad zone!' WHERE user_id = a; RAISE EXCEPTION 'FAIL: bad time zone accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.coach_settings SET plan = '[]' WHERE user_id = a; RAISE EXCEPTION 'FAIL: non-object plan accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public.coach_settings WHERE user_id = a; RAISE EXCEPTION 'FAIL: delete allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  INSERT INTO public.coach_settings (user_id) VALUES (b);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.coach_settings; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: sees % rows, expected only its own', n; END IF;
  UPDATE public.coach_settings SET alerts_enabled = false WHERE user_id = b;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: updated another user''s row'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM public.coach_settings; RAISE EXCEPTION 'FAIL: anon can read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SELECT alerts_enabled = false AND updated_at IS NOT NULL INTO ok FROM public.coach_settings WHERE user_id = a;
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: row state'; END IF;
  RAISE NOTICE 'coach_settings verify: ALL PASSED';
END $$;
ROLLBACK;
