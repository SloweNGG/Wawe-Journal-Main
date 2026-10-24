-- ============================================================
-- WAWE JOURNAL - BACKTEST CHART DRAWINGS (Premium)
-- Migration: 202610240001_backtest_drawings.sql
-- Description:
--   1. public.backtest_drawings: one row per drawing of a backtest account (trend line, horizontal line, ray, rectangle,
--      Fibonacci, long/short position tool, text, measure). Coordinates are TIME (UTC seconds) and PRICE pairs in `points`
--      (jsonb array), so a drawing stays in place across timeframes. `style` holds the color, the text and the lock flag.
--      Size guards: 1-3 points, style text <= 200 characters, each jsonb value <= 2 KB.
--   2. RLS (TO authenticated): select/insert/update/delete own rows (USING user_id = auth.uid() OR is_admin() for select and
--      delete, WITH CHECK user_id = auth.uid()), the same pattern as backtest_accounts.
--   3. check_backtest_drawing() BEFORE INSERT OR UPDATE (SECURITY DEFINER):
--      - an API caller can only write its own user_id (BACKTEST_NOT_OWNER, before RLS, like the other backtest triggers);
--      - the account belongs to the same user (INVALID_BACKTEST_ACCOUNT); id, user_id and backtest_account_id are immutable;
--      - writing drawings needs an active Premium plan (BACKTEST_DRAWINGS_PREMIUM); deleting does not (a lapsed Premium can
--        still clean up, and reading stays possible);
--      - at most 500 drawings per account (BACKTEST_DRAWINGS_LIMIT);
--      - updated_at is set by the trigger.
--   Rows go with their account (ON DELETE CASCADE), so reset_user_data() and account deletion need no change.
-- Run order: after 202610220001. Rollback: supabase/rollbacks/202610240001_backtest_drawings.down.sql
-- How to run: psql -v ON_ERROR_STOP=1 (or the Supabase SQL Editor), the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.backtest_accounts') IS NULL OR to_regclass('public.user_profiles') IS NULL
     OR to_regprocedure('auth.uid()') IS NULL OR to_regprocedure('public.is_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.backtest_accounts, public.user_profiles, auth.uid() and public.is_admin() must exist.';
  END IF;
  IF to_regclass('public.backtest_drawings') IS NOT NULL THEN
    RAISE EXCEPTION 'ORDER: public.backtest_drawings already exists (this migration was already applied).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = current_user AND (r.rolsuper OR r.rolbypassrls))
     AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = 'public.backtest_accounts'::regclass
                      AND pg_get_userbyid(c.relowner) = current_user AND NOT c.relforcerowsecurity) THEN
    RAISE EXCEPTION 'PRECONDITION: role % does not bypass RLS; run this file as postgres.', current_user;
  END IF;
END $$;

-- 1. TABLE ----------------------------------------------------------------------------------------
CREATE TABLE public.backtest_drawings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  backtest_account_id uuid        NOT NULL REFERENCES public.backtest_accounts(id) ON DELETE CASCADE,
  tool                text        NOT NULL,
  points              jsonb       NOT NULL,
  style               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_backtest_drawings_tool
    CHECK (tool IN ('trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure')),
  CONSTRAINT chk_backtest_drawings_points
    CHECK (jsonb_typeof(points) = 'array' AND jsonb_array_length(points) BETWEEN 1 AND 3 AND pg_column_size(points) <= 2048),
  CONSTRAINT chk_backtest_drawings_style
    CHECK (jsonb_typeof(style) = 'object' AND pg_column_size(style) <= 2048
           AND char_length(coalesce(style ->> 'text', '')) <= 200)
);

CREATE INDEX idx_backtest_drawings_account ON public.backtest_drawings (backtest_account_id, created_at);

COMMENT ON TABLE public.backtest_drawings IS
  'Chart drawings of a backtest account (Premium). points: [{"t": UTC seconds, "p": price}, ...]; style: {"color", "text", "locked"}. Written by public/interface/backtest/js/bt-draw.js.';

-- 2. RLS ------------------------------------------------------------------------------------------
ALTER TABLE public.backtest_drawings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backtest_drawings_select_own" ON public.backtest_drawings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "backtest_drawings_insert_own" ON public.backtest_drawings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_drawings_update_own" ON public.backtest_drawings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "backtest_drawings_delete_own" ON public.backtest_drawings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

REVOKE ALL ON public.backtest_drawings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backtest_drawings TO authenticated;

-- 3. TRIGGER --------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_backtest_drawing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan    text;
  v_expires timestamptz;
  v_count   int;
BEGIN
  -- BEFORE ROW triggers run before the RLS WITH CHECK: never evaluate another user's rows for an API caller
  IF NEW.user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'BACKTEST_NOT_OWNER' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.id, NEW.user_id, NEW.backtest_account_id, NEW.created_at)
                          IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.backtest_account_id, OLD.created_at) THEN
    RAISE EXCEPTION 'BACKTEST_DRAWING_IMMUTABLE';
  END IF;

  IF TG_OP = 'INSERT' AND NOT EXISTS (SELECT 1 FROM public.backtest_accounts a
                                       WHERE a.id = NEW.backtest_account_id AND a.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'INVALID_BACKTEST_ACCOUNT';
  END IF;

  -- Premium only (service role and the SQL editor have no API JWT and skip it)
  IF coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated') THEN
    SELECT up.plan, up.plan_expires_at INTO v_plan, v_expires FROM public.user_profiles up WHERE up.id = NEW.user_id;
    IF NOT (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now())) THEN
      RAISE EXCEPTION 'BACKTEST_DRAWINGS_PREMIUM';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('wawe.backtest_drawings:' || NEW.backtest_account_id::text, 0));
    SELECT count(*) INTO v_count FROM public.backtest_drawings d WHERE d.backtest_account_id = NEW.backtest_account_id;
    IF v_count >= 500 THEN
      RAISE EXCEPTION 'BACKTEST_DRAWINGS_LIMIT:500';
    END IF;
    NEW.created_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_backtest_drawing() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_check_backtest_drawing
  BEFORE INSERT OR UPDATE ON public.backtest_drawings
  FOR EACH ROW EXECUTE FUNCTION public.check_backtest_drawing();

-- 4. CHECKS (read only) -------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'backtest_drawings') <> 4 THEN
    RAISE EXCEPTION 'CHECK: expected 4 policies on backtest_drawings';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backtest_drawings'::regclass) THEN
    RAISE EXCEPTION 'CHECK: RLS is not enabled on backtest_drawings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_check_backtest_drawing' AND tgrelid = 'public.backtest_drawings'::regclass) THEN
    RAISE EXCEPTION 'CHECK: trigger missing';
  END IF;
  RAISE NOTICE 'backtest_drawings OK';
END $$;

COMMIT;
