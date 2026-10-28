// Grouped drawing toolbar with REAL mouse and keyboard (window.__pp): lines and positions share a button, the corner (or a right click)
// opens the group, the button shows the last tool used, keys still pick every tool. Drag and drop: reorder buttons, drop a button on
// another (joins its group), a tool from the menu out to its own button, into another group, inside its group; Esc cancels a drag;
// stored per browser; reset. ?plan=premium|free
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return [].slice.call(document.querySelectorAll(s)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp;
  function groups() { return qa('#bt-draw-bar [data-group]').map(function (b) { return b.getAttribute('data-tools'); }); }
  function shown() { return qa('#bt-draw-bar [data-group]').map(function (b) { return b.getAttribute('data-tool'); }); }
  function gbtn(tool) { return q('#bt-draw-bar [data-tools~="' + tool + '"]'); }
  function menuTools() { return qa('.bt-draw-fly [data-fly-tool]').map(function (b) { return b.getAttribute('data-fly-tool'); }); }
  function R(e) { return e.getBoundingClientRect(); }
  function mid(e) { var r = R(e); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function topOf(e) { var r = R(e); return { x: r.left + r.width / 2, y: r.top + 3 }; }
  function bottomOf(e) { var r = R(e); return { x: r.left + r.width / 2, y: r.bottom - 3 }; }
  function corner(e) { var r = R(e); return { x: r.right - 4, y: r.bottom - 4 }; }
  async function move(a, steps) { await pp({ op: 'move', x: Math.round(a.x), y: Math.round(a.y), steps: steps || 1 }); }
  async function drag(a, b, mid2) { await move(a); await pp({ op: 'down' }); await move({ x: a.x + 8, y: a.y + 8 }, 3); await move(b, 10); await sleep(60); if (mid2) await mid2(); await pp({ op: 'up' }); await sleep(200); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: Math.round(a.x), y: Math.round(a.y) }, o || {})); await sleep(150); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(100); }
  function stored() { try { return JSON.parse(localStorage.getItem('ww_bt_draw_ui') || '{}').groups; } catch (e) { return null; } }
  function J(x) { return JSON.stringify(x); }
  function pane() { var e = $('bt-chart'), r = e.getBoundingClientRect(), ts = T().chart().timeScale(); return { l: r.left, t: r.top, w: ts.width(), h: e.clientHeight - ts.height() }; }
  function P(fx, fy) { var p = pane(); return { x: Math.round(p.l + p.w * fx), y: Math.round(p.t + p.h * fy) }; }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Toolbar'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(400);

    // --- default groups
    ok('default: lines and positions share a button', J(groups()) === J(['trend ray hline', 'rect', 'fib', 'long short', 'text', 'measure']), J(groups()));
    ok('grouped buttons have a corner; single ones do not', !!gbtn('trend').querySelector('[data-more]') && !!gbtn('long').querySelector('[data-more]') && !gbtn('rect').querySelector('[data-more]'));
    ok('ray, horizontal line and short have no button of their own', !q('#bt-draw-bar > [data-tool="ray"]') && !q('#bt-draw-bar > [data-tool="hline"]') && !q('#bt-draw-bar > [data-tool="short"]'));

    // --- the corner opens the group; picking shows that tool on the button
    await click(corner(gbtn('trend')));
    ok('corner: menu with trend line, ray, horizontal line', J(menuTools()) === J(['trend', 'ray', 'hline']) && gbtn('trend').getAttribute('aria-expanded') === 'true', J(menuTools()));
    ok('corner: no tool picked by opening', T().draw().tool() === 'cursor');
    await click(mid(q('.bt-draw-fly [data-fly-tool="ray"]')));
    ok('menu: ray picked, menu closed, the button shows the ray', T().draw().tool() === 'ray' && !q('.bt-draw-fly') && shown()[0] === 'ray' && gbtn('ray').getAttribute('aria-pressed') === 'true');
    await click(P(0.5, 0.4)); await click(P(0.7, 0.3));
    ok('the ray draws; afterwards the button still shows the ray (last used)', T().draw().set.list().some(function (d) { return d.tool === 'ray'; }) && T().draw().tool() === 'cursor' && shown()[0] === 'ray');
    await click(mid(gbtn('ray')));
    ok('the button picks the tool it shows', T().draw().tool() === 'ray'); await press('Escape');
    await press('2');
    ok('key 2: horizontal line picked, the group button shows it', T().draw().tool() === 'hline' && shown()[0] === 'hline'); await press('Escape');
    await press('9'); await press('Escape');
    await press('7');
    ok('key 7: short picked through its group', T().draw().tool() === 'short' && shown()[3] === 'short'); await press('Escape'); await press('Escape');

    // --- right click and keyboard open the menu; Esc closes it
    await click(mid(gbtn('rect')), { button: 'right' });
    ok('right click on a single button: its menu with the reset (disabled while default)', J(menuTools()) === J(['rect']) && q('.bt-draw-fly [data-fly-act="reset"]').disabled);
    await press('Escape');
    ok('Esc closes the menu', !q('.bt-draw-fly'));
    gbtn('long').focus(); await press('ArrowRight');
    ok('arrow key on a grouped button: menu, focus on its first tool', !!q('.bt-draw-fly') && document.activeElement === q('.bt-draw-fly [data-fly-tool="long"]'));
    await press('ArrowDown');
    ok('arrow down moves through the menu', document.activeElement === q('.bt-draw-fly [data-fly-tool="short"]'));
    await press('Escape');
    ok('Esc: closed, focus back on the button', !q('.bt-draw-fly') && document.activeElement === gbtn('long'));

    // --- drag and drop on the bar
    await drag(mid(gbtn('rect')), topOf(gbtn('trend')));
    ok('drag: rectangle moved to the front', J(groups()) === J(['rect', 'trend ray hline', 'fib', 'long short', 'text', 'measure']), J(groups()));
    ok('the click that ends a drag picks nothing', T().draw().tool() === 'cursor');
    await drag(mid(gbtn('fib')), mid(gbtn('trend')));
    ok('drag: fibonacci dropped on the lines button joins that group', J(groups()) === J(['rect', 'trend ray hline fib', 'long short', 'text', 'measure']), J(groups()));
    await drag(mid(gbtn('measure')), bottomOf(gbtn('measure')));
    ok('drag onto its own place: nothing changes', J(groups()).indexOf('measure') > 0 && groups().length === 5);
    // Esc while dragging: no change
    var before = J(groups());
    await drag(mid(gbtn('text')), topOf(gbtn('rect')), async function () { ok('while dragging: a drop line is shown', !!q('.bt-draw-drop-line:not([hidden])')); await press('Escape'); });
    ok('Esc during a drag: nothing moves', J(groups()) === before && !q('.bt-draw-ghost') && !document.body.classList.contains('bt-draw-dragging'));

    // --- a tool from the menu
    await click(corner(gbtn('trend')));
    ok('the lines menu lists fibonacci now', J(menuTools()) === J(['trend', 'ray', 'hline', 'fib']), J(menuTools()));
    await drag(mid(q('.bt-draw-fly [data-fly-tool="hline"]')), topOf(q('.bt-draw-fly [data-fly-tool="trend"]')));
    ok('menu: horizontal line moved to the top of its group (menu stays open)', J(menuTools()) === J(['hline', 'trend', 'ray', 'fib']) && groups()[1] === 'hline trend ray fib', J(menuTools()));
    await drag(mid(q('.bt-draw-fly [data-fly-tool="fib"]')), bottomOf(gbtn('measure')));
    ok('menu: fibonacci dragged to the end of the bar gets its own button', J(groups()) === J(['rect', 'hline trend ray', 'long short', 'text', 'measure', 'fib']), J(groups()));
    await click(corner(gbtn('ray')));
    await drag(mid(q('.bt-draw-fly [data-fly-tool="ray"]')), mid(gbtn('long')));
    ok('menu: ray dropped on the positions button joins it', J(groups()) === J(['rect', 'hline trend', 'long short ray', 'text', 'measure', 'fib']), J(groups()));
    ok('stored in the browser', J((stored() || []).map(function (g) { return g.t.join(' '); })) === J(groups()));

    // --- the tools still work, then reset
    await click(corner(gbtn('ray')));
    await click(mid(q('.bt-draw-fly [data-fly-tool="ray"]')));
    ok('a moved tool still picks', T().draw().tool() === 'ray'); await press('Escape');
    await click(mid(gbtn('fib')), { button: 'right' });
    ok('reset is enabled after changes', !q('.bt-draw-fly [data-fly-act="reset"]').disabled);
    await click(mid(q('.bt-draw-fly [data-fly-act="reset"]')));
    ok('reset: the default toolbar again', J(groups()) === J(['trend ray hline', 'rect', 'fib', 'long short', 'text', 'measure']), J(groups()));
    var n0 = T().draw().set.list().length;
    await click(mid(gbtn('rect'))); await drag(P(0.3, 0.5), P(0.5, 0.7));
    ok('drawing after all this: a rectangle', T().draw().set.list().length === n0 + 1);
    // screenshot run: the lines menu open
    if (/[?&]shot=1/.test(location.search)) { await click(corner(gbtn('trend'))); await move(mid(q('.bt-draw-fly [data-fly-tool="ray"]'))); await sleep(200); }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var el = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  el.textContent = out.join('\n');
})();
