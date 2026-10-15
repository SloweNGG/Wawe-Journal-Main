-- ============================================================
-- WAWE JOURNAL - Atomik ödeme işleme + payout kilitleri
-- Migration: 202610150002_atomic_payments_and_payout_locks.sql
--
-- Çözülen sorunlar:
--  1. nowpayment-webhook "kontrol et sonra uygula" (check-then-act) yapıyordu: aynı 'finished' bildirimi
--     iki kez gelirse (NOWPayments yeniden denemesi / aynı anda iki istek) plan iki kez uzuyor ve
--     influencer komisyonu iki kez yazılıyordu. Artık her şey TEK TRANSACTION'da, invoice bazlı kilitle:
--     process_payment_finished().
--  2. Referral komisyonu site içi (QR) ödemelerde hiç yazılmıyordu: sayaç artık ödeme kaydıyla aynı
--     transaction'da, sunucunun doğruladığı referral kodundan artırılıyor.
--  3. submit_payout_request kilitsizdi: iki paralel çağrı bakiyenin iki katı kadar çekim talebi
--     oluşturabiliyordu. Kullanıcı bazlı advisory lock eklendi.
--  4. admin_process_payout durum kontrolü yapmıyordu: eski sekmeden "ödendi" bir talep "reddedildi"
--     yapılınca bakiye gerçekte gönderilmiş para için iade ediliyordu. Artık yalnızca geçerli geçişler var.
--
-- Not: payments tablosunda 'finished' için aynı invoice_id'den birden fazla kayıt varsa (eski çift işleme),
-- fazlaları 'finished_duplicate' olarak işaretlenir (silinmez). payment_status üzerinde CHECK kısıtı
-- varsa bu UPDATE hata verir; o durumda kısıta 'finished_duplicate' değerini ekleyin.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. payments: tekrarları işaretle + tekil index (yedek güvence) + order_id index
-- ------------------------------------------------------------
UPDATE public.payments p
SET payment_status = 'finished_duplicate'
FROM (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY invoice_id ORDER BY created_at, id) AS rn
  FROM public.payments
  WHERE payment_status = 'finished' AND invoice_id IS NOT NULL
) d
WHERE p.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_invoice_finished
  ON public.payments (invoice_id)
  WHERE payment_status = 'finished' AND invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order_id
  ON public.payments (order_id);

-- ------------------------------------------------------------
-- 2. process_payment_finished: ödeme tamamlandı -> plan uzat + kayıt + referral (tek transaction)
--    Yalnızca service_role (edge function) çağırabilir.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. submit_payout_request: kullanıcı bazlı kilit (çift harcama yarışı)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 4. admin_process_payout: yalnızca geçerli durum geçişleri
--    pending  -> approved | rejected
--    rejected -> pending   (yanlışlıkla reddedileni geri al; bakiyeyi yine bloke eder, güvenli)
--    approved -> (değişmez: ödenmiş para geri "iade" edilemez)
-- ------------------------------------------------------------
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
  v_cur text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Yetkisiz erişim.');
  END IF;

  IF v_stat NOT IN ('approved', 'rejected', 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Geçersiz durum.');
  END IF;

  SELECT status INTO v_cur FROM public.payout_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Talep bulunamadı.');
  END IF;

  IF v_cur = v_stat THEN
    RETURN jsonb_build_object('success', false, 'error', 'Talep zaten bu durumda (' || v_cur || ').');
  END IF;

  IF NOT (v_cur = 'pending' OR (v_cur = 'rejected' AND v_stat = 'pending')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bu talep zaten işlenmiş (' || v_cur || '); durumu değiştirilemez. Sayfayı yenileyin.');
  END IF;

  UPDATE public.payout_requests
  SET status = v_stat,
      admin_note = trim(p_admin_note),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true, 'status', v_stat);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text) TO authenticated;

COMMIT;
