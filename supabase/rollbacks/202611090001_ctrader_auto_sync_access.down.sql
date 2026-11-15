-- ============================================================
-- ROLLBACK of 202611090001_ctrader_auto_sync_access.sql
-- Restores get_ctrader_status() and link_ctrader_account() exactly as they were on live before the migration
-- (taken with pg_get_functiondef on 2026-11-09), drops set_ctrader_auto_sync() and the two columns.
-- Loses: every user's auto-sync switch and the revoked-access marks (cTrader reports the error again on the next sync).
-- Roll back the ctrader-connect / ctrader-sync Edge Functions FIRST: the new versions write access_revoked_at.
-- Run with psql -v ON_ERROR_STOP=1, the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ctrader_accounts'
                  AND column_name = 'auto_sync') THEN
    RAISE EXCEPTION 'ORDER: ctrader_accounts.auto_sync not found (migration 202611090001 is not applied).';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_ctrader_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_token RECORD;
  v_accounts JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Token durumu kontrolü
  SELECT status, expires_at INTO v_token
  FROM public.ctrader_tokens
  WHERE user_id = v_uid;

  -- Hesapları defter bilgisiyle birlikte topla
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
      'balance_updated_at', a.balance_updated_at
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
$function$

;

CREATE OR REPLACE FUNCTION public.link_ctrader_account(p_account_id uuid, p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1) Defterin kullanıcıya ait ve aktif olduğunu doğrula
  IF NOT EXISTS (
    SELECT 1 FROM public.journals 
    WHERE id = p_journal_id AND user_id = v_uid AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Defter bulunamadı veya yetkisiz.');
  END IF;

  -- 2) cTrader hesabının bu kullanıcıya ait olduğunu doğrula
  IF NOT EXISTS (
    SELECT 1 FROM public.ctrader_accounts 
    WHERE id = p_account_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'cTrader hesabı bulunamadı.');
  END IF;

  -- 3) Bu deftere bağlı başka bir cTrader hesabı varsa önce onu boşa çıkar
  UPDATE public.ctrader_accounts
  SET journal_id = NULL, updated_at = now()
  WHERE user_id = v_uid AND journal_id = p_journal_id;

  -- 4) Seçili hesabı bu deftere bağla
  UPDATE public.ctrader_accounts
  SET journal_id = p_journal_id, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$function$

;

DROP FUNCTION IF EXISTS public.set_ctrader_auto_sync(UUID, BOOLEAN);

ALTER TABLE public.ctrader_accounts
  DROP COLUMN IF EXISTS auto_sync,
  DROP COLUMN IF EXISTS access_revoked_at;

NOTIFY pgrst, 'reload schema';

COMMIT;
