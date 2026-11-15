// ============================================================
// GİRİŞ YAPILMIŞ HALDE LIGHTHOUSE (mobil, simüle yavaş 4G) — scripts/perf/lighthouse.mjs
// ============================================================
// puppeteer-core ve lighthouse repo bağımlılığı değil; repo dışına kurun ve PERF_DIR ile verin:
//   mkdir ../perf-tools && cd ../perf-tools && npm init -y && npm i lighthouse@12.2.1 puppeteer-core@23.11.1 && cd -
//
// 1) Sahte oturum (yerel, canlıya istek yok; dist'i önce sunun: node scripts/perf/cf-serve.mjs dist 8788):
//      PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base http://127.0.0.1:8788 --mock --pages dashboard,analytics --runs 3
// 2) Gerçek test hesabı (canlı/önizleme adresi): önce bir kez görünür tarayıcıda giriş yapın (Turnstile elle geçilir),
//    oturum --profile klasöründe kalır; sonraki ölçümler aynı profili kullanır:
//      PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base https://<önizleme> --profile ../perf-profile --login
//      PERF_DIR=../perf-tools node scripts/perf/lighthouse.mjs --base https://<önizleme> --profile ../perf-profile --pages dashboard,analytics --runs 3
//    Her ölçümden önce HTTP önbelleği, Cache Storage ve service worker temizlenir; localStorage (oturum) korunur → "soğuk ama girişli".
//    --profile ile (gerçek hesap) hem giriş penceresinde hem ölçümde salt okuma koruması açıktır (readonly-guard.mjs):
//    Supabase'e yazan her istek engellenir ve sonda listelenir. --base http://127.0.0.1:<port> de olur (yerel dist + canlı Supabase);
//    oturum yalnızca o adres + port için geçerlidir. Profil klasörü (ör. .perf-profile/) .gitignore'da; commit'lemeyin.
// --save <klasör>: her çalıştırmanın Lighthouse raporunu JSON olarak kaydeder.
// Her çalıştırmada supabase.co istekleri sayılır (live-guard.mjs); --mock'ta canlıya tek istek / WebSocket bile varsa hata.
// Her çalıştırmadan sonra tarayıcı süreçlerinin kapandığı doğrulanır.
//    Turnstile 127.0.0.1'de geçmediği için yerel adrese giriş: --login --from https://wawejournal.com (oturum taşınır).
// Chrome yolu: CHROME=... (varsayılan: işletim sistemine göre, scripts/perf/chrome-path.mjs)
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';
import { chromePath } from './chrome-path.mjs';
import { guardReadOnly } from './readonly-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const pages = String(opt('pages', 'dashboard,analytics,index')).split(',');
const runs = +opt('runs', 1);
const profile = opt('profile', null);
const chrome = chromePath();
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const lighthouse = (await import('file:///' + req.resolve('lighthouse').replace(/\\/g, '/'))).default;

if (opt('login', false)) {
  if (!profile) throw new Error('--login için --profile <klasör> gerekli');
  // --from <adres>: giriş orada yapılır (ör. https://wawejournal.com; Turnstile 127.0.0.1'de geçmiyor), son sekme
  // kapanınca oturum kaydı aynı profil içinde --base adresine TAŞINIR ve kaynaktaki kopya silinir (iki yer aynı yenileme
  // token'ını kullanıp oturumu düşürmesin). Token yazdırılmaz, dosyaya yazılmaz; yalnızca Chrome profilinde kalır.
  const from = opt('from', null) ? String(opt('from')).replace(/\/$/, '') : base;
  // Chrome puppeteer.launch ile değil doğrudan açılır: launch'ın --enable-automation bayrağı (navigator.webdriver)
  // yüzünden Turnstile girişi reddediyordu. Araç yalnızca hata ayıklama portundan bağlanır.
  const port = +opt('port', 9333);
  spawn(chrome, ['--user-data-dir=' + path.resolve(profile), '--remote-debugging-port=' + port, '--no-first-run', '--no-default-browser-check',
    from + '/login' + (from === base ? '.html' : '')], { stdio: 'ignore', detached: true }).unref();
  let browser = null;
  for (let i = 0; i < 100 && !browser; i++) {
    browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:' + port, defaultViewport: null }).catch(() => null);
    if (!browser) await new Promise((r) => setTimeout(r, 200));
  }
  if (!browser) throw new Error('Chrome hata ayıklama portuna bağlanılamadı: ' + port);
  const blocked = [];
  const guard = async (p) => { if (p) blocked.push((await guardReadOnly(p, { allowLogin: true })).blocked); };
  browser.on('targetcreated', async (t) => { if (t.type() === 'page') guard(await t.page()); });
  for (const p of await browser.pages()) await guard(p);
  console.log('Tarayıcıda test hesabıyla giriş yapın, dashboard açılınca pencereyi kapatın.');
  // macOS'ta son pencereyi kapatmak Chrome'u kapatmaz: son sekme kapanınca devam edilir
  await new Promise((r) => {
    browser.on('targetdestroyed', async () => { if (!(await browser.pages().catch(() => [])).length) r(); });
    browser.on('disconnected', r);
  });
  const KEY = /^sb-[a-z0-9]+-auth-token$/;
  // Uygulama kodu çalışmasın diye oturum işlemleri /robots.txt üzerinde yapılır
  const onOrigin = async (origin, fn, arg) => {
    const p = await browser.newPage();
    try { await p.goto(origin + '/robots.txt'); return await p.evaluate(fn, KEY.source, arg); } finally { await p.close(); }
  };
  let moved = false, hasSession = false;
  if (browser.connected) {
    if (from !== base) {
      const entry = await onOrigin(from, (re) => { const k = Object.keys(localStorage).find((x) => new RegExp(re).test(x)); return k ? [k, localStorage.getItem(k)] : null; });
      if (entry) {
        await onOrigin(base, (re, e) => localStorage.setItem(e[0], e[1]), entry);
        await onOrigin(from, (re, e) => localStorage.removeItem(e[0]), entry);
        moved = true;
      }
    }
    hasSession = await onOrigin(base, (re) => Object.keys(localStorage).some((x) => new RegExp(re).test(x)));
    await closeBrowser(browser, path.resolve(profile));
  }
  console.log('Oturum: ' + (hasSession ? 'var (' + base + (moved ? ', ' + from + ' adresinden taşındı' : '') + ')' : 'YOK — giriş tamamlanmadı'));
  console.log('Engellenen yazma istekleri: ' + (blocked.flat().join(', ') || 'yok'));
  process.exit(0);
}

console.log('sayfa | puan | LCP | CLS | TBT | transfer (Supabase hariç) | istek | son adres');
for (const name of pages) {
  for (let i = 0; i < runs; i++) {
    const mock = !!opt('mock', false);
    // sahte modda *.supabase.co hiç çözümlenmez (güvenlik ağı); her istek live-guard.mjs ile sayılır, kaçak varsa hata
    const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', userDataDir: profile ? path.resolve(profile) : undefined, args: mock ? MOCK_CHROME_ARGS : [] });
    const page = await browser.newPage();
    const ms = mock ? await mockSession(page) : null;
    if (ms) await watchWorkers(browser, ms.backend);
    const live = watchLive(browser, { fulfilled: ms ? ms.backend.fulfilled : null });
    await live.ready;
    const guard = profile ? await guardReadOnly(page) : null;
    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'cache_storage,service_workers' }).catch(() => {});
    const res = await lighthouse(base + '/' + name + (name.endsWith('.html') ? '' : '.html'), {
      output: 'json', logLevel: 'error', onlyCategories: ['performance'], formFactor: 'mobile', throttlingMethod: 'simulate',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }, disableStorageReset: true,
    }, undefined, page);
    const r = res.lhr, a = r.audits;
    // --save <klasör>: tam raporu JSON olarak yazar (LCP öğesi, zamanlama dökümü vb. için)
    if (opt('save', null)) { fs.mkdirSync(String(opt('save')), { recursive: true }); fs.writeFileSync(path.join(String(opt('save')), name + '-' + (i + 1) + '.json'), JSON.stringify(r)); }
    const items = (a['network-requests'].details && a['network-requests'].details.items) || [];
    const own = items.filter((x) => !x.url.includes('.supabase.co'));
    console.log([name, Math.round(r.categories.performance.score * 100), (a['largest-contentful-paint'].numericValue / 1000).toFixed(2) + ' s',
      a['cumulative-layout-shift'].numericValue.toFixed(3), Math.round(a['total-blocking-time'].numericValue) + ' ms',
      (own.reduce((s, x) => s + (x.transferSize || 0), 0) / 1024).toFixed(0) + ' KB', own.length, r.finalDisplayedUrl.replace(base, '')].join(' | ')
      + (guard && guard.blocked.length ? ' | ENGELLENEN YAZMA: ' + guard.blocked.join(', ') : ''));
    console.log('   ' + live.line());
    await closeBrowser(browser);
    if (mock) live.assertNoLive();
  }
}
