/* oneIdea — page canvas: note containers, ink, tags, inserts, quick math, search highlights */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const wrap = $('#canvaswrap'), sizer = $('#pagesizer'), pageEl = $('#page'), itemsEl = $('#items'), ink = $('#ink'), titleEl = $('#ptitle'), dateEl = $('#pdate');
const P = window.PG = {};
N.k = 1; N.tool = 'type'; N.pen = { c:'#1F1F1F', w:3 }; N.hl = { c:'#FFE14D', w:18 };

/* ---------- tags ---------- */
P.TAGS = {
  todo:{ label:'To Do', icon:'check_box_outline_blank', color:'var(--primary)', kbd:'Ctrl+1' },
  important:{ label:'Important', icon:'star', color:'#F4B400', kbd:'Ctrl+2' },
  question:{ label:'Question', icon:'help', color:'#7B5CD6', kbd:'Ctrl+3' },
  remember:{ label:'Remember for later', icon:'bookmark', color:'#E6A100', kbd:'Ctrl+4' },
  definition:{ label:'Definition', icon:'menu_book', color:'#2E8B57', kbd:'Ctrl+5' },
  idea:{ label:'Idea', icon:'lightbulb', color:'#F9A825', kbd:'Ctrl+6' },
  critical:{ label:'Critical', icon:'priority_high', color:'#D93025', kbd:'Ctrl+7' },
  contact:{ label:'Contact', icon:'person', color:'#1A73E8' },
  address:{ label:'Address', icon:'home_pin', color:'#1A73E8' },
  phone:{ label:'Phone number', icon:'call', color:'#1A73E8' },
  website:{ label:'Website to visit', icon:'language', color:'#0B8043' },
  discuss:{ label:'Discuss with team', icon:'forum', color:'#C2185B' }
};

/* ---------- geometry ---------- */
const pos = e => { const r = pageEl.getBoundingClientRect(); return { x:(e.clientX - r.left) / N.k, y:(e.clientY - r.top) / N.k }; };
P.layoutSize = () => {
  const p = N.page(); if (!p) return;
  let mx = 0, my = 0;
  $$('.nc', itemsEl).forEach(n => { mx = Math.max(mx, n.offsetLeft + n.offsetWidth); my = Math.max(my, n.offsetTop + n.offsetHeight); });
  p.ink.forEach(s => s.pts.forEach(([x, y]) => { mx = Math.max(mx, x); my = Math.max(my, y); }));
  const W = Math.max(wrap.clientWidth / N.k, mx + 320), H = Math.max(wrap.clientHeight / N.k, my + 420);
  pageEl.style.width = W + 'px'; pageEl.style.height = H + 'px'; pageEl.style.transform = `scale(${N.k})`;
  sizer.style.width = W * N.k + 'px'; sizer.style.height = H * N.k + 'px';
  ink.setAttribute('width', W); ink.setAttribute('height', H);
};
new ResizeObserver(() => P.layoutSize()).observe(wrap);
P.setZoom = k => { N.k = ONE.clamp(Math.round(k * 100) / 100, .3, 3); P.layoutSize(); const z = $('#zoomRange'); if (z) z.value = Math.round(N.k * 100); const t = $('#zoomPct'); if (t) t.textContent = Math.round(N.k * 100) + '%'; };

/* ---------- render ---------- */
let changed = false;
P.render = (anim = true) => {
  const p = N.page(); if (!p) return;
  titleEl.textContent = p.title; titleEl.dataset.empty = !p.title;
  dateEl.textContent = new Date(p.created).toLocaleString(undefined, { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
  pageEl.style.setProperty('--pagebg', p.bg || '');
  pageEl.classList.toggle('tinted', !!p.bg);
  pageEl.dataset.rules = p.rules || 'none';
  itemsEl.innerHTML = '';
  p.items.forEach((it, i) => itemsEl.append(P.container(it, anim ? i : -1)));
  P.drawInk();
  if (anim && !ONE.reduced) { pageEl.classList.remove('enter'); void pageEl.offsetWidth; pageEl.classList.add('enter'); }
  requestAnimationFrame(P.layoutSize); P.status();
  changed = false;
};
P.container = (it, i = -1) => {
  const n = el('div', { class:'nc' + (i >= 0 ? ' in' : ''), 'data-id':it.id, style:{ left:it.x + 'px', top:it.y + 'px', width:it.w + 'px', animationDelay:i >= 0 ? i * 40 + 'ms' : null } });
  const body = el('div', { class:'nc-body', contenteditable:'true', spellcheck:document.body.classList.contains('nospell') ? 'false' : 'true', html:it.html });
  n.append(el('div', { class:'nc-bar', title:'Drag to move', html:icon('drag_indicator') }), body, el('div', { class:'nc-rsz', title:'Drag to resize' }));
  return n;
};
const itemOf = n => N.page().items.find(i => i.id === n.dataset.id);
const touch = () => { const p = N.page(); p.updated = Date.now(); changed = true; N.dirty(); P.status(); N.onPageEdited && N.onPageEdited(); };
P.sync = body => { const n = body.closest('.nc'), it = n && itemOf(n); if (!it) return; it.html = body.innerHTML; touch(); };
P.syncAll = () => $$('.nc-body', itemsEl).forEach(b => { const it = itemOf(b.closest('.nc')); if (it) it.html = b.innerHTML; });
P.wasChanged = () => changed;
P.touch = touch; P.clearChanged = () => { changed = false; };

/* ---------- title ---------- */
titleEl.addEventListener('input', () => { const p = N.page(); p.title = titleEl.textContent.replace(/\n/g, ' '); titleEl.dataset.empty = !p.title; touch(); N.onTitle && N.onTitle(); });
titleEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const first = $('.nc-body', itemsEl); if (first) { first.focus(); P.caretEnd(first); } else P.newContainerAt(48, 130).focus(); } });
titleEl.addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s+/g, ' ')); });

/* ---------- containers: create, move, resize, remove ---------- */
P.caretEnd = node => { const r = document.createRange(); r.selectNodeContents(node); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
P.newContainerAt = (x, y, html = '<p><br></p>', w = 420) => {
  const it = N.item(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), w, html); N.page().items.push(it);
  const n = P.container(it, 0); itemsEl.append(n); touch(); P.layoutSize();
  const b = $('.nc-body', n); setTimeout(() => { b.focus(); P.caretEnd(b); }, 0); return b;
};
P.freeSpot = () => { const p = N.page(); let y = 130; p.items.forEach(i => { const n = itemsEl.querySelector(`.nc[data-id="${i.id}"]`); if (n && i.x < 600) y = Math.max(y, i.y + n.offsetHeight + 24); }); return { x:48, y }; };
const isEmpty = b => !b.textContent.trim() && !b.querySelector('img,table,audio,video,a.att,hr,[data-tag]');
itemsEl.addEventListener('focusout', e => {
  const b = e.target.closest('.nc-body'); if (!b) return;
  setTimeout(() => { if (b.isConnected && document.activeElement !== b && isEmpty(b)) { const n = b.closest('.nc'); const p = N.page(); p.items = p.items.filter(i => i.id !== n.dataset.id); n.classList.add('out'); setTimeout(() => n.remove(), 160); touch(); } }, 120);
});
let drag = null, lastTap = null;
pageEl.addEventListener('pointerdown', e => {
  if (e.button !== 0 || N.tool !== 'type' || pageEl.classList.contains('recall')) return;
  const bar = e.target.closest('.nc-bar'), rsz = e.target.closest('.nc-rsz');
  if (bar || rsz) {
    e.preventDefault(); const n = (bar || rsz).closest('.nc'), p0 = pos(e);
    drag = { kind:bar ? 'move' : 'size', n, it:itemOf(n), p0, x:n.offsetLeft, y:n.offsetTop, w:n.offsetWidth, moved:false };
    n.classList.add('dragging'); pageEl.setPointerCapture(e.pointerId); return;
  }
  if (e.target === pageEl || e.target === itemsEl || e.target === ink) { drag = { kind:'new', p0:pos(e) }; }
});
pageEl.addEventListener('pointermove', e => {
  if (!drag || drag.kind === 'new') return;
  const p = pos(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 2;
  if (drag.kind === 'move') { drag.n.style.left = Math.max(0, drag.x + dx) + 'px'; drag.n.style.top = Math.max(0, drag.y + dy) + 'px'; }
  else drag.n.style.width = Math.max(120, drag.w + dx) + 'px';
});
pageEl.addEventListener('pointerup', e => {
  const d = drag; drag = null; if (!d) return;
  if (d.kind === 'new') {
    const p = pos(e); if (Math.abs(p.x - d.p0.x) >= 6 || Math.abs(p.y - d.p0.y) >= 6 || getSelection().toString()) return;
    /* A page with content only starts a new text box on a double click or double tap, so tapping to read or scroll never pops up the keyboard.
       An empty page still starts one on a single click so it isn't a dead end. */
    const now = performance.now(), lt = lastTap, empty = !N.page().items.length;
    if (empty || (lt && now - lt.t < 450 && Math.hypot(lt.x - p.x, lt.y - p.y) < 28)) { lastTap = null; P.newContainerAt(p.x - 8, p.y - 14); return; }
    lastTap = { t:now, x:p.x, y:p.y };
    try { if (!localStorage.getItem('oi-tap-hint')) { localStorage.setItem('oi-tap-hint', '1'); ONE.toast('Double-click or double-tap an empty spot to add a text box.'); } } catch {}
    return;
  }
  d.n.classList.remove('dragging');
  if (d.moved && d.it) { d.it.x = d.n.offsetLeft; d.it.y = d.n.offsetTop; d.it.w = d.n.offsetWidth; touch(); P.layoutSize(); }
  else if (d.kind === 'move') { const b = $('.nc-body', d.n); b.focus(); }
});

/* ---------- editing inside containers ---------- */
let saveInputT;
itemsEl.addEventListener('input', e => { const b = e.target.closest('.nc-body'); if (!b) return; if (e.inputType === 'insertText' && /[  ]$/.test(e.data || '')) setTimeout(quickMath, 0); clearTimeout(saveInputT); saveInputT = setTimeout(() => P.sync(b), 250); changed = true; });
itemsEl.addEventListener('click', e => {
  const b = e.target.closest('.nc-body'); if (!b) return;
  const t = e.target.closest('[data-tag="todo"]');
  if (t && e.clientX - t.getBoundingClientRect().left < 26 * N.k) { e.preventDefault(); t.toggleAttribute('data-done'); P.sync(b); N.refreshTagPane && N.refreshTagPane(); return; }
  const a = e.target.closest('a[href]');
  if (a && (e.ctrlKey || e.metaKey || a.classList.contains('att'))) { e.preventDefault(); if (a.classList.contains('att')) { const blob = dataToBlob(a.getAttribute('href')); if (blob) ONE.download(a.getAttribute('download') || 'file', blob); } else window.open(a.href, '_blank', 'noopener'); }
});
itemsEl.addEventListener('mouseover', e => { const a = e.target.closest('.nc-body a[href]:not(.att)'); if (a) a.title = 'Ctrl+click to open ' + a.getAttribute('href'); });
itemsEl.addEventListener('keydown', e => {
  const b = e.target.closest('.nc-body'); if (!b) return;
  if (e.key === 'Tab') { e.preventDefault(); const li = getSelection().anchorNode && getSelection().anchorNode.parentElement && getSelection().anchorNode.parentElement.closest('li'); if (li) document.execCommand(e.shiftKey ? 'outdent' : 'indent'); else if (!e.shiftKey) document.execCommand('insertText', false, '  '); P.sync(b); }
  if (e.key === 'Escape') { b.blur(); getSelection().removeAllRanges(); }
});

/* quick math: "12*4+3= " → "12*4+3=51 " */
function quickMath(){
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return; const node = s.anchorNode; if (!node || node.nodeType !== 3) return;
  const before = node.textContent.slice(0, s.anchorOffset).replace(/ /g, ' ');
  const m = /([0-9.,()+\-*/×÷^%\s]*[0-9)])\s*=\s$/.exec(before); if (!m) return;
  let ex = m[1].replace(/×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)').replace(/,/g, '');
  if (!/[+\-*/]/.test(ex.replace(/^\s*-/, '')) || !/^[\d.\s()+\-*/]+$/.test(ex)) return;
  let v; try { v = Function('"use strict";return (' + ex + ')')(); } catch { return; }
  if (typeof v !== 'number' || !isFinite(v)) return;
  const out = String(Math.round(v * 1e10) / 1e10);
  const r = document.createRange(); r.setStart(node, s.anchorOffset - 1); r.setEnd(node, s.anchorOffset); s.removeAllRanges(); s.addRange(r);
  document.execCommand('insertText', false, out + ' ');
}

/* ---------- selection memory (so ribbon popovers can act on the text you were in) ---------- */
let savedRange = null;
document.addEventListener('selectionchange', () => { const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0); const host = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; if (host && host.closest && host.closest('.nc-body')) { savedRange = r.cloneRange(); N.onSel && N.onSel(); } });
P.body = () => { const r = savedRange; if (!r) return null; const h = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement; const b = h && h.closest && h.closest('.nc-body'); return b && b.isConnected ? b : null; };
P.restore = () => { const b = P.body(); if (!b) return null; if (document.activeElement !== b) b.focus({ preventScroll:true }); const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); return b; };
P.exec = (cmd, val = null) => { const b = P.restore(); if (!b) { ONE.toast('Click into a note first.'); return false; } document.execCommand('styleWithCSS', false, !['bold','italic','underline','strikeThrough','insertOrderedList','insertUnorderedList','formatBlock','indent','outdent','removeFormat','subscript','superscript','createLink','insertHTML','insertText'].includes(cmd)); document.execCommand(cmd, false, val); P.sync(b); return true; };
P.insertHTML = html => { const b = P.body(); if (b) return P.exec('insertHTML', html); const s = P.freeSpot(); P.newContainerAt(s.x, s.y, html); return true; };
P.insertText = t => { if (P.body()) return P.exec('insertText', t); const s = P.freeSpot(); P.newContainerAt(s.x, s.y, `<p>${esc(t)}</p>`); };

/* ---------- tags ---------- */
P.block = () => {
  const b = P.restore(); if (!b) return null; const s = getSelection(); let n = s.anchorNode; if (!n) return null; if (n === b) n = b.childNodes[s.anchorOffset] || b.lastChild;
  let blk = n.nodeType === 1 ? n : n.parentElement; while (blk && blk !== b && !(blk.parentElement === b || blk.tagName === 'LI')) blk = blk.parentElement;
  if (!blk || blk === b || n.nodeType === 3 && n.parentElement === b) { document.execCommand('formatBlock', false, 'p'); return P.block(); }
  return { b, blk };
};
P.tag = key => {
  const r = P.block(); if (!r) { const s = P.freeSpot(); const b = P.newContainerAt(s.x, s.y, `<p data-tag="${key}" data-tid="${ONE.uid()}"><br></p>`); return; }
  const { b, blk } = r;
  if (key === null || blk.dataset.tag === key) { delete blk.dataset.tag; delete blk.dataset.tid; blk.removeAttribute('data-done'); }
  else { blk.dataset.tag = key; blk.dataset.tid = blk.dataset.tid || ONE.uid(); blk.removeAttribute('data-done'); blk.classList.remove('tagpop'); void blk.offsetWidth; blk.classList.add('tagpop'); }
  P.sync(b); N.refreshTagPane && N.refreshTagPane();
};

/* ---------- ink ---------- */
const smooth = pts => { if (pts.length < 3) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` + pts.slice(1).map(p => `L${p[0]} ${p[1]}`).join('') + (pts.length === 1 ? 'l.1 .1' : '') : ''; let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += `Q${pts[i][0]} ${pts[i][1]} ${mx.toFixed(1)} ${my.toFixed(1)}`; } const l = pts[pts.length - 1]; return d + `L${l[0]} ${l[1]}`; };
const strokePath = s => `<path d="${smooth(s.pts)}" stroke="${esc(s.c)}" stroke-width="${s.w}" ${s.hl ? 'class="hl"' : ''} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
P.drawInk = () => { ink.innerHTML = N.page().ink.map(strokePath).join(''); };
P.setTool = t => { N.tool = t; pageEl.dataset.tool = t; if (t !== 'type') { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } ONE.ribbon.refresh(); P.status(); };
let stroke = null;
ink.addEventListener('pointerdown', e => {
  if (N.tool === 'type' || e.button !== 0) return; e.preventDefault(); ink.setPointerCapture(e.pointerId);
  const p = pos(e);
  if (N.tool === 'eraser') { stroke = { erase:true }; erase(p); return; }
  const cfg = N.tool === 'hl' ? N.hl : N.pen;
  stroke = { c:cfg.c, w:cfg.w, hl:N.tool === 'hl' || undefined, pts:[[+p.x.toFixed(1), +p.y.toFixed(1)]] };
  stroke.node = el('div'); ink.insertAdjacentHTML('beforeend', strokePath(stroke)); stroke.node = ink.lastElementChild;
});
ink.addEventListener('pointermove', e => {
  if (!stroke) return; const p = pos(e);
  if (stroke.erase) return erase(p);
  const l = stroke.pts[stroke.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) < 1.5) return;
  stroke.pts.push([+p.x.toFixed(1), +p.y.toFixed(1)]); stroke.node.setAttribute('d', smooth(stroke.pts));
});
const endStroke = () => { const s = stroke; stroke = null; if (!s || s.erase) return; delete s.node; if (!s.hl) delete s.hl; N.page().ink.push(s); touch(); P.layoutSize(); };
ink.addEventListener('pointerup', endStroke); ink.addEventListener('pointercancel', endStroke);
function erase(p){ const pg = N.page(), before = pg.ink.length; pg.ink = pg.ink.filter(s => !s.pts.some(([x, y], i) => { if (Math.hypot(x - p.x, y - p.y) < 8 + s.w / 2) return true; const q = s.pts[i + 1]; if (!q) return false; const dx = q[0] - x, dy = q[1] - y, L = dx * dx + dy * dy || 1, t = ONE.clamp(((p.x - x) * dx + (p.y - y) * dy) / L, 0, 1); return Math.hypot(x + t * dx - p.x, y + t * dy - p.y) < 8 + s.w / 2; })); if (pg.ink.length !== before) { P.drawInk(); touch(); } }

/* ---------- pictures, files, paste & drop ---------- */
const readURL = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
const dataToBlob = u => { try { const [h, b] = u.split(','); const mime = /data:([^;]+)/.exec(h)[1], bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type:mime }); } catch { return null; } };
P.shrinkImage = async f => {
  const url = await readURL(f); if (/gif|svg/.test(f.type)) return url;
  const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }); if (!img) return url;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)); if (k === 1 && f.size < 400000) return url;
  const c = el('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .85);
};
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
P.imgHTML = (src, alt = '') => `<p><img src="${src}" alt="${esc(alt)}" style="width:${420}px"></p><p><br></p>`;
P.fileHTML = async f => { if (f.size > 3 * 1048576) { ONE.toast(`${f.name} is ${fmtSize(f.size)}. Files over 3 MB are too big to keep in this browser.`); return ''; } const u = await readURL(f); return `<a class="att" contenteditable="false" href="${u}" download="${esc(f.name)}">${icon('attach_file')}${esc(f.name)} · ${fmtSize(f.size)}</a>&nbsp;`; };
P.insertFiles = async (files, at) => {
  let html = '';
  for (const f of files) html += f.type.startsWith('image/') ? P.imgHTML(await P.shrinkImage(f), f.name) : await P.fileHTML(f);
  if (!html) return;
  if (at) P.newContainerAt(at.x, at.y, html, 460); else P.insertHTML(html);
};
itemsEl.addEventListener('paste', async e => {
  const files = [...(e.clipboardData.files || [])]; if (!files.length) return; e.preventDefault(); P.insertFiles(files);
});
wrap.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); pageEl.classList.add('dropping'); } });
wrap.addEventListener('dragleave', e => { if (e.target === wrap || !wrap.contains(e.relatedTarget)) pageEl.classList.remove('dropping'); });
wrap.addEventListener('drop', e => { pageEl.classList.remove('dropping'); const files = [...e.dataTransfer.files]; if (!files.length) return; e.preventDefault(); P.insertFiles(files, pos(e)); });

/* ---------- search highlights ---------- */
P.highlight = q => {
  if (!window.CSS || !CSS.highlights) return;
  CSS.highlights.delete('found'); if (!q) return;
  const h = new Highlight(), ql = q.toLowerCase();
  [titleEl, ...$$('.nc-body', itemsEl), ...$$('#mm .mm-text')].forEach(root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.toLowerCase(); let i = t.indexOf(ql); while (i >= 0) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + q.length); h.add(r); i = t.indexOf(ql, i + q.length); } } });
  CSS.highlights.set('found', h);
  const first = h.values().next().value; if (first) { const r = first.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); wrap.scrollTo({ top:wrap.scrollTop + r.top - wr.top - 120, left:Math.max(0, wrap.scrollLeft + r.left - wr.left - 200), behavior:'smooth' }); }
};
P.flash = tid => { const n = itemsEl.querySelector(`[data-tid="${tid}"]`); if (!n) return; n.scrollIntoView({ block:'center', behavior:'smooth' }); n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); };

/* ---------- status ---------- */
P.status = () => { const p = N.page(); if (!p) return; const s = N.section(); $('#pageInfo').textContent = `${s.name} › ${p.title || 'Untitled page'}`; $('#wordInfo').textContent = `${N.words(p)} words`; $('#toolInfo').hidden = N.tool === 'type'; $('#toolInfo').innerHTML = N.tool === 'type' ? '' : `${icon({ pen:'edit', hl:'ink_highlighter', eraser:'ink_eraser' }[N.tool])}${{ pen:'Pen', hl:'Highlighter', eraser:'Eraser' }[N.tool]} · Esc to type`; };
})();
