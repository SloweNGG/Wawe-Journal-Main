// ============================================================
// REALTIME YENİDEN DENEME RİTMİ — scripts/perf/realtime-check.mjs
// ============================================================
// Sahte oturum + sahte Realtime sunucusu (fake-realtime.mjs; canlıya gitmez) ile bir sayfayı N saniye açık tutar ve
// Realtime'a yapılan her bağlantı / kanal katılma denemesini zamanıyla yazar.
//   --rt ok | jwt-error | jwt-expired    sunucunun phx_join cevabı (varsayılan jwt-error)
//   --close                              hata cevabından sonra sunucu soketi kapatır
//   --session valid | expired | none     sahte oturum: geçerli / süresi dolmuş ve yenilenemiyor / hiç yok
//   --page dashboard --secs 60
// Çıktı: soket açılışları, phx_join'ler (konu ve aralık), dakikadaki join sayısı.
//   PERF_DIR=<araçlar> node scripts/perf/realtime-check.mjs --base http://127.0.0.1:8788 --rt jwt-error --secs 60
// ============================================================
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS } from './mock-session.mjs';
import { installFakeRealtime } from './fake-realtime.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const rt = String(opt('rt', 'jwt-error'));
const sessionMode = String(opt('session', 'valid'));
const pageName = String(opt('page', 'dashboard'));
const secs = +opt('secs', 60);
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
let out, live;
try {
  const backend = createMockBackend({ auth: sessionMode === 'expired' ? 'refresh-fails' : 'ok' });
  await watchWorkers(browser, backend);
  live = watchLive(browser, { fulfilled: backend.fulfilled });
  await live.ready;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  if (sessionMode === 'none') {
    await installFakeRealtime(page, { mode: rt, closeAfterError: !!opt('close', false) });
    await mockSession(page, { backend, realtime: null, withSession: false });
  } else {
    await mockSession(page, { backend, realtime: null, expired: sessionMode === 'expired' });
    await installFakeRealtime(page, { mode: rt, closeAfterError: !!opt('close', false) });
  }
  await page.goto(base + '/' + pageName + '.html', { waitUntil: 'load' }).catch(() => {});
  await new Promise((r) => setTimeout(r, secs * 1000));
  out = await page.evaluate(() => ({ url: location.pathname, log: window.__wwRealtime || { sockets: 0, frames: [] } })).catch((e) => ({ url: '?', log: { sockets: 0, frames: [] }, err: e.message }));
  out.auth = backend.log.filter((l) => l.includes('/auth/v1/token')).length;
} finally {
  await closeBrowser(browser);
}
const f = out.log.frames;
const joins = f.filter((x) => x.dir === 'out' && x.msg[3] === 'phx_join');
const opens = f.filter((x) => x.dir === 'open');
const errs = f.filter((x) => x.dir === 'in' && x.msg[4] && x.msg[4].status === 'error');
console.log(`${pageName} (son adres ${out.url}) | oturum ${sessionMode} | sunucu ${rt}${opt('close', false) ? ' + kapat' : ''} | ${secs} sn | token yenileme isteği ${out.auth}`);
console.log(`soket açılışı ${opens.length} | phx_join ${joins.length} | hata cevabı ${errs.length} | dakikada join ${(joins.length / secs * 60).toFixed(1)}`);
let prev = null;
const topics = {};
for (const j of joins) { const k = j.msg[2].replace(/[0-9a-f-]{8,}/g, '…'); topics[k] = (topics[k] || 0) + 1; }
console.log('kanal başına join:', JSON.stringify(topics));
console.log('join zamanları (sn) ve aralıklar:', joins.slice(0, 40).map((j) => { const t = (j.t / 1000).toFixed(1); const d = prev == null ? '' : '+' + ((j.t - prev) / 1000).toFixed(1); prev = j.t; return t + d; }).join('  '));
console.log(live.line() + ' | tarayıcı süreçleri kapandı');
live.assertNoLive();
