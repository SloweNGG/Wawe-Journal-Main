// ============================================================
// TİPİK OTURUMDA SUPABASE STORAGE BAYTI — scripts/perf/storage-session.mjs
// ============================================================
// Sahte oturumla (canlıya istek yok) bir kullanıcının günü: dashboard aç → backtest'e geç → hesaba gir → sayfayı yenile →
// dashboard'a dön; sonra "ertesi gün" (HTTP önbelleği temizlenir, service worker ve Cache Storage kalır; tarayıcıların
// 1 saatlik önbelleği bayatlatmasını taklit eder) aynı tur. Her adımda Storage'dan inen bayt (200 gövde), 304 ve istek sayısı.
// Avatar sahte arka uçtan verilir (createMockBackend avatar): --avatar-kb (varsayılan 1500) ve --avatar-cache.
//   node scripts/perf/cf-serve.mjs dist 8788
//   PERF_DIR=<araçlar> node scripts/perf/storage-session.mjs --base http://127.0.0.1:8788 [--avatar-kb 1500] [--avatar-cache max-age=3600]
// ============================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const avatarKb = +opt('avatar-kb', 1500);
const avatarCache = String(opt('avatar-cache', 'max-age=3600'));
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
try {
  // Gerçek bir JPEG (geçersiz bayt <img> hatasına ve farklı davranışa yol açmasın): gürültülü kare, istenen boyuta yakın
  const gen = await browser.newPage();
  const jpeg = Buffer.from(await gen.evaluate(async (kb) => {
    let side = 900, best = null;
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas'); c.width = c.height = side; const x = c.getContext('2d');
      for (let j = 0; j < 9000; j++) { x.fillStyle = `hsl(${(j * 37) % 360},60%,${20 + (j % 60)}%)`; x.fillRect((j * 7919) % side, (j * 104729) % side, 3 + j % 30, 3 + j % 30); }
      best = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.97));
      if (Math.abs(best.size / 1024 - kb) < kb * 0.15) break;
      side = Math.round(side * Math.sqrt(kb * 1024 / best.size));
    }
    return Array.from(new Uint8Array(await best.arrayBuffer()));
  }, avatarKb));
  await gen.close();

  const backend = createMockBackend({ avatar: { bytes: jpeg, cacheControl: avatarCache }, backtest: true });
  await watchWorkers(browser, backend);
  var live = watchLive(browser, { fulfilled: backend.fulfilled });
  await live.ready;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await mockSession(page, { backend });
  const cdp = await page.createCDPSession();

  let last = { requests: 0, bytes: 0, notModified: 0 };
  const rows = [];
  const step = (name) => {
    const s = backend.storage;
    rows.push({ name, requests: s.requests - last.requests, bytes: s.bytes - last.bytes, notModified: s.notModified - last.notModified });
    last = { ...s };
  };
  const settle = async () => { await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {}); await sleep(1500); };
  const state = () => page.evaluate(() => ({ url: location.pathname, state: (document.querySelector('#bt-root') || { getAttribute: () => null }).getAttribute('data-state'),
    cards: document.querySelectorAll('.bt-account-card[data-id]').length, replay: (document.getElementById('bt-view-replay') || { getAttribute: () => null }).getAttribute('data-replay') }));
  const openAccount = async () => {
    await page.waitForFunction(() => document.querySelector('.bt-account-card[data-id]:not(.bt-skeleton)') ||
      (document.querySelector('#bt-root') && document.querySelector('#bt-root').getAttribute('data-state') === 'replay'), { timeout: 30000 })
      .catch(async (e) => { throw new Error('backtest listesi gelmedi: ' + JSON.stringify(await state())); });
    // önceki ziyaretten kalan "kaldığın hesap" doğrudan açılmışsa liste adımı atlanır
    if ((await state()).state !== 'replay') await page.click('.bt-account-card[data-id]:not(.bt-skeleton)');
    await page.waitForFunction(() => { const v = document.getElementById('bt-view-replay'); return v && v.getAttribute('data-replay') === 'ready'; }, { timeout: 40000 })
      .catch(async () => { throw new Error('hesap açılmadı: ' + JSON.stringify(await state())); });
    await settle();
  };
  const day = async (label) => {
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' }); await settle(); step(label + ' dashboard');
    await page.goto(base + '/backtest.html', { waitUntil: 'load' }); await openAccount(); step(label + ' backtest + hesaba gir');
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const v = document.getElementById('bt-view-replay'); return v && v.getAttribute('data-replay') === 'ready'; }, { timeout: 40000 }).catch(() => {});
    await settle(); step(label + ' backtest yenile');
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' }); await settle(); step(label + ' dashboard tekrar');
  };
  await day('1. gün:');
  await cdp.send('Network.clearBrowserCache');
  await day('2. gün:');
  const sw = await page.evaluate(async () => {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    const av = keys.includes('wawe-storage-v1') ? (await (await caches.open('wawe-storage-v1')).keys()).length : 0;
    return { sw: !!(reg && reg.active), caches: keys.join(','), avatarEntries: av, avatarShown: !!document.querySelector('#user-avatar img') };
  });

  console.log(`avatar ${(jpeg.length / 1024).toFixed(0)} KB, ${avatarCache} | ${base}`);
  for (const r of rows) console.log(r.name.padEnd(34), String(r.requests).padStart(2), 'istek |', (r.bytes / 1024).toFixed(1).padStart(8), 'KB 200 |', r.notModified, '× 304');
  const tot = rows.reduce((s, r) => ({ requests: s.requests + r.requests, bytes: s.bytes + r.bytes, nm: s.nm + r.notModified }), { requests: 0, bytes: 0, nm: 0 });
  console.log('TOPLAM'.padEnd(34), String(tot.requests).padStart(2), 'istek |', (tot.bytes / 1024).toFixed(1).padStart(8), 'KB 200 |', tot.nm, '× 304');
  console.log('SW:', JSON.stringify(sw));
  console.log(live.line());
  live.assertNoLive();
} finally {
  await closeBrowser(browser);
  console.log('tarayıcı süreçleri kapandı');
}
