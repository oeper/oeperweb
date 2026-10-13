/* oneDraw — the board: canvas drawing, tools, selection, text editing, pictures, export */
(() => {
'use strict';
const { $, el, clamp } = ONE;
const B = window.B = {};
const cv = $('#board'), ctx = cv.getContext('2d'), wrap = $('#boardwrap');
let W = 1, H = 1, dpr = 1;

B.tool = 'pen'; B.lock = false; B.sel = []; B.v = { tx:0, ty:0, k:1 };
B.onChange = () => {}; B.onSelect = () => {}; B.onTool = () => {}; B.onContext = () => {}; B.onInk = () => {};
/* remembered look for each kind of thing the next stroke or shape will use */
B.defaults = {
  pen:{ c:'auto', sw:3, op:1 }, hl:{ c:'#ffd43b', sw:22, op:.4 },
  shape:{ c:'auto', f:null, sw:2, dash:'solid', op:1 }, text:{ c:'auto', size:28, font:'hand', op:1 }, sticky:{ sc:'#fff59d', size:22, font:'hand' }
};
const GROUP = { pen:'pen', write:'pen', hl:'hl', eraser:'pen', laser:'pen', line:'shape', arrow:'shape', rect:'shape', ellipse:'shape', diamond:'shape', text:'text', sticky:'sticky', select:'shape', hand:'shape' };
const elGroup = e => e.t === 'pen' ? (e.hl ? 'hl' : 'pen') : e.t === 'text' ? 'text' : e.t === 'sticky' ? 'sticky' : e.t === 'img' ? 'shape' : 'shape';
const TOOLS_DRAW = new Set(['pen', 'write', 'hl', 'eraser', 'laser', 'line', 'arrow', 'rect', 'ellipse', 'diamond', 'text', 'sticky']);
const SEL_COLOR = '#5b8def';

/* ---------- theme ---------- */
const lum = hex => { const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
const themeDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
const pageDark = p => p && p.color ? lum(p.color) < .45 : themeDark();
const ink = (c, dark) => !c || c === 'auto' ? (dark ? '#ececf1' : '#1b1b1f') : c;
B.pageBg = p => p.color || (themeDark() ? '#16171b' : '#ffffff');

/* ---------- geometry ---------- */
const FONT = f => (window.D && D.FONTS[f] || D.FONTS.sans)[1];
const fontStr = (e, k = 1) => `${Math.max(1, (e.size || 28) * k)}px ${FONT(e.font)}`;
const mctx = document.createElement('canvas').getContext('2d');
const mcache = new WeakMap();
function measure(e){
  const sig = e.text + '|' + e.size + '|' + e.font, c = mcache.get(e); if (c && c.sig === sig) return c;
  mctx.font = fontStr(e); const lines = String(e.text || '').split('\n'); let w = 0;
  lines.forEach(l => { w = Math.max(w, mctx.measureText(l || ' ').width); });
  const r = { sig, w:Math.max(w, e.size * .5), h:Math.max(1, lines.length) * e.size * 1.25, lines }; mcache.set(e, r); return r;
}
function wrapLines(e, maxW){
  mctx.font = fontStr(e); const out = [];
  String(e.text || '').split('\n').forEach(par => {
    if (!par) return out.push('');
    let line = '';
    par.split(' ').forEach(word => {
      const t = line ? line + ' ' + word : word;
      if (line && mctx.measureText(t).width > maxW) { out.push(line); line = word; } else line = t;
      while (mctx.measureText(line).width > maxW && line.length > 1) { let i = line.length - 1; while (i > 1 && mctx.measureText(line.slice(0, i)).width > maxW) i--; out.push(line.slice(0, i)); line = line.slice(i); }
    });
    out.push(line);
  });
  return out;
}
const pbounds = new WeakMap();
function bounds(e){
  switch (e.t) {
    case 'pen': { const c = pbounds.get(e); if (c && c.pts === e.pts && c.n === e.pts.length) return c.b; let a = 1e9, b = 1e9, x = -1e9, y = -1e9; for (let i = 0; i < e.pts.length; i += 2) { a = Math.min(a, e.pts[i]); x = Math.max(x, e.pts[i]); b = Math.min(b, e.pts[i + 1]); y = Math.max(y, e.pts[i + 1]); } const h = (e.sw || 3) / 2; const r = { x:a - h, y:b - h, w:x - a + h * 2, h:y - b + h * 2 }; pbounds.set(e, { pts:e.pts, n:e.pts.length, b:r }); return r; }
    case 'line': { const h = (e.sw || 2) / 2 + (e.arrow ? 8 : 0), x = Math.min(e.x1, e.x2) - h, y = Math.min(e.y1, e.y2) - h; return { x, y, w:Math.abs(e.x1 - e.x2) + h * 2, h:Math.abs(e.y1 - e.y2) + h * 2 }; }
    case 'text': { const m = measure(e); return { x:e.x, y:e.y, w:m.w, h:m.h }; }
    default: return { x:e.x, y:e.y, w:e.w, h:e.h };
  }
}
// the box a shape/picture/sticky/text is stretched by (without the stroke padding that bounds() adds to lines and strokes)
const rawBox = e => e.t === 'pen' || e.t === 'line' ? bounds(e) : bounds(e);
function union(list){
  if (!list.length) return null; let a = 1e9, b = 1e9, x = -1e9, y = -1e9;
  list.forEach(e => { const r = bounds(e); a = Math.min(a, r.x); b = Math.min(b, r.y); x = Math.max(x, r.x + r.w); y = Math.max(y, r.y + r.h); });
  return { x:a, y:b, w:x - a, h:y - b };
}
const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy; let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = clamp(t, 0, 1); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); };
function hit(e, x, y, tol){
  const b = bounds(e); if (x < b.x - tol || y < b.y - tol || x > b.x + b.w + tol || y > b.y + b.h + tol) return false;
  const r = tol + (e.sw || 2) / 2;
  switch (e.t) {
    case 'pen': { const a = e.pts; if (a.length === 2) return Math.hypot(x - a[0], y - a[1]) <= r; for (let i = 0; i < a.length - 2; i += 2) if (segDist(x, y, a[i], a[i + 1], a[i + 2], a[i + 3]) <= r) return true; return false; }
    case 'line': return segDist(x, y, e.x1, e.y1, e.x2, e.y2) <= r;
    case 'rect': case 'ellipse': case 'diamond': {
      const cx = e.x + e.w / 2, cy = e.y + e.h / 2, hw = Math.max(1, e.w / 2), hh = Math.max(1, e.h / 2), m = Math.min(hw, hh), filled = !!e.f || !!e.text;
      if (e.t === 'rect') { const d = Math.max(Math.abs(x - cx) - hw, Math.abs(y - cy) - hh); return filled ? d <= tol : Math.abs(d) <= r; }
      if (e.t === 'ellipse') { const q = Math.hypot((x - cx) / hw, (y - cy) / hh); return filled ? q <= 1 + tol / m : Math.abs(q - 1) * m <= r; }
      const q = Math.abs(x - cx) / hw + Math.abs(y - cy) / hh; return filled ? q <= 1 + tol / m : Math.abs(q - 1) * m * .7 <= r;
    }
    default: return true;
  }
}
const topAt = (x, y, tol) => { const els = D.page().els; for (let i = els.length - 1; i >= 0; i--) if (hit(els[i], x, y, tol)) return els[i]; return null; };
const inside = (b, r) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;

/* move/scale an element from its untouched copy `o` through f(x, y) -> [x, y] */
function xform(e, o, f){
  if (o.t === 'pen') { const p = new Array(o.pts.length); for (let i = 0; i < p.length; i += 2) { const q = f(o.pts[i], o.pts[i + 1]); p[i] = q[0]; p[i + 1] = q[1]; } e.pts = p; }
  else if (o.t === 'line') { [e.x1, e.y1] = f(o.x1, o.y1); [e.x2, e.y2] = f(o.x2, o.y2); }
  else {
    const bb = bounds(o), a = f(bb.x, bb.y), b = f(bb.x + bb.w, bb.y + bb.h);
    e.x = Math.min(a[0], b[0]); e.y = Math.min(a[1], b[1]);
    if (o.t === 'text') e.size = clamp(o.size * Math.abs(b[1] - a[1]) / Math.max(1, bb.h), 6, 400);
    else { e.w = Math.max(8, Math.abs(b[0] - a[0])); e.h = Math.max(8, Math.abs(b[1] - a[1])); }
  }
}

/* ---------- pictures ---------- */
const imgs = new Map();
function getImg(src){
  let i = imgs.get(src); if (i) return i.complete && i.naturalWidth ? i : null;
  i = new Image(); i.onload = () => B.draw(); i.src = src; imgs.set(src, i); return null;
}

/* ---------- drawing ---------- */
const pathCache = new WeakMap();
function penPath(e){
  const c = pathCache.get(e), a = e.pts; if (c && c.pts === a && c.n === a.length) return c.p;
  const p = new Path2D(), n = a.length / 2; p.moveTo(a[0], a[1]);
  if (n === 1) p.lineTo(a[0] + .01, a[1]);
  else { for (let i = 1; i < n - 1; i++) p.quadraticCurveTo(a[2 * i], a[2 * i + 1], (a[2 * i] + a[2 * i + 2]) / 2, (a[2 * i + 1] + a[2 * i + 3]) / 2); p.lineTo(a[2 * n - 2], a[2 * n - 1]); }
  pathCache.set(e, { pts:a, n:a.length, p }); return p;
}
function dashOf(e){ const w = e.sw || 2; return e.dash === 'dashed' ? [w * 4, w * 3] : e.dash === 'dotted' ? [.1, w * 2.2] : []; }
function rrect(c, x, y, w, h, r){ r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function label(c, e, color){
  if (!e.text) return;
  const pad = 10, lines = wrapLines(e, Math.max(10, e.w - pad * 2)), lh = e.size * 1.25, top = e.y + Math.max(pad, (e.h - lines.length * lh) / 2);
  c.font = fontStr(e); c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'top';
  lines.forEach((l, i) => c.fillText(l, e.x + e.w / 2, top + i * lh + e.size * .08));
}
function drawEl(c, e, o){
  const dark = o.dark; c.save(); c.globalAlpha = (e.op == null ? 1 : e.op) * (o.fade && o.fade.has(e.id) ? .25 : 1);
  c.lineCap = 'round'; c.lineJoin = 'round';
  switch (e.t) {
    case 'pen': c.strokeStyle = ink(e.c, dark); c.lineWidth = e.sw || 3; if (e.hl) c.lineCap = 'butt'; c.stroke(penPath(e)); break;
    case 'line': {
      c.strokeStyle = ink(e.c, dark); c.lineWidth = e.sw || 2; c.setLineDash(dashOf(e)); c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke(); c.setLineDash([]);
      if (e.arrow) { const a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1), s = 10 + (e.sw || 2) * 3; c.beginPath(); c.moveTo(e.x2 - s * Math.cos(a - .5), e.y2 - s * Math.sin(a - .5)); c.lineTo(e.x2, e.y2); c.lineTo(e.x2 - s * Math.cos(a + .5), e.y2 - s * Math.sin(a + .5)); c.stroke(); }
      break;
    }
    case 'rect': case 'ellipse': case 'diamond': {
      c.beginPath();
      if (e.t === 'rect') rrect(c, e.x, e.y, e.w, e.h, 8);
      else if (e.t === 'ellipse') c.ellipse(e.x + e.w / 2, e.y + e.h / 2, Math.abs(e.w / 2), Math.abs(e.h / 2), 0, 0, Math.PI * 2);
      else { c.moveTo(e.x + e.w / 2, e.y); c.lineTo(e.x + e.w, e.y + e.h / 2); c.lineTo(e.x + e.w / 2, e.y + e.h); c.lineTo(e.x, e.y + e.h / 2); c.closePath(); }
      if (e.f) { c.fillStyle = e.f; c.fill(); }
      c.strokeStyle = ink(e.c, dark); c.lineWidth = e.sw || 2; c.setLineDash(dashOf(e)); c.stroke(); c.setLineDash([]);
      if (o.editing !== e.id) label(c, e, e.f ? '#1b1b1f' : ink(e.c, dark));
      break;
    }
    case 'sticky': {
      c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 10 / (o.k || 1); c.shadowOffsetY = 3 / (o.k || 1);
      c.fillStyle = e.c || '#fff59d'; rrect(c, e.x, e.y, e.w, e.h, 6); c.fill(); c.shadowColor = 'transparent';
      if (o.editing !== e.id) label(c, e, '#2b2b2b');
      break;
    }
    case 'text': {
      if (o.editing === e.id) break;
      const m = measure(e); c.font = fontStr(e); c.fillStyle = ink(e.c, dark); c.textAlign = 'left'; c.textBaseline = 'top';
      m.lines.forEach((l, i) => c.fillText(l, e.x, e.y + i * e.size * 1.25 + e.size * .08)); break;
    }
    case 'img': { const i = getImg(e.src); if (i) c.drawImage(i, e.x, e.y, e.w, e.h); else { c.fillStyle = 'rgba(128,128,128,.2)'; c.fillRect(e.x, e.y, e.w, e.h); } break; }
  }
  c.restore();
}
function drawBg(c, p, v, w, h, dark){
  if (p.color) { c.fillStyle = p.color; c.fillRect(0, 0, w, h); }
  if (p.bg === 'plain') return;
  const S = p.bg === 'lines' ? 36 : 28, s = S * v.k; if (s < 7) return;
  c.save(); c.strokeStyle = c.fillStyle = dark ? 'rgba(255,255,255,.17)' : 'rgba(0,0,0,.15)'; c.lineWidth = 1;
  const ox = ((v.tx % s) + s) % s, oy = ((v.ty % s) + s) % s;
  if (p.bg === 'dots') { const r = clamp(s / 22, .9, 1.8); for (let x = ox; x < w; x += s) for (let y = oy; y < h; y += s) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } }
  else { c.beginPath(); if (p.bg === 'grid') for (let x = ox; x < w; x += s) { c.moveTo(Math.round(x) + .5, 0); c.lineTo(Math.round(x) + .5, h); } for (let y = oy; y < h; y += s) { c.moveTo(0, Math.round(y) + .5); c.lineTo(w, Math.round(y) + .5); } c.stroke(); }
  c.restore();
}
function drawEls(c, els, o){
  const v = o.v, vis = o.view;
  els.forEach(e => {
    if (vis) { const b = bounds(e), m = 20 / v.k; if (b.x > vis.x + vis.w + m || b.y > vis.y + vis.h + m || b.x + b.w < vis.x - m || b.y + b.h < vis.y - m) return; }
    drawEl(c, e, o);
  });
}

let raf = 0, cur = null, trail = [], marquee = null, edit = null;
B.draw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); };
function render(){
  const p = window.D && D.doc && D.page(); if (!p) return;
  const v = B.v, dark = pageDark(p);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  drawBg(ctx, p, v, W, H, dark);
  ctx.save(); ctx.translate(v.tx, v.ty); ctx.scale(v.k, v.k);
  const o = { dark, k:v.k, v, view:{ x:-v.tx / v.k, y:-v.ty / v.k, w:W / v.k, h:H / v.k }, editing:edit && edit.id, fade:cur && cur.fade };
  drawEls(ctx, p.els, o);
  if (cur && cur.el && !p.els.includes(cur.el)) drawEl(ctx, cur.el, o);
  ctx.restore();
  // selection
  const sel = selEls();
  if (sel.length && !(cur && (cur.kind === 'draw' || cur.kind === 'shape'))) {
    ctx.save(); ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 1.5; ctx.fillStyle = '#fff';
    const sc = r => ({ x:r.x * v.k + v.tx, y:r.y * v.k + v.ty, w:r.w * v.k, h:r.h * v.k });
    if (sel.length > 1 && sel.length < 80) { ctx.globalAlpha = .45; ctx.setLineDash([3, 3]); sel.forEach(e => { const r = sc(bounds(e)); ctx.strokeRect(r.x, r.y, r.w, r.h); }); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (sel.length === 1 && sel[0].t === 'line') {
      const e = sel[0]; [[e.x1, e.y1], [e.x2, e.y2]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * v.k + v.tx, y * v.k + v.ty, 6, 0, 7); ctx.fill(); ctx.stroke(); });
    } else {
      const r = sc(union(sel)), pad = 5; ctx.setLineDash(sel.length === 1 && sel[0].t !== 'pen' ? [] : [6, 4]); ctx.strokeRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2); ctx.setLineDash([]);
      handlePts(r, pad).forEach(([x, y]) => { ctx.fillRect(x - 5, y - 5, 10, 10); ctx.strokeRect(x - 5, y - 5, 10, 10); });
    }
    ctx.restore();
  }
  if (marquee) { const m = marquee, x = Math.min(m.x0, m.x1) * v.k + v.tx, y = Math.min(m.y0, m.y1) * v.k + v.ty; ctx.save(); ctx.fillStyle = 'rgba(91,141,239,.12)'; ctx.strokeStyle = SEL_COLOR; ctx.lineWidth = 1; ctx.fillRect(x, y, Math.abs(m.x1 - m.x0) * v.k, Math.abs(m.y1 - m.y0) * v.k); ctx.strokeRect(x, y, Math.abs(m.x1 - m.x0) * v.k, Math.abs(m.y1 - m.y0) * v.k); ctx.restore(); }
  if (trail.length) {
    const now = performance.now(); trail = trail.filter(t => now - t.t < 1100);
    if (trail.length) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i], f = 1 - (now - b.t) / 1100; ctx.strokeStyle = `rgba(255,40,40,${Math.max(0, f)})`; ctx.shadowColor = 'rgba(255,40,40,.8)'; ctx.shadowBlur = 8; ctx.lineWidth = 3 + 5 * f; ctx.beginPath(); ctx.moveTo(a.x * v.k + v.tx, a.y * v.k + v.ty); ctx.lineTo(b.x * v.k + v.tx, b.y * v.k + v.ty); ctx.stroke(); }
      const l = trail[trail.length - 1]; if (cur && cur.kind === 'laser') { ctx.fillStyle = '#ff2828'; ctx.beginPath(); ctx.arc(l.x * v.k + v.tx, l.y * v.k + v.ty, 6, 0, 7); ctx.fill(); }
      ctx.restore(); B.draw();
    }
  }
  placeEditor(); placeBar();
}
const handlePts = (r, pad) => [[r.x - pad, r.y - pad, 'nw'], [r.x + r.w + pad, r.y - pad, 'ne'], [r.x + r.w + pad, r.y + r.h + pad, 'se'], [r.x - pad, r.y + r.h + pad, 'sw']];

/* ---------- coordinates & view ---------- */
const rectOf = () => cv.getBoundingClientRect();
const toW = (cx, cy) => { const r = rectOf(); return { x:(cx - r.left - B.v.tx) / B.v.k, y:(cy - r.top - B.v.ty) / B.v.k }; };
B.toWorld = toW;
B.center = () => ({ x:(W / 2 - B.v.tx) / B.v.k, y:(H / 2 - B.v.ty) / B.v.k });
function resize(){
  const r = wrap.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
  const hadSize = W > 50; W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  if (B.pendingCenter && W > 50 && window.D && D.doc) { B.v.tx = W / 2; B.v.ty = H / 2; B.pendingCenter = false; }
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  B.draw();
}
new ResizeObserver(resize).observe(wrap);
B.setView = (patch, keep) => { Object.assign(B.v, patch); B.draw(); B.onView && B.onView(); };
B.zoomAt = (k, sx, sy) => {
  const v = B.v, nk = clamp(k, .08, 8), wx = (sx - v.tx) / v.k, wy = (sy - v.ty) / v.k;
  B.setView({ k:nk, tx:sx - wx * nk, ty:sy - wy * nk });
};
B.zoomBy = f => B.zoomAt(B.v.k * f, W / 2, H / 2);
B.fit = (els) => {
  const list = els || D.page().els, r = union(list), top = H > 300 ? 56 : 0; // keep clear of the tool dock
  if (!r || (r.w < 1 && r.h < 1)) return B.setView({ k:1, tx:W / 2, ty:(H + top) / 2 });
  const pad = clamp(Math.min(W, H) * .1, 16, 70), k = clamp(Math.min((W - pad * 2) / Math.max(r.w, 1), (H - top - pad * 2) / Math.max(r.h, 1)), .08, 2);
  B.setView({ k, tx:W / 2 - (r.x + r.w / 2) * k, ty:(H + top) / 2 - (r.y + r.h / 2) * k });
};
B.loadPage = () => {
  endEdit(); B.sel = []; const p = D.page();
  if (!p.view || typeof p.view.k !== 'number') p.view = { tx:null, ty:null, k:1 };
  if (p.view.tx == null) { p.view.tx = W / 2; p.view.ty = H / 2; B.pendingCenter = W <= 50; }
  B.v = p.view; B.onSelect(); B.draw(); B.onView && B.onView();
};

/* ---------- selection helpers ---------- */
function selEls(){ if (!B.sel.length) return []; const s = new Set(B.sel), list = D.page().els.filter(e => s.has(e.id)); if (list.length !== B.sel.length) B.sel = list.map(e => e.id); return list; }
B.selEls = selEls;
B.select = ids => { B.sel = ids.slice(); B.onSelect(); B.draw(); };
B.selectAll = () => { endEdit(); B.select(D.page().els.map(e => e.id)); };
B.mutate = (fn, keepSel) => { const pre = D.snapshot(); const r = fn(); D.pushUndo(pre); B.changed(); return r; };
B.changed = () => { D.dirty(); B.draw(); B.onChange(); };
B.group = () => { const s = selEls(); return s.length ? elGroup(s[0]) : GROUP[B.tool] || 'shape'; };
B.styleView = () => { const s = selEls(), g = B.group(), d = B.defaults[g] || {}; if (!s.length) return Object.assign({}, d); const e = s[0]; return Object.assign({}, d, { c:e.t === 'sticky' ? d.c : e.c, f:e.f, sw:e.sw, dash:e.dash, op:e.op, size:e.size, font:e.font, sc:e.t === 'sticky' ? e.c : d.sc }); };
B.setStyle = patch => {
  const s = selEls();
  if (s.length) {
    B.mutate(() => s.forEach(e => {
      const ok = k => ({ pen:['c', 'sw', 'op'], line:['c', 'sw', 'dash', 'op'], rect:['c', 'f', 'sw', 'dash', 'op', 'size', 'font'], ellipse:['c', 'f', 'sw', 'dash', 'op', 'size', 'font'], diamond:['c', 'f', 'sw', 'dash', 'op', 'size', 'font'], text:['c', 'size', 'font', 'op'], sticky:['sc', 'size', 'font'], img:['op'] }[e.t] || []).includes(k);
      Object.keys(patch).forEach(k => { if (ok(k)) { if (k === 'sc') e.c = patch.sc; else e[k] = patch[k]; } });
    }));
  }
  const d = B.defaults[B.group()]; if (d) Object.assign(d, patch);
  B.onSelect(); B.draw();
};
B.del = () => { const s = new Set(B.sel); if (!s.size) return; endEdit(); B.mutate(() => { D.page().els = D.page().els.filter(e => !s.has(e.id)); }); B.sel = []; B.onSelect(); };
B.clone = e => { const c = Object.assign({}, e, { id:ONE.uid() }); if (e.pts) c.pts = e.pts.slice(); return c; };
B.shift = (e, dx, dy) => { if (e.t === 'pen') e.pts = e.pts.map((v, i) => v + (i % 2 ? dy : dx)); else if (e.t === 'line') { e.x1 += dx; e.x2 += dx; e.y1 += dy; e.y2 += dy; } else { e.x += dx; e.y += dy; } };
B.dupe = () => { const s = selEls(); if (!s.length) return; const ids = []; B.mutate(() => s.forEach(e => { const c = B.clone(e); B.shift(c, 24, 24); D.page().els.push(c); ids.push(c.id); })); B.select(ids); };
B.nudge = (dx, dy) => { const s = selEls(); if (!s.length) return; clearTimeout(B._nt); if (!B._nudging) { B._nudging = D.snapshot(); } s.forEach(e => B.shift(e, dx, dy)); B.draw(); B._nt = setTimeout(() => { D.pushUndo(B._nudging); B._nudging = null; B.changed(); }, 350); };
B.order = how => {
  const s = new Set(B.sel); if (!s.size) return;
  B.mutate(() => { const a = D.page().els, picked = a.filter(e => s.has(e.id)), rest = a.filter(e => !s.has(e.id));
    if (how === 'front') D.page().els = [...rest, ...picked]; else if (how === 'back') D.page().els = [...picked, ...rest];
    else { const out = a.slice(); const idx = out.map((e, i) => s.has(e.id) ? i : -1).filter(i => i >= 0); if (how === 'forward') for (let j = idx.length - 1; j >= 0; j--) { const i = idx[j]; if (i < out.length - 1 && !s.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]; } else for (const i of idx) if (i > 0 && !s.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]; D.page().els = out; } });
};
B.clear = () => { endEdit(); B.mutate(() => { D.page().els = []; }); B.sel = []; B.onSelect(); };
B.hasInk = () => selEls().some(e => e.t === 'pen' && !e.hl);

/* clipboard (inside oneDraw; the system clipboard is used for pictures and text) */
B.clip = null;
B.copy = () => { const s = selEls(); if (!s.length) return false; B.clip = s.map(B.clone); B.clipStamp = 'oneDraw:' + ONE.uid(); return true; };
B.cut = () => { if (B.copy()) B.del(); };
B.pasteClip = () => {
  if (!B.clip || !B.clip.length) return false; const r = union(B.clip), c = B.center(), dx = c.x - (r.x + r.w / 2), dy = c.y - (r.y + r.h / 2), ids = [];
  B.mutate(() => B.clip.forEach(e => { const n = B.clone(e); B.shift(n, dx, dy); D.page().els.push(n); ids.push(n.id); })); B.select(ids); return true;
};
B.addText = (text, x, y, opt = {}) => {
  const d = B.defaults.text, c = B.center(); const e = Object.assign({ id:ONE.uid(), t:'text', x:x == null ? c.x : x, y:y == null ? c.y : y, text, size:d.size, font:d.font, c:d.c, op:d.op }, opt);
  B.mutate(() => D.page().els.push(e)); B.select([e.id]); return e;
};
B.addImage = (src, nw, nh) => {
  const c = B.center(), mx = Math.min(520, W / B.v.k * .6), s = Math.min(1, mx / nw, (H / B.v.k * .7) / nh), w = nw * s, h = nh * s;
  const e = { id:ONE.uid(), t:'img', x:c.x - w / 2, y:c.y - h / 2, w, h, src, op:1 }; B.mutate(() => D.page().els.push(e)); B.select([e.id]); if (!B.lock) B.setTool('select'); return e;
};
B.loadImageFile = file => new Promise(ok => {
  if (!file || !/^image\//.test(file.type)) return ok(false);
  const url = URL.createObjectURL(file), im = new Image();
  im.onload = () => {
    const max = 1400, sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * sc), h = Math.round(im.naturalHeight * sc), c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), png = file.type === 'image/png' || file.type === 'image/svg+xml' || file.type === 'image/gif'; if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
    g.drawImage(im, 0, 0, w, h); URL.revokeObjectURL(url);
    let src = c.toDataURL(png ? 'image/png' : 'image/jpeg', .82); if (png && src.length > 700000) src = c.toDataURL('image/jpeg', .8);
    B.addImage(src, w, h); ok(true);
  };
  im.onerror = () => { URL.revokeObjectURL(url); ONE.toast('That picture couldn’t be opened.'); ok(false); };
  im.src = url;
});

/* ---------- tools ---------- */
B.setTool = t => {
  if (t === B.tool) return; endEdit(); B.tool = t; if (t !== 'select') { B.sel = []; B.onSelect(); }
  wrap.dataset.tool = t; wrap.classList.toggle('drawing', TOOLS_DRAW.has(t)); B.onTool(t); B.onSelect(); B.draw();
};
const afterShape = () => { if (!B.lock) B.setTool('select'); };

/* ---------- text editing ---------- */
let ta = null;
function startEdit(e, isNew, pre){
  endEdit(); if (!e) return;
  edit = { id:e.id, isNew, pre:pre || D.snapshot(), before:e.text };
  ta = el('textarea', { class:'editor', spellcheck:'false', wrap:'off', 'aria-label':'Text' }); ta.value = e.text || '';
  if (e.t !== 'text') { ta.wrap = 'soft'; ta.classList.add('boxed'); }
  wrap.append(ta); B.sel = [e.id]; B.onSelect();
  ta.addEventListener('input', () => { e.text = ta.value; B.draw(); });
  ta.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); endEdit(); } });
  ta.addEventListener('blur', () => setTimeout(() => { if (edit && ta && document.activeElement !== ta) endEdit(); }, 0));
  ta.addEventListener('pointerdown', ev => ev.stopPropagation());
  B.draw(); setTimeout(() => { if (!ta) return; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); if (!isNew && e.t === 'text') ta.select(); }, 10);
}
function endEdit(){
  if (!edit) return; const t = ta, st = edit, e = D.page().els.find(x => x.id === st.id); edit = null; ta = null; const val = t ? t.value : '';
  if (t) t.remove();
  if (!e) return;
  if (e.t === 'text' && !val.trim()) { D.page().els = D.page().els.filter(x => x !== e); B.sel = []; if (!st.isNew || st.before) D.pushUndo(st.pre); }
  else { e.text = val; if (st.isNew || val !== st.before) D.pushUndo(st.pre); }
  B.changed(); B.onSelect();
}
B.endEdit = endEdit; B.editing = () => !!edit;
function placeEditor(){
  if (!edit || !ta) return; const e = D.page().els.find(x => x.id === edit.id); if (!e) return; const v = B.v, dark = pageDark(D.page());
  ta.style.fontFamily = FONT(e.font); ta.style.fontSize = e.size * v.k + 'px'; ta.style.lineHeight = '1.25';
  if (e.t === 'text') {
    const m = measure(e); ta.style.color = ink(e.c, dark); ta.style.textAlign = 'left';
    Object.assign(ta.style, { left:e.x * v.k + v.tx - 2 + 'px', top:e.y * v.k + v.ty + 'px', width:Math.max(40, m.w * v.k + e.size * v.k * .6) + 'px', height:Math.max(e.size * 1.25 * v.k, m.h * v.k) + 4 + 'px', padding:'0 2px' });
  } else {
    const lines = wrapLines(e, Math.max(10, e.w - 20)), th = Math.max(1, lines.length) * e.size * 1.25, pt = Math.max(10, (e.h - th) / 2);
    ta.style.color = e.t === 'sticky' || e.f ? '#1b1b1f' : ink(e.c, dark); ta.style.textAlign = 'center';
    Object.assign(ta.style, { left:e.x * v.k + v.tx + 'px', top:e.y * v.k + v.ty + 'px', width:e.w * v.k + 'px', height:e.h * v.k + 'px', padding:`${pt * v.k}px ${10 * v.k}px 0` });
  }
}
B.editEl = (e, isNew, pre) => startEdit(e, isNew, pre);
B.editSelected = () => { const s = selEls(); if (s.length === 1 && ['text', 'sticky', 'rect', 'ellipse', 'diamond'].includes(s[0].t)) { startEdit(s[0], false); return true; } return false; };

/* floating action chips above the selection (convert handwriting, duplicate, delete) */
const bar = $('#selbar');
function placeBar(){
  const s = selEls(); if (!s.length || edit || (cur && cur.kind !== 'laser')) { bar.hidden = true; return; }
  const r = union(s), v = B.v, x = (r.x + r.w / 2) * v.k + v.tx, top = r.y * v.k + v.ty - 14, bot = (r.y + r.h) * v.k + v.ty + 54;
  bar.querySelector('[data-act="inkToText"]').hidden = !B.hasInk();
  bar.hidden = false; const bw = bar.offsetWidth || 120; bar.style.left = clamp(x - bw / 2, 6, Math.max(6, W - bw - 6)) + 'px'; bar.style.top = (top - 44 < 4 ? Math.min(H - 50, bot) : top - 44) + 'px';
}

/* ---------- pointer gestures ---------- */
const ptrs = new Map(); let spaceDown = false, lastPen = 0, pinch = null, writeT = 0, writeSet = [];
B.setSpace = on => { spaceDown = on; wrap.classList.toggle('panning', on); };
const snapAngle = (x0, y0, x, y) => { const a = Math.round(Math.atan2(y - y0, x - x0) / (Math.PI / 12)) * (Math.PI / 12), d = Math.hypot(x - x0, y - y0); return [x0 + d * Math.cos(a), y0 + d * Math.sin(a)]; };
function handleAt(e, sel){
  if (!sel.length) return null; const r0 = union(sel), v = B.v;
  if (sel.length === 1 && sel[0].t === 'line') { const l = sel[0], r = rectOf(); for (const [n, x, y] of [['p1', l.x1, l.y1], ['p2', l.x2, l.y2]]) if (Math.hypot(e.clientX - r.left - (x * v.k + v.tx), e.clientY - r.top - (y * v.k + v.ty)) < 14) return n; return null; }
  const r = rectOf(), sc = { x:r0.x * v.k + v.tx, y:r0.y * v.k + v.ty, w:r0.w * v.k, h:r0.h * v.k };
  for (const [x, y, n] of handlePts(sc, 5)) if (Math.abs(e.clientX - r.left - x) < 14 && Math.abs(e.clientY - r.top - y) < 14) return n;
  return null;
}
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'pen') lastPen = Date.now();
  if (edit) endEdit();
  try { cv.setPointerCapture(e.pointerId); } catch {}
  ptrs.set(e.pointerId, { x:e.clientX, y:e.clientY, type:e.pointerType });
  if (ptrs.size === 2) { cancelGesture(); const [a, b] = [...ptrs.values()]; pinch = { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, mx:(a.x + b.x) / 2, my:(a.y + b.y) / 2, v:Object.assign({}, B.v) }; return; }
  if (ptrs.size > 2) return;
  if (e.button === 2) return;
  const panBtn = e.button === 1 || spaceDown || B.tool === 'hand' || (e.pointerType === 'touch' && Date.now() - lastPen < 8000 && TOOLS_DRAW.has(B.tool));
  if (panBtn) { cur = { kind:'pan', sx:e.clientX, sy:e.clientY, v:Object.assign({}, B.v) }; wrap.classList.add('grabbing'); return; }
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  begin(e);
});
function begin(e){
  const p = toW(e.clientX, e.clientY), t = B.tool, page = D.page(), k = B.v.k;
  if (t === 'select') {
    const sel = selEls(), hdl = handleAt(e, sel);
    if (hdl) { const r0 = union(sel); cur = { kind:'resize', h:hdl, pre:D.snapshot(), r0, origs:sel.map(x => [x, Object.assign({}, x)]), uniform:e.shiftKey || sel.some(x => x.t === 'text' || x.t === 'img') }; return; }
    const hitEl = topAt(p.x, p.y, 6 / k);
    if (hitEl) {
      if (e.shiftKey) { B.sel = B.sel.includes(hitEl.id) ? B.sel.filter(i => i !== hitEl.id) : [...B.sel, hitEl.id]; B.onSelect(); }
      else if (!B.sel.includes(hitEl.id)) { B.sel = [hitEl.id]; B.onSelect(); }
      const s2 = selEls(); cur = { kind:'move', x0:p.x, y0:p.y, pre:D.snapshot(), origs:s2.map(x => [x, Object.assign({}, x)]), moved:false, cx:e.clientX, cy:e.clientY }; B.draw(); return;
    }
    if (!e.shiftKey) { B.sel = []; B.onSelect(); }
    cur = { kind:'marquee', base:e.shiftKey ? B.sel.slice() : [] }; marquee = { x0:p.x, y0:p.y, x1:p.x, y1:p.y }; B.draw(); return;
  }
  if (t === 'pen' || t === 'write' || t === 'hl') {
    if (t === 'write') { clearTimeout(writeT); if (!window.INK || !INK.ready()) { /* consent is asked when it first converts */ } }
    const d = B.defaults[t === 'hl' ? 'hl' : 'pen'], el1 = { id:ONE.uid(), t:'pen', pts:[p.x, p.y], c:d.c, sw:d.sw, op:d.op };
    if (t === 'hl') el1.hl = true; if (t === 'write') el1._w = true;
    cur = { kind:'draw', el:el1, pre:D.snapshot(), lx:p.x, ly:p.y }; B.sel = []; B.onSelect(); B.draw(); return;
  }
  if (t === 'eraser') { cur = { kind:'erase', pre:D.snapshot(), fade:new Set() }; eraseAt(p); B.draw(); return; }
  if (t === 'laser') { cur = { kind:'laser' }; trail.push({ x:p.x, y:p.y, t:performance.now() }); B.draw(); return; }
  if (t === 'line' || t === 'arrow' || t === 'rect' || t === 'ellipse' || t === 'diamond') {
    const d = B.defaults.shape; let el1;
    if (t === 'line' || t === 'arrow') el1 = { id:ONE.uid(), t:'line', x1:p.x, y1:p.y, x2:p.x, y2:p.y, arrow:t === 'arrow', c:d.c, sw:d.sw, dash:d.dash, op:d.op };
    else el1 = { id:ONE.uid(), t, x:p.x, y:p.y, w:0, h:0, c:d.c, f:d.f, sw:d.sw, dash:d.dash, op:d.op, size:20, font:'sans' };
    cur = { kind:'shape', el:el1, x0:p.x, y0:p.y, pre:D.snapshot() }; B.sel = []; B.onSelect(); B.draw(); return;
  }
  if (t === 'text') {
    const hitEl = topAt(p.x, p.y, 6 / k);
    if (hitEl && ['text', 'sticky', 'rect', 'ellipse', 'diamond'].includes(hitEl.t)) { startEdit(hitEl, false); return; }
    const d = B.defaults.text, pre = D.snapshot(), el1 = { id:ONE.uid(), t:'text', x:p.x, y:p.y - d.size * .5, text:'', size:d.size, font:d.font, c:d.c, op:d.op };
    page.els.push(el1); startEdit(el1, true, pre); return;
  }
  if (t === 'sticky') {
    const d = B.defaults.sticky, pre = D.snapshot(), el1 = { id:ONE.uid(), t:'sticky', x:p.x - 100, y:p.y - 85, w:200, h:170, text:'', c:d.sc, size:d.size, font:d.font, op:1 };
    page.els.push(el1); B.setTool('select'); startEdit(el1, true, pre); return;
  }
}
function eraseAt(p){
  const els = D.page().els, tol = 7 / B.v.k;
  for (let i = els.length - 1; i >= 0; i--) { const e = els[i]; if (cur.fade.has(e.id)) continue; if (e.t === 'img' || e.t === 'sticky' ? hitBox(e, p, tol) : hit(e, p.x, p.y, tol)) cur.fade.add(e.id); }
}
const hitBox = (e, p, tol) => p.x >= e.x - tol && p.y >= e.y - tol && p.x <= e.x + e.w + tol && p.y <= e.y + e.h + tol;
cv.addEventListener('pointermove', e => {
  const pt = ptrs.get(e.pointerId); if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = rectOf(), k = clamp(pinch.v.k * d / pinch.d, .08, 8);
    const wx = (pinch.mx - r.left - pinch.v.tx) / pinch.v.k, wy = (pinch.my - r.top - pinch.v.ty) / pinch.v.k;
    B.setView({ k, tx:mx - r.left - wx * k, ty:my - r.top - wy * k }); return;
  }
  if (!cur) return;
  const evs = cur.kind === 'draw' && e.getCoalescedEvents ? (e.getCoalescedEvents().length ? e.getCoalescedEvents() : [e]) : [e];
  for (const ev of evs) step(ev, e);
  B.draw();
});
function step(ev, e){
  const p = toW(ev.clientX, ev.clientY), k = B.v.k;
  switch (cur.kind) {
    case 'pan': B.setView({ tx:cur.v.tx + ev.clientX - cur.sx, ty:cur.v.ty + ev.clientY - cur.sy }); break;
    case 'draw': { if (Math.hypot(p.x - cur.lx, p.y - cur.ly) * k < 1.6) break; cur.el.pts.push(p.x, p.y); cur.lx = p.x; cur.ly = p.y; break; }
    case 'erase': eraseAt(p); break;
    case 'laser': trail.push({ x:p.x, y:p.y, t:performance.now() }); break;
    case 'marquee': {
      marquee.x1 = p.x; marquee.y1 = p.y; const r = { x:Math.min(marquee.x0, marquee.x1), y:Math.min(marquee.y0, marquee.y1), w:Math.abs(marquee.x1 - marquee.x0), h:Math.abs(marquee.y1 - marquee.y0) };
      B.sel = [...new Set([...cur.base, ...D.page().els.filter(x => inside(bounds(x), r)).map(x => x.id)])]; B.onSelect(); break;
    }
    case 'move': {
      if (!cur.moved && Math.hypot(ev.clientX - cur.cx, ev.clientY - cur.cy) < 3) break; cur.moved = true;
      let dx = p.x - cur.x0, dy = p.y - cur.y0; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      cur.origs.forEach(([x, o]) => xform(x, o, (a, b) => [a + dx, b + dy])); break;
    }
    case 'resize': {
      const h = cur.h, r0 = cur.r0;
      if (h === 'p1' || h === 'p2') { const l = cur.origs[0][0]; let x = p.x, y = p.y; const ox = h === 'p1' ? l.x2 : l.x1, oy = h === 'p1' ? l.y2 : l.y1; if (e.shiftKey) [x, y] = snapAngle(ox, oy, x, y); if (h === 'p1') { l.x1 = x; l.y1 = y; } else { l.x2 = x; l.y2 = y; } break; }
      const ax = h.includes('w') ? r0.x + r0.w : r0.x, ay = h.includes('n') ? r0.y + r0.h : r0.y, cx = h.includes('w') ? r0.x : r0.x + r0.w, cy = h.includes('n') ? r0.y : r0.y + r0.h;
      let sx = (p.x - ax) / ((cx - ax) || 1), sy = (p.y - ay) / ((cy - ay) || 1);
      if (cur.uniform) { const s = Math.abs(sx) > Math.abs(sy) ? sx : sy; sx = sy = s; }
      const fix = s => Math.abs(s) < .02 ? (s < 0 ? -.02 : .02) : s; sx = fix(sx); sy = fix(sy);
      cur.origs.forEach(([x, o]) => xform(x, o, (a, b) => [ax + (a - ax) * sx, ay + (b - ay) * sy])); break;
    }
    case 'shape': {
      const s = cur.el, x0 = cur.x0, y0 = cur.y0; let x = p.x, y = p.y;
      if (s.t === 'line') { if (e.shiftKey) [x, y] = snapAngle(x0, y0, x, y); s.x2 = x; s.y2 = y; }
      else { let w = x - x0, h = y - y0; if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; } if (e.altKey) { s.x = x0 - Math.abs(w); s.y = y0 - Math.abs(h); s.w = Math.abs(w) * 2; s.h = Math.abs(h) * 2; } else { s.x = Math.min(x0, x0 + w); s.y = Math.min(y0, y0 + h); s.w = Math.abs(w); s.h = Math.abs(h); } }
      break;
    }
  }
}
function cancelGesture(){
  if (cur && cur.kind === 'move') cur.origs.forEach(([x, o]) => Object.assign(x, o));
  if (cur && (cur.kind === 'resize')) cur.origs.forEach(([x, o]) => Object.assign(x, o));
  cur = null; marquee = null; wrap.classList.remove('grabbing'); B.draw();
}
const finish = e => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (!cur) return; const c = cur; cur = null; wrap.classList.remove('grabbing');
  const page = D.page();
  switch (c.kind) {
    case 'draw': {
      page.els.push(c.el); D.pushUndo(c.pre); B.changed();
      if (c.el._w) { writeSet.push(c.el.id); clearTimeout(writeT); writeT = setTimeout(() => { const ids = writeSet.slice(); writeSet = []; B.onInk(ids); }, 1700); }
      break;
    }
    case 'erase': { if (c.fade.size) { page.els = page.els.filter(x => !c.fade.has(x.id)); D.pushUndo(c.pre); B.changed(); } break; }
    case 'marquee': marquee = null; break;
    case 'move': case 'resize': {
      if (c.kind === 'resize' || c.moved) { c.origs.forEach(([x]) => { if (x.t === 'text') x.size = Math.round(x.size * 2) / 2; }); D.pushUndo(c.pre); B.changed(); }
      break;
    }
    case 'shape': {
      const s = c.el; let ok = true;
      if (s.t === 'line') { if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * B.v.k < 6) ok = false; }
      else if (s.w * B.v.k < 6 && s.h * B.v.k < 6) { const w = s.t === 'diamond' ? 170 : 160, h = s.t === 'diamond' ? 110 : 100; s.x = c.x0 - w / 2; s.y = c.y0 - h / 2; s.w = w; s.h = h; }
      if (ok) { page.els.push(s); D.pushUndo(c.pre); B.sel = [s.id]; B.changed(); B.onSelect(); afterShape(); }
      break;
    }
  }
  B.draw();
};
cv.addEventListener('pointerup', finish);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (cur && cur.kind === 'draw') { cur = null; B.draw(); } else if (cur) cancelGesture(); });
cv.addEventListener('lostpointercapture', e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; });
cv.addEventListener('dblclick', e => {
  if (B.tool !== 'select') return; const p = toW(e.clientX, e.clientY), hitEl = topAt(p.x, p.y, 6 / B.v.k);
  if (hitEl && ['text', 'sticky', 'rect', 'ellipse', 'diamond'].includes(hitEl.t)) return startEdit(hitEl, false);
  if (!hitEl) { const d = B.defaults.text, pre = D.snapshot(), t = { id:ONE.uid(), t:'text', x:p.x, y:p.y - d.size * .5, text:'', size:d.size, font:d.font, c:d.c, op:d.op }; D.page().els.push(t); startEdit(t, true, pre); }
});
cv.addEventListener('contextmenu', e => {
  e.preventDefault(); if (cur) return; const p = toW(e.clientX, e.clientY), hitEl = topAt(p.x, p.y, 6 / B.v.k);
  if (hitEl && !B.sel.includes(hitEl.id)) { B.select([hitEl.id]); }
  B.onContext({ x:e.clientX, y:e.clientY }, !!hitEl || B.sel.length > 0, p);
});
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = rectOf();
  if (e.ctrlKey || e.metaKey) B.zoomAt(B.v.k * Math.exp(-e.deltaY * (e.deltaMode ? .05 : .01)), e.clientX - r.left, e.clientY - r.top);
  else B.setView({ tx:B.v.tx - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), ty:B.v.ty - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) });
}, { passive:false });
// dropping pictures on the board
wrap.addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); wrap.classList.add('dropping'); } });
wrap.addEventListener('dragleave', () => wrap.classList.remove('dropping'));
wrap.addEventListener('drop', e => { wrap.classList.remove('dropping'); const f = [...(e.dataTransfer.files || [])].filter(x => /^image\//.test(x.type)); if (!f.length) return; e.preventDefault(); f.forEach(B.loadImageFile); });

/* ---------- rendering to other canvases: thumbnails and pictures ---------- */
function paint(c, p, w, h, o){
  const dark = pageDark(p), els = p.els;
  c.save(); c.fillStyle = B.pageBg(p); c.fillRect(0, 0, w, h);
  const r = union(els); let k = 1, tx = w / 2, ty = h / 2;
  if (r) { const pad = o.pad == null ? 14 : o.pad; k = Math.min((w - pad * 2) / Math.max(r.w, 1), (h - pad * 2) / Math.max(r.h, 1)); if (o.maxK) k = Math.min(k, o.maxK); tx = w / 2 - (r.x + r.w / 2) * k; ty = h / 2 - (r.y + r.h / 2) * k; }
  c.translate(tx, ty); c.scale(k, k); const op = { dark, k, v:{ tx, ty, k } }; els.forEach(e => drawEl(c, e, op)); c.restore();
}
B.thumbCanvas = (p, w, h) => { const c = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1); c.width = w * d; c.height = h * d; const g = c.getContext('2d'); g.scale(d, d); paint(g, p, w, h, { maxK:1.2 }); return c; };
B.thumbURL = (p, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; paint(c.getContext('2d'), p, w, h, { maxK:1.2 }); return c.toDataURL('image/jpeg', .7); };
B.exportCanvas = (p, scale = 2, pad = 40) => {
  const r = union(p.els) || { x:0, y:0, w:800, h:500 }; let w = r.w + pad * 2, h = r.h + pad * 2; const s = Math.min(scale, 8192 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s)); const g = c.getContext('2d');
  g.fillStyle = B.pageBg(p); g.fillRect(0, 0, c.width, c.height); g.scale(s, s); g.translate(pad - r.x, pad - r.y); const op = { dark:pageDark(p), k:s, v:{ k:s } }; p.els.forEach(e => drawEl(g, e, op)); return c;
};
/* just the chosen strokes, black on white, for the handwriting reader */
B.strokesImage = els => {
  const r = union(els), pad = 28, maxSide = 1500, s = Math.min(3, maxSide / Math.max(r.w + pad * 2, r.h + pad * 2)), minSw = 3.2 / s;
  const c = document.createElement('canvas'); c.width = Math.max(64, Math.round((r.w + pad * 2) * s)); c.height = Math.max(64, Math.round((r.h + pad * 2) * s)); const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.scale(s, s); g.translate(pad - r.x, pad - r.y);
  els.forEach(e => { const q = Object.assign({}, e, { c:'#000', op:1, sw:Math.max(e.sw || 3, minSw) }); drawEl(g, q, { dark:false, k:s, v:{ k:s } }); });
  return { url:c.toDataURL('image/png'), box:r };
};
B.bounds = bounds; B.union = union;
B.themeChanged = () => B.draw();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', B.themeChanged);
new MutationObserver(B.themeChanged).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme', 'style'] });
if (document.fonts) { ['Caveat', 'EB Garamond', 'Roboto Mono'].forEach(f => document.fonts.load(`24px "${f}"`).then(() => B.draw(), () => {})); document.fonts.ready.then(B.draw); }
resize();
})();
