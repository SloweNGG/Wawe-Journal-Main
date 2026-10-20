CREATE OR REPLACE FUNCTION public.link_ctrader_account(p_account_id uuid, p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1) Defterin kullanıcıya ait ve aktif olduğunu doğrula
  IF NOT EXISTS (
    SELECT 1 FROM public.journals 
    WHERE id = p_journal_id AND user_id = v_uid AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Defter bulunamadı veya yetkisiz.');
  END IF;

  -- 2) cTrader hesabının bu kullanıcıya ait olduğunu doğrula
  IF NOT EXISTS (
    SELECT 1 FROM public.ctrader_accounts 
    WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cTrader hesabı bulunamadı.');
  END IF;

  -- 3) Bu deftere bağlı başka bir cTrader hesabı varsa önce onu boşa çıkar
  UPDATE public.ctrader_accounts
  SET journal_id = NULL, updated_at = now()
  WHERE user_id = v_uid AND journal_id = p_journal_id;

  -- 4) Seçili hesabı bu deftere bağla
  UPDATE public.ctrader_accounts
  SET journal_id = p_journal_id, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$function$
