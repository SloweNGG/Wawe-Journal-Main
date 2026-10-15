-- ============================================================
-- WAWE JOURNAL - cTrader senkron imlecinin (last_deal_timestamp) doğru sıfırlanması
-- Migration: 202610150003_ctrader_cursor_reset.sql
--
-- Sorun: ctrader_accounts.last_deal_timestamp "şu zamana kadarki işlemler alındı" imlecidir. Senkron her seferinde
-- imleçten 2 gün geriden başlar. İmleç şu durumlarda SIFIRLANMADIĞI için işlemler sessizce eksik kalıyordu:
--   1. Hesap başka bir deftere bağlanınca (link_ctrader_account / edge function): yeni defter yalnızca son 2 günü alıyordu.
--   2. reset_user_data() tüm işlemleri silince: yeniden senkron yalnızca son 2 günü geri getiriyordu.
--
-- Çözüm:
--   * ctrader_accounts üzerinde BEFORE UPDATE trigger: journal_id değişirse imleç NULL olur (hangi yoldan değişirse
--     değişsin: RPC, edge function, defter silinince ON DELETE SET NULL). NULL imleç = ilk senkron (en fazla 90 gün).
--     Tekrar riski yok: trades.import_hash (user_id, journal_id, import_hash) defter başına tekildir.
--   * reset_user_data(): cTrader imleçlerini de sıfırlar.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ctrader_reset_cursor_on_journal_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.journal_id IS DISTINCT FROM OLD.journal_id THEN
    NEW.last_deal_timestamp := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ctrader_reset_cursor ON public.ctrader_accounts;
CREATE TRIGGER trg_ctrader_reset_cursor
  BEFORE UPDATE ON public.ctrader_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ctrader_reset_cursor_on_journal_change();

-- reset_user_data: mevcut gövde + cTrader imleç sıfırlama
CREATE OR REPLACE FUNCTION public.reset_user_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.reset_user_data() FROM public;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

COMMIT;
