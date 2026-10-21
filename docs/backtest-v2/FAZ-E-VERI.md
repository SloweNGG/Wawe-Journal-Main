# Faz E: veri kaynağı (Sentetik / cTrader)

Tarih: 2026-10-20. Bu turda canlıya hiçbir şey yazılmadı (DB, Edge Function, Storage, secret yok).

## 1. Ölçüm: cTrader Open API `ProtoOAGetTrendbarsReq` (M1)

### Durum: ölçüldü (2026-10-20)

- Kimlik bilgileri: sahibin verdiği client secret ve Playground/Sandbox token'ı (`accounts` kapsamı). Yalnızca o komutun ortam değişkeni olarak kullanıldı.
  - Hiçbir dosyaya, loga ya da bu belgeye yazılmadı. Çıktı dosyaları ve `docs/` tarandı, gizli değer geçmiyor.
  - Token yenilenmedi. Canlı DB'ye dokunulmadı.
- **Ölçülen hesap:** token'ın gördüğü 6 hesabın hepsi **Spotware DEMO** (`demo.ctraderapi.com`). Gerçek bir broker'ın canlı sunucusu ölçülmedi. Derinlik ve boşluklar broker'a göre farklı olabilir (bkz. Riskler 2).
- **Semboller:** EURUSD (symbolId 1) ve XAUUSD (symbolId 41) aynı adla bulundu. Hesapta 830 sembol var.
- Script repoda değil, oturum scratchpad'inde (`ctrader-probe/probe.mjs`). Node 25, ek paket yok.
- **İlk tam tarama geçersiz sayıldı:**
  - 35 günlük parçalar kullanıldı. cTrader her parçada yalnızca son 14 000 barı döndürdü (`hasMore=true`).
  - Sonuç olarak 966 sahte "eksik gün" çıktı.
  - Tarama 9 günlük parça ve `hasMore` sayfalamasıyla tekrarlandı. Aşağıdaki sayılar ikinci taramadandır.

Script'in davranışı:

- Secret ve token'ı **gizli girişle** sorar (ekranda görünmez, dosyaya ve geçmişe yazılmaz). İstenirse ortam değişkeninden de okur.
- Token'ı **yenilemez**. Yenileme, DB'deki refresh token'ı geçersiz kılar ve `ctrader-sync`'i bozardı.
- Hesap listesi yanıtı token'ı geri gönderdiği için **ham yanıt hiç basılmaz**. Çıktıdaki her metinden gizli değerler ayıklanır.
- Rapor JSON'u yalnızca sayımları içerir (gün başına bar sayısı, hatalar). Fiyat ve gizli değer içermez.
- Yaptığı testler:
  1. **Token kapsamı:** `permissionScope`, yani `accounts` mı `trading` mi.
  2. **Aralık limiti:** 1, 3, 3.5, 3.6, 4, 5, 7, 14 ve 35 günlük M1 istekleri.
  3. **`count` davranışı:** 100, 5000 ve 20000 değerleri.
  4. **Yıl örneklemesi:** 2010'dan bugüne her yılın Mart ortasından 3 gün.
  5. **Tam tarama:** 2020-01-01'den bugüne kesintisiz tarama. Eksik hafta içi günleri, yarım günleri ve en büyük hafta içi boşlukları bulur. Sembol başına yaklaşık 700 istek, 3-4 dakika.

Çalıştırma (sahip, kendi terminalinde; yol scratchpad'dir):

```
node "C:\Users\kadir\AppData\Local\Temp\claude\c--Users-kadir-OneDrive-Masa-st--Wawe-Journal-astro\ab2d1592-9a21-44f6-b677-39cb382ea6c2\scratchpad\ctrader-probe\probe.mjs"
```

Hızlı mod için sona `--quick` eklenir: tam tarama yapılmaz, yalnızca limit testleri ve yıl örneklemesi çalışır. Belirli bir hesap için önce `$env:CTRADER_ACCOUNT_ID` verilir.

- **Client secret:** openapi.ctrader.com → Applications → uygulama 43858 → "Credentials".
- **Access token:** iki yol var.
  - (a) Aynı sayfadaki **Playground**'dan `accounts` kapsamıyla token üretmek. Kapsam sorusunu temiz biçimde yanıtlar ve DB'ye dokunmaz.
  - (b) Supabase Table Editor'da `ctrader_tokens.access_token`.
  - Önerilen: (a). Önce `accounts` ile çalıştırılır; trendbar hatası alınırsa `trading` ile tekrar denenir.

### Sonuç tablosu

Ölçüm: Spotware demo sunucusu, M1, 2020-01-01'den 2026-10-20'ye.

| Soru | EURUSD | XAUUSD |
|---|---|---|
| M1 geçmiş derinliği | **2011'e iniyor.** 2011-03 dolu, 2010-03 boş | **2013'e iniyor.** 2013-03 dolu, 2012-03 boş |
| 2020'ye iniyor mu? | **Evet**, 2020-01-01'den bugüne kesintisiz | **Evet**, 2020-01-01'den bugüne kesintisiz |
| Tek istekte en çok bar | **14 000** (sert tavan) | **14 000** (sert tavan) |
| Tek istekte gün aralığı | Aralık sınırı yok: 35 gün kabul edildi | Aynı |
| Tavanı aşan aralıkta ne oluyor? | En **son** 14 000 bar gelir, `hasMore=true` | Aynı |
| Tavanı aşmayan güvenli aralık | 9 gün (en çok 10 098 bar geldi) | 9 gün (en çok 9 721 bar geldi) |
| Gün başına medyan bar | 1 419 | 1 378 (günlük 1 saatlik ara var) |
| `count` parametresi | Aralığın **sonundan** N bar verir; tavan yine 14 000 | Aynı |
| Eksik hafta içi gün | **0** | **8.** Hepsi borsa tatili: 7 Kutsal Cuma + 2021-12-24 |
| Yarım gün | 1 (2022-12-26, Noel tatili) | 3 (2022-04-18 Paskalya Pazartesi, 2022-12-26 ve 2023-01-02 tatil) |
| En büyük hafta içi boşluk | Noel ve Yılbaşı (~3 gün), başka yok | Paskalya ve Noel ve Yılbaşı, başka yok |
| Tam tarama maliyeti | 277 istek, hız hatası yok | 277 istek, hız hatası yok |
| Yetki kapsamı | **`accounts` (görüntüleme) yetiyor**, `trading` gerekmiyor | Aynı |

İstek aralığı 260 ms'ydi, yani saniyede ~4 istek. Belgelenen sınır olan 5/sn aşılmadı, sınır ayrıca zorlanmadı.

Ölçülmeyenler:
- **Fiyat tipi:** Trendbar'lar belgelere göre **bid** fiyatlarıdır. Spread simülasyonu mevcut `spread_pips` ile sürer.
- **Canlı broker sunucusu.**

Ham sayımlar (gün başına bar, fiyat ve gizli değer yok) scratchpad'deki `ctrader-probe/out/rapor-1792529050793.json` dosyasında. Bu oturuma özel, kalıcı değil.

### "cTrader verisiyle backtest yapılabilir mi?"

**Evet.**

- `accounts` kapsamlı mevcut bağlantı türüyle EURUSD ve XAUUSD için M1 veri alınabiliyor.
- Veri 2020'den bugüne eksiksiz geliyor; tek eksikler borsa tatilleri.
- Daha da geriye iniyor: EURUSD 2011'e, XAUUSD 2013'e kadar.
- Bir ay M1 verisi (en çok ~44 000 bar) **4 istekte** gelir (9 günlük parçalar). Saniyede ~4 istekle yaklaşık 1 saniye sürer. Bu, replay'in ay bazlı yükleme modeline (`getMonthMinutes`) uyuyor.
- **Tek çekince:** ölçüm Spotware demo sunucusunda yapıldı. Gerçek broker hesaplarında derinlik farklı olabilir. Bu yüzden ilk tarih her hesap için `coverage` ile ölçülmeli (planda var).

## 2. Plan: hesap açarken veri kaynağı seçimi

Kurallar (sahip):

1. **Sentetik veri:** herkese açık; tarayıcıda üretilir (`bt-synthetic.js`).
2. **cTrader verisi:** yalnızca cTrader bağlamış kullanıcılar için; mumlar kullanıcının kendi broker'ından gelir.
3. Veri kaynağı hesap açıldıktan sonra değiştirilemez.
4. Sentetik veri, grafikte ve hesap kartında "gerçek piyasa verisi değildir" diye açıkça etiketlenir.
5. Sentetik hesaplar defterlere bağlanamaz; defter bağlantısı yalnızca cTrader verili hesaplarda olur.
6. Bir kullanıcının cTrader verisi başka kullanıcılara gösterilmez.

### Veritabanı: Migration 08 + rollback

> **Durum (2026-10-21, Faz 2):** Migration 09 yazıldı ve canlıda; `ctrader-candles` ve arayüz kodu hazır, Edge Function yayını token iznini bekliyor (bkz. SON-RAPOR.md).
>
> **Durum (2026-10-21, Faz 1):** Faz 1'de Migration 08 **kısaltılmış** hâliyle uygulandı: yalnızca `data_source` (`synthetic`), bağlama CHECK'i ve değiştirilemezlik trigger'ı. `source_*` sütunları, `chk_source_fields` ve `'ctrader'` değeri aşağıdaki taslağa göre cTrader turunda **Migration 09** ile gelir. PRECONDITION karşılandı: admin'in bağlı tek sentetik hesabı ayrılıp 4 kopya işlem silindi (SON-RAPOR.md).

Dosyalar `202610180008_backtest_data_source.sql` ve `.down.sql`, KURALLAR §2 kalıbında.

- `backtest_accounts`'a eklenecek sütunlar:
  - `data_source text NOT NULL DEFAULT 'synthetic' CHECK (data_source IN ('synthetic','ctrader'))`
  - `source_ctid_account bigint NULL`, `source_is_live boolean NULL`
  - `source_symbol_id bigint NULL`, `source_symbol_name text NULL`, `source_digits int NULL`
- **Yabancı anahtar kullanılmaz.** `disconnect_ctrader()`, `ctrader_accounts` satırlarını siliyor; yeniden bağlanınca yeni id oluşuyor. Bu yüzden broker hesap numarası saklanır, sahiplik her istekte Edge Function'da doğrulanır.
- **CHECK `chk_source_fields`:** `data_source = 'ctrader'` ise `source_*` alanları dolu olmalı, `'synthetic'` ise hepsi NULL olmalı.
- **CHECK `chk_journal_needs_ctrader`:** `journal_id IS NULL OR data_source = 'ctrader'` (kural 5). Kural yalnız arayüzde değil, DB'de de zorlanır.
- **BEFORE UPDATE trigger:** `data_source` ya da `source_*` değişirse hata verir (kural 3).
- **PRECONDITION:** Canlıda deftere bağlı sentetik hesap varsa migration durur. Bunlar şu an admin'in test hesaplarıdır. Sahip ya bağlantıyı kaldırır (Migration 04 trigger'ı defterdeki kopyaları temizler) ya da migration içinde açık bir "detach" adımı onaylar.
- Testler: harness (PGlite ve PG 17). İçerik: CHECK'ler, değiştirilemezlik, RLS'in değişmediği, rollback.
- Not: Migration 03 ve 07 (candles bucket) bu planla gereksiz kalabilir. Sunucuda ortak arşiv tutulmuyor; lisans kararı Binance/forex için ayrıca durur.

### Edge Function: `ctrader-candles` (yeni)

- **Kimlik:** Kullanıcı JWT ile doğrulanır.
- **Girdi:** `{ action: 'symbols' | 'coverage' | 'month', ctidAccount?, backtestAccountId?, month? }`.
- **Sahiplik:** Hem `backtest_accounts.user_id` hem `ctrader_accounts` (`user_id` + `ctid_trader_account_id`) çağıranla eşleşmeli. Başka kullanıcının hesabına erişim mümkün olmaz (kural 6). Token yalnızca sahibinin satırından okunur.
- **İşleyiş:** WebSocket açılır → AppAuth → AccountAuth. Ay, 9 günlük parçalara bölünür; 14 000 bar tavanı nedeniyle `hasMore` gelirse geriye doğru sayfalanır. Bar'lar `low + delta` / 1e5 formülüyle çözülür, `[t,o,h,l,c]` olarak döner. Biçim, mevcut `getMonth` sözleşmesiyle aynıdır.
- **Önbellek:** Sunucuda mum saklanmaz (ilk sürüm). Yanıt `Cache-Control: private` ile döner; tarayıcı tarafında IndexedDB'de kullanıcıya özel önbelleğe alınır. Bu, kural 6'yı en basit hâliyle sağlar ve "veri dağıtımı" riskini azaltır.
- **Token yenileme:** `ctrader-sync` ile **ortak ve kilitli** olmalı (`pg_advisory_xact_lock` ya da `SELECT … FOR UPDATE` RPC). Aksi hâlde iki fonksiyon aynı anda yenilerse biri refresh token'ı geçersiz kılar ve kullanıcı bağlantıyı yeniden kurmak zorunda kalır. Yenileme kodu `_shared/`'a taşınır.
- **Hız:** Bağlantı başına 260 ms aralık. Kullanıcı başına basit bir dakika kotası uygulanır (ör. 30 ay/dk).
- **Deploy:** sahip onayıyla (KURALLAR §1). `CTRADER_CLIENT_ID` ve `CTRADER_CLIENT_SECRET` secret'ları zaten mevcut.

### Arayüz

- **Hesap açma penceresi:** "Veri kaynağı" seçimi, iki seçenek.
  - "Sentetik veri · gerçek piyasa verisi değildir"
  - "cTrader verisi": `get_ctrader_status` RPC'ye göre etkin ya da pasif olur. Pasifse "Önce cTrader hesabını bağla" bağlantısı gösterilir.
  - cTrader seçilince broker hesabı (birden fazlaysa) ve broker sembolü seçilir (`XAUUSD`, `GOLD` ya da `EURUSD.r` gibi farklı adlar olabilir). Başlangıç tarihi, `coverage`'ın verdiği ilk aya göre sınırlanır.
- **Hesap ayarları penceresi:** Kaynak salt okunur gösterilir. Sentetik hesapta defter seçimi gizlenir ve kısa bir açıklama yer alır.
- **Etiket (kural 4):** Sentetik hesapta grafiğin üstünde kalıcı bir rozet ve hesap kartında aynı etiket bulunur. cTrader hesapta "cTrader · <broker> · bid" etiketi gösterilir.
- **`bt-data.js`:** `createCTraderSource()` eklenir. Aynı CandleSource arayüzünü uygular (`coverage`, `getMonthMinutes`, `prefetch`), IndexedDB önbelleği kullanır, hata kodları `NOT_FOUND`, `ABORTED` ve yeni `AUTH`'tur (bağlantı koptu).
- **`backtest.js`:** Kaynak, hesaba göre seçilir; şu an sabit `createSyntheticSource({seed:1})` var. `bt-sync` ve `fillJournalSelect` sentetik hesapta hiç çalışmaz.
- **Bağlantı kopunca:** cTrader bağlantısı kesilen hesap açılırsa "cTrader bağlantısı gerekli" ekranı gelir. İşlemler ve defter kopyaları durur, veri silinmez.
- **i18n:** tr, en, de.
- **Testler:** `node --test` (kaynak seçimi, sync koruması, etiket) ve pagecheck.
- **Sayfa erişimi:** Faz 1'de (2026-10-21) sayfa giriş yapmış herkese açıldı, navbar linki herkese görünür; cTrader seçeneği formda "Yakında" ile pasif.

### Tahmini süre

| İş | Süre |
|---|---|
| Ölçüm | bitti (2026-10-20) |
| Migration 08 + rollback + harness testleri | 0,5–1 gün |
| `ctrader-candles` + ortak/kilitli token yenileme + yerel deneme | 1,5–2 gün |
| Arayüz (seçim, etiketler, kaynak, IndexedDB, defter kısıtı, i18n, testler) | 2–3 gün |
| Canlı tur (yedek, migration, deploy, uçtan uca deneme) | 0,5–1 gün |
| **Toplam** | **~5–7 iş günü** |

### Riskler

1. **Lisans ve koşullar:**
   - Spotware Open API kullanım koşulları ve broker sözleşmeleri, verinin üçüncü taraf uygulamada gösterilmesini kısıtlayabilir.
   - Plan riski azaltır: kullanıcı yalnızca kendi verisini görür, sunucuda ortak arşiv yok.
   - Yine de hukuken doğrulanmadı; açılıştan önce sahip koşulları okumalı.
2. **Derinlik broker'a bağlı:** Ölçüm yalnızca Spotware demo sunucusunda yapıldı (EURUSD 2011'e, XAUUSD 2013'e iniyor). Gerçek broker'lar ve canlı sunucular farklı geçmiş verebilir. İlk tarih her hesap için `coverage` ile ölçülmeli, varsayılmamalı.
3. **Token yenileme yarışı:** Ortak kilit olmazsa `ctrader-sync` ile yeni fonksiyon birbirinin refresh token'ını geçersiz kılar ve kullanıcı yeniden bağlanmak zorunda kalır.
4. **Hız ve uygulama limitleri:**
   - Geçmiş veri istekleri bağlantı başına 5/sn.
   - Çok kullanıcıda Spotware uygulama düzeyinde kısıtlayabilir.
   - Her ay yüklemesi WebSocket kurulumuyla 1–3 sn sürer; önbellek ve prefetch şart.
5. **Bağlantı kopması:** `disconnect_ctrader` satırları siliyor. cTrader hesaplar o durumda veri alamaz; arayüz bunu açıkça göstermeli.
6. **Sembol farklılıkları:** Ad, digits ve kontrat büyüklüğü broker'a göre değişir. Lot ve PnL hesabı, `bt-symbols.js`'deki sabit kontrat değerleri yerine broker sembol bilgisiyle doğrulanmalı.
7. **Bid fiyatlar:** Alış işlemleri spread simülasyonuna bağlı kalır. Mevcut motor bunu `spread_pips` ile yapıyor, ama broker'ın gerçek spread'i değildir.
8. **Mevcut test hesapları:** Deftere bağlı sentetik hesaplar Migration 08'i durdurur (PRECONDITION). Önce temizlik kararı gerekir.
