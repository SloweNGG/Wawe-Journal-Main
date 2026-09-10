// ============================================================
// TRADES - ANA JS DOSYASI
// ============================================================
// Bu dosyada değişen bölümler:
//  - DEĞİŞİKLİK 1: renderStats() — stat kartlarında değer uzunluğuna
//    göre "value-long" / "value-xlong" class'ı eklenir.
//  - DEĞİŞİKLİK 2: initMobileFilterSheets() — mobilde 3 filtre için
//    bottom sheet paneli, çiplerle senkron çalışır.
//  - DEĞİŞİKLİK 3: renderTable() iki kola ayrıldı — buildDesktopTableHTML()
//    ve buildMobileCardsHTML() + toggleCardDetail(). Kart görünümü mobilde
//    (≤768px) otomatik devreye girer, breakpoint geçişinde yeniden render olur.
// ============================================================

(function() {
  'use strict';

  // ============================================================
  // ⭐ TEMA KONTROLÜ - SAYFA YÜKLENİRKEN
  // ============================================================
  
  (function initTheme() {
    var savedTheme = localStorage.getItem('ww_theme');
    var savedFontSize = localStorage.getItem('ww_font_size');
    var customTheme = localStorage.getItem('ww_custom_theme');
    
    if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    
    if (savedFontSize) {
      document.body.style.fontSize = savedFontSize + 'px';
    }
    
    if (savedTheme !== 'light' && customTheme) {
      try {
        var settings = JSON.parse(customTheme);
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) {
          document.body.style.fontSize = settings.fontSize + 'px';
        }
      } catch(e) {}
    }
    
    console.log('🎨 [trades.js] Tema ayarlandı:', savedTheme || 'dark');
  })();

  // ============================================================
  // ⭐ TEMA DEĞİŞİMİNİ DİNLE
  // ============================================================
  
  (function listenThemeChanges() {
    console.log('🎨 [Trades] Tema izleyici başlatıldı...');
    
    window.addEventListener('storage', function(e) {
      if (e.key === 'ww_theme') {
        console.log('🔄 [Trades] Tema değişikliği algılandı:', e.newValue);
        var isLight = e.newValue === 'light';
        document.body.classList.toggle('light-theme', isLight);
        
        var customTheme = localStorage.getItem('ww_custom_theme');
        if (customTheme && !isLight) {
          try {
            var settings = JSON.parse(customTheme);
            var root = document.documentElement;
            if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
            if (settings.surfaceColor) {
              root.style.setProperty('--surface', settings.surfaceColor);
              root.style.setProperty('--surface2', settings.surfaceColor);
            }
            if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
            if (settings.textColor) root.style.setProperty('--text', settings.textColor);
            if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
          } catch(e) {}
        }
        
        if (typeof applyFiltersAndSort === 'function') {
          setTimeout(function() { applyFiltersAndSort(); }, 100);
        }
      }
    });
    
    document.addEventListener('themeChanged', function(e) {
      console.log('🔄 [Trades] ThemeChanged event yakalandı');
      if (e.detail && e.detail.settings && !document.body.classList.contains('light-theme')) {
        var settings = e.detail.settings;
        var root = document.documentElement;
        if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
        if (settings.surfaceColor) {
          root.style.setProperty('--surface', settings.surfaceColor);
          root.style.setProperty('--surface2', settings.surfaceColor);
        }
        if (settings.borderColor) root.style.setProperty('--border', settings.borderColor);
        if (settings.textColor) root.style.setProperty('--text', settings.textColor);
        if (settings.fontSize) document.body.style.fontSize = settings.fontSize + 'px';
        
        if (typeof applyFiltersAndSort === 'function') {
          setTimeout(function() { applyFiltersAndSort(); }, 100);
        }
      }
    });
    
    console.log('✅ [Trades] Tema izleyici yüklendi!');
  })();

  // ============================================================
  // GÜVENLİ ELEMENT ALICI
  // ============================================================
  
  function safeEl(id) {
    var el = document.getElementById(id);
    if (!el) {
      console.warn('⚠️ Element bulunamadı:', id);
    }
    return el;
  }

  // ============================================================
  // STATE
  // ============================================================
  
  var allTrades = [];
  var filteredTrades = [];
  var selectedTrades = new Set();
  var strategyNames = {};
  var strategiesList = [];
  var expandedNotes = new Set();

  // ⭐ PERFORMANS: Strateji isimlerini cache'le
  var strategyNamesCache = {};
  var strategyNamesCacheTime = 0;
  var STRATEGY_NAMES_CACHE_TTL = 300000; // 5 dakika

  // ============================================================
  // PAGINATION DEĞİŞKENLERİ
  // ============================================================
  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var totalItems = 0;

  // ⭐ DEĞİŞİKLİK 3: Mobil/desktop breakpoint takibi
  var _lastIsMobile = window.innerWidth <= 768;

  // ============================================================
  // SKELETON GÖSTER/GİZLE
  // ============================================================
  
  function showTableSkeleton() {
    var el1 = safeEl('stat-skeleton');
    var el2 = safeEl('stat-grid');
    var el3 = safeEl('table-skeleton');
    var el4 = safeEl('table-wrap');
    var el5 = safeEl('pagination-wrap');
    
    if (el1) el1.style.display = 'grid';
    if (el2) el2.style.display = 'none';
    if (el3) el3.style.display = 'block';
    if (el4) el4.style.display = 'none';
    if (el5) el5.style.display = 'none';
  }

  function hideTableSkeleton() {
    var el1 = safeEl('stat-skeleton');
    var el2 = safeEl('stat-grid');
    var el3 = safeEl('table-skeleton');
    var el4 = safeEl('table-wrap');
    var el5 = safeEl('pagination-wrap');
    
    if (el1) el1.style.display = 'none';
    if (el2) el2.style.display = 'grid';
    if (el3) el3.style.display = 'none';
    if (el4) el4.style.display = 'block';
    if (el5) el5.style.display = 'flex';
  }

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  
  function sanitizeHTML(str) {
    if (typeof window.sanitizeHTML === 'function') {
      return window.sanitizeHTML(str);
    }
    if (!str) return '';
    var temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  function formatCurrency(value) {
    if (typeof window.formatCurrency === 'function') {
      return window.formatCurrency(value);
    }
    var num = parseFloat(value) || 0;
    var symbol = typeof getCurrencySymbol === 'function' ? getCurrencySymbol() : '$';
    var formatted = Math.abs(num).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (num >= 0 ? '+' : '-') + symbol + formatted;
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      console.log('📢 Toast:', msg, type);
    }
  }

  function getTradePnL(t) {
    try {
      if (!t.exit_price) return null;
      if (typeof window.calcPnL === 'function') {
        return window.calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, t.instrument, t.multiplier);
      }
      var mult = t.multiplier || 100000;
      var dir = (t.direction === 'LONG' || t.direction === 'BUY') ? 1 : -1;
      return dir * (parseFloat(t.exit_price) - parseFloat(t.entry_price)) * parseFloat(t.lot) * mult;
    } catch(e) {
      return null;
    }
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
      var date = new Date(dateStr);
      var lang = 'en';
      if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
        lang = i18n.getCurrentLanguage();
      }
      var monthNames = {
        tr: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
        en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
      };
      var month = monthNames[lang] ? monthNames[lang][date.getMonth()] : 'Jan';
      return date.getDate() + ' ' + month + ' ' + date.getHours().toString().padStart(2,'0') + ':' + date.getMinutes().toString().padStart(2,'0');
    } catch(e) {
      return '—';
    }
  }

  // ============================================================
  // ⭐ OPTİMİZE EDİLMİŞ STRATEJİ LİSTESİ
  // ============================================================
  
  async function loadStrategyNames() {
    try {
      var now = Date.now();
      if (strategyNamesCacheTime > 0 && (now - strategyNamesCacheTime) < STRATEGY_NAMES_CACHE_TTL) {
        strategiesList = strategyNamesCache.list || [];
        strategyNames = strategyNamesCache.map || {};
        updateStrategySelect();
        return;
      }

      if (typeof requireAuth !== 'function') return;
      var user = await requireAuth();
      if (!user) return;
      
      if (typeof sb === 'undefined') return;
      
      var { data, error } = await sb
        .from('strategies')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (!error && data) {
        strategiesList = data;
        strategyNames = {};
        data.forEach(function(s) { strategyNames[s.id] = s.name; });
        
        strategyNamesCache = {
          list: strategiesList,
          map: strategyNames
        };
        strategyNamesCacheTime = now;
      }
      
      updateStrategySelect();
    } catch (e) {
      console.warn('loadStrategyNames hatası:', e);
    }
  }

  function updateStrategySelect() {
    var strategySelect = safeEl('edit-strategy');
    if (!strategySelect) return;
    
    strategySelect.innerHTML = '<option value="">— Strateji Seç —</option>';
    strategiesList.forEach(function(s) {
      var option = document.createElement('option');
      option.value = s.id;
      option.textContent = sanitizeHTML(s.name);
      strategySelect.appendChild(option);
    });
  }

  // ============================================================
  // DEĞİŞİKLİK 1: Stat değeri için font boyutu uygulayıcı
  // ============================================================
  function applyStatValueSize(el, text, extraCls) {
    if (!el) return;
    el.textContent = text;
    var base = 'stat-card-value' + (extraCls ? ' ' + extraCls : '');
    var len = (text || '').length;
    var sizeCls = '';
    if (len >= 15) sizeCls = ' value-xlong';
    else if (len >= 11) sizeCls = ' value-long';
    el.className = base + sizeCls;
  }

  // ============================================================
  // STATS
  // ============================================================
  
  function renderStats(trades) {
    try {
      var closed = trades.filter(function(t) { return t.exit_price; });
      var pnls = closed.map(function(t) { return getTradePnL(t); });
      var total = pnls.reduce(function(s, v) { return s + (v || 0); }, 0);
      var wins = pnls.filter(function(v) { return v > 0; }).length;
      var wr = closed.length ? Math.round(wins / closed.length * 100) : 0;
      var rrValues = trades.filter(function(t) { return t.rr_ratio; }).map(function(t) { return parseFloat(t.rr_ratio); });
      var avgRR = rrValues.length ? (rrValues.reduce(function(s, v) { return s + v; }, 0) / rrValues.length).toFixed(1) : null;

      // DEĞİŞİKLİK 1: Uzunluğa göre otomatik font küçültme
      var totalEl = safeEl('stat-total');
      if (totalEl) {
        var totalStr = closed.length ? formatCurrency(total) : '—';
        var totalCls = total > 0 ? 'positive' : total < 0 ? 'negative' : '';
        applyStatValueSize(totalEl, totalStr, totalCls);
      }

      var wrEl = safeEl('stat-wr');
      if (wrEl) {
        var wrStr = closed.length ? wr + '%' : '—';
        applyStatValueSize(wrEl, wrStr, '');
      }

      var countEl = safeEl('stat-count');
      if (countEl) {
        applyStatValueSize(countEl, String(trades.length), '');
      }

      var rrEl = safeEl('stat-rr');
      if (rrEl) {
        var rrStr = avgRR ? '1:' + avgRR : '—';
        applyStatValueSize(rrEl, rrStr, '');
      }
    } catch(e) {
      console.warn('renderStats hatası:', e);
    }
  }

  // ============================================================
  // NOTE TOGGLE (masaüstü — tablo not satırı)
  // ============================================================
  
  function toggleNote(tradeId) {
    var noteRow = safeEl('note-row-' + tradeId);
    if (!noteRow) return;
    if (expandedNotes.has(tradeId)) {
      noteRow.style.display = 'none';
      expandedNotes.delete(tradeId);
    } else {
      noteRow.style.display = 'table-row';
      expandedNotes.add(tradeId);
    }
  }
  window.toggleNote = toggleNote;

  // ============================================================
  // DEĞİŞİKLİK 3: Kart detayı toggle (mobil)
  // ============================================================
  function toggleCardDetail(id, btn) {
    var el = document.getElementById('card-detail-' + id);
    if (!el) return;
    var isOpen = el.classList.contains('open');
    if (isOpen) {
      el.classList.remove('open');
      if (btn) btn.classList.remove('open');
    } else {
      el.classList.add('open');
      if (btn) btn.classList.add('open');
    }
  }
  window.toggleCardDetail = toggleCardDetail;

  // ============================================================
  // SEÇİM ÇUBUĞU
  // ============================================================
  
  function updateSelBar() {
    var bar = safeEl('sel-bar');
    var cnt = selectedTrades.size;
    if (cnt > 0) {
      if (bar) bar.classList.add('visible');
      var countEl = safeEl('sel-count-text');
      if (countEl) countEl.textContent = cnt;
      var lang = 'en';
      if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
        lang = i18n.getCurrentLanguage();
      }
      var labelText = 'işlem seçildi';
      if (lang === 'en') labelText = 'trades selected';
      else if (lang === 'de') labelText = 'Trades ausgewählt';
      var labelEl = safeEl('sel-label-text');
      if (labelEl) labelEl.textContent = labelText;
    } else {
      if (bar) bar.classList.remove('visible');
    }
  }

  function toggleSelect(id, checked) {
    if (checked) selectedTrades.add(id);
    else selectedTrades.delete(id);
    updateSelBar();
  }
  window.toggleSelect = toggleSelect;

  function toggleSelectAll(checkbox) {
    var allCheckboxes = document.querySelectorAll('.trade-checkbox');
    allCheckboxes.forEach(function(cb) {
      var id = cb.getAttribute('data-id');
      if (id) {
        cb.checked = checkbox.checked;
        if (checkbox.checked) selectedTrades.add(id);
        else selectedTrades.delete(id);
      }
    });
    updateSelBar();
  }
  window.toggleSelectAll = toggleSelectAll;

  // ============================================================
  // PAGINATION RENDER
  // ============================================================
  
  function renderPagination() {
    var controls = safeEl('pagination-controls');
    var start = (currentPage - 1) * PAGE_SIZE + 1;
    var end = Math.min(currentPage * PAGE_SIZE, totalItems);

    var infoEl = safeEl('pagination-info');
    var showingText = 'Gösterilen';
    var ofText = '/';
    var tradesText = 'işlem';
    
    if (typeof i18n !== 'undefined' && i18n.t) {
      showingText = i18n.t('trades.pagination.showing') || 'Gösterilen';
      ofText = i18n.t('trades.pagination.of') || '/';
      tradesText = i18n.t('trades.pagination.trades') || 'işlem';
    }
    
    if (infoEl) {
      if (totalItems > 0) {
        infoEl.innerHTML = showingText + ' <strong>' + start + '</strong> - <strong>' + end + '</strong> ' + ofText + ' <strong>' + totalItems + '</strong> ' + tradesText;
      } else {
        infoEl.innerHTML = showingText + ' <strong>0</strong> - <strong>0</strong> ' + ofText + ' <strong>0</strong> ' + tradesText;
      }
    }

    var html = '';
    var prevText = '←';
    var nextText = '→';
    if (typeof i18n !== 'undefined' && i18n.t) {
      prevText = i18n.t('trades.pagination.prev') || '←';
      nextText = i18n.t('trades.pagination.next') || '→';
    }
    
    html += '<button class="page-btn arrow" id="page-prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>' + prevText + '</button>';
    
    var maxVisible = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    var endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      html += '<button class="page-btn" data-page="1">1</button>';
      if (startPage > 2) html += '<span class="page-btn ellipsis">…</span>';
    }

    for (var p = startPage; p <= endPage; p++) {
      html += '<button class="page-btn ' + (p === currentPage ? 'active' : '') + '" data-page="' + p + '">' + p + '</button>';
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += '<span class="page-btn ellipsis">…</span>';
      html += '<button class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
    }

    html += '<button class="page-btn arrow" id="page-next" ' + (currentPage >= totalPages ? 'disabled' : '') + '>' + nextText + '</button>';

    if (controls) controls.innerHTML = html;

    controls.querySelectorAll('.page-btn[data-page]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var page = parseInt(this.dataset.page);
        if (page !== currentPage) {
          currentPage = page;
          applyFiltersAndSort();
        }
      });
    });

    var prevBtn = safeEl('page-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        if (currentPage > 1) {
          currentPage--;
          applyFiltersAndSort();
        }
      });
    }

    var nextBtn = safeEl('page-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (currentPage < totalPages) {
          currentPage++;
          applyFiltersAndSort();
        }
      });
    }
  }

  // ============================================================
  // ⭐ OPTİMİZE EDİLMİŞ FİLTRELEME VE SIRALAMA
  // ============================================================
  
  function applyFiltersAndSort() {
    try {
      var sortSelect = safeEl('sort-select');
      var dirFilter = safeEl('dir-filter');
      var resultFilter = safeEl('result-filter');
      
      var sort = sortSelect ? sortSelect.value : 'date_desc';
      var dir = dirFilter ? dirFilter.value : 'all';
      var result = resultFilter ? resultFilter.value : 'all';
      
      var trades = allTrades.slice();
      
      if (dir !== 'all') trades = trades.filter(function(t) { return t.direction === dir; });
      if (result === 'win') trades = trades.filter(function(t) { return t.exit_price && getTradePnL(t) > 0; });
      else if (result === 'loss') trades = trades.filter(function(t) { return t.exit_price && getTradePnL(t) < 0; });
      else if (result === 'open') trades = trades.filter(function(t) { return !t.exit_price; });
      
      switch (sort) {
        case 'date_desc': 
          trades.sort(function(a,b) { 
            var da = a.trade_date ? new Date(a.trade_date).getTime() : 0;
            var db = b.trade_date ? new Date(b.trade_date).getTime() : 0;
            return db - da; 
          }); 
          break;
        case 'date_asc': 
          trades.sort(function(a,b) { 
            var da = a.trade_date ? new Date(a.trade_date).getTime() : 0;
            var db = b.trade_date ? new Date(b.trade_date).getTime() : 0;
            return da - db; 
          }); 
          break;
        case 'pnl_desc': 
          trades.sort(function(a,b) { return (getTradePnL(b)||0) - (getTradePnL(a)||0); }); 
          break;
        case 'pnl_asc': 
          trades.sort(function(a,b) { return (getTradePnL(a)||0) - (getTradePnL(b)||0); }); 
          break;
        case 'symbol_asc': 
          trades.sort(function(a,b) { return (a.symbol||'').localeCompare(b.symbol||''); }); 
          break;
      }

      totalItems = trades.length;
      totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
      
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      var start = (currentPage - 1) * PAGE_SIZE;
      var end = Math.min(start + PAGE_SIZE, totalItems);
      filteredTrades = trades.slice(start, end);

      renderTable(filteredTrades);
    } catch(e) {
      console.error('Filtreleme hatası:', e);
    }
  }

  // ============================================================
  // DEĞİŞİKLİK 3: Masaüstü tablo HTML üretici (eski kod buraya taşındı)
  // ============================================================
  function buildDesktopTableHTML(trades) {
    var rows = '';
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      var pnl = getTradePnL(t);
      var isWin = pnl !== null && pnl > 0;
      var isLoss = pnl !== null && pnl < 0;
      var isOpen = !t.exit_price;
      var indClass = isOpen ? 'open' : isWin ? 'win' : 'loss';
      var pnlStr = isOpen ? '<span class="pnl-open" style="color:var(--muted);">Açık</span>' : '<span style="font-family:\'Inter\',sans-serif;font-weight:600;" class="' + (isWin ? 'positive' : 'negative') + '">' + formatCurrency(pnl) + '</span>';
      var rrStr = t.rr_ratio ? '<span style="color:var(--accent2);font-family:\'DM Mono\',monospace;">1:' + t.rr_ratio + '</span>' : '—';
      var strategyName = t.strategy_id ? (strategyNames[t.strategy_id] || '—') : '—';
      var dateTimeStr = formatDateTime(t.trade_date);
      var hasNote = t.notes && t.notes.trim().length > 0;
      
      var safeSymbol = sanitizeHTML(t.symbol || '—');
      var safeStrategy = sanitizeHTML(strategyName);
      var safeNotes = sanitizeHTML(t.notes || '');
      
      rows += '\n        <tr onclick="toggleNote(\'' + t.id + '\')">\n          <td style="width:36px;" onclick="event.stopPropagation()">\n            <input type="checkbox" class="trade-checkbox" data-id="' + t.id + '" onchange="toggleSelect(\'' + t.id + '\', this.checked)">\n          </td>\n          <td>\n            <div class="symbol-cell">\n              <span class="row-indicator ' + indClass + '"></span>\n              <span class="symbol-text">' + safeSymbol + '</span>\n            </div>\n          </td>\n          <td>' + (t.direction === 'LONG' || t.direction === 'BUY' ? '<span class="badge-long">LONG</span>' : '<span class="badge-short">SHORT</span>') + '</td>\n          <td style="font-family:\'DM Mono\',monospace;">' + (t.lot ?? '—') + '</td>\n          <td style="font-family:\'DM Mono\',monospace;">' + (t.entry_price ?? '—') + '</td>\n          <td style="font-family:\'DM Mono\',monospace;">' + (t.exit_price ?? '—') + '</td>\n          <td style="font-family:\'DM Mono\',monospace;">' + (t.stop_loss ?? '—') + '</td>\n          <td style="font-family:\'DM Mono\',monospace;">' + (t.take_profit ?? '—') + '</td>\n          <td>' + pnlStr + '</td>\n          <td>' + rrStr + '</td>\n          <td>' + (strategyName !== '—' ? '<span class="strategy-badge" title="' + safeStrategy + '">' + (safeStrategy.length > 15 ? safeStrategy.slice(0,12)+'..' : safeStrategy) + '</span>' : '—') + '</td>\n          <td class="trade-date-time" style="font-family:\'DM Mono\',monospace;">' + dateTimeStr + '</td>\n          <td onclick="event.stopPropagation()">\n            <div class="tt-actions">\n              <button class="btn-icon" onclick="openEdit(\'' + t.id + '\')" title="Düzenle">✏️</button>\n              <button class="btn-icon del" onclick="deleteTrade(\'' + t.id + '\')" title="Sil">🗑️</button>\n            </div>\n          </td>\n        </tr>\n        <tr id="note-row-' + t.id + '" style="display:none;" class="trade-note-row">\n          <td colspan="13">\n            <strong>📝 Not:</strong><br>\n            ' + (hasNote ? safeNotes : '<span style="opacity:0.5;">Not eklenmemiş</span>') + '\n          </td>\n        </tr>\n      ';
    }
    return '\n      <div style="overflow-x:auto;">\n        <table class="ww-table">\n          <thead>\n            <tr>\n              <th style="width:36px;"><input type="checkbox" class="trade-checkbox" id="select-all-checkbox" onchange="toggleSelectAll(this)"></th>\n              <th>Sembol</th><th>Yön</th><th>Lot</th><th>Giriş</th><th>Çıkış</th><th>SL</th><th>TP</th><th>K/Z</th><th>R/R</th><th>Strateji</th><th>Tarih</th><th style="width:70px;"></th>\n            </tr>\n          </thead>\n          <tbody>' + rows + '</tbody>\n        </table>\n      </div>\n    ';
  }

  // ============================================================
  // DEĞİŞİKLİK 3: Mobil kart HTML üretici
  // ============================================================
  function buildMobileCardsHTML(trades) {
    var html = '<div class="trades-mobile-cards">';
    for (var i = 0; i < trades.length; i++) {
      var t = trades[i];
      var pnl = getTradePnL(t);
      var isWin = pnl !== null && pnl > 0;
      var isLoss = pnl !== null && pnl < 0;
      var isOpen = !t.exit_price;
      var indClass = isOpen ? 'open' : isWin ? 'win' : 'loss';

      var safeSymbol = sanitizeHTML(t.symbol || '—');
      var strategyName = t.strategy_id ? (strategyNames[t.strategy_id] || '—') : '—';
      var safeStrategy = sanitizeHTML(strategyName);
      var safeNotes = sanitizeHTML(t.notes || '');
      var hasNote = t.notes && t.notes.trim().length > 0;
      var dateTimeStr = formatDateTime(t.trade_date);
      var rrStr = t.rr_ratio ? '1:' + t.rr_ratio : '—';

      var pnlStr;
      if (isOpen) {
        pnlStr = '<span class="trade-card-pnl pnl-open">Açık</span>';
      } else {
        pnlStr = '<span class="trade-card-pnl ' + (isWin ? 'positive' : 'negative') + '">' + formatCurrency(pnl) + '</span>';
      }

      var dirBadge = (t.direction === 'LONG' || t.direction === 'BUY')
        ? '<span class="badge-long">LONG</span>'
        : '<span class="badge-short">SHORT</span>';

      html += '<div class="trade-card" data-id="' + t.id + '">';
      html +=   '<div class="trade-card-header">';
      html +=     '<input type="checkbox" class="trade-checkbox trade-card-checkbox" data-id="' + t.id + '" onchange="toggleSelect(\'' + t.id + '\', this.checked)" onclick="event.stopPropagation()">';
      html +=     '<span class="row-indicator ' + indClass + '"></span>';
      html +=     '<span class="symbol-text">' + safeSymbol + '</span>';
      html +=     dirBadge;
      html +=     '<span class="trade-card-date">' + dateTimeStr + '</span>';
      html +=   '</div>';
      html +=   '<div class="trade-card-body">';
      html +=     pnlStr;
      html +=     '<button type="button" class="trade-card-toggle" onclick="toggleCardDetail(\'' + t.id + '\', this)" aria-label="Detaylar">';
      html +=       '<span data-i18n="trades.card_details">Detaylar</span>';
      html +=       '<span class="arrow">▾</span>';
      html +=     '</button>';
      html +=   '</div>';
      html +=   '<div class="trade-card-detail" id="card-detail-' + t.id + '">';
      html +=     '<div class="trade-card-detail-inner">';
      html +=       '<div class="trade-card-grid">';
      html +=         '<div class="trade-card-field"><label data-i18n="trades.lot">Lot</label><span>' + (t.lot ?? '—') + '</span></div>';
      html +=         '<div class="trade-card-field"><label data-i18n="trades.entry_price">Giriş</label><span>' + (t.entry_price ?? '—') + '</span></div>';
      html +=         '<div class="trade-card-field"><label data-i18n="trades.exit_price">Çıkış</label><span>' + (t.exit_price ?? '—') + '</span></div>';
      html +=         '<div class="trade-card-field"><label data-i18n="trades.stop_loss">SL</label><span>' + (t.stop_loss ?? '—') + '</span></div>';
      html +=         '<div class="trade-card-field"><label data-i18n="trades.take_profit">TP</label><span>' + (t.take_profit ?? '—') + '</span></div>';
      html +=         '<div class="trade-card-field"><label>R/R</label><span>' + rrStr + '</span></div>';
      html +=         '<div class="trade-card-field trade-card-field-full"><label data-i18n="trades.strategy">Strateji</label><span>' + (strategyName !== '—' ? safeStrategy : '—') + '</span></div>';
      html +=         '<div class="trade-card-field trade-card-field-full"><label data-i18n="trades.notes">Not</label><span>' + (hasNote ? safeNotes : '<span style="opacity:0.5;">Not eklenmemiş</span>') + '</span></div>';
      html +=       '</div>';
      html +=       '<div class="trade-card-actions">';
      html +=         '<button type="button" class="trade-card-btn edit" onclick="event.stopPropagation();openEdit(\'' + t.id + '\')">✏️ <span data-i18n="common.edit">Düzenle</span></button>';
      html +=         '<button type="button" class="trade-card-btn del" onclick="event.stopPropagation();deleteTrade(\'' + t.id + '\')">🗑️ <span data-i18n="common.delete">Sil</span></button>';
      html +=       '</div>';
      html +=     '</div>';
      html +=   '</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ============================================================
  // TABLO RENDER - DEĞİŞİKLİK 3: mobil/desktop ayrımı
  // ============================================================
  
  function renderTable(trades) {
    var wrap = safeEl('table-wrap');
    if (!wrap) return;
    
    selectedTrades.clear();
    expandedNotes.clear();
    updateSelBar();
    renderStats(trades);
    
    hideTableSkeleton();
    
    if (!trades || !trades.length) {
      var noText = 'Henüz işlem yok.';
      if (typeof i18n !== 'undefined' && i18n.t) {
        noText = i18n.t('trades.no_trades') || 'Henüz işlem yok.';
      }
      wrap.innerHTML = '<p style="color:var(--muted);text-align:center;padding:2rem;">' + noText + ' <a href="add-trade.html" style="color:var(--accent);">İlk işlemi ekle →</a></p>';
      if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply();
      renderPagination();
      return;
    }

    // DEĞİŞİKLİK 3: Ekran boyutuna göre markup seç
    var isMobile = window.innerWidth <= 768;
    if (isMobile) {
      wrap.innerHTML = buildMobileCardsHTML(trades);
    } else {
      wrap.innerHTML = buildDesktopTableHTML(trades);
    }
    
    if (typeof i18n !== 'undefined' && i18n.apply) i18n.apply();
    renderPagination();
  }

  // ============================================================
  // İŞLEM SİLME
  // ============================================================
  
  async function deleteTrade(id) {
    var confirmText = 'Bu işlemi silmek istediğinize emin misiniz?';
    if (typeof i18n !== 'undefined' && i18n.t) {
      confirmText = i18n.t('trades.delete_confirm') || confirmText;
    }
    if (!confirm(confirmText)) return;
    
    try {
      if (typeof sb === 'undefined') {
        showToast('Veritabanı bağlantısı yok!', 'error');
        return;
      }
      var { error } = await sb.from('trades').delete().eq('id', id);
      if (error) { 
        var errMsg = 'Silme hatası: ' + error.message;
        if (typeof i18n !== 'undefined' && i18n.t) {
          errMsg = i18n.t('trades.delete_error') + error.message;
        }
        showToast(errMsg, 'error'); 
        return; 
      }
      
      var successMsg = 'İşlem silindi!';
      if (typeof i18n !== 'undefined' && i18n.t) {
        successMsg = i18n.t('trades.deleted') || successMsg;
      }
      showToast(successMsg);
      
      allTrades = allTrades.filter(function(t) { return t.id !== id; });
      totalItems = allTrades.length;
      totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
      if (currentPage > totalPages) currentPage = totalPages;
      applyFiltersAndSort();
    } catch (e) {
      console.error('Delete hatası:', e);
      showToast('Bir hata oluştu.', 'error');
    }
  }
  window.deleteTrade = deleteTrade;

  async function bulkDelete() {
    var count = selectedTrades.size;
    if (count === 0) {
      showToast('Silinecek işlem seçilmedi!', 'error');
      return;
    }
    
    var confirmText = count + ' işlemi silmek istediğinize emin misiniz?';
    if (typeof i18n !== 'undefined' && i18n.t) {
      confirmText = i18n.t('trades.bulk_confirm_text', { count: count }) || confirmText;
    }
    
    var countEl = safeEl('bulk-count-text');
    if (countEl) countEl.textContent = confirmText;
    
    var modal = safeEl('bulk-modal');
    if (modal) modal.classList.add('active');
  }

  async function confirmBulkDelete() {
    var ids = Array.from(selectedTrades).filter(function(id) { return id && typeof id === 'string' && id.trim() !== ''; });
    
    if (ids.length === 0) {
      showToast('Silinecek geçerli işlem bulunamadı!', 'error');
      var modal = safeEl('bulk-modal');
      if (modal) modal.classList.remove('active');
      return;
    }
    
    try {
      if (typeof sb === 'undefined') {
        showToast('Veritabanı bağlantısı yok!', 'error');
        return;
      }
      var { error } = await sb.from('trades').delete().in('id', ids);
      
      if (error) { 
        var errMsg = 'Silme hatası: ' + error.message;
        if (typeof i18n !== 'undefined' && i18n.t) {
          errMsg = i18n.t('trades.delete_error') + error.message;
        }
        showToast(errMsg, 'error'); 
        var modal2 = safeEl('bulk-modal');
        if (modal2) modal2.classList.remove('active');
        return; 
      }
      
      var successMsg = ids.length + ' işlem silindi!';
      if (typeof i18n !== 'undefined' && i18n.t) {
        successMsg = ids.length + ' ' + i18n.t('trades.deleted') || successMsg;
      }
      showToast(successMsg);
      
      allTrades = allTrades.filter(function(t) { return !selectedTrades.has(t.id); });
      selectedTrades.clear();
      
      totalItems = allTrades.length;
      totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
      if (currentPage > totalPages) currentPage = totalPages;
      
      applyFiltersAndSort();
      var modal3 = safeEl('bulk-modal');
      if (modal3) modal3.classList.remove('active');
    } catch (e) {
      console.error('Bulk delete hatası:', e);
      showToast('Bir hata oluştu.', 'error');
    }
  }

  // ============================================================
  // DÜZENLEME
  // ============================================================
  
  function openEdit(id) {
    var t = allTrades.find(function(x) { return x.id === id; });
    if (!t) return;
    
    var idEl = safeEl('edit-id');
    var instrumentEl = safeEl('edit-instrument');
    var symbolEl = safeEl('edit-symbol');
    var directionEl = safeEl('edit-direction');
    var lotEl = safeEl('edit-lot');
    var entryEl = safeEl('edit-entry');
    var exitEl = safeEl('edit-exit');
    var slEl = safeEl('edit-sl');
    var tpEl = safeEl('edit-tp');
    var dateEl = safeEl('edit-date');
    var notesEl = safeEl('edit-notes');
    var multiplierEl = safeEl('edit-multiplier');
    var strategyEl = safeEl('edit-strategy');
    var customWrap = safeEl('edit-custom-wrap');
    var errEl = safeEl('edit-err');
    
    if (idEl) idEl.value = t.id;
    if (instrumentEl) instrumentEl.value = t.instrument || 'forex';
    if (symbolEl) symbolEl.value = t.symbol || '';
    if (directionEl) directionEl.value = t.direction || 'LONG';
    if (lotEl) lotEl.value = t.lot ?? '';
    if (entryEl) entryEl.value = t.entry_price ?? '';
    if (exitEl) exitEl.value = t.exit_price ?? '';
    if (slEl) slEl.value = t.stop_loss ?? '';
    if (tpEl) tpEl.value = t.take_profit ?? '';
    if (dateEl) dateEl.value = t.trade_date || '';
    if (notesEl) notesEl.value = t.notes || '';
    if (multiplierEl) multiplierEl.value = t.multiplier ?? '';
    if (strategyEl) strategyEl.value = t.strategy_id || '';
    if (customWrap) customWrap.style.display = (t.instrument === 'other') ? 'flex' : 'none';
    if (errEl) errEl.style.display = 'none';
    
    var modal = safeEl('edit-modal');
    if (modal) modal.classList.add('active');
  }
  window.openEdit = openEdit;

  function closeModal() { 
    var modal = safeEl('edit-modal');
    if (modal) modal.classList.remove('active');
  }
  
  function closeBulkModal() { 
    var modal = safeEl('bulk-modal');
    if (modal) modal.classList.remove('active');
  }

  // ============================================================
  // PLAN BADGE GÜNCELLEME
  // ============================================================
  
  async function updatePlanBadge() {
    try {
      var badge = safeEl('plan-badge');
      var text = safeEl('plan-text');
      if (!badge || !text) return;

      if (typeof window.getUserPlan === 'function') {
        var planData = await window.getUserPlan();
        var isPremium = planData.plan === 'premium';

        if (isPremium) {
          badge.classList.add('premium');
          text.textContent = 'Premium';
        } else {
          badge.classList.remove('premium');
          text.textContent = 'Ücretsiz';
        }
      }
    } catch (e) {}
  }

  // ============================================================
  // ⭐ OPTİMİZE EDİLMİŞ LOAD TRADES
  // ============================================================
  
  async function loadTrades(userId) {
    var { data, error } = await sb
      .from('trades')
      .select('id,symbol,direction,lot,entry_price,exit_price,stop_loss,take_profit,trade_date,pnl,rr_ratio,notes,strategy_id,instrument,multiplier')
      .eq('user_id', userId)
      .order('trade_date', { ascending: false })
      .limit(1000);
    
    if (error) {
      showToast('Veriler yüklenemedi: ' + error.message, 'error');
      return null;
    }
    
    return data || [];
  }

  // ============================================================
  // DEĞİŞİKLİK 2: MOBİL FİLTRE BOTTOM SHEET
  // ============================================================
  function initMobileFilterSheets() {
    var overlay = safeEl('mobile-filter-overlay');
    var sheet = safeEl('mobile-filter-sheet');
    var optionsEl = safeEl('mobile-filter-options');
    var titleEl = safeEl('mobile-filter-title');
    var chips = document.querySelectorAll('.mobile-filter-chip');

    if (!overlay || !sheet || !optionsEl || !titleEl) return;

    var FILTER_MAP = {
      sort: { selectId: 'sort-select', titleKey: 'trades.sort_title', fallbackTitle: 'Sıralama' },
      dir: { selectId: 'dir-filter', titleKey: 'trades.filter_title', fallbackTitle: 'Yön' },
      result: { selectId: 'result-filter', titleKey: 'trades.result_title', fallbackTitle: 'Sonuç' }
    };

    var currentFilterKey = null;

    function getOptionText(opt) {
      return (opt.textContent || '').trim();
    }

    // Çip etiketlerini native select'in seçili option'undan senkronla
    function syncChipLabels() {
      chips.forEach(function(chip) {
        var key = chip.dataset.filter;
        var cfg = FILTER_MAP[key];
        if (!cfg) return;
        var sel = document.getElementById(cfg.selectId);
        if (!sel) return;
        var selectedOpt = sel.options[sel.selectedIndex];
        var txt = selectedOpt ? getOptionText(selectedOpt) : '';
        var span = chip.querySelector('.mobile-filter-chip-text');
        if (span && txt) span.textContent = txt;
      });
    }

    function openSheet(key) {
      var cfg = FILTER_MAP[key];
      if (!cfg) return;
      var sel = document.getElementById(cfg.selectId);
      if (!sel) return;

      currentFilterKey = key;

      // Başlık
      var titleText = cfg.fallbackTitle;
      if (typeof i18n !== 'undefined' && i18n.t) {
        titleText = i18n.t(cfg.titleKey) || titleText;
      }
      titleEl.textContent = titleText;

      // Seçenekleri oluştur
      optionsEl.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function(opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-filter-option';
        btn.dataset.value = opt.value;
        btn.textContent = getOptionText(opt);
        if (opt.value === sel.value) btn.classList.add('selected');
        btn.addEventListener('click', function() {
          sel.value = opt.value;
          // Mevcut change event'i tetikle → applyFiltersAndSort + currentPage=1 reset korunur
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          syncChipLabels();
          closeSheet();
        });
        optionsEl.appendChild(btn);
      });

      overlay.classList.add('active');
      sheet.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeSheet() {
      overlay.classList.remove('active');
      sheet.classList.remove('active');
      document.body.style.overflow = '';
      currentFilterKey = null;
    }

    chips.forEach(function(chip) {
      chip.addEventListener('click', function() {
        openSheet(chip.dataset.filter);
      });
    });

    overlay.addEventListener('click', closeSheet);

    // Native select değişince çip etiketlerini senkron tut
    ['sort-select', 'dir-filter', 'result-filter'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', syncChipLabels);
    });

    // ESC ile kapat (edit-modal ve bulk-modal ile çakışmasın)
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sheet.classList.contains('active')) {
        closeSheet();
      }
    });

    // İlk yüklemede çip etiketlerini ayarla
    syncChipLabels();
    setTimeout(syncChipLabels, 300);
    setTimeout(syncChipLabels, 800);

    // Dil değişince çipleri güncelle
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange(function() {
        setTimeout(syncChipLabels, 80);
      });
    }

    // Breakpoint geçişinde açık sheet'i kapat
    window.addEventListener('resize', function() {
      if (window.innerWidth > 768 && sheet.classList.contains('active')) {
        closeSheet();
      }
    });
  }

  // ============================================================
  // INIT
  // ============================================================
  
  async function initTrades() {
    try {
      showTableSkeleton();
      
      if (typeof requireAuth !== 'function') {
        console.warn('⚠️ requireAuth fonksiyonu bulunamadı, script.js yüklenmemiş olabilir.');
        hideTableSkeleton();
        return;
      }
      
      var user = await requireAuth();
      if (!user) {
        hideTableSkeleton();
        return;
      }
      
      if (typeof isAdmin === 'function' && isAdmin(user)) {
        var adminLink = safeEl('admin-link');
        var adminLinkMobile = safeEl('admin-link-mobile');
        if (adminLink) adminLink.style.display = 'inline';
        if (adminLinkMobile) adminLinkMobile.style.display = 'block';
      }
      
      await loadStrategyNames();
      
      try {
        await updatePlanBadge();
      } catch (e) {}

      try {
          if (typeof updateOvertradeBell === 'function') {
              await updateOvertradeBell();
          }
      } catch(e) {
          console.warn('Over-Trade bildirimi kontrol edilemedi:', e);
      }
      
      if (typeof sb === 'undefined') {
        console.error('❌ sb (Supabase) tanımlı değil!');
        var wrap = safeEl('table-wrap');
        if (wrap) wrap.innerHTML = '<p style="color:var(--red);text-align:center;padding:2rem;">Veritabanı bağlantısı yok!</p>';
        hideTableSkeleton();
        return;
      }
      
      var tradesData = await loadTrades(user.id);
      if (tradesData === null) {
        hideTableSkeleton();
        return;
      }
      
      allTrades = tradesData;
      totalItems = allTrades.length;
      totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
      currentPage = 1;
      
      // Event listeners
      var sortSelect = safeEl('sort-select');
      if (sortSelect) {
        sortSelect.addEventListener('change', function() {
          currentPage = 1;
          applyFiltersAndSort();
        });
      }
      
      var dirFilter = safeEl('dir-filter');
      if (dirFilter) {
        dirFilter.addEventListener('change', function() {
          currentPage = 1;
          applyFiltersAndSort();
        });
      }
      
      var resultFilter = safeEl('result-filter');
      if (resultFilter) {
        resultFilter.addEventListener('change', function() {
          currentPage = 1;
          applyFiltersAndSort();
        });
      }
      
      var exportCsvBtn = safeEl('export-csv');
      if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', function() {
          if (typeof window.exportCSV === 'function') {
            window.exportCSV();
          } else {
            showToast('CSV export özelliği henüz eklenmedi.', 'info');
          }
        });
      }
      
      var exportPdfBtn = safeEl('export-pdf');
      if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', function(e) {
          e.preventDefault();
          if (typeof window.generatePDF === 'function') {
            var lang = 'en';
            if (typeof i18n !== 'undefined' && i18n.getCurrentLanguage) {
              lang = i18n.getCurrentLanguage();
            }
            window.generatePDF(lang);
          } else {
            showToast('PDF export özelliği henüz eklenmedi.', 'info');
          }
        });
      }
      
      var editInstrument = safeEl('edit-instrument');
      if (editInstrument) {
        editInstrument.addEventListener('change', function() {
          var customWrap = safeEl('edit-custom-wrap');
          if (customWrap) customWrap.style.display = this.value === 'other' ? 'flex' : 'none';
        });
      }
      
      var cancelBtn = safeEl('modal-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      
      var bulkCancel = safeEl('bulk-cancel');
      if (bulkCancel) bulkCancel.addEventListener('click', closeBulkModal);
      
      var bulkDeleteBtn = safeEl('bulk-delete-btn');
      if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);
      
      var bulkConfirm = safeEl('bulk-confirm');
      if (bulkConfirm) bulkConfirm.addEventListener('click', confirmBulkDelete);
      
      var selClear = safeEl('sel-clear-btn');
      if (selClear) {
        selClear.addEventListener('click', function() {
          selectedTrades.clear();
          document.querySelectorAll('.trade-checkbox').forEach(function(cb) { cb.checked = false; });
          updateSelBar();
        });
      }
      
      var editModal = safeEl('edit-modal');
      if (editModal) {
        editModal.addEventListener('click', function(e) {
          if (e.target === this) closeModal();
        });
      }
      
      var bulkModal = safeEl('bulk-modal');
      if (bulkModal) {
        bulkModal.addEventListener('click', function(e) {
          if (e.target === this) closeBulkModal();
        });
      }
      
      // ESC — edit-modal ve bulk-modal
      document.addEventListener('keydown', function(e) { 
        if (e.key === 'Escape') { 
          closeModal(); 
          closeBulkModal(); 
        } 
      });
      
      var saveBtn = safeEl('modal-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
          var id = safeEl('edit-id')?.value;
          var instrument = safeEl('edit-instrument')?.value;
          var symbol = safeEl('edit-symbol')?.value.trim().toUpperCase();
          var direction = safeEl('edit-direction')?.value;
          var lot = parseFloat(safeEl('edit-lot')?.value);
          var entry = parseFloat(safeEl('edit-entry')?.value);
          var exit = parseFloat(safeEl('edit-exit')?.value) || null;
          var sl = parseFloat(safeEl('edit-sl')?.value) || null;
          var tp = parseFloat(safeEl('edit-tp')?.value) || null;
          var tradeDate = safeEl('edit-date')?.value;
          var notes = safeEl('edit-notes')?.value.trim();
          var strategyId = safeEl('edit-strategy')?.value || null;
          var errEl = safeEl('edit-err');
          if (errEl) errEl.style.display = 'none';
          
          var mult = 100000;
          if (typeof INSTRUMENT_MULTIPLIERS !== 'undefined' && INSTRUMENT_MULTIPLIERS[instrument]) {
            mult = INSTRUMENT_MULTIPLIERS[instrument];
          }
          if (instrument === 'other') {
            mult = parseFloat(safeEl('edit-multiplier')?.value);
            if (!mult || isNaN(mult)) { 
              if (errEl) {
                errEl.textContent = 'Manuel çarpan gerekli!';
                errEl.style.display = 'block';
              }
              return; 
            }
          }
          if (!symbol || !direction || !lot || !entry || !tradeDate) {
            if (errEl) {
              errEl.textContent = 'Tüm zorunlu alanları doldurun!';
              errEl.style.display = 'block';
            }
            return; 
          }
          
          var pnl = exit ? window.calcPnL(entry, exit, lot, direction, 'other', mult) : null;
          var rr = (sl && tp) ? parseFloat(window.calcRR(entry, sl, tp, direction)) : null;
          
          try {
            if (typeof sb === 'undefined') {
              showToast('Veritabanı bağlantısı yok!', 'error');
              return;
            }
            var { error } = await sb.from('trades').update({
              instrument: instrument, symbol: symbol, direction: direction, lot: lot, 
              entry_price: entry, exit_price: exit,
              stop_loss: sl, take_profit: tp, trade_date: tradeDate, notes: notes || null,
              pnl: pnl, rr_ratio: rr, multiplier: mult, strategy_id: strategyId
            }).eq('id', id);
            
            if (error) {
              if (errEl) {
                errEl.textContent = 'Güncelleme hatası: ' + error.message;
                errEl.style.display = 'block';
              }
              return;
            }
            
            var idx = allTrades.findIndex(function(x) { return x.id === id; });
            if (idx > -1) {
              allTrades[idx] = { 
                id: id, instrument: instrument, symbol: symbol, direction: direction, lot: lot, 
                entry_price: entry, exit_price: exit, stop_loss: sl, take_profit: tp, 
                trade_date: tradeDate, notes: notes, pnl: pnl, rr_ratio: rr, 
                multiplier: mult, strategy_id: strategyId 
              };
            }
            
            var successMsg = 'İşlem güncellendi!';
            if (typeof i18n !== 'undefined' && i18n.t) {
              successMsg = i18n.t('trades.updated') || successMsg;
            }
            showToast(successMsg);
            closeModal();
            applyFiltersAndSort();
          } catch (e) {
            console.error('Save hatası:', e);
            showToast('Bir hata oluştu.', 'error');
          }
        });
      }
      
      if (typeof i18n !== 'undefined' && i18n.onChange) {
        i18n.onChange(function() {
          updateSelBar();
          renderPagination();
        });
      }
      
      if (typeof applyDecimalFix === 'function') {
        applyDecimalFix(['edit-lot','edit-entry','edit-exit','edit-sl','edit-tp','edit-multiplier']);
      }

      // ⭐ DEĞİŞİKLİK 2: Mobil filtre bottom sheet başlatıcı
      initMobileFilterSheets();
      
      applyFiltersAndSort();
      
    } catch (e) {
      console.error('Trades init error:', e);
      hideTableSkeleton();
    }
  }

  // ============================================================
  // DEĞİŞİKLİK 3: Breakpoint geçişinde otomatik yeniden render
  // ============================================================
  (function listenBreakpointChanges() {
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        var nowMobile = window.innerWidth <= 768;
        if (nowMobile !== _lastIsMobile) {
          _lastIsMobile = nowMobile;
          if (allTrades && allTrades.length) {
            applyFiltersAndSort();
          }
        }
      }, 200);
    });
  })();

  // ============================================================
  // DOM READY
  // ============================================================
  
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof lucide !== 'undefined') {
      var tradeIcons = document.querySelectorAll('.trades-page [data-lucide]');
      if (tradeIcons.length > 0) {
        lucide.createIcons();
      }
    }
    
    // Navbar çağrısı KALDIRILDI - zıplamayı önler
    // Navbar zaten navbar.js'de yönetiliyor (navbarRendered flag'i ile)
    
    setTimeout(initTrades, 150);
  });

})();

console.log('✅ trades.js yüklendi! (DEĞİŞİKLİK 1+2+3 uygulandı)');