// ============================================================
// QUICK ADD MODAL - İŞLEM EKLEME
// ⭐ FIX: FAB butonu kaybolma sorunu düzeltildi (body'ye kalıcı olarak eklenir)
// ⭐ FIX: initQuickAdd sadece bir kez çalışır
// ⭐ FIX: Debounce tamamen kaldırıldı, anında güncelleme
// ⭐ FIX: Event delegation ile tüm input değişiklikleri yakalanıyor
// ⭐ FIX: close ve cancel butonları çalışıyor
// ⭐ TEMA: Sayfa başında localStorage'dan tema yüklenir
// ⭐ TEMA: storage / themeChanged event'leri dinlenir
// ⭐ TEMİZLİK: window.load fallback'i KALDIRILDI
// ⭐ CSV/BULK CHUNKING: Tek dev istek yerine 500'lük parçalar
//        - 1000+ satır import artık çalışır (Supabase limitine takılmaz)
//        - Kısmi başarı: hatalı chunk diğerlerini etkilemez
//        - Real-time progress: statusText ve bulk-progress güncellenir
// ============================================================

// ============================================================
// ⭐ TEMA BAŞLATMA - SAYFA YÜKLENİRKEN (EN BAŞTA ÇALIŞIR)
// ============================================================

(function initQuickAddTheme() {
  try {
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
      } catch (e) {}
    }

    wwLog.log('🎨 [quick-add.js] Tema ayarlandı:', savedTheme || 'dark');
  } catch (e) {}
})();

// ============================================================
// ⭐ TEMA DEĞİŞİMİNİ DİNLE
// ============================================================

(function listenQuickAddThemeChanges() {
  function applyThemeFromStorage() {
    try {
      var savedTheme = localStorage.getItem('ww_theme');
      var isLight = savedTheme === 'light';
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
        } catch (e) {}
      }
    } catch (e) {}
  }

  window.addEventListener('storage', function(e) {
    if (e.key === 'ww_theme' || e.key === 'ww_custom_theme' || e.key === 'ww_font_size') {
      wwLog.log('🔄 [QuickAdd] Tema değişikliği algılandı (storage):', e.key);
      applyThemeFromStorage();
    }
  });

  document.addEventListener('themeChanged', function(e) {
    wwLog.log('🔄 [QuickAdd] themeChanged event yakalandı');
    if (e.detail && e.detail.settings) {
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
    }
  });

  wwLog.log('✅ [QuickAdd] Tema izleyici yüklendi!');
})();

(function() {
  'use strict';

  // ============================================================
  // SABİTLER
  // ============================================================
  // ⭐ Supabase tek insert'te ~1000 satır limitine sahip.
  // 500'lük parçalar güvenli ve kullanıcıya hızlı geri bildirim sağlar.
  const CHUNK_SIZE = 500;

  // ============================================================
  // İKONLAR — tek merkezden yönetilen, Lucide tarzı SVG'ler.
  // Emoji kullanımı tamamen kaldırıldı.
  // ============================================================

  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    buy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 6"/><polyline points="15 6 21 6 21 12"/></svg>',
    sell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 9 13 13 9 21 18"/><polyline points="15 18 21 18 21 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    fileLarge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="24" height="24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="animation:qaSpin 0.6s linear infinite;"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>'
  };

  function badgeIcon(type) {
    const map = {
      loading: { icon: ICONS.spinner, color: 'var(--accent, #7c6dfa)' },
      success: { icon: ICONS.check, color: 'var(--green, #22c55e)' },
      error: { icon: ICONS.close, color: 'var(--red, #ef4444)' },
      warning: { icon: ICONS.alert, color: 'var(--red, #ef4444)' }
    };
    const m = map[type] || map.loading;
    return '<span style="display:inline-flex;color:' + m.color + ';">' + m.icon + '</span>';
  }

  function logTag(type) {
    if (type === 'warning') {
      return '<span style="color:var(--accent2,#9b8bfa);font-weight:600;">Uyarı</span>';
    }
    return '<span style="color:var(--red,#ef4444);font-weight:600;">Hata</span>';
  }

  // ============================================================
  // ⭐ CHUNK HELPER - Diziyi parçalara böl
  // ============================================================
  function chunkArray(arr, size) {
    var chunks = [];
    for (var i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  // ============================================================
  // STATE
  // ============================================================

  let currentSide = 'BUY';
  let currentTab = 'price';
  let strategiesList = [];
  let isSubmitting = false;
  let csvFile = null;
  let isImporting = false;
  let currentInstrument = 'forex';
  let currentMultiplier = 100000;
  let csvPreviewData = null;

  function el(id) { return document.getElementById(id); }
  function qsa(selector) { return document.querySelectorAll(selector); }

  // ============================================================
  // GLOBAL BAĞIMLILIK KONTROLÜ
  // ============================================================

  function checkGlobals() {
    const required = {
      'sb': typeof sb !== 'undefined',
      'requireAuth': typeof requireAuth === 'function',
      'calcPnL': typeof calcPnL === 'function',
      'calcRR': typeof calcRR === 'function',
      'formatCurrency': typeof formatCurrency === 'function',
      'showToast': typeof showToast === 'function'
    };

    const missing = Object.keys(required).filter(k => !required[k]);
    if (missing.length > 0) {
      wwLog.warn('Eksik global bağımlılıklar:', missing.join(', '));
      return false;
    }
    return true;
  }

  // ============================================================
  // XSS KORUMASI - HTML Escape
  // ============================================================

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================================
  // CSV PARSER - Tırnaklı alanları ve içteki virgülleri işler
  // ============================================================

  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          current += char;
          i++;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
          i++;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
          i++;
        } else {
          current += char;
          i++;
        }
      }
    }

    result.push(current.trim());
    return result;
  }

  function parseCsvText(text) {
    const lines = text.split('\n').filter(function(l) { return l.trim() !== ''; });
    if (lines.length === 0) return [];

    return lines.map(function(line) {
      return parseCsvLine(line);
    });
  }

  // ============================================================
  // TARİH FORMATLAMA - Tek tip UTC ISO formatı
  // ============================================================

  function validateAndFormatDate(dateString) {
    if (!dateString || !dateString.trim()) {
      return new Date().toISOString().split('T')[0];
    }

    dateString = dateString.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }

    let parts = dateString.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 2000 && year < 2100) {
        const d = new Date(year, month - 1, day);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
    }

    parts = dateString.split('/');
    if (parts.length === 3) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);

      if (!isNaN(first) && !isNaN(second) && !isNaN(year) && year > 2000 && year < 2100) {
        let d = new Date(year, second - 1, first);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
        d = new Date(year, first - 1, second);
        if (!isNaN(d.getTime())) {
          wwLog.warn('Tarih formatı belirsiz (DD/MM vs MM/DD):', dateString, '-> MM/DD olarak yorumlandı');
          return d.toISOString().split('T')[0];
        }
      }
    }

    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }

    wwLog.warn('Tarih ayrıştırılamadı, bugünün tarihi kullanılacak:', dateString);
    return new Date().toISOString().split('T')[0];
  }

  // ============================================================
  // HTML TEMPLATE - FAB butonu hariç (ayrıca eklenecek)
  // ============================================================

  function getModalHTML() {
    const today = new Date().toISOString().split('T')[0];
    return `
      <div class="quick-add-overlay" id="quick-add-overlay">
        <div class="quick-add-modal">

          <!-- HEADER -->
          <div class="quick-add-header">
            <h2>Yeni İşlem</h2>
            <button class="close-btn" id="quick-add-close" aria-label="Kapat">${ICONS.close}</button>
          </div>

          <!-- TABS -->
          <div class="quick-add-tabs" id="quick-tabs">
            <button class="quick-tab active" data-tab="price">${ICONS.edit}<span>İşlem Ekle</span></button>
            <button class="quick-tab" data-tab="csv">${ICONS.file}<span>CSV</span></button>
            <button class="quick-tab" data-tab="bulk">${ICONS.list}<span>Toplu</span></button>
          </div>

          <!-- BODY -->
          <div class="quick-add-body">
            <div class="quick-add-error" id="quick-add-error">
              ${ICONS.alert}
              <span id="quick-add-error-text"></span>
            </div>

            <!-- ==========================================================
                 TAB: İŞLEM EKLE — fiyattan otomatik P&L / R:R hesaplama
                 ========================================================== -->
            <div class="quick-tab-content active" id="tab-price">

              <div class="quick-add-field">
                <label>Sembol *</label>
                <input type="text" id="price-symbol" placeholder="EURUSD" style="text-transform:uppercase;" autofocus>
              </div>

              <div class="quick-add-field">
                <label>Yön *</label>
                <div class="quick-add-side-toggle">
                  <button class="quick-add-side-btn active-buy" data-side="BUY" id="price-side-buy">${ICONS.buy}<span>Buy</span></button>
                  <button class="quick-add-side-btn" data-side="SELL" id="price-side-sell">${ICONS.sell}<span>Sell</span></button>
                </div>
              </div>

              <div class="quick-add-field">
                <label>Enstrüman *</label>
                <div class="quick-add-instrument-grid">
                  <button class="quick-add-instrument-btn active" data-instrument="forex" data-multiplier="100000">Forex</button>
                  <button class="quick-add-instrument-btn" data-instrument="gold" data-multiplier="100">Altın</button>
                  <button class="quick-add-instrument-btn" data-instrument="index" data-multiplier="10">Endeks</button>
                  <button class="quick-add-instrument-btn" data-instrument="crypto" data-multiplier="1">Kripto</button>
                  <button class="quick-add-instrument-btn" data-instrument="other" data-multiplier="1">Diğer</button>
                </div>
              </div>

              <div class="quick-add-field" id="price-custom-multiplier-wrap" style="display:none;">
                <label>Manuel Çarpan *</label>
                <input type="text" inputmode="decimal" id="price-custom-multiplier" placeholder="1000">
              </div>

              <div class="quick-add-row">
                <div class="quick-add-field">
                  <label>Lot *</label>
                  <div class="quick-add-lot-wrap">
                    <input type="text" inputmode="decimal" id="price-lot" placeholder="0.10" value="1.00">
                    <div class="lot-presets">
                      <button class="lot-preset" data-lot="0.01">0.01</button>
                      <button class="lot-preset" data-lot="0.10">0.10</button>
                      <button class="lot-preset active" data-lot="1.00">1.00</button>
                    </div>
                  </div>
                </div>
                <div class="quick-add-field">
                  <label>Giriş Fiyatı *</label>
                  <input type="text" inputmode="decimal" id="price-entry" placeholder="1.08500">
                </div>
              </div>

              <div class="quick-add-row">
                <div class="quick-add-field">
                  <label>Çıkış Fiyatı</label>
                  <input type="text" inputmode="decimal" id="price-exit" placeholder="1.09000">
                </div>
                <div class="quick-add-field">
                  <label>Stop Loss</label>
                  <input type="text" inputmode="decimal" id="price-sl" placeholder="1.08000">
                </div>
              </div>

              <div class="quick-add-field">
                <label>Take Profit</label>
                <input type="text" inputmode="decimal" id="price-tp" placeholder="1.09500">
              </div>

              <div class="quick-add-preview" id="price-preview">
                <div class="preview-rail"></div>
                <div class="preview-item"><span class="p-label">Tahmini K/Z</span><span class="p-val" id="preview-pnl">—</span></div>
                <div class="preview-divider"></div>
                <div class="preview-item"><span class="p-label">Risk / Reward</span><span class="p-val accent" id="preview-rr">—</span></div>
              </div>

              <div class="quick-add-field">
                <label>Strateji</label>
                <div class="quick-add-strategy-wrap">
                  <select id="price-strategy">
                    <option value="">— Strateji Yok —</option>
                  </select>
                  <button class="create-strategy-btn" id="price-create-strategy" title="Yeni strateji ekle">${ICONS.plus}</button>
                </div>
              </div>

              <div class="quick-add-field quick-add-notes">
                <label>Notlar</label>
                <textarea id="price-notes" placeholder="Notlar…" rows="2"></textarea>
              </div>

              <div class="quick-add-field" style="margin-bottom:0;">
                <label>Tarih</label>
                <input type="date" id="price-date" value="${today}">
              </div>
            </div>

            <!-- ==========================================================
                 TAB: CSV
                 ========================================================== -->
            <div class="quick-tab-content" id="tab-csv">
              <div class="quick-import-area">
                <div class="quick-import-icon">${ICONS.fileLarge}</div>
                <p>MT4/MT5 veya Excel'den dışa aktardığınız CSV dosyasını yükleyin</p>
                <button class="quick-import-btn" id="quick-csv-select">${ICONS.upload}<span>CSV Dosyası Seç</span></button>
                <input type="file" id="quick-csv-file" accept=".csv" style="display:none;">
                <div class="quick-import-status" id="quick-csv-status" style="display:none;">
                  <span class="status-text" id="quick-csv-filename"></span>
                  <span class="status-badge" id="quick-csv-badge"></span>
                </div>
                <div class="quick-import-log" id="quick-csv-log" style="display:none;"></div>
                <div id="csv-preview-container" style="display:none;"></div>
              </div>
            </div>

            <!-- ==========================================================
                 TAB: TOPLU
                 ========================================================== -->
            <div class="quick-tab-content" id="tab-bulk">
              <div class="quick-bulk-area">
                <p style="font-size:12px;color:var(--muted);margin-bottom:0.5rem;">Her satıra bir işlem gelecek şekilde girin:</p>
                <div style="font-size:11px;font-family:'DM Mono',monospace;color:var(--muted);background:var(--surface2);padding:6px 10px;border-radius:6px;margin-bottom:0.75rem;">
                  sembol,yön,lot,giriş,çıkış,tarih,not<br>
                  EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem
                </div>
                <textarea id="quick-bulk-textarea" rows="6" placeholder="EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem"></textarea>
                <div class="quick-bulk-progress" id="quick-bulk-progress" style="display:none;">
                  <span id="quick-bulk-status">İşleniyor...</span>
                  <div class="quick-bulk-bar"><div class="quick-bulk-fill" id="quick-bulk-fill"></div></div>
                </div>
                <div class="quick-bulk-log" id="quick-bulk-log" style="display:none;"></div>
              </div>
            </div>

            <!-- LOADING -->
            <div class="quick-add-loading" id="quick-add-loading">
              <div class="spinner"></div>
              <span>İşlem kaydediliyor...</span>
            </div>
          </div>

          <!-- FOOTER -->
          <div class="quick-add-footer">
            <button class="btn-cancel" id="quick-add-cancel">İptal</button>
            <button class="btn-save" id="quick-add-save">${ICONS.check}<span>Kaydet</span></button>
            <button class="btn-save" id="quick-import-btn" style="display:none;">${ICONS.upload}<span>İçe Aktar</span></button>
            <button class="btn-save" id="quick-bulk-btn" style="display:none;">${ICONS.send}<span>İşlemleri Ekle</span></button>
          </div>

        </div>
      </div>
    `;
  }

  // ============================================================
  // STRATEJİLER
  // ============================================================

  async function loadStrategies() {
    try {
      if (!checkGlobals() || typeof requireAuth !== 'function') return;
      const user = await requireAuth();
      if (!user) return;

      const { data, error } = await sb
        .from('strategies')
        .select('id, name, color, description')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true });

      strategiesList = (!error && data) ? data : [];

      const select = el('price-strategy');
      if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">— Strateji Yok —</option>';
        strategiesList.forEach(function(s) {
          const option = document.createElement('option');
          option.value = s.id;
          option.textContent = s.name;
          select.appendChild(option);
        });
        if (currentValue) select.value = currentValue;
      }

    } catch (e) {
      wwLog.warn('Stratejiler yüklenemedi:', e);
    }
  }

  // ============================================================
  // ENSTRÜMAN SEÇ
  // ============================================================

  function selectInstrument(instrument, multiplier) {
    currentInstrument = instrument;
    currentMultiplier = multiplier;

    qsa('.quick-add-instrument-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.instrument === instrument);
    });

    const customWrap = el('price-custom-multiplier-wrap');
    if (customWrap) {
      customWrap.style.display = instrument === 'other' ? 'block' : 'none';
    }

    updatePricePreview();
  }

  // ============================================================
  // FİYAT ÖN İZLEME — DEBONCE YOK, ANINDA GÜNCELLEME
  // ============================================================

  function getMultiplier() {
    if (currentInstrument === 'other') {
      const customEl = el('price-custom-multiplier');
      const v = customEl ? parseFloat(customEl.value) : null;
      return isNaN(v) ? null : v;
    }
    return currentMultiplier || 1;
  }

  function updatePricePreview() {
    wwLog.log('🔄 Preview güncelleniyor...');

    const entry = parseFloat(el('price-entry')?.value);
    const exit = parseFloat(el('price-exit')?.value);
    const lot = parseFloat(el('price-lot')?.value);
    const sl = parseFloat(el('price-sl')?.value);
    const tp = parseFloat(el('price-tp')?.value);
    const dir = currentSide === 'BUY' ? 'LONG' : 'SHORT';
    const mult = getMultiplier();

    const previewEl = el('price-preview');
    const pnlEl = el('preview-pnl');
    const rrEl = el('preview-rr');

    let hasPnl = false;
    let hasRr = false;
    let pnlSign = 0;

    if (entry && lot && !isNaN(entry) && !isNaN(lot) && mult !== null) {
      if (exit && !isNaN(exit)) {
        try {
          let pnl = 0;
          if (typeof calcPnL === 'function') {
            pnl = calcPnL(entry, exit, lot, dir, 'other', mult);
          } else {
            const direction = (dir && (dir.toUpperCase() === 'LONG' || dir.toUpperCase() === 'BUY')) ? 1 : -1;
            pnl = direction * (parseFloat(exit) - parseFloat(entry)) * parseFloat(lot) * mult;
          }
          if (pnlEl && typeof formatCurrency === 'function') {
            pnlEl.textContent = formatCurrency(pnl);
            pnlEl.className = 'p-val' + (pnl >= 0 ? ' pos' : ' neg');
          }
          pnlSign = pnl >= 0 ? 1 : -1;
          hasPnl = true;
          wwLog.log('✅ PnL hesaplandı:', pnl);
        } catch(e) {
          wwLog.warn('PnL preview hatası:', e);
        }
      }

      if (sl && tp && !isNaN(sl) && !isNaN(tp)) {
        try {
          let rr = null;
          if (typeof calcRR === 'function') {
            rr = calcRR(entry, sl, tp, dir);
          } else {
            const risk = Math.abs(entry - sl);
            const reward = Math.abs(tp - entry);
            if (risk > 0) rr = (reward / risk).toFixed(2);
          }
          if (rr !== null && rrEl) {
            rrEl.textContent = '1 : ' + rr;
            hasRr = true;
          }
        } catch(e) {
          wwLog.warn('RR preview hatası:', e);
        }
      }
    }

    if (previewEl) {
      previewEl.classList.toggle('visible', hasPnl || hasRr);
      previewEl.classList.remove('rail-pos', 'rail-neg');
      if (hasPnl) {
        previewEl.classList.add(pnlSign >= 0 ? 'rail-pos' : 'rail-neg');
      }
    }
  }

  // ============================================================
  // MODAL KONTROLLERİ
  // ============================================================

  function openModal() {
    const overlay = el('quick-add-overlay');
    if (!overlay) return;

    resetForm();
    setSide('BUY');
    switchTab('price');
    selectInstrument('forex', 100000);
    loadStrategies();

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(function() {
      const symbol = el('price-symbol');
      if (symbol) symbol.focus();
    }, 100);
  }

  function closeModal() {
    const overlay = el('quick-add-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    isSubmitting = false;
    isImporting = false;
    csvPreviewData = null;

    const loading = el('quick-add-loading');
    if (loading) loading.classList.remove('active');

    csvFile = null;
    const fileInput = el('quick-csv-file');
    if (fileInput) fileInput.value = '';

    const previewContainer = el('csv-preview-container');
    if (previewContainer) previewContainer.style.display = 'none';
  }

  function resetForm() {
    const today = new Date().toISOString().split('T')[0];

    const pSymbol = el('price-symbol');
    const pLot = el('price-lot');
    const pEntry = el('price-entry');
    const pExit = el('price-exit');
    const pSl = el('price-sl');
    const pTp = el('price-tp');
    const pCustom = el('price-custom-multiplier');
    const pStrategy = el('price-strategy');
    const pNotes = el('price-notes');
    const pDate = el('price-date');
    if (pSymbol) pSymbol.value = '';
    if (pLot) pLot.value = '1.00';
    if (pEntry) pEntry.value = '';
    if (pExit) pExit.value = '';
    if (pSl) pSl.value = '';
    if (pTp) pTp.value = '';
    if (pCustom) pCustom.value = '';
    if (pStrategy) pStrategy.value = '';
    if (pNotes) pNotes.value = '';
    if (pDate) pDate.value = today;

    const bulkText = el('quick-bulk-textarea');
    if (bulkText) bulkText.value = '';

    const error = el('quick-add-error');
    if (error) error.classList.remove('active');

    const loading = el('quick-add-loading');
    if (loading) loading.classList.remove('active');

    const csvLog = el('quick-csv-log');
    if (csvLog) { csvLog.style.display = 'none'; csvLog.innerHTML = ''; }
    const csvStatus = el('quick-csv-status');
    if (csvStatus) csvStatus.style.display = 'none';

    const bulkLog = el('quick-bulk-log');
    if (bulkLog) { bulkLog.style.display = 'none'; bulkLog.innerHTML = ''; }
    const bulkProgress = el('quick-bulk-progress');
    if (bulkProgress) bulkProgress.style.display = 'none';

    const preview = el('price-preview');
    if (preview) preview.classList.remove('visible', 'rail-pos', 'rail-neg');

    const saveBtn = el('quick-add-save');
    const importBtn = el('quick-import-btn');
    const bulkBtn = el('quick-bulk-btn');
    if (saveBtn) saveBtn.style.display = '';
    if (importBtn) importBtn.style.display = 'none';
    if (bulkBtn) bulkBtn.style.display = 'none';
  }

  function switchTab(tab) {
    currentTab = tab;

    qsa('.quick-tab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    qsa('.quick-tab-content').forEach(function(content) {
      content.classList.toggle('active', content.id === 'tab-' + tab);
    });

    const saveBtn = el('quick-add-save');
    const importBtn = el('quick-import-btn');
    const bulkBtn = el('quick-bulk-btn');

    if (saveBtn) saveBtn.style.display = (tab === 'csv' || tab === 'bulk') ? 'none' : '';
    if (importBtn) importBtn.style.display = (tab === 'csv') ? '' : 'none';
    if (bulkBtn) bulkBtn.style.display = (tab === 'bulk') ? '' : 'none';

    const error = el('quick-add-error');
    if (error) error.classList.remove('active');
  }

  function setSide(side) {
    currentSide = side;

    const buyBtn = el('price-side-buy');
    const sellBtn = el('price-side-sell');
    if (buyBtn && sellBtn) {
      buyBtn.classList.toggle('active-buy', side === 'BUY');
      sellBtn.classList.toggle('active-sell', side === 'SELL');
    }

    updatePricePreview();
  }

  function setLotPreset(value) {
    const input = el('price-lot');
    if (!input) return;
    input.value = value;

    qsa('.lot-preset').forEach(function(btn) {
      btn.classList.toggle('active', parseFloat(btn.dataset.lot) === parseFloat(value));
    });

    updatePricePreview();
  }

  // ============================================================
  // CSV IMPORT - Önizleme ile
  // ============================================================

  function renderCSVLog(messages) {
    const elm = el('quick-csv-log');
    if (elm) {
      if (messages && messages.length > 0) {
        elm.style.display = 'block';
        elm.innerHTML = messages.join('');
      } else {
        elm.style.display = 'none';
        elm.innerHTML = '';
      }
    }
  }

  function showCsvPreview(rows, headers) {
    const container = el('csv-preview-container');
    if (!container) return;

    container.style.display = 'block';
    let html = '<div style="margin-top:12px;padding:12px;background:var(--surface2);border-radius:8px;border:1px solid var(--border);">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<span style="font-size:13px;font-weight:600;">Önizleme (' + rows.length + ' satır)</span>';
    html += '<button class="btn btn-primary" id="csv-confirm-import" style="font-size:12px;padding:4px 12px;display:inline-flex;align-items:center;gap:4px;">' + ICONS.check + '<span>İçe Aktar</span></button>';
    html += '</div>';
    html += '<div style="overflow-x:auto;max-height:200px;overflow-y:auto;font-size:12px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-family:\'DM Mono\',monospace;">';

    html += '<thead><tr style="background:var(--surface);">';
    headers.forEach(function(h) {
      html += '<th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border);">' + escapeHtml(h) + '</th>';
    });
    html += '</tr></thead>';

    html += '<tbody>';
    const displayRows = rows.slice(0, 10);
    displayRows.forEach(function(row) {
      html += '<tr>';
      row.forEach(function(cell) {
        html += '<td style="padding:4px 8px;border-bottom:1px solid var(--border);">' + escapeHtml(String(cell || '')) + '</td>';
      });
      html += '</tr>';
    });
    if (rows.length > 10) {
      html += '<tr><td colspan="' + headers.length + '" style="padding:8px;text-align:center;color:var(--muted);">... ve ' + (rows.length - 10) + ' satır daha</td></tr>';
    }
    html += '</tbody></table>';
    html += '</div></div>';

    container.innerHTML = html;

    const confirmBtn = el('csv-confirm-import');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        executeCsvImport();
      });
    }
  }

  async function handleCsvFileSelect(file) {
    try {
      csvFile = file;
      const statusEl = el('quick-csv-status');
      const filenameEl = el('quick-csv-filename');
      const badgeEl = el('quick-csv-badge');

      if (statusEl) statusEl.style.display = 'flex';
      if (filenameEl) filenameEl.textContent = 'Dosya seçildi: ' + file.name;
      if (badgeEl) badgeEl.innerHTML = badgeIcon('loading');

      const text = await file.text();
      const parsed = parseCsvText(text);

      if (parsed.length < 2) {
        showToast('CSV dosyasında veri bulunamadı!', 'error');
        if (badgeEl) badgeEl.innerHTML = badgeIcon('error');
        return;
      }

      const headers = parsed[0].map(function(h) { return h.trim().toLowerCase(); });
      const dataRows = parsed.slice(1);

      showCsvPreview(dataRows, headers);
      if (badgeEl) badgeEl.innerHTML = badgeIcon('success');

      csvPreviewData = {
        headers: headers,
        rows: dataRows,
        rawText: text
      };

    } catch(e) {
      wwLog.warn('CSV okuma hatası:', e);
      showToast('CSV okuma hatası: ' + e.message, 'error');
      const badgeEl = el('quick-csv-badge');
      if (badgeEl) badgeEl.innerHTML = badgeIcon('error');
    }
  }

  // ⭐ CHUNKING: 500'lük parçalarla insert + kısmi başarı + real-time progress
  async function executeCsvImport() {
    if (isImporting || !csvPreviewData) return;

    const user = await requireAuth();
    if (!user) {
      showToast('Lütfen giriş yapın!', 'error');
      return;
    }

    const progressEl = el('quick-csv-status');
    const statusText = el('quick-csv-filename');
    const badge = el('quick-csv-badge');
    const log = [];

    isImporting = true;
    if (statusText) statusText.textContent = 'İşleniyor...';
    if (badge) badge.innerHTML = badgeIcon('loading');
    if (progressEl) progressEl.style.display = 'flex';

    let failed = 0;

    try {
      const { headers, rows } = csvPreviewData;
      let imported = 0;
      const trades = [];

      // ⭐ 1. ADIM: Tüm satırları parse et, trades dizisine topla
      for (let i = 0; i < rows.length; i++) {
        const values = rows[i];
        if (values.length < 5) {
          log.push('<div>' + logTag('warning') + ' — Satır ' + (i + 1) + ': Yetersiz sütun (' + values.length + '), atlandı.</div>');
          failed++;
          continue;
        }

        const row = {};
        for (let hIdx = 0; hIdx < headers.length && hIdx < values.length; hIdx++) {
          row[headers[hIdx]] = values[hIdx] ? values[hIdx].trim() : '';
        }

        const symbol = (row.symbol || row.sembol || '').toUpperCase();
        const direction = (row.yon || row.direction || '').toUpperCase();
        const lot = parseFloat(row.lot || 0);
        const entry = parseFloat(row.entry || row.giris || row.entry_price || 0);
        const exit = parseFloat(row.exit || row.cikis || row.exit_price);
        const tradeDate = validateAndFormatDate(row.tarih || row.date || '');
        let instrument = (row.instrument || row.enstruman || 'forex').toLowerCase();
        let multiplier = parseFloat(row.multiplier || row.carpan || 0);

        const validInstruments = ['forex', 'gold', 'index', 'crypto', 'other'];
        if (!validInstruments.includes(instrument)) {
          instrument = 'forex';
          multiplier = 100000;
        }

        if (!multiplier || isNaN(multiplier) || multiplier === 0) {
          const instMap = { forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 };
          multiplier = instMap[instrument] || 100000;
        }

        if (!symbol || !direction || isNaN(lot) || isNaN(entry)) {
          log.push('<div>' + logTag('error') + ' — Satır ' + (i + 1) + ': Zorunlu alan eksik, atlandı.</div>');
          failed++;
          continue;
        }

        let finalDir = 'SHORT';
        if (direction === 'BUY' || direction === 'LONG') finalDir = 'LONG';
        else if (direction === 'SELL' || direction === 'SHORT') finalDir = 'SHORT';
        else log.push('<div>' + logTag('warning') + ' — Satır ' + (i + 1) + ': Bilinmeyen yön "' + escapeHtml(direction) + '", SHORT olarak kaydedildi.</div>');

        trades.push({
          user_id: user.id,
          symbol: symbol,
          direction: finalDir,
          instrument: instrument,
          lot: lot,
          entry_price: entry,
          exit_price: isNaN(exit) ? null : exit,
          trade_date: tradeDate,
          notes: 'CSV Import - ' + new Date().toLocaleString('tr-TR'),
          multiplier: multiplier
        });
      }

      // ⭐ 2. ADIM: Chunk'lara böl ve parça parça insert et
      if (trades.length > 0) {
        const chunks = chunkArray(trades, CHUNK_SIZE);
        const totalChunks = chunks.length;

        for (let c = 0; c < totalChunks; c++) {
          const chunk = chunks[c];

          // ⭐ Progress güncelle
          if (statusText) {
            statusText.textContent = 'Kaydediliyor... (' + (c + 1) + '/' + totalChunks + ' parça, ' + imported + '/' + trades.length + ' işlem)';
          }

          const { error } = await sb.from('trades').insert(chunk);

          if (error) {
            // ⭐ Bu chunk başarısız — diğer chunk'lar etkilenmez
            log.push('<div>' + logTag('error') + ' — Parça ' + (c + 1) + '/' + totalChunks + ' başarısız: ' + escapeHtml(error.message) + '</div>');
            failed += chunk.length;
          } else {
            imported += chunk.length;
          }
        }
      }

      renderCSVLog(log);
      if (progressEl) progressEl.style.display = 'none';

      const msg = imported + ' işlem içe aktarıldı' + (failed > 0 ? ', ' + failed + ' başarısız' : '') + '.';
      showToast(msg, failed > 0 ? 'error' : 'success');

      if (imported > 0) {
        const previewContainer = el('csv-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        csvPreviewData = null;

        setTimeout(function() {
          closeModal();
          window.location.href = 'trades.html';
        }, 1500);
      }

    } catch(e) {
      wwLog.warn('CSV import hatası:', e);
      if (progressEl) progressEl.style.display = 'none';
      showToast('CSV import hatası: ' + e.message, 'error');
    }

    isImporting = false;
    if (badge) badge.innerHTML = badgeIcon(failed > 0 ? 'warning' : 'success');
  }

  // ============================================================
  // BULK IMPORT - Toplu insert ile (CHUNKING)
  // ============================================================

  async function handleBulkImport() {
    if (isSubmitting) return;

    const textarea = el('quick-bulk-textarea');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
      showToast('Lütfen en az bir işlem girin!', 'error');
      return;
    }

    const lines = text.split('\n').filter(function(l) { return l.trim(); });
    if (lines.length === 0) {
      showToast('Lütfen en az bir işlem girin!', 'error');
      return;
    }

    const user = await requireAuth();
    if (!user) {
      showToast('Lütfen giriş yapın!', 'error');
      return;
    }

    const progressEl = el('quick-bulk-progress');
    const statusEl = el('quick-bulk-status');
    const fillEl = el('quick-bulk-fill');
    const logEl = el('quick-bulk-log');
    const errors = [];
    const trades = [];
    const defaultDate = new Date().toISOString().split('T')[0];

    isSubmitting = true;
    if (progressEl) progressEl.style.display = 'block';
    if (fillEl) fillEl.style.width = '0%';
    if (statusEl) statusEl.textContent = '0 / ' + lines.length + ' işlem işleniyor...';
    if (logEl) { logEl.style.display = 'none'; logEl.innerHTML = ''; }

    // ⭐ 1. ADIM: Satırları parse et, trades dizisine topla
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const parts = lines[lineIdx].split(',').map(function(p) { return p.trim(); });

      if (parts.length < 5) {
        errors.push('<div>' + logTag('error') + ' — Satır ' + (lineIdx + 1) + ': Yetersiz alan (' + parts.length + ' alan, en az 5 gerekli)</div>');
        continue;
      }

      const symbol = parts[0].toUpperCase();
      const direction = parts[1].toUpperCase();
      const lot = parseFloat(parts[2]);
      const entry = parseFloat(parts[3]);
      const exit = parts[4] ? parseFloat(parts[4]) : null;
      const date = parts[5] ? validateAndFormatDate(parts[5]) : defaultDate;
      const notes = parts[6] || 'Toplu ekleme - ' + new Date().toLocaleString('tr-TR');

      if (!symbol || !direction || isNaN(lot) || isNaN(entry)) {
        errors.push('<div>' + logTag('error') + ' — Satır ' + (lineIdx + 1) + ': Zorunlu alanlar eksik (sembol, yön, lot, giriş)</div>');
        continue;
      }

      let finalDir = 'SHORT';
      if (direction === 'BUY' || direction === 'LONG') finalDir = 'LONG';

      trades.push({
        user_id: user.id,
        symbol: symbol,
        direction: finalDir,
        instrument: 'forex',
        lot: lot,
        entry_price: entry,
        exit_price: exit,
        trade_date: date,
        notes: notes || null,
        multiplier: 100000
      });
    }

    if (errors.length > 0) {
      if (logEl) {
        logEl.style.display = 'block';
        logEl.innerHTML = errors.join('');
      }
      showToast(errors.length + ' hata var!', 'error');
      isSubmitting = false;
      if (progressEl) progressEl.style.display = 'none';
      return;
    }

    if (trades.length === 0) {
      showToast('Geçerli işlem bulunamadı!', 'error');
      isSubmitting = false;
      if (progressEl) progressEl.style.display = 'none';
      return;
    }

    // ⭐ 2. ADIM: Chunk'lara böl ve parça parça insert et
    let success = 0;
    let failed = 0;

    try {
      const chunks = chunkArray(trades, CHUNK_SIZE);
      const totalChunks = chunks.length;

      for (let c = 0; c < totalChunks; c++) {
        const chunk = chunks[c];

        // ⭐ Progress güncelle
        if (statusEl) {
          statusEl.textContent = 'Kaydediliyor... (' + (c + 1) + '/' + totalChunks + ' parça, ' + success + '/' + trades.length + ' işlem)';
        }
        if (fillEl) {
          fillEl.style.width = (((c + 1) / totalChunks) * 100) + '%';
        }

        const { error } = await sb.from('trades').insert(chunk);

        if (error) {
          errors.push('<div>' + logTag('error') + ' — Parça ' + (c + 1) + '/' + totalChunks + ': ' + escapeHtml(error.message) + '</div>');
          failed += chunk.length;
        } else {
          success += chunk.length;
        }
      }

      // ⭐ Sonuç
      if (failed > 0) {
        if (logEl) {
          logEl.style.display = 'block';
          logEl.innerHTML = errors.join('');
        }
        if (fillEl) fillEl.style.background = 'var(--red)';
        if (statusEl) statusEl.textContent = '⚠️ ' + success + ' işlem eklendi, ' + failed + ' başarısız!';
        showToast(success + ' işlem eklendi, ' + failed + ' başarısız!', 'error');
      } else {
        if (statusEl) statusEl.textContent = '✅ ' + success + ' işlem başarıyla eklendi!';
        if (fillEl) fillEl.style.background = 'var(--green)';
        showToast(success + ' işlem başarıyla eklendi!', 'success');

        setTimeout(function() {
          closeModal();
          window.location.href = 'trades.html';
        }, 1500);
      }
    } catch(e) {
      wwLog.warn('Bulk import hatası:', e);
      if (logEl) {
        logEl.style.display = 'block';
        logEl.innerHTML = '<div>' + logTag('error') + ' — ' + escapeHtml(e.message) + '</div>';
      }
      showToast('İşlem eklenirken hata oluştu: ' + e.message, 'error');
    }

    isSubmitting = false;
    if (progressEl) {
      setTimeout(function() { progressEl.style.display = 'none'; }, 3000);
    }
  }

  // ============================================================
  // SAYFA YENİLEME
  // ============================================================

  function refreshPage() {
    if (typeof loadTrades === 'function') {
      loadTrades();
    }
    if (typeof refresh === 'function') {
      refresh();
    } else if (typeof applyFiltersAndSort === 'function') {
      applyFiltersAndSort();
    } else {
      setTimeout(function() {
        window.location.reload();
      }, 300);
    }
  }

  // ============================================================
  // SAVE TRADE - ANA FONKSİYON
  // ============================================================

  async function saveTrade() {
    if (isSubmitting) return;
    if (currentTab !== 'price') return;

    const error = el('quick-add-error');
    const errorText = el('quick-add-error-text');
    const loading = el('quick-add-loading');
    const saveBtn = el('quick-add-save');
    const cancelBtn = el('quick-add-cancel');

    function showError(msg) {
      if (errorText) errorText.textContent = msg;
      else if (error) error.textContent = msg;
      if (error) error.classList.add('active');
    }

    if (error) error.classList.remove('active');

    if (!checkGlobals()) {
      showError('Sistem bağlantısı yok!');
      return;
    }

    const user = await requireAuth();
    if (!user) {
      showError('Lütfen önce giriş yapın!');
      return;
    }

    const symbol = el('price-symbol')?.value?.trim()?.toUpperCase() || '';
    const lot = parseFloat(el('price-lot')?.value);
    const entry = parseFloat(el('price-entry')?.value);
    const exit = parseFloat(el('price-exit')?.value) || null;
    const sl = parseFloat(el('price-sl')?.value) || null;
    const tp = parseFloat(el('price-tp')?.value) || null;
    const customMult = parseFloat(el('price-custom-multiplier')?.value);
    const strategyId = el('price-strategy')?.value || null;
    const notes = el('price-notes')?.value || null;
    const instrument = currentInstrument || 'forex';
    const dateInput = el('price-date')?.value;
    const date = dateInput || new Date().toISOString().split('T')[0];

    let mult = currentMultiplier;
    if (instrument === 'other' && !isNaN(customMult) && customMult > 0) {
      mult = customMult;
    }

    if (!symbol) {
      showError('Lütfen bir sembol girin!');
      el('price-symbol')?.focus();
      return;
    }

    if (isNaN(entry) || !entry || entry === 0) {
      showError('Giriş fiyatı geçerli bir sayı olmalı!');
      el('price-entry')?.focus();
      return;
    }

    if (isNaN(lot) || !lot || lot === 0) {
      showError('Lot geçerli bir sayı olmalı!');
      el('price-lot')?.focus();
      return;
    }

    if (instrument === 'other' && (isNaN(mult) || mult === 0)) {
      showError('Manuel çarpan geçerli bir sayı olmalı!');
      el('price-custom-multiplier')?.focus();
      return;
    }

    const direction = currentSide === 'BUY' ? 'LONG' : 'SHORT';

    const tradeData = {
      user_id: user.id,
      symbol: symbol,
      direction: direction,
      instrument: instrument,
      lot: lot,
      entry_price: entry,
      exit_price: exit,
      stop_loss: sl,
      take_profit: tp,
      pnl: null,
      rr_ratio: null,
      trade_date: date,
      strategy_id: strategyId || null,
      notes: notes,
      multiplier: mult || 100000,
      is_quick_entry: false
    };

    isSubmitting = true;
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (loading) loading.classList.add('active');
    if (error) error.classList.remove('active');

    try {
      const { error: insertError } = await sb.from('trades').insert([tradeData]);

      if (insertError) {
        console.error('Insert hatası:', insertError);
        showError('Kaydetme hatası: ' + insertError.message);
        return;
      }

      if (typeof showToast === 'function') {
        showToast('İşlem başarıyla eklendi', 'success');
      }

      closeModal();
      refreshPage();

    } catch (e) {
      console.error('Kaydetme hatası:', e);
      showError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      isSubmitting = false;
      if (saveBtn) saveBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (loading) loading.classList.remove('active');
    }
  }

  // ============================================================
  // ⭐ FAB BUTONUNU OLUŞTUR (body'ye kalıcı olarak)
  // ============================================================

  function createFab() {
    if (document.getElementById('quick-add-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'quick-add-fab';
    fab.className = 'quick-add-fab';
    fab.setAttribute('aria-label', 'Yeni İşlem Ekle');
    fab.title = 'Yeni İşlem Ekle';
    fab.innerHTML = ICONS.plus;
    fab.addEventListener('click', openModal);
    document.body.appendChild(fab);
    wwLog.log('✅ FAB butonu oluşturuldu');
  }

  // ============================================================
  // MODAL EVENT LISTENER'LARI
  // ============================================================

  function attachModalEvents() {
    // Kapatma butonları
    const closeBtn = document.getElementById('quick-add-close');
    const cancelBtn = document.getElementById('quick-add-cancel');
    const overlay = document.getElementById('quick-add-overlay');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', closeModal);
    }
    if (overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal();
      });
    }

    // ESC
    document.addEventListener('keydown', handleEsc);

    // Tabs
    document.querySelectorAll('.quick-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchTab(this.dataset.tab);
      });
    });

    // Yön butonları
    const buyBtn = document.getElementById('price-side-buy');
    const sellBtn = document.getElementById('price-side-sell');
    if (buyBtn) {
      buyBtn.addEventListener('click', function() { setSide('BUY'); });
    }
    if (sellBtn) {
      sellBtn.addEventListener('click', function() { setSide('SELL'); });
    }

    // Lot presetleri
    document.querySelectorAll('.lot-preset').forEach(function(btn) {
      btn.addEventListener('click', function() {
        setLotPreset(this.dataset.lot);
      });
    });

    const lotInput = document.getElementById('price-lot');
    if (lotInput) {
      lotInput.addEventListener('input', function() {
        const val = parseFloat(this.value);
        if (!isNaN(val)) {
          document.querySelectorAll('.lot-preset').forEach(function(btn) {
            btn.classList.toggle('active', parseFloat(btn.dataset.lot) === val);
          });
        }
        updatePricePreview();
      });
    }

    // Enstrüman butonları
    document.querySelectorAll('.quick-add-instrument-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const inst = this.dataset.instrument;
        const mult = parseFloat(this.dataset.multiplier) || 1;
        selectInstrument(inst, mult);
      });
    });

    // ⭐ Event delegation - tüm input değişiklikleri
    const body = document.querySelector('.quick-add-body');
    if (body) {
      body.addEventListener('input', function(e) {
        const target = e.target;
        const id = target.id;
        
        if (id === 'price-entry' || id === 'price-exit' || id === 'price-sl' || 
            id === 'price-tp' || id === 'price-lot' || id === 'price-custom-multiplier') {
          updatePricePreview();
        }
        if (id === 'price-symbol') {
          target.value = target.value.toUpperCase();
        }
      });

      body.addEventListener('change', function(e) {
        const target = e.target;
        const id = target.id;
        if (id === 'price-entry' || id === 'price-exit' || id === 'price-sl' || 
            id === 'price-tp' || id === 'price-lot' || id === 'price-custom-multiplier') {
          updatePricePreview();
        }
      });

      body.addEventListener('keyup', function(e) {
        const target = e.target;
        const id = target.id;
        if (id === 'price-entry' || id === 'price-exit' || id === 'price-sl' || 
            id === 'price-tp' || id === 'price-lot' || id === 'price-custom-multiplier') {
          updatePricePreview();
        }
      });
    }

    // Kaydet
    const saveBtn = document.getElementById('quick-add-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveTrade);
    }

    // Enter ile kaydet
    document.querySelectorAll('.quick-add-body input, .quick-add-body select').forEach(function(input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveTrade();
        }
      });
    });

    // Strateji oluştur
    const createStrategyBtn = document.getElementById('price-create-strategy');
    if (createStrategyBtn) {
      createStrategyBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/strategies.html';
      });
    }

    // İçe aktar butonu (CSV)
    const importBtn = document.getElementById('quick-import-btn');
    if (importBtn) {
      importBtn.addEventListener('click', executeCsvImport);
    }

    // Toplu ekle butonu
    const bulkBtn = document.getElementById('quick-bulk-btn');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', handleBulkImport);
    }

    // CSV dosya seçimi
    const csvSelectBtn = document.getElementById('quick-csv-select');
    const csvFileInput = document.getElementById('quick-csv-file');
    if (csvSelectBtn && csvFileInput) {
      csvSelectBtn.addEventListener('click', function() {
        csvFileInput.click();
      });
      csvFileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          handleCsvFileSelect(this.files[0]);
        }
      });
    }

    // Ondalık düzeltme
    if (typeof applyDecimalFix === 'function') {
      applyDecimalFix(['price-lot', 'price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-custom-multiplier']);
    }
  }

  // ============================================================
  // MODAL'ı oluştur (container'a)
  // ============================================================

  function createModal() {
    let container = document.getElementById('quick-add-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'quick-add-container';
      document.body.appendChild(container);
    }
    container.innerHTML = getModalHTML();
    attachModalEvents();
    wwLog.log('✅ Quick Add modal oluşturuldu');
  }

  // ============================================================
  // ESC handler
  // ============================================================

  function handleEsc(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('quick-add-overlay');
      if (overlay && overlay.classList.contains('active')) {
        closeModal();
      }
    }
  }

  // ============================================================
  // GLOBAL ERİŞİM
  // ============================================================

  window.quickAddOpen = openModal;
  window.quickAddClose = closeModal;

  // ============================================================
  // INIT - SADECE BİR KEZ
  // ============================================================

  let initialized = false;

  function initQuickAdd() {
    if (initialized) return;
    initialized = true;

    createFab();
    createModal();

    wwLog.log('✅ Quick Add Modal başlatıldı. FAB butonu aktif.');
  }

  // ============================================================
  // DOM READY
  // ============================================================
  // ⭐ TEMİZLİK: window.load fallback'i KALDIRILDI
  //        - DOMContentLoaded + 100ms zaten initQuickAdd() çağırıyor
  //        - window.load, 100ms dolmadan tetiklenip yanlışlıkla
  //          "FAB butonu bulunamadı" uyarısı basıyordu
  //        - initialized guard'ı sayesinde zaten işlevsizdi

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initQuickAdd, 100);
    });
  } else {
    setTimeout(initQuickAdd, 100);
  }

})();

wwLog.log('quick-add.js yüklendi. (FAB kalıcı)');