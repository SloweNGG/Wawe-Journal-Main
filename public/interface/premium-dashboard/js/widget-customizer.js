// ============================================================
// widget-customizer.js - Kart ⚙ menüsü ve "Özelleştir" paneli
// ⚙ menüsü: kartın boyutu, yüksekliği, grafik tipi, metrik ve aralığı.
// Özelleştir paneli: sağdan açılan, kategorilere ayrılmış kart kütüphanesi —
// kart ekle / kaldır / ayarla. Tercihler widget-prefs.js ile defter başına saklanır.
// Popover ve panel body'ye eklenir (position: fixed) — grid öğelerinin taşma/z-index sınırlarına takılmaz.
// ============================================================

import { sanitizeHTML } from './helpers.js';
import { clearApexChart, clearLightweightChart, renderChartFor } from './chart-renderers.js';
import {
  buildWidgets,
  getOrderedWidgetKeys,
  getWidgetCategories,
  getWidgetLayout,
  getVisibleWidgetKeys,
  isAnalysisWidget,
  widgetLayoutClasses,
  forceResizeAllCharts
} from './dashboard-manager.js';
import {
  getWidgetPrefs,
  setWidgetPrefs,
  clearWidgetPrefs,
  resetPrefs,
  getWidgetOptionSchema,
  getWidgetOptions,
  isPro,
  FREE_ANALYSIS_QUOTA,
  getKpiDensity,
  setKpiDensity
} from './widget-prefs.js';
import { isPropActive } from './prop-widgets.js';

function _t(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
  } catch (e) {}
  return fallback !== undefined ? fallback : key;
}

var ctx = null;          // { getTrades, rerenderAll }
var popover = null;      // kart ⚙ menüsü (tek paylaşılan eleman)
var popoverState = null; // { key, anchor }
var drawer = null;       // Özelleştir paneli
var backdrop = null;
var drawerFilter = 'all';
var replaceFor = null;   // ücretsiz planda kota doluyken eklenmek istenen kart
var drawerReturnFocus = null;
var prevBodyOverflow = '';

// ⭐ BAŞLAT — renderDashboardDOM ilk çizimde bir kez çağırır
export function initCustomizer(scope, options) {
  ctx = options;

  var grid = document.getElementById('dashboard-grid');
  if (grid) {
    grid.addEventListener('click', function(e) {
      if (e.target.closest('[data-upgrade]')) { openUpgrade(); return; }
      var btn = e.target.closest('[data-widget-settings]');
      if (!btn) return;
      e.stopPropagation();
      var key = btn.getAttribute('data-widget-settings');
      if (popoverState && popoverState.key === key) closePopover();
      else openPopover(btn, key);
    });
  }

  var customizeBtn = document.getElementById('customize-btn');
  if (customizeBtn) {
    customizeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (isDrawerOpen()) closeDrawer();
      else openDrawer(customizeBtn);
    });
  }

  scope.on(document, 'mousedown', function(e) {
    if (!popover || !popoverState) return;
    if (popover.contains(e.target) || popoverState.anchor.contains(e.target)) return;
    closePopover();
  });
  scope.on(document, 'keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (popoverState) {
      var anchor = popoverState.anchor;
      closePopover();
      if (anchor && anchor.isConnected) anchor.focus();
    } else if (isDrawerOpen()) {
      closeDrawer();
    }
  });
  // position: fixed popover kaydırmada çapasından kopmasın
  scope.on(window, 'scroll', function() { if (popoverState) positionPopover(); }, { passive: true });
  scope.on(window, 'resize', function() { if (popoverState) closePopover(); });
  scope.onLeave(function() {
    closePopover();
    closeDrawer();
    [popover, drawer, backdrop].forEach(function(el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    popover = drawer = backdrop = null;
    ctx = null;
  });
}

// ============================================================
// ⚙ KART MENÜSÜ (popover)
// ============================================================
function ensurePopover() {
  if (popover && popover.isConnected) return popover;
  popover = document.createElement('div');
  popover.className = 'ww-widget-popover';
  popover.setAttribute('role', 'dialog');
  popover.addEventListener('click', onPopoverClick);
  document.body.appendChild(popover);
  return popover;
}

function openPopover(anchor, key) {
  ensurePopover();
  if (popoverState && popoverState.anchor) popoverState.anchor.setAttribute('aria-expanded', 'false');
  popoverState = { key: key, anchor: anchor };
  document.querySelectorAll('.grid-item.menu-open').forEach(function(el) { el.classList.remove('menu-open'); });
  var item = anchor.closest('.grid-item');
  if (item) item.classList.add('menu-open');
  anchor.setAttribute('aria-expanded', 'true');
  renderPopover();
  popover.classList.add('open');
  positionPopover();
}

export function closePopover() {
  if (popoverState && popoverState.anchor) popoverState.anchor.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.grid-item.menu-open').forEach(function(el) { el.classList.remove('menu-open'); });
  popoverState = null;
  if (popover) popover.classList.remove('open');
}

function positionPopover() {
  if (!popover || !popoverState) return;
  var anchor = popoverState.anchor;
  if (!anchor.isConnected) { closePopover(); return; }
  var r = anchor.getBoundingClientRect();
  var pw = popover.offsetWidth;
  var ph = popover.offsetHeight;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var margin = 8;

  var left = Math.min(Math.max(margin, r.right - pw), vw - pw - margin);
  var top = r.bottom + 6;
  if (top + ph > vh - margin && r.top - ph - 6 > margin) top = r.top - ph - 6; // aşağı sığmazsa yukarı aç
  popover.style.left = left + 'px';
  popover.style.top = Math.max(margin, top) + 'px';
}

function renderPopover() {
  if (!popoverState) return;
  popover.innerHTML = widgetMenuHtml(popoverState.key);
  positionPopover();
}

function segHtml(attr, current, choices) {
  return '<div class="wwp-seg" ' + attr + '>' + choices.map(function(c) {
    var active = String(c.value) === String(current);
    return '<button type="button" data-value="' + sanitizeHTML(String(c.value)) + '" class="' + (active ? 'active' : '') + '" aria-pressed="' + active + '">' + sanitizeHTML(c.label) + '</button>';
  }).join('') + '</div>';
}

function sectionHtml(label, body) {
  return '<div class="wwp-section"><div class="wwp-label">' + sanitizeHTML(label) + '</div>' + body + '</div>';
}

function widgetMenuHtml(key) {
  var w = buildWidgets()[key];
  if (!w) return '';
  var html = '<div class="wwp-head"><span class="wwp-title">' + sanitizeHTML(w.title) + '</span></div>';

  var layout = getWidgetLayout(key, w);
  html += sectionHtml(_t('premium_dash.opt.size', 'Genişlik'), segHtml('data-layout="size"', layout.size, [
    { value: 'sm',   label: '1/4' },
    { value: 'md',   label: '2/4' },
    { value: 'lg',   label: '3/4' },
    { value: 'full', label: _t('premium_dash.opt.size_full', 'Tam') }
  ]));
  html += sectionHtml(_t('premium_dash.opt.height', 'Yükseklik'), segHtml('data-layout="height"', layout.height, [
    { value: 'normal', label: _t('premium_dash.opt.height_normal', 'Normal') },
    { value: 'tall',   label: _t('premium_dash.opt.height_tall', 'Uzun') }
  ]));

  var values = getWidgetOptions(key);
  getWidgetOptionSchema(key).forEach(function(opt) {
    if (opt.when && !opt.when(values)) return;
    html += sectionHtml(opt.label, segHtml('data-opt="' + opt.id + '"', values[opt.id], opt.choices));
  });

  html += '<div class="wwp-foot">' +
    '<button type="button" class="wwp-link" data-action="reset-widget">' + sanitizeHTML(_t('premium_dash.reset_widget', 'Varsayılana dön')) + '</button>' +
    '<button type="button" class="wwp-danger" data-action="hide-widget">' + sanitizeHTML(_t('premium_dash.hide_widget', 'Gizle')) + '</button>' +
  '</div>';
  return html;
}

function onPopoverClick(e) {
  if (!popoverState) return;
  var key = popoverState.key;

  var segBtn = e.target.closest('.wwp-seg button');
  if (segBtn) {
    var seg = segBtn.parentNode;
    var value = segBtn.getAttribute('data-value');
    if (seg.hasAttribute('data-layout')) {
      var patch = {};
      patch[seg.getAttribute('data-layout')] = value;
      setWidgetPrefs(key, patch);
      applyLayout(key);
    } else if (seg.hasAttribute('data-opt')) {
      setOption(key, seg.getAttribute('data-opt'), value);
    }
    renderPopover();
    return;
  }

  var actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  var action = actionBtn.getAttribute('data-action');

  if (action === 'hide-widget') {
    closePopover();
    hideWidget(key);
    toast(_t('premium_dash.widget_hidden_toast', 'Kart kaldırıldı. "Özelleştir" panelinden geri ekleyebilirsin.'));
  } else if (action === 'reset-widget') {
    // Görünürlük korunur; boyut ve grafik ayarları varsayılana döner
    var hidden = getWidgetPrefs(key).hidden;
    clearWidgetPrefs(key);
    if (typeof hidden === 'boolean') setWidgetPrefs(key, { hidden: hidden });
    applyLayout(key);
    updateTitle(key);
    redrawChart(key);
    renderPopover();
  }
}

function setOption(key, id, rawValue) {
  var opt = getWidgetOptionSchema(key).filter(function(o) { return o.id === id; })[0];
  if (!opt) return;
  var choice = opt.choices.filter(function(c) { return String(c.value) === rawValue; })[0];
  if (!choice) return;
  var options = Object.assign({}, getWidgetPrefs(key).options || {});
  options[id] = choice.value;
  setWidgetPrefs(key, { options: options });
  updateTitle(key);
  redrawChart(key);
}

function gridItem(key) {
  return document.querySelector('#dashboard-grid .grid-item[data-widget="' + key + '"]');
}

function applyLayout(key) {
  var el = gridItem(key);
  var w = buildWidgets()[key];
  if (!el || !w) return;
  var keep = el.classList.contains('menu-open') ? ' menu-open' : '';
  el.className = 'grid-item ' + widgetLayoutClasses(key, w) + keep;
  // Boyut değişince tüm satır akışı değişebilir: bu grafiği yeniden çiz, diğerlerini yeniden boyutlandır
  requestAnimationFrame(function() {
    redrawChart(key);
    forceResizeAllCharts();
    positionPopover();
  });
}

function updateTitle(key) {
  var el = gridItem(key);
  var h3 = el && el.querySelector('.grid-header h3');
  var w = buildWidgets()[key];
  if (!h3 || !w) return;
  h3.textContent = w.title;
  if (w.i18nKey) h3.setAttribute('data-i18n', w.i18nKey);
  else h3.removeAttribute('data-i18n');
}

function redrawChart(key) {
  if (!ctx || key === 'strategies') return;
  renderChartFor(key, ctx.getTrades());
}

function hideWidget(key) {
  setWidgetPrefs(key, { hidden: true });
  if (key === 'cumulative') clearLightweightChart();
  else clearApexChart(key);
  var el = gridItem(key);
  if (el && el.parentNode) el.parentNode.removeChild(el);
  setTimeout(forceResizeAllCharts, 50);
  if (ctx && typeof ctx.onLayoutChange === 'function') ctx.onLayoutChange();
}

// ============================================================
// ⭐ ÖZELLEŞTİR PANELİ (sağdan açılan kart kütüphanesi)
// ============================================================
var ICONS = {
  area: '<path d="M4 30 L14 22 L22 26 L32 14 L44 8" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 30 L14 22 L22 26 L32 14 L44 8 L44 36 L4 36 Z" fill="var(--accent)" opacity="0.18"/>',
  bar: '<rect x="6" y="20" width="6" height="14" rx="1.5" fill="var(--green)"/><rect x="16" y="12" width="6" height="22" rx="1.5" fill="var(--green)"/><rect x="26" y="24" width="6" height="10" rx="1.5" fill="var(--red)"/><rect x="36" y="8" width="6" height="26" rx="1.5" fill="var(--green)"/>',
  hbar: '<rect x="6" y="7" width="32" height="6" rx="1.5" fill="var(--accent)"/><rect x="6" y="17" width="22" height="6" rx="1.5" fill="var(--accent)" opacity="0.75"/><rect x="6" y="27" width="14" height="6" rx="1.5" fill="var(--accent)" opacity="0.5"/>',
  donut: '<circle cx="24" cy="20" r="12" fill="none" stroke="var(--red)" stroke-width="6"/><circle cx="24" cy="20" r="12" fill="none" stroke="var(--green)" stroke-width="6" stroke-dasharray="52 100" transform="rotate(-90 24 20)"/>',
  table: '<rect x="5" y="7" width="38" height="5" rx="1.5" fill="var(--muted)" opacity="0.5"/><rect x="5" y="16" width="26" height="4" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="34" y="16" width="9" height="4" rx="1.5" fill="var(--green)"/><rect x="5" y="24" width="22" height="4" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="34" y="24" width="9" height="4" rx="1.5" fill="var(--green)"/><rect x="5" y="32" width="24" height="4" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="34" y="32" width="9" height="4" rx="1.5" fill="var(--red)"/>',
  calendar: (function() {
    var colors = ['var(--green)', 'var(--red)', 'var(--border)', 'var(--green)', 'var(--border)', 'var(--green)', 'var(--red)', 'var(--green)', 'var(--border)', 'var(--green)', 'var(--green)', 'var(--red)', 'var(--border)', 'var(--green)', 'var(--green)'];
    var s = '';
    colors.forEach(function(c, i) {
      s += '<rect x="' + (5 + (i % 5) * 8) + '" y="' + (8 + Math.floor(i / 5) * 9) + '" width="6.5" height="7" rx="1.5" fill="' + c + '"' + (c === 'var(--border)' ? '' : ' opacity="0.8"') + '/>';
    });
    return s;
  })(),
  insight: '<path d="M24 6a9 9 0 0 0-5 16.5V26h10v-3.5A9 9 0 0 0 24 6z" fill="var(--accent)" opacity="0.2" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/><line x1="20" y1="30" x2="28" y2="30" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/><line x1="21.5" y1="34" x2="26.5" y2="34" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/><circle cx="38" cy="10" r="2.2" fill="var(--green)"/><circle cx="10" cy="14" r="1.8" fill="var(--accent2)"/>',
  propsum: '<rect x="4" y="6" width="40" height="7" rx="2" fill="var(--muted)" opacity="0.35"/><rect x="4" y="18" width="8" height="3" rx="1.5" fill="var(--green)"/><rect x="14" y="18" width="8" height="3" rx="1.5" fill="#f59e0b"/><rect x="24" y="18" width="8" height="3" rx="1.5" fill="var(--accent)"/><rect x="34" y="18" width="8" height="3" rx="1.5" fill="var(--accent)" opacity="0.6"/><rect x="4" y="25" width="8" height="2" rx="1" fill="var(--border)"/><rect x="14" y="25" width="8" height="2" rx="1" fill="var(--border)"/><rect x="24" y="25" width="8" height="2" rx="1" fill="var(--border)"/><rect x="34" y="25" width="8" height="2" rx="1" fill="var(--border)"/>',
  shield: '<path d="M24 5l13 5v9c0 9-6 14-13 17-7-3-13-8-13-17v-9z" fill="var(--green)" opacity="0.18" stroke="var(--green)" stroke-width="2" stroke-linejoin="round"/><polyline points="18 20 22.5 24.5 30 17" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  floor: '<polyline points="4 12 14 16 22 13 30 22 38 19 44 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linejoin="round"/><line x1="4" y1="32" x2="44" y2="32" stroke="#f59e0b" stroke-width="2.2" stroke-dasharray="4 3"/>',
  target: '<circle cx="24" cy="20" r="14" fill="none" stroke="#a78bfa" stroke-width="2.2"/><circle cx="24" cy="20" r="8" fill="none" stroke="#a78bfa" stroke-width="2.2"/><circle cx="24" cy="20" r="2.6" fill="#a78bfa"/>',
  days: '<rect x="8" y="8" width="32" height="26" rx="3" fill="none" stroke="#38bdf8" stroke-width="2.2"/><line x1="8" y1="15" x2="40" y2="15" stroke="#38bdf8" stroke-width="2.2"/><rect x="13" y="20" width="6" height="5" rx="1" fill="#38bdf8"/><rect x="21" y="20" width="6" height="5" rx="1" fill="#38bdf8" opacity="0.5"/><rect x="29" y="20" width="6" height="5" rx="1" fill="var(--border)"/>',
  goal: '<circle cx="24" cy="20" r="14" fill="none" stroke="var(--border)" stroke-width="5"/><circle cx="24" cy="20" r="14" fill="none" stroke="var(--green)" stroke-width="5" stroke-linecap="round" stroke-dasharray="62 100" transform="rotate(-90 24 20)"/><circle cx="24" cy="20" r="3" fill="var(--accent)"/>',
  list: '<rect x="5" y="7" width="6" height="5" rx="1.5" fill="var(--muted)" opacity="0.6"/><rect x="14" y="8" width="18" height="3" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="35" y="8" width="8" height="3" rx="1.5" fill="var(--green)"/><rect x="5" y="17" width="6" height="5" rx="1.5" fill="var(--muted)" opacity="0.6"/><rect x="14" y="18" width="15" height="3" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="35" y="18" width="8" height="3" rx="1.5" fill="var(--red)"/><rect x="5" y="27" width="6" height="5" rx="1.5" fill="var(--muted)" opacity="0.6"/><rect x="14" y="28" width="17" height="3" rx="1.5" fill="var(--text)" opacity="0.6"/><rect x="35" y="28" width="8" height="3" rx="1.5" fill="var(--green)"/>',
  drawdown: '<line x1="4" y1="10" x2="44" y2="10" stroke="var(--muted)" stroke-dasharray="2 2" opacity="0.6"/><path d="M4 10 L12 10 L18 22 L24 16 L30 30 L38 12 L44 10" fill="none" stroke="var(--red)" stroke-width="2.2" stroke-linejoin="round"/><path d="M4 10 L12 10 L18 22 L24 16 L30 30 L38 12 L44 10 Z" fill="var(--red)" opacity="0.18"/>',
  streak: (function() {
    var seq = ['g', 'g', 'r', 'g', 'g', 'g', 'r', 'r', 'g', 'g'];
    var s = '';
    seq.forEach(function(c, i) {
      s += '<circle cx="' + (6 + (i % 5) * 9) + '" cy="' + (13 + Math.floor(i / 5) * 12) + '" r="3.4" fill="var(--' + (c === 'g' ? 'green' : 'red') + ')"/>';
    });
    return s;
  })()
};

function iconSvg(name) {
  return '<svg viewBox="0 0 48 40" aria-hidden="true">' + (ICONS[name] || ICONS.bar) + '</svg>';
}

function isDrawerOpen() {
  return !!(drawer && drawer.classList.contains('open'));
}

function ensureDrawer() {
  if (drawer && drawer.isConnected) return;
  backdrop = document.createElement('div');
  backdrop.className = 'ww-drawer-backdrop';
  backdrop.addEventListener('click', closeDrawer);

  drawer = document.createElement('aside');
  drawer.className = 'ww-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-labelledby', 'ww-drawer-title');
  drawer.addEventListener('click', onDrawerClick);

  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
}

function openDrawer(returnFocusEl) {
  closePopover();
  ensureDrawer();
  drawerReturnFocus = returnFocusEl || null;
  renderDrawer();
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  // Bir sonraki karede aç ki geçiş animasyonu çalışsın
  requestAnimationFrame(function() {
    backdrop.classList.add('open');
    drawer.classList.add('open');
    var closeBtn = drawer.querySelector('.wwd-close');
    if (closeBtn) closeBtn.focus();
  });
  var btn = document.getElementById('customize-btn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  if (!isDrawerOpen()) return;
  drawer.classList.remove('open');
  backdrop.classList.remove('open');
  document.body.style.overflow = prevBodyOverflow;
  var btn = document.getElementById('customize-btn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (drawerReturnFocus && drawerReturnFocus.isConnected) drawerReturnFocus.focus();
  drawerReturnFocus = null;
}

var CLOSE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
var PLUS_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

// Ücretsiz plan kota göstergesi: ●●○ 2/3 — kilit yok, seçim hakkı anlatılır
function quotaHtml(used) {
  var dots = '';
  for (var i = 0; i < FREE_ANALYSIS_QUOTA; i++) dots += '<span class="wwd-quota-dot' + (i < used ? ' on' : '') + '"></span>';
  return '<div class="wwd-quota">' +
    '<div class="wwd-quota-top">' +
      '<span class="wwd-quota-label">' + sanitizeHTML(_t('premium_dash.quota.label', 'Analiz kartların')) + '</span>' +
      '<span class="wwd-quota-dots" aria-hidden="true">' + dots + '</span>' +
      '<span class="wwd-quota-n">' + Math.min(used, FREE_ANALYSIS_QUOTA) + '/' + FREE_ANALYSIS_QUOTA + '</span>' +
    '</div>' +
    '<div class="wwd-quota-text">' +
      sanitizeHTML(_t('premium_dash.quota.text', 'Ücretsiz planda istediğin {n} analiz kartını seçip kullanabilirsin.').replace('{n}', FREE_ANALYSIS_QUOTA)) +
      ' <button type="button" class="wwd-link" data-upgrade="quota">' + sanitizeHTML(_t('premium_dash.quota.cta', 'Pro ile sınırsız →')) + '</button>' +
    '</div>' +
  '</div>';
}

// Kota doluyken: "Bu kartı hangisinin yerine ekleyelim?"
function replacePanelHtml(key, widgets, activeAnalysis) {
  var opts = activeAnalysis.map(function(k) {
    return '<button type="button" class="wwd-replace-opt" data-replace="' + k + '" data-with="' + key + '">' +
      '<span class="wwd-replace-ico">' + iconSvg(widgets[k].icon) + '</span>' + sanitizeHTML(widgets[k].title) + '</button>';
  }).join('');
  return '<div class="wwd-replace" role="group">' +
    '<div class="wwd-replace-title">' + sanitizeHTML(_t('premium_dash.replace.title', '3 analiz kartın da kullanımda')) + '</div>' +
    '<div class="wwd-replace-text">' + sanitizeHTML(_t('premium_dash.replace.text', '"{name}" kartını hangisinin yerine ekleyelim?').replace('{name}', widgets[key].title)) + '</div>' +
    '<div class="wwd-replace-opts">' + opts + '</div>' +
    '<div class="wwd-replace-foot">' +
      '<button type="button" class="wwd-btn wwd-btn--add" data-upgrade="replace">' + sanitizeHTML(_t('premium_dash.replace.pro', 'Pro ile hepsini kullan')) + '</button>' +
      '<button type="button" class="wwd-link" data-cancel-replace>' + sanitizeHTML(_t('premium_dash.replace.cancel', 'Vazgeç')) + '</button>' +
    '</div>' +
  '</div>';
}

function renderDrawer() {
  if (!drawer) return;
  var widgets = buildWidgets();
  var keys = getOrderedWidgetKeys(widgets).filter(function(k) { return !widgets[k].propOnly || isPropActive(); });
  var categories = getWidgetCategories();
  var visibleKeys = getVisibleWidgetKeys(widgets);
  var isOn = function(k) { return visibleKeys.indexOf(k) !== -1; };
  var visibleCount = visibleKeys.length;
  var activeAnalysis = visibleKeys.filter(function(k) { return isAnalysisWidget(widgets[k]); });
  var free = !isPro();
  var scrollTop = drawer.querySelector('.wwd-body') ? drawer.querySelector('.wwd-body').scrollTop : 0;

  var chips = [{ id: 'all', label: _t('premium_dash.cat.all', 'Tümü'), n: keys.length }].concat(categories.map(function(c) {
    return { id: c.id, label: c.label, n: keys.filter(function(k) { return widgets[k].category === c.id; }).length };
  })).filter(function(c) { return c.id === 'all' || c.n > 0; }).map(function(c) {
    var active = drawerFilter === c.id;
    return '<button type="button" class="wwd-chip' + (active ? ' active' : '') + '" data-filter="' + c.id + '" aria-pressed="' + active + '">' +
      sanitizeHTML(c.label) + ' <span class="wwd-chip-n">' + c.n + '</span></button>';
  }).join('');

  var sections = categories.filter(function(c) {
    return drawerFilter === 'all' || drawerFilter === c.id;
  }).map(function(c) {
    var catKeys = keys.filter(function(k) { return widgets[k].category === c.id; });
    if (!catKeys.length) return '';
    var onCount = catKeys.filter(isOn).length;
    var cards = catKeys.map(function(k) {
      var w = widgets[k];
      var on = isOn(k);
      var actions = on
        ? '<button type="button" class="wwd-btn wwd-btn--ghost" data-configure="' + k + '">' + sanitizeHTML(_t('premium_dash.configure', 'Ayarla')) + '</button>' +
          '<button type="button" class="wwd-btn wwd-btn--remove" data-remove="' + k + '">' + sanitizeHTML(_t('premium_dash.remove', 'Kaldır')) + '</button>'
        : '<button type="button" class="wwd-btn wwd-btn--add" data-add="' + k + '">' + PLUS_ICON + sanitizeHTML(_t('premium_dash.add', 'Ekle')) + '</button>';
      return '<div class="wwd-card' + (on ? ' is-on' : '') + '">' +
        '<div class="wwd-thumb">' + iconSvg(w.icon) + '</div>' +
        '<div class="wwd-info">' +
          '<div class="wwd-title">' + sanitizeHTML(w.title) +
            (on ? ' <span class="wwd-on-badge">' + sanitizeHTML(_t('premium_dash.on_dashboard', 'Panoda')) + '</span>' : '') +
            (free && isAnalysisWidget(w) ? ' <span class="wwd-tier">' + sanitizeHTML(_t('premium_dash.tier_analysis', 'Analiz')) + '</span>' : '') +
          '</div>' +
          '<div class="wwd-desc">' + sanitizeHTML(w.desc || '') + '</div>' +
        '</div>' +
        '<div class="wwd-actions">' + actions + '</div>' +
        (replaceFor === k ? replacePanelHtml(k, widgets, activeAnalysis) : '') +
      '</div>';
    }).join('');
    return '<section class="wwd-cat">' +
      '<h3 class="wwd-cat-title">' + sanitizeHTML(c.label) + '<span class="wwd-cat-count">' + onCount + '/' + catKeys.length + '</span></h3>' +
      '<div class="wwd-list">' + cards + '</div>' +
    '</section>';
  }).join('');

  drawer.innerHTML =
    '<header class="wwd-head">' +
      '<div>' +
        '<h2 id="ww-drawer-title" class="wwd-heading">' + sanitizeHTML(_t('premium_dash.customize_title', 'Dashboard\'u özelleştir')) + '</h2>' +
        '<p class="wwd-sub">' + sanitizeHTML(_t('premium_dash.customize_hint', 'Kartları ⠿ ile sürükleyip sırala, ⚙ ile boyut ve grafik ayarlarını değiştir.')) + '</p>' +
      '</div>' +
      '<button type="button" class="wwd-close" aria-label="' + sanitizeHTML(_t('common.close', 'Kapat')) + '">' + CLOSE_ICON + '</button>' +
    '</header>' +
    viewOptionsHtml() +
    '<div class="wwd-chips">' + chips + '</div>' +
    (free ? quotaHtml(activeAnalysis.length) : '') +
    '<div class="wwd-body">' + sections + '</div>' +
    '<footer class="wwd-foot">' +
      '<span class="wwd-foot-count">' + sanitizeHTML(_t('premium_dash.cards_on', '{n} kart panoda').replace('{n}', visibleCount)) + '</span>' +
      '<button type="button" class="wwp-link" data-action="reset-all">' + sanitizeHTML(_t('premium_dash.reset_layout', 'Düzeni Sıfırla')) + '</button>' +
    '</footer>';

  var body = drawer.querySelector('.wwd-body');
  if (body) body.scrollTop = scrollTop;
}

// Panelin üstündeki görünüm seçenekleri: üst istatistikler detaylı / ince
function viewOptionsHtml() {
  var current = getKpiDensity();
  var opts = [
    { value: 'full', label: _t('premium_dash.density_full', 'Detaylı') },
    { value: 'compact', label: _t('premium_dash.density_compact', 'İnce') }
  ];
  return '<div class="wwd-view">' +
    '<span class="wwd-view-label">' + sanitizeHTML(_t('premium_dash.kpi_density', 'Üst istatistikler')) + '</span>' +
    '<div class="wwp-seg wwd-view-seg">' + opts.map(function(o) {
      var active = o.value === current;
      return '<button type="button" data-density="' + o.value + '" class="' + (active ? 'active' : '') + '" aria-pressed="' + active + '">' + sanitizeHTML(o.label) + '</button>';
    }).join('') + '</div>' +
  '</div>';
}

function onDrawerClick(e) {
  var t = e.target;
  if (t.closest('.wwd-close')) { closeDrawer(); return; }

  var densityBtn = t.closest('[data-density]');
  if (densityBtn) {
    setKpiDensity(densityBtn.getAttribute('data-density'));
    renderDrawer();
    return;
  }

  var chip = t.closest('[data-filter]');
  if (chip) {
    drawerFilter = chip.getAttribute('data-filter');
    renderDrawer();
    var body = drawer.querySelector('.wwd-body');
    if (body) body.scrollTop = 0;
    return;
  }

  if (t.closest('[data-upgrade]')) { openUpgrade(); return; }

  if (t.closest('[data-cancel-replace]')) { replaceFor = null; renderDrawer(); return; }

  var replaceBtn = t.closest('[data-replace]');
  if (replaceBtn) {
    var oldKey = replaceBtn.getAttribute('data-replace');
    var newKey = replaceBtn.getAttribute('data-with');
    setWidgetPrefs(oldKey, { hidden: true });
    setWidgetPrefs(newKey, { hidden: false });
    replaceFor = null;
    if (ctx) ctx.rerenderAll();
    renderDrawer();
    flashWidget(newKey);
    var ws = buildWidgets();
    toast(_t('premium_dash.replace.done', '"{old}" yerine "{name}" eklendi')
      .replace('{old}', ws[oldKey].title).replace('{name}', ws[newKey].title), 'success');
    return;
  }

  var add = t.closest('[data-add]');
  if (add) {
    var key = add.getAttribute('data-add');
    var widgetsNow = buildWidgets();
    // Ücretsiz planda kota doluysa kilit yerine seçim sunulur
    if (!isPro() && isAnalysisWidget(widgetsNow[key])) {
      var activeCount = getVisibleWidgetKeys(widgetsNow).filter(function(k) { return isAnalysisWidget(widgetsNow[k]); }).length;
      if (activeCount >= FREE_ANALYSIS_QUOTA) {
        replaceFor = key;
        renderDrawer();
        var panel = drawer.querySelector('.wwd-replace');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }
    replaceFor = null;
    setWidgetPrefs(key, { hidden: false });
    if (ctx) ctx.rerenderAll();
    renderDrawer();
    flashWidget(key);
    toast(_t('premium_dash.card_added_toast', '"{name}" panoya eklendi').replace('{name}', buildWidgets()[key].title), 'success');
    return;
  }

  var remove = t.closest('[data-remove]');
  if (remove) {
    hideWidget(remove.getAttribute('data-remove'));
    renderDrawer();
    return;
  }

  var configure = t.closest('[data-configure]');
  if (configure) {
    var cKey = configure.getAttribute('data-configure');
    closeDrawer();
    var el = gridItem(cKey);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Kaydırma bitince kartın ⚙ menüsünü aç
    setTimeout(function() {
      var gear = el.querySelector('[data-widget-settings]');
      if (gear) openPopover(gear, cKey);
    }, 450);
    return;
  }

  if (t.closest('[data-action="reset-all"]')) {
    resetPrefs();
    if (ctx) ctx.rerenderAll();
    renderDrawer();
    toast(_t('premium_dash.layout_reset_done', 'Düzen sıfırlandı'), 'success');
  }
}

// Yeni eklenen kartı görünür yap ve kısa süre vurgula (panel sağ tarafı kapladığı için kart sol/ortada görünür)
function flashWidget(key) {
  var el = gridItem(key);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('just-added');
  setTimeout(function() { if (el.isConnected) el.classList.remove('just-added'); }, 1800);
}

// Mevcut yükseltme penceresini aç (panel açıksa önce kapat)
function openUpgrade() {
  closePopover();
  closeDrawer();
  if (typeof window.openUpgradeModal === 'function') window.openUpgradeModal({ feature: 'premium_dashboard' });
}

function toast(msg, type) {
  if (typeof showToast === 'function') showToast(msg, type);
}
