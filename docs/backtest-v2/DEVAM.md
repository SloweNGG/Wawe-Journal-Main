# Backtest: esnek ve özelleştirilebilir sayfa (2026-10-24)

Bu dosya yarıda kalan işin devamı içindir. Her aşama bitince güncellenir.

## Aşamalar

| # | Aşama | Durum |
|---|---|---|
| 1 | Düzen altyapısı: Basit / Gelişmiş mod, ayırıcılar, tam ekran, kısayol sayfası | Yayında (`2848396`) |
| 2 | Görünüm ayarları çekmecesi (temalar, mum stili, renkler, göster/gizle, kendi temaları) | Yayında (`33757d8`) |
| 3 | Çizim araçları (Series Primitives), Premium çizimleri `backtest_drawings` tablosunda | Yayında (`5faae7e`, `228f989`, `95273ac`); migration 202610240001 canlıda (2026-10-24 10:34 UTC, yedek `~/WaweJournal-Backups/20261024T103412Z`) |
| 4 | İstatistikler sekmesi (ücretsiz temel, Premium ek grafikler; WwMetrics) | Bu commit (`bt-stats.js`) |
| 5 | Çoklu grafik (Premium) | |
| 6 | Plan sınırları: cTrader verili hesaplarda ücretsiz 100 işlem/ay (trigger, system_settings) | |
| 7 | Kripto spread gösterimi | |

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
