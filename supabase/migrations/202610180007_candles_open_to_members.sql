-- ============================================================
-- WAWE JOURNAL - BACKTEST V2 / PHASE E: OPEN THE `candles` ARCHIVE TO ALL MEMBERS
-- Migration: 202610180007_candles_open_to_members.sql
-- Description (D12, ARSIV.md section 3):
--   Replaces the admin-only read policy of Migration 03 with one for every signed-in MEMBER:
--     policy candles_select_members on storage.objects: FOR SELECT TO authenticated
--       USING (bucket_id = 'candles'
--              AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false).
--   Anonymous sign-ins (Supabase anonymous users carry the 'authenticated' role too) stay excluded.
--   Write access is unchanged: none for clients.
-- !!! LICENCE GATE: the archive must only be opened once the licence question is settled (owner decision,
--   R52/R53; Binance Vision data is CC BY-NC-SA 4.0, forex/gold have no licensed source yet). This file
--   refuses to run until the owner uncomments the confirmation line below.
-- Stage: Phase E
-- Run order: 7 (after 03; the app side: navbar link for everyone, the /backtest admin gate removed)
-- Rollback: supabase/rollbacks/202610180007_candles_open_to_members.down.sql
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction). Writes to LIVE Storage metadata:
--   owner approval required (KURALLAR.md section 1).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
-- SET LOCAL wawe.confirm_open_candles_to_members = 'yes';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
BEGIN
  IF coalesce(current_setting('wawe.confirm_open_candles_to_members', true), '') <> 'yes' THEN
    RAISE EXCEPTION 'CONFIRM: opening the candle archive to all members needs the owner''s licence decision. Uncomment the confirmation line at the top of this file once it is made.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'candles' AND public IS FALSE) THEN
    RAISE EXCEPTION 'ORDER: run 202610180003_candles_bucket_admin_only.sql first (private bucket "candles" not found).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                  AND policyname IN ('candles_select_admin', 'candles_select_members')) THEN
    RAISE EXCEPTION 'ORDER: the read policy of 202610180003 is missing.';
  END IF;
END $$;

-- 1. Policy swap ----------------------------------------------------------------
DROP POLICY IF EXISTS "candles_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "candles_select_members" ON storage.objects;
CREATE POLICY "candles_select_members" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'candles'
         AND coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- 1) Exactly one candles policy, candles_select_members (expect 1 row):
--    SELECT policyname, cmd, roles, qual FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects' AND qual ILIKE '%candles%';
-- 2) As a normal member the bucket now lists the objects; with an anonymous sign-in it lists nothing.
-- ============================================================
