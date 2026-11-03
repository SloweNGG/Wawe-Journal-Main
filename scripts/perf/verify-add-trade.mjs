// ============================================================
// ADD-TRADE SAYFASI: DOĞRUDAN AÇILIŞ VE SPA GEÇİŞİ — scripts/perf/verify-add-trade.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı. Sayfa iki yoldan açılır: doğrudan (/add-trade.html: yenileme,
// yer imi) ve SPA geçişi (settings → wwOpenAddTrade, Hızlı Ekle olmayan sayfalardaki "+" / "N"). Her yolda üç akış uçtan
// uca denenir ve sahte arka uca giden kayıtlar kontrol edilir:
//   T  tek işlem formu (sembol, lot, giriş, çıkış; tarih alanı sayfa açılınca bugünle dolmuş olmalı) → 1 kayıt
//   B  toplu yapıştırma (2 satır, biri tarihsiz) → 2 kayıt, tarihsiz satır bugünün tarihiyle
//   C  CSV içe aktarma (2 geçerli + 1 tarihsiz satır) → 2 kayıt, tarihsiz satır günlükte atlandı
//   node scripts/perf/cf-serve.mjs dist 8788
//   PERF_DIR=<araçlar> node scripts/perf/verify-add-trade.mjs --base http://127.0.0.1:8788
// ============================================================
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-addtrade-'));
// her turda farklı fiyat: sahte arka uç önceki turun kayıtlarını "mevcut işlem" olarak döndürür (mükerrer kontrolü)
const csvFor = (k) => {
  const f = path.join(tmp, 'trades-' + k + '.csv');
  fs.writeFileSync(f, `symbol,direction,lot,entry,exit,date\nEURUSD,LONG,0.1,1.08${k},1.09${k},2026-01-15 10:00\nXAUUSD,SHORT,0.05,2050.5,2040.5,\nBTCUSD,LONG,0.01,6100${k},6250${k},2026-01-17 12:00\n`);
  return f;
};

const puppeteer = req('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend({});
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;
let failed = 0, total = 0;
const check = (ok, msg) => { total++; if (!ok) failed++; console.log((ok ? 'GEÇTİ ' : 'KALDI ') + msg); };

async function open(mode) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.emulateTimezone('Europe/Istanbul');
  await mockSession(page, { backend, lang: 'tr' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)));
  if (mode === 'doğrudan') {
    await page.goto(base + '/add-trade.html', { waitUntil: 'load', timeout: 60000 });
  } else {
    await page.goto(base + '/settings.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(2500);
    await page.evaluate(() => window.wwOpenAddTrade());
    await page.waitForFunction(() => /\/add-trade/.test(location.pathname) && document.getElementById('save-btn'), { timeout: 20000 });
  }
  // init bitti: oturum alındı ve tarih alanı dolduruldu
  const ready = await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && (document.getElementById('trade-date') || {}).value, { timeout: 15000 }).then(() => true, () => false);
  return { ctx, page, errors, ready };
}
const inserted = () => backend.inserted.length;
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
// kayıttan sonra sayfa trades.html'e geçer: bağlam, o sayfanın istekleri bitmeden kapanmasın (yarım istek "canlı" sayılır)
async function settle(page) { await sleep(1800); await page.waitForNetworkIdle({ idleTime: 600, timeout: 10000 }).catch(() => {}); }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

for (const [k, mode] of ['doğrudan', 'SPA'].entries()) {
  // T — tek işlem
  {
    const { ctx, page, errors, ready } = await open(mode);
    check(ready, `${mode}: sayfa başladı (oturum var, tarih alanı bugünle dolu)`);
    const before = inserted();
    await page.evaluate((k) => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('symbol', 'EURUSD'); set('lot', '0.1'); set('entry', '1.07' + k); set('exit', '1.08' + k); }, k);
    await click(page, '#save-btn');
    for (let i = 0; i < 30 && inserted() === before; i++) await sleep(200);
    const rows = backend.inserted.slice(before);
    const err = await page.evaluate(() => { const e = document.getElementById('err'); return e && e.style.display !== 'none' ? e.textContent : ''; }).catch(() => '');
    check(rows.length === 1 && rows[0].symbol === 'EURUSD' && String(rows[0].trade_date).slice(0, 10) === today(), `${mode} T: tek işlem kaydedildi — ${rows.map((r) => r.symbol + ' ' + r.trade_date).join(', ') || 'kayıt yok'}${err ? ' | hata: ' + err : ''}`);
    check(errors.length === 0, `${mode} T: sayfa hatası ${errors.length}${errors.length ? ': ' + errors.join(' || ') : ''}`);
    await settle(page);
    await ctx.close();
  }
  // B — toplu yapıştırma
  {
    const { ctx, page, errors } = await open(mode);
    const before = inserted();
    await click(page, '#bulk-import-btn');
    await sleep(400);   // pencere açılış geçişi
    await page.evaluate((k) => { document.getElementById('bulk-textarea').value = `GBPUSD,LONG,0.2,1.27${k},1.26${k},2026-01-20,toplu 1\nUSDJPY,SHORT,0.1,150.${k},149.${k}`; }, k);
    await click(page, '#bulk-confirm-btn');
    for (let i = 0; i < 30 && inserted() < before + 2; i++) await sleep(200);
    const rows = backend.inserted.slice(before);
    const dates = rows.map((r) => r.symbol + ' ' + String(r.trade_date).slice(0, 10));
    check(rows.length === 2 && dates[0] === 'GBPUSD 2026-01-20' && dates[1] === 'USDJPY ' + today(), `${mode} B: toplu yapıştırma 2 kayıt (tarihsiz satır bugün) — ${dates.join(', ') || 'kayıt yok'}`);
    check(errors.length === 0, `${mode} B: sayfa hatası ${errors.length}${errors.length ? ': ' + errors.join(' || ') : ''}`);
    await settle(page);
    await ctx.close();
  }
  // C — CSV içe aktarma
  {
    const { ctx, page, errors } = await open(mode);
    const before = inserted();
    await (await page.$('#csv-file')).uploadFile(csvFor(k));
    let log = '';
    for (let i = 0; i < 30 && !/atlandı/.test(log); i++) { await sleep(200); log = await page.evaluate(() => (document.getElementById('import-log') || {}).innerText || '').catch(() => log); }
    for (let i = 0; i < 20 && inserted() < before + 2; i++) await sleep(200);
    const rows = backend.inserted.slice(before);
    check(rows.length === 2 && rows.map((r) => r.symbol).join() === 'EURUSD,BTCUSD' && /Satır 2: Tarih boş, atlandı/.test(log), `${mode} C: CSV 2 kayıt, tarihsiz satır atlandı — ${rows.map((r) => r.symbol + ' ' + r.trade_date).join(', ') || 'kayıt yok'} | günlük: ${log.replace(/\s+/g, ' ').slice(0, 80)}`);
    check(errors.length === 0, `${mode} C: sayfa hatası ${errors.length}${errors.length ? ': ' + errors.join(' || ') : ''}`);
    await settle(page);
    await ctx.close();
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
const m = live.summary();
await closeBrowser(browser);
const leak = m.live || m.ws;
check(!leak, `canlı trafik sayacı 0 — supabase.co ${m.total} istek (sahte ${m.mock}, önbellek/SW ${m.cache}, canlı ${m.live}), gerçek WebSocket ${m.ws}${m.liveUrls.length ? ' | ' + m.liveUrls.join(', ') : ''}; tarayıcı süreçleri kapandı`);
console.log(`${total - failed}/${total} kontrol geçti`);
process.exitCode = failed ? 1 : 0;
