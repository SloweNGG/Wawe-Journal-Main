// Differential page check (documentation tooling, not part of `node --test`): renders the REAL built pages of an
// "old" build (before the live-only change) and the "new" build in headless Chrome against an in-memory database
// and compares what the user sees. The new build must show exactly the old numbers, with or without backtest rows.
// Usage: PG_MODULE_DIR=<dir with node_modules/puppeteer-core> node run.mjs <old dist> <new dist> <out dir> [page,page,...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeData, FIXED_NOW, USER_ID, J1, J2 } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const puppeteer = require('puppeteer-core');
const [oldDist, newDist, outDir, pagesArg] = process.argv.slice(2);
const PAGES = (pagesArg || 'dashboard,premium-dashboard,trades,calendar,strategies,journals').split(',');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const emulator = fs.readFileSync(path.join(here, 'emulator.js'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve(dist) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      let f = path.join(dist, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = fs.existsSync(f + '.html') ? f + '.html' : null;
      if (!f) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close() }));
  });
}

const FREEZE = `(function(){var FIXED=${FIXED_NOW};var R=Date;function F(){if(!(this instanceof F))return new R(FIXED).toString();var a=[].slice.call(arguments);if(a.length===0)return new R(FIXED);return new (Function.prototype.bind.apply(R,[null].concat(a)))();}F.prototype=R.prototype;F.now=function(){return FIXED};F.UTC=R.UTC;F.parse=R.parse;window.Date=F;})();`;

// premium-dashboard sometimes renders in Turkish (a pre-existing locale race); the dataset is ASCII, so retry until English
async function snapshot(browser, port, page, data, flags, extra) {
  let r;
  for (let i = 0; i < 5; i++) { r = await snapshotOnce(browser, port, page, data, flags, extra); if (!/[ğüşıöçĞÜŞİÖÇ]/.test(r.text)) break; }
  return r;
}
async function snapshotOnce(browser, port, page, data, flags, extra) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  await pg.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  await pg.setRequestInterception(true);
  pg.on('request', (rq) => {
    const u = rq.url();
    if (u.startsWith('http://127.0.0.1')) return rq.continue();
    if (/@supabase\/supabase-js/.test(u)) return rq.respond({ status: 200, contentType: 'text/javascript', body: '/* stub: window.supabase is installed by the emulator */' });
    if (/supabase\.co|turnstile|challenges\.cloudflare|google-analytics|googletagmanager/.test(u)) return rq.abort();
    return rq.continue();
  });
  const user = { id: USER_ID, email: 't@example.com', app_metadata: { role: 'user' }, user_metadata: { username: 'tester' } };
  await pg.evaluateOnNewDocument(`window.__DATA=${JSON.stringify(data)};window.__FLAGS=${JSON.stringify(flags)};window.__USER=${JSON.stringify(user)};try{localStorage.setItem('ww_onboarding_done','1');localStorage.setItem('ww_language','en');}catch(e){}`);
  await pg.evaluateOnNewDocument(FREEZE);
  await pg.evaluateOnNewDocument(emulator);
  await pg.goto(`http://127.0.0.1:${port}/${page}.html`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  // the locale file loads asynchronously: wait until the page is really translated so both builds are compared in the same language
  await pg.waitForFunction(() => window.i18n && window.i18n.getCurrentLanguage && window.i18n.getCurrentLanguage() === 'en' && !!document.querySelector('[data-i18n]') &&
    Array.from(document.querySelectorAll('main [data-i18n]')).slice(0, 6).every((e) => !/[ğüşıöçĞÜŞİÖÇ]/.test(e.textContent)), { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (extra) await extra(pg);
  const out = await pg.evaluate(() => {
    const m = document.querySelector('main') || document.body;
    const txt = (m.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    return { title: document.title, text: txt, rows: document.querySelectorAll('main tbody tr').length, calls: (window.__calls || []).length };
  });
  out.errors = errors;
  await ctx.close();
  return out;
}

// the trades page gained a source selector (All / Live / Backtest): drop exactly those three option lines before comparing numbers
function normalize(page, text) {
  if (page !== 'trades') return text;
  const L = text.split('\n');
  for (let i = 0; i + 2 < L.length; i++) if (L[i] === 'All' && L[i + 1] === 'Live' && L[i + 2] === 'Backtest') { L.splice(i, 3); break; }
  return L.join('\n');
}
const statOf = (text, label) => { const L = text.split('\n'); const i = L.indexOf(label); return i >= 0 ? L[i + 1] : '?'; };

function diffLines(a, b, max = 14) {
  const A = a.split('\n'), B = b.split('\n'), out = [];
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n && out.length < max; i++) if (A[i] !== B[i]) out.push(`  line ${i + 1}\n    old: ${A[i]}\n    new: ${B[i]}`);
  return out.join('\n');
}

fs.mkdirSync(outDir, { recursive: true });
const oldSrv = await serve(oldDist), newSrv = await serve(newDist);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
let fails = 0;
const log = (s) => { console.log(s); };
try {
  const live = makeData({ backtest: false }), withBt = makeData({ backtest: true });
  for (const page of PAGES) {
    const base1 = await snapshot(browser, oldSrv.port, page, live, {});
    const base2 = await snapshot(browser, oldSrv.port, page, live, {});
    const nLive = await snapshot(browser, newSrv.port, page, live, { rpcLiveOnly: true });
    const nBt = await snapshot(browser, newSrv.port, page, withBt, { rpcLiveOnly: true });
    for (const [k, v] of Object.entries({ 'old-live': base1, 'new-live': nLive, 'new-live+backtest': nBt })) fs.writeFileSync(path.join(outDir, `${page}.${k}.txt`), v.text);
    const stable = base1.text === base2.text;
    const sameNoBt = base1.text === normalize(page, nLive.text);
    const sameBt = base1.text === normalize(page, nBt.text);
    const empty = base1.text.length < 150;
    // sensitivity: with the live filter switched off, backtest rows leak into the page and the comparison MUST notice
    const leak = await snapshot(browser, newSrv.port, page, withBt, { rpcLiveOnly: false, ignoreLiveOr: true });
    // the trades page filters on the client (it loads every source for its selector), so the server-side switch cannot leak there:
    // its sensitivity is checked by the scope counts below instead
    const sensitive = page === 'trades' ? true : base1.text !== normalize(page, leak.text);
    const newErrs = nLive.errors.filter((e) => !base1.errors.includes(e)), newErrsBt = nBt.errors.filter((e) => !base1.errors.includes(e));
    const ok = stable && sameNoBt && sameBt && !empty && sensitive && !newErrs.length && !newErrsBt.length;
    if (!ok) fails++;
    log(`${ok ? 'PASS' : 'FAIL'} ${page}: baseline stable=${stable} (${base1.text.length} chars, ${base1.rows} rows), new==old without backtest rows=${sameNoBt}, new==old with 30 backtest rows=${sameBt}, new JS errors=${newErrs.length + newErrsBt.length}, check sees a leak=${sensitive}`);
    if (empty) log('  the baseline page rendered almost nothing (harness problem)');
    if (!stable) log('  baseline differs between two old runs:\n' + diffLines(base1.text, base2.text));
    if (!sameNoBt) log('  NEW vs OLD (live only):\n' + diffLines(base1.text, normalize(page, nLive.text)));
    if (!sameBt) log('  NEW with backtest rows vs OLD live only:\n' + diffLines(base1.text, normalize(page, nBt.text)));
    if (newErrs.length || newErrsBt.length) log('  new errors: ' + JSON.stringify([...newErrs, ...newErrsBt]));
  }
  // trades page: the scope selector against the new build with backtest rows
  const scopeRows = async (scope) => (await snapshot(browser, newSrv.port, 'trades', withBt, { rpcLiveOnly: true }, async (pg) => {
    await pg.select('#scope-filter', scope); await new Promise((r) => setTimeout(r, 1500));
  }));
  if (PAGES.includes('trades')) {
    for (const scope of ['live', 'all', 'backtest']) {
      const s = await scopeRows(scope);
      const badges = (s.text.match(/Backtest/g) || []).length;
      log(`INFO trades scope=${scope}: TRADE COUNT ${statOf(s.text, 'TRADE COUNT')}, TOTAL P&L ${statOf(s.text, 'TOTAL P&L')}, ${s.rows} rows on page 1, "Backtest" appears ${badges} times in the main area`);
      fs.writeFileSync(path.join(outDir, `trades.scope-${scope}.txt`), s.text);
      const want = { live: '107', all: '137', backtest: '30' }[scope];
      if (statOf(s.text, 'TRADE COUNT') !== want) { fails++; log(`FAIL trades scope=${scope}: expected TRADE COUNT ${want}`); }
    }
  }
} finally {
  await browser.close(); oldSrv.close(); newSrv.close();
}
log(fails ? `\n${fails} page(s) differ` : '\nall pages identical');
process.exit(fails ? 1 : 0);
