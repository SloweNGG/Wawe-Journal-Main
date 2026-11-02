# Performans çalışması — ilerleme kaydı

Dal: `perf/tonight` (kaynak: `master`, 252c2db). Not: `origin/main`, `master` ile ortak geçmişi olmayan eski (Eylül 2026) bir
daldır; aktif kod `master`'da olduğu için iş `master`'dan açıldı.

**Durum:** `Parça 1 tamamlandı` (önbellek: tek build ID ile sürümleme, immutable `_headers`, cache-first service worker).
Sıradaki: parça 2.

## Başlangıç ölçümü

Ortam: Windows 11, Chrome (headless), Lighthouse 12.2.1, mobil, simüle yavaş 4G (Lighthouse varsayılan mobil ayarı:
150 ms RTT, 1.6 Mbps, 4× CPU). Sunucu: `npm run build && npm run preview` (`astro preview`, 127.0.0.1:4321).

> ⚠️ `astro preview` sıkıştırma yapmıyor ve `_headers`'ı uygulamıyor. Transfer boyutları bu yüzden **sıkıştırılmamış**
> boyutlardır (canlıda Cloudflare gzip/brotli ile çok daha küçük). `/dashboard.html` ve `/analytics.html` giriş istediği
> için oturumsuz tarayıcı sayfayı yükleyip `/login.html`'e yönleniyor; ölçüm sayfa + yönlendirme + giriş sayfasını kapsıyor.

| Sayfa | Puan | LCP | CLS | TBT | Transfer | İstek | Son adres |
|---|---|---|---|---|---|---|---|
| `/index.html` | 75 | 4.87 s | 0.000 | 51 ms | 963 KB | 29 | /index.html |
| `/dashboard.html` | 62 | 9.20 s | 0.001 | 10 ms | 2888 KB | 81 (42 script, 15 CSS) | /login.html |
| `/analytics.html` | 62 | 9.36 s | 0.001 | 21 ms | 2916 KB | 93 (53 script, 16 CSS) | /login.html |

### Tekrar ziyaret (önbellek davranışı)

Lighthouse her çalıştırmada önbelleği sıfırladığı için önbellek etkisini göremez. Bunun için Cloudflare Pages'i taklit eden
yerel bir sunucu (`_headers` kuralları + kural yoksa `max-age=0, must-revalidate` + ETag/304 + gzip) ve aynı tarayıcıda
art arda üç ziyaret yapan bir betik kullanıldı (betikler repoda değil, oturum scratchpad'inde). "Sunucuya giden" = service
worker'dan ya da disk önbelleğinden karşılanmayıp sunucuya giden yerel istek (200 veya 304 "değişti mi?").

| Sayfa | Soğuk: sunucuya giden / KB | Sıcak-1: sunucuya giden / KB | Sıcak-2: sunucuya giden / KB |
|---|---|---|---|
| `/index.html` | 21 / 962 | 2 / 1 | 2 / 1 |
| `/dashboard.html` → login | 57 / 1014 | 35 / 39 | 29 / 24 |
| `/analytics.html` → login | 68 / 1075 | 45 / 11 | 45 / 11 |

### Build çıktısı (başlangıç)

- `dist/` 26 MB (görseller dahil); tüm JS 2.62 MB, tüm CSS 1.40 MB (minify sonrası, sıkıştırmasız).
- HTML'de doğrudan referans verilen yerel dosyalar (analytics'in ES modül alt dosyaları hariç):
  - `index.html` (89 KB, gz 25): 4 JS + 3 CSS, 191 KB (gz 57 KB)
  - `dashboard.html` (132 KB, gz 29): 27 JS + 10 CSS, 806 KB (gz 212 KB)
  - `analytics.html` (85 KB, gz 21): 26 JS + 11 CSS, 768 KB (gz 198 KB) + `analytics.js`'in içe aktardığı ~10 modül
- Sürüm parametreleri dağınık: `i18n.js` 8 farklı `?v=` (ve 8 yerde hiç yok), `config.js` 16 yerde sürümsüz,
  `bundle.js` 12 yerde sürümsüz; quick-add yardımcıları (`broker-dictionary.js`, `broker-detector.js`,
  `fill-pairing.js`, `parser-v2.js`) hiç sürümsüz; analytics alt modülleri (`./helpers.js` vb.) sürümsüz.

### Parça 1 sonrası ölçüm

Tekrar ziyaret (aynı Cloudflare-benzeri yerel sunucu, aynı betik):

| Sayfa | Soğuk: sunucuya giden / KB | Sıcak-1: sunucuya giden / KB | Sıcak-2: sunucuya giden / KB |
|---|---|---|---|
| `/index.html` | 21 / 962 | 1 / 1 | 1 / 1 |
| `/dashboard.html` → login | 57 / 1025 | **5** / 35 (önce 35 / 39) | **5** / 1 (önce 29 / 24) |
| `/analytics.html` → login | 68 / 1073 | **5** / 1 (önce 45 / 11) | **5** / 1 (önce 45 / 11) |

Sıcak ziyarette sunucuya giden 5 istek yalnızca HTML (sayfa, login yönlendirmesi, link prefetch'leri). JS/CSS'in
tamamı service worker'dan ya da disk önbelleğinden geliyor; "değişti mi?" (304) isteği kalmadı.

Soğuk yükleme (Lighthouse, aynı yerel sunucuda baseline ve yeni build, ikişer çalıştırma): puanlar aynı
(index 75/75 · 74/75, dashboard 62/62 · 62/62, analytics 61/62 · 62/62); LCP/TBT/transfer ölçüm oynaklığı içinde
(bir çalıştırmada dashboard LCP 16.75 s çıktı, tekrarında 9.42 s). Beklenen sonuç: bu parça ilk ziyareti değil,
tekrar ziyaretleri hızlandırıyor. İlk ziyaretteki indirme miktarı parça 2'nin işi.

Deploy simülasyonu (aynı tarayıcı profili; A build'i ziyaret edildi, sunucudaki dosyalar B ile değiştirildi):
B'ye geçişte sayfa yeni `?v=`'yi aldı, SW önbelleği `wawe-v52-<A>` → `wawe-v52-<B>` oldu (eskisi silindi), hata yok.
Tarayıcıda 8 sayfanın (index, login, register, dashboard, analytics, trades, settings, backtest) 404/konsol hataları
baseline ile birebir aynı.

## Yapılanlar

### 0 — Ölçüm · `ad7fcc7`
Yukarıdaki tablolar. Ölçüm betikleri repoda değil (oturum scratchpad'i): Lighthouse 12.2.1 + Chrome; `_headers`'ı
uygulayan, ETag/304 ve gzip yapan küçük bir Node sunucusu; puppeteer-core ile soğuk + 2 sıcak ziyaret sayan betik.

### 1a — Tek kaynaklı sürüm: build ID · `6a711ce`
- **Nasıl çalışıyor:** `astro.config.mjs` derleme başına tek bir `BUILD_ID` üretiyor (`Date.now()`, ya da
  `WW_BUILD_ID` ortam değişkeni). Bu ID hem `__WW_BUILD_ID__` (vite define → SpaRouter `<meta name="ww-build">`) hem de
  yeni `scripts/asset-version.mjs` entegrasyonu için kullanılıyor. Entegrasyon `astro:build:done`'da, minify'dan SONRA,
  `dist`'teki her dosyayı işliyor:
  - HTML: yerel `.js`/`.mjs`/`.css` `src`/`href` değerlerine `?v=<ID>` (varsa eski `?v=` eziliyor). `/_astro/` (Astro'nun
    hash'li dosyaları), CDN adresleri ve `/sw.js` hariç.
  - JS: `import … from './x.js'`, `import './x.js'`, `import('./x.js')` → `?v=<ID>` (analytics modül ağacı, `public/src`).
  - Kodla kurulan adresler: kaynakta `?v=__WW_BUILD_ID__` yazılıyor, derleme gerçek ID'yi koyuyor. Bunlar:
    i18n dil dosyası (`i18n.js`), `demo-data.js` (dashboard admin demo), `tz-countries.json` (onboarding),
    PDF fontları (`dashboard.js`, `analytics/js/pdf-report.js` — önceden hiç sürümsüzdü).
  - CSS: `url(/fonts/…)`, `url(/icons/…)`, font dosyaları ve yerel `@import` → `?v=<ID>` (şu an eşleşen yok; parça 2'de
    kendi barındırılan fontlar için hazır).
  - **Doğrulama:** ardından `dist` taranıyor; bu derlemenin çıktısında sürümsüz yerel referans, sürümsüz biten kodla
    kurulmuş adres (`+ '.ttf'` gibi), değişmemiş `__WW_BUILD_ID__` ya da ID'si farklı `ww-build` meta'sı varsa **derleme
    hata veriyor**.
- 18 `.astro` dosyasından elle yazılmış 97 `?v=` numarası kaldırıldı (artık kaynakta sürüm yok).
- Değişen dosyalar: `astro.config.mjs`, `scripts/asset-version.mjs` (yeni), `src/components/BaseHead.astro`,
  `src/layouts/{Layout,PageLayout}.astro`, 15 sayfa (`src/pages/*.astro`), `public/i18n.js`,
  `public/interface/dashboard/js/{dashboard,onboarding}.js`, `public/interface/analytics/js/pdf-report.js`,
  `public/interface/backtest/js/bt-symbols.js` (yalnızca yorum), `tests/asset-version.test.js` (yeni).
- **Grep kanıtı** (temiz `dist`, build `1793651235110`):
  - HTML'deki yerel JS/CSS referansı: **445 / 445** `?v=1793651235110` taşıyor, farklı ya da eksik: **0**.
  - `dist` JS'lerindeki yerel import: **88 / 88** `?v=1793651235110`.
  - `dist`'te kalan `__WW_BUILD_ID__`: **0** dosya.
  - Damgalanmış 532 referansın hepsi var olan bir dosyaya çözülüyor; tek istisna `quick-add-modal.html` →
    `/js/quick-modal.js` (dosya repoda hiç yok; önceden de 404'tü, dokunulmadı).
  - Komut: `grep -rhoE "(src|href)=\"[^\"]+\.(m?js|css)(\?[^\"]*)?\"" dist --include=*.html | grep -vE "\"(https?:)?//|/_astro/"`
    çıktısının tamamı `?v=<ID>"` ile bitiyor.

### 1b — `_headers`: immutable önbellek · `176bc83`
- `Cache-Control: public, max-age=31536000, immutable`: `/interface/*`, `/components/*`, `/src/*`, `/settings/js/*`,
  `/settings/css/*`, `/i18n/*`, `/fonts/*`, `/icons/*` ve kökteki 13 JS/CSS dosyası tek tek (`/sw.js` hariç).
- HTML'e kural yok. `/*` ya da `*.js` gibi kalıp yok; dosyanın başındaki uyarı güncellendi.
- `/i18n/*` listede yoktu ama içi yalnızca `?v=` ile yüklenen dil dosyaları (her biri ~145 KB), o yüzden eklendi.
- Değişen dosyalar: `public/_headers`, `tests/cache-headers.test.js` (yeni: genel kural yok, çakışan Cache-Control yok,
  HTML immutable değil, kökteki her JS/CSS kapsanıyor, `sw.js` varsayılanda).

### 1c — Service worker · `da7b650`
- Bu derlemenin `?v=<ID>`'sini taşıyan yerel JS/CSS/font/ikon/JSON → **cache-first** (ağa hiç gitmez).
- Başka derlemenin `?v=` değeri → ağdan, önbelleğe yazılmadan (eski/yeni deploy karışmasın). Geliştirmede (`astro dev`)
  ID yok, cache-first kapalı.
- HTML (`.html`), `/api/`, Supabase, admin ve diğer origin'ler önceki gibi SW dışında. `/interface/`, `/components/`,
  `/src/`, `/settings/` altındaki sürümsüz istekler önceki gibi ağdan.
- `CACHE_VERSION = 'wawe-v52-' + BUILD_ID` (derleme ID'yi `sw.js`'e yazıyor): her deploy'da yeni SW kurulur ve mevcut
  `activate` mantığı eski önbelleği siler (önceden `wawe-v51` elle artırılıyordu).
- Değişen dosyalar: `public/sw.js`, `tests/sw.test.js` (yeni: sw.js'i sahte cache/fetch ile vm'de çalıştırıyor).

`npm run build` ve `npm test` her adımdan sonra geçti (sonda: 527 test, 0 hata; başlangıçta 506).

## Atlananlar / riskler

1. **`/settings/*` yerine `/settings/js/*` + `/settings/css/*`.** `settings.js`, `/settings/panels/*.html` parçalarını
   sürümsüz `fetch` ediyor; `/settings/*` immutable olsaydı deploy sonrası paneller 1 yıl eski kalabilirdi ve HTML'e
   dokunulmuş olurdu.
2. **✅ KAPANDI (parça 2, `perf(2-pre)`): sayfalar artık "önce ağ".** Ayrıntı ve ölçüm: Parça 2 → 2-pre.
   Eski not: **Uzantısız sayfa adresleri SW'de stale-while-revalidate (DEĞİŞTİRİLMEDİ, karar sizde).** Linkler `/dashboard.html`;
   Cloudflare bunu `/dashboard`'a yönlendiriyor. `sw.js` yalnızca `.html` ile biten adresi atlıyor, uzantısız `/dashboard`
   (ve SPA router'ın `fetch('/dashboard')`'u) bugün de SW önbelleğinden önce eski kopya, arkada yenisi olarak geliyor.
   Görevde "HTML ağdan gelmeye devam etsin" yazıyordu; mevcut davranış tam olarak öyle değil. Değiştirmedim çünkü
   (a) davranış değişikliği olur, (b) tekrar açılışı yavaşlatır (HTML artık 0 RTT olmaz). Yeni düzende deploy sonrası
   ilk açılış tutarlı biçimde eski sürümü (eski HTML + kendi önbelleğindeki eski JS) gösterir, ikincisi yeniyi; önceden
   eski HTML + yeni JS karışabiliyordu. HTML'in her zaman ağdan gelmesini isterseniz değişiklik küçük:
   `req.mode === 'navigate' || req.destination === 'document'` ise `return`.
3. **Tek build ID = her deploy'da her dosya yeniden iner.** Değişmemiş dosyalar da yeni adres alıyor; deploy sonrası
   ilk ziyaret sayfa başına ~200 KB (gzip) yeniden indirir (önceden 304 ile kurtuluyordu). Deploy'lar arasındaki her
   ziyaret ise 30–45 "değişti mi?" isteğinden kurtuluyor. Dosya başına içerik hash'i daha iyi olurdu ama ES modül
   import zincirinde hash'ler zincirleme değişir; şimdilik istenen tek ID yapıldı.
4. **Açık sekme + deploy:** eski sekme sonradan tembel yüklenen bir dosya isterse (dil değiştirme, PDF fontu, demo
   verisi, saat dilimi listesi) eski `?v=` ile ister; Cloudflare sorguyu yok sayıp yeni içeriği verir. Bu sorun önceden
   de vardı (sürümsüz/aynı adres); SPA router yeni deploy'u görünce tam yükleme yaptığı için gezinmede düzeliyor.
5. **`/interface/quick-add/js/test-broker-formats.html`** `/interface/*` altında kaldığı için immutable. Uygulamanın
   açmadığı geliştirici test sayfası; bilinçli istisna olarak testte listelendi.
6. **Yerelde `dist` temizlenmiyor.** Bu makinede Astro'nun `emptyDir`'i `dist`'i boşaltmıyor (eski
   `premium-dashboard.html`, smoke testin `__bt.html`'i kalıyor). Derleme bunları hata değil uyarı olarak listeliyor.
   Cloudflare her derlemeyi temiz checkout'ta yaptığı için canlıyı etkilemez; ama yerelden `wrangler pages deploy`
   yapılacaksa önce `dist` silinmeli.
7. **`/js/quick-modal.js`** (`src/pages/quick-add-modal.astro`) repoda yok, önceden de 404. Kapsam dışı, dokunulmadı.
8. **Ölçüm sınırları:** dashboard/analytics oturumsuz ölçüldü (login'e yönleniyor). `astro preview` gzip ve `_headers`
   uygulamıyor; bu yüzden tekrar-ziyaret ölçümü Cloudflare'i taklit eden yerel sunucuyla yapıldı, gerçek Cloudflare değil.
9. **Dal:** `origin/main` ile `master` ortak geçmişe sahip değil; PR açılacaksa hedef `master` olmalı.

## Sonraki parça için notlar

- **Kaynakta `?v=` YAZMAYIN.** `<script src="/x.js">` / `<link href="/x.css">` yazın; derleme ekler. Elle `?v=123`
  yazılırsa `tests/asset-version.test.js` başarısız olur.
- **Kodla kurulan adres** (fetch, `script.src`, değişkenli `import()`) yazıyorsanız sonuna `?v=__WW_BUILD_ID__` ekleyin.
  Unutursanız ve adres tırnakla bitiyorsa (`'/interface/x.js'`) ya da `+ '.ttf'` gibi bitiyorsa derleme hata verir.
  Tamamen değişkenden kurulan adresleri derleme yakalayamaz; dikkat.
- **Statik ES modül import'ları** otomatik damgalanır; aynı modül her yerde aynı adresle yüklenir (modül kimliği korunur).
- **Yeni dosya eklemek:** `/interface`, `/components`, `/src`, `/settings/js|css`, `/i18n`, `/fonts`, `/icons` altına
  eklenen dosya otomatik immutable olur. **Köke** yeni `.js`/`.css` eklerseniz `public/_headers`'a satırını ekleyin
  (`tests/cache-headers.test.js` hatırlatır). Bu klasörlere sürümsüz fetch edilecek bir HTML/JSON koymayın
  (HTML koyarsanız test başarısız olur).
- **Kendi barındırılan fontlar / ikonlar:** `/fonts/*` ve `/icons/*` kuralı hazır; CSS'teki `url(/fonts/…woff2)` otomatik
  damgalanıyor. Font CSS'i bir `<link>` ise o da damgalanır.
- **Bundle / birleştirme (parça 2):** `/src/` ya da `/interface/` altına üretilen bundle'lar da otomatik damgalanır.
  `public/src/bundle.js` gibi repoya yazılan çıktılar `public`'te sürümsüz kalır, damga yalnızca `dist`'te.
- `/_astro/` Astro'nun hash'li çıktısı; damgalanmaz, zaten immutable.
- Build ID'yi sabitlemek için: `WW_BUILD_ID=1800000000001 npm run build` (yalnızca rakam).
- `sw.js`: önbellek adı `wawe-v52-<ID>`; her deploy zaten yeni önbellek demek. SW mantığı değişirse `v52`'yi
  okunabilirlik için artırın.
- Ölçümü tekrarlamak için: Lighthouse'u repo dışına kurun (`npm i lighthouse@12.2.1`), `npm run build && npm run preview`,
  sonra `npx lighthouse http://127.0.0.1:4321/<sayfa>.html --only-categories=performance --form-factor=mobile
  --throttling-method=simulate`. Tekrar-ziyaret için `_headers`'ı uygulayan bir sunucu gerekir (`astro preview` uygulamaz).

## Elle kontrol listesi

Canlıya almadan önce (Cloudflare `perf/tonight` için önizleme adresi üretiyorsa orada):

- [ ] `curl -sI "https://<önizleme>/styles.css?v=x"` → `Cache-Control: public, max-age=31536000, immutable` (tek değer,
      virgülle birleşmiş ikinci bir değer YOK).
- [ ] `curl -sI https://<önizleme>/dashboard`, `/sw.js` ve `/settings/panels/plan.html` → `max-age=0, must-revalidate`.
- [ ] Sayfa kaynağında (Ctrl+U) tüm yerel script/CSS adresleri aynı `?v=` değerini taşıyor ve `<meta name="ww-build">`
      ile aynı.
- [ ] Giriş yapıp: dashboard, analytics (tüm grafikler, widget özelleştirme, grafik büyütme), trades, calendar,
      strategies, journals, backtest, settings (tüm paneller) açılıyor; konsolda yeni hata yok.
- [ ] Dil değiştirme TR → DE → EN (dil dosyası `/i18n/locales/*.js?v=` ile geliyor).
- [ ] Dashboard PDF ve Analytics PDF raporu: DM Sans fontu doğru (font adresi artık `?v=` taşıyor).
- [ ] Onboarding saat dilimi listesi doluyor (`tz-countries.json`).
- [ ] Admin: `/dashboard?demo=seed` demo verisini yüklüyor (`demo-data.js`); admin paneli açılıyor.
- [ ] Quick-add: işlem ekleme penceresi ve broker metni yapıştırma/çözümleme çalışıyor.
- [ ] DevTools → Application → Service Workers: aktif SW; Cache Storage'da yalnızca `wawe-v52-<ID>`.
- [ ] Network sekmesinde normal yenileme (F5): JS/CSS satırları "(ServiceWorker)" ya da "(disk cache)"; 304 yok.
- [ ] İkinci bir deploy sonrası: açık sekmede bir sayfaya geçince tam yükleme oluyor, yeni `?v=` geliyor, Cache
      Storage'da yeni `wawe-v52-<yeni ID>` var, eskisi silinmiş.
- [x] Risk 2 (uzantısız HTML'in SW'de önbelleklenmesi) için karar: önce ağ (parça 2, 2-pre).

---

# Parça 2 — Gecikmeli yükleme

**Durum:** devam ediyor.

## 2-pre — Sayfalar için "önce ağ" (risk 2'nin kapanışı)

- `public/sw.js`: tarayıcı gezintileri (`mode === 'navigate'` / `destination === 'document'`) ve uzantısız sayfa
  yolları (`/dashboard`; Cloudflare `.html` adresini buraya yönlendiriyor, SPA router da HTML'i bu adresle `fetch`
  ediyor) **önce ağdan** geliyor. Başarılı (200, yönlendirme olmayan) cevap önbelleğe yazılıyor. Ağ **3 sn** içinde
  cevap vermezse ya da hata verirse (çevrimdışı) son başarılı kopya gösteriliyor; `/x` ile `/x.html` aynı sayfa sayılıyor.
  Kopya yoksa ağ beklenir / tarayıcının kendi hata sayfası çıkar (SW yokken olduğu gibi).
- Gezinti olmayan `.html` fetch'leri (settings panelleri, `auth-spa.js`) önceki gibi doğrudan ağdan. Admin, `/api/`,
  Supabase ve diğer origin'ler değişmedi. Önbellek adı `wawe-v53-<ID>` (her deploy'da eski siliniyor).
- Sonuç (gerçek Chrome, sunucu tarafında gecikme/kesinti verilerek):

  | Durum | Sonuç | Süre |
  |---|---|---|
  | Sunucudaki sayfa değişti (deploy) | yeni sayfa geldi | 48 ms |
  | Sunucu 4.5 sn gecikmeli | önbellekteki kopya | 3.05 sn |
  | Sunucu kapalı, sayfa önceden açılmış | önbellekteki kopya | 36 ms |
  | Sunucu kapalı, sayfa hiç açılmamış | tarayıcının hata sayfası (`ERR_FAILED`) | — |

- Bedeli: tekrar açılışta HTML artık SW önbelleğinden 0 RTT gelmiyor, her seferinde ağa soruluyor (sayfa başına bir
  istek, gzip ~21–29 KB). Karşılığı: deploy sonrası ilk açılışta da yeni sürüm.
- Dosyalar: `public/sw.js`, `tests/sw.test.js` (önce ağ, çevrimdışı kopya, `/x` ↔ `/x.html`, 3 sn zaman aşımı,
  yönlendirmenin önbelleğe yazılmaması, panellerin SW dışında kalması).
