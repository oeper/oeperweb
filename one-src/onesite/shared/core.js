/* one* suite — shared Material You runtime (icons, ripple, popovers, menus, dialogs, ribbon, backstage) */
(() => {
'use strict';
const ONE = window.ONE = {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
Object.assign(ONE, { $, $$ });
ONE.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
ONE.uid = () => Math.random().toString(36).slice(2, 9);
ONE.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
ONE.store = {
  get(k, d = null){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v){
    // A file list (ow-lib, os-lib, ...) written by an app holds the copy it loaded at startup. Documents that
    // arrived since (downloaded by cloud sync, or saved from another tab) must survive that write, so keep any
    // entry whose document still exists. A document the app deleted has already had its doc key removed.
    const m = /^(ow|os|op|oi|ob)-lib$/.exec(k);
    if (m && v && v.docs) { try { const cur = JSON.parse(localStorage.getItem(k) || 'null'); if (cur && cur.docs) for (const [id, e] of Object.entries(cur.docs)) if (!(id in v.docs) && localStorage.getItem(m[1] + '-doc-' + id) !== null) v.docs[id] = e; } catch {} }
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  },
  del(k){ try { localStorage.removeItem(k); } catch {} }
};
ONE.h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
ONE.el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => c != null && e.append(c));
  return e;
};
ONE.icon = (n, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${n}</span>`;
ONE.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Material Symbols (full font so every ligature exists; FILL axis animates) ---------- */
ONE.loadIcons = () => {
  const href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..24,400..500,0..1,0&display=block';
  const link = ONE.el('link', { rel:'stylesheet', href });
  const done = () => document.documentElement.classList.add('ms-on');
  link.onload = () => document.fonts.load('20px "Material Symbols Rounded"', 'home').then(f => f.length ? done() : document.documentElement.classList.add('ms-off'), () => document.documentElement.classList.add('ms-off'));
  link.onerror = () => document.documentElement.classList.add('ms-off');
  document.head.append(link);
  setTimeout(() => { if (!document.documentElement.classList.contains('ms-on')) document.fonts.check('20px "Material Symbols Rounded"') ? done() : null; }, 6000);
};

/* ---------- ripple ---------- */
ONE.RIPPLE = '.rb,.rb-lg,.tb-btn,.tab,.btn,.menu-item,.sb,.nav-item,.rail-item,.chip,.fab,.icon-btn,.sty,.card-btn';
document.addEventListener('pointerdown', e => {
  if (ONE.reduced) return;
  const t = e.target.closest(ONE.RIPPLE); if (!t || t.disabled) return;
  t.classList.add('rpl');
  const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
  const s = ONE.el('span', { class:'ripple', style:{ width:d + 'px', height:d + 'px', left:(e.clientX - r.left - d / 2) + 'px', top:(e.clientY - r.top - d / 2) + 'px' } });
  t.append(s); setTimeout(() => s.remove(), 650);
}, { passive:true });

/* ---------- snackbar ---------- */
let toastT;
ONE.toast = (msg, opt = {}) => {
  $$('.snackbar').forEach(t => t.remove()); clearTimeout(toastT);
  const t = ONE.el('div', { class:'snackbar', role:'status' }, ONE.el('span', { text:msg }));
  if (opt.action) t.append(ONE.el('button', { class:'btn text inv', text:opt.action, onclick:() => { close(); opt.fn && opt.fn(); } }));
  const close = () => { t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  document.body.append(t); toastT = setTimeout(close, opt.ms || (opt.action ? 7000 : 3200));
};

/* ---------- popovers & menus ---------- */
const pop = ONE.pop = { el:null, owner:null, onClose:null };
pop.open = (anchor, node, opt = {}) => {
  if (pop.el && pop.owner === anchor && anchor instanceof Element) { pop.close(); return null; }
  pop.close(true);
  const el = ONE.el('div', { class:'pop ' + (opt.cls || ''), role:'dialog' }); el.append(node); document.body.append(el);
  pop.el = el; pop.owner = anchor; pop.onClose = opt.onClose || null;
  const pr = el.getBoundingClientRect();
  let x, y, r;
  if (anchor instanceof Element) { r = anchor.getBoundingClientRect(); x = opt.alignRight ? r.right - pr.width : r.left; y = r.bottom + 4; }
  else { r = { top:anchor.y, bottom:anchor.y, left:anchor.x }; x = anchor.x; y = anchor.y; }
  let origin = 'top left';
  if (y + pr.height > innerHeight - 8) { const up = r.top - pr.height - 4; if (up >= 8) { y = up; origin = 'bottom left'; } else y = Math.max(8, innerHeight - pr.height - 8); }
  if (x + pr.width > innerWidth - 8) { x = innerWidth - pr.width - 8; origin = origin.replace('left', 'right'); }
  x = Math.max(8, x);
  Object.assign(el.style, { left:x + 'px', top:y + 'px', transformOrigin:origin });
  el.classList.add('in');
  const f = el.querySelector('[autofocus], input[type=text], input[type=number], textarea'); if (f && !opt.noFocus) setTimeout(() => f.focus(), 30);
  return el;
};
pop.close = (instant) => {
  const el = pop.el; if (!el) return; pop.el = null; pop.owner = null;
  const cb = pop.onClose; pop.onClose = null; cb && cb();
  if (instant || ONE.reduced) el.remove(); else { el.classList.add('out'); setTimeout(() => el.remove(), 130); }
};
document.addEventListener('mousedown', e => {
  if (pop.el && !pop.el.contains(e.target) && !(pop.owner instanceof Element && pop.owner.contains(e.target))) pop.close();
});
document.addEventListener('mousedown', e => { if (pop.el && pop.el.contains(e.target) && e.target.closest('button,.nomd')) e.preventDefault(); });

ONE.menu = items => {
  const d = ONE.el('div', { class:'menu', role:'menu' });
  items.forEach(it => {
    if (!it) return;
    if (it === '-') return d.append(ONE.el('div', { class:'menu-sep' }));
    if (it.title) return d.append(ONE.el('div', { class:'menu-title', text:it.title }));
    if (it.node) return d.append(it.node);
    const b = ONE.el('button', { class:'menu-item' + (it.checked ? ' checked' : '') + (it.danger ? ' danger' : ''), role:'menuitem', disabled:it.disabled || false,
      html:`${it.icon ? ONE.icon(it.icon) : `<span class="mi-check">${it.checked ? ONE.icon('check') : ''}</span>`}<span class="mi-label">${it.html || ONE.esc(it.label)}${it.sub ? `<small>${ONE.esc(it.sub)}</small>` : ''}</span>${it.kbd ? `<kbd>${ONE.esc(it.kbd)}</kbd>` : ''}${it.checked && it.icon ? ONE.icon('check', 'mi-tick') : ''}` });
    b.onclick = () => { pop.close(); it.on && it.on(); };
    d.append(b);
  });
  return d;
};
ONE.menuAt = (anchor, items, opt) => pop.open(anchor, ONE.menu(items), opt);

/* ---------- colour palettes (Office-style theme grid) ---------- */
ONE.THEME = ['#FFFFFF','#000000','#E7E6E6','#44546A','#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5','#70AD47'];
ONE.STANDARD = ['#C00000','#FF0000','#FFC000','#FFFF00','#92D050','#00B050','#00B0F0','#0070C0','#002060','#7030A0'];
ONE.mix = (hex, to, amt) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (to - v) * amt)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
ONE.colorGrid = (apply, opt = {}) => {
  const d = ONE.el('div', { class:'colorpop' });
  const pick = c => { pop.close(); apply(c); };
  if (opt.autoLabel) d.append(ONE.el('button', { class:'menu-item', html:`<span class="sw-auto" style="background:${opt.autoColor || '#000'}"></span><span class="mi-label">${ONE.esc(opt.autoLabel)}</span>`, onclick:() => pick(null) }));
  d.append(ONE.el('div', { class:'menu-title', text:'Theme colors' }));
  const g = ONE.el('div', { class:'cgrid' });
  const T = ONE.THEME, W = c => c === '#FFFFFF';
  const rows = [T, T.map(c => W(c) ? ONE.mix(c, 0, .05) : ONE.mix(c, 255, .8)), T.map(c => W(c) ? ONE.mix(c, 0, .15) : ONE.mix(c, 255, .6)), T.map(c => W(c) ? ONE.mix(c, 0, .25) : ONE.mix(c, 255, .4)), T.map(c => c === '#000000' ? '#262626' : ONE.mix(c, 0, .25)), T.map(c => c === '#000000' ? '#0d0d0d' : ONE.mix(c, 0, .5))];
  rows.forEach((r, i) => r.forEach(c => g.append(ONE.el('button', { class:'sw' + (i === 0 ? ' top' : ''), style:{ background:c }, title:c, 'aria-label':c, onclick:() => pick(c) }))));
  d.append(g, ONE.el('div', { class:'menu-title', text:'Standard colors' }));
  const g2 = ONE.el('div', { class:'cgrid' });
  ONE.STANDARD.forEach(c => g2.append(ONE.el('button', { class:'sw top', style:{ background:c }, title:c, 'aria-label':c, onclick:() => pick(c) })));
  d.append(g2);
  if (opt.noneLabel) d.append(ONE.el('button', { class:'menu-item', html:`${ONE.icon('format_color_reset')}<span class="mi-label">${ONE.esc(opt.noneLabel)}</span>`, onclick:() => pick('none') }));
  const more = ONE.el('label', { class:'menu-item nomd', html:`${ONE.icon('colorize')}<span class="mi-label">More colors…</span>` });
  const inp = ONE.el('input', { type:'color', class:'vh', onchange:() => pick(inp.value) }); more.append(inp); d.append(more);
  return d;
};

/* ---------- dialogs ---------- */
const modals = [];
ONE.modal = ({ title, body, actions = [{ label:'Close', kind:'filled' }], width, onClose, icon }) => {
  const back = ONE.el('div', { class:'scrim' });
  const box = ONE.el('div', { class:'dialog', role:'dialog', 'aria-modal':'true', 'aria-label':title, style:width ? { width:`min(${width}px, 100%)` } : null });
  box.append(ONE.el('div', { class:'dlg-head', html:`${icon ? ONE.icon(icon, 'dlg-icon') : ''}<h2>${ONE.esc(title)}</h2>` }));
  const b = ONE.el('div', { class:'dlg-body' }); typeof body === 'string' ? (b.innerHTML = body) : b.append(body); box.append(b);
  const foot = ONE.el('div', { class:'dlg-actions' });
  const api = { el:box, body:b, close };
  actions.forEach(a => foot.append(ONE.el('button', { class:'btn ' + (a.kind || 'text'), text:a.label, onclick:() => { if (a.on && a.on(api) === false) return; close(); } })));
  box.append(foot); back.append(box); document.body.append(back);
  modals.push(api);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  setTimeout(() => { const f = box.querySelector('[autofocus],input:not([type=checkbox]):not([type=radio]):not([type=color]),select,textarea'); f && f.focus(); }, 40);
  function close(){
    const i = modals.indexOf(api); if (i < 0) return; modals.splice(i, 1);
    back.classList.add('out'); setTimeout(() => back.remove(), ONE.reduced ? 0 : 180); onClose && onClose();
  }
  return api;
};
ONE.topModal = () => modals[modals.length - 1];
ONE.field = (label, input, hint) => { const l = ONE.el('label', { class:'field' }, ONE.el('span', { class:'field-label', text:label }), input); if (hint) l.append(ONE.el('small', { text:hint })); return l; };
ONE.input = (props = {}) => ONE.el('input', Object.assign({ class:'tf', type:'text' }, props));
ONE.select = (options, value, props = {}) => { const s = ONE.el('select', Object.assign({ class:'tf' }, props)); options.forEach(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; s.append(ONE.el('option', { value:v, text:t })); }); if (value != null) s.value = value; return s; };
ONE.check = (label, checked, props = {}) => { const i = ONE.el('input', Object.assign({ type:'checkbox', class:'cb' }, props)); i.checked = !!checked; return { wrap:ONE.el('label', { class:'cbl' }, i, ONE.el('span', { text:label })), input:i }; };

/* ---------- dynamic colour (Material You seed) ---------- */
ONE.SEEDS = [['Ocean','#185abd'],['Violet','#6750a4'],['Teal','#006a60'],['Moss','#4c662b'],['Amber','#8b5000'],['Brick','#a8322d'],['Rose','#984061'],['Slate','#535f70']];
ONE.setSeed = (c, save = true) => { document.documentElement.style.setProperty('--seed', c); if (save) ONE.store.set(ONE.appKey + '-seed', c); };
ONE.seedMenu = anchor => {
  const d = ONE.el('div', { class:'seedpop' }, ONE.el('div', { class:'menu-title', text:'App color' }));
  const g = ONE.el('div', { class:'seedgrid' });
  const cur = getComputedStyle(document.documentElement).getPropertyValue('--seed').trim().toLowerCase();
  ONE.SEEDS.forEach(([n, c]) => g.append(ONE.el('button', { class:'seed' + (cur === c ? ' on' : ''), title:n, 'aria-label':n, style:{ '--c':c }, html:'<i></i><i></i><i></i>', onclick:() => { ONE.setSeed(c); pop.close(); } })));
  d.append(g);
  const lab = ONE.el('label', { class:'menu-item nomd', html:`${ONE.icon('colorize')}<span class="mi-label">Custom color…</span>` });
  const inp = ONE.el('input', { type:'color', class:'vh', value:cur || '#185abd', oninput:() => ONE.setSeed(inp.value) }); lab.append(inp); d.append(lab);
  pop.open(anchor, d);
};

/* ---------- ribbon ---------- */
ONE.commands = [];
ONE.MARK = '<svg class="onemark" viewBox="0 0 60 200" aria-hidden="true"><path d="M20 0H40A20 20 0 0 1 60 20V180A20 20 0 0 1 20 180V41A20 20 0 0 1 0 21V20A20 20 0 0 1 20 0Z" fill="currentColor"/></svg>';
const R = ONE.ribbon = { spec:null, run:null, states:{}, contexts:new Set(), current:null };
const chev = '<span class="ms chev" aria-hidden="true">arrow_drop_down</span>';
function mkBtn(cls, icon, label, act, opt = {}, tab){
  const b = ONE.el('button', { class:cls, type:'button', 'data-act':act, title:(opt.tip || label || '') + (opt.kbd ? ` (${opt.kbd})` : ''), 'aria-label':opt.tip || label, id:opt.id });
  if (opt.state) b.dataset.state = opt.state === true ? act : opt.state;
  let iconHtml = icon ? ONE.icon(icon) : '';
  if (opt.bar) iconHtml = `<span class="ic-bar">${iconHtml}<i id="${opt.bar}"></i></span>`;
  if (opt.html) iconHtml = opt.html;
  const dd = /D$/.test(cls.split(' ')[1] || '') || opt.dd;
  b.innerHTML = iconHtml + (cls.includes('rb-lg') ? `<span class="lb">${ONE.esc(label)}${opt.dd ? chev : ''}</span>` : (label && !cls.includes('icon') ? `<span class="lb">${ONE.esc(label)}</span>` : '')) + (opt.dd && !cls.includes('rb-lg') ? chev : '');
  if (label || opt.tip) ONE.commands.push({ label:opt.tip || label, icon, act, tab });
  return b;
}
function renderItem(it, tab){
  const [k] = it;
  switch (k) {
    case 'L': return mkBtn('rb-lg', it[1], it[2], it[3], it[4], tab);
    case 'LD': return mkBtn('rb-lg', it[1], it[2], it[3], Object.assign({ dd:true }, it[4]), tab);
    case 'S': return mkBtn('rb lbl', it[1], it[2], it[3], it[4], tab);
    case 'SD': return mkBtn('rb lbl', it[1], it[2], it[3], Object.assign({ dd:true }, it[4]), tab);
    case 'I': return mkBtn('rb icon', it[1], '', it[3], Object.assign({ tip:it[2] }, it[4]), tab);
    case 'ID': return mkBtn('rb icon', it[1], '', it[3], Object.assign({ tip:it[2], dd:true }, it[4]), tab);
    case 'SP': {
      const w = ONE.el('span', { class:'split' });
      w.append(mkBtn('rb icon', it[1], '', it[3], Object.assign({ tip:it[2] }, it[5]), tab), mkBtn('rb icon dd', 'arrow_drop_down', '', it[4], { tip:it[2] + ' options' }));
      w.lastChild.innerHTML = ONE.icon('arrow_drop_down'); return w;
    }
    case 'R': { const r = ONE.el('div', { class:'row' }); it[1].forEach(x => r.append(renderItem(x, tab))); return r; }
    case 'C': { const c = ONE.el('div', { class:'col' }); it[1].forEach(x => c.append(renderItem(x, tab))); return c; }
    case 'SW': {
      const l = ONE.el('label', { class:'check' }); const i = ONE.el('input', { type:'checkbox', class:'switch', 'data-act':it[2], 'data-state':(it[3] && it[3].state) || it[2] });
      l.append(i, ONE.el('span', { text:it[1] })); ONE.commands.push({ label:it[1], icon:'toggle_on', act:it[2], tab }); return l;
    }
    case 'X': return it[1]();
  }
}
R.build = (spec, { tabsEl, ribbonEl, run, states }) => {
  R.spec = spec; R.run = run; R.states = states || {}; R.tabsEl = tabsEl; R.ribbonEl = ribbonEl;
  tabsEl.innerHTML = ''; ribbonEl.innerHTML = '';
  tabsEl.append(ONE.el('span', { class:'tab-ind' }));
  tabsEl.append(ONE.el('button', { class:'tab file', 'data-act':'backstage', text:'File' }));
  spec.forEach(t => {
    tabsEl.append(ONE.el('button', { class:'tab' + (t.ctx ? ' ctx' : ''), 'data-tab':t.id, hidden:!!t.ctx, text:t.label, role:'tab' }));
    const p = ONE.el('div', { class:'panel', 'data-panel':t.id, hidden:true });
    t.groups.forEach(g => {
      const grp = ONE.el('div', { class:'group' }), body = ONE.el('div', { class:'gbody' });
      g.items.forEach(it => body.append(renderItem(it, t.label)));
      const lab = ONE.el('div', { class:'glabel' }, ONE.el('span', { text:g.label }));
      if (g.launch) lab.append(ONE.el('button', { class:'launch', 'data-act':g.launch, title:g.label + ' settings', html:ONE.icon('open_in_new') }));
      grp.append(body, lab); p.append(grp);
    });
    ribbonEl.append(p);
  });
  tabsEl.append(ONE.el('span', { class:'grow' }));
  tabsEl.append(ONE.el('button', { class:'tb-btn collapse', 'data-act':'collapseRibbon', title:'Collapse the ribbon', html:ONE.icon('keyboard_arrow_up') }));
  tabsEl.addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; const app = document.querySelector('.app'); if (app && app.classList.contains('ribbon-peek') && t.classList.contains('active')) { app.classList.remove('ribbon-peek'); return; } tabsEl.dataset.userClick = '1'; R.switchTab(t.dataset.tab); delete tabsEl.dataset.userClick; });
  const handler = e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    if (b.closest('.tabs') && !b.classList.contains('file') && !b.classList.contains('collapse')) return;
    run(b.dataset.act, b, e);
  };
  ribbonEl.addEventListener('click', handler); tabsEl.addEventListener('click', handler);
  ribbonEl.addEventListener('change', e => { if (e.target.matches('.switch[data-act]')) run(e.target.dataset.act, e.target, e); });
  ribbonEl.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  R.switchTab(spec[0].id);
  addEventListener('resize', R.moveInd);
  R.initGrip();
};
/* The top of the app has four sizes. Text never shrinks - each smaller size re-lays the ribbon out to use the
   empty width instead of its height:
     full       the normal ribbon
     compact    big buttons turn sideways (icon beside label) and wrap into two rows; group captions hide
     line       the whole ribbon on one row, and the tabs move up into the title bar
     hidden     just that one combined bar; clicking a tab shows the ribbon over the page until you click away
   Drag the handle under the ribbon (or use arrow keys on it) to change size; double-click it to hide/show.
   Remembered per app. */
R.MODES = ['full', 'compact', 'line', 'hidden'];
R.mode = 'full'; R.lastOpen = 'full';
R.setMode = (mode, save = true) => {
  const app = document.querySelector('.app'); if (!app || !R.MODES.includes(mode)) return;
  const layout = mode === 'hidden' ? R.lastOpen : mode;
  R.mode = mode; if (mode !== 'hidden') R.lastOpen = mode;
  app.classList.toggle('rb-compact', layout === 'compact');
  app.classList.toggle('rb-line', layout === 'line');
  app.classList.toggle('ribbon-min', mode === 'hidden');
  app.classList.remove('ribbon-peek');
  R.mergeChrome((mode === 'line' || mode === 'hidden') && !R.narrow());
  if (save) ONE.store.set((ONE.appKey || 'one') + '-ribbon', { mode });
  requestAnimationFrame(R.moveInd); dispatchEvent(new Event('resize'));
};
// Moves the tab strip into the title bar (and back), so the two rows become one.
R.mergeChrome = on => {
  const app = document.querySelector('.app'), tabs = R.tabsEl, tb = app && app.querySelector('.titlebar'); if (!tabs || !tb) return;
  if (!R.tabsHome) R.tabsHome = { parent:tabs.parentElement, next:tabs.nextElementSibling };
  app.classList.toggle('chrome-merge', on);
  if (on && tabs.parentElement !== tb) { const anchor = tb.querySelector('.qat') || tb.querySelector('.appname'); anchor ? anchor.after(tabs) : tb.prepend(tabs); }
  if (!on && tabs.parentElement === tb) R.tabsHome.parent.insertBefore(tabs, R.tabsHome.next);
};
// On a phone the title bar has no room for the tabs, so they keep their own row there.
R.narrow = () => matchMedia('(max-width:760px)').matches;
matchMedia('(max-width:760px)').addEventListener('change', () => R.mergeChrome((R.mode === 'line' || R.mode === 'hidden') && !R.narrow()));
// Old name, still used by the apps' "collapse ribbon" button.
R.setScale = (k, collapsed) => R.setMode(collapsed ? 'hidden' : R.lastOpen);
R.initGrip = () => {
  const wrap = R.ribbonEl && R.ribbonEl.parentElement; if (!wrap || wrap.querySelector('.rgrip')) return;
  const grip = ONE.el('div', { class:'rgrip', role:'slider', 'aria-label':'Ribbon size', 'aria-valuemin':0, 'aria-valuemax':3, tabindex:0, title:'Drag to resize the ribbon · double-click to hide or show it' });
  wrap.append(grip);
  const saved = ONE.store.get((ONE.appKey || 'one') + '-ribbon');
  if (saved && saved.mode) R.setMode(saved.mode, false);
  else if (R.narrow()) R.setMode('line', false); // phones start with the one-line ribbon
  const idx = () => R.MODES.indexOf(R.mode), aria = () => { grip.setAttribute('aria-valuenow', idx()); grip.setAttribute('aria-valuetext', R.mode); };
  let d = null;
  grip.addEventListener('pointerdown', e => { e.preventDefault(); grip.setPointerCapture(e.pointerId); d = { y:e.clientY, start:idx() }; document.body.classList.add('rgrip-drag'); });
  grip.addEventListener('pointermove', e => {
    if (!d) return;
    // every 28px of drag is one size step; up = smaller
    const i = ONE.clamp(d.start + Math.round((d.y - e.clientY) / 28), 0, R.MODES.length - 1);
    if (R.MODES[i] !== R.mode) R.setMode(R.MODES[i], false);
  });
  const end = () => { if (!d) return; d = null; document.body.classList.remove('rgrip-drag'); R.setMode(R.mode); aria(); };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  grip.addEventListener('dblclick', () => { R.setMode(R.mode === 'hidden' ? R.lastOpen : 'hidden'); aria(); });
  grip.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); R.setMode(R.MODES[Math.min(3, idx() + 1)]); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); R.setMode(R.MODES[Math.max(0, idx() - 1)]); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); R.setMode(R.mode === 'hidden' ? R.lastOpen : 'hidden'); }
    aria();
  });
  aria();
  // "hidden": a tab click peeks the ribbon over the page; clicking anywhere else (or Esc) puts it away.
  document.addEventListener('mousedown', e => {
    const app = document.querySelector('.app'); if (!app || !app.classList.contains('ribbon-peek')) return;
    if (e.target.closest('.ribbon, .tabs, .pop, .dialog, .scrim')) return;
    app.classList.remove('ribbon-peek');
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const app = document.querySelector('.app'); if (app) app.classList.remove('ribbon-peek'); } });
};
R.switchTab = id => {
  R.current = id;
  $$('.tab[data-tab]', R.tabsEl).forEach(x => { x.classList.toggle('active', x.dataset.tab === id); x.setAttribute('aria-selected', x.dataset.tab === id); });
  $$('.panel', R.ribbonEl).forEach(p => {
    const on = p.dataset.panel === id; p.hidden = !on;
    if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
  });
  const appEl = document.querySelector('.app'); if (appEl && appEl.classList.contains('ribbon-min') && R.tabsEl && R.tabsEl.dataset.userClick) appEl.classList.add('ribbon-peek');
  R.moveInd(); R.refresh();
};
R.moveInd = () => {
  const a = $('.tab.active', R.tabsEl), ind = $('.tab-ind', R.tabsEl); if (!a || !ind) return;
  ind.style.left = a.offsetLeft + 'px'; ind.style.width = a.offsetWidth + 'px';
  ind.classList.toggle('ctx', a.classList.contains('ctx'));
};
R.setContext = (name, on) => {
  const had = R.contexts.has(name); if (on === had) return;
  on ? R.contexts.add(name) : R.contexts.delete(name);
  R.spec.filter(t => t.ctx === name).forEach(t => { const b = $(`.tab[data-tab="${t.id}"]`, R.tabsEl); b.hidden = !on; if (on) { b.classList.remove('pop-in'); void b.offsetWidth; b.classList.add('pop-in'); } });
  const cur = R.spec.find(t => t.id === R.current);
  if (!on && cur && cur.ctx === name) R.switchTab(R.spec[0].id);
  else R.moveInd();
};
R.refresh = () => {
  if (!R.ribbonEl) return;
  $$('[data-state]', document).forEach(b => {
    const k = b.dataset.state; let v = false;
    if (R.states[k]) { try { v = !!R.states[k](); } catch {} }
    else if (k.startsWith('cmd:')) { try { v = document.queryCommandState(k.slice(4)); } catch {} }
    if (b.type === 'checkbox') b.checked = v; else b.classList.toggle('on', v);
  });
};

/* ---------- command search (the "Search" box) ---------- */
ONE.commandSearch = (input, { run, docSearch }) => {
  let items = [], idx = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { pop.el && pop.owner === input && pop.close(); return; }
    const seen = new Set();
    items = ONE.commands.filter(c => c.label.toLowerCase().includes(q) && !seen.has(c.label + c.act) && seen.add(c.label + c.act)).slice(0, 7);
    idx = 0;
    const d = ONE.el('div', { class:'menu searchpop' });
    d.append(ONE.el('div', { class:'menu-title', text:'Actions' }));
    if (!items.length) d.append(ONE.el('div', { class:'menu-empty', text:'No matching commands' }));
    items.forEach((c, i) => d.append(ONE.el('button', { class:'menu-item' + (i === 0 ? ' kb' : ''), html:`${ONE.icon(c.icon || 'bolt')}<span class="mi-label">${ONE.esc(c.label)}<small>${ONE.esc(c.tab || '')}</small></span>`, onclick:() => go(i) })));
    if (docSearch) { d.append(ONE.el('div', { class:'menu-sep' })); d.append(ONE.el('button', { class:'menu-item', html:`${ONE.icon('search')}<span class="mi-label">Find “${ONE.esc(input.value.trim())}” in this file</span>`, onclick:() => { const v = input.value; pop.close(); input.value = ''; docSearch(v); } })); }
    if (pop.el && pop.owner === input) { pop.el.innerHTML = ''; pop.el.append(d); } else pop.open(input, d, { noFocus:true, cls:'search-results' });
  };
  const go = i => { const c = items[i]; pop.close(); input.value = ''; input.blur(); if (c) run(c.act, document.querySelector(`[data-act="${c.act}"]`) || input); };
  input.addEventListener('input', render);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = $$('.searchpop .menu-item', pop.el || document); if (!n.length) return; idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + n.length) % n.length; n.forEach((x, j) => x.classList.toggle('kb', j === idx)); }
    if (e.key === 'Enter') { e.preventDefault(); const n = $$('.searchpop .menu-item', pop.el || document); if (n[idx]) n[idx].click(); else if (docSearch) { docSearch(input.value); input.value = ''; } }
    if (e.key === 'Escape') { input.value = ''; pop.close(); input.blur(); }
  });
};

/* ---------- backstage (File) ---------- */
ONE.backstage = (sections, opt = {}) => {
  let root = $('.backstage');
  if (!root) {
    root = ONE.el('div', { class:'backstage', hidden:true });
    const rail = ONE.el('nav', { class:'rail' });
    const tl = $('.titlebar .logo'); if (tl) rail.append(ONE.el('button', { class:'rail-logo', type:'button', html:tl.innerHTML, onclick:() => ONE.logoClick() }));
    rail.append(ONE.el('button', { class:'rail-item back', html:`${ONE.icon('arrow_back')}<span>Back</span>`, onclick:() => ONE.backstage.close() }));
    sections.forEach(s => {
      if (s === '-') return rail.append(ONE.el('div', { class:'rail-sep' }));
      rail.append(ONE.el('button', { class:'rail-item', 'data-bs':s.id, html:`${ONE.icon(s.icon)}<span>${ONE.esc(s.label)}</span>`, onclick:() => ONE.backstage.show(s.id) }));
    });
    root.append(rail, ONE.el('div', { class:'bs-body' }));
    document.body.append(root);
  }
  ONE.backstage.sections = sections.filter(s => s !== '-');
  return root;
};
ONE.backstage.show = id => {
  const root = $('.backstage'); root.hidden = false; root.classList.remove('out');
  $$('.rail-item[data-bs]', root).forEach(b => b.classList.toggle('active', b.dataset.bs === id));
  const body = $('.bs-body', root); body.innerHTML = ''; body.classList.remove('enter'); void body.offsetWidth; body.classList.add('enter');
  const s = ONE.backstage.sections.find(x => x.id === id); if (s) s.render(body);
  ONE.backstage.current = id; ONE.syncLogo && ONE.syncLogo();
};
ONE.backstage.close = () => { const root = $('.backstage'); if (!root || root.hidden) return; ONE.backstage.current = null; ONE.syncLogo && ONE.syncLogo(); root.classList.add('out'); setTimeout(() => { root.hidden = true; root.classList.remove('out'); }, ONE.reduced ? 0 : 200); };
ONE.backstage.isOpen = () => { const r = $('.backstage'); return r && !r.hidden; };

/* ---------- clipboard helper ---------- */
ONE.copyText = (text, okMsg = 'Copied to clipboard.') => {
  const fallback = () => {
    const ta = ONE.el('textarea', { class:'tf', style:{ width:'100%', height:'200px' } }); ta.value = text;
    ONE.modal({ title:'Copy this text', body:ONE.el('div', {}, ONE.el('p', { class:'muted', text:'Your browser blocked clipboard access here. The text is selected; press Ctrl+C (⌘C) to copy it.' }), ta) });
    setTimeout(() => ta.select(), 60);
  };
  try { navigator.clipboard.writeText(text).then(() => ONE.toast(okMsg), fallback); } catch { fallback(); }
};

/* ---------- global Esc ---------- */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (pop.el) { pop.close(); e.stopImmediatePropagation(); return; }
  const m = ONE.topModal(); if (m) { m.close(); e.stopImmediatePropagation(); return; }
  if (ONE.backstage.isOpen()) { ONE.backstage.close(); e.stopImmediatePropagation(); }
}, true);

/* ---------- suite: embedding, app switcher, file saving ---------- */
ONE.embedded = (() => { try { return window.parent !== window && !!window.parent.document && !!window.parent.ONE_SHELL; } catch { return false; } })();
ONE.APPS = [
  { id:'word', name:'oneWord', letter:'W', color:'#185abd', what:'Documents' },
  { id:'sheet', name:'oneSheet', letter:'S', color:'#107c41', what:'Spreadsheets' },
  { id:'slide', name:'oneSlide', letter:'P', color:'#c43e1c', what:'Presentations' },
  { id:'idea', name:'oneIdea', letter:'I', color:'#7719aa', what:'Notebooks' },
  { id:'site', name:'oneSite', icon:'web', color:'#00838f', what:'Websites' },
  { id:'pdf', name:'onePDF', icon:'picture_as_pdf', color:'#c5221f', what:'PDFs' }
];
ONE.post = msg => { if (ONE.embedded) window.parent.postMessage(Object.assign({ one:true, from:ONE.appId }, msg), '*'); };
/* The app switcher lives in the one.html shell; a standalone copy of an app has no sibling apps to link to, so its button is hidden. */
ONE.appSwitcher = anchor => {
  if (!ONE.embedded) return ONE.toast('Open one.html to switch between apps.');
  const d = ONE.el('div', { class:'appgrid-pop' }, ONE.el('div', { class:'menu-title', text:'Apps' }));
  const g = ONE.el('div', { class:'appgrid' });
  const tile = (a, label, onClick) => {
    const t = ONE.el('button', { class:'apptile' + (a && a.id === ONE.appId ? ' on' : ''), style:{ '--c':a ? a.color : '#3f5aa8' }, onclick:onClick });
    t.append(ONE.el('span', { class:'apptile-logo', html:a ? (a.icon ? ONE.icon(a.icon) : ONE.esc(a.letter)) : ONE.MARK }), ONE.el('span', { text:label }));
    return t;
  };
  g.append(tile(null, 'Home', () => { ONE.pop.close(); ONE.post({ type:'home' }); }));
  ONE.APPS.forEach(a => g.append(tile(a, a.name, () => { ONE.pop.close(); if (a.id !== ONE.appId) ONE.post({ type:'switch', app:a.id }); })));
  d.append(g);
  ONE.pop.open(anchor, d, { alignRight:true });
};
/* Save a file: the artifact viewer's downloads capability when present (also from inside the suite shell), else a normal browser download. */
ONE.dlHost = () => { if (window.claude && window.claude.use) return window.claude; try { if (window.parent !== window && window.parent.claude && window.parent.claude.use) return window.parent.claude; } catch {} return null; };
let dlNs;
ONE.getDownloads = async () => { if (dlNs !== undefined) return dlNs; const h = ONE.dlHost(); dlNs = h ? await h.use('downloads').catch(() => null) : null; return dlNs; };
ONE.download = async (filename, data, mime) => {
  const ns = await ONE.getDownloads();
  if (ns) {
    try { await ns.save({ filename, data }); ONE.toast(`Saved ${filename}.`); return true; }
    catch (e) { if (e && e.code === 'declined') return false; if (e && e.code === 'rate_limited') { ONE.toast('A save is already waiting for your answer.'); return false; } if (e && e.code === 'extension_not_enabled') { ONE.toast('That file type can’t be saved here.'); return false; } }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type:mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = ONE.el('a', { href:url, download:filename }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch { ONE.toast('This browser blocked the download.'); return false; }
};
ONE.loadScript = src => new Promise((ok, bad) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = ONE.el('script', { src }); s.onload = ok; s.onerror = () => bad(new Error('load ' + src)); document.head.append(s); });
ONE.pendingOpen = () => { const p = ONE.store.get('one-open'); if (p && p.app === ONE.appId && Date.now() - (p.t || 0) < 60000) { ONE.store.del('one-open'); return p.id; } return null; };
window.addEventListener('message', e => { const m = e.data; if (!m || !m.one || m.to !== ONE.appId) return; if (m.type === 'open' && ONE.onOpenRequest) ONE.onOpenRequest(m.id); if (m.type === 'new' && ONE.onNewRequest) ONE.onNewRequest(m.template); });

/* The app logo: first click opens this app's Home, a second click (from Home) goes back to the one main page. */
ONE.atHome = () => ONE.backstage.isOpen && ONE.backstage.isOpen() && ONE.backstage.current === 'home';
ONE.logoClick = () => {
  if (ONE.atHome()) { if (ONE.embedded) ONE.post({ type:'home' }); else ONE.backstage.close(); return; }
  if (ONE.backstage.sections && ONE.backstage.sections.some(x => x.id === 'home')) ONE.backstage.show('home');
};
ONE.syncLogo = () => { const t = ONE.atHome() ? (ONE.embedded ? 'Back to one' : 'Close Home') : 'Home'; $$('.titlebar .logo, .rail-logo').forEach(l => { l.title = t; l.setAttribute('aria-label', t); }); };
/* Account button (top right). At oeper.dev/one it reflects the oeper.dev account kept by the main page
   (window.ONE_CLOUD, reached through the parent frame); in a standalone copy it's just a local name. */
ONE.accountHost = () => { try { if (ONE.embedded && window.parent.ONE_CLOUD) return window.parent.ONE_CLOUD; } catch {} return window.ONE_CLOUD || null; };
ONE.localName = () => ONE.store.get('one-name') || '';
ONE.displayName = () => { const h = ONE.accountHost(), a = h && h.account(); return (a && a.name) || ONE.localName() || 'You'; };
ONE.setLocalName = n => { ONE.store.set('one-name', n); dispatchEvent(new CustomEvent('one-name', { detail:n })); ONE.renderAvatars(); };
const initialsOf = n => (n || 'You').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
ONE.renderAvatars = () => {
  const h = ONE.accountHost(), a = h && h.account(), name = ONE.displayName();
  $$('.avatar[data-account]').forEach(av => {
    av.title = a ? `${a.name} (${a.email})` : h ? 'Sign in to oeper.dev' : name;
    av.setAttribute('aria-label', 'Account: ' + av.title);
    av.classList.toggle('signed-out', !!h && !a);
    av.innerHTML = a && a.photo ? `<img src="${ONE.esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : h && !a ? ONE.icon('account_circle') : ONE.esc(initialsOf(name));
    const img = av.querySelector('img'); if (img) img.onerror = () => { av.textContent = initialsOf(name); };
  });
};
ONE.mountAvatar = slot => {
  let av = slot ? slot.querySelector('.avatar') : $('.titlebar .avatar');
  if (!av) { const tb = slot || $('.titlebar'); if (!tb) return; av = ONE.el('button', { class:'avatar', type:'button' }); tb.append(av); }
  if (av.dataset.account) return ONE.renderAvatars();
  av.dataset.account = '1'; av.removeAttribute('id'); if (av.tagName !== 'BUTTON') { av.setAttribute('role', 'button'); av.tabIndex = 0; }
  av.addEventListener('click', () => ONE.accountMenu(av));
  av.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ONE.accountMenu(av); } });
  const h = ONE.accountHost(); if (h && h.onAccount) h.onAccount(() => { ONE.renderAvatars(); dispatchEvent(new CustomEvent('one-name', { detail:ONE.displayName() })); });
  ONE.renderAvatars();
};
ONE.accountMenu = anchor => {
  const h = ONE.accountHost(), a = h && h.account(), E = ONE.el, I = ONE.icon;
  const card = E('div', { class:'acctcard' });
  const big = E('span', { class:'avatar big' }); big.innerHTML = a && a.photo ? `<img src="${ONE.esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : ONE.esc(initialsOf(ONE.displayName()));
  card.append(E('div', { class:'acct-head' }, big, E('div', { class:'acct-id' }, E('b', { text:a ? a.name : ONE.displayName() }), E('small', { text:a ? a.email : h ? 'Not signed in' : 'Only on this device' }))));
  const items = [];
  const openTop = url => { try { window.open(url, '_blank', 'noopener'); } catch { location.href = url; } };
  if (h && a) {
    items.push({ label:'Cloud saving: ' + (h.enabled() ? 'on' : 'off'), sub:h.enabled() ? 'Your files are saved to oeper.dev' : 'Only in this browser', icon:h.enabled() ? 'cloud_done' : 'cloud_off', on:() => h.openSettings() });
    items.push({ label:'My files on oeper.dev', icon:'folder_open', on:() => openTop('/files') });
    items.push({ label:'My profile', icon:'person', on:() => openTop(a.profileUrl || '/profile') });
  } else if (h) {
    items.push({ label:'Sign in with your oeper.dev account', sub:'Save files to your account and use them anywhere', icon:'login', on:() => h.signIn() });
  } else {
    items.push({ label:'Open at oeper.dev/one', sub:'Sign in there to save files to your account', icon:'open_in_new', on:() => openTop('https://oeper.dev/one/') });
  }
  if (!a) items.push({ label:'Your name: ' + (ONE.localName() || 'not set'), sub:'Shown on comments and tracked changes', icon:'badge', on:() => {
    const i = ONE.input({ value:ONE.localName(), placeholder:'Your name' });
    ONE.modal({ title:'Your name', icon:'badge', body:ONE.field('Name', i, 'Used for comments and tracked changes'), actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => ONE.setLocalName(i.value.trim()) }] });
  } });
  if (h && a) items.push('-', { label:'Sign out', icon:'logout', on:() => h.signOut() });
  card.append(ONE.menu(items));
  ONE.pop.open(anchor, card, { alignRight:true });
};
ONE.boot = (appKey, appId) => {
  ONE.appKey = appKey; ONE.appId = appId || appKey;
  const seed = ONE.store.get(appKey + '-seed'); if (seed) ONE.setSeed(seed, false);
  ONE.loadIcons();
  setTimeout(() => ONE.post({ type:'ready' }), 0);
  if (!ONE.embedded) document.querySelectorAll('[data-act="apps"]').forEach(b => b.hidden = true);
  ONE.mountAvatar();
  const logo = $('.titlebar .logo');
  if (logo) { logo.setAttribute('role', 'button'); logo.tabIndex = 0; logo.removeAttribute('aria-hidden'); logo.classList.add('logo-btn'); logo.addEventListener('click', ONE.logoClick); logo.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ONE.logoClick(); } }); ONE.syncLogo(); }
};
})();
