-- ============================================================
-- WAWE JOURNAL - cTrader: user-controlled auto sync + revoked account access
-- Migration: 202611090001_ctrader_auto_sync_access.sql
--
-- 1. ctrader_accounts.auto_sync (boolean, default false)
--      The user's "sync automatically when I open the site" switch, per account. The browser syncs a linked account
--      in the background when this is on and the last successful sync is older than 30 minutes.
--      Changed only through set_ctrader_auto_sync() (the table has RLS on and no policies).
-- 2. ctrader_accounts.access_revoked_at (timestamptz, NULL = access OK)
--      On the cTrader consent screen the user picks which accounts the app may read. An account left out of a later
--      authorization stays in our table but cTrader answers "Unable to find cTID trader account". ctrader-connect sets
--      this column for accounts missing from the new account list (and clears it for the listed ones); ctrader-sync
--      sets it when cTrader reports that error. Revoked accounts are not synced and cannot be linked to a journal.
-- 3. get_ctrader_status() also returns auto_sync, access_revoked, access_revoked_at.
-- 4. link_ctrader_account() refuses a revoked account.
-- 5. set_ctrader_auto_sync(p_account_id, p_enabled) RPC.
--
-- Order: this migration, then the ctrader-connect and ctrader-sync Edge Functions, then the site.
-- (The new functions write access_revoked_at; the old site ignores the new status fields.)
-- Rollback: supabase/rollbacks/202611090001_ctrader_auto_sync_access.down.sql
-- Verify:   supabase/tests/ctrader_auto_sync_access_verify.sql (one transaction, ends with ROLLBACK)
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF to_regclass('public.ctrader_accounts') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.ctrader_accounts not found (202610120001_ctrader_integration.sql).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ctrader_accounts'
                  AND column_name = 'balance_updated_at') THEN
    RAISE EXCEPTION 'PRECONDITION: ctrader_accounts.balance_updated_at not found (202610150005_ctrader_balance.sql).';
  END IF;
END $$;

ALTER TABLE public.ctrader_accounts
  ADD COLUMN IF NOT EXISTS auto_sync         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ;

-- Accounts whose last sync already failed with cTrader's "account not found" answer start out marked, so the site
-- shows "Authorize" right away instead of failing once more. (On 2026-11-09 live had one such account.)
UPDATE public.ctrader_accounts
SET access_revoked_at = updated_at
WHERE access_revoked_at IS NULL
  AND last_error ILIKE 'Unable to find cTID trader account%';

-- ------------------------------------------------------------ get_ctrader_status
CREATE OR REPLACE FUNCTION public.get_ctrader_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_token RECORD;
  v_accounts JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT status, expires_at INTO v_token
  FROM public.ctrader_tokens
  WHERE user_id = v_uid;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'ctid_trader_account_id', a.ctid_trader_account_id,
      'is_live', a.is_live,
      'trader_login', a.trader_login,
      'broker_name', a.broker_name,
      'journal_id', a.journal_id,
      'journal_name', j.name,
      'last_sync_at', a.last_sync_at,
      'last_error', a.last_error,
      'is_syncing', (a.syncing_since IS NOT NULL AND a.syncing_since > now() - INTERVAL '5 minutes'),
      'balance', a.balance,
      'balance_currency', a.balance_currency,
      'balance_updated_at', a.balance_updated_at,
      'auto_sync', a.auto_sync,
      'access_revoked', (a.access_revoked_at IS NOT NULL),
      'access_revoked_at', a.access_revoked_at
    ) ORDER BY a.is_live DESC, a.created_at ASC
  ), '[]'::jsonb)
  INTO v_accounts
  FROM public.ctrader_accounts a
  LEFT JOIN public.journals j ON j.id = a.journal_id
  WHERE a.user_id = v_uid;

  RETURN jsonb_build_object(
    'is_connected', (v_token.status IS NOT NULL),
    'token_status', COALESCE(v_token.status, 'none'),
    'is_expired', (v_token.expires_at IS NOT NULL AND v_token.expires_at <= now()),
    'accounts', v_accounts
  );
END;
$$;

-- ------------------------------------------------------------ link_ctrader_account
CREATE OR REPLACE FUNCTION public.link_ctrader_account(
  p_account_id UUID,
  p_journal_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_revoked TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.journals
    WHERE id = p_journal_id AND user_id = v_uid AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Defter bulunamadı veya yetkisiz.');
  END IF;

  SELECT access_revoked_at INTO v_revoked
  FROM public.ctrader_accounts
  WHERE id = p_account_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cTrader hesabı bulunamadı.');
  END IF;
  IF v_revoked IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCESS_REVOKED',
      'error', 'Bu cTrader hesabına erişim izni yok. cTrader ile yeniden yetkilendirirken bu hesabı da seçin.');
  END IF;

  -- this journal's previous account is freed first (one account per journal)
  UPDATE public.ctrader_accounts
  SET journal_id = NULL, updated_at = now()
  WHERE user_id = v_uid AND journal_id = p_journal_id AND id <> p_account_id;

  UPDATE public.ctrader_accounts
  SET journal_id = p_journal_id, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ------------------------------------------------------------ set_ctrader_auto_sync
CREATE OR REPLACE FUNCTION public.set_ctrader_auto_sync(
  p_account_id UUID,
  p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_enabled IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_enabled gereklidir.');
  END IF;

  UPDATE public.ctrader_accounts
  SET auto_sync = p_enabled, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cTrader hesabı bulunamadı.');
  END IF;
  RETURN jsonb_build_object('success', true, 'auto_sync', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.set_ctrader_auto_sync(UUID, BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ctrader_auto_sync(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
