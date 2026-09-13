-- ============================================================
-- Login/Register rate limiting + brute force koruması
-- - login_attempts tablosu: her denemeyi kaydeder
-- - Sadece service_role erişebilir (Edge Function)
-- ============================================================

create table if not exists public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_address text not null,
  email text,
  action text not null default 'login',
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_login_attempts_ip_time
  on public.login_attempts (ip_address, attempted_at desc);

create index if not exists idx_login_attempts_email_time
  on public.login_attempts (email, attempted_at desc);

create index if not exists idx_login_attempts_action_time
  on public.login_attempts (action, attempted_at desc);

create index if not exists idx_login_attempts_fail_ip
  on public.login_attempts (ip_address, action, attempted_at desc)
  where success = false;

alter table public.login_attempts enable row level security;

-- Policy yok → anon/authenticated erişemez. service_role bypass eder.

-- Eski kayıtları temizle (30 gün)
create or replace function public.cleanup_login_attempts()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_attempts
  where attempted_at < now() - interval '30 days';
$$;

revoke all on function public.cleanup_login_attempts() from public;
grant execute on function public.cleanup_login_attempts() to service_role;