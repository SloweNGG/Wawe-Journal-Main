// Stage 3 (2026-10-25): pending orders. Local backend (synthetic EUR/USD): type switch, price rules, the orders tab, edit and
// cancel, a fill during the replay (no look-ahead, entry at the order price or the gap open), dragging a line on the chart,
// kept after reopening, cancelled when the date changes. ?backend=supabase&ct=ready&tlimit=2&tused=1 (mode=limit): the monthly
// limit also stops pending orders (placing at the limit, a fill refused by the page guard or the database).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), mode = qp.get('mode') || 'main';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(s) { return document.querySelector(s); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  function vis(e) { if (typeof e === 'string') e = $(e); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function toasts() { return window.__toasts.map(function (x) { return x[1]; }).join(' | '); }
  var R = function () { return window.__btTest.R(); }, E = function () { return window.WwBtEngine; };
  function px(pts) { return E().ptsToStr(pts, R().sym.digits); }
  function quote() { return E().quote(R().eng); }
  function pe(type, target, x, y) { (target || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 11, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); }
  // step one minute at a time until `fn` or `max` minutes
  async function stepUntil(fn, max) { for (var i = 0; i < max; i++) { if (fn()) return true; $('bt-step1m-btn').click(); await sleep(12); } return fn(); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && (qp.get('backend') !== 'supabase' || window.__db); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    if (mode === 'limit') {
      check('bt-f-source-ctrader', true);
      await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel');
    }
    setv('bt-f-name', 'Orders'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    q('[data-bt-mode="advanced"]').click(); await sleep(300);
    for (var i = 0; i < 10; i++) { $('bt-step-btn').click(); await sleep(15); }
    if (mode === 'limit') {
      // used 1 of 2: two orders that both fill at once (a buy limit and a buy stop one point away)
      q('#bt-ordtype [data-ordtype="limit"]').click();
      setv('bt-ord-price', px(quote().ask - 1)); $('bt-buy-btn').click(); await sleep(150);
      q('#bt-ordtype [data-ordtype="stop"]').click();
      setv('bt-ord-price', px(quote().ask + 1)); $('bt-buy-btn').click(); await sleep(150);
      ok('limit: two pending orders placed while 1 / 2 is used', R().eng.orders.length === 2, R().eng.orders.length);
      await stepUntil(function () { return R().eng.orders.length === 0; }, 600);
      await sleep(600);
      var rows = window.__db.tables.backtest_account_trades;
      ok('limit: only one of them became a trade (the other refused), 2 / 2', rows.length === 1 && R().eng.open.length + R().eng.closed.length === 1 && /2\D+2/.test($('bt-limit-text').textContent),
        JSON.stringify({ rows: rows.length, open: R().eng.open.length, closed: R().eng.closed.length, txt: $('bt-limit-text').textContent }));
      ok('limit: the refusal is explained, the upgrade window opens', /sınır|limit/i.test(toasts()) && window.__upgrade === true, toasts().slice(-200));
      q('#bt-ordtype [data-ordtype="limit"]').click();
      setv('bt-ord-price', px(quote().ask - 5)); $('bt-buy-btn').click(); await sleep(150);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', shiftKey: true, bubbles: true })); await sleep(150);
      ok('limit: order buttons disabled at the limit, no new pending order (also not with Shift+B)', $('bt-buy-btn').disabled && $('bt-sell-btn').disabled && R().eng.orders.length === 0);
      throw 'done';
    }
    // type switch
    ok('market by default: no price field', !vis('bt-ord-price-wrap') && q('#bt-ordtype [data-ordtype="market"]').getAttribute('aria-checked') === 'true');
    q('#bt-ordtype [data-ordtype="limit"]').click(); await sleep(50);
    ok('limit: price field with the rule, buttons say AL LİMİT / SAT LİMİT', vis('bt-ord-price-wrap') && /LİMİT/.test($('bt-buy-label').textContent) && /LİMİT/.test($('bt-sell-label').textContent) && /altında/.test($('bt-ord-price-hint').textContent),
      $('bt-buy-label').textContent + ' | ' + $('bt-ord-price-hint').textContent);
    // price rules
    $('bt-buy-btn').click(); await sleep(50);
    ok('no price: asks for the order price', /fiyat/i.test($('bt-order-error').textContent) && R().eng.orders.length === 0, $('bt-order-error').textContent);
    setv('bt-ord-price', px(quote().ask + 10)); $('bt-buy-btn').click(); await sleep(50);
    ok('buy limit above the ask: refused with the rule', /altında/.test($('bt-order-error').textContent) && R().eng.orders.length === 0, $('bt-order-error').textContent);
    // a buy limit 15 points below the ask with SL / TP
    var a0 = quote().ask, lim = a0 - 15;
    setv('bt-ord-price', px(lim)); setv('bt-sl', px(lim - 40)); setv('bt-tp', px(lim + 60));
    $('bt-buy-btn').click(); await sleep(150);
    var o = R().eng.orders[0];
    ok('buy limit placed: stored with price, SL, TP and the time it was placed', !!o && o.price === lim && o.sl === lim - 40 && o.tp === lim + 60 && o.placedT === R().win.t[R().k] + 60, JSON.stringify(o));
    ok('fields cleared, toast', $('bt-ord-price').value === '' && /verildi/.test(toasts()));
    $('bt-tab-orders').click(); await sleep(100);
    ok('orders tab: one row with the price and the distance', $('bt-orders-count').textContent === '1' && $('bt-orders-body').children.length === 1 &&
      $('bt-orders-body').textContent.indexOf(px(lim)) >= 0 && /pip/.test($('bt-orders-body').textContent));
    var lines = R().lines['o:' + o.id];
    ok('chart: order, SL and TP lines', !!lines && !!lines.entry && !!lines.sl && !!lines.tp && Math.abs(lines.entry.options().price - lim / R().scale) < 1e-9);
    var key = Object.keys(localStorage).filter(function (k) { return k.indexOf('ww_bt_orders_v1:') === 0; })[0];
    ok('kept in this browser per user and account', !!key && JSON.parse(localStorage.getItem(key))[0].id === o.id, key);
    // edit in the modal
    q('#bt-orders-body [data-act="edit-order"]').click(); await sleep(100);
    setv('bt-ord-f-price', px(lim - 5)); $('bt-ord-save').click(); await sleep(100);
    ok('edit: new price stored, line moved', R().eng.orders[0].price === lim - 5 && Math.abs(R().lines['o:' + o.id].entry.options().price - (lim - 5) / R().scale) < 1e-9);
    q('#bt-orders-body [data-act="edit-order"]').click(); await sleep(100);
    setv('bt-ord-f-sl', px(lim)); $('bt-ord-save').click(); await sleep(100);
    ok('edit: an SL above the order price is refused in the modal', vis('bt-ord-error') && R().eng.orders[0].sl === lim - 40, $('bt-ord-error').textContent);
    $('bt-ord-cancel').click(); await sleep(100);
    // drag the order line on the chart: 25 px down = a lower price
    var v = R(), y0 = v.series.priceToCoordinate(R().eng.orders[0].price / R().scale), rr = v.el.getBoundingClientRect(), x0 = rr.left + rr.width * 0.4;
    pe('pointerdown', v.el, x0, rr.top + y0);
    pe('pointermove', v.el, x0, rr.top + y0 + 12); pe('pointermove', v.el, x0, rr.top + y0 + 25);
    pe('pointerup', v.el, x0, rr.top + y0 + 25); await sleep(150);
    var moved = R().eng.orders[0].price;
    var od = R().eng.orders[0];
    ok('drag the line down: lower order price stored, the line follows, SL and TP keep their distance', moved < lim - 5 && Math.abs(R().lines['o:' + o.id].entry.options().price - moved / R().scale) < 1e-9 &&
      JSON.parse(localStorage.getItem(key))[0].price === moved && od.sl === lim - 40 + (moved - (lim - 5)) && od.tp === lim + 60 + (moved - (lim - 5)), (lim - 5) + ' -> ' + moved + ' sl ' + od.sl + ' tp ' + od.tp);
    // the TP line alone
    var yT = v.series.priceToCoordinate(od.tp / R().scale), slBefore = od.sl;
    pe('pointerdown', v.el, x0, rr.top + yT); pe('pointermove', v.el, x0, rr.top + yT - 10); pe('pointerup', v.el, x0, rr.top + yT - 10); await sleep(150);
    ok('drag the TP line up: only the TP changes', R().eng.orders[0].tp > od.tp && R().eng.orders[0].sl === slBefore && R().eng.orders[0].price === moved, JSON.stringify(R().eng.orders[0]));
    var y1 = v.series.priceToCoordinate(moved / R().scale), yAsk = v.series.priceToCoordinate(quote().ask / R().scale);
    pe('pointerdown', v.el, x0, rr.top + y1); pe('pointermove', v.el, x0, rr.top + yAsk - 30); pe('pointerup', v.el, x0, rr.top + yAsk - 30); await sleep(150);
    ok('drag above the ask: not allowed, back to the stored price, warning', R().eng.orders[0].price === moved && /altında/.test(toasts().split(' | ').pop()), toasts().split(' | ').pop());
    // cancel, then a sell stop and a buy limit near the market: one fills soon
    q('#bt-orders-body [data-act="cancel-order"]').click(); await sleep(100);
    ok('cancel: gone from the tab, the chart and the browser', R().eng.orders.length === 0 && !R().lines['o:' + o.id] && !localStorage.getItem(key) && $('bt-orders-count').textContent === '0');
    var q1 = quote(), sellStop = q1.bid - 3, buyLim = q1.ask - 3;
    q('#bt-ordtype [data-ordtype="stop"]').click(); setv('bt-ord-price', px(sellStop)); $('bt-sell-btn').click(); await sleep(100);
    q('#bt-ordtype [data-ordtype="limit"]').click(); setv('bt-ord-price', px(buyLim)); $('bt-buy-btn').click(); await sleep(100);
    ok('sell stop and buy limit placed', R().eng.orders.length === 2, toasts().slice(-160));
    var placedBar = R().win.t[R().k];
    await stepUntil(function () { return R().eng.open.length > 0 || R().eng.closed.length > 0; }, 400);
    var p = R().eng.open[0] || R().eng.closed[0];
    ok('a pending order filled during the replay', !!p && !!p.fromOrder, JSON.stringify(p && { e: p.entry, t: p.entryT }));
    if (p) {
      var target = p.dir > 0 ? buyLim : sellStop;
      ok('filled after the bar it was placed in (no look-ahead), at the order price or a better/gap open', p.entryBarT > placedBar &&
        (p.gap ? (p.dir > 0 ? p.entry <= target : p.entry <= target) : p.entry === target), JSON.stringify({ dir: p.dir, entry: p.entry, target: target, gap: p.gap, bar: p.entryBarT, placed: placedBar }));
      ok('the fill is a normal trade: open-positions rows, toast', /doldu/.test(toasts()) && $('bt-open-body').children.length === R().eng.open.length);
      ok('the other order is still pending (or filled too)', R().eng.orders.length + R().eng.open.length + R().eng.closed.length === 2);
    }
    // reopen: the remaining orders come back
    var left = R().eng.orders.map(function (x) { return x.id; }).join();
    var openB; while ((openB = q('#bt-open-body button[data-act="close"]'))) { openB.click(); await sleep(150); }
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    q('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R() && R().eng.quote && R().win; }, 30000, 'reopen');
    await sleep(300);
    ok('reopened: pending orders and their lines are back', R().eng.orders.map(function (x) { return x.id; }).join() === left && R().eng.orders.every(function (x) { return !!R().lines['o:' + x.id]; }), left);
    // simple mode: compact list with cancel
    q('#bt-ordtype [data-ordtype="limit"]').click(); setv('bt-ord-price', px(quote().ask - 30)); $('bt-buy-btn').click(); await sleep(100);
    q('[data-bt-mode="simple"]').click(); await sleep(200);
    ok('simple mode: compact pending list', vis('bt-mini-ord') && $('bt-mini-ord-list').children.length === R().eng.orders.length);
    q('[data-bt-mode="advanced"]').click(); await sleep(200);
    // going to another date cancels them
    var n0 = R().eng.orders.length, tnow = R().win.t[R().k] + 60;
    var pp = function (x) { return (x < 10 ? '0' : '') + x; }, z = window.WwTime.partsInTz((tnow + 3 * 86400) * 1000, window.WwTime.getTz());
    setv('bt-goto-input', z.y + '-' + pp(z.m) + '-' + pp(z.d) + 'T' + pp(z.H) + ':' + pp(z.Mi)); $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().win.t[R().k] > tnow; }, 30000, 'goto');
    ok('go to a date: pending orders cancelled with a note', n0 > 0 && R().eng.orders.length === 0 && /iptal/.test(toasts()), n0 + ' ' + toasts().slice(-120));
  } catch (e) { if (e !== 'done') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
