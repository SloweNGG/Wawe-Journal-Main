// Backtest v2, Phase A: account and trade storage (window.WwBtStore) and the page gate (window.WwBtGate).
// The page only knows the WwBtStore interface; Phase B swaps the backend for Supabase without changing it:
//   listAccounts() getAccount(id) createAccount(row) updateAccount(id, patch) deleteAccount(id)
//   listTrades(accountId) insertTrade(row) updateTrade(id, patch) deleteTrades(accountId)
// LocalStore (this file) keeps { v:1, accounts:[], trades:[] } in localStorage under 'ww-bt:v1:<userId>', rows
// shaped exactly like the Migration 02 tables (decimal strings, ISO times) and enforces the same rules as its
// triggers and CHECK constraints, with the same error messages, so behaviour does not change in Phase B.
// Every storage access is in try/catch; without localStorage the data lives in memory (persistent === false).
// Methods return Promises and reject with Error(message) where message holds the code, like supabase errors.
(function (global) {
  'use strict';

  var KEY_PREFIX = 'ww-bt:v1:';
  var TFS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

  function fail(msg, code) { var e = new Error(msg); if (code) e.code = code; return e; }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function newId() {
    try { if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID(); } catch (e) { /* fall through */ }
    var b = new Array(16), i;
    for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  function charLen(s) { return Array.from(String(s).trim()).length; }

  // ---------------------------------------------------------------- gate (pure)
  // 'anon' (no user), 'demo' (?test=1 fake user: never read or write), or 'member' (every signed-in user;
  // the admin-only gate was removed with practice mode). Not a security boundary, only visibility:
  // the database (RLS, quota trigger) enforces who may do what.
  var WwBtGate = {
    isAdmin: function (user) { return !!(user && user.app_metadata && user.app_metadata.role === 'admin'); },
    decide: function (user) {
      if (!user) return 'anon';
      if (user.id === 'demo-user-id') return 'demo';
      return 'member';
    }
  };

  // ---------------------------------------------------------------- LocalStore
  // opts: { userId, storage (default window.localStorage), limit: number | function -> number, now: function -> ms,
  //         journalOwned: function(journalId) -> boolean (optional) }
  function createLocalStore(opts) {
    var userId = opts.userId, key = KEY_PREFIX + userId;
    var now = opts.now || function () { return Date.now(); };
    var store = { persistent: true, userId: userId, kind: 'local' };
    var storage = null, data;

    function nowIso() { return new Date(now()).toISOString(); }
    function limit() { return typeof opts.limit === 'function' ? opts.limit() : (opts.limit || 1); }

    try { storage = opts.storage !== undefined ? opts.storage : global.localStorage; } catch (e) { storage = null; }
    function load() {
      var raw = null;
      try { if (storage) raw = storage.getItem(key); } catch (e) { store.persistent = false; }
      if (storage === null) store.persistent = false;
      if (raw) {
        try {
          var d = JSON.parse(raw);
          if (d && d.v === 1 && Array.isArray(d.accounts) && Array.isArray(d.trades)) {
            // only this user's rows, whatever the blob says
            d.accounts = d.accounts.filter(function (a) { return a && a.user_id === userId; });
            d.trades = d.trades.filter(function (t) { return t && t.user_id === userId; });
            return d;
          }
        } catch (e) { /* corrupt blob: start empty (the bad blob is replaced on the next save) */ }
      }
      return { v: 1, accounts: [], trades: [] };
    }
    function save() {
      if (!storage) { store.persistent = false; return; }
      try { storage.setItem(key, JSON.stringify(data)); store.persistent = true; } catch (e) { store.persistent = false; }
    }
    data = load();

    function findAccount(id) { for (var i = 0; i < data.accounts.length; i++) if (data.accounts[i].id === id) return data.accounts[i]; return null; }
    function accountTrades(id) { return data.trades.filter(function (t) { return t.backtest_account_id === id; }); }
    function activeCount(exceptId) {
      return data.accounts.filter(function (a) { return a.is_active !== false && a.id !== exceptId; }).length;
    }

    // CHECK constraints of backtest_accounts
    function checkAccountValues(a) {
      if (!(charLen(a.name) >= 1 && charLen(a.name) <= 60)) throw fail('chk_backtest_accounts_name', '23514');
      if (!/^[A-Z0-9]{3,12}$/.test(a.symbol)) throw fail('chk_backtest_accounts_symbol', '23514');
      if ((a.data_source || 'synthetic') !== 'synthetic') throw fail('chk_backtest_accounts_data_source', '23514');   // 'ctrader' opens in a later migration
      if (a.journal_id) throw fail('chk_backtest_accounts_journal_needs_ctrader', '23514');          // synthetic accounts never link to a journal
      if (TFS.indexOf(a.timeframe) < 0) throw fail('chk_backtest_accounts_timeframe', '23514');
      var sb = num(a.starting_balance), sp = num(a.spread_pips), cm = num(a.commission_per_lot);
      if (!(sb > 0 && sb <= 100000000)) throw fail('chk_backtest_accounts_starting_balance', '23514');
      if (!(sp >= 0 && sp <= 10000)) throw fail('chk_backtest_accounts_spread_pips', '23514');
      if (!(cm >= 0 && cm <= 10000)) throw fail('chk_backtest_accounts_commission_per_lot', '23514');
      if (isNaN(Date.parse(a.replay_time))) throw fail('chk_backtest_accounts_replay_time', '23514');
    }
    // CHECK constraints of backtest_account_trades
    function checkTradeValues(t) {
      if (t.direction !== 'LONG' && t.direction !== 'SHORT') throw fail('chk_backtest_account_trades_direction', '23514');
      if (!(num(t.lot) > 0)) throw fail('chk_backtest_account_trades_lot', '23514');
      ['entry_price', 'exit_price', 'stop_loss', 'take_profit'].forEach(function (c) {
        if (t[c] !== null && t[c] !== undefined && !(num(t[c]) > 0)) throw fail('chk_backtest_account_trades_prices', '23514');
      });
      if (t.exit_reason != null && ['tp', 'sl', 'manual'].indexOf(t.exit_reason) < 0) throw fail('chk_backtest_account_trades_exit_reason', '23514');
      var closed = [t.exit_time, t.exit_price, t.exit_reason, t.pnl].map(function (v) { return v != null; });
      if (!(closed.every(Boolean) || !closed.some(Boolean))) throw fail('chk_backtest_account_trades_open_closed', '23514');
      if (t.exit_time != null && Date.parse(t.exit_time) < Date.parse(t.entry_time)) throw fail('chk_backtest_account_trades_exit_after_entry', '23514');
      if (t.pnl != null && t.gross_pnl != null && Math.round(num(t.pnl) * 100) !== Math.round(num(t.gross_pnl) * 100) - Math.round(num(t.commission) * 100)) {
        throw fail('chk_backtest_account_trades_gross_pnl', '23514');
      }
    }

    function p(fn) {
      return new Promise(function (resolve, reject) {
        try { resolve(fn()); } catch (e) { reject(e); }
      });
    }

    store.listAccounts = function () {
      return p(function () {
        return clone(data.accounts.filter(function (a) { return a.is_active !== false; })
          .sort(function (x, y) { return y.updated_at < x.updated_at ? -1 : y.updated_at > x.updated_at ? 1 : 0; }));
      });
    };
    store.getAccount = function (id) { return p(function () { return clone(findAccount(id)); }); };

    store.createAccount = function (row) {
      return p(function () {
        var a = {
          id: row.id || newId(), user_id: userId, journal_id: row.journal_id || null, name: row.name, symbol: row.symbol,
          timeframe: row.timeframe || '1h', starting_balance: row.starting_balance,
          spread_pips: row.spread_pips == null ? '0.00' : row.spread_pips,
          commission_per_lot: row.commission_per_lot == null ? '0.00' : row.commission_per_lot,
          replay_time: row.replay_time, is_active: row.is_active !== false, data_source: row.data_source || 'synthetic',
          created_at: nowIso(), updated_at: nowIso()
        };
        if (row.user_id && row.user_id !== userId) throw fail('BACKTEST_NOT_OWNER', '42501');
        if (findAccount(a.id)) throw fail('duplicate key value violates unique constraint', '23505');
        if (a.journal_id && opts.journalOwned && !opts.journalOwned(a.journal_id)) throw fail('INVALID_JOURNAL');   // BEFORE trigger, runs before the CHECKs
        checkAccountValues(a);
        if (a.is_active && activeCount(null) >= limit()) throw fail('BACKTEST_LIMIT_EXCEEDED:' + limit());
        data.accounts.push(a); save();
        return clone(a);
      });
    };

    store.updateAccount = function (id, patch) {
      return p(function () {
        var old = findAccount(id);
        if (!old) throw fail('account not found', 'PGRST116');
        var a = Object.assign({}, old, patch);
        ['user_id', 'id', 'symbol', 'data_source'].forEach(function (c) { if (a[c] !== old[c]) throw fail('BACKTEST_ACCOUNT_IMMUTABLE:' + c); });
        var trades = accountTrades(id);
        var spreadChanged = a.spread_pips !== old.spread_pips && num(a.spread_pips) !== num(old.spread_pips);
        var commChanged = a.commission_per_lot !== old.commission_per_lot && num(a.commission_per_lot) !== num(old.commission_per_lot);
        if ((spreadChanged || commChanged) && trades.some(function (t) { return t.exit_time == null; })) {
          throw fail('BACKTEST_OPEN_POSITIONS:' + (spreadChanged ? 'spread_pips' : 'commission_per_lot'));
        }
        if (Date.parse(a.replay_time) < Date.parse(old.replay_time) && trades.length) throw fail('BACKTEST_REPLAY_BACKWARD');
        if (a.journal_id && a.journal_id !== old.journal_id && opts.journalOwned && !opts.journalOwned(a.journal_id)) throw fail('INVALID_JOURNAL');
        checkAccountValues(a);
        if (a.is_active !== false && old.is_active === false && activeCount(id) >= limit()) throw fail('BACKTEST_LIMIT_EXCEEDED:' + limit());
        a.updated_at = nowIso();
        data.accounts[data.accounts.indexOf(old)] = a; save();
        return clone(a);
      });
    };

    store.deleteAccount = function (id) {
      return p(function () {
        data.accounts = data.accounts.filter(function (a) { return a.id !== id; });
        data.trades = data.trades.filter(function (t) { return t.backtest_account_id !== id; });   // ON DELETE CASCADE
        save();
        return true;
      });
    };

    store.listTrades = function (accountId) {
      return p(function () {
        return clone(accountTrades(accountId).sort(function (x, y) {
          return x.entry_time < y.entry_time ? -1 : x.entry_time > y.entry_time ? 1 : (x.id < y.id ? -1 : 1);
        }));
      });
    };

    store.insertTrade = function (row) {
      return p(function () {
        if (row.user_id && row.user_id !== userId) throw fail('BACKTEST_NOT_OWNER', '42501');
        var acc = findAccount(row.backtest_account_id);
        if (!acc) throw fail('INVALID_BACKTEST_ACCOUNT');
        if (row.symbol !== acc.symbol) throw fail('BACKTEST_SYMBOL_MISMATCH');
        var t = {
          id: row.id || newId(), user_id: userId, backtest_account_id: acc.id, symbol: row.symbol, direction: row.direction,
          lot: row.lot, entry_price: row.entry_price, exit_price: row.exit_price == null ? null : row.exit_price,
          stop_loss: row.stop_loss == null ? null : row.stop_loss, take_profit: row.take_profit == null ? null : row.take_profit,
          initial_stop_loss: row.stop_loss == null ? null : row.stop_loss,          // trigger: initial = level at open
          initial_take_profit: row.take_profit == null ? null : row.take_profit,
          entry_time: row.entry_time, exit_time: row.exit_time == null ? null : row.exit_time,
          pnl: row.pnl == null ? null : row.pnl, commission: row.commission == null ? '0.00' : row.commission,
          rr_ratio: row.rr_ratio == null ? null : row.rr_ratio, exit_reason: row.exit_reason == null ? null : row.exit_reason,
          gross_pnl: row.gross_pnl == null ? null : row.gross_pnl, exit_ambiguous: !!row.exit_ambiguous, created_at: nowIso()
        };
        for (var i = 0; i < data.trades.length; i++) if (data.trades[i].id === t.id) throw fail('duplicate key value violates unique constraint', '23505');
        checkTradeValues(t);
        data.trades.push(t); save();
        return clone(t);
      });
    };

    var IMMUTABLE_TRADE_COLS = ['id', 'user_id', 'backtest_account_id', 'symbol', 'direction', 'lot', 'entry_price', 'entry_time',
      'initial_stop_loss', 'initial_take_profit', 'rr_ratio', 'created_at'];
    // resolves with the updated rows ([] when nothing matched), like supabase .update().select('id').
    // opts.onlyOpen mirrors .is('exit_time', null): a position closed elsewhere matches nothing.
    store.updateTrade = function (id, patch, o) {
      return p(function () {
        var old = null, i;
        for (i = 0; i < data.trades.length; i++) if (data.trades[i].id === id) old = data.trades[i];
        if (!old || (o && o.onlyOpen && old.exit_time != null)) return [];
        var t = Object.assign({}, old, patch);
        IMMUTABLE_TRADE_COLS.forEach(function (c) { if (t[c] !== old[c]) throw fail('BACKTEST_TRADE_IMMUTABLE'); });
        if (old.exit_time != null && JSON.stringify(t) !== JSON.stringify(old)) throw fail('BACKTEST_TRADE_CLOSED');
        checkTradeValues(t);
        data.trades[data.trades.indexOf(old)] = t; save();
        return [clone(t)];
      });
    };

    store.deleteTrades = function (accountId) {
      return p(function () {
        data.trades = data.trades.filter(function (t) { return t.backtest_account_id !== accountId; });
        save();
        return true;
      });
    };

    // everything this user has, for the "Phase B: localStorage test data is not migrated, it is deleted" step
    store.clearAll = function () { return p(function () { data = { v: 1, accounts: [], trades: [] }; save(); return true; }); };

    return store;
  }

  // ---------------------------------------------------------------- SupabaseStore (Phase B backend)
  // Same interface as LocalStore, over window.sb. Every query carries an explicit user_id filter: RLS lets admins
  // read EVERY user's rows (user_id = auth.uid() OR is_admin()), so without it an admin would see everyone's accounts.
  // The database enforces the rules (quota, immutables, replay direction, CHECKs) and raises the same messages
  // the LocalStore reproduces; they surface as Error(message) with .code (SQLSTATE) and .status.
  var ACC_COLS = 'id,user_id,journal_id,name,symbol,timeframe,starting_balance,spread_pips,commission_per_lot,replay_time,is_active,data_source,created_at,updated_at';
  var PAGE_SIZE = 1000;

  function createSupabaseStore(opts) {
    var sb = opts.sb, userId = opts.userId;
    var store = { persistent: true, userId: userId, kind: 'supabase', ACC_COLS: ACC_COLS };
    function unwrap(res) {
      if (res && res.error) {
        var e = new Error(res.error.message || 'request failed');
        e.code = res.error.code; e.status = res.status; e.details = res.error.details;
        throw e;
      }
      return res ? res.data : null;
    }
    store.listAccounts = function () {
      return Promise.resolve(sb.from('backtest_accounts').select(ACC_COLS).eq('user_id', userId).eq('is_active', true)
        .order('updated_at', { ascending: false })).then(unwrap).then(function (d) { return d || []; });
    };
    store.getAccount = function (id) {
      return Promise.resolve(sb.from('backtest_accounts').select(ACC_COLS).eq('id', id).eq('user_id', userId)).then(unwrap)
        .then(function (d) { return (d && d[0]) || null; });
    };
    store.createAccount = function (row) {
      var r = Object.assign({}, row, { user_id: userId });
      return Promise.resolve(sb.from('backtest_accounts').insert(r).select(ACC_COLS)).then(unwrap).then(function (d) { return d[0]; });
    };
    store.updateAccount = function (id, patch) {
      return Promise.resolve(sb.from('backtest_accounts').update(patch).eq('id', id).eq('user_id', userId).select(ACC_COLS)).then(unwrap)
        .then(function (d) { if (!d || !d[0]) { var e = new Error('account not found'); e.code = 'PGRST116'; throw e; } return d[0]; });
    };
    store.deleteAccount = function (id) {
      return Promise.resolve(sb.from('backtest_accounts').delete().eq('id', id).eq('user_id', userId)).then(unwrap).then(function () { return true; });
    };
    store.listTrades = function (accountId) {
      var out = [];
      function page(from) {
        return Promise.resolve(sb.from('backtest_account_trades').select('*').eq('user_id', userId).eq('backtest_account_id', accountId)
          .order('entry_time', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE_SIZE - 1)).then(unwrap).then(function (d) {
          d = d || []; out = out.concat(d);
          return d.length < PAGE_SIZE ? out : page(from + PAGE_SIZE);
        });
      }
      return page(0);
    };
    store.insertTrade = function (row) {
      var r = Object.assign({}, row, { user_id: userId });
      return Promise.resolve(sb.from('backtest_account_trades').insert(r).select('*')).then(unwrap).then(function (d) { return d[0]; });
    };
    // resolves with the updated rows, complete ([] when nothing matched); opts.onlyOpen = .is('exit_time', null)
    store.updateTrade = function (id, patch, o) {
      var q = sb.from('backtest_account_trades').update(patch).eq('id', id).eq('user_id', userId);
      if (o && o.onlyOpen) q = q.is('exit_time', null);
      return Promise.resolve(q.select('*')).then(unwrap).then(function (d) { return d || []; });
    };
    store.deleteTrades = function (accountId) {
      return Promise.resolve(sb.from('backtest_account_trades').delete().eq('user_id', userId).eq('backtest_account_id', accountId)).then(unwrap).then(function () { return true; });
    };
    return store;
  }

  global.WwBtGate = WwBtGate;
  global.WwBtStore = { createLocalStore: createLocalStore, createSupabaseStore: createSupabaseStore, KEY_PREFIX: KEY_PREFIX, newId: newId };
})(typeof window !== 'undefined' ? window : globalThis);
