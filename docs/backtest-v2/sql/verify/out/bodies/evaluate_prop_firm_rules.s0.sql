CREATE OR REPLACE FUNCTION public.evaluate_prop_firm_rules(p_journal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rules jsonb;
    v_is_prop boolean;
    v_tz text;
    v_initial_bal numeric;
    v_target_pct numeric;
    v_daily_loss_pct numeric;
    v_overall_loss_pct numeric;
    v_min_days int;
    v_drawdown_type text;
    
    v_current_pnl numeric := 0;
    v_total_trades int := 0;
    v_winning_trades int := 0;
    v_trading_days int := 0;
    
    v_target_amount numeric := 0;
    v_max_daily_loss_amount numeric := 0;
    v_max_overall_loss_amount numeric := 0;
    
    v_worst_daily_pnl numeric := 0;
    v_today_pnl numeric := 0;
    v_lowest_equity numeric := 0;
    v_peak_equity numeric := 0;
    v_max_seen_drawdown numeric := 0;
    
    v_status text := 'active';
    v_breach_reason text := NULL;
    v_stats jsonb;
    
    v_daily_rec RECORD;
    v_trade_rec RECORD;
    v_running_pnl numeric := 0;
    v_running_equity numeric := 0;
    v_caller uuid;
BEGIN
    -- Security (202610180000): the caller must own the journal. A caller with a user id is checked
    -- against journals.user_id (an admin, public.is_admin(), may evaluate any journal); a caller without one
    -- is accepted only if its JWT role is not anon/authenticated (service_role, or a direct SQL session such
    -- as the SQL Editor).
    v_caller := auth.uid();
    IF v_caller IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.journals WHERE id = p_journal_id AND user_id = v_caller)
           AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'FORBIDDEN: journal not found or not owned by the caller' USING ERRCODE = '42501';
        END IF;
    ELSIF coalesce(auth.jwt() ->> 'role', '') IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'FORBIDDEN: authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT is_prop_firm, prop_firm_rules, COALESCE(trading_day_offset, 'Europe/Prague')
    INTO v_is_prop, v_rules, v_tz
    FROM public.journals
    WHERE id = p_journal_id;

    IF NOT FOUND OR v_is_prop IS NOT TRUE OR v_rules IS NULL THEN
        RETURN jsonb_build_object('status', 'none');
    END IF;

    -- Kural parametrelerini oku
    v_initial_bal := COALESCE((v_rules->>'initial_balance')::numeric, 100000);
    v_target_pct := COALESCE((v_rules->>'profit_target_pct')::numeric, 10);
    v_daily_loss_pct := COALESCE((v_rules->>'max_daily_loss_pct')::numeric, 5);
    v_overall_loss_pct := COALESCE((v_rules->>'max_overall_loss_pct')::numeric, 10);
    v_min_days := COALESCE((v_rules->>'min_trading_days')::int, 4);
    v_drawdown_type := COALESCE(v_rules->>'drawdown_type', 'static');

    v_target_amount := v_initial_bal * (v_target_pct / 100.0);
    v_max_daily_loss_amount := v_initial_bal * (v_daily_loss_pct / 100.0);
    v_max_overall_loss_amount := v_initial_bal * (v_overall_loss_pct / 100.0);

    v_peak_equity := v_initial_bal;
    v_lowest_equity := v_initial_bal;

    -- Gün bazında PnL analizi (Prop firm zaman dilimine göre)
    FOR v_daily_rec IN
        SELECT 
            (trade_date AT TIME ZONE v_tz)::date AS t_day,
            SUM(COALESCE(pnl, 0)) AS day_pnl,
            COUNT(*) AS day_trades
        FROM public.trades
        WHERE journal_id = p_journal_id AND (exit_price IS NOT NULL OR status = 'closed')
        GROUP BY (trade_date AT TIME ZONE v_tz)::date
        ORDER BY t_day ASC
    LOOP
        v_trading_days := v_trading_days + 1;
        
        -- Günlük maksimum zarar kontrolü (Negatif PnL limit kontrolü)
        IF v_daily_rec.day_pnl < -v_max_daily_loss_amount THEN
            v_status := 'breached';
            v_breach_reason := format('Maksimum günlük zarar limiti aşıldı (%s günü PnL: %s, Limit: -%s)', 
                v_daily_rec.t_day, v_daily_rec.day_pnl, v_max_daily_loss_amount);
        END IF;

        IF v_daily_rec.day_pnl < v_worst_daily_pnl THEN
            v_worst_daily_pnl := v_daily_rec.day_pnl;
        END IF;

        -- Bugünün PnL'i (Prop firm saatine göre bugün)
        IF v_daily_rec.t_day = (now() AT TIME ZONE v_tz)::date THEN
            v_today_pnl := v_daily_rec.day_pnl;
        END IF;
    END LOOP;

    -- Kayan / Statik Genel Drawdown hesaplaması
    v_running_equity := v_initial_bal;
    FOR v_trade_rec IN
        SELECT COALESCE(pnl, 0) as trade_pnl
        FROM public.trades
        WHERE journal_id = p_journal_id AND (exit_price IS NOT NULL OR status = 'closed')
        ORDER BY trade_date ASC, created_at ASC
    LOOP
        v_running_pnl := v_running_pnl + v_trade_rec.trade_pnl;
        v_running_equity := v_initial_bal + v_running_pnl;
        
        IF v_running_equity > v_peak_equity THEN
            v_peak_equity := v_running_equity;
        END IF;

        IF v_running_equity < v_lowest_equity THEN
            v_lowest_equity := v_running_equity;
        END IF;

        IF v_drawdown_type = 'trailing' THEN
            IF (v_peak_equity - v_running_equity) > v_max_overall_loss_amount THEN
                v_status := 'breached';
                v_breach_reason := COALESCE(v_breach_reason, format('Kayan (Trailing) maksimum zarar limiti aşıldı (%s)', v_peak_equity - v_running_equity));
            END IF;
            IF (v_peak_equity - v_running_equity) > v_max_seen_drawdown THEN
                v_max_seen_drawdown := v_peak_equity - v_running_equity;
            END IF;
        ELSE
            -- Static Drawdown (Başlangıç bakiyesine göre)
            IF (v_initial_bal - v_running_equity) > v_max_overall_loss_amount THEN
                v_status := 'breached';
                v_breach_reason := COALESCE(v_breach_reason, format('Statik maksimum zarar limiti aşıldı (%s)', v_initial_bal - v_running_equity));
            END IF;
            IF (v_initial_bal - v_running_equity) > v_max_seen_drawdown THEN
                v_max_seen_drawdown := v_initial_bal - v_running_equity;
            END IF;
        END IF;
    END LOOP;

    v_current_pnl := v_running_pnl;

    -- Başarı kontrolü (Hedefe ulaşıldı mı ve min gün tamamlandı mı?)
    IF v_status != 'breached' THEN
        IF v_current_pnl >= v_target_amount AND v_trading_days >= v_min_days THEN
            v_status := 'passed';
        ELSE
            v_status := 'active';
        END IF;
    END IF;

    -- İstatistik paketini hazırla
    v_stats := jsonb_build_object(
        'current_balance', v_initial_bal + v_current_pnl,
        'initial_balance', v_initial_bal,
        'current_pnl', v_current_pnl,
        'target_amount', v_target_amount,
        'remaining_target', GREATEST(0, v_target_amount - v_current_pnl),
        'target_progress_pct', LEAST(100, ROUND((GREATEST(0, v_current_pnl) / NULLIF(v_target_amount, 0)) * 100, 1)),
        'today_pnl', v_today_pnl,
        'max_daily_loss_amount', v_max_daily_loss_amount,
        'remaining_daily_risk', GREATEST(0, v_max_daily_loss_amount + v_today_pnl),
        'max_overall_loss_amount', v_max_overall_loss_amount,
        'max_seen_drawdown', v_max_seen_drawdown,
        'trading_days', v_trading_days,
        'min_trading_days', v_min_days,
        'status', v_status,
        'breach_reason', v_breach_reason,
        'evaluated_at', now()
    );

    -- Deftere sonucu yaz
    UPDATE public.journals
    SET prop_firm_status = v_status,
        prop_firm_stats = v_stats
    WHERE id = p_journal_id;

    RETURN v_stats;
END;
$function$;
