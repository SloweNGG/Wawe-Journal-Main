// ============================================================
// WwCtSync — cTrader sync client shared by the navbar button, the OAuth callback page and the automatic sync.
//
//   runSync(opts)          one account, every round until the server says done (it works ≤90 s per call)
//   autoSyncCandidates()   which accounts the automatic sync may touch now
//   autoSync(opts)         the automatic sync: accounts with auto_sync on, last success older than 30 min,
//                          not tried from this browser in the last 30 min, run one after another
//   chooseAccount()        OAuth callback: the account to link without asking, or null (ask the user)
//
// No DOM access here: callers pass fetch, storage, the session token and the toast function, so Node tests can drive
// every branch (tests/ctrader-sync-client.test.js).
// ============================================================
(function (global) {
  'use strict';
  if (global.WwCtSync) return;

  var AUTO_MIN_AGE_MS = 30 * 60 * 1000;          // auto sync waits this long after the last success / attempt
  var WARN_EVERY_MS = 24 * 60 * 60 * 1000;       // auto sync repeats a "reconnect" warning at most daily
  var ATTEMPTS_KEY = 'ww_ct_autosync_v1';        // { attempts: {ctid: ms}, warned: {ctid: ms} } in localStorage
  var KEEP_MS = 7 * 24 * 60 * 60 * 1000;
  var MAX_ROUNDS = 10;

  var FALLBACK_URL = 'https://odasapyhtdopbnlfhwde.supabase.co';
  var FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXNhcHlodGRvcGJubGZod2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NDk0NjgsImV4cCI6MjA5NDAyNTQ2OH0.AH7V9i61pFWj33sCy51khdYHZn34BNitXY9exJySmWg';

  function endpoint() {
    var c = global.WW_CONFIG || {};
    return {
      url: global.SUPABASE_URL || c.SUPABASE_URL || FALLBACK_URL,
      anonKey: global.SUPABASE_ANON_KEY || c.SUPABASE_ANON_KEY || FALLBACK_ANON
    };
  }

  function syncError(message, code, extra) {
    var e = new Error(message);
    e.code = code;
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
    return e;
  }

  // Server answer -> error code. ACCESS_REVOKED: the cTrader authorization does not cover the account any more;
  // NEEDS_RECONNECT: the token is gone or expired; BUSY: another sync of this account is running.
  function errorCode(status, data) {
    data = data || {};
    if (data.access_revoked) return 'ACCESS_REVOKED';
    if (data.needs_reconnect) return 'NEEDS_RECONNECT';
    if (data.is_syncing || status === 429) return 'BUSY';
    return 'FAILED';
  }

  // opts: { ctid, journalId, token, fetchFn?, url?, anonKey?, maxRounds?, onRound?(round) }
  // -> { inserted, skipped, warnings[], rounds, done, last }  |  throws Error{code, inserted, rounds}
  async function runSync(opts) {
    var ep = endpoint();
    var fetchFn = opts.fetchFn || global.fetch;
    var url = (opts.url || ep.url) + '/functions/v1/ctrader-sync';
    var maxRounds = opts.maxRounds || MAX_ROUNDS;
    var inserted = 0, skipped = 0, warnings = [], rounds = 0, data = null;
    if (!opts.token) throw syncError('Oturum bulunamadı.', 'NO_SESSION', { inserted: 0, rounds: 0 });
    do {
      rounds++;
      var res;
      try {
        res = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + opts.token,
            'apikey': opts.anonKey || ep.anonKey
          },
          body: JSON.stringify({ ctidTraderAccountId: Number(opts.ctid), journalId: opts.journalId || null })
        });
      } catch (netErr) {
        throw syncError('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.', 'NETWORK', { inserted: inserted, rounds: rounds });
      }
      try { data = await res.json(); } catch (e) { data = {}; }
      if (!res.ok || !data || data.error) {
        throw syncError((data && data.error) || 'Senkronizasyon başarısız.', errorCode(res.status, data),
          { inserted: inserted, rounds: rounds, status: res.status });
      }
      inserted += data.inserted || 0;
      skipped += data.skipped || 0;
      if (Array.isArray(data.warnings)) warnings = warnings.concat(data.warnings);
      if (data.done === false && rounds < maxRounds && typeof opts.onRound === 'function') {
        try { opts.onRound(rounds); } catch (e) { /* UI callback must not stop the sync */ }
      }
    } while (data.done === false && rounds < maxRounds);
    return { inserted: inserted, skipped: skipped, warnings: warnings, rounds: rounds, done: data.done !== false, last: data };
  }

  // ---------------------------------------------------------------- automatic sync
  function readState(storage) {
    try {
      var s = JSON.parse((storage && storage.getItem(ATTEMPTS_KEY)) || 'null');
      if (s && typeof s === 'object') return { attempts: s.attempts || {}, warned: s.warned || {} };
    } catch (e) { /* corrupt or blocked storage: start empty */ }
    return { attempts: {}, warned: {} };
  }
  function writeState(storage, st, now) {
    [st.attempts, st.warned].forEach(function (m) {
      Object.keys(m).forEach(function (k) { if (!(now - Number(m[k]) < KEEP_MS)) delete m[k]; });
    });
    try { if (storage) storage.setItem(ATTEMPTS_KEY, JSON.stringify(st)); } catch (e) { /* private mode */ }
  }

  function ageMs(iso, now) {
    if (iso === null || iso === undefined || iso === '') return Infinity;
    var t = typeof iso === 'number' ? iso : new Date(iso).getTime();
    return isFinite(t) ? now - t : Infinity;
  }

  function autoSyncCandidates(accounts, now, attempts, minAgeMs) {
    var min = minAgeMs || AUTO_MIN_AGE_MS;
    attempts = attempts || {};
    return (Array.isArray(accounts) ? accounts : []).filter(function (a) {
      return a && a.auto_sync === true && a.journal_id && !a.access_revoked && !a.is_syncing &&
        ageMs(a.last_sync_at, now) >= min &&
        ageMs(attempts[String(a.ctid_trader_account_id)], now) >= min;
    });
  }

  // opts: { status (get_ctrader_status data), getToken() -> Promise<token>, fetchFn?, storage?, now?() ,
  //         notify?(code, account, err)  — called for NEEDS_RECONNECT / ACCESS_REVOKED, at most once a day per account }
  // -> { ran, inserted, results: [{ account, inserted } | { account, error }] }
  async function autoSync(opts) {
    var nowFn = opts.now || Date.now;
    var now = nowFn();
    var storage = opts.storage === undefined ? safeLocalStorage() : opts.storage;
    var status = opts.status || {};
    if (status.token_status === 'needs_reconnect') return { ran: 0, inserted: 0, results: [] };
    var st = readState(storage);
    var list = autoSyncCandidates(status.accounts, now, st.attempts);
    if (!list.length) return { ran: 0, inserted: 0, results: [] };

    // claim before the first request: other tabs and later page loads skip these accounts for 30 min,
    // whether the sync succeeds or not (no retry storm on a failing account)
    list.forEach(function (a) { st.attempts[String(a.ctid_trader_account_id)] = now; });
    writeState(storage, st, now);

    var token = null;
    try { token = await opts.getToken(); } catch (e) { token = null; }
    if (!token) return { ran: 0, inserted: 0, results: [] };

    var total = 0, results = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      try {
        var r = await runSync({ ctid: a.ctid_trader_account_id, journalId: a.journal_id, token: token, fetchFn: opts.fetchFn });
        total += r.inserted;
        results.push({ account: a, inserted: r.inserted, result: r });
      } catch (err) {
        results.push({ account: a, error: err });
        if ((err.code === 'NEEDS_RECONNECT' || err.code === 'ACCESS_REVOKED') && typeof opts.notify === 'function') {
          var key = String(a.ctid_trader_account_id);
          var st2 = readState(storage);
          if (ageMs(st2.warned[key], nowFn()) >= WARN_EVERY_MS) {
            st2.warned[key] = nowFn();
            writeState(storage, st2, nowFn());
            try { opts.notify(err.code, a, err); } catch (e) { /* toast failure is not a sync failure */ }
          }
        }
        if (err.code === 'NEEDS_RECONNECT') break;       // one token for all accounts: the rest would fail the same way
      }
    }
    return { ran: results.length, inserted: total, results: results };
  }

  function safeLocalStorage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  // ---------------------------------------------------------------- OAuth callback
  // accounts: the list ctrader-connect returned (only accounts the new authorization covers).
  // -> { account, reason } when no question is needed, otherwise null.
  function chooseAccount(accounts, journalId) {
    var list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    if (!list.length) return null;
    if (journalId) {
      var linked = list.filter(function (a) { return a.journal_id === journalId; });
      if (linked.length === 1) return { account: linked[0], reason: 'already_linked' };
    }
    if (list.length === 1) return { account: list[0], reason: 'only_account' };
    return null;
  }

  function accountLabel(a) {
    if (!a) return '';
    return (a.is_live ? 'Live' : 'Demo') + ' · ' + (a.broker_name || 'cTrader') + ' #' + (a.trader_login || a.ctid_trader_account_id);
  }

  global.WwCtSync = {
    AUTO_MIN_AGE_MS: AUTO_MIN_AGE_MS,
    WARN_EVERY_MS: WARN_EVERY_MS,
    ATTEMPTS_KEY: ATTEMPTS_KEY,
    MAX_ROUNDS: MAX_ROUNDS,
    endpoint: endpoint,
    runSync: runSync,
    autoSyncCandidates: autoSyncCandidates,
    autoSync: autoSync,
    chooseAccount: chooseAccount,
    accountLabel: accountLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
