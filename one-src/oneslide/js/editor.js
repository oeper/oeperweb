/* oneSlide — editor: stage, thumbnails, selection, drag/resize/rotate with smart guides, text editing, format pane, clipboard */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const stage = $('#stage'), wrap = $('#stagewrap'), sizer = $('#stagesizer'), pane = $('#slidesPane'), notes = $('#notes');
S.sel = []; S.editing = null; S.zoom = 'fit'; S.k = 1;
const byId = id => S.slide().els.find(e => e.id === id);
S.byId = byId;
S.selEls = () => S.sel.map(byId).filter(Boolean);

/* ---------- stage ---------- */
S.fit = () => {
  const W = S.W(), H = S.H(), aw = wrap.clientWidth - 56, ah = wrap.clientHeight - 48;
  S.k = S.zoom === 'fit' ? Math.max(.1, Math.min(aw / W, ah / H)) : S.zoom;
  stage.style.width = W + 'px'; stage.style.height = H + 'px'; stage.style.transform = `scale(${S.k})`; stage.style.setProperty('--k', S.k);
  sizer.style.width = W * S.k + 'px'; sizer.style.height = H * S.k + 'px';
  $('#zoomPct').textContent = Math.round(S.k * 100) + '%'; $('#zoomRange').value = Math.round(S.k * 100);
};
new ResizeObserver(() => S.fit()).observe(wrap);
S.renderStage = () => {
  const s = S.slide(); if (!s) return;
  const old = $('.slide', stage), fresh = S.renderSlide(s);
  if (old) old.replaceWith(fresh); else stage.prepend(fresh);
  if (S.editing) { const n = fresh.querySelector(`.el[data-id="${S.editing.id}"] .txi`); if (n) { S.editing = null; } }
  S.renderSel(); S.fit();
};
S.renderSel = () => {
  const layer = $('#selLayer'); layer.innerHTML = '';
  const els = S.selEls();
  els.forEach(e => {
    const b = el('div', { class:'selbox' + (els.length === 1 ? ' single' : '') + (S.editing && S.editing.id === e.id ? ' editing' : ''), 'data-id':e.id, style:{ left:e.x + 'px', top:e.y + 'px', width:e.w + 'px', height:e.h + 'px', transform:e.rot ? `rotate(${e.rot}deg)` : '' } });
    if (els.length === 1 && !(S.editing && S.editing.id === e.id)) { ['nw','n','ne','e','se','s','sw','w'].forEach(h => { if (S.isLine(e.shape) && !['e','w'].includes(h)) return; b.append(el('i', { class:'hdl h-' + h, 'data-h':h })); }); if (!S.isLine(e.shape)) b.append(el('i', { class:'hdl rot', 'data-h':'rot', html:ONE.icon('rotate_right') })); }
    layer.append(b);
  });
  ONE.ribbon.setContext('shape', els.length > 0 && els.every(e => e.type === 'text' || e.type === 'shape' || e.type === 'icon'));
  ONE.ribbon.setContext('picture', els.length === 1 && els[0].type === 'image');
  ONE.ribbon.setContext('table', els.length === 1 && els[0].type === 'table');
  ONE.ribbon.setContext('chart', els.length === 1 && els[0].type === 'chart');
  ONE.ribbon.refresh(); S.syncFmt(); S.updateBars && S.updateBars();
};

/* ---------- thumbnails ---------- */
S.renderThumbs = () => {
  const keep = pane.scrollTop; pane.innerHTML = '';
  S.deck.slides.forEach((s, i) => {
    const it = el('div', { class:'sthumb' + (i === S.cur ? ' active' : '') + (s.hidden ? ' hidden-slide' : ''), draggable:'true', 'data-i':i, tabindex:0, 'aria-label':`Slide ${i + 1}` },
      el('span', { class:'snum', html:`${i + 1}${s.transition && s.transition.type !== 'none' ? '<i class="ms tr">auto_awesome</i>' : ''}` }), S.thumb(s, 178));
    it.onclick = () => S.goto(i);
    it.oncontextmenu = e => { e.preventDefault(); S.goto(i); S.slideMenu({ x:e.clientX, y:e.clientY }); };
    it.ondragstart = e => { e.dataTransfer.setData('text/plain', String(i)); it.classList.add('dragging'); };
    it.ondragend = () => it.classList.remove('dragging');
    it.ondragover = e => { e.preventDefault(); const r = it.getBoundingClientRect(); it.classList.toggle('drop-before', e.clientY < r.top + r.height / 2); it.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2); };
    it.ondragleave = () => it.classList.remove('drop-before', 'drop-after');
    it.ondrop = e => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); let to = i + (it.classList.contains('drop-after') ? 1 : 0); it.classList.remove('drop-before', 'drop-after'); if (from < to) to--; if (from === to) return; const [m] = S.deck.slides.splice(from, 1); S.deck.slides.splice(to, 0, m); S.cur = to; S.changed(); };
    pane.append(it);
  });
  pane.append(el('button', { class:'addslide', html:`${icon('add')}<span>New slide</span>`, onclick:() => S.addSlide() }));
  pane.scrollTop = keep;
  const a = pane.querySelector('.sthumb.active'); a && a.scrollIntoView({ block:'nearest' });
};
let thumbT; S.refreshThumb = () => { clearTimeout(thumbT); thumbT = setTimeout(() => { const it = pane.querySelector(`.sthumb[data-i="${S.cur}"]`); if (!it) return; it.querySelector('.thumbwrap').replaceWith(S.thumb(S.slide(), 178)); }, 250); };
pane.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.goto(ONE.clamp(S.cur + (e.key === 'ArrowDown' ? 1 : -1), 0, S.deck.slides.length - 1)); pane.querySelector('.sthumb.active').focus(); } if (e.key === 'Delete') S.deleteSlide(); if (e.key === 'Enter') S.addSlide(); });
S.goto = i => { S.commitText(); S.cur = ONE.clamp(i, 0, S.deck.slides.length - 1); S.sel = []; S.refresh(); };
S.addSlide = (layout, at) => { S.commitText(); const cur = S.slide(); const L = layout || (cur && cur.layout === 'title' ? 'content' : cur ? cur.layout : 'content'); const s = S.newSlide(L === 'blank' || !S.LAYOUTS[L] ? L === 'blank' ? 'blank' : 'content' : L); if (cur) s.transition = { ...cur.transition }; S.deck.slides.splice(at ?? S.cur + 1, 0, s); S.cur = at ?? S.cur + 1; S.sel = []; S.changed(); };
S.dupSlide = () => { S.commitText(); const c = JSON.parse(JSON.stringify(S.slide())); c.id = S.newId(); c.els.forEach(e => e.id = S.newId()); S.deck.slides.splice(S.cur + 1, 0, c); S.cur++; S.changed(); ONE.toast('Slide duplicated. Move things on the copy and use the Morph transition to animate between them.'); };
S.deleteSlide = () => { if (S.deck.slides.length === 1) return ONE.toast('A presentation needs at least one slide.'); S.deck.slides.splice(S.cur, 1); S.cur = Math.min(S.cur, S.deck.slides.length - 1); S.sel = []; S.changed(); };
S.slideMenu = at => ONE.menuAt(at, [{ label:'New Slide', icon:'add', kbd:'Ctrl+M', on:() => S.addSlide() }, { label:'Duplicate Slide', icon:'content_copy', kbd:'Ctrl+D', on:S.dupSlide }, { label:'Delete Slide', icon:'delete', on:S.deleteSlide }, '-',
  { label:'Layout', icon:'dashboard', on:() => S.pops.layout(at) }, { label:'Format Background…', icon:'format_color_fill', on:() => S.act.formatBg() },
  { label:S.slide().hidden ? 'Unhide Slide' : 'Hide Slide', icon:'visibility_off', on:() => { S.slide().hidden = !S.slide().hidden; S.changed(); } },
  { label:'Move Up', icon:'arrow_upward', disabled:S.cur === 0, on:() => { const [m] = S.deck.slides.splice(S.cur, 1); S.deck.slides.splice(--S.cur, 0, m); S.changed(); } }, { label:'Move Down', icon:'arrow_downward', disabled:S.cur === S.deck.slides.length - 1, on:() => { const [m] = S.deck.slides.splice(S.cur, 1); S.deck.slides.splice(++S.cur, 0, m); S.changed(); } }]);

/* ---------- notes ---------- */
notes.addEventListener('input', () => { S.slide().notes = notes.value; S.dirty(); });
notes.addEventListener('change', () => S.record());

/* ---------- geometry ---------- */
const toSlide = e => { const r = stage.getBoundingClientRect(); return { x:(e.clientX - r.left) / S.k, y:(e.clientY - r.top) / S.k }; };
S.toSlide = toSlide;
const bbox = els => { const xs = els.flatMap(e => [e.x, e.x + e.w]), ys = els.flatMap(e => [e.y, e.y + e.h]); return { x:Math.min(...xs), y:Math.min(...ys), w:Math.max(...xs) - Math.min(...xs), h:Math.max(...ys) - Math.min(...ys) }; };
S.bbox = bbox;

/* smart guides */
const guides = $('#guides');
const showGuides = (vx, hy) => { guides.innerHTML = ''; vx.forEach(x => guides.append(el('i', { class:'guide v', style:{ left:x + 'px' } }))); hy.forEach(y => guides.append(el('i', { class:'guide h', style:{ top:y + 'px' } }))); };
const snapMove = (b, others) => {
  const T = 7 / S.k, W = S.W(), H = S.H();
  const xs = [0, W / 2, W, ...others.flatMap(o => [o.x, o.x + o.w / 2, o.x + o.w])], ys = [0, H / 2, H, ...others.flatMap(o => [o.y, o.y + o.h / 2, o.y + o.h])];
  let dx = 0, dy = 0, gx = [], gy = [], best = T;
  for (const [edge, off] of [[b.x, 0], [b.x + b.w / 2, b.w / 2], [b.x + b.w, b.w]]) for (const x of xs) { const d = Math.abs(edge - x); if (d < best) { best = d; dx = x - edge; gx = [x]; } }
  best = T;
  for (const [edge] of [[b.y], [b.y + b.h / 2], [b.y + b.h]]) for (const y of ys) { const d = Math.abs(edge - y); if (d < best) { best = d; dy = y - edge; gy = [y]; } }
  return { dx, dy, gx, gy };
};

/* ---------- pointer interactions ---------- */
let drag = null;
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const h = e.target.closest('.hdl'), elNode = e.target.closest('.el'), editingNode = S.editing && e.target.closest('.txi[contenteditable="true"]');
  if (editingNode) return;
  if (S.editing) S.commitText();
  const p = toSlide(e);
  if (h) { e.preventDefault(); const t = byId(h.closest('.selbox').dataset.id); drag = { kind:h.dataset.h === 'rot' ? 'rot' : 'resize', h:h.dataset.h, e:t, o:{ ...t }, p0:p, aspect:t.type === 'image' || t.type === 'icon' }; stage.setPointerCapture(e.pointerId); return; }
  if (elNode && !elNode.closest('.selbox')) {
    const id = elNode.dataset.id;
    const grp = S.groupOf ? S.groupOf(id) : [id];
    if (e.shiftKey || e.ctrlKey) { S.sel = S.sel.includes(id) ? S.sel.filter(x => !grp.includes(x)) : [...new Set([...S.sel, ...grp])]; }
    else if (!S.sel.includes(id)) S.sel = grp;
    S.renderSel();
    e.preventDefault(); drag = { kind:'move', p0:p, start:S.selEls().map(x => ({ id:x.id, x:x.x, y:x.y })), moved:false, alt:e.altKey };
    stage.setPointerCapture(e.pointerId); return;
  }
  const sb = e.target.closest('.selbox');
  if (sb) { e.preventDefault(); drag = { kind:'move', p0:p, start:S.selEls().map(x => ({ id:x.id, x:x.x, y:x.y })), moved:false }; stage.setPointerCapture(e.pointerId); return; }
  S.sel = []; S.renderSel(); drag = { kind:'marquee', p0:p }; stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', e => {
  if (!drag) return; const p = toSlide(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
  if (drag.kind === 'move') {
    if (!drag.moved && Math.hypot(dx, dy) * S.k < 3) return;
    if (!drag.moved && drag.alt) { const copies = S.selEls().map(x => { const c = JSON.parse(JSON.stringify(x)); c.id = S.newId(); c.mid = S.newId(); S.slide().els.push(c); return c; }); S.sel = copies.map(c => c.id); drag.start = copies.map(x => ({ id:x.id, x:x.x, y:x.y })); }
    drag.moved = true;
    const els = S.selEls(); drag.start.forEach(s0 => { const x = byId(s0.id); x.x = s0.x + dx; x.y = s0.y + dy; });
    if (!e.altKey || drag.alt) { const b = bbox(els), others = S.slide().els.filter(o => !S.sel.includes(o.id)); const sn = snapMove(b, others); els.forEach(x => { x.x += sn.dx; x.y += sn.dy; }); showGuides(sn.gx, sn.gy); }
    els.forEach(x => { const n = stage.querySelector(`.slide .el[data-id="${x.id}"]`); if (n) { n.style.left = x.x + 'px'; n.style.top = x.y + 'px'; } const sbx = stage.querySelector(`.selbox[data-id="${x.id}"]`); if (sbx) { sbx.style.left = x.x + 'px'; sbx.style.top = x.y + 'px'; } });
    S.updateBars && S.updateBars();
  } else if (drag.kind === 'resize') {
    const o = drag.o, t = drag.e, hh = drag.h; let { x, y, w, h } = o;
    const rad = (o.rot || 0) * Math.PI / 180, cos = Math.cos(-rad), sin = Math.sin(-rad), ldx = dx * cos - dy * sin, ldy = dx * sin + dy * cos;
    if (hh.includes('e')) w = o.w + ldx; if (hh.includes('w')) { w = o.w - ldx; x = o.x + ldx; } if (hh.includes('s')) h = o.h + ldy; if (hh.includes('n')) { h = o.h - ldy; y = o.y + ldy; }
    if ((drag.aspect || e.shiftKey) && hh.length === 2) { const r = o.w / o.h; if (w / h > r) { const nw = h * r; if (hh.includes('w')) x += w - nw; w = nw; } else { const nh = w / r; if (hh.includes('n')) y += h - nh; h = nh; } }
    if (w < 8) { if (hh.includes('w')) x -= 8 - w; w = 8; } if (h < 8) { if (hh.includes('n')) y -= 8 - h; h = 8; }
    if (!o.rot) { const sn = snapMove({ x, y, w, h }, S.slide().els.filter(q => q.id !== t.id)); if (hh.includes('e') && Math.abs(sn.dx) > 0 && sn.gx.length) { w += sn.dx; } if (hh.includes('s') && sn.gy.length) { h += sn.dy; } showGuides(hh.includes('e') ? sn.gx : [], hh.includes('s') ? sn.gy : []); }
    Object.assign(t, { x, y, w, h }); S.renderStage();
  } else if (drag.kind === 'rot') {
    const t = drag.e, c = { x:t.x + t.w / 2, y:t.y + t.h / 2 }; let a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
    a = e.shiftKey ? Math.round(a / 15) * 15 : (Math.abs(((a % 90) + 90) % 90) < 3 || Math.abs(((a % 90) + 90) % 90) > 87 ? Math.round(a / 90) * 90 : a);
    t.rot = Math.round(((a % 360) + 360) % 360); S.renderStage();
  } else if (drag.kind === 'marquee') {
    const x = Math.min(p.x, drag.p0.x), y = Math.min(p.y, drag.p0.y), w = Math.abs(dx), h = Math.abs(dy);
    let m = $('#marquee'); if (!m) { m = el('div', { id:'marquee', class:'marquee' }); stage.append(m); } Object.assign(m.style, { left:x + 'px', top:y + 'px', width:w + 'px', height:h + 'px' });
    drag.box = { x, y, w, h };
  }
});
stage.addEventListener('pointerup', () => {
  if (!drag) return; const d = drag; drag = null; guides.innerHTML = '';
  if (d.kind === 'marquee') { const m = $('#marquee'); m && m.remove(); if (d.box && d.box.w > 4) { const b = d.box; S.sel = S.slide().els.filter(e => e.x >= b.x && e.y >= b.y && e.x + e.w <= b.x + b.w && e.y + e.h <= b.y + b.h).map(e => e.id); S.renderSel(); } return; }
  if (d.kind === 'move' && !d.moved) return;
  S.changed();
});
stage.addEventListener('dblclick', e => { const n = e.target.closest('.el'); if (n) { const t = byId(n.dataset.id); if (t && t.type === 'table') return S.editTable(t); if (t && t.type === 'chart') return S.editChart(t); if (t && t.type === 'image') return S.act.formatPane(); S.editText(n.dataset.id, e); } });

/* ---------- text editing ---------- */
S.editText = (id, ev, selectAll) => {
  const t = byId(id); if (!t || !(t.type === 'text' || (t.type === 'shape' && !S.isLine(t.shape)))) return;
  S.sel = [id]; S.renderSel();
  const node = stage.querySelector(`.slide .el[data-id="${id}"] .txi`); if (!node) return;
  node.removeAttribute('data-prompt'); node.contentEditable = 'true'; node.spellcheck = true;
  S.editing = { id, node }; $('#selLayer').querySelector('.selbox') && $('#selLayer').querySelector('.selbox').classList.add('editing');
  $$('.hdl', $('#selLayer')).forEach(h => h.remove());
  node.focus();
  const s = getSelection();
  if (selectAll || !ev) { const r = document.createRange(); r.selectNodeContents(node); if (!selectAll) r.collapse(false); s.removeAllRanges(); s.addRange(r); }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (r && node.contains(r.startContainer)) { s.removeAllRanges(); s.addRange(r); } }
  node.addEventListener('input', onInput);
  ONE.ribbon.refresh();
};
function onInput(){ if (!S.editing) return; const t = byId(S.editing.id); if (t) { t.html = S.editing.node.innerHTML === '<br>' ? '' : S.editing.node.innerHTML; S.dirty(); S.refreshThumb(); } }
S.commitText = () => {
  if (!S.editing) return; const { id, node } = S.editing; node.removeEventListener('input', onInput); node.contentEditable = 'false';
  const t = byId(id); if (t) { const html = node.innerHTML.replace(/^(<br>)+$/, ''); t.html = node.textContent.trim() || node.querySelector('img') ? html : ''; }
  S.editing = null; getSelection().removeAllRanges(); S.changed();
};
S.execText = (cmd, val) => { if (!S.editing) return false; S.editing.node.focus(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); onInput(); return true; };
S.applyStyle = (patch, textCmd) => {
  if (S.editing && textCmd) { const s = getSelection(); if (s.rangeCount && !s.isCollapsed && S.editing.node.contains(s.anchorNode)) { S.execText(...textCmd); return; } }
  const els = S.editing ? [byId(S.editing.id)] : S.selEls(); if (!els.length) return ONE.toast('Select a text box or shape first.');
  S.commitText(); els.forEach(e => { e.style = Object.assign({}, e.style, patch); Object.keys(e.style).forEach(k => e.style[k] == null && delete e.style[k]); }); S.changed();
};
S.curStyle = () => { const e = S.editing ? byId(S.editing.id) : S.selEls()[0]; return e ? (e.style || {}) : {}; };

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (ONE.topModal() || ONE.backstage.isOpen() || S.showing) return;
  const tgt = e.target, inField = tgt.matches('input,textarea,select') || (tgt.isContentEditable && !(S.editing && S.editing.node === tgt));
  if (inField) return;
  const mod = e.ctrlKey || e.metaKey;
  if (S.editing) {
    if (e.key === 'Escape') { e.preventDefault(); const id = S.editing.id; S.commitText(); S.sel = [id]; S.renderSel(); }
    else if (mod && ['b','i','u'].includes(e.key.toLowerCase())) { e.preventDefault(); S.execText({ b:'bold', i:'italic', u:'underline' }[e.key.toLowerCase()]); }
    return;
  }
  const els = S.selEls();
  if (els.length && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && document.activeElement.closest('#stagewrap,body') && !tgt.closest('#slidesPane')) {
    e.preventDefault(); const d = e.shiftKey ? 10 : e.ctrlKey ? .5 : 1; els.forEach(x => { if (e.key === 'ArrowLeft') x.x -= d; if (e.key === 'ArrowRight') x.x += d; if (e.key === 'ArrowUp') x.y -= d; if (e.key === 'ArrowDown') x.y += d; }); S.renderStage(); clearTimeout(S._nudge); S._nudge = setTimeout(() => S.changed(), 400); return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && els.length && !tgt.closest('#slidesPane')) { e.preventDefault(); S.deleteSel(); return; }
  if (e.key === 'Escape' && els.length) { S.sel = []; S.renderSel(); return; }
  if (e.key === 'Tab' && S.slide().els.length) { e.preventDefault(); const list = S.slide().els, i = els.length ? list.indexOf(els[0]) : -1; S.sel = [list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].id]; S.renderSel(); return; }
  if ((e.key === 'Enter' || e.key === 'F2') && els.length === 1) { e.preventDefault(); S.editText(els[0].id, null); return; }
  if (!mod && !e.altKey && e.key.length === 1 && els.length === 1 && (els[0].type === 'text' || els[0].type === 'shape')) { S.editText(els[0].id, null, true); return; }
  if (e.key === 'PageDown' || (!els.length && e.key === 'ArrowDown' && !tgt.closest('#slidesPane'))) { e.preventDefault(); return S.goto(S.cur + 1); }
  if (e.key === 'PageUp' || (!els.length && e.key === 'ArrowUp' && !tgt.closest('#slidesPane'))) { e.preventDefault(); return S.goto(S.cur - 1); }
});
S.deleteSel = () => { const s = S.slide(); s.els = s.els.filter(e => !S.sel.includes(e.id)); S.sel = []; S.changed(); };

/* ---------- clipboard ---------- */
S.clip = null;
S.copySel = cut => { const els = S.selEls(); if (!els.length) return false; S.clip = JSON.parse(JSON.stringify(els)); S.clipPaste = 0; if (cut) S.deleteSel(); return true; };
S.pasteEls = () => { if (!S.clip) return false; S.clipPaste = (S.clipPaste || 0) + 1; const off = 20 * S.clipPaste; const gm = {}; const c = S.clip.map(x => ({ ...JSON.parse(JSON.stringify(x)), id:S.newId(), mid:S.newId(), x:x.x + off, y:x.y + off })); c.forEach(x => { if (x.group) x.group = gm[x.group] || (gm[x.group] = S.newId()); }); S.slide().els.push(...c); S.sel = c.map(x => x.id); S.changed(); return true; };
document.addEventListener('copy', e => { if (S.editing || e.target.matches('input,textarea') || S.showing) return; const els = S.selEls(); if (!els.length) return; e.preventDefault(); S.copySel(false); e.clipboardData.setData('text/plain', els.map(x => (x.html || '').replace(/<[^>]+>/g, ' ').trim()).filter(Boolean).join('\n') || ' '); e.clipboardData.setData('application/x-oneslide', JSON.stringify(S.clip)); });
document.addEventListener('cut', e => { if (S.editing || e.target.matches('input,textarea') || S.showing) return; const els = S.selEls(); if (!els.length) return; e.preventDefault(); e.clipboardData.setData('text/plain', ' '); S.copySel(true); });
document.addEventListener('paste', e => {
  if (S.editing || e.target.matches('input,textarea') || S.showing || ONE.topModal()) { if (S.editing && e.clipboardData) { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); } return; }
  const cd = e.clipboardData; if (!cd) return; e.preventDefault();
  const f = [...cd.files].find(x => x.type.startsWith('image/')); if (f) return S.insertImageFile(f);
  const own = cd.getData('application/x-oneslide'); if (own) { S.clip = JSON.parse(own); return S.pasteEls(); }
  if (S.clip && cd.getData('text/plain') === ' ') return S.pasteEls();
  const t = cd.getData('text/plain'); if (t && t.trim()) { S.insertText(esc(t.trim()).replace(/\n/g, '<br>')); return; }
  S.pasteEls();
});

/* ---------- format pane ---------- */
const fp = $('#fmtpane');
S.syncFmt = () => {
  if (fp.hidden) return; const e = S.selEls()[0], body = $('#fmtBody', fp); body.innerHTML = '';
  if (!e) { const s = S.slide(); body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Background' }), bgControls(s))); return; }
  const st = e.style || (e.style = {}), set = (patch, rec) => { Object.assign(st, patch); Object.keys(st).forEach(k => st[k] == null && delete st[k]); S.renderStage(); S.refreshThumb(); S.dirty(); if (rec) S.record(); };
  const num = (label, val, fn, opt = {}) => { const i = el('input', { type:'number', class:'tf', value:Math.round(val * 10) / 10, step:opt.step || 1, min:opt.min }); i.oninput = () => fn(parseFloat(i.value) || 0); i.onchange = () => S.record(); return ONE.field(label, i); };
  const color = (label, val, fn) => { const i = el('input', { type:'color', class:'tf', value:/^#/.test(val || '') ? val : '#4472c4', style:{ padding:'4px', height:'40px' } }); i.oninput = () => fn(i.value); i.onchange = () => S.record(); return ONE.field(label, i); };
  if (e.type === 'shape' || e.type === 'text') {
    const fillMode = ONE.select([['theme','Theme accent'],['solid','Solid color'],['grad','Gradient'],['none','No fill']], st.fill === 'none' ? 'none' : st.grad ? 'grad' : st.fill && !/^accent/.test(st.fill) ? 'solid' : e.type === 'text' && !st.fill ? 'none' : 'theme');
    fillMode.onchange = () => { const v = fillMode.value; set({ fill:v === 'none' ? (e.type === 'text' ? undefined : 'none') : v === 'theme' ? 'accent1' : S.color(st.fill && st.fill !== 'none' ? st.fill : 'accent1'), grad:v === 'grad' ? S.color('accent2') : undefined }, true); S.syncFmt(); };
    body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Fill' }), ONE.field('Fill', fillMode), fillMode.value === 'solid' || fillMode.value === 'grad' ? color('Color', S.color(st.fill), v => set({ fill:v })) : null, fillMode.value === 'grad' ? color('Second color', S.color(st.grad), v => set({ grad:v })) : null,
      el('div', { class:'grid2' }, ONE.field('Line', (() => { const s = ONE.select([['none','No line'],['solid','Solid']], st.line && st.line !== 'none' ? 'solid' : S.isLine(e.shape) ? 'solid' : 'none'); s.onchange = () => { set({ line:s.value === 'none' ? 'none' : S.color(st.line && st.line !== 'none' ? st.line : 'body'), lw:s.value === 'none' ? undefined : st.lw || 3 }, true); S.syncFmt(); }; return s; })()), num('Line width', st.lw ?? (S.isLine(e.shape) ? 4 : 0), v => set({ lw:v }))),
      st.line && st.line !== 'none' || S.isLine(e.shape) ? color('Line color', S.color(st.line, '#333333'), v => set({ line:v })) : null));
  }
  if (e.type === 'image') body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Picture' }), ONE.field('Fit', (() => { const s = ONE.select([['cover','Fill (crop to fit)'],['contain','Fit (show whole picture)']], e.fit || 'cover'); s.onchange = () => { e.fit = s.value; S.changed(); }; return s; })()), num('Corner radius', st.radius === 'circle' ? 0 : st.radius || 0, v => set({ radius:v || undefined }))));
  body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Effects' }),
    ONE.field('Shadow', (() => { const s = ONE.select([['','None'],['1','Subtle'],['soft','Soft'],['hard','Offset']], st.shadow ? String(st.shadow) : ''); s.onchange = () => set({ shadow:s.value ? (s.value === '1' ? true : s.value) : undefined }, true); return s; })()),
    (() => { const r = el('input', { type:'range', min:10, max:100, value:Math.round((st.opacity ?? 1) * 100) }); r.oninput = () => set({ opacity:+r.value / 100 }); r.onchange = () => S.record(); return ONE.field('Opacity', r); })(),
    e.type === 'shape' && e.shape === 'round' ? num('Corner radius', st.radius || Math.min(e.w, e.h) * .16, v => set({ radius:v })) : null));
  body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Size & position' }), el('div', { class:'grid2' },
    num('Width', e.w, v => { e.w = Math.max(4, v); S.renderStage(); }), num('Height', e.h, v => { e.h = Math.max(4, v); S.renderStage(); }), num('Left', e.x, v => { e.x = v; S.renderStage(); }), num('Top', e.y, v => { e.y = v; S.renderStage(); }), num('Rotation', e.rot || 0, v => { e.rot = v; S.renderStage(); }))));
  if (e.type === 'text' || e.type === 'shape') body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Text box' }), el('div', { class:'grid2' },
    ONE.field('Vertical alignment', (() => { const s = ONE.select([['top','Top'],['middle','Middle'],['bottom','Bottom']], st.valign || (e.type === 'shape' ? 'middle' : 'top')); s.onchange = () => set({ valign:s.value }, true); return s; })()), num('Padding', st.pad ?? (e.type === 'shape' ? 12 : 8), v => set({ pad:v })))));
  if (e.type === 'image' || e.type === 'chart' || e.type === 'shape') { const t = el('textarea', { class:'tf', rows:2 }); t.value = e.alt || ''; t.oninput = () => { e.alt = t.value; S.dirty(); }; body.append(el('div', { class:'fp-sec' }, el('h4', { text:'Alt text' }), t)); }
};
function bgControls(s){
  const t = S.theme(), cur = s.bg || {};
  const mode = ONE.select([['theme','Theme background'],['solid','Solid fill'],['grad','Gradient fill'],['img','Picture fill']], cur.img ? 'img' : cur.value ? (/gradient/.test(cur.value) ? 'grad' : 'solid') : 'theme');
  const c1 = el('input', { type:'color', class:'tf', value:'#ffffff', style:{ height:'40px', padding:'4px' } }), c2 = el('input', { type:'color', class:'tf', value:'#1f6fb2', style:{ height:'40px', padding:'4px' } });
  const apply = () => { const v = mode.value; s.bg = v === 'theme' ? null : v === 'solid' ? { value:c1.value } : v === 'grad' ? { value:`linear-gradient(135deg,${c1.value},${c2.value})` } : s.bg; S.renderStage(); S.refreshThumb(); S.dirty(); };
  mode.onchange = () => { if (mode.value === 'img') { const i = el('input', { type:'file', accept:'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { s.bg = { img:r.result }; S.changed(); S.syncFmt(); }; r.readAsDataURL(f); }; i.click(); return; } apply(); S.record(); S.syncFmt(); };
  c1.oninput = apply; c2.oninput = apply; c1.onchange = c2.onchange = () => S.record();
  const all = el('button', { class:'btn tonal', text:'Apply to All', onclick:() => { S.deck.slides.forEach(x => x.bg = s.bg ? JSON.parse(JSON.stringify(s.bg)) : null); S.changed(); ONE.toast('Background applied to every slide.'); } });
  const reset = el('button', { class:'btn text', text:'Reset Background', onclick:() => { s.bg = null; S.changed(); S.syncFmt(); } });
  void t;
  return el('div', { class:'dlg-col' }, ONE.field('Fill', mode), mode.value === 'solid' || mode.value === 'grad' ? ONE.field('Color', c1) : null, mode.value === 'grad' ? ONE.field('Second color', c2) : null, el('div', { class:'row', style:{ gap:'8px', flexWrap:'wrap' } }, all, reset));
}
$('#fmtClose').onclick = () => { fp.hidden = true; S.fit(); };
})();
