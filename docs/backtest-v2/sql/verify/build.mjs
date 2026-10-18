// Generates the Backtest v2 migration + rollback SQL files from verify/src/*.sql templates.
//
// Every function that a migration REPLACES or RESTORES is rebuilt here from the LIVE snapshot
// (scratchpad/db/fn_<name>.sql, pg_get_functiondef output of 2026-10-18), normalised to LF, with
// each change applied as an exact, asserted string edit. The templates reference them as
//   {{FN:<name>.<version>}}   -> the full CREATE OR REPLACE FUNCTION statement (with ';')
//   {{MD5:<name>.<version>}}  -> md5 of the body with spaces/tabs/CR/LF removed, i.e. the value of
//                                md5(translate(prosrc, E' \t\r\n', '')) in Postgres (drift guards)
//
// Usage: node build.mjs <db snapshot dir> <template dir> <output root (…/plan/sql)>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [dbDir, srcDir, outRoot] = process.argv.slice(2);
if (!dbDir || !srcDir || !outRoot) throw new Error('usage: node build.mjs <dbDir> <srcDir> <outRoot>');

const MARK = '$function$';

function readLive(name) {
  const raw = fs.readFileSync(path.join(dbDir, `fn_${name}.sql`), 'utf8');
  const exotic = [0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
    0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
  if ([...raw].some((ch) => exotic.includes(ch.codePointAt(0)))) {
    throw new Error(`fn_${name}.sql contains non-ASCII whitespace; the md5 normalisation would differ from Postgres`);
  }
  const lf = raw.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (!lf.startsWith('CREATE OR REPLACE FUNCTION public.') || !lf.endsWith(MARK)) {
    throw new Error(`unexpected snapshot format: fn_${name}.sql`);
  }
  return { raw, lf };
}

// prosrc = the text between the opening and the closing $function$ (pg_get_functiondef prints it verbatim)
function prosrcOf(def) {
  const a = def.indexOf(MARK);
  const b = def.lastIndexOf(MARK);
  if (a < 0 || b <= a) throw new Error('no $function$ body');
  return def.slice(a + MARK.length, b);
}
const md5ws = (s) => crypto.createHash('md5').update(s.replace(/[ \t\r\n]/g, ''), 'utf8').digest('hex');

function replaceOnce(s, from, to, label) {
  const i = s.indexOf(from);
  if (i < 0) throw new Error(`edit "${label}": anchor not found`);
  if (s.indexOf(from, i + 1) >= 0) throw new Error(`edit "${label}": anchor not unique`);
  return s.slice(0, i) + to + s.slice(i + from.length);
}

const fns = {}; // key "<name>.<version>" -> definition text (LF, without trailing ';')
const rawMd5 = {}; // md5 computed on the RAW live snapshot (CRLF kept) - must equal the LF one

for (const name of [
  'reset_user_data', 'delete_journal', 'list_journals', 'get_platform_stats',
  'evaluate_prop_firm_rules', 'sync_journal_trades', 'get_journals_equity_data',
  'get_strategy_performance', 'get_today_trades_count', 'get_total_trades_count',
]) {
  const { raw, lf } = readLive(name);
  fns[`${name}.live`] = lf;
  rawMd5[name] = md5ws(prosrcOf(raw));
}

// ---- reset_user_data.v01 (migration 01): drop the guarded legacy backtest_trades block (live lines 15-20)
fns['reset_user_data.v01'] = replaceOnce(
  fns['reset_user_data.live'],
  `  -- 1. Trades & Backtest
  DELETE FROM public.trades WHERE user_id = v_uid;

  IF to_regclass('public.backtest_trades') IS NOT NULL THEN
    DELETE FROM public.backtest_trades WHERE user_id = v_uid;
  END IF;

`,
  `  -- 1. Trades
  DELETE FROM public.trades WHERE user_id = v_uid;

`,
  'reset_user_data.v01',
);

// ---- reset_user_data.v02 (migration 02): v01 + the two Backtest v2 tables, before the journals step
fns['reset_user_data.v02'] = replaceOnce(
  fns['reset_user_data.v01'],
  `  -- 1. Trades
  DELETE FROM public.trades WHERE user_id = v_uid;

`,
  `  -- 1. Trades (this also removes the journal mirrors of backtest trades, import_hash 'backtest:%')
  DELETE FROM public.trades WHERE user_id = v_uid;

  -- 1b. Backtest v2 (migration 202610180002): account trades, then the accounts themselves
  IF to_regclass('public.backtest_account_trades') IS NOT NULL THEN
    DELETE FROM public.backtest_account_trades WHERE user_id = v_uid;
  END IF;

  IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
    DELETE FROM public.backtest_accounts WHERE user_id = v_uid;
  END IF;

`,
  'reset_user_data.v02',
);

// ---- delete_journal.v02 (migration 02): detach linked backtest accounts before the branch (both branches)
fns['delete_journal.v02'] = replaceOnce(
  fns['delete_journal.live'],
  `    DELETE FROM public.strategies WHERE journal_id = p_journal_id;

`,
  `    DELETE FROM public.strategies WHERE journal_id = p_journal_id;

    -- Backtest v2 (migration 202610180002): detach the backtest accounts linked to this journal, in BOTH
    -- branches. The "last journal" branch below only resets the journal row, so the FK
    -- backtest_accounts.journal_id ON DELETE SET NULL would never fire there. The journal mirrors of their
    -- trades were already removed by the trades DELETE above.
    IF to_regclass('public.backtest_accounts') IS NOT NULL THEN
        UPDATE public.backtest_accounts
           SET journal_id = NULL
         WHERE journal_id = p_journal_id
           AND user_id = v_user_id;
    END IF;

`,
  'delete_journal.v02',
);

// ---- list_journals.v05 (migration 05): live-only statistics (signature unchanged)
fns['list_journals.v05'] = replaceOnce(
  fns['list_journals.live'],
  `    FROM public.trades tr WHERE tr.journal_id = j.id
`,
  `    FROM public.trades tr WHERE tr.journal_id = j.id AND tr.platform_source IS DISTINCT FROM 'backtest'
`,
  'list_journals.v05',
);

// ---- get_platform_stats.v05 (migration 05): landing-page counters without backtest rows
fns['get_platform_stats.v05'] = replaceOnce(
  replaceOnce(
    fns['get_platform_stats.live'],
    `    'totalTrades',  (select count(*) from public.trades),
`,
    `    'totalTrades',  (select count(*) from public.trades where platform_source is distinct from 'backtest'),
`,
    'get_platform_stats.v05 total',
  ),
  `    'todayTrades',  (select count(*) from public.trades where created_at >= current_date)
`,
  `    'todayTrades',  (select count(*) from public.trades where created_at >= current_date and platform_source is distinct from 'backtest')
`,
  'get_platform_stats.v05 today',
);

const md5s = {};
for (const [k, def] of Object.entries(fns)) md5s[k] = md5ws(prosrcOf(def));
for (const [name, h] of Object.entries(rawMd5)) {
  if (md5s[`${name}.live`] !== h) throw new Error(`md5 of ${name}: CRLF and LF variants differ`);
}

// ---- render templates
const outputs = [
  ['01.sql', 'supabase/migrations/202610180001_drop_legacy_backtest_trades.sql'],
  ['01.down.sql', 'supabase/rollbacks/202610180001_drop_legacy_backtest_trades.down.sql'],
  ['02.sql', 'supabase/migrations/202610180002_backtest_accounts.sql'],
  ['02.down.sql', 'supabase/rollbacks/202610180002_backtest_accounts.down.sql'],
  ['04.sql', 'supabase/migrations/202610180004_backtest_journal_link_cleanup.sql'],
  ['04.down.sql', 'supabase/rollbacks/202610180004_backtest_journal_link_cleanup.down.sql'],
  ['05.sql', 'supabase/migrations/202610180005_exclude_backtest_from_stats.sql'],
  ['05.down.sql', 'supabase/rollbacks/202610180005_exclude_backtest_from_stats.down.sql'],
  ['06.sql', 'supabase/migrations/202610180006_drop_unused_trade_functions.sql'],
  ['06.down.sql', 'supabase/rollbacks/202610180006_drop_unused_trade_functions.down.sql'],
  ['verify.sql', 'supabase/tests/backtest_v2_verify.sql'],
];

for (const [src, dst] of outputs) {
  let t = fs.readFileSync(path.join(srcDir, src), 'utf8').replace(/\r\n/g, '\n');
  t = t.replace(/\{\{FN:([a-z_]+\.[a-z0-9]+)\}\}/g, (_, k) => {
    if (!fns[k]) throw new Error(`${src}: unknown function version ${k}`);
    return fns[k] + ';';
  });
  t = t.replace(/\{\{MD5:([a-z_]+\.[a-z0-9]+)\}\}/g, (_, k) => {
    if (!md5s[k]) throw new Error(`${src}: unknown md5 key ${k}`);
    return md5s[k];
  });
  if (/\{\{/.test(t)) throw new Error(`${src}: unresolved placeholder`);
  const out = path.join(outRoot, dst);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, t, 'utf8');
  console.log('wrote', dst);
}

// ---- bodies for review diffs + md5 table
const bodyDir = path.join(outRoot, 'verify', 'out', 'bodies');
fs.mkdirSync(bodyDir, { recursive: true });
for (const [k, def] of Object.entries(fns)) fs.writeFileSync(path.join(bodyDir, `${k}.sql`), def + ';\n', 'utf8');
fs.writeFileSync(path.join(outRoot, 'verify', 'out', 'md5.json'), JSON.stringify(md5s, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(md5s, null, 2));
