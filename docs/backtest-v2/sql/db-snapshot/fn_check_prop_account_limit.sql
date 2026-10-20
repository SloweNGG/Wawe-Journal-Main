CREATE OR REPLACE FUNCTION public.check_prop_account_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan TEXT;
  v_expires TIMESTAMPTZ;
  v_is_premium BOOLEAN;
  v_max_prop INT;
  v_current_count INT;
BEGIN
  -- A) SAHİPLİK VE DEFTER KONTROLÜ
  -- INSERT anında: Defter kullanıcıya ait ve is_active = true olmalı
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journals 
      WHERE id = NEW.journal_id 
        AND user_id = NEW.user_id 
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
  -- UPDATE anında journal_id değiştiyse: Defter kullanıcıya ait olmalı
  ELSIF TG_OP = 'UPDATE' AND (NEW.journal_id IS DISTINCT FROM OLD.journal_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.journals 
      WHERE id = NEW.journal_id 
        AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
  END IF;

  -- B) TIMEZONE GEÇERLİLİK DOĞRULAMASI
  IF NEW.reset_tz IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = NEW.reset_tz
  ) THEN
    RAISE EXCEPTION 'INVALID_TZ';
  END IF;

  -- C) RULES JSONB BOYUT DOĞRULAMASI (<20000 byte)
  IF pg_column_size(NEW.rules) >= 20000 THEN
    RAISE EXCEPTION 'RULES_TOO_LARGE';
  END IF;

  -- D) KOTA KONTROLÜ (Yalnızca INSERT veya inaktif -> aktif geçişinde çalışır)
  -- ÖNEMLİ: Mevcut açık prop hesapları üzerinde yapılan güncellemeler (is_active zaten true iken)
  -- veya SELECT/okuma işlemleri bu kontrole girmez. Böylece aboneliği free'ye düşen veya süresi dolan
  -- eski premium kullanıcıların mevcut prop hesapları çalışmaya/hesaplanmaya devam eder;
  -- ancak kotanın üzerinde YENİ bir prop hesabı açmaları ya da pasif bir hesabı tekrar aktifleştirmeleri engellenir.
  IF (TG_OP = 'INSERT' AND NEW.is_active = true) OR 
     (TG_OP = 'UPDATE' AND NEW.is_active = true AND (OLD.is_active IS DISTINCT FROM true)) THEN
    
    -- Kullanıcı profilini çek (NEW.user_id kullanılır)
    SELECT plan, plan_expires_at 
    INTO v_plan, v_expires
    FROM public.user_profiles
    WHERE id = NEW.user_id;

    -- Aktif premium kontrolü: plan = 'premium' VE (süresi null veya gelecekte)
    v_is_premium := (v_plan = 'premium' AND (v_expires IS NULL OR v_expires > now()));
    v_max_prop := CASE WHEN v_is_premium THEN 10 ELSE 1 END;

    -- Aktif prop hesabı sayısı (bağlı defteri de is_active = true olanlar)
    SELECT COUNT(*)
    INTO v_current_count
    FROM public.prop_accounts pa
    JOIN public.journals j ON j.id = pa.journal_id
    WHERE pa.user_id = NEW.user_id
      AND pa.is_active = true
      AND j.is_active = true
      AND (TG_OP = 'INSERT' OR pa.id <> NEW.id);

    IF v_current_count >= v_max_prop THEN
      RAISE EXCEPTION 'PROP_LIMIT_EXCEEDED:%', v_max_prop;
    END IF;
  END IF;

  -- updated_at zaman damgası güncellemesi
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := timezone('utc'::text, now());
  END IF;

  RETURN NEW;
END;
$function$
