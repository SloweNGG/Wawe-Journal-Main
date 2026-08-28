-- ============================================================
-- SYSTEM SETTINGS TABLOSU - Fiyat yönetimi için
-- ============================================================

-- ⭐ is_admin fonksiyonunu kontrol et, yoksa oluştur
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- system_settings tablosunu oluştur
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- RLS etkinleştir
alter table public.system_settings enable row level security;

-- Adminler okuyabilir ve yazabilir
create policy "system_settings_select_admin" on public.system_settings
  for select to authenticated
  using (public.is_admin() = true);

create policy "system_settings_insert_admin" on public.system_settings
  for insert to authenticated
  with check (public.is_admin() = true);

create policy "system_settings_update_admin" on public.system_settings
  for update to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

-- Varsayılan fiyatları ekle
insert into public.system_settings (key, value)
values (
  'prices',
  jsonb_build_object(
    'monthly', 9.00,
    'yearly', 79.00,
    'currency', 'USD',
    'discount', jsonb_build_object('yearly', 27, 'promo', 0),
    'paymentMethods', jsonb_build_array('BTC', 'LTC')
  )
) on conflict (key) do nothing;

-- `get_prices` fonksiyonu - tüm kullanıcıların okuması için (anon dahil)
create or replace function public.get_prices()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.system_settings where key = 'prices';
$$;

-- Anonim kullanıcıların fiyatları okumasına izin ver
grant execute on function public.get_prices() to anon, authenticated;

-- `set_prices` fonksiyonu - sadece admin için
create or replace function public.set_prices(
  p_monthly numeric,
  p_yearly numeric,
  p_currency text default 'USD',
  p_discount_yearly integer default 27,
  p_payment_methods text[] default array['BTC', 'LTC']
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update prices';
  end if;

  v_result := jsonb_build_object(
    'monthly', p_monthly,
    'yearly', p_yearly,
    'currency', p_currency,
    'discount', jsonb_build_object(
      'yearly', p_discount_yearly,
      'promo', 0
    ),
    'paymentMethods', to_jsonb(p_payment_methods)
  );

  insert into public.system_settings (key, value, updated_at)
  values ('prices', v_result, now())
  on conflict (key) do update
  set value = excluded.value, updated_at = now();

  return v_result;
end;
$$;

-- Admin fonksiyonunu yetkilendir
grant execute on function public.set_prices(numeric, numeric, text, integer, text[]) to authenticated;

-- `get_prices` için anonim okuma izni
grant select on public.system_settings to anon, authenticated;