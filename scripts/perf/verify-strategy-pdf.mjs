// ============================================================
// STRATEJİ PDF'İ: TR / EN / DE BAŞLIKLAR VE KARAKTERLER — scripts/perf/verify-strategy-pdf.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı. Her dilde strateji sayfası açılır, strateji adlarına Türkçe ve
// Almanca karakterler verilir, tek strateji ve tüm stratejiler PDF'i gerçekten üretilir (jsPDF save yakalanır) ve:
//   - pdf.js ile metin çıkarılır: tablo başlıkları sözlükteki değerle, strateji adları birebir aynı mı
//   - PDF'te gömülü fontlar (DM Sans bekleniyor; Helvetica'da ş/ğ/ı/İ yok)
//   - ilk sayfa PNG'ye çizilir (gözle kontrol için; koyu zeminle, çünkü strateji PDF'inde başlık ve gövde metni beyaza yakın
//     ve sayfa zemini boyanmıyor) → <out>/<dil>-<tek|tum>.png ve .pdf
//   PERF_DIR=<araçlar> node scripts/perf/verify-strategy-pdf.mjs --base http://127.0.0.1:8788 --out <klasör>
// jsPDF / autoTable ve pdf.js cdnjs'ten yüklenir (supabase.co değil).
// ============================================================
import fs from 'node:fs';
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
const out = path.resolve(String(opt('out', 'pdf-check'))); fs.mkdirSync(out, { recursive: true });
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const NAMES = ['Kırılım Şablonu ğüşıöç İĞÜŞÖÇ', 'Großer Übergang äöüß ÄÖÜ', 'Pullback'];
const HEAD_KEYS = ['trades.table.date', 'trades.table.symbol', 'trades.table.direction', 'trades.table.entry', 'trades.table.exit', 'trades.table.pnl'];

const puppeteer = req('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend({});
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;
let failed = 0;
const check = (ok, msg) => { if (!ok) failed++; console.log((ok ? 'GEÇTİ ' : 'KALDI ') + msg); };

// PDF'i pdf.js ile açar: ilk sayfanın metni, font adları ve PNG görüntüsü
async function readPdf(b64, png) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1754 });
  await page.goto(base + '/favicon.ico').catch(() => {});
  await page.setContent('<!doctype html><body style="margin:0;background:#fff"><canvas id="c"></canvas></body>');
  await page.addScriptTag({ url: PDFJS + 'pdf.min.js' });
  const res = await page.evaluate(async (b64, workerSrc) => {
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = workerSrc;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await lib.getDocument({ data: bytes }).promise;
    const p = await doc.getPage(1);
    const vp = p.getViewport({ scale: 2480 / p.getViewport({ scale: 1 }).width });
    const c = document.getElementById('c'); c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp, background: '#0a0a0f' }).promise;
    const tc = await p.getTextContent();
    const fonts = new Set();
    for (const it of tc.items) { const f = p.commonObjs.has(it.fontName) ? p.commonObjs.get(it.fontName) : null; fonts.add(f ? f.name : it.fontName); }
    return { text: tc.items.map((i) => i.str), fonts: [...fonts], pages: doc.numPages };
  }, b64, PDFJS + 'pdf.worker.min.js');
  await (await page.$('#c')).screenshot({ path: png });
  await page.close();
  return res;
}

for (const lang of ['tr', 'en', 'de']) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateTimezone('Europe/Istanbul');
  await mockSession(page, { backend, lang });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 160)));
  await page.goto(base + '/strategies.html', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof strategiesList !== 'undefined' && strategiesList.length >= 3 && allTradesForStats.length > 0 && window.i18n && window.i18n.translations, { timeout: 20000 });
  await sleep(800);
  const r = await page.evaluate(async (names, headKeys) => {
    names.forEach((n, i) => { strategiesList[i].name = n; });
    await window.loadJsPDF(true);
    const pdfs = [];
    window.jspdf.jsPDF.API.save = function (name) { pdfs.push({ name, b64: this.output('datauristring').split(',')[1] }); return this; };
    const toasts = [];
    const origToast = window.showToast; window.showToast = function (m, t) { toasts.push((t || 'success') + ': ' + m); if (origToast) origToast.apply(this, arguments); };
    await window.exportStrategyPDF(strategiesList[0].id);
    await exportAllStrategiesPDF();
    const lang = window.i18n.getCurrentLanguage();
    return { lang, pdfs, toasts, heads: headKeys.map((k) => window.i18n.t(k)), names: strategiesList.map((s) => s.name) };
  }, NAMES, HEAD_KEYS);
  check(r.lang === lang && r.pdfs.length === 2, `${lang}: iki PDF üretildi (${r.pdfs.map((p) => p.name).join(', ')}) | ${r.toasts.join(' · ')}`);
  check(r.heads.every((h, i) => h && h !== HEAD_KEYS[i]), `${lang}: başlık çevirileri ${r.heads.join(' | ')}`);
  for (const [i, p] of r.pdfs.entries()) {
    const kind = i === 0 ? 'tek' : 'tum';
    fs.writeFileSync(path.join(out, `${lang}-${kind}.pdf`), Buffer.from(p.b64, 'base64'));
    const pdf = await readPdf(p.b64, path.join(out, `${lang}-${kind}.png`));
    const joined = pdf.text.join(' ');
    if (kind === 'tek') {
      const missing = r.heads.filter((h) => !pdf.text.includes(h));
      check(!missing.length, `${lang} tek strateji PDF: tablo başlıkları ${missing.length ? 'EKSİK/BOZUK: ' + missing.join(', ') : 'birebir'} → [${r.heads.map((h) => (pdf.text.includes(h) ? h : '✗' + h)).join(' | ')}]`);
      check(joined.includes(NAMES[0]), `${lang} tek strateji PDF: başlıkta "${NAMES[0]}" ${joined.includes(NAMES[0]) ? 'birebir' : 'BOZUK → ' + (pdf.text.find((t) => t.includes(':')) || '')}`);
    } else {
      const bad = NAMES.filter((n) => !pdf.text.includes(n));
      check(!bad.length, `${lang} tüm stratejiler PDF: strateji adları ${bad.length ? 'BOZUK: ' + bad.join(', ') : 'birebir'}`);
    }
    check(pdf.fonts.length && pdf.fonts.every((f) => /DMSans/i.test(f)), `${lang}-${kind}: fontlar ${pdf.fonts.join(', ')} (${pdf.pages} sayfa)`);
  }
  check(errors.length === 0, `${lang}: sayfa hatası ${errors.length}${errors.length ? ': ' + errors.join(' || ') : ''}`);
  await ctx.close();
}

const m = live.summary();
await closeBrowser(browser);
console.log(`canlı trafik: supabase.co ${m.total} istek (sahte ${m.mock}, önbellek/SW ${m.cache}, canlı ${m.live}), WebSocket ${m.ws}; tarayıcı süreçleri kapandı`);
if (m.live || m.ws) failed++;
console.log('çıktılar:', out);
process.exitCode = failed ? 1 : 0;
