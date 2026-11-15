// ============================================================
// CANLIYA KAÇAK TRAFİK SAYACI + TARAYICI SÜREÇ KONTROLÜ — scripts/perf/live-guard.mjs
// ============================================================
// Tarayıcının her hedefinde (sayfa, service worker, diğer worker'lar) CDP Network olaylarıyla *.supabase.co'ya giden HER
// isteği (REST, Auth, Storage, Edge Function, Realtime WebSocket) sayar ve sınıflandırır:
//   mock  : sahte arka uç cevapladı (mock-session.mjs, CDP Fetch)      cache : tarayıcı önbelleği / service worker cevapladı
//   live  : ağa çıktı (sahte modda DNS engeli yüzünden başarısız olur ama yine de KAÇAK denemesidir)
//   ws    : gerçek WebSocket açıldı (sahte Realtime sayfa içinde cevaplar; gerçek soket açılmamalı)
// Sahte modda live + ws > 0 ise assertNoLive() hata fırlatır → ölçüm / test başarısız. Gerçek hesap modunda yalnızca raporlanır.
// closeBrowser(browser): tarayıcıyı kapatır ve süreç ağacının (ana süreç + aynı profil klasörünü kullanan tüm Chrome
// süreçleri) gerçekten bittiğini doğrular; kalan varsa öldürür ve hata fırlatır.
// ============================================================
import { execFileSync } from 'node:child_process';

const SB = /^(?:https|wss):\/\/[a-z0-9]+\.supabase\.co\//;

export function watchLive(browser, { fulfilled } = {}) {
  const stats = { mock: 0, cache: 0, live: 0, ws: 0, liveUrls: [], wsUrls: [] };
  const seen = new Map();   // requestId → { url, cls }
  const attached = new WeakSet();
  const finish = (id, cls) => {
    const r = seen.get(id); if (!r || r.cls) return;
    r.cls = cls; stats[cls]++;
    if (cls === 'live' && stats.liveUrls.length < 20) stats.liveUrls.push(r.method + ' ' + r.url.replace(/\?.*$/, '').slice(0, 120));
  };
  const attach = async (target) => {
    if (attached.has(target) || !['page', 'service_worker', 'shared_worker', 'worker', 'other'].includes(target.type())) return;
    attached.add(target);
    const s = await target.createCDPSession().catch(() => null);
    if (!s) return;
    s.on('Network.requestWillBeSent', (e) => {
      if (!SB.test(e.request.url) || e.type === 'Preflight') return;   // CORS ön isteği asıl istekle birlikte sınıflanır
      if (!seen.has(e.requestId)) seen.set(e.requestId, { url: e.request.url, method: e.request.method, cls: null });
      if (fulfilled && fulfilled.has(e.requestId)) finish(e.requestId, 'mock');
    });
    s.on('Network.requestServedFromCache', (e) => finish(e.requestId, 'cache'));
    s.on('Network.responseReceived', (e) => {
      if (!seen.has(e.requestId)) return;
      if (fulfilled && fulfilled.has(e.requestId)) return finish(e.requestId, 'mock');
      const r = e.response || {};
      finish(e.requestId, r.fromServiceWorker || r.fromDiskCache || r.fromPrefetchCache || r.fromEarlyHints ? 'cache' : 'live');
    });
    s.on('Network.loadingFailed', (e) => {
      if (!seen.has(e.requestId)) return;
      if (fulfilled && fulfilled.has(e.requestId)) return finish(e.requestId, 'mock');
      finish(e.requestId, /BLOCKED_BY_CLIENT|ABORTED/.test(e.errorText || '') && !/NAME_NOT_RESOLVED/.test(e.errorText || '') ? 'cache' : 'live');
    });
    s.on('Network.webSocketCreated', (e) => {
      if (!SB.test(e.url)) return;
      stats.ws++; if (stats.wsUrls.length < 10) stats.wsUrls.push(e.url.replace(/apikey=[^&]+/, 'apikey=…').slice(0, 120));
    });
    await s.send('Network.enable').catch(() => {});
  };
  browser.on('targetcreated', attach);
  const ready = Promise.all(browser.targets().map(attach));
  return {
    ready, stats,
    // istek henüz bitmediyse (sayfa kapanırken) sınıfsız kalır: ağa çıkıp çıkmadığı bilinmez → canlı sayılır (güvenli taraf)
    summary() {
      for (const [id, r] of seen) if (!r.cls) finish(id, fulfilled && fulfilled.has(id) ? 'mock' : 'live');
      return { total: seen.size, mock: stats.mock, cache: stats.cache, live: stats.live, ws: stats.ws, liveUrls: stats.liveUrls, wsUrls: stats.wsUrls };
    },
    line() { const m = this.summary(); return `supabase.co istekleri: ${m.total} (sahte ${m.mock}, önbellek/SW ${m.cache}, CANLI ${m.live}) | gerçek WebSocket ${m.ws}`; },
    assertNoLive() {
      const m = this.summary();
      if (m.live + m.ws > 0) throw new Error(`SAHTE MODDA CANLIYA KAÇAK: ${m.live} istek, ${m.ws} WebSocket\n  ` + m.liveUrls.concat(m.wsUrls).join('\n  '));
      return m;
    },
  };
}

function pids(pattern) {
  try { return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).split('\n').map(Number).filter(Boolean); } catch (e) { return []; }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }

/** Tarayıcıyı kapatır ve tüm süreçlerinin bittiğini doğrular. Dönen: { pid, userDataDir }. Kalan süreç varsa öldürür ve hata fırlatır. */
export async function closeBrowser(browser, userDataDir = '') {
  const proc = typeof browser.process === 'function' ? browser.process() : null;
  const pid = proc ? proc.pid : null;
  // puppeteer.connect ile bağlanılan tarayıcıda süreç bilgisi yok: profil klasörü verilir
  const udd = (proc ? ((proc.spawnargs || []).find((a) => a.startsWith('--user-data-dir=')) || '').slice('--user-data-dir='.length) : '') || userDataDir;
  await browser.close().catch(() => {});
  const deadline = Date.now() + 8000;
  let left = [];
  while (Date.now() < deadline) {
    left = (pid && alive(pid) ? [pid] : []).concat(udd ? pids('user-data-dir=' + udd) : []).filter((p) => p !== process.pid);
    if (!left.length) return { pid, userDataDir: udd };
    await new Promise((r) => setTimeout(r, 200));
  }
  for (const p of new Set(left)) { try { process.kill(p, 'SIGKILL'); } catch (e) {} }
  throw new Error('Tarayıcı süreçleri kapanmadı (öldürüldü): ' + [...new Set(left)].join(', ') + (udd ? ' profil ' + udd : ''));
}
