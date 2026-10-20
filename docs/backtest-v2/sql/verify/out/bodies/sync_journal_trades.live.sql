CREATE OR REPLACE FUNCTION public.sync_journal_trades(p_journal_id uuid, p_trades jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_last_sync timestamptz;
    v_is_connected boolean;
    v_conn_status text;
    v_is_prop boolean;
    v_trade jsonb;
    v_inserted int := 0;
    v_updated int := 0;
    v_skipped int := 0;
    
    v_pos_id text;
    v_deal_id bigint;
    v_status text;
    v_pnl numeric;
    v_eval_stats jsonb := NULL;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Lütfen önce oturum açın.';
    END IF;

    -- 1. DEĞERİ VE SATIRI KİLİTLE (Pessimistic Lock / FOR UPDATE)
    SELECT last_synced_at, is_connected, connection_status, is_prop_firm
    INTO v_last_sync, v_is_connected, v_conn_status, v_is_prop
    FROM public.journals
    WHERE id = p_journal_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'JOURNAL_NOT_FOUND: Defter bulunamadı veya erişim yetkiniz yok.';
    END IF;

    IF v_conn_status = 'archived' THEN
        RAISE EXCEPTION 'ACCOUNT_ARCHIVED: Bu hesap ücretsiz plan limiti nedeniyle arşivlenmiştir. Senkronizasyon için Premium plana geçin veya bu hesabı aktif yapın.';
    END IF;

    -- 2. RATE LIMIT (60 saniye aralık koruması)
    IF v_last_sync IS NOT NULL AND (now() - v_last_sync) < INTERVAL '60 seconds' THEN
        PERFORM set_config('response.status', '429', true);
        RAISE EXCEPTION '{"code": "RATE_LIMIT_EXCEEDED", "message": "Lütfen tekrar senkronize etmeden önce 60 saniye bekleyin."}';
    END IF;

    -- 3. TRADES UPSERT (State-Aware: Open -> Closed geçişleri destekler)
    IF p_trades IS NOT NULL AND jsonb_array_length(p_trades) > 0 THEN
        FOR v_trade IN SELECT * FROM jsonb_array_elements(p_trades)
        LOOP
            v_pos_id := v_trade->>'position_id';
            v_deal_id := COALESCE((v_trade->>'last_deal_id')::bigint, 0);
            v_status := COALESCE(v_trade->>'status', 'closed');
            v_pnl := COALESCE((v_trade->>'pnl')::numeric, 0);

            -- Sadece position_id olan kayıtlar üzerinden upsert yapılır
            IF v_pos_id IS NOT NULL AND trim(v_pos_id) != '' THEN
                INSERT INTO public.trades (
                    user_id,
                    journal_id,
                    position_id,
                    last_deal_id,
                    symbol,
                    direction,
                    instrument,
                    lot,
                    entry_price,
                    exit_price,
                    trade_date,
                    exit_date,
                    pnl,
                    commission,
                    swap,
                    status,
                    notes,
                    updated_at
                ) VALUES (
                    v_user_id,
                    p_journal_id,
                    v_pos_id,
                    v_deal_id,
                    COALESCE(v_trade->>'symbol', 'UNKNOWN'),
                    COALESCE(v_trade->>'direction', 'buy'),
                    COALESCE(v_trade->>'instrument', 'forex'),
                    COALESCE((v_trade->>'lot')::numeric, 0.01),
                    (v_trade->>'entry_price')::numeric,
                    (v_trade->>'exit_price')::numeric,
                    COALESCE((v_trade->>'trade_date')::timestamptz, now()),
                    (v_trade->>'exit_date')::timestamptz,
                    v_pnl,
                    COALESCE((v_trade->>'commission')::numeric, 0),
                    COALESCE((v_trade->>'swap')::numeric, 0),
                    v_status,
                    v_trade->>'notes',
                    now()
                )
                ON CONFLICT (journal_id, position_id) 
                DO UPDATE SET
                    symbol = EXCLUDED.symbol,
                    direction = EXCLUDED.direction,
                    instrument = EXCLUDED.instrument,
                    lot = EXCLUDED.lot,
                    entry_price = EXCLUDED.entry_price,
                    exit_price = EXCLUDED.exit_price,
                    trade_date = EXCLUDED.trade_date,
                    exit_date = EXCLUDED.exit_date,
                    pnl = EXCLUDED.pnl,
                    commission = EXCLUDED.commission,
                    swap = EXCLUDED.swap,
                    status = EXCLUDED.status,
                    notes = EXCLUDED.notes,
                    last_deal_id = EXCLUDED.last_deal_id,
                    updated_at = now();

                IF FOUND THEN
                    v_inserted := v_inserted + 1;
                ELSE
                    v_skipped := v_skipped + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 4. DEFTER BİLGİLERİNİ GÜNCELLE
    UPDATE public.journals
    SET last_synced_at = now(),
        updated_at = now()
    WHERE id = p_journal_id;

    -- 5. PROP FIRM HESAPLAMASINI ÇALIŞTIR
    IF v_is_prop IS TRUE THEN
        v_eval_stats := evaluate_prop_firm_rules(p_journal_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'processed_count', v_inserted,
        'skipped_count', v_skipped,
        'synced_at', now(),
        'prop_firm_stats', v_eval_stats
    );
END;
$function$;
