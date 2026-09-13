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
          client.from('trades').select('*', { count: 'exact', head: true }),
          client.from('user_profiles').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString()),
          client.from('trades').select('*', { count: 'exact', head: true })
            .gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
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

export async function uploadReferenceImage(file) {
  if (!file) return null;

  var fileExt = file.name.split('.').pop();
  var fileName = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
  var filePath = 'references/' + fileName;

  var { error: uploadError } = await sb.storage
    .from('references-images')
    .upload(filePath, file);

  if (uploadError) {
    showToast(i18n.t('toast.upload_error'), 'error');
    return null;
  }

  var { data: urlData } = sb.storage
    .from('references-images')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}

// ⭐ OPTİMİZE EDİLMİŞ REFERENCES
export async function loadReferencesToPage(containerId) {
  containerId = containerId || 'references-grid';
  var container = document.getElementById(containerId);
  if (!container) return;

  // ⭐ SADECE GEREKLİ KOLONLAR
  var client = window.sb || window.supabase || sb;
  var { data, error } = await client
    .from('references')
    .select('id, name, title, description, image_url, instagram, twitter, youtube, linkedin, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;">' + i18n.t('references.error') + '</p>';
    return;
  }

  if (!data || data.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);text-align:center;">' + i18n.t('references.empty') + '</p>';
    return;
  }

  container.innerHTML = data.map(function(ref) {
    return `
    <div class="reference-card">
      <div class="ref-image">
        <img src="${ref.image_url || 'https://placehold.co/100x100?text=Profile'}" alt="${escapeHtml(ref.name)}" onerror="this.src='https://placehold.co/100x100?text=Profile'">
      </div>
      <div class="ref-info">
        <h3>${escapeHtml(ref.name)}</h3>
        <p class="ref-title">${escapeHtml(ref.title || '')}</p>
        <p class="ref-desc">${escapeHtml(ref.description || '')}</p>
        <div class="ref-social">
          ${ref.instagram ? '<a href="' + ref.instagram + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><circle cx="12" cy="12" r="5"></circle><line x1="17" y1="7" x2="17.01" y2="7"></line></svg></a>' : ''}
          ${ref.twitter ? '<a href="' + ref.twitter + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path></svg></a>' : ''}
          ${ref.youtube ? '<a href="' + ref.youtube + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon></svg></a>' : ''}
          ${ref.linkedin ? '<a href="' + ref.linkedin + '" target="_blank" class="ref-social-link"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg></a>' : ''}
        </div>
      </div>
    </div>
  `}).join('');
}