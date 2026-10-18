-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 VERIFICATION TEST (rolls itself back)
-- File: supabase/tests/backtest_v2_verify.sql
--
-- WHEN: after 202610180002 (and again after 202610180004 / 202610180005; the scenarios of a migration
--   that is not applied yet are reported as SKIP).
-- HOW: Supabase Dashboard -> SQL Editor, paste the whole file, Run (as postgres).
-- RESULT: the script ALWAYS ends with RAISE EXCEPTION 'BACKTEST V2 TEST SUMMARY ...'. The error box
--   shows every [PASS]/[FAIL]/[SKIP] line, and the exception rolls the whole transaction back: no test
--   user, journal, account, trade or mirror row remains.
-- APPROVAL: it still WRITES inside that transaction (3 test users in auth.users - Supabase's
--   on_auth_user_created trigger runs for them -, journals, backtest rows, trades rows). Run it only
--   with the owner's approval, like any other live write (R35b).
-- Same pattern as supabase/tests/prop_accounts_verify.sql.
-- ============================================================

DO $$
DECLARE
  v_free     uuid := gen_random_uuid();
  v_prem     uuid := gen_random_uuid();
  v_other    uuid := gen_random_uuid();
  v_j_free1  uuid;
  v_j_free2  uuid;
  v_j_inact  uuid;
  v_j_other  uuid;
  v_acc      uuid;
  v_acc_oth  uuid;
  v_tr       uuid;
  v_n        int;
  v_res      jsonb;
  v_pass     int := 0;
  v_fail     int := 0;
  v_log      text := '';
  v_has_04   boolean := to_regprocedure('public.backtest_accounts_cleanup_trades()') IS NOT NULL;
  v_has_05   boolean := (SELECT md5(translate(prosrc, E' \t\r\n', '')) = 'd4f0bce277a530a47cff7d18c4420590'
                           FROM pg_proc WHERE oid = to_regprocedure('public.list_journals()'));
BEGIN
  IF to_regclass('public.backtest_accounts') IS NULL THEN
    RAISE EXCEPTION 'Migration 202610180002 is not applied; nothing to test.';
  END IF;

  -- ---------------------------------------------------------- setup (no JWT claims: auth.uid() is NULL)
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_free,  'authenticated', 'authenticated', 'bt_free_test@wawejournal.local',  '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"bt_free_test"}'::jsonb,  now(), now()),
    (v_prem,  'authenticated', 'authenticated', 'bt_prem_test@wawejournal.local',  '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"bt_prem_test"}'::jsonb,  now(), now()),
    (v_other, 'authenticated', 'authenticated', 'bt_other_test@wawejournal.local', '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"bt_other_test"}'::jsonb, now(), now());

  INSERT INTO public.user_profiles (id, email, username, plan, plan_expires_at, is_active, max_journals) VALUES
    (v_free,  'bt_free_test@wawejournal.local',  'bt_free_test',  'free',    NULL, true, 2),
    (v_prem,  'bt_prem_test@wawejournal.local',  'bt_prem_test',  'premium', now() + interval '30 days', true, 10),
    (v_other, 'bt_other_test@wawejournal.local', 'bt_other_test', 'free',    NULL, true, 2)
  ON CONFLICT (id) DO UPDATE SET plan = EXCLUDED.plan, plan_expires_at = EXCLUDED.plan_expires_at,
                                 is_active = true, max_journals = EXCLUDED.max_journals;

  -- isolated journals (the default journals created by on_auth_user_created are removed first)
  DELETE FROM public.journals WHERE user_id IN (v_free, v_prem, v_other);
  INSERT INTO public.journals (user_id, name, is_active, is_default) VALUES (v_free, 'BT Test 1', true, false)  RETURNING id INTO v_j_free1;
  INSERT INTO public.journals (user_id, name, is_active, is_default) VALUES (v_free, 'BT Test 2', true, false)  RETURNING id INTO v_j_free2;
  INSERT INTO public.journals (user_id, name, is_active, is_default) VALUES (v_free, 'BT Archived', false, false) RETURNING id INTO v_j_inact;
  INSERT INTO public.journals (user_id, name, is_active, is_default) VALUES (v_other, 'BT Other', true, false) RETURNING id INTO v_j_other;

  -- ---------------------------------------------------------- S1 free user: first active account
  BEGIN
    INSERT INTO public.backtest_accounts (user_id, journal_id, name, symbol, starting_balance, replay_time)
    VALUES (v_free, v_j_free1, 'BT free', 'EURUSD', 10000, '2024-01-02 00:00:00+00') RETURNING id INTO v_acc;
    v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S1 free user can open 1 active account';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S1 free user 1st account: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- S2 free user: quota 1
  BEGIN
    INSERT INTO public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time)
    VALUES (v_free, 'BT free 2', 'EURUSD', 10000, now());
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S2 free user 2nd active account was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'BACKTEST_LIMIT_EXCEEDED:1%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S2 free quota (BACKTEST_LIMIT_EXCEEDED:1)';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S2 unexpected: ' || SQLERRM; END IF;
  END;

  -- ---------------------------------------------------------- S3 premium: 10 ok, 11th refused
  BEGIN
    FOR v_n IN 1..10 LOOP
      INSERT INTO public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time)
      VALUES (v_prem, 'BT prem ' || v_n, 'BTCUSDT', 10000, now());
    END LOOP;
    BEGIN
      INSERT INTO public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time)
      VALUES (v_prem, 'BT prem 11', 'BTCUSDT', 10000, now());
      v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S3 premium 11th account was accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'BACKTEST_LIMIT_EXCEEDED:10%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S3 premium quota 10 (11th: BACKTEST_LIMIT_EXCEEDED:10)';
      ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S3 unexpected: ' || SQLERRM; END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S3 premium could not open 10 accounts: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- S4/S5 journal ownership
  BEGIN
    INSERT INTO public.backtest_accounts (user_id, journal_id, name, symbol, starting_balance, replay_time, is_active)
    VALUES (v_free, v_j_other, 'x', 'EURUSD', 1000, now(), false);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S4 another user''s journal was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_JOURNAL%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S4 another user''s journal refused (INVALID_JOURNAL)';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S4 unexpected: ' || SQLERRM; END IF;
  END;
  BEGIN
    UPDATE public.backtest_accounts SET journal_id = v_j_inact WHERE id = v_acc;
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S5 inactive journal was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_JOURNAL%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S5 inactive journal refused (INVALID_JOURNAL)';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S5 unexpected: ' || SQLERRM; END IF;
  END;

  -- ---------------------------------------------------------- S6 symbol immutable, S7 NaN guard
  BEGIN
    UPDATE public.backtest_accounts SET symbol = 'GBPUSD' WHERE id = v_acc;
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S6 symbol change was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'BACKTEST_ACCOUNT_IMMUTABLE:symbol%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S6 symbol immutable';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S6 unexpected: ' || SQLERRM; END IF;
  END;
  BEGIN
    INSERT INTO public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time, is_active)
    VALUES (v_free, 'nan', 'EURUSD', 'NaN', now(), false);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S7 NaN starting_balance was accepted';
  EXCEPTION WHEN check_violation THEN
    v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S7 NaN starting_balance refused (' || SQLERRM || ')';
  WHEN OTHERS THEN
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S7 unexpected: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- S8/S9 trade integrity
  BEGIN
    INSERT INTO public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time)
    VALUES (v_free, v_acc, 'GBPUSD', 'LONG', 1, 1.27, '2024-01-02 00:01:00+00');
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S8 wrong symbol was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'BACKTEST_SYMBOL_MISMATCH%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S8 trade symbol must be the account symbol';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S8 unexpected: ' || SQLERRM; END IF;
  END;
  SELECT id INTO v_acc_oth FROM public.backtest_accounts WHERE user_id = v_prem LIMIT 1;
  BEGIN
    INSERT INTO public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time)
    VALUES (v_free, v_acc_oth, 'BTCUSDT', 'LONG', 1, 60000, now());
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S9 trade on another user''s account was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_BACKTEST_ACCOUNT%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S9 trade on another user''s account refused';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S9 unexpected: ' || SQLERRM; END IF;
  END;

  -- ---------------------------------------------------------- S10 open -> close -> final
  BEGIN
    INSERT INTO public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price,
                                                stop_loss, take_profit, rr_ratio, entry_time)
    VALUES (v_free, v_acc, 'EURUSD', 'LONG', 0.37, 1.08311, 1.08111, 1.08711, 2.00, '2024-01-02 00:01:00+00')
    RETURNING id INTO v_tr;
    UPDATE public.backtest_account_trades
       SET exit_price = 1.08423, exit_time = '2024-01-02 03:00:00+00', exit_reason = 'tp', pnl = 38.85, commission = 2.59
     WHERE id = v_tr;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.backtest_account_trades'::regclass AND attname = 'gross_pnl' AND NOT attisdropped) THEN
      RAISE EXCEPTION 'closing without gross_pnl should have failed (OPTIONAL column present)';
    END IF;
    v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S10a open + close (OPTIONAL columns not installed)';
  EXCEPTION WHEN check_violation THEN
    -- OPTIONAL gross_pnl installed: closing requires it
    BEGIN
      INSERT INTO public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price,
                                                  stop_loss, take_profit, rr_ratio, entry_time)
      VALUES (v_free, v_acc, 'EURUSD', 'LONG', 0.37, 1.08311, 1.08111, 1.08711, 2.00, '2024-01-02 00:01:00+00')
      RETURNING id INTO v_tr;
      EXECUTE 'UPDATE public.backtest_account_trades SET exit_price = 1.08423, exit_time = ''2024-01-02 03:00:00+00'', exit_reason = ''tp'', gross_pnl = 41.44, commission = 2.59, pnl = 38.85 WHERE id = $1' USING v_tr;
      v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S10a open + close with gross 41.44 / commission 2.59 / net 38.85';
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S10a open/close: ' || SQLERRM;
    END;
  WHEN OTHERS THEN
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S10a open/close: ' || SQLERRM;
  END;
  BEGIN
    UPDATE public.backtest_account_trades SET pnl = 999 WHERE id = v_tr;
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S10b closed trade was modified';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'BACKTEST_TRADE_CLOSED%' OR SQLSTATE = '23514' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S10b closed trade is final';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S10b unexpected: ' || SQLERRM; END IF;
  END;

  -- ---------------------------------------------------------- S11 owner guard / S12 RLS (as an API caller)
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    BEGIN
      INSERT INTO public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time, is_active)
      VALUES (v_other, 'x', 'EURUSD', 1000, now(), false);
      v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S11 row for another user accepted';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'BACKTEST_NOT_OWNER%' THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S11 row for another user refused before any check (BACKTEST_NOT_OWNER)';
      ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S11 unexpected: ' || SQLERRM; END IF;
    END;
    PERFORM set_config('role', 'authenticated', true);
    SELECT count(*) INTO v_n FROM public.backtest_accounts WHERE user_id = v_prem;
    PERFORM set_config('role', 'postgres', true);
    IF v_n = 0 THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S12 RLS: a user cannot see another user''s accounts';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S12 RLS: saw ' || v_n || ' foreign accounts'; END IF;
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S11/S12: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- S13/S14 delete_journal detaches accounts
  BEGIN
    UPDATE public.backtest_accounts SET journal_id = v_j_free2 WHERE id = v_acc;
    PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
    v_res := public.delete_journal(v_j_free2);
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    IF (SELECT journal_id FROM public.backtest_accounts WHERE id = v_acc) IS NULL THEN
      v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S13 delete_journal (delete branch) detached the account';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S13 account still linked'; END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S13: ' || SQLERRM;
  END;
  BEGIN
    INSERT INTO public.backtest_accounts (user_id, journal_id, name, symbol, starting_balance, replay_time)
    VALUES (v_other, v_j_other, 'BT other', 'XAUUSD', 5000, now()) RETURNING id INTO v_acc_oth;
    PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    v_res := public.delete_journal(v_j_other);   -- v_other has 1 active journal -> reset branch
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    IF coalesce((v_res ->> 'reset')::boolean, false) AND (SELECT journal_id FROM public.backtest_accounts WHERE id = v_acc_oth) IS NULL THEN
      v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S14 delete_journal (last-journal reset branch) detached the account';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S14 reset=' || coalesce(v_res ->> 'reset', 'null') || ', account still linked?'; END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S14: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- S15 cleanup triggers (migration 04)
  IF NOT v_has_04 THEN
    v_log := v_log || E'\n[SKIP] S15 cleanup triggers: 202610180004 not applied yet';
  ELSE
    BEGIN
      UPDATE public.backtest_accounts SET journal_id = v_j_free1 WHERE id = v_acc;
      INSERT INTO public.trades (user_id, journal_id, platform_source, import_hash, symbol, direction, lot, pnl, trade_date)
      VALUES (v_free, v_j_free1, 'backtest', 'backtest:' || v_acc || ':t1', 'EURUSD', 'LONG', 0.37, 38.85, '2024-01-02 00:01:00+00'),
             (v_free, v_j_free1, NULL, NULL, 'EURUSD', 'LONG', 1, 10, now());
      UPDATE public.backtest_accounts SET journal_id = NULL WHERE id = v_acc;   -- unlink
      SELECT count(*) INTO v_n FROM public.trades WHERE user_id = v_free AND import_hash = 'backtest:' || v_acc || ':t1';
      IF v_n = 0 AND (SELECT count(*) FROM public.trades WHERE user_id = v_free AND platform_source IS NULL) = 1 THEN
        v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S15a unlink removed the mirror, kept the live trade';
      ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S15a mirror rows left: ' || v_n; END IF;

      UPDATE public.backtest_accounts SET journal_id = v_j_free1 WHERE id = v_acc;
      INSERT INTO public.trades (user_id, journal_id, platform_source, import_hash, symbol, direction, lot, pnl, trade_date)
      VALUES (v_free, v_j_free1, 'backtest', 'backtest:' || v_acc || ':t2', 'EURUSD', 'LONG', 0.37, 38.85, '2024-01-02 00:01:00+00');
      DELETE FROM public.backtest_accounts WHERE id = v_acc;
      SELECT count(*) INTO v_n FROM public.trades WHERE user_id = v_free AND platform_source = 'backtest';
      IF v_n = 0 THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S15b account deletion removed its mirrors (and its trades cascaded)';
      ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S15b mirror rows left: ' || v_n; END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S15: ' || SQLERRM;
    END;
  END IF;

  -- ---------------------------------------------------------- S16 list_journals is live-only (migration 05)
  IF NOT coalesce(v_has_05, false) THEN
    v_log := v_log || E'\n[SKIP] S16 list_journals live-only stats: 202610180005 not applied yet';
  ELSE
    BEGIN
      INSERT INTO public.trades (user_id, journal_id, platform_source, import_hash, symbol, direction, lot, pnl, trade_date)
      VALUES (v_free, v_j_free1, 'backtest', 'backtest:00000000-0000-0000-0000-000000000000:s16', 'EURUSD', 'LONG', 1, 500, now());
      PERFORM set_config('request.jwt.claim.sub', v_free::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_free, 'role', 'authenticated')::text, true);
      SELECT trade_count INTO v_n FROM public.list_journals() WHERE id = v_j_free1;
      PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
      IF v_n = (SELECT count(*) FROM public.trades WHERE journal_id = v_j_free1 AND platform_source IS DISTINCT FROM 'backtest') THEN
        v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S16 list_journals trade_count excludes backtest rows (' || v_n || ')';
      ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S16 trade_count = ' || v_n; END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
      v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S16: ' || SQLERRM;
    END;
  END IF;

  -- ---------------------------------------------------------- S17 reset_user_data removes the backtest data
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_prem::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_prem, 'role', 'authenticated')::text, true);
    PERFORM public.reset_user_data();
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    SELECT count(*) INTO v_n FROM public.backtest_accounts WHERE user_id = v_prem;
    IF v_n = 0 THEN v_pass := v_pass + 1; v_log := v_log || E'\n[PASS] S17 reset_user_data deleted the user''s backtest accounts';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S17 accounts left: ' || v_n; END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    v_fail := v_fail + 1; v_log := v_log || E'\n[FAIL] S17: ' || SQLERRM;
  END;

  -- ---------------------------------------------------------- summary + rollback of everything above
  RAISE EXCEPTION E'\n============================================================\nBACKTEST V2 TEST SUMMARY: % PASS, % FAIL (everything was rolled back)\n============================================================%\n============================================================',
    v_pass, v_fail, v_log;
END $$;
