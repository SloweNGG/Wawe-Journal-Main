// ============================================================
// WAWE JOURNAL - ONBOARDING WIZARD, SPOTLIGHT TOUR & TASKS
// Sequential Flow:
// 1. Welcome Wizard & Setup (Language, Currency, Theme, Journal)
// 2. Guided Interactive Spotlight Tour
// 3. Floating Bottom-Right Tasks Checklist
// ============================================================

(function () {
  'use strict';

  if (typeof window !== 'undefined' && window.__wj_onboarding_script_loaded) {
    return;
  }
  if (typeof window !== 'undefined') {
    window.__wj_onboarding_script_loaded = true;
  }

  var wwLog = (typeof window !== 'undefined' && window.wwLog) ? window.wwLog : console;

  // Default Journal names & placeholders per language
  var defaultJournalNames = {
    tr: 'Ana Portföy',
    en: 'Main Portfolio',
    de: 'Hauptportfolio'
  };
  var defaultJournalPlaceholders = {
    tr: 'Örn: Ana Portföy, Binance Vadeli, Forex',
    en: 'e.g. Main Portfolio, Futures, Forex',
    de: 'z.B. Hauptportfolio, Futures, Forex'
  };
  var defaultJournalDescriptions = {
    tr: 'İlk İşlem Defteri',
    en: 'First Trading Journal',
    de: 'Erstes Trading-Tagebuch'
  };

  // Global State
  var state = {
    user: null,
    currentStep: 0,
    totalSteps: 5,
    selectedLang: 'tr',
    selectedCurrency: '$',
    selectedTheme: 'dark',
    selectedTz: 'auto',
    journalName: 'Ana Portföy',
    hasCustomJournalName: false,
    journalIcon: 'trending-up',
    journalColor: '#7c6dfa',
    tourIndex: 0,
    tradesCount: 0,
    strategiesCount: 0,
    isTourActive: false
  };

  // Safe i18n translation helper
  function t(key, fallback) {
    if (typeof window.i18n !== 'undefined' && typeof window.i18n.t === 'function') {
      var val = window.i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  // ------------------------------------------------------------
  // LUCIDE ICONS HELPER
  // ------------------------------------------------------------
  function refreshLucideIcons() {
    if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
      try {
        window.lucide.createIcons();
      } catch (e) {
        wwLog.warn('Lucide createIcons note:', e);
      }
    }
  }

  // ------------------------------------------------------------
  // 1. FAZ 1: HOŞGELDİN EKRANI VE SİHİRBAZ (WIZARD)
  // ------------------------------------------------------------
  function renderWizardModal() {
    var existing = document.getElementById('wj-onboarding-modal');
    if (existing) existing.remove();

    var currentSavedTheme = localStorage.getItem('ww_theme') || 'dark';
    state.selectedTheme = currentSavedTheme;
    var currentSavedLang = localStorage.getItem('ww_language') || 'tr';
    state.selectedLang = currentSavedLang;
    var currentSavedCurr = localStorage.getItem('ww_currency') || '$';
    state.selectedCurrency = currentSavedCurr;
    state.selectedTz = window.WwTime ? window.WwTime.getSettings().tz : 'auto';

    if (!state.hasCustomJournalName) {
      state.journalName = defaultJournalNames[currentSavedLang] || 'Ana Portföy';
    }

    var modalHtml = `
      <div class="wj-onboarding-overlay" id="wj-onboarding-modal">
        <div class="wj-onboarding-card is-welcome">
          <div class="wj-welcome-scene" aria-hidden="true"></div>
          <div class="wj-wizard-progress-bar">
            <div class="wj-wizard-progress-fill" id="wj-progress-fill" style="width: 0%;"></div>
          </div>
          <button class="wj-onboarding-skip-btn" id="wj-wizard-skip-btn" title="Geç">
            <span data-i18n="onboarding.btn_skip">${t('onboarding.btn_skip', 'Şimdilik Geç')}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>

          <div class="wj-onboarding-body">
            
            <!-- STEP 0: 3 DİLLİ ANİMASYONLU GİRİŞ -->
            <div class="wj-wizard-step active" id="wj-step-0">
              <div class="wj-welcome-hero">
                <div class="wj-welcome-brand-logo">
                  <div class="wj-welcome-logo-icon">
                    <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                      <polyline points="2,16 7,9 12,13 19,4" stroke="#a78bfa" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <span class="wj-welcome-logo-text">Wawe<span class="wj-welcome-logo-accent">Journal</span></span>
                </div>

                <div class="wj-polyglot-title-wrapper">
                  <span class="wj-polyglot-title" id="wj-polyglot-text">${getPolyglotStart().title}</span>
                </div>

                <div class="wj-polyglot-langs" id="wj-polyglot-langs" aria-hidden="true">
                  ${polyglotGreetings.map(function (g) {
                    return '<span class="wj-polyglot-lang" data-lang="' + g.lang + '">' + g.lang.toUpperCase() + '</span>';
                  }).join('')}
                </div>

                <div class="wj-welcome-subtitle">
                  <p class="wj-welcome-subtitle-text" id="wj-polyglot-subtitle">${getPolyglotStart().subtitle}</p>
                </div>

                <ol class="wj-welcome-steps">
                  <li class="wj-welcome-step"><span class="wj-welcome-step-icon"><i data-lucide="languages"></i></span><span>${t('onboarding.preview_lang', 'Dil')}</span></li>
                  <li class="wj-welcome-step"><span class="wj-welcome-step-icon"><i data-lucide="coins"></i></span><span>${t('onboarding.preview_curr', 'Para birimi')}</span></li>
                  <li class="wj-welcome-step"><span class="wj-welcome-step-icon"><i data-lucide="clock"></i></span><span>${t('onboarding.preview_tz', 'Saat dilimi')}</span></li>
                  <li class="wj-welcome-step"><span class="wj-welcome-step-icon"><i data-lucide="sun-moon"></i></span><span>${t('onboarding.preview_theme', 'Tema')}</span></li>
                  <li class="wj-welcome-step"><span class="wj-welcome-step-icon"><i data-lucide="notebook-pen"></i></span><span>${t('onboarding.preview_journal', 'Defter')}</span></li>
                </ol>

                <button class="wj-btn-primary" id="wj-hero-start-btn">
                  <span data-i18n="onboarding.btn_start">${t('onboarding.btn_start', 'Başlayalım →')}</span>
                </button>
                <p class="wj-welcome-time">
                  <i data-lucide="clock-3"></i>
                  <span data-i18n="onboarding.setup_time">${t('onboarding.setup_time', 'Yaklaşık 1 dakika sürer')}</span>
                </p>
              </div>
            </div>

            <!-- STEP 1: DİL SEÇİMİ -->
            <div class="wj-wizard-step" id="wj-step-1">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım {step} / {total}').replace('{step}', '1').replace('{total}', state.totalSteps)}</span>
              </div>
              <h2 class="wj-step-title" data-i18n="onboarding.step_lang_title">${t('onboarding.step_lang_title', 'Dil Tercihi')}</h2>
              <p class="wj-step-desc" data-i18n="onboarding.step_lang_desc">${t('onboarding.step_lang_desc', 'Platformu hangi dilde kullanmak istersiniz?')}</p>

              <div class="wj-options-grid">
                <div class="wj-option-card ${state.selectedLang === 'en' ? 'active' : ''}" data-lang="en">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-flag">
                    <svg class="wj-flag-svg" viewBox="0 0 60 30" aria-label="English">
                      <clipPath id="wj-flag-uk-clip"><rect width="60" height="30" rx="3"/></clipPath>
                      <g clip-path="url(#wj-flag-uk-clip)">
                        <rect width="60" height="30" fill="#012169"/>
                        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" stroke-width="6"/>
                        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#C8102E" stroke-width="4"/>
                        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" stroke-width="10"/>
                        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/>
                      </g>
                    </svg>
                  </div>
                  <div class="wj-option-name">English</div>
                  <div class="wj-option-sub">Default language</div>
                </div>
                <div class="wj-option-card ${state.selectedLang === 'de' ? 'active' : ''}" data-lang="de">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-flag">
                    <svg class="wj-flag-svg" viewBox="0 0 5 3" aria-label="Deutsch">
                      <rect width="5" height="1" y="0" fill="#000000"/>
                      <rect width="5" height="1" y="1" fill="#DD0000"/>
                      <rect width="5" height="1" y="2" fill="#FFCE00"/>
                    </svg>
                  </div>
                  <div class="wj-option-name">Deutsch</div>
                  <div class="wj-option-sub">Deutsche Sprache</div>
                </div>
                <div class="wj-option-card ${state.selectedLang === 'tr' ? 'active' : ''}" data-lang="tr">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-flag">
                    <svg class="wj-flag-svg" viewBox="0 0 1200 800" aria-label="Türkçe">
                      <rect width="1200" height="800" fill="#E30A17"/>
                      <circle cx="425" cy="400" r="200" fill="#ffffff"/>
                      <circle cx="475" cy="400" r="160" fill="#E30A17"/>
                      <polygon fill="#ffffff" points="583.33,400 706.77,439.95 630.48,335.05 630.48,464.95 706.77,360.05"/>
                    </svg>
                  </div>
                  <div class="wj-option-name">Türkçe</div>
                  <div class="wj-option-sub">Türkçe arayüz</div>
                </div>
              </div>

              <div class="wj-wizard-footer">
                <button class="wj-btn-back" data-goto="0">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" data-goto="2">${t('onboarding.btn_next', 'Devam Et →')}</button>
              </div>
            </div>

            <!-- STEP 2: PARA BİRİMİ SEÇİMİ -->
            <div class="wj-wizard-step" id="wj-step-2">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım {step} / {total}').replace('{step}', '2').replace('{total}', state.totalSteps)}</span>
              </div>
              <h2 class="wj-step-title" data-i18n="onboarding.step_curr_title">${t('onboarding.step_curr_title', 'Para Birimi')}</h2>
              <p class="wj-step-desc" data-i18n="onboarding.step_curr_desc">${t('onboarding.step_curr_desc', 'K/Z ve hesap bakiyeniz için ana para birimini seçin.')}</p>

              <div class="wj-options-grid">
                <div class="wj-option-card ${state.selectedCurrency === '$' ? 'active' : ''}" data-curr="$">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-symbol"><i data-lucide="dollar-sign"></i></div>
                  <div class="wj-option-name">USD</div>
                  <div class="wj-option-sub">US Dollar</div>
                </div>
                <div class="wj-option-card ${state.selectedCurrency === '€' ? 'active' : ''}" data-curr="€">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-symbol"><i data-lucide="euro"></i></div>
                  <div class="wj-option-name">EUR</div>
                  <div class="wj-option-sub">Euro</div>
                </div>
                <div class="wj-option-card ${state.selectedCurrency === '₺' ? 'active' : ''}" data-curr="₺">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-symbol"><i data-lucide="coins"></i></div>
                  <div class="wj-option-name">TRY</div>
                  <div class="wj-option-sub">Türk Lirası</div>
                </div>
                <div class="wj-option-card ${state.selectedCurrency === '£' ? 'active' : ''}" data-curr="£">
                  <div class="wj-option-card-badge"><i data-lucide="check"></i></div>
                  <div class="wj-option-symbol"><i data-lucide="pound-sterling"></i></div>
                  <div class="wj-option-name">GBP</div>
                  <div class="wj-option-sub">British Pound</div>
                </div>
              </div>

              <div class="wj-wizard-footer">
                <button class="wj-btn-back" data-goto="1">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" data-goto="3">${t('onboarding.btn_next', 'Devam Et →')}</button>
              </div>
            </div>

            <!-- STEP 3: SAAT DİLİMİ (işlem saatleri, takvim günü, günlük K/Z) -->
            <div class="wj-wizard-step" id="wj-step-3">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım {step} / {total}').replace('{step}', '3').replace('{total}', state.totalSteps)}</span>
              </div>
              <h2 class="wj-step-title" data-i18n="onboarding.step_tz_title">${t('onboarding.step_tz_title', 'Saat Dilimi')}</h2>
              <p class="wj-step-desc" data-i18n="onboarding.step_tz_desc">${t('onboarding.step_tz_desc', 'İşlem saatlerin, takvim günlerin ve günlük K/Z bu saat dilimine göre hesaplanır.')}</p>

              <div class="wj-tz-clock">
                <div class="wj-tz-clock-time" id="wj-tz-clock-time">--:--</div>
                <div class="wj-tz-clock-meta">
                  <span id="wj-tz-clock-date"></span>
                  <span class="wj-tz-clock-zone" id="wj-tz-clock-zone"></span>
                </div>
              </div>

              <div class="wj-tz-auto ${state.selectedTz === 'auto' ? 'active' : ''}" id="wj-tz-auto" role="button" tabindex="0">
                <span class="wj-tz-auto-icon"><i data-lucide="locate-fixed"></i></span>
                <span class="wj-tz-auto-text">
                  <span class="wj-option-name" data-i18n="onboarding.tz_auto">${t('onboarding.tz_auto', 'Cihazımla aynı')}</span>
                  <span class="wj-option-sub" id="wj-tz-auto-sub"></span>
                </span>
                <span class="wj-tz-auto-check"><i data-lucide="check"></i></span>
              </div>

              <div class="wj-form-group">
                <label class="wj-form-label" id="wj-tz-label" data-i18n="onboarding.tz_other">${t('onboarding.tz_other', 'Ya da listeden seç')}</label>
                <button type="button" class="wj-tz-trigger" id="wj-tz-trigger" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="wj-tz-label">
                  <i data-lucide="globe"></i>
                  <span class="wj-tz-trigger-text" id="wj-tz-trigger-text"></span>
                  <span class="wj-tz-offset-pill" id="wj-tz-trigger-offset"></span>
                  <svg class="wj-tz-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>

              <p class="wj-tz-hint">
                <i data-lucide="info"></i>
                <span data-i18n="onboarding.tz_hint">${t('onboarding.tz_hint', 'İstediğin zaman Ayarlar › Bölge ve Saat bölümünden değiştirebilirsin.')}</span>
              </p>

              <div class="wj-wizard-footer">
                <button class="wj-btn-back" data-goto="2">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" data-goto="4">${t('onboarding.btn_next', 'Devam Et →')}</button>
              </div>
            </div>

            <!-- STEP 4: TEMA SEÇİMİ (DARK / LIGHT) -->
            <div class="wj-wizard-step" id="wj-step-4">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım {step} / {total}').replace('{step}', '4').replace('{total}', state.totalSteps)}</span>
              </div>
              <h2 class="wj-step-title" data-i18n="onboarding.step_theme_title">${t('onboarding.step_theme_title', 'Görünüm ve Tema')}</h2>
              <p class="wj-step-desc" data-i18n="onboarding.step_theme_desc">${t('onboarding.step_theme_desc', 'Size en uygun çalışma ortamını belirleyin.')}</p>

              <div class="wj-theme-grid">
                <div class="wj-theme-card ${state.selectedTheme !== 'light' ? 'active' : ''}" data-theme="dark">
                  <div class="wj-theme-preview dark-preview">
                    <div class="wj-preview-nav">
                      <span class="wj-preview-dot"></span>
                      <span class="wj-preview-dot" style="background:#38bdf8;"></span>
                    </div>
                    <div class="wj-preview-bars">
                      <div class="wj-preview-card"></div>
                      <div class="wj-preview-card"></div>
                    </div>
                  </div>
                  <div class="wj-theme-card-info" style="display:flex;align-items:center;gap:0.6rem;">
                    <i data-lucide="moon" style="width:20px;height:20px;color:#a78bfa;flex-shrink:0;"></i>
                    <div>
                      <div class="wj-theme-card-title" data-i18n="onboarding.theme_dark">${t('onboarding.theme_dark', 'Koyu Tema')}</div>
                      <div class="wj-option-sub" data-i18n="onboarding.theme_dark_desc">${t('onboarding.theme_dark_desc', 'Göz yormayan obsidian ve neon')}</div>
                    </div>
                  </div>
                </div>

                <div class="wj-theme-card ${state.selectedTheme === 'light' ? 'active' : ''}" data-theme="light">
                  <div class="wj-theme-preview light-preview">
                    <div class="wj-preview-nav">
                      <span class="wj-preview-dot"></span>
                      <span class="wj-preview-dot" style="background:#0284c7;"></span>
                    </div>
                    <div class="wj-preview-bars">
                      <div class="wj-preview-card"></div>
                      <div class="wj-preview-card"></div>
                    </div>
                  </div>
                  <div class="wj-theme-card-info" style="display:flex;align-items:center;gap:0.6rem;">
                    <i data-lucide="sun" style="width:20px;height:20px;color:#f59e0b;flex-shrink:0;"></i>
                    <div>
                      <div class="wj-theme-card-title" data-i18n="onboarding.theme_light">${t('onboarding.theme_light', 'Açık Tema')}</div>
                      <div class="wj-option-sub" data-i18n="onboarding.theme_light_desc">${t('onboarding.theme_light_desc', 'Aydınlık, ferah ve temiz görünüm')}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="wj-wizard-footer">
                <button class="wj-btn-back" data-goto="3">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" data-goto="5">${t('onboarding.btn_next', 'Devam Et →')}</button>
              </div>
            </div>

            <!-- STEP 5: İLK DEFTER (JOURNAL) KURULUMU -->
            <div class="wj-wizard-step" id="wj-step-5">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım {step} / {total}').replace('{step}', '5').replace('{total}', state.totalSteps)}</span>
              </div>
              <h2 class="wj-step-title" data-i18n="onboarding.step_journal_title">${t('onboarding.step_journal_title', 'İlk İşlem Günlüğünüz')}</h2>
              <p class="wj-step-desc" data-i18n="onboarding.step_journal_desc">${t('onboarding.step_journal_desc', 'İşlemlerinizi kaydedeceğiniz ilk defterinizi oluşturun.')}</p>

              <div class="wj-form-group">
                <label class="wj-form-label" data-i18n="onboarding.journal_name_label">${t('onboarding.journal_name_label', 'Günlük / Portföy Adı')}</label>
                <input type="text" class="wj-input" id="wj-journal-name-input" value="${state.journalName}" placeholder="${t('onboarding.journal_name_placeholder', defaultJournalPlaceholders[state.selectedLang] || defaultJournalPlaceholders.tr)}" maxlength="50" />
              </div>

              <div class="wj-form-group">
                <label class="wj-form-label" data-i18n="onboarding.journal_icon_label">${t('onboarding.journal_icon_label', 'İkon / Logo Seçin')}</label>
                <div class="wj-icons-picker" id="wj-icon-picker">
                  <div class="wj-icon-choice ${state.journalIcon === 'trending-up' ? 'active' : ''}" data-icon="trending-up" title="Trending Up"><i data-lucide="trending-up"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'bar-chart-2' ? 'active' : ''}" data-icon="bar-chart-2" title="Bar Chart"><i data-lucide="bar-chart-2"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'zap' ? 'active' : ''}" data-icon="zap" title="Zap"><i data-lucide="zap"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'flame' ? 'active' : ''}" data-icon="flame" title="Flame"><i data-lucide="flame"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'target' ? 'active' : ''}" data-icon="target" title="Target"><i data-lucide="target"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'rocket' ? 'active' : ''}" data-icon="rocket" title="Rocket"><i data-lucide="rocket"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'gem' ? 'active' : ''}" data-icon="gem" title="Gem"><i data-lucide="gem"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'waves' ? 'active' : ''}" data-icon="waves" title="Waves"><i data-lucide="waves"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'crown' ? 'active' : ''}" data-icon="crown" title="Crown"><i data-lucide="crown"></i></div>
                  <div class="wj-icon-choice ${state.journalIcon === 'folder' ? 'active' : ''}" data-icon="folder" title="Folder"><i data-lucide="folder"></i></div>
                </div>
              </div>

              <div class="wj-form-group">
                <label class="wj-form-label" data-i18n="onboarding.journal_color_label">${t('onboarding.journal_color_label', 'Tema Rengi')}</label>
                <div class="wj-colors-row" id="wj-color-picker">
                  <div class="wj-color-dot ${state.journalColor === '#7c6dfa' ? 'active' : ''}" data-color="#7c6dfa" style="background:#7c6dfa;"></div>
                  <div class="wj-color-dot ${state.journalColor === '#3b82f6' ? 'active' : ''}" data-color="#3b82f6" style="background:#3b82f6;"></div>
                  <div class="wj-color-dot ${state.journalColor === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background:#10b981;"></div>
                  <div class="wj-color-dot ${state.journalColor === '#f59e0b' ? 'active' : ''}" data-color="#f59e0b" style="background:#f59e0b;"></div>
                  <div class="wj-color-dot ${state.journalColor === '#ec4899' ? 'active' : ''}" data-color="#ec4899" style="background:#ec4899;"></div>
                  <div class="wj-color-dot ${state.journalColor === '#06b6d4' ? 'active' : ''}" data-color="#06b6d4" style="background:#06b6d4;"></div>
                </div>
              </div>

              <div class="wj-wizard-footer">
                <button class="wj-btn-back" data-goto="4">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" id="wj-wizard-finish-btn">
                  <span data-i18n="onboarding.btn_finish">${t('onboarding.btn_finish', 'Kurulumu Tamamla')}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    bindWizardEvents();
  }

  // ------------------------------------------------------------
  // 3 DİLLİ SENKRONİZE KARŞILAMA VE ANİMASYON DÖNGÜSÜ
  // Sıralama: İngilizce -> Türkçe -> Almanca
  // ------------------------------------------------------------
  var polyglotTimer = null;
  var typewriterTimer = null;
  var polyglotActive = false;

  var polyglotGreetings = [
    {
      lang: 'en',
      title: 'Welcome',
      subtitle: "Ready to elevate your trading discipline? We'll ask you a few quick questions to personalize your workspace."
    },
    {
      lang: 'tr',
      title: 'Hoş Geldiniz',
      subtitle: 'Trading disiplininizi zirveye taşımaya hazır mısınız? Alanınızı kişiselleştirmek için birkaç soru soracağız.'
    },
    {
      lang: 'de',
      title: 'Willkommen',
      subtitle: 'Bereit, Ihre Trading-Disziplin auf ein neues Level zu heben? Wir stellen Ihnen ein paar kurze Fragen, um Ihren Bereich zu personalisieren.'
    }
  ];

  function stopPolyglotCycle() {
    polyglotActive = false;
    if (polyglotTimer) {
      clearTimeout(polyglotTimer);
      polyglotTimer = null;
    }
    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
  }

  // Döngü kullanıcının mevcut diliyle başlar
  function getPolyglotStartIndex() {
    for (var i = 0; i < polyglotGreetings.length; i++) {
      if (polyglotGreetings[i].lang === state.selectedLang) return i;
    }
    return 0;
  }

  function getPolyglotStart() {
    return polyglotGreetings[getPolyglotStartIndex()];
  }

  function markPolyglotLang(lang) {
    document.querySelectorAll('#wj-polyglot-langs .wj-polyglot-lang').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-lang') === lang);
    });
  }

  function startAnimatedPolyglotGreeting() {
    stopPolyglotCycle();
    polyglotActive = true;
    showPolyglotSlide(getPolyglotStartIndex());
  }

  function showPolyglotSlide(index) {
    if (!polyglotActive) return;

    var titleEl = document.getElementById('wj-polyglot-text');
    var subtitleEl = document.getElementById('wj-polyglot-subtitle');
    if (!titleEl || !subtitleEl) return;

    var item = polyglotGreetings[index % polyglotGreetings.length];
    markPolyglotLang(item.lang);

    // Önceki metinlerin yumuşakça yukarı süzülerek kaybolması (Fade & Slide Out)
    titleEl.style.opacity = '0';
    titleEl.style.transform = 'translateY(-10px)';
    titleEl.style.filter = 'blur(4px)';

    subtitleEl.style.opacity = '0';
    subtitleEl.style.transform = 'translateY(-8px)';
    subtitleEl.style.filter = 'blur(4px)';

    setTimeout(function () {
      if (!polyglotActive) return;

      // İçeriği güncelle
      titleEl.textContent = item.title;
      subtitleEl.textContent = item.subtitle;

      // Aşağıdan gelmek üzere konumlandır
      titleEl.style.transition = 'none';
      subtitleEl.style.transition = 'none';
      titleEl.style.transform = 'translateY(12px)';
      subtitleEl.style.transform = 'translateY(10px)';

      // Yeniden yumuşakça parlat (Fade, Slide In & Unblur)
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!polyglotActive) return;
          titleEl.style.transition = 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease';
          subtitleEl.style.transition = 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease';

          titleEl.style.opacity = '1';
          titleEl.style.transform = 'translateY(0)';
          titleEl.style.filter = 'blur(0px)';

          subtitleEl.style.opacity = '1';
          subtitleEl.style.transform = 'translateY(0)';
          subtitleEl.style.filter = 'blur(0px)';
        });
      });

      // 3.4 saniye bekle, sonra sıradaki dile geç
      polyglotTimer = setTimeout(function () {
        if (!polyglotActive) return;
        showPolyglotSlide(index + 1);
      }, 3400);

    }, 320);
  }

  // ------------------------------------------------------------
  // SAAT DİLİMİ ADIMI
  // Seçim doğrudan WwTime ayarına yazılır (Ayarlar > Bölge ve Saat ile aynı kaynak);
  // 'auto' = cihazın saat dilimi.
  // ------------------------------------------------------------
  var tzClockTimer = null;

  function resolvedTz() {
    var WT = window.WwTime;
    if (!WT) return 'UTC';
    return state.selectedTz === 'auto' ? WT.deviceTz() : state.selectedTz;
  }

  function tzLocale() {
    return state.selectedLang === 'tr' ? 'tr-TR' : (state.selectedLang === 'de' ? 'de-DE' : 'en-US');
  }

  function tzCity(tz) {
    return String(tz).split('/').pop().replace(/_/g, ' ');
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // 'America/Argentina/Buenos_Aires' -> 'America / Argentina'
  function tzRegion(tz) {
    var parts = String(tz).split('/');
    parts.pop();
    return parts.join(' / ').replace(/_/g, ' ');
  }

  // Aramada aksan/Türkçe karakter farkını yok say ('istanbul' -> 'İstanbul')
  function tzFold(s) {
    return String(s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Saat dilimi -> ülke kodu eşlemesi (IANA zone.tab'dan üretildi; eski adlar dahil).
  // Yalnızca liste açılırken bir kez yüklenir; yüklenemezse liste ülkesiz çalışır.
  var tzCountriesPromise = null;
  function loadTzCountries() {
    if (!tzCountriesPromise) {
      tzCountriesPromise = fetch('/interface/shared/tz-countries.json?v=1')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; });
    }
    return tzCountriesPromise;
  }

  function regionNamer(lang) {
    try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch (e) { return null; }
  }

  // Popüler + tüm saat dilimleri: [{ label, items: [{ tz, city, country, region, offset, search }] }]
  function getTzGroups(countries) {
    var WT = window.WwTime;
    var local = regionNamer(state.selectedLang);
    var en = regionNamer('en');
    countries = countries || {};

    function item(tz, city) {
      var cc = countries[tz];
      var country = '';
      var countryEn = '';
      if (cc) {
        try { country = local ? local.of(cc) : ''; } catch (e) { }
        try { countryEn = en ? en.of(cc) : ''; } catch (e) { }
      }
      var region = tzRegion(tz);
      var offset = WT.offsetLabel(tz);
      return {
        tz: tz, city: city, country: country, region: region, offset: offset,
        search: tzFold([city, country, countryEn, cc || '', region, tz, offset].join(' '))
      };
    }

    var seen = {};
    var popular = (WT.POPULAR_TZ || []).map(function (z) {
      seen[z[0]] = true;
      return item(z[0], z[1]);
    });

    var all = [];
    try { if (typeof Intl.supportedValuesOf === 'function') all = Intl.supportedValuesOf('timeZone').slice(); } catch (e) { }
    if (state.selectedTz !== 'auto' && !seen[state.selectedTz] && all.indexOf(state.selectedTz) < 0) all.push(state.selectedTz);
    var rest = all.filter(function (z) { return !seen[z]; }).map(function (z) {
      return item(z, tzCity(z));
    });

    var groups = [{ label: t('onboarding.tz_popular', 'Popüler'), items: popular }];
    if (rest.length) groups.push({ label: t('onboarding.tz_all', 'Tüm saat dilimleri'), items: rest });
    return groups;
  }

  function tzDisplayName(tz) {
    var WT = window.WwTime;
    var hit = (WT && WT.POPULAR_TZ || []).filter(function (z) { return z[0] === tz; })[0];
    return hit ? hit[1] : tzCity(tz);
  }

  function updateTzTrigger() {
    var trigger = document.getElementById('wj-tz-trigger');
    if (!trigger || !window.WwTime) return;
    var explicit = state.selectedTz !== 'auto';
    trigger.classList.toggle('has-value', explicit);
    setText('wj-tz-trigger-text', explicit ? tzDisplayName(state.selectedTz) : t('onboarding.tz_pick', 'Saat dilimi seç…'));
    setText('wj-tz-trigger-offset', explicit ? window.WwTime.offsetLabel(state.selectedTz) : '');
  }

  // ------------------------------------------------------------
  // Özel açılır liste: kart overflow:hidden + transform taşıdığı için panel body'ye
  // eklenir ve tetikleyicinin hemen ALTINA konumlanır (her zaman aşağı açılır).
  // ------------------------------------------------------------
  var tzPanel = null;
  var tzPanelCleanup = null;

  var TZ_CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  var TZ_SEARCH_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

  function positionTzPanel() {
    var trigger = document.getElementById('wj-tz-trigger');
    if (!tzPanel || !trigger) return;
    var r = trigger.getBoundingClientRect();
    var gap = 6;
    var room = window.innerHeight - r.bottom - gap - 12;
    tzPanel.style.left = r.left + 'px';
    tzPanel.style.top = (r.bottom + gap) + 'px';
    tzPanel.style.width = r.width + 'px';
    tzPanel.style.maxHeight = Math.max(220, Math.min(360, room)) + 'px';
  }

  function tzVisibleOptions() {
    return tzPanel ? Array.prototype.slice.call(tzPanel.querySelectorAll('.wj-tz-option:not([hidden])')) : [];
  }

  function highlightTzOption(el) {
    if (!tzPanel) return;
    tzPanel.querySelectorAll('.wj-tz-option.highlighted').forEach(function (o) { o.classList.remove('highlighted'); });
    if (el) {
      el.classList.add('highlighted');
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  function filterTzOptions(query) {
    var q = tzFold(query.trim());
    tzPanel.querySelectorAll('.wj-tz-group').forEach(function (group) {
      var any = false;
      group.querySelectorAll('.wj-tz-option').forEach(function (o) {
        var match = !q || o.getAttribute('data-search').indexOf(q) >= 0;
        o.hidden = !match;
        if (match) any = true;
      });
      group.hidden = !any;
    });
    var visible = tzVisibleOptions();
    tzPanel.querySelector('.wj-tz-empty').hidden = visible.length > 0;
    highlightTzOption(q ? visible[0] : null);
  }

  var tzPanelOpening = false;

  function openTzPanel() {
    if (tzPanel || tzPanelOpening) return;
    tzPanelOpening = true;
    loadTzCountries().then(function (countries) {
      tzPanelOpening = false;
      // Bu arada adım değiştiyse ya da sihirbaz kapandıysa açma
      if (state.currentStep !== 3) return;
      renderTzPanel(countries);
    });
  }

  function renderTzPanel(countries) {
    var WT = window.WwTime;
    var trigger = document.getElementById('wj-tz-trigger');
    if (tzPanel || !WT || !trigger) return;

    var html = '<div class="wj-tz-search">' + TZ_SEARCH_SVG +
      '<input type="text" class="wj-tz-search-input" autocomplete="off" spellcheck="false" placeholder="' +
      escHtml(t('onboarding.tz_search', 'Ülke, şehir ya da UTC+3 ara…')) + '" /></div>' +
      '<div class="wj-tz-list" role="listbox">';
    getTzGroups(countries).forEach(function (g) {
      html += '<div class="wj-tz-group"><div class="wj-tz-group-label">' + escHtml(g.label) + '</div>';
      g.items.forEach(function (it) {
        var selected = it.tz === state.selectedTz;
        var sub = it.country || it.region;
        html += '<div class="wj-tz-option' + (selected ? ' selected' : '') + '" role="option" aria-selected="' + selected + '"' +
          ' data-tz="' + escHtml(it.tz) + '" data-search="' + escHtml(it.search) + '">' +
          '<span class="wj-tz-option-main"><span class="wj-tz-option-city">' + escHtml(it.city) + '</span>' +
          (sub ? '<span class="wj-tz-option-region">' + escHtml(sub) + '</span>' : '') + '</span>' +
          '<span class="wj-tz-offset-pill">' + it.offset + '</span>' +
          '<span class="wj-tz-option-check">' + TZ_CHECK_SVG + '</span></div>';
      });
      html += '</div>';
    });
    html += '</div><div class="wj-tz-empty" hidden>' + escHtml(t('onboarding.tz_no_results', 'Sonuç bulunamadı')) + '</div>';

    tzPanel = document.createElement('div');
    tzPanel.className = 'wj-tz-panel';
    tzPanel.innerHTML = html;
    document.body.appendChild(tzPanel);
    positionTzPanel();

    trigger.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');

    var input = tzPanel.querySelector('.wj-tz-search-input');
    var list = tzPanel.querySelector('.wj-tz-list');

    input.addEventListener('input', function () { filterTzOptions(this.value); });
    input.addEventListener('keydown', function (e) {
      var visible = tzVisibleOptions();
      var cur = tzPanel.querySelector('.wj-tz-option.highlighted');
      var idx = visible.indexOf(cur);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightTzOption(visible[Math.min(visible.length - 1, idx + 1)]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightTzOption(visible[Math.max(0, idx - 1)]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cur) {
          selectTz(cur.getAttribute('data-tz'));
          closeTzPanel(true);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeTzPanel(true);
      } else if (e.key === 'Tab') {
        closeTzPanel(false);
      }
    });

    list.addEventListener('mousemove', function (e) {
      var o = e.target.closest('.wj-tz-option');
      if (o && !o.classList.contains('highlighted')) {
        tzPanel.querySelectorAll('.wj-tz-option.highlighted').forEach(function (h) { h.classList.remove('highlighted'); });
        o.classList.add('highlighted');
      }
    });
    list.addEventListener('click', function (e) {
      var o = e.target.closest('.wj-tz-option');
      if (!o) return;
      selectTz(o.getAttribute('data-tz'));
      closeTzPanel(true);
    });

    function onOutside(e) {
      if (tzPanel && !tzPanel.contains(e.target) && !trigger.contains(e.target)) closeTzPanel(false);
    }
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', positionTzPanel);
    tzPanelCleanup = function () {
      document.removeEventListener('mousedown', onOutside, true);
      window.removeEventListener('resize', positionTzPanel);
    };

    // Seçili satır görünür olsun, sonra açılış animasyonu
    var sel = tzPanel.querySelector('.wj-tz-option.selected');
    if (sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.offsetHeight / 2;
    requestAnimationFrame(function () {
      if (tzPanel) tzPanel.classList.add('open');
    });
    input.focus();
  }

  function closeTzPanel(refocus) {
    if (!tzPanel) return;
    if (tzPanelCleanup) tzPanelCleanup();
    tzPanelCleanup = null;
    tzPanel.remove();
    tzPanel = null;
    var trigger = document.getElementById('wj-tz-trigger');
    if (trigger) {
      trigger.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      if (refocus) trigger.focus();
    }
  }

  function renderTzClock() {
    var WT = window.WwTime;
    var tz = resolvedTz();
    var now = new Date();
    var loc = tzLocale();
    try {
      setText('wj-tz-clock-time', new Intl.DateTimeFormat(loc, {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: WT ? WT.getSettings().hour12 : false
      }).format(now));
      setText('wj-tz-clock-date', new Intl.DateTimeFormat(loc, {
        timeZone: tz, weekday: 'long', day: 'numeric', month: 'long'
      }).format(now));
      if (WT) {
        setText('wj-tz-clock-zone', tzCity(tz) + ' · ' + WT.offsetLabel(tz));
        setText('wj-tz-auto-sub', tzCity(WT.deviceTz()) + ' · ' + WT.offsetLabel(WT.deviceTz()));
      }
    } catch (e) {
      wwLog.warn('Saat dilimi önizlemesi hesaplanamadı:', e);
    }
  }

  function selectTz(value) {
    state.selectedTz = value || 'auto';
    if (window.WwTime) window.WwTime.setSettings({ tz: state.selectedTz });

    var autoEl = document.getElementById('wj-tz-auto');
    if (autoEl) autoEl.classList.toggle('active', state.selectedTz === 'auto');
    updateTzTrigger();
    renderTzClock();
  }

  function startTzClock() {
    stopTzClock();
    loadTzCountries();
    updateTzTrigger();
    renderTzClock();
    tzClockTimer = setInterval(renderTzClock, 1000);
  }

  function stopTzClock() {
    if (tzClockTimer) {
      clearInterval(tzClockTimer);
      tzClockTimer = null;
    }
  }

  function goToStep(stepIndex) {
    state.currentStep = stepIndex;
    var steps = document.querySelectorAll('.wj-wizard-step');
    steps.forEach(function (step, idx) {
      if (idx === stepIndex) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });

    var progressFill = document.getElementById('wj-progress-fill');
    if (progressFill) {
      var pct = stepIndex === 0 ? 0 : Math.round((stepIndex / state.totalSteps) * 100);
      progressFill.style.width = pct + '%';
    }

    // Dağ sahnesi yalnızca karşılama adımında görünür
    var card = document.querySelector('#wj-onboarding-modal .wj-onboarding-card');
    if (card) card.classList.toggle('is-welcome', stepIndex === 0);

    if (stepIndex === 0) {
      startAnimatedPolyglotGreeting();
    } else {
      stopPolyglotCycle();
    }

    if (stepIndex === 3) {
      startTzClock();
    } else {
      stopTzClock();
      closeTzPanel(false);
    }

    if (stepIndex === 5 && !state.hasCustomJournalName) {
      state.journalName = defaultJournalNames[state.selectedLang] || defaultJournalNames.tr;
      var nameInput = document.getElementById('wj-journal-name-input');
      if (nameInput) {
        nameInput.value = state.journalName;
        nameInput.placeholder = defaultJournalPlaceholders[state.selectedLang] || defaultJournalPlaceholders.tr;
      }
    }

    refreshLucideIcons();
  }

  function bindWizardEvents() {
    var overlay = document.getElementById('wj-onboarding-modal');
    if (!overlay) return;

    // Başlayalım butonu
    var heroStartBtn = document.getElementById('wj-hero-start-btn');
    if (heroStartBtn) {
      heroStartBtn.addEventListener('click', function () {
        goToStep(1);
      });
    }

    // Şimdilik Geç butonu
    var skipBtn = document.getElementById('wj-wizard-skip-btn');
    if (skipBtn) {
      skipBtn.addEventListener('click', async function () {
        closeWizardModal();
        await markWizardDone();
        // Sıradaki aşama: İnteraktif Rehber Turu
        setTimeout(function () {
          startSpotlightTour();
        }, 300);
      });
    }

    // Geri / İleri butonları
    overlay.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetStep = parseInt(this.getAttribute('data-goto'), 10);
        goToStep(targetStep);
      });
    });

    // Dil seçimi
    overlay.querySelectorAll('.wj-option-card[data-lang]').forEach(function (card) {
      card.addEventListener('click', async function () {
        overlay.querySelectorAll('.wj-option-card[data-lang]').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        var lang = this.getAttribute('data-lang');
        state.selectedLang = lang;

        // Seçilen dile göre varsayılan defter adını güncelle (kullanıcı elle özel isim yazmadıysa)
        if (!state.hasCustomJournalName) {
          state.journalName = defaultJournalNames[lang] || defaultJournalNames.tr;
          var nameInput = document.getElementById('wj-journal-name-input');
          if (nameInput) {
            nameInput.value = state.journalName;
            nameInput.placeholder = defaultJournalPlaceholders[lang] || defaultJournalPlaceholders.tr;
          }
        }

        try {
          localStorage.setItem('ww_language', lang);
          if (typeof window.i18n !== 'undefined' && typeof window.i18n.setLanguage === 'function') {
            await window.i18n.setLanguage(lang);
          }
        } catch (e) {
          wwLog.warn('i18n switch error:', e);
        }
      });
    });

    // Para birimi seçimi
    overlay.querySelectorAll('.wj-option-card[data-curr]').forEach(function (card) {
      card.addEventListener('click', function () {
        overlay.querySelectorAll('.wj-option-card[data-curr]').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        var curr = this.getAttribute('data-curr');
        state.selectedCurrency = curr;
        try {
          if (typeof window.setCurrencySymbol === 'function') {
            window.setCurrencySymbol(curr);
          } else {
            localStorage.setItem('ww_currency', curr);
          }
        } catch (e) { }
      });
    });

    // Saat dilimi seçimi
    var tzAuto = document.getElementById('wj-tz-auto');
    if (tzAuto) {
      tzAuto.addEventListener('click', function () { selectTz('auto'); });
      tzAuto.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTz('auto');
        }
      });
    }
    var tzTrigger = document.getElementById('wj-tz-trigger');
    if (tzTrigger) {
      tzTrigger.addEventListener('click', function () {
        if (tzPanel) closeTzPanel(false);
        else openTzPanel();
      });
      tzTrigger.addEventListener('keydown', function (e) {
        if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !tzPanel) {
          e.preventDefault();
          openTzPanel();
        }
      });
    }

    // Tema seçimi
    overlay.querySelectorAll('.wj-theme-card[data-theme]').forEach(function (card) {
      card.addEventListener('click', function () {
        overlay.querySelectorAll('.wj-theme-card[data-theme]').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        var theme = this.getAttribute('data-theme');
        state.selectedTheme = theme;
        var isLight = theme === 'light';
        document.body.classList.toggle('light-theme', isLight);
        try {
          localStorage.setItem('ww_theme', theme);
          window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme, isLight: isLight } }));
        } catch (e) { }
      });
    });

    // İkon seçimi
    overlay.querySelectorAll('#wj-icon-picker .wj-icon-choice').forEach(function (choice) {
      choice.addEventListener('click', function () {
        overlay.querySelectorAll('#wj-icon-picker .wj-icon-choice').forEach(function (c) { c.classList.remove('active'); });
        this.classList.add('active');
        state.journalIcon = this.getAttribute('data-icon');
      });
    });

    // Renk seçimi
    overlay.querySelectorAll('#wj-color-picker .wj-color-dot').forEach(function (dot) {
      dot.addEventListener('click', function () {
        overlay.querySelectorAll('#wj-color-picker .wj-color-dot').forEach(function (d) { d.classList.remove('active'); });
        this.classList.add('active');
        state.journalColor = this.getAttribute('data-color');
      });
    });

    // Defter adı özel giriş takibi
    var nameInput = document.getElementById('wj-journal-name-input');
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        state.hasCustomJournalName = true;
        state.journalName = this.value;
      });
    }

    // Kurulumu Tamamla Butonu
    var finishBtn = document.getElementById('wj-wizard-finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', async function () {
        finishBtn.disabled = true;
        finishBtn.innerHTML = '<span>Kaydediliyor...</span>';

        var nameInput = document.getElementById('wj-journal-name-input');
        if (nameInput && nameInput.value.trim()) {
          state.journalName = nameInput.value.trim();
        }

        // Defteri kaydet ve sihirbazı tamamlandı yap
        await saveFirstJournal();
        await markWizardDone();

        closeWizardModal();

        // Sıradaki aşama: İnteraktif Rehber Turu
        setTimeout(function () {
          startSpotlightTour();
        }, 500);
      });
    }
  }

  function openWizardModal() {
    renderWizardModal();
    refreshLucideIcons();
    var overlay = document.getElementById('wj-onboarding-modal');
    if (overlay) {
      requestAnimationFrame(function () {
        overlay.classList.add('active');
        goToStep(0);
      });
    }
  }

  function closeWizardModal() {
    var overlay = document.getElementById('wj-onboarding-modal');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 400);
    }
    stopPolyglotCycle();
    stopTzClock();
    closeTzPanel(false);
  }

  // Sihirbaz tamamlandığında hem localStorage'a hem DB'ye yaz
  async function markWizardDone() {
    if (!state.user) return;

    var uid = state.user.id;
    try {
      localStorage.setItem('wj_wizard_done_' + uid, 'true');
      localStorage.setItem('ww_onboarding_completed', 'true');
    } catch (e) { }

    if (!window.sb) return;

    try {
      await window.sb
        .from('user_profiles')
        .update({
          onboarding_completed: true,
          preferred_currency: state.selectedCurrency
        })
        .eq('id', uid);
    } catch (e) {
      wwLog.warn('user_profiles update note:', e);
    }

    try {
      await window.sb.rpc('complete_user_onboarding', {
        p_currency: state.selectedCurrency,
        p_theme: state.selectedTheme,
        p_tour_completed: false
      });
    } catch (eRpc) { }
  }

  async function saveFirstJournal() {
    if (!state.user || !window.sb) return;
    try {
      var journalDesc = defaultJournalDescriptions[state.selectedLang] || defaultJournalDescriptions.tr;
      var { data: existingJournals } = await window.sb
        .from('journals')
        .select('*')
        .eq('user_id', state.user.id)
        .eq('is_active', true);

      if (existingJournals && existingJournals.length > 0) {
        var targetId = existingJournals[0].id;
        await window.sb
          .from('journals')
          .update({
            name: state.journalName,
            color: state.journalColor,
            icon: state.journalIcon
          })
          .eq('id', targetId);

        if (window.journal && typeof window.journal.setActiveJournalId === 'function') {
          window.journal.setActiveJournalId(targetId);
        }
      } else {
        if (window.journal && typeof window.journal.createJournal === 'function') {
          await window.journal.createJournal({
            name: state.journalName,
            description: journalDesc,
            color: state.journalColor,
            icon: state.journalIcon
          });
        } else {
          await window.sb.from('journals').insert([{
            user_id: state.user.id,
            name: state.journalName,
            description: journalDesc,
            color: state.journalColor,
            icon: state.journalIcon,
            is_default: true,
            is_active: true
          }]);
        }
      }

      if (typeof window.updateNavbarJournal === 'function') {
        window.updateNavbarJournal(0);
      }
    } catch (e) {
      wwLog.warn('Could not save first journal:', e);
    }
  }

  // ------------------------------------------------------------
  // 2. FAZ 2: İNTERAKTİF REHBER TURU (GUIDED SPOTLIGHT TOUR)
  // ------------------------------------------------------------
  // Her adımın hedefleri ÖNCELİK sırasıyla denenir (virgüllü tek seçici DOM sırasına
  // göre ilk eşleşeni döndürdüğü için yanlış öğeyi gösterebiliyordu).
  function getTourSteps() {
    return [
      {
        targets: ['#navbar-container .nav-links', '.nav-links'],
        title: t('onboarding.tour_step1_title', 'Ana Menü & Sayfalar'),
        desc: t('onboarding.tour_step1_desc', 'Dashboard, İşlemler (Trades), Stratejiler ve Takvim sayfalarınıza buradan kolayca ulaşabilirsiniz.'),
        placement: 'bottom'
      },
      {
        targets: ['#nav-journal-switcher'],
        title: t('onboarding.tour_step2_title', 'İşlem Günlüğü Seçici'),
        desc: t('onboarding.tour_step2_desc', 'Farklı stratejileriniz veya portföyleriniz için ayrı defterler oluşturabilir, buradan tek tıkla aralarında geçiş yapabilirsiniz.'),
        placement: 'bottom'
      },
      {
        targets: ['#dashboard-toolbar', '#date-filter-group'],
        title: t('onboarding.tour_filter_title', 'Tarih Aralığı & Dışa Aktarma'),
        desc: t('onboarding.tour_filter_desc', 'Tüm istatistik ve grafikleri hafta, ay, yıl ya da özel bir aralığa göre süz; sonuçları CSV veya PDF olarak dışa aktar.'),
        placement: 'bottom'
      },
      {
        targets: ['#stats-grid', '#stats-skeleton'],
        title: t('onboarding.tour_step3_title', 'Performans & İstatistikler'),
        desc: t('onboarding.tour_step3_desc', 'Toplam Kâr/Zarar (P&L), Win Rate oranınız ve işlem sonuçlarınız gerçek zamanlı olarak burada listelenir.'),
        placement: 'bottom'
      },
      {
        targets: ['#charts-top-grid .chart-card', '#chart-cumulative'],
        title: t('onboarding.tour_chart_title', 'Kümülatif K/Z'),
        desc: t('onboarding.tour_chart_desc', 'Hesabının zaman içindeki büyümesini işlem işlem izle; düşüşleri ve toparlanmaları burada görürsün.'),
        placement: 'right'
      },
      {
        targets: ['#user-avatar'],
        title: t('onboarding.tour_settings_title', 'Profil & Ayarlar'),
        desc: t('onboarding.tour_settings_desc', 'Saat dilimi, para birimi, tema ve aboneliğini buradan yönetebilirsin.'),
        placement: 'bottom',
        radius: 999
      },
      {
        targets: ['#quick-add-fab'],
        title: t('onboarding.tour_step4_title', 'Hızlı İşlem Ekleme (+)'),
        desc: t('onboarding.tour_step4_desc', 'Bu butona tıklayarak manuel yeni trade ekleyebilir ya da borsa CSV dosyanızı sürükleyip anında içeri aktarabilirsiniz.'),
        placement: 'top',
        radius: 999
      }
    ];
  }

  function isTourTargetVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = window.getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  }

  function resolveTourTarget(step) {
    for (var i = 0; i < step.targets.length; i++) {
      var el = document.querySelector(step.targets[i]);
      if (isTourTargetVisible(el)) return el;
    }
    return null;
  }

  var tourSteps = [];
  var tourTarget = null;
  var tourRaf = null;
  var tourMoveTimer = null;

  function startSpotlightTour() {
    // Bu sayfada bulunan adımlar (sayaç ve ilerleme gerçek adım sayısını göstersin)
    tourSteps = getTourSteps().filter(function (s) { return !!resolveTourTarget(s); });
    if (!tourSteps.length) {
      endTour();
      return;
    }
    state.tourIndex = 0;
    state.isTourActive = true;
    renderTourDom();
    showTourStep(0);
  }

  function renderTourDom() {
    ['wj-tour-backdrop', 'wj-tour-highlight', 'wj-tour-tooltip'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });

    var tourHtml = `
      <div class="wj-tour-backdrop" id="wj-tour-backdrop"></div>
      <div class="wj-tour-target-highlight" id="wj-tour-highlight"></div>
      <div class="wj-tour-tooltip" id="wj-tour-tooltip" role="dialog" aria-live="polite">
        <span class="wj-tour-arrow" id="wj-tour-arrow"></span>
        <div class="wj-tour-head">
          <span class="wj-tour-step-badge" id="wj-tour-badge"></span>
          <button class="wj-tour-close" id="wj-tour-close-btn" aria-label="${t('onboarding.tour_btn_skip', 'Geç')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <h4 class="wj-tour-title" id="wj-tour-title"></h4>
        <p class="wj-tour-desc" id="wj-tour-desc"></p>
        <div class="wj-tour-progress" id="wj-tour-progress"></div>
        <div class="wj-tour-footer">
          <button class="wj-tour-btn-skip" id="wj-tour-skip-btn">${t('onboarding.tour_btn_skip', 'Geç')}</button>
          <div class="wj-tour-actions">
            <button class="wj-tour-btn-back" id="wj-tour-back-btn">${t('onboarding.tour_btn_back', '← Geri')}</button>
            <button class="wj-tour-btn-next" id="wj-tour-next-btn">${t('onboarding.tour_btn_next', 'Sonraki →')}</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', tourHtml);

    document.getElementById('wj-tour-skip-btn').addEventListener('click', endTour);
    document.getElementById('wj-tour-close-btn').addEventListener('click', endTour);
    document.getElementById('wj-tour-back-btn').addEventListener('click', tourPrev);
    document.getElementById('wj-tour-next-btn').addEventListener('click', tourNext);

    document.addEventListener('keydown', onTourKey, true);
    window.addEventListener('resize', scheduleTourLayout);
    window.addEventListener('scroll', scheduleTourLayout, true);

    requestAnimationFrame(function () {
      var backdrop = document.getElementById('wj-tour-backdrop');
      if (backdrop) backdrop.classList.add('active');
    });
  }

  function tourNext() {
    if (state.tourIndex < tourSteps.length - 1) showTourStep(state.tourIndex + 1);
    else endTour();
  }

  function tourPrev() {
    if (state.tourIndex > 0) showTourStep(state.tourIndex - 1);
  }

  function onTourKey(e) {
    if (!state.isTourActive) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      endTour();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      tourNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      tourPrev();
    }
  }

  function scheduleTourLayout() {
    if (tourRaf) return;
    tourRaf = requestAnimationFrame(function () {
      tourRaf = null;
      layoutTour();
    });
  }

  function showTourStep(index) {
    var step = tourSteps[index];
    if (!step) return;
    state.tourIndex = index;

    var target = resolveTourTarget(step);
    if (!target) {
      // Hedef bu arada kaybolduysa sonraki adıma geç
      if (index < tourSteps.length - 1) showTourStep(index + 1);
      else endTour();
      return;
    }
    tourTarget = target;

    var tooltip = document.getElementById('wj-tour-tooltip');
    if (!tooltip) return;

    // İçerik
    document.getElementById('wj-tour-badge').textContent = t('onboarding.step_indicator', 'Adım {step} / {total}')
      .replace('{step}', index + 1)
      .replace('{total}', tourSteps.length);
    document.getElementById('wj-tour-title').textContent = step.title;
    document.getElementById('wj-tour-desc').textContent = step.desc;

    var isLast = index === tourSteps.length - 1;
    document.getElementById('wj-tour-next-btn').textContent = isLast
      ? t('onboarding.tour_btn_finish', 'Turu Bitir')
      : t('onboarding.tour_btn_next', 'Sonraki →');
    var backBtn = document.getElementById('wj-tour-back-btn');
    backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
    document.getElementById('wj-tour-skip-btn').style.visibility = isLast ? 'hidden' : 'visible';

    var progress = document.getElementById('wj-tour-progress');
    progress.innerHTML = '';
    for (var d = 0; d < tourSteps.length; d++) {
      var seg = document.createElement('span');
      seg.className = 'wj-tour-seg' + (d < index ? ' done' : (d === index ? ' active' : ''));
      progress.appendChild(seg);
    }

    // Hedef ekranda değilse önce kaydır, sonra konumlandır
    var r = target.getBoundingClientRect();
    var offscreen = r.top < 70 || r.bottom > window.innerHeight - 20;
    var fixedTarget = window.getComputedStyle(target).position === 'fixed';
    tooltip.classList.remove('visible');
    if (tourMoveTimer) clearTimeout(tourMoveTimer);
    if (offscreen && !fixedTarget) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      tourMoveTimer = setTimeout(revealTourStep, 420);
    } else {
      tourMoveTimer = setTimeout(revealTourStep, 60);
    }
  }

  function revealTourStep() {
    tourMoveTimer = null;
    layoutTour();
    var tooltip = document.getElementById('wj-tour-tooltip');
    if (tooltip) tooltip.classList.add('visible');
    var next = document.getElementById('wj-tour-next-btn');
    if (next) next.focus({ preventScroll: true });
  }

  // Vurgu kutusu ve kartı hedefe göre (viewport koordinatlarıyla) yerleştir
  function layoutTour() {
    var step = tourSteps[state.tourIndex];
    var highlight = document.getElementById('wj-tour-highlight');
    var tooltip = document.getElementById('wj-tour-tooltip');
    var arrow = document.getElementById('wj-tour-arrow');
    if (!step || !tourTarget || !highlight || !tooltip) return;

    var r = tourTarget.getBoundingClientRect();
    var pad = 8;
    var hl = { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
    highlight.style.top = hl.top + 'px';
    highlight.style.left = hl.left + 'px';
    highlight.style.width = hl.width + 'px';
    highlight.style.height = hl.height + 'px';
    highlight.style.borderRadius = (step.radius || 14) + 'px';
    highlight.classList.add('active');

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var margin = 16;
    var gap = 14;
    var tw = tooltip.offsetWidth;
    var th = tooltip.offsetHeight;

    var fits = {
      bottom: hl.top + hl.height + gap + th <= vh - margin,
      top: hl.top - gap - th >= margin,
      right: hl.left + hl.width + gap + tw <= vw - margin,
      left: hl.left - gap - tw >= margin
    };
    var order = [step.placement || 'bottom', 'bottom', 'top', 'right', 'left'];
    var placement = null;
    for (var i = 0; i < order.length; i++) {
      if (fits[order[i]]) { placement = order[i]; break; }
    }

    var top;
    var left;
    var clamp = function (v, min, max) { return Math.min(Math.max(v, min), Math.max(min, max)); };
    if (placement === 'bottom' || placement === 'top') {
      top = placement === 'bottom' ? hl.top + hl.height + gap : hl.top - gap - th;
      left = clamp(hl.left + hl.width / 2 - tw / 2, margin, vw - tw - margin);
    } else if (placement === 'right' || placement === 'left') {
      left = placement === 'right' ? hl.left + hl.width + gap : hl.left - gap - tw;
      top = clamp(hl.top + hl.height / 2 - th / 2, margin, vh - th - margin);
    } else {
      // Hiçbir tarafa sığmıyorsa (çok büyük hedef) ekranın altına ortala
      placement = 'none';
      top = vh - th - margin;
      left = (vw - tw) / 2;
    }

    tooltip.style.top = Math.round(top) + 'px';
    tooltip.style.left = Math.round(left) + 'px';
    tooltip.setAttribute('data-placement', placement);

    // Ok, hedefin ortasını göstersin (kart kenarlarına taşmadan)
    if (arrow) {
      if (placement === 'bottom' || placement === 'top') {
        arrow.style.left = clamp(hl.left + hl.width / 2 - left - 6, 18, tw - 30) + 'px';
        arrow.style.top = '';
      } else if (placement === 'right' || placement === 'left') {
        arrow.style.top = clamp(hl.top + hl.height / 2 - top - 6, 18, th - 30) + 'px';
        arrow.style.left = '';
      }
    }
  }

  async function endTour() {
    state.isTourActive = false;
    document.removeEventListener('keydown', onTourKey, true);
    window.removeEventListener('resize', scheduleTourLayout);
    window.removeEventListener('scroll', scheduleTourLayout, true);
    if (tourMoveTimer) clearTimeout(tourMoveTimer);
    tourMoveTimer = null;
    tourTarget = null;

    var backdrop = document.getElementById('wj-tour-backdrop');
    var highlight = document.getElementById('wj-tour-highlight');
    var tooltip = document.getElementById('wj-tour-tooltip');

    if (backdrop) backdrop.classList.remove('active');
    if (highlight) highlight.classList.remove('active');
    if (tooltip) tooltip.classList.remove('visible');

    setTimeout(function () {
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (highlight && highlight.parentNode) highlight.parentNode.removeChild(highlight);
      if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
    }, 300);

    // Tur tamamlandı kaydı
    if (state.user) {
      var uid = state.user.id;
      try {
        localStorage.setItem('wj_tour_done_' + uid, 'true');
      } catch (e) { }

      if (window.sb) {
        try {
          await window.sb
            .from('user_profiles')
            .update({ onboarding_tour_completed: true })
            .eq('id', uid);
        } catch (e) { }
      }
    }

    // ⭐ Sıradaki aşama: SAĞ ALTTAN GÖREV KARTINI AÇ!
    setTimeout(function () {
      renderTasksWidget();
    }, 350);
  }

  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 3. FAZ 3: SAĞ ALTTTAKİ BAŞLANGIÇ GÖREVLERİ KARTI (TASKS WIDGET)
  // ------------------------------------------------------------
  async function loadUserCounts() {
    if (!state.user || !window.sb) return;
    var uid = state.user.id;

    // ⚡ 1. Eğer kullanıcı görevleri tamamladıysa veya kalıcı gizlendiyse sorgu atma
    try {
      var isDismissed = localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true';
      var isAllDone = localStorage.getItem('wj_tasks_all_done_' + uid) === 'true';
      var isMetaDone = !!(state.user.user_metadata && state.user.user_metadata.tasks_completed);
      if (isDismissed || isAllDone || isMetaDone) {
        state.tradesCount = Math.max(state.tradesCount, 1);
        state.strategiesCount = Math.max(state.strategiesCount, 1);
        return;
      }
    } catch (e) {}

    // ⚡ 2. SessionStorage önbellek kontrolü (3 dakika geçerli)
    try {
      var cachedStr = sessionStorage.getItem('ww_onboard_counts_' + uid);
      if (cachedStr) {
        var cached = JSON.parse(cachedStr);
        if (cached && (Date.now() - cached.time < 3 * 60 * 1000)) {
          state.tradesCount = cached.trades || 0;
          state.strategiesCount = cached.strategies || 0;
          return;
        }
      }
    } catch (e) {}

    try {
      var [tradesRes, stratRes] = await Promise.all([
        // "İlk işlemini ekle" görevi yalnızca canlı işlemle tamamlanır (backtest aynası saymaz)
        window.WwTrades.applyScope(window.sb.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', uid), 'live'),
        window.sb.from('strategies').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      ]);
      state.tradesCount = (tradesRes && tradesRes.count) || 0;
      state.strategiesCount = (stratRes && stratRes.count) || 0;

      // Sonucu önbelleğe al
      try {
        sessionStorage.setItem('ww_onboard_counts_' + uid, JSON.stringify({
          time: Date.now(),
          trades: state.tradesCount,
          strategies: state.strategiesCount
        }));
        if (state.tradesCount > 0 && state.strategiesCount > 0) {
          localStorage.setItem('wj_tasks_all_done_' + uid, 'true');
          localStorage.setItem('wj_tasks_dismissed_' + uid, 'true');
          localStorage.setItem('ww_tasks_dismissed', 'true');
          if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
            window.sb.auth.updateUser({ data: { tasks_completed: true } }).catch(function () {});
          }
        }
      } catch (e) {}
    } catch (e) {
      wwLog.warn('Could not load user counts:', e);
    }
  }

  function renderTasksWidget() {
    if (!state.user) return;

    var uid = state.user.id;

    // ⚡ 1. Kalıcı kontrol: Eğer görevler daha önceden tamamlanmış veya kapatılmışsa ASLA GÖSTERME
    var isAlreadyDismissed = localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true';
    var isAlreadyAllDone = localStorage.getItem('wj_tasks_all_done_' + uid) === 'true';
    var isMetaDone = !!(state.user.user_metadata && state.user.user_metadata.tasks_completed);

    if (isAlreadyDismissed || isAlreadyAllDone || isMetaDone) {
      var exExisting = document.getElementById('wj-tasks-floating-container');
      if (exExisting) exExisting.remove();
      return;
    }

    var isAccountDone = true;
    var isJournalDone = true;
    var isTradeDone = state.tradesCount > 0;
    var isStrategyDone = state.strategiesCount > 0;

    var completedTasks = [isAccountDone, isJournalDone, isTradeDone, isStrategyDone].filter(Boolean).length;
    var pct = Math.round((completedTasks / 4) * 100);
    var isAllCompleted = completedTasks === 4;

    // ⭐ KURAL: Görevler tamamlandıktan sonra BİR DAHA KULLANICININ KARŞISINA ÇIKMASIN!
    if (isAllCompleted) {
      try {
        localStorage.setItem('wj_tasks_dismissed_' + uid, 'true');
        localStorage.setItem('wj_tasks_all_done_' + uid, 'true');
        localStorage.setItem('ww_tasks_dismissed', 'true');
      } catch (e) {}

      if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
        window.sb.auth.updateUser({ data: { tasks_completed: true } }).catch(function () {});
      }

      var existingWrapper = document.getElementById('wj-tasks-floating-container');
      if (existingWrapper) {
        // Eğer kullanıcı sayfadayken görev bittiyse yumuşakça kaybolsun ve tebrik bildirimi çıksın
        existingWrapper.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        existingWrapper.style.opacity = '0';
        existingWrapper.style.transform = 'translateY(16px)';
        setTimeout(function () {
          if (existingWrapper && existingWrapper.parentNode) {
            existingWrapper.parentNode.removeChild(existingWrapper);
          }
        }, 400);

        // Kullanıcıya tek seferlik tebrik bildirimi
        if (typeof window.showToast === 'function') {
          var toastMsg = t('onboarding.tasks_all_completed_toast', 'Tebrikler! Tüm başlangıç görevlerini tamamladınız. 🎉');
          window.showToast(toastMsg, 'success');
        }
      }
      return;
    }

    var floatingWrapper = document.getElementById('wj-tasks-floating-container');
    if (!floatingWrapper) {
      floatingWrapper = document.createElement('div');
      floatingWrapper.id = 'wj-tasks-floating-container';
      floatingWrapper.className = 'wj-tasks-floating-container';
      document.body.appendChild(floatingWrapper);
    }

    var isMinimized = localStorage.getItem('wj_tasks_minimized_' + uid) === 'true';
    if (isMinimized) {
      floatingWrapper.classList.add('minimized');
    } else {
      floatingWrapper.classList.remove('minimized');
    }
    floatingWrapper.style.display = 'block';

    var widgetHtml = `
      <!-- Minimized Pill Button -->
      <button class="wj-tasks-min-pill" id="wj-tasks-expand-btn" title="${t('onboarding.drag_pill_tooltip', 'Sürükleyin veya açmak için tıklayın')}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>${t('onboarding.tasks_pill', 'Görevler ({count}/4)').replace('{count}', completedTasks)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
      </button>

      <!-- Expanded Floating Card -->
      <div class="wj-tasks-widget" id="wj-tasks-widget">
        <div class="wj-tasks-header" id="wj-tasks-header" title="${t('onboarding.drag_header_tooltip', 'Sürüklemek için basılı tutun')}">
          <div class="wj-tasks-title-wrap">
            <div class="wj-tasks-icon-box">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <h3 class="wj-tasks-title" data-i18n="onboarding.tasks_title">${t('onboarding.tasks_title', 'Başlangıç Görevleri')}</h3>
              <p class="wj-tasks-subtitle">${t('onboarding.tasks_progress', '{count}/4 Tamamlandı').replace('{count}', completedTasks)}</p>
            </div>
          </div>
          <div class="wj-tasks-header-right">
            <span class="wj-tasks-pct-pill">%${pct}</span>
            <button class="wj-tasks-min-btn" id="wj-tasks-min-btn" title="Küçült">–</button>
            <button class="wj-tasks-dismiss-btn" id="wj-tasks-dismiss-btn" title="Kapat">✕</button>
          </div>
        </div>

        <div class="wj-tasks-bar">
          <div class="wj-tasks-bar-fill" style="width: ${pct}%;"></div>
        </div>

        <div class="wj-tasks-list">
          <!-- 1. Hesap -->
          <div class="wj-task-item completed">
            <div class="wj-task-check">✓</div>
            <span class="wj-task-name" data-i18n="onboarding.task_account">${t('onboarding.task_account', 'Hesap oluşturuldu')}</span>
          </div>

          <!-- 2. Defter -->
          <div class="wj-task-item completed">
            <div class="wj-task-check">✓</div>
            <span class="wj-task-name" data-i18n="onboarding.task_journal">${t('onboarding.task_journal', 'İşlem günlüğü oluşturuldu')}</span>
          </div>

          <!-- 3. İlk Trade -->
          <div class="wj-task-item ${isTradeDone ? 'completed' : ''}" id="wj-task-trade">
            <div class="wj-task-check">${isTradeDone ? '✓' : ''}</div>
            <span class="wj-task-name" data-i18n="onboarding.task_trade">${t('onboarding.task_trade', 'İlk tradeni kaydet')}</span>
            ${!isTradeDone ? `<span class="wj-task-action-icon" data-i18n="onboarding.btn_add_action">${t('onboarding.btn_add_action', '+ Ekle')}</span>` : ''}
          </div>

          <!-- 4. İlk Strateji -->
          <div class="wj-task-item ${isStrategyDone ? 'completed' : ''}" id="wj-task-strategy">
            <div class="wj-task-check">${isStrategyDone ? '✓' : ''}</div>
            <span class="wj-task-name" data-i18n="onboarding.task_strategy">${t('onboarding.task_strategy', 'İlk stratejini kaydet')}</span>
            ${!isStrategyDone ? `<span class="wj-task-action-icon" data-i18n="onboarding.btn_add_action">${t('onboarding.btn_add_action', '+ Ekle')}</span>` : ''}
          </div>
        </div>

        <button class="wj-tasks-skip-btn" id="wj-tasks-skip-btn" type="button">
          <span data-i18n="onboarding.tasks_skip">${t('onboarding.tasks_skip', 'Görevleri atla')}</span>
        </button>
      </div>
    `;

    floatingWrapper.innerHTML = widgetHtml;
    refreshLucideIcons();

    // Küçültme butonu
    var minBtn = document.getElementById('wj-tasks-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        floatingWrapper.classList.add('minimized');
        localStorage.setItem('wj_tasks_minimized_' + uid, 'true');
      });
    }

    // Genişletme butonu
    var expandBtn = document.getElementById('wj-tasks-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (floatingWrapper._wasDragged) {
          e.preventDefault();
          return;
        }
        floatingWrapper.classList.remove('minimized');
        localStorage.setItem('wj_tasks_minimized_' + uid, 'false');

        // Genişleyince ekran dışına taşmaması için pozisyonu gerekirse içeri kaydır
        requestAnimationFrame(function () {
          if (floatingWrapper.style.left && floatingWrapper.style.left !== 'auto') {
            var curLeft = parseFloat(floatingWrapper.style.left);
            var curTop = parseFloat(floatingWrapper.style.top);
            if (!isNaN(curLeft) && !isNaN(curTop)) {
              var rect = floatingWrapper.getBoundingClientRect();
              var margin = 12;
              var maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
              var maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
              var clampedX = Math.round(Math.min(Math.max(margin, curLeft), maxLeft));
              var clampedY = Math.round(Math.min(Math.max(margin, curTop), maxTop));
              floatingWrapper.style.left = clampedX + 'px';
              floatingWrapper.style.top = clampedY + 'px';
              try {
                var posKey = uid ? ('wj_tasks_pos_' + uid) : 'wj_tasks_pos';
                localStorage.setItem(posKey, JSON.stringify({ left: clampedX, top: clampedY }));
              } catch (err) {}
            }
          }
        });
      });
    }

    // Kapatma butonu
    var dismissBtn = document.getElementById('wj-tasks-dismiss-btn');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dismissTasksWidget();
      });
    }

    // Görevleri atla: kartı kalıcı olarak kaldır
    var skipTasksBtn = document.getElementById('wj-tasks-skip-btn');
    if (skipTasksBtn) {
      skipTasksBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        skipTasksWidget();
      });
    }

    // Trade tıklandığında hızlı işlem aç
    var tradeTask = document.getElementById('wj-task-trade');
    if (tradeTask && !isTradeDone) {
      tradeTask.addEventListener('click', function () {
        var fab = document.getElementById('quick-add-fab');
        if (fab) {
          fab.click();
        } else {
          window.location.href = '/trades';
        }
      });
    }

    // Strateji tıklandığında strateji modalını aç veya strateji sayfasına git
    var strategyTask = document.getElementById('wj-task-strategy');
    if (strategyTask && !isStrategyDone) {
      strategyTask.addEventListener('click', function () {
        if (window.location.pathname.indexOf('strategies') !== -1) {
          var openBtn = document.getElementById('open-add-strategy-modal') || document.getElementById('btn-add-strategy');
          if (openBtn) {
            openBtn.click();
          } else {
            var modal = document.getElementById('add-strategy-modal');
            if (modal) modal.style.display = 'flex';
          }
        } else {
          sessionStorage.setItem('wj_from_onboarding', 'true');
          window.location.href = '/strategies?action=new';
        }
      });
    }

    // Sürüklenebilirlik (Drag & Drop) kurulumu
    setupTasksWidgetDraggable(floatingWrapper, uid);
  }

  // Görevler widget'ını (hap butonu ve açık kartı) hem fare hem de dokunmatik ekranlar için sürüklenebilir yapma
  function setupTasksWidgetDraggable(floatingWrapper, uid) {
    if (!floatingWrapper) return;
    var posKey = uid ? ('wj_tasks_pos_' + uid) : 'wj_tasks_pos';

    function clampPosition(x, y) {
      var margin = 12;
      var rect = floatingWrapper.getBoundingClientRect();
      var width = rect.width || (floatingWrapper.classList.contains('minimized') ? 160 : 330);
      var height = rect.height || 50;
      var maxLeft = Math.max(margin, window.innerWidth - width - margin);
      var maxTop = Math.max(margin, window.innerHeight - height - margin);
      return {
        left: Math.round(Math.min(Math.max(margin, x), maxLeft)),
        top: Math.round(Math.min(Math.max(margin, y), maxTop))
      };
    }

    // Kayıtlı pozisyonu geri yükle
    try {
      var saved = localStorage.getItem(posKey) || localStorage.getItem('wj_tasks_pos');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
          var clamped = clampPosition(parsed.left, parsed.top);
          floatingWrapper.style.left = clamped.left + 'px';
          floatingWrapper.style.top = clamped.top + 'px';
          floatingWrapper.style.right = 'auto';
          floatingWrapper.style.bottom = 'auto';
        }
      }
    } catch (e) {}

    // Ekran yeniden boyutlandığında taşmayı önle
    if (!window._wjTasksResizeAttached) {
      window._wjTasksResizeAttached = true;
      window.addEventListener('resize', function () {
        var fw = document.getElementById('wj-tasks-floating-container');
        if (fw && fw.style.left && fw.style.left !== 'auto') {
          var curLeft = parseFloat(fw.style.left);
          var curTop = parseFloat(fw.style.top);
          if (!isNaN(curLeft) && !isNaN(curTop)) {
            var rect = fw.getBoundingClientRect();
            var margin = 12;
            var maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
            var maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
            var clampedX = Math.round(Math.min(Math.max(margin, curLeft), maxLeft));
            var clampedY = Math.round(Math.min(Math.max(margin, curTop), maxTop));
            fw.style.left = clampedX + 'px';
            fw.style.top = clampedY + 'px';
          }
        }
      });
    }

    var expandBtn = document.getElementById('wj-tasks-expand-btn');
    var headerEl = floatingWrapper.querySelector('.wj-tasks-header');

    var isDragging = false;
    var hasMoved = false;
    var startX = 0;
    var startY = 0;
    var startElemLeft = 0;
    var startElemTop = 0;
    var dragThreshold = 5;

    function getCoords(e) {
      if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }
      return { x: e.clientX, y: e.clientY };
    }

    function onDragStart(e) {
      // Header içerisindeki butonlara (– veya ✕) tıklandığında sürükleme başlatma
      if (e.target.closest('#wj-tasks-min-btn') || e.target.closest('#wj-tasks-dismiss-btn')) {
        return;
      }
      if (e.target.closest('button') && !e.target.closest('#wj-tasks-expand-btn')) {
        return;
      }
      // Fare ile tıklandıysa sadece sol tık
      if (e.button !== undefined && e.button !== 0) {
        return;
      }

      var coords = getCoords(e);
      startX = coords.x;
      startY = coords.y;

      var rect = floatingWrapper.getBoundingClientRect();
      startElemLeft = rect.left;
      startElemTop = rect.top;
      hasMoved = false;
      isDragging = false;

      if (window.PointerEvent && e instanceof PointerEvent) {
        try {
          if (e.target.setPointerCapture) {
            e.target.setPointerCapture(e.pointerId);
          }
        } catch (err) {}
      }

      window.addEventListener('pointermove', onDragMove, { passive: false });
      window.addEventListener('pointerup', onDragEnd);
      window.addEventListener('pointercancel', onDragEnd);
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('touchmove', onDragMove, { passive: false });
      window.addEventListener('touchend', onDragEnd);
      window.addEventListener('touchcancel', onDragEnd);
    }

    function onDragMove(e) {
      var coords = getCoords(e);
      var dx = coords.x - startX;
      var dy = coords.y - startY;
      var dist = Math.hypot(dx, dy);

      if (!hasMoved && dist > dragThreshold) {
        hasMoved = true;
        isDragging = true;
        floatingWrapper.classList.add('is-dragging');
        floatingWrapper.style.right = 'auto';
        floatingWrapper.style.bottom = 'auto';
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault();
        }
        var nextX = startElemLeft + dx;
        var nextY = startElemTop + dy;
        var clamped = clampPosition(nextX, nextY);
        floatingWrapper.style.left = clamped.left + 'px';
        floatingWrapper.style.top = clamped.top + 'px';
      }
    }

    function onDragEnd(e) {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('pointercancel', onDragEnd);
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onDragMove);
      window.removeEventListener('touchend', onDragEnd);
      window.removeEventListener('touchcancel', onDragEnd);

      if (isDragging) {
        isDragging = false;
        floatingWrapper.classList.remove('is-dragging');

        var rect = floatingWrapper.getBoundingClientRect();
        var clamped = clampPosition(rect.left, rect.top);
        floatingWrapper.style.left = clamped.left + 'px';
        floatingWrapper.style.top = clamped.top + 'px';

        try {
          localStorage.setItem(posKey, JSON.stringify(clamped));
        } catch (err) {}

        floatingWrapper._wasDragged = true;
        setTimeout(function () {
          floatingWrapper._wasDragged = false;
        }, 180);
      }
    }

    var handles = [expandBtn, headerEl].filter(Boolean);
    handles.forEach(function (handle) {
      if (window.PointerEvent) {
        handle.addEventListener('pointerdown', onDragStart);
      } else {
        handle.addEventListener('mousedown', onDragStart);
        handle.addEventListener('touchstart', onDragStart, { passive: true });
      }
    });
  }

  function dismissTasksWidget() {
    var floatingWrapper = document.getElementById('wj-tasks-floating-container');
    if (!floatingWrapper || !state.user) return;

    var uid = state.user.id;
    var isAccountDone = true;
    var isJournalDone = true;
    var isTradeDone = state.tradesCount > 0;
    var isStrategyDone = state.strategiesCount > 0;
    var isAllCompleted = (isAccountDone && isJournalDone && isTradeDone && isStrategyDone);

    if (isAllCompleted) {
      // 4 görev de başarıyla tamamlandı: Kalıcı kapat
      try {
        localStorage.setItem('wj_tasks_dismissed_' + uid, 'true');
        localStorage.setItem('wj_tasks_all_done_' + uid, 'true');
        localStorage.setItem('ww_tasks_dismissed', 'true');
      } catch (e) {}
      if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
        window.sb.auth.updateUser({ data: { tasks_completed: true } }).catch(function () {});
      }
      floatingWrapper.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      floatingWrapper.style.opacity = '0';
      floatingWrapper.style.transform = 'translateY(16px)';
      setTimeout(function () {
        if (floatingWrapper.parentNode) floatingWrapper.parentNode.removeChild(floatingWrapper);
      }, 300);
    } else {
      // Görevler henüz bitmedi: Sağ altta mini Pill (Hap) durumuna küçült
      floatingWrapper.classList.add('minimized');
      localStorage.setItem('wj_tasks_minimized_' + uid, 'true');
    }
  }

  // Kullanıcı görevleri atladı: tamamlanmış gibi kalıcı gizle (diğer cihazlarda da çıkmasın
  // diye user_metadata'ya da yazılır; tasks_skipped atlandığını ayırt etmek için).
  function skipTasksWidget() {
    var floatingWrapper = document.getElementById('wj-tasks-floating-container');
    if (!state.user) return;
    var uid = state.user.id;

    try {
      localStorage.setItem('wj_tasks_dismissed_' + uid, 'true');
      localStorage.setItem('ww_tasks_dismissed', 'true');
    } catch (e) {}
    if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
      window.sb.auth.updateUser({ data: { tasks_completed: true, tasks_skipped: true } }).catch(function () {});
    }

    if (floatingWrapper) {
      floatingWrapper.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      floatingWrapper.style.opacity = '0';
      floatingWrapper.style.transform = 'translateY(16px)';
      setTimeout(function () {
        if (floatingWrapper.parentNode) floatingWrapper.parentNode.removeChild(floatingWrapper);
      }, 300);
    }
  }

  // ------------------------------------------------------------
  // 4. BAŞLANGIÇ YÖNETİMİ & KULLANICI KONTROLÜ
  // ------------------------------------------------------------
  var isInitializing = false;
  async function initOnboarding() {
    if (isInitializing) return;
    if (typeof window.requireAuth !== 'function') return;

    isInitializing = true;
    var user = null;
    try {
      user = await window.requireAuth();
    } catch (e) { }

    if (!user || !user.id || !window.sb) {
      isInitializing = false;
      return;
    }
    state.user = user;
    var uid = user.id;

    // Kullanıcının trade ve strateji sayılarını çek
    await loadUserCounts();

    // Eğer strateji oluşturma görevinden dönüldüyse kullanıcıya başarı bildirimi göster
    try {
      if (sessionStorage.getItem('wj_strategy_just_completed') === 'true') {
        sessionStorage.removeItem('wj_strategy_just_completed');
        if (typeof window.showToast === 'function') {
          var toastText = t('onboarding.task_strategy_toast', 'Strateji başarıyla eklendi! Görev tamamlandı.');
          window.showToast(toastText, 'success');
        }
      }
    } catch (e) { }

    // 1. Sihirbaz tamamlandı mı kontrolü
    var localWizardDone = localStorage.getItem('wj_wizard_done_' + uid) === 'true';
    var dbWizardDone = false;
    var dbTourDone = false;

    try {
      var { data: profile, error } = await window.sb
        .from('user_profiles')
        .select('onboarding_completed, onboarding_tour_completed, preferred_currency')
        .eq('id', uid)
        .maybeSingle();

      if (!error && profile) {
        dbWizardDone = profile.onboarding_completed === true;
        dbTourDone = profile.onboarding_tour_completed === true;
        if (profile.preferred_currency) {
          state.selectedCurrency = profile.preferred_currency;
        }
      }
    } catch (err) {
      wwLog.warn('Profile onboarding check note:', err);
    }

    var isWizardDone = localWizardDone || dbWizardDone;
    var isTourDone = (localStorage.getItem('wj_tour_done_' + uid) === 'true') || dbTourDone;

    // 🚀 ADIM 1: Eğer sihirbaz tamamlanmamışsa, KESİNLİKLE İLK OLARAK SİHİRBAZ AÇILIR!
    if (!isWizardDone) {
      wwLog.log('🚀 [Faz 1] Yeni kullanıcı tespit edildi: Hoşgeldin Sihirbazı açılıyor...');
      setTimeout(function () {
        openWizardModal();
      }, 400);
      return;
    }

    // 🚀 ADIM 2: Sihirbaz tamamlanmış ama rehber turu henüz yapılmamışsa
    if (!isTourDone) {
      if (window.location.pathname === '/' || window.location.pathname.includes('dashboard')) {
        wwLog.log('🚀 [Faz 2] Sihirbaz tamamlanmış, İnteraktif Rehber Turu başlatılıyor...');
        setTimeout(function () {
          startSpotlightTour();
        }, 500);
        return;
      } else {
        // Kullanıcı Dashboard dışındaki bir sayfadaysa görevler henüz bitmediyse göster
        renderTasksWidget();
        return;
      }
    }

    // 🚀 ADIM 3: Hem sihirbaz hem tur bittiyse -> Görevler tamamlanmadıysa SAĞ ALTTTAKİ GÖREVLER KARTI GÖSTERİLİR!
    renderTasksWidget();
  }

  // Yeni işlem kaydedildiğinde görevleri otomatik güncelle
  window.addEventListener('trade-saved', async function () {
    var uid = state.user && state.user.id;
    if (uid && (localStorage.getItem('wj_tasks_all_done_' + uid) === 'true' || localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true')) {
      return;
    }
    await loadUserCounts();
    renderTasksWidget();
  });

  // Yeni strateji kaydedildiğinde görevleri otomatik güncelle
  window.addEventListener('strategy-saved', async function () {
    var uid = state.user && state.user.id;
    if (uid && (localStorage.getItem('wj_tasks_all_done_' + uid) === 'true' || localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true')) {
      return;
    }
    await loadUserCounts();
    renderTasksWidget();
  });

  // Sayfa odağı değiştiğinde (örneğin sekme veya sayfa geçişi) görevleri canlı güncelle
  window.addEventListener('focus', async function () {
    if (state.user) {
      var uid = state.user.id;
      if (localStorage.getItem('wj_tasks_all_done_' + uid) === 'true' || localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true') {
        return;
      }
      await loadUserCounts();
      renderTasksWidget();
    }
  });

  document.addEventListener('visibilitychange', async function () {
    if (!document.hidden && state.user) {
      var uid = state.user.id;
      if (localStorage.getItem('wj_tasks_all_done_' + uid) === 'true' || localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true') {
        return;
      }
      await loadUserCounts();
      renderTasksWidget();
    }
  });

  // Global test, reset ve yenileme fonksiyonları
  window.startOnboardingTour = startSpotlightTour;
  window.startOnboardingWizard = openWizardModal;
  window.renderOnboardingTasks = renderTasksWidget;
  window.refreshOnboardingTasks = async function () {
    await loadUserCounts();
    renderTasksWidget();
  };

  // Test sıfırlama (Her şeyi, görevleri, stratejileri ve işlemleri sıfırlar ve 1. adımdan baştan açar)
  window.resetOnboarding = async function () {
    if (state.user) {
      var uid = state.user.id;
      localStorage.removeItem('wj_wizard_done_' + uid);
      localStorage.removeItem('wj_tour_done_' + uid);
      localStorage.removeItem('wj_tasks_dismissed_' + uid);
      localStorage.removeItem('wj_tasks_minimized_' + uid);
      localStorage.removeItem('wj_tasks_all_done_' + uid);
      localStorage.removeItem('wj_tasks_pos_' + uid);
      if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
        window.sb.auth.updateUser({ data: { tasks_completed: false } }).catch(function () {});
      }
    }
    localStorage.removeItem('ww_onboarding_completed');
    localStorage.removeItem('ww_tour_completed');
    localStorage.removeItem('ww_tasks_dismissed');
    localStorage.removeItem('wj_tasks_pos');
    sessionStorage.removeItem('wj_from_onboarding');
    sessionStorage.removeItem('wj_strategy_just_completed');

    // Bellekteki görev sayaçlarını sıfırla
    state.tradesCount = 0;
    state.strategiesCount = 0;

    var floating = document.getElementById('wj-tasks-floating-container');
    if (floating) floating.remove();

    if (state.user && window.sb) {
      try {
        await window.sb.from('user_profiles').update({
          onboarding_completed: false,
          onboarding_tour_completed: false
        }).eq('id', state.user.id);
      } catch (e) {
        wwLog.warn('Could not reset user_profiles:', e);
      }

      // Veritabanındaki test stratejilerini sil (böylece strateji görevi tamamlanmamışa döner)
      try {
        await window.sb.from('strategies').delete().eq('user_id', state.user.id);
        if (typeof window.clearStrategiesCache === 'function') {
          window.clearStrategiesCache();
        }
      } catch (e) {
        wwLog.warn('Could not delete strategies for reset:', e);
      }

      // Veritabanındaki test tradelerini sil (böylece trade görevi tamamlanmamışa döner)
      try {
        await window.sb.from('trades').delete().eq('user_id', state.user.id);
      } catch (e) {
        wwLog.warn('Could not delete trades for reset:', e);
      }
    }

    if (typeof window.showToast === 'function') {
      window.showToast('Tüm onboarding ve görevler sıfırlandı!', 'info');
    }

    openWizardModal();
  };

  // Yalnızca görevler kartını sıfırlamak için hızlı yardımcı
  window.resetTasksOnly = async function () {
    if (state.user) {
      var uid = state.user.id;
      localStorage.removeItem('wj_tasks_dismissed_' + uid);
      localStorage.removeItem('wj_tasks_minimized_' + uid);
      localStorage.removeItem('wj_tasks_all_done_' + uid);
      if (window.sb && window.sb.auth && typeof window.sb.auth.updateUser === 'function') {
        window.sb.auth.updateUser({ data: { tasks_completed: false } }).catch(function () {});
      }
      sessionStorage.removeItem('wj_from_onboarding');
      sessionStorage.removeItem('wj_strategy_just_completed');

      state.tradesCount = 0;
      state.strategiesCount = 0;

      if (window.sb) {
        try {
          await window.sb.from('strategies').delete().eq('user_id', state.user.id);
          if (typeof window.clearStrategiesCache === 'function') window.clearStrategiesCache();
        } catch (e) { }
        try {
          await window.sb.from('trades').delete().eq('user_id', state.user.id);
        } catch (e) { }
      }
    }
    renderTasksWidget();
  };

  // Sağlam poller ile Auth & Supabase hazır olduğunda başlat
  function waitForAuthAndStart(maxAttempts, interval) {
    maxAttempts = maxAttempts || 45;
    interval = interval || 120;
    var attempts = 0;
    var poller = setInterval(function () {
      attempts++;
      var hasAuth = typeof window.requireAuth === 'function';
      var hasSb = typeof window.sb !== 'undefined' && window.sb !== null;

      if (hasAuth && hasSb) {
        clearInterval(poller);
        setTimeout(initOnboarding, 50);
      } else if (attempts >= maxAttempts) {
        clearInterval(poller);
        if (hasAuth) {
          initOnboarding();
        }
      }
    }, interval);
  }

  // Başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      waitForAuthAndStart();
    });
  } else {
    waitForAuthAndStart();
  }

})();
