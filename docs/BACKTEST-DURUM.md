# Backtest: durum raporu (2026-10-25, akşam)

Kaynak: master `a3bbb8a`, canlı site (wawejournal.com), kod ve test çalıştırması.
Ayrıntılı geçmiş: `docs/backtest-v2/DEVAM.md`. Bu raporun önceki sürümü sabah (`fd371b9`) yazıldı; o gün üç aşama yayına alındı:

| Commit | Aşama |
|---|---|
| `ff9fff5` | 1. Hatalar: BTCUSD ekseni, grafiği ortalama, kayan sayılar, "Aktivite (tahmini)", stats-audit, 202610220001 rollback'i |
| `7928a23` | 2. Taşınabilir paneller, istatistik paneli / tam ekran, istatistik widget'ları, çoklu grafikte yer ve boyut |
| `a3bbb8a` | 3. Bekleyen emirler (limit / stop) |

## 1. Özellik listesi

✅ canlıda ve çalışıyor · ⚠️ kısmen veya bilinen sınırı var · ❌ yok

| Alan | Özellik | Durum | Not |
|---|---|---|---|
| Veri | Sentetik mumlar | ✅ | Tarayıcıda üretilir, 2024-01'den itibaren |
| Veri | cTrader verisi | ✅ | Int32'ye sığmayan, sıfır/eksi veya sonsuz değer atılıyor; bozuk önbellek ayı yeniden indiriliyor (bkz. 3) |
| Veri | Kendi arşivimiz (Dukascopy/Binance → Storage) | ❌ | Lisans kararı bekliyor |
| Replay | Oynat/duraklat, hız, mum ve dakika adımı | ✅ | |
| Replay | Tarihe git | ✅ | Grafik yeni tarihe ortalanır, fiyat ölçeği otomatiğe döner |
| Replay | Bölümler (işlemli hesapta geri dönüş) | ✅ | Açık pozisyon varken engelli; bekleyen emirler iptal edilir |
| Motor | Piyasa emri | ✅ | Kuruş hassasiyetinde, en fazla 20 açık pozisyon |
| Motor | Bekleyen emirler (limit / stop) | ✅ | Gap'te açılıştan dolum, 1 dakikalık mum içinde mum yolu sırası, ileriye bakmaz; tarayıcıda saklanır (bkz. 3) |
| Motor | SL/TP, sonradan değiştirme | ✅ | |
| Motor | Spread, komisyon | ✅ | |
| Hesap | Hesaplar ve kotalar, defter senkronu | ✅ | Ücretsiz 1, Premium 10 hesap |
| Arayüz | Basit / Gelişmiş mod | ✅ | |
| Arayüz | Paneller: sürükleyip taşıma, önizleme, boyutlandırma, gizleme | ✅ | Gelişmiş mod ve geniş ekran; telefonda alt alta |
| Arayüz | Grafiği ortala (R), "Şimdiki muma dön" | ✅ | Fiyat eksenine çift tıklama otomatik ölçeğe döner |
| Arayüz | Tam ekran (F) ve kısayol sayfası | ✅ | |
| Arayüz | Görünüm çekmecesi ve temalar | ✅ | |
| Arayüz | Aktivite çubukları | ✅ | Adı "Aktivite (tahmini)", grafikte açıklama satırı |
| Arayüz | Canlı sayılar | ✅ | Sabit genişlik, sağa hizalı; açık pozisyon satırları yerinde güncellenir |
| Çizim | Çizim araçları | ✅ | Otomatik ölçeğe katılmaz |
| İstatistik | İstatistik sekmesi / ayrı panel / tam ekran | ✅ | |
| İstatistik | İstatistik widget'ları | ✅ | Taşı (SortableJS), boyutlandır, gizle, büyüt (WwChartViewer) |
| Grafik | Çoklu grafik | ✅ | Grafikler sürüklenerek yer değiştirir, sütun/satır boyutları ayrı ayrı |
| Plan | Ayda 100 işlem (cTrader verili hesap, ücretsiz) | ✅ | Tetiklenen bekleyen emirlerde de geçerli |
| Dil | tr/en/de | ✅ | Her dilde 417 `backtest.*` anahtarı, eşitlik testi geçiyor |

## 2. Ücretsiz / Premium

Kurallar değişmedi. Yeni özelliklerin dağılımı:

| Özellik | Ücretsiz | Premium |
|---|---|---|
| Panelleri taşıma, gizleme, düzen sıfırlama | ✅ | ✅ |
| Grafiği ortala, şimdiki muma dön | ✅ | ✅ |
| Bekleyen emirler | ✅ (cTrader verili hesapta tetiklenen emir aylık sınıra sayılır) | ✅ |
| İstatistik paneli / tam ekran, widget taşıma ve boyut | ✅ (temel rakamlar, bakiye eğrisi, Premium tanıtım kartı) | ✅ (tüm grafikler) |
| Çoklu grafikte yer ve boyut | ❌ (çoklu grafik Premium) | ✅ |

Kapılar yine `public/src/core/config.js` FEATURES içinde.

## 3. Bilinen sorunlar ve sınırlar

| Konu | Durum |
|---|---|
| BTCUSD eksi milyarlar | Gerçek BTC 1m verisiyle (Binance) yeniden üretildi. Bulunan kök nedenler: elle ölçeklenen fiyat ekseni (otomatik ölçek kapanır) tarih/bölüm değişince öyle kalıyordu, 2019 mumları ekran dışında = boş grafik; görünür aralık imlece taşınmıyordu. İkisi de düzeldi (smoke `btc-repro-pz`, `btc-repro-scroll`). Bildirilen sayılar (−1,24 … −1,68 milyar) 1e-5 birimli BTC 26 150–30 550 fiyatlarının Int32 taşmasıyla birebir örtüşüyor; o değer bu makinede gerçek cTrader verisiyle yeniden üretilemedi (cTrader hesabına erişim yok), bu yol artık kapalı: dönüşüm ve önbellek bu değerleri atıyor, seriye geçersiz mum ulaşmıyor. Kullanıcının aynı hesapta tekrar denemesi gerekiyor. |
| Bekleyen emirler cihazlar arası | Emirler tarayıcıda saklanıyor (`ww_bt_orders_v1:<kullanıcı>:<hesap>`). Başka cihazda görünmez. Veritabanına taşımak için yeni tablo (migration + rollback) gerekir; bu makineden canlı veritabanına erişim yok. |
| Panel ve widget düzeni cihazlar arası | Kullanıcıya özel, tarayıcıda (`ww_bt_dock_v1:<kullanıcı>`). Aynı sebeple veritabanında değil. |
| Bir dakika içindeki sıra | 1m verinin içi bilinmez; emir ile SL/TP aynı 1 dakikalık mumdaysa mum yolu varsayılır (yükselen mum açılış → dip → tepe → kapanış, düşen mum açılış → tepe → dip → kapanış). Bu işlemler "belirsiz" sayılır ve kullanıcıya bildirilir. |
| Panel taşıma Basit modda yok | Bilinçli: Basit mod sabit düzen; özelleştirme Gelişmiş modda. |

## 4. Teknik durum

| Konu | Değer |
|---|---|
| master'daki son commit | `a3bbb8a`, `origin/master` ile aynı |
| Canlıdaki sürüm | master ile aynı. `backtest.js?v=18`, `bt-engine.js?v=5`, `bt-dock.js?v=1`, `bt-stats.js?v=3`, `backtest.css?v=15`, `i18n.js?v=1793500003`, SW `wawe-v28` |
| Sayfa ve modüller | `src/pages/backtest.astro`, `public/interface/backtest/js/` içinde 14 dosya (yaklaşık 7.300 satır); yeni: `bt-dock.js` |
| Dış kütüphane | SortableJS 1.15.0 (Premium dashboard ile aynı), Lightweight Charts 4.1.3 |

Veritabanı: bu turda değişiklik yok, canlıya yazılmadı. Migration'lar:

| Migration | Konu | Rollback / doğrulama |
|---|---|---|
| 202610180001–0009 | Hesaplar, işlemler, defter bağı, veri kaynakları | — |
| 202610220001 | `journals.trade_scope` | `supabase/rollbacks/202610220001_journal_trade_scope.down.sql` geri kondu (`b7860ac` ile birebir). Yerel prova `supabase/tests/rehearse_202610220001.mjs` (PGlite): 17/17 |
| 202610240001 | `backtest_drawings` | `.down.sql`, doğrulama 15/15 |
| 202610240002 | Aylık işlem sınırı | `.down.sql`, doğrulama 12/12 |
| 202610240003 | Geri dönüş ve bölümler | `.down.sql`, doğrulama 11/11 |

Testler (2026-10-25, bu makinede):

| Tür | Sonuç |
|---|---|
| Tüm birim testleri (`node --test tests/*.test.js`) | 456 / 456 (Windows'ta stats-audit dahil) |
| Backtest birim testleri (14 adet `bt-*.test.js`) | 234 / 234; yeni `bt-dock.test.js` (15), `bt-orders.test.js` (21) |
| Duman testleri (`tests/smoke`, Chrome + puppeteer-core) | 35 senaryo, hepsi geçti; yeni `stage1`, `stage1-de`, `dock-pro`, `dock-free`, `dock-phone`, `orders`, `orders-limit` |
| Gerçek veriyle duman (`btc-repro*`, `CTDATA`) | 6 / 6 |
| Canlı kontrol (sahte oturum, canlıya yazmaz) | Ücretsiz ve Premium, her aşamadan sonra: 26–28 / 26–28 |

## 5. Sonraki adımlar

1. **BTCUSD'yi kullanıcı hesabında doğrulamak.** cTrader BTCUSD H1, 10.07.2019, Bölüm 2. Eksen hâlâ bozuksa: tarayıcı konsolunda `localStorage` ve IndexedDB `ww_bt_ctrader` kaydı ile ekran görüntüsü.
2. **Bekleyen emirler ve düzen veritabanında.** `backtest_pending_orders` tablosu ve kullanıcı düzeni için migration + rollback + yerel prova; canlıya uygulamak için veritabanı erişimi olan makine ve yedek gerekli.
3. **Kendi veri arşivimiz.** Lisans kararından sonra.
4. **Emir süresi (GTC dışında gün sonu iptali) ve OCO** isteniyorsa motorda kolayca eklenir.
