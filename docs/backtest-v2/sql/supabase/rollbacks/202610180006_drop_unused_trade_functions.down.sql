-- ============================================================
-- WAWE JOURNAL - ROLLBACK OF 202610180006 (six unused trade functions)
-- Migration: 202610180006_drop_unused_trade_functions.down.sql
-- Rollback of: supabase/migrations/202610180006_drop_unused_trade_functions.sql
-- Description: recreates the six functions from their LIVE bodies of 2026-10-18 (CRLF normalised to LF,
--   otherwise identical, except evaluate_prop_firm_rules, see below: same signatures, return types, languages, SECURITY DEFINER/INVOKER and
--   search_path settings - get_today_trades_count / get_total_trades_count had NO search_path live and
--   get this way again), then restores their EXECUTE privileges.
-- SECURITY NOTE: evaluate_prop_firm_rules(uuid) comes back with the SECURE body and ACL of
--   202610180000 (ownership check, no PUBLIC/anon), NOT the vulnerable live one, even if 202610180000
--   was never run. 202610180000.down.sql is what re-opens the hole.
-- ACLs: a recreated function gets PostgreSQL's default (EXECUTE for PUBLIC) plus Supabase's default
--   privileges (anon, authenticated, service_role), which is what the 2026-10-18 findings describe
--   (all six executable by anon). Section 2 re-states that explicitly. For an EXACT restore, replace
--   section 2 with the restore_sql output of pre-flight query P1, captured before 06 was run.
-- Stage: 6 (rollback)
-- Run order: rollback, step 1 of 5 (reverse order: this file, then 05, 04, 03, 02, 01)
-- Data loss: none.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 1. Recreate from the live bodies ---------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.get_journals_equity_data()
 RETURNS TABLE(journal_id uuid, journal_name text, journal_color text, journal_icon text, trade_date date, pnl numeric, cumulative_pnl numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT 
      j.id AS jid,
      j.name AS jname,
      j.color AS jcolor,
      j.icon AS jicon,
      t.trade_date AS tdate,
      t.pnl AS tpnl,
      SUM(t.pnl) OVER (
        PARTITION BY j.id 
        ORDER BY t.trade_date, t.created_at 
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cum_pnl
    FROM public.journals j
    INNER JOIN public.trades t ON t.journal_id = j.id
    WHERE j.user_id = v_uid 
      AND j.is_active = true 
      AND t.pnl IS NOT NULL
  )
  SELECT 
    r.jid::uuid,
    r.jname::text,
    COALESCE(r.jcolor, '#7c6dfa')::text,
    COALESCE(r.jicon, 'folder')::text,
    r.tdate::date,
    r.tpnl::numeric,
    r.cum_pnl::numeric
  FROM ranked r
  ORDER BY r.jid, r.tdate;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_strategy_performance(p_user_id uuid)
 RETURNS TABLE(strategy_id uuid, strategy_name text, strategy_color text, total_trades bigint, wins bigint, losses bigint, total_pnl numeric, win_rate numeric, long_count bigint, short_count bigint, pnl_series numeric[])
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.name,
    s.color,
    COUNT(t.id)::BIGINT,
    COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
      CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
      (t.exit_price - t.entry_price) * t.lot * 
      COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) > 0 
      THEN 1 END)::BIGINT,
    COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
      CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
      (t.exit_price - t.entry_price) * t.lot * 
      COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) < 0 
      THEN 1 END)::BIGINT,
    COALESCE(SUM(
      CASE WHEN t.exit_price IS NOT NULL THEN
        CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
        (t.exit_price - t.entry_price) * t.lot *
        COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END)
      ELSE 0 END
    ), 0)::NUMERIC,
    COALESCE(ROUND(100.0 * 
      COUNT(CASE WHEN t.exit_price IS NOT NULL AND 
        CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 ELSE -1 END *
        (t.exit_price - t.entry_price) * t.lot * 
        COALESCE(t.multiplier, CASE t.instrument WHEN 'forex' THEN 100000 WHEN 'gold' THEN 100 WHEN 'index' THEN 10 ELSE 1 END) > 0 
        THEN 1 END)::NUMERIC / 
      NULLIF(COUNT(CASE WHEN t.exit_price IS NOT NULL THEN 1 END), 0), 1), 0)::NUMERIC,
    COUNT(CASE WHEN t.direction IN ('LONG', 'BUY') THEN 1 END)::BIGINT,
    COUNT(CASE WHEN t.direction IN ('SHORT', 'SELL') THEN 1 END)::BIGINT,
    ARRAY[]::NUMERIC[]  -- Sparkline için boş array (daha sonra doldurabiliriz)
  FROM strategies s
  LEFT JOIN trades t ON t.strategy_id = s.id AND t.user_id = p_user_id
  WHERE s.user_id = p_user_id AND s.is_active = true
  GROUP BY s.id, s.name, s.color;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_today_trades_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM public.trades WHERE DATE(created_at) = CURRENT_DATE;
$function$;

CREATE OR REPLACE FUNCTION public.get_total_trades_count()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT COUNT(*) FROM public.trades;
$function$;

-- 2. EXECUTE privileges (replace with the P1 restore_sql output for an exact restore) ------------------
-- evaluate_prop_firm_rules: the SECURE body (202610180000) and no PUBLIC/anon, so that rolling back 06 never
-- re-opens the IDOR. 202610180000.down.sql (last in the rollback order) restores the live body and ACL.
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_prop_firm_rules(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_journal_trades(uuid, jsonb) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_journals_equity_data()       TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_strategy_performance(uuid)   TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_today_trades_count()         TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_total_trades_count()         TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Bodies identical to the 2026-10-18 snapshot (expect 6 rows, all true):
--    SELECT v.fn, md5(translate(p.prosrc, E' \t\r\n', '')) = v.expected_md5 AS same_body
--      FROM (VALUES ('public.evaluate_prop_firm_rules(uuid)',   '29f8b77b773e510216390b6ddebe604f'),
--                   ('public.sync_journal_trades(uuid, jsonb)', 'ac82821c8455df5cc3743c70f572dada'),
--                   ('public.get_journals_equity_data()',       'ba07a8d2cbb221313a1002929aa48222'),
--                   ('public.get_strategy_performance(uuid)',   '6f198892f0c0b0e0eb95fd0a488fa586'),
--                   ('public.get_today_trades_count()',         'f4d8256d30ef69f5cd51de5b4a82b668'),
--                   ('public.get_total_trades_count()',         '41a1973e8f580f31a01a190f9337d0d9')) AS v(fn, expected_md5)
--      LEFT JOIN pg_proc p ON p.oid = to_regprocedure(v.fn);
-- 2) ACLs equal the P1 capture:
--    SELECT oid::regprocedure, prosecdef, proconfig, proacl FROM pg_proc
--     WHERE proname IN ('evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
--                       'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count');
-- ============================================================
