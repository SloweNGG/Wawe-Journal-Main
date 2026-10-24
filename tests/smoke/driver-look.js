// Appearance drawer scenario (local backend). ?plan=free: two free themes, PRO tags, every other control opens the upgrade window.
// ?plan=premium: themes, candle styles, colors, switches and saved themes reach the chart (background read back from the canvas).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = (qp.get('plan') || 'premium') === 'premium';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function stored() { return JSON.parse(localStorage.getItem('ww_bt_look_v1') || '{}'); }
  function q(sel) { return $('bt-look-body').querySelector(sel); }
  // background pixel of the chart pane (top-left corner, away from the candles)
  function bgPixel() {
    var c = document.querySelector('#bt-chart table td canvas'); if (!c) return null;
    var d = c.getContext('2d').getImageData(3, 3, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 10000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Look'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    for (var i = 0; i < 5; i++) { $('bt-step-btn').click(); await sleep(40); }
    $('bt-look-btn').click(); await sleep(150);
    ok('drawer opens from the header button', !$('bt-look-drawer').hidden && $('bt-look-btn').getAttribute('aria-expanded') === 'true');
    ok('four themes listed', $('bt-look-body').querySelectorAll('[data-preset]').length === 4);
    var tags = $('bt-look-body').querySelectorAll('.bt-pro').length;
    if (!pro) {
      ok('free: PRO tags on premium themes and sections', tags >= 6, tags);
      ok('free: no lock icon', !$('bt-look-drawer').querySelector('[data-lucide="lock"]'));
      q('[data-preset="tradingview"]').click(); await sleep(200);
      ok('free: TradingView theme applies', stored().preset === 'tradingview' && !window.__upgrade && q('[data-preset="tradingview"]').getAttribute('aria-pressed') === 'true');
      q('[data-preset="mono"]').click(); await sleep(150);
      ok('free: Monochrome opens the upgrade window and changes nothing', window.__upgrade === true && stored().preset === 'tradingview');
      window.__upgrade = false; q('[data-style="heikin"]').click(); await sleep(100);
      ok('free: candle style opens the upgrade window', window.__upgrade === true && !(stored().custom || {}).style);
      window.__upgrade = false; q('input[data-color="up"]').click(); await sleep(100);
      ok('free: color input opens the upgrade window', window.__upgrade === true && !(stored().custom || {}).up);
      window.__upgrade = false; var sw = q('input[data-switch="showSessions"]'), was = sw.checked; sw.closest('label').click(); await sleep(100);
      ok('free: switch opens the upgrade window and does not change', window.__upgrade === true && sw.checked === was && (stored().custom || {}).showSessions === undefined, JSON.stringify({ up: window.__upgrade, checked: sw.checked, st: stored() }));
      window.__upgrade = false; q('[data-act="save"]').click(); await sleep(100);
      ok('free: saving a theme opens the upgrade window', window.__upgrade === true && !(stored().saved || []).length);
      // a lapsed Premium (premium theme stored) sees WaweJournal
      localStorage.setItem('ww_bt_look_v1', JSON.stringify({ preset: 'night', custom: {} }));
    } else {
      ok('premium: no PRO tags', tags === 0, tags);
      q('[data-preset="night"]').click(); await sleep(400);
      var px = bgPixel();
      ok('premium: Midnight blue paints the chart background (navy, session bands may tint it)', px && px[2] >= 34 && px[2] < 70 && px[2] > px[0] + 15 && px[2] > px[1] + 8, JSON.stringify(px));
      ok('premium: stored', stored().preset === 'night');
      q('[data-style="heikin"]').click(); await sleep(300);
      ok('Heikin Ashi: chart rebuilt, legend still shows prices', !!document.querySelector('#bt-chart canvas') && /\d\.\d{5}/.test($('bt-legend').textContent) && stored().custom.style === 'heikin');
      $('bt-step-btn').click(); await sleep(200);
      ok('Heikin Ashi survives a replay step', !!document.querySelector('#bt-chart canvas'));
      q('[data-style="line"]').click(); await sleep(300);
      q('[data-style="bars"]').click(); await sleep(300);
      ok('line and bar styles', stored().custom.style === 'bars');
      var vol = q('input[data-switch="showVolume"]'); vol.click(); await sleep(400);
      ok('volume switch on (stored, chart rebuilt)', stored().custom.showVolume === true && document.querySelectorAll('#bt-chart canvas').length > 0);
      q('input[data-switch="showSessions"]').click(); await sleep(200);
      ok('session backgrounds switch', stored().custom.showSessions === false || stored().custom.showSessions === true);
      var up = q('input[data-color="bg"]'); up.value = '#102030'; up.dispatchEvent(new Event('input', { bubbles: true })); up.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
      px = bgPixel();
      ok('background color input reaches the chart', px && Math.abs(px[0] - 16) < 6 && Math.abs(px[1] - 32) < 6 && Math.abs(px[2] - 48) < 6, JSON.stringify(px));
      $('bt-look-name').value = 'Benim'; q('[data-act="save"]').click(); await sleep(300);
      var st = stored();
      ok('theme saved and selected', st.saved.length === 1 && st.saved[0].name === 'Benim' && st.preset === 'saved:' + st.saved[0].id && st.saved[0].look.style === 'bars');
      q('[data-preset="wawe"]').click(); await sleep(300);
      q('[data-saved]').click(); await sleep(300);
      ok('saved theme applies again', stored().preset.indexOf('saved:') === 0);
      px = bgPixel();
      ok('saved theme keeps its background', px && Math.abs(px[2] - 48) < 6, JSON.stringify(px));
      q('[data-del]').click(); await sleep(200);
      ok('saved theme deleted, back to WaweJournal', stored().saved.length === 0 && stored().preset === 'wawe');
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
    ok('Esc closes the drawer', $('bt-look-drawer').hidden);
    // full screen: the drawer covers the full-screen chart too
    $('bt-fs-btn').click(); await sleep(150); $('bt-look-btn').click(); await sleep(150);
    var z = +getComputedStyle($('bt-look-drawer')).zIndex;
    ok('drawer above the full-screen chart', !$('bt-look-drawer').hidden && z > 990, z);
    $('bt-look-close').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(100);
    ok('then Esc leaves full screen', !$('bt-root').classList.contains('bt-fs'));
    if (!pro) {
      $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
      document.querySelector('.bt-account-card[data-id]').click();
      await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 30000, 'reopen');
      var p2 = bgPixel();
      ok('free with a stored premium theme: the chart uses WaweJournal (black)', p2 && p2[0] < 8 && p2[1] < 8 && p2[2] < 8, JSON.stringify(p2));
    }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
