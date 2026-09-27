/* oneWord — ribbon, commands, File backstage, templates, shortcuts, mini toolbar, boot */
(() => {
'use strict';
const { $, $$, esc, el, icon, store } = ONE;
const E = W.editor, sheet = W.sheet, app = W.app, A = W.act, P = W.pops;
ONE.boot('ow', 'word');

/* ---------- custom ribbon widgets ---------- */
const fontSel = () => { const s = el('select', { class:'combo fontsel', id:'fontName', 'aria-label':'Font', title:'Font (Ctrl+Shift+F)' }); W.FONTS.forEach(([n, st]) => s.append(el('option', { value:n, text:n, style:{ fontFamily:st } }))); s.value = 'Calibri'; s.onchange = () => W.setFont(W.FONTS.find(f => f[0] === s.value)[1]); return s; };
const sizeSel = () => { const w = el('span'); const i = el('input', { class:'combo sizesel', id:'fontSize', list:'sizeList', value:'11', 'aria-label':'Font size', title:'Font Size (Ctrl+Shift+P)' }); const dl = el('datalist', { id:'sizeList' }); W.SIZES_PT.forEach(s => dl.append(el('option', { value:s }))); i.onchange = () => { const v = parseFloat(i.value); if (v >= 1 && v <= 1638) W.setSize(v); }; i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); i.onchange(); } }; w.append(i, dl); return w; };
const styleCard = ([k, n, css]) => el('button', { class:'sty', 'data-style':k, title:n, html:`<span class="pv" style="${css};font-family:${k.startsWith('h') ? 'var(--hf)' : 'var(--bf)'}">AaBbCcDd</span><span class="nm">${k === 'p' ? '¶ ' : ''}${esc(n)}</span>`, onclick:() => W.setStyle(k) });
const gallery = () => { const g = el('div', { class:'gallery', id:'gallery' }); W.STYLES.slice(0, 7).forEach(s => g.append(styleCard(s))); g.append(el('div', { class:'gal-more' }, el('button', { class:'rb icon', 'data-act':'pop:styles', title:'More styles', html:icon('expand_more') }))); syncGalleryVars(g); return g; };
function syncGalleryVars(g){ const s = W.STYLESETS[W.doc.design.set], c = W.THEMECOLORS[W.doc.design.colors]; const t = g || $('#gallery'); if (!t) return; t.style.setProperty('--bf', s.body); t.style.setProperty('--hf', s.head); t.style.setProperty('--hc', c.h); t.style.setProperty('--hc3', c.h3); }
const stylesets = () => { const g = el('div', { class:'stylesets' }); Object.entries(W.STYLESETS).forEach(([k, s]) => g.append(el('button', { class:'sset' + (k === W.doc.design.set ? ' on' : ''), 'data-set':k, title:s.name, html:`<b style="font-family:${s.head.replace(/"/g, "'")};font-weight:${s.weight};text-transform:${s.transform};color:#2f5496">Title</b><i style="width:70%"></i><i></i><i style="width:85%"></i><small>${s.name}</small>`, onclick:() => { W.setDesign('set', k); syncGalleryVars(); } }))); return g; };
const indentSpacing = () => {
  const f = (id, label, unit, step) => { const i = el('input', { type:'number', id, step, 'aria-label':label }); i.onchange = () => W.setIndentSpacing(id, parseFloat(i.value) || 0); return el('label', { class:'numin' }, el('span', { text:label }), i, el('span', { text:unit })); };
  return el('div', { class:'col', style:{ gap:'4px' } }, el('div', { class:'row', style:{ gap:'14px' } }, f('indL', 'Indent left', 'in', .1), f('spB', 'Before', 'pt', 6)), el('div', { class:'row', style:{ gap:'14px' } }, f('indR', 'Indent right', 'in', .1), f('spA', 'After', 'pt', 6)));
};
const tableStyles = () => { const g = el('div', { class:'tstyles' });
  [['', 'Grid', '#000', '#fff', '#fff'], ['t-plain', 'Plain', 'transparent', '#fff', '#fff'], ['t-accent', 'Accent', '#4472c4', '#4472c4', '#fff'], ['t-list', 'List', '#8faadc', '#fff', '#fff'], ['t-shade', 'Light Shading', '#000', '#d9e2f3', '#fff']].forEach(([c, n, b, h, r]) =>
    g.append(el('button', { class:'tsty', title:n, 'aria-label':n, html:`<i style="background:${h};outline:1px solid ${b}"></i><i style="background:${r};outline:1px solid ${b}"></i><i style="background:${r};outline:1px solid ${b}"></i><i style="background:${r};outline:1px solid ${b}"></i>`, onclick:() => W.tblStyle(c) }))); return g; };
const picStyles = () => { const g = el('div', { class:'ipstyles' });
  [['', 'Simple'], ['st-round', 'Rounded'], ['st-shadow', 'Drop Shadow'], ['st-frame', 'Frame'], ['st-circle', 'Circle'], ['st-soft', 'Soft Edges']].forEach(([c, n]) => { const i = el('i'); if (c === 'st-round') i.style.borderRadius = '7px'; if (c === 'st-shadow') i.style.boxShadow = '0 3px 6px rgba(0,0,0,.4)'; if (c === 'st-frame') i.style.outline = '3px solid #fff', i.style.boxShadow = '0 0 0 4px #ccc'; if (c === 'st-circle') i.style.borderRadius = '50%', i.style.width = '28px'; if (c === 'st-soft') i.style.filter = 'blur(1px)';
    g.append(el('button', { class:'ipsty', title:n, 'aria-label':n, onclick:() => W.imgStyle(c) }, i)); }); return g; };

/* ---------- ribbon spec ---------- */
const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Clipboard', items:[['LD','content_paste','Paste','pop:paste'], ['C', [['S','content_cut','Cut','cut',{ kbd:'Ctrl+X' }], ['S','content_copy','Copy','copy',{ kbd:'Ctrl+C' }], ['S','format_paint','Format Painter','painter',{ state:'painter', tip:'Format Painter (double-click to keep it on)' }]]]] },
    { label:'Font', launch:'fontDialog', items:[['C', [
      ['R', [['X', fontSel], ['X', sizeSel], ['I','text_increase','Increase Font Size','grow',{ kbd:'Ctrl+]' }], ['I','text_decrease','Decrease Font Size','shrink',{ kbd:'Ctrl+[' }], ['ID','match_case','Change Case','pop:case',{ kbd:'Shift+F3' }], ['I','format_clear','Clear All Formatting','clearFormat',{ kbd:'Ctrl+Space' }]]],
      ['R', [['I','format_bold','Bold','cmd:bold',{ state:true, kbd:'Ctrl+B' }], ['I','format_italic','Italic','cmd:italic',{ state:true, kbd:'Ctrl+I' }], ['SP','format_underlined','Underline','cmd:underline','pop:underline',{ state:true, kbd:'Ctrl+U' }], ['I','format_strikethrough','Strikethrough','cmd:strikeThrough',{ state:true }], ['I','subscript','Subscript','cmd:subscript',{ state:true, kbd:'Ctrl+=' }], ['I','superscript','Superscript','cmd:superscript',{ state:true, kbd:'Ctrl+Shift+=' }], ['ID','auto_awesome','Text Effects and Typography','pop:effects'], ['SP','ink_highlighter','Text Highlight Color','hilite','pop:hilite',{ bar:'barHi' }], ['SP','format_color_text','Font Color','fore','pop:fore',{ bar:'barFore' }]]]]]] },
    { label:'Paragraph', launch:'paraDialog', items:[['C', [
      ['R', [['SP','format_list_bulleted','Bullets','cmd:insertUnorderedList','pop:bullets',{ state:true, kbd:'Ctrl+Shift+L' }], ['SP','format_list_numbered','Numbering','cmd:insertOrderedList','pop:numbering',{ state:true }], ['I','format_indent_decrease','Decrease Indent','cmd:outdent',{ kbd:'Ctrl+Shift+M' }], ['I','format_indent_increase','Increase Indent','cmd:indent',{ kbd:'Ctrl+M' }], ['I','sort_by_alpha','Sort','pop:sort'], ['I','format_paragraph','Show/Hide ¶','marks',{ state:'marks', kbd:'Ctrl+Shift+8' }]]],
      ['R', [['I','format_align_left','Align Left','cmd:justifyLeft',{ state:true, kbd:'Ctrl+L' }], ['I','format_align_center','Center','cmd:justifyCenter',{ state:true, kbd:'Ctrl+E' }], ['I','format_align_right','Align Right','cmd:justifyRight',{ state:true, kbd:'Ctrl+R' }], ['I','format_align_justify','Justify','cmd:justifyFull',{ state:true, kbd:'Ctrl+J' }], ['ID','format_line_spacing','Line and Paragraph Spacing','pop:spacing'], ['SP','format_color_fill','Shading','shade','pop:shade'], ['ID','border_bottom','Borders','pop:borders']]]]]] },
    { label:'Styles', launch:'pop:styles', items:[['X', gallery]] },
    { label:'Editing', items:[['C', [['S','search','Find','find',{ kbd:'Ctrl+F' }], ['S','find_replace','Replace','replace',{ kbd:'Ctrl+H' }], ['SD','select_all','Select','pop:select']]], ['C', [['S','arrow_outward','Go To','goTo',{ kbd:'Ctrl+G' }]]]] },
    { label:'Proofing', items:[['L','edit_note','Editor','editor']] }
  ] },
  { id:'insert', label:'Insert', groups:[
    { label:'Pages', items:[['LD','article','Cover Page','pop:cover'], ['L','note_add','Blank Page','blankPage'], ['L','insert_page_break','Page Break','pageBreak',{ kbd:'Ctrl+Enter' }]] },
    { label:'Tables', items:[['LD','table','Table','pop:table']] },
    { label:'Illustrations', items:[['L','image','Pictures','picture'], ['LD','category','Shapes','pop:shapes'], ['L','bar_chart','Chart','chart']] },
    { label:'Links', items:[['L','link','Link','pop:link',{ kbd:'Ctrl+K' }], ['L','bookmark','Bookmark','bookmark']] },
    { label:'Comments', items:[['L','add_comment','Comment','newComment',{ kbd:'Ctrl+Alt+M' }]] },
    { label:'Header & Footer', items:[['LD','vertical_align_top','Header','pop:header'], ['LD','vertical_align_bottom','Footer','pop:footer'], ['LD','tag','Page Number','pop:pagenum']] },
    { label:'Text', items:[['L','text_fields','Text Box','textBox'], ['C', [['SD','format_size','Drop Cap','pop:dropcap'], ['SD','auto_awesome','WordArt','pop:wordart'], ['S','draw','Signature Line','signature']]], ['C', [['S','calendar_today','Date & Time','dateTime'], ['S','horizontal_rule','Horizontal Line','hr']]]] },
    { label:'Symbols', items:[['LD','functions','Equation','pop:equation'], ['LD','emoji_symbols','Symbol','pop:symbol'], ['LD','interests','Icons','pop:icons']] }
  ] },
  { id:'design', label:'Design', groups:[
    { label:'Document Formatting', items:[['X', stylesets], ['C', [['SD','palette','Colors','pop:themeColors'], ['SD','format_line_spacing','Paragraph Spacing','pop:paraSpacing'], ['S','restart_alt','Reset to Default','resetDesign']]]] },
    { label:'Page Background', items:[['LD','branding_watermark','Watermark','pop:watermark'], ['LD','format_color_fill','Page Color','pop:pageColor'], ['LD','border_outer','Page Borders','pop:pageBorders']] }
  ] },
  { id:'layout', label:'Layout', groups:[
    { label:'Page Setup', launch:'marginsDialog', items:[['LD','margin','Margins','pop:margins'], ['LD','crop_rotate','Orientation','pop:orient'], ['LD','description','Size','pop:size'], ['LD','view_column','Columns','pop:columns'], ['C', [['SD','insert_page_break','Breaks','pop:breaks'], ['SD','wrap_text','Hyphenation','pop:hyphen']]]] },
    { label:'Paragraph', launch:'paraDialog', items:[['X', indentSpacing]] },
    { label:'Arrange', items:[['LD','wrap_text','Wrap Text','pop:wrap'], ['LD','align_horizontal_center','Align','pop:imgAlign'], ['L','rotate_right','Rotate','imgRotate']] }
  ] },
  { id:'refs', label:'References', groups:[
    { label:'Table of Contents', items:[['LD','toc','Table of Contents','pop:toc'], ['C', [['SD','playlist_add','Add Text','pop:addText'], ['S','refresh','Update Table','updateToc']]]] },
    { label:'Endnotes', items:[['L','notes','Insert Endnote','endnote',{ kbd:'Ctrl+Alt+D' }], ['C', [['S','arrow_downward','Next Endnote','nextNote']]]] },
    { label:'Citations & Bibliography', items:[['LD','format_quote','Insert Citation','pop:cite'], ['C', [['S','library_books','Manage Sources','sources'], ['S','list_alt','Bibliography','bibliography']]]] },
    { label:'Captions', items:[['LD','label','Insert Caption','pop:caption']] }
  ] },
  { id:'review', label:'Review', groups:[
    { label:'Proofing', items:[['L','edit_note','Editor','editor',{ kbd:'F7' }], ['L','spellcheck','Spelling','spell',{ state:'spell' }], ['L','123','Word Count','wordCount',{ kbd:'Ctrl+Shift+G' }]] },
    { label:'Speech', items:[['L','record_voice_over','Read Aloud','speak',{ state:'speak' }]] },
    { label:'Accessibility', items:[['L','accessibility_new','Check Accessibility','a11y']] },
    { label:'Comments', items:[['L','add_comment','New Comment','newComment'], ['C', [['S','delete','Delete','deleteComment'], ['S','navigate_before','Previous','prevComment'], ['S','navigate_next','Next','nextComment']]], ['C', [['S','forum','Show Comments','toggleComments',{ state:'showComments' }], ['S','delete_sweep','Delete All','deleteAllComments']]]] },
    { label:'Tracking', items:[['L','track_changes','Track Changes','toggleTrack',{ state:'track', kbd:'Ctrl+Shift+E' }], ['C', [['SD','visibility','Markup','pop:markup']]]] },
    { label:'Changes', items:[['LD','check','Accept','pop:accept'], ['LD','close','Reject','pop:reject'], ['C', [['S','arrow_upward','Previous','prevChange'], ['S','arrow_downward','Next','nextChange']]]] },
    { label:'Compare', items:[['L','compare','Compare','compare']] },
    { label:'Protect', items:[['L','lock','Restrict Editing','restrict',{ state:'restrict' }]] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Views', items:[['L','chrome_reader_mode','Immersive Reader','immersive'], ['L','menu_book','Read Mode','readMode'], ['L','description','Print Layout','printLayout',{ state:'printLayout' }], ['L','public','Web Layout','webLayout',{ state:'webLayout' }]] },
    { label:'Immersive', items:[['L','center_focus_strong','Focus','focus'], ['L','dark_mode','Switch Modes','darkpage',{ state:'darkpage' }]] },
    { label:'Show', items:[['C', [['SW','Ruler','toggleRuler'], ['SW','Gridlines','toggleGrid'], ['SW','Navigation Pane','toggleNav']]]] },
    { label:'Zoom', items:[['LD','zoom_in','Zoom','pop:zoom'], ['L','percent','100%','zoom100'], ['L','fit_screen','One Page','onePage'], ['L','width','Page Width','pageWidth']] },
    { label:'Personalize', items:[['L','palette','App Color','seed']] }
  ] },
  { id:'tdesign', label:'Table Design', ctx:'table', groups:[
    { label:'Table Style Options', items:[['C', [['SW','Header Row','tblHeader'], ['SW','Banded Rows','tblBanded'], ['SW','First Column','tblFirstCol']]]] },
    { label:'Table Styles', items:[['X', tableStyles]] },
    { label:'Shading & Borders', items:[['LD','format_color_fill','Shading','pop:shade'], ['LD','border_all','Borders','pop:tblBorders']] }
  ] },
  { id:'tlayout', label:'Table Layout', ctx:'table', groups:[
    { label:'Table', items:[['L','select_all','Select Table','tblSelect']] },
    { label:'Rows & Columns', items:[['LD','delete','Delete','pop:tblDelete'], ['C', [['S','arrow_upward','Insert Above','tblRowAbove'], ['S','arrow_downward','Insert Below','tblRowBelow']]], ['C', [['S','arrow_back','Insert Left','tblColLeft'], ['S','arrow_forward','Insert Right','tblColRight']]]] },
    { label:'Merge', items:[['L','call_merge','Merge Cells','tblMerge'], ['L','call_split','Split Cells','tblSplit']] },
    { label:'Cell Size', items:[['LD','fit_screen','AutoFit','pop:autofit'], ['L','view_column','Distribute Columns','tblDistribute']] },
    { label:'Alignment', items:[['C', [['R', [['I','format_align_left','Align Left','cellL'], ['I','format_align_center','Align Center','cellC'], ['I','format_align_right','Align Right','cellR']]], ['R', [['I','vertical_align_top','Align Top','cellT'], ['I','vertical_align_center','Align Middle','cellM'], ['I','vertical_align_bottom','Align Bottom','cellB']]]]]] },
    { label:'Data', items:[['LD','sort_by_alpha','Sort','pop:tblSort'], ['L','notes','Convert to Text','tblToText']] }
  ] },
  { id:'pformat', label:'Picture Format', ctx:'picture', groups:[
    { label:'Adjust', items:[['LD','tune','Color & Filters','pop:imgFilter'], ['L','swap_horiz','Change Picture','imgReplace'], ['L','restart_alt','Reset Picture','imgReset']] },
    { label:'Picture Styles', items:[['X', picStyles]] },
    { label:'Accessibility', items:[['L','short_text','Alt Text','altText']] },
    { label:'Arrange', items:[['LD','wrap_text','Wrap Text','pop:wrap'], ['LD','align_horizontal_center','Align','pop:imgAlign'], ['C', [['S','rotate_right','Rotate','imgRotate'], ['S','flip','Flip','imgFlip'], ['S','delete','Delete','imgDelete']]]] },
    { label:'Size', items:[['LD','photo_size_select_large','Size','pop:imgSize']] }
  ] },
  { id:'hftab', label:'Header & Footer', ctx:'hf', groups:[
    { label:'Header & Footer', items:[['LD','vertical_align_top','Header','pop:header'], ['LD','vertical_align_bottom','Footer','pop:footer'], ['LD','tag','Page Number','pop:pagenum']] },
    { label:'Insert', items:[['C', [['S','tag','Page Number','hfPage'], ['S','functions','Number of Pages','hfPages'], ['S','calendar_today','Date','hfDate']]], ['C', [['S','title','Document Title','hfTitle'], ['S','person','Author','hfAuthor']]]] },
    { label:'Options', items:[['C', [['SW','Different First Page','hfFirst']]]] },
    { label:'Close', items:[['L','close','Close Header and Footer','hfClose']] }
  ] }
];

/* ---------- state for toggles ---------- */
const tableOf = () => W.cell() && W.cell().closest('table');
const STATES = {
  marks:() => E.classList.contains('marks'), painter:() => !!W.painter, spell:() => E.spellcheck, speak:() => W.speaking,
  showComments:() => W.showComments, track:() => W.doc.track, restrict:() => W.doc.readonly,
  printLayout:() => !app.classList.contains('weblayout'), webLayout:() => app.classList.contains('weblayout'), darkpage:() => sheet.classList.contains('darkpage'),
  toggleRuler:() => !app.classList.contains('no-ruler'), toggleGrid:() => sheet.classList.contains('grid'), toggleNav:() => !$('#nav').hidden,
  tblHeader:() => { const t = tableOf(); return !!(t && t.rows[0] && t.rows[0].querySelector('th')); }, tblBanded:() => { const t = tableOf(); return !!(t && t.classList.contains('banded')); }, tblFirstCol:() => { const t = tableOf(); return !!(t && t.classList.contains('firstcol')); },
  hfFirst:() => W.doc.hf.first
};

/* ---------- actions ---------- */
Object.assign(A, {
  save:() => { if (W.save(true)) ONE.toast('Saved to this browser.'); else ONE.toast('This browser blocked storage, so the document could not be saved.'); },
  undo:W.undo, redo:W.redo,
  backstage:() => ONE.backstage.show('home'),
  collapseRibbon:() => ONE.ribbon.setScale(ONE.ribbon.scale || 1, !document.querySelector('.app').classList.contains('ribbon-min')),
  seed:b => ONE.seedMenu(b),
  shortcuts:() => shortcutsDialog(),
  cut:() => { W.restore(); if (!document.execCommand('cut')) ONE.toast('Press Ctrl+X to cut.'); W.changed(); },
  copy:() => { W.restore(); if (!document.execCommand('copy')) ONE.toast('Press Ctrl+C to copy.'); else ONE.toast('Copied.'); },
  painter:() => { if (W.painter) { W.painter = null; E.style.cursor = ''; } else { capturePainter(false); } ONE.ribbon.refresh(); },
  grow:() => W.stepSize(1), shrink:() => W.stepSize(-1),
  clearFormat:() => { W.exec('removeFormat'); W.applyInline({}, { clear:['fontFamily','fontSize','color','backgroundColor','textDecorationLine','textShadow','letterSpacing','fontVariant','textTransform'] }); },
  hilite:() => W.applyHi(W.hi), fore:() => W.applyFore(W.fore), shade:() => W.shade(),
  marks:() => W.marks(), find:() => W.openFind(), replace:() => W.replaceDialog(),
  fontDialog:() => W.fontDialog(), paraDialog:() => W.paraDialog(), marginsDialog:() => W.marginsDialog(),
  spell:() => { E.spellcheck = !E.spellcheck; E.blur(); E.focus({ preventScroll:true }); ONE.ribbon.refresh(); ONE.toast(E.spellcheck ? 'Spelling check is on. Misspelled words are underlined in red; right-click with Shift for suggestions.' : 'Spelling check is off.'); },
  wordCount:() => W.wordCountDialog(), a11y:() => W.a11yDialog(),
  deleteComment:() => W.deleteComment(), prevComment:() => W.stepComment(-1), nextComment:() => W.stepComment(1),
  toggleComments:() => { W.showComments = !W.showComments; W.renderComments(); ONE.ribbon.refresh(); },
  toggleTrack:() => { W.doc.track = !W.doc.track; W.syncTrack(); W.dirty(); ONE.toast(W.doc.track ? 'Track Changes is on. Your edits are marked for review.' : 'Track Changes is off.'); },
  prevChange:() => W.stepChange(-1), nextChange:() => W.stepChange(1),
  restrict:() => { W.doc.readonly = !W.doc.readonly; syncRO(); W.dirty(); ONE.toast(W.doc.readonly ? 'Editing restricted. The document is read-only.' : 'Editing allowed.'); },
  readMode:() => toggleRead(), printLayout:() => { app.classList.remove('weblayout'); W.applyLayout(); ONE.ribbon.refresh(); }, webLayout:() => { app.classList.add('weblayout'); W.applyLayout(); ONE.ribbon.refresh(); },
  focus:() => { app.classList.toggle('focus'); if (app.classList.contains('focus')) ONE.toast('Focus mode. Press Esc to exit.'); },
  darkpage:() => { sheet.classList.toggle('darkpage'); W._pagesSig = ''; W.schedule(); ONE.ribbon.refresh(); },
  toggleRuler:() => { app.classList.toggle('no-ruler'); ONE.ribbon.refresh(); }, toggleGrid:() => { sheet.classList.toggle('grid'); ONE.ribbon.refresh(); }, toggleNav:() => W.setNav($('#nav').hidden),
  zoom100:() => W.setZoom(1), onePage:() => { const [w, h] = W.dims(); W.setZoom(Math.min((W.canvas.clientWidth - 40) / w, (W.canvas.clientHeight - 60) / h)); }, pageWidth:() => W.setZoom(W.fitWidth()),
  zoomIn:() => W.setZoom(W.zoom + .1), zoomOut:() => W.setZoom(W.zoom - .1), zoomPop:b => P.zoom(b),
  resetDesign:() => { Object.assign(W.doc.design, { set:'office', colors:'office', spacing:'default', pageColor:'', watermark:'', border:'' }); W.applyDesign(); W.changed({ history:false }); $$('.sset').forEach(s => s.classList.toggle('on', s.dataset.set === 'office')); syncGalleryVars(); },
  tblHeader:() => W.tblToggle('header'), tblBanded:() => W.tblToggle('banded'), tblFirstCol:() => W.tblToggle('firstcol'),
  cellL:() => W.cellAlign('left'), cellC:() => W.cellAlign('center'), cellR:() => W.cellAlign('right'), cellT:() => W.cellAlign(null, 'top'), cellM:() => W.cellAlign(null, 'middle'), cellB:() => W.cellAlign(null, 'bottom'),
  hfPage:() => A.hfField('page'), hfPages:() => A.hfField('numpages'), hfDate:() => A.hfField('date'), hfTitle:() => A.hfField('title'), hfAuthor:() => A.hfField('author'),
  hfFirst:() => { W.doc.hf.first = !W.doc.hf.first; W.dirty(); ONE.ribbon.refresh(); }, hfClose:() => W.hfClose(),
  toggleNavPane:() => W.setNav($('#nav').hidden),
  editor:() => W.editorPane(), compare:() => W.compareDialog(), goTo:() => W.goToDialog(),
  immersive:() => { if (!app.classList.contains('readmode')) toggleRead(); app.classList.add('ir-lf-1'); ONE.toast('Immersive Reader: use the controls at the top to change column width, colors, spacing and line focus.'); },
  apps:b => ONE.appSwitcher(b)
});
P.paste = a => ONE.menuAt(a, [{ title:'Paste Options' }, { label:'Keep Source Formatting', icon:'content_paste', kbd:'Ctrl+V', on:() => ONE.toast('Press Ctrl+V (⌘V) to paste. Browsers only let pages read the clipboard from the keyboard.') }, { label:'Keep Text Only', icon:'content_paste_go', kbd:'Ctrl+Shift+V', on:() => { W.pastePlain = true; ONE.toast('Now press Ctrl+V. The next paste will be plain text.'); } }]);
P.styles = a => ONE.menuAt(a, [...W.STYLES.map(([k, n, css]) => ({ html:`<span style="${css};font-family:${k.startsWith('h') ? W.STYLESETS[W.doc.design.set].head : W.STYLESETS[W.doc.design.set].body};--hc:${W.THEMECOLORS[W.doc.design.colors].h};--hc3:${W.THEMECOLORS[W.doc.design.colors].h3};color:${/color/.test(css) ? '' : 'inherit'}">${esc(n)}</span>`, on:() => W.setStyle(k) })), '-',
  { label:'Clear Formatting', icon:'format_clear', on:A.clearFormat }]);
P.select = a => ONE.menuAt(a, [{ label:'Select All', icon:'select_all', kbd:'Ctrl+A', on:() => W.exec('selectAll') }, { label:'Select Paragraph', icon:'segment', on:() => { const b = W.block(); if (!b) return; const r = document.createRange(); r.selectNodeContents(b); W.select(r); } }, { label:'Select Text with Similar Formatting', icon:'format_paint', on:selectSimilar }]);
P.zoom = a => { const i = ONE.input({ type:'number', value:Math.round(W.zoom * 100), min:10, max:500, style:{ width:'90px', height:'36px' } });
  const f = el('form', { class:'row', style:{ padding:'6px 10px 10px', gap:'8px' } }, el('span', { class:'muted', text:'Percent' }), i, el('button', { class:'btn tonal', type:'submit', text:'Apply' }));
  f.onsubmit = e => { e.preventDefault(); ONE.pop.close(); W.setZoom((parseFloat(i.value) || 100) / 100); };
  ONE.pop.open(a, el('div', {}, ONE.menu([...[200, 150, 100, 75, 50].map(z => ({ label:z + '%', checked:Math.round(W.zoom * 100) === z, on:() => W.setZoom(z / 100) })), '-', { label:'Page width', icon:'width', on:A.pageWidth }, { label:'One page', icon:'fit_screen', on:A.onePage }]), f), { noFocus:true }); };
function selectSimilar(){
  const n = W.saved && (W.saved.startContainer.nodeType === 3 ? W.saved.startContainer.parentElement : W.saved.startContainer); if (!n) return;
  const cs = getComputedStyle(n), key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.color].join('|');
  const ranges = []; const w = document.createTreeWalker(E, NodeFilter.SHOW_TEXT);
  for (let t; (t = w.nextNode());) { if (!t.data.trim()) continue; const c = getComputedStyle(t.parentElement); if ([c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.color].join('|') === key) { const r = document.createRange(); r.selectNodeContents(t); ranges.push(r); } }
  W.matches = ranges; W.curMatch = -1; W.paintMatches(); ONE.toast(`${ranges.length} places use this formatting (highlighted).`);
}

/* format painter */
function capturePainter(sticky){
  W.restore(); const s = getSelection(); if (!s.rangeCount) return;
  const n = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode, cs = getComputedStyle(n);
  W.painter = { sticky, st:{ fontFamily:cs.fontFamily, fontSize:(parseFloat(cs.fontSize) * .75) + 'pt', fontWeight:cs.fontWeight, fontStyle:cs.fontStyle, color:cs.color, textDecorationLine:cs.textDecorationLine, backgroundColor:cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : cs.backgroundColor } };
  E.style.cursor = 'copy'; ONE.ribbon.refresh();
}
document.addEventListener('dblclick', e => { if (e.target.closest('[data-act="painter"]')) { capturePainter(true); ONE.toast('Format Painter is locked on. Press Esc to stop.'); } });
E.addEventListener('mouseup', () => {
  if (!W.painter) return;
  setTimeout(() => { const s = getSelection(); if (s.isCollapsed) return; const p = W.painter; W.saved = s.getRangeAt(0).cloneRange(); W.applyInline(p.st); if (!p.sticky) { W.painter = null; E.style.cursor = ''; } ONE.ribbon.refresh(); });
});

/* views */
function syncRO(){ const ro = W.doc.readonly || W.doc.final; E.contentEditable = String(!ro && !app.classList.contains('readmode')); $('#roInfo').hidden = !ro; $('#roInfo').lastChild.textContent = W.doc.final ? 'Marked as Final' : 'Read-only'; ONE.ribbon.refresh(); }
W.syncRO = syncRO;
function toggleRead(){
  const on = !app.classList.contains('readmode');
  app.classList.toggle('readmode', on); $('#readbar').hidden = !on; $('#readTitle').textContent = $('#docTitle').value;
  if (on) { W.hfClose(true); W.selectImg(null); }
  syncRO(); W.applyLayout(); W.canvas.scrollTop = 0;
}

/* ---------- run dispatcher ---------- */
const run = (act, b, e) => {
  if (!act) return;
  if (act.startsWith('cmd:')) return W.exec(act.slice(4));
  if (act.startsWith('pop:')) { const p = P[act.slice(4)]; return p ? p(b) : null; }
  const f = A[act]; if (f) f(b, e); else console.warn('Unknown action', act);
};
W.run = run;
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES });
$('#barFore').style.background = W.fore; $('#barHi').style.background = W.hi;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return;
  if (b.closest('.titlebar,.status,.nav,.readbar,.minibar')) run(b.dataset.act, b, e);
});
$('.qat').addEventListener('mousedown', e => e.preventDefault());
$('#minibar').addEventListener('mousedown', e => e.preventDefault());

/* ---------- search box ---------- */
ONE.commandSearch($('#topSearch'), { run, docSearch:q => W.openFind(q) });

/* ---------- title, zoom ---------- */
$('#docTitle').addEventListener('input', () => { W._pagesSig = ''; W.dirty(); });
$('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); E.focus(); } });
$('#zoomRange').addEventListener('input', e => W.setZoom(e.target.value / 100));
W.canvas.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); W.setZoom(W.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive:false });
const fitIfSmall = () => { const f = W.fitWidth(); if (f < 1) W.setZoom(f); };
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (W.fitWidth() < W.zoom) fitIfSmall(); W.schedule(); }, 150); });

/* ---------- editor events ---------- */
E.addEventListener('input', e => W.changed({ kind:/^(insertText|deleteContent|insertCompositionText)/.test(e.inputType || '') ? 'type' : 'cmd' }));
sheet.addEventListener('input', e => { if (e.target.closest('.hf.editing')) W.dirty(); });
E.addEventListener('click', e => {
  const a = e.target.closest('a[href]:not(.bm)');
  if (a && (e.ctrlKey || e.metaKey)) { const h = a.getAttribute('href'); if (h.startsWith('#')) { const t = document.getElementById(h.slice(1)); t && t.scrollIntoView({ block:'center', behavior:'smooth' }); } else { const x = el('a', { href:a.href, target:'_blank', rel:'noopener' }); x.click(); } }
});
E.addEventListener('mouseover', e => { const a = e.target.closest('a[href]:not(.bm)'); if (a) a.title = `${a.getAttribute('href')}\nCtrl+Click to follow link`; });
E.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault(); const c = W.cell();
    if (c) { const cells = $$('td,th', c.closest('table')); let i = cells.indexOf(c) + (e.shiftKey ? -1 : 1); if (i >= cells.length) { A.tblRowBelow(); i = cells.length; } const nc = $$('td,th', c.closest('table'))[Math.max(0, i)]; const r = document.createRange(); r.selectNodeContents(nc); W.select(r); return; }
    const b = W.block();
    if (b && b.tagName === 'LI') W.exec(e.shiftKey ? 'outdent' : 'indent'); else if (!e.shiftKey) { W.doc.track ? W.trackedInsert('\t') : document.execCommand('insertText', false, '\t'); W.changed({ kind:'type' }); }
  }
});

/* ---------- mini toolbar ---------- */
const mini = $('#minibar');
mini.innerHTML = [['text_decrease','Decrease Font Size','shrink'],['text_increase','Increase Font Size','grow'],'|',['format_bold','Bold','cmd:bold'],['format_italic','Italic','cmd:italic'],['format_underlined','Underline','cmd:underline'],['ink_highlighter','Highlight','hilite'],['format_color_text','Font Color','pop:fore'],'|',['format_list_bulleted','Bullets','cmd:insertUnorderedList'],['format_list_numbered','Numbering','cmd:insertOrderedList'],['style','Styles','pop:styles'],'|',['add_comment','New Comment','newComment'],['link','Link','pop:link']]
  .map(x => x === '|' ? '<span class="sep"></span>' : `<button class="rb icon" data-act="${x[2]}" title="${x[1]}" aria-label="${x[1]}">${icon(x[0])}</button>`).join('');
const hideMini = () => { mini.hidden = true; };
E.addEventListener('mouseup', e => {
  if (!W.settings.miniToolbar || W.isRO() || W.painter || e.button !== 0) return;
  setTimeout(() => { const s = getSelection(); if (s.isCollapsed || !E.contains(s.anchorNode) || W.selImg) return hideMini(); const r = s.getRangeAt(0).getBoundingClientRect(); mini.hidden = false; const w = mini.offsetWidth; mini.style.left = ONE.clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px'; mini.style.top = Math.max(8, r.top - 54) + 'px'; }, 10);
});
document.addEventListener('keydown', hideMini, true);
document.addEventListener('mousedown', e => { if (!mini.contains(e.target)) hideMini(); }, true);
W.canvas.addEventListener('scroll', hideMini, { passive:true });
mini.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.dataset.act.startsWith('pop:')) setTimeout(hideMini, 150); });

/* ---------- context menu ---------- */
E.addEventListener('contextmenu', e => {
  if (e.shiftKey) return;
  e.preventDefault(); W.saved = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : W.saved;
  const c = W.cell(), img = e.target.closest('img'), link = e.target.closest('a[href]:not(.bm)'), cm = e.target.closest('span.cmt');
  if (img) W.selectImg(img);
  const items = [
    { label:'Cut', icon:'content_cut', kbd:'Ctrl+X', on:A.cut }, { label:'Copy', icon:'content_copy', kbd:'Ctrl+C', on:A.copy }, { label:'Paste', icon:'content_paste', kbd:'Ctrl+V', on:() => ONE.toast('Press Ctrl+V (⌘V) to paste.') }, '-',
    ...(img ? [{ label:'Alt Text…', icon:'short_text', on:A.altText }, { label:'Wrap Text', icon:'wrap_text', on:() => P.wrap({ x:e.clientX, y:e.clientY }) }, { label:'Change Picture…', icon:'swap_horiz', on:A.imgReplace }, { label:'Delete Picture', icon:'delete', on:A.imgDelete }, '-'] : []),
    ...(c ? [{ label:'Insert Row Above', icon:'arrow_upward', on:A.tblRowAbove }, { label:'Insert Row Below', icon:'arrow_downward', on:A.tblRowBelow }, { label:'Insert Column Right', icon:'arrow_forward', on:A.tblColRight }, { label:'Delete Row', icon:'table_rows', on:A.tblDelRow }, { label:'Delete Column', icon:'view_column', on:A.tblDelCol }, { label:'Delete Table', icon:'delete', danger:true, on:A.tblDelTable }, '-'] : []),
    ...(link ? [{ label:'Open Link', icon:'open_in_new', on:() => { const x = el('a', { href:link.href, target:'_blank', rel:'noopener' }); x.click(); } }, { label:'Edit Link…', icon:'link', on:() => P.link({ x:e.clientX, y:e.clientY }) }, { label:'Remove Link', icon:'link_off', on:() => { const r = document.createRange(); r.selectNodeContents(link); W.saved = r; W.exec('unlink'); } }, '-'] : [{ label:'Link…', icon:'link', kbd:'Ctrl+K', on:() => P.link({ x:e.clientX, y:e.clientY }) }]),
    cm ? { label:'Delete Comment', icon:'comments_disabled', on:() => W.deleteComment(cm.dataset.c) } : { label:'New Comment', icon:'add_comment', kbd:'Ctrl+Alt+M', on:A.newComment },
    { label:'Font…', icon:'text_format', kbd:'Ctrl+D', on:A.fontDialog }, { label:'Paragraph…', icon:'format_textdirection_l_to_r', on:A.paraDialog },
    { label:'Search the document for this', icon:'search', on:() => W.openFind(getSelection().toString() || undefined) }, '-',
    { label:'Spelling suggestions: Shift+right-click', icon:'spellcheck', disabled:true }
  ];
  ONE.menuAt({ x:e.clientX, y:e.clientY }, items);
});

/* ---------- keyboard ---------- */
function shortcutsDialog(){
  const list = [['Save','Ctrl+S'],['Undo / Redo','Ctrl+Z / Ctrl+Y'],['Bold / Italic / Underline','Ctrl+B / I / U'],['Double underline','Ctrl+Shift+D'],['Small caps / All caps','Ctrl+Shift+K / A'],['Font dialog','Ctrl+D'],['Grow / shrink font','Ctrl+] / Ctrl+['],['Clear character formatting','Ctrl+Space'],['Heading 1 / 2 / 3','Ctrl+Alt+1 / 2 / 3'],['Normal style','Ctrl+Shift+N'],['Bullets','Ctrl+Shift+L'],['Align left / center / right / justify','Ctrl+L / E / R / J'],['Line spacing 1 / 1.5 / 2','Ctrl+1 / 5 / 2'],['Indent / outdent','Ctrl+M / Ctrl+Shift+M'],['Copy / paste formatting','Ctrl+Shift+C / V'],['Page break','Ctrl+Enter'],['Link','Ctrl+K'],['Comment','Ctrl+Alt+M'],['Endnote','Ctrl+Alt+D'],['Find / Replace','Ctrl+F / Ctrl+H'],['Track changes','Ctrl+Shift+E'],['Word count','Ctrl+Shift+G'],['Change case','Shift+F3'],['Spelling on/off','F7'],['Save As','F12'],['Search commands','Alt+Q'],['Zoom','Ctrl+scroll'],['Print preview','Ctrl+P']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:520, body:`<div class="kbdlist">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}
let caseIdx = 0;
document.addEventListener('keydown', e => {
  if (ONE.topModal() || ONE.backstage.isOpen()) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); A.save(); } return; }
  const inField = e.target.matches('input,textarea,select') && !e.target.closest('.ccard');
  if (e.key === 'F1') { e.preventDefault(); return shortcutsDialog(); }
  if (e.key === 'F7') { e.preventDefault(); return W.editorPane(); }
  if (e.key === 'F12') { e.preventDefault(); return ONE.backstage.show('saveas'); }
  if (e.shiftKey && e.key === 'F3') { e.preventDefault(); const c = [2, 1, 3][caseIdx++ % 3]; return W.changeCase([t => t.toUpperCase(), t => t.toLowerCase(), t => t.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())][c - 1]); }
  if (e.key === 'Escape') { if (W.painter) { W.painter = null; E.style.cursor = ''; ONE.ribbon.refresh(); return; } if (W.hfEditing) return W.hfClose(); if (app.classList.contains('readmode')) return toggleRead(); if (app.classList.contains('focus')) return app.classList.remove('focus'); if (W.selImg) return W.selectImg(null); }
  if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'q') { e.preventDefault(); return $('#topSearch').focus(); }
  const mod = e.ctrlKey || e.metaKey; if (!mod) return;
  const k = e.key.toLowerCase(), inEd = !!W.hostOf(document.activeElement) || document.activeElement === E;
  if (inField && !['s','p','o','n'].includes(k)) return;
  const map = {
    s:() => A.save(), o:() => ONE.backstage.show('open'), n:() => ONE.backstage.show('home'), p:() => ONE.backstage.show('print'),
    z:() => e.shiftKey ? W.redo() : W.undo(), y:() => W.redo(),
    f:() => W.openFind(), h:() => W.replaceDialog(), g:() => e.shiftKey ? W.wordCountDialog() : W.goToDialog(),
    k:() => inEd && e.shiftKey ? W.applyInline({ fontVariant:'small-caps' }) : inEd && P.link({ x:Math.max(8, innerWidth / 2 - 170), y:180 }),
    d:() => inEd && (e.shiftKey ? W.applyInline({ textDecorationLine:'underline', textDecorationStyle:'double' }) : e.altKey ? A.endnote() : W.fontDialog()),
    a:() => inEd && e.shiftKey ? W.applyInline({ textTransform:'uppercase' }) : (inEd && W.exec('selectAll')),
    e:() => inEd && (e.shiftKey ? A.toggleTrack() : W.exec('justifyCenter')), l:() => inEd && (e.shiftKey ? W.exec('insertUnorderedList') : W.exec('justifyLeft')), r:() => inEd && W.exec('justifyRight'), j:() => inEd && W.exec('justifyFull'),
    m:() => inEd && (e.altKey ? A.newComment() : W.exec(e.shiftKey ? 'outdent' : 'indent')),
    n2:null,
    enter:() => inEd && A.pageBreak(), ']':() => inEd && W.stepSize(1), '[':() => inEd && W.stepSize(-1), '>':() => inEd && W.stepSize(1), '<':() => inEd && W.stepSize(-1),
    '=':() => inEd && W.exec(e.shiftKey ? 'superscript' : 'subscript'), '+':() => inEd && W.exec('superscript'),
    ' ':() => inEd && A.clearFormat(), '*':() => W.marks(),
    '1':() => inEd && (e.altKey ? W.setStyle('h1') : W.lineSpacing(1)), '2':() => inEd && (e.altKey ? W.setStyle('h2') : W.lineSpacing(2)), '3':() => inEd && e.altKey && W.setStyle('h3'), '5':() => inEd && W.lineSpacing(1.5),
    '8':() => e.shiftKey && W.marks(), c:() => { if (inEd && e.shiftKey) { capturePainter(false); ONE.toast('Formatting copied. Select text and press Ctrl+Shift+V.'); } else return 'native'; },
    v:() => { if (inEd && e.shiftKey && W.painter) { const s = getSelection(); if (!s.isCollapsed) { W.saved = s.getRangeAt(0).cloneRange(); W.applyInline(W.painter.st); } W.painter = null; E.style.cursor = ''; } else if (e.shiftKey) { W.pastePlain = true; return 'native'; } else return 'native'; },
    x:() => 'native', b:() => 'native', i:() => 'native', u:() => 'native', q:() => inEd && W.forBlocks(b => { b.removeAttribute('style'); })
  };
  if (e.shiftKey && k === 'n' && inEd) { e.preventDefault(); return W.setStyle('p'); }
  const f = map[k]; if (!f) return;
  const r = f(); if (r !== 'native') e.preventDefault();
});

/* ---------- File backstage ---------- */
const TEMPLATES = {
  blank:{ name:'Blank document', title:'Document', html:'<p><br></p>' },
  sample:{ name:'Garden plan', desc:'Sample with a table, list and comment', title:'Spring Planting Plan', build:() => ({
    html:`<h1 class="title">Riverside Community Garden</h1><p class="subtitle">SPRING PLANTING PLAN · MARCH 14 VOLUNTEER MEETING</p><h1>Overview</h1><p>This season we are expanding from <b>24 to 32 raised beds</b> along the east fence, thanks to the lumber donated by Hartwell Hardware. The average last frost for our zone (7a) falls around <span style="background-color:#ffff00">April 15</span>, so cold-hardy crops go in first and tender transplants wait until early May.</p><p>Everything below is a draft. Bring changes to the meeting, or leave a comment in this file before Friday.</p><h2>Goals for the season</h2><ul><li>Build and fill the eight new beds by March 28.</li><li>Start a shared herb bed next to the tool shed.</li><li>Donate at least <span class="cmt" data-c="c1"><b>300 lb</b></span> of produce to the Eastside Food Pantry.</li><li>Run two beginner workshops: seed starting (April) and pest control (June).</li></ul><h1>Planting schedule</h1><table class="t-accent"><tbody><tr><th>Crop</th><th>Bed(s)</th><th>Sow / transplant</th><th>First harvest</th></tr><tr><td>Snap peas</td><td>3, 4</td><td>Mar 20 (direct sow)</td><td>Late May</td></tr><tr><td>Spinach</td><td>5</td><td>Mar 25 (direct sow)</td><td>Early May</td></tr><tr><td>Tomatoes</td><td>12–15</td><td>May 1 (transplant)</td><td>Mid July</td></tr><tr><td>Basil</td><td>Herb bed</td><td>May 8 (transplant)</td><td>June</td></tr></tbody></table><p class="caption"><span class="capnum" data-kind="Table" contenteditable="false">Table 1</span>: Spring planting schedule</p><h2>Volunteer shifts</h2><ol><li><b>Saturday mornings, 8–11 am:</b> watering, weeding and the harvest log.</li><li><b>Wednesday evenings, 6–8 pm:</b> bed maintenance and compost turning.</li><li><b>First Sunday of the month:</b> <span style="color:#c00000">tool check and shed clean-up.</span></li></ol><blockquote>The best time to plant a tree was twenty years ago. The second best time is now.</blockquote><h3>Next steps</h3><p>Confirm bed assignments by email after the meeting, and sign up for at least one shift a month on the board by the gate.</p>`,
    comments:{ c1:{ text:'Last year we hit 240 lb. Is 300 realistic with 8 more beds?', author:'Priya', t:Date.now() - 36e5 * 5, resolved:false, replies:[{ author:'Jordan', text:'Yes if the tomatoes do well. Keep it.', t:Date.now() - 36e5 }] } },
    hf:{ header:'<p style="text-align:right"><span class="fld" data-f="title" contenteditable="false">#</span></p>', footer:'<p style="text-align:center">Page <span class="fld" data-f="page" contenteditable="false">#</span> of <span class="fld" data-f="numpages" contenteditable="false">#</span></p>', first:false } }) },
  report:{ name:'Report', desc:'Cover page, contents, headings', title:'Quarterly Operations Report', build:() => ({
    html:`<div class="cover cv-band"><p class="cv-kicker">Q3 2026</p><p class="cv-title">Quarterly Operations Report</p><p class="cv-sub">Riverside Community Garden</p><p class="cv-meta">Prepared by the steering committee</p></div><div class="pgbreak" contenteditable="false"></div><div class="toc" contenteditable="false" data-title="Contents"></div><h1>Summary</h1><p>The garden had its best quarter yet. Harvest weight was up 31% on the same quarter last year, volunteer hours held steady, and two new beds opened for school groups.</p><h2>Highlights</h2><ul><li>1,240 lb harvested, 410 lb donated.</li><li>62 active volunteers logged 780 hours.</li><li>Water use fell 12% after the drip-line upgrade.</li></ul><h1>Finances</h1><p>Spending stayed within budget. The largest item was irrigation parts.</p><table><tbody><tr><th>Category</th><th>Budget</th><th>Actual</th></tr><tr><td>Irrigation</td><td>$1,200</td><td>$1,085</td></tr><tr><td>Seeds &amp; plants</td><td>$650</td><td>$702</td></tr><tr><td>Tools</td><td>$300</td><td>$214</td></tr></tbody></table><h1>Next quarter</h1><h2>Priorities</h2><ol><li>Winterize beds and cover crops by November 15.</li><li>Recruit a volunteer lead for the compost program.</li></ol>`,
    hf:{ header:'', footer:'<p style="display:flex;justify-content:space-between"><span class="fld" data-f="title" contenteditable="false">#</span><span>Page <span class="fld" data-f="page" contenteditable="false">#</span></span></p>', first:true } }) },
  letter:{ name:'Letter', desc:'Formal letter', title:'Letter', build:() => ({ html:`<p style="text-align:right">14 Alder Lane<br>Riverside, OR 97401</p><p style="text-align:right">${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</p><p><br></p><p>Ms. Dana Alvarez<br>Hartwell Hardware<br>220 Main Street<br>Riverside, OR 97401</p><p>Dear Ms. Alvarez,</p><p>Thank you for donating lumber to the Riverside Community Garden. Your gift lets us build eight new raised beds this spring, which means room for about twenty more families to grow their own food.</p><p>We would love to have you at our opening day on April 18 at 10 am.</p><p>Sincerely,</p><div class="sigline"><div class="sig-x">X</div><p>Jordan Lee</p><p>Garden Coordinator</p></div>` }) },
  resume:{ name:'Resume', desc:'Clean one-page resume', title:'Resume', build:() => ({ html:`<h1 class="title">Jordan Lee</h1><p class="subtitle">GARDEN COORDINATOR · RIVERSIDE, OR · JORDAN@EXAMPLE.COM</p><h1>Experience</h1><h3>Garden Coordinator, Riverside Community Garden</h3><p class="nospace"><i>2021 – present</i></p><ul><li>Grew the garden from 12 to 32 beds and 60+ active volunteers.</li><li>Raised $18,000 in grants for irrigation and accessibility upgrades.</li></ul><h3>Program Assistant, Eastside Food Pantry</h3><p class="nospace"><i>2018 – 2021</i></p><ul><li>Coordinated weekly distribution for 300 households.</li></ul><h1>Education</h1><p><b>B.S. Environmental Science</b>, Oregon State University, 2018</p><h1>Skills</h1><p>Volunteer management · Grant writing · Composting systems · Spanish (conversational)</p>` }) },
  minutes:{ name:'Meeting minutes', desc:'Attendees, agenda, actions', title:'Meeting Minutes', build:() => ({ html:`<h1 class="title">Meeting Minutes</h1><p class="subtitle">STEERING COMMITTEE · ${new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' }).toUpperCase()}</p><h2>Attendees</h2><p>Jordan Lee (chair), Priya Nair, Sam Ortiz, Dana Alvarez</p><h2>Agenda</h2><ol><li>Spring planting schedule</li><li>Tool shed repairs</li><li>Volunteer appreciation event</li></ol><h2>Action items</h2><table class="t-list"><tbody><tr><th>Action</th><th>Owner</th><th>Due</th></tr><tr><td>Order drip-line parts</td><td>Sam</td><td>Mar 20</td></tr><tr><td>Get quotes for shed roof</td><td>Priya</td><td>Mar 27</td></tr></tbody></table>` }) },
  flyer:{ name:'Event flyer', desc:'Big headline, centered', title:'Flyer', build:() => ({ html:`<p style="text-align:center"><span style="font-size:48pt;font-weight:700;color:#4472c4;text-shadow:1px 1px 0 #2f5496,2px 2px 0 #2f5496,3px 3px 0 #1f3763">Opening Day</span></p><p style="text-align:center"><span style="font-size:20pt;color:#ed7d31">Riverside Community Garden</span></p><p style="text-align:center"><img class="shape" alt="Star" src="${'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(W.shapeSVG('Star', '#FFC000'))}" style="width:1.6in"></p><p style="text-align:center"><span style="font-size:16pt"><b>Saturday, April 18 · 10 am – 2 pm</b></span></p><p style="text-align:center"><span style="font-size:14pt">Seedling swap · Kids’ planting table · Free coffee</span></p>`, design:{ border:'art' } }) }
};
const tplThumb = k => ({ blank:'', sample:'<i style="height:9px;width:70%;background:#222"></i><i style="width:50%"></i><i style="height:6px;width:40%;background:#2f5496;margin-top:8px"></i><i></i><i></i><i style="width:80%"></i><i style="height:22px;background:#4472c4;margin-top:6px"></i>', report:'<i style="height:14px;background:#4472c4;margin:-18px -14px 18px"></i><i style="height:12px;width:80%;background:#222"></i><i style="width:60%"></i>', letter:'<i style="width:40%;margin-left:auto"></i><i style="width:30%;margin-left:auto"></i><i style="width:50%;margin-top:14px"></i><i></i><i></i><i style="width:70%"></i>', resume:'<i style="height:10px;width:60%;background:#222"></i><i style="width:80%"></i><i style="height:5px;width:35%;background:#2f5496;margin-top:8px"></i><i></i><i style="width:85%"></i><i style="height:5px;width:35%;background:#2f5496;margin-top:8px"></i><i></i>', minutes:'<i style="height:9px;width:60%;background:#222"></i><i style="width:45%"></i><i style="height:5px;width:30%;background:#2f5496;margin-top:8px"></i><i></i><i style="height:20px;margin-top:8px;background:repeating-linear-gradient(#cfcfcf 0 4px,#fff 4px 8px)"></i>', flyer:'<i style="height:16px;width:80%;align-self:center;background:#4472c4;margin-top:14px"></i><i style="width:50%;align-self:center;background:#ed7d31"></i><i style="width:36px;height:36px;border-radius:50%;align-self:center;background:#ffc000;margin:10px 0"></i><i style="width:60%;align-self:center"></i>' }[k] || '');
W.fromTemplate = k => {
  const t = TEMPLATES[k], b = t.build ? t.build() : { html:t.html };
  const d = W.newDoc(b.html, t.title); if (b.comments) d.comments = b.comments; if (b.hf) d.hf = b.hf; if (b.design) Object.assign(d.design, b.design);
  return d;
};
const openDoc = d => { if (W.doc && W.doc.id) W.save(false); W.open(d); postOpen(); ONE.backstage.close(); };
function postOpen(){ $$('.toc', E).forEach(t => { if (!t.querySelector('a,p')) W.buildToc(t); }); W.syncTrack(); syncRO(); syncGalleryVars(); $$('.sset').forEach(s => s.classList.toggle('on', s.dataset.set === W.doc.design.set)); W.renderComments(); requestAnimationFrame(() => W.changed({ history:false })); }
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });

function mdToHtml(md){
  const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`(.+?)`/g, '<span style="font-family:Consolas,monospace">$1</span>').replace(/\[(.+?)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null;
  md.split(/\r?\n/).forEach(l => {
    let m;
    if ((m = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)/))) { const t = /\d/.test(m[1]) ? 'ol' : 'ul'; if (list !== t) { if (list) out.push(`</${list}>`); out.push(`<${t}>`); list = t; } out.push(`<li>${inl(m[2])}</li>`); return; }
    if (list) { out.push(`</${list}>`); list = null; }
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`);
    else if (/^>\s?/.test(l)) out.push(`<blockquote>${inl(l.replace(/^>\s?/, ''))}</blockquote>`);
    else if (/^(-{3,}|\*{3,})$/.test(l.trim())) out.push('<hr>');
    else if (l.trim()) out.push(`<p>${inl(l)}</p>`);
  });
  if (list) out.push(`</${list}>`); return out.join('') || '<p><br></p>';
}
function htmlToMd(root){
  const walk = n => {
    if (n.nodeType === 3) return n.data.replace(/​/g, '');
    if (n.nodeType !== 1 || n.matches('del.tc,.toc,.pgbreak,.fnref')) return '';
    const kids = [...n.childNodes].map(walk).join(''), t = n.tagName;
    if (/^H[1-4]$/.test(t)) return '\n' + '#'.repeat(n.classList.contains('title') ? 1 : +t[1]) + ' ' + kids.trim() + '\n';
    if (t === 'P' || t === 'DIV') return kids.trim() ? kids.trim() + '\n\n' : '';
    if (t === 'B' || t === 'STRONG') return `**${kids}**`; if (t === 'I' || t === 'EM') return `*${kids}*`;
    if (t === 'A') return `[${kids}](${n.getAttribute('href')})`;
    if (t === 'LI') return (n.parentElement.tagName === 'OL' ? ([...n.parentElement.children].indexOf(n) + 1) + '. ' : '- ') + kids.trim() + '\n';
    if (t === 'UL' || t === 'OL') return kids + '\n'; if (t === 'BLOCKQUOTE') return '> ' + kids.trim() + '\n\n'; if (t === 'HR') return '\n---\n';
    if (t === 'TR') return '| ' + [...n.cells].map(c => c.textContent.trim()).join(' | ') + ' |\n' + (n.rowIndex === 0 ? '|' + ' --- |'.repeat(n.cells.length) + '\n' : '');
    if (t === 'TABLE') return '\n' + [...n.rows].map(walk).join('') + '\n';
    if (t === 'BR') return '\n';
    return kids;
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function standaloneHTML(){
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc($('#docTitle').value)}</title><style>body{font-family:Calibri,Carlito,sans-serif;font-size:11pt;line-height:1.3;max-width:6.5in;margin:1in auto;color:#000}h1,h2,h3{color:#2f5496;font-weight:400}h1.title{font-size:28pt;color:#000}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:2pt 5pt;text-align:left}img{max-width:100%}.toc a{display:flex;color:inherit;text-decoration:none}.toc .dots{flex:1}</style></head><body>\n${W.cleanHTML()}\n</body></html>`;
}
async function loadMammoth(){
  if (window.mammoth) return window.mammoth;
  for (const v of ['1.8.0', '1.6.0']) {
    try { await new Promise((ok, bad) => { const s = el('script', { src:`https://cdnjs.cloudflare.com/ajax/libs/mammoth/${v}/mammoth.browser.min.js` }); s.onload = ok; s.onerror = bad; document.head.append(s); }); if (window.mammoth) return window.mammoth; } catch {}
  }
  throw new Error('mammoth');
}
$('#openInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const name = f.name.replace(/\.[^.]+$/, '');
  try {
    let html;
    if (/\.docx$/i.test(f.name)) { ONE.toast('Opening Word document…'); const m = await loadMammoth(); const r = await m.convertToHtml({ arrayBuffer:await f.arrayBuffer() }); html = W.sanitize(r.value); }
    else { const text = await f.text(); html = /\.html?$/i.test(f.name) ? W.sanitize(text) : /\.(md|markdown)$/i.test(f.name) ? mdToHtml(text) : text.split(/\r?\n/).map(l => `<p>${esc(l) || '<br>'}</p>`).join(''); }
    openDoc(W.newDoc(html || '<p><br></p>', name)); ONE.toast(`Opened ${f.name}.`);
  } catch (err) { ONE.toast(/\.docx$/i.test(f.name) ? 'Couldn’t read that .docx file. Try saving it as Web Page (.htm) in Word first.' : 'Couldn’t open that file.'); }
});

ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => {
    const hr = new Date().getHours();
    const search = el('input', { placeholder:'Search your documents', 'aria-label':'Search your documents' });
    b.append(el('div', { class:'home-hero' }, el('h1', { text:(hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') }), el('label', { class:'home-search', html:icon('search') }, search)));
    b.append(el('h3', { text:'Start something new' }));
    const g = el('div', { class:'tpl' });
    Object.entries(TEMPLATES).forEach(([k, t]) => g.append(el('button', { class:'tpl-card', html:`<div class="thumb">${tplThumb(k)}</div><span>${esc(t.name)}${t.desc ? `<small><br>${esc(t.desc)}</small>` : ''}</span>`, onclick:() => { openDoc(W.fromTemplate(k)); ONE.toast(`New ${t.name.toLowerCase()} created.`); } })));
    b.append(g, el('h3', { text:'Your documents' }));
    const holder = el('div'); b.append(holder);
    const draw = () => { holder.innerHTML = ''; holder.append(recentList(200, true, search.value, 'home')); };
    search.oninput = draw; draw();
  } },
  { id:'open', label:'Open', icon:'folder_open', render:b => {
    b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })),
      el('p', { class:'bs-note', text:'Opens Word (.docx), web page (.html), Markdown (.md) and text files. Documents you create here are kept in this browser.' }), el('h3', { text:'Documents in this browser' }), recentList(50, true));
  } },
  { id:'info', label:'Info', icon:'info', render:b => {
    const d = W.doc, st = W.stats();
    b.append(el('h1', { text:'Info' }));
    const t = ONE.input({ value:$('#docTitle').value }), au = ONE.input({ value:d.meta.author }), su = ONE.input({ value:d.meta.subject }), tg = ONE.input({ value:d.meta.tags });
    t.oninput = () => { $('#docTitle').value = t.value; W._pagesSig = ''; W.dirty(); }; au.oninput = () => { d.meta.author = au.value; W._pagesSig = ''; W.dirty(); }; su.oninput = () => { d.meta.subject = su.value; W.dirty(); }; tg.oninput = () => { d.meta.tags = tg.value; W.dirty(); };
    b.append(el('div', { class:'grid2', style:{ maxWidth:'640px' } }, ONE.field('Title', t), ONE.field('Author', au), ONE.field('Subject', su), ONE.field('Tags', tg)));
    b.append(el('h3', { text:'Properties' }), el('div', { class:'info', html:`<span>Pages</span><span>${W.pageCount}</span><span>Words</span><span>${st.words.toLocaleString()}</span><span>Characters</span><span>${st.chars.toLocaleString()}</span><span>Paper</span><span>${W.SIZES[d.layout.size].name}, ${d.layout.orient}</span><span>Comments</span><span>${Object.keys(d.comments).length}</span><span>Tracked changes</span><span>${$$('ins.tc,del.tc', E).length}</span><span>Created</span><span>${fmtDate(d.meta.created)}</span><span>Last saved</span><span>${d.updated ? fmtDate(d.updated) : 'Not yet'}</span>` }));
    b.append(el('h3', { text:'Protect document' }), el('div', { class:'bs-row' },
      el('button', { class:'btn ' + (d.final ? 'filled' : 'outlined'), html:`${icon('verified')}${d.final ? 'Marked as Final (click to edit)' : 'Mark as Final'}`, onclick:() => { d.final = !d.final; syncRO(); W.dirty(); ONE.backstage.show('info'); } }),
      el('button', { class:'btn ' + (d.readonly ? 'filled' : 'outlined'), html:`${icon('lock')}${d.readonly ? 'Editing restricted' : 'Restrict Editing'}`, onclick:() => { A.restrict(); ONE.backstage.show('info'); } }),
      el('button', { class:'btn outlined', html:`${icon('accessibility_new')}Check Accessibility`, onclick:() => { ONE.backstage.close(); W.a11yDialog(); } })));
    b.append(el('h3', { text:'Version history' }));
    const vl = el('div', { class:'list' });
    if (!d.versions.length) vl.append(el('p', { class:'bs-note', text:'Versions are kept each time you save, and every few minutes while you work.' }));
    d.versions.forEach((v, i) => vl.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:'history' }), el('span', { class:'grow', html:`<b>${esc(fmtDate(v.t))}</b><small>${esc(v.title)} · ${(v.html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length} words</small>` }),
      el('button', { class:'btn text', text:'Restore', onclick:() => { W.save(true); E.innerHTML = v.html; W.changed(); ONE.backstage.close(); ONE.toast(`Restored the version from ${fmtDate(v.t)}.`, { action:'Undo', fn:W.undo }); } }))));
    b.append(vl);
  } },
  { id:'saveas', label:'Save As', icon:'save_as', render:b => {
    const n = ONE.input({ value:$('#docTitle').value + ' (copy)' });
    b.append(el('h1', { text:'Save As' }), el('div', { style:{ maxWidth:'420px' } }, ONE.field('File name', n)), el('div', { class:'bs-row', style:{ marginTop:'14px' } },
      el('button', { class:'btn filled', html:`${icon('save_as')}Save a copy`, onclick:() => { W.save(true); const d = JSON.parse(JSON.stringify(W.doc)); d.id = ONE.uid(); d.title = n.value.trim() || 'Document'; d.versions = []; d.html = W.cleanHTML(); W.open(d); postOpen(); W.save(true); ONE.backstage.close(); ONE.toast(`Saved as “${d.title}”. You’re now editing the copy.`); } }),
      el('button', { class:'btn outlined', html:`${icon('save')}Save`, onclick:() => { A.save(); } })),
      el('p', { class:'bs-note', text:'Copies are stored in this browser alongside your other documents. To take a file somewhere else, use Export.' }));
  } },
  { id:'print', label:'Print', icon:'print', render:b => {
    b.append(el('h1', { text:'Print' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('print')}Print`, onclick:() => A.print() })), el('p', { class:'bs-note', text:`${W.pageCount} page${W.pageCount === 1 ? '' : 's'}. Pick your printer, or “Save as PDF”, in the dialog.` }));
    const g = el('div', { class:'print-grid' }); b.append(g);
    const [pw, ph] = W.dims(), S = ph + W.GAP, n = Math.min(W.pageCount, 24);
    requestAnimationFrame(() => {
      const w = Math.max(150, g.clientWidth ? Math.min(210, (g.clientWidth - 18 * 3) / 4) : 170), k = w / pw;
      for (let p = 0; p < n; p++) {
        const box = el('div', { class:'print-page', style:{ width:w + 'px', height:ph * k + 'px', animationDelay:p * 40 + 'ms' } });
        const inner = el('div', { style:{ position:'absolute', left:0, top:0, zoom:k } });
        const c = sheet.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(x => x.removeAttribute('id')); $$('[contenteditable]', c).forEach(x => x.setAttribute('contenteditable', 'false'));
        $$('.imgsel', c).forEach(x => x.remove()); c.style.animation = 'none'; c.style.position = 'absolute'; c.style.top = -p * S + 'px'; c.style.margin = 0;
        inner.append(c); box.append(inner, el('span', { class:'cap', text:`${p + 1} / ${W.pageCount}` })); g.append(box);
      }
    });
  } },
  { id:'export', label:'Export', icon:'ios_share', render:b => {
    const name = esc($('#docTitle').value.trim() || 'Document');
    b.append(el('h1', { text:'Export' }), el('h3', { text:'Save a copy to this device' }), el('div', { class:'list' },
      ...[['description', 'Word document (.docx)', 'Opens in Microsoft Word, Google Docs and LibreOffice.', A.saveDocx], ['code', 'Web page (.html)', 'Keeps formatting; any browser opens it.', A.saveHtml], ['notes', 'Plain text (.txt)', 'Just the words.', A.saveTxt]]
        .map(([ic, t, d, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn filled', html:`${icon('download')}Save`, onclick:fn })))),
      el('h3', { text:`Copy “${name}” to the clipboard` }));
    b.append(
el('div', { class:'list' },
        ...[['html', 'code', 'Copy as HTML', 'A complete web page. Save it as a .html file and Word or any browser can open it.', standaloneHTML],
          ['md', 'markdown', 'Copy as Markdown', 'Headings, lists, links and tables as plain Markdown.', () => htmlToMd(E.cloneNode(true))],
          ['txt', 'notes', 'Copy as plain text', 'Just the words.', () => E.innerText],
          ['rich', 'content_copy', 'Copy formatted', 'Paste straight into Word, Google Docs or an email with formatting.', null]]
          .map(([k, ic, t, d, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }),
            el('button', { class:'btn tonal', text:'Copy', onclick:() => { if (fn) ONE.copyText(fn()); else { try { const item = new ClipboardItem({ 'text/html':new Blob([W.cleanHTML()], { type:'text/html' }), 'text/plain':new Blob([E.innerText], { type:'text/plain' }) }); navigator.clipboard.write([item]).then(() => ONE.toast('Copied with formatting.'), () => ONE.copyText(standaloneHTML())); } catch { ONE.copyText(standaloneHTML()); } } } })))));
  } },
  '-',
  { id:'options', label:'Options', icon:'settings', render:b => {
    const s = W.settings; b.append(el('h1', { text:'Options' }));
    const nm = ONE.input({ value:s.author }); nm.oninput = () => { s.author = nm.value.trim() || 'You'; $('#avatar').textContent = W.initials(); W.saveSettings(); };
    b.append(el('h3', { text:'Personalize' }), el('div', { style:{ maxWidth:'380px' } }, ONE.field('Your name (used for comments and tracked changes)', nm)), el('div', { class:'bs-row', style:{ marginTop:'12px' } }, el('button', { class:'btn outlined', html:`${icon('palette')}App color`, onclick:e => ONE.seedMenu(e.currentTarget) })));
    b.append(el('h3', { text:'AutoCorrect & AutoFormat' }));
    [['smartQuotes', 'Replace straight quotes with smart quotes, and (c) → ©, ... → …'], ['autoDashes', 'Replace -- with an em dash (—)'], ['autoLists', 'Automatic bulleted and numbered lists (type “* ” or “1. ”)'], ['miniToolbar', 'Show the Mini Toolbar on selection']].forEach(([k, l]) => { const c = ONE.check(l, s[k]); c.input.onchange = () => { s[k] = c.input.checked; W.saveSettings(); }; b.append(c.wrap); });
  } },
  { id:'close', label:'Close', icon:'close', render:() => { W.save(true); openDoc(W.newDoc()); ONE.toast('Document closed. Find it again in File › Open.'); } }
]);
function recentList(max, withDelete, q, where = 'open'){
  const list = el('div', { class:'list' });
  const docs = Object.entries(W.lib.docs).filter(([, m]) => !q || m.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) list.append(el('p', { class:'home-empty', text:q ? 'No documents match that search.' : 'No saved documents yet.' }));
  docs.forEach(([id, m]) => list.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:'description', style:{ color:'var(--primary)' } }), el('span', { class:'grow', html:`<b>${esc(m.title)}${id === W.doc.id ? ' <small>· open now</small>' : ''}</b><small>${fmtDate(m.updated)} · ${m.words || 0} words</small>` }),
    el('button', { class:'btn text', text:'Open', onclick:() => { const d = store.get('ow-doc-' + id); if (d) openDoc(d); else ONE.toast('That document could not be found in this browser.'); } }),
    withDelete && id !== W.doc.id ? el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => ONE.modal({ title:`Delete “${m.title}”?`, body:'It will be removed from this browser. This can’t be undone.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('ow-doc-' + id); delete W.lib.docs[id]; store.set('ow-lib', W.lib); ONE.backstage.show(where); } }] }) }) : null)));
  return list;
}

/* ---------- boot ---------- */
$('#avatar').textContent = W.initials(); $('#avatar').title = W.settings.author;
let first = W.lib.current && store.get('ow-doc-' + W.lib.current);
if (!first) { const old = store.get('folio-doc'); if (old && old.html) { first = W.newDoc(old.html, old.title || 'Document'); if (old.layout) { first.layout.size = old.layout.size || 'letter'; first.layout.orient = old.layout.orient || 'portrait'; } } }
const pendingId = ONE.pendingOpen(), pendingDoc = pendingId && store.get('ow-doc-' + pendingId);
W.open(pendingDoc || first || W.fromTemplate('blank')); postOpen();
if (!pendingDoc && !first) W.pristine = W.doc.title + '\u0000' + W.cleanHTML();
if (!pendingDoc) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => { const d = store.get('ow-doc-' + id); if (d) openDoc(d); };
ONE.onNewRequest = k => { openDoc(W.fromTemplate(TEMPLATES[k] ? k : 'blank')); };
requestAnimationFrame(() => { fitIfSmall(); W.schedule(); });
if (document.fonts) document.fonts.ready.then(() => { W._pagesSig = ''; W.schedule(); });
new ResizeObserver(() => W.schedule()).observe(E);
if (!matchMedia('(max-width:760px)').matches) { const p = E.querySelector('p'); if (p) { const r = document.createRange(); r.setStart(p, 0); r.collapse(true); W.saved = r; } }
})();
