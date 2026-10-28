// The drawing tools as their own window on the free desk (Premium = advanced mode), with REAL mouse and keyboard (window.__pp).
// Place next to the chart, move by the title bar, resize (the buttons reflow by the window's width), no maximize, close and reopen
// from the menu, the tools still draw, full screen and the simple view (free plan) keep the toolbar next to the chart. ?plan=premium|free
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp;
  function win(id) { return q('.bt-win[data-win="' + id + '"]'); }
  function vis(e) { if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }
  function rect(e) { return e.getBoundingClientRect(); }
  function mid(e) { var r = rect(e); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function headPt(id) { var r = rect(win(id).querySelector('.bt-win-head')); return { x: r.left + 12, y: r.top + r.height / 2 }; }
  function rzPt(id, h) { return mid(win(id).querySelector('.bt-win-rz[data-rz="' + h + '"]')); }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b) { await move(a); await pp({ op: 'down' }); await move(b, 10); await pp({ op: 'up' }); await sleep(250); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: a.x, y: a.y }, o || {})); await sleep(150); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(250); }
  function bar() { return $('bt-draw-bar'); }
  function btns() { return [].slice.call(bar().querySelectorAll('.bt-draw-btn')); }
  // every toolbar button is inside the visible part of its container (nothing cut off)
  function allShown(box) {
    var b = rect(box);
    return btns().every(function (x) { var r = rect(x); return r.width > 0 && r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; });
  }
  function rows() { var ys = {}; btns().forEach(function (x) { ys[Math.round(rect(x).top)] = 1; }); return Object.keys(ys).length; }
  function cols() { var xs = {}; btns().forEach(function (x) { xs[Math.round(rect(x).left)] = 1; }); return Object.keys(xs).length; }
  function inChart() { return bar().parentNode === q('#bt-chart-card .bt-chart-body'); }
  function pane() { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { l: r.left, t: r.top, w: ts.width(), h: e.clientHeight - ts.height() }; }
  function P(fx, fy) { var p = pane(); return { x: Math.round(p.l + p.w * fx), y: Math.round(p.t + p.h * fy) }; }
  function lay() { return T().desk().layout(); }
  function J(x) { return JSON.stringify(x); }
  async function menu(on) { if ($('bt-panels-pop').hidden === on) { $('bt-panels-btn').click(); await sleep(150); } }
  // draw a rectangle with the toolbar button, then drag the chart: the drawing is made and the chart still scrolls
  async function drawsAndScrolls(name) {
    var n0 = T().draw().set.list().length;
    await click(mid(bar().querySelector('[data-tool="rect"]')));
    await drag(P(0.55, 0.45), P(0.75, 0.7));
    var f0 = T().chart().timeScale().getVisibleLogicalRange().from;
    await drag(P(0.12, 0.08), P(0.3, 0.08));
    var f1 = T().chart().timeScale().getVisibleLogicalRange().from;
    ok(name + ': the rectangle tool draws, then the chart scrolls', T().draw().set.list().length === n0 + 1 && T().draw().tool() === 'cursor' && Math.abs(f1 - f0) > 3, n0 + ' ' + f0 + ' -> ' + f1);
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Draw window'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(500);

    if (!pro) {
      ok('simple view: no drawing tools window, the toolbar is next to the chart', $('bt-desk').getAttribute('data-desk') === 'simple' && !vis(win('draw')) && inChart() && !bar().hasAttribute('data-fit'));
      ok('simple view: every tool button shown', allShown(q('#bt-chart-card .bt-chart-body')) && btns().length >= 15, btns().length);
      await drawsAndScrolls('simple view');
      throw 'done';
    }

    // --- placed like the toolbar used to be: left of the chart, as tall, nothing cut off
    var dw = rect(win('draw')), cw = rect(win('chart'));
    ok('advanced: the toolbar is in its own window', $('bt-desk').getAttribute('data-desk') === 'free' && vis(win('draw')) && bar().parentNode === $('bt-draw-win-body') && bar().getAttribute('data-fit') === 'width');
    ok('window left of the chart, no overlap, as tall', dw.right <= cw.left && cw.left - dw.right <= 12 && Math.abs(dw.top - cw.top) <= 2 && Math.abs(dw.bottom - cw.bottom) <= 2, J([dw.left, dw.right, cw.left, dw.top, cw.top, dw.bottom, cw.bottom]));
    ok('every tool button shown in the window', allShown($('bt-draw-win-body')), cols() + ' cols ' + rows() + ' rows');
    ok('the chart window has no toolbar any more', !win('chart').querySelector('#bt-draw-bar'));
    ok('taskbar and window menu know the window', !!q('.bt-task[data-task="draw"]'));
    await menu(true);
    ok('window menu: drawing tools can be closed', !!q('#bt-panels-pop [data-win-toggle="draw"]') && q('#bt-panels-pop [data-win-toggle="draw"]').checked);
    await menu(false);
    await drawsAndScrolls('in the window');

    // --- move by the title bar, away from the chart
    var c0 = J(rect(win('chart')));
    var h = headPt('draw'), dr = $('bt-desk').getBoundingClientRect();
    await drag(h, { x: dr.left + dr.width * 0.5, y: dr.top + dr.height * 0.75 });
    var d1 = rect(win('draw'));
    ok('move: the window followed the title bar', Math.abs(d1.left - (dr.left + dr.width * 0.5 - 12)) <= 14 && d1.top > dw.top + 100, J([d1.left, d1.top]));
    ok('move: the chart stayed where it was', J(rect(win('chart'))) === c0);
    ok('move: buttons still all shown', allShown($('bt-draw-win-body')));
    await drawsAndScrolls('after moving the window');

    // --- no maximize, no snap
    await click(headPt('draw'), { count: 2 }); await sleep(150);
    ok('double click on the title does not maximize', lay().wins.draw.st === 'normal' && rect(win('draw')).width < 200);
    await drag(headPt('draw'), { x: dr.left + 4, y: dr.top + dr.height * 0.5 });
    ok('dropped at the left edge: no half-desk snap', rect(win('draw')).width < 200 && !vis(q('.bt-desk-preview')), rect(win('draw')).width);

    // --- wider: the buttons go into one or two rows; narrow: one column, still usable
    var e = rzPt('draw', 'e');
    await drag(e, { x: e.x + 700, y: e.y });
    ok('wide window: buttons in at most 2 rows, all shown', rows() <= 2 && allShown($('bt-draw-win-body')), rows() + ' rows, width ' + Math.round(rect(win('draw')).width));
    e = rzPt('draw', 'e');
    await drag(e, { x: e.x - 2000, y: e.y });
    ok('narrowest window: one column, minimum width kept', cols() === 1 && rect(win('draw')).width >= 46 && rect(win('draw')).width <= 50, cols() + ' cols, width ' + rect(win('draw')).width);
    ok('narrow: the tools still work', (await (async function () { await click(mid(bar().querySelector('[data-tool="trend"]'))); var t = T().draw().tool(); await press('Escape'); return t === 'trend'; })()));

    // --- close and reopen
    await click(mid(win('draw').querySelector('[data-win-act="close"]')));
    ok('close: window gone, the chart has no toolbar either', !vis(win('draw')) && !vis(bar()) && lay().wins.draw.closed === true);
    await press('2');
    ok('closed: the keyboard still picks tools', T().draw().tool() === 'hline', T().draw().tool()); await press('Escape');
    await menu(true);
    q('#bt-panels-pop [data-win-toggle="draw"]').click(); await sleep(250);
    await menu(false);
    var body = $('bt-draw-win-body');
    ok('reopened from the menu, as narrow as it was (the column scrolls)', vis(win('draw')) && bar().parentNode === body && rect(win('draw')).width < 50 && body.scrollHeight > body.clientHeight,
      rect(win('draw')).width + ' ' + body.scrollHeight + '/' + body.clientHeight);

    // --- full screen: the floating toolbar next to the chart; back: in the window again
    await press('f'); await sleep(400);
    ok('full screen: toolbar back with the chart and shown', $('bt-root').classList.contains('bt-fs') && inChart() && vis(bar()) && !bar().hasAttribute('data-fit'));
    await press('f'); await sleep(400);
    ok('full screen off: toolbar in its window again', !$('bt-root').classList.contains('bt-fs') && bar().parentNode === $('bt-draw-win-body') && vis(bar()));

    // --- the classic preset puts it back next to the chart
    await menu(true);
    q('#bt-panels-pop [data-preset="classic"]').click(); await sleep(300);
    await menu(false);
    dw = rect(win('draw')); cw = rect(win('chart'));
    ok('classic preset: back left of the chart', dw.right <= cw.left && cw.left - dw.right <= 12 && allShown($('bt-draw-win-body')));
  } catch (err) { if (err !== 'done') out.push('EXCEPTION ' + (err && err.stack || err)); }
  out.push('DONE');
  var el = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  el.textContent = out.join('\n');
})();
