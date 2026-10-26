// Backtest v2: "Plan and usage" tab of the settings window (window.WwBtPlan). Every number comes from the database in one call
// (get_backtest_plan_usage, migration 202610260001): active accounts and their quota, this month's cTrader-data trades
// (backtest_trade_usage, UTC month) and the limit from system_settings. The page never estimates them. Pure helpers are unit tested;
// render() needs the DOM.
(function (global) {
  'use strict';

  var WARN_AT = 0.8;                                  // bar turns orange from 80 % of the limit, red at the limit
  var DRAW_TOOLS = 9, DRAW_FREE = 3;                  // = WwBtDraw.TOOLS / FREE_TOOLS (unit tested)
  var FEATURES = [
    { id: 'drawing_tools', feat: 'backtestDrawings', icon: 'pen-tool' },
    { id: 'saved_drawings', feat: 'backtestDrawings', icon: 'save' },
    { id: 'themes', feat: 'backtestThemes', icon: 'palette' },
    { id: 'stats', feat: 'backtestStats', icon: 'bar-chart-3' },
    { id: 'multi', feat: 'backtestMultiChart', icon: 'layout-grid' }
  ];

  function int(v) { var n = Number(v); return isFinite(n) && n >= 0 && Math.floor(n) === n ? n : null; }
  function isoMs(v) { if (typeof v !== 'string') return null; var t = Date.parse(v); return isFinite(t) ? t : null; }

  // The RPC answer, checked; null when anything needed is missing (the tab then says it could not load, it never guesses).
  function normalize(d) {
    if (!d || typeof d !== 'object' || !d.accounts || !d.trades) return null;
    var out = {
      premium: d.premium === true,
      expiresMs: isoMs(d.plan_expires_at),
      accounts: { used: int(d.accounts.used), limit: int(d.accounts.limit) },
      trades: { used: int(d.trades.used), limit: int(d.trades.limit), month: typeof d.trades.month === 'string' ? d.trades.month : '', resetsMs: isoMs(d.trades.resets_at) }
    };
    if (out.accounts.used === null || out.accounts.limit === null || out.trades.used === null || out.trades.limit === null) return null;
    return out;
  }
  // 'ok' | 'warn' (from 80 %) | 'full' (at or over the limit)
  function level(used, limit) {
    if (limit <= 0 || used >= limit) return 'full';
    return used / limit >= WARN_AT ? 'warn' : 'ok';
  }
  function pct(used, limit) { return limit > 0 ? Math.max(0, Math.min(100, used / limit * 100)) : 100; }
  // header badge: free plan, monthly cTrader trades from 80 % (the account quota of 1 is not a warning on its own)
  function badge(p) {
    if (!p || p.premium) return null;
    var lv = level(p.trades.used, p.trades.limit);
    return lv === 'ok' ? null : { level: lv, used: p.trades.used, limit: p.trades.limit };
  }
  // feature rows: { id, on, value } (value: tools available / all tools for the drawing tools)
  function features(feat) {
    feat = feat || {};
    return FEATURES.map(function (f) {
      var on = feat[f.feat] === true;
      return { id: f.id, icon: f.icon, on: on, value: f.id === 'drawing_tools' ? (on ? DRAW_TOOLS : DRAW_FREE) + ' / ' + DRAW_TOOLS : null };
    });
  }

  // ---------------------------------------------------------------- DOM
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function icon(name) { var i = el('i'); i.setAttribute('data-lucide', name); i.setAttribute('aria-hidden', 'true'); return i; }

  // opts: { data (normalize()), error, loading, feat, t, fmtDate(ms) (date in the user's time zone), fmtDateTime(ms), upgrade(), retry() }
  function render(box, opts) {
    var t = opts.t, p = opts.data;
    box.textContent = '';
    box.setAttribute('aria-busy', opts.loading ? 'true' : 'false');
    if (!p) {
      if (opts.loading) { box.appendChild(el('p', 'bt-hint', t('backtest.plan.loading', 'Yükleniyor…'))); return; }
      var err = el('div', 'bt-banner bt-banner-error'); err.setAttribute('role', 'alert');
      err.appendChild(el('span', '', t('backtest.plan.load_error', 'Kullanım bilgisi alınamadı.')));
      var rb = el('button', 'btn btn-ghost', t('backtest.retry', 'Tekrar dene')); rb.type = 'button';
      rb.addEventListener('click', function () { opts.retry(); });
      err.appendChild(rb); box.appendChild(err);
      return;
    }

    // 1. plan
    var head = el('section', 'bt-plan-card bt-plan-head');
    var who = el('div', 'bt-plan-who');
    who.appendChild(el('span', 'bt-plan-k', t('backtest.plan.current', 'Mevcut plan')));
    var name = el('strong', 'bt-plan-name', p.premium ? t('backtest.plan.premium', 'Premium') : t('backtest.plan.free', 'Ücretsiz'));
    name.setAttribute('data-plan', p.premium ? 'premium' : 'free');
    who.appendChild(name);
    if (p.premium) who.appendChild(el('span', 'bt-plan-sub bt-num', p.expiresMs ? t('backtest.plan.ends', 'Bitiş: {date}', { date: opts.fmtDate(p.expiresMs) }) : t('backtest.plan.no_end', 'Süresiz')));
    else if (p.expiresMs && p.expiresMs < Date.now()) who.appendChild(el('span', 'bt-plan-sub bt-num', t('backtest.plan.expired', 'Premium {date} tarihinde sona erdi.', { date: opts.fmtDate(p.expiresMs) })));
    head.appendChild(who);
    if (!p.premium) {
      var up = el('button', 'btn btn-primary bt-plan-upgrade'); up.type = 'button';
      up.appendChild(icon('sparkles')); up.appendChild(el('span', '', t('backtest.plan.upgrade', 'Premium\'a yükselt')));
      up.addEventListener('click', function () { opts.upgrade(); });
      head.appendChild(up);
    }
    box.appendChild(head);

    // 2. usage
    var us = el('section', 'bt-plan-sec'); us.setAttribute('aria-labelledby', 'bt-plan-usage-h');
    var uh = el('h4', 'bt-plan-h', t('backtest.plan.usage', 'Kullanım')); uh.id = 'bt-plan-usage-h'; us.appendChild(uh);
    var note = el('p', 'bt-plan-note'); note.appendChild(icon('info')); note.appendChild(el('span', '', t('backtest.plan.note', 'Bu limitler tüm backtest hesapların için geçerlidir.')));
    us.appendChild(note);
    var grid = el('div', 'bt-plan-grid');
    grid.appendChild(meter('accounts', t('backtest.plan.accounts', 'Backtest hesapları'), p.accounts.used, p.accounts.limit, null, t));
    if (p.premium) grid.appendChild(unlimited('ct_trades', t('backtest.plan.ct_trades', 'Bu ay cTrader verisiyle açılan işlemler'),
      t('backtest.plan.month_count', 'Bu ay {n} işlem', { n: p.trades.used }), t));
    else {
      var extra = [];
      if (p.trades.resetsMs) extra.push(el('p', 'bt-plan-sub bt-num', t('backtest.plan.resets', 'Sıfırlanma: {date}', { date: opts.fmtDateTime(p.trades.resetsMs) })));
      extra.push(el('p', 'bt-plan-sub bt-plan-utc', t('backtest.plan.utc_note', 'Sayaç UTC\'ye göre çalışır: her ayın 1\'i 00:00 UTC\'de sıfırlanır.')));
      grid.appendChild(meter('ct_trades', t('backtest.plan.ct_trades', 'Bu ay cTrader verisiyle açılan işlemler'), p.trades.used, p.trades.limit, extra, t));
    }
    grid.appendChild(unlimited('syn_trades', t('backtest.plan.syn_trades', 'Sentetik veriyle işlem'), t('backtest.plan.syn_hint', 'Sentetik veriyle açılan işlemler sayılmaz.'), t));
    us.appendChild(grid);
    box.appendChild(us);

    // 3. features
    var fs = el('section', 'bt-plan-sec'); fs.setAttribute('aria-labelledby', 'bt-plan-feat-h');
    var fh = el('h4', 'bt-plan-h', t('backtest.plan.features', 'Özellikler')); fh.id = 'bt-plan-feat-h'; fs.appendChild(fh);
    var ul = el('ul', 'bt-plan-feats');
    features(opts.feat).forEach(function (f) {
      var li = el('li', 'bt-plan-feat'); li.setAttribute('data-feature', f.id); li.setAttribute('data-on', f.on ? 'true' : 'false');
      li.appendChild(icon(f.icon));
      li.appendChild(el('span', 'bt-plan-feat-name', t('backtest.plan.feat_' + f.id, f.id)));
      if (f.value) li.appendChild(el('span', 'bt-plan-feat-val bt-num', f.value));
      var st = el('span', 'bt-plan-feat-state');
      if (f.on) { st.appendChild(icon('check')); st.appendChild(el('span', '', t('backtest.plan.on', 'Açık'))); }
      else {
        st.appendChild(icon('lock'));
        var tag = el('span', 'bt-pro', 'PRO'); tag.setAttribute('aria-hidden', 'true'); st.appendChild(tag);
        st.appendChild(el('span', 'bt-sr', t('backtest.plan.locked', 'Premium\'da')));
      }
      li.appendChild(st);
      ul.appendChild(li);
    });
    fs.appendChild(ul);
    box.appendChild(fs);
  }
  function card(id, label) {
    var c = el('article', 'bt-plan-card bt-plan-meter'); c.setAttribute('data-usage', id);
    var top = el('div', 'bt-plan-meter-top');
    var lab = el('span', 'bt-plan-meter-label', label); lab.id = 'bt-plan-l-' + id;
    top.appendChild(lab);
    c.appendChild(top);
    return { c: c, top: top, labelId: lab.id };
  }
  function meter(id, label, used, limit, extra, t) {
    var k = card(id, label), lv = level(used, limit);
    k.c.setAttribute('data-level', lv);
    k.top.appendChild(el('span', 'bt-plan-meter-val bt-num', used + ' / ' + limit));
    var bar = el('div', 'bt-plan-bar');
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-labelledby', k.labelId);
    bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(limit)); bar.setAttribute('aria-valuenow', String(Math.min(used, limit)));
    bar.setAttribute('aria-valuetext', used + ' / ' + limit);
    var fill = el('span'); fill.style.width = pct(used, limit) + '%'; bar.appendChild(fill);
    k.c.appendChild(bar);
    if (lv !== 'ok') {
      var s = el('p', 'bt-plan-status'); s.appendChild(icon(lv === 'full' ? 'octagon-alert' : 'triangle-alert'));
      s.appendChild(el('span', '', lv === 'full' ? t('backtest.plan.reached', 'Sınıra ulaştın') : t('backtest.plan.near', 'Sınıra yaklaşıyorsun')));
      k.c.appendChild(s);
    }
    (extra || []).forEach(function (e) { k.c.appendChild(e); });
    return k.c;
  }
  function unlimited(id, label, sub, t) {
    var k = card(id, label);
    k.c.setAttribute('data-level', 'unlimited');
    k.top.appendChild(el('span', 'bt-plan-meter-val', t('backtest.plan.unlimited', 'Sınırsız')));
    k.c.appendChild(el('p', 'bt-plan-sub bt-num', sub));
    return k.c;
  }

  global.WwBtPlan = { WARN_AT: WARN_AT, DRAW_TOOLS: DRAW_TOOLS, DRAW_FREE: DRAW_FREE, FEATURES: FEATURES,
    normalize: normalize, level: level, pct: pct, badge: badge, features: features, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
