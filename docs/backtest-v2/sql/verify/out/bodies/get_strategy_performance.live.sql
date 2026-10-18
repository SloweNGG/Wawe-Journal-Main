CREATE OR REPLACE FUNCTION public.get_strategy_performance(p_user_id uuid)
 RETURNS TABLE(strategy_id uuid, strategy_name text, strategy_color text, total_trades bigint, wins bigint, losses bigint, total_pnl numeric, win_rate numeric, long_count bigint, short_count bigint, pnl_series numeric[])
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.color,
    COUNT(t.id)::BIGINT,
    COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
      CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
      (t.exit_price - t.entry_price) * t.lot * 
      COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) > 0 
      THEN 1 END)::BIGINT,
    COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
      CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
      (t.exit_price - t.entry_price) * t.lot * 
      COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) < 0 
      THEN 1 END)::BIGINT,
    COALESCE(SUM(
      CASE WHEN t.exit_price IS NOT NULL THEN
        CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
        (t.exit_price - t.entry_price) * t.lot *
        COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END)
      ELSE 0 END
    ), 0)::NUMERIC,
    COALESCE(ROUND(100.0 * 
      COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
        CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
        (t.exit_price - t.entry_price) * t.lot * 
        COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) > 0 
        THEN 1 END)::NUMERIC / 
      NULLIF(COUNT(CASE WHEN t.exit_price IS NOT NULL THEN 1 END), 0), 1), 0)::NUMERIC,
    COUNT(CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 END)::BIGINT,
    COUNT(CASE WHEN t.direction IN ('SHORT', 'SELL') THEN 1 END)::BIGINT,
    ARRAY[]::NUMERIC[]  -- Sparkline için boş array (daha sonra doldurabiliriz)
  FROM strategies s
  LEFT JOIN trades t ON t.strategy_id = s.id AND t.user_id = p_user_id
  WHERE s.user_id = p_user_id AND s.is_active = true
  GROUP BY s.id, s.name, s.color;
END;
$function$;
