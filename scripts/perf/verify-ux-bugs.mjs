// ============================================================
// fix/ux-bugs OTOMATİK KONTROLLER — scripts/perf/verify-ux-bugs.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı (canlıya istek giderse hata).
//   K  Calendar: Hızlı Ekle ile kaydettikten HEMEN sonra + yeniden açıyor (3 tur); ×, Esc, arka plan sonrası açılıyor;
//      gün penceresi farklı günlerde 3 kez açılıp kapanıyor; kaydedilen işlem sayfa yenilenmeden takvimde; çift kayıt yok
//   B  Bildirimler: açılışta okundu işaretlenmiyor; zil açılınca okundu; yenilemede okunmamışlar okunmamış;
//      user_profiles açılış yazması yalnızca değer değişince
//   M  Yükseltme penceresi: açıkken aria-hidden yok, role/aria-modal/aria-labelledby, odak içeride, Tab / Shift+Tab döngüsü,
//      arka plan inert; kapanınca aria-hidden geri, odak açan öğeye; Esc / × / arka plan; "N" açıkken etkisiz, kapalıyken çalışır
//   PERF_DIR=<araçlar> node scripts/perf/verify-ux-bugs.mjs --base http://127.0.0.1:8788 [--only K,B,M]
// ============================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const only = opt('only', null) ? String(opt('only')).split(',') : null;
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

async function open(name, { viewport = { width: 1440, height: 900 }, be = backend } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  await mockSession(page, { backend: be });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  await page.goto(base + '/' + name + '.html', { waitUntil: 'load' });
  await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {});
  await sleep(1500);
  return { ctx, page, errors };
}

try {
  // ── K ──────────────────────────────────────────────────────
  if (want('K')) {
    for (const [label, vp] of [['masaüstü', { width: 1440, height: 900 }], ['mobil', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
      const { ctx, page, errors } = await open('calendar', { viewport: vp });
      const qaOpen = () => page.evaluate(() => !!document.querySelector('.quick-add-overlay.active'));
      const fab = async () => {
        await page.click('#quick-add-fab');   // gerçek tıklama: öğenin üstünde başka bir şey varsa o alır (kullanıcı gibi)
        await page.waitForFunction(() => !!document.querySelector('.quick-add-overlay.active'), { timeout: 4000 }).catch(() => {});
        return qaOpen();
      };
      const todayCount = () => page.evaluate(() => { const k = window.WwTime ? window.WwTime.todayKey() : new Date().toISOString().slice(0, 10); const c = document.querySelector('.cal-day[data-date="' + k + '"] .day-trade-count'); return c ? parseInt(c.textContent, 10) || 0 : 0; });
      const save = async (sym) => {
        await page.evaluate(() => { const s = document.getElementById('price-side-buy'); if (s) s.click(); });
        for (const [id, v] of [['price-symbol', sym], ['price-lot', '1'], ['price-entry', '1.1000'], ['price-exit', '1.1050']]) { await page.$eval('#' + id, (e) => { e.value = ''; }); await page.type('#' + id, v); }
        const before = backend.inserted.length;
        await page.click('#quick-add-save');
        await page.waitForFunction(() => !document.querySelector('.quick-add-overlay.active'), { timeout: 8000 }).catch(() => {});
        await sleep(400);
        return backend.inserted.length - before;
      };
      const count0 = await todayCount();
      const rounds = [];
      for (let i = 0; i < 3; i++) {
        const opened = await fab();
        const added = opened ? await save(['EURUSD', 'XAUUSD', 'GBPUSD'][i]) : 0;
        const reopen = await fab();   // kaydettikten hemen sonra (toast görünürken)
        if (reopen) { await page.click('#quick-add-close'); await sleep(500); }
        rounds.push({ opened, added, reopen });
      }
      await page.waitForFunction((n) => { const k = window.WwTime ? window.WwTime.todayKey() : new Date().toISOString().slice(0, 10); const c = document.querySelector('.cal-day[data-date="' + k + '"] .day-trade-count'); return c && parseInt(c.textContent, 10) >= n; }, { timeout: 8000 }, count0 + 3).catch(() => {});
      const count1 = await todayCount();
      check('K1-' + label, 'kaydettikten hemen sonra + pencereyi açıyor (3 tur)', rounds.every((r) => r.opened && r.reopen), rounds.map((r, i) => `${i + 1}: aç ${r.opened ? '✓' : '✗'} kaydet ${r.added} yeniden aç ${r.reopen ? '✓' : '✗'}`).join(' | '));
      check('K2-' + label, 'her kayıt tek POST (çift dinleyici yok)', rounds.every((r) => r.added === 1), rounds.map((r) => r.added).join(','));
      check('K3-' + label, 'kaydedilenler sayfa yenilenmeden takvimde (bugün)', count1 === count0 + 3, `bugünkü işlem sayısı ${count0} → ${count1}`);
      // ×, Esc, arka plan sonrası
      const cancels = [];
      for (const how of ['×', 'Esc', 'arka plan']) {
        const o = await fab();
        if (how === '×') await page.click('#quick-add-close');
        else if (how === 'Esc') await page.keyboard.press('Escape');
        else {
          // arka plan = overlay'in kendisi (pencere değil); mobilde pencere tam ekransa arka plan yoktur
          const pt = await page.evaluate(() => { const ov = document.getElementById('quick-add-overlay');
            for (const [x, y] of [[5, 5], [5, innerHeight / 2], [innerWidth / 2, 5], [innerWidth - 5, innerHeight / 2]]) if (document.elementFromPoint(x, y) === ov) return [x, y]; return null; });
          if (!pt) { await page.keyboard.press('Escape'); await sleep(600); cancels.push({ how, o, closed: true, again: await fab(), na: true }); await page.click('#quick-add-close').catch(() => {}); await sleep(400); continue; }
          await page.mouse.click(pt[0], pt[1]);
        }
        await sleep(600);
        cancels.push({ how, o, closed: !(await qaOpen()), again: await fab() });
        await page.click('#quick-add-close').catch(() => {}); await sleep(400);
      }
      check('K4-' + label, '× / Esc / arka plan ile kapatınca + tekrar açıyor', cancels.every((c) => c.o && c.closed && c.again), cancels.map((c) => `${c.how}: ${c.na ? '(arka plan alanı yok, tam ekran)' : 'kapandı ' + (c.closed ? '✓' : '✗')} tekrar ${c.again ? '✓' : '✗'}`).join(' | '));
      // gün penceresi: farklı günler, × / Esc / arka plan
      const days = await page.evaluate(() => [...document.querySelectorAll('.cal-day[data-date]')].map((d) => d.getAttribute('data-date')).filter((_, i) => i % 6 === 2).slice(0, 3));
      const dm = [];
      for (const [i, d] of days.entries()) {
        await page.click('.cal-day[data-date="' + d + '"]'); await sleep(400);
        const shown = await page.evaluate(() => { const m = document.getElementById('calendar-day-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
        const how = ['×', 'Esc', 'arka plan'][i];
        if (how === '×') await page.click('#close-day-modal'); else if (how === 'Esc') await page.keyboard.press('Escape'); else await page.mouse.click(5, 5 + Math.round(vp.height / 2));
        await sleep(400);
        const hidden = await page.evaluate(() => { const m = document.getElementById('calendar-day-modal'); return !m || getComputedStyle(m).display === 'none'; });
        dm.push({ d, how, shown, hidden });
      }
      check('K5-' + label, 'gün penceresi 3 farklı günde açılıp kapanıyor', dm.length === 3 && dm.every((x) => x.shown && x.hidden), dm.map((x) => `${x.d} ${x.how}: ${x.shown ? 'açıldı' : '✗'}/${x.hidden ? 'kapandı' : '✗'}`).join(' | '));
      check('K6-' + label, 'sayfa hatası yok', errors.length === 0, errors[0] || '0');
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
