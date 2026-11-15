// ============================================================
// Test helper (ESM): generic in-memory supabase-js for Edge Function code (service-role client, no RLS).
// Emulates what the functions rely on: PostgREST's 1000-row cap per response, a multi-row insert sending the union of the
// keys (missing -> NULL), upsert with onConflict (merge into the existing row), maybeSingle / single, like with %.
// makeDb(tables, { rpc(name, args), fail(table, op) }) -> client with .log of every call. createClient() returns
// globalThis.__fakeClient (for bundles whose supabase-js import is replaced by this file).
// ============================================================
export function createClient() { return globalThis.__fakeClient; }
export function makeDb(tables, opts = {}) {
  const log = [];
  function q(table) {
    let rows = () => (tables[table] || []).slice(), filters = [], order = [], range = null, lim = null, single = null, op = 'select', payload = null, sel = '*', ret = false, conflict = null, ignore = false;
    const b = {
      select(c) { if (op === 'select') sel = c || '*'; else ret = true; return b; },
      eq(k, v) { filters.push((r) => r[k] === v); return b; }, neq(k, v) { filters.push((r) => r[k] !== v); return b; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return b; }, gte(k, v) { filters.push((r) => r[k] >= v); return b; },
      lte(k, v) { filters.push((r) => r[k] <= v); return b; }, gt(k, v) { filters.push((r) => r[k] > v); return b; }, lt(k, v) { filters.push((r) => r[k] < v); return b; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return b; },
      like(k, pat) { const re = new RegExp('^' + pat.split('%').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); filters.push((r) => re.test(String(r[k] ?? ''))); return b; },
      or(expr) { const parts = expr.split(',').map((p) => { const [k, o, ...v] = p.split('.'); const val = v.join('.'); return (r) => o === 'eq' ? String(r[k]) === val : o === 'is' ? (r[k] ?? null) === null : false; }); filters.push((r) => parts.some((f) => f(r))); return b; },
      order(k, o = {}) { order.push([k, o.ascending !== false]); return b; },
      range(a, z) { range = [a, z]; return b; }, limit(n) { lim = n; return b; },
      maybeSingle() { single = 'maybe'; return b; }, single() { single = 'one'; return b; },
      insert(p) { op = 'insert'; payload = p; return b; }, update(p) { op = 'update'; payload = p; return b; }, delete() { op = 'delete'; return b; },
      upsert(p, o = {}) { op = 'upsert'; payload = p; conflict = o.onConflict ? o.onConflict.split(',').map((x) => x.trim()) : null; ignore = !!o.ignoreDuplicates; return b; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    function run() {
      log.push({ table, op, sel });
      if (opts.fail && opts.fail(table, op)) return { data: null, error: { message: 'fail', code: 'X' } };
      tables[table] = tables[table] || [];
      if (op === 'upsert' && conflict) {
        const list = Array.isArray(payload) ? payload : [payload], out = [];
        for (const r of list) {
          const hit = tables[table].find((x) => conflict.every((c) => x[c] === r[c]));
          if (hit) { if (!ignore) { Object.assign(hit, r); out.push(hit); } }
          else { const x = { id: r.id || 'id' + Math.random().toString(16).slice(2), created_at: new Date().toISOString(), ...r }; tables[table].push(x); out.push(x); }
        }
        return { data: single ? out[0] : out, error: null };
      }
      if (op === 'insert' || op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload];
        const keys = [...new Set(list.flatMap((r) => Object.keys(r)))];          // union of keys, missing -> null
        const out = list.map((r) => { const x = { id: r.id || 'id' + Math.random().toString(16).slice(2), created_at: new Date().toISOString() }; for (const k of keys) x[k] = r[k] ?? null; return x; });
        tables[table].push(...out);
        return { data: single ? out[0] : out, error: null };
      }
      let r = rows().filter((x) => filters.every((f) => f(x)));
      if (op === 'update') { r.forEach((x) => Object.assign(x, payload)); return { data: ret ? r : null, error: null }; }
      if (op === 'delete') { tables[table] = tables[table].filter((x) => !r.includes(x)); return { data: null, error: null }; }
      for (const [k, asc] of order.slice().reverse()) r.sort((a, z) => (a[k] < z[k] ? -1 : a[k] > z[k] ? 1 : 0) * (asc ? 1 : -1));
      if (range) r = r.slice(range[0], range[1] + 1);
      if (lim != null) r = r.slice(0, lim);
      r = r.slice(0, 1000);
      if (sel !== '*') { const cols = sel.split(',').map((c) => c.trim()).filter((c) => !c.includes('(')); r = r.map((x) => Object.fromEntries(cols.map((c) => [c, x[c] ?? null]))); }
      if (single === 'maybe') return { data: r[0] || null, error: null };
      if (single === 'one') return r[0] ? { data: r[0], error: null } : { data: null, error: { code: 'PGRST116' } };
      return { data: r, error: null };
    }
    return b;
  }
  return {
    log, tables,
    from: q,
    rpc: async (name, args) => { log.push({ rpc: name, args }); return opts.rpc ? opts.rpc(name, args) : { data: null, error: null }; },
    auth: { getUser: async (jwt) => (jwt === 'good' ? { data: { user: { id: 'u1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
  };
}
