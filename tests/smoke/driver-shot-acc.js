// Screenshots of the account window (--shots): ?mode=create|edit, &tab=<tab>, &light=1, cTrader account with backend=supabase&ct=ready.
(async function () {
  var qp = new URLSearchParams(location.search), out = [];
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function tab(id) { document.querySelector('#bt-acc-tabs [data-acc-tab="' + id + '"]').click(); }
  try {
    if (qp.get('light') === '1') document.body.classList.add('light-theme');
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && (qp.get('backend') !== 'supabase' || window.__db); });
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; });
    if (qp.get('ct') === 'ready') {
      tab('data'); var c = $('bt-f-source-ctrader'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(function () { return !$('bt-f-ct-wrap').hidden && $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); });
    }
    if (qp.get('mode') === 'edit') {
      setv('bt-f-name', 'BTC London'); $('bt-account-submit').click();
      await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000);
      $('bt-buy-btn').click(); await sleep(200);
      $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); });
      await sleep(300);
    }
    tab(qp.get('tab') || 'general');
    if (qp.get('tip') === '1') { var l = document.querySelector('#bt-account-modal .bt-acc-pane:not([hidden]) .bt-ro-lock'); if (l) l.focus(); }
    await sleep(500);
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nPASS shot\nDONE'; }
})();
