-- ============================================================
-- PREVENT SELF-REFERRAL EXPLOITS
-- Influencer ve ortakların kendi oluşturdukları kodu kendi
-- hesaplarında kullanarak hem indirim hem de komisyon döngüsü
-- yaratmasını (öz-referans suistimali) engeller.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_referral_code(
  p_code text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
  v_caller_id uuid;
BEGIN
  -- Çağıran kullanıcının ID'si (parametre geçilmemişse auth.uid() kullanılır)
  v_caller_id := COALESCE(p_user_id, auth.uid());

  SELECT * INTO v_record FROM public.referral_codes WHERE code = UPPER(TRIM(p_code)) LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'invalid_code');
  END IF;
  
  IF v_record.is_active = false THEN
    RETURN jsonb_build_object('valid', false, 'error', 'inactive_code');
  END IF;
  
  IF v_record.expires_at IS NOT NULL AND v_record.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'expired_code');
  END IF;
  
  IF v_record.max_usage IS NOT NULL AND v_record.usage_count >= v_record.max_usage THEN
    RETURN jsonb_build_object('valid', false, 'error', 'usage_limit_reached');
  END IF;

  -- 🛡️ ÖZ-REFERANS (SELF-REFERRAL) ENGELİ:
  -- Kodun sahibi olan influencer kendi kodunu kullanamaz!
  IF v_caller_id IS NOT NULL AND v_record.influencer_user_id IS NOT NULL AND v_record.influencer_user_id = v_caller_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'self_referral_not_allowed');
  END IF;
  
  RETURN jsonb_build_object(
    'valid', true, 
    'discount_percent', v_record.discount_percent, 
    'referrer_name', v_record.referrer_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text, uuid) TO service_role;

-- Geriye dönük uyumluluk (tek parametreli çağrılar için varsayılan auth.uid() kullanımı)
CREATE OR REPLACE FUNCTION public.validate_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.validate_referral_code(p_code, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO service_role;
