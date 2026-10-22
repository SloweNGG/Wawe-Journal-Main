// Per-journal trade_scope check (documentation tooling, not part of `node --test`): renders the REAL built pages against the
// in-memory database for journals.trade_scope = live | all | backtest and checks the numbers each page shows.
//   live     -> the pages show exactly the live rows (pagecheck run.mjs proves this is identical to the old build)
//   all      -> live + backtest rows; "Backtest included" label on dashboard and premium dashboard
//   backtest -> backtest rows only; "Backtest only" label
// The prop firm card/banner must be IDENTICAL in every scope (prop counts live trades only).
// Usage: PG_MODULE_DIR=<dir with node_modules/puppeteer-core> node scope-check.mjs <dist> <out dir> [page,page,...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeData, FIXED_NOW, USER_ID, J1 } from './data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const puppeteer = require('puppeteer-core');
const [dist, outDir, pagesArg] = process.argv.slice(2);
const PAGES = (pagesArg || 'dashboard,premium-dashboard,calendar,strategies,trades,journals').split(',');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const emulator = fs.readFileSync(path.join(here, 'emulator.js'), 'utf8');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const FREEZE = `(function(){var FIXED=${FIXED_NOW};var R=Date;function F(){if(!(this instanceof F))return new R(FIXED).toString();var a=[].slice.call(arguments);if(a.length===0)return new R(FIXED);return new (Function.prototype.bind.apply(R,[null].concat(a)))();}F.prototype=R.prototype;F.now=function(){return FIXED};F.UTC=R.UTC;F.parse=R.parse;window.Date=F;})();`;

function serve(root) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
      let f = path.join(root, p);
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = fs.existsSync(f + '.html') ? f + '.html' : null;
      if (!f) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    }).listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, close: () => srv.close() }));
  });
}

// the data set: 120 live rows (J1 + J2) and 30 backtest mirrors in J1; J1 carries a prop firm account
function dataFor(scope) {
  const d = makeData({ backtest: true });
  d.journals[0].trade_scope = scope;
  d.prop_accounts = [{ id: '66666666-6666-4666-8666-000000000001', user_id: USER_ID, journal_id: J1, template_key: 'ftmo-2step', template_version: '1', phase_index: 0, starting_balance: 100000,
    start_date: '2026-01-01', reset_tz: 'Europe/Prague', time_shift_hours: 0, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    rules: { profit_target_pct: 10, daily_loss_limit_pct: 5, daily_loss_amount_base: 'initial_balance', max_loss_limit_pct: 10, max_loss_type: 'static', min_trading_days: 4, consistency_rule: { enabled: false }, phase_name: 'Challenge', verified: true } }];
  return d;
}

async function snapshot(browser, port, page, scope, extra) {
  const ctx = await browser.createBrowserContext(); const pg = await ctx.newPage();
  await pg.setViewport({ width: 1440, height: 1000 });
  const errors = []; pg.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  await pg.setRequestInterception(true);
  pg.on('request', (rq) => { const u = rq.url();
    if (u.startsWith('http://127.0.0.1')) return rq.continue();
    if (/@supabase\/supabase-js/.test(u)) return rq.respond({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
    if (/supabase\.co|turnstile|challenges\.cloudflare|google-analytics|googletagmanager/.test(u)) return rq.abort();
    return rq.continue(); });
  const user = { id: USER_ID, email: 't@example.com', app_metadata: { role: 'user' }, user_metadata: { username: 'tester' } };
  await pg.evaluateOnNewDocument(`window.__DATA=${JSON.stringify(dataFor(scope))};window.__FLAGS={rpcLiveOnly:true};window.__USER=${JSON.stringify(user)};try{localStorage.setItem('ww_onboarding_done','1');localStorage.setItem('ww_language','en');localStorage.setItem('ww_active_journal_id','${J1}');}catch(e){}`);
  await pg.evaluateOnNewDocument(FREEZE); await pg.evaluateOnNewDocument(emulator);
  await pg.goto(`http://127.0.0.1:${port}/${page}.html`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));
  await pg.waitForFunction(() => window.i18n && window.i18n.getCurrentLanguage && window.i18n.getCurrentLanguage() === 'en', { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (extra) await extra(pg);
  const out = await pg.evaluate(() => {
    const m = document.querySelector('main') || document.body;
    const txt = (m.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    const badge = document.querySelector('#scope-badge');
    const prop = Array.from(document.querySelectorAll('[id*="prop"],[class*="prop-"]')).map((e) => (e.innerText || '').trim()).filter(Boolean);
    return { text: txt, rows: document.querySelectorAll('main tbody tr').length, badge: badge && !badge.hidden && badge.offsetParent !== null ? badge.textContent.trim() : '', prop: [...new Set(prop)].join(' | ') };
  });
  out.errors = errors; await ctx.close(); return out;
}

const statOf = (text, label) => { const L = text.split('\n'); const i = L.indexOf(label); return i >= 0 ? L[i + 1] : '?'; };
fs.mkdirSync(outDir, { recursive: true });
const srv = await serve(dist);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
let fails = 0; const log = (s) => console.log(s);
const check = (name, cond, extra) => { if (!cond) fails++; log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`); };
try {
  const R = {};
  for (const page of PAGES) for (const scope of ['live', 'all', 'backtest']) {
    const s = await snapshot(browser, srv.port, page, scope, page === 'trades' ? async (pg) => { await new Promise((r) => setTimeout(r, 500)); } : undefined);
    R[`${page}:${scope}`] = s; fs.writeFileSync(path.join(outDir, `${page}.${scope}.txt`), s.text); fs.writeFileSync(path.join(outDir, `${page}.${scope}.prop.txt`), s.prop);
    log(`INFO ${page} scope=${scope}: rows=${s.rows} badge="${s.badge}" errors=${s.errors.length}`);
  }
  const g = (page, scope) => R[`${page}:${scope}`];
  const want = { live: '107', all: '137', backtest: '30' };   // J1 trade counts (data.mjs: 107 live rows in J1, 30 backtest mirrors)
  for (const page of ['dashboard', 'premium-dashboard', 'trades']) {
    if (!PAGES.includes(page)) continue;
    const label = page === 'trades' ? 'TRADE COUNT' : 'TOTAL TRADES';
    for (const scope of ['live', 'all', 'backtest']) {
      check(`${page} ${scope}: ${label} = ${want[scope]}`, statOf(g(page, scope).text, label) === want[scope], `got ${statOf(g(page, scope).text, label)}`);
    }
  }
  for (const page of ['dashboard', 'premium-dashboard']) {
    if (!PAGES.includes(page)) continue;
    check(`${page}: label hidden for live`, g(page, 'live').badge === '', g(page, 'live').badge);
    check(`${page}: label "Backtest included" for all`, g(page, 'all').badge === 'Backtest included', g(page, 'all').badge);
    check(`${page}: label "Backtest only" for backtest`, g(page, 'backtest').badge === 'Backtest only', g(page, 'backtest').badge);
  }
  for (const page of ['dashboard', 'premium-dashboard', 'calendar', 'strategies']) {
    if (!PAGES.includes(page)) continue;
    const a = g(page, 'live').text, b = g(page, 'all').text, c = g(page, 'backtest').text;
    check(`${page}: all and backtest differ from live, and from each other`, a !== b && a !== c && b !== c);
  }
  for (const page of ['dashboard', 'premium-dashboard']) {
    if (!PAGES.includes(page)) continue;
    // the premium header sits inside a "prop" element: drop the page-data parts that legitimately follow the scope (trade count line, label)
    // (the premium page sometimes renders in Turkish and then lacks the English disclaimer date: the pre-existing locale race,
    //  so compare the dollar amounts only, in order)
    const norm = (t) => (t.match(/[+\-−]?\$[\d.,]+/g) || []).join(' ');
    const p0 = norm(g(page, 'live').prop);
    check(`${page}: prop firm card has content`, p0.length > 20, p0.slice(0, 80));
    check(`${page}: prop firm card identical in live / all / backtest`, norm(g(page, 'all').prop) === p0 && norm(g(page, 'backtest').prop) === p0);
  }
  if (PAGES.includes('journals')) {
    // list_journals cards: the first card's total P&L follows the scope (live 3,859.20 / all 18,859.20 / backtest 15,000.00)
    const pnl = (t) => { const m = t.match(/Ana Hesap[\s\S]*?(\+?\$[\d.,]+)/); return m ? m[1] : '?'; };
    log(`INFO journals card P&L: live=${pnl(g('journals', 'live').text)} all=${pnl(g('journals', 'all').text)} backtest=${pnl(g('journals', 'backtest').text)}`);
    check('journals: first card P&L follows the scope', pnl(g('journals', 'live').text) === '+$3.859,20' && pnl(g('journals', 'all').text) === '+$18.859,20' && pnl(g('journals', 'backtest').text) === '+$15.000,00');
  }
  const errs = Object.entries(R).filter(([, v]) => v.errors.length);
  check('no JS errors on any page', errs.length === 0, errs.map(([k, v]) => k + ': ' + v.errors.join(';')).join(' / '));
} finally { await browser.close(); srv.close(); }
log(fails ? `\n${fails} check(s) failed` : '\nall scope checks passed');
process.exit(fails ? 1 : 0);
