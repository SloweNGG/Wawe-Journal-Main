// Statistics tab scenario (local backend): a few real trades, then the tab. ?plan=free|premium, ?phone=1.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function q(sel) { return $('bt-stats-view').querySelector(sel); }
  function qa(sel) { return $('bt-stats-view').querySelectorAll(sel); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Stats'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    await sleep(100);
    if (!pro) {
      var sw = document.querySelector('.bt-win[data-win="stats"]');
      ok('free: simple view without the statistics window (Premium)', $('bt-root').getAttribute('data-mode') === 'simple' && (!sw || sw.getBoundingClientRect().width === 0));
      throw 'done';
    }
    // trades: two with a stop loss, one without, closed by hand after a few candles
    for (var n = 0; n < 4; n++) {
      var bid = parseFloat($('bt-bid').textContent), ask = parseFloat($('bt-ask').textContent);
      if (n < 3) setv('bt-sl', (n % 2 ? ask + 0.003 : bid - 0.003).toFixed(5));
      (n % 2 ? $('bt-sell-btn') : $('bt-buy-btn')).click(); await sleep(80);
      for (var i = 0; i < 3 + n; i++) { $('bt-step-btn').click(); await sleep(40); }
      var c = $('bt-open-body').querySelector('button[data-act="close"]'); if (c) c.click(); await sleep(80);
    }
    $('bt-buy-btn').click(); await sleep(80); $('bt-step-btn').click(); await sleep(80);     // one open position for the equity curve
    var eng = window.__btTest.R().eng;
    window.__btTest.openWin('stats');
    await waitFor(function () { return qa('.bt-st-kpi').length >= 6; }, 5000, 'stats rendered');
    var net = eng.closed.reduce(function (a, t) { return a + t.net; }, 0);
    var vals = Array.prototype.map.call(qa('.bt-st-kpi .bt-st-value'), function (e) { return e.textContent; });
    ok('closed trades in the engine', eng.closed.length >= 3, eng.closed.length);
    ok('net P&L matches the closed trades (cents, sign)', vals[0].replace(/[^0-9]/g, '') === String(Math.abs(net)) && (net >= 0) === !/[−-]/.test(vals[0]), vals[0] + ' vs ' + net);
    var wins = eng.closed.filter(function (t) { return t.net > 0; }).length;
    ok('win rate matches', vals[1] === (wins / eng.closed.length * 100).toFixed(1) + '%', vals[1]);
    ok('trade count matches', vals[3].indexOf(String(eng.closed.length)) === 0, vals[3]);
    ok('balance curve drawn', !!q('.bt-st-chart canvas'));
    if (!pro) {
      ok('free: expectancy and drawdown locked with PRO', qa('.bt-st-locked').length === 2 && qa('.bt-st-locked .bt-pro').length === 2);
      ok('free: one chart only + the Premium teaser', qa('.bt-st-chart').length === 1 && !!q('.bt-st-teaser .bt-pro'));
      ok('free: no heatmap, no R bars, no sessions', !q('.bt-st-heat') && !q('.bt-st-bars') && !q('.bt-st-sess'));
      q('.bt-st-teaser .btn').click(); await sleep(50);
      ok('free: teaser opens the upgrade window', window.__upgrade === true);
      window.__upgrade = false; q('.bt-st-locked').click(); await sleep(50);
      ok('free: locked figure opens the upgrade window', window.__upgrade === true);
    } else {
      ok('premium: no PRO tags', qa('.bt-pro').length === 0);
      ok('premium: balance (trade order) + drawdown + section equity charts', qa('.bt-st-chart canvas').length >= 3 && qa('.bt-st-chart').length === 3);
      ok('premium: R distribution with 7 bins, counts add up', qa('.bt-st-bar').length === 7 &&
        Array.prototype.reduce.call(qa('.bt-st-count'), function (a, e) { return a + (+e.textContent); }, 0) === eng.closed.filter(function (t) { return t.sl0 != null; }).length);
      var rcard = q('.bt-st-bars').parentNode.textContent;
      ok('premium: R card says how many trades have an R (3 / 4) and that 1 without a stop loss is left out', /3 \/ 4/.test(rcard) && /(durdursuz|without a stop|ohne Stop)[^0-9]*1|1 [^0-9]*(durdursuz|without a stop|ohne Stop)/i.test(rcard), rcard.slice(0, 300));
      ok('premium: four session rows', qa('.bt-st-srow').length === 4);
      ok('premium: monthly heatmap with a value', !!q('.bt-st-heat') && Array.prototype.some.call(qa('.bt-st-heat td'), function (td) { return /[0-9]/.test(td.textContent); }));
      ok('premium: expectancy and drawdown shown', vals[4] !== '—' && vals[5] !== '—', vals[4] + ' | ' + vals[5]);
    }
    ok('extra line: commission and ambiguous exits', /\$/.test($('bt-stats-extra').textContent));
    // a new close refreshes the open tab
    var before = vals[3];
    var c2 = $('bt-open-body').querySelector('button[data-act="close"]'); c2.click(); await sleep(400);
    ok('closing a trade refreshes the tab', q('.bt-st-kpi:nth-child(4) .bt-st-value').textContent !== before, before + ' -> ' + q('.bt-st-kpi:nth-child(4) .bt-st-value').textContent);
    if (qp.get('big') === '1') { $('bt-root').style.setProperty('--bt-bottom-h', (window.innerHeight - 420) + 'px'); await sleep(600); }
    if (qp.get('phone') === '1') ok('phone: no horizontal page scroll with the stats open', document.documentElement.scrollWidth <= window.innerWidth + 1, document.documentElement.scrollWidth);
  } catch (e) { if (e !== 'done') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
