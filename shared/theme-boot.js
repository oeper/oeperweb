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
      name: 'dark',
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
      name: 'light',
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
      name: 'violet',
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
      name: 'ocean',
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
      name: 'sepia',
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
      name: 'sunset',
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
      name: 'amber',
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
      name: 'tundra',
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
    'vault': {
      name: 'vault',
      swatch: '#c8a96e',
      dark: true,
      vars: {
        '--md-sys-color-background': '#111111',
        '--md-sys-color-background-rgb': '17, 17, 17',
        '--md-sys-color-surface': '#1a1a1a',
        '--md-sys-color-surface-variant': '#2b2b2b',
        '--md-sys-color-primary': '#c8a96e',
        '--md-sys-color-on-primary': '#2e2000',
        '--md-sys-color-secondary-container': '#4a3d20',
        '--md-sys-color-on-secondary-container': '#f0dfb8',
        '--md-sys-color-on-surface': '#e8e4da',
        '--md-sys-color-on-surface-variant': '#b3ac9c',
        '--md-sys-color-outline': '#4d4636',
        '--md-sys-color-outline-rgb': '77, 70, 54',
        '--md-sys-color-outline-variant': '#8c7f61',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#212121',
      },
    },
    'red': {
      name: 'red',
      swatch: '#dc143c',
      dark: false,
      vars: {
        '--md-sys-color-background': '#f2efe7',
        '--md-sys-color-background-rgb': '242, 239, 231',
        '--md-sys-color-surface': '#faf8f2',
        '--md-sys-color-surface-variant': '#e6e1d3',
        '--md-sys-color-primary': '#dc143c',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#ffd9de',
        '--md-sys-color-on-secondary-container': '#3f0512',
        '--md-sys-color-on-surface': '#1f1b16',
        '--md-sys-color-on-surface-variant': '#55503f',
        '--md-sys-color-outline': '#857f68',
        '--md-sys-color-outline-rgb': '133, 127, 104',
        '--md-sys-color-outline-variant': '#d0cab8',
        '--md-sys-color-error': '#ba1a1a',
        '--md-sys-color-success': '#2e7d32',
        '--md-sys-state-hover': 'rgba(0,0,0,0.05)',
        '--md-sys-color-hover-surface': '#ece7d9',
      },
    },
    // Not a color-role theme at all: black & white, hand-drawn. Sets the
    // page font to Freehand and paints a ruled-notebook-paper background —
    // see fontOverride/bgImage below, consumed by applyOeTheme() and by
    // each page's body{} rule via var(--oe-font-override)/var(--oe-bg-image).
    'sketch': {
      name: 'sketch',
      swatch: '#1a1a1a',
      dark: false,
      fontOverride: "'Freehand', cursive",
      bgImage: "repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(0,0,0,0.18) 32px), linear-gradient(to right, transparent 47px, rgba(0,0,0,0.4) 48px, rgba(0,0,0,0.4) 49px, transparent 50px)",
      vars: {
        '--md-sys-color-background': '#fdfdfb',
        '--md-sys-color-background-rgb': '253, 253, 251',
        '--md-sys-color-surface': '#ffffff',
        '--md-sys-color-surface-variant': '#e8e8e6',
        '--md-sys-color-primary': '#1a1a1a',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#dcdcda',
        '--md-sys-color-on-secondary-container': '#111111',
        '--md-sys-color-on-surface': '#111111',
        '--md-sys-color-on-surface-variant': '#4a4a4a',
        '--md-sys-color-outline': '#7a7a7a',
        '--md-sys-color-outline-rgb': '122, 122, 122',
        '--md-sys-color-outline-variant': '#c6c6c6',
        '--md-sys-color-error': '#8a1a1a',
        '--md-sys-color-success': '#2e5e2e',
        '--md-sys-state-hover': 'rgba(0,0,0,0.06)',
        '--md-sys-color-hover-surface': '#f0f0ee',
      },
    },
    'merlot': {
      name: 'merlot',
      swatch: '#c5a880',
      dark: true,
      vars: {
        '--md-sys-color-background': '#730000',
        '--md-sys-color-background-rgb': '115, 0, 0',
        '--md-sys-color-surface': '#7e1414',
        '--md-sys-color-surface-variant': '#8f2a2a',
        '--md-sys-color-primary': '#c5a880',
        '--md-sys-color-on-primary': '#3a2410',
        '--md-sys-color-secondary-container': '#4a3018',
        '--md-sys-color-on-secondary-container': '#f0ddc0',
        '--md-sys-color-on-surface': '#f2e4de',
        '--md-sys-color-on-surface-variant': '#cbb0a8',
        '--md-sys-color-outline': '#6b4038',
        '--md-sys-color-outline-rgb': '107, 64, 56',
        '--md-sys-color-outline-variant': '#a37f75',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#8a1c1c',
      },
    },
    'cream': {
      name: 'cream',
      swatch: '#f5deb3',
      dark: false,
      vars: {
        '--md-sys-color-background': '#faf6ec',
        '--md-sys-color-background-rgb': '250, 246, 236',
        '--md-sys-color-surface': '#fffaf0',
        '--md-sys-color-surface-variant': '#f5deb3',
        '--md-sys-color-primary': '#36454f',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#c9d2d6',
        '--md-sys-color-on-secondary-container': '#14232b',
        '--md-sys-color-on-surface': '#2a2620',
        '--md-sys-color-on-surface-variant': '#5c5346',
        '--md-sys-color-outline': '#8a8067',
        '--md-sys-color-outline-rgb': '138, 128, 103',
        '--md-sys-color-outline-variant': '#d9cdb0',
        '--md-sys-color-error': '#ba1a1a',
        '--md-sys-color-success': '#2e7d32',
        '--md-sys-state-hover': 'rgba(0,0,0,0.05)',
        '--md-sys-color-hover-surface': '#f0e9d8',
      },
    },
    'vintage': {
      name: 'vintage',
      swatch: '#c08081',
      dark: true,
      vars: {
        '--md-sys-color-background': '#002366',
        '--md-sys-color-background-rgb': '0, 35, 102',
        '--md-sys-color-surface': '#0a2c70',
        '--md-sys-color-surface-variant': '#1c3d82',
        '--md-sys-color-primary': '#c08081',
        '--md-sys-color-on-primary': '#3a0d10',
        '--md-sys-color-secondary-container': '#6e3a3f',
        '--md-sys-color-on-secondary-container': '#f5d9da',
        '--md-sys-color-on-surface': '#dfe4f2',
        '--md-sys-color-on-surface-variant': '#a9b3cf',
        '--md-sys-color-outline': '#3d5580',
        '--md-sys-color-outline-rgb': '61, 85, 128',
        '--md-sys-color-outline-variant': '#6f88b8',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#102d78',
      },
    },
    'sage': {
      name: 'sage',
      swatch: '#d4a373',
      dark: true,
      vars: {
        '--md-sys-color-background': '#023020',
        '--md-sys-color-background-rgb': '2, 48, 32',
        '--md-sys-color-surface': '#0a3c29',
        '--md-sys-color-surface-variant': '#1c4d38',
        '--md-sys-color-primary': '#d4a373',
        '--md-sys-color-on-primary': '#3d2411',
        '--md-sys-color-secondary-container': '#5c4326',
        '--md-sys-color-on-secondary-container': '#f5ddc0',
        '--md-sys-color-on-surface': '#e3ede6',
        '--md-sys-color-on-surface-variant': '#a9c2b2',
        '--md-sys-color-outline': '#3c5c4a',
        '--md-sys-color-outline-rgb': '60, 92, 74',
        '--md-sys-color-outline-variant': '#7a9a86',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#123f2c',
      },
    },
    'pistachio': {
      name: 'pistachio',
      swatch: '#b9d3af',
      dark: false,
      vars: {
        '--md-sys-color-background': '#faf5ea',
        '--md-sys-color-background-rgb': '250, 245, 234',
        '--md-sys-color-surface': '#f5ecd9',
        '--md-sys-color-surface-variant': '#ecd7b2',
        '--md-sys-color-primary': '#5a7a4e',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#b9d3af',
        '--md-sys-color-on-secondary-container': '#1c2e13',
        '--md-sys-color-on-surface': '#2c2a1f',
        '--md-sys-color-on-surface-variant': '#5c5946',
        '--md-sys-color-outline': '#8a8267',
        '--md-sys-color-outline-rgb': '138, 130, 103',
        '--md-sys-color-outline-variant': '#d8cfb0',
        '--md-sys-color-error': '#ba1a1a',
        '--md-sys-color-success': '#2e7d32',
        '--md-sys-state-hover': 'rgba(0,0,0,0.05)',
        '--md-sys-color-hover-surface': '#f0e6cf',
      },
    },
    // Glassmorphism / "liquid glass": translucent (rgba) surfaces over a
    // soft blurred-blob background image, plus backdrop-filter blur via
    // --oe-glass-blur (applied sitewide, see GLASS_SELECTORS below) so the
    // background actually shows through blurred, not just tinted.
    'light-glass': {
      name: 'light glass',
      swatch: '#1c1f26',
      dark: false,
      glassBlur: 'blur(10px) saturate(1.15)',
      bgImage: 'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.7) 0%, transparent 45%), radial-gradient(circle at 85% 15%, rgba(0,0,0,0.05) 0%, transparent 45%), radial-gradient(circle at 50% 90%, rgba(255,255,255,0.5) 0%, transparent 50%)',
      vars: {
        '--md-sys-color-background': '#f2f2f2',
        '--md-sys-color-background-rgb': '242, 242, 242',
        '--md-sys-color-surface': 'rgba(255,255,255,0.55)',
        '--md-sys-color-surface-variant': 'rgba(255,255,255,0.35)',
        '--md-sys-color-primary': '#1c1f26',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': 'rgba(0,0,0,0.08)',
        '--md-sys-color-on-secondary-container': '#1c1f26',
        '--md-sys-color-on-surface': '#1c1f26',
        '--md-sys-color-on-surface-variant': '#5f5f5f',
        '--md-sys-color-outline': 'rgba(28,28,28,0.18)',
        '--md-sys-color-outline-rgb': '28, 28, 28',
        '--md-sys-color-outline-variant': 'rgba(28,28,28,0.1)',
        '--md-sys-color-error': '#ba1a1a',
        '--md-sys-color-success': '#2e7d32',
        '--md-sys-state-hover': 'rgba(0,0,0,0.06)',
        '--md-sys-color-hover-surface': 'rgba(255,255,255,0.7)',
      },
    },
    'dark-glass': {
      name: 'dark glass',
      swatch: '#f0f0f0',
      dark: true,
      glassBlur: 'blur(10px) saturate(1.15)',
      bgImage: 'radial-gradient(circle at 15% 20%, rgba(255,255,255,0.09) 0%, transparent 45%), radial-gradient(circle at 85% 15%, rgba(255,255,255,0.05) 0%, transparent 45%), radial-gradient(circle at 50% 90%, rgba(0,0,0,0.3) 0%, transparent 50%)',
      vars: {
        '--md-sys-color-background': '#161616',
        '--md-sys-color-background-rgb': '22, 22, 22',
        '--md-sys-color-surface': 'rgba(38,38,38,0.55)',
        '--md-sys-color-surface-variant': 'rgba(50,50,50,0.4)',
        '--md-sys-color-primary': '#f0f0f0',
        '--md-sys-color-on-primary': '#161616',
        '--md-sys-color-secondary-container': 'rgba(255,255,255,0.12)',
        '--md-sys-color-on-secondary-container': '#f0f0f0',
        '--md-sys-color-on-surface': '#f0f0f0',
        '--md-sys-color-on-surface-variant': '#b5b5b5',
        '--md-sys-color-outline': 'rgba(255,255,255,0.14)',
        '--md-sys-color-outline-rgb': '255, 255, 255',
        '--md-sys-color-outline-variant': 'rgba(255,255,255,0.08)',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.08)',
        '--md-sys-color-hover-surface': 'rgba(45,45,45,0.65)',
      },
    },
    'boreal': {
      name: 'boreal',
      swatch: '#B2D5E5',
      dark: true,
      vars: {
        '--md-sys-color-background': '#020202',
        '--md-sys-color-background-rgb': '2, 2, 2',
        '--md-sys-color-surface': '#0d1113',
        '--md-sys-color-surface-variant': '#161b1e',
        '--md-sys-color-primary': '#B2D5E5',
        '--md-sys-color-on-primary': '#062633',
        '--md-sys-color-secondary-container': '#24333a',
        '--md-sys-color-on-secondary-container': '#cfe7f2',
        '--md-sys-color-on-surface': '#e6eef2',
        '--md-sys-color-on-surface-variant': '#9db3bc',
        '--md-sys-color-outline': '#2c3a40',
        '--md-sys-color-outline-rgb': '44, 58, 64',
        '--md-sys-color-outline-variant': '#5c7078',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#12171a',
      },
    },
    'pumpkin': {
      name: 'pumpkin',
      swatch: '#FC7D14',
      dark: true,
      vars: {
        '--md-sys-color-background': '#012F25',
        '--md-sys-color-background-rgb': '1, 47, 37',
        '--md-sys-color-surface': '#073d31',
        '--md-sys-color-surface-variant': '#0f4a3c',
        '--md-sys-color-primary': '#FC7D14',
        '--md-sys-color-on-primary': '#3a1a00',
        // Was a yellow-brown pair, a third hue unrelated to the theme's
        // green background/orange primary — rebuilt from the orange itself
        // so the theme stays to 2 colors instead of 3.
        '--md-sys-color-secondary-container': '#6a3910',
        '--md-sys-color-on-secondary-container': '#edd7c4',
        '--md-sys-color-on-surface': '#eef5f0',
        '--md-sys-color-on-surface-variant': '#a8c2b8',
        '--md-sys-color-outline': '#1a5142',
        '--md-sys-color-outline-rgb': '26, 81, 66',
        '--md-sys-color-outline-variant': '#3d7362',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#0a4536',
      },
    },
    'summer': {
      name: 'summer',
      swatch: '#F59E71',
      dark: true,
      vars: {
        '--md-sys-color-background': '#002B4C',
        '--md-sys-color-background-rgb': '0, 43, 76',
        '--md-sys-color-surface': '#0a3a5e',
        '--md-sys-color-surface-variant': '#14496e',
        '--md-sys-color-primary': '#C0EBFF',
        '--md-sys-color-on-primary': '#003049',
        // Was a brown/peach pair — the odd hue out against the theme's
        // blue background and cyan primary. Rebuilt from the cyan itself
        // so summer no longer has any pink/peach accent at all.
        '--md-sys-color-secondary-container': '#005b85',
        '--md-sys-color-on-secondary-container': '#cbe8f6',
        '--md-sys-color-on-surface': '#eaf6ff',
        '--md-sys-color-on-surface-variant': '#9fc2d9',
        '--md-sys-color-outline': '#1c5478',
        '--md-sys-color-outline-rgb': '28, 84, 120',
        '--md-sys-color-outline-variant': '#4380a8',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#0d426a',
      },
    },
    'cherry': {
      name: 'cherry',
      swatch: '#BE2C55',
      dark: true,
      vars: {
        '--md-sys-color-background': '#2A0C1B',
        '--md-sys-color-background-rgb': '42, 12, 27',
        '--md-sys-color-surface': '#391324',
        '--md-sys-color-surface-variant': '#481a2f',
        '--md-sys-color-primary': '#BE2C55',
        '--md-sys-color-on-primary': '#ffffff',
        '--md-sys-color-secondary-container': '#5c2438',
        '--md-sys-color-on-secondary-container': '#FFE0EB',
        '--md-sys-color-on-surface': '#f7e8ee',
        '--md-sys-color-on-surface-variant': '#c9a0b0',
        '--md-sys-color-outline': '#5c2438',
        '--md-sys-color-outline-rgb': '92, 36, 56',
        '--md-sys-color-outline-variant': '#8a4d63',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#401729',
      },
    },
    'grayscale': {
      name: 'grayscale',
      swatch: '#9e9e9e',
      dark: true,
      vars: {
        '--md-sys-color-background': '#121212',
        '--md-sys-color-background-rgb': '18, 18, 18',
        '--md-sys-color-surface': '#1e1e1e',
        '--md-sys-color-surface-variant': '#2c2c2c',
        '--md-sys-color-primary': '#c9c9c9',
        '--md-sys-color-on-primary': '#1a1a1a',
        '--md-sys-color-secondary-container': '#3a3a3a',
        '--md-sys-color-on-secondary-container': '#e0e0e0',
        '--md-sys-color-on-surface': '#e8e8e8',
        '--md-sys-color-on-surface-variant': '#b0b0b0',
        '--md-sys-color-outline': '#444444',
        '--md-sys-color-outline-rgb': '68, 68, 68',
        '--md-sys-color-outline-variant': '#6e6e6e',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#242424',
      },
    },
    'coastline': {
      name: 'coastline',
      swatch: '#CA9A73',
      dark: true,
      vars: {
        '--md-sys-color-background': '#012d2a',
        '--md-sys-color-background-rgb': '1, 45, 42',
        '--md-sys-color-surface': '#01413d',
        '--md-sys-color-surface-variant': '#026963',
        '--md-sys-color-primary': '#CA9A73',
        '--md-sys-color-on-primary': '#013c39',
        '--md-sys-color-secondary-container': '#08726c',
        '--md-sys-color-on-secondary-container': '#F3E6D8',
        '--md-sys-color-on-surface': '#e8eeed',
        '--md-sys-color-on-surface-variant': '#a3ccca',
        '--md-sys-color-outline': '#258983',
        '--md-sys-color-outline-rgb': '37, 137, 131',
        '--md-sys-color-outline-variant': '#4abfb9',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#025550',
      },
    },
    'copper': {
      name: 'copper',
      swatch: '#C98F7C',
      dark: true,
      vars: {
        '--md-sys-color-background': '#121212',
        '--md-sys-color-background-rgb': '18, 18, 18',
        '--md-sys-color-surface': '#1c1c1c',
        '--md-sys-color-surface-variant': '#2e2e2e',
        '--md-sys-color-primary': '#C98F7C',
        '--md-sys-color-on-primary': '#1f1f1f',
        '--md-sys-color-secondary-container': '#1b4a56',
        '--md-sys-color-on-secondary-container': '#c6d8dc',
        '--md-sys-color-on-surface': '#ebebeb',
        '--md-sys-color-on-surface-variant': '#b8b8b8',
        '--md-sys-color-outline': '#5c5c5c',
        '--md-sys-color-outline-rgb': '92, 92, 92',
        '--md-sys-color-outline-variant': '#858585',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#262626',
      },
    },
    'voltage': {
      name: 'voltage',
      swatch: '#E159E4',
      dark: true,
      vars: {
        '--md-sys-color-background': '#011332',
        '--md-sys-color-background-rgb': '1, 19, 50',
        '--md-sys-color-surface': '#021d4a',
        '--md-sys-color-surface-variant': '#032c72',
        '--md-sys-color-primary': '#E159E4',
        '--md-sys-color-on-primary': '#02173c',
        '--md-sys-color-secondary-container': '#092f71',
        '--md-sys-color-on-secondary-container': '#B8F5FA',
        '--md-sys-color-on-surface': '#e8eaed',
        '--md-sys-color-on-surface-variant': '#a3b2cc',
        '--md-sys-color-outline': '#264a88',
        '--md-sys-color-outline-rgb': '38, 74, 136',
        '--md-sys-color-outline-variant': '#4b75be',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#022054',
      },
    },
    'dune': {
      name: 'dune',
      swatch: '#E5A36A',
      dark: true,
      vars: {
        '--md-sys-color-background': '#1f150f',
        '--md-sys-color-background-rgb': '31, 21, 15',
        '--md-sys-color-surface': '#2d1f15',
        '--md-sys-color-surface-variant': '#493222',
        '--md-sys-color-primary': '#E5A36A',
        '--md-sys-color-on-primary': '#2a1d14',
        // The third given color (#A35E2D, a rust brown distinct from the
        // sandy-orange primary) was never actually used — this was derived
        // from the primary instead, so the theme only ever showed 2 of its
        // 3 source colors. Rebuilt from the real third color for balance.
        '--md-sys-color-secondary-container': '#70411f',
        '--md-sys-color-on-secondary-container': '#ebd3c1',
        '--md-sys-color-on-surface': '#eceae9',
        '--md-sys-color-on-surface-variant': '#bfb6b0',
        '--md-sys-color-outline': '#6a5344',
        '--md-sys-color-outline-rgb': '106, 83, 68',
        '--md-sys-color-outline-variant': '#9b816e',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#3b291c',
      },
    },
    'undergrowth': {
      name: 'undergrowth',
      swatch: '#A59A52',
      dark: true,
      vars: {
        '--md-sys-color-background': '#141810',
        '--md-sys-color-background-rgb': '20, 24, 16',
        '--md-sys-color-surface': '#1e2518',
        '--md-sys-color-surface-variant': '#2f3a27',
        '--md-sys-color-primary': '#A59A52',
        '--md-sys-color-on-primary': '#1e2518',
        // The third given color (#4D593C, a muted green distinct from the
        // khaki primary) was never actually used — this was derived from
        // the primary instead, so the theme only ever showed 2 of its 3
        // source colors. Rebuilt from the real third color for balance.
        '--md-sys-color-secondary-container': '#4a5837',
        '--md-sys-color-on-secondary-container': '#d7ddcf',
        '--md-sys-color-on-surface': '#eaebea',
        '--md-sys-color-on-surface-variant': '#b7bcb3',
        '--md-sys-color-outline': '#55614c',
        '--md-sys-color-outline-rgb': '85, 97, 76',
        '--md-sys-color-outline-variant': '#839178',
        '--md-sys-color-error': '#ffb4ab',
        '--md-sys-color-success': '#a6d9a8',
        '--md-sys-state-hover': 'rgba(255,255,255,0.06)',
        '--md-sys-color-hover-surface': '#2a3423',
      },
    },
  };

  // ── Color flip ──────────────────────────────────────────────
  // Inverts every hex role color's HSL lightness (hue/saturation kept),
  // which turns a dark theme into a light one built from the same hues
  // and vice versa, without hand-authoring a flipped variant of every
  // theme. -rgb triplets and the hover overlay are recomputed/re-picked
  // from the flipped hex values rather than inverted directly.
  window.OE_THEME_FLIP_KEY = 'oe-theme-flip';

  function hexToHsl(hex) {
    hex = hex.replace('#', '');
    var r = parseInt(hex.substr(0, 2), 16) / 255;
    var g = parseInt(hex.substr(2, 2), 16) / 255;
    var b = parseInt(hex.substr(4, 2), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  function hslToHex(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    function toHex(x) { var s = Math.round(x * 255).toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
  function invertLightness(hex) {
    var hsl = hexToHsl(hex);
    return hslToHex(hsl[0], hsl[1], 100 - hsl[2]);
  }
  function hexToRgbTriplet(hex) {
    hex = hex.replace('#', '');
    return [0, 2, 4].map(function (i) { return parseInt(hex.substr(i, 2), 16); }).join(', ');
  }
  // Same lightness-inversion as invertLightness, but for an rgba(...)
  // string (the glass themes' translucent surfaces/outlines, which aren't
  // plain hex) — converts to hex, inverts, converts back, keeping the
  // original alpha untouched. Without this, flipping colors on a glass
  // theme only inverted its hex-based vars (background, primary, text)
  // and silently left every rgba-based one (surface, outline, secondary
  // container) exactly as-is.
  function invertRgba(rgba) {
    var m = rgba.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/);
    if (!m) return rgba;
    var hex = '#' + [m[1], m[2], m[3]].map(function (n) {
      var s = (+n).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
    var inv = invertLightness(hex).replace('#', '');
    var r = parseInt(inv.substr(0, 2), 16), g = parseInt(inv.substr(2, 2), 16), b = parseInt(inv.substr(4, 2), 16);
    var a = m[4] !== undefined ? m[4] : 1;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
  function rgbaToTriplet(rgba) {
    var m = rgba.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    return m ? (m[1] + ', ' + m[2] + ', ' + m[3]) : null;
  }
  function invertThemeVars(vars) {
    var out = {};
    for (var k in vars) {
      var v = vars[k];
      if (/-rgb$/.test(k)) continue; // recomputed below from the flipped color
      if (k === '--md-sys-state-hover') {
        out[k] = v.indexOf('255,255,255') !== -1 ? v.replace('255,255,255', '0,0,0') : v.replace('0,0,0', '255,255,255');
        continue;
      }
      if (/^#[0-9a-fA-F]{6}$/.test(v)) out[k] = invertLightness(v);
      else if (/^rgba?\(/.test(v)) out[k] = invertRgba(v);
      else out[k] = v;
    }
    if (out['--md-sys-color-background']) {
      out['--md-sys-color-background-rgb'] = /^#/.test(out['--md-sys-color-background'])
        ? hexToRgbTriplet(out['--md-sys-color-background'])
        : rgbaToTriplet(out['--md-sys-color-background']);
    }
    if (out['--md-sys-color-outline']) {
      out['--md-sys-color-outline-rgb'] = /^#/.test(out['--md-sys-color-outline'])
        ? hexToRgbTriplet(out['--md-sys-color-outline'])
        : rgbaToTriplet(out['--md-sys-color-outline']);
    }
    return out;
  }

  window.applyOeTheme = function (id, flipped) {
    var theme = window.OE_THEMES[id] || window.OE_THEMES['material-dark'];
    if (flipped === undefined) flipped = localStorage.getItem(window.OE_THEME_FLIP_KEY) === '1';
    var vars = flipped ? invertThemeVars(theme.vars) : theme.vars;
    var root = document.documentElement.style;
    root.setProperty('--oe-font-override', theme.fontOverride || '');
    root.setProperty('--oe-bg-image', theme.bgImage || 'none');
    root.setProperty('--oe-glass-blur', theme.glassBlur || 'none');
    for (var k in vars) root.setProperty(k, vars[k]);
    document.documentElement.style.colorScheme = (flipped ? !theme.dark : theme.dark) ? 'dark' : 'light';
  };

  // Applies the frosted-glass effect (backdrop-filter) to every "surface"
  // element site-wide, for the two glassmorphism themes below — --oe-glass-
  // blur is 'none' for every other theme, so this rule is a visual no-op
  // everywhere except light-glass/dark-glass. One shared stylesheet here
  // instead of editing backdrop-filter into 45+ individual page selectors:
  // this list was generated by scanning every page's CSS for anything using
  // var(--md-sys-color-surface) as its background, so it's the full set of
  // "card-like" surfaces across the site, not a guess. If a new page adds
  // another surface-colored component, add its selector here too.
  //
  // glassBlur was originally blur(24px) saturate(1.2) — real scroll jank on
  // these two themes specifically, and worse than the navbar's own blur
  // (see topnav.js): this selector list includes every feed-card class
  // (.ig-card, .post-card, .video-card, .comment, ...), so scrolling any
  // feed means several of these are simultaneously visible and each pays
  // its own blur-recompute cost every frame. Cut to blur(10px) saturate
  // (1.15) — still reads as glass, much cheaper per element, and the
  // saving compounds since it's now cheaper times however many cards are
  // on screen at once instead of just once.
  var GLASS_SELECTORS = [
    '.anon-panel', '.article-card', '.card', '.chat-inputbar', '.comment',
    '.comment-form textarea', '.comment-form-locked', '.convo-row', '.file-card',
    '.filebar', '.folder-card', '.follow-list-modal', '.grid-wrap', '.group',
    '.header-icon-btn', '.home-ai-btn', '.home-search-dropdown', '.home-search-input',
    '.ig-card', '.ig-comment-modal', '.interactive-card', '.item-card', '.kebab-menu',
    '.modal', '.modal-box', '.model-select', '.msg-bubble', '.nav-links', '.note-modal',
    '.post-card', '.profile-card', '.project-card', '.reader-body blockquote',
    '.reader-close-btn', '.search-input', '.sort-dropdown', '.status-card',
    '.thread-actions .vote-col', '.thread-close-btn', '.thread-inputbar', '.tool-card',
    '.toolbar', '.upload-progress', '.video-card', '.vote-col', '.watch-close',
    '.watch-comment-row', '.watch-icon-btn',
  ];
  var glassStyle = document.createElement('style');
  glassStyle.textContent = GLASS_SELECTORS.join(',\n') +
    ' {\n  backdrop-filter: var(--oe-glass-blur, none);\n  -webkit-backdrop-filter: var(--oe-glass-blur, none);\n}';
  document.head.appendChild(glassStyle);

  // Material 3 loading indicators, available sitewide with no import — this
  // file is already loaded via a classic <script> in every page's <head>.
  // Modeled directly on the M3 spec (m3.material.io/components/
  // progress-indicators and .../loading-indicator):
  //   .oe-spinner            — circular progress indicator (track + active
  //                            arc). Indeterminate by default; add
  //                            .determinate and set --oe-progress (0–1) for
  //                            a real percentage, e.g. upload progress.
  //   .oe-loading-bar         — linear progress indicator, same
  //                            indeterminate/.determinate split.
  //   .oe-loading-indicator   — the newer M3 Expressive "loading indicator":
  //                            a single shape that continuously morphs
  //                            between rounded silhouettes while rotating.
  //                            Per spec this is indeterminate-only (never
  //                            used for a process that becomes determinate)
  //                            and is the recommended replacement for a
  //                            plain spinner in short (<5s) wait states —
  //                            use .oe-spinner instead when you actually
  //                            have a percentage to show.
  // All three take .small/.large size modifiers and are theme-aware via the
  // existing color role variables. This design system has no
  // primary-container/on-primary-container tokens (only secondary-container
  // exists across all themes), so the "contained" loading-indicator variant
  // and the progress-indicator track both use secondary-container instead
  // of the M3 spec's literal primary-container — same container role, this
  // codebase's actual token for it.
  var spinnerStyle = document.createElement('style');
  spinnerStyle.textContent = [
    // --oe-spin-a0/--oe-spin-a1 (the arc's start/end angle) are registered
    // via @property so they interpolate smoothly instead of snapping
    // between keyframes — used by both the indeterminate "chasing tail"
    // animation and the determinate mode's fixed sweep.
    '@property --oe-spin-a0 { syntax: "<angle>"; inherits: false; initial-value: 0deg; }',
    '@property --oe-spin-a1 { syntax: "<angle>"; inherits: false; initial-value: 10deg; }',
    '@property --oe-progress { syntax: "<number>"; inherits: false; initial-value: 0; }',

    // ── .oe-spinner — circular progress indicator ──────────────────────
    // The element itself is the track (a solid ring via border); ::before
    // is the active indicator, a conic-gradient masked down to a matching
    // ring and layered exactly on top. ::after is the stop indicator, only
    // shown in determinate mode (marking the fixed end point a perpetually-
    // cycling indeterminate arc has no equivalent of).
    '.oe-spinner {',
    '  position: relative; display: inline-block; width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;',
    '  border: 3px solid var(--md-sys-color-secondary-container);',
    '}',
    '.oe-spinner::before {',
    '  content: ""; position: absolute; inset: -3px; border-radius: 50%;',
    '  background: conic-gradient(from var(--oe-spin-a0), var(--md-sys-color-primary) 0deg, var(--md-sys-color-primary) calc(var(--oe-spin-a1) - var(--oe-spin-a0)), transparent calc(var(--oe-spin-a1) - var(--oe-spin-a0)));',
    '  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));',
    '  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));',
    '  animation: oe-spin-rotate 2s linear infinite, oe-spin-arc 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;',
    '}',
    '.oe-spinner.determinate::before {',
    '  animation: none; --oe-spin-a0: 0deg; --oe-spin-a1: calc(var(--oe-progress, 0) * 360deg); transition: --oe-progress 0.15s ease;',
    '}',
    // Dot center must land on the ring's centerline, which sits half a
    // border-width in from the outer edge — i.e. offset by the FULL border
    // width from the padding box (::after is positioned relative to that
    // padding box, same as ::before's inset above), not half of it.
    '.oe-spinner.determinate::after {',
    '  content: ""; position: absolute; top: -3px; left: 50%; width: 3px; height: 3px; margin-left: -1.5px;',
    '  border-radius: 50%; background: var(--md-sys-color-primary);',
    '}',
    '.oe-spinner.small { width: 16px; height: 16px; border-width: 2px; }',
    '.oe-spinner.small::before { inset: -2px; -webkit-mask-image: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); mask-image: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px)); }',
    '.oe-spinner.small.determinate::after { top: -2px; width: 2px; height: 2px; margin-left: -1px; }',
    '.oe-spinner.large { width: 40px; height: 40px; border-width: 4px; }',
    '.oe-spinner.large::before { inset: -4px; -webkit-mask-image: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px)); mask-image: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 4px)); }',
    '.oe-spinner.large.determinate::after { top: -4px; width: 4px; height: 4px; margin-left: -2px; }',
    '@keyframes oe-spin-rotate { to { transform: rotate(360deg); } }',
    '@keyframes oe-spin-arc {',
    '  0%   { --oe-spin-a0: 0deg;   --oe-spin-a1: 10deg; }',
    '  50%  { --oe-spin-a0: 90deg;  --oe-spin-a1: 270deg; }',
    '  100% { --oe-spin-a0: 360deg; --oe-spin-a1: 370deg; }',
    '}',

    // ── .oe-loading-bar — linear progress indicator ────────────────────
    // ::before is the stop indicator (a fixed dot at the track's end —
    // present in both modes here, since unlike the circular case the
    // track itself has a fixed direction/end regardless of behavior).
    // ::after is the active indicator: sliding when indeterminate, a
    // left-anchored fill driven by --oe-progress when .determinate.
    '.oe-loading-bar {',
    '  position: relative; width: 100%; height: 4px; border-radius: 100px;',
    '  background: var(--md-sys-color-secondary-container); overflow: hidden;',
    '}',
    '.oe-loading-bar::before {',
    '  content: ""; position: absolute; top: 50%; right: 2px; width: 4px; height: 4px; margin-top: -2px;',
    '  border-radius: 50%; background: var(--md-sys-color-primary); z-index: 2;',
    '}',
    '.oe-loading-bar::after {',
    '  content: ""; position: absolute; top: 0; left: -40%; height: 100%; width: 40%; z-index: 1;',
    '  background: var(--md-sys-color-primary); border-radius: 100px;',
    '  animation: oe-loading-bar-slide 1.3s cubic-bezier(0.4,0,0.2,1) infinite;',
    '}',
    '.oe-loading-bar.determinate::after {',
    '  animation: none; left: 0; width: calc(var(--oe-progress, 0) * 100%); transition: width 0.15s ease;',
    '}',
    '@keyframes oe-loading-bar-slide {',
    '  0% { left: -40%; width: 40%; }',
    '  50% { left: 30%; width: 55%; }',
    '  100% { left: 100%; width: 40%; }',
    '}',

    '.oe-spinner-row { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 24px 0; color: var(--md-sys-color-on-surface-variant); font-size: 13px; }',

    // ── .oe-loading-indicator — M3 Expressive loading indicator ────────
    // A single shape morphs between five hand-computed 16-point blob
    // silhouettes (near-circle, 3/4/5-lobe "cookie" shapes, and a soft
    // oval) via clip-path polygon interpolation, while rotating
    // independently — clip-path polygons only interpolate smoothly when
    // every keyframe has the same point count, hence 16 points even for
    // the rounder shapes. Sizing follows the spec's "48dp container /
    // 38dp shape" ratio.
    '.oe-loading-indicator {',
    '  display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; flex-shrink: 0;',
    '}',
    '.oe-loading-indicator::before {',
    '  content: ""; display: block; width: 38px; height: 38px; background: var(--md-sys-color-primary);',
    '  animation: oe-loading-blob-morph 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite, oe-spin-rotate 3.6s linear infinite;',
    '}',
    '.oe-loading-indicator.small { width: 32px; height: 32px; }',
    '.oe-loading-indicator.small::before { width: 25px; height: 25px; }',
    '.oe-loading-indicator.large { width: 64px; height: 64px; }',
    '.oe-loading-indicator.large::before { width: 50px; height: 50px; }',
    '.oe-loading-indicator.contained { background: var(--md-sys-color-secondary-container); border-radius: 50%; }',
    '.oe-loading-indicator.contained::before { background: var(--md-sys-color-on-secondary-container); }',
    '@keyframes oe-loading-blob-morph {',
    '  0%   { clip-path: polygon(95.0% 50.0%, 91.6% 67.2%, 81.8% 81.8%, 67.2% 91.6%, 50.0% 95.0%, 32.8% 91.6%, 18.2% 81.8%, 8.4% 67.2%, 5.0% 50.0%, 8.4% 32.8%, 18.2% 18.2%, 32.8% 8.4%, 50.0% 5.0%, 67.2% 8.4%, 81.8% 18.2%, 91.6% 32.8%); }',
    '  25%  { clip-path: polygon(101.3% 50.0%, 89.3% 66.3%, 78.7% 78.7%, 69.4% 97.0%, 50.0% 95.0%, 35.0% 86.2%, 15.0% 85.0%, 6.2% 68.1%, 11.3% 50.0%, 6.2% 31.9%, 15.0% 15.0%, 35.0% 13.8%, 50.0% 5.0%, 69.4% 3.0%, 78.7% 21.3%, 89.3% 33.7%); }',
    '  50%  { clip-path: polygon(102.2% 50.0%, 91.6% 67.2%, 76.7% 76.7%, 67.2% 91.6%, 50.0% 102.2%, 32.8% 91.6%, 23.3% 76.7%, 8.4% 67.2%, -2.2% 50.0%, 8.4% 32.8%, 23.3% 23.3%, 32.8% 8.4%, 50.0% -2.2%, 67.2% 8.4%, 76.7% 23.3%, 91.6% 32.8%); }',
    '  75%  { clip-path: polygon(103.1% 50.0%, 94.4% 68.4%, 77.8% 77.8%, 64.4% 84.7%, 50.0% 95.0%, 29.9% 98.5%, 14.1% 85.9%, 11.3% 66.0%, 13.1% 50.0%, 11.3% 34.0%, 14.1% 14.1%, 29.9% 1.5%, 50.0% 5.0%, 64.4% 15.3%, 77.8% 22.2%, 94.4% 31.6%); }',
    '  100% { clip-path: polygon(95.0% 50.0%, 91.6% 67.2%, 81.8% 81.8%, 67.2% 91.6%, 50.0% 95.0%, 32.8% 91.6%, 18.2% 81.8%, 8.4% 67.2%, 5.0% 50.0%, 8.4% 32.8%, 18.2% 18.2%, 32.8% 8.4%, 50.0% 5.0%, 67.2% 8.4%, 81.8% 18.2%, 91.6% 32.8%); }',
    '}',
  ].join('\n');
  document.head.appendChild(spinnerStyle);

  // Cross-document view transitions: every page here is a separate static
  // .html file, so normal <a href> navigation is a full document load, not
  // an SPA route change. The `@view-transition { navigation: auto }` at-rule
  // (Chrome/Edge 126+; no-ops elsewhere, so this is pure enhancement) makes
  // the browser itself snapshot the old and new page and cross-fade between
  // them instead of a hard cut — Material/Android "fade through" style:
  // the old page fades and settles slightly inward, the new one fades in
  // from slightly enlarged. Skipped entirely for prefers-reduced-motion.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var transitionStyle = document.createElement('style');
    transitionStyle.textContent = [
      '@view-transition { navigation: auto; }',
      '::view-transition-old(root) { animation: 160ms cubic-bezier(0.4, 0, 1, 1) both oe-page-out; }',
      '::view-transition-new(root) { animation: 220ms cubic-bezier(0, 0, 0.2, 1) both oe-page-in; }',
      '@keyframes oe-page-out { to { opacity: 0; transform: scale(0.98); } }',
      '@keyframes oe-page-in { from { opacity: 0; transform: scale(1.02); } }',
    ].join('\n');
    document.head.appendChild(transitionStyle);
  }

  var saved = localStorage.getItem(window.OE_THEME_KEY) || 'material-dark';
  var savedFlip = localStorage.getItem(window.OE_THEME_FLIP_KEY) === '1';
  window.applyOeTheme(saved, savedFlip);
})();
