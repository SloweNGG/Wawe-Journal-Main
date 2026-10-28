// Horizontal line length modes with REAL mouse and keyboard (window.__pp): full (default), ray to the right, segment with two ends.
// Settings window (double click) switches the mode, the last mode is used for the next line, segment ends drag, undo, the chart still
// scrolls. ?plan=premium|free (the horizontal line is a free tool)
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, D = window.WwBtDraw, pp = window.__pp;
  function list() { return T().draw().set.list(); }
  function lastD() { var l = list(); return l[l.length - 1]; }
  function get(id) { return T().draw().set.get(id); }
  function sel() { return T().draw().set.selected(); }
  function pane() { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { l: r.left, t: r.top, w: ts.width(), h: e.clientHeight - ts.height() }; }
  function P(fx, fy) { var p = pane(); return { x: Math.round(p.l + p.w * fx), y: Math.round(p.t + p.h * fy) }; }
  function xy(t, p) {
    var ch = T().chart(), ts = ch.timeScale(), bars = T().bars(), tf = T().tfSec(), x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1), r = $('bt-chart').getBoundingClientRect();
    return { x: r.left + x0 + D.timeToLogical(bars, tf, t) * (x1 - x0), y: r.top + T().series().priceToCoordinate(p) };
  }
  function bars(d) { var b = T().bars(), tf = T().tfSec(); return D.timeToLogical(b, tf, d.pts[1].t) - D.timeToLogical(b, tf, d.pts[0].t); }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b) { await move(a); await pp({ op: 'down' }); await move(b, 8); await pp({ op: 'up' }); await sleep(150); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: a.x, y: a.y }, o || {})); await sleep(150); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  async function chord(mod, k) { await pp({ op: 'key', key: mod, type: 'down' }); await press(k); await pp({ op: 'key', key: mod, type: 'up' }); await sleep(100); }
  // a tool's button, or the menu of the group it is in (the toolbar groups lines and positions on one button each)
  function pickTool(id) {
    var b = document.querySelector('#bt-draw-bar [data-tool="' + id + '"]');
    if (b) return b.click();
    document.querySelector('#bt-draw-bar [data-tools~="' + id + '"] [data-more]').click();
    document.querySelector('.bt-draw-fly [data-fly-tool="' + id + '"]').click();
  }
  async function tool(id) { if (T().draw().tool() !== id) pickTool(id); await sleep(80); }
  function J(x) { return JSON.stringify(x); }
  // settings window of the drawing at `a` (double click), then a length button
  async function mode(a, v) {
    await click(a, { count: 2 }); await sleep(150);
    var b = q('.bt-dset [data-extend="' + v + '"]');
    if (!b) return false;
    b.click(); await sleep(150);
    await press('Escape');
    return true;
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Hline modes'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(400);
    T().chart().timeScale().setVisibleLogicalRange({ from: T().bars().length - 80, to: T().bars().length + 5 }); await sleep(250);

    // --- full (default)
    await tool('hline'); await click(P(0.5, 0.4));
    var h = lastD(), y = P(0.5, 0.4).y;
    ok('new horizontal line: full width, one point', h.tool === 'hline' && !h.extend && h.pts.length === 1, J(h));
    await click(P(0.05, 0.9)); await click(P(0.08, 0.4));
    ok('full: grabbed at the far left', sel() === h.id);

    // --- the settings window has the length buttons
    await click(P(0.5, 0.4), { count: 2 }); await sleep(150);
    var btns = [].map.call(document.querySelectorAll('.bt-dset [data-extend]'), function (b) { return b.getAttribute('data-extend') + ':' + b.getAttribute('aria-pressed'); });
    ok('settings: three length buttons, Full pressed', btns.join() === 'both:true,right:false,none:false', btns.join());
    await press('Escape');

    // --- ray to the right: nothing left of the start
    ok('mode Right chosen', await mode(P(0.5, 0.4), 'right'));
    h = get(h.id);
    ok('right: one point, extend right', h.extend === 'right' && h.pts.length === 1, J(h));
    await click(P(0.05, 0.9)); await click(P(0.2, 0.4));
    ok('right: nothing left of the start', sel() !== h.id);
    await click(P(0.85, 0.4));
    ok('right: grabbed right of the start', sel() === h.id);

    // --- segment: two ends, 20 bars by default
    ok('mode Segment chosen', await mode(P(0.85, 0.4), 'none'));
    h = get(h.id);
    ok('segment: two points on one price, ' + D.SEG_BARS + ' bars long', h.extend === 'none' && h.pts.length === 2 && h.pts[1].p === h.pts[0].p && Math.abs(bars(h) - D.SEG_BARS) < 0.01, J(h));
    var endPx = xy(h.pts[1].t, h.pts[1].p);
    await click(P(0.05, 0.9)); await click({ x: endPx.x + 40, y: y });
    ok('segment: nothing past its end', sel() !== h.id);
    // drag the end handle: longer, same price
    await click({ x: (xy(h.pts[0].t, h.pts[0].p).x + endPx.x) / 2, y: y });
    ok('segment: selected in the middle', sel() === h.id);
    var p0 = h.pts[0].p;
    await drag(endPx, { x: endPx.x + 120, y: endPx.y - 60 });
    var h2 = get(h.id);
    ok('end handle: longer, price unchanged', h2.pts[1].t > h.pts[1].t && h2.pts[0].p === p0 && h2.pts[1].p === p0 && h2.pts[0].t === h.pts[0].t, J(h2));
    // the start handle: moves the price of both ends
    var s0 = xy(h2.pts[0].t, p0);
    await drag(s0, { x: s0.x - 30, y: s0.y + 50 });
    var h3 = get(h.id);
    ok('start handle: new start and price, the end follows the price', h3.pts[0].t < h2.pts[0].t && h3.pts[0].p !== p0 && h3.pts[1].p === h3.pts[0].p && h3.pts[1].t === h2.pts[1].t, J(h3));

    // --- undo goes back step by step
    await chord('Control', 'z');
    ok('undo: the start drag is undone', J(get(h.id).pts) === J(h2.pts));

    // --- the last mode is used for the next line: segment drawn by dragging, end on the start's price
    await tool('hline');
    await drag(P(0.3, 0.7), P(0.6, 0.75));
    var g = lastD();
    ok('next line in segment mode: drawn by dragging, two points on one price', g.id !== h.id && g.extend === 'none' && g.pts.length === 2 && g.pts[1].p === g.pts[0].p && g.pts[1].t > g.pts[0].t, J(g));
    await tool('hline');
    await click(P(0.2, 0.85)); await move(P(0.4, 0.8), 5); await click(P(0.4, 0.8));
    g = lastD();
    ok('segment mode: two clicks work too', g.extend === 'none' && g.pts.length === 2 && g.pts[1].t > g.pts[0].t, J(g));

    // --- back to full: one point again
    ok('mode Full chosen', await mode(P(0.3, 0.85), 'both'));
    g = get(g.id);
    ok('full again: one point, no extend', g.pts.length === 1 && !g.extend, J(g));
    await tool('hline'); await click(P(0.5, 0.2));
    ok('next line full again', !lastD().extend && lastD().pts.length === 1);

    // --- the chart still scrolls
    var f0 = T().chart().timeScale().getVisibleLogicalRange().from;
    await click(P(0.05, 0.95)); await drag(P(0.1, 0.05), P(0.3, 0.05));
    ok('the chart still scrolls', Math.abs(T().chart().timeScale().getVisibleLogicalRange().from - f0) > 3);
    // screenshot run: the settings window of the segment open
    if (/[?&]shot=1/.test(location.search)) { var hh = get(h.id), mm = xy((hh.pts[0].t + hh.pts[1].t) / 2, hh.pts[0].p); await click(mm, { count: 2 }); await sleep(300); }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var el = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  el.textContent = out.join('\n');
})();
