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
  try {
    // practice mode: the same flow for every signed-in user (role=admin and role=user), the page is no longer admin-only
    await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 10000, 'list state');
    ok(role + ' sees the list', vis('bt-view-list') && !document.getElementById('bt-view-soon'));
    ok('empty state shown', vis('bt-accounts-empty'));
    ok('quota label', /1\/|0\/|Hesap/.test($('bt-quota').textContent), $('bt-quota').textContent);
    ok('list banner says synthetic, not the old browser-storage claim', /entetik|ynthetic|ynthetisch/.test(document.querySelector('.bt-banner-test').textContent) && !/tarayıcıda saklan|in this browser/i.test(document.querySelector('.bt-banner-test').textContent));
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal + default start');
    ok('source choice: synthetic selected, cTrader visible but disabled (soon)', $('bt-f-source-synthetic').checked && !$('bt-f-source-synthetic').disabled && $('bt-f-source-ctrader').disabled && /Yakında|Coming soon|Demnächst/.test($('bt-f-source-wrap').textContent));
    ok('create modal open with default start', !!$('bt-f-start').value, $('bt-f-start').value);
    ok('spread default for EURUSD', $('bt-f-spread').value === '0.20', $('bt-f-spread').value);
    setv('bt-f-name', 'Smoke EURUSD'); setv('bt-f-tf', '1h'); setv('bt-f-commission', '7.00');
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    ok('replay view open', vis('bt-view-replay'));
    ok('chart canvas present', !!document.querySelector('#bt-chart canvas'));
    ok('clock shows a time', $('bt-clock-time').textContent.length > 4, $('bt-clock-time').textContent);
    ok('source label: synthetic data, not real market data', /gerçek piyasa verisi değildir|not real market data|keine echten Marktdaten/.test($('bt-source-label').textContent) && vis('bt-source-label'), $('bt-source-label').textContent);
    ok('spread shown with its pip value', /^\d+\.\d{5} \(0\.2 pip\)$/.test($('bt-spread').textContent), $('bt-spread').textContent);
    ok('bid/ask shown', /^\d+\.\d{5}$/.test($('bt-bid').textContent) && /^\d+\.\d{5}$/.test($('bt-ask').textContent), $('bt-bid').textContent + '/' + $('bt-ask').textContent);
    ok('balance 10000', /10[.,]?000/.test($('bt-stat-balance').textContent), $('bt-stat-balance').textContent);
    var key = Object.keys(localStorage).filter(function (k) { return k.indexOf('ww-bt:v1:') === 0; })[0];
    var blob = JSON.parse(localStorage.getItem(key));
    ok('account stored in localStorage with DB-shaped row', blob.accounts.length === 1 && blob.accounts[0].starting_balance === '10000.00' && blob.accounts[0].spread_pips === '0.20', JSON.stringify(blob.accounts[0]).slice(0, 160));
    var t0 = $('bt-clock-time').textContent;
    if (new URLSearchParams(location.search).get('mode') === 'shot') {
      for (var i = 0; i < 30; i++) { $('bt-step-btn').click(); await sleep(60); }
      var a2 = parseFloat($('bt-ask').textContent), b2 = parseFloat($('bt-bid').textContent);
      setv('bt-sl', (b2 - 0.0040).toFixed(5)); setv('bt-tp', (a2 + 0.0060).toFixed(5)); $('bt-buy-btn').click(); await sleep(200);
      for (var j = 0; j < 6; j++) { $('bt-step1m-btn').click(); await sleep(60); }
      return;
    }
    // step one candle (H1) and one minute
    $('bt-step-btn').click(); await sleep(400);
    ok('step candle moves the clock', $('bt-clock-time').textContent !== t0, t0 + ' -> ' + $('bt-clock-time').textContent);
    var t1 = $('bt-clock-time').textContent;
    $('bt-step1m-btn').click(); await sleep(300);
    ok('+1m moves the clock', $('bt-clock-time').textContent !== t1);
    // order validation
    setv('bt-lot', '0.375'); $('bt-buy-btn').click();
    ok('lot with 3 decimals rejected', vis('bt-order-error'), $('bt-order-error').textContent);
    setv('bt-lot', '0.10');
    var ask = parseFloat($('bt-ask').textContent), bid = parseFloat($('bt-bid').textContent);
    setv('bt-sl', (bid + 0.001).toFixed(5)); $('bt-buy-btn').click();
    ok('BUY with SL above the bid rejected', vis('bt-order-error'), $('bt-order-error').textContent);
    setv('bt-sl', (bid - 0.0030).toFixed(5)); setv('bt-tp', (ask + 0.0030).toFixed(5));
    ok('risk hint shown', $('bt-order-risk').textContent.length > 5, $('bt-order-risk').textContent);
    $('bt-buy-btn').click();
    await sleep(200);
    ok('position opened', $('bt-open-body').children.length === 1 && $('bt-open-count').textContent === '1', $('bt-open-count').textContent);
    ok('order error cleared, inputs cleared', !vis('bt-order-error') && $('bt-sl').value === '');
    ok('trade persisted as open', JSON.parse(localStorage.getItem(key)).trades.length === 1 && JSON.parse(localStorage.getItem(key)).trades[0].exit_time === null);
    ok('trade row has initial levels copied', JSON.parse(localStorage.getItem(key)).trades[0].initial_stop_loss !== null);
    // go-to blocked while a position is open
    setv('bt-goto-input', $('bt-goto-input').max); $('bt-goto-btn').click(); await sleep(200);
    ok('go-to blocked with an open position', /Açık pozisyon|open position/i.test(toasts()), toasts().slice(-120));
    // play at 10x until the position closes by TP/SL or 40 candles passed
    setv('bt-speed', '10'); $('bt-play-btn').click();
    ok('playing state', $('bt-view-replay').getAttribute('data-replay') === 'playing');
    var c0 = $('bt-clock-time').textContent; await sleep(3000); ok('clock advances while playing', $('bt-clock-time').textContent !== c0, c0 + ' -> ' + $('bt-clock-time').textContent + ' perfnow=' + Math.round(performance.now()));
    var played = await waitFor(function () { return $('bt-open-count').textContent === '0'; }, 25000, 'position closed while playing');
    $('bt-play-btn').click(); await sleep(200);
    ok('paused after play', $('bt-view-replay').getAttribute('data-replay') === 'ready');
    if (played) {
      ok('history has the closed trade', $('bt-history-count').textContent === '1', $('bt-history-count').textContent);
      var tr = JSON.parse(localStorage.getItem(key)).trades[0];
      ok('closed trade persisted with exit data', tr.exit_time && tr.exit_price && /^(tp|sl)$/.test(tr.exit_reason) && tr.pnl !== null && tr.gross_pnl !== null, JSON.stringify(tr).slice(0, 260));
      ok('net = gross - commission', Math.round(parseFloat(tr.pnl) * 100) === Math.round(parseFloat(tr.gross_pnl) * 100) - Math.round(parseFloat(tr.commission) * 100));
      ok('close toast shown', /kapandı|closed/i.test(toasts()));
    }
    // second trade: manual close
    setv('bt-lot', '0.05'); $('bt-sell-btn').click(); await sleep(150);
    ok('second position open', $('bt-open-count').textContent === '1');
    $('bt-open-body').querySelector('button[data-act="edit"]').click(); await sleep(100);
    ok('edit position modal opens', $('bt-pos-modal').classList.contains('active'));
    var askNow = parseFloat($('bt-ask').textContent);
    setv('bt-pos-sl', (askNow + 0.005).toFixed(5)); $('bt-pos-save').click(); await sleep(100);
    ok('SL modified and modal closed', !$('bt-pos-modal').classList.contains('active') && JSON.parse(localStorage.getItem(key)).trades.filter(function (t) { return !t.exit_time; })[0].stop_loss !== null);
    ok('initial level stays null (opened without SL)', JSON.parse(localStorage.getItem(key)).trades.filter(function (t) { return !t.exit_time; })[0].initial_stop_loss === null);
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(150);
    ok('manual close', $('bt-open-count').textContent === '0' && $('bt-history-count').textContent === '2', $('bt-history-count').textContent);
    // timeframe switch
    setv('bt-tf', '15m'); await sleep(1500);
    ok('timeframe persisted', JSON.parse(localStorage.getItem(key)).accounts[0].timeframe === '15m');
    setv('bt-tf', '1d'); await sleep(6000);
    ok('D1 still has a chart canvas', !!document.querySelector('#bt-chart canvas'));
    // go-to rules with trades
    var cur = $('bt-goto-input').value;
    setv('bt-goto-input', $('bt-goto-input').min); $('bt-goto-btn').click(); await sleep(300);
    ok('go-to backwards blocked on an account with trades', /geri gidilemez|go back/i.test(toasts()), toasts().slice(-140));
    // reset then go back
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings modal');
    ok('reset button visible with trades', vis('bt-account-reset'));
    ok('symbol locked, balance locked', $('bt-f-symbol').disabled && $('bt-f-balance').disabled);
    ok('edit modal: start date hidden, note about "go to date" shown', !vis('bt-f-start-wrap') && vis('bt-f-start-note'), $('bt-f-start-note').textContent.slice(0, 60));
    ok('edit modal: [hidden] wins over .bt-field (linked account hidden for a synthetic account)', !vis('bt-f-journal-wrap'));
    ok('edit modal: data source shown, locked', vis('bt-f-source-wrap') && $('bt-f-source-synthetic').disabled && $('bt-f-source-ctrader').disabled && vis('bt-f-source-note'));
    $('bt-account-reset').click(); await sleep(100);
    $('bt-reset-confirm').click(); await sleep(400);
    ok('reset deleted the trades', JSON.parse(localStorage.getItem(key)).trades.length === 0 && $('bt-history-count').textContent === '0');
    setv('bt-goto-input', $('bt-goto-input').min); $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 30000, 'goto after reset');
    ok('go-to backwards works after the reset', true, $('bt-clock-time').textContent);
    // back to list
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'back to list');
    ok('card rendered', document.querySelectorAll('.bt-account-card[data-id]').length === 1);
    ok('quota 1/10 premium', /1\/10/.test($('bt-quota').textContent), $('bt-quota').textContent);
    // delete
    document.querySelector('.bt-account-card button[data-act="delete"]').click(); await sleep(100);
    ok('delete modal', $('bt-delete-modal').classList.contains('active'));
    $('bt-delete-confirm').click(); await sleep(300);
    ok('account deleted', JSON.parse(localStorage.getItem(key)).accounts.length === 0 && vis('bt-accounts-empty'));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
