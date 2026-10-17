// ============================================================
// widget-prefs.js - Kullanıcının widget tercihleri
// Sıra, boyut, yükseklik, gizli widget'lar ve grafik ayarları (tip, metrik, aralık).
// Defter başına localStorage'da tutulur. Eski format (sadece sıra dizisi) otomatik taşınır.
// dashboard-manager.js ve chart-renderers.js ikisi de buradan okur (döngüsel import olmasın diye ayrı modül).
// ============================================================

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

// ⭐ PLAN — 'pro' tüm kartlar sınırsız; 'free' analiz kartlarında kota (kilit gösterilmez, seçim yaptırılır)
export var FREE_ANALYSIS_QUOTA = 3;
var plan = 'pro';
var planPreview = false;

// preview: Pro kullanıcı ücretsiz planı önizliyor — düzen ayrı anahtarda tutulur, gerçek düzen bozulmaz
export function setPlan(p, opts) {
  plan = p === 'free' ? 'free' : 'pro';
  planPreview = !!(opts && opts.preview);
}

export function isPro() {
  return plan === 'pro';
}

export function isPlanPreview() {
  return planPreview;
}

// ⭐ ÜST İSTATİSTİKLER GÖRÜNÜMÜ — 'full' (detaylı) | 'compact' (ince). Defterden bağımsız.
var KPI_DENSITY_KEY = 'ww_premium_kpi_density';

export function getKpiDensity() {
  try {
    return localStorage.getItem(KPI_DENSITY_KEY) === 'compact' ? 'compact' : 'full';
  } catch (e) {
    return 'full';
  }
}

export function setKpiDensity(value) {
  try { localStorage.setItem(KPI_DENSITY_KEY, value === 'compact' ? 'compact' : 'full'); } catch (e) {}
  applyKpiDensity();
}

// #main-content üzerinde sınıf: KPI kartları ve şeridi CSS ile incelir
export function applyKpiDensity() {
  var main = document.getElementById('main-content');
  if (main) main.classList.toggle('kpi-compact', getKpiDensity() === 'compact');
}

function storageKey() {
  return 'ww_premium_layout_' + (window.journal ? window.journal.getActiveJournalId() : '') + (planPreview ? ':free-preview' : '');
}

// ⭐ GRAFİK SEÇENEKLERİ ŞEMASI — ayar menüsü ve renderer'lar bu tek kaynaktan okur
function metricChoices() {
  return [
    { value: 'pnl',     label: _t('premium_dash.opt.metric_pnl', 'Toplam K/Z') },
    { value: 'avg',     label: _t('premium_dash.opt.metric_avg', 'Ort. K/Z') },
    { value: 'count',   label: _t('premium_dash.opt.metric_count', 'İşlem sayısı') },
    { value: 'winrate', label: _t('premium_dash.opt.metric_winrate', 'Win rate') }
  ];
}

export function getWidgetOptionSchema(key) {
  var typeLabel = _t('premium_dash.opt.type', 'Grafik tipi');
  var metricLabel = _t('premium_dash.opt.metric', 'Metrik');
  var daysFmt = _t('premium_dash.opt.range_days', '{n} gün');
  var hoursFmt = _t('premium_dash.opt.bucket_hours', '{n} saat');

  switch (key) {
    case 'cumulative':
      return [
        { id: 'type', label: typeLabel, default: 'area', choices: [
          { value: 'area',     label: _t('premium_dash.opt.type_area', 'Alan') },
          { value: 'line',     label: _t('premium_dash.opt.type_line', 'Çizgi') },
          { value: 'baseline', label: _t('premium_dash.opt.type_baseline', '±0 Renkli') }
        ]}
      ];
    case 'winloss':
      return [
        { id: 'type', label: typeLabel, default: 'donut', choices: [
          { value: 'donut', label: _t('premium_dash.opt.type_donut', 'Halka') },
          { value: 'pie',   label: _t('premium_dash.opt.type_pie', 'Pasta') },
          { value: 'bar',   label: _t('premium_dash.opt.type_bar', 'Bar') }
        ]}
      ];
    case 'direction':
      return [
        // Long/Short için varsayılan görünüm adet dağılımıdır
        { id: 'metric', label: metricLabel, default: 'count', choices: metricChoices() },
        // Halka/pasta sadece adet dağılımında anlamlı (K/Z negatif olabilir)
        { id: 'type', label: typeLabel, default: 'donut', when: function(o) { return o.metric === 'count'; }, choices: [
          { value: 'donut', label: _t('premium_dash.opt.type_donut', 'Halka') },
          { value: 'pie',   label: _t('premium_dash.opt.type_pie', 'Pasta') },
          { value: 'bar',   label: _t('premium_dash.opt.type_bar', 'Bar') }
        ]}
      ];
    case 'daily':
      return [
        { id: 'range', label: _t('premium_dash.opt.range', 'Aralık'), default: 30, choices: [7, 14, 30, 90].map(function(n) {
          return { value: n, label: daysFmt.replace('{n}', n) };
        })},
        { id: 'type', label: typeLabel, default: 'bar', choices: [
          { value: 'bar',  label: _t('premium_dash.opt.type_bar', 'Bar') },
          { value: 'line', label: _t('premium_dash.opt.type_line', 'Çizgi') },
          { value: 'area', label: _t('premium_dash.opt.type_area', 'Alan') }
        ]}
      ];
    case 'hourly':
      return [
        { id: 'metric', label: metricLabel, default: 'pnl', choices: metricChoices() },
        { id: 'bucket', label: _t('premium_dash.opt.bucket', 'Saat aralığı'), default: 3, choices: [1, 2, 3, 4].map(function(n) {
          return { value: n, label: hoursFmt.replace('{n}', n) };
        })}
      ];
    case 'symbol':
    case 'dow':
    case 'lot':
      return [
        { id: 'metric', label: metricLabel, default: 'pnl', choices: metricChoices() }
      ];
    case 'monthly':
      return [
        { id: 'metric', label: metricLabel, default: 'pnl', choices: metricChoices() },
        { id: 'range', label: _t('premium_dash.opt.range', 'Aralık'), default: 12, choices: [6, 12, 24].map(function(n) {
          return { value: n, label: _t('premium_dash.opt.range_months', '{n} ay').replace('{n}', n) };
        })}
      ];
    case 'calendar':
      return [
        { id: 'month', label: _t('premium_dash.opt.month', 'Ay'), default: 'current', choices: [
          { value: 'current',  label: _t('premium_dash.opt.month_current', 'Bu ay') },
          { value: 'previous', label: _t('premium_dash.opt.month_previous', 'Geçen ay') }
        ]}
      ];
    default:
      return [];
  }
}

// ⭐ OKU / YAZ
export function loadPrefs() {
  var prefs = { order: null, widgets: {} };
  try {
    var raw = localStorage.getItem(storageKey());
    if (!raw) return prefs;
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      prefs.order = parsed; // eski format: sadece sıra
    } else if (parsed && typeof parsed === 'object') {
      prefs.order = Array.isArray(parsed.order) ? parsed.order : null;
      prefs.widgets = (parsed.widgets && typeof parsed.widgets === 'object') ? parsed.widgets : {};
    }
  } catch (e) {}
  return prefs;
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ v: 1, order: prefs.order, widgets: prefs.widgets }));
  } catch (e) {}
}

export function resetPrefs() {
  try { localStorage.removeItem(storageKey()); } catch (e) {}
}

export function saveOrder(order) {
  var prefs = loadPrefs();
  // Gizli widget'lar DOM'da olmadığından sıraya girmez; önceki sıradaki yerleri kaybolmasın diye sona eklenir
  var hidden = (prefs.order || []).filter(function(k) {
    return order.indexOf(k) === -1 && prefs.widgets[k] && prefs.widgets[k].hidden;
  });
  prefs.order = order.concat(hidden);
  savePrefs(prefs);
}

export function getWidgetPrefs(key) {
  return loadPrefs().widgets[key] || {};
}

export function setWidgetPrefs(key, patch) {
  var prefs = loadPrefs();
  var current = prefs.widgets[key] || {};
  Object.keys(patch).forEach(function(k) {
    if (patch[k] === undefined) delete current[k];
    else current[k] = patch[k];
  });
  prefs.widgets[key] = current;
  savePrefs(prefs);
}

export function clearWidgetPrefs(key) {
  var prefs = loadPrefs();
  delete prefs.widgets[key];
  savePrefs(prefs);
}

// ⭐ Grafik seçeneği: kullanıcı tercihi (geçerliyse) yoksa şemadaki varsayılan
export function getWidgetOptions(key) {
  var stored = getWidgetPrefs(key).options || {};
  var result = {};
  getWidgetOptionSchema(key).forEach(function(opt) {
    var v = stored[opt.id];
    var valid = opt.choices.some(function(c) { return c.value === v; });
    result[opt.id] = valid ? v : opt.default;
  });
  return result;
}

export function widgetOpt(key, id) {
  return getWidgetOptions(key)[id];
}
