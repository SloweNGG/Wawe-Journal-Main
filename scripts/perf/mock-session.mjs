// ============================================================
// SAHTE OTURUM (yalnızca yerel performans ölçümü) — scripts/perf/mock-session.mjs
// ============================================================
// Sayfayı giriş yapılmış gibi açar: localStorage'a sahte bir Supabase oturumu yazılır ve *.supabase.co'ya giden
// HER istek Puppeteer'da yakalanıp yerelde cevaplanır (40 işlem, 1 defter, 3 strateji, premium profil).
// Canlı veritabanına hiçbir istek gitmez; işlem ekleme (POST /trades) yalnızca bellekte tutulur.
// ============================================================
const REF = 'odasapyhtdopbnlfhwde';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const JID = 'aaaa0000-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

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

/** page: Puppeteer sayfası. Dönen { inserted, log } ölçüm sonrası kontrol için. */
export async function mockSession(page, { plan = 'premium', trades = 40, lang = 'tr' } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
  const user = { id: USER_ID, email: 'perf@test.local', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { tasks_completed: true }, created_at: '2026-01-01T00:00:00Z' };
  const session = { access_token: b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USER_ID, exp, role: 'authenticated' }) + '.sig', refresh_token: 'r', expires_in: 3600 * 24 * 30, expires_at: exp, token_type: 'bearer', user };
  const journal = { id: JID, user_id: USER_ID, name: 'Ana Hesap', is_active: true, color: '#7c6dfa', icon: null, trade_scope: 'live', created_at: '2026-01-01T00:00:00Z' };
  const strats = ['Breakout', 'Pullback', 'Reversal'].map((name, i) => ({ id: 'bbbb0000-0000-4000-8000-00000000000' + i, user_id: USER_ID, name, color: ['#8b5cf6', '#22c55e', '#f59e0b'][i], description: '', created_at: '2026-01-01T00:00:00Z' }));
  const profile = { id: USER_ID, email: user.email, plan, role: 'user', is_admin: false, is_active: true, avatar_url: null, full_name: 'Perf Test', created_at: '2026-01-01T00:00:00Z',
    plan_expires_at: '2027-01-01T00:00:00Z', onboarding_completed: true, onboarding_tour_completed: true, preferred_currency: 'USD' };
  const rows = sampleTrades(trades, strats);
  const inserted = [];
  const log = [];

  await page.evaluateOnNewDocument((key, s, plan, lang, jid) => {
    try {
      localStorage.setItem(key, JSON.stringify(s));
      localStorage.setItem('ww_user_plan', plan);
      localStorage.setItem('ww_language', lang);
      localStorage.setItem('ww_active_journal_id', jid);
      localStorage.setItem('wj_wizard_done_' + s.user.id, 'true');
      localStorage.setItem('wj_tour_done_' + s.user.id, 'true');
    } catch (e) {}
  }, 'sb-' + REF + '-auth-token', session, plan, lang, JID);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (!url.includes(REF + '.supabase.co')) return req.continue();
    const u = new URL(url);
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (body, status = 200) => {
      const n = Array.isArray(body) ? body.length : 1;
      return req.respond({ status, contentType: 'application/json', body: JSON.stringify(body),
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range', 'content-range': (n ? '0-' + (n - 1) : '*') + '/' + n } });
    };
    if (req.method() === 'OPTIONS') return json({});
    log.push(req.method() + ' ' + u.pathname);
    if (u.pathname.startsWith('/auth/v1/user')) return json(user);
    if (u.pathname.startsWith('/auth/v1/')) return json({});
    const table = (u.pathname.match(/^\/rest\/v1\/(?:rpc\/)?([a-z_]+)/) || [])[1] || '';
    if (req.method() === 'POST' && table === 'trades') {
      let body = [];
      try { body = JSON.parse(req.postData() || '[]'); } catch (e) {}
      const add = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: 'dddd0000-0000-4000-8000-' + String(inserted.length + i).padStart(12, '0'), ...r }));
      inserted.push(...add);
      return json(one ? add[0] : add, 201);
    }
    if (table === 'profiles' || table === 'user_profiles') return json(one ? profile : [profile]);
    if (table === 'trades') return json(one ? rows[0] : rows.concat(inserted));
    if (u.pathname === '/rest/v1/rpc/list_journals') return json([journal]);
    if (table === 'journals') return json(one ? journal : [journal]);
    if (table === 'strategies') return json(one ? strats[0] : strats);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    if (u.pathname.startsWith('/functions/v1/')) return json({});
    return json(one ? null : []);
  });
  return { inserted, log };
}
