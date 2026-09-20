-- ============================================================
-- WAWE JOURNAL - PERFORMANCE INDEXES MIGRATION
-- Migration: 202609200001_performance_indexes.sql
-- Description: Adds composite and covering indexes to speed up
--              frequent dashboard, trades, strategies, journals, and backtest queries.
-- ============================================================

BEGIN;

-- 1. TRADES TABLE INDEXES
-- Hızlandırılan sorgular:
-- - Dashboard & Trades: user_id + journal_id + trade_date DESC (tarihe göre sıralı filtre)
-- - Genel kullanıcı filtreleri: user_id + trade_date DESC
-- - Strateji performansı: strategy_id
CREATE INDEX IF NOT EXISTS idx_trades_user_journal_date 
  ON public.trades (user_id, journal_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_trades_user_date 
  ON public.trades (user_id, trade_date DESC);

CREATE INDEX IF NOT EXISTS idx_trades_strategy_id 
  ON public.trades (strategy_id) 
  WHERE strategy_id IS NOT NULL;

-- 2. STRATEGIES TABLE INDEXES
-- Hızlandırılan sorgular:
-- - Aktif kullanıcı stratejilerini listeleme: user_id + is_active
CREATE INDEX IF NOT EXISTS idx_strategies_user_active 
  ON public.strategies (user_id, is_active);

-- 3. JOURNALS TABLE INDEXES
-- Hızlandırılan sorgular:
-- - Kullanıcı defter listesi: user_id + is_active
DO $$
BEGIN
  IF to_regclass('public.journals') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journals_user_active 
      ON public.journals (user_id, is_active);
  END IF;
END;
$$;

-- 4. BACKTEST TRADES TABLE INDEXES
-- Hızlandırılan sorgular:
-- - Backtest işlemleri: user_id + entry_time DESC
DO $$
BEGIN
  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_backtest_trades_user_time 
      ON public.backtest_trades (user_id, entry_time DESC);
  END IF;
END;
$$;

COMMIT;
