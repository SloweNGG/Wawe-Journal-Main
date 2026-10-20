-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180000 (evaluate_prop_firm_rules ownership check)
-- Migration: 202610180000_secure_evaluate_prop_firm_rules.down.sql
-- Rollback of: supabase/migrations/202610180000_secure_evaluate_prop_firm_rules.sql
-- Description: recreates evaluate_prop_firm_rules(uuid) from its LIVE body of 2026-10-18 (no ownership
--   check) and grants EXECUTE to PUBLIC, anon, authenticated and service_role again, which is what the
--   2026-10-18 findings describe.
-- !!! SECURITY NOTE: this RE-OPENS the anon-executable SECURITY DEFINER IDOR. Use it only for a
--   verified regression caused by the fix, and re-apply the fix quickly.
-- Stage: 0 (rollback)
-- Run order: rollback, last (reverse order: 06, 05, 04, 03, 02, 01, then this file)
-- Data loss: none.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

{{FN:evaluate_prop_firm_rules.live}}

GRANT EXECUTE ON FUNCTION public.evaluate_prop_firm_rules(uuid) TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Body identical to the 2026-10-18 snapshot (expect true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:evaluate_prop_firm_rules.live}}' AS same_body
--      FROM pg_proc WHERE oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure;
-- ============================================================
