// ============================================================
// WAWE JOURNAL - ONBOARDING WIZARD, SPOTLIGHT TOUR & TASKS
// Sequential Flow:
// 1. Welcome Wizard & Setup (Language, Currency, Theme, Journal)
// 2. Guided Interactive Spotlight Tour
// 3. Floating Bottom-Right Tasks Checklist
// ============================================================

(function () {
  'use strict';

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
    totalSteps: 4,
    selectedLang: 'tr',
    selectedCurrency: '$',
    selectedTheme: 'dark',
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

    if (!state.hasCustomJournalName) {
      state.journalName = defaultJournalNames[currentSavedLang] || 'Ana Portföy';
    }

    var modalHtml = `
      <div class="wj-onboarding-overlay" id="wj-onboarding-modal">
        <div class="wj-onboarding-card">
          <div class="wj-onboarding-header-glow"></div>
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
                      <polyline points="2,16 7,9 12,13 19,4" stroke="#8b5cf6" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                  <span class="wj-welcome-logo-text">Wawe<span class="wj-welcome-logo-accent">Journal</span></span>
                </div>
                
                <div class="wj-polyglot-title-wrapper">
                  <span class="wj-polyglot-title" id="wj-polyglot-text">Welcome</span>
                </div>

                <p class="wj-welcome-subtitle" id="wj-welcome-subtitle-p">
                  <span class="wj-typewriter-text" id="wj-typewriter-target"></span><span class="wj-typewriter-cursor" id="wj-typewriter-cursor">|</span>
                </p>

                <button class="wj-btn-primary" id="wj-hero-start-btn" style="padding: 0.9rem 2.2rem; font-size: 1.05rem;">
                  <span data-i18n="onboarding.btn_start">${t('onboarding.btn_start', 'Başlayalım →')}</span>
                </button>
              </div>
            </div>

            <!-- STEP 1: DİL SEÇİMİ -->
            <div class="wj-wizard-step" id="wj-step-1">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım 1 / 4').replace('{step}', '1').replace('{total}', '4')}</span>
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
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım 2 / 4').replace('{step}', '2').replace('{total}', '4')}</span>
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

            <!-- STEP 3: TEMA SEÇİMİ (DARK / LIGHT) -->
            <div class="wj-wizard-step" id="wj-step-3">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım 3 / 4').replace('{step}', '3').replace('{total}', '4')}</span>
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
                <button class="wj-btn-back" data-goto="2">${t('onboarding.btn_back', '← Geri')}</button>
                <button class="wj-btn-primary" data-goto="4">${t('onboarding.btn_next', 'Devam Et →')}</button>
              </div>
            </div>

            <!-- STEP 4: İLK DEFTER (JOURNAL) KURULUMU -->
            <div class="wj-wizard-step" id="wj-step-4">
              <div class="wj-step-meta">
                <span class="wj-step-count">${t('onboarding.step_indicator', 'Adım 4 / 4').replace('{step}', '4').replace('{total}', '4')}</span>
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
                <button class="wj-btn-back" data-goto="3">${t('onboarding.btn_back', '← Geri')}</button>
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
  // 3 DİLLİ ANİMASYON DÖNGÜSÜ (Welcome -> Willkommen -> Hoş Geldiniz)
  // ------------------------------------------------------------
  var polyglotTimer = null;
  function startPolyglotGreeting() {
    var el = document.getElementById('wj-polyglot-text');
    if (!el) return;

    var greetings = [
      { text: 'Welcome', lang: 'English' },
      { text: 'Willkommen', lang: 'Deutsch' },
      { text: 'Hoş Geldiniz', lang: 'Türkçe' }
    ];
    var index = 0;

    if (polyglotTimer) clearInterval(polyglotTimer);

    polyglotTimer = setInterval(function () {
      index = (index + 1) % greetings.length;
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';

      setTimeout(function () {
        el.textContent = greetings[index].text;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, 250);
    }, 2200);
  }

  // ------------------------------------------------------------
  // HIZLI YAZMA (TYPEWRITER) ANİMASYONU
  // ------------------------------------------------------------
  var typewriterTimer = null;
  function startSubtitleTypewriter() {
    var targetEl = document.getElementById('wj-typewriter-target');
    var cursorEl = document.getElementById('wj-typewriter-cursor');
    if (!targetEl) return;

    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }

    var fullText = t(
      'onboarding.welcome_subtitle',
      'Wawe Journal ile kaderini baştan yazmaya ve disiplinini zirveye taşımaya hazırmısın? Sana bir kaç soru sorucaz ve sana ait alanınını kişiselleştiricez.'
    );

    targetEl.textContent = '';
    if (cursorEl) {
      cursorEl.style.opacity = '1';
      cursorEl.style.display = 'inline-block';
    }

    var charIndex = 0;
    var speed = 16; // Hızlı, akıcı yazma hızı (16ms)

    typewriterTimer = setInterval(function () {
      if (charIndex < fullText.length) {
        targetEl.textContent += fullText.charAt(charIndex);
        charIndex++;
      } else {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
        if (cursorEl) {
          // Yazma tamamlandıktan sonra imleç hafifçe yanıp söner ve yumuşakça kaybolur
          setTimeout(function () {
            if (cursorEl) cursorEl.style.opacity = '0';
          }, 1500);
        }
      }
    }, speed);
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

    if (stepIndex === 0) {
      startPolyglotGreeting();
      startSubtitleTypewriter();
    } else {
      if (polyglotTimer) clearInterval(polyglotTimer);
      if (typewriterTimer) {
        clearInterval(typewriterTimer);
        typewriterTimer = null;
      }
    }

    if (stepIndex === 4 && !state.hasCustomJournalName) {
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
    if (polyglotTimer) clearInterval(polyglotTimer);
    if (typewriterTimer) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
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
  function getTourSteps() {
    return [
      {
        targetSelector: '.nav-links',
        fallbackSelector: '#navbar-container',
        title: t('onboarding.tour_step1_title', 'Ana Menü & Sayfalar'),
        desc: t('onboarding.tour_step1_desc', 'Dashboard, İşlemler (Trades), Stratejiler ve Takvim sayfalarınıza buradan kolayca ulaşabilirsiniz.'),
        position: 'bottom'
      },
      {
        targetSelector: '#nav-journal-switcher',
        fallbackSelector: '.nav-right',
        title: t('onboarding.tour_step2_title', 'İşlem Günlüğü Seçici'),
        desc: t('onboarding.tour_step2_desc', 'Farklı stratejileriniz veya portföyleriniz için ayrı defterler oluşturabilir, buradan tek tıkla aralarında geçiş yapabilirsiniz.'),
        position: 'bottom'
      },
      {
        targetSelector: '#stats-grid',
        fallbackSelector: '.stats-grid',
        title: t('onboarding.tour_step3_title', 'Performans & İstatistikler'),
        desc: t('onboarding.tour_step3_desc', 'Toplam Kâr/Zarar (P&L), Win Rate oranınız ve işlem sonuçlarınız gerçek zamanlı olarak burada listelenir.'),
        position: 'bottom'
      },
      {
        targetSelector: '#quick-add-fab',
        fallbackSelector: '.quick-add-fab',
        title: t('onboarding.tour_step4_title', 'Hızlı İşlem Ekleme (+)'),
        desc: t('onboarding.tour_step4_desc', 'Bu butona tıklayarak manuel yeni trade ekleyebilir ya da borsa CSV dosyanızı sürükleyip anında içeri aktarabilirsiniz.'),
        position: 'top-left'
      }
    ];
  }

  function startSpotlightTour() {
    state.tourIndex = 0;
    state.isTourActive = true;
    renderTourDom();
    showTourStep(0);
  }

  function renderTourDom() {
    var existingBackdrop = document.getElementById('wj-tour-backdrop');
    if (existingBackdrop) existingBackdrop.remove();
    var existingHighlight = document.getElementById('wj-tour-highlight');
    if (existingHighlight) existingHighlight.remove();
    var existingTooltip = document.getElementById('wj-tour-tooltip');
    if (existingTooltip) existingTooltip.remove();

    var tourHtml = `
      <div class="wj-tour-backdrop" id="wj-tour-backdrop"></div>
      <div class="wj-tour-target-highlight" id="wj-tour-highlight" style="display:none;"></div>
      <div class="wj-tour-tooltip" id="wj-tour-tooltip" style="display:none;">
        <span class="wj-tour-step-badge" id="wj-tour-badge"></span>
        <h4 class="wj-tour-title" id="wj-tour-title"></h4>
        <p class="wj-tour-desc" id="wj-tour-desc"></p>
        <div class="wj-tour-footer">
          <div class="wj-tour-dots" id="wj-tour-dots"></div>
          <div class="wj-tour-actions">
            <button class="wj-tour-btn-skip" id="wj-tour-skip-btn">${t('onboarding.tour_btn_skip', 'Geç')}</button>
            <button class="wj-tour-btn-next" id="wj-tour-next-btn">${t('onboarding.tour_btn_next', 'Sonraki →')}</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', tourHtml);

    document.getElementById('wj-tour-skip-btn').addEventListener('click', endTour);
    document.getElementById('wj-tour-next-btn').addEventListener('click', function () {
      var steps = getTourSteps();
      if (state.tourIndex < steps.length - 1) {
        showTourStep(state.tourIndex + 1);
      } else {
        endTour();
      }
    });

    document.getElementById('wj-tour-backdrop').addEventListener('click', function (e) {
      if (e.target.id === 'wj-tour-backdrop') {
        endTour();
      }
    });
  }

  function showTourStep(index) {
    var steps = getTourSteps();
    state.tourIndex = index;
    var step = steps[index];
    if (!step) return;

    var backdrop = document.getElementById('wj-tour-backdrop');
    var highlight = document.getElementById('wj-tour-highlight');
    var tooltip = document.getElementById('wj-tour-tooltip');

    if (!backdrop || !highlight || !tooltip) return;

    backdrop.classList.add('active');

    var targetEl = document.querySelector(step.targetSelector) || document.querySelector(step.fallbackSelector);

    if (!targetEl || targetEl.offsetParent === null) {
      if (index < steps.length - 1) {
        showTourStep(index + 1);
      } else {
        endTour();
      }
      return;
    }

    targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    setTimeout(function () {
      var rect = targetEl.getBoundingClientRect();
      var scrollY = window.pageYOffset || document.documentElement.scrollTop;
      var scrollX = window.pageXOffset || document.documentElement.scrollLeft;

      var padding = 8;
      highlight.style.display = 'block';
      highlight.style.top = (rect.top + scrollY - padding) + 'px';
      highlight.style.left = (rect.left + scrollX - padding) + 'px';
      highlight.style.width = (rect.width + padding * 2) + 'px';
      highlight.style.height = (rect.height + padding * 2) + 'px';

      tooltip.style.display = 'block';
      var tooltipRect = tooltip.getBoundingClientRect();

      var tTop = rect.bottom + scrollY + 16;
      var tLeft = rect.left + scrollX;

      if (step.position === 'top-left' || tTop + tooltipRect.height > scrollY + window.innerHeight) {
        tTop = rect.top + scrollY - tooltipRect.height - 16;
      }
      if (tLeft + tooltipRect.width > window.innerWidth - 20) {
        tLeft = window.innerWidth - tooltipRect.width - 20;
      }
      if (tLeft < 20) tLeft = 20;

      tooltip.style.top = Math.max(20, tTop) + 'px';
      tooltip.style.left = tLeft + 'px';

      document.getElementById('wj-tour-badge').textContent = t('onboarding.step_indicator', 'Adım {step} / {total}')
        .replace('{step}', index + 1)
        .replace('{total}', steps.length);
      document.getElementById('wj-tour-title').textContent = step.title;
      document.getElementById('wj-tour-desc').textContent = step.desc;

      var nextBtn = document.getElementById('wj-tour-next-btn');
      if (index === steps.length - 1) {
        nextBtn.textContent = t('onboarding.tour_btn_finish', 'Turu Bitir');
      } else {
        nextBtn.textContent = t('onboarding.tour_btn_next', 'Sonraki →');
      }

      var skipBtn = document.getElementById('wj-tour-skip-btn');
      if (skipBtn) {
        skipBtn.textContent = t('onboarding.tour_btn_skip', 'Geç');
      }

      var dotsContainer = document.getElementById('wj-tour-dots');
      dotsContainer.innerHTML = '';
      for (var d = 0; d < steps.length; d++) {
        var dot = document.createElement('div');
        dot.className = 'wj-tour-dot' + (d === index ? ' active' : '');
        dotsContainer.appendChild(dot);
      }
    }, 180);
  }

  async function endTour() {
    state.isTourActive = false;
    var backdrop = document.getElementById('wj-tour-backdrop');
    var highlight = document.getElementById('wj-tour-highlight');
    var tooltip = document.getElementById('wj-tour-tooltip');

    if (backdrop) backdrop.classList.remove('active');
    if (highlight) highlight.style.display = 'none';
    if (tooltip) tooltip.style.display = 'none';

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
  // 3. FAZ 3: SAĞ ALTTTAKİ BAŞLANGIÇ GÖREVLERİ KARTI (TASKS WIDGET)
  // ------------------------------------------------------------
  async function loadUserCounts() {
    if (!state.user || !window.sb) return;
    try {
      var [tradesRes, stratRes] = await Promise.all([
        window.sb.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', state.user.id),
        window.sb.from('strategies').select('id', { count: 'exact', head: true }).eq('user_id', state.user.id)
      ]);
      state.tradesCount = (tradesRes && tradesRes.count) || 0;
      state.strategiesCount = (stratRes && stratRes.count) || 0;
    } catch (e) {
      wwLog.warn('Could not load user counts:', e);
    }
  }

  function renderTasksWidget() {
    if (!state.user) return;

    var uid = state.user.id;
    var hasDismissed = localStorage.getItem('wj_tasks_dismissed_' + uid) === 'true';
    if (hasDismissed) {
      var ex = document.getElementById('wj-tasks-floating-container');
      if (ex) ex.remove();
      return;
    }

    var floatingWrapper = document.getElementById('wj-tasks-floating-container');
    if (!floatingWrapper) {
      floatingWrapper = document.createElement('div');
      floatingWrapper.id = 'wj-tasks-floating-container';
      floatingWrapper.className = 'wj-tasks-floating-container';
      document.body.appendChild(floatingWrapper);
    }

    var isAccountDone = true;
    var isJournalDone = true;
    var isTradeDone = state.tradesCount > 0;
    var isStrategyDone = state.strategiesCount > 0;

    var completedTasks = [isAccountDone, isJournalDone, isTradeDone, isStrategyDone].filter(Boolean).length;
    var pct = Math.round((completedTasks / 4) * 100);
    var isAllCompleted = completedTasks === 4;

    var isMinimized = localStorage.getItem('wj_tasks_minimized_' + uid) === 'true';
    if (isMinimized) {
      floatingWrapper.classList.add('minimized');
    } else {
      floatingWrapper.classList.remove('minimized');
    }
    floatingWrapper.style.display = 'block';

    var widgetHtml = '';

    if (isAllCompleted) {
      widgetHtml = `
        <!-- Minimized Pill Button -->
        <button class="wj-tasks-min-pill" id="wj-tasks-expand-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span style="color:#10b981;">${t('onboarding.tasks_pill', 'Görevler ({count}/4)').replace('{count}', '4')}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>

        <!-- Expanded Floating Card (All Completed) -->
        <div class="wj-tasks-widget wj-tasks-completed-widget" id="wj-tasks-widget">
          <div class="wj-tasks-header" style="margin-bottom:0.25rem;">
            <div class="wj-tasks-title-wrap">
              <div class="wj-tasks-icon-box" style="background:rgba(16, 185, 129, 0.15); border-color:rgba(16, 185, 129, 0.35); color:#10b981;">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div>
                <h3 class="wj-tasks-title" data-i18n="onboarding.tasks_title">${t('onboarding.tasks_title', 'Başlangıç Görevleri')}</h3>
                <p class="wj-tasks-subtitle" style="color:#10b981;">${t('onboarding.tasks_progress', '{count}/4 Tamamlandı').replace('{count}', '4')}</p>
              </div>
            </div>
            <div class="wj-tasks-header-right">
              <span class="wj-tasks-pct-pill" style="background:rgba(16, 185, 129, 0.18); border-color:rgba(16, 185, 129, 0.35); color:#10b981;">%100</span>
              <button class="wj-tasks-dismiss-btn" id="wj-tasks-dismiss-btn" title="Kapat">✕</button>
            </div>
          </div>

          <div class="wj-tasks-success-box">
            <div class="wj-tasks-success-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 class="wj-tasks-success-title" data-i18n="onboarding.tasks_success_title">${t('onboarding.tasks_success_title', 'Başarıyla Tamamlandı!')}</h3>
            <p class="wj-tasks-success-desc" data-i18n="onboarding.tasks_success_desc">${t('onboarding.tasks_success_desc', 'Tüm başlangıç görevlerini eksiksiz tamamladınız. Artık Wawe Journal\'ı tam verimle kullanabilirsiniz.')}</p>
            <button class="wj-btn-primary" id="wj-tasks-finish-btn" style="padding: 0.65rem 1.6rem; font-size: 0.88rem; border-radius: 10px; width:100%;">
              <span data-i18n="onboarding.tasks_success_btn">${t('onboarding.tasks_success_btn', 'Harika, Teşekkürler')}</span>
            </button>
          </div>
        </div>
      `;
    } else {
      widgetHtml = `
        <!-- Minimized Pill Button -->
        <button class="wj-tasks-min-pill" id="wj-tasks-expand-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>${t('onboarding.tasks_pill', 'Görevler ({count}/4)').replace('{count}', completedTasks)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>

        <!-- Expanded Floating Card -->
        <div class="wj-tasks-widget" id="wj-tasks-widget">
          <div class="wj-tasks-header">
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
        </div>
      `;
    }

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
        floatingWrapper.classList.remove('minimized');
        localStorage.setItem('wj_tasks_minimized_' + uid, 'false');
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

    // Başarıyla tamamlandı butonu
    var finishBtn = document.getElementById('wj-tasks-finish-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        dismissTasksWidget();
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
          window.location.href = '/trades.html';
        }
      });
    }

    // Strateji tıklandığında strateji sayfasını aç ve ekleme modalını çıkart
    var strategyTask = document.getElementById('wj-task-strategy');
    if (strategyTask && !isStrategyDone) {
      strategyTask.addEventListener('click', function () {
        sessionStorage.setItem('wj_from_onboarding', 'true');
        window.location.href = '/strategies.html?action=new';
      });
    }

    // 4 görev de bitince 6 saniye sonra otomatik kapat (veya kullanıcı kapatabilir) - KESİNLİKLE KONFETİ YOK!
    if (isAllCompleted && !hasDismissed) {
      setTimeout(function () {
        dismissTasksWidget();
      }, 6000);
    }
  }

  function dismissTasksWidget() {
    var floatingWrapper = document.getElementById('wj-tasks-floating-container');
    if (floatingWrapper && state.user) {
      floatingWrapper.style.opacity = '0';
      floatingWrapper.style.transform = 'translateY(16px)';
      setTimeout(function () {
        localStorage.setItem('wj_tasks_dismissed_' + state.user.id, 'true');
        floatingWrapper.remove();
      }, 300);
    }
  }

  // ------------------------------------------------------------
  // 4. BAŞLANGIÇ YÖNETİMİ & KULLANICI KONTROLÜ
  // ------------------------------------------------------------
  async function initOnboarding() {
    if (typeof window.requireAuth !== 'function') return;

    var user = null;
    try {
      user = await window.requireAuth();
    } catch (e) { }

    if (!user || !user.id || !window.sb) return;
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

    // 🚀 ADIM 2: Sihirbaz tamamlanmış ama rehber turu henüz yapılmamışsa -> TUR BAŞLAR!
    if (!isTourDone) {
      wwLog.log('🚀 [Faz 2] Sihirbaz tamamlanmış, İnteraktif Rehber Turu başlatılıyor...');
      setTimeout(function () {
        startSpotlightTour();
      }, 500);
      return;
    }

    // 🚀 ADIM 3: Hem sihirbaz hem tur bittiyse -> SAĞ ALTTTAKİ GÖREVLER KARTI GÖSTERİLİR!
    wwLog.log('🚀 [Faz 3] Sağ alttaki Başlangıç Görevleri kartı aktif.');
    renderTasksWidget();
  }

  // Yeni işlem kaydedildiğinde görevleri otomatik güncelle
  window.addEventListener('trade-saved', async function () {
    state.tradesCount++;
    renderTasksWidget();
  });

  // Global test ve reset fonksiyonları
  window.startOnboardingTour = startSpotlightTour;
  window.startOnboardingWizard = openWizardModal;
  window.renderOnboardingTasks = renderTasksWidget;

  // Test sıfırlama (Her şeyi, görevleri, stratejileri ve işlemleri sıfırlar ve 1. adımdan baştan açar)
  window.resetOnboarding = async function () {
    if (state.user) {
      var uid = state.user.id;
      localStorage.removeItem('wj_wizard_done_' + uid);
      localStorage.removeItem('wj_tour_done_' + uid);
      localStorage.removeItem('wj_tasks_dismissed_' + uid);
      localStorage.removeItem('wj_tasks_minimized_' + uid);
    }
    localStorage.removeItem('ww_onboarding_completed');
    localStorage.removeItem('ww_tour_completed');
    localStorage.removeItem('ww_tasks_dismissed');
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

  // Başlat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(initOnboarding, 400);
    });
  } else {
    setTimeout(initOnboarding, 400);
  }

})();
