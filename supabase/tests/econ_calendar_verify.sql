-- Verify 202611170001_econ_calendar.sql + 202611170002_econ_sources.sql (per-site impacts): members and anon have no access, constraints, single feed-state row, refresh claim.
-- Ends with ROLLBACK.
BEGIN;
DO $$
DECLARE n int; a uuid := gen_random_uuid();
BEGIN
  -- service role writes
  SET LOCAL ROLE service_role;
  INSERT INTO public.econ_events (id, title, currency, impact, event_at, forecast, previous)
    VALUES ('0123456789abcdef', 'CPI y/y', 'USD', 'high', now() + interval '1 hour', '3.1%', '3.0%');
  BEGIN INSERT INTO public.econ_events (id, title, currency, impact, event_at) VALUES ('bad', 'x', 'USD', 'high', now()); RAISE EXCEPTION 'FAIL: bad id';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.econ_events (id, title, currency, impact, event_at) VALUES ('0123456789abcdee', 'x', 'usd', 'high', now()); RAISE EXCEPTION 'FAIL: lowercase currency';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN INSERT INTO public.econ_events (id, title, currency, impact, event_at) VALUES ('0123456789abcdee', 'x', 'USD', 'High', now()); RAISE EXCEPTION 'FAIL: impact case';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- per-site impacts (202611170002)
  UPDATE public.econ_events SET impacts = '{"ff":"high","ee":"low"}' WHERE id = '0123456789abcdef';
  BEGIN UPDATE public.econ_events SET impacts = '{"xx":"high"}' WHERE id = '0123456789abcdef'; RAISE EXCEPTION 'FAIL: unknown site';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.econ_events SET impacts = '{"ff":"huge"}' WHERE id = '0123456789abcdef'; RAISE EXCEPTION 'FAIL: unknown impact';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.econ_events SET impacts = '[]' WHERE id = '0123456789abcdef'; RAISE EXCEPTION 'FAIL: non-object impacts';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.econ_events (id, title, currency, impact, event_at, impacts)
    VALUES ('0123456789abcde0', 'IEA World Energy Outlook', 'ALL', 'low', now() + interval '2 hours', '{"ee":"low"}');
  BEGIN INSERT INTO public.econ_feed_state (id) VALUES (2); RAISE EXCEPTION 'FAIL: second state row';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- the refresh claim: only one of two claims inside the window wins (start from an old attempt: on live a real
  -- refresh may have claimed it minutes ago; everything here is rolled back)
  UPDATE public.econ_feed_state SET last_attempt_at = 'epoch' WHERE id = 1;
  UPDATE public.econ_feed_state SET last_attempt_at = now() WHERE id = 1 AND last_attempt_at < now() - interval '5 minutes';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: first claim'; END IF;
  UPDATE public.econ_feed_state SET last_attempt_at = now() WHERE id = 1 AND last_attempt_at < now() - interval '5 minutes';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION 'FAIL: second claim won'; END IF;
  RESET ROLE;
  -- members and anon: nothing
  INSERT INTO auth.users (id, email) VALUES (a, a || '@t.local');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM 1 FROM public.econ_events; RAISE EXCEPTION 'FAIL: member reads econ_events';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.econ_feed_state; RAISE EXCEPTION 'FAIL: member reads econ_feed_state';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SET LOCAL ROLE anon;
  BEGIN PERFORM 1 FROM public.econ_events; RAISE EXCEPTION 'FAIL: anon reads econ_events';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  SELECT count(*) INTO n FROM public.econ_feed_state; IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % state rows', n; END IF;
  RAISE NOTICE 'econ_calendar verify: OK';
END $$;
ROLLBACK;
