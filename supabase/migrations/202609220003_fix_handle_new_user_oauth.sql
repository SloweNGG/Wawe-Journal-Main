-- ============================================================
-- FIX: handle_new_user trigger function for OAuth & Email Signups
-- Kökten Çözüm: Google OAuth ve tüm kayıt akışlarında "Database error saving new user" hatasını önler.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_username text;
  v_final_username text;
  v_counter int := 1;
BEGIN
  -- 1. Kullanıcı adını belirle
  v_base_username := COALESCE(
    NULLIF(trim(new.raw_user_meta_data ->> 'username'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'name'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1),
    'trader'
  );

  -- Alfanümerik ve izin verilen karakterleri filtrele
  v_base_username := lower(regexp_replace(v_base_username, '[^a-zA-Z0-9_.-]', '', 'g'));
  IF length(v_base_username) < 3 THEN
    v_base_username := 'trader_' || substr(replace(new.id::text, '-', ''), 1, 6);
  END IF;

  v_final_username := v_base_username;

  -- 2. Eğer bu username başka bir kullanıcı tarafından alınmışsa sonuna sayı ekle (Unique çakışmasını önle!)
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(v_final_username) AND id <> new.id) LOOP
    v_final_username := substr(v_base_username, 1, 20) || '_' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;

  -- 3. user_profiles tablosuna güvenli ekleme / güncelleme
  BEGIN
    INSERT INTO public.user_profiles (id, email, username, plan, role, is_active, max_journals)
    VALUES (new.id, new.email, v_final_username, 'free', 'user', true, 2)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      is_active = COALESCE(public.user_profiles.is_active, true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'user_profiles insert failed: %', SQLERRM;
  END;

  -- 4. Varsayılan Journal kaydı oluşturma
  BEGIN
    IF to_regclass('public.journals') IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.journals WHERE user_id = new.id) THEN
        INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
        VALUES (new.id, 'Ana Hesap', 'Varsayılan hesap', '#7c6dfa', 'folder', true, true);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'journals insert failed: %', SQLERRM;
  END;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- ⭐ KRİTİK: Hiçbir hata auth.users kaydını geri döndürmemeli!
  RAISE WARNING 'handle_new_user critical fallback: %', SQLERRM;
  RETURN new;
END;
$$;

-- Trigger'ın auth.users tablosuna bağlı olduğundan emin ol
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

