# Wawe Journal — Proje Özeti

Wawe Journal, trader'lar için bir işlem günlüğü (trading journal) uygulamasıdır: işlemleri kaydeder, defterlere (hesaplara) ayırır, istatistik ve grafiklerle analiz eder, prop firm kurallarını takip eder ve cTrader'dan işlem senkronize eder.

Bu belge projeye yeni katılan geliştiriciler için hazırlanmıştır. Gizli bilgi (API anahtarı, şifre, `.env` değeri) içermez; yalnızca bu ayarların **nerede** durduğunu söyler.

> Son güncelleme: Ekim 2026. Bilgiler kod ve `supabase/migrations` taranarak çıkarıldı. Veritabanında migration'da `CREATE TABLE` karşılığı olmayan tablolar **(koddan çıkarım)** diye işaretlendi.

---

## 1. Teknolojiler ve sürümler

### Çatı ve derleme
| Bileşen | Sürüm | Not |
|---|---|---|
| Astro | ^4.16.0 (kurulu 4.16.19) | Statik çıktı, adaptör yok |
| @astrojs/react | ^3.6.3 | React entegrasyonu (şu an hiçbir sayfa React bileşeni kullanmıyor) |
| React / React DOM | ^18.3.1 | |
| esbuild | 0.21.5 (Vite üzerinden dolaylı) | `package.json`'da tanımlı değil, `astro.config.mjs` kullanıyor |
| Node.js | ^18.17.1 \|\| ^20.3.0 \|\| >=21 | Astro'nun gereksinimi (projede `engines` yok) |

`package.json` script'leri: `dev`, `build`, `preview`. Test script'i yok; testler `node --test tests/*.test.js` ile çalışır.

### Tarayıcıda CDN'den yüklenen kütüphaneler
| Kütüphane | Sürüm | Nerede |
|---|---|---|
| @supabase/supabase-js | 2.117.3 | Neredeyse tüm uygulama ve giriş sayfaları |
| ApexCharts | 8.2.0 | dashboard, premium-dashboard, strategies, admin |
| Lightweight Charts | 4.1.3 (standalone) | dashboard, premium-dashboard, backtest |
| SortableJS | 1.15.0 | premium-dashboard (kart sürükle-bırak) |
| Lucide (ikonlar) | 0.441.0 | `BaseHead.astro` (navbar'da `lucide@latest` yedeği var) |
| jsPDF / jspdf-autotable | 2.5.1 / 3.8.2 | İhtiyaç anında yüklenir (`public/src/utils/helpers.js` → `loadJsPDF`) |
| SheetJS (xlsx) | 0.18.5 | Quick Add içe aktarma, ihtiyaç anında |
| Cloudflare Turnstile | v0 | login, register (bot koruması) |

### Backend ve barındırma
- **Supabase**: Postgres + Auth + Storage + Realtime + Edge Functions (Deno).
- **Cloudflare Pages**: `wrangler.toml` (proje `wawe-journal`, çıktı `dist`). Önbellek kuralları `public/_headers` içinde.
- **Ödeme**: NOWPayments (kripto), Edge Function üzerinden.
- **PWA**: `public/sw.js` (service worker, `/admin` önbelleğe alınmaz), `public/site.webmanifest`.

### `astro.config.mjs` özeti
- `site: https://wawejournal.com`, `outDir: dist`.
- `build.format: 'file'` → sayfalar `dashboard.html` gibi üretilir (eski `.html` linkleri çalışsın diye). Cloudflare `/dashboard` adresini de aynı sayfaya yönlendirir.
- Özel entegrasyonlar:
  - `bundleAppScript`: `public/src/script.js` → `public/src/bundle.js` (esbuild, ESM, minify). Hem `dev` hem `build` başında çalışır.
  - `minifyDistAssets`: build sonunda `dist` içindeki tüm `.js`/`.css` dosyalarını küçültür.
- `__WW_BUILD_ID__`: SPA router'ın yeni sürümü fark etmesi için derleme zaman damgası.

### Ortam değişkenleri (yalnızca adlar)
`.env.example` içinde: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_APP_NAME`, haber API'si ayarları vb. Üretim değerleri Cloudflare Pages ortamında tanımlıdır. Edge Function sırları (service role anahtarı, Turnstile sırrı vb.) Supabase'in Deno ortamındadır. İstemci ayarları `public/config.js` ve `public/src/core/config.js` üzerinden okunur.

---

## 2. Klasör yapısı

`node_modules`, `.git` ve `dist` hariç.

```
/
├─ astro.config.mjs        Astro ayarları + özel esbuild entegrasyonları
├─ wrangler.toml           Cloudflare Pages
├─ tsconfig.json           astro/strict, react-jsx
├─ package.json
├─ .env.example            Ortam değişkeni adları
├─ PROJECT_OVERVIEW.md     Bu belge
├─ scripts/                ctrader-probe.ts (cTrader API denemesi)
├─ fix_layout*.cjs, shrink_*.cjs   Tek seferlik yardımcı script'ler
├─ repomix-output.xml      Eski bir kod anlık görüntüsü (referans)
│
├─ src/                    Astro kaynakları (sayfa iskeletleri)
│  ├─ layouts/
│  │  ├─ Layout.astro       Uygulama kabuğu (navbar, SPA, quick-add, prop servisleri)
│  │  └─ PageLayout.astro   Tanıtım sayfaları kabuğu
│  ├─ components/
│  │  ├─ BaseHead.astro     <head>: fontlar, ortak script'ler, tema/plan sınıfları, wwLog, wwPage, SW kaydı
│  │  ├─ Navbar.astro       Sunucuda çizilen navbar (davranış public/components/navbar'da)
│  │  ├─ SpaRouter.astro    Sayfa yenilemeden geçiş (window.wwSpa)
│  │  ├─ UpgradeModal.astro Premium'a yükseltme penceresi
│  │  ├─ QuickAddModal.astro
│  │  └─ QuickAddFAB.tsx, quick-add/*.tsx   React sürümü (kullanılmıyor)
│  └─ pages/                25 sayfa (bkz. bölüm 4)
│
├─ public/                 Tarayıcıya olduğu gibi giden dosyalar (asıl uygulama kodu burada)
│  ├─ config.js            İstemci ayarları (Supabase, cTrader, özellik bayrakları, fiyatlar)
│  ├─ i18n.js              Çeviri motoru (window.i18n)
│  ├─ index-i18n.js        Ana sayfanın kendi çevirileri
│  ├─ cache.js             window.wwCache (SWR önbellek)
│  ├─ sw.js                Service worker
│  ├─ styles.css           Ortak tasarım değişkenleri ve bileşenler
│  ├─ buttons.css, index.css, pages.css, landing-preview.css
│  ├─ robots.txt, sitemap.xml, _headers, site.webmanifest
│  ├─ src/                 Ortak uygulama modülleri → bundle.js (esbuild)
│  │  ├─ script.js          Giriş noktası; modülleri window'a açar
│  │  ├─ bundle.js          Derleme çıktısı (elle düzenlenmez)
│  │  ├─ core/              config, supabase (auth), journal, storage, prop-templates, utils
│  │  ├─ services/          user (plan), payment, stats, prop-service
│  │  ├─ features/          theme, overtrade, notifications, csv-parsers
│  │  └─ utils/             helpers, ui (toast), validation, confirm-dialog, prop-calculator
│  ├─ interface/           Sayfa bazlı JS/CSS
│  │  ├─ dashboard/         dashboard.js, prop-card-v2.js + css
│  │  ├─ premium-dashboard/ ES modülleri: premium-dashboard, dashboard-manager, chart-renderers,
│  │  │                     chart-expand, export-dialog, pdf-report, insights-engine, widget-*, prop-widgets, helpers
│  │  ├─ trades/, calendar/, strategies/, journals/ (css)
│  │  ├─ backtest/          Backtest v2: backtest.js (sayfa), bt-symbols/candles/engine/synthetic/data/store/sync + css (bkz. 5.7)
│  │  ├─ admin/             admin-core, admin-data, admin-dashboard
│  │  ├─ quick-add/         Hızlı işlem ekleme + broker CSV algılama/eşleştirme
│  │  └─ shared/            Tüm sayfaların ortak modülleri (bkz. bölüm 7)
│  ├─ components/          navbar (navbar.js/css, page-transition.js), notification-bell
│  ├─ settings/            settings.js + panels/*.html (7 ayar paneli)
│  ├─ i18n/locales/        tr.js, en.js, de.js
│  ├─ fonts/pdf/           PDF raporuna gömülen DM Sans TTF (+ OFL lisansı)
│  ├─ images/, vendor/
│
├─ supabase/
│  ├─ migrations/          35 SQL migration (2026-08 → 2026-10) + README.md
│  ├─ functions/           Edge Functions (bkz. bölüm 5.6)
│  ├─ tests/               prop_accounts_verify.sql
│  └─ ADMIN_ROLE.md        Admin rolünün nasıl verileceği
│
└─ tests/                  node:test birim testleri (trade-metrics, time-settings, chart-theme,
                           prop-calculator, prop-service, prop-card-v2, insights-engine,
                           bt-symbols/candles/engine/synthetic/store/sync/i18n, trades-source, stats-audit)
```

**Önemli:** Uygulama mantığının büyük kısmı Astro bileşenlerinde değil, `public/` altındaki düz tarayıcı JS dosyalarındadır. Astro sayfaları iskelet HTML'i ve script/CSS bağlantılarını sağlar.

---

## 3. Mimari kısaca

- **Statik site + istemci tarafı veri.** Sunucu kodu yok; tüm veri tarayıcıdan Supabase'e (RLS korumalı) veya Edge Function'lara gider.
- **Sayfa script'leri.** Her uygulama sayfası kendi script'ini `data-page-script` ile yükler. Ortak kod `bundle.js` ve `public/interface/shared/*` içindedir.
- **SPA geçişleri.** `SpaRouter.astro` uygulama sayfaları arasında yalnızca `#app-scroll-container` içeriğini değiştirir. Sayfa script'leri her ziyarette yeniden çalışır. Her sayfa `window.wwPage.current()` ile bir yaşam döngüsü kapsamı alır: `PAGE.on(...)` dinleyicileri ve `PAGE.onLeave(...)` temizlikleri sayfadan çıkınca otomatik kaldırılır. Derleme kimliği değişirse tam yenileme yapılır. HTML 5 dakika önbelleğe alınır.
- **Önbellek.** `window.wwCache` işlem ve strateji listelerini 2 dakika (bellek + sessionStorage) tutar; anahtar kullanıcı + defter + sayfa önekinden oluşur.
- **Çok dillilik.** `tr`, `en`, `de`. `public/i18n.js` yalnızca etkin dili ve İngilizce yedeği yükler. Dil `localStorage.ww_language` içinde tutulur. HTML'de `data-i18n`, `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-html` öznitelikleri kullanılır.

---

## 4. Sayfalar ve route'lar

Sayfalar `/ad.html` olarak üretilir; Cloudflare `/ad` adresini de sunar. Uygulama sayfaları `noindex`'tir.

### Tanıtım sayfaları (herkese açık)
| Route | Dosya | Açıklama |
|---|---|---|
| `/` | `index.astro` | Ana sayfa (landing), kendi fontları ve çevirileri |
| `/about`, `/contact`, `/privacy`, `/terms` | `PageLayout` ile | Bilgi sayfaları |
| `/wawesocial` | `wawesocial.astro` | "Wawe Social" tanıtımı (noindex, veritabanı kullanmaz) |
| `/promo` | `promo.astro` | Bağımsız tanıtım videosu kayıt sayfası (noindex) |

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
| `/dashboard` | `interface/dashboard/js/dashboard.js`, `prop-card-v2.js` | Ana dashboard: KPI'lar, kümülatif K/Z, günlük K/Z, sembol, win/loss, performans kartı |
| `/premium-dashboard` | `interface/premium-dashboard/js/premium-dashboard.js` (modül) | "Analytics": özelleştirilebilir kart düzeni, içgörüler, PDF raporu |
| `/trades` | `interface/trades/js/trades.js` | İşlem listesi, düzenleme/silme |
| `/calendar` | `interface/calendar/js/calendar.js` | K/Z takvimi |
| `/strategies` | `interface/strategies/js/strategies.js` | Strateji analizi ve karşılaştırma |
| `/journals` | sayfa içi script | Defterler (hesaplar), prop hesapları, cTrader bağlantısı |
| `/add-trade` | sayfa içi script | İşlem ekleme formu ve toplu içe aktarma |
| `/backtest` | `interface/backtest/js/backtest.js` | Backtest v2: mum mum replay, sanal hesaplar (giriş yapmış herkese açık, pratik modu, sentetik veri). Bkz. 5.7 |
| `/my-earnings` | sayfa içi script | Referans/influencer kazançları ve ödeme talepleri |
| `/settings` | `settings/js/settings.js` | Profil, plan, tema, dil, saat ayarları vb. |
| `/report-bug` | sayfa içi script | Hata bildirimi ve destek talepleri |
| `/admin` | `interface/admin/js/admin-*.js` | Yönetim paneli (yalnızca admin) |

### Diğer
| Route | Açıklama |
|---|---|
| `/ctrader-callback` | cTrader OAuth dönüş sayfası (SPA dışı) |
| `/quick-add-modal` | Quick Add önizleme sayfası (var olmayan `/js/quick-modal.js` dosyasını yüklüyor, eski kalıntı) |

Özel 404 sayfası ve yönlendirme dosyası yok. `sitemap.xml` statiktir (yalnızca tanıtım sayfaları). `robots.txt` admin, ayarlar ve giriş sayfalarını engeller.

---

## 5. Veritabanı şeması (Supabase / Postgres)

**Not:** Çekirdek tablolar (`user_profiles`, `journals`, `trades`, `strategies`, `references`) Supabase panelinden oluşturulmuştur; repoda `CREATE TABLE` karşılıkları yoktur. Migration'lar bu tablolara sütun, indeks ve RLS ekler (bkz. `supabase/migrations/README.md`). Aşağıdaki sütun listeleri migration'lardan ve istemci kodundan derlenmiştir.

### 5.1 İlişki şeması

```
auth.users (Supabase Auth)
   │ 1:1  (trigger handle_new_user → profil + varsayılan "Ana Hesap" defteri)
   ▼
user_profiles ──┐
   │ 1:N        │ 1:N
   ▼            ▼
journals      payments, payout_requests, partner_applications, notifications,
(defterler)   bug_reports, referral_codes (influencer olarak)
   │ 1:N  ─────────────┬───────────────────┬──────────────────┐
   ▼                   ▼                   ▼                  ▼
trades ──N:1──► strategies        prop_accounts      ctrader_accounts
(işlemler)      (journal_id ile    (defter başına      (defter başına en fazla
                 deftere bağlı)     en fazla 1 aktif)    1 cTrader hesabı)
```

Her tabloda `user_id` sahiplik alanıdır ve RLS politikaları `user_id = auth.uid() OR is_admin()` kalıbını izler.

### 5.2 Kullanıcı ve defterler

**`user_profiles`** — PK `id` = `auth.users.id`
- Alanlar: `email`, `username`, `avatar_url`, `plan` (`'free'` / `'premium'`), `plan_expires_at`, `role` (yalnızca gösterim için), `is_active`, `max_journals` (varsayılan 2), `last_active`, `created_at`, `preferred_currency`, `onboarding_completed`, `onboarding_tour_completed`, `btc_payout_address`, `ltc_payout_address`.
- `protect_user_profile_privileges` trigger'ı istemcinin `plan`, `plan_expires_at`, `role` ve `is_active` alanlarını değiştirmesini engeller (yalnızca service role değiştirebilir).
- Realtime yayınında.

**`journals`** (defterler / hesaplar)
- Alanlar: `id` (uuid), `user_id`, `name` (en fazla 60 karakter), `description`, `color` (varsayılan `#7c6dfa`), `icon` (Lucide ikon adı, varsayılan `folder`), `is_default`, `is_active`, `created_at`.
- Eski bağlantı/prop alanları: `platform`, `is_connected`, `connection_status`, `last_synced_at`, `is_prop_firm`, `prop_firm_rules` (jsonb), `prop_firm_status`, `prop_firm_stats` (jsonb). Yeni prop takibi `prop_accounts` tablosundadır.
- İndeks: `(user_id, is_active)`.
- Kota: ücretsiz planda `max_journals` (2), aktif premium'da en az 10.
- RPC'ler: `create_journal`, `list_journals` (işlem sayısı, strateji sayısı, toplam K/Z, win rate, son işlem tarihi ve `can_create` ile döner). Kodda kullanılan ama migration'da olmayanlar: `update_journal`, `delete_journal`, `switch_default_journal`, `get_journal`.
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
| `trade_date`, `exit_date` | `exit_date`'i yalnızca cTrader senkronu yazar |
| `notes`, `is_quick_entry` | |
| `import_hash`, `platform_source`, `position_id`, `last_deal_id` | İçe aktarma ve cTrader senkronu için |

- Tekillik: `UNIQUE (user_id, journal_id, import_hash)` (CSV ve cTrader içe aktarmalarında çift kaydı önler).
- İndeksler: `(user_id, journal_id, trade_date desc)`, `(user_id, trade_date desc)`, `(strategy_id) WHERE strategy_id IS NOT NULL`.
- Görsel veya ekran görüntüsü sütunu yoktur.
- K/Z, win rate, drawdown gibi tüm hesaplar tek kaynaktan yapılır: `public/interface/shared/trade-metrics.js` (`window.WwMetrics`, testli).

**`strategies`** — `id`, `user_id`, `journal_id`, `name`, `description`, `color`, `is_active`, `created_at`. İndeks `(user_id, is_active)`. İşlemlere `trades.strategy_id` ile bağlanır.

**`backtest_trades`** (eski backtest tablosu) — Migration 01 ile silinir. Yerine `backtest_accounts` ve `backtest_account_trades` gelir (bkz. 5.7).

### 5.4 Prop firm ve cTrader (defterlere bağlı)

**`prop_accounts`**
- Alanlar: `id`, `user_id`, `journal_id` (→ `journals`, ON DELETE CASCADE), `template_key`, `template_version`, `rules` (jsonb, en fazla 20 KB), `starting_balance` (> 0), `start_date`, `phase_index`, `reset_tz`, `time_shift_hours` (-14…14), `is_active`, `created_at`, `updated_at`.
- Defter başına en fazla bir aktif prop hesabı (kısmi unique indeks).
- `check_prop_account_limit` trigger'ı sahipliği ve kotayı (ücretsiz 1, premium 10) denetler.
- Kurallar ve şablonlar: `public/src/core/prop-templates.js`. Hesaplama: `public/src/utils/prop-calculator.js`, `public/src/services/prop-service.js`.

**`ctrader_tokens`** — PK `user_id`. Token alanları ve `status` (`active` / `needs_reconnect`). RLS açık ama politika yok, yani yalnızca service role (Edge Function) erişir.

**`ctrader_accounts`** — `ctid_trader_account_id`, `is_live`, `trader_login`, `broker_name`, `journal_id` (→ `journals`, ON DELETE SET NULL, dolu olduğunda tekil), `last_sync_at`, `last_deal_timestamp` (senkron imleci), `syncing_since`, `last_error`, `balance`, `balance_currency`, `balance_updated_at`. Defter değişince imleci sıfırlayan trigger var. RPC'ler: `get_ctrader_status`, `link_ctrader_account`, `unlink_ctrader_account`, `disconnect_ctrader`.

### 5.5 Ödemeler, kazançlar, bildirimler, destek

| Tablo | Amaç / önemli alanlar |
|---|---|
| `payments` | NOWPayments faturaları: `invoice_id`, `order_id`, `amount`, `currency`, `plan_type`, `payment_status`, `referral_code`… `process_payment_finished` RPC'si (yalnızca service role) planı uzatır ve referans komisyonunu işler. |
| `referral_codes` | `code` (büyük harf), `discount_percent`, `influencer_user_id`, `commission_rate`, `commission_rate_yearly`, kullanım sayaçları, `max_usage`, `expires_at`, `is_active`. |
| `payout_requests` | Influencer ödeme talepleri: `amount` (≥ 20), `currency` (LTC/BTC), `payout_address`, `status`, `admin_note`. Ekleme yalnızca RPC ile. |
| `partner_applications` | Influencer başvuruları. Ekleme yalnızca RPC ile. |
| `notifications` | `type`, `title_key`, `message_key` (i18n anahtarları), `meta_data` (jsonb), `is_read`. Navbar Realtime ile dinler. |
| `bug_reports`, `support_bans` | Destek talepleri ve destek yasakları. |
| `system_settings` | `key` (PK), `value` (jsonb): fiyatlar, ödeme ayarları, destek durumu. Yalnızca admin. |
| `references` | Ana sayfadaki kullanıcı yorumları (aktif olanlar herkese açık okunur). |
| `login_attempts` | Giriş/kayıt hız sınırı kayıtları (yalnızca service role). |
| `dev_test_config`, `dev_test_access`, `dev_test_attempts` | 1$'lık test planı modu (kod bcrypt ile saklanır). |

Kazanç sayfası RPC'leri: `get_influencer_earnings`, `get_influencer_payout_summary`, `submit_payout_request`, `save_payout_addresses`, `submit_partner_application`, `get_my_partner_application`. Diğerleri: `validate_referral_code`, `get_prices` / `set_prices`, `get_platform_stats` (ana sayfa sayaçları, anonim), `deactivate_own_account`, `reset_user_data`, `complete_user_onboarding`, `get_unread_notifications_count`, `mark_notification(s)_as_read`, admin RPC'leri.

**Storage bucket'ları:** `avatars` (dosya adı `<uid>_` ile başlamalı), `references-images`, `bug-reports`.

### 5.6 Edge Functions (`supabase/functions/`)
| Fonksiyon | Görev |
|---|---|
| `verify-auth` | Giriş ve kayıt: Turnstile doğrulaması, hız sınırı (`login_attempts`), hesap aktiflik kontrolü |
| `create-payment` | NOWPayments faturası oluşturur (referans kodu, fiyatlar, test modu) |
| `nowpayment-webhook` | Ödeme tamamlanınca planı işler ve bildirim gönderir |
| `ctrader-connect` | cTrader OAuth kod değişimi; token ve hesapları kaydeder |
| `ctrader-sync` | cTrader işlemlerini `trades` tablosuna aktarır (`import_hash = ctrader:<hesap>:<dealId>`), bakiyeyi günceller |
| `get-candles` | Eski backtest için mum verisi. **Repodan silindi**; canlıdaki kopyası hâlâ duruyor, silinmesi ayrı bir adım (canlı yazma). |

### 5.7 Backtest v2

**Durum (2026-10-21):** Üretimde (master). Migration 00, 01, 02, 04, 05 ve 08 canlıda çalıştı, `BACKEND = 'supabase'`. **Faz 1, pratik modu:** sayfa giriş yapmış tüm kullanıcılara açık; mumlar sentetiktir, hesaplar ve işlemler kullanıcının hesabında (Supabase) saklanır. cTrader veri kaynağı bir sonraki turdadır.

**Sayfa ve kütüphaneler (`public/interface/backtest/`):**
| Dosya | Görev |
|---|---|
| `js/backtest.js` | Sayfa denetleyicisi: hesap listesi, oluştur/düzenle/sil/sıfırla, replay, emir paneli, grafik (Lightweight Charts), istatistikler, tarihe git, tr/en/de |
| `js/bt-symbols.js`, `bt-candles.js` | Sembol tablosu (pip, basamak, lot), mum birleştirme ve zaman dilimi |
| `js/bt-engine.js` | Tamsayı tabanlı işlem motoru: spread, SL/TP, komisyon (gidiş-dönüş, kapanışta), aynı mumda SL ve TP birlikte vurursa SL öncelikli |
| `js/bt-synthetic.js`, `bt-data.js` | Tarayıcıda deterministik sentetik mum üretimi ("Sentetik veri, gerçek piyasa verisi değildir" etiketi: grafikte ve hesap kartında) |
| `js/bt-store.js` | `SupabaseStore` (üretim) ve yalnızca duman testleri için `LocalStore`; veritabanıyla aynı satır biçimi ve kurallar (kota, kilitler, geri gitme yasağı, `data_source`) |
| `js/bt-sync.js` | Kapanan işlemleri bağlı deftere `platform_source = 'backtest'` olarak yazar; bağlantı değişince kopyaları siler |
| `css/backtest.css` | Tam ekran düzen: grafik kalan alanı kaplar, sağda 320–360px yan panel (bakiye ve emir), altta kendi içinde kayan işlem tabloları; 1024px altında alt alta |

**Erişim:** giriş yapmış herkes (admin kapısı Faz 1'de kalktı); navbar linki herkese görünür. Sayfadaki kapı yalnızca görünürlüktür (`WwBtGate`: anon, demo, member), izinleri veritabanı belirler (RLS, kota: ücretsiz 1, premium 10 aktif hesap). **Veri kaynağı:** hesap açarken seçilir, sonradan değişmez (`backtest_accounts.data_source`). Şimdilik yalnızca `synthetic`; `ctrader` seçeneği arayüzde "Yakında" etiketiyle pasif görünür. Sentetik hesaplar defterlere bağlanamaz (veritabanı CHECK'i, arayüzde defter seçimi gizli). Arşiv ve gerçek veri (Migration 03 ve 07, lisans kararı) Faz E'dedir.

**Veritabanı:** migration'lar `supabase/migrations/202610180NNN_*.sql` (geri alma dosyaları depoda yok). Elle, SQL Editor'da, sırayla çalıştırılır (`supabase db push` kullanılmaz):
| No | Ne yapar |
|---|---|
| 00 | `evaluate_prop_firm_rules(uuid)` açığını kapatır: anon erişimi kalkar, sahiplik kontrolü gelir (admin ve service role geçer) |
| 01 | Eski `backtest_trades` tablosunu siler (satır varsa durur), `reset_user_data()` eski bloğu çıkarır |
| 02 | `backtest_accounts` ve `backtest_account_trades`, RLS, kota ve kilit tetikleyicileri |
| 03 | `candles` Storage bucket'ı, yalnızca admin okur (Faz E) |
| 04 | Hesap bağlantısı değişince/silinince defterdeki backtest kopyalarını temizler |
| 05 | `list_journals()` ve `get_platform_stats()` backtest satırlarını saymaz |
| 06 | Kullanılmayan 6 fonksiyonu siler (isteğe bağlı, bu turda çalıştırılmadı) |
| 07 | Arşivi tüm üyelere açar; lisans onay satırı açılmadan çalışmaz (Faz E) |
| 08 | `backtest_accounts.data_source` (`synthetic`; `ctrader` sonraki tur), sentetik hesap deftere bağlanamaz (CHECK), alan değiştirilemez (tetikleyici). Önkoşul: bağlı hesap kalmamış olmalı |

**İstatistiklerden yalıtım:** Backtest işlemleri günlüğe yalnızca `trades.platform_source = 'backtest'` ile gider. Tüm okuyucular (dashboard, premium dashboard, takvim, stratejiler, defterler) canlı kapsamı okur (`public/interface/shared/trades-source.js`); işlemler sayfasında Tümü / Canlı / Backtest seçici ve "Backtest" rozeti vardır.

**Test araçları:** `node --test tests/*.test.js` (312 test).

---

## 6. Kimlik doğrulama

Supabase Auth kullanılır. Oturum, Supabase JS'nin varsayılanıyla `localStorage` içinde (`sb-*-auth-token`) tutulur.

- **Giriş (`/login`).** E-posta ve şifre tarayıcıdan doğrudan Supabase'e değil, `verify-auth` Edge Function'ına gönderilir. Fonksiyon şunları yapar: Turnstile doğrulaması; hız sınırı (15 dakikada IP başına 10, e-posta başına 30 başarısız deneme); `signInWithPassword`; `is_active` kontrolü. İstemci dönen token'larla `auth.setSession()` çağırıp `/dashboard`'a gider. **Google ile giriş** `signInWithOAuth({ provider: 'google' })` ile yapılır.
- **Kayıt (`/register`).** Aynı fonksiyonda `action: 'register'` ile yapılır: kullanıcı adı ve e-posta tekilliği kontrol edilir, ardından `signUp` çağrılır. **E-posta otomatik onaylanır**, yani ayrı bir doğrulama adımı yoktur. Profil ve varsayılan defter `handle_new_user` trigger'ı ile oluşur.
- **Şifre sıfırlama.** `/forgot-password` → `resetPasswordForEmail` → e-postadaki link `/update-password`'a gelir → `auth.updateUser({ password })` (en az 6 karakter).
- **Sayfa koruması.** Rota düzeyinde sunucu koruması yoktur; her sayfa script'i açılışta `requireAuth()` çağırır (`public/src/core/supabase.js`, `bundle.js` ile global). Oturum yoksa `/login`'e yönlendirir. Profil 3 dakika önbelleğe alınır. `is_active = false` ise kullanıcıyı çıkış yaptırır. Asıl güvenlik veritabanındaki **RLS** politikalarıdır (`202608190001_security_baseline.sql` ve sonraki güvenlik migration'ları).
- **Premium.** Plan kaynağı `user_profiles.plan = 'premium'` ve geleceğe ait (veya boş) bir `plan_expires_at`'tir. Fonksiyonlar `public/src/services/user.js` içinde: `getUserPlan`, `isPremium`, `hasFeature`, `requirePremium`. Plan sessionStorage'da 5 dakika tutulur. `BaseHead` sayfa çizilmeden `is-premium` sınıfını ekler (yükseltme butonları yanıp sönmesin diye). Ödeme penceresi `UpgradeModal.astro`'dur.
- **Admin.** Ölçüt `auth.users.raw_app_meta_data.role = 'admin'` (JWT'de `app_metadata.role`). Veritabanında `public.is_admin()` bunu okur. İstemcide `isAdmin()` / `requireAdmin()` kullanılır. Rolün nasıl verileceği `supabase/ADMIN_ROLE.md` dosyasında anlatılır. `user_profiles.role` yalnızca gösterim içindir.
- **Çıkış.** Navbar'daki çıkış butonu `signOut` çağırır, plan/avatar/aktif defter önbelleklerini temizler ve ana sayfaya döner.
- **cTrader OAuth.** `/journals` sayfası kullanıcıyı cTrader yetkilendirme sayfasına gönderir. `/ctrader-callback` dönen kodu oturum token'ı ile `ctrader-connect`'e iletir. Hedef defter seçiliyse `link_ctrader_account` ve ardından `ctrader-sync` çağrılır.

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
| `--border` | `rgba(123,110,246,.12)` | `#e2e2ea` |
| `--border2` | `rgba(123,110,246,.2)` | — |
| `--accent` / `--accent2` / `--accent3` | `#8b5cf6` / `#c084fc` / `#a78bfa` | `#6c5ce7` / `#6b5bd6` / `#c084fc` |
| `--green` | `#22c55e` | `#10b981` |
| `--red` | `#ef4444` | `#dc2626` |
| `--yellow` | `#fbbf24` | `#d97706` |
| `--text` | `#f1f1f8` | `#0f172a` |
| `--muted` | `#a0a0b8` | `#64748b` |

- Diğer değişkenler: `--cyan`, `--pink`, `-bg` ve `-glow` türevleri, `--gradient-accent`.
- Köşe yarıçapları: `--radius` 12px, `--radius-sm` 8px, `--radius-lg` 20px.
- z-index ölçeği: `--z-dropdown` 300, `--z-popover` 500, `--z-fab` 999, `--z-modal-overlay` 1000, `--z-toast` 9999 vb.
- Ortam ışığı: `--ambient-*` değişkenleri, `[data-ambient-state=profit|loss|neutral]` ile değişir.

**Güncel kural — grafik ve modallar:** Koyu temada grafikler, tooltip'ler ve modallar temanın morumsu yüzeylerini değil **saf siyah (`#000`)** zemin ve nötr beyaz çizgiler (`rgba(255,255,255,0.05–0.1)`) kullanır. Açık temada beyazdır. Bu kural şu dosyalarda uygulanıyor: `shared/chart-theme.css`, `dashboard.css`, `premium-dashboard.css`, `strategies.css`, `quick-add.css`, `navbar.css`, `buttons.css`. Yeni bir modal veya grafik eklerken bu kurala uyulmalıdır.

**Tema anahtarları (localStorage):**
- `ww_theme`: açık / koyu tema.
- `ww_custom_theme`: premium'a özel özel koyu tema; hazır ayarlar `public/src/features/theme.js` içinde.
- Diğerleri: `ww_font_size`, `ww_ambient_mode`, `ww_language`, `ww_time_settings`.

`BaseHead` temayı, planı ve dili sayfa çizilmeden önce `<html>` öğesine uygular; böylece ekran yanıp sönmez.

### 7.2 Fontlar
| Font | Kullanım |
|---|---|
| **DM Sans** | Gövde metni ve tüm grafik metinleri, rakamlar (`font-variant-numeric: tabular-nums`). PDF raporuna da gömülür (`public/fonts/pdf`). |
| **Syne** | Başlıklar (navbar, dashboard, takvim, defterler, ayarlar) |
| **JetBrains Mono** | Bazı sayısal alanlar (kimlik doğrulama sayfaları, prop kartı, defterler) |
| Geist / Geist Mono | Tanıtım sayfaları |
| Space Grotesk | Kimlik doğrulama sayfaları |

**Not:** `DM Mono` ve `Inter` bazı CSS dosyalarında geçiyor ama hiçbir yerde yüklenmiyor; tarayıcı sistem fontuna düşüyor. Grafiklerde artık kullanılmıyorlar.

### 7.3 Ortak bileşen ve modüller

| Bileşen | Nerede | Ne yapar |
|---|---|---|
| Navbar | `src/components/Navbar.astro` + `public/components/navbar/` | Menü, defter seçici, bildirim zili, plan rozeti, çıkış |
| Toast | `public/src/utils/ui.js` → `showToast(msg, type)` | Kısa bildirim |
| Onay penceresi | `public/src/utils/confirm-dialog.js` | Onay/iptal soruları |
| Modal, iskelet, boş durum | `styles.css` (`.modal-overlay`/`.modal-box`, `.skeleton*`, `.empty-state`) | Ortak CSS sınıfları |
| Quick Add | `public/interface/quick-add/` | Hızlı işlem ekleme; broker CSV/XLSX algılama ve eşleştirme |
| Yükseltme penceresi | `src/components/UpgradeModal.astro` | Premium'a geçiş |
| **`WwChart`** | `public/interface/shared/chart-theme.js` + `.css` | Tüm grafiklerin ortak görünümü: `apex(opts)`, `lwc(opts)`, `axisLabels()`, `barSize()`, `colors()`, `tipHtml()` (ortak siyah tooltip kartı `.ww-tip`) |
| **`WwChartViewer`** | `public/interface/shared/chart-viewer.js` | Grafiğe tıklayınca açılan büyütme penceresi: önceki/sonraki gezinme, Esc ile kapatma |
| **`WwMetrics`** | `public/interface/shared/trade-metrics.js` | K/Z, win rate, profit factor, drawdown, seriler, Sharpe, R:R. Tek doğruluk kaynağı, testli. |
| **`WwTime`** | `public/interface/shared/time-settings.js` | Saat dilimi ve gün başlangıcı ayarı; gün anahtarları, tarih biçimleri |
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

- **Kurulum:** `npm install` → `npm run dev`. `bundle.js` dev ve build başında otomatik üretilir.
- **Testler:** `node --test tests/*.test.js` (tarayıcı modülleri `vm` ile yüklenir).
- **Astro geliştirme araç çubuğu kapalı** (`astro.config.mjs` → `devToolbar.enabled = false`): localhost'ta alt paneldeki tabloların üstünü kapatıyordu.
- **Önbellek kırma:** Sayfa CSS/JS bağlantıları `?v=<sayı>` parametresi taşır. Bir dosyayı değiştirince ilgili `.astro` sayfasındaki sayıyı artır. Premium-dashboard alt modülleri sürüm parametresi almaz; tarayıcı eski sürümü tutabilir.
- **Bilinen sorunlar ve tutarsızlıklar:**
  - `src/components/quick-add/QuickAddModal.tsx` (React, kullanılmıyor) işlemi `journal_id` olmadan ekler.
  - `quick-add-modal.astro`, var olmayan bir script'e bağlanıyor.
  - Özel tema kaydında anahtar uyuşmazlığı var: `theme.js` ile `BaseHead`'in okuduğu adlar farklı.
  - `report-bug.astro`'nun `system_settings`'e yedek yazması admin-only RLS yüzünden başarısız olur.
  - İstemci tarafı admin kontrolünde (`admin-core.js`) `user_metadata.role` yedeği var. Bu alanı kullanıcı kendisi değiştirebilir; asıl yetki RLS'te.
  - Bazı istemci ayarları (Supabase genel anahtarı vb.) ortam değişkeni yoksa kodda yedek değer olarak duruyor. Bunlar herkese açık türden anahtarlar olsa da tek bir yerden (`config.js`) yönetilmeleri daha doğru olur.
  - `DM Mono` ve `Inter` fontları yüklenmeden kullanılıyor (bkz. 7.2).
