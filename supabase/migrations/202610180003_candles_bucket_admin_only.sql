-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / STAGE 3B (ARCHIVE): PRIVATE `candles` STORAGE BUCKET, ADMIN-ONLY READ
-- Migration: 202610180003_candles_bucket_admin_only.sql
-- Description (D7, D12, ARSIV.md section 3):
--   Creates the Storage bucket that holds the candle archive (month files <prefix><SYMBOL>/<YYYY-MM>.json.gz,
--   index.json, manifest) and the ONLY policy that lets a client read it:
--     bucket 'candles': public = false, file_size_limit 25 MiB, allowed mime types application/gzip and
--     application/json.
--     policy candles_select_admin on storage.objects: FOR SELECT TO authenticated
--       USING (bucket_id = 'candles' AND public.is_admin()).
--   There is deliberately NO insert/update/delete policy: the importer (GitHub Actions) writes with the
--   Supabase secret key, which bypasses RLS. Licensed data (Binance CC BY-NC-SA, forex/gold) therefore
--   stays visible to admins only until Migration 07 (owner decision, licence) opens it to members.
--   Guards: the file stops if
--     - a bucket 'candles' already exists and is public, or has other limits/mime types than above
--       (somebody else configured it: look before changing it);
--     - a policy on storage.objects that is not restricted to a bucket (no bucket_id in its USING
--       expression) would let authenticated users read every bucket, 'candles' included.
--   A re-run on a bucket that already has exactly this configuration is a no-op (objects may exist then).
-- Stage: 3B (archive)
-- Run order: 3
-- Rollback: supabase/rollbacks/202610180003_candles_bucket_admin_only.down.sql
-- Prerequisites: 202610180000 is not required. public.is_admin() must exist (it does live). A fresh backup
--   (R48) is recommended; this file changes no existing data.
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction), as postgres.
-- Writes to LIVE Storage metadata: owner approval required (KURALLAR.md section 1).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  b          record;
  v_leaky    text;
  c_limit    constant bigint := 26214400;                                  -- 25 MiB
  c_mimes    constant text[] := ARRAY['application/gzip', 'application/json'];
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: storage.buckets / storage.objects do not exist (Storage is not enabled).';
  END IF;
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.is_admin() does not exist.';
  END IF;

  SELECT * INTO b FROM storage.buckets WHERE id = 'candles';
  IF FOUND THEN
    IF b.public IS TRUE THEN
      RAISE EXCEPTION 'ABORT: bucket "candles" already exists and is PUBLIC. Nothing was changed; inspect it first.';
    END IF;
    IF b.file_size_limit IS DISTINCT FROM c_limit
       OR (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(b.allowed_mime_types) x)
          IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(c_mimes) x) THEN
      RAISE EXCEPTION 'ABORT: bucket "candles" already exists with other limits (file_size_limit %, mime types %). Nothing was changed; inspect it first.',
        b.file_size_limit, b.allowed_mime_types;
    END IF;
  END IF;

  -- A SELECT policy that is not tied to a bucket applies to every bucket (permissive policies are OR-ed).
  SELECT string_agg(p.policyname, ', ') INTO v_leaky
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
     AND p.permissive = 'PERMISSIVE'
     AND p.cmd IN ('SELECT', 'ALL')
     AND p.policyname <> 'candles_select_admin'
     AND (p.roles && ARRAY['public', 'anon', 'authenticated']::name[])
     AND coalesce(p.qual, 'true') !~* 'bucket_id';
  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION 'LEAK: storage.objects policy/policies % are not restricted to a bucket and would expose the candles bucket. Nothing was changed.', v_leaky;
  END IF;
END $$;

-- 1. Bucket ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candles', 'candles', false, 26214400, ARRAY['application/gzip', 'application/json'])
ON CONFLICT (id) DO NOTHING;

-- 2. Read policy: admins only ----------------------------------------------------
DROP POLICY IF EXISTS "candles_select_admin" ON storage.objects;
CREATE POLICY "candles_select_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'candles' AND public.is_admin());

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Bucket is private with the limits (expect public = false, 26214400, {application/gzip,application/json}):
--    SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'candles';
-- 2) Exactly one policy mentions the bucket (expect 1 row, cmd SELECT, roles {authenticated}):
--    SELECT policyname, cmd, roles, qual FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects' AND qual ILIKE '%candles%';
-- 3) Every SELECT policy on storage.objects and the bucket it is restricted to (review by eye; none may lack bucket_id):
--    SELECT policyname, permissive, roles, cmd, qual FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY 1;
-- 4) As a normal (non-admin) user the bucket lists nothing; as admin it lists the objects (Dashboard -> Storage,
--    or a client call sb.storage.from('candles').list()).
-- ============================================================
