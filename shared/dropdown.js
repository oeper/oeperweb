// A custom-styled dropdown to replace native <select> — its closed state
// is easy to theme with plain CSS, but the OPEN option list is rendered by
// the OS/browser chrome and cannot be restyled cross-browser (no
// background-color, border-radius, hover states, etc. reliably work on
// <option> across Chrome/Firefox/Safari). This renders both the trigger
// button and the option list as real themed DOM instead.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/dropdown.js?v=N'` import across the site (grep for it) —
// otherwise visitors can sit on a stale cached copy for hours after a deploy.

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-dropdown { position: relative; display: inline-block; }
    .oe-dropdown.block { display: block; width: 100%; }
    .oe-dropdown-btn {
      display: inline-flex; align-items: center; gap: 8px; background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface-variant); border: 1px solid var(--md-sys-color-outline);
      border-radius: 100px; padding: 8px 14px; font: inherit; font-size: 14px; cursor: pointer;
      width: 100%; text-align: left; justify-content: space-between;
    }
    .oe-dropdown-btn:hover { background: var(--md-sys-state-hover); }
    .oe-dropdown.open .oe-dropdown-btn { border-color: var(--md-sys-color-primary); }
    .oe-dropdown-btn-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .oe-dropdown-caret { font-size: 18px; transition: transform 0.15s; flex-shrink: 0; }
    .oe-dropdown.open .oe-dropdown-caret { transform: rotate(180deg); }
    .oe-dropdown-list {
      position: absolute; top: calc(100% + 6px); left: 0; right: 0; min-width: 180px;
      background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline);
      border-radius: 14px; padding: 6px; z-index: 200; max-height: 280px; overflow-y: auto;
      opacity: 0; transform: translateY(-6px) scale(0.97); pointer-events: none;
      transition: opacity 0.15s, transform 0.15s; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .oe-dropdown-list.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }
    .oe-dropdown-item {
      display: block; width: 100%; text-align: left; padding: 9px 12px; border-radius: 9px; border: none;
      background: transparent; color: var(--md-sys-color-on-surface); font-size: 14px; cursor: pointer;
      font-family: inherit; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .oe-dropdown-item:hover { background: var(--md-sys-state-hover); }
    .oe-dropdown-item.active { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
  `;
  document.head.appendChild(style);
}

function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function closeAllDropdowns(except) {
  document.querySelectorAll('.oe-dropdown.open').forEach(w => {
    if (w === except) return;
    w.classList.remove('open');
    w.querySelector('.oe-dropdown-list')?.classList.remove('open');
  });
}
document.addEventListener('click', () => closeAllDropdowns());

// options: [{ value, label }]. opts: { value, onChange, block, placeholder }
// — block makes it fill its container's width (for form-field-style use);
// placeholder shows when no option matches the current value.
export function createDropdown(options, opts) {
  injectStyles();
  opts = opts || {};
  let currentValue = opts.value;
  let currentOptions = options || [];

  const wrap = document.createElement('div');
  wrap.className = 'oe-dropdown' + (opts.block ? ' block' : '');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'oe-dropdown-btn';
  const list = document.createElement('div');
  list.className = 'oe-dropdown-list';
  wrap.appendChild(btn);
  wrap.appendChild(list);

  function render() {
    const current = currentOptions.find(o => o.value === currentValue);
    btn.innerHTML = `<span class="oe-dropdown-btn-label">${escHtml(current ? current.label : (opts.placeholder || ''))}</span><span class="material-symbols-rounded oe-dropdown-caret">expand_more</span>`;
    list.innerHTML = currentOptions.map(o => `
      <button type="button" class="oe-dropdown-item${o.value === currentValue ? ' active' : ''}" data-value="${escHtml(o.value)}">${escHtml(o.label)}</button>
    `).join('');
    list.querySelectorAll('.oe-dropdown-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        currentValue = item.dataset.value;
        closeAllDropdowns();
        render();
        if (opts.onChange) opts.onChange(currentValue);
      });
    });
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const willOpen = !wrap.classList.contains('open');
    closeAllDropdowns();
    if (willOpen) {
      wrap.classList.add('open');
      list.classList.add('open');
    }
  });

  render();

  return {
    el: wrap,
    getValue: () => currentValue,
    setValue: v => { currentValue = v; render(); },
    setOptions: (opts2, keepValue) => { currentOptions = opts2 || []; if (!keepValue) currentValue = opts.value; render(); },
  };
}
