// 2026-10-25 fixes (local backend, synthetic BTC/USDT): the chart follows the replay cursor and returns to auto scale after going to a
// date, a new section and a timeframe change; "Center chart" (button, R) and "Back to the current candle"; live numbers never move
// the buttons next to them; the activity bars are labelled as an estimate; no stale price line after going back.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function key(k, opt) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opt || {}))); }
  var R = function () { return window.__btTest.R(); };
  function toInput(sec) { var p = function (n) { return (n < 10 ? '0' : '') + n; }, x = window.WwTime.partsInTz(sec * 1000, window.WwTime.getTz()); return x.y + '-' + p(x.m) + '-' + p(x.d) + 'T' + p(x.H) + ':' + p(x.Mi); }
  function vis(id) { var e = $(id); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  // the main chart: cursor candle on the right, 80-120 candles, price axis around the visible candles
  function view(v) {
    v = v || R();
    var ts = v.chart.timeScale(), r = ts.getVisibleLogicalRange(), n = v.bars.length, h = v.el.clientHeight - ts.height();
    var from = Math.max(0, Math.ceil(r.from)), to = Math.min(n - 1, Math.floor(r.to)), lo = Infinity, hi = -Infinity;
    for (var i = from; i <= to; i++) { lo = Math.min(lo, v.bars[i].low); hi = Math.max(hi, v.bars[i].high); }
    return { n: n, from: r.from, to: r.to, shown: to - from + 1, lastIn: r.to >= n - 1 && r.from <= n - 1, top: v.series.coordinateToPrice(4), bot: v.series.coordinateToPrice(h - 4), lo: lo, hi: hi,
      auto: v.chart.priceScale('right').options().autoScale };
  }
  function centered(a) { return a.lastIn && a.shown >= 80 && a.shown <= 120 && a.auto && a.top >= a.hi && a.bot <= a.lo && a.bot > 0 && a.top < a.hi * 1.3; }
  function txt(a) { return JSON.stringify(a); }
  function rect(el) { var r = el.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-symbol', 'BTCUSDT'); await sleep(300);
    setv('bt-f-name', 'Stage 1'); setv('bt-f-tf', '1h');
    var start = Date.UTC(2025, 5, 2, 10) / 1000;
    setv('bt-f-start', toInput(start));
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R() && R().hist; }, 40000, 'replay ready');
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(400);
    ok('account opened: centered on the cursor, auto scale', centered(view()), txt(view()));
    ok('price axis: double click resets the price scale (option on)', R().chart.options().handleScale.axisDoubleClickReset.price === true);
    for (var i = 0; i < 60; i++) { $('bt-step-btn').click(); await sleep(15); }
    // live numbers: buttons and labels keep their place while prices change
    $('bt-buy-btn').click(); await sleep(250);
    $('bt-tab-open').click(); await sleep(100);
    var closeBtn = function () { return $('bt-open-body').querySelector('button[data-act="close"]'); };
    var before = [rect($('bt-buy-btn')), rect($('bt-sell-btn')), rect(closeBtn()), rect($('bt-stat-floating')), rect($('bt-stat-equity'))];
    var btn0 = closeBtn(), changes = 0, prev = $('bt-stat-floating').textContent, moved = [];
    for (i = 0; i < 40; i++) {
      $('bt-step1m-btn').click(); await sleep(30);
      if ($('bt-stat-floating').textContent !== prev) { changes++; prev = $('bt-stat-floating').textContent; }
      var now = [rect($('bt-buy-btn')), rect($('bt-sell-btn')), rect(closeBtn()), rect($('bt-stat-floating')), rect($('bt-stat-equity'))];
      if (now.join('|') !== before.join('|')) moved.push(now.join('|'));
    }
    ok('open P&L changed while stepping', changes > 3, changes);
    ok('nothing moved: buy/sell buttons, close button, P&L and equity fields', moved.length === 0, before.join('|') + ' vs ' + (moved[0] || ''));
    ok('the open-positions row is updated in place (the close button is the same element)', closeBtn() === btn0);
    var legend = $('bt-legend').getBoundingClientRect().width, lw = [];
    for (i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(30); lw.push(Math.round($('bt-legend').getBoundingClientRect().width)); }
    ok('OHLC row keeps its width', lw.every(function (w) { return w === lw[0]; }), lw.join(','));
    void legend;
    closeBtn().click(); await sleep(400);
    // scroll away -> "back to the current candle"
    ok('button hidden while the cursor candle is visible', !vis('bt-now-btn'));
    R().userAt = Date.now(); R().chart.timeScale().scrollToPosition(-400, false); await sleep(200);
    ok('scrolled away: "Back to the current candle" shown', vis('bt-now-btn'));
    $('bt-now-btn').click(); await sleep(200);
    ok('back: centered again, button hidden', centered(view()) && !vis('bt-now-btn'), txt(view()));
    // manual price scale (auto scale off) -> R
    R().chart.priceScale('right').applyOptions({ autoScale: false }); R().chart.timeScale().scrollToPosition(-250, false); await sleep(100);
    key('r'); await sleep(200);
    ok('R: auto scale back on and centered', centered(view()), txt(view()));
    R().chart.priceScale('right').applyOptions({ autoScale: false }); await sleep(50);
    $('bt-center-btn').click(); await sleep(200);
    ok('"Center chart" button does the same', centered(view()), txt(view()));
    ok('shortcut sheet lists R', (function () { $('bt-keys-btn').click(); var t = $('bt-keys-list').textContent; $('bt-keys-close').click(); return /R/.test(t) && /ortala|Center|zentrieren/i.test(t); })());
    // timeframe change: centered, auto scale
    R().chart.priceScale('right').applyOptions({ autoScale: false }); R().chart.timeScale().scrollToPosition(-300, false);
    setv('bt-tf', '15m'); await sleep(600);
    ok('timeframe change: centered, auto scale', centered(view()), txt(view()));
    setv('bt-tf', '1h'); await sleep(600);
    // a position line, then back in time (section 2): no stale line, centered on the old date, auto scale
    $('bt-buy-btn').click(); await sleep(200); for (i = 0; i < 3; i++) { $('bt-step-btn').click(); await sleep(30); }
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(400);
    R().chart.priceScale('right').applyOptions({ autoScale: false }); R().chart.timeScale().scrollToPosition(-500, false);
    setv('bt-goto-input', toInput(start - 20 * 86400)); $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-back-modal').classList.contains('active'); }, 5000, 'back modal');
    $('bt-back-continue').click();
    await waitFor(function () { return R().acc.sectionNo === 2 && $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().hist; }, 30000, 'section 2');
    await sleep(500);
    ok('section 2: centered on the new date, auto scale', centered(view()), txt(view()));
    ok('section 2: no position price lines left', Object.keys(R().lines).length === 0, JSON.stringify(Object.keys(R().lines)));
    // go to a later date (no confirmation): centered
    R().chart.timeScale().scrollToPosition(-300, false);
    setv('bt-goto-input', toInput(start - 10 * 86400)); $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().win.t[R().k] > start - 11 * 86400; }, 30000, 'goto');
    await sleep(500);
    ok('go to a date: centered, auto scale', centered(view()), txt(view()));
    // full screen: centered
    R().chart.timeScale().scrollToPosition(-300, false);
    key('f'); await sleep(400);
    ok('full screen: centered', centered(view()), txt(view()));
    key('Escape'); await sleep(300);
    // activity bars: label in the drawer and on the chart
    $('bt-look-btn').click(); await sleep(200);
    var sw = document.querySelector('#bt-look-body [data-switch="showVolume"]');
    ok('drawer: switch says "Aktivite (tahmini)"', /Aktivite \(tahmini\)|Activity \(estimated\)|Aktivität \(geschätzt\)/.test(sw.closest('label').textContent), sw.closest('label').textContent);
    if (!sw.checked) { sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); }
    await sleep(400); $('bt-look-close').click(); await sleep(100);
    ok('chart legend shows the activity estimate', /Aktivite \(tahmini\)|Activity \(estimated\)|Aktivität \(geschätzt\)/.test($('bt-legend').textContent), $('bt-legend').textContent);
    ok('no label "Hacim"/"Volume" left (switch and legend)', !/Hacim|Volume\b|Volumen/.test(sw.closest('label').textContent + $('bt-legend').textContent));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
