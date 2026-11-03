// ============================================================
// YERLEŞİM KAYMASI (CLS) TEKRARLI ÖLÇÜM — scripts/perf/cls.mjs
// ============================================================
// Lighthouse tek çalıştırmada seyrek kaymaları kaçırır; bu betik aynı sayfayı N kez SOĞUK açar (her seferinde boş
// tarayıcı bağlamı: HTTP önbelleği, service worker ve Cache Storage yok), gerçek ağ kısıtıyla (yavaş 4G: 150 ms RTT,
// 1.6 Mbps; CPU 4×) ve mobil ekranla. Her kayma kaynağıyla (öğe, dikey px) yazılır.
//   node scripts/perf/cf-serve.mjs dist 8788
//   PERF_DIR=<araç klasörü> node scripts/perf/cls.mjs --base http://127.0.0.1:8788 --mock --page analytics --runs 20
// --mock: scripts/perf/mock-session.mjs (Supabase yerelde cevaplanır). --profile <klasör>: gerçek oturumlu profil
// (salt okuma koruması açık; yazan istekler engellenir, sonda listelenir).
// --desktop: 1440×900 fare (varsayılan mobil). --json <dosya>: tüm sonuçları dosyaya yazar. Chrome yolu: CHROME=... (varsayılan: işletim sistemine göre)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mockSession } from './mock-session.mjs';
import { chromePath } from './chrome-path.mjs';
import { guardReadOnly } from './readonly-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const name = String(opt('page', 'analytics'));
const runs = +opt('runs', 20);
const settle = +opt('settle', 9000);
const profile = opt('profile', null);
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', userDataDir: profile ? path.resolve(profile) : undefined });
const results = [];
for (let i = 0; i < runs; i++) {
  const ctx = profile ? browser.defaultBrowserContext() : await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(opt('desktop', false) ? { width: 1440, height: 900 } : { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  if (opt('mock', false)) await mockSession(page);
  const guard = profile ? await guardReadOnly(page) : null;
  const cdp = await page.createCDPSession();
  if (profile) {
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'cache_storage,service_workers' }).catch(() => {});
  }
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => {
    window.__shifts = [];
    const sel = (n) => !n || !n.tagName ? '?' : n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({ t: Math.round(e.startTime), v: e.value, src: (e.sources || []).map((s) => ({ el: sel(s.node), dy: Math.round(s.currentRect.y - s.previousRect.y), dh: Math.round(s.currentRect.height - s.previousRect.height) })) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(base + '/' + name + (name.endsWith('.html') ? '' : '.html'), { waitUntil: 'load', timeout: 90000 }).catch((e) => console.log('goto:', e.message));
  await new Promise((r) => setTimeout(r, settle));
  const shifts = await page.evaluate(() => window.__shifts).catch(() => []);
  const fonts = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /woff2|fonts\.g/.test(e.name)).map((e) => e.name.replace(/^.*\//, '').replace(/\?.*$/, ''))).catch(() => []);
  const cls = shifts.reduce((s, x) => s + x.v, 0);
  results.push({ run: i + 1, cls, shifts, fonts, url: page.url().replace(base, ''), blocked: guard ? guard.blocked : [] });
  if (guard && guard.blocked.length) console.log('   engellenen yazma: ' + guard.blocked.join(', '));
  console.log(`#${i + 1} CLS ${cls.toFixed(4)} | ${shifts.length} kayma` + shifts.map((s) => ` [${s.t} ms ${s.v.toFixed(4)}: ` + s.src.map((x) => `${x.el} dy=${x.dy}${x.dh ? ' dh=' + x.dh : ''}`).join(', ') + ']').join(''));
  await page.close();
  if (!profile) await ctx.close();
}
await browser.close();
const vals = results.map((r) => r.cls).sort((a, b) => a - b);
const withShift = results.filter((r) => r.cls > 0.0005).length;
console.log(`\n${name}: ${runs} deneme | kaymalı: ${withShift} | CLS ortanca ${vals[Math.floor(vals.length / 2)].toFixed(4)} | en yüksek ${vals[vals.length - 1].toFixed(4)} | ortalama ${(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(4)}`);
if (opt('json', null)) fs.writeFileSync(String(opt('json')), JSON.stringify(results, null, 2));
