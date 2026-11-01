# Demo hesap ve tanıtım çekimleri (yalnızca yerel)

Canlı Supabase'e hiçbir istek gitmez: Playwright, `*.supabase.co`'ya giden REST / Auth / RPC / Edge Function / Storage
isteklerini ve realtime websocket'i `backend.mjs`'teki yerel sahte Supabase'e yönlendirir. İzin listesindeki CDN'ler
(jsdelivr, Google Fonts) dışındaki dış istekler iptal edilir; CDN dosyaları `.demo-data/cdn-cache`'e yazılır, sonraki
çalıştırmalar internetsiz de açılır. Backtest mumları tarayıcıda üretilir (sentetik kaynak), harici API yok.

```bash
# bir kez: Playwright + Chromium + ffmpeg repo dışında
mkdir ../pw && cd ../pw && npm init -y && npm i playwright@1.49.1 ffmpeg-static@5.2.0 && npx playwright install chromium && cd -

npx astro build                         # dist/
node scripts/seed-demo.mjs              # .demo-data/db.json + credentials.json (gitignore'da)
PW_DIR=../pw node scripts/demo/capture-shots.mjs      # promo-captures/<sayfa>@2x.png (3840x1890)
PW_DIR=../pw node scripts/demo/record-backtest.mjs    # promo-captures/bt-*.mp4 (1920x1080, 30 fps)
```

- `node scripts/seed-demo.mjs --check`: yalnızca istatistikleri yazdırır. Şifre: `DEMO_PASSWORD` (yoksa rastgele).
- Tarayıcı saati demo "şimdi"sine (27.11.2026) kaydırılır; çekim sırasındaki yazmalar yalnızca bellekte kalır.
- Windows'ta GPU (ANGLE/D3D11) açılır; kapatmak için `DEMO_GPU=0`. `KEEP_FRAMES=1` ham kareleri saklar.
