# 24 Kasım 2026: yapılanlar

> **Güncel ve tam hali: `24 kasım 17.21.md`.** Bu dosya gün içindeki ara nottur; sonradan sağlık kontrolü
> kaldırıldı, koç "sen" diyecek şekilde düzeltildi (ai-coach v21).

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

## Gerçek hız ölçümü ve takvim düzeltmesi (`07bc7d6` ve öncesi)
- Lighthouse'un dashboard için verdiği "ana içerik 4 sn" kendi simülasyon tahmini çıktı. Gerçek tarayıcıda (yavaş 4G +
  4x CPU, mobil, önbellek/SW açık) ilk ziyaret: dashboard 1,44 sn, trades 1,28 sn; tekrar ziyaret ~0,3 sn (14-16 KB).
- Test tuzakları: Chrome'un "service worker'ı atla" ayarı (puppeteer `setBypassServiceWorker`) yavaş ağda head'deki
  CSS'leri iki kez indirtiyor; gerçek kullanıcıda yok. Gerçekçi ölçüm için bypass ve `setCacheEnabled(false)` kullanma.
- **Takvim:** renk açıklaması iskeletle birlikte gizleniyordu, veri gelince belirip LCP oluyordu. Artık baştan görünür:
  ilk ziyaret LCP 3,4-4,2 sn → 0,8-1,1 sn (CLS aynı).
- **Pro penceresi görseli:** 1800 px yerine ekrana uygun kopya (srcset): 79 KB → 14-26 KB. Analytics'te LCP değişmedi:
  pencere plan kontrolünden sonra açılıyor (ücretsiz kullanıcı).
- Kalan geç LCP'ler: backtest (~4,6 sn, tamamen JS ile kurulan uygulama), strategies mobil (~3,8 sn, veriye bağlı metin).

## Otomatik canlı sağlık kontrolü (bu Mac)
- `~/WaweJournal-HealthCheck` + launchd (`com.wawejournal.healthcheck`): her gün 09:00 ve 21:00. Yalnızca okur.
  Sayfalar, önbellek başlıkları, dosya hash'leri, uygulama sayfaları (demo oturum), SPA geçişleri, dashboard Supabase
  sorgu sayısı, yavaş 4G hızı. Sorun olursa macOS bildirimi; ayrıntı `logs/health.log`. Kullanım: klasördeki README.md.

## AI koç uçtan uca test (canlı, demo hesap)
- Panel, sohbet (ilk kelime 2,5 sn), strateji ekleme / plan / aylık hedef kartları ve söz kartı: hepsi çalıştı,
  veritabanında doğrulandı; test kayıtları geri alındı. Gözlem: koç "siz" diyor, arayüz "sen".

## Tradovate CSV araştırması (`e0671a4`)
- Orders 23 Kasım'da gerçek örnekle doğrulanmıştı. Performance için: başka bir proje (kyoshiroDev/my-trading-coach
  #262) gerçek bir NinjaTrader Web (= Tradovate) dışa aktarımıyla başlığın birebir aynı olduğunu doğrulamış (CRLF,
  BOM yok). O dosyada bizim ayrıştırıcı toplam K/Z'yi kuruşu kuruşuna tutturdu (20 çift → 17 pozisyon, $466,50).
- Düzeltildi: TradingView'in Strategy Performance dışa aktarımı aynı sütunlarla geliyor ama zamanı Unix ms yazıyor;
  tarihler boş geliyordu (işlemler bugünün tarihiyle eklenirdi). Artık okunuyor.
- Açık: Tradovate Performance dosyasında komisyon yok; Cash History dosyası komisyonları içeriyor (aynı dolum
  zamanları). İkisini birlikte içe aktarma henüz yok.

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
  .js/.txt dosyalarında başlıkları 4 saate çeviriyor). Speed → Speed Brain kapalı: Cloudflare sayfalara
  `speculation-rules` başlığı ekliyor, Chrome navbar sayfalarını önceden çekiyor, HTML edge'de önbelleklenmediği için
  Cloudflare bu isteklere 503 dönüyor (faydası yok, konsolda hata). İsteğe bağlı: Scrape Shield → Email Obfuscation kapalı.
- Konsolda kalanlar site kodundan değil: giriş/kayıt sayfasındaki `%c%d` satırları Cloudflare Turnstile'dan.
- Profilde tema ve bildirim tercihleri hâlâ ayrı sorgular (farklı alanlar, farklı zamanlar).
- Kullanılmayan logo PNG'leri silindi (`b996bd0`); 13 Supabase e-posta şablonunda da kullanılmıyordu.
- Eskiden kalanlar: AI koç gerçek bir üyeyle denenmedi (demo hesapla uçtan uca denendi).
