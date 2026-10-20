CREATE OR REPLACE FUNCTION public.reset_user_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_default_jid UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Trades & Backtest
  DELETE FROM public.trades WHERE user_id = v_uid;

  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    DELETE FROM public.backtest_trades WHERE user_id = v_uid;
  END IF;

  -- 2. Stratejiler
  IF to_regclass('public.strategies') IS NOT NULL THEN
    DELETE FROM public.strategies WHERE user_id = v_uid;
  END IF;

  -- 3. Bildirimler
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE user_id = v_uid;
  END IF;

  -- 4. User Onboarding
  IF to_regclass('public.user_onboarding') IS NOT NULL THEN
    DELETE FROM public.user_onboarding WHERE user_id = v_uid;
  END IF;

  -- 5. Defterler (Journals)
  -- Özel defterleri sil, varsayılan defteri temizle/oluştur
  IF to_regclass('public.journals') IS NOT NULL THEN
    DELETE FROM public.journals WHERE user_id = v_uid AND is_default = false;

    SELECT id INTO v_default_jid FROM public.journals WHERE user_id = v_uid AND is_default = true LIMIT 1;
    IF v_default_jid IS NULL THEN
      INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
      VALUES (v_uid, 'Ana Hesap', 'Varsayılan işlem günlüğü', '#7c6dfa', 'folder', true, true);
    ELSE
      UPDATE public.journals
      SET name = 'Ana Hesap', description = 'Varsayılan işlem günlüğü', color = '#7c6dfa', icon = 'folder', is_active = true
      WHERE id = v_default_jid;
    END IF;
  END IF;

  -- 6. cTrader senkron imleci: işlemler silindiği için bir sonraki senkron tüm geçmişi (en fazla 90 gün) yeniden
  --    getirsin (eskiden imleç korunuyor ve yalnızca son 2 gün geri geliyordu).
  IF to_regclass('public.ctrader_accounts') IS NOT NULL THEN
    UPDATE public.ctrader_accounts
    SET last_deal_timestamp = NULL, last_error = NULL, updated_at = now()
    WHERE user_id = v_uid;
  END IF;
END;
$function$;
