CREATE OR REPLACE FUNCTION public.unlink_ctrader_account(p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.ctrader_accounts
  SET journal_id = NULL, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$function$
