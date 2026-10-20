# Backtest v2: kalıcı kurallar

Her yeni oturum işe başlamadan önce bu dosyayı okur. Kurallar sahibin talimatıdır ve her işte geçerlidir.

## 1. Canlı sistemlere onaysız yazma yok

- Canlı Supabase veritabanına (proje `odasapyhtdopbnlfhwde`) sahibin **açık onayı olmadan hiçbir yazma yapılmaz**. Salt okunur SELECT ve katalog sorguları serbesttir.
- Aynı kural şu üretim değişiklikleri için de geçerlidir:
  - Edge Function deploy veya silme,
  - Storage bucket oluşturma veya dosya yükleme,
  - secret değiştirme.
- Bir adım için alınan onay yalnızca o adımı kapsar. Sonraki adım için yeniden sorulur.
- `supabase db query --linked` bağlanmak için Management API üzerinden geçici bir CLI giriş rolü oluşturur. Bu komut kullanılacaksa sahibe önceden söylenir.

## 2. Migration kuralları

- Her migration **ayrı bir dosyadır**, çalıştırma sırasına göre numaralanır (`supabase/migrations/2026101800NN_<ad>.sql`).
- Her migration'ın aynı adla bir **rollback dosyası** vardır: `supabase/rollbacks/<aynı sürüm>_<ad>.down.sql`. Bu dosyalar `migrations/` dışında tutulur, böylece CLI onları ileri migration sanmaz.
- Migration'ları sahip **Supabase SQL Editor'da elle**, dosyanın tamamını tek seferde çalıştırır. Sahip açıkça onay verirse asistan da çalıştırabilir.
- `supabase db push` **kullanılmaz**. Canlıda `schema_migrations` tablosu boş olduğu için CLI her dosyayı bekleyen migration sayar.
- Dosya yapısı:
  - Her dosya tek bir transaction'dır (`BEGIN … COMMIT`).
  - Mümkün olduğunca idempotenttir.
  - Korumaları vardır: ORDER, DRIFT, PRECONDITION, DATA LOSS.
  - Sonunda yalnızca okuma yapan kontrol sorguları bulunur.
- Fonksiyon gövdeleri **canlı tanımdan** kurulur (`docs/backtest-v2/sql/db-snapshot/fn_*.sql`), eski repo dosyalarından alınmaz.
- Rollback'ler yalnızca ters sırada çalışır.
- Değişiklik akışı:
  1. Şablon düzenlenir: `sql/verify/src/`.
  2. `build.mjs` çalıştırılır.
  3. `harness.mjs` çalıştırılır, tüm testler geçmelidir.
  4. Komutlar `DEVAM.md`'dedir.

## 3. Yedek kuralı

- Canlı veritabanına yapılacak **ilk yazmadan hemen önce** (migration'lar dahil) şema, veri ve roller dahil **tam yedek** alınır. Sahibe yedeğin **tam olarak nerede durduğu** söylenir.
- Önerilen uygulama: her fazın ilk canlı yazmasından önce ve her `02.down` öncesinde yeni bir yedek alınır.
- Yedekler **repo ve OneDrive dışında** tutulur, çünkü kullanıcı verisi içerirler. Önerilen yer: `C:\Users\<kullanıcı>\WaweJournal-Backups\<UTC zaman damgası>\`.
- Veritabanı parolası yalnızca o terminal oturumunda ortam değişkeni olarak verilir. Hiçbir dosyaya yazılmaz.

## 4. Repo ve git

- Tüm iş `backtest-v2` branch'indedir. Sahip istemeden main/master'a merge ya da push yapılmaz.
- `.env*`, yedekler, büyük ikili dosyalar ve indirilen paketler (örneğin PGlite) commit'e girmez.
- Repo `SloweNGG/Wawe-Journal-Main` özeldir. `docs/backtest-v2/` içinde henüz kapatılmamış bir güvenlik açığının (Migration 06) tarifi bulunur. Repo herkese açılacaksa önce bu not kaldırılır ya da açık kapatılır.
- Git geçmişi taraması istenmiyor.

## 5. Çalışma biçimi

- Yeni workflow veya çok ajanlı orkestrasyon başlatılmaz. İş doğrudan yapılır, token kullanımı düşük tutulur.
- Hiçbir şey silinmeden ya da uygulanmadan önce plan sunulur ve onay beklenir (R7).
- Sonuçlar dürüst raporlanır: yarıda kalan, atlanan ya da test edilmeyen her şey açıkça söylenir.
- Sahibin tasarım tercihleri:
  - Karanlık modda yüzeyler saf siyah (#000) olur, mor veya gri ton kullanılmaz.
  - Sayılar DM Sans, tabular-nums ile yazılır.
  - Grafik büyütme, ortalanmış bir modal olarak açılır, tam ekran değil.
  - PRO kısıtlamalarında kilit ikonu kullanılmaz.
  - Ayrı sayfaları tek sayfada birleştirme önerilmez.
