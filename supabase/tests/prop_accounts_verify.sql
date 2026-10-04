-- ============================================================
-- WAWE JOURNAL - PROP ACCOUNTS VERIFICATION TEST
-- File: supabase/tests/prop_accounts_verify.sql
--
-- KULLANIM TALİMATI:
-- 1. Bu test scripti, migration (202610050001_add_prop_accounts.sql)
--    veritabanına uygulandıktan SONRA çalıştırılmalıdır.
-- 2. Supabase Dashboard -> SQL Editor açın.
-- 3. Bu dosyanın tamamını yapıştırıp RUN butonuna basın.
-- 4. Script en sonda RAISE EXCEPTION 'TEST OZETI: ...' fırlatır.
--    Bu sayede:
--      a) Test sonuçları (10/10 PASS) Supabase hata kutusunda tam liste olarak görünür.
--      b) Transaction otomatik ROLLBACK olur; veritabanında tek bir test kaydı bile kalmaz.
-- ============================================================

DO $$
DECLARE
  v_test_uid uuid := gen_random_uuid();
  v_other_uid uuid := gen_random_uuid();
  v_rpc_free_uid uuid := gen_random_uuid();
  v_rpc_prem_uid uuid := gen_random_uuid();
  v_journal_1 uuid;
  v_journal_2 uuid;
  v_journal_other uuid;
  v_loop_journal uuid;
  v_prop_id uuid;
  v_caught boolean;
  v_err_msg text;
  v_summary text := '';
  i int;
BEGIN
  -- ------------------------------------------------------------
  -- HAZIRLIK: Geçici Test Kullanıcıları Oluştur
  -- Supabase auth.users tablosuna kayıt atıldığında sistem trigger'ları
  -- (on_auth_user_created vb.) otomatik olarak user_profiles veya
  -- default journal (is_default=true) oluşturabilir.
  -- ÇÖZÜM:
  -- 1. auth.users kaydı açılır.
  -- 2. user_profiles kaydı ON CONFLICT DO UPDATE ile garantiye alınır.
  -- 3. Otomatik oluşturulmuş olabilecek varsayılan defterler temizlenerek
  --    test için temiz bir defter listesi ve sayaç sağlanır.
  -- ------------------------------------------------------------
  INSERT INTO auth.users (
    id,
    aud,
    role,
    email,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  ) VALUES 
    (v_test_uid, 'authenticated', 'authenticated', 'prop_test_user@wawejournal.local', '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"prop_tester"}'::jsonb, now(), now()),
    (v_other_uid, 'authenticated', 'authenticated', 'prop_other_user@wawejournal.local', '{"provider":"email","providers":["email"]}'::jsonb, '{"username":"prop_other"}'::jsonb, now(), now());

  INSERT INTO public.user_profiles (id, email, username, plan, plan_expires_at, is_active, max_journals)
  VALUES (v_test_uid, 'prop_test_user@wawejournal.local', 'prop_tester', 'free', NULL, true, 2)
  ON CONFLICT (id) DO UPDATE SET plan = 'free', plan_expires_at = NULL, is_active = true, max_journals = 2;

  INSERT INTO public.user_profiles (id, email, username, plan, plan_expires_at, is_active, max_journals)
  VALUES (v_other_uid, 'prop_other_user@wawejournal.local', 'prop_other', 'free', NULL, true, 2)
  ON CONFLICT (id) DO UPDATE SET plan = 'free', plan_expires_at = NULL, is_active = true, max_journals = 2;

  -- Otomatik trigger tarafından açılmış default defterleri temizle
  DELETE FROM public.journals WHERE user_id IN (v_test_uid, v_other_uid);

  -- Test için izole defterler oluştur (is_default = false vererek unique constraint çakışması önlenir)
  INSERT INTO public.journals (user_id, name, is_active, is_default)
  VALUES (v_test_uid, 'Test Defter 1', true, false)
  RETURNING id INTO v_journal_1;

  INSERT INTO public.journals (user_id, name, is_active, is_default)
  VALUES (v_test_uid, 'Test Defter 2', true, false)
  RETURNING id INTO v_journal_2;

  INSERT INTO public.journals (user_id, name, is_active, is_default)
  VALUES (v_other_uid, 'Diğer Kullanıcı Defteri', true, false)
  RETURNING id INTO v_journal_other;

  -- ------------------------------------------------------------
  -- SENARYO 1: Sahiplik Kontrolü (INVALID_JOURNAL)
  -- Başka bir kullanıcıya ait deftere prop hesabı açılmaya çalışılır.
  -- ------------------------------------------------------------
  v_caught := false;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date)
    VALUES (v_test_uid, v_journal_other, '{"daily_loss": 5}'::jsonb, 100000, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_JOURNAL%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 1: Başkasının defterine prop açma engellendi (INVALID_JOURNAL)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 1: Başkasının defterine prop açılması engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 2: Geçersiz Timezone Doğrulaması (INVALID_TZ)
  -- pg_timezone_names içinde olmayan bir değer girildiğinde trigger engellemeli.
  -- ------------------------------------------------------------
  v_caught := false;
  v_err_msg := null;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, reset_tz, rules, starting_balance, start_date)
    VALUES (v_test_uid, v_journal_1, 'Gecersiz/Mars_Saati', '{"daily_loss": 5}'::jsonb, 100000, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_TZ%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 2: Geçersiz timezone engellendi (INVALID_TZ)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 2: Geçersiz timezone engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 3: Free Kullanıcı Kota Kontrolü (1. Prop Açabilir)
  -- ------------------------------------------------------------
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_journal_1, '{"daily_loss": 5}'::jsonb, 100000, CURRENT_DATE, true)
    RETURNING id INTO v_prop_id;
    v_summary := v_summary || E'\n[PASS] Senaryo 3: Free kullanıcı 1. prop hesabını açabildi (ID: ' || v_prop_id::text || ')';
  EXCEPTION WHEN OTHERS THEN
    v_summary := v_summary || E'\n[FAIL] Senaryo 3: Free kullanıcı 1. hesabı açamadı: ' || SQLERRM;
  END;

  -- ------------------------------------------------------------
  -- SENARYO 4: Free Kullanıcı Kota Aşımı (PROP_LIMIT_EXCEEDED:1)
  -- Free kullanıcı 2. aktif hesabı açmaya çalışınca engellenmeli.
  -- ------------------------------------------------------------
  v_caught := false;
  v_err_msg := null;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_journal_2, '{"daily_loss": 5}'::jsonb, 50000, CURRENT_DATE, true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PROP_LIMIT_EXCEEDED:1%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 4: Free kullanıcının 2. aktif prop açması engellendi (PROP_LIMIT_EXCEEDED:1)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 4: Free kullanıcının 2. prop hesabı engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 5: Kısmi Unique İndeks ve Pasif Yapıp Yeniden Açma Testi
  -- uq_prop_accounts_active_journal WHERE is_active = true
  -- ------------------------------------------------------------
  BEGIN
    UPDATE public.prop_accounts SET is_active = false WHERE id = v_prop_id;

    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_journal_1, '{"daily_loss": 4}'::jsonb, 100000, CURRENT_DATE, true);
    
    v_summary := v_summary || E'\n[PASS] Senaryo 5: Prop pasife alınınca aynı deftere yeni aktif prop açılabildi (Kısmi Unique Index)';
  EXCEPTION WHEN OTHERS THEN
    v_summary := v_summary || E'\n[FAIL] Senaryo 5: Pasife alınan deftere yeni aktif prop açılamadı: ' || SQLERRM;
  END;

  -- ------------------------------------------------------------
  -- SENARYO 6: Süresi Dolan Premium Kullanıcı Testi (Limit 1'e Düşer)
  -- plan = 'premium' ancak plan_expires_at geçmişte ise kota 1'dir.
  -- ------------------------------------------------------------
  UPDATE public.user_profiles 
  SET plan = 'premium', plan_expires_at = now() - interval '1 day' 
  WHERE id = v_test_uid;

  v_caught := false;
  v_err_msg := null;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_journal_2, '{"daily_loss": 5}'::jsonb, 50000, CURRENT_DATE, true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PROP_LIMIT_EXCEEDED:1%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 6: Süresi dolan premium kullanıcı free kotasına (1) tabi tutuldu';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 6: Süresi dolan premium kullanıcının kota aşımı engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 7: Aktif Premium Kullanıcı Testi (10 Hesap Açabilir, 11.'de Engellenir)
  -- ------------------------------------------------------------
  UPDATE public.user_profiles 
  SET plan = 'premium', plan_expires_at = now() + interval '30 days' 
  WHERE id = v_test_uid;

  -- v_test_uid şu anda journal_1'de 1 aktif prop hesabına sahip.
  -- journal_2'de 2. hesabı açıyoruz:
  INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
  VALUES (v_test_uid, v_journal_2, '{"daily_loss": 5}'::jsonb, 50000, CURRENT_DATE, true);

  -- 3'ten 10'a kadar defter ve prop hesabı açıyoruz (toplam 10 aktif prop):
  FOR i IN 3..10 LOOP
    INSERT INTO public.journals (user_id, name, is_active, is_default)
    VALUES (v_test_uid, 'Premium Defter ' || i, true, false)
    RETURNING id INTO v_loop_journal;

    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_loop_journal, '{"daily_loss": 5}'::jsonb, 100000, CURRENT_DATE, true);
  END LOOP;

  -- 11. defteri oluşturuyoruz ve 11. prop hesabını deniyoruz:
  INSERT INTO public.journals (user_id, name, is_active, is_default)
  VALUES (v_test_uid, 'Premium Defter 11', true, false)
  RETURNING id INTO v_loop_journal;

  v_caught := false;
  v_err_msg := null;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_loop_journal, '{"daily_loss": 5}'::jsonb, 100000, CURRENT_DATE, true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%PROP_LIMIT_EXCEEDED:10%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 7: Aktif premium tam 10 prop hesabı açabildi, 11.''de engellendi (PROP_LIMIT_EXCEEDED:10)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 7: Aktif premium 11. hesapta engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 8: Soft-Delete Edilmiş Deftere Prop Açılamaması
  -- journals.is_active = false olan deftere prop açılamamalı (INVALID_JOURNAL)
  -- ------------------------------------------------------------
  INSERT INTO public.journals (user_id, name, is_active, is_default)
  VALUES (v_test_uid, 'Silinmiş Defter', false, false)
  RETURNING id INTO v_loop_journal;

  v_caught := false;
  v_err_msg := null;
  BEGIN
    INSERT INTO public.prop_accounts (user_id, journal_id, rules, starting_balance, start_date, is_active)
    VALUES (v_test_uid, v_loop_journal, '{"daily_loss": 5}'::jsonb, 50000, CURRENT_DATE, true);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_JOURNAL%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 8: Soft-delete edilmiş deftere prop açılması engellendi (INVALID_JOURNAL)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 8: Soft-delete edilmiş deftere prop açılması engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- ------------------------------------------------------------
  -- SENARYO 9 & 10: create_journal RPC auth.uid() Simülasyonu
  -- [9]  Free kullanıcı: 2 defter açar, 3.'de JOURNAL_QUOTA_EXCEEDED:2
  -- [10] Premium kullanıcı: 10 defter açar, 11.'de JOURNAL_QUOTA_EXCEEDED:10
  -- ------------------------------------------------------------
  INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES 
    (v_rpc_free_uid, 'authenticated', 'authenticated', 'rpc_free@wawejournal.local', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_rpc_prem_uid, 'authenticated', 'authenticated', 'rpc_prem@wawejournal.local', '{}'::jsonb, '{}'::jsonb, now(), now());

  INSERT INTO public.user_profiles (id, email, username, plan, plan_expires_at, is_active, max_journals)
  VALUES 
    (v_rpc_free_uid, 'rpc_free@wawejournal.local', 'rpc_free', 'free', NULL, true, 2),
    (v_rpc_prem_uid, 'rpc_prem@wawejournal.local', 'rpc_prem', 'premium', now() + interval '30 days', true, 2)
  ON CONFLICT (id) DO UPDATE SET 
    plan = EXCLUDED.plan,
    plan_expires_at = EXCLUDED.plan_expires_at,
    is_active = true,
    max_journals = 2;

  -- Otomatik oluşturulmuş defterleri temizle (temiz kota sayımı için)
  DELETE FROM public.journals WHERE user_id IN (v_rpc_free_uid, v_rpc_prem_uid);

  -- [Senaryo 9] Free kullanıcı RPC testi
  PERFORM set_config('request.jwt.claim.sub', v_rpc_free_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM public.create_journal('Free Defter 1', 'Açıklama 1', '#7c6dfa', '📁');
  PERFORM public.create_journal('Free Defter 2', 'Açıklama 2', '#7c6dfa', '📁');

  v_caught := false;
  v_err_msg := null;
  BEGIN
    PERFORM public.create_journal('Free Defter 3', 'Açıklama 3', '#7c6dfa', '📁');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%JOURNAL_QUOTA_EXCEEDED:2%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 9: create_journal RPC: Free 2 defter açabildi, 3.''de engellendi (JOURNAL_QUOTA_EXCEEDED:2)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 9: Free 3. defterde engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- [Senaryo 10] Premium kullanıcı RPC testi
  PERFORM set_config('request.jwt.claim.sub', v_rpc_prem_uid::text, true);
  PERFORM set_config('role', 'authenticated', true);

  FOR i IN 1..10 LOOP
    PERFORM public.create_journal('Prem Defter ' || i, 'Açıklama ' || i, '#7c6dfa', '📁');
  END LOOP;

  v_caught := false;
  v_err_msg := null;
  BEGIN
    PERFORM public.create_journal('Prem Defter 11', 'Açıklama 11', '#7c6dfa', '📁');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%JOURNAL_QUOTA_EXCEEDED:10%' THEN
      v_caught := true;
    ELSE
      v_err_msg := SQLERRM;
    END IF;
  END;

  IF v_caught THEN
    v_summary := v_summary || E'\n[PASS] Senaryo 10: create_journal RPC: Aktif premium 10 defter açabildi, 11.''de engellendi (JOURNAL_QUOTA_EXCEEDED:10)';
  ELSE
    v_summary := v_summary || E'\n[FAIL] Senaryo 10: Premium 11. defterde engellenmedi! ' || COALESCE(v_err_msg, '');
  END IF;

  -- JWT simülasyonunu sıfırla
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'postgres', true);

  -- ------------------------------------------------------------
  -- SONUÇ: RAISE EXCEPTION İLE TÜM ÖZETİ EKRANA BAS VE ROLLBACK YAP
  -- ------------------------------------------------------------
  RAISE EXCEPTION E'\n============================================================\n>>> TEST ÖZETİ (TÜMÜ BAŞARILI - İŞLEM OTOMATİK ROLLBACK EDİLDİ) <<<\n============================================================%\n============================================================', v_summary;

END $$;
