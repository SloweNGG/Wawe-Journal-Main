// Indicators (bt-ind.js) on the real page with REAL mouse and keyboard (window.__pp): the drawer adds all seven, the chart gets
// their series and draws their names, the replay's tail updates match a full computation, settings / hide / colors / remove,
// a candle style rebuild and a timeframe change keep them, the second chart of a layout shows them too (Premium), storage.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, I = window.WwBtInd, pp = window.__pp, pro = /plan=premium/.test(location.search), shot = /[?&]shot=1/.test(location.search);
  function J(x) { return JSON.stringify(x); }
  function R() { return T().R(); }
  async function clickEl(e) { var r = e.getBoundingClientRect(); await pp({ op: 'click', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); await sleep(120); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  async function type(s) { await pp({ op: 'type', text: s }); await sleep(80); }
  function body() { return $('bt-ind-body'); }
  function card(type) { return Array.prototype.filter.call(body().querySelectorAll('.bt-ind-card'), function (c) { return c.querySelector('.bt-ind-name').textContent.indexOf(I.SHORT[type]) === 0; })[0]; }
  function stored() { return I.load(window.localStorage).list; }
  var texts = [], ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s) { if (texts.length < 8000) texts.push(String(s)); return ft.apply(this, arguments); };
  async function drawnTexts() { texts = []; T().chart().applyOptions({}); await sleep(250); return texts.join(' | '); }
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(e.message); out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  // the page's values for the last bars must equal a fresh full computation on the same bars
  function matchesFull(v, what) {
    var bars = v.bars, bad = [];
    stored().filter(function (x) { return !x.hidden; }).forEach(function (inst) {
      var full = I.compute(inst, bars, 0, {});
      I.TYPES[inst.type].lines.forEach(function (l) {
        if (l.colorOnly) return;
        var page = v.ind.values(inst.id, bars.length - 1), idx = I.TYPES[inst.type].lines.filter(function (x) { return !x.colorOnly; }).indexOf(l);
        var want = full[l.k][bars.length - 1], got = page && page[idx] ? page[idx].text : null;
        var exp = want == null ? '—' : (I.TYPES[inst.type].decimals != null ? want.toFixed(I.TYPES[inst.type].decimals) : Number(want).toFixed(R().sym.digits));
        if (got !== exp) bad.push(inst.type + '.' + l.k + ' ' + got + ' vs ' + exp);
      });
    });
    ok(what, !bad.length, J(bad));
  }
  try {
    try { localStorage.removeItem(I.KEY); } catch (e) { /* ignore */ }
    await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', 'Indicators'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    for (var i = 0; i < 5; i++) { $('bt-step-btn').click(); await sleep(20); }
    await sleep(300);
    var main0 = J(T().chart().priceScale('right').options().scaleMargins);

    // ---------------- drawer: open with the button, add every indicator
    ok('toolbar has the indicators button', !!$('bt-ind-btn') && $('bt-ind-btn').getBoundingClientRect().width > 0);
    await clickEl($('bt-ind-btn'));
    ok('drawer opens', !$('bt-ind-drawer').hidden && $('bt-ind-btn').getAttribute('aria-expanded') === 'true');
    ok('seven indicator buttons, empty list', body().querySelectorAll('[data-add]').length === 7 && !body().querySelector('.bt-ind-card'));
    for (var k = 0; k < I.TYPE_IDS.length; k++) await clickEl(body().querySelector('[data-add="' + I.TYPE_IDS[k] + '"]'));
    ok('seven cards in the drawer', body().querySelectorAll('.bt-ind-card').length === 7);
    ok('stored in this browser', stored().map(function (x) { return x.type; }).join() === I.TYPE_IDS.join());
    var v = R();
    ok('the chart has all seven', v.ind && v.ind.count() === 7);
    var m = v.ind.margins();
    ok('four oscillator bands at the bottom, the candles above them', m.osc.length === 4 && J(T().chart().priceScale('right').options().scaleMargins) !== main0 && T().chart().priceScale('right').options().scaleMargins.bottom >= m.area, J(m.main));
    var tx = await drawnTexts();
    ok('names drawn on the chart', ['SMA 20', 'EMA 50', 'BB 20 2', 'RSI 14', 'MACD 12 26 9', 'Stoch 14 1 3', 'ATR 14'].every(function (s) { return tx.indexOf(s) >= 0; }), tx.slice(0, 400));
    matchesFull(v, 'values on the chart equal a full computation');
    var rsi = v.ind.values(stored()[3].id); ok('RSI value between 0 and 100', rsi && +rsi[0].text >= 0 && +rsi[0].text <= 100, J(rsi));

    // ---------------- replay: candle by candle (tail updates) and fast
    for (i = 0; i < 25; i++) { $('bt-step-btn').click(); await sleep(15); }
    await sleep(400);
    matchesFull(R(), 'after 25 steps the tail-updated values equal a full computation');
    setv('bt-speed', '10'); $('bt-play-btn').click(); await sleep(1500); $('bt-play-btn').click(); await sleep(400);
    matchesFull(R(), 'after playing the values still equal a full computation');

    // ---------------- settings: length, source, hide, color, remove
    var rc = card('rsi'), inp = rc.querySelector('[data-param="length"]');
    await clickEl(inp); inp.select(); await press('Backspace'); await type('7'); await press('Tab');
    await sleep(200);
    ok('RSI length 7 from the drawer', stored()[3].params.length === 7 && card('rsi').querySelector('.bt-ind-name').textContent === 'RSI 7', J(stored()[3].params));
    tx = await drawnTexts(); ok('the chart shows RSI 7', tx.indexOf('RSI 7') >= 0 && tx.indexOf('RSI 14') < 0);
    matchesFull(R(), 'RSI 7 values equal a full computation');
    var sel = card('sma').querySelector('[data-param="source"]'); sel.value = 'hl2'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);
    ok('SMA source hl2', stored()[0].params.source === 'hl2' && card('sma').querySelector('.bt-ind-name').textContent === 'SMA 20 hl2');
    await clickEl(card('macd').querySelector('[data-act="toggle"]'));
    ok('MACD hidden: kept in the list, off the chart, its band gone', stored()[4].hidden === true && R().ind.count() === 6 && R().ind.margins().osc.length === 3);
    await clickEl(card('macd').querySelector('[data-act="toggle"]'));
    ok('MACD shown again', R().ind.count() === 7 && R().ind.margins().osc.length === 4);
    var ci = card('ema').querySelector('[data-color="ma"]'); ci.value = '#00ff00'; ci.dispatchEvent(new Event('input', { bubbles: true })); ci.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
    ok('EMA color changed', stored()[1].colors.ma === '#00ff00');
    await clickEl(card('atr').querySelector('[data-act="del"]'));
    ok('ATR removed', stored().length === 6 && R().ind.count() === 6 && !card('atr'));
    await press('Escape');
    ok('Esc closes the drawer', $('bt-ind-drawer').hidden && $('bt-ind-btn').getAttribute('aria-expanded') === 'false');

    // ---------------- appearance drawer and indicators drawer never both open
    await clickEl($('bt-ind-btn')); $('bt-look-btn').click(); await sleep(120);   // the open drawer covers the button (as the appearance drawer does)
    ok('opening the appearance drawer closes the indicators drawer', $('bt-ind-drawer').hidden && !$('bt-look-drawer').hidden);
    await press('Escape');

    // ---------------- rebuilds keep them: Heikin Ashi (premium) / volume, timeframe
    if (pro) {
      var lk = JSON.parse(localStorage.getItem(window.WwBtLook.KEY) || '{}'); lk.custom = Object.assign({}, lk.custom, { style: 'heikin', showVolume: true });
      localStorage.setItem(window.WwBtLook.KEY, J(lk));
      $('bt-look-btn').click(); await sleep(100);
      $('bt-look-body').querySelector('[data-style="heikin"]').click(); await sleep(300);
      var vs = $('bt-look-body').querySelector('[data-switch="showVolume"]'); if (vs && !vs.checked) vs.click();
      await sleep(400); $('bt-look-close').click();
      ok('candle style rebuild keeps the indicators', R().ind && R().ind.count() === 6);
      matchesFull(R(), 'Heikin Ashi: values still from the real prices');
      var mm = R().ind.margins(), vm = T().chart().priceScale('bt-vol').options().scaleMargins;
      ok('volume sits right above the oscillator bands', Math.abs(vm.bottom - mm.area) < 1e-9, J(vm) + ' area ' + mm.area);
    }
    setv('bt-tf', '15m'); await sleep(1500);
    await waitFor(function () { return R().ind && R().ind.count() === 6 && R().bars.length > 50; }, 15000, 'tf rebuilt');
    ok('timeframe change keeps the indicators', R().ind.count() === 6);
    matchesFull(R(), 'M15 values equal a full computation');

    // ---------------- a second chart (Premium): the same indicators on its own timeframe
    if (pro) {
      $('bt-layout-btn').click(); await sleep(80);
      var b2 = $('bt-layout-pop').querySelector('[data-layout="2h"]'); if (b2) b2.click();
      await waitFor(function () { return R().extra.length === 1 && R().extra[0].bars && R().extra[0].bars.length > 20 && R().extra[0].ind; }, 20000, 'second chart');
      await sleep(500);
      ok('the second chart shows the indicators too', R().extra[0].ind && R().extra[0].ind.count() === 6);
      matchesFull(R().extra[0], 'second chart values equal a full computation');
      for (i = 0; i < 6; i++) { $('bt-step-btn').click(); await sleep(20); }
      await sleep(300);
      matchesFull(R().extra[0], 'second chart after steps');
      $('bt-layout-btn').click(); await sleep(80); $('bt-layout-pop').querySelector('[data-layout="1"]').click(); await sleep(400);
    }

    // ---------------- ?shot=1: leave them on the chart for a screenshot
    if (shot) { $('bt-ind-btn').click(); await sleep(150); if ($('bt-ind-drawer').hidden === false) $('bt-ind-close').click(); T().chart().timeScale().setVisibleLogicalRange({ from: R().bars.length - 110, to: R().bars.length + 5 }); await sleep(400); throw 'shot'; }
    // ---------------- remove all: the candles get their room back
    await clickEl($('bt-ind-btn'));
    await clickEl(body().querySelector('[data-act="clear"]'));
    ok('remove all', !stored().length && R().ind.count() === 0 && R().ind.margins().osc.length === 0);
    var sm = T().chart().priceScale('right').options().scaleMargins;
    ok('the candles get their room back', Math.abs(sm.top - 0.08) < 1e-9 && Math.abs(sm.bottom - (R().look.showVolume ? 0.2 : 0.08)) < 1e-9, J(sm));
    await press('Escape');
    ok('no price scale self-check warnings', !(window.__warns || []).some(function (w) { return /price scale off/.test(w); }), J((window.__warns || []).slice(0, 3)));
    ok('no JavaScript errors', !errors.length, J(errors));
  } catch (e) { if (e !== 'shot') out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var res = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  res.textContent = out.join('\n');
})();
