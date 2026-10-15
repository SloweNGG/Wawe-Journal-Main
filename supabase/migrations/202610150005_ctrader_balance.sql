-- ============================================================
-- WAWE JOURNAL - cTrader hesap bakiyesi (Hesaplarım kartında gösterilir)
-- Migration: 202610150005_ctrader_balance.sql
--
-- ctrader-sync edge function her senkronda cTrader'dan (ProtoOATraderReq) hesap bakiyesini okur ve buraya yazar.
--   balance            : hesap bakiyesi (kapanmış işlemler dahil; açık pozisyonun anlık K/Z'si dahil DEĞİL)
--   balance_currency   : para birimi (USD, EUR ...) - alınamazsa NULL
--   balance_updated_at : bakiyenin okunduğu an
--
-- get_ctrader_status() bu alanları da döndürür. Alanlar yoksa/NULL ise arayüz "Senkronla" ipucu gösterir.
-- Önce bu migration, sonra ctrader-sync fonksiyonu deploy edilmelidir.
-- ============================================================

BEGIN;

ALTER TABLE public.ctrader_accounts
  ADD COLUMN IF NOT EXISTS balance            NUMERIC(24, 8),
  ADD COLUMN IF NOT EXISTS balance_currency   TEXT,
  ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;

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
$$;

REVOKE ALL ON FUNCTION public.get_ctrader_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_ctrader_status() TO authenticated;

COMMIT;
