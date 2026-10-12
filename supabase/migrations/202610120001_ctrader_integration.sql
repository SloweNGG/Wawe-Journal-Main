-- ============================================================
-- WAWE JOURNAL - cTRADER OPEN API INTEGRATION MIGRATION
-- Migration: 202610120001_ctrader_integration.sql
-- Description:
--   1. ctrader_tokens (Kullanıcı cTID tokenları - RLS kilitli)
--   2. ctrader_accounts (Kullanıcının cTrader hesapları & defter eşleşmeleri)
--   3. RPC: get_ctrader_status() (Token içermeyen güvenli durum sorgusu)
--   4. RPC: link_ctrader_account() / unlink_ctrader_account() (Defter eşleme)
--   5. RPC: disconnect_ctrader() (Tamamen bağlantıyı koparma)
-- ============================================================

BEGIN;

-- 1. TABLO: ctrader_tokens
-- Kullanıcı başına tek satır (cTrader access token cTID bazlıdır)
CREATE TABLE IF NOT EXISTS public.ctrader_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT DEFAULT 'accounts',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reconnect')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABLO: ctrader_accounts
-- Kullanıcının cTrader altındaki tüm demo/live hesapları
CREATE TABLE IF NOT EXISTS public.ctrader_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ctid_trader_account_id BIGINT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false,
  trader_login BIGINT,
  broker_name TEXT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  last_sync_at TIMESTAMPTZ,
  last_deal_timestamp BIGINT,
  syncing_since TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ctrader_user_account UNIQUE (user_id, ctid_trader_account_id)
);

-- Bir deftere aynı anda yalnızca TEK bir cTrader hesabı bağlanabilir
CREATE UNIQUE INDEX IF NOT EXISTS uq_ctrader_accounts_journal_id 
  ON public.ctrader_accounts(journal_id) 
  WHERE journal_id IS NOT NULL;

-- 3. GÜVENLİK (RLS)
-- İki tabloda da RLS AÇIK.
-- Authenticated kullanıcılar için HİÇBİR policy VERİLMEZ.
-- Doğrudan tarayıcıdan SELECT / INSERT / UPDATE / DELETE yapılamaz.
-- Sadece Supabase Service Role (Edge Function) ve SECURITY DEFINER RPC erişebilir.
ALTER TABLE public.ctrader_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ctrader_accounts ENABLE ROW LEVEL SECURITY;

-- 4. RPC: get_ctrader_status()
-- Tarayıcının bağlantı durumunu ve hesap listesini token sızdırmadan güvenle okumasını sağlar
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
      'is_syncing', (a.syncing_since IS NOT NULL AND a.syncing_since > now() - INTERVAL '5 minutes')
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

-- 5. RPC: link_ctrader_account(p_account_id, p_journal_id)
-- Bir cTrader hesabını belirli bir deftere eşler
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
$$;

-- 6. RPC: unlink_ctrader_account(p_account_id)
-- Bir defterin cTrader bağlantısını keser
CREATE OR REPLACE FUNCTION public.unlink_ctrader_account(
  p_account_id UUID
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

  UPDATE public.ctrader_accounts
  SET journal_id = NULL, updated_at = now()
  WHERE id = p_account_id AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. RPC: disconnect_ctrader()
-- Kullanıcının tüm cTrader bağlantısını ve hesap kayıtlarını siler
CREATE OR REPLACE FUNCTION public.disconnect_ctrader()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  DELETE FROM public.ctrader_tokens WHERE user_id = v_uid;
  DELETE FROM public.ctrader_accounts WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- İzinler
REVOKE ALL ON FUNCTION public.get_ctrader_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_ctrader_status() TO authenticated;

REVOKE ALL ON FUNCTION public.link_ctrader_account(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.link_ctrader_account(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.unlink_ctrader_account(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.unlink_ctrader_account(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.disconnect_ctrader() FROM public;
GRANT EXECUTE ON FUNCTION public.disconnect_ctrader() TO authenticated;

COMMIT;
