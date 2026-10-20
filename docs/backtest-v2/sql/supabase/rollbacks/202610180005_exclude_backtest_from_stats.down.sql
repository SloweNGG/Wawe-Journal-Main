-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180005 (backtest-free SQL statistics)
-- Migration: 202610180005_exclude_backtest_from_stats.down.sql
-- Rollback of: supabase/migrations/202610180005_exclude_backtest_from_stats.sql
-- Description: restores the LIVE bodies of 2026-10-18 of list_journals() and get_platform_stats()
--   (CRLF normalised to LF, otherwise identical; same signatures and attributes).
-- Stage: 6 (rollback)
-- Run order: rollback, step 2 of 5 (reverse order: 06, then this file, then 04, 03, 02, 01)
-- Data loss: none. Consequence: backtest mirrors (platform_source = 'backtest') count as real trades
--   again in the journal cards / navbar counts and on the landing-page counters. If mirrors exist and
--   the backtest feature is being withdrawn, remove them first (owner decision, writes data):
--     DELETE FROM public.trades WHERE platform_source = 'backtest' AND left(import_hash, 9) = 'backtest:';
-- ACL note: list_journals() had EXECUTE for anon live (Supabase default privileges). This rollback keeps
--   anon revoked (the function rejects calls without auth.uid() anyway). For the exact pre-05 ACL,
--   uncomment the line marked [EXACT-ACL] or use the output of pre-flight query P1.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.list_journals()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('d4f0bce277a530a47cff7d18c4420590', 'f12fbef040de7b41cc2091c196e6e282') THEN
    RAISE EXCEPTION 'DRIFT: public.list_journals() is neither the 202610180005 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.get_platform_stats()');
  IF v_md5 IS NULL OR v_md5 NOT IN ('58059ba9418512361e746a2100713457', '23ea1c0b396c9a56081f0c57788af182') THEN
    RAISE EXCEPTION 'DRIFT: public.get_platform_stats() is neither the 202610180005 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;
END $$;

-- 1. list_journals(): live body ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_journals()
 RETURNS TABLE(id uuid, name text, description text, color text, icon text, is_default boolean, trade_count bigint, strategy_count bigint, total_pnl numeric, win_rate numeric, last_trade_date date, created_at timestamp with time zone, max_journals integer, can_create boolean, platform text, is_connected boolean, connection_status text, last_synced_at timestamp with time zone, is_prop_firm boolean, prop_firm_rules jsonb, prop_firm_status text, prop_firm_stats jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_current_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Premium kullanıcı için en az 10, free kullanıcı için DB değeri veya varsayılan 2
  SELECT 
    CASE 
      WHEN up.plan = 'premium' AND (up.plan_expires_at IS NULL OR up.plan_expires_at > now()) 
      THEN GREATEST(COALESCE(up.max_journals, 2), 10)
      ELSE COALESCE(up.max_journals, 2)
    END
  INTO v_max
  FROM public.user_profiles up 
  WHERE up.id = v_uid;

  IF v_max IS NULL THEN v_max := 2; END IF;

  SELECT count(*) INTO v_current_count
  FROM public.journals WHERE user_id = v_uid AND is_active = true;

  RETURN QUERY
  SELECT 
    j.id::uuid,
    j.name::text,
    j.description::text,
    j.color::text,
    j.icon::text,
    j.is_default::boolean,
    COALESCE(t.t_count, 0)::bigint,
    COALESCE(s.s_count, 0)::bigint,
    COALESCE(t.t_pnl, 0)::numeric,
    COALESCE(t.w_rate, 0)::numeric,
    t.l_trade_date::date,
    j.created_at::timestamptz,
    v_max::int,
    (v_current_count < v_max)::boolean,
    j.platform::text,
    COALESCE(j.is_connected, false)::boolean,
    COALESCE(j.connection_status, 'disconnected')::text,
    j.last_synced_at::timestamptz,
    COALESCE(j.is_prop_firm, false)::boolean,
    j.prop_firm_rules::jsonb,
    COALESCE(j.prop_firm_status, 'none')::text,
    j.prop_firm_stats::jsonb
  FROM public.journals j
  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*) AS t_count,
      SUM(pnl) AS t_pnl,
      CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)) * 100 ELSE 0 END AS w_rate,
      MAX(trade_date)::date AS l_trade_date
    FROM public.trades tr WHERE tr.journal_id = j.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS s_count
    FROM public.strategies st WHERE st.journal_id = j.id
  ) s ON true
  WHERE j.user_id = v_uid AND j.is_active = true
  ORDER BY j.created_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_journals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated;
-- [EXACT-ACL] GRANT EXECUTE ON FUNCTION public.list_journals() TO anon;

-- 2. get_platform_stats(): live body ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'totalUsers',   (select count(*) from public.user_profiles),
    'totalTrades',  (select count(*) from public.trades),
    'todayUsers',   (select count(*) from public.user_profiles where created_at >= current_date),
    'todayTrades',  (select count(*) from public.trades where created_at >= current_date)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_platform_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Live bodies again (expect true, true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = 'f12fbef040de7b41cc2091c196e6e282' FROM pg_proc WHERE oid = 'public.list_journals()'::regprocedure;
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '23ea1c0b396c9a56081f0c57788af182' FROM pg_proc WHERE oid = 'public.get_platform_stats()'::regprocedure;
-- 2) The landing page still shows its counters (anon) and the journals page loads.
-- ============================================================
