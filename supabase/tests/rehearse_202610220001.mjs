// Local rehearsal of migration 202610220001 (journals.trade_scope) and its rollback in an in-memory PostgreSQL (PGlite, WASM).
// Never touches a real database. Usage (repo root):
//   mkdir pg && cd pg && npm init -y && npm i @electric-sql/pglite@0.2.17     (once, outside the repo)
//   PGLITE_DIR=<that folder> node supabase/tests/rehearse_202610220001.mjs
// Steps: stub schema -> the live functions of 2026-10-22 (taken from the rollback file) -> migration -> scope behaviour ->
// rollback refused while a journal is not 'live' -> rollback with the loss accepted -> functions byte-identical to before ->
// migration again (the cycle can repeat).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.PGLITE_DIR || '.', 'x.js'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const UP = fs.readFileSync('supabase/migrations/202610220001_journal_trade_scope.sql', 'utf8');
const DOWN = fs.readFileSync('supabase/rollbacks/202610220001_journal_trade_scope.down.sql', 'utf8');

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); if (!cond) fails++; }

const db = new PGlite();
const U1 = '11111111-1111-4111-8111-111111111111';
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, plan text, plan_expires_at timestamptz, max_journals int);
  CREATE TABLE public.journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text, description text, color text, icon text,
    is_default boolean DEFAULT false, is_active boolean DEFAULT true, created_at timestamptz DEFAULT now(), platform text, is_connected boolean,
    connection_status text, last_synced_at timestamptz, is_prop_firm boolean, prop_firm_rules jsonb, prop_firm_status text, prop_firm_stats jsonb);
  CREATE TABLE public.trades (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid, pnl numeric, trade_date timestamptz, created_at timestamptz DEFAULT now(), platform_source text);
  CREATE TABLE public.strategies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journal_id uuid);
  INSERT INTO public.user_profiles VALUES ('${U1}', 'premium', NULL, 10);
`);
// the live definitions before the migration = what the rollback restores
const a = DOWN.indexOf('CREATE OR REPLACE FUNCTION public.create_journal('), b = DOWN.indexOf('ALTER TABLE public.journals DROP CONSTRAINT');
await db.exec(DOWN.slice(a, b));
const FN = `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig, md5(pg_get_functiondef(p.oid)) AS h
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('create_journal', 'update_journal', 'list_journals', 'get_journals_equity_data') ORDER BY 1`;
const before = (await db.query(FN)).rows;
ok('pre-migration: the four live functions exist', before.length === 4, before.map((r) => r.sig).join(', '));

async function asUser(sql, params) { await db.exec(`SET test.uid = '${U1}'`); return db.query(sql, params); }
await asUser(`SELECT public.create_journal('Old A', NULL, NULL, NULL)`);
await db.exec(`INSERT INTO public.trades (journal_id, pnl, trade_date, platform_source) SELECT id, 10, now(), NULL FROM public.journals;
  INSERT INTO public.trades (journal_id, pnl, trade_date, platform_source) SELECT id, -4, now(), 'backtest' FROM public.journals;`);

// migration
await db.exec(UP);
const col = (await db.query(`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'trade_scope'`)).rows[0];
ok('migration: trade_scope column, default live, not null', col && /live/.test(col.column_default) && col.is_nullable === 'NO');
ok('migration: existing journal is live', (await db.query(`SELECT trade_scope FROM public.journals`)).rows.every((r) => r.trade_scope === 'live'));
let lj = (await asUser(`SELECT name, trade_count, total_pnl, trade_scope FROM public.list_journals()`)).rows;
ok('list_journals: live journal counts live trades only', lj.length === 1 && Number(lj[0].trade_count) === 1 && Number(lj[0].total_pnl) === 10, JSON.stringify(lj));
await asUser(`SELECT public.create_journal('BT', NULL, NULL, NULL, 'backtest')`);
await db.exec(`INSERT INTO public.trades (journal_id, pnl, trade_date, platform_source) SELECT id, -4, now(), 'backtest' FROM public.journals WHERE name = 'BT'`);
lj = (await asUser(`SELECT name, trade_count, trade_scope FROM public.list_journals() ORDER BY name`)).rows;
ok('create_journal with scope backtest; list counts its backtest trade', lj.find((r) => r.name === 'BT').trade_scope === 'backtest' && Number(lj.find((r) => r.name === 'BT').trade_count) === 1);
let bad = null; try { await asUser(`SELECT public.create_journal('X', NULL, NULL, NULL, 'nope')`); } catch (e) { bad = e.message; }
ok('create_journal rejects an unknown scope', /INVALID_TRADE_SCOPE/.test(bad || ''), bad);
const id = (await db.query(`SELECT id FROM public.journals WHERE name = 'Old A'`)).rows[0].id;
await asUser(`SELECT public.update_journal($1, 'Old A', NULL, NULL, NULL)`, [id]);
ok('update_journal with 5 arguments keeps the scope', (await db.query(`SELECT trade_scope FROM public.journals WHERE id = $1`, [id])).rows[0].trade_scope === 'live');
await asUser(`SELECT public.update_journal($1, 'Old A', NULL, NULL, NULL, 'all')`, [id]);
ok('update_journal sets all', (await db.query(`SELECT trade_scope FROM public.journals WHERE id = $1`, [id])).rows[0].trade_scope === 'all');
let again = null; try { await db.exec(UP); } catch (e) { again = e.message; await db.exec('ROLLBACK').catch(() => {}); }
ok('migration refuses to run twice', /already exists/.test(again || ''), again);

// rollback: refused while a journal is not live
let refused = null; try { await db.exec(DOWN); } catch (e) { refused = e.message; await db.exec('ROLLBACK').catch(() => {}); }
ok('rollback refuses while journals use a non-live scope (data loss guard)', /DATA LOSS: 2 journal/.test(refused || ''), refused);
ok('refused rollback changed nothing', !!(await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'trade_scope'`)).rows.length);
await db.exec(`SET wawe.allow_scope_loss = 'on'`);
await db.exec(DOWN);
await db.exec(`RESET wawe.allow_scope_loss`);
const after = (await db.query(FN)).rows;
ok('rollback: trade_scope dropped', !(await db.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'trade_scope'`)).rows.length);
ok('rollback: functions byte-identical to the pre-migration ones', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after.map((r) => r.sig)));
lj = (await asUser(`SELECT name, trade_count FROM public.list_journals() ORDER BY name`)).rows;
ok('rollback: list_journals is the old one (live trades only, no scope column)', lj.length === 2 && Number(lj.find((r) => r.name === 'Old A').trade_count) === 1 && Number(lj.find((r) => r.name === 'BT').trade_count) === 0 && !('trade_scope' in lj[0]), JSON.stringify(lj));
let nr = null; try { await db.exec(DOWN); } catch (e) { nr = e.message; await db.exec('ROLLBACK').catch(() => {}); }
ok('rollback refuses when the migration is not applied', /ORDER/.test(nr || ''), nr);

// and forward again
await db.exec(UP);
ok('migration applies again after the rollback', (await db.query(`SELECT count(*)::int AS n FROM public.journals WHERE trade_scope = 'live'`)).rows[0].n === 2);
console.log(fails ? `\nREHEARSAL: ${fails} failure(s)` : '\nREHEARSAL: all checks passed');
process.exit(fails ? 1 : 0);
