// Layout scenario (local backend): simple / advanced mode, resizable panels, full screen, shortcut sheet, keyboard orders.
// ?phone=1 runs at phone width (no splitters, no horizontal scroll). ?plan=free|premium.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), phone = qp.get('phone') === '1';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(e) { e = typeof e === 'string' ? $(e) : e; if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function key(k, opts) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {}))); }
  function noHScroll() { return document.documentElement.scrollWidth <= window.innerWidth + 1; }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list' && $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    ok('new user (no account): simple mode decided and stored', $('bt-root').getAttribute('data-mode') === 'simple' && JSON.parse(localStorage.getItem('ww_bt_layout_v1')).mode === 'simple');
    if (phone) ok('phone: list without horizontal scroll', noHScroll(), document.documentElement.scrollWidth + ' > ' + window.innerWidth);
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Layout'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    // simple mode: chart, replay controls, order panel; no bottom tabs
    ok('simple: chart, toolbar and order panel visible', vis('bt-chart') && vis(document.querySelector('.bt-toolbar')) && vis('bt-order-form'));
    ok('simple: bottom tabs hidden, compact positions shown', !vis(document.querySelector('.bt-tables')) && vis('bt-mini-pos'));
    ok('mode switch shows simple pressed', document.querySelector('[data-bt-mode="simple"]').getAttribute('aria-pressed') === 'true');
    // keyboard order (Shift+B) and close from the compact list
    key('B', { shiftKey: true }); await sleep(200);
    ok('Shift+B opens a BUY position', $('bt-mini-pos-count').textContent === '1' && $('bt-mini-pos-list').children.length === 1, $('bt-mini-pos-count').textContent);
    $('bt-mini-pos-list').querySelector('button[data-act="close"]').click(); await sleep(200);
    ok('position closed from the compact list', $('bt-mini-pos-count').textContent === '0' && $('bt-history-count').textContent === '1');
    // advanced mode
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(150);
    ok('advanced: bottom tabs visible, compact list hidden', vis(document.querySelector('.bt-tables')) && !vis('bt-mini-pos'));
    ok('advanced stored', JSON.parse(localStorage.getItem('ww_bt_layout_v1')).mode === 'advanced');
    key('M', { shiftKey: true }); await sleep(100);
    ok('Shift+M toggles back to simple', $('bt-root').getAttribute('data-mode') === 'simple');
    key('M', { shiftKey: true }); await sleep(100);
    if (!phone) {
      // zone edges (bt-dock.js): right zone width by pointer, bottom zone height by keyboard
      var sv = document.querySelector('[data-zsplit="right"]'), side = document.querySelector('[data-zone="right"]');
      ok('right zone splitter visible on desktop', vis(sv));
      var w0 = side.getBoundingClientRect().width, r = sv.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 40;
      sv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 7, button: 0 }));
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x - 80, clientY: y, pointerId: 7 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x - 80, clientY: y, pointerId: 7 }));
      await sleep(150);
      var w1 = side.getBoundingClientRect().width;
      ok('dragging the right zone edge widens the panel by 80 px', Math.abs((w1 - w0) - 80) <= 2, w0 + ' -> ' + w1);
      var dk = Object.keys(localStorage).filter(function (k) { return k.indexOf('ww_bt_dock_v1:') === 0; })[0];
      ok('panel width stored (per user)', !!dk && JSON.parse(localStorage.getItem(dk)).size.right === Math.round(w1), dk + ' ' + localStorage.getItem(dk));
      var sh = document.querySelector('[data-zsplit="bottom"]'), tables = document.querySelector('.bt-tables');
      var h0 = tables.getBoundingClientRect().height; sh.focus();
      sh.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      await sleep(100);
      ok('bottom zone edge with the keyboard: +16 px', Math.abs(tables.getBoundingClientRect().height - h0 - 16) <= 2, h0 + ' -> ' + tables.getBoundingClientRect().height);
      sh.blur();
      await sleep(200);
      ok('chart canvas follows the resize', Math.abs(document.querySelector('#bt-chart table').getBoundingClientRect().width - $('bt-chart').getBoundingClientRect().width) <= 2);
    } else {
      ok('phone: splitters hidden', !vis(document.querySelector('[data-zsplit="right"]')) && !vis(document.querySelector('[data-zsplit="bottom"]')));
      ok('phone: replay without horizontal scroll', noHScroll(), document.documentElement.scrollWidth + ' > ' + window.innerWidth);
    }
    // full screen
    key('f'); await sleep(250);
    ok('F: full screen on', $('bt-root').classList.contains('bt-fs') && document.documentElement.classList.contains('bt-fs-lock'));
    var cr = $('bt-chart').getBoundingClientRect();
    ok('full screen: chart covers the window', cr.width >= window.innerWidth - 2 && cr.height >= window.innerHeight - 2, cr.width + 'x' + cr.height);
    ok('full screen: balance, replay controls and quick order float', vis('bt-stats') && vis('bt-play-btn') && vis('bt-buy-btn') && getComputedStyle($('bt-order-form')).position === 'fixed');
    ok('full screen: header and tables hidden, exit button shown', !vis(document.querySelector('.bt-replay-head')) && !vis(document.querySelector('.bt-tables')) && vis('bt-fs-exit'));
    if (phone) ok('phone full screen: no horizontal scroll', noHScroll());
    $('bt-buy-btn').click(); await sleep(200);
    ok('quick order works in full screen', $('bt-open-count').textContent === '1');
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(150);
    key('Escape'); await sleep(200);
    ok('Esc leaves full screen', !$('bt-root').classList.contains('bt-fs') && !document.documentElement.classList.contains('bt-fs-lock'));
    $('bt-fs-btn').click(); await sleep(150);
    ok('header button enters full screen', $('bt-root').classList.contains('bt-fs'));
    $('bt-fs-exit').click(); await sleep(150);
    ok('exit button leaves full screen', !$('bt-root').classList.contains('bt-fs'));
    // shortcut sheet
    key('?'); await sleep(150);
    ok('? opens the shortcut sheet', $('bt-keys-modal').classList.contains('active') && $('bt-keys-list').querySelectorAll('.bt-keys-row').length >= 9, $('bt-keys-list').querySelectorAll('.bt-keys-row').length);
    ok('shortcut sheet lists drawing keys in advanced mode', /M/.test($('bt-keys-list').textContent) && $('bt-keys-list').querySelectorAll('kbd').length > 10);
    key('Escape'); await sleep(100);
    ok('Esc closes the sheet', !$('bt-keys-modal').classList.contains('active'));
    // persisted across a visit: leave and come back
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 30000, 'reopen');
    ok('mode kept after reopening', $('bt-root').getAttribute('data-mode') === 'advanced');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
