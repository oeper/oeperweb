/* oneSlide — commands: text, drawing, inserts, design, transitions, animations, slide show, views, review */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const A = S.act = {}, P = S.pops = {};
const need = () => { const e = S.selEls(); if (!e.length) ONE.toast('Select an object on the slide first.'); return e; };

/* ---------- insert ---------- */
const center = (w, h) => ({ x:(S.W() - w) / 2, y:(S.H() - h) / 2 });
S.addEl = e => { S.commitText(); e.id = e.id || S.newId(); e.mid = e.mid || S.newId(); e.style = e.style || {}; S.slide().els.push(e); S.sel = [e.id]; S.changed(); return e; };
S.insertText = (html = '') => { const e = S.addEl({ type:'text', ...center(560, 90), w:560, h:90, rot:0, html, style:{ size:28 } }); if (!html) setTimeout(() => S.editText(e.id, null), 30); return e; };
A.textBox = () => S.insertText('');
P.shapes = a => {
  const g = el('div', { class:'shapegrid' });
  Object.entries(S.SHAPES).forEach(([k, n]) => { const w = 34, h = 26; g.append(el('button', { title:n, 'aria-label':n, html:`<svg viewBox="-3 -3 ${w + 6} ${h + 6}" width="34" height="28"><path d="${S.shapePath(k, w, h)}" fill="${S.isLine(k) ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="${S.isLine(k) ? 2.5 : 0}" opacity=".85"/></svg>`, onclick:() => { ONE.pop.close(); A.addShape(k); } })); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Shapes' }), g));
};
A.addShape = k => { const line = S.isLine(k), w = line ? 300 : k === 'ellipse' || k === 'star' || k === 'heart' || k === 'plus' ? 220 : 280, h = line ? 20 : k === 'ellipse' || k === 'star' || k === 'heart' || k === 'plus' ? 220 : 170;
  S.addEl({ type:'shape', shape:k, ...center(w, h), w, h, rot:0, html:'', style:line ? { line:'body', lw:4 } : { fill:'accent1' } }); };
S.insertImageFile = f => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { let w = im.width, h = im.height; const k = Math.min(1, 800 / w, 520 / h); w *= k; h *= k; S.addEl({ type:'image', src:r.result, ...center(w, h), w, h, rot:0, alt:'', fit:'cover' }); }; im.src = r.result; }; r.readAsDataURL(f); };
A.picture = () => { const i = el('input', { type:'file', accept:'image/*' }); i.onchange = () => i.files[0] && S.insertImageFile(i.files[0]); i.click(); };
const ICONS = ['lightbulb','rocket_launch','eco','savings','groups','favorite','star','bolt','check_circle','trending_up','shield','public','schedule','school','local_florist','water_drop','sunny','potted_plant','handshake','chat','campaign','emoji_events','insights','calendar_month','location_on','shopping_cart','sell','inventory_2','build','science','psychology','pets','sports_soccer','music_note','photo_camera','flight','directions_bike','restaurant','home','work'];
P.icons = a => { const g = el('div', { class:'icongrid' }); ICONS.forEach(n => g.append(el('button', { title:n.replace(/_/g, ' '), 'aria-label':n.replace(/_/g, ' '), html:icon(n), onclick:() => { ONE.pop.close(); S.addEl({ type:'icon', icon:n, ...center(140, 140), w:140, h:140, rot:0, style:{ color:'accent1' }, alt:n.replace(/_/g, ' ') }); } }))); ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Icons' }), g)); };
P.table = a => {
  const lab = el('div', { class:'menu-title', text:'Insert Table' }), g = el('div', { class:'tgrid nomd' });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) g.append(el('span', { 'data-r':r, 'data-c':c }));
  g.addEventListener('pointerover', e => { const t = e.target.dataset; if (t.r == null) return; $$('span', g).forEach(s => s.classList.toggle('hot', +s.dataset.r <= +t.r && +s.dataset.c <= +t.c)); lab.textContent = `${+t.c + 1}×${+t.r + 1} Table`; });
  g.addEventListener('mousedown', e => e.preventDefault());
  g.addEventListener('click', e => { const t = e.target.dataset; if (t.r == null) return; ONE.pop.close(); const R = +t.r + 1, C = +t.c + 1; const w = Math.min(1000, C * 180), h = R * 54; S.addEl({ type:'table', ...center(w, h), w, h, rot:0, rows:Array.from({ length:R }, (_, i) => Array.from({ length:C }, (_, j) => i === 0 ? `Column ${j + 1}` : '')), header:true, banded:true, style:{} }); });
  ONE.pop.open(a, el('div', {}, lab, g));
};
S.editTable = t => {
  const tb = el('table', { class:'stbl edit' }); tb.innerHTML = t.rows.map(r => `<tr>${r.map(c => `<td contenteditable="true">${c}</td>`).join('')}</tr>`).join('');
  const add = (row) => { if (row) { const tr = tb.insertRow(); t.rows[0].forEach(() => { const c = tr.insertCell(); c.contentEditable = 'true'; }); } else [...tb.rows].forEach(tr => { const c = tr.insertCell(); c.contentEditable = 'true'; }); };
  ONE.modal({ title:'Edit Table', width:720, body:el('div', { class:'dlg-col' }, el('div', { style:{ overflow:'auto', maxHeight:'50vh' } }, tb), el('div', { class:'row', style:{ gap:'8px' } }, el('button', { class:'btn tonal', html:`${icon('table_rows')}Add row`, onclick:() => add(true) }), el('button', { class:'btn tonal', html:`${icon('view_column')}Add column`, onclick:() => add(false) }), el('button', { class:'btn text', text:'Delete last row', onclick:() => { if (tb.rows.length > 1) tb.deleteRow(-1); } }), el('button', { class:'btn text', text:'Delete last column', onclick:() => { if (tb.rows[0].cells.length > 1) [...tb.rows].forEach(r => r.deleteCell(-1)); } }))),
    actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => { t.rows = [...tb.rows].map(r => [...r.cells].map(c => esc(c.textContent))); t.h = Math.max(t.h, t.rows.length * 44); S.changed(); } }] });
};
A.chart = () => S.editChart(null);
S.editChart = t => {
  const kind = ONE.select([['column','Column'],['line','Line'],['area','Area'],['pie','Pie'],['doughnut','Doughnut']], t ? t.kind : 'column'), title = ONE.input({ value:t ? t.title || '' : 'Harvest by month (lb)' });
  const data = el('textarea', { class:'tf', rows:7, spellcheck:false });
  data.value = t ? ['\t' + t.data.series.map(s => s.name).join('\t'), ...t.data.cats.map((c, i) => c + '\t' + t.data.series.map(s => s.vals[i]).join('\t'))].join('\n') : '\t2025\t2026\nApr\t42\t58\nMay\t68\t90\nJun\t95\t124\nJul\t120\t161\nAug\t88\t130';
  const prev = el('div', { class:'chartprev' });
  const parse = () => { const rows = data.value.trim().split('\n').map(l => l.split(/\t|,/)); const head = rows[0].slice(1).map(s => s.trim()); return { cats:rows.slice(1).map(r => r[0].trim()), series:head.map((n, j) => ({ name:n || 'Series ' + (j + 1), vals:rows.slice(1).map(r => parseFloat(r[j + 1]) || 0) })) }; };
  const upd = () => { prev.innerHTML = S.chartSVG({ kind:kind.value, title:title.value, data:parse() }, 640, 340, S.theme()); };
  const body = el('div', { class:'dlg-col' }, el('div', { class:'grid2' }, ONE.field('Chart type', kind), ONE.field('Title', title)), ONE.field('Data (first row: series names; then “label, value, value…”)', data), prev);
  body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
  ONE.modal({ title:t ? 'Edit Chart' : 'Insert Chart', width:720, body, actions:[{ label:'Cancel' }, { label:t ? 'Save' : 'Insert', kind:'filled', on:() => { const d = parse(); if (t) { Object.assign(t, { kind:kind.value, title:title.value, data:d }); S.changed(); } else S.addEl({ type:'chart', kind:kind.value, title:title.value, data:d, ...center(760, 420), w:760, h:420, rot:0, alt:title.value }); } }] });
};
P.wordart = a => { const g = el('div', { class:'wagrid' }); Object.keys(S.WORDART).forEach(k => { const b = el('button', { html:`<span style="${S.WORDART[k]};font:800 34px 'Roboto Flex',sans-serif;color:${k === 'outline' ? '#2A5EA8' : '#C0392B'}">A</span>`, title:k, 'aria-label':`${k} WordArt` }); b.onclick = () => { ONE.pop.close(); const e = S.selEls()[0]; if (e && (e.type === 'text' || e.type === 'shape')) { S.applyStyle({ wordart:k }); } else S.addEl({ type:'text', ...center(760, 150), w:760, h:150, rot:0, html:'Your text here', style:{ size:84, bold:true, align:'center', valign:'middle', wordart:k, color:'accent1' } }); }; g.append(b); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'WordArt styles' }), g, ONE.menu([{ label:'Clear WordArt', icon:'format_clear', on:() => S.applyStyle({ wordart:undefined }) }]))); };
const SYMS = '©®™€£¥°±×÷≠≈≤≥∞√πΩαβµ←→↑↓↔⇒✓✗★☆♥•…—–½¼¾²³'.split('');
P.symbol = a => { const g = el('div', { class:'symgrid' }); SYMS.forEach(ch => g.append(el('button', { text:ch, onclick:() => { ONE.pop.close(); if (S.editing) S.execText('insertText', ch); else S.insertText(ch); } }))); ONE.pop.open(a, g); };
A.equation = () => S.addEl({ type:'text', ...center(560, 90), w:560, h:90, rot:0, html:'x = (−b ± √(b² − 4ac)) / 2a', style:{ size:36, italic:true, font:'"Cambria Math", Cambria, Caladea, serif', align:'center', valign:'middle' } });
A.headerFooter = () => { const f = S.deck.footer, d = ONE.check('Date', f.date), n = ONE.check('Slide number', f.num), t = ONE.input({ value:f.text, placeholder:'Footer text' });
  ONE.modal({ title:'Header & Footer', body:el('div', { class:'dlg-col' }, d.wrap, n.wrap, ONE.field('Footer', t), el('p', { text:'Shown on every slide except title slides.' })), actions:[{ label:'Cancel' }, { label:'Apply to All', kind:'filled', on:() => { S.deck.footer = { date:d.input.checked, num:n.input.checked, text:t.value.trim() }; S.changed(); } }] }); };
A.slideNumber = () => { S.deck.footer.num = !S.deck.footer.num; S.changed(); ONE.toast(S.deck.footer.num ? 'Slide numbers on.' : 'Slide numbers off.'); };
A.dateTime = () => { const s = new Date().toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' }); if (S.editing) S.execText('insertText', s); else S.insertText(esc(s)); };

/* ---------- font & paragraph ---------- */
S.FONTS = [['Theme Fonts',''],['Roboto Flex','"Roboto Flex", sans-serif'],['Calibri','Calibri, Carlito, sans-serif'],['Aptos','Aptos, Calibri, Carlito, sans-serif'],['Arial','Arial, sans-serif'],['Century Gothic','"Century Gothic", Futura, sans-serif'],['Georgia','Georgia, serif'],['Garamond','Garamond, "EB Garamond", Georgia, serif'],['Segoe UI','"Segoe UI", sans-serif'],['Trebuchet MS','"Trebuchet MS", sans-serif'],['Times New Roman','"Times New Roman", serif'],['Consolas','Consolas, monospace'],['Caveat','Caveat, cursive']];
S.setFont = f => S.applyStyle({ font:f || undefined }, f ? ['fontName', f] : null);
S.setSize = n => S.applyStyle({ size:n });
const SIZES = [10,12,14,16,18,20,24,28,32,36,40,44,48,54,60,72,88,96,120,150];
A.grow = () => { const c = S.curStyle().size || 24; S.setSize(SIZES.find(x => x > c) || c + 12); };
A.shrink = () => { const c = S.curStyle().size || 24; S.setSize([...SIZES].reverse().find(x => x < c) || Math.max(8, c - 2)); };
const tog = (k, cmd) => () => S.applyStyle({ [k]:!S.curStyle()[k] || undefined }, [cmd]);
A.bold = tog('bold', 'bold'); A.italic = tog('italic', 'italic'); A.underline = tog('underline', 'underline'); A.strike = tog('strike', 'strikeThrough'); A.tshadow = tog('tshadow', null);
S.fore = '#C0392B'; A.fore = () => S.applyStyle({ color:S.fore }, ['foreColor', S.fore]);
P.fore = a => ONE.pop.open(a, themeColorGrid(c => { if (c && c !== 'none') { S.fore = S.color(c); $('#barFore').style.background = S.fore; } S.applyStyle({ color:c && c !== 'none' ? c : undefined }, c && c !== 'none' ? ['foreColor', S.color(c)] : null); }, 'Automatic'));
A.hilite = () => { if (!S.editing) return ONE.toast('Double-click into text and select words to highlight them.'); S.execText('hiliteColor', '#FFF176'); };
A.clearFmt = () => { if (S.editing) { S.execText('removeFormat'); return; } S.applyStyle({ bold:undefined, italic:undefined, underline:undefined, strike:undefined, color:undefined, font:undefined, tshadow:undefined, wordart:undefined, spacing:undefined }); };
P.case = a => ONE.menuAt(a, [['Sentence case.', t => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, x, y) => x + y.toUpperCase())], ['lowercase', t => t.toLowerCase()], ['UPPERCASE', t => t.toUpperCase()], ['Capitalize Each Word', t => t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, x, y) => x + y.toUpperCase())]].map(([l, f]) => ({ label:l, on:() => { const els = S.editing ? [S.byId(S.editing.id)] : need(); S.commitText(); els.forEach(e => { const d = document.createElement('div'); d.innerHTML = e.html || ''; const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) n.data = f(n.data); e.html = d.innerHTML; }); S.changed(); } })));
P.spacing = a => ONE.menuAt(a, [[1, 'Single'], [1.15, '1.15'], [1.3, '1.3 (default)'], [1.5, '1.5'], [2, 'Double']].map(([v, n]) => ({ label:n, checked:(S.curStyle().lh || 1.3) === v, on:() => S.applyStyle({ lh:v }) })).concat(['-', { title:'Character spacing' }, ...[[-1, 'Tight'], [0, 'Normal'], [2, 'Loose'], [5, 'Very Loose']].map(([v, n]) => ({ label:n, on:() => S.applyStyle({ spacing:v || undefined }) }))]));
S.align = v => S.applyStyle({ align:v });
A.alignL = () => S.align('left'); A.alignC = () => S.align('center'); A.alignR = () => S.align('right'); A.alignJ = () => S.align('justify');
A.vTop = () => S.applyStyle({ valign:'top' }); A.vMid = () => S.applyStyle({ valign:'middle' }); A.vBot = () => S.applyStyle({ valign:'bottom' });
const listify = tag => {
  if (S.editing) { S.execText(tag === 'ul' ? 'insertUnorderedList' : 'insertOrderedList'); return; }
  const els = need(); els.forEach(e => { if (!(e.type === 'text' || e.type === 'shape')) return; const d = document.createElement('div'); d.innerHTML = e.html || '';
    const inList = d.querySelector('ul,ol');
    if (inList && inList.tagName.toLowerCase() === tag) { e.html = [...d.querySelectorAll('li')].map(li => `<div>${li.innerHTML}</div>`).join(''); return; }
    const lines = inList ? [...d.querySelectorAll('li')].map(li => li.innerHTML) : (d.innerHTML.split(/<div>|<\/div>|<br\s*\/?>|<p>|<\/p>/i).map(s => s.trim()).filter(Boolean));
    e.html = `<${tag}>${(lines.length ? lines : ['']).map(l => `<li>${l}</li>`).join('')}</${tag}>`; });
  S.changed();
};
A.bullets = () => listify('ul'); A.numbering = () => listify('ol');
A.indent = () => S.editing ? S.execText('indent') : ONE.toast('Click into the text to indent a line.'); A.outdent = () => S.editing ? S.execText('outdent') : null;

/* ---------- drawing / arrange ---------- */
function themeColorGrid(apply, auto){
  const t = S.theme(), d = el('div', { class:'colorpop' });
  if (auto) d.append(el('button', { class:'menu-item', html:`<span class="sw-auto" style="background:${t.body}"></span><span class="mi-label">${esc(auto)}</span>`, onclick:() => { ONE.pop.close(); apply(null); } }));
  d.append(el('div', { class:'menu-title', text:'Theme colors' }));
  const g = el('div', { class:'cgrid', style:{ gridTemplateColumns:'repeat(8,24px)' } });
  ['title', 'body', ...t.acc.map((_, i) => 'accent' + (i + 1))].forEach(k => g.append(el('button', { class:'sw top', style:{ background:S.color(k), width:'24px', height:'24px' }, title:k, 'aria-label':k, onclick:() => { ONE.pop.close(); apply(k); } })));
  d.append(g); const std = ONE.colorGrid(apply, { noneLabel:'No Color' }); [...std.children].forEach(c => d.append(c)); return d;
}
P.fill = a => ONE.pop.open(a, themeColorGrid(c => { const els = need(); els.forEach(e => { if (e.type === 'table') e.style.fill = c; else e.style.fill = c === 'none' ? 'none' : c || undefined; delete e.style.grad; }); S.changed(); }));
P.outline = a => ONE.pop.open(a, el('div', {}, themeColorGrid(c => { need().forEach(e => { e.style.line = c === 'none' ? 'none' : c || undefined; if (c && c !== 'none' && !e.style.lw) e.style.lw = 3; }); S.changed(); }),
  ONE.menu([{ title:'Weight' }, ...[1, 2, 3, 4.5, 6, 10].map(w => ({ html:`<span style="display:flex;align-items:center;gap:10px"><i style="display:block;width:80px;height:${w}px;background:currentColor;border-radius:2px"></i>${w} pt</span>`, on:() => { need().forEach(e => { e.style.lw = w; if (!e.style.line || e.style.line === 'none') e.style.line = 'body'; }); S.changed(); } })), { title:'Dashes' }, { label:'Solid', on:() => { need().forEach(e => delete e.style.dash); S.changed(); } }, { label:'Dashed', on:() => { need().forEach(e => e.style.dash = 'dash'); S.changed(); } }, { label:'Dotted', on:() => { need().forEach(e => e.style.dash = 'dot'); S.changed(); } }])));
P.effects = a => ONE.menuAt(a, [{ title:'Shadow' }, { label:'No Shadow', on:() => { need().forEach(e => delete e.style.shadow); S.changed(); } }, { label:'Subtle', icon:'blur_on', on:() => { need().forEach(e => e.style.shadow = true); S.changed(); } }, { label:'Soft Drop', icon:'blur_on', on:() => { need().forEach(e => e.style.shadow = 'soft'); S.changed(); } }, { label:'Offset', icon:'filter_none', on:() => { need().forEach(e => e.style.shadow = 'hard'); S.changed(); } },
  { title:'Transparency' }, ...[100, 80, 60, 40].map(o => ({ label:o + '% opaque', on:() => { need().forEach(e => e.style.opacity = o === 100 ? undefined : o / 100); S.changed(); } })), '-', { label:'More options…', icon:'tune', on:A.formatPane }]);
P.quickStyles = a => { const t = S.theme(), g = el('div', { class:'qsgrid' });
  const presets = [...t.acc.map((_, i) => ({ fill:'accent' + (i + 1) })), ...t.acc.map((_, i) => ({ fill:'none', line:'accent' + (i + 1), lw:3, color:'accent' + (i + 1) })), ...t.acc.map((_, i) => ({ fill:'accent' + (i + 1), shadow:'soft', grad:'bg' }))];
  presets.forEach(p => { const b = el('button', { class:'qs', 'aria-label':'Shape style', style:{ background:p.fill === 'none' ? 'transparent' : p.grad ? `linear-gradient(135deg,${S.color(p.fill)},${S.color(p.grad)})` : S.color(p.fill), border:p.line ? `3px solid ${S.color(p.line)}` : '0', color:p.color ? S.color(p.color) : '#fff', boxShadow:p.shadow ? '0 4px 10px rgba(0,0,0,.3)' : '' }, text:'Abc' }); b.onclick = () => { ONE.pop.close(); need().forEach(e => { if (e.type !== 'shape' && e.type !== 'text') return; e.style = Object.assign({}, e.style, { fill:p.fill, line:p.line, lw:p.lw, shadow:p.shadow, grad:p.grad === 'bg' ? S.theme().acc[(S.theme().acc.indexOf(S.color(p.fill)) + 1) % 6] : undefined, color:p.color }); Object.keys(e.style).forEach(k => e.style[k] == null && delete e.style[k]); }); S.changed(); }; g.append(b); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Shape styles' }), g)); };
S.zorder = mode => { const s = S.slide(), sel = S.selEls(); if (!sel.length) return need(); let arr = s.els.filter(e => !sel.includes(e));
  if (mode === 'front') arr = [...arr, ...sel]; else if (mode === 'back') arr = [...sel, ...arr];
  else { arr = [...s.els]; const d = mode === 'forward' ? 1 : -1; (d > 0 ? [...sel].reverse() : sel).forEach(e => { const i = arr.indexOf(e), j = ONE.clamp(i + d, 0, arr.length - 1); arr.splice(i, 1); arr.splice(j, 0, e); }); }
  s.els = arr; S.changed(); };
S.alignSel = mode => { const els = need(); if (!els.length) return; const b = els.length > 1 ? S.bbox(els) : { x:0, y:0, w:S.W(), h:S.H() };
  if (mode === 'dh' || mode === 'dv') { if (els.length < 3) return ONE.toast('Select three or more objects to distribute them.'); const k = mode === 'dh' ? ['x', 'w'] : ['y', 'h']; const s = [...els].sort((p, q) => p[k[0]] - q[k[0]]); const tot = s.reduce((a, e) => a + e[k[1]], 0), span = s[s.length - 1][k[0]] + s[s.length - 1][k[1]] - s[0][k[0]], gap = (span - tot) / (s.length - 1); let pos = s[0][k[0]]; s.forEach(e => { e[k[0]] = pos; pos += e[k[1]] + gap; }); S.changed(); return; }
  els.forEach(e => { if (mode === 'l') e.x = b.x; if (mode === 'c') e.x = b.x + (b.w - e.w) / 2; if (mode === 'r') e.x = b.x + b.w - e.w; if (mode === 't') e.y = b.y; if (mode === 'm') e.y = b.y + (b.h - e.h) / 2; if (mode === 'b') e.y = b.y + b.h - e.h; }); S.changed(); };
P.arrange = a => ONE.menuAt(a, [{ title:'Order' }, { label:'Bring to Front', icon:'flip_to_front', on:() => S.zorder('front') }, { label:'Bring Forward', icon:'arrow_upward', on:() => S.zorder('forward') }, { label:'Send Backward', icon:'arrow_downward', on:() => S.zorder('backward') }, { label:'Send to Back', icon:'flip_to_back', on:() => S.zorder('back') },
  { title:'Align' }, { label:'Align Left', icon:'align_horizontal_left', on:() => S.alignSel('l') }, { label:'Align Center', icon:'align_horizontal_center', on:() => S.alignSel('c') }, { label:'Align Right', icon:'align_horizontal_right', on:() => S.alignSel('r') }, { label:'Align Top', icon:'align_vertical_top', on:() => S.alignSel('t') }, { label:'Align Middle', icon:'align_vertical_center', on:() => S.alignSel('m') }, { label:'Align Bottom', icon:'align_vertical_bottom', on:() => S.alignSel('b') },
  { label:'Distribute Horizontally', icon:'horizontal_distribute', on:() => S.alignSel('dh') }, { label:'Distribute Vertically', icon:'vertical_distribute', on:() => S.alignSel('dv') },
  { title:'Rotate' }, { label:'Rotate Right 90°', icon:'rotate_right', on:() => { need().forEach(e => e.rot = ((e.rot || 0) + 90) % 360); S.changed(); } }, { label:'Rotate Left 90°', icon:'rotate_left', on:() => { need().forEach(e => e.rot = ((e.rot || 0) + 270) % 360); S.changed(); } }, { label:'Flip Horizontal', icon:'flip', on:() => { need().forEach(e => e.flipH = !e.flipH); S.changed(); } }, { label:'Flip Vertical', icon:'flip', on:() => { need().forEach(e => e.flipV = !e.flipV); S.changed(); } }]);
A.formatPane = () => { const p = $('#fmtpane'); p.hidden = false; $('#fmtTitle').textContent = S.selEls().length ? 'Format' : 'Format Background'; S.syncFmt(); S.fit(); };
A.formatBg = () => { S.sel = []; S.renderSel(); A.formatPane(); };
A.duplicate = () => { if (!S.selEls().length) return S.dupSlide(); S.copySel(false); S.clipPaste = 0; S.pasteEls(); };
A.selectAll = () => { S.commitText(); S.sel = S.slide().els.map(e => e.id); S.renderSel(); };
A.selectionPane = () => { let m; const list = el('div', { class:'list' }); const names = { text:'Text box', shape:'Shape', image:'Picture', chart:'Chart', table:'Table', icon:'Icon' };
  [...S.slide().els].reverse().forEach(e => list.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:{ text:'text_fields', shape:'category', image:'image', chart:'bar_chart', table:'table', icon:'star' }[e.type] }), el('span', { class:'grow', html:`<b>${esc(names[e.type])}${e.role ? ' · ' + e.role : ''}</b><small>${esc((e.html || e.alt || e.title || '').replace(/<[^>]+>/g, ' ').slice(0, 50))}</small>` }), el('button', { class:'btn text', text:'Select', onclick:() => { m.close(); S.sel = [e.id]; S.renderSel(); } }))));
  m = ONE.modal({ title:'Selection', body:list }); };
A.reset = () => { const s = S.slide(), L = S.LAYOUTS[s.layout]; if (!L) return; const fresh = L.make(S.W()); s.els.forEach(e => { if (!e.role) return; const f = fresh.find(x => x.role === e.role); if (f) { Object.assign(e, { x:f.x, y:f.y, w:f.w, h:f.h, rot:0, style:f.style }); fresh.splice(fresh.indexOf(f), 1); } }); S.changed(); ONE.toast('Placeholders reset to the layout.'); };
P.layout = a => ONE.menuAt(a, Object.entries(S.LAYOUTS).map(([k, l]) => ({ label:l.name, checked:S.slide().layout === k, on:() => { const s = S.slide(), fresh = l.make(S.W()), olds = s.els.filter(e => e.role); const keep = s.els.filter(e => !e.role); fresh.forEach(f => { const o = olds.find(x => x.role === f.role && x.html); if (o) { f.html = o.html; olds.splice(olds.indexOf(o), 1); } }); olds.filter(o => o.html).forEach(o => { o.role = null; keep.push(o); }); s.els = [...fresh, ...keep]; s.layout = k; S.sel = []; S.changed(); } })));
P.newSlide = a => { const g = el('div', { class:'layoutgrid' }); Object.entries(S.LAYOUTS).forEach(([k, l]) => { const tmp = { ...S.newSlide(k) }; tmp.els.forEach(e => { if (e.role) e.html = `<span style="opacity:.55">${S.PROMPT[e.role]}</span>`; }); const b = el('button', { class:'lay' }, S.thumb(tmp, 150), el('span', { text:l.name })); b.onclick = () => { ONE.pop.close(); S.addSlide(k); }; g.append(b); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'New slide' }), g, ONE.menu([{ label:'Duplicate Selected Slide', icon:'content_copy', on:S.dupSlide }, { label:'Slides from Outline…', icon:'format_list_bulleted', on:A.fromOutline }]))); };
A.fromOutline = () => { const t = el('textarea', { class:'tf', rows:10, placeholder:'# Slide title\n- first point\n- second point\n\n# Next slide' });
  ONE.modal({ title:'Slides from Outline', width:560, body:el('div', { class:'dlg-col' }, el('p', { text:'Start each slide with “# ” and list points with “- ”.' }), t), actions:[{ label:'Cancel' }, { label:'Create Slides', kind:'filled', on:() => { const n = S.outlineToSlides(t.value); ONE.toast(`Added ${n} slide${n === 1 ? '' : 's'}.`); } }] }); };
S.outlineToSlides = text => { let n = 0, cur = null; const flush = () => { if (!cur) return; const s = S.newSlide(cur.pts.length ? 'content' : 'section'); s.els.find(e => e.role === 'title').html = esc(cur.t); if (cur.pts.length) s.els.find(e => e.role === 'body').html = `<ul>${cur.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`; S.deck.slides.splice(S.cur + 1 + n, 0, s); n++; };
  text.split('\n').forEach(l => { const m = /^#+\s*(.*)/.exec(l); if (m) { flush(); cur = { t:m[1], pts:[] }; } else if (/^\s*[-*•]\s+/.test(l) && cur) cur.pts.push(l.replace(/^\s*[-*•]\s+/, '')); else if (l.trim() && cur) cur.pts.push(l.trim()); }); flush(); S.changed(); return n; };

/* ---------- design ---------- */
S.themeGallery = () => { const g = el('div', { class:'themes', id:'themeGallery' }); Object.entries(S.THEMES).forEach(([k, t]) => { const b = el('button', { class:'theme' + (S.deck.theme === k ? ' on' : ''), 'data-theme':k, title:t.name, style:{ background:t.bg } }, el('b', { text:'Aa', style:{ fontFamily:t.tf, color:t.title } }), el('span', { class:'tbar', html:t.acc.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join('') }), el('small', { text:t.name, style:{ color:t.body } })); b.onclick = () => { S.deck.theme = k; S.deck.variant = 0; S.changed(); $$('.theme').forEach(x => x.classList.toggle('on', x.dataset.theme === k)); }; g.append(b); }); return g; };
S.variantGallery = () => { const g = el('div', { class:'variants' }); S.VARIANTS.forEach((v, i) => { const acc = v || S.THEMES[S.deck.theme].acc; g.append(el('button', { class:'variant' + (S.deck.variant === i ? ' on' : ''), 'data-v':i, title:`Variant ${i + 1}`, 'aria-label':`Color variant ${i + 1}`, html:acc.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join(''), onclick:() => { S.deck.variant = i; S.changed(); $$('.variant').forEach(x => x.classList.toggle('on', +x.dataset.v === i)); } })); }); return g; };
P.slideSize = a => ONE.menuAt(a, [['16:9', 'Widescreen (16:9)'], ['4:3', 'Standard (4:3)']].map(([r, n]) => ({ label:n, checked:S.deck.ratio === r, on:() => { if (S.deck.ratio === r) return; const k = r === '4:3' ? 960 / 1280 : 1280 / 960; S.deck.slides.forEach(s => s.els.forEach(e => { e.x *= k; e.w *= k; })); S.deck.ratio = r; S.changed(); S.fit(); } })));

/* ---------- transitions ---------- */
S.TRANS = [['none','None','block'],['fade','Fade','gradient'],['push','Push','keyboard_double_arrow_left'],['wipe','Wipe','swipe_left'],['split','Split','vertical_split'],['reveal','Reveal','flip_to_back'],['cover','Cover','flip_to_front'],['zoom','Zoom','zoom_in'],['flip','Flip','flip'],['morph','Morph','auto_awesome_motion']];
S.transGallery = () => { const g = el('div', { class:'fxgal' }); S.TRANS.forEach(([k, n, ic]) => g.append(el('button', { class:'fx', 'data-tr':k, title:n, html:`${icon(ic)}<span>${n}</span>`, onclick:() => { S.slide().transition = Object.assign({}, S.slide().transition, { type:k }); S.changed(); S.previewTransition(); } }))); return g; };
S.syncTransUI = () => { const t = S.slide() && S.slide().transition || {}; $$('.fx[data-tr]').forEach(b => b.classList.toggle('on', b.dataset.tr === (t.type || 'none'))); const d = $('#trDur'); if (d && document.activeElement !== d) d.value = t.dur ?? .6; const af = $('#trAfter'); if (af && document.activeElement !== af) af.value = t.after || 0; };
S.hooks.push(() => S.syncTransUI());
P.trDir = a => ONE.menuAt(a, [['left','From Right'],['right','From Left'],['up','From Bottom'],['down','From Top']].map(([k, n]) => ({ label:n, checked:(S.slide().transition.dir || 'left') === k, on:() => { S.slide().transition.dir = k; S.changed(); S.previewTransition(); } })));
A.trAll = () => { const t = S.slide().transition; S.deck.slides.forEach(s => s.transition = { ...t }); S.changed(); ONE.toast('Transition applied to all slides.'); };
S.previewTransition = () => { if (S.cur === 0 && S.slide().transition.type === 'morph') return; const prev = S.deck.slides[S.cur - 1]; const inc = $('.slide', $('#stage')); if (!inc) return; const out = prev ? S.renderSlide(prev) : el('div', { class:'slide', style:{ width:S.W() + 'px', height:S.H() + 'px', background:'#000' } }); out.classList.add('ghost'); inc.parentNode.insertBefore(out, inc); S.runTransition(out, inc, S.slide().transition, () => out.remove()); };
S.runTransition = (out, inc, tr, done) => {
  const d = (tr.dur ?? .6) * 1000, ease = 'cubic-bezier(.2,0,0,1)', dir = tr.dir || 'left', sign = dir === 'right' || dir === 'down' ? -1 : 1, ax = dir === 'up' || dir === 'down' ? 'Y' : 'X';
  const T = (n, frames) => n.animate(frames, { duration:d, easing:ease, fill:'both' });
  let anims = [];
  switch (tr.type) {
    case 'fade': anims = [T(inc, [{ opacity:0 }, { opacity:1 }])]; break;
    case 'push': anims = [T(out, [{ transform:'none' }, { transform:`translate${ax}(${-100 * sign}%)` }]), T(inc, [{ transform:`translate${ax}(${100 * sign}%)` }, { transform:'none' }])]; break;
    case 'cover': anims = [T(inc, [{ transform:`translate${ax}(${100 * sign}%)`, boxShadow:'0 0 40px rgba(0,0,0,.5)' }, { transform:'none', boxShadow:'0 0 0 rgba(0,0,0,0)' }])]; break;
    case 'reveal': out.style.zIndex = 2; anims = [T(out, [{ transform:'none', opacity:1 }, { transform:`translate${ax}(${-100 * sign}%)`, opacity:.6 }])]; break;
    case 'wipe': anims = [T(inc, [{ clipPath:ax === 'X' ? (sign > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)') : (sign > 0 ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)') }, { clipPath:'inset(0 0 0 0)' }])]; break;
    case 'split': anims = [T(inc, [{ clipPath:'inset(0 50% 0 50%)' }, { clipPath:'inset(0 0% 0 0%)' }])]; break;
    case 'zoom': anims = [T(inc, [{ transform:'scale(.6)', opacity:0 }, { transform:'none', opacity:1 }]), T(out, [{ transform:'none', opacity:1 }, { transform:'scale(1.25)', opacity:0 }])]; break;
    case 'flip': anims = [out.animate([{ transform:'perspective(1600px) rotateY(0)' }, { transform:'perspective(1600px) rotateY(-90deg)' }], { duration:d / 2, easing:'ease-in', fill:'both' }), inc.animate([{ transform:'perspective(1600px) rotateY(90deg)' }, { transform:'perspective(1600px) rotateY(0)' }], { duration:d / 2, delay:d / 2, easing:'ease-out', fill:'both' })]; break;
    case 'morph': anims = S.morph(out, inc, d); break;
    default: done && done(); return [];
  }
  Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => { anims.forEach(a => a.cancel()); out.style.zIndex = ''; done && done(); });
  return anims;
};
S.morph = (out, inc, d) => {
  const ease = 'cubic-bezier(.4,0,.2,1)', anims = [], outEls = new Map($$('.el', out).map(n => [n.dataset.mid, n])), W = S.W();
  const lookup = (root, sl) => { const m = new Map(); (sl || []).forEach(e => { const n = root.querySelector(`.el[data-id="${e.id}"]`); if (n) { n.dataset.mid = e.mid; m.set(e.mid, n); } }); return m; };
  const outSlide = S.deck.slides.find(s => s.id === out.dataset.sid), inSlide = S.deck.slides.find(s => s.id === inc.dataset.sid);
  const O = lookup(out, outSlide && outSlide.els), I = lookup(inc, inSlide && inSlide.els); void outEls; void W;
  out.style.zIndex = 2; anims.push(out.animate([{ opacity:1 }, { opacity:0 }], { duration:d * .6, easing:ease, fill:'both' }));
  I.forEach((n, mid) => {
    const o = O.get(mid);
    if (o) { const a = { l:o.offsetLeft, t:o.offsetTop, w:o.offsetWidth, h:o.offsetHeight, r:o.style.transform, op:getComputedStyle(o).opacity }, b = { l:n.offsetLeft, t:n.offsetTop, w:n.offsetWidth, h:n.offsetHeight };
      o.style.visibility = 'hidden';
      anims.push(n.animate([{ left:a.l + 'px', top:a.t + 'px', width:a.w + 'px', height:a.h + 'px', transform:a.r || 'none', opacity:a.op }, { left:b.l + 'px', top:b.t + 'px', width:b.w + 'px', height:b.h + 'px', transform:n.style.transform || 'none', opacity:getComputedStyle(n).opacity }], { duration:d, easing:ease, fill:'both' }));
      const oi = o.querySelector('.txi'), ni = n.querySelector('.txi'); if (oi && ni) anims.push(ni.animate([{ fontSize:getComputedStyle(oi).fontSize, color:getComputedStyle(oi).color }, { fontSize:getComputedStyle(ni).fontSize, color:getComputedStyle(ni).color }], { duration:d, easing:ease, fill:'both' }));
      const op = o.querySelector('path'), np = n.querySelector('path'); if (op && np) anims.push(np.animate([{ fill:getComputedStyle(op).fill }, { fill:getComputedStyle(np).fill }], { duration:d, easing:ease, fill:'both' }));
    } else anims.push(n.animate([{ opacity:0 }, { opacity:1 }], { duration:d * .7, delay:d * .3, easing:ease, fill:'both' }));
  });
  anims.push(inc.animate([{ background:getComputedStyle(out).background }, { background:getComputedStyle(inc).background }], { duration:d, fill:'both' }));
  return anims;
};

/* ---------- animations ---------- */
S.ANIMS = { in:[['appear','Appear','visibility'],['fade','Fade','gradient'],['fly','Fly In','flight_land'],['float','Float In','north'],['zoom','Zoom','zoom_in'],['wipe','Wipe','swipe_right'],['bounce','Bounce','sports_basketball'],['grow','Grow & Turn','autorenew']],
  emph:[['pulse','Pulse','favorite'],['spin','Spin','sync'],['teeter','Teeter','vibration'],['growshrink','Grow/Shrink','open_in_full']], out:[['fadeout','Fade Out','gradient'],['flyout','Fly Out','flight_takeoff'],['zoomout','Zoom Out','zoom_out']] };
S.animGallery = () => { const g = el('div', { class:'fxgal' }); g.append(el('button', { class:'fx', 'data-an':'none', title:'None', html:`${icon('block')}<span>None</span>`, onclick:() => S.setAnim(null) }));
  [['in', '#2e7d32'], ['emph', '#f9a825'], ['out', '#c62828']].forEach(([cat, col]) => S.ANIMS[cat].forEach(([k, n, ic]) => g.append(el('button', { class:'fx an-' + cat, 'data-an':k, title:n, style:{ '--fxc':col }, html:`${icon(ic)}<span>${n}</span>`, onclick:() => S.setAnim(k, cat) })))); return g; };
S.animated = (s = S.slide()) => s.els.filter(e => e.anim).sort((a, b) => a.anim.order - b.anim.order);
S.renumber = () => S.deck.slides.forEach(s => S.animated(s).forEach((e, i) => e.anim.order = i + 1));
S.setAnim = (k, cat) => { const els = need(); if (!els.length) return; const max = S.animated().length; els.forEach((e, i) => { if (!k) delete e.anim; else e.anim = Object.assign({ start:'click', dur:.6, delay:0, dir:'bottom', order:e.anim ? e.anim.order : max + i + 1 }, e.anim, { type:k, cat }); }); S.renumber(); S.changed(); if (k) S.previewAnim(els); };
S.syncAnimUI = () => { const e = S.selEls()[0], a = e && e.anim; $$('.fx[data-an]').forEach(b => b.classList.toggle('on', a ? b.dataset.an === a.type : b.dataset.an === 'none' && !!e)); const st = $('#anStart'); if (st) st.value = a ? a.start : 'click'; const du = $('#anDur'); if (du && document.activeElement !== du) du.value = a ? a.dur : .6; const de = $('#anDelay'); if (de && document.activeElement !== de) de.value = a ? a.delay : 0; if (!$('#animPane').hidden) S.renderAnimPane(); };
S.hooks.push(() => S.syncAnimUI());
P.anDir = a => ONE.menuAt(a, [['bottom','From Bottom'],['left','From Left'],['right','From Right'],['top','From Top']].map(([k, n]) => ({ label:n, on:() => { need().forEach(e => e.anim && (e.anim.dir = k)); S.changed(); S.previewAnim(S.selEls()); } })));
S.animFrames = (a, back) => {
  const off = { bottom:'translateY(120%)', top:'translateY(-120%)', left:'translateX(-130%)', right:'translateX(130%)' }[a.dir || 'bottom'];
  switch (a.type) {
    case 'appear': return [[{ opacity:0 }, { opacity:1, offset:.01 }, { opacity:1 }], 'linear'];
    case 'fade': return [[{ opacity:0 }, { opacity:1 }], 'ease-out'];
    case 'fly': return [[{ transform:off.replace('120%', '900px').replace('130%', '1400px'), opacity:1 }, { transform:'none' }], 'cubic-bezier(.2,.8,.2,1)'];
    case 'float': return [[{ transform:'translateY(60px)', opacity:0 }, { transform:'none', opacity:1 }], 'cubic-bezier(.2,.8,.2,1)'];
    case 'zoom': return [[{ transform:'scale(.2)', opacity:0 }, { transform:'none', opacity:1 }], 'cubic-bezier(.34,1.4,.64,1)'];
    case 'wipe': return [[{ clipPath:'inset(0 100% 0 0)' }, { clipPath:'inset(0 0 0 0)' }], 'ease-in-out'];
    case 'bounce': return [[{ transform:'translateY(-700px)', offset:0 }, { transform:'translateY(0)', offset:.55 }, { transform:'translateY(-60px)', offset:.72 }, { transform:'translateY(0)', offset:.86 }, { transform:'translateY(-14px)', offset:.93 }, { transform:'translateY(0)', offset:1 }], 'ease-in'];
    case 'grow': return [[{ transform:'scale(.1) rotate(-90deg)', opacity:0 }, { transform:'none', opacity:1 }], 'cubic-bezier(.2,.8,.2,1)'];
    case 'pulse': return [[{ transform:'none' }, { transform:'scale(1.12)' }, { transform:'none' }], 'ease-in-out'];
    case 'spin': return [[{ transform:'rotate(0)' }, { transform:'rotate(360deg)' }], 'ease-in-out'];
    case 'teeter': return [[{ transform:'rotate(0)' }, { transform:'rotate(6deg)' }, { transform:'rotate(-6deg)' }, { transform:'rotate(4deg)' }, { transform:'rotate(-2deg)' }, { transform:'rotate(0)' }], 'ease-in-out'];
    case 'growshrink': return [[{ transform:'none' }, { transform:'scale(1.25)' }, { transform:'none' }], 'ease-in-out'];
    case 'fadeout': return [[{ opacity:1 }, { opacity:0 }], 'ease-in'];
    case 'flyout': return [[{ transform:'none' }, { transform:off.replace('120%', '900px').replace('130%', '1400px') }], 'cubic-bezier(.6,0,.8,.2)'];
    case 'zoomout': return [[{ transform:'none', opacity:1 }, { transform:'scale(.2)', opacity:0 }], 'ease-in'];
  }
  void back; return [[{ opacity:1 }, { opacity:1 }], 'linear'];
};
S.playAnim = (node, a, delay = 0) => { if (!node) return null; const [f, ease] = S.animFrames(a); const inner = node.querySelector('.txi,svg,img,table,.ico') && a.cat === 'emph' ? node : node; return inner.animate(f, { duration:(a.dur || .6) * 1000, delay, easing:ease, fill:'both' }); };
S.previewAnim = els => { els.forEach(e => { if (!e.anim) return; const n = $(`#stage .slide .el[data-id="${e.id}"]`); const an = S.playAnim(n, e.anim); if (an) an.finished.then(() => an.cancel(), () => {}); }); };
A.previewAnims = () => { const list = S.animated(); if (!list.length) return ONE.toast('This slide has no animations yet.'); let t = 0; list.forEach((e, i) => { if (i && e.anim.start === 'click') t += 450; const n = $(`#stage .slide .el[data-id="${e.id}"]`); if (e.anim.start === 'after' && i) t += (list[i - 1].anim.dur || .6) * 1000; const an = S.playAnim(n, e.anim, t + (e.anim.delay || 0) * 1000); if (an) an.finished.then(() => an.cancel(), () => {}); }); };
A.animPane = () => { const p = $('#animPane'); p.hidden = !p.hidden; S.showAnimBadges = !p.hidden; S.renderStage(); if (!p.hidden) S.renderAnimPane(); ONE.ribbon.refresh(); S.fit(); };
S.renderAnimPane = () => { const list = $('#animList'); list.innerHTML = ''; const els = S.animated(); if (!els.length) list.append(el('p', { class:'muted', style:{ padding:'12px' }, text:'Select an object, then pick an effect from the Animations tab.' }));
  const names = Object.fromEntries(Object.values(S.ANIMS).flat().map(x => [x[0], x[1]]));
  els.forEach((e, i) => list.append(el('div', { class:'anitem' + (S.sel.includes(e.id) ? ' on' : ''), style:{ animationDelay:i * 30 + 'ms' } }, el('span', { class:'anum', text:e.anim.start === 'click' ? e.anim.order : '' }), el('span', { class:'ms', text:e.anim.start === 'click' ? 'ads_click' : e.anim.start === 'with' ? 'link' : 'schedule', title:e.anim.start }),
    el('button', { class:'grow', html:`<b>${esc(names[e.anim.type] || e.anim.type)}</b><small>${esc(((e.html || '').replace(/<[^>]+>/g, ' ').trim() || e.alt || e.title || e.type).slice(0, 36))}</small>`, onclick:() => { S.sel = [e.id]; S.renderSel(); } }),
    el('button', { class:'icon-btn', title:'Move earlier', html:icon('arrow_upward'), onclick:() => moveAnim(e, -1) }), el('button', { class:'icon-btn', title:'Remove', html:icon('close'), onclick:() => { delete e.anim; S.renumber(); S.changed(); } })))); };
const moveAnim = (e, d) => { const list = S.animated(), i = list.indexOf(e), j = ONE.clamp(i + d, 0, list.length - 1); if (i === j) return; [list[i].anim.order, list[j].anim.order] = [list[j].anim.order, list[i].anim.order]; S.renumber(); S.changed(); };
A.anEarlier = () => { const e = S.selEls()[0]; if (e && e.anim) moveAnim(e, -1); }; A.anLater = () => { const e = S.selEls()[0]; if (e && e.anim) moveAnim(e, 1); };

/* ---------- slide show ---------- */
S.showing = null;
const steps = s => { const list = S.animated(s), out = []; let cur = null, t = 0, lastEnd = 0;
  list.forEach((e, i) => { const a = e.anim, dur = (a.dur || .6) * 1000, del = (a.delay || 0) * 1000;
    if (a.start === 'click' || !cur) { if (a.start === 'click' || !cur) { cur = { auto:a.start !== 'click' && i === 0, items:[] }; out.push(cur); t = 0; lastEnd = 0; } }
    const at = a.start === 'after' ? lastEnd + del : a.start === 'with' ? t + del : del; t = a.start === 'after' ? lastEnd : at - del; lastEnd = Math.max(lastEnd, at + dur); cur.items.push({ e, at }); });
  return out; };
S.startShow = (from = 0, presenter = false) => {
  S.commitText(); S.renumber();
  const vis = S.deck.slides.map((s, i) => i).filter(i => !S.deck.slides[i].hidden); if (!vis.length) return ONE.toast('All slides are hidden.');
  const ov = el('div', { class:'show' + (presenter ? ' presenter' : ''), tabindex:0 });
  const main = el('div', { class:'show-main' }), stageBox = el('div', { class:'show-stage' });
  main.append(stageBox); ov.append(main);
  let pv = null;
  if (presenter) { pv = { next:el('div', { class:'pv-next' }), notes:el('div', { class:'pv-notes' }), timer:el('span', { class:'pv-timer', text:'0:00' }), count:el('span', { class:'pv-count' }) };
    ov.append(el('div', { class:'pv-side' }, el('div', { class:'pv-bar' }, pv.timer, pv.count, el('span', { class:'grow' }), el('button', { class:'icon-btn', title:'Previous', html:icon('arrow_back'), onclick:() => prev() }), el('button', { class:'icon-btn', title:'Next', html:icon('arrow_forward'), onclick:() => next() }), el('button', { class:'icon-btn', title:'Black screen (B)', html:icon('dark_mode'), onclick:() => blank('#000') }), el('button', { class:'btn tonal', text:'End Show', onclick:() => end() })), el('div', { class:'pv-label', text:'Next slide' }), pv.next, el('div', { class:'pv-label', text:'Notes' }), pv.notes)); }
  const laser = el('div', { class:'laser', hidden:true }), curtain = el('div', { class:'curtain', hidden:true }), hint = el('div', { class:'show-hint', text:'Click or → next · ← back · B black · L laser · Ctrl+P pen · Ctrl+I highlighter · E erase ink · Esc end' });
  ov.append(laser, curtain, hint); document.body.append(ov); setTimeout(() => hint.classList.add('gone'), 2600);
  try { ov.requestFullscreen && ov.requestFullscreen().catch(() => {}); } catch {}
  ov.focus();
  let pos = Math.max(0, vis.indexOf(from) >= 0 ? vis.indexOf(from) : vis.findIndex(i => i >= from)), stepIdx = 0, plan = [], slideNode = null, busy = false, t0 = Date.now(), autoT = null, typed = '';
  const fit = () => { const W = S.W(), H = S.H(), r = main.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H); stageBox.style.cssText = `width:${W}px;height:${H}px;transform:translate(-50%,-50%) scale(${k})`; };
  const ro = new ResizeObserver(fit); ro.observe(main);
  const prep = (i, built) => { const s = S.deck.slides[vis[i]], n = S.renderSlide(s); plan = steps(s); if (!built) plan.forEach(st => st.items.forEach(({ e }) => { if (e.anim.cat === 'in') { const x = n.querySelector(`.el[data-id="${e.id}"]`); if (x) x.style.visibility = 'hidden'; } })); else { plan.forEach(st => st.items.forEach(({ e }) => { if (e.anim.cat === 'out') { const x = n.querySelector(`.el[data-id="${e.id}"]`); if (x) x.style.visibility = 'hidden'; } })); } stepIdx = built ? plan.length : 0; return n; };
  const updPV = () => { if (!pv) return; const nx = vis[pos + 1]; pv.next.innerHTML = ''; if (nx != null) pv.next.append(S.thumb(S.deck.slides[nx], 360)); else pv.next.append(el('div', { class:'pv-end', text:'End of slide show' })); pv.notes.textContent = S.deck.slides[vis[pos]].notes || 'No notes for this slide.'; pv.count.textContent = `Slide ${pos + 1} of ${vis.length}`; };
  const playStep = () => { const st = plan[stepIdx++]; if (!st) return; st.items.forEach(({ e, at }) => { const n = slideNode.querySelector(`.el[data-id="${e.id}"]`); if (!n) return; setTimeout(() => { if (e.anim.cat === 'in') n.style.visibility = ''; }, at); const a = S.playAnim(n, e.anim, at); if (a && e.anim.cat === 'out') a.finished.then(() => { n.style.visibility = 'hidden'; a.cancel(); }, () => {}); else if (a) a.finished.then(() => a.cancel(), () => {}); }); scheduleAuto(); };
  const scheduleAuto = () => { clearTimeout(autoT); const s = S.deck.slides[vis[pos]]; const after = s.transition && s.transition.after; if (after > 0 && stepIdx >= plan.length) autoT = setTimeout(next, after * 1000); if (plan[stepIdx] && plan[stepIdx].auto) playStep(); };
  const show = (i, built, animate) => {
    const old = slideNode, n = prep(i, built); stageBox.append(n); S.attachPen && S.attachPen(stageBox, n).classList.toggle('on', !!S.penMode); pos = i; slideNode = n; updPV();
    const tr = S.deck.slides[vis[i]].transition || {};
    if (old && animate && tr.type && tr.type !== 'none') { busy = true; S.runTransition(old, n, tr, () => { old.remove(); busy = false; if (!built && plan[0] && plan[0].auto) playStep(); else scheduleAuto(); }); }
    else { old && old.remove(); if (!built && plan[0] && plan[0].auto) playStep(); else scheduleAuto(); }
  };
  const next = () => { if (busy) return; if (!curtain.hidden) { curtain.hidden = true; return; } if (stepIdx < plan.length) return playStep(); if (pos < vis.length - 1) return show(pos + 1, false, true); if (S.deck.loop) return show(0, false, true); endScreen(); };
  const prev = () => { if (busy) return; if (!curtain.hidden) { curtain.hidden = true; return; } if (pos > 0) show(pos - 1, true, false); };
  let ended = false; const endScreen = () => { if (ended) return end(); ended = true; curtain.hidden = false; curtain.style.background = '#000'; curtain.textContent = 'End of slide show. Click to exit.'; };
  const blank = c => { curtain.textContent = ''; curtain.style.background = c; curtain.hidden = !curtain.hidden; };
  const end = () => { S.penMode = null; clearTimeout(autoT); clearInterval(tick); ro.disconnect(); ov.classList.add('out'); try { document.fullscreenElement && document.exitFullscreen(); } catch {} setTimeout(() => ov.remove(), 250); S.showing = null; S.goto(vis[pos]); document.removeEventListener('keydown', key, true); };
  const tick = setInterval(() => { if (pv) { const s = Math.floor((Date.now() - t0) / 1000); pv.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; } }, 1000);
  const key = e => {
    const k = e.key; e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); if (S.penMode) return S.setPen(S.penMode, ov); return end(); }
    if (e.ctrlKey || e.metaKey) { const m = { p:'pen', i:'hl', e:'erase', a:S.penMode }[k.toLowerCase()]; if (m !== undefined) { e.preventDefault(); if (m) S.setPen(m, ov); return; } }
    if ((k === 'e' || k === 'E') && slideNode) { const c = slideNode.querySelector('.pen-layer'); c && c.getContext('2d').clearRect(0, 0, c.width, c.height); return; }
    if (['ArrowRight','ArrowDown',' ','PageDown','n','N'].includes(k) || (k === 'Enter' && !typed)) { e.preventDefault(); ended = false; return next(); }
    if (['ArrowLeft','ArrowUp','PageUp','Backspace','p','P'].includes(k)) { e.preventDefault(); ended = false; return prev(); }
    if (k === 'Home') return show(0, false, false); if (k === 'End') return show(vis.length - 1, true, false);
    if (/^\d$/.test(k)) { typed += k; return; } if (k === 'Enter' && typed) { const n = parseInt(typed) - 1; typed = ''; if (n >= 0 && n < vis.length) show(n, false, true); return; }
    if (k === 'b' || k === 'B' || k === '.') return blank('#000'); if (k === 'w' || k === 'W' || k === ',') return blank('#fff');
    if (k === 'l' || k === 'L') { laser.hidden = !laser.hidden; ov.classList.toggle('lasering', !laser.hidden); }
  };
  document.addEventListener('keydown', key, true);
  main.addEventListener('click', () => { if (ended) return end(); next(); });
  curtain.addEventListener('click', () => { if (ended) return end(); curtain.hidden = true; });
  main.addEventListener('contextmenu', e => { e.preventDefault(); ONE.menuAt({ x:e.clientX, y:e.clientY }, [{ label:'Next', icon:'arrow_forward', on:next }, { label:'Previous', icon:'arrow_back', on:prev }, { label:'See All Slides', icon:'grid_view', on:() => ONE.menuAt({ x:e.clientX, y:e.clientY }, vis.map((i, j) => ({ label:`${j + 1}. ${(S.deck.slides[i].els.find(x => x.role === 'title') || {}).html?.replace(/<[^>]+>/g, '') || 'Slide'}`, on:() => show(j, false, true) }))) }, { label:'Black Screen', icon:'dark_mode', on:() => blank('#000') }, { label:'Laser Pointer', icon:'my_location', on:() => { laser.hidden = !laser.hidden; ov.classList.toggle('lasering', !laser.hidden); } }, { label:'Pen', icon:'edit', on:() => S.setPen('pen', ov) }, { label:'Highlighter', icon:'ink_highlighter', on:() => S.setPen('hl', ov) }, { label:'Erase All Ink', icon:'ink_eraser', on:() => slideNode.querySelector('.pen-layer')?.getContext('2d').clearRect(0, 0, S.W(), S.H()) }, '-', { label:'End Show', icon:'close', on:end }]); });
  ov.addEventListener('pointermove', e => { if (!laser.hidden) { laser.style.left = e.clientX + 'px'; laser.style.top = e.clientY + 'px'; } });
  S.showing = { end };
  fit(); show(pos, false, false);
};
A.showStart = () => S.startShow(0, !!S.presenterDefault); A.showCurrent = () => S.startShow(S.cur, !!S.presenterDefault);
A.presenter = () => { S.presenterDefault = !S.presenterDefault; ONE.ribbon.refresh(); ONE.toast(S.presenterDefault ? 'Presenter View on: shows the next slide, notes and a timer.' : 'Presenter View off.'); };
A.loop = () => { S.deck.loop = !S.deck.loop; S.dirty(); ONE.ribbon.refresh(); };
A.hideSlide = () => { S.slide().hidden = !S.slide().hidden; S.changed(); };

/* ---------- views ---------- */
A.sorter = () => {
  const ov = el('div', { class:'sorter' }), grid = el('div', { class:'sgrid' });
  const render = () => { grid.innerHTML = ''; S.deck.slides.forEach((s, i) => { const c = el('div', { class:'scard' + (i === S.cur ? ' on' : '') + (s.hidden ? ' hidden-slide' : ''), draggable:'true', style:{ animationDelay:Math.min(i, 20) * 25 + 'ms' } }, S.thumb(s, 240), el('span', { text:i + 1 }));
    c.onclick = () => { S.cur = i; render(); }; c.ondblclick = () => { close(); S.goto(i); };
    c.ondragstart = e => e.dataTransfer.setData('text/plain', i); c.ondragover = e => e.preventDefault(); c.ondrop = e => { e.preventDefault(); const f = +e.dataTransfer.getData('text/plain'); const [m] = S.deck.slides.splice(f, 1); S.deck.slides.splice(i, 0, m); S.cur = i; S.changed(); render(); };
    grid.append(c); }); };
  const close = () => { ov.classList.add('out'); setTimeout(() => ov.remove(), 200); ONE.ribbon.refresh(); };
  ov.append(el('div', { class:'sorter-bar' }, el('b', { text:'Slide Sorter' }), el('span', { class:'muted', text:'Drag to reorder · double-click to open' }), el('span', { class:'grow' }), el('button', { class:'btn filled', text:'Done', onclick:close })), grid);
  $('.work').append(ov); render(); S.sorterOpen = close;
};
A.normal = () => { if (S.sorterOpen) { S.sorterOpen(); S.sorterOpen = null; } };
A.outline = () => {
  const list = el('div', { class:'outline' });
  S.deck.slides.forEach((s, i) => { const tEl = s.els.find(e => e.role === 'title'), body = s.els.filter(e => e.type === 'text' && e.role !== 'title');
    const ti = el('input', { class:'tf', value:tEl ? (tEl.html || '').replace(/<[^>]+>/g, '') : '', placeholder:'(No title)', disabled:!tEl });
    ti.oninput = () => { if (tEl) { tEl.html = esc(ti.value); S.dirty(); } };
    list.append(el('div', { class:'ol-slide' }, el('span', { class:'ol-num', text:i + 1 }), el('div', { class:'grow' }, ti, ...body.map(b => el('div', { class:'ol-body', html:b.html || '' })))));
  });
  ONE.modal({ title:'Outline', width:680, body:list, onClose:() => S.changed(), actions:[{ label:'Copy as Markdown', kind:'text', on:() => { ONE.copyText(S.toMarkdown()); return false; } }, { label:'Done', kind:'filled' }] });
};
S.toMarkdown = () => S.deck.slides.map(s => { const t = s.els.find(e => e.role === 'title'); const tx = h => { const d = document.createElement('div'); d.innerHTML = h || ''; const lis = [...d.querySelectorAll('li')]; return lis.length ? lis.map(l => '- ' + l.textContent.trim()).join('\n') : d.innerText.trim(); }; return `# ${t ? tx(t.html) || 'Untitled' : 'Untitled'}\n\n${s.els.filter(e => e.type === 'text' && e.role !== 'title').map(e => tx(e.html)).filter(Boolean).join('\n\n')}${s.notes ? `\n\n> Notes: ${s.notes}` : ''}`; }).join('\n\n---\n\n');
A.notes = () => { $('#notesWrap').hidden = !$('#notesWrap').hidden; S.fit(); ONE.ribbon.refresh(); };
A.guides = () => { $('#stage').classList.toggle('gridon'); ONE.ribbon.refresh(); };

/* ---------- review ---------- */
A.spell = () => { const on = !document.body.classList.contains('nospell'); document.body.classList.toggle('nospell', on); ONE.ribbon.refresh(); ONE.toast(on ? 'Spell check off.' : 'Spell check on while editing text.'); };
A.a11y = () => { const issues = []; S.deck.slides.forEach((s, i) => { if (!s.els.some(e => e.role === 'title' && (e.html || '').replace(/<[^>]+>/g, '').trim())) issues.push({ i, t:'Missing slide title', d:'Titles let people navigate the deck with a screen reader.' }); s.els.forEach(e => { if ((e.type === 'image' || e.type === 'chart') && !(e.alt || '').trim()) issues.push({ i, id:e.id, t:`${e.type === 'image' ? 'Picture' : 'Chart'} missing alt text`, d:'Describe it in Format › Alt text.' }); }); });
  let m; const body = el('div', { class:'dlg-col' }); if (!issues.length) body.append(el('p', { text:'No accessibility issues found.' }));
  issues.forEach(x => body.append(el('button', { class:'a11y-item', html:`${icon('error')}<span><b>Slide ${x.i + 1}: ${esc(x.t)}</b><small>${esc(x.d)}</small></span>`, onclick:() => { m.close(); S.goto(x.i); if (x.id) { S.sel = [x.id]; S.renderSel(); A.formatPane(); } } })));
  m = ONE.modal({ title:'Accessibility', icon:'accessibility_new', width:520, body }); };
S.findDialog = replace => {
  const q = ONE.input(), w = ONE.input(), mc = ONE.check('Match case'), res = el('div', { class:'muted', style:{ minHeight:'18px' } });
  const hits = () => { const out = []; if (!q.value) return out; S.deck.slides.forEach((s, i) => s.els.forEach(e => { const t = (e.html || '').replace(/<[^>]+>/g, ''); if ((mc.input.checked ? t : t.toLowerCase()).includes(mc.input.checked ? q.value : q.value.toLowerCase())) out.push({ i, e }); })); return out; };
  let k = 0;
  ONE.modal({ title:replace ? 'Replace' : 'Find', width:460, body:el('div', { class:'dlg-col' }, ONE.field('Find what', q), replace ? ONE.field('Replace with', w) : null, mc.wrap, res), actions:[
    { label:'Find Next', on:() => { const h = hits(); if (!h.length) { res.textContent = 'No matches.'; return false; } const x = h[k++ % h.length]; S.goto(x.i); S.sel = [x.e.id]; S.renderSel(); res.textContent = `Match ${((k - 1) % h.length) + 1} of ${h.length} (slide ${x.i + 1})`; return false; } },
    replace ? { label:'Replace All', kind:'filled', on:() => { let n = 0; const re = new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mc.input.checked ? 'g' : 'gi'); S.deck.slides.forEach(s => s.els.forEach(e => { if (!e.html) return; const d = document.createElement('div'); d.innerHTML = e.html; const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); for (let nd; (nd = tw.nextNode());) { const nv = nd.data.replace(re, () => { n++; return w.value; }); nd.data = nv; } e.html = d.innerHTML; })); S.changed(); ONE.toast(`Made ${n} replacement${n === 1 ? '' : 's'}.`); } } : { label:'Close', kind:'filled' }] });
};
A.find = () => S.findDialog(false); A.replace = () => S.findDialog(true);
})();
