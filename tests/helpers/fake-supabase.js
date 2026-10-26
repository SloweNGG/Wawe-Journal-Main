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

const SOURCE_COLS = ['source_ctid_account', 'source_broker_name', 'source_is_live', 'source_symbol_id', 'source_symbol_name', 'source_digits'];

export class FakeDb {
  // migration08: emulate Migration 08 (backtest_accounts.data_source: synthetic only, no journal link, immutable).
  // Off by default so the sync-library tests can keep linking accounts, which stays valid for 'ctrader' accounts.
  // migration09: emulate Migration 09 on top of 08 (data_source 'synthetic'|'ctrader', source_* columns and their CHECK, immutable source,
  // cTrader account must be connected by the same user = `ctrader.accounts`). `ctrader` also feeds the get_ctrader_status RPC.
  // drawings: emulate 202610240001 + 202610260002 (backtest_drawings: own account, every plan writes, upsert by id); plan: 'free' | 'premium'.
  // tradeLimit: emulate 202610240002 (monthly limit on cTrader-data accounts for the free plan, counter never decremented);
  // null = migration not applied (the RPC is missing).
  // planUsage: emulate 202610260001 (get_backtest_plan_usage); planExpires: the plan end date it returns (ISO string or null).
  constructor({ userId, journals, migration08 = false, migration09 = false, ctrader = null, drawings = false, plan = 'free', tradeLimit = null, tradeUsed = 0,
    planUsage = true, planExpires = null }) {
    this.plan = plan; this.tradeLimit = tradeLimit; this.tradeUsed = tradeUsed; this.planUsage = planUsage; this.planExpires = planExpires;
    this.userId = userId;
    this.migration08 = migration08 || migration09;
    this.migration09 = migration09;
    this.ctrader = ctrader || { token_status: 'none', accounts: [] };
    this.journals = journals.map((j) => ({ ...j }));   // [{id, user_id, is_default}]
    this.tables = { trades: [], backtest_accounts: [], backtest_account_trades: [] };
    if (drawings) this.tables.backtest_drawings = [];
    this.seq = 0;
    this.failNext = [];   // [{ table, op, error, status }]
    this.client = recordingClient((call) => this.handle(call));
    this.client.rpc = async (name) => {                  // get_ctrader_status (token-free status, as in the live function), get_backtest_trade_usage
      this.client.calls.push({ table: 'rpc:' + name, op: 'rpc', filters: [] });
      if (name === 'get_backtest_trade_usage') {
        if (this.tradeLimit == null) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_backtest_trade_usage' } };
        return { data: { used: this.tradeUsed, limit: this.tradeLimit, premium: this.plan === 'premium', month: new Date().toISOString().slice(0, 7), resets_at: null }, error: null };
      }
      if (name === 'get_backtest_plan_usage') {
        if (!this.planUsage) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_backtest_plan_usage' } };
        const prem = this.plan === 'premium', now = new Date(), iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const used = this.tables.backtest_accounts.filter((a) => a.user_id === this.userId && a.is_active !== false).length;
        return { data: { premium: prem, plan: this.plan, plan_expires_at: this.planExpires,
          accounts: { used, limit: prem ? 10 : 1 },
          trades: { used: this.tradeUsed, limit: this.tradeLimit == null ? 100 : this.tradeLimit, month: iso(now).slice(0, 7), resets_at: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))) },
          server_now: iso(now) }, error: null };
      }
      if (name !== 'get_ctrader_status') return { data: null, error: { message: 'unknown function ' + name } };
      const c = this.ctrader, has = c.token_status && c.token_status !== 'none';
      return { data: { is_connected: !!has, token_status: has ? c.token_status : 'none', is_expired: false, accounts: has ? c.accounts : [] }, error: null };
    };
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
    if ((call.op === 'upsert' || call.op === 'insert') && call.table === 'backtest_drawings') return this.drawingWrite(call);
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
        row.section_no = 1; row.sections = [{ no: 1, start: row.replay_time, at: row.created_at }];   // 202610240003
        if (this.migration08) {
          row.data_source = row.data_source ?? 'synthetic';
          if (this.migration09) for (const c of SOURCE_COLS) row[c] = row[c] ?? null;
          if (this.migration09 && row.data_source === 'ctrader' && !this.ctrader.accounts.some((a) => Number(a.ctid_trader_account_id) === Number(row.source_ctid_account))) {
            return { data: null, error: { code: 'P0001', message: 'CTRADER_ACCOUNT_NOT_LINKED' }, status: 400 };   // trg_backtest_accounts_ctrader_owner
          }
          const bad = this.migration08Violation(row);
          if (bad) return { data: null, error: { code: '23514', message: 'new row for relation "backtest_accounts" violates check constraint "' + bad + '"' }, status: 400 };
        }
      }
      if (call.table === 'backtest_account_trades' && this.tradeLimit != null) {   // trg_check_backtest_trade_quota
        const acc = this.tables.backtest_accounts.find((a) => a.id === row.backtest_account_id);
        if (acc && acc.data_source === 'ctrader') {
          if (this.plan !== 'premium' && this.tradeUsed >= this.tradeLimit) return { data: null, error: { code: 'P0001', message: 'BACKTEST_TRADE_LIMIT:' + this.tradeLimit }, status: 400 };
          this.tradeUsed++;
        }
      }
      if (call.table === 'backtest_account_trades') {      // trg_backtest_trade_section
        const acc2 = this.tables.backtest_accounts.find((a) => a.id === row.backtest_account_id);
        row.section_no = (acc2 && acc2.section_no) || 1;
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
  // trg_check_backtest_drawing + upsert (INSERT ... ON CONFLICT (id) DO UPDATE)
  drawingWrite(call) {
    const t = this.tables.backtest_drawings, rows = Array.isArray(call.payload) ? call.payload : [call.payload];
    for (const src of rows) {
      if (!this.tables.backtest_accounts.some((a) => a.id === src.backtest_account_id && a.user_id === src.user_id)) return { data: null, error: { code: 'P0001', message: 'INVALID_BACKTEST_ACCOUNT' }, status: 400 };
      if (!['trend', 'hline', 'ray', 'rect', 'fib', 'long', 'short', 'text', 'measure'].includes(src.tool)) return { data: null, error: { code: '23514', message: 'chk_backtest_drawings_tool' }, status: 400 };
      const old = t.find((r) => r.id === src.id);
      if (old && call.op === 'insert') return { data: null, error: { code: '23505', message: 'duplicate key' }, status: 409 };
      if (old) { if (old.backtest_account_id !== src.backtest_account_id) return { data: null, error: { code: 'P0001', message: 'BACKTEST_DRAWING_IMMUTABLE' }, status: 400 }; Object.assign(old, src, { updated_at: new Date().toISOString() }); }
      else t.push({ ...src, id: src.id || this.nextId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    return { data: null, error: null, status: 201 };
  }
  migration08Violation(row) {
    if (this.migration09) {
      if (row.data_source !== 'synthetic' && row.data_source !== 'ctrader') return 'chk_backtest_accounts_data_source';
      const any = SOURCE_COLS.some((c) => row[c] != null);
      if (row.data_source === 'synthetic' && any) return 'chk_backtest_accounts_source_fields';
      if (row.data_source === 'ctrader' && !(Number(row.source_ctid_account) > 0 && Number(row.source_symbol_id) > 0 && String(row.source_symbol_name || '').trim())) return 'chk_backtest_accounts_source_fields';
      if (row.journal_id && row.data_source !== 'ctrader') return 'chk_backtest_accounts_journal_needs_ctrader';
      return null;
    }
    if (row.data_source !== 'synthetic') return 'chk_backtest_accounts_data_source';
    if (row.journal_id) return 'chk_backtest_accounts_journal_needs_ctrader';
    return null;
  }
  update(call) {
    const t = this.tables[call.table];
    const hits = t.filter((r) => this.match(r, call));
    const out = [];
    if (call.table === 'backtest_accounts' && this.migration08) {
      for (const r of hits) {
        const next = { ...r, ...call.payload };
        if (next.data_source !== r.data_source) return { data: null, error: { code: 'P0001', message: 'BACKTEST_ACCOUNT_IMMUTABLE:data_source' }, status: 400 };
        if (this.migration09 && SOURCE_COLS.some((c) => (next[c] ?? null) !== (r[c] ?? null))) return { data: null, error: { code: 'P0001', message: 'BACKTEST_ACCOUNT_IMMUTABLE:source' }, status: 400 };
        const bad = this.migration08Violation(next);
        if (bad) return { data: null, error: { code: '23514', message: 'new row for relation "backtest_accounts" violates check constraint "' + bad + '"' }, status: 400 };
      }
    }
    if (call.table === 'backtest_accounts') {             // 202610240003: back in time without open positions only, sections
      for (const r of hits) {
        const trades = this.tables.backtest_account_trades.filter((t) => t.backtest_account_id === r.id);
        const back = call.payload.replay_time && Date.parse(call.payload.replay_time) < Date.parse(r.replay_time);
        if (back && trades.some((t) => !t.exit_time)) return { data: null, error: { code: 'P0001', message: 'BACKTEST_OPEN_POSITIONS:replay_time' }, status: 400 };
      }
    }
    for (const r of hits) {
      const old = { ...r };
      Object.assign(r, call.payload);
      if (call.table === 'backtest_accounts') {
        const trades = this.tables.backtest_account_trades.filter((t) => t.backtest_account_id === r.id);
        const back = Date.parse(r.replay_time) < Date.parse(old.replay_time);
        r.section_no = old.section_no || 1; r.sections = (old.sections || []).slice();
        if (!trades.length) { if (back || r.section_no !== 1 || r.sections.length !== 1) { r.section_no = 1; r.sections = [{ no: 1, start: r.replay_time, at: new Date().toISOString() }]; } }
        else if (back) { r.section_no += 1; r.sections.push({ no: r.section_no, start: r.replay_time, at: new Date().toISOString() }); }
      }
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
        if (this.tables.backtest_drawings) this.tables.backtest_drawings = this.tables.backtest_drawings.filter((x) => x.backtest_account_id !== a.id);
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
