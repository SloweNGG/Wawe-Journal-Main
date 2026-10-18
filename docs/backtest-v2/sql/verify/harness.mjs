// End-to-end check of the Backtest v2 migration set on PGlite (WASM PostgreSQL, in memory, no network).
// Usage: node harness.mjs <pglite dist/index.js> <plan/sql dir> <db snapshot dir>
// It builds a mock of the live schema from the 2026-10-18 snapshots (live function bodies loaded
// verbatim), applies 01 -> 02 -> 04 -> 05 -> 06 (each twice for idempotency), exercises constraints,
// RLS, triggers, quota, cleanup and stats, then rolls everything back in reverse order and compares the
// catalog with the pre-migration state.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [pgliteIndex, planDir, dbDir] = process.argv.slice(2);
const here = path.dirname(fileURLToPath(import.meta.url));
const { PGlite } = await import(pathToFileURL(pgliteIndex).href);

const read = (p) => fs.readFileSync(p, 'utf8');
const MIG = {
  m00: read(path.join(planDir, 'supabase/migrations/202610180000_secure_evaluate_prop_firm_rules.sql')),
  d00: read(path.join(planDir, 'supabase/rollbacks/202610180000_secure_evaluate_prop_firm_rules.down.sql')),
  m01: read(path.join(planDir, 'supabase/migrations/202610180001_drop_legacy_backtest_trades.sql')),
  m02: read(path.join(planDir, 'supabase/migrations/202610180002_backtest_accounts.sql')),
  m04: read(path.join(planDir, 'supabase/migrations/202610180004_backtest_journal_link_cleanup.sql')),
  m05: read(path.join(planDir, 'supabase/migrations/202610180005_exclude_backtest_from_stats.sql')),
  m06: read(path.join(planDir, 'supabase/migrations/202610180006_drop_unused_trade_functions.sql')),
  d01: read(path.join(planDir, 'supabase/rollbacks/202610180001_drop_legacy_backtest_trades.down.sql')),
  d02: read(path.join(planDir, 'supabase/rollbacks/202610180002_backtest_accounts.down.sql')),
  d04: read(path.join(planDir, 'supabase/rollbacks/202610180004_backtest_journal_link_cleanup.down.sql')),
  d05: read(path.join(planDir, 'supabase/rollbacks/202610180005_exclude_backtest_from_stats.down.sql')),
  d06: read(path.join(planDir, 'supabase/rollbacks/202610180006_drop_unused_trade_functions.down.sql')),
};
const MD5 = JSON.parse(read(path.join(here, 'out', 'md5.json')));
const LIVE_FNS = [
  'is_admin', 'touch_updated_at', 'calc_trade_pnl', 'set_default_journal', 'ctrader_reset_cursor_on_journal_change',
  'reset_user_data', 'delete_journal', 'list_journals', 'get_platform_stats', 'evaluate_prop_firm_rules',
  'sync_journal_trades', 'get_journals_equity_data', 'get_strategy_performance', 'get_today_trades_count',
  'get_total_trades_count',
];

let pass = 0;
let fail = 0;
const out = [];
const log = (s) => { out.push(s); console.log(s); };
function ok(cond, msg) {
  if (cond) { pass++; log('  ok   ' + msg); } else { fail++; log('  FAIL ' + msg); }
}
async function expectErr(fn, re, msg) {
  try { await fn(); ok(false, `${msg} (no error)`); } catch (e) {
    ok(re.test(String(e.message)), `${msg} -> ${String(e.message).split('\n')[0].slice(0, 150)}`);
  }
}

async function newDb() {
  const db = new PGlite();
  await db.exec(read(path.join(here, 'mock_live_pre.sql')));
  // live bodies verbatim (CRLF where the snapshot has it), as pg_get_functiondef printed them
  for (const fn of LIVE_FNS) await db.exec(read(path.join(dbDir, `fn_${fn}.sql`)) + ';');
  await db.exec(read(path.join(here, 'mock_live_post.sql')));
  return db;
}
async function runFile(db, sql) {
  try { await db.exec(sql); } catch (e) {
    try { await db.exec('ROLLBACK'); } catch { /* not in a transaction */ }
    try { await db.exec('RESET ROLE'); } catch { /* ignore */ }
    throw e;
  }
}
const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const all = async (db, sql, params = []) => (await db.query(sql, params)).rows;

// Run one statement as a PostgREST request would: role authenticated (or anon) + JWT claims, own transaction.
async function as(db, uid, sql, params = [], { admin = false, role = 'authenticated' } = {}) {
  await db.exec('BEGIN');
  try {
    const claims = uid ? { sub: uid, role, app_metadata: admin ? { role: 'admin' } : {} } : { role };
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`SET LOCAL ROLE ${role}`);
    const r = await db.query(sql, params);
    await db.exec('COMMIT');
    return r;
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

// ---------------------------------------------------------------- catalog snapshot + comparison
async function snap(db) {
  return {
    tables: await all(db, `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`),
    columns: await all(db, `select c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) as type,
        a.attnotnull, pg_get_expr(d.adbin, d.adrelid) as def
      from pg_attribute a join pg_class c on c.oid = a.attrelid
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      order by 1, 2`),
    constraints: await all(db, `select conrelid::regclass::text as rel, conname, pg_get_constraintdef(oid) as def
      from pg_constraint where connamespace = 'public'::regnamespace and contype <> 'n' order by 1, 2`),
    indexes: await all(db, `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    policies: await all(db, `select tablename, policyname, cmd, roles::text as roles, qual, with_check, permissive
      from pg_policies where schemaname = 'public' order by 1, 2`),
    triggers: await all(db, `select tgrelid::regclass::text as rel, tgname, pg_get_triggerdef(oid) as def from pg_trigger
      where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      order by 1, 2`),
    functions: await all(db, `select p.oid::regprocedure::text as fn, md5(translate(p.prosrc, E' \\t\\r\\n', '')) as body,
        l.lanname, p.prosecdef, p.provolatile, p.proconfig::text as cfg, pg_get_function_result(p.oid) as res,
        pg_get_userbyid(p.proowner) as owner
      from pg_proc p join pg_language l on l.oid = p.prolang
      where p.pronamespace = 'public'::regnamespace order by 1`),
    acls: await all(db, `select p.oid::regprocedure::text as fn,
        (select array_agg(g order by g) from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
           from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE') s)::text as execs
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`),
    tableGrants: await all(db, `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
      group by 1, 2 order by 1, 2`),
  };
}
function diffSnap(a, b, ignore = {}) {
  const diffs = [];
  for (const k of Object.keys(a)) {
    const key = (r) => JSON.stringify(r);
    const filt = (rows) => rows.filter((r) => !(ignore[k] && ignore[k](r)));
    const A = new Set(filt(a[k]).map(key));
    const B = new Set(filt(b[k]).map(key));
    for (const x of A) if (!B.has(x)) diffs.push(`${k} - ${x}`);
    for (const x of B) if (!A.has(x)) diffs.push(`${k} + ${x}`);
  }
  return diffs;
}
const fnMd5 = async (db, sig) =>
  (await one(db, `select md5(translate(prosrc, E' \\t\\r\\n', '')) as m from pg_proc where oid = to_regprocedure($1)`, [sig]))?.m ?? null;
const execs = async (db, sig) =>
  (await one(db, `select (select array_agg(g order by g) from (select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as g
     from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE') s)::text as e
     from pg_proc p where p.oid = to_regprocedure($1)`, [sig]))?.e ?? null;

// ---------------------------------------------------------------- fixtures
const U1 = '11111111-1111-4111-8111-111111111111'; // free
const U2 = '22222222-2222-4222-8222-222222222222'; // premium, active
const U3 = '33333333-3333-4333-8333-333333333333'; // premium, expired; single journal
const U4 = '44444444-4444-4444-8444-444444444444'; // deleted through auth later
const ADM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const J1a = '1a1a1a1a-0000-4000-8000-000000000001';
const J1b = '1b1b1b1b-0000-4000-8000-000000000002';
const J1c = '1c1c1c1c-0000-4000-8000-000000000003'; // U1, inactive
const J2a = '2a2a2a2a-0000-4000-8000-000000000004';
const J3a = '3a3a3a3a-0000-4000-8000-000000000005';
const J4a = '4a4a4a4a-0000-4000-8000-000000000006';
const JAd = 'adadadad-0000-4000-8000-000000000007';

async function seed(db) {
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${U1}', 'u1@x'), ('${U2}', 'u2@x'), ('${U3}', 'u3@x'), ('${U4}', 'u4@x'), ('${ADM}', 'adm@x');
    INSERT INTO public.user_profiles (id, email, plan, plan_expires_at) VALUES
      ('${U1}', 'u1@x', 'free', NULL),
      ('${U2}', 'u2@x', 'premium', now() + interval '30 days'),
      ('${U3}', 'u3@x', 'premium', now() - interval '1 day'),
      ('${U4}', 'u4@x', 'free', NULL),
      ('${ADM}', 'adm@x', 'free', NULL);
    INSERT INTO public.journals (id, user_id, name, is_default, is_active, created_at) VALUES
      ('${J1a}', '${U1}', 'Ana Hesap', true,  true,  now() - interval '3 days'),
      ('${J1b}', '${U1}', 'Second',    false, true,  now() - interval '2 days'),
      ('${J1c}', '${U1}', 'Archived',  false, false, now() - interval '1 days'),
      ('${J2a}', '${U2}', 'Ana Hesap', true,  true,  now()),
      ('${J3a}', '${U3}', 'Ana Hesap', true,  true,  now()),
      ('${J4a}', '${U4}', 'Ana Hesap', true,  true,  now()),
      ('${JAd}', '${ADM}', 'Ana Hesap', true, true,  now());
    INSERT INTO public.trades (user_id, journal_id, symbol, direction, instrument, lot, entry_price, exit_price, pnl, trade_date, platform_source, import_hash, created_at) VALUES
      ('${U1}', '${J1a}', 'EURUSD', 'LONG',  'forex', 1, 1.1, 1.2,  100.00, '2026-10-01', NULL, NULL, now()),
      ('${U1}', '${J1a}', 'EURUSD', 'SHORT', 'forex', 1, 1.2, 1.25, -50.00, '2026-10-02', NULL, 'EURUSD|SHORT|x', now()),
      ('${U1}', '${J1a}', 'XAUUSD', 'LONG',  'gold',  1, 2000, 2010, 1000.00, '2026-10-03', 'ctrader', 'ctrader:1:2', now()),
      ('${U1}', '${J1b}', 'GBPUSD', 'LONG',  'forex', 1, 1.3, 1.31, 10.00, '2026-10-04', NULL, NULL, now()),
      ('${U2}', '${J2a}', 'EURUSD', 'LONG',  'forex', 1, 1.1, 1.2,  100.00, '2026-10-05', NULL, NULL, now() - interval '2 days');
  `);
}

// ======================================================================================================
log(`PGlite: ${(await (async () => { const d = new PGlite(); const v = (await d.query('select version() v')).rows[0].v; await d.close(); return v; })())}`);

// ---------------------------------------------------------------- negative tests on fresh databases
log('\n[N1] 01 refuses when backtest_trades has a row, and changes nothing');
{
  const db = await newDb(); await seed(db);
  await db.exec(`INSERT INTO public.backtest_trades (user_id, symbol, side, entry_price, exit_price, entry_time, exit_time, pnl_pct, exit_reason)
                 VALUES ('${U1}', 'BTCUSDT', 'long', 1, 2, now(), now(), 1, 'TP')`);
  await expectErr(() => runFile(db, MIG.m01), /ABORT: public\.backtest_trades has 1 row/, '01 aborts on 1 row');
  ok((await one(db, `select to_regclass('public.backtest_trades') is not null as e`)).e, 'table still exists');
  ok(await fnMd5(db, 'public.reset_user_data()') === MD5['reset_user_data.live'], 'reset_user_data unchanged (live md5)');
  await db.close();
}

log('\n[N2] drift guards');
{
  const db = await newDb(); await seed(db);
  ok(await fnMd5(db, 'public.reset_user_data()') === MD5['reset_user_data.live'], 'mock live reset_user_data md5 == build md5 (CRLF/LF-insensitive)');
  ok(await fnMd5(db, 'public.delete_journal(uuid)') === MD5['delete_journal.live'], 'mock live delete_journal (CRLF body) md5 == build md5');
  ok(await fnMd5(db, 'public.list_journals()') === MD5['list_journals.live'], 'mock live list_journals md5 == build md5');
  ok(await fnMd5(db, 'public.get_platform_stats()') === MD5['get_platform_stats.live'], 'mock live get_platform_stats md5 == build md5');
  for (const f of ['evaluate_prop_firm_rules(uuid)', 'sync_journal_trades(uuid, jsonb)', 'get_journals_equity_data()',
    'get_strategy_performance(uuid)', 'get_today_trades_count()', 'get_total_trades_count()']) {
    ok(await fnMd5(db, 'public.' + f) === MD5[f.split('(')[0] + '.live'], `mock live ${f} md5 == build md5`);
  }
  // change reset_user_data -> 01 must refuse
  await db.exec(`CREATE OR REPLACE FUNCTION public.reset_user_data() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN PERFORM 1; END; $f$`);
  await expectErr(() => runFile(db, MIG.m01), /DRIFT: public\.reset_user_data\(\) differs/, '01 refuses a drifted reset_user_data');
  ok((await one(db, `select to_regclass('public.backtest_trades') is not null as e`)).e, 'nothing dropped');
  await db.close();
}
{
  const db = await newDb(); await seed(db);
  await runFile(db, MIG.m01);
  await db.exec(`CREATE OR REPLACE FUNCTION public.delete_journal(p_journal_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$ BEGIN RETURN '{}'::jsonb; END; $f$`);
  await expectErr(() => runFile(db, MIG.m02), /DRIFT: public\.delete_journal\(uuid\) differs/, '02 refuses a drifted delete_journal');
  ok((await one(db, `select to_regclass('public.backtest_accounts') is null as e`)).e, 'no table created');
  // 02 before 01 is refused
  await db.close();
}
{
  const db = await newDb(); await seed(db);
  await expectErr(() => runFile(db, MIG.m02), /ORDER: run 202610180001/, '02 refuses to run before 01');
  await expectErr(() => runFile(db, MIG.m04), /ORDER: run 202610180002/, '04 refuses to run before 02');
  // 02 as a role that does not bypass RLS
  await runFile(db, MIG.m01);
  await db.exec(`CREATE ROLE migrator NOLOGIN; GRANT CREATE, USAGE ON SCHEMA public TO migrator; GRANT USAGE ON SCHEMA auth TO migrator;`);
  await expectErr(() => runFile(db, 'SET ROLE migrator;\n' + MIG.m02), /PRECONDITION: role migrator does not bypass RLS/, '02 refuses a role without RLS bypass');
  await db.exec('RESET ROLE');
  // 06: a function that calls one of the six blocks the drop
  await db.exec(`CREATE FUNCTION public.uses_old() RETURNS bigint LANGUAGE sql AS $f$ SELECT public.get_total_trades_count() $f$`);
  await expectErr(() => runFile(db, MIG.m06), /IN USE: public\.uses_old\(\)/, '06 refuses while another function calls one of the six');
  ok(await fnMd5(db, 'public.get_total_trades_count()') !== null, 'nothing dropped');
  await db.exec(`DROP FUNCTION public.uses_old()`);
  await db.exec(`CREATE OR REPLACE FUNCTION public.get_today_trades_count() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $f$ SELECT 42::bigint $f$`);
  await expectErr(() => runFile(db, MIG.m06), /DRIFT: public\.get_today_trades_count\(\) changed/, '06 refuses a drifted function');
  await db.close();
}

log('\n[N3] OPTIONAL columns: declined via the one-line ALTER, and via deleting the block');
for (const variant of ['one-line', 'delete-block']) {
  const db = await newDb(); await seed(db);
  await runFile(db, MIG.m01);
  let m02 = MIG.m02;
  if (variant === 'one-line') {
    const line = '-- ALTER TABLE public.backtest_account_trades DROP COLUMN IF EXISTS gross_pnl, DROP COLUMN IF EXISTS exit_ambiguous;';
    const endMarker = m02.indexOf('-- <<< END OPTIONAL BLOCK');
    const at = m02.indexOf(line);
    ok(at > endMarker && endMarker > 0 && m02.indexOf(line, at + 1) < 0, 'decline line present once, after the block end');
    m02 = m02.replace(line, line.slice(3)); // uncomment in place
  } else {
    const a = m02.indexOf('-- 2b. >>> OPTIONAL BLOCK');
    const bLine = m02.indexOf('-- <<< END OPTIONAL BLOCK');
    const b = m02.indexOf('\n', bLine);
    ok(a > 0 && b > a, 'block markers found');
    m02 = m02.slice(0, a) + m02.slice(b + 1);
  }
  await runFile(db, m02);
  await runFile(db, m02); // re-run
  const cols = (await all(db, `select attname from pg_attribute where attrelid = 'public.backtest_account_trades'::regclass and attnum > 0 and not attisdropped`)).map((r) => r.attname);
  ok(!cols.includes('gross_pnl') && !cols.includes('exit_ambiguous'), `${variant}: optional columns absent`);
  ok(cols.length === 19, `${variant}: the 19 D3+D13 columns remain (got ${cols.length})`);
  const cons = (await all(db, `select conname from pg_constraint where conrelid = 'public.backtest_account_trades'::regclass and contype = 'c'`)).map((r) => r.conname);
  ok(cons.length === 10 && !cons.some((c) => /gross|ambig/.test(c)), `${variant}: 10 core CHECKs, optional ones gone (${cons.length})`);
  // the trigger still works without the columns
  const acc = (await as(db, U1, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time) values ($1, 'A', 'EURUSD', 10000, '2024-01-02T00:00:00Z') returning id`, [U1])).rows[0].id;
  const tr = (await as(db, U1, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'EURUSD', 'LONG', 1, 1.1, '2024-01-02T00:01:00Z') returning id`, [U1, acc])).rows[0].id;
  await as(db, U1, `update public.backtest_account_trades set exit_price = 1.2, exit_time = '2024-01-02T00:05:00Z', exit_reason = 'tp', pnl = 100 where id = $1`, [tr]);
  ok(true, `${variant}: open + close a trade without the optional columns`);
  await db.close();
}

log('\n[N4] 02 on a database WITHOUT touch_updated_at creates it (and 02.down keeps it)');
{
  const db = await newDb(); await seed(db);
  await db.exec(`DROP TRIGGER trg_journals_updated_at ON public.journals; DROP FUNCTION public.touch_updated_at();`);
  await runFile(db, MIG.m01);
  await runFile(db, MIG.m02);
  const t = await one(db, `select pg_get_functiondef('public.touch_updated_at()'::regprocedure) as d`);
  ok(/NEW\.updated_at = now\(\); RETURN NEW;/.test(t.d) && !/SECURITY DEFINER/.test(t.d), 'touch_updated_at created with the live definition');
  const acc = (await as(db, U1, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time) values ($1, 'A', 'EURUSD', 10000, '2024-01-02T00:00:00Z') returning id, updated_at`, [U1])).rows[0];
  await as(db, U1, `update public.backtest_accounts set name = 'B' where id = $1`, [acc.id]);
  ok(new Date((await one(db, `select updated_at from public.backtest_accounts where id = $1`, [acc.id])).updated_at) > new Date(acc.updated_at), 'updated_at trigger works with the created function');
  const d02c = MIG.d02.replace("-- SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';", "SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';");
  await runFile(db, d02c);
  ok((await one(db, `select to_regprocedure('public.touch_updated_at()') is not null as e`)).e, '02.down never drops touch_updated_at');
  await db.close();
}

log('\n[P] RUN_ORDER pre-flight queries (verify/preflight.sql) run on the mock');
{
  const db = await newDb(); await seed(db);
  const res = await db.exec(read(path.join(here, 'preflight.sql')));
  const sel = res.filter((r) => r.fields && r.fields.length);
  ok(sel.length === 15, `15 result sets (${sel.length})`);
  const p1 = sel[0].rows;
  ok(p1.length === 11 && p1.every((r) => /^GRANT EXECUTE ON FUNCTION public\./.test(r.restore_sql)), `P1: 11 functions with schema-qualified GRANT lines`);
  for (const r of p1) await db.exec(r.restore_sql); // the generated statements execute
  ok(true, 'P1 restore_sql statements are executable');
  ok(sel[1].rows.length === 15 && sel[2].rows.length === 2 && sel[3].rows.length === 4 && sel[4].rows.length === 4, 'P2: 15 columns, 2 constraints, 4 indexes, 4 policies');
  const p3 = sel[7].rows;
  ok(p3.length === 10 && p3.every((r) => r.unchanged === true), 'P3: all 10 live bodies unchanged on the mock');
  ok(sel[8].rows[0].bypasses_rls === true, 'P4: role bypasses RLS');
  ok(sel[11].rows[0].accounts === null, 'P5: no backtest_accounts yet');
  ok(sel[12].rows[0].backtest_rows === 0 || sel[12].rows[0].backtest_rows === '0', 'P5: no backtest rows in trades');
  ok(sel[14].rows.length === 0, 'P6: no in-database caller of the six functions');
  await db.close();
}

log('\n[V] supabase/tests/backtest_v2_verify.sql (owner-side test) on a Supabase-like auth.users');
{
  const VERIFY = read(path.join(planDir, 'supabase/tests/backtest_v2_verify.sql'));
  const db = await newDb(); await seed(db);
  await db.exec(`ALTER TABLE auth.users ADD COLUMN aud text, ADD COLUMN role text, ADD COLUMN raw_app_meta_data jsonb,
                   ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN updated_at timestamptz;`);
  await db.exec(read(path.join(dbDir, 'fn_handle_new_user.sql')) + ';');
  await db.exec(`CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`);
  const usersBefore = (await one(db, `select count(*)::int as n from auth.users`)).n;
  const runVerify = async () => {
    try { await db.exec(VERIFY); return 'NO EXCEPTION'; } catch (e) { try { await db.exec('ROLLBACK'); } catch { /* */ } return String(e.message); }
  };
  await expectErr(() => runFile(db, VERIFY), /Migration 202610180002 is not applied/, 'verify before 02: clear message');
  await runFile(db, MIG.m01);
  await runFile(db, MIG.m02);
  let msg = await runVerify();
  log('      ' + msg.split('\n').filter((l) => /\[|SUMMARY/.test(l)).join('\n      '));
  ok(/SUMMARY: 1[4-9] PASS, 0 FAIL/.test(msg) && /\[SKIP\] S15/.test(msg) && /\[SKIP\] S16/.test(msg), 'after 02: all PASS, S15/S16 skipped');
  await runFile(db, MIG.m04);
  await runFile(db, MIG.m05);
  msg = await runVerify();
  log('      ' + msg.split('\n').filter((l) => /\[|SUMMARY/.test(l)).join('\n      '));
  ok(/SUMMARY: \d+ PASS, 0 FAIL/.test(msg) && !/\[SKIP\]/.test(msg), 'after 04 + 05: all PASS, nothing skipped');
  ok((await one(db, `select count(*)::int as n from auth.users`)).n === usersBefore, 'verify left no test user behind');
  ok((await one(db, `select count(*)::int as n from public.backtest_accounts`)).n === 0, 'verify left no backtest account behind');
  // with the OPTIONAL columns declined
  await db.exec(`ALTER TABLE public.backtest_account_trades DROP COLUMN IF EXISTS gross_pnl, DROP COLUMN IF EXISTS exit_ambiguous;`);
  msg = await runVerify();
  ok(/SUMMARY: \d+ PASS, 0 FAIL/.test(msg) && /S10a open \+ close \(OPTIONAL columns not installed\)/.test(msg), 'verify passes without the OPTIONAL columns too');
  await db.close();
}

// ---------------------------------------------------------------- security fix (00)
log('\n[N0] 00: evaluate_prop_firm_rules ownership check + no anon (own database)');
{
  const db = await newDb(); await seed(db);
  const EV = 'public.evaluate_prop_firm_rules(uuid)';
  await db.exec(`UPDATE public.journals SET is_prop_firm = true, prop_firm_rules = '{"initial_balance": 1000}'::jsonb WHERE id = '${J1a}'`);
  // before: the hole is real
  const hole = (await as(db, null, `select public.evaluate_prop_firm_rules($1) as r`, [J1a], { role: 'anon' })).rows[0].r;
  ok(hole && hole.status === 'active', 'BEFORE 00: anon can evaluate (and write to) any journal: the IDOR exists in the mock live');
  // drift guard
  await db.exec(`CREATE OR REPLACE FUNCTION public.evaluate_prop_firm_rules(p_journal_id uuid) RETURNS jsonb LANGUAGE sql AS $f$ SELECT '{}'::jsonb $f$`);
  await expectErr(() => runFile(db, MIG.m00), /DRIFT: public\.evaluate_prop_firm_rules\(uuid\) changed/, '00 refuses a drifted function');
  await db.close();
}
{
  const db = await newDb(); await seed(db);
  const EV = 'public.evaluate_prop_firm_rules(uuid)';
  await db.exec(`UPDATE public.journals SET is_prop_firm = true, prop_firm_rules = '{"initial_balance": 1000}'::jsonb WHERE id = '${J1a}'`);
  const before = await snap(db);
  await runFile(db, MIG.m00);
  await runFile(db, MIG.m00); // idempotent
  ok(await fnMd5(db, EV) === MD5['evaluate_prop_firm_rules.s0'], '00: body == s0 md5');
  ok((await execs(db, EV)) === '{authenticated,postgres,service_role}', `00: EXECUTE only for authenticated, postgres, service_role (${await execs(db, EV)})`);
  const a = await snap(db);
  const dd = diffSnap(before, a);
  ok(dd.length === 4 && dd.every((x) => /evaluate_prop_firm_rules/.test(x)) && dd.some((x) => x.startsWith('functions')) && dd.some((x) => x.startsWith('acls')),
    `00 changes only the body and the ACL of evaluate_prop_firm_rules${dd.length === 4 ? '' : '\n      ' + dd.join('\n      ')}`);
  await expectErr(() => as(db, null, `select public.evaluate_prop_firm_rules($1)`, [J1a], { role: 'anon' }), /permission denied for function evaluate_prop_firm_rules/, 'anon: permission denied');
  await expectErr(() => as(db, U2, `select public.evaluate_prop_firm_rules($1)`, [J1a]), /FORBIDDEN: journal not found or not owned/, 'authenticated non-owner: FORBIDDEN');
  await expectErr(() => as(db, U1, `select public.evaluate_prop_firm_rules($1)`, ['99999999-9999-4999-8999-999999999999']), /FORBIDDEN/, 'authenticated, unknown journal: FORBIDDEN (same message, no existence leak)');
  const own = (await as(db, U1, `select public.evaluate_prop_firm_rules($1) as r`, [J1a])).rows[0].r;
  ok(own && own.status === 'active' && Number(own.initial_balance) === 1000, 'authenticated owner: works');
  ok((await one(db, `select prop_firm_status as s from public.journals where id = $1`, [J1a])).s === 'active', 'owner call wrote prop_firm_status');
  const svc = (await as(db, null, `select public.evaluate_prop_firm_rules($1) as r`, [J1a], { role: 'service_role' })).rows[0].r;
  ok(svc && svc.status === 'active', 'service_role (no user id): works');
  const sql = (await one(db, `select public.evaluate_prop_firm_rules($1) as r`, [J1a])).r;
  ok(sql && sql.status === 'active', 'direct SQL session (no JWT): works');
  // a non-prop journal of the caller is still answered {status: none}
  ok((await as(db, U1, `select public.evaluate_prop_firm_rules($1) as r`, [J1b])).rows[0].r.status === 'none', 'owner, non-prop journal: status none');
  // 06 after 00: accepted; 06.down: secure body and ACL stay
  await runFile(db, MIG.m01);
  await runFile(db, MIG.m06);
  ok((await one(db, `select to_regprocedure('${EV}') is null as e`)).e, '06 after 00: drift guard accepts the 00 body, function dropped');
  await runFile(db, MIG.d06);
  ok(await fnMd5(db, EV) === MD5['evaluate_prop_firm_rules.s0'] && (await execs(db, EV)) === '{authenticated,postgres,service_role}', '06.down after 00: secure body and ACL restored (hole stays closed)');
  await runFile(db, MIG.d01);
  // 00.down re-opens, twice
  await runFile(db, MIG.d00);
  await runFile(db, MIG.d00);
  const r = await snap(db);
  const d2 = diffSnap(before, r);
  ok(d2.length === 0, `00.down: catalog identical to before 00${d2.length ? '\n      ' + d2.join('\n      ') : ''}`);
  ok((await as(db, null, `select public.evaluate_prop_firm_rules($1) as r`, [J1a], { role: 'anon' })).rows[0].r.status === 'active', '00.down re-opens the hole as documented');
  await db.close();
}

// ---------------------------------------------------------------- main flow
log('\n[M0] mock of the live schema');
const db = await newDb();
await seed(db);
const baseline = await snap(db);
ok(baseline.tables.some((t) => t.relname === 'backtest_trades'), 'mock has backtest_trades');

log('\n[M0b] 00: security fix first, as in the real run order');
await runFile(db, MIG.m00);
await runFile(db, MIG.m00);
ok(await fnMd5(db, 'public.evaluate_prop_firm_rules(uuid)') === MD5['evaluate_prop_firm_rules.s0'], 'evaluate_prop_firm_rules = 00 body');

log('\n[M1] 01: apply twice');
await runFile(db, MIG.m01);
await runFile(db, MIG.m01);
ok((await one(db, `select to_regclass('public.backtest_trades') is null as e`)).e, 'backtest_trades dropped');
ok(await fnMd5(db, 'public.reset_user_data()') === MD5['reset_user_data.v01'], 'reset_user_data = v01');
ok((await execs(db, 'public.reset_user_data()')) === '{authenticated,postgres,service_role}', `reset_user_data EXECUTE: ${await execs(db, 'public.reset_user_data()')}`);
const fattr = await one(db, `select prosecdef, provolatile, proconfig::text as cfg from pg_proc where oid = 'public.reset_user_data()'::regprocedure`);
const battr = baseline.functions.find((r) => r.fn === 'reset_user_data()');
ok(fattr.prosecdef && fattr.provolatile === 'v' && fattr.cfg === battr.cfg && battr.prosecdef, `reset_user_data attributes kept ${JSON.stringify(fattr)}`);
await as(db, U4, `select public.reset_user_data()`);
ok(true, 'reset_user_data (v01) runs for a user');
const after01 = await snap(db);

log('\n[M2] 02: apply twice');
await runFile(db, MIG.m02);
await runFile(db, MIG.m02);
ok(await fnMd5(db, 'public.reset_user_data()') === MD5['reset_user_data.v02'], 'reset_user_data = v02');
ok(await fnMd5(db, 'public.delete_journal(uuid)') === MD5['delete_journal.v02'], 'delete_journal = v02');
ok((await execs(db, 'public.delete_journal(uuid)')) === '{authenticated,postgres,service_role}', `delete_journal EXECUTE: ${await execs(db, 'public.delete_journal(uuid)')}`);
for (const f of ['public.check_backtest_account_limit()', 'public.check_backtest_trade()']) {
  ok((await execs(db, f)) === '{postgres,service_role}', `${f} EXECUTE only postgres/service_role: ${await execs(db, f)}`);
}
const dj = await one(db, `select prosecdef, provolatile, proconfig::text as cfg, pg_get_function_result(oid) as res from pg_proc where oid = 'public.delete_journal(uuid)'::regprocedure`);
const bdj = baseline.functions.find((r) => r.fn === 'delete_journal(uuid)');
ok(dj.prosecdef && dj.provolatile === bdj.provolatile && dj.cfg === bdj.cfg && dj.res === bdj.res, `delete_journal attributes kept ${JSON.stringify(dj)}`);
const pol = await all(db, `select tablename, policyname, cmd, roles::text as roles from pg_policies where tablename in ('backtest_accounts','backtest_account_trades') order by 1, 2`);
ok(pol.length === 8 && pol.every((p) => p.roles === '{authenticated}'), `8 policies TO authenticated (${pol.length})`);
const trg = await all(db, `select tgname from pg_trigger where not tgisinternal and tgrelid in ('public.backtest_accounts'::regclass, 'public.backtest_account_trades'::regclass) order by 1`);
ok(trg.map((t) => t.tgname).join(',') === 'trg_backtest_accounts_updated_at,trg_check_backtest_account_limit,trg_check_backtest_trade', 'three triggers');
ok((await all(db, `select 1 from pg_constraint where conrelid = 'public.backtest_account_trades'::regclass and contype = 'c'`)).length === 12, '12 CHECKs on trades (with optional)');
ok((await all(db, `select 1 from pg_constraint where conrelid = 'public.backtest_accounts'::regclass and contype = 'c'`)).length === 7, '7 CHECKs on accounts');

log('\n[M2a] accounts: constraints');
const insAcc = (uid, extra = {}, opts = {}) => {
  const row = { user_id: uid, name: 'Acc', symbol: 'EURUSD', starting_balance: '10000', replay_time: '2024-01-02T00:00:00Z', ...extra };
  const cols = Object.keys(row);
  return as(db, uid, `insert into public.backtest_accounts (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, Object.values(row), opts);
};
for (const [extra, re, label] of [
  [{ name: '' }, /chk_backtest_accounts_name/, 'empty name'],
  [{ name: '   ' }, /chk_backtest_accounts_name/, 'blank name'],
  [{ name: 'x'.repeat(61) }, /chk_backtest_accounts_name/, '61-char name'],
  [{ symbol: 'eurusd' }, /chk_backtest_accounts_symbol/, 'lower-case symbol'],
  [{ symbol: 'EUR/USD' }, /chk_backtest_accounts_symbol/, 'symbol with slash'],
  [{ timeframe: '2h' }, /chk_backtest_accounts_timeframe/, 'timeframe 2h'],
  [{ starting_balance: '0' }, /chk_backtest_accounts_starting_balance/, 'balance 0'],
  [{ starting_balance: 'NaN' }, /chk_backtest_accounts_starting_balance/, 'balance NaN'],
  [{ starting_balance: '100000000.01' }, /chk_backtest_accounts_starting_balance/, 'balance > 1e8'],
  [{ spread_pips: 'NaN' }, /chk_backtest_accounts_spread_pips/, 'spread NaN'],
  [{ spread_pips: '-1' }, /chk_backtest_accounts_spread_pips/, 'spread < 0'],
  [{ commission_per_lot: 'NaN' }, /chk_backtest_accounts_commission_per_lot/, 'commission NaN'],
  [{ commission_per_lot: '10000.01' }, /chk_backtest_accounts_commission_per_lot/, 'commission > 10000'],
  [{ replay_time: 'infinity' }, /chk_backtest_accounts_replay_time/, 'replay_time infinity'],
]) {
  await expectErr(() => insAcc(U1, extra), re, `rejects ${label}`);
}
ok((await one(db, `select count(*)::int as n from public.backtest_accounts`)).n === 0, 'no account was created by the rejected inserts');

log('\n[M2b] accounts: quota, journal ownership, RLS, immutables');
const A1 = (await insAcc(U1, { journal_id: J1a, name: 'U1 main' })).rows[0];
ok(A1.timeframe === '1h' && A1.spread_pips === '0.00' && A1.is_active === true, 'defaults (1h, 0.00, active)');
await expectErr(() => insAcc(U1, { name: 'second' }), /BACKTEST_LIMIT_EXCEEDED:1/, 'free user: 2nd active account refused');
const A1x = (await insAcc(U1, { name: 'inactive', is_active: false })).rows[0];
ok(!!A1x.id, 'free user: inactive 2nd account allowed');
await expectErr(() => as(db, U1, `update public.backtest_accounts set is_active = true where id = $1`, [A1x.id]), /BACKTEST_LIMIT_EXCEEDED:1/, 'free user: reactivation above quota refused');
await as(db, U1, `update public.backtest_accounts set is_active = false where id = $1`, [A1.id]);
await as(db, U1, `update public.backtest_accounts set is_active = true where id = $1`, [A1x.id]);
ok(true, 'free user: swap active account (deactivate one, activate the other)');
await as(db, U1, `update public.backtest_accounts set is_active = false where id = $1`, [A1x.id]);
await as(db, U1, `update public.backtest_accounts set is_active = true where id = $1`, [A1.id]);
const p10 = [];
for (let i = 0; i < 10; i++) p10.push((await insAcc(U2, { name: 'p' + i, symbol: 'BTCUSDT' })).rows[0].id);
ok(p10.length === 10, 'premium user: 10 active accounts');
await expectErr(() => insAcc(U2, { name: 'p10' }), /BACKTEST_LIMIT_EXCEEDED:10/, 'premium user: 11th refused');
await insAcc(U3, { name: 'exp' });
await expectErr(() => insAcc(U3, { name: 'exp2' }), /BACKTEST_LIMIT_EXCEEDED:1/, 'expired premium counts as free');
await expectErr(() => insAcc(U1, { journal_id: J2a, is_active: false, name: 'x' }), /INVALID_JOURNAL/, "other user's journal refused on insert");
await expectErr(() => insAcc(U1, { journal_id: J1c, is_active: false, name: 'x' }), /INVALID_JOURNAL/, 'inactive own journal refused on insert');
await expectErr(() => as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J2a]), /INVALID_JOURNAL/, "relink to other user's journal refused");
await as(db, U1, `update public.backtest_accounts set journal_id = null where id = $1`, [A1.id]);
await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J1a]);
ok(true, 'unlink and relink to an own active journal');
await expectErr(() => as(db, U1, `update public.backtest_accounts set symbol = 'GBPUSD' where id = $1`, [A1.id]), /BACKTEST_ACCOUNT_IMMUTABLE:symbol/, 'symbol immutable');
await expectErr(() => db.query(`update public.backtest_accounts set user_id = $2 where id = $1`, [A1.id, U2]), /BACKTEST_ACCOUNT_IMMUTABLE:user_id/, 'user_id immutable (even for postgres)');
await expectErr(() => as(db, U1, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time) values ($1, 'x', 'EURUSD', 1, now())`, [U2]), /BACKTEST_NOT_OWNER/, 'insert for another user refused before the quota check (no plan/count leak)');
await expectErr(() => as(db, null, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time) values ($1, 'x', 'EURUSD', 1, now())`, [U2], { role: 'anon' }), /BACKTEST_NOT_OWNER/, 'anon insert for a user refused before the quota check (no leak to anon either)');
await expectErr(() => as(db, null, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'BTCUSDT', 'LONG', 1, 1, now())`, [U2, p10[0]], { role: 'anon' }), /BACKTEST_NOT_OWNER/, 'anon trade insert refused before the account check');
await expectErr(() => as(db, U1, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time, journal_id, is_active) values ($1, 'x', 'EURUSD', 1, now(), $2, false)`, [U2, J2a]), /BACKTEST_NOT_OWNER/, 'insert for another user refused before the journal check (no ownership leak)');
ok((await as(db, U1, `select count(*)::int as n from public.backtest_accounts`)).rows[0].n === 2, 'RLS: U1 sees only its 2 accounts');
ok((await as(db, U1, `update public.backtest_accounts set name = 'hack' where user_id = $1 returning id`, [U2])).rows.length === 0, "RLS: U1 cannot update U2's accounts");
ok((await as(db, ADM, `select count(*)::int as n from public.backtest_accounts`, [], { admin: true })).rows[0].n === 13, 'admin (is_admin) sees all 13 accounts');
await expectErr(() => as(db, ADM, `update public.backtest_accounts set name = 'adm' where id = $1`, [p10[0]], { admin: true }), /row-level security/, 'admin cannot modify other users\' accounts (D3 WITH CHECK user_id = auth.uid())');
await expectErr(() => as(db, ADM, `insert into public.backtest_accounts (user_id, name, symbol, starting_balance, replay_time, is_active) values ($1, 'x', 'EURUSD', 1, now(), false)`, [U1], { admin: true }), /row-level security/, 'admin cannot create accounts for other users');
ok((await as(db, ADM, `delete from public.backtest_accounts where id = $1 and false returning id`, [p10[0]], { admin: true })).rows.length === 0, 'admin delete path parses (USING own OR is_admin)');
const prevUpd = (await one(db, `select updated_at from public.backtest_accounts where id = $1`, [A1.id])).updated_at;
await as(db, U1, `update public.backtest_accounts set replay_time = replay_time + interval '1 minute' where id = $1`, [A1.id]);
const newUpd = (await one(db, `select updated_at from public.backtest_accounts where id = $1`, [A1.id])).updated_at;
ok(new Date(newUpd) > new Date(prevUpd), 'updated_at bumped by trg_backtest_accounts_updated_at');
const anonRows = await as(db, null, `select count(*)::int as n from public.backtest_accounts`, [], { role: 'anon' }).then((r) => r.rows[0].n).catch(() => 'denied');
ok(anonRows === 0 || anonRows === 'denied', `anon sees nothing (${anonRows})`);

log('\n[M2c] trades: constraints, trigger, RLS');
const insTr = (uid, extra = {}) => {
  const row = { user_id: uid, backtest_account_id: A1.id, symbol: 'EURUSD', direction: 'LONG', lot: '0.37', entry_price: '1.08311', entry_time: '2024-01-02T00:01:00Z', ...extra };
  const cols = Object.keys(row);
  return as(db, uid, `insert into public.backtest_account_trades (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, Object.values(row));
};
const T1 = (await insTr(U1, { stop_loss: '1.08111', take_profit: '1.08711', rr_ratio: '2.00' })).rows[0];
ok(T1.exit_time === null && T1.commission === '0.00' && T1.exit_ambiguous === false, 'open position stored with exit_* NULL');
await expectErr(() => insTr(U1, { symbol: 'GBPUSD' }), /BACKTEST_SYMBOL_MISMATCH/, 'symbol must equal the account symbol');
await expectErr(() => insTr(U1, { backtest_account_id: p10[0], symbol: 'BTCUSDT' }), /INVALID_BACKTEST_ACCOUNT/, "account of another user refused");
await expectErr(() => as(db, U1, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'BTCUSDT', 'LONG', 1, 1, now())`, [U2, p10[0]]), /BACKTEST_NOT_OWNER/, 'trade for another user refused before the account check (no leak)');
await expectErr(() => as(db, U1, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'BTCUSDT', 'LONG', 1, 1, now())`, [U2, A1.id]), /BACKTEST_NOT_OWNER/, 'trade for another user on own account refused');
for (const [extra, re, label] of [
  [{ direction: 'BUY' }, /chk_backtest_account_trades_direction/, 'direction BUY'],
  [{ lot: '0' }, /chk_backtest_account_trades_lot/, 'lot 0'],
  [{ lot: 'NaN' }, /chk_backtest_account_trades_lot/, 'lot NaN'],
  [{ entry_price: 'NaN' }, /chk_backtest_account_trades_prices/, 'entry NaN'],
  [{ entry_price: 'Infinity' }, /chk_backtest_account_trades_prices/, 'entry Infinity'],
  [{ entry_price: '0' }, /chk_backtest_account_trades_prices/, 'entry 0'],
  [{ stop_loss: '-1' }, /chk_backtest_account_trades_prices/, 'negative SL'],
  [{ take_profit: 'NaN' }, /chk_backtest_account_trades_prices/, 'TP NaN'],
  [{ entry_time: 'infinity' }, /chk_backtest_account_trades_times/, 'entry_time infinity'],
  [{ commission: 'NaN' }, /chk_backtest_account_trades_commission/, 'commission NaN'],
  [{ commission: '-0.01' }, /chk_backtest_account_trades_commission/, 'negative commission'],
  [{ rr_ratio: '-1' }, /chk_backtest_account_trades_rr_ratio/, 'negative rr'],
  [{ rr_ratio: 'NaN' }, /chk_backtest_account_trades_rr_ratio/, 'rr NaN'],
  [{ exit_reason: 'TP' }, /chk_backtest_account_trades_exit_reason/, "exit_reason 'TP'"],
  [{ exit_price: '1.1' }, /chk_backtest_account_trades_open_closed/, 'exit_price without the other exit columns'],
  [{ exit_price: '1.1', exit_time: '2024-01-02T00:00:00Z', exit_reason: 'manual', pnl: '1.00', gross_pnl: '3.00', commission: '2.00' }, /chk_backtest_account_trades_exit_after_entry/, 'exit before entry'],
  [{ exit_price: '1.1', exit_time: '2024-01-02T00:05:00Z', exit_reason: 'manual', pnl: 'NaN', gross_pnl: '1.00' }, /chk_backtest_account_trades_pnl|chk_backtest_account_trades_gross_pnl/, 'pnl NaN'],
  [{ exit_price: '1.1', exit_time: '2024-01-02T00:05:00Z', exit_reason: 'manual', pnl: '1.00', gross_pnl: '1.50', commission: '0.40' }, /chk_backtest_account_trades_gross_pnl/, 'net != gross - commission'],
  [{ exit_price: '1.1', exit_time: '2024-01-02T00:05:00Z', exit_reason: 'manual', pnl: '1.00' }, /chk_backtest_account_trades_gross_pnl/, 'closed without gross_pnl'],
  [{ gross_pnl: '1.00' }, /chk_backtest_account_trades_gross_pnl/, 'open with gross_pnl'],
  [{ exit_ambiguous: true }, /chk_backtest_account_trades_exit_ambiguous/, 'open trade flagged ambiguous'],
  [{ exit_price: '1.1', exit_time: '2024-01-02T00:05:00Z', exit_reason: 'manual', pnl: '1.00', gross_pnl: '1.00', exit_ambiguous: true }, /chk_backtest_account_trades_exit_ambiguous/, "ambiguous with exit_reason 'manual'"],
]) {
  await expectErr(() => insTr(U1, extra), re, `rejects ${label}`);
}
// SL/TP edit on the open position, then close it (net = gross - commission, D4 example numbers)
await as(db, U1, `update public.backtest_account_trades set stop_loss = '1.08211' where id = $1`, [T1.id]);
ok(true, 'open position: SL edit allowed');
await expectErr(() => as(db, U1, `update public.backtest_account_trades set entry_price = '1.1' where id = $1`, [T1.id]), /BACKTEST_TRADE_IMMUTABLE/, 'entry_price immutable');
await expectErr(() => as(db, U1, `update public.backtest_account_trades set backtest_account_id = $2 where id = $1`, [T1.id, A1x.id]), /BACKTEST_TRADE_IMMUTABLE/, 'account immutable');
await as(db, U1, `update public.backtest_account_trades set exit_price = '1.08423', exit_time = '2024-01-02T03:00:00Z', exit_reason = 'tp', gross_pnl = '41.44', commission = '2.59', pnl = '38.85', exit_ambiguous = false where id = $1`, [T1.id]);
ok(true, 'close: gross 41.44, commission 2.59, net 38.85');
await expectErr(() => as(db, U1, `update public.backtest_account_trades set pnl = '40.00', gross_pnl = '42.59' where id = $1`, [T1.id]), /BACKTEST_TRADE_CLOSED/, 'closed trade is final');
await as(db, U1, `update public.backtest_account_trades set pnl = pnl where id = $1`, [T1.id]);
ok(true, 'no-op update of a closed trade passes');
const T2 = (await insTr(U1, { entry_time: '2024-01-02T04:00:00Z', direction: 'SHORT', stop_loss: '1.09', take_profit: '1.07' })).rows[0];
await as(db, U1, `update public.backtest_account_trades set exit_price = '1.09', exit_time = '2024-01-02T04:01:00Z', exit_reason = 'sl', gross_pnl = '-250.00', commission = '2.59', pnl = '-252.59', exit_ambiguous = true where id = $1`, [T2.id]);
ok(true, 'closed SL trade flagged exit_ambiguous');

log('\n[M2c2] D13: initial levels, frozen spread/commission, monotonic replay_time');
{
  const t1 = await one(db, `select stop_loss, initial_stop_loss, initial_take_profit from public.backtest_account_trades where id = $1`, [T1.id]);
  ok(t1.initial_stop_loss === '1.08111' && t1.stop_loss === '1.08211' && t1.initial_take_profit === '1.08711', 'initial SL/TP = levels at open, kept after the SL edit');
  const T3 = (await insTr(U1, { entry_time: '2024-01-02T05:00:00Z', stop_loss: '1.08', take_profit: '1.09', initial_stop_loss: '1.5', initial_take_profit: '1.6' })).rows[0];
  ok(T3.initial_stop_loss === '1.08' && T3.initial_take_profit === '1.09', 'client-sent initial levels are overwritten at open');
  await expectErr(() => as(db, U1, `update public.backtest_account_trades set initial_take_profit = '1.1' where id = $1`, [T3.id]), /BACKTEST_TRADE_IMMUTABLE/, 'initial_take_profit immutable');
  await expectErr(() => as(db, U1, `update public.backtest_account_trades set rr_ratio = '9.00' where id = $1`, [T3.id]), /BACKTEST_TRADE_IMMUTABLE/, 'rr_ratio immutable');
  await expectErr(() => as(db, U1, `update public.backtest_accounts set spread_pips = '1.50' where id = $1`, [A1.id]), /BACKTEST_OPEN_POSITIONS:spread_pips/, 'spread frozen while a position is open');
  await expectErr(() => as(db, U1, `update public.backtest_accounts set commission_per_lot = '7.00' where id = $1`, [A1.id]), /BACKTEST_OPEN_POSITIONS:commission_per_lot/, 'commission frozen while a position is open');
  await as(db, U1, `update public.backtest_accounts set name = 'U1 main renamed' where id = $1`, [A1.id]);
  ok(true, 'rename allowed while a position is open');
  await as(db, U1, `delete from public.backtest_account_trades where id = $1`, [T3.id]);
  await as(db, U1, `update public.backtest_accounts set spread_pips = '1.50', name = 'U1 main' where id = $1`, [A1.id]);
  await as(db, U1, `update public.backtest_accounts set spread_pips = '0' where id = $1`, [A1.id]);
  ok(true, 'spread editable again with no open position');
  await expectErr(() => as(db, U1, `update public.backtest_accounts set replay_time = replay_time - interval '1 minute' where id = $1`, [A1.id]), /BACKTEST_REPLAY_BACKWARD/, 'replay_time cannot go back on an account with trades');
  await as(db, U1, `update public.backtest_accounts set replay_time = replay_time + interval '1 day' where id = $1`, [A1.id]);
  ok(true, 'replay_time forward allowed');
  await as(db, U1, `update public.backtest_accounts set replay_time = replay_time - interval '1 day' where id = $1`, [A1x.id]);
  ok(true, 'replay_time backward allowed on an account without trades');
}

log('\n[M2d] reset_user_data (v02) and delete_journal (v02)');
{
  // U3: single active journal (reset branch). Link its account, delete the journal.
  const A3 = (await one(db, `select id from public.backtest_accounts where user_id = $1`, [U3])).id;
  await as(db, U3, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A3, J3a]);
  const r = (await as(db, U3, `select public.delete_journal($1) as r`, [J3a])).rows[0].r;
  ok(r.reset === true, 'delete_journal: last-journal branch resets the journal');
  ok((await one(db, `select journal_id from public.backtest_accounts where id = $1`, [A3])).journal_id === null, 'reset branch: account detached');
  // U1 delete-branch: link the inactive account to J1b, delete J1b
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1x.id, J1b]);
  const r2 = (await as(db, U1, `select public.delete_journal($1) as r`, [J1b])).rows[0].r;
  ok(r2.deleted_id === J1b, 'delete_journal: delete branch');
  ok((await one(db, `select journal_id from public.backtest_accounts where id = $1`, [A1x.id])).journal_id === null, 'delete branch: account detached');
  // reset_user_data for U3 deletes its account + trades and keeps U1/U2 data
  await as(db, U3, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'EURUSD', 'LONG', 1, 1.1, '2024-01-02T00:01:00Z')`, [U3, A3]);
  await as(db, U3, `select public.reset_user_data()`);
  ok((await one(db, `select count(*)::int as n from public.backtest_accounts where user_id = $1`, [U3])).n === 0, 'reset_user_data: accounts of the user deleted');
  ok((await one(db, `select count(*)::int as n from public.backtest_account_trades where user_id = $1`, [U3])).n === 0, 'reset_user_data: account trades deleted');
  ok((await one(db, `select count(*)::int as n from public.backtest_accounts where user_id <> $1`, [U3])).n === 12, 'other users untouched (U1: 2, U2: 10)');
  ok((await one(db, `select count(*)::int as n from public.journals where user_id = $1`, [U3])).n === 1, 'reset_user_data: default journal kept (step 5 unchanged)');
  // anon cannot call them any more
  await expectErr(() => as(db, null, `select public.delete_journal($1)`, [J1a], { role: 'anon' }), /permission denied/, 'anon: delete_journal not executable');
  await expectErr(() => as(db, null, `select public.reset_user_data()`, [], { role: 'anon' }), /permission denied/, 'anon: reset_user_data not executable');
}

log('\n[M4] 04: apply twice + cleanup behaviour');
await runFile(db, MIG.m04);
await runFile(db, MIG.m04);
ok((await execs(db, 'public.backtest_accounts_cleanup_trades()')) === '{postgres,service_role}', `cleanup fn EXECUTE: ${await execs(db, 'public.backtest_accounts_cleanup_trades()')}`);
// helper: mirror rows as bt-sync would write them (client upsert, RLS as U1)
const mirror = (uid, jid, accId, tradeKey, extra = {}) => as(db, uid,
  `insert into public.trades (user_id, journal_id, platform_source, import_hash, position_id, status, is_quick_entry, symbol, direction, lot,
     entry_price, exit_price, stop_loss, take_profit, rr_ratio, pnl, gross_pnl, commission, swap, instrument, multiplier, trade_date, exit_date)
   values ($1, $2, 'backtest', $3, null, 'closed', false, 'EURUSD', 'LONG', '0.37', '1.08311', '1.08423', '1.08111', '1.08711', '2.00',
     '38.85', '41.44', '2.59', '0.00', 'forex', '100000', '2024-01-02T00:01:00Z', '2024-01-02T03:00:00Z')
   on conflict (user_id, journal_id, import_hash) do nothing returning id, pnl, rr_ratio`, [uid, jid, `backtest:${accId}:${tradeKey}`]);
const cnt = async (where, params = []) => (await one(db, `select count(*)::int as n from public.trades where ${where}`, params)).n;
{
  const m = await mirror(U1, J1a, A1.id, 't1');
  ok(m.rows[0].pnl === '38.85' && m.rows[0].rr_ratio === '2.00', 'mirror stored; trg_calc_pnl keeps pnl, rr unchanged');
  ok((await mirror(U1, J1a, A1.id, 't1')).rows.length === 0, 'upsert on (user_id, journal_id, import_hash) is idempotent');
  await mirror(U1, J1a, A1.id, 't2');
  await mirror(U1, J1a, A1x.id, 'other-account');              // another account, same journal
  await db.query(`insert into public.trades (user_id, journal_id, symbol, direction, lot, pnl, trade_date, import_hash) values ($1, $2, 'EURUSD', 'LONG', 1, 5, now(), $3)`, [U1, J1a, `backtest:${A1.id}X:1`]); // near-miss prefix
  await db.query(`insert into public.trades (user_id, journal_id, symbol, direction, lot, pnl, trade_date, import_hash, platform_source) values ($1, $2, 'EURUSD', 'LONG', 1, 5, now(), $3, 'backtest')`, [U2, J2a, `backtest:${A1.id}:foreign`]); // other user, same prefix
  const liveBefore = await cnt(`user_id = $1 and platform_source is distinct from 'backtest'`, [U1]);
  // relink J1a -> J1? (U1 has J1a default + J1c inactive; create J1d active)
  await db.query(`insert into public.journals (id, user_id, name, is_default, is_active) values ('1d1d1d1d-0000-4000-8000-000000000008', $1, 'Fourth', false, true)`, [U1]);
  const J1d = '1d1d1d1d-0000-4000-8000-000000000008';
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J1d]);
  ok(await cnt(`left(import_hash, 46) = $1 and user_id = $2 and journal_id = $3`, [`backtest:${A1.id}:`, U1, J1a]) === 0, 'relink: mirrors in the old journal deleted');
  ok(await cnt(`import_hash = $1`, [`backtest:${A1x.id}:other-account`]) === 1, "relink: another account's mirror untouched");
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}X:1`]) === 1, 'relink: near-miss prefix (no colon) untouched');
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}:foreign`]) === 1, "relink: other user's row with the same prefix untouched");
  ok(await cnt(`user_id = $1 and platform_source is distinct from 'backtest'`, [U1]) === liveBefore, 'relink: live trades untouched');
  // unlink
  await mirror(U1, J1d, A1.id, 't3');
  await as(db, U1, `update public.backtest_accounts set journal_id = null where id = $1`, [A1.id]);
  ok(await cnt(`left(import_hash, 46) = $1 and user_id = $2`, [`backtest:${A1.id}:`, U1]) === 0, 'unlink: mirrors deleted');
  // first link (OLD NULL) and a non-journal update do nothing
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J1d]);
  await mirror(U1, J1d, A1.id, 't4');
  await as(db, U1, `update public.backtest_accounts set replay_time = replay_time + interval '1 minute', name = 'renamed' where id = $1`, [A1.id]);
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}:t4`]) === 1, 'non-journal update: mirror kept');
  // FK order simulation, journal deleted directly: (a) trades SET NULL first, then the account
  await db.exec('BEGIN');
  await db.query(`update public.trades set journal_id = null where journal_id = $1`, [J1d]);
  await db.query(`update public.backtest_accounts set journal_id = null where id = $1`, [A1.id]);
  await db.exec('COMMIT');
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}:t4`]) === 0, 'FK order trades-first: NULL-journal mirror deleted');
  // (b) direct DELETE of a non-default journal through RLS (real cascade)
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J1d]);
  await mirror(U1, J1d, A1.id, 't5');
  await as(db, U1, `delete from public.journals where id = $1`, [J1d]);
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}:t5`]) === 0, 'direct journal DELETE (cascade): mirror deleted');
  ok((await one(db, `select journal_id from public.backtest_accounts where id = $1`, [A1.id])).journal_id === null, 'direct journal DELETE: account detached');
  // account deletion
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1.id, J1a]);
  await mirror(U1, J1a, A1.id, 't6');
  await as(db, U1, `delete from public.backtest_accounts where id = $1`, [A1.id]);
  ok(await cnt(`import_hash = $1`, [`backtest:${A1.id}:t6`]) === 0, 'account DELETE: mirror deleted');
  ok((await one(db, `select count(*)::int as n from public.backtest_account_trades where backtest_account_id = $1`, [A1.id])).n === 0, 'account DELETE: its trades cascaded');
  // delete_journal + reset with 04 present
  const A1y = A1x.id;
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1y, J1a]);
  await mirror(U1, J1a, A1y, 't7');
  await db.query(`insert into public.journals (id, user_id, name, is_default, is_active) values ('1e1e1e1e-0000-4000-8000-000000000009', $1, 'Fifth', false, true)`, [U1]);
  const r = (await as(db, U1, `select public.delete_journal($1) as r`, [J1a])).rows[0].r;
  ok(r.deleted_id === J1a, 'delete_journal with 04: delete branch OK');
  ok(await cnt(`import_hash = $1`, [`backtest:${A1y}:t7`]) === 0, 'delete_journal with 04: mirror gone');
  // auth user deletion by a role without privileges on public.*
  const A4 = (await insAcc(U4, { journal_id: J4a, name: 'u4' })).rows[0].id;
  await as(db, U4, `insert into public.backtest_account_trades (user_id, backtest_account_id, symbol, direction, lot, entry_price, entry_time) values ($1, $2, 'EURUSD', 'LONG', 1, 1.1, '2024-01-02T00:01:00Z')`, [U4, A4]);
  await mirror(U4, J4a, A4, 't8');
  await db.exec('SET ROLE supabase_auth_admin');
  try { await db.query(`delete from auth.users where id = $1`, [U4]); ok(true, 'auth user deletion as supabase_auth_admin succeeds (cascades + cleanup trigger)'); }
  catch (e) { ok(false, 'auth user deletion failed: ' + e.message); }
  await db.exec('RESET ROLE');
  ok((await one(db, `select ((select count(*) from public.backtest_accounts where user_id = $1) + (select count(*) from public.backtest_account_trades where user_id = $1) + (select count(*) from public.trades where user_id = $1))::int as n`, [U4])).n === 0, 'auth deletion: nothing of U4 left');
  // an ADMIN deletes another user's non-default journal (journals_delete_own allows is_admin): the cascade
  // SET NULL runs the BEFORE UPDATE trigger with auth.uid() = admin and must not fail
  const J1f = '1f1f1f1f-0000-4000-8000-00000000000a';
  await db.query(`insert into public.journals (id, user_id, name, is_default, is_active) values ($2, $1, 'Sixth', false, true)`, [U1, J1f]);
  await as(db, U1, `update public.backtest_accounts set journal_id = $2 where id = $1`, [A1y, J1f]);
  await mirror(U1, J1f, A1y, 't9');
  await as(db, ADM, `delete from public.journals where id = $1`, [J1f], { admin: true });
  ok(await cnt(`import_hash = $1`, [`backtest:${A1y}:t9`]) === 0, 'admin deletes a user journal: cascade passes the owner guard, mirror cleaned');
  ok((await one(db, `select journal_id from public.backtest_accounts where id = $1`, [A1y])).journal_id === null, 'admin journal delete: account detached');
  // reset_user_data with 04 present
  await as(db, U2, `update public.backtest_accounts set journal_id = $2 where id = $1`, [p10[0], J2a]);
  await as(db, U2, `select public.reset_user_data()`);
  ok((await one(db, `select count(*)::int as n from public.backtest_accounts where user_id = $1`, [U2])).n === 0, 'reset_user_data with 04: accounts deleted');
}

log('\n[M5] 05: apply twice + stats');
{
  // fresh mirrors for U1 in J1e (U1's journals now: J1e active, J1c inactive)
  const J1e = '1e1e1e1e-0000-4000-8000-000000000009';
  await db.query(`update public.journals set is_default = true where id = $1`, [J1e]);
  const A5 = (await insAcc(U1, { journal_id: J1e, name: 'u1-again' })).rows[0].id;
  await mirror(U1, J1e, A5, 'm1');
  await db.query(`insert into public.trades (user_id, journal_id, symbol, direction, lot, pnl, trade_date) values ($1, $2, 'EURUSD', 'LONG', 1, -20, '2026-10-10'), ($1, $2, 'EURUSD', 'LONG', 1, 30, '2026-10-11')`, [U1, J1e]);
  const before = (await as(db, U1, `select trade_count, total_pnl, win_rate, last_trade_date from public.list_journals() where id = $1`, [J1e])).rows[0];
  ok(Number(before.trade_count) === 3, `before 05: list_journals counts the mirror (${before.trade_count})`);
  const statsBefore = (await one(db, `select public.get_platform_stats() as s`)).s;
  await runFile(db, MIG.m05);
  await runFile(db, MIG.m05);
  ok(await fnMd5(db, 'public.list_journals()') === MD5['list_journals.v05'], 'list_journals = v05');
  ok(await fnMd5(db, 'public.get_platform_stats()') === MD5['get_platform_stats.v05'], 'get_platform_stats = v05');
  const after = (await as(db, U1, `select trade_count, total_pnl, win_rate, last_trade_date from public.list_journals() where id = $1`, [J1e])).rows[0];
  ok(Number(after.trade_count) === 2 && Number(after.total_pnl) === 10 && Number(after.win_rate) === 50, `after 05: live-only stats ${JSON.stringify(after)}`);
  const lj = await one(db, `select l.lanname, p.prosecdef, p.provolatile, p.proconfig::text as cfg, pg_get_function_result(p.oid) as res from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.list_journals()'::regprocedure`);
  const blj = baseline.functions.find((r) => r.fn === 'list_journals()');
  ok(lj.prosecdef && lj.lanname === blj.lanname && lj.provolatile === blj.provolatile && lj.cfg === blj.cfg && lj.res === blj.res, `list_journals attributes and signature kept ${lj.cfg}`);
  const gs = await one(db, `select p.prosecdef, p.provolatile, p.proconfig::text as cfg from pg_proc p where p.oid = 'public.get_platform_stats()'::regprocedure`);
  const bgs = baseline.functions.find((r) => r.fn === 'get_platform_stats()');
  ok(gs.prosecdef && gs.provolatile === 's' && gs.cfg === bgs.cfg, 'get_platform_stats attributes kept (STABLE SECURITY DEFINER)');
  const stats = (await one(db, `select public.get_platform_stats() as s`)).s;
  const live = await cnt(`platform_source is distinct from 'backtest'`);
  ok(stats.totalTrades === live && statsBefore.totalTrades > live, `get_platform_stats totalTrades excludes backtest (${statsBefore.totalTrades} -> ${stats.totalTrades})`);
  ok(stats.todayTrades === await cnt(`created_at >= current_date and platform_source is distinct from 'backtest'`), 'todayTrades excludes backtest');
  const anonStats = (await as(db, null, `select public.get_platform_stats() as s`, [], { role: 'anon' })).rows[0].s;
  ok(anonStats.totalTrades === live, 'anon can still call get_platform_stats (landing page)');
  await expectErr(() => as(db, null, `select * from public.list_journals()`, [], { role: 'anon' }), /permission denied/, 'anon: list_journals not executable');
}

log('\n[M6] 06: apply twice');
await runFile(db, MIG.m06);
await runFile(db, MIG.m06);
ok((await one(db, `select count(*)::int as n from pg_proc where proname in ('evaluate_prop_firm_rules','sync_journal_trades','get_journals_equity_data','get_strategy_performance','get_today_trades_count','get_total_trades_count')`)).n === 0, 'six functions dropped');

log('\n[R] rollback order guards');
await expectErr(() => runFile(db, MIG.d01), /ORDER: migration 202610180002 is still applied/, '01.down refuses while 02 is applied');
await expectErr(() => runFile(db, MIG.d02), /ORDER: migration 202610180004 is still applied/, '02.down refuses while 04 is applied');
await expectErr(() => runFile(db, MIG.m01), /ALREADY SUPERSEDED/, '01 refuses a re-run after 02');

log('\n[R6] 06.down twice');
await runFile(db, MIG.d06);
await runFile(db, MIG.d06);
{
  const s = await snap(db);
  const six = (r) => /^(evaluate_prop_firm_rules|sync_journal_trades|get_journals_equity_data|get_strategy_performance|get_today_trades_count|get_total_trades_count)\(/.test(r.fn);
  // evaluate_prop_firm_rules comes back SECURE (00 body, no anon); the other five identical to the mock live
  const isEv = (r) => r.fn === 'evaluate_prop_firm_rules(uuid)';
  const b = baseline.functions.filter(six).filter((r) => !isEv(r)).map((r) => JSON.stringify(r)).sort();
  const a = s.functions.filter(six).filter((r) => !isEv(r)).map((r) => JSON.stringify(r)).sort();
  ok(JSON.stringify(a) === JSON.stringify(b), 'five functions: body/lang/secdef/volatility/config/result/owner identical to the mock live');
  const ba = baseline.acls.filter(six).filter((r) => !isEv(r)).map((r) => JSON.stringify(r)).sort();
  const aa = s.acls.filter(six).filter((r) => !isEv(r)).map((r) => JSON.stringify(r)).sort();
  ok(JSON.stringify(aa) === JSON.stringify(ba), `five functions: EXECUTE ACL identical to the mock live ${aa[0]}`);
  const ev = s.functions.find(isEv);
  const evBase = baseline.functions.find(isEv);
  ok(ev.body === MD5['evaluate_prop_firm_rules.s0'] && JSON.stringify({ ...ev, body: 0 }) === JSON.stringify({ ...evBase, body: 0 }), 'evaluate_prop_firm_rules: 00 body, attributes identical to the mock live');
  ok(s.acls.find(isEv).execs === '{authenticated,postgres,service_role}', 'evaluate_prop_firm_rules: no PUBLIC/anon after 06.down');
}

log('\n[R5] 05.down twice');
await runFile(db, MIG.d05);
await runFile(db, MIG.d05);
ok(await fnMd5(db, 'public.list_journals()') === MD5['list_journals.live'], 'list_journals = live body');
ok(await fnMd5(db, 'public.get_platform_stats()') === MD5['get_platform_stats.live'], 'get_platform_stats = live body');
ok((await execs(db, 'public.get_platform_stats()')) === (baseline.acls.find((r) => r.fn === 'get_platform_stats()')?.execs), 'get_platform_stats ACL identical to live');

log('\n[R4] 04.down twice');
await runFile(db, MIG.d04);
await runFile(db, MIG.d04);
ok((await one(db, `select to_regprocedure('public.backtest_accounts_cleanup_trades()') is null as e`)).e, 'cleanup function gone');
ok((await one(db, `select count(*)::int as n from pg_trigger where tgname like 'trg_backtest_accounts_cleanup_%'`)).n === 0, 'cleanup triggers gone');

log('\n[R2] 02.down: data-loss guard, then confirmed, twice');
await expectErr(() => runFile(db, MIG.d02), /DATA LOSS: \d+ backtest account\(s\) and \d+ backtest trade\(s\)/, '02.down refuses to drop tables with rows');
ok((await one(db, `select to_regclass('public.backtest_accounts') is not null as e`)).e, 'tables still there');
const d02c = MIG.d02.replace("-- SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';", "SET LOCAL wawe.confirm_backtest_v2_data_loss = 'yes';");
ok(d02c !== MIG.d02, 'confirmation line found');
await runFile(db, d02c);
await runFile(db, MIG.d02); // second run: tables gone, nothing to confirm
{
  const s = await snap(db);
  const d = diffSnap(after01, s, {
    acls: (r) => r.fn === 'delete_journal(uuid)' || r.fn === 'list_journals()',
  });
  ok(d.length === 0, `catalog after 02.down == after 01 (ACL hardening of delete_journal/list_journals ignored)${d.length ? '\n      ' + d.join('\n      ') : ''}`);
  ok(await fnMd5(db, 'public.touch_updated_at()') !== null, 'touch_updated_at kept');
}

log('\n[R1] 01.down twice');
await runFile(db, MIG.d01);
await runFile(db, MIG.d01);

log('\n[R0] 00.down twice (last)');
await runFile(db, MIG.d00);
await runFile(db, MIG.d00);
{
  const s = await snap(db);
  const d = diffSnap(baseline, s, {
    acls: (r) => r.fn === 'delete_journal(uuid)' || r.fn === 'list_journals()',
  });
  ok(d.length === 0, `catalog after all rollbacks == mock live baseline (tables, columns, constraints, indexes, policies, triggers, function bodies/attributes, table grants)${d.length ? '\n      ' + d.join('\n      ') : ''}`);
  const aclDiff = diffSnap({ acls: baseline.acls }, { acls: s.acls });
  log('  info expected ACL differences (hardening kept by the rollbacks):\n      ' + aclDiff.join('\n      '));
  // the legacy table works as before (RLS role public)
  await as(db, U1, `insert into public.backtest_trades (user_id, symbol, side, entry_price, exit_price, entry_time, exit_time, pnl_pct, exit_reason) values ($1, 'BTCUSDT', 'long', 1, 2, now(), now(), 1, 'TP')`, [U1]);
  ok((await as(db, U2, `select count(*)::int as n from public.backtest_trades`)).rows[0].n === 0, 'restored backtest_trades RLS: U2 cannot see U1 rows');
}
await db.close();

log(`\nRESULT: ${pass} passed, ${fail} failed`);
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'harness-output.txt'), out.join('\n') + '\n', 'utf8');
process.exit(fail ? 1 : 0);
