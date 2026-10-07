-- Migration: 202610070002_add_commission_swap_gross_pnl.sql
-- Description: Adds gross_pnl, commission and swap columns to public.trades for accurate net profit calculations and broker reconciliation.

BEGIN;

DO $$
BEGIN
    -- 1. gross_pnl (Brüt Kar/Zarar)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'trades' 
          AND column_name = 'gross_pnl'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN gross_pnl NUMERIC NULL;
        COMMENT ON COLUMN public.trades.gross_pnl IS 'Brüt K/Z (komisyon ve swap düşülmeden önceki tutar)';
    END IF;

    -- 2. commission (Broker Komisyonu)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'trades' 
          AND column_name = 'commission'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN commission NUMERIC DEFAULT 0;
        COMMENT ON COLUMN public.trades.commission IS 'İşlem için ödenen komisyon tutarı (pozitif tutar olarak saklanır, hesaptan düşülür)';
    END IF;

    -- 3. swap (Gecelik Taşıma Maliyeti / Swap)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'trades' 
          AND column_name = 'swap'
    ) THEN
        ALTER TABLE public.trades ADD COLUMN swap NUMERIC DEFAULT 0;
        COMMENT ON COLUMN public.trades.swap IS 'Swap / faiz tutarı (+ veya -)';
    END IF;
END $$;

COMMIT;
