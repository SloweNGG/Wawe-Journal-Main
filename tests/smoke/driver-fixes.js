// Chart tool fixes of 2026-11-23 (audit), with REAL mouse and keyboard (window.__pp):
// "go to date" lands ON the target minute (it is the next one played), held keys do not repeat orders / play-pause, the upgrade
// window stops the replay keys and pauses the replay, drawing while "hide all" is on shows the drawings again, a select gives the
// focus back (→ steps right after a timeframe change), a language change re-labels the drawing toolbar, the drawing clipboard
// stays with its account.
(async function () {
  var out = [];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  var T = function () { return window.__btTest; }, pp = window.__pp, pro = /plan=premium/.test(location.search);
  function R() { return T().R(); }
  function D() { return T().draw(); }
  function J(x) { return JSON.stringify(x); }
  async function press(k) { await pp({ op: 'key', key: k }); await sleep(80); }
  async function clickEl(e) { var r = e.getBoundingClientRect(); await pp({ op: 'click', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); await sleep(150); }
  function P(fx, fy) { var e = $('bt-chart'), r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) }; }
  async function newAccount(name) {
    await waitFor(function () { return $('bt-root').getAttribute('data-mode') && $('bt-new-account-btn'); }, 15000, 'list');
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    setv('bt-f-name', name); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && T() && T().bars() && T().bars().length > 50; }, 40000, 'replay ready');
    await sleep(300);
  }
  var errors = [];
  window.addEventListener('error', function (e) { errors.push(e.message); out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    await newAccount('Fixes');

    // ---------------- go to date: the clock shows the target, the target minute is the next one played
    var clock0 = R().win.t[R().k] + 60, input0 = $('bt-goto-input').value;
    ok('a new account starts ON its start minute (nothing of it played)', input0 === $('bt-f-start').value || R().win.t[R().k + 1] === clock0, input0 + ' / ' + $('bt-f-start').value);
    for (var i = 0; i < 12; i++) { $('bt-step-btn').click(); await sleep(15); }
    await sleep(300);
    ok('stepped forward', R().win.t[R().k] + 60 > clock0);
    $('bt-goto-input').value = input0; $('bt-goto-btn').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().win.t[R().k] + 60 <= clock0 + 60; }, 20000, 'goto');
    await sleep(400);
    var clk = R().win.t[R().k] + 60;
    ok('go to date: the clock equals the target (not one minute later)', clk === clock0 && $('bt-goto-input').value === input0, (clk - clock0) / 60 + ' min off, input ' + $('bt-goto-input').value);
    ok('go to date: the next minute played is the target', R().win.t[R().k + 1] === clock0, R().win.t[R().k + 1] - clock0);

    // ---------------- held keys: one order per press, one play/pause per press
    var n0 = R().eng.open.length;
    await pp({ op: 'key', key: 'Shift', type: 'down' });
    for (i = 0; i < 4; i++) { await pp({ op: 'key', key: 'B', type: 'down' }); await sleep(40); }    // 2nd-4th arrive with repeat = true
    await pp({ op: 'key', key: 'B', type: 'up' }); await pp({ op: 'key', key: 'Shift', type: 'up' }); await sleep(400);
    ok('holding Shift+B opens one position', R().eng.open.length - n0 === 1, R().eng.open.length - n0);
    var flips = 0, was = R().playing;
    for (i = 0; i < 4; i++) { await pp({ op: 'key', key: ' ', type: 'down' }); await sleep(60); if (R().playing !== was) { flips++; was = R().playing; } }
    await pp({ op: 'key', key: ' ', type: 'up' }); await sleep(100);
    ok('holding Space toggles play once', flips === 1, flips);
    if (R().playing) { $('bt-play-btn').click(); await sleep(100); }
    var steps = R().k;
    await pp({ op: 'key', key: 'ArrowRight', type: 'down' });
    for (i = 0; i < 3; i++) { await pp({ op: 'key', key: 'ArrowRight', type: 'down' }); await sleep(60); }
    await pp({ op: 'key', key: 'ArrowRight', type: 'up' }); await sleep(300);
    ok('holding → still steps repeatedly', R().k > steps, R().k - steps);

    // ---------------- the upgrade window (free plan: a Premium theme) pauses the replay and takes the replay keys
    if (!pro) {
    window.openUpgradeModal = function () { var b = $('ww-upgrade-modal-backdrop'); if (b) { b.style.display = 'flex'; b.classList.add('active'); } window.__upgrade = true; };
    $('bt-play-btn').click(); await sleep(200);
    ok('playing before the upgrade window', R().playing === true);
    $('bt-look-btn').click(); await sleep(150);
    $('bt-look-body').querySelector('[data-preset="mono"]').click(); await sleep(200);
    ok('upgrade window opened', window.__upgrade === true && $('ww-upgrade-modal-backdrop') && $('ww-upgrade-modal-backdrop').classList.contains('active'));
    ok('the replay paused when it opened', R().playing === false);
    n0 = R().eng.open.length;
    await press(' '); await sleep(200);
    await pp({ op: 'key', key: 'Shift', type: 'down' }); await press('B'); await pp({ op: 'key', key: 'Shift', type: 'up' }); await sleep(250);
    ok('Space / Shift+B do nothing behind the upgrade window', R().playing === false && R().eng.open.length === n0, R().playing + ' ' + (R().eng.open.length - n0));
    var bd = $('ww-upgrade-modal-backdrop'); bd.classList.remove('active'); bd.style.display = 'none';
    $('bt-look-close').click(); await sleep(150);
    }

    // ---------------- hide all, then draw: the drawings come back (no invisible, selected drawing)
    await clickEl(document.querySelector('#bt-draw-bar [data-act="hide"]'));
    ok('hide all on', D().set.hidden() === true);
    D().setTool('hline'); await sleep(100);
    ok('picking a tool ends hide all', D().set.hidden() === false && document.querySelector('#bt-draw-bar [data-act="hide"]').getAttribute('aria-pressed') === 'false');
    var c0 = D().set.list().length, pt = P(0.4, 0.4);
    await pp({ op: 'click', x: pt.x, y: pt.y }); await sleep(250);
    ok('the new line is visible and saved', D().set.list().length === c0 + 1 && !D().set.hidden(), D().set.list().length - c0);

    // ---------------- a timeframe select gives the focus back: → steps right after the change
    $('bt-tf').focus(); setv('bt-tf', '15m'); await sleep(1500);
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready' && R().tfId === '15m'; }, 15000, 'tf');
    ok('the timeframe select is not focused after the change', document.activeElement !== $('bt-tf'), document.activeElement && document.activeElement.id);
    var k1 = R().k; await press('ArrowRight'); await sleep(300);
    ok('→ steps right after the timeframe change', R().k > k1 && R().tfId === '15m', R().k - k1);
    $('bt-speed').focus(); setv('bt-speed', '5'); await sleep(100);
    ok('the speed select is not focused after the change', document.activeElement !== $('bt-speed'));

    // ---------------- language change re-labels the drawing toolbar
    if (window.i18n && typeof window.i18n.setLanguage === 'function') {
      await window.i18n.setLanguage('de'); await sleep(900);
      var hb = document.querySelector('#bt-draw-bar [data-act="hide"]'), lab = (hb.getAttribute('title') || '') + ' ' + (hb.getAttribute('aria-label') || '');
      ok('drawing toolbar in the new language', /Zeichnungen/.test(lab), lab);
      await window.i18n.setLanguage('en'); await sleep(600);
    }

    // ---------------- the drawing clipboard stays with its account (a second account: Premium)
    if (pro) {
    var line = D().set.list()[D().set.list().length - 1];
    D().set.select(line.id); await sleep(100);
    await pp({ op: 'key', key: 'Meta', type: 'down' }); await press('c'); await pp({ op: 'key', key: 'Meta', type: 'up' }); await sleep(100);
    await pp({ op: 'key', key: 'Meta', type: 'down' }); await press('v'); await pp({ op: 'key', key: 'Meta', type: 'up' }); await sleep(200);
    var same = D().set.list().length;
    ok('copy / paste works on the same account', same === c0 + 2, same - c0);
    $('bt-back-btn').click();
    await newAccount('Fixes 2');
    var before = D().set.list().length;
    await pp({ op: 'key', key: 'Meta', type: 'down' }); await press('v'); await pp({ op: 'key', key: 'Meta', type: 'up' }); await sleep(250);
    ok('another account: nothing to paste', D().set.list().length === before, D().set.list().length - before);
    }
    ok('no JavaScript errors', !errors.length, J(errors));
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  out.push('DONE');
  var res = document.getElementById('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' }));
  res.textContent = out.join('\n');
})();
