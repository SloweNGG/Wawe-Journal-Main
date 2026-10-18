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
$function$
