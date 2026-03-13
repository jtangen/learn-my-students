// ═══════════════════════════════════
// UI Helpers — shared utilities
// ═══════════════════════════════════

// Track active object URLs for cleanup
let activePhotoURLs = new Set();

/** HTML-escape a string */
export function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

/** Switch to a screen by name (e.g. 'setup', 'quiz', 'progress', 'settings', 'summary') */
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(name + 'Screen');
  if (el) el.classList.add('active');
  window.location.hash = '#/' + name;
}

/** Show loading overlay */
export function showLoading(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const text = document.getElementById('loadingText');
  if (text) text.textContent = message;
  if (overlay) overlay.classList.add('active');
}

/** Hide loading overlay */
export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

/** Show a toast notification */
export function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast if any
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Create an img element from a Blob, managing object URL lifecycle */
export function createPhotoElement(blob, alt = 'Student photo') {
  const url = URL.createObjectURL(blob);
  activePhotoURLs.add(url);
  const img = document.createElement('img');
  img.src = url;
  img.alt = alt;
  return img;
}

/** Revoke a specific object URL */
export function revokePhotoURL(url) {
  if (activePhotoURLs.has(url)) {
    URL.revokeObjectURL(url);
    activePhotoURLs.delete(url);
  }
}

/** Revoke all active photo object URLs */
export function revokeAllPhotoURLs() {
  for (const url of activePhotoURLs) {
    URL.revokeObjectURL(url);
  }
  activePhotoURLs.clear();
}

/** Trigger card entry animation */
export function animateCard(cardEl) {
  if (!cardEl) return;
  cardEl.style.animation = 'none';
  cardEl.offsetHeight; // trigger reflow
  cardEl.style.animation = '';
}

/** Format a delta value as "+7%" or "-3%" */
export function formatDelta(current, previous) {
  if (previous === 0 || previous == null) return '';
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta > 0) return `+${delta}%`;
  if (delta < 0) return `${delta}%`;
  return '0%';
}

/** Promise-based confirm dialog */
export function confirmDialog(message) {
  return new Promise(resolve => {
    // Use a custom modal if available, otherwise browser confirm
    const modal = document.getElementById('confirmModal');
    if (modal) {
      const msgEl = modal.querySelector('.confirm-message');
      const yesBtn = modal.querySelector('.confirm-yes');
      const noBtn = modal.querySelector('.confirm-no');
      if (msgEl) msgEl.textContent = message;
      modal.classList.add('active');

      const cleanup = (result) => {
        modal.classList.remove('active');
        yesBtn.removeEventListener('click', onYes);
        noBtn.removeEventListener('click', onNo);
        resolve(result);
      };
      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);
      yesBtn.addEventListener('click', onYes);
      noBtn.addEventListener('click', onNo);
    } else {
      resolve(confirm(message));
    }
  });
}

/** Device detection */
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isMobile = isIOS || /Android/i.test(navigator.userAgent);

/** Render a circular progress ring (SVG) */
export function renderProgressRing(current, target, size = 48) {
  const pct = Math.min(1, current / target);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = pct >= 1 ? 'var(--green)' : 'var(--purple)';

  return `<svg width="${size}" height="${size}" class="progress-ring">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#e8e0ef" stroke-width="4"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="4"
      stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"
      style="transition: stroke-dashoffset 0.6s ease"/>
  </svg>`;
}
