// Themed replacements for the browser's native confirm()/alert()/prompt()
// dialogs — those render as unstyled OS chrome (a title bar showing the raw
// domain, system font, no theming at all) that clashes with the rest of
// the site. Each function returns a Promise resolving the same shape the
// native version would give you, so call sites just add `await` in front
// of the old call and otherwise don't change.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/dialog.js?v=N'` import across the site (grep for it) —
// otherwise visitors can sit on a stale cached copy for hours after a deploy.

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-dialog-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 500;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
    }
    .oe-dialog-overlay.open { opacity: 1; pointer-events: all; }
    .oe-dialog-box {
      background: var(--md-sys-color-surface); border-radius: 24px; padding: 24px; width: min(360px, 100%);
      transform: scale(0.96); transition: transform 0.15s;
      font-family: var(--oe-font-override, 'Google Sans', 'Roboto Flex', sans-serif);
      color: var(--md-sys-color-on-surface); box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    }
    .oe-dialog-overlay.open .oe-dialog-box { transform: scale(1); }
    .oe-dialog-message { font-size: 14px; line-height: 1.5; margin-bottom: 18px; white-space: pre-wrap; }
    .oe-dialog-input {
      width: 100%; background: var(--md-sys-color-surface-variant); border: none;
      border-radius: 12px; padding: 10px 14px; color: var(--md-sys-color-on-surface); font-size: 14px;
      font-family: inherit; outline: none; margin-bottom: 18px; box-sizing: border-box;
    }
    .oe-dialog-input:focus { box-shadow: 0 0 0 2px var(--md-sys-color-primary); }
    .oe-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
    .oe-dialog-btn {
      border: none; border-radius: 100px; padding: 9px 20px; font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: inherit; background: transparent; color: var(--md-sys-color-on-surface-variant);
    }
    .oe-dialog-btn:hover { background: var(--md-sys-state-hover); }
    .oe-dialog-btn.primary { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
    .oe-dialog-btn.primary:hover { opacity: 0.9; }
    .oe-dialog-btn.danger-primary { background: var(--md-sys-color-error); color: var(--md-sys-color-on-error, #690005); }
    .oe-dialog-btn.danger-primary:hover { opacity: 0.9; }

    .oe-dialog-box.report { width: min(400px, 100%); }
    .oe-dialog-title { font-size: 17px; font-weight: 500; margin-bottom: 4px; }
    .oe-dialog-subtitle { font-size: 13px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 16px; line-height: 1.4; }
    .oe-dialog-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 8px; }
    .oe-report-categories { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .oe-report-category {
      border: none; border-radius: 100px; padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
      font-family: inherit; background: var(--md-sys-color-surface-variant); color: var(--md-sys-color-on-surface-variant);
    }
    .oe-report-category:hover { background: var(--md-sys-state-hover); }
    .oe-report-category.selected { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
    .oe-dialog-textarea {
      width: 100%; background: var(--md-sys-color-surface-variant); border: none; resize: vertical; min-height: 72px;
      border-radius: 12px; padding: 10px 14px; color: var(--md-sys-color-on-surface); font-size: 14px;
      font-family: inherit; outline: none; margin-bottom: 6px; box-sizing: border-box;
    }
    .oe-dialog-textarea:focus { box-shadow: 0 0 0 2px var(--md-sys-color-primary); }
    .oe-dialog-hint { font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 16px; }
    .oe-dialog-hint.error { color: var(--md-sys-color-error); }
  `;
  document.head.appendChild(style);
}

function showDialog({ message, input, buttons, cancelValue }) {
  injectStyles();
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'oe-dialog-overlay';
    overlay.innerHTML = `
      <div class="oe-dialog-box">
        <div class="oe-dialog-message"></div>
        ${input ? `<input class="oe-dialog-input" type="text">` : ''}
        <div class="oe-dialog-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.oe-dialog-message').textContent = message || '';
    const inputEl = overlay.querySelector('.oe-dialog-input');
    if (input) {
      inputEl.value = input.defaultValue || '';
      inputEl.placeholder = input.placeholder || '';
      if (input.maxLength) inputEl.maxLength = input.maxLength;
    }
    const actionsEl = overlay.querySelector('.oe-dialog-actions');

    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    }
    function onKeydown(e) {
      if (e.key === 'Escape') close(cancelValue);
      else if (e.key === 'Enter' && input) close(inputEl.value);
    }

    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'oe-dialog-btn' + (b.primary ? ' primary' : '') + (b.dangerPrimary ? ' danger-primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => close(input && b.useInputValue ? inputEl.value : b.value));
      actionsEl.appendChild(btn);
    });

    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(cancelValue); });
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      if (input) { inputEl.focus(); inputEl.select(); }
      else { const p = actionsEl.querySelector('.primary'); if (p) p.focus(); }
    });
  });
}

// Drop-in async replacement for alert(message) — resolves once dismissed.
export function oeAlert(message, opts) {
  return showDialog({
    message,
    input: null,
    cancelValue: undefined,
    buttons: [{ label: (opts && opts.okLabel) || 'ok', primary: true, value: undefined }],
  });
}

// Drop-in async replacement for confirm(message) — resolves true/false.
// Pass { danger: true } for a destructive action (delete, remove, etc.) to
// color the confirm button red instead of the usual primary color.
export function oeConfirm(message, opts) {
  return showDialog({
    message,
    input: null,
    cancelValue: false,
    buttons: [
      { label: (opts && opts.cancelLabel) || 'cancel', value: false },
      { label: (opts && opts.okLabel) || 'ok', value: true, primary: !(opts && opts.danger), dangerPrimary: !!(opts && opts.danger) },
    ],
  });
}

// Drop-in async replacement for prompt(message, defaultValue) — resolves
// the entered string, or null if cancelled (same as native prompt()).
export function oePrompt(message, opts) {
  return showDialog({
    message,
    input: { defaultValue: (opts && opts.defaultValue) || '', placeholder: (opts && opts.placeholder) || '', maxLength: opts && opts.maxLength },
    cancelValue: null,
    buttons: [
      { label: (opts && opts.cancelLabel) || 'cancel', value: null },
      { label: (opts && opts.okLabel) || 'ok', primary: true, useInputValue: true },
    ],
  });
}

function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Kept in sync with the matching allow-list in forum-server/upload-server.js's
// /report handler — the server independently validates against its own copy
// rather than trusting whatever the client sends, same as every other
// enum-like value in this codebase (report `type`, etc.).
export const REPORT_CATEGORIES = [
  'spam', 'harassment or bullying', 'hate speech', 'nudity or sexual content', 'violence or illegal content', 'something else',
];

// A purpose-built report dialog — category pills (single-select, required)
// plus an optional details textarea — instead of the single freeform
// oePrompt box every report call site used to show. Structured category
// data is what actually makes reports scannable/actionable for whoever's
// moderating, instead of a wall of inconsistent free text. Resolves
// { category, reason } (reason may be ''), or null if cancelled. `subject`
// is a short human-readable description of what's being reported (e.g.
// "this post", "@handle's profile") shown under the title.
export function oeReport(subject) {
  injectStyles();
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'oe-dialog-overlay';
    overlay.innerHTML = `
      <div class="oe-dialog-box report">
        <div class="oe-dialog-title">report</div>
        <div class="oe-dialog-subtitle">reporting ${escHtml(subject || 'this')} — pick what's wrong, and add details if it'll help.</div>
        <div class="oe-dialog-label">reason</div>
        <div class="oe-report-categories">
          ${REPORT_CATEGORIES.map((c, i) => `<button type="button" class="oe-report-category" data-idx="${i}">${escHtml(c)}</button>`).join('')}
        </div>
        <textarea class="oe-dialog-textarea" placeholder="add any details that'll help (optional)" maxlength="1000"></textarea>
        <div class="oe-dialog-hint" id="oeReportHint"></div>
        <div class="oe-dialog-actions">
          <button type="button" class="oe-dialog-btn" id="oeReportCancel">cancel</button>
          <button type="button" class="oe-dialog-btn danger-primary" id="oeReportSubmit">report</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    let selectedCategory = null;
    const pills = overlay.querySelectorAll('.oe-report-category');
    const hint = overlay.querySelector('#oeReportHint');
    const textarea = overlay.querySelector('.oe-dialog-textarea');
    pills.forEach(p => p.addEventListener('click', () => {
      selectedCategory = REPORT_CATEGORIES[Number(p.dataset.idx)];
      pills.forEach(x => x.classList.toggle('selected', x === p));
      hint.textContent = '';
      hint.classList.remove('error');
    }));

    let settled = false;
    function close(value) {
      if (settled) return;
      settled = true;
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKeydown);
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    }
    function onKeydown(e) { if (e.key === 'Escape') close(null); }

    overlay.querySelector('#oeReportCancel').addEventListener('click', () => close(null));
    overlay.querySelector('#oeReportSubmit').addEventListener('click', () => {
      if (!selectedCategory) {
        hint.textContent = 'pick a reason above.';
        hint.classList.add('error');
        return;
      }
      close({ category: selectedCategory, reason: textarea.value.trim() });
    });
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKeydown);
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
}
