// ============================================================
// TEMA STÜDYOSU UÇTAN UCA KONTROLLERİ — scripts/perf/verify-theme.mjs
// ============================================================
// Gerçek derlenmiş site + sahte oturum (scripts/perf/mock-session.mjs); canlı trafik sayacı açık (canlıya istek giderse KALDI).
// Tema motoru: src/scripts/theme-engine.js · Stüdyo: public/settings/js/theme-studio.js · Birim testleri: tests/theme-engine.test.js
//   S  stüdyo: hazır temalar, önizleme, panel değişince kalıcılık, tek (gecikmeli) hesaba yazma, kontrast uyarısı, tema kodu,
//      yanlış mod kodu reddi, açık tema paletleri, sıfırlama, hesaptan çekme
//   N  SPA: tema seçip hemen navbar ile başka sayfaya geçince tema korunuyor, hesaba yazılıyor, tam yenilemede duruyor
//   F  yazı boyutu: önizleme ile yenileme sonrası <html> ve <body> aynı; 16 = varsayılan (satır içi stil yok)
//   A  açık temada seçilen vurgu birebir (--accent), koyu temada --ac; sarı vurguda buton yazısı koyu (--ac-on)
//   X  başka sekmede tema değişince açık sekme yeni renkleri alıyor; <html>'de eski satır içi değişken kalmıyor
// Kullanım:
//   npx astro build && node scripts/perf/cf-serve.mjs dist 8791 &
//   PERF_DIR=<puppeteer-core klasörü> node scripts/perf/verify-theme.mjs --base http://127.0.0.1:8791 [--only S,F] [--shots <klasör>]
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8791')).replace(/\/$/, '');
const only = opt('only', null) ? String(opt('only')).split(',') : null;
const shotsDir = opt('shots', null) ? path.resolve(String(opt('shots'))) : null;
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = (id) => !only || only.includes(id);

const results = [];
const check = (id, name, ok, detail) => {
  results.push({ id, ok: !!ok });
  console.log((ok ? 'GEÇTİ ' : 'KALDI ') + id + ' ' + name + (detail !== undefined && !ok ? ' — ' + JSON.stringify(detail) : ''));
};

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend();
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;

// Temiz bir bağlam: koyu mod, kayıtlı tema yok, stüdyo açık. setup sayfa açılmadan bir kez çalışır.
async function newPage(setup = {}) {
  backend.state.profile.theme = null; // önceki senaryonun hesaba yazdığı tema bu senaryoya karışmasın
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSession(page, { backend });
  await page.evaluateOnNewDocument((s) => {
    if (sessionStorage.getItem('__ts_init')) return;
    sessionStorage.setItem('__ts_init', '1');
    localStorage.setItem('ww_theme', s.mode || 'dark');
    localStorage.setItem('ww_theme_studio_open', '1');
    localStorage.removeItem('ww_custom_theme');
    localStorage.removeItem('ww_font_size');
    if (s.theme) localStorage.setItem('ww_custom_theme', JSON.stringify(s.theme));
    if (s.font) localStorage.setItem('ww_font_size', String(s.font));
  }, setup);
  return { ctx, page, errors };
}
const cssVar = (page, v) => page.evaluate((v) => getComputedStyle(document.body).getPropertyValue(v).trim(), v);
const bgOf = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).backgroundColor : null; }, sel);
const go = (page, p) => page.goto(base + p, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
async function openStudio(page) {
  await go(page, '/settings#panel-appearance');
  await page.waitForSelector('.ts-preset', { timeout: 20000 });
  await sleep(400);
}
async function typeInto(page, sel, text) {
  const el = await page.$(sel);
  await el.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await el.type(text);
}
async function shot(page, name) {
  if (!shotsDir) return;
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, name + '.png') });
}
const themeWrites = () => backend.state.writes.filter((w) => w.table === 'user_profiles' && w.body && w.body.theme);

try {
  // ---------------------------------------------------------- S
  if (want('S')) {
    const { ctx, page, errors } = await newPage();
    await openStudio(page);
    check('S', '10 koyu hazır tema', (await page.$$('.ts-preset')).length === 10);
    check('S', 'varsayılan Obsidian seçili', await page.$eval('.ts-preset.active', (b) => b.dataset.preset) === 'obsidian');
    check('S', 'tema kartları grubunun adı var (aria-labelledby)', await page.$eval('[data-ts-presets]', (g) => {
      const t = document.getElementById(g.getAttribute('aria-labelledby')); return !!(t && t.textContent.trim());
    }));

    await page.click('.ts-preset[data-preset="slate"]'); await sleep(150);
    check('S', 'önizleme: vurgu', await cssVar(page, '--ac') === '#3b82f6', await cssVar(page, '--ac'));
    check('S', 'önizleme: kutular', await bgOf(page, '.s-card') === 'rgb(15, 23, 42)', await bgOf(page, '.s-card'));
    check('S', 'okunabilirlik iyi', await page.$eval('[data-ts-contrast] li', (e) => e.className) === 'ok');
    await shot(page, 'theme-slate');

    await page.evaluate(() => window.switchPanel('panel-profile-info')); await sleep(300);
    check('S', 'panel değişince kalıyor (otomatik kayıt)', await cssVar(page, '--ac') === '#3b82f6');
    await page.evaluate(() => window.switchPanel('panel-appearance')); await page.waitForSelector('.ts-preset'); await sleep(300);

    backend.state.writes.length = 0;
    await page.click('.ts-preset[data-preset="ocean"]'); await sleep(100);
    await page.click('.ts-preset[data-preset="slate"]'); await sleep(2300);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ww_custom_theme')));
    check('S', 'v2 biçiminde kaydedildi', !!(stored && stored.v === 2 && stored.dark.preset === 'slate'), stored);
    check('S', 'iki tıklama → hesaba tek yazma', themeWrites().length === 1 && themeWrites()[0].body.theme.dark.accent === '#3b82f6', themeWrites().length);

    await go(page, '/dashboard'); await sleep(2500);
    check('S', 'dashboard: vurgu ve kutular', await cssVar(page, '--accent') === '#3b82f6' && await bgOf(page, '.stat-card') === 'rgb(15, 23, 42)');

    await openStudio(page);
    check('S', 'yenilemeden sonra Slate seçili', await page.$eval('.ts-preset.active', (b) => b.dataset.preset) === 'slate');
    // beyaz vurgu artık sorun değil (buton yazısı otomatik koyu); kutu rengine çok yakın vurgu uyarı vermeli
    await typeInto(page, '[data-ts-text="accent"]', '#162036'); await sleep(200);
    check('S', 'kutuya çok yakın vurgu uyarı veriyor', (await page.$$('[data-ts-contrast] li.warn')).length >= 1);
    check('S', '"Özel" rozeti', await page.$eval('[data-ts-custom]', (e) => !e.hidden));

    const code = await page.$eval('[data-ts-code]', (e) => e.textContent);
    check('S', 'tema kodu biçimi', /^WAWE-D-[0-9A-F]{30}$/.test(code), code);
    await page.click('[data-ts-paste-toggle]');
    await typeInto(page, '[data-ts-paste-input]', 'WAWE-L-F5F1E8FFFDF8E6DFCF1F1A14B45309');
    await page.click('[data-ts-paste-apply]'); await sleep(150);
    check('S', 'açık tema kodu koyu modda reddedildi (satır içi hata)', await cssVar(page, '--ac') === '#162036'
      && await page.$eval('[data-ts-paste-msg]', (e) => !e.hidden && e.textContent.length > 5));
    await typeInto(page, '[data-ts-paste-input]', 'WAWE-D-0B090615110A2D2414F7F1E6D97706');
    await page.click('[data-ts-paste-apply]'); await sleep(150);
    check('S', 'Amber kodu uygulandı', await cssVar(page, '--ac') === '#d97706' && await page.$eval('.ts-preset.active', (b) => b.dataset.preset) === 'amber');

    await page.evaluate(() => window.selectThemeMode('light')); await page.waitForSelector('.ts-preset[data-preset="paper"]'); await sleep(300);
    check('S', '5 açık hazır tema, html + body light-theme', (await page.$$('.ts-preset')).length === 5
      && await page.evaluate(() => document.documentElement.classList.contains('light-theme') && document.body.classList.contains('light-theme')));
    await page.click('.ts-preset[data-preset="paper"]'); await sleep(600);
    check('S', 'Paper zemini', await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(245, 241, 232)');
    const st2 = await page.evaluate(() => JSON.parse(localStorage.getItem('ww_custom_theme')));
    check('S', 'koyu ve açık palet ayrı saklanıyor', st2.dark.preset === 'amber' && st2.light.preset === 'paper', st2);

    await page.evaluate(() => window.selectThemeMode('dark')); await page.waitForSelector('.ts-preset[data-preset="slate"]'); await sleep(300);
    await page.click('#reset-custom-theme-btn'); await sleep(400);
    const st3 = await page.evaluate(() => JSON.parse(localStorage.getItem('ww_custom_theme')));
    check('S', 'sıfırlama: koyu varsayılana döndü, açık korundu', !!(st3 && st3.dark === null && st3.light.preset === 'paper'), st3);
    check('S', 'varsayılan görünüm (mor, siyah kutular)', await cssVar(page, '--ac') === '#8b5cf6' && await bgOf(page, '.s-card') === 'rgb(0, 0, 0)');

    backend.state.profile.theme = { v: 2, ts: Date.now() + 60000, dark: { bg: '#0c0709', surface: '#170d12', border: '#33192a', text: '#fbeef4', accent: '#db2777', preset: 'sakura' }, light: null };
    await page.evaluate(() => sessionStorage.removeItem('ww_theme_synced'));
    await go(page, '/trades'); await sleep(3500);
    check('S', 'hesaptaki daha yeni tema çekildi (Sakura)', await cssVar(page, '--ac') === '#db2777');
    delete backend.state.profile.theme;
    check('S', 'sayfa hatası yok', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // ---------------------------------------------------------- N
  if (want('N')) {
    for (const [label, act, expect, pause] of [
      ['seçip bekle', (p) => p.click('.ts-preset[data-preset="slate"]'), '#3b82f6', 800],
      ['seçip hemen çık', (p) => p.click('.ts-preset[data-preset="amber"]'), '#d97706', 50],
      ['vurgu yazıldı', (p) => typeInto(p, '[data-ts-text="accent"]', '#0ea5e9'), '#0ea5e9', 100]
    ]) {
      const { ctx, page } = await newPage();
      backend.state.writes.length = 0;
      await openStudio(page);
      await act(page); await sleep(pause);
      let okNav = true; const seen = [];
      for (const href of ['/dashboard', '/trades', '/strategies']) {
        const sel = `a[href="${href}"], a[href="${href}.html"]`;
        await page.waitForSelector(sel, { timeout: 10000 });
        await page.click(sel); await sleep(2200);
        const ac = await cssVar(page, '--ac'); seen.push(ac); if (ac !== expect) okNav = false;
      }
      check('N', label + ': SPA geçişlerinde korunuyor', okNav, seen);
      await sleep(1800);
      const w = themeWrites();
      check('N', label + ': hesaba yazıldı', w.length >= 1 && w[w.length - 1].body.theme.dark.accent === expect, w.length);
      await go(page, '/calendar'); await sleep(1500);
      check('N', label + ': tam yenilemede duruyor', await cssVar(page, '--ac') === expect);
      await ctx.close();
    }
  }

  // ---------------------------------------------------------- F
  if (want('F')) {
    const { ctx, page } = await newPage();
    await openStudio(page);
    await page.evaluate(() => { const b = document.querySelector('.font-pill[data-size="18"]') || null; if (b) b.click(); else { const s = document.getElementById('custom-font-size'); s.value = 18; s.dispatchEvent(new Event('input')); } });
    await sleep(200);
    const sizes = () => page.evaluate(() => [document.documentElement.style.fontSize, document.body.style.fontSize, getComputedStyle(document.documentElement).fontSize]);
    const preview = await sizes();
    check('F', 'önizleme <html> ve <body> 18px', preview[0] === '18px' && preview[1] === '18px' && preview[2] === '18px', preview);
    await sleep(600);
    await go(page, '/dashboard'); await sleep(2000);
    const after = await sizes();
    check('F', 'yenilemeden sonra aynı (önizleme = kayıt)', JSON.stringify(after) === JSON.stringify(preview), after);
    const remPx = await page.evaluate(() => { const d = document.createElement('div'); d.style.width = '1rem'; document.body.appendChild(d); const w = d.getBoundingClientRect().width; d.remove(); return w; });
    check('F', 'rem 18px', remPx === 18, remPx);
    await openStudio(page);
    await page.click('#reset-custom-theme-btn'); await sleep(400);
    const reset = await sizes();
    check('F', 'sıfırlama satır içi boyutu kaldırıyor', reset[0] === '' && reset[1] === '' && await page.evaluate(() => localStorage.getItem('ww_font_size')) === null, reset);
    await ctx.close();
  }

  // ---------------------------------------------------------- A
  if (want('A')) {
    const paper = { bg: '#f5f1e8', surface: '#fffdf8', border: '#e6dfcf', text: '#1f1a14', accent: '#b45309', preset: 'paper' };
    const { ctx, page } = await newPage({ mode: 'light', theme: { v: 2, ts: Date.now(), dark: null, light: paper } });
    await go(page, '/dashboard'); await sleep(2000);
    check('A', 'açık tema: --accent seçilen renk (Paper #b45309)', await cssVar(page, '--accent') === '#b45309', await cssVar(page, '--accent'));
    await ctx.close();

    const yellow = { bg: '#07070c', surface: '#0e0e16', border: '#1a1a28', text: '#f0f0f8', accent: '#facc15', preset: null };
    const y = await newPage({ theme: { v: 2, ts: Date.now(), dark: yellow, light: null } });
    await openStudio(y.page);
    check('A', 'sarı vurgu: buton yazısı koyu (--ac-on)', await cssVar(y.page, '--ac-on') === '#0b0b12', await cssVar(y.page, '--ac-on'));
    check('A', 'sarı vurgu: koyu yazıyla okunabilir, uyarı yok', (await y.page.$$('[data-ts-contrast] li.warn')).length === 0,
      await y.page.$$eval('[data-ts-contrast] li', (l) => l.map((x) => x.textContent)));
    await y.ctx.close();
    const d = await newPage();
    await go(d.page, '/dashboard'); await sleep(1500);
    check('A', 'varsayılan: buton yazısı beyaz', await cssVar(d.page, '--ac-on') === '#fff', await cssVar(d.page, '--ac-on'));
    await d.ctx.close();
  }

  // ---------------------------------------------------------- X
  if (want('X')) {
    const { ctx, page } = await newPage();
    await go(page, '/dashboard'); await sleep(2000);
    const other = await ctx.newPage();
    await other.setViewport({ width: 1200, height: 900 });
    await mockSession(other, { backend });
    await openStudio(other);
    await other.click('.ts-preset[data-preset="sakura"]'); await sleep(900);
    check('X', 'diğer sekme yeni vurguyu aldı', await cssVar(page, '--ac') === '#db2777', await cssVar(page, '--ac'));
    check('X', '<html>de eski satır içi renk değişkeni yok', await page.evaluate(() => !/--(bg|surface|border|text)\s*:/.test(document.documentElement.getAttribute('style') || '')));
    await other.evaluate(() => window.selectThemeMode('light')); await sleep(900);
    check('X', 'diğer sekme açık moda geçti', await page.evaluate(() => document.body.classList.contains('light-theme') && document.documentElement.classList.contains('light-theme')));
    await ctx.close();
  }
} finally {
  const m = live.summary();
  await closeBrowser(browser);
  check('L', 'canlı trafik sayacı 0', m.live === 0 && m.ws === 0, m.liveUrls);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti` + (failed.length ? ' | KALAN: ' + [...new Set(failed.map((r) => r.id))].join(', ') : ''));
  process.exitCode = failed.length ? 1 : 0;
}
