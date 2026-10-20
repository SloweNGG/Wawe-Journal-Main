-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180007 (candles archive open to members)
-- Migration: 202610180007_candles_open_to_members.down.sql
-- Rollback of: supabase/migrations/202610180007_candles_open_to_members.sql
-- Description: restores the admin-only read policy of Migration 03 (candles_select_admin) and removes
--   candles_select_members. Run it as soon as the archive must be closed again (licence problem).
-- Data loss: none.
-- Stage: Phase E (rollback)
-- Run order: rollback, FIRST (reverse order: this file, 06, 05, 04, 03, 02, 01, 00). Roll the app side back first
--   (members must not see a page that can no longer load data).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DROP POLICY IF EXISTS "candles_select_members" ON storage.objects;
DROP POLICY IF EXISTS "candles_select_admin" ON storage.objects;
CREATE POLICY "candles_select_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'candles' AND public.is_admin());

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) SELECT policyname, qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND qual ILIKE '%candles%';
--    -- expect 1 row: candles_select_admin
-- ============================================================
