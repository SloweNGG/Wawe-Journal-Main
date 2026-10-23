// ============================================================
// WAWE JOURNAL - CONFIG
// ============================================================

export const INSTRUMENT_MULTIPLIERS = {
  forex: 100000,
  gold: 100,
  index: 10,
  crypto: 1,
  other: 1
};

export const FEATURES = {
  free: {
    label: '🆓 Free',
    maxTrades: Infinity,
    maxStrategies: Infinity,
    analyticsDashboard: false,
    dragDropPanels: false,
    advancedCharts: false,
    themeCustomization: false,
    detailedPdf: false,
    advancedOvertrade: false,
    multiCurrency: false,
    lightTheme: false,
    prioritySupport: false,
    noAds: false,
    infiniteStorage: false,
    community: false,
    calendar: true,
    monthlyGoal: true,
    strategyComparison: true,
    csvImport: true,
    basicPdf: true,
    multiLanguage: true,
    basicOvertrade: true,
    trades: true,
    strategies: true,
    basicCharts: true
  },
  premium: {
    label: '💎 Pro',
    maxTrades: Infinity,
    maxStrategies: Infinity,
    analyticsDashboard: true,
    dragDropPanels: true,
    advancedCharts: true,
    themeCustomization: true,
    detailedPdf: true,
    advancedOvertrade: true,
    multiCurrency: true,
    lightTheme: true,
    prioritySupport: true,
    noAds: true,
    infiniteStorage: true,
    community: true,
    calendar: true,
    monthlyGoal: true,
    strategyComparison: true,
    csvImport: true,
    basicPdf: true,
    multiLanguage: true,
    basicOvertrade: true,
    trades: true,
    strategies: true,
    basicCharts: true
  }
};

export const NOTIFICATION_TYPES = {
  OVERTRADE_WARNING: 'overtrade_warning',
  OVERTRADE_CRITICAL: 'overtrade_critical',
  PRO_EXPIRING: 'premium_expiring',
  PRO_EXPIRED: 'premium_expired',
  PRO_UPGRADED: 'premium_upgraded',
  SYSTEM: 'system'
};

export const ACTIVE_THROTTLE_MS = 5 * 60 * 1000;
export const STRATEGIES_CACHE_TTL = 5 * 60 * 1000;
export const NOTIFICATION_STORAGE_KEY = 'ww_notifications';
export const OT_STORAGE_KEY = 'ww_overtrade_settings';
export const OT_DISMISSED_KEY = 'ww_overtrade_dismissed_v2';