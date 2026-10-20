// Straight-through run of the REAL migration and rollback files on a persistent local PostgreSQL database
// (a copy of the 2026-10-18 live schema, built from mock_live_pre/post.sql + the live function bodies).
// Order: 00 01 02 03 04 05 06 -> verify.sql -> rollbacks 06 05 04 03 02 01 00 -> catalog must equal the start
// (except the ACL hardening that the rollbacks keep on delete_journal/list_journals) -> migrate again and leave
// the database in the migrated state for manual inspection.
// Usage: PG_MODULE_DIR=<dir with node_modules/pg> PGPORT=54417 node local-run.mjs <plan/sql dir> <db snapshot dir> [database name]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const [planDir, dbDir, dbName = 'wawe_local'] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const pg = require('pg');
pg.types.setTypeParser(20, (v) => Number(v));
const CONN = { host: '127.0.0.1', port: +(process.env.PGPORT || 5432), user: 'postgres' };
const read = (p) => fs.readFileSync(p, 'utf8');
const ROLES = ['anon', 'authenticated', 'service_role', 'supabase_auth_admin'];
const FNS = ['is_admin', 'touch_updated_at', 'calc_trade_pnl', 'set_default_journal', 'ctrader_reset_cursor_on_journal_change', 'reset_user_data',
  'delete_journal', 'list_journals', 'get_platform_stats', 'evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
  'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count'];
const MIGDIR = path.resolve(planDir, '../../../supabase/migrations'); // forward migrations live in the project's supabase/migrations
const mig = (n) => fs.readdirSync(MIGDIR).filter((f) => f.startsWith(n))[0];
const rb = (n) => fs.readdirSync(path.join(planDir, 'supabase/rollbacks')).filter((f) => f.startsWith(n))[0];
const M = (n) => read(path.join(planDir, 'supabase/migrations', mig(n)));
const D = (n) => read(path.join(planDir, 'supabase/rollbacks', rb(n)));

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };
let fails = 0;
const ok = (c, m) => { if (!c) fails++; log(`${c ? '  ok  ' : '  FAIL'} ${m}`); };

const adm = new pg.Client({ ...CONN, database: 'postgres' }); await adm.connect();
await adm.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
for (const r of ROLES) await adm.query(`DROP ROLE IF EXISTS ${r}`);
await adm.query(`CREATE DATABASE ${dbName}`);
const c = new pg.Client({ ...CONN, database: dbName }); await c.connect();
const version = (await c.query('select version() v')).rows[0].v;
log(`PostgreSQL: ${version.split(',')[0]}`);

async function run(label, sql) {
  try { await c.query(sql); ok(true, label); return true; }
  catch (e) { try { await c.query('ROLLBACK'); } catch { /* */ } ok(false, `${label} -> ${String(e.message).split('\n')[0]}`); return false; }
}
async function fingerprint() {
  const q = async (s) => (await c.query(s)).rows;
  return {
    tables: await q(`select c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`),
    columns: await q(`select c.relname, a.attname, format_type(a.atttypid, a.atttypmod) t, a.attnotnull from pg_attribute a join pg_class c on c.oid = a.attrelid where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped order by 1, a.attnum`),
    constraints: await q(`select conrelid::regclass::text rel, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace and contype <> 'n' order by 1, 2`),
    indexes: await q(`select indexname, indexdef from pg_indexes where schemaname = 'public' order by 1`),
    policies: await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
    triggers: await q(`select tgrelid::regclass::text rel, tgname, pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) order by 1, 2`),
    functions: await q(`select p.oid::regprocedure::text fn, md5(translate(p.prosrc, E' \\t\\r\\n', '')) body, p.prosecdef, p.proconfig::text cfg from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
    acls: await q(`select p.oid::regprocedure::text fn, (select array_agg(g order by g) from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end g from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE') s)::text e from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
    storage: await q(`select 'bucket' k, id::text v from storage.buckets union all select 'policy', policyname from pg_policies where schemaname = 'storage' order by 1, 2`)
  };
}
function diff(a, b, ignoreAcl) {
  const d = [];
  for (const k of Object.keys(a)) {
    const f = (rows) => new Set(rows.filter((r) => !(k === 'acls' && ignoreAcl.includes(r.fn))).map((r) => JSON.stringify(r)));
    const A = f(a[k]), B = f(b[k]);
    for (const x of A) if (!B.has(x)) d.push(`${k} - ${x}`);
    for (const x of B) if (!A.has(x)) d.push(`${k} + ${x}`);
  }
  return d;
}

// ---- the live copy
await c.query(read(path.join(here, 'mock_live_pre.sql')));
for (const f of FNS) await c.query(read(path.join(dbDir, `fn_${f}.sql`)) + ';');
await c.query(read(path.join(here, 'mock_live_post.sql')));
await c.query(`ALTER TABLE auth.users ADD COLUMN aud text, ADD COLUMN role text, ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN updated_at timestamptz;`);
await c.query(read(path.join(dbDir, 'fn_handle_new_user.sql')) + ';');
await c.query(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`);
log(`live copy built: ${(await c.query(`select count(*)::int n from pg_tables where schemaname = 'public'`)).rows[0].n} public tables, ${(await c.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace`)).rows[0].n} functions`);
const base = await fingerprint();

const FORWARD = ['202610180000', '202610180001', '202610180002', '202610180003', '202610180004', '202610180005', '202610180006'];
async function verifySql() {
  try { await c.query(read(path.join(planDir, 'supabase/tests/backtest_v2_verify.sql'))); return 'NO EXCEPTION'; }
  catch (e) { try { await c.query('ROLLBACK'); } catch { /* */ } return String(e.message); }
}
async function forward() {
  for (const n of FORWARD) await run(`apply ${mig(n)}`, M(n));
  const msg = await verifySql();
  const s = /SUMMARY: (\d+) PASS, (\d+) FAIL/.exec(msg);
  ok(!!s && s[2] === '0' && +s[1] >= 19 && !/\[SKIP\]/.test(msg), `verify.sql: ${s ? s[0] : msg.slice(0, 200)}`);
  ok((await c.query(`select count(*)::int n from auth.users`)).rows[0].n === 0, 'verify.sql left no user behind');
}
log('\n== forward 00 01 02 03 04 05 06 + verify.sql');
await forward();
const migrated = await fingerprint();
ok(diff(base, migrated, []).length > 0, 'the migrated catalog differs from the start (sanity)');

log('\n== rollbacks 06 05 04 03 02 01 00');
for (const n of [...FORWARD].reverse()) await run(`apply ${rb(n)}`, D(n));
const back = await fingerprint();
const d = diff(base, back, ['delete_journal(uuid)', 'list_journals()']);
ok(d.length === 0, `catalog after all rollbacks equals the start (ACL hardening of delete_journal/list_journals aside)${d.length ? '\n    ' + d.join('\n    ') : ''}`);

log('\n== forward again (left in this state)');
await forward();
const end = await fingerprint();
ok(diff(migrated, end, []).length === 0, 'the second forward run reaches the same catalog as the first');

log(`\nRESULT: ${fails ? fails + ' FAILED' : 'all ok'}  (database "${dbName}" left migrated; recreate with this script)`);
await c.end(); await adm.end();
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'local-run-pg17.txt'), lines.join('\n') + '\n');
process.exit(fails ? 1 : 0);
