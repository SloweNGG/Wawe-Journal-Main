// Canlıya kaçak trafik sayacı (fix/live-traffic 3): scripts/perf/live-guard.mjs sınıflandırması sahte tarayıcıyla; ve her ölçüm /
// test aracının sahte modda DNS engeli + sayaç + süreç kontrolü kullandığı.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { watchLive, closeBrowser } from '../scripts/perf/live-guard.mjs';
import { MOCK_CHROME_ARGS } from '../scripts/perf/mock-session.mjs';

const SB = 'https://odasapyhtdopbnlfhwde.supabase.co';

function fakeBrowser() {
  const b = new EventEmitter();
  const sessions = [];
  b.targets = () => [];
  b.addTarget = async (type) => {
    const s = new EventEmitter(); s.send = async () => ({}); sessions.push(s);
    b.emit('targetcreated', { type: () => type, createCDPSession: async () => s });
    await new Promise((r) => setTimeout(r, 0));
    return s;
  };
  return b;
}
const req = (s, id, url, extra = {}) => s.emit('Network.requestWillBeSent', { requestId: id, request: { url, method: 'GET' }, type: 'Fetch', ...extra });

describe('live-guard watchLive', () => {
  it('classifies mock / cache / live / websocket; ignores other hosts and preflights', async () => {
    const b = fakeBrowser(), fulfilled = new Set(['m1']);
    const live = watchLive(b, { fulfilled });
    await live.ready;
    const page = await b.addTarget('page'), sw = await b.addTarget('service_worker');
    req(page, 'm1', SB + '/rest/v1/trades'); page.emit('Network.responseReceived', { requestId: 'm1', response: {} });
    req(page, 'c1', SB + '/storage/v1/object/public/avatars/a.jpg'); page.emit('Network.responseReceived', { requestId: 'c1', response: { fromServiceWorker: true } });
    req(page, 'c2', SB + '/storage/v1/object/public/avatars/a.jpg'); page.emit('Network.requestServedFromCache', { requestId: 'c2' });
    req(sw, 'l1', SB + '/storage/v1/object/public/avatars/b.jpg'); sw.emit('Network.loadingFailed', { requestId: 'l1', errorText: 'net::ERR_NAME_NOT_RESOLVED' });
    req(page, 'p1', SB + '/rest/v1/trades', { type: 'Preflight' });
    req(page, 'x1', 'https://cdn.jsdelivr.net/npm/x.js');
    page.emit('Network.webSocketCreated', { url: 'wss://odasapyhtdopbnlfhwde.supabase.co/realtime/v1/websocket?apikey=secret&vsn=2.0.0' });
    const m = live.summary();
    assert.deepEqual([m.total, m.mock, m.cache, m.live, m.ws], [4, 1, 2, 1, 1]);
    assert.ok(!m.wsUrls[0].includes('secret'), 'apikey is not printed');
    assert.throws(() => live.assertNoLive(), /SAHTE MODDA CANLIYA KAÇAK: 1 istek, 1 WebSocket/);
  });

  it('a request still pending at the end counts as live (safe side); a clean run passes', async () => {
    const b = fakeBrowser();
    const live = watchLive(b, { fulfilled: new Set(['m1']) });
    const page = await b.addTarget('page');
    req(page, 'm1', SB + '/rest/v1/x'); page.emit('Network.responseReceived', { requestId: 'm1', response: {} });
    assert.equal(live.assertNoLive().total, 1);
    req(page, 'u1', SB + '/rest/v1/y');
    assert.equal(live.summary().live, 1);
  });
});

describe('live-guard closeBrowser', () => {
  it('closes and returns when the browser process is gone', async () => {
    let closed = false;
    const b = { close: async () => { closed = true; }, process: () => ({ pid: 2147483646, spawnargs: ['chrome', '--user-data-dir=/nonexistent/ww-test-profile'] }) };
    const r = await closeBrowser(b);
    assert.ok(closed);
    assert.equal(r.userDataDir, '/nonexistent/ww-test-profile');
  });
});

describe('every measurement / test tool uses the guard', () => {
  it('mock mode never resolves *.supabase.co', () => {
    assert.ok(MOCK_CHROME_ARGS.some((a) => /--host-resolver-rules=.*\*\.supabase\.co ~NOTFOUND/.test(a)));
  });
  for (const f of ['scripts/perf/lighthouse.mjs', 'scripts/perf/cls.mjs', 'scripts/perf/storage-session.mjs', 'scripts/perf/realtime-check.mjs', 'tests/smoke/run.mjs']) {
    it(f + ': counts supabase.co traffic, fails on leaks, verifies the browser closed', () => {
      const src = fs.readFileSync(f, 'utf8');
      assert.match(src, /watchLive\(browser/);
      assert.match(src, /closeBrowser\(browser/);
      assert.match(src, /MOCK_CHROME_ARGS/);
      assert.match(src, /assertNoLive\(\)|liveSummary\.total > 0/);
      assert.doesNotMatch(src, /await browser\.close\(\)/);
    });
  }
  it('scripts/demo/browser.mjs: DNS block, leak counter, process check', () => {
    const src = fs.readFileSync('scripts/demo/browser.mjs', 'utf8');
    assert.match(src, /\.\.\.MOCK_CHROME_ARGS/);
    assert.match(src, /live\.leaks\.length\) throw new Error/);
    assert.match(src, /Tarayıcı süreçleri kapanmadı/);
    assert.match(src, /routeWebSocket\(\/supabase\\\.co\//);
  });
  it('mock-session answers via CDP Fetch (Puppeteer interception disables the cache and bypasses the service worker)', () => {
    const src = fs.readFileSync('scripts/perf/mock-session.mjs', 'utf8');
    assert.doesNotMatch(src, /\.setRequestInterception\(/);
    assert.match(src, /Fetch\.enable/);
    assert.match(src, /installFakeRealtime/);
  });
});
