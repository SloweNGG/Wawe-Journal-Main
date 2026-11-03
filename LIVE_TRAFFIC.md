# Canlıya giden trafik — ilerleme kaydı

Dal: `fix/live-traffic` (kaynak: `master`, 252c2db). `perf/tonight` bu dala birleştirilmedi.

**Durum:** `sürüyor` (Sorun 1: Supabase Storage cached egress 5,2 / 5 GB; Sorun 2: Realtime `JwtSignatureError` döngüsü;
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

### 1c — Tipik oturumda Storage baytı: önce / sonra · `<1c>`

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
