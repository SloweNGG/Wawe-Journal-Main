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
  // screenshots only (use with --shots)
  'shot-drawer': ['driver=/__driver-shot.js&shot=drawer&plan=premium&i18n=tr', DESKTOP, true],
  'shot-sessions': ['driver=/__driver-shot.js&shot=sessions&plan=premium&i18n=tr', DESKTOP, true],
  'shot-sessions-light': ['driver=/__driver-shot.js&shot=sessions&plan=premium&i18n=de&light=1', DESKTOP, true],
  'shot-drawings': ['driver=/__driver-shot.js&shot=drawings&plan=premium&i18n=tr', DESKTOP, true],
  'shot-drawings-fs': ['driver=/__driver-shot.js&shot=drawings&fs=1&plan=premium&i18n=tr', DESKTOP, true],
  'shot-drawings-free-phone': ['driver=/__driver-shot.js&shot=drawings&plan=free&i18n=tr', PHONE, true],
  'shot-stats': ['driver=/__driver-stats.js&role=user&plan=premium&i18n=tr&big=1', { width: 1440, height: 1500 }, true],
  'shot-stats-free': ['driver=/__driver-stats.js&role=user&plan=free&i18n=en&big=1', { width: 1440, height: 1100 }, true],
  'shot-multi': ['driver=/__driver-shot.js&shot=multi&plan=premium&i18n=tr', DESKTOP, true],
  'shot-drawer-free': ['driver=/__driver-shot.js&shot=drawer&plan=free&i18n=en', DESKTOP, true],
  'shot-simple': ['driver=/__driver-shot.js&shot=simple', DESKTOP, true],
  'shot-advanced': ['driver=/__driver-shot.js&shot=advanced&plan=premium', DESKTOP, true],
  'shot-fs': ['driver=/__driver-shot.js&shot=fs&plan=premium', DESKTOP, true],
  'shot-light': ['driver=/__driver-shot.js&shot=advanced&light=1', DESKTOP, true],
  'shot-phone': ['driver=/__driver-shot.js&shot=simple', PHONE, true],
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
  page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
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
