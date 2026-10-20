// Read-only comparison of the LIVE catalog with the local copy of the live schema (mock_live_pre/post + live function bodies).
// Only objects that exist in the local copy are compared (tables, columns, constraints, indexes, policies, triggers, functions, EXECUTE ACLs).
// The live side runs SELECTs on pg_catalog only. No row data, no secrets in the output.
// Usage: DATABASE_URL=... PG_MODULE_DIR=<dir with node_modules/pg> PGPORT=54417 node live-compare.mjs <plan/sql dir> <db snapshot dir> [out file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const [, , planDir, dbDir, outFile] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PG_MODULE_DIR ? path.join(process.env.PG_MODULE_DIR, 'x.js') : import.meta.url);
const pg = require('pg');
const read = (p) => fs.readFileSync(p, 'utf8');
const ROLES = ['anon', 'authenticated', 'service_role', 'supabase_auth_admin'];
const FNS = ['is_admin', 'touch_updated_at', 'calc_trade_pnl', 'set_default_journal', 'ctrader_reset_cursor_on_journal_change', 'reset_user_data',
  'delete_journal', 'list_journals', 'get_platform_stats', 'evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
  'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count'];

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

async function fingerprint(c) {
  const q = async (s) => (await c.query(s)).rows;
  return {
    tables: await q(`select c.relname, c.relrowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`),
    columns: await q(`select c.relname rel, a.attname, format_type(a.atttypid, a.atttypmod) t, a.attnotnull from pg_attribute a join pg_class c on c.oid = a.attrelid where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped order by 1, a.attnum`),
    constraints: await q(`select replace(conrelid::regclass::text, 'public.', '') rel, conname, pg_get_constraintdef(oid) d from pg_constraint where connamespace = 'public'::regnamespace and contype <> 'n' order by 1, 2`),
    indexes: await q(`select tablename rel, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    policies: await q(`select tablename rel, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`),
    triggers: await q(`select replace(tgrelid::regclass::text, 'public.', '') rel, tgname, pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace) order by 1, 2`),
    functions: await q(`select p.oid::regprocedure::text fn, md5(translate(p.prosrc, E' \\t\\r\\n', '')) body, p.prosecdef, p.proconfig::text cfg from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
    acls: await q(`select p.oid::regprocedure::text fn, (select array_agg(g order by g) from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end g from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE') s)::text e from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
    tableacl: await q(`select c.relname rel, c.relacl::text acl from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`)
  };
}

// local copy
const CONN = { host: '127.0.0.1', port: +(process.env.PGPORT || 54417), user: 'postgres' };
const adm = new pg.Client({ ...CONN, database: 'postgres' }); await adm.connect();
await adm.query('DROP DATABASE IF EXISTS wawe_cmp WITH (FORCE)');
await adm.query('DROP DATABASE IF EXISTS wawe_local WITH (FORCE)'); // roles are cluster-wide; local-run.mjs recreates it
for (const r of ROLES) await adm.query(`DROP ROLE IF EXISTS ${r}`).catch(() => {});
await adm.query('CREATE DATABASE wawe_cmp');
const l = new pg.Client({ ...CONN, database: 'wawe_cmp' }); await l.connect();
await l.query(read(path.join(here, 'mock_live_pre.sql')));
for (const f of FNS) await l.query(read(path.join(dbDir, `fn_${f}.sql`)) + ';');
await l.query(read(path.join(here, 'mock_live_post.sql')));
const local = await fingerprint(l);
await l.end();
await adm.query('DROP DATABASE IF EXISTS wawe_cmp WITH (FORCE)');
await adm.end();

// live (read only)
const lv = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await lv.connect();
await lv.query('SET default_transaction_read_only = on');
const live = await fingerprint(lv);
await lv.end();

const localTables = new Set(local.tables.map((r) => r.relname));
const localFns = new Set(local.functions.map((r) => r.fn));
const inScope = (k, r) => {
  if (k === 'tables') return localTables.has(r.relname);
  if (k === 'functions' || k === 'acls') return localFns.has(r.fn);
  return localTables.has(r.rel);
};
const sets = (a, k) => new Set(a[k].filter((r) => inScope(k, r)).map((r) => JSON.stringify(r)));
let total = 0;
log(`local copy: ${local.tables.length} tables, ${local.functions.length} functions; live public: ${live.tables.length} tables, ${live.functions.length} functions (compared: only objects present in the local copy)`);
for (const k of Object.keys(local)) {
  const A = sets(local, k), B = sets(live, k);
  const only = [];
  for (const x of A) if (!B.has(x)) only.push(`  local only  ${k}: ${x}`);
  for (const x of B) if (!A.has(x)) only.push(`  live only   ${k}: ${x}`);
  log(`${only.length ? 'DIFF' : 'same'}  ${k} (${A.size} local, ${B.size} live)`);
  for (const o of only) log(o.length > 400 ? o.slice(0, 400) + '…' : o);
  total += only.length;
}
log(`\nTOTAL DIFFERENCES: ${total}`);
if (outFile) fs.writeFileSync(outFile, lines.join('\n') + '\n');
