// Multi-chart scenario (local backend). ?plan=premium|free, ?phone=1.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium', phone = qp.get('phone') === '1';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, D = window.WwBtDraw;
  function R() { return T().R(); }
  function replaySec() { return R().win.t[R().k] + 60; }
  function lastT(v) { return v.bars[v.bars.length - 1].time; }
  function prefs() { return JSON.parse(localStorage.getItem('ww_bt_layout_v1') || '{}'); }
  function pick(id) { $('bt-layout-btn').click(); $('bt-layout-pop').querySelector('[data-layout="' + id + '"]').click(); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv($('bt-f-name'), 'Multi'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && R().bars && R().bars.length; }, 40000, 'replay ready');
    for (var i = 0; i < 6; i++) { $('bt-step-btn').click(); await sleep(30); }
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(150);
    $('bt-layout-btn').click(); await sleep(50);
    var opts = $('bt-layout-pop').querySelectorAll('[data-layout]');
    ok('layout picker: five layouts', opts.length === 5 && !$('bt-layout-pop').hidden);
    if (!pro) {
      ok('free: PRO on the four multi-chart layouts', $('bt-layout-pop').querySelectorAll('.bt-pro').length === 4);
      $('bt-layout-pop').querySelector('[data-layout="2x2"]').click(); await sleep(100);
      ok('free: choosing 2x2 opens the upgrade window, one chart stays', window.__upgrade === true && $('bt-charts').getAttribute('data-layout') === '1' && document.querySelectorAll('.bt-cell').length === 1);
      throw 'done';
    }
    $('bt-layout-btn').click(); await sleep(30);
    pick('2x2'); await sleep(900);
    if (phone) {
      ok('phone: one chart, the choice is kept for a wide screen', $('bt-charts').getAttribute('data-layout') === '1' && document.querySelectorAll('.bt-cell').length === 1 && prefs().charts === '2x2');
      ok('phone: no horizontal page scroll', document.documentElement.scrollWidth <= window.innerWidth + 1);
      throw 'done';
    }
    var ex = R().extra;
    // advanced desk: every chart in its own window, the windows share the chart's area (bt-desk.js tileCharts)
    function wr(id) { return document.querySelector('.bt-win[data-win="' + id + '"]').getBoundingClientRect(); }
    var w1 = wr('chart'), w2 = wr('chart2'), w3 = wr('chart3');
    ok('2x2: four charts with canvases, each in its own window, tiled 2x2', document.querySelectorAll('.bt-cell').length === 4 && document.querySelectorAll('.bt-cell canvas').length >= 4 * 2 &&
      ex.every(function (v, i) { return document.querySelector('.bt-win[data-win="chart' + (i + 2) + '"]').contains(v.el); }) && Math.abs(w1.top - w2.top) <= 1 && Math.abs(w1.left - w3.left) <= 1 && w2.left > w1.right && w3.top > w1.bottom,
      JSON.stringify([w1.left, w1.top, w2.left, w2.top, w3.left, w3.top]));
    ok('extra charts: own timeframes 15m / 4h / 1d', ex.map(function (v) { return v.tfId; }).join(',') === '15m,4h,1d' && ex.every(function (v) { return v.tfSel.value === v.tfId; }));
    ok('layout stored', prefs().charts === '2x2', JSON.stringify(prefs()));
    ok('every chart has candles and none is later than the replay time', [R()].concat(ex).every(function (v) { return v.bars.length > 2 && lastT(v) < replaySec(); }), [R()].concat(ex).map(function (v) { return v.bars.length + ':' + (replaySec() - lastT(v)); }).join(' '));
    var m15last = lastT(ex[0]);
    for (i = 0; i < 4; i++) { $('bt-step-btn').click(); await sleep(40); }
    await sleep(200);
    ok('replay steps update the other charts too, still never ahead of the cursor', lastT(ex[0]) > m15last && [R()].concat(ex).every(function (v) { return lastT(v) < replaySec(); }));
    // a timeframe of an extra chart
    setv(ex[0].tfSel, '5m'); await sleep(400);
    ok('extra chart timeframe changes to M5 (candles rebuilt, stored)', ex[0].tfMin === 5 && (ex[0].bars[1].time - ex[0].bars[0].time) % 300 === 0 && prefs().tfs[0] === '5m', JSON.stringify(prefs().tfs));
    ok('M5 chart still not ahead of the cursor', lastT(ex[0]) < replaySec());
    // no time sync (owner, 2026-10-26): scrolling or zooming one chart, with the mouse, leaves the others where they are
    function ranges() { return ex.map(function (v) { var r = v.chart.timeScale().getVisibleLogicalRange(); return Math.round(r.from) + ':' + Math.round(r.to); }).join(' '); }
    var before = ranges(), ts = R().chart.timeScale(), vr = ts.getVisibleLogicalRange(), box = R().el.getBoundingClientRect();
    var mx = box.left + box.width / 2, my = box.top + box.height / 2, tgt = document.elementFromPoint(mx, my);
    tgt.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: mx, clientY: my, deltaY: -300 })); await sleep(150);
    ts.setVisibleLogicalRange({ from: vr.from - 60, to: vr.to - 60 }); await sleep(250);
    var r1 = ts.getVisibleLogicalRange();
    ok('main chart moved, the other charts did not', Math.abs(r1.from - vr.from) > 10 && ranges() === before, before + ' -> ' + ranges());
    var er = ex[0].chart.timeScale().getVisibleLogicalRange(), mr = ts.getVisibleLogicalRange();
    ex[0].chart.timeScale().setVisibleLogicalRange({ from: er.from - 40, to: er.to - 40 }); await sleep(250);
    var mr2 = ts.getVisibleLogicalRange();
    ok('moving an extra chart leaves the main chart where it is', Math.abs(mr2.from - mr.from) < 0.5 && Math.abs(mr2.to - mr.to) < 0.5);
    // crosshair sync: the main chart's crosshair (time + price) is drawn on the other charts (read back from their top canvas)
    function topInk(v) {
      var cs = v.el.querySelectorAll('table td canvas'), top = cs[1]; if (!top) return -1;
      var d = top.getContext('2d').getImageData(0, 0, top.width, top.height).data, n = 0;
      for (var q = 3; q < d.length; q += 16) if (d[q] > 0) n++;
      return n;
    }
    // every chart centred on the cursor first (R), so the crosshair time lies inside the narrowest chart's range
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); await sleep(250);
    var mb = R().bars, pt = { x: 100, y: R().series.priceToCoordinate(mb[mb.length - 3].close) };
    T().cross({ time: mb[mb.length - 3].time, point: pt, logical: mb.length - 3 }); await sleep(150);
    var inked = ex.map(topInk);
    T().cross({ time: undefined, point: undefined }); await sleep(150);
    var cleared = ex.map(topInk);
    ok('crosshair sync: drawn on every other chart, cleared when the pointer leaves', inked.every(function (n) { return n > 20; }) && cleared.every(function (n) { return n === 0; }), JSON.stringify([inked, cleared]));
    // drawings show on every chart (one shared set, one layer per chart)
    ok('drawing layers on every chart', [R()].concat(ex).every(function (v) { return !!v.layer; }));
    // 1+3
    pick('1+3'); await sleep(500);
    var b1 = wr('chart'), b2 = wr('chart2'), b4 = wr('chart4');
    ok('1+3: four chart windows, the big one as tall as the three others', document.querySelectorAll('.bt-cell').length === 4 && Math.abs(b1.top - b2.top) <= 1 && Math.abs(b1.bottom - b4.bottom) <= 1 && b2.left > b1.right, JSON.stringify([b1.top, b1.bottom, b2.top, b4.bottom]));
    // full screen: the charts share one grid again (the big one spans three rows)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true })); await sleep(400);
    ok('full screen: one grid of four charts, the big one spans three rows', $('bt-charts').getAttribute('data-layout') === '1+3' && $('bt-charts').querySelectorAll('.bt-cell').length === 4 && getComputedStyle(document.querySelector('.bt-cell-main')).gridRowEnd === '4');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(400);
    ok('out of full screen: the charts are back in their windows', ex.every(function (v, i) { return document.querySelector('.bt-win[data-win="chart' + (i + 2) + '"]').contains(v.el); }));
    pick('2h'); await sleep(400);
    ok('2 side by side: two charts', document.querySelectorAll('.bt-cell').length === 2 && R().extra.length === 1);
    // simple mode: one chart; back to advanced: the layout returns
    document.querySelector('[data-bt-mode="simple"]').click(); await sleep(300);
    ok('simple mode shows one chart', document.querySelectorAll('.bt-cell').length === 1 && $('bt-charts').getAttribute('data-layout') === '1');
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(400);
    ok('advanced again: the stored layout returns', document.querySelectorAll('.bt-cell').length === 2);
    // reopen
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    ok('back to the list removes the extra charts', document.querySelectorAll('.bt-cell').length === 1);
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && document.querySelectorAll('.bt-cell').length === 2; }, 30000, 'reopen with layout');
    ok('reopened account: layout and timeframe kept', R().extra.length === 1 && R().extra[0].tfId === '5m', R().extra.map(function (v) { return v.tfId; }));
    // timeframe of the main chart keeps the extra views intact
    setv($('bt-tf'), '4h'); await waitFor(function () { return R().tfMin === 240; }, 10000, 'H4'); await sleep(800);
    ok('main H4: extra M5 chart unchanged and not ahead', R().extra[0].tfMin === 5 && lastT(R().extra[0]) < replaySec() && lastT(R()) < replaySec());
  } catch (e) { if (e !== 'done') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
