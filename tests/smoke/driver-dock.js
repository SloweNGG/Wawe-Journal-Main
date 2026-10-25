// Stage 2 (2026-10-25): movable panels (bt-dock.js), statistics in their own panel / full screen, statistics widgets (move, resize,
// hide, enlarge), multi-chart cell swap and track sizes, per-user layout with reset; phones stack the panels and never drag.
// Local backend, synthetic EUR/USD. ?phone=1 for the phone viewport, plan=free|premium.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), phone = qp.get('phone') === '1', pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function qa(s) { return document.querySelectorAll(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function vis(e) { if (typeof e === 'string') e = $(e); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function key(k, o) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o || {}))); }
  function zoneOf(id) { var p = q('[data-panel="' + id + '"]'); var z = p && p.parentNode; return z && z.getAttribute('data-zone'); }
  function panel(id) { return q('[data-panel="' + id + '"]'); }
  function layout() { var k = Object.keys(localStorage).filter(function (x) { return x.indexOf('ww_bt_dock_v1:') === 0; })[0]; return k ? JSON.parse(localStorage.getItem(k)) : null; }
  function noHScroll() { return document.documentElement.scrollWidth <= window.innerWidth + 1; }
  function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function pe(type, target, x, y) { (target || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pointerType: 'mouse' })); }
  // drag a panel by its grip to (x, y); returns whether the drop preview was visible on the way
  async function dragTo(grip, x, y) {
    var s = center(grip), seen = false;
    pe('pointerdown', grip, s.x, s.y);
    for (var i = 1; i <= 6; i++) { pe('pointermove', document, s.x + (x - s.x) * i / 6, s.y + (y - s.y) * i / 6); await sleep(20); if (vis(q('.bt-dock-preview'))) seen = true; }
    pe('pointerup', document, x, y); await sleep(250);
    return seen;
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Dock'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    // a few closed trades for the statistics
    for (var n = 0; n < 3; n++) {
      for (var i = 0; i < 6; i++) { $('bt-step-btn').click(); await sleep(15); }
      (n % 2 ? $('bt-sell-btn') : $('bt-buy-btn')).click(); await sleep(120);
      for (i = 0; i < 4; i++) { $('bt-step-btn').click(); await sleep(15); }
      var cb = q('#bt-mini-pos-list button[data-act="close"]') || q('#bt-open-body button[data-act="close"]'); if (cb) cb.click(); await sleep(250);
    }
    // simple mode: fixed arrangement, no panel heads
    ok('simple: chart center, balance and orders right, no headers', zoneOf('chart') === 'center' && zoneOf('balance') === 'right' && zoneOf('order') === 'right' && !vis(q('[data-panel="balance"] .bt-pbox-head')) && !vis(panel('tabs')));
    q('[data-bt-mode="advanced"]').click(); await sleep(300);
    ok('advanced default: tabs below the chart, panels menu button', zoneOf('tabs') === 'bottom' && vis(panel('tabs')) && vis('bt-panels-btn'));
    if (phone) {
      var cy = panel('chart').getBoundingClientRect().top, by = panel('balance').getBoundingClientRect().top, oy = panel('order').getBoundingClientRect().top, ty = panel('tabs').getBoundingClientRect().top;
      ok('phone: panels stacked (chart, balance, orders, tabs)', cy < by && by < oy && oy < ty, [cy, by, oy, ty].map(Math.round).join(' < '));
      ok('phone: no grips, no splitters, no horizontal scroll', !vis(q('.bt-grip')) && !vis(q('[data-zsplit="right"]')) && noHScroll());
      var before = zoneOf('balance');
      await dragTo(q('[data-panel="balance"] .bt-pbox-head'), 5, 300);
      ok('phone: dragging a header does not move the panel', zoneOf('balance') === before && !vis(q('.bt-dock-preview')));
      $('bt-tab-stats').click(); await sleep(300);
      ok('phone: statistics widgets stacked in one column, no drag/resize handles', !!q('.bt-st-widgets') && getComputedStyle(q('.bt-st-widgets')).getPropertyValue('--bt-st-cols').trim() === '1' && !vis(q('.bt-st-rsz')) && !vis(q('.bt-st-grip')));
      ok('phone: statistics without horizontal scroll', noHScroll(), document.documentElement.scrollWidth + ' > ' + window.innerWidth);
    } else {
      // drag the balance card to the left edge: preview on the way, then the left zone
      var dock = $('bt-dock').getBoundingClientRect();
      var seen = await dragTo(q('[data-panel="balance"] .bt-grip'), dock.left + 10, dock.top + dock.height / 2);
      ok('drag balance to the left edge: preview shown, panel in the left zone', seen && zoneOf('balance') === 'left' && vis(panel('balance')), zoneOf('balance'));
      ok('left zone edge splitter shown', vis(q('[data-zsplit="left"]')));
      ok('layout stored for this user', layout() && layout().zones.left.indexOf('balance') === 0);
      // order panel into the bottom zone, right of the tabs (row zone: right half = after)
      var tabsR = panel('tabs').getBoundingClientRect();
      await dragTo(q('[data-panel="order"] .bt-grip'), tabsR.left + tabsR.width * 0.8, tabsR.top + tabsR.height / 2);
      ok('drag orders onto the right half of the tabs: bottom zone, after the tabs', zoneOf('order') === 'bottom' && layout().zones.bottom.indexOf('order') > layout().zones.bottom.indexOf('tabs'), JSON.stringify(layout().zones));
      ok('right zone empty: hidden, its splitter too', !vis(q('[data-zone="right"]')) && !vis(q('[data-zsplit="right"]')));
      ok('the chart widened into the free space', panel('chart').getBoundingClientRect().right > window.innerWidth - 60, panel('chart').getBoundingClientRect().right);
      // header (not only the grip) also drags: tabs to the top
      var head = q('[data-panel="tabs"] .bt-tabs-row'), hr = head.getBoundingClientRect();
      var hs = { x: hr.right - 60, y: hr.top + hr.height / 2 };
      pe('pointerdown', head, hs.x, hs.y);
      for (i = 1; i <= 5; i++) { pe('pointermove', document, hs.x, hs.y - (hs.y - dock.top - 8) * i / 5); await sleep(20); }
      pe('pointerup', document, hs.x, dock.top + 8); await sleep(250);
      ok('drag by the header area: tabs moved to the top zone', zoneOf('tabs') === 'top', zoneOf('tabs'));
      // inner splitter: tabs into the center under the chart, then resize between chart and tabs
      var cr = panel('chart').getBoundingClientRect();
      await dragTo(q('[data-panel="tabs"] .bt-grip'), cr.left + cr.width / 2, cr.bottom - 20);
      var isp = q('[data-zone="center"] .bt-isplit');
      ok('tabs under the chart in the center zone, a splitter between them', zoneOf('tabs') === 'center' && !!isp && vis(isp));
      var ch0 = panel('chart').getBoundingClientRect().height, ip = center(isp);
      pe('pointerdown', isp, ip.x, ip.y); pe('pointermove', document, ip.x, ip.y - 60); pe('pointerup', document, ip.x, ip.y - 60); await sleep(150);
      ok('inner splitter: chart 60 px shorter, weights stored', Math.abs(panel('chart').getBoundingClientRect().height - (ch0 - 60)) <= 3 && layout().weight.chart !== 3, ch0 + ' -> ' + panel('chart').getBoundingClientRect().height);
      // Alt + arrow on a grip moves a panel without the mouse
      q('[data-panel="balance"] .bt-grip').focus();
      q('[data-panel="balance"] .bt-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
      await sleep(200);
      ok('Alt+→ on the balance grip: left -> center', zoneOf('balance') === 'center', zoneOf('balance'));
      // hide and show again
      q('[data-panel="order"] [data-dock-hide="order"]').click(); await sleep(200);
      ok('minus: order panel hidden, its place kept', !vis(panel('order')) && layout().hidden.indexOf('order') >= 0 && zoneOf('order') === 'bottom');
      $('bt-panels-btn').click(); await sleep(150);
      var cbx = q('#bt-panels-pop [data-panel-toggle="order"]');
      ok('panels menu: order unchecked', !!cbx && !cbx.checked);
      cbx.checked = true; cbx.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);
      ok('checked again: order panel back in the bottom zone', vis(panel('order')) && zoneOf('order') === 'bottom');
      key('Escape'); await sleep(100);
      // full screen still floats the balance and the quick order wherever the panels are
      key('f'); await sleep(300);
      ok('full screen with moved panels: chart full, balance and order float', $('bt-root').classList.contains('bt-fs') && vis('bt-stats') && getComputedStyle($('bt-order-form')).position === 'fixed' &&
        $('bt-chart').getBoundingClientRect().width >= window.innerWidth - 2);
      key('Escape'); await sleep(300);
      // reopen: the layout comes back
      $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
      q('.bt-account-card[data-id]').click();
      await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 30000, 'reopen');
      ok('reopened: panels where they were left', zoneOf('balance') === 'center' && zoneOf('tabs') === 'center' && zoneOf('order') === 'bottom');
      // statistics: own panel, back, full screen
      $('bt-tab-stats').click(); await waitFor(function () { return qa('.bt-st-w').length >= 3; }, 5000, 'widgets');
      $('bt-stats-detach').click(); await sleep(400);
      ok('statistics in their own panel: tab hidden, widgets in the panel', vis(panel('stats')) && !vis('bt-tab-stats') && panel('stats').contains($('bt-stats-view')) && qa('.bt-st-w').length >= 3);
      ok('own panel stored', layout().statsDetached === true);
      q('[data-panel="stats"] [data-act="stats-back"]').click(); await sleep(300);
      ok('back to the tab', !vis(panel('stats')) && vis('bt-tab-stats') && $('bt-panel-stats').contains($('bt-stats-view')));
      $('bt-tab-stats').click(); await sleep(200);
      $('bt-stats-fs-btn').click(); await sleep(400);
      ok('statistics full screen: window over everything, widgets inside', vis('bt-stats-fs') && $('bt-stats-fs').contains($('bt-stats-view')) && qa('#bt-stats-fs .bt-st-w').length >= 3 &&
        $('bt-stats-fs').getBoundingClientRect().width >= window.innerWidth - 2);
      key('Escape'); await sleep(300);
      ok('Esc closes the statistics full screen, back in the tab', !vis('bt-stats-fs') && $('bt-panel-stats').contains($('bt-stats-view')));
      // widgets
      var ids = function () { return Array.prototype.map.call(qa('#bt-stats-view .bt-st-w'), function (w) { return w.getAttribute('data-w'); }); };
      ok(pro ? 'Premium widgets: key figures, balance, drawdown, R, equity, sessions, monthly' : 'free widgets: key figures, balance, Premium teaser',
        pro ? ids().join() === 'kpis,balance,drawdown,rdist,equity,sessions,monthly' : ids().join() === 'kpis,balance,teaser', ids().join());
      ok('every chart widget has an enlarge button', Array.prototype.every.call(qa('#bt-stats-view .bt-st-w'), function (w) { return w.getAttribute('data-w') === 'kpis' || w.getAttribute('data-w') === 'teaser' || !!w.querySelector('[data-w-act="expand"]'); }));
      // hide a widget, bring it back from the menu
      q('#bt-stats-view [data-w="balance"] [data-w-act="hide"]').click(); await sleep(300);
      ok('hide: balance widget gone, stored', ids().indexOf('balance') < 0 && layout().widgets.hidden.indexOf('balance') >= 0);
      $('bt-widgets-btn').click(); await sleep(150);
      var wc = q('#bt-widgets-pop [data-widget-toggle="balance"]');
      ok('widget menu lists ' + (pro ? 'every' : 'the free') + ' widget', qa('#bt-widgets-pop [data-widget-toggle]').length === (pro ? 7 : 3) && !wc.checked);
      wc.checked = true; wc.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300); key('Escape'); await sleep(100);
      ok('widget back', ids().indexOf('balance') >= 0);
      // resize by the corner: narrower and taller
      var bw = q('#bt-stats-view [data-w="balance"]'), rz = bw.querySelector('.bt-st-rsz'), r0 = bw.getBoundingClientRect(), p0 = center(rz);
      pe('pointerdown', rz, p0.x, p0.y); pe('pointermove', document, p0.x - r0.width / 2, p0.y + 80); pe('pointerup', document, p0.x - r0.width / 2, p0.y + 80); await sleep(300);
      var r1 = q('#bt-stats-view [data-w="balance"]').getBoundingClientRect(), sz = layout().widgets.size.balance;
      ok('corner resize: half width, 80 px taller, stored', r1.width < r0.width * 0.7 && Math.abs(r1.height - r0.height - 80) <= 12 && sz.w === 2, Math.round(r0.width) + 'x' + Math.round(r0.height) + ' -> ' + Math.round(r1.width) + 'x' + Math.round(r1.height) + ' ' + JSON.stringify(sz));
      ok('the chart inside follows the new size', Math.abs(q('#bt-stats-view [data-w="balance"] .bt-st-chart table').getBoundingClientRect().width - q('#bt-stats-view [data-w="balance"] .bt-st-chart').getBoundingClientRect().width) <= 3);
      // reorder with the grip (SortableJS): balance before the key figures
      var g = q('#bt-stats-view [data-w="balance"] .bt-st-grip'), kp = q('#bt-stats-view [data-w="kpis"]').getBoundingClientRect(), gs = center(g);
      pe('pointerdown', g, gs.x, gs.y);
      var tx = kp.left + kp.width / 2, ty = kp.top + kp.height / 2;          // over the middle of the key figures (Sortable swaps past the midpoint)
      for (i = 1; i <= 8; i++) { pe('pointermove', document, gs.x + (kp.left + 20 - gs.x) * i / 8, gs.y + (kp.top + 10 - gs.y) * i / 8); await sleep(40); }   // in over the top edge
      await sleep(350);
      // a real mouse keeps sending moves; Sortable re-evaluates on every new position
      for (i = 0; i < 3; i++) { pe('pointermove', document, kp.left + kp.width * [0.1, 0.3, 0.5][i], ty); await sleep(200); }
      pe('pointerup', document, tx + 12, ty);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: tx + 12, clientY: ty }));   // browsers follow pointerup with mouseup (Sortable ends the drag there)
      var under = document.elementFromPoint(tx + 12, ty); if (under) under.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: tx + 12, clientY: ty }));   // the browser's click after pointerup
      await sleep(500);
      ok('drag a widget by its grip: new order shown and stored', ids()[0] === 'balance' && layout().widgets.order.indexOf('balance') < layout().widgets.order.indexOf('kpis'), ids().join() + ' / ' + (layout().widgets && layout().widgets.order.join()));
      // enlarge (WwChartViewer)
      q('#bt-stats-view [data-w="balance"] [data-w-act="expand"]').click(); await sleep(500);
      var viewer = q('.ww-viewer');
      ok('enlarge: the chart viewer opens with the chart', !!viewer && vis(viewer) && !!viewer.querySelector('canvas'));
      key('Escape'); await sleep(300);
      ok('viewer closed', !q('.ww-viewer') || !vis(q('.ww-viewer')));
      // reset
      $('bt-panels-btn').click(); await sleep(150);
      q('#bt-panels-pop [data-act="reset-layout"]').click(); await sleep(400);
      ok('reset: default layout and widgets back', zoneOf('chart') === 'center' && zoneOf('balance') === 'right' && zoneOf('order') === 'right' && zoneOf('tabs') === 'bottom' && !layout().widgets && !layout().statsDetached);
      // simple mode ignores the custom layout, advanced brings it back
      await dragTo(q('[data-panel="order"] .bt-grip'), dock.left + 10, dock.top + dock.height / 2);
      key('M', { shiftKey: true }); await sleep(300);
      ok('simple mode keeps its fixed arrangement', zoneOf('order') === 'right' && !vis(panel('tabs')));
      key('M', { shiftKey: true }); await sleep(300);
      ok('advanced again: the custom layout is back', zoneOf('order') === 'left');
      if (pro) {
        // multi-chart: 2 side by side -> swap and resize
        $('bt-layout-btn').click(); await sleep(100); q('#bt-layout-pop [data-layout="2h"]').click(); await sleep(800);
        var R = window.__btTest.R(), ex = R.extra[0], mainCell = R.el.parentNode;
        var x0 = mainCell.getBoundingClientRect().left, xe = ex.cell.getBoundingClientRect().left;
        ok('2 charts: main left, extra right, grips on both', x0 < xe && !!mainCell.querySelector('.bt-cell-grip') && !!ex.cell.querySelector('.bt-cell-grip'));
        var mg = center(mainCell.querySelector('.bt-cell-grip')), tc = center(ex.cell);
        pe('pointerdown', mainCell.querySelector('.bt-cell-grip'), mg.x, mg.y);
        for (i = 1; i <= 4; i++) { pe('pointermove', document, mg.x + (tc.x - mg.x) * i / 4, mg.y + (tc.y - mg.y) * i / 4); await sleep(20); }
        pe('pointerup', document, tc.x, tc.y); await sleep(400);
        ok('drag the main chart onto the other: places swapped, stored', mainCell.getBoundingClientRect().left > ex.cell.getBoundingClientRect().left && layout().multi['2h'].order.join() === '1,0', JSON.stringify(layout().multi));
        var spl = q('#bt-charts .bt-msplit'), w0c = ex.cell.getBoundingClientRect().width, sp0 = center(spl);
        pe('pointerdown', spl, sp0.x, sp0.y); pe('pointermove', document, sp0.x + 120, sp0.y); pe('pointerup', document, sp0.x + 120, sp0.y); await sleep(300);
        ok('drag the line between them: the left chart 120 px wider, sizes stored', Math.abs(ex.cell.getBoundingClientRect().width - w0c - 120) <= 4 && layout().multi['2h'].cols[0] > layout().multi['2h'].cols[1],
          Math.round(w0c) + ' -> ' + Math.round(ex.cell.getBoundingClientRect().width) + ' ' + JSON.stringify(layout().multi['2h'].cols));
        ok('both charts redrawn at their new width', [R, ex].every(function (v) { return Math.abs(v.el.querySelector('table').getBoundingClientRect().width - v.el.getBoundingClientRect().width) <= 3; }));
        $('bt-layout-btn').click(); await sleep(100); q('#bt-layout-pop [data-layout="1+3"]').click(); await sleep(800);
        ok('1+3: three lines (one column, two rows)', qa('#bt-charts .bt-msplit').length === 3 && qa('#bt-charts .bt-msplit-row').length === 2);
        $('bt-layout-btn').click(); await sleep(100); q('#bt-layout-pop [data-layout="1"]').click(); await sleep(500);
        ok('back to one chart: no lines, no grip', !q('#bt-charts .bt-msplit') && !vis(q('#bt-charts .bt-cell-grip')));
      }
    }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
