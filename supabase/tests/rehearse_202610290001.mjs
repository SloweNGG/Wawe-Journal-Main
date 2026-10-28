// Local rehearsal of migration 202610290001 (backtest_account_trades.exit_rule) and its rollback in an in-memory PostgreSQL
// (PGlite, WASM). Never touches a real database. Usage (repo root):
//   mkdir pg && cd pg && npm init -y && npm i @electric-sql/pglite@0.2.17     (once, outside the repo)
//   PGLITE_DIR=<that folder> node supabase/tests/rehearse_202610290001.mjs
// Steps: stub table (the columns the migration reads, the "closed trade is final" rule of check_backtest_trade) -> preconditions
// -> migration -> CHECK behaviour -> second run refused -> rollback -> rollback again refused -> migration again.
// The full behaviour on the real schema (RLS, triggers) is in supabase/tests/backtest_exit_rule_verify.sql.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.env.PGLITE_DIR || '.', 'x.js'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const UP = fs.readFileSync('supabase/migrations/202610290001_backtest_exit_rule.sql', 'utf8');
const DOWN = fs.readFileSync('supabase/rollbacks/202610290001_backtest_exit_rule.down.sql', 'utf8');

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); if (!cond) fails++; }
// a failed file leaves its transaction open (psql would end the session): roll it back like a new session would start clean
async function err(db, sql) {
  try { await db.exec(sql); return null; } catch (e) { try { await db.exec('ROLLBACK'); } catch (x) { /* not in a transaction */ } return String(e.message || e); }
}
async function hasCol(db) {
  const r = await db.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'backtest_account_trades' AND column_name = 'exit_rule'`);
  return r.rows.length === 1;
}

const db = new PGlite();
ok('migration refuses without the table', /PRECONDITION: public.backtest_account_trades is missing/.test(await err(db, UP) || ''));
await db.exec(`
  CREATE TABLE public.backtest_account_trades (id int PRIMARY KEY, exit_reason text, exit_time timestamptz);
`);
ok('migration refuses without exit_ambiguous', /PRECONDITION: backtest_account_trades.exit_ambiguous is missing/.test(await err(db, UP) || ''));
await db.exec(`
  ALTER TABLE public.backtest_account_trades ADD COLUMN exit_ambiguous boolean NOT NULL DEFAULT false;
  CREATE FUNCTION public.check_backtest_trade() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.exit_time IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'BACKTEST_TRADE_CLOSED'; END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER trg_check_backtest_trade BEFORE INSERT OR UPDATE ON public.backtest_account_trades
    FOR EACH ROW EXECUTE FUNCTION public.check_backtest_trade();
  INSERT INTO public.backtest_account_trades VALUES (1, 'sl', now(), true), (2, NULL, NULL, false);
`);

ok('migration applies', (await err(db, UP)) === null);
ok('exit_rule exists', await hasCol(db));
const old = await db.query(`SELECT exit_rule FROM public.backtest_account_trades WHERE id = 1`);
ok('rows closed before the column keep NULL (no backfill)', old.rows[0].exit_rule === null);

await db.exec(`INSERT INTO public.backtest_account_trades VALUES (3, NULL, NULL, false), (4, NULL, NULL, false), (5, NULL, NULL, false)`);
ok('close with pessimistic', (await err(db, `UPDATE public.backtest_account_trades SET exit_reason = 'sl', exit_time = now(), exit_ambiguous = true, exit_rule = 'pessimistic' WHERE id = 3`)) === null);
ok('close with bar_path', (await err(db, `UPDATE public.backtest_account_trades SET exit_reason = 'tp', exit_time = now(), exit_ambiguous = true, exit_rule = 'bar_path' WHERE id = 4`)) === null);
ok('a rule without exit_ambiguous is refused', /chk_backtest_account_trades_exit_rule/.test(await err(db, `UPDATE public.backtest_account_trades SET exit_reason = 'sl', exit_time = now(), exit_rule = 'pessimistic' WHERE id = 5`) || ''));
ok('an unknown rule is refused', /chk_backtest_account_trades_exit_rule/.test(await err(db, `UPDATE public.backtest_account_trades SET exit_reason = 'sl', exit_time = now(), exit_ambiguous = true, exit_rule = 'optimistic' WHERE id = 5`) || ''));
ok('the rule of a closed trade is final', /BACKTEST_TRADE_CLOSED/.test(await err(db, `UPDATE public.backtest_account_trades SET exit_rule = 'bar_path' WHERE id = 3`) || ''));
ok('a second run is refused', /ORDER: backtest_account_trades.exit_rule already exists/.test(await err(db, UP) || ''));

ok('rollback applies', (await err(db, DOWN)) === null);
ok('exit_rule is gone', !(await hasCol(db)));
const con = await db.query(`SELECT 1 FROM pg_constraint WHERE conname = 'chk_backtest_account_trades_exit_rule'`);
ok('its CHECK is gone', con.rows.length === 0);
ok('rollback again is refused', /ORDER: migration 202610290001 is not applied/.test(await err(db, DOWN) || ''));
const n = await db.query(`SELECT count(*)::int AS n FROM public.backtest_account_trades`);
ok('no row was lost', n.rows[0].n === 5);
ok('migration applies again', (await err(db, UP)) === null && await hasCol(db));

await db.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
