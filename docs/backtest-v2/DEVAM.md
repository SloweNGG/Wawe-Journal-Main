# Backtest v2: kaldığımız yer (2026-10-21, Faz 2 cTrader verisi, yayında)

Okuma sırası: `KURALLAR.md`, bu dosya, `SON-RAPOR.md` (en üst bölüm, "Faz 2"), `FAZ-E-VERI.md`.

## Faz 2 durumu (önce bunu oku)

- **2026-10-21 düzeltme (`e313b8a`, yayında):** formda "mum verisi yok" hatası için `coverage` sorgusu probe biçimine döndürüldü (`SON-RAPOR.md` en üst bölüm). Gerçek cTrader'la canlı doğrulama hâlâ yok (client secret makinede yok); sahibin denemesi bekleniyor. Sorun sürerse fonksiyon logundaki `ctrader-candles error: coverage ...` satırına bak.

- **2026-10-22 düzeltme (yayında):** hesap formunda "Select a cTrader account." hatası (bir broker hesabı bağlantı hatası verince ortak önbellek siliniyordu); ayrıntı `SON-RAPOR.md` en üst bölüm. Yeni duman testi: `smoke/driver-ct-form.js`.

- **Yayında (2026-10-21):** Migration 09 canlıda, `ctrader-candles` v1 ve `ctrader-sync` v7 yayınlandı (`--no-verify-jwt`), master `7d864fd` (merge) push edildi, canlı `webcheck` 24/0, dosya SHA-1'leri eşleşti.
- **Yapılmadı:** kimlikli gerçek cTrader çağrısı (JWT yok) ve fonksiyon logu (token'da `analytics_logs_read` yok). Sıradaki: sahibin kendi hesabıyla denemesi (`SON-RAPOR.md` bölüm 5); sorun olursa Supabase panelinden fonksiyon logları.
- İlk gerçek çağrıda `symbols`, `coverage` (özellikle W1 ipucu), `symbolInfo` alan adları ve `month` yanıt biçimini doğrula.
- Geri alma: `git revert -m 1 7d864fd`; `ctrader-sync`'in eski sürümü `git show ca0abaa:supabase/functions/ctrader-sync/index.ts`; `09.down.sql` yalnız cTrader hesap yokken.
- Duman testi cTrader senaryosu: `asama-arayuz/smoke/README.md` (`driver-ct.js`). Deploy: `set -a; source ~/.wawe-supabase.env; set +a; npx supabase functions deploy <ad> --project-ref odasapyhtdopbnlfhwde --use-api --no-verify-jwt`.

---

## (Önceki) Faz 1 pratik modu sonu, 2026-10-21

Yeni oturum için okuma sırası: `KURALLAR.md`, bu dosya, `SON-RAPOR.md` (en üstteki bölüm), `FAZ-E-VERI.md`.

## Faz 1 sonu (2026-10-21, önce bunu oku)

- **Backtest herkese açık** (giriş yapmış tüm kullanıcılar), sentetik veri, hesaplar Supabase'de. Migration 00, 01, 02, 04, 05 ve **08** canlıda. Master: `b6aeb8a` (merge), kod `180addc`. Yedek: `~/WaweJournal-Backups/20261021T062240Z/` (08 öncesi).
- Migration 08: `backtest_accounts.data_source` (yalnızca `synthetic`, değişmez), sentetik hesap deftere bağlanamaz (CHECK). Admin'in tek test hesabı defterden ayrıldı (4 kopya işlem silindi).
- **Sıradaki tur: cTrader veri kaynağı** (`FAZ-E-VERI.md`): Migration 09 (`source_*`, CHECK'e `'ctrader'`), `ctrader-candles` Edge Function, hesap formunda gerçek cTrader seçimi. `bt-sync` ve defter bağlama kodu cTrader hesaplar için hazır bekliyor.
- Yayın sonrası kontrol aracı: `docs/backtest-v2/asama-arayuz/webcheck/run.mjs` (imzalı SPA akışı, canlı siteye de çalışır; `PG_MODULE_DIR` içinde `puppeteer-core` gerekir). Duman testi komutları `asama-arayuz/smoke/README.md`. SQL harness gerçek PG 17'de: `LOCAL-PG17.md` (önce `bt_*` ve `wawe_local` veritabanları silinmeli).
- Sorun olursa: `git revert -m 1 b6aeb8a` (eski arayüz yeni sütunla uyumlu), gerekirse sonra `08.down.sql`.

## Canlı tur 2 sonu (2026-10-20, tarihî)

- **Migration 00, 01, 02, 04, 05 canlıda çalıştı ve doğrulandı**; canlı `backtest_v2_verify.sql` 19 PASS. `BACKEND = 'supabase'`. `backtest-v2` master'a merge edildi (`0849802`), push edildi, Cloudflare Pages canlıda yeni dosyaları sunuyor (SHA-1 eşleşti). Ayrıntı: `SON-RAPOR.md` "Canlı tur 2".
- Yedekler: `~/WaweJournal-Backups/20261019T201011Z/` (00 öncesi) ve `20261020T133907Z/` (01 öncesi).
- **Kalan tek adım:** admin hesabıyla gerçek canlı arayüz denemesi (sahip). Sorun olursa `git revert -m 1 0849802`.
- Geri kalan açık işler aşağıdaki "Açık işler" bölümünde (Faz E, Migration 06, vb.). Aşağıdaki "Canlı tur sonu" ve "Kaldığın yerden devam" bölümleri tarihî kayıttır, tamamlandı.

## Canlı tur 1 sonu (tarihî, tamamlandı)

- Canlıda **Migration 00 çalıştı** (güvenlik açığı kapandı, doğrulandı). Yedek: `~/WaweJournal-Backups/20261019T201011Z/` (`full.dump`, `schema.sql`, `roles.sql`, `preflight.txt`, `legacy-backtest_trades.csv`, `SHA256SUMS`).
- **Migration 01 durdu**: `public.backtest_trades` içinde 1 satır var (id `cda92d7f-f4b4-400d-a7fb-c9d59eb9f994`, BTCUSDT, 2026-10-18 tarihli test işlemi). Satır CSV'ye ve tam yedeğe alındı. Devam etmek için satırın silinmesi gerekiyor (canlı veri silme; otomatik izin denetimi bu turda engelledi, sahibin açık onayı bekleniyor): `delete from public.backtest_trades where id = 'cda92d7f-f4b4-400d-a7fb-c9d59eb9f994';`
- Silindikten sonra sırayla: `supabase/migrations/202610180001_...`, `...02_...`, `...04_...`, `...05_...` (psql, `-v ON_ERROR_STOP=1`), her birinden sonra kontrol, ardından `docs/backtest-v2/sql/supabase/tests/backtest_v2_verify.sql` (19 PASS beklenir; kendi kendine geri alır), `BACKEND = 'supabase'`, test, build, pagecheck, merge ve yayın. 01 sonrası tüm adımlar gerçek canlı şema ve veriyle yerelde **prova edildi** (yedeğin geri yüklenmesi): 00, 01, 02, 04, 05 COMMIT, verify.sql 19 PASS.
- Bağlantı: `set -a; source ~/.wawe-db.env; set +a` (yalnızca `source` değişkeni dışa aktarmaz). psql/pg_dump: `~/WaweJournal-pg17/tools/pg/bin`.

## Durum (önceki tur)

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
- Faz E veri kaynağı (Sentetik / cTrader) planı ve trendbar ölçümü: `FAZ-E-VERI.md`. Ölçüm 2026-10-20'de yapıldı (Spotware demo): `accounts` kapsamı yetiyor, 2020'den bugüne eksiksiz M1, yanıt başına 14 000 bar tavanı.
- Migration 06 kararı (6 kullanılmayan fonksiyon; açığı 00 zaten kapatıyor, 06 yalnızca temizlik).
- Premium dashboard dil karışıklığı (ön-var olan hata, `SABAH-RAPORU.md`).
- `npm audit` incelemesi, canlıdaki eski `get-candles` Edge Function'ının silinmesi, backend deploy bekleyenler (`ctrader-sync`, `create-payment`, `verify-auth`, `nowpayment-webhook`).
- `docs/backtest-v2/` içinde Migration 06 açığının tarifi var; repo herkese açılacaksa kaldırılmalı (KURALLAR §4).
