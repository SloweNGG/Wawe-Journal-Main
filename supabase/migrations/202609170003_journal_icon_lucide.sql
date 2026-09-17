BEGIN;

ALTER TABLE journals ALTER COLUMN icon SET DEFAULT 'folder';

UPDATE journals SET icon = 'folder'      WHERE icon = '📁' OR icon IS NULL OR icon = '';
UPDATE journals SET icon = 'chart-bar'   WHERE icon = '📊';
UPDATE journals SET icon = 'trending-up' WHERE icon = '💹';
UPDATE journals SET icon = 'target'      WHERE icon = '🎯';
UPDATE journals SET icon = 'rocket'      WHERE icon = '🚀';
UPDATE journals SET icon = 'gem'         WHERE icon = '💎';
UPDATE journals SET icon = 'flame'       WHERE icon = '🔥';
UPDATE journals SET icon = 'zap'         WHERE icon = '⚡';
UPDATE journals SET icon = 'waves'       WHERE icon = '🌊';
UPDATE journals SET icon = 'crown'       WHERE icon = '🦁';
UPDATE journals SET icon = 'star'        WHERE icon = '🐺';
UPDATE journals SET icon = 'palette'     WHERE icon = '🎨';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, username, plan, role, is_active, max_journals)
  VALUES (new.id, new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)),
    'free', 'user', true, 2)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
  VALUES (new.id, 'Ana Hesap', 'Varsayılan hesap', '#7c6dfa', 'folder', true, true);

  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION create_journal(
  p_name text, p_description text, p_color text, p_icon text
)
RETURNS public.journals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_max int;
  v_count int;
  v_is_first boolean;
  v_result public.journals;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR trim(p_name) = '' OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;
  SELECT COALESCE(max_journals, 2) INTO v_max FROM public.user_profiles WHERE id = v_uid;
  IF v_max IS NULL THEN v_max := 2; END IF;
  SELECT count(*) INTO v_count FROM public.journals WHERE user_id = v_uid AND is_active = true;
  IF v_count >= v_max THEN RAISE EXCEPTION 'JOURNAL_QUOTA_EXCEEDED:%', v_max; END IF;
  v_is_first := (v_count = 0);
  INSERT INTO public.journals (user_id, name, description, color, icon, is_default, is_active)
  VALUES (v_uid, trim(p_name), p_description, COALESCE(p_color, '#7c6dfa'), COALESCE(p_icon, 'folder'), v_is_first, true)
  RETURNING * INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION create_journal FROM public;
GRANT EXECUTE ON FUNCTION create_journal TO authenticated;

COMMIT;

