// ============================================================
// WAWE JOURNAL - BACKTEST -> DEFTER SENKRONU (Stage 5)
// File: public/interface/backtest/js/bt-sync.js  ->  window.WwBtSync
// ============================================================
// Bağlı bir backtest hesabının KAPANMIŞ işlemleri public.trades'e kopyalanır:
//   platform_source = 'backtest', import_hash = 'backtest:<accountId>:<tradeId>',
//   trade_date = giriş zamanı, exit_date = çıkış zamanı (replay piyasa zamanı, R16).
// Para bir kez motor tarafından hesaplanır; burada yalnızca birebir kopyalanır
// (ondalık metin, BigInt; toFixed / Math.round YOK).
// Yazım: upsert onConflict 'user_id,journal_id,import_hash' + ignoreDuplicates (cTrader deseni).
// Temizlik (bağlantı değişimi / kaldırma / hesap silme) veritabanında: Migration 04 tetikleyicileri.
// Bağımlılıklar: WwBtSymbols (bt-symbols.js), WwTrades (trades-source.js), wwCache (cache.js), window.sb.
// Node testleri: vm.runInNewContext(...)
// ============================================================
(function (global) {
  'use strict';

  var PREFIX = 'backtest:';
  var SOURCE = 'backtest';
  var ON_CONFLICT = 'user_id,journal_id,import_hash';
  var UPSERT_CHUNK = 200;
  var DELETE_CHUNK = 100;   // id listesi URL'de gider (?id=in.(...)); 100 uuid ≈ 3.8 KB
  var PAGE = 1000;
  var DIRTY_KEY = 'ww_bt_sync_dirty';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var cfg = { retryDelays: [500, 1500, 4000], notifyDebounceMs: 250 };

  var MIRROR_COLS = 'id,journal_id,import_hash,platform_source,status,is_quick_entry,position_id,' +
    'symbol,direction,instrument,multiplier,lot,entry_price,exit_price,stop_loss,take_profit,' +
    'rr_ratio,pnl,gross_pnl,commission,swap,trade_date,exit_date';

  // Motorun sahip olduğu kolonlar (onarımda yazılır). notes / strategy_id kullanıcınındır, ASLA yazılmaz.
  var ENGINE_COLS = ['platform_source', 'status', 'is_quick_entry', 'position_id', 'symbol', 'direction',
    'instrument', 'multiplier', 'lot', 'entry_price', 'exit_price', 'stop_loss', 'take_profit',
    'rr_ratio', 'pnl', 'gross_pnl', 'commission', 'swap', 'trade_date', 'exit_date'];
  var NUM_COLS = { multiplier: 1, lot: 1, entry_price: 1, exit_price: 1, stop_loss: 1, take_profit: 1,
    rr_ratio: 1, pnl: 1, gross_pnl: 1, commission: 1, swap: 1 };
  var TIME_COLS = { trade_date: 1, exit_date: 1 };

  function syncError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  // ============================================================
  // 1) KESİN ONDALIK (BigInt) — Postgres numeric / ROUND(x, s) ile aynı
  // ============================================================
  var B0 = BigInt(0), B1 = BigInt(1), B2 = BigInt(2), B10 = BigInt(10), B100 = BigInt(100);
  var POW = [B1];
  function pow10(k) {
    while (POW.length <= k) POW.push(POW[POW.length - 1] * B10);
    return POW[k];
  }

  // JS sayısı -> Postgres'in alacağı metin (JSON en kısa gidiş-dönüş gösterimi; üs açılır)
  function plain(x) {
    if (typeof x === 'bigint') return x.toString();
    if (typeof x === 'string') return x.trim();
    if (typeof x !== 'number' || !isFinite(x)) throw syncError('NOT_DECIMAL', 'not a finite decimal: ' + x);
    var s = String(x);
    if (!/e/i.test(s)) return s;
    var parts = s.toLowerCase().split('e');
    var exp = +parts[1], neg = parts[0].charAt(0) === '-';
    var ip = parts[0].replace('-', '').split('.');
    var digits = ip[0] + (ip[1] || ''), point = ip[0].length + exp;
    if (point <= 0) { digits = new Array(1 - point + 1).join('0') + digits; point = 1; }
    if (point >= digits.length) { digits += new Array(point - digits.length + 1).join('0'); point = digits.length; }
    var out = (digits.slice(0, point) + (point < digits.length ? '.' + digits.slice(point) : '')).replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + out;
  }

  // -> { n: BigInt, s: ölçek }  değer = n / 10^s
  function dec(x) {
    var m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(plain(x));
    if (!m) throw syncError('NOT_DECIMAL', 'not a decimal: ' + x);
    var frac = m[3] || '';
    var n = BigInt(m[2] + frac);
    return { n: m[1] === '-' ? -n : n, s: frac.length };
  }

  function strip(d) {   // sondaki sıfırları at
    var n = d.n, s = d.s;
    while (s > 0 && n % B10 === B0) { n = n / B10; s--; }
    return { n: n, s: s };
  }

  function decStr(d) {
    var neg = d.n < B0, a = neg ? -d.n : d.n;
    var str = a.toString();
    if (d.s > 0) {
      while (str.length <= d.s) str = '0' + str;
      str = str.slice(0, str.length - d.s) + '.' + str.slice(str.length - d.s);
    }
    return (neg && a !== B0 ? '-' : '') + str;
  }

  function canon(x) { return decStr(strip(dec(x))); }          // "1.10000" -> "1.1", "-0" -> "0"
  function scaleOf(x) { return strip(dec(x)).s; }

  function cmp(a, b) {
    var x = dec(a), y = dec(b), s = Math.max(x.s, y.s);
    var p = x.n * pow10(s - x.s), q = y.n * pow10(s - y.s);
    return p < q ? -1 : (p > q ? 1 : 0);
  }

  // ROUND(num / den, s), eşitlikte sıfırdan uzağa (Postgres numeric). den > 0. Birim: 10^-s
  function roundDiv(num, den, s) {
    if (den <= B0) throw syncError('DIV_ZERO');
    var neg = num < B0;
    var a = (neg ? -num : num) * pow10(s);
    var q = a / den;
    if ((a % den) * B2 >= den) q += B1;
    return neg ? -q : q;
  }

  function centsStr(c) {
    var neg = c < B0, a = neg ? -c : c;
    var cents = (a % B100).toString();
    if (cents.length < 2) cents = '0' + cents;
    return (neg && a !== B0 ? '-' : '') + (a / B100).toString() + '.' + cents;
  }

  // Postgres ROUND(x, 2) metni (ör. 1.005 -> "1.01", -0.0049 -> "0.00")
  function round2(x) {
    var d = dec(x);
    return centsStr(roundDiv(d.n, pow10(d.s), 2));
  }

  // Saklanan para zaten kuruş olmalı: 2'den fazla anlamlı ondalık -> hata (yuvarlama YAPILMAZ)
  function toCents(x) {
    var d = strip(dec(x));
    if (d.s <= 2) return d.n * pow10(2 - d.s);
    throw syncError('MONEY_SCALE', 'more than 2 decimals: ' + x);
  }

  // calc_trade_pnl ile birebir: ROUND(|tp - entry| / |entry - sl|, 2); hesaplanamazsa null
  function rrRatio(entry, sl, tp) {
    if (entry == null || sl == null || tp == null) return null;
    var E = dec(entry), S = dec(sl), T = dec(tp);
    var s = Math.max(E.s, S.s, T.s);
    var e = E.n * pow10(s - E.s), st = S.n * pow10(s - S.s), t = T.n * pow10(s - T.s);
    var risk = e > st ? e - st : st - e;
    var reward = t > e ? t - e : e - t;
    if (risk === B0) return null;   // tetikleyici gönderileni korur -> null gönder
    return centsStr(roundDiv(reward, risk, 2));
  }

  function numEq(a, b) {
    if (a == null || b == null) return a == null && b == null;
    try { return cmp(a, b) === 0; } catch (e) { return false; }
  }

  function timeEq(a, b) {
    if (a == null || b == null) return a == null && b == null;
    var x = Date.parse(a), y = Date.parse(b);
    return isFinite(x) && x === y;
  }

  // ============================================================
  // 2) KİMLİK (import_hash)
  // ============================================================
  function hashPrefix(accountId) { return PREFIX + String(accountId) + ':'; }
  function importHash(accountId, tradeId) { return hashPrefix(accountId) + String(tradeId); }
  function parseHash(hash) {
    if (typeof hash !== 'string' || hash.indexOf(PREFIX) !== 0) return null;
    var rest = hash.slice(PREFIX.length), i = rest.indexOf(':');
    if (i <= 0) return null;
    var accountId = rest.slice(0, i), tradeId = rest.slice(i + 1);
    if (!UUID_RE.test(accountId) || !tradeId || tradeId.indexOf(':') >= 0) return null;
    return { accountId: accountId, tradeId: tradeId };
  }

  // ============================================================
  // 3) SAF EŞLEME: backtest_account_trades satırı -> trades satırı
  // ============================================================
  function isClosed(t) {
    return !!t && t.exit_time != null && t.exit_price != null && t.pnl != null;
  }

  function isoTime(v, field) {
    var ms = (v instanceof Date) ? v.getTime() : (typeof v === 'number' ? v : Date.parse(v));
    if (v == null || !isFinite(ms)) throw syncError('TIME_INVALID', field + ': ' + v);
    return new Date(ms).toISOString();
  }

  function decimalsOf(step) { var s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }

  function priceStr(v, digits, field) {
    var c = canon(v);
    if (cmp(c, '0') <= 0) throw syncError('PRICE_INVALID', field + ': ' + v);
    if (scaleOf(c) > digits) throw syncError('PRICE_SCALE', field + ' has more than ' + digits + ' decimals: ' + v);
    return c;
  }

  function mapTrade(account, trade, opts) {
    opts = opts || {};
    if (!account || !account.id || !account.user_id) throw syncError('ACCOUNT_INVALID');
    if (!account.journal_id) throw syncError('ACCOUNT_NOT_LINKED');
    if (!trade || trade.id == null || trade.id === '') throw syncError('TRADE_INVALID');
    if (trade.backtest_account_id != null && String(trade.backtest_account_id) !== String(account.id)) {
      throw syncError('TRADE_ACCOUNT_MISMATCH');
    }
    if (!isClosed(trade)) throw syncError('TRADE_NOT_CLOSED');

    var symbol = String(trade.symbol || '').toUpperCase();
    if (account.symbol && String(account.symbol).toUpperCase() !== symbol) throw syncError('SYMBOL_MISMATCH');
    var sym = opts.symbolInfo || (global.WwBtSymbols && global.WwBtSymbols.get(symbol));
    if (!sym) throw syncError('UNKNOWN_SYMBOL', symbol);
    var direction = (trade.direction === 'LONG' || trade.direction === 'SHORT') ? trade.direction : null;
    if (!direction) throw syncError('DIRECTION_INVALID', String(trade.direction));

    var digits = sym.digits;
    var lotDigits = sym.lotDigits != null ? sym.lotDigits : decimalsOf(sym.lot && sym.lot.step);
    var entry = priceStr(trade.entry_price, digits, 'entry_price');
    var exit = priceStr(trade.exit_price, digits, 'exit_price');
    // D13: the journal row carries the levels AT OPEN (initial_*), not the edited ones, so its rr_ratio is the one
    // the backtest account computed at entry. Rows without the columns (before Migration 02 v13) fall back to the current levels.
    var slRaw = ('initial_stop_loss' in trade) ? trade.initial_stop_loss : trade.stop_loss;
    var tpRaw = ('initial_take_profit' in trade) ? trade.initial_take_profit : trade.take_profit;
    var sl = slRaw == null ? null : priceStr(slRaw, digits, 'stop_loss');
    var tp = tpRaw == null ? null : priceStr(tpRaw, digits, 'take_profit');
    var lot = canon(trade.lot);
    if (cmp(lot, '0') <= 0 || scaleOf(lot) > lotDigits) throw syncError('LOT_INVALID', String(trade.lot));

    var pnlC = toCents(trade.pnl);
    var comC = toCents(trade.commission == null ? '0' : trade.commission);
    if (comC < B0) throw syncError('COMMISSION_NEGATIVE');
    var grossC = trade.gross_pnl == null ? pnlC + comC : toCents(trade.gross_pnl);
    if (grossC - comC !== pnlC) throw syncError('MONEY_IDENTITY', 'pnl != gross_pnl - commission');

    var entryIso = isoTime(trade.entry_time, 'entry_time');
    var exitIso = isoTime(trade.exit_time, 'exit_time');
    if (Date.parse(exitIso) < Date.parse(entryIso)) throw syncError('TIME_ORDER');

    // Anahtar sırası sabit: JSON çıktısı bayt bayt aynı kalsın (idempotency testi)
    return {
      user_id: account.user_id,
      journal_id: account.journal_id,              // HER ZAMAN açık (trg_trades_default_journal devreye girmesin)
      platform_source: SOURCE,
      import_hash: importHash(account.id, trade.id),
      position_id: null,                           // trades_platform_unique / idx_trades_journal_position çakışmasın
      status: 'closed',
      is_quick_entry: false,
      symbol: symbol,
      direction: direction,
      instrument: sym.instrument,
      multiplier: canon(sym.contractSize),
      lot: lot,
      entry_price: entry,
      exit_price: exit,
      stop_loss: sl,
      take_profit: tp,
      rr_ratio: rrRatio(entry, sl, tp),            // tetikleyicinin formülü -> trg_calc_pnl no-op
      pnl: centsStr(pnlC),                         // NET (null değil -> tetikleyici dal 1, pnl'e dokunmaz)
      gross_pnl: centsStr(grossC),
      commission: centsStr(comC),                  // pozitif maliyet
      swap: '0.00',
      trade_date: entryIso,                        // R16: giriş zamanı (replay piyasa zamanı)
      exit_date: exitIso                           // R16: çıkış zamanı
    };
  }

  // Motor kolonları aynı mı? (sayılar kesin ondalık, zamanlar ms karşılaştırılır)
  function rowsEqual(expected, existing) {
    if (!expected || !existing) return false;
    for (var i = 0; i < ENGINE_COLS.length; i++) {
      var k = ENGINE_COLS[i], a = expected[k], b = existing[k];
      if (NUM_COLS[k]) { if (!numEq(a, b)) return false; }
      else if (TIME_COLS[k]) { if (!timeEq(a, b)) return false; }
      else if (k === 'is_quick_entry') { if (!!a !== !!b) return false; }
      else if ((a == null ? null : String(a)) !== (b == null ? null : String(b))) return false;
    }
    return true;
  }

  function enginePatch(row) {
    var p = {};
    ENGINE_COLS.forEach(function (k) { p[k] = row[k]; });
    return p;
  }

  // Saf plan: ne eklenecek / silinecek / onarılacak. existingRows = bu hesabın önekiyle bulunan TÜM satırlar.
  function planReconcile(account, closedTrades, existingRows, opts) {
    var plan = { insert: [], remove: [], repair: [], kept: 0, errors: [] };
    var prefix = hashPrefix(account.id);
    var expected = {}, failedHashes = {};
    if (account.journal_id) {
      (closedTrades || []).forEach(function (t) {
        if (!isClosed(t)) return;
        var h = importHash(account.id, t.id);
        try { expected[h] = mapTrade(account, t, opts); }
        catch (e) { plan.errors.push({ tradeId: t.id, code: e.code || 'MAP_FAILED' }); failedHashes[h] = true; }
      });
    }
    var seen = {};
    (existingRows || []).forEach(function (row) {
      if (!row || typeof row.import_hash !== 'string' || row.import_hash.indexOf(prefix) !== 0) return;
      if (failedHashes[row.import_hash] && row.journal_id === account.journal_id) { plan.kept++; return; }
      var exp = expected[row.import_hash];
      if (!exp || row.journal_id !== account.journal_id || seen[row.import_hash]) { plan.remove.push(row.id); return; }
      seen[row.import_hash] = true;
      if (rowsEqual(exp, row)) plan.kept++;
      else plan.repair.push({ id: row.id, patch: enginePatch(exp) });
    });
    Object.keys(expected).forEach(function (h) { if (!seen[h]) plan.insert.push(expected[h]); });
    plan.insert.sort(function (a, b) {
      return a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : (a.import_hash < b.import_hash ? -1 : 1);
    });
    return plan;
  }

  // ============================================================
  // 4) G/Ç: hata sınıflama, tekrar deneme, sıra, bildirim
  // ============================================================
  function classify(error, status) {
    if (!error) return null;
    var code = String(error.code || ''), msg = String(error.message || '');
    if (status === 0 || /Failed to fetch|NetworkError|Load failed|fetch failed|ECONNRESET|ETIMEDOUT|timeout/i.test(msg)) return 'TRANSIENT';
    if (status === 408 || status === 429 || (status >= 500 && status <= 599)) return 'TRANSIENT';
    if (code === '40001' || code === '40P01' || code === '57014' || code === '53300') return 'TRANSIENT';
    if (status === 401 || code === 'PGRST301' || code === 'PGRST303') return 'AUTH';
    if (code === '23503' || code === '42501' || /row-level security|foreign key/i.test(msg)) return 'STALE';
    if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST200' || code === 'PGRST202') return 'SCHEMA';
    return 'PERMANENT';
  }

  var sleepers = [];
  function sleep(ms) {
    return new Promise(function (resolve) {
      var entry = { resolve: resolve, timer: null };
      entry.timer = global.setTimeout(function () {
        sleepers = sleepers.filter(function (x) { return x !== entry; });
        resolve(true);
      }, ms);
      sleepers.push(entry);
    });
  }

  // run() bir supabase-js isteği (thenable) döndürür. Geçici hatalarda artan beklemeyle tekrar dener.
  function withRetry(run) {
    var attempt = 0;
    function go() {
      return Promise.resolve().then(run).then(function (res) {
        res = res || {};
        var kind = res.error ? classify(res.error, res.status) : null;
        if ((kind === 'TRANSIENT' || kind === 'AUTH') && attempt < cfg.retryDelays.length) {
          return sleep(cfg.retryDelays[attempt++]).then(function (awake) {
            return awake ? go() : { data: null, error: { message: 'CANCELLED' }, status: 0, kind: 'CANCELLED' };
          });
        }
        return { data: res.data, error: res.error || null, status: res.status, count: res.count, kind: kind };
      }, function (thrown) {
        if (attempt < cfg.retryDelays.length) {
          return sleep(cfg.retryDelays[attempt++]).then(function (awake) {
            return awake ? go() : { data: null, error: { message: 'CANCELLED' }, status: 0, kind: 'CANCELLED' };
          });
        }
        return { data: null, error: { message: String(thrown && thrown.message || thrown) }, status: 0, kind: 'TRANSIENT' };
      });
    }
    return go();
  }

  var queues = {};
  function enqueue(key, fn) {
    var prev = queues[key] || Promise.resolve();
    var run = prev.then(function () { return fn(); });
    var tail = run.then(function () {}, function () {});
    queues[key] = tail;
    tail.then(function () { if (queues[key] === tail) delete queues[key]; });
    return run;
  }

  var notifyTimer = null, notifyPending = false;
  function notifyChanged() {
    try { if (global.wwCache && typeof global.wwCache.invalidate === 'function') global.wwCache.invalidate('trades'); } catch (e) {}
    notifyPending = true;
    if (notifyTimer) return;
    notifyTimer = global.setTimeout(flush, cfg.notifyDebounceMs);
  }
  function flush() {
    if (notifyTimer) { global.clearTimeout(notifyTimer); notifyTimer = null; }
    if (!notifyPending) return;
    notifyPending = false;
    try { global.dispatchEvent(new global.CustomEvent('trade-saved', { detail: { source: SOURCE } })); } catch (e) {}
  }
  // PAGE.onLeave: bekleyen bildirimi hemen gönder, bekleyen tekrar denemeleri iptal et
  function cancelPending() {
    flush();
    var list = sleepers; sleepers = [];
    list.forEach(function (x) { global.clearTimeout(x.timer); x.resolve(false); });
  }

  function readDirty() {
    try { var raw = global.localStorage && global.localStorage.getItem(DIRTY_KEY); return raw ? (JSON.parse(raw) || {}) : {}; }
    catch (e) { return {}; }
  }
  function writeDirty(map) {
    try { if (global.localStorage) global.localStorage.setItem(DIRTY_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function markDirty(id) { var m = readDirty(); m[id] = new Date().toISOString(); writeDirty(m); }
  function clearDirty(id) { var m = readDirty(); if (m[id]) { delete m[id]; writeDirty(m); } }
  function dirtyAccounts() { return Object.keys(readDirty()); }

  function getClient(opts) { return (opts && opts.client) || global.sb || null; }
  function statsFilterReady() { return !!(global.WwTrades && global.WwTrades.LIVE_OR); }
  function result(ok, extra) {
    var r = { ok: ok, inserted: 0, removed: 0, repaired: 0 };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }
  function fail(code, error, extra) {
    var r = result(false, extra);
    r.code = code;
    if (error) r.error = error;
    return r;
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  function readPaged(build) {
    var out = [];
    function page(from) {
      return withRetry(function () { return build().range(from, from + PAGE - 1); }).then(function (res) {
        if (res.error) return { data: out, error: res.error, kind: res.kind };
        var rows = res.data || [];
        out = out.concat(rows);
        return rows.length < PAGE ? { data: out, error: null } : page(from + PAGE);
      });
    }
    return page(0);
  }

  function fetchClosedTrades(c, accountId) {
    return readPaged(function () {
      return c.from('backtest_account_trades').select('*')
        .eq('backtest_account_id', accountId)
        .not('exit_time', 'is', null)
        .order('exit_time', { ascending: true })
        .order('id', { ascending: true });
    });
  }

  function fetchMirrors(c, userId, accountId) {
    return readPaged(function () {
      return c.from('trades').select(MIRROR_COLS)
        .eq('user_id', userId)
        .eq('platform_source', SOURCE)
        .like('import_hash', hashPrefix(accountId) + '%')
        .order('id', { ascending: true });
    });
  }

  function fetchAccount(c, accountId) {
    return withRetry(function () {
      return c.from('backtest_accounts').select('id,user_id,journal_id,symbol').eq('id', accountId).maybeSingle();
    });
  }

  function insertRows(c, rows) {
    var inserted = 0, groups = chunk(rows, UPSERT_CHUNK);
    function next(i) {
      if (i >= groups.length) return Promise.resolve({ ok: true, inserted: inserted });
      return withRetry(function () {
        return c.from('trades').upsert(groups[i], { onConflict: ON_CONFLICT, ignoreDuplicates: true }).select('id');
      }).then(function (res) {
        if (res.error) return { ok: false, inserted: inserted, error: res.error, kind: res.kind };
        inserted += (res.data || []).length;   // ignoreDuplicates: çakışan satırlar dönmez
        return next(i + 1);
      });
    }
    return next(0);
  }

  function removeIds(c, ids) {
    var removed = 0, groups = chunk(ids, DELETE_CHUNK);
    function next(i) {
      if (i >= groups.length) return Promise.resolve({ ok: true, removed: removed });
      return withRetry(function () {
        return c.from('trades').delete().in('id', groups[i]).eq('platform_source', SOURCE);
      }).then(function (res) {
        if (res.error) return { ok: false, removed: removed, error: res.error, kind: res.kind };
        removed += groups[i].length;
        return next(i + 1);
      });
    }
    return next(0);
  }

  function repairRows(c, repairs) {
    var repaired = 0;
    function next(i) {
      if (i >= repairs.length) return Promise.resolve({ ok: true, repaired: repaired });
      return withRetry(function () {
        return c.from('trades').update(repairs[i].patch).eq('id', repairs[i].id).eq('platform_source', SOURCE);
      }).then(function (res) {
        if (res.error) return { ok: false, repaired: repaired, error: res.error, kind: res.kind };
        repaired++;
        return next(i + 1);
      });
    }
    return next(0);
  }

  function execPlan(c, plan, opts) {
    var out = result(true, { kept: plan.kept, errors: plan.errors });
    return removeIds(c, plan.remove).then(function (r1) {
      out.removed = r1.removed;
      if (!r1.ok) return Object.assign(out, { ok: false, code: r1.kind || 'WRITE_FAILED', error: r1.error });
      return insertRows(c, plan.insert).then(function (r2) {
        out.inserted = r2.inserted;
        if (!r2.ok) return Object.assign(out, { ok: false, code: r2.kind || 'WRITE_FAILED', error: r2.error });
        if (opts && opts.repair === false) return out;
        return repairRows(c, plan.repair).then(function (r3) {
          out.repaired = r3.repaired;
          if (!r3.ok) return Object.assign(out, { ok: false, code: r3.kind || 'WRITE_FAILED', error: r3.error });
          return out;
        });
      });
    });
  }

  function doReconcile(c, account, opts) {
    opts = opts || {};
    var closedP = opts.closedTrades
      ? Promise.resolve({ data: opts.closedTrades.filter(isClosed), error: null })
      : fetchClosedTrades(c, account.id);
    return Promise.all([closedP, fetchMirrors(c, account.user_id, account.id)]).then(function (r) {
      var err = r[0].error || r[1].error;
      if (err) { markDirty(account.id); return fail(r[0].kind || r[1].kind || 'READ_FAILED', err); }
      var plan = planReconcile(account, r[0].data, r[1].data, opts);
      return execPlan(c, plan, opts).then(function (res) {
        if (res.inserted || res.removed || res.repaired) notifyChanged();
        if (res.ok && !plan.errors.length) clearDirty(account.id); else markDirty(account.id);
        return res;
      });
    });
  }

  // ---- Genel API ----

  // Hesaba girişte ve bağlamadan sonra: tam, idempotent eşitleme
  function reconcileAccount(account, opts) {
    if (!account || !account.id || !account.user_id) return Promise.resolve(fail('ACCOUNT_INVALID'));
    if (!statsFilterReady()) { markDirty(account.id); return Promise.resolve(fail('STATS_FILTER_MISSING')); }
    var c = getClient(opts);
    if (!c) return Promise.resolve(fail('SUPABASE_NOT_READY'));
    return enqueue(account.id, function () { return doReconcile(c, account, opts); });
  }

  // Her kapanıştan sonra (hesap bağlıysa): tek satır upsert
  function syncClosedTrade(account, trade, opts) {
    if (!account || !account.id) return Promise.resolve(fail('ACCOUNT_INVALID'));
    if (!account.journal_id) return Promise.resolve(result(true, { skipped: 'NOT_LINKED' }));
    if (!statsFilterReady()) { markDirty(account.id); return Promise.resolve(fail('STATS_FILTER_MISSING')); }
    var c = getClient(opts);
    if (!c) { markDirty(account.id); return Promise.resolve(fail('SUPABASE_NOT_READY')); }
    return enqueue(account.id, function () {
      var row;
      try { row = mapTrade(account, trade, opts); }
      catch (e) { markDirty(account.id); return fail(e.code || 'MAP_FAILED', { message: e.message }); }
      return insertRows(c, [row]).then(function (res) {
        if (res.ok) {
          if (res.inserted) notifyChanged();
          return result(true, { inserted: res.inserted });
        }
        if (res.kind === 'STALE') {
          // Defter silinmiş / bağlantı başka sekmede değişmiş olabilir: hesabı tazele, bir kez eşitle
          return fetchAccount(c, account.id).then(function (fr) {
            if (fr.error) { markDirty(account.id); return fail('STALE', res.error); }
            if (!fr.data) return fail('ACCOUNT_GONE', res.error, { account: null });
            return doReconcile(c, fr.data, opts).then(function (rr) { rr.account = fr.data; return rr; });
          });
        }
        markDirty(account.id);
        return fail(res.kind || 'WRITE_FAILED', res.error);
      });
    });
  }

  // Bağla / taşı (journalId) veya kaldır (null). Eski defterdeki satırları Migration 04 tetikleyicisi siler.
  function linkAccount(account, journalId, opts) {
    if (!account || !account.id) return Promise.resolve(fail('ACCOUNT_INVALID'));
    if (journalId && !statsFilterReady()) return Promise.resolve(fail('STATS_FILTER_MISSING'));
    var c = getClient(opts);
    if (!c) return Promise.resolve(fail('SUPABASE_NOT_READY'));
    return enqueue(account.id, function () {
      return withRetry(function () {
        return c.from('backtest_accounts').update({ journal_id: journalId || null })
          .eq('id', account.id).select('id,user_id,journal_id,symbol').single();
      }).then(function (res) {
        if (res.error) return fail(res.kind === 'TRANSIENT' ? 'TRANSIENT' : 'LINK_FAILED', res.error);
        var fresh = res.data;
        var oldJ = account.journal_id || null;
        if (oldJ && oldJ !== fresh.journal_id) notifyChanged();   // tetikleyici eski satırları sildi
        if (!fresh.journal_id) { clearDirty(account.id); return result(true, { account: fresh }); }
        return doReconcile(c, fresh, opts).then(function (r) { r.account = fresh; return r; });
      });
    });
  }

  function unlinkAccount(account, opts) { return linkAccount(account, null, opts); }

  // Hesabı sil: backtest_account_trades CASCADE; aynalar Migration 04 AFTER DELETE ile silinir
  function deleteAccount(account, opts) {
    if (!account || !account.id) return Promise.resolve(fail('ACCOUNT_INVALID'));
    var c = getClient(opts);
    if (!c) return Promise.resolve(fail('SUPABASE_NOT_READY'));
    return enqueue(account.id, function () {
      return withRetry(function () {
        return c.from('backtest_accounts').delete().eq('id', account.id);
      }).then(function (res) {
        if (res.error) return fail(res.kind || 'DELETE_FAILED', res.error);
        if (account.journal_id) notifyChanged();
        clearDirty(account.id);
        return result(true);
      });
    });
  }

  // Hesap listesi ekranında (seyrek): hesabı olmayan / bağlantısı uymayan backtest satırlarını sil
  function sweepOrphans(userId, opts) {
    if (!userId) return Promise.resolve(fail('USER_INVALID'));
    var c = getClient(opts);
    if (!c) return Promise.resolve(fail('SUPABASE_NOT_READY'));
    return enqueue('sweep:' + userId, function () {
      return withRetry(function () {
        return c.from('backtest_accounts').select('id,journal_id').eq('user_id', userId);
      }).then(function (acc) {
        if (acc.error) return fail(acc.kind || 'READ_FAILED', acc.error);
        var byId = {};
        (acc.data || []).forEach(function (a) { byId[String(a.id).toLowerCase()] = a; });
        return readPaged(function () {
          return c.from('trades').select('id,journal_id,import_hash')
            .eq('user_id', userId).eq('platform_source', SOURCE).order('id', { ascending: true });
        }).then(function (rows) {
          if (rows.error) return fail(rows.kind || 'READ_FAILED', rows.error);
          var orphanIds = rows.data.filter(function (r) {
            var p = parseHash(r.import_hash);
            var a = p && byId[p.accountId.toLowerCase()];
            return !a || !a.journal_id || a.journal_id !== r.journal_id;
          }).map(function (r) { return r.id; });
          if (!orphanIds.length) return result(true);
          return removeIds(c, orphanIds).then(function (rm) {
            if (rm.removed) notifyChanged();
            return rm.ok ? result(true, { removed: rm.removed }) : fail(rm.kind || 'WRITE_FAILED', rm.error, { removed: rm.removed });
          });
        });
      });
    });
  }

  // Onay pencereleri için: bu hesabın bağlı defterdeki ayna sayısı (HEAD count)
  function countMirrors(account, opts) {
    var c = getClient(opts);
    if (!c || !account || !account.journal_id) return Promise.resolve({ count: 0, error: null });
    return withRetry(function () {
      return c.from('trades').select('id', { count: 'exact', head: true })
        .eq('user_id', account.user_id).eq('journal_id', account.journal_id)
        .eq('platform_source', SOURCE).like('import_hash', hashPrefix(account.id) + '%');
    }).then(function (res) { return { count: res.count || 0, error: res.error || null }; });
  }

  global.WwBtSync = {
    PREFIX: PREFIX,
    ON_CONFLICT: ON_CONFLICT,
    UPSERT_CHUNK: UPSERT_CHUNK,
    DELETE_CHUNK: DELETE_CHUNK,
    importHash: importHash,
    hashPrefix: hashPrefix,
    parseHash: parseHash,
    isClosed: isClosed,
    mapTrade: mapTrade,
    rowsEqual: rowsEqual,
    planReconcile: planReconcile,
    syncClosedTrade: syncClosedTrade,
    reconcileAccount: reconcileAccount,
    linkAccount: linkAccount,
    unlinkAccount: unlinkAccount,
    deleteAccount: deleteAccount,
    sweepOrphans: sweepOrphans,
    countMirrors: countMirrors,
    dirtyAccounts: dirtyAccounts,
    flush: flush,
    cancelPending: cancelPending,
    _config: cfg,
    _classify: classify,
    _dec: { plain: plain, canon: canon, cmp: cmp, toCents: toCents, centsStr: centsStr, round2: round2, rrRatio: rrRatio }
  };
})(typeof window !== 'undefined' ? window : globalThis);
