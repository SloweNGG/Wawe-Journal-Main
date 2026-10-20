CREATE OR REPLACE FUNCTION public.update_journal(p_journal_id uuid, p_name text, p_description text, p_color text, p_icon text)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  UPDATE public.journals
  SET 
    name = trim(p_name),
    description = p_description,
    color = p_color,
    icon = p_icon
  WHERE id = p_journal_id AND user_id = v_uid
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND';
  END IF;

  RETURN v_result;
END;
$function$
