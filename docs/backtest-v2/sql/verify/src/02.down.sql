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
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:reset_user_data.v02}}', '{{MD5:reset_user_data.v01}}') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() is neither the 202610180002 nor the 202610180001 version (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.delete_journal(uuid)');
  IF v_md5 IS NULL OR v_md5 NOT IN ('{{MD5:delete_journal.v02}}', '{{MD5:delete_journal.live}}') THEN
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
{{FN:reset_user_data.v01}}

REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

-- 1b. delete_journal(uuid): LIVE body of 2026-10-18 (CRLF normalised to LF, otherwise identical)
{{FN:delete_journal.live}}

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
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:reset_user_data.v01}}' FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:delete_journal.live}}' FROM pg_proc WHERE oid = 'public.delete_journal(uuid)'::regprocedure;
-- 4) Leftover journal mirrors, if any (decide separately whether to delete them):
--    SELECT count(*) FROM public.trades WHERE platform_source = 'backtest';
-- ============================================================
