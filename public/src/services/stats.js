// ============================================================
// WAWE JOURNAL - STATS SERVICE (OPTİMİZE EDİLMİŞ)
// ⭐ FIX: loadPlatformStats() artık RPC (get_platform_stats) kullanıyor
//    Sebep: RLS policy'si anon kullanıcıların user_profiles / trades
//    tablolarına SELECT atmasını engelliyordu. Aggregate count'ları
//    anon kullanıcıya göstermek için SECURITY DEFINER RPC gerekiyor.
// ============================================================

import { sb } from '../core/supabase.js';
import { escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/ui.js';

// ⭐ PERFORMANS: Stats cache
var statsCache = null;
var statsCacheTime = 0;
var STATS_CACHE_TTL = 5 * 60 * 1000; // 5 dakika

export async function loadPlatformStats() {
  try {
    // Cache kontrolü
    var now = Date.now();
    if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL) {
      updateStatsUI(statsCache);
      return;
    }

    // ⭐ RPC çağrısı — anon kullanıcı da çağırabilir (SECURITY DEFINER)
    var client = window.sb || window.supabase || sb;
    if (!client) {
      wwLog.warn('loadPlatformStats: sb client yok');
      updateStatsUI({ totalUsers: 0, totalTrades: 0, todayUsers: 0, todayTrades: 0 });
      return;
    }

    var { data, error } = await client.rpc('get_platform_stats');

    if (error) {
      wwLog.warn('loadPlatformStats RPC hatası:', error);

      // ⭐ FALLBACK: RPC yoksa (migration uygulanmadıysa) eski usül dene.
      // Anon için 0 dönebilir; bu yüzden asıl çözüm migration.
      try {
        var [totalUsersResult, totalTradesResult, todayUsersResult, todayTradesResult] = await Promise.all([
          client.from('user_profiles').select('*', { count: 'exact', head: true }),
          // Backtest işlemleri platform sayaçlarına girmez (SQL: get_platform_stats, Migration 05)
          window.WwTrades.applyScope(client.from('trades').select('*', { count: 'exact', head: true }), 'live'),
          client.from('user_profiles').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
          window.WwTrades.applyScope(client.from('trades').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()), 'live')
        ]);

        var fallbackStats = {
          totalUsers: totalUsersResult.count || 0,
          totalTrades: totalTradesResult.count || 0,
          todayUsers: todayUsersResult.count || 0,
          todayTrades: todayTradesResult.count || 0
        };

        statsCache = fallbackStats;
        statsCacheTime = now;
        updateStatsUI(fallbackStats);
        return;
      } catch (fallbackErr) {
        wwLog.warn('loadPlatformStats fallback de başarısız:', fallbackErr);
        updateStatsUI({ totalUsers: 0, totalTrades: 0, todayUsers: 0, todayTrades: 0 });
        return;
      }
    }

    var stats = {
      totalUsers:   (data && data.totalUsers)   || 0,
      totalTrades:  (data && data.totalTrades)  || 0,
      todayUsers:   (data && data.todayUsers)   || 0,
      todayTrades:  (data && data.todayTrades)  || 0
    };

    statsCache = stats;
    statsCacheTime = now;
    updateStatsUI(stats);

  } catch (e) {
    wwLog.warn('loadPlatformStats hatası:', e);
    updateStatsUI({ totalUsers: 0, totalTrades: 0, todayUsers: 0, todayTrades: 0 });
  }
}

function updateStatsUI(stats) {
  var totalUsersEl = document.getElementById('stat-total-users');
  var totalTradesEl = document.getElementById('stat-total-trades');
  var todayUsersEl = document.getElementById('stat-today-users');
  var todayTradesEl = document.getElementById('stat-today-trades');

  if (totalUsersEl) totalUsersEl.textContent = stats.totalUsers || 0;
  if (totalTradesEl) totalTradesEl.textContent = stats.totalTrades || 0;
  if (todayUsersEl) todayUsersEl.textContent = stats.todayUsers || 0;
  if (todayTradesEl) todayTradesEl.textContent = stats.todayTrades || 0;
}

