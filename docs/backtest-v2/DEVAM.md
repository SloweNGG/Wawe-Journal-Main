# Backtest: esnek ve özelleştirilebilir sayfa (2026-10-24, yedi aşama tamam; 2026-10-25 hata/panel/emir turu sürüyor)

Bu dosya yarıda kalan işin devamı içindir. Her aşama bitince güncellenir.

## Aşamalar

| # | Aşama | Durum |
|---|---|---|
| 1 | Düzen altyapısı: Basit / Gelişmiş mod, ayırıcılar, tam ekran, kısayol sayfası | Yayında (`2848396`) |
| 2 | Görünüm ayarları çekmecesi (temalar, mum stili, renkler, göster/gizle, kendi temaları) | Yayında (`33757d8`) |
| 3 | Çizim araçları (Series Primitives), Premium çizimleri `backtest_drawings` tablosunda | Yayında (`5faae7e`, `228f989`, `95273ac`); migration 202610240001 canlıda (2026-10-24 10:34 UTC, yedek `~/WaweJournal-Backups/20261024T103412Z`) |
| 4 | İstatistikler sekmesi (ücretsiz temel, Premium ek grafikler; WwMetrics) | Yayında (`889e6a7`, `bt-stats.js`) |
| 5 | Çoklu grafik (Premium) | Yayında (`5aa97ce`; backtest.js grafik görünümleri: `R` ana görünüm, `R.extra` diğerleri) |
| 6 | Plan sınırları: cTrader verili hesaplarda ücretsiz 100 işlem/ay (trigger, system_settings) | Yayında (`b2c08a5`); migration 202610240002 canlıda (2026-10-24 11:07 UTC, yedek `~/WaweJournal-Backups/20261024T110742Z`) |
| 7 | Kripto spread gösterimi | Yayında (`2c604c3`; `WwBtSymbols.spreadUnit`, `positionValueUsd`) |

## Nerede ne var

- Sayfa: `src/pages/backtest.astro`, denetleyici `public/interface/backtest/js/backtest.js`.
- Yeni modüller: `bt-layout.js` (mod, panel boyutları, tam ekran, kısayollar), `bt-look.js` (görünüm, Heikin Ashi, seanslar, çekmece),
  `bt-draw.js` (çizim modeli, Series Primitive katmanı, araç çubuğu, kalıcılık).
- Çizimler: ücretsiz trend/yatay/dikdörtgen, `sessionStorage` (`ww_bt_draw:<hesap>`); Premium tüm araçlar, `public.backtest_drawings`
  (RLS kendi satırları, trigger Premium + hesap sahipliği + hesap başına 500). Doğrulama: `supabase/tests/backtest_drawings_verify.sql`
  (kendi işleminde ROLLBACK, canlıda 15/15). Rollback: `supabase/rollbacks/202610240001_backtest_drawings.down.sql` (satır varsa durur).
- Plan: `window.isPro()` ve `window.hasFeature('backtestThemes' | 'backtestDrawings' | 'backtestStats' | 'backtestMultiChart' | 'backtestUnlimitedTrades')`
  (`public/src/core/config.js` FEATURES). Ücretsiz kullanıcı Premium kontrole tıklayınca `openUpgradeModal`, kontrolde küçük "PRO" etiketi.
- Tercihler tarayıcıda: `ww_bt_layout_v1` (mod, boyutlar, grafik düzeni), `ww_bt_look_v1` (görünüm).
- Hacim: veri kaynakları işlem hacmi vermiyor; mumdaki `v` alanı 1 dakikalık mum aralıklarının toplamı (çekmecede açıklama var).

## İşlem sınırı (aşama 6)

- Sınır değeri: `system_settings.backtest_limits = {"ctrader_free_monthly_trades": 100}`. Değiştirmek için (yayın gerekmez):
  `UPDATE public.system_settings SET value = jsonb_set(value, '{ctrader_free_monthly_trades}', '150'), updated_at = now() WHERE key = 'backtest_limits';`
- Sayaç `public.backtest_trade_usage` (kullanıcı, ay UTC, işlem). İşlem silmek veya hesabı sıfırlamak sayacı düşürmez. Sentetik hesaplar sayılmaz.
- Trigger `trg_check_backtest_trade_quota` (yalnız INSERT; açık pozisyonlar kapatılabilir), RPC `get_backtest_trade_usage()`.
- Doğrulama `supabase/tests/backtest_trade_limit_verify.sql` (ROLLBACK, canlıda 12/12). Rollback `supabase/rollbacks/202610240002_backtest_trade_limit.down.sql`.

## Geri dönüş ve bölümler (2026-10-24)

- İşlemi olan hesapta geri gidilebilir; açık pozisyon varken gidilemez (`BACKTEST_OPEN_POSITIONS:replay_time`). Onay penceresi:
  Devam et / Hesabı sıfırla ve başla / İptal. Her geri dönüş yeni bölüm: `backtest_accounts.section_no`, `sections` (jsonb: no, start, at),
  `backtest_account_trades.section_no`; hepsini trigger yazar (istemci değiştiremez). Hesapta işlem kalmayınca tek bölüme döner.
- Bakiye, drawdown ve istatistikler açılış sırasına göre (`seq` = `created_at`); bakiye eğrisinin ekseni işlem numarası; Premium varlık
  eğrisi yalnız güncel bölüm. Defter kopyaları piyasa zamanıyla (bt-sync değişmedi).
- Migration 202610240003 canlıda (2026-10-24 12:04 UTC, yedek `~/WaweJournal-Backups/20261024T120442Z`), doğrulama
  `supabase/tests/backtest_replay_sections_verify.sql` (11/11), rollback `supabase/rollbacks/202610240003_backtest_replay_sections.down.sql`
  (birden çok bölümlü hesap varsa durur; eski fonksiyon gövdesini md5 ile birebir geri yükler).

## Yayın notu

- Her aşamada değişen backtest dosyalarının `?v=` numarası artırılır (sayfa `backtest.astro`). Yeni çeviri anahtarı eklenince
  `public/i18n.js` içindeki yerel dosya sürümü, `backtest.astro`'daki `i18n.js?v=` ve `public/sw.js` `CACHE_VERSION` da artırılır
  (SW yerel dosyaları önce önbellekten sunar).

## Test

- `node --test tests/*.test.js`
- Duman: `tests/smoke/README.md` (puppeteer-core repo dışında, `PP_DIR`).
- Pagecheck (diğer sayfalar değişmedi mi): eski araç `git show 1081b31^:docs/backtest-v2/asama-senkron-istatistik/pagecheck/run.mjs`
  (+ `data.mjs`, `emulator.js`); eski ve yeni `dist` karşılaştırılır.
- Canlı kontrol: `git show 1081b31^:docs/backtest-v2/asama-arayuz/webcheck/run.mjs` (sahte oturum, canlı siteye yazmaz).

## Canlı veritabanı

- Bağlantı: `set -a; source ~/.wawe-db.env; set +a`, psql/pg_dump `~/WaweJournal-pg17/tools/pg/bin`.
- Yedekler `~/WaweJournal-Backups/<UTC>/` (repo dışı). Migration'lar `supabase/migrations/`, rollback'ler `supabase/rollbacks/`.

## 2026-10-25 turu (hatalar, paneller, bekleyen emirler)

| Aşama | Durum |
|---|---|
| 1 Hatalar (BTCUSD ekseni, ortalama, kayan sayılar, Aktivite adı, stats-audit, 202610220001 rollback) | Tamam, yayın notu aşağıda |
| 2 Paneller ve istatistik widget'ları | Bekliyor |
| 3 Bekleyen emirler | Bekliyor |

Aşama 1 notları:
- BTCUSD: gerçek BTC 1m verisiyle (Binance, `tests/smoke/fetch-binance.mjs`, senaryolar `btc-repro*`) yeniden üretildi. Kök nedenler:
  fiyat ölçeği elle ölçeklenince (eksen sürükleme) otomatik ölçek kapanıyor ve tarih/bölüm değişince öyle kalıyordu (eksen eski
  fiyatlarda, mumlar ekran dışında = boş grafik); görünür aralık imlece taşınmıyordu. Eksi milyarlar 1e-5 birimli BTC 26 150–30 550
  fiyatlarının Int32 taşmasıyla birebir örtüşüyor; dönüşüm artık Int32'ye sığmayan, sıfır/eksi, sonsuz değeri atıyor
  (`WwBtCTrader.columnsToMinutes`, `WwBtCandles.toMinutes`), tarayıcı önbelleğindeki bozuk ay yeniden indiriliyor (`validMinutes`),
  seriye giden her mum `validBar` ile süzülüyor, fiyat çizgileri yalnız geçerli fiyatla, çizim/seans primitive'leri `autoscaleInfo: null`.
- Ortalama: `centerView`/`centerAll` (100 mum, imleç mumu sağda, otomatik ölçek), düğme ve R, "Şimdiki muma dön" (`#bt-now-btn`).
- 202610220001 rollback'i `supabase/rollbacks/` altına geri kondu (`b7860ac` ile birebir), yerel prova `supabase/tests/rehearse_202610220001.mjs` (PGlite, 17/17).
- Aynı çalışma kopyasında başka bir oturum navbar/quick-add üzerinde çalışıyor: commit'lere yalnız backtest yolları eklenir.
