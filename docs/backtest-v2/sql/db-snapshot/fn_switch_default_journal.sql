CREATE OR REPLACE FUNCTION public.switch_default_journal(p_journal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_default boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT is_default INTO v_is_default
  FROM public.journals
  WHERE id = p_journal_id AND user_id = v_uid AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND';
  END IF;

  IF v_is_default THEN
    RETURN;
  END IF;

  UPDATE public.journals 
  SET is_default = false 
  WHERE user_id = v_uid AND is_default = true;

  UPDATE public.journals 
  SET is_default = true 
  WHERE id = p_journal_id AND user_id = v_uid;
END;
$function$
