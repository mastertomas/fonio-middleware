const notify = (() => {
  let confirmResolve = null;

  function ensureToastContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast-container';
      el.className = 'toast-container';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function iconFor(type) {
    if (type === 'success') return '✓';
    if (type === 'error') return '✕';
    return 'ℹ';
  }

  function toast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon" aria-hidden="true">${iconFor(type)}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="Close">×</button>
    `;

    const remove = () => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 200);
    };

    el.querySelector('.toast-close').addEventListener('click', remove);
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast-in'));

    const timer = setTimeout(remove, duration);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function getConfirmOverlay() {
    let overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'confirm-overlay';
      overlay.className = 'modal-overlay hidden';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h4 id="confirm-title" class="modal-title"></h4>
          <p id="confirm-message" class="modal-message"></p>
          <div class="modal-actions">
            <button type="button" id="confirm-cancel" class="btn ghost"></button>
            <button type="button" id="confirm-ok" class="btn primary"></button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#confirm-cancel').addEventListener('click', () => closeConfirm(false));
      overlay.querySelector('#confirm-ok').addEventListener('click', () => closeConfirm(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeConfirm(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
          closeConfirm(false);
        }
      });
    }
    return overlay;
  }

  function closeConfirm(result) {
    const overlay = document.getElementById('confirm-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    document.body.classList.remove('modal-open');
    if (confirmResolve) {
      confirmResolve(result);
      confirmResolve = null;
    }
  }

  function confirm(message, options = {}) {
    const overlay = getConfirmOverlay();
    const title = options.title || (typeof t === 'function' ? t('notify.confirmTitle') : 'Confirm');
    const okLabel = options.okLabel || (typeof t === 'function' ? t('common.confirm') : 'Confirm');
    const cancelLabel = options.cancelLabel || (typeof t === 'function' ? t('common.cancel') : 'Cancel');
    const danger = options.danger ?? false;

    overlay.querySelector('#confirm-title').textContent = title;
    overlay.querySelector('#confirm-message').textContent = message;
    const okBtn = overlay.querySelector('#confirm-ok');
    okBtn.textContent = okLabel;
    okBtn.className = danger ? 'btn danger' : 'btn primary';
    overlay.querySelector('#confirm-cancel').textContent = cancelLabel;

    overlay.classList.remove('hidden');
    document.body.classList.add('modal-open');
    okBtn.focus();

    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }

  return {
    success: (msg) => toast(msg, 'success'),
    error: (msg) => toast(msg, 'error', 6000),
    info: (msg) => toast(msg, 'info'),
    confirm,
  };
})();
