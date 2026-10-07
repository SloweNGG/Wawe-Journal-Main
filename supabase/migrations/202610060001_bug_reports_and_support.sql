-- ============================================================
-- WAWE JOURNAL - HATA BİLDİRİMLERİ, DESTEK VE KULLANICI ENGELLEME
-- ============================================================

-- 1. Hata Bildirimleri Tablosu
CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_name TEXT,
    category TEXT NOT NULL DEFAULT 'ui', -- 'ui', 'chart', 'trade', 'perf', 'feature', 'other'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high'
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    system_info JSONB DEFAULT '{}'::jsonb,
    screenshot_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'in_progress', 'answered', 'closed'
    admin_reply TEXT,
    replied_at TIMESTAMPTZ,
    replied_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Etkinleştir
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi bildirimlerini görebilir (Adminler hepsini görebilir)
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

-- Kullanıcılar sadece 'pending' statüsünde ve yanıtsız bildirim oluşturabilir
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

-- Adminler tüm bildirimleri görebilir, yanıtlayabilir ve silebilir
DROP POLICY IF EXISTS "Admins can manage all bug reports" ON public.bug_reports;
CREATE POLICY "Admins can manage all bug reports"
ON public.bug_reports
FOR ALL
TO authenticated
USING (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
)
WITH CHECK (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
);


-- 2. Hata Bildirimi Engellenen Kullanıcılar Tablosu
CREATE TABLE IF NOT EXISTS public.support_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    user_name TEXT,
    reason TEXT NOT NULL,
    banned_by TEXT DEFAULT 'Admin',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.support_bans ENABLE ROW LEVEL SECURITY;

-- Kullanıcılar sadece kendi engelli durumlarını görebilir (Tüm liste sızdırılamaz)
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

-- Sadece adminler engel ekleyebilir veya kaldırabilir
DROP POLICY IF EXISTS "Admins can manage support bans" ON public.support_bans;
CREATE POLICY "Admins can manage support bans"
ON public.support_bans
FOR ALL
TO authenticated
USING (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
)
WITH CHECK (
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) = true
    OR (auth.jwt() ->> 'role') = 'admin'
);


-- 3. Varsayılan Destek Durumu (system_settings tablosuna)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
    'support_status',
    jsonb_build_object(
        'status', 'online',
        'label', 'Teknik Destek: Aktif & Çevrim İçi',
        'note', 'Ortalama yanıt süresi 15 dakika.',
        'updated_at', now()
    ),
    now()
) ON CONFLICT (key) DO NOTHING;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON public.bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_bans_user_id ON public.support_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_support_bans_email ON public.support_bans(user_email);
