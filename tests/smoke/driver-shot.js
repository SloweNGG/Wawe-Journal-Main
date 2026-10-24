// Screenshot setup (no assertions): opens an account and puts the screen into ?shot=simple|advanced|fs|drawer|stats|multi state.
(async function () {
  var qp = new URLSearchParams(location.search), shot = qp.get('shot') || 'simple';
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  try {
    if (qp.get('light') === '1') document.body.classList.add('light-theme');
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); });
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; });
    setv('bt-f-name', 'EURUSD Londra'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000);
    for (var i = 0; i < 20; i++) { $('bt-step-btn').click(); await sleep(40); }
    $('bt-buy-btn').click(); await sleep(100);
    for (i = 0; i < 6; i++) { $('bt-step-btn').click(); await sleep(40); }
    $('bt-sell-btn').click(); await sleep(100);
    for (i = 0; i < 3; i++) { $('bt-step-btn').click(); await sleep(40); }
    var cl = $('bt-open-body').querySelector('button[data-act="close"]'); if (cl) cl.click();
    if (shot !== 'simple') document.querySelector('[data-bt-mode="advanced"]').click();
    if (shot === 'fs') $('bt-fs-btn').click();
    if (shot === 'drawer') { $('bt-look-btn').click(); await sleep(100); if (qp.get('plan') !== 'free') { $('bt-look-body').querySelector('[data-preset="night"]').click(); await sleep(100); $('bt-look-body').querySelector('input[data-switch="showVolume"]').click(); $('bt-look-body').querySelector('input[data-switch="showSessions"]').click(); $('bt-step-btn').click(); } }
    if (shot === 'sessions') { setv('bt-tf', '15m'); await sleep(800); $('bt-look-btn').click(); await sleep(100); $('bt-look-body').querySelector('input[data-switch="showSessions"]').click(); await sleep(100); $('bt-look-body').querySelector('[data-style="heikin"]').click(); await sleep(100); $('bt-look-close').click(); }
    if (shot === 'drawings') {
      var T = window.__btTest, S = T.draw().set, b = T.bars(), n = b.length, id = function () { return window.WwBtStore.newId(); };
      S.add({ id: id(), tool: 'trend', pts: [{ t: b[n - 40].time, p: b[n - 40].low }, { t: b[n - 12].time, p: b[n - 12].low }] });
      S.add({ id: id(), tool: 'hline', pts: [{ t: b[n - 30].time, p: b[n - 25].high }] });
      S.add({ id: id(), tool: 'rect', pts: [{ t: b[n - 60].time, p: b[n - 60].high }, { t: b[n - 48].time, p: b[n - 52].low }] });
      S.add({ id: id(), tool: 'fib', pts: [{ t: b[n - 90].time, p: b[n - 90].low }, { t: b[n - 70].time, p: b[n - 75].high }] });
      var e = b[n - 8].close, u = Math.abs(b[n - 8].high - b[n - 8].low) || e * 0.001;
      S.add({ id: id(), tool: 'long', pts: [{ t: b[n - 8].time, p: e }, { t: b[n - 1].time + 3600 * 6, p: e + 3 * u }, { t: b[n - 1].time + 3600 * 6, p: e - 1.5 * u }] });
      S.add({ id: id(), tool: 'text', pts: [{ t: b[n - 50].time, p: b[n - 45].high }], text: 'Destek kırılımı' });
      var ms = S.add({ id: id(), tool: 'measure', pts: [{ t: b[n - 110].time, p: b[n - 110].close }, { t: b[n - 95].time, p: b[n - 95].close }] });
      S.add({ id: id(), tool: 'ray', pts: [{ t: b[n - 120].time, p: b[n - 120].high }, { t: b[n - 100].time, p: b[n - 100].high }] });
      S.select(ms.id);
      if (qp.get('fs') === '1') $('bt-fs-btn').click();
    }
    if (shot === 'multi') { $('bt-layout-btn').click(); $('bt-layout-pop').querySelector('[data-layout="1+3"]').click(); await sleep(800); }
    if (window.__shotHook) await window.__shotHook(shot);
    await sleep(600);
  } catch (e) { console.warn(e); }
  $('bt-smoke-result').textContent = 'PASS shot ' + shot + '\nDONE';
})();
