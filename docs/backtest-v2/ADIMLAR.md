# Backtest v2: adım listesi

Son güncelleme: 2026-10-19 (gece). Branch `backtest-v2`.

Simgeler: ✅ bitti · 🔄 devam ediyor · ⬜ bekliyor · 🔐 sahip onayı gerekir

Kural: her adım bitince bu dosya güncellenir. Canlı sisteme yazan her adım 🔐 işaretlidir ve ayrıca onay ister (`KURALLAR.md` §1).
Ayrıntılar: `PLAN.md` (plan), `DEVAM.md` (kaldığımız yer), `KURALLAR.md` (kalıcı kurallar).

## Sıfır: Hazırlık (planlama ve SQL taslakları)

| # | Adım | Durum |
|---|---|---|
| 0.1 | Gereksinimler (R1–R53), kararlar (D0–D13), envanter ve inceleme bulguları | ✅ |
| 0.2 | Canlı şema ve fonksiyon gövdesi anlık görüntüsü (salt okunur, 2026-10-18) | ✅ |
| 0.3 | Migration 01, 02, 04, 05, 06 ve rollback dosyaları yazıldı | ✅ |
| 0.4 | PGlite testleri: 213 geçti, 0 kaldı (kurulum, geri alma, katalog karşılaştırması dahil) | ✅ |
| 0.5 | Migration 02 güncellemesi (D13): `initial_*`, kilitler, geri gitme yasağı | ✅ |
| 0.6 | Admin kapısı, tarihe git kuralı ve arşiv planı yazıldı (`stage4-ek.md`, `ARSIV.md`) | ✅ |
| 0.7 | Planın sahibe sunulması | ✅ |
| 0.8 | `PLAN.md` kararları: sahip onayladı (2026-10-19 gece). Canlıya yazma/silme içerenler sabaha bırakıldı, ayrıntı `SABAH-RAPORU.md` | ✅ |
| 0.9 | Migration'ların canlı gövdelerle (2026-10-18 anlık görüntüsü) incelenmesi: `sql/INCELEME.md`. Canlıya bu gece yeniden bağlanılmadı (KURALLAR §1); DRIFT korumaları çalışma anında denetler | ✅ |

## Yerel doğrulama (gerçek PostgreSQL 17)

| # | Adım | Durum |
|---|---|---|
| L.1 | PostgreSQL 17.11 bu Mac'e kuruldu: `~/WaweJournal-pg17/` (sudo yok, sistem dışı, repo/iCloud/OneDrive dışı) | ✅ |
| L.2 | 261 testlik harness gerçek PG 17'de de geçti (`out/harness-output-pg17.txt`) | ✅ |
| L.3 | 00–06 + verify.sql baştan sona, geri alma, tekrar ileri: hepsi tamam (`out/local-run-pg17.txt`, `wawe_local` migrate halde duruyor). 07 harness'te ayrı denendi | ✅ |
| L.4 | Gerçek `pg_dump` ile canlı şema karşılaştırması (canlıya salt okunur bağlantı gerekir) | ⬜ |

## Güvenlik açığı

Açık: `evaluate_prop_firm_rules(uuid)` SECURITY DEFINER, `anon` çalıştırabiliyor, sahiplik kontrolü yok. Herhangi bir günlüğün prop firma durumunu değiştirebilir (IDOR). Aynı grupta 5 kullanılmayan fonksiyon daha var. **Canlıda hâlâ açık**, çünkü düzeltme (Migration 06) hazır ama çalıştırılmadı.

| # | Adım | Durum |
|---|---|---|
| G.0 | Küçük güvenlik migration'ı `202610180000_secure_evaluate_prop_firm_rules` + rollback yazıldı, PGlite testi geçti (233/0). **Canlıda çalıştırılmadı** | ✅ |
| G.1 | 🔐 Karar: 6 fonksiyonu silmek (önerilen) ya da yamalamak. G.0 açığı kapatır, 06 artık yalnızca temizliktir | ⬜ |
| G.2 | Ön kontrol P1 (salt okunur): fonksiyonların mevcut yetkileri kaydedilir, pg_cron ve bağımlılık kontrolü | ⬜ |
| G.3 | 🔐 Tam yedek alınır, yeri sahibe bildirilir (R48) | ⬜ |
| G.4a | 🔐 **Sabah: Migration 00 çalıştırılır (canlı yazma, açığı kapatır)** | ⬜ |
| G.4 | 🔐 Migration 06 çalıştırılır (canlı yazma), G.1 kararına bağlı | ⬜ |
| G.5 | Doğrulama: fonksiyonlar yok, `anon` çağıramıyor, uygulama normal çalışıyor | ⬜ |

Not: Plan 06'yı Faz C+D ile birlikte çalıştırıyor. Açık canlıda olduğu için G adımlarını Faz A'dan önce ya da yanında yapmak önerilir. Bu bir sıralama kararı, 🔐 onayına bağlı.
Not: Repo herkese açılacaksa `docs/backtest-v2/` içindeki açık tarifi önce kaldırılmalı (`KURALLAR.md` §4).

## Faz A: Arayüz (yalnızca admin, veritabanı yok)

Gece oturumunda A.11'e kadar yapıldı, A.12 sahibin onayını bekliyor.

| # | Adım | Durum |
|---|---|---|
| A.1 | Eski sayfa kaldırıldı: `backtest.astro` sıfırdan, `styles.css` bt seçicileri, `get-candles` repodan silindi, `sw.js` v12. (`settings.js` ve Migration 01 Faz B'de) | ✅ |
| A.2 | `bt-symbols` + testleri (15) | ✅ |
| A.3 | `bt-candles` + testleri (15) | ✅ |
| A.4 | `bt-engine` + testleri (25, 20.000'lik fuzz dahil) | ✅ |
| A.5 | `bt-synthetic` + testleri | ✅ |
| A.6 | `bt-data.js`: SyntheticSource, "Sentetik veri · test" etiketi | ✅ |
| A.7 | `bt-store.js`: LocalStore + admin kapısı + testleri | ✅ |
| A.8 | Sayfa: hesap listesi, oluştur/düzenle/sil/sıfırla | ✅ |
| A.9 | Sayfa: replay, işlem motoru, grafik | ✅ |
| A.10 | i18n (tr/en/de, 153 anahtar), admin kapısı, navbar linki (yalnızca admin) | ✅ |
| A.11 | `node --test tests/*.test.js`: 240 geçti / 0 kaldı. Headless Chrome duman testi (admin ve admin olmayan) geçti. Gerçek giriş ve elle deneme sahipte | ✅ |
| A.12 | 🔐 Faz A sonu: sahibin ekran onayı | ⬜ |

## Faz B: Veritabanı (canlıya ilk yazma)

| # | Adım | Durum |
|---|---|---|
| B.1 | 🔐 Tam yedek (şema, veri, roller), yeri bildirilir. G.3 yapıldıysa yeni yedek gerekir mi, sahip karar verir | ⬜ |
| B.2 | 🔐 Migration 01: `backtest_trades` silinir | ⬜ |
| B.3 | 🔐 Migration 02: iki tablo, RLS, tetikleyiciler | ⬜ |
| B.4 | `settings.js` yedek silme yolu güncellenir | ⬜ |
| B.5 | `bt-store.js` SupabaseStore'a geçer (localStorage test verisi silinir) | ⬜ |
| B.6 | Doğrulama: `sql/supabase/tests/backtest_v2_verify.sql` canlıda, uygulama elle denemesi | ⬜ |
| B.7 | 🔐 Faz B sonu onayı | ⬜ |

## Faz C: Senkron (D ile birlikte yayınlanır)

| # | Adım | Durum |
|---|---|---|
| C.1 | `stage5-6.md` güncelle: `mapTrade` `initial_*` göndersin, sıfırlamadan sonra `reconcileAccount` | ⬜ |
| C.2 | 🔐 Migration 04 (bağlantı değişince kopyaları sil) | ⬜ |
| C.3 | `bt-sync.js` repoya eklenir, testleri çalışır | ⬜ |

## Faz D: İstatistikler (C ile birlikte yayınlanır)

| # | Adım | Durum |
|---|---|---|
| D.1 | 🔐 Migration 05 (`list_journals`, `get_platform_stats` canlı filtre) | ⬜ |
| D.2 | `trades-source.js` + okuyucu yaması: tüm okuyucularda canlı filtre | ⬜ |
| D.3 | İşlemler sayfası: Tümü / Canlı / Backtest seçimi ve rozet | ⬜ |
| D.4 | Doğrulama: backtest satırları canlı istatistiklere düşmüyor | ⬜ |
| D.5 | 🔐 Faz C+D birlikte yayın onayı | ⬜ |

## Faz E: Arşiv ve herkese açma (lisans kararına bağlı)

| # | Adım | Durum |
|---|---|---|
| E.1 | 🔐 Lisans kararı: Binance (CC BY-NC-SA), forex ve altın. cTrader trendbar sorusu dar kapsamda araştırılır | ⬜ |
| E.2 | Migration 03 (admin-only bucket) ve Migration 07 (üyelere açma, lisans onay satırı kapalı) + rollback'leri yazıldı, PGlite testi geçti (261/0). Canlıda çalıştırılmadı | ✅ |
| E.3 | İçe aktarıcı D13'e uyarlanır (sembol başına index, gün defteri, kilit) ve testleri yazılır | ⬜ |
| E.4 | 🔐 Bucket oluşturma, ilk veri yükleme (canlı Storage yazması) | ⬜ |
| E.5 | Gece GitHub Actions işi ve ArchiveSource | ⬜ |
| E.6 | 🔐 Migration 07 çalıştırılır (lisans onay satırı açılır): sayfa tüm üyelere açılır, navbar herkese | ⬜ |

## Backtest dışı bekleyenler (bilgi için)

- Backend deploy bekliyor (`ctrader-sync`, `create-payment`, `verify-auth`, `nowpayment-webhook`). Migration 0003 ve 0004'ün çalışıp çalışmadığı bilinmiyor. Bu liste dışında, ayrı takip.
