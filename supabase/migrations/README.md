# Supabase migrations

`202608190001_security_baseline.sql` is a security hardening migration for
the existing Wawe Journal schema. It assumes these existing tables and columns:

- `user_profiles(id, email, username, plan, plan_expires_at, role, is_active)`
- `trades(user_id)`, `strategies(user_id)`, `backtest_trades(user_id)`
- `references(is_active)`, `payments(user_id)`

It has intentionally not been run against the hosted project: no database
admin credential or Supabase CLI login is available in this workspace.

The browser-side writes to `plan` and `plan_expires_at` have been removed from
the source. Apply the migration in the Supabase SQL Editor or with a linked
Supabase CLI project only after deploying that client change. Verify the first
registration and admin account immediately after applying it.


-------------------------

repomix commands for ai developments. 


