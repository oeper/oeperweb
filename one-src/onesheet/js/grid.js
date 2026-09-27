/* oneSheet — workbook model, canvas grid renderer, selection, editing, clipboard, fill, resize, sheet tabs */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
const host = $('#gridhost'), cv = $('#grid'), g2 = cv.getContext('2d'), scroller = $('#gscroll'), sizer = $('#gsizer'), overlay = $('#goverlay');
const ed = $('#cellEditor'), fx = $('#fx'), nameBox = $('#nameBox'), kb = $('#kb');
X.DEF_W = 88; X.DEF_H = 22; const HW = 46, HH = 24;
X.hooks = []; X.zoom = 1; X.showFormulas = false; X.showHead = true;

/* ---------- model ---------- */
X.newSheet = name => ({ id:ONE.uid(), name, cells:{}, colW:{}, rowH:{}, colS:{}, rowS:{}, merges:[], hidR:{}, hidC:{}, freeze:{ r:0, c:0 }, cf:[], filter:null, charts:[], notes:{}, valid:{}, tables:[], spark:{}, tab:'', grid:true, protect:false });
X.newBook = (title = 'Book1') => ({ id:ONE.uid(), title, sheets:[X.newSheet('Sheet1')], active:0, names:{}, updated:Date.now(), print:{ orient:'portrait', size:'letter', area:null, grid:false } });
X.wb = X.newBook();
Object.defineProperty(X, 'sh', { get:() => X.wb.sheets[X.wb.active] });
X.sel = { r1:0, c1:0, r2:0, c2:0, ar:0, ac:0 };
X.cell = (sh, r, c) => sh.cells[r + ',' + c];
X.raw = (sh, r, c) => { const k = sh.cells[r + ',' + c]; return k && k.v != null ? String(k.v) : ''; };
X.nRows = sh => Math.max(1000, X.usedRows(sh) + 200);
X.nCols = sh => Math.min(16384, Math.max(40, X.usedCols(sh) + 12));
const filterHidden = (sh, r) => !!(sh.filter && sh.filter.hidden && sh.filter.hidden[r]);
X.colW = (sh, c) => sh.hidC[c] ? 0 : (sh.colW[c] ?? X.DEF_W);
X.rowH = (sh, r) => (sh.hidR[r] || filterHidden(sh, r)) ? 0 : (sh.rowH[r] ?? X.DEF_H);
let cx = [0], ry = [0], NR = 1000, NC = 40, mergeMap = new Map();
X.layout = () => {
  const sh = X.sh; NR = X.nRows(sh); NC = X.nCols(sh);
  cx = new Array(NC + 1); cx[0] = 0; for (let c = 0; c < NC; c++) cx[c + 1] = cx[c] + X.colW(sh, c);
  ry = new Array(NR + 1); ry[0] = 0; for (let r = 0; r < NR; r++) ry[r + 1] = ry[r] + X.rowH(sh, r);
  mergeMap = new Map(); sh.merges.forEach(m => { for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) mergeMap.set(r + ',' + c, m); });
  sizer.style.width = (HW + cx[NC]) * X.zoom + 'px'; sizer.style.height = (HH + ry[NR]) * X.zoom + 'px';
  X.NR = NR; X.NC = NC;
};
X.mergeAt = (r, c) => mergeMap.get(r + ',' + c);
const bs = (a, x) => { let lo = 0, hi = a.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= x) lo = m; else hi = m - 1; } return lo; };
X.cx = c => cx[Math.min(c, NC)]; X.ry = r => ry[Math.min(r, NR)];

/* style resolution: sheet default < column < row < cell */
X.styleOf = (sh, r, c) => { const cs = sh.cells[r + ',' + c]; const a = sh.colS[c], b = sh.rowS[r]; if (!a && !b) return (cs && cs.s) || {}; return Object.assign({}, a, b, cs && cs.s); };
X.value = (r, c, sh = X.sh) => X.valueAt(X.wb, sh, r, c);
X.displayOf = (sh, r, c) => {
  const cell = sh.cells[r + ',' + c]; if (!cell || cell.v == null || cell.v === '') return '';
  if (X.showFormulas && String(cell.v)[0] === '=') return String(cell.v);
  const s = X.styleOf(sh, r, c); return X.format(X.valueAt(X.wb, sh, r, c), s.fmt);
};

/* ---------- view geometry ---------- */
const view = () => {
  const z = X.zoom, sh = X.sh, fc = Math.min(sh.freeze.c, NC), fr = Math.min(sh.freeze.r, NR);
  return { z, sx:scroller.scrollLeft / z, sy:scroller.scrollTop / z, vw:scroller.clientWidth / z, vh:scroller.clientHeight / z, fc, fr, FW:cx[fc], FH:ry[fr], hw:X.showHead ? HW : 0, hh:X.showHead ? HH : 0 };
};
X.view = view;
const colX = (V, c) => V.hw + cx[c] - (c < V.fc ? 0 : V.sx);
const rowY = (V, r) => V.hh + ry[r] - (r < V.fr ? 0 : V.sy);
X.cellRect = (r, c, V = view()) => { const m = X.mergeAt(r, c); const r2 = m ? m.r2 : r, c2 = m ? m.c2 : c, R = m ? m.r1 : r, C = m ? m.c1 : c; const x = colX(V, C), y = rowY(V, R); return { x, y, w:cx[c2 + 1] - cx[C], h:ry[r2 + 1] - ry[R] }; };
X.hit = (px, py) => {
  const V = view(), x = px / V.z, y = py / V.z;
  const inCH = y < V.hh, inRH = x < V.hw;
  const xl = x - V.hw, yl = y - V.hh;
  const c = xl < V.FW ? bs(cx, Math.max(0, xl)) : bs(cx, xl + V.sx);
  const r = yl < V.FH ? bs(ry, Math.max(0, yl)) : bs(ry, yl + V.sy);
  return { r:Math.min(r, NR - 1), c:Math.min(c, NC - 1), inCH, inRH, x, y, V };
};

/* ---------- theme ---------- */
let T = {};
const probe = document.createElement('i'); probe.style.display = 'none'; host.append(probe);
const readTheme = () => { const g = k => { probe.style.color = `var(${k})`; return getComputedStyle(probe).color; }; T = { bg:g('--g-bg'), line:g('--g-line'), head:g('--g-head'), headText:g('--g-head-text'), sel:g('--g-sel'), text:g('--g-text'), frozen:g('--g-frozen') }; };
X.readTheme = readTheme;
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readTheme(); X.draw(); });
new MutationObserver(() => { readTheme(); X.draw(); }).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme','style'] });

/* ---------- conditional formatting ---------- */
const cfCache = new Map();
X.cfStyle = (sh, r, c, v) => {
  let out = null;
  for (const rule of sh.cf) {
    const g = rule.g; if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) continue;
    const key = rule.id; let st = cfCache.get(key);
    if (!st) { const nums = []; for (let i = g.r1; i <= g.r2; i++) for (let j = g.c1; j <= g.c2; j++) { const x = X.valueAt(X.wb, sh, i, j); if (typeof x === 'number') nums.push(x); }
      const counts = new Map(); if (rule.type === 'dup') for (let i = g.r1; i <= g.r2; i++) for (let j = g.c1; j <= g.c2; j++) { const x = X.valueAt(X.wb, sh, i, j); if (x != null && x !== '') { const k2 = String(x).toLowerCase(); counts.set(k2, (counts.get(k2) || 0) + 1); } }
      const sorted = [...nums].sort((a, b) => b - a); st = { min:Math.min(...nums), max:Math.max(...nums), avg:nums.reduce((a, b) => a + b, 0) / (nums.length || 1), sorted, counts }; cfCache.set(key, st); }
    let hit = false;
    switch (rule.type) {
      case 'gt': hit = typeof v === 'number' && v > rule.a; break; case 'lt': hit = typeof v === 'number' && v < rule.a; break;
      case 'between': hit = typeof v === 'number' && v >= rule.a && v <= rule.b; break; case 'eq': hit = v != null && String(v).toLowerCase() === String(rule.a).toLowerCase(); break;
      case 'text': hit = typeof v === 'string' && v.toLowerCase().includes(String(rule.a).toLowerCase()); break;
      case 'dup': hit = v != null && v !== '' && st.counts.get(String(v).toLowerCase()) > 1; break;
      case 'top': hit = typeof v === 'number' && v >= (st.sorted[Math.min(rule.a, st.sorted.length) - 1] ?? Infinity); break;
      case 'bottom': hit = typeof v === 'number' && v <= ([...st.sorted].reverse()[Math.min(rule.a, st.sorted.length) - 1] ?? -Infinity); break;
      case 'above': hit = typeof v === 'number' && v > st.avg; break; case 'below': hit = typeof v === 'number' && v < st.avg; break;
      case 'bar': if (typeof v === 'number') { out = Object.assign(out || {}, { bar:{ f:st.max === st.min ? 1 : (v - Math.min(0, st.min)) / (st.max - Math.min(0, st.min)), color:rule.color } }); } break;
      case 'scale': if (typeof v === 'number') { const t = st.max === st.min ? .5 : (v - st.min) / (st.max - st.min); out = Object.assign(out || {}, { fill:scaleColor(rule.colors, t) }); } break;
      case 'icons': if (typeof v === 'number') { const t = st.max === st.min ? 1 : (v - st.min) / (st.max - st.min); out = Object.assign(out || {}, { icon:t >= .67 ? 2 : t >= .33 ? 1 : 0 }); } break;
    }
    if (hit) out = Object.assign(out || {}, rule.style);
  }
  return out;
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const scaleColor = (cs, t) => { const [a, b, c] = cs.map(hex); const [p, q, u] = t < .5 ? [a, b, t * 2] : [b, c, (t - .5) * 2]; return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * u)).join(',')})`; };
X.clearCF = () => cfCache.clear();

/* ---------- rendering ---------- */
let drawQueued = false;
X.draw = () => { if (drawQueued) return; drawQueued = true; requestAnimationFrame(() => { drawQueued = false; render(); }); setTimeout(() => { if (drawQueued) { drawQueued = false; render(); } }, 60); };
X.drawNow = () => { drawQueued = false; render(); };
const fontOf = s => `${s.italic ? 'italic ' : ''}${s.bold ? '700 ' : '400 '}${s.size || 11}pt ${s.font || 'Calibri, Carlito, "Segoe UI", sans-serif'}`;
X.fontOf = fontOf;
function resize(){
  const dpr = devicePixelRatio || 1, w = scroller.clientWidth, h = scroller.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  return dpr;
}
function render(){
  if (!T.bg) readTheme();
  const dpr = resize(), V = view(), sh = X.sh, z = V.z;
  g2.setTransform(dpr * z, 0, 0, dpr * z, 0, 0);
  g2.fillStyle = T.bg; g2.fillRect(0, 0, V.vw, V.vh);
  const c0 = V.fc, c1 = Math.min(NC - 1, bs(cx, V.sx + V.vw)), cS = Math.max(V.fc, bs(cx, V.sx + V.FW));
  const r1 = Math.min(NR - 1, bs(ry, V.sy + V.vh)), rS = Math.max(V.fr, bs(ry, V.sy + V.FH));
  const rowsF = range(0, V.fr - 1), colsF = range(0, V.fc - 1), rowsS = range(rS, r1), colsS = range(cS, c1);
  const clip = (x, y, w, h, f) => { g2.save(); g2.beginPath(); g2.rect(x, y, w, h); g2.clip(); f(); g2.restore(); };
  const W = V.vw, Hh = V.vh;
  clip(V.hw + V.FW, V.hh + V.FH, W, Hh, () => region(sh, V, rowsS, colsS));
  if (V.fr) clip(V.hw + V.FW, V.hh, W, V.FH, () => region(sh, V, rowsF, colsS));
  if (V.fc) clip(V.hw, V.hh + V.FH, V.FW, Hh, () => region(sh, V, rowsS, colsF));
  if (V.fr && V.fc) clip(V.hw, V.hh, V.FW, V.FH, () => region(sh, V, rowsF, colsF));
  clip(V.hw, V.hh, W, Hh, () => overlays(sh, V));
  if (V.fr) { g2.fillStyle = T.frozen; g2.fillRect(V.hw, V.hh + V.FH - 1, W, 1.5); }
  if (V.fc) { g2.fillStyle = T.frozen; g2.fillRect(V.hw + V.FW - 1, V.hh, 1.5, Hh); }
  if (X.showHead) headers(sh, V, [...colsF, ...colsS], [...rowsF, ...rowsS]);
  X.hooks.forEach(f => f(V));
}
const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
function region(sh, V, rows, cols){
  const tbl = sh.tables;
  // fills + grid
  for (const r of rows) { const h = ry[r + 1] - ry[r]; if (!h) continue; const y = rowY(V, r);
    for (const c of cols) { const w = cx[c + 1] - cx[c]; if (!w) continue; const x = colX(V, c);
      const m = X.mergeAt(r, c); if (m && (m.r1 !== r || m.c1 !== c)) { if (!rows.includes(m.r1) || !cols.includes(m.c1)) { if (r === rows[0] && c === cols[0] || (r === rows[0] && c === Math.max(cols[0], m.c1)) || (c === cols[0] && r === Math.max(rows[0], m.r1))) drawCell(sh, V, m.r1, m.c1); } continue; }
      drawCell(sh, V, r, c, tbl);
    }
  }
  if (sh.grid) { g2.strokeStyle = T.line; g2.lineWidth = 1 / V.z; g2.beginPath();
    for (const r of rows) { const h = ry[r + 1] - ry[r]; if (!h) continue; const y = rowY(V, r) + h;
      for (const c of cols) { const w = cx[c + 1] - cx[c]; if (!w) continue; const m = X.mergeAt(r, c); const x = colX(V, c);
        if (!m || r === m.r2) { g2.moveTo(x, y - .5 / V.z); g2.lineTo(x + w, y - .5 / V.z); }
        if (!m || c === m.c2) { g2.moveTo(x + w - .5 / V.z, y - h); g2.lineTo(x + w - .5 / V.z, y); } } }
    g2.stroke(); }
  // borders
  for (const r of rows) for (const c of cols) { const s = X.styleOf(sh, r, c); if (!s.border) continue; const R = X.cellRect(r, c, V); drawBorder(R, s.border); }
}
function tableStyle(sh, r, c){
  for (const t of sh.tables) { if (r < t.r1 || r > t.r2 || c < t.c1 || c > t.c2) continue; const P = TABLE_STYLES[t.style] || TABLE_STYLES.blue;
    if (r === t.r1 && t.header !== false) return { fill:P.h, color:P.ht, bold:true }; if (t.total && r === t.r2) return { bold:true, fill:P.b1, top:P.h };
    return { fill:(r - t.r1) % 2 ? P.b1 : P.b2 }; }
  return null;
}
const TABLE_STYLES = X.TABLE_STYLES = { blue:{ h:'#4472C4', ht:'#fff', b1:'#D9E1F2', b2:'#fff' }, orange:{ h:'#ED7D31', ht:'#fff', b1:'#FCE4D6', b2:'#fff' }, green:{ h:'#70AD47', ht:'#fff', b1:'#E2EFDA', b2:'#fff' }, gray:{ h:'#595959', ht:'#fff', b1:'#EDEDED', b2:'#fff' }, gold:{ h:'#FFC000', ht:'#000', b1:'#FFF2CC', b2:'#fff' }, teal:{ h:'#1F7A7A', ht:'#fff', b1:'#D6ECEC', b2:'#fff' }, plain:{ h:'#fff', ht:'#000', b1:'#F2F2F2', b2:'#fff' } };
const ICONS = ['#E74C3C', '#F1C40F', '#27AE60'];
function drawCell(sh, V, r, c){
  const s0 = X.styleOf(sh, r, c), cell = sh.cells[r + ',' + c], has = cell && cell.v != null && cell.v !== '';
  const ts = sh.tables.length ? tableStyle(sh, r, c) : null;
  const v = has ? X.valueAt(X.wb, sh, r, c) : null;
  const cf = sh.cf.length && has ? X.cfStyle(sh, r, c, v) : null;
  const s = ts || cf ? Object.assign({}, ts, s0.fill ? { fill:s0.fill } : null, s0, cf && cf.fill ? { fill:cf.fill } : null, cf && cf.color ? { color:cf.color } : null, cf && cf.bold ? { bold:true } : null) : s0;
  const R = X.cellRect(r, c, V);
  if (s.fill) { g2.fillStyle = s.fill; g2.fillRect(R.x, R.y, R.w, R.h); }
  if (cf && cf.bar) { const bw = Math.max(0, (R.w - 6) * ONE.clamp(cf.bar.f, 0, 1)); const gr = g2.createLinearGradient(R.x + 3, 0, R.x + 3 + bw, 0); gr.addColorStop(0, cf.bar.color || '#638EC6'); gr.addColorStop(1, (cf.bar.color || '#638EC6') + '33'); g2.fillStyle = gr; g2.fillRect(R.x + 3, R.y + 3, bw, R.h - 6); }
  if (sh.spark && sh.spark[r + ',' + c] && X.drawSpark) X.drawSpark(g2, R, sh.spark[r + ',' + c], sh);
  if (s.checkbox) { const sz = 14, bx = R.x + (R.w - sz) / 2, by = R.y + (R.h - sz) / 2, on = v === true; g2.save(); g2.lineWidth = 1.6; g2.strokeStyle = on ? T.sel : T.headText; g2.fillStyle = on ? T.sel : 'transparent'; roundRect(bx, by, sz, sz, 3); if (on) g2.fill(); g2.stroke(); if (on) { g2.strokeStyle = T.bg; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(bx + 3.2, by + 7.2); g2.lineTo(bx + 6, by + 10); g2.lineTo(bx + 11, by + 4.2); g2.stroke(); } g2.restore(); return; }
  if (sh.notes[r + ',' + c]) { g2.fillStyle = '#D93025'; g2.beginPath(); g2.moveTo(R.x + R.w - 7, R.y); g2.lineTo(R.x + R.w, R.y); g2.lineTo(R.x + R.w, R.y + 7); g2.fill(); }
  if (!has) return;
  let text = X.showFormulas && String(cell.v)[0] === '=' ? String(cell.v) : X.format(v, s.fmt);
  const isNum = typeof v === 'number' && !X.showFormulas, isErrV = X.isErr(v);
  let align = s.align || (isNum ? 'right' : (typeof v === 'boolean' || isErrV) ? 'center' : 'left');
  g2.font = fontOf(s); g2.fillStyle = s.color || (isErrV ? '#C00000' : s.link ? '#0563C1' : s.fill ? (lightFill(s.fill) ? '#000' : '#fff') : T.text);
  const pad = 4 + (s.indent || 0) * 10;
  let iconW = 0;
  if (cf && cf.icon != null) { g2.save(); g2.fillStyle = ICONS[cf.icon]; g2.beginPath(); g2.arc(R.x + 10, R.y + R.h / 2, 5, 0, Math.PI * 2); g2.fill(); g2.restore(); iconW = 16; }
  const sizePx = (s.size || 11) * 4 / 3;
  let lines = [text];
  if (s.wrap) lines = wrapText(text, R.w - pad * 2);
  else if (isNum && g2.measureText(text).width > R.w - 4 && !X.showFormulas) { const n = Math.max(1, Math.floor((R.w - 4) / g2.measureText('#').width)); text = '#'.repeat(n); lines = [text]; }
  const lh = sizePx * 1.2, total = lines.length * lh;
  const va = s.valign || 'bottom';
  let y0 = va === 'top' ? R.y + 3 + sizePx * .9 : va === 'middle' ? R.y + (R.h - total) / 2 + sizePx * .92 : R.y + R.h - 4 - (total - lh) - sizePx * .12;
  let clipW = R.w, clipX = R.x;
  if (!s.wrap && !isNum && align === 'left') { const tw = g2.measureText(text).width + pad; let cc = (X.mergeAt(r, c) || { c2:c }).c2 + 1; while (tw > clipW && cc < NC && !(sh.cells[r + ',' + cc] && sh.cells[r + ',' + cc].v !== '' && sh.cells[r + ',' + cc].v != null) && !X.mergeAt(r, cc)) { clipW += cx[cc + 1] - cx[cc]; cc++; } }
  if (!s.wrap && !isNum && align === 'right') { const tw = g2.measureText(text).width + pad; let cc = c - 1; while (tw > clipW && cc >= 0 && !(sh.cells[r + ',' + cc] && sh.cells[r + ',' + cc].v)) { const w = cx[cc + 1] - cx[cc]; clipW += w; clipX -= w; cc--; } }
  g2.save(); g2.beginPath(); g2.rect(clipX + 1, R.y, clipW - 2, R.h); g2.clip();
  g2.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => {
    const tw = g2.measureText(ln).width; let x = align === 'right' ? R.x + R.w - pad - tw : align === 'center' ? R.x + (R.w - tw) / 2 : R.x + pad + iconW;
    const y = y0 + i * lh; g2.fillText(ln, x, y);
    if (s.underline || s.link) { g2.fillRect(x, y + 2, tw, Math.max(1, sizePx / 14)); }
    if (s.strike) { g2.fillRect(x, y - sizePx * .3, tw, Math.max(1, sizePx / 14)); }
  });
  g2.restore();
}
const lumCache = new Map();
function lightFill(c){ if (lumCache.has(c)) return lumCache.get(c); let r, g, b; const m = /^#([0-9a-f]{6})$/i.exec(c); if (m) { const n = parseInt(m[1], 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; } else { const k = String(c).match(/[\d.]+/g) || [255, 255, 255]; [r, g, b] = k.map(Number); } const v = (.299 * r + .587 * g + .114 * b) / 255 > .55; lumCache.set(c, v); return v; }
function wrapText(t, w){
  const out = []; String(t).split('\n').forEach(par => { const words = par.split(/(\s+)/); let line = '';
    for (const wd of words) { const test = line + wd; if (g2.measureText(test).width > w && line.trim()) { out.push(line.trimEnd()); line = wd.trimStart(); } else line = test; }
    out.push(line); }); return out;
}
X.wrapLines = (t, w, s) => { g2.font = fontOf(s); return wrapText(t, w).length; };
function drawBorder(R, b){
  const L = (x1, y1, x2, y2, st) => { if (!st) return; g2.strokeStyle = b.color || '#000'; g2.lineWidth = st === 'thick' ? 3 : st === 'medium' ? 2 : 1; g2.setLineDash(st === 'dashed' ? [4, 2] : st === 'dotted' ? [1, 2] : []); g2.beginPath(); g2.moveTo(x1, y1); g2.lineTo(x2, y2); g2.stroke();
    if (st === 'double') { g2.beginPath(); const dx = y1 === y2 ? 0 : 2.5, dy = y1 === y2 ? 2.5 : 0; g2.moveTo(x1 + dx, y1 + dy); g2.lineTo(x2 + dx, y2 + dy); g2.stroke(); } };
  g2.save(); L(R.x, R.y + .5, R.x + R.w, R.y + .5, b.t); L(R.x, R.y + R.h - .5, R.x + R.w, R.y + R.h - .5, b.b); L(R.x + .5, R.y, R.x + .5, R.y + R.h, b.l); L(R.x + R.w - .5, R.y, R.x + R.w - .5, R.y + R.h, b.r); g2.restore();
}
function rangeRect(V, g){
  const a = X.cellRect(g.r1, g.c1, V), m = X.mergeAt(g.r2, g.c2), rr = m ? m.r1 : g.r2, cc = m ? m.c1 : g.c2, b = X.cellRect(rr, cc, V);
  return { x:a.x, y:a.y, w:b.x + b.w - a.x, h:b.y + b.h - a.y };
}
X.rangeRect = rangeRect;
function overlays(sh, V){
  const S = X.sel, g = X.normSel();
  // formula reference colours while editing
  if (X.editing && ed.value[0] === '=') {
    const COLORS = ['#4472C4','#C0504D','#9BBB59','#8064A2','#F79646','#4BACC6']; let i = 0;
    X.tokenize(ed.value.slice(1)).forEach(t => { if (t.t !== 'ref') return; const ref = X.parseRef(t.v); if (ref.sheet && ref.sheet.toLowerCase() !== sh.name.toLowerCase()) return; const a = ref.a, b = ref.b || ref.a; if (a.r == null || a.c == null) return;
      const R = rangeRect(V, { r1:Math.min(a.r, b.r), c1:Math.min(a.c, b.c), r2:Math.max(a.r, b.r), c2:Math.max(a.c, b.c) }); const col = COLORS[i++ % COLORS.length];
      g2.fillStyle = col + '1f'; g2.fillRect(R.x, R.y, R.w, R.h); g2.strokeStyle = col; g2.lineWidth = 2; g2.setLineDash([]); g2.strokeRect(R.x + 1, R.y + 1, R.w - 2, R.h - 2); });
  }
  if (X.traces && X.traces.length && X.drawTraces) X.drawTraces(g2, V);
  if (X.drawSmart) X.drawSmart(g2, V);
  // selection
  const R = rangeRect(V, g), A = X.cellRect(S.ar, S.ac, V);
  g2.fillStyle = T.sel; g2.globalAlpha = .12; g2.beginPath(); g2.rect(R.x, R.y, R.w, R.h); g2.rect(A.x, A.y, A.w, A.h); g2.fill('evenodd'); g2.globalAlpha = 1;
  g2.strokeStyle = T.sel; g2.lineWidth = 2; g2.setLineDash([]); g2.strokeRect(R.x + .5, R.y + .5, R.w - 1, R.h - 1);
  if (g.r1 !== g.r2 || g.c1 !== g.c2) { g2.lineWidth = 1; g2.strokeRect(A.x + 1.5, A.y + 1.5, A.w - 3, A.h - 3); }
  if (!X.editing) { g2.fillStyle = T.sel; g2.fillRect(R.x + R.w - 4, R.y + R.h - 4, 7, 7); g2.fillStyle = T.bg; g2.fillRect(R.x + R.w - 5, R.y + R.h - 5, 1, 9); g2.fillRect(R.x + R.w - 5, R.y + R.h - 5, 9, 1); }
  // copy marquee
  if (X.clip && X.clip.sheetId === sh.id && X.clip.live) { const C = rangeRect(V, X.clip.g); g2.strokeStyle = T.sel; g2.lineWidth = 1.5; g2.setLineDash([5, 4]); g2.lineDashOffset = -(Date.now() / 60 % 9); g2.strokeRect(C.x + 1, C.y + 1, C.w - 2, C.h - 2); g2.setLineDash([]); X.draw(); }
  // fill preview
  if (X.fillPreview) { const P = rangeRect(V, X.fillPreview); g2.strokeStyle = T.sel; g2.lineWidth = 1.5; g2.setLineDash([4, 3]); g2.strokeRect(P.x + 1, P.y + 1, P.w - 2, P.h - 2); g2.setLineDash([]); }
  // filter buttons
  if (sh.filter) { const f = sh.filter; for (let c = f.c1; c <= f.c2; c++) { const Rc = X.cellRect(f.r, c, V); const on = f.crit && f.crit[c]; const bx = Rc.x + Rc.w - 19, by = Rc.y + (Rc.h - 16) / 2;
    g2.fillStyle = on ? T.sel : T.head; g2.strokeStyle = T.line; g2.lineWidth = 1; roundRect(bx, by, 16, 16, 4); g2.fill(); g2.stroke();
    g2.fillStyle = on ? T.bg : T.headText; g2.beginPath(); if (on) { g2.moveTo(bx + 4, by + 5); g2.lineTo(bx + 12, by + 5); g2.lineTo(bx + 9, by + 9); g2.lineTo(bx + 9, by + 12); g2.lineTo(bx + 7, by + 12); g2.lineTo(bx + 7, by + 9); } else { g2.moveTo(bx + 4.5, by + 6.5); g2.lineTo(bx + 11.5, by + 6.5); g2.lineTo(bx + 8, by + 10.5); } g2.fill(); } }
  // validation dropdown arrow for the active cell
  if (sh.valid[S.ar + ',' + S.ac] && !X.editing) { const bx = A.x + A.w + 2, by = A.y + (A.h - 18) / 2; g2.fillStyle = T.head; g2.strokeStyle = T.line; roundRect(bx, by, 18, 18, 4); g2.fill(); g2.stroke(); g2.fillStyle = T.headText; g2.beginPath(); g2.moveTo(bx + 5, by + 7); g2.lineTo(bx + 13, by + 7); g2.lineTo(bx + 9, by + 11.5); g2.fill(); }
}
function roundRect(x, y, w, h, r){ g2.beginPath(); g2.moveTo(x + r, y); g2.arcTo(x + w, y, x + w, y + h, r); g2.arcTo(x + w, y + h, x, y + h, r); g2.arcTo(x, y + h, x, y, r); g2.arcTo(x, y, x + w, y, r); g2.closePath(); }
function headers(sh, V, cols, rows){
  const g = X.normSel();
  g2.font = '500 11px "Roboto Flex", "Segoe UI", system-ui, sans-serif'; g2.textBaseline = 'middle'; g2.textAlign = 'center';
  g2.fillStyle = T.head; g2.fillRect(0, 0, V.vw, V.hh); g2.fillRect(0, 0, V.hw, V.vh);
  const full = X.isFullCols(g), fullR = X.isFullRows(g);
  for (const c of cols) { const w = cx[c + 1] - cx[c]; if (!w) continue; const x = colX(V, c); if (x + w < V.hw || (c >= V.fc && x < V.hw + V.FW - .5)) continue;
    const on = c >= g.c1 && c <= g.c2; if (on) { g2.fillStyle = T.sel; g2.globalAlpha = full ? 1 : .16; g2.fillRect(x, 0, w, V.hh); g2.globalAlpha = 1; }
    g2.fillStyle = on ? (full ? T.bg : T.sel) : T.headText; g2.fillText(X.colName(c), x + w / 2, V.hh / 2 + .5);
    g2.fillStyle = T.line; g2.fillRect(x + w - 1, 4, 1, V.hh - 8); if (on && !full) { g2.fillStyle = T.sel; g2.fillRect(x, V.hh - 2, w, 2); } }
  for (const r of rows) { const h = ry[r + 1] - ry[r]; if (!h) continue; const y = rowY(V, r); if (y + h < V.hh || (r >= V.fr && y < V.hh + V.FH - .5)) continue;
    const on = r >= g.r1 && r <= g.r2; if (on) { g2.fillStyle = T.sel; g2.globalAlpha = fullR ? 1 : .16; g2.fillRect(0, y, V.hw, h); g2.globalAlpha = 1; }
    g2.fillStyle = on ? (fullR ? T.bg : T.sel) : T.headText; g2.fillText(String(r + 1), V.hw / 2, y + h / 2 + .5);
    g2.fillStyle = T.line; g2.fillRect(6, y + h - 1, V.hw - 12, 1); if (on && !fullR) { g2.fillStyle = T.sel; g2.fillRect(V.hw - 2, y, 2, h); } }
  g2.fillStyle = T.head; g2.fillRect(0, 0, V.hw, V.hh); g2.fillStyle = T.headText; g2.beginPath(); g2.moveTo(V.hw - 5, 6); g2.lineTo(V.hw - 5, V.hh - 5); g2.lineTo(V.hw - 14, V.hh - 5); g2.fill();
  g2.textAlign = 'start';
}

/* ---------- selection helpers ---------- */
X.normSel = (s = X.sel) => { let g = { r1:Math.min(s.r1, s.r2), c1:Math.min(s.c1, s.c2), r2:Math.max(s.r1, s.r2), c2:Math.max(s.c1, s.c2) };
  for (let k = 0; k < 4; k++) X.sh.merges.forEach(m => { if (m.r2 >= g.r1 && m.r1 <= g.r2 && m.c2 >= g.c1 && m.c1 <= g.c2) g = { r1:Math.min(g.r1, m.r1), c1:Math.min(g.c1, m.c1), r2:Math.max(g.r2, m.r2), c2:Math.max(g.c2, m.c2) }; });
  return g; };
X.isFullCols = g => g.r1 === 0 && g.r2 >= NR - 1; X.isFullRows = g => g.c1 === 0 && g.c2 >= NC - 1;
X.select = (r1, c1, r2 = r1, c2 = c1, ar = r1, ac = c1, keepScroll) => {
  X.sel = { r1, c1, r2, c2, ar, ac }; if (!keepScroll) X.scrollTo(ar, ac); X.afterSelect();
};
X.afterSelect = () => { X.draw(); X.updateBars(); X.updateStatus(); ONE.ribbon && ONE.ribbon.refresh && ONE.ribbon.refresh(); X.hooks2.forEach(f => f()); };
X.hooks2 = [];
X.scrollTo = (r, c) => {
  const V = view(); if (r >= V.fr) { const top = ry[r], bot = ry[r + 1]; const vis0 = V.sy + V.FH, vis1 = V.sy + V.vh - V.hh; if (top < vis0) scroller.scrollTop = (top - V.FH) * V.z; else if (bot > vis1) scroller.scrollTop = (bot - V.vh + V.hh + 2) * V.z; }
  if (c >= V.fc) { const l = cx[c], rr = cx[c + 1]; const vis0 = V.sx + V.FW, vis1 = V.sx + V.vw - V.hw; if (l < vis0) scroller.scrollLeft = (l - V.FW) * V.z; else if (rr > vis1) scroller.scrollLeft = (rr - V.vw + V.hw + 2) * V.z; }
};
X.forSel = (fn, g = X.normSel()) => { const sh = X.sh; const R2 = X.isFullCols(g) ? Math.max(g.r1, X.usedRows(sh) - 1) : g.r2, C2 = X.isFullRows(g) ? Math.max(g.c1, X.usedCols(sh) - 1) : g.c2; for (let r = g.r1; r <= R2; r++) for (let c = g.c1; c <= C2; c++) fn(r, c); };

/* ---------- undo / change pipeline ---------- */
const U = X.undoStack = { list:[], i:-1 };
const snap = () => JSON.stringify({ sheets:X.wb.sheets, active:X.wb.active, names:X.wb.names }, (k, v) => k === '_vals' ? undefined : v);
X.resetUndo = () => { U.list = [snap()]; U.i = 0; };
X.record = () => { const s = snap(); if (U.list[U.i] === s) return; U.list.splice(U.i + 1); U.list.push(s); if (U.list.length > 120) U.list.shift(); U.i = U.list.length - 1; };
X.undo = () => go(-1); X.redo = () => go(1);
function go(d){ if (X.editing) X.cancelEdit(); const j = U.i + d; if (j < 0 || j >= U.list.length) return ONE.toast(d < 0 ? 'Nothing to undo.' : 'Nothing to redo.'); U.i = j; const s = JSON.parse(U.list[j]); X.wb.sheets = s.sheets; X.wb.active = Math.min(s.active, s.sheets.length - 1); X.wb.names = s.names || {}; X.changed(false); X.renderTabs(); }
X.changed = (rec = true) => {
  X.invalidate(X.wb); X.clearCF(); X.layout();
  if (rec) X.record();
  X.draw(); X.updateBars(); X.updateStatus(); X.dirty(); X.hooks2.forEach(f => f());
};
X.mutate = fn => { if (X.sh.protect) { ONE.toast('This sheet is protected. Turn off Review › Protect Sheet to make changes.'); return false; } fn(); X.changed(); return true; };

/* ---------- cell writes ---------- */
X.setRaw = (sh, r, c, raw, keepStyle = true) => {
  const k = r + ',' + c, cell = sh.cells[k];
  if ((raw == null || raw === '') && (!cell || !cell.s || !Object.keys(cell.s).length)) { delete sh.cells[k]; return; }
  const n = cell ? cell : (sh.cells[k] = {}); n.v = raw == null ? '' : String(raw); if (!keepStyle) delete n.s;
};
X.setStyle = (sh, r, c, patch) => { const k = r + ',' + c, n = sh.cells[k] || (sh.cells[k] = { v:'' }); n.s = Object.assign({}, n.s, patch); Object.keys(n.s).forEach(p => { if (n.s[p] == null || n.s[p] === false) delete n.s[p]; }); if (!Object.keys(n.s).length) delete n.s; if (!n.s && (n.v == null || n.v === '')) delete sh.cells[k]; };
X.commitValue = (r, c, raw) => {
  const sh = X.sh, vk = sh.valid[r + ',' + c];
  if (vk && raw !== '' && raw[0] !== '=') { const ok = X.validate(vk, raw); if (!ok) { ONE.modal({ title:'That value isn’t allowed', icon:'block', body:vk.msg || `This cell only accepts ${vk.type === 'list' ? 'one of: ' + X.listValues(vk).join(', ') : vk.type === 'whole' ? `whole numbers between ${vk.a} and ${vk.b}` : `numbers between ${vk.a} and ${vk.b}`}.` }); return false; } }
  return X.mutate(() => {
    X.setRaw(sh, r, c, raw);
    const p = raw && raw[0] !== '=' ? X.parseInput(raw) : null; const st = X.styleOf(sh, r, c);
    if (p && p.hint && (!st.fmt || st.fmt.type === 'general')) X.setStyle(sh, r, c, { fmt:p.hint });
    if (raw && raw[0] === '=' && (!st.fmt || st.fmt.type === 'general')) { const m = /^=\s*(TODAY|NOW|DATE|EDATE|EOMONTH)\(/i.exec(raw); if (m) X.setStyle(sh, r, c, { fmt:{ type:m[1].toUpperCase() === 'NOW' ? 'datetime' : 'date', pattern:'short' } }); if (/^=\s*PMT\(/i.test(raw)) X.setStyle(sh, r, c, { fmt:{ type:'currency', sym:'$', dec:2, neg:'paren' } }); }
    if (st.wrap || String(raw).includes('\n')) X.autofitRow(r);
  });
};

/* ---------- editing ---------- */
X.editing = null;
const positionEditor = () => {
  if (!X.editing) return; const V = view(), R = X.cellRect(X.editing.r, X.editing.c, V), s = X.styleOf(X.sh, X.editing.r, X.editing.c), z = V.z;
  Object.assign(ed.style, { left:R.x * z + 'px', top:R.y * z + 'px', minWidth:R.w * z + 'px', height:'auto', minHeight:R.h * z + 'px', font:fontOf(s), fontSize:(s.size || 11) * z + 'pt', color:s.color || '', background:s.fill || '', textAlign:s.align || 'left' });
  ed.style.width = 'auto'; ed.style.width = Math.min(Math.max(R.w * z, ed.scrollWidth + 8), scroller.clientWidth - R.x * z - 4) + 'px';
  ed.style.height = 'auto'; ed.style.height = Math.max(R.h * z, ed.scrollHeight) + 'px';
};
X.startEdit = (mode, initial) => {
  if (X.sh.protect) return ONE.toast('This sheet is protected.');
  const { ar:r, ac:c } = X.sel; X.scrollTo(r, c);
  X.editing = { r, c, mode, orig:X.raw(X.sh, r, c) }; X.pointRef = null;
  ed.hidden = false; ed.value = initial != null ? initial : X.editing.orig; fx.value = ed.value;
  positionEditor(); ed.focus(); const n = ed.value.length; ed.setSelectionRange(n, n);
  X.setMode(ed.value[0] === '=' ? 'Enter' : mode === 'edit' ? 'Edit' : 'Enter'); X.draw();
};
X.commitEdit = move => {
  if (!X.editing) return true; const { r, c } = X.editing; let v = ed.value;
  if (v[0] === '=') { let open = (v.match(/\(/g) || []).length - (v.match(/\)/g) || []).length; while (open-- > 0) v += ')'; v = v.replace(/^=\s*/, '=').replace(/([A-Za-z_][\w.]*)(?=\s*\()/g, m => X.FN[m.toUpperCase()] ? m.toUpperCase() : m); }
  const ok = v === X.editing.orig ? true : X.commitValue(r, c, v);
  if (ok === false) { ed.focus(); return false; }
  endEdit(); if (move) X.move(move[0], move[1], false, true); return true;
};
X.cancelEdit = () => { endEdit(); X.draw(); X.updateBars(); };
function endEdit(){ X.editing = null; X.pointRef = null; ed.hidden = true; hideAC(); X.setMode('Ready'); kb.focus({ preventScroll:true }); X.draw(); X.updateBars(); }
ed.addEventListener('input', () => { fx.value = ed.value; X.pointRef = null; positionEditor(); X.setMode(ed.value[0] === '=' ? 'Enter' : X.editing && X.editing.mode === 'edit' ? 'Edit' : 'Enter'); autocomplete(ed); X.draw(); });
fx.addEventListener('focus', () => { if (!X.editing) { X.startEdit('edit'); fx.focus(); } });
fx.addEventListener('input', () => { if (!X.editing) X.startEdit('edit'); ed.value = fx.value; positionEditor(); autocomplete(fx); X.draw(); });
const pointable = el0 => { const v = el0.value, p = el0.selectionStart; if (v[0] !== '=') return false; if (X.pointRef) return true; const before = v.slice(0, p).trimEnd(); return /[=(,+\-*/^&<>:;]$/.test(before); };
X.pointable = () => X.editing && pointable(document.activeElement === fx ? fx : ed);
X.insertRef = (g, extend) => {
  const box = document.activeElement === fx ? fx : ed, ref = X.rangeStr(g); let v = box.value, s, e;
  if (X.pointRef) { s = X.pointRef.s; e = X.pointRef.e; } else { s = e = box.selectionStart; }
  box.value = v.slice(0, s) + ref + v.slice(e); X.pointRef = { s, e:s + ref.length };
  if (box === fx) ed.value = fx.value; else fx.value = ed.value;
  box.focus(); box.setSelectionRange(s + ref.length, s + ref.length); X.setMode('Point'); positionEditor(); X.draw();
};
function editKey(e, box){
  if (acOpen() && ['ArrowDown','ArrowUp','Tab','Enter'].includes(e.key) && !(e.key === 'Enter' && !acSel())) { e.preventDefault(); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') acMove(e.key === 'ArrowDown' ? 1 : -1); else acPick(box); return; }
  if (e.key === 'Enter' && e.altKey) { e.preventDefault(); const p = box.selectionStart; box.value = box.value.slice(0, p) + '\n' + box.value.slice(box.selectionEnd); box.setSelectionRange(p + 1, p + 1); box.dispatchEvent(new Event('input')); return; }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const v = box.value, g = X.normSel(); if (g.r1 === g.r2 && g.c1 === g.c2) return X.commitEdit(null); X.cancelEdit(); X.fillWith(v, g); return; }
  if (e.key === 'Enter') { e.preventDefault(); X.commitEdit(e.shiftKey ? [-1, 0] : [1, 0]); return; }
  if (e.key === 'Tab') { e.preventDefault(); X.commitEdit(e.shiftKey ? [0, -1] : [0, 1]); return; }
  if (e.key === 'Escape') { e.preventDefault(); X.cancelEdit(); return; }
  if (e.key === 'F4') { e.preventDefault(); toggleAbs(box); return; }
  if (e.key === 'F2') { e.preventDefault(); X.editing.mode = X.editing.mode === 'edit' ? 'enter' : 'edit'; X.setMode(X.editing.mode === 'edit' ? 'Edit' : 'Enter'); return; }
  if (/^Arrow/.test(e.key) && box === ed && X.editing.mode === 'enter') {
    const d = { ArrowUp:[-1, 0], ArrowDown:[1, 0], ArrowLeft:[0, -1], ArrowRight:[0, 1] }[e.key];
    if (pointable(box)) { e.preventDefault(); const base = X.pointRef ? X.parseRange(box.value.slice(X.pointRef.s, X.pointRef.e)) : { r1:X.editing.r, c1:X.editing.c }; const r = ONE.clamp(base.r1 + d[0], 0, NR - 1), c = ONE.clamp(base.c1 + d[1], 0, NC - 1); X.insertRef({ r1:r, c1:c, r2:r, c2:c }); return; }
    if (box.value[0] !== '=') { e.preventDefault(); X.commitEdit(d); }
  }
}
ed.addEventListener('keydown', e => editKey(e, ed));
fx.addEventListener('keydown', e => editKey(e, fx));
function toggleAbs(box){
  const v = box.value, p = box.selectionStart; const toks = X.tokenize(v.slice(1)); let pos = 1;
  for (const t of toks) { const s = pos, e = pos + t.v.length; pos = e; if (t.t !== 'ref' || p < s || p > e) continue;
    const ref = X.parseRef(t.v); const cyc = x => { if (!x) return; const st = (x.ac ? 2 : 0) + (x.ar ? 1 : 0); const n = st === 0 ? 3 : st === 3 ? 1 : st === 1 ? 2 : 0; x.ac = !!(n & 2); x.ar = !!(n & 1); };
    cyc(ref.a); cyc(ref.b); const nt = X.buildRef(ref); box.value = v.slice(0, s) + nt + v.slice(e); box.setSelectionRange(s + nt.length, s + nt.length); box.dispatchEvent(new Event('input')); return; }
}
/* function autocomplete + syntax tip */
const ac = $('#acpop'), tip = $('#fntip'); let acItems = [], acIdx = 0, acBox = null;
const acOpen = () => !ac.hidden; const acSel = () => acItems[acIdx];
function hideAC(){ ac.hidden = true; tip.hidden = true; }
function autocomplete(box){
  acBox = box; const v = box.value, p = box.selectionStart;
  if (v[0] !== '=') return hideAC();
  const before = v.slice(0, p), m = /(?:^=|[(,+\-*/^&<>=:;\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  const qCount = (before.match(/"/g) || []).length;
  const rect = box.getBoundingClientRect();
  if (m && qCount % 2 === 0) { const q = m[1].toUpperCase(); acItems = X.FN_LIST.filter(n => n.startsWith(q)).slice(0, 8); }
  else acItems = [];
  if (acItems.length) { acIdx = 0; ac.innerHTML = acItems.map((n, i) => `<button class="menu-item${i === 0 ? ' kb' : ''}" data-fn="${n}">${ONE.icon('function')}<span class="mi-label">${n}<small>${esc(X.fnHelp(n)[1])}</small></span></button>`).join(''); ac.hidden = false; Object.assign(ac.style, { left:rect.left + 'px', top:rect.bottom + 4 + 'px' }); }
  else ac.hidden = true;
  let depth = 0, fn = null; for (let i = before.length - 1; i >= 0; i--) { const ch = before[i]; if (ch === ')') depth++; else if (ch === '(') { if (depth) depth--; else { const mm = /([A-Za-z][A-Za-z0-9.]*)\s*$/.exec(before.slice(0, i)); fn = mm && mm[1].toUpperCase(); break; } } }
  if (fn && X.FN[fn] && ac.hidden) { const h = X.fnHelp(fn); tip.innerHTML = `<b>${esc(h[0])}</b>`; tip.hidden = false; Object.assign(tip.style, { left:rect.left + 'px', top:rect.bottom + 4 + 'px' }); } else tip.hidden = true;
}
function acMove(d){ acIdx = (acIdx + d + acItems.length) % acItems.length; $$('.menu-item', ac).forEach((b, i) => b.classList.toggle('kb', i === acIdx)); }
function acPick(box, name){ const n = name || acItems[acIdx]; const v = box.value, p = box.selectionStart; const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(v.slice(0, p)); const s = p - (m ? m[1].length : 0); box.value = v.slice(0, s) + n + '(' + v.slice(p); box.setSelectionRange(s + n.length + 1, s + n.length + 1); box.dispatchEvent(new Event('input')); ac.hidden = true; autocomplete(box); box.focus(); }
ac.addEventListener('mousedown', e => { e.preventDefault(); const b = e.target.closest('[data-fn]'); if (b) acPick(acBox || ed, b.dataset.fn); });

/* ---------- navigation ---------- */
const hasVal = (r, c) => { const k = X.sh.cells[r + ',' + c]; return !!(k && k.v !== '' && k.v != null); };
X.move = (dr, dc, extend, fromEdit) => {
  const s = X.sel; let r = extend ? (s.r2) : s.ar, c = extend ? s.c2 : s.ac;
  const m = X.mergeAt(r, c); if (m && !extend) { if (dr > 0) r = m.r2; if (dc > 0) c = m.c2; }
  do { r = ONE.clamp(r + dr, 0, NR - 1); c = ONE.clamp(c + dc, 0, NC - 1); } while (((dr && !X.rowH(X.sh, r)) || (dc && !X.colW(X.sh, c))) && r > 0 && c >= 0 && r < NR - 1 && c < NC - 1);
  const mm = X.mergeAt(r, c); if (mm && !extend) { r = mm.r1; c = mm.c1; }
  if (extend) { X.sel.r2 = r; X.sel.c2 = c; X.scrollTo(r, c); X.afterSelect(); } else X.select(r, c);
};
X.jump = (dr, dc, extend) => {
  const s = X.sel; let r = extend ? s.r2 : s.ar, c = extend ? s.c2 : s.ac;
  const step = () => { r += dr; c += dc; return r >= 0 && c >= 0 && r < NR && c < NC; };
  const start = hasVal(r, c), nxt = hasVal(r + dr, c + dc);
  if (start && nxt) { while (step() && hasVal(r + dr, c + dc)); }
  else { let found = false; while (step()) { if (hasVal(r, c)) { found = true; break; } } if (!found) { r = ONE.clamp(r, 0, dr ? Math.max(0, X.usedRows(X.sh) - 1 >= 0 && dr > 0 ? NR - 1 : 0) : r); c = ONE.clamp(c, 0, NC - 1); } }
  r = ONE.clamp(r, 0, NR - 1); c = ONE.clamp(c, 0, NC - 1);
  if (extend) { X.sel.r2 = r; X.sel.c2 = c; X.scrollTo(r, c); X.afterSelect(); } else X.select(r, c);
};
X.region = (r = X.sel.ar, c = X.sel.ac) => {
  let g = { r1:r, c1:c, r2:r, c2:c }, grew = true;
  while (grew) { grew = false;
    if (g.r1 > 0 && range(g.c1 - (g.c1 > 0 ? 1 : 0), g.c2 + 1).some(j => hasVal(g.r1 - 1, j))) { g.r1--; grew = true; }
    if (range(g.c1 - (g.c1 > 0 ? 1 : 0), g.c2 + 1).some(j => hasVal(g.r2 + 1, j))) { g.r2++; grew = true; }
    if (g.c1 > 0 && range(g.r1 - (g.r1 > 0 ? 1 : 0), g.r2 + 1).some(i => hasVal(i, g.c1 - 1))) { g.c1--; grew = true; }
    if (range(g.r1 - (g.r1 > 0 ? 1 : 0), g.r2 + 1).some(i => hasVal(i, g.c2 + 1))) { g.c2++; grew = true; }
    if (g.r2 - g.r1 > 5000 || g.c2 - g.c1 > 500) break; }
  return g;
};

/* ---------- keyboard on the grid ---------- */
kb.addEventListener('keydown', e => {
  if (X.editing) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  const arrows = { ArrowUp:[-1, 0], ArrowDown:[1, 0], ArrowLeft:[0, -1], ArrowRight:[0, 1] };
  if (arrows[k]) { e.preventDefault(); X.clip && (X.clip.live = X.clip.live); return mod ? X.jump(...arrows[k], e.shiftKey) : X.move(...arrows[k], e.shiftKey); }
  if (k === 'Enter') { e.preventDefault(); return X.moveInSel(e.shiftKey ? -1 : 1, 'r'); }
  if (k === 'Tab') { e.preventDefault(); return X.moveInSel(e.shiftKey ? -1 : 1, 'c'); }
  if (k === 'Home') { e.preventDefault(); return mod ? X.select(0, 0) : X.select(X.sel.ar, 0); }
  if (k === 'End' && mod) { e.preventDefault(); return X.select(Math.max(0, X.usedRows(X.sh) - 1), Math.max(0, X.usedCols(X.sh) - 1)); }
  if (k === 'PageDown' || k === 'PageUp') { e.preventDefault(); if (mod) return X.switchSheet(ONE.clamp(X.wb.active + (k === 'PageDown' ? 1 : -1), 0, X.wb.sheets.length - 1)); const n = Math.floor(view().vh / X.DEF_H) - 2; return X.move(k === 'PageDown' ? n : -n, 0, e.shiftKey); }
  if (k === 'F2') { e.preventDefault(); return X.startEdit('edit'); }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (k === 'Backspace' && !mod) { X.startEdit('enter', ''); return; } return X.act.clearContents(); }
  if (k === 'Escape') { if (X.clip) { X.clip.live = false; X.draw(); } return; }
  if (k === ' ' && !mod && !e.shiftKey && X.styleOf(X.sh, X.sel.ar, X.sel.ac).checkbox) { e.preventDefault(); return X.toggleCheck(X.sel.ar, X.sel.ac); }
  if (k === ' ' && mod) { e.preventDefault(); const g = X.normSel(); return X.select(0, g.c1, NR - 1, g.c2, X.sel.ar, X.sel.ac, true); }
  if (k === ' ' && e.shiftKey) { e.preventDefault(); const g = X.normSel(); return X.select(g.r1, 0, g.r2, NC - 1, X.sel.ar, X.sel.ac, true); }
  if (!mod && !e.altKey && k.length === 1 && !e.isComposing) { e.preventDefault(); X.startEdit('enter', k); ed.dispatchEvent(new Event('input')); return; }
});
kb.addEventListener('input', () => { const v = kb.value; kb.value = ''; if (!v || X.editing) return; X.startEdit('enter', v); ed.dispatchEvent(new Event('input')); });
X.moveInSel = (d, axis) => {
  const g = X.normSel(), s = X.sel; if (g.r1 === g.r2 && g.c1 === g.c2) return X.move(axis === 'r' ? d : 0, axis === 'c' ? d : 0);
  let r = s.ar, c = s.ac;
  if (axis === 'r') { r += d; if (r > g.r2) { r = g.r1; c = c + 1 > g.c2 ? g.c1 : c + 1; } if (r < g.r1) { r = g.r2; c = c - 1 < g.c1 ? g.c2 : c - 1; } }
  else { c += d; if (c > g.c2) { c = g.c1; r = r + 1 > g.r2 ? g.r1 : r + 1; } if (c < g.c1) { c = g.c2; r = r - 1 < g.r1 ? g.r2 : r - 1; } }
  X.sel.ar = r; X.sel.ac = c; X.scrollTo(r, c); X.afterSelect();
};

/* ---------- clipboard ---------- */
X.clip = null;
const tsvOf = g => { const out = []; for (let r = g.r1; r <= g.r2; r++) { if (!X.rowH(X.sh, r)) continue; const row = []; for (let c = g.c1; c <= g.c2; c++) { const t = X.displayOf(X.sh, r, c); row.push(/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t); } out.push(row.join('\t')); } return out.join('\n'); };
const htmlOf = g => { let h = '<table>'; for (let r = g.r1; r <= g.r2; r++) { if (!X.rowH(X.sh, r)) continue; h += '<tr>'; for (let c = g.c1; c <= g.c2; c++) { const s = X.styleOf(X.sh, r, c); h += `<td style="${s.bold ? 'font-weight:bold;' : ''}${s.fill ? 'background:' + s.fill + ';' : ''}${s.color ? 'color:' + s.color + ';' : ''}">${esc(X.displayOf(X.sh, r, c))}</td>`; } h += '</tr>'; } return h + '</table>'; };
X.copySel = cut => {
  const g = X.normSel(), sh = X.sh, cells = [];
  for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) { const k = sh.cells[r + ',' + c]; row.push(k ? JSON.parse(JSON.stringify(k)) : null); } cells.push(row); }
  X.clip = { sheetId:sh.id, g, cells, cut, live:true, tsv:tsvOf(g), html:htmlOf(g) }; X.draw();
  return X.clip;
};
kb.addEventListener('copy', e => { if (X.editing) return; e.preventDefault(); const c = X.copySel(false); e.clipboardData.setData('text/plain', c.tsv); e.clipboardData.setData('text/html', c.html); });
kb.addEventListener('cut', e => { if (X.editing) return; e.preventDefault(); const c = X.copySel(true); e.clipboardData.setData('text/plain', c.tsv); e.clipboardData.setData('text/html', c.html); });
kb.addEventListener('paste', e => { if (X.editing) return; e.preventDefault(); const t = e.clipboardData.getData('text/plain'); X.pasteText(t, X.pasteMode || 'all'); X.pasteMode = null; });
X.parseTSV = t => { const rows = []; let row = [], cur = '', q = false; t = t.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"' && cur === '') q = true; else if (ch === '\t') { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; }
  row.push(cur); rows.push(row); return rows; };
X.pasteText = (t, mode = 'all') => {
  const s = X.sel, sh = X.sh, C = X.clip;
  if (C && C.tsv === t) return X.pasteInternal(mode);
  const rows = X.parseTSV(t); if (!rows.length) return;
  X.mutate(() => { rows.forEach((row, i) => row.forEach((v, j) => X.setRaw(sh, s.ar + i, s.ac + j, v))); });
  X.select(s.ar, s.ac, s.ar + rows.length - 1, s.ac + Math.max(...rows.map(r => r.length)) - 1, s.ar, s.ac, true);
};
X.pasteInternal = (mode = 'all') => {
  const C = X.clip, src = X.wb.sheets.find(x => x.id === C.sheetId), sh = X.sh, g = X.normSel();
  const h = C.cells.length, w = C.cells[0].length;
  const reps = (g.r2 - g.r1 + 1) % h === 0 && (g.c2 - g.c1 + 1) % w === 0 && (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1) > h * w ? [(g.r2 - g.r1 + 1) / h, (g.c2 - g.c1 + 1) / w] : [1, 1];
  X.mutate(() => {
    if (C.cut && src) { for (let r = C.g.r1; r <= C.g.r2; r++) for (let c = C.g.c1; c <= C.g.c2; c++) delete src.cells[r + ',' + c]; }
    for (let a = 0; a < reps[0]; a++) for (let b = 0; b < reps[1]; b++) C.cells.forEach((row, i) => row.forEach((cell, j) => {
      const r = g.r1 + a * h + i, c = g.c1 + b * w + j; const dr = r - (C.g.r1 + i), dc = c - (C.g.c1 + j);
      if (!cell) { if (mode === 'all') delete sh.cells[r + ',' + c]; return; }
      let v = cell.v; if (typeof v === 'string' && v[0] === '=' && !C.cut) v = X.shiftFormula(v, dr, dc);
      if (mode === 'values') { const val = src ? X.valueAt(X.wb, src, C.g.r1 + i, C.g.c1 + j) : v; X.setRaw(sh, r, c, X.isErr(val) ? val.err : val == null ? '' : typeof val === 'number' ? String(val) : typeof val === 'boolean' ? (val ? 'TRUE' : 'FALSE') : "'" + val); }
      else if (mode === 'formats') { X.setStyle(sh, r, c, cell.s || {}); }
      else if (mode === 'formulas') X.setRaw(sh, r, c, v);
      else { sh.cells[r + ',' + c] = { v, ...(cell.s ? { s:JSON.parse(JSON.stringify(cell.s)) } : {}) }; }
    }));
  });
  if (C.cut) X.clip = null; else C.live = true;
  X.select(g.r1, g.c1, g.r1 + h * reps[0] - 1, g.c1 + w * reps[1] - 1, g.r1, g.c1, true);
};
X.fillWith = (raw, g) => X.mutate(() => { for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) X.setRaw(X.sh, r, c, raw[0] === '=' ? X.shiftFormula(raw, r - X.sel.ar, c - X.sel.ac) : raw); });

/* ---------- auto fill ---------- */
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], MONS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const seriesOf = v => { const s = String(v).trim(), l = s.toLowerCase();
  for (const L of [DAYS, MONS]) { let i = L.findIndex(x => x.toLowerCase() === l); if (i >= 0) return { list:L, i, fmt:x => x }; i = L.findIndex(x => x.slice(0, 3).toLowerCase() === l); if (i >= 0) return { list:L, i, fmt:x => x.slice(0, 3) }; }
  return null; };
X.fill = (src, dst) => {
  const sh = X.sh, vertical = dst.c1 === src.c1 && dst.c2 === src.c2;
  const lines = vertical ? range(src.c1, src.c2) : range(src.r1, src.r2);
  const srcIdx = vertical ? range(src.r1, src.r2) : range(src.c1, src.c2);
  const tgtIdx = vertical ? range(dst.r1, dst.r2).filter(r => r < src.r1 || r > src.r2) : range(dst.c1, dst.c2).filter(c => c < src.c1 || c > src.c2);
  const backward = vertical ? dst.r1 < src.r1 : dst.c1 < src.c1;
  X.mutate(() => lines.forEach(L => {
    const at = i => vertical ? [i, L] : [L, i];
    const vals = srcIdx.map(i => X.raw(sh, ...at(i))), n = vals.length;
    const nums = vals.map(v => v !== '' && v[0] !== '=' ? X.parseInput(v) : null);
    const allNum = n >= 2 && nums.every(p => p && typeof p.v === 'number');
    const step = allNum ? (nums[n - 1].v - nums[0].v) / (n - 1) : 0;
    const single = n === 1 ? nums[0] : null, st0 = X.styleOf(sh, ...at(srcIdx[0]));
    const isDate = single && typeof single.v === 'number' && st0.fmt && st0.fmt.type === 'date';
    tgtIdx.forEach((t, k) => {
      const off = backward ? -(tgtIdx.length - k) : k + 1;
      const si = ((backward ? n - 1 - ((tgtIdx.length - 1 - k) % n) : k % n) + n) % n;
      const [sr, sc] = at(srcIdx[si]), [tr, tc] = at(t), v = vals[si];
      let out = v;
      if (allNum) out = String(+(nums[backward ? 0 : n - 1].v + step * (backward ? -(tgtIdx.length - k) : k + 1)).toFixed(10));
      else if (isDate) out = String(single.v + off);
      else if (v[0] === '=') out = X.shiftFormula(v, tr - sr, tc - sc);
      else if (n === 1 && v) { const se = seriesOf(v); const m = /^(.*?)(\d+)(\D*)$/.exec(v);
        if (se) out = se.fmt(se.list[((se.i + off) % se.list.length + se.list.length) % se.list.length]);
        else if (m && !(nums[0] && typeof nums[0].v === 'number')) out = m[1] + Math.max(0, +m[2] + off) + m[3]; }
      X.setRaw(sh, tr, tc, out); const cs = sh.cells[sr + ',' + sc]; if (cs && cs.s) { sh.cells[tr + ',' + tc] = sh.cells[tr + ',' + tc] || { v:'' }; sh.cells[tr + ',' + tc].s = JSON.parse(JSON.stringify(cs.s)); }
    });
  }));
  X.select(Math.min(src.r1, dst.r1), Math.min(src.c1, dst.c1), Math.max(src.r2, dst.r2), Math.max(src.c2, dst.c2), X.sel.ar, X.sel.ac, true);
};

/* ---------- sizes ---------- */
X.autofitCol = c => { const sh = X.sh, R = X.usedRows(sh); let w = 20; for (let r = 0; r < R; r++) { const t = X.displayOf(sh, r, c); if (!t) continue; const s = X.styleOf(sh, r, c); if (s.wrap || X.mergeAt(r, c)) continue; g2.font = fontOf(s); w = Math.max(w, g2.measureText(t).width + 12); } sh.colW[c] = Math.min(600, Math.ceil(w)); };
X.autofitRow = r => { const sh = X.sh; let h = X.DEF_H; for (let c = 0; c < X.usedCols(sh); c++) { const s = X.styleOf(sh, r, c), t = X.displayOf(sh, r, c); if (!t) continue; const size = (s.size || 11) * 4 / 3; const lines = s.wrap ? X.wrapLines(t, X.colW(sh, c) - 8, s) : String(t).split('\n').length; h = Math.max(h, Math.ceil(lines * size * 1.2 + 8)); } if (h === X.DEF_H) delete sh.rowH[r]; else sh.rowH[r] = h; };

/* ---------- mouse ---------- */
let drag = null;
const hostXY = e => { const r = scroller.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const edgeCol = (h, V) => { if (!h.inCH || h.inRH) return -1; for (const c of [h.c - 1, h.c]) { if (c < 0) continue; const x = colX(V, c) + (cx[c + 1] - cx[c]); if (Math.abs(h.x - x) < 5 / V.z) return c; } return -1; };
const edgeRow = (h, V) => { if (!h.inRH || h.inCH) return -1; for (const r of [h.r - 1, h.r]) { if (r < 0) continue; const y = rowY(V, r) + (ry[r + 1] - ry[r]); if (Math.abs(h.y - y) < 4 / V.z) return r; } return -1; };
const onFillHandle = h => { if (X.editing) return false; const R = rangeRect(h.V, X.normSel()); return Math.abs(h.x - (R.x + R.w)) < 6 && Math.abs(h.y - (R.y + R.h)) < 6; };
const filterBtnAt = h => { const f = X.sh.filter; if (!f || h.r !== f.r || h.c < f.c1 || h.c > f.c2 || h.inCH || h.inRH) return false; const R = X.cellRect(h.r, h.c, h.V); return h.x > R.x + R.w - 21; };
const validBtnAt = h => { const S = X.sel, vk = X.sh.valid[S.ar + ',' + S.ac]; if (!vk || X.editing) return false; const A = X.cellRect(S.ar, S.ac, h.V); return h.x >= A.x + A.w && h.x <= A.x + A.w + 22 && h.y >= A.y && h.y <= A.y + A.h; };
scroller.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  const [px, py] = hostXY(e); if (px > scroller.clientWidth || py > scroller.clientHeight) return;
  const h = X.hit(px, py), V = h.V;
  if (e.target !== scroller && e.target !== sizer) return;
  if (validBtnAt(h)) { e.preventDefault(); return X.openValidList(); }
  if (filterBtnAt(h)) { e.preventDefault(); return X.openFilterMenu(h.c, { x:e.clientX, y:e.clientY }); }
  const ec = edgeCol(h, V), er = edgeRow(h, V);
  if (ec >= 0) { e.preventDefault(); drag = { kind:'colw', c:ec, x0:h.x, w0:X.colW(X.sh, ec), cols:X.isFullCols(X.normSel()) && ec >= X.normSel().c1 && ec <= X.normSel().c2 ? range(X.normSel().c1, X.normSel().c2) : [ec] }; scroller.setPointerCapture(e.pointerId); return; }
  if (er >= 0) { e.preventDefault(); drag = { kind:'rowh', r:er, y0:h.y, h0:X.rowH(X.sh, er) }; scroller.setPointerCapture(e.pointerId); return; }
  if (X.editing && X.pointable() && !h.inCH && !h.inRH) { e.preventDefault(); X.insertRef({ r1:h.r, c1:h.c, r2:h.r, c2:h.c }); drag = { kind:'point', r:h.r, c:h.c }; scroller.setPointerCapture(e.pointerId); return; }
  if (X.editing && !X.commitEdit(null)) return;
  e.preventDefault(); kb.focus({ preventScroll:true });
  if (onFillHandle(h)) { drag = { kind:'fill', src:X.normSel() }; scroller.setPointerCapture(e.pointerId); return; }
  if (h.inCH && h.inRH) return X.select(0, 0, NR - 1, NC - 1, X.sel.ar, X.sel.ac, true);
  if (h.inCH) { const c1 = e.shiftKey ? X.sel.c1 : h.c; X.select(0, c1, NR - 1, h.c, e.shiftKey ? X.sel.ar : 0, e.shiftKey ? X.sel.ac : h.c, true); drag = { kind:'cols', c:c1 }; }
  else if (h.inRH) { const r1 = e.shiftKey ? X.sel.r1 : h.r; X.select(r1, 0, h.r, NC - 1, e.shiftKey ? X.sel.ar : h.r, e.shiftKey ? X.sel.ac : 0, true); drag = { kind:'rows', r:r1 }; }
  else {
    const m = X.mergeAt(h.r, h.c), r = m ? m.r1 : h.r, c = m ? m.c1 : h.c;
    if (e.shiftKey) { X.sel.r2 = h.r; X.sel.c2 = h.c; X.afterSelect(); } else X.select(r, c, r, c, r, c, true);
    drag = { kind:'cells' };
    if (!e.shiftKey && X.styleOf(X.sh, r, c).checkbox && X.toggleCheck) { const Rc = X.cellRect(r, c, V); if (Math.abs(h.x - (Rc.x + Rc.w / 2)) < 12 && Math.abs(h.y - (Rc.y + Rc.h / 2)) < 12) X.toggleCheck(r, c); }
    if ((e.ctrlKey || e.metaKey) && X.sh.cells[r + ',' + c] && X.styleOf(X.sh, r, c).link) X.openLink(r, c);
  }
  scroller.setPointerCapture(e.pointerId);
});
let lastHover = '';
scroller.addEventListener('pointermove', e => {
  const [px, py] = hostXY(e), h = X.hit(px, py), V = h.V;
  if (!drag) {
    let cur = 'cell'; if (edgeCol(h, V) >= 0) cur = 'col-resize'; else if (edgeRow(h, V) >= 0) cur = 'row-resize'; else if (h.inCH && !h.inRH) cur = 'col'; else if (h.inRH && !h.inCH) cur = 'row'; else if (onFillHandle(h)) cur = 'crosshair'; else if (filterBtnAt(h) || validBtnAt(h)) cur = 'pointer';
    scroller.dataset.cur = cur;
    const k = !h.inCH && !h.inRH ? h.r + ',' + h.c : ''; if (k !== lastHover) { lastHover = k; X.hoverNote(k, e); }
    return;
  }
  autoScroll(px, py);
  if (drag.kind === 'colw') { const w = Math.max(4, drag.w0 + h.x - drag.x0); drag.cols.forEach(c => X.sh.colW[c] = Math.round(w)); X.layout(); X.draw(); }
  else if (drag.kind === 'rowh') { X.sh.rowH[drag.r] = Math.max(4, Math.round(drag.h0 + h.y - drag.y0)); X.layout(); X.draw(); }
  else if (drag.kind === 'cells') { if (X.sel.r2 !== h.r || X.sel.c2 !== h.c) { X.sel.r2 = h.r; X.sel.c2 = h.c; X.afterSelect(); } }
  else if (drag.kind === 'cols') { X.sel.c1 = Math.min(drag.c, h.c); X.sel.c2 = Math.max(drag.c, h.c); X.afterSelect(); }
  else if (drag.kind === 'rows') { X.sel.r1 = Math.min(drag.r, h.r); X.sel.r2 = Math.max(drag.r, h.r); X.afterSelect(); }
  else if (drag.kind === 'point') { X.insertRef({ r1:Math.min(drag.r, h.r), c1:Math.min(drag.c, h.c), r2:Math.max(drag.r, h.r), c2:Math.max(drag.c, h.c) }); }
  else if (drag.kind === 'fill') { const s = drag.src; const dr = h.r > s.r2 ? h.r - s.r2 : h.r < s.r1 ? h.r - s.r1 : 0, dc = h.c > s.c2 ? h.c - s.c2 : h.c < s.c1 ? h.c - s.c1 : 0;
    X.fillPreview = Math.abs(dr) >= Math.abs(dc) ? (dr ? { r1:Math.min(s.r1, h.r), r2:Math.max(s.r2, h.r), c1:s.c1, c2:s.c2 } : null) : { r1:s.r1, r2:s.r2, c1:Math.min(s.c1, h.c), c2:Math.max(s.c2, h.c) }; X.draw(); }
});
scroller.addEventListener('pointerup', () => {
  if (!drag) return; const d = drag; drag = null; stopAuto();
  if (d.kind === 'colw' || d.kind === 'rowh') X.changed();
  if (d.kind === 'fill' && X.fillPreview) { const p = X.fillPreview; X.fillPreview = null; X.fill(d.src, p); }
  if (d.kind === 'point') { (document.activeElement === fx ? fx : ed).focus(); }
});
scroller.addEventListener('dblclick', e => {
  const [px, py] = hostXY(e), h = X.hit(px, py), V = h.V; const ec = edgeCol(h, V), er = edgeRow(h, V);
  if (ec >= 0) { const cols = X.isFullCols(X.normSel()) ? range(X.normSel().c1, X.normSel().c2) : [ec]; cols.forEach(X.autofitCol); X.changed(); return; }
  if (er >= 0) { X.autofitRow(er); X.changed(); return; }
  if (onFillHandle(h)) { const s = X.normSel(), L = s.c1 > 0 ? s.c1 - 1 : s.c2 + 1; let r = s.r2; while (hasVal(r + 1, L)) r++; if (r > s.r2) X.fill(s, { r1:s.r1, r2:r, c1:s.c1, c2:s.c2 }); return; }
  if (!h.inCH && !h.inRH) X.startEdit('edit');
});
let asT = null, asD = [0, 0];
function autoScroll(px, py){ const W = scroller.clientWidth, H = scroller.clientHeight; asD = [px < 40 ? -20 : px > W - 20 ? 20 : 0, py < 40 ? -20 : py > H - 20 ? 20 : 0]; if ((asD[0] || asD[1]) && !asT) asT = setInterval(() => { scroller.scrollLeft += asD[0]; scroller.scrollTop += asD[1]; }, 30); if (!asD[0] && !asD[1]) stopAuto(); }
function stopAuto(){ clearInterval(asT); asT = null; }
scroller.addEventListener('scroll', () => { X.draw(); positionEditor(); if (scroller.scrollTop + scroller.clientHeight > sizer.offsetHeight - 200 && NR < 1048576) { NR += 500; X.sh._extraRows = true; const extra = NR; X.nRows = () => Math.max(extra, X.usedRows(X.sh) + 200); X.layout(); } });
scroller.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); X.setZoom(X.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive:false });
new ResizeObserver(() => { X.drawNow(); }).observe(scroller);

/* notes tooltip */
const noteTip = $('#notetip');
X.hoverNote = (k, e) => { const n = k && X.sh.notes[k]; if (!n) { noteTip.hidden = true; return; } noteTip.textContent = n; noteTip.hidden = false; noteTip.style.left = e.clientX + 14 + 'px'; noteTip.style.top = e.clientY + 10 + 'px'; };

/* ---------- zoom, mode, bars, status ---------- */
X.setZoom = z => { X.zoom = ONE.clamp(Math.round(z * 100) / 100, .25, 4); $('#zoomRange').value = Math.round(X.zoom * 100); $('#zoomPct').textContent = Math.round(X.zoom * 100) + '%'; X.layout(); X.drawNow(); positionEditor(); };
X.setMode = m => { $('#modeInfo').textContent = m; };
X.updateBars = () => {
  const g = X.normSel(), s = X.sel;
  if (document.activeElement !== nameBox) nameBox.value = g.r1 === g.r2 && g.c1 === g.c2 || (X.mergeAt(g.r1, g.c1) && X.mergeAt(g.r1, g.c1).r2 === g.r2 && X.mergeAt(g.r1, g.c1).c2 === g.c2) ? X.addr(s.ar, s.ac) : X.isFullCols(g) ? `${X.colName(g.c1)}:${X.colName(g.c2)}` : X.isFullRows(g) ? `${g.r1 + 1}:${g.r2 + 1}` : X.rangeStr(g);
  if (!X.editing && document.activeElement !== fx) fx.value = X.raw(X.sh, s.ar, s.ac);
  const st = X.styleOf(X.sh, s.ar, s.ac), fs = $('#fontName'), sz = $('#fontSize');
  if (fs && document.activeElement !== fs) { const f = (st.font || 'Calibri').split(',')[0].replace(/["']/g, '').trim(); fs.value = [...fs.options].some(o => o.value === f) ? f : 'Calibri'; }
  if (sz && document.activeElement !== sz) sz.value = st.size || 11;
  const nf = $('#numFmt'); if (nf) nf.value = (st.fmt && st.fmt.type) || 'general';
};
X.updateStatus = () => {
  const g = X.normSel(), sh = X.sh; let n = 0, cnt = 0, sum = 0, min = Infinity, max = -Infinity, cells = 0;
  if (!(g.r1 === g.r2 && g.c1 === g.c2)) X.forSel((r, c) => { if (++cells > 200000) return; const v = X.valueAt(X.wb, sh, r, c); if (v != null && v !== '') cnt++; if (typeof v === 'number') { n++; sum += v; min = Math.min(min, v); max = Math.max(max, v); } }, g);
  const f = x => X.format(x, (X.styleOf(sh, X.sel.ar, X.sel.ac).fmt || {}).type && !['date','time','text'].includes(X.styleOf(sh, X.sel.ar, X.sel.ac).fmt.type) ? X.styleOf(sh, X.sel.ar, X.sel.ac).fmt : { type:'number', dec:Math.abs(x) % 1 ? 2 : 0, sep:true });
  $('#statInfo').innerHTML = cnt > 1 ? (n ? `<span>Average: <b>${f(sum / n)}</b></span><span>Count: <b>${cnt}</b></span><span class="hide-sm">Min: <b>${f(min)}</b></span><span class="hide-sm">Max: <b>${f(max)}</b></span><span>Sum: <b>${f(sum)}</b></span>` : `<span>Count: <b>${cnt}</b></span>`) : '';
};
nameBox.addEventListener('keydown', e => {
  if (e.key !== 'Enter') { if (e.key === 'Escape') { X.updateBars(); kb.focus(); } return; }
  e.preventDefault(); const v = nameBox.value.trim(), up = v.toUpperCase();
  const nm = X.wb.names[up]; const target = nm ? nm.replace(/^.*!/, '') : v;
  const g = X.parseRange(target) || (/^[A-Z]{1,3}:[A-Z]{1,3}$/i.test(v) ? (() => { const [a, b] = v.split(':'); return { r1:0, r2:NR - 1, c1:X.colIndex(a), c2:X.colIndex(b) }; })() : null);
  if (g) { if (nm && nm.includes('!')) { const sn = nm.split('!')[0].replace(/^'|'$/g, ''); const i = X.wb.sheets.findIndex(s => s.name.toLowerCase() === sn.toLowerCase()); if (i >= 0 && i !== X.wb.active) X.switchSheet(i); } X.select(g.r1, g.c1, g.r2, g.c2); kb.focus(); return; }
  if (/^[A-Za-z_][\w.]*$/.test(v)) { X.wb.names[up] = `${/\s/.test(X.sh.name) ? `'${X.sh.name}'` : X.sh.name}!${X.rangeStr(X.normSel()).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}`; X.changed(); ONE.toast(`Name “${up}” now refers to ${X.rangeStr(X.normSel())}.`); kb.focus(); return; }
  ONE.toast('Type a cell reference like B7 or C2:F20, or a name for the selection.');
});

/* ---------- sheets ---------- */
X.switchSheet = i => { if (X.editing) X.commitEdit(null); X.wb.active = i; X.clip && (X.clip.live = X.clip.sheetId === X.sh.id && X.clip.live); X.sel = X.sh._sel || { r1:0, c1:0, r2:0, c2:0, ar:0, ac:0 }; scroller.scrollTop = 0; scroller.scrollLeft = 0; X.changed(false); X.renderTabs(); X.afterSelect(); };
X.hooks2.push(() => { X.sh._sel = { ...X.sel }; });
X.renderTabs = () => {
  const bar = $('#sheettabs'); bar.innerHTML = '';
  X.wb.sheets.forEach((s, i) => { if (s.hidden) return; const t = el('button', { class:'stab' + (i === X.wb.active ? ' active' : ''), style:s.tab ? { '--tc':s.tab } : null, title:s.name, 'data-i':i }, el('span', { text:s.name }));
    t.onclick = () => { if (i !== X.wb.active) X.switchSheet(i); };
    t.ondblclick = () => X.renameSheet(i);
    t.oncontextmenu = e => { e.preventDefault(); X.sheetMenu(i, { x:e.clientX, y:e.clientY }); };
    bar.append(t); });
  bar.append(el('button', { class:'icon-btn stab-add', title:'New sheet (Shift+F11)', html:icon('add'), onclick:() => X.addSheet() }));
  const a = bar.querySelector('.stab.active'); a && a.scrollIntoView({ block:'nearest', inline:'nearest' });
};
X.uniqueName = base => { let i = 1, n = base; while (X.sheetByName(X.wb, n)) n = base.replace(/\d*$/, '') + (++i); return n; };
X.addSheet = (name, at) => { const s = X.newSheet(name || X.uniqueName('Sheet' + (X.wb.sheets.length + 1))); const i = at ?? X.wb.active + 1; X.wb.sheets.splice(i, 0, s); X.switchSheet(i); X.record(); return s; };
X.renameSheet = i => {
  const inp = ONE.input({ value:X.wb.sheets[i].name, maxlength:31 });
  ONE.modal({ title:'Rename sheet', body:ONE.field('Sheet name', inp), actions:[{ label:'Cancel' }, { label:'Rename', kind:'filled', on:() => { const n = inp.value.trim(); if (!n || /[\\/?*[\]:]/.test(n)) { ONE.toast('Sheet names can’t be blank or use \\ / ? * [ ] :'); return false; } if (X.wb.sheets.some((s, j) => j !== i && s.name.toLowerCase() === n.toLowerCase())) { ONE.toast('That name is already taken.'); return false; }
    const old = X.wb.sheets[i].name; X.wb.sheets.forEach(s => Object.values(s.cells).forEach(c => { if (typeof c.v === 'string' && c.v[0] === '=' && c.v.includes('!')) c.v = X.mapRefs(c.v, (ref, raw) => ref.sheet && ref.sheet.toLowerCase() === old.toLowerCase() ? (ref.sheet = n, X.buildRef(ref)) : raw); }));
    X.wb.sheets[i].name = n; X.renderTabs(); X.changed(); } }] });
};
X.deleteSheet = i => {
  if (X.wb.sheets.length === 1) return ONE.toast('A workbook needs at least one sheet.');
  ONE.modal({ title:`Delete “${X.wb.sheets[i].name}”?`, body:'This sheet and everything on it will be removed. You can undo this with Ctrl+Z.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { X.wb.sheets.splice(i, 1); X.wb.active = Math.max(0, Math.min(X.wb.active, X.wb.sheets.length - 1)); X.renderTabs(); X.switchSheet(X.wb.active); X.record(); } }] });
};
X.sheetMenu = (i, at) => ONE.menuAt(at, [
  { label:'Insert sheet', icon:'add', on:() => X.addSheet(null, i + 1) }, { label:'Rename', icon:'edit', on:() => X.renameSheet(i) },
  { label:'Duplicate', icon:'content_copy', on:() => { const c = JSON.parse(JSON.stringify(X.wb.sheets[i], (k, v) => k === '_vals' ? undefined : v)); c.id = ONE.uid(); c.name = X.uniqueName(c.name + ' (2)'); c.charts.forEach(ch => ch.id = ONE.uid()); X.wb.sheets.splice(i + 1, 0, c); X.switchSheet(i + 1); X.record(); } },
  { label:'Tab color', icon:'palette', on:() => ONE.pop.open(at, ONE.colorGrid(c => { X.wb.sheets[i].tab = c && c !== 'none' ? c : ''; X.renderTabs(); X.changed(); }, { noneLabel:'No Color' })) },
  { label:'Move left', icon:'arrow_back', disabled:i === 0, on:() => { const s = X.wb.sheets.splice(i, 1)[0]; X.wb.sheets.splice(i - 1, 0, s); X.wb.active = i - 1; X.renderTabs(); X.record(); } },
  { label:'Move right', icon:'arrow_forward', disabled:i === X.wb.sheets.length - 1, on:() => { const s = X.wb.sheets.splice(i, 1)[0]; X.wb.sheets.splice(i + 1, 0, s); X.wb.active = i + 1; X.renderTabs(); X.record(); } },
  { label:X.wb.sheets[i].protect ? 'Unprotect sheet' : 'Protect sheet', icon:'lock', on:() => { X.wb.sheets[i].protect = !X.wb.sheets[i].protect; X.changed(); ONE.ribbon.refresh(); } }, '-',
  { label:'Delete', icon:'delete', danger:true, on:() => X.deleteSheet(i) }
]);
})();
