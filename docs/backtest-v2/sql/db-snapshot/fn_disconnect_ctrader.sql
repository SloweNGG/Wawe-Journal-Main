CREATE OR REPLACE FUNCTION public.disconnect_ctrader()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  DELETE FROM public.ctrader_tokens WHERE user_id = v_uid;
  DELETE FROM public.ctrader_accounts WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$function$
