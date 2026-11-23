// The nine drawing tools of 2026-11-23 and the new options, with REAL mouse and keyboard (window.__pp):
// vertical line (+ time axis label), arrow, parallel channel (3 points, width handle), trend-based Fibonacci extension, pitchfork,
// ellipse (Shift = circle), triangle, brush (freehand, a tap draws nothing), callout (text typed in place, edited by double click);
// trend line extension + info label, rectangle extended right, copy / paste, Alt+drag clone, stay in drawing mode, "set as default",
// the magnet does not pull a point back from the empty space after the last candle. ?backend=supabase: every drawing reaches the
// (fake) database, which applies 202611230002. ?shot=1 leaves everything on the chart for a screenshot.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, D = window.WwBtDraw, pp = window.__pp, shot = /[?&]shot=1/.test(location.search), sb = /[?&]backend=supabase/.test(location.search);
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
  function priceAt(pt) { return T().series().coordinateToPrice(pt.y - $('bt-chart').getBoundingClientRect().top); }
  function logical(t) { return D.timeToLogical(T().bars(), T().tfSec(), t); }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b, steps) { await move(a); await pp({ op: 'down' }); await move(b, steps || 8); await pp({ op: 'up' }); await sleep(150); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: a.x, y: a.y }, o || {})); await sleep(150); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  async function keyDown(k) { await pp({ op: 'key', key: k, type: 'down' }); }
  async function keyUp(k) { await pp({ op: 'key', key: k, type: 'up' }); }
  async function chord(mod, k) { await keyDown(mod); await press(k); await keyUp(mod); await sleep(100); }
  async function type(s) { await pp({ op: 'type', text: s }); await sleep(80); }
  function pickTool(id) {
    var b = document.querySelector('#bt-draw-bar [data-tool="' + id + '"]');
    if (b) return b.click();
    document.querySelector('#bt-draw-bar [data-tools~="' + id + '"] [data-more]').click();
    document.querySelector('.bt-draw-fly [data-fly-tool="' + id + '"]').click();
  }
  async function tool(id) { if (T().draw().tool() !== id) pickTool(id); await sleep(80); }
  async function deselect() { await click(P(0.02, 0.04)); }
  function J(x) { return JSON.stringify(x); }
  var texts = [], ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s) { if (texts.length < 6000) texts.push(String(s)); return ft.apply(this, arguments); };
  async function drawnTexts() { texts = []; T().draw().set.redraw(); T().chart().applyOptions({}); await sleep(200); return texts.join(' | '); }
  var toasts = [];
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(e.message); out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'New tools'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(400);
    var N = T().bars().length;
    // 80 candles and empty space for 25 more on the right (the future)
    T().chart().timeScale().setVisibleLogicalRange({ from: N - 80, to: N + 25 }); await sleep(300);
    var tz = document.querySelector('.toast, #toast-container'); void tz;
    var n0 = list().length;

    // ---------------- toolbar: every new tool is reachable, grouped next to its relatives
    var groups = [].map.call(document.querySelectorAll('#bt-draw-bar [data-group]'), function (b) { return b.getAttribute('data-tools'); });
    ok('toolbar: new tools in their groups', groups.indexOf('trend ray hline vline arrow') >= 0 && groups.indexOf('channel pitchfork') >= 0 && groups.indexOf('fib fibext') >= 0 &&
      groups.indexOf('rect ellipse triangle brush') >= 0 && groups.indexOf('text callout') >= 0, J(groups));

    // ---------------- vertical line: one click, a label on the time axis, grabbed anywhere along its height
    await tool('vline'); await click(P(0.4, 0.5));
    var vl = lastD();
    ok('vertical line: one click', vl && vl.tool === 'vline' && vl.pts.length === 1 && T().draw().tool() === 'cursor', J(vl));
    var tx = await drawnTexts(), want = T().chart().options().localization.timeFormatter(vl.pts[0].t);
    ok('vertical line: its time on the time axis', tx.indexOf(want) >= 0, want + ' :: ' + tx.slice(0, 200));
    await deselect(); await click({ x: P(0.4, 0.1).x, y: P(0.4, 0.1).y });
    ok('vertical line: selected far from where it was placed', sel() === vl.id, sel());
    var vx = P(0.4, 0.5).x;
    await drag({ x: vx, y: P(0.4, 0.3).y }, { x: vx + 60, y: P(0.4, 0.3).y });
    ok('vertical line: dragged to a later time', get(vl.id).pts[0].t > vl.pts[0].t);

    // ---------------- arrow
    await tool('arrow'); await drag(P(0.08, 0.35), P(0.2, 0.22));
    var ar = lastD();
    ok('arrow: two points', ar.tool === 'arrow' && ar.pts.length === 2 && ar.pts[1].p > ar.pts[0].p, J(ar.pts));

    // ---------------- parallel channel: drag the base line, then a click sets the width
    await tool('channel'); await drag(P(0.3, 0.62), P(0.5, 0.55)); await move(P(0.5, 0.42), 4); await click(P(0.5, 0.42));
    var ch = lastD();
    var expectOff = priceAt(P(0.5, 0.42)) - priceAt(P(0.5, 0.55));
    ok('channel: three points, the third above the first', ch.tool === 'channel' && ch.pts.length === 3 && ch.pts[2].t === ch.pts[0].t && T().draw().tool() === 'cursor', J(ch.pts));
    ok('channel: width from the third click (price)', Math.abs(D.channelOffset(ch) - expectOff) < Math.abs(expectOff) * 0.08, D.channelOffset(ch) + ' vs ' + expectOff);
    var mh = xy((ch.pts[0].t + ch.pts[1].t) / 2, (ch.pts[0].p + ch.pts[1].p) / 2 + D.channelOffset(ch));
    var off0 = D.channelOffset(ch);
    await drag(mh, { x: mh.x, y: mh.y - 40 });
    ok('channel: the middle handle widens it', D.channelOffset(get(ch.id)) > off0 * 1.1, D.channelOffset(get(ch.id)) + ' > ' + off0);
    var off1 = D.channelOffset(get(ch.id)), e0 = xy(get(ch.id).pts[0].t, get(ch.id).pts[0].p);
    await drag(e0, { x: e0.x - 30, y: e0.y + 25 });
    ok('channel: dragging an end keeps the width', Math.abs(D.channelOffset(get(ch.id)) - off1) < 1e-9 && get(ch.id).pts[2].t === get(ch.id).pts[0].t);

    // ---------------- trend-based Fibonacci extension: click, click, click
    await tool('fibext'); await click(P(0.55, 0.6)); await move(P(0.62, 0.3), 4); await click(P(0.62, 0.3)); await move(P(0.68, 0.45), 4); await click(P(0.68, 0.45));
    var fx = lastD();
    ok('fib extension: three clicks', fx.tool === 'fibext' && fx.pts.length === 3 && T().draw().tool() === 'cursor', J(fx.pts));
    tx = await drawnTexts();
    ok('fib extension: its levels are labelled', /1\.618 · /.test(tx) && /2\.618 · /.test(tx), tx.slice(0, 200));

    // ---------------- pitchfork
    await tool('pitchfork'); await drag(P(0.12, 0.75), P(0.2, 0.62)); await click(P(0.22, 0.8));
    var pf = lastD();
    ok('pitchfork: three points', pf.tool === 'pitchfork' && pf.pts.length === 3, J(pf.pts));

    // ---------------- ellipse (Shift: a circle on screen)
    await tool('ellipse'); await move(P(0.7, 0.15)); await pp({ op: 'down' }); await keyDown('Shift'); await move(P(0.78, 0.22), 6); await pp({ op: 'up' }); await keyUp('Shift'); await sleep(150);
    var el = lastD(), a1 = xy(el.pts[0].t, el.pts[0].p), b1 = xy(el.pts[1].t, el.pts[1].p);
    ok('ellipse: Shift draws a circle', el.tool === 'ellipse' && Math.abs(Math.abs(b1.x - a1.x) - Math.abs(b1.y - a1.y)) < 3, (b1.x - a1.x) + ' x ' + (b1.y - a1.y));
    await deselect(); await click({ x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 });
    ok('ellipse: filled, so a click inside selects it', sel() === el.id);

    // ---------------- triangle
    await tool('triangle'); await drag(P(0.82, 0.6), P(0.9, 0.5)); await click(P(0.92, 0.66));
    var tr = lastD();
    ok('triangle: three points', tr.tool === 'triangle' && tr.pts.length === 3, J(tr.pts));

    // ---------------- brush: a stroke; a tap draws nothing
    await tool('brush');
    var cnt = list().length;
    await click(P(0.35, 0.2));
    ok('brush: a tap draws nothing', list().length === cnt && T().draw().tool() === 'brush');
    await move(P(0.3, 0.25)); await pp({ op: 'down' });
    for (i = 0; i <= 40; i++) await move(P(0.3 + i * 0.004, 0.25 + Math.sin(i / 4) * 0.05), 2);
    await pp({ op: 'up' }); await sleep(150);
    var bs = lastD();
    ok('brush: a stroke of 2..120 points', bs.tool === 'brush' && bs.pts.length >= 3 && bs.pts.length <= 120 && bs.pts.every(function (p) { return p.t === Math.round(p.t); }), bs.pts.length);
    await deselect(); var bm = xy(bs.pts[Math.floor(bs.pts.length / 2)].t, bs.pts[Math.floor(bs.pts.length / 2)].p); await click(bm);
    ok('brush: selected on its stroke', sel() === bs.id, sel());

    // ---------------- callout: drag from the point to the bubble, type, Enter; double click edits
    await tool('callout'); await drag(P(0.45, 0.3), P(0.5, 0.18));
    ok('callout: the text input opens', !!q('.bt-draw-edit'));
    await type('Haber'); await press('Enter');
    var co = lastD();
    ok('callout: created with its text', co.tool === 'callout' && co.text === 'Haber' && co.pts.length === 2, J(co));
    tx = await drawnTexts();
    ok('callout: text drawn in the bubble', tx.indexOf('Haber') >= 0);
    var cb = xy(co.pts[1].t, co.pts[1].p);
    await deselect(); await click({ x: cb.x + 15, y: cb.y }, { count: 2 }); await sleep(150);
    ok('callout: double click edits in place (the text selected)', !!q('.bt-draw-edit') && q('.bt-draw-edit').value === 'Haber');
    await type('Haber 2'); await press('Enter');
    ok('callout: edited', get(co.id).text === 'Haber 2', get(co.id).text);
    await tool('callout'); await drag(P(0.45, 0.45), P(0.5, 0.4)); await press('Escape');
    ok('callout: Esc on a new one creates nothing', list().filter(function (x) { return x.tool === 'callout'; }).length === 1);

    // ---------------- trend line: extend both ways + info label (settings window)
    await tool('trend'); await drag(P(0.3, 0.68), P(0.36, 0.62));
    var tl = lastD(), tm = xy((tl.pts[0].t + tl.pts[1].t) / 2, (tl.pts[0].p + tl.pts[1].p) / 2);
    await deselect(); await click(tm, { count: 2 }); await sleep(200);
    ok('trend settings: extend and info label offered', !!q('.bt-dset [data-lext="both"]') && !!q('.bt-dset [data-k="stats"]'));
    // every change redraws the window: each control is looked up again
    if (q('.bt-dset [data-lext="both"]')) { q('.bt-dset [data-lext="both"]').click(); await sleep(100); }
    if (q('.bt-dset [data-k="stats"]')) { q('.bt-dset [data-k="stats"]').click(); await sleep(100); }
    ok('trend settings: the window stays open after a change', !!q('.bt-dset') && q('.bt-dset [data-lext="both"]').getAttribute('aria-pressed') === 'true');
    await press('Escape');
    ok('trend: extended both ways with an info label', get(tl.id).extend === 'both' && get(tl.id).stats === true, J(get(tl.id)));
    tx = await drawnTexts();
    ok('trend: the info label shows the change in %', /[+−]\S+ \([+-]?\d+\.\d\d%\)/.test(tx), tx.slice(0, 300));
    // a point on the extension, past the second point
    var t2 = get(tl.id), A = xy(t2.pts[0].t, t2.pts[0].p), B = xy(t2.pts[1].t, t2.pts[1].p), far = { x: B.x + (B.x - A.x) * 1.5, y: B.y + (B.y - A.y) * 1.5 };
    await deselect(); await click(far);
    ok('trend: the extension is grabbed too', sel() === tl.id, sel());

    // ---------------- rectangle extended to the right
    await tool('rect'); await drag(P(0.6, 0.7), P(0.66, 0.66));
    var rc = lastD(), rm = xy(rc.pts[0].t, (rc.pts[0].p + rc.pts[1].p) / 2);
    await deselect(); await click({ x: rm.x + 4, y: rm.y }, { count: 2 }); await sleep(200);
    var zc = q('.bt-dset [data-k="zone-extend"]');
    ok('rectangle settings: extend right offered', !!zc);
    if (zc) { zc.click(); await sleep(100); }
    await press('Escape');
    ok('rectangle: extended right', get(rc.id).extend === 'right');
    await deselect(); await click(P(0.97, (0.7 + 0.66) / 2));
    ok('rectangle: grabbed in its extension', sel() === rc.id, sel());

    // ---------------- copy / paste, undo
    await deselect(); var am = xy((ar.pts[0].t + ar.pts[1].t) / 2, (ar.pts[0].p + ar.pts[1].p) / 2); await click(am);
    ok('arrow selected for copy', sel() === ar.id);
    cnt = list().length;
    await chord('Control', 'c'); await chord('Control', 'v');
    var cp = lastD();
    ok('paste: a copy 3 bars to the right, selected', list().length === cnt + 1 && cp.tool === 'arrow' && cp.id !== ar.id && sel() === cp.id &&
      Math.abs(logical(cp.pts[0].t) - logical(ar.pts[0].t) - 3) < 0.01 && Math.abs(cp.pts[0].p - ar.pts[0].p) < 1e-12, J(cp.pts));
    await chord('Control', 'v');
    ok('paste again: the next copy further right', list().length === cnt + 2 && Math.abs(logical(lastD().pts[0].t) - logical(ar.pts[0].t) - 6) < 0.01);
    await chord('Control', 'z'); await chord('Control', 'z');
    ok('paste is undoable', list().length === cnt);

    // ---------------- Alt + drag: a copy moves, the original stays
    cnt = list().length; var arBefore = J(get(ar.id).pts);
    await move(am); await keyDown('Alt'); await pp({ op: 'down' }); await move({ x: am.x + 50, y: am.y + 30 }, 6); await pp({ op: 'up' }); await keyUp('Alt'); await sleep(150);
    var cl = lastD();
    ok('Alt+drag: a copy is made and moved', list().length === cnt + 1 && cl.tool === 'arrow' && cl.id !== ar.id && J(get(ar.id).pts) === arBefore && cl.pts[0].t > ar.pts[0].t, J(cl.pts));

    // ---------------- stay in drawing mode
    q('#bt-draw-bar [data-act="stay"]').click(); await sleep(80);
    await tool('trend'); cnt = list().length;
    await drag(P(0.1, 0.1), P(0.15, 0.12)); await drag(P(0.1, 0.15), P(0.15, 0.17));
    ok('stay in drawing mode: the tool stays for the next drawing', list().length === cnt + 2 && T().draw().tool() === 'trend');
    q('#bt-draw-bar [data-act="stay"]').click(); await sleep(80);
    await drag(P(0.1, 0.2), P(0.15, 0.22));
    ok('stay off: back to the cursor after a drawing', T().draw().tool() === 'cursor');

    // ---------------- set as default: the next trend line gets that color and width
    var dl = lastD(), dm = xy((dl.pts[0].t + dl.pts[1].t) / 2, (dl.pts[0].p + dl.pts[1].p) / 2);
    await deselect(); await click(dm, { count: 2 }); await sleep(200);
    q('.bt-dset [data-color="#ef4444"]').click(); await sleep(80);
    q('.bt-dset [data-width="3"]').click(); await sleep(80);
    q('.bt-dset [data-k="default"]').click(); await sleep(80);
    await press('Escape');
    await tool('trend'); await drag(P(0.1, 0.3), P(0.15, 0.33));
    ok('set as default: a new trend line starts with that style', lastD().color === '#ef4444' && lastD().width === 3, J(lastD()));

    // ---------------- magnet: no snap in the empty space after the last candle
    await press('m');
    await tool('trend'); await drag(xy(T().bars()[N - 5].time, T().bars()[N - 5].high), P(0.97, 0.3));
    var mg = lastD(), lastT = T().bars()[T().bars().length - 1].time;
    ok('magnet: the first point snaps to a candle', mg.pts[0].t === T().bars()[N - 5].time, mg.pts[0].t + ' vs ' + T().bars()[N - 5].time);
    ok('magnet: the end stays in the future (no pull back to the last candle)', mg.pts[1].t > lastT + T().tfSec() * 5, (mg.pts[1].t - lastT) / T().tfSec() + ' bars after the last');
    await press('m');

    // ---------------- saved to the account (fake database with 202611230002)
    await sleep(900);
    if (sb) {
      var rows = window.__db.tables.backtest_drawings || [], ids = {};
      rows.forEach(function (r) { ids[r.id] = r; });
      var missing = list().filter(function (d) { return !ids[d.id]; }).map(function (d) { return d.tool; });
      ok('every drawing is saved (new tools pass the database checks)', !missing.length && rows.length === list().length, 'missing: ' + J(missing) + ' rows ' + rows.length + ' / ' + list().length);
      var tools = {}; rows.forEach(function (r) { tools[r.tool] = true; });
      ok('saved rows include every new tool', ['vline', 'arrow', 'channel', 'fibext', 'pitchfork', 'ellipse', 'triangle', 'brush', 'callout'].every(function (t) { return tools[t]; }), J(Object.keys(tools)));
      var cr = rows.filter(function (r) { return r.id === co.id; })[0];
      ok('callout row: text in the style', cr && cr.style && cr.style.text === 'Haber 2');
      var tr2 = rows.filter(function (r) { return r.id === tl.id; })[0];
      ok('trend row: extend and stats in the style', tr2 && tr2.style.extend === 'both' && tr2.style.stats === true, tr2 && J(tr2.style));
    }
    ok('no "could not save" message', !/kaydedilemedi|could not be saved|nicht gespeichert/i.test(document.body.innerText));
    ok('every drawing is new', list().length > n0 + 15, list().length);
    ok('no JavaScript errors', !errors.length, J(errors));
    if (shot) { await deselect(); T().chart().timeScale().setVisibleLogicalRange({ from: N - 80, to: N + 25 }); await sleep(300); }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var res = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  res.textContent = out.join('\n');
})();
