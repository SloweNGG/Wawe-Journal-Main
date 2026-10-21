// cTrader data scenario (Phase 2): SupabaseStore over the FakeDb (Migrations 08 + 09 emulated), the ctrader-candles Edge Function stubbed in
// make.py (fetch), a connected cTrader account (?ct=ready). Run: ?backend=supabase&driver=/__driver-ct.js&role=user&plan=premium&ct=ready
// Also covers ?ct=none and ?ct=reconnect (the source option stays disabled with the right link).
(async function () {
  var out = [], qp = new URLSearchParams(location.search), role = qp.get('role') || 'user', ct = qp.get('ct') || 'ready';
  function ok(name, cond, extra) { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra !== undefined ? ' :: ' + extra : '')); }
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function waitFor(fn, ms, what) { var t = Date.now(); while (Date.now() - t < (ms || 20000)) { try { if (fn()) return true; } catch (e) {} await sleep(50); } out.push('TIMEOUT ' + what); return false; }
  function vis(id) { var e = $(id); return !!e && !e.hidden && e.offsetParent !== null; }
  function setv(id, v) { var e = $(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }
  function check(id, on) { var e = $(id); e.checked = on; e.dispatchEvent(new Event('change', { bubbles: true })); }
  function toasts() { return window.__toasts.map(function (x) { return x[1]; }).join(' | '); }
  function idbCount() {
    return new Promise(function (resolve) {
      var r = indexedDB.open('ww_bt_ctrader', 1);
      r.onsuccess = function () {
        var db = r.result, t = db.transaction('months', 'readonly'), c = t.objectStore('months').getAll();
        c.onsuccess = function () { resolve(c.result); };
        c.onerror = function () { resolve(null); };
      };
      r.onerror = function () { resolve(null); };
    });
  }
  window.addEventListener('error', function (e) { out.push('JSERROR ' + e.message + ' @' + e.filename + ':' + e.lineno); });
  var db = null, J1 = '11111111-1111-4111-8111-111111111111';
  window.__syncLog = [];
  (function () { var s = window.WwBtSync.syncClosedTrade; window.WwBtSync.syncClosedTrade = function () { var p = s.apply(this, arguments); p.then(function (r) { window.__syncLog.push(JSON.stringify(r).slice(0, 300)); }); return p; }; })();
  try {
    await waitFor(function () { return window.__db && $('bt-root').getAttribute('data-state') === 'list'; }, 15000, 'list state');
    db = window.__db;
    $('bt-new-account-btn').click();
    await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal');
    var linkText = $('bt-f-source-connect-link').textContent;

    if (ct !== 'ready') {
      ok('ct=' + ct + ': cTrader option disabled', $('bt-f-source-ctrader').disabled && $('bt-f-source-synthetic').checked);
      ok('ct=' + ct + ': link to /journals shown', vis('bt-f-source-connect') && $('bt-f-source-connect-link').getAttribute('href') === '/journals', linkText);
      ok('ct=' + ct + ': link text', ct === 'reconnect' ? /yenile|renew|erneuern/i.test(linkText) : /bağla|connect|verbinden/i.test(linkText), linkText);
      ok('ct=' + ct + ': no Edge Function call', window.__ctCalls.length === 0);
      ok('ct=' + ct + ': the panel stays hidden', !vis('bt-f-ct-wrap'));
      return;
    }

    // ---- connected: option enabled, no link
    ok('ct=ready: cTrader option enabled, no connect link', !$('bt-f-source-ctrader').disabled && !vis('bt-f-source-connect'));
    ok('ct=ready: synthetic stays the default', $('bt-f-source-synthetic').checked && !vis('bt-f-ct-wrap') && !vis('bt-f-journal-wrap'));
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return vis('bt-f-ct-wrap') && $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'ct panel measured');
    ok('account select lists the broker account', $('bt-f-ct-account').options.length === 1 && /Spotware/.test($('bt-f-ct-account').options[0].textContent), $('bt-f-ct-account').options[0] && $('bt-f-ct-account').options[0].textContent);
    var names = Array.prototype.map.call($('bt-f-ct-symbol').options, function (o) { return o.textContent; });
    ok('broker symbols for EUR/USD: exact name first, variant second, no other pair', names.join() === 'EURUSD,EURUSD.r', names.join());
    ok('depth measured and shown (first data month 2024-02)', /2024/.test($('bt-f-ct-depth').textContent), $('bt-f-ct-depth').textContent);
    ok('start date limited to the measured depth', /^2024-02/.test($('bt-f-start').min) && $('bt-f-start').max.length > 8, $('bt-f-start').min + ' / ' + $('bt-f-start').max);
    ok('default start is inside the depth', $('bt-f-start').value >= $('bt-f-start').min, $('bt-f-start').value);
    ok('journal select appears for a cTrader account', vis('bt-f-journal-wrap') && $('bt-f-journal').options.length >= 2);
    ok('only symbols and the coverage were requested so far (no candles)', window.__ctCalls.every(function (c) { return c.action === 'symbols' || c.action === 'coverage'; }), JSON.stringify(window.__ctCalls.map(function (c) { return c.action; })));
    // symbol change re-matches the candidates
    setv('bt-f-symbol', 'XAUUSD');
    await waitFor(function () { return $('bt-f-ct-symbol').options.length === 2 && $('bt-f-ct-symbol').options[0].textContent === 'XAUUSD'; }, 10000, 'gold candidates');
    ok('XAU/USD: XAUUSD then GOLD', Array.prototype.map.call($('bt-f-ct-symbol').options, function (o) { return o.textContent; }).join() === 'XAUUSD,GOLD');
    setv('bt-f-symbol', 'EURUSD');
    await waitFor(function () { return $('bt-f-ct-symbol').options.length === 2 && $('bt-f-ct-symbol').options[0].textContent === 'EURUSD' && /2024/.test($('bt-f-ct-depth').textContent); }, 10000, 'eur candidates again');
    // back to synthetic and again to cTrader: the panel hides and the synthetic limits return
    check('bt-f-source-synthetic', true);
    await waitFor(function () { return !vis('bt-f-ct-wrap') && !vis('bt-f-journal-wrap'); }, 5000, 'back to synthetic');
    ok('synthetic again: panel and journal hidden', !vis('bt-f-ct-wrap') && !vis('bt-f-journal-wrap'));
    check('bt-f-source-ctrader', true);
    await waitFor(function () { return vis('bt-f-ct-wrap') && /2024/.test($('bt-f-ct-depth').textContent) && $('bt-f-ct-symbol').options.length > 0; }, 10000, 'ctrader again');
    setv('bt-f-ct-symbol', '2');                       // pick EURUSD.r (symbolId 2)
    await waitFor(function () { return /2024/.test($('bt-f-ct-depth').textContent); }, 5000, 'measured for EURUSD.r');
    setv('bt-f-name', 'Broker data'); setv('bt-f-commission', '0.00'); setv('bt-f-journal', J1);
    // start 3 days inside the depth
    var n0 = window.__ctCalls.length;
    $('bt-account-submit').click();
    await waitFor(function () { return db.tables.backtest_accounts.length === 1; }, 15000, 'account saved');
    var a = db.tables.backtest_accounts[0];
    ok('account row: ctrader source with broker account, broker name, symbol id and name', a.data_source === 'ctrader' && a.source_ctid_account === 4455667 && a.source_broker_name === 'Spotware' && a.source_symbol_id === 2 && a.source_symbol_name === 'EURUSD.r' && a.source_is_live === false && a.source_digits === 5, JSON.stringify(a).slice(0, 400));
    ok('page symbol is the app symbol (EURUSD) while the broker symbol is kept separately', a.symbol === 'EURUSD');
    ok('journal link set on creation (cTrader account)', a.journal_id === J1);
    ok('symbolInfo was asked before the account was created', window.__ctCalls.slice(n0).some(function (c) { return c.action === 'symbolInfo' && c.ctidAccount === 4455667 && c.symbolId === 2; }), JSON.stringify(window.__ctCalls.slice(n0)));
    await waitFor(function () { return $('bt-view-replay').getAttribute('data-replay') === 'ready'; }, 60000, 'replay ready');
    ok('replay loaded from the cTrader source', $('bt-view-replay').getAttribute('data-replay') === 'ready');
    var monthCalls = window.__ctCalls.filter(function (c) { return c.action === 'month'; });
    ok('candles are requested by backtest account id only (no broker account / symbol from the browser)', monthCalls.length > 0 && monthCalls.every(function (c) { return c.backtestAccountId === a.id && c.ctidAccount === undefined && c.symbolId === undefined && /^\d{4}-\d{2}$/.test(c.month); }), JSON.stringify(monthCalls[0]));
    ok('chart label: cTrader · broker name', vis('bt-source-label') && /^cTrader · Spotware/.test($('bt-source-label').textContent) && $('bt-source-label').getAttribute('data-source') === 'ctrader', $('bt-source-label').textContent);
    ok('chart label has no "not real market data" text', !/gerçek piyasa verisi değildir|not real market data|keine echten/.test($('bt-source-label').textContent));
    // browser cache
    await sleep(600);
    var recs = await idbCount();
    ok('complete months are cached in IndexedDB under the user id', recs && recs.some(function (r) { return r.u === 'u-' + role && r.n > 1000; }), recs && JSON.stringify(recs.map(function (r) { return [r.k, r.n]; })));
    ok('no candle of another user in the cache', recs && recs.every(function (r) { return r.u === 'u-' + role; }));
    // trade -> journal copy (bt-sync is ready for cTrader accounts)
    setv('bt-lot', '0.10'); $('bt-buy-btn').click(); await sleep(200);
    $('bt-step1m-btn').click(); await sleep(200);
    $('bt-open-body').querySelector('button[data-act="close"]').click(); await sleep(900);
    var closed = db.tables.backtest_account_trades[0];
    ok('closed trade saved', !!closed && !!closed.exit_time && closed.pnl != null);
    var mirrors = db.tables.trades.filter(function (t) { return t.platform_source === 'backtest'; });
    ok('the closed trade was copied into the linked journal', mirrors.length === 1 && mirrors[0].journal_id === J1, JSON.stringify(mirrors.map(function (t) { return [t.journal_id, t.symbol]; })));
    // settings: source locked, summary, journal editable
    $('bt-acc-settings-btn').click(); await waitFor(function () { return $('bt-account-modal').classList.contains('active'); }, 5000, 'settings');
    await sleep(200);
    ok('settings: source locked (both radios disabled), cTrader checked, note shown', $('bt-f-source-ctrader').checked && $('bt-f-source-ctrader').disabled && $('bt-f-source-synthetic').disabled && vis('bt-f-source-note'));
    ok('settings: read-only summary of the broker account and symbol, no picker', vis('bt-f-ct-summary') && /Spotware/.test($('bt-f-ct-summary').textContent) && /EURUSD\.r/.test($('bt-f-ct-summary').textContent) && /4455667/.test($('bt-f-ct-summary').textContent) && !vis('bt-f-ct-wrap'), $('bt-f-ct-summary').textContent);
    ok('settings: journal link visible and selected', vis('bt-f-journal-wrap') && $('bt-f-journal').value === J1);
    $('bt-account-cancel').click(); await sleep(200);
    // DB rules of Migration 09
    var up1 = await db.client.from('backtest_accounts').update({ source_symbol_name: 'GOLD' }).eq('id', a.id).eq('user_id', 'u-' + role).select('id');
    ok('DB: the broker symbol cannot be changed', !!up1.error && /IMMUTABLE:source/.test(up1.error.message), up1.error && up1.error.message);
    var up2 = await db.client.from('backtest_accounts').update({ data_source: 'synthetic' }).eq('id', a.id).eq('user_id', 'u-' + role).select('id');
    ok('DB: data_source cannot be changed', !!up2.error && /IMMUTABLE:data_source/.test(up2.error.message));
    var ins = await db.client.from('backtest_accounts').insert({ user_id: 'u-' + role, name: 'x', symbol: 'EURUSD', timeframe: '1h', starting_balance: '1000.00', spread_pips: '0.20', commission_per_lot: '0.00', replay_time: '2026-01-01T00:00:00Z',
      data_source: 'ctrader', source_ctid_account: 999999, source_symbol_id: 1, source_symbol_name: 'EURUSD' }).select('id');
    ok('DB: a broker account that is not connected by this user is refused', !!ins.error && /CTRADER_ACCOUNT_NOT_LINKED/.test(ins.error.message), ins.error && ins.error.message);

    // ---- connection lost. The browser cannot tell the difference between "token expired" and "disconnected": the server answers AUTH.
    async function newCtAccount(name, appSym) {
      $('bt-new-account-btn').click();
      await waitFor(function () { return $('bt-account-modal').classList.contains('active') && $('bt-f-start').value; }, 15000, 'modal ' + name);
      check('bt-f-source-ctrader', true);
      await waitFor(function () { return vis('bt-f-ct-wrap') && $('bt-f-ct-symbol').options.length > 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'measured ' + name);
      if (appSym) {
        setv('bt-f-symbol', appSym);
        await waitFor(function () { return $('bt-f-ct-symbol').options.length > 0 && $('bt-f-ct-symbol').options[0].textContent.indexOf('XAU') === 0 && /2024/.test($('bt-f-ct-depth').textContent); }, 15000, 'measured ' + appSym);
      }
      setv('bt-f-name', name); setv('bt-f-commission', '0.00');
    }
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list');
    var card = document.querySelector('.bt-account-card[data-id]');
    ok('card label: cTrader · broker name', !!card.querySelector('.bt-source[data-source="ctrader"]') && /^cTrader · Spotware/.test(card.querySelector('.bt-source').textContent), card.querySelector('.bt-source') && card.querySelector('.bt-source').textContent);
    ok('card shows the linked journal name', /Ana Hesap/.test(card.textContent));
    ok('no connection banner while everything works', !vis('bt-ctrader-needed'));

    // (1) the candles cannot be loaded while the replay opens: banner inside the replay with a reconnect button
    await newCtAccount('Lost in replay');
    window.__ctFail = true;
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'replay' && vis('bt-data-banner'); }, 25000, 'auth banner in replay');
    ok('replay: lost connection -> cTrader message + reconnect button (no raw error)', vis('bt-data-banner') && /cTrader/.test($('bt-data-banner-text').textContent) && !$('bt-data-banner-btn').hidden && /yenile|renew|erneuern/i.test($('bt-data-banner-btn').textContent) && !/AUTH|Error/.test($('bt-data-banner-text').textContent), $('bt-data-banner-text').textContent + ' / ' + $('bt-data-banner-btn').textContent);
    ok('replay: trading is blocked while the data is missing', $('bt-buy-btn').disabled && $('bt-sell-btn').disabled);
    // (2) the connection is gone already when the account is opened: back on the list with the explaining banner
    $('bt-back-btn').click(); await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list'; }, 5000, 'list 2');
    window.__ctFail = false;
    await newCtAccount('Lost on open', 'XAUUSD');      // another symbol: its coverage is not in the browser cache yet, so opening asks the server
    window.__ctFail = 'all';
    $('bt-account-submit').click();
    await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'list' && vis('bt-ctrader-needed'); }, 25000, 'list banner');
    ok('open: lost connection -> back on the list with the "cTrader connection required" banner', vis('bt-ctrader-needed') && /cTrader/.test($('bt-ctrader-needed').textContent) && $('bt-ctrader-needed').querySelector('a').getAttribute('href') === '/journals', $('bt-ctrader-needed').textContent);
    ok('the account itself was kept', db.tables.backtest_accounts.length === 3);
    ok('first account: trades and journal copies untouched', db.tables.backtest_account_trades.length === 1 && db.tables.trades.filter(function (t) { return t.platform_source === 'backtest'; }).length === 1);
    ok('no raw error text in a toast', !/AUTH|Error|undefined/.test(toasts()), toasts());
    window.__ctFail = false;
    document.querySelector('.bt-account-card[data-id="' + a.id + '"] button[data-act="open"]').click();
    await waitFor(function () { return $('bt-root').getAttribute('data-state') === 'replay'; }, 20000, 'open first again');
    ok('opening any account hides the banner; the working account still opens', !vis('bt-ctrader-needed') && $('bt-root').getAttribute('data-state') === 'replay');
  } catch (e) { out.push('EXCEPTION ' + (e && e.stack || e)); }
  finally { if (out.some(function (l) { return /^(FAIL|TIMEOUT|EXCEPTION|JSERROR)/.test(l); })) out.push('WARNS ' + JSON.stringify(window.__warns).slice(0, 1500), 'TOASTS ' + toasts(), 'SYNC ' + window.__syncLog.join(' || '), 'STATE ' + $('bt-root').getAttribute('data-state') + ' bannerHidden=' + $('bt-ctrader-needed').hidden + ' ctTail=' + JSON.stringify(window.__ctCalls.slice(-3)), 'CTCALLS ' + JSON.stringify(window.__ctCalls).slice(0, 400)); $('bt-smoke-result').textContent = out.join('\n') + '\nDONE'; }
})();
