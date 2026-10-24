// Monthly trade limit on cTrader-data accounts (FakeDb emulates migration 202610240002). Supabase backend, ct=ready.
// ?plan=free&tlimit=3&tused=1: indicator, the last allowed trade, buttons disabled at the limit, open position still closable,
// synthetic account unlimited. ?plan=premium: no indicator, no limit. ?tused=3&race=1: the database refuses, the page rolls back.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = qp.get('plan') === 'premium', limit = +(qp.get('tlimit') || 100);
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(id) { var e = $(id); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  function trades() { return window.__db.tables.backtest_account_trades; }
  function openCount() { return window.__btTest.R().eng.open.length; }
  async function closeAll() { var b; while ((b = $('bt-open-body').querySelector('button[data-act="close"]'))) { b.click(); await sleep(150); } }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list');
    // a cTrader-data account
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel');
    setv('bt-f-name', 'CT limit'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    await sleep(300);
    if (pro) {
      ok('premium: no limit indicator', !vis('bt-limit'));
      for (var p = 0; p < 4; p++) { $('bt-buy-btn').click(); await sleep(150); }
      ok('premium: trades beyond the free limit are stored', trades().length === 4 && !$('bt-buy-btn').disabled, trades().length);
      throw 'done';
    }
    ok('free: indicator "this month used / limit"', vis('bt-limit') && /1\D+3/.test($('bt-limit-text').textContent), $('bt-limit-text').textContent);
    if (qp.get('race') === '1') {
      // the page thinks there is room (stale usage), the database refuses: the position is taken back
      window.__db.tradeUsed = limit;
      $('bt-buy-btn').click(); await sleep(400);
      ok('database refusal: position taken back, nothing stored, upgrade window', openCount() === 0 && trades().length === 0 && window.__upgrade === true && $('bt-buy-btn').disabled, JSON.stringify({ open: openCount(), rows: trades().length }));
      ok('database refusal: indicator shows the limit reached', /3\D+3/.test($('bt-limit-text').textContent) && vis('bt-limit-full'));
      ok('no save-failure banner or retry for the refused trade', !vis('bt-save-banner'));
      throw 'done';
    }
    $('bt-buy-btn').click(); await sleep(250);
    ok('second trade stored, indicator 2 / 3', trades().length === 1 && /2\D+3/.test($('bt-limit-text').textContent), $('bt-limit-text').textContent);
    $('bt-step-btn').click(); await sleep(150);
    $('bt-sell-btn').click(); await sleep(250);
    ok('third trade reaches the limit: 3 / 3, buttons disabled, Premium message', /3\D+3/.test($('bt-limit-text').textContent) && $('bt-buy-btn').disabled && $('bt-sell-btn').disabled && vis('bt-limit-full'), $('bt-limit-text').textContent);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', shiftKey: true, bubbles: true })); await sleep(200);
    ok('Shift+B does not open a trade at the limit', trades().length === 2 && openCount() === 2);
    $('bt-limit-upgrade').click(); await sleep(50);
    ok('"Upgrade" opens the upgrade window', window.__upgrade === true);
    await closeAll();
    ok('open positions can still be closed at the limit', openCount() === 0 && trades().every(function (t) { return t.exit_time; }), trades().map(function (t) { return !!t.exit_time; }).join());
    ok('still at the limit after closing (closing does not count)', $('bt-buy-btn').disabled);
    // full screen quick order respects the limit too
    $('bt-fs-btn').click(); await sleep(150);
    ok('full screen: quick order buttons disabled at the limit, indicator floats with them', $('bt-buy-btn').disabled && vis('bt-limit'));
    $('bt-fs-exit').click(); await sleep(100);
    // reset the account: the counter stays
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings');
    $('bt-account-reset').click(); await sleep(100); $('bt-reset-confirm').click(); await sleep(500);
    ok('account reset does not give trades back', $('bt-buy-btn').disabled && trades().length === 0);
    // reopening reads the usage from the database again
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && vis('bt-limit'); }, 30000, 'reopen');
    ok('reopened: usage from the database, still 3 / 3', /3\D+3/.test($('bt-limit-text').textContent) && $('bt-buy-btn').disabled);
    if (qp.get('phone') === '1') ok('phone: no horizontal page scroll', document.documentElement.scrollWidth <= window.innerWidth + 1);
  } catch (e) { if (e !== 'done') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
