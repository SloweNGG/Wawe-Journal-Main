-- ============================================================
-- CSV İÇE AKTARMA: TARİHİ "BUGÜN" / "ŞİMDİ" YAZILMIŞ İŞLEMLER — YALNIZCA OKUR
-- supabase/tests/csv_import_today_dates_check.sql
-- ============================================================
-- Hata (72d8a3c / 92e9896 ile düzeltildi): tarihi bulunamayan ya da okunamayan CSV satırı içe aktarılırken
--   A) 2026-10-15'ten beri (Hızlı Ekle): trade_date = içe aktarma GÜNÜ (yalın 'YYYY-MM-DD'). Aynı değer import_hash'in
--      6. alanında da durur (sembol|yön|giriş|çıkış|lot|TARİH|bilet). Tarihi okunan satırlarda bu alan saatli ISO'dur
--      (yalnız tarih içeren dosyalarda bile '…T00:00:00.000Z'), yani yalın tarih yalnızca bu hatadan gelir.
--      Tek istisna: add-trade sayfasının kendi CSV'si yalnız tarihli dosyada da yalın tarih yazar; onu "aynı gün" ve
--      parti büyüklüğü ayırır.
--   B) 2026-09-27 – 2026-10-15 (Hızlı Ekle) ve add-trade sayfasının CSV'si: trade_date = içe aktarma ANI
--      (created_at ile saniyeler içinde).
-- En yaygın tetikleyici: "Date,Symbol,Side,Volume,…" başlıklı dosyalar (MT5 sanılıp Date sütunu okunmuyordu).
--
-- İki sorgu var; SQL Editor yalnızca son sorgunun sonucunu gösterdiği için birini seçip (işaretleyip) çalıştırın.
-- İkisi de yalnızca SELECT'tir: hiçbir şey yazmaz, silmez, kilitlemez.
-- "Parti" = aynı kullanıcı + defter + aynı dakika içinde eklenen işlemler (bir içe aktarma).
-- Sonuç (2026-11-03, canlı, kullanıcı çalıştırdı): 1. sorgu boş — etkilenen kullanıcı / işlem yok.
-- ============================================================


-- ------------------------------------------------------------
-- 1) ÖZET: şüpheli işlem içeren her içe aktarma partisi
-- ------------------------------------------------------------
with imported as (
  select t.id, t.user_id, t.journal_id, t.symbol, t.trade_date, t.created_at, t.import_hash,
         split_part(t.import_hash, '|', 6) as hash_date
  from public.trades t
  where t.created_at >= timestamptz '2026-09-27 00:00+00'
    and t.platform_source is distinct from 'backtest'
    and (t.import_hash like '%|%|%|%|%|%' or t.notes like 'CSV Import%')   -- CSV satırları (cTrader 'ctrader:…', demo 'demo-…' hariç)
),
flagged as (
  select i.*,
         case
           when i.hash_date ~ '^\d{4}-\d{2}-\d{2}$'
                and abs(i.hash_date::date - (i.created_at at time zone 'UTC')::date) <= 1        -- içe aktarma günü (saat dilimi payı ±1 gün)
                and (i.trade_date at time zone 'UTC')::time = time '00:00'
             then 'A'
           when abs(extract(epoch from (i.trade_date - i.created_at))) <= 120                   -- içe aktarma anı (±2 dk)
             then 'B'
         end as signal
  from imported i
),
batches as (
  select user_id, journal_id, date_trunc('minute', created_at) as batch_minute_utc,
         count(*)                                   as batch_rows,
         count(*) filter (where signal is not null) as suspicious_rows,
         count(*) filter (where signal = 'A')       as signal_a,
         count(*) filter (where signal = 'B')       as signal_b,
         min(trade_date) filter (where signal is null)  as other_rows_first_date,
         max(trade_date) filter (where signal is null)  as other_rows_last_date,
         string_agg(distinct symbol, ', ') filter (where signal is not null) as suspicious_symbols
  from flagged
  group by 1, 2, 3
)
select p.email,
       b.user_id, b.journal_id, b.batch_minute_utc,
       b.batch_rows, b.suspicious_rows,
       round(100.0 * b.suspicious_rows / b.batch_rows) as suspicious_pct,
       b.signal_a, b.signal_b, b.suspicious_symbols,
       b.other_rows_first_date, b.other_rows_last_date
from batches b
left join public.user_profiles p on p.id = b.user_id
where b.suspicious_rows > 0
order by b.suspicious_rows desc, b.batch_minute_utc desc;
-- Yorum: suspicious_rows ≥ 2 olan partiler neredeyse kesin bu hatadır (bir dosyada birden çok işlemin hepsi içe
-- aktarma gününde / anında). Tek satırlık bir parti, kullanıcının gerçekten o gün işlem yapıp hemen içe aktarması
-- olabilir; other_rows_* (aynı partideki diğer işlemlerin tarih aralığı) bunu ayırmaya yardım eder.


-- ------------------------------------------------------------
-- 2) AYRINTI: bir partinin satırları (1. sorgudan user_id ve batch_minute_utc'yi yapıştırın)
-- ------------------------------------------------------------
select t.id, t.symbol, t.direction, t.lot, t.entry_price, t.exit_price, t.pnl,
       t.trade_date, t.created_at, t.import_hash, t.notes
from public.trades t
where t.user_id = '00000000-0000-0000-0000-000000000000'                                       -- ← user_id
  and date_trunc('minute', t.created_at) = timestamptz '2026-11-01 12:34:00+00'               -- ← batch_minute_utc
order by t.created_at, t.id;
