// ============================================================
// "VARSAYILAN GÖRÜNÜM DEĞİŞMEDİ" KARŞILAŞTIRMASI — scripts/perf/theme-style-snapshot.mjs
// ============================================================
// Renk / CSS değişikliğinden önce ve sonra uygulama sayfalarındaki her öğenin (::before / ::after dahil) hesaplanmış renk
// özelliklerini kaydeder, sonra iki kaydı karşılaştırır. Koyu ve açık mod, kayıtlı tema yok (ya da --theme ile verilen).
//   1) eski sürüm:  git worktree add /tmp/ww-base HEAD && (cd /tmp/ww-base && npm ci && npx astro build)
//                   node scripts/perf/cf-serve.mjs /tmp/ww-base/dist 8792 &
//                   PERF_DIR=... node scripts/perf/theme-style-snapshot.mjs snap /tmp/before.json --base http://127.0.0.1:8792
//   2) yeni sürüm:  npx astro build && node scripts/perf/cf-serve.mjs dist 8791 &
//                   PERF_DIR=... node scripts/perf/theme-style-snapshot.mjs snap /tmp/after.json --base http://127.0.0.1:8791
//   3) karşılaştır: node scripts/perf/theme-style-snapshot.mjs diff /tmp/before.json /tmp/after.json   (fark varsa çıkış kodu 1)
// --theme '<ww_custom_theme JSON>' ile özel bir temada da karşılaştırılabilir. --pages dashboard,trades ile sayfa seçilir.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const cmd = args[0];

const PAGES = ['dashboard', 'trades', 'strategies', 'calendar', 'analytics', 'journals', 'settings#panel-appearance', 'settings#panel-plan',
  'backtest', 'my-earnings', 'add-trade', 'report-bug'];
const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color',
  'border-left-color', 'box-shadow', 'outline-color', 'fill', 'stroke', 'text-shadow', 'caret-color', 'text-decoration-color', 'filter',
  'accent-color', 'font-size'];

if (cmd === 'snap') await snap(args[1]);
else if (cmd === 'diff') diff(args[1], args[2]);
else { console.error('kullanım: snap <out.json> [--base URL] [--theme JSON] [--pages a,b] | diff <before.json> <after.json>'); process.exit(2); }

async function snap(out) {
  const { chromePath } = await import('./chrome-path.mjs');
  const { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } = await import('./mock-session.mjs');
  const { watchLive, closeBrowser } = await import('./live-guard.mjs');
  const puppeteer = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'))('puppeteer-core');
  const base = String(opt('base', 'http://127.0.0.1:8791')).replace(/\/$/, '');
  const theme = opt('theme', '');
  const pages = opt('pages', null) ? String(opt('pages')).split(',') : PAGES;
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
  const backend = createMockBackend({ backtest: true });
  await watchWorkers(browser, backend);
  const live = watchLive(browser, { fulfilled: backend.fulfilled });
  await live.ready;
  const result = {};
  try {
    for (const mode of ['dark', 'light']) {
      for (const p of pages) {
        const ctx = await browser.createBrowserContext();
        const page = await ctx.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await mockSession(page, { backend, backtest: true });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.evaluateOnNewDocument((m, t) => {
          localStorage.setItem('ww_theme', m);
          localStorage.setItem('ww_theme_studio_open', '1');
          localStorage.setItem('ww_ambient_mode', 'classic');
          localStorage.removeItem('ww_font_size');
          if (t) localStorage.setItem('ww_custom_theme', t); else localStorage.removeItem('ww_custom_theme');
          document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('style');
            s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:auto!important}';
            document.head.appendChild(s);
          });
        }, mode, theme);
        await page.goto(`${base}/${p}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 3500));
        const s = await page.evaluate((PROPS) => {
          const o = {};
          const tag = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
            (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
          document.querySelectorAll('body *').forEach((el, i) => {
            if (el.closest('.ww-cp, svg defs, script, style')) return;
            for (const pseudo of [null, '::before', '::after']) {
              const cs = getComputedStyle(el, pseudo);
              if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
              o[i + ' ' + tag(el) + (pseudo || '')] = PROPS.map((k) => cs.getPropertyValue(k)).join(' | ');
            }
          });
          o.__html = PROPS.map((k) => getComputedStyle(document.documentElement).getPropertyValue(k)).join(' | ');
          o.__body = PROPS.map((k) => getComputedStyle(document.body).getPropertyValue(k)).join(' | ');
          return o;
        }, PROPS);
        result[mode + ' ' + p] = s;
        console.log(mode, p, Object.keys(s).length + ' öğe');
        await ctx.close();
      }
    }
  } finally {
    const m = live.summary();
    await closeBrowser(browser);
    if (m.live || m.ws) { console.error('canlıya istek gitti:', m.liveUrls); process.exitCode = 1; }
  }
  fs.writeFileSync(out, JSON.stringify({ props: PROPS, pages: result }));
  console.log('yazıldı:', out);
}

function diff(aPath, bPath) {
  const A = JSON.parse(fs.readFileSync(aPath, 'utf8')), B = JSON.parse(fs.readFileSync(bPath, 'utf8'));
  const props = A.props;
  // Chrome gradyanlarda 0% / 100% duraklarını bazen yazar bazen yazmaz: aynı sayılır
  // iki sürüm farklı portlardan sunulur: adreslerin kökü karşılaştırılmaz
  const norm = (v) => v.replace(/ 0%,/g, ',').replace(/ 100%\)/g, ')').replace(/https?:\/\/[^/"')]+\//g, '/');
  // SVG içi şekiller (grafik verisi), plan rozeti (sahte oturumun zamanına bağlı) karşılaştırılmaz
  const skip = (k) => k.includes('plan-badge') || /^(path|svg|rect|circle|line|g|text|tspan|stop|lineargradient|polyline|polygon|ellipse)\b/.test(k.split(' ')[1] || '');
  let total = 0;
  for (const page of Object.keys(A.pages)) {
    const a = A.pages[page], b = B.pages[page] || {};
    const d = Object.keys(a).filter((k) => k in b && !skip(k) && norm(a[k]) !== norm(b[k]));
    const missing = Object.keys(a).length - Object.keys(a).filter((k) => k in b).length;
    total += d.length;
    if (d.length || missing) console.log(`${page}: ${d.length} fark` + (missing ? `, ${missing} öğe eşleşmedi (DOM değişti)` : ''));
    for (const k of d.slice(0, 8)) {
      const pa = a[k].split(' | '), pb = b[k].split(' | ');
      console.log('   ', k, pa.map((v, i) => (norm(v) !== norm(pb[i]) ? `${props[i]}: ${v} → ${pb[i]}` : null)).filter(Boolean).join(' ; '));
    }
  }
  console.log(total ? `TOPLAM ${total} FARK` : 'FARK YOK: varsayılan görünüm aynı');
  process.exitCode = total ? 1 : 0;
}
