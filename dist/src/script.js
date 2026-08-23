// ============================================================
// WAWE JOURNAL - ANA SCRIPT
// Tüm modülleri import eder ve window'a atar
// ============================================================

// ── Global hata yakalama ─────────────────────────────────────
window.onerror = function(message, source, lineno, colno, error) {
  try {
    const errorMsg = error ? error.message : message;
    if (errorMsg && errorMsg.includes('localStorage')) {
      return true;
    }
  } catch (e) {}
  return false;
};

// ── Core ──────────────────────────────────────────────────────
import './core/config.js';
import './core/storage.js';
import './core/supabase.js';

// ── Utils ─────────────────────────────────────────────────────
import './utils/helpers.js';
import './utils/ui.js';
import './utils/validation.js';

// ── Services ─────────────────────────────────────────────────
import './services/user.js';
import './services/payment.js';
import './services/stats.js';

// ── Features ─────────────────────────────────────────────────
import './features/theme.js';
import './features/overtrade.js';
import './features/notifications.js';

// ── Pricing ──────────────────────────────────────────────────
import './pricing.js';

// ── Import edilen fonksiyonları doğrudan al ────────────────
// Core
import { sb } from './core/supabase.js';
import { WW_CONFIG } from './core/config.js';

// Utils - helpers
import { 
  sanitizeHTML, 
  escapeHtml, 
  calcPnL, 
  calcRR, 
  formatCurrency, 
  formatCurrencyPDF, 
  formatDate, 
  getInstrumentMultiplier 
} from './utils/helpers.js';

// Utils - ui
import { 
  showToast, 
  destroyChart, 
  directionBadge, 
  fixDecimalInput, 
  applyDecimalFix 
} from './utils/ui.js';

// Utils - validation
import { isValidEmail } from './utils/validation.js';

// Services - auth (supabase.js'den)
import { 
  requireAuth, 
  requireAuthSilent, 
  requireAdmin, 
  isAdmin, 
  throttledUpdateLastActive 
} from './core/supabase.js';

// Services - user
import { 
  getUserPlan, 
  getUserPlanSilent, 
  isPremium, 
  hasFeature, 
  requirePremium,
  getUserStrategies,
  clearStrategiesCache,
  addStrategy,
  deleteStrategy,
  updateStrategy,
  calculateStrategyPerformance,
  getStrategiesMap
} from './services/user.js';

// Services - payment
import { 
  selectPayMethod, 
  getSystemSettings, 
  createNowPaymentInvoice, 
  upgradeToPremium, 
  cancelPremium 
} from './services/payment.js';

// Services - stats
import { 
  loadPlatformStats, 
  loadReferencesToPage, 
  uploadReferenceImage 
} from './services/stats.js';

// Features - theme
import { 
  getThemeSettings, 
  saveThemeSettings, 
  applyThemeSettings, 
  applyFontSize, 
  loadFontSize, 
  loadThemeCustomization, 
  canCustomizeTheme 
} from './features/theme.js';

// Features - overtrade
import { 
  getOvertradeSettings, 
  saveOvertradeSettings, 
  checkOvertrade, 
  renderOvertradeWarning, 
  checkAndRenderOvertrade, 
  loadOvertradeSettingsUI, 
  dismissOvertradeWarning, 
  isOvertradeWarningDismissed, 
  clearDismissedOvertradeWarnings,
  getDismissedOvertradeWarnings,
  setDismissedOvertradeWarnings
} from './features/overtrade.js';

// Features - notifications
import { 
  NotificationManager, 
  NOTIFICATION_TYPES, 
  dismissNotification, 
  clearAllNotifications, 
  toggleNotificationPanel, 
  updateNotificationUI 
} from './features/notifications.js';

// Pricing
import { 
  getMonthlyPrice, 
  getYearlyPrice, 
  setMonthlyPrice, 
  setYearlyPrice, 
  updateHomePrices, 
  adminUpdatePrices, 
  resetPrices 
} from './pricing.js';

// ════════════════════════════════════════════════════════════════
// 🔥 TÜM FONKSİYONLARI window'a ATA
// ════════════════════════════════════════════════════════════════

// Core
window.sb = sb;
window.WW_CONFIG = WW_CONFIG;

// Utils - helpers
window.sanitizeHTML = sanitizeHTML;
window.escapeHtml = escapeHtml;
window.calcPnL = calcPnL;
window.calcRR = calcRR;
window.formatCurrency = formatCurrency;
window.formatCurrencyPDF = formatCurrencyPDF;
window.formatDate = formatDate;
window.getInstrumentMultiplier = getInstrumentMultiplier;

// Utils - ui (showToast BURADA!)
window.showToast = showToast;
window.destroyChart = destroyChart;
window.directionBadge = directionBadge;
window.fixDecimalInput = fixDecimalInput;
window.applyDecimalFix = applyDecimalFix;

// Utils - validation
window.isValidEmail = isValidEmail;

// Services - auth (requireAuth BURADA!)
window.requireAuth = requireAuth;
window.requireAuthSilent = requireAuthSilent;
window.requireAdmin = requireAdmin;
window.isAdmin = isAdmin;
window.throttledUpdateLastActive = throttledUpdateLastActive;

// Services - user
window.getUserPlan = getUserPlan;
window.getUserPlanSilent = getUserPlanSilent;
window.isPremium = isPremium;
window.hasFeature = hasFeature;
window.requirePremium = requirePremium;
window.getUserStrategies = getUserStrategies;
window.clearStrategiesCache = clearStrategiesCache;
window.addStrategy = addStrategy;
window.deleteStrategy = deleteStrategy;
window.updateStrategy = updateStrategy;
window.calculateStrategyPerformance = calculateStrategyPerformance;
window.getStrategiesMap = getStrategiesMap;

// Services - payment
window.selectPayMethod = selectPayMethod;
window.getSystemSettings = getSystemSettings;
window.createNowPaymentInvoice = createNowPaymentInvoice;
window.upgradeToPremium = upgradeToPremium;
window.cancelPremium = cancelPremium;

// Services - stats
window.loadPlatformStats = loadPlatformStats;
window.loadReferencesToPage = loadReferencesToPage;
window.uploadReferenceImage = uploadReferenceImage;

// Features - theme
window.getThemeSettings = getThemeSettings;
window.saveThemeSettings = saveThemeSettings;
window.applyThemeSettings = applyThemeSettings;
window.applyFontSize = applyFontSize;
window.loadFontSize = loadFontSize;
window.loadThemeCustomization = loadThemeCustomization;
window.canCustomizeTheme = canCustomizeTheme;

// Features - overtrade
window.getOvertradeSettings = getOvertradeSettings;
window.saveOvertradeSettings = saveOvertradeSettings;
window.checkOvertrade = checkOvertrade;
window.renderOvertradeWarning = renderOvertradeWarning;
window.checkAndRenderOvertrade = checkAndRenderOvertrade;
window.loadOvertradeSettingsUI = loadOvertradeSettingsUI;
window.dismissOvertradeWarning = dismissOvertradeWarning;
window.isOvertradeWarningDismissed = isOvertradeWarningDismissed;
window.clearDismissedOvertradeWarnings = clearDismissedOvertradeWarnings;
window.getDismissedOvertradeWarnings = getDismissedOvertradeWarnings;
window.setDismissedOvertradeWarnings = setDismissedOvertradeWarnings;

// Features - notifications
window.NotificationManager = NotificationManager;
window.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
window.dismissNotification = dismissNotification;
window.clearAllNotifications = clearAllNotifications;
window.toggleNotificationPanel = toggleNotificationPanel;
window.updateNotificationUI = updateNotificationUI;

// Pricing
window.getMonthlyPrice = getMonthlyPrice;
window.getYearlyPrice = getYearlyPrice;
window.setMonthlyPrice = setMonthlyPrice;
window.setYearlyPrice = setYearlyPrice;
window.updateHomePrices = updateHomePrices;
window.adminUpdatePrices = adminUpdatePrices;
window.resetPrices = resetPrices;

console.log('✅ Wawe Journal script loaded!');
console.log('📦 requireAuth:', typeof window.requireAuth === 'function' ? '✅' : '❌');
console.log('🔑 sb:', window.sb ? '✅' : '❌');
console.log('🧹 sanitizeHTML:', typeof window.sanitizeHTML === 'function' ? '✅' : '❌');
console.log('🍞 showToast:', typeof window.showToast === 'function' ? '✅' : '❌');