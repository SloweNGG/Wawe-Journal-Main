-- ============================================================
-- Verification of 202611230004_user_profile_notification_prefs.sql. READ-ONLY (safe on the live database).
-- Returns one row per check: check_name | ok.
-- ============================================================
WITH c AS (
  SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid = 'public.user_profiles'::regclass AND conname = 'user_profiles_notification_prefs_shape'
), sample AS (
  SELECT '{"v":1,"ts":1763856000000,"risk":true,"coach":false,"partner":true,"system":false}'::jsonb AS ok_val,
         '[true]'::jsonb AS arr_val,
         jsonb_build_object('pad', repeat('x', 3000)) AS big_val
)
SELECT 'column jsonb nullable' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_profiles'
                AND column_name = 'notification_prefs' AND data_type = 'jsonb' AND is_nullable = 'YES') AS ok
UNION ALL SELECT 'shape constraint present', EXISTS (SELECT 1 FROM c)
UNION ALL SELECT 'constraint checks object + 2 KB', (SELECT def ~ 'jsonb_typeof' AND def ~ '2048' FROM c)
UNION ALL SELECT 'existing rows valid',
       NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE notification_prefs IS NOT NULL
                    AND (jsonb_typeof(notification_prefs) <> 'object' OR pg_column_size(notification_prefs) > 2048))
UNION ALL SELECT 'real value accepted', (SELECT jsonb_typeof(ok_val) = 'object' AND pg_column_size(ok_val) <= 2048 FROM sample)
UNION ALL SELECT 'array rejected', (SELECT NOT (jsonb_typeof(arr_val) = 'object') FROM sample)
UNION ALL SELECT 'oversized rejected', (SELECT pg_column_size(big_val) > 2048 FROM sample)
UNION ALL SELECT 'own-row update policy', EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.user_profiles'::regclass
                AND polcmd = 'w' AND pg_get_expr(polqual, polrelid) = '(auth.uid() = id)')
UNION ALL SELECT 'privilege guard trigger', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_profiles'::regclass
                AND tgname = 'guard_user_profile_privileges' AND tgenabled <> 'D');
