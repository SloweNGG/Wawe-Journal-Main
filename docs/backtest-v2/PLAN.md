# Backtest v2: ana plan

Durum, 2026-10-19 itibarıyla:
- Sahip onayını bekliyor.
- Hiçbir şey uygulanmadı, canlı veritabanına ya da Storage'a hiçbir şey yazılmadı.
- Branch `backtest-v2`.
- Kalıcı kurallar `KURALLAR.md`'de, kaldığımız yer `DEVAM.md`'de.

## Klasör

| Yol | İçerik |
|---|---|
| `karar-kaydi/` | Gereksinimler R1–R53, kararlar D0–D13, sağlayıcı ara bulguları |
| `bulgular/w1–w3` | Envanter, trg_calc_pnl, sembol, Binance, Storage ve tasarım incelemesi (JSON) |
| `sql/supabase/` | Migration 01, 02, 04, 05, 06, rollback dosyaları (`rollbacks/`), canlıda test SQL'i (`tests/`) |
| `sql/RUN_ORDER.md` | Çalıştırma sırası, korumalar, ön kontroller, yedek komutları |
| `sql/verify/` | SQL üretici (`build.mjs`), PGlite test düzeneği (`harness.mjs`), şablonlar (`src/`), son sonuç (`out/harness-output.txt`) |
| `sql/db-snapshot/` | Canlı şema ve fonksiyon gövdesi anlık görüntüsü (2026-10-18, salt okunur sorgularla alındı) |
| `asama-kaldirma/` | Eski sistemin kaldırılması (`stage2.md`, diff, önerilen `backtest.astro`) |
| `asama-arayuz/` | `stage4.md` (sayfa, motor, grafik) ve **`stage4-ek.md` (Faz A, admin kapısı, tarihe git; çelişkide bu dosya geçerli)**, sayısal prototipler |
| `asama-senkron-istatistik/` | `stage5-6.md`, okuyucu yaması, depoya hazır `bt-sync.js`, `trades-source.js` ve testler |
| `asama-arsiv/` | `ARSIV.md` ve içe aktarıcı prototipi |

## Uygulama sırası (sahip kararı, 2026-10-19)

Her faz sonunda uygulama çalışır durumda olur (R31).

**Faz A: Arayüz.** Yalnızca admin görür. Veriler örnek veri ve tarayıcıdadır, veritabanı kullanılmaz.
1. Eski sayfanın ön yüz kısmı kaldırılır (`stage2.md`):
   - `backtest.astro` sıfırdan yazılır,
   - `styles.css` içindeki bt seçicileri silinir,
   - `get-candles` repodan silinir,
   - `sw.js` sürümü artırılır.
2. Saf kütüphaneler ve testleri yazılır: `bt-symbols`, `bt-candles`, `bt-engine`, `bt-synthetic`.
3. `bt-data.js` içinde SyntheticSource çalışır: mumlar tarayıcıda deterministik olarak üretilir, ekranda "Sentetik veri · test" etiketi görünür.
4. `bt-store.js` LocalStore'u yazılır: hesap ve işlemler localStorage'da, Migration 02 ile aynı satır biçiminde ve aynı kurallarla tutulur.
5. Sayfa tamamlanır:
   - hesap listesi ve oluştur/düzenle/sil/sıfırla işlemleri,
   - replay, işlem motoru, grafik,
   - i18n ve admin kapısı,
   - navbar linki (yalnızca admin).

**Faz B: Veritabanı.** Canlıya ilk yazma bu fazdadır.
1. Tam yedek alınır ve yeri bildirilir (R48).
2. Migration 01 çalışır: `backtest_trades` silinir.
3. Migration 02 çalışır: iki tablo, RLS ve tetikleyiciler kurulur.
4. `settings.js` yedek silme yolu güncellenir.
5. `bt-store.js` SupabaseStore'a geçer. localStorage'daki test verisi taşınmaz.

**Faz C + D: Senkron ve istatistikler (birlikte yayınlanır).** Böylece backtest satırları filtresiz canlı istatistiklere hiç düşmez.
- Migration 04 ve `bt-sync.js` eklenir: kapanan işlemler günlüğe yazılır, bağlantı değişince kopyalar silinir.
- Migration 05 ve `trades-source.js` eklenir:
  - tüm okuyucularda canlı filtre,
  - işlemler sayfasında Tümü/Canlı/Backtest seçimi ve rozet.
- Migration 06 isteğe bağlıdır.

**Faz E: Arşiv ve herkese açma.** Lisans kararına bağlıdır.
- Migration 03 (admin-only bucket), içe aktarıcı, gece GitHub Actions işi ve ArchiveSource eklenir.
- Lisans netleşince Migration 07 ile sayfa tüm üyelere açılır.
- Ayrıntı: `asama-arsiv/ARSIV.md`.

## 2026-10-19 oturumunda tamamlananlar

**Migration 02 (D13).** Şablon `sql/verify/src/02.sql` düzenlendi, SQL yeniden üretildi.
- `initial_stop_loss` / `initial_take_profit` eklendi: açılışta tetikleyici tarafından kopyalanır, sonra değişmez. `rr_ratio` da değişmez. `stop_loss` / `take_profit` güncel seviyeyi tutar.
- Açık pozisyon varken spread ve komisyon değiştirilemez (`BACKTEST_OPEN_POSITIONS:<kolon>`).
- İşlemi olan hesapta `replay_time` geri alınamaz (`BACKTEST_REPLAY_BACKWARD`). Tarihe git kuralının veritabanı katmanı budur.
- PGlite harness'e 11 yeni test eklendi. Sonuç **213 geçti / 0 kaldı**. Kurulum, geri alma ve katalog karşılaştırması dahildir.

**Admin kapısı ve tarihe git kuralı:** `asama-arayuz/stage4-ek.md` §4–§5.

**Arşiv planı:** `asama-arsiv/ARSIV.md`. Taslak ajanı yarıda kaldığı için ben yazdım.

## Eksik kalanlar (dürüst durum)

- Önceki oturumdaki iki workflow **tamamlanmadı**. Oturum limitine takıldılar (2026-10-18 17:15 UTC):
  - `draft:archive`, `review:sql` ve `review:design` yarıda kaldı.
  - `fix:sql` hiç başlamadı.
  - Yani migration'lar **bağımsız SQL incelemesinden geçmedi**. Faz B'den önce SQL dosyaları canlı fonksiyon gövdeleriyle satır satır incelenecek.
- Migration 03 ve 07 henüz yazılmadı (Faz E).
- İçe aktarıcı D13'e tam uymuyor (manifest ve kilit yapısı) ve testleri yok (`ARSIV.md` §2).
- `stage5-6.md` güncellenecek: `mapTrade`, `initial_*` kolonlarını göndermeli ve hesap sıfırlandıktan sonra `reconcileAccount` çağrılmalı.

## Sahip onayını bekleyen kararlar (öneri kalın)

1. Navbar linki: **yalnızca adminlere göster**, lisanstan sonra herkese.
2. Örnek veri: **tarayıcıda sentetik üretim**. Alternatifi: statik örnek dosyalar.
3. Faz A'da localStorage kuralları: **veritabanıyla aynı kurallar**: kota, kilitler, geri gitme yasağı.
4. Faz B'ye geçişte localStorage test hesapları: **taşınmasın, silinsin**.
5. Hesabı sıfırla özelliği (işlemi olan hesapta geri gitmenin tek yolu): **ekle**.
6. Motor kuralları:
   - **XAUUSD pip 0,1**
   - **aynı 1m mumda TP ve SL birlikte vurursa önce SL ve işaret**
   - **komisyon gidiş-dönüş, kapanışta**
   - **ek kolonlar `gross_pnl` ve `exit_ambiguous`**
7. Senkron ve istatistik:
   - işlemler sayfası varsayılanı **Canlı**
   - senkron satırları **salt okunur**
   - Migration 06 (kullanılmayan 6 fonksiyonu sil; biri anon'a açık bir güvenlik açığı): **sil**
8. Yedek: **taşınabilir PostgreSQL 17 + `<kullanıcı klasörü>\WaweJournal-Backups\<UTC>\`**, OneDrive ve repo dışında. Ayrıca yerel deneme kümesi: **evet**.
9. Binance gecikme toleransı **2 gün**. TradingView atfı **dashboard sayfalarına da** eklensin.
