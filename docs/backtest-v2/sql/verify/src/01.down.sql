-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180001 (legacy backtest_trades)
-- Migration: 202610180001_drop_legacy_backtest_trades.down.sql
-- Rollback of: supabase/migrations/202610180001_drop_legacy_backtest_trades.sql
-- Description:
--   0. Preconditions: refuses to run while migration 202610180002 is still applied (roll that back
--      first; rollbacks run in REVERSE order) and checks that reset_user_data() is 01's version.
--   1. Recreates public.backtest_trades EXACTLY as it was live on 2026-10-18 (catalog dump in the
--      planning scratchpad: db/ and agents/bt_*.json, inputs/w1/inventory_backtest_trades.json):
--        - 15 columns, same order, types, NOT NULLs and defaults;
--        - backtest_trades_pkey (id) and backtest_trades_user_id_fkey -> auth.users(id), ON DELETE
--          NO ACTION (the live FK had no ON DELETE clause);
--        - the 4 live indexes (pkey, idx_backtest_trades_user_id, idx_backtest_trades_created_at,
--          idx_backtest_trades_user_time);
--        - RLS enabled (not forced) and the 4 live policies with their exact names, role {public}
--          (no TO clause) and expressions (UPDATE has no WITH CHECK, none uses is_admin());
--        - the Supabase default table grants (anon, authenticated, service_role: SELECT, INSERT,
--          UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER).
--   2. Restores the LIVE reset_user_data() body (with the guarded backtest_trades block).
-- Stage: 2 (rollback)
-- Run order: rollback, step 5 of 5 (reverse order: 06, 05, 04, 03, 02, then this file)
-- Data loss: NONE. The table comes back EMPTY, as it was when dropped. Its pg_stat history and its
--   OID are not restorable (nothing references them).
-- Exactness note: the snapshot reported the five numeric columns as information_schema 'numeric',
--   i.e. without visible precision. If the pre-flight capture (RUN_ORDER.md, P2) shows a typmod such
--   as numeric(18,8), change the column types below before running. The full backup taken before
--   migration 01 is the authoritative DDL source (pg_restore --schema-only -t backtest_trades).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regclass('public.backtest_accounts') IS NOT NULL
     OR to_regclass('public.backtest_account_trades') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: migration 202610180002 is still applied (backtest_accounts / backtest_account_trades exist). Run supabase/rollbacks/202610180002_backtest_accounts.down.sql first.';
  END IF;

  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p
   WHERE p.oid = to_regprocedure('public.reset_user_data()');

  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.reset_user_data() does not exist.';
  ELSIF v_md5 NOT IN ('{{MD5:reset_user_data.v01}}', '{{MD5:reset_user_data.live}}') THEN
    RAISE EXCEPTION 'DRIFT: public.reset_user_data() is neither the 202610180001 version nor the 2026-10-18 live body (normalised md5 %). Inspect it before rolling back.', v_md5;
  END IF;
END $$;

-- 1. The legacy table, as it was live ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backtest_trades (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  symbol      text        NOT NULL,
  asset_class text,
  "interval"  text,
  side        text        NOT NULL,
  entry_price numeric     NOT NULL,
  exit_price  numeric     NOT NULL,
  entry_time  timestamptz NOT NULL,
  exit_time   timestamptz NOT NULL,
  tp_pct      numeric,
  sl_pct      numeric,
  pnl_pct     numeric     NOT NULL,
  exit_reason text        NOT NULL,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT backtest_trades_pkey PRIMARY KEY (id),
  CONSTRAINT backtest_trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_backtest_trades_user_id    ON public.backtest_trades USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_created_at ON public.backtest_trades USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_user_time  ON public.backtest_trades USING btree (user_id, entry_time DESC);

ALTER TABLE public.backtest_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users select own backtest trades" ON public.backtest_trades;
DROP POLICY IF EXISTS "users insert own backtest trades" ON public.backtest_trades;
DROP POLICY IF EXISTS "users update own backtest trades" ON public.backtest_trades;
DROP POLICY IF EXISTS "users delete own backtest trades" ON public.backtest_trades;

CREATE POLICY "users select own backtest trades" ON public.backtest_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own backtest trades" ON public.backtest_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own backtest trades" ON public.backtest_trades
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users delete own backtest trades" ON public.backtest_trades
  FOR DELETE USING (auth.uid() = user_id);

-- Supabase default table privileges, as the live table had them. Default privileges usually add them
-- on CREATE TABLE already; the explicit GRANT makes the result independent of that.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.backtest_trades TO anon, authenticated, service_role;

-- 2. reset_user_data(): the LIVE body of 2026-10-18 (CRLF/LF-insensitive identical) ------------------
{{FN:reset_user_data.live}}

REVOKE ALL ON FUNCTION public.reset_user_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Columns (expect the 15 columns in this order with the defaults above):
--    SELECT attnum, attname, format_type(atttypid, atttypmod), attnotnull, pg_get_expr(d.adbin, d.adrelid)
--      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
--     WHERE a.attrelid = 'public.backtest_trades'::regclass AND a.attnum > 0 AND NOT a.attisdropped
--     ORDER BY attnum;
-- 2) Constraints / indexes / policies (compare with the pre-flight capture P2):
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.backtest_trades'::regclass;
--    SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'backtest_trades';
--    SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'backtest_trades';
-- 3) reset_user_data is the live body again (expect true):
--    SELECT md5(translate(prosrc, E' \t\r\n', '')) = '{{MD5:reset_user_data.live}}'
--      FROM pg_proc WHERE oid = 'public.reset_user_data()'::regprocedure;
-- ============================================================
