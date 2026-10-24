// Crypto spread display (local backend): BTC/USDT shows the spread in USD (price units), not pips; forex keeps pips.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    ok('EUR/USD form: spread in pips', /pip/i.test($('bt-f-spread-label').textContent) && /pip/.test($('bt-f-spread-hint').textContent), $('bt-f-spread-label').textContent + ' | ' + $('bt-f-spread-hint').textContent);
    setv('bt-f-symbol', 'BTCUSDT'); await sleep(300);
    ok('BTC/USDT form: label and hint in USD, no pip', /USD/.test($('bt-f-spread-label').textContent) && !/pip/i.test($('bt-f-spread-label').textContent) && /10\.00 USD/.test($('bt-f-spread-hint').textContent) && !/pip/i.test($('bt-f-spread-hint').textContent), $('bt-f-spread-label').textContent + ' | ' + $('bt-f-spread-hint').textContent);
    ok('BTC/USDT default spread 10.00', $('bt-f-spread').value === '10.00');
    setv('bt-f-spread', '20000'); setv('bt-f-name', 'BTC'); $('bt-account-submit').click(); await sleep(200);
    ok('BTC/USDT: out-of-range spread error speaks USD', /USD/.test($('bt-account-error').textContent) && !/pip/i.test($('bt-account-error').textContent), $('bt-account-error').textContent);
    setv('bt-f-spread', '10.00'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    ok('order panel: spread "10.00 USD"', $('bt-spread').textContent === '10.00 USD', $('bt-spread').textContent);
    var h = $('bt-lot-hint').textContent;
    ok('lot hint: position value and a 1% move instead of the pip value', !/pip/i.test(h) && /\$/.test(h) && /1/.test(h) && /≈.*≈/.test(h), h);
    var bid = parseFloat($('bt-bid').textContent), ask = parseFloat($('bt-ask').textContent);
    ok('ask = bid + 10.00', Math.abs(ask - bid - 10) < 0.001, bid + ' / ' + ask);
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings');
    ok('settings of the BTC account: spread in USD', /USD/.test($('bt-f-spread-label').textContent) && $('bt-f-spread').value === '10.00');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
