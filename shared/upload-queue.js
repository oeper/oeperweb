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

let uploads = new Map(); // id -> { label, frac, error, done, cancelled, cancel }
let nextId = 1;
let widgetMounted = false;

function notify() { renderWidget(); }

export function getActiveUploads() {
  return [...uploads.values()].filter(u => !u.done);
}

// cancelFn (optional): called if the user hits the widget's cancel
// button — should actually stop the underlying request (e.g. xhr.abort()
// or an AbortController). Without one, that upload just has no cancel
// button — not every caller necessarily has an abort handle to offer.
export function beginUpload(label, cancelFn) {
  const id = nextId++;
  uploads.set(id, { label: label || 'file', frac: 0, error: null, done: false, cancelled: false, cancel: cancelFn || null });
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

// error.cancelled (set by the caller's abort/onabort handler) is shown
// distinctly from a real failure — muted "cancelled" instead of a red
// error, and clears from the widget quickly rather than lingering.
export function finishUpload(id, error) {
  const u = uploads.get(id);
  if (!u) return;
  u.done = true;
  u.cancelled = !!(error && error.cancelled);
  u.error = (error && !u.cancelled) ? (error.message || String(error)) : null;
  notify();
  setTimeout(() => { uploads.delete(id); notify(); }, u.cancelled ? 1200 : (error ? 5000 : 1600));
}

// Called from the widget's own cancel button, or by any caller that
// wants to cancel an upload programmatically. No-ops if this upload
// never registered a cancel handle, or has already finished.
export function cancelUpload(id) {
  const u = uploads.get(id);
  if (!u || u.done || !u.cancel) return;
  u.cancel();
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
    #oeUploadQueue .oe-uq-cancel {
      flex-shrink: 0; width: 20px; height: 20px; border: none; border-radius: 50%; background: none;
      color: inherit; opacity: 0.6; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
    }
    #oeUploadQueue .oe-uq-cancel:hover { opacity: 1; background: rgba(127,127,127,0.2); }
    #oeUploadQueue .oe-uq-cancel .material-symbols-rounded { font-size: 14px; color: inherit; }
    #oeUploadQueue .oe-uq-bar { height: 4px; border-radius: 100px; background: var(--md-sys-color-surface-variant, #2f353d); overflow: hidden; }
    #oeUploadQueue .oe-uq-bar-fill { height: 100%; width: 0%; background: var(--md-sys-color-primary, #a8c7fa); border-radius: 100px; transition: width 0.15s ease; }
    #oeUploadQueue .oe-uq-item.error .oe-uq-bar-fill { background: var(--md-sys-color-error, #ffb4ab); width: 100% !important; }
    #oeUploadQueue .oe-uq-item.error .material-symbols-rounded { color: var(--md-sys-color-error, #ffb4ab); }
    #oeUploadQueue .oe-uq-item.cancelled .oe-uq-bar-fill { background: var(--md-sys-color-on-surface-variant, #c4c7c5); }
    #oeUploadQueue .oe-uq-item.cancelled .oe-uq-label .material-symbols-rounded { color: var(--md-sys-color-on-surface-variant, #c4c7c5); }
  `;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'oeUploadQueue';
  document.body.appendChild(el);
}

// Updates each item's DOM node in place rather than rebuilding the whole
// widget's innerHTML on every call — this fires on every XHR progress
// tick (many times a second for a big file), and destroying/recreating
// the node each time was re-triggering its CSS entrance animation
// (.oe-uq-item's `animation: oeUqIn`) from scratch every tick, which is
// what "keeps flashing" was. Now a node is created once per upload id
// and only its text/fill-width get touched afterward.
function renderWidget() {
  const el = document.getElementById('oeUploadQueue');
  if (!el) return;
  const seen = new Set();
  for (const [id, u] of uploads.entries()) {
    seen.add(id);
    let item = el.querySelector(`[data-upload-id="${id}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'oe-uq-item';
      item.dataset.uploadId = String(id);
      item.innerHTML = `
        <div class="oe-uq-label">
          <span class="material-symbols-rounded"></span>
          <span class="oe-uq-text"></span>
          <button type="button" class="oe-uq-cancel" title="cancel upload"><span class="material-symbols-rounded">close</span></button>
        </div>
        <div class="oe-uq-bar"><div class="oe-uq-bar-fill"></div></div>
      `;
      item.querySelector('.oe-uq-cancel').addEventListener('click', () => cancelUpload(id));
      el.appendChild(item);
    }
    const pct = Math.round((u.frac || 0) * 100);
    const icon = u.error ? 'error' : (u.cancelled ? 'block' : (u.done ? 'check_circle' : 'cloud_upload'));
    const text = u.error ? `${u.label} — ${u.error}` : (u.cancelled ? `${u.label} — cancelled` : (u.done ? `${u.label} — done` : `${u.label} — ${pct}%`));
    const fillPct = u.error || u.cancelled || u.done ? 100 : pct;
    item.classList.toggle('error', !!u.error);
    item.classList.toggle('cancelled', !!u.cancelled);
    item.querySelector('.oe-uq-label > .material-symbols-rounded').textContent = icon;
    item.querySelector('.oe-uq-text').textContent = text;
    item.querySelector('.oe-uq-cancel').style.display = (u.done || !u.cancel) ? 'none' : '';
    item.querySelector('.oe-uq-bar-fill').style.width = fillPct + '%';
  }
  el.querySelectorAll('[data-upload-id]').forEach(item => {
    if (!seen.has(Number(item.dataset.uploadId))) item.remove();
  });
}
