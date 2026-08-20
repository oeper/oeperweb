// Wires @-mention autocomplete onto a <textarea> or <input type="text">:
// typing "@" followed by letters shows a dropdown of matching users below
// the field, filtered by handle/display name prefix; Enter/Tab/click
// inserts "@handle " in place of the partial token. Positions the dropdown
// under the field itself rather than at the text caret — caret-accurate
// positioning inside a textarea needs a mirror-div per field, which isn't
// worth the complexity here since every composer this attaches to is a
// single-line-ish input near the bottom of its panel anyway.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/mention-autocomplete.js?v=N'` import across the site
// (grep for it) — otherwise visitors can sit on a stale cached copy for
// hours after a deploy.
import { db } from './account.js?v=30';
import { collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function escHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-mention-box {
      position: absolute; z-index: 400; background: var(--md-sys-color-surface);
      border-radius: 14px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.35); overflow: hidden; max-height: 220px; overflow-y: auto;
    }
    .oe-mention-row {
      display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px;
    }
    .oe-mention-row.active, .oe-mention-row:hover { background: var(--md-sys-state-hover); }
    .oe-mention-row img {
      width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
      background: var(--md-sys-color-surface-variant);
    }
    .oe-mention-name { font-weight: 500; color: var(--md-sys-color-on-surface); }
    .oe-mention-handle { color: var(--md-sys-color-on-surface-variant); }
  `;
  document.head.appendChild(style);
}

let usersPromise = null;
function loadUsers() {
  if (usersPromise) return usersPromise;
  usersPromise = getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(300)))
    .then(snap => snap.docs.map(d => ({ email: d.id, ...d.data() })).filter(u => u.handle))
    .catch(() => []);
  return usersPromise;
}

// Matches an "@partialhandle" token ending at the text cursor, requiring
// the @ to be preceded by start-of-string/whitespace/open-paren — same
// boundary rule as linkifyMentions() in account.js, so what autocomplete
// offers to insert is exactly what later renders as a clickable mention.
const TOKEN_RE = /(^|[\s(])@([a-z0-9_.]{0,20})$/i;

export function attachMentionAutocomplete(field) {
  injectStyles();
  let box = null;
  let candidates = [];
  let activeIndex = 0;

  function closeBox() {
    if (box) { box.remove(); box = null; }
  }

  function currentToken() {
    const pos = field.selectionStart;
    const upto = field.value.slice(0, pos);
    const m = upto.match(TOKEN_RE);
    return m ? m[2] : null;
  }

  async function updateBox() {
    const token = currentToken();
    if (token === null) { closeBox(); return; }
    const users = await loadUsers();
    // Re-check the token is still current — the field may have changed
    // (or lost the @) while the users list was loading.
    if (currentToken() !== token) return;
    const q = token.toLowerCase();
    candidates = users.filter(u => u.handle.toLowerCase().startsWith(q)).slice(0, 6);
    if (!candidates.length) { closeBox(); return; }
    activeIndex = 0;
    renderBox();
  }

  function renderBox() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'oe-mention-box';
      document.body.appendChild(box);
    }
    const rect = field.getBoundingClientRect();
    box.style.left = (rect.left + window.scrollX) + 'px';
    box.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    box.style.width = Math.max(220, Math.min(rect.width, 320)) + 'px';
    box.innerHTML = candidates.map((u, i) => `
      <div class="oe-mention-row${i === activeIndex ? ' active' : ''}" data-idx="${i}">
        <img src="${escHtml(u.photoURL || '')}" alt="">
        <span class="oe-mention-name">${escHtml(u.displayName || u.handle)}</span>
        <span class="oe-mention-handle">@${escHtml(u.handle)}</span>
      </div>
    `).join('');
    box.querySelectorAll('[data-idx]').forEach(row => {
      // mousedown (not click) fires before the field's blur, so the field
      // never loses focus/selection before we read it in selectCandidate().
      row.addEventListener('mousedown', e => { e.preventDefault(); selectCandidate(Number(row.dataset.idx)); });
    });
  }

  function selectCandidate(i) {
    const u = candidates[i];
    if (!u) return;
    const pos = field.selectionStart;
    const text = field.value;
    const upto = text.slice(0, pos);
    const m = upto.match(TOKEN_RE);
    if (!m) return;
    const start = pos - m[2].length - 1;
    const before = text.slice(0, start);
    const after = text.slice(pos);
    const inserted = '@' + u.handle + ' ';
    field.value = before + inserted + after;
    const newPos = (before + inserted).length;
    field.setSelectionRange(newPos, newPos);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    closeBox();
    field.focus();
  }

  field.addEventListener('input', updateBox);
  field.addEventListener('keydown', e => {
    if (!box) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, candidates.length - 1); renderBox(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); renderBox(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectCandidate(activeIndex); }
    else if (e.key === 'Escape') { closeBox(); }
  });
  field.addEventListener('blur', () => setTimeout(closeBox, 150));
}
