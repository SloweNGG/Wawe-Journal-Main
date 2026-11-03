# Canlıya giden trafik — ilerleme kaydı

Dal: `fix/live-traffic` (kaynak: `master`, 252c2db). `perf/tonight` bu dala birleştirilmedi.

**Durum:** `tamamlandı` (Sorun 1: Supabase Storage cached egress 5,2 / 5 GB; Sorun 2: Realtime `JwtSignatureError` döngüsü;
ortak kural: ölçüm / test araçlarından canlıya kaçak trafik).

## Sorun 1 — Storage egress

### 1a — Storage'dan dosya çeken her yer

Arama: `storage.from(…)`, `.download(`, `getPublicUrl`, `createSignedUrl`, `/storage/v1/`, `supabase.co/storage` (tüm repo,
`src/`, `public/`, `supabase/functions/`, `scripts/`, `tests/`) ve git geçmişi (`git log -S`, tüm dallar).

| # | Nerede | Sayfa | Ne sıklıkla | Boyut | Önbellek |
|---|---|---|---|---|---|
| 1 | `public/components/navbar/navbar.js` `applyAvatarToNav` + `src/components/Navbar.astro:244` (erken senkron) | tüm uygulama sayfaları (navbar) | her **tam** sayfa yüklemesinde `<img>`; SPA geçişlerinde navbar kalıyor | yüklenen dosyanın **orijinali**, en çok 2 MB (`settings.js` sınırı, küçültme yok; navbar'da ~32 px). Test hesabı: 24.7 KB | `Cache-Control: max-age=3600` (yüklemede `cacheControl: '3600'`); dosya adı her yüklemede yeni (`<uid>_<Date.now()>.<ext>`) |
| 2 | `public/interface/strategies/js/strategies.js:272`, `public/interface/analytics/js/dashboard-manager.js:872` | strategies, analytics | sayfa açılışında, aynı avatar adresi (tarayıcı önbelleğinden) | = 1 | = 1 |
| 3 | `public/settings/js/settings.js` `loadAvatar` / `uploadAvatar` | settings | açılışta önizleme; yüklemede `upload` + eski dosyaları `list` / `remove` | = 1 | = 1 |
| 4 | `public/interface/admin/js/admin-core.js:209` `avatarMarkup` | admin (kullanıcı listeleri) | admin sayfası açılışında **her kullanıcının** avatarı (`loading="lazy"`) | kullanıcı başına ≤ 2 MB | = 1 |
| 5 | `public/interface/admin/js/admin-dashboard.js:1822` | admin (hata raporları) | rapor listesi açılınca ekran görüntüsü | tarayıcıda 1280 px JPEG'e sıkıştırılıyor (~100–300 KB) | `cacheControl: '3600'` (`report-bug.astro:1943`) |
| 6 | `public/src/services/stats.js` `uploadReferenceImage` / `loadReferencesToPage`, `admin-data.js:445` | — | yalnızca admin yüklemesi; `loadReferencesToPage` **hiçbir sayfada çağrılmıyor** (`#references-grid` yok) | — | — |
| 7 | `candles` bucket (`supabase/migrations/202610180003…`, `…0007…`) | — | **master'da okuyan istemci yok**: backtest sentetik veri (`bt-data.js`) ya da cTrader (`bt-ctrader.js` → Edge Function `ctrader-candles`, Storage'a dokunmaz) | — | cTrader ayları tarayıcıda IndexedDB'de (`ww_bt_ctrader`, kullanıcı başına); sunucu tarafında mum saklanmıyor |
| 8 | **Geçmiş:** `src/pages/index.astro` `<video src=".../storage/v1/object/public/landing-assets/dashboardlong.mp4" autoplay loop muted playsinline preload="auto">` + `Video%20Project%208.mp4` | **landing (oturumsuz her ziyaretçi, botlar dahil)** | her landing ziyaretinde, `preload="auto"` ile tamamı | video (boyutu bilinmiyor; dosyalar silinmiş) | — |

- İmzalı URL (`createSignedUrl`) ve `.download()` **hiç yok**; "her açılışta yeniden üretilen imzalı URL" sorunu bu kodda yok.
- Satır 8: `1c20a13` (2026-10-10, "integrate supabase cdn videos for hero…") ile eklendi, `6fccf99` (2026-10-16) ile ana sayfaya
  taşındı, `1d15605` (2026-10-23, landing yenilemesi) ile kaldırıldı. İki dosya da bugün Storage'da yok (HTTP 400). Canlı
  `/`, `/about`, `/login`, `/pricing` HTML'inde Storage adresi yok; repoda (tüm dallar dahil `master`'da) yok.
- Backtest mum verisi: Storage'dan değil. Edge Function yanıtı "uncached egress"e sayılır, "cached egress"e değil; ve tamamlanmış
  aylar zaten IndexedDB'de tutulduğu için aynı ay bir kez iner.

**Değerlendirme.** Bugünkü kodda Storage'dan inen tek şey avatarlar (ve admin'de hata raporu görüntüleri). 7 kullanıcıyla bunlar
5,2 GB üretemez: avatar en çok 2 MB, saatte en çok bir kez (sonrası çoğunlukla `ETag` ile 304). Bu miktar için en güçlü aday
**10–23 Ekim arasında landing'de otomatik oynayan iki Storage videosu**: oturumsuz her ziyaretçi (ve tarayıcı önizleme /
tarama botları) videoları baştan sona indiriyordu ve "7 aktif kullanıcı" sayısına girmiyorlardı. Bunun doğrulanması için
Supabase panosundaki günlük "Cached Egress" grafiğine bakmak gerekiyor (bkz. "Sizden gerekenler"). Canlı veritabanında
`storage.objects` okuması bu oturumda izin almadığı için yapılmadı.

- Test: `tests/no-storage-media.test.js` (yeni): `src/` ve `public/` içinde Supabase Storage adresi (`supabase.co/storage`)
  yazılamaz; büyük / herkese açık medya `public/` altından (Cloudflare) verilmeli.

### 1b — Tekrarlanan indirmeler · `3228a2c`

| Madde | Durum / yapılan |
|---|---|
| Değişmeyen dosyalara uzun `Cache-Control` | Avatar ve hata raporu görüntüsü yüklemesi `cacheControl: '3600'` → **`'31536000'`** (1 yıl). İkisinin de adı her yüklemede yeni, içerik hiç değişmiyor. (`settings.js`, `report-bug.astro`) |
| Mevcut dosyalar (1 saatlik önbellekle yüklenmiş) | Storage meta verisine yazmak canlıya yazma olduğu için **dokunulmadı**. Bunun yerine service worker (`public/sw.js`) `…/storage/v1/object/public/avatars/…` adreslerini **önce önbellekten** veriyor: ayrı, deploy'da silinmeyen `wawe-storage-v1` önbelleği, en çok 40 dosya, CORS ile (Storage `access-control-allow-origin: *` döner; opak yanıt yok). Sorgu dizgili adresler, diğer bucket'lar, imzalı adresler ve REST'e dokunulmuyor. `CACHE_VERSION` `wawe-v51` → `wawe-v52`. |
| Orijinal boyutta avatar (≤ 2 MB, ~32 px gösteriliyor) | Yüklemeden önce tarayıcıda en uzun kenar **256 px**, WebP (desteklenmezse JPEG) 0.86; sonuç büyükse orijinal. GIF / SVG olduğu gibi. Chrome'da: 1600×1600 JPEG 578 KB → 256×256 WebP 37 KB; 3000×2000 PNG 381 KB → 47 KB. Mevcut avatarlar kullanıcı yeniden yükleyene kadar eski boyutunda kalır. |
| Her açılışta yeniden üretilen imzalı URL | Kodda imzalı URL yok (1a). |
| Aynı oturumda aynı dosyayı bir kez indir | Aynı adres: tarayıcı önbelleği + artık SW önbelleği. |
| Büyük ve değişmeyen veri için IndexedDB / Cache Storage | Backtest cTrader ayları zaten IndexedDB'de (1a, satır 7). Avatarlar artık Cache Storage'da. |
| Kullanıcının görmediği veriyi önden indirme | Landing videoları (`preload="auto"`) 23 Ekim'de kalkmıştı; `tests/no-storage-media.test.js` geri gelmesini engelliyor. Admin avatarları ve hata raporu görüntüleri zaten `loading="lazy"`. |

- Test: `tests/sw-storage.test.js` (yeni; ilk istek ağdan CORS ile, ikincisi önbellekten; başka bucket / sorgu / REST dokunulmuyor;
  40 dosya sınırı; `activate` avatar önbelleğini silmiyor; yükleme 256 px + 1 yıl + benzersiz ad).
- `.gitignore`: `.perf-profile/` (perf/tonight'taki satır bu dalda yoktu).
- `npm run build` ✓, `npm test` ✓ (514 test).

### 1b-2 — Kök neden: avatar adresine her çizimde `?t=Date.now()` · `ed2b0a0`

- 1c ölçümünde bulundu: `navbar.js` `applyAvatarToNav` navbar avatarına ve menü avatarına, `settings.js` dört yerde
  (`user-avatar`, `sb-avatar`, `avatar-img`, `popup-avatar-img`) her çizimde `?t=' + Date.now()` ekliyordu. Her tam sayfa
  açılışında adres yeni → tarayıcı önbelleği, CDN önbelleği ve (1b'deki) SW önbelleği hiç işlemiyor; avatar **sayfa başına iki
  kez, orijinal boyutunda (≤ 2 MB)** Storage'dan iniyordu. Örnek: 1.5 MB avatar × 2 × ~1.700 sayfa görüntüleme ≈ 5 GB.
  7 kullanıcı için bu, landing videolarından bağımsız olarak kotayı tek başına aşabilecek bir miktar.
- Gereksizdi: dosya adı her yüklemede yeni (`<uid>_<Date.now()>.<uzantı>`), yeni avatarın adresi zaten farklı.
- Düzeltme: 6 yerde `?t=` kaldırıldı. Test (`tests/sw-storage.test.js`): avatar gösteren 6 dosyada görsel adresine
  `?t=` / `Date.now()` / `Math.random()` sorgusu eklenemez (eski kodda 2 test başarısız oluyor, denendi).
- `npm run build` ✓, `npm test` ✓ (520 test).

### 1c — Tipik oturumda Storage baytı: önce / sonra · `398961c`

Yöntem: `scripts/perf/storage-session.mjs` (yeni). Sahte oturum (canlıya istek yok), tek tarayıcı profili (HTTP önbelleği ve
service worker adımlar arasında kalır, gerçek kullanıcı gibi). 1. gün: dashboard aç → backtest'e geç → hesaba gir → sayfayı
yenile → dashboard'a dön. 2. gün: HTTP önbelleği temizlenir (1 saatlik önbelleğin bayatlaması / tarayıcı temizliği; SW ve Cache
Storage kalır), aynı tur. Avatar sahte arka uçtan, `ETag` ile (304 desteklenir). "Önce" = `master` (252c2db) build'i,
"sonra" = bu dal.

| Senaryo | Storage'dan inen (200) | 304 |
|---|---|---|
| **Önce**, 1.5 MB avatar (`max-age=3600`) | **14 indirme, 21.4 MB** (1. gün 9.2 MB, 2. gün 12.2 MB; adım başına 1–3 indirme) | 0 |
| Sonra, **aynı eski avatar** (yeniden yüklenmemiş, 1.5 MB, `max-age=3600`) | **2 indirme, 3.0 MB** (ilk dashboard: SW henüz sayfayı kontrol etmiyor; ilk backtest: SW önbelleğe alıyor), sonra 0 | 0 |
| Sonra, **yeni yüklenen avatar** (256 px, 55 KB, `max-age=31536000`) | 2 indirme, 0.11 MB, sonra 0 | 0 |

- "Önce"de hiç 304 yok: her istek yeni bir `?t=` adresi olduğu için koşullu istek bile yapılmıyor (1b-2).
- Hesap: master'da bu oturum ≈ 21 MB; 7 kullanıcı × günde ~1 böyle oturum × 30 gün ≈ 4.5 GB. Avatarı olan her kullanıcıda
  sayfa açılışı başına ~2 × avatar boyutu. Avatarı olmayan kullanıcı Storage'dan hiç indirmez.
- Ölçüm yöntemi düzeltmesi (araçlarda): Puppeteer'ın `setRequestInterception` açıkken Chrome **HTTP önbelleğini kapatıyor ve
  service worker'ı atlıyor**; önbellek ölçümleri bu yüzden yanlış çıkıyordu. `mock-session.mjs` artık sahte cevapları CDP
  `Fetch` ile veriyor (önbellek ve SW gerçek tarayıcıdaki gibi çalışır), service worker'ın kendi isteklerini de
  `watchWorkers(browser, backend)` ile cevaplıyor (sayfa oturumu bunları görmez; olmasa SW canlıya giderdi), Realtime
  WebSocket'lerini sayfa içinde sahte bir Phoenix sunucusuyla cevaplıyor (`fake-realtime.mjs`; bkz. Sorun 2) ve güvenlik ağı
  olarak sahte modda Chrome'a `*.supabase.co`'yu çözümletmiyor (`MOCK_CHROME_ARGS`; `storage-session.mjs` kullanıyor, diğer
  araçlar adım 3'te).
- `scripts/perf/` bu dala `perf/tonight`'tan (a317f4b) alındı: `cf-serve`, `chrome-path`, `cls`, `lighthouse`, `readonly-guard`
  aynı; `mock-session` yukarıdaki gibi değişti; `fake-realtime`, `storage-session` yeni. İki dal birleşirken `scripts/perf/`'te
  bu dalın sürümü alınmalı.
- Komut: `node scripts/perf/cf-serve.mjs dist 8788` ve
  `PERF_DIR=<araçlar> node scripts/perf/storage-session.mjs --base http://127.0.0.1:8788 [--avatar-kb 1500] [--avatar-cache max-age=3600]`.
- `npm run build` ✓, `npm test` ✓ (520 test).

### 1d — Parça 1–3 ölçümleri ve testler canlı Storage'a gitti mi? · `fe19b42`

| Kaynak | Canlı Storage | Not |
|---|---|---|
| `npm test` (`tests/*.test.js`) | **0** | Ağ yok; URL'ler yalnızca dizgi, `fetch` sahte (vm). |
| `tests/smoke/` (backtest) | **0** | Sayfa gövdesi `__bt.html`; `window.sb = {}` ya da yerel `FakeDb` (`make.py`). |
| `scripts/demo/` | **0** | Playwright `context.route` (REST/Auth/Storage) + `routeWebSocket` (Realtime) yerelde. |
| Parça 1 (oturumsuz Lighthouse, login sayfası) | **0** | Oturum yok → avatar yok. |
| Parça 2 ve 3, **sahte oturum** (`mock-session.mjs`) | **0** | Supabase'e giden tüm HTTP (Storage dahil) yakalanıp yerelde cevaplandı; sahte profilde avatar yok. **Ama Realtime WebSocket'leri yakalanmadı** → canlı Realtime'a sahte JWT ile bağlandı (Sorun 2). |
| Parça 3, **gerçek test hesabı** (3e) | **≈ 4 MB** | Test hesabının avatarı 24.7 KB ve her sayfa açılışında `?t=` ile ~2–3 kez indi. Kayıtlı 20 Lighthouse raporunda 63 indirme = 1.55 MB (ölçüldü). Kaydedilmeyenler (tahmin): 12 Lighthouse çalıştırması ≈ 0.9 MB, 22 `cls.mjs --profile` sayfası ≈ 1.1–1.6 MB, 4 LCP gözlemi ≈ 0.2 MB, giriş penceresindeki canlı dashboard ≈ 0.1 MB. |

Toplam ≈ **4 MB**, 5.2 GB'ın ~%0.08'i. Ölçüm araçları Storage kotasının nedeni değil. Gerçek hesap ölçümleri REST'e de gitti
(okuma; 20 raporda ~800 istek, ~780 KB) ama o "cached egress" değil.

## Sorun 2 — Realtime `JwtSignatureError` döngüsü

### 2a — Realtime'a bağlanan yerler ve ritmi üreten mantık · `59667cd`

| Yer | Kanal | Ne zaman | Hata ele alınıyor mu |
|---|---|---|---|
| `public/components/navbar/navbar.js:597` `loadNotifications` | `realtime_user_notifications_<uid>` (`notifications`, `user_id=eq.<uid>`) | navbar olan her sayfada, `getSession()` bir kullanıcı döndürünce | **Hayır**: `.subscribe()` geri çağrısız |
| `public/src/services/payment.js:400` `checkAndSyncPaymentStatus` (bundle.js) | `ww_plan_listener_<uid[0..8]>` (`user_profiles` UPDATE) | bundle olan her sayfada (index dahil) | **Hayır** |
| `public/interface/admin/js/admin-data.js:140, 197` | `admin-user-profiles-live`, `admin-payments-live` | yalnızca admin paneli | durum geri çağrısı var, döngü durdurma yok |

Yeniden üretme (canlıya gitmeden): `scripts/perf/realtime-check.mjs` — sahte oturum + sayfa içinde sahte Phoenix sunucusu
(`fake-realtime.mjs`), dashboard 60 sn, `master` build'i:

| Sunucunun `phx_join` cevabı | 60 sn'de katılma | Ritim |
|---|---|---|
| ok | 2 | iki kanal bir kez katılır |
| **error `JwtSignatureError: Failed to validate JWT signature`** | **18, durmuyor** | iki kanal × supabase-js / Phoenix `rejoinAfterMs` = 1 s, 2 s, 5 s, sonra **her 10 s** → kararlı durumda **dakikada 12** |
| aynı hata + sunucu soketi kapatır | **117** | her saniye yeni soket (`reconnectAfterMs` 1 s'den başlar, kanal katılınca sıfırlanıyor) |
| error `Token has expired` | 18 | aynı |

- **Ritmi üreten:** supabase-js'in varsayılanı (`@supabase/phoenix` `Channel.rejoinTimer` + realtime-js `RECONNECT_INTERVALS
  [1000, 2000, 5000, 10000]`, sınırsız). **Durmamasının nedeni bizim kod:** iki kanal da hata durumunu dinlemeden açılıyor;
  token hiç değişmediği (yenilenmediği) için her deneme aynı token'la reddediliyor ve sonsuza kadar sürüyor.
- Gözlenen "dakikada 12" oranı birebir aynı (2 kanal × her 10 s). Log'daki "4.0 s arayla 3 deneme, ~7 s bekleme" gruplanması
  bizim ölçümümüzde "0.3 s arayla 2 deneme, ~10 s bekleme"; oran aynı, gruplama sunucu log zaman damgalarından olabilir.
- **Kaynak (büyük olasılıkla):** Parça 2 ve 3'ün **sahte oturumu**. Sahte JWT'nin imzası `.sig` (geçersiz); HTTP istekleri
  yakalanıyordu ama Puppeteer istek yakalaması WebSocket'leri görmez → her sahte oturumlu sayfa canlı Realtime'a bu token'la
  bağlandı. 2026-11-03 06:00–06:08 UTC (09:00–09:08 yerel) = sıralı 20 denemelik CLS ölçümleri (her sayfa ~70 sn açık, tek
  istemci), 06:09–06:26 UTC = paralel ekran görüntüsü / sürükleme / "N" denemeleri (birden çok istemci). 05:42 UTC'den beri
  sürüyordu; Parça 2 (Windows, önceki günler) da aynı şeyi yapmış olmalı. Gerçek kullanıcıda imza hatası ancak başka projenin /
  dönmüş bir JWT anahtarının token'ı localStorage'da kalırsa olur; ama süresi dolmuş token (`Token has expired`) aynı döngüyü
  kurar.
- Ek bulgu (araçta, uygulamada değil): sahte oturum her yeni sayfada oturumu yeniden yazıyordu. Süresi dolmuş + yenilenemeyen
  oturum senaryosunda bu, login ↔ dashboard yönlendirme döngüsü kuruyordu (15 sn'de 645 geçiş); oturum artık sekme başına bir
  kez yazılıyor. Gerçek tarayıcıda (oturum silinince geri gelmez) 1 yenileme denemesi + login'e yönlendirme, Realtime'a hiç
  bağlanma yok — master'da da.
- Araç: `scripts/perf/realtime-check.mjs` (`--rt ok|jwt-error|jwt-expired [--close] --session valid|expired|none`);
  `mock-session.mjs`: `auth: 'refresh-fails'` (yenileme 400, `/auth/v1/user` 401), `expired`, `withSession`, `/auth/v1/token` geçerli
  oturum döner.

### 2b — Geçersiz token'la sonsuz deneme yok · `ae25459`

- Yeni `public/interface/shared/realtime-guard.js` (`window.WwRealtime.subscribe(sb, ad, kur)`), `BaseHead.astro` uygulama
  sayfalarında navbar ve bundle'dan önce yükleniyor. İki kanal da (navbar bildirimleri, payment.js plan dinleyicisi) bunu
  kullanıyor; yardımcı yüklü değilse (landing) kanal **açılmıyor** (eski sonsuz denemeye düşülmesin).
  - Kanal yalnızca **geçerli (süresi dolmamış) oturum** varken açılır; yoksa `SIGNED_IN` / `TOKEN_REFRESHED` beklenir.
  - Açmadan önce ve her token yenilemesinde **`realtime.setAuth(token)`**.
  - Katılma token hatasıyla (`jwt|token|signature|expired|unauthorized…`) reddedilirse kanal **hemen kaldırılır** (supabase-js'in
    yeniden deneme zamanlayıcısı durur), oturum **bir kez** `refreshSession()` ile yenilenir; yeni token farklıysa kanal bir kez
    yeniden açılır, değilse ya da yine reddedilirse **kapalı kalır** (konsola bir uyarı). Durmuş kanal yalnızca reddedilenden
    farklı yeni bir token gelirse, sayfa başına en çok 3 kez yeniden açılır. Ağ hatası gibi diğer hatalarda supabase-js'in
    normal yeniden bağlanması sürer. Çıkışta (`SIGNED_OUT`) kanallar kaldırılır.
- `public/src/bundle.js` yeniden üretildi (`esbuild public/src/script.js --bundle --format=esm --minify`; mevcut kaynaklardan
  üretilen çıktının repodakiyle bayt bayt aynı olduğu önce doğrulandı, fark yalnızca payment.js). `tests/bundle-sync.test.js`
  bundle'ın kaynakla aynı kaldığını kontrol ediyor.
- İlk sürümde bir döngü vardı (tarayıcı testinde yakalandı, commit'ten önce düzeltildi): `refreshSession()`'ın yaydığı
  `TOKEN_REFRESHED` olayı durmuş kanalı yeniden açıyordu → 45 sn'de 6.733 katılma, 3.367 yenileme. Şimdi yalnızca farklı token +
  üst sınır.

Tarayıcıda (`realtime-check.mjs`, dashboard, 45 sn; sahte sunucu; canlıya gitmez):

| Senaryo | Önce (master): katılma / yenileme | Sonra: katılma / yenileme |
|---|---|---|
| geçerli oturum, sunucu ok | 2 / 0 | 2 / 0 |
| **imza geçersiz** (`JwtSignatureError`) | **14 / 0, sürüyor** (dakikada ~12) | **2 / 2, sonra sessiz** |
| imza geçersiz + sunucu soketi kapatır | **87 / 0** (44 soket) | 2 / 2 (3 soket) |
| sunucu "token süresi dolmuş" der | 14 / 0, sürüyor | 2 / 2, sonra sessiz |
| süresi dolmuş + yenilenemeyen oturum | 0 / 1 → login | 0 / 1 → login |
| hiç oturum yok | 0 / 0 (login) | 0 / 0 (login) |

- Test: `tests/realtime-guard.test.js` (yeni, 11 test: geçerli oturum; imza hatası → bir yenileme, bir tekrar, dur; yenileme
  başarılı → yeni token'la katılım; yenileme başarısız → tek deneme; süresi dolmuş → yeni token gelene kadar kanal yok;
  oturum yok; çıkış; ağ hatası supabase-js'e bırakılır; `TOKEN_REFRESHED` yayan yenileme döngü kurmaz; durmuş kanal yeni token'la
  en çok 3 kez; iki uygulama kanalı + BaseHead + bundle). `tests/bundle-sync.test.js` (yeni).
- Admin paneli kanallarına (`admin-data.js`) dokunulmadı: zaten durum geri çağrıları var ve yalnızca admin açıyor.
- `npm run build` ✓, `npm test` ✓ (532 test).

## Ortak kural — canlıya kaçak trafik (3) · `<3>`

- Yeni `scripts/perf/live-guard.mjs`:
  - `watchLive(browser, { fulfilled })`: tarayıcının her hedefinde (sayfa, service worker, diğer worker'lar) CDP Network
    olaylarıyla `*.supabase.co`'ya giden HER isteği (REST, Auth, Storage, Edge Function) ve gerçek WebSocket açılışını
    (Realtime) sayar: **sahte** (mock cevapladı), **önbellek/SW**, **CANLI** (ağa çıktı / çıkmaya çalıştı), **WebSocket**.
    Bitmemiş istek güvenli tarafta "canlı" sayılır; CORS ön istekleri asıl istekle sayılır; WebSocket adresindeki `apikey`
    yazdırılmaz. `assertNoLive()`: canlı + WebSocket > 0 ise hata.
  - `closeBrowser(browser[, profilKlasörü])`: kapatır, ana süreç ve aynı profil klasörünü kullanan tüm Chrome süreçleri bitene
    kadar bekler (8 sn); kalan varsa öldürür ve hata fırlatır.
- Sahte modda tüm araçlar Chrome'u `--host-resolver-rules=MAP *.supabase.co ~NOTFOUND` ile açıyor (güvenlik ağı: sayaç
  bir şeyi kaçırsa bile bağlantı kurulamaz).

| Araç | Sahte modda | Gerçek hesap modunda |
|---|---|---|
| `scripts/perf/lighthouse.mjs --mock` | her çalıştırmada sayım; kaçak varsa **hata (çıkış kodu ≠ 0)**; süreç kontrolü | sayım raporlanır (salt okuma koruması zaten yazmaları engelliyor); süreç kontrolü; giriş penceresinde profil klasörüyle süreç kontrolü |
| `scripts/perf/cls.mjs --mock` | tüm denemeler tek sayaçta; kaçak → hata; süreç kontrolü | sayım raporlanır |
| `scripts/perf/storage-session.mjs`, `realtime-check.mjs` | yalnızca sahte; kaçak → hata; süreç kontrolü | — |
| `tests/smoke/run.mjs` (backtest) | sayfa ağ değil `window.sb` sahtesiyle çalışır: **herhangi** bir supabase.co isteği → senaryo başarısız; süreç kontrolü | — |
| `scripts/demo/browser.mjs` (Playwright) | `route` ile yerelde cevaplananlar "yerel"; başka yoldan ağa çıkan / DNS'e takılan supabase isteği ya da CDP'de görülen gerçek WebSocket → `close()` hata; `close()` bu çalıştırmanın açtığı Chrome süreçlerinin bittiğini doğrular. `CHROME=` ile sistem Chrome'u kullanılabilir | — |
| `npm test` | ağa çıkmıyor (vm + sahte fetch) | — |

Doğrulama (bu makinede):

| Çalıştırma | supabase.co istekleri | canlı | gerçek WebSocket | süreçler |
|---|---|---|---|---|
| `realtime-check.mjs` (15 sn) | 60 (hepsi sahte) | 0 | 0 | kapandı |
| `storage-session.mjs` | 394 (387 sahte, 7 SW önbelleği) | 0 | 0 | kapandı |
| `cls.mjs --mock` (2 deneme) | 148 (sahte) | 0 | 0 | kapandı |
| `lighthouse.mjs --mock` (1) | 68 (sahte) | 0 | 0 | kapandı |
| `tests/smoke/run.mjs sb ct` | 0 | 0 | 0 | kapandı, senaryolar geçti |
| demo (`launch` + giriş + dashboard) | 31 (yerel) | 0 | 0 | kapandı |
| **kasıtlı kaçak** (sahte Realtime'sız sayfa + yakalanmayan sekmeden fetch) | 62 | **1** | **3** | → `assertNoLive()` **hata verdi** (beklenen) |

Her çalıştırmadan sonra `pgrep -f puppeteer_dev_chrome_profile` / `playwright_chromiumdev_profile` → 0 süreç.

- Test: `tests/live-guard.test.js` (yeni, 11 test: sınıflandırma, bitmemiş istek, `apikey` gizleme, `assertNoLive`, `closeBrowser`;
  her aracın DNS engeli + sayaç + süreç kontrolü kullandığı; mock-session'ın Puppeteer yakalaması yerine CDP Fetch kullandığı).
- `npm run build` ✓, `npm test` ✓ (543 test).

## Sizden gerekenler (bu oturumda yapılamadı)

1. **Supabase panosu → Usage → Cached Egress, günlük grafik.** 10–23 Ekim arasında (landing videoları) mı yoksa her gün eşit
   (avatar `?t=`) mı yükseldiğini gösterir. İkisi de mümkün; kod tarafında ikisi de kapandı.
2. **Storage içeriği** (salt okuma; bu oturumda canlı DB okumasına izin verilmedi). SQL Editor'da:
   ```sql
   select bucket_id, count(*) as dosya, round(sum((metadata->>'size')::bigint)/1048576.0, 2) as mb,
          max((metadata->>'size')::bigint)/1024 as en_buyuk_kb, string_agg(distinct metadata->>'cacheControl', ', ') as cache
   from storage.objects group by 1 order by 3 desc;
   ```
   Avatarlar büyükse (yüzlerce KB – 2 MB), kullanıcılar yeniden yükleyene kadar SW önbelleği tekrar indirmeyi zaten kesiyor;
   istenirse mevcut avatarlar küçültülüp yeniden yüklenebilir (canlıya yazma: ayrıca onay).
3. **Realtime logları:** bu dal yayına girdikten sonra `JwtSignatureError` sayısının (sahte oturumlu ölçümler de artık canlıya
   gitmediği için) sıfıra inmesi beklenir.
