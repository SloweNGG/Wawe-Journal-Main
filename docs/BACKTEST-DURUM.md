# Backtest: durum raporu (2026-10-25, gece)

Kaynak: master, canlı site (wawejournal.com), kod ve test çalıştırması. Ayrıntılı geçmiş: `docs/backtest-v2/DEVAM.md`.
Bu turda dört aşama yayına alındı:

| Commit | Aşama |
|---|---|
| `2328813` | 1. Hatalar: fiyat ekseni öz denetimi (BTCUSD), "Aktivite (tahmini)" yedek metni; diğer maddeler önceki turdan doğrulandı |
| `d97092d` | 2. Çizim araçları baştan: tutamaçlar, Shift, Esc, geri al/yinele, ayar penceresi, yerinde metin |
| `5743de5` | 3. Pencere sistemi (`bt-desk.js`), bekleyen emirler kendi penceresinde (4) |

## 1. Özellik listesi

✅ canlıda ve çalışıyor · ⚠️ kısmen veya bilinen sınırı var · ❌ yok

| Alan | Özellik | Durum | Not |
|---|---|---|---|
| Veri | Sentetik mumlar | ✅ | |
| Veri | cTrader verisi | ✅ | Geçersiz değerler seriye ulaşmaz; bozuk önbellek ayı yeniden indirilir |
| Veri | Kendi arşivimiz | ❌ | Lisans kararı bekliyor |
| Replay | Oynat, adım, tarihe git, bölümler | ✅ | Tarih, bölüm, zaman dilimi, hesap açılışı ve tam ekrandan sonra grafik imlece ortalanır |
| Grafik | Fiyat ekseni öz denetimi | ✅ | Yeni: ortalamadan sonra eksen görünen mumları çerçevelemiyorsa görünüm yeniden kurulur ve durum loglanır (bkz. 3) |
| Grafik | Grafiği ortala (R), "Şimdiki muma dön", eksene çift tık | ✅ | |
| Çizim | 9 araç | ✅ | Yeni sürüm, ayrıntı aşağıda |
| Çizim | Geri al / yinele | ✅ | Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y ve araç çubuğu |
| Çizim | Ayar penceresi | ✅ | Çift tık veya sağ tık: renk, kalınlık, çizgi stili, dolgu, opaklık; Fibonacci seviyeleri, metin boyutu |
| Arayüz | Pencere sistemi (Gelişmiş mod) | ✅ | Yeni, ayrıntı aşağıda |
| Arayüz | Basit mod | ✅ | Çerçevesiz sabit düzen |
| Arayüz | Telefon | ✅ | Pencereler alt alta, sürükleme yok |
| Arayüz | Canlı sayılar | ✅ | Sabit genişlik; tam ekrandaki yüzen kutular da kaymıyor (yeni test) |
| Motor | Piyasa / limit / stop emirleri | ✅ | Gap'te açılıştan dolum, 1 dakikalık mum içinde mum yolu, ileriye bakmaz |
| İstatistik | Widget'lar (taşı, boyutlandır, gizle, büyüt) | ✅ | İstatistikler penceresinde |
| Plan | Ayda 100 işlem (cTrader verili, ücretsiz) | ✅ | Tetiklenen emirlerde de |
| Dil | tr/en/de | ✅ | Eşitlik testi geçiyor |

### Çizim araçları (aşama 2)

| Araç | Ne yapar |
|---|---|
| Hepsi | Sürükleyerek ya da iki tıklamayla çizim; seç, taşı, tutamaçtan boyutlandır, Del ile sil; Esc çizimi veya sürüklemeyi iptal eder (hayalet kalmaz); imleç duruma göre değişir (artı, taşı, kenar oku, tut). Seçim araç çubuğunun genişliğini değiştirmez (önceden grafik seçimde daralıyor, çizimler yana kayıyordu) |
| Araç çubuğu | Benzer araçlar tek düğmede: Çizgiler (trend, ışın, yatay) ve Pozisyonlar (long, short). Düğme son kullanılan aracı gösterir; köşedeki üçgen, sağ tık veya sağ/aşağı ok gruptaki araçları açar; 1–9 tuşları her aracı seçer. Fareyle sürükle-bırak: düğme sırası, bir düğmeyi başka birinin ortasına bırakınca gruplar birleşir, menüdeki bir araç grup içinde sıralanır, başka gruba girer ya da çubukta boş yere bırakılınca tek başına düğme olur; Esc sürüklemeyi iptal eder. Düzen tarayıcıda (`ww_bt_draw_ui.groups`); menüden varsayılana dönülür. Dokunmatikte sürükleme yok (çubuk kaydırılır) |
| Dikdörtgen | Herhangi bir köşeden herhangi bir yöne; 8 tutamaç; Shift ile ekranda tam kare; dolgusuz kutu yalnız kenarından tutulur |
| Trend çizgisi, ışın | Shift ile yatay, dikey veya 45° (uç sürüklerken de); iki uç ayrı ayrı |
| Yatay çizgi | Ayar penceresinde uzunluk: Tam (grafiğin tamamı, varsayılan), Sağa (başladığı yerden sağa ışın), Parça (iki uç; uçtan sürükleyerek uzunluk, baştan sürükleyerek fiyat). Parça modunda sürükleyerek veya iki tıkla çizilir, ilk açılışta 20 mum. Son seçilen mod yeni çizgilerde kullanılır (`ww_bt_draw_ui.hline`); `style.extend`, parçanın ikinci noktası `points` içinde |
| Fibonacci | İki uç ayrı ayrı; seviyeler ayar penceresinden (en fazla 12) |
| Long / short | Giriş, TP, SL ve genişlik tutamaçları; grafikte R:R, pip (kriptoda puan) ve emir panelindeki lota göre tutar |
| Metin | Grafikte yerinde yazılır ve düzenlenir (çift tık); Enter kaydeder, Esc bırakır |
| Ölçüm | Mum sayısı, süre, fiyat farkı ve yüzde |
| Mıknatıs | Uçlar en yakın açılış/yüksek/düşük/kapanışa yapışır |

Stil alanları `backtest_drawings.style` (jsonb) içinde; veritabanı değişikliği gerekmedi.

### Pencere sistemi (aşama 3)

| Özellik | Ayrıntı |
|---|---|
| Pencereler | Replay kontrolleri, grafik (çoklu grafikte her grafik), emir paneli, bakiye, açık pozisyonlar, bekleyen emirler, işlem geçmişi, istatistikler |
| Taşıma ve boyut | Başlıktan sürükle; 4 kenar ve 4 köşeden boyutlandır; en küçük boyutlar; başlıkta ok tuşları taşır, Shift + ok boyutlandırır |
| Düğmeler | Simge durumuna küçült (görev çubuğuna), ekranı kapla / önceki boyut (başlığa çift tık da), kapat (grafikler yalnız küçülür; sayıları grafik düzeninden gelir) |
| Görev çubuğu | Açık pencereler; küçültülen kesik çerçeveli; tıklama geri getirir, öndekini küçültür (Windows gibi) |
| Öne gelme | Tıklanan pencere öne gelir |
| Yapıştırma | Sol/sağ kenar yarım, üst kenar tam, köşeler çeyrek; bırakılacak yer önizlemesi; ekranı kaplayan ya da yapışan pencere sürüklenince eski boyutuna döner |
| Mıknatıs | Pencereler masaüstü kenarlarına ve birbirine 8 px aralıkla yapışır (10 px yakınlıkta) |
| Grafikler | Pencere boyutu değişince yeniden çizilir; çoklu grafik düzeni seçilince grafik pencereleri ana grafiğin alanını paylaşır |
| Düzenler | Mevcut düzen kullanıcıya özel otomatik kaydedilir; hazır düzenler Klasik, Odak, Analiz, Çoklu grafik (Premium); adlı düzen kaydet / yükle / sil (ücretsiz 1, Premium sınırsız); "Düzeni sıfırla" |
| Basit mod | Çerçevesiz sabit düzen (replay üstte, grafik solda, bakiye ve emir sağda) |
| Telefon | Pencereler alt alta tam genişlikte, sürükleme ve boyutlama yok |
| Tam ekran (F) | Eskisi gibi: grafik ekranı kaplar, bakiye, replay ve hızlı emir yüzer |
| Çizim araçları penceresi | Gelişmiş modda araç çubuğu ayrı pencere (`draw`): başlıktan taşınır, kenarlardan boyutlanır, kapanır (Pencereler menüsünden geri açılır); ekranı kaplamaz, kenara yapışmaz. Düğmeler pencerenin genişliğine göre sütunlara dağılır (geniş pencerede tek satır). Varsayılan ve eski kayıtlı düzenlerde grafik bloğunun solunda, eski yerinde açılır. Basit modda, telefonda ve tam ekranda çubuk grafiğin yanında kalır |

Kütüphane kararı: kendi kodumuz (`bt-desk.js`, bağımlılık yok). WinBox.js (Apache-2.0) pencereleri sayfanın gövdesine sabitliyor, masaüstü
alanı, görev çubuğu ve yapıştırma önizlemesi için ağır değişiklik gerekiyordu; interact.js (MIT) yalnız sürükleme/boyutlama veriyor,
yapıştırma, mıknatıs, görev çubuğu, düzenler ve grafik yeniden çizimi yine bize kalıyordu. Kendi kodla aynı iş, dış bağımlılık riski yok.

### Grafik ve istatistik düzeltmeleri (`cacf307`)

| Konu | Ne değişti |
|---|---|
| İşlem işaretleri | Varsayılan küçük oklar ve çıkışta nokta, yazı yok; aynı mumdaki aynı tür işaretler tek işarette sayıyla; üzerine gelince yön, lot, giriş → çıkış, neden ve K/Z. Görünüm ayarlarında (her plan): Oklar / Oklar ve etiketler / Sadece açık pozisyonlar / Gizle ve isteğe bağlı giriş–çıkış çizgisi |
| Bakiye eğrisi | Widget boyutunu sonradan alınca grafik sağa sıkışıyordu; her boyut değişiminde yeniden sığdırılıyor. Eksende yuvarlak işlem numaraları (#10, #20 … ya da dar grafikte #20, #40 …) |
| R değerleri | R yalnız açılışta stop loss konan işlemlerde hesaplanır (başlangıç riski). R kartı "R hesaplanan işlem: n / toplam" yazar, 5'ten az ise uyarır; beklenen değerde dolar (tüm işlemler) ve R (stop loss'lu işlemler) ayrı satırlarda |
| Fiyat ekseni | Sığmayan etiket yarım çizilmez, gizlenir |

## 2. Ücretsiz / Premium

Kurallar değişmedi (`public/src/core/config.js` FEATURES).

| Özellik | Ücretsiz | Premium |
|---|---|---|
| Trend, yatay çizgi, dikdörtgen (oturumda) | ✅ | ✅ (hesaba kaydedilir) |
| Diğer 6 çizim aracı | ❌ (PRO etiketi, yükseltme penceresi) | ✅ |
| Geri al / yinele, ayar penceresi | ✅ | ✅ |
| Pencere sistemi, hazır düzenler | ✅ (Çoklu grafik hariç) | ✅ |
| Adlı düzen | 1 | Sınırsız |
| Çoklu grafik | ❌ | ✅ |
| Bekleyen emirler | ✅ (tetiklenen emir aylık sınıra sayılır) | ✅ |

## 3. Bilinen sorunlar ve sınırlar

| Konu | Durum |
|---|---|
| BTCUSD eksi milyarlar | Lightweight Charts'ta fiyat çizgileri otomatik ölçeğe hiç katılmaz; eksen ancak seri verisi ya da bir primitive'in autoscaleInfo'su ile kayabilir. Seriye geçersiz mum ulaşmıyor, çizim ve seans primitive'leri ölçeğe katılmıyor. Yine de olursa: ortalamadan sonra eksen mumları çerçevelemiyorsa görünüm yeniden kurulur ve `[bt] price scale off the candles: axis [..] candles [..]` uyarısı loglanır. Hatayı kullanıcının hesabında görmek için bu satır gerekir. cTrader hesabına bu makineden erişim yok. |
| Bekleyen emirler cihazlar arası | Tarayıcıda (`ww_bt_orders_v1:<kullanıcı>:<hesap>`). Veritabanına taşımak için tablo (migration + rollback) gerekir; canlı veritabanına bu makineden erişim yok. |
| Pencere düzeni ve adlı düzenler cihazlar arası | Kullanıcıya özel, tarayıcıda (`ww_bt_desk_v1:<kullanıcı>`); aynı sebeple veritabanında değil. Eski panel düzeninin istatistik widget'ları ve çoklu grafik ızgarası ilk açılışta alınır. |
| Bir dakika içindeki sıra | 1m mumun içi bilinmez; emir ile SL/TP aynı mumdaysa mum yolu varsayılır ve işlem "belirsiz" sayılır. |
| Safari | Testler Windows'ta Chrome ile koştu; macOS Safari ve Chrome elle denenmeli (aşağıdaki adımlar). |

## 4. Teknik durum

| Konu | Değer |
|---|---|
| Canlıdaki sürüm | `backtest.js?v=21`, `bt-draw.js?v=3`, `bt-desk.js?v=1`, `bt-layout.js?v=4`, `backtest.css?v=17`, SW `wawe-v30` |
| Sayfa ve modüller | `src/pages/backtest.astro`, `public/interface/backtest/js/` içinde 14 dosya (yaklaşık 8.000 satır); `bt-dock.js` yerine `bt-desk.js` |
| Dış kütüphane | Lightweight Charts 4.1.3, SortableJS 1.15.0 (istatistik widget'ları) |

Veritabanı: bu turda değişiklik yok, canlıya yazılmadı. 202610220001 rollback'i yerinde, PGlite provası yeniden koşuldu, 16 kontrolün hepsi geçti.

Testler (2026-10-25 gece, bu makinede):

| Tür | Sonuç |
|---|---|
| Tüm birim testleri (`node --test tests/*.test.js`) | 460 / 460 |
| Backtest birim testleri (14 dosya) | 238 / 238; yeni `bt-desk.test.js` (14), `bt-draw.test.js` 17 |
| Duman testleri (Chrome, puppeteer-core) | 37 senaryo, 826 kontrol, hepsi geçti; yeni gerçek fare/klavye senaryoları `draw-real-pro` (82), `draw-real-free` (50), `desk-pro` (47), `desk-free` (44), `desk-phone` |
| Gerçek BTC verisiyle duman (`btc-repro*`) | 6 / 6 senaryo (çoklu grafikte çok küçük grafik penceresi bulundu ve düzeltildi) |
| Pagecheck (diğer sayfalar) | Eski ve yeni build aynı; premium-dashboard iki build'de de boş çiziliyor (bu makinedeki araç sorunu, fark yok) |
| Canlı kontrol (sahte oturum, canlıya yazmaz) | Ücretsiz ve Premium: aşama 1-2 kontrolü 30/30, aşama 3 kontrolü 31/31 |

## 5. Senin deneyeceğin adımlar

1. **BTCUSD ekseni (cTrader, Spotware, BTCUSD, H1):** 10.07.2019'a git, Bölüm 2'ye geç. Eksen yine bozuksa tarayıcı konsolunda `[bt] price scale off the candles` satırını kopyala.
2. **Dikdörtgen:** Gelişmiş modda dikdörtgen aracıyla sağ alttan sol üste sürükle; bir kez de iki tıklamayla çiz. Kenar ve köşe tutamaçlarından boyutlandır, Shift ile kare yap. Cmd+Z geri alır, Shift+Cmd+Z yineler.
3. **Trend çizgisi:** Shift basılıyken yatay, dikey ve 45° çiz; uçları ayrı ayrı sürükle; çizerken Esc'e bas (çizim kalmamalı).
4. **Ayar penceresi:** Bir çizime çift tıkla, sonra sağ tıkla. Renk, kalınlık, kesik çizgi, dolgu ve opaklığı değiştir; Fibonacci'de seviyeleri `0, 0.5, 0.618, 1` yap.
5. **Long aracı:** TP ve SL tutamaçlarını sürükle. R:R, pip ve tutar emir panelindeki lota göre değişmeli.
6. **Metin:** Metin aracıyla grafiğe tıkla, yaz, Enter'a bas; çift tıklayıp yerinde değiştir.
7. **Pencereler:** Gelişmiş modda bir pencereyi başlığından sürükle, kenarından ve köşesinden boyutlandır. Sol kenara, üste ve bir köşeye bırak (önizleme görünmeli). Küçült, görev çubuğundan geri getir; başlığa çift tıkla; kapat ve "Pencereler ve düzenler" menüsünden geri aç.
8. **Düzenler:** Odak, Analiz ve (Premium'da) Çoklu grafik düzenlerini dene. Bir düzeni adla kaydet, başka bir düzene geç, kaydettiğini yükle, sonra "Düzeni sıfırla".
9. **Basit mod ve telefon:** Basit modda çerçeve olmamalı. Telefonda pencereler alt alta dizilmeli ve sürüklenmemeli.
10. **Bekleyen emir:** Limit seç, seviye gir, AL. "Bekleyen emirler" penceresinde görünmeli; grafikteki çizgiyi sürükle; replay'de tetiklendiğinde açık pozisyonlara geçmeli.
11. **Safari ve Chrome (macOS):** 2, 3 ve 7. adımları iki tarayıcıda da dene (Cmd kısayolları dahil).

## 6. Sonraki adımlar

1. BTCUSD'yi kullanıcı hesabında doğrulamak (yukarıdaki log satırıyla).
2. Bekleyen emirler ve pencere düzenleri veritabanında (migration + rollback + yerel prova; canlıya uygulamak için veritabanı erişimi olan makine ve yedek).
3. Kendi veri arşivimiz (lisans kararından sonra).
