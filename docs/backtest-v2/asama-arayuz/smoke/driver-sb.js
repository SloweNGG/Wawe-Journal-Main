// Supabase-backend scenario (practice mode): SupabaseStore over the FakeDb (tests/helpers/fake-supabase.js, Migration 08 emulated).
// Every signed-in user may use the page; accounts are synthetic, never linked to a journal, and nothing is mirrored into trades.
(async function () {
  var out = [], role = new URLSearchParams(location.search).get('role') || 'admin';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(id) { var e = $(id); return !!e && !e.hidden && e.offsetParent !== null; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function toasts() { return window.__toasts.map(function (x) { return x[1]; }).join(' | '); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  var J1 = '11111111-1111-4111-8111-111111111111';
  var db = null;
  var tradeWrites = function () { return db.client.calls.filter(function (c) { return c.table === 'trades' && c.op !== 'select'; }); };
  try {
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list state');
    db = window.__db;
    ok(role + ': sees the list (no "soon" gate)', vis('bt-view-list') && !document.getElementById('bt-view-soon'));
    ok('list banner: synthetic, stored in the user account, no browser-storage claim', /entetik|ynthetic|ynthetisch/.test($('bt-view-list').querySelector('.bt-banner-test').textContent) && !/tarayıcıda saklan|in this browser/i.test($('bt-view-list').querySelector('.bt-banner-test').textContent), $('bt-view-list').querySelector('.bt-banner-test').textContent);
    ok('journals were not requested (synthetic accounts cannot be linked)', !db.client.calls.some(function (c) { return c.table === 'journals'; }));
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    ok('source: synthetic selected and enabled', $('bt-f-source-synthetic').checked && !$('bt-f-source-synthetic').disabled);
    ok('source: cTrader visible but disabled, with the "soon" chip', vis('bt-f-source-wrap') && $('bt-f-source-ctrader').disabled && !$('bt-f-source-ctrader').checked && /Yakında|Coming soon|Demnächst/.test($('bt-f-source-wrap').textContent));
    ok('journal field hidden for a synthetic account', !vis('bt-f-journal-wrap'));
    ok('source note (locked) hidden on create', !vis('bt-f-source-note'));
    setv('bt-f-name', 'Practice'); setv('bt-f-commission', '7.00');
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    var a = db.tables.backtest_accounts[0];
    ok('account row stored: synthetic, no journal', db.tables.backtest_accounts.length === 1 && a.data_source === 'synthetic' && a.journal_id === null, JSON.stringify(a).slice(0, 200));
    ok('every request carries the user filter', db.client.calls.filter(function (c) { return c.table.indexOf('backtest_') === 0 && c.op !== 'insert'; }).every(function (c) { return c.filters.some(function (f) { return f[1] === 'user_id' && f[2] === 'u-' + role; }); }));
    ok('chart label: synthetic data, not real market data', vis('bt-source-label') && /gerçek piyasa verisi değildir|not real market data|keine echten Marktdaten/.test($('bt-source-label').textContent), $('bt-source-label').textContent);
    // one closed trade: it stays in the account, nothing is copied to a journal
    setv('bt-lot', '0.10'); $('bt-buy-btn').click(); await sleep(200);
    $('bt-step1m-btn').click(); await sleep(200);
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(700);
    var closed = db.tables.backtest_account_trades[0];
    ok('closed trade saved in the account', !!closed && !!closed.exit_time && closed.pnl != null);
    ok('no journal mirror, no write to trades at all', db.tables.trades.length === 0 && tradeWrites().length === 0, JSON.stringify(tradeWrites().map(function (c) { return c.op; })));
    // settings: source locked, journal hidden
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings');
    ok('settings: source shown and locked, journal hidden', vis('bt-f-source-wrap') && $('bt-f-source-synthetic').checked && $('bt-f-source-synthetic').disabled && $('bt-f-source-ctrader').disabled && vis('bt-f-source-note') && !vis('bt-f-journal-wrap'));
    setv('bt-f-name', 'Practice 2'); $('bt-account-submit').click();
    await waitFor(function () { return db.tables.backtest_accounts[0].name === 'Practice 2'; }, 8000, 'rename');
    ok('rename works and keeps the source', db.tables.backtest_accounts[0].name === 'Practice 2' && db.tables.backtest_accounts[0].data_source === 'synthetic');
    // the database refuses what the UI hides
    var linkRes = await db.client.from('backtest_accounts').update({ journal_id: J1 }).eq('id', a.id).eq('user_id', 'u-' + role).select('id');
    ok('DB: linking a synthetic account to a journal is refused', !!linkRes.error && /journal_needs_ctrader/.test(linkRes.error.message), linkRes.error && linkRes.error.message);
    var srcRes = await db.client.from('backtest_accounts').update({ data_source: 'ctrader' }).eq('id', a.id).eq('user_id', 'u-' + role).select('id');
    ok('DB: data_source cannot be changed', !!srcRes.error && /IMMUTABLE:data_source/.test(srcRes.error.message), srcRes.error && srcRes.error.message);
    ok('rows unchanged by the refused writes', db.tables.backtest_accounts[0].journal_id === null && db.tables.backtest_accounts[0].data_source === 'synthetic');
    // card
    await sleep(300);
    if ($('bt-account-modal').classList.contains('active')) { $('bt-account-cancel').click(); await sleep(200); }
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    var card = document.querySelector('.bt-account-card[data-id]');
    ok('card carries the synthetic label', !!card.querySelector('.bt-source[data-source="synthetic"]') && /gerçek piyasa verisi değildir|not real market data|keine echten Marktdaten/.test(card.querySelector('.bt-source').textContent), card.querySelector('.bt-source') && card.querySelector('.bt-source').textContent);
    ok('card has no linked-account row', !/Bağlı hesap|Linked account|Verknüpftes Konto/.test(card.textContent));
    if (new URLSearchParams(location.search).get('plan') === 'free') {
      ok('free plan: quota shows 1/1', /1\/1/.test($('bt-quota').textContent), $('bt-quota').textContent);
      $('bt-new-account-btn').click(); await sleep(300);
      ok('free plan: the 2nd account is refused (upgrade modal, no form)', window.__upgrade === true && !$('bt-account-modal').classList.contains('active') && db.tables.backtest_accounts.length === 1, toasts().slice(-120));
    }
    // delete
    card.querySelector('button[data-act="delete"]').click();
    await waitFor(function () { return $('bt-delete-modal').classList.contains('active'); }, 5000, 'delete modal');
    await sleep(300);
    ok('delete dialog has no "copied trades" note', !vis('bt-delete-note'));
    $('bt-delete-confirm').click(); await sleep(700);
    ok('account deleted: no account, no account trades', db.tables.backtest_accounts.length === 0 && db.tables.backtest_account_trades.length === 0);
    ok('no sync error toast was shown', !/aktarılamadı/.test(toasts()), toasts().slice(-200));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { if (out.some(function (l) { return /^(FAIL|TIMEOUT|EXCEPTION)/.test(l); })) out.push('WARNS ' + JSON.stringify(window.__warns).slice(0, 1500), 'TOASTS ' + toasts()); $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
