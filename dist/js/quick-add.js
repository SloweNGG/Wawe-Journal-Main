// ============================================================
// QUICK ADD MODAL - HIZLI İŞLEM EKLEME
// TAMAMEN YENİDEN YAZILDI - TÜM SORUNLAR GİDERİLDİ
// ============================================================

// ============================================================
// BAĞIMLILIK LİSTESİ (Global değişkenler/fonksiyonlar)
// ============================================================
// - sb (Supabase client)
// - requireAuth() (Auth kontrolü)
// - calcPnL() (P&L hesaplama)
// - calcRR() (Risk/Reward hesaplama)
// - formatCurrency() (Para formatlama)
// - showToast() (Bildirim gösterme)
// - applyDecimalFix() (Ondalık giriş düzeltme)
// - loadTrades() (İşlemleri yeniden yükleme)
// - refresh() (Sayfa yenileme)
// - applyFiltersAndSort() (Filtre ve sıralama uygulama)
// ============================================================

(function() {
  'use strict';

  // ============================================================
  // STATE
  // ============================================================
  
  let currentSide = 'BUY';
  let currentTab = 'quick';
  let strategiesList = [];
  let isSubmitting = false;
  let selectedStrategyId = null;
  let csvFile = null;
  let isImporting = false;
  let currentInstrument = 'forex';
  let currentMultiplier = 100000;
  let csvPreviewData = null;

  function el(id) { return document.getElementById(id); }
  function qsa(selector) { return document.querySelectorAll(selector); }
  function qs(selector) { return document.querySelector(selector); }

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
      console.warn('⚠️ Eksik global bağımlılıklar:', missing.join(', '));
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
    
    // Zaten ISO formatında mı? (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    }
    
    // DD.MM.YYYY
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
    
    // DD/MM/YYYY veya MM/DD/YYYY
    parts = dateString.split('/');
    if (parts.length === 3) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      if (!isNaN(first) && !isNaN(second) && !isNaN(year) && year > 2000 && year < 2100) {
        // Önce DD/MM dene
        let d = new Date(year, second - 1, first);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
        // Sonra MM/DD dene
        d = new Date(year, first - 1, second);
        if (!isNaN(d.getTime())) {
          console.warn('⚠️ Tarih formatı belirsiz (DD/MM vs MM/DD):', dateString, '-> MM/DD olarak yorumlandı');
          return d.toISOString().split('T')[0];
        }
      }
    }
    
    // Genel Date constructor dene
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    
    console.warn('⚠️ Tarih ayrıştırılamadı, bugünün tarihi kullanılacak:', dateString);
    return new Date().toISOString().split('T')[0];
  }

  // ============================================================
  // HTML TEMPLATE
  // ============================================================
  
  function getModalHTML() {
    const today = new Date().toISOString().split('T')[0];
    return `
      <div class="quick-add-overlay" id="quick-add-overlay">
        <div class="quick-add-modal">
          
          <!-- HEADER -->
          <div class="quick-add-header">
            <h2>📝 Hızlı İşlem Ekle</h2>
            <button class="close-btn" id="quick-add-close">✕</button>
          </div>
          
          <!-- TABS -->
          <div class="quick-add-tabs" id="quick-tabs">
            <button class="quick-tab active" data-tab="quick">⚡ Hızlı Ekle</button>
            <button class="quick-tab" data-tab="price">📊 Fiyattan Hesapla</button>
            <button class="quick-tab" data-tab="csv">📁 CSV</button>
            <button class="quick-tab" data-tab="bulk">📋 Toplu</button>
          </div>
          
          <!-- BODY -->
          <div class="quick-add-body">
            <div class="quick-add-error" id="quick-add-error"></div>
            
            <!-- ==========================================================
                 TAB 1: QUICK ADD - SADECE P&L ve R/R
                 ========================================================== -->
            <div class="quick-tab-content active" id="tab-quick">
              
              <div class="quick-add-field">
                <label>Sembol *</label>
                <input type="text" id="quick-symbol" placeholder="EURUSD" style="text-transform:uppercase;" autofocus>
              </div>
              
              <div class="quick-add-field">
                <label>Yön *</label>
                <div class="quick-add-side-toggle">
                  <button class="quick-add-side-btn active-buy" data-side="BUY" id="quick-side-buy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    Buy ↑
                  </button>
                  <button class="quick-add-side-btn" data-side="SELL" id="quick-side-sell">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                    Sell ↓
                  </button>
                </div>
              </div>
              
              <div class="quick-add-field">
                <label>P&L *</label>
                <div class="quick-add-pnl-wrap">
                  <span class="currency-symbol">$</span>
                  <input type="text" inputmode="decimal" id="quick-pnl" placeholder="0.00">
                  <span class="pnl-suffix">USD</span>
                </div>
              </div>
              
              <div class="quick-add-field">
                <label>Risk / Reward</label>
                <div class="quick-add-rr-wrap">
                  <span class="rr-label">1 :</span>
                  <input type="text" inputmode="decimal" id="quick-rr" placeholder="2" value="2">
                  <div class="rr-presets">
                    <button class="rr-preset" data-rr="0.5">0.5</button>
                    <button class="rr-preset active" data-rr="2">2</button>
                    <button class="rr-preset" data-rr="3">3</button>
                    <button class="rr-preset" data-rr="5">5</button>
                  </div>
                </div>
              </div>
              
              <div class="quick-add-field">
                <label>Strateji</label>
                <div class="quick-add-strategy-wrap">
                  <select id="quick-strategy">
                    <option value="">— Strateji Yok —</option>
                  </select>
                  <button class="create-strategy-btn" id="quick-create-strategy">+ Yeni</button>
                </div>
              </div>
              
              <div class="quick-add-field quick-add-notes">
                <label>Notlar</label>
                <textarea id="quick-notes" placeholder="Notlar…" rows="2"></textarea>
              </div>
              
              <div class="quick-add-field" style="margin-bottom:0;">
                <label>Tarih</label>
                <input type="date" id="quick-date" value="${today}">
              </div>
            </div>
            
            <!-- ==========================================================
                 TAB 2: PRICE BASED - TÜM ALANLAR
                 ========================================================== -->
            <div class="quick-tab-content" id="tab-price">
              
              <div class="quick-add-field">
                <label>Sembol *</label>
                <input type="text" id="price-symbol" placeholder="EURUSD" style="text-transform:uppercase;">
              </div>
              
              <div class="quick-add-field">
                <label>Yön *</label>
                <div class="quick-add-side-toggle">
                  <button class="quick-add-side-btn active-buy" data-side="BUY" id="price-side-buy">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                    Buy ↑
                  </button>
                  <button class="quick-add-side-btn" data-side="SELL" id="price-side-sell">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>
                    Sell ↓
                  </button>
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
              
              <div class="quick-add-field">
                <label>Lot *</label>
                <input type="text" inputmode="decimal" id="price-lot" placeholder="0.10" value="1.00">
              </div>
              
              <div class="quick-add-field">
                <label>Giriş Fiyatı *</label>
                <input type="text" inputmode="decimal" id="price-entry" placeholder="1.08500">
              </div>
              
              <div class="quick-add-field">
                <label>Çıkış Fiyatı</label>
                <input type="text" inputmode="decimal" id="price-exit" placeholder="1.09000">
              </div>
              
              <div class="quick-add-field">
                <label>Stop Loss</label>
                <input type="text" inputmode="decimal" id="price-sl" placeholder="1.08000">
              </div>
              
              <div class="quick-add-field">
                <label>Take Profit</label>
                <input type="text" inputmode="decimal" id="price-tp" placeholder="1.09500">
              </div>
              
              <div class="quick-add-preview" id="price-preview">
                <div class="preview-item"><span class="p-label">Tahmini K/Z</span><span class="p-val" id="preview-pnl">—</span></div>
                <div class="preview-divider"></div>
                <div class="preview-item"><span class="p-label">R/R</span><span class="p-val accent" id="preview-rr">—</span></div>
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
                 TAB 3: CSV
                 ========================================================== -->
            <div class="quick-tab-content" id="tab-csv">
              <div class="quick-import-area">
                <div class="quick-import-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                </div>
                <p>MT4/MT5 veya Excel'den dışa aktardığınız CSV dosyasını yükleyin</p>
                <button class="quick-import-btn" id="quick-csv-select">📁 CSV Dosyası Seç</button>
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
                 TAB 4: BULK
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
            <button class="btn-save" id="quick-add-save">💾 Kaydet</button>
            <button class="btn-save" id="quick-import-btn" style="display:none;">📤 İçe Aktar</button>
            <button class="btn-save" id="quick-bulk-btn" style="display:none;">📤 İşlemleri Ekle</button>
          </div>
          
        </div>
      </div>
      
      <!-- FAB -->
      <button class="quick-add-fab" id="quick-add-fab" aria-label="Hızlı İşlem Ekle" title="Hızlı İşlem Ekle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
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
      
      if (!error && data) {
        strategiesList = data;
      } else {
        strategiesList = [];
      }
      
      const select = el('quick-strategy');
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
      console.warn('Stratejiler yüklenemedi:', e);
    }
  }

  // ============================================================
  // ENSTRÜMAN SEÇ
  // ============================================================
  
  function selectInstrument(instrument, multiplier) {
    currentInstrument = instrument;
    currentMultiplier = multiplier;
    
    const btns = qsa('.quick-add-instrument-btn');
    btns.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.instrument === instrument);
    });
    
    const customWrap = el('price-custom-multiplier-wrap');
    if (customWrap) {
      customWrap.style.display = instrument === 'other' ? 'block' : 'none';
    }
    
    updatePricePreview();
  }

  // ============================================================
  // PRICE PREVIEW - Debounce ile
  // ============================================================
  
  let previewDebounceTimer = null;
  
  function getMultiplier() {
    if (currentInstrument === 'other') {
      const customEl = el('price-custom-multiplier');
      const v = customEl ? parseFloat(customEl.value) : null;
      return isNaN(v) ? null : v;
    }
    return currentMultiplier || 1;
  }

  function updatePricePreview() {
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
    }
    
    previewDebounceTimer = setTimeout(function() {
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
            hasPnl = true;
          } catch(e) {
            console.warn('PnL preview hatası:', e);
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
            console.warn('RR preview hatası:', e);
          }
        }
      }

      if (previewEl) {
        previewEl.classList.toggle('visible', hasPnl || hasRr);
      }
      
      previewDebounceTimer = null;
    }, 200);
  }

  // ============================================================
  // MODAL KONTROLLERİ
  // ============================================================
  
  function openModal() {
    const overlay = el('quick-add-overlay');
    if (!overlay) return;
    
    resetForm();
    setSide('BUY');
    switchTab('quick');
    selectInstrument('forex', 100000);
    loadStrategies();
    
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    setTimeout(function() {
      const symbol = el('quick-symbol');
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
    
    const qSymbol = el('quick-symbol');
    const qPnl = el('quick-pnl');
    const qRr = el('quick-rr');
    const qNotes = el('quick-notes');
    const qDate = el('quick-date');
    if (qSymbol) qSymbol.value = '';
    if (qPnl) qPnl.value = '';
    if (qRr) qRr.value = '2';
    if (qNotes) qNotes.value = '';
    if (qDate) qDate.value = today;
    
    const pSymbol = el('price-symbol');
    const pLot = el('price-lot');
    const pEntry = el('price-entry');
    const pExit = el('price-exit');
    const pSl = el('price-sl');
    const pTp = el('price-tp');
    const pCustom = el('price-custom-multiplier');
    const pNotes = el('price-notes');
    const pDate = el('price-date');
    if (pSymbol) pSymbol.value = '';
    if (pLot) pLot.value = '1.00';
    if (pEntry) pEntry.value = '';
    if (pExit) pExit.value = '';
    if (pSl) pSl.value = '';
    if (pTp) pTp.value = '';
    if (pCustom) pCustom.value = '';
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
    
    const strategySelect = el('quick-strategy');
    if (strategySelect) strategySelect.value = '';
    
    const preview = el('price-preview');
    if (preview) preview.classList.remove('visible');
    
    const saveBtn = el('quick-add-save');
    const importBtn = el('quick-import-btn');
    const bulkBtn = el('quick-bulk-btn');
    if (saveBtn) saveBtn.style.display = '';
    if (importBtn) importBtn.style.display = 'none';
    if (bulkBtn) bulkBtn.style.display = 'none';
  }

  function switchTab(tab) {
    currentTab = tab;
    
    const tabs = qsa('.quick-tab');
    tabs.forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    const contents = qsa('.quick-tab-content');
    contents.forEach(function(content) {
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
    
    const buyBtn = el('quick-side-buy');
    const sellBtn = el('quick-side-sell');
    if (buyBtn && sellBtn) {
      buyBtn.classList.toggle('active-buy', side === 'BUY');
      buyBtn.classList.toggle('active-sell', false);
      sellBtn.classList.toggle('active-sell', side === 'SELL');
      sellBtn.classList.toggle('active-buy', false);
    }
    
    const priceBuy = el('price-side-buy');
    const priceSell = el('price-side-sell');
    if (priceBuy && priceSell) {
      priceBuy.classList.toggle('active-buy', side === 'BUY');
      priceBuy.classList.toggle('active-sell', false);
      priceSell.classList.toggle('active-sell', side === 'SELL');
      priceSell.classList.toggle('active-buy', false);
    }
    
    updatePricePreview();
  }

  function setRRPreset(value) {
    const input = el('quick-rr');
    if (!input) return;
    input.value = value;
    
    const presets = qsa('.rr-preset');
    presets.forEach(function(btn) {
      btn.classList.toggle('active', parseFloat(btn.dataset.rr) === parseFloat(value));
    });
  }

  function setLotPreset(value) {
    const input = el('price-lot');
    if (!input) return;
    input.value = value;
    
    const presets = qsa('.lot-preset');
    presets.forEach(function(btn) {
      btn.classList.toggle('active', parseFloat(btn.dataset.lot) === parseFloat(value));
    });
  }

  // ============================================================
  // CSV IMPORT - Önizleme ile
  // ============================================================
  
  function renderCSVLog(messages) {
    const elm = document.getElementById('quick-csv-log');
    if (elm) {
      if (messages && messages.length > 0) {
        elm.style.display = 'block';
        elm.innerHTML = messages.map(function(m) { 
          return '<div>' + escapeHtml(m) + '</div>'; 
        }).join('');
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
    html += '<span style="font-size:13px;font-weight:600;">📋 Önizleme (' + rows.length + ' satır)</span>';
    html += '<button class="btn btn-primary" id="csv-confirm-import" style="font-size:12px;padding:4px 12px;">✅ İçe Aktar</button>';
    html += '</div>';
    html += '<div style="overflow-x:auto;max-height:200px;overflow-y:auto;font-size:12px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-family:\'DM Mono\',monospace;">';
    
    html += '<thead><tr style="background:var(--surface);">';
    headers.forEach(function(h) {
      html += '<th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--border);">' + escapeHtml(h) + '</th>';
    });
    html += '</tr></thead>';
    
    html += '<tbody>';
    var displayRows = rows.slice(0, 10);
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
      if (badgeEl) badgeEl.textContent = '⏳';
      
      const text = await file.text();
      const parsed = parseCsvText(text);
      
      if (parsed.length < 2) {
        showToast('CSV dosyasında veri bulunamadı!', 'error');
        if (badgeEl) badgeEl.textContent = '❌';
        return;
      }
      
      const headers = parsed[0].map(function(h) { return h.trim().toLowerCase(); });
      const dataRows = parsed.slice(1);
      
      showCsvPreview(dataRows, headers);
      if (badgeEl) badgeEl.textContent = '✅';
      
      csvPreviewData = {
        headers: headers,
        rows: dataRows,
        rawText: text
      };
      
    } catch(e) {
      console.warn('CSV okuma hatası:', e);
      showToast('CSV okuma hatası: ' + e.message, 'error');
      const badgeEl = el('quick-csv-badge');
      if (badgeEl) badgeEl.textContent = '❌';
    }
  }

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
    if (badge) badge.textContent = '⏳';
    if (progressEl) progressEl.style.display = 'flex';
    
    try {
      const { headers, rows } = csvPreviewData;
      let imported = 0, failed = 0;
      const trades = [];
      
      for (var i = 0; i < rows.length; i++) {
        var values = rows[i];
        if (values.length < 5) {
          log.push('⚠️ Satır ' + (i+1) + ': Yetersiz sütun (' + values.length + '), atlandı.');
          failed++;
          continue;
        }
        
        var row = {};
        for (var hIdx = 0; hIdx < headers.length && hIdx < values.length; hIdx++) {
          row[headers[hIdx]] = values[hIdx] ? values[hIdx].trim() : '';
        }
        
        var symbol = (row.symbol || row.sembol || '').toUpperCase();
        var direction = (row.yon || row.direction || '').toUpperCase();
        var lot = parseFloat(row.lot || 0);
        var entry = parseFloat(row.entry || row.giris || row.entry_price || 0);
        var exit = parseFloat(row.exit || row.cikis || row.exit_price);
        var tradeDate = validateAndFormatDate(row.tarih || row.date || '');
        var instrument = (row.instrument || row.enstruman || 'forex').toLowerCase();
        var multiplier = parseFloat(row.multiplier || row.carpan || 0);
        
        var validInstruments = ['forex', 'gold', 'index', 'crypto', 'other'];
        if (!validInstruments.includes(instrument)) {
          instrument = 'forex';
          multiplier = 100000;
        }
        
        if (!multiplier || isNaN(multiplier) || multiplier === 0) {
          var instMap = { forex: 100000, gold: 100, index: 10, crypto: 1, other: 1 };
          multiplier = instMap[instrument] || 100000;
        }
        
        if (!symbol || !direction || isNaN(lot) || isNaN(entry)) {
          log.push('❌ Satır ' + (i+1) + ': Zorunlu alan eksik, atlandı.');
          failed++;
          continue;
        }
        
        var finalDir = 'SHORT';
        if (direction === 'BUY' || direction === 'LONG') finalDir = 'LONG';
        else if (direction === 'SELL' || direction === 'SHORT') finalDir = 'SHORT';
        else log.push('⚠️ Satır ' + (i+1) + ': Bilinmeyen yön "' + direction + '", SHORT olarak kaydedildi.');
        
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
      
      if (trades.length > 0) {
        var { error } = await sb.from('trades').insert(trades);
        if (error) {
          log.push('❌ Toplu insert hatası: ' + error.message);
          failed += trades.length;
        } else {
          imported += trades.length;
        }
      }
      
      renderCSVLog(log);
      if (progressEl) progressEl.style.display = 'none';
      
      var msg = imported + ' işlem içe aktarıldı' + (failed > 0 ? ', ' + failed + ' başarısız' : '') + '.';
      showToast(msg, failed > 0 ? 'error' : 'success');
      
      if (imported > 0) {
        var previewContainer = el('csv-preview-container');
        if (previewContainer) previewContainer.style.display = 'none';
        csvPreviewData = null;
        
        setTimeout(function() {
          closeModal();
          window.location.href = 'trades.html';
        }, 1500);
      }
      
    } catch(e) {
      console.warn('CSV import hatası:', e);
      if (progressEl) progressEl.style.display = 'none';
      showToast('CSV import hatası: ' + e.message, 'error');
    }
    
    isImporting = false;
    if (badge) badge.textContent = failed > 0 ? '⚠️' : '✅';
  }

  // ============================================================
  // BULK IMPORT - Toplu insert ile
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
    
    for (var lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      var parts = lines[lineIdx].split(',').map(function(p) { return p.trim(); });
      
      if (parts.length < 5) {
        errors.push('Satır ' + (lineIdx+1) + ': Yetersiz alan (' + parts.length + ' alan, en az 5 gerekli)');
        continue;
      }
      
      var symbol = parts[0].toUpperCase();
      var direction = parts[1].toUpperCase();
      var lot = parseFloat(parts[2]);
      var entry = parseFloat(parts[3]);
      var exit = parts[4] ? parseFloat(parts[4]) : null;
      var date = parts[5] ? validateAndFormatDate(parts[5]) : defaultDate;
      var notes = parts[6] || 'Toplu ekleme - ' + new Date().toLocaleString('tr-TR');
      
      if (!symbol || !direction || isNaN(lot) || isNaN(entry)) {
        errors.push('Satır ' + (lineIdx+1) + ': Zorunlu alanlar eksik (sembol, yön, lot, giriş)');
        continue;
      }
      
      var finalDir = 'SHORT';
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
        logEl.innerHTML = errors.map(function(e) { return '❌ ' + escapeHtml(e); }).join('');
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
    
    try {
      var { error } = await sb.from('trades').insert(trades);
      
      if (error) {
        if (logEl) {
          logEl.style.display = 'block';
          logEl.innerHTML = '❌ ' + escapeHtml(error.message);
        }
        showToast('İşlem eklenirken hata oluştu: ' + error.message, 'error');
      } else {
        if (statusEl) statusEl.textContent = trades.length + ' işlem başarıyla eklendi!';
        if (fillEl) fillEl.style.width = '100%';
        showToast(trades.length + ' işlem başarıyla eklendi!', 'success');
        
        setTimeout(function() {
          closeModal();
          window.location.href = 'trades.html';
        }, 1500);
      }
    } catch(e) {
      console.warn('Bulk import hatası:', e);
      if (logEl) {
        logEl.style.display = 'block';
        logEl.innerHTML = '❌ ' + escapeHtml(e.message);
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
    console.log('🔄 Sayfa yenileniyor...');
    
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
    
    const error = el('quick-add-error');
    const loading = el('quick-add-loading');
    const saveBtn = el('quick-add-save');
    const cancelBtn = el('quick-add-cancel');
    
    if (error) error.classList.remove('active');
    
    if (!checkGlobals()) {
      if (error) {
        error.textContent = 'Sistem bağlantısı yok!';
        error.classList.add('active');
      }
      return;
    }
    
    const user = await requireAuth();
    if (!user) {
      if (error) {
        error.textContent = 'Lütfen önce giriş yapın!';
        error.classList.add('active');
      }
      return;
    }
    
    let tradeData = null;
    
    // ============================================================
    // QUICK MODE - SADECE P&L ve R/R
    // ============================================================
    if (currentTab === 'quick') {
      const symbol = el('quick-symbol')?.value?.trim()?.toUpperCase() || '';
      const pnl = parseFloat(el('quick-pnl')?.value);
      const rr = parseFloat(el('quick-rr')?.value) || 0;
      const strategyId = el('quick-strategy')?.value || null;
      const notes = el('quick-notes')?.value || null;
      const dateInput = el('quick-date')?.value;
      const today = dateInput || new Date().toISOString().split('T')[0];
      
      if (!symbol) {
        if (error) {
          error.textContent = 'Lütfen bir sembol girin!';
          error.classList.add('active');
        }
        el('quick-symbol')?.focus();
        return;
      }
      
      if (isNaN(pnl)) {
        if (error) {
          error.textContent = 'Lütfen geçerli bir P&L girin!';
          error.classList.add('active');
        }
        el('quick-pnl')?.focus();
        return;
      }
      
      const direction = currentSide === 'BUY' ? 'LONG' : 'SHORT';
      
      tradeData = {
        user_id: user.id,
        symbol: symbol,
        direction: direction,
        instrument: 'forex',
        lot: 1,
        entry_price: 1.00000,
        exit_price: 1.00000,
        pnl: Math.round(pnl * 100) / 100,
        rr_ratio: rr > 0 ? rr : null,
        trade_date: today,
        strategy_id: strategyId || null,
        notes: notes,
        multiplier: 100000,
        is_quick_entry: true
      };
      
      console.log('📤 QUICK MODE GÖNDERİLEN:', tradeData);
    }
    
    // ============================================================
    // PRICE MODE - TÜM ALANLAR
    // ============================================================
    else if (currentTab === 'price') {
      const symbol = el('price-symbol')?.value?.trim()?.toUpperCase() || '';
      const lot = parseFloat(el('price-lot')?.value);
      const entry = parseFloat(el('price-entry')?.value);
      const exit = parseFloat(el('price-exit')?.value) || null;
      const sl = parseFloat(el('price-sl')?.value) || null;
      const tp = parseFloat(el('price-tp')?.value) || null;
      const customMult = parseFloat(el('price-custom-multiplier')?.value);
      const notes = el('price-notes')?.value || null;
      const strategyId = selectedStrategyId || null;
      const instrument = currentInstrument || 'forex';
      const dateInput = el('price-date')?.value;
      const date = dateInput || new Date().toISOString().split('T')[0];
      
      let mult = currentMultiplier;
      if (instrument === 'other' && !isNaN(customMult) && customMult > 0) {
        mult = customMult;
      }
      
      console.log('🔍 PRICE MODE DEĞERLER:', { symbol, lot, entry, exit, sl, tp, mult, instrument, date });
      
      if (!symbol) {
        if (error) {
          error.textContent = 'Lütfen bir sembol girin!';
          error.classList.add('active');
        }
        el('price-symbol')?.focus();
        return;
      }
      
      if (isNaN(entry) || !entry || entry === 0) {
        if (error) {
          error.textContent = 'Giriş fiyatı geçerli bir sayı olmalı!';
          error.classList.add('active');
        }
        el('price-entry')?.focus();
        return;
      }
      
      if (isNaN(lot) || !lot || lot === 0) {
        if (error) {
          error.textContent = 'Lot geçerli bir sayı olmalı!';
          error.classList.add('active');
        }
        el('price-lot')?.focus();
        return;
      }
      
      if (instrument === 'other' && (isNaN(mult) || mult === 0)) {
        if (error) {
          error.textContent = 'Manuel çarpan geçerli bir sayı olmalı!';
          error.classList.add('active');
        }
        el('price-custom-multiplier')?.focus();
        return;
      }
      
      const direction = currentSide === 'BUY' ? 'LONG' : 'SHORT';
      
      tradeData = {
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
      
      console.log('📤 PRICE MODE GÖNDERİLEN:', tradeData);
    }
    
    if (!tradeData) {
      if (error) {
        error.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
        error.classList.add('active');
      }
      return;
    }
    
    isSubmitting = true;
    if (saveBtn) saveBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (loading) loading.classList.add('active');
    if (error) error.classList.remove('active');
    
    try {
      const { error: insertError } = await sb.from('trades').insert([tradeData]);
      
      if (insertError) {
        console.error('❌ Insert hatası:', insertError);
        if (error) {
          error.textContent = 'Kaydetme hatası: ' + insertError.message;
          error.classList.add('active');
        }
        return;
      }
      
      console.log('✅ İşlem başarıyla kaydedildi! PnL:', tradeData.pnl);
      
      if (typeof showToast === 'function') {
        showToast('✅ İşlem başarıyla eklendi!', 'success');
      }
      
      closeModal();
      refreshPage();
      
    } catch (e) {
      console.error('❌ Kaydetme hatası:', e);
      if (error) {
        error.textContent = 'Bir hata oluştu. Lütfen tekrar deneyin.';
        error.classList.add('active');
      }
    } finally {
      isSubmitting = false;
      if (saveBtn) saveBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (loading) loading.classList.remove('active');
    }
  }

  // ============================================================
  // EVENT LISTENER'LAR
  // ============================================================
  
  function initQuickAdd() {
    let container = document.getElementById('quick-add-container');
    
    if (!container) {
      container = document.createElement('div');
      container.id = 'quick-add-container';
      document.body.appendChild(container);
    }
    
    container.innerHTML = getModalHTML();
    
    // ⭐ FAB - Her zaman çalışsın, kaybolmasın
    const fab = document.getElementById('quick-add-fab');
    if (fab) {
      const newFab = fab.cloneNode(true);
      fab.parentNode.replaceChild(newFab, fab);
      
      newFab.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openModal();
      });
    } else {
      console.error('❌ FAB butonu bulunamadı!');
    }
    
    // Kapatma
    const closeBtn = document.getElementById('quick-add-close');
    const cancelBtn = document.getElementById('quick-add-cancel');
    const overlay = document.getElementById('quick-add-overlay');
    
    if (closeBtn) {
      const newClose = closeBtn.cloneNode(true);
      closeBtn.parentNode.replaceChild(newClose, closeBtn);
      newClose.addEventListener('click', closeModal);
    }
    
    if (cancelBtn) {
      const newCancel = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
      newCancel.addEventListener('click', closeModal);
    }
    
    if (overlay) {
      const newOverlay = overlay.cloneNode(true);
      overlay.parentNode.replaceChild(newOverlay, overlay);
      newOverlay.addEventListener('click', function(e) {
        if (e.target === this) closeModal();
      });
    }
    
    // ESC
    document.removeEventListener('keydown', handleEsc);
    document.addEventListener('keydown', handleEsc);
    
    // Tabs
    const tabs = document.querySelectorAll('.quick-tab');
    tabs.forEach(function(btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', function() {
        switchTab(this.dataset.tab);
      });
    });
    
    // Side buttons - Quick
    const buyBtn = document.getElementById('quick-side-buy');
    const sellBtn = document.getElementById('quick-side-sell');
    if (buyBtn) {
      const newBuy = buyBtn.cloneNode(true);
      buyBtn.parentNode.replaceChild(newBuy, buyBtn);
      newBuy.addEventListener('click', function() { setSide('BUY'); });
    }
    if (sellBtn) {
      const newSell = sellBtn.cloneNode(true);
      sellBtn.parentNode.replaceChild(newSell, sellBtn);
      newSell.addEventListener('click', function() { setSide('SELL'); });
    }
    
    // Side buttons - Price
    const priceBuy = document.getElementById('price-side-buy');
    const priceSell = document.getElementById('price-side-sell');
    if (priceBuy) {
      const newPriceBuy = priceBuy.cloneNode(true);
      priceBuy.parentNode.replaceChild(newPriceBuy, priceBuy);
      newPriceBuy.addEventListener('click', function() { setSide('BUY'); });
    }
    if (priceSell) {
      const newPriceSell = priceSell.cloneNode(true);
      priceSell.parentNode.replaceChild(newPriceSell, priceSell);
      newPriceSell.addEventListener('click', function() { setSide('SELL'); });
    }
    
    // RR Presets
    const rrPresets = document.querySelectorAll('.rr-preset');
    rrPresets.forEach(function(btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', function() {
        setRRPreset(this.dataset.rr);
      });
    });
    
    const rrInput = document.getElementById('quick-rr');
    if (rrInput) {
      const newRr = rrInput.cloneNode(true);
      rrInput.parentNode.replaceChild(newRr, rrInput);
      newRr.addEventListener('input', function() {
        const val = parseFloat(this.value);
        if (!isNaN(val)) {
          const presets = document.querySelectorAll('.rr-preset');
          presets.forEach(function(btn) {
            btn.classList.toggle('active', parseFloat(btn.dataset.rr) === val);
          });
        }
      });
    }
    
    // Lot Presets
    const lotPresets = document.querySelectorAll('.lot-preset');
    lotPresets.forEach(function(btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', function() {
        setLotPreset(this.dataset.lot);
      });
    });
    
    const lotInput = document.getElementById('price-lot');
    if (lotInput) {
      const newLot = lotInput.cloneNode(true);
      lotInput.parentNode.replaceChild(newLot, lotInput);
      newLot.addEventListener('input', function() {
        const val = parseFloat(this.value);
        if (!isNaN(val)) {
          const presets = document.querySelectorAll('.lot-preset');
          presets.forEach(function(btn) {
            btn.classList.toggle('active', parseFloat(btn.dataset.lot) === val);
          });
          updatePricePreview();
        }
      });
    }
    
    // Instrument buttons
    const instBtns = document.querySelectorAll('.quick-add-instrument-btn');
    instBtns.forEach(function(btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', function() {
        const inst = this.dataset.instrument;
        const mult = parseFloat(this.dataset.multiplier) || 1;
        selectInstrument(inst, mult);
      });
    });
    
    // Price preview inputs
    const priceInputs = ['price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-lot', 'price-custom-multiplier'];
    priceInputs.forEach(function(id) {
      const input = document.getElementById(id);
      if (input) {
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        newInput.addEventListener('input', updatePricePreview);
        newInput.addEventListener('change', updatePricePreview);
      }
    });
    
    // Save button
    const saveBtn = document.getElementById('quick-add-save');
    if (saveBtn) {
      const newSave = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(newSave, saveBtn);
      newSave.addEventListener('click', saveTrade);
    }
    
    // Enter ile kaydet
    const inputs = document.querySelectorAll('.quick-add-body input, .quick-add-body select');
    inputs.forEach(function(input) {
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);
      newInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveTrade();
        }
      });
    });
    
    // Strateji oluştur
    const createStrategyBtn = document.getElementById('quick-create-strategy');
    if (createStrategyBtn) {
      const newBtn = createStrategyBtn.cloneNode(true);
      createStrategyBtn.parentNode.replaceChild(newBtn, createStrategyBtn);
      newBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.location.href = '/strategies.html';
      });
    }
    
    // Import butonu (CSV)
    const importBtn = document.getElementById('quick-import-btn');
    if (importBtn) {
      const newBtn = importBtn.cloneNode(true);
      importBtn.parentNode.replaceChild(newBtn, importBtn);
      newBtn.addEventListener('click', executeCsvImport);
    }
    
    // Bulk butonu
    const bulkBtn = document.getElementById('quick-bulk-btn');
    if (bulkBtn) {
      const newBtn = bulkBtn.cloneNode(true);
      bulkBtn.parentNode.replaceChild(newBtn, bulkBtn);
      newBtn.addEventListener('click', handleBulkImport);
    }
    
    // CSV file selection
    const csvSelectBtn = document.getElementById('quick-csv-select');
    const csvFileInput = document.getElementById('quick-csv-file');
    if (csvSelectBtn && csvFileInput) {
      const newSelect = csvSelectBtn.cloneNode(true);
      csvSelectBtn.parentNode.replaceChild(newSelect, csvSelectBtn);
      newSelect.addEventListener('click', function() {
        document.getElementById('quick-csv-file')?.click();
      });
      
      const newFile = csvFileInput.cloneNode(true);
      csvFileInput.parentNode.replaceChild(newFile, csvFileInput);
      newFile.addEventListener('change', function() {
        if (this.files && this.files[0]) {
          handleCsvFileSelect(this.files[0]);
        }
      });
    }
    
    // P&L input
    const pnlInput = document.getElementById('quick-pnl');
    if (pnlInput) {
      const newPnl = pnlInput.cloneNode(true);
      pnlInput.parentNode.replaceChild(newPnl, pnlInput);
      newPnl.addEventListener('focus', function() {
        if (this.value === '0' || this.value === '') {
          this.value = '';
        }
      });
      newPnl.addEventListener('blur', function() {
        if (this.value === '' || this.value === '-') {
          this.value = '0';
        }
      });
    }
    
    // Decimal fix
    if (typeof applyDecimalFix === 'function') {
      applyDecimalFix(['quick-pnl', 'quick-rr', 'price-lot', 'price-entry', 'price-exit', 'price-sl', 'price-tp', 'price-custom-multiplier']);
    }
    
    console.log('✅ Quick Add Modal initialized! FAB butonu aktif.');
  }

  // ESC handler
  function handleEsc(e) {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('quick-add-overlay');
      if (overlay && overlay.classList.contains('active')) {
        closeModal();
      }
    }
  }

  // ============================================================
  // DOM READY
  // ============================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(initQuickAdd, 100);
    });
  } else {
    setTimeout(initQuickAdd, 100);
  }

  window.addEventListener('load', function() {
    if (!document.getElementById('quick-add-fab')) {
      console.warn('⚠️ FAB butonu bulunamadı, yeniden başlatılıyor...');
      initQuickAdd();
    }
  });

  // Global erişim
  window.quickAddOpen = openModal;
  window.quickAddClose = closeModal;

})();

console.log('✅ quick-add.js yüklendi! FAB butonu her zaman görünür.');