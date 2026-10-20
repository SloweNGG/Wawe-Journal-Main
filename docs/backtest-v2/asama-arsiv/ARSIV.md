# Veri arşivi planı (Faz E)

Tarih: 2026-10-19. Önceki oturumda arşiv taslağını yazan ajan (`draft:archive`) oturum limitine takıldı (2026-10-18 17:15 UTC). Ajanın plan belgesi yoktu, inceleme ve düzeltme turu da hiç çalışmadı. Bu belgeyi prototip kodundan ve D7/D12/D13 kararlarından ben yazdım.

## 1. Hazır olanlar (prototip, `proto/`, bağımsız incelemeden geçmedi)

- `scripts/candles/import.mjs`: CLI.
  - Modlar: `--mode backfill|daily`.
  - Kaynaklar: `--source synthetic|binance`.
  - `--local-dir` ile çevrimdışı çalışır.
  - Yalnızca Node'un yerleşik modüllerini kullanır, npm paketi gerektirmez.
- `lib/`:
  - `args`
  - `env`: Supabase URL ve anahtar
  - `log`: gizli değerleri maskeler, GitHub Actions uyarıları üretir
  - `storage`: Storage REST ve yerel dizin
  - `http`, `zip` (inflateRaw), `raw-cache`
  - `month-file`: `{v, symbol, month, tf, digits, source, rows:[[t,o,h,l,c]]}` gzip JSON
  - `manifest`, `quality`, `report`
  - `run`: kilit ve orkestrasyon
  - `time`, `prices`, `symbols`
- `lib/sources/`:
  - `index.mjs`: kaynak adaptörü arayüzü ve lisans kontrolü.
  - `binance.mjs`: yazıldı ama kapalı (R52).
  - `synthetic.mjs`: deterministik ve piyasa saatlerine uyan test verisi üretir, `synthetic/` önekine yazar.
  - Dukascopy adaptörü yoktur (R50).
- `public/interface/backtest/js/bt-symbols.js`: tek sembol yapılandırması (D13 sürümü).
- Duman testi: sentetik EURUSD ve BTCUSDT, 2026-08..10, yerel dizine yazıldı ve çıkış kodu 0 oldu. Bu test önceki makinede çalıştırıldı; repoda kaydı yok.

## 2. Eksikler ve D13'e uyum farkları

| Konu | Prototip | Olması gereken (D13) |
|---|---|---|
| Manifest | Veri kümesi başına tek `manifest.json` | Sembol başına `<prefix><SYMBOL>/index.json`; her ayda UTC gün defteri `{status ok/closed/missing/failed, source, sha256}`. Ay, ancak her günü `ok` ya da `closed` ise kesinleşir. |
| Kilit | Tek global `_import.lock.json`, 6 saat sonra bayat sayılır | Sembol başına kilit, 2 saat sonra bayat sayılır, x-upsert olmadan oluşturulur |
| Testler | Yok | ZIP okuyucu, ay dosyası, kalite, manifest birleştirme. `TZ=Asia/Istanbul` ve `TZ=America/New_York` altında çalışır. |
| GitHub Actions | Yok | `.github/workflows/candles-archive.yml` (§4) |
| Migration 03 / 07 | Yazılmadı | §3 |
| Tarayıcı yükleyici | Yok | `bt-data.js` içinde ArchiveSource (§5) |

## 3. Migration'lar (yazılacak, her biri rollback ile)

- **03 `candles` bucket'ı, yalnızca admin**:
  - Bucket özel olur (`public = false`).
  - Okuma politikası `bucket_id = 'candles' AND public.is_admin()`.
  - Aynı adda bir bucket varsa ve içinde nesne bulunuyorsa, `public = true` ise ya da limitleri farklıysa migration durur.
  - Sonunda yalnızca okuma yapan kontrol sorguları yer alır.
- **07 Üyelere açma** (lisans netleşince):
  - Okuma tüm `authenticated` kullanıcılara açılır.
  - Anonim girişler hariç tutulur: `coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false`.

## 4. Gece işi

- Tetikleyiciler:
  - `schedule: 02:00 UTC`
  - `workflow_dispatch` (backfill için daha uzun süre)
- İş ayarları:
  - `concurrency` grubu
  - `timeout 30 dk`
  - `permissions: contents: read`
  - Action'lar SHA ile sabitlenir.
  - `pull_request` tetikleyicisi yoktur.
- Node 22 kullanılır, `npm install` yapılmaz.
- Gizli değerler:
  - İçe aktarıcıya özel yeni tip Supabase secret key (`SUPABASE_SECRET_KEY`) GitHub Secrets'ta durur.
  - `SUPABASE_URL` bir repo değişkeni olarak tanımlanır.
- Kalite raporu 14 gün saklanan bir artifact olarak yüklenir. Hata olursa iş sıfır olmayan bir kodla ve açık bir mesajla durur.
- Binance'ın en yeni günü henüz yayımlanmamışsa bu 2 güne kadar uyarı, sonrasında hata sayılır (sahip kararı).
- Repo özel (private) olduğu için Actions dakika kotası hesaba katılır.

## 5. Tarayıcı tarafı (ArchiveSource)

- İndirme: `sb.storage.from('candles').download(path)`, ardından `DecompressionStream('gzip')`.
- Önbellek:
  - Bellekte birkaç aylık LRU tutulur.
  - Geçmiş aylar için kalıcı önbellek yalnızca **IndexedDB** (`ww-candles`) olur, çünkü `sw.js` diğer Cache Storage önbelleklerini siler.
  - Her çıkışta önbellek silinir: `config.js` içinde `onAuthStateChange(SIGNED_OUT)` yakalanır. Ayrıca saklanan sahip kimliği uyuşmazsa önbellek temizlenir.
- 404 / NoSuchKey hatası aslında bir oturum sorunu olabilir. Bu yüzden önce oturum kontrol edilir, bir kez yenilenip yeniden denenir.
- Isınma geçmişi: `historyMonths(tf, symbol)` fonksiyonu yaklaşık 200 bar hedefler, en fazla 6 ay geriye gider.
- Yükleyici, `digits` değeri yapılandırmayla uyuşmayan dosyayı reddeder.
- Kaynak etiketi: "Arşiv · <sağlayıcı>". Sentetik veride "Sentetik veri · test".

## 6. Sıra (Faz E)

1. Prototipi D13'e uyarla:
   - sembol başına index ve gün defteri,
   - sembol başına kilit,
   - testler.
   Ardından `scripts/candles/` altına taşı.
2. Migration 03'ü ve rollback dosyasını yaz, PGlite harness'e ekle.
3. Workflow'u yaz. Secret ve değişkeni sahip ekler.
4. **Canlı yazmalar (her biri ayrı onayla)**:
   - Migration 03'ü çalıştır.
   - `synthetic/` önekine sentetik veriyle ilk doldurmayı yap.
   - Lisanslı kaynak gelince gerçek arşivi doldur.
5. ArchiveSource'u bağla. SyntheticSource geliştirme kaynağı olarak kalır.
6. Lisans kararından sonra Migration 07'yi çalıştır, `/backtest` sayfasını herkese aç.
