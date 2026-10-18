-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180003 (candles bucket, admin-only read policy)
-- Migration: 202610180003_candles_bucket_admin_only.down.sql
-- Rollback of: supabase/migrations/202610180003_candles_bucket_admin_only.sql
-- Description: drops the policy candles_select_admin (and candles_select_members from Migration 07, if it
--   is still there) and deletes the bucket 'candles'.
-- Data loss: the bucket must be EMPTY. If it holds objects the file stops ("DATA LOSS"): delete them in
--   Dashboard -> Storage first (their contents are re-creatable by the importer), or uncomment the one
--   confirmation line below to delete the bucket row anyway (objects then become orphans in the storage
--   backend: prefer emptying the bucket through the Storage API).
-- Note: newer Storage versions block direct DELETEs on storage.buckets unless storage.allow_delete_query is
--   'true'; this file sets it for its own transaction only.
-- Stage: 3B (rollback)
-- Run order: rollback, step 3 of 7 (reverse order: 06, 05, 04, this file, 02, 01, 00). Needs 07 rolled back first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
-- SET LOCAL wawe.confirm_delete_candles_bucket = 'yes';

DO $$
DECLARE
  v_objects bigint := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'candles_select_members') THEN
    RAISE EXCEPTION 'ORDER: migration 202610180007 is still applied (policy candles_select_members exists). Roll it back first.';
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    SELECT count(*) INTO v_objects FROM storage.objects WHERE bucket_id = 'candles';
  END IF;
  IF v_objects > 0 AND coalesce(current_setting('wawe.confirm_delete_candles_bucket', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'DATA LOSS: bucket "candles" holds % object(s). Empty it through the Storage API first, or uncomment the confirmation line at the top of this file.', v_objects;
  END IF;
END $$;

DROP POLICY IF EXISTS "candles_select_admin" ON storage.objects;

SELECT set_config('storage.allow_delete_query', 'true', true);
DELETE FROM storage.objects WHERE bucket_id = 'candles';
DELETE FROM storage.buckets WHERE id = 'candles';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) SELECT count(*) FROM storage.buckets WHERE id = 'candles';   -- expect 0
-- 2) SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND qual ILIKE '%candles%';  -- expect 0
-- ============================================================
