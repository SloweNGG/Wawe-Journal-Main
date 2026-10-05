-- ============================================================
-- ADD YEARLY COMMISSION SUPPORT TO REFERRAL CODES & EARNINGS
-- ============================================================

-- 1. referral_codes tablosuna yıllık komisyon ve kullanım sütunları ekle
ALTER TABLE public.referral_codes 
ADD COLUMN IF NOT EXISTS commission_rate_yearly NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS usage_count_monthly INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS usage_count_yearly INTEGER DEFAULT 0;

-- Mevcut kullanım sayılarını aylık kullanıma aktar (varsayılan olarak)
UPDATE public.referral_codes 
SET usage_count_monthly = COALESCE(usage_count, 0)
WHERE usage_count_monthly IS NULL OR usage_count_monthly = 0;

-- 2. KULLANIM ARTIRMA RPC'Sİ (Webhook için - plan_type destekli)
CREATE OR REPLACE FUNCTION public.increment_referral_usage(
  p_code text,
  p_plan_type text DEFAULT 'monthly'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_yearly boolean;
BEGIN
  v_is_yearly := (LOWER(TRIM(p_plan_type)) IN ('yearly', 'year', '1_year', 'annual'));

  UPDATE public.referral_codes
  SET 
    usage_count = COALESCE(usage_count, 0) + 1,
    usage_count_yearly = CASE WHEN v_is_yearly THEN COALESCE(usage_count_yearly, 0) + 1 ELSE COALESCE(usage_count_yearly, 0) END,
    usage_count_monthly = CASE WHEN NOT v_is_yearly THEN COALESCE(usage_count_monthly, 0) + 1 ELSE COALESCE(usage_count_monthly, 0) END,
    updated_at = NOW()
  WHERE code = UPPER(TRIM(p_code));
END;
$$;

REVOKE ALL ON FUNCTION public.increment_referral_usage(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_referral_usage(text, text) TO service_role;

-- Geriye dönük uyumluluk: tek parametreli çağrıyı da koru
CREATE OR REPLACE FUNCTION public.increment_referral_usage(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.increment_referral_usage(p_code, 'monthly');
END;
$$;

REVOKE ALL ON FUNCTION public.increment_referral_usage(text) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_referral_usage(text) TO service_role;


-- 3. GET_INFLUENCER_EARNINGS GÜNCELLEMESİ (Aylık + Yıllık Komisyon)
DROP FUNCTION IF EXISTS public.get_influencer_earnings();

CREATE OR REPLACE FUNCTION public.get_influencer_earnings()
RETURNS TABLE (
  code text,
  discount_percent integer,
  usage_count integer,
  commission_rate numeric,
  commission_rate_yearly numeric,
  usage_count_monthly integer,
  usage_count_yearly integer,
  total_earnings numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    code,
    discount_percent,
    usage_count,
    commission_rate,
    COALESCE(commission_rate_yearly, 0) as commission_rate_yearly,
    COALESCE(usage_count_monthly, usage_count, 0) as usage_count_monthly,
    COALESCE(usage_count_yearly, 0) as usage_count_yearly,
    (
      (COALESCE(usage_count_monthly, usage_count, 0)::numeric * COALESCE(commission_rate, 0)) +
      (COALESCE(usage_count_yearly, 0)::numeric * COALESCE(commission_rate_yearly, 0))
    ) as total_earnings
  FROM public.referral_codes
  WHERE influencer_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_earnings() TO authenticated;


-- 4. GET_INFLUENCER_PAYOUT_SUMMARY GÜNCELLEMESİ
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

  -- 1. Toplam komisyon kazancı (Aylık + Yıllık)
  SELECT COALESCE(SUM(
    (COALESCE(usage_count_monthly, usage_count, 0)::numeric * COALESCE(commission_rate, 0)) +
    (COALESCE(usage_count_yearly, 0)::numeric * COALESCE(commission_rate_yearly, 0))
  ), 0)
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


-- 5. SUBMIT_PAYOUT_REQUEST GÜNCELLEMESİ (Bakiye kontrolünde aylık+yıllık kazanç hesabı)
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
  v_curr text := UPPER(TRIM(p_currency));
  v_addr text := TRIM(p_address);
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

  -- Bakiye hesapla (Aylık + Yıllık)
  SELECT COALESCE(SUM(
    (COALESCE(usage_count_monthly, usage_count, 0)::numeric * COALESCE(commission_rate, 0)) +
    (COALESCE(usage_count_yearly, 0)::numeric * COALESCE(commission_rate_yearly, 0))
  ), 0)
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
    RETURN jsonb_build_object('success', false, 'error', 'Yetersiz bakiye. Çekilebilir tutar: $' || v_available_balance);
  END IF;

  -- Kullanıcının kayıtlı cüzdan adresini güncelle
  IF v_curr = 'BTC' THEN
    UPDATE public.user_profiles SET btc_payout_address = v_addr WHERE id = v_user_id;
  ELSIF v_curr = 'LTC' THEN
    UPDATE public.user_profiles SET ltc_payout_address = v_addr WHERE id = v_user_id;
  END IF;

  -- Yeni talep oluştur
  INSERT INTO public.payout_requests (user_id, amount, currency, payout_address, status)
  VALUES (v_user_id, p_amount, v_curr, v_addr, 'pending')
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Çekim talebiniz başarıyla alındı. Yönetici onayının ardından transferiniz gerçekleştirilecektir.',
    'request_id', v_new_id,
    'available_balance', v_available_balance - p_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payout_request(numeric, text, text) TO authenticated;


-- 6. REVIEW_PARTNER_APPLICATION GÜNCELLEMESİ (Yıllık komisyon parametresi eklendi)
CREATE OR REPLACE FUNCTION public.review_partner_application(
    p_app_id UUID,
    p_status TEXT,
    p_admin_note TEXT DEFAULT NULL,
    p_code TEXT DEFAULT NULL,
    p_discount NUMERIC DEFAULT 10,
    p_commission NUMERIC DEFAULT 4,
    p_commission_yearly NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_app RECORD;
    v_code_clean TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim. Sadece yöneticiler başvuruları inceleyebilir.');
    END IF;

    IF p_status NOT IN ('approved', 'rejected') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum. Sadece "approved" veya "rejected" olabilir.');
    END IF;

    SELECT * INTO v_app FROM public.partner_applications WHERE id = p_app_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Başvuru bulunamadı.');
    END IF;

    IF p_status = 'approved' AND (p_code IS NULL OR TRIM(p_code) = '') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Onaylama işlemi için bir referans kodu belirlemelisiniz.');
    END IF;

    IF p_status = 'approved' THEN
        v_code_clean := UPPER(TRIM(p_code));

        IF EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = v_code_clean) THEN
            UPDATE public.referral_codes
            SET discount_percent = COALESCE(p_discount, 10),
                commission_rate = COALESCE(p_commission, 4),
                commission_rate_yearly = COALESCE(p_commission_yearly, 0),
                influencer_user_id = v_app.user_id,
                referrer_name = v_app.full_name,
                is_active = true,
                updated_at = now()
            WHERE upper(code) = v_code_clean;
        ELSE
            INSERT INTO public.referral_codes (
                code,
                discount_percent,
                commission_rate,
                commission_rate_yearly,
                influencer_user_id,
                referrer_name,
                is_active
            ) VALUES (
                v_code_clean,
                COALESCE(p_discount, 10),
                COALESCE(p_commission, 4),
                COALESCE(p_commission_yearly, 0),
                v_app.user_id,
                v_app.full_name,
                true
            );
        END IF;

        UPDATE public.partner_applications
        SET status = 'approved',
            admin_note = p_admin_note,
            assigned_code = v_code_clean,
            reviewed_at = now(),
            reviewed_by = auth.uid(),
            updated_at = now()
        WHERE id = p_app_id;
    ELSE
        UPDATE public.partner_applications
        SET status = 'rejected',
            admin_note = p_admin_note,
            reviewed_at = now(),
            reviewed_by = auth.uid(),
            updated_at = now()
        WHERE id = p_app_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_status,
        'code', v_code_clean,
        'message', CASE WHEN p_status = 'approved' THEN 'Partner başvurusu onaylandı ve referans kodu oluşturuldu.' ELSE 'Partner başvurusu reddedildi.' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_partner_application(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO authenticated;
