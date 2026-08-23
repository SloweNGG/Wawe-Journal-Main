// ============================================================
// WAWE JOURNAL - STATS SERVICE
// ============================================================

import { sb } from '../core/supabase.js';
import { escapeHtml } from '../utils/helpers.js';
import { showToast } from '../utils/ui.js';

export async function loadPlatformStats() {
  try {
    const { data: totalUsers, error: e1 } = await sb.rpc('get_total_users_count');
    const { data: totalTrades, error: e2 } = await sb.rpc('get_total_trades_count');
    const { data: todayUsers, error: e3 } = await sb.rpc('get_today_users_count');
    const { data: todayTrades, error: e4 } = await sb.rpc('get_today_trades_count');

    const totalUsersEl = document.getElementById('stat-total-users');
    const totalTradesEl = document.getElementById('stat-total-trades');
    const todayUsersEl = document.getElementById('stat-today-users');
    const todayTradesEl = document.getElementById('stat-today-trades');
    
    if (totalUsersEl) totalUsersEl.textContent = totalUsers ?? 0;
    if (totalTradesEl) totalTradesEl.textContent = totalTrades ?? 0;
    if (todayUsersEl) todayUsersEl.textContent = todayUsers ?? 0;
    if (todayTradesEl) todayTradesEl.textContent = todayTrades ?? 0;
  } catch(e) {
    const totalUsersEl = document.getElementById('stat-total-users');
    const totalTradesEl = document.getElementById('stat-total-trades');
    const todayUsersEl = document.getElementById('stat-today-users');
    const todayTradesEl = document.getElementById('stat-today-trades');
    if (totalUsersEl) totalUsersEl.textContent = '0';
    if (totalTradesEl) totalTradesEl.textContent = '0';
    if (todayUsersEl) todayUsersEl.textContent = '0';
    if (todayTradesEl) todayTradesEl.textContent = '0';
  }
}

export async function uploadReferenceImage(file) {
  if (!file) return null;
  
  const fileExt = file.name.split('.').pop();
  const fileName = Date.now() + '_' + Math.random().toString(36).substring(7) + '.' + fileExt;
  const filePath = 'references/' + fileName;
  
  const { error: uploadError } = await sb.storage
    .from('references-images')
    .upload(filePath, file);
  
  if (uploadError) {
    showToast(i18n.t('toast.upload_error'), 'error');
    return null;
  }
  
  const { data: urlData } = sb.storage
    .from('references-images')
    .getPublicUrl(filePath);
  
  return urlData.publicUrl;
}

export async function loadReferencesToPage(containerId) {
  containerId = containerId || 'references-grid';
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const { data, error } = await sb
    .from('references')
    .select('*')
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