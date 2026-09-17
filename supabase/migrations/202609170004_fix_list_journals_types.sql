BEGIN;

CREATE OR REPLACE FUNCTION list_journals()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  color text,
  icon text,
  is_default boolean,
  trade_count bigint,
  strategy_count bigint,
  total_pnl numeric,
  win_rate numeric,
  last_trade_date date,
  created_at timestamptz,
  max_journals int,
  can_create boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_current_count int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(up.max_journals, 2) INTO v_max
  FROM public.user_profiles up WHERE up.id = v_uid;
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
    (v_current_count < v_max)::boolean
  FROM public.journals j
  LEFT JOIN LATERAL (
    SELECT 
      COUNT(*) AS t_count,
      SUM(pnl) AS t_pnl,
      CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)) * 100 ELSE 0 END AS w_rate,
      MAX(trade_date) AS l_trade_date
    FROM public.trades tr WHERE tr.journal_id = j.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS s_count
    FROM public.strategies st WHERE st.journal_id = j.id
  ) s ON true
  WHERE j.user_id = v_uid AND j.is_active = true
  ORDER BY j.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION list_journals FROM public;
GRANT EXECUTE ON FUNCTION list_journals TO authenticated;

COMMIT;
