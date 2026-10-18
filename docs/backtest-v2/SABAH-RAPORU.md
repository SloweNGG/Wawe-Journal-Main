# Sabah raporu (2026-10-19 gece oturumu)

Bu dosya gece boyunca güncellenir. En altta kısa özet var.

## Kararlar ve gerekçeleri

- **Güvenlik migration'ı numarası `202610180000`.** 01'den önce çalışacağı için 00 verdim. 03 ve 07 Faz E'ye ayrılı kalıyor.
- **Migration 06'nın kontrolü artık hem canlı gövdeyi hem 00'ın gövdesini kabul ediyor.** Aksi halde 00'dan sonra 06 "DRIFT" hatası verirdi.
- **06.down, `evaluate_prop_firm_rules` fonksiyonunu güvenli gövdeyle geri getiriyor** (anon yok). Yanlışlıkla 06'yı geri alınca açık yeniden açılmasın diye. Açığı yeniden açan tek dosya `00.down`.
- **Sahiplik kontrolü:** kullanıcı kimliği (`auth.uid()`) olan çağıran, günlüğün sahibi olmalı, değilse `42501`. Kimliği olmayan çağıran yalnızca JWT rolü `anon`/`authenticated` değilse geçer (service_role, SQL Editor). Var olmayan günlük ve başkasının günlüğü aynı hatayı verir (varlık sızdırmaz).
- `sync_journal_trades` zaten sahiplik kontrolü yapıyor, onu değiştirmedim.

## Durum


- Adım 1, güvenlik migration'ı: **bitti.** `202610180000_secure_evaluate_prop_firm_rules.sql` + `.down.sql`, PGlite harness 233 geçti / 0 kaldı.

## Faz A (arayüz): yapılan ve karar verilen

Ekranı açmak için: admin hesabıyla `/backtest` (navbar'da yalnızca adminde "Backtest" linki var). Yeni hesap, sembol ve tarih seç, oynat veya mum mum ilerle, AL/SAT ile işlem aç.

**Kararlar ve gerekçeleri**
- **Kota plan kuralına göre:** free 1, premium 10 hesap (veritabanıyla aynı kural, onayladığınız karar). Admin hesabınız free plandaysa yalnızca 1 hesap açabilirsiniz; ikinci için eskisini silin ya da planı değiştirin.
- **Sentetik veri bugünün tarihine bağlı:** 2024-01'den dünün sonuna kadar. Aynı gün içinde aynı mumlar çıkar (seed 1).
- **LocalStore yazmaları anlık:** yeniden deneme kuyruğu yok, çünkü localStorage yazması ağ hatası vermez. Başarısız yazma uyarı gösterir. Faz B'de SupabaseStore gelince kuyruk gerekirse eklenir.
- **"Eksik ay" durumu yok:** sentetik veride ay boşluğu yok, yalnızca "veri sonu" ve "yükleme hatası" durumları var.
- **Defter seçimi formda gizli**, senkron Faz C'de.
- **Hesabı sıfırla** hesap ayarları penceresinde (işlem varsa görünür). Geri gitme engeli mesajı oraya yönlendirir.
- **Navbar linkini `Navbar.astro` ve `navbar.js` içine ekledim** (iki yerde de menü üretiliyor). Başlangıçta gizli, admin kullanıcıda gösteriliyor.
- **`get-candles` yalnızca repodan silindi.** Canlıdaki Edge Function hâlâ duruyor; silmek 🔐 ve sabaha kaldı.
- **Dokunmadıklarım:** `settings.js`, Migration 01 (Faz B), `PROJECT_OVERVIEW.md` (route satırı ve eski sayfa notları hâlâ eski).
- Önbellek: `sw.js` `wawe-v12`, locale ve navbar `?v` değerleri artırıldı.

**Testlerin yakaladığı iki gerçek hata (düzeltildi):** `roundDiv` bazı durumlarda `-0` döndürüyordu; `indexAtOrBefore` kayan noktada bir geri kayıyordu (imleç bir mum eksik gösterirdi).

**Doğrulama**
- `node --test tests/*.test.js`: 240 geçti, 0 kaldı (önceki 156 + 84 yeni).
- `astro build` geçti.
- Headless Chrome duman testi (gerçek kütüphaneler ve sayfa kodu, yalnızca giriş/plan/toast stub'lı): hesap oluşturma, replay, adım, +1m, emir doğrulamaları, AL, SL/TP ile otomatik kapanış, manuel kapanış, pozisyon düzenleme, zaman dilimi değişimi, "açık pozisyonla tarihe git" engeli, işlem varken geri gitme engeli, sıfırlama sonrası geri gitme, silme, kota etiketi, admin olmayan kullanıcıda "yakında" ekranı ve hiçbir şeyin üretilmemesi: hepsi geçti. Script: `asama-arayuz/smoke/`.

**Test EDİLMEDİ (sizden bekleniyor)**
- Gerçek giriş ve gerçek admin hesabıyla akış, SPA geçişleri (navbar'dan girip çıkma), Safari/Firefox.
- Açık tema görünümü ve telefon genişliği (yalnızca karanlık tema, masaüstü genişliğinde ekran görüntüsüne baktım).
- Lucide ikonları (duman testinde yüklü değildi).
- Gece boyu uzun oynatma (bellek, çok aylık geçiş) elle denenmedi; yalnızca bir ay içi ve D1 geçmiş yüklemesi denendi.
