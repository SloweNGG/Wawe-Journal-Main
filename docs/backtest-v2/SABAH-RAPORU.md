# Sabah raporu (2026-10-19 gece oturumu)

## Kısa özet

**Bitti (hepsi `backtest-v2` branch'inde, push edildi; master'a dokunulmadı, canlıya hiçbir şey yazılmadı):**
1. **Güvenlik migration'ı 00** + rollback: `evaluate_prop_firm_rules` anon erişimi kalkar, sahiplik kontrolü eklenir. Migration 06'nın kontrolü ve geri alması buna uyumlu hale getirildi.
2. **Faz A (arayüz)**, A.11'e kadar: eski sayfa kaldırıldı; hesap listesi, oluştur/düzenle/sil/sıfırla, replay, işlem motoru (AL/SAT, SL/TP, düzenle, kapat), grafik, istatistikler, yalnızca admin kapısı, navbar linki (yalnızca admin), tr/en/de. 240 test geçti (84 yeni), build geçti, headless Chrome duman testi geçti.
3. **0.9 inceleme**: ciddi SQL hatası yok (`sql/INCELEME.md`), bir doküman düzeltmesi.
4. **Migration 03 ve 07** + rollback'ler (07'de lisans onay satırı kapalı).
5. **Yerel PostgreSQL 17.11** kuruldu; tüm migration ve rollback'ler gerçek sunucuda baştan sona çalıştı, 261 test orada da geçti.
6. **Faz C (senkron) ve Faz D (istatistik) kodu**: `bt-sync.js`, SupabaseStore, `mapTrade` açılış seviyeleri, tüm `trades` okuyucularında canlı süzgeç, işlemler sayfasında Tümü / Canlı / Backtest seçici. Tüm okuyucular denetlendi ve testlendi. **Canlıya yayın için Migration 04 ve 05 ile Faz B migration'ları gerekiyor; merge kapısı ADIMLAR'da.**
7. **Sayfa karşılaştırması (pagecheck)**: 6 gerçek sayfa, eski ve yeni build, backtest satırı olsun olmasın **sayılar birebir aynı** (6/6 PASS). Araç repoda. Ayrıntı aşağıda.

**Takılan / yapılmayan:**
- Hiçbir adımda takılma olmadı (şifre vb. istenmedi).
- Canlıya salt okunur bile bağlanmadım (kural: önceden haber). Bu yüzden "canlı şema kopyası" 18 Ekim anlık görüntüsünden kuruldu ve gerçek `pg_dump` karşılaştırması yapılmadı.
- Gerçek giriş, SPA geçişi, açık tema, telefon genişliği, Safari/Firefox elle denenmedi (aşağıda ayrıntı).
- `PROJECT_OVERVIEW.md` güncellenmedi. Canlıdaki `get-candles` Edge Function silinmedi (yalnızca repodan kalktı).

**Sizden beklenenler (sabah):**
1. **Faz A'yı deneyin** (A.12): admin hesabıyla `/backtest`; hesap aç, oynat, işlem aç, SL/TP, sıfırla, tarihe git. Onay verirseniz Faz B'ye geçilir. Admin hesabınız free plandaysa 1 hesap sınırı var.
2. **Güvenlik açığını canlıda kapatma** (birlikte): tam yedek (`~/WaweJournal-Backups/`), ardından Migration 00 (`202610180000_...sql`) SQL Editor'da. Sonra Migration 06 (6 kullanılmayan fonksiyonu silme) için kararınız.
3. İsteğe bağlı: canlıya **salt okunur** bağlanıp P1–P6 sorgularını çalıştırmak ve gerçek şemayı yerel kopyayla karşılaştırmak (ADIMLAR L.4).
4. Canlıdaki eski `get-candles` Edge Function'ını silmek (🔐) ve Faz B için onay.
5. Hafızadaki "bekleyen backend deploy" işi (ctrader-sync, create-payment, verify-auth, webhook) bu gece **hiç ele alınmadı**.

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

## Adım 3: migration incelemesi (0.9)

Sonuç `sql/INCELEME.md`'de. Özet: ciddi bir SQL hatası bulunmadı; bir doküman hatası düzeltildi (01'in ön koşulu `settings.js`'in güncellendiğini söylüyordu, oysa o Faz B'de; eski yedek yolu zararsız). **Canlıya yeniden bağlanmadım**: `supabase db query --linked` geçici giriş rolü oluşturuyor ve kurallar bunun önceden haber verilmesini istiyor. Karşılaştırma 18 Ekim anlık görüntüsüyle yapıldı; asıl koruma her migration'daki DRIFT (md5) bloğu.

## Adım 4: Migration 03 ve 07

- **03** `candles` bucket'ı (özel, 25 MiB, gzip/json) + yalnızca admin okuma politikası. Var olan bucket public ya da farklı limitliyse, ya da `storage.objects` üzerinde bucket'a bağlı olmayan bir SELECT politikası varsa **durur**.
- **Karar:** mevcut bucket tam olarak bizim ayarımızdaysa yeniden çalıştırma serbest (nesneler olsa bile), çünkü içe aktarıcı yükledikten sonra dosyayı tekrar çalıştırmak gerekebilir. Planın "nesne varsa dur" cümlesini, "ayar farklıysa dur" olarak yorumladım.
- **07** üyelere açma (anonim girişler hariç). **Lisans onay satırı yorumda**: açılmadan çalışmaz. Böylece yanlışlıkla çalıştırılamaz.
- Rollback'ler: 07.down admin politikasını geri getirir; 03.down bucket nesne içeriyorsa durur (onay satırıyla geçilir), politikayı ve bucket'ı siler.
- Testler: PGlite harness'e sahte `storage` şeması eklendi, 261 geçti / 0 kaldı. **Gerçek Storage'ın `protect_delete` tetikleyicisi PGlite'ta yok**: 03.down `storage.allow_delete_query` ayarını kendi işleminde açıyor ama bu gerçek Supabase'te denenmedi.

## Adım 5: yerel PostgreSQL 17

- Kuruldu: `~/WaweJournal-pg17/` (Maven'daki zonky arm64 Postgres 17.11 ikilileri; Homebrew yok, `sudo` gerekmedi, şifre istenmedi). Ayrıntı ve komutlar: `sql/verify/LOCAL-PG17.md`. Sunucu şu an **kapalı** (`~/WaweJournal-pg17/start.sh` ile açılır). Pakette `psql` yok; SQL dosyalarını Node `pg` istemcisiyle çalıştırdım (`pg` repo dışında, scratchpad'de).
- 261 testlik harness gerçek PG 17'de de **261 geçti / 0 kaldı** (PGlite'a özgü bir fark çıkmadı).
- `local-run.mjs`: gerçek dosyalar sırayla 00, 01, 02, 03, 04, 05, 06, ardından `verify.sql` (19 PASS, 0 FAIL, SKIP yok), ardından 06→00 geri alma (katalog başlangıçla aynı; `delete_journal`/`list_journals` ACL sıkılaştırması rollback'lerde bilerek korunuyor), ardından tekrar ileri. Hepsi tamam. `wawe_local` veritabanı migrate edilmiş halde duruyor.
- **"Canlı şemanın kopyası"**: canlıya bağlanmadığım için 18 Ekim salt okunur anlık görüntülerinden kuruldu (9 public tablo, 16 fonksiyon). Gerçek `pg_dump` karşılaştırması sizin onayınızla sabaha kaldı (ADIMLAR L.4).
- Dikkat: 03.down'un `storage.allow_delete_query` ayarı ve 07'nin `auth.jwt()->>'is_anonymous'` koşulu gerçek Supabase Storage'da denenmedi (yerel kopyada Storage şeması sahte).

## Adım 6: Faz C ve D (kod tarafı)

- `fef5100`: yalnızca canlı veriyi okuyan istatistik okuyucuları, `trades` kapsam süzgeci, `bt-sync` kütüphanesi.
- `f44ad8d`: Faz C günlük senkronu sayfaya bağlandı (kapanışta senkron, bağla/taşı/kaldır, hesap silme, sıfırlama, onarım), SupabaseStore, `mapTrade` günlüğe açılıştaki SL/TP seviyelerini gönderiyor (D13).
- `174773a`: her `trades` okuyucusunun denetimi ve "backtest satırı olmadan canlı kapsamın eşitliği" testleri.
- **Hâlâ canlıda çalışmadı / sizde:** Migration 04 (C.2), 05 (D.1), Faz B migration'ları (01, 02). Faz C+D kodu bunlar çalışmadan master'a **merge edilmemeli** (ADIMLAR "MERGE KAPISI").

## Adım 7: sayfa karşılaştırması (internet kesintisinden sonra yeniden)

Gece 02:12'de internet koptuğu için koşu yarım kalmıştı. Sabah (19 Ekim) önce yarım kalanlar tamamlandı:
- `174773a` zaten `origin/backtest-v2`'de değildi; commit edilmemiş pagecheck araçlarıyla birlikte `c8f36ac` olarak commit edilip **push edildi**. Araçta sonradan yapılan iyileştirmeler (aşağıda) sonraki bir commit'te.
- Pagecheck baştan sona yeniden çalıştırıldı: **6/6 PASS** (dashboard, premium-dashboard, trades, calendar, strategies, journals). İşlemler sayfası kapsam sayıları: Canlı 107, Tümü 137, Backtest 30. Tablo ve sınırlar: ADIMLAR.md "Sayfa karşılaştırması (pagecheck) sonucu".
- Premium dashboard'da koşu sırasında **Chrome oturumu üç kez düştü** ("Session with given id not found"; dil denemeleri sırasında, aynı sayfada tekrarlandı); sayfa sayfa ve dil denetimi sıkılaştırılmış hâliyle tek süreçte tamamlandı. Düşmenin kesin nedeni araştırılmadı.
- Geçici worktree (`scratchpad/old`) `git worktree remove --force` ile kaldırıldı (içinde yalnızca üretilmiş `node_modules` ve `dist` vardı, izlenen değişiklik yoktu). 8765 portundaki `http.server` kapatıldı.
- Eski build'in kopyası artık yok; aracı yeniden koşturmak için `50f92a8`'in worktree'si ve derlemesi gerekir.

## Ayrı not: Premium dashboard dil karışıklığı (ön-var olan hata)

**Belirti:** `/premium-dashboard`, dil `en` seçiliyken bile çoğu zaman **Türkçe** (ya da aynı cümlede iki dil karışık: "Thursday günleri zarar ediyorsun", "İşlem başı +$36,07") çiziliyor. Karşılaştırma aracının son tam koşusunda 35 denemenin 34'ünde Türkçe geldi; dil `en` kilitliyken bile.

**Bu değişikliğin sebep olduğu bir şey değil:** eski build'de (`50f92a8`, Faz C/D öncesi) ve yeni build'de aynı. Eski build'in kendi taban çizgisi bile iki koşu arasında dil değiştirdi. Sayılar her iki dilde aynı; yalnızca metin değişiyor.

**Olası neden (kodu okuyarak, tarayıcıda kanıtlanmadı):** `public/interface/premium-dashboard/js/*.js` içindeki her `_t(key, fallback)`, çeviri henüz yüklenmemişse (`window.i18n.t` anahtarı döndürürse) **Türkçe yazılmış varsayılan metne** düşüyor (ör. `chart-renderers.js:1442`: `'{day} günleri zarar ediyorsun'`). Kartlar çeviri dosyası gelmeden çizilirse Türkçe kalıyor, sonradan yeniden çizilmiyor gibi görünüyor. Gün adı ise `toLocaleDateString(localeOf())` ile doğru dilde geliyor, o yüzden karışık cümle oluşuyor. Aynı harness'te `dashboard`, `trades`, `calendar` ve `journals` sayfaları hep İngilizce geldi.

**Neden önemli olabilir:** dili İngilizce veya Almanca olan bir kullanıcı premium panelde Türkçe metin görebilir. Gerçek tarayıcıda (önbellek sıcak, gerçek ağ) ne sıklıkta olduğu bilinmiyor; harness'te yerel ve çok hızlı yükleme var.

**Önerilen (yapılmadı, sizin onayınızla):** (1) önce gerçek tarayıcıda `ww_language=en` ile birkaç kez açıp sıklığı doğrulamak, (2) çizimi çeviri yüklendikten sonra yapmak ya da dil yüklenince yeniden çizmek, (3) `_t` yedek metinlerini İngilizceye çevirmek. Bu iş Faz C/D kapsamı dışında, ayrı bir adım.

## Güncel özet (sabah)

Push edildi: `backtest-v2` HEAD'e kadar. Canlıya yazılan bir şey yok. Sırada: **güvenlik açığı / Migration 00'ı canlıda çalıştırmak**; bu adımda önce tam yedek ve sizin onayınız gerekiyor, onay gelmeden başlanmayacak.
