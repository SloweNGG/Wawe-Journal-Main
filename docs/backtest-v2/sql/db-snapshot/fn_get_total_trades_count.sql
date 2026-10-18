CREATE OR REPLACE FUNCTION public.get_total_trades_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM public.trades;
$function$
