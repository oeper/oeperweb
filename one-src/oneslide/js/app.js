/* oneSlide — ribbon, shortcuts, context menu, File backstage, templates, import/export, boot */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
const A = S.act, P = S.pops;
ONE.boot('op', 'slide');

const fontSel = () => { const s = el('select', { class:'combo fontsel', id:'fontName', 'aria-label':'Font' }); S.FONTS.forEach(([n, st]) => s.append(el('option', { value:n, text:n, style:st ? { fontFamily:st } : null }))); s.onchange = () => S.setFont((S.FONTS.find(f => f[0] === s.value) || [])[1]); return s; };
const sizeSel = () => { const w = el('span'), i = el('input', { class:'combo sizesel', id:'fontSize', list:'psizes', value:'24', 'aria-label':'Font size' }), dl = el('datalist', { id:'psizes' }); [12,14,16,18,20,24,28,32,36,40,44,54,60,72,88,96].forEach(s => dl.append(el('option', { value:s }))); i.onchange = () => { const v = parseFloat(i.value); if (v > 0 && v < 400) S.setSize(v); }; i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); i.onchange(); } }; w.append(i, dl); return w; };
const numIn = (id, label, unit, step, fn) => () => { const i = el('input', { type:'number', id, step, min:0, 'aria-label':label }); i.onchange = () => fn(parseFloat(i.value) || 0); return el('label', { class:'numin' }, el('span', { text:label }), i, el('span', { text:unit })); };
const startSel = () => { const s = el('select', { class:'combo', id:'anStart', 'aria-label':'Start', style:{ width:'150px' } }); [['click','On Click'],['with','With Previous'],['after','After Previous']].forEach(([v, t]) => s.append(el('option', { value:v, text:t }))); s.onchange = () => { S.selEls().forEach(e => e.anim && (e.anim.start = s.value)); S.renumber(); S.changed(); }; return el('label', { class:'numin' }, el('span', { text:'Start' }), s); };

const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Clipboard', items:[['LD','content_paste','Paste','pop:paste'], ['C', [['S','content_cut','Cut','cut',{ kbd:'Ctrl+X' }], ['S','content_copy','Copy','copy',{ kbd:'Ctrl+C' }], ['S','control_point_duplicate','Duplicate','duplicate',{ kbd:'Ctrl+D' }]]]] },
    { label:'Slides', items:[['LD','add_box','New Slide','pop:newSlide',{ kbd:'Ctrl+M' }], ['C', [['SD','dashboard','Layout','pop:layout'], ['S','restart_alt','Reset','reset'], ['S','visibility_off','Hide Slide','hideSlide',{ state:'hidden' }]]]] },
    { label:'Font', items:[['C', [
      ['R', [['X', fontSel], ['X', sizeSel], ['I','text_increase','Increase Font Size','grow',{ kbd:'Ctrl+]' }], ['I','text_decrease','Decrease Font Size','shrink',{ kbd:'Ctrl+[' }], ['I','format_clear','Clear All Formatting','clearFmt']]],
      ['R', [['I','format_bold','Bold','bold',{ state:'bold', kbd:'Ctrl+B' }], ['I','format_italic','Italic','italic',{ state:'italic', kbd:'Ctrl+I' }], ['I','format_underlined','Underline','underline',{ state:'underline', kbd:'Ctrl+U' }], ['I','format_strikethrough','Strikethrough','strike',{ state:'strike' }], ['I','blur_on','Text Shadow','tshadow',{ state:'tshadow' }], ['ID','format_letter_spacing','Character Spacing','pop:spacing'], ['ID','match_case','Change Case','pop:case'], ['I','ink_highlighter','Highlight','hilite'], ['SP','format_color_text','Font Color','fore','pop:fore',{ bar:'barFore' }]]]]]] },
    { label:'Paragraph', items:[['C', [
      ['R', [['I','format_list_bulleted','Bullets','bullets'], ['I','format_list_numbered','Numbering','numbering'], ['I','format_indent_decrease','Decrease List Level','outdent'], ['I','format_indent_increase','Increase List Level','indent'], ['ID','format_line_spacing','Line Spacing','pop:spacing']]],
      ['R', [['I','format_align_left','Align Left','alignL',{ state:'alignL', kbd:'Ctrl+L' }], ['I','format_align_center','Center','alignC',{ state:'alignC', kbd:'Ctrl+E' }], ['I','format_align_right','Align Right','alignR',{ state:'alignR', kbd:'Ctrl+R' }], ['I','format_align_justify','Justify','alignJ',{ state:'alignJ' }], ['I','vertical_align_top','Align Top','vTop'], ['I','vertical_align_center','Align Middle','vMid'], ['I','vertical_align_bottom','Align Bottom','vBot']]]]]] },
    { label:'Drawing', launch:'formatPane', items:[['LD','category','Shapes','pop:shapes'], ['LD','flip_to_front','Arrange','pop:arrange'], ['LD','style','Quick Styles','pop:quickStyles'], ['C', [['S','group_work','Group','group',{ kbd:'Ctrl+G' }], ['S','workspaces','Ungroup','ungroup',{ kbd:'Ctrl+Shift+G' }]]], ['C', [['SD','format_color_fill','Shape Fill','pop:fill'], ['SD','border_color','Shape Outline','pop:outline'], ['SD','auto_awesome','Shape Effects','pop:effects']]]] },
    { label:'Editing', items:[['C', [['S','search','Find','find',{ kbd:'Ctrl+F' }], ['S','find_replace','Replace','replace',{ kbd:'Ctrl+H' }], ['SD','select_all','Select','pop:select']]]] }
  ] },
  { id:'insert', label:'Insert', groups:[
    { label:'Slides', items:[['LD','add_box','New Slide','pop:newSlide']] },
    { label:'Tables', items:[['LD','table','Table','pop:table']] },
    { label:'Images', items:[['L','image','Pictures','picture'], ['LD','interests','Icons','pop:icons']] },
    { label:'Illustrations', items:[['LD','category','Shapes','pop:shapes'], ['LD','account_tree','SmartArt','pop:smartart'], ['L','bar_chart','Chart','chart']] },
    { label:'Text', items:[['L','text_fields','Text Box','textBox'], ['L','call_to_action','Header & Footer','headerFooter'], ['LD','auto_awesome','WordArt','pop:wordart'], ['C', [['S','calendar_today','Date & Time','dateTime'], ['S','tag','Slide Number','slideNumber']]]] },
    { label:'Symbols', items:[['L','functions','Equation','equation'], ['LD','emoji_symbols','Symbol','pop:symbol']] }
  ] },
  { id:'design', label:'Design', groups:[
    { label:'Themes', items:[['X', S.themeGallery]] },
    { label:'Variants', items:[['X', S.variantGallery]] },
    { label:'Customize', items:[['LD','aspect_ratio','Slide Size','pop:slideSize'], ['L','format_color_fill','Format Background','formatBg']] },
    { label:'Designer', items:[['L','auto_awesome','Design Ideas','designIdeas']] }
  ] },
  { id:'transitions', label:'Transitions', groups:[
    { label:'Transition to This Slide', items:[['X', S.transGallery], ['LD','tune','Effect Options','pop:trDir']] },
    { label:'Timing', items:[['C', [['X', numIn('trDur', 'Duration', 's', .1, v => { S.slide().transition.dur = v || .6; S.changed(); })], ['X', numIn('trAfter', 'Advance after', 's', 1, v => { S.slide().transition.after = v; S.changed(); })], ['S','done_all','Apply To All','trAll']]]] },
    { label:'Preview', items:[['L','play_circle','Preview','previewTransition']] }
  ] },
  { id:'animations', label:'Animations', groups:[
    { label:'Animation', items:[['X', S.animGallery], ['LD','tune','Effect Options','pop:anDir']] },
    { label:'Advanced Animation', items:[['L','view_timeline','Animation Pane','animPane',{ state:'animPane' }]] },
    { label:'Timing', items:[['C', [['X', startSel], ['X', numIn('anDur', 'Duration', 's', .1, v => { S.selEls().forEach(e => e.anim && (e.anim.dur = v || .6)); S.changed(); })], ['X', numIn('anDelay', 'Delay', 's', .1, v => { S.selEls().forEach(e => e.anim && (e.anim.delay = v)); S.changed(); })]]], ['C', [['S','arrow_upward','Move Earlier','anEarlier'], ['S','arrow_downward','Move Later','anLater']]]] },
    { label:'Preview', items:[['L','play_circle','Preview','previewAnims']] }
  ] },
  { id:'show', label:'Slide Show', groups:[
    { label:'Start Slide Show', items:[['L','slideshow','From Beginning','showStart',{ kbd:'F5' }], ['L','play_arrow','From Current Slide','showCurrent',{ kbd:'Shift+F5' }]] },
    { label:'Set Up', items:[['L','co_present','Presenter View','presenter',{ state:'presenter' }], ['L','repeat','Loop Until Esc','loop',{ state:'loop' }], ['L','visibility_off','Hide Slide','hideSlide',{ state:'hidden' }]] }
  ] },
  { id:'review', label:'Review', groups:[
    { label:'Proofing', items:[['L','spellcheck','Spelling','spell',{ state:'spell' }]] },
    { label:'Accessibility', items:[['L','accessibility_new','Check Accessibility','a11y']] },
    { label:'Notes', items:[['L','sticky_note_2','Notes','notes',{ state:'notes' }]] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Presentation Views', items:[['L','view_sidebar','Normal','normal'], ['L','format_list_bulleted','Outline View','outline'], ['L','grid_view','Slide Sorter','sorter']] },
    { label:'Show', items:[['C', [['SW','Notes','notes'], ['SW','Gridlines','guides'], ['SW','Animation Pane','animPane']]]] },
    { label:'Zoom', items:[['LD','zoom_in','Zoom','pop:zoom'], ['L','fit_screen','Fit to Window','zoomFit']] },
    { label:'Personalize', items:[['L','palette','App Color','seed']] }
  ] },
  { id:'shapefmt', label:'Shape Format', ctx:'shape', groups:[
    { label:'Shape Styles', launch:'formatPane', items:[['LD','style','Quick Styles','pop:quickStyles'], ['C', [['SD','format_color_fill','Shape Fill','pop:fill'], ['SD','border_color','Shape Outline','pop:outline'], ['SD','auto_awesome','Shape Effects','pop:effects']]]] },
    { label:'WordArt Styles', items:[['LD','auto_awesome','WordArt','pop:wordart'], ['SP','format_color_text','Text Fill','fore','pop:fore']] },
    { label:'Arrange', items:[['LD','flip_to_front','Arrange','pop:arrange'], ['C', [['S','flip_to_front','Bring to Front','front'], ['S','flip_to_back','Send to Back','back'], ['S','group_work','Group','group']]]] },
    { label:'Size', items:[['L','tune','Format Pane','formatPane']] }
  ] },
  { id:'picfmt', label:'Picture Format', ctx:'picture', groups:[
    { label:'Adjust', items:[['LD','tune','Color & Filters','pop:imgFilter'], ['L','swap_horiz','Change Picture','changePic']] },
    { label:'Picture Styles', items:[['LD','style','Styles','pop:imgStyle'], ['L','crop','Fill / Fit','cropToggle']] },
    { label:'Accessibility', items:[['L','short_text','Alt Text','altText']] },
    { label:'Arrange', items:[['LD','flip_to_front','Arrange','pop:arrange'], ['L','tune','Format Pane','formatPane']] }
  ] },
  { id:'tablefmt', label:'Table Design', ctx:'table', groups:[
    { label:'Table', items:[['L','edit','Edit Table','editTable'], ['C', [['S','table_rows','Header Row','tblHeader'], ['S','view_agenda','Banded Rows','tblBanded']]], ['LD','format_color_fill','Table Color','pop:fill']] }
  ] },
  { id:'chartfmt', label:'Chart Design', ctx:'chart', groups:[
    { label:'Data', items:[['L','edit_note','Edit Data','editChart'], ['LD','bar_chart','Chart Type','pop:chartType']] }
  ] }
];
const cs = () => S.curStyle();
const STATES = { bold:() => !!cs().bold, italic:() => !!cs().italic, underline:() => !!cs().underline, strike:() => !!cs().strike, tshadow:() => !!cs().tshadow,
  alignL:() => (cs().align || 'left') === 'left' && !!S.selEls().length, alignC:() => cs().align === 'center', alignR:() => cs().align === 'right', alignJ:() => cs().align === 'justify',
  hidden:() => !!(S.slide() && S.slide().hidden), presenter:() => !!S.presenterDefault, loop:() => !!S.deck.loop, animPane:() => !$('#animPane').hidden, notes:() => !$('#notesWrap').hidden, guides:() => $('#stage').classList.contains('gridon'), spell:() => !document.body.classList.contains('nospell') };

/* extra pops & actions */
P.paste = a => ONE.menuAt(a, [{ label:'Paste', icon:'content_paste', kbd:'Ctrl+V', on:() => { if (!S.pasteEls()) ONE.toast('Press Ctrl+V to paste from other apps.'); } }, { label:'Paste text or pictures from other apps', sub:'Press Ctrl+V', icon:'keyboard', disabled:true }]);
P.select = a => ONE.menuAt(a, [{ label:'Select All', icon:'select_all', kbd:'Ctrl+A', on:A.selectAll }, { label:'Selection Pane…', icon:'layers', on:A.selectionPane }]);
P.zoom = a => ONE.menuAt(a, [['fit', 'Fit'], [2, '200%'], [1.5, '150%'], [1, '100%'], [.75, '75%'], [.5, '50%']].map(([z, n]) => ({ label:n, on:() => { S.zoom = z; S.fit(); } })));
P.imgFilter = a => { const e = S.selEls()[0]; if (!e) return; ONE.menuAt(a, [['', 'Original'], ['grayscale(1)', 'Grayscale'], ['sepia(.85)', 'Sepia'], ['brightness(1.3) contrast(.75)', 'Washout'], ['saturate(1.8)', 'Vivid'], ['contrast(1.4)', 'High Contrast'], ['blur(3px)', 'Blur'], ['hue-rotate(180deg)', 'Recolor']].map(([f, n]) => ({ label:n, on:() => { e.style.filter = f || undefined; S.changed(); } }))); };
P.imgStyle = a => { const e = S.selEls()[0]; if (!e) return; ONE.menuAt(a, [['Simple', {}], ['Rounded', { radius:24 }], ['Soft Shadow', { shadow:'soft' }], ['White Frame', { frame:true, shadow:true }], ['Circle', { radius:'circle' }], ['Offset', { shadow:'hard' }]].map(([n, st]) => ({ label:n, on:() => { ['radius','shadow','frame'].forEach(k => delete e.style[k]); Object.assign(e.style, st); S.changed(); } }))); };
P.chartType = a => { const e = S.selEls()[0]; if (!e) return; ONE.menuAt(a, [['column','Column','bar_chart'],['line','Line','show_chart'],['area','Area','area_chart'],['pie','Pie','pie_chart'],['doughnut','Doughnut','donut_large']].map(([k, n, i]) => ({ label:n, icon:i, checked:e.kind === k, on:() => { e.kind = k; S.changed(); } }))); };
Object.assign(A, {
  save:() => ONE.toast(S.save() ? 'Saved to this browser.' : 'This browser blocked storage, so the presentation could not be saved.'),
  undo:() => { S.commitText(); S.go(-1); }, redo:() => { S.commitText(); S.go(1); }, backstage:() => ONE.backstage.show('home'), collapseRibbon:() => ONE.ribbon.setScale(ONE.ribbon.scale || 1, !document.querySelector('.app').classList.contains('ribbon-min')),
  seed:b => ONE.seedMenu(b), shortcuts:() => shortcuts(), apps:b => ONE.appSwitcher(b),
  cut:() => { if (!S.copySel(true)) ONE.toast('Select something to cut.'); }, copy:() => { if (S.copySel(false)) ONE.toast('Copied.'); else ONE.toast('Select something to copy.'); },
  previewTransition:() => S.previewTransition(), zoomFit:() => { S.zoom = 'fit'; S.fit(); }, zoomIn:() => { S.zoom = Math.min(3, S.k + .1); S.fit(); }, zoomOut:() => { S.zoom = Math.max(.1, S.k - .1); S.fit(); },
  front:() => S.zorder('front'), back:() => S.zorder('back'),
  changePic:() => { const e = S.selEls()[0]; if (!e) return; const i = el('input', { type:'file', accept:'image/*' }); i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { e.src = r.result; S.changed(); }; r.readAsDataURL(f); }; i.click(); },
  cropToggle:() => { const e = S.selEls()[0]; if (!e) return; e.fit = e.fit === 'contain' ? 'cover' : 'contain'; S.changed(); },
  altText:() => A.formatPane(), editTable:() => { const e = S.selEls()[0]; if (e) S.editTable(e); }, editChart:() => { const e = S.selEls()[0]; if (e) S.editChart(e); },
  tblHeader:() => { const e = S.selEls()[0]; if (e) { e.header = e.header === false; S.changed(); } }, tblBanded:() => { const e = S.selEls()[0]; if (e) { e.banded = e.banded === false; S.changed(); } }
});
S.ONE_STATES = STATES;

/* ---------- dispatcher ---------- */
const run = (act, b, e) => { if (!act) return; if (act.startsWith('pop:')) { const p = P[act.slice(4)]; return p ? p(b) : null; } const f = A[act]; if (f) f(b, e); else console.warn('Unknown action', act); };
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES });
$('#barFore').style.background = S.fore;
$('#ribbon').addEventListener('mousedown', e => { if (e.target.closest('button') && S.editing) e.preventDefault(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return; if (b.closest('.titlebar,.status,.sidepane')) run(b.dataset.act, b, e); });
$('.qat').addEventListener('mousedown', e => e.preventDefault());
ONE.commandSearch($('#topSearch'), { run, docSearch:q => { S.findDialog(false); setTimeout(() => { const i = ONE.topModal().el.querySelector('input'); i.value = q; }, 50); } });
$('#docTitle').addEventListener('input', () => { S.deck.title = $('#docTitle').value; S.dirty(); });
$('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#zoomRange').addEventListener('input', e => { S.zoom = e.target.value / 100; S.fit(); });
$('#stagewrap').addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); S.zoom = ONE.clamp(S.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), .1, 3); S.fit(); } }, { passive:false });

/* status + ribbon sync */
S.updateBars = () => {
  $('#slideInfo').textContent = `Slide ${S.cur + 1} of ${S.deck.slides.length}${S.slide() && S.slide().hidden ? ' (hidden)' : ''}`;
  const e = S.selEls(); $('#posInfo').textContent = e.length === 1 ? `X ${Math.round(e[0].x)} · Y ${Math.round(e[0].y)} · ${Math.round(e[0].w)} × ${Math.round(e[0].h)}${e[0].rot ? ` · ${e[0].rot}°` : ''}` : e.length > 1 ? `${e.length} objects selected` : '';
  const st = S.curStyle(), f = $('#fontName'), z = $('#fontSize');
  if (f && document.activeElement !== f) { const n = S.FONTS.find(x => x[1] && st.font && x[1] === st.font); f.value = n ? n[0] : 'Theme Fonts'; }
  if (z && document.activeElement !== z) z.value = st.size || (e[0] && e[0].role === 'title' ? 44 : 24);
  ONE.ribbon.refresh();
};
document.addEventListener('selectionchange', () => { if (S.editing) ONE.ribbon.refresh(); });

/* core render hook */
S.hooks.unshift(() => { S.renderThumbs(); S.renderStage(); notes.value = S.slide() ? S.slide().notes || '' : ''; S.updateBars(); });
const notes = $('#notes');

/* ---------- shortcuts ---------- */
function shortcuts(){
  const list = [['New slide','Ctrl+M'],['Duplicate object / slide','Ctrl+D'],['Start slide show','F5'],['Present from current slide','Shift+F5'],['Edit text of selected object','Enter or F2'],['Stop editing text','Esc'],['Select next object','Tab'],['Nudge object (10px with Shift)','Arrow keys'],['Bold / Italic / Underline','Ctrl+B / I / U'],['Grow / shrink text','Ctrl+] / Ctrl+['],['Align left / center / right','Ctrl+L / E / R'],['Copy / Cut / Paste','Ctrl+C / X / V'],['Duplicate while dragging','Alt+drag'],['Keep proportions / snap rotation','Shift+drag'],['Find / Replace','Ctrl+F / Ctrl+H'],['Undo / Redo','Ctrl+Z / Ctrl+Y'],['Save','Ctrl+S'],['In slide show: next / back','→ Space / ←'],['In slide show: black / white screen','B / W'],['Group / Ungroup','Ctrl+G / Ctrl+Shift+G'],['In slide show: laser pointer','L'],['In slide show: pen / highlighter / erase ink','Ctrl+P / Ctrl+I / E'],['In slide show: go to slide','number + Enter'],['Search commands','Alt+Q']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:540, body:`<div style="display:grid;grid-template-columns:1fr auto;gap:6px 18px;color:var(--on-surface)">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}
document.addEventListener('keydown', e => {
  if (S.showing || ONE.topModal() || ONE.backstage.isOpen()) { if (!S.showing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); A.save(); } return; }
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), inField = e.target.matches('input,textarea,select');
  if (e.key === 'F5') { e.preventDefault(); return e.shiftKey ? A.showCurrent() : A.showStart(); }
  if (e.key === 'F1') { e.preventDefault(); return shortcuts(); }
  if (e.altKey && !mod && k === 'q') { e.preventDefault(); return $('#topSearch').focus(); }
  if (!mod) return;
  if (k === 's') { e.preventDefault(); return A.save(); }
  if (k === 'n' || k === 'o' || k === 'p') { e.preventDefault(); return ONE.backstage.show({ n:'home', o:'open', p:'print' }[k]); }
  if (inField) return;
  if (k === 'g') { e.preventDefault(); return e.shiftKey ? A.ungroup() : A.group(); }
  const map = { z:() => e.shiftKey ? A.redo() : A.undo(), y:A.redo, m:() => S.addSlide(), d:A.duplicate, f:A.find, h:A.replace, ']':A.grow, '[':A.shrink, '>':A.grow, '<':A.shrink,
    a:() => S.editing ? 'native' : A.selectAll(), l:() => S.editing || S.selEls().length ? A.alignL() : 'native', e:() => S.editing || S.selEls().length ? A.alignC() : 'native', r:() => S.editing || S.selEls().length ? A.alignR() : 'native', j:A.alignJ,
    b:() => S.editing ? 'native' : A.bold(), i:() => S.editing ? 'native' : A.italic(), u:() => S.editing ? 'native' : A.underline() };
  const f = map[k]; if (!f) return; if (S.editing && ['b','i','u','a'].includes(k)) return; const r = f(); if (r !== 'native') e.preventDefault();
});

/* ---------- context menus ---------- */
$('#stage').addEventListener('contextmenu', e => {
  if (S.editing) return; e.preventDefault();
  const n = e.target.closest('.el'); if (n && !S.sel.includes(n.dataset.id)) { S.sel = [n.dataset.id]; S.renderSel(); }
  const at = { x:e.clientX, y:e.clientY }, one = S.selEls()[0];
  if (!n && !e.target.closest('.selbox')) return ONE.menuAt(at, [{ label:'Paste', icon:'content_paste', disabled:!S.clip, on:S.pasteEls }, '-', { label:'Layout', icon:'dashboard', on:() => P.layout(at) }, { label:'Reset Slide', icon:'restart_alt', on:A.reset }, { label:'Format Background…', icon:'format_color_fill', on:A.formatBg }, { label:'New Slide', icon:'add', on:() => S.addSlide() }, { label:'Hide Slide', icon:'visibility_off', on:A.hideSlide }]);
  ONE.menuAt(at, [{ label:'Cut', icon:'content_cut', kbd:'Ctrl+X', on:A.cut }, { label:'Copy', icon:'content_copy', kbd:'Ctrl+C', on:A.copy }, { label:'Duplicate', icon:'control_point_duplicate', kbd:'Ctrl+D', on:A.duplicate }, { label:'Delete', icon:'delete', kbd:'Del', on:S.deleteSel }, '-',
    one && (one.type === 'text' || one.type === 'shape') ? { label:'Edit Text', icon:'edit', kbd:'Enter', on:() => S.editText(one.id, null) } : null,
    one && one.type === 'table' ? { label:'Edit Table…', icon:'edit', on:() => S.editTable(one) } : null, one && one.type === 'chart' ? { label:'Edit Data…', icon:'edit_note', on:() => S.editChart(one) } : null,
    { label:'Bring to Front', icon:'flip_to_front', on:() => S.zorder('front') }, { label:'Send to Back', icon:'flip_to_back', on:() => S.zorder('back') }, { label:'Arrange ▸', icon:'align_horizontal_center', on:() => P.arrange(at) }, S.selEls().some(x => x.group) ? { label:'Ungroup', icon:'workspaces', kbd:'Ctrl+Shift+G', on:A.ungroup } : S.selEls().length > 1 ? { label:'Group', icon:'group_work', kbd:'Ctrl+G', on:A.group } : null, '-',
    { label:'Add Animation ▸', icon:'animation', on:() => ONE.menuAt(at, Object.entries(S.ANIMS).flatMap(([cat, list]) => [{ title:{ in:'Entrance', emph:'Emphasis', out:'Exit' }[cat] }, ...list.map(([k, nm, ic]) => ({ label:nm, icon:ic, on:() => S.setAnim(k, cat) }))])) },
    { label:'Format…', icon:'tune', on:A.formatPane }]);
});

/* ---------- templates ---------- */
const T = (role, html, extra) => Object.assign({ id:S.newId(), mid:S.newId(), type:'text', role, rot:0, html, style:{} }, extra);
const SH = (shape, x, y, w, h, style, html = '', extra) => Object.assign({ id:S.newId(), mid:S.newId(), type:'shape', shape, x, y, w, h, rot:0, html, style }, extra);
const IC = (icon0, x, y, s, color, extra) => Object.assign({ id:S.newId(), mid:S.newId(), type:'icon', icon:icon0, x, y, w:s, h:s, rot:0, style:{ color }, alt:icon0.replace(/_/g, ' ') }, extra);
const mk = (layout, fill, extra = []) => { const s = S.newSlide(layout); s.els.forEach(e => { if (e.role && fill[e.role] !== undefined) { const v = fill[e.role]; e.html = Array.isArray(v) ? v.shift() : v; } }); s.els.push(...extra); return s; };
function sampleDeck(){
  const d = S.newDeck('Riverside Garden 2026'); d.theme = 'material'; d.footer = { text:'Riverside Community Garden', num:true, date:false };
  const W = 1280;
  const s1 = mk('title', { title:'Riverside Community Garden', subtitle:'2026 season plan · March volunteer meeting' }, [IC('local_florist', W / 2 - 50, 90, 100, 'accent1', { anim:{ type:'zoom', cat:'in', start:'with', dur:.8, delay:0, order:1 } })]);
  s1.transition = { type:'fade', dur:.8, after:0 };
  const s2 = mk('content', { title:'Agenda', body:'<ul><li>Where we are after 2025</li><li>Eight new raised beds</li><li>Planting schedule</li><li>How volunteers can help</li><li>Opening day, April 18</li></ul>' });
  s2.els.find(e => e.role === 'body').anim = { type:'float', cat:'in', start:'click', dur:.6, delay:0, order:1 };
  const circle = SH('ellipse', 120, 240, 240, 240, { fill:'accent1', shadow:'soft' }, '<b>24</b>', {});
  circle.style.size = 64;
  const s3 = mk('titleonly', { title:'Where we started' }, [circle, T(null, 'raised beds in 2025, all fully booked by March', { x:400, y:300, w:680, h:120, style:{ size:32 } })]);
  const s4 = JSON.parse(JSON.stringify(s3)); s4.id = S.newId(); s4.els.forEach(e => e.id = S.newId());
  const c4 = s4.els.find(e => e.type === 'shape'); Object.assign(c4, { x:W - 520, y:170, w:400, h:400, html:'<b>32</b>' }); c4.style = { fill:'accent3', shadow:'soft', size:110 };
  s4.els.find(e => e.role === 'title').html = 'Where we’re going';
  const cap = s4.els.find(e => e.type === 'text' && !e.role); Object.assign(cap, { x:120, y:270, w:620, html:'raised beds in 2026, thanks to lumber from Hartwell Hardware' });
  s4.transition = { type:'morph', dur:1.1, after:0 };
  const s5 = mk('titleonly', { title:'What the new beds unlock' }, [
    ...[['groups', '20 more families', 'Room for everyone on the waitlist'], ['eco', 'Shared herb bed', 'Next to the tool shed, open to all'], ['volunteer_activism', '300 lb donated', 'Fresh produce for Eastside Food Pantry']].flatMap(([ic, h, sub], i) => {
      const x = 110 + i * 370; return [SH('round', x, 200, 320, 380, { fill:'accent' + (i + 1), opacity:.12, radius:28 }, '', {}), IC(ic, x + 110, 240, 100, 'accent' + (i + 1), { anim:{ type:'zoom', cat:'in', start:i ? 'after' : 'click', dur:.5, delay:0, order:i + 1 } }), T(null, `<b>${h}</b>`, { x:x + 20, y:370, w:280, h:60, style:{ size:28, align:'center', color:'title' } }), T(null, sub, { x:x + 20, y:430, w:280, h:100, style:{ size:20, align:'center' } })]; })]);
  s5.transition = { type:'push', dur:.6, after:0 };
  const chart = { id:S.newId(), mid:S.newId(), type:'chart', kind:'column', title:'Harvest by month (lb)', x:110, y:180, w:1060, h:470, rot:0, style:{}, alt:'Harvest by month: 2026 targets higher than 2025 every month', data:{ cats:['Apr','May','Jun','Jul','Aug','Sep'], series:[{ name:'2025', vals:[42, 68, 95, 120, 88, 64] }, { name:'2026 target', vals:[58, 90, 124, 161, 130, 96] }] }, anim:{ type:'wipe', cat:'in', start:'click', dur:1, delay:0, order:1 } };
  const s6 = mk('titleonly', { title:'Harvest goals' }, [chart]);
  const tbl = { id:S.newId(), mid:S.newId(), type:'table', x:110, y:190, w:1060, h:300, rot:0, header:true, banded:true, style:{ size:22 }, rows:[['Crop', 'Beds', 'Sow / transplant', 'First harvest'], ['Snap peas', '3, 4', 'Mar 20', 'Late May'], ['Spinach', '5', 'Mar 25', 'Early May'], ['Tomatoes', '12–15', 'May 1', 'Mid July'], ['Basil', 'Herb bed', 'May 8', 'June']] };
  const s7 = mk('titleonly', { title:'Planting schedule' }, [tbl]);
  const s8 = mk('quote', { title:'“The best time to plant a tree was twenty years ago. The second best time is now.”', subtitle:'— Proverb' });
  s8.transition = { type:'zoom', dur:.7, after:0 };
  const s9 = mk('title', { title:'See you April 18', subtitle:'Opening day · 10 am – 2 pm · seedling swap, kids’ planting table, free coffee' }, [IC('celebration', W / 2 - 55, 90, 110, 'accent4', { anim:{ type:'bounce', cat:'in', start:'with', dur:1.2, delay:.2, order:1 } })]);
  d.slides = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  [s2, s3, s6, s7].forEach(s => s.transition = { type:'fade', dur:.5, after:0 });
  s1.notes = 'Welcome everyone. Thank Hartwell Hardware for the lumber.'; s4.notes = 'This slide uses the Morph transition: the circle grows and moves from the previous slide.'; s6.notes = 'Targets assume the drip-line upgrade is done by April.';
  return d;
}
const TEMPLATES = {
  sample:{ name:'Garden season plan', desc:'Sample deck with Morph, animations, a chart and a table', make:sampleDeck },
  ...Object.fromEntries(Object.entries(S.THEMES).map(([k, t]) => [k, { name:t.name, desc:'Blank presentation', make:() => { const d = S.newDeck('Presentation'); d.theme = k; d.slides = [S.newSlide('title')]; return d; } }]))
};
const openDeck = d => { S.open(d); ONE.backstage.close(); S.save(); };

/* ---------- import / export ---------- */
async function loadZip(){ if (window.JSZip) return window.JSZip; await new Promise((ok, bad) => { const s = el('script', { src:'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' }); s.onload = ok; s.onerror = bad; document.head.append(s); }); return window.JSZip; }
$('#openInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return; const base = f.name.replace(/\.[^.]+$/, '');
  try {
    if (/\.pptx$/i.test(f.name)) {
      ONE.toast('Opening presentation…'); const Z = await loadZip(); const zip = await Z.loadAsync(await f.arrayBuffer());
      const files = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/g).pop()) - parseInt(b.match(/\d+/g).pop()));
      const d = S.newDeck(base); d.theme = 'office';
      for (const n of files) {
        const x = new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
        const shapes = [...x.getElementsByTagNameNS('*', 'sp')]; let title = '', body = [], other = [];
        shapes.forEach(sp => { const ph = sp.getElementsByTagNameNS('*', 'ph')[0], type = ph ? ph.getAttribute('type') || 'body' : null; const paras = [...sp.getElementsByTagNameNS('*', 'p')].map(p => [...p.getElementsByTagNameNS('*', 't')].map(t => t.textContent).join('')).filter(Boolean); if (!paras.length) return; if (type === 'title' || type === 'ctrTitle') title = paras.join(' '); else if (type) body.push(...paras); else other.push(...paras); });
        const nf = await (async () => { const rel = zip.file(n.replace('slides/', 'slides/_rels/') + '.rels'); if (!rel) return ''; const rx = await rel.async('string'); const m = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(rx); if (!m) return ''; const nx = new DOMParser().parseFromString(await zip.file('ppt/notesSlides/' + m[1]).async('string'), 'application/xml'); return [...nx.getElementsByTagNameNS('*', 't')].map(t => t.textContent).filter(t => !/^\d+$/.test(t)).join(' '); })();
        const all = [...body, ...other]; const s = S.newSlide(all.length ? 'content' : 'title');
        s.els.find(e => e.role === 'title').html = esc(title); const b = s.els.find(e => e.role === 'body' || e.role === 'subtitle'); if (b && all.length) b.html = s.layout === 'content' ? `<ul>${all.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : esc(all.join(' '));
        s.notes = nf; d.slides.push(s);
      }
      if (!d.slides.length) throw new Error('empty');
      openDeck(d); ONE.toast(`Imported the text and notes of ${d.slides.length} slides from ${f.name}. Pictures and layouts aren’t imported.`);
    } else if (/\.json$/i.test(f.name)) { const d = JSON.parse(await f.text()); if (!d.slides) throw new Error('bad'); d.id = ONE.uid(); openDeck(d); }
    else { const d = S.newDeck(base); d.slides = []; S.deck = d; S.cur = -1; const n = S.outlineToSlides(await f.text()); if (!n) throw new Error('empty'); openDeck(S.deck); }
  } catch (err) { console.error(err); ONE.toast('Couldn’t open that file.'); }
});
const SLIDE_CSS = `body{margin:0;background:#111;overflow:hidden;font-family:system-ui}.slide{position:absolute;left:50%;top:50%;overflow:hidden;transform-origin:0 0}.slide .el{position:absolute;box-sizing:border-box}.slide .tx{position:absolute;inset:0;display:flex;flex-direction:column}.slide .txi{white-space:pre-wrap;overflow-wrap:break-word}.slide .txi ul,.slide .txi ol{margin:0;padding-left:1.2em;white-space:normal}.slide .el-image img{width:100%;height:100%;display:block}.slide .ico{font-family:'Material Symbols Rounded';display:grid;place-items:center;width:100%;height:100%;line-height:1;font-variation-settings:'FILL' 1}.slide .stbl{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}.slide .stbl th{background:var(--acc);color:#fff;text-align:left;padding:8px 12px}.slide .stbl td{padding:8px 12px;border-bottom:1px solid rgba(0,0,0,.12)}.slide .stbl.banded tr:nth-child(even) td{background:rgba(0,0,0,.05)}.slide[hidden]{display:none}`;
const exportHTML = () => { const W = S.W(), H = S.H(); const slides = S.deck.slides.filter(s => !s.hidden).map(s => { const n = S.renderSlide(s); n.querySelectorAll('.anim-badge').forEach(x => x.remove()); return n.outerHTML; }).join('\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(S.deck.title)}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wght@8..144,300..800&family=Carlito:wght@400;700&family=EB+Garamond&family=Caveat:wght@500&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0"><style>${SLIDE_CSS}</style></head><body>\n${slides}\n<script>const s=[...document.querySelectorAll('.slide')];let i=0;const fit=()=>{const k=Math.min(innerWidth/${W},innerHeight/${H});s.forEach((x,j)=>{x.hidden=j!==i;x.style.transform='scale('+k+') translate(-50%,-50%)';});};addEventListener('resize',fit);addEventListener('keydown',e=>{if(['ArrowRight',' ','PageDown'].includes(e.key))i=Math.min(s.length-1,i+1);if(['ArrowLeft','PageUp'].includes(e.key))i=Math.max(0,i-1);fit();});addEventListener('click',()=>{i=Math.min(s.length-1,i+1);fit();});fit();<\/script></body></html>`; };

/* ---------- backstage ---------- */
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
function recent(max, del, q, where = 'open'){
  const list = el('div', { class:'list' }); const docs = Object.entries(S.lib.docs).filter(([, m]) => !q || m.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) list.append(el('p', { class:'home-empty', text:q ? 'No presentations match that search.' : 'No saved presentations yet.' }));
  docs.forEach(([id, m]) => list.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:'slideshow', style:{ color:'var(--primary)' } }), el('span', { class:'grow', html:`<b>${esc(m.title)}${id === S.deck.id ? ' <small>· open now</small>' : ''}</b><small>${fmtDate(m.updated)} · ${m.slides} slide${m.slides === 1 ? '' : 's'}</small>` }),
    el('button', { class:'btn text', text:'Open', onclick:() => { const d = store.get('op-doc-' + id); if (d) openDeck(d); else ONE.toast('That presentation could not be found in this browser.'); } }),
    del && id !== S.deck.id ? el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => ONE.modal({ title:`Delete “${m.title}”?`, body:'It will be removed from this browser. This can’t be undone.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('op-doc-' + id); delete S.lib.docs[id]; store.set('op-lib', S.lib); ONE.backstage.show(where); } }] }) }) : null)));
  return list;
}
ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => { const hr = new Date().getHours(), search = el('input', { placeholder:'Search your presentations', 'aria-label':'Search your presentations' }); b.append(el('div', { class:'home-hero' }, el('h1', { text:hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }), el('label', { class:'home-search', html:icon('search') }, search)), el('h3', { text:'Start something new' })); const g = el('div', { class:'tpl' });
    Object.entries(TEMPLATES).forEach(([k, t]) => { const d = t.make(); const saved = S.deck, savedCur = S.cur; S.deck = d; const th = S.thumb(d.slides[0], 200); S.deck = saved; S.cur = savedCur; const card = el('button', { class:'tpl-card', style:{ width:'200px' } }, el('div', { class:'thumb', style:{ padding:0, height:'113px', borderRadius:'12px' } }, th), el('span', { html:`${esc(t.name)}<small><br>${esc(t.desc)}</small>` })); card.onclick = () => openDeck(t.make()); g.append(card); });
    const holder = el('div'); b.append(g, el('h3', { text:'Your presentations' }), holder); const draw = () => { holder.innerHTML = ''; holder.append(recent(200, true, search.value, 'home')); }; search.oninput = draw; draw(); } },
  { id:'open', label:'Open', icon:'folder_open', render:b => b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })), el('p', { class:'bs-note', text:'Opens PowerPoint (.pptx: slide text and speaker notes), oneSlide JSON, and Markdown outlines (# Title, - points). Presentations you create here are kept in this browser.' }), el('h3', { text:'Presentations in this browser' }), recent(50, true)) },
  { id:'info', label:'Info', icon:'info', render:b => { const words = S.deck.slides.reduce((a, s) => a + s.els.reduce((x, e) => x + ((e.html || '').replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length, 0), 0), anims = S.deck.slides.reduce((a, s) => a + s.els.filter(e => e.anim).length, 0);
    b.append(el('h1', { text:'Info' }), el('div', { class:'info', html:`<span>Title</span><span>${esc($('#docTitle').value)}</span><span>Slides</span><span>${S.deck.slides.length} (${S.deck.slides.filter(s => s.hidden).length} hidden)</span><span>Theme</span><span>${esc(S.theme().name)}</span><span>Slide size</span><span>${S.deck.ratio}</span><span>Words</span><span>${words}</span><span>Animations</span><span>${anims}</span><span>Notes</span><span>${S.deck.slides.filter(s => s.notes).length} slides</span><span>Last saved</span><span>${fmtDate(S.deck.updated)}</span>` }), el('div', { class:'bs-row', style:{ marginTop:'18px' } }, el('button', { class:'btn outlined', html:`${icon('accessibility_new')}Check Accessibility`, onclick:() => { ONE.backstage.close(); A.a11y(); } }))); } },
  { id:'saveas', label:'Save As', icon:'save_as', render:b => { const n = ONE.input({ value:$('#docTitle').value + ' (copy)' }); b.append(el('h1', { text:'Save As' }), el('div', { style:{ maxWidth:'420px' } }, ONE.field('File name', n)), el('div', { class:'bs-row', style:{ marginTop:'14px' } }, el('button', { class:'btn filled', html:`${icon('save_as')}Save a copy`, onclick:() => { S.save(); const c = JSON.parse(JSON.stringify(S.deck)); c.id = ONE.uid(); c.title = n.value.trim() || 'Presentation'; openDeck(c); ONE.toast(`Saved as “${c.title}”. You’re now editing the copy.`); } }))); } },
  { id:'print', label:'Print', icon:'print', render:b => { b.append(el('h1', { text:'Print' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('print')}Print full-page slides`, onclick:() => A.printSlides(1) }), el('button', { class:'btn tonal', html:`${icon('view_agenda')}Print notes pages`, onclick:() => A.printSlides(2) })), el('p', { class:'bs-note', text:'Hidden slides are skipped. Preview:' }));
    const g = el('div', { class:'print-hand' }); S.deck.slides.forEach((s, i) => g.append(el('div', { class:'ph-item', style:{ animationDelay:i * 30 + 'ms' } }, S.thumb(s, 220), el('div', { class:'ph-lines', html:'<i></i><i></i><i></i><i></i>' })))); b.append(g); } },
  { id:'export', label:'Export', icon:'ios_share', render:b => b.append(el('h1', { text:'Export' }), el('h3', { text:'Save a copy to this device' }),
    el('div', { class:'list' }, ...[['PowerPoint (.pptx)', 'Opens in PowerPoint, Keynote and Google Slides. Shapes, tables, charts and notes stay editable.', 'slideshow', A.savePptx], ['HTML slideshow (.html)', 'One web page that plays your slides with the arrow keys.', 'code', () => ONE.download((S.deck.title || 'Presentation') + '.html', exportHTML(), 'text/html')], ['oneSlide file (.json)', 'Everything, to reopen here later with File › Open.', 'data_object', () => ONE.download((S.deck.title || 'Presentation') + '.json', JSON.stringify(S.deck), 'application/json')]]
      .map(([t, d, ic, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn filled', text:'Save', onclick:() => fn() })))),
    el('h3', { text:'Copy to the clipboard' }),
    el('div', { class:'list' }, ...[['HTML slideshow', 'A single web page that plays your slides with the arrow keys. Save as .html.', 'code', exportHTML], ['Outline (Markdown)', 'Titles, bullet points and notes.', 'markdown', S.toMarkdown], ['oneSlide file (JSON)', 'Everything, to reopen here later with File › Open.', 'data_object', () => JSON.stringify(S.deck)]]
      .map(([t, d, ic, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn tonal', text:'Copy', onclick:() => ONE.copyText(fn()) }))))) },
  '-',
  { id:'close', label:'Close', icon:'close', render:() => { S.save(); const d = S.newDeck(); d.slides = [S.newSlide('title')]; openDeck(d); ONE.toast('Presentation closed. Find it again in File › Open.'); } }
]);

/* ---------- boot ---------- */
const first = S.lib.current && store.get('op-doc-' + S.lib.current);
const pendId = ONE.pendingOpen(), pend = pendId && store.get('op-doc-' + pendId);
S.open(pend || first || sampleDeck()); if (!first && !pend) S.save();
if (!pend) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => { const d = store.get('op-doc-' + id); if (d) { S.open(d); ONE.backstage.close(); } };
ONE.onNewRequest = k => openDeck((TEMPLATES[k] || TEMPLATES.material).make());
if (document.fonts) document.fonts.ready.then(() => S.refresh());
})();
