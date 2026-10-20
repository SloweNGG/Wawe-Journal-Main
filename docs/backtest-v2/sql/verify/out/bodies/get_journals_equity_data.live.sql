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
