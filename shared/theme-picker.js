// Renders theme swatches into `container` and wires them to change the
// site's saved theme (see theme-boot.js, which must be loaded first as a
// classic <script> in <head> for window.OE_THEMES / applyOeTheme to exist).
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/theme-picker.js?v=N'` import across the site (grep for
// it) — otherwise visitors can sit on a stale cached copy for hours after a
// deploy.
let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-theme-grid { display: flex; flex-wrap: wrap; gap: 12px; }
    .oe-theme-swatch-btn {
      display: flex; align-items: center; gap: 10px; background: var(--md-sys-color-surface-variant);
      border: 2px solid transparent; border-radius: 14px; padding: 10px 16px; cursor: pointer;
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); font-size: 14px; font-weight: 500;
      color: var(--md-sys-color-on-surface); transition: border-color 0.2s, background-color 0.2s;
    }
    .oe-theme-swatch-btn:hover { background: var(--md-sys-state-hover); }
    .oe-theme-swatch-btn.active { border-color: var(--md-sys-color-primary); }
    .oe-theme-swatch-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }

    .oe-theme-flip-btn {
      display: flex; align-items: center; gap: 10px; background: var(--md-sys-color-surface-variant);
      border: 2px solid transparent; border-radius: 14px; padding: 10px 16px; cursor: pointer;
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); font-size: 14px; font-weight: 500;
      color: var(--md-sys-color-on-surface); transition: border-color 0.2s, background-color 0.2s;
      margin-top: 12px;
    }
    .oe-theme-flip-btn:hover { background: var(--md-sys-state-hover); }
    .oe-theme-flip-btn.active { border-color: var(--md-sys-color-primary); }
    .oe-theme-flip-btn .material-symbols-rounded { font-size: 18px; }
  `;
  document.head.appendChild(style);
}

export function mountThemePicker(container, onChange) {
  injectStyles();
  if (!window.OE_THEMES) {
    container.textContent = 'Theme options unavailable — shared/theme-boot.js failed to load.';
    return;
  }
  const current = localStorage.getItem(window.OE_THEME_KEY) || 'material-dark';
  const grid = document.createElement('div');
  grid.className = 'oe-theme-grid';
  grid.innerHTML = Object.entries(window.OE_THEMES).map(([id, t]) => `
    <button class="oe-theme-swatch-btn${id === current ? ' active' : ''}" data-theme="${id}">
      <span class="oe-theme-swatch-dot" style="background:${t.swatch}"></span>
      <span>${t.name}</span>
    </button>
  `).join('');
  container.innerHTML = '';
  container.appendChild(grid);

  const flipBtn = document.createElement('button');
  flipBtn.type = 'button';
  flipBtn.className = 'oe-theme-flip-btn';
  const isFlipped = () => localStorage.getItem(window.OE_THEME_FLIP_KEY) === '1';
  function renderFlipBtn() {
    const flipped = isFlipped();
    flipBtn.classList.toggle('active', flipped);
    flipBtn.innerHTML = `<span class="material-symbols-rounded">invert_colors</span><span>${flipped ? 'Colors flipped' : 'Flip colors'}</span>`;
  }
  renderFlipBtn();
  container.appendChild(flipBtn);

  grid.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.theme;
      localStorage.setItem(window.OE_THEME_KEY, id);
      window.applyOeTheme(id, isFlipped());
      grid.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('active', b === btn));
      if (onChange) onChange(id, window.OE_THEMES[id]);
    });
  });

  flipBtn.addEventListener('click', () => {
    const next = !isFlipped();
    localStorage.setItem(window.OE_THEME_FLIP_KEY, next ? '1' : '0');
    const id = localStorage.getItem(window.OE_THEME_KEY) || 'material-dark';
    window.applyOeTheme(id, next);
    renderFlipBtn();
    if (onChange) onChange(id, window.OE_THEMES[id]);
  });
}
