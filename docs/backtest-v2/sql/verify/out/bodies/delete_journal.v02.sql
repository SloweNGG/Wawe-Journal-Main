CREATE OR REPLACE FUNCTION public.delete_journal(p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_default boolean;
    v_total_count int;
    v_other_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Lütfen oturum açın.';
    END IF;

    SELECT is_default INTO v_is_default
    FROM public.journals
    WHERE id = p_journal_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOURNAL_NOT_FOUND: Defter bulunamadı.';
    END IF;

    DELETE FROM public.trades WHERE journal_id = p_journal_id;
    DELETE FROM public.strategies WHERE journal_id = p_journal_id;

    -- Backtest v2 (migration 202610180002): detach the backtest accounts linked to this journal, in BOTH
    -- branches. The "last journal" branch below only resets the journal row, so the FK
    -- backtest_accounts.journal_id ON DELETE SET NULL would never fire there. The journal mirrors of their
    -- trades were already removed by the trades DELETE above.
    IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
        UPDATE public.backtest_accounts
           SET journal_id = NULL
         WHERE journal_id = p_journal_id
           AND user_id = v_user_id;
    END IF;

    SELECT count(*) INTO v_total_count
    FROM public.journals
    WHERE user_id = v_user_id AND is_active = true;

    -- Tek defter varsa sıfırla (409 hatası vermez)
    IF v_total_count <= 1 THEN
        UPDATE public.journals
        SET name = 'Ana Defter',
            description = NULL,
            color = '#7c6dfa',
            icon = 'book-open',
            is_default = true,
            platform = NULL,
            is_connected = false,
            connection_status = 'disconnected',
            last_synced_at = NULL,
            is_prop_firm = false,
            prop_firm_rules = NULL,
            prop_firm_status = 'none',
            prop_firm_stats = NULL,
            updated_at = now()
        WHERE id = p_journal_id;

        RETURN jsonb_build_object('success', true, 'message', 'Defter sıfırlandı.', 'reset', true);
    END IF;

    IF v_is_default THEN
        SELECT id INTO v_other_id
        FROM public.journals
        WHERE user_id = v_user_id AND id != p_journal_id AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;

        IF v_other_id IS NOT NULL THEN
            UPDATE public.journals SET is_default = true, updated_at = now() WHERE id = v_other_id;
        END IF;
    END IF;

    DELETE FROM public.journals WHERE id = p_journal_id AND user_id = v_user_id;
    RETURN jsonb_build_object('success', true, 'deleted_id', p_journal_id);
END;
$function$;
