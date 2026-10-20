CREATE OR REPLACE FUNCTION public.get_today_trades_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM public.trades WHERE DATE(created_at) = CURRENT_DATE;
$function$
