// ============================================================
// WAWE JOURNAL - UI HELPERS
// ============================================================

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{200D}\u{FE0F}]/gu;

const LUCIDE_ICONS = {
  success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
  error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>',
  warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-triangle"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
  info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
};

const LUCIDE_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

export function showToast(message, type) {
  type = type ? String(type).toLowerCase() : 'success';
  if (!LUCIDE_ICONS[type]) type = 'success';

  try {
    let rawText = '';
    if (message === null || message === undefined) {
      rawText = '';
    } else if (typeof message === 'object') {
      if (typeof message.message === 'string') rawText = message.message;
      else if (typeof message.error === 'string') rawText = message.error;
      else {
        try { rawText = JSON.stringify(message); } catch(_) { rawText = String(message); }
      }
    } else {
      rawText = String(message);
    }

    // Strip all emojis from message text (use Lucide icons instead)
    let cleanText = rawText.replace(EMOJI_REGEX, '').trim();
    if (!cleanText) {
      cleanText = type === 'error' ? 'Bir hata oluştu.' : 'İşlem tamamlandı.';
    }

    let container = document.getElementById('ww-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ww-toast-container';
      container.className = 'ww-toast-container';
      document.body.appendChild(container);
    }

    const t = document.createElement('div');
    t.className = 'ww-toast ww-toast--' + type;
    t.setAttribute('role', 'alert');
    t.innerHTML = `
      <span class="ww-toast-icon">${LUCIDE_ICONS[type]}</span>
      <span class="ww-toast-message"></span>
      <button type="button" class="ww-toast-close" aria-label="Kapat">${LUCIDE_CLOSE_ICON}</button>
    `;

    const msgSpan = t.querySelector('.ww-toast-message');
    if (msgSpan) msgSpan.textContent = cleanText;

    const closeBtn = t.querySelector('.ww-toast-close');
    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      t.classList.remove('ww-toast--visible');
      setTimeout(() => { try { t.remove(); } catch(_) {} }, 300);
    };

    if (closeBtn) closeBtn.onclick = dismiss;

    container.appendChild(t);
    requestAnimationFrame(() => {
      t.classList.add('ww-toast--visible');
    });

    timer = setTimeout(dismiss, 3500);
  } catch (e) {
    console.error('[showToast] Error displaying toast:', e);
  }
}

export function destroyChart(id) {
  const existing = Chart.getChart(id);
  if (existing) existing.destroy();
}

export function directionBadge(direction) {
  if (!direction) return '';
  const up = direction.toUpperCase() === 'LONG' || direction.toUpperCase() === 'BUY';
  return up
    ? `<span class="badge badge-long">${direction.toUpperCase()}</span>`
    : `<span class="badge badge-short">${direction.toUpperCase()}</span>`;
}

export function fixDecimalInput(el) {
  el.addEventListener('input', () => {
    const pos = el.selectionStart;
    el.value = el.value.replace(',', '.');
    try { el.setSelectionRange(pos, pos); } catch(_) {}
  });
}

export function applyDecimalFix(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) fixDecimalInput(el);
  });
}