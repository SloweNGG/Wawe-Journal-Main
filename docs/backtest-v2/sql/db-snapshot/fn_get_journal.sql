CREATE OR REPLACE FUNCTION public.get_journal(p_journal_id uuid)
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

  SELECT * INTO v_result
  FROM public.journals
  WHERE id = p_journal_id AND user_id = v_uid AND is_active = true;

  RETURN v_result;
END;
$function$
