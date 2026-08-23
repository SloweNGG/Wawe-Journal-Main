// ============================================================
// WAWE JOURNAL - UI HELPERS
// ============================================================

export function showToast(message, type) {
  type = type || 'success';
  try {
    const old = document.querySelector('.ww-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'ww-toast ww-toast--' + type;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function() {
      t.classList.add('ww-toast--visible');
    });
    setTimeout(function() {
      t.classList.remove('ww-toast--visible');
      setTimeout(function() { t.remove(); }, 400);
    }, 3200);
  } catch (e) {}
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