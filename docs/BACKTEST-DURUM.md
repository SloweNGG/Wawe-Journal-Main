# Backtest: durum raporu (2026-10-25)

Kaynak: master `00d4215`, canlı site (wawejournal.com), kod ve test çalıştırması. Kod değiştirilmedi.
Ayrıntılı geçmiş: `docs/backtest-v2/DEVAM.md`.

## 1. Özellik listesi

✅ canlıda ve çalışıyor · ⚠️ kısmen veya bilinen sorunu var · 🔄 yapımda · ❌ yok

| Alan | Özellik | Durum | Not |
|---|---|---|---|
| Veri | Sentetik mumlar | ✅ | Tarayıcıda üretilir, 2024-01'den itibaren; EURUSD, GBPUSD, USDJPY, XAUUSD, BTC/USDT, ETH/USDT |
| Veri | cTrader verisi | ⚠️ | `ctrader-candles` + IndexedDB önbelleği çalışıyor; BTCUSD'de 2019'a gidince fiyat ekseni bozuk (bkz. 3) |
| Veri | Kendi arşivimiz (Dukascopy/Binance → Storage, gece içe aktarma) | ❌ | Binance adaptörü yazılı ama lisans kararına kadar kapalı (`enabled: false`); GitHub Actions iş akışı yok |
| Replay | Oynat/duraklat, hız 0,1–10, mum ve dakika adımı | ✅ | |
| Replay | Tarihe git | ⚠️ | Çalışıyor, ancak grafik yeni tarihe ortalanmıyor (bkz. 3) |
| Replay | Bölümler (işlemli hesapta geri dönüş) | ✅ | `00d4215`, migration 202610240003; açık pozisyon varken engelli |
| Motor | Piyasa emri (AL/SAT) | ✅ | Kuruş hassasiyetinde tam sayı motoru, en fazla 20 açık pozisyon |
| Motor | Bekleyen emirler (limit/stop) | ❌ | Motorda yok |
| Motor | SL/TP, sonradan değiştirme | ✅ | SL ve TP aynı mumda vurulursa işlem "belirsiz" olarak işaretlenir |
| Motor | Spread | ✅ | Hesap başına sabit |
| Motor | Komisyon | ✅ | Lot başına gidiş-dönüş, kapanışta yazılır |
| Hesap | Hesaplar ve kotalar | ✅ | Ücretsiz 1, Premium 10 aktif hesap |
| Hesap | Defter senkronu | ✅ | Kapanan işlemler deftere kopyalanır (`platform_source='backtest'`, `journals.trade_scope`) |
| Arayüz | Basit / Gelişmiş mod | ✅ | |
| Arayüz | Panel boyutlandırma | ✅ | Sağ ve alt ayırıcılar (fare ve klavye), tarayıcıda saklanır |
| Arayüz | Panelleri sürükleyip taşıma | ❌ | İstendi, yapılmadı |
| Arayüz | Tam ekran (F) ve kısayol sayfası | ✅ | |
| Arayüz | Görünüm çekmecesi ve temalar | ✅ | Hazır temalar, mum stili, renkler, göster/gizle, kendi temaların |
| Arayüz | Hacim çubukları | ⚠️ | Tahmini değer (1 dakikalık mum aralıklarının toplamı); adı hâlâ "Hacim" |
| Arayüz | Canlı sayılar (bakiye, K/Z, fiyat) | ⚠️ | İşlem açıkken sayılar kayıyor (bkz. 3) |
| Çizim | Çizim araçları | ✅ | 8 araç, mıknatıs, kilit, gizle; Premium çizimleri hesaba kaydedilir |
| İstatistik | İstatistik sekmesi | ✅ | |
| İstatistik | İstatistik widget'ları | ❌ | İstendi, yapılmadı |
| Grafik | Çoklu grafik | ✅ | 1, 2 yan yana, 2 alt alta, 2x2, 1+3; zaman ve imleç eşitleme |
| Plan | Ayda 100 işlem (cTrader verili hesap, ücretsiz) | ✅ | Veritabanında trigger ile uygulanıyor, sentetik veri sayılmıyor |
| Kripto | Spread USD, "Değer / %1 hareket" ipucu | ✅ | |
| Dil | Çeviriler tr/en/de | ✅ | Her dilde 340 `backtest.*` anahtarı, eşitlik testi geçiyor |

## 2. Ücretsiz / Premium

| Özellik | Ücretsiz | Premium |
|---|---|---|
| Aktif backtest hesabı | 1 | 10 |
| Sentetik veriyle işlem | Sınırsız | Sınırsız |
| cTrader verili hesapta işlem | Ayda 100 (UTC ayı) | Sınırsız |
| Replay, tarihe git, bölümler | ✅ | ✅ |
| Basit/Gelişmiş mod, panel boyutu, tam ekran | ✅ | ✅ |
| Hazır temalar | 2 (Wawe, TradingView) | Tümü |
| Mum stili, renkler, göster/gizle, kendi temaların | ❌ (PRO etiketi) | ✅ |
| Çizim araçları | Trend, yatay, dikdörtgen; yalnız oturum boyunca | 8 araç, hesaba kayıtlı (hesap başına 500) |
| İstatistikler | Temel rakamlar ve bakiye eğrisi | Ek olarak varlık eğrisi, drawdown, aylık ısı haritası, R dağılımı, seanslar, beklenti |
| Çoklu grafik | ❌ (PRO etiketi) | ✅ |
| Defter senkronu | ✅ | ✅ |

Kapılar `public/src/core/config.js` FEATURES içinde (`backtestThemes`, `backtestDrawings`, `backtestStats`,
`backtestMultiChart`, `backtestUnlimitedTrades`). Ücretsiz kullanıcı Premium kontrole tıklayınca yükseltme penceresi açılır.

## 3. Bilinen sorunlar ve son istekler

Son commit'ten (`00d4215`, 2026-10-24) sonra hiçbir düzeltme yapılmadı. Listedeki işlerin hiçbiri tamamlanmadı.

| Konu | Durum | Koddaki durum |
|---|---|---|
| Panelleri sürükleyip boyutlandırma | ⚠️ Yarısı yapıldı | Boyutlandırma var (`bt-layout.js`, sağ ve alt ayırıcı). Panelleri taşımak veya yerlerini değiştirmek mümkün değil |
| İstatistik widget'ları | ❌ Bekliyor | `bt-stats.js` sabit bir düzen çiziyor; widget ekleme, kaldırma veya sıralama yok |
| İşlem açıkken kayan sayılar | ❌ Bekliyor | `.bt-num` `tabular-nums` kullanıyor ama alanların sabit bir genişliği yok; basamak sayısı veya işaret değişince yazı kayıyor |
| "Aktivite (tahmini)" adı | ❌ Bekliyor | Etiket hâlâ "Hacim" (`backtest.look.showVolume`); "aktivite tahmini" ifadesi yalnızca açıklama notunda geçiyor |
| Tarih değişince grafik ortalanmıyor | ❌ Bekliyor | `placeCursor` (`backtest.js`) mumları yeniden yüklüyor ama görünür aralığı imlece kaydırmıyor; önceki aralık geçmiş eklenince olduğu gibi kaydırılıyor |
| BTCUSD, 2019'a gidince eksi milyarlarca fiyat ekseni | ❌ Bekliyor, kök neden bilinmiyor | Sentetik veri 2024-01'de başladığı için sorun cTrader veri yolunda (`bt-ctrader.js` fiyatları `Int32Array` içinde tutuyor, sonra `toChartBar` ile çiziliyor). Hatayı yeniden üretip araştırmak gerekiyor |

Diğer:

- `tests/stats-audit.test.js`: Windows'ta 2 test başarısız oluyor. Test yolları `/` ile karşılaştırıyor, Windows `\` kullanıyor; kodda bir hata yok.
- `public/src/bundle.js` çalışma kopyasında değişmiş görünüyor, ama içerik aynı (yalnız satır sonu farkı, `git diff` boş).

## 4. Teknik durum

| Konu | Değer |
|---|---|
| master'daki son commit | `00d4215` (2026-10-24 15:06 +0300), bölümler. `origin/master` ile aynı |
| Canlıdaki sürüm | master ile aynı. 2026-10-25'te kontrol edildi: 15 `?v=` numarası aynı, minify edilmiş `backtest.js`, `bt-stats.js`, `bt-layout.js` ve `bt-engine.js` md5 değerleri master'dan üretilenlerle birebir eşleşiyor, SW `wawe-v25` |
| Sayfa ve modüller | `src/pages/backtest.astro`, `public/interface/backtest/js/` içinde 13 dosya (yaklaşık 6.000 satır), `backtest.css` |

Veritabanı tabloları ve kolonları:

| Nesne | Ne için |
|---|---|
| `backtest_accounts` | Hesaplar; `data_source`, `source_*` (cTrader), `section_no`, `sections` |
| `backtest_account_trades` | Hesap işlemleri; `section_no` |
| `backtest_drawings` | Premium çizimleri (RLS, hesap başına 500) |
| `backtest_trade_usage` | Aylık işlem sayacı (asla azalmaz) |
| `system_settings.backtest_limits` | `{"ctrader_free_monthly_trades": 100}` |
| `trades` (+ `journals.trade_scope`) | Deftere kopyalanan backtest işlemleri |
| `ctrader_tokens.refreshing_since` | Token yenileme kilidi |

Migration'lar (hepsi canlıda, DEVAM.md kayıtlarına göre):

| Migration | Konu | Rollback / doğrulama |
|---|---|---|
| 202610180001–0007 | Eski tablonun kaldırılması, hesaplar ve işlemler, defter bağı, istatistiklerden hariç tutma, mum bucket'ı | — |
| 202610180008 | Veri kaynağı (sentetik) | — |
| 202610180009 | cTrader veri kaynağı | — |
| 202610220001 | `journals.trade_scope` | Rollback dosyası repoda yok (eski yolu `1081b31` ile silindi; geçmişten alınabilir) |
| 202610240001 | `backtest_drawings` | `.down.sql`, doğrulama 15/15 |
| 202610240002 | Aylık işlem sınırı | `.down.sql`, doğrulama 12/12 |
| 202610240003 | Geri dönüş ve bölümler | `.down.sql`, doğrulama 11/11 |

Not: canlı veritabanı bu makineden sorgulanamadı (`~/.wawe-db.env` burada yok). Veritabanı durumu DEVAM.md'deki kayıtlardan alındı.

Edge Function'lar (üçü de canlıda yanıt veriyor, preflight 204):

| Fonksiyon | Rolü |
|---|---|
| `ctrader-candles` | Backtest için cTrader M1 mumları ve kapsam ölçümü |
| `ctrader-sync` | Ortak kilitli token yenileme (`_shared/ctrader.ts`) |
| `ctrader-connect` | cTrader hesap bağlantısı |

Testler (2026-10-25'te bu makinede çalıştırıldı):

| Tür | Sonuç |
|---|---|
| Tüm birim testleri (`node --test tests/*.test.js`) | 413 test: 411 geçti, 2 başarısız (stats-audit, Windows yol farkı) |
| Backtest birim testleri (12 adet `bt-*.test.js`) | 191 / 191 geçti |
| Duman testleri (`tests/smoke`) | 40 senaryo (23 doğrulama, 17 ekran görüntüsü), 13 sürücü. Bu incelemede çalıştırılmadı: repo dışında puppeteer-core ve Chrome gerekiyor |
| SQL doğrulamaları (canlıda, ROLLBACK ile) | 15/15, 12/12, 11/11 |

## 5. Sonraki adımlar (öncelik sırasıyla)

1. **BTCUSD eksi milyarlarca fiyat ekseni.** Veri doğruluğu hatası; cTrader BTCUSD hesabında 2019'a gidip hatayı yeniden üret, kök nedeni bul, birim testi ve duman senaryosu ekle.
2. **Tarihe gidince grafiği ortala.** `placeCursor` sonunda görünür aralığı imlece kaydır; çoklu grafikte diğer görünümler de eşitlenmeli.
3. **Kayan sayılar.** Canlı değer alanlarına sabit genişlik ver, işaret yerini sabitle; masaüstü ve telefonda dene.
4. **"Hacim" → "Aktivite (tahmini)".** tr/en/de; yerel dosya sürümü, `i18n.js?v=` ve SW `CACHE_VERSION` artırılmalı.
5. **stats-audit testini Windows'ta da geçer hale getir.** Yolları karşılaştırmadan önce `/` ile normalleştir.
6. **Panelleri sürükleyip taşıma ve istatistik widget'ları.** Önce tasarım kararı gerekiyor (hangi paneller taşınabilir, widget listesi, ücretsiz/Premium ayrımı).
7. **Bekleyen emirler (limit/stop).** Motorda olmayan temel özellik.
8. **Kendi veri arşivimiz.** Lisans kararından (R52) sonra Binance/Dukascopy içe aktarma ve gece iş akışı.

Her adımdan sonra: `?v=` artırılmalı, duman senaryoları çalıştırılmalı, DEVAM.md güncellenmeli.
