CREATE OR REPLACE FUNCTION public.create_journal(p_name text, p_description text, p_color text, p_icon text)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_count int;
  v_is_first boolean;
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  -- Premium kullanıcı için en az 10, free kullanıcı için DB değeri veya varsayılan 2
  SELECT 
    CASE 
      WHEN plan = 'premium' AND (plan_expires_at IS NULL OR plan_expires_at > now()) 
      THEN GREATEST(COALESCE(max_journals, 2), 10)
      ELSE COALESCE(max_journals, 2)
    END
  INTO v_max
  FROM public.user_profiles
  WHERE id = v_uid;

  IF v_max IS NULL THEN
    v_max := 2;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journals
  WHERE user_id = v_uid AND is_active = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'JOURNAL_QUOTA_EXCEEDED:%', v_max;
  END IF;

  v_is_first := (v_count = 0);

  INSERT INTO public.journals (
    user_id, name, description, color, icon, is_default, is_active
  ) VALUES (
    v_uid,
    trim(p_name),
    p_description,
    COALESCE(p_color, '#7c6dfa'),
    COALESCE(p_icon, '📁'),
    v_is_first,
    true
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$
