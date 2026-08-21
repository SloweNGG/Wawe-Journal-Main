# Admin role assignment

The app authorizes admins exclusively through `auth.users.raw_app_meta_data`.
Do not add `role: admin` to `user_metadata`; users can change that data from a
browser session.

In the Supabase SQL Editor, first identify the intended account:

```sql
select id, email, raw_app_meta_data
from auth.users
order by created_at;
```

Then replace the placeholder UUID and execute:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = '<ADMIN_USER_UUID>';
```

For revocation:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
where id = '<ADMIN_USER_UUID>';
```

The affected user must sign out and sign in again so their JWT contains the
new `app_metadata.role` value. The `user_profiles.role` column is display data
only and is not used for authorization.
