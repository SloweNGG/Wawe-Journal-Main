// ============================================================
// SAHTE OTURUM (yalnızca yerel performans ölçümü) — scripts/perf/mock-session.mjs
// ============================================================
// Sayfayı giriş yapılmış gibi açar: localStorage'a sahte bir Supabase oturumu yazılır ve *.supabase.co'ya giden
// HER istek yerelde cevaplanır (40 işlem, 1 defter, 3 strateji, premium profil; istenirse avatar ve backtest hesabı).
//   - Sayfanın istekleri: CDP Fetch (Puppeteer'ın setRequestInterception'ı DEĞİL: o açıkken Chrome HTTP önbelleğini
//     kapatır ve service worker'ı atlar; önbellek / SW ölçümleri yanlış çıkar). Önbellekten ya da SW'den karşılanan
//     istek ağa çıkmadığı için burada görünmez (gerçek tarayıcıdaki gibi).
//   - Service worker'ın kendi istekleri (sayfa oturumu bunları görmez): watchWorkers(browser, backend) ile CDP Fetch.
//   - Realtime WebSocket'leri (istek yakalaması bunları da görmez): sayfa içinde sahte Phoenix sunucusu (fake-realtime.mjs).
// Canlı veritabanına hiçbir istek gitmez; güvenlik ağı olarak sahte modda Chrome *.supabase.co'yu hiç çözümlemez
// (MOCK_CHROME_ARGS). İşlem ekleme (POST /trades) yalnızca bellekte tutulur.
// ============================================================
import { installFakeRealtime } from './fake-realtime.mjs';

export const REF = 'odasapyhtdopbnlfhwde';
export const SB_ORIGIN = 'https://' + REF + '.supabase.co';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const JID = 'aaaa0000-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// Sahte modda canlıya kaçak olmasın: yakalanmayan bir istek olursa bile DNS çözülmez (bağlantı kurulamaz).
export const MOCK_CHROME_ARGS = ['--host-resolver-rules=MAP *.supabase.co ~NOTFOUND, MAP supabase.co ~NOTFOUND'];
export const AVATAR_PATH = '/storage/v1/object/public/avatars/avatars/' + USER_ID + '_1793560404898.jpg';

function sampleTrades(n, strats) {
  const syms = ['EURUSD', 'XAUUSD', 'NAS100', 'BTCUSD', 'GBPUSD'];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 1 + (i % 30), 9 + (i % 8)));
    const pnl = Math.round((Math.sin(i * 1.7) * 220 + 40) * 100) / 100;
    return { id: 'cccc0000-0000-4000-8000-' + String(i).padStart(12, '0'), user_id: USER_ID, symbol: syms[i % 5], direction: i % 2 ? 'SELL' : 'BUY',
      lot: 0.5 + (i % 3) * 0.5, entry_price: 1.08 + i / 1000, exit_price: 1.081 + i / 1000, stop_loss: 1.07, take_profit: 1.1, pnl, gross_pnl: pnl,
      commission: 2, swap: 0, trade_date: d.toISOString(), created_at: d.toISOString(), closed_at: d.toISOString(), status: 'closed',
      strategy_id: strats[i % strats.length].id, journal_id: JID, notes: '', platform_source: null, rr: 1.5, rr_ratio: 1.5, instrument: 'forex', multiplier: 100000 };
  });
}

/**
 * Sahte arka uç (sayfa ve service worker ortak kullanır).
 * opts.avatar: { bytes: Buffer, cacheControl } → profilde Storage avatarı; opts.backtest: true → bir sentetik backtest hesabı;
 * opts.auth: 'ok' | 'refresh-fails' (token yenileme 400 invalid_grant, /auth/v1/user 401: süresi dolmuş / iptal edilmiş oturum).
 * Dönen: { answer(req) → { status, headers, body: Buffer }, inserted, log, storage: { requests, bytes, notModified } }
 */
export function createMockBackend({ plan = 'premium', trades = 40, avatar = null, backtest = false, auth = 'ok' } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
  const user = { id: USER_ID, email: 'perf@test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { tasks_completed: true }, created_at: '2026-01-01T00:00:00Z' };
  const session = { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER_ID, exp, role: 'authenticated' }) + '.sig', refresh_token: 'r', expires_in: 3600 * 24 * 30, expires_at: exp, token_type: 'bearer', user };
  const journal = { id: JID, user_id: USER_ID, name: 'Ana Hesap', is_active: true, color: '#7c6dfa', icon: null, trade_scope: 'live', created_at: '2026-01-01T00:00:00Z' };
  const strats = ['Breakout', 'Pullback', 'Reversal'].map((name, i) => ({ id: 'bbbb0000-0000-4000-8000-00000000000' + i, user_id: USER_ID, name, color: ['#8b5cf6', '#22c55e', '#f59e0b'][i], description: '', created_at: '2026-01-01T00:00:00Z' }));
  const profile = { id: USER_ID, email: user.email, plan, role: 'user', is_admin: false, is_active: true, avatar_url: avatar ? SB_ORIGIN + AVATAR_PATH : null, full_name: 'Perf Test', created_at: '2026-01-01T00:00:00Z',
    plan_expires_at: '2027-01-01T00:00:00Z', onboarding_completed: true, onboarding_tour_completed: true, preferred_currency: 'USD' };
  const btAccounts = backtest ? [{ id: 'eeee0000-0000-4000-8000-000000000001', user_id: USER_ID, journal_id: null, name: 'Perf EURUSD', symbol: 'EURUSD', timeframe: '1h',
    starting_balance: 10000, spread_pips: 0.2, commission_per_lot: 7, replay_time: '2025-03-03T00:00:00Z', is_active: true, data_source: 'synthetic',
    source_ctid_account: null, source_broker_name: null, source_is_live: null, source_symbol_id: null, source_symbol_name: null, source_digits: null,
    section_no: 1, sections: [{ no: 1, start: '2025-03-03T00:00:00Z', at: '2026-01-01T00:00:00Z' }], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] : [];
  const rows = sampleTrades(trades, strats);
  const inserted = [];
  const log = [];
  const storage = { requests: 0, bytes: 0, notModified: 0 };
  const fulfilled = new Set();   // sahte arka ucun cevapladığı isteklerin Network requestId'leri (live-guard.mjs sınıflandırır)
  const etag = '"perf-avatar-1"';
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };

  function answer({ method, url, headers = {}, postData = '' }) {
    const u = new URL(url);
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const one = (h.accept || '').includes('vnd.pgrst.object');
    const json = (body, status = 200) => {
      const n = Array.isArray(body) ? body.length : 1;
      return { status, headers: { ...cors, 'content-type': 'application/json', 'content-range': (n ? '0-' + (n - 1) : '*') + '/' + n }, body: Buffer.from(JSON.stringify(body)) };
    };
    if (method === 'OPTIONS') return json({});
    log.push(method + ' ' + u.pathname);
    if (u.pathname.startsWith('/storage/v1/object/public/')) {
      storage.requests++;
      if (!avatar || u.pathname !== AVATAR_PATH) return { status: 400, headers: { ...cors, 'content-type': 'application/json' }, body: Buffer.from('{"statusCode":"404","error":"not_found"}') };
      const base = { ...cors, 'content-type': 'image/jpeg', 'cache-control': avatar.cacheControl || 'max-age=3600', etag, 'last-modified': 'Mon, 02 Nov 2026 10:00:00 GMT' };
      if (h['if-none-match'] === etag) { storage.notModified++; return { status: 304, headers: base, body: Buffer.alloc(0) }; }
      storage.bytes += avatar.bytes.length;
      return { status: 200, headers: { ...base, 'content-length': String(avatar.bytes.length) }, body: avatar.bytes };
    }
    if (auth === 'refresh-fails' && u.pathname === '/auth/v1/token') return json({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }, 400);
    if (auth === 'refresh-fails' && u.pathname.startsWith('/auth/v1/user')) return json({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT: token is expired' }, 401);
    if (u.pathname === '/auth/v1/token') return json(session);   // giriş / yenileme: aynı (geçerli) oturum
    if (u.pathname.startsWith('/auth/v1/user')) return json(user);
    if (u.pathname.startsWith('/auth/v1/')) return json({});
    const table = (u.pathname.match(/^\/rest\/v1\/(?:rpc\/)?([a-z_]+)/) || [])[1] || '';
    if (method === 'POST' && table === 'trades') {
      let body = [];
      try { body = JSON.parse(postData || '[]'); } catch (e) {}
      const add = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: 'dddd0000-0000-4000-8000-' + String(inserted.length + i).padStart(12, '0'), ...r }));
      inserted.push(...add);
      return json(one ? add[0] : add, 201);
    }
    if (table === 'profiles' || table === 'user_profiles') return json(one ? profile : [profile]);
    if (table === 'trades') return json(one ? rows[0] : rows.concat(inserted));
    if (u.pathname === '/rest/v1/rpc/list_journals') return json([journal]);
    if (table === 'journals') return json(one ? journal : [journal]);
    if (table === 'strategies') return json(one ? strats[0] : strats);
    if (table === 'backtest_accounts') return json(one ? btAccounts[0] || null : btAccounts);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/functions/v1/')) return json({});
    return json(one ? null : []);
  }
  const expiredSession = { ...session, expires_at: Math.floor(Date.now() / 1000) - 3600,
    access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER_ID, exp: Math.floor(Date.now() / 1000) - 3600, role: 'authenticated' }) + '.sig' };
  return { answer, inserted, log, storage, fulfilled, session, expiredSession, user, journalId: JID };
}

/**
 * page: Puppeteer sayfası. realtime: 'ok' | 'jwt-error' | … | null (sahte Realtime kurma). withSession: false → localStorage'a
 * oturum yazılmaz; expired: true → süresi dolmuş oturum yazılır. Dönen { inserted, log, storage, backend } ölçüm sonrası kontrol için.
 */
export async function mockSession(page, { plan = 'premium', trades = 40, lang = 'tr', avatar = null, backtest = false, realtime = 'ok', backend = null, withSession = true, expired = false } = {}) {
  const be = backend || createMockBackend({ plan, trades, avatar, backtest });
  await page.evaluateOnNewDocument((key, s, plan, lang, jid) => {
    try {
      // Oturum sekme başına BİR kez yazılır: supabase-js oturumu silerse (ör. yenileme reddedildi) sonraki sayfada geri
      // yazılmasın (yoksa login ↔ dashboard yönlendirme döngüsü kurulur; gerçek tarayıcıda olmayan bir durum)
      if (s && !sessionStorage.getItem('__ww_mock_seeded')) { localStorage.setItem(key, JSON.stringify(s)); sessionStorage.setItem('__ww_mock_seeded', '1'); }
      localStorage.setItem('ww_user_plan', plan);
      localStorage.setItem('ww_language', lang);
      localStorage.setItem('ww_active_journal_id', jid);
      localStorage.setItem('wj_wizard_done_00000000-0000-4000-8000-000000000001', 'true');
      localStorage.setItem('wj_tour_done_00000000-0000-4000-8000-000000000001', 'true');
    } catch (e) {}
  }, 'sb-' + REF + '-auth-token', withSession ? (expired ? be.expiredSession : be.session) : null, plan, lang, be.journalId);
  if (realtime) await installFakeRealtime(page, { mode: realtime });

  await fulfillFrom(await page.createCDPSession(), be);
  return { inserted: be.inserted, log: be.log, storage: be.storage, backend: be };
}

// Bir CDP oturumunda *.supabase.co isteklerini sahte arka uçtan cevaplar (diğer adresler yakalanmaz)
async function fulfillFrom(session, backend, from = 'page') {
  session.on('Fetch.requestPaused', async (e) => {
    try {
      if (process.env.MOCK_TRACE && e.request.url.includes('/storage/')) console.error('[mock]', from, e.request.method, (e.request.headers || {})['Sec-Fetch-Dest'] || '', (e.request.headers || {})['Sec-Fetch-Mode'] || '', e.request.url.slice(-30));
      const r = backend.answer({ method: e.request.method, url: e.request.url, headers: e.request.headers || {}, postData: e.request.postData || '' });
      if (e.networkId) backend.fulfilled.add(e.networkId);
      await session.send('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: r.status,
        responseHeaders: Object.entries(r.headers).map(([name, value]) => ({ name, value: String(value) })), body: r.body.toString('base64') });
    } catch (err) { /* hedef kapandıysa */ }
  });
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*://*.supabase.co/*', requestStage: 'Request' }] });
}

/**
 * Service worker'ların *.supabase.co isteklerini de sahte arka uçtan cevaplar (CDP Fetch). Sayfa yakalaması SW'nin kendi
 * fetch'lerini görmez; bu olmadan SW (ör. avatar önbelleği) canlıya giderdi. backend: createMockBackend() / mockSession().backend
 */
export function watchWorkers(browser, backend) {
  const attach = async (target) => {
    if (target.type() !== 'service_worker') return;
    const s = await target.createCDPSession().catch(() => null);
    if (!s) return;
    await fulfillFrom(s, backend, 'sw');
  };
  browser.on('targetcreated', attach);
  return Promise.all(browser.targets().map(attach));
}
