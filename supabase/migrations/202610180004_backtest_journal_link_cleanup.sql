-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 5: JOURNAL-LINK CLEANUP TRIGGERS
-- Migration: 202610180004_backtest_journal_link_cleanup.sql
-- Description (R18, D5):
--   A linked backtest account mirrors its closed trades into public.trades with
--   platform_source = 'backtest' and import_hash = 'backtest:<account id>:<trade id>'. This file makes
--   the database remove those mirrors, atomically with the account change, when:
--     - the link changes or is removed (AFTER UPDATE OF journal_id, only when OLD.journal_id was set
--       and changed);
--     - the account is deleted (AFTER DELETE), including cascades from auth user deletion and from
--       reset_user_data().
--   Rows deleted: user_id = OLD.user_id AND (journal_id = OLD.journal_id OR journal_id IS NULL)
--   AND left(import_hash, char_length(prefix)) = prefix, with prefix = 'backtest:<OLD.id>:'.
--     - left(...) = prefix instead of LIKE: an exact prefix test, no wildcard characters to escape.
--     - "OR journal_id IS NULL": when a journal is deleted directly (DELETE on journals, not through
--       delete_journal()), the FK trades.journal_id ON DELETE SET NULL may run BEFORE the FK
--       backtest_accounts.journal_id ON DELETE SET NULL that fires this trigger (the order of the two
--       FK actions is not defined), so the mirrors can already carry journal_id NULL.
--     - SECURITY DEFINER + SET search_path = public + explicit user_id filter: the trigger also fires
--       inside cascades run by other roles (auth user deletion by supabase_auth_admin, journal
--       deletion) where the invoker may lack privileges on public.trades; the user_id filter keeps it
--       to the account owner's rows.
--   On relink the client then backfills the new journal (D5); this file only removes.
-- Stage: 5 (journal sync)
-- Run order: 4
-- Rollback: supabase/rollbacks/202610180004_backtest_journal_link_cleanup.down.sql
-- Prerequisites: 202610180002 applied. Run BEFORE deploying the Stage 5+6 client (bt-sync.js writes
--   the mirrors; without these triggers a relink or an account deletion would leave stale mirrors).
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_bad text;
BEGIN
  IF to_regclass('public.backtest_accounts') IS NULL THEN
    RAISE EXCEPTION 'ORDER: run 202610180002_backtest_accounts.sql first (public.backtest_accounts does not exist).';
  END IF;

  IF (SELECT count(*) FROM pg_attribute
       WHERE attrelid = 'public.trades'::regclass AND NOT attisdropped
         AND attname IN ('user_id', 'journal_id', 'import_hash')) <> 3 THEN
    RAISE EXCEPTION 'PRECONDITION: public.trades must have user_id, journal_id and import_hash.';
  END IF;

  -- The SECURITY DEFINER function below runs as the current role and DELETEs from public.trades, which
  -- has RLS. That role must bypass RLS there, otherwise the DELETE would silently match 0 rows.
  SELECT string_agg(c.oid::regclass::text, ', ') INTO v_bad
    FROM pg_class c
   WHERE c.oid = 'public.trades'::regclass
     AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
     AND NOT (pg_get_userbyid(c.relowner) = current_user AND NOT c.relforcerowsecurity);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS on %. Run this file as postgres in the Supabase SQL Editor.', current_user, v_bad;
  END IF;
END $$;

-- 1. Cleanup function -----------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backtest_accounts_cleanup_trades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  -- Mirrors of this account: import_hash = 'backtest:<account id>:<trade id>'.
  v_prefix := 'backtest:' || OLD.id::text || ':';

  DELETE FROM public.trades t
   WHERE t.user_id = OLD.user_id
     AND (t.journal_id = OLD.journal_id OR t.journal_id IS NULL)
     AND left(t.import_hash, char_length(v_prefix)) = v_prefix;

  RETURN NULL; -- AFTER trigger: the return value is ignored
END;
$$;

-- Never called through the API (EXECUTE on a trigger function is only checked at CREATE TRIGGER time).
REVOKE ALL ON FUNCTION public.backtest_accounts_cleanup_trades() FROM PUBLIC, anon, authenticated;

-- 2. Triggers -------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_backtest_accounts_cleanup_relink ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_cleanup_relink
  AFTER UPDATE OF journal_id ON public.backtest_accounts
  FOR EACH ROW
  WHEN (OLD.journal_id IS NOT NULL AND OLD.journal_id IS DISTINCT FROM NEW.journal_id)
  EXECUTE FUNCTION public.backtest_accounts_cleanup_trades();

DROP TRIGGER IF EXISTS trg_backtest_accounts_cleanup_delete ON public.backtest_accounts;
CREATE TRIGGER trg_backtest_accounts_cleanup_delete
  AFTER DELETE ON public.backtest_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.backtest_accounts_cleanup_trades();

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Triggers (expect 2 rows, with the WHEN clause on the relink trigger):
--    SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--     WHERE tgrelid = 'public.backtest_accounts'::regclass AND tgname LIKE 'trg_backtest_accounts_cleanup_%';
-- 2) Function: SECURITY DEFINER, search_path=public, no anon/authenticated/PUBLIC EXECUTE, owner bypasses RLS:
--    SELECT p.prosecdef, p.proconfig, p.proacl, r.rolname, (r.rolsuper OR r.rolbypassrls) AS bypasses_rls
--      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
--     WHERE p.oid = 'public.backtest_accounts_cleanup_trades()'::regprocedure;
-- 3) No orphan mirrors (expect 0 rows; run any time later as a health check):
--    SELECT t.id, t.journal_id, t.import_hash FROM public.trades t
--     WHERE t.platform_source = 'backtest'
--       AND NOT EXISTS (SELECT 1 FROM public.backtest_accounts a
--                        WHERE a.user_id = t.user_id AND a.journal_id = t.journal_id
--                          AND left(t.import_hash, 46) = 'backtest:' || a.id::text || ':');
-- 4) Functional test without leaving data: supabase/tests/backtest_v2_verify.sql (owner-approved run).
-- ============================================================
