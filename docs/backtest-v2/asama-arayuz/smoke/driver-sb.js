// Supabase-backend scenario: SupabaseStore over the FakeDb (tests/helpers/fake-supabase.js) + journal sync
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(id) { var e = $(id); return !!e && !e.hidden && e.offsetParent !== null; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function toasts() { return window.__toasts.map(function (x) { return x[1]; }).join(' | '); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  var J1 = '11111111-1111-4111-8111-111111111111', J2 = '22222222-2222-4222-8222-222222222222';
  var db = null;
  var mirrors = function () { return db.tables.trades.filter(function (t) { return t.platform_source === 'backtest'; }); };
  try {
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list state');
    db = window.__db;
    ok('supabase backend active (journal selector available)', true);
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    ok('journal field visible with both journals', vis('bt-f-journal-wrap') && $('bt-f-journal').options.length === 3, String($('bt-f-journal').options.length));
    setv('bt-f-name', 'Linked'); setv('bt-f-journal', J1); setv('bt-f-commission', '7.00');
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    ok('account row stored in backtest_accounts with the journal', db.tables.backtest_accounts.length === 1 && db.tables.backtest_accounts[0].journal_id === J1);
    ok('every request carries the user filter', db.client.calls.filter(function (c) { return c.table.indexOf('backtest_') === 0 && c.op !== 'insert'; }).every(function (c) { return c.filters.some(function (f) { return f[1] === 'user_id' && f[2] === 'u-admin'; }); }));
    // trade 1: open, one minute, manual close
    setv('bt-lot', '0.10'); $('bt-buy-btn').click(); await sleep(200);
    ok('open position stored (no exit), nothing mirrored yet', db.tables.backtest_account_trades.length === 1 && !db.tables.backtest_account_trades[0].exit_time && mirrors().length === 0);
    $('bt-step1m-btn').click(); await sleep(200);
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(600);
    var closed = db.tables.backtest_account_trades[0];
    ok('closed trade saved in the account', !!closed.exit_time && closed.pnl != null);
    ok('mirror written to trades: platform_source, journal, hash, symbol', mirrors().length === 1 && mirrors()[0].journal_id === J1 && mirrors()[0].import_hash === 'backtest:' + closed.backtest_account_id + ':' + closed.id && mirrors()[0].symbol === 'EURUSD', JSON.stringify(mirrors()[0] || {}).slice(0, 200));
    ok('mirror pnl equals the account trade pnl (exact decimal)', mirrors()[0] && Number(mirrors()[0].pnl) === Number(closed.pnl), (mirrors()[0] || {}).pnl + ' vs ' + closed.pnl);
    ok('mirror has no position_id and carries entry/exit dates', mirrors()[0].position_id === null && mirrors()[0].trade_date === closed.entry_time && mirrors()[0].exit_date === closed.exit_time);
    ok('wwCache.invalidate("trades") and the trade-saved event fired', window.__cacheInv.indexOf('trades') >= 0 && window.__events.some(function (d) { return d && d.source === 'backtest'; }), JSON.stringify(window.__cacheInv) + JSON.stringify(window.__events));
    // relink J1 -> J2 with confirmation
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings');
    setv('bt-f-journal', J2); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-confirm-modal').classList.contains('active'); }, 5000, 'relink confirm');
    ok('relink asks for confirmation with the count', /1/.test($('bt-confirm-text').textContent), $('bt-confirm-text').textContent.slice(0, 120));
    $('bt-confirm-cancel').click(); await sleep(300);
    ok('cancel keeps the old link and the mirror', db.tables.backtest_accounts[0].journal_id === J1 && mirrors().length === 1 && mirrors()[0].journal_id === J1);
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-confirm-modal').classList.contains('active'); }, 5000, 'relink confirm 2');
    $('bt-confirm-ok').click();
    await waitFor(function () { return db.tables.backtest_accounts[0].journal_id === J2 && mirrors().length === 1 && mirrors()[0].journal_id === J2; }, 8000, 'relinked');
    ok('relinked: mirror moved to J2, none left in J1', mirrors().length === 1 && mirrors()[0].journal_id === J2 && db.tables.trades.filter(function (t) { return t.journal_id === J1; }).length === 0);
    // unlink
    await sleep(300);
    if (!$('bt-account-modal').classList.contains('active')) { $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings 2'); }
    setv('bt-f-journal', ''); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-confirm-modal').classList.contains('active'); }, 5000, 'unlink confirm');
    $('bt-confirm-ok').click();
    await waitFor(function () { return db.tables.backtest_accounts[0].journal_id === null; }, 8000, 'unlinked');
    ok('unlinked: all mirrors removed, the account trade stays', mirrors().length === 0 && db.tables.backtest_account_trades.length === 1);
    // relink to J1 (backfill of the past closed trade), then reset
    await sleep(300);
    if (!$('bt-account-modal').classList.contains('active')) { $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings 3'); }
    setv('bt-f-journal', J1); $('bt-account-submit').click();
    await waitFor(function () { return mirrors().length === 1; }, 8000, 'backfill on link');
    ok('linking backfills the closed trades (R17)', mirrors().length === 1 && mirrors()[0].journal_id === J1);
    await sleep(300);
    if (!$('bt-account-modal').classList.contains('active')) { $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings 4'); }
    $('bt-account-reset').click(); await sleep(100); $('bt-reset-confirm').click();
    await waitFor(function () { return db.tables.backtest_account_trades.length === 0; }, 8000, 'reset');
    await sleep(500);
    ok('reset removed the account trades AND their mirrors', db.tables.backtest_account_trades.length === 0 && mirrors().length === 0);
    // second closed trade, then delete the linked account
    setv('bt-lot', '0.10'); $('bt-sell-btn').click(); await sleep(150); $('bt-step1m-btn').click(); await sleep(150);
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(600);
    ok('mirror again after reset', mirrors().length === 1);
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    ok('card shows the linked account name', /Ana Hesap/.test(document.querySelector('.bt-account-card').textContent));
    document.querySelector('.bt-account-card button[data-act="delete"]').click();
    await waitFor(function () { return $('bt-delete-modal').classList.contains('active'); }, 5000, 'delete modal');
    await waitFor(function () { return vis('bt-delete-note'); }, 5000, 'delete note');
    ok('delete dialog warns about the copied trades', /1/.test($('bt-delete-note').textContent), $('bt-delete-note').textContent.slice(0, 100));
    $('bt-delete-confirm').click(); await sleep(700);
    ok('account deleted: no account, no account trades, no mirrors', db.tables.backtest_accounts.length === 0 && db.tables.backtest_account_trades.length === 0 && mirrors().length === 0);
    ok('no sync error toast was shown', !/aktarılamadı/.test(toasts()), toasts().slice(-200));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { if (out.some(function (l) { return /^(FAIL|TIMEOUT|EXCEPTION)/.test(l); })) out.push('WARNS ' + JSON.stringify(window.__warns).slice(0, 1500), 'TOASTS ' + toasts()); $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
