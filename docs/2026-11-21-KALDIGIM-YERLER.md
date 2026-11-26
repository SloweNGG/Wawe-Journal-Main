# Kaldığım yerler (21.11.2026)

Bu dosya, nerede kaldığımı ve sırada ne olduğunu tek yerde tutar. Önceki ayrıntılı notlar:
`docs/2026-11-15-DEVAM-NOTLARI.md`, `docs/2026-11-16-DEVAM-NOTLARI.md`.

## Bu gönderimde (21.11.2026) giden işler

1. **Arka plan motoru (Ayarlar > Görünüm > Arka plan)**
   - Yeni: `public/components/ambient/ambient.js` + `ambient.css`, sahne görselleri `public/images/backgrounds/*.svg`
     (`scripts/gen-backgrounds.mjs` ile üretildi).
   - Stiller: K/Z ışığı (dynamic, 4 renk paleti, renk körlüğüne uygun "Okyanus & kehribar" dahil), gradyan, düz renk,
     orman, dağ, günün saati, kapalı.
   - K/Z ışığı yalnızca yönü değil şiddeti de gösterir (seçili dönemin K/Z'si ortalama işlem büyüklüğüne oranlanır).
   - Tercih `localStorage` içinde `ww_bg` olarak tutulur; ilk karede yanlış arka plan görünmesin diye BaseHead'deki
     satır içi betik `ww_bg_snap` değerini erkenden uygular. Eski `ww_ambient_mode` otomatik taşınır.
   - Ayarlar paneli: `public/settings/panels/appearance.html`, `settings.js`, `settings.css`; metinler tr/en/de.
   - Testler: `tests/ambient.test.js`.
2. **Duyarlı görseller (srcset)**
   - Açılış ve destek sayfası ekran görüntülerinin 600/800/900/1000/1200w sürümleri eklendi.
   - Tablo `src/data/responsive-images.ts`, üretici `scripts/resize-images.mjs` (kaynak görsel değişirse yeniden çalıştır).
3. **Görsellerde içerik hash'iyle önbellek**
   - `scripts/asset-version.mjs`: her `/images/...` referansına `?v=<içerik hash'i>` yazılır; olmayan görsele referans
     derlemeyi durdurur.
   - `public/_headers`: `/images/*` artık 1 yıl `immutable`.
   - DİKKAT: tam adresle yazılan görselleri (og:image, JSON-LD, e-postalar) **aynı adla değiştirme**, yeni adla ekle.
4. **Temiz adresler**: navbar, ayarlar, landing ve diğer sayfalardaki `.html` uzantılı linkler `/dashboard`, `/settings`
   gibi uzantısız adreslere çevrildi.
5. **Backtest**: grafik tekerlekle yakınlaştırılırken eski aylar yüklenirken mumların sağ köşeye sıkışması düzeltildi
   (duman testi: `tests/smoke/driver-center.js`).

Gönderim öncesi kontrol: `npm test` (935/935 geçti), `npm run build` (sorunsuz).

## Canlıda kontrol edilecekler (bu gönderimden sonra)

- [ ] Cloudflare Pages derlemesi geçti mi, canlı sayfadaki `?v=` numaraları yeni mi?
- [ ] Ayarlar > Görünüm > Arka plan: her stil açılıyor mu, sayfa yenilenince ilk karede doğru arka plan geliyor mu?
- [ ] K/Z ışığı kârda/zararda doğru renge ve şiddete dönüyor mu (dashboard'da dönem değiştirerek)?
- [ ] Landing'de ekran görüntüleri telefonda küçük sürümden yükleniyor mu (DevTools > Network)?
- [ ] Eski `.html` linkleri hâlâ doğru sayfaya yönleniyor mu (`_redirects`)?

## Açık kalan işler (önceki oturumlardan)

### AI Koç
- [ ] Gerçek bir üye hesabıyla test: günlük sözler, aksiyon kartları, OpenRouter yedeği, ekran görüntülü (vision) yedek.
- [ ] Günlük limitler hâlâ geçici (ücretsiz 5 / premium 50). Kesin limit konuşulacak.
- [ ] Sert koçlar nötr sorularda da söz öneriyor: davranış kararı bekliyor.
- [ ] MFE/MAE ertelendi: işlemlerde gerçek açılış saati yok. Önce cTrader senkronunda açılış saati, MT5 EA'dan MFE/MAE
      ya da manuel formda saat alanı gerekli.

### SEO
- [ ] TR/DE yalnızca istemci tarafında çevriliyor; dizine girmesi için `/tr/` ve `/de/` sayfaları + hreflang gerekiyor
      (şu an yalnızca index/about/contact var).
- [ ] HSTS Cloudflare panelinden açılacak.
- [ ] Marka profilleri (Product Hunt, AlternativeTo vb.) açılınca URL'ler Organization `sameAs` ve footer'a eklenecek.
- [ ] Sıradaki sayfa adayları: MT5, cTrader, AI koç özellik sayfaları.
- [ ] Not: prop preset'leri yalnızca FTMO, FundedNext ve FundingPips için var; diğer firmalar için preset iddia etme.

### MT5 / cTrader
- [ ] MT5 EA'yı MQL5 Market'te yayınlamak (mql5.com hesabı gerekiyor). O zamana kadar sitede "auto-sync soon" kalıyor.
- [ ] İsteğe bağlı: kısa `api.wawejournal.com` adresi.

### Ekonomik takvim
- Forex Factory beslemesinde gerçekleşen değer yok, gelecek hafta dosyası yok. Üyelere Web Push yok (yalnızca uygulama
  açıkken uyarı). İleride istenirse abonelik tablosu + pg_cron gerekiyor.

### Diğer
- [ ] Admin Web Push: sunucu tarafı canlı, yalnızca telefonda test kaldı.

## Hatırlatmalar

- `master`'a push = canlıya çıkış (Cloudflare Pages, ~1-2 dk). Edge Function'lar push ile **deploy olmaz**, ayrıca
  deploy edilir.
- Canlı veritabanına yazmadan önce yedek al.
- Aynı çalışma klasöründe başka bir oturum çalışıyor olabilir: commit'te tek tek dosya ekle, kökte `git add -A` yapma.
