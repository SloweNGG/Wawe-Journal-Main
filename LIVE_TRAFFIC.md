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
