// BTCUSD (cTrader, real 1m data via ?ctdata=1) H1: trades in a later month, then back to 10.07.2019 (section 2). The price axis must
// cover the candles of the new section and the chart must show them (2026-10-25 report: axis at minus billions, empty chart).
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  var R = function () { return window.__btTest.R(); };
  function toInput(sec) { var p = function (n) { return (n < 10 ? '0' : '') + n; }, x = window.WwTime.partsInTz(sec * 1000, window.WwTime.getTz()); return x.y + '-' + p(x.m) + '-' + p(x.d) + 'T' + p(x.H) + ':' + p(x.Mi); }
  async function trade(dir, steps) {
    (dir > 0 ? $('bt-buy-btn') : $('bt-sell-btn')).click(); await sleep(200);
    for (var i = 0; i < steps; i++) { $('bt-step-btn').click(); await sleep(40); }
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(400);
  }
  // what the main chart shows: price axis range, visible logical range against the bars, candles inside the visible range
  function axis(v) {
    v = v || R();
    var s = v.series, ch = v.chart, h = v.el.clientHeight - ch.timeScale().height();
    var top = s.coordinateToPrice(4), bot = s.coordinateToPrice(h - 4), r = ch.timeScale().getVisibleLogicalRange();
    var n = v.bars.length, from = r ? Math.max(0, Math.ceil(r.from)) : 0, to = r ? Math.min(n - 1, Math.floor(r.to)) : -1, lo = Infinity, hi = -Infinity;
    for (var i = from; i <= to; i++) { lo = Math.min(lo, v.bars[i].low); hi = Math.max(hi, v.bars[i].high); }
    return { top: top, bot: bot, from: r && r.from, to: r && r.to, n: n, shown: Math.max(0, to - from + 1), lo: lo, hi: hi, last: n ? v.bars[n - 1] : null };
  }
  function good(a) { return a.shown > 20 && a.top > a.hi * 0.98 && a.bot < a.lo * 1.02 && a.bot > 0 && a.lo > 0 && a.top < a.hi * 1.5; }
  function txt(a) { return JSON.stringify({ top: a.top, bot: a.bot, from: a.from, to: a.to, n: a.n, shown: a.shown, lo: a.lo, hi: a.hi }); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && window.__db; }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-symbol', 'BTCUSDT'); await sleep(300);
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && /2019/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel');
    setv('bt-f-tf', '1h'); setv('bt-f-name', 'BTC repro'); setv('bt-f-spread', '10.00');
    setv('bt-f-start', toInput(Date.UTC(2026, 7, 3, 10) / 1000));
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R(); }, 60000, 'replay ready'); await sleep(1500);
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(300);
    var qp = new URLSearchParams(location.search);
    if (qp.get('style') || qp.get('vol')) {
      $('bt-look-btn').click(); await sleep(200);
      if (qp.get('style')) { document.querySelector('#bt-look-body [data-style="' + qp.get('style') + '"]').click(); await sleep(300); }
      if (qp.get('vol')) { var sw = document.querySelector('#bt-look-body [data-switch="showVolume"]'); if (!sw.checked) { sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true })); } await sleep(300); }
      $('bt-look-close').click(); await sleep(100);
    }
    if (qp.get('multi')) { $('bt-layout-btn').click(); await sleep(100); document.querySelector('#bt-layout-pop [data-layout="' + qp.get('multi') + '"]').click(); await sleep(800); }
    for (var i = 0; i < 40; i++) { $('bt-step-btn').click(); await sleep(25); }
    await trade(1, 5); await trade(-1, 4);
    // a drawing of section 1 (a trend line in 2026 prices) and the user scrolled away a little
    var D = window.__btTest.draw(); D.set.add({ id: 'tr1', tool: 'trend', pts: [{ t: R().bars[R().bars.length - 30].time, p: R().bars[R().bars.length - 30].close }, { t: R().bars[R().bars.length - 2].time, p: R().bars[R().bars.length - 2].close * 1.01 }] });
    D.set.add({ id: 'hl1', tool: 'hline', pts: [{ t: R().bars[R().bars.length - 5].time, p: R().bars[R().bars.length - 5].high }] });
    if (qp.get('scroll')) { R().chart.timeScale().scrollToPosition(+qp.get('scroll'), false); }
    if (qp.get('pz')) { R().chart.priceScale('right').applyOptions({ autoScale: false }); }
    await sleep(300);
    var a1 = axis(); if (!qp.get('scroll') && !qp.get('pz')) ok('section 1: the axis covers the visible candles', good(a1), txt(a1));
    // back to 10.07.2019
    setv('bt-goto-input', toInput(Date.UTC(2019, 6, 10, 0) / 1000)); $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-back-modal').classList.contains('active'); }, 5000, 'back modal');
    $('bt-back-continue').click();
    await waitFor(function () { return R().acc.sectionNo === 2 && $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().hist && R().win.t[R().k] < Date.UTC(2020, 0, 1) / 1000; }, 60000, 'section 2');
    await sleep(800);
    var a2 = axis();
    ok('section 2: legend open is the 2019 price', a2.last && a2.last.open > 9000 && a2.last.open < 14000, JSON.stringify(a2.last));
    ok('section 2: the chart shows candles', a2.shown > 20, txt(a2));
    ok('section 2: the axis covers the visible candles (no minus billions)', good(a2), txt(a2));
    ok('section 2: the cursor candle is on the right of the view', a2.to >= a2.n - 1 && a2.from <= a2.n - 1, txt(a2));
    (R().extra || []).forEach(function (v, i) { var ax = axis(v); ok('extra chart ' + i + ' axis', good(ax), txt(ax)); });
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
