// Applies the site's saved color theme before first paint. Classic script
// (not a module) on purpose — modules load async, which would flash the
// default theme for a moment before switching. Include this as the very
// first thing in <head>, before any stylesheet or style block.
//
// Each page still defines its own `:root { --md-sys-color-*: ... }` block
// with the default (Material Dark) values as a fallback for JS-disabled
// browsers — this script overrides those with inline styles on <html>,
// which win the cascade regardless of load order.
(function () {
  window.OE_THEME_KEY = 'oe-theme';

  window.OE_THEMES = {
    'material-dark': {
      name: 'Material Dark',
      swatch: '#a8c7fa',
      vars: {
        '--md-sys-color-background': '#111318',
        '--md-sys-color-surface': '#1a1c22',
        '--md-sys-color-surface-variant': '#2f353d',
        '--md-sys-color-primary': '#a8c7fa',
        '--md-sys-color-on-primary': '#062e6f',
        '--md-sys-color-secondary-container': '#33485d',
        '--md-sys-color-on-secondary-container': '#d2e4ff',
        '--md-sys-color-on-surface': '#e2e2e6',
        '--md-sys-color-on-surface-variant': '#c4c7c5',
        '--md-sys-color-outline': '#43474e',
        '--md-sys-color-outline-variant': '#8c9199',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
      },
    },
    'violet': {
      name: 'Violet',
      swatch: '#c9a4ff',
      vars: {
        '--md-sys-color-background': '#14111c',
        '--md-sys-color-surface': '#1e1a2b',
        '--md-sys-color-surface-variant': '#342b49',
        '--md-sys-color-primary': '#c9a4ff',
        '--md-sys-color-on-primary': '#3a1e6b',
        '--md-sys-color-secondary-container': '#4a3a6e',
        '--md-sys-color-on-secondary-container': '#ecdcff',
        '--md-sys-color-on-surface': '#ebe4f7',
        '--md-sys-color-on-surface-variant': '#cbbfe0',
        '--md-sys-color-outline': '#4d4360',
        '--md-sys-color-outline-variant': '#8f7fae',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
      },
    },
    'ocean': {
      name: 'Ocean',
      swatch: '#7fd8d0',
      vars: {
        '--md-sys-color-background': '#0d1616',
        '--md-sys-color-surface': '#151f1f',
        '--md-sys-color-surface-variant': '#243535',
        '--md-sys-color-primary': '#7fd8d0',
        '--md-sys-color-on-primary': '#003633',
        '--md-sys-color-secondary-container': '#2c4a48',
        '--md-sys-color-on-secondary-container': '#c8ede8',
        '--md-sys-color-on-surface': '#dde4e3',
        '--md-sys-color-on-surface-variant': '#bcc8c7',
        '--md-sys-color-outline': '#3c4948',
        '--md-sys-color-outline-variant': '#7c928f',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
      },
    },
  };

  window.applyOeTheme = function (id) {
    var theme = window.OE_THEMES[id] || window.OE_THEMES['material-dark'];
    var root = document.documentElement.style;
    for (var k in theme.vars) root.setProperty(k, theme.vars[k]);
  };

  var saved = localStorage.getItem(window.OE_THEME_KEY) || 'material-dark';
  window.applyOeTheme(saved);
})();
