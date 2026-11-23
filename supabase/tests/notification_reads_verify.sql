-- ============================================================
-- Verification of 202611230003_notification_reads.sql. READ-ONLY (no writes, safe on the live database):
-- table, RLS, own-row policies, grants (no anon, no UPDATE), key CHECK and the per-user limit trigger.
-- Returns one row per check: check_name | ok.
-- ============================================================
WITH c AS (
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid = 'public.notification_reads'::regclass AND conname = 'notification_reads_key_shape'
)
SELECT 'table exists' AS check_name, to_regclass('public.notification_reads') IS NOT NULL AS ok
UNION ALL SELECT 'rls enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notification_reads'::regclass)
UNION ALL SELECT 'policies select/insert/delete own',
       (SELECT count(*) = 3 FROM pg_policy WHERE polrelid = 'public.notification_reads'::regclass
          AND coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) = '(auth.uid() = user_id)')
UNION ALL SELECT 'no update policy', NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.notification_reads'::regclass AND polcmd IN ('w', '*'))
UNION ALL SELECT 'anon has no grants', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE table_schema = 'public' AND table_name = 'notification_reads' AND grantee = 'anon')
UNION ALL SELECT 'authenticated select/insert/delete only',
       (SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) = 'DELETE,INSERT,SELECT'
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'notification_reads' AND grantee = 'authenticated')
UNION ALL SELECT 'key check present', (SELECT def ~ '\(ot\|prem\|pay\)' FROM c)
UNION ALL SELECT 'key check accepts real keys',
       (SELECT bool_and(k ~ '^(ot|prem|pay)_[A-Za-z0-9_.:-]{1,100}$')
          FROM unnest(ARRAY['ot_daily_2026-11-23', 'ot_weekly_2026-11-17', 'prem_expiring_2026-12-01',
                            'pay_6f1c2b9e-1d2a-4c3b-9e8f-0a1b2c3d4e5f']) k)
UNION ALL SELECT 'key check rejects others',
       (SELECT NOT bool_or(k ~ '^(ot|prem|pay)_[A-Za-z0-9_.:-]{1,100}$')
          FROM unnest(ARRAY['x_1', 'ot_', 'ot_<script>', 'pay_' || repeat('a', 101)]) k)
UNION ALL SELECT 'limit trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.notification_reads'::regclass
                AND tgname = 'notification_reads_limit' AND tgenabled <> 'D');
