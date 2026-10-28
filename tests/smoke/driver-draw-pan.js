// The chart still scrolls with the mouse after a drawing tool was used (real mouse input through window.__pp from run.mjs).
// Each case uses a tool, goes back to the cursor and drags the empty chart: the visible range must move.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp;
  function pane() { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { l: r.left, t: r.top, w: ts.width(), h: e.clientHeight - ts.height() }; }
  function P(fx, fy) { var p = pane(); return { x: Math.round(p.l + p.w * fx), y: Math.round(p.t + p.h * fy) }; }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b) { await move(a); await pp({ op: 'down' }); await move(b, 8); await pp({ op: 'up' }); await sleep(150); }
  async function click(a) { await pp({ op: 'click', x: a.x, y: a.y }); await sleep(140); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  // a tool's button, or the menu of the group it is in (the toolbar groups lines and positions on one button each)
  function pickTool(id) {
    var b = document.querySelector('#bt-draw-bar [data-tool="' + id + '"]');
    if (b) return b.click();
    document.querySelector('#bt-draw-bar [data-tools~="' + id + '"] [data-more]').click();
    document.querySelector('.bt-draw-fly [data-fly-tool="' + id + '"]').click();
  }
  async function tool(id) { pickTool(id); await sleep(80); }
  function from() { return T().chart().timeScale().getVisibleLogicalRange().from; }
  function opts() { var o = T().chart().options(); return JSON.stringify({ s: o.handleScroll, z: o.handleScale }); }
  var base = null;
  // drag the chart where nothing is drawn (left part, top) and check that it scrolled
  async function pans(name) {
    await sleep(100);
    var f0 = from(), a = P(0.12, 0.08), b = P(0.32, 0.08), t0 = T().draw().tool(), n0 = T().draw().set.list().length;
    await drag(a, b);
    var f1 = from();
    ok(name + ': the chart scrolls after the tool', t0 === 'cursor' && Math.abs(f1 - f0) > 3 && T().draw().set.list().length === n0,
      'from ' + f0.toFixed(1) + ' -> ' + f1.toFixed(1) + ' tool before ' + t0 + ' opts ' + opts());
    ok(name + ': scroll options back to the original', opts() === base, opts());
    T().chart().timeScale().setVisibleLogicalRange({ from: T().bars().length - 80, to: T().bars().length + 5 }); await sleep(150);
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Draw pan'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(400);
    T().chart().timeScale().setVisibleLogicalRange({ from: T().bars().length - 80, to: T().bars().length + 5 }); await sleep(250);
    base = opts();
    await pans('nothing drawn');

    await tool('rect'); await drag(P(0.6, 0.5), P(0.8, 0.8)); await pans('rect by drag');
    await tool('rect'); await click(P(0.6, 0.5)); await move(P(0.75, 0.7), 5); await click(P(0.75, 0.7)); await pans('rect by two clicks');
    await tool('rect'); await press('Escape'); await pans('rect picked, Esc');
    await tool('rect'); await tool('cursor'); await pans('rect picked, cursor button');
    await tool('rect'); await tool('rect'); await pans('rect picked twice (toggle)');
    await tool('rect'); await press('v'); await pans('rect picked, V key');
    await tool('rect'); await tool('trend'); await tool('cursor'); await pans('rect then trend then cursor');
    await tool('rect'); await click(P(0.6, 0.5)); await tool('cursor'); await pans('rect half drawn, cursor button');
    await tool('rect'); await click(P(0.6, 0.5)); await press('Escape');
    ok('rect half drawn, Esc: the drawing is dropped, the tool stays', T().draw().tool() === 'rect' && !T().draw().busy(), T().draw().tool());
    await press('Escape'); await pans('rect half drawn, Esc twice');
    await tool('trend'); await drag(P(0.6, 0.5), P(0.8, 0.6)); await pans('trend by drag');
    await tool('hline'); await click(P(0.7, 0.6)); await pans('horizontal line');
    // move a drawing, then scroll
    var r = T().draw().set.list().filter(function (d) { return d.tool === 'rect'; })[0];
    if (r) { T().draw().set.select(r.id); await drag(P(0.7, 0.65), P(0.72, 0.66)); await pans('after moving a rectangle'); }
    // right click on a drawing (settings window), then scroll
    await move(P(0.7, 0.6)); await pp({ op: 'click', x: P(0.7, 0.6).x, y: P(0.7, 0.6).y, button: 'right' }); await sleep(150); await press('Escape'); await pans('after the settings window');
    // the tool changes while the timeframe is rebuilt
    await tool('rect');
    var tf = $('bt-tf');
    if (tf && tf.tagName === 'SELECT') { var opt = [].slice.call(tf.options).map(function (o) { return o.value; }).filter(function (v) { return v !== tf.value; })[0]; setv(tf.id, opt); await sleep(800); }
    else if (tf) { tf.click(); await sleep(800); }
    await tool('cursor'); await pans('rect picked, timeframe changed, cursor');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var el = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  el.textContent = out.join('\n');
})();
