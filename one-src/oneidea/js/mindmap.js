/* oneIdea: mind map pages. Auto-laid-out topic trees, keyboard-first editing, drag to reorganise, notes, links,
   recall mode, conversion to and from notes, image export. A page with kind:'map' shows this instead of the canvas. */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const P = PG, MM = window.MM = {};
const wrap = $('#canvaswrap'), mmEl = $('#mm'), stage = $('#mmStage'), edgesEl = $('#mmEdges'), nodesEl = $('#mmNodes'), toolsEl = $('#mmTools'), hintEl = $('#mmHint');
N.recall = false;

const TAGKEYS = ['todo', 'important', 'question', 'remember', 'definition', 'idea', 'critical'];
const COLOR_NAMES = ['Blue', 'Orange', 'Green', 'Pink', 'Purple', 'Teal', 'Red', 'Gold'];
const FAM_DOM = '"Google Sans","Roboto Flex",sans-serif', FAM_EXPORT = 'Arial,Helvetica,sans-serif';
const STY = [{ w:600, s:20, lh:26, px:22, py:13, max:260 }, { w:500, s:16, lh:21, px:16, py:9, max:240 }, { w:400, s:15, lh:20, px:12, py:6, max:240 }];
const GAPY = 12, GAPX0 = 72, GAPX = 48, BADGE = 24;

let active = false, cur = null, lay = null, editing = null, drag = null, sel = null, savedK = 1, toolsT = 0;
const els = new Map(), paths = new Map(), revealed = new Set(), hist = new Map();
const byIdM = id => cur.map.nodes.find(n => n.id === id);
const rootId = () => lay.root.id;
const GLYPH = { todo:'☐', important:'★', question:'?', remember:'★', definition:'D', idea:'*', critical:'!' };

/* ---------- layout (pure: used for the screen and for image export) ---------- */
const mctx = document.createElement('canvas').getContext('2d');
function wrapLines(text, st, fam) {
  mctx.font = `${st.w} ${st.s}px ${fam}`; const out = []; let widest = 0;
  const push = l => { out.push(l); widest = Math.max(widest, mctx.measureText(l).width); };
  String(text).split('\n').forEach(par => {
    let line = '';
    par.split(/ +/).forEach(word => {
      if (!word) return;
      const test = line ? line + ' ' + word : word;
      if (mctx.measureText(test).width <= st.max) { line = test; return; }
      if (line) { push(line); line = ''; }
      if (mctx.measureText(word).width <= st.max) { line = word; return; }
      let chunk = ''; for (const ch of word) { if (chunk && mctx.measureText(chunk + ch).width > st.max) { push(chunk); chunk = ch; } else chunk += ch; } line = chunk;
    });
    push(line);
  });
  return { lines:out.length ? out : [''], w:Math.ceil(widest) };
}
function layout(m, fam) {
  const root = m.nodes.find(n => n.parent == null), kids = new Map(), L = new Map();
  m.nodes.forEach(n => { if (n.parent != null) (kids.get(n.parent) || kids.set(n.parent, []).get(n.parent)).push(n); });
  const vk = n => n.collapsed ? [] : (kids.get(n.id) || []);
  const box = (n, depth, color, side) => {
    const st = STY[Math.min(depth, 2)], t = wrapLines(n.text, st, fam), nb = (n.tag ? 1 : 0) + (n.note ? 1 : 0) + (n.link ? 1 : 0);
    const b = { n, depth, color, side, st, lines:t.lines, tw:Math.max(t.w, 14), nb, hasKids:(kids.get(n.id) || []).length > 0, vis:[], childTotal:0, x:0, y:0, cy:0 };
    b.w = b.tw + st.px * 2 + nb * BADGE; b.h = t.lines.length * st.lh + st.py * 2; b.H = b.h; L.set(n.id, b); return b;
  };
  const size = (n, depth, color, side) => {
    const b = box(n, depth, color, side); b.vis = vk(n); let total = 0;
    b.vis.forEach((c, i) => { const cb = size(c, depth + 1, c.color || color, side); total += cb.H + (i ? GAPY : 0); });
    b.childTotal = total; b.H = Math.max(b.h, total); return b;
  };
  const place = (b, dir, xNear, yTop) => {
    b.cy = Math.round(yTop + b.H / 2); b.x = Math.round(dir > 0 ? xNear : xNear - b.w); b.y = Math.round(b.cy - b.h / 2);
    let y = yTop + (b.H - b.childTotal) / 2;
    b.vis.forEach(c => { const cb = L.get(c.id); place(cb, dir, dir > 0 ? b.x + b.w + GAPX : b.x - GAPX, y); y += cb.H + GAPY; });
  };
  const rb = box(root, 0, 'var(--primary)', 0); rb.x = Math.round(-rb.w / 2); rb.y = Math.round(-rb.h / 2); rb.cy = 0;
  rb.vis = vk(root);
  [1, -1].forEach(dir => {
    const list = rb.vis.filter(c => (c.side === -1 ? -1 : 1) === dir); if (!list.length) return;
    const bs = list.map(c => size(c, 1, c.color || N.MAP_COLORS[0], dir));
    let y = -bs.reduce((a, b, i) => a + b.H + (i ? GAPY : 0), 0) / 2;
    bs.forEach(b => { place(b, dir, dir > 0 ? rb.x + rb.w + GAPX0 : rb.x - GAPX0, y); y += b.H + GAPY; });
  });
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  L.forEach(b => { x1 = Math.min(x1, b.x - 30); x2 = Math.max(x2, b.x + b.w + 30); y1 = Math.min(y1, b.y); y2 = Math.max(y2, b.y + b.h); });
  return { L, root, kids, bounds:{ x1, x2, y1, y2 } };
}
function edgePath(pb, cb) {
  const dir = cb.side || 1, x1 = dir > 0 ? pb.x + pb.w : pb.x, y1 = pb.cy, x2 = dir > 0 ? cb.x : cb.x + cb.w, y2 = cb.cy, dx = (x2 - x1) * .5;
  return `M${x1} ${y1}C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}
const edgeW = d => d === 1 ? 4 : d === 2 ? 3 : 2;
function textOn(c) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return '#fff'; const v = parseInt(m[1], 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) > 170 ? '#1f1f1f' : '#fff'; }
function mixHex(c, a) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return '#eee'; const v = parseInt(m[1], 16), f = k => Math.round(((v >> k) & 255) * a + 255 * (1 - a)); return '#' + [16, 8, 0].map(k => f(k).toString(16).padStart(2, '0')).join(''); }

/* ---------- data repair, colors, sides ---------- */
function nextColor(m) { const used = m.nodes.filter(n => n.parent === (m.nodes.find(x => x.parent == null) || {}).id).map(n => n.color); return N.MAP_COLORS.find(c => !used.includes(c)) || N.MAP_COLORS[used.length % N.MAP_COLORS.length]; }
function fix(m) {
  let root = m.nodes.find(n => n.parent == null);
  if (!root) { root = { id:ONE.uid(), parent:null, text:cur ? cur.title || 'Central topic' : 'Central topic' }; m.nodes.unshift(root); }
  const ids = new Set(m.nodes.map(n => n.id));
  m.nodes.forEach(n => { if (n !== root && (n.parent == null || !ids.has(n.parent))) n.parent = root.id; });
  m.nodes.filter(n => n.parent === root.id).forEach((n, i) => { if (!n.color) n.color = N.MAP_COLORS[i % N.MAP_COLORS.length]; if (n.side !== 1 && n.side !== -1) n.side = i % 2 ? -1 : 1; });
  if (!m.sel || !ids.has(m.sel)) m.sel = root.id;
}
function subtreeSize(m, id) { let n = 1; m.nodes.forEach(x => { if (x.parent === id) n += subtreeSize(m, x.id); }); return n; }
function pickSide(m) { const r = m.nodes.find(n => n.parent == null), load = { 1:0, '-1':0 }; m.nodes.filter(n => n.parent === r.id).forEach(n => { load[n.side === -1 ? -1 : 1] += subtreeSize(m, n.id); }); return load[1] <= load['-1'] ? 1 : -1; }
function descendants(id) { const out = []; const walk = i => cur.map.nodes.forEach(n => { if (n.parent === i) { out.push(n.id); walk(n.id); } }); walk(id); return out; }

/* ---------- render ---------- */
const hiddenInRecall = b => N.recall && b.depth >= 2 && !revealed.has(b.n.id);
function makeEl(n) {
  const id = n.id, d = el('div', { class:'mm-node in', 'data-id':id }), t = el('span', { class:'mm-text' });
  d.append(t); nodesEl.append(d); els.set(id, d);
  d.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transition = ''; })); setTimeout(() => d.classList.remove('in'), 400);
  t.addEventListener('keydown', e => {
    if (!editing || editing.id !== id) return; e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); endEdit(true); if (byIdM(id)) addSibling(id); }
    else if (e.key === 'Tab') { e.preventDefault(); endEdit(true); if (e.shiftKey) { const nn = byIdM(id); if (nn && nn.parent != null) select(nn.parent); } else if (byIdM(id)) addChild(id); }
    else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
  });
  t.addEventListener('blur', () => { if (editing && editing.id === id) endEdit(true, true); });
  return d;
}
function render() {
  if (!active || !cur) return;
  const m = cur.map; fix(m); lay = layout(m, FAM_DOM);
  let guard = 0; while (sel && !lay.L.has(sel) && guard++ < 50) { const n = byIdM(sel); sel = n ? n.parent : null; }
  if (!sel) sel = lay.root.id; m.sel = sel;
  const seen = new Set();
  lay.L.forEach((b, id) => {
    seen.add(id); const n = b.n, d = els.get(id) || makeEl(n), t = d.querySelector('.mm-text'), isEd = editing && editing.id === id, depth = Math.min(b.depth, 2);
    d.className = 'mm-node d' + depth + (b.side < 0 ? ' l' : '') + (d.classList.contains('in') ? ' in' : '') + (sel === id ? ' sel' : '') + (n.collapsed && b.hasKids ? ' folded' : '') + (hiddenInRecall(b) ? ' hid' : '') + (isEd ? ' editing' : '') + (n.done ? ' done' : '') + (drag && drag.id === id ? ' dragging' : '');
    d.style.left = b.x + 'px'; d.style.top = b.y + 'px';
    if (!isEd) { d.style.width = b.w + 'px'; d.style.height = b.h + 'px'; d.style.minWidth = ''; d.style.minHeight = ''; t.textContent = b.lines.join('\n'); }
    d.style.setProperty('--c', b.color); d.style.setProperty('--tc', textOn(b.color)); d.style.setProperty('--lh', b.st.lh + 'px'); d.style.setProperty('--tw', b.tw + 'px');
    d.querySelectorAll('.mm-b,.mm-fold').forEach(x => x.remove());
    if (n.tag && P.TAGS[n.tag]) { const T = P.TAGS[n.tag]; d.append(el('span', { class:'mm-b', 'data-b':'tag', title:T.label + (n.tag === 'todo' ? ' (click to tick off)' : ''), html:icon(n.tag === 'todo' ? (n.done ? 'check_box' : 'check_box_outline_blank') : T.icon), style:{ color:T.color } })); }
    if (n.note) d.append(el('span', { class:'mm-b', 'data-b':'note', title:n.note, html:icon('sticky_note_2') }));
    if (n.link) { const lp = N.find(n.link); d.append(el('span', { class:'mm-b', 'data-b':'link', title:lp ? 'Open page: ' + (lp.p.title || 'Untitled page') : 'The linked page was deleted', html:icon(lp ? 'description' : 'link_off') })); }
    if (b.hasKids && b.depth > 0) d.append(el('button', { class:'mm-fold', 'data-b':'fold', tabindex:'-1', title:n.collapsed ? 'Unfold (Space)' : 'Fold (Space)', text:n.collapsed ? String(subtreeSize(m, id) - 1) : '−' }));
  });
  els.forEach((d, id) => { if (!seen.has(id)) { d.remove(); els.delete(id); } });
  const useD = window.CSS && CSS.supports && CSS.supports('d', 'path("M0 0")'), seenP = new Set();
  lay.L.forEach((b, id) => {
    if (b.n.parent == null) return; seenP.add(id);
    let p = paths.get(id); if (!p) { p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); edgesEl.append(p); paths.set(id, p); }
    const dd = edgePath(lay.L.get(b.n.parent), b); p.setAttribute('d', dd); if (useD) p.style.d = `path("${dd}")`;
    p.setAttribute('stroke', b.color); p.setAttribute('stroke-width', edgeW(b.depth));
  });
  paths.forEach((p, id) => { if (!seenP.has(id)) { p.remove(); paths.delete(id); } });
  placeTools(); clearTimeout(toolsT); toolsT = setTimeout(placeTools, 420); updateHint(); P.status();
}

/* ---------- view: pan, zoom, fit ---------- */
function applyView(smooth) {
  const v = cur.map.view; stage.classList.toggle('smooth', !!smooth);
  stage.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
  N.k = v.k; const z = $('#zoomRange'); if (z) z.value = Math.round(v.k * 100); const t = $('#zoomPct'); if (t) t.textContent = Math.round(v.k * 100) + '%';
  placeTools(); if (smooth) { clearTimeout(toolsT); toolsT = setTimeout(placeTools, 400); }
}
function zoomAt(k2, cx, cy) {
  const v = cur.map.view, r = mmEl.getBoundingClientRect(); k2 = ONE.clamp(k2, .2, 2.5);
  const px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2, wx = (px - v.x) / v.k, wy = (py - v.y) / v.k;
  v.k = k2; v.x = px - wx * k2; v.y = py - wy * k2; applyView(false); N.dirty();
}
MM.zoomTo = k => { if (!active) return; const r = mmEl.getBoundingClientRect(); zoomAt(k, r.left + r.width / 2, r.top + r.height / 2); };
MM.fit = (smooth = true) => {
  if (!active || !lay) return; const b = lay.bounds, r = mmEl.getBoundingClientRect(), bw = Math.max(1, b.x2 - b.x1), bh = Math.max(1, b.y2 - b.y1);
  const k = ONE.clamp(Math.min((r.width - 100) / bw, (r.height - 150) / bh), .25, 1.15);
  cur.map.view = { x:-((b.x1 + b.x2) / 2) * k, y:-((b.y1 + b.y2) / 2) * k, k }; applyView(smooth); N.dirty();
};
function ensureVisible(id) {
  const d = els.get(id); if (!d) return; const r = d.getBoundingClientRect(), m = mmEl.getBoundingClientRect(), v = cur.map.view; let dx = 0, dy = 0;
  if (r.left < m.left + 40) dx = m.left + 40 - r.left; else if (r.right > m.right - 40) dx = m.right - 40 - r.right;
  if (r.top < m.top + 70) dy = m.top + 70 - r.top; else if (r.bottom > m.bottom - 60) dy = m.bottom - 60 - r.bottom;
  if (dx || dy) { v.x += dx; v.y += dy; applyView(true); N.dirty(); }
}

/* ---------- selection and keyboard navigation ---------- */
function select(id) { sel = id; if (cur) cur.map.sel = id; els.forEach((d, i) => d.classList.toggle('sel', i === id)); placeTools(); }
function nav(dir) {
  const b = lay.L.get(sel); if (!b) return; const root = lay.root;
  const closest = (list, cy) => list.sort((a, c) => Math.abs(a.cy - cy) - Math.abs(c.cy - cy))[0];
  if (dir === 'up' || dir === 'down') {
    if (b.n === root) return;
    const peers = [...lay.L.values()].filter(x => x.depth === b.depth && x.side === b.side).sort((a, c) => a.cy - c.cy), t = peers[peers.indexOf(b) + (dir === 'down' ? 1 : -1)];
    if (t) { select(t.n.id); ensureVisible(t.n.id); } return;
  }
  const to = dir === 'right' ? 1 : -1;
  if (b.n === root) { const t = closest([...lay.L.values()].filter(x => x.depth === 1 && x.side === to), 0); if (t) { select(t.n.id); ensureVisible(t.n.id); } return; }
  if (b.side === to) {
    if (!b.hasKids) return;
    if (b.n.collapsed) { toggleFold(sel); const nb = lay.L.get(sel); if (nb && nb.vis.length) { const t = lay.L.get(nb.vis[0].id); select(t.n.id); ensureVisible(t.n.id); } return; }
    const t = closest(b.vis.map(c => lay.L.get(c.id)), b.cy); if (t) { select(t.n.id); ensureVisible(t.n.id); }
  } else if (b.n.parent != null) { select(b.n.parent); ensureVisible(b.n.parent); }
}

/* ---------- history and edits ---------- */
const H = () => hist.get(cur.id) || hist.set(cur.id, { u:[], r:[] }).get(cur.id);
const snap = () => JSON.stringify(cur.map.nodes);
function pushUndo(s) { const h = H(); h.u.push(s || snap()); if (h.u.length > 100) h.u.shift(); h.r = []; }
function afterChange() { fix(cur.map); P.touch(); render(); }
function change(fn) { if (N.recall) return blocked(); pushUndo(); fn(); afterChange(); }
const blocked = () => ONE.toast('Recall mode is on, so the map is read only. Turn it off in the Study tab to edit.');
function restore(s) {
  cur.map.nodes = JSON.parse(s); fix(cur.map); const r = cur.map.nodes.find(n => n.parent == null); if (r) { cur.title = r.text; N.onTitle && N.onTitle(); }
  P.touch(); render();
}
MM.undo = () => { if (!active) return; const h = H(); if (!h.u.length) return ONE.toast('Nothing to undo.'); h.r.push(snap()); restore(h.u.pop()); };
MM.redo = () => { if (!active) return; const h = H(); if (!h.r.length) return ONE.toast('Nothing to redo.'); h.u.push(snap()); restore(h.r.pop()); };

function addChild(pid, opt = {}) {
  if (N.recall) return blocked(); const m = cur.map, parent = byIdM(pid); if (!parent) return;
  endEdit(true); pushUndo(); parent.collapsed = false;
  const n = { id:ONE.uid(), parent:pid, text:opt.text || '' };
  if (pid === rootId()) { n.color = nextColor(m); n.side = pickSide(m); }
  m.nodes.push(n); sel = n.id; afterChange(); ensureVisible(n.id);
  if (opt.edit !== false) edit(n.id, { fresh:true }); return n;
}
function addSibling(id) {
  if (N.recall) return blocked(); const m = cur.map, n = byIdM(id); if (!n) return;
  if (n.parent == null) return addChild(id);
  endEdit(true); pushUndo();
  const s = { id:ONE.uid(), parent:n.parent, text:'' }; if (n.parent === rootId()) { s.color = nextColor(m); s.side = n.side; }
  m.nodes.splice(m.nodes.indexOf(n) + 1, 0, s); sel = s.id; afterChange(); ensureVisible(s.id); edit(s.id, { fresh:true });
}
function deleteNode(id) {
  if (N.recall) return blocked(); const n = byIdM(id); if (!n) return;
  if (n.parent == null) return ONE.toast('The central topic can’t be deleted. Rename it instead.');
  endEdit(true); pushUndo(); const gone = new Set([id, ...descendants(id)]);
  cur.map.nodes = cur.map.nodes.filter(x => !gone.has(x.id)); sel = n.parent; afterChange();
  ONE.toast(gone.size > 1 ? `Deleted the topic and ${gone.size - 1} below it.` : 'Topic deleted.', { action:'Undo', fn:() => MM.undo() });
}
function toggleFold(id) {
  const n = byIdM(id), b = lay.L.get(id); if (!n || !b || !b.hasKids || n.parent == null) return;
  change(() => { n.collapsed = !n.collapsed; if (n.collapsed) { const d = new Set(descendants(id)); if (d.has(sel)) sel = id; } });
}
function moveNode(id, tid, zone, side) {
  const m = cur.map, n = byIdM(id), t = byIdM(tid); if (!n || !t || n.parent == null || id === tid || descendants(id).includes(tid)) return;
  pushUndo(); m.nodes.splice(m.nodes.indexOf(n), 1);
  if (zone === 'child') { n.parent = t.id; t.collapsed = false; m.nodes.push(n); }
  else { n.parent = t.parent; m.nodes.splice(m.nodes.indexOf(t) + (zone === 'after' ? 1 : 0), 0, n); }
  if (n.parent === rootId()) { n.side = (t.parent == null ? side : t.side) || n.side || 1; if (!n.color) n.color = nextColor(m); } else { delete n.side; delete n.color; }
  sel = id; afterChange(); ensureVisible(id);
}
function duplicate(id) {
  const m = cur.map, n = byIdM(id); if (!n || n.parent == null) return;
  change(() => {
    const map = new Map(), all = [id, ...descendants(id)], copies = all.map(i => { const o = JSON.parse(JSON.stringify(byIdM(i))); map.set(i, o.id = ONE.uid()); return o; });
    copies.forEach((o, i) => { if (i) o.parent = map.get(o.parent); });
    if (n.parent === rootId()) copies[0].color = nextColor(m);
    m.nodes.splice(m.nodes.indexOf(n) + 1, 0, ...copies); sel = copies[0].id;
  });
}
const setColor = (id, c) => change(() => { const n = byIdM(id); if (c) n.color = c; else delete n.color; });
function setTag(id, key) { change(() => { const n = byIdM(id); if (!key || n.tag === key) { delete n.tag; delete n.done; } else { n.tag = key; delete n.done; } }); }
const toggleDone = id => change(() => { const n = byIdM(id); if (n.done) delete n.done; else n.done = true; });
MM.mark = key => { if (!active) return; if (!sel) sel = rootId(); setTag(sel, key); N.refreshTagPane && N.refreshTagPane(); };

/* ---------- text editing ---------- */
function edit(id, opt = {}) {
  if (N.recall) return blocked(); endEdit(true);
  const b = lay.L.get(id), d = els.get(id); if (!b || !d) return;
  const t = d.querySelector('.mm-text'); editing = { id, orig:b.n.text, fresh:!!opt.fresh, snap:opt.fresh ? null : snap() };
  toolsEl.hidden = true; d.classList.add('editing'); d.style.minWidth = d.offsetWidth + 'px'; d.style.minHeight = d.offsetHeight + 'px'; d.style.width = 'auto'; d.style.height = 'auto';
  t.textContent = b.n.text; t.contentEditable = 'plaintext-only'; if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.focus(); const r = document.createRange(); r.selectNodeContents(t); if (!opt.selectAll) r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function endEdit(commit = true, fromBlur = false) {
  if (!editing) return; const { id, orig, fresh, snap: before } = editing; editing = null;
  const d = els.get(id), t = d && d.querySelector('.mm-text'), n = cur && byIdM(id);
  let val = t ? t.innerText.replace(/ /g, ' ').replace(/\r/g, '').trim() : orig;
  if (t) { t.contentEditable = 'false'; getSelection().removeAllRanges(); }
  if (!commit) val = fresh ? '' : orig;
  if (!n) { render(); return; }
  if (!val) {
    if (fresh) { H().u.pop(); cur.map.nodes = cur.map.nodes.filter(x => x.id !== id); sel = n.parent != null ? n.parent : id; afterChange(); if (!fromBlur) mmEl.focus({ preventScroll:true }); return; }
    val = orig;
  }
  if (val !== n.text) {
    if (before) { const h = H(); h.u.push(before); if (h.u.length > 100) h.u.shift(); h.r = []; }
    n.text = val; if (n.parent == null) { cur.title = val; N.onTitle && N.onTitle(); }
    P.touch(); N.refreshTagPane && N.refreshTagPane();
  }
  render(); if (!fromBlur) mmEl.focus({ preventScroll:true });
}

/* ---------- notes, links, colors, marks ---------- */
function noteDialog(id) {
  if (N.recall) return blocked(); const n = byIdM(id); if (!n) return;
  const ta = el('textarea', { class:'tf', rows:6, maxlength:4000, placeholder:'An example, a reason, or the answer to this topic. Notes show up as the back of a flashcard.', 'aria-label':'Note' }); ta.value = n.note || '';
  ONE.modal({ title:'Note for “' + (n.text || 'topic').slice(0, 40) + '”', icon:'sticky_note_2', width:480, body:ta, actions:[{ label:'Cancel' }, n.note ? { label:'Remove', on:() => change(() => { delete n.note; }) } : null, { label:'Save', kind:'filled', on:() => change(() => { const v = ta.value.trim(); if (v) n.note = v; else delete n.note; }) }].filter(Boolean) });
  setTimeout(() => ta.focus(), 60);
}
function colorMenu(anchor) {
  const id = sel; if (!id || N.recall) return; const n = byIdM(id), isTop = n.parent === rootId();
  ONE.menuAt(anchor, [...N.MAP_COLORS.map((c, i) => ({ html:`<span class="swatch" style="background:${c}"></span>${COLOR_NAMES[i]}`, checked:n.color === c, on:() => setColor(id, c) })), '-', { label:isTop ? 'Next free color' : 'Same as parent', icon:'format_color_reset', on:() => setColor(id, null) }]);
}
function markMenu(anchor) {
  const id = sel; if (!id || N.recall) return; const n = byIdM(id);
  ONE.menuAt(anchor, [...TAGKEYS.map((k, i) => ({ html:`<span class="ms" style="color:${P.TAGS[k].color};font-variation-settings:'FILL' 1">${P.TAGS[k].icon}</span>${esc(P.TAGS[k].label)}`, kbd:'Ctrl+' + (i + 1), checked:n.tag === k, on:() => setTag(id, k) })), '-', { label:'Remove mark', icon:'label_off', kbd:'Ctrl+0', on:() => setTag(id, null) }]);
}
function newPageFrom(id) {
  const n = byIdM(id), s = N.section(), at = N.nb.cur.p + 1, pg = N.newPage(n.text || 'Untitled page', [N.item(48, 130, 680, '<p><br></p>')], Math.min(2, (cur.level || 0) + 1));
  pushUndo(); n.link = pg.id; P.touch(); s.pages.splice(at, 0, pg); N.go(N.nb.cur.s, at); ONE.toast('Page created and linked. Click the page icon on the topic to come back to the map.');
}
function linkMenu(anchor) {
  const id = sel; if (!id || N.recall) return; const n = byIdM(id), items = [{ label:'New page from this topic', icon:'note_add', on:() => newPageFrom(id) }];
  N.nb.sections.forEach(s => { const pgs = s.pages.filter(pg => pg !== cur); if (!pgs.length) return; items.push({ title:s.name }); pgs.forEach(pg => items.push({ label:pg.title || 'Untitled page', icon:pg.kind === 'map' ? 'account_tree' : 'description', checked:n.link === pg.id, on:() => change(() => { n.link = pg.id; }) })); });
  if (n.link) items.push('-', { label:'Remove link', icon:'link_off', on:() => change(() => { delete n.link; }) });
  ONE.menuAt(anchor, items);
}
function goLink(id) { const n = byIdM(id); if (!n || !n.link) return; if (N.find(n.link)) N.goPage(n.link); else { ONE.toast('That page was deleted, so the link was removed.'); change(() => { delete n.link; }); } }
function nodeMenu(id, at) {
  select(id); const n = byIdM(id), b = lay.L.get(id), isRoot = n.parent == null;
  ONE.menuAt(at, [
    { label:'Edit text', icon:'edit', kbd:'F2', on:() => edit(id, { selectAll:true }) },
    { label:'Add sub-topic', icon:'subdirectory_arrow_right', kbd:'Tab', on:() => addChild(id) },
    { label:'Add sibling', icon:'playlist_add', kbd:'Enter', disabled:isRoot, on:() => addSibling(id) }, '-',
    { label:'Color', icon:'palette', on:() => colorMenu(at) }, { label:'Mark', icon:'sell', on:() => markMenu(at) },
    { label:n.note ? 'Edit note' : 'Add note', icon:'sticky_note_2', on:() => noteDialog(id) }, { label:n.link ? 'Change link' : 'Link to a page', icon:'link', on:() => linkMenu(at) }, '-',
    { label:n.collapsed ? 'Unfold' : 'Fold', icon:n.collapsed ? 'unfold_more' : 'unfold_less', kbd:'Space', disabled:isRoot || !b.hasKids, on:() => toggleFold(id) },
    { label:'Duplicate branch', icon:'content_copy', disabled:isRoot, on:() => duplicate(id) }, '-',
    { label:'Delete', icon:'delete', danger:true, kbd:'Del', disabled:isRoot, on:() => deleteNode(id) }]);
}
MM.expandAll = () => active && change(() => cur.map.nodes.forEach(n => { delete n.collapsed; }));
MM.collapseAll = () => active && change(() => { cur.map.nodes.forEach(n => { if (n.parent === rootId()) n.collapsed = true; }); sel = rootId(); });
MM.focusRoot = () => { if (!active) return; select(rootId()); edit(rootId(), { selectAll:true }); };
MM.focusNode = id => {
  if (!active || !byIdM(id)) return; let n = byIdM(id), changed = false; while (n && n.parent != null) { n = byIdM(n.parent); if (n && n.collapsed) { n.collapsed = false; changed = true; } }
  sel = id; if (changed) afterChange(); else render(); ensureVisible(id); const d = els.get(id); if (d) { d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash'); }
};
MM.addChild = () => active && addChild(sel || rootId());
MM.addSibling = () => active && addSibling(sel || rootId());
MM.editSel = () => active && edit(sel || rootId(), { selectAll:true });
MM.deleteSel = () => active && deleteNode(sel || rootId());
MM.foldSel = () => active && toggleFold(sel || rootId());
MM.noteSel = () => active && noteDialog(sel || rootId());
MM.colorMenu = a => { if (!active) return; if (!sel) sel = rootId(); colorMenu(a); };
MM.markMenu = a => { if (!active) return; if (!sel) sel = rootId(); markMenu(a); };
MM.linkMenu = a => { if (!active) return; if (!sel) sel = rootId(); linkMenu(a); };
MM.applyRecall = () => { if (!active) return; revealed.clear(); render(); };
MM.active = () => active;
MM.page = () => cur;

/* ---------- floating tools and hint ---------- */
const TOOLS = [['edit', 'edit', 'Edit text (F2 or double-click)'], ['child', 'subdirectory_arrow_right', 'Add sub-topic (Tab)'], ['sib', 'playlist_add', 'Add sibling (Enter)'], ['color', 'palette', 'Color'], ['mark', 'sell', 'Mark (Ctrl+1 to 7)'], ['note', 'sticky_note_2', 'Note'], ['link', 'link', 'Link to a page'], ['fold', 'unfold_less', 'Fold or unfold (Space)'], ['del', 'delete', 'Delete (Del)']];
TOOLS.forEach(([k, ic, tip]) => toolsEl.append(el('button', { class:'mm-tb' + (k === 'del' ? ' danger' : ''), 'data-t':k, title:tip, 'aria-label':tip, html:icon(ic) })));
toolsEl.addEventListener('mousedown', e => e.preventDefault());
toolsEl.addEventListener('pointerdown', e => e.stopPropagation());
toolsEl.addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b || !sel) return;
  ({ edit:() => edit(sel, { selectAll:true }), child:() => addChild(sel), sib:() => addSibling(sel), color:() => colorMenu(b), mark:() => markMenu(b), note:() => noteDialog(sel), link:() => linkMenu(b), fold:() => toggleFold(sel), del:() => deleteNode(sel) })[b.dataset.t]();
});
function placeTools() {
  const d = active && sel && els.get(sel);
  if (!d || editing || drag || N.recall || !lay || !lay.L.has(sel)) { toolsEl.hidden = true; return; }
  const b = lay.L.get(sel), isRoot = b.n.parent == null;
  toolsEl.querySelector('[data-t="sib"]').hidden = isRoot; toolsEl.querySelector('[data-t="del"]').hidden = isRoot; toolsEl.querySelector('[data-t="fold"]').hidden = isRoot || !b.hasKids;
  toolsEl.hidden = false; const r = d.getBoundingClientRect(), m = mmEl.getBoundingClientRect(), tw = toolsEl.offsetWidth, th = toolsEl.offsetHeight;
  // lean toward the trunk so the bar doesn't sit on top of the branch's own children
  let x = b.side < 0 ? r.left - m.left : b.side > 0 ? r.right - m.left - tw : r.left - m.left + r.width / 2 - tw / 2, y = r.top - m.top - th - 12; if (y < 8) y = r.bottom - m.top + 12;
  toolsEl.style.left = ONE.clamp(x, 8, Math.max(8, m.width - tw - 8)) + 'px'; toolsEl.style.top = ONE.clamp(y, 8, Math.max(8, m.height - th - 8)) + 'px';
}
function updateHint() {
  if (!cur) return; const touch = matchMedia('(pointer:coarse)').matches, few = cur.map.nodes.length <= 12;
  hintEl.innerHTML = (few ? (touch ? '<span>Tap a topic, then use the buttons above it</span>' : '<span><kbd>Tab</kbd> sub-topic</span><span><kbd>Enter</kbd> sibling</span><span><kbd>Space</kbd> fold</span><span><kbd>Del</kbd> delete</span><span>drag a topic to move it</span>') : '') + '<button class="mm-help" title="Mind map shortcuts" aria-label="Mind map shortcuts">?</button>';
  hintEl.querySelector('.mm-help').onclick = MM.help;
}
MM.help = () => {
  const list = [['Add a sub-topic', 'Tab'], ['Add a sibling', 'Enter'], ['Edit the text', 'F2, double-click, or just start typing'], ['Finish typing', 'Esc'], ['Type the next topic faster', 'Tab or Enter while typing'], ['Move between topics', 'Arrow keys'], ['Fold or unfold', 'Space'], ['Delete', 'Delete'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Mark a topic', 'Ctrl+1 to Ctrl+7'], ['Move a topic', 'Drag it onto another topic'], ['Pan', 'Drag the background or scroll'], ['Zoom', 'Ctrl + scroll, or pinch']];
  ONE.modal({ title:'Mind map shortcuts', icon:'account_tree', width:560, body:`<div style="display:grid;grid-template-columns:1fr auto;gap:6px 18px;color:var(--on-surface)">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
};

/* ---------- pointer: select, pan, drag to move, pinch ---------- */
const pts = new Map(); let press = null, pinch = null;
const nodeOf = t => { const d = t.closest && t.closest('.mm-node'); return d ? d.dataset.id : null; };
mmEl.addEventListener('pointerdown', e => {
  if (!active || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.mm-tools,.mm-hint')) return;
  pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, k:cur.map.view.k, mx:(a.x + b.x) / 2, my:(a.y + b.y) / 2 }; press = null; mmEl.classList.remove('panning'); return; }
  const id = nodeOf(e.target);
  if (editing) { if (id === editing.id) return; endEdit(true); }
  mmEl.focus({ preventScroll:true });
  const v = cur.map.view;
  if (id) { select(id); press = { kind:'node', id, badge:e.target.closest('[data-b]'), x:e.clientX, y:e.clientY, vx:v.x, vy:v.y, moved:false }; }
  else { press = { kind:'pan', x:e.clientX, y:e.clientY, vx:v.x, vy:v.y, moved:false }; mmEl.classList.add('panning'); }
});
window.addEventListener('pointermove', e => {
  if (!active) return; if (pts.has(e.pointerId)) pts.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, v = cur.map.view; v.x += mx - pinch.mx; v.y += my - pinch.my; pinch.mx = mx; pinch.my = my; zoomAt(pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d), mx, my); return; }
  if (!press) return; const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) < 5) return; press.moved = true;
  const isRootNode = press.kind === 'node' && lay.L.get(press.id) && lay.L.get(press.id).n.parent == null;
  if (press.kind === 'pan' || isRootNode || N.recall || editing) { const v = cur.map.view; v.x = press.vx + dx; v.y = press.vy + dy; applyView(false); return; }
  if (!drag) { const n = byIdM(press.id); drag = { id:press.id, ghost:el('div', { class:'mm-ghost', text:n.text || 'Topic' }), target:null }; document.body.append(drag.ghost); toolsEl.hidden = true; const d = els.get(press.id); if (d) d.classList.add('dragging'); }
  drag.ghost.style.left = e.clientX + 14 + 'px'; drag.ghost.style.top = e.clientY + 10 + 'px'; setDrop(dropTarget(e));
});
function dropTarget(e) {
  const v = cur.map.view, r = mmEl.getBoundingClientRect(), wx = (e.clientX - r.left - r.width / 2 - v.x) / v.k, wy = (e.clientY - r.top - r.height / 2 - v.y) / v.k;
  const banned = new Set([drag.id, ...descendants(drag.id)]); let best = null;
  lay.L.forEach((b, id) => {
    if (banned.has(id) || wx < b.x - 6 || wx > b.x + b.w + 6 || wy < b.y - 6 || wy > b.y + b.h + 6) return;
    const rel = (wy - b.y) / b.h; let zone = 'child'; if (b.n.parent != null) { if (rel < .28) zone = 'before'; else if (rel > .72) zone = 'after'; }
    best = { id, zone, side:wx < 0 ? -1 : 1 };
  });
  return best;
}
function setDrop(t) {
  if (drag.target && (!t || t.id !== drag.target.id || t.zone !== drag.target.zone)) { const d = els.get(drag.target.id); if (d) d.classList.remove('drop-child', 'drop-before', 'drop-after'); }
  drag.target = t; if (t) { const d = els.get(t.id); if (d) d.classList.add('drop-' + t.zone); }
}
function endPress(e) {
  pts.delete(e.pointerId); if (pts.size < 2) pinch = null;
  if (!active) return; const p = press; press = null; mmEl.classList.remove('panning');
  if (drag) { const d = drag; drag = null; d.ghost.remove(); const dn = els.get(d.id); if (dn) dn.classList.remove('dragging'); if (d.target) { const t = d.target; const te = els.get(t.id); if (te) te.classList.remove('drop-child', 'drop-before', 'drop-after'); moveNode(d.id, t.id, t.zone, t.side); } else render(); return; }
  if (!p) return;
  if (p.moved) { N.dirty(); placeTools(); return; }
  if (p.kind === 'pan') { select(null); return; }
  const b = lay.L.get(p.id); if (!b) return;
  if (N.recall && hiddenInRecall(b)) { revealed.add(p.id); render(); return; }
  const k = p.badge && p.badge.dataset.b;
  if (k === 'fold') toggleFold(p.id); else if (k === 'link') goLink(p.id); else if (k === 'note') noteDialog(p.id); else if (k === 'tag' && b.n.tag === 'todo') toggleDone(p.id);
}
window.addEventListener('pointerup', endPress); window.addEventListener('pointercancel', endPress);
mmEl.addEventListener('dblclick', e => { if (!active || e.target.closest('[data-b],.mm-tools')) return; const id = nodeOf(e.target); if (id) edit(id, { selectAll:true }); });
mmEl.addEventListener('contextmenu', e => {
  if (!active) return; e.preventDefault(); const id = nodeOf(e.target);
  if (id) return nodeMenu(id, { x:e.clientX, y:e.clientY });
  ONE.menuAt({ x:e.clientX, y:e.clientY }, [{ label:'Fit to screen', icon:'fit_screen', on:() => MM.fit() }, { label:'Add sub-topic to the center', icon:'subdirectory_arrow_right', on:() => addChild(rootId()) }, { label:'Unfold everything', icon:'unfold_more', on:MM.expandAll }, { label:'Fold to the main branches', icon:'unfold_less', on:MM.collapseAll }]);
});
mmEl.addEventListener('wheel', e => {
  if (!active) return; e.preventDefault(); e.stopPropagation(); const v = cur.map.view;
  if (e.ctrlKey || e.metaKey) zoomAt(v.k * ONE.clamp(Math.exp(-e.deltaY * .01), .8, 1.25), e.clientX, e.clientY);
  else { v.x -= e.shiftKey ? e.deltaY : e.deltaX; v.y -= e.shiftKey ? 0 : e.deltaY; applyView(false); N.dirty(); }
}, { passive:false });
new ResizeObserver(() => { if (active) placeTools(); }).observe(wrap);

/* ---------- keyboard (called from app.js for every key while a map page is open) ---------- */
MM.key = e => {
  if (!active || editing || !lay) return false;
  const ae = document.activeElement; if (ae && ae !== document.body && ae !== mmEl && !mmEl.contains(ae)) return false;
  const mod = e.ctrlKey || e.metaKey, k = e.key; if (!sel) select(rootId());
  if (mod) {
    const low = k.toLowerCase();
    if (low === 'z' && !e.shiftKey) MM.undo(); else if (low === 'y' || (low === 'z' && e.shiftKey)) MM.redo();
    else if (/^[0-7]$/.test(k) && !e.altKey) MM.mark(k === '0' ? null : TAGKEYS[+k - 1]); else return false;
    e.preventDefault(); return true;
  }
  if (e.altKey) return false;
  const go = f => { e.preventDefault(); f(); return true; };
  switch (k) {
    case 'Tab': return go(() => { if (e.shiftKey) { const n = byIdM(sel); if (n && n.parent != null) { select(n.parent); ensureVisible(n.parent); } } else addChild(sel); });
    case 'Enter': return go(() => addSibling(sel));
    case 'F2': return go(() => edit(sel, { selectAll:true }));
    case 'Delete': case 'Backspace': return go(() => deleteNode(sel));
    case ' ': return go(() => toggleFold(sel));
    case 'ArrowUp': return go(() => nav('up')); case 'ArrowDown': return go(() => nav('down')); case 'ArrowLeft': return go(() => nav('left')); case 'ArrowRight': return go(() => nav('right'));
    case 'Escape': return go(() => select(null));
  }
  if (k.length === 1 && !N.recall) { edit(sel, { selectAll:true }); return true; }
  return false;
};

/* ---------- show / hide (wraps the canvas renderer) ---------- */
function show(p) {
  const entering = !active;
  if (entering) { savedK = N.k; active = true; wrap.classList.add('is-map'); ONE.ribbon.setContext('map', true); if (['home', 'insert', 'draw'].includes(ONE.ribbon.current)) ONE.ribbon.switchTab('mindmap'); }
  cur = p; editing = null; drag = null; revealed.clear(); fix(p.map);
  const root = p.map.nodes.find(n => n.parent == null); if (p.title) root.text = p.title; else p.title = root.text;
  sel = p.map.sel; els.forEach(d => d.remove()); els.clear(); paths.forEach(x => x.remove()); paths.clear();
  $('#items').innerHTML = ''; $('#ink').innerHTML = ''; P.clearChanged();
  render(); if (!p.map.view) MM.fit(false); else applyView(false);
  if (document.fonts) document.fonts.ready.then(() => { if (active && cur === p) render(); });
  ONE.ribbon.refresh();
}
function hide() {
  if (editing) endEdit(true); active = false; cur = null; lay = null; sel = null; wrap.classList.remove('is-map'); toolsEl.hidden = true;
  if (drag) { drag.ghost.remove(); drag = null; }
  N.k = savedK; ONE.ribbon.setContext('map', false);
  const z = $('#zoomRange'); if (z) z.value = Math.round(N.k * 100); const t = $('#zoomPct'); if (t) t.textContent = Math.round(N.k * 100) + '%';
}
const baseRender = P.render;
P.render = (anim = true) => { const p = N.page(); if (p && p.kind === 'map') show(p); else { if (active) hide(); baseRender(anim); } };
const baseSync = P.syncAll; P.syncAll = () => { if (editing) endEdit(true, true); baseSync(); };
const baseZoom = P.setZoom; P.setZoom = k => active ? MM.zoomTo(k) : baseZoom(k);
const baseTag = P.tag; P.tag = key => active ? MM.mark(key) : baseTag(key);
['newContainerAt', 'insertHTML', 'insertText', 'insertFiles'].forEach(k => { const f = P[k]; P[k] = (...a) => active ? ONE.toast('This is a mind map page. Add a note page to write text.') : f(...a); });

/* ---------- outline, markdown, notes, image ---------- */
function treeOf(p) { const kids = new Map(); p.map.nodes.forEach(n => { if (n.parent != null) (kids.get(n.parent) || kids.set(n.parent, []).get(n.parent)).push(n); }); const mk = n => ({ n, c:(kids.get(n.id) || []).map(mk) }); return mk(p.map.nodes.find(n => n.parent == null) || p.map.nodes[0]); }
MM.treeOf = treeOf;
MM.toMarkdown = p => {
  const t = treeOf(p), out = [`# ${p.title || 'Mind map'}`, ''];
  const walk = (x, d) => { const n = x.n, tag = n.tag === 'todo' ? (n.done ? '[x] ' : '[ ] ') : n.tag && P.TAGS[n.tag] ? `(${P.TAGS[n.tag].label}) ` : ''; out.push('  '.repeat(d) + '- ' + tag + n.text); if (n.note) out.push('  '.repeat(d + 1) + '> ' + n.note.replace(/\n+/g, ' ')); x.c.forEach(c => walk(c, d + 1)); };
  t.c.forEach(c => walk(c, 0)); return out.join('\n') + '\n';
};
MM.outlineHTML = p => { const li = x => `<li>${esc(x.n.text)}${x.n.note ? `<br><i>${esc(x.n.note)}</i>` : ''}${x.c.length ? ul(x.c) : ''}</li>`, ul = cs => `<ul>${cs.map(li).join('')}</ul>`; const t = treeOf(p); return t.c.length ? ul(t.c) : '<p>This mind map has no topics yet.</p>'; };
const tagAttr = n => n.tag && P.TAGS[n.tag] ? ` data-tag="${n.tag}" data-tid="${ONE.uid()}"${n.done ? ' data-done' : ''}` : '';
MM.toNotes = () => {
  if (!active) return; const t = treeOf(cur); if (!t.c.length) return ONE.toast('Add some topics first.');
  const li = x => `<li${tagAttr(x.n)}>${esc(x.n.text)}${x.n.note ? `<br><i>${esc(x.n.note)}</i>` : ''}${x.c.length ? lists(x.c) : ''}</li>`, lists = cs => `<ul>${cs.map(li).join('')}</ul>`;
  const html = t.c.map(x => `<h2${tagAttr(x.n)}>${esc(x.n.text)}</h2>${x.n.note ? `<p>${esc(x.n.note)}</p>` : ''}${x.c.length ? lists(x.c) : ''}`).join('');
  const pg = N.newPage((cur.title || 'Mind map') + ' (notes)', [N.item(48, 130, 760, html)], Math.min(2, (cur.level || 0) + 1)); insertAfterCurrent(pg); ONE.toast('Made a notes page from this map. The map is unchanged.');
};
function insertAfterCurrent(pg) { const s = N.section(), at = N.nb.cur.p + 1; s.pages.splice(at, 0, pg); N.go(N.nb.cur.s, at); }
MM.toSVG = p => {
  const m = p.map, lo = layout(m, FAM_EXPORT), b = lo.bounds, pad = 40, W = Math.ceil(b.x2 - b.x1 + pad * 2), Hh = Math.ceil(b.y2 - b.y1 + pad * 2);
  const css = getComputedStyle(document.documentElement), prim = (css.getPropertyValue('--primary') || '#6750a4').trim() || '#6750a4', onPrim = (css.getPropertyValue('--on-primary') || '#fff').trim() || '#fff';
  let e = '', nd = '';
  lo.L.forEach(bx => { if (bx.n.parent != null) e += `<path d="${edgePath(lo.L.get(bx.n.parent), bx)}" fill="none" stroke="${bx.color}" stroke-width="${edgeW(bx.depth)}" stroke-linecap="round"/>`; });
  lo.L.forEach(bx => {
    const st = bx.st, d = bx.depth; let fill, stroke = 'none', tc;
    if (d === 0) { fill = prim; tc = onPrim; } else if (d === 1) { fill = bx.color; tc = textOn(bx.color); } else { fill = mixHex(bx.color, .14); stroke = mixHex(bx.color, .55); tc = '#1f1f1f'; }
    const r = d === 0 ? 18 : Math.min(bx.h / 2, 999), tx0 = bx.x + st.px, tw = bx.w - st.px * 2 - bx.nb * BADGE, mid = d < 2;
    nd += `<rect x="${bx.x}" y="${bx.y}" width="${bx.w}" height="${bx.h}" rx="${Math.min(r, bx.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    bx.lines.forEach((ln, i) => { nd += `<text x="${mid ? tx0 + tw / 2 : tx0}" y="${bx.y + st.py + st.lh * i + st.lh * .72}" font-family="${FAM_EXPORT}" font-size="${st.s}" font-weight="${st.w}" fill="${tc}" text-anchor="${mid ? 'middle' : 'start'}">${esc(ln)}</text>`; });
    let bxp = bx.x + bx.w - st.px - bx.nb * BADGE + 12; const badge = g => { nd += `<circle cx="${bxp + BADGE / 2 - 6}" cy="${bx.cy}" r="9" fill="#fff" opacity=".92"/><text x="${bxp + BADGE / 2 - 6}" y="${bx.cy + 4.5}" font-family="${FAM_EXPORT}" font-size="12" font-weight="700" text-anchor="middle" fill="#444">${esc(g)}</text>`; bxp += BADGE; };
    if (bx.n.tag) badge(bx.n.tag === 'todo' ? (bx.n.done ? '☑' : '☐') : GLYPH[bx.n.tag] || '•'); if (bx.n.note) badge('✎'); if (bx.n.link) badge('↗');
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><rect width="100%" height="100%" fill="#ffffff"/><g transform="translate(${pad - b.x1} ${pad - b.y1})">${e}${nd}</g></svg>`;
};
MM.pageHTML = p => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title || 'Mind map')}</title><style>body{margin:0;background:#fff;display:grid;place-items:center;min-height:100vh}svg{max-width:100%;height:auto}</style></head><body>${MM.toSVG(p)}</body></html>`;
MM.png = async p => {
  try {
    const svg = MM.toSVG(p), url = URL.createObjectURL(new Blob([svg], { type:'image/svg+xml' })), img = new Image();
    await new Promise((ok, bad) => { img.onload = ok; img.onerror = bad; img.src = url; });
    const sc = 2, c = el('canvas'); c.width = img.width * sc; c.height = img.height * sc; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    c.toBlob(b => { if (!b) return ONE.toast('Couldn’t make the picture. Try the SVG export.'); ONE.download((p.title || 'Mind map').replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.png', b, 'image/png'); }, 'image/png');
  } catch { ONE.toast('Couldn’t make the picture. Try the SVG export.'); }
};

/* ---------- turn a notes page into a map, or build one from a pasted outline ---------- */
MM.outlineFromPage = p => {
  const items = [...p.items].sort((a, b) => a.y - b.y || a.x - b.x), out = [], docs = items.map(i => { const d = document.createElement('div'); d.innerHTML = i.html; return d; });
  let minH = 9, hd = 0; docs.forEach(d => d.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { minH = Math.min(minH, +h.tagName[1]); }));
  const flat = s => s.replace(/\s+/g, ' ').trim(), own = li => { const c = li.cloneNode(true); c.querySelectorAll('ul,ol').forEach(x => x.remove()); return flat(c.textContent); };
  const meta = x => { const o = {}; if (x.dataset && P.TAGS[x.dataset.tag]) o.tag = x.dataset.tag; if (o.tag && x.hasAttribute('data-done')) o.done = true; return o; };
  const clip = t => t.length > 90 ? { text:t.slice(0, 87).replace(/\s+\S*$/, '') + '…', note:t } : { text:t };
  const walk = (node, ld) => [...node.children].forEach(c => {
    const T = c.tagName;
    if (/^H[1-6]$/.test(T)) { hd = +T[1] - minH + 1; const t = flat(c.textContent); if (t) out.push(Object.assign({ depth:hd, text:t }, meta(c))); }
    else if (T === 'UL' || T === 'OL') walk(c, ld + 1);
    else if (T === 'LI') { const t = own(c); if (t) out.push(Object.assign({ depth:hd + ld }, clip(t), meta(c))); [...c.children].filter(x => /^(UL|OL)$/.test(x.tagName)).forEach(x => walk(x, ld + 1)); }
    else if (T === 'TABLE') [...c.rows].forEach(r => { if ([...r.cells].every(x => x.tagName === 'TH')) return; const cells = [...r.cells].map(x => flat(x.textContent)).filter(Boolean); if (cells.length) out.push({ depth:hd + 1, text:cells[0], note:cells.slice(1).join(' · ') || undefined }); });
    else if (/^(P|DIV|BLOCKQUOTE)$/.test(T)) { if (c.querySelector('ul,ol,p,div,h1,h2,h3,table')) walk(c, ld); else { const t = flat(c.textContent); if (t) out.push(Object.assign({ depth:hd + 1 }, clip(t), meta(c))); } }
  });
  docs.forEach(d => walk(d, 0)); return out;
};
MM.fromPage = () => {
  const p = N.page(); if (!p || p.kind === 'map') return ONE.toast('Open a notes page first, then turn it into a map.');
  P.syncAll(); const out = MM.outlineFromPage(p); if (!out.length) return ONE.toast('This page has no text to turn into a map yet.');
  insertAfterCurrent(N.mapFromOutline(p.title || 'Mind map', out, Math.min(2, (p.level || 0) + 1))); ONE.toast('Made a mind map from this page. Your notes are unchanged.');
};
function parseOutline(text) {
  const rows = text.replace(/\t/g, '  ').split(/\r?\n/).filter(l => l.trim()).map(l => ({ ind:l.match(/^ */)[0].length, text:l.trim().replace(/^([-*+•]|\d+[.)])\s+/, '') })).filter(r => r.text);
  if (!rows.length) return null; const nz = rows.map(r => r.ind).filter(x => x > 0), unit = nz.length ? Math.min(...nz) : 2;
  const norm = rows.map(r => ({ depth:Math.round(r.ind / unit), text:r.text }));
  if (norm[0].depth === 0 && norm.filter(r => r.depth === 0).length === 1) return { title:norm[0].text, out:norm.slice(1) };
  return { title:'Mind map', out:norm.map(r => ({ depth:r.depth + 1, text:r.text })) };
}
MM.outlineDialog = () => {
  const ta = el('textarea', { class:'tf', rows:11, placeholder:'Photosynthesis\n  Light reactions\n    Happen in the thylakoids\n    Make ATP\n  Calvin cycle\n    Fixes carbon dioxide', 'aria-label':'Outline', spellcheck:'false' });
  ONE.modal({ title:'Build a mind map from an outline', icon:'schema', width:540, body:el('div', { class:'dlg-col' }, el('p', { class:'muted', text:'Type or paste one topic per line. Indent a line to make it a sub-topic. Bullets and numbers are fine. A single first line becomes the center.' }), ta),
    actions:[{ label:'Cancel' }, { label:'Make the map', kind:'filled', on:() => { const r = parseOutline(ta.value); if (!r || !r.out.length) { ONE.toast('Add a few lines first.'); return false; } const cp = N.page(); insertAfterCurrent(N.mapFromOutline(r.title, r.out, cp ? Math.min(2, (cp.level || 0) + 1) : 0)); } }] });
  setTimeout(() => ta.focus(), 60);
};
})();
