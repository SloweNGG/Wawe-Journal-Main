-- ============================================================
-- ROLLBACK of 202610220001_journal_trade_scope.sql
-- Restores create_journal(4 args), update_journal(5 args), list_journals() and get_journals_equity_data() to the
-- live definitions of 2026-10-22 and drops journals.trade_scope.
-- DATA LOSS GUARD: refuses to run while any journal has trade_scope <> 'live' (the user's choice would be lost);
-- to accept that loss run  SET wawe.allow_scope_loss = 'on';  in the same session first.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first (KURALLAR.md sections 1 and 3).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'journals' AND column_name = 'trade_scope') THEN
    RAISE EXCEPTION 'ORDER: journals.trade_scope not found (migration 202610220001 is not applied).';
  END IF;
  SELECT count(*) INTO v_n FROM public.journals WHERE trade_scope <> 'live';
  IF v_n > 0 AND coalesce(current_setting('wawe.allow_scope_loss', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DATA LOSS: % journal(s) use a non-live trade_scope; SET wawe.allow_scope_loss = ''on'' to drop it anyway.', v_n;
  END IF;
END $$;

DROP FUNCTION public.create_journal(text, text, text, text, text);
DROP FUNCTION public.update_journal(uuid, text, text, text, text, text);
DROP FUNCTION public.list_journals();

CREATE OR REPLACE FUNCTION public.create_journal(p_name text, p_description text, p_color text, p_icon text)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_count int;
  v_is_first boolean;
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  -- Premium kullanıcı için en az 10, free kullanıcı için DB değeri veya varsayılan 2
  SELECT 
    CASE 
      WHEN plan = 'premium' AND (plan_expires_at IS NULL OR plan_expires_at > now()) 
      THEN GREATEST(COALESCE(max_journals, 2), 10)
      ELSE COALESCE(max_journals, 2)
    END
  INTO v_max
  FROM public.user_profiles
  WHERE id = v_uid;

  IF v_max IS NULL THEN
    v_max := 2;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.journals
  WHERE user_id = v_uid AND is_active = true;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'JOURNAL_QUOTA_EXCEEDED:%', v_max;
  END IF;

  v_is_first := (v_count = 0);

  INSERT INTO public.journals (
    user_id, name, description, color, icon, is_default, is_active
  ) VALUES (
    v_uid,
    trim(p_name),
    p_description,
    COALESCE(p_color, '#7c6dfa'),
    COALESCE(p_icon, '📁'),
    v_is_first,
    true
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_journal(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_journal(text, text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_journal(p_journal_id uuid, p_name text, p_description text, p_color text, p_icon text)
 RETURNS journals
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  UPDATE public.journals
  SET 
    name = trim(p_name),
    description = p_description,
    color = p_color,
    icon = p_icon
  WHERE id = p_journal_id AND user_id = v_uid
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNAL_NOT_FOUND';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_journal(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_journal(uuid, text, text, text, text) TO anon, authenticated, service_role;

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
    FROM public.trades tr WHERE tr.journal_id = j.id AND tr.platform_source IS DISTINCT FROM 'backtest'
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
GRANT EXECUTE ON FUNCTION public.list_journals() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_journals_equity_data()
 RETURNS TABLE(journal_id uuid, journal_name text, journal_color text, journal_icon text, trade_date date, pnl numeric, cumulative_pnl numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT 
      j.id AS jid,
      j.name AS jname,
      j.color AS jcolor,
      j.icon AS jicon,
      t.trade_date AS tdate,
      t.pnl AS tpnl,
      SUM(t.pnl) OVER (
        PARTITION BY j.id 
        ORDER BY t.trade_date, t.created_at 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cum_pnl
    FROM public.journals j
    INNER JOIN public.trades t ON t.journal_id = j.id
    WHERE j.user_id = v_uid 
      AND j.is_active = true 
      AND t.pnl IS NOT NULL
  )
  SELECT 
    r.jid::uuid,
    r.jname::text,
    COALESCE(r.jcolor, '#7c6dfa')::text,
    COALESCE(r.jicon, 'folder')::text,
    r.tdate::date,
    r.tpnl::numeric,
    r.cum_pnl::numeric
  FROM ranked r
  ORDER BY r.jid, r.tdate;
END;
$function$;

ALTER TABLE public.journals DROP CONSTRAINT IF EXISTS chk_journals_trade_scope;
ALTER TABLE public.journals DROP COLUMN trade_scope;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'journals' AND column_name = 'trade_scope') THEN
    RAISE EXCEPTION 'CHECK: trade_scope still exists';
  END IF;
  IF to_regprocedure('public.create_journal(text,text,text,text)') IS NULL
     OR to_regprocedure('public.update_journal(uuid,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'CHECK: old signatures missing';
  END IF;
END $$;

COMMIT;
