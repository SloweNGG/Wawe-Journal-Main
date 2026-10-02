-- Migration: 202610020001_add_user_onboarding.sql
-- Description: Yeni kullanıcılar için onboarding ve interaktif tur takibi sütunları ve RPC

BEGIN;

-- 1. user_profiles tablosuna onboarding sütunları ekle
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_tour_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_currency text DEFAULT 'USD';

-- 2. Var olan aktif kullanıcıları (zaten işlem veya strateji kaydetmiş olanları) tamamlandı olarak işaretle
UPDATE public.user_profiles up
SET 
  onboarding_completed = true,
  onboarding_tour_completed = true
WHERE (
  EXISTS (SELECT 1 FROM public.trades t WHERE t.user_id = up.id)
  OR EXISTS (SELECT 1 FROM public.strategies s WHERE s.user_id = up.id)
  OR EXISTS (SELECT 1 FROM public.journals j WHERE j.user_id = up.id AND j.name NOT IN ('Ana Hesap', 'Varsayılan'))
);

-- 3. Güvenli Onboarding Tamamlama RPC fonksiyonu
CREATE OR REPLACE FUNCTION public.complete_user_onboarding(
  p_currency text DEFAULT 'USD',
  p_theme text DEFAULT 'dark',
  p_tour_completed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  UPDATE public.user_profiles
  SET 
    onboarding_completed = true,
    onboarding_tour_completed = COALESCE(p_tour_completed, onboarding_tour_completed),
    preferred_currency = COALESCE(p_currency, preferred_currency, 'USD'),
    last_active = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'onboarding_completed', true,
    'onboarding_tour_completed', p_tour_completed
  );
END;
$$;

-- 4. Yetkilendirme
REVOKE ALL ON FUNCTION public.complete_user_onboarding FROM public;
GRANT EXECUTE ON FUNCTION public.complete_user_onboarding TO authenticated;

COMMIT;
