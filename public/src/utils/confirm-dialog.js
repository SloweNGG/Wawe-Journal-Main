export function confirmDialog(options) {
  // Varsayılan seçenekler
  const opts = {
    title: '',
    titleKey: '',
    message: '',
    messageKey: '',
    params: {},
    confirmText: '',
    confirmKey: 'common.confirm',
    cancelText: '',
    cancelKey: 'common.cancel',
    variant: 'primary', // 'danger', 'warning', 'info', 'primary'
    icon: 'help-circle',
    onConfirm: () => {},
    onCancel: () => {},
    ...options
  };

  // Metinleri çözümle (i18n varsa kullan, yoksa fallback)
  const resolveText = (key, fallbackText, params) => {
    if (key && window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key, params) || fallbackText || key;
    }
    return fallbackText || key;
  };

  const finalTitle = resolveText(opts.titleKey, opts.title, opts.params);
  const finalMessage = resolveText(opts.messageKey, opts.message, opts.params);
  const finalConfirmText = resolveText(opts.confirmKey, opts.confirmText, opts.params) || 'Confirm';
  const finalCancelText = resolveText(opts.cancelKey, opts.cancelText, opts.params) || 'Cancel';

  // Modal elementini oluştur
  const modal = document.createElement('div');
  modal.className = `confirm-modal ${opts.variant}`;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  modal.innerHTML = `
    <div class="confirm-modal-box">
      <div class="confirm-modal-header">
        <div class="icon-wrap">
          <i data-lucide="${opts.icon}"></i>
        </div>
        <h3>${finalTitle}</h3>
      </div>
      <div class="confirm-modal-body">
        <p>${finalMessage}</p>
      </div>
      <div class="confirm-modal-footer">
        <button class="btn-modal-cancel" id="cd-cancel-btn">${finalCancelText}</button>
        <button class="btn-modal-confirm" id="cd-confirm-btn">${finalConfirmText}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // İkonları oluştur
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: modal });
  }

  // Ref'leri al
  const cancelBtn = modal.querySelector('#cd-cancel-btn');
  const confirmBtn = modal.querySelector('#cd-confirm-btn');

  // Kapama fonksiyonu
  const close = () => {
    modal.classList.remove('active');
    setTimeout(() => {
      if (document.body.contains(modal)) {
        document.body.removeChild(modal);
      }
    }, 200);
    window.removeEventListener('keydown', handleKeydown);
  };

  // Event listener'lar
  cancelBtn.addEventListener('click', () => {
    if (typeof opts.onCancel === 'function') opts.onCancel();
    close();
  });

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    const originalText = confirmBtn.textContent;
    // Loading state
    confirmBtn.innerHTML = `<i data-lucide="loader" class="spin" style="width: 14px; height: 14px; margin-right: 6px; animation: spin 1s linear infinite;"></i> ${originalText}`;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: confirmBtn });
    }

    try {
      if (typeof opts.onConfirm === 'function') {
        const result = opts.onConfirm();
        if (result instanceof Promise) {
          await result;
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      close();
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (typeof opts.onCancel === 'function') opts.onCancel();
      close();
    }
  });

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      if (typeof opts.onCancel === 'function') opts.onCancel();
      close();
    }
    // Basit focus trap
    if (e.key === 'Tab') {
      const focusable = [cancelBtn, confirmBtn];
      if (e.shiftKey && document.activeElement === focusable[0]) {
        e.preventDefault();
        focusable[1].focus();
      } else if (!e.shiftKey && document.activeElement === focusable[1]) {
        e.preventDefault();
        focusable[0].focus();
      }
    }
  };
  window.addEventListener('keydown', handleKeydown);

  // Animasyonla aç
  requestAnimationFrame(() => {
    modal.classList.add('active');
    cancelBtn.focus();
  });
}

// Global window objesine bağla
window.confirmDialog = confirmDialog;
