// Layout scenario (local backend): the view follows the plan (free: simple, Premium: advanced; no switch, 2026-10-27), windows,
// full screen, shortcut sheet, keyboard orders. ?phone=1 runs at phone width (no splitters, no horizontal scroll). ?plan=free|premium.
(async function () {
  var out = [], qp = new URLSearchParams(location.search), phone = qp.get('phone') === '1', pro = (qp.get('plan') || 'premium') === 'premium';
  var view = pro ? 'advanced' : 'simple';
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
    ok('the plan decides the view (' + view + '), there is no view switch', $('bt-root').getAttribute('data-mode') === view && !document.querySelector('[data-bt-mode]'));
    if (phone) ok('phone: list without horizontal scroll', noHScroll(), document.documentElement.scrollWidth + ' > ' + window.innerWidth);
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Layout'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    ok('chart, replay toolbar, order panel and drawing toolbar visible', vis('bt-chart') && vis(document.querySelector('.bt-toolbar')) && vis('bt-order-form') && vis('bt-draw-bar'));
    key('M', { shiftKey: true }); await sleep(100);
    ok('Shift+M does not change the view', $('bt-root').getAttribute('data-mode') === view);
    if (!pro) {
      // free: the simple view only (chart, replay, order panel, drawings); no windows, tables, statistics or multi-chart
      ok('free: no windows / tables / layout and panel buttons, compact positions shown', !vis(document.querySelector('.bt-win[data-win="open"]')) && !vis('bt-layout-btn') && vis('bt-mini-pos'));
      key('B', { shiftKey: true }); await sleep(200);
      ok('Shift+B opens a BUY position', $('bt-mini-pos-count').textContent === '1' && $('bt-mini-pos-list').children.length === 1, $('bt-mini-pos-count').textContent);
      $('bt-mini-pos-list').querySelector('button[data-act="close"]').click(); await sleep(200);
      ok('position closed from the compact list', $('bt-mini-pos-count').textContent === '0' && $('bt-history-count').textContent === '1');
    } else {
      ok('premium: open positions window visible, compact list hidden', vis(document.querySelector('.bt-win[data-win="open"]')) && !vis('bt-mini-pos'));
      key('B', { shiftKey: true }); await sleep(200);
      ok('Shift+B opens a BUY position', $('bt-open-count').textContent === '1', $('bt-open-count').textContent);
      $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(200);
      ok('position closed from the positions window', $('bt-open-count').textContent === '0' && $('bt-history-count').textContent === '1');
    }
    if (!pro) { /* no windows in the simple view */ }
    else if (!phone) {
      // windows (bt-desk.js; moving and resizing with the real mouse: smoke desk-*)
      ok('desktop: free windows with title bars', $('bt-desk').getAttribute('data-desk') === 'free' && vis(document.querySelector('.bt-win[data-win="order"] .bt-win-head')));
      await sleep(200);
      ok('chart canvas follows the window', Math.abs(document.querySelector('#bt-chart table').getBoundingClientRect().width - $('bt-chart').getBoundingClientRect().width) <= 2);
    } else {
      ok('phone: windows stacked without frames (no title bar buttons, no resize handles)', $('bt-desk').getAttribute('data-desk') === 'stack' && !vis(document.querySelector('.bt-win-btns')) && !vis(document.querySelector('.bt-win-rz')));
      ok('phone: replay without horizontal scroll', noHScroll(), document.documentElement.scrollWidth + ' > ' + window.innerWidth);
    }
    // full screen
    key('f'); await sleep(250);
    ok('F: full screen on', $('bt-root').classList.contains('bt-fs') && document.documentElement.classList.contains('bt-fs-lock'));
    var cr = $('bt-chart').getBoundingClientRect();
    ok('full screen: chart covers the window', cr.width >= window.innerWidth - 2 && cr.height >= window.innerHeight - 2, cr.width + 'x' + cr.height);
    ok('full screen: balance, replay controls and quick order float', vis('bt-stats') && vis('bt-play-btn') && vis('bt-buy-btn') && getComputedStyle($('bt-order-form')).position === 'fixed');
    ok('full screen: header and tables hidden, exit button shown', !vis(document.querySelector('.bt-replay-head')) && !vis(document.querySelector('.bt-win[data-win="open"]')) && vis('bt-fs-exit'));
    if (phone) ok('phone full screen: no horizontal scroll', noHScroll());
    $('bt-buy-btn').click(); await sleep(200);
    ok('quick order works in full screen', $('bt-open-count').textContent === '1');
    $(pro ? 'bt-open-body' : 'bt-mini-pos-list').querySelector('button[data-act="close"]').click(); await sleep(150);
    key('Escape'); await sleep(200);
    ok('Esc leaves full screen', !$('bt-root').classList.contains('bt-fs') && !document.documentElement.classList.contains('bt-fs-lock'));
    $('bt-fs-btn').click(); await sleep(150);
    ok('header button enters full screen', $('bt-root').classList.contains('bt-fs'));
    $('bt-fs-exit').click(); await sleep(150);
    ok('exit button leaves full screen', !$('bt-root').classList.contains('bt-fs'));
    // shortcut sheet
    key('?'); await sleep(150);
    ok('? opens the shortcut sheet', $('bt-keys-modal').classList.contains('active') && $('bt-keys-list').querySelectorAll('.bt-keys-row').length >= 9, $('bt-keys-list').querySelectorAll('.bt-keys-row').length);
    ok('shortcut sheet lists the drawing keys in every view', /M/.test($('bt-keys-list').textContent) && $('bt-keys-list').querySelectorAll('kbd').length > 10);
    key('Escape'); await sleep(100);
    ok('Esc closes the sheet', !$('bt-keys-modal').classList.contains('active'));
    // leave and come back: still the plan's view
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 30000, 'reopen');
    ok('view still follows the plan after reopening', $('bt-root').getAttribute('data-mode') === view);
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
