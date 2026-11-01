// ============================================================
// WAWE JOURNAL - YEREL SAHTE SUPABASE (yalnızca tanıtım çekimleri / demo)
// File: scripts/demo/backend.mjs
// ============================================================
// Canlı Supabase'e HİÇ istek gitmez: Playwright, *.supabase.co'ya giden her isteği (REST, Auth, RPC,
// Edge Function, Storage) bu modüle yönlendirir; realtime websocket'i de yerelde cevaplanır.
// Veri .demo-data/db.json'dan (scripts/seed-demo.mjs üretir) belleğe okunur. Çekim sırasında yapılan
// yazmalar (ör. backtest işlemleri) yalnızca bellekte kalır: her çalıştırma aynı seed verisiyle başlar.
//
// Desteklenen PostgREST alt kümesi: select (alias, cast, gömülü ilişki), eq/neq/gt/gte/lt/lte/like/ilike/
// is/in/cs/not.*, or=(...)/and=(...), order, limit/offset, Range, count=exact, HEAD, tek nesne Accept,
// insert / upsert (on_conflict) / update / delete, return=representation.
// ============================================================
import fs from 'node:fs';
import crypto from 'node:crypto';

const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

export function createBackend({ dbFile, now = () => Date.now(), log = () => {} }) {
  const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  db.tables = db.tables || {};
  const T = (name) => (db.tables[name] = db.tables[name] || []);
  const unknown = new Set();

  // ── yardımcılar ──────────────────────────────────────────
  const iso = () => new Date(now()).toISOString();
  const uuid = () => crypto.randomUUID();
  const json = (status, body, headers = {}) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: body === undefined ? '' : JSON.stringify(body) });
  const pgErr = (status, code, message) => json(status, { code, message, details: null, hint: null });

  function publicUser(u) {
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at,
      phone: '', confirmed_at: u.created_at, last_sign_in_at: iso(),
      app_metadata: u.app_metadata || { provider: 'email', providers: ['email'] },
      user_metadata: u.user_metadata || {}, identities: [], created_at: u.created_at, updated_at: u.created_at
    };
  }
  function session(u) {
    const exp = Math.floor(Date.UTC(2031, 0, 1) / 1000);         // uzun ömürlü: tarayıcı saati ileri alınsa da yenileme gerekmez
    const claims = { aud: 'authenticated', exp, iat: Math.floor(now() / 1000), sub: u.id, email: u.email, role: 'authenticated',
      app_metadata: publicUser(u).app_metadata, user_metadata: publicUser(u).user_metadata, session_id: uuid() };
    const token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc(claims) + '.' + crypto.createHmac('sha256', 'local-demo').update(enc(claims)).digest('base64url');
    const refresh = 'r-' + u.id;
    return { access_token: token, token_type: 'bearer', expires_in: exp - Math.floor(now() / 1000), expires_at: exp, refresh_token: refresh, user: publicUser(u) };
  }
  function userFromAuth(headers) {
    const h = headers.authorization || headers.Authorization || '';
    const m = /^Bearer\s+([^.]+)\.([^.]+)\./.exec(h);
    if (!m) return null;
    try {
      const claims = JSON.parse(Buffer.from(m[2], 'base64url').toString());
      return (db.users || []).find((u) => u.id === claims.sub) || null;
    } catch (e) { return null; }
  }

  // ── değer karşılaştırma ─────────────────────────────────
  const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
  function cmp(a, b) {
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b) ? 0 : (String(a) < String(b) ? -1 : 1);
    const na = typeof a === 'number' ? a : (String(a).trim() !== '' && !DATE_RE.test(String(a)) ? Number(a) : NaN);
    const nb = typeof b === 'number' ? b : (String(b).trim() !== '' && !DATE_RE.test(String(b)) ? Number(b) : NaN);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb ? 0 : (na < nb ? -1 : 1);
    if (DATE_RE.test(String(a)) && DATE_RE.test(String(b))) {
      const da = Date.parse(String(a).length === 10 ? a + 'T00:00:00Z' : a), dbb = Date.parse(String(b).length === 10 ? b + 'T00:00:00Z' : b);
      if (Number.isFinite(da) && Number.isFinite(dbb)) return da === dbb ? 0 : (da < dbb ? -1 : 1);
    }
    const sa = String(a), sb = String(b);
    return sa === sb ? 0 : (sa < sb ? -1 : 1);
  }
  const likeRe = (p, flags) => new RegExp('^' + String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*').replace(/_/g, '.') + '$', flags);
  function unquote(v) { v = String(v); return v.length > 1 && v[0] === '"' && v[v.length - 1] === '"' ? v.slice(1, -1) : v; }
  function splitTop(s) {          // virgülle ayır, parantez/tırnak içini koru
    const out = []; let depth = 0, q = false, cur = '';
    for (const ch of s) {
      if (ch === '"') q = !q;
      if (!q && ch === '(') depth++;
      if (!q && ch === ')') depth--;
      if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur !== '') out.push(cur);
    return out;
  }
  function getPath(row, col) {
    // json yolu: col->a->>b
    const parts = col.split(/->>?/);
    let v = row[parts[0].trim()];
    for (let i = 1; i < parts.length && v != null; i++) v = v[parts[i].trim().replace(/^'|'$/g, '')];
    return v;
  }
  function test(row, col, opExpr) {
    let neg = false;
    if (opExpr.startsWith('not.')) { neg = true; opExpr = opExpr.slice(4); }
    const dot = opExpr.indexOf('.');
    const op = dot < 0 ? opExpr : opExpr.slice(0, dot);
    const val = dot < 0 ? '' : opExpr.slice(dot + 1);
    const v = getPath(row, col);
    let r;
    switch (op) {
      case 'eq': r = v !== null && v !== undefined && cmp(v, unquote(val)) === 0; break;
      case 'neq': r = v !== null && v !== undefined && cmp(v, unquote(val)) !== 0; break;
      case 'gt': r = v != null && cmp(v, unquote(val)) > 0; break;
      case 'gte': r = v != null && cmp(v, unquote(val)) >= 0; break;
      case 'lt': r = v != null && cmp(v, unquote(val)) < 0; break;
      case 'lte': r = v != null && cmp(v, unquote(val)) <= 0; break;
      case 'like': r = v != null && likeRe(unquote(val), '').test(String(v)); break;
      case 'ilike': r = v != null && likeRe(unquote(val), 'i').test(String(v)); break;
      case 'is': {
        const w = val.toLowerCase();
        r = w === 'null' ? v === null || v === undefined : w === 'true' ? v === true : w === 'false' ? v === false : false;
        break;
      }
      case 'in': {
        const list = splitTop(val.replace(/^\(|\)$/g, '')).map(unquote);
        r = v != null && list.some((x) => cmp(v, x) === 0);
        break;
      }
      case 'cs': {
        let want; try { want = JSON.parse(val.replace(/^\{/, '[').replace(/\}$/, ']')); } catch (e) { want = [val]; }
        r = Array.isArray(v) && want.every((x) => v.includes(x));
        break;
      }
      case 'ov': {
        const want = val.replace(/^[{(]|[})]$/g, '').split(',').map(unquote);
        r = Array.isArray(v) && want.some((x) => v.includes(x));
        break;
      }
      default: log('[demo-backend] bilinmeyen operatör ' + op); r = true;
    }
    return neg ? !r : r;
  }
  function logic(row, kind, inner) {     // kind: or|and, inner: "a.eq.1,b.is.null,and(c.gt.2,d.lt.3)"
    const parts = splitTop(inner);
    const results = parts.map((p) => {
      const m = /^(not\.)?(or|and)\((.*)\)$/.exec(p);
      if (m) { const r = logic(row, m[2], m[3]); return m[1] ? !r : r; }
      const d = p.indexOf('.');
      return test(row, p.slice(0, d), p.slice(d + 1));
    });
    return kind === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  function applyFilters(rows, params) {
    let out = rows;
    for (const [k, v] of params) {
      if (RESERVED.has(k)) continue;
      if (k === 'or' || k === 'and' || k === 'not.or' || k === 'not.and') {
        const kind = k.replace('not.', '');
        out = out.filter((r) => { const x = logic(r, kind, v.replace(/^\(|\)$/g, '')); return k.startsWith('not.') ? !x : x; });
      } else if (!k.includes('.')) {
        out = out.filter((r) => test(r, k, v));
      }
    }
    return out;
  }
  function applyOrder(rows, order) {
    if (!order) return rows;
    const keys = splitTop(order).map((s) => {
      const p = s.split('.');
      return { col: p[0], desc: p.includes('desc'), nullsFirst: p.includes('nullsfirst') ? true : p.includes('nullslast') ? false : null };
    });
    return rows.slice().sort((a, b) => {
      for (const k of keys) {
        const va = getPath(a, k.col), vb = getPath(b, k.col);
        const an = va == null, bn = vb == null;
        if (an || bn) {
          if (an && bn) continue;
          const nf = k.nullsFirst === null ? k.desc : k.nullsFirst;   // PostgreSQL varsayılanı: ASC nulls last, DESC nulls first
          return an ? (nf ? -1 : 1) : (nf ? 1 : -1);
        }
        const c = cmp(va, vb);
        if (c) return k.desc ? -c : c;
      }
      return 0;
    });
  }

  // ── select / gömülü ilişkiler ───────────────────────────
  const singular = (t) => t.replace(/ies$/, 'y').replace(/s$/, '');
  function parseSelect(sel) {
    return splitTop(sel || '*').map((s) => s.trim()).filter(Boolean).map((s) => {
      const em = /^(?:([\w]+):)?([\w]+)(?:!([\w]+))?(?:!inner)?\((.*)\)$/.exec(s);
      if (em) return { embed: true, alias: em[1] || em[2], table: em[2], hint: em[3], inner: em[4] };
      const m = /^(?:([\w]+):)?([\w>\-']+?)(?:::(\w+))?$/.exec(s);
      if (!m) return { col: s, alias: s };
      return { col: m[2], alias: m[1] || m[2].split(/->>?/).pop().replace(/'/g, ''), cast: m[3] };
    });
  }
  function project(row, fields, table) {
    if (fields.length === 1 && fields[0].col === '*') return { ...row };
    const out = {};
    for (const f of fields) {
      if (f.col === '*') { Object.assign(out, row); continue; }
      if (f.embed) { out[f.alias] = embed(row, table, f); continue; }
      let v = getPath(row, f.col);
      if (f.cast === 'text' && v != null) v = String(v);
      out[f.alias] = v === undefined ? null : v;
    }
    return out;
  }
  function embed(row, parentTable, f) {
    const child = T(f.table), sub = parseSelect(f.inner);
    const fk = f.hint && row[f.hint] !== undefined ? f.hint : singular(f.table) + '_id';
    if (row[fk] !== undefined) {                                         // çoka-bir (trades.strategy_id -> strategies)
      const hit = child.find((c) => c.id === row[fk]);
      return hit ? project(hit, sub, f.table) : null;
    }
    const back = singular(parentTable) + '_id';                          // bire-çok (journals -> trades.journal_id)
    return child.filter((c) => c[back] === row.id).map((c) => project(c, sub, f.table));
  }

  // ── satır varsayılanları ────────────────────────────────
  function defaults(table, row, user) {
    const r = { ...row };
    if (r.id === undefined && table !== 'user_profiles' && table !== 'system_settings') r.id = uuid();
    if (r.created_at === undefined) r.created_at = iso();
    if (r.updated_at === undefined && /^(trades|strategies|journals|backtest_accounts|user_profiles|backtest_drawings)$/.test(table)) r.updated_at = iso();
    if (r.user_id === undefined && user && table !== 'user_profiles' && table !== 'system_settings') r.user_id = user.id;
    if (table === 'trades') {
      if (r.pnl === undefined || r.pnl === null) {
        const g = Number(r.gross_pnl || 0);
        r.pnl = Math.round((g - Number(r.commission || 0) + Number(r.swap || 0)) * 100) / 100;
      }
    }
    return r;
  }
  // RLS taklidi: kullanıcı yalnızca kendi satırlarını görür
  function visible(table, user) {
    const rows = T(table);
    if (table === 'system_settings') return rows;
    if (!user) return [];
    if (table === 'user_profiles') return rows.filter((r) => r.id === user.id);
    return rows.filter((r) => r.user_id === undefined || r.user_id === user.id);
  }

  // ── REST ────────────────────────────────────────────────
  function rest(method, table, params, headers, body, user) {
    const prefer = String(headers.prefer || headers.Prefer || '');
    const accept = String(headers.accept || headers.Accept || '');
    const fields = parseSelect(params.get('select'));
    const wantRows = /return=representation/.test(prefer);
    if (!db.tables[table] && !/^(trades|strategies|journals|user_profiles)$/.test(table)) unknown.add('table:' + table);

    if (method === 'GET' || method === 'HEAD') {
      let rows = applyFilters(visible(table, user), params);
      // gömülü !inner filtreleri (strategies.name=eq.x gibi) desteklenmez; yalnızca loglanır
      for (const [k] of params) if (k.includes('.') && !RESERVED.has(k) && !/^(not\.)?(or|and)$/.test(k)) log('[demo-backend] gömülü filtre yok sayıldı: ' + k);
      rows = applyOrder(rows, params.get('order'));
      const total = rows.length;
      let from = Number(params.get('offset') || 0), limit = params.get('limit') !== null ? Number(params.get('limit')) : null;
      const range = /(\d+)-(\d*)/.exec(headers.range || headers.Range || '');
      if (range) { from = Number(range[1]); if (range[2] !== '') limit = Number(range[2]) - from + 1; }
      rows = rows.slice(from, limit === null ? undefined : from + limit);
      const out = rows.map((r) => project(r, fields, table));
      const h = { 'content-range': (out.length ? from + '-' + (from + out.length - 1) : '*') + '/' + (/count=/.test(prefer) ? total : '*') };
      if (/vnd\.pgrst\.object/.test(accept)) {
        if (out.length !== 1) return pgErr(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
        return json(200, method === 'HEAD' ? undefined : out[0], h);
      }
      return json(200, method === 'HEAD' ? undefined : out, h);
    }

    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const conflict = params.get('on_conflict');
      const merge = /resolution=merge-duplicates/.test(prefer), ignore = /resolution=ignore-duplicates/.test(prefer);
      const keys = conflict ? conflict.split(',') : ['id'];
      const out = [];
      for (const raw of list) {
        const row = defaults(table, raw, user);
        const existing = (merge || ignore) ? T(table).find((r) => keys.every((k) => r[k] !== undefined && r[k] === row[k])) : null;
        if (existing) {
          if (ignore) continue;
          Object.assign(existing, raw, { updated_at: iso() });
          out.push(existing);
        } else {
          T(table).push(row);
          out.push(row);
        }
      }
      const proj = out.map((r) => project(r, fields, table));
      if (!wantRows) return json(201, undefined);
      if (/vnd\.pgrst\.object/.test(accept)) return json(201, proj[0] || null);
      return json(201, proj);
    }

    if (method === 'PATCH') {
      const rows = applyFilters(visible(table, user), params);
      rows.forEach((r) => Object.assign(r, body, r.updated_at !== undefined ? { updated_at: iso() } : {}));
      const proj = rows.map((r) => project(r, fields, table));
      if (!wantRows) return json(204, undefined);
      if (/vnd\.pgrst\.object/.test(accept)) return proj.length === 1 ? json(200, proj[0]) : pgErr(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned');
      return json(200, proj);
    }

    if (method === 'DELETE') {
      const rows = new Set(applyFilters(visible(table, user), params));
      db.tables[table] = T(table).filter((r) => !rows.has(r));
      const proj = [...rows].map((r) => project(r, fields, table));
      return wantRows ? json(200, proj) : json(204, undefined);
    }
    return pgErr(405, 'PGRST000', 'method not allowed');
  }

  // ── RPC ─────────────────────────────────────────────────
  function journalStats(j) {
    const ts = T('trades').filter((t) => t.journal_id === j.id && t.platform_source !== 'backtest');
    const pnl = ts.reduce((s, t) => s + Number(t.pnl || 0), 0);
    const wins = ts.filter((t) => Number(t.pnl) > 0).length;
    const last = ts.reduce((m, t) => (t.trade_date > m ? t.trade_date : m), '');
    return {
      trade_count: ts.length, strategy_count: T('strategies').filter((s) => s.journal_id === j.id).length,
      total_pnl: Math.round(pnl * 100) / 100, win_rate: ts.length ? Math.round((wins / ts.length) * 10000) / 100 : 0,
      last_trade_date: last ? last.slice(0, 10) : null
    };
  }
  function journalRow(j, user) {
    const mine = T('journals').filter((x) => x.user_id === user.id && x.is_active !== false);
    return {
      id: j.id, name: j.name, description: j.description, color: j.color, icon: j.icon, is_default: !!j.is_default,
      ...journalStats(j), created_at: j.created_at, max_journals: 10, can_create: mine.length < 10,
      platform: j.platform || 'manual', is_connected: false, connection_status: null, last_synced_at: null,
      is_prop_firm: false, prop_firm_rules: null, prop_firm_status: null, prop_firm_stats: null, trade_scope: j.trade_scope || 'live'
    };
  }
  const RPC = {
    list_journals: (a, u) => T('journals').filter((j) => j.user_id === u.id && j.is_active !== false)
      .sort((x, y) => cmp(x.created_at, y.created_at)).map((j) => journalRow(j, u)),
    get_journal: (a, u) => { const j = T('journals').find((x) => x.id === a.p_journal_id && x.user_id === u.id); return j ? journalRow(j, u) : null; },
    switch_default_journal: (a, u) => { T('journals').forEach((j) => { if (j.user_id === u.id) j.is_default = j.id === a.p_journal_id; }); return true; },
    create_journal: (a, u) => {
      const j = defaults('journals', { user_id: u.id, name: a.p_name, description: a.p_description, color: a.p_color, icon: a.p_icon, trade_scope: a.p_trade_scope || 'live', is_default: false, is_active: true }, u);
      T('journals').push(j); return journalRow(j, u);
    },
    update_journal: (a, u) => {
      const j = T('journals').find((x) => x.id === a.p_journal_id && x.user_id === u.id); if (!j) return null;
      ['name', 'description', 'color', 'icon', 'trade_scope'].forEach((k) => { if (a['p_' + k] != null) j[k] = a['p_' + k]; });
      return journalRow(j, u);
    },
    delete_journal: () => true,
    get_ctrader_status: () => ({ token_status: 'none', accounts: [] }),
    get_backtest_trade_usage: () => ({ used: 0, limit: null, premium: true }),
    get_backtest_plan_usage: () => ({ premium: true, plan: 'premium' }),
    get_prices: () => T('system_settings').find((s) => s.key === 'prices')?.value || null,
    get_platform_stats: () => ({ total_users: 0, total_trades: 0 }),
    mark_notifications_as_read: () => true,
    mark_notification_as_read: () => true,
    complete_user_onboarding: () => true,
    get_dev_test_status: () => ({ active: false }),
    get_my_partner_application: () => null,
    get_influencer_earnings: () => [],
    get_influencer_payout_summary: () => null,
  };
  function rpc(name, args, user) {
    const fn = RPC[name];
    if (!fn) { unknown.add('rpc:' + name); return pgErr(404, 'PGRST202', 'Could not find the function public.' + name); }
    if (!user) return pgErr(401, '42501', 'Not authenticated');
    return json(200, fn(args || {}, user));
  }

  // ── Auth (GoTrue) ───────────────────────────────────────
  function auth(method, path, params, headers, body) {
    if (path === 'token') {
      const grant = params.get('grant_type');
      let u = null;
      if (grant === 'password') {
        u = (db.users || []).find((x) => x.email.toLowerCase() === String(body.email || '').toLowerCase());
        if (!u || hashPassword(body.password, u.salt) !== u.password_hash) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      } else if (grant === 'refresh_token') {
        u = (db.users || []).find((x) => 'r-' + x.id === body.refresh_token);
        if (!u) return json(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      }
      return u ? json(200, session(u)) : json(400, { msg: 'unsupported grant' });
    }
    if (path === 'user') {
      const u = userFromAuth(headers);
      if (!u) return json(401, { code: 401, msg: 'invalid JWT' });
      if (method === 'PUT') { u.user_metadata = { ...(u.user_metadata || {}), ...((body && body.data) || {}) }; }
      return json(200, publicUser(u));
    }
    if (path === 'logout') return json(204, undefined);
    if (path === 'settings') return json(200, { external: { email: true, google: false }, disable_signup: true });
    return json(404, { msg: 'not found' });
  }

  // ── giriş noktası ───────────────────────────────────────
  function handle({ method, url, headers = {}, body }) {
    const u = new URL(url);
    let parsed = body;
    if (typeof body === 'string' && body) { try { parsed = JSON.parse(body); } catch (e) { parsed = Object.fromEntries(new URLSearchParams(body)); } }
    const user = userFromAuth(headers);
    const p = u.pathname;
    let m;
    if (method === 'OPTIONS') return { status: 204, headers: {}, body: '' };
    if ((m = /^\/auth\/v1\/(\w+)/.exec(p))) return auth(method, m[1], u.searchParams, headers, parsed || {});
    if ((m = /^\/rest\/v1\/rpc\/(\w+)/.exec(p))) {
      const args = method === 'GET' ? Object.fromEntries(u.searchParams) : parsed;
      return rpc(m[1], args, user);
    }
    if ((m = /^\/rest\/v1\/(\w+)/.exec(p))) return rest(method, m[1], u.searchParams, headers, parsed, user);
    if ((m = /^\/functions\/v1\/([\w-]+)/.exec(p))) {
      unknown.add('function:' + m[1]);
      if (m[1] === 'verify-auth') return json(200, { ok: true });
      return json(200, { ok: false, code: 'DEMO', error: 'Edge Functions are disabled in the local demo' });
    }
    if (/^\/storage\/v1\//.test(p)) return json(404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    unknown.add('path:' + p);
    return json(404, { message: 'not found' });
  }

  return { handle, db, unknown };
}
