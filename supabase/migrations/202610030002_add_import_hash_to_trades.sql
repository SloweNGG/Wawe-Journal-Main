-- ============================================================
-- WAWE JOURNAL - IMPORT HASH & DEDUPLICATION MIGRATION
-- Migration: 202610030002_add_import_hash_to_trades.sql
-- Description: Adds import_hash column to trades table and creates
--              a UNIQUE index on (user_id, journal_id, import_hash)
--              to prevent duplicate trade entries at database level.
-- ============================================================

BEGIN;

-- 1. Add import_hash column if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'trades' 
      AND column_name = 'import_hash'
  ) THEN
    ALTER TABLE public.trades ADD COLUMN import_hash TEXT NULL;
  END IF;
END $$;

-- 2. Create Unique Partial Index on (user_id, journal_id, import_hash)
-- Nullable: only enforces uniqueness when import_hash is NOT NULL,
-- so manual trades without an import_hash are completely unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trades_user_journal_import_hash 
  ON public.trades (user_id, journal_id, import_hash)
  WHERE import_hash IS NOT NULL;

COMMIT;
