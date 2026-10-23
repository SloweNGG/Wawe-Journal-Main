// ============================================================
// WAWE JOURNAL - İŞLEM KAYNAĞI KAPSAMI (canlı / backtest / tümü)
// File: public/interface/shared/trades-source.js  ->  window.WwTrades
// ============================================================
// Backtest hesaplarından deftere aktarılan işlemler public.trades içinde
// platform_source = 'backtest' ile durur. Canlı istatistikler (dashboard,
// pro, takvim, stratejiler, prop, overtrade, PDF/CSV, sayaçlar) bu
// satırları HİÇBİR ZAMAN içermez. Tüm okuyucular sorgularını buradan kurar.
//
// KURAL (SQL karşılığı): platform_source IS DISTINCT FROM 'backtest'
//   .neq('platform_source','backtest') KULLANMA: NULL (manuel/CSV) satırları da düşürür.
//
// ÖNBELLEK SÖZLEŞMESİ (public/cache.js): 'trades' ve 'trades_<sayfa>' anahtarları
// yalnızca CANLI satır taşır. Karışık/backtest listeler cacheKey() ile
// 'trades@all' / 'trades@backtest' anahtarlarına yazılır; bunlar çapraz beslenmez.
//
// DEFTER BAZLI KAPSAM (journals.trade_scope: 'live' | 'backtest' | 'all', varsayılan 'live'):
//   journalScope(jid) senkron okur (localStorage 'ww_journal_scopes', list_journals her çağrıldığında journal.js
//   tarafından yenilenir). dashboard, analytics, takvim, stratejiler, PDF/CSV ve Trades varsayılan
//   filtresi bu kapsamla çalışır. Prop firm, cTrader senkronu, overtrade/bildirimler ve ana sayfa istatistikleri
//   HER ZAMAN 'live' kalır (bu yardımcıları KULLANMAZ). Kapsamlı önbellek anahtarı: cacheKey(base, scope).
//
// Yükleme: BaseHead.astro (senkron, trade-metrics.js'ten hemen sonra) VE
// public/src/script.js (bundle.js) içinde yan etki importu. İlk yükleyen kazanır.
// Node testleri: vm.runInNewContext(...) veya ESM import (globalThis.WwTrades).
// ============================================================
(function (global) {
  'use strict';
  if (global.WwTrades) return;

  var BACKTEST = 'backtest';
  var LIVE_OR = 'platform_source.is.null,platform_source.neq.' + BACKTEST;
  var SCOPES = ['live', 'backtest', 'all'];
  var PAGE_SIZE = 1000;

  function normScope(scope) {
    return SCOPES.indexOf(scope) >= 0 ? scope : 'live';
  }

  // NULL / '' / 'ctrader' = canlı. Yalnızca tam 'backtest' backtest sayılır.
  function isBacktest(t) {
    return !!t && t.platform_source === BACKTEST;
  }

  function inScope(t, scope) {
    if (!t) return false;
    scope = normScope(scope);
    if (scope === 'all') return true;
    return scope === 'backtest' ? isBacktest(t) : !isBacktest(t);
  }

  // Savunma katmanı: önbellekten/çağırandan gelen listeyi kapsama göre süzer (yeni dizi döner).
  function filterScope(list, scope) {
    if (!Array.isArray(list)) return [];
    scope = normScope(scope);
    if (scope === 'all') return list.slice();
    return list.filter(function (t) { return inScope(t, scope); });
  }

  // PostgREST sorgusuna kapsam filtresi ekler (sorguyu döndürür).
  function applyScope(query, scope) {
    scope = normScope(scope);
    if (scope === 'live') return query.or(LIVE_OR);
    if (scope === 'backtest') return query.eq('platform_source', BACKTEST);
    return query;
  }

  // Seçilen kolonlara platform_source ekler; listeler kendini tanımlasın.
  function withSourceCol(columns) {
    var cols = String(columns == null ? '*' : columns);
    var parts = cols.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
    if (!parts.length) return '*';
    if (parts.indexOf('*') >= 0 || parts.indexOf('platform_source') >= 0) return parts.join(',');
    parts.push('platform_source');
    return parts.join(',');
  }

  // 'trades' + 'live' -> 'trades'; 'trades' + 'all' -> 'trades@all' (çapraz beslenmeyen anahtar)
  function cacheKey(base, scope) {
    scope = normScope(scope);
    return scope === 'live' ? base : base + '@' + scope;
  }

  // ---- Defter bazlı kapsam ----
  var JSCOPE_KEY = 'ww_journal_scopes';
  function readScopeMap() {
    try {
      var m = JSON.parse(global.localStorage.getItem(JSCOPE_KEY) || '{}');
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
    } catch (e) { return {}; }
  }
  function writeScopeMap(m) {
    try { global.localStorage.setItem(JSCOPE_KEY, JSON.stringify(m)); } catch (e) {}
  }
  // Senkron: defterin kapsamı; bilinmiyorsa ya da defter yoksa 'live' (mevcut davranış).
  function journalScope(journalId) {
    if (!journalId) return 'live';
    return normScope(readScopeMap()[journalId]);
  }
  // list_journals sonucundan tüm haritayı yeniler (silinen defterler de düşer).
  function rememberJournalScopes(list) {
    if (!Array.isArray(list)) return;
    var m = {};
    list.forEach(function (j) { if (j && j.id) m[j.id] = normScope(j.trade_scope); });
    writeScopeMap(m);
  }
  // Asenkron: haritada defter yoksa (taze tarayıcı, yeni defter) list_journals bir kez çağrılır ve harita dolar.
  // Listeleme başarısız olursa 'live' (mevcut davranış). Haritada varsa ağa gidilmez.
  function resolveJournalScope(journalId) {
    if (!journalId) return Promise.resolve('live');
    if (Object.prototype.hasOwnProperty.call(readScopeMap(), journalId)) return Promise.resolve(journalScope(journalId));
    var j = global.journal;
    if (j && typeof j.listJournals === 'function') {
      return Promise.resolve().then(function () { return j.listJournals(); }).then(
        function () { return journalScope(journalId); },
        function () { return 'live'; });
    }
    return Promise.resolve('live');
  }
  function setJournalScope(journalId, scope) {
    if (!journalId) return;
    var m = readScopeMap();
    m[journalId] = normScope(scope);
    writeScopeMap(m);
  }
  // Başlık rozeti: 'live' iken gizli; 'all' -> "Backtest dahil", 'backtest' -> "Sadece backtest" (i18n anahtarı data-i18n ile dil değişince yenilenir)
  var BADGE = { all: ['scope.badge_all', 'Backtest dahil'], backtest: ['scope.badge_backtest', 'Sadece backtest'] };
  function applyScopeBadge(el, scope) {
    if (!el) return;
    scope = normScope(scope);
    var b = BADGE[scope];
    if (!b) { el.hidden = true; el.removeAttribute('data-i18n'); el.textContent = ''; return; }
    var t = global.i18n && typeof global.i18n.t === 'function' ? global.i18n.t(b[0]) : null;
    el.setAttribute('data-i18n', b[0]);
    el.textContent = (t && t !== b[0]) ? t : b[1];
    el.hidden = false;
  }

  function getClient(opts) {
    return (opts && opts.client) || global.sb || null;
  }

  function baseQuery(c, opts, cols) {
    var q = c.from('trades').select(cols);
    if (opts.userId) q = q.eq('user_id', opts.userId);
    if (opts.unassigned) q = q.is('journal_id', null);
    else if (opts.journalId) q = q.eq('journal_id', opts.journalId);
    if (opts.since) q = q.gte('trade_date', opts.since);
    return applyScope(q, opts.scope);
  }

  function fetchPages(c, opts, cols) {
    var size = opts.pageSize || PAGE_SIZE;
    var out = [];
    function page(from) {
      return baseQuery(c, opts, cols)
        .order('trade_date', { ascending: !!opts.ascending })
        .order('id', { ascending: true })
        .range(from, from + size - 1)
        .then(function (res) {
          if (res && res.error) return { data: out, error: res.error };
          var rows = (res && res.data) || [];
          out = out.concat(rows);
          if (rows.length < size) return { data: out, error: null };
          return page(from + size);
        });
    }
    return page(0);
  }

  // HEAD count (satır indirmez). sinceColumn varsayılanı created_at.
  function count(opts) {
    opts = opts || {};
    var c = getClient(opts);
    if (!c) return Promise.resolve({ count: 0, error: { message: 'SUPABASE_NOT_READY' } });
    var q = c.from('trades').select('id', { count: 'exact', head: true });
    if (opts.userId) q = q.eq('user_id', opts.userId);
    if (opts.journalId) q = q.eq('journal_id', opts.journalId);
    if (opts.since) q = q.gte(opts.sinceColumn || 'created_at', opts.since);
    return applyScope(q, opts.scope).then(function (res) {
      return { count: (res && res.count) || 0, error: (res && res.error) || null };
    });
  }

  // Sayfalı tam liste. Varsayılan kapsam 'live' (çağıran unutamaz).
  // opts: { columns, userId, journalId, scope, ascending, since, pageSize, unassignedFallback, client }
  // Döner: { data, error }  (hata olursa o ana kadar gelen satırlar + error)
  function fetchAll(opts) {
    opts = Object.assign({ scope: 'live', ascending: false }, opts || {});
    opts.scope = normScope(opts.scope);
    var c = getClient(opts);
    if (!c) return Promise.resolve({ data: [], error: { message: 'SUPABASE_NOT_READY' } });
    var cols = withSourceCol(opts.columns);
    return fetchPages(c, opts, cols).then(function (res) {
      if (res.error || res.data.length || !opts.unassignedFallback || !opts.journalId) return res;
      // Eski davranış: defter boşsa deftersiz (journal_id IS NULL) satırlar. Yalnızca defterde
      // HİÇBİR kapsamda satır yoksa (yalnızca backtest satırı olan defter boş sayılmaz).
      var gate = opts.scope === 'all'
        ? Promise.resolve({ count: 0, error: null })
        : count({ client: c, userId: opts.userId, journalId: opts.journalId, scope: 'all' });
      return gate.then(function (cnt) {
        if (cnt.error || cnt.count > 0) return res;
        var un = Object.assign({}, opts, { unassigned: true, journalId: null });
        return fetchPages(c, un, cols).then(function (u) { return u.error ? res : u; });
      });
    });
  }

  global.WwTrades = {
    BACKTEST: BACKTEST,
    LIVE_OR: LIVE_OR,
    SCOPES: SCOPES.slice(),
    normScope: normScope,
    isBacktest: isBacktest,
    inScope: inScope,
    filterScope: filterScope,
    applyScope: applyScope,
    withSourceCol: withSourceCol,
    cacheKey: cacheKey,
    fetchAll: fetchAll,
    count: count,
    journalScope: journalScope,
    resolveJournalScope: resolveJournalScope,
    rememberJournalScopes: rememberJournalScopes,
    setJournalScope: setJournalScope,
    applyScopeBadge: applyScopeBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);
