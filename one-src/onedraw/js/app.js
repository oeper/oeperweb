/* oneDraw — pages panel, ribbon, colour & style pickers, File backstage, shortcuts, boot */
(() => {
'use strict';
const { $, $$, el, esc, icon, store, clamp } = ONE;
const A = {}, POP = {};
ONE.boot('od', 'draw');
const listEl = $('#pagelist'), appEl = $('#app');
const safeName = s => String(s || 'board').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'board';
const SHAPES = { line:['Line', 'horizontal_rule', 'S'], arrow:['Arrow', 'arrow_right_alt', 'A'], rect:['Rectangle', 'check_box_outline_blank', 'R'], ellipse:['Ellipse', 'radio_button_unchecked', 'O'], diamond:['Diamond', 'diamond', 'D'] };
const HINTS = {
  select:'Click things to select them. Drag on empty space to select several. Double-click text to edit it.', hand:'Drag to move around the board.',
  pen:'Draw with a mouse, finger or pen.', hl:'Highlight over things. It stays see-through.', write:'Write with your pen or finger. When you pause, your handwriting turns into typed text.',
  eraser:'Drag across a drawing or shape to remove it.', laser:'Point at things. The red trail fades away and isn’t saved.', line:'Drag to draw a line. Hold Shift for a straight angle.', arrow:'Drag to draw an arrow. Hold Shift for a straight angle.',
  rect:'Drag to draw a rectangle. Hold Shift for a square.', ellipse:'Drag to draw an ellipse. Hold Shift for a circle.', diamond:'Drag to draw a diamond.', text:'Click anywhere and start typing.', sticky:'Click to put down a sticky note, then type.'
};
const TOOL_NAME = { select:'Select', hand:'Move', pen:'Pen', hl:'Highlighter', write:'Write to text', eraser:'Eraser', laser:'Laser', line:'Line', arrow:'Arrow', rect:'Rectangle', ellipse:'Ellipse', diamond:'Diamond', text:'Text', sticky:'Sticky note' };

/* ---------- pages panel ---------- */
let thumbT, dragging = null;
function renderPages(){
  listEl.innerHTML = '';
  D.doc.pages.forEach((p, i) => {
    const card = el('button', { class:'pgc' + (i === D.doc.cur ? ' on' : ''), draggable:'true', 'data-i':i, style:{ animationDelay:Math.min(i, 12) * 25 + 'ms' }, title:p.name || 'Page ' + (i + 1) },
      B.thumbCanvas(p, 160, 100), el('small', {}, el('b', { text:String(i + 1) }), el('span', { text:p.name || '' })));
    card.onclick = () => A.go(i);
    card.oncontextmenu = e => { e.preventDefault(); pageMenu(i, { x:e.clientX, y:e.clientY }); };
    card.addEventListener('dragstart', e => { dragging = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch {} card.classList.add('ghost'); });
    card.addEventListener('dragend', () => { dragging = null; $$('.ghost,.drop-before,.drop-after', listEl).forEach(x => x.classList.remove('ghost', 'drop-before', 'drop-after')); });
    card.addEventListener('dragover', e => { if (dragging == null) return; e.preventDefault(); const r = card.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2; $$('.drop-before,.drop-after', listEl).forEach(x => x.classList.remove('drop-before', 'drop-after')); card.classList.add(before ? 'drop-before' : 'drop-after'); });
    card.addEventListener('drop', e => {
      if (dragging == null) return; e.preventDefault(); const r = card.getBoundingClientRect(); let to = e.clientY < r.top + r.height / 2 ? i : i + 1; const from = dragging; dragging = null; if (from < to) to--; if (to === from) return renderPages();
      const cur = D.page(), [pg] = D.doc.pages.splice(from, 1); D.doc.pages.splice(to, 0, pg); D.doc.cur = D.doc.pages.indexOf(cur); renderPages(); status(); D.dirty();
    });
    listEl.append(card);
  });
  const on = listEl.children[D.doc.cur]; if (on && on.scrollIntoView) on.scrollIntoView({ block:'nearest' });
}
function refreshThumb(){
  clearTimeout(thumbT); thumbT = setTimeout(() => { const card = listEl.children[D.doc.cur]; if (!card) return; const old = card.querySelector('canvas'); if (old) old.replaceWith(B.thumbCanvas(D.page(), 160, 100)); }, 450);
}
function pageMenu(i, at){
  ONE.menuAt(at, [
    { label:'Rename', icon:'edit', on:() => { const inp = ONE.input({ value:D.doc.pages[i].name || '', placeholder:'Page ' + (i + 1) }); ONE.modal({ title:'Rename page', icon:'edit', body:ONE.field('Name', inp), actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => { D.doc.pages[i].name = inp.value.trim(); renderPages(); D.dirty(); } }] }); } },
    { label:'Duplicate', icon:'content_copy', on:() => A.dupPage(i) },
    { label:'Move up', icon:'arrow_upward', disabled:i === 0, on:() => movePage(i, -1) },
    { label:'Move down', icon:'arrow_downward', disabled:i === D.doc.pages.length - 1, on:() => movePage(i, 1) },
    '-', { label:'Delete', icon:'delete', danger:true, on:() => A.delPage(i) }]);
}
function movePage(i, d){ const cur = D.page(), [p] = D.doc.pages.splice(i, 1); D.doc.pages.splice(i + d, 0, p); D.doc.cur = D.doc.pages.indexOf(cur); renderPages(); status(); D.dirty(); }
A.go = i => { B.endEdit(); D.doc.cur = clamp(i, 0, D.doc.pages.length - 1); B.loadPage(); renderPages(); status(); ONE.ribbon.refresh(); D.dirty(); if (innerWidth <= 900) appEl.classList.remove('nav-open'); };
A.newPage = () => { B.endEdit(); const p = D.newPage('', D.page().bg, D.page().color); D.doc.pages.splice(D.doc.cur + 1, 0, p); A.go(D.doc.cur + 1); };
A.dupPage = (i = D.doc.cur) => { B.endEdit(); const src = D.doc.pages[i], p = Object.assign(D.clean(src), { id:ONE.uid() }); p.els.forEach(e => { e.id = ONE.uid(); }); D.doc.pages.splice(i + 1, 0, p); A.go(i + 1); };
A.delPage = (i = D.doc.cur) => {
  const go = () => { B.endEdit(); const gone = D.doc.pages[i]; if (D.doc.pages.length === 1) { D.doc.pages[0] = D.newPage('', gone.bg, gone.color); } else D.doc.pages.splice(i, 1); D.forget(gone); D.doc.cur = clamp(D.doc.cur >= i && D.doc.cur > 0 ? D.doc.cur - (D.doc.cur === i ? 0 : 1) : D.doc.cur, 0, D.doc.pages.length - 1); B.loadPage(); renderPages(); status(); D.dirty(); };
  if (D.doc.pages[i].els.length) ONE.modal({ title:`Delete page ${i + 1}?`, body:'Everything on this page will be removed.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:go }] }); else go();
};
function status(){
  if (!D.doc) return;
  $('#pageInfo').textContent = `Page ${D.doc.cur + 1} of ${D.doc.pages.length}`;
  $('#toolInfo').textContent = TOOL_NAME[B.tool] || '';
}

/* ---------- board callbacks ---------- */
let hintT;
function showHint(t){ const h = $('#hint'); if (!t) { h.hidden = true; return; } h.textContent = t; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { h.hidden = true; }, 3600); }
function syncBars(){
  const dp = B.defaults.pen, dh = B.defaults.hl, sv = B.styleView(); const col = c => !c || c === 'auto' ? 'currentColor' : c;
  [['#dkPen', dp.c], ['#dkHl', dh.c], ['#barPen', B.group() === 'pen' ? sv.c : dp.c], ['#barHl', B.group() === 'hl' ? sv.c : dh.c], ['#barStroke', sv.c], ['#barFill', sv.f]].forEach(([s, c]) => { const n = $(s); if (n) n.style.background = col(c); });
  const nf = $('#barFill'); if (nf && !sv.f) nf.style.background = 'transparent';
}
B.onTool = t => {
  $$('.dock [data-act^="tool:"]').forEach(b => b.classList.toggle('on', b.dataset.act === 'tool:' + t));
  const sh = $('#dkShape'); sh.classList.toggle('on', !!SHAPES[t]); if (SHAPES[t]) sh.firstElementChild.textContent = SHAPES[t][1];
  status(); ONE.ribbon.refresh(); syncBars(); if (['write', 'laser', 'text', 'sticky', 'hand', 'eraser'].includes(t) && !store.get('od-hint-' + t)) { store.set('od-hint-' + t, 1); showHint(HINTS[t]); }
};
B.onSelect = () => { ONE.ribbon.refresh(); syncBars(); };
B.onChange = () => { refreshThumb(); ONE.ribbon.refresh(); };
B.onView = () => { const k = Math.round(B.v.k * 100); $('#zoomPct').textContent = k + '%'; $('#zoomRange').value = k; };
B.onInk = ids => INK.convert(ids, { auto:true, quiet:true });
B.onContext = (at, onEl, p) => {
  const hasSel = B.sel.length > 0;
  ONE.menuAt(at, hasSel ? [
    ...(B.hasInk() ? [{ label:'Convert handwriting to text', icon:'font_download', on:A.inkToText }, '-'] : []),
    { label:'Cut', icon:'content_cut', kbd:'Ctrl+X', on:A.cut }, { label:'Copy', icon:'content_copy', kbd:'Ctrl+C', on:A.copy }, { label:'Duplicate', icon:'control_point_duplicate', kbd:'Ctrl+D', on:B.dupe }, '-',
    { label:'Bring to front', icon:'flip_to_front', kbd:']', on:() => B.order('front') }, { label:'Send to back', icon:'flip_to_back', kbd:'[', on:() => B.order('back') }, '-',
    { label:'Delete', icon:'delete', kbd:'Del', danger:true, on:B.del }
  ] : [
    { label:'Paste', icon:'content_paste', kbd:'Ctrl+V', on:A.paste }, { label:'Select all', icon:'select_all', kbd:'Ctrl+A', on:B.selectAll }, '-',
    { label:'Add text here', icon:'text_fields', on:() => { B.setTool('text'); const pre = D.snapshot(), d = B.defaults.text, t = { id:ONE.uid(), t:'text', x:p.x, y:p.y - d.size / 2, text:'', size:d.size, font:d.font, c:d.c, op:d.op }; D.page().els.push(t); B.editEl(t, true, pre); } },
    { label:'Add sticky note here', icon:'sticky_note_2', on:() => { const d = B.defaults.sticky, pre = D.snapshot(), t = { id:ONE.uid(), t:'sticky', x:p.x - 100, y:p.y - 85, w:200, h:170, text:'', c:d.sc, size:d.size, font:d.font, op:1 }; D.page().els.push(t); B.editEl(t, true, pre); } },
    { label:'Add picture…', icon:'image', on:A.picture }, '-', { label:'Fit everything on screen', icon:'fit_screen', on:A.fit }
  ]);
};

/* ---------- actions ---------- */
Object.assign(A, {
  save:() => { B.endEdit(); D.save(); ONE.toast('Saved in this browser.'); },
  undo:() => { B.endEdit(); if (D.undo()) { B.sel = B.sel.filter(id => D.page().els.some(e => e.id === id)); B.changed(); B.onSelect(); } },
  redo:() => { B.endEdit(); if (D.redo()) { B.sel = B.sel.filter(id => D.page().els.some(e => e.id === id)); B.changed(); B.onSelect(); } },
  apps:b => ONE.appSwitcher(b), seed:b => ONE.seedMenu(b), shortcuts:() => shortcuts(),
  cut:() => { try { if (document.execCommand('cut')) return; } catch {} B.cut(); },
  copy:() => { try { if (document.execCommand('copy')) return; } catch {} B.copy(); },
  paste:async () => {
    try { const items = await navigator.clipboard.read(); for (const it of items) { const ty = it.types.find(x => x.startsWith('image/')); if (ty) { await B.loadImageFile(new File([await it.getType(ty)], 'pasted', { type:ty })); return; } } } catch {}
    try { const t = await navigator.clipboard.readText(); if (t && !B.clip) { B.addText(t.slice(0, 4000)); return; } } catch {}
    if (!B.pasteClip()) ONE.toast('Press Ctrl+V to paste here.');
  },
  del:() => B.del(), dupe:() => B.dupe(), inkToText:() => INK.convert(B.sel), pad:() => INK.pad(),
  picture:() => $('#picInput').click(), front:() => B.order('front'), back:() => B.order('back'), forward:() => B.order('forward'), backward:() => B.order('backward'),
  selectAll:() => B.selectAll(), lockTool:() => { B.lock = !B.lock; ONE.ribbon.refresh(); ONE.toast(B.lock ? 'The tool stays selected after each shape.' : 'Back to Select after each shape.'); },
  clearPage:() => { if (!D.page().els.length) return; ONE.modal({ title:'Clear this page?', body:'Everything on the page will be removed. You can undo it right after.', actions:[{ label:'Cancel' }, { label:'Clear', kind:'filled', on:() => B.clear() }] }); },
  dupPageNow:() => A.dupPage(), delPageNow:() => A.delPage(),
  zoomIn:() => B.zoomBy(1.25), zoomOut:() => B.zoomBy(1 / 1.25), zoom100:() => B.zoomAt(1, $('#boardwrap').clientWidth / 2, $('#boardwrap').clientHeight / 2),
  fit:() => B.fit(), fitSel:() => B.fit(B.selEls().length ? B.selEls() : null),
  fullPage:() => { appEl.classList.toggle('fullpage'); ONE.ribbon.refresh(); },
  togglePages:() => { appEl.classList.toggle(innerWidth <= 900 ? 'nav-open' : 'pages-hidden'); ONE.ribbon.refresh(); },
  exportPng:() => { B.endEdit(); B.exportCanvas(D.page(), 2).toBlob(b => b ? ONE.download(safeName(D.doc.title) + (D.doc.pages.length > 1 ? ' - page ' + (D.doc.cur + 1) : '') + '.png', b, 'image/png') : ONE.toast('The picture was too big to make. Zoom out or remove a large picture.'), 'image/png'); },
  exportFile:() => { B.endEdit(); D.save(); ONE.download(safeName(D.doc.title) + '.onedraw', JSON.stringify(D.clean(D.doc)), 'application/json'); },
  print:() => {
    B.endEdit(); const f = el('iframe', { style:{ position:'fixed', right:'0', bottom:'0', width:'0', height:'0', border:'0' } }); document.body.append(f);
    const imgs = D.doc.pages.map(p => { const c = B.exportCanvas(p, 1.5, 30); return `<img src="${c.toDataURL('image/png')}" style="display:block;max-width:100%;max-height:96vh;margin:0 auto;page-break-after:always;break-after:page">`; }).join('');
    f.contentDocument.open(); f.contentDocument.write(`<!doctype html><title>${esc(D.doc.title)}</title><style>@page{margin:10mm}body{margin:0}</style>${imgs}`); f.contentDocument.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { ONE.toast('This browser blocked printing.'); } setTimeout(() => f.remove(), 60000); }, 500);
  }
});
const run = (act, b, e) => {
  if (!act) return;
  if (act.startsWith('pop:')) { const p = POP[act.slice(4)]; return p ? p(b) : null; }
  if (act.startsWith('tool:')) { B.setTool(act.slice(5)); return; }
  const f = A[act]; if (f) f(b, e); else console.warn('Unknown action', act);
};

/* ---------- pickers ---------- */
function swatches(anchor, colors, current, apply, opt = {}){
  const d = el('div', { class:'swpop' }), g = el('div', { class:'swgrid' });
  if (opt.title) d.append(el('div', { class:'menu-title', text:opt.title }));
  colors.forEach(c => {
    const on = (c || null) === (current || null);
    const b = el('button', { class:'swb' + (c === null ? ' none' : c === 'auto' ? ' auto' : '') + (on ? ' on' : ''), style:c && c !== 'auto' ? { background:c } : null, title:c === null ? 'None' : c === 'auto' ? 'Automatic: dark on light boards, light on dark ones' : c, 'aria-label':c === null ? 'None' : c, onclick:() => { ONE.pop.close(); apply(c); } });
    if (c === null) b.innerHTML = icon('format_color_reset');
    g.append(b);
  });
  d.append(g);
  if (opt.custom !== false) { const lab = el('label', { class:'menu-item nomd', html:`${icon('colorize')}<span class="mi-label">More colors…</span>` }), inp = el('input', { type:'color', class:'vh', onchange:() => { ONE.pop.close(); apply(inp.value); } }); lab.append(inp); d.append(lab); }
  ONE.pop.open(anchor, d);
}
Object.assign(POP, {
  stroke:b => { const g = B.group(), v = B.styleView(); swatches(b, g === 'hl' ? D.HL : D.INK, v.c, c => B.setStyle({ c }), { title:g === 'hl' ? 'Highlighter color' : 'Color' }); },
  fill:b => swatches(b, D.FILL, B.styleView().f, f => B.setStyle({ f }), { title:'Fill' }),
  sticky:b => swatches(b, D.STICKY, B.styleView().sc, sc => B.setStyle({ sc }), { title:'Sticky note color', custom:false }),
  width:b => { const g = B.group(), v = B.styleView(), list = g === 'hl' ? [[12, 'Fine'], [22, 'Medium'], [34, 'Wide'], [50, 'Extra wide']] : D.WIDTHS; ONE.menuAt(b, list.map(([w, n]) => ({ label:n, icon:'line_weight', checked:Math.abs((v.sw || 0) - w) < .6, on:() => B.setStyle({ sw:w }) }))); },
  dash:b => { const v = B.styleView(); ONE.menuAt(b, [['solid', 'Solid', 'horizontal_rule'], ['dashed', 'Dashed', 'more_horiz'], ['dotted', 'Dotted', 'more_horiz']].map(([k, n, ic]) => ({ label:n, icon:ic, checked:(v.dash || 'solid') === k, on:() => B.setStyle({ dash:k }) }))); },
  opacity:b => {
    const v = B.styleView(), out = el('b', { text:Math.round((v.op == null ? 1 : v.op) * 100) + '%' }), r = el('input', { type:'range', min:10, max:100, value:Math.round((v.op == null ? 1 : v.op) * 100), 'aria-label':'Opacity' });
    r.oninput = () => { out.textContent = r.value + '%'; }; r.onchange = () => B.setStyle({ op:r.value / 100 });
    ONE.pop.open(b, el('div', { class:'oprow nomd' }, r, out));
  },
  font:b => { const v = B.styleView(); ONE.menuAt(b, Object.entries(D.FONTS).map(([k, [n, css]]) => ({ html:`<span class="fontsample" style="font-family:${css}">${esc(n)}</span>`, checked:v.font === k, on:() => B.setStyle({ font:k }) }))); },
  size:b => { const v = B.styleView(); ONE.menuAt(b, D.SIZES.map(s => ({ label:s + ' pt', checked:Math.round(v.size) === s, on:() => B.setStyle({ size:s }) }))); },
  bg:b => ONE.menuAt(b, D.BGS.map(([k, n, ic]) => ({ label:n, icon:ic, checked:D.page().bg === k, on:() => { D.page().bg = k; B.changed(); renderPages(); } }))),
  pagecolor:b => ONE.menuAt(b, D.PAGE_COLORS.map(([c, n]) => ({ html:`<span style="display:inline-flex;align-items:center;gap:10px"><i style="width:18px;height:18px;border-radius:5px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.25);background:${c || 'linear-gradient(135deg,#fff 50%,#1c1d22 50%)'}"></i>${esc(n)}</span>`, checked:(D.page().color || null) === c, on:() => { D.page().color = c; B.changed(); renderPages(); } }))),
  dockShapes:b => ONE.menuAt(b, Object.entries(SHAPES).map(([k, [n, ic, key]]) => ({ label:n, icon:ic, kbd:key, checked:B.tool === k, on:() => B.setTool(k) })))
});

/* ---------- ribbon ---------- */
const STATES = { lockTool:() => B.lock, togglePages:() => !appEl.classList.contains(innerWidth <= 900 ? 'nav-open' : 'pages-hidden'), fullPage:() => appEl.classList.contains('fullpage') };
Object.keys(TOOL_NAME).forEach(t => { STATES['tool:' + t] = () => B.tool === t; });
const tool = (ic, label, t, kbd, o = {}) => ['L', ic, label, 'tool:' + t, Object.assign({ state:true, kbd }, o)];
const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Clipboard', items:[['L', 'content_paste', 'Paste', 'paste'], ['C', [['S', 'content_cut', 'Cut', 'cut', { kbd:'Ctrl+X' }], ['S', 'content_copy', 'Copy', 'copy', { kbd:'Ctrl+C' }]]]] },
    { label:'Tools', items:[tool('near_me', 'Select', 'select', 'V'), tool('pan_tool', 'Move', 'hand', 'H'), tool('edit', 'Pen', 'pen', 'P', { html:`<span class="ic-bar">${icon('edit')}<i id="barPen"></i></span>` }), tool('ink_highlighter', 'Highlighter', 'hl', 'I', { html:`<span class="ic-bar">${icon('ink_highlighter')}<i id="barHl"></i></span>` }), tool('ink_eraser', 'Eraser', 'eraser', 'E'), tool('flare', 'Laser', 'laser', 'L')] },
    { label:'Shapes', items:[['C', [['R', [['I', 'horizontal_rule', 'Line', 'tool:line', { state:true, kbd:'S' }], ['I', 'arrow_right_alt', 'Arrow', 'tool:arrow', { state:true, kbd:'A' }], ['I', 'check_box_outline_blank', 'Rectangle', 'tool:rect', { state:true, kbd:'R' }]]], ['R', [['I', 'radio_button_unchecked', 'Ellipse', 'tool:ellipse', { state:true, kbd:'O' }], ['I', 'diamond', 'Diamond', 'tool:diamond', { state:true, kbd:'D' }]]]]]] },
    { label:'Insert', items:[tool('text_fields', 'Text', 'text', 'T'), tool('sticky_note_2', 'Sticky note', 'sticky', 'N'), ['L', 'image', 'Picture', 'picture']] },
    { label:'Handwriting', items:[tool('edit_note', 'Write to text', 'write', 'W'), ['L', 'font_download', 'Convert to text', 'inkToText'], ['L', 'draw', 'Writing pad', 'pad']] }
  ] },
  { id:'style', label:'Style', groups:[
    { label:'Color', items:[['LD', 'palette', 'Color', 'pop:stroke', { html:`<span class="ic-bar">${icon('palette')}<i id="barStroke"></i></span>` }], ['LD', 'format_color_fill', 'Fill', 'pop:fill', { html:`<span class="ic-bar">${icon('format_color_fill')}<i id="barFill"></i></span>` }], ['LD', 'sticky_note_2', 'Note color', 'pop:sticky']] },
    { label:'Line', items:[['LD', 'line_weight', 'Width', 'pop:width'], ['LD', 'line_style', 'Dashes', 'pop:dash'], ['LD', 'opacity', 'Opacity', 'pop:opacity']] },
    { label:'Text', items:[['LD', 'font_download', 'Font', 'pop:font'], ['LD', 'format_size', 'Size', 'pop:size']] },
    { label:'Arrange', items:[['L', 'flip_to_front', 'To front', 'front', { kbd:']' }], ['L', 'flip_to_back', 'To back', 'back', { kbd:'[' }], ['C', [['S', 'control_point_duplicate', 'Duplicate', 'dupe', { kbd:'Ctrl+D' }], ['S', 'delete', 'Delete', 'del', { kbd:'Del' }]]]] }
  ] },
  { id:'write', label:'Write', groups:[
    { label:'Handwriting to text', items:[tool('edit_note', 'Write mode', 'write', 'W'), ['L', 'font_download', 'Convert selection', 'inkToText'], ['L', 'draw', 'Writing pad', 'pad']] },
    { label:'Pen', items:[tool('edit', 'Pen', 'pen', 'P'), ['LD', 'palette', 'Color', 'pop:stroke'], ['LD', 'line_weight', 'Width', 'pop:width']] },
    { label:'Select', items:[tool('near_me', 'Select', 'select', 'V'), ['L', 'select_all', 'Select all', 'selectAll', { kbd:'Ctrl+A' }]] }
  ] },
  { id:'page', label:'Page', groups:[
    { label:'Pages', items:[['L', 'note_add', 'New page', 'newPage'], ['C', [['S', 'content_copy', 'Duplicate', 'dupPageNow'], ['S', 'delete', 'Delete', 'delPageNow']]]] },
    { label:'Background', items:[['LD', 'grid_goldenratio', 'Pattern', 'pop:bg'], ['LD', 'format_color_fill', 'Page color', 'pop:pagecolor']] },
    { label:'Clear', items:[['L', 'layers_clear', 'Clear page', 'clearPage']] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Zoom', items:[['L', 'zoom_out', 'Zoom out', 'zoomOut', { kbd:'-' }], ['L', 'zoom_in', 'Zoom in', 'zoomIn', { kbd:'+' }], ['C', [['S', 'fit_screen', 'Fit all', 'fit', { kbd:'Shift+1' }], ['S', 'crop_free', '100%', 'zoom100', { kbd:'Ctrl+0' }]]]] },
    { label:'Show', items:[['L', 'view_sidebar', 'Pages', 'togglePages', { state:true }], ['L', 'fullscreen', 'Full screen', 'fullPage', { state:true, kbd:'F11' }]] },
    { label:'Drawing', items:[['SW', 'Keep tool after each shape', 'lockTool', { state:'lockTool' }]] }
  ] }
];
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return; if (b.closest('.titlebar,.status,.dock,.selbar,.pagesbar')) run(b.dataset.act, b, e); });
$('.qat').addEventListener('mousedown', e => e.preventDefault());
$('#selbar').addEventListener('mousedown', e => e.preventDefault());
ONE.commandSearch($('#topSearch'), { run });
$('#zoomRange').addEventListener('input', e => B.zoomAt(e.target.value / 100, $('#boardwrap').clientWidth / 2, $('#boardwrap').clientHeight / 2));
$('#picInput').addEventListener('change', async e => { const f = [...e.target.files]; e.target.value = ''; for (const x of f) await B.loadImageFile(x); });
const title = $('#docTitle');
title.addEventListener('input', () => { D.doc.title = title.value; D.dirty(); });
title.addEventListener('keydown', e => { if (e.key === 'Enter') title.blur(); e.stopPropagation(); });

/* ---------- keyboard & clipboard ---------- */
function shortcuts(){
  const list = [['Select / Move','V / H (or hold Space)'], ['Pen / Highlighter / Eraser','P / I / E'], ['Write to text','W'], ['Laser pointer','L'], ['Line / Arrow','S / A'], ['Rectangle / Ellipse / Diamond','R / O / D'], ['Text / Sticky note','T / N'],
    ['Undo / Redo','Ctrl+Z / Ctrl+Y'], ['Select all','Ctrl+A'], ['Copy / Cut / Paste','Ctrl+C / X / V'], ['Duplicate','Ctrl+D'], ['Delete','Del'], ['Move the selection','Arrow keys (Shift for more)'], ['Edit the text of the selection','Enter'],
    ['To front / back','] / ['], ['Straight lines and squares','Hold Shift while drawing'], ['Zoom','Ctrl + scroll, pinch, + / -'], ['Fit everything','Shift+1'], ['Zoom to 100%','Ctrl+0'], ['Move the board','Scroll, or drag with Space held'], ['Save','Ctrl+S'], ['Full screen','F11']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:560, body:`<div style="display:grid;grid-template-columns:1fr auto;gap:6px 18px;color:var(--on-surface)">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}
const typing = t => t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable);
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); return A.save(); }
  if (ONE.topModal() || ONE.backstage.isOpen() || typing(e.target)) return;
  if (e.key === 'F11') { e.preventDefault(); return A.fullPage(); }
  if (e.key === 'F1') { e.preventDefault(); return shortcuts(); }
  if (e.altKey && !mod && k === 'q') { e.preventDefault(); return $('#topSearch').focus(); }
  if (e.key === ' ' && !mod) { e.preventDefault(); if (!e.repeat) B.setSpace(true); return; }
  if (mod) {
    if (k === 'z') { e.preventDefault(); return e.shiftKey ? A.redo() : A.undo(); }
    if (k === 'y') { e.preventDefault(); return A.redo(); }
    if (k === 'a') { e.preventDefault(); return B.selectAll(); }
    if (k === 'd') { e.preventDefault(); return B.dupe(); }
    if (k === '0') { e.preventDefault(); return A.zoom100(); }
    if (k === '=' || k === '+') { e.preventDefault(); return A.zoomIn(); }
    if (k === '-') { e.preventDefault(); return A.zoomOut(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return B.del(); }
  if (e.key === 'Escape') { if (appEl.classList.contains('fullpage')) return A.fullPage(); if (B.sel.length) return B.select([]); return B.setTool('select'); }
  if (e.key === 'Enter') { if (B.editSelected()) e.preventDefault(); return; }
  if (e.key.startsWith('Arrow')) { if (!B.sel.length) return; e.preventDefault(); const d = e.shiftKey ? 20 : 4; return B.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0); }
  if (e.key === '!' || (e.shiftKey && k === '1')) return A.fit();
  if (e.key === '+' || e.key === '=') return A.zoomIn();
  if (e.key === '-') return A.zoomOut();
  if (e.key === ']') return B.order('front'); if (e.key === '[') return B.order('back');
  if (e.altKey) return;
  const map = { v:'select', h:'hand', p:'pen', i:'hl', w:'write', e:'eraser', l:'laser', s:'line', a:'arrow', r:'rect', o:'ellipse', d:'diamond', t:'text', n:'sticky' };
  if (map[k]) { e.preventDefault(); B.setTool(map[k]); }
});
document.addEventListener('keyup', e => { if (e.key === ' ') B.setSpace(false); });
addEventListener('blur', () => B.setSpace(false));
const inBoard = t => !typing(t) && !ONE.topModal() && !ONE.backstage.isOpen();
document.addEventListener('copy', e => { if (!inBoard(e.target) || !B.sel.length || B.editing()) return; if (B.copy()) { e.clipboardData.setData('text/plain', B.clipStamp); e.preventDefault(); } });
document.addEventListener('cut', e => { if (!inBoard(e.target) || !B.sel.length || B.editing()) return; if (B.copy()) { e.clipboardData.setData('text/plain', B.clipStamp); e.preventDefault(); B.del(); } });
document.addEventListener('paste', e => {
  if (!inBoard(e.target)) return; const cd = e.clipboardData; if (!cd) return; e.preventDefault();
  const text = cd.getData('text/plain'); if (B.clip && text && text === B.clipStamp) return void B.pasteClip();
  const files = [...(cd.files || [])].filter(f => /^image\//.test(f.type)); if (files.length) return void files.forEach(B.loadImageFile);
  if (text && text.trim()) return void B.addText(text.slice(0, 4000)); B.pasteClip();
});

/* ---------- File backstage ---------- */
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
function openDoc(doc, quiet){ if (!doc) return ONE.toast('That board couldn’t be opened.'); B.endEdit(); D.open(doc); ONE.backstage.close(); if (!quiet) B.setTool('pen'); setTimeout(() => B.fit(), 30); }
function newFrom(k){ const t = D.TEMPLATES[k] || D.TEMPLATES.blank; B.endEdit(); D.open(t.make()); ONE.backstage.close(); B.setTool(k === 'notes' ? 'write' : 'pen'); if (k === 'blank' || k === 'plain' || k === 'notes') B.setView({ k:1, tx:$('#boardwrap').clientWidth / 2, ty:$('#boardwrap').clientHeight / 2 }); }
function importText(text, name){
  let d; try { d = JSON.parse(text); } catch { return ONE.toast('That isn’t a oneDraw board.'); }
  if (!d || !Array.isArray(d.pages) || !d.pages.length || !d.pages.every(p => p && Array.isArray(p.els))) return ONE.toast('That isn’t a oneDraw board.');
  if (D.lib.docs[d.id]) d.id = ONE.uid(); d.title = d.title || String(name || 'Imported board').replace(/\.[^.]+$/, ''); D.open(d); D.save(); ONE.backstage.close(); setTimeout(() => B.fit(), 30); ONE.toast(`Opened “${d.title}”.`);
}
$('#openInput').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; for (const f of fs) importText(await f.text(), f.name); });
function recentCards(q, max = 300){
  const wrap = el('div', { class:'bdgrid' }), docs = Object.entries(D.lib.docs).filter(([, m]) => !q || (m.title || '').toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) return el('p', { class:'home-empty', text:q ? 'No boards match that search.' : 'No boards yet. Start one above.' });
  docs.forEach(([id, m]) => {
    const c = el('div', { class:'bdc-wrap', style:{ position:'relative' } });
    const b = el('button', { class:'bdc', title:m.title, onclick:() => openDoc(store.get('od-doc-' + id)) },
      el('div', { class:'pv', style:m.thumb ? { backgroundImage:`url(${m.thumb})` } : null, html:m.thumb ? '' : icon('draw') }), el('div', { class:'tt', html:`<b>${esc(m.title)}${id === D.doc.id ? ' · open now' : ''}</b><small>${fmtDate(m.updated)} · ${m.pages} page${m.pages === 1 ? '' : 's'}</small>` }));
    c.append(b);
    if (id !== D.doc.id) c.append(el('button', { class:'icon-btn x', title:'Delete', 'aria-label':'Delete ' + m.title, html:icon('delete'), onclick:ev => { ev.stopPropagation(); ONE.modal({ title:`Delete “${m.title}”?`, body:'The whole board will be removed from this browser. This can’t be undone.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('od-doc-' + id); delete D.lib.docs[id]; store.set('od-lib', D.lib); ONE.backstage.show(ONE.backstage.current || 'home'); } }] }); } }));
    wrap.append(c);
  });
  return wrap;
}
ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => {
    const hr = new Date().getHours(), search = el('input', { placeholder:'Search your boards', 'aria-label':'Search your boards' });
    b.append(el('div', { class:'home-hero' }, el('h1', { text:hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }), el('label', { class:'home-search', html:icon('search') }, search)), el('h3', { text:'Start a board' }));
    const g = el('div', { class:'tpl' }); Object.entries(D.TEMPLATES).forEach(([k, t]) => g.append(el('button', { class:'tpl-card', onclick:() => newFrom(k) }, el('div', { class:'thumb tplt', html:icon(t.icon) }), el('span', { html:`${esc(t.name)}<small><br>${esc(t.desc)}</small>` }))));
    const holder = el('div'); b.append(g, el('h3', { text:'Your boards' }), holder); const draw = () => { holder.innerHTML = ''; holder.append(recentCards(search.value)); }; search.oninput = draw; draw(); } },
  { id:'open', label:'Open', icon:'folder_open', render:b => { b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })), el('p', { class:'bs-note', text:'Opens oneDraw boards (.onedraw or .json).' }), el('h3', { text:'Recent' }), recentCards('', 12)); } },
  { id:'info', label:'Info', icon:'info', render:b => {
    B.endEdit(); const els = D.doc.pages.flatMap(p => p.els), count = f => els.filter(f).length, size = (() => { try { return JSON.stringify(D.clean(D.doc)).length; } catch { return 0; } })();
    b.append(el('h1', { text:'Info' }), el('div', { class:'info', html:`<span>Board</span><span>${esc(D.doc.title)}</span><span>Pages</span><span>${D.doc.pages.length}</span><span>Drawings</span><span>${count(e => e.t === 'pen')}</span><span>Shapes</span><span>${count(e => ['rect', 'ellipse', 'diamond', 'line'].includes(e.t))}</span><span>Text and sticky notes</span><span>${count(e => e.t === 'text' || e.t === 'sticky')}</span><span>Pictures</span><span>${count(e => e.t === 'img')}</span><span>Size</span><span>${(size / 1048576).toFixed(2)} MB</span><span>Created</span><span>${fmtDate(D.doc.created)}</span><span>Last saved</span><span>${fmtDate(D.doc.updated)}</span>` })); } },
  { id:'print', label:'Print', icon:'print', render:b => b.append(el('h1', { text:'Print' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('print')}Print every page`, onclick:() => { ONE.backstage.close(); A.print(); } })), el('p', { class:'bs-note', text:'Prints each page on its own sheet. Choose “Save as PDF” in the print window to make a PDF.' })) },
  { id:'export', label:'Export', icon:'ios_share', render:b => {
    const row = ([t, d, ic, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn filled', text:'Save', onclick:fn }));
    b.append(el('h1', { text:'Export' }), el('div', { class:'list' }, ...[['Picture (.png)', 'This page as an image, cropped to what’s on it.', 'image', () => { ONE.backstage.close(); A.exportPng(); }], ['oneDraw board (.onedraw)', 'Everything, to reopen here or in another browser with File › Open.', 'data_object', A.exportFile]].map(row))); } },
  '-',
  { id:'close', label:'Close', icon:'close', render:() => { D.save(); ONE.backstage.show('home'); } }
]);

/* ---------- boot ---------- */
D.hooks.push(() => { title.value = D.doc.title; B.loadPage(); renderPages(); status(); B.onTool(B.tool); });
const first = D.lib.current && store.get('od-doc-' + D.lib.current), pendId = ONE.pendingOpen(), pend = pendId && store.get('od-doc-' + pendId);
B.tool = '_'; B.setTool('pen');
D.open(pend || first || D.TEMPLATES.blank.make());
if (!pend) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => openDoc(store.get('od-doc-' + id), true);
ONE.onNewRequest = k => newFrom(D.TEMPLATES[k] ? k : 'blank');
addEventListener('beforeunload', () => { B.endEdit(); D.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { B.endEdit(); D.save(); } });
if (document.fonts) document.fonts.ready.then(() => { B.draw(); renderPages(); });
})();
