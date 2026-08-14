// ============================================================
// QUICK MODAL I18N - Hızlı İşlem Modal'ı Çevirileri
// Dil: İngilizce (varsayılan), Türkçe, Almanca
// ============================================================

const quickTranslations = {
  en: {
    "quickmodal.title": "📝 Add Trade",
    "quickmodal.tab_quick": "Quick Add",
    "quickmodal.tab_price": "Price Based",
    "quickmodal.tab_csv": "CSV Import",
    "quickmodal.tab_bulk": "Bulk Paste",
    
    // Quick Mode
    "quickmodal.mode_quick": "Quick Entry",
    "quickmodal.mode_price": "Price Calculation",
    "quickmodal.symbol": "Symbol *",
    "quickmodal.symbol_hint": "Enter symbol manually",
    "quickmodal.side": "Direction *",
    "quickmodal.buy": "Buy ↑",
    "quickmodal.sell": "Sell ↓",
    "quickmodal.pnl": "P&L *",
    "quickmodal.risk_reward": "Risk / Reward",
    "quickmodal.strategy": "Strategy",
    "quickmodal.no_strategy": "— No Strategy —",
    "quickmodal.create_strategy": "New",
    "quickmodal.saving": "Saving...",
    "quickmodal.strategy_placeholder": "Select a strategy",
    
    // Price Mode
    "quickmodal.instrument": "Instrument *",
    "quickmodal.instrument_forex": "Forex",
    "quickmodal.instrument_gold": "Gold",
    "quickmodal.instrument_index": "Index",
    "quickmodal.instrument_crypto": "Crypto",
    "quickmodal.instrument_other": "Other",
    "quickmodal.custom_multiplier": "Manual Multiplier *",
    "quickmodal.entry_price": "Entry Price *",
    "quickmodal.exit_price": "Exit Price",
    "quickmodal.stop_loss": "Stop Loss",
    "quickmodal.take_profit": "Take Profit",
    "quickmodal.lot": "Lot *",
    "quickmodal.estimated_pnl": "Est. P&L",
    "quickmodal.rr_calculated": "R:R",
    "quickmodal.calculate_from_price": "Calculate from price",
    "quickmodal.enter_manually": "Enter manually",
    
    // Strategy Chip Grid
    "quickmodal.select_strategy": "Select Strategy",
    "quickmodal.refresh": "Refresh",
    "quickmodal.clear": "Clear",
    "quickmodal.loading_strategies": "Loading strategies...",
    "quickmodal.no_strategies": "No strategies added yet.",
    "quickmodal.create_strategy_link": "Create a strategy →",
    "quickmodal.strategy_selected": "Strategy selected",
    "quickmodal.strategy_cleared": "Strategy cleared",
    
    // CSV Import
    "quickmodal.csv_import_title": "CSV Import",
    "quickmodal.csv_import_desc": "Upload your CSV file from MT4/MT5 or Excel",
    "quickmodal.csv_choose_file": "Choose CSV File",
    "quickmodal.csv_file_selected": "File selected: {{filename}}",
    "quickmodal.csv_no_file": "No file selected",
    "quickmodal.csv_processing": "Processing...",
    "quickmodal.csv_importing": "Importing...",
    "quickmodal.csv_import_success": "✅ {{count}} trades imported successfully!",
    "quickmodal.csv_import_error": "⚠️ {{success}} imported, {{failed}} errors!",
    "quickmodal.csv_no_data": "No data found in CSV file!",
    "quickmodal.csv_required_fields": "Missing required fields in row {{row}}",
    "quickmodal.csv_invalid_date": "Invalid date format in row {{row}}",
    
    // Bulk Paste
    "quickmodal.bulk_title": "Bulk Add Trades",
    "quickmodal.bulk_desc": "Enter one trade per line in the following format:",
    "quickmodal.bulk_format": "symbol,direction,lot,entry,exit,date,notes",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,First trade",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,First trade\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Gold trade",
    "quickmodal.bulk_processing": "Processing...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} trades added ({{failed}} failed)",
    "quickmodal.bulk_complete": "✅ {{success}} trades added successfully!",
    "quickmodal.bulk_error": "⚠️ {{success}} added, {{failed}} errors!",
    "quickmodal.bulk_required": "Please enter at least one trade!",
    "quickmodal.bulk_invalid_format": "Invalid format in line {{line}}: {{error}}",
    
    // Validation
    "quickmodal.error_symbol_required": "Please enter a symbol!",
    "quickmodal.error_pnl_required": "Please enter a valid P&L!",
    "quickmodal.error_pnl_invalid": "P&L must be a number!",
    "quickmodal.error_entry_required": "Entry price is required!",
    "quickmodal.error_entry_invalid": "Please enter a valid entry price!",
    "quickmodal.error_lot_required": "Lot is required!",
    "quickmodal.error_lot_invalid": "Please enter a valid lot size!",
    "quickmodal.error_instrument_required": "Please select an instrument!",
    "quickmodal.error_multiplier_required": "Manual multiplier is required!",
    "quickmodal.error_auth_required": "Please login first!",
    "quickmodal.error_connection": "No system connection!",
    "quickmodal.error_save": "Save error: {{message}}",
    "quickmodal.error_general": "An error occurred. Please try again.",
    
    // Success
    "quickmodal.success_saved": "✅ Trade added successfully!",
    
    // Buttons
    "quickmodal.cancel": "Cancel",
    "quickmodal.save": "💾 Save",
    "quickmodal.import": "📤 Import",
    "quickmodal.paste_add": "📤 Add Trades"
  },
  
  tr: {
    "quickmodal.title": "📝 İşlem Ekle",
    "quickmodal.tab_quick": "Hızlı Ekle",
    "quickmodal.tab_price": "Fiyattan Hesapla",
    "quickmodal.tab_csv": "CSV İçe Aktar",
    "quickmodal.tab_bulk": "Toplu Metin",
    
    // Quick Mode
    "quickmodal.mode_quick": "Hızlı Giriş",
    "quickmodal.mode_price": "Fiyat Hesaplama",
    "quickmodal.symbol": "Sembol *",
    "quickmodal.symbol_hint": "Sembolü manuel girin",
    "quickmodal.side": "Yön *",
    "quickmodal.buy": "Alış ↑",
    "quickmodal.sell": "Satış ↓",
    "quickmodal.pnl": "K/Z *",
    "quickmodal.risk_reward": "Risk / Reward",
    "quickmodal.strategy": "Strateji",
    "quickmodal.no_strategy": "— Strateji Yok —",
    "quickmodal.create_strategy": "Yeni",
    "quickmodal.saving": "Kaydediliyor...",
    "quickmodal.strategy_placeholder": "Strateji seç",
    
    // Price Mode
    "quickmodal.instrument": "Enstrüman *",
    "quickmodal.instrument_forex": "Forex",
    "quickmodal.instrument_gold": "Altın",
    "quickmodal.instrument_index": "Endeks",
    "quickmodal.instrument_crypto": "Kripto",
    "quickmodal.instrument_other": "Diğer",
    "quickmodal.custom_multiplier": "Manuel Çarpan *",
    "quickmodal.entry_price": "Giriş Fiyatı *",
    "quickmodal.exit_price": "Çıkış Fiyatı",
    "quickmodal.stop_loss": "Stop Loss",
    "quickmodal.take_profit": "Take Profit",
    "quickmodal.lot": "Lot *",
    "quickmodal.estimated_pnl": "Tahmini K/Z",
    "quickmodal.rr_calculated": "R/R",
    "quickmodal.calculate_from_price": "Fiyattan hesapla",
    "quickmodal.enter_manually": "Manuel gir",
    
    // Strategy Chip Grid
    "quickmodal.select_strategy": "Strateji Seç",
    "quickmodal.refresh": "Yenile",
    "quickmodal.clear": "Temizle",
    "quickmodal.loading_strategies": "Stratejiler yükleniyor...",
    "quickmodal.no_strategies": "Henüz strateji eklenmemiş.",
    "quickmodal.create_strategy_link": "Strateji oluştur →",
    "quickmodal.strategy_selected": "Strateji seçildi",
    "quickmodal.strategy_cleared": "Strateji temizlendi",
    
    // CSV Import
    "quickmodal.csv_import_title": "CSV İçe Aktar",
    "quickmodal.csv_import_desc": "MT4/MT5 veya Excel'den dışa aktardığınız CSV dosyasını yükleyin",
    "quickmodal.csv_choose_file": "CSV Dosyası Seç",
    "quickmodal.csv_file_selected": "Dosya seçildi: {{filename}}",
    "quickmodal.csv_no_file": "Dosya seçilmedi",
    "quickmodal.csv_processing": "İşleniyor...",
    "quickmodal.csv_importing": "İçe aktarılıyor...",
    "quickmodal.csv_import_success": "✅ {{count}} işlem başarıyla içe aktarıldı!",
    "quickmodal.csv_import_error": "⚠️ {{success}} içe aktarıldı, {{failed}} hata!",
    "quickmodal.csv_no_data": "CSV dosyasında veri bulunamadı!",
    "quickmodal.csv_required_fields": "{{row}}. satırda zorunlu alanlar eksik",
    "quickmodal.csv_invalid_date": "{{row}}. satırda geçersiz tarih formatı",
    
    // Bulk Paste
    "quickmodal.bulk_title": "Toplu İşlem Ekle",
    "quickmodal.bulk_desc": "Her satıra bir işlem gelecek şekilde aşağıdaki formatta girin:",
    "quickmodal.bulk_format": "sembol,yön,lot,giriş,çıkış,tarih,not",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Altın işlemi",
    "quickmodal.bulk_processing": "İşleniyor...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} işlem eklendi ({{failed}} başarısız)",
    "quickmodal.bulk_complete": "✅ {{success}} işlem başarıyla eklendi!",
    "quickmodal.bulk_error": "⚠️ {{success}} eklendi, {{failed}} hata!",
    "quickmodal.bulk_required": "Lütfen en az bir işlem girin!",
    "quickmodal.bulk_invalid_format": "{{line}}. satırda geçersiz format: {{error}}",
    
    // Validation
    "quickmodal.error_symbol_required": "Lütfen bir sembol girin!",
    "quickmodal.error_pnl_required": "Lütfen geçerli bir K/Z girin!",
    "quickmodal.error_pnl_invalid": "K/Z bir sayı olmalıdır!",
    "quickmodal.error_entry_required": "Giriş fiyatı zorunludur!",
    "quickmodal.error_entry_invalid": "Lütfen geçerli bir giriş fiyatı girin!",
    "quickmodal.error_lot_required": "Lot zorunludur!",
    "quickmodal.error_lot_invalid": "Lütfen geçerli bir lot büyüklüğü girin!",
    "quickmodal.error_instrument_required": "Lütfen bir enstrüman seçin!",
    "quickmodal.error_multiplier_required": "Manuel çarpan zorunludur!",
    "quickmodal.error_auth_required": "Lütfen önce giriş yapın!",
    "quickmodal.error_connection": "Sistem bağlantısı yok!",
    "quickmodal.error_save": "Kaydetme hatası: {{message}}",
    "quickmodal.error_general": "Bir hata oluştu. Lütfen tekrar deneyin.",
    
    // Success
    "quickmodal.success_saved": "✅ İşlem başarıyla eklendi!",
    
    // Buttons
    "quickmodal.cancel": "İptal",
    "quickmodal.save": "💾 Kaydet",
    "quickmodal.import": "📤 İçe Aktar",
    "quickmodal.paste_add": "📤 İşlemleri Ekle"
  },
  
  de: {
    "quickmodal.title": "📝 Trade hinzufügen",
    "quickmodal.tab_quick": "Schnell Hinzufügen",
    "quickmodal.tab_price": "Preisbasiert",
    "quickmodal.tab_csv": "CSV Import",
    "quickmodal.tab_bulk": "Massen Einfügen",
    
    // Quick Mode
    "quickmodal.mode_quick": "Schnelleingabe",
    "quickmodal.mode_price": "Preisberechnung",
    "quickmodal.symbol": "Symbol *",
    "quickmodal.symbol_hint": "Symbol manuell eingeben",
    "quickmodal.side": "Richtung *",
    "quickmodal.buy": "Kaufen ↑",
    "quickmodal.sell": "Verkaufen ↓",
    "quickmodal.pnl": "P&L *",
    "quickmodal.risk_reward": "Risk / Reward",
    "quickmodal.strategy": "Strategie",
    "quickmodal.no_strategy": "— Keine Strategie —",
    "quickmodal.create_strategy": "Neu",
    "quickmodal.saving": "Speichern...",
    "quickmodal.strategy_placeholder": "Strategie wählen",
    
    // Price Mode
    "quickmodal.instrument": "Instrument *",
    "quickmodal.instrument_forex": "Forex",
    "quickmodal.instrument_gold": "Gold",
    "quickmodal.instrument_index": "Index",
    "quickmodal.instrument_crypto": "Krypto",
    "quickmodal.instrument_other": "Andere",
    "quickmodal.custom_multiplier": "Manueller Multiplikator *",
    "quickmodal.entry_price": "Einstiegspreis *",
    "quickmodal.exit_price": "Ausstiegspreis",
    "quickmodal.stop_loss": "Stop Loss",
    "quickmodal.take_profit": "Take Profit",
    "quickmodal.lot": "Lot *",
    "quickmodal.estimated_pnl": "Gesch. P&L",
    "quickmodal.rr_calculated": "R/R",
    "quickmodal.calculate_from_price": "Vom Preis berechnen",
    "quickmodal.enter_manually": "Manuell eingeben",
    
    // Strategy Chip Grid
    "quickmodal.select_strategy": "Strategie wählen",
    "quickmodal.refresh": "Aktualisieren",
    "quickmodal.clear": "Löschen",
    "quickmodal.loading_strategies": "Lade Strategien...",
    "quickmodal.no_strategies": "Noch keine Strategien hinzugefügt.",
    "quickmodal.create_strategy_link": "Strategie erstellen →",
    "quickmodal.strategy_selected": "Strategie ausgewählt",
    "quickmodal.strategy_cleared": "Strategie gelöscht",
    
    // CSV Import
    "quickmodal.csv_import_title": "CSV Import",
    "quickmodal.csv_import_desc": "Laden Sie Ihre CSV-Datei von MT4/MT5 oder Excel hoch",
    "quickmodal.csv_choose_file": "CSV-Datei wählen",
    "quickmodal.csv_file_selected": "Datei ausgewählt: {{filename}}",
    "quickmodal.csv_no_file": "Keine Datei ausgewählt",
    "quickmodal.csv_processing": "Verarbeite...",
    "quickmodal.csv_importing": "Importiere...",
    "quickmodal.csv_import_success": "✅ {{count}} Trades erfolgreich importiert!",
    "quickmodal.csv_import_error": "⚠️ {{success}} importiert, {{failed}} Fehler!",
    "quickmodal.csv_no_data": "Keine Daten in CSV-Datei gefunden!",
    "quickmodal.csv_required_fields": "Fehlende Pflichtfelder in Zeile {{row}}",
    "quickmodal.csv_invalid_date": "Ungültiges Datumsformat in Zeile {{row}}",
    
    // Bulk Paste
    "quickmodal.bulk_title": "Trades massenhaft hinzufügen",
    "quickmodal.bulk_desc": "Geben Sie einen Trade pro Zeile im folgenden Format ein:",
    "quickmodal.bulk_format": "symbol,richtung,lot,einstieg,ausstieg,datum,notizen",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,Erster Trade",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,Erster Trade\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Gold Trade",
    "quickmodal.bulk_processing": "Verarbeite...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} Trades hinzugefügt ({{failed}} fehlgeschlagen)",
    "quickmodal.bulk_complete": "✅ {{success}} Trades erfolgreich hinzugefügt!",
    "quickmodal.bulk_error": "⚠️ {{success}} hinzugefügt, {{failed}} Fehler!",
    "quickmodal.bulk_required": "Bitte geben Sie mindestens einen Trade ein!",
    "quickmodal.bulk_invalid_format": "Ungültiges Format in Zeile {{line}}: {{error}}",
    
    // Validation
    "quickmodal.error_symbol_required": "Bitte geben Sie ein Symbol ein!",
    "quickmodal.error_pnl_required": "Bitte geben Sie ein gültiges P&L ein!",
    "quickmodal.error_pnl_invalid": "P&L muss eine Zahl sein!",
    "quickmodal.error_entry_required": "Einstiegspreis ist erforderlich!",
    "quickmodal.error_entry_invalid": "Bitte geben Sie einen gültigen Einstiegspreis ein!",
    "quickmodal.error_lot_required": "Lot ist erforderlich!",
    "quickmodal.error_lot_invalid": "Bitte geben Sie eine gültige Lot-Größe ein!",
    "quickmodal.error_instrument_required": "Bitte wählen Sie ein Instrument!",
    "quickmodal.error_multiplier_required": "Manueller Multiplikator ist erforderlich!",
    "quickmodal.error_auth_required": "Bitte melden Sie sich zuerst an!",
    "quickmodal.error_connection": "Keine Systemverbindung!",
    "quickmodal.error_save": "Speicherfehler: {{message}}",
    "quickmodal.error_general": "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    
    // Success
    "quickmodal.success_saved": "✅ Trade erfolgreich hinzugefügt!",
    
    // Buttons
    "quickmodal.cancel": "Abbrechen",
    "quickmodal.save": "💾 Speichern",
    "quickmodal.import": "📤 Importieren",
    "quickmodal.paste_add": "📤 Trades hinzufügen"
  }
};

// ============================================================
// QUICK I18N SINIFI
// ============================================================

class QuickI18n {
  constructor(defaultLang = 'en') {
    this.defaultLang = defaultLang;
    this.currentLang = defaultLang;
    this.listeners = [];
    
    // Başlangıç dilini ana i18n'den al veya localStorage'dan
    const savedLang = localStorage.getItem('ww_language');
    if (savedLang && quickTranslations[savedLang]) {
      this.currentLang = savedLang;
    } else {
      this.currentLang = defaultLang;
    }
    
    // Ana i18n dil değişikliklerini dinle
    if (typeof i18n !== 'undefined' && i18n.onChange) {
      i18n.onChange((lang) => {
        if (quickTranslations[lang]) {
          this.setLanguage(lang, true);
        }
      });
    }
    
    console.log('✅ Quick Modal I18n initialized! Dil:', this.currentLang);
  }
  
  t(key, params = {}) {
    let text = quickTranslations[this.currentLang]?.[key] || 
               quickTranslations[this.defaultLang]?.[key] || 
               key;
    
    Object.keys(params).forEach(param => {
      text = text.replace(new RegExp(`{{${param}}}`, 'g'), params[param]);
    });
    
    return text;
  }
  
  setLanguage(lang, silent = false) {
    if (!quickTranslations[lang]) {
      console.warn(`[QuickI18n] Dil bulunamadı: ${lang}`);
      return false;
    }
    
    if (this.currentLang === lang) return true;
    
    this.currentLang = lang;
    
    if (!silent) {
      this.listeners.forEach(cb => {
        try { cb(lang); } catch(e) {}
      });
    }
    
    return true;
  }
  
  onChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
    }
  }
  
  getCurrentLanguage() {
    return this.currentLang;
  }
  
  // HTML içindeki data-quick-i18n attribute'larını güncelle
  apply() {
    try {
      document.querySelectorAll('[data-quick-i18n]').forEach(el => {
        const key = el.getAttribute('data-quick-i18n');
        const text = this.t(key);
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.hasAttribute('data-quick-i18n-placeholder')) {
            el.placeholder = text;
          }
        } else {
          el.textContent = text;
        }
      });
      
      document.querySelectorAll('[data-quick-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-quick-i18n-placeholder');
        const text = this.t(key);
        if (el.placeholder !== undefined) {
          el.placeholder = text;
        }
      });
    } catch(e) {
      // Sessizce geç
    }
  }
}

// ============================================================
// GLOBAL INSTANCE
// ============================================================

const quickI18n = new QuickI18n('en');
window.quickI18n = quickI18n;

console.log('✅ Quick Modal I18n loaded! Dil:', quickI18n.getCurrentLanguage());