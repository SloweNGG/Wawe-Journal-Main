-- ============================================================
-- FIX: USER PROFILES, ROBUST TRIGGER & SUPABASE REALTIME
-- ============================================================

-- 1. Eksik sütunların (özellikle max_journals) tabloda var olduğundan emin ol
ALTER TABLE public.user_profiles 
  ADD COLUMN IF NOT EXISTS max_journals integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS last_active timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- 2. Var olan eksik/boş kullanıcıları auth.users tablosundaki bilgilerle onar
UPDATE public.user_profiles up
SET 
  email = COALESCE(NULLIF(up.email, ''), au.email),
  username = COALESCE(
    NULLIF(up.username, ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'username'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'name'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    split_part(au.email, '@', 1),
    'trader_' || substr(replace(au.id::text, '-', ''), 1, 6)
  )
FROM auth.users au
WHERE up.id = au.id
  AND (up.email IS NULL OR up.email = '' OR up.username IS NULL OR up.username = '');

-- auth.users'ta olup user_profiles'ta hiç olmayan kullanıcı varsa ekle
INSERT INTO public.user_profiles (id, email, username, plan, role, is_active, max_journals, last_active, created_at)
SELECT 
  au.id,
  au.email,
  COALESCE(
    NULLIF(trim(au.raw_user_meta_data ->> 'username'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'name'), ''),
    NULLIF(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    split_part(au.email, '@', 1),
    'trader_' || substr(replace(au.id::text, '-', ''), 1, 6)
  ),
  'free',
  'user',
  true,
  2,
  now(),
  au.created_at
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = au.id)
ON CONFLICT (id) DO NOTHING;

-- 3. Yenilenmiş ve hatasız çalışan handle_new_user() trigger fonksiyonu
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
  -- Kullanıcı adını belirle
  v_base_username := COALESCE(
    NULLIF(trim(new.raw_user_meta_data ->> 'username'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'name'), ''),
    NULLIF(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1),
    'trader'
  );

  v_base_username := lower(regexp_replace(v_base_username, '[^a-zA-Z0-9_.-]', '', 'g'));
  IF length(v_base_username) < 3 THEN
    v_base_username := 'trader_' || substr(replace(new.id::text, '-', ''), 1, 6);
  END IF;

  v_final_username := v_base_username;

  -- Benzersiz kullanıcı adı sağla (Çakışma varsa sonuna sayı ekle)
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(v_final_username) AND id <> new.id) LOOP
    v_final_username := substr(v_base_username, 1, 20) || '_' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;

  -- user_profiles tablosuna ekle veya güncelle
  INSERT INTO public.user_profiles (id, email, username, plan, role, is_active, max_journals, last_active)
  VALUES (new.id, new.email, v_final_username, 'free', 'user', true, 2, now())
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.user_profiles.email, new.email),
    username = COALESCE(NULLIF(public.user_profiles.username, ''), EXCLUDED.username, v_final_username),
    is_active = COALESCE(public.user_profiles.is_active, true),
    last_active = now();

  -- Varsayılan Journal kaydı oluştur
  IF to_regclass('public.journals') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.journals WHERE user_id = new.id) THEN
      INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
      VALUES (new.id, 'Ana Hesap', 'Varsayılan hesap', '#7c6dfa', 'folder', true, true);
    END IF;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN new;
END;
$$;

-- Trigger'ı auth.users üzerine bağla
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Supabase Realtime yayınını etkinleştir (Admin paneline canlı anlık veri düşmesi için)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_profiles;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
