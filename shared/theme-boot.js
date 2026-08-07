// Applies the site's saved color theme before first paint. Classic script
// (not a module) on purpose — modules load async, which would flash the
// default theme for a moment before switching. Include this as the very
// first thing in <head>, before any stylesheet or style block.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `<script src="./shared/theme-boot.js?v=N">` across the site (grep for it)
// — otherwise visitors can sit on a stale cached copy for hours after a
// deploy.
//
// Each page still defines its own `:root { --md-sys-color-*: ... }` block
// with the default (Material Dark) values as a fallback for JS-disabled
// browsers — this script overrides those with inline styles on <html>,
// which win the cascade regardless of load order.
//
// --md-sys-state-hover and --md-sys-color-hover-surface exist so hover/
// pressed states can stay theme-aware: a translucent white overlay (or a
// hardcoded near-black hex hover background) looks right on a dark theme
// but inverts into a visible smudge on a light one, so every page should
// use these two variables for hover states instead of hardcoding either.
//
// --md-sys-color-background-rgb / -outline-rgb are the same colors as
// their hex counterparts, just as an "r, g, b" triplet — CSS can't derive
// that from a hex custom property, so anything that needs a translucent
// version (e.g. the frosted navbar background) needs the triplet form to
// plug into rgba(var(--md-sys-color-background-rgb), 0.8).
(function () {
  window.OE_THEME_KEY = 'oe-theme';

  window.OE_THEMES = {
    'material-dark': {
      name: 'Dark',
      swatch: '#a8c7fa',
      dark: true,
      vars: {
        '--md-sys-color-background': '#111318',
        '--md-sys-color-background-rgb': '17, 19, 24',
        '--md-sys-color-surface': '#1a1c22',
        '--md-sys-color-surface-variant': '#2f353d',
        '--md-sys-color-primary': '#a8c7fa',
        '--md-sys-color-on-primary': '#062e6f',
        '--md-sys-color-secondary-container': '#33485d',
        '--md-sys-color-on-secondary-container': '#d2e4ff',
        '--md-sys-color-on-surface': '#e2e2e6',
        '--md-sys-color-on-surface-variant': '#c4c7c5',
        '--md-sys-color-outline': '#43474e',
        '--md-sys-color-outline-rgb': '67, 71, 78',
        '--md-sys-color-outline-variant': '#8c9199',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#21242c',
      },
    },
    'light': {
      name: 'Light',
      swatch: '#3a5a9b',
      dark: false,
      vars: {
        '--md-sys-color-background': '#f9f9fc',
        '--md-sys-color-background-rgb': '249, 249, 252',
        '--md-sys-color-surface': '#ffffff',
        '--md-sys-color-surface-variant': '#e3e6ee',
        '--md-sys-color-primary': '#3a5a9b',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#d7e3f8',
        '--md-sys-color-on-secondary-container': '#101c2b',
        '--md-sys-color-on-surface': '#1a1c1e',
        '--md-sys-color-on-surface-variant': '#44474e',
        '--md-sys-color-outline': '#74777f',
        '--md-sys-color-outline-rgb': '116, 119, 127',
        '--md-sys-color-outline-variant': '#c4c6cf',
        '--md-sys-color-error': '#ba1a1a',
        '--md-sys-color-success': '#2e7d32',
        '--md-sys-state-hover': 'rgba(0,0,0,0.05)',
        '--md-sys-color-hover-surface': '#eceef2',
      },
    },
    'violet': {
      name: 'Violet',
      swatch: '#c9a4ff',
      dark: true,
      vars: {
        '--md-sys-color-background': '#14111c',
        '--md-sys-color-background-rgb': '20, 17, 28',
        '--md-sys-color-surface': '#1e1a2b',
        '--md-sys-color-surface-variant': '#342b49',
        '--md-sys-color-primary': '#c9a4ff',
        '--md-sys-color-on-primary': '#3a1e6b',
        '--md-sys-color-secondary-container': '#4a3a6e',
        '--md-sys-color-on-secondary-container': '#ecdcff',
        '--md-sys-color-on-surface': '#ebe4f7',
        '--md-sys-color-on-surface-variant': '#cbbfe0',
        '--md-sys-color-outline': '#4d4360',
        '--md-sys-color-outline-rgb': '77, 67, 96',
        '--md-sys-color-outline-variant': '#8f7fae',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#291f3c',
      },
    },
    'ocean': {
      name: 'Ocean',
      swatch: '#7fd8d0',
      dark: true,
      vars: {
        '--md-sys-color-background': '#0d1616',
        '--md-sys-color-background-rgb': '13, 22, 22',
        '--md-sys-color-surface': '#151f1f',
        '--md-sys-color-surface-variant': '#243535',
        '--md-sys-color-primary': '#7fd8d0',
        '--md-sys-color-on-primary': '#003633',
        '--md-sys-color-secondary-container': '#2c4a48',
        '--md-sys-color-on-secondary-container': '#c8ede8',
        '--md-sys-color-on-surface': '#dde4e3',
        '--md-sys-color-on-surface-variant': '#bcc8c7',
        '--md-sys-color-outline': '#3c4948',
        '--md-sys-color-outline-rgb': '60, 73, 72',
        '--md-sys-color-outline-variant': '#7c928f',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#1c2929',
      },
    },
    'sepia': {
      name: 'Sepia',
      swatch: '#8a5a2b',
      dark: false,
      vars: {
        '--md-sys-color-background': '#f4ecdc',
        '--md-sys-color-background-rgb': '244, 236, 220',
        '--md-sys-color-surface': '#fbf3e3',
        '--md-sys-color-surface-variant': '#e8dcc0',
        '--md-sys-color-primary': '#8a5a2b',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#e3cd9d',
        '--md-sys-color-on-secondary-container': '#2e1e05',
        '--md-sys-color-on-surface': '#2b2013',
        '--md-sys-color-on-surface-variant': '#5c4f38',
        '--md-sys-color-outline': '#8a7c5e',
        '--md-sys-color-outline-rgb': '138, 124, 94',
        '--md-sys-color-outline-variant': '#cdbf9c',
        '--md-sys-color-error': '#b3261e',
        '--md-sys-color-success': '#4c662b',
        '--md-sys-state-hover': 'rgba(0,0,0,0.05)',
        '--md-sys-color-hover-surface': '#efe3c9',
      },
    },
    'sunset': {
      name: 'Sunset',
      swatch: '#ffb787',
      dark: true,
      vars: {
        '--md-sys-color-background': '#1a120c',
        '--md-sys-color-background-rgb': '26, 18, 12',
        '--md-sys-color-surface': '#241a12',
        '--md-sys-color-surface-variant': '#3d2c1d',
        '--md-sys-color-primary': '#ffb787',
        '--md-sys-color-on-primary': '#4a2800',
        '--md-sys-color-secondary-container': '#6b4423',
        '--md-sys-color-on-secondary-container': '#ffdcc0',
        '--md-sys-color-on-surface': '#f0e0d3',
        '--md-sys-color-on-surface-variant': '#d8c3b0',
        '--md-sys-color-outline': '#5f4b3a',
        '--md-sys-color-outline-rgb': '95, 75, 58',
        '--md-sys-color-outline-variant': '#a08b76',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.07)',
        '--md-sys-color-hover-surface': '#2f2216',
      },
    },
    'amber': {
      name: 'Amber',
      swatch: '#ff6b35',
      dark: true,
      vars: {
        '--md-sys-color-background': '#0d1117',
        '--md-sys-color-background-rgb': '13, 17, 23',
        '--md-sys-color-surface': '#161b22',
        '--md-sys-color-surface-variant': '#21262d',
        '--md-sys-color-primary': '#ff6b35',
        '--md-sys-color-on-primary': '#3a1400',
        '--md-sys-color-secondary-container': '#5c3319',
        '--md-sys-color-on-secondary-container': '#ffdbc7',
        '--md-sys-color-on-surface': '#e6edf3',
        '--md-sys-color-on-surface-variant': '#9198a1',
        '--md-sys-color-outline': '#30363d',
        '--md-sys-color-outline-rgb': '48, 54, 61',
        '--md-sys-color-outline-variant': '#6e7681',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#1c2128',
      },
    },
    'tundra': {
      name: 'Tundra',
      swatch: '#e4f0f6',
      dark: true,
      vars: {
        '--md-sys-color-background': '#0a0f1e',
        '--md-sys-color-background-rgb': '10, 15, 30',
        '--md-sys-color-surface': '#111a2e',
        '--md-sys-color-surface-variant': '#1c2b45',
        '--md-sys-color-primary': '#e4f0f6',
        '--md-sys-color-on-primary': '#0a2540',
        '--md-sys-color-secondary-container': '#22364f',
        '--md-sys-color-on-secondary-container': '#d5e8f5',
        '--md-sys-color-on-surface': '#dce8f0',
        '--md-sys-color-on-surface-variant': '#a8bcd0',
        '--md-sys-color-outline': '#3d5573',
        '--md-sys-color-outline-rgb': '61, 85, 115',
        '--md-sys-color-outline-variant': '#6f8aa8',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#16233a',
      },
    },
  };

  window.applyOeTheme = function (id) {
    var theme = window.OE_THEMES[id] || window.OE_THEMES['material-dark'];
    var root = document.documentElement.style;
    for (var k in theme.vars) root.setProperty(k, theme.vars[k]);
    document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
  };

  var saved = localStorage.getItem(window.OE_THEME_KEY) || 'material-dark';
  window.applyOeTheme(saved);
})();
