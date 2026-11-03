// ============================================================
// STRATEJİ PDF'İ: TR / EN / DE BAŞLIKLAR, KARAKTERLER VE OKUNABİLİRLİK — scripts/perf/verify-strategy-pdf.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı. Her dilde strateji sayfası açılır, strateji adlarına Türkçe ve
// Almanca karakterler verilir, tek strateji ve tüm stratejiler PDF'i gerçekten üretilir (jsPDF save yakalanır) ve:
//   - pdf.js ile metin çıkarılır: tablo başlıkları sözlükteki değerle, strateji adları birebir aynı mı
//   - PDF'te gömülü fontlar (DM Sans bekleniyor; Helvetica'da ş/ğ/ı/İ yok)
//   - her sayfa normal çizilir (pdf.js varsayılanı: beyaz kâğıt, zemin eklenmez) ve okunabilirlik ölçülür:
//       sayfa zemini boyanmış mı (kenar pikseli koyu) ve her metin parçasının kutusunda en açık / en koyu piksel
//       kontrastı ≥ 3:1 mi (beyaz sayfada beyaz yazı ~1:1 çıkar)
//   - "tüm stratejiler" PDF'i, ikinci sayfaya taşsın diye 90 ek stratejiyle de üretilir (yeni sayfa da boyanmalı)
//   - sayfalar PNG olarak yazılır → <out>/<dil>-<tek|tum>-<sayfa>.png ve .pdf
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
const EXTRA = 90;   // "tüm stratejiler" çok sayfalı denemesi için eklenen strateji sayısı
const HEAD_KEYS = ['trades.table.date', 'trades.table.symbol', 'trades.table.direction', 'trades.table.entry', 'trades.table.exit', 'trades.table.pnl'];
const MIN_CONTRAST = 3;

const puppeteer = req('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend({});
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;
let failed = 0;
const check = (ok, msg) => { if (!ok) failed++; console.log((ok ? 'GEÇTİ ' : 'KALDI ') + msg); };

// PDF'i pdf.js ile açar ve her sayfayı normal çizer: metin, font adları, zemin ve metin kontrastı, PNG görüntüleri
async function readPdf(b64, pngPrefix) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 1754 });
  await page.goto(base + '/favicon.ico').catch(() => {});
  await page.setContent('<!doctype html><body style="margin:0;background:#fff"></body>');
  await page.addScriptTag({ url: PDFJS + 'pdf.min.js' });
  const res = await page.evaluate(async (b64, workerSrc) => {
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = workerSrc;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await lib.getDocument({ data: bytes }).promise;
    const lum = (d, i) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]); };
    const pages = [], text = [], fonts = new Set();
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const vp = p.getViewport({ scale: 2480 / p.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas'); c.id = 'p' + n; c.width = vp.width; c.height = vp.height; c.style.display = 'block';
      document.body.appendChild(c);
      const g = c.getContext('2d', { willReadFrequently: true });
      await p.render({ canvasContext: g, viewport: vp }).promise;   // zemin rengi verilmez: boyanmamış sayfa beyaz kalır
      const tc = await p.getTextContent();
      // kenar boşluğunda (metin yok) sayfa zemini: boyanmışsa koyu
      const edge = g.getImageData(8, Math.round(c.height / 2), 1, 1).data;
      let worst = { ratio: Infinity, str: '' }, items = 0;
      for (const it of tc.items) {
        if (!it.str.trim()) continue;
        const f = p.commonObjs.has(it.fontName) ? p.commonObjs.get(it.fontName) : null; fonts.add(f ? f.name : it.fontName);
        text.push(it.str);
        const t = lib.Util.transform(vp.transform, it.transform);
        const h = Math.hypot(t[2], t[3]), w = it.width * vp.scale;
        const x0 = Math.max(0, Math.floor(t[4])), y0 = Math.max(0, Math.floor(t[5] - h)), bw = Math.max(1, Math.ceil(w)), bh = Math.max(1, Math.ceil(h * 1.1));
        const d = g.getImageData(x0, y0, Math.min(bw, c.width - x0), Math.min(bh, c.height - y0)).data;
        let lo = 1, hi = 0;
        for (let i = 0; i < d.length; i += 4) { const l = lum(d, i); if (l < lo) lo = l; if (l > hi) hi = l; }
        const ratio = (hi + 0.05) / (lo + 0.05);
        items++;
        if (ratio < worst.ratio) worst = { ratio, str: it.str };
      }
      pages.push({ edge: [edge[0], edge[1], edge[2]], items, worst: { ratio: Math.round(worst.ratio * 10) / 10, str: worst.str } });
    }
    return { text, fonts: [...fonts], pages };
  }, b64, PDFJS + 'pdf.worker.min.js');
  for (let n = 1; n <= res.pages.length; n++) await (await page.$('#p' + n)).screenshot({ path: `${pngPrefix}-${n}.png` });
  await page.close();
  return res;
}

function checkPages(label, pdf) {
  for (const [i, pg] of pdf.pages.entries()) {
    const dark = pg.edge.every((v) => v < 40);
    check(dark, `${label} s.${i + 1}: sayfa zemini ${dark ? 'boyalı' : 'BOYANMAMIŞ'} (kenar rgb ${pg.edge.join(',')})`);
    check(pg.items > 0 && pg.worst.ratio >= MIN_CONTRAST, `${label} s.${i + 1}: ${pg.items} metin parçası, en düşük kontrast ${pg.worst.ratio}:1 ("${pg.worst.str}")`);
  }
  check(pdf.fonts.length && pdf.fonts.every((f) => /DMSans/i.test(f)), `${label}: fontlar ${pdf.fonts.join(', ')} (${pdf.pages.length} sayfa)`);
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
  const r = await page.evaluate(async (names, headKeys, extra) => {
    names.forEach((n, i) => { strategiesList[i].name = n; });
    await window.loadJsPDF(true);
    const pdfs = [];
    window.jspdf.jsPDF.API.save = function (name) { pdfs.push({ name, b64: this.output('datauristring').split(',')[1] }); return this; };
    const toasts = [];
    const origToast = window.showToast; window.showToast = function (m, t) { toasts.push((t || 'success') + ': ' + m); if (origToast) origToast.apply(this, arguments); };
    await window.exportStrategyPDF(strategiesList[0].id);
    await exportAllStrategiesPDF();
    const keep = strategiesList.slice();
    for (let i = 0; i < extra; i++) strategiesList.push({ ...keep[i % keep.length], id: 'extra-' + i, name: keep[i % keep.length].name + ' ' + (i + 1) });
    await exportAllStrategiesPDF();
    strategiesList.length = 0; keep.forEach((s) => strategiesList.push(s));
    window.showToast = origToast;
    return { lang: window.i18n.getCurrentLanguage(), pdfs, toasts, heads: headKeys.map((k) => window.i18n.t(k)) };
  }, NAMES, HEAD_KEYS, EXTRA);
  check(r.lang === lang && r.pdfs.length === 3 && r.toasts.every((t) => t.startsWith('success')), `${lang}: üç PDF üretildi (${r.pdfs.map((p) => p.name).join(', ')}) | ${r.toasts.join(' · ')}`);
  check(r.heads.every((h, i) => h && h !== HEAD_KEYS[i]), `${lang}: başlık çevirileri ${r.heads.join(' | ')}`);
  for (const [i, p] of r.pdfs.entries()) {
    const kind = ['tek', 'tum', 'tum-uzun'][i];
    fs.writeFileSync(path.join(out, `${lang}-${kind}.pdf`), Buffer.from(p.b64, 'base64'));
    const pdf = await readPdf(p.b64, path.join(out, `${lang}-${kind}`));
    const joined = pdf.text.join(' ');
    if (kind === 'tek') {
      const missing = r.heads.filter((h) => !pdf.text.includes(h));
      check(!missing.length, `${lang} tek strateji PDF: tablo başlıkları ${missing.length ? 'EKSİK/BOZUK: ' + missing.join(', ') : 'birebir'} → [${r.heads.map((h) => (pdf.text.includes(h) ? h : '✗' + h)).join(' | ')}]`);
      check(joined.includes(NAMES[0]), `${lang} tek strateji PDF: başlıkta "${NAMES[0]}" ${joined.includes(NAMES[0]) ? 'birebir' : 'BOZUK'}`);
    } else if (kind === 'tum') {
      const bad = NAMES.filter((n) => !pdf.text.includes(n));
      check(!bad.length, `${lang} tüm stratejiler PDF: strateji adları ${bad.length ? 'BOZUK: ' + bad.join(', ') : 'birebir'}`);
    } else {
      check(pdf.pages.length >= 2, `${lang} tüm stratejiler (${NAMES.length + EXTRA} satır): ${pdf.pages.length} sayfa`);
    }
    checkPages(`${lang}-${kind}`, pdf);
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
