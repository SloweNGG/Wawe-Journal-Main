// "Plan and usage" tab of the settings window (FakeDb emulates get_backtest_plan_usage, migration 202610260001). Supabase backend.
// ?plan=free&tused=37: below the limit (no badge, account quota 1/1 full, trades 37/100). ?tused=85: above 80 % (badge, orange).
// ?tused=100: at the limit (red). ?ctflow=1&tused=79&ct=ready: opening trades on a cTrader account refreshes the numbers from the
// database (80 % badge appears, then the limit). ?plan=premium&pexp=...: Premium. ?m12=0: RPC missing (error, no numbers).
// ?phone=1: horizontal tabs on top. ?shot=1: ends with the tab open (screenshots).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), pro = qp.get('plan') === 'premium', used0 = +(qp.get('tused') || 0), limit = +(qp.get('tlimit') || 100);
  var lang = qp.get('i18n') || 'tr';
  var TX = {
    tr: { tab: 'Plan ve kullanım', free: 'Ücretsiz', near: 'Sınıra yaklaşıyorsun', reached: 'Sınıra ulaştın', unlimited: 'Sınırsız', on: 'Açık', resets: 'Sıfırlanma', note: 'tüm backtest hesapların', utc: 'UTC' },
    en: { tab: 'Plan and usage', free: 'Free', near: 'close to the limit', reached: 'reached the limit', unlimited: 'Unlimited', on: 'Included', resets: 'Resets on', note: 'all your backtest accounts', utc: 'UTC' },
    de: { tab: 'Plan und Nutzung', free: 'Kostenlos', near: 'näherst dich dem Limit', reached: 'Limit erreicht', unlimited: 'Unbegrenzt', on: 'Enthalten', resets: 'Zurücksetzung', note: 'alle deine Backtest-Konten', utc: 'UTC' }
  }[lang];
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(e) { if (typeof e === 'string') e = $(e); if (!e || e.hidden) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  function rpcCalls() { return window.__db.client.calls.filter(function (c) { return c.table === 'rpc:get_backtest_plan_usage'; }).length; }
  function card(id) { return q('#bt-plan-panel [data-usage="' + id + '"]'); }
  function val(id) { var c = card(id); return c ? q('.bt-plan-meter-val', c).textContent : null; }
  function badges() { return Array.prototype.filter.call(document.querySelectorAll('[data-bt-plan-badge]'), vis); }
  function modalOpen() { return $('bt-account-modal').classList.contains('active'); }
  function planShown() { return modalOpen() && vis('bt-plan-panel') && !!card('accounts'); }
  function foot() { return q('#bt-account-modal .modal-footer'); }
  function accVisible() { return vis('bt-acc-pane-general'); }
  async function openPlanViaSettings() {
    $('bt-acc-settings-btn').click();
    await waitFor(function () { return modalOpen() && accVisible(); }, 8000, 'settings');
    $('bt-acc-tab-plan').click();
    await waitFor(planShown, 8000, 'plan tab');
  }
  async function createAccount(ct) {
    $('bt-new-account-btn').click();
    await waitFor(function () { return modalOpen() && $('bt-f-start').value; }, 15000, 'create modal');
    if (ct) {
      check('bt-f-source-ctrader', true);
      await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel');
    }
    setv('bt-f-name', ct ? 'CT plan' : 'Plan'); $('bt-account-submit').click();
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 40000, 'replay ready');
    await sleep(300);
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  try {
    if (qp.get('light') === '1') document.body.classList.add('light-theme');
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list');
    await sleep(700);                                                          // first (debounced) plan read

    if (qp.get('m12') === '0') {
      ok('RPC missing: no badge', badges().length === 0);
      await createAccount(false);
      $('bt-acc-settings-btn').click(); await waitFor(modalOpen, 8000, 'settings'); $('bt-acc-tab-plan').click();
      await waitFor(function () { return /\S/.test($('bt-plan-panel').textContent) && $('bt-plan-panel').getAttribute('aria-busy') === 'false'; }, 8000, 'error state');
      ok('RPC missing: error and retry, no numbers', !!q('#bt-plan-panel .bt-banner-error button') && !card('accounts') && !/\d+ \/ \d+/.test($('bt-plan-panel').textContent), $('bt-plan-panel').textContent);
      throw 'done';
    }

    if (qp.get('ctflow') === '1') {
      ok('79 %: no badge yet', badges().length === 0);
      await createAccount(true);
      var c0 = rpcCalls();
      $('bt-buy-btn').click();
      await waitFor(function () { return badges().length === 1; }, 5000, 'badge after trade');
      var b = badges()[0];
      ok('trade opened: numbers re-read from the database, 80/100 badge in the replay header', rpcCalls() > c0 && b.getAttribute('data-level') === 'warn' && /80\D+100/.test(b.textContent) && !!b.closest('.bt-replay-head'), b.textContent);
      ok('badge has an accessible name (not colour only)', /80/.test(b.getAttribute('aria-label') || ''), b.getAttribute('aria-label'));
      window.__db.tradeUsed = 99;                                              // e.g. trades from another device
      $('bt-step-btn').click(); await sleep(150);
      $('bt-sell-btn').click();
      await waitFor(function () { return badges()[0] && badges()[0].getAttribute('data-level') === 'full'; }, 5000, 'badge full');
      ok('the trade that reaches the limit: red badge 100/100, order buttons off', /100\D+100/.test(badges()[0].textContent) && $('bt-buy-btn').disabled, badges()[0].textContent);
      ok('order panel indicator follows the database (100 / 100)', /100\D+100/.test($('bt-limit-text').textContent), $('bt-limit-text').textContent);
      badges()[0].click();
      await waitFor(planShown, 8000, 'badge opens tab');
      ok('badge opens the account window on the plan tab (tabs visible in replay)', $('bt-acc-tab-plan').getAttribute('aria-selected') === 'true' && vis('bt-acc-tabs') && !accVisible() && document.activeElement === $('bt-acc-tab-plan'));
      var ct = card('ct_trades');
      ok('trades card at the limit: red level and "reached" text', ct.getAttribute('data-level') === 'full' && val('ct_trades') === '100 / 100' && q('.bt-plan-status', ct).textContent.indexOf(TX.reached) >= 0, ct.textContent);
      throw 'done';
    }

    if (pro) {
      ok('premium: no badge', badges().length === 0);
      await createAccount(false);
      await openPlanViaSettings();
      var name = q('#bt-plan-panel .bt-plan-name');
      ok('premium: plan name and end date', name.getAttribute('data-plan') === 'premium' && /2026|2027/.test(q('#bt-plan-panel .bt-plan-sub').textContent), q('#bt-plan-panel .bt-plan-who').textContent);
      ok('premium: no upgrade button', !q('#bt-plan-panel .bt-plan-upgrade'));
      ok('premium: accounts 1 / 10, ok level', val('accounts') === '1 / 10' && card('accounts').getAttribute('data-level') === 'ok');
      ok('premium: cTrader trades unlimited, this month\'s count shown', val('ct_trades') === TX.unlimited && new RegExp(String(used0)).test(card('ct_trades').textContent) && !q('.bt-plan-bar', card('ct_trades')), card('ct_trades').textContent);
      ok('premium: synthetic unlimited', val('syn_trades') === TX.unlimited);
      var fr = document.querySelectorAll('#bt-plan-panel .bt-plan-feat');
      ok('premium: all five features on, drawing tools 9 / 9', fr.length === 5 && Array.prototype.every.call(fr, function (f) { return f.getAttribute('data-on') === 'true' && f.textContent.indexOf(TX.on) >= 0; }) && /9 \/ 9/.test(fr[0].textContent));
      if (qp.get('shot') === '1') throw 'shot';
      throw 'done';
    }

    // free
    var level = used0 >= limit ? 'full' : used0 / limit >= 0.8 ? 'warn' : 'ok';
    if (level === 'ok') ok('free below 80 %: no badge', badges().length === 0);
    else {
      var lb = badges();
      ok('free ' + level + ': one badge next to the list title', lb.length === 1 && lb[0].getAttribute('data-level') === level && !!lb[0].closest('.bt-title-row') && new RegExp(used0 + '\\D+' + limit).test(lb[0].textContent), lb.map(function (x) { return x.textContent; }).join());
      lb[0].click();
      await waitFor(planShown, 8000, 'plan only');
      ok('list badge: the tab on its own (no tabs, no form, no footer)', !vis('bt-acc-tabs') && !accVisible() && !vis(foot()) && $('bt-account-modal-title').textContent === TX.tab, $('bt-account-modal-title').textContent);
      var tc = card('ct_trades');
      ok('trades card ' + level + ': bar width and status text', tc.getAttribute('data-level') === level && q('.bt-plan-bar span', tc).style.width === Math.min(100, used0 / limit * 100) + '%' &&
        q('.bt-plan-status', tc).textContent.indexOf(level === 'full' ? TX.reached : TX.near) >= 0, tc.textContent);
      if (qp.get('phone') === '1') {
        $('bt-account-close').click(); await sleep(100);
        await createAccount(false);
        await openPlanViaSettings();
        var tabs = $('bt-acc-tabs'), cs = getComputedStyle(tabs);
        ok('phone: tabs in a row on top of the panel', cs.flexDirection === 'row' && tabs.getBoundingClientRect().bottom <= $('bt-plan-panel').getBoundingClientRect().top + 1, cs.flexDirection);
        ok('phone: no horizontal page scroll, window within the screen', document.documentElement.scrollWidth <= window.innerWidth + 1 && q('#bt-account-modal .modal-box').getBoundingClientRect().right <= window.innerWidth + 1);
        ok('phone: usage cards in one column', card('accounts').getBoundingClientRect().left === card('ct_trades').getBoundingClientRect().left);
        if (qp.get('shot') === '1') throw 'shot';
        throw 'done';
      }
      if (qp.get('shot') === '1') throw 'shot';
      throw 'done';
    }

    await createAccount(false);
    ok('free below 80 %: still no badge in the replay header', badges().length === 0);
    $('bt-acc-settings-btn').click();
    await waitFor(function () { return modalOpen() && accVisible(); }, 8000, 'settings');
    ok('account window opens on the general tab, footer visible, plan tab before the danger zone', $('bt-acc-tab-general').getAttribute('aria-selected') === 'true' && vis(foot()) && !vis('bt-plan-panel') && $('bt-acc-tab-plan').nextElementSibling === $('bt-acc-tab-danger'));
    ok('vertical tabs on the left on desktop', getComputedStyle($('bt-acc-tabs')).flexDirection === 'column' && $('bt-acc-tabs').getBoundingClientRect().right <= $('bt-account-form').getBoundingClientRect().left + 1);
    var c1 = rpcCalls();
    $('bt-acc-tab-plan').click();
    await waitFor(planShown, 8000, 'plan tab');
    await sleep(200);
    ok('opening the tab reads the database again', rpcCalls() > c1, c1 + ' -> ' + rpcCalls());
    ok('plan tab: footer hidden, roles and selection', !vis(foot()) && $('bt-acc-tab-plan').getAttribute('aria-selected') === 'true' && $('bt-acc-tab-plan').tabIndex === 0 && $('bt-acc-tab-general').tabIndex === -1);
    ok('plan card: free plan and upgrade button', q('#bt-plan-panel .bt-plan-name').getAttribute('data-plan') === 'free' && q('#bt-plan-panel .bt-plan-name').textContent === TX.free && !!q('#bt-plan-panel .bt-plan-upgrade'));
    ok('note: limits apply to all backtest accounts', q('#bt-plan-panel .bt-plan-note').textContent.indexOf(TX.note) >= 0, q('#bt-plan-panel .bt-plan-note').textContent);
    var ac = card('accounts');
    ok('accounts 1 / 1: red, "reached" text next to the bar', val('accounts') === '1 / 1' && ac.getAttribute('data-level') === 'full' && q('.bt-plan-status', ac).textContent.indexOf(TX.reached) >= 0 && q('.bt-plan-bar', ac).getAttribute('aria-valuetext') === '1 / 1');
    var tc2 = card('ct_trades');
    ok('cTrader trades ' + used0 + ' / ' + limit + ': ok level, no status text', val('ct_trades') === used0 + ' / ' + limit && tc2.getAttribute('data-level') === 'ok' && !q('.bt-plan-status', tc2));
    ok('reset date in the user\'s time zone + UTC note', tc2.textContent.indexOf(TX.resets) >= 0 && /20\d\d/.test(tc2.textContent) && q('.bt-plan-utc', tc2).textContent.indexOf(TX.utc) >= 0, tc2.textContent);
    ok('synthetic: unlimited', val('syn_trades') === TX.unlimited);
    var fr2 = document.querySelectorAll('#bt-plan-panel .bt-plan-feat');
    ok('features: drawing tools 9 / 9 and saved drawings on (free for every plan); themes, stats, multi locked with a lock and PRO tag', fr2.length === 5 &&
      Array.prototype.slice.call(fr2, 0, 2).every(function (f) { return f.getAttribute('data-on') === 'true' && f.textContent.indexOf(TX.on) >= 0 && !q('.bt-pro', f); }) &&
      Array.prototype.slice.call(fr2, 2).every(function (f) { return f.getAttribute('data-on') === 'false' && q('.bt-pro', f) && q('.bt-plan-feat-state svg', f); }) && /9 \/ 9/.test(fr2[0].textContent));
    ok('icons rendered (lucide)', document.querySelectorAll('#bt-plan-panel svg').length >= 10 && !document.querySelector('#bt-plan-panel i[data-lucide]'), document.querySelectorAll('#bt-plan-panel i[data-lucide]').length);
    // keyboard
    $('bt-acc-tab-plan').focus();
    $('bt-acc-tab-plan').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    ok('arrow keys move between tabs (plan -> journal link), footer back', $('bt-acc-tab-journal').getAttribute('aria-selected') === 'true' && document.activeElement === $('bt-acc-tab-journal') && !vis('bt-plan-panel') && vis(foot()));
    $('bt-acc-tab-journal').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    ok('arrow down from the journal link reaches the plan tab', $('bt-acc-tab-plan').getAttribute('aria-selected') === 'true' && vis('bt-plan-panel'));
    // the database changes, the tab shows it on the next open
    window.__db.tradeUsed = 85;
    $('bt-acc-tab-general').click(); $('bt-acc-tab-plan').click();
    await waitFor(function () { return val('ct_trades') === '85 / ' + limit; }, 5000, 'reread');
    ok('re-opened tab: 85 / 100 from the database, orange + "close to the limit"', card('ct_trades').getAttribute('data-level') === 'warn' && q('.bt-plan-status', card('ct_trades')).textContent.indexOf(TX.near) >= 0);
    ok('badge appears in the replay header after the re-read', badges().length === 1 && badges()[0].getAttribute('data-level') === 'warn');
    if (qp.get('shot') === '1') throw 'shot';
    q('#bt-plan-panel .bt-plan-upgrade').click(); await sleep(100);
    ok('upgrade: settings window closes, upgrade window opens', window.__upgrade === true && !modalOpen());
  } catch (e) { if (e !== 'done' && e !== 'shot') out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
