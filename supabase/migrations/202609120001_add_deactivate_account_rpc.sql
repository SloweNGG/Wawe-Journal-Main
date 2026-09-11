-- ============================================================
-- DEACTIVATE OWN ACCOUNT RPC
-- Kullanıcının kendi hesabını devre dışı bırakabilmesi için
-- SECURITY DEFINER fonksiyon. Client'tan is_active update'i
-- engellendiği için (prevent_profile_privilege_changes trigger),
-- bu RPC bypass sağlar ama sadece auth.uid() için.
-- ============================================================

create or replace function public.deactivate_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Kullanıcı giriş yapmış mı?
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- Sadece kendi hesabını devre dışı bırakabilir
  update public.user_profiles
  set is_active = false
  where id = auth.uid();

  -- Profil yoksa hata ver
  if not found then
    raise exception 'User profile not found';
  end if;
end;
$$;

revoke all on function public.deactivate_own_account() from public;
grant execute on function public.deactivate_own_account() to authenticated;