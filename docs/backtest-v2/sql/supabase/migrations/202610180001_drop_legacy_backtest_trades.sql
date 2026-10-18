-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 2: DROP THE LEGACY backtest_trades TABLE
-- Migration: 202610180001_drop_legacy_backtest_trades.sql
-- Description:
--   0. Preconditions (nothing is changed if one fails):
--      - public.backtest_trades must be EMPTY. It is counted under an ACCESS EXCLUSIVE lock, so no
--        insert can slip in between the count and the DROP (audit 2026-10-18: 0 rows, 0 users).
--      - public.reset_user_data() must still be the live body of the 2026-10-18 snapshot (drift guard).
--   1. reset_user_data(): rebuilt from the LIVE body (identical to
--      202610150003_ctrader_cursor_reset.sql:44-97). Only change: the guarded backtest_trades DELETE
--      (live lines 18-20) is removed and the step-1 comment is adjusted. Steps 2-6 are unchanged,
--      including step 6 (cTrader cursor reset). Attributes kept: SECURITY DEFINER,
--      SET search_path TO 'public', VOLATILE. ACL re-asserted: EXECUTE for authenticated only.
--   2. DROP TABLE public.backtest_trades (RESTRICT): an unexpected dependent aborts the transaction.
--      Its 4 policies, 4 indexes, PK, FK, grants and row types go with it. PostgREST reloads its
--      schema cache (pgrst_drop_watch event trigger; the NOTIFY below is a harmless extra).
-- Stage: 2 (removal of the old backtest)
-- Run order: 1
-- Rollback: supabase/rollbacks/202610180001_drop_legacy_backtest_trades.down.sql
-- Prerequisites:
--   * A FULL database backup taken IMMEDIATELY before this file (R48 / D11) and its location
--     reported to the owner. This is the first write of Backtest v2 to the live database.
--   * The Stage 2 client is deployed: src/pages/backtest.astro no longer inserts into
--     backtest_trades (today backtest.astro:516 and 525-535) and the settings.js fallback no longer
--     deletes from it (public/settings/js/settings.js:2359-2362).
-- How to run: Supabase Dashboard -> SQL Editor, paste the WHOLE file, Run. It is one transaction.
--   Do not use `supabase db push` (supabase_migrations.schema_migrations is empty on the live project,
--   so every file would be treated as pending).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------

-- 0a. Drift guard: reset_user_data must be the 2026-10-18 live body (or this file's version on a re-run).
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.reset_user_data()');

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.reset_user_data() does not exist.';
  ELSIF v_md5 = '053931abe8d9ac918922d85db0ff6aac' THEN
    RAISE EXCEPTION 'ALREADY SUPERSEDED: migration 202610180002 is applied (reset_user_data is its version). Do not re-run 202610180001; it would remove the Backtest v2 steps from reset_user_data.';
  ELSIF v_md5 NOT IN ('ffae73d9d6aeab7c8aa9504287ac4371', '5d0a2a09a51ff4e1479588a7e08c1fea') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() differs from the 2026-10-18 snapshot this file was built from (normalised md5 %). Re-base the file on SELECT pg_get_functiondef(''public.reset_user_data()''::regprocedure); before running it.', v_md5;
  END IF;
END $$;

-- 0b. The legacy table must be empty (checked under the lock that the DROP needs anyway).
DO $$
DECLARE
  v_rows bigint;
BEGIN
  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    LOCK TABLE public.backtest_trades IN ACCESS EXCLUSIVE MODE;
    SELECT count(*) INTO v_rows FROM public.backtest_trades;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'ABORT: public.backtest_trades has % row(s). Export or migrate them first; nothing was changed.', v_rows;
    END IF;
  END IF;
END $$;

-- 1. reset_user_data(): LIVE body without the legacy backtest_trades block ----------------------
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

-- 2. Drop the legacy table ------------------------------------------------------------------------
DROP TABLE IF EXISTS public.backtest_trades;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only; run them one by one after the COMMIT)
-- ------------------------------------------------------------
-- 1) The table is gone (expect NULL):
--    SELECT to_regclass('public.backtest_trades');
--
-- 2) No function body still mentions it (expect 0 rows):
--    SELECT p.oid::regprocedure
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
--       AND p.prosrc ILIKE '%backtest_trades%';
--
-- 3) reset_user_data is this file's version (expect true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '5d0a2a09a51ff4e1479588a7e08c1fea'
--      FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--
-- 4) Attributes and ACL (expect prosecdef = true, provolatile = 'v', proconfig = {search_path=public},
--    proacl with postgres, authenticated, service_role and WITHOUT anon or a bare "=X" PUBLIC entry):
--    SELECT prosecdef, provolatile, proconfig, proacl
--      FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
--
-- 5) App smoke test (owner): Settings -> "delete all data" still succeeds (RPC reset_user_data).
-- ============================================================
