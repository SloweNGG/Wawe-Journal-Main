# Aşama 4 eki: Faz A (önce arayüz), admin kapısı, tarihe git kuralı

Tarih: 2026-10-19. `stage4.md` ile çelişen her yerde bu ek geçerlidir. Kaynak kararlar: D12, D13 (`../karar-kaydi/decisions.md`), sahibin 2026-10-19 sıralama kararı.

## 1. Faz A kapsamı (veritabanı yok)

Faz A, sayfanın tamamını canlı veritabanına hiç dokunmadan çalışır hâle getirir:
- replay,
- işlem motoru,
- hesap ekranları (liste, oluştur, düzenle, sil).

`stage4.md` aynen uygulanır, yalnızca şu değişikliklerle:

| stage4.md | Faz A'da |
|---|---|
| 2.4 `bt-data.js` ArchiveSource (Storage) | **SyntheticSource**: mumlar tarayıcıda üretilir (aşağıda §2). ArchiveSource arayüzü yerinde kalır, Faz E'de doldurulur. |
| 2.5.4 Hesap CRUD `window.sb` ile | **WwBtStore** üzerinden (§3). Faz B'de yalnızca arka uç değişir. |
| Hesap formunda günlük seçimi | Gizli. Senkron Faz C'de gelir. |
| `stage2.md` (kaldırma) | Ön yüz kısmı Faz A'nın ilk adımıdır. Migration 01 ve `settings.js` değişikliği Faz B'ye taşınır. |

## 2. Örnek veri: SyntheticSource

- `asama-arsiv/proto/scripts/candles/lib/sources/synthetic.mjs` üreteci `public/interface/backtest/js/bt-synthetic.js` dosyasına taşınır. Dosya IIFE yapısındadır ve `})(typeof window !== 'undefined' ? window : globalThis);` ile biter. Tarayıcı ve Node içe aktarıcısı aynı kodu kullanır, böylece iki taraf bayt bayt aynı mumları üretir.
- Üreteç deterministiktir. Bir günün verisi yalnızca (seed, sembol, gün) üçlüsüne bağlıdır ve piyasa saatlerine uyar (`WwBtSymbols.isOpen`).
  - Bir ay 1m veri (~31–44 bin bar) tarayıcıda milisaniyeler içinde üretilir.
  - Ağ, Storage ya da lisans gerekmez.
- Etiket her zaman görünür: **"Sentetik veri · test"**.
- Altı sembolün hepsi sentetik modda açıktır. `enabled:false` bayrağı yalnızca gerçek (lisanslı) kaynaklar için geçerlidir.
- Temel sembol dosyası `asama-arsiv/proto/public/interface/backtest/js/bt-symbols.js`'dir. Bu sürüm D13'ü içerir: XAUUSD digits 2 / pip 0.1, pipValue ve kripto için bps. `asama-arayuz/prototip/bt-symbols.js` daha eski bir sürümdür.

## 3. Hesap durumu tarayıcıda: WwBtStore

`public/interface/backtest/js/bt-store.js` iki arka uca sahiptir. Sayfa yalnızca bu arayüzü bilir:

```
WwBtStore.listAccounts() / getAccount(id) / createAccount(row) / updateAccount(id, patch) / deleteAccount(id)
WwBtStore.listTrades(accountId) / insertTrade(row) / updateTrade(id, patch) / deleteTrades(accountId)
```

**LocalStore (Faz A):**
- Anahtar: `ww-bt:v1:<userId>`.
- Değer: `{ v:1, accounts:[], trades:[] }`. Satırlar, Migration 02'deki kolon adları ve ondalık metin (string) değerlerle saklanır, böylece Faz B'de satır biçimi değişmez.
- Her okuma ve yazma try/catch içindedir. localStorage kullanılamıyorsa sayfa bellekte çalışır ve "kayıt tutulmuyor" uyarısı gösterir.
- Kullanıcı kimliği değişirse başka kullanıcının anahtarı okunmaz.

**Kurallar**: LocalStore, Migration 02 tetikleyicilerinin kurallarını birebir uygular ve aynı hata kodlarını üretir. Böylece Faz B'ye geçişte arayüz davranışı değişmez:
- Kota: free 1, premium 10 aktif hesap (`getUserPlanSilent`). Kota dolunca `openUpgradeModal` açılır, kilit ikonu kullanılmaz. Hata kodu `BACKTEST_LIMIT_EXCEEDED:<n>`.
- `id`, `user_id` ve `symbol` değiştirilemez. Hata kodu `BACKTEST_ACCOUNT_IMMUTABLE:<kolon>`.
- Açık pozisyon varken `spread_pips` ve `commission_per_lot` değiştirilemez. Hata kodu `BACKTEST_OPEN_POSITIONS:<kolon>`. Ayarlar penceresinde bu alanlar kilitli görünür ve bir açıklama metni eşlik eder.
- İşlemi olan hesapta `replay_time` geri alınamaz. Hata kodu `BACKTEST_REPLAY_BACKWARD` (§5).
- İşlem açılırken `initial_stop_loss` ve `initial_take_profit`, o anki SL/TP'den kopyalanır. İşlemin girişle ilgili kolonları (giriş, initial_*, rr_ratio) sonradan değişmez. Kapanmış işlem kesinleşmiştir.

**SupabaseStore (Faz B):** aynı arayüzle `window.sb` sorgularını çalıştırır.
- Her sorguda `user_id` filtresi açıkça yazılır, çünkü RLS adminlere herkesin satırını gösterir.
- Faz A'daki localStorage test verisi veritabanına taşınmaz (öneri). Faz B'ye geçişte silinir.

## 4. Admin kapısı (D12, R49)

1. `backtest.astro` normal şekilde açılır: önce `requireAuth`, ardından `ensureActiveJournal`.
2. Karar her girişte **kullanıcı nesnesinden** verilir: `isAdmin(user)`, yani `user.app_metadata.role === 'admin'`. Bu fonksiyon `public/src/core/supabase.js:196`'da tanımlıdır, `window.isAdmin` olarak da erişilebilir. `sessionStorage.ww_user_is_admin` yalnızca navbar'ın ilk çizimi için ipucu olarak kullanılır, karar için kullanılmaz.
3. Admin olmayan kullanıcı nötr bir **"Backtest yakında"** ekranı görür:
   - mum üretilmez, veri indirilmez,
   - store açılmaz,
   - zamanlayıcı başlatılmaz.
4. Kapı her SPA girişinde yeniden çalışır (`PAGE` init). `onLeave` her şeyi temizler.
5. Navbar'daki Backtest linki yalnızca adminlere çizilir. `navbar.js:1514`'teki mevcut `isAdminUser` dalına eklenir. `nav.backtest` anahtarı tr/en/de'ye eklenir. PRO etiketi ve kilit ikonu kullanılmaz.
6. Bu kapı bir güvenlik sınırı değildir, yalnızca görünürlüğü kontrol eder. Gerçek sınırlar şunlardır:
   - Faz A'da gizli veri yoktur (sentetik mumlar ve kullanıcının kendi localStorage verisi).
   - Faz B'de RLS herkesi kendi satırlarıyla sınırlar.
   - Lisanslı veri için engel, Migration 03'teki **admin-only bucket politikasıdır**.

## 5. Tarihe git kuralı (D13, R23)

1. **İmleç bir zaman damgasıdır**: `R.tCursor`, son gösterilen 1m barın açılış zamanıdır. Dizi indeksi değildir.
   - `stage4.md`'deki `R.k` kaldırılır. İndeks her ay parçasında ikili arama ile bulunur, bu yüzden öne ısınma ayı eklemek imleci kaydırmaz.
   - `replay_time = tCursor + 60 s`.
2. **Hesapta hiç işlem yoksa** kullanıcı veri kapsamı içinde ileri ya da geri, istediği tarihe gidebilir.
3. **Hesapta işlem varsa** geri gidilemez. Bunun için "Hesabı sıfırla" seçeneği vardır:
   - Onay penceresi sorar: "tüm işlemler silinir, bakiye başlangıca döner".
   - Onaydan sonra `deleteTrades(accountId)` çalışır ve geri gitmek serbest kalır.
   - Faz C'den itibaren sıfırlamanın ardından `WwBtSync.reconcileAccount` çağrılır, böylece günlükteki kopyalar da silinir.
   - Veritabanında ikinci katman olarak `BACKTEST_REPLAY_BACKWARD` vardır.
4. **Açık pozisyon varken ileri tarihe gidilemez**, aksi hâlde aradaki TP/SL kontrolleri atlanırdı (`backtest.err.goto_open_positions`). Oynat ve adım ilerletme serbesttir, çünkü her 1m barı tek tek değerlendirir.
5. **Hedef zaman piyasanın kapalı olduğu bir ana denk gelirse** imleç `nextOpen(t)` ile bulunan, hedefe eşit ya da sonraki ilk bara gider. Hedef veri kapsamı dışındaysa son mevcut bara sabitlenir ve kullanıcıya bir mesaj gösterilir.
6. **İkinci katman (görüntü)**: aşağıdakilerin hepsine yalnızca imleç zamanına kadar olan işlemler girer:
   - işaretler, fiyat çizgileri ve geçmiş satırları,
   - gerçekleşen kâr/zarar ve bakiye.
   Giriş için `entry_time ≤ tCursor + 60` koşulu, kapanış için `exit_time ≤ tCursor + 60` koşulu aranır.
7. **Grafik hiçbir zaman imleçten sonraki veriyi almaz**:
   - Agregasyon yalnızca `aggregateUpTo(cols, tCursor, tf)` ve artımlı güncelleme ile yapılır.
   - Önceden hesaplanmış üst zaman dilimi barları yalnızca imleçten önce biten kovalar için önbelleğe alınır.
   - Testte rastgele imleç konumlarıyla bir özellik (property) testi çalışır.
8. Zaman dilimi değiştirmek imleci oynatmaz. H4/D1 kovaları DST'ye duyarlı `dayAnchor` ile hesaplanır. Testler 2026-03-08 ve 2026-11-01 geçişlerini kapsar.

Yeni i18n anahtarları (tr / en / de):
- `backtest.reset.title`, `backtest.reset.confirm`, `backtest.reset.done`
- `backtest.err.goto_backward`: "İşlem yapılmış hesapta geri gidilemez; önce hesabı sıfırlayın."
- `backtest.err.open_positions_settings`
- `backtest.gate.soon`
- `backtest.source.synthetic`

## 6. D13'ün işlem motoruna yansıması

- TP/SL düzenlemesi yalnızca `stop_loss` ve `take_profit` alanlarını günceller. `initial_*` ve `rr_ratio`, açılıştaki değerleriyle kalır.
- rr_ratio formülü: `ROUND(|tp − giriş| / |giriş − sl|, 2)`. Gerçek giriş fiyatı ve initial seviyeler kullanılır. `trg_calc_pnl` ile aynı formüldür.
- Faz C'de `mapTrade`, günlük satırına `initial_stop_loss` ve `initial_take_profit` değerlerini gönderir (`stage5-6.md`'deki `stop_loss`/`take_profit` okuması buna göre değişir).

## 7. Faz A testleri

`stage4.md` §7 testlerine (bt-symbols, bt-candles, bt-engine, bt-i18n) ek olarak:
- `tests/bt-store.test.js`: kota, değiştirilemez alanlar, spread kilidi, geri gitme yasağı, initial kopyası, bozuk veya erişilemeyen localStorage durumu.
- `tests/bt-synthetic.test.js`: determinizm (gün gün üretim ile ay bütün üretimin aynı sonucu vermesi), piyasa kapalıyken bar üretilmemesi, fiyatların point ızgarasında olması.
- Admin kapısı: kapı fonksiyonu saf tutulur ve `isAdmin` doğru/yanlış/eksik durumlarıyla test edilir.

Faz A'nın kontrol listesi:
- `node --test tests/*.test.js` geçer.
- Admin hesabıyla tam akış çalışır: hesap aç, oynat, al/sat, TP/SL, kapat, sıfırla, tarihe git.
- Admin olmayan hesap "yakında" ekranını görür.
- Diğer sayfalar etkilenmez.
- `sw.js` `CACHE_VERSION` ve değişen dosyaların `?v=` değerleri artırılır.
