// ============================================================
// Test helper (ESM): fake supabase-js client
// - recordingClient(handler): records every request (table, op, filters, orders, range, options)
// - FakeDb: in-memory trades / backtest_accounts / backtest_account_trades that emulate the LIVE
//   behaviour the sync relies on:
//     * UNIQUE (user_id, journal_id, import_hash) + upsert ON CONFLICT DO NOTHING (ignoreDuplicates)
//     * trg_calc_pnl branch 1 (pnl given -> rr_ratio recomputed when SL/TP/entry set and risk > 0)
//     * trg_trades_default_journal (NULL journal_id -> default journal)
//     * RLS insert check: journal must belong to the user (journals list)
//     * Migration 04 (planned): AFTER UPDATE OF journal_id / AFTER DELETE on backtest_accounts
//       delete 'backtest:<id>:' rows in OLD.journal_id; backtest_account_trades ON DELETE CASCADE
// Not repo code; used by the proto tests only.
// ============================================================

export function recordingClient(handler) {
  const calls = [];
  function from(table) {
    const call = { table, op: null, columns: null, head: false, count: null, filters: [], orders: [], range: null, limit: null, payload: null, options: null, single: null };
    let promise = null;
    const b = {
      select(cols, opts) { if (!call.op) call.op = 'select'; call.columns = cols === undefined ? '*' : cols; if (opts) { call.head = !!opts.head; call.count = opts.count || null; } call.returning = true; return b; },
      insert(p, o) { call.op = 'insert'; call.payload = p; call.options = o || null; return b; },
      upsert(p, o) { call.op = 'upsert'; call.payload = p; call.options = o || null; return b; },
      update(p) { call.op = 'update'; call.payload = p; return b; },
      delete() { call.op = 'delete'; return b; },
      eq(c, v) { call.filters.push(['eq', c, v]); return b; },
      neq(c, v) { call.filters.push(['neq', c, v]); return b; },
      is(c, v) { call.filters.push(['is', c, v]); return b; },
      in(c, v) { call.filters.push(['in', c, v]); return b; },
      like(c, v) { call.filters.push(['like', c, v]); return b; },
      gte(c, v) { call.filters.push(['gte', c, v]); return b; },
      not(c, op, v) { call.filters.push(['not', c, op, v]); return b; },
      or(s) { call.filters.push(['or', s]); return b; },
      order(c, o) { call.orders.push([c, !!(o && o.ascending)]); return b; },
      range(a, z) { call.range = [a, z]; return b; },
      limit(n) { call.limit = n; return b; },
      single() { call.single = 'single'; return b; },
      maybeSingle() { call.single = 'maybe'; return b; },
      then(res, rej) {
        if (!promise) { calls.push(call); promise = Promise.resolve().then(() => handler(call)); }
        return promise.then(res, rej);
      }
    };
    return b;
  }
  return { from, calls };
}

// ---------- exact decimal helpers for the trigger emulation ----------
function dec(x) {
  const s = typeof x === 'number' ? String(x) : String(x).trim();
  const m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error('fake db: not a decimal ' + x);
  const f = m[3] || '';
  const n = BigInt(m[2] + f);
  return { n: m[1] === '-' ? -n : n, s: f.length };
}
function round2Div(num, den) {
  const neg = num < 0n; const a = (neg ? -num : num) * 100n;
  let q = a / den; if ((a % den) * 2n >= den) q += 1n;
  q = neg ? -q : q;
  const abs = q < 0n ? -q : q;
  return (q < 0n ? '-' : '') + (abs / 100n) + '.' + String(abs % 100n).padStart(2, '0');
}
// calc_trade_pnl() branch 1 (pnl IS NOT NULL) — db/fn_calc_trade_pnl.sql:10-26
export function trgCalcPnlBranch1(row) {
  if (row.pnl == null) throw new Error('fake db: backtest rows must carry pnl (branch 4 not emulated)');
  if (row.stop_loss != null && row.take_profit != null && row.entry_price != null) {
    const E = dec(row.entry_price), S = dec(row.stop_loss), T = dec(row.take_profit);
    const sc = Math.max(E.s, S.s, T.s);
    const e = E.n * 10n ** BigInt(sc - E.s), st = S.n * 10n ** BigInt(sc - S.s), t = T.n * 10n ** BigInt(sc - T.s);
    const risk = e > st ? e - st : st - e;
    const reward = t > e ? t - e : e - t;
    if (risk > 0n) row.rr_ratio = round2Div(reward, risk);
  }
  row.updated_at = new Date().toISOString();
  return row;
}

const LIVE_OR = 'platform_source.is.null,platform_source.neq.backtest';

// PostgREST returns numeric as JSON numbers: emulate by converting decimal strings to numbers on read
const NUMERIC = ['lot', 'entry_price', 'exit_price', 'stop_loss', 'take_profit', 'pnl', 'gross_pnl', 'commission', 'swap', 'rr_ratio', 'multiplier', 'starting_balance', 'spread_pips', 'commission_per_lot'];
function toWire(row, columns) {
  const out = {};
  const cols = (!columns || columns === '*') ? Object.keys(row) : columns.split(',').map((c) => c.trim()).filter(Boolean);
  for (const c of cols) {
    let v = row[c];
    if (v !== null && v !== undefined && NUMERIC.includes(c)) v = Number(v);
    out[c] = v === undefined ? null : v;
  }
  return out;
}

export class FakeDb {
  constructor({ userId, journals }) {
    this.userId = userId;
    this.journals = journals.map((j) => ({ ...j }));   // [{id, user_id, is_default}]
    this.tables = { trades: [], backtest_accounts: [], backtest_account_trades: [] };
    this.seq = 0;
    this.failNext = [];   // [{ table, op, error, status }]
    this.client = recordingClient((call) => this.handle(call));
  }
  nextId() { this.seq += 1; return '00000000-0000-4000-8000-' + String(this.seq).padStart(12, '0'); }
  match(row, call) {
    for (const f of call.filters) {
      const [kind, col] = f;
      if (kind === 'eq' && String(row[col]) !== String(f[2])) return false;
      if (kind === 'neq' && (row[col] == null || String(row[col]) === String(f[2]))) return false;
      if (kind === 'is' && f[2] === null && row[col] != null) return false;
      if (kind === 'in' && !f[2].map(String).includes(String(row[col]))) return false;
      if (kind === 'gte' && !(row[col] != null && String(row[col]) >= String(f[2]))) return false;
      if (kind === 'like') {
        const pat = f[2];
        if (!pat.endsWith('%') || pat.slice(0, -1).includes('%')) throw new Error('fake db: only prefix LIKE supported');
        if (typeof row[col] !== 'string' || !row[col].startsWith(pat.slice(0, -1))) return false;
      }
      if (kind === 'not' && f[2] === 'is' && f[3] === null && row[col] == null) return false;
      if (kind === 'or') {
        if (f[1] !== LIVE_OR) throw new Error('fake db: unsupported or(): ' + f[1]);
        if (!(row.platform_source == null || row.platform_source !== 'backtest')) return false;
      }
    }
    return true;
  }
  handle(call) {
    const fi = this.failNext.findIndex((f) => f.table === call.table && f.op === call.op);
    if (fi >= 0) { const f = this.failNext.splice(fi, 1)[0]; return { data: null, error: f.error, status: f.status, count: null }; }
    const t = this.tables[call.table];
    if (!t) return { data: null, error: { code: '42P01', message: 'relation does not exist' }, status: 404 };
    if (call.op === 'select') {
      let rows = t.filter((r) => this.match(r, call));
      if (call.head) return { data: null, count: rows.length, error: null, status: 200 };
      for (let i = call.orders.length - 1; i >= 0; i--) {
        const [c, asc] = call.orders[i];
        rows = rows.slice().sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
      const data = rows.map((r) => toWire(r, call.columns));
      if (call.single) return { data: data[0] || null, error: (call.single === 'single' && !data.length) ? { code: 'PGRST116', message: 'no rows' } : null, status: 200 };
      return { data, error: null, status: 200 };
    }
    if (call.op === 'upsert' || call.op === 'insert') return this.insert(call);
    if (call.op === 'update') return this.update(call);
    if (call.op === 'delete') return this.remove(call);
    throw new Error('fake db: op ' + call.op);
  }
  insert(call) {
    const t = this.tables[call.table];
    const rows = Array.isArray(call.payload) ? call.payload : [call.payload];
    const staged = [];
    for (const src of rows) {           // one statement: validate everything first (atomic like Postgres)
      const row = { ...src };
      if (call.table === 'trades') {
        // trg_calc_pnl (alphabetical first) then trg_trades_default_journal
        trgCalcPnlBranch1(row);
        if (row.journal_id == null) row.journal_id = (this.journals.find((j) => j.user_id === row.user_id && j.is_default) || {}).id || null;
        // RLS trades_insert_own: journal must belong to the user
        if (!this.journals.some((j) => j.id === row.journal_id && j.user_id === row.user_id)) {
          return { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "trades"' }, status: 403 };
        }
        const dup = t.find((r) => r.user_id === row.user_id && r.journal_id === row.journal_id && r.import_hash === row.import_hash && row.import_hash != null)
          || staged.find((r) => r.user_id === row.user_id && r.journal_id === row.journal_id && r.import_hash === row.import_hash);
        if (dup) {
          if (call.options && call.options.ignoreDuplicates) continue;
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_trades_user_journal_import_hash"' }, status: 409 };
        }
        row.notes = row.notes ?? null; row.strategy_id = row.strategy_id ?? null;
      }
      if (call.table === 'backtest_accounts') {            // column defaults of Migration 02
        if (row.is_active === undefined) row.is_active = true;
        row.created_at = row.created_at || new Date().toISOString(); row.updated_at = row.updated_at || row.created_at;
        row.journal_id = row.journal_id ?? null;
      }
      if (call.table === 'backtest_account_trades') {      // defaults + trg_check_backtest_trade (initial levels = levels at open)
        row.initial_stop_loss = row.stop_loss ?? null; row.initial_take_profit = row.take_profit ?? null;
        for (const c of ['exit_price', 'exit_time', 'pnl', 'exit_reason', 'gross_pnl', 'stop_loss', 'take_profit', 'rr_ratio']) if (row[c] === undefined) row[c] = null;
        row.exit_ambiguous = row.exit_ambiguous ?? false; row.created_at = row.created_at || new Date().toISOString();
      }
      staged.push(row);
    }
    for (const row of staged) { row.id = row.id || this.nextId(); t.push(row); }
    return { data: call.returning ? staged.map((r) => toWire(r, call.columns)) : null, error: null, status: 201 };
  }
  update(call) {
    const t = this.tables[call.table];
    const hits = t.filter((r) => this.match(r, call));
    const out = [];
    for (const r of hits) {
      const old = { ...r };
      Object.assign(r, call.payload);
      if (call.table === 'trades') trgCalcPnlBranch1(r);
      if (call.table === 'backtest_accounts' && old.journal_id && old.journal_id !== r.journal_id) this.cleanupMirrors(old);
      out.push(r);
    }
    if (call.single) return { data: out[0] ? toWire(out[0], call.columns) : null, error: (call.single === 'single' && !out.length) ? { code: 'PGRST116', message: 'no rows' } : null, status: 200 };
    return { data: call.returning ? out.map((r) => toWire(r, call.columns)) : null, error: null, status: 200 };
  }
  remove(call) {
    const t = this.tables[call.table];
    const hits = t.filter((r) => this.match(r, call));
    this.tables[call.table] = t.filter((r) => !hits.includes(r));
    if (call.table === 'backtest_accounts') {
      for (const a of hits) {
        this.tables.backtest_account_trades = this.tables.backtest_account_trades.filter((x) => x.backtest_account_id !== a.id);  // ON DELETE CASCADE
        if (a.journal_id) this.cleanupMirrors(a);                                                                               // Migration 04 AFTER DELETE
      }
    }
    return { data: null, error: null, status: 204 };
  }
  // Migration 04 (planned): delete OLD.journal_id rows whose import_hash starts with 'backtest:<OLD.id>:'
  cleanupMirrors(oldAccount) {
    const prefix = 'backtest:' + oldAccount.id + ':';
    this.tables.trades = this.tables.trades.filter((r) => !(r.user_id === oldAccount.user_id && r.journal_id === oldAccount.journal_id && typeof r.import_hash === 'string' && r.import_hash.slice(0, prefix.length) === prefix));
  }
}
