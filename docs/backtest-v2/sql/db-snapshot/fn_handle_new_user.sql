CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_username text;
  v_final_username text;
  v_counter int := 1;
BEGIN
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

  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(v_final_username) AND id <> new.id) LOOP
    v_final_username := substr(v_base_username, 1, 20) || '_' || v_counter;
    v_counter := v_counter + 1;
  END LOOP;

  INSERT INTO public.user_profiles (id, email, username, plan, role, is_active, max_journals, last_active)
  VALUES (new.id, new.email, v_final_username, 'free', 'user', true, 2, now())
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.user_profiles.email, new.email),
    username = COALESCE(NULLIF(public.user_profiles.username, ''), EXCLUDED.username, v_final_username),
    is_active = COALESCE(public.user_profiles.is_active, true),
    last_active = now();

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
$function$
