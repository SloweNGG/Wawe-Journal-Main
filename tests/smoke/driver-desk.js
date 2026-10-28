// Window system (bt-desk.js) with REAL mouse and keyboard (window.__pp from run.mjs): move by the title bar, resize from edges and
// corners (minimum sizes), front on click, minimize to the taskbar and back, maximize (button, double click) and restore, close
// and reopen from the menu, snap to a half / the whole desk / a quarter with a preview, magnet, the chart redrawn at the new size,
// presets (multi-chart Premium only), named layouts (free 1), reset, storage per user, keyboard, Simple mode and the phone.
// ?plan=premium|free, ?phone=1.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium', phone = qp.get('phone') === '1';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp, W = window.WwBtDesk;
  function win(id) { return q('.bt-win[data-win="' + id + '"]'); }
  function vis(e) { if (typeof e === 'string') e = $(e); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }
  function box(id) { var d = $('bt-desk').getBoundingClientRect(), r = win(id).getBoundingClientRect(); return { x: Math.round(r.left - d.left), y: Math.round(r.top - d.top), w: Math.round(r.width), h: Math.round(r.height) }; }
  function abs(id) { var r = win(id).getBoundingClientRect(); return r; }
  function headPt(id) { var r = win(id).querySelector('.bt-win-head').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; }
  function rzPt(id, h) { var r = win(id).querySelector('.bt-win-rz[data-rz="' + h + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function deskR() { return $('bt-desk').getBoundingClientRect(); }
  async function move(a, steps) { await pp({ op: 'move', x: a.x, y: a.y, steps: steps || 1 }); }
  async function drag(a, b, mid) { await move(a); await pp({ op: 'down' }); await move(b, 10); if (mid) await mid(); await pp({ op: 'up' }); await sleep(150); }
  async function click(a, o) { await pp(Object.assign({ op: 'click', x: a.x, y: a.y }, o || {})); await sleep(150); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  function btnPt(id, act) { var r = win(id).querySelector('[data-win-act="' + act + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function lay() { return T().desk().layout(); }
  function J(x) { return JSON.stringify(x); }
  function near(a, b, e) { return Math.abs(a - b) <= (e == null ? 2 : e); }
  // bring a window to the front through its taskbar entry (its title bar may be under another window)
  async function toFront(id) { if (lay().z[lay().z.length - 1] === id) return; var t = q('.bt-task[data-task="' + id + '"]').getBoundingClientRect(); await click({ x: t.left + t.width / 2, y: t.top + t.height / 2 }); }
  async function menu(on) { if ($('bt-panels-pop').hidden === on) { $('bt-panels-btn').click(); await sleep(120); } }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Desk'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    // the plan decides the view: free = the simple view (fixed layout without frames), Premium = windows
    await sleep(300);
    if (!pro) {
      ok('simple: fixed layout, no title bars, no taskbar', $('bt-desk').getAttribute('data-desk') === 'simple' && !vis(q('.bt-win-head')) && !vis(q('.bt-taskbar')));
      ok('simple: replay, chart, balance and order shown; the tables are not', ['replay', 'chart', 'balance', 'order'].every(function (id) { return vis(win(id)); }) && !vis(win('open')) && !vis(win('history')));
      var cs = abs('chart'), os = abs('order');
      ok('simple: chart left, order panel right', cs.right <= os.left + 1 && cs.width > os.width);
      ok('free: no window menu, no multi-chart button, no view switch', !vis('bt-panels-btn') && !vis('bt-layout-btn') && !q('[data-bt-mode]'));
      throw 'done';
    }
    await sleep(200);
    if (phone) {
      ok('phone: windows stacked at full width', $('bt-desk').getAttribute('data-desk') === 'stack' && ['chart', 'order', 'open', 'history'].every(function (id) { return vis(win(id)) && near(abs(id).width, deskR().width, 2); }));
      var c0 = J(box('order'));
      await drag(headPt('order'), { x: headPt('order').x + 40, y: headPt('order').y + 200 });
      ok('phone: dragging a title moves nothing', J(box('order')) === c0 && !vis(q('.bt-desk-preview')), c0 + ' vs ' + J(box('order')));
      ok('phone: no resize handles, no window buttons, no taskbar', !vis(q('.bt-win-rz')) && !vis(q('.bt-win-btns')) && !vis(q('.bt-taskbar')));
      ok('phone: no horizontal scroll', document.documentElement.scrollWidth <= window.innerWidth + 1, document.documentElement.scrollWidth);
      return;
    }
    ok('advanced: free desk, classic layout', $('bt-desk').getAttribute('data-desk') === 'free' && lay().preset === 'classic');
    ok('windows: replay, chart, balance, order, open, pending orders shown; history in the taskbar; statistics closed',
      ['replay', 'chart', 'balance', 'order', 'open', 'orders'].every(function (id) { return vis(win(id)); }) && !vis(win('history')) && !vis(win('stats')));
    ok('each window has a title bar; the chart has no close button', vis(win('order').querySelector('.bt-win-head')) && vis(win('order').querySelector('[data-win-act="close"]')) && !vis(win('chart').querySelector('[data-win-act="close"]')));
    var tasks = [].map.call(document.querySelectorAll('.bt-taskbar .bt-task'), function (b) { return b.getAttribute('data-task'); });
    ok('taskbar lists the open windows, history marked as minimized', tasks.join() === 'replay,chart,draw,balance,order,open,orders,history' && q('.bt-task[data-task="history"]').classList.contains('bt-task-min'), tasks.join());

    // --- move by the title bar
    var b0 = box('balance'), h0 = headPt('balance');
    await drag(h0, { x: h0.x - 300, y: h0.y + 200 });
    var b1 = box('balance');
    ok('move: balance window followed the title bar (within the magnet)', near(b1.x, b0.x - 300, 12) && near(b1.y, b0.y + 200, 12) && b1.w === b0.w && b1.h === b0.h, J(b0) + ' -> ' + J(b1));
    ok('moved window in front', lay().z[lay().z.length - 1] === 'balance' && win('balance').classList.contains('bt-win-front'));
    await sleep(250);
    var key = Object.keys(localStorage).filter(function (k) { return k.indexOf('ww_bt_desk_v1:') === 0; })[0], stored = key ? JSON.parse(localStorage.getItem(key)) : null;
    ok('stored per user (localStorage ww_bt_desk_v1:<user>)', !!stored && key !== 'ww_bt_desk_v1:anon' && near(stored.wins.balance.x, lay().wins.balance.x, 0.001), key);
    // front on click
    var ob = abs('open'); await click({ x: ob.left + ob.width / 2, y: ob.top + ob.height - 20 });
    ok('click in a window brings it to the front', lay().z[lay().z.length - 1] === 'open' && +win('open').style.zIndex > +win('balance').style.zIndex);

    // --- resize from edges and corners, minimum size
    var r0 = box('balance');
    await drag(rzPt('balance', 'se'), { x: rzPt('balance', 'se').x + 80, y: rzPt('balance', 'se').y + 60 });
    var r1 = box('balance');
    ok('corner se: wider and taller, top-left fixed', near(r1.w, r0.w + 80, 12) && near(r1.h, r0.h + 60, 12) && r1.x === r0.x && r1.y === r0.y, J(r0) + ' -> ' + J(r1));
    await drag(rzPt('balance', 'w'), { x: rzPt('balance', 'w').x + 1200, y: rzPt('balance', 'w').y });
    var r2 = box('balance');
    ok('edge w: stops at the minimum width, right edge stays', r2.w === W.MIN.balance[0] && near(r2.x + r2.w, r1.x + r1.w, 1), J(r2));
    await drag(rzPt('balance', 'n'), { x: rzPt('balance', 'n').x, y: rzPt('balance', 'n').y + 900 });
    ok('edge n: stops at the minimum height', box('balance').h === W.MIN.balance[1], J(box('balance')));
    ok('cursor on edges: ew-resize / nwse-resize', getComputedStyle(win('balance').querySelector('[data-rz="e"]')).cursor === 'ew-resize' && getComputedStyle(win('balance').querySelector('[data-rz="se"]')).cursor === 'nwse-resize');

    // --- chart redrawn at the new size
    var cw0 = T().chart().timeScale().width();
    await drag(rzPt('chart', 'e'), { x: rzPt('chart', 'e').x - 200, y: rzPt('chart', 'e').y }); await sleep(300);
    var cw1 = T().chart().timeScale().width();
    ok('chart window narrower: the chart redraws at the new width', near(cw0 - cw1, 200, 14) && Math.abs(q('#bt-chart table').getBoundingClientRect().width - $('bt-chart').getBoundingClientRect().width) <= 2, cw0 + ' -> ' + cw1);

    // --- minimize, taskbar, restore
    await click(btnPt('order', 'min'));
    ok('minimize: hidden, in the taskbar as minimized', !vis(win('order')) && q('.bt-task[data-task="order"]').classList.contains('bt-task-min'));
    var tb = q('.bt-task[data-task="order"]').getBoundingClientRect(); await click({ x: tb.left + tb.width / 2, y: tb.top + tb.height / 2 });
    ok('taskbar click restores it in front', vis(win('order')) && lay().z[lay().z.length - 1] === 'order' && lay().wins.order.st === 'normal');
    tb = q('.bt-task[data-task="order"]').getBoundingClientRect(); await click({ x: tb.left + tb.width / 2, y: tb.top + tb.height / 2 });
    ok('taskbar click on the front window minimizes it (like Windows)', !vis(win('order')));
    tb = q('.bt-task[data-task="order"]').getBoundingClientRect(); await click({ x: tb.left + tb.width / 2, y: tb.top + tb.height / 2 });

    // --- maximize and restore (button and double click)
    var m0 = box('open');
    await click(btnPt('open', 'max'));
    var dr = deskR(), m1 = box('open');
    ok('maximize: the whole desk above the taskbar', near(m1.x, 4) && near(m1.y, 4) && near(m1.w, dr.width - 8) && near(m1.h, dr.height - W.TASKBAR - 8) && win('open').getAttribute('data-st') === 'max', J(m1));
    ok('max button now says restore', /Önceki boyut|Restore/.test(win('open').querySelector('[data-win-act="max"]').title));
    await click(headPt('open'), { count: 2 });
    ok('double click on the title restores the size before', J(box('open')) === J(m0), J(m0) + ' vs ' + J(box('open')));
    await click(headPt('open'), { count: 2 });
    ok('double click maximizes', win('open').getAttribute('data-st') === 'max');
    // dragging a maximized window: back to its free size under the pointer
    var hp = headPt('open');
    await drag(hp, { x: hp.x + 200, y: hp.y + 160 });
    var m2 = box('open');
    ok('dragging a maximized window restores its free size', win('open').getAttribute('data-st') === 'normal' && near(m2.w, m0.w, 1) && near(m2.h, m0.h, 1), J(m2));

    // --- close and reopen from the menu (its title bar first: another window may cover the buttons)
    await toFront('orders'); await click(btnPt('orders', 'close'));
    ok('close: window and taskbar entry gone', !vis(win('orders')) && !q('.bt-task[data-task="orders"]'));
    await menu(true);
    var cb = q('#bt-panels-pop [data-win-toggle="orders"]');
    ok('menu lists it unchecked', !!cb && !cb.checked);
    cb.click(); await sleep(150);
    ok('menu brings it back in front', vis(win('orders')) && lay().z[lay().z.length - 1] === 'orders');
    q('#bt-panels-pop [data-win-toggle="stats"]').click(); await sleep(400);
    ok('statistics window from the menu, with its widgets', vis(win('stats')) && document.querySelectorAll('#bt-stats-view .bt-st-w').length >= 2, document.querySelectorAll('#bt-stats-view .bt-st-w').length);
    if (pro) ok('statistics charts have an enlarge button', !!q('#bt-stats-view [data-w-act="expand"]'));
    await menu(false);

    // --- snap: left half (preview while dragging), top = maximized, corner = quarter
    var D0 = deskR(), seen = null;
    await toFront('balance'); hp = headPt('balance');
    await drag(hp, { x: D0.left + 2, y: D0.top + D0.height / 2 }, async function () { await sleep(60); var pv = q('.bt-desk-preview'); seen = vis(pv) ? pv.getBoundingClientRect() : null; });
    var dsz = { w: D0.width, h: D0.height - W.TASKBAR }, zl = W.zoneRect('left', dsz), bl = box('balance');
    ok('snap left: a preview showed the left half while dragging', !!seen && near(seen.width, zl.w, 2) && near(seen.height, zl.h, 2), seen ? seen.width + 'x' + seen.height : 'no preview');
    ok('snap left: the window takes the left half', near(bl.x, zl.x, 2) && near(bl.w, zl.w, 2) && near(bl.h, zl.h, 2), J(bl) + ' zone ' + J(zl));
    hp = headPt('balance');
    await drag(hp, { x: D0.right - 2, y: D0.top + 3 });
    var zq = W.zoneRect('tr', dsz), bq = box('balance');
    ok('snap top-right corner: a quarter', near(bq.x, zq.x, 2) && near(bq.y, zq.y, 2) && near(bq.w, zq.w, 2) && near(bq.h, zq.h, 2), J(bq) + ' zone ' + J(zq));
    hp = headPt('balance');
    await drag(hp, { x: D0.left + D0.width / 2, y: D0.top + 2 });
    ok('snap top: maximized', win('balance').getAttribute('data-st') === 'max');
    await click(btnPt('balance', 'max'));

    // --- magnet: dropped 5 px off the chart window's right edge + gap, it sticks at the gap
    await toFront('balance');
    var cr = box('chart'), bb = box('balance'), hb = headPt('balance');
    await drag(hb, { x: hb.x + (cr.x + cr.w + W.GAP + 5 - bb.x), y: hb.y + (cr.y + 40 - bb.y) });
    var bm = box('balance');
    ok('magnet: next to the chart window with the gap', bm.x === cr.x + cr.w + W.GAP, (cr.x + cr.w + W.GAP) + ' vs ' + bm.x);

    // --- keyboard on a title bar
    var kb = box('balance'); win('balance').querySelector('.bt-win-head').focus();
    await press('ArrowRight');
    ok('keyboard: arrow moves the window by 16 px', box('balance').x === kb.x + 16, J(box('balance')));
    await pp({ op: 'key', key: 'Shift', type: 'down' }); await press('ArrowDown'); await pp({ op: 'key', key: 'Shift', type: 'up' }); await sleep(60);
    ok('keyboard: Shift + arrow resizes', box('balance').h === kb.h + 16, J(box('balance')));

    // --- presets, named layouts, reset
    await menu(true);
    q('#bt-panels-pop [data-preset="focus"]').click(); await sleep(400);
    ok('preset Focus: chart large, tables closed', lay().preset === 'focus' && !vis(win('open')) && !vis(win('history')) && box('chart').w > deskR().width * 0.65);
    q('#bt-panels-pop [data-preset="analysis"]').click(); await sleep(500);
    ok('preset Analysis: statistics and history open, order panel in the taskbar', vis(win('stats')) && vis(win('history')) && !vis(win('order')) && q('.bt-task[data-task="order"]').classList.contains('bt-task-min'));
    window.__upgrade = false;
    q('#bt-panels-pop [data-preset="multi"]').click(); await sleep(900);
    if (pro) {
      ok('preset Multi-chart: four chart windows in a 2x2', ['chart', 'chart2', 'chart3', 'chart4'].every(function (id) { return vis(win(id)); }) && T().R().extra.length === 3 && near(box('chart').w, box('chart2').w, 3) && near(box('chart').y, box('chart2').y, 1));
      var ex = T().R().extra[0];
      ok('each extra chart sits in its own window and is drawn', win('chart2').contains(ex.el) && ex.chart.timeScale().width() > 100);
      await drag(rzPt('chart2', 'sw'), { x: rzPt('chart2', 'sw').x + 60, y: rzPt('chart2', 'sw').y - 40 }); await sleep(300);
      ok('an extra chart window resizes and its chart follows', Math.abs(ex.el.querySelector('table').getBoundingClientRect().width - ex.el.getBoundingClientRect().width) <= 2);
    } else {
      ok('free: Multi-chart opens the upgrade window, one chart stays', window.__upgrade === true && !vis(win('chart2')) && T().R().extra.length === 0 && /PRO/.test(q('#bt-panels-pop [data-preset="multi"]').textContent));
    }
    // named layouts (the menu closes when the mouse is used outside it)
    await menu(true);
    var name = q('#bt-panels-pop [data-desk-name]');
    name.focus(); await pp({ op: 'type', text: 'Sabah' }); await press('Enter'); await sleep(200);
    ok('save a named layout', lay().saved.length === 1 && lay().saved[0].name === 'Sabah' && !!q('#bt-panels-pop .bt-desk-load[data-name="Sabah"]'));
    var saved = J(lay().saved[0].wins.chart);
    q('#bt-panels-pop [data-preset="classic"]').click(); await sleep(500);
    name = q('#bt-panels-pop [data-desk-name]'); name.focus(); await pp({ op: 'type', text: 'Akşam' }); await press('Enter'); await sleep(200);
    if (pro) ok('premium: a second named layout', lay().saved.length === 2);
    else ok('free: only one named layout (upgrade offered)', lay().saved.length === 1 && window.__upgrade === true);
    q('#bt-panels-pop .bt-desk-load[data-name="Sabah"]').click(); await sleep(600);
    ok('load a named layout: windows back where they were', J(lay().wins.chart) === saved && (pro ? T().R().extra.length === 3 : T().R().extra.length === 0));
    q('#bt-panels-pop [data-desk-act="reset"]').click(); await sleep(500);
    ok('reset: Classic layout, one chart', lay().preset === 'classic' && T().R().extra.length === 0 && vis(win('open')) && !vis(win('stats')));
    await menu(false);
    ok('no window outside the desk', ['replay', 'chart', 'balance', 'order', 'open', 'orders'].every(function (id) { var b = box(id), d = deskR(); return b.x >= 0 && b.y >= 0 && b.x + b.w <= d.width + 1 && b.y + b.h <= d.height + 1; }));
    // the pending orders window is the one the order panel fills
    document.querySelector('#bt-ordtype [data-ordtype="limit"]').click(); await sleep(60);
    var Eo = window.WwBtEngine, Ro = T().R(), qo = Eo.quote(Ro.eng);
    setv('bt-ord-price', Eo.ptsToStr(qo.ask - 40, Ro.sym.digits)); $('bt-buy-btn').click(); await sleep(200);
    ok('a limit order shows in the pending orders window', $('bt-orders-body').children.length === 1 && $('bt-orders-count').textContent === '1' && vis(win('orders')));
    document.querySelector('#bt-ordtype [data-ordtype="market"]').click();
  } catch (e) { if (e !== 'done') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
