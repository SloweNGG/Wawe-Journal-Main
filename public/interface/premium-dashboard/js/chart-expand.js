// ============================================================
// chart-expand.js - GRAFİK BÜYÜTME
// Grafik kartına tıklayınca grafik ortak büyütme penceresinde (window.WwChartViewer,
// shared/chart-viewer.js) açılır — ana dashboard ve strateji sayfasıyla aynı davranış.
// Görüntüleyicide sayfadaki görünür grafikler arasında (kart sırasıyla) ← → ile gezilir.
// Grafik, kartın çizim fonksiyonuyla (renderChartInto) yeniden çizilir; kartın grafiği yerinde kalır.
// ============================================================

import { renderChartInto, EXPANDABLE_CHARTS } from './chart-renderers.js';

export function isExpandable(key) {
  return EXPANDABLE_CHARTS.indexOf(key) !== -1;
}

// Sayfadaki büyütülebilir kartlar, ekrandaki sırayla
function visibleChartItems() {
  var items = [];
  document.querySelectorAll('#dashboard-grid .grid-item[data-widget]').forEach(function (item) {
    var key = item.getAttribute('data-widget');
    if (!isExpandable(key) || item.offsetParent === null) return;
    var h = item.querySelector('.grid-header h3');
    items.push({ key: key, title: h ? h.textContent.trim() : key });
  });
  return items;
}

export function openExpanded(key, getTrades) {
  var viewer = window.WwChartViewer;
  if (!viewer || !isExpandable(key)) return;
  var items = visibleChartItems();
  var index = 0;
  items.forEach(function (it, i) { if (it.key === key) index = i; });
  if (!items.length) return;
  viewer.open({
    items: items,
    index: index,
    render: function (el, item) {
      return renderChartInto(item.key, getTrades(), el);
    }
  });
}

/* Kartlara tıklamayı bağlar. getTrades: o anki filtreli işlem listesini verir.
   scope: sayfanın SPA kapsamı (scope.on / scope.onLeave) — çıkışta görüntüleyici kapanır. */
export function initChartExpand(scope, getTrades) {
  // Kümülatif grafikte sürükleyerek gezinme bitince gelen tıklama görüntüleyiciyi açmasın
  var downX = 0, downY = 0;
  scope.on(document, 'pointerdown', function (e) { downX = e.clientX; downY = e.clientY; });

  scope.on(document, 'click', function (e) {
    if (!e.target || !e.target.closest) return;
    var wrap = e.target.closest('.grid-item[data-widget] .chart-wrap');
    if (!wrap) return;
    if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
    // Kart içindeki buton, bağlantı, form elemanı ve grafik lejantı kendi işini yapsın
    if (e.target.closest('button, a, input, select, textarea, label, .apexcharts-legend, .apexcharts-toolbar')) return;
    var item = wrap.closest('.grid-item[data-widget]');
    var key = item.getAttribute('data-widget');
    if (!isExpandable(key)) return;
    if (item.classList.contains('sortable-chosen') || item.classList.contains('sortable-ghost')) return;
    openExpanded(key, getTrades);
  });

  scope.onLeave(function () {
    if (window.WwChartViewer) window.WwChartViewer.close();
  });
}
