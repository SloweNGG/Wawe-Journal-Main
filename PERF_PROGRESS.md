# Performans çalışması — ilerleme kaydı

Dal: `perf/tonight` (kaynak: `master`, 252c2db). Not: `origin/main`, `master` ile ortak geçmişi olmayan eski (Eylül 2026) bir
daldır; aktif kod `master`'da olduğu için iş `master`'dan açıldı.

**Durum:** `Parça 3 sürüyor` (parça 1: önbellek — tek build ID, immutable `_headers`, cache-first SW; parça 2:
sayfalar önce ağ + Hızlı Ekle / grafik kütüphaneleri / SortableJS gecikmeli yükleme; parça 3: kendi fontlarımız, KPI
kayması, dokunmatikte SortableJS, "N" kısayolu, quick-modal 404, gerçek hesapla ölçüm).

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
- [ ] DevTools → Application → Service Workers: aktif SW; Cache Storage'da yalnızca `wawe-v53-<ID>` (parça 2'den beri v53).
- [ ] Network sekmesinde normal yenileme (F5): JS/CSS satırları "(ServiceWorker)" ya da "(disk cache)"; 304 yok.
- [ ] İkinci bir deploy sonrası: açık sekmede bir sayfaya geçince tam yükleme oluyor, yeni `?v=` geliyor, Cache
      Storage'da yeni `wawe-v53-<yeni ID>` var, eskisi silinmiş.
- [x] Risk 2 (uzantısız HTML'in SW'de önbelleklenmesi) için karar: önce ağ (parça 2, 2-pre).

---

# Parça 2 — Gecikmeli yükleme

**Durum:** `Parça 2 tamamlandı`. Her adımdan sonra `npm run build` ve `npm test` geçti (sonda 556 test, 0 hata;
parça 1 sonunda 527).

## Ölçüm (giriş yapılmış hâl, sahte oturum)

Yöntem: `scripts/perf/` (aşağıda "Sonraki parça için notlar"). Supabase istekleri yerelde cevaplandı (40 işlem,
1 defter, 3 strateji); sunucu `scripts/perf/cf-serve.mjs` (Cloudflare benzeri, gzip). "Önce" = parça 1 sonu (da7b650),
"sonra" = parça 2 sonu.

İlk açılışta inen (kaydırma yok, Supabase hariç):

| Sayfa | Ekran | Önce: istek / toplam / JS | Sonra: istek / toplam / JS |
|---|---|---|---|
| dashboard | mobil 390×844 | 56 / 1086 KB / 644 KB | **50 / 792 KB / 350 KB** |
| analytics | mobil | 67 / 1130 KB / 693 KB | **60 / 821 KB / 384 KB** |
| strategies | mobil | 53 / 1018 KB / 584 KB | 49 / 985 KB / 550 KB (kartlar ilk ekranda → ApexCharts iner) |
| trades | mobil | 52 / 807 KB / 370 KB | 48 / 772 KB / 336 KB |
| calendar | mobil | 51 / 788 KB / 368 KB | 47 / 754 KB / 334 KB |
| backtest | mobil | 62 / 941 KB / 508 KB | 62 / 928 KB / 494 KB |
| dashboard | masaüstü 1440×900 | 56 / 1086 KB / 644 KB | 52 / 1053 KB / 611 KB (grafikler ilk ekranda → kütüphaneler iner) |
| analytics | masaüstü | 66 / 1116 KB / 694 KB | 61 / 1067 KB / 645 KB |

Lighthouse (mobil, simüle yavaş 4G, sahte oturum; dashboard 3–4 çalıştırma, analytics 1–2):

| Sayfa | Önce: puan / LCP / CLS / TBT | Sonra: puan / LCP / CLS / TBT |
|---|---|---|
| dashboard | 53–58 / 9.88–10.07 s / 0.000 / 280–415 ms | **55–62 / 7.69–7.77 s** / 0.000–0.006 / 203–399 ms |
| analytics | 43 / 11.23 s / 0.048 / 746 ms | **57–59 / 8.47–8.63 s** / 0.031–0.048 / 275–340 ms |

Son görünüm (grafikler yüklendikten sonra, 1440×900) baseline ile piksel piksel karşılaştırıldı: dashboard 32,
strategies 20, analytics 64 piksel fark. Hepsi zamanla oynayan öğeler: navbar'daki "Pro" rozetinin animasyonlu noktası
(6×6) ve analytics'teki içgörü kartının zamanlı ilerleme çubuğu. Aynı build'in iki çalıştırması arasında da 44 piksel
fark var. Düzen farkı yok.

## Yapılanlar

### 2-pre — Sayfalar için "önce ağ" (risk 2'nin kapanışı) · `bb545f4`

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

### 2.0 — Yükleyici `public/interface/shared/lazy-load.js` · `1f29ee6` (2a ile birlikte)
- `BaseHead.astro`'ya `defer` ile girdi (uygulama sayfaları). `window.WwLazy`:
  - `loadScriptOnce(url, { test })`: aynı adres (sorgu yok sayılarak) bir kez eklenir, aynı anda gelen çağrılar aynı
    Promise'i paylaşır; `test()` true ise (kütüphane zaten sayfada) hiç yüklemez; hata olursa kayıt silinir, yeniden
    denenir. `window.loadScriptOnce` olarak da açık.
  - `loadScriptsInOrder([...])`: paralel indirir, sırayla çalıştırır (`async=false`).
  - `whenVisible(el | [el], fn, { rootMargin: '300px' })` (IntersectionObserver; yoksa hemen), iptal fonksiyonu döner.
  - `busy(el, promise)`: yükleme 120 ms'den uzun sürerse tetikleyiciye `aria-busy` + `.ww-lazy-busy` (ilerleme imleci,
    %72 opaklık, tıklama kapalı). Kısa (önbellekten) yüklemede hiç görünmez.
  - `LIBS` / `loadLib(name)` / `loadLibs([...])` / `libReady(name)` (2b'de eklendi): apexcharts 8.2.0,
    lightweight-charts 4.1.3, sortablejs 1.15.0 adresleri **tek yerde**.
- Test: `tests/lazy-load.test.js`.

### 2a — Hızlı Ekle ilk kullanımda · `1f29ee6`
- dashboard, analytics, calendar, strategies, trades: 6 dosya (~210 KB ham: broker-dictionary, broker-detector,
  fill-pairing, parser-v2, quick-modal-i18n, quick-add) yerine yalnızca yeni `quick-add-boot.js` (~8 KB) yükleniyor.
- `quick-add-boot.js`:
  - Sağ alttaki **+ (FAB)** butonunu eskisiyle aynı anda (DOMContentLoaded + 100 ms), aynı id/sınıf/ikon/etiketle oluşturur.
  - `quick-add.js`'in en üstündeki sayfa açılışı tema kodu (body teması, yazı boyutu, özel renkler, `storage` /
    `themeChanged` dinleyicileri) **birebir** buraya taşındı (görünüm aynı kalsın; iki kez çalışmasın diye
    quick-add.js'ten çıkarıldı).
  - `window.quickAddOpen` bir vekil (`__wwLazy`): ilk çağrıda 6 dosyayı sırayla yükler, `quickAddInit()` ile modalı
    kurar, sonra açar; yükleme sırasında tetikleyicide bekleme durumu; hata olursa toast ("Quick Add yüklenemedi").
    quick-add.js yüklenince gerçek `quickAddOpen` / `quickAddClose` vekilin üzerine yazar. `window.quickAddLoad()` → Promise.
  - FAB'ın üstüne gelince / dokununca / odaklanınca indirme önden başlar.
- `quick-add.js`: tema bloğu çıkarıldı, `window.quickAddInit` eklendi (100 ms'lik init beklemeden modalı kurmak için).
- `navbar.js` `wwQuickAddReady()`: vekili hazır sayıyor (yoksa "N" kısayolu / navbar "+" Hızlı Ekle yerine
  `/add-trade.html`'e giderdi).
- Tarayıcıda (5 sayfa): ilk yüklemede 6 dosyanın hiçbiri inmiyor; FAB tıklanınca iniyor ve modal açılıyor (yavaş ağda
  FAB'da bekleme durumu görüldü, bitince temizlendi); işlem kaydı (EURUSD, lot 1) sahte arka uca gitti, modal kapandı;
  ikinci açılışta yeniden yükleme yok; aynı anda iki çağrı tek yükleme; "N" kısayolu (bilinen engel kaldırılınca) ve
  boş liste butonu açıyor; SPA geçişlerinde (dashboard → analytics → strategies → dashboard → trades) her sayfada
  açılıyor, tam sayfa yüklemesi yok.
- Dosyalar: `public/interface/quick-add/js/quick-add-boot.js` (yeni), `quick-add.js`, `public/components/navbar/navbar.js`,
  5 sayfa, `src/components/BaseHead.astro`, `tests/quick-add-lazy.test.js` (yeni).

### 2b — ApexCharts ve lightweight-charts kapsayıcı ekrana yaklaşınca · `6204b6f`
- **dashboard:** `startDashboard` artık iki kütüphaneyi beklemiyor (önceden istatistikler dahil her şey kütüphaneleri
  bekliyordu). İstatistikler ve son işlemler hemen çiziliyor; `renderCharts` kütüphane yoksa son veriyi saklıyor, 5
  grafik kapsayıcısından biri 300 px yaklaşınca ikisini yükleyip çiziyor (her grafik mevcut `fadeInChart` ile beliriyor).
  Prop seviye çizgileri (`_wwCumLevels`) geç oluşturulan grafiğe de uygulanıyor. Büyütme yalnızca çizilmiş grafikten.
- **analytics:** `renderCharts` / `renderChartFor` / `renderChartInto` kapıdan geçiyor. Kütüphane yokken grafik dışı
  kartlar (seriler, takvim, içgörüler, son işlemler, hedef, prop) hemen çiziliyor; 11 grafik kartı (= `EXPANDABLE_CHARTS`)
  mevcut `.chart-pending` parıltısında bekliyor, biri yaklaşınca yüklenip en son çizim tekrar çalışıyor. SPA'da sayfa
  değiştiyse bekleyen çizim atılıyor (dashboard aynı `chart-*` id'lerini kullanıyor).
- **strategies:** mevcut `whenApexReady(cb)` yoklayıcısı `whenApexReady(cb, el)` oldu: kart / karşılaştırma kapsayıcısı
  yaklaşınca yükler; equity modalında hemen. Sayfadan çıkışta izleyiciler iptal ediliyor.
- Tarayıcıda: mobilde dashboard ve analytics ilk anda kütüphane indirmiyor, kaydırınca indiriyor ve aynı sayıda grafik
  çiziyor (dashboard 3 Apex + lightweight-charts, analytics 7 + 7, strategies 5). Masaüstünde grafikler ilk ekranda
  olduğu için hemen iniyor (açılıştan ~0.8–1.3 sn sonra; önceden sayfa açılışında). Admin ve backtest'e dokunulmadı.
- Test sırasında bulunup commit'ten önce düzeltilen hata: strategies'ten çıkışta, kaldırılan yoklayıcı değişkenine
  erişen temizlik satırı `ReferenceError` verip grafik temizliğini atlıyordu.
- Dosyalar: `public/interface/shared/lazy-load.js`, `public/interface/dashboard/js/dashboard.js`,
  `public/interface/analytics/js/chart-renderers.js`, `public/interface/strategies/js/strategies.js`, 3 sayfa,
  `tests/lazy-charts.test.js` (yeni).

### 2c — SortableJS yalnızca düzenlemede · `0833d4a`
- **analytics:** sayfada ayrı bir düzen modu yok (tutamaçlar her kartta hep görünür). Bu yüzden düzenleme niyetinde
  yükleniyor: kartın araç köşesine (`.widget-tools`: ayar + tutamaç) fare gelince / odaklanınca, tutamaca basınca /
  dokununca ya da "Özelleştir" paneli açılınca. Yüklenince ızgaraya eskisiyle aynı ayarlarla bağlanıyor. Gerçek fare
  sürüklemesiyle sıra değişti ve kaydedildi; sonuç baseline ile aynı.
- **backtest:** istatistik paneli sürüklenebilir çizilince (geniş ekran + istatistik sekmesi açık; `drag: wideScreen()`)
  yükleniyor ve o ızgara hâlâ yerindeyse bağlanıyor. Backtest'teki lightweight-charts etiketi aynen duruyor.
- Dosyalar: `public/interface/analytics/js/dashboard-manager.js`, `widget-customizer.js`,
  `public/interface/backtest/js/bt-stats.js`, `src/pages/analytics.astro`, `src/pages/backtest.astro`, test.

### 2d — xlsx (inceleme, değişiklik yok) · `7d429ba`
- SheetJS zaten yalnızca `quick-add.js` içindeki `loadXLSX()` ile, .xlsx / .xls içe aktarılırken iniyor (bir kez, vaat
  paylaşımlı). Hızlı Ekle artık kendisi gecikmeli yüklendiği için uçtan uca denendi: açılışta yok, Hızlı Ekle açıkken
  de yok, `loadXLSX()` çağrılınca iniyor; bellekte üretilen bir .xlsx CSV'ye çevrildi, ParserV2 doğru satırı çıkardı.
- Örnekten farkı: hata olursa `_xlsxLoading` reddedilmiş kalıyor, aynı sayfada yeniden deneme yok (WwLazy yeniden
  dener). Bozmamak için değiştirilmedi. Desen bir testle sabitlendi.

### 2e — Ölçüm araçları `scripts/perf/` · `5dae16d`
- `cf-serve.mjs`, `mock-session.mjs`, `lighthouse.mjs` (yayına girmez). Kullanım "Sonraki parça için notlar"da.

## Bulunan bağımlılıklar (Hızlı Ekle, grep ile)

`window`'a açılanlar: `BrokerDictionary` (broker-dictionary), `BrokerDetector` (broker-detector), `FillPairing`
(fill-pairing), `ParserV2` (parser-v2), `quickI18n` + üst düzey `const quickTranslations / quickI18n` (quick-modal-i18n),
`quickAddOpen`, `quickAddClose`, `parseCsvByBroker` (yalnızca yoksa), üst düzey `loadXLSX` / `fileToCsvText` (quick-add).

Dışarıdan kullananlar:

| Yer | Kullanım | Çözüm |
|---|---|---|
| `public/components/navbar/navbar.js` `wwQuickAddReady` / `wwOpenAddTrade` | `quickAddOpen` + `#quick-add-overlay` varsa açar, yoksa `/add-trade.html` | vekil hazır sayılıyor |
| `navbar.js` "N" kısayolu (`keydown`) | `wwOpenAddTrade` | vekil üzerinden; ama bkz. bilinen hata: kısayol hep engelli |
| `navbar.js` `#nav-add-trade` tıklaması | `wwOpenAddTrade` | bu id'li buton şu an hiçbir yerde oluşturulmuyor (ölü dinleyici) |
| `public/interface/dashboard/js/dashboard.js:994` boş liste butonu | `onclick="quickAddOpen()"` | vekil |
| `public/interface/analytics/js/helpers.js:220` boş kart butonu | `onclick="quickAddOpen()"` | vekil |
| `public/interface/trades/js/trades.js:843` boş liste butonu | `onclick="quickAddOpen()"` | vekil |
| `public/interface/dashboard/js/onboarding.js:1247` tur adımı | hedef `#quick-add-fab` | FAB ön yükleyicide, aynı anda oluşuyor |
| `onboarding.js:1818` "işlem ekle" görevi | `#quick-add-fab` `.click()` | vekil |
| analytics / calendar / strategies / trades satır içi `createManualFAB` | 1.5 sn sonra `quickAddOpen` tanımsızsa yedek FAB + alert | vekil tanımlı → yedek FAB çıkmaz (önceki gibi) |
| `public/src/features/csv-parsers.js` (bundle.js) | `parseCsvByBroker` / `detectBroker` çağrı anında `ParserV2` / `BrokerDetector` kullanır | yalnızca Hızlı Ekle içinden çağrılıyor; o an yüklü |
| `src/pages/add-trade.astro` | `BrokerDictionary` | kendi `broker-dictionary.js` etiketini yüklüyor, değişmedi |
| `src/components/SpaRouter.astro` | `#quick-add-fab` / `#quick-add-container` gizleme CSS'i | değişmedi |
| `src/components/quick-add/*.tsx`, `QuickAddFAB.tsx`, `QuickAddModal.astro` | kendi `quickAddOpen`'larını tanımlar | hiçbir sayfada kullanılmıyor (ölü kod) |

Grafik kütüphaneleri: ApexCharts → dashboard.js (`mountApex`, `renderExpandedChart`), analytics `chart-renderers.js`
(`renderOrUpdateApex` + 11 grafik), strategies.js (sparkline, karşılaştırma, equity, büyütme); `public/src/features/theme.js`
yalnızca `typeof ApexCharts` kontrolü (zararsız). lightweight-charts → dashboard (kümülatif, günlük), analytics
(kümülatif). SortableJS → analytics `dashboard-manager.js` `initDragDrop`, backtest `bt-stats.js`.

## Atlananlar / riskler

1. **Analytics'te "düzen modu" yok.** SortableJS düzenleme niyetinde (araç köşesine fare / odak, tutamağa basma /
   dokunma, Özelleştir) yükleniyor. İlk kez gelen bir kullanıcı **hiç üstüne gelmeden doğrudan tutamağa dokunursa**
   (dokunmatik) kütüphane o dokunuşta iniyor ve ilk sürükleme başlamayabilir; ikinci deneme çalışır. Fareyle üzerine
   gelme basmadan önce olduğu için masaüstünde sorun görülmedi.
2. **Masaüstünde grafik kütüphaneleri yine ilk ekranda iniyor** (kapsayıcılar görünür; istenen davranış). Kazanç orada
   Hızlı Ekle'den ve kütüphanelerin sayfa script'lerini artık bloklamamasından geliyor (istatistikler önce çiziliyor).
3. **Grafikler artık istatistiklerden sonra beliriyor** (önceden hepsi birlikte). Son görünüm aynı; arada grafik kartı
   dashboard'da boş, analytics'te mevcut parıltı durumunda.
4. **Analytics'te seyrek, küçük bir yerleşim kayması:** 21 denemenin 2'sinde ilk yüklemede KPI kartları 23 px kaydı
   (CLS 0.009; "iyi" eşiği 0.1). Baseline'da 6 denemede görülmedi. Olası neden: modül artık 3 CDN dosyasını beklemeden
   daha erken çalışıyor ve başlık satırı web fontu (Google Fonts) gelmeden çizilebiliyor. Kendi barındırılan font
   (parça 3) bunu kapatmalı. Lighthouse'ta analytics CLS önce de sonra da 0.03–0.05.
5. **Sayfalar önce ağ (2-pre):** tekrar açılışta HTML her seferinde ağa soruluyor (sayfa başına bir istek). Ağ 3 sn'de
   cevap vermezse eski kopya gösterilir.
6. **"N" kısayolu ve calendar'da ikinci açılış:** iş dışı, önceden de var (bkz. "Bilinen hatalar"); düzeltilmedi.
7. Test ortamı sınırı: tarayıcı denemeleri sahte oturumla yapıldı (gerçek Supabase gecikmesi yok). Gerçek hesapla
   ölçüm parça 3'te.

## Sonraki parça için notlar

- **Yeni gecikmeli yükleme:** `WwLazy` kullanın; CDN kütüphanesiyse `WwLazy.LIBS`'e ekleyin (sürüm tek yerde). Yerel
  dosya adreslerine `?v=__WW_BUILD_ID__` yazın (parça 1 kuralı; yoksa derleme hata verir).
- **Hızlı Ekle'ye yeni dosya** gerekiyorsa `quick-add-boot.js` içindeki `FILES` listesine sırasıyla ekleyin (test
  listeyi ve dosyaların varlığını kontrol ediyor). Sayfaya `<script>` olarak eklemeyin.
- `quickAddOpen()` artık Promise dönebilir (vekil); senkron açılmayı bekleyen yeni kod yazmayın, `quickAddLoad()`'u bekleyin.
- Dashboard / analytics'e yeni grafik eklerseniz `chartLibsReady()` kapısından geçirin (dashboard: `renderCharts`;
  analytics: `LIB_CHART_KEYS` + `EXPANDABLE_CHARTS`; test ikisinin aynı olduğunu kontrol ediyor).
- Analytics modülü SPA'da yaşamaya devam eder; bekleyen işleri `#dashboard-grid` varlığına bağlayın.
- Fontlar: risk 4 nedeniyle Google Fonts'u `/fonts/` altına taşımak hem indirmeyi hem kaymayı iyileştirir; `/fonts/*`
  immutable kuralı ve CSS `url(/fonts/...)` damgalaması parça 1'den hazır.
- **Giriş yapılmış ölçüm (parça 3'te şart).** İki yol var, ikisi de `scripts/perf/` ile. Araçlar repo dışına bir kez kurulur:
  ```bash
  mkdir ../perf-tools && cd ../perf-tools && npm init -y && npm i lighthouse@12.2.1 puppeteer-core@23.11.1 && cd -
  ```
  1. **Gerçek test hesabı (son ölçüm için önerilen).** Canlıda ya da Cloudflare önizleme adresinde, gerçekçi verisi olan
     ayrı bir test hesabı kullanılır. Login sayfasında Cloudflare Turnstile olduğu için giriş otomatik yapılamaz: bir kez
     görünür tarayıcıda elle giriş yapılır, oturum bir Chrome profil klasöründe kalır. DevTools'tan çerez / localStorage
     kopyalamak gerekmez.
     ```bash
     PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base https://<önizleme> --profile ../perf-profile --login
     PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base https://<önizleme> --profile ../perf-profile --pages dashboard,analytics,index --runs 3
     ```
     Her ölçümden önce HTTP önbelleği, Cache Storage ve service worker temizlenir, localStorage (oturum) korunur. Yani
     ölçüm "soğuk ama girişli" olur. Sayfa açmak veri yazmaz; ölçüm sırasında işlem eklemeyin. Test hesabı açmak ve ona
     veri girmek canlı DB'ye yazmak demek; hesabı siz açın ya da önce onay verin.
     ⚠️ `--login` modu bu oturumda gerçek hesap olmadığı için **denenmedi**; `--mock` modu denendi.
  2. **Sahte oturum (yerelde tekrarlanabilir karşılaştırma).** Supabase'e hiç istek gitmez; yukarıdaki parça 2 tabloları
     bununla alındı:
     ```bash
     node scripts/perf/cf-serve.mjs dist 8788
     PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base http://127.0.0.1:8788 --mock --pages dashboard,analytics --runs 3
     ```
     Ayrıca `scripts/demo/` (Playwright + yerel sahte Supabase + gerçekçi seed verisi) de giriş yapılmış sayfa açmak
     için kullanılabilir.
- Lighthouse oynaklığı yüksek: her sayfa için en az 3 çalıştırma yapıp ortanca değeri alın.

## Elle kontrol listesine eklenenler

- [ ] Network sekmesi (önbellek kapalı, mobil görünüm): dashboard açılışında `quick-add.js`, `parser-v2.js`,
      `apexcharts`, `lightweight-charts` YOK; aşağı kaydırınca grafik kütüphaneleri iniyor ve grafikler çiziliyor.
- [ ] Hızlı Ekle: dashboard, analytics, calendar, strategies, trades'te + butonu ilk tıkta açılıyor (yavaş 3G'de
      butonda kısa bekleme görünür), gerçek bir işlem ekleniyor, liste / istatistik yenileniyor; ikinci açılış anında.
- [ ] Boş hesapta (0 işlem) dashboard ve trades'teki "işlem ekle" bağlantısı Hızlı Ekle'yi açıyor.
- [ ] Hızlı Ekle'de Excel (.xlsx) ve CSV içe aktarma çalışıyor.
- [ ] Analytics: grafik kartlarının hepsi çiziliyor; kart sürükleme (fareyle ve telefonda) çalışıyor, sıra kayıtlı
      kalıyor; "Özelleştir" ile kart ekleme / çıkarma, grafik tipi değiştirme, grafik büyütme çalışıyor.
- [ ] Strategies: kart mini grafikleri, karşılaştırma grafikleri ve equity modalı çiziliyor.
- [ ] Backtest (geniş ekran): istatistik sekmesinde widget sürükleme ve boyutlandırma çalışıyor; ana grafik değişmedi.
- [ ] SPA geçişleri (dashboard ↔ analytics ↔ strategies ↔ trades): konsolda hata yok, kütüphaneler bir kez iniyor.
- [ ] Açık tema ve özel tema renkleri, Hızlı Ekle olan sayfalarda öncekiyle aynı (tema kodu ön yükleyiciye taşındı).
- [ ] Çevrimdışı (DevTools → Offline): daha önce açılmış bir sayfa yenilenince önbellekteki kopya geliyor; deploy
      sonrası ilk açılışta yeni sürüm geliyor.

# Parça 3 — Fontlar, küçük hatalar, gerçek hesapla ölçüm

Ortam: macOS 14 (Darwin 23.5), Chrome (headless, puppeteer-core 23.11.1), Lighthouse 12.2.1, Node 24. Araçlar repo
dışında (`PERF_DIR` = oturum scratchpad'i). Parça 1–2 Windows'ta ölçülmüştü: mutlak sayılar makineler arasında
karşılaştırılmamalı; her önce/sonra çifti aynı makinede, aynı koşulda alındı.

## CLS ölçüm yöntemi (3a'dan itibaren)

`scripts/perf/cls.mjs` (yeni): aynı sayfayı N kez **soğuk** açar (her denemede boş tarayıcı bağlamı: HTTP önbelleği, SW,
Cache Storage yok), **gerçek** ağ kısıtı (CDP: 150 ms RTT, 1.6 Mbps indirme, 750 Kbps yükleme) + 4× CPU, mobil ekran
(412×823, DPR 1.75, dokunmatik), sahte oturum. `layout-shift` girdileri kaynak öğe ve dikey kayma (px) ile yazılır;
sayfa açıldıktan sonra 9 sn izlenir. Parça 2'deki 21 deneme kısıtsız ağdaydı (kayma 2/21); kısıtlı ağda aynı kayma
**her denemede** çıkıyor, bu yüzden ölçüm artık kısıtlı ağda.

```bash
node scripts/perf/cf-serve.mjs dist 8788
PERF_DIR=<araçlar> node scripts/perf/cls.mjs --base http://127.0.0.1:8788 --mock --page analytics --runs 20
```

## Yapılanlar

### 3a — Fontlar kendi sunucumuzdan · `<3a>`

- **Dosyalar** (`public/fonts/`): Google Fonts'un sunduğu dosyaların **aynısı** (Geist v5, Geist Mono v6, Syne v24;
  değişken font, SIL OFL 1.1 — lisans metinleri `OFL-*.txt`), yalnızca **latin + latin-ext** (6 dosya, toplam 130 KB;
  cyrillic / vietnamese / greek / symbols2 alınmadı). `unicode-range` Google'ınkiyle aynı; Türkçe (ç ğ ı İ ö ş ü) ve
  Almanca (ä ö ü ß ẞ) kapsanıyor (test ediliyor). `₺` ve `→` Google'ın dosyalarında da yoktu, eskisi gibi sistem fontuyla çizilir.
- **`/fonts/fonts.css`**: 6 `@font-face`, `font-display: swap`, ağırlıklar önceki istekle aynı (Geist 400–800, Mono
  400–700, Syne 600–800). `BaseHead.astro`'dan **her sayfaya** normal stylesheet olarak (aynı origin, ~1.5 KB gzip,
  immutable). `url()`'lere derleme `?v=<build>` ekliyor (parça 1 kuralı).
  - Önceden: uygulama sayfaları `display=block` + engelleyen Google CSS'i; giriş/tanıtım sayfaları engellemeyen
    (`media=print`) Google CSS'i; index ve about/contact/privacy/terms buna ek olarak ikinci bir Google CSS'i
    (400/500/600) yüklüyordu. İkisi birlikte 400–800 aralığına eşdeğer olduğu için tek dosya son görünümü değiştirmiyor.
  - `fonts.googleapis.com` / `fonts.gstatic.com` preconnect'leri ve tüm bağlantıları kaldırıldı (test: kaynakta hiç geçmiyor).
- **Preload** (BaseHead, her sayfa): `geist-latin.woff2` ve `geist-latin-ext.woff2` (gövde metni; sayfaların sabit
  metni Türkçe olduğu için latin-ext İngilizcede de kullanılıyor — "kullanılmayan preload" uyarısı yok). Syne ve Geist
  Mono preload edilmedi: yavaş ağda 4 fontu önden çekmek CSS/JS ile yarışır; geç gelseler de yedek metrikler sayesinde
  yerleşim kaymaz.
- **Yedek font metrikleri:** `Geist Fallback` (4 yüz: 100–449 / 450–549 Arial, 550–649 / 650–900 Arial Bold),
  `Geist Mono Fallback` (Courier New), `Syne Fallback` (2 yüz, Arial Bold); Android için aynı yüzlerde `local('Roboto')`.
  `size-adjust` Chrome'da TR/EN/DE arayüz metniyle ağırlık başına ölçüldü (ör. Geist 400 ÷ Arial = %101.92, Syne 700 ÷
  Arial Bold = %114.59); `ascent/descent/line-gap-override` font tablolarından (Geist 1005/295/0, Syne 925/275/0, ÷
  size-adjust). Yedek yüzlerin `unicode-range`'i yalnızca web fontunda gerçekten bulunan karakterler: olmayanlar
  (`→`, `₺`) eskisi gibi sistem fontuna düşer, son görünüm değişmez. Font değişkenlerine yedek aile web fontunun hemen
  arkasına eklendi (`styles.css` `--font/--font-mono/--font-display`, giriş sayfaları, `landing-glass/preview`,
  `page-chrome`). Grafiklerdeki sabit `'Geist', system-ui` yazıları (ApexCharts/canvas) değişmedi.
- **Yedek metriklerin etkisi** (font dosyaları engellenmiş hâl ↔ fontlu hâl, aynı sayfa; ">2 px kayan öğe / en büyük dy"):

  | Sayfa | Önce (sistem fontu) | Sonra (ayarlı yedek) |
  |---|---|---|
  | masaüstü trades | 364 öğe / 16 px | **0 / 0** |
  | masaüstü index | 7 / 5 px | **0 / 0** |
  | masaüstü about | 19 öğe kayıyor | **0 / 0** |
  | dashboard (mobil / masaüstü) | 0 / 2 px · 0 / 1 px | **0 / 0** |
  | analytics (mobil / masaüstü) | 0 / 1 px | **0 / 0** |
  | mobil index | 1 / 39 px | 2 / 32 px (`.sc-cap` başlığı bir satır farklı kırılıyor) |

- **CLS (analytics, mobil, yavaş 4G, 20'şer deneme):**

  | | kaymalı deneme | CLS ortanca / en yüksek | kayma |
  |---|---|---|---|
  | Önce (parça 2 sonu) | 20 / 20 | 0.0315 / 0.0315 | ~3.6 sn'de KPI'lar + başlık araçları 23 px |
  | 3a sonrası | 20 / 20 | 0.0315 / 0.0315 | ~3.2 sn'de aynı 23 px |

  **Kaymanın nedeni font değil.** Zaman çizelgesi (yavaş 4G): fontların hepsi 3.05 sn'de yüklenmiş, başlık 3.5 sn'de
  çiziliyor; kayan şey başlıktaki bilgi satırı `#pro-header-meta`. Yükleniyorken "Ana Hesap · Tümü · 0 kapanmış işlem"
  (21 px, 300 px genişlikte parıltı) yazıyor, veri gelince "· Son işlem 30 Eki 2026" ekleniyor ve satır telefonda iki
  satıra (44 px) çıkıp altındaki KPI kartlarını 23 px itiyor. Düzeltme ayrı adımda (3a-2).
- **Görünüm:** 12 sayfa × (1440×900, 390×844) son hâl ekran görüntüsü, önce/sonra piksel karşılaştırması: 22/24 görüntü
  **0 piksel fark**. analytics (masaüstü) aynı build'in iki çalıştırması arasında da 699–1726 piksel oynuyor (zamanla
  değişen içgörü kartı), backtest 19 piksel (ikisinde de aynı). strategies (masaüstü) 218 piksel: karşılaştırma
  grafiğinin y ekseni ~3 px dar; ApexCharts eksen genişliğini çizim anında ölçüyor, baseline'da Google fontu henüz
  gelmemişken ölçülüyordu. Fontlar önbellekteyken (ikinci açılış) baseline ile yeni build **6/6 görüntüde 0 piksel fark**:
  yeni build her seferinde "font yüklü" sonucunu veriyor.
- Ölçüm araçları: `scripts/perf/cls.mjs` (yeni), `scripts/perf/chrome-path.mjs` (macOS/Windows/Linux Chrome yolu;
  `lighthouse.mjs` artık bunu kullanıyor), `scripts/perf/readonly-guard.mjs` (3e için: gerçek hesapla açılan sayfada
  Supabase'e yazan istekleri engeller; ayrıntı 3e). `.gitignore`: `.perf-profile/` (gerçek oturumlu Chrome profili).
- Dosyalar: `public/fonts/{fonts.css, 6 × woff2, OFL-Geist.txt, OFL-GeistMono.txt, OFL-Syne.txt}`,
  `src/components/BaseHead.astro`, `src/pages/index.astro`, `src/layouts/PageLayout.astro`, `public/styles.css`,
  `public/{landing-glass,landing-preview,page-chrome}.css`, `src/pages/{login,register,forgot-password,update-password}.astro`,
  `tests/fonts.test.js` (yeni, 12 test), `scripts/perf/*`, `.gitignore`.
- `npm run build` ✓, `npm test` ✓ (568 test, 0 hata; parça 2 sonunda 556).

# Bilinen, bu işten bağımsız hatalar

Düzeltilmedi, yalnızca listelendi. Kaynak: parça 1 tarayıcı taraması (oturumsuz 8 sayfa: index, login, register,
dashboard, analytics, trades, settings, backtest), parça 1 statik referans kontrolü ve parça 2 sahte oturumlu denemeler.
Hepsi baseline'da (parça 1 öncesi ya da parça 1 sonu) da aynı.

| Sayfa | Ne | Nerede |
|---|---|---|
| `/quick-add-modal.html` | **404** `/js/quick-modal.js` | `src/pages/quick-add-modal.astro:26` (dosya repoda hiç yok) |
| `/login.html`, `/register.html` (ve login'e yönlenen dashboard, analytics, trades, backtest) | 2 konsol hatası: `%c%d font-size:0;color:transparent NaN` ve `%c%o font-size:0;color:transparent [object]` | Cloudflare Turnstile iframe'i (`challenges.cloudflare.com/.../turnstile/...`); üçüncü taraf, repo kodu değil |
| index, settings (oturumsuz → index) | temiz | — |
| Uygulama sayfaları (sahte oturum: dashboard, analytics, calendar, strategies, trades, backtest) | 404 / konsol hatası yok | — |
| Hızlı Ekle olan tüm sayfalar | **"N" kısayolu hiç çalışmıyor.** Kısayol, sayfada `[role="dialog"][aria-modal="true"]:not([hidden])` varsa çıkıyor; kapalı yükseltme penceresi `.ww-up-modal` bu öznitelikleri taşıyor ve `hidden` değil. Önceden quick-add'in kendi tarih seçicisi (`qa-date-picker`) de aynı nedenle engelliyordu | kısayol: `public/components/navbar/navbar.js`; pencere: `src/components/UpgradeModal.astro:5` |
| `/calendar.html` | Hızlı Ekle ile işlem kaydedildikten sonra + butonuna tekrar basınca pencere açılmıyor (testte; baseline'da da aynı) | nedeni araştırılmadı |
| navbar | `#nav-add-trade` tıklama dinleyicisi var ama bu id'li buton hiçbir yerde oluşturulmuyor | `navbar.js` |
| — | Kullanılmayan bileşenler: `src/components/quick-add/*.tsx`, `QuickAddFAB.tsx`, `QuickAddModal.astro` | ölü kod |
