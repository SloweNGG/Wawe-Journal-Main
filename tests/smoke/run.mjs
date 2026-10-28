// Backtest browser smoke tests (headless Chrome through puppeteer-core). Not part of `node --test`.
// Usage (repo root, after `npx astro build && python3 tests/smoke/make.py`):
//   PP_DIR=<folder with node_modules/puppeteer-core> node tests/smoke/run.mjs [scenario ...] [--shots <dir>]
// Every scenario opens dist/__bt.html with a driver script; the driver writes PASS/FAIL lines into #bt-smoke-result and ends with DONE.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(process.env.PP_DIR ? path.join(process.env.PP_DIR, 'x.js') : import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIST = path.resolve('dist');
const DESKTOP = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

// name: [query string, viewport]
const SCENARIOS = {
  base: ['', DESKTOP],
  'base-user': ['role=user', DESKTOP],
  sb: ['backend=supabase&driver=/__driver-sb.js&role=user&plan=free', DESKTOP],
  ct: ['backend=supabase&driver=/__driver-ct.js&role=user&plan=premium&ct=ready', DESKTOP],
  'ct-form': ['backend=supabase&driver=/__driver-ct-form.js&role=user&plan=premium&ct=ready&ctn=2&ctbad=4455667', DESKTOP],
  'base-phone': ['role=user', PHONE],
  'ct-phone': ['backend=supabase&driver=/__driver-ct.js&role=user&plan=premium&ct=ready', PHONE],
  'sb-phone': ['backend=supabase&driver=/__driver-sb.js&role=user&plan=premium', PHONE],
  'layout-free': ['driver=/__driver-layout.js&role=user&plan=free', DESKTOP],
  'layout-pro': ['driver=/__driver-layout.js&role=user&plan=premium', DESKTOP],
  'layout-phone': ['driver=/__driver-layout.js&role=user&plan=free&phone=1', PHONE],
  'look-free': ['driver=/__driver-look.js&role=user&plan=free', DESKTOP],
  'look-pro': ['driver=/__driver-look.js&role=user&plan=premium', DESKTOP],
  'draw-free': ['driver=/__driver-draw.js&role=user&plan=free', DESKTOP],
  'draw-pro': ['driver=/__driver-draw.js&role=user&plan=premium', DESKTOP],
  'draw-sb-free': ['backend=supabase&driver=/__driver-draw.js&role=user&plan=free', DESKTOP],
  'draw-sb-pro': ['backend=supabase&driver=/__driver-draw.js&role=user&plan=premium', DESKTOP],
  'stats-free': ['driver=/__driver-stats.js&role=user&plan=free', DESKTOP],
  'stats-pro': ['driver=/__driver-stats.js&role=user&plan=premium', DESKTOP],
  'stats-phone': ['driver=/__driver-stats.js&role=user&plan=premium&phone=1', PHONE],
  'multi-pro': ['driver=/__driver-multi.js&role=user&plan=premium', DESKTOP],
  'multi-free': ['driver=/__driver-multi.js&role=user&plan=free', DESKTOP],
  'multi-phone': ['driver=/__driver-multi.js&role=user&plan=premium&phone=1', PHONE],
  'limit-free': ['backend=supabase&driver=/__driver-limit.js&role=user&plan=free&ct=ready&tlimit=3&tused=1', DESKTOP],
  'limit-race': ['backend=supabase&driver=/__driver-limit.js&role=user&plan=free&ct=ready&tlimit=3&tused=1&race=1', DESKTOP],
  'limit-pro': ['backend=supabase&driver=/__driver-limit.js&role=user&plan=premium&ct=ready&tlimit=3&tused=3', DESKTOP],
  'limit-phone': ['backend=supabase&driver=/__driver-limit.js&role=user&plan=free&ct=ready&tlimit=3&tused=1', PHONE],
  crypto: ['driver=/__driver-crypto.js&role=user&plan=free&i18n=tr', DESKTOP],
  'crypto-en': ['driver=/__driver-crypto.js&role=user&plan=free&i18n=en', DESKTOP],
  sections: ['driver=/__driver-sections.js&role=user&plan=premium&i18n=tr', DESKTOP],
  stage1: ['driver=/__driver-stage1.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'marks-pro': ['driver=/__driver-marks.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'marks-free': ['driver=/__driver-marks.js&role=user&plan=free&i18n=en', DESKTOP],
  'desk-pro': ['driver=/__driver-desk.js&role=user&plan=premium&i18n=tr', DESKTOP],
  orders: ['driver=/__driver-orders.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'orders-limit': ['backend=supabase&driver=/__driver-orders.js&role=user&plan=free&ct=ready&tlimit=2&tused=1&mode=limit&i18n=tr', DESKTOP],
  'desk-free': ['driver=/__driver-desk.js&role=user&plan=free&i18n=en', DESKTOP],
  'desk-phone': ['driver=/__driver-desk.js&role=user&plan=premium&phone=1&i18n=tr', PHONE],
  'stage1-de': ['driver=/__driver-stage1.js&role=user&plan=premium&i18n=de', DESKTOP],
  'sections-ct': ['backend=supabase&driver=/__driver-sections.js&role=user&plan=premium&ct=ready&i18n=en', DESKTOP],
  'draw-real-pro': ['driver=/__driver-draw2.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'draw-real-free': ['driver=/__driver-draw2.js&role=user&plan=free&i18n=en', DESKTOP],
  'draw-pan-pro': ['driver=/__driver-draw-pan.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'draw-pan-free': ['driver=/__driver-draw-pan.js&role=user&plan=free&i18n=en', DESKTOP],
  'draw-hline-pro': ['driver=/__driver-draw-hline.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'draw-hline-free': ['driver=/__driver-draw-hline.js&role=user&plan=free&i18n=en', DESKTOP],
  'draw-bar-pro': ['driver=/__driver-draw-bar.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'draw-bar-free': ['driver=/__driver-draw-bar.js&role=user&plan=free&i18n=en', DESKTOP],
  'shot-draw-bar': ['driver=/__driver-draw-bar.js&role=user&plan=premium&i18n=tr&shot=1', DESKTOP, true],
  'draw-win-pro': ['driver=/__driver-draw-win.js&role=user&plan=premium&i18n=tr', DESKTOP],
  'draw-win-free': ['driver=/__driver-draw-win.js&role=user&plan=free&i18n=en', DESKTOP],
  'shot-draw-hline': ['driver=/__driver-draw-hline.js&role=user&plan=premium&i18n=tr&shot=1', DESKTOP, true],
  'shot-draw-win': ['driver=/__driver-draw-win.js&role=user&plan=premium&i18n=tr', DESKTOP, true],
  // needs real 1m files in dist/__ctdata (tests/smoke/README.md); not in the default run
  'btc-repro': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1', DESKTOP, true],
  'btc-repro-ha': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1&style=heikin&vol=1', DESKTOP, true],
  'btc-repro-multi': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1&multi=2x2&vol=1', DESKTOP, true],
  'btc-repro-scroll': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1&scroll=-400', DESKTOP, true],
  'btc-repro-pz': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1&pz=1', DESKTOP, true],
  'btc-repro-line': ['backend=supabase&driver=/__driver-btcrepro.js&role=user&plan=premium&ct=ready&ctdata=1&style=line', DESKTOP, true],
  'plan-free': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=37&i18n=tr', DESKTOP],
  'plan-free-80': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=85&i18n=tr', DESKTOP],
  'plan-free-full': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=100&i18n=en', DESKTOP],
  'plan-free-ct': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&ct=ready&tlimit=100&tused=79&ctflow=1&i18n=tr', DESKTOP],
  'plan-pro': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=premium&tlimit=100&tused=150&pexp=2026-12-31T21:00:00Z&i18n=de', DESKTOP],
  'plan-free-en': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=37&i18n=en', DESKTOP],
  'plan-free-de': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=37&i18n=de', DESKTOP],
  'plan-phone': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=85&phone=1&i18n=tr', PHONE],
  'plan-norpc': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&m12=0&i18n=tr', DESKTOP],
  // screenshots only (use with --shots)
  'shot-plan-free': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=37&shot=1&i18n=tr', DESKTOP, true],
  'shot-plan-free-light': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=37&shot=1&light=1&i18n=tr', DESKTOP, true],
  'shot-plan-full': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=100&shot=1&i18n=en', DESKTOP, true],
  'shot-plan-pro-light': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=premium&tlimit=100&tused=150&pexp=2026-12-31T21:00:00Z&shot=1&light=1&i18n=de', DESKTOP, true],
  'shot-plan-phone': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=85&phone=1&shot=1&i18n=tr', PHONE, true],
  'shot-plan-phone-light': ['backend=supabase&driver=/__driver-plan.js&role=user&plan=free&tlimit=100&tused=85&phone=1&shot=1&light=1&i18n=tr', PHONE, true],
  'shot-drawer': ['driver=/__driver-shot.js&shot=drawer&plan=premium&i18n=tr', DESKTOP, true],
  'shot-sessions': ['driver=/__driver-shot.js&shot=sessions&plan=premium&i18n=tr', DESKTOP, true],
  'shot-sessions-light': ['driver=/__driver-shot.js&shot=sessions&plan=premium&i18n=de&light=1', DESKTOP, true],
  'shot-drawings': ['driver=/__driver-shot.js&shot=drawings&plan=premium&i18n=tr', DESKTOP, true],
  'shot-drawings-fs': ['driver=/__driver-shot.js&shot=drawings&fs=1&plan=premium&i18n=tr', DESKTOP, true],
  'shot-drawings-free-phone': ['driver=/__driver-shot.js&shot=drawings&plan=free&i18n=tr', PHONE, true],
  'shot-stats': ['driver=/__driver-stats.js&role=user&plan=premium&i18n=tr&big=1', { width: 1440, height: 1500 }, true],
  'shot-stats-free': ['driver=/__driver-stats.js&role=user&plan=free&i18n=en&big=1', { width: 1440, height: 1100 }, true],
  'shot-multi': ['driver=/__driver-shot.js&shot=multi&plan=premium&i18n=tr', DESKTOP, true],
  'shot-dock': ['driver=/__driver-shot.js&shot=dock&plan=premium&i18n=tr', DESKTOP, true],
  'shot-orders': ['driver=/__driver-shot.js&shot=orders&plan=premium&i18n=tr', DESKTOP, true],
  'shot-orders-phone': ['driver=/__driver-shot.js&shot=orders&plan=premium&i18n=tr', PHONE, true],
  'shot-draw': ['driver=/__driver-shot-draw.js&plan=premium&i18n=tr', DESKTOP, true],
  'shot-draw-light': ['driver=/__driver-shot-draw.js&plan=premium&i18n=en&light=1', DESKTOP, true],
  'shot-marks': ['driver=/__driver-marks.js&role=user&plan=premium&i18n=tr&shot=chart', DESKTOP, true],
  'shot-marks-stats': ['driver=/__driver-marks.js&role=user&plan=premium&i18n=tr&max=1', { width: 1440, height: 1100 }, true],
  'shot-acc-create': ['driver=/__driver-shot-acc.js&role=user&plan=premium&i18n=tr&tab=data', DESKTOP, true],
  'shot-acc-ct-data': ['backend=supabase&driver=/__driver-shot-acc.js&role=user&plan=premium&ct=ready&i18n=tr&mode=edit&tab=data&tip=1', DESKTOP, true],
  'shot-acc-ct-trading': ['backend=supabase&driver=/__driver-shot-acc.js&role=user&plan=premium&ct=ready&i18n=en&mode=edit&tab=trading&tip=1', DESKTOP, true],
  'shot-acc-light': ['driver=/__driver-shot-acc.js&role=user&plan=free&i18n=de&mode=edit&tab=danger&light=1', DESKTOP, true],
  'shot-acc-phone': ['backend=supabase&driver=/__driver-shot-acc.js&role=user&plan=premium&ct=ready&i18n=tr&mode=edit&tab=data', PHONE, true],
  'shot-dock-stats-fs': ['driver=/__driver-shot.js&shot=dock-stats-fs&plan=premium&i18n=tr', { width: 1440, height: 1100 }, true],
  'shot-limit': ['backend=supabase&driver=/__driver-limit.js&role=user&plan=free&ct=ready&tlimit=100&tused=37&race=1&i18n=tr', DESKTOP, true],
  'shot-drawer-free': ['driver=/__driver-shot.js&shot=drawer&plan=free&i18n=en', DESKTOP, true],
  'shot-simple': ['driver=/__driver-shot.js&shot=simple&plan=free', DESKTOP, true],
  'shot-advanced': ['driver=/__driver-shot.js&shot=advanced&plan=premium', DESKTOP, true],
  'shot-fs': ['driver=/__driver-shot.js&shot=fs&plan=premium', DESKTOP, true],
  'shot-light': ['driver=/__driver-shot.js&shot=advanced&light=1', DESKTOP, true],
  'shot-phone': ['driver=/__driver-shot.js&shot=simple&plan=free', PHONE, true],
  'shot-phone-fs': ['driver=/__driver-shot.js&shot=fs', PHONE, true]
};

const args = process.argv.slice(2);
let shots = null;
const si = args.indexOf('--shots');
if (si >= 0) { shots = path.resolve(args[si + 1]); args.splice(si, 2); fs.mkdirSync(shots, { recursive: true }); }
const names = args.length ? args : Object.keys(SCENARIOS).filter((n) => !SCENARIOS[n][2]);

// harness files next to the build (dist/ is not in git)
for (const f of fs.readdirSync('tests/smoke')) if (/^driver-.*\.js$/.test(f)) fs.copyFileSync(path.join('tests/smoke', f), path.join(DIST, '__' + f));
fs.copyFileSync('tests/smoke/driver-base.js', path.join(DIST, '__driver.js'));
fs.copyFileSync('tests/helpers/fake-supabase.js', path.join(DIST, '__fakedb.mjs'));
// real 1m month files for ?ctdata=1 (btc-repro): CTDATA=<folder with YYYY-MM.json>
if (process.env.CTDATA) { fs.mkdirSync(path.join(DIST, '__ctdata'), { recursive: true }); for (const f of fs.readdirSync(process.env.CTDATA)) if (/^\d{4}-\d{2}\.json$/.test(f)) fs.copyFileSync(path.join(process.env.CTDATA, f), path.join(DIST, '__ctdata', f)); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = await new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0, '127.0.0.1', () => resolve(s));
});
const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
let failed = 0;
for (const name of names) {
  const sc = SCENARIOS[name];
  if (!sc) { console.log('unknown scenario', name); failed++; continue; }
  const ctx = await browser.createBrowserContext();             // fresh localStorage per scenario
  const page = await ctx.newPage();
  await page.setViewport(sc[1]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message || e) + (process.env.STACKS ? ' :: ' + String(e && e.stack || '').slice(0, 900) : '')));
  // trusted input for drivers (real mouse and keyboard through the browser, like a user): await window.__pp({ op, ... })
  //   move {x, y, steps}, down / up {button}, click {x, y, count, button}, wheel {x, y, dy}, key {key, type: 'down'|'up'|'press'}
  await page.exposeFunction('__pp', async (c) => {
    const m = page.mouse, k = page.keyboard;
    if (c.op === 'move') await m.move(c.x, c.y, { steps: c.steps || 1 });
    else if (c.op === 'down') await m.down({ button: c.button || 'left', clickCount: c.count || 1 });
    else if (c.op === 'up') await m.up({ button: c.button || 'left', clickCount: c.count || 1 });
    else if (c.op === 'click') await m.click(c.x, c.y, { button: c.button || 'left', count: c.count || 1, delay: c.delay || 0 });
    else if (c.op === 'wheel') { await m.move(c.x, c.y); await m.wheel({ deltaY: c.dy || 0, deltaX: c.dx || 0 }); }
    else if (c.op === 'type') await k.type(c.text, { delay: 10 });
    else if (c.op === 'key') { if (c.type === 'down') await k.down(c.key); else if (c.type === 'up') await k.up(c.key); else await k.press(c.key); }
    return true;
  });
  const url = `http://127.0.0.1:${port}/__bt.html${sc[0] ? '?' + sc[0] : ''}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  let text = '';
  try {
    await page.waitForFunction(() => /DONE$/.test((document.getElementById('bt-smoke-result') || {}).textContent || ''), { timeout: 240000, polling: 250 });
    text = await page.$eval('#bt-smoke-result', (e) => e.textContent);
  } catch (e) { text = 'TIMEOUT waiting for DONE'; }
  if (shots) await page.screenshot({ path: path.join(shots, name + '.png'), fullPage: false });
  const lines = text.split('\n').filter(Boolean);
  const bad = lines.filter((l) => /^(FAIL|TIMEOUT|EXCEPTION|JSERROR)/.test(l)).concat(errors.map((e) => 'PAGEERROR ' + e));
  const pass = lines.filter((l) => l.startsWith('PASS')).length;
  console.log(`\n== ${name}: ${pass} pass, ${bad.length} problems (${Math.round((Date.now() - t0) / 1000)}s)`);
  for (const l of bad) console.log('  ' + l.slice(0, 600));
  if (process.env.VERBOSE) for (const l of lines) console.log('  ' + l.slice(0, 300));
  if (bad.length || !pass) failed++;
  await ctx.close();
}
await browser.close();
srv.close();
console.log(failed ? `\nSMOKE: ${failed} scenario(s) with problems` : '\nSMOKE: all scenarios passed');
process.exit(failed ? 1 : 0);
