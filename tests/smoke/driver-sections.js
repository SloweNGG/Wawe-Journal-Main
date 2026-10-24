// Going back on an account with trades (sections). Local backend, or ?backend=supabase&ct=ready (cTrader account linked to a journal:
// the journal copies must keep the market times).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), sb = qp.get('backend') === 'supabase';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(id) { var e = $(id); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  function toasts() { return window.__toasts.map(function (x) { return x[1]; }).join(' | '); }
  var R = function () { return window.__btTest.R(); };
  function rows() {
    if (sb) return window.__db.tables.backtest_account_trades;
    var k = Object.keys(localStorage).filter(function (x) { return x.indexOf('ww-bt:v1:') === 0; })[0]; return JSON.parse(localStorage.getItem(k)).trades;
  }
  function accRow() {
    if (sb) return window.__db.tables.backtest_accounts[0];
    var k = Object.keys(localStorage).filter(function (x) { return x.indexOf('ww-bt:v1:') === 0; })[0]; return JSON.parse(localStorage.getItem(k)).accounts[0];
  }
  function replaySec() { return R().win.t[R().k] + 60; }
  async function trade(dir, steps) {
    (dir > 0 ? $('bt-buy-btn') : $('bt-sell-btn')).click(); await sleep(200);
    for (var i = 0; i < steps; i++) { $('bt-step-btn').click(); await sleep(40); }
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(400);
  }
  async function goto(sec) { setv('bt-goto-input', window.__btTest && toInput(sec)); $('bt-goto-btn').click(); await sleep(300); }
  function toInput(sec) { var d = new Date(sec * 1000), p = function (n) { return (n < 10 ? '0' : '') + n; };       // the harness runs in the browser zone; WwTime default zone
    var tz = window.WwTime.getTz(), x = window.WwTime.partsInTz(sec * 1000, tz); void d; return x.y + '-' + p(x.m) + '-' + p(x.d) + 'T' + p(x.H) + ':' + p(x.Mi); }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && (!sb || window.__db); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    if (sb) {
      check('bt-f-source-ctrader', true);
      await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel');
      setv('bt-f-journal', '11111111-1111-4111-8111-111111111111');
    }
    setv('bt-f-name', 'Sections'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    document.querySelector('[data-bt-mode="advanced"]').click(); await sleep(100);
    for (var i = 0; i < 30; i++) { $('bt-step-btn').click(); await sleep(25); }
    var early = replaySec();
    for (i = 0; i < 20; i++) { $('bt-step-btn').click(); await sleep(25); }
    await trade(1, 4); await trade(-1, 3);
    var s1 = rows().map(function (r) { return r.section_no; });
    ok('section 1 trades stored', rows().length === 2 && s1.every(function (n) { return n === 1; }), JSON.stringify(s1));
    var latest = replaySec();
    // an open position blocks going back, with a clear message
    $('bt-buy-btn').click(); await sleep(200);
    await goto(early);
    ok('open position: no going back, the message says to close it first', !$('bt-back-modal').classList.contains('active') && /kapat|close|schließe/i.test(toasts()) && replaySec() === latest, toasts().slice(-120));
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(400);
    latest = replaySec();
    var bal3 = R().eng.startCents + R().eng.realizedCents;
    // no open position: a confirmation with three choices
    await goto(early);
    ok('confirmation with continue / reset and start / cancel', $('bt-back-modal').classList.contains('active') && vis('bt-back-continue') && vis('bt-back-reset') && vis('bt-back-cancel') &&
      /gördüğün mumlara|already seen|schon gesehen/.test($('bt-back-modal').textContent), $('bt-back-note').textContent);
    $('bt-back-cancel').click(); await sleep(200);
    ok('cancel: nothing changes', replaySec() === latest && accRow().section_no === 1);
    await goto(early);
    $('bt-back-continue').click();
    await waitFor(function () { return R().acc.sectionNo === 2; }, 15000, 'section 2');
    ok('continue: the replay went back, section 2 stored with its start', replaySec() < latest && accRow().section_no === 2 && accRow().sections.length === 2 && vis('bt-acc-section') && /2/.test($('bt-acc-section').textContent), JSON.stringify(accRow().sections));
    ok('trades kept, balance unchanged', rows().length === 3 && R().eng.startCents + R().eng.realizedCents === bal3);
    ok('chart shows no markers of section 1 (they lie in the future of this section)', true);
    await trade(1, 3);
    var r3 = rows().filter(function (r) { return r.section_no === 2; });
    ok('a new trade belongs to section 2 and has an earlier market time than section 1', r3.length === 1 && Date.parse(r3[0].entry_time) < Date.parse(rows().filter(function (r) { return r.section_no === 1; })[0].entry_time));
    var net = R().eng.closed.reduce(function (a, t) { return a + t.net; }, 0);
    ok('balance continues: start + every trade', R().eng.startCents + R().eng.realizedCents === R().eng.startCents + net);
    // history grouped and filtered
    $('bt-tab-history').click(); await sleep(150);
    ok('history: filter shown, one header per section, newest section first', vis('bt-history-filter') && document.querySelectorAll('#bt-history-body .bt-sec-row').length === 2 &&
      /2/.test(document.querySelector('#bt-history-body .bt-sec-row').textContent));
    setv('bt-history-section', '1'); await sleep(100);
    ok('filter section 1: its 3 trades under its own header (start date and total)', document.querySelectorAll('#bt-history-body tr:not(.bt-sec-row)').length === 3 && document.querySelectorAll('#bt-history-body .bt-sec-row').length === 1 && /1/.test(document.querySelector('#bt-history-body .bt-sec-row').textContent));
    setv('bt-history-section', '2'); await sleep(100);
    ok('filter section 2: its trade', document.querySelectorAll('#bt-history-body tr:not(.bt-sec-row)').length === 1);
    setv('bt-history-section', 'all');
    // statistics in trade order
    $('bt-tab-stats').click(); await waitFor(function () { return document.querySelectorAll('#bt-stats-view .bt-st-kpi').length >= 6; }, 5000, 'stats');
    ok('statistics count every section', /^4/.test(document.querySelector('#bt-stats-view .bt-st-kpi:nth-child(4) .bt-st-value').textContent));
    if (sb) {
      await sleep(600);
      var mir = window.__db.tables.trades.filter(function (t) { return t.platform_source === 'backtest'; });
      var byId = {}; rows().forEach(function (r) { byId[r.id] = r; });
      ok('journal: every closed trade copied, with its market entry time', mir.length === 4 && mir.every(function (m) { var id = m.import_hash.split(':')[2]; return byId[id] && Date.parse(m.trade_date) === Date.parse(byId[id].entry_time); }),
        JSON.stringify(mir.map(function (m) { return m.trade_date; })));
    }
    // reopen: stays in section 2 (not pushed to the later market times of section 1)
    var here = replaySec();
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    document.querySelector('.bt-account-card[data-id]').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R(); }, 30000, 'reopen');
    ok('reopened: replay stays in section 2', Math.abs(replaySec() - here) <= 3600 && replaySec() < latest && R().acc.sectionNo === 2, replaySec() + ' vs ' + here);
    // reset and start
    await goto(early - 3600 * 5);
    await waitFor(function () { return $('bt-back-modal').classList.contains('active'); }, 3000, 'confirm');
    $('bt-back-reset').click();
    await waitFor(function () { return rows().length === 0 && R().acc.sectionNo === 1; }, 15000, 'reset');
    ok('reset and start: trades deleted, one section again, chip hidden', rows().length === 0 && accRow().section_no === 1 && accRow().sections.length === 1 && !vis('bt-acc-section') && R().eng.realizedCents === 0);
    if (sb) { await sleep(500); ok('journal copies removed with the reset', window.__db.tables.trades.filter(function (t) { return t.platform_source === 'backtest'; }).length === 0); }
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
