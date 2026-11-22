// scripts/coach-prompt/stubs.ts
// Stand-ins for the two network imports of supabase/functions/ai-coach/index.ts (wired by import_map.json), so the real
// function can run on this machine with demo data and no network:
//   - serve(handler): keeps the handler in globalThis.__coachHandler instead of opening a port
//   - createClient(): an in-memory Supabase client over globalThis.__coachDb ({ table: rows[] }); reads filter the rows,
//     writes are recorded in globalThis.__coachWrites and change nothing
// Only what ai-coach and its _shared helpers call is implemented.

export function serve(handler: (req: Request) => Promise<Response>) { (globalThis as any).__coachHandler = handler; }

type Row = Record<string, any>;
const db = (): Record<string, Row[]> => (globalThis as any).__coachDb || {};
const writes = (): any[] => ((globalThis as any).__coachWrites ||= []);

function matchOr(row: Row, expr: string) {
  // "journal_id.eq.X,journal_id.is.null"
  return expr.split(',').some((part) => {
    const [col, op, ...rest] = part.split('.');
    const val = rest.join('.');
    if (op === 'eq') return String(row[col]) === val;
    if (op === 'is') return val === 'null' ? row[col] == null : String(row[col]) === val;
    return false;
  });
}

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private sort: { col: string; asc: boolean }[] = [];
  private from = 0; private to = Infinity; private one: '' | 'maybe' | 'single' = '';
  private write: string | null = null; private payload: any = null;
  constructor(private table: string) {}
  select(_cols?: string) { return this; }
  eq(c: string, v: any) { this.filters.push((r) => String(r[c]) === String(v)); return this; }
  neq(c: string, v: any) { this.filters.push((r) => String(r[c]) !== String(v)); return this; }
  in(c: string, vs: any[]) { const s = new Set(vs.map(String)); this.filters.push((r) => s.has(String(r[c]))); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] > v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] < v); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  or(expr: string) { this.filters.push((r) => matchOr(r, expr)); return this; }
  order(col: string, o: { ascending?: boolean } = {}) { this.sort.push({ col, asc: o.ascending !== false }); return this; }
  range(a: number, b: number) { this.from = a; this.to = b; return this; }
  limit(n: number) { this.to = this.from + n - 1; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(p: any) { this.write = 'insert'; this.payload = p; return this; }
  update(p: any) { this.write = 'update'; this.payload = p; return this; }
  upsert(p: any) { this.write = 'upsert'; this.payload = p; return this; }
  delete() { this.write = 'delete'; return this; }
  private run() {
    if (this.write) {
      writes().push({ table: this.table, op: this.write });
      if (this.write === 'insert' && this.one) return { data: { id: crypto.randomUUID() }, error: null };
      return { data: null, error: null };
    }
    let rows = (db()[this.table] || []).filter((r) => this.filters.every((f) => f(r)));
    for (const s of [...this.sort].reverse()) {
      rows = [...rows].sort((a, b) => (a[s.col] === b[s.col] ? 0 : (a[s.col] > b[s.col] ? 1 : -1) * (s.asc ? 1 : -1)));
    }
    rows = rows.slice(this.from, this.to === Infinity ? undefined : this.to + 1);
    if (this.one) return { data: rows[0] ?? null, error: this.one === 'single' && !rows.length ? { code: 'PGRST116' } : null };
    return { data: rows, error: null };
  }
  then(ok: (v: any) => any, bad?: (e: any) => any) { try { return Promise.resolve(this.run()).then(ok, bad); } catch (e) { return bad ? bad(e) : Promise.reject(e); } }
}

export function createClient(_url: string, _key: string, _opts?: unknown) {
  return {
    from: (t: string) => new Query(t),
    rpc: (name: string, _args: unknown) => {
      if (name === 'ai_take_message') return Promise.resolve({ data: { ok: true, used: 1, limit: 100, premium: true }, error: null });
      writes().push({ rpc: name });
      return Promise.resolve({ data: null, error: null });
    },
    auth: { getUser: (_jwt: string) => Promise.resolve({ data: { user: { id: (globalThis as any).__coachUserId } }, error: null }) },
  };
}
