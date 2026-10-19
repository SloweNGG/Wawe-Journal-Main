-- ============================================================
-- WAWE JOURNAL - SECURITY FIX: evaluate_prop_firm_rules(uuid) OWNERSHIP CHECK + NO ANON ACCESS
-- Migration: 202610180000_secure_evaluate_prop_firm_rules.sql
-- Description:
--   public.evaluate_prop_firm_rules(uuid) is SECURITY DEFINER, executable by anon and PUBLIC, and does
--   not check who calls it: anyone with the public anon key could call /rest/v1/rpc/evaluate_prop_firm_rules
--   with ANY journal id and make it UPDATE journals.prop_firm_status / prop_firm_stats (IDOR).
--   This migration closes it without dropping anything (Migration 06 may drop it later):
--     1. EXECUTE is revoked from PUBLIC and anon; authenticated and service_role keep it
--        (sync_journal_trades calls it as the journal owner).
--     2. The body gets an ownership check: a caller with a user id (auth.uid()) must own the journal,
--        otherwise 42501, except an admin (public.is_admin()), who may evaluate any journal.
--        A caller without a user id is accepted only if its JWT role is neither
--        'anon' nor 'authenticated' (service_role, or a direct SQL session such as the SQL Editor).
--   Everything else in the body is the 2026-10-18 live body, unchanged (exact string edits, see build.mjs).
--   Independent of Migration 06 and of the Backtest v2 migrations: it can run first, alone.
--   Migration 06 accepts both this body and the live body in its drift guard.
-- Stage: 0 (security)
-- Run order: 0 (before 01)
-- Rollback: supabase/rollbacks/202610180000_secure_evaluate_prop_firm_rules.down.sql
--   (re-opens the hole: only for a verified regression)
-- Prerequisites: none. Recommended: a fresh backup first (R48), although this file changes no data.
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction). Idempotent.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regprocedure('public.evaluate_prop_firm_rules(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.evaluate_prop_firm_rules(uuid) does not exist (already dropped by 06?). Nothing to secure.';
  END IF;

  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.is_admin() does not exist (the ownership check lets admins through).';
  END IF;

  -- DRIFT: the function must be the 2026-10-18 live body or this migration's body (re-run).
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure;
  IF v_md5 NOT IN ('{{MD5:evaluate_prop_firm_rules.live}}', '{{MD5:evaluate_prop_firm_rules.s0}}') THEN
    RAISE EXCEPTION 'DRIFT: public.evaluate_prop_firm_rules(uuid) changed since the 2026-10-18 snapshot (normalised md5 %). Review it before replacing it.', v_md5;
  END IF;
END $$;

-- 1. Body with the ownership check ---------------------------------------------
{{FN:evaluate_prop_firm_rules.s0}}

-- 2. EXECUTE privileges: no PUBLIC, no anon ----------------------------------------
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_prop_firm_rules(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Expect: anon_can_exec = false, public_can_exec = false, authenticated_can_exec = true, same_body = true:
--    SELECT has_function_privilege('anon', 'public.evaluate_prop_firm_rules(uuid)', 'EXECUTE')          AS anon_can_exec,
--           has_function_privilege('authenticated', 'public.evaluate_prop_firm_rules(uuid)', 'EXECUTE') AS authenticated_can_exec,
--           (SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--             WHERE p.oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure AND a.privilege_type = 'EXECUTE') AS public_can_exec,
--           (SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:evaluate_prop_firm_rules.s0}}'
--              FROM pg_proc WHERE oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure) AS same_body;
-- 2) From a client with only the anon key, POST /rest/v1/rpc/evaluate_prop_firm_rules {"p_journal_id": "<any uuid>"}
--    must answer 401/403 ("permission denied for function").
-- 3) App smoke test: connecting/syncing a cTrader journal still works (sync_journal_trades -> evaluate).
-- ============================================================
