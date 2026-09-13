-- ============================================================
-- Anonymous kullanıcıların landing page'de platform istatistiklerini
-- (toplam kullanıcı, toplam trade) görebilmesi için aggregate RPC.
--
-- Neden: RLS policy'si user_profiles ve trades tablolarına SELECT'i
-- sadece authenticated kullanıcıyla sınırlıyor. Anon'un doğrudan
-- count alması imkansız. SECURITY DEFINER ile sadece count dönüyoruz.
-- ============================================================

create or replace function public.get_platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totalUsers',   (select count(*) from public.user_profiles),
    'totalTrades',  (select count(*) from public.trades),
    'todayUsers',   (select count(*) from public.user_profiles
                     where created_at >= current_date),
    'todayTrades',  (select count(*) from public.trades
                     where created_at >= current_date)
  );
$$;

revoke all on function public.get_platform_stats() from public;
grant execute on function public.get_platform_stats() to anon, authenticated;