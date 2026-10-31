-- ============================================================
-- ROLLBACK of 202610310002_referral_commission_ledger.sql
-- Restores the previous definitions VERBATIM from the migrations that created them:
--   process_payment_finished, submit_payout_request  <- 202610150002_atomic_payments_and_payout_locks.sql
--   validate_referral_code                           <- 202610130002_fix_referral_code_overload.sql
--   get_influencer_earnings, get_influencer_payout_summary <- 202610050001_add_yearly_commission.sql
-- then drops reverse_referral_commission, partner_commission_total, public.referral_commissions and the payments index.
-- Effect: earnings go back to usage_count × CURRENT commission rate. Use counters are kept, so balances equal what the
-- old formula gives; per-sale rates and refund reversals recorded since the migration are lost.
-- How to run: SQL Editor (or psql -v ON_ERROR_STOP=1), the WHOLE file at once. Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE OR REPLACE FUNCTION public.process_payment_finished(
  p_user_id        uuid,
  p_plan_type      text,
  p_invoice_id     text,
  p_order_id       text,
  p_amount         numeric,
  p_currency       text,
  p_paid_amount    numeric,
  p_paid_currency  text,
  p_pay_address    text,
  p_referral_code  text,
  p_duration_days  integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan        text;
  v_expires     timestamptz;
  v_email       text;
  v_base        timestamptz;
  v_new_expires timestamptz;
  v_ref         text := NULLIF(UPPER(TRIM(COALESCE(p_referral_code, ''))), '');
  v_ref_owner   uuid;
BEGIN
  IF p_user_id IS NULL OR p_invoice_id IS NULL OR p_invoice_id = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS';
  END IF;
  IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
    RAISE EXCEPTION 'INVALID_DURATION';
  END IF;

  -- Aynı invoice için işlemler sıraya girer (aynı anda gelen iki bildirimden yalnızca biri uygular)
  PERFORM pg_advisory_xact_lock(hashtext('payment:' || p_invoice_id));

  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE invoice_id = p_invoice_id AND payment_status = 'finished'
  ) THEN
    SELECT plan_expires_at INTO v_expires FROM public.user_profiles WHERE id = p_user_id;
    RETURN jsonb_build_object('already_processed', true, 'expires_at', v_expires);
  END IF;

  SELECT plan, plan_expires_at, email
    INTO v_plan, v_expires, v_email
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  -- Süresi dolmamış premium varsa mevcut bitişten, yoksa şimdiden uzat
  IF v_plan = 'premium' AND v_expires IS NOT NULL AND v_expires > now() THEN
    v_base := v_expires;
  ELSE
    v_base := now();
  END IF;
  v_new_expires := v_base + make_interval(days => p_duration_days);

  UPDATE public.user_profiles
  SET plan = 'premium',
      plan_expires_at = v_new_expires
  WHERE id = p_user_id;

  INSERT INTO public.payments (
    user_id, invoice_id, order_id, amount, currency, plan_type, payment_status,
    paid_amount, paid_currency, pay_address, referral_code, created_at, updated_at
  ) VALUES (
    p_user_id, p_invoice_id, p_order_id, p_amount, p_currency, p_plan_type, 'finished',
    p_paid_amount, p_paid_currency, p_pay_address, v_ref, now(), now()
  );

  -- Referral: kod sahibi ödeyen kişinin kendisi ise komisyon işlenmez
  IF v_ref IS NOT NULL THEN
    SELECT influencer_user_id INTO v_ref_owner FROM public.referral_codes WHERE code = v_ref;
    IF v_ref_owner IS NULL OR v_ref_owner <> p_user_id THEN
      PERFORM public.increment_referral_usage(v_ref, COALESCE(p_plan_type, 'monthly'));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_processed', false,
    'expires_at', v_new_expires,
    'email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_payment_finished(uuid, text, text, text, numeric, text, numeric, text, text, text, integer) FROM public;
REVOKE ALL ON FUNCTION public.process_payment_finished(uuid, text, text, text, numeric, text, numeric, text, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_finished(uuid, text, text, text, numeric, text, numeric, text, text, text, integer) TO service_role;

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

  -- Aynı kullanıcının paralel çağrıları sıraya girer: bakiye kontrolü ile talep ekleme arasında
  -- ikinci bir talep araya giremez (aksi halde iki talep de aynı bakiyeyi görüp onaylanıyordu).
  PERFORM pg_advisory_xact_lock(hashtext('payout:' || v_user_id::text));

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

DROP FUNCTION IF EXISTS public.reverse_referral_commission(text[]);
DROP FUNCTION IF EXISTS public.partner_commission_total(uuid);
DROP TABLE IF EXISTS public.referral_commissions;
DROP INDEX IF EXISTS public.idx_payments_user_referral_finished;

COMMIT;
