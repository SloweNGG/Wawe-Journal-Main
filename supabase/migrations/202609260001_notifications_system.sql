-- Migration for Notifications System
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'success', 'error', 'warning', 'info', 'finance'
    title_key TEXT NOT NULL,
    message_key TEXT NOT NULL,
    meta_data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (to mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all notifications"
ON public.notifications
FOR ALL
USING (auth.jwt() ->> 'role' = 'admin' OR (auth.jwt()->'app_metadata'->>'role') = 'admin');

-- RPC to get unread count
CREATE OR REPLACE FUNCTION public.get_unread_notifications_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.notifications
    WHERE user_id = p_user_id AND is_read = false;
    
    RETURN v_count;
END;
$$;

-- RPC to mark all as read
CREATE OR REPLACE FUNCTION public.mark_notifications_as_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = p_user_id AND is_read = false;
END;
$$;

-- RPC to mark specific notification as read
CREATE OR REPLACE FUNCTION public.mark_notification_as_read(p_user_id UUID, p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = p_user_id AND id = p_notification_id;
END;
$$;

-- RPC to create a notification (can be called by admins or internal triggers)
CREATE OR REPLACE FUNCTION public.admin_send_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title_key TEXT,
    p_message_key TEXT,
    p_meta_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow admins
    IF NOT (auth.jwt() ->> 'role' = 'admin' OR (auth.jwt()->'app_metadata'->>'role') = 'admin') THEN
        RAISE EXCEPTION 'Only administrators can send notifications';
    END IF;

    INSERT INTO public.notifications (user_id, type, title_key, message_key, meta_data)
    VALUES (p_user_id, p_type, p_title_key, p_message_key, p_meta_data);
END;
$$;

-- Helper to safely send system notification (bypassing RLS for internal triggers if needed)
CREATE OR REPLACE FUNCTION public.create_system_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title_key TEXT,
    p_message_key TEXT,
    p_meta_data JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.notifications (user_id, type, title_key, message_key, meta_data)
    VALUES (p_user_id, p_type, p_title_key, p_message_key, p_meta_data);
END;
$$;
