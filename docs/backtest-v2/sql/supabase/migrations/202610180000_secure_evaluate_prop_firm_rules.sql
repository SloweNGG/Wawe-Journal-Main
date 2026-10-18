-- ============================================================
-- WAWE JOURNAL - SECURITY FIX: evaluate_prop_firm_rules(uuid) OWNERSHIP CHECK + NO ANON ACCESS
-- Migration: 202610180000_secure_evaluate_prop_firm_rules.sql
-- Description:
--   public.evaluate_prop_firm_rules(uuid) is SECURITY DEFINER, executable by anon and PUBLIC, and does
--   not check who calls it: anyone with the public anon key could call /rest/v1/rpc/evaluate_prop_firm_rules
--   with ANY journal id and make it UPDATE journals.prop_firm_status / prop_firm_stats (IDOR).
--   This migration closes it without dropping anything (Migration 06 may drop it later):
--     1. EXECUTE is revoked from PUBLIC and anon; authenticated and service_role keep it
--        (sync_journal_trades calls it as the journal owner).
--     2. The body gets an ownership check: a caller with a user id (auth.uid()) must own the journal,
--        otherwise 42501. A caller without a user id is accepted only if its JWT role is neither
--        'anon' nor 'authenticated' (service_role, or a direct SQL session such as the SQL Editor).
--   Everything else in the body is the 2026-10-18 live body, unchanged (exact string edits, see build.mjs).
--   Independent of Migration 06 and of the Backtest v2 migrations: it can run first, alone.
--   Migration 06 accepts both this body and the live body in its drift guard.
-- Stage: 0 (security)
-- Run order: 0 (before 01)
-- Rollback: supabase/rollbacks/202610180000_secure_evaluate_prop_firm_rules.down.sql
--   (re-opens the hole: only for a verified regression)
-- Prerequisites: none. Recommended: a fresh backup first (R48), although this file changes no data.
-- How to run: Supabase SQL Editor, the WHOLE file at once (one transaction). Idempotent.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- 0. PRECONDITIONS ------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regprocedure('public.evaluate_prop_firm_rules(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.evaluate_prop_firm_rules(uuid) does not exist (already dropped by 06?). Nothing to secure.';
  END IF;

  -- DRIFT: the function must be the 2026-10-18 live body or this migration's body (re-run).
  SELECT md5(translate(p.prosrc, E' \t\r\n', '')) INTO v_md5
    FROM pg_proc p WHERE p.oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure;
  IF v_md5 NOT IN ('ac50682480af983cae0ad64c8f787929', '9cfecfdb506b0ecfb82319cdc7d4dec1') THEN
    RAISE EXCEPTION 'DRIFT: public.evaluate_prop_firm_rules(uuid) changed since the 2026-10-18 snapshot (normalised md5 %). Review it before replacing it.', v_md5;
  END IF;
END $$;

-- 1. Body with the ownership check ---------------------------------------------
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
    -- against journals.user_id; a caller without one is accepted only if its JWT role is not
    -- anon/authenticated (service_role, or a direct SQL session such as the SQL Editor).
    v_caller := auth.uid();
    IF v_caller IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.journals WHERE id = p_journal_id AND user_id = v_caller) THEN
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

-- 2. EXECUTE privileges: no PUBLIC, no anon ----------------------------------------
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_prop_firm_rules(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_prop_firm_rules(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-CHECKS (read-only)
-- ------------------------------------------------------------
-- 1) Expect: anon_can_exec = false, public_can_exec = false, authenticated_can_exec = true, same_body = true:
--    SELECT has_function_privilege('anon', 'public.evaluate_prop_firm_rules(uuid)', 'EXECUTE')          AS anon_can_exec,
--           has_function_privilege('authenticated', 'public.evaluate_prop_firm_rules(uuid)', 'EXECUTE') AS authenticated_can_exec,
--           (SELECT bool_or(a.grantee = 0) FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--             WHERE p.oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure AND a.privilege_type = 'EXECUTE') AS public_can_exec,
--           (SELECT md5(translate(prosrc, E' \t\r\n', '')) = '9cfecfdb506b0ecfb82319cdc7d4dec1'
--              FROM pg_proc WHERE oid = 'public.evaluate_prop_firm_rules(uuid)'::regprocedure) AS same_body;
-- 2) From a client with only the anon key, POST /rest/v1/rpc/evaluate_prop_firm_rules {"p_journal_id": "<any uuid>"}
--    must answer 401/403 ("permission denied for function").
-- 3) App smoke test: connecting/syncing a cTrader journal still works (sync_journal_trades -> evaluate).
-- ============================================================
