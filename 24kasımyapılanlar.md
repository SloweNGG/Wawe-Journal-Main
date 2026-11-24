# 24 Kasım 2026: yapılanlar

23 Kasım akşamından sonra yapılanlar. Bir önceki özet: `23kasımyapılanlar.md`. Önce/sonra raporu (görsel):
https://claude.ai/artifact/GNrPVbEqZXQSh4rSGKgbWF

**Durum:** Hepsi canlıda. Veritabanı migration'ı ya da Edge Function deploy'u gerekmedi. Her push'tan sonra canlıda
demo hesapla kontrol edildi (sayfalar, SPA geçişleri, dosya hash'leri).

---

## Dünkü commit edilmemiş iş (`4b02ee9`, `bb841d6`, `fea81a7`)
- **Takvim:** masaüstünde ekrana sığıyor; gün panelindeki gri kutular siyah; "Koça sor" seçili koçun adını yazıyor
  ("Atlas'a sor"). Dil dosyasında koç adı yazmıyor, `{coach}'a sor` gibi ek + yer tutucu (koç adı testi bunu istiyor).
- **Quick panel:** sekmeler arası boyut sabit; sekmeler sürükleyerek ya da sıralama menüsüyle sıralanabiliyor.
- **Trades:** arama, tarih/sembol/strateji filtreleri, gün gruplama, CSV indirme. CSV'lerde "EURUSD · Forex".
  Dashboard PDF raporu yeniden tasarlandı. Sembol grafiğinde etiket çubuğa binmiyor.

## Hız çalışması (perf-wave) canlıda (`91cc615`)
- İçerik hash'li dosya sürümleri, deploy'da silinmeyen SW önbelleği, bekletmeyen script'ler, küçültülmüş HTML,
  tr/de kullanıcıya en.js inmiyor. Ölçüm: deploy sonrası 5 sayfalık oturum 887 KB → 145 KB.
- Yayından önce düzeltildi (`7e5f669`): taşınan `*-page.js` inerken başka sayfaya tıklanırsa kod yeni sayfada
  çalışıyordu. SPA girişinde metin iptal sinyaliyle çekilip yalnızca geçiş sürüyorsa satır içi çalıştırılıyor.

## Hata düzeltmeleri
- **/add-trade** (`93510d2`): sayfa yenilenince ya da linkle açılınca Kaydet çalışmıyordu (`currentUser.id` boş,
  buton dönüp kalıyordu). Başlatma DOMContentLoaded'ı bekliyor. Eskiden beri vardı.
- **Dashboard / analytics** (`93510d2`): dil değişince prop banner'ı güncelleyen dinleyici tam yüklemede kurulmuyordu.
- **sw.js** (`d577acb`, `495a92c`): Cloudflare tarayıcıya 4 saat önbellek yazıyordu. `no-cache` da ezildi;
  `no-store` tuttu. Kayıt `updateViaCache: 'none'` ile.
- **Onboarding kapısı** (`d577acb`): oturum yoksa onboarding dosyaları yüklenmiyor.
- **Ayarlar 406** (`6fa60b4`): `system_settings.payment_settings` üyeye görünmediği için her açılışta konsola 406.

## Supabase istekleri (`9d8eb8b`, `e43b15b`)
- `config.js`: aynı anda giden birebir aynı okuma istekleri tek istekte paylaşılıyor (GET/HEAD + 5 salt okunur RPC).
  Zamanlı önbellek yok; yazma, auth ya da edge function çağrısı paylaşımı sıfırlıyor. Testler: `tests/sb-dedup.test.js`.
- Profil açılışta 3 kez yerine 1 kez çekiliyor (navbar avatar/rozet ve `getUserPlan` ortak profil yükleyicisini
  kullanıyor: `window.wwGetUserProfile`). Ayarlarda avatar değişince ortak önbellek de güncelleniyor.
- Ödeme bildirimi sorgusunun zaman filtresi dakikaya yuvarlandı (eşzamanlı çağrılar aynı adresi gönderip paylaşıyor).
- Canlı dashboard açılışı (sorgu + CORS ön kontrolü): **72 → 40 istek.**

| Sayfa (yerel ölçüm, aynı demo oturumu) | Önce | Sonra |
|---|---|---|
| Dashboard | 37 sorgu | 20 |
| Trades | 35 | 20 |
| Calendar | 44 | 18 |
| Journals | 35 | 20 |
| Analytics | 41 | 16 |
| Strategies | 47 | 20 |

## Temizlik
- Kullanılmayan React entegrasyonu ve `.tsx` dosyaları silindi (`ca2b87d`). Build çıktısı birebir aynı;
  yalnızca hiçbir sayfanın kullanmadığı 141 KB'lık React dosyası artık üretilmiyor.
- Birleşmiş yerel dallar silindi: `perf-wave`, `perf-w-build`, `perf-x-defer`, `perf-y-inline`, `perf-z-shell`.

## Gemini'nin "yapılmayanlar" listesi
Hepsi kontrol edildi. Hatalar düzeltildi (yukarıda). Değerlendirmeler:
- Ana sayfa oturumsuz yük: doğru ama sayfa zaten mobilde 99 puan → ertelendi.
- `*-page.js` defer: script'ler sayfa içeriğinin en sonunda; defer ne ilk boyamayı ne DOMContentLoaded'ı değiştirir → yapılmadı.
- Backtest dosyalarını birleştirmek: önbellek ayrıntısı kaybolur → önerilmiyor.
- ai-coach / econ / prop / upgrade-modal lazy: küçük kazanç.

## Ölçüm araçları
`~/WaweJournal-PerfWave-2026-11-23/tools` (node_modules yok: scratchpad'e kopyala, `npm i puppeteer-core@23.11.1
pngjs@7 pixelmatch@5.3.0`). verify.mjs (tüm sayfalar), live-check.mjs, race.mjs, fixcheck.mjs ve quickadd.mjs
(demo hesaba yazar, sonra siler), sbcount.mjs / sbreqs.mjs (Supabase istek sayıları), hashcheck.mjs.

## Açık kalanlar
- **Cloudflare paneli (bizim erişimimiz yok):** Caching → Browser Cache TTL → "Respect Existing Headers" (şu an
  .js/.txt dosyalarında başlıkları 4 saate çeviriyor). İsteğe bağlı: Scrape Shield → Email Obfuscation kapalı.
- Profilde tema ve bildirim tercihleri hâlâ ayrı sorgular (farklı alanlar, farklı zamanlar).
- Kullanılmayan `public/images/brand/logo-mark.png` ve `logo-mark@2x.png`: silmeden önce Supabase e-posta
  şablonlarına bakılmalı.
- Eskiden kalanlar: AI koç gerçek üyeyle denenmedi; Tradovate CSV gerçek bir dosyayla denenmedi.
