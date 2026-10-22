// Browser-side PostgREST-ish emulator for the page differential check (NOT repo/app code).
// Installed as window.__emu before any page script; the supabase-js CDN script is replaced by a stub whose
// createClient() returns it. Data comes from window.__DATA ({ table: [rows] }), flags from window.__FLAGS.
(function () {
  var LIVE_OR = 'platform_source.is.null,platform_source.neq.backtest';
  var D = window.__DATA || {};
  var FLAGS = window.__FLAGS || {};
  function tbl(name) { return D[name] || (D[name] = []); }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function val(v) { return v === undefined ? null : v; }

  function matcher(filters) {
    return function (row) {
      for (var i = 0; i < filters.length; i++) {
        var f = filters[i], k = f[0], c = f[1], v = f[2], x = row[c];
        if (k === 'eq' && String(x) !== String(v)) return false;
        if (k === 'neq' && (x == null || String(x) === String(v))) return false;
        if (k === 'is' && (v === null ? x != null : x !== v)) return false;
        if (k === 'in' && v.map(String).indexOf(String(x)) < 0) return false;
        if (k === 'gte' && !(x != null && x >= v)) return false;
        if (k === 'gt' && !(x != null && x > v)) return false;
        if (k === 'lte' && !(x != null && x <= v)) return false;
        if (k === 'lt' && !(x != null && x < v)) return false;
        if (k === 'like' || k === 'ilike') {
          var re = new RegExp('^' + String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', k === 'ilike' ? 'i' : '');
          if (!re.test(String(x == null ? '' : x))) return false;
        }
        if (k === 'not' && f[2] === 'is' && f[3] === null && x == null) return false;
        if (k === 'or') {
          if (f[1] !== LIVE_OR) throw new Error('emulator: unsupported or(): ' + f[1]);
          if (FLAGS.ignoreLiveOr) continue;   // mutation mode: pretend the live filter does nothing (a leak) to prove the check can see it
          if (!(row.platform_source == null || row.platform_source !== 'backtest')) return false;
        }
      }
      return true;
    };
  }
  function project(row, cols) {
    if (!cols || cols === '*') { var o = {}; Object.keys(row).forEach(function (k) { o[k] = row[k]; }); return o; }
    var out = {};
    cols.split(',').forEach(function (c) { c = c.trim(); if (c && c.indexOf('(') < 0) out[c] = val(row[c]); });
    return out;
  }

  function from(table) {
    var call = { op: 'select', cols: '*', filters: [], orders: [], range: null, limit: null, head: false, count: null, single: null, payload: null };
    var b = {
      select: function (c, o) { if (call.op === 'select') call.cols = c === undefined ? '*' : c; call.returning = true; if (o) { call.head = !!o.head; call.count = o.count || null; } return b; },
      insert: function (p) { call.op = 'insert'; call.payload = p; return b; },
      upsert: function (p) { call.op = 'upsert'; call.payload = p; return b; },
      update: function (p) { call.op = 'update'; call.payload = p; return b; },
      delete: function () { call.op = 'delete'; return b; },
      order: function (c, o) { call.orders.push([c, !!(o && o.ascending), o && o.nullsFirst]); return b; },
      range: function (a, z) { call.range = [a, z]; return b; },
      limit: function (n) { call.limit = n; return b; },
      single: function () { call.single = 'single'; return b; },
      maybeSingle: function () { call.single = 'maybe'; return b; },
      then: function (res, rej) { return Promise.resolve().then(function () { return run(table, call); }).then(res, rej); }
    };
    ['eq', 'neq', 'is', 'in', 'gte', 'gt', 'lte', 'lt', 'like', 'ilike'].forEach(function (k) {
      b[k] = function (c, v) { call.filters.push([k, c, v]); return b; };
    });
    b.not = function (c, op, v) { call.filters.push(['not', c, op, v]); return b; };
    b.or = function (s) { call.filters.push(['or', s]); return b; };
    b.match = function (o) { Object.keys(o).forEach(function (c) { call.filters.push(['eq', c, o[c]]); }); return b; };
    return b;
  }

  var seq = 0;
  function run(table, call) {
    window.__calls.push({ table: table, op: call.op, filters: call.filters.slice(), cols: call.cols });
    var t = tbl(table), m = matcher(call.filters);
    if (call.op === 'select') {
      var rows = t.filter(m);
      if (call.head) return { data: null, count: rows.length, error: null, status: 200 };
      for (var i = call.orders.length - 1; i >= 0; i--) {
        (function (c, asc) { rows = rows.slice().sort(function (a, z) { return cmp(a[c], z[c]) * (asc ? 1 : -1); }); })(call.orders[i][0], call.orders[i][1]);
      }
      if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
      if (call.limit != null) rows = rows.slice(0, call.limit);
      var data = rows.map(function (r) { return project(r, call.cols); });
      if (call.single) return { data: data[0] || null, error: (call.single === 'single' && !data.length) ? { code: 'PGRST116', message: 'no rows' } : null, status: 200 };
      return { data: data, error: null, count: call.count ? rows.length : null, status: 200 };
    }
    if (call.op === 'insert' || call.op === 'upsert') {
      var ps = Array.isArray(call.payload) ? call.payload : [call.payload], out = [];
      ps.forEach(function (p) { var r = Object.assign({ id: 'new-' + (++seq) }, p); t.push(r); out.push(r); });
      return { data: call.returning ? out.map(function (r) { return project(r, call.cols); }) : null, error: null, status: 201 };
    }
    if (call.op === 'update') {
      var hit = t.filter(m); hit.forEach(function (r) { Object.assign(r, call.payload); });
      return { data: call.returning ? hit.map(function (r) { return project(r, call.cols); }) : null, error: null, status: 200 };
    }
    if (call.op === 'delete') { D[table] = t.filter(function (r) { return !m(r); }); return { data: null, error: null, status: 204 }; }
    return { data: null, error: null };
  }

  function liveRows(jid) { return tbl('trades').filter(function (t) { return t.journal_id === jid && (!FLAGS.rpcLiveOnly || t.platform_source !== 'backtest'); }); }
  // journals.trade_scope (live | backtest | all; missing = live): same rule as list_journals() in migration 202610220001
  function scopeRows(j) {
    var sc = j.trade_scope || 'live';
    return tbl('trades').filter(function (t) {
      if (t.journal_id !== j.id) return false;
      if (sc === 'all') return true;
      if (sc === 'backtest') return t.platform_source === 'backtest';
      return !FLAGS.rpcLiveOnly || t.platform_source !== 'backtest';
    });
  }
  var RPC = {
    create_journal: function (a) {
      var row = { id: 'aaaaaaaa-0000-4000-8000-' + String(tbl('journals').length + 1).padStart(12, '0'), user_id: window.__USER.id, name: a.p_name, description: a.p_description || null, color: a.p_color || '#7c6dfa',
        icon: a.p_icon || 'folder', is_default: false, is_active: true, created_at: new Date().toISOString(), trade_scope: a.p_trade_scope || 'live' };
      tbl('journals').push(row); return row;
    },
    update_journal: function (a) {
      var j = tbl('journals').filter(function (x) { return x.id === a.p_journal_id; })[0];
      if (!j) throw new Error('JOURNAL_NOT_FOUND');
      j.name = a.p_name; j.description = a.p_description; j.color = a.p_color; j.icon = a.p_icon; if (a.p_trade_scope) j.trade_scope = a.p_trade_scope;
      return j;
    },
    list_journals: function () {
      return tbl('journals').filter(function (j) { return j.is_active !== false; }).map(function (j) {
        var rows = scopeRows(j), wins = rows.filter(function (r) { return r.pnl > 0; }).length, sum = 0, last = null;
        rows.forEach(function (r) { sum += Number(r.pnl) || 0; if (!last || r.trade_date > last) last = r.trade_date; });
        return { id: j.id, name: j.name, description: j.description || null, color: j.color || '#7c6dfa', icon: j.icon || 'folder', is_default: !!j.is_default,
          trade_count: rows.length, strategy_count: tbl('strategies').filter(function (s) { return s.journal_id === j.id; }).length,
          total_pnl: sum, win_rate: rows.length ? wins / rows.length * 100 : 0, last_trade_date: last ? last.slice(0, 10) : null, created_at: j.created_at, max_journals: 10, can_create: true,
          platform: j.platform || null, is_connected: !!j.is_connected, connection_status: j.connection_status || 'disconnected', last_synced_at: null,
          is_prop_firm: false, prop_firm_rules: null, prop_firm_status: 'none', prop_firm_stats: null, trade_scope: j.trade_scope || 'live' };
      });
    },
    get_platform_stats: function () {
      var n = tbl('trades').filter(function (t) { return !FLAGS.rpcLiveOnly || t.platform_source !== 'backtest'; }).length;
      return { totalUsers: 10, totalTrades: n, todayUsers: 0, todayTrades: 0 };
    }
  };

  var session = { user: window.__USER, access_token: 'x', expires_at: 9999999999 };
  var emu = {
    from: from,
    rpc: function (name, args) { return Promise.resolve().then(function () { window.__calls.push({ rpc: name }); var f = RPC[name]; return { data: f ? f(args || {}) : null, error: null }; }); },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: session }, error: null }); },
      getUser: function () { return Promise.resolve({ data: { user: window.__USER }, error: null }); },
      refreshSession: function () { return Promise.resolve({ data: { session: session }, error: null }); },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      signOut: function () { return Promise.resolve({ error: null }); }
    },
    channel: function () { var c = { on: function () { return c; }, subscribe: function () { return c; }, unsubscribe: function () {} }; return c; },
    removeChannel: function () {},
    storage: { from: function () { return { upload: function () { return Promise.resolve({ error: null }); }, getPublicUrl: function () { return { data: { publicUrl: '' } }; }, list: function () { return Promise.resolve({ data: [], error: null }); } }; } },
    functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } }
  };
  window.__calls = window.__calls || [];
  window.__emu = emu;
  window.supabase = { createClient: function () { return emu; } };
})();
