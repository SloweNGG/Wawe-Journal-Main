// Trade markers, the balance curve and the R notes with many trades (80, three of them on one candle, two with a stop loss).
// Real mouse for the hover box (window.__pp). ?plan=premium|free.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, R = function () { return T().R(); }, E = window.WwBtEngine, pp = window.__pp;
  function markers() { return R().series.markers(); }
  function closeAll() { var b; while ((b = $('bt-open-body').querySelector('button[data-act="close"]'))) b.click(); }
  async function drawer(sel) { $('bt-look-btn').click(); await sleep(150); var b = q('#bt-look-body ' + sel); b.click(); await sleep(250); $('bt-look-close').click(); await sleep(150); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Marks'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && R() && R().bars && R().bars.length > 50; }, 40000, 'ready');
    await sleep(400);
    // 80 trades: three buys on one candle, two trades with a stop loss, the rest without
    var groupT = null;
    for (var i = 0; i < 77; i++) {
      var withSl = i === 10 || i === 40, buy = i % 2 === 0;
      if (withSl) { var qt = E.quote(R().eng); setv('bt-sl', E.ptsToStr(buy ? qt.bid - 150 : qt.ask + 150, R().sym.digits)); }
      if (i === 20) { $('bt-buy-btn').click(); $('bt-buy-btn').click(); $('bt-buy-btn').click(); groupT = R().eng.open[0].entryBarT; }
      else (buy ? $('bt-buy-btn') : $('bt-sell-btn')).click();
      if (withSl) setv('bt-sl', '');
      $('bt-step-btn').click(); $('bt-step-btn').click();
      closeAll();
    }
    await sleep(400);
    var n = R().eng.closed.length;
    ok('80 closed trades', n === 79 || n === 80, n);
    // default: small arrows and dots, no text except counts
    var m = markers();
    ok('default markers: no labels, only counts', m.length > 0 && m.every(function (x) { return x.text === '' || /^\d+$/.test(x.text); }), JSON.stringify(m.slice(0, 3)));
    ok('markers are small (size < 1)', m.every(function (x) { return x.size < 1; }));
    var C = window.WwBtCandles, gt = C.bucketStart(groupT, R().tfMin, R().sym.id), grp = m.filter(function (x) { return x.time === gt && x.shape === 'arrowUp'; });
    ok('three buys on one candle: one marker showing 3', grp.length === 1 && grp[0].text === '3', JSON.stringify(grp));
    ok('no two markers of the same kind on one candle', m.length === new Set(m.map(function (x) { return x.time + x.shape + x.position; })).size);
    // hover the merged marker with the real mouse: the box lists the three trades
    var bars = R().bars, gi = bars.findIndex(function (b) { return b.time === gt; });
    R().chart.timeScale().setVisibleLogicalRange({ from: gi - 30, to: gi + 30 }); await sleep(300);
    var rect = R().el.getBoundingClientRect(), x = rect.left + R().chart.timeScale().timeToCoordinate(gt), y0 = rect.top + R().series.priceToCoordinate(bars[gi].low), tipShown = false;
    // a sell's exit dot can sit below the same candle too: move down until the box shows the three buys
    for (var dy = 2; dy <= 60 && !tipShown; dy += 2) { await pp({ op: 'move', x: x, y: y0 + dy }); await sleep(70); tipShown = !!$('bt-mark-tip') && !$('bt-mark-tip').hidden && $('bt-mark-tip').querySelectorAll('.bt-mark-row').length === 3; }
    var tip = $('bt-mark-tip');
    ok('hover on a marker shows a box', tipShown);
    if (qp.get('shot') === 'chart') { R().chart.timeScale().setVisibleLogicalRange({ from: gi - 60, to: gi + 20 }); await sleep(200); await pp({ op: 'move', x: rect.left + R().chart.timeScale().timeToCoordinate(gt), y: y0 + 2 }); for (dy = 2; dy <= 60; dy += 2) { await pp({ op: 'move', x: rect.left + R().chart.timeScale().timeToCoordinate(gt), y: rect.top + R().series.priceToCoordinate(bars[gi].low) + dy }); await sleep(60); if ($('bt-mark-tip') && !$('bt-mark-tip').hidden && $('bt-mark-tip').querySelectorAll('.bt-mark-row').length === 3) break; } throw 'shot'; }
    if (tipShown) {
      var rows = tip.querySelectorAll('.bt-mark-row');
      ok('the box lists the three trades: direction and lot, entry → exit price, reason, P&L', rows.length === 3 && /0\.10/.test(rows[0].textContent) && /→/.test(rows[0].textContent) && /Manuel|Manual/.test(rows[0].textContent) && /\$/.test(rows[0].textContent), tip.textContent);
    }
    await pp({ op: 'move', x: rect.left + rect.width * 0.5, y: rect.top + 12 }); await sleep(150);
    ok('the box hides when the pointer leaves the marker', !tip || tip.hidden);
    // modes from the appearance drawer (every plan), stored
    await drawer('[data-marks="labels"]');
    ok('arrows and labels: entries say BUY/SELL and the lot, exits the reason', markers().some(function (x) { return /0\.10/.test(x.text); }) && markers().some(function (x) { return /Manuel|Manual/.test(x.text); }));
    ok('stored in the browser', JSON.parse(localStorage.getItem('ww_bt_look_v1')).marks === 'labels');
    $('bt-buy-btn').click(); await sleep(150);
    await drawer('[data-marks="open"]');
    ok('open positions only: one marker for the open trade', markers().length === 1 && markers()[0].shape === 'arrowUp');
    closeAll(); await sleep(150);
    await drawer('[data-marks="none"]');
    ok('hidden: no markers', markers().length === 0);
    await drawer('[data-marks="arrows"]');
    $('bt-look-btn').click(); await sleep(150);
    var tl = q('#bt-look-body [data-pref="tradeLines"]'); tl.click(); await sleep(250); $('bt-look-close').click();
    ok('entry-exit lines on: one segment per closed trade in view, green for profit, red for loss', JSON.parse(localStorage.getItem('ww_bt_look_v1')).tradeLines === true && R().tlSegs.length > 50 && R().tlSegs.some(function (s) { return s.win; }) && R().tlSegs.some(function (s) { return !s.win; }), R().tlSegs.length);
    ok('price axis hides a label that does not fit (no half label at the top)', R().chart.priceScale('right').options().entireTextOnly === true);
    // statistics: the balance curve uses the whole width, axis #10, #20 ...
    var texts = [], ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { texts.push(String(s)); return ft.apply(this, arguments); };
    if (!pro) { ok('free: no statistics window in the simple view', !document.querySelector('.bt-win[data-win="stats"]') || document.querySelector('.bt-win[data-win="stats"]').getBoundingClientRect().width === 0); throw 'shot'; }
    T().openWin('stats'); await waitFor(function () { return document.querySelectorAll('#bt-stats-view .bt-st-w').length >= 2; }, 8000, 'stats');
    if (qp.get('max') === '1') T().desk().act('stats', 'max');
    await sleep(900);
    CanvasRenderingContext2D.prototype.fillText = ft;
    var bc = T().stats().charts().filter(function (c) { return q('.bt-st-w[data-w="balance"]').contains(c.chartElement()); })[0];
    var ts = bc.timeScale(), wv = ts.width(), x0 = ts.timeToCoordinate(0), xN = ts.timeToCoordinate(n * window.WwBtStats.SEQ_STEP);
    ok('balance curve spans the whole width (first trade at the left, last at the right)', x0 !== null && xN !== null && x0 < wv * 0.05 && xN > wv * 0.95, [x0, xN, wv].join(' '));
    var ticks = texts.filter(function (s) { return /^#\d+$/.test(s); });
    ok('axis shows round trade numbers (#10 or #20 steps)', (ticks.indexOf('#10') >= 0 || ticks.indexOf('#20') >= 0) && ticks.every(function (s) { return +s.slice(1) % 5 === 0; }), ticks.slice(0, 12).join(' '));
    if (pro) {
      var rd = q('.bt-st-w[data-w="rdist"]').textContent, kp = q('.bt-st-w[data-w="kpis"]').textContent;
      ok('R distribution: how many trades have an R and why', /2 \/ (79|80)/.test(rd) && /(stop loss|Stop-Loss)/.test(rd), rd.slice(0, 160));
      ok('R distribution: few R values are flagged', /R verisi az|Few R values|Wenige R-Werte/.test(rd));
      ok('expectancy: dollars for all trades and R for the two with a stop loss on separate lines', /(79|80)/.test(kp) && /2 ?\/ ?(79|80)/.test(kp) && !!q('.bt-st-w[data-w="kpis"] .bt-st-sub'), kp.slice(0, 260));
    }
  } catch (e) { if (e !== 'shot') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
