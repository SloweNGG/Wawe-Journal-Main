// ============================================================
// dashboard-manager.js - Widgets, drag-drop, skeleton, strategy, export
// ⭐ FIX: buildWidgets() height alanları kaldırıldı
// ⭐ FIX: renderWidgets() inline height kaldırıldı
// ⭐ FIX: Kullanılmayan currentUser ve allTrades kaldırıldı
// ⭐ FIX: strategy-empty-note zenginleştirildi
// ⭐ FIX: injectSkeletonMarkup() dinamik hale getirildi (widget'larla eşleşir)
// ⭐ FIX: Skeleton boyutları gerçek widget boyutlarıyla uyumlu
// ⭐ FIX: forceResizeAllCharts() - LWC v4 resize düzeltildi
// ⭐ FIX: forceResizeAllCharts() - Apex resize'da var shadowing giderildi
// ⭐ FIX (YENİ): buildWidgets() sırası optimize edildi - grid-auto-flow:dense
//        KALDIRILDI (SortableJS ile çakışıyordu). Bunun yerine default sıra
//        ile boş sütunlar minimuma indirildi.
// ============================================================

// ⭐ Logger — global wwLog'a fallback ile bağlan
const wwLog = (typeof window !== 'undefined' && window.wwLog) 
  ? window.wwLog 
  : { log: () => {}, warn: () => {}, info: () => {}, debug: () => {}, error: console.error.bind(console) };

import {
  sanitizeHTML,
  sanitizeURL,
  calcTradePnL,
  formatCurrency,
  formatCurrencyPDF,
  bellEmptyStateHtml
} from './helpers.js';

import {
  renderCharts,
  getCharts,
  updateChartTheme,
  clearAllApexCharts,
  clearLightweightChart
} from './chart-renderers.js';

// ⭐ GLOBAL DEĞİŞKENLER
var LAYOUT_KEY = 'ww_premium_layout';
var sortableInstance = null;
var isDragging = false;
var resizeTimeout = null;
var isResizing = false;
var allStrategies = [];
var chartRafId = null;

// ⭐ OVERTRADE
var OVERTRADE_READ_KEY = 'ww_overtrade_read_signature';
var currentOvertradeSignature = '';

// ⭐ SKELETON
export function showSkeletons() {
  var ids = ['premium-stats-skeleton','dashboard-skeleton'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = (id === 'dashboard-skeleton' ? 'grid' : 'grid');
  });
  var hideIds = ['premium-stats-grid','dashboard-grid'];
  hideIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

export function hideSkeletons() {
  var ids = ['premium-stats-skeleton','dashboard-skeleton'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var showIds = ['premium-stats-grid','dashboard-grid'];
  showIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'grid';
  });
  setTimeout(forceResizeAllCharts, 200);
}

// ⭐ DINAMIK SKELETON - widget'larla birebir eşleşir
export function injectSkeletonMarkup() {
  var main = document.getElementById('main-content');
  if (!main) return;

  var widgets = buildWidgets();
  var savedOrder = loadLayoutOrder();
  var widgetKeys = Object.keys(widgets);

  var orderedKeys = widgetKeys;
  if (savedOrder && savedOrder.length) {
    orderedKeys = savedOrder.filter(function(k) { return widgetKeys.indexOf(k) !== -1; });
    var missing = widgetKeys.filter(function(k) { return orderedKeys.indexOf(k) === -1; });
    orderedKeys = orderedKeys.concat(missing);
  }

  // ⭐ Skeleton grid HTML'ini oluştur
  var gridHtml = '';
  orderedKeys.forEach(function(key) {
    var w = widgets[key];
    var baseClass = 'generic-skeleton-block';
    var extraClasses = w.class || '';
    var isDoughnut = w.doughnut || false;

    // Doughnut widget'lar için farklı skeleton
    if (isDoughnut) {
      gridHtml += '\n        <div class="generic-skeleton-block ' + extraClasses + '" data-widget="' + key + '" style="display:flex;align-items:center;justify-content:center;">\n          <div class="skeleton-doughnut"></div>\n        </div>\n      ';
    } else {
      // Normal widget skeleton - class'ları koru (wide, tall, full)
      gridHtml += '\n        <div class="generic-skeleton-block ' + extraClasses + '" data-widget="' + key + '"></div>\n      ';
    }
  });

  // ⭐ 5 KPI skeleton (value + label)
  var statsSkeletonHtml = '';
  for (var i = 0; i < 5; i++) {
    statsSkeletonHtml += '\n      <div class="skeleton-stat">\n        <div class="skeleton-line" style="height:20px;"></div>\n        <div class="skeleton-line" style="width:60%;height:10px;"></div>\n      </div>\n    ';
  }

  main.innerHTML = '\n    <div class="premium-stats-skeleton" id="premium-stats-skeleton">\n      ' + statsSkeletonHtml + '\n    </div>\n    <div class="dashboard-skeleton" id="dashboard-skeleton">\n      ' + gridHtml + '\n    </div>\n  ';
}

// ⭐ LAYOUT
export function saveLayoutOrder() {
  try {
    var items = document.querySelectorAll('.grid-item');
    var order = [];
    items.forEach(function(el) { order.push(el.dataset.widget); });
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(order));
  } catch(e) {}
}

export function loadLayoutOrder() {
  try {
    var saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return null;
}

export function resetLayout() {
  try {
    localStorage.removeItem(LAYOUT_KEY);
    if (typeof showToast === 'function') {
      showToast('✅ Düzen sıfırlandı! Sayfa yenileniyor...', 'success');
    }
    setTimeout(function() { window.location.reload(); }, 800);
  } catch(e) {
    if (typeof showToast === 'function') {
      showToast('Düzen sıfırlanamadı.', 'error');
    }
  }
}

// ⭐ DRAG DROP
export function initDragDrop() {
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  if (sortableInstance) {
    try { sortableInstance.destroy(); } catch(e) {}
    sortableInstance = null;
  }

  if (typeof Sortable !== 'undefined') {
    sortableInstance = new Sortable(grid, {
      animation: 300,
      handle: '.drag-handle',
      ghostClass: 'sortable-ghost',
      onStart: function() { isDragging = true; },
      onEnd: function() {
        isDragging = false;
        setTimeout(forceResizeAllCharts, 300);
        saveLayoutOrder();
      }
    });
  }
}

// ⭐ FORCE RESIZE
export function forceResizeAllCharts() {
  if (isResizing) return;
  isResizing = true;

  if (resizeTimeout) {
    cancelAnimationFrame(resizeTimeout);
    resizeTimeout = null;
  }

  resizeTimeout = setTimeout(function() {
    var charts = getCharts();

    // ⭐ APEXCHARTS RESIZE
    Object.keys(charts.apex).forEach(function(key) {
      var instance = charts.apex[key];
      if (instance && typeof instance.resize === 'function') {
        // ⭐ FIX: var ismi shadowing'i önlemek için apexEl olarak değiştirildi
        var apexEl = instance.container || instance.el;
        if (apexEl && apexEl.isConnected) {
          var rect = apexEl.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            instance.resize(rect.width, rect.height);
          }
        }
      }
    });

    // ⭐ LIGHTWEIGHT CHARTS RESIZE (Kümülatif K/Z)
    if (charts.lightweight.cumulative) {
      var lwc = charts.lightweight.cumulative;
      if (lwc.chart && typeof lwc.chart.applyOptions === 'function') {
        // ⭐ FIX: LWC v4'te chart.container public API'de yok → DOM'dan alıyoruz
        var lwcContainer = document.getElementById('chart-cumulative');
        if (lwcContainer) {
          var lwcRect = lwcContainer.getBoundingClientRect();
          if (lwcRect.width > 0 && lwcRect.height > 0) {
            try {
              lwc.chart.applyOptions({ width: lwcRect.width, height: lwcRect.height });
            } catch(e) {}
          }
        }
      }
    }

    isResizing = false;
    resizeTimeout = null;
  }, 200);
}

// ⭐ RENDER PREMIUM STATS
export function renderPremiumStats(trades) {
  try {
    var closed = trades.filter(function(t) { return t.exit_price; });
    var pnls = closed.map(function(t) { return calcTradePnL(t); });
    var totalPnL = pnls.reduce(function(s, v) { return s + v; }, 0);
    var wins = pnls.filter(function(v) { return v > 0; }).length;
    var total = closed.length;
    var wr = total ? (wins/total)*100 : 0;
    var totalWin = pnls.filter(function(v) { return v > 0; }).reduce(function(s, v) { return s + v; }, 0);
    var totalLoss = Math.abs(pnls.filter(function(v) { return v < 0; }).reduce(function(s, v) { return s + v; }, 0));
    var pf = totalLoss > 0 ? totalWin/totalLoss : 0;
    var avgPnL = total ? totalPnL/total : 0;
    var stdDev = total > 1 ? Math.sqrt(pnls.reduce(function(s, v) { return s + Math.pow(v-avgPnL, 2); }, 0)/total) : 0;
    var sharpe = stdDev > 0 ? avgPnL/stdDev : 0;

    var elTotal = document.getElementById('pstat-total');
    var elPnl = document.getElementById('pstat-pnl');
    var elWr = document.getElementById('pstat-wr');
    var elPf = document.getElementById('pstat-pf');
    var elSharpe = document.getElementById('pstat-sharpe');

    if (elTotal) elTotal.textContent = total;
    if (elPnl) { elPnl.textContent = formatCurrency(totalPnL); elPnl.className = 'pstat-value ' + (totalPnL >= 0 ? 'positive' : 'negative'); }
    if (elWr) elWr.textContent = wr.toFixed(1) + '%';
    if (elPf) elPf.textContent = pf.toFixed(2);
    if (elSharpe) elSharpe.textContent = sharpe.toFixed(2);
  } catch(e) {}
}

// ⭐ RENDER KPI BAR
export function renderKpiBar(trades) {
  try {
    var closed = trades.filter(function(t) { return t.exit_price; });
    var pnls = closed.map(function(t) { return calcTradePnL(t); });
    var wins = pnls.filter(function(v) { return v > 0; });
    var losses = pnls.filter(function(v) { return v < 0; });
    var avgWin = wins.length ? wins.reduce(function(s, v) { return s + v; }, 0) / wins.length : 0;
    var avgLoss = losses.length ? Math.abs(losses.reduce(function(s, v) { return s + v; }, 0) / losses.length) : 0;
    var totalWin = wins.reduce(function(s, v) { return s + v; }, 0);
    var totalLoss = Math.abs(losses.reduce(function(s, v) { return s + v; }, 0));
    var pf = totalLoss > 0 ? totalWin / totalLoss : 0;

    var cumulative = 0, maxCumulative = 0, maxDrawdown = 0;
    closed.forEach(function(t) {
      var pnl = calcTradePnL(t);
      cumulative += pnl;
      maxCumulative = Math.max(maxCumulative, cumulative);
      maxDrawdown = Math.min(maxDrawdown, cumulative - maxCumulative);
    });

    var totalRR = 0, rrCount = 0;
    trades.forEach(function(t) { if (t.rr_ratio) { totalRR += parseFloat(t.rr_ratio); rrCount++; } });
    var avgRR = rrCount ? totalRR / rrCount : 0;

    var elAvgWin = document.getElementById('kpi-avg-win');
    var elAvgLoss = document.getElementById('kpi-avg-loss');
    var elPf = document.getElementById('kpi-pf');
    var elDd = document.getElementById('kpi-dd');
    var elRr = document.getElementById('kpi-rr');

    if (elAvgWin) elAvgWin.textContent = formatCurrency(avgWin);
    if (elAvgLoss) elAvgLoss.textContent = formatCurrency(avgLoss);
    if (elPf) elPf.textContent = pf.toFixed(2);
    if (elDd) elDd.textContent = formatCurrency(Math.abs(maxDrawdown));
    if (elRr) elRr.textContent = avgRR.toFixed(2);
  } catch(e) {}
}

// ⭐ BUILD WIDGETS
// ⭐ FIX (YENİ): Widget sırası 4 sütunlu grid'de boşluk bırakmayacak şekilde
//    optimize edildi. grid-auto-flow:dense kaldırıldığı için sıralama önemli.
//    Yerleşim:
//      Satır 1: cumulative (2) + winloss (1) + symbol (1)   → 4 sütun tam dolu
//      Satır 2: daily (2) + direction (1) + hourly (1)      → 4 sütun tam dolu
//      Satır 3: dow (1) + rr (1) + lot (1) + [1 boşluk]     → 3 dolu
//      Satır 4: strategies (4)                               → tam dolu
export function buildWidgets() {
  return {
    'cumulative': {
      title: 'Kümülatif K/Z',
      badge: true,
      badgeId: 'cumulative-change',
      badgeDefault: '↑ +0%',
      template: '<div id="chart-cumulative" class="lwc-chart-container"></div>',
      class: 'wide tall'
    },
    'winloss': {
      title: 'Win / Loss Dağılımı',
      template: '<div id="chart-winloss" style="width:100%;height:100%;"></div>',
      class: '',
      doughnut: true
    },
    'symbol': {
      title: 'Sembol Bazlı Performans',
      template: '<div id="chart-symbol" style="width:100%;height:100%;"></div>',
      class: ''
    },
    'daily': {
      title: 'Günlük K/Z – Son 30 Gün',
      template: '<div id="chart-daily" style="width:100%;height:100%;"></div>',
      class: 'wide'
    },
    'direction': {
      title: 'Long / Short Dağılımı',
      template: '<div id="chart-direction" style="width:100%;height:100%;"></div>',
      class: '',
      doughnut: true
    },
    'hourly': {
      title: 'Saat Bazlı Performans',
      template: '<div id="chart-hourly" style="width:100%;height:100%;"></div>',
      class: ''
    },
    'dow': {
      title: 'Haftanın Günü',
      template: '<div id="chart-dow" style="width:100%;height:100%;"></div>',
      class: ''
    },
    'rr': {
      title: 'R:R Dağılımı',
      template: '<div id="chart-rr" style="width:100%;height:100%;"></div>',
      class: ''
    },
    'lot': {
      title: 'Lot Büyüklüğü',
      template: '<div id="chart-lot" style="width:100%;height:100%;"></div>',
      class: ''
    },
    'strategies': {
      title: 'En İyi Stratejiler',
      template: '<div id="strategy-section-body"></div>',
      class: 'full'
    }
  };
}

// ⭐ RENDER WIDGETS - inline height kaldırıldı
export function renderWidgets() {
  var grid = document.getElementById('dashboard-grid');
  if (!grid) return;

  var widgets = buildWidgets();
  var savedOrder = loadLayoutOrder();
  var widgetKeys = Object.keys(widgets);

  var orderedKeys = widgetKeys;
  if (savedOrder && savedOrder.length) {
    orderedKeys = savedOrder.filter(function(k) { return widgetKeys.indexOf(k) !== -1; });
    var missing = widgetKeys.filter(function(k) { return orderedKeys.indexOf(k) === -1; });
    orderedKeys = orderedKeys.concat(missing);
  }

  var html = '';
  orderedKeys.forEach(function(key) {
    var w = widgets[key];
    var badgeHtml = '';
    if (w.badge) {
      badgeHtml = '<span class="chart-badge" id="' + w.badgeId + '">' + w.badgeDefault + '</span>';
    }
    var doughnutClass = w.doughnut ? ' chart-wrap--doughnut' : '';

    html += '\n      <div class="grid-item ' + (w.class || '') + '" data-widget="' + key + '">\n        <div class="drag-handle">⠿</div>\n        <div class="grid-header">\n          <h3>' + w.title + '</h3>\n          ' + badgeHtml + '\n        </div>\n        <div class="chart-wrap' + doughnutClass + '">\n          ' + w.template + '\n        </div>\n      </div>\n    ';
  });

  grid.innerHTML = html;
  setTimeout(initDragDrop, 100);
}

// ⭐ STRATEGY SECTION
function getSimpleStrategyPerf(strategyId, trades) {
  var strategyTrades = trades.filter(function(t){ return t.strategy_id === strategyId; });
  var closed = strategyTrades.filter(function(t){ return t.exit_price; });
  var totalPnL = 0, wins = 0;
  closed.forEach(function(t) { var p = calcTradePnL(t); totalPnL += p; if (p > 0) wins++; });
  var winRate = closed.length ? Math.round((wins / closed.length) * 1000) / 10 : 0;
  return { totalTrades: strategyTrades.length, closedCount: closed.length, winRate: winRate, totalPnL: totalPnL };
}

export async function loadStrategySection(trades, user) {
  var section = document.getElementById('strategy-section-body');
  if (!section) return;

  if (!user || !user.id) {
    section.innerHTML = '<div class="strategy-empty-note">⚠️ Stratejiler yüklenemiyor. Lütfen sayfayı yenileyin.</div>';
    return;
  }

  try {
    var { data: strategies, error } = await sb
      .from('strategies')
      .select('*')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (error) {
      console.error('Strateji çekme hatası:', error);
      section.innerHTML = '<div class="strategy-empty-note">⚠️ Stratejiler yüklenirken hata oluştu.</div>';
      return;
    }

    allStrategies = strategies || [];

    if (!allStrategies.length) {
      section.innerHTML = `
        <div class="strategy-empty-note" style="padding:1.5rem;text-align:center;display:flex;flex-direction:column;align-items:center;gap:0.5rem;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" style="opacity:0.5;">
            <path d="M22 12h-4l-3 9H9l-3-9H2"/>
            <path d="M5 3h14l-2 6H7L5 3z"/>
          </svg>
          <span style="font-size:13px;color:var(--muted);font-family:'DM Sans',sans-serif;">Henüz strateji eklenmemiş.</span>
          <a href="strategies.html" style="color:var(--accent2);font-size:12px;text-decoration:none;font-weight:500;border:1px solid var(--border);padding:0.2rem 0.8rem;border-radius:20px;transition:all 0.2s;background:var(--surface);" onmouseover="this.style.borderColor='var(--accent)';this.style.background='rgba(139,92,246,0.05)';" onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--surface)';">Strateji oluştur →</a>
        </div>
      `;
      return;
    }

    var strategyData = allStrategies.map(function(s) {
      var perf = getSimpleStrategyPerf(s.id, trades);
      return { ...s, perf: perf };
    });

    strategyData.sort(function(a, b) { return b.perf.totalPnL - a.perf.totalPnL; });

    var maxPnL = Math.max(1, Math.max.apply(null, strategyData.map(function(s) { return Math.abs(s.perf.totalPnL); })));

    var cardsHtml = strategyData.map(function(s, index) {
      var perf = s.perf;
      var rank = index + 1;
      var rankClass = rank === 1 ? 'top' : (rank <= 2 ? 'mid' : 'bottom');
      var progressPct = maxPnL > 0 ? (Math.abs(perf.totalPnL) / maxPnL) * 100 : 0;
      var progressClass = perf.totalPnL >= 0 ? 'pos' : 'neg';

      var displayWinRate = perf.closedCount > 0 ? perf.winRate + '%' : '—';
      var displayPnL = perf.closedCount > 0 ? formatCurrency(perf.totalPnL) : '—';
      var pnlClass = perf.totalPnL >= 0 ? 'pos' : 'neg';

      var safeName = sanitizeHTML(s.name || 'Strateji');

      return '<div class="strategy-premium-card">' +
        '<div class="sp-top">' +
          '<span class="sp-color-bar" style="background:' + s.color + '"></span>' +
          '<span class="sp-name" title="' + safeName + '">' + safeName + '</span>' +
          '<span class="sp-rank ' + rankClass + '">#' + rank + '</span>' +
        '</div>' +
        '<div class="sp-stats">' +
          '<div class="sp-stat"><div class="sp-stat-lbl">İşlem</div><div class="sp-stat-val">' + perf.totalTrades + '</div></div>' +
          '<div class="sp-stat"><div class="sp-stat-lbl">Win Rate</div><div class="sp-stat-val">' + displayWinRate + '</div></div>' +
          '<div class="sp-stat"><div class="sp-stat-lbl">K/Z</div><div class="sp-stat-val ' + pnlClass + '">' + displayPnL + '</div></div>' +
        '</div>' +
        '<div class="sp-progress"><div class="sp-fill ' + progressClass + '" style="width:' + progressPct + '%;"></div></div>' +
      '</div>';
    }).join('');

    section.innerHTML = '<div class="strategy-premium-grid">' + cardsHtml + '</div>';
  } catch(e) {
    console.error('loadStrategySection hatası:', e);
    section.innerHTML = '<div class="strategy-empty-note">⚠️ Strateji verileri yüklenirken hata oluştu. Lütfen sayfayı yenileyin.</div>';
  }
}

// ⭐ OVERTRADE BELL - MARK AS READ
export function markOvertradeAsRead() {
  try {
    if (currentOvertradeSignature) {
      localStorage.setItem(OVERTRADE_READ_KEY, currentOvertradeSignature);
    }
  } catch (e) {}
  var body = document.getElementById('bell-panel-body');
  if (body) body.innerHTML = bellEmptyStateHtml();
  var bellPanel = document.getElementById('bell-panel');
  if (bellPanel) bellPanel.classList.remove('open');
  if (typeof showToast === 'function') showToast('Bildirim okundu olarak işaretlendi');
}

// ⭐ NAVBAR AVATAR
export async function updateNavbarAvatar() {
  var el = document.getElementById('user-avatar');
  if (!el) return;
  try {
    var { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    var { data: profile } = await sb.from('user_profiles').select('avatar_url').eq('id', user.id).single();
    if (profile && profile.avatar_url) {
      var safeUrl = sanitizeURL(profile.avatar_url);
      if (safeUrl) {
        el.innerHTML = '<img src="' + safeUrl + '" alt="avatar">';
        el.style.background = 'transparent';
        el.style.border = '2px solid rgba(255,255,255,0.1)';
      } else {
        var initial = user.user_metadata && user.user_metadata.username ? user.user_metadata.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
        el.textContent = initial;
        el.style.background = 'var(--accent)';
        el.style.border = 'none';
      }
    } else {
      var initial2 = user.user_metadata && user.user_metadata.username ? user.user_metadata.username.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();
      el.textContent = initial2;
      el.style.background = 'var(--accent)';
      el.style.border = 'none';
    }
  } catch(e) {}
}

// ⭐ EXPORT CSV
export function exportCSV(trades) {
  try {
    if (!trades || !trades.length) {
      if (typeof showToast === 'function') showToast('Dışa aktarılacak işlem yok.', 'error');
      return;
    }
    var headers = ['Sembol', 'Yön', 'Enstrüman', 'Lot', 'Giriş', 'Çıkış', 'SL', 'TP', 'K/Z', 'R:R', 'Tarih', 'Not'];
    var rows = trades.map(function(t) {
      var pnl = calcTradePnL(t);
      return [
        sanitizeHTML(t.symbol || ''),
        sanitizeHTML(t.direction || ''),
        sanitizeHTML(t.instrument || ''),
        t.lot || '',
        t.entry_price || '',
        t.exit_price || '',
        t.stop_loss || '',
        t.take_profit || '',
        t.exit_price ? pnl.toFixed(2) : '',
        t.rr_ratio || '',
        t.trade_date || '',
        (t.notes || '').replace(/,/g,';').replace(/\n/g,' ')
      ].join(',');
    });
    var csv = [headers.join(','), rows.join('\n')].join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'wawe-premium-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('CSV indirildi!', 'success');
  } catch(e) {
    if (typeof showToast === 'function') showToast('CSV oluşturulamadı', 'error');
  }
}

// ⭐ EXPORT PDF
export function exportPDF(trades) {
  try {
    if (!trades || !trades.length) {
      if (typeof showToast === 'function') showToast('Dışa aktarılacak işlem yok.', 'error');
      return;
    }
    if (typeof window.jspdf === 'undefined') {
      if (typeof showToast === 'function') showToast('PDF kütüphanesi yüklenemedi.', 'error');
      return;
    }
    var { jsPDF } = window.jspdf;
    var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var W = doc.internal.pageSize.getWidth();
    var H = doc.internal.pageSize.getHeight();

    doc.setFillColor(10, 10, 15);
    doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(139, 92, 246);
    doc.rect(0, 0, W, 3, 'F');
    doc.setTextColor(232, 232, 240);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('WAWE JOURNAL - PREMIUM RAPOR', 12, 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 107, 128);
    doc.text('Premium Dashboard Export', 12, 18);
    doc.text(new Date().toLocaleDateString('tr-TR'), W - 12, 18, { align: 'right' });

    var closed = trades.filter(function(t){ return t.exit_price; });
    var pnls = closed.map(function(t){ return calcTradePnL(t); });
    var totalPnL = pnls.reduce(function(s, v){ return s + v; }, 0);
    var wins = pnls.filter(function(v){ return v > 0; }).length;
    var total = closed.length;
    var wr = total ? Math.round((wins/total)*100) : 0;

    var stats = [
      ['Toplam İşlem', total.toString()],
      ['Toplam K/Z', formatCurrencyPDF(totalPnL)],
      ['Win Rate', wr + '%'],
      ['Kazanan', wins.toString()],
      ['Kaybeden', (total - wins).toString()]
    ];

    var yPos = 28;
    var cellW = (W - 24) / 5;
    stats.forEach(function(s, idx) {
      var cx = 12 + idx * cellW;
      doc.setFillColor(17, 17, 24);
      doc.roundedRect(cx, yPos, cellW - 2, 14, 2, 2, 'F');
      doc.setFillColor(30, 30, 46);
      doc.roundedRect(cx, yPos, cellW - 2, 14, 2, 2, 'S');
      doc.setTextColor(107, 107, 128);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(s[0], cx + (cellW - 2) / 2, yPos + 5, { align: 'center' });
      doc.setTextColor(232, 232, 240);
      doc.setFontSize(9);
      doc.text(s[1], cx + (cellW - 2) / 2, yPos + 12, { align: 'center' });
    });

    yPos += 22;
    doc.setTextColor(139, 92, 246);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('İşlem Detayları', 12, yPos);
    yPos += 5;

    var colDefs = [
      { label: 'Sembol', w: 25 },
      { label: 'Yön', w: 18 },
      { label: 'Lot', w: 16 },
      { label: 'Giriş', w: 26 },
      { label: 'Çıkış', w: 26 },
      { label: 'K/Z', w: 28 },
      { label: 'Tarih', w: 26 }
    ];
    var totalW = colDefs.reduce(function(s, c){ return s + c.w; }, 0);
    var startX = (W - totalW) / 2;

    doc.setFillColor(30, 30, 46);
    doc.rect(startX, yPos, totalW, 6, 'F');
    doc.setTextColor(107, 107, 128);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    var hx = startX + 2;
    colDefs.forEach(function(col) {
      doc.text(col.label, hx, yPos + 4);
      hx += col.w;
    });
    yPos += 6;

    var rowH = 5;
    var maxRows = Math.floor((H - yPos - 15) / rowH);
    var displayTrades = trades.slice(-maxRows).reverse();

    displayTrades.forEach(function(t, idx) {
      var pnl = calcTradePnL(t);
      var isEven = idx % 2 === 0;
      doc.setFillColor(isEven ? 17 : 10, isEven ? 17 : 10, isEven ? 24 : 15);
      doc.rect(startX, yPos, totalW, rowH, 'F');

      var cx2 = startX + 2;
      doc.setTextColor(232, 232, 240);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.text((t.symbol || '—').toUpperCase(), cx2, yPos + 3.5);
      cx2 += colDefs[0].w;
      doc.setTextColor(107, 107, 128);
      doc.setFont('helvetica', 'normal');
      doc.text(t.direction || '—', cx2, yPos + 3.5);
      cx2 += colDefs[1].w;
      doc.text(String(t.lot || '—'), cx2, yPos + 3.5);
      cx2 += colDefs[2].w;
      doc.text(String(t.entry_price || '—'), cx2, yPos + 3.5);
      cx2 += colDefs[3].w;
      if (t.exit_price) {
        doc.text(String(t.exit_price), cx2, yPos + 3.5);
      } else {
        doc.setTextColor(139, 92, 246);
        doc.text('Açık', cx2, yPos + 3.5);
        doc.setTextColor(107, 107, 128);
      }
      cx2 += colDefs[4].w;
      if (t.exit_price) {
        doc.setTextColor(pnl >= 0 ? 34 : 239, pnl >= 0 ? 197 : 68, pnl >= 0 ? 94 : 68);
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrencyPDF(pnl), cx2, yPos + 3.5);
        doc.setTextColor(107, 107, 128);
        doc.setFont('helvetica', 'normal');
      } else {
        doc.text('—', cx2, yPos + 3.5);
      }
      cx2 += colDefs[5].w;
      var dateStr = t.trade_date ? new Date(t.trade_date).toLocaleDateString('tr-TR') : '—';
      doc.text(dateStr, cx2, yPos + 3.5);

      yPos += rowH;
    });

    doc.setDrawColor(30, 30, 46);
    doc.setLineWidth(0.3);
    doc.rect(startX, yPos - displayTrades.length * rowH - 6, totalW, displayTrades.length * rowH + 6, 'S');

    doc.save('wawe-premium-rapor-' + new Date().toISOString().split('T')[0] + '.pdf');
    if (typeof showToast === 'function') showToast('PDF indirildi!', 'success');
  } catch(e) {
    console.error('PDF hatası:', e);
    if (typeof showToast === 'function') showToast('PDF oluşturulamadı', 'error');
  }
}