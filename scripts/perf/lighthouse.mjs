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
// Chrome yolu: CHROME=... (varsayılan Windows yolu)
// ============================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { mockSession } from './mock-session.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const pages = String(opt('pages', 'dashboard,analytics,index')).split(',');
const runs = +opt('runs', 1);
const profile = opt('profile', null);
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const lighthouse = (await import('file:///' + req.resolve('lighthouse').replace(/\\/g, '/'))).default;

if (opt('login', false)) {
  if (!profile) throw new Error('--login için --profile <klasör> gerekli');
  const browser = await puppeteer.launch({ executablePath: chrome, headless: false, userDataDir: path.resolve(profile), defaultViewport: null });
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto(base + '/login.html');
  console.log('Tarayıcıda test hesabıyla giriş yapın, dashboard açılınca pencereyi kapatın.');
  await new Promise((r) => browser.on('disconnected', r));
  process.exit(0);
}

console.log('sayfa | puan | LCP | CLS | TBT | transfer (Supabase hariç) | istek | son adres');
for (const name of pages) {
  for (let i = 0; i < runs; i++) {
    const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', userDataDir: profile ? path.resolve(profile) : undefined });
    const page = await browser.newPage();
    if (opt('mock', false)) await mockSession(page);
    const cdp = await page.createCDPSession();
    await cdp.send('Network.clearBrowserCache');
    await cdp.send('Storage.clearDataForOrigin', { origin: new URL(base).origin, storageTypes: 'cache_storage,service_workers' }).catch(() => {});
    const res = await lighthouse(base + '/' + name + (name.endsWith('.html') ? '' : '.html'), {
      output: 'json', logLevel: 'error', onlyCategories: ['performance'], formFactor: 'mobile', throttlingMethod: 'simulate',
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75, disabled: false }, disableStorageReset: true,
    }, undefined, page);
    const r = res.lhr, a = r.audits;
    const items = (a['network-requests'].details && a['network-requests'].details.items) || [];
    const own = items.filter((x) => !x.url.includes('.supabase.co'));
    console.log([name, Math.round(r.categories.performance.score * 100), (a['largest-contentful-paint'].numericValue / 1000).toFixed(2) + ' s',
      a['cumulative-layout-shift'].numericValue.toFixed(3), Math.round(a['total-blocking-time'].numericValue) + ' ms',
      (own.reduce((s, x) => s + (x.transferSize || 0), 0) / 1024).toFixed(0) + ' KB', own.length, r.finalDisplayedUrl.replace(base, '')].join(' | '));
    await browser.close();
  }
}
