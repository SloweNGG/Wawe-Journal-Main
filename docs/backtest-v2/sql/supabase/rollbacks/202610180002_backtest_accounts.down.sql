-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180002 (backtest accounts and trades)
-- Migration: 202610180002_backtest_accounts.down.sql
-- Rollback of: supabase/migrations/202610180002_backtest_accounts.sql
-- Description:
--   0. Preconditions: refuses while 202610180004 is applied (roll it back first), checks that the two
--      functions are 02's version, and refuses to drop tables that still hold rows unless the data loss
--      is confirmed explicitly (see below).
--   1. Restores reset_user_data() to the 202610180001 version and delete_journal(uuid) to the LIVE body
--      of 2026-10-18, so no function references the tables any more.
--   2. Drops the 3 triggers, the 2 tables and the 2 trigger functions created by 02.
--      touch_updated_at() is NOT dropped (it pre-exists live and is used by trg_journals_updated_at).
-- Stage: 3A (rollback)
-- Run order: rollback, step 4 of 5 (reverse order: 06, 05, 04, 03, then this file, then 01)
-- !!! DATA LOSS WARNING !!!
--   Dropping the tables PERMANENTLY DELETES every backtest account and every backtest trade of every
--   user. Journal mirrors in public.trades (platform_source = 'backtest') are NOT touched by this file.
--   If any row exists, the file aborts unless this line (inside the transaction, right after BEGIN)
--   is uncommented:
--       SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';
--   Take a fresh backup (or an export of both tables) before confirming.
-- ACL note: delete_journal(uuid) had EXECUTE for anon (and PUBLIC) live. This rollback keeps them
--   revoked (the function rejects calls without auth.uid() anyway). To restore the exact pre-02 ACL,
--   uncomment the GRANT marked [EXACT-ACL] below, or use the output of pre-flight query P1.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5      text;
  v_accounts bigint := 0;
  v_trades   bigint := 0;
BEGIN
  IF to_regprocedure('public.backtest_accounts_cleanup_trades()') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: migration 202610180004 is still applied. Run supabase/rollbacks/202610180004_backtest_journal_link_cleanup.down.sql first.';
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.reset_user_data()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('053931abe8d9ac918922d85db0ff6aac', '5d0a2a09a51ff4e1479588a7e08c1fea') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() is neither the 202610180002 nor the 202610180001 version (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.delete_journal(uuid)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('afdbbce70341eeeaadb7c2a75f134d2d', '84e56367a98105b0c0aadb7467c51285') THEN
    RAISE EXCEPTION 'DRIFT: public.delete_journal(uuid) is neither the 202610180002 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;

  IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
    LOCK TABLE public.backtest_accounts IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO v_accounts FROM public.backtest_accounts;
  END IF;
  IF to_regclass('public.backtest_account_trades') IS NOT NULL THEN
    LOCK TABLE public.backtest_account_trades IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO v_trades FROM public.backtest_account_trades;
  END IF;

  IF (v_accounts > 0 OR v_trades > 0)
     AND coalesce(current_setting('wawe.confirm_backtest_v2_data_loss', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'DATA LOSS: % backtest account(s) and % backtest trade(s) would be deleted. Export/back them up, then uncomment SET LOCAL wawe.confirm_backtest_v2_data_loss = ''yes''; at the top of this file and run it again. Nothing was changed.', v_accounts, v_trades;
  END IF;
END $$;

-- 1. Functions back to their pre-02 versions -------------------------------------------------------

-- 1a. reset_user_data(): 202610180001 version
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

  -- 1. Trades
  DELETE FROM public.trades WHERE user_id = v_uid;

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

REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

-- 1b. delete_journal(uuid): LIVE body of 2026-10-18 (CRLF normalised to LF, otherwise identical)
CREATE OR REPLACE FUNCTION public.delete_journal(p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_default boolean;
    v_total_count int;
    v_other_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Lütfen oturum açın.';
    END IF;

    SELECT is_default INTO v_is_default
    FROM public.journals
    WHERE id = p_journal_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOURNAL_NOT_FOUND: Defter bulunamadı.';
    END IF;

    DELETE FROM public.trades WHERE journal_id = p_journal_id;
    DELETE FROM public.strategies WHERE journal_id = p_journal_id;

    SELECT count(*) INTO v_total_count
    FROM public.journals
    WHERE user_id = v_user_id AND is_active = true;

    -- Tek defter varsa sıfırla (409 hatası vermez)
    IF v_total_count <= 1 THEN
        UPDATE public.journals
        SET name = 'Ana Defter',
            description = NULL,
            color = '#7c6dfa',
            icon = 'book-open',
            is_default = true,
            platform = NULL,
            is_connected = false,
            connection_status = 'disconnected',
            last_synced_at = NULL,
            is_prop_firm = false,
            prop_firm_rules = NULL,
            prop_firm_status = 'none',
            prop_firm_stats = NULL,
            updated_at = now()
        WHERE id = p_journal_id;

        RETURN jsonb_build_object('success', true, 'message', 'Defter sıfırlandı.', 'reset', true);
    END IF;

    IF v_is_default THEN
        SELECT id INTO v_other_id
        FROM public.journals
        WHERE user_id = v_user_id AND id != p_journal_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_other_id IS NOT NULL THEN
            UPDATE public.journals SET is_default = true, updated_at = now() WHERE id = v_other_id;
        END IF;
    END IF;

    DELETE FROM public.journals WHERE id = p_journal_id AND user_id = v_user_id;
    RETURN jsonb_build_object('success', true, 'deleted_id', p_journal_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_journal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_journal(uuid) TO authenticated;
-- [EXACT-ACL] GRANT EXECUTE ON FUNCTION public.delete_journal(uuid) TO PUBLIC, anon;

-- 2. Triggers, tables (DATA LOSS, see header), trigger functions ------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_account_trades') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_check_backtest_trade ON public.backtest_account_trades;
  END IF;
  IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_check_backtest_account_limit ON public.backtest_accounts;
    DROP TRIGGER IF EXISTS trg_backtest_accounts_updated_at ON public.backtest_accounts;
  END IF;
END $$;

DROP TABLE IF EXISTS public.backtest_account_trades;
DROP TABLE IF EXISTS public.backtest_accounts;

DROP FUNCTION IF EXISTS public.check_backtest_trade();
DROP FUNCTION IF EXISTS public.check_backtest_account_limit();
-- public.touch_updated_at() is intentionally kept.

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Tables and trigger functions gone (expect NULL x4):
--    SELECT to_regclass('public.backtest_accounts'), to_regclass('public.backtest_account_trades'),
--           to_regprocedure('public.check_backtest_account_limit()'), to_regprocedure('public.check_backtest_trade()');
-- 2) touch_updated_at still there (expect not NULL):
--    SELECT to_regprocedure('public.touch_updated_at()');
-- 3) Function versions (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '5d0a2a09a51ff4e1479588a7e08c1fea' FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '84e56367a98105b0c0aadb7467c51285' FROM pg_proc WHERE oid = 'public.delete_journal(uuid)'::regprocedure;
-- 4) Leftover journal mirrors, if any (decide separately whether to delete them):
--    SELECT count(*) FROM public.trades WHERE platform_source = 'backtest';
-- ============================================================
