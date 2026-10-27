// Drawing tools scenario with real pointer events. ?plan=free|premium, works with the local backend and with
// ?backend=supabase (FakeDb emulating 202610240001). Checks that drawings keep their time/price place across a timeframe
// change and a replay step, that no candle beyond the replay cursor is ever on the chart, and the plan rules.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium', sb = qp.get('backend') === 'supabase';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function key(k, o) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o || {}))); }
  var T = function () { return window.__btTest; }, D = window.WwBtDraw;
  function list() { return T().draw().set.list(); }
  function rect() { return $('bt-chart').getBoundingClientRect(); }
  // client coordinates of a (time, price) point on the current chart, computed like the drawing layer does
  function xy(t, p) {
    var ch = T().chart(), ts = ch.timeScale(), bars = T().bars(), tf = T().tfSec(), x0 = ts.logicalToCoordinate(0), x1 = ts.logicalToCoordinate(1);
    var r = rect(); return { x: r.left + x0 + D.timeToLogical(bars, tf, t) * (x1 - x0), y: r.top + T().series().priceToCoordinate(p) };
  }
  function ptr(type, x, y, buttons) {
    var tgt = document.elementFromPoint(x, y) || $('bt-chart');
    tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: buttons == null ? 1 : buttons, isPrimary: true }));
  }
  async function drag(a, b) { ptr('pointerdown', a.x, a.y); await sleep(20); ptr('pointermove', (a.x + b.x) / 2, (a.y + b.y) / 2); ptr('pointermove', b.x, b.y); await sleep(20); ptr('pointerup', b.x, b.y, 0); await sleep(80); }
  async function click(p) { ptr('pointerdown', p.x, p.y); await sleep(15); ptr('pointerup', p.x, p.y, 0); await sleep(60); }
  function mid(d) { var a = xy(d.pts[0].t, d.pts[0].p), b = xy(d.pts[1].t, d.pts[1].p); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  // index of the revealed bar at a fraction of the visible range (always inside the pane)
  function visIdx(f) { var vr = T().chart().timeScale().getVisibleLogicalRange(), n = T().bars().length; return Math.max(0, Math.min(n - 1, Math.round(vr.from + (Math.min(vr.to, n - 1) - vr.from) * f))); }
  function lastBarTime() { var b = T().bars(); return b[b.length - 1].time; }
  function replaySec() { var R = T().R(); return R.win.t[R.k] + 60; }
  function saved() {
    if (sb) return (window.__db.tables.backtest_drawings || []);
    try { return JSON.parse(localStorage.getItem('ww-bt-drawings-test') || '[]'); } catch (e) { return []; }
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && (!sb || window.__db); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Draw'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    var acc = T().R().acc.id;
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(30); }
    await sleep(150);
    var bar = $('bt-draw-bar');
    ok('drawing toolbar with cursor + 9 tools in the ' + (pro ? 'advanced' : 'simple') + ' view (the plan decides the view)', $('bt-root').getAttribute('data-mode') === (pro ? 'advanced' : 'simple') && bar.querySelectorAll('[data-tool]').length === 10 && bar.getBoundingClientRect().width > 20);
    var tags = bar.querySelectorAll('.bt-pro').length, plan = pro ? 'premium' : 'free';
    ok(plan + ': no PRO tags on the tools (drawings are free for every plan)', tags === 0, tags);
    // a trend line by dragging
    var bars = T().bars(), n = bars.length, r = rect();
    var A = xy(bars[n - 30].time, bars[n - 30].low), B = xy(bars[n - 8].time, bars[n - 8].high);
    key('1'); await sleep(50);
    ok('key 1 picks the trend tool', T().draw().tool() === 'trend');
    var n0 = T().bars().length;
    await drag(A, B);
    ok('trend line drawn by dragging, tool back to the cursor, drawing selected', list().length === 1 && list()[0].tool === 'trend' && T().draw().tool() === 'cursor' && T().draw().set.selected() === list()[0].id, JSON.stringify(list()[0]));
    var d = list()[0];
    ok('stored with time and price: the start sits inside its candle', d.pts[0].t >= bars[n - 30].time && d.pts[0].t < bars[n - 29].time && Math.abs(d.pts[0].p - bars[n - 30].low) < Math.abs(bars[n - 30].high - bars[n - 30].low) / 10 + 1e-9, JSON.stringify(d.pts[0]) + ' bar ' + bars[n - 30].time);
    ok('drawing did not add or reveal candles', T().bars().length === n0 && lastBarTime() < replaySec());
    await sleep(600);
    ok(plan + ': saved to the account', saved().filter(function (x) { return x.id === d.id; }).length === 1, JSON.stringify(saved()).slice(0, 200));
    // click elsewhere deselects, click on the line selects
    await click({ x: r.left + 40, y: r.top + 20 }); ok('click on empty chart deselects', T().draw().set.selected() === null);
    await click(mid(d)); ok('click on the line selects it', T().draw().set.selected() === d.id);
    // timeframe change: same times and prices, still under the pointer
    setv('bt-tf', '15m');
    await waitFor(function () { return T().tfSec() === 900 && T().bars().length > 50; }, 20000, 'M15');
    await sleep(800);
    ok('M15: points unchanged', JSON.stringify(list()[0].pts) === JSON.stringify(d.pts));
    var mb = T().bars(), l0 = D.timeToLogical(mb, 900, d.pts[0].t), i0 = Math.floor(l0);
    ok('M15: the start time falls inside the matching M15 candle', mb[i0].time <= d.pts[0].t && d.pts[0].t < mb[i0].time + 900, mb[i0].time + ' <= ' + d.pts[0].t);
    T().chart().timeScale().setVisibleLogicalRange({ from: l0 - 20, to: D.timeToLogical(mb, 900, d.pts[1].t) + 20 }); await sleep(200);
    await click({ x: r.left + 40, y: r.top + 20 }); await click(mid(list()[0]));
    ok('M15: the line is still under its time/price coordinates (click selects it)', T().draw().set.selected() === d.id);
    setv('bt-tf', '1h'); await waitFor(function () { return T().tfSec() === 3600; }, 20000, 'H1'); await sleep(800);
    // replay forward: never a future candle, drawing unchanged
    for (i = 0; i < 25; i++) { $('bt-step-btn').click(); await sleep(25); }
    await sleep(300);
    ok('replay forward: drawing unchanged', JSON.stringify(list()[0].pts) === JSON.stringify(d.pts));
    ok('replay forward: the last candle on the chart is never later than the replay time', lastBarTime() < replaySec(), lastBarTime() + ' < ' + replaySec());
    // drag the body: moves; lock: does not move
    T().chart().timeScale().setVisibleLogicalRange({ from: D.timeToLogical(T().bars(), 3600, d.pts[0].t) - 10, to: D.timeToLogical(T().bars(), 3600, d.pts[1].t) + 10 }); await sleep(200);
    await click(mid(list()[0]));
    var m1 = mid(list()[0]); await drag(m1, { x: m1.x + 40, y: m1.y + 25 });
    var moved = list()[0];
    ok('dragging the selected line moves both points', moved.pts[0].t > d.pts[0].t && moved.pts[1].t > d.pts[1].t && moved.pts[0].p < d.pts[0].p, JSON.stringify(moved.pts));
    bar.querySelector('[data-act="lock"]').click(); await sleep(80);
    ok('lock: stored on the drawing', list()[0].locked === true);
    var m2 = mid(list()[0]); await drag(m2, { x: m2.x + 60, y: m2.y });
    ok('locked drawing does not move', JSON.stringify(list()[0].pts) === JSON.stringify(moved.pts));
    key('Delete'); await sleep(50);
    ok('locked drawing is not deleted with Del', list().length === 1);
    bar.querySelector('[data-act="lock"]').click(); await sleep(50);
    // hide: not selectable; show again
    key('Escape'); await sleep(30);
    bar.querySelector('[data-act="hide"]').click(); await sleep(50);
    await click(mid(list()[0]));
    ok('hidden drawings cannot be selected', T().draw().set.selected() === null);
    bar.querySelector('[data-act="hide"]').click(); await sleep(50);
    // magnet: a horizontal line snaps to an OHLC value
    T().chart().timeScale().scrollToRealTime(); await sleep(1300);   // the scroll is animated
    key('m'); await sleep(30);
    var b2 = T().bars(), k2 = visIdx(0.8), pm = xy(b2[k2].time, (b2[k2].high + b2[k2].low) / 2 + (b2[k2].high - b2[k2].low) * 0.3);
    key('2'); await sleep(30); await click(pm);
    var hl = list().filter(function (x) { return x.tool === 'hline'; })[0];
    ok('magnet: the horizontal line sits on an open/high/low/close of the candle', !!hl && [b2[k2].open, b2[k2].high, b2[k2].low, b2[k2].close].some(function (v) { return Math.abs(v - hl.pts[0].p) < 1e-9; }), hl ? JSON.stringify({ p: hl.pts[0].p, t: hl.pts[0].t, bar: b2[k2] }) : 'tool ' + T().draw().tool() + ' list ' + list().map(function (x) { return x.tool; }) + ' at ' + JSON.stringify([pm.x - rect().left, pm.y - rect().top, rect().width, rect().height]) + ' el ' + (document.elementFromPoint(pm.x, pm.y) || {}).tagName + ' modal ' + !!document.querySelector('.bt-modal.active'));
    key('m'); await sleep(30);
    // the other tools (every plan)
    var before = list().length;
    key('3'); await sleep(30);
    ok(plan + ': key 3 picks the ray, no upgrade window', T().draw().tool() === 'ray' && window.__upgrade !== true);
    {
      k2 = visIdx(0.9);
      var P1 = xy(b2[k2 - 20].time, b2[k2 - 20].close), P2 = xy(b2[k2 - 5].time, b2[k2 - 5].high);
      await drag(P1, P2);                                                          // ray
      key('5'); await sleep(30); await drag(P1, P2);                               // fib
      key('6'); await sleep(30); await click(xy(b2[k2 - 10].time, b2[k2 - 10].close));   // long position
      key('7'); await sleep(30); await click(xy(b2[k2 - 12].time, b2[k2 - 12].close));   // short position
      key('9'); await sleep(30); await click(P1); await sleep(30); ptr('pointermove', P2.x, P2.y, 0); await sleep(30); await click(P2);   // measure: click, move, click
      key('8'); await sleep(30); await click(xy(b2[k2 - 15].time, b2[k2 - 15].high));
      await waitFor(function () { return document.querySelector('#bt-chart .bt-draw-edit'); }, 3000, 'text editor');
      var te = document.querySelector('#bt-chart .bt-draw-edit'); te.value = 'Destek';
      te.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await sleep(100);
      var tools = list().map(function (x) { return x.tool; }).sort().join(',');
      ok(plan + ': ray, fib, long, short, measure and text drawn', list().length === before + 6 && /fib/.test(tools) && /long/.test(tools) && /short/.test(tools) && /measure/.test(tools) && /ray/.test(tools) && /text/.test(tools), tools);
      var lg = list().filter(function (x) { return x.tool === 'long'; })[0];
      ok('long position tool: target above, stop below the entry', lg.pts[1].p > lg.pts[0].p && lg.pts[2].p < lg.pts[0].p);
      ok('text stored', list().filter(function (x) { return x.tool === 'text'; })[0].text === 'Destek');
      await sleep(600);
      ok(plan + ': every drawing saved to the account', saved().filter(function (x) { return x.backtest_account_id === acc; }).length === list().length, saved().length + ' vs ' + list().length);
    }
    // delete with the key
    var cnt = list().length, tl = list().filter(function (x) { return x.tool === 'trend'; })[0];
    T().chart().timeScale().setVisibleLogicalRange({ from: D.timeToLogical(T().bars(), 3600, tl.pts[0].t) - 10, to: D.timeToLogical(T().bars(), 3600, tl.pts[1].t) + 10 }); await sleep(200);
    await click({ x: r.left + 40, y: r.top + 20 }); await click(mid(tl)); key('Delete'); await sleep(700);
    ok('Del removes the selected drawing', list().length === cnt - 1);
    ok(plan + ': the delete reached the account', saved().filter(function (x) { return x.backtest_account_id === acc; }).length === cnt - 1);
    // reopen: the drawings come from the account
    var keep = list().length;
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && list().length === keep; }, 30000, 'reopen with drawings');
    ok('reopened account shows its drawings', list().length === keep, list().length + ' / ' + keep);
    {
      sessionStorage.removeItem('ww_bt_draw:' + acc);
      $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
      document.querySelector('.bt-account-card[data-id]').click();
      await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && list().length === keep; }, 30000, 'reopen from the account');
      ok(plan + ': drawings come back from the account alone (no session copy)', list().length === keep);
    }
    ok('the toolbar stays in the view', bar.getBoundingClientRect().width > 20);
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
