-- Wawe Journal security baseline
-- Apply with the Supabase SQL Editor or supabase db push after confirming
-- that the deployed client includes the premium-management hardening.

begin;

-- Never trust user_metadata for authorization. Only app_metadata is written
-- by privileged server-side code / the Supabase admin API.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- New profiles are created by the database, not by the browser. This also
-- covers OAuth sign-ups, where there is no client-side profile insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    username,
    plan,
    role,
    is_active
  ) values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    'free',
    'user',
    true
  ) on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Authenticated users may edit their display data, but never subscription,
-- account-status, or authorization fields. Edge Functions use service_role
-- and therefore remain allowed to update those server-owned fields.
create or replace function public.prevent_profile_privilege_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.plan is distinct from old.plan
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active then
    raise exception 'Subscription, role, and account-status fields are server-managed';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_user_profile_privileges on public.user_profiles;
create trigger protect_user_profile_privileges
  before update on public.user_profiles
  for each row execute procedure public.prevent_profile_privilege_changes();

-- Remove unknown legacy policies first. RLS policies are additive, so merely
-- adding safe policies could leave an old permissive policy active.
do $$
declare
  target_table text;
  policy_name text;
begin
  foreach target_table in array array[
    'user_profiles', 'trades', 'strategies', 'backtest_trades', 'references', 'payments'
  ] loop
    if to_regclass('public.' || target_table) is not null then
      execute format('alter table public.%I enable row level security', target_table);
      for policy_name in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = target_table
      loop
        execute format('drop policy if exists %I on public.%I', policy_name, target_table);
      end loop;
    end if;
  end loop;
end;
$$;

-- Profiles: each user sees and edits only their own row. Inserts are owned by
-- handle_new_user; subscription and role changes are stopped by the trigger.
create policy "profiles_select_own_or_admin" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.user_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Journal data is always owned by the authenticated user.
create policy "trades_select_own_or_admin" on public.trades
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "trades_insert_own" on public.trades
  for insert to authenticated with check (user_id = auth.uid());
create policy "trades_update_own_or_admin" on public.trades
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "trades_delete_own_or_admin" on public.trades
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "strategies_select_own_or_admin" on public.strategies
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "strategies_insert_own" on public.strategies
  for insert to authenticated with check (user_id = auth.uid());
create policy "strategies_update_own_or_admin" on public.strategies
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "strategies_delete_own_or_admin" on public.strategies
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "backtest_trades_select_own_or_admin" on public.backtest_trades
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "backtest_trades_insert_own" on public.backtest_trades
  for insert to authenticated with check (user_id = auth.uid());
create policy "backtest_trades_update_own_or_admin" on public.backtest_trades
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
create policy "backtest_trades_delete_own_or_admin" on public.backtest_trades
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- References are public only when active; writes stay admin-only.
create policy "references_read_active_or_admin" on public.references
  for select to anon, authenticated
  using (is_active = true or public.is_admin());
create policy "references_insert_admin" on public.references
  for insert to authenticated with check (public.is_admin());
create policy "references_update_admin" on public.references
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "references_delete_admin" on public.references
  for delete to authenticated using (public.is_admin());

-- Payment rows are written by Edge Functions using service_role. A customer
-- can only read their own receipts and cannot create or change payment state.
create policy "payments_select_own_or_admin" on public.payments
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Avatar files use avatars/<user-id>_<timestamp>.<extension>.
alter table storage.objects enable row level security;
drop policy if exists "avatars_select_own" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and storage.filename(name) like auth.uid()::text || '\_%' escape '\');
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and storage.filename(name) like auth.uid()::text || '\_%' escape '\');
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and storage.filename(name) like auth.uid()::text || '\_%' escape '\')
  with check (bucket_id = 'avatars' and storage.filename(name) like auth.uid()::text || '\_%' escape '\');
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and storage.filename(name) like auth.uid()::text || '\_%' escape '\');

commit;
