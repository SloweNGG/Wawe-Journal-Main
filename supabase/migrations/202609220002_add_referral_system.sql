-- ============================================================
-- REFERANS KODLARI VE YENİ ÖDEME AYARLARI
-- ============================================================

-- 1. REFERANS KODLARI TABLOSU
create table if not exists public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_percent integer not null check (discount_percent >= 0 and discount_percent <= 100),
  referrer_name text,
  referrer_email text,
  is_active boolean default true,
  usage_count integer default 0,
  max_usage integer,
  expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Kodu her zaman büyük harf yapma trigger'ı
create or replace function public.trg_referral_codes_uppercase()
returns trigger as $$
begin
  new.code = upper(new.code);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_referral_codes_uppercase_trigger on public.referral_codes;
create trigger trg_referral_codes_uppercase_trigger
  before insert or update on public.referral_codes
  for each row execute function public.trg_referral_codes_uppercase();

-- RLS
alter table public.referral_codes enable row level security;

-- Admin CRUD Politikaları
drop policy if exists "referral_codes_admin_all" on public.referral_codes;
create policy "referral_codes_admin_all" on public.referral_codes
  for all to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

-- Auth kullanıcılar sadece kodu doğrulamak için okuyabilir (Fakat listeleme yapamaz)
-- Bu yüzden direkt SELECT policy yerine, güvenli bir RPC kullanacağız.
-- Ama Supabase'de RPC execute izni yeterlidir, tablo select izni vermeye gerek yok.
-- Anon zaten erişemez.

-- 2. DOĞRULAMA RPC'Sİ
create or replace function public.validate_referral_code(p_code text)
returns jsonb
language plpgsql
security definer -- Security definer, tabloya okuma izni olmadan veriyi okumayı sağlar
set search_path = public
as $$
declare
  v_record record;
  v_result jsonb;
begin
  select * into v_record from public.referral_codes where code = upper(trim(p_code)) limit 1;
  
  if not found then
    return jsonb_build_object('valid', false, 'error', 'invalid_code');
  end if;
  
  if v_record.is_active = false then
    return jsonb_build_object('valid', false, 'error', 'inactive_code');
  end if;
  
  if v_record.expires_at is not null and v_record.expires_at < now() then
    return jsonb_build_object('valid', false, 'error', 'expired_code');
  end if;
  
  if v_record.max_usage is not null and v_record.usage_count >= v_record.max_usage then
    return jsonb_build_object('valid', false, 'error', 'usage_limit_reached');
  end if;
  
  return jsonb_build_object(
    'valid', true, 
    'discount_percent', v_record.discount_percent, 
    'referrer_name', v_record.referrer_name
  );
end;
$$;

grant execute on function public.validate_referral_code(text) to authenticated;
grant execute on function public.validate_referral_code(text) to anon;

-- 3. PAYMENTS TABLOSUNU OLUŞTUR VEYA SÜTUN EKLE
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, -- references auth.users(id) could cause issues if auth schema is locked
  invoice_id text,
  order_id text,
  amount numeric,
  currency text,
  plan_type text,
  payment_status text,
  pay_currency text,
  paid_amount numeric,
  paid_currency text,
  pay_address text,
  referral_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='payments') then
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='payments' and column_name='referral_code') then
      alter table public.payments add column referral_code text;
    end if;
  end if;
end $$;

-- 4. SYSTEM_SETTINGS YENİ FİYAT VE AYARLAR
insert into public.system_settings (key, value)
values (
  'payment_settings',
  jsonb_build_object(
    'monthly_price_usd', 12,
    'yearly_price_usd', 99,
    'yearly_discount_percent', 31,
    'video_embed_url', '',
    'video_embed_enabled', false,
    'days_per_monthly', 30,
    'days_per_yearly', 365,
    'ltc_discount_enabled', true,
    'referral_note', 'Referans kodu sadece Litecoin (LTC) ödemelerinde geçerlidir.'
  )
) on conflict (key) do update set value = jsonb_build_object(
    'monthly_price_usd', coalesce((public.system_settings.value->>'monthly_price_usd')::numeric, 12),
    'yearly_price_usd', coalesce((public.system_settings.value->>'yearly_price_usd')::numeric, 99),
    'yearly_discount_percent', coalesce((public.system_settings.value->>'yearly_discount_percent')::numeric, 31),
    'video_embed_url', coalesce(public.system_settings.value->>'video_embed_url', ''),
    'video_embed_enabled', coalesce((public.system_settings.value->>'video_embed_enabled')::boolean, false),
    'days_per_monthly', coalesce((public.system_settings.value->>'days_per_monthly')::numeric, 30),
    'days_per_yearly', coalesce((public.system_settings.value->>'days_per_yearly')::numeric, 365),
    'ltc_discount_enabled', coalesce((public.system_settings.value->>'ltc_discount_enabled')::boolean, true),
    'referral_note', coalesce(public.system_settings.value->>'referral_note', 'Referans kodu sadece Litecoin (LTC) ödemelerinde geçerlidir.')
  );

-- Eski prices key'ini de güncelle (Geriye dönük uyumluluk için, eğer bir yer kullanıyorsa)
update public.system_settings 
set value = jsonb_set(
  jsonb_set(value, '{monthly}', '12'), 
  '{yearly}', '99'
)
where key = 'prices';


-- 5. KULLANIM ARTIRMA RPC'Sİ (Webhook için)
create or replace function public.increment_referral_usage(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.referral_codes
  set usage_count = usage_count + 1,
      updated_at = now()
  where code = upper(trim(p_code));
end;
$$;

revoke all on function public.increment_referral_usage(text) from public;
grant execute on function public.increment_referral_usage(text) to service_role;

-- 6. PUBLIC GET PAYMENT SETTINGS (Anonim kullanıcılar için)
create or replace function public.get_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.system_settings where key = 'payment_settings';
$$;

revoke all on function public.get_payment_settings() from public;
grant execute on function public.get_payment_settings() to anon, authenticated;

-- 7. GET_PRICES FONKSİYONUNU GÜNCELLE (Canlı olarak payment_settings'den okusun)
create or replace function public.get_prices()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pay jsonb;
  v_res jsonb;
begin
  select value into v_pay from public.system_settings where key = 'payment_settings';
  if v_pay is not null then
    return jsonb_build_object(
      'monthly', coalesce((v_pay->>'monthly_price_usd')::numeric, 12),
      'yearly', coalesce((v_pay->>'yearly_price_usd')::numeric, 99),
      'currency', 'USD',
      'discount', jsonb_build_object('yearly', coalesce((v_pay->>'yearly_discount_percent')::numeric, 31), 'promo', 0),
      'paymentMethods', jsonb_build_array('BTC', 'LTC')
    );
  end if;

  select value into v_res from public.system_settings where key = 'prices';
  return coalesce(v_res, jsonb_build_object('monthly', 12, 'yearly', 99, 'currency', 'USD'));
end;
$$;

revoke all on function public.get_prices() from public;
grant execute on function public.get_prices() to anon, authenticated;
