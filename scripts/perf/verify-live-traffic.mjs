// ============================================================
// fix/live-traffic CANLIYA ALMA ÖNCESİ OTOMATİK KONTROLLER — scripts/perf/verify-live-traffic.mjs
// ============================================================
// Sahte oturum + taklit Realtime + canlı trafik sayacı (live-guard.mjs) açıkken; canlıya istek gitmez (gitse hata).
//   A  avatar adresinde ?t= yok; ikinci açılıştan itibaren SW / disk önbelleğinden; Cache Storage'da wawe-storage-v1
//   B  avatar yüklemesi: JPEG → ≤ 256 px WebP, 1 yıl önbellek; GIF olduğu gibi
//   C  Realtime: bildirim olayı sayfa yenilenmeden zile düşer; plan değişikliği olayı sayfa yenilenmeden yansır
//   D  WS: geçerli oturumda tek soket + iki katılma, tekrar yok; geçersiz imzada 2 katılmadan sonra sessiz (realtime-check.mjs)
//   E  hata raporu: ekran görüntüsü sıkıştırılıp yüklenir, rapor screenshot_url ile kaydedilir
//   node scripts/perf/cf-serve.mjs dist 8788
//   PERF_DIR=<araçlar> node scripts/perf/verify-live-traffic.mjs --base http://127.0.0.1:8788 [--only A,B]
// Çıkış kodu: herhangi bir kontrol kalırsa 1.
// ============================================================
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromePath } from './chrome-path.mjs';
import { createMockBackend, mockSession, watchWorkers, MOCK_CHROME_ARGS, SB_ORIGIN, AVATAR_PATH } from './mock-session.mjs';
import { watchLive, closeBrowser } from './live-guard.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const base = String(opt('base', 'http://127.0.0.1:8788')).replace(/\/$/, '');
const only = opt('only', null) ? String(opt('only')).split(',') : null;
const req = createRequire(path.join(path.resolve(process.env.PERF_DIR || '.'), 'noop.js'));
const puppeteer = req('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, name, ok, detail) => { results.push({ id, name, ok: !!ok, detail }); console.log((ok ? 'GEÇTİ ' : 'KALDI ') + id + ' ' + name + (detail ? ' — ' + detail : '')); };
const want = (id) => !only || only.includes(id);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-verify-'));

// Sayfadaki Storage yüklemelerini yakalar: supabase-js FormData (cacheControl + dosya) ya da Blob gönderir
const CAPTURE_UPLOADS = () => {
  window.__uploads = [];
  const of = window.fetch;
  window.fetch = function (u, o) {
    try {
      const url = String(u && u.url ? u.url : u), method = (o && o.method) || 'GET';
      if (/\/storage\/v1\/object\//.test(url) && !/\/object\/(public|list)\//.test(url) && method !== 'GET' && method !== 'DELETE') {
        const rec = { url: url.replace(/^https:\/\/[^/]+/, ''), cacheControl: '', type: '', size: 0, w: 0, h: 0 };
        let blob = null;
        if (o.body instanceof FormData) { for (const [k, v] of o.body.entries()) { if (k === 'cacheControl') rec.cacheControl = String(v); else if (v instanceof Blob) blob = v; } }
        else if (o.body instanceof Blob) blob = o.body;
        const hh = new Headers(o.headers || {}); rec.cacheControl = rec.cacheControl || hh.get('cache-control') || '';
        if (blob) { rec.type = blob.type; rec.size = blob.size; createImageBitmap(blob).then((b) => { rec.w = b.width; rec.h = b.height; }, () => {}); }
        window.__uploads.push(rec);
      }
    } catch (e) {}
    return of.apply(this, arguments);
  };
};

async function makeImages(browser) {
  const p = await browser.newPage();
  const jpeg = Buffer.from(await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 1600; const x = c.getContext('2d');
    for (let j = 0; j < 6000; j++) { x.fillStyle = `hsl(${(j * 37) % 360},60%,${20 + (j % 60)}%)`; x.fillRect((j * 7919) % 1600, (j * 104729) % 1600, 4 + j % 40, 4 + j % 40); }
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  }));
  await p.close();
  const files = { jpeg: path.join(tmp, 'avatar-1600.jpg'), gif: path.join(tmp, 'avatar.gif'), png: path.join(tmp, 'shot.png') };
  fs.writeFileSync(files.jpeg, jpeg);
  fs.writeFileSync(files.gif, Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
  fs.writeFileSync(files.png, jpeg);   // içerik JPEG; sayfa uzantıdan değil türden bakar: aşağıda image/jpeg olarak seçilir
  return { files, jpegSize: jpeg.length };
}

const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: MOCK_CHROME_ARGS });
let live;
try {
  const { files, jpegSize } = await makeImages(browser);
  const avatarBytes = fs.readFileSync(files.jpeg);
  // Avatar gerçek bir yerel sunucudan (Storage gibi: max-age=3600, ETag, 304, CORS *): HTTP önbelleği gerçekçi çalışsın
  const avatarSrv = { requests: 0, full: 0, notModified: 0 };
  const server = http.createServer((rq, rs) => {
    avatarSrv.requests++;
    const hdr = { 'content-type': 'image/jpeg', 'cache-control': 'max-age=3600', etag: '"av1"', 'access-control-allow-origin': '*' };
    if (rq.headers['if-none-match'] === '"av1"') { avatarSrv.notModified++; rs.writeHead(304, hdr); return rs.end(); }
    avatarSrv.full++; rs.writeHead(200, hdr); rs.end(avatarBytes);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const backend = createMockBackend({ avatar: { bytes: avatarBytes, cacheControl: 'max-age=3600', serveFrom: 'http://127.0.0.1:' + server.address().port + '/avatar.jpg' }, plan: 'free' });
  process.on('exit', () => server.close());
  await watchWorkers(browser, backend);
  live = watchLive(browser, { fulfilled: backend.fulfilled });
  await live.ready;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(CAPTURE_UPLOADS);
  await page.evaluateOnNewDocument(() => { window.__planEvents = 0; window.addEventListener('ww-plan-changed', () => { window.__planEvents++; }); });
  await mockSession(page, { backend, plan: 'free' });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const avatarHits = [];
  const avatarUrl = SB_ORIGIN + AVATAR_PATH;
  cdp.on('Network.responseReceived', (e) => { if (e.response.url.startsWith(avatarUrl)) avatarHits.push({ url: e.response.url, sw: !!e.response.fromServiceWorker, disk: !!e.response.fromDiskCache, status: e.response.status }); });
  cdp.on('Network.requestServedFromCache', () => {});
  const settle = async (ms = 1500) => { await page.waitForNetworkIdle({ idleTime: 600, timeout: 15000 }).catch(() => {}); await sleep(ms); };
  const imgSrcs = () => page.evaluate(() => [...document.querySelectorAll('#user-avatar img, #menu-user-avatar img')].map((i) => i.getAttribute('src')));

  // ── A ──────────────────────────────────────────────────────
  if (want('A')) {
    const steps = [];
    for (const name of ['dashboard', 'trades', 'dashboard', 'calendar']) {
      const before = avatarSrv.full, hits = avatarHits.length;
      await page.goto(base + '/' + name + '.html', { waitUntil: 'load' }); await settle();
      steps.push({ name, srcs: await imgSrcs(), storage: avatarSrv.full - before, hits: avatarHits.slice(hits) });
    }
    const srcs = steps.flatMap((s) => s.srcs);
    check('A1', 'avatar adresinde ?t= yok', srcs.length > 0 && srcs.every((s) => s === avatarUrl), srcs.length + ' <img>: ' + [...new Set(srcs)].map((s) => s.replace(SB_ORIGIN, '')).join(', '));
    const later = steps.slice(1);
    const laterNet = later.reduce((n, s) => n + s.storage, 0);
    const laterHits = later.flatMap((s) => s.hits);
    check('A2', 'ikinci açılıştan itibaren avatar SW / disk önbelleğinden', laterNet === 0 && laterHits.every((h) => h.sw || h.disk),
      'adım başına Storage\'dan tam indirme: ' + steps.map((s) => s.name + '=' + s.storage).join(' ') + ` (toplam istek ${avatarSrv.requests}, 304 ${avatarSrv.notModified})` + ' | sonraki yanıtlar: ' + (laterHits.map((h) => h.sw ? 'SW' : h.disk ? 'disk' : 'AĞ').join(',') || 'bellek önbelleği'));
    const cs = await page.evaluate(async () => { const k = await caches.keys(); return { keys: k, n: k.includes('wawe-storage-v1') ? (await (await caches.open('wawe-storage-v1')).keys()).map((r) => r.url) : [] }; });
    check('A3', "Cache Storage'da wawe-storage-v1 (avatar içinde)", cs.n.includes(avatarUrl), cs.keys.join(', ') + ' | ' + cs.n.length + ' dosya');
  }

  // ── B ──────────────────────────────────────────────────────
  if (want('B')) {
    await page.goto(base + '/settings.html', { waitUntil: 'load' }); await settle(2500);
    const input = await page.waitForSelector('#avatar-file', { timeout: 20000 }).catch(() => null);
    if (!input) check('B0', 'ayarlar: #avatar-file bulunamadı', false, await page.evaluate(() => location.pathname + location.hash));
    else {
      for (const [kind, file] of [['jpeg', files.jpeg], ['gif', files.gif]]) {
        const n = await page.evaluate(() => window.__uploads.length);
        await input.uploadFile(file);
        await page.waitForFunction((n) => window.__uploads.length > n, { timeout: 20000 }, n).catch(() => {});
        await sleep(800);
        const up = await page.evaluate((n) => window.__uploads[n], n);
        if (!up) { check('B-' + kind, kind + ' yüklemesi yakalanamadı', false); continue; }
        if (kind === 'jpeg') check('B1', 'JPEG 1600×1600 → ≤ 256 px WebP, 1 yıl önbellek', up.type === 'image/webp' && Math.max(up.w, up.h) <= 256 && up.cacheControl === '31536000' && /\.webp$/.test(up.url),
          `${(jpegSize / 1024).toFixed(0)} KB → ${up.type} ${up.w}×${up.h} ${(up.size / 1024).toFixed(1)} KB, cacheControl ${up.cacheControl}, ${up.url.replace(/[0-9a-f-]{36}/, ':uid')}`);
        else check('B2', 'GIF olduğu gibi', up.type === 'image/gif' && up.size === fs.statSync(file).size && /\.gif$/.test(up.url), `${up.type} ${up.size} B (orijinal ${fs.statSync(file).size} B), ${up.url.replace(/[0-9a-f-]{36}/, ':uid')}`);
      }
      const prof = backend.state.writes.filter((w) => w.table === 'user_profiles');
      const av = prof.filter((w) => w.body && 'avatar_url' in w.body);
      check('B3', 'profil avatar_url iki yüklemede de yeni adresle güncellendi (sahte arka uçta)', av.length === 2 && av.every((w) => /\/storage\/v1\/object\/public\/avatars\/avatars\/.+\.(webp|gif)$/.test(w.body.avatar_url)),
        prof.length + ' profil yazması: ' + prof.map((w) => w.method + ' ' + Object.keys(w.body || {}).join('+')).join(', '));
    }
  }

  // ── C ──────────────────────────────────────────────────────
  if (want('C')) {
    let navs = 0; page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
    await page.goto(base + '/dashboard.html', { waitUntil: 'load' }); await settle(2500);
    navs = 0;
    const joined = await page.waitForFunction(() => (window.__wwRealtime || { frames: [] }).frames.filter((f) => f.dir === 'in' && f.msg[3] === 'phx_reply' && f.msg[4] && f.msg[4].status === 'ok' && f.msg[2] !== 'phoenix').length >= 2, { timeout: 15000 }).then(() => true, () => false);
    const row = { id: 'nnnn0000-0000-4000-8000-000000000001', user_id: backend.user.id, type: 'info', title: 'Perf bildirimi', message: 'Realtime testi', is_read: false, created_at: new Date().toISOString() };
    backend.state.notifications.unshift(row);
    const sent = await page.evaluate((r) => window.__wwRealtimePush('notifications', 'INSERT', r), row);
    const bell = await page.waitForFunction(() => { const b = document.getElementById('bell-badge'); return b && b.style.display !== 'none' && /^[1-9]/.test(b.textContent.trim()) && b.textContent.trim(); }, { timeout: 10000 }).then((h) => h.jsonValue(), () => null);
    check('C1', 'bildirim olayı sayfa yenilenmeden zile düştü', joined && sent >= 1 && bell && navs === 0, `kanallar katıldı ${joined}, olay ${sent} kanala, zil "${bell}", sayfa geçişi ${navs}`);
    const exp = new Date(Date.now() + 30 * 86400000).toISOString();
    Object.assign(backend.state.profile, { plan: 'premium', plan_expires_at: exp });
    const sent2 = await page.evaluate((p, e) => window.__wwRealtimePush('user_profiles', 'UPDATE', Object.assign({}, p, { plan: 'premium', plan_expires_at: e }), { id: p.id, plan: 'free' }), backend.state.profile, exp);
    const plan = await page.waitForFunction(() => sessionStorage.getItem('ww_user_plan') === 'premium' && window.__planEvents > 0, { timeout: 10000 }).then(() => true, () => false);
    const ui = await page.evaluate(() => ({ text: (document.getElementById('plan-text') || {}).textContent || '', pro: document.documentElement.classList.contains('is-pro') }));
    check('C2', 'plan değişikliği olayı sayfa yenilenmeden yansıdı', sent2 >= 1 && plan && navs === 0, `olay ${sent2} kanala, ww_user_plan=premium + ww-plan-changed ${plan}, rozet "${ui.text.trim()}", html.is-pro ${ui.pro}, sayfa geçişi ${navs}`);
  }

  // ── E ──────────────────────────────────────────────────────
  if (want('E')) {
    await page.goto(base + '/report-bug.html', { waitUntil: 'load' }); await settle(2000);
    const fi = await page.waitForSelector('#bug-file-input', { timeout: 15000 }).catch(() => null);
    if (!fi) check('E0', 'hata raporu formu bulunamadı', false, await page.evaluate(() => location.pathname));
    else {
      const n = await page.evaluate(() => window.__uploads.length);
      // input yalnızca png/jpeg/webp kabul ediyor; dosya JPEG içerik + .png ad (tarayıcı türü uzantıdan verir: image/png)
      await fi.uploadFile(files.png);
      await sleep(500);
      await page.type('#bug-subject', 'Perf otomatik kontrol');
      await page.type('#bug-desc', 'Ekran görüntüsü yükleme akışı (sahte oturum, canlıya gitmez).');
      await page.click('#submit-bug-btn');
      await page.waitForFunction((n) => window.__uploads.length > n, { timeout: 20000 }, n).catch(() => {});
      const done = await page.waitForFunction(() => !document.querySelector('#submit-bug-btn.loading'), { timeout: 20000 }).then(() => true, () => false);
      await sleep(1000);
      const up = await page.evaluate((n) => window.__uploads[n], n);
      const ins = backend.state.writes.find((w) => w.table === 'bug_reports');
      const shot = ins && (Array.isArray(ins.body) ? ins.body[0] : ins.body) || {};
      check('E1', 'ekran görüntüsü sıkıştırılıp bug-reports bucketına yüklendi', up && /\/object\/bug-reports\/screenshots\//.test(up.url) && up.type === 'image/jpeg' && up.cacheControl === '31536000' && Math.max(up.w, up.h) <= 1280,
        up ? `${up.url.replace(/bug_\d+_\w+/, 'bug_…')} ${up.type} ${up.w}×${up.h} ${(up.size / 1024).toFixed(0)} KB (orijinal ${(jpegSize / 1024).toFixed(0)} KB), cacheControl ${up.cacheControl}` : 'yükleme yok');
      check('E2', 'rapor screenshot_url ile kaydedildi, form bitti', done && ins && /\/storage\/v1\/object\/public\/bug-reports\/screenshots\//.test(shot.screenshot_url || ''), `insert ${!!ins}, screenshot_url ${(shot.screenshot_url || '').replace(SB_ORIGIN, '')}`);
    }
  }
} finally {
  await closeBrowser(browser);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── D (ayrı tarayıcılar: realtime-check.mjs) ────────────────
if (want('D')) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const run = (a) => execFileSync(process.execPath, [path.join(here, 'realtime-check.mjs'), '--base', base, ...a], { encoding: 'utf8', env: process.env });
  const parse = (o) => ({ sockets: +(o.match(/soket açılışı (\d+)/) || [])[1], joins: +(o.match(/phx_join (\d+)/) || [])[1], times: ((o.match(/aralıklar: (.*)/) || [])[1] || '').trim().split(/\s+/).map((x) => parseFloat(x)), leak: !/CANLI 0\) \| gerçek WebSocket 0/.test(o) });
  try {
    const ok = parse(run(['--rt', 'ok', '--secs', '30']));
    check('D1', 'geçerli oturum: tek soket, iki katılma, tekrar yok (30 sn)', ok.sockets === 1 && ok.joins === 2 && !ok.leak, `soket ${ok.sockets}, katılma ${ok.joins}`);
    const bad = parse(run(['--rt', 'jwt-error', '--secs', '40']));
    const lastJoin = Math.max(...bad.times.filter((t) => !isNaN(t)));
    check('D2', 'geçersiz imza: 2 katılmadan sonra sessiz (40 sn)', bad.joins === 2 && lastJoin < 10 && !bad.leak, `katılma ${bad.joins}, son katılma ${lastJoin} sn`);
  } catch (e) { check('D', 'realtime-check.mjs çalışmadı', false, String(e.message).split('\n')[0]); }
}

const m = live ? live.summary() : { total: 0, live: 0, ws: 0 };
check('L', 'canlı trafik sayacı 0', m.live === 0 && m.ws === 0, `supabase.co ${m.total} istek (sahte ${m.mock}, önbellek/SW ${m.cache}, canlı ${m.live}), gerçek WebSocket ${m.ws}; tarayıcı süreçleri kapandı`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} kontrol geçti` + (failed.length ? ' | KALAN: ' + failed.map((r) => r.id).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
