-- ============================================================
-- WAWE JOURNAL - PARTNER COMMISSION LEDGER
-- Migration: 202610310002_referral_commission_ledger.sql
-- Description:
--   Until now a partner's earnings were computed on the fly as usage_count × the code's CURRENT commission rate, so
--   changing a rate in the admin panel rewrote all past earnings (and could wipe a balance that was already paid out),
--   a refunded or charged-back sale kept its commission, and a buyer could reuse the same partner code on every crypto
--   purchase (discount + commission every time; card payments already pay commission on the first sale only).
--   This migration:
--     - adds public.referral_commissions: one row per credited sale with the rate in force at that moment
--       (kind 'sale'), its refund/chargeback reversal (kind 'reversal', negative), and one 'legacy' row per code that
--       freezes today's earnings exactly (usage × current rate), so no balance changes when this runs
--     - process_payment_finished (same signature): writes the 'sale' row; a buyer earns the partner commission (and
--       counts as a code use) only on their FIRST finished payment with that code
--     - validate_referral_code (same signature): new error 'already_used' when the buyer already paid with the code,
--       so the discount is also first-purchase-only (crypto and card)
--     - get_influencer_earnings / get_influencer_payout_summary / submit_payout_request: earnings = ledger sum
--     - new reverse_referral_commission(text[]) for creem-webhook refunds / disputes (service_role only)
--   Deleting a referral code still deletes its earnings (ON DELETE CASCADE), as before.
--   Return types and signatures are unchanged: the earnings page, admin panel and Edge Functions need no change to run
--   against it (creem-webhook already calls reverse_referral_commission and tolerates its absence).
-- Run order: after 202610310001. Rollback: supabase/rollbacks/202610310002_referral_commission_ledger.down.sql
-- Rehearsal: supabase/tests/rehearse_202610310002.mjs (PGlite)
-- How to run: SQL Editor (or psql -v ON_ERROR_STOP=1), the WHOLE file at once (one transaction). Backup first.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'referral_codes' AND column_name = 'usage_count_yearly') THEN
    RAISE EXCEPTION 'PRECONDITION: referral_codes.usage_count_yearly is missing (202610050001 not applied).';
  END IF;
  IF to_regprocedure('public.process_payment_finished(uuid, text, text, text, numeric, text, numeric, text, text, text, integer)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: process_payment_finished(11 args) is missing (202610150002 not applied).';
  END IF;
  IF to_regclass('public.payout_requests') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.payout_requests is missing (202609250001 not applied).';
  END IF;
  IF to_regclass('public.referral_commissions') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.referral_commissions already exists (migration already applied?).';
  END IF;
END $$;

-- 1. LEDGER TABLE --------------------------------------------------------------------------------------------
CREATE TABLE public.referral_commissions (
  id          bigserial PRIMARY KEY,
  code_id     uuid NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  partner_id  uuid NOT NULL,
  buyer_id    uuid,
  invoice_id  text,
  plan_type   text,
  kind        text NOT NULL CHECK (kind IN ('legacy', 'sale', 'reversal')),
  amount      numeric NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- one sale and at most one reversal per payment
CREATE UNIQUE INDEX uq_referral_commissions_invoice_kind
  ON public.referral_commissions (invoice_id, kind) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_referral_commissions_partner ON public.referral_commissions (partner_id);
CREATE INDEX idx_referral_commissions_code ON public.referral_commissions (code_id);

-- "has this buyer already paid with this code?"
CREATE INDEX IF NOT EXISTS idx_payments_user_referral_finished
  ON public.payments (user_id, referral_code) WHERE payment_status = 'finished' AND referral_code IS NOT NULL;

-- Only SECURITY DEFINER functions read or write the ledger
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.referral_commissions FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.referral_commissions_id_seq FROM anon, authenticated;

-- 2. FREEZE TODAY'S EARNINGS ---------------------------------------------------------------------------------
-- Exactly the formula the earnings page and payout check used until now.
INSERT INTO public.referral_commissions (code_id, partner_id, kind, amount)
SELECT id, influencer_user_id, 'legacy', earned
FROM (
  SELECT id, influencer_user_id,
    (COALESCE(usage_count_monthly, usage_count, 0)::numeric * COALESCE(commission_rate, 0)) +
    (COALESCE(usage_count_yearly, 0)::numeric * COALESCE(commission_rate_yearly, 0)) AS earned
  FROM public.referral_codes
  WHERE influencer_user_id IS NOT NULL
) t
WHERE earned <> 0;

-- 3. HELPER: partner balance source --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_commission_total(p_partner uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM public.referral_commissions WHERE partner_id = p_partner;
$$;

REVOKE ALL ON FUNCTION public.partner_commission_total(uuid) FROM public, anon, authenticated;

-- 4. process_payment_finished --------------------------------------------------------------------------------
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
  v_code        record;
  v_commission  numeric;
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

  -- Referral: kod sahibi ödeyen kişinin kendisi değilse ve alıcı bu kodla İLK kez ödüyorsa
  -- kullanım sayılır ve partner payı o anki oranla deftere yazılır.
  IF v_ref IS NOT NULL THEN
    SELECT id, influencer_user_id, commission_rate, commission_rate_yearly
      INTO v_code
    FROM public.referral_codes WHERE code = v_ref;

    IF FOUND THEN
      IF (v_code.influencer_user_id IS NULL OR v_code.influencer_user_id <> p_user_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.payments
           WHERE user_id = p_user_id AND referral_code = v_ref AND payment_status = 'finished'
             AND invoice_id <> p_invoice_id
         ) THEN
        PERFORM public.increment_referral_usage(v_ref, COALESCE(p_plan_type, 'monthly'));

        v_commission := CASE
          WHEN LOWER(TRIM(COALESCE(p_plan_type, ''))) IN ('yearly', 'year', '1_year', 'annual')
            THEN COALESCE(v_code.commission_rate_yearly, 0)
          ELSE COALESCE(v_code.commission_rate, 0)
        END;

        IF v_code.influencer_user_id IS NOT NULL AND v_commission > 0 THEN
          INSERT INTO public.referral_commissions (code_id, partner_id, buyer_id, invoice_id, plan_type, kind, amount)
          VALUES (v_code.id, v_code.influencer_user_id, p_user_id, p_invoice_id, p_plan_type, 'sale', v_commission);
        END IF;
      END IF;
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

-- 5. validate_referral_code ----------------------------------------------------------------------------------
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

  -- İndirim ve partner payı yalnızca ilk alımda: bu kodla daha önce ödemiş alıcı kodu tekrar kullanamaz
  IF v_caller_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments
    WHERE user_id = v_caller_id AND referral_code = v_record.code AND payment_status = 'finished'
  ) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'already_used');
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

-- 6. get_influencer_earnings (same columns; total_earnings now from the ledger) --------------------------------
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
    r.code,
    r.discount_percent,
    r.usage_count,
    r.commission_rate,
    COALESCE(r.commission_rate_yearly, 0) AS commission_rate_yearly,
    COALESCE(r.usage_count_monthly, r.usage_count, 0) AS usage_count_monthly,
    COALESCE(r.usage_count_yearly, 0) AS usage_count_yearly,
    COALESCE((
      SELECT SUM(c.amount) FROM public.referral_commissions c
      WHERE c.code_id = r.id AND c.partner_id = auth.uid()
    ), 0) AS total_earnings
  FROM public.referral_codes r
  WHERE r.influencer_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_earnings() TO authenticated;

-- 7. get_influencer_payout_summary ---------------------------------------------------------------------------
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

  -- 1. Toplam komisyon kazancı (satış anındaki oranlarla, iadeler düşülmüş)
  v_total_earnings := public.partner_commission_total(v_user_id);

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

-- 8. submit_payout_request -----------------------------------------------------------------------------------
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

  -- Bakiye: satış anındaki oranlarla yazılmış komisyonlar (iadeler düşülmüş)
  v_total_earnings := public.partner_commission_total(v_user_id);

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

-- 9. reverse_referral_commission (refund / chargeback, creem-webhook) ----------------------------------------
-- Candidates are our payment ids ('creem_tran_…' / 'creem_ord_…'); unknown ids are ignored, a second call for the
-- same payment does nothing. The code's use counter is decremented with the reversal.
CREATE OR REPLACE FUNCTION public.reverse_referral_commission(p_invoice_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     record;
  v_ins     integer;
  v_yearly  boolean;
  v_count   integer := 0;
  v_total   numeric := 0;
  v_codes   text[] := '{}';
BEGIN
  FOR v_row IN
    SELECT c.*, r.code AS code_text
    FROM public.referral_commissions c
    JOIN public.referral_codes r ON r.id = c.code_id
    WHERE c.kind = 'sale' AND c.invoice_id = ANY (p_invoice_ids)
    ORDER BY c.id
    FOR UPDATE OF c
  LOOP
    INSERT INTO public.referral_commissions (code_id, partner_id, buyer_id, invoice_id, plan_type, kind, amount)
    VALUES (v_row.code_id, v_row.partner_id, v_row.buyer_id, v_row.invoice_id, v_row.plan_type, 'reversal', -v_row.amount)
    ON CONFLICT (invoice_id, kind) WHERE invoice_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;

    IF v_ins > 0 THEN
      v_yearly := LOWER(TRIM(COALESCE(v_row.plan_type, ''))) IN ('yearly', 'year', '1_year', 'annual');
      UPDATE public.referral_codes
      SET usage_count = GREATEST(COALESCE(usage_count, 0) - 1, 0),
          usage_count_yearly = CASE WHEN v_yearly THEN GREATEST(COALESCE(usage_count_yearly, 0) - 1, 0) ELSE usage_count_yearly END,
          usage_count_monthly = CASE WHEN NOT v_yearly THEN GREATEST(COALESCE(usage_count_monthly, 0) - 1, 0) ELSE usage_count_monthly END,
          updated_at = now()
      WHERE id = v_row.code_id;

      v_count := v_count + 1;
      v_total := v_total + v_row.amount;
      v_codes := array_append(v_codes, v_row.code_text);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('reversed', v_count, 'amount', v_total, 'codes', to_jsonb(v_codes));
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_referral_commission(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_referral_commission(text[]) TO service_role;

COMMIT;
