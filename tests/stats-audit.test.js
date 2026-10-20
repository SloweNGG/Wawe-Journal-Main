// Faz D: every place that READS public.trades for statistics or lists is live-only by default.
// Static audit (the plan's audit greps as tests) + behaviour of the scope helper against a database that has
// NO backtest rows: the patched readers must return exactly what the unfiltered readers returned before.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { FakeDb } from './helpers/fake-supabase.js';

const ROOTS = ['public', 'src'];
const SKIP = (f) => f.endsWith('public/src/bundle.js') || f.includes('/node_modules/');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|astro|tsx)$/.test(e.name) && !SKIP(p)) out.push(p);
  }
  return out;
}
const FILES = ROOTS.flatMap((r) => walk(r));
// readers that are NOT statistics: the scope helper itself, the sync library (mirror bookkeeping, always filters
// platform_source = 'backtest' explicitly) and nothing else
const READER_ALLOW = new Set(['public/interface/shared/trades-source.js', 'public/interface/backtest/js/bt-sync.js']);

describe('stats audit (static)', () => {
  it('no .neq(platform_source) anywhere (it would drop NULL rows: 13 of 114 live rows)', () => {
    for (const f of FILES) {
      if (f.endsWith('interface/shared/trades-source.js')) continue;   // documents the pitfall in a comment
      assert.ok(!/neq\(\s*['"]platform_source['"]/.test(fs.readFileSync(f, 'utf8')), f);
    }
  });

  it('every read of public.trades goes through the live scope', () => {
    const readers = [];
    for (const f of FILES) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /from\(\s*['"]trades['"]\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const stmt = src.slice(Math.max(0, m.index - 160), Math.min(src.length, m.index + 900));
        const after = src.slice(m.index, m.index + 900).split(/;\s*\n/)[0];
        const isWrite = /\.(insert|update|delete|upsert)\(/.test(after);
        const isRead = /\.select\(/.test(after) && !isWrite;
        if (isRead && !READER_ALLOW.has(f.replace(/\\/g, '/'))) {
          readers.push({ f, line: src.slice(0, m.index).split('\n').length, ok: /applyScope\(|fetchAll\(|liveQuery\(|LIVE_OR|\.or\(\s*['"]platform_source/.test(stmt) });
        }
        if (isWrite && /\.delete\(/.test(after) && /public\/interface\/trades\/js\/trades\.js/.test(f.replace(/\\/g, '/'))) {
          assert.ok(/applyScope\(/.test(stmt), `${f}: trades page deletes must be scoped to live rows`);
        }
      }
    }
    assert.ok(readers.length >= 8, `found ${readers.length} readers`);
    const bad = readers.filter((r) => !r.ok);
    assert.deepEqual(bad, [], 'unfiltered readers: ' + JSON.stringify(bad));
  });

  it('every reader module that loads trades into stats uses WwTrades.fetchAll or filterScope', () => {
    const must = ['public/interface/dashboard/js/dashboard.js', 'public/interface/premium-dashboard/js/premium-dashboard.js',
      'public/interface/calendar/js/calendar.js', 'public/interface/strategies/js/strategies.js', 'public/interface/trades/js/trades.js'];
    for (const f of must) {
      const src = fs.readFileSync(f, 'utf8');
      assert.ok(/WwTrades|WT\./.test(src) && /fetchAll\(/.test(src), `${f} fetches through WwTrades.fetchAll`);
      assert.ok(/filterScope\(/.test(src), `${f} filters cached lists with filterScope`);
    }
  });

  it('the shared scripts are loaded before any page script, and in the bundle for stale cached HTML', () => {
    const head = fs.readFileSync('src/components/BaseHead.astro', 'utf8');
    assert.ok(head.indexOf('trades-source.js') > head.indexOf('trade-metrics.js'), 'trades-source.js loads right after trade-metrics.js');
    assert.ok(/import ['"]\.\.\/interface\/shared\/trades-source\.js['"]/.test(fs.readFileSync('public/src/script.js', 'utf8')), 'script.js side-effect import');
    assert.ok(fs.readFileSync('public/src/bundle.js', 'utf8').includes('WwTrades'), 'bundle.js contains WwTrades (rebuild with npm run build)');
  });

  it('page scripts that changed are syntactically valid', () => {
    for (const f of ['public/interface/dashboard/js/dashboard.js', 'public/interface/premium-dashboard/js/premium-dashboard.js', 'public/interface/calendar/js/calendar.js',
      'public/interface/strategies/js/strategies.js', 'public/interface/trades/js/trades.js', 'public/interface/backtest/js/backtest.js', 'public/components/navbar/navbar.js',
      'public/interface/dashboard/js/onboarding.js', 'public/interface/quick-add/js/quick-add.js', 'public/cache.js']) {
      const src = fs.readFileSync(f, 'utf8');
      if (/^\s*(import|export)\s/m.test(src)) {                       // ES module (premium dashboard): node --check on a .mjs copy
        const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wj-syntax-')), 'm.mjs');
        fs.writeFileSync(tmp, src);
        const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
        assert.equal(r.status, 0, f + ' ' + r.stderr);
      } else {
        assert.doesNotThrow(() => new vm.Script('(function(){' + src + '\n})', { filename: f }), f);   // wrapped: some page scripts end early with a top-level return
      }
    }
  });
});

// ---------------------------------------------------------------- behaviour with NO backtest rows
const sourceCode = fs.readFileSync('public/interface/shared/trades-source.js', 'utf8');
function loadWwTrades() {
  const win = { Promise, Array, Object, Number, String, JSON, Math, Date, console };
  win.window = win;
  vm.runInNewContext(sourceCode, win);
  return win.WwTrades;
}
const U = 'aaaaaaaa-0000-4000-8000-000000000001', J = 'bbbbbbbb-0000-4000-8000-000000000001';
function liveDb(n, extra = {}) {
  const db = new FakeDb({ userId: U, journals: [{ id: J, user_id: U, is_default: true }] });
  const sources = [null, undefined, '', 'ctrader', 'csv', 'manual'];
  for (let i = 0; i < n; i++) {
    db.tables.trades.push({ id: 'id' + String(i).padStart(6, '0'), user_id: U, journal_id: J, symbol: 'EURUSD', pnl: (i % 7) - 3, trade_date: '2026-01-' + String((i % 28) + 1).padStart(2, '0') + 'T10:00:00Z',
      platform_source: sources[i % sources.length], ...extra });
  }
  return db;
}
const asc = (b) => b.order('trade_date', { ascending: false });

describe('stats parity: a database without backtest rows', () => {
  it('fetchAll(live) returns exactly the rows an unfiltered query returned before (2,500 rows, paging, NULL/empty/ctrader sources kept)', async () => {
    const W = loadWwTrades(), db = liveDb(2500);
    const scoped = await W.fetchAll({ columns: 'id,pnl,trade_date', userId: U, journalId: J, scope: 'live', client: db.client });
    assert.equal(scoped.error, null);
    // the pre-change reader: the same chain without any source filter
    const old = [];
    for (let from = 0; ; from += 1000) {
      const r = await asc(db.client.from('trades').select('id,pnl,trade_date').eq('user_id', U).eq('journal_id', J)).order('id', { ascending: true }).range(from, from + 999);
      old.push(...r.data); if (r.data.length < 1000) break;
    }
    assert.equal(scoped.data.length, 2500);
    assert.deepEqual(Array.from(scoped.data, (r) => r.id), old.map((r) => r.id));
    assert.deepEqual(Array.from(scoped.data, (r) => r.pnl), old.map((r) => r.pnl));
  });
  it('scope "all" and "live" are identical when there are no backtest rows; "backtest" is empty', async () => {
    const W = loadWwTrades(), db = liveDb(300);
    const q = (scope) => W.fetchAll({ columns: 'id', userId: U, journalId: J, scope, client: db.client }).then((r) => Array.from(r.data, (x) => x.id));
    assert.deepEqual(await q('live'), await q('all'));
    assert.equal((await q('backtest')).length, 0);
  });
  it('filterScope(list, "live") keeps every row and the order of a live-only list; the cached list is not mutated', () => {
    const W = loadWwTrades(), rows = liveDb(60).tables.trades;
    const out = W.filterScope(rows, 'live');
    assert.equal(out.length, 60); out.forEach((r, i) => assert.equal(r, rows[i]));
    assert.notEqual(out, rows);
  });
  it('count(live) equals the unfiltered HEAD count', async () => {
    const W = loadWwTrades(), db = liveDb(137);
    const a = await W.count({ userId: U, journalId: J, scope: 'live', client: db.client });
    const b = await db.client.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', U).eq('journal_id', J);
    assert.equal(a.count, 137); assert.equal(a.count, b.count);
  });
  it('and with backtest rows present the live scope drops exactly those rows, every other source stays', async () => {
    const W = loadWwTrades(), db = liveDb(120);
    for (let i = 0; i < 25; i++) db.tables.trades.push({ id: 'bt' + i, user_id: U, journal_id: J, pnl: -9000, platform_source: 'backtest', trade_date: '2026-02-01T00:00:00Z' });
    const live = await W.fetchAll({ columns: 'id,pnl', userId: U, journalId: J, scope: 'live', client: db.client });
    assert.equal(live.data.length, 120); assert.ok(live.data.every((r) => r.pnl !== -9000));
    const bt = await W.fetchAll({ columns: 'id', userId: U, journalId: J, scope: 'backtest', client: db.client });
    assert.equal(bt.data.length, 25);
  });
});
