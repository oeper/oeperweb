/* oneSheet — commands: formatting, structure, data tools, charts, pivot, names, notes, dialogs */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const A = X.act = {}, P = X.pops = {};
const sh = () => X.sh;
const range = (a, b) => { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; };
const clean = o => { const n = {}; for (const k in o) if (o[k] != null && o[k] !== false) n[k] = o[k]; return Object.keys(n).length ? n : undefined; };

/* ---------- styling ---------- */
X.styleSel = patch => X.mutate(() => {
  const g = X.normSel(), s = sh(), keys = Object.keys(patch);
  const strip = cell => { if (cell && cell.s) { keys.forEach(k => delete cell.s[k]); if (!Object.keys(cell.s).length) delete cell.s; } };
  if (X.isFullCols(g) && X.isFullRows(g)) { range(0, X.NC - 1).forEach(c => { s.colS[c] = clean({ ...s.colS[c], ...patch }); }); Object.values(s.cells).forEach(strip); }
  else if (X.isFullCols(g)) range(g.c1, g.c2).forEach(c => { s.colS[c] = clean({ ...s.colS[c], ...patch }); Object.keys(s.cells).forEach(k => { if (+k.split(',')[1] === c) strip(s.cells[k]); }); });
  else if (X.isFullRows(g)) range(g.r1, g.r2).forEach(r => { s.rowS[r] = clean({ ...s.rowS[r], ...patch }); Object.keys(s.cells).forEach(k => { if (+k.split(',')[0] === r) strip(s.cells[k]); }); });
  else X.forSel((r, c) => X.setStyle(s, r, c, patch), g);
  if (patch.wrap !== undefined || patch.size) X.forSel(r => X.autofitRow(r), { r1:g.r1, r2:Math.min(g.r2, X.usedRows(s)), c1:0, c2:0 });
});
const cur = () => X.styleOf(sh(), X.sel.ar, X.sel.ac);
X.toggle = k => X.styleSel({ [k]:!cur()[k] || undefined });
A.bold = () => X.toggle('bold'); A.italic = () => X.toggle('italic'); A.underline = () => X.toggle('underline'); A.strike = () => X.toggle('strike');
A.wrap = () => X.styleSel({ wrap:!cur().wrap || undefined });
X.fore = '#C00000'; X.fillC = '#FFFF00';
A.fore = () => X.styleSel({ color:X.fore }); A.fill = () => X.styleSel({ fill:X.fillC });
P.fore = a => ONE.pop.open(a, ONE.colorGrid(c => { if (c && c !== 'none') { X.fore = c; $('#barFore').style.background = c; } X.styleSel({ color:c && c !== 'none' ? c : undefined }); }, { autoLabel:'Automatic' }));
P.fill = a => ONE.pop.open(a, ONE.colorGrid(c => { if (c && c !== 'none') { X.fillC = c; $('#barFill').style.background = c; } X.styleSel({ fill:c && c !== 'none' ? c : undefined }); }, { noneLabel:'No Fill' }));
A.alignL = () => X.styleSel({ align:'left' }); A.alignC = () => X.styleSel({ align:'center' }); A.alignR = () => X.styleSel({ align:'right' });
A.vTop = () => X.styleSel({ valign:'top' }); A.vMid = () => X.styleSel({ valign:'middle' }); A.vBot = () => X.styleSel({ valign:undefined });
A.indentInc = () => X.styleSel({ indent:(cur().indent || 0) + 1 }); A.indentDec = () => X.styleSel({ indent:Math.max(0, (cur().indent || 0) - 1) || undefined });
X.setFont = f => X.styleSel({ font:f === 'Calibri' ? undefined : f });
X.setSize = n => X.styleSel({ size:n === 11 ? undefined : n });
const SIZES = [8,9,10,11,12,14,16,18,20,22,24,26,28,36,48,72];
A.grow = () => { const s = cur().size || 11; X.setSize(SIZES.find(x => x > s) || s + 8); };
A.shrink = () => { const s = cur().size || 11; X.setSize([...SIZES].reverse().find(x => x < s) || Math.max(1, s - 1)); };
P.borders = a => {
  const set = mode => X.mutate(() => { const g = X.normSel(), s = sh(); const line = mode.startsWith('thick') ? 'thick' : mode === 'double' ? 'double' : 'thin';
    X.forSel((r, c) => { const b = Object.assign({}, X.styleOf(s, r, c).border);
      if (mode === 'none') { X.setStyle(s, r, c, { border:undefined }); return; }
      if (mode === 'all') Object.assign(b, { t:line, b:line, l:line, r:line });
      if (mode === 'outside' || mode === 'thickbox') { if (r === g.r1) b.t = line; if (r === g.r2) b.b = line; if (c === g.c1) b.l = line; if (c === g.c2) b.r = line; }
      if (mode === 'bottom' || mode === 'thickbottom' || mode === 'double') { if (r === g.r2) b.b = line; }
      if (mode === 'top' && r === g.r1) b.t = line; if (mode === 'left' && c === g.c1) b.l = line; if (mode === 'right' && c === g.c2) b.r = line;
      if (mode === 'topbottom') { if (r === g.r1) b.t = 'thin'; if (r === g.r2) b.b = 'thin'; }
      X.setStyle(s, r, c, { border:b }); }, g); });
  ONE.menuAt(a, [['bottom','Bottom Border','border_bottom'],['top','Top Border','border_top'],['left','Left Border','border_left'],['right','Right Border','border_right'],'-',['none','No Border','border_clear'],['all','All Borders','border_all'],['outside','Outside Borders','border_outer'],['thickbox','Thick Outside Borders','border_outer'],'-',['double','Bottom Double Border','border_bottom'],['thickbottom','Thick Bottom Border','border_bottom'],['topbottom','Top and Bottom Border','border_horizontal']]
    .map(x => x === '-' ? '-' : { label:x[1], icon:x[2], on:() => set(x[0]) }));
};
A.bordersAll = () => { const b = $('[data-act="pop:borders"]'); P.borders(b); };
/* number formats */
X.NUMFMTS = [['general','General'],['number','Number'],['currency','Currency'],['accounting','Accounting'],['date','Short Date'],['longdate','Long Date'],['time','Time'],['percent','Percentage'],['fraction','Fraction'],['scientific','Scientific'],['text','Text']];
X.setNumFmt = t => { const f = { general:undefined, number:{ type:'number', dec:2, sep:true }, currency:{ type:'currency', sym:'$', dec:2 }, accounting:{ type:'accounting', sym:'$', dec:2 }, date:{ type:'date', pattern:'short' }, longdate:{ type:'date', pattern:'long' }, time:{ type:'time' }, percent:{ type:'percent', dec:0 }, fraction:{ type:'fraction' }, scientific:{ type:'scientific', dec:2 }, text:{ type:'text' } }[t]; X.styleSel({ fmt:f }); };
A.currency = () => X.setNumFmt('accounting'); A.percent = () => X.setNumFmt('percent'); A.comma = () => X.styleSel({ fmt:{ type:'number', dec:2, sep:true } });
P.currency = a => ONE.menuAt(a, [['$','$ English (United States)'],['€','€ Euro'],['£','£ English (United Kingdom)'],['¥','¥ Japanese']].map(([s, n]) => ({ label:n, on:() => X.styleSel({ fmt:{ type:'accounting', sym:s, dec:2 } }) })));
const decStep = d => { const f = cur().fmt || { type:'number', dec:0 }; const v = X.value(X.sel.ar, X.sel.ac); let dec = f.dec; if (dec == null) { const s = typeof v === 'number' ? String(v) : ''; dec = (s.split('.')[1] || '').length; } X.styleSel({ fmt:Object.assign({}, f.type === 'general' || !f.type ? { type:'number' } : f, { dec:Math.max(0, Math.min(10, dec + d)) }) }); };
A.decInc = () => decStep(1); A.decDec = () => decStep(-1);
P.numFmt = a => ONE.menuAt(a, [...X.NUMFMTS.map(([k, n]) => { const v = X.value(X.sel.ar, X.sel.ac); const f = { general:{}, number:{ type:'number', dec:2 }, currency:{ type:'currency', dec:2, sym:'$' }, accounting:{ type:'accounting', dec:2, sym:'$' }, date:{ type:'date' }, longdate:{ type:'date', pattern:'long' }, time:{ type:'time' }, percent:{ type:'percent', dec:2 }, fraction:{ type:'fraction' }, scientific:{ type:'scientific', dec:2 }, text:{ type:'text' } }[k];
  return { label:n, sub:typeof v === 'number' ? X.format(v, f) : '', on:() => X.setNumFmt(k) }; }), '-', { label:'More Number Formats…', icon:'tune', on:() => X.formatCells('number') }]);
/* merge */
X.merge = mode => X.mutate(() => {
  const g = X.normSel(), s = sh();
  s.merges = s.merges.filter(m => !(m.r2 >= g.r1 && m.r1 <= g.r2 && m.c2 >= g.c1 && m.c1 <= g.c2));
  if (mode === 'unmerge') return;
  const rows = mode === 'across' ? range(g.r1, g.r2).map(r => ({ r1:r, r2:r, c1:g.c1, c2:g.c2 })) : [g];
  rows.forEach(m => { if (m.r1 === m.r2 && m.c1 === m.c2) return; let kept = false; for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) { if (r === m.r1 && c === m.c1) continue; const k = s.cells[r + ',' + c]; if (k && k.v) kept = true; delete s.cells[r + ',' + c]; } if (kept) ONE.toast('Merging kept only the upper-left value.'); s.merges.push(m); if (mode === 'center') X.setStyle(s, m.r1, m.c1, { align:'center' }); });
});
P.merge = a => ONE.menuAt(a, [{ label:'Merge & Center', icon:'merge_type', on:() => X.merge('center') }, { label:'Merge Across', icon:'table_rows', on:() => X.merge('across') }, { label:'Merge Cells', icon:'call_merge', on:() => X.merge('cells') }, { label:'Unmerge Cells', icon:'call_split', on:() => X.merge('unmerge') }]);
A.mergeCenter = () => { const g = X.normSel(); if (sh().merges.some(m => m.r1 === g.r1 && m.c1 === g.c1 && m.r2 === g.r2 && m.c2 === g.c2)) X.merge('unmerge'); else X.merge('center'); };
/* clear */
A.clearContents = () => X.mutate(() => X.forSel((r, c) => { const k = sh().cells[r + ',' + c]; if (!k) return; if (k.s) k.v = ''; else delete sh().cells[r + ',' + c]; }));
P.clear = a => ONE.menuAt(a, [{ label:'Clear All', icon:'clear_all', on:() => X.mutate(() => X.forSel((r, c) => { delete sh().cells[r + ',' + c]; delete sh().notes[r + ',' + c]; })) }, { label:'Clear Formats', icon:'format_clear', on:() => X.mutate(() => X.forSel((r, c) => { const k = sh().cells[r + ',' + c]; if (k) { delete k.s; if (!k.v) delete sh().cells[r + ',' + c]; } })) },
  { label:'Clear Contents', icon:'backspace', kbd:'Delete', on:A.clearContents }, { label:'Clear Notes', icon:'speaker_notes_off', on:() => X.mutate(() => X.forSel((r, c) => delete sh().notes[r + ',' + c])) }, { label:'Clear Hyperlinks', icon:'link_off', on:() => X.styleSel({ link:undefined }) }]);
/* format painter */
X.painter = null;
A.painter = () => { X.painter = X.painter ? null : JSON.parse(JSON.stringify(cur())); ONE.ribbon.refresh(); if (X.painter) ONE.toast('Select the cells to paint the format onto.'); };
$('#gscroll').addEventListener('pointerup', () => { if (!X.painter) return; const p = X.painter; X.painter = null; X.mutate(() => X.forSel((r, c) => { const k = sh().cells[r + ',' + c] || (sh().cells[r + ',' + c] = { v:'' }); k.s = Object.keys(p).length ? JSON.parse(JSON.stringify(p)) : undefined; if (!k.s) delete k.s; })); ONE.ribbon.refresh(); });

/* ---------- cell styles & tables ---------- */
X.CELLSTYLES = [
  ['Normal', {}], ['Good', { fill:'#C6EFCE', color:'#006100' }], ['Bad', { fill:'#FFC7CE', color:'#9C0006' }], ['Neutral', { fill:'#FFEB9C', color:'#9C5700' }],
  ['Title', { size:18, color:'#44546A', font:'"Calibri Light", Calibri, Carlito, sans-serif' }], ['Heading 1', { size:15, bold:true, color:'#44546A', border:{ b:'thick' } }], ['Heading 2', { size:13, bold:true, color:'#44546A', border:{ b:'medium' } }],
  ['Total', { bold:true, border:{ t:'thin', b:'double' } }], ['Input', { fill:'#FFCC99', color:'#3F3F76', border:{ t:'thin', b:'thin', l:'thin', r:'thin' } }], ['Calculation', { fill:'#F2F2F2', color:'#FA7D00', bold:true }],
  ['Note', { fill:'#FFFFCC', border:{ t:'thin', b:'thin', l:'thin', r:'thin' } }], ['Warning Text', { color:'#FF0000' }], ['Accent 1', { fill:'#4472C4', color:'#FFFFFF' }], ['Accent 2', { fill:'#ED7D31', color:'#FFFFFF' }]
];
P.cellStyles = a => {
  const g = el('div', { class:'cstyles' });
  X.CELLSTYLES.forEach(([n, st]) => { const b = el('button', { class:'cstyle', text:n }); Object.assign(b.style, { background:st.fill || '#fff', color:st.color || '#000', fontWeight:st.bold ? 700 : 400, fontSize:st.size ? Math.min(16, st.size) + 'px' : '', borderBottom:st.border && st.border.b ? '2px solid ' + (st.color || '#000') : '' });
    b.onclick = () => { ONE.pop.close(); X.mutate(() => X.forSel((r, c) => { const k = sh().cells[r + ',' + c] || (sh().cells[r + ',' + c] = { v:'' }); const keep = k.s && k.s.fmt; k.s = Object.keys(st).length ? JSON.parse(JSON.stringify(st)) : undefined; if (keep) k.s = Object.assign(k.s || {}, { fmt:keep }); if (!k.s) delete k.s; })); }; g.append(b); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Cell styles' }), g));
};
P.asTable = a => {
  const g = el('div', { class:'tblgrid' });
  Object.entries(X.TABLE_STYLES).forEach(([k, t]) => g.append(el('button', { class:'tblsw', title:k, 'aria-label':`${k} table style`, html:`<i style="background:${t.h}"></i><i style="background:${t.b1}"></i><i style="background:${t.b2}"></i><i style="background:${t.b1}"></i>`, onclick:() => { ONE.pop.close(); X.makeTable(k); } })));
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Table styles' }), g));
};
X.makeTable = style => {
  let g = X.normSel(); if (g.r1 === g.r2 && g.c1 === g.c2) g = X.region();
  if (g.r1 === g.r2) return ONE.toast('Select the data, including a header row, to format as a table.');
  X.mutate(() => { const s = sh(); s.tables = s.tables.filter(t => !(t.r2 >= g.r1 && t.r1 <= g.r2 && t.c2 >= g.c1 && t.c1 <= g.c2)); s.tables.push({ ...g, style, header:true }); s.filter = { r:g.r1, c1:g.c1, c2:g.c2, r2:g.r2, crit:{}, hidden:{} }; });
  X.select(g.r1, g.c1, g.r2, g.c2, g.r1, g.c1, true); ONE.toast('Formatted as a table with filter buttons.');
};
A.table = () => X.makeTable('blue');
A.tableTotal = () => { const s = sh(), t = s.tables.find(t => X.sel.ar >= t.r1 && X.sel.ar <= t.r2 && X.sel.ac >= t.c1 && X.sel.ac <= t.c2); if (!t) return ONE.toast('Click inside a table first.'); X.mutate(() => { if (t.total) { t.total = false; return; } const r = t.r2 + 1; X.setRaw(s, r, t.c1, 'Total'); for (let c = t.c1 + 1; c <= t.c2; c++) { const v = X.valueAt(X.wb, s, t.r2, c); if (typeof v === 'number') X.setRaw(s, r, c, `=SUBTOTAL(109,${X.colName(c)}${t.r1 + 2}:${X.colName(c)}${t.r2 + 1})`.replace('SUBTOTAL(109,', 'SUM(')); } t.r2 = r; t.total = true; }); };

/* ---------- conditional formatting ---------- */
const HL = { fill:'#FFC7CE', color:'#9C0006' };
const PRESETS = [['Light Red Fill with Dark Red Text', { fill:'#FFC7CE', color:'#9C0006' }], ['Yellow Fill with Dark Yellow Text', { fill:'#FFEB9C', color:'#9C5700' }], ['Green Fill with Dark Green Text', { fill:'#C6EFCE', color:'#006100' }], ['Light Red Fill', { fill:'#FFC7CE' }], ['Red Text', { color:'#9C0006' }], ['Bold', { bold:true }]];
X.addCF = rule => X.mutate(() => { sh().cf.push(Object.assign({ id:ONE.uid(), g:X.normSel() }, rule)); });
const cfDialog = (title, type, two, isText) => {
  const a = ONE.input({ type:isText ? 'text' : 'number', value:'' }), b = ONE.input({ type:'number' }), st = ONE.select(PRESETS.map((p, i) => [i, p[0]]), 0);
  const v = X.value(X.sel.ar, X.sel.ac); if (typeof v === 'number' && !isText) a.value = v;
  ONE.modal({ title, body:el('div', { class:'dlg-col' }, two ? el('div', { class:'grid2' }, ONE.field('From', a), ONE.field('To', b)) : ONE.field(isText ? 'Text that contains' : 'Value', a), ONE.field('Format with', st)),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => X.addCF({ type, a:isText ? a.value : parseFloat(a.value) || 0, b:parseFloat(b.value) || 0, style:PRESETS[+st.value][1] }) }] });
};
P.cf = a => ONE.menuAt(a, [{ title:'Highlight Cells Rules' },
  { label:'Greater Than…', icon:'chevron_right', on:() => cfDialog('Greater Than', 'gt') }, { label:'Less Than…', icon:'chevron_left', on:() => cfDialog('Less Than', 'lt') }, { label:'Between…', icon:'unfold_less', on:() => cfDialog('Between', 'between', true) },
  { label:'Equal To…', icon:'drag_handle', on:() => cfDialog('Equal To', 'eq', false, true) }, { label:'Text that Contains…', icon:'text_fields', on:() => cfDialog('Text that Contains', 'text', false, true) }, { label:'Duplicate Values', icon:'content_copy', on:() => X.addCF({ type:'dup', style:HL }) },
  { title:'Top/Bottom Rules' }, { label:'Top 10 Items', icon:'vertical_align_top', on:() => X.addCF({ type:'top', a:10, style:{ fill:'#C6EFCE', color:'#006100' } }) }, { label:'Bottom 10 Items', icon:'vertical_align_bottom', on:() => X.addCF({ type:'bottom', a:10, style:HL }) },
  { label:'Above Average', icon:'trending_up', on:() => X.addCF({ type:'above', style:{ fill:'#C6EFCE', color:'#006100' } }) }, { label:'Below Average', icon:'trending_down', on:() => X.addCF({ type:'below', style:HL }) },
  { title:'Visuals' }, { label:'Data Bars', icon:'bar_chart', on:() => ONE.menuAt(a, ['#638EC6','#63BE7B','#FF555A','#FFB628','#008AEF','#D6007B'].map(c => ({ html:`<span style="display:inline-block;width:120px;height:14px;border-radius:3px;background:linear-gradient(90deg,${c},${c}22)"></span>`, on:() => X.addCF({ type:'bar', color:c }) }))) },
  { label:'Color Scales', icon:'gradient', on:() => ONE.menuAt(a, [['#F8696B','#FFEB84','#63BE7B'],['#63BE7B','#FFEB84','#F8696B'],['#F8696B','#FFFFFF','#5A8AC6'],['#FFFFFF','#FFEB84','#63BE7B']].map(cs => ({ html:`<span style="display:inline-block;width:120px;height:14px;border-radius:3px;background:linear-gradient(90deg,${cs.join(',')})"></span>`, on:() => X.addCF({ type:'scale', colors:cs }) }))) },
  { label:'Icon Sets (traffic lights)', icon:'traffic', on:() => X.addCF({ type:'icons' }) }, '-',
  { label:'Clear Rules from Selected Cells', icon:'format_clear', on:() => X.mutate(() => { const g = X.normSel(); sh().cf = sh().cf.filter(r => !(r.g.r2 >= g.r1 && r.g.r1 <= g.r2 && r.g.c2 >= g.c1 && r.g.c1 <= g.c2)); }) },
  { label:'Clear Rules from Entire Sheet', icon:'delete_sweep', on:() => X.mutate(() => { sh().cf = []; }) }, { label:'Manage Rules…', icon:'rule', on:X.manageCF }]);
X.manageCF = () => {
  const list = el('div', { class:'list' }); const names = { gt:'Greater than', lt:'Less than', between:'Between', eq:'Equal to', text:'Text contains', dup:'Duplicate values', top:'Top 10', bottom:'Bottom 10', above:'Above average', below:'Below average', bar:'Data bar', scale:'Color scale', icons:'Icon set' };
  const render = () => { list.innerHTML = ''; if (!sh().cf.length) list.append(el('p', { class:'muted', text:'No conditional formatting rules on this sheet.' }));
    sh().cf.forEach((r, i) => list.append(el('div', { class:'list-item' }, el('span', { class:'cfsw', style:{ background:(r.style && r.style.fill) || r.color || (r.colors && `linear-gradient(90deg,${r.colors})`) || '#ddd', color:(r.style && r.style.color) || '#000' }, text:'Aa' }), el('span', { class:'grow', html:`<b>${names[r.type]}${r.a != null && r.type !== 'top' && r.type !== 'bottom' ? ' ' + esc(r.a) : ''}${r.type === 'between' ? ' and ' + r.b : ''}</b><small>Applies to ${X.rangeStr(r.g)}</small>` }), el('button', { class:'icon-btn', title:'Delete rule', html:icon('delete'), onclick:() => { X.mutate(() => sh().cf.splice(i, 1)); render(); } })))); };
  render(); ONE.modal({ title:'Conditional Formatting Rules', width:520, body:list });
};

/* ---------- structure: insert / delete rows & columns ---------- */
const adjIdx = (a, at, n) => n > 0 ? (a >= at ? a + n : a) : (a >= at && a < at - n ? null : a >= at - n ? a + n : a);
const adjSpan = (lo, hi, at, n) => { if (n > 0) return [lo >= at ? lo + n : lo, hi >= at ? hi + n : hi]; const d1 = at - n - 1; if (lo >= at && hi <= d1) return null; return [lo < at ? lo : lo > d1 ? lo + n : at, hi < at ? hi : hi > d1 ? hi + n : at - 1]; };
X.shiftAxis = (axis, at, n) => {
  const s = sh(), R = axis === 'r';
  const mk = obj => { const out = {}; for (const k in obj) { const [r, c] = k.split(',').map(Number); const a = adjIdx(R ? r : c, at, n); if (a == null) continue; out[R ? a + ',' + c : r + ',' + a] = obj[k]; } return out; };
  const mk1 = obj => { const out = {}; for (const k in obj) { const a = adjIdx(+k, at, n); if (a != null) out[a] = obj[k]; } return out; };
  s.cells = mk(s.cells); s.notes = mk(s.notes); s.valid = mk(s.valid); s.spark = mk(s.spark || {});
  if (R) { s.rowH = mk1(s.rowH); s.rowS = mk1(s.rowS); s.hidR = mk1(s.hidR); } else { s.colW = mk1(s.colW); s.colS = mk1(s.colS); s.hidC = mk1(s.hidC); }
  const adjG = g => { const sp = adjSpan(R ? g.r1 : g.c1, R ? g.r2 : g.c2, at, n); if (!sp) return null; return R ? { ...g, r1:sp[0], r2:sp[1] } : { ...g, c1:sp[0], c2:sp[1] }; };
  s.merges = s.merges.map(adjG).filter(Boolean); s.tables = s.tables.map(adjG).filter(Boolean); s.cf = s.cf.map(r => { const g = adjG(r.g); return g ? { ...r, g } : null; }).filter(Boolean);
  if (s.filter) { const f = adjG({ r1:s.filter.r, r2:s.filter.r2 ?? s.filter.r, c1:s.filter.c1, c2:s.filter.c2 }); s.filter = f ? { ...s.filter, r:f.r1, r2:f.r2, c1:f.c1, c2:f.c2, hidden:{}, crit:{} } : null; }
  s.charts.forEach(ch => { ch.src = X.adjustRefs('=' + ch.src, s.name, s.name, axis, at, n).slice(1); });
  X.wb.sheets.forEach(o => Object.values(o.cells).forEach(c => { if (typeof c.v === 'string' && c.v[0] === '=') c.v = X.adjustRefs(c.v, s.name, o.name, axis, at, n); }));
  for (const k in X.wb.names) X.wb.names[k] = X.adjustRefs('=' + X.wb.names[k], s.name, s.name, axis, at, n).slice(1);
};
A.insertRows = () => { const g = X.normSel(); X.mutate(() => X.shiftAxis('r', g.r1, g.r2 - g.r1 + 1)); };
A.insertCols = () => { const g = X.normSel(); X.mutate(() => X.shiftAxis('c', g.c1, g.c2 - g.c1 + 1)); };
A.deleteRows = () => { const g = X.normSel(); X.mutate(() => X.shiftAxis('r', g.r1, -(g.r2 - g.r1 + 1))); X.select(g.r1, X.sel.ac); };
A.deleteCols = () => { const g = X.normSel(); X.mutate(() => X.shiftAxis('c', g.c1, -(g.c2 - g.c1 + 1))); X.select(X.sel.ar, g.c1); };
A.insertCellsDown = () => { const g = X.normSel(), s = sh(); X.mutate(() => { const n = g.r2 - g.r1 + 1, maxR = X.usedRows(s); for (let c = g.c1; c <= g.c2; c++) for (let r = maxR - 1; r >= g.r1; r--) { const k = s.cells[r + ',' + c]; delete s.cells[r + ',' + c]; if (k) s.cells[(r + n) + ',' + c] = k; } }); };
A.deleteCellsUp = () => { const g = X.normSel(), s = sh(); X.mutate(() => { const n = g.r2 - g.r1 + 1, maxR = X.usedRows(s); for (let c = g.c1; c <= g.c2; c++) { for (let r = g.r1; r <= g.r2; r++) delete s.cells[r + ',' + c]; for (let r = g.r2 + 1; r < maxR; r++) { const k = s.cells[r + ',' + c]; delete s.cells[r + ',' + c]; if (k) s.cells[(r - n) + ',' + c] = k; } } }); };
P.insert = a => ONE.menuAt(a, [{ label:'Insert Cells (shift down)', icon:'add_box', on:A.insertCellsDown }, { label:'Insert Sheet Rows', icon:'table_rows', kbd:'Ctrl++', on:A.insertRows }, { label:'Insert Sheet Columns', icon:'view_column', on:A.insertCols }, { label:'Insert Sheet', icon:'note_add', kbd:'Shift+F11', on:() => X.addSheet() }]);
P.delete = a => ONE.menuAt(a, [{ label:'Delete Cells (shift up)', icon:'indeterminate_check_box', on:A.deleteCellsUp }, { label:'Delete Sheet Rows', icon:'table_rows', kbd:'Ctrl+-', on:A.deleteRows }, { label:'Delete Sheet Columns', icon:'view_column', on:A.deleteCols }, { label:'Delete Sheet', icon:'delete', danger:true, on:() => X.deleteSheet(X.wb.active) }]);
const sizeDialog = (title, get, set) => { const i = ONE.input({ type:'number', value:get(), min:0, max:600 }); ONE.modal({ title, body:ONE.field(title + ' (pixels)', i), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => X.mutate(() => set(Math.max(0, parseInt(i.value) || 0))) }] }); };
P.format = a => { const g = X.normSel();
  ONE.menuAt(a, [{ title:'Cell Size' },
    { label:'Row Height…', icon:'height', on:() => sizeDialog('Row Height', () => X.rowH(sh(), g.r1), v => range(g.r1, g.r2).forEach(r => sh().rowH[r] = v)) },
    { label:'AutoFit Row Height', icon:'expand', on:() => X.mutate(() => range(g.r1, Math.min(g.r2, X.usedRows(sh()))).forEach(X.autofitRow)) },
    { label:'Column Width…', icon:'width', on:() => sizeDialog('Column Width', () => X.colW(sh(), g.c1), v => range(g.c1, g.c2).forEach(c => sh().colW[c] = v)) },
    { label:'AutoFit Column Width', icon:'fit_width', on:() => X.mutate(() => range(g.c1, Math.min(g.c2, X.usedCols(sh()))).forEach(X.autofitCol)) },
    { label:'Default Width…', icon:'straighten', on:() => sizeDialog('Standard Width', () => X.DEF_W, v => { X.DEF_W = v || 88; }) },
    { title:'Visibility' }, { label:'Hide Rows', icon:'visibility_off', kbd:'Ctrl+9', on:A.hideRows }, { label:'Hide Columns', icon:'visibility_off', kbd:'Ctrl+0', on:A.hideCols }, { label:'Unhide Rows', icon:'visibility', on:A.unhideRows }, { label:'Unhide Columns', icon:'visibility', on:A.unhideCols },
    { label:'Hide Sheet', icon:'tab_unselected', on:() => { if (X.wb.sheets.filter(s => !s.hidden).length < 2) return ONE.toast('You can’t hide the only visible sheet.'); sh().hidden = true; const i = X.wb.sheets.findIndex(s => !s.hidden); X.switchSheet(i); X.record(); } },
    { label:'Unhide Sheet…', icon:'tab', disabled:!X.wb.sheets.some(s => s.hidden), on:() => ONE.menuAt(a, X.wb.sheets.filter(s => s.hidden).map(s => ({ label:s.name, on:() => { s.hidden = false; X.renderTabs(); X.record(); } }))) },
    { title:'Organize Sheets' }, { label:'Rename Sheet', icon:'edit', on:() => X.renameSheet(X.wb.active) }, { label:'Tab Color', icon:'palette', on:() => ONE.pop.open(a, ONE.colorGrid(c => { sh().tab = c && c !== 'none' ? c : ''; X.renderTabs(); X.changed(); }, { noneLabel:'No Color' })) },
    { title:'Protection' }, { label:sh().protect ? 'Unprotect Sheet' : 'Protect Sheet', icon:'lock', on:A.protect }, '-', { label:'Format Cells…', icon:'tune', kbd:'Ctrl+1', on:() => X.formatCells() }]); };
A.hideRows = () => { const g = X.normSel(); X.mutate(() => range(g.r1, g.r2).forEach(r => sh().hidR[r] = 1)); };
A.hideCols = () => { const g = X.normSel(); X.mutate(() => range(g.c1, Math.min(g.c2, X.NC)).forEach(c => sh().hidC[c] = 1)); };
A.unhideRows = () => { const g = X.normSel(); X.mutate(() => range(Math.max(0, g.r1 - 1), g.r2 + 1).forEach(r => delete sh().hidR[r])); };
A.unhideCols = () => { const g = X.normSel(); X.mutate(() => range(Math.max(0, g.c1 - 1), g.c2 + 1).forEach(c => delete sh().hidC[c])); };
A.protect = () => { sh().protect = !sh().protect; X.changed(); ONE.ribbon.refresh(); ONE.toast(sh().protect ? 'Sheet protected. Cells can be selected but not changed.' : 'Sheet unprotected.'); };

/* ---------- Format Cells dialog ---------- */
X.formatCells = (tab = 'number') => {
  const s0 = cur(), f0 = s0.fmt || { type:'general' };
  const type = ONE.select(X.NUMFMTS.filter(x => x[0] !== 'longdate').map(([k, n]) => [k, n]), f0.type || 'general');
  const dec = ONE.input({ type:'number', min:0, max:10, value:f0.dec ?? 2 }), sep = ONE.check('Use 1000 separator (,)', f0.sep !== false && f0.type !== 'general');
  const sym = ONE.select([['$','$'],['€','€'],['£','£'],['¥','¥']], f0.sym || '$'), neg = ONE.select([['minus','-1,234.10'],['paren','(1,234.10)']], f0.neg || 'minus');
  const pat = ONE.select([['short','9/26/2026'],['long','Saturday, September 26, 2026'],['mdy','Sep 26, 2026'],['iso','2026-09-26'],['my','Sep-26']], f0.pattern || 'short');
  const h = ONE.select([['','General'],['left','Left'],['center','Center'],['right','Right']], s0.align || ''), v = ONE.select([['','Bottom'],['middle','Center'],['top','Top']], s0.valign || '');
  const wrap = ONE.check('Wrap text', !!s0.wrap), ind = ONE.input({ type:'number', min:0, max:15, value:s0.indent || 0 });
  const font = ONE.select(X.FONTLIST.map(f => f[0]), (s0.font || 'Calibri').split(',')[0].replace(/["']/g, '')), size = ONE.input({ type:'number', value:s0.size || 11, min:1, max:400 });
  const bold = ONE.check('Bold', !!s0.bold), ital = ONE.check('Italic', !!s0.italic), und = ONE.check('Underline', !!s0.underline), stk = ONE.check('Strikethrough', !!s0.strike);
  const color = ONE.input({ type:'color', value:s0.color || '#000000', style:{ padding:'4px' } }), fill = ONE.input({ type:'color', value:s0.fill || '#ffffff', style:{ padding:'4px' } }), noFill = ONE.check('No fill', !s0.fill);
  const prev = el('div', { class:'preview-box' });
  const build = () => { const t = type.value; const fmt = t === 'general' ? undefined : { type:t, dec:+dec.value, sep:sep.input.checked, sym:sym.value, neg:neg.value, pattern:pat.value };
    return { fmt, align:h.value || undefined, valign:v.value || undefined, wrap:wrap.input.checked || undefined, indent:+ind.value || undefined, font:font.value === 'Calibri' ? undefined : X.FONTLIST.find(f => f[0] === font.value)[1], size:+size.value === 11 ? undefined : +size.value,
      bold:bold.input.checked || undefined, italic:ital.input.checked || undefined, underline:und.input.checked || undefined, strike:stk.input.checked || undefined, color:color.value === '#000000' ? undefined : color.value, fill:noFill.input.checked ? undefined : fill.value }; };
  const sample = X.value(X.sel.ar, X.sel.ac);
  const upd = () => { const b = build(); prev.textContent = X.format(typeof sample === 'number' ? sample : 1234.5, b.fmt) || String(sample ?? ''); Object.assign(prev.style, { fontWeight:b.bold ? 700 : 400, fontStyle:b.italic ? 'italic' : 'normal', textDecoration:(b.underline ? 'underline ' : '') + (b.strike ? 'line-through' : ''), color:b.color || '#000', background:b.fill || '#fff', fontFamily:b.font || 'Calibri, Carlito, sans-serif', fontSize:Math.min(28, (b.size || 11) * 4 / 3) + 'px' });
    const t = type.value; dec.closest('.field').hidden = !['number','currency','accounting','percent','scientific'].includes(t); sep.wrap.hidden = t !== 'number'; sym.closest('.field').hidden = !['currency','accounting'].includes(t); neg.closest('.field').hidden = !['number','currency'].includes(t); pat.closest('.field').hidden = t !== 'date'; };
  const tabs = el('div', { class:'seg' }), panes = {};
  const mkPane = (id, label, ...kids) => { panes[id] = el('div', { class:'dlg-col', hidden:id !== tab }, ...kids); tabs.append(el('button', { class:'seg-b' + (id === tab ? ' on' : ''), text:label, onclick:e => { $$('.seg-b', tabs).forEach(b => b.classList.toggle('on', b === e.currentTarget)); Object.entries(panes).forEach(([k, p]) => p.hidden = k !== id); } })); };
  mkPane('number', 'Number', ONE.field('Category', type), el('div', { class:'grid2' }, ONE.field('Decimal places', dec), ONE.field('Symbol', sym), ONE.field('Negative numbers', neg), ONE.field('Date type', pat)), sep.wrap);
  mkPane('align', 'Alignment', el('div', { class:'grid2' }, ONE.field('Horizontal', h), ONE.field('Vertical', v), ONE.field('Indent', ind)), wrap.wrap);
  mkPane('font', 'Font', el('div', { class:'grid2' }, ONE.field('Font', font), ONE.field('Size', size), ONE.field('Color', color)), el('div', { class:'grid2' }, bold.wrap, ital.wrap, und.wrap, stk.wrap));
  mkPane('fill', 'Fill', el('div', { class:'grid2' }, ONE.field('Background color', fill), el('span')), noFill.wrap);
  fill.addEventListener('input', () => { noFill.input.checked = false; });
  const body = el('div', { class:'dlg-col' }, tabs, ...Object.values(panes), el('div', { class:'fieldset-title', text:'Sample' }), prev);
  body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
  ONE.modal({ title:'Format Cells', width:560, body, actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const b = build(); const all = {}; ['fmt','align','valign','wrap','indent','font','size','bold','italic','underline','strike','color','fill'].forEach(k => all[k] = b[k]); X.styleSel(all); } }] });
};

/* ---------- AutoSum, fill ---------- */
X.autoFn = fn => {
  const g = X.normSel(), s = sh();
  if (g.r1 !== g.r2 || g.c1 !== g.c2) { const multiRow = g.r2 > g.r1; X.mutate(() => { if (multiRow) { for (let c = g.c1; c <= g.c2; c++) X.setRaw(s, g.r2 + 1, c, `=${fn}(${X.colName(c)}${g.r1 + 1}:${X.colName(c)}${g.r2 + 1})`); } else X.setRaw(s, g.r1, g.c2 + 1, `=${fn}(${X.addr(g.r1, g.c1)}:${X.addr(g.r1, g.c2)})`); }); return; }
  const r = X.sel.ar, c = X.sel.ac, isN = (i, j) => typeof X.value(i, j) === 'number';
  let rg = null;
  if (r > 0 && isN(r - 1, c)) { let t = r - 1; while (t > 0 && isN(t - 1, c)) t--; rg = `${X.addr(t, c)}:${X.addr(r - 1, c)}`; }
  else if (c > 0 && isN(r, c - 1)) { let t = c - 1; while (t > 0 && isN(r, t - 1)) t--; rg = `${X.addr(r, t)}:${X.addr(r, c - 1)}`; }
  X.startEdit('enter', `=${fn}(${rg || ''}`);
  if (rg) { const ed = $('#cellEditor'), s0 = fn.length + 2; X.pointRef = { s:s0, e:s0 + rg.length }; ed.setSelectionRange(s0, s0 + rg.length); X.draw(); }
};
A.autoSum = () => X.autoFn('SUM');
P.autoSum = a => ONE.menuAt(a, [['SUM','Sum','functions'],['AVERAGE','Average','percent'],['COUNT','Count Numbers','tag'],['MAX','Max','arrow_upward'],['MIN','Min','arrow_downward']].map(([f, n, i]) => ({ label:n, icon:i, on:() => X.autoFn(f) })).concat(['-', { label:'More Functions…', icon:'function', on:() => X.insertFunction() }]));
const fillDir = d => { const g = X.normSel(); const s = sh();
  if (d === 'down') { if (g.r1 === g.r2) { if (g.r1 === 0) return; X.fill({ ...g, r1:g.r1 - 1, r2:g.r1 - 1 }, { ...g, r1:g.r1 - 1 }); return; } X.fill({ ...g, r2:g.r1 }, g); }
  else if (d === 'right') { if (g.c1 === g.c2) { if (g.c1 === 0) return; X.fill({ ...g, c1:g.c1 - 1, c2:g.c1 - 1 }, { ...g, c1:g.c1 - 1 }); return; } X.fill({ ...g, c2:g.c1 }, g); }
  else if (d === 'up') X.fill({ ...g, r1:g.r2 }, g); else X.fill({ ...g, c1:g.c2 }, g); void s; };
A.fillDown = () => fillDir('down'); A.fillRight = () => fillDir('right');
P.fillMenu = a => ONE.menuAt(a, [{ label:'Down', icon:'south', kbd:'Ctrl+D', on:() => fillDir('down') }, { label:'Right', icon:'east', kbd:'Ctrl+R', on:() => fillDir('right') }, { label:'Up', icon:'north', on:() => fillDir('up') }, { label:'Left', icon:'west', on:() => fillDir('left') }, '-', { label:'Series…', icon:'linear_scale', on:X.seriesDialog }, '-', { label:'Smart Fill', sub:'Continue the number pattern next to your labels', icon:'auto_awesome', kbd:'Ctrl+Enter', on:() => X.act.smartFill() }, { label:'Smart Fill suggestions', checked:!X.smartFillOn || X.smartFillOn(), on:() => X.act.toggleSmartFill() }]);
X.seriesDialog = () => {
  const start = ONE.input({ type:'number', value:typeof X.value(X.sel.ar, X.sel.ac) === 'number' ? X.value(X.sel.ar, X.sel.ac) : 1 }), step = ONE.input({ type:'number', value:1 }), stop = ONE.input({ type:'number', value:10 }), dir = ONE.select([['c','Columns (down)'],['r','Rows (across)']], 'c'), kind = ONE.select([['linear','Linear'],['growth','Growth']], 'linear');
  ONE.modal({ title:'Series', body:el('div', { class:'dlg-col' }, el('div', { class:'grid2' }, ONE.field('Series in', dir), ONE.field('Type', kind), ONE.field('Start value', start), ONE.field('Step value', step), ONE.field('Stop value', stop))),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { let v = +start.value; const st = +step.value || 1, sp = +stop.value; const r0 = X.sel.ar, c0 = X.sel.ac; X.mutate(() => { for (let i = 0; i < 10000; i++) { if (st > 0 ? v > sp : v < sp) break; X.setRaw(sh(), r0 + (dir.value === 'c' ? i : 0), c0 + (dir.value === 'r' ? i : 0), String(+v.toFixed(10))); v = kind.value === 'linear' ? v + st : v * st; } }); } }] });
};

/* ---------- sort & filter ---------- */
const guessHeader = g => { if (g.r2 <= g.r1) return false; const s = sh(); let text = 0, n = 0; for (let c = g.c1; c <= g.c2; c++) { const v = X.value(g.r1, c), w = X.value(g.r1 + 1, c); if (typeof v === 'string') text++; if (typeof v === 'string' && typeof w === 'number') n++; } return text === g.c2 - g.c1 + 1 && (n > 0 || X.styleOf(s, g.r1, g.c1).bold || !!s.tables.find(t => t.r1 === g.r1)); };
X.sortRange = (g, keys, header) => X.mutate(() => {
  const s = sh(), r0 = header ? g.r1 + 1 : g.r1, rows = [];
  for (let r = r0; r <= g.r2; r++) { const cells = {}; for (let c = g.c1; c <= g.c2; c++) cells[c] = s.cells[r + ',' + c]; rows.push({ r, cells, vals:keys.map(k => X.value(r, k.c)) }); }
  rows.sort((a, b) => { for (let i = 0; i < keys.length; i++) { const x = a.vals[i], y = b.vals[i]; const ex = x == null || x === '', ey = y == null || y === ''; if (ex !== ey) return ex ? 1 : -1; const c = X.cmp(x, y); if (c) return keys[i].desc ? -c : c; } return a.r - b.r; });
  rows.forEach((row, i) => { const tr = r0 + i; for (let c = g.c1; c <= g.c2; c++) { const k = row.cells[c]; if (!k) { delete s.cells[tr + ',' + c]; continue; } const n = JSON.parse(JSON.stringify(k)); if (typeof n.v === 'string' && n.v[0] === '=') n.v = X.shiftFormula(n.v, tr - row.r, 0); s.cells[tr + ',' + c] = n; } });
});
X.quickSort = desc => { let g = X.normSel(); const single = g.r1 === g.r2 && g.c1 === g.c2; if (single || g.c1 === g.c2 && g.r1 === g.r2) g = X.region(); if (X.isFullCols(g)) g = { ...g, r2:X.usedRows(sh()) - 1 };
  const header = guessHeader(g); X.sortRange(g, [{ c:ONE.clamp(X.sel.ac, g.c1, g.c2), desc }], header); ONE.toast(`Sorted ${X.colName(ONE.clamp(X.sel.ac, g.c1, g.c2))} ${desc ? 'Z → A' : 'A → Z'}${header ? ' (kept the header row)' : ''}.`); };
A.sortAZ = () => X.quickSort(false); A.sortZA = () => X.quickSort(true);
A.customSort = () => {
  let g = X.normSel(); if (g.r1 === g.r2) g = X.region(); const hdr = ONE.check('My data has headers', guessHeader(g));
  const cols = () => range(g.c1, g.c2).map(c => [c, hdr.input.checked ? `${X.colName(c)}: ${X.displayOf(sh(), g.r1, c) || '(blank)'}` : `Column ${X.colName(c)}`]);
  const levels = el('div', { class:'dlg-col' });
  const addLevel = () => { if (levels.children.length >= 3) return; const cs = ONE.select(cols(), ONE.clamp(X.sel.ac, g.c1, g.c2)), ord = ONE.select([['a','A to Z / Smallest to Largest'],['d','Z to A / Largest to Smallest']], 'a'); levels.append(el('div', { class:'grid2' }, ONE.field(levels.children.length ? 'Then by' : 'Sort by', cs), ONE.field('Order', ord))); };
  addLevel();
  ONE.modal({ title:'Sort', width:560, body:el('div', { class:'dlg-col' }, el('p', { text:`Range ${X.rangeStr(g)}` }), levels, hdr.wrap), actions:[{ label:'Add Level', kind:'text', on:() => { addLevel(); return false; } }, { label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const keys = [...levels.children].map(row => { const [s1, s2] = row.querySelectorAll('select'); return { c:+s1.value, desc:s2.value === 'd' }; }); X.sortRange(g, keys, hdr.input.checked); } }] });
};
A.filter = () => {
  const s = sh(); if (s.filter) { X.mutate(() => { s.filter = null; }); return ONE.toast('Filter removed.'); }
  let g = X.normSel(); if (g.r1 === g.r2) g = X.region(); X.mutate(() => { s.filter = { r:g.r1, r2:g.r2, c1:g.c1, c2:g.c2, crit:{}, hidden:{} }; }); ONE.toast('Filter on. Use the buttons in the header row.');
};
X.applyFilter = () => { const f = sh().filter; if (!f) return; f.hidden = {}; const last = Math.max(f.r2 ?? f.r, X.usedRows(sh()) - 1); f.r2 = last;
  for (let r = f.r + 1; r <= last; r++) for (const c in f.crit) { const allowed = f.crit[c]; if (!allowed) continue; const t = X.displayOf(sh(), r, +c); if (!allowed.includes(t)) { f.hidden[r] = 1; break; } } };
A.clearFilter = () => { const f = sh().filter; if (!f) return; X.mutate(() => { f.crit = {}; f.hidden = {}; }); };
A.reapply = () => X.mutate(X.applyFilter);
X.openFilterMenu = (c, at) => {
  const f = sh().filter, last = Math.max(f.r2 ?? f.r, X.usedRows(sh()) - 1);
  const vals = [...new Set(range(f.r + 1, last).map(r => X.displayOf(sh(), r, c)))].sort((a, b) => a.localeCompare(b, undefined, { numeric:true }));
  const sel = new Set(f.crit[c] || vals);
  const list = el('div', { class:'fvals' }), search = ONE.input({ placeholder:'Search', style:{ height:'36px' } });
  const all = ONE.check('(Select All)', sel.size === vals.length);
  const render = () => { list.innerHTML = ''; list.append(all.wrap); vals.filter(v => v.toLowerCase().includes(search.value.toLowerCase())).forEach(v => { const ch = ONE.check(v === '' ? '(Blanks)' : v, sel.has(v)); ch.input.onchange = () => { ch.input.checked ? sel.add(v) : sel.delete(v); all.input.checked = sel.size === vals.length; }; list.append(ch.wrap); }); };
  all.input.onchange = () => { if (all.input.checked) vals.forEach(v => sel.add(v)); else sel.clear(); render(); };
  search.oninput = render; render();
  const box = el('div', { class:'filterpop' },
    ONE.menu([{ label:'Sort A to Z', icon:'arrow_upward', on:() => X.sortRange({ r1:f.r, r2:last, c1:f.c1, c2:f.c2 }, [{ c }], true) }, { label:'Sort Z to A', icon:'arrow_downward', on:() => X.sortRange({ r1:f.r, r2:last, c1:f.c1, c2:f.c2 }, [{ c, desc:true }], true) }, '-',
      { label:`Clear Filter From “${X.displayOf(sh(), f.r, c) || X.colName(c)}”`, icon:'filter_alt_off', disabled:!f.crit[c], on:() => { X.mutate(() => { delete f.crit[c]; X.applyFilter(); }); } }]),
    search, list, el('div', { class:'row', style:{ justifyContent:'flex-end', gap:'8px', padding:'8px' } }, el('button', { class:'btn text', text:'Cancel', onclick:() => ONE.pop.close() }), el('button', { class:'btn filled', text:'OK', onclick:() => { ONE.pop.close(); X.mutate(() => { f.crit[c] = sel.size === vals.length ? null : [...sel]; if (!f.crit[c]) delete f.crit[c]; X.applyFilter(); }); } })));
  ONE.pop.open(at, box, { noFocus:true });
};
A.removeDup = () => {
  let g = X.normSel(); if (g.r1 === g.r2) g = X.region(); const hdr = guessHeader(g);
  const cols = range(g.c1, g.c2).map(c => ONE.check(hdr ? (X.displayOf(sh(), g.r1, c) || X.colName(c)) : 'Column ' + X.colName(c), true)); const h = ONE.check('My data has headers', hdr);
  ONE.modal({ title:'Remove Duplicates', body:el('div', { class:'dlg-col' }, el('p', { text:'Pick the columns that must all match for a row to count as a duplicate.' }), ...cols.map(x => x.wrap), h.wrap), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => {
    const use = range(g.c1, g.c2).filter((c, i) => cols[i].input.checked); const s = sh(), r0 = h.input.checked ? g.r1 + 1 : g.r1; const seen = new Set(), keep = [];
    for (let r = r0; r <= g.r2; r++) { const k = use.map(c => String(X.value(r, c) ?? '').toLowerCase()).join('\u0001'); if (!seen.has(k)) { seen.add(k); keep.push(r); } }
    const removed = g.r2 - r0 + 1 - keep.length;
    X.mutate(() => { const snapRows = keep.map(r => range(g.c1, g.c2).map(c => s.cells[r + ',' + c])); for (let r = r0; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) delete s.cells[r + ',' + c]; snapRows.forEach((row, i) => row.forEach((k, j) => { if (k) s.cells[(r0 + i) + ',' + (g.c1 + j)] = k; })); });
    ONE.toast(removed ? `${removed} duplicate row${removed > 1 ? 's' : ''} removed; ${keep.length} unique rows remain.` : 'No duplicates found.'); } }] });
};
A.textToCols = () => {
  const g = X.normSel(); if (g.c1 !== g.c2) return ONE.toast('Select one column of text to split.');
  const d = ONE.select([[',','Comma'],['\t','Tab'],[';','Semicolon'],[' ','Space'],['|','Pipe'],['-','Dash']], ',');
  ONE.modal({ title:'Convert Text to Columns', body:el('div', { class:'dlg-col' }, el('p', { text:`Splits ${X.rangeStr(g)} into the columns to the right.` }), ONE.field('Delimiter', d)), actions:[{ label:'Cancel' }, { label:'Finish', kind:'filled', on:() => X.mutate(() => { const R2 = X.isFullCols(g) ? X.usedRows(sh()) - 1 : g.r2; for (let r = g.r1; r <= R2; r++) { const raw = X.raw(sh(), r, g.c1); if (!raw || raw[0] === '=') continue; raw.split(d.value).forEach((p, i) => X.setRaw(sh(), r, g.c1 + i, p.trim())); } }) }] });
};
/* data validation */
X.listValues = vk => { if (/^=/.test(vk.src || '')) { const v = X.evalFormula(vk.src, { wb:X.wb, sheet:sh(), r:0, c:0 }); return X.isRng(v) ? v.vals.flat().filter(x => x != null && x !== '').map(String) : [String(v)]; } return String(vk.src || '').split(',').map(s => s.trim()).filter(Boolean); };
X.validate = (vk, raw) => { if (vk.type === 'list') return X.listValues(vk).some(v => v.toLowerCase() === raw.trim().toLowerCase()); const n = X.parseInput(raw).v; if (typeof n !== 'number') return false; if (vk.type === 'whole' && !Number.isInteger(n)) return false; return n >= vk.a && n <= vk.b; };
A.validation = () => {
  const k0 = sh().valid[X.sel.ar + ',' + X.sel.ac] || { type:'list', src:'', a:0, b:100 };
  const type = ONE.select([['any','Any value'],['list','List'],['whole','Whole number'],['decimal','Decimal']], k0.type), src = ONE.input({ value:k0.src || '', placeholder:'Yes, No, Maybe  or  =$A$1:$A$5' }), a = ONE.input({ type:'number', value:k0.a }), b = ONE.input({ type:'number', value:k0.b }), msg = ONE.input({ value:k0.msg || '', placeholder:'Optional error message' });
  const upd = () => { src.closest('.field').hidden = type.value !== 'list'; a.closest('.grid2').hidden = !['whole','decimal'].includes(type.value); };
  const body = el('div', { class:'dlg-col' }, ONE.field('Allow', type), ONE.field('Source', src), el('div', { class:'grid2' }, ONE.field('Minimum', a), ONE.field('Maximum', b)), ONE.field('Error alert', msg));
  type.onchange = upd; setTimeout(upd);
  ONE.modal({ title:'Data Validation', body, actions:[{ label:'Clear All', kind:'text', on:() => X.mutate(() => X.forSel((r, c) => delete sh().valid[r + ',' + c])) }, { label:'Cancel' }, { label:'OK', kind:'filled', on:() => X.mutate(() => X.forSel((r, c) => { if (type.value === 'any') delete sh().valid[r + ',' + c]; else sh().valid[r + ',' + c] = { type:type.value, src:src.value.trim(), a:+a.value, b:+b.value, msg:msg.value.trim() }; })) }] });
};
X.openValidList = () => { const vk = sh().valid[X.sel.ar + ',' + X.sel.ac]; if (!vk || vk.type !== 'list') return; const V = X.view(), A0 = X.cellRect(X.sel.ar, X.sel.ac, V), r = $('#gscroll').getBoundingClientRect();
  ONE.menuAt({ x:r.left + A0.x * V.z, y:r.top + (A0.y + A0.h) * V.z + 2 }, X.listValues(vk).map(v => ({ label:v, checked:X.raw(sh(), X.sel.ar, X.sel.ac) === v, on:() => X.commitValue(X.sel.ar, X.sel.ac, v) }))); };
/* goal seek */
A.goalSeek = () => {
  const set = ONE.input({ value:X.addr(X.sel.ar, X.sel.ac) }), to = ONE.input({ type:'number' }), by = ONE.input({ placeholder:'e.g. B3' });
  ONE.modal({ title:'Goal Seek', body:el('div', { class:'dlg-col' }, ONE.field('Set cell (a formula)', set), ONE.field('To value', to), ONE.field('By changing cell', by)), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => {
    const t = X.parseAddr(set.value), ch = X.parseAddr(by.value), target = parseFloat(to.value); if (!t || !ch || isNaN(target)) { ONE.toast('Fill in all three boxes with cell references and a number.'); return false; }
    const s = sh(), orig = X.raw(s, ch.r, ch.c); const f = x => { X.setRaw(s, ch.r, ch.c, String(x)); X.invalidate(X.wb); const v = X.valueAt(X.wb, s, t.r, t.c); return typeof v === 'number' ? v - target : NaN; };
    let x0 = parseFloat(orig) || 0, x1 = x0 ? x0 * 1.1 : 1, f0 = f(x0), f1 = f(x1), ok = false;
    for (let i = 0; i < 100 && isFinite(f1); i++) { if (Math.abs(f1) < 1e-7) { ok = true; break; } const x2 = x1 - f1 * (x1 - x0) / (f1 - f0 || 1e-12); x0 = x1; f0 = f1; x1 = x2; f1 = f(x1); }
    X.setRaw(s, ch.r, ch.c, orig); X.invalidate(X.wb);
    if (ok) { X.commitValue(ch.r, ch.c, String(+x1.toPrecision(12))); ONE.toast(`Found a solution: ${X.addr(ch.r, ch.c)} = ${+x1.toPrecision(8)}.`); } else ONE.toast('Goal Seek couldn’t find a solution.'); } }] });
};

/* ---------- functions & names ---------- */
X.insertFunction = (pre) => {
  const q = ONE.input({ placeholder:'Search for a function', value:pre || '' }), cat = ONE.select([['all','All'], ...Object.keys(X.FN_INFO).map(k => [k, k])], 'all');
  const list = el('div', { class:'fnlist' }), help = el('div', { class:'fnhelp' }); let pick = 'SUM';
  const render = () => { list.innerHTML = ''; const src = cat.value === 'all' ? X.FN_LIST : X.FN_INFO[cat.value]; src.filter(n => n.includes(q.value.toUpperCase().trim())).slice(0, 200).forEach((n, i) => { const b = el('button', { class:'menu-item' + (n === pick ? ' checked' : ''), text:n, onclick:() => { pick = n; render(); } }); list.append(b); }); const h = X.fnHelp(pick); help.innerHTML = `<b>${esc(h[0])}</b><p>${esc(h[1])}</p>`; };
  q.oninput = () => { const f = X.FN_LIST.find(n => n.startsWith(q.value.toUpperCase().trim())); if (f) pick = f; render(); }; cat.onchange = render; render();
  ONE.modal({ title:'Insert Function', width:560, body:el('div', { class:'dlg-col' }, el('div', { class:'grid2' }, q, cat), el('div', { class:'fnwrap' }, list, help)), actions:[{ label:'Cancel' }, { label:'Insert', kind:'filled', on:() => { const ed = $('#cellEditor'); if (X.editing) { const p = ed.selectionStart; ed.value = ed.value.slice(0, p) + pick + '(' + ed.value.slice(p); ed.dispatchEvent(new Event('input')); ed.focus(); } else X.startEdit('enter', `=${pick}(`); } }] });
};
P.fnCat = (a, catName) => ONE.menuAt(a, X.FN_INFO[catName].map(n => ({ label:n, sub:X.fnHelp(n)[1], on:() => { if (X.editing) { const ed = $('#cellEditor'), p = ed.selectionStart; ed.value = ed.value.slice(0, p) + n + '(' + ed.value.slice(p); ed.dispatchEvent(new Event('input')); ed.focus(); } else X.startEdit('enter', `=${n}(`); } })));
['Financial','Logical','Text','Date & Time','Lookup & Reference','Math','Statistical','Information'].forEach(c => { P['fn_' + c.replace(/\W/g, '')] = a => P.fnCat(a, c); });
A.defineName = () => {
  const n = ONE.input({ placeholder:'e.g. TaxRate' }), ref = ONE.input({ value:`${/\s/.test(sh().name) ? `'${sh().name}'` : sh().name}!${X.rangeStr(X.normSel()).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}` });
  ONE.modal({ title:'New Name', body:el('div', { class:'dlg-col' }, ONE.field('Name', n), ONE.field('Refers to', ref)), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const k = n.value.trim().toUpperCase(); if (!/^[A-Z_][\w.]*$/.test(k) || X.parseAddr(k)) { ONE.toast('Names start with a letter, have no spaces, and can’t look like a cell reference.'); return false; } X.wb.names[k] = ref.value.trim().replace(/^=/, ''); X.changed(); ONE.toast(`Name ${k} created. Use it in formulas like =SUM(${k}).`); } }] });
};
A.nameManager = () => {
  const list = el('div', { class:'list' }); const render = () => { list.innerHTML = ''; const e = Object.entries(X.wb.names); if (!e.length) list.append(el('p', { class:'muted', text:'No names defined yet.' }));
    e.forEach(([k, v]) => { const val = X.evalFormula('=' + k, { wb:X.wb, sheet:sh(), r:0, c:0 }); list.append(el('div', { class:'list-item' }, el('span', { class:'grow', html:`<b>${esc(k)}</b><small>${esc(v)} · ${esc(X.isRng(val) ? `${val.vals.length}×${val.vals[0].length} range` : X.format(val))}</small>` }), el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => { delete X.wb.names[k]; X.changed(); render(); } }))); }); };
  render(); ONE.modal({ title:'Name Manager', width:520, body:list, actions:[{ label:'New…', kind:'text', on:() => { A.defineName(); } }, { label:'Close', kind:'filled' }] });
};
P.useName = a => { const e = Object.keys(X.wb.names); if (!e.length) return ONE.toast('No names yet. Use Define Name first.'); ONE.menuAt(a, e.map(k => ({ label:k, on:() => { if (!X.editing) X.startEdit('enter', '=' + k); else { const ed = $('#cellEditor'); const p = ed.selectionStart; ed.value = ed.value.slice(0, p) + k + ed.value.slice(p); ed.dispatchEvent(new Event('input')); } } }))); };
A.showFormulas = () => { X.showFormulas = !X.showFormulas; X.draw(); ONE.ribbon.refresh(); };
A.calcNow = () => { X.changed(false); ONE.toast('Recalculated.'); };
A.errorCheck = () => { const s = sh(), errs = []; for (const k in s.cells) { const [r, c] = k.split(',').map(Number); if (X.isErr(X.valueAt(X.wb, s, r, c))) errs.push([r, c]); } errs.sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (!errs.length) return ONE.toast('No errors found on this sheet.'); const nx = errs.find(([r, c]) => r > X.sel.ar || (r === X.sel.ar && c > X.sel.ac)) || errs[0]; X.select(nx[0], nx[1]); const v = X.valueAt(X.wb, s, nx[0], nx[1]); ONE.toast({ '#DIV/0!':'Division by zero.', '#NAME?':'Unknown function or name.', '#REF!':'Reference to a deleted cell.', '#VALUE!':'Wrong type of value (text where a number is needed?).', '#N/A':'Lookup value not found.', '#CIRC!':'Circular reference: the formula refers to itself.', '#NUM!':'Invalid number.' }[v.err] || v.err); };

/* ---------- notes, links ---------- */
A.note = () => { const k = X.sel.ar + ',' + X.sel.ac, t = el('textarea', { class:'tf', rows:5 }); t.value = sh().notes[k] || '';
  ONE.modal({ title:`Note for ${X.addr(X.sel.ar, X.sel.ac)}`, body:t, actions:[{ label:'Delete', kind:'text', on:() => X.mutate(() => delete sh().notes[k]) }, { label:'Cancel' }, { label:'Save', kind:'filled', on:() => X.mutate(() => { if (t.value.trim()) sh().notes[k] = t.value.trim(); else delete sh().notes[k]; }) }] }); };
A.deleteNote = () => X.mutate(() => X.forSel((r, c) => delete sh().notes[r + ',' + c]));
X.stepNote = d => { const ks = Object.keys(sh().notes).map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (!ks.length) return ONE.toast('No notes on this sheet.'); const cur = [X.sel.ar, X.sel.ac]; let i = ks.findIndex(k => d > 0 ? (k[0] > cur[0] || (k[0] === cur[0] && k[1] > cur[1])) : false); if (d < 0) { i = -1; ks.forEach((k, j) => { if (k[0] < cur[0] || (k[0] === cur[0] && k[1] < cur[1])) i = j; }); if (i < 0) i = ks.length - 1; } else if (i < 0) i = 0; X.select(ks[i][0], ks[i][1]); ONE.toast(sh().notes[ks[i].join(',')]); };
A.showNotes = () => { const ks = Object.entries(sh().notes); if (!ks.length) return ONE.toast('No notes on this sheet.'); let m; const list = el('div', { class:'list' }); ks.forEach(([k, t]) => { const [r, c] = k.split(',').map(Number); list.append(el('button', { class:'list-item', style:{ textAlign:'left' }, html:`<span class="grow"><b>${X.addr(r, c)}</b><small>${esc(t)}</small></span>`, onclick:() => { m.close(); X.select(r, c); } })); }); m = ONE.modal({ title:'Notes', body:list }); };
A.link = () => { const t = ONE.input({ value:X.displayOf(sh(), X.sel.ar, X.sel.ac) }), u = ONE.input({ value:cur().link || '', placeholder:'https://' });
  ONE.modal({ title:'Insert Hyperlink', body:el('div', { class:'dlg-col' }, ONE.field('Text to display', t), ONE.field('Address', u)), actions:[{ label:'Remove Link', kind:'text', on:() => X.styleSel({ link:undefined }) }, { label:'Cancel' }, { label:'OK', kind:'filled', on:() => { let url = u.value.trim(); if (!url) return false; if (/^\s*(javascript|data|vbscript):/i.test(url)) { ONE.toast('That kind of link isn’t allowed.'); return false; } if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url; X.mutate(() => { X.setRaw(sh(), X.sel.ar, X.sel.ac, t.value || url); X.setStyle(sh(), X.sel.ar, X.sel.ac, { link:url }); }); } }] }); };
X.openLink = (r, c) => { const u = X.styleOf(sh(), r, c).link; if (u) el('a', { href:u, target:'_blank', rel:'noopener' }).click(); };

/* ---------- freeze, view ---------- */
P.freeze = a => ONE.menuAt(a, [{ label:'Freeze Panes', sub:'Keep rows above and columns left of the selection visible', icon:'grid_on', on:() => X.mutate(() => { sh().freeze = { r:X.sel.ar, c:X.sel.ac }; }) }, { label:'Freeze Top Row', icon:'table_rows', on:() => X.mutate(() => { sh().freeze = { r:1, c:0 }; }) }, { label:'Freeze First Column', icon:'view_column', on:() => X.mutate(() => { sh().freeze = { r:0, c:1 }; }) }, { label:'Unfreeze Panes', icon:'grid_off', disabled:!sh().freeze.r && !sh().freeze.c, on:() => X.mutate(() => { sh().freeze = { r:0, c:0 }; }) }]);
A.gridlines = () => { sh().grid = !sh().grid; X.changed(); ONE.ribbon.refresh(); };
A.headings = () => { X.showHead = !X.showHead; X.layout(); X.drawNow(); ONE.ribbon.refresh(); };
A.formulaBar = () => { $('#fxbar').hidden = !$('#fxbar').hidden; X.drawNow(); ONE.ribbon.refresh(); };
A.zoomSel = () => { const g = X.normSel(); const w = X.cx(g.c2 + 1) - X.cx(g.c1) + 60, h = X.ry(g.r2 + 1) - X.ry(g.r1) + 40; X.setZoom(Math.min($('#gscroll').clientWidth / w, $('#gscroll').clientHeight / h)); X.scrollTo(g.r1, g.c1); };
P.zoom = a => ONE.menuAt(a, [200, 150, 125, 100, 75, 50, 25].map(z => ({ label:z + '%', checked:Math.round(X.zoom * 100) === z, on:() => X.setZoom(z / 100) })).concat(['-', { label:'Zoom to Selection', icon:'fit_screen', on:A.zoomSel }]));

/* ---------- charts & pictures ---------- */
const PAL = ['#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5','#70AD47','#264478','#9E480E','#636363','#997300'];
X.chartData = ch => {
  const s = X.sheetByName(X.wb, ch.sheet) || sh(); const g = X.parseRange(ch.src); if (!g) return null;
  const V = (r, c) => X.valueAt(X.wb, s, r, c);
  const firstRowText = range(g.c1 + 1, g.c2).some(c => typeof V(g.r1, c) === 'string') || (g.c1 === g.c2 && typeof V(g.r1, g.c1) === 'string');
  const firstColText = range(g.r1 + (firstRowText ? 1 : 0), g.r2).every(r => typeof V(r, g.c1) !== 'number') && g.c2 > g.c1;
  let series = [], cats = [];
  const r0 = g.r1 + (firstRowText ? 1 : 0), c0 = g.c1 + (firstColText ? 1 : 0);
  if (!ch.byRow) { cats = range(r0, g.r2).map(r => firstColText ? X.format(V(r, g.c1), X.styleOf(s, r, g.c1).fmt) : String(r - r0 + 1)); series = range(c0, g.c2).map(c => ({ name:firstRowText ? String(V(g.r1, c) ?? '') : 'Series ' + (c - c0 + 1), vals:range(r0, g.r2).map(r => { const v = V(r, c); return typeof v === 'number' ? v : 0; }) })); }
  else { cats = range(c0, g.c2).map(c => firstRowText ? String(V(g.r1, c) ?? '') : String(c - c0 + 1)); series = range(r0, g.r2).map(r => ({ name:firstColText ? String(V(r, g.c1) ?? '') : 'Series ' + (r - r0 + 1), vals:range(c0, g.c2).map(c => { const v = V(r, c); return typeof v === 'number' ? v : 0; }) })); }
  return { cats, series };
};
const nice = (mx, mn) => { const span = mx - mn || Math.abs(mx) || 1, step0 = span / 5, p = Math.pow(10, Math.floor(Math.log10(step0))), step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= step0); return { lo:Math.floor(mn / step) * step, hi:Math.ceil(mx / step) * step, step }; };
const fmtN = v => Math.abs(v) >= 1e6 ? +(v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? +(v / 1e3).toFixed(1) + 'K' : +v.toFixed(2);
X.chartSVG = (ch, w, h) => {
  const d = X.chartData(ch); if (!d || !d.series.length) return `<svg viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#888" font-size="13">Select data to chart</text></svg>`;
  const pal = ch.palette || PAL, legend = ch.legend !== false && (d.series.length > 1 || ch.type === 'pie' || ch.type === 'doughnut');
  const T = ch.title != null ? ch.title : (d.series.length === 1 ? d.series[0].name : 'Chart Title');
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="Calibri, Carlito, 'Segoe UI', sans-serif" font-size="11"><rect width="${w}" height="${h}" fill="#fff"/>`;
  if (T) s += `<text x="${w / 2}" y="24" text-anchor="middle" font-size="15" fill="#404040">${esc(T)}</text>`;
  const top = T ? 40 : 16, bottom = h - (legend ? 42 : 24);
  if (ch.type === 'pie' || ch.type === 'doughnut') {
    const vals = (d.series[ch.series || 0] || d.series[0]).vals.map(v => Math.max(0, v)), tot = vals.reduce((a, b) => a + b, 0) || 1, cx0 = w / 2, cy0 = (top + bottom) / 2, R = Math.max(10, Math.min(w / 2 - 20, (bottom - top) / 2)); let a0 = -Math.PI / 2;
    vals.forEach((v, i) => { const f = v / tot, a1 = a0 + f * Math.PI * 2; if (f >= .9999) s += `<circle cx="${cx0}" cy="${cy0}" r="${R}" fill="${pal[i % pal.length]}"/>`; else if (f > 0) s += `<path d="M${cx0} ${cy0}L${cx0 + R * Math.cos(a0)} ${cy0 + R * Math.sin(a0)}A${R} ${R} 0 ${f > .5 ? 1 : 0} 1 ${cx0 + R * Math.cos(a1)} ${cy0 + R * Math.sin(a1)}Z" fill="${pal[i % pal.length]}" stroke="#fff" stroke-width="1.5"/>`;
      if (ch.labels !== false && f > .04) { const am = (a0 + a1) / 2, lr = ch.type === 'doughnut' ? R * .78 : R * .62; s += `<text x="${cx0 + lr * Math.cos(am)}" y="${cy0 + lr * Math.sin(am) + 4}" text-anchor="middle" fill="#fff" font-weight="600">${Math.round(f * 100)}%</text>`; } a0 = a1; });
    if (ch.type === 'doughnut') s += `<circle cx="${cx0}" cy="${cy0}" r="${R * .55}" fill="#fff"/>`;
    if (legend) s += legendSVG(d.cats, pal, w, h);
    return s + '</svg>';
  }
  const all = d.series.flatMap(x => x.vals); const stacked = ch.stacked;
  const mx = stacked ? Math.max(0, ...d.cats.map((_, i) => d.series.reduce((a, x) => a + Math.max(0, x.vals[i]), 0))) : Math.max(0, ...all), mn = Math.min(0, ...all);
  const sc = nice(mx, mn);
  if (ch.type === 'bar') {
    const left = 80, right = w - 20, n = d.cats.length, bh = (bottom - top) / n, X0 = v => left + (v - sc.lo) / (sc.hi - sc.lo) * (right - left);
    for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) s += `<line x1="${X0(v)}" x2="${X0(v)}" y1="${top}" y2="${bottom}" stroke="#e6e6e6"/><text x="${X0(v)}" y="${bottom + 14}" text-anchor="middle" fill="#595959">${fmtN(v)}</text>`;
    d.cats.forEach((c, i) => { s += `<text x="${left - 6}" y="${top + bh * i + bh / 2 + 4}" text-anchor="end" fill="#595959">${esc(String(c).slice(0, 14))}</text>`; const k = d.series.length, bw = bh * .7 / (stacked ? 1 : k); let acc = 0;
      d.series.forEach((se, j) => { const v = se.vals[i], x1 = X0(stacked ? acc : 0), x2 = X0((stacked ? acc : 0) + v); s += `<rect x="${Math.min(x1, x2)}" y="${top + bh * i + bh * .15 + (stacked ? 0 : bw * j)}" width="${Math.abs(x2 - x1)}" height="${bw}" fill="${pal[j % pal.length]}"/>`; if (stacked) acc += v; }); });
  } else {
    const left = 52, right = w - 16, n = d.cats.length, bw = (right - left) / Math.max(1, n), Y = v => bottom - (v - sc.lo) / (sc.hi - sc.lo) * (bottom - top);
    for (let v = sc.lo; v <= sc.hi + 1e-9; v += sc.step) s += `<line x1="${left}" x2="${right}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e6e6e6"/><text x="${left - 6}" y="${Y(v) + 4}" text-anchor="end" fill="#595959">${fmtN(v)}</text>`;
    const step = Math.ceil(n / Math.max(1, Math.floor((right - left) / 46)));
    d.cats.forEach((c, i) => { if (i % step === 0) s += `<text x="${left + bw * (i + .5)}" y="${bottom + 15}" text-anchor="middle" fill="#595959">${esc(String(c).slice(0, 12))}</text>`; });
    if (ch.type === 'column') { const k = d.series.length, cw = bw * .72 / (stacked ? 1 : k); d.cats.forEach((_, i) => { let acc = 0; d.series.forEach((se, j) => { const v = se.vals[i], y1 = Y(stacked ? acc : 0), y2 = Y((stacked ? acc : 0) + v); s += `<rect x="${left + bw * i + bw * .14 + (stacked ? 0 : cw * j)}" y="${Math.min(y1, y2)}" width="${cw}" height="${Math.abs(y2 - y1)}" fill="${pal[j % pal.length]}" rx="1.5"/>`; if (ch.labels && !stacked) s += `<text x="${left + bw * i + bw * .14 + cw * j + cw / 2}" y="${Math.min(y1, y2) - 4}" text-anchor="middle" fill="#404040" font-size="10">${fmtN(v)}</text>`; if (stacked) acc += v; }); }); }
    else if (ch.type === 'scatter') { const xs = d.cats.map(Number).filter(isFinite); const xr = nice(Math.max(...xs), Math.min(...xs)); const Xs = v => left + (v - xr.lo) / (xr.hi - xr.lo || 1) * (right - left);
      d.series.forEach((se, j) => se.vals.forEach((v, i) => { const xv = +d.cats[i]; if (isFinite(xv)) s += `<circle cx="${Xs(xv)}" cy="${Y(v)}" r="4" fill="${pal[j % pal.length]}" opacity=".85"/>`; })); }
    else { d.series.forEach((se, j) => { const pts = se.vals.map((v, i) => [left + bw * (i + .5), Y(v)]); if (ch.type === 'area') s += `<path d="M${pts[0][0]} ${Y(Math.max(0, sc.lo))} ${pts.map(p => 'L' + p.join(' ')).join(' ')} L${pts[pts.length - 1][0]} ${Y(Math.max(0, sc.lo))}Z" fill="${pal[j % pal.length]}" opacity=".55"/>`;
      s += `<polyline fill="none" stroke="${pal[j % pal.length]}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/>`; if (ch.type === 'line' && pts.length < 30) s += pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="${pal[j % pal.length]}" stroke-width="2"/>`).join(''); }); }
    s += `<line x1="${left}" x2="${right}" y1="${Y(Math.max(0, sc.lo))}" y2="${Y(Math.max(0, sc.lo))}" stroke="#bfbfbf"/>`;
  }
  if (legend) s += legendSVG(d.series.map(x => x.name), pal, w, h);
  return s + '</svg>';
};
const legendSVG = (names, pal, w, h) => { const items = names.slice(0, 8), iw = Math.min(120, (w - 20) / items.length); let x = (w - iw * items.length) / 2, o = ''; items.forEach((n, i) => { o += `<rect x="${x + 4}" y="${h - 22}" width="10" height="10" rx="2" fill="${pal[i % pal.length]}"/><text x="${x + 18}" y="${h - 13}" fill="#595959">${esc(String(n).slice(0, 16))}</text>`; x += iw; }); return o; };
const layer = $('#charts');
X.selChart = null;
X.insertChart = type => {
  let g = X.normSel(); if (g.r1 === g.r2 && g.c1 === g.c2) g = X.region(); if (g.r1 === g.r2 && g.c1 === g.c2) return ONE.toast('Select the data you want to chart first.');
  if (X.isFullCols(g)) g = { ...g, r2:X.usedRows(sh()) - 1 };
  const V = X.view(), x = X.cx(g.c2 + 1) + 24, y = X.ry(g.r1);
  const ch = { id:ONE.uid(), type, src:X.rangeStr(g), sheet:sh().name, x, y, w:480, h:290, title:null, legend:true, labels:type === 'pie' || type === 'doughnut' };
  X.mutate(() => sh().charts.push(ch)); X.selChart = ch.id; X.renderCharts(); ONE.ribbon.setContext('chart', true); ONE.ribbon.switchTab('chartdesign'); void V;
};
P.charts = a => ONE.menuAt(a, [['column','Clustered Column','bar_chart'],['stackcol','Stacked Column','stacked_bar_chart'],['bar','Clustered Bar','align_horizontal_left'],['line','Line','show_chart'],['area','Area','area_chart'],['pie','Pie','pie_chart'],['doughnut','Doughnut','donut_large'],['scatter','Scatter','scatter_plot']].map(([k, n, i]) => ({ label:n, icon:i, on:() => { X.insertChart(k === 'stackcol' ? 'column' : k); if (k === 'stackcol') { const c = X.chartById(X.selChart); c.stacked = true; X.renderCharts(); } } })));
X.chartById = id => { for (const s of X.wb.sheets) { const c = s.charts.find(x => x.id === id); if (c) return c; } return null; };
X.renderCharts = () => {
  const s = sh(), V = X.view(), z = V.z, have = new Map($$('.chartobj', layer).map(n => [n.dataset.id, n]));
  s.charts.forEach(ch => {
    let n = have.get(ch.id);
    if (!n) { n = el('div', { class:'chartobj', 'data-id':ch.id, tabindex:0 }, el('div', { class:'cbody' }), el('i', { class:'rsz' })); layer.append(n); wireChart(n); n.classList.add('new'); }
    have.delete(ch.id);
    const sig = ch.img ? 'img' + ch.w + ch.h : JSON.stringify([ch, X.chartData(ch)]);
    if (n._sig !== sig) { n._sig = sig; n.querySelector('.cbody').innerHTML = ch.img ? `<img alt="${esc(ch.alt || '')}" src="${ch.img}">` : X.chartSVG(ch, ch.w, ch.h); }
    Object.assign(n.style, { left:(V.hw + ch.x - V.sx) * z + 'px', top:(V.hh + ch.y - V.sy) * z + 'px', width:ch.w * z + 'px', height:ch.h * z + 'px' });
    n.classList.toggle('sel', X.selChart === ch.id);
  });
  have.forEach(n => n.remove());
  ONE.ribbon.setContext('chart', !!(X.selChart && s.charts.find(c => c.id === X.selChart && !c.img)));
  ONE.ribbon.setContext('pic', !!(X.selChart && s.charts.find(c => c.id === X.selChart && c.img)));
};
function wireChart(n){
  n.addEventListener('pointerdown', e => {
    e.stopPropagation(); const ch = X.chartById(n.dataset.id); if (!ch) return; X.selChart = ch.id; X.renderCharts(); if (!ch.img) { if (ONE.ribbon.current !== 'chartdesign') ONE.ribbon.switchTab('chartdesign'); } else ONE.ribbon.switchTab('picformat');
    const rs = e.target.classList.contains('rsz'), sx = e.clientX, sy = e.clientY, o = { ...ch }; n.setPointerCapture(e.pointerId); n.focus({ preventScroll:true });
    const mv = ev => { const dx = (ev.clientX - sx) / X.zoom, dy = (ev.clientY - sy) / X.zoom; if (rs) { ch.w = Math.max(160, o.w + dx); ch.h = Math.max(110, ch.img && ev.shiftKey === false ? o.h * (ch.w / o.w) : o.h + dy); } else { ch.x = Math.max(0, o.x + dx); ch.y = Math.max(0, o.y + dy); } X.renderCharts(); };
    const up = () => { n.removeEventListener('pointermove', mv); n.removeEventListener('pointerup', up); if (ch.x !== o.x || ch.y !== o.y || ch.w !== o.w || ch.h !== o.h) X.changed(); };
    n.addEventListener('pointermove', mv); n.addEventListener('pointerup', up);
  });
  n.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); A.chartDelete(); } if (e.key === 'Escape') { X.selChart = null; X.renderCharts(); $('#kb').focus(); } });
  n.addEventListener('dblclick', () => { const ch = X.chartById(n.dataset.id); if (ch && !ch.img) A.chartTitle(); });
}
$('#gscroll').addEventListener('pointerdown', () => { if (X.selChart) { X.selChart = null; X.renderCharts(); } }, true);
X.hooks.push(() => X.renderCharts());
const C = () => X.chartById(X.selChart);
P.chartType = a => ONE.menuAt(a, [['column','Column','bar_chart'],['bar','Bar','align_horizontal_left'],['line','Line','show_chart'],['area','Area','area_chart'],['pie','Pie','pie_chart'],['doughnut','Doughnut','donut_large'],['scatter','Scatter','scatter_plot']].map(([k, n, i]) => ({ label:n, icon:i, checked:C() && C().type === k, on:() => { X.mutate(() => { C().type = k; }); } })));
A.chartTitle = () => { const ch = C(); if (!ch) return; const i = ONE.input({ value:ch.title ?? (X.chartData(ch).series.length === 1 ? X.chartData(ch).series[0].name : 'Chart Title') }); ONE.modal({ title:'Chart Title', body:ONE.field('Title (leave empty for none)', i), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => X.mutate(() => { ch.title = i.value; }) }] }); };
A.chartLegend = () => { const ch = C(); if (ch) X.mutate(() => { ch.legend = ch.legend === false; }); };
A.chartLabels = () => { const ch = C(); if (ch) X.mutate(() => { ch.labels = !ch.labels; }); };
A.chartStack = () => { const ch = C(); if (ch) X.mutate(() => { ch.stacked = !ch.stacked; }); };
A.chartSwitch = () => { const ch = C(); if (ch) X.mutate(() => { ch.byRow = !ch.byRow; }); };
A.chartData = () => { const ch = C(); if (!ch) return; const i = ONE.input({ value:ch.src }); ONE.modal({ title:'Select Data Source', body:ONE.field('Chart data range', i, 'e.g. A1:D7'), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { if (!X.parseRange(i.value)) { ONE.toast('That isn’t a valid range.'); return false; } X.mutate(() => { ch.src = i.value.toUpperCase(); }); } }] }); };
P.chartColors = a => ONE.menuAt(a, [['Colorful', PAL], ['Blue', ['#1F4E79','#2E75B6','#9DC3E6','#BDD7EE','#DEEBF7']], ['Green', ['#375623','#548235','#A9D18E','#C5E0B4','#E2F0D9']], ['Orange', ['#843C0C','#C55A11','#F4B183','#F8CBAD','#FBE5D6']], ['Monochrome', ['#262626','#595959','#7F7F7F','#A6A6A6','#D9D9D9']]].map(([n, p]) => ({ html:`<span style="display:flex;gap:3px;align-items:center">${p.slice(0, 5).map(c => `<i style="display:block;width:14px;height:14px;border-radius:4px;background:${c}"></i>`).join('')}<span style="margin-left:8px">${n}</span></span>`, on:() => X.mutate(() => { C().palette = p; }) })));
A.chartDelete = () => { const s = sh(); X.mutate(() => { s.charts = s.charts.filter(c => c.id !== X.selChart); }); X.selChart = null; X.renderCharts(); $('#kb').focus(); };
A.picture = () => { const i = el('input', { type:'file', accept:'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const w = Math.min(400, im.width), h = im.height * w / im.width; const ch = { id:ONE.uid(), img:r.result, x:X.cx(X.sel.ac), y:X.ry(X.sel.ar), w, h, alt:f.name }; X.mutate(() => sh().charts.push(ch)); X.selChart = ch.id; X.renderCharts(); }; im.src = r.result; }; r.readAsDataURL(f); }; i.click(); };
A.altText = () => { const ch = C(); if (!ch) return; const t = el('textarea', { class:'tf', rows:3 }); t.value = ch.alt || ''; ONE.modal({ title:'Alt Text', body:t, actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => X.mutate(() => { ch.alt = t.value; }) }] }); };

/* ---------- PivotTable ---------- */
A.pivot = () => {
  let g = X.normSel(); if (g.r1 === g.r2) g = X.region(); if (g.r2 - g.r1 < 1) return ONE.toast('Select a table with a header row and data first.');
  const heads = range(g.c1, g.c2).map(c => [c, X.displayOf(sh(), g.r1, c) || X.colName(c)]);
  const numericCol = heads.find(([c]) => typeof X.value(g.r1 + 1, c) === 'number'), textCol = heads.find(([c]) => typeof X.value(g.r1 + 1, c) === 'string');
  const rows = ONE.select(heads, textCol ? textCol[0] : g.c1), cols = ONE.select([['', '(none)'], ...heads], ''), vals = ONE.select(heads, numericCol ? numericCol[0] : g.c2), agg = ONE.select([['SUM','Sum'],['COUNT','Count'],['AVERAGE','Average'],['MAX','Max'],['MIN','Min']], numericCol ? 'SUM' : 'COUNT');
  ONE.modal({ title:'Create PivotTable', width:520, body:el('div', { class:'dlg-col' }, el('p', { text:`Source: ${X.rangeStr(g)} on ${sh().name}. The summary goes on a new sheet.` }), el('div', { class:'grid2' }, ONE.field('Rows', rows), ONE.field('Columns', cols), ONE.field('Values', vals), ONE.field('Summarize by', agg))), actions:[{ label:'Cancel' }, { label:'Create', kind:'filled', on:() => {
    const src = sh(), rc = +rows.value, cc = cols.value === '' ? null : +cols.value, vc = +vals.value, fn = agg.value;
    const rk = [], ck = [], buckets = new Map();
    for (let r = g.r1 + 1; r <= g.r2; r++) { const a = X.displayOf(src, r, rc) || '(blank)', b = cc == null ? 'Total' : (X.displayOf(src, r, cc) || '(blank)'), v = X.valueAt(X.wb, src, r, vc); if (!rk.includes(a)) rk.push(a); if (!ck.includes(b)) ck.push(b); const k = a + '\u0001' + b; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(v); }
    rk.sort((a, b) => a.localeCompare(b, undefined, { numeric:true })); ck.sort((a, b) => a.localeCompare(b, undefined, { numeric:true }));
    const red = arr => { const n = (arr || []).filter(v => typeof v === 'number'); switch (fn) { case 'COUNT': return (arr || []).filter(v => v != null && v !== '').length; case 'AVERAGE': return n.length ? n.reduce((a, b) => a + b, 0) / n.length : ''; case 'MAX': return n.length ? Math.max(...n) : ''; case 'MIN': return n.length ? Math.min(...n) : ''; } return n.reduce((a, b) => a + b, 0); };
    const name = X.uniqueName('Pivot'), ns = X.addSheet(name); const S = X.sh;
    X.setRaw(S, 0, 0, `${agg.options[agg.selectedIndex].text} of ${heads.find(h => h[0] === vc)[1]}`); X.setStyle(S, 0, 0, { bold:true, size:13 });
    X.setRaw(S, 2, 0, heads.find(h => h[0] === rc)[1]); ck.forEach((c, j) => X.setRaw(S, 2, 1 + j, c)); if (cc != null) X.setRaw(S, 2, 1 + ck.length, 'Grand Total');
    for (let j = 0; j <= ck.length + (cc != null ? 1 : 0); j++) X.setStyle(S, 2, j, { bold:true, fill:'#D9E1F2', border:{ b:'thin' } });
    rk.forEach((a, i) => { X.setRaw(S, 3 + i, 0, a); ck.forEach((b, j) => { const v = red(buckets.get(a + '\u0001' + b)); X.setRaw(S, 3 + i, 1 + j, v === '' ? '' : String(+(+v).toFixed(10))); }); if (cc != null) X.setRaw(S, 3 + i, 1 + ck.length, `=SUM(${X.addr(3 + i, 1)}:${X.addr(3 + i, ck.length)})`); });
    const tr = 3 + rk.length; X.setRaw(S, tr, 0, 'Grand Total'); for (let j = 1; j <= ck.length + (cc != null ? 1 : 0); j++) X.setRaw(S, tr, j, fn === 'AVERAGE' || fn === 'MAX' || fn === 'MIN' ? `=${fn}(${X.addr(3, j)}:${X.addr(tr - 1, j)})` : `=SUM(${X.addr(3, j)}:${X.addr(tr - 1, j)})`);
    for (let j = 0; j <= ck.length + (cc != null ? 1 : 0); j++) X.setStyle(S, tr, j, { bold:true, border:{ t:'thin', b:'double' } });
    S.colW[0] = 150; X.changed(); ONE.toast(`PivotTable created on “${name}”.`); void ns;
  } }] });
};

/* ---------- find / replace / go to ---------- */
X.findDialog = replace => {
  const q = ONE.input({ value:'' }), w = ONE.input(), mc = ONE.check('Match case'), whole = ONE.check('Match entire cell contents'), look = ONE.select([['values','Values'],['formulas','Formulas']], 'values'), scope = ONE.select([['sheet','Sheet'],['book','Workbook']], 'sheet');
  const res = el('div', { class:'list', style:{ maxHeight:'180px', overflow:'auto' } });
  const matches = () => { const out = [], t = mc.input.checked ? q.value : q.value.toLowerCase(); if (!t) return out;
    (scope.value === 'book' ? X.wb.sheets : [sh()]).forEach(s => Object.keys(s.cells).map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([r, c]) => { let v = look.value === 'formulas' ? X.raw(s, r, c) : X.displayOf(s, r, c); if (!mc.input.checked) v = v.toLowerCase(); if (whole.input.checked ? v === t : v.includes(t)) out.push({ s, r, c }); })); return out; };
  const goto = m => { const i = X.wb.sheets.indexOf(m.s); if (i !== X.wb.active) X.switchSheet(i); X.select(m.r, m.c); };
  const body = el('div', { class:'dlg-col' }, ONE.field('Find what', q), replace ? ONE.field('Replace with', w) : null, el('div', { class:'grid2' }, ONE.field('Within', scope), ONE.field('Look in', look)), mc.wrap, whole.wrap, res);
  ONE.modal({ title:replace ? 'Find and Replace' : 'Find', width:520, body, actions:[
    { label:'Find All', on:() => { const ms = matches(); res.innerHTML = ''; if (!ms.length) res.append(el('p', { class:'muted', text:'No matches.' })); ms.slice(0, 300).forEach(m => res.append(el('button', { class:'list-item', style:{ textAlign:'left' }, html:`<span class="grow"><b>${esc(m.s.name)}!${X.addr(m.r, m.c)}</b><small>${esc(X.displayOf(m.s, m.r, m.c))}</small></span>`, onclick:() => goto(m) }))); return false; } },
    { label:'Find Next', kind:'tonal', on:() => { const ms = matches(); if (!ms.length) { ONE.toast('No matches.'); return false; } const i0 = ms.findIndex(m => m.s === sh() && (m.r > X.sel.ar || (m.r === X.sel.ar && m.c > X.sel.ac))); goto(ms[i0 < 0 ? 0 : i0]); return false; } },
    replace ? { label:'Replace All', kind:'filled', on:() => { const ms = matches().filter(m => { const raw = X.raw(m.s, m.r, m.c); return raw[0] !== '=' || look.value === 'formulas'; }); if (!ms.length) { ONE.toast('No matches.'); return false; } const re = new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), mc.input.checked ? 'g' : 'gi'); X.mutate(() => ms.forEach(m => X.setRaw(m.s, m.r, m.c, whole.input.checked ? w.value : X.raw(m.s, m.r, m.c).replace(re, w.value)))); ONE.toast(`Made ${ms.length} replacement${ms.length > 1 ? 's' : ''}.`); } } : { label:'Close', kind:'filled' }] });
};
A.find = () => X.findDialog(false); A.replace = () => X.findDialog(true);
A.goTo = () => { const i = ONE.input({ placeholder:'e.g. B12, A1:D20 or a name' }); const names = Object.keys(X.wb.names); ONE.modal({ title:'Go To', body:el('div', { class:'dlg-col' }, ONE.field('Reference', i), names.length ? el('p', { text:'Names: ' + names.join(', ') }) : null), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const nb = $('#nameBox'); nb.value = i.value; nb.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter' })); } }] }); };
A.stats = () => { let cells = 0, f = 0, ch = 0, n = 0; X.wb.sheets.forEach(s => { cells += Object.values(s.cells).filter(c => c.v !== '' && c.v != null).length; f += Object.values(s.cells).filter(c => typeof c.v === 'string' && c.v[0] === '=').length; ch += s.charts.length; n += Object.keys(s.notes).length; });
  ONE.modal({ title:'Workbook Statistics', icon:'query_stats', body:`<div class="info" style="color:var(--on-surface)"><span>Sheets</span><span>${X.wb.sheets.length}</span><span>Cells with data</span><span>${cells.toLocaleString()}</span><span>Formulas</span><span>${f.toLocaleString()}</span><span>Charts & pictures</span><span>${ch}</span><span>Notes</span><span>${n}</span><span>Defined names</span><span>${Object.keys(X.wb.names).length}</span><span>Current sheet end</span><span>${X.addr(Math.max(0, X.usedRows(sh()) - 1), Math.max(0, X.usedCols(sh()) - 1))}</span></div>` }); };
})();
