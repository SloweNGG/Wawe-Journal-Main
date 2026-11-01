// Backtest v2: the replay stays where it was. A refresh (?account=<id>) or coming back to Backtest without it (the remembered
// account) reopens the same account and shows the replay skeleton while it loads, never the account list; "Accounts" forgets it.
// Runs over four page loads (phase in sessionStorage); sign-in is slowed down (make.py: bt-smoke-slowauth) so the loading state
// is long enough to be seen.
(async function () {
  var out = [], KEY = 'bt-smoke-persist', SLOW = 'bt-smoke-slowauth';
  function $(id) { return document.getElementById(id); }
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra === undefined ? '' : ' :: ' + extra)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) { /* not yet */ } await sleep(30); } throw new Error('timeout: ' + what); }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function vis(e) { e = typeof e === 'string' ? $(e) : e; if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function acct() { return new URLSearchParams(location.search).get('account'); }
  function save(st) { sessionStorage.setItem(KEY, JSON.stringify(st)); }
  function done() { sessionStorage.removeItem(KEY); sessionStorage.removeItem(SLOW); var r = $('bt-smoke-result') || document.body.appendChild(Object.assign(document.createElement('pre'), { id: 'bt-smoke-result' })); r.textContent = out.join('\n') + '\nDONE'; }
  // what the page shows from now until fn() is true
  async function watch(fn, what) {
    var seen = { first: $('bt-root').getAttribute('data-state'), list: false, skel: false };
    await waitFor(function () { if (vis('bt-view-list')) seen.list = true; if (vis('bt-replay-skel')) seen.skel = true; return fn(); }, 40000, what);
    return seen;
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  var st = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  if (st && st.out) out = st.out;
  try {
    if (!st) {
      // 1: open a new account, then refresh
      await waitFor(function () { return $('bt-root').getAttribute('data-mode'); }, 20000, 'boot');
      $('bt-new-account-btn').click();
      await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 10000, 'modal');
      setv('bt-f-name', 'Kalıcı Hesap'); $('bt-account-submit').click();
      await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay');
      ok('opening an account puts it in the address', !!acct(), location.search);
      sessionStorage.setItem(SLOW, new URLSearchParams(location.search).get('shot') ? '6000' : '900'); save({ phase: 2, id: acct(), out: out });
      location.reload();
      return;
    }
    var ready = function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; };
    if (st.phase === 2) {
      if (new URLSearchParams(location.search).get('shot')) { await waitFor(function () { return vis('bt-replay-skel'); }, 10000, 'skeleton'); done(); return; }   // screenshot of the skeleton (sign-in held for 6 s)
      // 2: after the refresh: the same account, its skeleton while loading, never the list
      var s2 = await watch(ready, 'replay after the refresh');
      ok('refresh: the first frame is the replay skeleton, not the list', s2.first === 'resume', s2.first);
      ok('refresh: the same account is open again', acct() === st.id && $('bt-acc-name').textContent === 'Kalıcı Hesap', location.search + ' / ' + $('bt-acc-name').textContent);
      ok('refresh: the account list is never shown', !s2.list, JSON.stringify(s2));
      ok('refresh: the replay skeleton is shown while it loads', s2.skel, JSON.stringify(s2));
      ok('refresh: the skeleton is gone once the chart is ready', !vis('bt-replay-skel'));
      // coming back to Backtest from another page: the address has no ?account=
      var u = new URL(location.href); u.searchParams.delete('account');
      save({ phase: 3, id: st.id, out: out });
      location.href = u.href;
      return;
    }
    if (st.phase === 3) {
      // 3: Backtest again without ?account=: the remembered account, then "Accounts" forgets it
      var s3 = await watch(ready, 'replay when coming back');
      ok('coming back: the remembered account opens, with its skeleton and without the list', $('bt-acc-name').textContent === 'Kalıcı Hesap' && s3.first === 'resume' && s3.skel && !s3.list, JSON.stringify(s3));
      ok('coming back: the account is in the address again', acct() === st.id, location.search);
      $('bt-back-btn').click();
      await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list' && document.querySelector('.bt-account-card[data-id]'); }, 10000, 'list');
      ok('"Accounts": the address and the browser forget the account', !acct() && !localStorage.getItem('ww_bt_resume'), location.search + ' / ' + localStorage.getItem('ww_bt_resume'));
      save({ phase: 4, id: st.id, out: out });
      location.reload();
      return;
    }
    if (st.phase === 4) {
      // 4: after "Accounts" a refresh stays on the list (no skeleton of an account)
      var s4 = await watch(function () { return $('bt-root').getAttribute('data-state') === 'list' && document.querySelector('.bt-account-card[data-id]'); }, 'list after the refresh');
      ok('after "Accounts" a refresh shows the list, no account skeleton', s4.first !== 'resume' && !s4.skel && $('bt-view-replay').hidden, JSON.stringify(s4));
    }
  } catch (e) {
    out.push('EXCEPTION ' + (e && e.message || e));
  }
  done();
})();
