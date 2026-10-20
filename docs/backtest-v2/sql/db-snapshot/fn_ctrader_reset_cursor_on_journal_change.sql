CREATE OR REPLACE FUNCTION public.ctrader_reset_cursor_on_journal_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.journal_id IS DISTINCT FROM OLD.journal_id THEN
    NEW.last_deal_timestamp := NULL;
  END IF;
  RETURN NEW;
END;
$function$
