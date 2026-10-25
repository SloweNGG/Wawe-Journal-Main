// cTrader account FORM scenarios (the form must work with nothing touched): default account + default broker symbol, switching the
// account and back, a single connected account, reopening the form. Run: ?backend=supabase&driver=/__driver-ct-form.js&role=user&plan=premium&ct=ready
// (single cTrader account), the same with &ctn=2 (two accounts) and &ctn=2&ctbad=4455667 (the first account fails with a connection error).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), role = qp.get('role') || 'user', two = qp.get('ctn') === '2';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function tab(id) { document.querySelector('#bt-acc-tabs [data-acc-tab="' + id + '"]').click(); }
  function vis(id) { var e = $(id); return !!e && !e.hidden && e.offsetParent !== null; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  var db = null;
  async function toList() {
    if ($('bt-root').getAttribute('data-state') !== 'list') { $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 10000, 'list'); }
  }
  // opens the form and switches to cTrader; touches nothing else
  async function openCt() {
    await toList();
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    tab('data');
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return vis('bt-f-ct-wrap') && $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'measured');
  }
  async function submit(name, n) {
    $('bt-f-name').value = name;
    $('bt-account-submit').click();
    await waitFor(function () { return db.tables.backtest_accounts.length === n || vis('bt-account-error'); }, 15000, 'account ' + n);
    return { err: vis('bt-account-error') ? $('bt-account-error').textContent : '', row: db.tables.backtest_accounts[n - 1] };
  }
  try {
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list state');
    db = window.__db;

    var bad = qp.get('ctbad');
    // 1. nothing touched: default account + default broker symbol
    if (!bad) {
    await openCt();
    ok('the select shows the first account and its value is that account', $('bt-f-ct-account').options.length === (two ? 2 : 1) && $('bt-f-ct-account').value === '4455667', $('bt-f-ct-account').value);
    var r1 = await submit('Defaults', 1);
    ok('defaults: account is created (no "Select a cTrader account")', !r1.err && !!r1.row, r1.err);
    ok('defaults: first broker account and first broker symbol (EURUSD, id 1)', !!r1.row && r1.row.data_source === 'ctrader' && r1.row.source_ctid_account === 4455667 && r1.row.source_symbol_id === 1 && r1.row.source_symbol_name === 'EURUSD', r1.row && JSON.stringify(r1.row).slice(0, 300));

    // 2. reopen the form (the account list from the previous open is still in the select): defaults again
    await openCt();
    var r2 = await submit('Reopened', 2);
    ok('reopened: account is created with the defaults', !r2.err && !!r2.row && r2.row.source_ctid_account === 4455667 && r2.row.source_symbol_id === 1, r2.err || (r2.row && JSON.stringify(r2.row).slice(0, 200)));

    }
    if (two && !bad) {
      // 3. switch the account and back: the first account is used
      await openCt();
      setv('bt-f-ct-account', '4455668');
      await waitFor(function () { return /2024/.test($('bt-f-ct-depth').textContent) && $('bt-f-ct-symbol').options.length > 0; }, 10000, 'second measured');
      setv('bt-f-ct-account', '4455667');
      await waitFor(function () { return /2024/.test($('bt-f-ct-depth').textContent) && $('bt-f-ct-symbol').options.length > 0; }, 10000, 'first measured again');
      var r3 = await submit('Back and forth', 3);
      ok('switch and back: first account is used', !r3.err && !!r3.row && r3.row.source_ctid_account === 4455667 && r3.row.source_symbol_id === 1, r3.err || (r3.row && JSON.stringify(r3.row).slice(0, 200)));

      // 4. the second account (chosen once, no symbol change)
      await openCt();
      setv('bt-f-ct-account', '4455668');
      await waitFor(function () { return /2024/.test($('bt-f-ct-depth').textContent) && $('bt-f-ct-symbol').options.length > 0; }, 10000, 'second measured');
      var r4 = await submit('Second account', 4);
      ok('second account: its own broker account number is stored', !r4.err && !!r4.row && r4.row.source_ctid_account === 4455668 && r4.row.source_symbol_id === 1, r4.err || (r4.row && JSON.stringify(r4.row).slice(0, 200)));
    }
    if (two && bad === '4455667') {
      // 5. the default (first) account fails with a connection error, then the other account is chosen: the form must still work
      var n = db.tables.backtest_accounts.length;
      await toList();
      $('bt-new-account-btn').click();
      await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal bad');
    tab('data');
      check('bt-f-source-ctrader', true);
      await waitFor(function () { return vis('bt-f-ct-wrap') && $('bt-f-ct-depth').classList.contains('bt-error') && /cTrader/.test($('bt-f-ct-depth').textContent); }, 15000, 'first account error shown');
      ok('first account fails: connection message with reconnect link in the panel', !!$('bt-f-ct-depth').querySelector('a[href="/journals"]'), $('bt-f-ct-depth').textContent);
      setv('bt-f-ct-account', '4455668');
      await waitFor(function () { return /2024/.test($('bt-f-ct-depth').textContent) && $('bt-f-ct-symbol').options.length > 0; }, 10000, 'other account measured');
      var r5 = await submit('After a failed account', n + 1);
      var want = 4455668;
      ok('after a failed account the other account can be used (no "Select a cTrader account")', !r5.err && !!r5.row && r5.row.source_ctid_account === want, r5.err || (r5.row && JSON.stringify(r5.row).slice(0, 200)));
    }
    ok('no raw error text left in the form', !vis('bt-account-error'));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
