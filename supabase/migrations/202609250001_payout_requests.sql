-- ============================================================
-- INFLUENCER PARA ÇEKME (PAYOUT) TALEPLERİ VE CÜZDAN ADRESLERİ
-- ============================================================

-- 1. user_profiles tablosuna BTC ve LTC çekim adresleri ekle
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS btc_payout_address text,
ADD COLUMN IF NOT EXISTS ltc_payout_address text;

-- 2. payout_requests tablosu
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 20),
  currency text NOT NULL CHECK (currency IN ('LTC', 'BTC')),
  payout_address text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_requests_user_select" ON public.payout_requests;
CREATE POLICY "payout_requests_user_select" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() = true);

DROP POLICY IF EXISTS "payout_requests_user_insert" ON public.payout_requests;
CREATE POLICY "payout_requests_user_insert" ON public.payout_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "payout_requests_admin_all" ON public.payout_requests;
CREATE POLICY "payout_requests_admin_all" ON public.payout_requests
  FOR ALL TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

-- 3. RPC: get_influencer_payout_summary()
-- Kullanıcının toplam kazancını, bekleyen çekimini, ödenen çekimini, kalan bakiyesini ve cüzdan adreslerini döner
CREATE OR REPLACE FUNCTION public.get_influencer_payout_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total_earnings numeric := 0;
  v_pending_payout numeric := 0;
  v_paid_payout numeric := 0;
  v_available_balance numeric := 0;
  v_btc_address text;
  v_ltc_address text;
  v_requests jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- 1. Toplam komisyon kazancı
  SELECT COALESCE(SUM(usage_count::numeric * commission_rate), 0)
  INTO v_total_earnings
  FROM public.referral_codes
  WHERE influencer_user_id = v_user_id;

  -- 2. Bekleyen ve ödenen çekimler
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0)
  INTO v_pending_payout, v_paid_payout
  FROM public.payout_requests
  WHERE user_id = v_user_id;

  v_available_balance := GREATEST(0, v_total_earnings - v_pending_payout - v_paid_payout);

  -- 3. Cüzdan adresleri
  SELECT btc_payout_address, ltc_payout_address
  INTO v_btc_address, v_ltc_address
  FROM public.user_profiles
  WHERE id = v_user_id;

  -- 4. Kullanıcının çekim talepleri listesi
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_requests
  FROM (
    SELECT id, amount, currency, payout_address, status, admin_note, created_at, updated_at
    FROM public.payout_requests
    WHERE user_id = v_user_id
    ORDER BY created_at DESC
  ) r;

  RETURN jsonb_build_object(
    'total_earnings', v_total_earnings,
    'pending_payout', v_pending_payout,
    'paid_payout', v_paid_payout,
    'available_balance', v_available_balance,
    'btc_address', v_btc_address,
    'ltc_address', v_ltc_address,
    'requests', v_requests
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_payout_summary() TO authenticated;

-- 4. RPC: submit_payout_request(p_amount numeric, p_currency text, p_address text)
CREATE OR REPLACE FUNCTION public.submit_payout_request(
  p_amount numeric,
  p_currency text,
  p_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_total_earnings numeric := 0;
  v_pending_payout numeric := 0;
  v_paid_payout numeric := 0;
  v_available_balance numeric := 0;
  v_curr text := upper(trim(p_currency));
  v_addr text := trim(p_address);
  v_new_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Oturum açmanız gerekiyor.');
  END IF;

  IF p_amount IS NULL OR p_amount < 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum çekim tutarı $20 olmalıdır.');
  END IF;

  IF v_curr NOT IN ('LTC', 'BTC') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz para birimi. Sadece LTC veya BTC seçilebilir.');
  END IF;

  IF v_addr = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lütfen geçerli bir cüzdan adresi girin.');
  END IF;

  -- Bakiye hesapla
  SELECT COALESCE(SUM(usage_count::numeric * commission_rate), 0)
  INTO v_total_earnings
  FROM public.referral_codes
  WHERE influencer_user_id = v_user_id;

  SELECT 
    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0)
  INTO v_pending_payout, v_paid_payout
  FROM public.payout_requests
  WHERE user_id = v_user_id;

  v_available_balance := GREATEST(0, v_total_earnings - v_pending_payout - v_paid_payout);

  IF p_amount > v_available_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetersiz bakiye. Çekilebilir maksimum tutar: $' || v_available_balance);
  END IF;

  -- Cüzdan adresini profilde de güncelle
  IF v_curr = 'LTC' THEN
    UPDATE public.user_profiles SET ltc_payout_address = v_addr WHERE id = v_user_id;
  ELSIF v_curr = 'BTC' THEN
    UPDATE public.user_profiles SET btc_payout_address = v_addr WHERE id = v_user_id;
  END IF;

  -- Talebi ekle
  INSERT INTO public.payout_requests (user_id, amount, currency, payout_address, status)
  VALUES (v_user_id, p_amount, v_curr, v_addr, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'request_id', v_new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payout_request(numeric, text, text) TO authenticated;

-- 5. RPC: save_payout_addresses(p_btc text, p_ltc text)
CREATE OR REPLACE FUNCTION public.save_payout_addresses(
  p_btc text,
  p_ltc text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.user_profiles
  SET btc_payout_address = trim(p_btc),
      ltc_payout_address = trim(p_ltc)
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_payout_addresses(text, text) TO authenticated;

-- 6. RPC: admin_process_payout(p_id uuid, p_status text, p_admin_note text)
CREATE OR REPLACE FUNCTION public.admin_process_payout(
  p_id uuid,
  p_status text,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stat text := lower(trim(p_status));
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  END IF;

  IF v_stat NOT IN ('approved', 'rejected', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum.');
  END IF;

  UPDATE public.payout_requests
  SET status = v_stat,
      admin_note = trim(p_admin_note),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;
