/* oneSlide — extras: group/ungroup, SmartArt, Design Ideas, show pen, .pptx export, printing */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const A = S.act, P = S.pops;

/* ---------- groups ---------- */
S.groupOf = id => { const e = S.byId(id); if (!e || !e.group) return [id]; return S.slide().els.filter(x => x.group === e.group).map(x => x.id); };
A.group = () => { const els = S.selEls(); if (els.length < 2) return ONE.toast('Select two or more objects to group them (Shift+click).'); const g = S.newId(); els.forEach(e => e.group = g); S.changed(); ONE.toast('Grouped. Click any part to select the whole group.'); };
A.ungroup = () => { const els = S.selEls(); if (!els.some(e => e.group)) return ONE.toast('The selection isn’t a group.'); els.forEach(e => delete e.group); S.changed(); };

/* ---------- SmartArt ---------- */
const ACC = i => 'accent' + ((i % 6) + 1);
const SH = (shape, x, y, w, h, style, html = '') => ({ id:S.newId(), mid:S.newId(), type:'shape', shape, x, y, w, h, rot:0, html, style });
const TX = (x, y, w, h, html, style) => ({ id:S.newId(), mid:S.newId(), type:'text', x, y, w, h, rot:0, html, style });
const SMART = {
  process:{ name:'Basic Process', icon:'double_arrow', build:(items, W) => { const n = items.length, gap = 14, w = (W - 200 - gap * (n - 1)) / n; return items.map((t, i) => SH('chevron', 100 + i * (w + gap), 280, w, 150, { fill:ACC(i), size:22, bold:true }, esc(t))); } },
  cycle:{ name:'Cycle', icon:'autorenew', build:(items, W) => { const n = items.length, cx = W / 2, cy = 390, R = 190, s = 150; return items.map((t, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return SH('ellipse', cx + R * Math.cos(a) - s / 2, cy + R * Math.sin(a) - s / 2, s, s, { fill:ACC(i), size:18, bold:true }, esc(t)); }).concat([SH('ellipse', cx - 60, cy - 60, 120, 120, { fill:'none', line:'body', lw:3, dash:'dash' })]); } },
  list:{ name:'Vertical List', icon:'view_agenda', build:(items, W) => { const n = items.length, h = Math.min(90, 440 / n - 12); return items.flatMap((t, i) => [SH('round', 200, 190 + i * (h + 12), 80, h, { fill:ACC(i), size:26, bold:true }, String(i + 1)), SH('round', 296, 190 + i * (h + 12), W - 496, h, { fill:ACC(i), opacity:.18, color:'body', size:22, valign:'middle', align:'left', pad:20 }, esc(t))]); } },
  pyramid:{ name:'Pyramid', icon:'change_history', build:(items, W) => { const n = items.length, h = 420 / n; return items.map((t, i) => { const w = 260 + (i + 1) * (560 / n); return SH('round', (W - w) / 2, 190 + i * h, w, h - 8, { fill:ACC(i), size:20, bold:true, radius:10 }, esc(t)); }); } },
  timeline:{ name:'Timeline', icon:'timeline', build:(items, W) => { const n = items.length, step = (W - 240) / Math.max(1, n - 1); return [SH('line', 120, 392, W - 240, 16, { line:'body', lw:4 })].concat(items.flatMap((t, i) => { const x = 120 + (n === 1 ? (W - 240) / 2 : i * step); return [SH('ellipse', x - 18, 382, 36, 36, { fill:ACC(i) }), TX(x - 110, i % 2 ? 430 : 250, 220, 110, `<b>${esc(t)}</b>`, { size:20, align:'center', valign:i % 2 ? 'top' : 'bottom' })]; })); } },
  matrix:{ name:'Grid Matrix', icon:'grid_view', build:(items, W) => { const cols = items.length > 4 ? 3 : 2, rows = Math.ceil(items.length / cols), w = 300, h = Math.min(170, 440 / rows - 12), x0 = (W - cols * w - (cols - 1) * 14) / 2; return items.map((t, i) => SH('round', x0 + (i % cols) * (w + 14), 190 + Math.floor(i / cols) * (h + 14), w, h, { fill:ACC(i), size:22, bold:true }, esc(t))); } }
};
P.smartart = a => ONE.menuAt(a, Object.entries(SMART).map(([k, v]) => ({ label:v.name, icon:v.icon, on:() => A.smartart(k) })));
A.smartart = kind => {
  const def = S.selEls()[0] && S.selEls()[0].html ? (() => { const d = document.createElement('div'); d.innerHTML = S.selEls()[0].html; const li = [...d.querySelectorAll('li')].map(x => x.textContent.trim()).filter(Boolean); return li.length ? li : d.innerText.split('\n').map(x => x.trim()).filter(Boolean); })() : ['Plan', 'Build', 'Launch', 'Grow'];
  const t = el('textarea', { class:'tf', rows:6 }); t.value = def.slice(0, 8).join('\n');
  ONE.modal({ title:`SmartArt: ${SMART[kind].name}`, icon:SMART[kind].icon, body:el('div', { class:'dlg-col' }, el('p', { text:'One item per line (2–8). If a text box with bullets was selected, its points are filled in for you.' }), t), actions:[{ label:'Cancel' }, { label:'Insert', kind:'filled', on:() => {
    const items = t.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8); if (items.length < 2) { ONE.toast('Enter at least two items.'); return false; }
    S.commitText(); const g = S.newId(), els = SMART[kind].build(items, S.W()); els.forEach(e => e.group = g);
    S.slide().els.push(...els); S.sel = els.map(e => e.id); S.changed(); ONE.toast('SmartArt inserted as a group. Double-click a shape to edit its text; Ungroup to move pieces.');
  } }] });
};

/* ---------- Design Ideas ---------- */
const clone = o => JSON.parse(JSON.stringify(o));
const IDEAS = [
  ['Side panel', (s, W, H) => { const t = s.els.find(e => e.role === 'title'), rest = s.els.filter(e => e !== t && !e.deco);
    const deco = [Object.assign(SH('rect', 0, 0, W * .36, H, { fill:'accent1' }), { deco:true })]; if (t) Object.assign(t, { x:60, y:80, w:W * .36 - 110, h:H - 160, style:Object.assign({}, t.style, { color:'#FFFFFF', size:48, valign:'middle', align:'left' }) });
    const x0 = W * .36 + 60; rest.forEach((e, i) => Object.assign(e, { x:x0, w:W - x0 - 70, y:rest.length === 1 ? 110 : 80 + i * (H - 160) / rest.length, h:rest.length === 1 ? H - 220 : (H - 160) / rest.length - 20 })); return [deco, t]; }],
  ['Top band', (s, W, H) => { const t = s.els.find(e => e.role === 'title'), rest = s.els.filter(e => e !== t && !e.deco);
    const deco = [Object.assign(SH('rect', 0, 0, W, 210, { fill:'accent1' }), { deco:true }), Object.assign(SH('rect', 0, 210, W, 8, { fill:'accent2' }), { deco:true })];
    if (t) Object.assign(t, { x:80, y:40, w:W - 160, h:150, style:Object.assign({}, t.style, { color:'#FFFFFF', size:46, valign:'middle', align:'left' }) });
    rest.forEach((e, i) => Object.assign(e, { x:80 + i * ((W - 160) / rest.length), y:260, w:(W - 160) / rest.length - 30, h:H - 320 })); return [deco, t]; }],
  ['Centered', (s, W, H) => { const t = s.els.find(e => e.role === 'title'), rest = s.els.filter(e => e !== t && !e.deco);
    const deco = [Object.assign(SH('rect', W / 2 - 60, 300, 120, 6, { fill:'accent1' }), { deco:true })];
    if (t) Object.assign(t, { x:120, y:120, w:W - 240, h:170, style:Object.assign({}, t.style, { size:54, align:'center', valign:'bottom', color:undefined }) });
    rest.forEach((e, i) => Object.assign(e, { x:200, y:330 + i * 60, w:W - 400, h:(H - 400) / Math.max(1, rest.length), style:Object.assign({}, e.style, { align:'center' }) })); return [deco, t]; }],
  ['Card', (s, W, H) => { const t = s.els.find(e => e.role === 'title'), rest = s.els.filter(e => e !== t && !e.deco);
    const deco = [Object.assign(SH('round', 90, 190, W - 180, H - 250, { fill:'accent1', opacity:.1, radius:28 }), { deco:true }), Object.assign(SH('rect', 90, 190, 10, H - 250, { fill:'accent1' }), { deco:true })];
    if (t) Object.assign(t, { x:90, y:50, w:W - 180, h:120, style:Object.assign({}, t.style, { size:44, align:'left', valign:'bottom', color:undefined }) });
    rest.forEach((e, i) => Object.assign(e, { x:140 + i * ((W - 280) / rest.length), y:220, w:(W - 280) / rest.length - 30, h:H - 310 })); return [deco, t]; }]
];
S.ideas = () => { const s = S.slide(); return IDEAS.map(([name, fn]) => { const c = clone(s); c.els = c.els.filter(e => !e.deco); const [deco] = fn(c, S.W(), S.H()); c.els = [...deco, ...c.els]; return { name, slide:c }; }); };
A.designIdeas = () => {
  S.commitText(); const ideas = S.ideas(); const g = el('div', { class:'ideas' }); let m;
  ideas.forEach((it, i) => { const b = el('button', { class:'idea', style:{ animationDelay:i * 60 + 'ms' }, 'aria-label':it.name }, S.thumb(it.slide, 250), el('span', { text:it.name }));
    b.onclick = () => { const s = S.slide(); s.els = it.slide.els; S.sel = []; S.changed(); m.close(); ONE.toast(`Applied “${it.name}”. Ctrl+Z to undo.`); }; g.append(b); });
  const reset = S.slide().els.some(e => e.deco);
  m = ONE.modal({ title:'Design Ideas', icon:'auto_awesome', width:620, body:el('div', { class:'dlg-col' }, el('p', { text:'Layouts made from this slide’s content, in your theme colors.' }), g), actions:[reset ? { label:'Remove design', kind:'text', on:() => { S.slide().els = S.slide().els.filter(e => !e.deco); S.changed(); } } : null, { label:'Close', kind:'filled' }].filter(Boolean) });
};

/* ---------- pen & highlighter in slide show ---------- */
S.attachPen = (stageBox, slideNode) => {
  const cv = el('canvas', { class:'pen-layer' }); cv.width = S.W(); cv.height = S.H(); slideNode.append(cv);
  const g = cv.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; let last = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * S.W() / r.width, (e.clientY - r.top) * S.H() / r.height]; };
  cv.addEventListener('pointerdown', e => { if (!S.penMode) return; e.stopPropagation(); cv.setPointerCapture(e.pointerId); last = pos(e); });
  cv.addEventListener('pointermove', e => { if (!S.penMode || !last) return; const p = pos(e); g.globalCompositeOperation = S.penMode === 'erase' ? 'destination-out' : 'source-over'; g.strokeStyle = S.penMode === 'hl' ? 'rgba(255,214,0,.4)' : '#E53935'; g.lineWidth = S.penMode === 'hl' ? 26 : S.penMode === 'erase' ? 40 : 4; g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; });
  cv.addEventListener('pointerup', () => { last = null; });
  cv.addEventListener('click', e => { if (S.penMode) e.stopPropagation(); });
  return cv;
};
S.setPen = (mode, root) => { S.penMode = S.penMode === mode ? null : mode; (root || document).querySelectorAll('.pen-layer').forEach(c => c.classList.toggle('on', !!S.penMode)); const show = document.querySelector('.show'); if (show) show.classList.toggle('penning', !!S.penMode); ONE.toast(S.penMode ? { pen:'Pen on. Press P again to stop, E to erase all.', hl:'Highlighter on. Press H again to stop.', erase:'Eraser on.' }[S.penMode] : 'Pointer mode.'); };

/* ---------- .pptx export (native shapes, tables, charts and notes) ---------- */
const hex = c => { if (!c) return undefined; const v = S.color(c, c); const m = /#([0-9a-f]{6})/i.exec(v) || /#([0-9a-f]{3})\b/i.exec(v); if (!m) return undefined; return (m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1]).toUpperCase(); };
const inch = px => px / 96;
const PPT_SHAPES = { rect:'rect', round:'roundRect', ellipse:'ellipse', triangle:'triangle', rtriangle:'rtTriangle', diamond:'diamond', pentagon:'pentagon', hexagon:'hexagon', arrowR:'rightArrow', arrowL:'leftArrow', arrowU:'upArrow', chevron:'chevron', star:'star5', heart:'heart', callout:'wedgeRoundRectCallout', plus:'mathPlus', line:'line', arrowLine:'line', wave:'wave', frame:'frame' };
function runsOf(e, t, dflt) {
  const st = e.style || {}, d = document.createElement('div'); d.innerHTML = e.html || '';
  const isTitle = e.role === 'title', base = { fontFace:((st.font || (isTitle ? t.tf : t.bf)).split(',')[0].replace(/["']/g, '').trim()), fontSize:Math.round((st.size || (isTitle ? 44 : 24)) * .75), color:hex(st.color) || dflt, bold:!!st.bold, italic:!!st.italic, underline:st.underline ? { style:'sng' } : undefined, strike:st.strike ? 'sngStrike' : undefined };
  const lis = [...d.querySelectorAll('li')];
  if (lis.length) return lis.map(li => ({ text:li.innerText.trim(), options:Object.assign({}, base, { bullet:li.parentElement.tagName === 'OL' ? { type:'number' } : true, breakLine:true }) }));
  const lines = d.innerText.split('\n'); return lines.map((l, i) => ({ text:l, options:Object.assign({}, base, { breakLine:i < lines.length - 1 }) }));
}
function iconPNG(name, color, size) { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = color || '#2A5EA8'; g.font = `220px "Material Symbols Rounded"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 128, 136); return c.toDataURL('image/png'); }
A.savePptx = async () => {
  ONE.toast('Building .pptx…');
  try {
    await ONE.loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
    const pptx = new window.PptxGenJS(), t = S.theme();
    pptx.layout = S.deck.ratio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE'; pptx.title = S.deck.title;
    const bgHex = v => hex(String(v || '').match(/#[0-9a-f]{6}/i)?.[0] || '#FFFFFF');
    for (const s of S.deck.slides) {
      const sl = pptx.addSlide();
      sl.background = s.bg && s.bg.img ? { data:s.bg.img } : { color:bgHex(s.bg ? s.bg.value : t.bg) };
      if (s.hidden) sl.hidden = true;
      for (const e of s.els) {
        const st = e.style || {}, box = { x:inch(e.x), y:inch(e.y), w:inch(e.w), h:inch(e.h), rotate:e.rot || 0 };
        if (e.role && !e.html) continue;
        if (e.type === 'text') { sl.addText(runsOf(e, t, hex(e.role === 'title' ? t.title : t.body)), Object.assign(box, { align:st.align || 'left', valign:st.valign === 'middle' ? 'middle' : st.valign === 'bottom' ? 'bottom' : 'top', margin:4, fill:st.fill && st.fill !== 'none' ? { color:hex(st.fill) } : undefined })); }
        else if (e.type === 'shape') {
          const line = S.isLine(e.shape), fill = line || st.fill === 'none' ? undefined : { color:hex(st.fill || 'accent1'), transparency:st.opacity != null ? Math.round((1 - st.opacity) * 100) : 0 };
          const opts = Object.assign(box, { fill, line:st.line && st.line !== 'none' ? { color:hex(st.line), width:(st.lw || 2) * .75, endArrowType:e.shape === 'arrowLine' ? 'triangle' : undefined } : line ? { color:hex(t.body), width:3, endArrowType:e.shape === 'arrowLine' ? 'triangle' : undefined } : undefined, shadow:st.shadow ? { type:'outer', blur:8, offset:3, angle:90, opacity:.3 } : undefined, rectRadius:e.shape === 'round' ? .15 : undefined });
          if (e.html && !line) sl.addText(runsOf(e, t, 'FFFFFF'), Object.assign(opts, { shape:pptx.ShapeType[PPT_SHAPES[e.shape]] || 'rect', align:st.align || 'center', valign:st.valign === 'top' ? 'top' : st.valign === 'bottom' ? 'bottom' : 'middle' }));
          else sl.addShape(pptx.ShapeType[PPT_SHAPES[e.shape]] || 'rect', opts);
        }
        else if (e.type === 'image') sl.addImage(Object.assign(box, { data:e.src, sizing:e.fit === 'contain' ? { type:'contain', w:box.w, h:box.h } : { type:'cover', w:box.w, h:box.h }, altText:e.alt || '' }));
        else if (e.type === 'icon') sl.addImage(Object.assign(box, { data:iconPNG(e.icon, S.color(st.color, t.acc[0])), altText:e.alt || e.icon }));
        else if (e.type === 'table') { const acc = hex(st.fill) || hex(t.acc[0]); sl.addTable(e.rows.map((r, i) => r.map(c => ({ text:String(c).replace(/<[^>]+>/g, ''), options:i === 0 && e.header !== false ? { bold:true, color:'FFFFFF', fill:{ color:acc } } : { color:hex(t.body) } }))), Object.assign(box, { fontSize:Math.round((st.size || 18) * .75), fontFace:t.bf.split(',')[0].replace(/["']/g, ''), border:{ type:'solid', pt:.75, color:'D0D0D0' } })); }
        else if (e.type === 'chart') {
          const d = e.data || { cats:[], series:[] }, type = { column:pptx.ChartType.bar, line:pptx.ChartType.line, area:pptx.ChartType.area, pie:pptx.ChartType.pie, doughnut:pptx.ChartType.doughnut }[e.kind] || pptx.ChartType.bar;
          sl.addChart(type, d.series.map(se => ({ name:se.name, labels:d.cats, values:se.vals })), Object.assign(box, { barDir:'col', showTitle:!!e.title, title:e.title || '', showLegend:d.series.length > 1 || e.kind === 'pie' || e.kind === 'doughnut', legendPos:'b', chartColors:t.acc.map(hex), showPercent:e.kind === 'pie' || e.kind === 'doughnut', altText:e.alt || e.title || '' }));
        }
      }
      if (s.notes) sl.addNotes(s.notes);
    }
    const blob = await pptx.write({ outputType:'blob' });
    await ONE.download(($('#docTitle').value.trim() || 'Presentation') + '.pptx', blob, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  } catch (err) { console.error(err); ONE.toast('Couldn’t build the .pptx file. Check your connection and try again.'); }
};
A.printSlides = (perPage = 1) => {
  const W = S.W(), H = S.H(), pageW = 10.5 * 96, k = perPage === 1 ? pageW / W : (pageW / 2 - 24) / W;
  const slides = S.deck.slides.filter(s => !s.hidden).map(s => { const n = S.renderSlide(s); n.querySelectorAll('.anim-badge').forEach(x => x.remove()); return `<div class="pg"><div class="sl" style="width:${W * k}px;height:${H * k}px"><div style="transform:scale(${k});transform-origin:0 0;width:${W}px;height:${H}px">${n.outerHTML}</div></div>${perPage > 1 ? `<div class="nt">${esc(s.notes || '')}</div>` : ''}</div>`; }).join('');
  const css = [...document.styleSheets].map(ss => { try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
  const f = el('iframe', { style:{ position:'fixed', right:0, bottom:0, width:0, height:0, border:0 } }); document.body.append(f);
  const d = f.contentDocument; d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..800&family=Carlito:wght@400;700&family=EB+Garamond&family=Caveat:wght@500&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0..1,0"><style>${css}
    @page{size:letter landscape;margin:.4in}body{margin:0;background:#fff}.pg{break-after:page;display:flex;gap:24px;align-items:flex-start}.sl{overflow:hidden;box-shadow:0 0 0 1px #ccc;flex:none}.sl .slide{position:relative}.nt{font:12pt Calibri,Carlito,sans-serif;white-space:pre-wrap;color:#333}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${slides}</body></html>`); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { ONE.toast('This page isn’t allowed to print here. Save a .pptx and print it from your computer.'); } setTimeout(() => f.remove(), 3000); }, 900);
};
})();
