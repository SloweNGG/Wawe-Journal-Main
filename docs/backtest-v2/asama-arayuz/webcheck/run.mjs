// Signed-in browser check of the Backtest page against a BUILT or LIVE site (documentation tooling, not part of `node --test`).
// Real pages and scripts, fake session and database: the supabase-js CDN script is replaced by the pagecheck emulator
// (../../asama-senkron-istatistik/pagecheck/emulator.js) and every supabase.co request is aborted, so nothing is written anywhere.
// It covers what `curl` cannot: navbar link for a non-admin, SPA navigation from the dashboard, creating a synthetic account,
// the labels, a direct load and a reload with the service worker active, 4xx/5xx and page errors.
// Usage: PG_MODULE_DIR=<dir with node_modules/puppeteer-core> node run.mjs <base url> [role=user|admin] [plan=free|premium]
// Optional: SHOTS=<dir> saves screenshots; LANG_CODE=tr|de renders another language (the text assertions are English, so use it for screenshots only).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeData, USER_ID } from '../../asama-senkron-istatistik/pagecheck/data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const puppeteer = require('puppeteer-core');
const [base, role = 'user', plan = 'free'] = process.argv.slice(2);
if (!base) throw new Error('usage: node run.mjs <base url> [role] [plan]');
const origin = new URL(base).origin;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const emulator = fs.readFileSync(path.join(here, '../../asama-senkron-istatistik/pagecheck/emulator.js'), 'utf8');

const results = [];
const ok = (name, cond, extra) => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ' :: ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.SHOTS;   // optional: a directory for screenshots (list, form, replay, edit)
const LANG = process.env.LANG_CODE || 'en';

const data = makeData();
data.user_profiles[0].plan = plan; data.user_profiles[0].role = role;
data.backtest_accounts = []; data.backtest_account_trades = [];
const user = { id: USER_ID, email: 't@example.com', app_metadata: { role }, user_metadata: { username: 'tester' } };
// column defaults of the real tables (the emulator inserts the payload as is)
const DEFAULTS = `(function(){var e=window.__emu,of=e.from;e.from=function(t){var b=of(t);if(t==='backtest_accounts'||t==='backtest_account_trades'){var oi=b.insert;b.insert=function(p){var now=new Date().toISOString();var add=function(r){return Object.assign({is_active:true,created_at:now,updated_at:now,data_source:'synthetic',journal_id:null,exit_ambiguous:false,commission:'0.00'},r)};return oi.call(b,Array.isArray(p)?p.map(add):add(p))};}return b};})();`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  await pg.setViewport({ width: 1440, height: 1000 });
  const errors = [], bad = [];
  pg.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0]));
  pg.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(origin, '')}`); });
  await pg.setRequestInterception(true);
  pg.on('request', (rq) => {
    const u = rq.url();
    if (/@supabase\/supabase-js/.test(u)) return rq.respond({ status: 200, contentType: 'text/javascript', body: '/* stub */' });
    if (/supabase\.co|turnstile|challenges\.cloudflare|google-analytics|googletagmanager/.test(u)) return rq.abort();
    return rq.continue();
  });
  await pg.evaluateOnNewDocument(`window.__DATA=${JSON.stringify(data)};window.__FLAGS={};window.__USER=${JSON.stringify(user)};try{localStorage.setItem('ww_onboarding_done','1');localStorage.setItem('ww_language','${LANG}');sessionStorage.setItem('ww_user_id',${JSON.stringify(USER_ID)});}catch(e){}`);
  await pg.evaluateOnNewDocument(emulator);
  await pg.evaluateOnNewDocument(DEFAULTS);
  const vis = (sel) => pg.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }, sel);
  const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await sleep(400); await pg.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
  const text = (sel) => pg.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
  const waitSel = (sel, ms = 20000) => pg.waitForFunction((s) => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null; }, { timeout: ms }, sel).then(() => true).catch(() => false);

  // 1. dashboard first (a normal landing), navbar link for this role
  await pg.goto(`${base.replace(/\/$/, '')}/dashboard.html`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await sleep(2500);
  ok(`${role}/${plan}: dashboard loads (navbar present)`, await vis('#nav-backtest-link') || (await pg.$('#nav-backtest-link')) !== null);
  ok(`${role}: navbar Backtest link is visible`, await vis('#nav-backtest-link'), await pg.evaluate(() => { const l = document.getElementById('nav-backtest-link'); return l ? getComputedStyle(l).display : 'missing'; }));
  // 2. SPA navigation to the backtest page by clicking the link
  await pg.evaluate(() => document.getElementById('nav-backtest-link').click());
  const listShown = await waitSel('#bt-view-list');
  ok('click on the link opens the Backtest list (SPA)', listShown && /\/backtest/.test(pg.url()), pg.url());
  await shot('list-empty');
  ok('no "coming soon" screen', (await pg.$('#bt-view-soon')) === null);
  const banner = await text('.bt-banner-test');
  ok('list banner: synthetic, not real market data, saved in the user account', /synthetic/i.test(banner || '') && /not real market data/i.test(banner || '') && /user account/i.test(banner || '') && !/in this browser/i.test(banner || ''), banner);
  ok('quota label', /0\/(1|10)/.test((await text('#bt-quota')) || ''), await text('#bt-quota'));
  // 3. new account form
  await pg.evaluate(() => document.getElementById('bt-new-account-btn').click());
  await pg.waitForFunction(() => document.getElementById('bt-account-modal').classList.contains('active') && document.getElementById('bt-f-start').value, { timeout: 20000 }).catch(() => {});
  const src = await pg.evaluate(() => ({ s: document.getElementById('bt-f-source-synthetic'), c: document.getElementById('bt-f-source-ctrader') }) && ({
    synChecked: document.getElementById('bt-f-source-synthetic').checked, synDisabled: document.getElementById('bt-f-source-synthetic').disabled,
    ctDisabled: document.getElementById('bt-f-source-ctrader').disabled, ctChecked: document.getElementById('bt-f-source-ctrader').checked,
    wrap: document.getElementById('bt-f-source-wrap').textContent.replace(/\s+/g, ' '), journalHidden: document.getElementById('bt-f-journal-wrap').hidden }));
  ok('form: "Synthetic data (practice)" selected and enabled', src.synChecked && !src.synDisabled && /Synthetic data \(practice\)/.test(src.wrap), src.wrap.slice(0, 120));
  ok('form: "cTrader data" visible, disabled, "Coming soon"', src.ctDisabled && !src.ctChecked && /cTrader data/.test(src.wrap) && /Coming soon/.test(src.wrap));
  ok('form: journal selection hidden', src.journalHidden);
  await shot('form-create');
  await pg.type('#bt-f-name', 'Webcheck');
  await pg.evaluate(() => document.getElementById('bt-account-submit').click());
  const replay = await pg.waitForFunction(() => document.getElementById('bt-view-replay').getAttribute('data-replay') === 'ready', { timeout: 60000 }).then(() => true).catch(() => false);
  ok('synthetic account created and replay opens with candles', replay && (await pg.$('#bt-chart canvas')) !== null);
  const row = await pg.evaluate(() => (window.__DATA.backtest_accounts || [])[0] || null);
  ok('stored row: data_source synthetic, no journal, own user', !!row && row.data_source === 'synthetic' && row.journal_id === null && row.user_id === USER_ID, row && JSON.stringify({ ds: row.data_source, j: row.journal_id }));
  await sleep(1500); await shot('replay');
  const lab = await text('#bt-source-label');
  ok('chart label says synthetic, not real market data', await vis('#bt-source-label') && /Synthetic data, not real market data/.test(lab || ''), lab);
  // 4. list card, edit form
  await pg.evaluate(() => document.getElementById('bt-back-btn').click());
  await waitSel('#bt-view-list');
  const card = await pg.evaluate(() => { const c = document.querySelector('.bt-account-card[data-id]'); return c ? { src: (c.querySelector('.bt-source') || {}).textContent, text: c.textContent } : null; });
  await shot('list-card');
  ok('card shows the synthetic label and no linked-account row', !!card && /Synthetic data, not real market data/.test(card.src || '') && !/Linked account/.test(card.text));
  ok('quota shows 1/' + (plan === 'premium' ? 10 : 1), new RegExp('1/' + (plan === 'premium' ? 10 : 1)).test((await text('#bt-quota')) || ''), await text('#bt-quota'));
  await pg.evaluate(() => document.querySelector('.bt-account-card button[data-act="settings"]').click());
  await pg.waitForFunction(() => document.getElementById('bt-account-modal').classList.contains('active'), { timeout: 10000 }).catch(() => {});
  const ed = await pg.evaluate(() => ({ locked: document.getElementById('bt-f-source-synthetic').disabled && document.getElementById('bt-f-source-ctrader').disabled,
    note: !document.getElementById('bt-f-source-note').hidden, journalHidden: document.getElementById('bt-f-journal-wrap').hidden }));
  await shot('form-edit');
  ok('settings: source locked with a note, journal hidden', ed.locked && ed.note && ed.journalHidden);
  await pg.evaluate(() => document.getElementById('bt-account-cancel').click());
  // 5. direct load and reload (service worker active after the first visits)
  await sleep(1500);
  const swActive = await pg.evaluate(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then((r) => r.length) : -1);
  for (const how of ['direct', 'reload']) {
    if (how === 'direct') await pg.goto(`${base.replace(/\/$/, '')}/backtest.html`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    else await pg.reload({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    const shown = await waitSel('#bt-view-list', 25000);
    ok(`${how} load of /backtest.html shows the list (service workers: ${swActive})`, shown && (await pg.$('#bt-view-soon')) === null && /Backtest/.test(await pg.title()), await pg.title());
  }
  // 6. other pages still load
  for (const p of ['dashboard', 'trades', 'journals', 'strategies', 'calendar']) {
    await pg.goto(`${base.replace(/\/$/, '')}/${p}.html`, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await sleep(1200);
    ok(`${p} loads with its navbar`, (await pg.$('#nav-backtest-link')) !== null && (await pg.evaluate(() => (document.querySelector('main') || document.body).innerText.length)) > 50);
  }
  ok('no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  const realBad = bad.filter((b) => !/favicon|\.map$/.test(b));
  ok('no 4xx/5xx from the site itself', realBad.length === 0, realBad.slice(0, 6).join(' | '));
} catch (e) {
  results.push('EXCEPTION ' + (e && e.stack || e));
} finally {
  await browser.close().catch(() => {});
  console.log(results.join('\n'));
  const failed = results.filter((l) => /^(FAIL|EXCEPTION)/.test(l)).length;
  console.log(`RESULT ${base} ${role}/${plan}: ${results.filter((l) => l.startsWith('PASS')).length} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}
