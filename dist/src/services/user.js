// ============================================================
// WAWE JOURNAL - USER SERVICE (OPTİMİZE EDİLMİŞ)
// ============================================================

import { sb, requireAuth } from '../core/supabase.js';
import { FEATURES, STRATEGIES_CACHE_TTL } from '../core/config.js';
import { safeLocalStorageGet } from '../core/storage.js';
import { calcPnL } from '../utils/helpers.js';
import { showToast } from '../utils/ui.js';

// ⭐ PERFORMANS: Plan cache
var planCache = null;
var planCacheTime = 0;
var PLAN_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

// ── PLAN & PREMIUM ──────────────────────────────────────────

// ⭐ TEK FONKSİYON - silent parametresi ile
async function getUserPlanInternal(silent) {
  try {
    // Cache kontrolü
    var now = Date.now();
    if (planCache && (now - planCacheTime) < PLAN_CACHE_TTL) {
      return planCache;
    }
    
    var sessionData = await sb.auth.getSession();
    var session = sessionData && sessionData.data ? sessionData.data.session : null;
    
    if (!session) {
      var freeResult = { plan: 'free', features: FEATURES.free };
      planCache = freeResult;
      planCacheTime = now;
      return freeResult;
    }
    
    var { data, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', session.user.id)
      .single();
    
    if (error || !data || data.plan === 'free') {
      var freeResult2 = { plan: 'free', features: FEATURES.free };
      planCache = freeResult2;
      planCacheTime = now;
      return freeResult2;
    }
    
    if (data.plan === 'premium' && data.plan_expires_at) {
      var nowDate = new Date();
      var expires = new Date(data.plan_expires_at);
      
      if (isNaN(expires.getTime()) || nowDate > expires) {
        if (!silent) {
          showToast(i18n.t('premium.expired'), 'info');
        }
        var freeResult3 = { plan: 'free', features: FEATURES.free };
        planCache = freeResult3;
        planCacheTime = now;
        return freeResult3;
      }
    }
    
    if (data.plan !== 'premium') {
      var freeResult4 = { plan: 'free', features: FEATURES.free };
      planCache = freeResult4;
      planCacheTime = now;
      return freeResult4;
    }
    
    var premiumResult = { plan: data.plan, features: FEATURES.premium };
    planCache = premiumResult;
    planCacheTime = now;
    return premiumResult;
    
  } catch (error) {
    console.warn('getUserPlan hatası, free döndürülüyor:', error);
    var fallbackResult = { plan: 'free', features: FEATURES.free };
    planCache = fallbackResult;
    planCacheTime = Date.now();
    return fallbackResult;
  }
}

export async function getUserPlan() {
  return getUserPlanInternal(false);
}

export async function getUserPlanSilent() {
  return getUserPlanInternal(true);
}

export async function isPremium() {
  var { plan } = await getUserPlan();
  return plan === 'premium';
}

export async function hasFeature(featureName) {
  var { features } = await getUserPlan();
  return features[featureName] === true;
}

export async function requirePremium() {
  try {
    var user = await requireAuth();
    if (!user) return null;
    
    var { plan } = await getUserPlan();
    if (plan !== 'premium') {
      showToast('💎 Bu özellik sadece Premium üyelere özeldir!', 'error');
      window.location.href = 'settings.html#panel-plan';
      return null;
    }
    
    return user;
  } catch (error) {
    console.error('requirePremium hatası:', error);
    showToast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error');
    window.location.href = 'settings.html';
    return null;
  }
}

// ── STRATEJİ YÖNETİMİ ──────────────────────────────────────

var strategiesCache = null;
var strategiesCacheTime = 0;

export async function getUserStrategies(forceRefresh) {
  forceRefresh = forceRefresh || false;
  var user = await requireAuth();
  if (!user) return [];
  
  var now = Date.now();
  if (!forceRefresh && strategiesCache && (now - strategiesCacheTime) < STRATEGIES_CACHE_TTL) {
    return strategiesCache;
  }
  
  // ⭐ SADECE GEREKLİ KOLONLAR
  var { data, error } = await sb
    .from('strategies')
    .select('id, name, description, color, user_id, is_active, created_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name', { ascending: true });
  
  if (error) {
    return strategiesCache || [];
  }
  
  strategiesCache = data || [];
  strategiesCacheTime = now;
  return strategiesCache;
}

export function clearStrategiesCache() {
  strategiesCache = null;
  strategiesCacheTime = 0;
}

export async function addStrategy(name, description, color) {
  color = color || '#7c6dfa';
  var user = await requireAuth();
  if (!user) return null;
  
  if (!name || name.trim() === '') {
    showToast(i18n.t('strategies.error_name_required'), 'error');
    return null;
  }
  
  var { data, error } = await sb
    .from('strategies')
    .insert([{
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      color: color,
      is_active: true
    }])
    .select()
    .single();
  
  if (error) {
    showToast(i18n.t('strategies.error_add') + error.message, 'error');
    return null;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.added'));
  return data;
}

export async function deleteStrategy(strategyId) {
  var { error } = await sb
    .from('strategies')
    .delete()
    .eq('id', strategyId);
  
  if (error) {
    showToast(i18n.t('strategies.error_delete') + error.message, 'error');
    return false;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.deleted'));
  return true;
}

export async function updateStrategy(strategyId, updates) {
  var { error } = await sb
    .from('strategies')
    .update(updates)
    .eq('id', strategyId);
  
  if (error) {
    showToast(i18n.t('strategies.error_update') + error.message, 'error');
    return false;
  }
  
  clearStrategiesCache();
  showToast(i18n.t('strategies.updated'));
  return true;
}

export function calculateStrategyPerformance(trades, strategyId) {
  var strategyTrades = trades.filter(function(t) { 
    return t.strategy_id === strategyId && t.exit_price; 
  });
  if (strategyTrades.length === 0) return null;
  
  var totalPnL = 0;
  var wins = 0;
  var losses = 0;
  
  strategyTrades.forEach(function(t) {
    var mult = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
    var pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', mult);
    totalPnL += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  });
  
  var total = strategyTrades.length;
  var winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
  
  return {
    totalTrades: total,
    wins: wins,
    losses: losses,
    totalPnL: totalPnL,
    winRate: parseFloat(winRate),
    avgPnL: total > 0 ? totalPnL / total : 0
  };
}

export async function getStrategiesMap() {
  var strategies = await getUserStrategies();
  var map = {};
  strategies.forEach(function(s) { map[s.id] = s.name; });
  return map;
}