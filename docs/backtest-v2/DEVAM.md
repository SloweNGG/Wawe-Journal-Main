# Backtest v2: kaldığımız yer (2026-10-19 akşam, bitirme turu sonu)

Yeni oturum için okuma sırası: `KURALLAR.md`, bu dosya, `SON-RAPOR.md`, `ADIMLAR.md` ("Bitirme turu" bölümü).

## Durum

- **Bitti (branch `backtest-v2`):** arayüz düzeltmeleri (tam ekran replay, hesap ayarları penceresi, spread pip, eksen etiketi, devToolbar), Migration 00'a `is_admin()` istisnası (SQL testleri PGlite ve gerçek PG 17'de 266/0), `PROJECT_OVERVIEW.md` güncellemesi.
- **Yapılmadı, tek engel canlı kimlik bilgisi:** makinede veritabanı parolası, Supabase erişim token'ı ve `gh` yok. Canlı adımlar (7, 10-16) atlandı. Hiçbir canlı sisteme yazılmadı.
- `BACKEND` hâlâ `'local'` (`public/interface/backtest/js/backtest.js`, satır ~25). Migration'lar canlıda çalışmadan `'supabase'` yapılmaz ve master'a merge edilmez.

## Kaldığın yerden devam: canlı adımlar (kimlik bilgisi verilince)

Sırayla, her adımda hata olursa o adımın rollback'i ve bağımlı adımların atlanması kuralı geçerli (sahibin tek seferlik prompt'undaki hata politikası):

1. Salt okunur bağlan; `evaluate_prop_firm_rules` tanımı ve GRANT'leri; 18 Ekim anlık görüntüsüyle (`sql/db-snapshot/`) karşılaştır; çağıranları kontrol et (repoda çağıran yok, tek DB içi çağıran `sync_journal_trades`, ayrıntı SON-RAPOR madde 8).
2. Tam yedek: `~/WaweJournal-Backups/<UTC>/` (repo ve OneDrive dışı). Parola yalnızca o terminalde ortam değişkeni olarak, hiçbir dosyaya yazılmaz.
3. Migration sırası: **00, 01, 02, 04, 05** (03 ve 07 Faz E; 06 sahip kararı bekliyor). Dosyalar: `sql/supabase/migrations/`, rollback'ler `sql/supabase/rollbacks/` (ters sırada). Her birinden sonra `sql/supabase/tests/backtest_v2_verify.sql` veya dosyanın kendi kontrol sorguları. `supabase db push` kullanılmaz (KURALLAR §2).
4. `BACKEND = 'supabase'`, `npm run build`, `node --test tests/*.test.js`, pagecheck (`asama-senkron-istatistik/pagecheck/`, 6/6).
5. Canlı veritabanıyla admin hesabıyla uçtan uca deneme (hesap, işlem, deftere bağlama, "Backtest" rozeti, istatistikler değişmiyor, bağlantıyı kaldırınca silinme, temizlik).
6. Hepsi tamamsa PR ile master'a merge, Cloudflare Pages, canlı site kontrolü; sorun varsa merge commit'i revert.

## Araçlar (bu turdan)

- Ekran görüntüsü düzeneği (repo dışı, scratchpad): `puppeteer-core` + `smoke/make.py` varyantı; gerekirse `smoke/README.md`'deki komutlarla yeniden kurulur. Gerçek `dist/backtest.html` gövdesi ve tüm sayfa CSS'leri (`styles.css`, `navbar.css`, `buttons.css`) yüklenmeli, yoksa modal ve düzen farklı görünür.
- SQL: `node sql/verify/build.mjs sql/db-snapshot sql/verify/src sql`, harness PGlite (`npm pack @electric-sql/pglite@0.5.8`) veya gerçek PG 17 (`sql/verify/LOCAL-PG17.md`; harness'ten önce `wawe_local` veritabanı silinmeli, yoksa `role "anon" cannot be dropped` hatası verir).

## Açık işler

- Faz E: lisans kararı, Migration 03/07, içe aktarıcı, ArchiveSource, gerçek veri ve herkese açılış.
- Migration 06 kararı (6 kullanılmayan fonksiyon; açığı 00 zaten kapatıyor, 06 yalnızca temizlik).
- Premium dashboard dil karışıklığı (ön-var olan hata, `SABAH-RAPORU.md`).
- `npm audit` incelemesi, canlıdaki eski `get-candles` Edge Function'ının silinmesi, backend deploy bekleyenler (`ctrader-sync`, `create-payment`, `verify-auth`, `nowpayment-webhook`).
- `docs/backtest-v2/` içinde Migration 06 açığının tarifi var; repo herkese açılacaksa kaldırılmalı (KURALLAR §4).
