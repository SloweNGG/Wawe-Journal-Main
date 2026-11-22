# Wawe Journal — Proje Özeti

Wawe Journal, trader'lar için bir işlem günlüğü (trading journal) uygulamasıdır: işlemleri kaydeder, defterlere (hesaplara) ayırır, istatistik ve grafiklerle analiz eder, prop firm kurallarını takip eder, cTrader ve MetaTrader 4/5'ten işlem senkronize eder, mum mum backtest yaptırır ve bir AI koç ile işlemleri yorumlar.

Bu belge projeye yeni katılan geliştiriciler için hazırlanmıştır. Gizli bilgi (API anahtarı, şifre, `.env` değeri) içermez; yalnızca bu ayarların **nerede** durduğunu söyler.

> Son güncelleme: Kasım 2026. Bilgiler kod ve `supabase/migrations` taranarak çıkarıldı. Veritabanında migration'da `CREATE TABLE` karşılığı olmayan tablolar **(koddan çıkarım)** diye işaretlendi.

---

## 1. Teknolojiler ve sürümler

### Çatı ve derleme
| Bileşen | Sürüm | Not |
|---|---|---|
| Astro | ^7.4.12 (lockfile 7.4.12) | Statik çıktı, adaptör yok. 4.16'dan 7.4'e geçiş: commit `c7dcc30` |
| @astrojs/react | ^7.1.9 | React entegrasyonu (şu an hiçbir sayfa React bileşeni kullanmıyor) |
| React / React DOM | ^18.3.1 | |
| esbuild | ^0.21.5 (`devDependencies`) | `astro.config.mjs` bundle ve küçültme için doğrudan kullanır |
| Node.js | >=22.23.4 | `package.json` → `engines` |

`package.json` script'leri: `dev`, `build`, `preview`, `test` (`node --test tests/*.test.js`).

### Tarayıcıda CDN'den yüklenen kütüphaneler
| Kütüphane | Sürüm | Nerede |
|---|---|---|
| @supabase/supabase-js | 2.117.3 | Neredeyse tüm uygulama ve giriş sayfaları |
| ApexCharts | 8.2.0 | dashboard, analytics, strategies, admin |
| Lightweight Charts | 4.1.3 (standalone) | dashboard, analytics, backtest |
| SortableJS | 1.15.0 | analytics (kart sürükle-bırak) |
| Lucide (ikonlar) | 0.441.0 | `BaseHead.astro` (navbar'da `lucide@latest` yedeği var) |
| jsPDF / jspdf-autotable | 2.5.1 / 3.8.2 | İhtiyaç anında yüklenir (`public/src/utils/helpers.js` → `loadJsPDF`) |
| SheetJS (xlsx) | 0.18.5 | Quick Add içe aktarma, ihtiyaç anında |
| Cloudflare Turnstile | v0 | login, register (bot koruması) |
| Creem embed | — | Yalnızca kart ödemesi başlarken yüklenir (`public/src/services/payment.js` → `loadCreemEmbed`) |

Gecikmeli yüklenen script'ler (quick-add, grafik kütüphaneleri, SortableJS) `public/interface/shared/lazy-load.js` (`window.WwLazy`) üzerinden ilk ihtiyaçta bir kez yüklenir.

### Backend ve barındırma
- **Supabase**: Postgres + Auth + Storage + Realtime + Edge Functions (Deno).
- **Cloudflare Pages**: `wrangler.toml` (proje `wawe-journal`, çıktı `dist`). Önbellek ve güvenlik başlıkları `public/_headers`, yönlendirmeler `public/_redirects` içinde. Üretim sitesi `master` dalından yayınlanır (bkz. bölüm 8).
- **Ödeme**: Creem (kart, abonelik) ve NOWPayments (kripto, tek seferlik). İkisi de Edge Function üzerinden: `creem-checkout`, `creem-webhook`, `creem-subscription`, `creem-discount-sync`; `create-payment`, `nowpayment-webhook` (bkz. 5.6). Fiyatlar: `public/config.js` (aylık 12, yıllık 99 USD), `system_settings` ile admin panelinden değiştirilebilir.
- **AI**: AI koç Google Gemini kullanır; bütün Gemini modelleri meşgulse OpenRouter'ın ücretsiz modellerine düşer (bkz. 5.8).
- **PWA**: `public/sw.js` (service worker, `/admin` önbelleğe alınmaz; admin Web Push bildirimlerini de gösterir), `public/site.webmanifest`.

### `astro.config.mjs` özeti
- `site: https://wawejournal.com`, `outDir: dist`, `devToolbar.enabled: false`.
- `build.format: 'file'` → sayfalar `dashboard.html` gibi üretilir (eski `.html` linkleri çalışsın diye). Cloudflare `/dashboard` adresini de aynı sayfaya yönlendirir.
- **`BUILD_ID`**: her derlemeye özel tek kimlik (`WW_BUILD_ID` ortam değişkeniyle sabitlenebilir). SPA router'ın `<meta name="ww-build">` etiketi (`__WW_BUILD_ID__`), dist'teki tüm yerel JS/CSS `?v=` değerleri ve `sw.js` önbellek adı bu kimliği kullanır.
- Özel entegrasyonlar (sırası önemli):
  - `bundleAppScript`: `public/src/script.js` → `public/src/bundle.js` (esbuild, ESM, minify). Hem `dev` hem `build` başında çalışır.
  - `minifyDistAssets`: build sonunda `dist` içindeki tüm `.js`/`.css` dosyalarını küçültür.
  - `assetVersionIntegration` (`scripts/asset-version.mjs`): her yerel JS/CSS referansına `?v=<BUILD_ID>`, görsellere `?v=<içerik hash'i>` yazar. Damgasız kalan referans derlemeyi durdurur.
  - `localizeIntegration` (`scripts/localize.mjs`): ana sayfa, about ve contact için `/tr/` ve `/de/` statik kopyaları üretir (metinler `public/index-i18n.js`'ten).
  - `sitemapIntegration` (`scripts/sitemap.mjs`): `sitemap.xml`'i dist'teki sayfalardan üretir.
- `vite.build.cssTarget`: CSS küçültücü önekleri silmesin diye tarayıcı hedefi sabit.

### Ortam değişkenleri (yalnızca adlar)
`.env.example` içinde: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_APP_NAME`, haber API'si ayarları vb. Üretim değerleri Cloudflare Pages ortamında tanımlıdır. İstemci ayarları `public/config.js` ve `public/src/core/config.js` üzerinden okunur.

Edge Function sırları Supabase'in Deno ortamındadır (`supabase secrets set`). Adlar `README.md` ve fonksiyon başlıklarında yazılıdır: cTrader (`CTRADER_*`), NOWPayments (`NOWPAYMENTS_*`), Creem (`CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_PRODUCT_MONTHLY`, `CREEM_PRODUCT_YEARLY`), Turnstile, Telegram (`TELEGRAM_*`), Web Push (`VAPID_*`, `scripts/admin-push-setup.mjs` üretir), AI (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`).

---

## 2. Klasör yapısı

`node_modules`, `.git` ve `dist` hariç.

```
/
├─ astro.config.mjs        Astro ayarları + özel entegrasyonlar
├─ wrangler.toml           Cloudflare Pages
├─ tsconfig.json           astro/strict, react-jsx
├─ package.json
├─ .env.example            Ortam değişkeni adları
├─ README.md               İngilizce kısa tanıtım, kurulum, Edge Function deploy notları
├─ PROJECT_OVERVIEW.md     Bu belge
├─ LICENSE                 AGPL-3.0-only
│
├─ docs/                   Tarihli devir notları (2026-11-09-CTRADER-MT5.md, 2026-11-15/16-DEVAM-NOTLARI.md,
│                          2026-11-21-MT4.md), BACKTEST-DURUM.md, backtest-v2/ (DEVAM.md, kurallar)
├─ integrations/
│  ├─ mt5/WaweSync.mq5     MetaTrader 5 senkron EA'sının kaynağı
│  └─ mt4/WaweSync.mq4     MetaTrader 4 karşılığı (aynı protokol)
├─ scripts/
│  ├─ asset-version.mjs, localize.mjs, sitemap.mjs   Derleme entegrasyonları (bkz. bölüm 1)
│  ├─ admin-push-setup.mjs VAPID anahtarlarını üretip Supabase secrets'a yazar
│  ├─ seed-demo.mjs        Yerel sahte Supabase için demo hesap verisi (canlıya bağlanmaz)
│  ├─ demo/                Yerel demo backend + Playwright ile tanıtım ekran görüntüsü/video çekimi (README.md)
│  ├─ perf/                Lighthouse, CLS, realtime ve canlı trafik/sürüm doğrulama araçları
│  ├─ indexnow.mjs         Değişen sayfaları IndexNow'a bildirir
│  ├─ gen-backgrounds.mjs, resize-images.mjs   Arka plan SVG'leri ve srcset görselleri
│  └─ ctrader-probe.ts     cTrader API denemesi
│
├─ src/                    Astro kaynakları (sayfa iskeletleri)
│  ├─ layouts/
│  │  ├─ Layout.astro       Uygulama kabuğu (navbar, SPA, quick-add, AI koç, ekonomik takvim, arka plan)
│  │  └─ PageLayout.astro   Tanıtım sayfaları kabuğu
│  ├─ components/
│  │  ├─ BaseHead.astro     <head>: fontlar, tema motoru (satır içi), ortak script'ler, wwLog, wwPage, SW kaydı
│  │  ├─ Navbar.astro, NavAuth.astro   Navbar (davranış public/components/navbar'da)
│  │  ├─ SpaRouter.astro    Sayfa yenilemeden geçiş (window.wwSpa)
│  │  ├─ UpgradeModal.astro Pro'ya yükseltme penceresi
│  │  ├─ LegalDisclosures.astro, LegalFullText.astro   Hukuk metinleri
│  │  ├─ blog/, tools/      Blog logosu şeridi; araç sayfalarının prop kural alanları
│  │  ├─ QuickAddModal.astro
│  │  └─ QuickAddFAB.tsx, quick-add/*.tsx   React sürümü (kullanılmıyor)
│  ├─ scripts/theme-engine.js   Tema motoru (window.WWTheme), BaseHead'e satır içi gömülür
│  ├─ data/                blog.ts, glossary.ts, responsive-images.ts
│  ├─ content/blog/        Blog yazıları (.md); çeviriler tr/, de/ altında aynı dosya adıyla
│  └─ pages/               Sayfalar (bkz. bölüm 4)
│
├─ public/                 Tarayıcıya olduğu gibi giden dosyalar (asıl uygulama kodu burada)
│  ├─ config.js            İstemci ayarları (Supabase, cTrader, özellik bayrakları, fiyatlar)
│  ├─ i18n.js              Çeviri motoru (window.i18n)
│  ├─ index-i18n.js, auth-i18n.js   Ana sayfa ve giriş sayfalarının kendi çevirileri
│  ├─ auth-spa.js          login ↔ register arasında yenilemesiz geçiş
│  ├─ landing-coach.js     Ana sayfadaki AI koç bölümü animasyonu
│  ├─ cache.js             window.wwCache (SWR önbellek)
│  ├─ sw.js                Service worker (+ admin Web Push)
│  ├─ styles.css           Ortak tasarım değişkenleri ve bileşenler
│  ├─ buttons.css, pages.css, page-chrome.css, tools.css, landing-preview.css, landing-glass.css
│  ├─ robots.txt, llms.txt, _headers, _redirects, site.webmanifest
│  ├─ downloads/           WaweSync.ex5, WaweSync.ex4 (derlenmiş EA'lar, /downloads/... ile indirilir)
│  ├─ fonts/               Kendi sunucumuzdan Geist, Geist Mono, Syne (fonts.css) + pdf/ (DM Sans TTF)
│  ├─ src/                 Ortak uygulama modülleri → bundle.js (esbuild)
│  │  ├─ script.js          Giriş noktası; modülleri window'a açar
│  │  ├─ bundle.js          Derleme çıktısı (elle düzenlenmez)
│  │  ├─ pricing.js
│  │  ├─ core/              config, supabase (auth), journal, storage, prop-templates, utils
│  │  ├─ services/          user (plan), payment, stats, prop-service
│  │  ├─ features/          theme (motora köprü), overtrade, notifications, csv-parsers
│  │  └─ utils/             helpers, ui (toast), validation, confirm-dialog, prop-calculator, prop-montecarlo
│  ├─ interface/           Sayfa bazlı JS/CSS
│  │  ├─ dashboard/         dashboard.js, prop-card-v2.js, onboarding.js (kurulum sihirbazı ve tur) + css
│  │  ├─ analytics/ ES modülleri: analytics, dashboard-manager, chart-renderers,
│  │  │                     chart-expand, export-dialog, pdf-report, insights-engine, widget-*, prop-widgets, helpers
│  │  ├─ journals/          mt5-connect.js (MetaTrader 4/5 bağlama penceresi) + css
│  │  ├─ trades/, calendar/, strategies/ (js + css)
│  │  ├─ backtest/          Backtest v2: backtest.js (sayfa) + bt-*.js + css (bkz. 5.7)
│  │  ├─ admin/             admin-core, admin-data, admin-dashboard, admin-push
│  │  ├─ quick-add/         Hızlı işlem ekleme + broker CSV algılama/eşleştirme (parser-v2, broker-detector, fill-pairing)
│  │  └─ shared/            Tüm sayfaların ortak modülleri (bkz. bölüm 7)
│  ├─ components/
│  │  ├─ navbar/            navbar.js/css, page-transition.js
│  │  ├─ notification-bell/
│  │  ├─ ai-coach/          ai-coach.js/css (sohbet paneli), voice-orb.js (dikte animasyonu)
│  │  ├─ econ-calendar/     Navbar'daki ekonomik takvim rozeti ve paneli, econ-info.js (olay açıklamaları)
│  │  ├─ note-tools/        İşlem notlarında duygu etiketleri ve dikte
│  │  ├─ ambient/           Arka plan motoru (Ayarlar > Görünüm > Arka plan)
│  │  └─ color-picker/      Temaya uyan renk seçici
│  ├─ settings/            settings.js, theme-studio.js + panels/*.html (8 ayar paneli)
│  ├─ i18n/locales/        tr.js, en.js, de.js
│  ├─ images/, vendor/
│
├─ supabase/
│  ├─ migrations/          64 SQL migration (2026-08 → 2026-11) + README.md
│  ├─ rollbacks/           202610220001'den itibaren her migration'ın .down.sql dosyası
│  ├─ functions/           Edge Functions + _shared/ (bkz. bölüm 5.6)
│  ├─ tests/               *_verify.sql (tek transaction, ROLLBACK ile biter), rehearse_*.mjs (PGlite provaları)
│  └─ ADMIN_ROLE.md        Admin rolünün nasıl verileceği
│
└─ tests/                  node:test birim testleri (trade-metrics, prop-*, bt-*, ai-coach, coach-*, mt5-*,
   │                       ctrader-*, econ-calendar, admin-push, theme-engine, sw, cache-headers ...)
   ├─ helpers/             fake-supabase, fake-db, bt-env
   └─ smoke/               Backtest tarayıcı duman testleri (headless Chrome, README.md)
```

**Önemli:** Uygulama mantığının büyük kısmı Astro bileşenlerinde değil, `public/` altındaki düz tarayıcı JS dosyalarındadır. Astro sayfaları iskelet HTML'i ve script/CSS bağlantılarını sağlar.

---

## 3. Mimari kısaca

- **Statik site + istemci tarafı veri.** Sunucu kodu yok; tüm veri tarayıcıdan Supabase'e (RLS korumalı) veya Edge Function'lara gider.
- **Sayfa script'leri.** Her uygulama sayfası kendi script'ini `data-page-script` ile yükler. Ortak kod `bundle.js` ve `public/interface/shared/*` içindedir.
- **SPA geçişleri.** `SpaRouter.astro` uygulama sayfaları arasında yalnızca `#app-scroll-container` içeriğini değiştirir. Sayfa script'leri her ziyarette yeniden çalışır. Her sayfa `window.wwPage.current()` ile bir yaşam döngüsü kapsamı alır: `PAGE.on(...)` dinleyicileri ve `PAGE.onLeave(...)` temizlikleri sayfadan çıkınca otomatik kaldırılır. Derleme kimliği değişirse tam yenileme yapılır. Router, çektiği HTML'i bellekte 5 dakika tutar.
- **Sayfadan bağımsız parçalar.** AI koç paneli, ekonomik takvim rozeti ve arka plan katmanları `<body>` üzerinde, SPA kabının dışında yaşar; sayfa değişince kapanmaz (`Layout.astro`, `isAppPage`).
- **Önbellek.** `window.wwCache` işlem ve strateji listelerini 2 dakika (bellek + sessionStorage) tutar; anahtar kullanıcı + defter + sayfa önekinden oluşur. Statik dosyalar `?v=<BUILD_ID>` sayesinde `_headers`'ta 1 yıl `immutable` önbelleklenir; HTML'e kural yazılmaz.
- **Realtime.** Kanallar `public/interface/shared/realtime-guard.js` (`window.WwRealtime`) ile geçerli oturumla açılır; reddedilen token sonsuz yeniden denemeye girmez.
- **Çok dillilik.** `tr`, `en`, `de`. `public/i18n.js` yalnızca etkin dili ve İngilizce yedeği yükler. Dil `localStorage.ww_language` içinde tutulur. HTML'de `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-html` öznitelikleri kullanılır. Tanıtım sayfalarının çoğu yalnızca İngilizcedir; ana sayfa, about ve contact için derlemede `/tr/`, `/de/` kopyaları üretilir.

---

## 4. Sayfalar ve route'lar

Sayfalar `/ad.html` olarak üretilir; Cloudflare `/ad` adresini de sunar. Uygulama sayfaları `noindex`'tir.

### Tanıtım sayfaları (herkese açık)
| Route | Dosya | Açıklama |
|---|---|---|
| `/` | `index.astro` | Ana sayfa (landing), kendi çevirileri; `/tr/` ve `/de/` kopyaları derlemede üretilir |
| `/about`, `/contact`, `/privacy`, `/terms`, `/disclaimer` | `PageLayout` ile | Bilgi ve hukuk sayfaları (`/disclaimer`: risk açıklaması; AI sağlayıcı ayrıntısı yalnızca `/privacy#ai-coach`'ta) |
| `/pricing` | `pricing.astro` | Fiyatlar; landing, `config.js` ve `terms.astro` iade maddeleriyle aynı tutulmalı |
| `/support` | `support.astro` | Yardım merkezi: konu menüsü, açık cevaplar, tarayıcıda arama |
| `/ai-trading-coach`, `/backtesting`, `/ctrader-trading-journal`, `/prop-firm-tracker` | ayrı dosyalar | Özellik sayfaları (İngilizce, sunucuda hazır); iddialar uygulamadaki davranışla aynı kalmalı |
| `/integrations`, `/integrations/<ad>` | `integrations/` | İçe aktarma rehberleri: metatrader, tradingview, binance, bybit, interactive-brokers, xtb, oanda, csv-excel |
| `/tools`, `/tools/<ad>` | `tools/` | Ücretsiz hesaplayıcılar: position-size, risk-of-ruin, prop-firm-drawdown, prop-firm-pass-probability |
| `/blog`, `/blog/<slug>` | `blog/` | Yazılar `src/content/blog/*.md`, liste ve tarih `src/data/blog.ts` |
| `/tr/blog`, `/de/blog` (+ `/<slug>`) | `[lang]/blog/` | Çeviriler `src/content/blog/{tr,de}/<EN dosya adı>.md`, kendi slug'larıyla; hreflang otomatik. Menü/footer çevirisi derleme sonunda `scripts/localize.mjs` |
| `/glossary`, `/glossary/<slug>` | `glossary/` | Terimler `src/data/glossary.ts` (yeni terim = veriye bir kayıt) |
| `/vs/<rakip>` | `vs/[slug].astro` | Karşılaştırmalar (tradezella, tradervue, edgewonk); rakip bilgisi yalnızca fiyat sayfalarından |
| (eşleşmeyen her yol) | `404.astro` | Özel 404 sayfası, 404 durum koduyla döner |

### Kimlik doğrulama sayfaları (noindex, navbar yok)
| Route | Açıklama |
|---|---|
| `/login` | E-posta/şifre (Edge Function üzerinden) veya Google ile giriş |
| `/register` | Kayıt |
| `/forgot-password` | Şifre sıfırlama e-postası |
| `/update-password` | E-postadaki linkten yeni şifre belirleme |

### Uygulama sayfaları (giriş gerekir, SPA ile gezilir)
| Route | Ana script | Açıklama |
|---|---|---|
| `/dashboard` | `interface/dashboard/js/dashboard.js`, `prop-card-v2.js` | Ana dashboard: KPI'lar, kümülatif K/Z, günlük K/Z, sembol, win/loss, performans ve prop kartı |
| `/analytics` | `interface/analytics/js/analytics.js` (modül) | "Analytics": özelleştirilebilir kart düzeni, içgörüler, PDF raporu |
| `/trades` | `interface/trades/js/trades.js` | İşlem listesi, düzenleme/silme, Tümü / Canlı / Backtest seçici |
| `/calendar` | `interface/calendar/js/calendar.js` | K/Z takvimi |
| `/strategies` | `interface/strategies/js/strategies.js` | Strateji analizi ve karşılaştırma |
| `/journals` | sayfa içi script + `interface/journals/js/mt5-connect.js` | Defterler (hesaplar), prop hesapları, cTrader ve MetaTrader 4/5 bağlantısı |
| `/add-trade` | sayfa içi script | İşlem ekleme formu ve toplu içe aktarma |
| `/backtest` | `interface/backtest/js/backtest.js` | Backtest v2: mum mum replay, sanal hesaplar, sentetik veya cTrader mumları. Bkz. 5.7 |
| `/my-earnings` | sayfa içi script | Partner (referans) kazançları ve ödeme talepleri |
| `/settings` | `settings/js/settings.js`, `theme-studio.js` | Profil, plan, görünüm (tema stüdyosu, arka plan), bölge/saat, overtrade, şifre, gelişmiş, hesap silme |
| `/report-bug` | sayfa içi script | Hata bildirimi, öneri ve destek talepleri |
| `/admin` | `interface/admin/js/admin-*.js` | Yönetim paneli (yalnızca admin), telefon bildirimleri |

Her uygulama sayfasında ayrıca AI koç paneli (`public/components/ai-coach/`), navbar'da ekonomik takvim rozeti (`public/components/econ-calendar/`) ve işlem notu araçları (`public/components/note-tools/`) yüklenir. Kurulum sihirbazı ve rehberli tur (`interface/dashboard/js/onboarding.js`) da `Layout.astro` tarafından yüklenir.

### Diğer
| Route | Açıklama |
|---|---|
| `/ctrader-callback` | cTrader OAuth dönüş sayfası (SPA dışı); hangi hesabın hangi deftere bağlanacağını kullanıcı seçer |
| `/quick-add-modal` | Quick Add'in bağımsız önizleme sayfası (eski kalıntı) |

`public/_redirects` yalnızca eski `/premium-dashboard` adresini `/analytics`'e 301 ile yönlendirir. `sitemap.xml` elle tutulmaz; derlemede `scripts/sitemap.mjs` üretir (noindex ve canonical'ı olmayan sayfalar hariç, `/tr/` ve `/de/` için hreflang ile). `robots.txt` `/admin`, `/settings/` ve `/api/` yollarını engeller; giriş sayfaları bilerek engellenmez, noindex meta etiketiyle dışarıda kalır.

---

## 5. Veritabanı şeması (Supabase / Postgres)

**Not:** Çekirdek tablolar (`user_profiles`, `journals`, `trades`, `strategies`, `references`) Supabase panelinden oluşturulmuştur; repoda `CREATE TABLE` karşılıkları yoktur. Migration'lar bu tablolara sütun, indeks ve RLS ekler (bkz. `supabase/migrations/README.md`). Aşağıdaki sütun listeleri migration'lardan ve istemci kodundan derlenmiştir.

**Migration kuralları:** Migration'lar elle, sırayla ve tek transaction olarak çalıştırılır (`psql -v ON_ERROR_STOP=1` veya SQL Editor; `supabase db push` kullanılmaz). Her dosyanın başlığında amaç, çalıştırma sırası, rollback ve doğrulama dosyası yazar. Canlıya yazmadan önce yedek alınır. Hangi migration'ın canlıda ne zaman çalıştığı `docs/` notlarında yazılıdır.

### 5.1 İlişki şeması

```
auth.users (Supabase Auth)
   │ 1:1  (trigger handle_new_user → profil + varsayılan "Ana Hesap" defteri)
   ▼
user_profiles ──┐
   │ 1:N        │ 1:N
   ▼            ▼
journals      payments, payout_requests, partner_applications, notifications,
(defterler)   bug_reports, referral_codes (partner olarak), ai_conversations, coach_settings (1:1)
   │ 1:N  ─────────────┬───────────────────┬──────────────────┬──────────────────┐
   ▼                   ▼                   ▼                  ▼                  ▼
trades ──N:1──► strategies        prop_accounts      ctrader_accounts      mt5_accounts
(işlemler)      (journal_id ile    (defter başına      (defter başına en     (MT5 ve MT4; defter
                 deftere bağlı)     en fazla 1 aktif)    fazla 1 hesap)        başına en fazla 1)
```

Her tabloda `user_id` sahiplik alanıdır ve RLS politikaları `user_id = auth.uid() OR is_admin()` kalıbını izler. Bazı tablolarda (cTrader token'ları, MT5 köprüsü, ekonomik takvim, admin push) RLS açık ama politika yoktur: yalnızca service role (Edge Function) erişir, site RPC'lerle çalışır.

### 5.2 Kullanıcı ve defterler

**`user_profiles`** — PK `id` = `auth.users.id`
- Alanlar: `email`, `username`, `avatar_url`, `plan` (`'free'` / `'premium'`), `plan_expires_at`, `role` (yalnızca gösterim için), `is_active`, `max_journals` (varsayılan 2), `last_active`, `created_at`, `preferred_currency`, `onboarding_completed`, `onboarding_tour_completed`, `btc_payout_address`, `ltc_payout_address`, `theme` (jsonb, en fazla 4 KB: tema stüdyosu paleti, cihazlar arası; migration `202611050001`), `quick_add_prefs` (jsonb, en fazla 8 KB: Hızlı Ekle'deki "Sembollerim" ve sembol başına enstrüman/çarpan, cihazlar arası; migration `202611230001`).
- `guard_user_profile_privileges` trigger'ı (migration `202611050002`) API rollerinden gelen isteklerde admin olmayan kullanıcının `plan`, `plan_expires_at`, `role`, `is_active`, `max_journals`, `id`, `created_at` alanlarını değiştirmesini engeller; INSERT'te bunları güvenli varsayılanlara çeker. SECURITY DEFINER fonksiyonlar ve service role etkilenmez. (Baseline'daki `protect_user_profile_privileges` canlıda hiç uygulanmamıştı.)
- Realtime yayınında.

**`journals`** (defterler / hesaplar)
- Alanlar: `id` (uuid), `user_id`, `name` (en fazla 60 karakter), `description`, `color` (varsayılan `#7c6dfa`), `icon` (Lucide ikon adı, varsayılan `folder`), `is_default`, `is_active`, `created_at`, `trade_scope` (`live` / `backtest` / `all`, varsayılan `live`: defterin hangi işlemleri gösterdiği; migration `202610220001`).
- Eski bağlantı/prop alanları: `platform`, `is_connected`, `connection_status`, `last_synced_at`, `is_prop_firm`, `prop_firm_rules` (jsonb), `prop_firm_status`, `prop_firm_stats` (jsonb). Yeni prop takibi `prop_accounts` tablosundadır.
- İndeks: `(user_id, is_active)`.
- Kota: ücretsiz planda `max_journals` (2), aktif Pro'da en az 10.
- RPC'ler: `create_journal`, `update_journal` (ikisi de isteğe bağlı `p_trade_scope` alır), `list_journals` (işlem sayısı, strateji sayısı, toplam K/Z, win rate, son işlem tarihi, `can_create` ve `trade_scope` ile döner; sayılar defterin kapsamına göre). Kodda kullanılan ama migration'da olmayanlar: `delete_journal`, `switch_default_journal`, `get_journal`.
- İstemci: `public/src/core/journal.js` → `window.journal`. Aktif defter `localStorage.ww_active_journal_id` içinde tutulur; değişince `journal-changed` olayı yayınlanır. Defter işareti (renkli nokta, prop/cTrader bağlıysa yanıp söner) `public/interface/shared/journal-mark.js` tarafından çizilir.

### 5.3 İşlemler ve stratejiler

**`trades`** (işlemler)
| Alan | Tür / not |
|---|---|
| `id`, `user_id`, `created_at` | |
| `journal_id` | → `journals` (null olabilir; eski kayıtlar için dashboard'larda `journal_id IS NULL` yedek sorgusu var) |
| `strategy_id` | → `strategies` (null olabilir) |
| `symbol` | örn. `EURUSD` |
| `direction` | `LONG` / `SHORT` |
| `instrument` | varlık sınıfı, örn. `forex` |
| `lot`, `multiplier` | `multiplier` varsayılan 100000 |
| `entry_price`, `exit_price` | **`exit_price` dolu olan işlem "kapanmış" sayılır**; uygulamada "açık işlem" kavramı yoktur |
| `stop_loss`, `take_profit`, `rr_ratio` | |
| `pnl` | net K/Z (öncelikli kaynak). `gross_pnl`, `commission` (0), `swap` (0) ayrıca tutulur |
| `trade_date`, `exit_date` | `exit_date`'i senkronlar (cTrader, MetaTrader) yazar |
| `notes`, `is_quick_entry` | Notlardaki duygu etiketleri (`#fomo`, `#korku` ...) `note-tools` ile eklenir, AI koç okur |
| `import_hash`, `platform_source`, `position_id`, `last_deal_id` | İçe aktarma ve senkron için. `platform_source`: `ctrader`, `mt5`, `mt4`, `backtest` vb. |

- `import_hash` biçimleri: `ctrader:<hesap>:<dealId>`, `mt5:<sunucu>:<login>:<pozisyon>`, `mt4:<sunucu>:<login>:<zincir kökü>`.
- Tekillik: `UNIQUE (user_id, journal_id, import_hash)` (CSV ve senkron içe aktarmalarında çift kaydı önler).
- İndeksler: `(user_id, journal_id, trade_date desc)`, `(user_id, trade_date desc)`, `(strategy_id) WHERE strategy_id IS NOT NULL`.
- Görsel veya ekran görüntüsü sütunu yoktur.
- K/Z, win rate, drawdown gibi tüm hesaplar tek kaynaktan yapılır: `public/interface/shared/trade-metrics.js` (`window.WwMetrics`, testli). Sunucudaki karşılığı `supabase/functions/_shared/trade-summary.ts` aynı tanımları kullanır.

**`strategies`** — `id`, `user_id`, `journal_id`, `name`, `description`, `color`, `is_active`, `created_at`. İndeks `(user_id, is_active)`. İşlemlere `trades.strategy_id` ile bağlanır.

**`backtest_trades`** (eski backtest tablosu) — Migration 01 ile silinir. Yerine `backtest_accounts` ve `backtest_account_trades` gelir (bkz. 5.7).

### 5.4 Prop firm, cTrader ve MetaTrader (defterlere bağlı)

**`prop_accounts`**
- Alanlar: `id`, `user_id`, `journal_id` (→ `journals`, ON DELETE CASCADE), `template_key`, `template_version`, `rules` (jsonb, en fazla 20 KB), `starting_balance` (> 0), `start_date`, `phase_index`, `reset_tz`, `time_shift_hours` (-14…14), `is_active`, `created_at`, `updated_at`.
- Defter başına en fazla bir aktif prop hesabı (kısmi unique indeks).
- `check_prop_account_limit` trigger'ı sahipliği ve kotayı (ücretsiz 1, pro 10) denetler.
- Kurallar ve şablonlar: `public/src/core/prop-templates.js`. Hesaplama: `public/src/utils/prop-calculator.js`, `public/src/services/prop-service.js`. Geçme olasılığı (Monte Carlo): `public/src/utils/prop-montecarlo.js`.
- `prop-calculator.js` ve `prop-montecarlo.js`'in `supabase/functions/_shared/` altında **birebir kopyaları** var (AI koç aynı sayıları kullansın diye); testler eşitliği zorunlu tutar. Birini değiştirirsen ikisini de değiştir ve `ai-coach`'u yeniden deploy et.

**`ctrader_tokens`** — PK `user_id`. Token alanları, `status` (`active` / `needs_reconnect`) ve `refreshing_since` (`ctrader-sync` ile `ctrader-candles`'ın aynı token'ı aynı anda yenilememesi için kilit; migration `202610180009`). RLS açık ama politika yok, yani yalnızca service role (Edge Function) erişir.

**`ctrader_accounts`** — `ctid_trader_account_id`, `is_live`, `trader_login`, `broker_name`, `journal_id` (→ `journals`, ON DELETE SET NULL, dolu olduğunda tekil), `last_sync_at`, `last_deal_timestamp` (senkron imleci), `syncing_since`, `last_error`, `balance`, `balance_currency`, `balance_updated_at`. Defter değişince imleci sıfırlayan trigger var.
- Migration `202611090001` ile: `auto_sync` (varsayılan kapalı; açıksa ve son başarılı senkron 30 dakikadan eskiyse site açılınca arka planda senkron, `public/interface/shared/ctrader-sync.js`) ve `access_revoked_at` (cTrader onay ekranında işaretlenmeyen hesap; senkronlanmaz, deftere bağlanamaz).
- RPC'ler: `get_ctrader_status` (yeni alanlarla), `link_ctrader_account` (erişimi kalkan hesabı reddeder), `set_ctrader_auto_sync`, `unlink_ctrader_account`, `disconnect_ctrader`.

**MetaTrader 5 / 4 köprüsü** (migration `202611090002_mt5_bridge.sql`). Kullanıcının kendi terminalinde çalışan, yalnızca okuyan WaweSync EA'sı `mt5-bridge` Edge Function'ına bağlanır; MetaTrader şifresi istenmez. Ayrıntı: `docs/2026-11-09-CTRADER-MT5.md`, `docs/2026-11-21-MT4.md`.
| Tablo | Amaç / önemli alanlar |
|---|---|
| `mt5_accounts` | Hesap başına bir satır: `user_id`, `journal_id` (dolu olduğunda tekil), `login`, `server`, `broker_name`, `currency`, `is_live`, `balance`, `equity`, `token_hash` (cihaz token'ının SHA-256'sı), `ea_version`, `last_seen_at` (EA nabzı), `last_sync_at`, `last_error`, `cursor_server_ts` (senkron imleci). Tekil `(user_id, server, login)` |
| `mt5_pairings` | 6 haneli eşleşme kodları (15 dk geçerli): `code`, `poll_hash`, `status` (`pending` / `claimed` / `delivered`), `ip_hash`, `expires_at` |
| `mt5_pair_failures` | Yanlış kod denemeleri (hız sınırı için) |

- Üçünde de RLS açık, politika ve API izni yok. `trg_mt5_reset_cursor`: defter değişince imleç sıfırlanır, EA son 90 günü yeni deftere yeniden gönderir.
- Servis fonksiyonları (yalnızca köprü): `mt5_pair_start`, `mt5_pair_poll`. Site RPC'leri: `claim_mt5_pairing`, `get_mt5_status`, `link_mt5_account`, `disconnect_mt5_account`.
- **MT4 aynı tabloları kullanır, ayrı migration yoktur.** Platform hesapta `ea_version` önekiyle (`mt4-1.00`, köprü ekler), işlemde `platform_source = 'mt4'` ve `import_hash = 'mt4:...'` ile ayırt edilir. EA istekte `platform: "mt4"` gönderir; alan yoksa MT5 sayılır.
- EA kaynakları `integrations/mt5/WaweSync.mq5`, `integrations/mt4/WaweSync.mq4`; derlenmiş dosyalar `public/downloads/`. Site arayüzü `public/interface/journals/js/mt5-connect.js` (`WwMt5`, MT4 metinleri `WwMt5.forPlatform` ile MT5 metinlerinden türetilir).

### 5.5 Ödemeler, kazançlar, bildirimler, destek

| Tablo | Amaç / önemli alanlar |
|---|---|
| `payments` | NOWPayments faturaları ve Creem ödemeleri: `invoice_id`, `order_id`, `amount`, `currency`, `plan_type`, `payment_status`, `referral_code`… `process_payment_finished` RPC'si (yalnızca service role) planı uzatır ve partner komisyonunu işler; işlem kimliğine kilitlidir, aynı olay ikinci kez planı uzatmaz. |
| `referral_codes` | `code` (büyük harf), `discount_percent`, `influencer_user_id`, `commission_rate`, `commission_rate_yearly`, `referrer_name`, kullanım sayaçları, `max_usage`, `expires_at`, `is_active`. Creem'de aynı adlı indirim kodu tutulur (`creem-discount-sync`). |
| `referral_commissions` | Komisyon defteri (migration `202610310002`): satış başına bir `sale` satırı (o anki oranla), iade/ters ibrazda negatif `reversal`, eski bakiyeleri donduran `legacy`. Kazanç = defter toplamı. İndirim ve komisyon alıcı başına yalnızca ilk ödemede. |
| `payout_requests` | Partner ödeme talepleri: `amount` (≥ 20), `currency` (LTC/BTC), `payout_address`, `status`, `admin_note`. Ekleme yalnızca RPC ile. |
| `partner_applications` | Partner başvuruları. Ekleme yalnızca RPC ile. Onay `review_partner_application` (migration `202610310001` ile düzeltildi). |
| `notifications` | `type`, `title_key`, `message_key` (i18n anahtarları), `meta_data` (jsonb), `is_read`. Navbar Realtime ile dinler. AI koç uyarıları ve haftalık değerlendirme de buraya yazılır. |
| `bug_reports`, `support_bans` | Destek talepleri ve destek yasakları. |
| `system_settings` | `key` (PK), `value` (jsonb): fiyatlar, ödeme ayarları, destek durumu, `backtest_limits`, `ai_limits`. Yalnızca admin. |
| `references` | Ana sayfadaki kullanıcı yorumları (aktif olanlar herkese açık okunur). |
| `login_attempts` | Giriş/kayıt hız sınırı kayıtları (yalnızca service role). |
| `dev_test_config`, `dev_test_access`, `dev_test_attempts` | 1$'lık test planı modu (kod bcrypt ile saklanır). |
| `admin_push_subscriptions`, `admin_push_events` | Admin telefon bildirimleri (migration `202611080001`): cihaz başına Web Push aboneliği ve bildirilmiş olay anahtarları (tekrar bildirimi önler). Yalnızca service role. |

**Admin push akışı:** `admin_push_enqueue()` trigger'ı `user_profiles` (yeni üye), `bug_reports` (hata/öneri) ve `payout_requests` (para çekme) eklemelerinde `pg_net` ile `admin-notify`'a `{ event, id }` gönderir; hata yutulur, asıl işlemi bozmaz. Pro satış bildirimleri doğrudan ödeme webhook'larından gider (`_shared/admin-push.ts`). Kurulum: `node scripts/admin-push-setup.mjs`, sonra admin panelinde → Telefon Bildirimleri.

Kazanç sayfası RPC'leri: `get_influencer_earnings`, `get_influencer_payout_summary`, `submit_payout_request`, `save_payout_addresses`, `submit_partner_application`, `get_my_partner_application`. Diğerleri: `validate_referral_code` (yeni hata `already_used`), `reverse_referral_commission` (yalnızca service role, Creem iadeleri), `get_prices` / `set_prices`, `get_platform_stats` (ana sayfa sayaçları, anonim), `deactivate_own_account`, `reset_user_data`, `complete_user_onboarding`, `get_unread_notifications_count`, `mark_notification(s)_as_read`, admin RPC'leri.

**Storage bucket'ları:** `avatars` (dosya adı `<uid>_` ile başlamalı), `references-images`, `bug-reports`. Backtest arşivi için `candles` bucket'ı migration 03'te tanımlıdır (Faz E).

### 5.6 Edge Functions (`supabase/functions/`)

Edge Function'lar `git push` ile deploy olmaz: `npx supabase functions deploy <ad> --use-api` (gerekiyorsa `--no-verify-jwt`). Deploy'dan önce canlıdaki kodu indirip yedekle ve repodakiyle karşılaştır.

| Fonksiyon | Görev | Kimlik / deploy |
|---|---|---|
| `verify-auth` | Giriş ve kayıt: Turnstile doğrulaması, hız sınırı (`login_attempts`), hesap aktiflik kontrolü | Oturum öncesi çağrılır |
| `create-payment` | NOWPayments faturası oluşturur (referans kodu, fiyatlar, test modu) | Kullanıcı JWT'si kodda doğrulanır |
| `nowpayment-webhook` | Kripto ödeme tamamlanınca planı işler, admin'e bildirim gönderir | `--no-verify-jwt`, IPN imzası |
| `creem-checkout` | Kart ödemesi için Creem ödeme sayfası açar; ürün/fiyat sunucuda seçilir, partner kodu Creem indirimi olarak uygulanır | Kullanıcı JWT'si kodda; README: `--no-verify-jwt` |
| `creem-webhook` | Creem olayları: `checkout.completed` / `subscription.paid` → Pro süresi; iade/ters ibrazda komisyon geri alınır, Telegram + push | `--no-verify-jwt`, `creem-signature` HMAC |
| `creem-subscription` | Kart aboneliğinin durumu ve dönem sonunda iptali | Kullanıcı JWT'si kodda |
| `creem-discount-sync` | Admin partner kodunu değiştirince Creem'deki aynı adlı indirimi eşitler | Yalnızca admin (JWT kodda) |
| `ctrader-connect` | cTrader OAuth kod değişimi; token ve hesapları kaydeder, `access_revoked_at`'i günceller | Kullanıcı JWT'si kodda; README: `--no-verify-jwt` |
| `ctrader-sync` | cTrader işlemlerini `trades`'e aktarır (`ctrader:<hesap>:<dealId>`), bakiyeyi günceller, koç uyarılarını çalıştırır | Aynı |
| `ctrader-candles` | Backtest için kullanıcının kendi cTrader hesabından M1 mumları (`symbols`, `symbolInfo`, `coverage`, `month`); sunucuda saklamaz | Aynı |
| `mt5-bridge` | WaweSync EA (MT5/MT4) köprüsü: `pair_start`, `pair_poll`, `sync` | `--no-verify-jwt`, cihaz token'ı |
| `ai-coach` | AI koç sohbeti (akışlı) ve yan işlemler: `snapshot`, `alerts`, `goal`, `commit`, `apply` (bkz. 5.8) | Kullanıcı JWT'si; bayraksız deploy |
| `econ-calendar` | Navbar rozeti ve takvim sayfası için ekonomik takvim (önbellekli) ve kullanıcının pariteleri | Kullanıcı JWT'si, `verify_jwt` açık |
| `admin-notify` | Admin Web Push: DB tetikleyici çağrıları (`signup`, `report`, `payout`) ve admin panelinden `config` / `subscribe` / `unsubscribe` / `test` | `--no-verify-jwt`; satır service role ile yeniden okunur |
| `get-candles` | Eski backtest için mum verisi. **Repodan silindi**; canlıdaki kopyası hâlâ duruyor olabilir, silinmesi ayrı bir adım (canlı yazma). | — |

**`--no-verify-jwt` listesi:** Kesin olanlar: `mt5-bridge`, `admin-notify` (kendi başlıkları), `nowpayment-webhook`, `creem-webhook` (README ve 2026-11-16 notu). `README.md` ayrıca `creem-checkout` ve `ctrader-*` fonksiyonlarını sayar; `docs/2026-11-15-DEVAM-NOTLARI.md` ise `create-payment` ve tüm `creem-*`'i sayar. Bu fonksiyonlar kimliği zaten kendi içinde doğrular; deploy'dan önce canlıdaki ayarı kontrol et.

**Ortak modüller (`_shared/`):**
| Modül | Ne yapar |
|---|---|
| `ctrader.ts` | cTrader WebSocket istemcisi, kilitli token yenileme, trendbar çekme, CORS (`ctrader-sync`, `ctrader-candles`; `ai-coach` da CORS için kullanır) |
| `mt5.ts` | Köprünün saf mantığı: istek doğrulama, sunucu saati → UTC, sembol normalleştirme, pozisyon → `trades` satırı, MT4/MT5 ayrımı |
| `creem.ts` | Creem API yardımcıları, partner kodu ↔ Creem indirimi eşitlemesi |
| `admin-push.ts`, `webpush.js` | Admin Web Push gönderimi (yalnızca WebCrypto, RFC 8291/8292) |
| `trade-summary.ts` | Koç için işlem istatistikleri (`trade-metrics.js` ile aynı tanımlar) |
| `coach-knowledge.ts`, `coach-personas.ts` | Koçun sabit bilgi tabanı ve personaları (Kai, Mira, Rex, Atlas, Nova; üslup soft/balanced/strict) |
| `coach-alerts.ts`, `discipline.ts`, `emotions.ts` | Senkron/manuel işlem sonrası canlı uyarılar, işlem planına uyum puanı, notlardaki duygular (model çağrısı yok) |
| `weekly.ts`, `commitments.ts`, `actions.ts`, `insights.ts`, `visuals.ts` | Haftalık değerlendirme ve hedef, günlük sözler, onaylı aksiyon kartları, açılış ekranı bulguları, `[[viz:...]]` grafik verisi |
| `model-chain.ts`, `gemini-stream.ts`, `openrouter-stream.ts` | Hangi modelin cevaplayacağı (meşgul model sona alınır), Gemini Interactions API akışı, OpenRouter yedeği |
| `token-usage.ts` | Koç cevabının token sayıları (gönderilen / önbellekten / üretilen / düşünme) ve prompt parçalarının boyu: `ai-coach tokens` log satırı (Supabase → Edge Functions → ai-coach → Logs). İçerik ve kullanıcı kimliği yazılmaz |
| `prop-context.ts`, `backtest-context.ts` | Koça aktif prop challenge durumu ve backtest hesapları |
| `prop-calculator.js`, `prop-montecarlo.js` | `public/src/utils/` dosyalarının birebir kopyaları |
| `econ-calendar.ts`, `econ-feed.ts` | Ekonomik takvim kaynakları ve parite eşlemesi; `econ_events` önbelleğinin tazelenmesi |
| `paged.ts` | PostgREST'in 1000 satır sınırını sayfalı okumayla aşar |

### 5.7 Backtest v2

**Durum (2026-11-22):** Üretimde (master), `BACKEND = 'supabase'`. Sayfa giriş yapmış tüm kullanıcılara açık. Mumlar iki kaynaktan gelir: tarayıcıda üretilen **sentetik** veri ve kullanıcının kendi broker hesabından **cTrader** verisi (Faz 2, migration 09). Hesaplar ve işlemler kullanıcının hesabında (Supabase) saklanır. Kendi mum arşivimiz (Faz E) henüz yok. Ayrıntılı durum: `docs/BACKTEST-DURUM.md`.

**Sayfa ve kütüphaneler (`public/interface/backtest/`):**
| Dosya | Görev |
|---|---|
| `js/backtest.js` | Sayfa denetleyicisi: hesap listesi, oluştur/düzenle/sil/sıfırla, replay, emir paneli, grafik (Lightweight Charts), istatistikler, tarihe git, tr/en/de |
| `js/bt-symbols.js`, `bt-candles.js` | Sembol tablosu (pip, basamak, lot), mum birleştirme ve zaman dilimi |
| `js/bt-engine.js` | Tamsayı tabanlı işlem motoru: spread, SL/TP, komisyon (gidiş-dönüş, kapanışta), piyasa/limit/stop emirleri; aynı mumda SL ve TP birlikte vurursa SL öncelikli (`exit_rule`) |
| `js/bt-synthetic.js`, `bt-data.js` | Tarayıcıda deterministik sentetik mum üretimi ("Sentetik veri, gerçek piyasa verisi değildir" etiketi) ve mum kaynağı arayüzü |
| `js/bt-ctrader.js` | cTrader mum kaynağı (`WwBtCTrader`): `ctrader-candles` üzerinden ay ay M1 barları, broker sembol eşleştirme, IndexedDB önbelleği (aşağıda) |
| `js/bt-store.js` | `SupabaseStore` (üretim) ve yalnızca duman testleri için `LocalStore`; veritabanıyla aynı satır biçimi ve kurallar (kota, kilitler, bölümler, `data_source`) |
| `js/bt-sync.js` | Kapanan işlemleri bağlı deftere `platform_source = 'backtest'` olarak yazar; bağlantı değişince kopyaları siler |
| `js/bt-layout.js` | Basit / Gelişmiş mod, ayırıcılar, tam ekran, kısayol sayfası; tercihler `ww_bt_layout_v1` |
| `js/bt-desk.js` | Gelişmiş modda pencere sistemi: taşı, boyutlandır, küçült, kenara yapıştır, görev çubuğu, kayıtlı düzenler (`ww_bt_desk_v1:<kullanıcı>`) |
| `js/bt-fsedit.js` | Tam ekranda yüzen kutuları ve pencereleri düzenleme |
| `js/bt-range.js` | Araç çubuğundaki tarih ve aralık takvimi (bitişte replay durur) |
| `js/bt-plan.js` | Ayarlar penceresindeki "Plan ve kullanım" sekmesi (`get_backtest_plan_usage`) |
| `js/bt-look.js` | Görünüm çekmecesi: mum stili, renkler, ızgara/hacim/seans arka planı, hazır ve kayıtlı temalar (`ww_bt_look_v1`) |
| `js/bt-draw.js` | Çizim araçları (trend, ışın, yatay, dikdörtgen, Fibonacci, long/short, metin, ölçüm...); geri al/yinele; çizimler `backtest_drawings` tablosunda |
| `js/bt-stats.js` | İstatistikler (WwMetrics): temel rakamlar, bakiye eğrisi; Premium: varlık eğrisi, drawdown, aylık getiri, R dağılımı, seanslar |
| `css/backtest.css` | Tam ekran düzen, yan panel, alt sekmeler; 1024px altında alt alta |

**cTrader mum önbelleği (`bt-ctrader.js`):** Mumlar sunucuda saklanmaz (`ctrader-candles` yanıtı `Cache-Control: private`). Tarayıcı ayları IndexedDB'de kullanıcı kimliği altında tutar; başka kullanıcının kayıtları sayfa açılınca silinir. Tamamlanmış ay olduğu gibi kullanılır. **Devam eden ay da** (2026-11-22, commit `5f9764e`) getirildiği besleme günüyle (o günün 00:00 UTC'si) saklanır: aynı UTC gününde olduğu gibi kullanılır; sonraki bir günde replay imlecine yetiyorsa hemen gösterilir ve arka planda yeniden indirilir, yeni barlar replay penceresine eklenir. İmleç saklanan verinin ötesindeyse indirme beklenir.

**Erişim:** giriş yapmış herkes; navbar linki herkese görünür. Sayfadaki kapı yalnızca görünürlüktür (`WwBtGate`: anon, demo, member), izinleri veritabanı belirler (RLS, kota: ücretsiz 1, Pro 10 aktif hesap). **Veri kaynağı:** hesap açarken seçilir, sonradan değişmez (`backtest_accounts.data_source`: `synthetic` / `ctrader`, `source_*` sütunları). cTrader hesabı yalnızca o broker hesabı bağlı olan kullanıcı tarafından açılabilir. Sentetik hesaplar defterlere bağlanamaz (veritabanı CHECK'i).

**Veritabanı:** migration'lar `supabase/migrations/202610180NNN_*.sql` ve sonrası. Elle, SQL Editor'da veya psql ile, sırayla çalıştırılır:
| No | Ne yapar |
|---|---|
| 00 | `evaluate_prop_firm_rules(uuid)` açığını kapatır: anon erişimi kalkar, sahiplik kontrolü gelir (admin ve service role geçer) |
| 01 | Eski `backtest_trades` tablosunu siler (satır varsa durur), `reset_user_data()` eski bloğu çıkarır |
| 02 | `backtest_accounts` ve `backtest_account_trades`, RLS, kota ve kilit tetikleyicileri |
| 03 | `candles` Storage bucket'ı, yalnızca admin okur (Faz E) |
| 04 | Hesap bağlantısı değişince/silinince defterdeki backtest kopyalarını temizler |
| 05 | `list_journals()` ve `get_platform_stats()` backtest satırlarını saymaz |
| 06 | Kullanılmayan 6 fonksiyonu siler (isteğe bağlı) |
| 07 | Arşivi tüm üyelere açar; lisans onay satırı açılmadan çalışmaz (Faz E) |
| 08 | `backtest_accounts.data_source`, sentetik hesap deftere bağlanamaz (CHECK), alan değiştirilemez (tetikleyici) |
| 09 | `data_source = 'ctrader'` ve `source_*` sütunları (broker hesabı, sembol, basamak), sahiplik tetikleyicisi, `ctrader_tokens.refreshing_since` |
| 202610220001 | `journals.trade_scope` (defter başına canlı / backtest / tümü), `create_journal` / `update_journal` / `list_journals` güncellemesi |
| 202610240001 | `backtest_drawings` (RLS, sahiplik + hesap başına 500 tetikleyicisi). Doğrulama `supabase/tests/backtest_drawings_verify.sql` |
| 202610240002 | cTrader verili hesaplarda ücretsiz plana aylık işlem sınırı: `system_settings.backtest_limits` (varsayılan 100), sayaç `backtest_trade_usage`, tetikleyici `check_backtest_trade_quota`, RPC `get_backtest_trade_usage` |
| 202610240003 | Bölümler: açık pozisyon yoksa işlemli hesapta geriye gidilebilir, her geri gidiş yeni bölüm (`section_no`, `sections`) |
| 202610260001 | `get_backtest_plan_usage()`: "Plan ve kullanım" sekmesinin tüm sayıları tek çağrıda |
| 202610260002 | Çizimler tüm planlara açık (Premium şartı kalktı) |
| 202610290001 | `backtest_account_trades.exit_rule` (`pessimistic` / `bar_path`): belirsiz çıkışı hangi kuralın belirlediği |

Rollback dosyaları 202610220001'den itibaren `supabase/rollbacks/` içinde, doğrulama betikleri `supabase/tests/` içindedir.

**İstatistiklerden yalıtım:** Backtest işlemleri günlüğe yalnızca `trades.platform_source = 'backtest'` ile gider. Okuyucular (dashboard, analytics, takvim, stratejiler) defterin `trade_scope`'una göre okur (`public/interface/shared/trades-source.js`); prop kartları, senkronlar ve bildirimler her zaman yalnızca canlı işlemleri kullanır. İşlemler sayfasında Tümü / Canlı / Backtest seçici ve "Backtest" rozeti vardır.

**Plan:** ücretsiz kullanıcı Premium özelliklere (2 tema dışındaki görünüm ayarları, gelişmiş istatistikler, çoklu grafik, cTrader verisinde sınırsız işlem, birden fazla kayıtlı pencere düzeni) tıklayınca `openUpgradeModal` açılır; kontroller küçük "PRO" etiketi taşır. Kontrol `isPro()` / `hasFeature('backtest…')` ile (`public/src/core/config.js` FEATURES). Çizim araçları ve kalıcı çizimler 2026-10-26'dan beri herkese açık.

**Test araçları:** `npm test` (birim testleri, `bt-*.test.js`). Tarayıcı duman testleri: `tests/smoke/README.md`.

### 5.8 AI koç

Üyenin kendi işlemleri hakkında sohbet eden koç. Panel her uygulama sayfasında açılır (`public/components/ai-coach/ai-coach.js`), sunucu tarafı `ai-coach` Edge Function'ıdır.

- **Model:** Google Gemini (Interactions API, akışlı). Meşgul veya sessiz kalan model bir süre sona alınır (`_shared/model-chain.ts`); bütün Gemini modelleri meşgulse OpenRouter'ın ücretsiz modelleri devreye girer (`_shared/openrouter-stream.ts`). Anahtarlar fonksiyon sırlarındadır, tarayıcıya ulaşmaz.
- **Bağlam:** işlem özeti (`trade-summary.ts`), sabit bilgi tabanı (`coach-knowledge.ts`), aktif prop challenge'lar (`prop-context.ts`), backtest hesapları (`backtest-context.ts`), ekonomik takvim. Grafik ekran görüntüsü gönderilebilir; görseller **saklanmaz** (yalnızca `had_image`).
- **Personalar:** Kai (varsayılan, genel), Mira (psikoloji), Rex (açgözlülük / overtrade), Atlas (disiplin), Nova (risk); üslup yumuşak / dengeli / sert. Seçim `coach_settings.plan.coach`. Herkese açık.
- **Grafikler ve kartlar:** model `[[viz:...]]`, `[[commit:...]]`, `[[action:{...}]]` satırları yazar; grafik verisi modelden değil uygulamanın kendi sayılarından üretilir (`visuals.ts`), aksiyonlar üye "Uygula" deyince sunucuda yeniden doğrulanır (`actions.ts`).
- **Canlı uyarılar ve haftalık değerlendirme:** senkron (cTrader, MetaTrader) veya manuel işlem sonrası kural tabanlı uyarılar (`coach-alerts.ts`), haftalık değerlendirme ve hedef (`weekly.ts`), günlük sözlerin kapanışı (`commitments.ts`) `notifications`'a yazılır. Model çağrısı yoktur, mesaj hakkı harcamaz.

**Tablolar (migration `202611120002_ai_coach.sql`, `202611120003_ai_coach_visuals.sql`, `202611140001_coach_settings.sql`):**
| Tablo | Amaç / önemli alanlar |
|---|---|
| `ai_conversations` | Sohbet başlıkları: `user_id`, `journal_id`, `title`. Üye kendi satırlarını okur ve siler; yalnızca Edge Function yazar |
| `ai_messages` | Sohbet turları: `role` (`user` / `model`), `content` (≤ 20000), `steps` (modelin ham çıktı adımları, aynı modele aynen geri gönderilir), `model`, `had_image`, `visuals` (jsonb, cevabın grafik verisi) |
| `ai_usage` | Kullanıcı + UTC gün başına mesaj sayacı; yalnızca `ai_take_message()` / `ai_refund_message()` yazar |
| `coach_settings` | Üye başına bir satır: `alerts_enabled` (varsayılan açık), `time_zone` (IANA), `plan` (jsonb: işlem planı kuralları, koç seçimi, hafta hedefi, sözler). Üye kendi satırını okur/yazar |

- **Limitler:** `system_settings` `ai_limits` = `{"free_daily": 5, "premium_daily": 50}` (UTC gün başına mesaj, 00:00 UTC'de sıfırlanır). Sürüm çıkmadan SQL ile değiştirilebilir (komut migration başlığında). 2026-11-15 notuna göre bu değerler geçici.
- **RPC'ler:** `ai_take_message`, `ai_refund_message` (yalnızca service role; Gemini hata verirse hak geri verilir), `get_ai_usage()` (panel için `{ used, limit, premium, resets_at }`).

### 5.9 Ekonomik takvim

Navbar'daki geri sayım rozeti, takvim paneli ve haber öncesi uyarılar (`public/components/econ-calendar/`). Veri Forex Factory, CryptoCraft, MetalsMine ve EnergyExch'in haftalık dışa aktarımlarından gelir; sunucuda birleştirilip önbelleğe alınır.
- `econ_events` (migration `202611170001`, `202611170002`): olaylar; `impact` (en yüksek) ve `impacts` (site başına), `currency` (`ALL` = küresel). Geçmiş haftalar 400 gün tutulur; önbellek 2026-11-15'te başladığı için daha eski haber yoktur.
- `econ_feed_state`: tek satır, son deneme/başarı zamanı. Dışa aktarım 5 dakikada ~2 isteğe izin verdiği için yenilemeyi tek bir çağrı üstlenir; veri 30 dakikadan eskiyse tazelenir.
- İki tabloya da üyelerin doğrudan erişimi yok; `econ-calendar` ve `ai-coach` service role ile okur. Parite → para birimi eşlemesi yalnızca sunucuda (`_shared/econ-calendar.ts`).

---

## 6. Kimlik doğrulama

Supabase Auth kullanılır. Oturum, Supabase JS'nin varsayılanıyla `localStorage` içinde (`sb-*-auth-token`) tutulur.

- **Giriş (`/login`).** E-posta ve şifre tarayıcıdan doğrudan Supabase'e değil, `verify-auth` Edge Function'ına gönderilir. Fonksiyon şunları yapar: Turnstile doğrulaması; hız sınırı (15 dakikada IP başına 10, e-posta başına 30 başarısız deneme); `signInWithPassword`; `is_active` kontrolü. İstemci dönen token'larla `auth.setSession()` çağırıp `/dashboard`'a gider. **Google ile giriş** `signInWithOAuth({ provider: 'google' })` ile yapılır.
- **Kayıt (`/register`).** Aynı fonksiyonda `action: 'register'` ile yapılır: kullanıcı adı ve e-posta tekilliği kontrol edilir, ardından `signUp` çağrılır. **E-posta otomatik onaylanır**, yani ayrı bir doğrulama adımı yoktur. Profil ve varsayılan defter `handle_new_user` trigger'ı ile oluşur.
- **Şifre sıfırlama.** `/forgot-password` → `resetPasswordForEmail` → e-postadaki link `/update-password`'a gelir → `auth.updateUser({ password })` (en az 6 karakter).
- **Sayfa koruması.** Rota düzeyinde sunucu koruması yoktur; her sayfa script'i açılışta `requireAuth()` çağırır (`public/src/core/supabase.js`, `bundle.js` ile global). Oturum yoksa `/login`'e yönlendirir. Profil 3 dakika önbelleğe alınır. `is_active = false` ise kullanıcıyı çıkış yaptırır. Asıl güvenlik veritabanındaki **RLS** politikalarıdır (`202608190001_security_baseline.sql` ve sonraki güvenlik migration'ları, özellikle `202611050002_user_profile_privileges.sql`).
- **Pro.** Plan kaynağı `user_profiles.plan = 'premium'` ve geleceğe ait (veya boş) bir `plan_expires_at`'tir. Fonksiyonlar `public/src/services/user.js` içinde: `getUserPlan`, `isPro`, `hasFeature`, `requirePro`. Plan sessionStorage'da 5 dakika tutulur. `BaseHead` sayfa çizilmeden `is-pro` sınıfını ekler (yükseltme butonları yanıp sönmesin diye). Ödeme penceresi `UpgradeModal.astro`'dur (kart: Creem, kripto: NOWPayments). Kart aboneliği ayarlardan dönem sonunda iptal edilir (`creem-subscription`).
- **Admin.** Ölçüt `auth.users.raw_app_meta_data.role = 'admin'` (JWT'de `app_metadata.role`). Veritabanında `public.is_admin()` bunu okur. İstemcide `isAdmin()` / `requireAdmin()` ve `admin-core.js` yalnızca `app_metadata.role`'ü kullanır. Rolün nasıl verileceği `supabase/ADMIN_ROLE.md` dosyasında anlatılır. `user_profiles.role` yalnızca gösterim içindir; kullanıcı tarafından değiştirilebilen `user_metadata` hiçbir yerde yetki kaynağı değildir.
- **Çıkış.** Navbar'daki çıkış butonu `signOut` çağırır, plan/avatar/aktif defter önbelleklerini temizler ve ana sayfaya döner.
- **cTrader OAuth.** `/journals` sayfası kullanıcıyı cTrader yetkilendirme sayfasına gönderir. `/ctrader-callback` dönen kodu oturum token'ı ile `ctrader-connect`'e iletir, ardından kullanıcı bağlanacak hesabı (ve isterse diğer hesaplar için yeni defterleri) seçer; `link_ctrader_account` ve `ctrader-sync` çağrılır.
- **MetaTrader eşleşmesi.** OAuth yoktur: EA grafikte 6 haneli kod gösterir, kullanıcı kodu `/journals`'taki pencereye girer (`claim_mt5_pairing`), EA cihaz token'ını bir kez alır (bkz. 5.4).

---

## 7. Tasarım sistemi

### 7.1 Renkler (`public/styles.css`)

Varsayılan tema koyudur. Açık tema `body.light-theme` sınıfıyla gelir.

| Değişken | Koyu | Açık |
|---|---|---|
| `--bg` | `#07070c` | `#f4f4f9` |
| `--bg2` | `#0d0d14` | `#ececf2` |
| `--surface` | `#0e0e16` | `#ffffff` |
| `--surface2` | `#161620` | `#f1f1f6` |
| `--border` | `rgba(var(--ac-b2-rgb), .12)` | `#e2e2ea` |
| `--border2` | `rgba(var(--ac-b2-rgb), .2)` | `rgba(var(--ac-rgb), .35)` |
| `--accent` / `--accent2` / `--accent3` | `var(--ac)` / `var(--ac-p1)` / `var(--ac-l1)` | `var(--ac-b5)` / `var(--ac-b6)` / `var(--ac-p1)` |
| `--green` | `#22c55e` | `#10b981` |
| `--red` | `#ef4444` | `#dc2626` |
| `--yellow` | `#fbbf24` | `#d97706` |
| `--text` | `#f1f1f8` | `#0f172a` |
| `--muted` | `#a0a0b8` | `#64748b` |

- **Vurgu rengi:** `--ac*` tonları (`--ac` varsayılan `#8b5cf6`) `BaseHead.astro` içindeki `#ww-accent-defaults` bloğunda tanımlıdır. Tema motoru (`src/scripts/theme-engine.js`, `window.WWTheme`) seçilen vurgu renginden tüm tonları türetir; varsayılan mor seçiliyse hiçbir şey yazmaz.
- Diğer değişkenler: `--cyan`, `--pink`, `-bg` ve `-glow` türevleri, `--gradient-accent`.
- Köşe yarıçapları: `--radius` 12px, `--radius-sm` 8px, `--radius-lg` 20px.
- z-index ölçeği: `--z-dropdown` 300, `--z-popover` 500, `--z-fab` 999, `--z-modal-overlay` 1000, `--z-toast` 9999 vb.
- Ortam ışığı: `--ambient-*` değişkenleri, `[data-ambient-state=profit|loss|neutral]` ile değişir. Arka plan katmanları (taban, sahne görseli, ışık topları, K/Z ışığı) `public/components/ambient/` içindedir.

**Güncel kural — grafik ve modallar:** Koyu temada grafikler, tooltip'ler ve modallar temanın morumsu yüzeylerini değil **saf siyah (`#000`)** zemin ve nötr beyaz çizgiler (`rgba(255,255,255,0.05–0.1)`) kullanır. Açık temada beyazdır. Bu kural şu dosyalarda uygulanıyor: `shared/chart-theme.css`, `dashboard.css`, `analytics.css`, `strategies.css`, `quick-add.css`, `navbar.css`, `buttons.css`. Yeni bir modal veya grafik eklerken bu kurala uyulmalıdır. Büyütülmüş grafik tam ekran değil, ortalanmış bir modaldır.

**Tema anahtarları (localStorage):**
- `ww_theme`: açık / koyu tema.
- `ww_custom_theme`: tema stüdyosu paleti (Pro; Ayarlar > Görünüm, `public/settings/js/theme-studio.js`). Biçim v2: koyu ve açık mod için ayrı palet. Hesaba da yazılır (`user_profiles.theme`), yeni olan kazanır. `public/src/features/theme.js` yalnızca motora köprüdür.
- Diğerleri: `ww_font_size`, `ww_ambient_mode`, `ww_bg`, `ww_language`, `ww_time_settings`.

**Hızlı Ekle sembol anahtarları (localStorage, `public/interface/quick-add/js/quick-add.js`):**
- `ww_qa_custom_symbols`: kullanıcının eklediği semboller ("Sembollerim", en fazla 30).
- `ww_qa_symbol_instruments`: sembol başına en son kaydedilen enstrüman ve çarpan (`{ USOIL: { i: 'other', m: 1000 } }`, en fazla 200).
- `ww_qa_prefs_ts`: bu ikisinin son yerel değişiklik zamanı. İkisi hesaba da yazılır (`user_profiles.quick_add_prefs`, son 80 enstrüman). Pencere açılınca en fazla dakikada bir okunur, yeni olan kazanır. Sembol listesi olduğu gibi alınır, enstrümanlar birleştirilir. Kolon yoksa yalnızca yerelde çalışır.
- `ww_qa_recent_symbols`: son kullanılan semboller (canlı işlemlerden, yalnızca önbellek).

`BaseHead` tema motorunu satır içi çalıştırır; tema, plan ve dil sayfa çizilmeden önce `<html>` öğesine uygulanır, böylece ekran yanıp sönmez.

### 7.2 Fontlar

Uygulama ve giriş sayfalarının fontları kendi sunucumuzdan gelir (`public/fonts/fonts.css`, yalnızca latin + latin-ext, `font-display: swap`, kritik dosyalar preload; Google Fonts'a istek yok).

| Font | Değişken | Kullanım |
|---|---|---|
| **Geist** | `--font` | Gövde metni ve tüm grafik metinleri (`chart-theme.js` → `FONT`) |
| **Geist Mono** | `--font-mono` | Sayısal alanlar |
| **Syne** | `--font-display` | Başlıklar |
| DM Sans | — | Yalnızca PDF raporlarına gömülür (`public/fonts/pdf`, dashboard ve analytics PDF'leri) |

**Not:** `public/index.css` hâlâ `DM Mono`, `Inter`, `DM Sans` ve `Space Grotesk` adlarını içeriyor ama hiçbir sayfadan bağlanmıyor gibi görünüyor.

### 7.3 Ortak bileşen ve modüller

| Bileşen | Nerede | Ne yapar |
|---|---|---|
| Navbar | `src/components/Navbar.astro` + `public/components/navbar/` | Menü, defter seçici, bildirim zili, ekonomik takvim rozeti, plan rozeti, çıkış |
| Toast | `public/src/utils/ui.js` → `showToast(msg, type)` | Kısa bildirim |
| Onay penceresi | `public/src/utils/confirm-dialog.js` | Onay/iptal soruları |
| Modal, iskelet, boş durum | `styles.css` (`.modal-overlay`/`.modal-box`, `.skeleton*`, `.empty-state`) | Ortak CSS sınıfları |
| Quick Add | `public/interface/quick-add/` | Hızlı işlem ekleme; broker CSV/XLSX/HTML algılama ve eşleştirme |
| Yükseltme penceresi | `src/components/UpgradeModal.astro` | Pro'ya geçiş (kart veya kripto) |
| AI koç paneli | `public/components/ai-coach/` | Sohbet, ekran görüntüsü, dikte, koç seçimi (bkz. 5.8) |
| Not araçları | `public/components/note-tools/` (`WwNoteTools`) | İşlem notu alanlarının altında duygu etiketleri ve dikte |
| Renk seçici | `public/components/color-picker/` | Tema stüdyosu ve strateji renkleri için temaya uyan panel |
| **`WwChart`** | `public/interface/shared/chart-theme.js` + `.css` | Tüm grafiklerin ortak görünümü: `apex(opts)`, `lwc(opts)`, `axisLabels()`, `barSize()`, `colors()`, `tipHtml()` (ortak siyah tooltip kartı `.ww-tip`) |
| **`WwChartViewer`** | `public/interface/shared/chart-viewer.js` | Grafiğe tıklayınca açılan büyütme penceresi: önceki/sonraki gezinme, Esc ile kapatma |
| **`WwMetrics`** | `public/interface/shared/trade-metrics.js` | K/Z, win rate, profit factor, drawdown, seriler, Sharpe, R:R. Tek doğruluk kaynağı, testli. |
| **`WwTime`** | `public/interface/shared/time-settings.js` | Saat dilimi ve gün başlangıcı ayarı; gün anahtarları, tarih biçimleri |
| `WwDatePicker`, `WwRangePicker` | `public/interface/shared/ww-date-picker.js`, `ww-range-picker.js` | Tarayıcının takvimi yerine temaya uyan tarih ve aralık seçiciler |
| `WwCtSync` | `public/interface/shared/ctrader-sync.js` | cTrader senkron istemcisi (navbar butonu, callback sayfası, otomatik senkron) |
| `WwLazy`, `WwRealtime` | `public/interface/shared/lazy-load.js`, `realtime-guard.js` | Gecikmeli script yükleme; güvenli Realtime kanalları |
| `WwDemoData` | `public/interface/shared/demo-data.js` | Yalnızca admin: `/dashboard?demo=seed` ile tanıtım için "Wawe Demo" defteri |
| `WwJournalMark` | `public/interface/shared/journal-mark.js` | Defter renk noktası ve prop/cTrader rozeti |
| `wwCache` | `public/cache.js` | 2 dakikalık veri önbelleği |
| `wwLog` | `BaseHead.astro` | Sessiz logger (`localStorage.ww_debug = 'true'` ile açılır; hatalar her zaman görünür) |
| `wwPage` / `wwSpa` | `BaseHead.astro` / `SpaRouter.astro` | SPA sayfa yaşam döngüsü ve geçişler |

**Yeni bir grafik eklerken:**
- ApexCharts için `WwChart.apex({...})` kullan.
- Lightweight Charts için `WwChart.lwc({...})` kullan.
- Özel tooltip için `WwChart.tipHtml(...)` kullan.
- Büyütülmüş görünüm için `WwChartViewer.open(...)` kullan.

Böylece font, eksen yazısı, ızgara ve tooltip görünümü diğer sayfalarla aynı kalır.

---

## 8. Geliştirme notları

- **Kurulum:** `npm install` → `npm run dev`. `bundle.js` dev ve build başında otomatik üretilir. Astro 7'ye geçildiği için eski bir `node_modules` (Astro 4) varsa `npm install` yeniden çalıştırılmalı.
- **Testler:** `npm test` (= `node --test tests/*.test.js`; tarayıcı modülleri `vm` ile yüklenir). 2026-11-21 notuna göre ~820 test; Windows'ta satır sonu (CRLF) yüzünden 2 test (`bundle.js` eşitliği, "N" kısayolu) düşebilir.
- **Backtest duman testleri:** gerçek derlenmiş sayfa üzerinde headless Chrome (`tests/smoke/`, `node --test`'in parçası değil). Adımlar: `npx astro build` → `python3 tests/smoke/make.py` → `PP_DIR=<puppeteer-core klasörü> node tests/smoke/run.mjs`. Ayrıntı ve senaryolar: `tests/smoke/README.md`.
- **SQL doğrulama:** her yeni migration'ın `supabase/tests/*_verify.sql` betiği tek transaction'da çalışıp ROLLBACK ile biter; bazılarının PGlite provası (`rehearse_*.mjs`) vardır.
- **Yayın:** Üretim sitesi **`master`** dalından Cloudflare Pages ile yayınlanır; push edilen her şey birkaç dakikada wawejournal.com'a çıkar (`main` eski, kullanılmıyor). Push'tan sonra Pages panelinde deploy'un başladığına bak. Edge Function'lar ve migration'lar push ile gitmez, elle uygulanır (bkz. 5 ve 5.6).
- **Devir notları:** Canlıda neyin ne zaman yapıldığı, yedeklerin yeri ve sonraki adımlar `docs/` altındaki tarihli notlardadır (en yenisi `docs/2026-11-21-MT4.md`).
- **Yerel demo:** `node scripts/seed-demo.mjs` yerel sahte Supabase için demo verisi üretir; `scripts/demo/` Playwright ile tanıtım görüntüsü çeker. Canlı veritabanına istek gitmez.
- **Astro geliştirme araç çubuğu kapalı** (`astro.config.mjs` → `devToolbar.enabled = false`): localhost'ta alt paneldeki tabloların üstünü kapatıyordu.
- **Önbellek kırma:** Kaynak dosyalara elle `?v=` yazılmaz; derleme her yerel JS/CSS referansına `?v=<BUILD_ID>` yazar (`scripts/asset-version.mjs`). Kodla kurulan adreslerde (fetch, `script.src`, dinamik import) kaynakta `?v=__WW_BUILD_ID__` yazılır. Damgasız referans derlemeyi durdurur. Service worker önbellek adı da her derlemede değişir.
- **Birebir kopyalar:** `public/src/utils/prop-calculator.js` ve `prop-montecarlo.js` ↔ `supabase/functions/_shared/` (bkz. 5.4).
- **Bilinen sorunlar ve tutarsızlıklar:**
  - `src/components/quick-add/QuickAddModal.tsx` (React, kullanılmıyor) işlemi `journal_id` olmadan ekler.
  - `report-bug.astro`'nun `bug_reports` başarısız olunca `system_settings`'e yedek yazması admin-only RLS yüzünden başarısız olur.
  - Bazı istemci ayarları (Supabase genel anahtarı vb.) ortam değişkeni yoksa kodda yedek değer olarak duruyor. Bunlar herkese açık türden anahtarlar olsa da tek bir yerden (`config.js`) yönetilmeleri daha doğru olur.
  - `--no-verify-jwt` gereken fonksiyonların listesi `README.md` ile `docs/2026-11-15-DEVAM-NOTLARI.md` arasında farklı (bkz. 5.6).
  - `public/index.css` kullanılmıyor gibi görünüyor (bkz. 7.2).
