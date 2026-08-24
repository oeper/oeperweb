// Site-wide upload tracker + floating status widget. shared/account.js's
// uploadFile() reports into this automatically, so every authenticated
// upload (video, post image, DM attachment, voice message, avatar, files
// tool) shows up here for free. Anonymous upload paths that bypass
// uploadFile() (files.html's anon uploader, ai.html's image attach) call
// beginUpload/updateUpload/finishUpload directly.
//
// The point: an upload should survive its triggering modal/form closing,
// so the page doesn't have to stay blocked/open until it finishes. A
// real file upload can't survive a full page reload or tab close (the
// browser aborts in-flight requests on unload) — that's a hard platform
// limit, not something this module works around — so a beforeunload
// prompt warns if the user tries to leave mid-upload instead.
//
// Whenever this file's exports change, bump the `?v=N` on every
// `from './shared/upload-queue.js?v=N'` import across the site (grep for it).

let uploads = new Map(); // id -> { label, frac, error, done }
let nextId = 1;
let widgetMounted = false;

function notify() { renderWidget(); }

export function getActiveUploads() {
  return [...uploads.values()].filter(u => !u.done);
}

export function beginUpload(label) {
  const id = nextId++;
  uploads.set(id, { label: label || 'file', frac: 0, error: null, done: false });
  ensureWidget();
  notify();
  return id;
}

export function updateUpload(id, frac) {
  const u = uploads.get(id);
  if (!u) return;
  u.frac = frac;
  notify();
}

export function finishUpload(id, error) {
  const u = uploads.get(id);
  if (!u) return;
  u.done = true;
  u.error = error ? (error.message || String(error)) : null;
  notify();
  setTimeout(() => { uploads.delete(id); notify(); }, error ? 5000 : 1600);
}

window.addEventListener('beforeunload', e => {
  if (getActiveUploads().length > 0) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── Floating widget ──────────────────────────────────────────────
function ensureWidget() {
  if (widgetMounted) return;
  widgetMounted = true;
  const style = document.createElement('style');
  style.textContent = `
    #oeUploadQueue {
      position: fixed; right: 16px; bottom: 16px; z-index: 900;
      display: flex; flex-direction: column-reverse; gap: 8px; align-items: flex-end;
      pointer-events: none;
    }
    #oeUploadQueue .oe-uq-item {
      pointer-events: auto;
      width: 260px; max-width: calc(100vw - 32px);
      background: var(--md-sys-color-surface, #1a1c22);
      border: 1px solid var(--md-sys-color-outline, #43474e);
      border-radius: 16px; padding: 12px 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      font-family: var(--oe-font-override, 'Google Sans', 'Roboto Flex', sans-serif);
      font-size: 13px; color: var(--md-sys-color-on-surface, #e2e2e6);
      animation: oeUqIn 0.18s ease;
    }
    @keyframes oeUqIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    #oeUploadQueue .oe-uq-label { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    #oeUploadQueue .oe-uq-label .material-symbols-rounded { font-size: 16px; color: var(--md-sys-color-primary, #a8c7fa); flex-shrink: 0; }
    #oeUploadQueue .oe-uq-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #oeUploadQueue .oe-uq-bar { height: 4px; border-radius: 100px; background: var(--md-sys-color-surface-variant, #2f353d); overflow: hidden; }
    #oeUploadQueue .oe-uq-bar-fill { height: 100%; width: 0%; background: var(--md-sys-color-primary, #a8c7fa); border-radius: 100px; transition: width 0.15s ease; }
    #oeUploadQueue .oe-uq-item.error .oe-uq-bar-fill { background: var(--md-sys-color-error, #ffb4ab); width: 100% !important; }
    #oeUploadQueue .oe-uq-item.error .material-symbols-rounded { color: var(--md-sys-color-error, #ffb4ab); }
  `;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'oeUploadQueue';
  document.body.appendChild(el);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderWidget() {
  const el = document.getElementById('oeUploadQueue');
  if (!el) return;
  el.innerHTML = [...uploads.entries()].map(([, u]) => {
    const pct = Math.round((u.frac || 0) * 100);
    const icon = u.error ? 'error' : (u.done ? 'check_circle' : 'cloud_upload');
    const text = u.error ? `${u.label} — ${u.error}` : (u.done ? `${u.label} — done` : `${u.label} — ${pct}%`);
    const fillPct = u.error || u.done ? 100 : pct;
    return `<div class="oe-uq-item ${u.error ? 'error' : ''}">
      <div class="oe-uq-label"><span class="material-symbols-rounded">${icon}</span><span class="oe-uq-text">${escapeHtml(text)}</span></div>
      <div class="oe-uq-bar"><div class="oe-uq-bar-fill" style="width:${fillPct}%"></div></div>
    </div>`;
  }).join('');
}
