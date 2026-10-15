// ============================================================
// WAWE JOURNAL - SAAT & GÜN AYARLARI (tek doğruluk kaynağı)
// ============================================================
// Ayarlar > Görünüm > "Saat ve Gün" bölümünde kullanıcı şunları seçer:
//   tz         Saat diliminiz ('auto' = cihazınız)
//   dayStart   İşlem gününün başladığı saat (0-23, varsayılan 0 = gece yarısı)
//   importTz   İçe aktarılan dosyalardaki saatlerin saat dilimi
//              ('same' = sizin saat diliminiz, 'utc', 'offset:<dakika>' sabit fark, ya da IANA adı)
//   hour12     12 saatlik (AM/PM) gösterim
//
// Bu dosya bunlara dayanan TÜM hesapları tek yerde toplar: gün anahtarı (takvim, günlük
// PnL, filtreler), "bugün", saat/dakika gösterimi, saatlik/haftanın günü dağılımı ve
// içe aktarılan saatlerin UTC'ye çevrilmesi. Böylece her sayfa aynı işlemi aynı güne yazar.
//
// KURAL: Sadece-tarih içeren değerler ('YYYY-MM-DD' ya da tam UTC gece yarısı damgası)
// hiçbir zaman saat dilimiyle kaydırılmaz ve gün başlangıcı saatinden etkilenmez.
// ============================================================
(function (global) {
  'use strict';

  var STORAGE_KEY = 'ww_time_settings';
  var DEFAULTS = { tz: 'auto', dayStart: 0, importTz: 'same', hour12: false };
  var DAY_MS = 86400000;

  // ------------------------------------------------------------
  // Intl yardımcıları
  // ------------------------------------------------------------
  var dtfCache = {};
  function isValidTz(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  function deviceTz() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isValidTz(tz) ? tz : 'UTC';
    } catch (e) { return 'UTC'; }
  }

  function dtf(tz) {
    if (!dtfCache[tz]) {
      dtfCache[tz] = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    return dtfCache[tz];
  }

  // ms (UTC) -> o saat diliminde duvar saati parçaları
  function partsInTz(ms, tz) {
    var o = {};
    dtf(tz).formatToParts(new Date(ms)).forEach(function (p) {
      if (p.type !== 'literal') o[p.type] = p.value;
    });
    var h = +o.hour;
    if (h === 24) h = 0;
    return { y: +o.year, m: +o.month, d: +o.day, H: h, Mi: +o.minute, S: +o.second };
  }

  // 'offset:120' gibi sabit fark (dakika) mı?
  function fixedOffsetOf(spec) {
    var m = /^offset:(-?\d+)$/.exec(String(spec || ''));
    return m ? parseInt(m[1], 10) : null;
  }

  // Bir saat dilimi tanımının (IANA ya da 'offset:N') verilen an için UTC farkı (dakika)
  function offsetMinutes(ms, spec) {
    var fixed = fixedOffsetOf(spec);
    if (fixed !== null) return fixed;
    var p = partsInTz(ms, spec);
    var asUtc = Date.UTC(p.y, p.m - 1, p.d, p.H, p.Mi, p.S);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }

  // o saat diliminde duvar saati (y,m,d,H,Mi,S) -> UTC ms (DST geçişlerine dayanıklı)
  function zonedToUtcMs(y, m, d, H, Mi, S, spec) {
    var guess = Date.UTC(y, m - 1, d, H, Mi, S || 0);
    var off = offsetMinutes(guess, spec);
    var ms = guess - off * 60000;
    var off2 = offsetMinutes(ms, spec);
    if (off2 !== off) ms = guess - off2 * 60000;
    return ms;
  }

  // ------------------------------------------------------------
  // Ayarlar
  // ------------------------------------------------------------
  function normalize(o) {
    o = (o && typeof o === 'object') ? o : {};
    var s = { tz: DEFAULTS.tz, dayStart: DEFAULTS.dayStart, importTz: DEFAULTS.importTz, hour12: DEFAULTS.hour12 };
    if (o.tz === 'auto' || isValidTz(o.tz)) s.tz = o.tz || 'auto';
    var ds = parseInt(o.dayStart, 10);
    if (!isNaN(ds)) s.dayStart = Math.min(23, Math.max(0, ds));
    if (o.importTz === 'same' || o.importTz === 'utc' || fixedOffsetOf(o.importTz) !== null || isValidTz(o.importTz)) {
      s.importTz = o.importTz;
    }
    s.hour12 = !!o.hour12;
    return s;
  }

  var cached = null;
  function getSettings() {
    if (cached) return cached;
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      cached = normalize(raw ? JSON.parse(raw) : {});
    } catch (e) { cached = normalize({}); }
    return cached;
  }

  function setSettings(partial) {
    var next = normalize(Object.assign({}, getSettings(), partial || {}));
    cached = next;
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
    try { global.dispatchEvent(new CustomEvent('timeSettingsChanged', { detail: next })); } catch (e) {}
    return next;
  }

  function resetSettings() {
    cached = null;
    try { global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    cached = normalize({});
    try { global.dispatchEvent(new CustomEvent('timeSettingsChanged', { detail: cached })); } catch (e) {}
    return cached;
  }

  // Çözülmüş (gerçek) saat dilimi: 'auto' -> cihaz
  function getTz() {
    var s = getSettings();
    return s.tz === 'auto' ? deviceTz() : s.tz;
  }

  // İçe aktarılan saatlerin saat dilimi tanımı ('same' -> kullanıcı saat dilimi)
  function getImportSpec() {
    var s = getSettings();
    if (s.importTz === 'same') return getTz();
    if (s.importTz === 'utc') return 'UTC';
    return s.importTz;
  }

  // ------------------------------------------------------------
  // Değer sınıflandırma ve parse
  // ------------------------------------------------------------
  var DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

  // Zaman damgası -> UTC ms. Saat dilimi bilgisi OLMAYAN damgalar UTC kabul edilir (prop hesaplayıcıyla aynı).
  function parseMs(raw) {
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
    var s = String(raw).trim();
    var m = DATETIME_RE.exec(s);
    if (!m) {
      var p = Date.parse(s);
      return isNaN(p) ? NaN : p;
    }
    var frac = m[7] ? +((m[7] + '00').slice(0, 3)) : 0;
    var base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), frac);
    var z = m[8];
    if (!z || /^z$/i.test(z)) return base;
    var sign = z.charAt(0) === '-' ? -1 : 1;
    var digits = z.slice(1).replace(':', '');
    var hh = +digits.slice(0, 2);
    var mm = digits.length > 2 ? +digits.slice(2, 4) : 0;
    return base - sign * (hh * 60 + mm) * 60000;
  }

  function rawOf(v) {
    return (v && typeof v === 'object' && !(v instanceof Date)) ? v.trade_date : v;
  }

  // {kind:'none'} | {kind:'date', key} | {kind:'time', ms}
  // Tam UTC gece yarısı damgası (timestamptz'e yazılmış sadece-tarih verisi) 'date' sayılır.
  function classify(v) {
    var raw = rawOf(v);
    if (raw === null || raw === undefined || raw === '') return { kind: 'none' };
    var s = String(raw).trim();
    if (DATE_ONLY_RE.test(s)) return { kind: 'date', key: s };
    var ms = parseMs(raw);
    if (isNaN(ms)) {
      return DATE_ONLY_RE.test(s.slice(0, 10)) ? { kind: 'date', key: s.slice(0, 10) } : { kind: 'none' };
    }
    if (ms % DAY_MS === 0) {
      var d = new Date(ms);
      return { kind: 'date', key: keyFromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
    return { kind: 'time', ms: ms };
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyFromYMD(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }

  // ------------------------------------------------------------
  // Gün anahtarı ('YYYY-MM-DD'): işlem günü = (an - dayStart saat) o saat diliminde hangi gün
  // ------------------------------------------------------------
  function keyOfInstant(ms) {
    var s = getSettings();
    var p = partsInTz(ms - s.dayStart * 3600000, getTz());
    return keyFromYMD(p.y, p.m, p.d);
  }

  function dateKey(v) {
    var c = classify(v);
    if (c.kind === 'date') return c.key;
    if (c.kind === 'time') return keyOfInstant(c.ms);
    var raw = rawOf(v);
    return raw ? String(raw).slice(0, 10) : '';
  }

  function todayKey(nowMs) {
    return keyOfInstant(nowMs === undefined ? Date.now() : nowMs);
  }

  // ------------------------------------------------------------
  // Takvim günü aritmetiği (anahtarlar üzerinde; saat dilimi karışmaz)
  // ------------------------------------------------------------
  function ymdOf(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  function addDays(key, n) {
    var p = ymdOf(key);
    if (!p) return key;
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return keyFromYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  // Ay sonu taşmasız ay ekleme: 31 Mart - 1 ay = 28/29 Şubat (3 Mart değil)
  function addMonths(key, n) {
    var p = ymdOf(key);
    if (!p) return key;
    var total = p.y * 12 + (p.m - 1) + n;
    var y = Math.floor(total / 12), m = total % 12;
    if (m < 0) { m += 12; }
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return keyFromYMD(y, m + 1, Math.min(p.d, last));
  }

  function dowOfKey(key) {   // 0 = Pazar ... 6 = Cumartesi
    var p = ymdOf(key);
    return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null;
  }

  // Tarih aralığı filtresinin başlangıç anahtarı (bitiş her zaman bugün)
  //  week  = bugün dahil son 7 gün
  //  month = bir ay önceki aynı gün (ay sonu taşmasız)
  //  year  = bu yılın 1 Ocak'ı
  function rangeStartKey(range, today) {
    today = today || todayKey();
    if (range === 'week') return addDays(today, -6);
    if (range === 'month') return addMonths(today, -1);
    if (range === 'year') return today.slice(0, 4) + '-01-01';
    return null; // 'all'
  }

  // Bir önceki dönem [start, end) (anahtar karşılaştırması; end hariç).
  // 'year' için yıl-başından-bugüne, geçen yılın AYNI süresiyle kıyaslanır.
  function previousRangeKeys(range, today) {
    today = today || todayKey();
    var start = rangeStartKey(range, today);
    if (!start) return null;
    if (range === 'week') return { start: addDays(start, -7), end: start };
    if (range === 'month') return { start: addMonths(start, -1), end: start };
    if (range === 'year') return { start: addMonths(start, -12), end: addMonths(addDays(today, 1), -12) };
    return null;
  }

  // Grafik ekseni için: işlemin SAAT DİLİMİMİZDEKİ duvar saatini "sahte UTC" saniye olarak verir
  // (lightweight-charts etiketleri UTC alanlarını gösterir; böylece eksen kullanıcının günlerini gösterir).
  // Sadece-tarih işlemler günün 12:00'ına konur. Geçersiz değer için null.
  function pseudoUtcSeconds(v) {
    var c = classify(v);
    if (c.kind === 'date') {
      var p = ymdOf(c.key);
      return Math.floor(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0) / 1000);
    }
    if (c.kind === 'time') {
      var q = partsInTz(c.ms, getTz());
      return Math.floor(Date.UTC(q.y, q.m - 1, q.d, q.H, q.Mi, q.S) / 1000);
    }
    return null;
  }

  // Saat dilimimizdeki "bugün" için yerel bir Date (getFullYear/getMonth/getDate = bugünün anahtarı)
  function dateFromKey(key) {
    var p = ymdOf(key);
    return p ? new Date(p.y, p.m - 1, p.d) : new Date();
  }

  // ------------------------------------------------------------
  // Saat / haftanın günü
  // ------------------------------------------------------------
  // İşlemin saat dilimimizdeki saati (0-23). Saati bilinmeyen (sadece-tarih) işlem için null.
  function hourOf(v) {
    var c = classify(v);
    return c.kind === 'time' ? partsInTz(c.ms, getTz()).H : null;
  }

  function dowOf(v) {
    var k = dateKey(v);
    return k ? dowOfKey(k) : null;
  }

  // ------------------------------------------------------------
  // Gösterim biçimleri
  // ------------------------------------------------------------
  function localeFor(lang) {
    return lang === 'tr' ? 'tr-TR' : (lang === 'de' ? 'de-DE' : 'en-US');
  }

  function currentLang() {
    try {
      if (global.i18n && typeof global.i18n.getCurrentLanguage === 'function') return global.i18n.getCurrentLanguage();
    } catch (e) {}
    return 'tr';
  }

  function formatTime(v, lang) {
    var c = classify(v);
    if (c.kind !== 'time') return '';
    return new Intl.DateTimeFormat(localeFor(lang || currentLang()), {
      timeZone: getTz(), hour: '2-digit', minute: '2-digit', hour12: getSettings().hour12
    }).format(new Date(c.ms));
  }

  // Sadece tarih: 'YYYY-MM-DD' ya da zaman damgası (saat dilimimizde)
  function formatDate(v, lang, opts) {
    var c = classify(v);
    if (c.kind === 'none') return '';
    var o = Object.assign({ day: '2-digit', month: 'short', year: 'numeric' }, opts || {});
    if (c.kind === 'date') {
      var p = ymdOf(c.key);
      o.timeZone = 'UTC';
      return new Intl.DateTimeFormat(localeFor(lang || currentLang()), o).format(new Date(Date.UTC(p.y, p.m - 1, p.d)));
    }
    o.timeZone = getTz();
    return new Intl.DateTimeFormat(localeFor(lang || currentLang()), o).format(new Date(c.ms));
  }

  // Tarih + saat (saati bilinmeyen işlemde yalnızca tarih)
  function formatDateTime(v, lang, opts) {
    var c = classify(v);
    if (c.kind !== 'time') return formatDate(v, lang, opts);
    var o = Object.assign({
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: getSettings().hour12, timeZone: getTz()
    }, opts || {});
    return new Intl.DateTimeFormat(localeFor(lang || currentLang()), o).format(new Date(c.ms));
  }

  // 'UTC+3', 'UTC-5', 'UTC+5:30'
  function formatOffset(minutes) {
    var sign = minutes < 0 ? '-' : '+';
    var abs = Math.abs(minutes);
    var h = Math.floor(abs / 60), m = abs % 60;
    return 'UTC' + sign + h + (m ? ':' + pad(m) : '');
  }

  function offsetLabel(spec, ms) {
    return formatOffset(offsetMinutes(ms === undefined ? Date.now() : ms, spec));
  }

  // ------------------------------------------------------------
  // İçe aktarma: dosyadaki duvar saatini (saat dilimi bilgisi yok) UTC ISO'ya çevir
  // ------------------------------------------------------------
  function importWallTimeToIso(y, m, d, H, Mi, S) {
    var ms = zonedToUtcMs(y, m, d, H, Mi, S || 0, getImportSpec());
    return new Date(ms).toISOString();
  }

  // Kullanıcının saat diliminde duvar saati -> UTC ISO (manuel giriş için)
  function localWallTimeToIso(y, m, d, H, Mi, S) {
    return new Date(zonedToUtcMs(y, m, d, H, Mi, S || 0, getTz())).toISOString();
  }

  global.WwTime = {
    getSettings: getSettings,
    setSettings: setSettings,
    resetSettings: resetSettings,
    getTz: getTz,
    deviceTz: deviceTz,
    isValidTz: isValidTz,
    getImportSpec: getImportSpec,
    parseMs: parseMs,
    classify: classify,
    dateKey: dateKey,
    todayKey: todayKey,
    keyOfInstant: keyOfInstant,
    addDays: addDays,
    addMonths: addMonths,
    dowOfKey: dowOfKey,
    rangeStartKey: rangeStartKey,
    previousRangeKeys: previousRangeKeys,
    pseudoUtcSeconds: pseudoUtcSeconds,
    dateFromKey: dateFromKey,
    hourOf: hourOf,
    dowOf: dowOf,
    formatTime: formatTime,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    formatOffset: formatOffset,
    offsetLabel: offsetLabel,
    offsetMinutes: offsetMinutes,
    partsInTz: partsInTz,
    zonedToUtcMs: zonedToUtcMs,
    importWallTimeToIso: importWallTimeToIso,
    localWallTimeToIso: localWallTimeToIso,
    STORAGE_KEY: STORAGE_KEY,
    DEFAULTS: DEFAULTS
  };
})(typeof window !== 'undefined' ? window : this);
