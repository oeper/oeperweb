// oeper.dev site search, client side. One place for everything the search box in the top bar, the home page box and the /search page share:
// talking to the search API (cf-ai-worker/src/search.js, documented at /search-api), recent searches, highlighting and the dropdown with keyboard control.
// If the API cannot be reached it falls back to the static page index (/search-index.json) so the pages themselves can always be found.

export const SEARCH_API = (() => { try { return localStorage.getItem('oe-search-api') || ''; } catch { return ''; } })() || 'https://oeper-ai.oeper.workers.dev/api/search';

export const TYPE_META = {
  page: { label: 'page', plural: 'pages', icon: 'web' },
  doc: { label: 'docs', plural: 'docs', icon: 'menu_book' },
  post: { label: 'in feed', plural: 'posts', icon: 'forum' },
  video: { label: 'in videos', plural: 'videos', icon: 'smart_display' },
  user: { label: 'person', plural: 'people', icon: 'person' },
  app: { label: 'app', plural: 'apps', icon: 'apps' },
  article: { label: 'article', plural: 'articles', icon: 'newspaper' },
  download: { label: 'download', plural: 'downloads', icon: 'download' },
};

export const escHtml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const queryTerms = q => String(q || '').toLowerCase().split(/[^a-z0-9À-ɏ]+/i).filter(t => t.length > 1).slice(0, 8);

/** Escaped HTML with the searched words wrapped in <mark>. */
export function highlight(text, terms) {
  const t = String(text == null ? '' : text);
  if (!terms || !terms.length) return escHtml(t);
  const re = new RegExp('(' + terms.map(escRe).join('|') + ')', 'ig');
  return t.split(re).map((part, i) => (i % 2 ? '<mark>' + escHtml(part) + '</mark>' : escHtml(part))).join('');
}

// ── the API, with a local fallback ──
let staticIndex = null;
async function loadStatic() {
  if (!staticIndex) staticIndex = fetch('/search-index.json').then(r => r.json()).then(j => j.docs || []).catch(() => []);
  return staticIndex;
}
async function localSearch(q, limit, type) {
  const terms = queryTerms(q);
  const docs = await loadStatic();
  const rows = [];
  for (const d of docs) {
    if (type && d.type !== type) continue;
    const title = (d.title || '').toLowerCase(), hay = [d.title, (d.keywords || []).join(' '), d.desc].join(' ').toLowerCase();
    if (!terms.length || !terms.every(t => hay.includes(t))) continue;
    rows.push({ s: (title.startsWith(terms[0]) ? 3 : title.includes(terms[0]) ? 2 : 0) + (d.quick ? 1 : 0), x: { type: d.type, title: d.title, url: d.url, snippet: d.desc || '', icon: d.icon || '' } });
  }
  rows.sort((a, b) => b.s - a.s);
  return { ok: true, q, offline: true, terms, total: rows.length, counts: {}, results: rows.slice(0, limit).map(r => r.x), didYouMean: '' };
}
async function api(path, params, signal) {
  const u = new URL(SEARCH_API + path);
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== '') u.searchParams.set(k, v);
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error('search ' + r.status);
  return r.json();
}
export async function search(q, { type = '', limit = 20, offset = 0, exact = false, signal } = {}) {
  try { return await api('', { q, type, limit, offset, exact: exact ? '1' : '' }, signal); }
  catch (e) { if (e.name === 'AbortError') throw e; return localSearch(q, limit, type); }
}
export async function suggest(q, signal) {
  try { return await api('/suggest', { q }, signal); }
  catch (e) { if (e.name === 'AbortError') throw e; return localSearch(q, 8, ''); }
}
let quickCache = null;
export async function quickLinks() {
  if (!quickCache) quickCache = suggest('').then(r => r.results || []).catch(() => []);
  return quickCache;
}

// ── recent searches (this browser only) ──
const RECENT_KEY = 'oe-recent-searches';
export function recents() { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, 6) : []; } catch { return []; } }
export function rememberSearch(q) {
  q = String(q || '').trim(); if (!q) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...recents().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6))); } catch { /* storage blocked */ }
}
export function forgetSearches() { try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } }

// ── the dropdown (used by the top bar and the home page) ──
let cssDone = false;
function injectCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
    .oe-ss-row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; color: inherit; text-decoration: none; cursor: pointer; border-radius: 12px; }
    .oe-ss-row:visited { color: inherit; }
    .oe-ss-row:hover, .oe-ss-row.active { background: var(--md-sys-state-hover, rgba(255,255,255,.08)); }
    .oe-ss-icon { width: 30px; height: 30px; border-radius: 50%; flex: none; display: grid; place-items: center; overflow: hidden; background: var(--md-sys-color-surface-variant, rgba(255,255,255,.08)); }
    .oe-ss-icon img { width: 100%; height: 100%; object-fit: cover; }
    .oe-ss-icon .material-symbols-rounded { font-size: 17px; color: var(--md-sys-color-on-surface-variant); }
    .oe-ss-main { flex: 1; min-width: 0; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .oe-ss-name { font-weight: 500; }
    .oe-ss-sub { color: var(--md-sys-color-on-surface-variant); font-weight: 400; margin-left: 6px; font-size: 12.5px; }
    .oe-ss-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px 2px; font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; color: var(--md-sys-color-on-surface-variant); }
    .oe-ss-head button { all: unset; cursor: pointer; text-transform: none; letter-spacing: 0; color: var(--md-sys-color-primary); font-size: 12px; }
    .oe-ss-empty { padding: 16px; text-align: center; color: var(--md-sys-color-on-surface-variant); font-size: 13px; }
    .oe-ss-all { margin-top: 4px; border-top: 1px solid var(--md-sys-color-outline-variant, rgba(255,255,255,.12)); border-radius: 0 0 12px 12px; padding-top: 12px; }
    .oe-ss-all .oe-ss-name { color: var(--md-sys-color-primary); }
    .oe-ss-dym { padding: 8px 16px; font-size: 13px; color: var(--md-sys-color-on-surface-variant); }
    .oe-ss-dym a { color: var(--md-sys-color-primary); cursor: pointer; font-weight: 500; }
    mark { background: color-mix(in srgb, var(--md-sys-color-primary, #a8c7fa) 28%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
    .oe-ss-kbd { font-size: 11px; padding: 1px 6px; border: 1px solid var(--md-sys-color-outline, #555); border-radius: 6px; color: var(--md-sys-color-on-surface-variant); }`;
  document.head.appendChild(s);
}
const rowHtml = (r, terms) => {
  const meta = TYPE_META[r.type] || { label: r.type, icon: 'article' };
  const icon = r.photo ? `<img src="${escHtml(r.photo)}" alt="" referrerpolicy="no-referrer">` : `<span class="material-symbols-rounded">${escHtml(r.icon || meta.icon)}</span>`;
  return `<a class="oe-ss-row" href="${escHtml(r.url)}" data-url="${escHtml(r.url)}"><span class="oe-ss-icon">${icon}</span><span class="oe-ss-main"><span class="oe-ss-name">${highlight(r.title, terms)}</span><span class="oe-ss-sub">${escHtml(meta.label)}</span></span></a>`;
};

/**
 * Wires a text input to a dropdown element: suggestions while typing, recents and quick links when empty, arrow keys / Enter / Escape, "see all results".
 * Enter opens the highlighted row, or the full results page when none is highlighted.
 */
export function attachSearchBox({ input, dropdown, resultsUrl = '/search?q=', onOpen }) {
  injectCss();
  let timer = null, ctrl = null, rows = [], active = -1, shownFor = null;
  const open = () => dropdown.classList.add('open');
  const close = () => { dropdown.classList.remove('open'); active = -1; };
  const setActive = i => {
    rows = [...dropdown.querySelectorAll('.oe-ss-row')];
    rows.forEach(r => r.classList.remove('active'));
    active = rows.length ? (i + rows.length) % rows.length : -1;
    if (active >= 0) { rows[active].classList.add('active'); rows[active].scrollIntoView({ block: 'nearest' }); }
  };
  const go = (url, q) => { rememberSearch(q); if (onOpen) onOpen(); window.location.href = url; };

  async function showEmpty() {
    const rec = recents();
    const quick = await quickLinks();
    if (input.value.trim()) return;
    shownFor = '';
    let html = '';
    if (rec.length) html += `<div class="oe-ss-head">recent<button type="button" data-clear>clear</button></div>` + rec.map(q => `<a class="oe-ss-row" href="${escHtml(resultsUrl + encodeURIComponent(q))}" data-url="${escHtml(resultsUrl + encodeURIComponent(q))}"><span class="oe-ss-icon"><span class="material-symbols-rounded">history</span></span><span class="oe-ss-main"><span class="oe-ss-name">${escHtml(q)}</span></span></a>`).join('');
    if (quick.length) html += `<div class="oe-ss-head">jump to</div>` + quick.map(r => rowHtml(r, [])).join('');
    dropdown.innerHTML = html || '<div class="oe-ss-empty">type to search oeper.dev</div>';
    open(); active = -1;
  }

  async function run(q) {
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    shownFor = q;
    let data;
    try { data = await suggest(q, ctrl.signal); } catch (e) { if (e.name === 'AbortError') return; data = { results: [] }; }
    if (input.value.trim() !== q) return;
    const terms = queryTerms(q);
    const dym = data.didYouMean ? `<div class="oe-ss-dym">did you mean <a data-dym="${escHtml(data.didYouMean)}">${escHtml(data.didYouMean)}</a>?</div>` : '';
    const all = `<a class="oe-ss-row oe-ss-all" href="${escHtml(resultsUrl + encodeURIComponent(q))}" data-url="${escHtml(resultsUrl + encodeURIComponent(q))}"><span class="oe-ss-icon" style="background:none"><span class="material-symbols-rounded">search</span></span><span class="oe-ss-main"><span class="oe-ss-name">see all results for "${escHtml(q)}"</span></span></a>`;
    dropdown.innerHTML = (data.results && data.results.length ? data.results.map(r => rowHtml(r, terms)).join('') : `<div class="oe-ss-empty">nothing found for "${escHtml(q)}"</div>`) + dym + all;
    open(); setActive(-1);
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { showEmpty(); return; }
    timer = setTimeout(() => run(q), 140);
  });
  input.addEventListener('focus', () => { if (input.value.trim()) { if (shownFor !== input.value.trim()) run(input.value.trim()); else open(); } else showEmpty(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); open(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Escape') { close(); input.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      const row = active >= 0 ? rows[active] : null;
      if (row) go(row.dataset.url, row.classList.contains('oe-ss-all') || !q ? (q || '') : q);
      else if (q) go(resultsUrl + encodeURIComponent(q), q);
    }
  });
  dropdown.addEventListener('mousedown', e => e.preventDefault());   // keep the input focused while clicking inside
  dropdown.addEventListener('click', e => {
    const clear = e.target.closest('[data-clear]'); if (clear) { forgetSearches(); showEmpty(); return; }
    const dym = e.target.closest('[data-dym]'); if (dym) { input.value = dym.dataset.dym; run(input.value.trim()); return; }
    const row = e.target.closest('.oe-ss-row'); if (row) { e.preventDefault(); go(row.dataset.url, input.value.trim()); }
  });
  document.addEventListener('click', e => { if (!dropdown.contains(e.target) && e.target !== input) close(); });
  return { close, open, focus: () => input.focus() };
}
