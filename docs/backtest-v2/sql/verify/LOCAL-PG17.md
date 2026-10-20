# Yerel PostgreSQL 17 (gerçek sunucuda doğrulama)

PGlite hızlı ama gerçek PostgreSQL değil. Migration'lar ayrıca bu Mac'teki yerel bir PostgreSQL 17.11 sunucusunda denendi.

**Kurulum yeri (repo, iCloud ve OneDrive dışı):** `~/WaweJournal-pg17/`
- `bin-src/`: Postgres 17.11 ikilileri (Maven Central'daki `io.zonky.test.postgres` arm64 paketinden çıkarıldı; yalnızca `postgres`, `initdb`, `pg_ctl` var, `psql` yok).
- `data/`: veri dizini (`trust` kimlik doğrulama, yalnızca `127.0.0.1:54417`, parola yok, **yalnızca test içindir**).
- `start.sh` / `stop.sh`: sunucuyu açar / kapatır. Sistem genelinde hiçbir şey kurulmadı, sudo kullanılmadı.

**Çalıştırma (repo kökünden, `docs/backtest-v2` içinde; `pg` npm paketi repo dışında bir klasörde olmalı, örn. `npm i pg@8`):**

```bash
~/WaweJournal-pg17/start.sh
cd docs/backtest-v2
# 1) 261 testlik harness'i gerçek sunucuda çalıştır (PGlite yerine adaptör)
PG_MODULE_DIR=<pg'nin node_modules'ünün üst klasörü> PGPORT=54417 HARNESS_OUT=harness-output-pg17.txt \
  node sql/verify/harness.mjs "$PWD/sql/verify/pg-adapter.mjs" sql sql/db-snapshot
# 2) Gerçek dosyaları baştan sona çalıştır: 00 01 02 03 04 05 06 + verify.sql, sonra geri alma, sonra tekrar ileri.
#    "wawe_local" veritabanı migrate edilmiş halde kalır.
PG_MODULE_DIR=<...> PGPORT=54417 node sql/verify/local-run.mjs sql sql/db-snapshot
~/WaweJournal-pg17/stop.sh
```

**"Canlı şemanın kopyası"** canlı veritabanından alınmadı (kural: canlıya bağlanma). 2026-10-18 salt okunur anlık görüntülerinden kuruldu: `mock_live_pre.sql` + `db-snapshot/fn_*.sql` (canlı fonksiyon gövdeleri birebir) + `mock_live_post.sql`. Gerçek bir `pg_dump` ile karşılaştırma sabah canlıya salt okunur bağlanılınca yapılabilir.

**Sonuç:** `out/harness-output-pg17.txt` (261 geçti / 0 kaldı) ve `out/local-run-pg17.txt` (hepsi tamam).
