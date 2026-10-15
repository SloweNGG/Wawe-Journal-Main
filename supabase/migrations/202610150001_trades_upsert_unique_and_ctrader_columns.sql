-- ============================================================
-- WAWE JOURNAL - cTrader sync: upsert-compatible unique constraint + missing columns
-- Migration: 202610150001_trades_upsert_unique_and_ctrader_columns.sql
--
-- Why:
--  1. ctrader-sync does  upsert(..., { onConflict: 'user_id,journal_id,import_hash' }).
--     Postgres can only infer a NON-partial unique index/constraint for
--     ON CONFLICT (cols). Migration 202610030002 created a PARTIAL unique index
--     (WHERE import_hash IS NOT NULL), which makes the upsert fail with 42P10.
--  2. ctrader-sync writes position_id / last_deal_id / platform_source, which no
--     earlier migration creates. They are added here if missing.
--
-- Idempotent and safe on both kinds of database:
--  * Live DB where a UNIQUE constraint named uq_trades_user_journal_import_hash
--    was already added by hand: nothing is touched.
--  * DB built only from the repo migrations (partial index of the same name):
--    the partial index is replaced by an equivalent UNIQUE constraint.
--    NULL import_hash values are always distinct, so manual trades are unaffected.
-- ============================================================

BEGIN;

ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS position_id     TEXT   NULL;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS last_deal_id    BIGINT NULL;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS platform_source TEXT   NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.trades'::regclass
      AND conname  = 'uq_trades_user_journal_import_hash'
  ) THEN
    -- Only a partial index with this name exists: drop it, add the real constraint.
    DROP INDEX IF EXISTS public.uq_trades_user_journal_import_hash;
    ALTER TABLE public.trades
      ADD CONSTRAINT uq_trades_user_journal_import_hash
      UNIQUE (user_id, journal_id, import_hash);
  END IF;
END $$;

COMMIT;
