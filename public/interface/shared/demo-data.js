// ============================================================
// WAWE JOURNAL - DEMO VERİSİ (reklam / tanıtım kaydı)
// File: public/interface/shared/demo-data.js  ->  window.WwDemoData
// ============================================================
// Yalnızca admin, dashboard üzerinden:
//   /dashboard?demo=seed    -> "Wawe Demo" defteri oluşturulur (varsa yeniden kullanılır), aktif yapılır,
//                              5 strateji + ~160 işlemle doldurulur (bu ay dahil son 4 ay, hafta içi)
//   /dashboard?demo=remove  -> "Wawe Demo" defteri işlemleri ve stratejileriyle silinir
// dashboard.js bu dosyayı yalnızca ?demo= varken ve kullanıcı admin ise yükler.
//
// İşlemler import_hash 'demo-<gün>-<n>' taşır. Tekrar seed eski demo işlemlerini silip baştan üretir
// (kullanıcının o deftere elle eklediği işlemlere dokunmaz).
// Bu ayın kalan iş günleri de doldurulur (ileri tarihli) ki takvim içinde bulunulan ayda boş görünmesin.
// Defterde demo olmayan işlem varsa remove defteri silmez, yalnızca demo satırlarını siler.
// ============================================================
(function (global) {
  'use strict';
  if (global.WwDemoData) return;

  var JOURNAL_NAME = 'Wawe Demo';
  var JOURNAL_KEY = 'ww_demo_journal_id';
  var HASH_PREFIX = 'demo-';
  var MONTHS_BACK = 3;
  var RISK_PER_TRADE = 100;
  var SEED = 42;

  // wr = kazanma oranı, target = hedef R, hours = işlem saatleri (kullanıcının saat diliminde)
  var STRATEGIES = [
    { name: 'London Breakout', color: '#22c55e', weight: 0.28, wr: 0.62, target: 2.2, hours: [9, 11],
      symbols: ['EURUSD', 'GBPUSD', 'XAUUSD'],
      desc: { tr: 'Asya seansı aralığının Londra açılışında kırılımı, retest sonrası giriş.',
              en: 'Asian range breakout at the London open, entry on the retest.' } },
    { name: 'NY Open Momentum', color: '#3b82f6', weight: 0.24, wr: 0.55, target: 2.8, hours: [16, 18],
      symbols: ['NAS100', 'US30', 'XAUUSD'],
      desc: { tr: 'New York açılışının ilk 30 dakikasında momentum yönünde işlem.',
              en: 'Trades in the momentum direction during the first 30 minutes of the NY open.' } },
    { name: 'Supply & Demand', color: '#f59e0b', weight: 0.20, wr: 0.60, target: 2.5, hours: [10, 19],
      symbols: ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'],
      desc: { tr: '4 saatlik arz/talep bölgelerine dönüşte, düşük zaman diliminde onayla giriş.',
              en: 'Entries on returns to 4H supply/demand zones, confirmed on a lower timeframe.' } },
    { name: 'Trend Pullback', color: '#14b8a6', weight: 0.18, wr: 0.57, target: 2.0, hours: [9, 20],
      symbols: ['EURUSD', 'GBPUSD', 'AUDUSD', 'XAUUSD', 'NAS100', 'BTCUSD'],
      desc: { tr: 'Günlük trend yönünde, 50 EMA geri çekilmelerinde giriş.',
              en: 'Entries on 50 EMA pullbacks in the direction of the daily trend.' } },
    { name: 'Asia Range Fade', color: '#ec4899', weight: 0.10, wr: 0.42, target: 1.5, hours: [3, 6],
      symbols: ['EURUSD', 'AUDUSD', 'XAUUSD'],
      desc: { tr: 'Asya seansında aralık uçlarından ters yönlü işlem (test aşamasında).',
              en: 'Fading the edges of the Asian range (still being tested).' } }
  ];

  // instrument/çarpan uygulamadaki INSTRUMENT_MULTIPLIERS ile aynı (public/src/core/config.js)
  var SYMBOLS = {
    EURUSD: { instrument: 'forex',  mult: 100000, price: 1.1620, vol: 0.0045, dec: 5, lots: [0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.25, 1.5], comm: 7 },
    GBPUSD: { instrument: 'forex',  mult: 100000, price: 1.3350, vol: 0.0055, dec: 5, lots: [0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.25, 1.5], comm: 7 },
    AUDUSD: { instrument: 'forex',  mult: 100000, price: 0.6560, vol: 0.0040, dec: 5, lots: [0.5, 0.6, 0.75, 0.8, 1, 1.2, 1.25, 1.5], comm: 7 },
    XAUUSD: { instrument: 'gold',   mult: 100,    price: 4150,   vol: 0.0110, dec: 2, lots: [0.1, 0.15, 0.2, 0.25, 0.3, 0.4], comm: 7 },
    NAS100: { instrument: 'index',  mult: 10,     price: 25100,  vol: 0.0120, dec: 1, lots: [0.2, 0.25, 0.3, 0.4, 0.5, 0.6], comm: 0 },
    US30:   { instrument: 'index',  mult: 10,     price: 47200,  vol: 0.0090, dec: 1, lots: [0.2, 0.25, 0.3, 0.4, 0.5], comm: 0 },
    BTCUSD: { instrument: 'crypto', mult: 1,      price: 108000, vol: 0.0250, dec: 1, lots: [0.1, 0.15, 0.2, 0.25, 0.3], comm: 0 }
  };

  var NOTES = {
    tr: {
      win: [
        'Planıma sadık kaldım, hedefe kadar taşıdım.',
        'Temiz kırılım, retest sonrası giriş. Kitap gibi.',
        'Likidite alımı sonrası güçlü dönüş, sabırla bekledim.',
        'Yarısını 1R\'de kapattım, kalanı hedefe gitti.',
        'Üst zaman dilimi trendi yönünde, 15dk onay mumu.',
        'Haber sonrası volatilite iyi çalıştı.',
        'Giriş sniper, stop hiç tehdit edilmedi.'
      ],
      loss: [
        'Stop oldu ama kurallara uygundu, sorun yok.',
        'Erken girdim, onay mumunu beklemeliydim.',
        'Haber öncesi pozisyon açmamalıydım.',
        'Seviye tutmadı, stop yerinde çalıştı.',
        'FOMO ile girdim. Not alındı, tekrarlanmayacak.',
        'Spread genişledi, stop fitilden aldı.'
      ],
      be: [
        'Stop\'u girişe çektim, başabaş kapandı.',
        'Momentum zayıfladı, manuel çıktım.'
      ],
      cut: [
        'Kurulum bozuldu, stop\'u beklemeden erken çıktım.',
        'Fiyat beklediğim gibi tepki vermedi, zararı küçük tuttum.'
      ]
    },
    en: {
      win: [
        'Stuck to the plan and held to target.',
        'Clean breakout, entered on the retest. Textbook.',
        'Strong reversal after the liquidity grab, waited patiently.',
        'Took half at 1R, the rest ran to target.',
        'With the higher-timeframe trend, 15m confirmation candle.',
        'Post-news volatility worked well.',
        'Sniper entry, the stop was never threatened.'
      ],
      loss: [
        'Stopped out but followed the rules, all good.',
        'Entered too early, should have waited for confirmation.',
        'Should not have opened a position before the news.',
        'Level did not hold, the stop did its job.',
        'FOMO entry. Noted, won\'t repeat it.',
        'Spread widened, stop got wicked out.'
      ],
      be: [
        'Moved the stop to entry, closed at breakeven.',
        'Momentum faded, exited manually.'
      ],
      cut: [
        'Setup was invalidated, exited before the stop.',
        'Price did not react as expected, kept the loss small.'
      ]
    }
  };

  function lang() {
    try { return global.i18n && global.i18n.getCurrentLanguage() === 'tr' ? 'tr' : 'en'; } catch (e) { return 'tr'; }
  }

  // Tekrarlanabilir rastgelelik (mulberry32)
  function makeRng(seed) {
    var s = seed >>> 0;
    var rand = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    var r = { rand: rand };
    r.between = function (a, b) { return a + rand() * (b - a); };
    r.intBetween = function (a, b) { return Math.floor(r.between(a, b + 1)); };
    r.pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };
    r.gauss = function () { var u = 0; while (!u) u = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()); };
    r.weighted = function (items, weightOf) {
      var total = items.reduce(function (s, it) { return s + weightOf(it); }, 0), x = rand() * total;
      for (var i = 0; i < items.length; i++) { x -= weightOf(items[i]); if (x <= 0) return items[i]; }
      return items[items.length - 1];
    };
    return r;
  }

  function round(v, d) { var p = Math.pow(10, d); return Math.round(v * p) / p; }

  // Kullanıcının ayarlı saat dilimindeki duvar saati -> UTC ISO (time-settings.js)
  function wallTimeIso(y, m, d, H, Mi) {
    if (global.WwTime && typeof global.WwTime.localWallTimeToIso === 'function') {
      return global.WwTime.localWallTimeToIso(y, m, d, H, Mi, 0);
    }
    return new Date(y, m - 1, d, H, Mi, 0).toISOString();
  }

  function todayKey() {
    if (global.WwTime && global.WwTime.todayKey) return global.WwTime.todayKey();
    var n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0');
  }

  // (bu ay - MONTHS_BACK)'in 1'i -> bu ayın sonu, yalnızca hafta içi
  function tradingDays() {
    var p = todayKey().split('-').map(Number), days = [];
    var end = new Date(Date.UTC(p[0], p[1], 0));
    for (var d = new Date(Date.UTC(p[0], p[1] - 1 - MONTHS_BACK, 1)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      var wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) {
        days.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), key: d.toISOString().slice(0, 10) });
      }
    }
    return days;
  }

  // Satırları üretir; strategy_id yerine stratName taşır (insert öncesi eşlenir)
  function buildTrades(uid, jid, notes) {
    var r = makeRng(SEED), days = tradingDays(), out = [];
    // Gerçekçi eğri: ikinci ayın ortasında ~2,5 haftalık zor dönem (drawdown), son çeyrek güçlü
    var roughFrom = Math.floor(days.length * 0.32), roughTo = roughFrom + 12;
    var level = {};
    Object.keys(SYMBOLS).forEach(function (k) { level[k] = SYMBOLS[k].price * (1 - SYMBOLS[k].vol * 6 * (r.rand() - 0.5)); });

    days.forEach(function (day, di) {
      Object.keys(level).forEach(function (k) { level[k] *= 1 + r.gauss() * SYMBOLS[k].vol * 0.6 + SYMBOLS[k].vol * 0.03; });
      if (r.rand() < 0.12) return; // işlem yapılmayan gün
      // en fazla 5: overtrade varsayılan günlük limiti 5'i aşınca uyarır
      var n = r.weighted([[1, 30], [2, 35], [3, 22], [4, 10], [5, 3]], function (x) { return x[1]; })[0];
      var wrShift = (di >= roughFrom && di < roughTo) ? -0.45 : (di >= days.length * 0.75 ? 0.05 : 0);
      var used = {};

      for (var i = 0; i < n; i++) {
        var strat = r.weighted(STRATEGIES, function (s) { return s.weight; });
        var symKey = r.pick(strat.symbols), sym = SYMBOLS[symKey];
        var dir = r.rand() < 0.53 ? 1 : -1;

        var H = r.intBetween(strat.hours[0], strat.hours[1]), Mi = r.intBetween(0, 59);
        while (used[H * 60 + Mi]) Mi = (Mi + 7) % 60;
        used[H * 60 + Mi] = true;

        // Lot ve risk -> stop mesafesi (fiyat birimi)
        var lot = r.pick(sym.lots); // gerçek hesaplardaki gibi yuvarlak lotlar
        var risk = RISK_PER_TRADE * r.between(0.85, 1.15);
        var stopDist = Math.max(Math.pow(10, -sym.dec) * 10, round(risk / (lot * sym.mult), sym.dec));
        var entry = round(level[symKey] * (1 + r.gauss() * sym.vol * 0.25), sym.dec);
        var target = round(strat.target * r.between(0.9, 1.15), 2);

        // Sonuç (R cinsinden)
        var R, kind;
        if (r.rand() < 0.06) { R = r.between(-0.08, 0.12); kind = 'be'; }
        else if (r.rand() < Math.min(0.85, Math.max(0.15, strat.wr + wrShift))) {
          kind = 'win';
          var w = r.rand();
          R = w < 0.62 ? target * r.between(0.97, 1.0) : (w < 0.95 ? r.between(0.6, target * 0.85) : target * r.between(1.3, 1.7));
        } else if (r.rand() < 0.85) {
          kind = 'loss';
          R = -r.between(1.0, 1.06);
        } else {
          kind = 'cut'; // kurulum bozuldu, stop beklenmeden erken çıkış
          R = -r.between(0.3, 0.8);
        }

        var exit = round(entry + dir * R * stopDist, sym.dec);
        var sl = round(entry - dir * stopDist, sym.dec);
        var tp = round(entry + dir * target * stopDist, sym.dec);
        var gross = round(dir * (exit - entry) * lot * sym.mult, 2);
        var commission = round(lot * sym.comm, 2);
        var swap = (sym.instrument === 'forex' || sym.instrument === 'gold') && r.rand() < 0.1 ? -round(lot * r.between(1, 6), 2) : 0;

        out.push({
          stratName: strat.name,
          row: {
            user_id: uid,
            journal_id: jid,
            symbol: symKey,
            direction: dir === 1 ? 'LONG' : 'SHORT',
            instrument: sym.instrument,
            lot: lot,
            entry_price: entry,
            exit_price: exit,
            stop_loss: sl,
            take_profit: tp,
            gross_pnl: gross,
            commission: commission,
            swap: swap,
            pnl: round(gross - commission + swap, 2),
            rr_ratio: round(Math.abs(tp - entry) / Math.abs(entry - sl), 2),
            multiplier: sym.mult,
            trade_date: wallTimeIso(day.y, day.m, day.d, H, Mi),
            notes: r.rand() < 0.75 ? r.pick(notes[kind]) : null,
            import_hash: HASH_PREFIX + day.key + '-' + (i + 1)
          }
        });
      }
    });
    return out;
  }

  async function currentUserId() {
    var res = await global.sb.auth.getSession();
    var s = res && res.data && res.data.session;
    if (!s) throw new Error('Oturum yok');
    return s.user.id;
  }

  async function findDemoJournal() {
    var journals = await global.journal.listJournals(true);
    var storedId = localStorage.getItem(JOURNAL_KEY);
    var demo = journals.find(function (j) { return j.id === storedId; })
      || journals.find(function (j) { return j.name === JOURNAL_NAME; }) || null;
    return { demo: demo, journals: journals };
  }

  async function seed() {
    var sb = global.sb, uid = await currentUserId(), L = lang();
    var found = await findDemoJournal(), demo = found.demo;
    if (!demo) {
      var created = await global.journal.createJournal({
        name: JOURNAL_NAME,
        description: L === 'tr' ? 'Tanıtım için örnek işlemler' : 'Sample trades for showcase',
        color: '#22c55e',
        icon: 'folder',
        trade_scope: 'live'
      });
      demo = Array.isArray(created) ? created[0] : created;
    }
    localStorage.setItem(JOURNAL_KEY, demo.id);
    global.journal.setActiveJournalId(demo.id, true);

    // Stratejiler (varsa yeniden kullanılır)
    var stratId = {};
    var existing = await sb.from('strategies').select('id, name')
      .eq('user_id', uid).eq('journal_id', demo.id).in('name', STRATEGIES.map(function (s) { return s.name; }));
    if (existing.error) throw existing.error;
    (existing.data || []).forEach(function (s) { stratId[s.name] = s.id; });
    var missing = STRATEGIES.filter(function (s) { return !stratId[s.name]; });
    if (missing.length) {
      var ins = await sb.from('strategies').insert(missing.map(function (s) {
        return { user_id: uid, journal_id: demo.id, name: s.name, description: s.desc[L], color: s.color };
      })).select('id, name');
      if (ins.error) throw ins.error;
      ins.data.forEach(function (s) { stratId[s.name] = s.id; });
    }

    // Önceki demo işlemleri silinir: tekrar seed her zaman güncel üreticiyle baştan doldurur
    var old = await sb.from('trades').delete().eq('user_id', uid).eq('journal_id', demo.id).like('import_hash', HASH_PREFIX + '%');
    if (old.error) throw old.error;

    var rows = buildTrades(uid, demo.id, NOTES[L]).map(function (p) {
      p.row.strategy_id = stratId[p.stratName] || null;
      return p.row;
    });
    var inserted = 0;
    for (var i = 0; i < rows.length; i += 200) {
      var up = await sb.from('trades')
        .upsert(rows.slice(i, i + 200), { onConflict: 'user_id,journal_id,import_hash', ignoreDuplicates: true })
        .select('id');
      if (up.error) throw up.error;
      inserted += (up.data || []).length;
    }
    return { inserted: inserted, total: rows.length };
  }

  async function remove() {
    var sb = global.sb, uid = await currentUserId();
    var found = await findDemoJournal(), demo = found.demo;
    if (!demo) return { removed: false };

    // Kapsam 'all': defterdeki backtest dahil HER işlem sayılır (trades-source.js)
    var all = await global.WwTrades.applyScope(sb.from('trades').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('journal_id', demo.id), 'all');
    var mine = await global.WwTrades.applyScope(sb.from('trades').select('id', { count: 'exact', head: true })
      .eq('user_id', uid).eq('journal_id', demo.id).like('import_hash', HASH_PREFIX + '%'), 'all');
    if (all.error || mine.error) throw (all.error || mine.error);

    if ((all.count || 0) > (mine.count || 0)) {
      // Kullanıcı bu deftere kendi işlemlerini de eklemiş: defteri koru, yalnızca demo satırlarını sil
      var del = await sb.from('trades').delete().eq('user_id', uid).eq('journal_id', demo.id).like('import_hash', HASH_PREFIX + '%');
      if (del.error) throw del.error;
      return { removed: true, keptJournal: true };
    }

    if (global.journal.getActiveJournalId() === demo.id) {
      var fallback = found.journals.find(function (j) { return j.is_default && j.id !== demo.id; })
        || found.journals.find(function (j) { return j.id !== demo.id; });
      global.journal.setActiveJournalId(fallback ? fallback.id : null, true);
    }
    await global.journal.deleteJournal(demo.id); // delete_journal işlemleri ve stratejileri de siler
    localStorage.removeItem(JOURNAL_KEY);
    return { removed: true, keptJournal: false };
  }

  function overlay(text) {
    var el = document.getElementById('ww-demo-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ww-demo-overlay';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;' +
        'padding:16px;background:var(--bg,#000);color:var(--text,#fff);font:600 16px/1.5 inherit;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = text;
    return el;
  }

  async function run(mode) {
    overlay(mode === 'remove' ? 'Demo verisi siliniyor...' : 'Demo verisi hazırlanıyor...');
    try {
      var msg;
      if (mode === 'remove') {
        var rm = await remove();
        msg = !rm.removed ? 'Silinecek demo defteri yok.'
          : (rm.keptJournal ? 'Demo işlemleri silindi (defterde senin işlemlerin olduğu için defter korundu).' : 'Demo defteri silindi.');
      } else {
        var res = await seed();
        msg = res.inserted + ' demo işlemi eklendi.';
      }
      try { if (global.wwCache) global.wwCache.invalidate(); } catch (e) {}
      overlay(msg);
      setTimeout(function () { location.replace(location.pathname); }, 900);
    } catch (err) {
      console.error('[WwDemoData]', err);
      var el = overlay('Demo verisi hatası: ' + (err && err.message ? err.message : err));
      el.style.cursor = 'pointer';
      el.onclick = function () { location.replace(location.pathname); };
    }
  }

  global.WwDemoData = { run: run, seed: seed, remove: remove, buildTrades: buildTrades };
})(typeof window !== 'undefined' ? window : globalThis);
