// ============================================================
// TEMİZLİK ÖNCESİ / SONRASI KARŞILAŞTIRMA — scripts/perf/verify-cleanup.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı. İki iş:
//   --shots <klasör>   12 sayfa × 1440 / 390 px ekran görüntüsü (animasyonlar durdurulmuş, ikinci açılış)
//   --i18n             TR / EN / DE × sayfa: sözlükte olmayan data-i18n anahtarı ve konsol / sayfa hatası
//   --diff <a> <b>     iki ekran görüntüsü klasörünü piksel piksel karşılaştırır (pngjs + pixelmatch, PERF_DIR'de)
//   PERF_DIR=<araçlar> node scripts/perf/verify-cleanup.mjs --base http://127.0.0.1:8788 --shots <klasör> --i18n
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = opt('pages', null) ? String(opt('pages')).split(',') : ['index', 'dashboard', 'trades', 'strategies', 'calendar', 'backtest', 'analytics', 'settings', 'about', 'privacy', 'terms', 'contact'];
const PUBLIC = new Set(['index', 'about', 'privacy', 'terms', 'contact']);

if (opt('diff', null)) {
  const { PNG } = req('pngjs'); const pixelmatch = req('pixelmatch');
  const a = String(opt('diff')), b = args[args.indexOf('--diff') + 2];
  let total = 0, bad = 0;
  for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.png')).sort()) {
    if (!fs.existsSync(path.join(b, f))) { console.log(f.padEnd(26), 'YOK'); bad++; continue; }
    const A = PNG.sync.read(fs.readFileSync(path.join(a, f))), B = PNG.sync.read(fs.readFileSync(path.join(b, f)));
    if (A.width !== B.width || A.height !== B.height) { console.log(f.padEnd(26), 'boyut farklı', A.width + 'x' + A.height, '≠', B.width + 'x' + B.height); bad++; continue; }
    const D = new PNG({ width: A.width, height: A.height });
    const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0.1 });
    total += n; if (n) { bad++; fs.mkdirSync(path.join(b, 'diff'), { recursive: true }); fs.writeFileSync(path.join(b, 'diff', f), PNG.sync.write(D)); }
    console.log(f.padEnd(26), n, 'piksel');
  }
  console.log(`\nfarklı görüntü: ${bad}, toplam fark ${total} piksel`);
  process.exit(0);
}

const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const puppeteer = req('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend({ backtest: true });
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;
let failed = 0;

async function visit(name, { viewport, lang, warm }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await page.emulateTimezone('Europe/Istanbul');
  await mockSession(page, { backend, lang, withSession: !PUBLIC.has(name) });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 140)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('.supabase.co')) errors.push(r.status() + ' ' + r.url().replace(base, '')); });
  const go = () => page.goto(base + '/' + name + '.html', { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  if (warm) { await go(); await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {}); await sleep(800); errors.length = 0; }
  await go();
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {});
  await sleep(3500);
  return { ctx, page, errors };
}

if (opt('shots', null)) {
  const dir = path.resolve(String(opt('shots'))); fs.mkdirSync(dir, { recursive: true });
  for (const [label, vp] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    for (const name of PAGES) {
      const { ctx, page } = await visit(name, { viewport: vp, lang: PUBLIC.has(name) ? 'en' : 'tr', warm: true });
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}' });
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.currentTime = 0; a.pause(); } catch (e) {} }));
      await sleep(300);
      await page.screenshot({ path: path.join(dir, `${label}-${name}.png`) });
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => {});
      await ctx.close();
    }
  }
  console.log('ekran görüntüleri:', dir);
}

if (opt('i18n', false)) {
  for (const lang of ['tr', 'en', 'de']) {
    for (const name of PAGES) {
      const { ctx, page, errors } = await visit(name, { viewport: { width: 1440, height: 900 }, lang, warm: false });
      const miss = await page.evaluate(() => {
        if (!window.i18n || !window.i18n.translations) return { skip: 'i18n.js yok (sayfanın kendi sözlüğü)' };
        const l = window.i18n.getCurrentLanguage(), dict = window.i18n.translations[l] || {};
        const keys = new Set();
        for (const a of ['data-i18n', 'data-i18n-html', 'data-i18n-placeholder', 'data-i18n-title']) document.querySelectorAll('[' + a + ']').forEach((e) => keys.add(e.getAttribute(a)));
        return { lang: l, loaded: Object.keys(dict).length, missing: [...keys].filter((k) => k && !(k in dict)) };
      });
      const ok = !miss.skip ? miss.lang === lang && miss.loaded > 100 && miss.missing.length === 0 && errors.length === 0 : errors.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? 'GEÇTİ' : 'KALDI'} ${lang} ${name.padEnd(10)} ` + (miss.skip ? miss.skip : `sözlük ${miss.lang} (${miss.loaded}), eksik ${miss.missing.length}${miss.missing.length ? ': ' + miss.missing.join(', ') : ''}`) + ` | hata ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' || ') : ''}`);
      await page.waitForNetworkIdle({ idleTime: 400, timeout: 4000 }).catch(() => {});
      await ctx.close();
    }
  }
}

const m = live.summary();
await closeBrowser(browser);
console.log(`canlı trafik: supabase.co ${m.total} istek (sahte ${m.mock}, önbellek/SW ${m.cache}, canlı ${m.live}), WebSocket ${m.ws}; tarayıcı süreçleri kapandı`);
if (m.live || m.ws) failed++;
process.exitCode = failed ? 1 : 0;
