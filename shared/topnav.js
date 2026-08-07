// Persistent top navigation bar — logo, site search, nav links, chat/settings
// icons, account chip. Self-contained styles (like footer.js/account.js) so
// any page can just import mountTopNav() and call it once with no markup
// changes needed beyond an empty container to mount into (or none — it
// inserts itself at the top of <body> if no container is given).
import { mountAccountBar, db, getCurrentUser, getProfile, handleOf } from './account.js?v=10';
import {
  collection, query, orderBy, limit, getDocs,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const NAV_ITEMS = [
  { id: 'home', title: 'Home', icon: 'home', url: 'https://oeper.dev/', path: '/' },
  { id: 'forum', title: 'Feed', icon: 'forum', url: 'https://oeper.dev/forum', path: '/forum' },
  { id: 'videos', title: 'Videos', icon: 'smart_display', url: 'https://oeper.dev/videos.html', path: '/videos' },
  { id: 'projects', title: 'Projects', icon: 'apps', url: 'https://oeper.dev/projects', path: '/projects' },
  { id: 'files', title: 'Files', icon: 'folder', url: 'https://oeper.dev/files', path: '/files' },
  { id: 'tools', title: 'Tools', icon: 'build', url: 'https://oeper.dev/tools.html', path: '/tools' },
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
      background-color: rgba(17, 19, 24, 0.8);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(67, 71, 78, 0.4);
      padding: 0 24px; height: 72px;
      display: flex; align-items: center; gap: 12px;
    }
    .oe-nav-logo {
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      color: var(--md-sys-color-on-surface); text-decoration: none;
      font-family: 'Google Sans', 'Product Sans', sans-serif; font-size: 22px;
      -webkit-tap-highlight-color: transparent;
    }
    .oe-nav-logo:visited { color: var(--md-sys-color-on-surface); }
    .oe-nav-logo .material-symbols-rounded { color: var(--md-sys-color-primary); font-size: 28px; }

    .oe-nav-search-wrap { position: relative; flex: 1 1 auto; min-width: 0; max-width: 420px; margin: 0 4px; }
    .oe-nav-search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      color: var(--md-sys-color-on-surface-variant); font-size: 20px; pointer-events: none;
    }
    .oe-nav-search-input {
      width: 100%; background-color: var(--md-sys-color-surface-variant); border: 1px solid transparent;
      border-radius: 20px; padding: 9px 14px 9px 40px; color: var(--md-sys-color-on-surface);
      font-family: 'Google Sans', 'Roboto Flex', sans-serif; font-size: 14px; outline: none;
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
    .oe-nsd-row:hover { background: rgba(255,255,255,0.06); }
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

    .oe-nav-icon-link {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      color: var(--md-sys-color-on-surface-variant); text-decoration: none;
      -webkit-tap-highlight-color: transparent;
    }
    .oe-nav-icon-link:visited { color: var(--md-sys-color-on-surface-variant); }
    .oe-nav-icon-link .material-symbols-rounded { font-size: 24px; }
    .oe-nav-icon-link:hover { color: var(--md-sys-color-on-surface); }

    .oe-nav-hamburger {
      display: none; align-items: center; justify-content: center; width: 40px; height: 40px;
      border-radius: 50%; border: none; background: transparent; color: var(--md-sys-color-on-surface);
      cursor: pointer; -webkit-tap-highlight-color: transparent; flex-shrink: 0;
    }
    .oe-nav-hamburger:hover { background-color: rgba(255,255,255,0.06); }
    .oe-nav-hamburger .material-symbols-rounded { font-size: 24px; }

    .oe-nav-links { display: flex; gap: 8px; height: 100%; align-items: center; }

    .oe-nav-item {
      position: relative; display: flex; align-items: center; gap: 6px;
      padding: 10px 18px; text-decoration: none; color: var(--md-sys-color-on-surface-variant);
      font-family: 'Google Sans', 'Product Sans', sans-serif; font-size: 15px; font-weight: 500;
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
      }
      .oe-nav-search-wrap.mobile-open .oe-nav-search-dropdown { top: 72px; left: 12px; right: 12px; border-radius: 16px; }
      .oe-nav-search-wrap.mobile-open .oe-nav-search-mobile-close {
        display: flex; position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent;
        color: var(--md-sys-color-on-surface); align-items: center; justify-content: center; cursor: pointer;
      }

      .oe-nav-links {
        display: none; position: fixed; top: 72px; left: 0; right: 0; z-index: 150;
        flex-direction: column; align-items: stretch; height: auto; gap: 2px;
        background-color: var(--md-sys-color-surface); border-bottom: 1px solid var(--md-sys-color-outline-variant);
        padding: 8px; max-height: calc(100vh - 72px); overflow-y: auto;
        box-shadow: 0 12px 24px rgba(0,0,0,0.35);
      }
      .oe-nav-links.mobile-open { display: flex; }
      .oe-nav-item { width: auto; height: auto; border-radius: 14px; justify-content: flex-start; padding: 14px 16px; gap: 14px; }
      .oe-nav-item::before { border-radius: 14px; }
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
    <nav class="oe-navbar">
      <button class="oe-nav-hamburger" id="oeNavHamburger" aria-label="Menu"><span class="material-symbols-rounded">menu</span></button>
      <a href="https://oeper.dev/" class="oe-nav-logo">
        <span class="material-symbols-rounded">token</span>
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
        <a href="/messages.html" class="oe-nav-icon-link" title="Chat"><span class="material-symbols-rounded">chat_bubble</span></a>
        <a href="/settings" class="oe-nav-icon-link" title="Settings"><span class="material-symbols-rounded">settings</span></a>
        <div id="oeNavAccountBar"></div>
      </div>
    </nav>
  `;
  const navEl = el.firstElementChild;
  if (container) container.appendChild(navEl);
  else document.body.insertBefore(navEl, document.body.firstChild);

  const navLinks = navEl.querySelector('#oeNavLinks');
  NAV_ITEMS.forEach(item => {
    const a = document.createElement('a');
    a.className = 'oe-nav-item' + (isActiveItem(item) ? ' active' : '');
    a.href = item.url;
    a.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span><span class="oe-nav-item-label">${item.title}</span>`;
    navLinks.appendChild(a);
  });

  const hamburger = navEl.querySelector('#oeNavHamburger');
  hamburger.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));
  navLinks.addEventListener('click', e => { if (e.target.closest('.oe-nav-item')) navLinks.classList.remove('mobile-open'); });
  document.addEventListener('click', e => {
    if (navLinks.classList.contains('mobile-open') && !navLinks.contains(e.target) && !hamburger.contains(e.target)) {
      navLinks.classList.remove('mobile-open');
    }
  });

  mountAccountBar(navEl.querySelector('#oeNavAccountBar'));
  initSearch(navEl);
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
      if (rank < 99) results.push({ rank, name, sub: 'in People', url: `/profile.html?u=${encodeURIComponent(u.handle)}`, photo: getProfile(u.email, u.displayName, u.photoURL).photo, icon: 'person' });
    });
    corpus.posts.forEach(p => {
      const name = p.title || p.body || '';
      const rank = matchRank(name, q);
      if (rank !== -1) results.push({ rank, name, sub: 'in Feed', url: `/forum.html?post=${p.id}`, icon: 'forum' });
    });
    corpus.videos.forEach(v => {
      const rank = matchRank(v.title, q);
      if (rank !== -1) results.push({ rank, name: v.title || '', sub: 'in Videos', url: `/videos.html?video=${v.id}`, icon: 'smart_display' });
    });
    corpus.projects.forEach(p => {
      const rank = matchRank(p.title, q);
      if (rank !== -1) results.push({ rank, name: p.title || '', sub: 'in Projects', url: `/projects.html?project=${p.id}`, icon: 'apps' });
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
