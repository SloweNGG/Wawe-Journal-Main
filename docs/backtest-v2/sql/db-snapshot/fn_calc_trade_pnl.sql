CREATE OR REPLACE FUNCTION public.calc_trade_pnl()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_mult     NUMERIC;
  v_dir_mult NUMERIC;
BEGIN
  -- ⭐⭐⭐ ÖNCELİK 1: Eğer pnl zaten set edilmişse (CSV import / broker net $) → KORU
  IF NEW.pnl IS NOT NULL THEN
    -- Yine de R/R hesapla
    IF NEW.stop_loss IS NOT NULL AND NEW.take_profit IS NOT NULL AND NEW.entry_price IS NOT NULL THEN
      DECLARE
        v_risk   NUMERIC;
        v_reward NUMERIC;
      BEGIN
        v_risk   := ABS(NEW.entry_price - NEW.stop_loss);
        v_reward := ABS(NEW.take_profit - NEW.entry_price);
        IF v_risk > 0 THEN
          NEW.rr_ratio := ROUND(v_reward / v_risk, 2);
        END IF;
      END;
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- ÖNCELİK 2: QUICK MODE kontrolü
  IF NEW.is_quick_entry = true THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- ÖNCELİK 3: entry veya exit NULL ise P&L'yi DEĞİŞTİRME
  IF NEW.entry_price IS NULL OR NEW.exit_price IS NULL THEN
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- ÖNCELİK 4: Normal P&L hesaplama (sadece pnl NULL ise buraya gelir)
  v_mult := CASE
    WHEN NEW.instrument = 'forex'  THEN 100000
    WHEN NEW.instrument = 'gold'   THEN 100
    WHEN NEW.instrument = 'index'  THEN 10
    WHEN NEW.instrument = 'crypto' THEN 1
    WHEN NEW.instrument = 'other'  THEN COALESCE(NEW.multiplier, 1)
    ELSE 100000
  END;

  v_dir_mult := CASE WHEN NEW.direction IN ('LONG','BUY') THEN 1 ELSE -1 END;

  NEW.pnl := v_dir_mult * (NEW.exit_price - NEW.entry_price) * NEW.lot * v_mult;
  NEW.pnl := ROUND(NEW.pnl::numeric, 2);

  -- R/R hesaplama
  IF NEW.stop_loss IS NOT NULL AND NEW.take_profit IS NOT NULL THEN
    DECLARE
      v_risk   NUMERIC;
      v_reward NUMERIC;
    BEGIN
      v_risk   := ABS(NEW.entry_price - NEW.stop_loss);
      v_reward := ABS(NEW.take_profit - NEW.entry_price);
      IF v_risk > 0 THEN
        NEW.rr_ratio := ROUND(v_reward / v_risk, 2);
      END IF;
    END;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$
