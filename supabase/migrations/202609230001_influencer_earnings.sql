-- ============================================================
-- INFLUENCER EARNINGS AND REFERRAL CODES UPDATE
-- ============================================================

-- Add influencer tracking columns to referral_codes
ALTER TABLE public.referral_codes 
ADD COLUMN IF NOT EXISTS influencer_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC DEFAULT 0;

-- Ensure RLS allows influencers to view their own codes
DROP POLICY IF EXISTS "referral_codes_influencer_select" ON public.referral_codes;
CREATE POLICY "referral_codes_influencer_select" ON public.referral_codes
  FOR SELECT TO authenticated
  USING (influencer_user_id = auth.uid() OR public.is_admin() = true);

-- In the original migration, we had:
-- create policy "referral_codes_admin_all" on public.referral_codes for all to authenticated using (public.is_admin() = true) with check (public.is_admin() = true);
-- It's possible we need to make sure the admin policy hasn't locked out our select.
-- RLS policies are additive (OR). So having an admin ALL policy and a select policy for influencers is perfect.

-- Earnings view: A safe way to get earnings summary for the current influencer
CREATE OR REPLACE FUNCTION public.get_influencer_earnings()
RETURNS TABLE (
  code text,
  discount_percent integer,
  usage_count integer,
  commission_rate numeric,
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
    (usage_count::numeric * commission_rate) as total_earnings
  FROM public.referral_codes
  WHERE influencer_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_influencer_earnings() TO authenticated;
