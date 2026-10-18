# Backtest v2: kaldığımız yer (2026-10-19)

Yeni oturum için okuma sırası:
1. `KURALLAR.md`
2. bu dosya
3. `PLAN.md`
4. `asama-arayuz/stage4-ek.md`

## Durum

- Plan hazır ve sahibe sunuldu. **Sahibin onayı bekleniyor.** Onay gelmeden Faz A'ya başlanmaz. `PLAN.md` sonundaki karar listesi sahibe sorulur ya da sahibin verdiği yanıtlar uygulanır.
- Canlı veritabanına, Storage'a ve fonksiyonlara **hiçbir yazma yapılmadı**. Yedek de henüz alınmadı; ilk canlı yazmadan önce alınacak.
- Branch `backtest-v2`. Uygulama kodunda henüz backtest değişikliği yok, yalnızca `docs/backtest-v2/` var.

## Sıradaki iş: Faz A (onaydan sonra)

1. Eski sayfanın ön yüz kısmını kaldır. Kaynak: `asama-kaldirma/stage2.md` ve `stage2.diff`. Migration 01 ve `settings.js` değişikliği **Faz B'ye** kalır.
2. Saf kütüphaneleri testleriyle birlikte yaz:
   - `bt-symbols.js`: temeli `asama-arsiv/proto/public/interface/backtest/js/bt-symbols.js`.
   - `bt-candles.js`
   - `bt-engine.js`: sayılar `asama-arayuz/prototip/` ile doğrulanır.
   - `bt-synthetic.js`: `asama-arsiv/proto/.../sources/synthetic.mjs` dosyasından taşınır.
3. `bt-data.js` (SyntheticSource) ve `bt-store.js` (LocalStore) yaz. Kurallar `stage4-ek.md` §3'te.
4. Sayfayı, admin kapısını, tarihe git kuralını, i18n'i ve navbar linkini yaz (yalnızca admin). Kaynaklar: `stage4.md` ve `stage4-ek.md`.
5. Çalıştır: `node --test tests/*.test.js` (önceki temel: 156 test geçiyor). Sonra sayfayı admin ve admin olmayan hesapla dene.

## SQL araçları (laptopta kurulum)

SQL dosyaları `sql/verify/src/` altındaki şablonlardan üretilir. Üretilen dosyaları doğrudan düzenleme. Şablonu düzenle, sonra build ve harness'i çalıştır.

PGlite repoya konmaz. Repo dışında, geçici bir klasöre indirilir:

```bash
# repo dışında bir klasörde:
npm pack @electric-sql/pglite@0.5.8 && tar -xzf electric-sql-pglite-0.5.8.tgz   # -> package/dist/index.js

# repo kökünden, docs/backtest-v2 içinde:
cd docs/backtest-v2
node sql/verify/build.mjs sql/db-snapshot sql/verify/src sql
node sql/verify/harness.mjs <pglite klasörü>/package/dist/index.js sql sql/db-snapshot
(cd sql/verify && node docs.mjs "$PWD/..")     # RUN_ORDER.md'yi yeniden üretir
```

Son sonuç: **213 geçti, 0 kaldı** (`sql/verify/out/harness-output.txt`).

`RUN_ORDER.md` içindeki eski `scratchpad` yolları önceki makineye aittir. Bu dosyadaki komutları kullan.

## Açık işler

- Migration'lar bağımsız SQL incelemesinden geçmedi (önceki oturumun inceleme ajanları limite takıldı). Faz B'den önce canlı gövdelerle (`sql/db-snapshot/fn_*.sql`) satır satır incele.
- Migration 03 ve 07 yazılmadı (Faz E, `asama-arsiv/ARSIV.md` §3).
- İçe aktarıcıyı D13'e uyarla (sembol başına index, gün defteri, kilit) ve testlerini yaz (`ARSIV.md` §2).
- `stage5-6.md` güncellenecek:
  - `mapTrade`, `initial_stop_loss` / `initial_take_profit` göndermeli.
  - Hesap sıfırlandıktan sonra `reconcileAccount` çağrılmalı.
- Lisans: Binance (CC BY-NC-SA) ve forex/altın için karar sahipte. cTrader Open API trendbar sorusu, kararından önce dar kapsamlı olarak araştırılacak (`karar-kaydi/saglayici-ara-bulgular.md`).
- Repoda backtest dışı, commit edilmiş bir değişiklik var: landing ve giriş sayfalarında saf siyah arka plan (ayrı commit).
