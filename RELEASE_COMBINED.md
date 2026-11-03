# release/combined — perf/tonight + fix/live-traffic (master) + landing

Kaynak: `master` (98521cb, fix/live-traffic dahil, canlıda) + `perf/tonight` (Parça 1–3). **Canlıya alınmadı.**

## Birleştirme
- Çakışmalar: `scripts/perf/` → fix/live-traffic (master) sürümü; `public/sw.js` → perf/tonight'ın build ID'si ve "önce ağ"
  sayfaları + fix/live-traffic'in `wawe-storage-v1` avatar önbelleği birlikte (`wawe-v53-<build>`); `.gitignore` tekilleştirildi.
- `BaseHead.astro` / `navbar.js` kendiliğinden birleşti: kendi fontlarımız + lazy-load + Hızlı Ekle önyükleyicisi + `WwRealtime` +
  `?t=`siz avatar birlikte. Elle yazılmış tek `?v=` (`realtime-guard.js?v=1793700000`) build ID sistemine geçti.
- `public/src/bundle.js` kaynaktan yeniden üretildi (birleşmiş hâliyle aynı çıktı); `tests/bundle-sync.test.js` geçiyor.
- Landing (`~/Downloads/wawe-landing-update.zip`, proje kökünde yoktu): `git apply --check` "already exists / does not apply"
  verdi çünkü güncelleme master'da **zaten var** (`85e0c33`, 2026-10-30, KURULUM.md'deki commit mesajıyla). 10 görsel, `index-i18n.js`,
  `UpgradeModal.astro` (zaten `screen-analytics.webp` / `screen-backtest.webp`) bayt bayt aynı; `index.astro` / `landing-glass.css`
  farkları sonradan bilerek yapılan değişiklikler (kendi fontlarımız, build ID, ödeme sihirbazı `77dca44`). Üzerine yazmak bunları geri
  alırdı; uygulanmadı.

## Otomatik kontroller (sahte oturum, canlı trafik sayacı açık; canlıya 0 istek)
- `npm run build` ✓ (sürüm doğrulaması dahil), `npm test` ✓ 623 test.
- `scripts/perf/verify-release.mjs`: **22/22** — Google Fonts yok, `/fonts/*.woff2` `?v=` + `immutable`; TR → DE → EN; "N" 5 sayfada
  3 kez üst üste, yazı alanında harf, yükseltme penceresi açıkken etkisiz; pencere Esc / × / arka planla kapanıyor; `/quick-add-modal.html`
  404 yok; dokunmatikte ilk sürükleme; landing 1440 ve 390 px: hero "Never make the same mistake twice.", MacBook kapağı 0 → 1, 6 ekran
  sırayla (0–5), sonda kapanıyor; "MetaTrader 4/5 AUTO-SYNC SOON", TradingView yok; CTA "Rewrite your destiny."; footer dağ görseli;
  konsol hatası / kırık görsel / 4xx yok.
- `scripts/perf/verify-live-traffic.mjs`: **13/13** (avatar `?t=` yok ve SW'den, 256 px WebP, GIF olduğu gibi, Realtime bildirim / plan,
  tek soket + iki katılma, imza hatasında sessiz, hata raporu ekran görüntüsü).

## Canlıya almak
`git checkout master && git merge --ff-only release/combined && git push origin master` (master bu arada değişmediyse hızlı ileri alınır).
