// ============================================================
// WAWE JOURNAL - USER SERVICE
// ============================================================

import { sb, requireAuth } from '../core/supabase.js';
import { FEATURES, STRATEGIES_CACHE_TTL } from '../core/config.js';
import { safeLocalStorageGet } from '../core/storage.js';
import { calcPnL } from '../utils/helpers.js';
import { showToast } from '../utils/ui.js';

// ── PLAN & PREMIUM ──────────────────────────────────────────
export async function getUserPlan() {
  try {
    const user = await requireAuth();
    if (!user) return { plan: 'free', features: FEATURES.free };
    
    const { data, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();
    
    if (error || !data || data.plan === 'free') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    if (data.plan === 'premium' && data.plan_expires_at) {
      const now = new Date();
      const expires = new Date(data.plan_expires_at);
      
      if (isNaN(expires.getTime()) || now > expires) {
        showToast(i18n.t('premium.expired'), 'info');
        return { plan: 'free', features: FEATURES.free };
      }
    }
    
    if (data.plan !== 'premium') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    return { plan: data.plan, features: FEATURES.premium };
    
  } catch (error) {
    wwLog.warn('getUserPlan hatası, free döndürülüyor:', error);
    return { plan: 'free', features: FEATURES.free };
  }
}

export async function getUserPlanSilent() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return { plan: 'free', features: FEATURES.free };
    
    const { data, error } = await sb
      .from('user_profiles')
      .select('plan, plan_expires_at')
      .eq('id', session.user.id)
      .single();
    
    if (error || !data || data.plan === 'free') {
      return { plan: 'free', features: FEATURES.free };
    }
    
    if (data.plan === 'premium' && data.plan_expires_at) {
      const now = new Date();
      const expires = new Date(data.plan_expires_at);
      
      if (isNaN(expires.getTime()) || now > expires) {
        return { plan: 'free', features: FEATURES.free };
      }
    }
    
    return { plan: data.plan || 'free', features: data.plan === 'premium' ? FEATURES.premium : FEATURES.free };
  } catch (error) {
    return { plan: 'free', features: FEATURES.free };
  }
}

export async function isPremium() {
  const { plan } = await getUserPlan();
  return plan === 'premium';
}

export async function hasFeature(featureName) {
  const { features } = await getUserPlan();
  return features[featureName] === true;
}

export async function requirePremium() {
  try {
    const user = await requireAuth();
    if (!user) return null;
    
    const { plan } = await getUserPlan();
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
let strategiesCache = null;
let strategiesCacheTime = 0;

export async function getUserStrategies(forceRefresh) {
  forceRefresh = forceRefresh || false;
  const user = await requireAuth();
  if (!user) return [];
  
  const now = Date.now();
  if (!forceRefresh && strategiesCache && (now - strategiesCacheTime) < STRATEGIES_CACHE_TTL) {
    return strategiesCache;
  }
  
  const { data, error } = await sb
    .from('strategies')
    .select('*')
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
  const user = await requireAuth();
  if (!user) return null;
  
  if (!name || name.trim() === '') {
    showToast(i18n.t('strategies.error_name_required'), 'error');
    return null;
  }
  
  const { data, error } = await sb
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
  const { error } = await sb
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
  const { error } = await sb
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
  const strategyTrades = trades.filter(function(t) { 
    return t.strategy_id === strategyId && t.exit_price; 
  });
  if (strategyTrades.length === 0) return null;
  
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  
  strategyTrades.forEach(function(t) {
    const mult = t.multiplier || INSTRUMENT_MULTIPLIERS[t.instrument] || 100000;
    const pnl = calcPnL(t.entry_price, t.exit_price, t.lot, t.direction, 'other', mult);
    totalPnL += pnl;
    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  });
  
  const total = strategyTrades.length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : 0;
  
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
  const strategies = await getUserStrategies();
  const map = {};
  strategies.forEach(function(s) { map[s.id] = s.name; });
  return map;
}