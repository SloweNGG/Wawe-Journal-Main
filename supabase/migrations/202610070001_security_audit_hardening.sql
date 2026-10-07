-- ============================================================
-- WAWE JOURNAL - SECURITY AUDIT & RLS HARDENING
-- Migration: 202610070001_security_audit_hardening.sql
-- ============================================================

BEGIN;

-- 1. BUG REPORTS RLS HARDENING
-- Sadece kendi bildirimlerini görebilme (Anonim kullanıcıların birbirinin bildirimlerini görmesini engelle)
DROP POLICY IF EXISTS "Users can view their own bug reports" ON public.bug_reports;
CREATE POLICY "Users can view their own bug reports"
ON public.bug_reports
FOR SELECT
TO authenticated, anon
USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.jwt()->>'email' IS NOT NULL AND auth.jwt()->>'email' = user_email)
    OR coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
);

-- Sadece 'pending' ve cevapsız bildirim oluşturabilme (Sahte admin yanıtı enjeksiyonunu engelle)
DROP POLICY IF EXISTS "Users can insert their own bug reports" ON public.bug_reports;
CREATE POLICY "Users can insert their own bug reports"
ON public.bug_reports
FOR INSERT
TO authenticated, anon
WITH CHECK (
    (status = 'pending')
    AND (admin_reply IS NULL)
    AND (replied_at IS NULL)
    AND (user_id IS NULL OR user_id = auth.uid())
);

-- 2. SUPPORT BANS RLS HARDENING
-- Engelli kullanıcılar listesinin anonim/dışarıdan sızdırılmasını engelle (OR true kaldırıldı)
DROP POLICY IF EXISTS "Users can check their ban status" ON public.support_bans;
CREATE POLICY "Users can check their ban status"
ON public.support_bans
FOR SELECT
TO authenticated, anon
USING (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.jwt()->>'email' IS NOT NULL AND auth.jwt()->>'email' = user_email)
    OR coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
);

COMMIT;
