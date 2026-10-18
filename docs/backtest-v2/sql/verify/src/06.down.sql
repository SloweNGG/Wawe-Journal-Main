-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180006 (six unused trade functions)
-- Migration: 202610180006_drop_unused_trade_functions.down.sql
-- Rollback of: supabase/migrations/202610180006_drop_unused_trade_functions.sql
-- Description: recreates the six functions from their LIVE bodies of 2026-10-18 (CRLF normalised to LF,
--   otherwise identical, except evaluate_prop_firm_rules, see below: same signatures, return types, languages, SECURITY DEFINER/INVOKER and
--   search_path settings - get_today_trades_count / get_total_trades_count had NO search_path live and
--   get this way again), then restores their EXECUTE privileges.
-- SECURITY NOTE: evaluate_prop_firm_rules(uuid) comes back with the SECURE body and ACL of
--   202610180000 (ownership check, no PUBLIC/anon), NOT the vulnerable live one, even if 202610180000
--   was never run. 202610180000.down.sql is what re-opens the hole.
-- ACLs: a recreated function gets PostgreSQL's default (EXECUTE for PUBLIC) plus Supabase's default
--   privileges (anon, authenticated, service_role), which is what the 2026-10-18 findings describe
--   (all six executable by anon). Section 2 re-states that explicitly. For an EXACT restore, replace
--   section 2 with the restore_sql output of pre-flight query P1, captured before 06 was run.
-- Stage: 6 (rollback)
-- Run order: rollback, step 1 of 5 (reverse order: this file, then 05, 04, 03, 02, 01)
-- Data loss: none.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 1. Recreate from the live bodies ---------------------------------------------------------------------
{{FN:evaluate_prop_firm_rules.s0}}

{{FN:sync_journal_trades.live}}

{{FN:get_journals_equity_data.live}}

{{FN:get_strategy_performance.live}}

{{FN:get_today_trades_count.live}}

{{FN:get_total_trades_count.live}}

-- 2. EXECUTE privileges (replace with the P1 restore_sql output for an exact restore) ------------------
-- evaluate_prop_firm_rules: the SECURE body (202610180000) and no PUBLIC/anon, so that rolling back 06 never
-- re-opens the IDOR. 202610180000.down.sql (last in the rollback order) restores the live body and ACL.
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_prop_firm_rules(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_journal_trades(uuid, jsonb) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_journals_equity_data()       TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_strategy_performance(uuid)   TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_today_trades_count()         TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_total_trades_count()         TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Bodies identical to the 2026-10-18 snapshot (expect 6 rows, all true):
--    SELECT v.fn, md5(translate(p.prosrc, E' \t\r\n', '')) = v.expected_md5 AS same_body
--      FROM (VALUES ('public.evaluate_prop_firm_rules(uuid)',   '{{MD5:evaluate_prop_firm_rules.s0}}'),
--                   ('public.sync_journal_trades(uuid, jsonb)', '{{MD5:sync_journal_trades.live}}'),
--                   ('public.get_journals_equity_data()',       '{{MD5:get_journals_equity_data.live}}'),
--                   ('public.get_strategy_performance(uuid)',   '{{MD5:get_strategy_performance.live}}'),
--                   ('public.get_today_trades_count()',         '{{MD5:get_today_trades_count.live}}'),
--                   ('public.get_total_trades_count()',         '{{MD5:get_total_trades_count.live}}')) AS v(fn, expected_md5)
--      LEFT JOIN pg_proc p ON p.oid = to_regprocedure(v.fn);
-- 2) ACLs equal the P1 capture:
--    SELECT oid::regprocedure, prosecdef, proconfig, proacl FROM pg_proc
--     WHERE proname IN ('evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
--                       'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count');
-- ============================================================
