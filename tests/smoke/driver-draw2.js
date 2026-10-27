// Drawing tools with REAL mouse and keyboard input (window.__pp from run.mjs: puppeteer's trusted events through the browser,
// the same path as a user's hand). Every tool: create (drag and two clicks), select, move, handles, Shift, Esc, undo/redo,
// delete, settings window (double / right click), text in place, magnet, and the place after a timeframe change, replay steps
// and full screen. ?plan=premium (all tools) or free (trend, horizontal line, rectangle).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, D = window.WwBtDraw, pp = window.__pp;
  function list() { return T().draw().set.list(); }
  function lastD() { var l = list(); return l[l.length - 1]; }
  function sel() { return T().draw().set.selected(); }
  function pane() { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { l: r.left, t: r.top, w: ts.width(), h: e.clientHeight - ts.height() }; }
  function P(fx, fy) { var p = pane(); return { x: Math.round(p.l + p.w * fx), y: Math.round(p.t + p.h * fy) }; }
  // client coordinates of a (time, price) point, computed like the drawing layer does
  function xy(t, p) {
    var ch = T().chart(), ts = ch.timeScale(), bars = T().bars(), tf = T().tfSec(), x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1), r = $('bt-chart').getBoundingClientRect();
    return { x: r.left + x0 + D.timeToLogical(bars, tf, t) * (x1 - x0), y: r.top + T().series().priceToCoordinate(p) };
  }
  function box(d) { var a = xy(d.pts[0].t, d.pts[0].p), b = xy(d.pts[1].t, d.pts[1].p); return { l: Math.min(a.x, b.x), r: Math.max(a.x, b.x), t: Math.min(a.y, b.y), b: Math.max(a.y, b.y) }; }
  function near(a, b, e) { return Math.abs(a - b) <= (e == null ? 1.5 : e); }
  function nearPt(a, b, e) { return near(a.x, b.x, e) && near(a.y, b.y, e); }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b, mid) { await move(a); await pp({ op: 'down' }); await move(b, 8); if (mid) await mid(); await pp({ op: 'up' }); await sleep(120); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: a.x, y: a.y }, o || {})); await sleep(140); }
  async function keyDown(k) { await pp({ op: 'key', key: k, type: 'down' }); }
  async function keyUp(k) { await pp({ op: 'key', key: k, type: 'up' }); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(60); }
  async function chord(mods, k) { for (var i = 0; i < mods.length; i++) await keyDown(mods[i]); await press(k); for (i = mods.length - 1; i >= 0; i--) await keyUp(mods[i]); await sleep(80); }
  // pick a tool (the toolbar button toggles, so it is only clicked when another tool is active)
  async function tool(id) { if (T().draw().tool() !== id) document.querySelector('#bt-draw-bar [data-tool="' + id + '"]').click(); await sleep(60); }
  async function type(s) { await pp({ op: 'type', text: s }); await sleep(60); }
  function cursorAt(a) { var e = document.elementFromPoint(a.x, a.y); return e ? getComputedStyle(e).cursor : ''; }
  function J(x) { return JSON.stringify(x); }
  // canvas text recorder (labels of the position and measure tools are drawn on the chart canvas)
  var texts = [], ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s) { if (texts.length < 4000) texts.push(String(s)); return ft.apply(this, arguments); };
  async function drawnTexts() { texts = []; T().draw().set.redraw(); await sleep(150); return texts.join(' | '); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Draw real'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(400);
    T().chart().timeScale().setVisibleLogicalRange({ from: T().bars().length - 80, to: T().bars().length + 5 }); await sleep(250);

    // ---------------- rectangle
    await tool('rect');
    ok('rect tool: crosshair over the chart', cursorAt(P(0.5, 0.5)) === 'crosshair', cursorAt(P(0.5, 0.5)));
    var A = P(0.62, 0.72), B = P(0.38, 0.28);
    await drag(A, B);                                                    // bottom-right -> top-left
    var r1 = lastD();
    ok('rect: drawn from the bottom-right corner to the top-left', list().length === 1 && r1.tool === 'rect' && sel() === r1.id && T().draw().tool() === 'cursor', J(r1));
    var b1 = box(r1);
    ok('rect: corners where the mouse went down and up', near(b1.l, B.x, 2) && near(b1.r, A.x, 2) && near(b1.t, B.y, 2) && near(b1.b, A.y, 2), J(b1) + ' A ' + J(A) + ' B ' + J(B));
    await tool('rect'); var C1 = P(0.80, 0.25), C2 = P(0.92, 0.6);   // clear of the first rectangle after its handles widen it
    await click(C1); await move(C2, 5); await click(C2);                // two clicks, top-left -> bottom-right
    var r2 = lastD(), b2 = box(r2);
    ok('rect: two clicks (click, move, click)', list().length === 2 && r2.tool === 'rect' && near(b2.l, C1.x, 2) && near(b2.b, C2.y, 2), J(b2));
    await tool('rect'); var S1 = P(0.12, 0.2), S2 = P(0.24, 0.42);   // small: it must not cover the first rectangle in the taller simple view either
    await keyDown('Shift'); await drag(S1, S2); await keyUp('Shift');
    var r3 = lastD(), b3 = box(r3);
    ok('rect + Shift: a square on screen', near(b3.r - b3.l, b3.b - b3.t, 1.5) && b3.r - b3.l > 40, J(b3));
    // the eight handles
    await click({ x: (b1.l + b1.r) / 2, y: (b1.t + b1.b) / 2 });
    ok('click inside a filled rectangle selects it', sel() === r1.id, sel());
    var eh = { x: b1.r, y: (b1.t + b1.b) / 2 };
    await move({ x: eh.x, y: eh.y }); await sleep(40);
    ok('cursor: right edge handle shows ew-resize', cursorAt(eh) === 'ew-resize', cursorAt(eh));
    await move({ x: b1.l + 30, y: b1.t + 30 }); await sleep(40);
    ok('cursor: inside the selected box shows move', cursorAt({ x: b1.l + 30, y: b1.t + 30 }) === 'move', cursorAt({ x: b1.l + 30, y: b1.t + 30 }));
    await move({ x: b1.l, y: b1.t }); await sleep(40);
    ok('cursor: corner handle shows nwse-resize', cursorAt({ x: b1.l, y: b1.t }) === 'nwse-resize', cursorAt({ x: b1.l, y: b1.t }));
    await drag(eh, { x: eh.x + 40, y: eh.y + 25 });
    var b1e = box(list()[0]);
    ok('handle e: only the right edge moved', near(b1e.r, b1.r + 40, 2) && near(b1e.l, b1.l) && near(b1e.t, b1.t) && near(b1e.b, b1.b), J(b1e));
    var nh = { x: (b1e.l + b1e.r) / 2, y: b1e.t };
    await drag(nh, { x: nh.x + 30, y: nh.y - 30 });
    var b1n = box(list()[0]);
    ok('handle n: only the top edge moved', near(b1n.t, b1e.t - 30, 2) && near(b1n.l, b1e.l) && near(b1n.r, b1e.r) && near(b1n.b, b1e.b), J(b1n));
    await drag({ x: b1n.l, y: b1n.b }, { x: b1n.l - 25, y: b1n.b + 20 });
    var b1s = box(list()[0]);
    ok('handle sw: left and bottom moved', near(b1s.l, b1n.l - 25, 2) && near(b1s.b, b1n.b + 20, 2) && near(b1s.r, b1n.r) && near(b1s.t, b1n.t), J(b1s));
    await keyDown('Shift'); await drag({ x: b1s.r, y: b1s.b }, { x: b1s.r + 10, y: b1s.b + 60 }); await keyUp('Shift');
    var b1q = box(list()[0]);
    ok('corner + Shift: square on screen, opposite corner fixed', near(b1q.r - b1q.l, b1q.b - b1q.t, 1.5) && near(b1q.l, b1s.l) && near(b1q.t, b1s.t), J(b1q));
    // move the body, Esc while moving puts it back
    var before = J(list()[0].pts), mid0 = { x: (b1q.l + b1q.r) / 2, y: (b1q.t + b1q.b) / 2 };
    await drag(mid0, { x: mid0.x - 50, y: mid0.y + 20 });
    var bm = box(list()[0]);
    ok('drag inside: the whole rectangle moved', near(bm.l, b1q.l - 50, 2) && near(bm.t, b1q.t + 20, 2) && near(bm.r - bm.l, b1q.r - b1q.l, 2), J(bm));
    var moved = J(list()[0].pts), mid1 = { x: (bm.l + bm.r) / 2, y: (bm.t + bm.b) / 2 };
    await drag(mid1, { x: mid1.x + 80, y: mid1.y }, async function () { await press('Escape'); });
    ok('Esc while moving: back where it was, nothing changed', J(list()[0].pts) === moved, J(list()[0].pts));
    // undo / redo with the keyboard
    await chord(['Control'], 'z');
    ok('Ctrl+Z: the move is undone', J(list()[0].pts) === before, J(list()[0].pts));
    await chord(['Control', 'Shift'], 'z');
    ok('Shift+Ctrl+Z: the move is redone', J(list()[0].pts) === moved);
    await chord(['Meta'], 'z');
    ok('Cmd+Z works too (macOS)', J(list()[0].pts) === before);
    await chord(['Meta', 'Shift'], 'z');
    ok('Shift+Cmd+Z redoes', J(list()[0].pts) === moved);
    // Esc while creating: nothing stays (no ghost)
    var n0 = list().length;
    await tool('rect');
    await drag(P(0.2, 0.85), P(0.35, 0.95), async function () { await press('Escape'); });
    ok('Esc while drawing: no new drawing, no draft left', list().length === n0 && !T().draw().busy(), list().length + ' busy ' + T().draw().busy());
    await tool('rect'); await click(P(0.2, 0.85)); await move(P(0.3, 0.9), 4); await press('Escape');
    ok('Esc between the two clicks: cancelled', list().length === n0 && !T().draw().busy() && T().draw().tool() === 'rect');
    await press('Escape');
    ok('second Esc: back to the cursor', T().draw().tool() === 'cursor');
    // delete + undo
    await click(mid1); var delId = sel();
    await press('Delete');
    ok('Del deletes the selected drawing', !T().draw().set.get(delId) && list().length === n0 - 1);
    await chord(['Control'], 'z');
    ok('Ctrl+Z brings it back at its place in the stack', T().draw().set.get(delId) && list()[0].id === delId);

    // ---------------- settings window of a rectangle: fill, opacity; without fill only the border is grabbed
    var rr = T().draw().set.get(r1.id), rb = box(rr);
    await click({ x: (rb.l + rb.r) / 2, y: (rb.t + rb.b) / 2 }, { count: 2 });
    pop = document.querySelector('.bt-dset');
    ok('double click on a rectangle opens its settings with fill and opacity', !!pop && !!pop.querySelector('[data-k="fill"]') && !!pop.querySelector('[data-k="opacity"]'));
    var rg = pop.querySelector('[data-k="opacity"]'); rg.value = '50'; rg.dispatchEvent(new Event('input', { bubbles: true })); rg.dispatchEvent(new Event('change', { bubbles: true })); await sleep(60);
    ok('opacity 50%', T().draw().set.get(r1.id).opacity === 0.5, J(T().draw().set.get(r1.id)));
    document.querySelector('.bt-dset [data-k="fill"]').click(); await sleep(60);
    ok('fill off', T().draw().set.get(r1.id).fill === false);
    await click(P(0.02, 0.05));
    ok('click outside closes the settings window', !document.querySelector('.bt-dset'));
    rb = box(T().draw().set.get(r1.id));
    await click({ x: (rb.l + rb.r) / 2, y: (rb.t + rb.b) / 2 });
    ok('rectangle without fill: a click inside does not select it', sel() !== r1.id);
    await click({ x: rb.r - 2, y: (rb.t + rb.b) / 2 });
    ok('rectangle without fill: a click on its border selects it', sel() === r1.id, sel());

    // ---------------- trend line and ray (every plan: the drawing tools are free since 2026-10-26)
    var lines = ['trend', 'ray'];
    for (var li = 0; li < lines.length; li++) {
      var tl = lines[li];
      await tool(tl); var L1 = P(0.2, 0.5), L2 = P(0.45, 0.53);
      await keyDown('Shift'); await drag(L1, L2); await keyUp('Shift');
      var d = lastD();
      ok(tl + ' + Shift near flat: exactly horizontal (same price)', d.tool === tl && d.pts[1].p === d.pts[0].p, J(d.pts));
      await tool(tl); var L3 = P(0.5, 0.3), L4 = P(0.52, 0.7);
      await keyDown('Shift'); await drag(L3, L4); await keyUp('Shift');
      d = lastD();
      ok(tl + ' + Shift near vertical: exactly vertical (same time)', d.pts[1].t === d.pts[0].t, J(d.pts));
      await tool(tl); var L5 = P(0.55, 0.3), L6 = { x: L5.x + 100, y: L5.y + 85 };
      await keyDown('Shift'); await drag(L5, L6); await keyUp('Shift');
      d = lastD(); var a5 = xy(d.pts[0].t, d.pts[0].p), a6 = xy(d.pts[1].t, d.pts[1].p);
      ok(tl + ' + Shift near 45°: 45° on screen', near(a6.x - a5.x, a6.y - a5.y, 1.5), J([a6.x - a5.x, a6.y - a5.y]));
      // both ends, one at a time
      var p0 = J(d.pts[0]);
      await drag(a6, { x: a6.x + 30, y: a6.y - 40 });
      d = list().filter(function (x) { return x.id === d.id; })[0];
      ok(tl + ': end handle moves only the end', J(d.pts[0]) === p0 && nearPt(xy(d.pts[1].t, d.pts[1].p), { x: a6.x + 30, y: a6.y - 40 }, 2), J(d.pts));
      var p1 = J(d.pts[1]);
      await drag(a5, { x: a5.x - 20, y: a5.y + 15 });
      d = list().filter(function (x) { return x.id === d.id; })[0];
      ok(tl + ': start handle moves only the start', J(d.pts[1]) === p1 && nearPt(xy(d.pts[0].t, d.pts[0].p), { x: a5.x - 20, y: a5.y + 15 }, 2), J(d.pts));
      var s0 = xy(d.pts[0].t, d.pts[0].p), s1 = xy(d.pts[1].t, d.pts[1].p);
      await keyDown('Shift'); await drag(s1, { x: s1.x + 60, y: s0.y + 4 }); await keyUp('Shift');
      d = list().filter(function (x) { return x.id === d.id; })[0];
      ok(tl + ': end handle + Shift locks the angle too', d.pts[1].p === d.pts[0].p, J(d.pts));
    }

    // ---------------- horizontal line + magnet
    await press('m');
    var bars = T().bars(), k = bars.length - 12, bk = bars[k], pm = xy(bk.time, (bk.high + bk.low) / 2 + (bk.high - bk.low) * 0.3);
    await tool('hline'); await click(pm);
    var hl = lastD();
    ok('magnet: horizontal line on an open/high/low/close of the candle', hl.tool === 'hline' && [bk.open, bk.high, bk.low, bk.close].indexOf(hl.pts[0].p) >= 0, J(hl.pts[0]));
    await tool('trend'); await drag(xy(bars[k - 10].time, bars[k - 10].high + (bars[k - 10].high - bars[k - 10].low) * 0.2), xy(bk.time, bk.low - (bk.high - bk.low) * 0.1));
    var tm = lastD(), bA = bars[k - 10];
    ok('magnet: both ends of a trend line snap to OHLC values and bar times', tm.pts[0].t === bA.time && [bA.open, bA.high, bA.low, bA.close].indexOf(tm.pts[0].p) >= 0 && tm.pts[1].t === bk.time && [bk.open, bk.high, bk.low, bk.close].indexOf(tm.pts[1].p) >= 0, J(tm.pts));
    await press('m');
    var hy = xy(hl.pts[0].t, hl.pts[0].p);
    await drag({ x: P(0.3, 0).x, y: hy.y }, { x: P(0.3, 0).x, y: hy.y - 30 });
    ok('horizontal line: dragged up', lastD().id !== hl.id && T().draw().set.get(hl.id).pts[0].p > hl.pts[0].p);

    // ---------------- settings window: right click and double click
    // a fresh line on top of the stack (a click picks the topmost drawing, like TradingView)
    await tool('trend'); await drag(P(0.08, 0.1), P(0.3, 0.16)); tm = lastD(); await click(P(0.02, 0.05));
    var tr = T().draw().set.get(tm.id), tmid = (function () { var a = xy(tr.pts[0].t, tr.pts[0].p), b = xy(tr.pts[1].t, tr.pts[1].p); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })();
    var ctxSeen = 0; var ctxL = function () { ctxSeen++; }; document.addEventListener('contextmenu', ctxL, true);
    await click(tmid, { button: 'right' });
    document.removeEventListener('contextmenu', ctxL, true);
    var pop = document.querySelector('.bt-dset');
    if (!pop) out.push('INFO right click: contextmenu events ' + ctxSeen + ', element ' + (document.elementFromPoint(tmid.x, tmid.y) || {}).tagName + ', line ' + J(tr.pts) + ' at ' + J(tmid) + ' hidden ' + T().draw().set.hidden());
    ok('right click on a line opens its settings', !!pop && T().draw().settingsOpen() === tm.id && sel() === tm.id);
    pop.querySelector('[data-width="4"]').click(); await sleep(60);
    document.querySelector('.bt-dset [data-dash="dashed"]').click(); await sleep(60);
    document.querySelector('.bt-dset [data-color="#f59e0b"]').click(); await sleep(60);
    var tr2 = T().draw().set.get(tm.id);
    ok('settings: width 4, dashed, color', tr2.width === 4 && tr2.dash === 'dashed' && tr2.color === '#f59e0b', J(tr2));
    await chord(['Control'], 'z');
    ok('settings change is undoable (color back)', T().draw().set.get(tm.id).color === null && T().draw().set.get(tm.id).dash === 'dashed');
    await press('Escape');
    ok('Esc closes the settings window', !document.querySelector('.bt-dset'));
    {
      // ---------------- fibonacci (every plan)
      await tool('fib'); var F1 = P(0.3, 0.75), F2 = P(0.55, 0.25);
      await drag(F1, F2);
      var fb = lastD();
      ok('fib: drawn by dragging', fb.tool === 'fib' && nearPt(xy(fb.pts[0].t, fb.pts[0].p), F1, 2) && nearPt(xy(fb.pts[1].t, fb.pts[1].p), F2, 2), J(fb.pts));
      var f0 = J(fb.pts[0]);
      await drag(F2, { x: F2.x + 40, y: F2.y - 20 });
      fb = T().draw().set.get(fb.id);
      ok('fib: the 0 end moves alone', J(fb.pts[0]) === f0 && nearPt(xy(fb.pts[1].t, fb.pts[1].p), { x: F2.x + 40, y: F2.y - 20 }, 2));
      var f1 = J(fb.pts[1]);
      await drag(F1, { x: F1.x - 30, y: F1.y + 10 });
      fb = T().draw().set.get(fb.id);
      ok('fib: the 1 end moves alone', J(fb.pts[1]) === f1 && nearPt(xy(fb.pts[0].t, fb.pts[0].p), { x: F1.x - 30, y: F1.y + 10 }, 2));
      var fa = xy(fb.pts[0].t, fb.pts[0].p);
      await click({ x: fa.x + 20, y: fa.y }, { count: 2 });
      var lv = document.querySelector('.bt-dset [data-k="levels"]');
      ok('fib settings: levels field', !!lv && /0\.618/.test(lv.value), lv && lv.value);
      lv.value = '0, 0.5, 0.705, 1, 1.618'; lv.dispatchEvent(new Event('change', { bubbles: true })); await sleep(80);
      ok('fib levels changed', J(T().draw().set.get(fb.id).levels) === J([0, 0.5, 0.705, 1, 1.618]), J(T().draw().set.get(fb.id).levels));
      var tx = await drawnTexts();
      ok('fib: the new levels are drawn (0.705, 1.618), the old 0.236 is not', /0\.705 · /.test(tx) && /1\.618 · /.test(tx) && !/0\.236 · /.test(tx));
      await press('Escape');

      // ---------------- long / short
      bars = T().bars();
      var lk = bars.length - 25, LP = xy(bars[lk].time, bars[lk].close);
      await tool('long'); await click(LP);
      var lg = lastD();
      ok('long: created at the click (entry), target above, stop below', lg.tool === 'long' && lg.pts[1].p > lg.pts[0].p && lg.pts[2].p < lg.pts[0].p);
      var e0 = lg.pts[0].p, tgt = xy(lg.pts[1].t, lg.pts[1].p), stp = xy(lg.pts[2].t, lg.pts[2].p);
      await drag(tgt, { x: tgt.x, y: tgt.y - 30 });
      lg = T().draw().set.get(lg.id);
      ok('long: TP handle moves only the target', lg.pts[0].p === e0 && lg.pts[1].p > e0 && near(xy(lg.pts[1].t, lg.pts[1].p).y, tgt.y - 30, 2) && near(xy(lg.pts[2].t, lg.pts[2].p).y, stp.y, 1), J(lg.pts));
      await drag(stp, { x: stp.x, y: stp.y + 25 });
      lg = T().draw().set.get(lg.id);
      ok('long: SL handle moves only the stop', lg.pts[0].p === e0 && near(xy(lg.pts[2].t, lg.pts[2].p).y, stp.y + 25, 2), J(lg.pts));
      var en = xy(lg.pts[0].t, lg.pts[0].p), risk = lg.pts[0].p - lg.pts[2].p, rew = lg.pts[1].p - lg.pts[0].p;
      await drag(en, { x: en.x, y: en.y - 20 });
      lg = T().draw().set.get(lg.id);
      ok('long: entry handle moves the whole trade (target and stop keep their distance)', lg.pts[0].p > e0 && Math.abs(lg.pts[0].p - lg.pts[2].p - risk) < 1e-6 && Math.abs(lg.pts[1].p - lg.pts[0].p - rew) < 1e-6);
      setv('bt-lot', '0.50');
      tx = await drawnTexts();
      var rrx = (rew / risk).toFixed(2);
      ok('long: R:R, pips/points and money on the chart (lot from the order panel)', tx.indexOf('R:R ' + rrx) >= 0 && /(pip|puan|pts)/.test(tx) && /[+-]\d[\d.]* \$/.test(tx) && /0\.50 lot/.test(tx), rrx + ' :: ' + tx.slice(0, 400));
      await tool('short'); await click(xy(bars[lk - 8].time, bars[lk - 8].close));
      var sh = lastD();
      ok('short: target below, stop above', sh.tool === 'short' && sh.pts[1].p < sh.pts[0].p && sh.pts[2].p > sh.pts[0].p);
      var st = xy(sh.pts[2].t, sh.pts[2].p);
      await drag(st, { x: st.x, y: st.y + 400 });
      sh = T().draw().set.get(sh.id);
      ok('short: the stop cannot cross to the profit side', sh.pts[2].p > sh.pts[0].p, J(sh.pts));

      // ---------------- text in place
      await tool('text'); var TP = P(0.25, 0.15); await click(TP);
      var inp = document.querySelector('#bt-chart .bt-draw-edit');
      ok('text: an input opens in place on the chart', !!inp && document.activeElement === inp && near(inp.getBoundingClientRect().left, TP.x - 4, 3), inp && J(inp.getBoundingClientRect()));
      await type('Destek'); await press('Enter');
      var txd = lastD();
      ok('text: typed and Enter -> drawing with the text', txd.tool === 'text' && txd.text === 'Destek' && !document.querySelector('.bt-draw-edit'), J(txd));
      var tpos = xy(txd.pts[0].t, txd.pts[0].p);
      await click({ x: tpos.x + 12, y: tpos.y }, { count: 2 });
      inp = document.querySelector('#bt-chart .bt-draw-edit');
      ok('text: double click edits it in place', !!inp && inp.value === 'Destek');
      await chord(['Control'], 'a'); await type('Direnç'); await press('Enter');
      ok('text: changed in place', T().draw().set.get(txd.id).text === 'Direnç', T().draw().set.get(txd.id).text);
      await click({ x: tpos.x + 12, y: tpos.y }, { count: 2 });
      await press('x'); await press('Escape');
      ok('text: Esc drops the edit', T().draw().set.get(txd.id).text === 'Direnç' && !document.querySelector('.bt-draw-edit'));
      await chord(['Control'], 'z');
      ok('text edit is undoable', T().draw().set.get(txd.id).text === 'Destek');
      await tool('text'); await click(P(0.6, 0.1)); await press('Escape');
      ok('text: Esc on a new text creates nothing', list().filter(function (x) { return x.tool === 'text'; }).length === 1 && T().draw().tool() === 'cursor');

      // ---------------- measure
      bars = T().bars();
      var ma = bars.length - 30, mb = bars.length - 10, MA = xy(bars[ma].time, bars[ma].close), MB = xy(bars[mb].time, bars[mb].close);
      await tool('measure'); await drag(MA, MB);
      var me = lastD(), stM = D.measureStats(me, bars, T().tfSec());
      tx = await drawnTexts();
      ok('measure: candles, time, price change and percent', me.tool === 'measure' && stM.bars === 20 && tx.indexOf(stM.pct.toFixed(2) + '%') >= 0 && /20 (mum|bars|Kerzen)/.test(tx) && /(sa|s|h|Std)/.test(tx), stM.bars + ' :: ' + tx.slice(0, 300));
    }

    // ---------------- timeframe, replay, full screen: same place, no ghost
    await tool('trend'); await drag(P(0.1, 0.9), P(0.3, 0.82)); tm = lastD(); await click(P(0.02, 0.05));
    var snap = J(list().map(function (x) { return x.pts; }));
    var tr3 = T().draw().set.get(tm.id);
    setv('bt-tf', '15m');
    await waitFor(function () { return T().tfSec() === 900 && T().bars().length > 50; }, 20000, 'M15'); await sleep(700);
    ok('timeframe change: every drawing keeps its time/price points', J(list().map(function (x) { return x.pts; })) === snap);
    T().chart().timeScale().setVisibleLogicalRange({ from: D.timeToLogical(T().bars(), 900, tr3.pts[0].t) - 20, to: D.timeToLogical(T().bars(), 900, tr3.pts[1].t) + 20 }); await sleep(250);
    var m15 = (function () { var a = xy(tr3.pts[0].t, tr3.pts[0].p), b = xy(tr3.pts[1].t, tr3.pts[1].p); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })();
    await click(P(0.02, 0.05)); await click(m15);
    ok('M15: the trend line is still under its coordinates (real click selects it)', sel() === tm.id, sel());
    setv('bt-tf', '1h'); await waitFor(function () { return T().tfSec() === 3600; }, 20000, 'H1'); await sleep(700);
    for (i = 0; i < 20; i++) { $('bt-step-btn').click(); await sleep(20); }
    ok('replay forward: drawings unchanged', J(list().map(function (x) { return x.pts; })) === snap);
    await press('f'); await sleep(500);
    T().chart().timeScale().setVisibleLogicalRange({ from: D.timeToLogical(T().bars(), 3600, tr3.pts[0].t) - 10, to: D.timeToLogical(T().bars(), 3600, tr3.pts[1].t) + 10 }); await sleep(250);
    var fsm = (function () { var a = xy(tr3.pts[0].t, tr3.pts[0].p), b = xy(tr3.pts[1].t, tr3.pts[1].p); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })();
    await click(P(0.02, 0.05)); await click(fsm);
    ok('full screen: the line is selectable at its coordinates', document.getElementById('bt-root').classList.contains('bt-fs') && sel() === tm.id, sel());
    await drag(fsm, { x: fsm.x + 30, y: fsm.y + 10 });
    ok('full screen: the line can be moved', J(T().draw().set.get(tm.id).pts) !== J(tr3.pts));
    if (pro) {
      // ---------------- multi-chart: draw on the second chart (own 15m timeframe); the drawing stays on that chart only (owner, 2026-10-26)
      await press('Escape'); await sleep(300);
      $('bt-layout-btn').click(); $('bt-layout-pop').querySelector('[data-layout="2h"]').click(); await sleep(700);
      var ex = T().R().extra[0], er = ex.el.getBoundingClientRect(), ets = ex.chart.timeScale(), eh = ex.el.clientHeight - ets.height();
      ok('2 charts side by side', T().R().extra.length === 1 && er.width > 100);
      var cnt = list().length, Q1 = { x: er.left + ets.width() * 0.3, y: er.top + eh * 0.3 }, Q2 = { x: er.left + ets.width() * 0.6, y: er.top + eh * 0.6 };
      await tool('rect'); await move(Q1); await pp({ op: 'down' }); await move(Q2, 6);
      ok('while drawing on chart 2 the main chart has no draft', T().draw().busy());
      await pp({ op: 'up' }); await sleep(150);
      var mr = lastD();
      ok('rect drawn on chart 2 belongs to chart 2, selected', list().length === cnt + 1 && mr.tool === 'rect' && mr.pane === 'chart2' && sel() === mr.id && !T().draw().busy());
      var ea = ex.series.priceToCoordinate(mr.pts[0].p);
      ok('chart 2: the rectangle sits where the mouse went down', Math.abs(er.top + ea - Q1.y) <= 2, (er.top + ea) + ' vs ' + Q1.y);
      T().chart().timeScale().setVisibleLogicalRange({ from: D.timeToLogical(T().bars(), 3600, mr.pts[0].t) - 15, to: D.timeToLogical(T().bars(), 3600, mr.pts[1].t) + 15 }); await sleep(250);
      await click(P(0.02, 0.05));
      var mb2 = box(mr); await click({ x: (mb2.l + mb2.r) / 2, y: (mb2.t + mb2.b) / 2 });
      ok('main chart (1h): nothing to select under its time/price (not drawn there)', sel() !== mr.id, sel());
      await chord(['Control'], 'z');
      ok('undo removes it', !T().draw().set.get(mr.id));
      $('bt-layout-btn').click(); $('bt-layout-pop').querySelector('[data-layout="1"]').click(); await sleep(500);
    }
    await press('Escape'); await press('Escape'); await sleep(300);
    ok('no gesture or draft left behind', !T().draw().busy() && !document.querySelector('.bt-draw-edit') && !document.querySelector('.bt-dset'));
    // every plan: no tool is locked, none opens the upgrade window
    window.__upgrade = false; await tool('fib');
    ok((pro ? 'premium' : 'free') + ': fib is a normal tool, no upgrade window', window.__upgrade !== true && T().draw().tool() === 'fib', T().draw().tool());
    await tool('cursor');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { CanvasRenderingContext2D.prototype.fillText = ft; $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
