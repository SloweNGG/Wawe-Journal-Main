CREATE OR REPLACE FUNCTION public.set_default_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.journal_id IS NULL THEN
    SELECT id INTO NEW.journal_id FROM public.journals
    WHERE user_id = NEW.user_id AND is_default = true LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$
