// ============================================================
// WAWE JOURNAL - DEMO TARAYICI ORTAMI (tanıtım çekimleri için ortak kurulum)
// File: scripts/demo/browser.mjs
// ============================================================
// - dist/ (npx astro build) yerel bir statik sunucudan servis edilir.
// - *.supabase.co'ya giden HER istek backend.mjs'e yönlenir; realtime websocket yerelde cevaplanır.
//   Canlıya hiçbir istek çıkmaz: izin listesindeki CDN'ler dışındaki tüm dış istekler iptal edilir.
// - CDN dosyaları .demo-data/cdn-cache'e yazılır; sonraki çalıştırmalar internet olmadan da açılır.
// - Tarayıcı saati demo "şimdi"sine (db.meta.now) kaydırılır: Kasım 2026 dolu ay olarak görünür.
// Playwright repo bağımlılığı değil: PW_DIR=<node_modules/playwright içeren klasör> ile verilir.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createBackend } from './backend.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, '.demo-data');
const CDN_CACHE = path.join(DATA, 'cdn-cache');
const SUPABASE_RE = /^https:\/\/[a-z0-9]+\.supabase\.co\//;
const CDN_RE = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdnjs\.cloudflare\.com)\//;

export function loadPlaywright() {
  const base = process.env.PW_DIR ? path.resolve(process.env.PW_DIR) : ROOT;
  const req = createRequire(path.join(base, 'noop.js'));
  try { return req('playwright'); } catch (e) {
    throw new Error('playwright bulunamadı. Repo dışına kurun ve PW_DIR verin:\n  mkdir pw && cd pw && npm i playwright@1.49.1 && npx playwright install chromium\n  PW_DIR=pw node ' + process.argv[1]);
  }
}

// ── statik sunucu (dist/) ───────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
export function serveDist(port = 0) {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'dashboard.html'))) throw new Error('dist/ yok: önce "npx astro build" çalıştırın');
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    let f = path.join(dist, p);
    if (!f.startsWith(dist)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = fs.existsSync(f + '.html') ? f + '.html' : path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, origin: 'http://127.0.0.1:' + server.address().port })));
}

// ── sahne CSS'i: çekimde görünmemesi gerekenler ─────────────
export const CLEAN_CSS = `
  html, body, * { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
  [class*="quickAddFab"], [class*="quick-add-fab"], #quick-add-fab, .qa-fab { display: none !important; }
  astro-dev-toolbar, vite-error-overlay, #cookie-banner, .cookie-banner, [class*="cookie-consent"] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;
export const HIDE_TOASTS_CSS = `#ww-toast-container, .ww-toast-container, .toast-container { display: none !important; }`;
// Düz siyah sayfa zemini (yalnızca çekimde): ambiyans ışıkları (mesh + blur'lu orb'lar), body/html ::before/::after
// parlamaları ve zemin gradyanları kalkar. Kartlar, paneller, grafikler, butonlar ve üst menü olduğu gibi kalır.
export const BLACK_BG_CSS = `
  html, body { background: #000000 !important; background-image: none !important; }
  html::before, html::after, body::before, body::after { content: none !important; display: none !important; background: none !important; }
  .wj-ambient-backdrop, .wj-ambient-mesh, .wj-ambient-orb { display: none !important; }
  #app-scroll-container { background: transparent !important; background-image: none !important; }
  #bt-root.bt-fs #bt-view-replay { background: #000000 !important; }
`;

export async function launch({ viewport, deviceScaleFactor = 1, headless = true, hideToasts = true, blackBg = true, args = [], latencyMs = 120 } = {}) {
  const { chromium } = loadPlaywright();
  const dbFile = path.join(DATA, 'db.json');
  if (!fs.existsSync(dbFile)) throw new Error('.demo-data/db.json yok: önce "node scripts/seed-demo.mjs" çalıştırın');
  const meta = JSON.parse(fs.readFileSync(dbFile, 'utf8')).meta;
  const offset = Date.parse(meta.now) - Date.now();
  const backend = createBackend({ dbFile, now: () => Date.now() + offset, log: (m) => process.env.DEMO_VERBOSE && console.log(m) });
  const { server, origin } = await serveDist();
  // GPU: yazılımsal çizimde sayfa ~11 fps'e düşüyordu (ambiyans arka planı, grafikler); ANGLE/D3D11 ile ~58 fps
  const gpu = process.env.DEMO_GPU === '0' ? [] : process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']
    : ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ headless, args: ['--hide-scrollbars', '--force-color-profile=srgb', ...gpu, ...args] });
  const context = await browser.newContext({
    viewport, deviceScaleFactor, colorScheme: 'dark', locale: 'en-US', timezoneId: 'Europe/Istanbul', serviceWorkers: 'block'
  });
  const blocked = new Set();

  await context.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(origin)) return route.continue();
    if (SUPABASE_RE.test(url)) {
      // gerçekçi ağ gecikmesi: anında cevap, sayfaların dil dosyası yüklenmeden çizmesine yol açıyordu
      if (latencyMs && req.method() !== 'OPTIONS') await new Promise((r) => setTimeout(r, latencyMs));
      const out = backend.handle({ method: req.method(), url, headers: await req.allHeaders(), body: req.postData() });
      return route.fulfill({ status: out.status, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range', ...out.headers }, body: out.body });
    }
    if (CDN_RE.test(url) && req.method() === 'GET') {
      const key = crypto.createHash('sha1').update(url).digest('hex');
      const file = path.join(CDN_CACHE, key), metaFile = file + '.json';
      if (!fs.existsSync(file)) {
        try {
          const res = await route.fetch();
          if (res.ok()) {
            fs.mkdirSync(CDN_CACHE, { recursive: true });
            fs.writeFileSync(file, await res.body());
            fs.writeFileSync(metaFile, JSON.stringify({ url, type: res.headers()['content-type'] || '' }));
          } else return route.fulfill({ response: res });
        } catch (e) { blocked.add(url); return route.abort(); }
      }
      const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      return route.fulfill({ status: 200, headers: { 'content-type': m.type, 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    }
    blocked.add(url.slice(0, 120));
    return route.abort();
  });
  // realtime: Phoenix kanal katılımlarına "ok" der, sunucuya bağlanmaz
  if (!context.routeWebSocket) throw new Error('Playwright >= 1.48 gerekli (routeWebSocket): realtime canlıya bağlanmasın');
  {
    await context.routeWebSocket(/supabase\.co/, (ws) => {
      ws.onMessage((raw) => {
        try {
          const msg = JSON.parse(String(raw));
          const reply = (payload) => ws.send(JSON.stringify({ topic: msg.topic, event: 'phx_reply', payload, ref: msg.ref, join_ref: msg.join_ref }));
          if (msg.event === 'phx_join') reply({ status: 'ok', response: { postgres_changes: [] } });
          else if (msg.event === 'heartbeat' || msg.event === 'access_token' || msg.event === 'phx_leave') reply({ status: 'ok', response: {} });
        } catch (e) {}
      });
    });
  }

  const user = backend.db.users[0];
  await context.addInitScript(({ offset, uid, jid, target, css }) => {
    // saat: demo "şimdi"si (akış normal, yalnızca kaydırılmış)
    const RealDate = Date;
    class ShiftedDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
      static now() { return RealDate.now() + offset; }
    }
    ShiftedDate.parse = RealDate.parse; ShiftedDate.UTC = RealDate.UTC;
    // eslint-disable-next-line no-global-assign
    Date = ShiftedDate;
    try {
      const set = (k, v) => { if (localStorage.getItem(k) === null) localStorage.setItem(k, v); };
      set('ww_theme', 'dark'); set('ww_language', 'en'); set('ww_currency', '$');
      set('ww_active_journal_id', jid); set('activeJournalId', jid);
      set('ww_monthly_target_' + jid, String(target));
      set('wj_wizard_done_' + uid, 'true'); set('wj_tour_done_' + uid, 'true'); set('ww_onboarding_completed', 'true');
      set('wj_tasks_dismissed_' + uid, 'true'); set('wj_tasks_all_done_' + uid, 'true'); set('ww_tasks_dismissed', 'true');
    } catch (e) {}
    const add = () => { const s = document.createElement('style'); s.id = 'demo-clean-css'; s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  }, { offset, uid: user.id, jid: meta.journalId, target: meta.monthlyTarget, css: CLEAN_CSS + (hideToasts ? HIDE_TOASTS_CSS : '') + (blackBg ? BLACK_BG_CSS : '') });

  async function close() { await browser.close(); server.close(); }
  return { browser, context, origin, backend, meta, user, blocked, close };
}

// Demo kullanıcıyla oturum açar: uygulamanın kendi supabase istemcisiyle e-posta/şifre girişi (yerel sahte Auth'a karşı;
// giriş formundaki Turnstile yerelde çalışmadığı için form yerine aynı signInWithPassword çağrısı)
export async function login(page, origin, { email, password }) {
  await page.goto(origin + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.sb && window.sb.auth, null, { timeout: 20000 });
  const res = await page.evaluate(async ({ email, password }) => {
    const r = await window.sb.auth.signInWithPassword({ email, password });
    return r.error ? r.error.message : 'ok';
  }, { email, password });
  if (res !== 'ok') throw new Error('demo giriş başarısız: ' + res);
}

export function credentials() {
  return JSON.parse(fs.readFileSync(path.join(DATA, 'credentials.json'), 'utf8'));
}

// ağ boşta + ek bekleme; grafik animasyonları için
export async function settle(page, extraMs = 1500) {
  try { await page.waitForLoadState('networkidle', { timeout: 15000 }); } catch (e) {}
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(extraMs);
}
