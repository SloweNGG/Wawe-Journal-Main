# Backtest tarayıcı duman testi (Faz A, pratik modu için güncel) (headless Chrome)

Gerçek Supabase girişi olmadan sayfayı sınar: `requireAuth`, `sb`, `journal`, plan ve toast stub'lanır, geri kalan her şey (kütüphaneler, sayfa denetleyicisi, grafik, localStorage) gerçektir. Repo kökünden:

```bash
npx astro build
python3 docs/backtest-v2/asama-arayuz/smoke/make.py          # dist/__bt.html
cp docs/backtest-v2/asama-arayuz/smoke/driver.js dist/__driver.js
cp docs/backtest-v2/asama-arayuz/smoke/driver-sb.js dist/__driver-sb.js
cp docs/backtest-v2/asama-arayuz/smoke/driver-ct.js dist/__driver-ct.js
cp docs/backtest-v2/asama-arayuz/smoke/driver-ct-form.js dist/__driver-ct-form.js
cp tests/helpers/fake-supabase.js dist/__fakedb.mjs
(cd dist && python3 -m http.server 8765 &)
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=150000 --dump-dom "http://localhost:8765/__bt.html"   # admin senaryosu
"$CH" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=60000  --dump-dom "http://localhost:8765/__bt.html?role=user"   # admin olmayan (pratik modu: sayfa artık herkese açık, aynı akış)
# Supabase backend + FakeDb (Migration 08 taklidi): ?backend=supabase&driver=/__driver-sb.js&role=user&plan=free
# cTrader verisi (Faz 2, FakeDb Migration 08+09, ctrader-candles stub'ı make.py'de): ?backend=supabase&driver=/__driver-ct.js&role=user&plan=premium&ct=ready   (ct=none | reconnect: seçenek pasif + bağlantı linki)
# cTrader hesap FORMU (hiçbir şeyi değiştirmeden aç, hesap değiştirip geri dön, tek hesap): ?backend=supabase&driver=/__driver-ct-form.js&role=user&plan=premium&ct=ready   (+ &ctn=2: iki hesap; + &ctn=2&ctbad=4455667: ilk hesap bağlantı hatası verir, diğeri seçilince form çalışmalı)
# ekran görüntüsü: ?mode=shot ve --screenshot=<dosya> --window-size=1440,1500
```
Sonuç `#bt-smoke-result` içindedir (`PASS`/`FAIL` satırları, son satır `DONE`). `dist/` git'te yoktur, harness dosyaları orada kalır ve commit'e girmez.
