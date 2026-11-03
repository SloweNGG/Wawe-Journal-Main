# Temizlik envanteri (chore/cleanup)

Kaynak: `fix/ux-bugs` (30f86ca). Amaç yalnızca fazlalık temizliği: davranış ve görünüm değişmez. Her silme bu listede kanıtıyla
yer alır; kanıtlanamayanlar **emin değilim** başlığında ve silinmedi.

## Yöntem (nasıl arandı)

- **Dosyalar:** `git ls-files` içindeki her `public/`, `src/components|layouts` dosyası için şu kaynaklarda arama: tüm `.astro`,
  `.html`, `.js/.mjs`, `.ts/.tsx`, `.css`, `.json`, `site.webmanifest`, `.xml` (sitemap), `.sql`, `.toml`, `.py`, `_headers`,
  `_redirects`, `sw.js`, `astro.config.mjs`, `scripts/`, `tests/`, `supabase/` (Edge Function + migration). Görsel / font için tam yol
  (`/images/x/y.webp`) **ya da** sınırlı dosya adı (`(^|[^a-z0-9_-])y.webp($|[^a-z0-9_.-])`) — `analytics.webp`'nin
  `screen-analytics.webp` içinde "bulunması" gibi yanlış eşleşmeler elendi. Kod için ayrıca `import … from '…ad'` / `import('…ad')`.
- **Dinamik yollar:** `'/images/…/' + …`, `` `…/images/…${…}` ``, `… + '.webp|.png|.svg|.jpg'` kalıpları tüm kaynakta arandı:
  uygulamada görsel adı birleştiren yer **yok** (yalnızca demo/test araçlarının ekran görüntüsü adları ve hata raporunun yükleme adı).
  Görsel klasörlerinin yolu geçen her yer okundu (`journals.astro:393`, `prop-templates.js:605`, `analytics.astro:374` …): hepsi sabit tam yol.
- **i18n anahtarları:** üç dil dosyasındaki 2.388 anahtarın her biri, sınırlı eşleşmeyle kaynakta (şablonlar, `data-i18n*`
  nitelikleri, JS, Edge Function `.ts`, migration `.sql`) arandı. `'önek.' + x` ve `` `önek.${x}` `` biçimindeki **dinamik önekler**
  çıkarıldı (63 önek, ör. `backtest.look.style_`, `journal.err_`); böyle bir önekle başlayan anahtar silinmedi.
- **Export'lar:** `public/src/**` (bundle.js kaynağı) içindeki her export adı, kendi dosyası ve `script.js` (içe aktarıp `window`'a
  açar) dışında tüm kaynakta (satır içi `onclick`'ler dahil) arandı.
- **Tekrarlar:** tüm `public/`, `src/` JS ve `.astro` satır içi betiklerinde fonksiyon gövdeleri (yorum ve boşluk atılmış) özetlenip
  karşılaştırıldı: 44 birebir tekrar grubu.
- **Yorum / debug:** ≥ 4 ardışık `//` kod satırı (`;`, `{`, `}` ile biten) arandı; doğrudan `console.log` çağrıları sayıldı.

## a) Hiçbir yerden kullanılmayan dosyalar — SİLİNECEK

| Dosya(lar) | Ne | Kanıt |
|---|---|---|
| `public/images/brand/hero-scene.webp` (136 KB), `hero-scene-mobile.webp` (43 KB) | eski landing hero görseli | landing `hero-peak.webp` kullanıyor (`landing-glass.css:89,330`); `.hero-scene` yalnızca CSS sınıf adı, dosya adı hiçbir yerde yok |
| `public/images/landing/analytics.webp`, `backtest.webp`, `dashboard.webp`, `strategies.webp` (203 KB) | eski ekran görüntüleri | `85e0c33` sonrası landing ve yükseltme penceresi `screen-*.webp` kullanıyor; sınırlı adla hiçbir yerde yok |
| `public/images/platforms/` 16 dosya: `binance.svg`, `bybit.png`, `bybit_icon.png`, `ctrader.png`, `ibkr.png`, `ibkr_icon.png`, `ibkr_mark.png`, `mt4_official.png`, `mt5_official.png`, `mt5_small.png`, `oanda.png`, `oanda_circle.png`, `oanda_icon.png`, `tradingview.svg`, `xtb.png`, `xtb_icon.png` (104 KB) | eski / alternatif platform logoları | kullanılan logolar (`excel.svg`, `ctrader_icon.png` …) tam yolla yazılmış; bu 16'sı hiçbir yerde yok, birleştirme kalıbı yok |
| `public/images/props/` 14 dosya: `ftmo-card.svg`, `ftmo.png`, `ftmo.svg`, `fundednext.png`, `fundednext.svg`, `fundingpips.svg`, `real-alpha.png`, `real-apex.png`, `real-e8.png`, `real-ftmo.png`, `real-fundednext.png`, `real-fundingpips.png`, `real-the5ers.png`, `real-topstep.png` (96 KB) | eski prop firma logoları | `getPropFirmInfo` (`prop-templates.js`) yalnızca `*-symbol.svg` / `custom*.svg` tam yollarını döndürüyor; bunlar hiçbir yerde yok |
| `src/components/QuickAddFAB.tsx`, `src/components/QuickAddModal.astro`, `src/components/quick-add/QuickAdd.tsx`, `QuickAddModal.tsx`, `QuickAddModal.module.css` | React / Astro Hızlı Ekle denemesi | hiçbir sayfa / layout içe aktarmıyor; `QuickAddModal.astro` kendini içe aktarıyor; zincirin kökü `QuickAdd.tsx` hiçbir yerden alınmıyor. Uygulama `public/interface/quick-add/` kullanıyor (Parça 2'de de "ölü kod" diye not edilmişti) |
| `public/components/notification-bell/css/notification-bell.css`, `js/notification-bell.js`, `public/notification-bell.html` | eski bildirim zili bileşeni | hiçbir sayfa yüklemiyor / bağlantı vermiyor; uygulamanın zili `navbar.js` içinde |
| `public/src/core/utils.js` | eski yardımcılar | hiçbir modül içe aktarmıyor (bundle'a girmiyor) |
| `public/src/features/notifications.js` | eski bildirim yöneticisi (`NotificationManager`, `#notifBell` arayüzü) | bkz. b) — `window.notificationManager` hiçbir yerde oluşturulmuyor; tek canlı parçası `NOTIFICATION_TYPES` yeniden dışa aktarımı, `script.js` onu `core/config.js`'ten alacak |
| `public/interface/quick-add/js/test-broker-formats.html` | broker biçimi deneme sayfası (geliştirici) | uygulamada bağlantı yok; yalnızca `tests/cache-headers.test.js` istisna listesinde (o satır da kaldırılacak) |

## b) Kullanılmayan fonksiyon / export / anahtar — SİLİNECEK

| Ne | Nerede | Kanıt |
|---|---|---|
| `requireAuthSilent`, `requireAdmin` | `public/src/core/supabase.js` (+ `script.js` import / `window.`) | hiç çağrılmıyor (satır içi dahil); kimlik doğrulama kodunun yalnızca bu iki ölü fonksiyonu silinir, `requireAuth` ve diğerleri dokunulmaz |
| `uploadReferenceImage`, `loadReferencesToPage` | `public/src/services/stats.js` | hiç çağrılmıyor; admin kendi yüklemesini kullanıyor (`admin-data.js`), `#references-grid` hiçbir sayfada yok |
| `calculateStrategyPerformance` | `public/src/services/user.js` | hiç çağrılmıyor |
| `directionBadge` | `public/src/utils/ui.js` | hiç çağrılmıyor |
| `NotificationManager`, `updateNotificationUI`, `dismissNotification`, `clearAllNotifications`, `toggleNotificationPanel`, `getTimeAgoSimple` | `public/src/features/notifications.js` | hiç çağrılmıyor; çağrılsalar tanımsız `window.notificationManager` yüzünden hata verirlerdi; kullandıkları `#notifBadge/#notifBell/#notifPanel` yalnızca ölü `notification-bell.html`'de |
| `window.testSendNotification` | `public/components/navbar/navbar.js:974` | konsoldan deneme bildirimi yazan debug yardımcısı; hiçbir yerden çağrılmıyor |
| 311 i18n anahtarı (TR / EN / DE; 306 + silinen ölü dosyaların tek kullandığı 5: `nav.clear_all`, `nav.confirm_clear_all`, `references.empty`, `references.error`, `toast.upload_error`) | `public/i18n/locales/*.js` | sınırlı eşleşmeyle kaynakta yok, dinamik önekle başlamıyor. Gruplar: plans 45, backtest 44, settings 38, register 21, dashboard 19, login 13, earnings 13, analytics_dash 12, addtrade 11, hero 10, journal 10, feature 8, prop 8, footer 7, onboarding 7, overtrade 6, language 5, stats 4, trades 4, features 3, references 3, cta 3, admin 3, strategies 3, calendar 3, nav 1 (`nav.pro_features`), `quotes`, `quote_authors` (diziler). Tam liste commit mesajında / betikte |

## c) Tekrar eden kod

**Birleştirilecek (birebir aynı):**

| Ne | Nerede | Nasıl |
|---|---|---|
| `_t(key, fallback)` — 6 birebir kopya | `interface/analytics/js/{analytics, chart-renderers, dashboard-manager, widget-prefs, widget-customizer, prop-widgets}.js` | yeni `interface/analytics/js/i18n-t.js` (tek export `_t`, aynı gövde), 6 modül içe aktarır. ES modül içe aktarımı derlemede `?v=` alır |

**Birleştirilmedi — davranış farkı var:**

- `_t` — `helpers.js` sürümü `(key, params)` ve çeviri yoksa kendi `_EMPTY_FALLBACKS` sözlüğü; `export-dialog.js` / `pdf-report.js`
  sürümü yedek verilmezse `undefined` döndürür (A sürümü anahtarı döndürür). Üçü farklı.
- `sanitizeHTML` — 2 farklı uygulama: `navbar.js`, `analytics/helpers.js`, `calendar.js`, `strategies.js` (97 kr, bir sürüm) ve
  `dashboard.js`, `trades.js` (172 kr, başka sürüm).
- `withAlpha` (`bt-draw.js`) ↔ `hexA` (`bt-stats.js`): gövde aynı, adlar farklı; birleştirmek ad değişikliği gerektirir.

**Birleştirilmedi — birebir aynı ama ayrı klasik betik / satır içi betikte (ortak dosya + yükleme sırası değişikliği gerekir):**

- login / register / forgot-password satır içi betikleri: `toast`, `handleUrlParams`, `getSupabase` (3×), `checkExistingSession`,
  `ensureTurnstileRender`, `getTurnstileToken`, `resetTurnstile`, `afterAuthUrl`, `capturePlanIntent`, `validateEmail` (3×) —
  **kimlik doğrulama kodu**, dokunulmadı.
- `createManualFAB` (`calendar.astro`, `trades.astro`): Hızlı Ekle önyükleyicisi yüklenemezse çıkan yedek buton; kaldırmak hata
  durumundaki davranışı değiştirir.
- `localizePhaseName` (`analytics.astro`, `dashboard.astro`), `escapeHtml` (`analytics.astro`, `dashboard.astro`, `journals.astro`),
  `updateLanguageUI` (`PageLayout.astro`, `index.astro`): sayfa içi betikler.
- `revealIn`, `formatCurrency`, `sanitizeHTML` (`dashboard.js` ↔ `trades.js`), `downloadBlob` (`calendar.js` ↔ `strategies.js`),
  `getDayNames` (`calendar.js` ↔ `dashboard.js`), `fmt` / `iso` (`ww-date-picker.js` ↔ `ww-range-picker.js` ↔ `bt-range.js`),
  `esc` (`export-dialog.js` ↔ `chart-theme.js`): ayrı klasik sayfa betikleri / IIFE'ler; ortak bir dosyaya almak yeni betik etiketi ve
  sıralama gerektirir.

## d) Yorum hâline getirilmiş kod, debug, console.log

- ≥ 4 satırlık yorum hâline getirilmiş kod bloğu: **bulunamadı**.
- Doğrudan `console.log` (7): silinecek 6 debug satırı — `navbar.js` 612, 626, 762, 996 (bildirim debug'ı; 996 `testSendNotification`
  ile gider), `features/csv-parsers.js:128`, `quick-add.js:250` ("yüklendi" mesajları). Kalan: `navbar.js:2545` (`showToast` yoksa yedek;
  işlevsel).

## Emin değilim — SİLİNMEDİ

| Ne | Neden |
|---|---|
| `public/apple-touch-icon.png` | hiçbir yerde geçmiyor ama iOS bu adresi bağlantı olmadan da kendiliğinden ister |
| `public/images/brand/logo-512-maskable.png` | manifest'te yok; ama marka görseli, dışarıdan (eski PWA kurulumları, e-posta / sosyal) istenebilir |
| 9 `noti.*` anahtarı (`system_welcome`, `premium_welcome`, `payout_*`, `overtrade_warning_desc`) | bildirim başlıkları veritabanından `title_key` ile geliyor (`navbar.js:798`); eski satırlar repoda görünmeyen anahtarları taşıyabilir |
| 10 `auth.*` anahtarı | kimlik doğrulama metinleri; sunucu / eski akış kullanıyor olabilir, kimlik doğrulamaya dokunulmuyor |
| 141 dinamik önekli anahtar | `'önek.' + değişken` ile üretilebilir |
| CSS seçicileri | sınıf adları JS'te dizgi birleştirerek ekleniyor (`'size-' + …`, `classList.add(değişken)`, şablonlar); güvenilir kanıt yok. Yalnızca silinen dosyaların kendi CSS'i gidiyor |
| `public/i18n/locales/*.js` dosyaları, `OFL-*.txt`, `_redirects`, `.gitattributes`, `vendor/devices.css.LICENSE.txt` | dil dosyaları `'/i18n/locales/' + dil + '.js'` ile yükleniyor; diğerleri lisans / yapılandırma |
| sayfalar (`src/pages/*`) | hepsinin gelen bağlantısı var ya da dışarıdan açılıyor (OAuth geri dönüşü, e-posta bağlantıları); `quick-add-modal` önceki kontrol setinde (Q1) |

## Ön sürümden kalan (temizlikle ilgisiz, dokunulmadı)

- ✅ Düzeltildi (ayrı commit): `nav.menu_general`, `nav.menu_pro`, `nav.menu_account` hiçbir dilde yoktu; menü bölüm başlıkları üç dilde de Türkçe yedek metinle (GENEL / PRO / HESAP) görünüyordu. Eklendi — TR Genel / Pro / Hesap, EN General / Pro / Account, DE Allgemein / Pro / Konto (CSS büyük harf: TR'de görünüm aynı).
- ✅ Düzeltildi (ayrı commit): `bug_report.filter_answered`, `bug_report.filter_pending` EN / DE'de eksikti (EN'de ikisi, DE'de `filter_pending`). TR "Yanıtlananlar / İncelenenler"; "İncelenenler" filtresi rozetinde "İnceleniyor" yazan biletleri gösterdiği için rozetle aynı çeviri kullanıldı: EN Answered / In Review, DE (Beantwortet zaten vardı) / In Prüfung.

## Sonuç (uygulandı)

Commit'ler: `19620b8` envanter · `73f72a9` 36 ölü görsel · `84b513a` ölü bileşen / dosyalar · `72f584a` bundle'daki kullanılmayan
export'lar + eski bildirim yöneticisi · `7f61954` debug `console.log` + `testSendNotification` · `531b1ea` 311 i18n anahtarı ·
`6d680f5` analytics `_t` birleştirme · `f88b10e` kullanılmayan import'lar. Her commit'ten sonra `npm run build` ve `npm test` (631) geçti;
`bundle.js` her seferinde kaynaktan üretildi, `tests/bundle-sync.test.js` geçti.

| Ölçü | Önce | Sonra |
|---|---|---|
| Silinen / eklenen dosya | — | 47 silindi; 2 eklendi (`i18n-t.js`, `CLEANUP.md`) + doğrulama aracı |
| Kod / metin satırı (belge ve araç hariç) | — | **−4.654**, +35 |
| Build çıktısı (`dist`) | 8.072 KB, 251 dosya | **7.680 KB, 210 dosya** (−392 KB) |
| `dist` JS / görsel (webp+png+svg) | 2.143 / 2.066 KB | 2.057 / 1.520 KB |
| `bundle.js` (ham) | 81.8 KB | 71.2 KB |
| Dil dosyaları (tr / en / de, ham) | 138.3 / 138.2 / 146.0 KB | 120.1 / 120.2 / 126.7 KB |
| İlk açılışta inen yerel JS, 8 sayfa toplamı (gzip) | 1.646,6 KB | **1.552,2 KB** (−94 KB; uygulama sayfası başına ~13 KB) |
| İlk açılışta inen yerel CSS | 379,0 KB | 379,0 KB (silinen CSS hiçbir sayfada yüklenmiyordu) |

Doğrulama (sahte oturum, canlı trafik sayacı; canlıya 0 istek, 0 WebSocket):
- `verify-live-traffic` 13/13, `verify-release` 22/22, `verify-ux-bugs` 24/24.
- Ekran görüntüleri 12 sayfa × 1440 / 390 px: 23 / 24 görüntü **0 piksel** fark. `1440-analytics` 1726 piksel: yalnızca zamanla dönen
  İçgörüler kartı (aynı build'in kendi kendisiyle karşılaştırmasında da 1726 / 3021 / 3227 piksel; önce ↔ sonra çiftlerinden biri 0).
- TR / EN / DE × 12 sayfa: konsol / sayfa hatası 0; yeni eksik anahtar yok (yalnızca önceden de eksik olan `nav.menu_*`, bkz. yukarı).

## Sonraki commit'ler (chore/cleanup, temizlik sonrası düzeltmeler)

Temizlikten sonra aynı dala eklenen, davranış değiştiren düzeltmeler (her biri ayrı commit; her commit'ten sonra `npm run build`
ve `npm test` geçti; tarayıcı kontrolleri sahte oturumla, canlı trafik sayacı 0).

| Commit | Ne | Kontrol |
|---|---|---|
| `13aba1f` | `nav.menu_general / menu_pro / menu_account` üç dilde (menü başlıkları her dilde Türkçeydi) | tarayıcı TR / EN / DE |
| `eeec479` | `bug_report.filter_answered / filter_pending` EN / DE | tarayıcı |
| `828a904` | Hiçbir dilde olmayan 14 ana sözlük anahtarı (`trades.table.*`, `common.previous/next`, `toast.load_error`, …) + Hızlı Ekle'de TR'de eksik 8 anahtar; üç dilin anahtar setlerini karşılaştıran test | `tests/i18n-keys.test.js` |
| `0361865` | Strateji PDF'leri Helvetica yerine gömülü DM Sans (ş ğ ı İ bozuluyordu) | `scripts/perf/verify-strategy-pdf.mjs` |
| `29f4fdc` | "Tüm stratejiler" PDF'i hep hata veriyordu (`theme: 'dark'` autoTable'da yok) | aynı |
| `0e3e544` | Strateji PDF'leri dashboard PDF'iyle aynı görünüm (yazılar beyaz sayfada beyazdı): siyah zemin her sayfada, kart başlık, zebra, yeşil / kırmızı K/Z, alt bilgi | aynı: her sayfa boyalı, metin kontrastı ≥ 3:1 (60/60) |
| `ae44e4b` | Hata bildirimi eki sınırı 10 MB → 5 MB (ipucuyla aynı), mesaj üç dilde | tarayıcı (6 MB ret, 4 MB kabul) |
| `d10dfeb` | Hızlı Ekle + düğmesinin ekran okuyucu etiketi / ipucu `nav.quick_add` ile üç dilde, dil değişince yenileniyor | `tests/quick-add-lazy.test.js` |
| `ae1efd3` | Kodda sabit kullanılan ama hiçbir dilde olmayan anahtarları yakalayan test (ana, landing, giriş, Hızlı Ekle sözlükleri; dinamik önekler hariç) | `tests/i18n-keys.test.js` |
| `72d8a3c` | CSV: `Date,Symbol,Side,Volume,…` genel dosyası MT5 sanılmıyor (MT5'e özgü başlık şartı); tarihi olmayan / okunamayan satır **asla bugün sayılmıyor**, önizlemede hata satırı olarak gösterilip içe aktarılmıyor | `tests/csv-import-dates.test.js` |
| `cd5ed9f` | `tests/fixtures/csv-import/` örnek dosyaları (Türk formatı, genel formatın 5 varyasyonu, MT5, hatalı tarih, tarih sütunu yok); iki saat diliminde tarihler dosyadakiyle birebir | aynı |
| `749a65e` | Kullanılmayan CSV broker seçicisi ve 4 anahtarı kaldırıldı (ayrıştırıcı seçimi hiç almıyordu; algılama hep otomatikti) | tarayıcı |
| `d26ae36` | Hata bildiriminde "PNG, JPG, WEBP (Maksimum 5MB)" ipucu dosya alanının altında, üç dilde | tarayıcı |
| `92e9896` | add-trade CSV içe aktarması tarihi boş / okunamayan satıra "şimdi" yazmıyor, atlıyor | `tests/csv-import-dates.test.js` |
| `1fdfe1c` | `supabase/tests/csv_import_today_dates_check.sql`: bu hatadan etkilenen işlemleri bulan salt okunur sorgu | yerel PG17'de denendi |
| `48d408b` | add-trade doğrudan açılışta (yenileme, yer imi) çalışmıyordu: init `requireAuth`'u bundle.js yüklenmeden çağırıyordu (`f0e153e`, 2026-09-18'den beri). `whenAppReady` ile başlıyor; ondalık düzeltmesi SPA geçişinde de uygulanıyor | `tests/add-trade-init.test.js`, `scripts/perf/verify-add-trade.mjs` (doğrudan + SPA × tek işlem, toplu, CSV: 15/15; eski kodda 10/15) |
| `d844a6f` | Hata bildirimindeki "✓ Sistem Tanısı Dahil (…)" üç dilde, dil değişince yenileniyor | tarayıcı |
| `90a42b0` | Toplu yapıştırmada (Hızlı Ekle ve add-trade) tarihsiz satırlar için metin kutusunun altında soluk "bugün / today / heute" etiketi, satır numaralarıyla | tarayıcı |
| `0b70503` | MT5 "Open Time … Close Time" dosyası XTB değil MT5 olarak algılanıyor (XTB'ye özgü sütun şartı); XTB örnek dosyası eklendi | `tests/csv-import-dates.test.js` |
| `381961f` | `.gitignore`: `pdf-check/` (verify-strategy-pdf varsayılan çıktısı) | — |

**Güncel test sayısı: 665** (temizlik sonunda 631).

**CSV tarih kontrolü (canlı):** `supabase/tests/csv_import_today_dates_check.sql` 1. sorgusu kullanıcı tarafından canlıda (Supabase SQL
Editor) çalıştırıldı; sonuç **boş** — tarihi içe aktarma günü / anı olarak kaydedilmiş işlem yok, bu hatadan etkilenen kullanıcı yok.

Kalan, bilinen: XTB dışa aktarımındaki "Gross P/L" sütunu ayrıştırıcıda tanınmıyor, K/Z fiyatlar / lot / komisyon / swap'tan
hesaplanıyor (örnekte doğru net K/Z); add-trade toplu ekleme penceresinin kendi metinleri (başlık, açıklama, düğmeler) hâlâ
yalnızca Türkçe; `.gitignore`'da `.perf-profile/` iki kez geçiyor (zararsız).
