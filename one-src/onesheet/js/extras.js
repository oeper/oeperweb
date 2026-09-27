/* oneSheet — extras: Quick Analysis, sparklines, checkboxes, trace precedents/dependents, file saving, printing */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const A = X.act, P = X.pops;
const sh = () => X.sh;

/* ---------- checkboxes ---------- */
A.checkbox = () => X.mutate(() => X.forSel((r, c) => { X.setStyle(sh(), r, c, { checkbox:true, align:'center' }); const v = X.raw(sh(), r, c).toUpperCase(); if (v !== 'TRUE' && v !== 'FALSE') X.setRaw(sh(), r, c, 'FALSE'); }));
X.toggleCheck = (r, c) => { const v = X.valueAt(X.wb, sh(), r, c); X.commitValue(r, c, v === true ? 'FALSE' : 'TRUE'); };

/* ---------- sparklines ---------- */
X.drawSpark = (g2, R, sp, sheet) => {
  const g = X.parseRange(sp.src); if (!g) return;
  const vals = []; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { const v = X.valueAt(X.wb, sheet, r, c); vals.push(typeof v === 'number' ? v : null); }
  const nums = vals.filter(v => v != null); if (!nums.length) return;
  const mn = Math.min(...nums, sp.type === 'column' ? 0 : Infinity), mx = Math.max(...nums), pad = 4, w = R.w - pad * 2, h = R.h - pad * 2, n = vals.length;
  const Y = v => R.y + pad + h - (mx === mn ? .5 : (v - mn) / (mx - mn)) * h;
  g2.save(); g2.beginPath(); g2.rect(R.x, R.y, R.w, R.h); g2.clip();
  if (sp.type === 'line') {
    g2.strokeStyle = sp.color || '#2E75B6'; g2.lineWidth = 1.6; g2.lineJoin = 'round'; g2.beginPath(); let first = true;
    vals.forEach((v, i) => { if (v == null) return; const x = R.x + pad + (n === 1 ? w / 2 : i / (n - 1) * w); first ? g2.moveTo(x, Y(v)) : g2.lineTo(x, Y(v)); first = false; }); g2.stroke();
    const hi = vals.indexOf(mx), lo = vals.indexOf(Math.min(...nums));
    [[hi, '#1E7C3A'], [lo, '#C00000']].forEach(([i, col]) => { const x = R.x + pad + (n === 1 ? w / 2 : i / (n - 1) * w); g2.fillStyle = col; g2.beginPath(); g2.arc(x, Y(vals[i]), 2.4, 0, Math.PI * 2); g2.fill(); });
  } else {
    const bw = w / n; vals.forEach((v, i) => { if (v == null) return;
      if (sp.type === 'winloss') { g2.fillStyle = v >= 0 ? (sp.color || '#2E75B6') : '#C00000'; const hh = h / 2 - 1; g2.fillRect(R.x + pad + i * bw + bw * .15, v >= 0 ? R.y + pad : R.y + pad + h / 2 + 1, bw * .7, hh); }
      else { g2.fillStyle = v < 0 ? '#C00000' : (sp.color || '#2E75B6'); const y0 = Y(Math.max(0, mn)), y1 = Y(v); g2.fillRect(R.x + pad + i * bw + bw * .15, Math.min(y0, y1), bw * .7, Math.max(1, Math.abs(y1 - y0))); } });
  }
  g2.restore();
};
A.sparkline = type => {
  const g = X.normSel(), multiRow = g.r2 > g.r1 && g.c2 > g.c1;
  const src = ONE.input({ value:X.rangeStr(g) }), loc = ONE.input({ value:multiRow ? X.rangeStr({ r1:g.r1, c1:g.c2 + 1, r2:g.r2, c2:g.c2 + 1 }) : X.addr(g.r2 + (g.r1 === g.r2 ? 0 : 1), g.c1 === g.c2 ? g.c1 : g.c2 + 1) });
  const kind = ONE.select([['line','Line'],['column','Column'],['winloss','Win/Loss']], type || 'line');
  ONE.modal({ title:'Create Sparklines', icon:'show_chart', body:el('div', { class:'dlg-col' }, ONE.field('Type', kind), ONE.field('Data range', src, 'One row per sparkline, e.g. B2:E7'), ONE.field('Location range', loc, 'One cell per row of data, e.g. F2:F7')),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => {
      const d = X.parseRange(src.value), L = X.parseRange(loc.value); if (!d || !L) { ONE.toast('Enter valid ranges.'); return false; }
      const rows = d.r2 - d.r1 + 1, cells = (L.r2 - L.r1 + 1) * (L.c2 - L.c1 + 1);
      X.mutate(() => { const s = sh(); s.spark = s.spark || {};
        if (cells === 1) s.spark[L.r1 + ',' + L.c1] = { type:kind.value, src:X.rangeStr(d) };
        else for (let i = 0; i < Math.min(rows, cells); i++) { const r = L.r1 === L.r2 ? L.r1 : L.r1 + i, c = L.r1 === L.r2 ? L.c1 + i : L.c1; s.spark[r + ',' + c] = { type:kind.value, src:X.rangeStr({ r1:d.r1 + i, c1:d.c1, r2:d.r1 + i, c2:d.c2 }) }; } });
    } }] });
};
A.clearSpark = () => X.mutate(() => X.forSel((r, c) => { if (sh().spark) delete sh().spark[r + ',' + c]; }));
P.sparkline = a => ONE.menuAt(a, [{ label:'Line', icon:'show_chart', on:() => A.sparkline('line') }, { label:'Column', icon:'bar_chart', on:() => A.sparkline('column') }, { label:'Win/Loss', icon:'align_vertical_center', on:() => A.sparkline('winloss') }, '-', { label:'Clear Sparklines', icon:'format_clear', on:A.clearSpark }]);

/* ---------- trace precedents / dependents ---------- */
X.traces = [];
const refsOf = f => { const out = []; X.tokenize(String(f).slice(1)).forEach(t => { if (t.t !== 'ref') return; const ref = X.parseRef(t.v); if (ref.sheet && ref.sheet.toLowerCase() !== sh().name.toLowerCase()) return; const a = ref.a, b = ref.b || ref.a; if (a.r == null || a.c == null) return; out.push({ r1:Math.min(a.r, b.r), c1:Math.min(a.c, b.c), r2:Math.max(a.r, b.r), c2:Math.max(a.c, b.c) }); }); return out; };
A.tracePrec = () => { const { ar:r, ac:c } = X.sel, raw = X.raw(sh(), r, c); if (raw[0] !== '=') return ONE.toast('The active cell doesn’t contain a formula.'); const refs = refsOf(raw); if (!refs.length) return ONE.toast('This formula doesn’t refer to other cells on this sheet.'); refs.forEach(g => X.traces.push({ g, to:{ r, c } })); X.draw(); };
A.traceDep = () => { const { ar:r, ac:c } = X.sel; let n = 0; for (const k in sh().cells) { const v = sh().cells[k].v; if (typeof v !== 'string' || v[0] !== '=') continue; if (refsOf(v).some(g => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2)) { const [rr, cc] = k.split(',').map(Number); X.traces.push({ g:{ r1:r, c1:c, r2:r, c2:c }, to:{ r:rr, c:cc }, dep:true }); n++; } } if (!n) ONE.toast('No formulas on this sheet refer to the active cell.'); X.draw(); };
A.clearTraces = () => { X.traces = []; X.draw(); };
X.drawTraces = (g2, V) => {
  X.traces.forEach(t => {
    const R = X.rangeRect(V, t.g), T = X.cellRect(t.to.r, t.to.c, V), col = t.dep ? '#C43E1C' : '#2E75B6';
    const sx = R.x + Math.min(R.w, 24) / 2, sy = R.y + Math.min(R.h, 22) / 2, ex = T.x + T.w / 2, ey = T.y + T.h / 2;
    g2.save(); g2.strokeStyle = col; g2.fillStyle = col; g2.lineWidth = 1.6;
    if (t.g.r1 !== t.g.r2 || t.g.c1 !== t.g.c2) { g2.strokeRect(R.x + 1, R.y + 1, R.w - 2, R.h - 2); }
    g2.beginPath(); g2.arc(sx, sy, 3, 0, Math.PI * 2); g2.fill();
    g2.beginPath(); g2.moveTo(sx, sy); g2.lineTo(ex, ey); g2.stroke();
    const a = Math.atan2(ey - sy, ex - sx); g2.beginPath(); g2.moveTo(ex, ey); g2.lineTo(ex - 9 * Math.cos(a - .4), ey - 9 * Math.sin(a - .4)); g2.lineTo(ex - 9 * Math.cos(a + .4), ey - 9 * Math.sin(a + .4)); g2.fill();
    g2.restore();
  });
};

/* ---------- Quick Analysis ---------- */
const qa = el('button', { class:'qa-btn', title:'Quick Analysis (Ctrl+Q)', 'aria-label':'Quick Analysis', html:icon('bolt'), hidden:true });
$('#goverlay').append(qa);
X.placeQA = V => {
  const g = X.normSel(), multi = g.r1 !== g.r2 || g.c1 !== g.c2;
  if (!multi || X.editing || X.isFullCols(g) || X.isFullRows(g)) { qa.hidden = true; return; }
  let nums = 0; X.forSel((r, c) => { if (typeof X.value(r, c) === 'number') nums++; }, g); if (!nums) { qa.hidden = true; return; }
  const R = X.rangeRect(V, g); qa.hidden = false; qa.style.left = (R.x + R.w + 4) * V.z + 'px'; qa.style.top = (R.y + R.h + 4) * V.z + 'px';
};
qa.addEventListener('pointerdown', e => e.stopPropagation());
qa.addEventListener('click', () => A.quickAnalysis(qa));
A.quickAnalysis = anchor => {
  const g = X.normSel(), multiRow = g.r2 > g.r1;
  const tabs = el('div', { class:'seg', style:{ margin:'6px 8px' } }), pane = el('div', { class:'qa-pane' });
  const act = (ic, label, fn) => el('button', { class:'qa-item', html:`${icon(ic)}<span>${esc(label)}</span>`, onclick:() => { ONE.pop.close(); fn(); } });
  const T = {
    Formatting:() => [act('bar_chart', 'Data Bars', () => X.addCF({ type:'bar', color:'#638EC6' })), act('gradient', 'Color Scale', () => X.addCF({ type:'scale', colors:['#F8696B', '#FFEB84', '#63BE7B'] })), act('traffic', 'Icon Set', () => X.addCF({ type:'icons' })), act('trending_up', 'Above Average', () => X.addCF({ type:'above', style:{ fill:'#C6EFCE', color:'#006100' } })), act('vertical_align_top', 'Top 10%', () => { let n = 0; X.forSel(() => n++, g); X.addCF({ type:'top', a:Math.max(1, Math.round(n / 10)), style:{ fill:'#FFEB9C', color:'#9C5700' } }); }), act('format_clear', 'Clear Format', () => X.mutate(() => { sh().cf = sh().cf.filter(r => !(r.g.r2 >= g.r1 && r.g.r1 <= g.r2 && r.g.c2 >= g.c1 && r.g.c1 <= g.c2)); }))],
    Charts:() => [act('bar_chart', 'Column', () => X.insertChart('column')), act('show_chart', 'Line', () => X.insertChart('line')), act('pie_chart', 'Pie', () => X.insertChart('pie')), act('align_horizontal_left', 'Bar', () => X.insertChart('bar')), act('scatter_plot', 'Scatter', () => X.insertChart('scatter'))],
    Totals:() => ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].map(f => act({ SUM:'functions', AVERAGE:'percent', COUNT:'tag', MAX:'arrow_upward', MIN:'arrow_downward' }[f], { SUM:'Sum', AVERAGE:'Average', COUNT:'Count', MAX:'Max', MIN:'Min' }[f], () => X.mutate(() => { if (multiRow) for (let c = g.c1; c <= g.c2; c++) { X.setRaw(sh(), g.r2 + 1, c, `=${f}(${X.colName(c)}${g.r1 + 1}:${X.colName(c)}${g.r2 + 1})`); X.setStyle(sh(), g.r2 + 1, c, { bold:true }); } else X.setRaw(sh(), g.r1, g.c2 + 1, `=${f}(${X.addr(g.r1, g.c1)}:${X.addr(g.r1, g.c2)})`); }))),
    Tables:() => [act('table_view', 'Table', () => X.makeTable('blue')), act('pivot_table_chart', 'PivotTable', A.pivot)],
    Sparklines:() => [act('show_chart', 'Line', () => A.sparkline('line')), act('bar_chart', 'Column', () => A.sparkline('column')), act('align_vertical_center', 'Win/Loss', () => A.sparkline('winloss'))]
  };
  const show = k => { $$('.seg-b', tabs).forEach(b => b.classList.toggle('on', b.textContent === k)); pane.innerHTML = ''; T[k]().forEach(b => pane.append(b)); };
  Object.keys(T).forEach(k => tabs.append(el('button', { class:'seg-b', text:k, onclick:() => show(k) })));
  show('Formatting');
  ONE.pop.open(anchor, el('div', { class:'qa-pop' }, tabs, pane));
};
X.hooks.push(V => { X.placeQA(V); });

/* ---------- saving real files ---------- */
async function loadXL(){ if (window.XLSX) return window.XLSX; await ONE.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); return window.XLSX; }
A.saveXlsx = async () => {
  ONE.toast('Building .xlsx…');
  try {
    const XL = await loadXL(), book = XL.utils.book_new();
    X.wb.sheets.forEach(s => {
      const ws = {}; let maxR = 0, maxC = 0;
      for (const k in s.cells) { const [r, c] = k.split(',').map(Number), cell = s.cells[k]; if (cell.v === '' || cell.v == null) continue; maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
        const raw = String(cell.v), v = X.valueAt(X.wb, s, r, c), fmt = cell.s && cell.s.fmt, a = X.addr(r, c);
        const o = raw[0] === '=' ? { f:raw.slice(1) } : {};
        if (typeof v === 'number') Object.assign(o, { t:'n', v }); else if (typeof v === 'boolean') Object.assign(o, { t:'b', v }); else if (X.isErr(v)) Object.assign(o, { t:'s', v:v.err }); else Object.assign(o, { t:'s', v:v == null ? '' : String(v) });
        if (fmt) o.z = { currency:`"${fmt.sym || '$'}"#,##0${fmt.dec ? '.' + '0'.repeat(fmt.dec) : ''}`, accounting:`_("${fmt.sym || '$'}"* #,##0.00_)`, percent:`0${fmt.dec ? '.' + '0'.repeat(fmt.dec) : ''}%`, number:`${fmt.sep ? '#,##0' : '0'}${fmt.dec ? '.' + '0'.repeat(fmt.dec) : ''}`, date:'m/d/yyyy', time:'h:mm AM/PM', datetime:'m/d/yyyy h:mm' }[fmt.type];
        ws[a] = o; }
      ws['!ref'] = `A1:${X.addr(maxR, maxC)}`;
      ws['!merges'] = s.merges.map(m => ({ s:{ r:m.r1, c:m.c1 }, e:{ r:m.r2, c:m.c2 } }));
      ws['!cols'] = Array.from({ length:maxC + 1 }, (_, c) => ({ wpx:X.colW(s, c) || X.DEF_W }));
      XL.utils.book_append_sheet(book, ws, s.name.slice(0, 31));
    });
    const buf = XL.write(book, { bookType:'xlsx', type:'array' });
    await ONE.download(($('#docTitle').value.trim() || 'Book1') + '.xlsx', new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch (e) { console.error(e); ONE.toast('Couldn’t build the .xlsx file. Check your connection and try again.'); }
};
const usedRows = s => { const out = []; const R = X.usedRows(s), C = X.usedCols(s); for (let r = 0; r < R; r++) { const row = []; for (let c = 0; c < C; c++) row.push(X.displayOf(s, r, c)); out.push(row); } return out; };
A.saveCsv = () => ONE.download(`${$('#docTitle').value.trim() || 'Book1'} - ${sh().name}.csv`, usedRows(sh()).map(r => r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(',')).join('\n'), 'text/csv');
A.printSheet = () => {
  const s = sh(); let g = { r1:0, c1:0, r2:Math.max(0, X.usedRows(s) - 1), c2:Math.max(0, X.usedCols(s) - 1) };
  if (X.wb.print.area && X.wb.print.area.split('!')[0] === s.name) g = X.parseRange(X.wb.print.area.split('!')[1]);
  let h = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.name)}</title><style>@page{size:${X.wb.print.size === 'a4' ? 'A4' : X.wb.print.size === 'legal' ? 'legal' : 'letter'} ${X.wb.print.orient}}body{font:10pt Calibri,Carlito,sans-serif;margin:0}table{border-collapse:collapse}td{padding:2px 6px;white-space:nowrap}${X.wb.print.grid ? 'td{border:1px solid #ccc}' : ''}</style></head><body><table>`;
  for (let r = g.r1; r <= g.r2; r++) { if (!X.rowH(s, r)) continue; h += '<tr>'; for (let c = g.c1; c <= g.c2; c++) { if (!X.colW(s, c)) continue; const st = X.styleOf(s, r, c), v = X.valueAt(X.wb, s, r, c); h += `<td style="${st.bold ? 'font-weight:bold;' : ''}${st.italic ? 'font-style:italic;' : ''}${st.fill ? `background:${st.fill};` : ''}${st.color ? `color:${st.color};` : ''}text-align:${st.align || (typeof v === 'number' ? 'right' : 'left')};-webkit-print-color-adjust:exact;print-color-adjust:exact">${esc(X.displayOf(s, r, c))}</td>`; } h += '</tr>'; }
  h += '</table></body></html>';
  const f = el('iframe', { style:{ position:'fixed', right:0, bottom:0, width:0, height:0, border:0 } }); document.body.append(f);
  f.contentDocument.open(); f.contentDocument.write(h); f.contentDocument.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { ONE.toast('This page isn’t allowed to print here. Save a copy and print it from your computer.'); } setTimeout(() => f.remove(), 2000); }, 200);
};
})();
