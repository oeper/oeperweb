// Persistent top navigation bar — logo, site search, nav links, chat/settings
// icons, account chip. Self-contained styles (like footer.js/account.js) so
// any page can just import mountTopNav() and call it once with no markup
// changes needed beyond an empty container to mount into (or none — it
// inserts itself at the top of <body> if no container is given).
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every `from './shared/topnav.js?v=N'`
// import across the site (grep for it) — otherwise visitors can sit on a
// stale cached copy for hours after a deploy.
import { mountAccountBar, db, getCurrentUser, getProfile, ensureProfileLoaded, handleOf, onAccountChange } from './account.js?v=16';
import {
  collection, query, orderBy, limit, getDocs, onSnapshot, where, doc, updateDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// The site's actual logo (icon.svg's path, inlined so it recolors via
// currentColor and doesn't cost an extra request) — keep in sync with
// icon.svg at the repo root if that ever changes.
export const LOGO_SVG = `<svg viewBox="0 0 98 118" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M97.21 104.246C99.8214 110.812 94.9842 117.941 87.918 117.941H10.0098C2.94348 117.941 -1.89373 110.812 0.717769 104.246L24.9966 43.2019C25.2993 42.4406 26.0357 41.941 26.855 41.941H71.0728C71.892 41.941 72.6284 42.4406 72.9312 43.2019L97.21 104.246ZM39.6719 6.30428C43.0151 -2.10143 54.9127 -2.10143 58.2559 6.30428L65.3744 24.2018C65.8967 25.515 64.9293 26.941 63.516 26.941H34.4117C32.9985 26.941 32.031 25.515 32.5533 24.2018L39.6719 6.30428Z"/></svg>`;

const NAV_ITEMS = [
  { id: 'home', title: 'Home', icon: 'home', url: 'https://oeper.dev/', path: '/' },
  { id: 'feed', title: 'Feed', icon: 'forum', url: 'https://oeper.dev/feed', path: '/feed' },
  { id: 'videos', title: 'Videos', icon: 'smart_display', url: 'https://oeper.dev/videos', path: '/videos' },
  { id: 'projects', title: 'Projects', icon: 'apps', url: 'https://oeper.dev/projects', path: '/projects' },
  { id: 'files', title: 'Files', icon: 'folder', url: 'https://oeper.dev/files', path: '/files' },
  { id: 'tools', title: 'Tools', icon: 'build', url: 'https://oeper.dev/tools', path: '/tools' },
];

function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function normalizePath(p) {
  let n = p.replace(/\.html$/, '');
  if (n.length > 1) n = n.replace(/\/$/, '');
  return n || '/';
}
function isActiveItem(item) {
  const current = normalizePath(window.location.pathname);
  if (item.id === 'home') return current === '/' || current === '/index';
  return current === item.path;
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-navbar {
      position: sticky; top: 0; z-index: 100;
      background-color: rgba(var(--md-sys-color-background-rgb, 17, 19, 24), 0.8);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(var(--md-sys-color-outline-rgb, 67, 71, 78), 0.4);
      padding: 0 24px; height: 72px;
      display: flex; align-items: center; gap: 12px;
    }
    .oe-nav-logo {
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      color: var(--md-sys-color-on-surface); text-decoration: none;
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); font-size: 22px;
      -webkit-tap-highlight-color: transparent;
    }
    .oe-nav-logo:visited { color: var(--md-sys-color-on-surface); }
    .oe-nav-logo-icon { width: 26px; height: 26px; color: var(--md-sys-color-primary); flex-shrink: 0; }
    .oe-nav-logo-icon svg { width: 100%; height: 100%; display: block; }

    .oe-nav-search-wrap { position: relative; flex: 1 1 auto; min-width: 0; max-width: 420px; margin: 0 4px; }
    .oe-nav-search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--md-sys-color-on-surface-variant); font-size: 20px; pointer-events: none;
    }
    .oe-nav-search-input {
      width: 100%; background-color: var(--md-sys-color-surface-variant); border: 1px solid transparent;
      border-radius: 20px; padding: 9px 14px 9px 40px; color: var(--md-sys-color-on-surface);
      font-family: var(--oe-font-override, 'Google Sans', 'Roboto Flex', sans-serif); font-size: 14px; outline: none;
      transition: border-color 0.2s, background-color 0.2s;
    }
    .oe-nav-search-input::placeholder { color: var(--md-sys-color-on-surface-variant); }
    .oe-nav-search-input:focus { border-color: var(--md-sys-color-primary); background-color: var(--md-sys-color-background); }
    .oe-nav-search-mobile-close { display: none; }

    .oe-nav-search-dropdown {
      position: absolute; top: calc(100% + 8px); left: 0; right: 0;
      background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline);
      border-radius: 16px; padding: 8px; max-height: 420px; overflow-y: auto; z-index: 20;
      opacity: 0; pointer-events: none; transform: translateY(-6px);
      transition: opacity 0.15s, transform 0.15s;
      box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    }
    .oe-nav-search-dropdown.open { opacity: 1; pointer-events: all; transform: translateY(0); }
    .oe-nsd-row {
      display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px;
      cursor: pointer; text-decoration: none; color: inherit;
    }
    .oe-nsd-row:visited { color: inherit; }
    .oe-nsd-row:hover { background: var(--md-sys-state-hover); }
    .oe-nsd-icon {
      width: 34px; height: 34px; border-radius: 50%; background: var(--md-sys-color-surface-variant);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden;
    }
    .oe-nsd-icon img { width: 100%; height: 100%; object-fit: cover; }
    .oe-nsd-icon .material-symbols-rounded { font-size: 17px; color: var(--md-sys-color-on-surface-variant); }
    .oe-nsd-main { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oe-nsd-name { font-weight: 500; }
    .oe-nsd-cat { color: var(--md-sys-color-on-surface-variant); font-weight: 400; }
    .oe-nsd-empty, .oe-nsd-loading { padding: 18px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 13px; }

    .oe-nav-mobile-search-btn {
      display: none; align-items: center; justify-content: center; width: 40px; height: 40px;
      border-radius: 50%; border: none; background: transparent; color: var(--md-sys-color-on-surface);
      cursor: pointer; -webkit-tap-highlight-color: transparent; flex-shrink: 0;
    }
    .oe-nav-mobile-search-btn .material-symbols-rounded { font-size: 22px; }

    .oe-nav-right { display: flex; align-items: center; gap: 16px; min-width: 0; margin-left: auto; }

    .oe-nav-notif-wrap { position: relative; flex-shrink: 0; }
    .oe-nav-notif-btn { position: relative; border: none; background: transparent; padding: 0; cursor: pointer; }
    .oe-nav-notif-dot {
      position: absolute; top: -2px; right: -2px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 100px;
      background: var(--md-sys-color-error, #ffb4ab); color: #410002; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      animation: oeNotifDotIn 260ms cubic-bezier(0.2, 0, 0, 1);
    }
    @keyframes oeNotifDotIn { from { transform: scale(0); } to { transform: scale(1); } }

    .oe-notif-dropdown {
      position: absolute; top: calc(100% + 12px); right: 0; width: min(380px, 90vw);
      background: var(--md-sys-color-surface); border: 1px solid var(--md-sys-color-outline);
      border-radius: 16px; max-height: 480px; overflow-y: auto; z-index: 20;
      opacity: 0; pointer-events: none; transform: translateY(-6px) scale(0.98);
      transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1);
      box-shadow: 0 12px 32px rgba(0,0,0,0.4);
    }
    .oe-notif-dropdown.open { opacity: 1; pointer-events: all; transform: translateY(0) scale(1); }
    .oe-notif-header {
      display: flex; align-items: center; justify-content: space-between; padding: 14px 16px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant); position: sticky; top: 0;
      background: var(--md-sys-color-surface);
    }
    .oe-notif-header h3 { font-size: 15px; font-weight: 500; }
    .oe-notif-mark-read {
      background: none; border: none; color: var(--md-sys-color-primary); font-size: 12px; font-weight: 500;
      cursor: pointer; font-family: inherit; -webkit-tap-highlight-color: transparent;
    }
    .oe-notif-section-label {
      padding: 10px 16px 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.4px; color: var(--md-sys-color-on-surface-variant);
    }
    .oe-notif-row {
      display: flex; align-items: flex-start; gap: 10px; padding: 10px 16px; text-decoration: none; color: inherit;
      transition: background-color 0.15s;
    }
    .oe-notif-row:hover { background: var(--md-sys-state-hover); }
    .oe-notif-row.unread { background: rgba(168,199,250,0.08); }
    .oe-notif-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant); flex-shrink: 0; }
    .oe-notif-icon {
      width: 36px; height: 36px; border-radius: 50%; background: var(--md-sys-color-surface-variant); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; color: var(--md-sys-color-primary);
    }
    .oe-notif-main { flex: 1; min-width: 0; font-size: 13px; line-height: 1.4; }
    .oe-notif-main strong { font-weight: 600; }
    .oe-notif-time { color: var(--md-sys-color-on-surface-variant); font-size: 11px; margin-top: 2px; }
    .oe-notif-unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--md-sys-color-primary); flex-shrink: 0; margin-top: 6px; }
    .oe-notif-empty { padding: 40px 20px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 13px; }

    .oe-nav-icon-link {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      color: var(--md-sys-color-on-surface-variant); text-decoration: none;
      -webkit-tap-highlight-color: transparent; border: none; background: transparent; padding: 0; font: inherit;
    }
    .oe-nav-icon-link:visited { color: var(--md-sys-color-on-surface-variant); }
    .oe-nav-icon-link .material-symbols-rounded { font-size: 24px; }
    .oe-nav-icon-link:hover { color: var(--md-sys-color-on-surface); }

    .oe-nav-hamburger {
      display: none; align-items: center; justify-content: center; width: 40px; height: 40px;
      border-radius: 50%; border: none; background: transparent; color: var(--md-sys-color-on-surface);
      cursor: pointer; -webkit-tap-highlight-color: transparent; flex-shrink: 0;
      transition: background-color 0.2s;
    }
    .oe-nav-hamburger:hover { background-color: var(--md-sys-state-hover); }
    .oe-nav-hamburger .material-symbols-rounded {
      font-size: 24px; display: inline-block; transition: transform 320ms cubic-bezier(0.2, 0, 0, 1);
    }
    .oe-nav-hamburger.open .material-symbols-rounded { transform: rotate(90deg); }

    .oe-nav-links { display: flex; gap: 8px; height: 100%; align-items: center; }

    .oe-nav-item {
      position: relative; display: flex; align-items: center; gap: 6px;
      padding: 10px 18px; text-decoration: none; color: var(--md-sys-color-on-surface-variant);
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); font-size: 15px; font-weight: 500;
      border-radius: 20px; transition: color 400ms cubic-bezier(0.2, 0, 0, 1);
      -webkit-tap-highlight-color: transparent;
    }
    .oe-nav-item:visited { color: var(--md-sys-color-on-surface-variant); }
    .oe-nav-item .material-symbols-rounded { font-size: 20px; }
    .oe-nav-item::before {
      content: ''; position: absolute; inset: 0; background-color: var(--md-sys-color-surface-variant);
      border-radius: 20px; opacity: 0; transform: scaleX(0.7);
      transition: opacity 400ms cubic-bezier(0.2, 0, 0, 1), transform 400ms cubic-bezier(0.3, 0, 0, 1);
      z-index: -1;
    }
    .oe-nav-item:hover { color: var(--md-sys-color-on-surface); }
    .oe-nav-item:hover::before { opacity: 0.5; transform: scaleX(1); }
    .oe-nav-item.active { color: var(--md-sys-color-on-secondary-container, #d2e4ff); }
    .oe-nav-item.active::before {
      background-color: var(--md-sys-color-secondary-container, #33485d);
      opacity: 1; transform: scaleX(1);
    }

    @media (max-width: 600px) {
      .oe-navbar { padding: 0 12px; gap: 8px; }
      .oe-nav-logo span:last-child { display: none; }
      .oe-nav-hamburger { display: flex; }
      .oe-nav-search-wrap { display: none; }
      .oe-nav-mobile-search-btn { display: flex; }

      .oe-nav-search-wrap.mobile-open {
        display: flex; align-items: center; position: fixed; top: 0; left: 0; right: 0; height: 72px;
        background: var(--md-sys-color-background); z-index: 160; margin: 0; padding: 0 56px 0 12px; max-width: none;
        animation: oeNavSearchIn 220ms cubic-bezier(0.2, 0, 0, 1);
      }
      @keyframes oeNavSearchIn {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .oe-nav-search-wrap.mobile-open .oe-nav-search-dropdown { top: 72px; left: 12px; right: 12px; border-radius: 16px; }
      .oe-nav-search-wrap.mobile-open .oe-nav-search-mobile-close {
        display: flex; position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent;
        color: var(--md-sys-color-on-surface); align-items: center; justify-content: center; cursor: pointer;
      }

      .oe-nav-backdrop {
        /* z-index must stay below .oe-navbar's own (100): .oe-navbar creates
           its own stacking context (position: sticky + z-index), so its
           children's z-index (e.g. #oeNavLinks at 150) only ranks against
           siblings inside that context — a backdrop with a higher root-level
           z-index than the navbar would render on top of the whole navbar,
           including the dropdown, and silently swallow every tap on it. */
        position: fixed; inset: 0; top: 72px; z-index: 90; background: rgba(0,0,0,0.4);
        opacity: 0; pointer-events: none; transition: opacity 280ms ease;
      }
      .oe-nav-backdrop.open { opacity: 1; pointer-events: all; }

      .oe-nav-links {
        display: flex; position: fixed; top: 72px; left: 0; right: 0; z-index: 150; height: auto;
        flex-direction: column; align-items: stretch; gap: 2px;
        background-color: var(--md-sys-color-surface); border-bottom: 1px solid var(--md-sys-color-outline-variant);
        padding: 0 8px; overflow: hidden; max-height: 0; opacity: 0; visibility: hidden;
        box-shadow: 0 12px 24px rgba(0,0,0,0.35);
        transition: max-height 340ms cubic-bezier(0.2, 0, 0, 1), opacity 220ms ease, padding 340ms cubic-bezier(0.2, 0, 0, 1), visibility 0s linear 340ms;
      }
      .oe-nav-links.mobile-open {
        max-height: min(70vh, calc(100vh - 72px)); opacity: 1; visibility: visible; padding: 8px;
        overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
        transition: max-height 340ms cubic-bezier(0.2, 0, 0, 1), opacity 260ms ease, padding 340ms cubic-bezier(0.2, 0, 0, 1);
      }
      .oe-nav-item {
        width: auto; height: auto; border-radius: 14px; justify-content: flex-start; padding: 14px 16px; gap: 14px;
        opacity: 0; transition: color 400ms cubic-bezier(0.2, 0, 0, 1), opacity 260ms ease;
      }
      .oe-nav-item::before { border-radius: 14px; }
      .oe-nav-links.mobile-open .oe-nav-item { opacity: 1; }
      .oe-nav-links.mobile-open .oe-nav-item-label { display: inline; font-size: 15px; }
      #oeNavAccountBar { flex-shrink: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function mountTopNav(container) {
  injectStyles();
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="oe-nav-backdrop" id="oeNavBackdrop"></div>
    <nav class="oe-navbar">
      <button class="oe-nav-hamburger" id="oeNavHamburger" aria-label="Menu" aria-expanded="false"><span class="material-symbols-rounded">menu</span></button>
      <a href="https://oeper.dev/" class="oe-nav-logo">
        <span class="oe-nav-logo-icon">${LOGO_SVG}</span>
        <span>oeper.dev</span>
      </a>
      <div class="oe-nav-search-wrap" id="oeNavSearchWrap">
        <span class="material-symbols-rounded oe-nav-search-icon">search</span>
        <input class="oe-nav-search-input" id="oeNavSearchInput" type="text" placeholder="Search oeper.dev…" autocomplete="off">
        <button class="oe-nav-search-mobile-close" id="oeNavSearchMobileClose" aria-label="Close search"><span class="material-symbols-rounded">close</span></button>
        <div class="oe-nav-search-dropdown" id="oeNavSearchDropdown"></div>
      </div>
      <button class="oe-nav-mobile-search-btn" id="oeNavMobileSearchBtn" aria-label="Search"><span class="material-symbols-rounded">search</span></button>
      <div class="oe-nav-right">
        <div class="oe-nav-links" id="oeNavLinks"></div>
        <div class="oe-nav-notif-wrap">
          <button class="oe-nav-icon-link oe-nav-notif-btn" id="oeNavNotifBtn" title="Notifications" style="display:none;">
            <span class="material-symbols-rounded">notifications</span>
            <span class="oe-nav-notif-dot" id="oeNavNotifDot" style="display:none;"></span>
          </button>
          <div class="oe-notif-dropdown" id="oeNotifDropdown"></div>
        </div>
        <a href="/messages" class="oe-nav-icon-link" title="Chat"><span class="material-symbols-rounded" id="oeNavChatIcon">chat_bubble</span></a>
        <a href="/settings" class="oe-nav-icon-link" title="Settings"><span class="material-symbols-rounded">settings</span></a>
        <div id="oeNavAccountBar"></div>
      </div>
    </nav>
  `;
  const navEl = el.querySelector('.oe-navbar');
  const backdropEl = el.querySelector('#oeNavBackdrop');
  if (container) {
    container.appendChild(backdropEl);
    container.appendChild(navEl);
  } else {
    document.body.insertBefore(navEl, document.body.firstChild);
    document.body.insertBefore(backdropEl, navEl);
  }

  const navLinks = navEl.querySelector('#oeNavLinks');
  NAV_ITEMS.forEach(item => {
    const a = document.createElement('a');
    a.className = 'oe-nav-item' + (isActiveItem(item) ? ' active' : '');
    a.href = item.url;
    a.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span><span class="oe-nav-item-label">${item.title}</span>`;
    navLinks.appendChild(a);
  });

  const hamburger = navEl.querySelector('#oeNavHamburger');
  const backdrop = backdropEl;
  const hamburgerIcon = hamburger.querySelector('.material-symbols-rounded');
  function setMobileMenu(open) {
    navLinks.classList.toggle('mobile-open', open);
    hamburger.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburgerIcon.textContent = open ? 'close' : 'menu';
    backdrop.classList.toggle('open', open);
  }
  hamburger.addEventListener('click', () => setMobileMenu(!navLinks.classList.contains('mobile-open')));
  backdrop.addEventListener('click', () => setMobileMenu(false));
  navLinks.addEventListener('click', e => { if (e.target.closest('.oe-nav-item')) setMobileMenu(false); });
  document.addEventListener('click', e => {
    if (navLinks.classList.contains('mobile-open') && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      setMobileMenu(false);
    }
  });

  mountAccountBar(navEl.querySelector('#oeNavAccountBar'));
  initSearch(navEl);
  initNotifications(navEl);
  initChatUnread(navEl);
}

// ── Chat unread icon ────────────────────────────────────────
// No server-tracked read state — "read" is just a localStorage
// timestamp per conversation, written by messages.html when a thread is
// opened. A conversation counts as unread if its last message wasn't
// sent by you and arrived after that timestamp (or was never opened).
function initChatUnread(navEl) {
  const icon = navEl.querySelector('#oeNavChatIcon');
  let unsub = null;
  function subscribe(user) {
    if (unsub) { unsub(); unsub = null; }
    if (!user) { icon.textContent = 'chat_bubble'; return; }
    unsub = onSnapshot(
      query(collection(db, 'conversations'), where('participants', 'array-contains', user.email)),
      snap => {
        const hasUnread = snap.docs.some(d => {
          const c = d.data();
          if (!c.lastMessageSenderEmail || c.lastMessageSenderEmail === user.email) return false;
          const lastMs = c.updatedAt && c.updatedAt.toMillis ? c.updatedAt.toMillis() : 0;
          const readMs = Number(localStorage.getItem('oe-chat-read-' + d.id) || 0);
          return lastMs > readMs;
        });
        icon.textContent = hasUnread ? 'mark_chat_unread' : 'chat_bubble';
      },
      () => { icon.textContent = 'chat_bubble'; }
    );
  }
  onAccountChange(subscribe);
}

function initSearch(navEl) {
  const searchWrap = navEl.querySelector('#oeNavSearchWrap');
  const searchInput = navEl.querySelector('#oeNavSearchInput');
  const dropdown = navEl.querySelector('#oeNavSearchDropdown');
  const mobileBtn = navEl.querySelector('#oeNavMobileSearchBtn');
  const mobileClose = navEl.querySelector('#oeNavSearchMobileClose');

  function closeDropdown() { dropdown.classList.remove('open'); }

  mobileBtn.addEventListener('click', () => {
    searchWrap.classList.add('mobile-open');
    searchInput.focus();
  });
  mobileClose.addEventListener('click', () => {
    searchWrap.classList.remove('mobile-open');
    closeDropdown();
  });

  let corpusPromise = null;
  function loadCorpus() {
    if (corpusPromise) return corpusPromise;
    corpusPromise = Promise.allSettled([
      getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(300))),
      getDocs(query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(300))),
      getDocs(query(collection(db, 'projects'), orderBy('createdAt', 'desc'), limit(300))),
      getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(300))),
    ]).then(([postsR, videosR, projectsR, usersR]) => ({
      posts: postsR.status === 'fulfilled' ? postsR.value.docs.map(d => ({ id: d.id, ...d.data() })) : [],
      videos: videosR.status === 'fulfilled' ? videosR.value.docs.map(d => ({ id: d.id, ...d.data() })) : [],
      projects: projectsR.status === 'fulfilled' ? projectsR.value.docs.map(d => ({ id: d.id, ...d.data() })) : [],
      users: usersR.status === 'fulfilled' ? usersR.value.docs.map(d => ({ email: d.id, ...d.data() })) : [],
    }));
    return corpusPromise;
  }

  function matchRank(name, q) {
    const idx = (name || '').toLowerCase().indexOf(q);
    if (idx === -1) return -1;
    return idx === 0 ? 0 : 1;
  }

  async function runSearch(qRaw) {
    const q = qRaw.trim().toLowerCase();
    if (!q) { closeDropdown(); return; }
    dropdown.innerHTML = '<div class="oe-nsd-loading">Searching…</div>';
    dropdown.classList.add('open');

    let corpus;
    try { corpus = await loadCorpus(); } catch { corpus = { posts: [], videos: [], projects: [], users: [] }; }
    if (searchInput.value.trim().toLowerCase() !== q) return;

    const results = [];
    corpus.users.forEach(u => {
      if (!u.handle) return;
      const name = u.displayName || u.handle;
      const rank = Math.min(
        matchRank(name, q) === -1 ? 99 : matchRank(name, q),
        matchRank(u.handle, q) === -1 ? 99 : matchRank(u.handle, q)
      );
      if (rank < 99) results.push({ rank, name, sub: 'in People', url: `/profile?u=${encodeURIComponent(u.handle)}`, photo: getProfile(u.email, u.displayName, u.photoURL).photo, icon: 'person' });
    });
    corpus.posts.forEach(p => {
      const name = p.title || p.body || '';
      const rank = matchRank(name, q);
      if (rank !== -1) results.push({ rank, name, sub: 'in Feed', url: `/feed?post=${p.id}`, icon: 'forum' });
    });
    corpus.videos.forEach(v => {
      const rank = matchRank(v.title, q);
      if (rank !== -1) results.push({ rank, name: v.title || '', sub: 'in Videos', url: `/videos?video=${v.id}`, icon: 'smart_display' });
    });
    corpus.projects.forEach(p => {
      const rank = matchRank(p.title, q);
      if (rank !== -1) results.push({ rank, name: p.title || '', sub: 'in Projects', url: `/projects?project=${p.id}`, icon: 'apps' });
    });

    results.sort((a, b) => a.rank - b.rank);
    const top = results.slice(0, 8);

    if (top.length === 0) {
      dropdown.innerHTML = `<div class="oe-nsd-empty">No results for "${escHtml(qRaw.trim())}"</div>`;
      return;
    }
    dropdown.innerHTML = top.map(r => `
      <a class="oe-nsd-row" href="${r.url}">
        <div class="oe-nsd-icon">${r.photo ? `<img src="${r.photo}" alt="">` : `<span class="material-symbols-rounded">${r.icon}</span>`}</div>
        <div class="oe-nsd-main"><span class="oe-nsd-name">${escHtml(r.name)}</span> <span class="oe-nsd-cat">${r.sub}</span></div>
      </a>
    `).join('');
  }

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (!q) { closeDropdown(); return; }
    debounceTimer = setTimeout(() => runSearch(q), 220);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) dropdown.classList.add('open');
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDropdown();
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.oe-nsd-row');
      if (first) window.location.href = first.getAttribute('href');
    }
  });
  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target) && e.target !== searchInput) closeDropdown();
  });
}

// ── Notifications bell ──────────────────────────────────────
// Reads the notifications collection written by sendNotification()
// (shared/account.js) — upvotes, comments, follows, badge grants. The
// query below (recipientEmail == you, ordered by createdAt) needs a
// Firestore composite index; the first time this runs against a fresh
// project, the console will print a one-click link to create it.
function notifTimeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
  return date.toLocaleDateString();
}
function notifText(n) {
  const name = `<strong>${escHtml(n.actorName || 'Someone')}</strong>`;
  const target = escHtml(n.targetKind || 'post');
  if (n.type === 'upvote') return `${name} upvoted your ${target}${n.preview ? ': ' + escHtml(n.preview) : ''}`;
  if (n.type === 'comment') return `${name} commented on your ${target}${n.preview ? ': ' + escHtml(n.preview) : ''}`;
  if (n.type === 'follow') return `${name} started following you`;
  if (n.type === 'badge') return `You were given a badge${n.preview ? ': ' + escHtml(n.preview) : ''}`;
  return name;
}
function notifUrl(n) {
  if (n.type === 'follow') { const h = handleOf(n.actorEmail); return h ? `/profile?u=${encodeURIComponent(h)}` : '/'; }
  if (n.type === 'badge') return '/settings';
  if (n.targetKind === 'post') return `/feed?post=${n.targetId}`;
  if (n.targetKind === 'video') return `/videos?video=${n.targetId}`;
  if (n.targetKind === 'project') return `/projects?project=${n.targetId}`;
  return '/';
}

function initNotifications(navEl) {
  const btn = navEl.querySelector('#oeNavNotifBtn');
  const bellIcon = btn.querySelector('.material-symbols-rounded');
  const dot = navEl.querySelector('#oeNavNotifDot');
  const dropdown = navEl.querySelector('#oeNotifDropdown');
  let items = [];
  let unsub = null;

  function closeDropdown() { dropdown.classList.remove('open'); }

  function rowHtml(n) {
    const profile = getProfile(n.actorEmail, n.actorName, n.actorPhoto);
    const icon = { upvote: 'favorite', comment: 'mode_comment', follow: 'person_add', badge: 'verified' }[n.type] || 'notifications';
    return `
      <a class="oe-notif-row ${n.read ? '' : 'unread'}" href="${notifUrl(n)}" data-id="${n.id}">
        ${n.type === 'badge'
          ? `<div class="oe-notif-icon"><span class="material-symbols-rounded">${icon}</span></div>`
          : `<img class="oe-notif-avatar" src="${profile.photo || ''}" alt="">`}
        <div class="oe-notif-main">
          <div>${notifText(n)}</div>
          <div class="oe-notif-time">${notifTimeAgo(n._date)}</div>
        </div>
        ${n.read ? '' : '<div class="oe-notif-unread-dot"></div>'}
      </a>
    `;
  }

  function renderError(err) {
    dot.style.display = 'none';
    const needsSetup = err && (err.code === 'permission-denied' || err.code === 'failed-precondition');
    dropdown.innerHTML = `
      <div class="oe-notif-header"><h3>Notifications</h3></div>
      <div class="oe-notif-empty">${needsSetup
        ? "Notifications aren't fully set up yet on this site — ask the owner to publish firestore.rules and create the notifications index (check the browser console for a one-click link)."
        : 'Could not load notifications. Try again shortly.'}</div>
    `;
  }

  function render() {
    const unread = items.filter(n => !n.read);
    const read = items.filter(n => n.read);
    dot.style.display = unread.length ? 'flex' : 'none';
    dot.textContent = unread.length > 9 ? '9+' : String(unread.length);
    bellIcon.textContent = unread.length ? 'notifications_unread' : 'notifications';

    if (items.length === 0) {
      dropdown.innerHTML = `
        <div class="oe-notif-header"><h3>Notifications</h3></div>
        <div class="oe-notif-empty">Nothing yet — activity on your posts, comments, and profile shows up here.</div>
      `;
      return;
    }
    dropdown.innerHTML = `
      <div class="oe-notif-header">
        <h3>Notifications</h3>
        ${unread.length ? `<button type="button" class="oe-notif-mark-read" id="oeNotifMarkAll">Mark all read</button>` : ''}
      </div>
      ${unread.length ? `<div class="oe-notif-section-label">New</div>${unread.map(rowHtml).join('')}` : ''}
      ${read.length ? `<div class="oe-notif-section-label">Earlier</div>${read.map(rowHtml).join('')}` : ''}
    `;
    const markAllBtn = dropdown.querySelector('#oeNotifMarkAll');
    if (markAllBtn) markAllBtn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const batch = writeBatch(db);
      unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }));
      try { await batch.commit(); } catch {}
    });
    dropdown.querySelectorAll('.oe-notif-row').forEach(row => {
      row.addEventListener('click', () => {
        const n = items.find(x => x.id === row.dataset.id);
        if (n && !n.read) updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {});
      });
    });
  }

  function subscribe(user) {
    if (unsub) { unsub(); unsub = null; }
    if (!user) {
      btn.style.display = 'none';
      items = [];
      closeDropdown();
      return;
    }
    btn.style.display = 'flex';
    unsub = onSnapshot(
      query(collection(db, 'notifications'), where('recipientEmail', '==', user.email), orderBy('createdAt', 'desc'), limit(40)),
      async snap => {
        items = snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, _date: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : new Date() };
        });
        await Promise.all(items.map(n => ensureProfileLoaded(n.actorEmail)));
        render();
      },
      err => {
        // Rules not published yet, or the composite index hasn't been
        // created — keep the bell visible (it's how you'd discover the
        // feature exists) and explain it instead of vanishing silently.
        console.error('Notifications query failed:', err);
        renderError(err);
      }
    );
  }

  btn.addEventListener('click', () => dropdown.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) closeDropdown();
  });

  onAccountChange(subscribe);
}
