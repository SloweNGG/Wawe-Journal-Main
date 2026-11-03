// ============================================================
// release/combined OTOMATİK KONTROLLER — scripts/perf/verify-release.mjs
// ============================================================
// Perf raporlarındaki (Parça 1–3) elle kontrol listesinin otomatikleşebilen kısmı + landing. Sahte oturum, taklit Realtime,
// canlı trafik sayacı açık (canlıya istek giderse hata). Sunucu Cloudflare benzeri (scripts/perf/cf-serve.mjs: _headers uygulanır).
//   F  Google Fonts isteği yok; /fonts/*.woff2 "immutable" önbellekle geliyor
//   G  TR → DE → EN dil değişimi
//   N  "N" kısayolu 5 sayfada Hızlı Ekle'yi tekrar tekrar açıyor; yazı alanında harf olarak yazılıyor; yükseltme penceresi açıkken bir şey yapmıyor
//   U  yükseltme penceresi Esc, × ve arka plana tıklamayla kapanıyor
//   Q  /quick-add-modal.html 404 vermiyor
//   T  dokunmatik emülasyonda analytics kart sürükleme ilk dokunuşta çalışıyor
//   H  landing: hero başlığı, MacBook kapağı açılıyor → 6 ekran sırayla → kapak kapanıyor, platform şeridi, CTA, footer dağ görseli,
//      konsol hatası ve kırık görsel yok; 1440 ve 390 px ekran görüntüsü (--shots <klasör>)
//   PERF_DIR=<araçlar> node scripts/perf/verify-release.mjs --base http://127.0.0.1:8788 --shots <klasör> [--only F,H]
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const only = opt('only', null) ? String(opt('only')).split(',') : null;
const shotsDir = opt('shots', null) ? path.resolve(String(opt('shots'))) : null;
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, name, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'GEÇTİ ' : 'KALDI ') + id + ' ' + name + (detail ? ' — ' + detail : '')); };
const want = (id) => !only || only.includes(id);

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
const backend = createMockBackend();
await watchWorkers(browser, backend);
const live = watchLive(browser, { fulfilled: backend.fulfilled });
await live.ready;

async function newPage({ session = true, viewport = { width: 1440, height: 900 }, lang = 'tr' } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await mockSession(page, { backend, withSession: session, lang });
  const log = { errors: [], bad: [], reqs: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => log.errors.push('pageerror ' + e.message.slice(0, 160)));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('.supabase.co')) log.bad.push(r.status() + ' ' + r.url().replace(base, '')); });
  page.on('request', (r) => log.reqs.push(r.url()));
  return { ctx, page, log };
}
const settle = async (page, ms = 1200) => { await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {}); await sleep(ms); };

try {
  // ── F ──────────────────────────────────────────────────────
  if (want('F')) {
    const google = [], fonts = [];
    for (const name of ['index', 'login', 'about', 'dashboard', 'analytics']) {
      const { ctx, page, log } = await newPage({ session: !['index', 'login', 'about'].includes(name) });
      page.on('response', (r) => { if (/\/fonts\/[^?]+\.woff2/.test(r.url())) fonts.push({ page: name, url: r.url().replace(base, ''), cc: r.headers()['cache-control'] || '', status: r.status() }); });
      await page.goto(base + '/' + name + '.html', { waitUntil: 'load' }); await settle(page);
      google.push(...log.reqs.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)).map((u) => name + ': ' + u));
      await ctx.close();
    }
    check('F1', 'Google Fonts isteği yok (index, login, about, dashboard, analytics)', google.length === 0, google.length ? google.slice(0, 3).join(', ') : '0 istek');
    const bad = fonts.filter((f) => f.status !== 200 || f.cc !== 'public, max-age=31536000, immutable' || !/\?v=\d+$/.test(f.url));
    check('F2', '/fonts/*.woff2 ?v=<build> ile, "public, max-age=31536000, immutable"', fonts.length > 0 && bad.length === 0,
      `${fonts.length} yanıt, ${[...new Set(fonts.map((f) => f.url.replace(/\?.*/, '')))].length} dosya; sorunlu ${bad.length}${bad[0] ? ' (' + bad[0].url + ' ' + bad[0].cc + ')' : ''}`);
  }

  // ── G ──────────────────────────────────────────────────────
  if (want('G')) {
    const { ctx, page } = await newPage({ lang: 'tr' });
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' }); await settle(page, 2000);
    const label = () => page.evaluate(() => { const e = document.querySelector('[data-i18n="nav.calendar"]'); return e ? e.textContent.trim() : null; });
    const seen = { tr: await label() };
    for (const l of ['de', 'en']) {
      await page.evaluate((l) => window.i18n.setLanguage(l), l);
      await page.waitForFunction((prev) => { const e = document.querySelector('[data-i18n="nav.calendar"]'); return e && e.textContent.trim() !== prev; }, { timeout: 10000 }, seen[l === 'de' ? 'tr' : 'de']).catch(() => {});
      seen[l] = await label();
    }
    const stored = await page.evaluate(() => localStorage.getItem('ww_language'));
    check('G1', 'TR → DE → EN dil değişimi', seen.tr === 'Takvim' && seen.de && seen.en && new Set([seen.tr, seen.de, seen.en]).size === 3 && stored === 'en', `nav.calendar: ${seen.tr} → ${seen.de} → ${seen.en}, ww_language=${stored}`);
    await ctx.close();
  }

  // ── N + U ──────────────────────────────────────────────────
  if (want('N') || want('U')) {
    const qaOpen = (page) => page.evaluate(() => !!document.querySelector('.quick-add-overlay.active'));
    const modalState = (page) => page.evaluate(() => { const b = document.getElementById('ww-upgrade-modal-backdrop'); return b ? (b.classList.contains('active') ? 'açık' : b.style.display === 'none' ? 'kapalı' : 'kapanıyor') : 'yok'; });
    const blur = (page) => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    const rows = [];
    for (const name of ['dashboard', 'analytics', 'trades', 'calendar', 'strategies']) {
      const { ctx, page } = await newPage();
      await page.goto(base + '/' + name + '.html', { waitUntil: 'load' }); await settle(page, 1500);
      const r = { name, opens: [], typed: null, blocked: null, esc: null, x: null, bg: null };
      for (let k = 0; k < 3; k++) {
        await blur(page); await page.keyboard.press('n');
        await page.waitForFunction(() => !!document.querySelector('.quick-add-overlay.active'), { timeout: 8000 }).catch(() => {});
        r.opens.push(await qaOpen(page));
        if (k === 0) {
          // yazı alanında: N harf olarak yazılır, pencere kapanıp yeniden açılmaz
          const typed = await page.evaluate(() => { const i = document.activeElement; return i && /^(INPUT|TEXTAREA)$/.test(i.tagName) ? i.id || i.name || i.tagName : null; });
          if (typed) { await page.keyboard.type('n'); r.typed = await page.evaluate(() => ({ v: document.activeElement.value, open: !!document.querySelector('.quick-add-overlay.active') })); }
        }
        await page.evaluate(() => window.quickAddClose && window.quickAddClose()); await sleep(500);
      }
      await blur(page);
      await page.evaluate(() => window.openUpgradeModal({ feature: 'analytics_dashboard' })); await sleep(500);
      await page.keyboard.press('n'); await sleep(900);
      r.blocked = (await modalState(page)) === 'açık' && !(await qaOpen(page));
      await page.keyboard.press('Escape'); await sleep(500); r.esc = await modalState(page);
      await page.evaluate(() => window.openUpgradeModal({})); await sleep(500);
      await page.click('#ww-up-close-btn'); await sleep(500); r.x = await modalState(page);
      await page.evaluate(() => window.openUpgradeModal({})); await sleep(500);
      await page.mouse.click(8, 450); await sleep(500); r.bg = await modalState(page);
      rows.push(r);
      await ctx.close();
    }
    if (want('N')) {
      check('N1', '"N" 5 sayfada Hızlı Ekle\'yi 3 kez üst üste açıyor', rows.every((r) => r.opens.length === 3 && r.opens.every(Boolean)), rows.map((r) => r.name + ' ' + r.opens.map((o) => o ? '✓' : '✗').join('')).join(', '));
      check('N2', 'yazı alanında "n" harf olarak yazılıyor (pencere açık kalıyor)', rows.every((r) => r.typed && /n$/i.test(r.typed.v) && r.typed.open), rows.map((r) => r.name + ' ' + (r.typed ? JSON.stringify(r.typed.v) : '—')).join(', '));
      check('N3', 'yükseltme penceresi açıkken "N" bir şey yapmıyor', rows.every((r) => r.blocked), rows.map((r) => r.name + ' ' + (r.blocked ? '✓' : '✗')).join(', '));
    }
    if (want('U')) check('U1', 'yükseltme penceresi Esc, × ve arka plana tıklamayla kapanıyor', rows.every((r) => r.esc === 'kapalı' && r.x === 'kapalı' && r.bg === 'kapalı'), rows.map((r) => `${r.name} Esc:${r.esc} ×:${r.x} arka:${r.bg}`).join(' | '));
  }

  // ── Q ──────────────────────────────────────────────────────
  if (want('Q')) {
    const { ctx, page, log } = await newPage();
    await page.goto(base + '/quick-add-modal.html', { waitUntil: 'load' }); await settle(page);
    check('Q1', '/quick-add-modal.html 404 vermiyor', log.bad.length === 0, log.bad.join(', ') || 'hatalı yanıt yok');
    await ctx.close();
  }

  // ── T ──────────────────────────────────────────────────────
  if (want('T')) {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
    await page.goto(base + '/analytics.html', { waitUntil: 'load' });
    await page.waitForSelector('#dashboard-grid .grid-item .drag-handle', { timeout: 20000 });
    await sleep(5000);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#dashboard-grid > .grid-item')].map((e) => e.dataset.widget));
    const before = await order();
    await page.evaluate(() => document.querySelector('#dashboard-grid > .grid-item .drag-handle').scrollIntoView({ block: 'center' })); await sleep(300);
    const pts = await page.evaluate(() => { const it = [...document.querySelectorAll('#dashboard-grid > .grid-item')]; const h = it[0].querySelector('.drag-handle').getBoundingClientRect(); const t = it[1].getBoundingClientRect(); return { x: h.x + h.width / 2, y: h.y + h.height / 2, tx: t.x + t.width / 2, ty: t.y + t.height * 0.75 }; });
    const cdp = await page.createCDPSession();
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(pts.x, pts.y) });
    for (let i = 1; i <= 25; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(pts.x + (pts.tx - pts.x) * i / 25, pts.y + (pts.ty - pts.y) * i / 25) }); await sleep(30); }
    await sleep(200); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800);
    const after = await order();
    check('T1', 'dokunmatikte analytics kart sürükleme ilk dokunuşta çalışıyor', before[0] !== after[0], before.slice(0, 2).join(',') + ' → ' + after.slice(0, 2).join(','));
    await ctx.close();
  }

  // ── H ──────────────────────────────────────────────────────
  if (want('H')) {
    for (const [label, vp] of [['1440', { width: 1440, height: 900 }], ['390', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
      const { ctx, page, log } = await newPage({ session: false, viewport: vp, lang: 'en' });
      await page.goto(base + '/index.html', { waitUntil: 'load' }); await settle(page, 1500);
      const hero = await page.evaluate(() => (document.querySelector('.hero h1, h1') || {}).innerText || '');
      // MacBook sahnesi: bölüm boyunca adım adım kaydır, kapak (--lid) ve etkin ekranı kaydet
      const trace = await page.evaluate(async () => {
        const sec = document.querySelector('.showcase'); if (!sec) return null;
        const top = sec.getBoundingClientRect().top + scrollY, h = sec.offsetHeight, vh = innerHeight, out = [];
        for (let y = top - vh; y <= top + h + vh * 0.5; y += Math.max(20, h / 120)) {
          // sayfada scroll-behavior: smooth var: anında kaydır, sayfanın rAF güncellemesini bekle
          scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 40)); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const shots = [...sec.querySelectorAll('.sc-shot')];
          out.push({ lid: parseFloat(sec.style.getPropertyValue('--lid')) || 0, on: shots.findIndex((s) => s.classList.contains('is-on')), n: shots.length });
        }
        return out;
      });
      let seq = [], ok = !!trace, maxLid = 0, opened = -1, closedAfter = false;
      if (trace) {
        for (const t of trace) { if (seq[seq.length - 1] !== t.on) seq.push(t.on); }
        maxLid = Math.max(...trace.map((t) => t.lid));
        opened = trace.findIndex((t) => t.lid > 0.98);
        const lastOn = trace.map((t) => t.on).lastIndexOf(trace[0].n - 1);
        closedAfter = opened >= 0 && trace.slice(lastOn).some((t) => t.lid < 0.05);
      }
      const seqOk = JSON.stringify(seq) === JSON.stringify([0, 1, 2, 3, 4, 5]);
      // sayfanın sonuna kadar kaydır (geç yüklenen görseller), sonra kontroller
      await page.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 500) { scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60)); } });
      await settle(page, 1500);
      const info = await page.evaluate(() => {
        const plat = document.querySelector('.platforms') || { innerText: '' };
        const chip = [...document.querySelectorAll('.platforms .chip')].map((c) => c.innerText.replace(/\s+/g, ' ').trim());
        const cta = [...document.querySelectorAll('h2')].map((h) => h.innerText.replace(/\s+/g, ' ').trim()).find((t) => /destiny/i.test(t)) || '';
        const foot = document.querySelector('.lp-foot');
        const footBg = foot ? getComputedStyle(foot).backgroundImage : '';
        const footLoaded = performance.getEntriesByType('resource').some((e) => /footer-range\.webp/.test(e.name));
        const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src'));
        const pending = [...document.images].filter((i) => !i.complete).length;
        return { chip, platText: plat.innerText, cta, footBg: /footer-range\.webp/.test(footBg), footLoaded, broken, pending };
      });
      const mt = info.chip.find((c) => /MetaTrader 4\/5/.test(c)) || '';
      check('H1-' + label, 'hero başlığı "Never make the same mistake twice."', hero.replace(/\s+/g, ' ').trim() === 'Never make the same mistake twice.', JSON.stringify(hero.replace(/\s+/g, ' ').trim()));
      check('H2-' + label, 'MacBook: kapak açılıyor → 6 ekran sırayla → kapak kapanıyor', ok && maxLid > 0.98 && seqOk && closedAfter, `kapak en çok ${maxLid.toFixed(2)}, ekran sırası ${JSON.stringify(seq)}, sonda kapandı ${closedAfter}`);
      check('H3-' + label, 'platform şeridi: "MetaTrader 4/5 · AUTO-SYNC SOON" var, TradingView yok', /AUTO-SYNC SOON/.test(mt) && !/TradingView/i.test(info.platText), JSON.stringify(mt) + ', TradingView ' + (/TradingView/i.test(info.platText) ? 'VAR' : 'yok'));
      check('H4-' + label, 'CTA "Rewrite your destiny."', /^Rewrite your destiny\./.test(info.cta), JSON.stringify(info.cta));
      check('H5-' + label, 'footer dağ görseli (footer-range.webp) yüklü', info.footBg && info.footLoaded, `arka plan ${info.footBg}, indirildi ${info.footLoaded}`);
      check('H6-' + label, 'konsolda hata ve kırık görsel / 4xx yok', log.errors.length === 0 && info.broken.length === 0 && log.bad.length === 0, `konsol hatası ${log.errors.length}${log.errors[0] ? ' (' + log.errors[0] + ')' : ''}, kırık görsel ${info.broken.length}${info.broken[0] ? ' (' + info.broken[0] + ')' : ''}, 4xx ${log.bad.length}${log.bad[0] ? ' (' + log.bad[0] + ')' : ''}, yüklenmemiş ${info.pending}`);
      if (shotsDir) {
        fs.mkdirSync(shotsDir, { recursive: true });
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(600);
        await page.screenshot({ path: path.join(shotsDir, `landing-${label}-ust.png`) });
        await page.screenshot({ path: path.join(shotsDir, `landing-${label}-tam.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
} finally {
  const m = live.summary();
  await closeBrowser(browser);
  check('L', 'canlı trafik sayacı 0', m.live === 0 && m.ws === 0, `supabase.co ${m.total} istek (sahte ${m.mock}, önbellek/SW ${m.cache}, canlı ${m.live}), gerçek WebSocket ${m.ws}; tarayıcı süreçleri kapandı`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti` + (failed.length ? ' | KALAN: ' + failed.map((r) => r.id).join(', ') : ''));
  process.exitCode = failed.length ? 1 : 0;
}
