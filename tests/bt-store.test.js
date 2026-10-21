// Backtest v2, Phase A: LocalStore rules (same as the Migration 02 and 08 triggers/CHECKs) and the page gate
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBt, plain } from './helpers/bt-env.js';

const { Store, Gate } = loadBt(['store']);
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';

function memStorage() {
  const m = {};
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
const acc = (over = {}) => Object.assign({ name: 'Test', symbol: 'EURUSD', timeframe: '1h', starting_balance: '10000.00', spread_pips: '0.20',
  commission_per_lot: '7.00', replay_time: '2026-09-01T00:01:00.000Z' }, over);
const trade = (accountId, over = {}) => Object.assign({ id: 'aaaaaaaa-0000-4000-8000-000000000001', backtest_account_id: accountId, symbol: 'EURUSD',
  direction: 'LONG', lot: '0.10', entry_price: '1.08311', stop_loss: '1.08111', take_profit: '1.08711', entry_time: '2026-09-01T00:01:00.000Z',
  commission: '0.70', rr_ratio: '2.00' }, over);
const mk = (storage, over = {}) => Store.createLocalStore(Object.assign({ userId: U1, storage, limit: 10, now: () => Date.parse('2026-10-19T00:00:00Z') }, over));
const msg = (e) => String(e && e.message);

describe('gate (open to every signed-in user)', () => {
  it('decides from the user object', () => {
    assert.equal(Gate.decide(null), 'anon');
    assert.equal(Gate.decide({ id: 'demo-user-id', app_metadata: { role: 'admin' } }), 'demo');
    assert.equal(Gate.decide({ id: 'u', app_metadata: { role: 'admin' } }), 'member');
    assert.equal(Gate.decide({ id: 'u', app_metadata: { role: 'user' } }), 'member');
    assert.equal(Gate.decide({ id: 'u', app_metadata: {} }), 'member');
    assert.equal(Gate.decide({ id: 'u' }), 'member');
    assert.equal(Gate.isAdmin({ app_metadata: { role: 'Admin' } }), false, 'exact match only');
  });
});

describe('LocalStore: data source (Migration 08)', () => {
  it('defaults to synthetic; ctrader and other values are refused', async () => {
    const st = mk(memStorage());
    assert.equal((await st.createAccount(acc())).data_source, 'synthetic');
    assert.equal((await st.createAccount(acc({ data_source: 'synthetic' }))).data_source, 'synthetic');
    for (const v of ['ctrader', 'binance', '']) {
      if (v === '') continue;
      await assert.rejects(() => st.createAccount(acc({ data_source: v })), (e) => msg(e) === 'chk_backtest_accounts_data_source' && e.code === '23514');
    }
  });
  it('a synthetic account can never be linked to a journal', async () => {
    const st = mk(memStorage());
    await assert.rejects(() => st.createAccount(acc({ journal_id: 'jjjjjjjj-0000-4000-8000-000000000001' })), (e) => msg(e) === 'chk_backtest_accounts_journal_needs_ctrader');
    const a = await st.createAccount(acc());
    await assert.rejects(() => st.updateAccount(a.id, { journal_id: 'jjjjjjjj-0000-4000-8000-000000000001' }), (e) => msg(e) === 'chk_backtest_accounts_journal_needs_ctrader');
    assert.equal((await st.updateAccount(a.id, { journal_id: null, name: 'ok' })).name, 'ok');
  });
  it('data_source is immutable', async () => {
    const st = mk(memStorage());
    const a = await st.createAccount(acc());
    await assert.rejects(() => st.updateAccount(a.id, { data_source: 'ctrader' }), (e) => msg(e) === 'BACKTEST_ACCOUNT_IMMUTABLE:data_source');
    assert.equal((await st.updateAccount(a.id, { data_source: 'synthetic' })).data_source, 'synthetic');
  });
  it('the Supabase column list reads data_source', () => {
    assert.match(Store.createSupabaseStore({ sb: {}, userId: U1 }).ACC_COLS, /(^|,)data_source(,|$)/);
  });
});

describe('LocalStore: accounts', () => {
  it('creates, lists (active, newest first), updates, deletes with cascade', async () => {
    const st = mk(memStorage());
    const a = await st.createAccount(acc());
    assert.equal(a.user_id, U1); assert.equal(a.is_active, true); assert.ok(a.id);
    const b = await st.createAccount(acc({ name: 'Second' }));
    assert.equal((await st.listAccounts()).length, 2);
    await st.insertTrade(trade(a.id));
    const upd = await st.updateAccount(a.id, { name: 'Renamed' });
    assert.equal(upd.name, 'Renamed');
    await st.deleteAccount(a.id);
    assert.equal((await st.listAccounts()).length, 1); assert.deepEqual(plain(await st.listTrades(a.id)), []);
    assert.equal((await st.getAccount(b.id)).name, 'Second');
  });
  it('quota: BACKTEST_LIMIT_EXCEEDED:<n> on insert and on reactivation', async () => {
    const st = mk(memStorage(), { limit: 1 });
    const a = await st.createAccount(acc());
    await assert.rejects(() => st.createAccount(acc({ name: 'B' })), (e) => msg(e) === 'BACKTEST_LIMIT_EXCEEDED:1');
    await st.updateAccount(a.id, { is_active: false });
    const b = await st.createAccount(acc({ name: 'B' }));
    await assert.rejects(() => st.updateAccount(a.id, { is_active: true }), (e) => msg(e) === 'BACKTEST_LIMIT_EXCEEDED:1');
    assert.ok(b.id);
  });
  it('quota follows the plan limit function', async () => {
    let lim = 2; const st = mk(memStorage(), { limit: () => lim });
    await st.createAccount(acc()); await st.createAccount(acc({ name: 'B' }));
    await assert.rejects(() => st.createAccount(acc({ name: 'C' })), (e) => msg(e) === 'BACKTEST_LIMIT_EXCEEDED:2');
    lim = 3; await st.createAccount(acc({ name: 'C' }));
  });
  it('immutable columns: id, user_id, symbol', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    await assert.rejects(() => st.updateAccount(a.id, { symbol: 'GBPUSD' }), (e) => msg(e) === 'BACKTEST_ACCOUNT_IMMUTABLE:symbol');
    await assert.rejects(() => st.updateAccount(a.id, { user_id: U2 }), (e) => msg(e) === 'BACKTEST_ACCOUNT_IMMUTABLE:user_id');
    await assert.rejects(() => st.updateAccount(a.id, { id: 'x' }), (e) => msg(e) === 'BACKTEST_ACCOUNT_IMMUTABLE:id');
  });
  it('spread and commission are locked while a position is open', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    await st.insertTrade(trade(a.id));
    await assert.rejects(() => st.updateAccount(a.id, { spread_pips: '0.50' }), (e) => msg(e) === 'BACKTEST_OPEN_POSITIONS:spread_pips');
    await assert.rejects(() => st.updateAccount(a.id, { commission_per_lot: '9.00' }), (e) => msg(e) === 'BACKTEST_OPEN_POSITIONS:commission_per_lot');
    await st.updateAccount(a.id, { spread_pips: '0.2' });                       // same value, written differently: allowed
    await st.updateTrade(trade(a.id).id, { exit_price: '1.08400', exit_time: '2026-09-01T02:00:00.000Z', exit_reason: 'manual', pnl: '0.20', gross_pnl: '0.90' });
    await st.updateAccount(a.id, { spread_pips: '0.50' });                      // closed now: allowed
  });
  it('replay_time cannot go backwards once the account has trades (go-to-date rule)', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    await st.updateAccount(a.id, { replay_time: '2026-08-01T00:00:00.000Z' });  // no trades yet: free
    await st.insertTrade(trade(a.id));
    await st.updateAccount(a.id, { replay_time: '2026-09-02T00:00:00.000Z' });
    await assert.rejects(() => st.updateAccount(a.id, { replay_time: '2026-09-01T00:00:00.000Z' }), (e) => msg(e) === 'BACKTEST_REPLAY_BACKWARD');
    await st.deleteTrades(a.id);                                                // account reset
    await st.updateAccount(a.id, { replay_time: '2026-09-01T00:00:00.000Z' });
  });
  it('CHECK constraints', async () => {
    const st = mk(memStorage());
    const bad = [{ name: '   ' }, { name: 'x'.repeat(61) }, { symbol: 'eurusd' }, { timeframe: '2h' }, { starting_balance: '0' },
      { starting_balance: '100000000.01' }, { spread_pips: '-1' }, { commission_per_lot: '10001' }, { replay_time: 'nope' }];
    for (const b of bad) await assert.rejects(() => st.createAccount(acc(b)), (e) => e.code === '23514', JSON.stringify(b));
    await st.createAccount(acc({ name: 'ç'.repeat(60) }));
  });
  it('journal ownership hook', async () => {
    const st = mk(memStorage(), { journalOwned: (id) => id === 'j1' });
    await assert.rejects(() => st.createAccount(acc({ journal_id: 'j2' })), (e) => msg(e) === 'INVALID_JOURNAL');
    await assert.rejects(() => st.createAccount(acc({ journal_id: 'j1' })), (e) => msg(e) === 'chk_backtest_accounts_journal_needs_ctrader', 'an owned journal still cannot be linked to a synthetic account');
  });
});

describe('LocalStore: trades', () => {
  it('insert copies the initial levels; closed rows are final; entry columns are immutable', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    const t = await st.insertTrade(trade(a.id));
    assert.equal(t.initial_stop_loss, '1.08111'); assert.equal(t.initial_take_profit, '1.08711'); assert.equal(t.exit_time, null);
    const id = t.id;
    await st.updateTrade(id, { stop_loss: '1.08200', take_profit: null });          // modify while open
    await assert.rejects(() => st.updateTrade(id, { entry_price: '1.1' }), (e) => msg(e) === 'BACKTEST_TRADE_IMMUTABLE');
    await assert.rejects(() => st.updateTrade(id, { initial_stop_loss: '1.1' }), (e) => msg(e) === 'BACKTEST_TRADE_IMMUTABLE');
    await assert.rejects(() => st.updateTrade(id, { exit_price: '1.1' }), (e) => e.code === '23514', 'half-closed row violates the open/closed CHECK');
    const closed = await st.updateTrade(id, { exit_price: '1.08400', exit_time: '2026-09-01T02:00:00.000Z', exit_reason: 'tp', pnl: '8.30', gross_pnl: '9.00', exit_ambiguous: false }, { onlyOpen: true });
    assert.equal(closed.length, 1);
    await assert.rejects(() => st.updateTrade(id, { stop_loss: '1.0' }), (e) => msg(e) === 'BACKTEST_TRADE_CLOSED');
    assert.deepEqual(plain(await st.updateTrade(id, { stop_loss: '1.0' }, { onlyOpen: true })), [], 'onlyOpen: a position closed elsewhere matches nothing');
  });
  it('rejects wrong account, symbol mismatch, duplicate id, net != gross - commission', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    await assert.rejects(() => st.insertTrade(trade('nope')), (e) => msg(e) === 'INVALID_BACKTEST_ACCOUNT');
    await assert.rejects(() => st.insertTrade(trade(a.id, { symbol: 'GBPUSD' })), (e) => msg(e) === 'BACKTEST_SYMBOL_MISMATCH');
    await st.insertTrade(trade(a.id));
    await assert.rejects(() => st.insertTrade(trade(a.id)), (e) => e.code === '23505');
    await assert.rejects(() => st.insertTrade(trade(a.id, { id: 'bbbbbbbb-0000-4000-8000-000000000002', exit_price: '1.1', exit_time: '2026-09-01T03:00:00.000Z',
      exit_reason: 'tp', pnl: '5.00', gross_pnl: '5.00', commission: '0.70' })), (e) => e.code === '23514');
    await assert.rejects(() => st.insertTrade(trade(a.id, { id: 'cccccccc-0000-4000-8000-000000000003', exit_time: '2026-08-01T00:00:00.000Z', exit_price: '1.1', exit_reason: 'tp', pnl: '0.00', gross_pnl: '0.70' })), (e) => e.code === '23514', 'exit before entry');
  });
  it('lists trades in entry order', async () => {
    const st = mk(memStorage()); const a = await st.createAccount(acc());
    await st.insertTrade(trade(a.id, { id: 'bbbbbbbb-0000-4000-8000-000000000002', entry_time: '2026-09-02T00:00:00.000Z' }));
    await st.insertTrade(trade(a.id));
    assert.deepEqual((await st.listTrades(a.id)).map((t) => t.id.slice(0, 2)), ['aa', 'bb']);
  });
});

describe('LocalStore: storage', () => {
  it('persists and reloads; another user key is never read', async () => {
    const ls = memStorage();
    const st = mk(ls); const a = await st.createAccount(acc());
    assert.ok(ls.m['ww-bt:v1:' + U1]);
    const again = mk(ls); assert.equal((await again.listAccounts()).length, 1);
    const other = mk(ls, { userId: U2 }); assert.equal((await other.listAccounts()).length, 0);
    // a blob under U2's key that carries U1's rows is filtered by user_id
    ls.m['ww-bt:v1:' + U2] = ls.m['ww-bt:v1:' + U1];
    assert.equal((await mk(ls, { userId: U2 }).listAccounts()).length, 0);
    assert.ok(a.id);
  });
  it('corrupt blob starts empty and is replaced on the next write', async () => {
    const ls = memStorage(); ls.m['ww-bt:v1:' + U1] = '{not json';
    const st = mk(ls); assert.equal((await st.listAccounts()).length, 0);
    await st.createAccount(acc()); assert.equal(JSON.parse(ls.m['ww-bt:v1:' + U1]).accounts.length, 1);
  });
  it('unavailable or throwing localStorage: works in memory, persistent === false', async () => {
    const st = mk(null); assert.equal(st.persistent, false);
    await st.createAccount(acc()); assert.equal((await st.listAccounts()).length, 1);
    const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    const st2 = mk(boom); await st2.createAccount(acc()); assert.equal(st2.persistent, false); assert.equal((await st2.listAccounts()).length, 1);
  });
  it('clearAll', async () => {
    const st = mk(memStorage()); await st.createAccount(acc()); await st.clearAll();
    assert.equal((await st.listAccounts()).length, 0);
  });
});

// ---------------------------------------------------------------- SupabaseStore (Phase B backend, same interface)
import { FakeDb } from './helpers/fake-supabase.js';

describe('SupabaseStore', () => {
  const sbStore = (db) => Store.createSupabaseStore({ sb: db.client, userId: U1 });
  const fresh = () => new FakeDb({ userId: U1, journals: [] });
  const accRow = (over = {}) => Object.assign({ id: 'a0000000-0000-4000-8000-000000000001', name: 'T', symbol: 'EURUSD', timeframe: '1h', starting_balance: '10000.00',
    spread_pips: '0.20', commission_per_lot: '7.00', replay_time: '2026-09-01T00:01:00.000Z', is_active: true, journal_id: null,
    created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z' }, over);

  it('every query is scoped to the user (admins can read all rows through RLS)', async () => {
    const db = fresh(); const st = sbStore(db);
    db.tables.backtest_accounts.push(accRow(), accRow({ id: 'a0000000-0000-4000-8000-000000000002', user_id: U2 }));
    db.tables.backtest_accounts[0].user_id = U1; db.tables.backtest_accounts[1].user_id = U2;
    assert.equal((await st.listAccounts()).length, 1);
    assert.equal(await st.getAccount('a0000000-0000-4000-8000-000000000002'), null);
    await st.listTrades('a0000000-0000-4000-8000-000000000001');
    await st.updateAccount('a0000000-0000-4000-8000-000000000001', { name: 'N' });
    await st.deleteTrades('a0000000-0000-4000-8000-000000000001');
    await st.deleteAccount('a0000000-0000-4000-8000-000000000001');
    for (const c of db.client.calls) assert.ok(c.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id' && f[2] === U1), `${c.table} ${c.op} has the user_id filter`);
  });
  it('create/update/delete and the trade lifecycle', async () => {
    const db = fresh(); const st = sbStore(db);
    const a = await st.createAccount(accRow({ user_id: U2 }));                 // a foreign user_id in the row is overwritten
    assert.equal(a.user_id, U1);
    const t = await st.insertTrade({ id: 't0000000-0000-4000-8000-000000000001', backtest_account_id: a.id, symbol: 'EURUSD', direction: 'LONG', lot: '0.10',
      entry_price: '1.08311', entry_time: '2026-09-01T00:01:00.000Z', commission: '0.70' });
    assert.equal(t.user_id, U1);
    assert.equal((await st.listTrades(a.id)).length, 1);
    assert.deepEqual(plain(await st.updateTrade(t.id, { exit_price: '1.1' }, { onlyOpen: true })).map((r) => r.id), [t.id]);
    db.tables.backtest_account_trades[0].exit_time = '2026-09-01T02:00:00.000Z';
    assert.deepEqual(plain(await st.updateTrade(t.id, { exit_price: '1.2' }, { onlyOpen: true })), [], 'closed elsewhere matches nothing');
    assert.equal((await st.updateAccount(a.id, { name: 'Renamed' })).name, 'Renamed');
    await st.deleteTrades(a.id); assert.equal((await st.listTrades(a.id)).length, 0);
    await st.deleteAccount(a.id); assert.equal((await st.listAccounts()).length, 0);
  });
  it('pages through 1000 rows and maps database errors to Error(message) with the code', async () => {
    const db = fresh(); const st = sbStore(db);
    for (let i = 0; i < 1500; i++) db.tables.backtest_account_trades.push({ id: 't' + String(i).padStart(7, '0'), user_id: U1, backtest_account_id: 'acc', entry_time: '2026-09-01T00:00:00Z' });
    assert.equal((await st.listTrades('acc')).length, 1500);
    assert.equal(db.client.calls.filter((c) => c.op === 'select').length, 2);
    db.failNext.push({ table: 'backtest_accounts', op: 'insert', error: { code: 'P0001', message: 'BACKTEST_LIMIT_EXCEEDED:1' }, status: 400 });
    await assert.rejects(() => st.createAccount(accRow()), (e) => e.message === 'BACKTEST_LIMIT_EXCEEDED:1' && e.code === 'P0001' && e.status === 400);
    await assert.rejects(() => st.updateAccount('nope', { name: 'x' }), (e) => e.code === 'PGRST116');
  });
});
