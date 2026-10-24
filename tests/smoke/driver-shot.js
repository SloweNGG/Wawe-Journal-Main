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
    if (window.__shotHook) await window.__shotHook(shot);
    await sleep(600);
  } catch (e) { console.warn(e); }
  $('bt-smoke-result').textContent = 'PASS shot ' + shot + '\nDONE';
})();
