// ============================================================
// prop-widgets.js - Prop firm kartları ve başlık kimliği
// Veri: premium-dashboard.astro içindeki prop betiği window.__wwPropState olarak yayınlar
// ('ww:prop-state' olayı). Burada yalnızca çizim yapılır; pencereler (uyarılar, faz geçişi)
// betikteki window.wwPropOpenNotices / window.wwPropOpenAdvance ile açılır.
//
// Varsayılan: tek "Prop Hesap Durumu" kartı (prop-summary) — hesap kimliği, bilgi satırı,
// kural durumu ve dört kural tek kartta. Dört ayrı kart panelden eklenebilir (varsayılan gizli).
// ============================================================

import { formatCurrency, sanitizeHTML } from './helpers.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

function lang() {
  try {
    if (window.i18n && typeof window.i18n.getCurrentLanguage === 'function') return window.i18n.getCurrentLanguage();
  } catch (e) {}
  return 'tr';
}

// Taze durum (betik yayınlayınca) yoksa bu defterin son bilinen durumu localStorage'dan okunur:
// kart açılışta hemen çizilir, taze hesap gelince sessizce güncellenir (eskiden ~1-2 sn boş kalıyordu).
var PROP_CACHE_PREFIX = 'ww_prop_state_';
var cachedRaw = null;
var cachedParsed = null;
function cachedPropState() {
  try {
    var jid = window.journal && window.journal.getActiveJournalId ? window.journal.getActiveJournalId() : null;
    if (!jid) return null;
    var raw = localStorage.getItem(PROP_CACHE_PREFIX + jid);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedParsed = raw ? JSON.parse(raw) : null;
    }
    return cachedParsed && cachedParsed.active ? cachedParsed : null;
  } catch (e) {
    return null;
  }
}

export function propState() {
  if (typeof window === 'undefined') return null;
  return window.__wwPropState || cachedPropState();
}

// Durum henüz gelmediyse önceki ziyaretten kalan bilgiyle tahmin edilir (kartlar sonradan belirip düzeni kaydırmasın)
export function isPropActive() {
  var s = propState();
  if (s) return !!s.active;
  try {
    var jid = window.journal && window.journal.getActiveJournalId ? window.journal.getActiveJournalId() : null;
    return !!jid && sessionStorage.getItem('ww_is_prop_' + jid) === '1';
  } catch (e) {
    return false;
  }
}

// Başlıktaki bilgi satırı (defter · dönem · işlem sayısı · son işlem) birleşik kartta da gösterilir
var headerMetaHtml = '';
export function setHeaderMetaHtml(html) {
  headerMetaHtml = html || '';
  var el = document.getElementById('ps-meta');
  if (el) el.innerHTML = headerMetaHtml;
}

function money(v) {
  return formatCurrency(v).replace(/^\+/, '');
}

function fmtPct(p) {
  var n = (Number(p) || 0).toFixed(1).replace(/\.0$/, '');
  return lang() === 'tr' ? '%' + n : n + '%';
}

// "{pct}" yer tutuculu çeviriler: yüzde işaretinin yeri çevirinin kendisinde
function pctLabel(key, fallback, p) {
  return _t(key, fallback).replace('{pct}', (Number(p) || 0).toFixed(1).replace(/\.0$/, ''));
}

function esc(v) {
  return sanitizeHTML(String(v)).replace(/"/g, '&quot;');
}

var GREEN = 'var(--green, #22c55e)';
var RED = 'var(--red, #ef4444)';
var AMBER = '#f59e0b';
var ACCENT = 'var(--accent, #8b5cf6)';

function signedColor(v) {
  return v > 0 ? GREEN : (v < 0 ? RED : '');
}

// ⭐ KURAL MODELİ — dört kuralın değer, rozet, çubuk ve alt bilgileri (tek kart ve ayrı kartlar ortak kullanır)
// tone: 'ok' | 'warn' | 'bad' | 'info' — değer yalnızca uyarı/ihlalde renklenir (sade görünüm)
function ruleModels(s) {
  var d = s.daily, m = s.maxLoss, g = s.target, days = s.days;
  var dailyTone = d.remaining <= 0 ? 'bad' : (d.consumedPct > 75 ? 'warn' : 'ok');
  var floorTone = m.distance <= 0 ? 'bad' : (m.distancePct <= 25 ? 'warn' : 'ok');
  var hasTarget = g.amount > 0;
  var daysWord = _t('prop.days', 'gün');
  return [
    {
      key: 'prop-daily',
      label: _t('prop.today_margin', 'Bugünün Kalan Marjı'),
      value: money(d.remaining),
      tone: dailyTone,
      badge: d.consumedPct === 0 ? _t('prop.full_margin', 'Tam Marj') : pctLabel('prop.margin_remaining_badge', '%{pct} Kalan', d.remainingPct),
      bar: d.remaining <= 0 ? 100 : Math.max(4, d.remainingPct),
      barColor: dailyTone === 'bad' ? RED : (dailyTone === 'warn' ? AMBER : GREEN),
      foot: [
        [_t('prop.limit', 'Limit'), money(d.limit)],
        [_t('prop.today', 'Bugün'), formatCurrency(d.todayPnl), signedColor(d.todayPnl)]
      ]
    },
    {
      key: 'prop-maxloss',
      label: _t('prop.max_loss_floor', 'Maksimum Kayıp Zemini'),
      value: money(m.stop),
      tone: floorTone,
      badge: pctLabel('prop.safety_badge', '%{pct} Güvenlik', m.distancePct),
      bar: m.distance <= 0 ? 100 : Math.min(100, Math.max(6, Math.round(m.distancePct * 5))),
      barColor: floorTone === 'bad' ? RED : (floorTone === 'warn' ? AMBER : GREEN),
      foot: [
        [_t('prop.floor_distance', 'Zemine Kalan'), formatCurrency(m.distance), m.distance > 0 ? GREEN : RED],
        [_t('prop.stop_level', 'Stop'), fmtPct(m.distancePct)]
      ]
    },
    {
      key: 'prop-target',
      label: _t('prop.target', 'Kâr Hedefi'),
      value: hasTarget ? money(g.amount) : esc(_t('prop.no_target', 'Hedef yok')),
      tone: g.amount > 0 && g.remaining <= 0 ? 'ok' : 'info',
      badge: hasTarget ? fmtPct(g.pct) : _t('prop.unlimited', 'Sınırsız'),
      bar: hasTarget ? g.pct : 0,
      barColor: ACCENT,
      foot: [
        [_t('prop.remaining', 'Kalan'), g.remaining <= 0 ? esc(_t('prop.target_completed', 'Tamamlandı')) : money(g.remaining)],
        [_t('prop.earned', 'Kazanılan'), formatCurrency(g.earned), signedColor(g.earned)]
      ]
    },
    {
      key: 'prop-days',
      label: _t('prop.trading_days_balance', 'İşlem Günü / Bakiye'),
      value: days.count + (days.min ? ' / ' + days.min : '') + ' ' + esc(daysWord),
      tone: 'info',
      badge: days.min > 0 ? fmtPct(days.pct) : _t('prop.no_requirement', 'Şart yok'),
      bar: days.pct,
      barColor: ACCENT,
      foot: [
        [_t('prop.balance', 'Bakiye'), money(s.currentBalance)],
        [_t('prop.starting', 'Başlangıç'), money(s.startBalance)]
      ]
    }
  ];
}

function toneColor(tone) {
  return tone === 'bad' ? RED : (tone === 'warn' ? AMBER : 'var(--text)');
}

function barHtml(r) {
  return '<div class="pw-bar"><span style="width:' + Math.max(0, Math.min(100, r.bar)).toFixed(1) + '%;background:' + r.barColor + '"></span></div>';
}

function footHtml(r, cls) {
  return '<div class="' + cls + '">' + r.foot.map(function(f) {
    return '<span class="pw-foot-item"><span class="pw-foot-label">' + esc(f[0]) + '</span>' +
      '<span class="pw-foot-val"' + (f[2] ? ' style="color:' + f[2] + '"' : '') + '>' + f[1] + '</span></span>';
  }).join('') + '</div>';
}

// Ayrı kart: değer + rozet, çubuk, alt bilgi
function singleCardHtml(r) {
  return '<div class="pw">' +
    '<div class="pw-head">' +
      '<span class="pw-value" style="color:' + toneColor(r.tone) + '">' + r.value + '</span>' +
      '<span class="pw-badge">' + esc(r.badge) + '</span>' +
    '</div>' +
    barHtml(r) +
    footHtml(r, 'pw-foot') +
  '</div>';
}

// ⭐ Kural durumu rozeti + aksiyon butonları (birleşik kartta veya başlıkta)
function healthHtml(s) {
  var cls, text;
  if (s.invalid) { cls = 'failed'; text = _t('prop.status_invalid_rules', 'Kural Hatası'); }
  else if (s.health === 'failed') { cls = 'failed'; text = _t('prop.status_failed', 'Limit İhlali'); }
  else if (s.status === 'passed') { cls = 'safe'; text = _t('prop.status_passed', 'Hedefe Ulaşıldı'); }
  else if (s.health === 'warning') { cls = 'warning'; text = _t('prop.hud_warning', 'Risk Uyarısı'); }
  else { cls = 'safe'; text = _t('prop.hud_safe', 'Tüm Kurallar Güvende'); }
  return '<span class="ph-health ' + cls + '"><span class="ph-health-dot"></span>' + esc(text) + '</span>';
}

function actionsHtml(s, btnClass) {
  if (s.invalid) return '';
  var html = '';
  if (s.warningsCount > 0) {
    html += '<button type="button" class="' + btnClass + '" data-prop-action="notices">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
      '<span>' + s.warningsCount + ' ' + esc(_t('prop.alerts_capsule_title', 'Uyarı')) + '</span></button>';
  }
  if (s.hasNextPhase) {
    html += '<button type="button" class="' + btnClass + '" data-prop-action="advance">' +
      '<span>' + esc(_t('prop.advance_phase_btn', 'Sonraki Faza Geç')) + '</span>' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>';
  }
  return html;
}

function bindActions(el) {
  el.onclick = function(e) {
    var btn = e.target.closest('[data-prop-action]');
    if (!btn) return;
    var a = btn.getAttribute('data-prop-action');
    if (a === 'notices' && typeof window.wwPropOpenNotices === 'function') window.wwPropOpenNotices();
    if (a === 'advance' && typeof window.wwPropOpenAdvance === 'function') window.wwPropOpenAdvance();
  };
}

function identityHtml(s) {
  var parts = [];
  if (s.phaseName) parts.push(esc(s.phaseName));
  if (!s.invalid && s.startBalance) parts.push(money(s.startBalance) + ' ' + esc(_t('prop.account_short', 'Hesap')));
  return '<img class="ps-logo" src="' + esc(s.firm.logo) + '" alt="" width="18" height="18" />' +
    '<span class="ps-firm" style="color:' + esc(s.firm.color) + '">' + esc(s.firm.name) + '</span>' +
    parts.map(function(p) { return '<span class="ps-sep">·</span><span class="ps-id-part">' + p + '</span>'; }).join('');
}

// ⭐ BİRLEŞİK KART: kimlik + bilgi satırı + durum/aksiyonlar, altında dört kural sütunu
function summaryHtml(s) {
  var top =
    '<div class="ps-top">' +
      '<div class="ps-titles">' +
        '<div class="ps-id">' + identityHtml(s) + '</div>' +
        '<div class="ps-meta ph-meta" id="ps-meta">' + headerMetaHtml + '</div>' +
      '</div>' +
      '<div class="ps-actions">' + healthHtml(s) + actionsHtml(s, 'ps-btn') + '</div>' +
    '</div>';

  if (s.invalid) {
    return '<div class="ps">' + top +
      '<div class="pw-note pw-note--error">' +
        esc(_t('prop.err_invalid_rules_desc', 'Hesap kuralları geçersiz') + ' (' + s.errorCode + '). ' +
          _t('prop.err_fix_in_journals', 'Lütfen defter ayarlarından kuralları düzenleyin.')) +
      '</div></div>';
  }

  var cols = ruleModels(s).map(function(r) {
    return '<div class="ps-col">' +
      '<div class="ps-col-head"><span class="ps-label">' + esc(r.label) + '</span><span class="ps-badge">' + esc(r.badge) + '</span></div>' +
      '<div class="ps-value" style="color:' + toneColor(r.tone) + '">' + r.value + '</div>' +
      barHtml(r) +
      footHtml(r, 'ps-foot') +
    '</div>';
  }).join('');

  return '<div class="ps">' + top + '<div class="ps-grid">' + cols + '</div></div>';
}

var SINGLE_KEYS = ['prop-daily', 'prop-maxloss', 'prop-target', 'prop-days'];
export var PROP_WIDGET_KEYS = ['prop-summary'].concat(SINGLE_KEYS);

export function renderPropWidget(key) {
  var el = document.getElementById('chart-' + key);
  if (!el || PROP_WIDGET_KEYS.indexOf(key) === -1) return;
  var s = propState();
  if (!s) {
    el.innerHTML = '<div class="pw-skeleton" role="status" aria-label="' + esc(_t('premium_dash.prop.loading', 'Prop hesabı yükleniyor…')) + '"></div>';
    return;
  }
  if (!s.active) {
    el.innerHTML = '';
    return;
  }
  if (key === 'prop-summary') {
    el.innerHTML = summaryHtml(s);
    bindActions(el);
    return;
  }
  if (s.invalid) {
    el.innerHTML = '<div class="pw-note pw-note--error">' +
      esc(_t('prop.err_invalid_rules_desc', 'Hesap kuralları geçersiz') + ' (' + s.errorCode + '). ' +
        _t('prop.err_fix_in_journals', 'Lütfen defter ayarlarından kuralları düzenleyin.')) + '</div>';
    return;
  }
  var model = ruleModels(s).filter(function(r) { return r.key === key; })[0];
  el.innerHTML = model ? singleCardHtml(model) : '';
}

export function renderPropWidgets() {
  PROP_WIDGET_KEYS.forEach(renderPropWidget);
}

// Kümülatif K/Z grafiği için hedef ve stop seviyeleri — grafiğin son değerine göre göreli
// (grafik seçili dönemin K/Z'sini 0'dan çizer; "hedefe X kaldı" bu çizgiye eklenir)
export function propChartLevels(lastValue) {
  var s = propState();
  if (!s || !s.active || s.invalid) return [];
  var lines = [];
  if (s.target.amount > 0 && s.target.remaining > 0) {
    lines.push({ price: lastValue + s.target.remaining, color: '#22c55e', title: _t('prop.target', 'Kâr Hedefi') });
  }
  if (s.maxLoss.distance > 0) {
    lines.push({ price: lastValue - s.maxLoss.distance, color: '#ef4444', title: _t('premium_dash.prop.stop_line', 'Maks. kayıp') });
  }
  return lines;
}

// ⭐ BAŞLIK
// Birleşik kart panodaysa kimlik, durum, aksiyonlar ve bilgi satırı kartta gösterilir; başlık sade kalır.
// Kart gizlenmişse (ayrı kartlar kullanılıyorsa) kimlik/durum/aksiyonlar başlığa çıkar.
var DEFAULT_EYEBROW = null;
export function renderPropHeader() {
  var eyebrow = document.getElementById('ph-eyebrow');
  var badge = document.getElementById('premium-prop-badge');
  var actions = document.getElementById('ph-prop-actions');
  var pageHeader = document.querySelector('#main-content .page-header');
  if (!eyebrow) return;
  if (DEFAULT_EYEBROW === null || !eyebrow.classList.contains('is-prop')) DEFAULT_EYEBROW = eyebrow.innerHTML;

  var s = propState();
  var summaryOnBoard = !!document.querySelector('#dashboard-grid .grid-item[data-widget="prop-summary"]');
  var showInHeader = !!(s && s.active) && !summaryOnBoard;

  if (pageHeader) pageHeader.classList.toggle('has-prop-card', summaryOnBoard && isPropActive());

  if (!showInHeader) {
    if (eyebrow.classList.contains('is-prop')) {
      eyebrow.classList.remove('is-prop');
      eyebrow.innerHTML = DEFAULT_EYEBROW;
    }
    if (badge) badge.innerHTML = '';
    if (actions) actions.innerHTML = '';
    return;
  }

  eyebrow.classList.add('is-prop');
  eyebrow.innerHTML = identityHtml(s);
  if (badge) badge.innerHTML = healthHtml(s);
  if (actions) {
    actions.innerHTML = actionsHtml(s, 'ph-btn');
    bindActions(actions);
  }
}
