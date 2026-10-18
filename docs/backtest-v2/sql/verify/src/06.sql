-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 6 (OPTIONAL, OWNER DECISION): DROP SIX UNUSED TRADE FUNCTIONS
-- Migration: 202610180006_drop_unused_trade_functions.sql
-- Description (D6): six live-only SQL functions aggregate or write public.trades without any
--   platform_source filter, so backtest mirrors would count in them. None is called by the app; the
--   recommended fix is to drop them instead of patching them:
--     evaluate_prop_firm_rules(uuid)    SECURITY DEFINER, executable by anon, no auth.uid()/ownership
--                                       check, UPDATEs journals.prop_firm_status/stats for ANY journal
--                                       id (IDOR). Legacy journals.is_prop_firm system.
--     sync_journal_trades(uuid, jsonb)  SECURITY DEFINER; upserts trades ON CONFLICT (journal_id,
--                                       position_id) and calls evaluate_prop_firm_rules. The cTrader
--                                       Edge Function writes trades directly instead.
--     get_journals_equity_data()        SECURITY DEFINER, no caller.
--     get_strategy_performance(uuid)    SECURITY INVOKER, no caller (strategies.js computes client-side).
--     get_today_trades_count()          SECURITY DEFINER without search_path, superseded by get_platform_stats.
--     get_total_trades_count()          SECURITY DEFINER without search_path, superseded by get_platform_stats.
--   Evidence that nothing calls them (2026-10-18): `git grep` and `grep -r` over the whole repository
--   (tracked, untracked and ignored files, node_modules/.git excluded, incl. public/src/bundle.js and
--   repomix-output.xml) and over the deployed Edge Function sources: 0 matches for any of the six names.
--   The guards below re-check the database side (other functions, pg_cron jobs); DROP ... RESTRICT
--   aborts on any tracked dependent (views, policies, defaults).
-- Stage: 6 (statistics) - OPTIONAL. Alternative if the owner declines: patch the six with the predicate
--   platform_source IS DISTINCT FROM 'backtest' (get_strategy_performance: in the LEFT JOIN ... ON clause).
-- Run order: 6
-- Rollback: supabase/rollbacks/202610180006_drop_unused_trade_functions.down.sql
-- Prerequisites (owner, read-only):
--   * Pre-flight query P1 (RUN_ORDER.md) run and its output saved: it prints the exact GRANT statements
--     that restore the current ACLs of the six functions, which the rollback needs for an exact restore:
--       SELECT p.oid::regprocedure AS fn, p.proacl,
--              string_agg(format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %s;', n.nspname, p.proname,
--                                pg_get_function_identity_arguments(p.oid),
--                                CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END),
--                         E'\n' ORDER BY a.grantee) AS restore_sql
--         FROM pg_proc p
--         JOIN pg_namespace n ON n.oid = p.pronamespace
--         CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--        WHERE n.nspname = 'public'
--          AND p.proname IN ('evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
--                            'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count')
--          AND a.privilege_type = 'EXECUTE'
--        GROUP BY p.oid, p.proacl
--        ORDER BY 1;
--   * Supabase Dashboard -> Logs -> API (or Log Explorer): no request to /rest/v1/rpc/<one of the six>
--     in the retained log window.
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  r       record;
  v_md5   text;
  v_refs  text;
  v_jobs  text;
  c_names constant text[] := ARRAY['evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
                                   'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count'];
  c_regex constant text := '(evaluate_prop_firm_rules|sync_journal_trades|get_journals_equity_data|get_strategy_performance|get_today_trades_count|get_total_trades_count)';
BEGIN
  -- 0a. Each function that still exists must be the 2026-10-18 body (a change means someone works on it).
  FOR r IN
    SELECT * FROM (VALUES
      ('public.evaluate_prop_firm_rules(uuid)',   '{{MD5:evaluate_prop_firm_rules.live}}'),
      ('public.sync_journal_trades(uuid, jsonb)', '{{MD5:sync_journal_trades.live}}'),
      ('public.get_journals_equity_data()',       '{{MD5:get_journals_equity_data.live}}'),
      ('public.get_strategy_performance(uuid)',   '{{MD5:get_strategy_performance.live}}'),
      ('public.get_today_trades_count()',         '{{MD5:get_today_trades_count.live}}'),
      ('public.get_total_trades_count()',         '{{MD5:get_total_trades_count.live}}')
    ) AS v(fn, expected_md5)
  LOOP
    SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
      FROM pg_proc p WHERE p.oid = to_regprocedure(r.fn);
    IF v_md5 IS NOT NULL AND v_md5 <> r.expected_md5 THEN
      RAISE EXCEPTION 'DRIFT: % changed since the 2026-10-18 snapshot (normalised md5 %). Find out who changed it before dropping it.', r.fn, v_md5;
    END IF;
  END LOOP;

  -- 0b. No other function calls them (plpgsql calls are not tracked in pg_depend).
  SELECT string_agg(format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)), ', ') INTO v_refs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND NOT (n.nspname = 'public' AND p.proname = ANY (c_names))
     AND p.prosrc ~ c_regex;
  IF v_refs IS NOT NULL THEN
    RAISE EXCEPTION 'IN USE: % reference(s) one of the functions to drop. Nothing was changed.', v_refs;
  END IF;

  -- 0c. No pg_cron job calls them (only if pg_cron is installed).
  IF to_regclass('cron.job') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT string_agg(coalesce(jobname, jobid::text), '', '') FROM cron.job WHERE command ~ $1'
        INTO v_jobs USING c_regex;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'PRECONDITION: cannot read cron.job as %; check pg_cron jobs by hand before dropping.', current_user;
    END;
    IF v_jobs IS NOT NULL THEN
      RAISE EXCEPTION 'IN USE: pg_cron job(s) % call one of the functions to drop. Nothing was changed.', v_jobs;
    END IF;
  END IF;
END $$;

-- 1. Drop (RESTRICT: any tracked dependent aborts the transaction) -----------------------------------
DROP FUNCTION IF EXISTS public.sync_journal_trades(uuid, jsonb);
DROP FUNCTION IF EXISTS public.evaluate_prop_firm_rules(uuid);
DROP FUNCTION IF EXISTS public.get_journals_equity_data();
DROP FUNCTION IF EXISTS public.get_strategy_performance(uuid);
DROP FUNCTION IF EXISTS public.get_today_trades_count();
DROP FUNCTION IF EXISTS public.get_total_trades_count();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) All six gone (expect 0 rows):
--    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--       AND p.proname IN ('evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
--                         'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count');
-- 2) App smoke test: dashboard, journals, trades, strategies and the landing page load without errors.
-- ============================================================
