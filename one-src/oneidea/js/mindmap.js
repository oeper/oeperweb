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
  t.addEventListener('input', () => { if (editing && editing.id === id) placeEditBar(); });
  t.addEventListener('paste', e => { if (!editing || editing.id !== id) return; const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; if (rowsOf(txt).length < 2) return; e.preventDefault(); pasteIntoEdit(txt, id); });
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
    d.className = 'mm-node d' + depth + (b.side < 0 ? ' l' : '') + (d.classList.contains('in') ? ' in' : '') + (sel === id ? ' sel' : '') + (n.collapsed && b.hasKids ? ' folded' : '') + (hiddenInRecall(b) ? ' hid' : '') + (isEd ? ' editing' : '') + (b.hasKids && b.depth > 0 ? ' hk' : '') + (m.nodes.length === 1 ? ' solo' : '') + (n.done ? ' done' : '') + (drag && drag.id === id ? ' dragging' : '');
    d.style.left = b.x + 'px'; d.style.top = b.y + 'px';
    if (!isEd) { d.style.width = b.w + 'px'; d.style.height = b.h + 'px'; d.style.minWidth = ''; d.style.minHeight = ''; t.textContent = b.lines.join('\n'); }
    d.style.setProperty('--c', b.color); d.style.setProperty('--tc', textOn(b.color)); d.style.setProperty('--lh', b.st.lh + 'px'); d.style.setProperty('--tw', b.tw + 'px');
    d.querySelectorAll('.mm-b,.mm-fold,.mm-add').forEach(x => x.remove());
    if (n.tag && P.TAGS[n.tag]) { const T = P.TAGS[n.tag]; d.append(el('span', { class:'mm-b', 'data-b':'tag', title:T.label + (n.tag === 'todo' ? ' (click to tick off)' : ''), html:icon(n.tag === 'todo' ? (n.done ? 'check_box' : 'check_box_outline_blank') : T.icon), style:{ color:T.color } })); }
    if (n.note) d.append(el('span', { class:'mm-b', 'data-b':'note', title:n.note, html:icon('sticky_note_2') }));
    if (n.link) { const lp = N.find(n.link); d.append(el('span', { class:'mm-b', 'data-b':'link', title:lp ? 'Open page: ' + (lp.p.title || 'Untitled page') : 'The linked page was deleted', html:icon(lp ? 'description' : 'link_off') })); }
    if (b.hasKids && b.depth > 0) d.append(el('button', { class:'mm-fold', 'data-b':'fold', tabindex:'-1', title:n.collapsed ? 'Unfold (Space)' : 'Fold (Space)', text:n.collapsed ? String(subtreeSize(m, id) - 1) : '−' }));
    d.append(el('button', { class:'mm-add mm-add-c', 'data-b':'addc', tabindex:'-1', title:b.depth ? 'Add sub-topic (Tab)' : 'Add a branch (Tab)', 'aria-label':'Add sub-topic', html:icon('add') }));
    if (b.depth > 0) d.append(el('button', { class:'mm-add mm-add-s', 'data-b':'adds', tabindex:'-1', title:'Add sibling (Enter)', 'aria-label':'Add sibling', html:icon('add') }));
  });
  mmEl.classList.toggle('ro', !!N.recall);
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

/* ---------- paste a list to make topics ---------- */
function rowsOf(text) {
  const rows = String(text).replace(/\t/g, '  ').split(/\r?\n/).filter(l => l.trim()).slice(0, 300).map(l => ({ ind:l.match(/^ */)[0].length, text:l.trim().replace(/^([-*+•▪◦]|\d+[.)])\s+/, '').slice(0, 300) })).filter(r => r.text);
  if (!rows.length) return []; const nz = rows.map(r => r.ind).filter(x => x > 0), unit = nz.length ? Math.min(...nz) : 2, base = Math.min(...rows.map(r => r.ind));
  return rows.map(r => ({ depth:Math.round((r.ind - base) / unit), text:r.text }));
}
function insertRows(rows, parentId, at, seed) {
  const m = cur.map, stack = [{ depth:-1, id:parentId }].concat(seed ? [seed] : []); let first = null;
  rows.forEach(r => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= r.depth) stack.pop();
    const par = stack[stack.length - 1], n = { id:ONE.uid(), parent:par.id, text:r.text };
    if (par.id === rootId()) { n.color = nextColor(m); n.side = pickSide(m); }
    m.nodes.splice(at++, 0, n); stack.push({ depth:r.depth, id:n.id }); if (!first) first = n;
  });
  return first;
}
function pasteIntoEdit(txt, id) {
  const rows = rowsOf(txt), n = byIdM(id), d = els.get(id), t = d && d.querySelector('.mm-text'); if (!n || !t || rows.length < 2) return;
  const typed = t.innerText.replace(/ /g, ' ').trim(), wasFresh = editing.fresh; editBar.hidden = true; editing = null; t.contentEditable = 'false'; getSelection().removeAllRanges();
  let first;
  if (!typed && n.parent != null) {
    if (!wasFresh) pushUndo(); n.text = rows[0].text; first = n;
    insertRows(rows.slice(1), n.parent, cur.map.nodes.indexOf(n) + 1, { depth:rows[0].depth, id:n.id });
  } else {
    pushUndo(); if (typed && typed !== n.text) { n.text = typed; if (n.parent == null) { cur.title = typed; N.onTitle && N.onTitle(); } }
    n.collapsed = false; first = insertRows(rows, n.id, cur.map.nodes.length);
  }
  sel = (first || n).id; afterChange(); ensureVisible(sel); mmEl.focus({ preventScroll:true });
  ONE.toast(`Added ${rows.length} topics.`, { action:'Undo', fn:() => MM.undo() });
}
document.addEventListener('paste', e => {
  if (e.defaultPrevented || !active || editing || !lay || N.recall) return; const ae = document.activeElement;
  if (ae && ae !== document.body && ae !== mmEl && !mmEl.contains(ae)) return;
  if (document.querySelector('.modal, .fc')) return;
  const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '', rows = rowsOf(txt); if (!rows.length) return;
  e.preventDefault(); const id = sel || rootId(), n = byIdM(id); pushUndo(); n.collapsed = false;
  const first = insertRows(rows, id, cur.map.nodes.length); sel = first.id; afterChange(); ensureVisible(sel);
  ONE.toast(`Added ${rows.length} topic${rows.length === 1 ? '' : 's'} under “${(n.text || 'topic').slice(0, 30)}”.`, { action:'Undo', fn:() => MM.undo() });
});

/* ---------- on-screen bar while typing (so touch users can add the next topic without a Tab key) ---------- */
const editBar = el('div', { class:'mm-tools mm-editbar', hidden:true, role:'toolbar', 'aria-label':'Typing actions' });
[['child', 'subdirectory_arrow_right', 'Sub-topic'], ['sib', 'playlist_add', 'Sibling'], ['done', 'check', 'Done']].forEach(([k, ic, lab]) => editBar.append(el('button', { class:'mm-tb lab' + (k === 'done' ? ' primary' : ''), 'data-e':k, type:'button', 'aria-label':lab, html:icon(ic) + '<span>' + lab + '</span>' })));
mmEl.append(editBar);
editBar.addEventListener('mousedown', e => e.preventDefault());
editBar.addEventListener('pointerdown', e => e.stopPropagation());
editBar.addEventListener('click', e => {
  const b = e.target.closest('[data-e]'); if (!b || !editing) return; const id = editing.id; endEdit(true); if (!byIdM(id)) return;
  if (b.dataset.e === 'child') addChild(id); else if (b.dataset.e === 'sib') addSibling(id);
});
function placeEditBar() {
  const d = editing && els.get(editing.id); if (!d || !lay) { editBar.hidden = true; return; }
  const b = lay.L.get(editing.id); editBar.querySelector('[data-e="sib"]').hidden = !b || b.n.parent == null; editBar.hidden = false;
  const r = d.getBoundingClientRect(), m = mmEl.getBoundingClientRect(), tw = editBar.offsetWidth, th = editBar.offsetHeight;
  let y = r.bottom - m.top + 12; if (y + th > m.height - 8) y = r.top - m.top - th - 12;
  editBar.style.left = ONE.clamp(r.left - m.left + r.width / 2 - tw / 2, 8, Math.max(8, m.width - tw - 8)) + 'px'; editBar.style.top = ONE.clamp(y, 8, Math.max(8, m.height - th - 8)) + 'px';
}

/* ---------- text editing ---------- */
function edit(id, opt = {}) {
  if (N.recall) return blocked(); endEdit(true);
  const b = lay.L.get(id), d = els.get(id); if (!b || !d) return;
  const t = d.querySelector('.mm-text'); editing = { id, orig:b.n.text, fresh:!!opt.fresh, snap:opt.fresh ? null : snap() };
  toolsEl.hidden = true; d.classList.add('editing'); d.style.minWidth = d.offsetWidth + 'px'; d.style.minHeight = d.offsetHeight + 'px'; d.style.width = 'auto'; d.style.height = 'auto';
  t.textContent = b.n.text; t.contentEditable = 'plaintext-only'; if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.focus(); const r = document.createRange(); r.selectNodeContents(t); if (!opt.selectAll) r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  placeEditBar(); requestAnimationFrame(placeEditBar);
}
function endEdit(commit = true, fromBlur = false) {
  if (!editing) return; const { id, orig, fresh, snap: before } = editing; editing = null; editBar.hidden = true;
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
const TOOLS = [['edit', 'edit', 'Edit text (F2 or double-click)'], ['child', 'subdirectory_arrow_right', 'Add sub-topic (Tab)', 'Sub-topic'], ['sib', 'playlist_add', 'Add sibling (Enter)', 'Sibling'], ['color', 'palette', 'Color'], ['mark', 'sell', 'Mark (Ctrl+1 to 7)'], ['note', 'sticky_note_2', 'Note'], ['link', 'link', 'Link to a page'], ['fold', 'unfold_less', 'Fold or unfold (Space)'], ['del', 'delete', 'Delete (Del)']];
TOOLS.forEach(([k, ic, tip, lab]) => toolsEl.append(el('button', { class:'mm-tb' + (lab ? ' lab' : '') + (k === 'del' ? ' danger' : ''), 'data-t':k, title:tip, 'aria-label':tip, html:icon(ic) + (lab ? '<span>' + lab + '</span>' : '') })));
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
  if (cur.map.nodes.length === 1 && !N.recall) { hintEl.innerHTML = '<span class="mm-first"><b>Start here:</b> ' + (touch ? 'tap the center to name it, then tap + to add branches.' : 'type to name the center, then press <kbd>Tab</kbd> or click + to add branches.') + ' You can also paste a list.</span><button class="mm-help" title="Mind map shortcuts" aria-label="Mind map shortcuts">?</button>'; hintEl.querySelector('.mm-help').onclick = MM.help; return; }
  hintEl.innerHTML = (few ? (touch ? '<span>Tap a topic, then use + or the bar above it. Tap it again to edit</span>' : '<span><kbd>Tab</kbd> sub-topic</span><span><kbd>Enter</kbd> sibling</span><span><kbd>Space</kbd> fold</span><span><kbd>Del</kbd> delete</span><span>drag a topic to move it</span>') : '') + '<button class="mm-help" title="Mind map shortcuts" aria-label="Mind map shortcuts">?</button>';
  hintEl.querySelector('.mm-help').onclick = MM.help;
}
MM.help = () => {
  const list = [['Add a sub-topic', 'Tab'], ['Add a sibling', 'Enter'], ['Edit the text', 'F2, double-click, or just start typing'], ['Finish typing', 'Esc'], ['Type the next topic faster', 'Tab or Enter while typing'], ['Move between topics', 'Arrow keys'], ['Fold or unfold', 'Space'], ['Delete', 'Delete'], ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Mark a topic', 'Ctrl+1 to Ctrl+7'], ['Move a topic', 'Drag it onto another topic'], ['Add many topics at once', 'Paste a list (Ctrl+V) while a topic is selected or being typed in'], ['Edit on a phone', 'Tap a selected topic again'], ['Pan', 'Drag the background or scroll'], ['Zoom', 'Ctrl + scroll, or pinch']];
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
  if (id) { const wasSel = sel === id; select(id); press = { kind:'node', id, wasSel, touch:e.pointerType !== 'mouse', badge:e.target.closest('[data-b]'), x:e.clientX, y:e.clientY, vx:v.x, vy:v.y, moved:false }; }
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
  if (k === 'addc') addChild(p.id); else if (k === 'adds') addSibling(p.id); else if (k === 'fold') toggleFold(p.id); else if (k === 'link') goLink(p.id); else if (k === 'note') noteDialog(p.id); else if (k === 'tag' && b.n.tag === 'todo') toggleDone(p.id); else if (!k && p.wasSel && p.touch && !N.recall) edit(p.id, { selectAll:true });
}
window.addEventListener('pointerup', endPress); window.addEventListener('pointercancel', endPress);
mmEl.addEventListener('dblclick', e => { if (!active || e.target.closest('[data-b],.mm-tools')) return; const id = nodeOf(e.target); if (id && !(editing && editing.id === id)) edit(id, { selectAll:true }); });
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
/* ---------- mind maps inside notes ---------- */
const embSrc = p => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(MM.toSVG(p));
const embCap = p => 'Mind map: ' + (p.title || 'Mind map');
const embHTML = p => `<figure class="mmemb" contenteditable="false" data-map="${p.id}"><img src="${embSrc(p)}" alt="${esc(embCap(p))}"><figcaption><span class="mmemb-t">${esc(embCap(p))}</span><button type="button" class="mmemb-b" data-mm="open" title="Open map" aria-label="Open map"></button><button type="button" class="mmemb-b" data-mm="remove" title="Remove from note" aria-label="Remove from note"></button></figcaption></figure><p><br></p>`;
const backBtn = el('button', { class:'mm-back', type:'button', hidden:true, html:icon('arrow_back') + '<span>Back to note</span>', onclick:() => { const b = MM.back, f = b && N.find(b.from); if (f) N.go(f.si, f.pi); else ONE.toast('That note was deleted.'); } });
$('#mm').append(backBtn);
const showBack = () => { const b = MM.back; backBtn.hidden = !(active && cur && b && b.to === cur.id && N.find(b.from)); };
const embOpen = id => { const f = N.find(id); if (!f || f.p.kind !== 'map') return ONE.toast('That mind map was deleted.'); const here = N.page(); P.syncAll(); MM.back = here ? { from:here.id, to:f.p.id } : null; N.go(f.si, f.pi); };
const allMaps = () => { const out = []; N.nb.sections.forEach(s => s.pages.forEach(p => { if (p.kind === 'map') out.push(p); })); return out; };
function embedNew() {
  const cp = N.page(); if (!cp || cp.kind === 'map') return ONE.toast('Open a notes page first, then add a mind map to it.');
  const mp = N.newMapPage(cp.title ? cp.title + ' map' : 'Mind map', Math.min(2, (cp.level || 0) + 1)), s = N.section();
  P.insertHTML(embHTML(mp)); P.syncAll();
  let j = N.nb.cur.p + 1; while (j < s.pages.length && s.pages[j].level > (cp.level || 0)) j++; s.pages.splice(j, 0, mp);
  MM.back = { from:cp.id, to:mp.id }; N.go(N.nb.cur.s, j, { focusTitle:true });
}
MM.insertMenu = a => {
  const cp = N.page(); if (!cp || cp.kind === 'map') return ONE.toast('Open a notes page first, then add a mind map to it.');
  const maps = allMaps().slice(0, 14);
  ONE.menuAt(a, [{ label:'New mind map here', icon:'add', on:embedNew }, ...(maps.length ? ['-', ...maps.map(m => ({ label:m.title || 'Mind map', icon:'account_tree', on:() => { P.insertHTML(embHTML(m)); P.syncAll(); ONE.toast('Added. It updates whenever you change the map.'); } }))] : [])]);
};
MM.refreshEmbeds = () => {
  const root = $('#items'); if (!root || active) return;
  root.querySelectorAll('figure.mmemb').forEach(fig => {
    const f = N.find(fig.dataset.map), img = fig.querySelector('img'), cap = fig.querySelector('.mmemb-t');
    if (f && f.p.kind === 'map') { const src = embSrc(f.p); if (img && img.getAttribute('src') !== src) img.setAttribute('src', src); if (img) img.alt = embCap(f.p); if (cap) cap.textContent = embCap(f.p); fig.classList.remove('gone'); }
    else { fig.classList.add('gone'); if (cap) cap.textContent = 'This mind map was deleted'; }
  });
  P.syncAll();
};
$('#items').addEventListener('click', e => {
  const fig = e.target.closest('figure.mmemb'); if (!fig) return; e.preventDefault();
  if (e.target.closest('[data-mm="remove"]')) { const b = fig.closest('.nc-body'); fig.remove(); if (b) P.sync(b); return; }
  embOpen(fig.dataset.map);
});
const renderWithEmbeds = P.render; P.render = (anim = true) => { renderWithEmbeds(anim); MM.refreshEmbeds(); showBack(); };
/* ---------- bridge for the epic AI panel: shared/one-ai.js reads the page and builds maps / notes through window.OIAI ---------- */
{
  const TAGSET = new Set(['todo', 'important', 'question', 'remember', 'definition', 'idea', 'critical']);
  const flat = t => String(t || '').replace(/\s+/g, ' ').trim();
  const plain = t => flat(t).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  const tagWord = n => n.tag === 'todo' ? (n.done ? '[x] ' : '[ ] ') : n.tag && TAGSET.has(n.tag) ? `[${n.tag}] ` : '';
  // "[ ] text", "[x] text", "[important] text" ... -> { tag, done, text }
  const lead = t => {
    const m = /^\[(x| |[a-z]+)\]\s*(.*)$/i.exec(t); if (!m) return { text:t };
    const k = m[1].toLowerCase();
    if (k === ' ') return { tag:'todo', text:m[2] };
    if (k === 'x' || k === 'done') return { tag:'todo', done:true, text:m[2] };
    return TAGSET.has(k) ? { tag:k, text:m[2] } : { text:t };
  };
  const outlineText = p => {
    const out = [`# ${p.title || 'Mind map'}`], walk = (x, d) => {
      out.push('  '.repeat(d) + '- ' + tagWord(x.n) + String(x.n.text).replace(/\n+/g, ' ')); if (x.n.note) out.push('  '.repeat(d + 1) + '> ' + x.n.note.replace(/\n+/g, ' ')); x.c.forEach(c => walk(c, d + 1));
    };
    treeOf(p).c.forEach(c => walk(c, 0)); return out.join('\n');
  };
  const pageOutline = p => {
    P.syncAll(); const rows = MM.outlineFromPage(p); if (!rows.length) return '';
    return [`# ${p.title || 'Untitled page'}`, ...rows.flatMap(o => ['  '.repeat(Math.max(0, o.depth - 1)) + '- ' + tagWord(o) + o.text].concat(o.note ? ['  '.repeat(Math.max(0, o.depth)) + '> ' + o.note] : []))].join('\n');
  };
  // the open notes page as markdown the AI can edit and send back whole (headings, bullets, tags, tables)
  const pageMarkdown = p => {
    P.syncAll();
    const tagOf = x => x.dataset && TAGSET.has(x.dataset.tag) ? (x.dataset.tag === 'todo' ? (x.hasAttribute('data-done') ? '[x] ' : '[ ] ') : `[${x.dataset.tag}] `) : '';
    const inline = n => {
      if (n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
      if (n.nodeType !== 1) return '';
      const T = n.tagName, k = [...n.childNodes].map(inline).join('');
      if (/^(UL|OL|TABLE)$/.test(T)) return '';
      if (T === 'B' || T === 'STRONG') return k.trim() ? `**${k.trim()}**` : k;
      if (T === 'I' || T === 'EM') return k.trim() ? `*${k.trim()}*` : k;
      if (T === 'CODE') return '`' + k + '`';
      if (T === 'BR') return ' ';
      if (T === 'A' && n.getAttribute('href')) return `[${k.trim()}](${n.getAttribute('href')})`;
      if (T === 'IMG') return '';
      return k;
    };
    const lines = [];
    const list = (node, d) => [...node.children].forEach(li => {
      if (li.tagName !== 'LI') return;
      const t = flat([...li.childNodes].map(inline).join('')); const ord = node.tagName === 'OL';
      if (t) lines.push('  '.repeat(d) + (ord ? '1. ' : '- ') + tagOf(li) + t);
      [...li.children].filter(x => /^(UL|OL)$/.test(x.tagName)).forEach(x => list(x, d + 1));
    });
    const walk = node => [...node.children].forEach(c => {
      const T = c.tagName;
      if (/^H[1-6]$/.test(T)) { const t = flat(inline(c)); if (t) lines.push('', (+T[1] <= 3 ? '## ' : '#### ') + t); }
      else if (T === 'UL' || T === 'OL') list(c, 0);
      else if (T === 'TABLE') {
        const rows = [...c.rows].map(r => [...r.cells].map(x => flat(inline(x)).replace(/\|/g, '/')));
        rows.forEach((r, i) => { lines.push('| ' + r.join(' | ') + ' |'); if (i === 0) lines.push('|' + r.map(() => '---').join('|') + '|'); });
      }
      else if (/^(P|DIV|BLOCKQUOTE|PRE|FIGCAPTION)$/.test(T)) {
        if (c.querySelector('ul,ol,table,h1,h2,h3,h4,p,div')) walk(c);
        else { const t = flat(inline(c)); if (t) lines.push((T === 'BLOCKQUOTE' ? '> ' : '') + tagOf(c) + t); }
      }
      else { const t = flat(inline(c)); if (t) lines.push(t); }
    });
    [...p.items].sort((a, b) => a.y - b.y || a.x - b.x).forEach(it => { const d = document.createElement('div'); d.innerHTML = it.html; walk(d); if (!d.children.length) { const t = flat(inline(d)); if (t) lines.push(t); } });
    return lines.join('\n').replace(/^\n+/, '');
  };
  // indented outline text -> { title, out:[{ depth, text, note, tag, done }] }
  const parseOutlineAI = text => {
    let title = '', rows = [], m;
    String(text || '').replace(/\r/g, '').replace(/\t/g, '  ').split('\n').forEach(raw => {
      if (!raw.trim() || rows.length >= 250) return;
      if (!rows.length && !title && (m = /^\s*#{1,3}\s+(.*)$/.exec(raw))) { title = plain(m[1]); return; }
      if ((m = /^\s*>\s?(.*)$/.exec(raw))) { const last = rows[rows.length - 1]; if (last) last.note = (last.note ? last.note + ' ' : '') + plain(m[1]); return; }
      m = /^(\s*)(?:[-*+•]|\d+[.)])?\s*(.*)$/.exec(raw);
      const urls = []; const bare = m[2].replace(/\[\[([^\]]+)\]\]/g, '[$1]').replace(/!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)[^)]*\)/g, (_, tx, u) => { urls.push(u); return tx || u; });
      const l = lead(plain(bare)); if (l.text) rows.push({ ind:m[1].length, text:l.text, tag:l.tag, done:l.done, note:urls.length ? urls.join(' ') : undefined });
    });
    if (!rows.length) return null;
    const nz = rows.map(r => r.ind).filter(x => x > 0), unit = nz.length ? Math.min(...nz) : 2;
    const out = rows.map(r => ({ depth:Math.round(r.ind / unit) + 1, text:r.text, note:r.note, tag:r.tag, done:r.done }));
    if (!title && out[0].depth === 1 && out.filter(o => o.depth === 1).length === 1) { title = out[0].text; out.shift(); out.forEach(o => { o.depth = Math.max(1, o.depth - 1); }); }
    return { title:title || '', out };
  };
  const removePage = (id, backId) => {
    const f = N.find(id); if (!f) return;
    const b = N.find(backId); if (b) N.go(b.si, b.pi);
    const g = N.find(id); if (!g) return;
    if (g.s.pages.length > 1) g.s.pages.splice(g.pi, 1);
    const at = N.find(backId); N.go(at ? at.si : g.si, at ? at.pi : Math.max(0, g.pi - 1));
  };
  const addPage = pg => { const here = N.page(), hid = here && here.id; P.syncAll(); insertAfterCurrent(pg); return () => removePage(pg.id, hid); };
  const levelBelow = () => { const cp = N.page(); return cp ? Math.min(2, (cp.level || 0) + 1) : 0; };

  const newMap = (text, title, o) => {
    const r = parseOutlineAI(text); if (!r || !r.out.length) return null;
    return addPage(N.mapFromOutline(plain(title) || r.title || 'Mind map', r.out, o && o.flat ? 0 : levelBelow()));
  };
  const setMap = text => {
    if (!active || !cur || cur.kind !== 'map' || N.recall) return null;
    const r = parseOutlineAI(text); if (!r || !r.out.length) return null;
    const id = cur.id, tmp = N.mapFromOutline(r.title || cur.title, r.out);
    // keep the colours of top-level branches that kept their name
    const old = new Map(cur.map.nodes.filter(n => n.parent === rootId()).map(n => [flat(n.text).toLowerCase(), n]));
    tmp.map.nodes.filter(n => n.parent === tmp.map.nodes[0].id).forEach(n => { const o = old.get(flat(n.text).toLowerCase()); if (o && o.color) n.color = o.color; });
    change(() => { cur.map.nodes = tmp.map.nodes; sel = tmp.map.nodes[0].id; cur.title = tmp.map.nodes[0].text; N.onTitle && N.onTitle(); });
    return () => { if (active && cur && cur.id === id) MM.undo(); };
  };

  /* markdown-ish notes -> one box per "## heading", laid out in two columns */
  const inlLocal = t => esc(t.replace(/\$\\(?:right|to)arrow\$/g, '->')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  let inl = inlLocal; // newNotes swaps in the panel's richer converter (links, buttons, ...) while it builds
  const tattr = l => l.tag ? ` data-tag="${l.tag}" data-tid="${ONE.uid()}"${l.done ? ' data-done' : ''}` : '';
  const listHTML = items => {
    let html = '', stack = [];
    items.forEach(it => {
      while (stack.length && it.ind < stack[stack.length - 1].ind) html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>';
      let top = stack[stack.length - 1];
      if (top && it.ind === top.ind && top.ord !== it.ord) { html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>'; top = stack[stack.length - 1]; }
      if (top && it.ind === top.ind) html += '</li>'; else if (!top || it.ind > top.ind) { html += it.ord ? '<ol>' : '<ul>'; stack.push({ ind:it.ind, ord:it.ord }); }
      html += it.open;
    });
    while (stack.length) html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>';
    return html;
  };
  const sectionHTML = (head, lines) => {
    let html = head ? `<h3>${inl(head)}</h3>` : '', h = head ? 44 : 0, i = 0, m;
    const est = t => 10 + 24 * Math.max(1, Math.ceil(t.length / 50));
    while (i < lines.length) {
      const raw = lines[i];
      if (!raw.trim()) { i++; continue; }
      if (/^\s*\|/.test(raw)) {
        const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^[\s|:\-]+$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => inl(flat(c)))); i++; }
        if (rows.length) { html += '<table>' + rows.map((r, k) => '<tr>' + r.map(c => k ? `<td>${c}</td>` : `<th>${c}</th>`).join('') + '</tr>').join('') + '</table>'; h += rows.length * 38 + 12; }
        continue;
      }
      if (/^\s*([-*+•]|\d+[.)])\s+/.test(raw)) {
        const items = [];
        while (i < lines.length && (m = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(lines[i]))) {
          const l = lead(flat(m[3])); if (!l.tag && l.text.includes(' :: ')) l.tag = 'definition'; items.push({ ind:m[1].replace(/\t/g, '  ').length, ord:/\d/.test(m[2]), open:`<li${tattr(l)}>${inl(l.text)}` }); h += est(l.text) - 8; i++;
        }
        html += listHTML(items); h += 10; continue;
      }
      i++;
      const t = flat(raw);
      if ((m = /^#{4,6}\s+(.*)$/.exec(t))) { html += `<h4>${inl(m[1])}</h4>`; h += 34; }
      else if ((m = /^>\s?(.*)$/.exec(t))) { html += `<blockquote>${inl(m[1])}</blockquote>`; h += est(m[1]); }
      else if (/^\[(x| |[a-z]+)\]\s/i.test(t) && lead(t).tag) { const l = lead(t); html += `<p${tattr(l)}>${inl(l.text)}</p>`; h += est(l.text); }
      else if (t.includes(' :: ')) { html += `<p data-tag="definition" data-tid="${ONE.uid()}">${inl(t)}</p>`; h += est(t); }
      else { html += `<p>${inl(t)}</p>`; h += est(t); }
    }
    return { html: html || '<p><br></p>', h: Math.max(h, 70) };
  };
  const buildNotes = (md, title, o) => {
    inl = (o && typeof o.inline === 'function') ? o.inline : inlLocal;
    const lines = String(md || '').replace(/\r/g, '').split('\n'), secs = [];
    let pageTitle = plain(title), cursec = null;
    lines.forEach(raw => {
      const m = /^\s*(#{1,3})\s+(.*)$/.exec(raw);
      if (m) {
        if (m[1] === '#' && !pageTitle && !secs.length && !cursec) { pageTitle = plain(m[2]); return; }
        cursec = { head:plain(m[2]), lines:[] }; secs.push(cursec); return;
      }
      if (!cursec) { cursec = { head:'', lines:[] }; secs.push(cursec); }
      cursec.lines.push(raw);
    });
    let built; try { built = secs.map(sc => sectionHTML(sc.head, sc.lines)).filter(b => b.html !== '<p><br></p>' || b.h > 70); } finally { inl = inlLocal; }
    if (!built.length) return null;
    const items = [];
    if (o && o.layout === 'cornell' && built.length >= 2) {
      // Cornell notes: narrow cues on the left, wide notes on the right, summary underneath
      items.push(N.item(48, 130, 250, built[0].html), N.item(330, 130, 670, built[1].html));
      let yy = 130 + Math.max(built[0].h, built[1].h) + 28;
      built.slice(2).forEach(b => { items.push(N.item(48, yy, 952, b.html)); yy += b.h + 28; });
    } else if (built.length === 1) items.push(N.item(48, 130, 760, built[0].html));
    else { const y = [130, 130]; built.forEach(b => { const c = y[0] <= y[1] ? 0 : 1; items.push(N.item(c ? 520 : 48, y[c], 440, b.html)); y[c] += b.h + 28; }); }
    return { title:pageTitle, items };
  };
  const newNotes = (md, title, o) => {
    const b = buildNotes(md, title, o); if (!b) return null;
    return addPage(N.newPage(b.title || 'Notes', b.items, o && o.flat ? 0 : levelBelow()));
  };
  /* editing the notes page that is open (instead of making another page) */
  const RICH = /<(img|iframe|video|audio|canvas|svg|embed|object|figure)\b/i;
  const bottomOfPage = () => { let y = 100; $$('.nc').forEach(n => { y = Math.max(y, n.offsetTop + n.offsetHeight); }); return y; };
  const canEditNotes = () => { const p = N.page(); return !!(p && p.kind !== 'map' && !N.recall); };
  const redraw = pg => { if (N.page() === pg) { P.render(false); } N.dirty(); };
  // add more boxes underneath what is already on the page
  const addNotes = (md, o) => {
    if (!canEditNotes()) return null;
    const pg = N.page(); P.syncAll();
    const b = buildNotes(md, '', o); if (!b || !b.items.length) return null;
    const dy = bottomOfPage() + 28 - 130; b.items.forEach(it => { it.y += dy; });
    pg.items.push(...b.items); const ids = new Set(b.items.map(i => i.id)); redraw(pg);
    const undo = () => { pg.items = pg.items.filter(i => !ids.has(i.id)); redraw(pg); };
    undo.note = 'Added to this page.'; return undo;
  };
  // replace the text on the open page with the AI's improved version (pictures, embeds and drawings stay)
  const setNotes = (md, title, o) => {
    if (!canEditNotes()) return null;
    const pg = N.page(); P.syncAll();
    const b = buildNotes(md, title, o); if (!b || !b.items.length) return null;
    const before = { items:JSON.parse(JSON.stringify(pg.items)), title:pg.title };
    const keep = pg.items.filter(i => RICH.test(i.html));
    // measure the new content from the layout estimate, then park the kept boxes below it
    const tall = b.items.reduce((m, it) => Math.max(m, it.y + 60 + Math.ceil(String(it.html).replace(/<[^>]+>/g, '').length / 50) * 24), 130);
    keep.forEach(k => { k.y = tall + 28; });
    pg.items = b.items.concat(keep); if (b.title && !pg.title) pg.title = b.title;
    redraw(pg); if (pg.title !== before.title && N.onTitle) N.onTitle();
    const undo = () => { pg.items = before.items; pg.title = before.title; redraw(pg); if (N.onTitle) N.onTitle(); };
    undo.note = 'Updated this page.'; return undo;
  };

  /* ---------- study tools: flashcards, quizzes, key terms, Recall mode ---------- */
  const withPrefix = (title, prefix) => { const t = plain(title); return !t ? prefix : new RegExp('^' + prefix + '\\b', 'i').test(t) ? t : prefix + ': ' + t; };
  const fail = m => { OIAI.lastError = m; return null; };
  // Flashcards: a notes page whose "Term :: meaning" lines the Flashcards screen turns into cards (with spaced review).
  const newCards = (md, title, o) => {
    OIAI.lastError = '';
    const undo = newNotes(md, withPrefix(title, 'Flashcards'), o); if (!undo) return fail('There were no cards in that answer.');
    const pg = N.page(), n = window.ST ? window.ST.cardsFrom([pg]).length : 0;
    if (!n) { undo(); return fail('No "Term :: meaning" lines were found, so no flashcards were made.'); }
    undo.note = 'Made ' + n + ' flashcards.';
    undo.actions = [{ label:'Study them', run:() => window.ST.open('page') }];
    return undo;
  };
  // Quiz: questions tagged Question, each answer in bold on the next line, so Recall mode hides the answers.
  const newQuiz = (md, title, o) => {
    OIAI.lastError = '';
    const undo = newNotes(md, withPrefix(title, 'Quiz'), o); if (!undo) return fail('There were no questions in that answer.');
    const n = (N.page().items.map(i => i.html).join('').match(/data-tag="question"/g) || []).length;
    undo.note = 'Made a quiz' + (n ? ' with ' + n + ' questions' : '') + '. Recall mode hides the answers so you can test yourself.';
    undo.actions = [{ label:'Test myself', run:() => { if (!N.recall && window.ST) window.ST.toggleRecall(); } }];
    return undo;
  };
  // Highlight key terms on the open notes page (the same yellow as the Key term button), so Recall mode can hide them.
  const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlight = text => {
    OIAI.lastError = '';
    const p = N.page();
    if (!p || p.kind === 'map') return fail('Key terms can only be highlighted on a notes page.');
    const terms = [...new Set(String(text || '').split('\n').map(l => plain(l.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '').replace(/^["“]|["”]$/g, ''))).filter(t => t.length >= 2 && t.length <= 80))].slice(0, 40);
    if (!terms.length) return fail('There were no key terms in that answer.');
    P.syncAll();
    const before = p.items.map(i => i.html);
    let found = 0;
    p.items.forEach(it => {
      const d = document.createElement('div'); d.innerHTML = it.html;
      terms.forEach(term => {
        const re = new RegExp(reEsc(term), 'i'); let left = 2;
        const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT), nodes = [];
        while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(node => {
          if (left <= 0 || !node.parentElement || node.parentElement.closest('[style*="background-color"],b,strong,a')) return;
          const m = re.exec(node.nodeValue); if (!m) return;
          const mid = node.splitText(m.index); mid.splitText(m[0].length);
          const span = document.createElement('span'); span.style.backgroundColor = '#FFE14D'; span.textContent = mid.nodeValue; mid.replaceWith(span);
          left--; found++;
        });
      });
      it.html = d.innerHTML;
    });
    if (!found) { p.items.forEach((it, i) => { it.html = before[i]; }); return fail('None of those terms appear on this page.'); }
    P.render(false); N.dirty();
    const undo = () => { const q = N.find(p.id); if (!q) return; q.p.items.forEach((it, i) => { if (before[i] !== undefined) it.html = before[i]; }); if (N.page() === q.p) P.render(false); N.dirty(); };
    undo.note = 'Highlighted ' + found + ' key terms.';
    undo.actions = [{ label:'Test myself', run:() => { if (!N.recall && window.ST) window.ST.toggleRecall(); } }];
    return undo;
  };
  // What the learner has done with the flashcards in this notebook, so the AI can aim at the weak spots.
  const studyStatus = () => {
    if (!window.ST) return '';
    let cards; try { P.syncAll(); cards = window.ST.cardsFrom(N.nb.sections.flatMap(sc => sc.pages)); } catch { return ''; }
    const qs = window.QZ ? window.QZ.stats() : null, weakQ = window.QZ ? window.QZ.weakTopics() : [];
    if (!cards.length && !(qs && qs.attempts)) return '';
    let out = '\n\n# Study status (this whole notebook)';
    if (cards.length) {
      const prog = (N.nb.study && N.nb.study.cards) || {}, now = Date.now();
      const due = cards.filter(c => !prog[c.id] || prog[c.id].due <= now).length, strong = cards.filter(c => prog[c.id] && prog[c.id].box >= 4).length;
      const weak = cards.filter(c => prog[c.id] && prog[c.id].seen > 0 && prog[c.id].box <= 1).slice(0, 12).map(c => c.front);
      out += `\n- Flashcards: ${cards.length} cards, ${due} due now, ${strong} well learned` + (weak.length ? `\n- Still learning: ${weak.join('; ')}` : '');
    }
    if (qs && qs.attempts) out += `\n- Quizzes taken: ${qs.attempts}, recent scores: ${qs.recent.map(h => Math.round(h.correct / h.total * 100) + '%').join(', ')}` + (weakQ.length ? `\n- Questions still getting wrong: ${weakQ.join('; ')}` : '');
    return out;
  };

  // Multiple choice questions written by the AI (JSON): kept in the notebook's quiz bank and mixed into quizzes.
  const newMcq = text => {
    OIAI.lastError = '';
    let j;
    try {
      const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const a = Math.min(...['[', '{'].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; })), z = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
      j = JSON.parse(t.slice(a, z + 1));
    } catch { return fail('The questions were not valid JSON.'); }
    const list = Array.isArray(j) ? j : Array.isArray(j.questions) ? j.questions : [];
    const p = N.page(), added = window.QZ ? window.QZ.addBank(list, p && p.id) : [];
    if (!added.length) return fail('No usable questions were found.');
    const undo = () => window.QZ.removeBank(added.map(x => x.id));
    undo.note = 'Added ' + added.length + ' questions to your quiz (' + added.filter(x => x.type === 'self').length + ' written answer).';
    undo.actions = [{ label:'Take the quiz', run:() => window.QZ.open({ scope:'notebook', mode:'practice', count:Math.min(20, added.length), ids:added.map(x => x.id) }) }];
    return undo;
  };

  // a whole textbook: one new section per chapter. The blank starter page goes away once real pages are in it.
  const newSection = name => {
    P.syncAll(); const was = { s:N.nb.cur.s, p:N.nb.cur.p };
    const sec = N.newSection(plain(name).slice(0, 60) || 'Chapter', N.SECTION_COLORS[N.nb.sections.length % N.SECTION_COLORS.length]), starter = sec.pages[0];
    N.nb.sections.push(sec); N.go(N.nb.sections.length - 1, 0);
    return {
      id: sec.id,
      finish: () => { const i = N.nb.sections.findIndex(x => x.id === sec.id); if (i < 0) return; if (sec.pages.length > 1 && sec.pages[0] === starter) { P.syncAll(); sec.pages.shift(); N.nb.cur = { s:i, p:0 }; N.go(i, 0); } N.dirty(); },
      // the current position is set by hand before the section goes, because N.go() reads the page it is leaving
      undo: () => { const i = N.nb.sections.findIndex(x => x.id === sec.id); if (i < 0 || N.nb.sections.length < 2) return; P.syncAll(); const j = i > 0 ? i - 1 : 1; N.nb.cur = { s:j, p:0 }; N.nb.sections.splice(i, 1); N.go(j > i ? j - 1 : j, 0); N.dirty(); },
    };
  };
  const OIAI = window.OIAI = {
    lastError: '',
    // what the panel shows the AI when nothing is selected
    context(o) {
      const p = N.page(); if (!p) return null;
      // the panel only wants to know whether there is anything on the page (it asks on every selection change), so skip the conversion
      if (o && o.peek) return { kind:p.kind === 'map' ? 'map' : 'page', title:p.title, text:p.kind === 'map' ? (p.map && p.map.nodes.length ? 'x' : '') : (p.items.some(i => String(i.html).replace(/<[^>]*>/g, '').trim()) ? 'x' : '') };
      const study = o && o.send ? studyStatus() : ''; // the flashcard tally is only worked out when a question is actually sent
      if (p.kind === 'map') return { kind:'map', title:p.title, text:outlineText(p) + study };
      return { kind:'page', title:p.title, text:`# ${p.title || 'Untitled page'}\n` + pageMarkdown(p) + study, md:true };
    },
    newMap, setMap, newNotes, newSection, setNotes, addNotes, canEditNotes, newCards, newQuiz, newMcq, highlight,
  };
}
})();
