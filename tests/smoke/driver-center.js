// The chart stays filled (2026-11-21 report: the wheel squeezed the candles into the right corner of an empty chart while the
// months before the window were still loading). cTrader EURUSD H1 at 09.11.2026 15:18 with slow month downloads (?delay=ms).
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  var R = function () { return window.__btTest.R(); };
  var qp = new URLSearchParams(location.search), delay = +(qp.get('delay') || 3000);
  var f0 = window.fetch;
  window.fetch = async function (u, init) { if (String(u).indexOf('ctrader-candles') >= 0 && /"month"/.test(init && init.body || '')) await sleep(delay); return f0(u, init); };
  function view() { var v = R(), r = v.chart.timeScale().getVisibleLogicalRange(); return { from: r.from, to: r.to, n: v.bars.length }; }
  function txt(a) { return JSON.stringify({ from: +a.from.toFixed(1), to: +a.to.toFixed(1), n: a.n }); }
  function center() { var rc = R().el.getBoundingClientRect(); return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2, w: rc.width }; }
  async function wheel(dy, times) { var c = center(); for (var z = 0; z < times; z++) await window.__pp({ op: 'wheel', x: c.x, y: c.y, dy: dy }); await sleep(300); }
  // empty space at most the right margin (6 candles) plus a candle of rounding on either side
  function filled(a) { return a.from >= -1.5 && a.to <= a.n - 1 + 6 + 1 && a.to >= a.n - 1; }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && window.__db; }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0; }, 15000, 'ct panel');
    setv('bt-f-tf', '1h'); setv('bt-f-name', 'center');
    setv('bt-f-start', '2026-11-09T15:18');
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R() && R().chart && R().chart.timeScale().getVisibleLogicalRange(); }, 60000, 'replay ready');
    await sleep(300);
    var a0 = view();
    ok('opened: about 100 candles with the cursor candle on the right', a0.to - a0.from > 80 && a0.to >= a0.n - 1 && a0.to <= a0.n + 7, txt(a0));
    ok('history still loading during the zoom test', !R().hist);

    await wheel(300, 25);
    var a1 = view();
    ok('zoomed out while history loads: every candle shown, no empty chart around them', filled(a1) && a1.from <= 1, txt(a1));


    await waitFor(function () { return !!R().hist; }, 60000, 'history');
    await sleep(500);
    var a3 = view();
    ok('history loaded: the view keeps its candles (shifted by the added history)', a3.n > a1.n + 500 && a3.to >= a3.n - 1 - 1 && a3.to <= a3.n + 7, txt(a3));
    await wheel(300, 25);
    var a4 = view();
    ok('history loaded: zooming out goes further back', a4.to - a4.from > (a3.to - a3.from) + 100, txt(a4));
    ok('history loaded: still no empty space on either side', a4.from >= -1.5 && a4.to <= a4.n + 7 && a4.to >= a4.n - 1, txt(a4));

    var before = view();
    await wheel(-200, 6);
    var a5 = view();
    ok('zooming in keeps the right edge (cursor candle stays in place)', Math.abs(a5.to - before.to) < 2 && a5.to - a5.from < before.to - before.from, txt(before) + ' -> ' + txt(a5));

    for (var i = 0; i < 30; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(300);
    var a6 = view();
    ok('stepping on: the new candles stay in view', a6.to >= a6.n - 1, txt(a6));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
