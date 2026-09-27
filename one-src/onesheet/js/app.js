/* oneSheet — ribbon, shortcuts, context menu, File backstage, templates, import/export, persistence, boot */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
const A = X.act, P = X.pops, kb = $('#kb');
ONE.boot('os', 'sheet');

X.FONTLIST = [['Calibri','Calibri, Carlito, "Segoe UI", sans-serif'],['Aptos','Aptos, Calibri, Carlito, sans-serif'],['Arial','Arial, Helvetica, sans-serif'],['Cambria','Cambria, Caladea, Georgia, serif'],['Consolas','Consolas, "Courier New", monospace'],['Courier New','"Courier New", monospace'],['Georgia','Georgia, serif'],['Segoe UI','"Segoe UI", system-ui, sans-serif'],['Tahoma','Tahoma, sans-serif'],['Times New Roman','"Times New Roman", serif'],['Trebuchet MS','"Trebuchet MS", sans-serif'],['Verdana','Verdana, sans-serif']];
const fontSel = () => { const s = el('select', { class:'combo fontsel', id:'fontName', 'aria-label':'Font' }); X.FONTLIST.forEach(([n, st]) => s.append(el('option', { value:n, text:n, style:{ fontFamily:st } }))); s.onchange = () => { X.setFont(s.value === 'Calibri' ? 'Calibri' : X.FONTLIST.find(f => f[0] === s.value)[1]); kb.focus(); }; return s; };
const sizeSel = () => { const w = el('span'), i = el('input', { class:'combo sizesel', id:'fontSize', list:'fsizes', value:'11', 'aria-label':'Font size' }), dl = el('datalist', { id:'fsizes' }); [8,9,10,11,12,14,16,18,20,24,28,36,48,72].forEach(s => dl.append(el('option', { value:s }))); i.onchange = () => { const v = parseFloat(i.value); if (v > 0 && v < 410) X.setSize(v); kb.focus(); }; i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); i.onchange(); } }; w.append(i, dl); return w; };
const numFmtSel = () => { const s = el('select', { class:'combo numfmt', id:'numFmt', 'aria-label':'Number format' }); X.NUMFMTS.filter(x => x[0] !== 'longdate').forEach(([k, n]) => s.append(el('option', { value:k, text:n }))); s.onchange = () => { X.setNumFmt(s.value); kb.focus(); }; return s; };

const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Clipboard', items:[['LD','content_paste','Paste','pop:paste'], ['C', [['S','content_cut','Cut','cut',{ kbd:'Ctrl+X' }], ['S','content_copy','Copy','copy',{ kbd:'Ctrl+C' }], ['S','format_paint','Format Painter','painter',{ state:'painter' }]]]] },
    { label:'Font', launch:'formatFont', items:[['C', [
      ['R', [['X', fontSel], ['X', sizeSel], ['I','text_increase','Increase Font Size','grow'], ['I','text_decrease','Decrease Font Size','shrink']]],
      ['R', [['I','format_bold','Bold','bold',{ state:'bold', kbd:'Ctrl+B' }], ['I','format_italic','Italic','italic',{ state:'italic', kbd:'Ctrl+I' }], ['I','format_underlined','Underline','underline',{ state:'underline', kbd:'Ctrl+U' }], ['I','format_strikethrough','Strikethrough','strike',{ state:'strike', kbd:'Ctrl+5' }], ['ID','border_bottom','Borders','pop:borders'], ['SP','format_color_fill','Fill Color','fill','pop:fill',{ bar:'barFill' }], ['SP','format_color_text','Font Color','fore','pop:fore',{ bar:'barFore' }]]]]]] },
    { label:'Alignment', launch:'formatAlign', items:[['C', [
      ['R', [['I','vertical_align_top','Top Align','vTop',{ state:'vTop' }], ['I','vertical_align_center','Middle Align','vMid',{ state:'vMid' }], ['I','vertical_align_bottom','Bottom Align','vBot',{ state:'vBot' }], ['S','wrap_text','Wrap Text','wrap',{ state:'wrap' }]]],
      ['R', [['I','format_align_left','Align Left','alignL',{ state:'alignL' }], ['I','format_align_center','Center','alignC',{ state:'alignC' }], ['I','format_align_right','Align Right','alignR',{ state:'alignR' }], ['I','format_indent_decrease','Decrease Indent','indentDec'], ['I','format_indent_increase','Increase Indent','indentInc'], ['SP','merge_type','Merge & Center','mergeCenter','pop:merge']]]]]] },
    { label:'Number', launch:'formatNumber', items:[['C', [['R', [['X', numFmtSel]]], ['R', [['SP','attach_money','Accounting Number Format','currency','pop:currency'], ['I','percent','Percent Style','percent',{ kbd:'Ctrl+Shift+%' }], ['I','more_horiz','Comma Style','comma'], ['I','decimal_increase','Increase Decimal','decInc'], ['I','decimal_decrease','Decrease Decimal','decDec']]]]]] },
    { label:'Styles', items:[['L','bolt','Quick Analysis','quickAnalysisBtn',{ kbd:'Ctrl+Q' }], ['LD','rule','Conditional Formatting','pop:cf'], ['LD','table_view','Format as Table','pop:asTable',{ kbd:'Ctrl+T' }], ['LD','style','Cell Styles','pop:cellStyles']] },
    { label:'Cells', items:[['LD','add_box','Insert','pop:insert'], ['LD','indeterminate_check_box','Delete','pop:delete'], ['LD','tune','Format','pop:format']] },
    { label:'Editing', items:[['C', [['SP','functions','AutoSum','autoSum','pop:autoSum',{ kbd:'Alt+=' }], ['SD','south','Fill','pop:fillMenu'], ['SD','ink_eraser','Clear','pop:clear']]], ['LD','sort','Sort & Filter','pop:sortFilter'], ['LD','search','Find & Select','pop:findSelect']] }
  ] },
  { id:'insert', label:'Insert', groups:[
    { label:'Tables', items:[['L','pivot_table_chart','PivotTable','pivot'], ['L','table_view','Table','table',{ kbd:'Ctrl+T' }]] },
    { label:'Illustrations', items:[['L','image','Pictures','picture']] },
    { label:'Sparklines', items:[['LD','show_chart','Sparklines','pop:sparkline']] },
    { label:'Controls', items:[['L','check_box','Checkbox','checkbox']] },
    { label:'Charts', items:[['LD','bar_chart','Column','pop:chartCol'], ['LD','show_chart','Line','pop:chartLine'], ['LD','pie_chart','Pie','pop:chartPie'], ['LD','insert_chart','All Charts','pop:charts']] },
    { label:'Links', items:[['L','link','Link','link',{ kbd:'Ctrl+K' }]] },
    { label:'Notes', items:[['L','sticky_note_2','Note','note',{ kbd:'Shift+F2' }]] },
    { label:'Symbols', items:[['LD','emoji_symbols','Symbol','pop:symbol']] }
  ] },
  { id:'pagelayout', label:'Page Layout', groups:[
    { label:'Page Setup', items:[['LD','crop_rotate','Orientation','pop:orient'], ['LD','description','Size','pop:psize'], ['LD','crop_free','Print Area','pop:printArea']] },
    { label:'Sheet Options', items:[['C', [['SW','View Gridlines','gridlines'], ['SW','Print Gridlines','printGrid'], ['SW','View Headings','headings']]]] },
    { label:'Arrange', items:[['L','palette','App Color','seed']] }
  ] },
  { id:'formulas', label:'Formulas', groups:[
    { label:'Function Library', items:[['L','function','Insert Function','insertFunction',{ kbd:'Shift+F3' }], ['LD','functions','AutoSum','pop:autoSum'], ['C', [['SD','payments','Financial','pop:fn_Financial'], ['SD','rule','Logical','pop:fn_Logical'], ['SD','text_fields','Text','pop:fn_Text']]], ['C', [['SD','calendar_month','Date & Time','pop:fn_DateTime'], ['SD','search','Lookup & Reference','pop:fn_LookupReference'], ['SD','calculate','Math & Trig','pop:fn_Math']]], ['C', [['SD','query_stats','Statistical','pop:fn_Statistical'], ['SD','info','Information','pop:fn_Information']]]] },
    { label:'Defined Names', items:[['L','label','Name Manager','nameManager'], ['C', [['S','new_label','Define Name','defineName'], ['SD','input','Use in Formula','pop:useName']]]] },
    { label:'Formula Auditing', items:[['C', [['S','arrow_right_alt','Trace Precedents','tracePrec'], ['S','call_split','Trace Dependents','traceDep'], ['S','close','Remove Arrows','clearTraces']]], ['L','code','Show Formulas','showFormulas',{ state:'showFormulas', kbd:'Ctrl+`' }], ['L','error','Error Checking','errorCheck']] },
    { label:'Calculation', items:[['L','calculate','Calculate Now','calcNow',{ kbd:'F9' }]] }
  ] },
  { id:'data', label:'Data', groups:[
    { label:'Get & Transform', items:[['L','upload_file','From File','openFile'], ['L','refresh','Refresh All','calcNow']] },
    { label:'Sort & Filter', items:[['C', [['I','north','Sort A to Z','sortAZ'], ['I','south','Sort Z to A','sortZA']]], ['L','sort','Sort','customSort'], ['L','filter_alt','Filter','filter',{ state:'filter', kbd:'Ctrl+Shift+L' }], ['C', [['S','filter_alt_off','Clear','clearFilter'], ['S','refresh','Reapply','reapply']]]] },
    { label:'Data Tools', items:[['L','view_week','Text to Columns','textToCols'], ['L','content_copy','Remove Duplicates','removeDup'], ['L','fact_check','Data Validation','validation']] },
    { label:'Forecast', items:[['L','track_changes','Goal Seek','goalSeek']] }
  ] },
  { id:'review', label:'Review', groups:[
    { label:'Proofing', items:[['L','query_stats','Workbook Statistics','stats']] },
    { label:'Notes', items:[['L','sticky_note_2','New Note','note'], ['C', [['S','navigate_before','Previous','prevNote'], ['S','navigate_next','Next','nextNote'], ['S','delete','Delete','deleteNote']]], ['L','notes','Show All Notes','showNotes']] },
    { label:'Protect', items:[['L','lock','Protect Sheet','protect',{ state:'protect' }]] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Window', items:[['LD','grid_on','Freeze Panes','pop:freeze']] },
    { label:'Show', items:[['C', [['SW','Gridlines','gridlines'], ['SW','Formula Bar','formulaBar'], ['SW','Headings','headings']]]] },
    { label:'Zoom', items:[['LD','zoom_in','Zoom','pop:zoom'], ['L','percent','100%','zoom100'], ['L','fit_screen','Zoom to Selection','zoomSel']] },
    { label:'Personalize', items:[['L','palette','App Color','seed']] }
  ] },
  { id:'chartdesign', label:'Chart Design', ctx:'chart', groups:[
    { label:'Type', items:[['LD','bar_chart','Change Chart Type','pop:chartType']] },
    { label:'Chart Layouts', items:[['L','title','Chart Title','chartTitle'], ['C', [['S','legend_toggle','Legend','chartLegend'], ['S','label','Data Labels','chartLabels'], ['S','stacked_bar_chart','Stacked','chartStack']]]] },
    { label:'Chart Styles', items:[['LD','palette','Change Colors','pop:chartColors']] },
    { label:'Data', items:[['L','swap_horiz','Switch Row/Column','chartSwitch'], ['L','table_chart','Select Data','chartData']] },
    { label:'Delete', items:[['L','delete','Delete Chart','chartDelete']] }
  ] },
  { id:'picformat', label:'Picture Format', ctx:'pic', groups:[
    { label:'Accessibility', items:[['L','short_text','Alt Text','altText']] }, { label:'Delete', items:[['L','delete','Delete Picture','chartDelete']] }
  ] }
];
const st = () => X.styleOf(X.sh, X.sel.ar, X.sel.ac);
const STATES = { bold:() => !!st().bold, italic:() => !!st().italic, underline:() => !!st().underline, strike:() => !!st().strike, wrap:() => !!st().wrap,
  alignL:() => st().align === 'left', alignC:() => st().align === 'center', alignR:() => st().align === 'right', vTop:() => st().valign === 'top', vMid:() => st().valign === 'middle', vBot:() => !st().valign,
  painter:() => !!X.painter, filter:() => !!X.sh.filter, protect:() => !!X.sh.protect, showFormulas:() => X.showFormulas, gridlines:() => X.sh.grid, headings:() => X.showHead, formulaBar:() => !$('#fxbar').hidden, printGrid:() => !!X.wb.print.grid };

/* extra pops */
P.paste = a => ONE.menuAt(a, [{ title:'Paste' }, { label:'Paste', icon:'content_paste', kbd:'Ctrl+V', on:() => ONE.toast('Press Ctrl+V to paste. Browsers only let pages read the clipboard from the keyboard.') },
  { label:'Paste Values', icon:'123', on:() => pasteAs('values') }, { label:'Paste Formulas', icon:'function', on:() => pasteAs('formulas') }, { label:'Paste Formatting', icon:'format_paint', on:() => pasteAs('formats') }, '-', { label:'Transpose', icon:'swap_horiz', on:() => { if (!X.clip) return ONE.toast('Copy some cells first.'); const C = X.clip, s = X.sh, r0 = X.sel.ar, c0 = X.sel.ac; X.mutate(() => C.cells.forEach((row, i) => row.forEach((cell, j) => { if (cell) s.cells[(r0 + j) + ',' + (c0 + i)] = JSON.parse(JSON.stringify(cell)); else delete s.cells[(r0 + j) + ',' + (c0 + i)]; }))); } }]);
const pasteAs = mode => { if (X.clip) return X.pasteInternal(mode); X.pasteMode = mode; ONE.toast('Copy cells in this workbook first, or press Ctrl+V to paste text.'); };
P.sortFilter = a => ONE.menuAt(a, [{ label:'Sort A to Z', icon:'north', on:A.sortAZ }, { label:'Sort Z to A', icon:'south', on:A.sortZA }, { label:'Custom Sort…', icon:'sort', on:A.customSort }, '-', { label:'Filter', icon:'filter_alt', kbd:'Ctrl+Shift+L', checked:!!X.sh.filter, on:A.filter }, { label:'Clear', icon:'filter_alt_off', on:A.clearFilter }, { label:'Reapply', icon:'refresh', on:A.reapply }]);
P.findSelect = a => ONE.menuAt(a, [{ label:'Find…', icon:'search', kbd:'Ctrl+F', on:A.find }, { label:'Replace…', icon:'find_replace', kbd:'Ctrl+H', on:A.replace }, { label:'Go To…', icon:'arrow_outward', kbd:'Ctrl+G', on:A.goTo }, '-', { label:'Select Current Region', icon:'select_all', on:() => { const g = X.region(); X.select(g.r1, g.c1, g.r2, g.c2, X.sel.ar, X.sel.ac, true); } }, { label:'Next Note', icon:'sticky_note_2', on:() => X.stepNote(1) }, { label:'Next Error', icon:'error', on:A.errorCheck }]);
P.chartCol = a => ONE.menuAt(a, [{ label:'Clustered Column', icon:'bar_chart', on:() => X.insertChart('column') }, { label:'Stacked Column', icon:'stacked_bar_chart', on:() => { X.insertChart('column'); A.chartStack(); } }, { label:'Clustered Bar', icon:'align_horizontal_left', on:() => X.insertChart('bar') }]);
P.chartLine = a => ONE.menuAt(a, [{ label:'Line', icon:'show_chart', on:() => X.insertChart('line') }, { label:'Area', icon:'area_chart', on:() => X.insertChart('area') }, { label:'Scatter', icon:'scatter_plot', on:() => X.insertChart('scatter') }]);
P.chartPie = a => ONE.menuAt(a, [{ label:'Pie', icon:'pie_chart', on:() => X.insertChart('pie') }, { label:'Doughnut', icon:'donut_large', on:() => X.insertChart('doughnut') }]);
const SYMS = '©®™€£¥¢°±×÷≠≈≤≥∞√πΩαβγδµ←→↑↓✓✗★☆♥•…—–½¼¾²³'.split('');
P.symbol = a => { const g = el('div', { class:'symgrid', style:{ display:'grid', gridTemplateColumns:'repeat(8,34px)', gap:'2px', padding:'6px' } }); SYMS.forEach(ch => g.append(el('button', { class:'rb', style:{ height:'34px', fontSize:'17px' }, text:ch, onclick:() => { ONE.pop.close(); if (X.editing) { const ed = $('#cellEditor'), p = ed.selectionStart; ed.value = ed.value.slice(0, p) + ch + ed.value.slice(p); ed.dispatchEvent(new Event('input')); ed.focus(); } else X.commitValue(X.sel.ar, X.sel.ac, X.raw(X.sh, X.sel.ar, X.sel.ac) + ch); } }))); ONE.pop.open(a, g); };
P.orient = a => ONE.menuAt(a, [['portrait','Portrait','crop_portrait'],['landscape','Landscape','crop_landscape']].map(([k, n, i]) => ({ label:n, icon:i, checked:X.wb.print.orient === k, on:() => { X.wb.print.orient = k; X.dirty(); } })));
P.psize = a => ONE.menuAt(a, [['letter','Letter','8.5" × 11"'],['a4','A4','8.27" × 11.69"'],['legal','Legal','8.5" × 14"']].map(([k, n, d]) => ({ label:n, sub:d, checked:X.wb.print.size === k, on:() => { X.wb.print.size = k; X.dirty(); } })));
P.printArea = a => ONE.menuAt(a, [{ label:'Set Print Area', icon:'crop_free', on:() => { X.wb.print.area = X.sh.name + '!' + X.rangeStr(X.normSel()); X.dirty(); ONE.toast(`Print area set to ${X.rangeStr(X.normSel())}.`); } }, { label:'Clear Print Area', icon:'crop_square', on:() => { X.wb.print.area = null; X.dirty(); } }]);

Object.assign(A, {
  save:() => { if (X.save(true)) ONE.toast('Saved to this browser.'); else ONE.toast('This browser blocked storage, so the workbook could not be saved.'); },
  undo:X.undo, redo:X.redo, backstage:() => ONE.backstage.show('home'), collapseRibbon:() => ONE.ribbon.setScale(ONE.ribbon.scale || 1, !document.querySelector('.app').classList.contains('ribbon-min')),
  seed:b => ONE.seedMenu(b), shortcuts:() => shortcuts(),
  cut:() => { kb.focus(); if (!document.execCommand('cut')) ONE.toast('Press Ctrl+X to cut.'); }, copy:() => { kb.focus(); if (!document.execCommand('copy')) { X.copySel(false); ONE.toast('Copied inside oneSheet. Press Ctrl+C to copy to other apps.'); } },
  formatFont:() => X.formatCells('font'), formatAlign:() => X.formatCells('align'), formatNumber:() => X.formatCells('number'),
  printGrid:() => { X.wb.print.grid = !X.wb.print.grid; X.dirty(); ONE.ribbon.refresh(); },
  openFile:() => $('#openInput').click(), insertFunction:() => X.insertFunction(),
  prevNote:() => X.stepNote(-1), nextNote:() => X.stepNote(1),
  zoom100:() => X.setZoom(1), zoomIn:() => X.setZoom(X.zoom + .1), zoomOut:() => X.setZoom(X.zoom - .1),
  fxCancel:() => { if (X.editing) X.cancelEdit(); },
  apps:b => ONE.appSwitcher(b), quickAnalysisBtn:b => A.quickAnalysis(b), fxEnter:() => { if (X.editing) X.commitEdit(null); }
});

/* ---------- dispatcher ---------- */
const run = (act, b, e) => {
  if (!act) return;
  if (act.startsWith('pop:')) { const p = P[act.slice(4)]; return p ? p(b) : null; }
  const f = A[act]; if (!f) return console.warn('Unknown action', act);
  f(b, e); if (!ONE.pop.el && !ONE.topModal() && !X.editing && !act.startsWith('chart') && document.activeElement && !document.activeElement.matches('input,select,textarea:not(#kb)')) kb.focus({ preventScroll:true });
};
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES });
$('#barFore').style.background = X.fore; $('#barFill').style.background = X.fillC;
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return; if (b.closest('.titlebar,.status,.fxbar')) run(b.dataset.act, b, e); });
$('.qat').addEventListener('mousedown', e => e.preventDefault()); $('.fxbtns').addEventListener('mousedown', e => e.preventDefault());
ONE.commandSearch($('#topSearch'), { run, docSearch:q => { X.findDialog(false); setTimeout(() => { const i = ONE.topModal().el.querySelector('input'); i.value = q; }, 50); } });
$('#docTitle').addEventListener('input', () => { X.wb.title = $('#docTitle').value; X.dirty(); });
$('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); kb.focus(); } });
$('#zoomRange').addEventListener('input', e => X.setZoom(e.target.value / 100));
X.hooks2.push(() => { ONE.ribbon.refresh(); $('#protInfo').hidden = !X.sh.protect; });

/* ---------- keyboard shortcuts ---------- */
function shortcuts(){
  const list = [['Edit cell','F2'],['Commit & move down / right','Enter / Tab'],['New line in cell','Alt+Enter'],['Fill selection with entry','Ctrl+Enter'],['Cancel edit','Esc'],['Absolute reference $','F4'],['Jump to data edge','Ctrl+Arrow'],['Select column / row','Ctrl+Space / Shift+Space'],['Select all','Ctrl+A'],['Copy / Cut / Paste','Ctrl+C / X / V'],['Undo / Redo','Ctrl+Z / Ctrl+Y'],['Bold / Italic / Underline','Ctrl+B / I / U'],['Strikethrough','Ctrl+5'],['Format Cells','Ctrl+1'],['Currency / Percent / Date','Ctrl+Shift+$ / % / #'],['General format','Ctrl+Shift+~'],['AutoSum','Alt+='],['Today’s date / time','Ctrl+; / Ctrl+Shift+;'],['Fill down / right','Ctrl+D / Ctrl+R'],['Insert / delete cells','Ctrl++ / Ctrl+-'],['Hide rows / columns','Ctrl+9 / Ctrl+0'],['Filter','Ctrl+Shift+L'],['Table','Ctrl+T'],['Link','Ctrl+K'],['Note','Shift+F2'],['Insert function','Shift+F3'],['Show formulas','Ctrl+`'],['Find / Replace / Go To','Ctrl+F / H / G'],['New sheet','Shift+F11'],['Next / previous sheet','Ctrl+PgDn / PgUp'],['Recalculate','F9'],['Save','Ctrl+S']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:540, body:`<div class="kbdlist" style="display:grid;grid-template-columns:1fr auto;gap:6px 18px;color:var(--on-surface)">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}
document.addEventListener('keydown', e => {
  if (ONE.topModal() || ONE.backstage.isOpen()) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); A.save(); } return; }
  const inGrid = document.activeElement === kb, mod = e.ctrlKey || e.metaKey, k = e.key;
  if (k === 'F1') { e.preventDefault(); return shortcuts(); }
  if (k === 'F9') { e.preventDefault(); return A.calcNow(); }
  if (e.altKey && !mod && k.toLowerCase() === 'q') { e.preventDefault(); return $('#topSearch').focus(); }
  if (e.altKey && (k === '=' || k === '+')) { e.preventDefault(); return A.autoSum(); }
  if (e.shiftKey && k === 'F11') { e.preventDefault(); return X.addSheet(); }
  if (e.shiftKey && k === 'F3') { e.preventDefault(); return X.insertFunction(); }
  if (e.shiftKey && k === 'F2' && inGrid) { e.preventDefault(); return A.note(); }
  if (!mod) return;
  const lk = k.toLowerCase();
  if (['s','o','n','p'].includes(lk)) { e.preventDefault(); return lk === 's' ? A.save() : ONE.backstage.show({ o:'open', n:'home', p:'print' }[lk]); }
  if (!inGrid && !(X.selChart && document.activeElement.closest('.chartobj'))) return;
  const map = {
    z:() => e.shiftKey ? X.redo() : X.undo(), y:X.redo, b:A.bold, i:A.italic, u:A.underline, '5':A.strike, '1':() => X.formatCells(),
    f:A.find, h:A.replace, g:A.goTo, d:A.fillDown, r:A.fillRight, k:A.link, t:A.table, a:() => X.select(0, 0, X.NR - 1, X.NC - 1, X.sel.ar, X.sel.ac, true),
    ';':() => X.commitValue(X.sel.ar, X.sel.ac, e.shiftKey ? X.format(X.toSerial(new Date()) % 1, { type:'time' }) : X.format(Math.floor(X.toSerial(new Date())), { type:'date' })),
    ':':() => X.commitValue(X.sel.ar, X.sel.ac, X.format(X.toSerial(new Date()) % 1, { type:'time' })),
    '`':A.showFormulas, '~':() => X.setNumFmt('general'), '$':() => X.setNumFmt('currency'), '%':() => X.setNumFmt('percent'), '#':() => X.setNumFmt('date'), '!':() => X.styleSel({ fmt:{ type:'number', dec:2, sep:true } }), '@':() => X.setNumFmt('time'),
    '9':A.hideRows, '0':A.hideCols, '+':() => { const g = X.normSel(); X.isFullCols(g) ? A.insertCols() : A.insertRows(); }, '=':() => { if (e.shiftKey) { const g = X.normSel(); X.isFullCols(g) ? A.insertCols() : A.insertRows(); } }, '-':() => { const g = X.normSel(); X.isFullCols(g) ? A.deleteCols() : A.deleteRows(); },
    l:() => e.shiftKey && A.filter(), q:() => A.quickAnalysis(document.querySelector('.qa-btn:not([hidden])') || document.querySelector('[data-act="quickAnalysisBtn"]'))
  };
  const f = map[k] || map[lk]; if (f) { e.preventDefault(); f(); }
});

/* ---------- context menu ---------- */
$('#gscroll').addEventListener('contextmenu', e => {
  e.preventDefault(); const r = $('#gscroll').getBoundingClientRect(), h = X.hit(e.clientX - r.left, e.clientY - r.top); const g = X.normSel();
  if (!h.inCH && !h.inRH && (h.r < g.r1 || h.r > g.r2 || h.c < g.c1 || h.c > g.c2)) X.select(h.r, h.c, h.r, h.c, h.r, h.c, true);
  if (h.inCH && !(h.c >= g.c1 && h.c <= g.c2 && X.isFullCols(g))) X.select(0, h.c, X.NR - 1, h.c, 0, h.c, true);
  if (h.inRH && !(h.r >= g.r1 && h.r <= g.r2 && X.isFullRows(g))) X.select(h.r, 0, h.r, X.NC - 1, h.r, 0, true);
  const G = X.normSel(), cols = X.isFullCols(G) && !X.isFullRows(G), rows = X.isFullRows(G) && !X.isFullCols(G);
  kb.focus({ preventScroll:true });
  ONE.menuAt({ x:e.clientX, y:e.clientY }, [
    { label:'Cut', icon:'content_cut', kbd:'Ctrl+X', on:A.cut }, { label:'Copy', icon:'content_copy', kbd:'Ctrl+C', on:A.copy }, { label:'Paste Special…', icon:'content_paste', on:() => P.paste({ x:e.clientX, y:e.clientY }) }, '-',
    cols ? { label:'Insert Columns', icon:'view_column', on:A.insertCols } : rows ? { label:'Insert Rows', icon:'table_rows', on:A.insertRows } : { label:'Insert…', icon:'add_box', on:() => P.insert({ x:e.clientX, y:e.clientY }) },
    cols ? { label:'Delete Columns', icon:'delete', on:A.deleteCols } : rows ? { label:'Delete Rows', icon:'delete', on:A.deleteRows } : { label:'Delete…', icon:'indeterminate_check_box', on:() => P.delete({ x:e.clientX, y:e.clientY }) },
    { label:'Clear Contents', icon:'backspace', kbd:'Delete', on:A.clearContents }, '-',
    ...(cols ? [{ label:'Column Width…', icon:'width', on:() => P.format({ x:e.clientX, y:e.clientY }) }, { label:'Hide', icon:'visibility_off', on:A.hideCols }, { label:'Unhide', icon:'visibility', on:A.unhideCols }, '-'] : rows ? [{ label:'Hide', icon:'visibility_off', on:A.hideRows }, { label:'Unhide', icon:'visibility', on:A.unhideRows }, '-'] : []),
    { label:'Sort A to Z', icon:'north', on:A.sortAZ }, { label:'Filter', icon:'filter_alt', on:A.filter }, '-',
    { label:X.sh.notes[X.sel.ar + ',' + X.sel.ac] ? 'Edit Note' : 'New Note', icon:'sticky_note_2', on:A.note }, { label:'Format Cells…', icon:'tune', kbd:'Ctrl+1', on:() => X.formatCells() }, { label:'Link', icon:'link', on:A.link },
    { label:'Define Name…', icon:'new_label', on:A.defineName }
  ]);
});

/* ---------- persistence ---------- */
X.lib = store.get('os-lib', { current:null, docs:{} });
let saveT;
X.dirty = () => { const s = $('#saveState'); s.textContent = 'Saving…'; s.classList.add('busy'); clearTimeout(saveT); saveT = setTimeout(() => X.save(false), 900); };
X.serialize = () => JSON.parse(JSON.stringify(X.wb, (k, v) => k === '_vals' || k === '_sel' ? undefined : v));
X.save = explicit => {
  clearTimeout(saveT); X.wb.title = $('#docTitle').value.trim() || 'Book1'; X.wb.updated = Date.now();
  const ok = store.set('os-doc-' + X.wb.id, X.serialize());
  X.lib.docs[X.wb.id] = { title:X.wb.title, updated:X.wb.updated, sheets:X.wb.sheets.length }; X.lib.current = X.wb.id; store.set('os-lib', X.lib);
  const s = $('#saveState'); s.classList.remove('busy'); s.textContent = ok ? 'Saved' : 'Not saved'; s.title = ok ? 'Saved in this browser' : 'This browser blocked local storage.'; void explicit; return ok;
};
X.openBook = wb => {
  if (X.wb && X.wb.id && X.lib.docs[X.wb.id]) X.save(false);
  const fresh = X.newBook(); X.wb = Object.assign(fresh, wb); X.wb.print = Object.assign(fresh.print, wb.print || {});
  X.wb.sheets.forEach(s => { const d = X.newSheet(s.name); Object.keys(d).forEach(k => { if (s[k] === undefined) s[k] = d[k]; }); });
  X.wb.active = Math.min(X.wb.active || 0, X.wb.sheets.length - 1);
  $('#docTitle').value = X.wb.title; X.sel = { r1:0, c1:0, r2:0, c2:0, ar:0, ac:0 }; X.selChart = null;
  $('#gscroll').scrollTop = 0; $('#gscroll').scrollLeft = 0; $('#charts').innerHTML = '';
  X.changed(false); X.resetUndo(); X.renderTabs(); X.afterSelect(); X.lib.current = X.wb.id; store.set('os-lib', X.lib);
  setTimeout(() => kb.focus({ preventScroll:true }), 50);
};

/* ---------- templates ---------- */
const build = (title, sheets) => { const wb = X.newBook(title); wb.sheets = sheets.map(fn => { const s = X.newSheet('Sheet'); fn(s); return s; }); return wb; };
const put = (s, a, rows) => { const p = X.parseAddr(a); rows.forEach((row, i) => row.forEach((v, j) => { if (v != null && v !== '') X.setRaw(s, p.r + i, p.c + j, String(v)); })); };
const sty = (s, rng, st) => { const g = X.parseRange(rng); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) X.setStyle(s, r, c, JSON.parse(JSON.stringify(st))); };
const cur$ = { type:'currency', sym:'$', dec:0 }, cur2 = { type:'currency', sym:'$', dec:2 }, pct = { type:'percent', dec:0 };
const TEMPLATES = {
  blank:{ name:'Blank workbook', make:() => X.newBook('Book1') },
  sales:{ name:'Sales report', desc:'Quarterly totals with a chart', make:() => build('Quarterly Sales', [s => {
    s.name = 'Sales';
    put(s, 'A1', [['Quarterly Sales by Region'], ['Fiscal year 2026 · figures in USD'], [], ['Region', 'Q1', 'Q2', 'Q3', 'Q4', 'Total', 'Growth'], ['North', 48200, 51300, 55900, 61200], ['South', 39100, 40800, 38600, 44100], ['East', 56700, 58200, 62400, 66800], ['West', 44300, 47900, 52100, 57300], ['Central', 31800, 33500, 35200, 36900], ['Online', 27400, 34600, 41800, 52300], ['Total']]);
    for (let r = 4; r <= 9; r++) { X.setRaw(s, r, 5, `=SUM(B${r + 1}:E${r + 1})`); X.setRaw(s, r, 6, `=E${r + 1}/B${r + 1}-1`); }
    ['B','C','D','E','F'].forEach((c, j) => X.setRaw(s, 10, 1 + j, `=SUM(${c}5:${c}10)`)); X.setRaw(s, 10, 6, '=E11/B11-1');
    sty(s, 'A1', { size:18, color:'#1F4E3D', font:'"Calibri Light", Calibri, Carlito, sans-serif' }); sty(s, 'A2', { color:'#666666', italic:true });
    sty(s, 'B5:F11', { fmt:cur$ }); sty(s, 'G5:G11', { fmt:{ type:'percent', dec:1 } }); sty(s, 'A11:G11', { bold:true, border:{ t:'thin', b:'double' } });
    s.tables.push({ r1:3, c1:0, r2:9, c2:6, style:'green', header:true }); s.filter = { r:3, r2:9, c1:0, c2:6, crit:{}, hidden:{} };
    s.cf.push({ id:'cf1', type:'bar', color:'#63BE7B', g:{ r1:4, c1:5, r2:9, c2:5 } }); s.cf.push({ id:'cf2', type:'icons', g:{ r1:4, c1:6, r2:9, c2:6 } });
    s.colW = { 0:120, 1:96, 2:96, 3:96, 4:96, 5:110, 6:84 }; s.rowH = { 0:34 }; s.freeze = { r:4, c:0 };
    s.notes['9,0'] = 'Online includes marketplace orders from Q2 onward.';
    s.charts.push({ id:'ch1', type:'column', src:'A4:E10', sheet:'Sales', x:0, y:X.DEF_H * 12 + 34, w:560, h:300, title:'Revenue by quarter', legend:true, palette:['#1F7A4D','#4CAF7D','#9FD5B5','#FFC000','#5B9BD5','#ED7D31'] });
    s.charts.push({ id:'ch2', type:'doughnut', src:'A4:F10', series:4, sheet:'Sales', x:580, y:X.DEF_H * 12 + 34, w:320, h:300, title:'Share of annual sales', legend:true, labels:true });
  }, s => { s.name = 'Targets'; put(s, 'A1', [['Region', 'Target', 'Actual', 'Met?'], ['North', 200000, '=Sales!F5'], ['South', 170000, '=Sales!F6'], ['East', 230000, '=Sales!F7'], ['West', 195000, '=Sales!F8'], ['Central', 140000, '=Sales!F9'], ['Online', 150000, '=Sales!F10']]); for (let r = 1; r <= 6; r++) X.setRaw(s, r, 3, `=IF(C${r + 1}>=B${r + 1},"Yes","No")`); sty(s, 'A1:D1', { bold:true, fill:'#E2EFDA', border:{ b:'thin' } }); sty(s, 'B2:C7', { fmt:cur$ }); s.cf.push({ id:'cf3', type:'eq', a:'Yes', style:{ fill:'#C6EFCE', color:'#006100' }, g:{ r1:1, c1:3, r2:6, c2:3 } }); s.cf.push({ id:'cf4', type:'eq', a:'No', style:{ fill:'#FFC7CE', color:'#9C0006' }, g:{ r1:1, c1:3, r2:6, c2:3 } }); s.colW = { 0:110, 1:110, 2:110 }; }]) },
  budget:{ name:'Monthly budget', desc:'Budget vs. actual with alerts', make:() => build('Monthly Budget', [s => {
    s.name = 'Budget'; put(s, 'A1', [['Monthly Budget'], [], ['Income', 'Amount'], ['Salary', 4200], ['Side projects', 650], ['Total income'], [], ['Category', 'Budget', 'Actual', 'Difference', '% used'], ['Rent', 1450, 1450], ['Groceries', 520, 588], ['Utilities', 180, 164], ['Transport', 220, 190], ['Dining out', 200, 276], ['Savings', 800, 800], ['Fun', 150, 95], ['Total']]);
    X.setRaw(s, 5, 1, '=SUM(B4:B5)'); for (let r = 8; r <= 14; r++) { X.setRaw(s, r, 3, `=B${r + 1}-C${r + 1}`); X.setRaw(s, r, 4, `=C${r + 1}/B${r + 1}`); } ['B','C','D'].forEach((c, j) => X.setRaw(s, 15, 1 + j, `=SUM(${c}9:${c}15)`)); X.setRaw(s, 15, 4, '=C16/B16'); put(s, 'G3', [['Left over'], ['=B6-C16']]);
    sty(s, 'A1', { size:18, color:'#1F4E3D' }); sty(s, 'A3:B3', { bold:true, border:{ b:'thin' } }); sty(s, 'A8:E8', { bold:true, fill:'#E2EFDA', border:{ b:'thin' } }); sty(s, 'A6:B6', { bold:true, border:{ t:'thin' } }); sty(s, 'A16:E16', { bold:true, border:{ t:'thin', b:'double' } });
    sty(s, 'B4:B6', { fmt:cur2 }); sty(s, 'B9:D16', { fmt:cur2 }); sty(s, 'E9:E16', { fmt:pct }); sty(s, 'G3', { bold:true }); sty(s, 'G4', { fmt:cur2, size:16, bold:true, color:'#1F7A4D' });
    s.cf.push({ id:'b1', type:'gt', a:1, style:{ fill:'#FFC7CE', color:'#9C0006' }, g:{ r1:8, c1:4, r2:14, c2:4 } }); s.cf.push({ id:'b2', type:'lt', a:0, style:{ color:'#C00000', bold:true }, g:{ r1:8, c1:3, r2:14, c2:3 } });
    s.colW = { 0:130, 1:100, 2:100, 3:100, 4:80, 6:110 };
    s.charts.push({ id:'bc', type:'bar', src:'A8:C15', sheet:'Budget', x:560, y:X.DEF_H * 6, w:420, h:280, title:'Budget vs. actual', legend:true });
  }]) },
  invoice:{ name:'Invoice', desc:'Items, tax and total', make:() => build('Invoice', [s => {
    s.name = 'Invoice'; put(s, 'A1', [['INVOICE'], ['Riverside Garden Supply'], ['14 Alder Lane, Riverside, OR'], [], ['Bill to', '', '', 'Invoice #', 'INV-1042'], ['Hartwell Hardware', '', '', 'Date', new Date().toLocaleDateString('en-US')], ['220 Main Street', '', '', 'Due', '=E6+30'], [], ['Description', 'Qty', 'Unit price', 'Amount'], ['Raised bed kit (4×8 ft)', 8, 129], ['Organic soil, 1.5 cu ft', 40, 11.5], ['Drip irrigation starter set', 2, 64], ['Delivery', 1, 45], [], ['', '', 'Subtotal'], ['', '', 'Tax rate', 0.085], ['', '', 'Tax'], ['', '', 'Total due']]);
    for (let r = 9; r <= 12; r++) X.setRaw(s, r, 3, `=B${r + 1}*C${r + 1}`); X.setRaw(s, 14, 3, '=SUM(D10:D13)'); X.setRaw(s, 16, 3, '=D15*TaxRate'); X.setRaw(s, 17, 3, '=D15+D17');
    X.wb = X.wb; sty(s, 'A1', { size:24, bold:true, color:'#1F7A4D' }); sty(s, 'A2', { bold:true }); sty(s, 'A5', { bold:true, color:'#666666' }); sty(s, 'D5:D7', { bold:true, color:'#666666', align:'right' }); sty(s, 'E7', { fmt:{ type:'date', pattern:'short' } }); sty(s, 'E6', { fmt:{ type:'date', pattern:'short' } });
    sty(s, 'A9:D9', { bold:true, fill:'#1F7A4D', color:'#FFFFFF' }); sty(s, 'C10:D13', { fmt:cur2 }); sty(s, 'D15', { fmt:cur2 }); sty(s, 'D16', { fmt:{ type:'percent', dec:1 } }); sty(s, 'D17', { fmt:cur2 }); sty(s, 'C15:C18', { align:'right', bold:true }); sty(s, 'C18:D18', { size:13, bold:true, border:{ t:'thin', b:'double' } }); sty(s, 'D18', { fmt:cur2, size:13, bold:true, border:{ t:'thin', b:'double' } });
    s.colW = { 0:230, 1:60, 2:100, 3:110, 4:110 }; s.grid = false;
  }], ), post:wb => { wb.names = { TAXRATE:'Invoice!$D$16' }; } },
  grades:{ name:'Grade book', desc:'Averages, letter grades, color scale', make:() => build('Grade Book', [s => {
    s.name = 'Grades'; const names = ['Avery','Blake','Casey','Devon','Emerson','Finley','Harper','Jordan','Kai','Logan']; const rnd = (i, j) => 62 + ((i * 37 + j * 17) % 36);
    put(s, 'A1', [['Student', 'Quiz 1', 'Quiz 2', 'Midterm', 'Project', 'Final', 'Average', 'Grade'], ...names.map((n, i) => [n, rnd(i, 1), rnd(i, 2), rnd(i, 3), rnd(i, 4), rnd(i, 5)])]);
    names.forEach((_, i) => { const r = i + 2; X.setRaw(s, i + 1, 6, `=ROUND(AVERAGE(B${r}:F${r}),1)`); X.setRaw(s, i + 1, 7, `=IFS(G${r}>=90,"A",G${r}>=80,"B",G${r}>=70,"C",G${r}>=60,"D",TRUE,"F")`); });
    put(s, 'A13', [['Class average'], ['Highest'], ['Lowest']]); ['B','C','D','E','F','G'].forEach((c, j) => { X.setRaw(s, 12, 1 + j, `=ROUND(AVERAGE(${c}2:${c}11),1)`); X.setRaw(s, 13, 1 + j, `=MAX(${c}2:${c}11)`); X.setRaw(s, 14, 1 + j, `=MIN(${c}2:${c}11)`); });
    s.tables.push({ r1:0, c1:0, r2:10, c2:7, style:'teal', header:true }); s.cf.push({ id:'g1', type:'scale', colors:['#F8696B','#FFEB84','#63BE7B'], g:{ r1:1, c1:6, r2:10, c2:6 } }); sty(s, 'A13:G15', { bold:true }); sty(s, 'H2:H11', { align:'center', bold:true }); s.freeze = { r:1, c:1 }; s.colW = { 0:110 };
  }]) },
  loan:{ name:'Loan calculator', desc:'PMT and an amortization schedule', make:() => build('Loan Calculator', [s => {
    s.name = 'Loan'; put(s, 'A1', [['Loan Calculator'], [], ['Loan amount', 25000], ['Annual rate', 0.065], ['Years', 5], ['Monthly payment', '=PMT(B4/12,B5*12,-B3)'], ['Total interest', '=B6*B5*12-B3'], [], ['Month', 'Payment', 'Interest', 'Principal', 'Balance'], [0, '', '', '', '=B3']]);
    for (let m = 1; m <= 60; m++) { const r = 9 + m, R = r + 1; X.setRaw(s, r, 0, String(m)); X.setRaw(s, r, 1, '=$B$6'); X.setRaw(s, r, 2, `=E${R - 1}*$B$4/12`); X.setRaw(s, r, 3, `=B${R}-C${R}`); X.setRaw(s, r, 4, `=E${R - 1}-D${R}`); }
    sty(s, 'A1', { size:18, color:'#1F4E3D' }); sty(s, 'B3', { fmt:cur2, fill:'#FFF2CC' }); sty(s, 'B4', { fmt:{ type:'percent', dec:2 }, fill:'#FFF2CC' }); sty(s, 'B5', { fill:'#FFF2CC' }); sty(s, 'B6:B7', { fmt:cur2, bold:true }); sty(s, 'A9:E9', { bold:true, fill:'#E2EFDA', border:{ b:'thin' } }); sty(s, 'B10:E70', { fmt:cur2 });
    s.notes['2,1'] = 'Change the yellow cells; everything else updates.'; s.colW = { 0:130, 1:110, 2:100, 3:100, 4:110 }; s.freeze = { r:9, c:0 };
    s.charts.push({ id:'lc', type:'area', src:'E10:E70', sheet:'Loan', x:620, y:X.DEF_H * 8, w:420, h:260, title:'Remaining balance', legend:false });
  }]) },
  todo:{ name:'Task tracker', desc:'Status dropdowns and highlights', make:() => build('Task Tracker', [s => {
    s.name = 'Tasks'; put(s, 'A1', [['Task', 'Owner', 'Due', 'Status', 'Priority'], ['Order drip-line parts', 'Sam', '3/20/2026', 'Done', 'High'], ['Get quotes for shed roof', 'Priya', '3/27/2026', 'In progress', 'Medium'], ['Plan opening day', 'Jordan', '4/10/2026', 'Not started', 'High'], ['Update volunteer rota', 'Dana', '3/31/2026', 'In progress', 'Low'], ['Order seed potatoes', 'Sam', '3/15/2026', 'Done', 'Medium']]);
    for (let r = 1; r <= 30; r++) { s.valid[r + ',3'] = { type:'list', src:'Not started, In progress, Done' }; s.valid[r + ',4'] = { type:'list', src:'High, Medium, Low' }; }
    for (let r = 1; r <= 5; r++) X.setStyle(s, r, 2, { fmt:{ type:'date', pattern:'mdy' } });
    s.tables.push({ r1:0, c1:0, r2:5, c2:4, style:'gray', header:true }); s.filter = { r:0, r2:5, c1:0, c2:4, crit:{}, hidden:{} };
    s.cf.push({ id:'t1', type:'eq', a:'Done', style:{ fill:'#C6EFCE', color:'#006100' }, g:{ r1:1, c1:3, r2:30, c2:3 } }, { id:'t2', type:'eq', a:'In progress', style:{ fill:'#FFEB9C', color:'#9C5700' }, g:{ r1:1, c1:3, r2:30, c2:3 } }, { id:'t3', type:'eq', a:'High', style:{ color:'#C00000', bold:true }, g:{ r1:1, c1:4, r2:30, c2:4 } });
    s.colW = { 0:220, 1:90, 2:110, 3:110, 4:80 }; s.freeze = { r:1, c:0 };
  }]) }
};
const newFrom = k => { const t = TEMPLATES[k], wb = t.make(); if (t.post) t.post(wb); return wb; };

/* ---------- import / export ---------- */
async function loadXLSX(){ if (window.XLSX) return window.XLSX; await new Promise((ok, bad) => { const s = el('script', { src:'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' }); s.onload = ok; s.onerror = bad; document.head.append(s); }); return window.XLSX; }
const fromRows = (title, rows, name = 'Sheet1') => { const wb = X.newBook(title); const s = wb.sheets[0]; s.name = name; rows.forEach((row, i) => row.forEach((v, j) => { if (v !== '' && v != null) X.setRaw(s, i, j, String(v)); })); return wb; };
const parseCSV = (t, d) => { const rows = []; let row = [], cur = '', q = false; t = t.replace(/\r\n?/g, '\n'); for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === d) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; } else cur += ch; } if (cur || row.length) { row.push(cur); rows.push(row); } return rows; };
$('#openInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; const base = f.name.replace(/\.[^.]+$/, '');
  try {
    let wb;
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(f.name)) {
      ONE.toast('Opening workbook…'); const XL = await loadXLSX(); const book = XL.read(await f.arrayBuffer(), { cellFormula:true, cellNF:true, cellDates:false });
      wb = X.newBook(base); wb.sheets = book.SheetNames.map(n => { const ws = book.Sheets[n], s = X.newSheet(n);
        Object.keys(ws).forEach(a => { if (a[0] === '!') return; const p = X.parseAddr(a); if (!p) return; const c = ws[a];
          const raw = c.f ? '=' + c.f : c.t === 'b' ? (c.v ? 'TRUE' : 'FALSE') : c.t === 'n' ? String(c.v) : c.t === 'e' ? '' : String(c.v ?? '');
          if (raw === '') return; X.setRaw(s, p.r, p.c, raw);
          if (c.z && c.t === 'n' && XL.SSF && XL.SSF.is_date && XL.SSF.is_date(c.z)) X.setStyle(s, p.r, p.c, { fmt:{ type:'date', pattern:'short' } });
          else if (c.z && /%/.test(c.z)) X.setStyle(s, p.r, p.c, { fmt:{ type:'percent', dec:(String(c.z).split('.')[1] || '').replace(/[^0]/g, '').length } });
          else if (c.z && /[$€£]/.test(c.z)) X.setStyle(s, p.r, p.c, { fmt:{ type:'currency', sym:(c.z.match(/[$€£]/) || ['$'])[0], dec:/\.0/.test(c.z) ? 2 : 0 } }); });
        (ws['!merges'] || []).forEach(m => s.merges.push({ r1:m.s.r, c1:m.s.c, r2:m.e.r, c2:m.e.c }));
        (ws['!cols'] || []).forEach((c, i) => { if (c && (c.wpx || c.wch)) s.colW[i] = Math.round(c.wpx || c.wch * 7.5); });
        return s; });
      if (!wb.sheets.length) wb.sheets = [X.newSheet('Sheet1')];
    } else if (/\.json$/i.test(f.name)) { const data = JSON.parse(await f.text()); const arr = Array.isArray(data) ? data : [data]; const keys = [...new Set(arr.flatMap(o => Object.keys(o || {})))]; wb = fromRows(base, [keys, ...arr.map(o => keys.map(k => typeof o[k] === 'object' ? JSON.stringify(o[k]) : o[k]))]); }
    else { const t = await f.text(); const d = /\.tsv$/i.test(f.name) || (t.split('\n')[0].split('\t').length > t.split('\n')[0].split(',').length) ? '\t' : ','; wb = fromRows(base, parseCSV(t, d), base.slice(0, 31)); }
    X.openBook(wb); ONE.backstage.close(); ONE.toast(`Opened ${f.name}.`);
  } catch (err) { console.error(err); ONE.toast(/\.(xlsx|xls|ods)/i.test(f.name) ? 'Couldn’t read that workbook. Try saving it as .csv.' : 'Couldn’t open that file.'); }
});
const usedGrid = (s = X.sh, g) => { g = g || { r1:0, c1:0, r2:Math.max(0, X.usedRows(s) - 1), c2:Math.max(0, X.usedCols(s) - 1) }; const rows = []; for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) row.push(X.displayOf(s, r, c)); rows.push(row); } return rows; };
const toCSV = (rows, d = ',') => rows.map(r => r.map(v => new RegExp(`["\\n${d === '\t' ? '\\t' : d}]`).test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(d)).join('\n');
const toHTML = s => { const g = { r1:0, c1:0, r2:Math.max(0, X.usedRows(s) - 1), c2:Math.max(0, X.usedCols(s) - 1) }; let h = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(s.name)}</title><style>table{border-collapse:collapse;font:13px Calibri,Carlito,sans-serif}td{border:1px solid #d0d0d0;padding:2px 6px}</style></head><body><table>`; for (let r = g.r1; r <= g.r2; r++) { h += '<tr>'; for (let c = g.c1; c <= g.c2; c++) { const st0 = X.styleOf(s, r, c), v = X.valueAt(X.wb, s, r, c); h += `<td style="${st0.bold ? 'font-weight:bold;' : ''}${st0.fill ? `background:${st0.fill};` : ''}${st0.color ? `color:${st0.color};` : ''}${typeof v === 'number' ? 'text-align:right;' : ''}">${esc(X.displayOf(s, r, c))}</td>`; } h += '</tr>'; } return h + '</table></body></html>'; };
const toMD = rows => rows.length ? ['| ' + rows[0].join(' | ') + ' |', '|' + ' --- |'.repeat(rows[0].length), ...rows.slice(1).map(r => '| ' + r.join(' | ') + ' |')].join('\n') : '';

/* ---------- backstage ---------- */
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const tplThumb = k => `<div class="thumb" style="padding:10px;gap:0;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:14px;background:#fff">${Array.from({ length:48 }, (_, i) => `<i style="border:1px solid #e6e6e6;${k !== 'blank' && i < 4 ? 'background:#1F7A4D' : k !== 'blank' && i % 4 === 3 && i < 36 ? 'background:#E2EFDA' : ''}"></i>`).join('')}</div>`;
function recent(max, del, q, where = 'open'){
  const list = el('div', { class:'list' }); const docs = Object.entries(X.lib.docs).filter(([, m]) => !q || m.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) list.append(el('p', { class:'home-empty', text:q ? 'No workbooks match that search.' : 'No saved workbooks yet.' }));
  docs.forEach(([id, m]) => list.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:'table_chart', style:{ color:'var(--primary)' } }), el('span', { class:'grow', html:`<b>${esc(m.title)}${id === X.wb.id ? ' <small>· open now</small>' : ''}</b><small>${fmtDate(m.updated)} · ${m.sheets || 1} sheet${m.sheets > 1 ? 's' : ''}</small>` }),
    el('button', { class:'btn text', text:'Open', onclick:() => { const d = store.get('os-doc-' + id); if (d) { X.openBook(d); ONE.backstage.close(); } else ONE.toast('That workbook could not be found in this browser.'); } }),
    del && id !== X.wb.id ? el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => ONE.modal({ title:`Delete “${m.title}”?`, body:'It will be removed from this browser. This can’t be undone.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('os-doc-' + id); delete X.lib.docs[id]; store.set('os-lib', X.lib); ONE.backstage.show(where); } }] }) }) : null)));
  return list;
}
ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => { const hr = new Date().getHours(), search = el('input', { placeholder:'Search your workbooks', 'aria-label':'Search your workbooks' }); b.append(el('div', { class:'home-hero' }, el('h1', { text:hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }), el('label', { class:'home-search', html:icon('search') }, search)), el('h3', { text:'Start something new' })); const g = el('div', { class:'tpl' }); Object.entries(TEMPLATES).forEach(([k, t]) => g.append(el('button', { class:'tpl-card', html:`${tplThumb(k)}<span>${esc(t.name)}${t.desc ? `<small><br>${esc(t.desc)}</small>` : ''}</span>`, onclick:() => { X.openBook(newFrom(k)); ONE.backstage.close(); X.save(false); } }))); const holder = el('div'); b.append(g, el('h3', { text:'Your workbooks' }), holder); const draw = () => { holder.innerHTML = ''; holder.append(recent(200, true, search.value, 'home')); }; search.oninput = draw; draw(); } },
  { id:'open', label:'Open', icon:'folder_open', render:b => b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })), el('p', { class:'bs-note', text:'Opens Excel (.xlsx, .xls), OpenDocument (.ods), CSV, TSV and JSON files. Workbooks you create here are kept in this browser.' }), el('h3', { text:'Workbooks in this browser' }), recent(50, true)) },
  { id:'info', label:'Info', icon:'info', render:b => { let cells = 0, f = 0; X.wb.sheets.forEach(s => Object.values(s.cells).forEach(c => { if (c.v !== '' && c.v != null) cells++; if (typeof c.v === 'string' && c.v[0] === '=') f++; }));
    b.append(el('h1', { text:'Info' }), el('div', { class:'info', html:`<span>Title</span><span>${esc($('#docTitle').value)}</span><span>Sheets</span><span>${X.wb.sheets.map(s => esc(s.name)).join(', ')}</span><span>Cells with data</span><span>${cells.toLocaleString()}</span><span>Formulas</span><span>${f.toLocaleString()}</span><span>Defined names</span><span>${Object.keys(X.wb.names).length}</span><span>Last saved</span><span>${fmtDate(X.wb.updated)}</span>` }),
      el('h3', { text:'Protect' }), el('div', { class:'bs-row' }, el('button', { class:'btn outlined', html:`${icon('lock')}${X.sh.protect ? 'Unprotect' : 'Protect'} current sheet`, onclick:() => { A.protect(); ONE.backstage.show('info'); } }))); } },
  { id:'saveas', label:'Save As', icon:'save_as', render:b => { const n = ONE.input({ value:$('#docTitle').value + ' (copy)' }); b.append(el('h1', { text:'Save As' }), el('div', { style:{ maxWidth:'420px' } }, ONE.field('File name', n)), el('div', { class:'bs-row', style:{ marginTop:'14px' } }, el('button', { class:'btn filled', html:`${icon('save_as')}Save a copy`, onclick:() => { X.save(true); const c = X.serialize(); c.id = ONE.uid(); c.title = n.value.trim() || 'Book1'; X.openBook(c); X.save(true); ONE.backstage.close(); ONE.toast(`Saved as “${c.title}”. You’re now editing the copy.`); } }))); } },
  { id:'print', label:'Print', icon:'print', render:b => {
    b.append(el('h1', { text:'Print' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('print')}Print “${esc(X.sh.name)}”`, onclick:() => { ONE.backstage.close(); setTimeout(A.printSheet, 250); } })), el('p', { class:'bs-note', text:'Uses the print area, orientation, paper size and gridline settings from the Page Layout tab. Preview:' }));
    const s = X.sh; let g = { r1:0, c1:0, r2:Math.max(0, X.usedRows(s) - 1), c2:Math.max(0, X.usedCols(s) - 1) }; if (X.wb.print.area && X.wb.print.area.split('!')[0] === s.name) g = X.parseRange(X.wb.print.area.split('!')[1]);
    const land = X.wb.print.orient === 'landscape', W = land ? 280 : 210, H = land ? 210 : 280, per = land ? 28 : 42, box = el('div', { class:'printprev' }); b.append(box);
    for (let p = 0, r = g.r1; r <= g.r2 && p < 20; p++, r += per) { const pg = el('div', { class:'ppage', style:{ width:W + 'px', height:H + 'px', animationDelay:p * 50 + 'ms' } }); let h = '<table>'; for (let i = r; i < Math.min(g.r2 + 1, r + per); i++) { if (!X.rowH(s, i)) continue; h += '<tr>'; for (let c = g.c1; c <= g.c2; c++) { const st0 = X.styleOf(s, i, c); h += `<td style="${X.wb.print.grid ? 'border:1px solid #ddd;' : ''}${st0.bold ? 'font-weight:bold;' : ''}${st0.fill ? `background:${st0.fill};` : ''}${typeof X.valueAt(X.wb, s, i, c) === 'number' ? 'text-align:right;' : ''}">${esc(X.displayOf(s, i, c))}</td>`; } h += '</tr>'; }
      pg.innerHTML = h + `</table><span class="cap">Page ${p + 1}</span>`; box.append(pg); requestAnimationFrame(() => { const t = pg.querySelector('table'); const k = Math.min(1, (W - 16) / t.scrollWidth); t.style.transform = `scale(${k})`; t.style.margin = '8px'; }); }
  } },
  { id:'export', label:'Export', icon:'ios_share', render:b => { const s = X.sh, rows = () => usedGrid(s);
    b.append(el('h1', { text:'Export' }), el('h3', { text:'Save a copy to this device' }), el('div', { class:'list' }, ...[['table_chart', 'Excel workbook (.xlsx)', 'All sheets with values, formulas and number formats.', A.saveXlsx], ['csv', `CSV of “${s.name}” (.csv)`, 'Plain values, one sheet.', A.saveCsv]].map(([ic, t, d, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${esc(t)}</b><small>${d}</small>` }), el('button', { class:'btn filled', html:`${icon('download')}Save`, onclick:fn })))), el('h3', { text:`Copy “${s.name}” to the clipboard` }),
      el('div', { class:'list' }, ...[['CSV (comma-separated)', 'csv', () => toCSV(rows())], ['Tab-separated (paste into Excel or Sheets)', 'table_rows', () => toCSV(rows(), '\t')], ['HTML table', 'code', () => toHTML(s)], ['Markdown table', 'markdown', () => toMD(rows())], ['JSON (rows as objects)', 'data_object', () => { const r = rows(); const [h, ...d] = r; return JSON.stringify(d.map(x => Object.fromEntries(h.map((k, i) => [k || 'Column' + (i + 1), x[i]]))), null, 2); }]]
        .map(([t, ic, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b>` }), el('button', { class:'btn tonal', text:'Copy', onclick:() => ONE.copyText(fn()) }))))); } },
  '-',
  { id:'close', label:'Close', icon:'close', render:() => { X.save(true); X.openBook(X.newBook('Book1')); ONE.backstage.close(); ONE.toast('Workbook closed. Find it again in File › Open.'); } }
]);

/* ---------- boot ---------- */
X.setMode('Ready');
const firstId = X.lib.current, first = firstId && store.get('os-doc-' + firstId);
const pendId = ONE.pendingOpen(), pend = pendId && store.get('os-doc-' + pendId);
X.openBook(pend || first || newFrom('sales')); if (!first && !pend) X.save(false);
if (!pend) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => { const d = store.get('os-doc-' + id); if (d) { X.openBook(d); ONE.backstage.close(); } };
ONE.onNewRequest = k => { X.openBook(newFrom(TEMPLATES[k] ? k : 'blank')); ONE.backstage.close(); X.save(false); };
X.select(0, 0);
kb.focus({ preventScroll:true });
if (document.fonts) document.fonts.ready.then(() => { X.readTheme(); X.drawNow(); });
})();
