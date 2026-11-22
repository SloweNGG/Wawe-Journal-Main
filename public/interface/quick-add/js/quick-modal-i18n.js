// ============================================================
// QUICK MODAL I18N - Hızlı İşlem Modal'ı Çevirileri
// Dil: İngilizce (varsayılan), Türkçe, Almanca
// ⭐ Emoji temizlendi - ikonlar JS ICONS objesinden geliyor
// ⭐ Date picker için yeni key'ler eklendi
// ============================================================

const quickTranslations = {
  en: {
    "quickmodal.sym_recent": "Recent",
    "quickmodal.csv_drop_title": "Drag and drop your file here",
    "quickmodal.bulk_use_example": "Add example",
    "quickmodal.bulk_format_label": "Format",
    "quickmodal.bulk_example_label": "Example",
    "quickmodal.bulk_lines": "{{count}} lines",
    "quickmodal.title": "Add Trade",
    "quickmodal.tab_quick": "Quick Add",
    "quickmodal.tab_price": "Price Based",
    "quickmodal.tab_csv": "CSV Import",
    "quickmodal.tab_bulk": "Bulk Paste",
    "quickmodal.tab_ai": "Add with AI",
    "quickmodal.ai_drop_hint": "Drop the image",
    "quickmodal.ai_drop_title": "Paste or drop a screenshot",
    "quickmodal.ai_drop_desc": "MT4/MT5, cTrader, TradingView, your broker app or a prop firm dashboard. You can also paste with Ctrl+V.",
    "quickmodal.ai_choose_image": "Choose Image",
    "quickmodal.ai_remove_image": "Remove image",
    "quickmodal.ai_pasted_image": "Pasted image",
    "quickmodal.ai_text_label": "or describe it",
    "quickmodal.ai_text_placeholder": "e.g. Gold 0.5 lot long, in at 2350, out at 2365, stop 2340",
    "quickmodal.ai_privacy": "The image is not stored. AI never saves anything on its own; you check it first.",
    "quickmodal.ai_usage": "AI today: {{used}}/{{limit}}",
    "quickmodal.ai_read": "Read with AI",
    "quickmodal.ai_reading": "Reading…",
    "quickmodal.ai_need_input": "Add a screenshot or describe the trade.",
    "quickmodal.ai_none": "No trade found.",
    "quickmodal.ai_filled": "AI filled in the form. Check the values, then save.",
    "quickmodal.ai_found_many": "AI read {{count}} trades",
    "quickmodal.ai_no_exit": "No exit price was found; enter it before saving.",
    "quickmodal.ai_no_lot_single": "The size was not found; check the lot.",
    "quickmodal.ai_check_multiplier": "Unknown instrument: \"Other\" is selected, enter its multiplier.",
    "quickmodal.ai_pnl_mismatch": "#{{n}} {{symbol}}: the P&L read ({{pnl}}) does not match the prices ({{calc}}). Check it.",
    "quickmodal.ai_no_lot": "#{{n}} {{symbol}}: size not found, skipped.",
    "quickmodal.ai_open_skipped": "{{count}} open position(s) without an exit price skipped.",
    "quickmodal.ai_no_date": "{{count}} trade(s) have no date; today is used.",
    "quickmodal.ai_limit": "You have used today's AI limit (shared with the AI coach). It resets tomorrow; Pro gives you more per day.",
    "quickmodal.ai_busy": "The AI is busy right now. Try again in a minute.",
    "quickmodal.ai_error": "The AI could not read it. Try again.",
    "quickmodal.ai_bad_image": "This image cannot be used. Use a PNG, JPG or WEBP screenshot.",
    "quickmodal.ai_login": "Sign in to use AI.",

    // Quick Mode
    "quickmodal.mode_quick": "Quick Entry",
    "quickmodal.mode_price": "Price Calculation",
    "quickmodal.symbol": "Symbol *",
    "quickmodal.symbol_hint": "Enter symbol manually",
    "quickmodal.side": "Direction *",
    "quickmodal.buy": "Buy",
    "quickmodal.sell": "Sell",
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
    "quickmodal.commission": "Commission",
    "quickmodal.swap": "Swap",
    "quickmodal.gross": "Gross",
    "quickmodal.net": "Net",
    "quickmodal.comm_auto_hint": "Auto",
    "quickmodal.estimated_pnl": "Est. P&L",
    "quickmodal.rr_calculated": "R:R",
    "quickmodal.calculate_from_price": "Calculate from price",
    "quickmodal.enter_manually": "Enter manually",

    // Notes & Date
    "quickmodal.notes": "Notes",
    "quickmodal.notes_placeholder": "Notes...",
    "quickmodal.date": "Date",
    "quickmodal.date_placeholder": "Select date",
    "quickmodal.date_prev_month": "Previous month",
    "quickmodal.date_next_month": "Next month",
    "quickmodal.date_today": "Today",
    "quickmodal.date_clear": "Clear",
    "quickmodal.loading_saving": "Saving trade...",

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
    "quickmodal.csv_import_desc": "Upload your export from MT4/MT5, cTrader, Binance, Bybit or Excel",
    "quickmodal.csv_choose_file": "Choose File",
    "quickmodal.csv_file_selected": "File selected: {{filename}}",
    "quickmodal.csv_no_file": "No file selected",
    "quickmodal.csv_processing": "Processing...",
    "quickmodal.csv_importing": "Importing...",
    "quickmodal.csv_import_success": "{{count}} trades imported successfully!",
    "quickmodal.csv_all_duplicates": "All {{count}} trades are already imported! No duplicates added.",
    "quickmodal.csv_duplicates_skipped": "{{count}} new trades imported ({{skipped}} duplicates skipped).",
    "quickmodal.csv_import_error": "{{success}} imported, {{failed}} errors!",
    "quickmodal.csv_no_data": "No data found in CSV file!",
    "quickmodal.csv_required_fields": "Missing required fields in row {{row}}",
    "quickmodal.csv_invalid_date": "Invalid date format in row {{row}}",
    "quickmodal.broker_format": "Broker Format",
    "quickmodal.broker_auto": "Auto Detect",
    "quickmodal.broker_turkish": "Turkish Broker",
    "quickmodal.broker_generic": "Generic Format",
    "quickmodal.csv_drop_hint": "Drop the file",
    "quickmodal.records": "trades",
    "quickmodal.more_records": "...and {{count}} more trades",
    "quickmodal.more_errors": "...and {{count}} more errors",

    // Bulk Paste
    "quickmodal.bulk_title": "Bulk Add Trades",
    "quickmodal.bulk_desc": "Enter one trade per line in the following format:",
    "quickmodal.bulk_format": "symbol,direction,lot,entry,exit,date,notes",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,First trade",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,First trade\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Gold trade",
    "quickmodal.bulk_processing": "Processing...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} trades added ({{failed}} failed)",
    "quickmodal.bulk_complete": "{{success}} trades added successfully!",
    "quickmodal.bulk_error": "{{success}} added, {{failed}} errors!",
    "quickmodal.bulk_required": "Please enter at least one trade!",
    "quickmodal.bulk_invalid_format": "Invalid format in line {{line}}: {{error}}",

    // Validation
    "quickmodal.error_symbol_required": "Please enter a symbol!",
    "quickmodal.error_pnl_required": "Please enter a valid P&L!",
    "quickmodal.error_pnl_invalid": "P&L must be a number!",
    "quickmodal.error_entry_required": "Entry price is required!",
    "quickmodal.error_entry_invalid": "Please enter a valid entry price!",
    "quickmodal.error_exit_invalid": "Please enter a valid exit price! Only closed trades can be added.",
    "quickmodal.error_lot_required": "Lot is required!",
    "quickmodal.error_lot_invalid": "Please enter a valid lot size!",
    "quickmodal.error_instrument_required": "Please select an instrument!",
    "quickmodal.error_multiplier_required": "Manual multiplier is required!",
    "quickmodal.error_auth_required": "Please login first!",
    "quickmodal.error_connection": "No system connection!",
    "quickmodal.error_save": "Save error: {{message}}",
    "quickmodal.error_general": "An error occurred. Please try again.",

    // Success
    "quickmodal.success_saved": "Trade added successfully!",

    // Buttons
    "quickmodal.cancel": "Cancel",
    "quickmodal.save": "Save",
    "quickmodal.import": "Import",
    "quickmodal.paste_add": "Add Trades",

    // Commission Modal
    "quickmodal.comm_modal_title": "Commission & Swap Templates",
    "quickmodal.comm_presets_title": "PRESETS",
    "quickmodal.comm_template_name": "TEMPLATE NAME",
    "quickmodal.comm_template_name_ph": "e.g. cTrader Raw",
    "quickmodal.comm_rate_per_lot": "COMMISSION PER LOT",
    "quickmodal.comm_auto_toggle": "Calculate automatically by lot in future trades",
    "quickmodal.comm_delete": "Delete Template",
    "quickmodal.comm_save_apply": "Save & Apply",
    "quickmodal.comm_new_template": "+ New Template",
    "quickmodal.comm_zero_label": "Zero Commission",
    "quickmodal.comm_updated_msg": "Commission template updated: ",
    "quickmodal.comm_deleted_msg": "Template deleted.",
    "quickmodal.dismiss": "Cancel"
  },

  tr: {
    "quickmodal.sym_recent": "Son kullanılanlar",
    "quickmodal.csv_drop_title": "Dosyanızı buraya sürükleyip bırakın",
    "quickmodal.csv_drop_hint": "Dosyayı bırakın",
    "quickmodal.broker_format": "Broker Formatı",
    "quickmodal.broker_auto": "Otomatik Algıla",
    "quickmodal.broker_turkish": "Türk Broker",
    "quickmodal.broker_generic": "Genel Format",
    "quickmodal.records": "işlem",
    "quickmodal.more_records": "...ve {{count}} işlem daha",
    "quickmodal.more_errors": "...ve {{count}} hata daha",
    "quickmodal.bulk_use_example": "Örnek ekle",
    "quickmodal.bulk_format_label": "Format",
    "quickmodal.bulk_example_label": "Örnek",
    "quickmodal.bulk_lines": "{{count}} satır",
    "quickmodal.title": "İşlem Ekle",
    "quickmodal.tab_quick": "Hızlı Ekle",
    "quickmodal.tab_price": "Fiyattan Hesapla",
    "quickmodal.tab_csv": "CSV İçe Aktar",
    "quickmodal.tab_bulk": "Toplu Metin",
    "quickmodal.tab_ai": "AI ile Ekle",
    "quickmodal.ai_drop_hint": "Görseli bırak",
    "quickmodal.ai_drop_title": "Ekran görüntüsünü yapıştır veya bırak",
    "quickmodal.ai_drop_desc": "MT4/MT5, cTrader, TradingView, broker uygulaması ya da prop firma paneli. Ctrl+V ile de yapıştırabilirsin.",
    "quickmodal.ai_choose_image": "Görsel Seç",
    "quickmodal.ai_remove_image": "Görseli kaldır",
    "quickmodal.ai_pasted_image": "Yapıştırılan görsel",
    "quickmodal.ai_text_label": "veya yazarak anlat",
    "quickmodal.ai_text_placeholder": "örn: Altın 0.5 lot long, 2350'den girdim 2365'te kapattım, stop 2340",
    "quickmodal.ai_privacy": "Görsel saklanmaz. AI hiçbir şeyi kendisi kaydetmez; önce sen kontrol edersin.",
    "quickmodal.ai_usage": "Bugünkü AI hakkı: {{used}}/{{limit}}",
    "quickmodal.ai_read": "AI ile Oku",
    "quickmodal.ai_reading": "Okunuyor…",
    "quickmodal.ai_need_input": "Bir ekran görüntüsü ekle ya da işlemi yaz.",
    "quickmodal.ai_none": "İşlem bulunamadı.",
    "quickmodal.ai_filled": "AI formu doldurdu. Değerleri kontrol edip kaydet.",
    "quickmodal.ai_found_many": "AI {{count}} işlem okudu",
    "quickmodal.ai_no_exit": "Çıkış fiyatı bulunamadı; kaydetmeden önce gir.",
    "quickmodal.ai_no_lot_single": "Lot bulunamadı; lotu kontrol et.",
    "quickmodal.ai_check_multiplier": "Enstrüman tanınmadı: \"Diğer\" seçildi, çarpanı gir.",
    "quickmodal.ai_pnl_mismatch": "#{{n}} {{symbol}}: okunan K/Z ({{pnl}}) fiyatlarla ({{calc}}) tutmuyor. Kontrol et.",
    "quickmodal.ai_no_lot": "#{{n}} {{symbol}}: lot bulunamadı, atlandı.",
    "quickmodal.ai_open_skipped": "Çıkış fiyatı olmayan {{count}} açık pozisyon atlandı.",
    "quickmodal.ai_no_date": "{{count}} işlemde tarih yok; bugünün tarihi kullanılacak.",
    "quickmodal.ai_limit": "Bugünkü AI hakkın doldu (AI koçla ortak). Yarın yenilenir; Pro ile günde daha fazla kullanabilirsin.",
    "quickmodal.ai_busy": "AI şu an yoğun. Bir dakika sonra tekrar dene.",
    "quickmodal.ai_error": "AI okuyamadı. Tekrar dene.",
    "quickmodal.ai_bad_image": "Bu görsel kullanılamıyor. PNG, JPG veya WEBP ekran görüntüsü yükle.",
    "quickmodal.ai_login": "AI için giriş yapmalısın.",

    "quickmodal.mode_quick": "Hızlı Giriş",
    "quickmodal.mode_price": "Fiyat Hesaplama",
    "quickmodal.symbol": "Sembol *",
    "quickmodal.symbol_hint": "Sembolü manuel girin",
    "quickmodal.side": "Yön *",
    "quickmodal.buy": "Alış",
    "quickmodal.sell": "Satış",
    "quickmodal.pnl": "K/Z *",
    "quickmodal.risk_reward": "Risk / Reward",
    "quickmodal.strategy": "Strateji",
    "quickmodal.no_strategy": "— Strateji Yok —",
    "quickmodal.create_strategy": "Yeni",
    "quickmodal.saving": "Kaydediliyor...",
    "quickmodal.strategy_placeholder": "Strateji seç",

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
    "quickmodal.commission": "Komisyon",
    "quickmodal.swap": "Swap",
    "quickmodal.gross": "Brüt",
    "quickmodal.net": "Net",
    "quickmodal.comm_auto_hint": "Otomatik",
    "quickmodal.estimated_pnl": "Tahmini K/Z",
    "quickmodal.rr_calculated": "R/R",
    "quickmodal.calculate_from_price": "Fiyattan hesapla",
    "quickmodal.enter_manually": "Manuel gir",

    "quickmodal.notes": "Notlar",
    "quickmodal.notes_placeholder": "Notlar…",
    "quickmodal.date": "Tarih",
    "quickmodal.date_placeholder": "Tarih seç",
    "quickmodal.date_prev_month": "Önceki ay",
    "quickmodal.date_next_month": "Sonraki ay",
    "quickmodal.date_today": "Bugün",
    "quickmodal.date_clear": "Temizle",
    "quickmodal.loading_saving": "İşlem kaydediliyor...",

    "quickmodal.select_strategy": "Strateji Seç",
    "quickmodal.refresh": "Yenile",
    "quickmodal.clear": "Temizle",
    "quickmodal.loading_strategies": "Stratejiler yükleniyor...",
    "quickmodal.no_strategies": "Henüz strateji eklenmemiş.",
    "quickmodal.create_strategy_link": "Strateji oluştur →",
    "quickmodal.strategy_selected": "Strateji seçildi",
    "quickmodal.strategy_cleared": "Strateji temizlendi",

    "quickmodal.csv_import_title": "CSV İçe Aktar",
    "quickmodal.csv_import_desc": "MT4/MT5, cTrader, Binance, Bybit veya Excel dışa aktarım dosyanızı yükleyin",
    "quickmodal.csv_choose_file": "Dosya Seç",
    "quickmodal.csv_file_selected": "Dosya seçildi: {{filename}}",
    "quickmodal.csv_no_file": "Dosya seçilmedi",
    "quickmodal.csv_processing": "İşleniyor...",
    "quickmodal.csv_importing": "İçe aktarılıyor...",
    "quickmodal.csv_import_success": "{{count}} işlem başarıyla içe aktarıldı!",
    "quickmodal.csv_all_duplicates": "Dosyadaki tüm işlemler ({{count}}) zaten kayıtlı! Mükerrer kayıt oluşturulmadı.",
    "quickmodal.csv_duplicates_skipped": "{{count}} yeni işlem eklendi ({{skipped}} mükerrer işlem atlandı).",
    "quickmodal.csv_import_error": "{{success}} içe aktarıldı, {{failed}} hata!",
    "quickmodal.csv_no_data": "CSV dosyasında veri bulunamadı!",
    "quickmodal.csv_required_fields": "{{row}}. satırda zorunlu alanlar eksik",
    "quickmodal.csv_invalid_date": "{{row}}. satırda geçersiz tarih formatı",

    "quickmodal.bulk_title": "Toplu İşlem Ekle",
    "quickmodal.bulk_desc": "Her satıra bir işlem gelecek şekilde aşağıdaki formatta girin:",
    "quickmodal.bulk_format": "sembol,yön,lot,giriş,çıkış,tarih,not",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,İlk işlem\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Altın işlemi",
    "quickmodal.bulk_processing": "İşleniyor...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} işlem eklendi ({{failed}} başarısız)",
    "quickmodal.bulk_complete": "{{success}} işlem başarıyla eklendi!",
    "quickmodal.bulk_error": "{{success}} eklendi, {{failed}} hata!",
    "quickmodal.bulk_required": "Lütfen en az bir işlem girin!",
    "quickmodal.bulk_invalid_format": "{{line}}. satırda geçersiz format: {{error}}",

    "quickmodal.error_symbol_required": "Lütfen bir sembol girin!",
    "quickmodal.error_pnl_required": "Lütfen geçerli bir K/Z girin!",
    "quickmodal.error_pnl_invalid": "K/Z bir sayı olmalıdır!",
    "quickmodal.error_entry_required": "Giriş fiyatı zorunludur!",
    "quickmodal.error_entry_invalid": "Lütfen geçerli bir giriş fiyatı girin!",
    "quickmodal.error_exit_invalid": "Lütfen geçerli bir çıkış fiyatı girin! Yalnızca kapanmış işlemler eklenebilir.",
    "quickmodal.error_lot_required": "Lot zorunludur!",
    "quickmodal.error_lot_invalid": "Lütfen geçerli bir lot büyüklüğü girin!",
    "quickmodal.error_instrument_required": "Lütfen bir enstrüman seçin!",
    "quickmodal.error_multiplier_required": "Manuel çarpan zorunludur!",
    "quickmodal.error_auth_required": "Lütfen önce giriş yapın!",
    "quickmodal.error_connection": "Sistem bağlantısı yok!",
    "quickmodal.error_save": "Kaydetme hatası: {{message}}",
    "quickmodal.error_general": "Bir hata oluştu. Lütfen tekrar deneyin.",

    "quickmodal.success_saved": "İşlem başarıyla eklendi!",

    "quickmodal.cancel": "İptal",
    "quickmodal.save": "Kaydet",
    "quickmodal.import": "İçe Aktar",
    "quickmodal.paste_add": "İşlemleri Ekle",

    // Commission Modal
    "quickmodal.comm_modal_title": "Komisyon & Swap Şablonları",
    "quickmodal.comm_presets_title": "HAZIR ŞABLONLAR",
    "quickmodal.comm_template_name": "ŞABLON ADI",
    "quickmodal.comm_template_name_ph": "örn: cTrader Raw",
    "quickmodal.comm_rate_per_lot": "LOT BAŞI ORAN",
    "quickmodal.comm_auto_toggle": "Sonraki işlemlerde lota göre otomatik hesapla",
    "quickmodal.comm_delete": "Şablonu Sil",
    "quickmodal.comm_save_apply": "Kaydet ve Uygula",
    "quickmodal.comm_new_template": "+ Yeni Şablon",
    "quickmodal.comm_zero_label": "Sıfır Komisyon",
    "quickmodal.comm_updated_msg": "Komisyon şablonu güncellendi: ",
    "quickmodal.comm_deleted_msg": "Şablon silindi.",
    "quickmodal.dismiss": "Vazgeç"
  },

  de: {
    "quickmodal.sym_recent": "Zuletzt verwendet",
    "quickmodal.csv_drop_title": "Datei hierher ziehen und ablegen",
    "quickmodal.bulk_use_example": "Beispiel einfügen",
    "quickmodal.bulk_format_label": "Format",
    "quickmodal.bulk_example_label": "Beispiel",
    "quickmodal.bulk_lines": "{{count}} Zeilen",
    "quickmodal.title": "Trade hinzufügen",
    "quickmodal.tab_quick": "Schnell Hinzufügen",
    "quickmodal.tab_price": "Preisbasiert",
    "quickmodal.tab_csv": "CSV Import",
    "quickmodal.tab_bulk": "Massen Einfügen",
    "quickmodal.tab_ai": "Mit KI",
    "quickmodal.ai_drop_hint": "Bild ablegen",
    "quickmodal.ai_drop_title": "Screenshot einfügen oder ablegen",
    "quickmodal.ai_drop_desc": "MT4/MT5, cTrader, TradingView, deine Broker-App oder ein Prop-Firm-Dashboard. Einfügen geht auch mit Strg+V.",
    "quickmodal.ai_choose_image": "Bild wählen",
    "quickmodal.ai_remove_image": "Bild entfernen",
    "quickmodal.ai_pasted_image": "Eingefügtes Bild",
    "quickmodal.ai_text_label": "oder beschreibe ihn",
    "quickmodal.ai_text_placeholder": "z.B. Gold 0,5 Lot Long, Einstieg 2350, Ausstieg 2365, Stop 2340",
    "quickmodal.ai_privacy": "Das Bild wird nicht gespeichert. Die KI speichert nie selbst; du prüfst zuerst.",
    "quickmodal.ai_usage": "KI heute: {{used}}/{{limit}}",
    "quickmodal.ai_read": "Mit KI lesen",
    "quickmodal.ai_reading": "Wird gelesen…",
    "quickmodal.ai_need_input": "Füge einen Screenshot hinzu oder beschreibe den Trade.",
    "quickmodal.ai_none": "Kein Trade gefunden.",
    "quickmodal.ai_filled": "Die KI hat das Formular ausgefüllt. Prüfe die Werte und speichere.",
    "quickmodal.ai_found_many": "KI hat {{count}} Trades gelesen",
    "quickmodal.ai_no_exit": "Kein Ausstiegskurs gefunden; trage ihn vor dem Speichern ein.",
    "quickmodal.ai_no_lot_single": "Keine Positionsgröße gefunden; prüfe das Lot.",
    "quickmodal.ai_check_multiplier": "Unbekanntes Instrument: „Andere“ ist gewählt, trage den Multiplikator ein.",
    "quickmodal.ai_pnl_mismatch": "#{{n}} {{symbol}}: der gelesene G/V ({{pnl}}) passt nicht zu den Kursen ({{calc}}). Bitte prüfen.",
    "quickmodal.ai_no_lot": "#{{n}} {{symbol}}: Größe nicht gefunden, übersprungen.",
    "quickmodal.ai_open_skipped": "{{count}} offene Position(en) ohne Ausstiegskurs übersprungen.",
    "quickmodal.ai_no_date": "{{count}} Trade(s) ohne Datum; das heutige Datum wird verwendet.",
    "quickmodal.ai_limit": "Dein KI-Limit für heute ist aufgebraucht (gemeinsam mit dem KI-Coach). Es wird morgen zurückgesetzt; mit Pro hast du mehr pro Tag.",
    "quickmodal.ai_busy": "Die KI ist gerade ausgelastet. Versuche es in einer Minute erneut.",
    "quickmodal.ai_error": "Die KI konnte es nicht lesen. Versuche es erneut.",
    "quickmodal.ai_bad_image": "Dieses Bild kann nicht verwendet werden. Nutze einen PNG-, JPG- oder WEBP-Screenshot.",
    "quickmodal.ai_login": "Melde dich an, um die KI zu nutzen.",

    "quickmodal.mode_quick": "Schnelleingabe",
    "quickmodal.mode_price": "Preisberechnung",
    "quickmodal.symbol": "Symbol *",
    "quickmodal.symbol_hint": "Symbol manuell eingeben",
    "quickmodal.side": "Richtung *",
    "quickmodal.buy": "Kaufen",
    "quickmodal.sell": "Verkaufen",
    "quickmodal.pnl": "P&L *",
    "quickmodal.risk_reward": "Risk / Reward",
    "quickmodal.strategy": "Strategie",
    "quickmodal.no_strategy": "— Keine Strategie —",
    "quickmodal.create_strategy": "Neu",
    "quickmodal.saving": "Speichern...",
    "quickmodal.strategy_placeholder": "Strategie wählen",

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
    "quickmodal.commission": "Kommission",
    "quickmodal.swap": "Swap",
    "quickmodal.gross": "Brutto",
    "quickmodal.net": "Netto",
    "quickmodal.comm_auto_hint": "Auto",
    "quickmodal.estimated_pnl": "Gesch. P&L",
    "quickmodal.rr_calculated": "R/R",
    "quickmodal.calculate_from_price": "Vom Preis berechnen",
    "quickmodal.enter_manually": "Manuell eingeben",

    "quickmodal.notes": "Notizen",
    "quickmodal.notes_placeholder": "Notizen...",
    "quickmodal.date": "Datum",
    "quickmodal.date_placeholder": "Datum wählen",
    "quickmodal.date_prev_month": "Vorheriger Monat",
    "quickmodal.date_next_month": "Nächster Monat",
    "quickmodal.date_today": "Heute",
    "quickmodal.date_clear": "Löschen",
    "quickmodal.loading_saving": "Trade wird gespeichert...",

    "quickmodal.select_strategy": "Strategie wählen",
    "quickmodal.refresh": "Aktualisieren",
    "quickmodal.clear": "Löschen",
    "quickmodal.loading_strategies": "Lade Strategien...",
    "quickmodal.no_strategies": "Noch keine Strategien hinzugefügt.",
    "quickmodal.create_strategy_link": "Strategie erstellen →",
    "quickmodal.strategy_selected": "Strategie ausgewählt",
    "quickmodal.strategy_cleared": "Strategie gelöscht",

    "quickmodal.csv_import_title": "CSV Import",
    "quickmodal.csv_import_desc": "Laden Sie Ihren Export aus MT4/MT5, cTrader, Binance, Bybit oder Excel hoch",
    "quickmodal.csv_choose_file": "Datei wählen",
    "quickmodal.csv_file_selected": "Datei ausgewählt: {{filename}}",
    "quickmodal.csv_no_file": "Keine Datei ausgewählt",
    "quickmodal.csv_processing": "Verarbeite...",
    "quickmodal.csv_importing": "Importiere...",
    "quickmodal.csv_import_success": "{{count}} Trades erfolgreich importiert!",
    "quickmodal.csv_all_duplicates": "Alle {{count}} Trades sind bereits importiert! Keine Duplikate hinzugefügt.",
    "quickmodal.csv_duplicates_skipped": "{{count}} neue Trades importiert ({{skipped}} Duplikate übersprungen).",
    "quickmodal.csv_import_error": "{{success}} importiert, {{failed}} Fehler!",
    "quickmodal.csv_no_data": "Keine Daten in CSV-Datei gefunden!",
    "quickmodal.csv_required_fields": "Fehlende Pflichtfelder in Zeile {{row}}",
    "quickmodal.csv_invalid_date": "Ungültiges Datumsformat in Zeile {{row}}",
    "quickmodal.broker_format": "Broker-Format",
    "quickmodal.broker_auto": "Automatisch erkennen",
    "quickmodal.broker_turkish": "Türkischer Broker",
    "quickmodal.broker_generic": "Standardformat",
    "quickmodal.csv_drop_hint": "Datei ablegen",
    "quickmodal.records": "Trades",
    "quickmodal.more_records": "...und {{count}} weitere Trades",
    "quickmodal.more_errors": "...und {{count}} weitere Fehler",

    "quickmodal.bulk_title": "Trades massenhaft hinzufügen",
    "quickmodal.bulk_desc": "Geben Sie einen Trade pro Zeile im folgenden Format ein:",
    "quickmodal.bulk_format": "symbol,richtung,lot,einstieg,ausstieg,datum,notizen",
    "quickmodal.bulk_example": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,Erster Trade",
    "quickmodal.bulk_placeholder": "EURUSD,LONG,0.10,1.08500,1.09000,2026-01-15,Erster Trade\nXAUUSD,SHORT,0.05,2450.00,2440.00,2026-01-15,Gold Trade",
    "quickmodal.bulk_processing": "Verarbeite...",
    "quickmodal.bulk_progress": "{{current}} / {{total}} Trades hinzugefügt ({{failed}} fehlgeschlagen)",
    "quickmodal.bulk_complete": "{{success}} Trades erfolgreich hinzugefügt!",
    "quickmodal.bulk_error": "{{success}} hinzugefügt, {{failed}} Fehler!",
    "quickmodal.bulk_required": "Bitte geben Sie mindestens einen Trade ein!",
    "quickmodal.bulk_invalid_format": "Ungültiges Format in Zeile {{line}}: {{error}}",

    "quickmodal.error_symbol_required": "Bitte geben Sie ein Symbol ein!",
    "quickmodal.error_pnl_required": "Bitte geben Sie ein gültiges P&L ein!",
    "quickmodal.error_pnl_invalid": "P&L muss eine Zahl sein!",
    "quickmodal.error_entry_required": "Einstiegspreis ist erforderlich!",
    "quickmodal.error_entry_invalid": "Bitte geben Sie einen gültigen Einstiegspreis ein!",
    "quickmodal.error_exit_invalid": "Bitte geben Sie einen gültigen Ausstiegspreis ein! Es können nur geschlossene Trades hinzugefügt werden.",
    "quickmodal.error_lot_required": "Lot ist erforderlich!",
    "quickmodal.error_lot_invalid": "Bitte geben Sie eine gültige Lot-Größe ein!",
    "quickmodal.error_instrument_required": "Bitte wählen Sie ein Instrument!",
    "quickmodal.error_multiplier_required": "Manueller Multiplikator ist erforderlich!",
    "quickmodal.error_auth_required": "Bitte melden Sie sich zuerst an!",
    "quickmodal.error_connection": "Keine Systemverbindung!",
    "quickmodal.error_save": "Speicherfehler: {{message}}",
    "quickmodal.error_general": "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",

    "quickmodal.success_saved": "Trade erfolgreich hinzugefügt!",

    "quickmodal.cancel": "Abbrechen",
    "quickmodal.save": "Speichern",
    "quickmodal.import": "Importieren",
    "quickmodal.paste_add": "Trades hinzufügen",

    // Commission Modal
    "quickmodal.comm_modal_title": "Kommission & Swap Vorlagen",
    "quickmodal.comm_presets_title": "VORLAGEN",
    "quickmodal.comm_template_name": "VORLAGENNAME",
    "quickmodal.comm_template_name_ph": "z.B. cTrader Raw",
    "quickmodal.comm_rate_per_lot": "KOMMISSION PRO LOT",
    "quickmodal.comm_auto_toggle": "Bei zukünftigen Trades automatisch nach Lots berechnen",
    "quickmodal.comm_delete": "Vorlage löschen",
    "quickmodal.comm_save_apply": "Speichern & Anwenden",
    "quickmodal.comm_new_template": "+ Neue Vorlage",
    "quickmodal.comm_zero_label": "Null-Kommission",
    "quickmodal.comm_updated_msg": "Kommissionsvorlage aktualisiert: ",
    "quickmodal.comm_deleted_msg": "Vorlage gelöscht.",
    "quickmodal.dismiss": "Abbrechen"
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

    const savedLang = localStorage.getItem('ww_language');
    if (savedLang && quickTranslations[savedLang]) {
      this.currentLang = savedLang;
    } else {
      this.currentLang = defaultLang;
    }

    // Ana i18n dil değişikliklerini dinle
    var self = this;
    function attachListener() {
      if (typeof i18n !== 'undefined' && typeof i18n.onChange === 'function') {
        i18n.onChange(function(lang) {
          if (quickTranslations[lang]) {
            self.setLanguage(lang);
          }
        });
        wwLog.log('✅ [QuickI18n] Ana i18n dinleyicisi bağlandı');
        return true;
      }
      return false;
    }

    if (!attachListener()) {
      setTimeout(attachListener, 100);
    }

    wwLog.log('✅ Quick Modal I18n initialized! Dil:', this.currentLang);
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

  setLanguage(lang) {
    if (!quickTranslations[lang]) {
      wwLog.warn(`[QuickI18n] Dil bulunamadı: ${lang}`);
      return false;
    }

    const changed = this.currentLang !== lang;
    this.currentLang = lang;

    // Her durumda apply et (idempotent)
    this.apply();

    if (changed) {
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

  // data-quick-i18n attribute'larını günceller
  apply() {
    try {
      document.querySelectorAll('[data-quick-i18n]').forEach(el => {
        const key = el.getAttribute('data-quick-i18n');
        if (!key) return;
        const text = this.t(key);

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.hasAttribute('data-quick-i18n-placeholder')) {
            el.placeholder = text;
          }
          return;
        }

        if (el.textContent !== text) {
          el.textContent = text;
        }
      });

      document.querySelectorAll('[data-quick-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-quick-i18n-placeholder');
        if (!key) return;
        const text = this.t(key);
        if (el.placeholder !== text) {
          el.placeholder = text;
        }
      });

      document.querySelectorAll('[data-quick-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-quick-i18n-html');
        if (!key) return;
        const text = this.t(key);
        if (el.innerHTML !== text) {
          el.innerHTML = text;
        }
      });
    } catch(e) {
      wwLog.warn('[QuickI18n] apply hatası:', e);
    }
  }
}

// ============================================================
// GLOBAL INSTANCE
// ============================================================

const quickI18n = new QuickI18n('en');
window.quickI18n = quickI18n;

wwLog.log('✅ Quick Modal I18n loaded! Dil:', quickI18n.getCurrentLanguage());