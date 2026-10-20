# Backtest v2: son rapor (2026-10-19, kesintisiz bitirme turu)

Branch `backtest-v2`, commitler `5e8a53a` (kod) ve `9c8cf7d` (rapor), ikisi de push edildi. master'a dokunulmadı. **Canlıya hiçbir şey yazılmadı, canlı veritabanına bağlanılmadı.**

## 1. Kısa özet

1. **Arayüz düzeltmelerinin hepsi bitti (madde 1-6)**: tam ekran replay düzeni, hesap ayarları penceresi, spread pip karşılığı, zaman ekseni etiketi, Astro araç çubuğu. Koyu ve açık tema, tr/en/de, 1440, 1920, 768 ve 390 genişlikte 24 kombinasyon headless Chrome'da denendi, yatay taşma yok.
2. **Migration 00'a `is_admin()` istisnası eklendi** (madde 8). SQL testleri PGlite'ta ve gerçek PostgreSQL 17'de **266 geçti / 0 kaldı**; 00-06 baştan sona, geri alma ve yeniden ileri çalıştırma da gerçek PG 17'de tamam.
3. **`PROJECT_OVERVIEW.md` yeni backtest sistemiyle güncellendi** (madde 17).
4. **Birim testler 306 geçti / 0 kaldı**, `npm run build` geçti, tarayıcı duman testi: admin 48 PASS / 0 FAIL, admin olmayan 4 PASS.
5. **Canlı adımlar yapılmadı (madde 7, 10-16): makinede veritabanı parolası, Supabase erişim token'ı ve `gh` yok.** Talimatınız gereği canlı veritabanı ve yayın adımları atlandı, kod işleri bitirildi. Yedek alınmadı, hiçbir migration canlıda çalıştırılmadı, `BACKEND` hâlâ `'local'`, master'a merge ve canlı site kontrolü yapılmadı. Revert gerekmedi.
6. **Pagecheck bu turda yeniden çalıştırılmadı** (son sonuç: 19 Ekim sabahı 6/6 PASS, `94bd087`). Merge zaten yapılmadığı için koşul kontrolü gerekmedi.
7. Kaldığınız yerden devam için adım adım liste `DEVAM.md`'de.

## 2. Madde madde

### Bölüm 1: arayüz

**1. Tam ekran düzen: ✅**
- Dosyalar: [backtest.css](../../public/interface/backtest/css/backtest.css), [backtest.astro](../../src/pages/backtest.astro).
- Dar kutunun nedeni: `.bt-main { margin: 0 auto }`, sütun yönlü flex kapta genişliği içeriğe daraltıyordu. `width: 100%` ve `max-width: 1920px` ile çözüldü; hesap listesi de bu genişliği kullanıyor, kartlar en az 300px.
- 1025px ve üstünde replay ekranı `calc(100dvh - 64px)` yüksekliğinde bir grid:
  - Grafik kalan alanın tamamını kaplıyor (`autoSize` + kapsayıcı `position: absolute`), pencere boyutu değişince yeniden boyutlanıyor.
  - Sağda `clamp(320px, 24vw, 360px)` genişliğinde sabit yan panel (bakiye kartı, SAT/AL, lot, SL/TP, kısayol notu). Panel taşarsa kendi içinde kayıyor.
  - Altta Açık pozisyonlar / İşlem geçmişi / İstatistikler: yükseklik `clamp(170px, 28vh, 300px)`, içerik uzarsa kendi içinde kayıyor, tablo başlığı yapışkan.
  - Ölçüm: 1440x900'de sayfa kaymıyor (belge yüksekliği 900 = pencere), grafik 1012x372; 1920x1080'de grafik 1478x503, tablolar 290px.
- 1024px ve altında düzen alt alta (grafik, yan panel, tablolar), grafik 300-560px yüksekliğinde. 768 ve 390'da yatay taşma yok.
- Kısayol notu yan panelin altına taşındı (sayfa kaydırmasın diye).
- Çok kısa pencerelerde (620px altı) tüm sayfa kayar; sert kırpma yok.

**2. Zaman ekseni ilk etiketi: ✅**
- Dosya: [backtest.js](../../public/interface/backtest/js/backtest.js) (`tickLabel`, `refreshClippedTicks`).
- Neden: Lightweight Charts, merkezi sol kenara yarım etiket genişliğinden yakın olan etiketi kırpar (`fixLeftEdge` kapalıyken hizalama yok). Biçimlendirici yalnızca zaman başına bir kez çağrılıp önbelleğe alındığı için konuma göre karar vermek mümkün değil.
- Çözüm: kenara fazla yakın tik boş etiket olur; görünür aralık değişince bu küme yeniden hesaplanır, değişirse etiketler yeniden biçimlendirilir.
- Doğrulama (piksel taraması): düzeltme kapalıyken 768x1024 açık Almanca'da 12/12 karede kenarda kesik etiket, düzeltmeyle 0/12. 1440x900'de 40 karelik kaydırmada 0.

**3. Hesap ayarları penceresi: ✅**
- Kök neden: `.modal-header`, `.modal-close`, `.modal-footer`, `.btn-modal-*` sınıfları diğer sayfalarda **sayfa CSS'inde** (strategies.css vb.) tanımlı, backtest sayfasına yüklenmiyordu. Stiller `backtest.css` içine `.bt-modal` kapsamıyla alındı.
- ✕ başlıkla aynı satırda sağ üstte. Başlık ve gövde aynı iç boşluğu (1.35rem) kullanıyor.
- Kaydet birincil (siyah zemin, mor çerçeve, `buttons.css` ortak stili), İptal ikincil (nötr çerçeve, soluk metin). Diğer sayfalardaki modal butonlarıyla aynı aile.
- **Başlangıç tarihi:** düzenleme modunda **gizli**, altında not var: "Başlangıç tarihi hesap oluşturulurken seçilir. Replay zamanını değiştirmek için araç çubuğundaki «Tarihe git» alanını kullan." Gerekçe: işlemi olan hesapta geri gitmek yasak, ileri gitmenin tek yolu zaten tarihe git (D13 kuralı); formda ikinci bir yol açmak çelişkiyi büyütürdü.
- **Zaman dilimi açıklaması:** "Sembol oluşturulduktan sonra değiştirilemez. Zaman dilimini grafiğin üstündeki araç çubuğundan değiştirebilirsin." Zaman dilimi araç çubuğundan değişiyor (kod bunu zaten kaydediyor), formdaki alan yalnızca gösterge.
- **`[hidden]` hatası bulundu ve düzeltildi:** `.bt-main [hidden] { display: none }` kuralı yalnızca `.bt-main` içini kapsıyordu, modaller dışarıda olduğu için `.bt-field { display: flex }` `hidden` özniteliğini eziyordu. Bu hem boş "Başlangıç tarihi" hem de yerel modda görünen "Bağlı hesap" alanının nedeniydi. Kural `.bt-modal [hidden]` için de eklendi.
- Pencere gövdesi `.modal-overlay` / `.modal-box` global sınıflarını kullanıyor (saf siyah koyu zemin, giriş animasyonu, açık temada beyaz).
- Telefonda sütunlar alt alta, düğmeler sarıyor.

**4. Spread pip karşılığı: ✅** Emir panelinde `0.00002 (0.2 pip)`. Pip değeri hesabın `spreadH` alanından (yüzde birlik) hesaplanıyor, sondaki sıfırlar atılıyor (0.2, 1.5, 0).

**5. Astro araç çubuğu: ✅** [astro.config.mjs](../../astro.config.mjs): `devToolbar: { enabled: false }`.

**6. Test ve ekran görüntüleri: ✅** Bkz. bölüm 4.

### Bölüm 2: canlıya hazırlık

**7. Canlıdan `evaluate_prop_firm_rules` tanımı ve GRANT'ler: ❌ atlandı.** Neden: canlıya salt okunur bağlanmak için veritabanı parolası veya Supabase erişim token'ı gerekiyor; ortamda ikisi de yok (`SUPABASE_*`, `PGPASSWORD`, `DATABASE_URL` tanımsız, `~/.supabase` içinde token yok, `psql`/`pg_dump`/`gh` kurulu değil). Keychain'e de başvurulmadı. Karşılaştırma 18 Ekim anlık görüntüsüne göre kaldı; asıl koruma Migration 00'daki DRIFT (md5) bloğu, canlı gövde farklıysa dosya çalışmadan durur.

**8. Çağıranların listesi ve sahiplik kontrolü: ✅ (repoda), ⚠️ canlıdaki çağıranlar doğrulanamadı**
- İstemci kodu (`public/`, `src/`): **çağıran yok.** Admin paneli de çağırmıyor.
- Edge Function'lar: **çağıran yok** (`create-payment` ve `nowpayment-webhook` yalnızca `dev_test_access_active`, `validate_referral_code`, `process_payment_finished` çağırıyor).
- Trigger'lar ve diğer SQL fonksiyonları: elimizdeki 18 Ekim anlık görüntüsündeki gövdelerde (`sql/db-snapshot/fn_*.sql`, trigger fonksiyonları dahil) **tek çağıran `sync_journal_trades(uuid, jsonb)`** (SECURITY DEFINER, satır 135). **Sınır:** anlık görüntü canlıdaki tüm fonksiyon gövdelerini içermiyor (`all_public_functions.json` yalnızca ad ve argüman listesi); kesin doğrulama için canlıda `RUN_ORDER.md` içindeki **P6** sorgusu çalıştırılmalı. Kendisi `auth.uid()` ile sahipliği denetliyor. İçeriden çağrıda `auth.uid()` JWT'den geldiği için son kullanıcıyı görür: kendi defteri geçer, başkasınınki 42501. Testle doğrulandı (SECURITY DEFINER sarmalayıcı, sahip ve başka kullanıcı).
- `sync_journal_trades` istemci koddan çağrılmıyor; ayrıca ikisi de repodaki migration'larda tanımlı değil, yalnızca canlıda var.
- **Service role / SQL Editor:** `auth.uid()` boşsa ve JWT rolü `anon`/`authenticated` değilse geçiyor (testli).
- **Düzeltme:** Migration 00'da `is_admin()` istisnası yoktu. Eklendi: `public.is_admin()` doğruysa (JWT `app_metadata.role = 'admin'`) başka birinin defteri de değerlendirilebilir. `is_admin` yoksa dosya `PRECONDITION` ile durur. Yeni 5 test: admin geçer, "admin kimliği ama admin iddiası yok" 42501, anon yetki hatası, SECURITY DEFINER sarmalayıcı (sahip geçer, başka kullanıcı 42501). Migration 06'nın DRIFT kontrolü yeni gövdeyi de kabul ediyor (üretilen md5'ler güncellendi).
- Dosyalar: [src/00.sql](sql/verify/src/00.sql), [build.mjs](sql/verify/build.mjs), [harness.mjs](sql/verify/harness.mjs), üretilen [migration 00](sql/supabase/migrations/202610180000_secure_evaluate_prop_firm_rules.sql), 06 ve 06.down (yalnızca md5), `RUN_ORDER.md`.

**9. Faz B, C, D migration sırası: ⚠️ sıra belirlendi, canlı şema karşılaştırması yapılamadı**
- Canlıda sırayla çalıştırılacaklar: **00, 01, 02, 04, 05.** 03 ve 07 Faz E, 06 bu turda yok.
- Her birinin rollback'i ters sırada: 05.down, 04.down, 02.down, 01.down, 00.down (`sql/supabase/rollbacks/`).
- Yerel kopya 18 Ekim anlık görüntüsünden kurulu; canlıyla farkı bilinmiyor. Migration'lar bu yüzden DRIFT korumalı (canlı gövde farklıysa çalışmadan durur).
- 00 değiştiği için yerelde baştan sona yeniden test edildi: PGlite harness 266/0, gerçek PostgreSQL 17 harness 266/0, `local-run.mjs` (00-06, verify.sql 19 PASS, geri alma, tekrar ileri) tamam.

### Bölüm 3: canlı veritabanı

**10. Yedek: ❌ atlandı** (kimlik bilgisi yok). `~/WaweJournal-Backups/` oluşturulmadı.
**11. Migration 00 canlıda: ❌ atlandı.** Açık canlıda hâlâ **açık** (anon `evaluate_prop_firm_rules` çağırabiliyor).
**12. Faz B, C, D migration'ları canlıda: ❌ atlandı.**
**13. `BACKEND = 'supabase'`: ❌ bilerek yapılmadı.** Tablolar canlıda olmadan bayrağı çevirmek, master'a yanlışlıkla merge edilirse sayfayı bozardı. Tek satır (`backtest.js`, `BACKEND` satırı, ~25). Testler yine de çalıştırıldı (306/0).
**14. Canlıyla uçtan uca deneme: ❌ atlandı.** Test hesabı veya kayıt oluşturulmadığı için temizlenecek bir şey yok. Yerelde, sahte veritabanıyla uçtan uca akış önceki turlarda denenmişti (bağla, taşı, kaldır, "Backtest" rozeti, istatistikler sabit); bu turda tekrar edilmedi.

### Bölüm 4: yayın

**15. Merge: ❌ atlandı.** Koşullar: testler (✅ geçiyor), build (✅), pagecheck 6/6 (son sonuç ✅ ama bu turda yenilenmedi), **14. madde uçtan uca (❌ yapılamadı)**. Koşullardan biri sağlanmadığı için PR açılmadı, master'a dokunulmadı.
**16. Canlı site kontrolü: ❌ atlandı** (yayın yok).
**17. `PROJECT_OVERVIEW.md`: ✅** Yeni bölüm 5.7 (sayfa ve kütüphane tablosu, admin kapısı, migration tablosu, istatistik yalıtımı, test araçları); route tablosu, klasör yapısı, tablo ve Edge Function notları, `backtest_trades` ve `get-candles` durumu güncellendi. Belge, sistemin **henüz üretimde olmadığını** açıkça söylüyor.

## 3. Canlı veritabanı

- Yedek: **alınmadı.** Yer ve boyut yok.
- Çalıştırılan migration: **yok.**
- Geri alınan: **yok.**
- Canlıda hâlâ açık olan güvenlik açığı: `evaluate_prop_firm_rules(uuid)` (anon çalıştırabiliyor, sahiplik kontrolü yok). Düzeltme (Migration 00, artık admin istisnasıyla) hazır ve yerelde test edildi; çalıştırılması canlı yazma gerektiriyor.

## 4. Testler ve ekran görüntüleri

| Kontrol | Sonuç |
|---|---|
| Birim testler (`node --test tests/*.test.js`) | **306 geçti / 0 kaldı** |
| `npm run build` | ✅ geçti (25 sayfa) |
| SQL harness, PGlite | **266 geçti / 0 kaldı** (`sql/verify/out/harness-output.txt`) |
| SQL harness, gerçek PostgreSQL 17.11 | **266 geçti / 0 kaldı** (`out/harness-output-pg17.txt`) |
| 00-06 + verify.sql + geri alma + yeniden ileri, PG 17 | tamam, verify.sql 19 PASS / 0 FAIL (`out/local-run-pg17.txt`) |
| Tarayıcı duman testi, admin | 48 PASS / 0 FAIL |
| Tarayıcı duman testi, admin olmayan ("Backtest yakında") | 4 PASS / 0 FAIL |
| Pagecheck 6/6 | bu turda **çalıştırılmadı**; son sonuç 6/6 PASS (`94bd087`) |
| Canlı uçtan uca | **yapılmadı** |
| Eksen etiketi taraması | düzeltmesiz 12/12 kesik kare, düzeltmeli 0/12 |

**Yeni duman testi doğrulamaları** ([driver.js](asama-arayuz/smoke/driver.js)): spread `0.xxxxx (0.2 pip)` biçiminde, düzenleme penceresinde başlangıç tarihi gizli ve not görünür, "Bağlı hesap" yerelde gizli.

**Ekran görüntüleri:** `~/WaweJournal-Screenshots/backtest-ui/` (122 dosya, 18 MB, repo dışında).
- Adlandırma: `<tema>-<dil>-<genişlik>x<yükseklik>-<ekran>.png`; ekranlar: `replay`, `replay-history`, `modal-edit`, `modal-new`, `list`.
- Kapsam: koyu ve açık × tr, en, de × 1440x900, 1920x1080, 768x1024, 390x844 (24 kombinasyon, her biri 5 ekran).
- Önceki durum: `BEFORE-dark-tr-1440x900-replay.png` ve `BEFORE-dark-tr-1440x900-modal-edit.png`.
- Düzen ölçümleri (hepsinde yatay taşma yok): 1440x900 grafik 1012x372, yan panel 345px; 1920x1080 grafik 1478x503, yan panel 360px; 768 ve 390'da alt alta.
- Sınır: ekran görüntüleri duman testi düzeneğiyle alındı (kimlik, plan ve toast taklit, Lucide ikonları yüklü değil: oynat/ileri düğmeleri boş kutu görünür, gerçek sayfada ikon var). Telefon görüntüleri yalnızca ilk ekran yüksekliği (tam sayfa değil).

## 5. Yayın

Merge yapılmadı, commitler `5e8a53a` ve `9c8cf7d` yalnızca `backtest-v2`'de. Canlı site kontrolü yok, revert gerekmedi. Cloudflare Pages dağıtımı yapılmadı.

## 6. Karşılaşılan sorunlar ve çözümleri

1. **Canlı kimlik bilgisi yok.** Çözüm: talimat gereği canlı adımlar atlandı, kod ve yerel doğrulama bitirildi, devam listesi `DEVAM.md`'ye yazıldı.
2. **Modal stilsizdi.** Sınıflar sayfa CSS'lerinde tanımlıydı. Çözüm: `.bt-modal` kapsamlı kopya. (Daha kalıcı çözüm, ortak modal stillerini `styles.css`'e taşımak, diğer sayfalara dokunmamak için yapılmadı.)
3. **`[hidden]` ezilmesi.** Modaller `.bt-main` dışında olduğu için kural uygulanmıyordu. Çözüm: kural genişletildi.
4. **Dar kutu.** Flex kapta `margin: auto` genişliği daraltıyordu. Çözüm: `width: 100%`.
5. **Eksen etiketi.** Konuma göre biçimlendirme denemesi işe yaramadı, çünkü grafik biçimlendiriciyi zaman başına bir kez çağırıp önbelleğe alıyor. Çözüm: kümeyi görünür aralık değişince yeniden hesaplayıp biçimlendirmeyi tetiklemek.
6. **Ekran görüntüsü düzeneği:** ilk 24'lük koşuda 11. kombinasyondan sonra grafik hiç açılmadı. Neden: tarayıcı oturumu paylaşıldığı için her koşu bir hesap ekliyordu ve admin (premium) kotası 10. Çözüm: her kombinasyon için ayrı tarayıcı bağlamı; eksik 14 kombinasyon yeniden alındı.
7. **PostgreSQL 17 harness'i** `wawe_local` veritabanı duruyorsa `role "anon" cannot be dropped` hatası veriyor. Çözüm: önce veritabanını silmek (`DEVAM.md`'ye yazıldı).
8. **Ortama göre notlar:** Chrome oturumu bazen uzun koşularda düştü (önceki turdaki gözlemle aynı), yeniden koşuyla geçti.

## 7. Sizin kontrol etmeniz gerekenler

- [ ] Gerçek tarayıcıda admin hesabıyla `/backtest`: tam ekran düzen, pencereyi küçültüp büyütünce grafik, tabloların kendi içinde kayması, Lucide ikonlarının görünmesi.
- [ ] Hesap ayarları penceresi: ✕, Kaydet/İptal görünümü, düzenlemede "Başlangıç tarihi" notu, "Bağlı hesap" alanının yerelde görünmemesi.
- [ ] Kaydırılmış grafikte sol kenarda kesik tarih etiketi kalmadığını gözle bakın (özellikle M5/M15).
- [ ] Safari ve Firefox (yalnızca Chrome ile denendi).
- [ ] Admin olmayan hesapla `/backtest`: "Backtest yakında" ekranı.
- [ ] Canlı adımlar için: veritabanı parolası veya Supabase token'ı (yalnızca o terminalde ortam değişkeni olarak) verin ya da SQL Editor'da `DEVAM.md`'deki sırayla çalıştırın. **Migration dosyaları şu an `docs/backtest-v2/sql/supabase/migrations/` altında; `KURALLAR.md` §2'deki `supabase/migrations/` yoluna taşınmadı** (canlıya çalıştırmadan önce karar verin; `db push` kullanılmaz).
- [ ] Canlı açık (evaluate_prop_firm_rules) hâlâ açık: Migration 00'ı en kısa sürede çalıştırmak istiyorsanız yedek + 00 yeterli, geri kalanından bağımsız.
- [ ] Ekran görüntülerine bakın: `~/WaweJournal-Screenshots/backtest-ui/`.

## 8. Kalan işler

- **Canlı adımlar** (madde 7, 10-16): yedek, migration 00, 01, 02, 04, 05, `BACKEND = 'supabase'`, canlı uçtan uca deneme, PR ve master'a merge, Cloudflare Pages, canlı site kontrolü. Sırayla `DEVAM.md`'de.
- **Faz E:** gerçek veri ve herkese açılış (lisans kararı: Binance CC BY-NC-SA, forex ve altın; Migration 03 ve 07; içe aktarıcı D13'e uyarlama; ArchiveSource; gece GitHub Actions işi).
- **Migration 06 kararı:** 6 kullanılmayan fonksiyonu silmek (açığı 00 zaten kapatıyor, 06 yalnızca temizlik; `sync_journal_trades` bunlardan biri ve `evaluate_prop_firm_rules`'ı çağırıyor, ikisi birlikte gider).
- **Premium dashboard dil hatası:** `en`/`de` seçiliyken Türkçe yedek metinler (`SABAH-RAPORU.md`, ön-var olan hata).
- **`npm audit`:** bu turda çalıştırılmadı.
- **Canlıdaki eski `get-candles` Edge Function'ı:** hâlâ duruyor, silinmesi canlı yazma.
- **Bekleyen backend deploy** (`ctrader-sync`, `create-payment`, `verify-auth`, `nowpayment-webhook`; Migration 0003 ve 0004'ün durumu belirsiz): bu tur dışı.
- **Repo herkese açılacaksa** `docs/backtest-v2/` içindeki Migration 06 açık tarifi kaldırılmalı (`KURALLAR.md` §4).
- **Küçük:** ortak modal stillerini `styles.css`'e taşımak; pagecheck'i yeniden koşturmak (merge öncesi).


---

# Canlı tur (2026-10-19 gece)

**Özet:** Bağlantı kuruldu, yedek alındı ve doğrulandı, **Migration 00 canlıda çalıştı ve doğrulandı (açık kapandı)**. Migration 01, `backtest_trades` içindeki 1 satır nedeniyle koruması tarafından durdu; bağımlı 02, 04, 05, `BACKEND` geçişi, merge ve yayın kuraldaki gibi atlandı. Pagecheck 6/6 PASS, birim testler 306/0. Devam için tek karar: o 1 satırın silinmesi.

| Madde | Sonuç |
|---|---|
| 0 Bağlantı | ✅ PostgreSQL 17.6, rol `postgres`. Değer `~/.wawe-db.env` içinde (chmod 600), repoda hiçbir yerde yok (taranıp doğrulandı). psql/pg_dump 17.11 `~/WaweJournal-pg17/tools/pg` altına kuruldu (micromamba/conda-forge) |
| 1 Taşıma | ✅ 8 migration `supabase/migrations/` altında (git mv), rollback ve test dosyaları docs'ta. Üretici ve test betikleri yeni yolu kullanıyor, harness 266/0. `db push` kullanılmadı |
| 2 Canlı tanım, P1-P6, karşılaştırma | ✅ `evaluate_prop_firm_rules` canlı gövdesi anlık görüntüyle aynı; 10 fonksiyonun hepsi aynı (P3 = true x10). GRANT'ler: anon, authenticated, service_role, postgres (PUBLIC yok). P6: veritabanında başka çağıran yok (0 satır). Karşılaştırma: `live-compare.mjs`, çıktı `sql/verify/out/live-compare.txt`: fonksiyon gövdeleri 15/15 aynı; farklar yerel sahte kopyanın sadeleştirmesinden (sütun tip kısıtları, bildirim/prop tabloları, bazı indeks ve politikalar, `is_admin`/diğer fonksiyonların PUBLIC EXECUTE'u). Migration'ları etkileyen fark yok; kanıtı aşağıdaki prova |
| Prova | ✅ Yedek yerel PG 17'ye geri yüklendi (gerçek canlı şema ve veri); 00, 01, 02, 04, 05 hepsi COMMIT, `backtest_v2_verify.sql` 19 PASS / 0 FAIL |
| 3 Yedek | ✅ `~/WaweJournal-Backups/20261019T201011Z/`: `full.dump` (pg_dump -Fc, tüm şemalar, 650 KB), `schema.sql` (499 KB), `roles.sql` (parolasız, 5,6 KB), `preflight.txt`, `SHA256SUMS`; toplam 1,1 MB, klasör `chmod 700`. Okunabilirlik: `pg_restore -l` 1010 öğe (69 tablo verisi); yerel PG 17'ye geri yüklendi, karşılaştırılan 7 tablonun satır sayıları canlıyla aynı (auth.users 7, journals 11, trades 114, user_profiles 7, strategies 5, payments 107, backtest_trades 1). Tek geri yükleme hatası yerelde olmayan `supabase_vault` eklentisi |
| 4 Migration 00 | ✅ Çalıştı (BEGIN…COMMIT). Doğrulama: anon `EXECUTE` yok, PUBLIC yok, gövde md5 = 00'ın gövdesi; anon çağrısı `permission denied for function` (HTTP 401, 42501, hem SQL'de hem REST'te); sahip çağrısı çalıştı; başka kullanıcı `FORBIDDEN`; admin başka defteri değerlendirebildi; service_role çalıştı |
| 5 Migration 01, 02, 04, 05 | ❌ 01 **ABORT** (`backtest_trades has 1 row(s)`), hiçbir şey değişmedi (rollback gerekmedi). 02, 04, 05 ORDER koruması gereği 01'e bağlı: atlandı |
| 6 `BACKEND`, canlı SQL doğrulamaları | ❌ atlandı (tablolar canlıda yok). Birim testler 306/0 çalıştırıldı. Arayüz testi sahibe kalır |
| 7 Pagecheck | ✅ 6/6 PASS (dashboard, premium-dashboard, trades, calendar, strategies, journals), yeni JS hatası 0, sızıntı denetimi çalışıyor |
| 8 Merge ve yayın | ❌ atlandı: merge koşulu "5-6. adımlardaki canlı SQL doğrulamaları başarılı" sağlanamadı. master'a dokunulmadı, Cloudflare Pages'e push yok, revert gerekmedi |

**01'in durma nedeni ve karar:** `public.backtest_trades` içinde 1 satır var: 2026-10-18 16:17 UTC tarihli, BTCUSDT long, -%1 SL; bir kullanıcıya (premium) ait eski backtest sayfasından kalma bir deneme işlemi. Satır `legacy-backtest_trades.csv` dosyasına ve tam yedeğe alındı. Migration 01 bu tabloyu zaten silecek, yani satır her halükârda yok olacak; ama canlı kullanıcı verisinin silinmesi için sahibin açık onayı olmadığından (otomatik izin denetimi de bu silmeyi engelledi) silmedim ve kuralınız gereği durdum. Satırı silmek için: `delete from public.backtest_trades where id = 'cda92d7f-f4b4-400d-a7fb-c9d59eb9f994';` sonra 01, 02, 04, 05.

**Sizin yapmanız gerekenler:** (1) Satırın silinmesine izin verin (ya da kendiniz silin); sonra oturum kaldığı yerden `DEVAM.md`'deki sırayla devam eder. (2) Admin hesabıyla arayüz denemesi (kullanıcı yapacak): yeni hesap, işlem aç/kapat, deftere bağla, "Backtest" rozeti, bağlantıyı kaldırınca silinme. (3) Yedek klasörünü güvenli yerde tutun: kullanıcı verisi içerir.

**Not (güvenlik):** Bağlantı adresindeki parola sohbet metninde göründü; işiniz bitince Supabase panelinden veritabanı parolasını yenilemenizi öneririm.


---

# Canlı tur 2 (2026-10-20): migration 01, 02, 04, 05, BACKEND geçişi, merge ve yayın

**Özet:** Tablo boştu, ikinci yedek alındı, **01, 02, 04 ve 05 canlıda çalıştı ve hepsinin kontrolleri geçti**, canlı fonksiyonel doğrulama **19 PASS / 0 FAIL** (kendini geri aldı, kalıntı yok). `BACKEND = 'supabase'` yapıldı, testler 306/0, build tamam, pagecheck 6/6, duman testi 48/0 ve 4/0. `backtest-v2` master'a merge edildi (`0849802`), push edildi, Cloudflare Pages yeni dosyaları sunuyor. Hata yok, atlanan adım yok, revert gerekmedi. **Yapılmayan tek şey: gerçek hesapla canlı arayüz denemesi** (kimlik bilgisi yok, sahibe kalır).

| Madde | Sonuç |
|---|---|
| 0 Salt okunur doğrulama | ✅ `backtest_trades` 0 satır (hem toplam hem `cda92d7f-...` kimliği 0). Bağlantı PG 17.6 |
| 1 İkinci yedek | ✅ `~/WaweJournal-Backups/20261020T133907Z/` (chmod 700): `full.dump` (pg_dump -Fc, 1010 öğe, 652 KB), `schema.sql`, `roles.sql` (parolasız), `rowcounts.txt`, `SHA256SUMS`; `dump-err.txt` boş. Satır sayıları: auth.users 7, journals 11, trades 114, user_profiles 7, strategies 5, payments 117, backtest_trades 0 |
| 2 Migration 01 | ✅ COMMIT. Kontroller: `to_regclass('public.backtest_trades')` NULL; gövdesinde adı geçen fonksiyon 0; `reset_user_data` md5 doğru; SECURITY DEFINER, `search_path=public`, ACL'de anon ve PUBLIC yok |
| 3 Migration 02 | ✅ COMMIT. 2 tabloda RLS açık; 8 politika (hepsi `authenticated`); 7 + 12 CHECK, 2 pkey, 4 FK; 6 indeks (2 pkey + 4 `idx_*`); 3 trigger; `reset_user_data` ve `delete_journal` md5 doğru, anon ve PUBLIC EXECUTE yok; `check_*` fonksiyonlarında yalnızca postgres ve service_role; trigger fonksiyonu sahibi RLS'i atlıyor |
| 4 Migration 04 | ✅ COMMIT. 2 trigger (relink'te WHEN koşulu var); `backtest_accounts_cleanup_trades()` SECURITY DEFINER, ACL postgres ve service_role; yetim ayna satır 0 |
| 5 Migration 05 | ✅ COMMIT. `list_journals` ve `get_platform_stats` md5 doğru; ACL beklendiği gibi (`list_journals` anon'suz, `get_platform_stats` anon'lu); `get_platform_stats()` totalTrades 114 = doğrudan sayım (canlı 114, backtest 0) |
| 6 `backtest_v2_verify.sql` (canlı) | ✅ **19 PASS / 0 FAIL**, işlem kendini geri aldı. Önce ve sonra sayılar aynı (auth.users 7, journals 11, trades 114, user_profiles 7, backtest_accounts 0, backtest_account_trades 0) |
| 7 `BACKEND = 'supabase'` | ✅ `backtest.js` satır 25 artık `window.WW_BT_BACKEND === 'local' ? 'local' : 'supabase'`. Yerel mod yalnızca duman testi içindir; `smoke/make.py` varsayılan olarak `local` ayarlıyor, `?backend=supabase` ile yok |
| 8 Testler | ✅ `node --test tests/*.test.js` **306/0**; `npm run build` 25 sayfa; duman testi admin **48 PASS / 0 FAIL**, admin olmayan **4 PASS / 0 FAIL** |
| 9 Pagecheck | ✅ **6/6 PASS** (dashboard, premium-dashboard, trades, calendar, strategies, journals): eski build (`50f92a8`) = yeni build, backtest satırı olsa da olmasa da; yeni JS hatası 0; sızıntı denetimi çalışıyor. Premium dashboard'da bilinen dil karışıklığı notu yine çıktı, sayılar birebir aynı |
| 10 Merge | ✅ Koşulların hepsi sağlandı. `origin/master` zaten `backtest-v2`'nin atasıydı (yerel master geride kalmıştı), çakışma yok. Yerel master `origin/master`'a (`a16e597`) fast-forward edildi, sonra `--no-ff` merge commit **`0849802`**; ağaç `backtest-v2` ile birebir aynı. Merge sonrası tekrar: testler 306/0, build tamam. `git push origin master`: `a16e597..0849802` |
| 11 Cloudflare Pages ve canlı site | ✅ `https://wawejournal.com/interface/backtest/js/backtest.js` ve `backtest.css` canlıda yerel `dist` ile **aynı SHA-1** (yeni sürüm yayında; ilk denemede ~4 dk içinde). `/`, `/login`, `/dashboard`, `/premium-dashboard`, `/trades`, `/calendar`, `/strategies`, `/journals`, `/backtest`, `/settings`, `/pricing` hepsi HTTP 200 |
| 12 Canlı API kontrolü | ✅ anon `evaluate_prop_firm_rules` HTTP 401 (`has_function_privilege` = false); anon `get_platform_stats` HTTP 200 ve sayılar doğru (7 kullanıcı, 114 işlem); anon `backtest_accounts` okuması boş liste (RLS) |

**Başka bir sorun çıkmadı.** Atlanan adım yok, rollback çalıştırılmadı, revert gerekmedi.

**Gözlemler:**
- `payments` yedek arasında 107'den 117'ye çıktı: canlı kullanım, beklenen.
- `backtest_accounts` ve `backtest_account_trades` tablolarında `anon` rolünde Supabase'in varsayılan tablo yetkileri duruyor (INSERT, UPDATE, DELETE, TRUNCATE dahil); korumayı RLS sağlıyor (anon için politika yok, 8 politikanın hepsi `authenticated`) ve REST'te boş liste dönüyor. Diğer tablolarla aynı durum. İsterseniz ayrı bir sertleştirme migration'ı olarak `REVOKE ... FROM anon` eklenebilir; bu turda canlıya izinsiz yazma olmaması için yapılmadı.
- Canlıda hâlâ `get-candles` (eski) Edge Function'ı duruyor; silinmedi.

**Sizin yapmanız gerekenler:**
- [ ] **Admin hesabıyla gerçek canlı denemesi** (`https://wawejournal.com/backtest`): yeni hesap, işlem aç/kapat, deftere bağla, "Backtest" rozeti, istatistikler değişmiyor, bağlantıyı kaldırınca silinme, temizlik. Bu, gerçek oturumla yapılabilen tek kalan adım; hesap kotası veya RLS sorunu çıkarsa verify.sql zaten rollback'li geçtiği için büyük olasılıkla arayüz tarafıdır. Sorun olursa merge commit'i `git revert -m 1 0849802` ile geri alınabilir (veritabanı şeması geriye uyumlu kalır, eski sayfa tabloya bağımlı değildi).
- [ ] Admin olmayan hesapla `/backtest`: "Backtest yakında".
- [ ] Önceki turdaki gerçek tarayıcı kontrol listesi (bölüm 7) hâlâ geçerli; Safari ve Firefox hâlâ denenmedi.
- [ ] Yedek klasörlerini güvenli yerde tutun (kullanıcı verisi içerir): `20261019T201011Z` ve `20261020T133907Z`.
- [ ] **Veritabanı parolasını Supabase panelinden yenileyin** (önceki turda sohbette göründü); yenileyince `~/.wawe-db.env` dosyasını da güncelleyin.

**Kalan işler:** Faz E (lisans, Migration 03/07, içe aktarıcı, ArchiveSource, gerçek veri, herkese açılış); Migration 06 kararı; premium dashboard dil hatası; `npm audit`; eski `get-candles` silinmesi; bekleyen backend deploy; repo herkese açılacaksa `docs/backtest-v2/` içindeki Migration 06 açık tarifinin kaldırılması (KURALLAR §4). Not: Migration 00 çalıştığı için açık canlıda kapalı, 06 yalnızca temizlik.
