/* oneWord — features: formatting, dialogs, inserts, references, tables, pictures, comments, tracking, find */
(() => {
'use strict';
const { $, $$, esc, el, icon, store } = ONE;
const E = W.editor, sheet = W.sheet;
const A = W.act = {}, P = W.pops = {};
const today = () => new Date();
const ptToPx = pt => pt * 4 / 3;

/* ---------- fonts ---------- */
W.setFont = stack => W.applyInline({ fontFamily:stack });
W.setSize = pt => W.applyInline({ fontSize:pt + 'pt' });
W.stepSize = dir => {
  const cur = parseFloat($('#fontSize').value) || 11;
  const next = dir > 0 ? (W.SIZES_PT.find(s => s > cur) || cur + 10) : ([...W.SIZES_PT].reverse().find(s => s < cur) || Math.max(1, cur - 1));
  W.setSize(next); $('#fontSize').value = next;
};

/* ---------- styles ---------- */
W.STYLES = [
  ['p', 'Normal', 'font-size:13px'], ['p.nospace', 'No Spacing', 'font-size:13px'],
  ['h1', 'Heading 1', 'font-size:16px;color:var(--hc)'], ['h2', 'Heading 2', 'font-size:14px;color:var(--hc)'], ['h3', 'Heading 3', 'font-size:13px;color:var(--hc3)'], ['h4', 'Heading 4', 'font-size:13px;font-style:italic;color:var(--hc)'],
  ['h1.title', 'Title', 'font-size:21px;letter-spacing:-.5px'], ['p.subtitle', 'Subtitle', 'font-size:12px;color:#5a5a5a;letter-spacing:.6px'],
  ['blockquote.quote', 'Quote', 'font-size:13px;font-style:italic;color:#404040'], ['blockquote', 'Intense Quote', 'font-size:13px;font-style:italic;color:var(--hc)']
];
W.setStyle = key => {
  if (W.isRO()) return W.roToast();
  const [tag, cls] = key.split('.');
  W.restore(); document.execCommand('formatBlock', false, `<${tag}>`);
  W.saved = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : W.saved;
  W.blocks().forEach(b => { if (b.tagName.toLowerCase() === tag) b.className = cls || ''; });
  W.changed();
};

/* ---------- case, effects ---------- */
W.changeCase = fn => {
  W.restore(); const s = getSelection();
  if (s.isCollapsed && !W.selectWord()) return ONE.toast('Select some text first, then change its case.');
  const t = getSelection().toString(); document.execCommand('insertText', false, fn(t));
  const o = W.caretOffsets(); if (o) W.select(W.rangeFromOffsets(o[0] - t.length, o[0]));
  W.changed();
};
const CASES = [
  ['Sentence case.', t => t.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  ['lowercase', t => t.toLowerCase()], ['UPPERCASE', t => t.toUpperCase()],
  ['Capitalize Each Word', t => t.toLowerCase().replace(/(^|[\s(“"'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
  ['tOGGLE cASE', t => [...t].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('')]
];
P.case = a => ONE.menuAt(a, CASES.map(([l, f]) => ({ label:l, on:() => W.changeCase(f) })));
P.effects = a => ONE.menuAt(a, [
  { title:'Text effects' },
  { label:'Shadow', icon:'blur_on', on:() => W.applyInline({ textShadow:'1.5px 1.5px 2px rgba(0,0,0,.45)' }) },
  { label:'Outline', icon:'border_style', on:() => W.applyInline({ webkitTextStroke:'.8px currentColor', color:'transparent' }) },
  { label:'Glow', icon:'flare', on:() => W.applyInline({ textShadow:'0 0 4px #ffc000, 0 0 10px #ffc000' }) },
  { label:'Emboss', icon:'layers', on:() => W.applyInline({ textShadow:'-1px -1px 0 rgba(255,255,255,.8), 1px 1px 1px rgba(0,0,0,.35)' }) },
  { label:'Small Caps', icon:'text_fields', kbd:'Ctrl+Shift+K', on:() => W.applyInline({ fontVariant:'small-caps' }) },
  { label:'All Caps', icon:'match_case', kbd:'Ctrl+Shift+A', on:() => W.applyInline({ textTransform:'uppercase' }) },
  '-',
  { label:'Clear text effects', icon:'format_clear', on:() => W.applyInline({}, { clear:['textShadow','webkitTextStroke','fontVariant','textTransform'] }) }
]);
P.underline = a => ONE.menuAt(a, [
  ...[['Single','solid'],['Double','double'],['Thick','solid',3],['Dotted','dotted'],['Dashed','dashed'],['Wavy','wavy']].map(([n, st, th]) => ({
    html:`<span style="text-decoration:underline ${st};text-decoration-thickness:${th || 1.5}px;text-underline-offset:3px">${n} underline</span>`,
    on:() => W.applyInline({ textDecorationLine:'underline', textDecorationStyle:st, textDecorationThickness:th ? th + 'px' : '' }) })),
  '-', { label:'Underline color…', icon:'format_color_text', on:() => ONE.pop.open(a, ONE.colorGrid(c => W.applyInline({ textDecorationLine:'underline', textDecorationColor:c || '' }), { autoLabel:'Automatic' })) },
  { label:'No underline', icon:'format_clear', on:() => W.applyInline({ textDecorationLine:'none' }, { clear:['textDecorationStyle','textDecorationColor','textDecorationThickness'] }) }
]);
W.fore = '#C00000'; W.hi = '#FFFF00';
W.applyFore = c => { if (c && c !== 'none') { W.fore = c; const b = $('#barFore'); if (b) b.style.background = c; } W.exec('foreColor', c && c !== 'none' ? c : '#000000'); };
W.applyHi = c => { if (c && c !== 'none') { W.hi = c; const b = $('#barHi'); if (b) b.style.background = c; } W.exec('hiliteColor', c && c !== 'none' ? c : 'transparent'); };
P.fore = a => ONE.pop.open(a, ONE.colorGrid(W.applyFore, { autoLabel:'Automatic' }));
const HILITE = [['Yellow','#FFFF00'],['Bright Green','#00FF00'],['Turquoise','#00FFFF'],['Pink','#FF00FF'],['Blue','#0000FF'],['Red','#FF0000'],['Dark Blue','#000080'],['Teal','#008080'],['Green','#008000'],['Violet','#800080'],['Dark Red','#800000'],['Dark Yellow','#808000'],['Gray 50%','#808080'],['Gray 25%','#C0C0C0'],['Black','#000000']];
P.hilite = a => {
  const d = el('div', { class:'colorpop' }, el('div', { class:'menu-title', text:'Highlight colors' }));
  const g = el('div', { class:'cgrid', style:{ gridTemplateColumns:'repeat(5,28px)' } });
  HILITE.forEach(([n, c]) => g.append(el('button', { class:'sw top', style:{ background:c, width:'28px', height:'22px' }, title:n, 'aria-label':n, onclick:() => { ONE.pop.close(); W.applyHi(c); } })));
  d.append(g, ONE.menu([{ label:'No Color', icon:'format_color_reset', on:() => W.applyHi('none') }]));
  ONE.pop.open(a, d);
};

/* ---------- paragraph ---------- */
W.forBlocks = fn => { if (W.isRO()) return W.roToast(); W.restore(); W.ensureBlock(); W.blocks().forEach(fn); W.changed(); };
W.lineSpacing = v => W.forBlocks(b => { b.style.lineHeight = v ? (v * 1.2).toFixed(2) : ''; });
P.spacing = a => {
  const b = W.block(), cur = b && b.style.lineHeight ? parseFloat(b.style.lineHeight) / 1.2 : null;
  const bs = b ? getComputedStyle(b) : null, hasBefore = bs && parseFloat(bs.marginTop) > 1, hasAfter = bs && parseFloat(bs.marginBottom) > 1;
  ONE.menuAt(a, [{ title:'Line spacing' }, ...[1, 1.15, 1.5, 2, 2.5, 3].map(v => ({ label:v.toFixed(v === 1.15 ? 2 : 1), checked:cur ? Math.abs(cur - v) < .01 : false, on:() => W.lineSpacing(v) })),
    { label:'Default (document)', checked:!cur, on:() => W.lineSpacing(0) }, '-',
    { label:'Line Spacing Options…', icon:'tune', on:W.paraDialog },
    { label:hasBefore ? 'Remove Space Before Paragraph' : 'Add Space Before Paragraph', icon:'vertical_align_top', on:() => W.forBlocks(x => W.setBlockStyle(x, 'marginTop', hasBefore ? '0' : '12pt')) },
    { label:hasAfter ? 'Remove Space After Paragraph' : 'Add Space After Paragraph', icon:'vertical_align_bottom', on:() => W.forBlocks(x => { x.style.marginBottom = hasAfter ? '0' : '8pt'; }) }]);
};
W.lastShade = '#D9E2F3';
W.applyShade = c => { const v = c && c !== 'none' ? c : ''; if (v) W.lastShade = v; const cells = W.tblCells(); if (cells.length) { cells.forEach(x => x.style.backgroundColor = v); W.changed(); } else W.forBlocks(b => b.style.backgroundColor = v); };
P.shade = a => ONE.pop.open(a, ONE.colorGrid(W.applyShade, { noneLabel:'No Color' }));
W.shade = () => W.applyShade(W.lastShade);
P.borders = a => {
  const set = (css) => W.forBlocks(b => { ['borderTop','borderBottom','borderLeft','borderRight','padding'].forEach(p => b.style[p] = ''); Object.assign(b.style, css); });
  const line = '1px solid currentColor';
  ONE.menuAt(a, [
    { label:'Bottom Border', icon:'border_bottom', on:() => set({ borderBottom:line, paddingBottom:'2pt' }) },
    { label:'Top Border', icon:'border_top', on:() => set({ borderTop:line, paddingTop:'2pt' }) },
    { label:'Left Border', icon:'border_left', on:() => set({ borderLeft:line, paddingLeft:'6pt' }) },
    { label:'Right Border', icon:'border_right', on:() => set({ borderRight:line, paddingRight:'6pt' }) },
    { label:'Outside Borders', icon:'border_outer', on:() => set({ borderTop:line, borderBottom:line, borderLeft:line, borderRight:line, padding:'2pt 4pt' }) },
    { label:'Thick Bottom Border', icon:'border_bottom', on:() => set({ borderBottom:'3px solid currentColor', paddingBottom:'2pt' }) },
    { label:'No Border', icon:'border_clear', on:() => set({}) }, '-',
    { label:'Horizontal Line', icon:'horizontal_rule', on:A.hr }
  ]);
};
const BULLETS = [['disc','•'],['circle','○'],['square','■'],['"✓  "','✓'],['"➢  "','➢'],['"◆  "','◆'],['"–  "','–'],['"★  "','★']];
W.listStyle = (ordered, type) => {
  if (W.isRO()) return W.roToast();
  W.restore(); const b = W.block(); let list = b && b.closest('ul,ol');
  const want = ordered ? 'OL' : 'UL';
  if (!list || list.tagName !== want) { document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList'); W.saved = getSelection().getRangeAt(0).cloneRange(); list = W.block() && W.block().closest('ul,ol'); }
  if (list) list.style.listStyleType = type;
  W.changed();
};
P.bullets = a => {
  const g = el('div', { class:'symgrid', style:{ gridTemplateColumns:'repeat(4,44px)' } });
  BULLETS.forEach(([t, g1]) => g.append(el('button', { style:{ height:'44px', fontSize:'22px' }, text:g1, onclick:() => { ONE.pop.close(); W.listStyle(false, t); } })));
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Bullet library' }), g, ONE.menu([{ label:'None', icon:'format_clear', on:() => { const l = W.block() && W.block().closest('ul'); if (l) W.exec('insertUnorderedList'); } }])));
};
const NUMS = [['decimal','1. 2. 3.'],['upper-roman','I. II. III.'],['upper-alpha','A. B. C.'],['lower-alpha','a. b. c.'],['lower-roman','i. ii. iii.'],['decimal-leading-zero','01. 02. 03.']];
P.numbering = a => ONE.menuAt(a, [{ title:'Numbering library' }, ...NUMS.map(([t, l]) => ({ label:l, on:() => W.listStyle(true, t) })), '-',
  { label:'Set Numbering Value…', icon:'pin', on:() => {
    const l = W.block() && W.block().closest('ol'); if (!l) return ONE.toast('Put the cursor in a numbered list first.');
    const i = ONE.input({ type:'number', value:l.start || 1, min:0 });
    ONE.modal({ title:'Set Numbering Value', body:ONE.field('Set value to', i), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { l.start = parseInt(i.value) || 1; W.changed(); } }] });
  } }]);
P.sort = a => ONE.menuAt(a, [{ label:'Sort A to Z', icon:'arrow_upward', on:() => W.sortBlocks(1) }, { label:'Sort Z to A', icon:'arrow_downward', on:() => W.sortBlocks(-1) }]);
W.sortBlocks = dir => {
  if (W.cell()) return W.tblSort(dir);
  const bl = W.blocks(); if (bl.length < 2) return ONE.toast('Select two or more paragraphs to sort.');
  const parent = bl[0].parentNode; if (!bl.every(b => b.parentNode === parent)) return ONE.toast('Select paragraphs at the same level to sort them.');
  const anchor = bl[bl.length - 1].nextSibling;
  bl.sort((x, y) => dir * x.textContent.localeCompare(y.textContent, undefined, { numeric:true, sensitivity:'base' })).forEach(b => parent.insertBefore(b, anchor));
  W.changed(); ONE.toast(`Sorted ${bl.length} paragraphs.`);
};
W.marks = () => { E.classList.toggle('marks'); ONE.ribbon.refresh(); };

/* ---------- dialogs: Font / Paragraph ---------- */
W.fontDialog = () => {
  W.restore(); const s = getSelection(); const n = s.rangeCount ? (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode) : E;
  const cs = getComputedStyle(n), fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const font = ONE.select(W.FONTS.map(f => f[0]), (W.FONTS.find(f => f[0].toLowerCase() === fam.toLowerCase()) || ['Calibri'])[0]);
  const bold = parseInt(cs.fontWeight) >= 600, ital = cs.fontStyle === 'italic';
  const style = ONE.select(['Regular','Italic','Bold','Bold Italic'], bold && ital ? 'Bold Italic' : bold ? 'Bold' : ital ? 'Italic' : 'Regular');
  const size = ONE.input({ type:'number', value:Math.round(parseFloat(cs.fontSize) * .75 * 2) / 2, min:1, max:1638, step:.5 });
  const color = ONE.input({ type:'color', value:rgbHex(cs.color), style:{ padding:'4px', height:'44px' } });
  const ul = ONE.select([['none','(none)'],['solid','Single'],['double','Double'],['dotted','Dotted'],['dashed','Dashed'],['wavy','Wave']], cs.textDecorationLine.includes('underline') ? cs.textDecorationStyle : 'none');
  const ulc = ONE.input({ type:'color', value:rgbHex(cs.textDecorationColor), style:{ padding:'4px', height:'44px' } });
  const fx = {};
  [['strike','Strikethrough', cs.textDecorationLine.includes('line-through') && cs.textDecorationStyle !== 'double'], ['dstrike','Double strikethrough', cs.textDecorationLine.includes('line-through') && cs.textDecorationStyle === 'double'], ['sup','Superscript', cs.verticalAlign === 'super'], ['sub','Subscript', cs.verticalAlign === 'sub'], ['caps','Small caps', cs.fontVariant.includes('small-caps')], ['all','All caps', cs.textTransform === 'uppercase']].forEach(([k, l, v]) => fx[k] = ONE.check(l, v));
  const sp = ONE.select([['normal','Normal'],['exp','Expanded'],['cond','Condensed']], parseFloat(cs.letterSpacing) > 0 ? 'exp' : parseFloat(cs.letterSpacing) < 0 ? 'cond' : 'normal');
  const by = ONE.input({ type:'number', value:Math.abs(Math.round(parseFloat(cs.letterSpacing) * .75 * 10) / 10) || 1, step:.1, min:0 });
  const prev = el('div', { class:'preview-box', text:(s.toString().trim() || 'The quick brown fox').slice(0, 40) });
  const build = () => {
    const f = W.FONTS.find(x => x[0] === font.value), st = style.value;
    const lines = []; if (ul.value !== 'none') lines.push('underline'); if (fx.strike.input.checked || fx.dstrike.input.checked) lines.push('line-through');
    const pt = parseFloat(size.value) || 11;
    return { fontFamily:f[1], fontWeight:st.includes('Bold') ? '700' : '400', fontStyle:st.includes('Italic') ? 'italic' : 'normal', fontSize:(fx.sup.input.checked || fx.sub.input.checked ? pt * .66 : pt) + 'pt', color:color.value,
      textDecorationLine:lines.join(' ') || 'none', textDecorationStyle:fx.dstrike.input.checked ? 'double' : (ul.value !== 'none' ? ul.value : 'solid'), textDecorationColor:ul.value !== 'none' ? ulc.value : '',
      verticalAlign:fx.sup.input.checked ? 'super' : fx.sub.input.checked ? 'sub' : 'baseline', fontVariant:fx.caps.input.checked ? 'small-caps' : 'normal', textTransform:fx.all.input.checked ? 'uppercase' : 'none',
      letterSpacing:sp.value === 'normal' ? 'normal' : (sp.value === 'exp' ? 1 : -1) * (parseFloat(by.value) || 0) + 'pt' };
  };
  const upd = () => Object.assign(prev.style, build());
  const body = el('div', { class:'dlg-col' },
    el('div', { class:'grid3' }, ONE.field('Font', font), ONE.field('Font style', style), ONE.field('Size', size)),
    el('div', { class:'grid3' }, ONE.field('Font color', color), ONE.field('Underline style', ul), ONE.field('Underline color', ulc)),
    el('div', { class:'fieldset-title', text:'Effects' }), el('div', { class:'grid2' }, ...Object.values(fx).map(x => x.wrap)),
    el('div', { class:'fieldset-title', text:'Character spacing' }), el('div', { class:'grid2' }, ONE.field('Spacing', sp), ONE.field('By (pt)', by)),
    el('div', { class:'fieldset-title', text:'Preview' }), prev);
  body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
  ONE.modal({ title:'Font', width:560, body, actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { W.select(W.saved); W.applyInline(build()); } }] });
};
function rgbHex(c){ const m = String(c).match(/\d+(\.\d+)?/g); if (!m) return '#000000'; return '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join(''); }
W.rgbHex = rgbHex;
W.paraDialog = () => {
  W.restore(); W.ensureBlock(); const b = W.block(); if (!b) return;
  const cs = getComputedStyle(b);
  const align = ONE.select([['left','Left'],['center','Centered'],['right','Right'],['justify','Justified']], cs.textAlign === 'start' ? 'left' : cs.textAlign);
  const ti = parseFloat(cs.textIndent) / 96;
  const il = ONE.input({ type:'number', step:.1, value:+((parseFloat(cs.marginLeft) + (ti < 0 ? ti * 96 : 0)) / 96).toFixed(2) });
  const ir = ONE.input({ type:'number', step:.1, value:+(parseFloat(cs.marginRight) / 96).toFixed(2) });
  const special = ONE.select([['none','(none)'],['first','First line'],['hanging','Hanging']], ti > 0 ? 'first' : ti < 0 ? 'hanging' : 'none');
  const by = ONE.input({ type:'number', step:.1, value:Math.abs(ti).toFixed(2) || .5 });
  const mt = b.dataset.push ? (parseFloat(b.dataset.mt) || 0) : parseFloat(cs.marginTop) * .75;
  const before = ONE.input({ type:'number', step:6, value:Math.round(mt) }), after = ONE.input({ type:'number', step:6, value:Math.round(parseFloat(cs.marginBottom) * .75) });
  const lhNow = b.style.lineHeight ? parseFloat(b.style.lineHeight) / 1.2 : 1.08;
  const ls = ONE.select([['1','Single'],['1.5','1.5 lines'],['2','Double'],['m','Multiple']], ['1','1.5','2'].includes(String(lhNow)) ? String(lhNow) : 'm');
  const at = ONE.input({ type:'number', step:.05, value:+lhNow.toFixed(2) });
  const pbb = ONE.check('Page break before', !!b.dataset.pbb);
  const body = el('div', { class:'dlg-col' },
    el('div', { class:'grid2' }, ONE.field('Alignment', align), el('span')),
    el('div', { class:'fieldset-title', text:'Indentation (inches)' }),
    el('div', { class:'grid2' }, ONE.field('Left', il), ONE.field('Right', ir), ONE.field('Special', special), ONE.field('By', by)),
    el('div', { class:'fieldset-title', text:'Spacing' }),
    el('div', { class:'grid2' }, ONE.field('Before (pt)', before), ONE.field('After (pt)', after), ONE.field('Line spacing', ls), ONE.field('At', at)),
    pbb.wrap);
  ls.onchange = () => { if (ls.value !== 'm') at.value = ls.value; };
  ONE.modal({ title:'Paragraph', width:520, body, actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => {
    W.select(W.saved);
    W.forBlocks(x => {
      const L = parseFloat(il.value) || 0, B = parseFloat(by.value) || 0;
      x.style.textAlign = align.value === 'left' ? '' : align.value;
      x.style.textIndent = special.value === 'first' ? B + 'in' : special.value === 'hanging' ? -B + 'in' : '';
      x.style.marginLeft = (special.value === 'hanging' ? L + B : L) ? (special.value === 'hanging' ? L + B : L) + 'in' : '';
      x.style.marginRight = parseFloat(ir.value) ? ir.value + 'in' : '';
      W.setBlockStyle(x, 'marginTop', before.value + 'pt'); x.style.marginBottom = after.value + 'pt';
      const m = ls.value === 'm' ? parseFloat(at.value) : parseFloat(ls.value); x.style.lineHeight = m ? (m * 1.2).toFixed(2) : '';
      if (pbb.input.checked) x.dataset.pbb = '1'; else delete x.dataset.pbb;
    });
  } }] });
};
W.setIndentSpacing = (which, v) => W.forBlocks(b => {
  if (which === 'indL') b.style.marginLeft = v ? v + 'in' : ''; if (which === 'indR') b.style.marginRight = v ? v + 'in' : '';
  if (which === 'spB') W.setBlockStyle(b, 'marginTop', v + 'pt'); if (which === 'spA') b.style.marginBottom = v + 'pt';
});

/* ---------- layout dialogs ---------- */
W.marginsDialog = () => {
  const L = W.doc.layout, f = v => ONE.input({ type:'number', step:.1, min:0, value:+(v / 96).toFixed(2) });
  const t = f(L.m[0]), r = f(L.m[1]), b = f(L.m[2]), l = f(L.m[3]);
  const orient = ONE.select([['portrait','Portrait'],['landscape','Landscape']], L.orient), size = ONE.select(Object.entries(W.SIZES).map(([k, s]) => [k, `${s.name} (${s.d})`]), L.size);
  ONE.modal({ title:'Page Setup', width:480, body:el('div', { class:'dlg-col' }, el('div', { class:'fieldset-title', text:'Margins (inches)' }), el('div', { class:'grid2' }, ONE.field('Top', t), ONE.field('Bottom', b), ONE.field('Left', l), ONE.field('Right', r)), el('div', { class:'grid2' }, ONE.field('Orientation', orient), ONE.field('Paper size', size))),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const px = i => Math.max(0, Math.round((parseFloat(i.value) || 0) * 96)); L.m = [px(t), px(r), px(b), px(l)]; L.margin = 'custom'; L.orient = orient.value; L.size = size.value; W.applyLayout(); W.changed({ history:false }); } }] });
};

/* ---------- insert helpers ---------- */
W.insertHTML = html => { if (W.isRO()) return W.roToast(); W.restore(); document.execCommand('insertHTML', false, html); W.changed(); };
W.insertAndSelect = text => {
  W.restore(); const o = W.caretOffsets(); const start = o ? Math.min(o[0], o[1]) : 0;
  document.execCommand('insertText', false, text); W.select(W.rangeFromOffsets(start, start + text.length));
};
W.atDocStart = html => { const t = document.createElement('div'); t.innerHTML = html; E.prepend(...t.childNodes); W.changed(); E.scrollIntoView ? $('#canvas').scrollTo({ top:0, behavior:'smooth' }) : 0; };
A.pageBreak = () => W.insertHTML('<div class="pgbreak" contenteditable="false"></div><p><br></p>');
A.colBreak = () => W.insertHTML('<div class="colbreak" contenteditable="false"></div><p><br></p>');
A.blankPage = () => W.insertHTML('<div class="pgbreak" contenteditable="false"></div><p><br></p><div class="pgbreak" contenteditable="false"></div><p><br></p>');
A.hr = () => W.insertHTML('<hr><p><br></p>');
A.picture = () => $('#picInput').click();
W.insertImageFile = f => { const r = new FileReader(); r.onload = () => W.insertHTML(`<img src="${r.result}" alt="" style="width:${Math.min(4, 4)}in">`); r.readAsDataURL(f); };
$('#picInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) W.insertImageFile(f); e.target.value = ''; });

/* tables */
W.insertTable = (rows, cols) => {
  const head = '<tr>' + '<th><br></th>'.repeat(cols) + '</tr>', tr = '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
  W.insertHTML(`<table><tbody>${rows > 1 ? head + tr.repeat(rows - 1) : tr}</tbody></table><p><br></p>`);
};
P.table = a => {
  const lab = el('div', { class:'menu-title', text:'Insert Table' }), g = el('div', { class:'tgrid nomd' });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) g.append(el('span', { 'data-r':r, 'data-c':c }));
  g.addEventListener('pointerover', e => { const t = e.target.dataset; if (t.r == null) return; $$('span', g).forEach(s => s.classList.toggle('hot', +s.dataset.r <= +t.r && +s.dataset.c <= +t.c)); lab.textContent = `${+t.c + 1}×${+t.r + 1} Table`; });
  g.addEventListener('mousedown', e => e.preventDefault());
  g.addEventListener('click', e => { const t = e.target.dataset; if (t.r == null) return; ONE.pop.close(); W.insertTable(+t.r + 1, +t.c + 1); });
  ONE.pop.open(a, el('div', {}, lab, g, ONE.menu([{ label:'Insert Table…', icon:'table', on:W.tableDialog }, { label:'Convert Text to Table', icon:'table_rows', on:W.textToTable }, { label:'Quick Table: Calendar', icon:'calendar_month', on:W.quickCalendar }])));
};
W.tableDialog = () => {
  const c = ONE.input({ type:'number', value:3, min:1, max:30 }), r = ONE.input({ type:'number', value:4, min:1, max:200 }), h = ONE.check('Header row', true);
  ONE.modal({ title:'Insert Table', body:el('div', { class:'dlg-col' }, el('div', { class:'grid2' }, ONE.field('Number of columns', c), ONE.field('Number of rows', r)), h.wrap),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { const cols = ONE.clamp(parseInt(c.value) || 3, 1, 30), rows = ONE.clamp(parseInt(r.value) || 4, 1, 200); if (h.input.checked) W.insertTable(rows, cols); else W.insertHTML(`<table><tbody>${('<tr>' + '<td><br></td>'.repeat(cols) + '</tr>').repeat(rows)}</tbody></table><p><br></p>`); } }] });
};
W.textToTable = () => {
  const bl = W.blocks().filter(b => b.tagName === 'P'); if (!bl.length) return ONE.toast('Select paragraphs separated by tabs or commas.');
  const rows = bl.map(b => b.textContent.split(/\t|,\s*/));
  const n = Math.max(...rows.map(r => r.length));
  const t = document.createElement('table'); t.innerHTML = '<tbody>' + rows.map(r => '<tr>' + Array.from({ length:n }, (_, i) => `<td>${esc(r[i] || '') || '<br>'}</td>`).join('') + '</tr>').join('') + '</tbody>';
  bl[0].before(t); bl.forEach(b => b.remove()); W.changed();
};
W.quickCalendar = () => {
  const d = today(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  let html = `<p style="text-align:center"><b>${d.toLocaleString(undefined, { month:'long', year:'numeric' })}</b></p><table class="t-accent"><tbody><tr>${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x => `<th>${x}</th>`).join('')}</tr>`;
  let day = 1 - first;
  while (day <= days) { html += '<tr>' + Array.from({ length:7 }, () => { const v = day++; return `<td>${v >= 1 && v <= days ? v : '<br>'}</td>`; }).join('') + '</tr>'; }
  W.insertHTML(html + '</tbody></table><p><br></p>');
};

/* shapes & charts */
const SHAPES = {
  Rectangle:'<rect x="6" y="18" width="88" height="64"/>', 'Rounded Rectangle':'<rect x="6" y="18" width="88" height="64" rx="14"/>', Oval:'<ellipse cx="50" cy="50" rx="44" ry="32"/>',
  Triangle:'<polygon points="50,10 94,88 6,88"/>', Diamond:'<polygon points="50,6 94,50 50,94 6,50"/>', Hexagon:'<polygon points="28,10 72,10 94,50 72,90 28,90 6,50"/>',
  'Right Arrow':'<polygon points="6,34 60,34 60,14 94,50 60,86 60,66 6,66"/>', Star:'<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38"/>',
  Heart:'<path d="M50 88 C20 66 6 50 6 32 A20 20 0 0 1 50 24 A20 20 0 0 1 94 32 C94 50 80 66 50 88Z"/>', Callout:'<path d="M8 12h84v54H42L24 88V66H8z"/>'
};
W.shapeSVG = (name, fill = '#4472C4') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${fill}" stroke="#2F528F" stroke-width="1.5">${SHAPES[name]}</svg>`;
const svgURI = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
P.shapes = a => {
  const g = el('div', { class:'shapegrid' });
  Object.keys(SHAPES).forEach(n => g.append(el('button', { title:n, 'aria-label':n, html:`<img alt="" src="${svgURI(W.shapeSVG(n))}">`, onclick:() => { ONE.pop.close(); W.insertHTML(`<img class="shape" alt="${esc(n)}" src="${svgURI(W.shapeSVG(n))}" style="width:1.4in">`); } })));
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Basic shapes' }), g));
};
const PAL = ['#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5','#70AD47','#264478','#9E480E'];
W.chartSVG = (type, title, rows) => {
  const Wd = 520, Ht = 300, pad = { l:48, r:18, t:title ? 40 : 18, b:44 }, iw = Wd - pad.l - pad.r, ih = Ht - pad.t - pad.b;
  const max = Math.max(1, ...rows.map(r => r[1])), nice = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / nice) * nice;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${Ht}" font-family="Calibri, Carlito, Arial, sans-serif" font-size="12"><rect width="${Wd}" height="${Ht}" fill="#fff"/>`;
  if (title) s += `<text x="${Wd / 2}" y="24" text-anchor="middle" font-size="16" fill="#404040">${esc(title)}</text>`;
  if (type === 'pie') {
    const tot = rows.reduce((a, r) => a + Math.max(0, r[1]), 0) || 1, cx = 170, cy = pad.t + ih / 2 + 4, R = Math.min(ih / 2, 110); let ang = -Math.PI / 2;
    rows.forEach((r, i) => { const v = Math.max(0, r[1]) / tot, a2 = ang + v * Math.PI * 2, large = v > .5 ? 1 : 0;
      const p = v >= .9999 ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${PAL[i % 8]}"/>` : `<path d="M${cx} ${cy} L${cx + R * Math.cos(ang)} ${cy + R * Math.sin(ang)} A${R} ${R} 0 ${large} 1 ${cx + R * Math.cos(a2)} ${cy + R * Math.sin(a2)}Z" fill="${PAL[i % 8]}" stroke="#fff" stroke-width="2"/>`;
      s += p; s += `<rect x="330" y="${pad.t + 10 + i * 22}" width="12" height="12" fill="${PAL[i % 8]}"/><text x="348" y="${pad.t + 21 + i * 22}" fill="#404040">${esc(r[0])} (${Math.round(v * 100)}%)</text>`; ang = a2; });
    return s + '</svg>';
  }
  for (let i = 0; i <= 4; i++) { const y = pad.t + ih - ih * i / 4; s += `<line x1="${pad.l}" x2="${Wd - pad.r}" y1="${y}" y2="${y}" stroke="#e5e5e5"/><text x="${pad.l - 6}" y="${y + 4}" text-anchor="end" fill="#595959">${+(top * i / 4).toFixed(2)}</text>`; }
  const n = rows.length, bw = iw / n;
  if (type === 'line') {
    const pts = rows.map((r, i) => [pad.l + bw * (i + .5), pad.t + ih - ih * r[1] / top]);
    s += `<polyline fill="none" stroke="${PAL[0]}" stroke-width="3" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/>` + pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="#fff" stroke="${PAL[0]}" stroke-width="2.5"/>`).join('');
  } else if (type === 'bar') {
    s = s.replace(/<line[^>]*\/><text[^>]*>[^<]*<\/text>/g, '');
    const bh = ih / n;
    rows.forEach((r, i) => { const w = iw * r[1] / top; s += `<rect x="${pad.l + 40}" y="${pad.t + bh * i + bh * .18}" width="${Math.max(0, w - 40)}" height="${bh * .64}" fill="${PAL[0]}"/><text x="${pad.l + 34}" y="${pad.t + bh * i + bh / 2 + 4}" text-anchor="end" fill="#595959">${esc(r[0])}</text><text x="${pad.l + 44 + Math.max(0, w - 40)}" y="${pad.t + bh * i + bh / 2 + 4}" fill="#404040">${r[1]}</text>`; });
    return s + '</svg>';
  } else rows.forEach((r, i) => { const h = ih * r[1] / top; s += `<rect x="${pad.l + bw * i + bw * .2}" y="${pad.t + ih - h}" width="${bw * .6}" height="${Math.max(0, h)}" fill="${PAL[0]}" rx="2"/>`; });
  rows.forEach((r, i) => s += `<text x="${pad.l + bw * (i + .5)}" y="${Ht - pad.b + 18}" text-anchor="middle" fill="#595959">${esc(r[0])}</text>`);
  return s + `<line x1="${pad.l}" x2="${Wd - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}" stroke="#bfbfbf"/></svg>`;
};
W.parseChartData = t => t.split('\n').map(l => l.split(/[,\t]/)).filter(p => p.length >= 2 && p[0].trim()).map(p => [p[0].trim(), parseFloat(p[1]) || 0]);
A.chart = () => {
  const type = ONE.select([['column','Column'],['bar','Bar'],['line','Line'],['pie','Pie']], 'column'), title = ONE.input({ value:'Produce donated (lb)' });
  const data = el('textarea', { class:'tf', rows:6 }); data.value = 'April, 42\nMay, 68\nJune, 95\nJuly, 120\nAugust, 88';
  const prev = el('div', { class:'chart-prev' });
  const upd = () => { prev.innerHTML = `<img alt="" src="${svgURI(W.chartSVG(type.value, title.value, W.parseChartData(data.value)))}">`; };
  const body = el('div', { class:'dlg-col' }, el('div', { class:'grid2' }, ONE.field('Chart type', type), ONE.field('Chart title', title)), ONE.field('Data (one “label, value” per line)', data), prev);
  body.addEventListener('input', upd); body.addEventListener('change', upd); upd();
  ONE.modal({ title:'Insert Chart', width:580, body, actions:[{ label:'Cancel' }, { label:'Insert', kind:'filled', on:() => { const rows = W.parseChartData(data.value); W.insertHTML(`<img class="chart" alt="${esc(title.value + ': ' + rows.map(r => r[0] + ' ' + r[1]).join(', '))}" src="${svgURI(W.chartSVG(type.value, title.value, rows))}" style="width:5.4in">`); } }] });
};

/* links, bookmarks */
W.anchors = () => [...$$('h1,h2,h3,h4', E).filter(h => h.textContent.trim()).map(h => { if (!h.id) h.id = 'h-' + ONE.uid(); return ['#' + h.id, (h.classList.contains('title') ? 'Title: ' : 'Heading: ') + h.textContent.trim().slice(0, 50)]; }),
  ...$$('a.bm', E).map(b => ['#' + b.id, 'Bookmark: ' + b.id.replace(/^bm-/, '')])];
P.link = a => {
  const r = W.saved, startEl = r && (r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer);
  const existing = startEl && startEl.closest && startEl.closest('a:not(.bm)');
  const collapsed = !r || r.collapsed;
  const text = ONE.input({ value:existing ? existing.textContent : (r ? r.toString() : ''), disabled:!(collapsed || existing) });
  const url = ONE.input({ placeholder:'https://example.com', value:existing ? existing.getAttribute('href') : '' });
  const place = ONE.select([['', 'Web address or email'], ...W.anchors()], existing && existing.getAttribute('href').startsWith('#') ? existing.getAttribute('href') : '');
  place.onchange = () => { if (place.value) url.value = place.value; };
  const f = el('form', { class:'dlg-col', style:{ padding:'10px 12px', width:'min(340px, calc(100vw - 40px))' } }, ONE.field('Text to display', text), ONE.field('Address', url), ONE.field('Place in this document', place), el('div', { class:'btns' }));
  const btns = f.lastChild; btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  if (existing) btns.append(el('button', { type:'button', class:'btn text', text:'Remove Link', onclick:() => { ONE.pop.close(); const rr = document.createRange(); rr.selectNodeContents(existing); W.saved = rr; W.exec('unlink'); } }));
  btns.append(el('button', { type:'submit', class:'btn filled', text:'Insert' }));
  f.onsubmit = e => {
    e.preventDefault(); let u = url.value.trim(); if (!u) return url.focus();
    if (/^\s*(javascript|vbscript|data):/i.test(u)) return ONE.toast('That kind of link isn’t allowed.');
    if (!/^(https?:|mailto:|tel:|#)/i.test(u)) u = (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u) ? 'mailto:' : 'https://') + u;
    ONE.pop.close();
    if (existing) { existing.setAttribute('href', u); if (text.value) existing.textContent = text.value; W.changed(); return; }
    if (collapsed) W.insertHTML(`<a href="${esc(u)}">${esc(text.value || u)}</a>&#8203;`); else W.exec('createLink', u);
  };
  ONE.pop.open(a, f);
};
A.bookmark = () => {
  const name = ONE.input({ placeholder:'e.g. BudgetSummary' });
  const list = el('div', { class:'list' });
  const render = () => { list.innerHTML = ''; $$('a.bm', E).forEach(b => list.append(el('div', { class:'list-item' }, el('span', { class:'grow', html:`<b>${esc(b.id.replace(/^bm-/, ''))}</b>` }),
    el('button', { class:'btn text', text:'Go To', onclick:() => { ONE.topModal().close(); b.scrollIntoView({ block:'center', behavior:'smooth' }); } }),
    el('button', { class:'btn text', text:'Delete', onclick:() => { b.remove(); W.changed(); render(); } })))); if (!list.children.length) list.append(el('p', { class:'muted', text:'No bookmarks yet.' })); };
  render();
  ONE.modal({ title:'Bookmark', body:el('div', { class:'dlg-col' }, ONE.field('Bookmark name', name, 'Letters, numbers and underscores; start with a letter.'), list),
    actions:[{ label:'Close' }, { label:'Add', kind:'filled', on:() => { const v = name.value.trim(); if (!/^[A-Za-z][\w]{0,39}$/.test(v)) { ONE.toast('Bookmark names start with a letter and use only letters, numbers and _.'); return false; } if ($('#bm-' + v)) { ONE.toast('A bookmark with that name already exists.'); return false; } W.insertHTML(`<a class="bm" id="bm-${v}" contenteditable="false"></a>`); ONE.toast(`Bookmark “${v}” added.`); } }] });
};

/* text box, WordArt, drop cap, signature, date, equation, symbol, cover */
A.textBox = () => W.insertHTML('<div class="textbox"><p><b>Pull quote</b></p><p>Type your text here. Text boxes float beside the paragraph they are anchored to.</p></div>');
const WORDART = [
  { backgroundImage:'linear-gradient(180deg,#8fb3f0,#1f3763)', webkitBackgroundClip:'text', backgroundClip:'text', color:'transparent' },
  { webkitTextStroke:'1.5px #4472c4', color:'#fff' },
  { color:'#ed7d31', textShadow:'3px 3px 0 #843c0c' },
  { color:'#7f6000', textShadow:'0 0 6px #ffd966, 0 0 14px #ffc000' },
  { color:'#4472c4', textShadow:'1px 1px 0 #2f5496,2px 2px 0 #2f5496,3px 3px 0 #2f5496,4px 4px 0 #1f3763' },
  { backgroundImage:'linear-gradient(180deg,#ffe699,#bf9000)', webkitBackgroundClip:'text', backgroundClip:'text', color:'transparent', webkitTextStroke:'.5px #7f6000' }
];
P.wordart = a => {
  const g = el('div', { class:'wagrid' });
  WORDART.forEach(st => { const b = el('button', { text:'A', 'aria-label':'WordArt style' }); Object.assign(b.style, st); b.onclick = () => { ONE.pop.close(); W.restore(); if (getSelection().isCollapsed) W.insertAndSelect('Your text here'); W.applyInline(Object.assign({ fontSize:'36pt', fontWeight:'700' }, st)); }; g.append(b); });
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'WordArt' }), g));
};
P.dropcap = a => {
  const b = W.block(), cur = b && b.classList.contains('dropcap') ? 'd' : b && b.classList.contains('dropcap-margin') ? 'm' : 'n';
  const set = cls => { const x = W.block(); if (!x || x.tagName !== 'P') return ONE.toast('Put the cursor in a paragraph first.'); x.classList.remove('dropcap', 'dropcap-margin'); if (cls) x.classList.add(cls); W.changed(); };
  ONE.menuAt(a, [{ label:'None', checked:cur === 'n', on:() => set('') }, { label:'Dropped', icon:'format_size', checked:cur === 'd', on:() => set('dropcap') }, { label:'In Margin', icon:'format_indent_decrease', checked:cur === 'm', on:() => set('dropcap-margin') }]);
};
A.signature = () => {
  const n = ONE.input({ value:W.settings.author === 'You' ? '' : W.settings.author, placeholder:'Jordan Lee' }), t = ONE.input({ placeholder:'Garden Coordinator' });
  ONE.modal({ title:'Signature Setup', body:el('div', { class:'dlg-col' }, ONE.field('Suggested signer', n), ONE.field("Signer's title", t)),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => W.insertHTML(`<div class="sigline"><div class="sig-x">X</div><p>${esc(n.value || 'Signer name')}</p><p>${esc(t.value || '')}</p></div><p><br></p>`) }] });
};
A.dateTime = () => {
  const d = today(), fmts = [
    d.toLocaleDateString('en-US'), d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }), d.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
    d.toLocaleDateString('en-US', { year:'2-digit', month:'numeric', day:'numeric' }), d.toISOString().slice(0, 10), d.toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }),
    d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }), d.toLocaleDateString('en-US', { month:'long', year:'numeric' }),
    d.toLocaleString('en-US', { dateStyle:'short', timeStyle:'short' }), d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }), d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })];
  const list = el('div', { class:'menu', style:{ minWidth:'auto' } });
  let m; fmts.forEach(f => list.append(el('button', { class:'menu-item', html:`<span class="mi-label">${esc(f)}</span>`, onclick:() => { m.close(); W.restore(); document.execCommand('insertText', false, f); W.changed(); } })));
  m = ONE.modal({ title:'Date and Time', body:list, actions:[{ label:'Cancel' }] });
};
const EQS = [['Area of a circle','A = πr²'],['Pythagorean theorem','a² + b² = c²'],['Quadratic formula','x = (−b ± √(b² − 4ac)) / 2a'],['Mass–energy','E = mc²'],['Binomial theorem','(x + a)ⁿ = ∑ₖ₌₀ⁿ C(n,k) xᵏ aⁿ⁻ᵏ'],['Euler’s identity','e^(iπ) + 1 = 0'],['Slope','m = (y₂ − y₁) / (x₂ − x₁)'],['Mean','x̄ = (1/n) ∑ xᵢ']];
const MATH = 'π√∑∫∂ΔθλμσΩ∞±×÷≠≈≤≥→⇒∈∉∪∩⊂∀∃¬∧∨°²³¹⁰ⁿ₁₂₃₀½¼¾'.split('');
P.equation = a => {
  const g = el('div', { class:'symgrid' });
  MATH.forEach(ch => g.append(el('button', { text:ch, onclick:() => { ONE.pop.close(); W.restore(); document.execCommand('insertText', false, ch); W.changed(); } })));
  ONE.pop.open(a, el('div', { class:'eqlist' }, ONE.menu([{ label:'Insert New Equation', icon:'functions', on:() => { W.insertHTML('<span class="eq">Type equation here</span>&#8203;'); } }, '-', { title:'Built-in' },
    ...EQS.map(([n, f]) => ({ html:`<span>${esc(n)}</span><small style="font-family:Cambria,Caladea,serif;font-style:italic;font-size:13px;color:inherit">${esc(f)}</small>`, on:() => W.insertHTML(`<span class="eq">${esc(f)}</span>&#8203;`) }))]),
    el('div', { class:'menu-title', text:'Symbols' }), g));
};
const SYMS = '©®™€£¥¢§¶†‡•…—–‰°±×÷≠≈≤≥∞√πΩαβγδµ←→↑↓↔⇐⇒✓✗★☆♥♦♣♠☺☹♪♫☀☁☂☎✉✂✈⌘⌥½¼¾¹²³«»“”‘’¿¡'.split('');
P.symbol = a => {
  const recent = store.get('ow-recent-sym', []).slice(0, 10);
  const mk = list => { const g = el('div', { class:'symgrid' }); list.forEach(ch => g.append(el('button', { text:ch, title:'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), onclick:() => { ONE.pop.close(); store.set('ow-recent-sym', [ch, ...recent.filter(x => x !== ch)].slice(0, 10)); W.restore(); document.execCommand('insertText', false, ch); W.changed(); } }))); return g; };
  ONE.pop.open(a, el('div', {}, recent.length ? el('div', { class:'menu-title', text:'Recently used' }) : null, recent.length ? mk(recent) : null, el('div', { class:'menu-title', text:'Symbols' }), mk(SYMS)));
};
const COVERS = [
  ['cv-band', 'Banded', '<i class="a" style="height:16px;margin:-14px -10px 10px"></i><i class="b"></i><i style="width:60%"></i>'],
  ['cv-facet', 'Facet', '<i class="a" style="position:absolute;width:6px;height:110px"></i><i class="b" style="margin-left:12px"></i><i style="width:50%;margin-left:12px"></i>'],
  ['cv-center', 'Centered', '<i style="margin-top:34px;width:50%;align-self:center"></i><i class="b" style="align-self:center"></i><i style="width:40%;align-self:center"></i>']
];
P.cover = a => {
  const g = el('div', { class:'cover-thumbs' });
  COVERS.forEach(([cls, name, thumb]) => g.append(el('button', { html:`<div class="ct" style="position:relative">${thumb}</div>${name}`, onclick:() => { ONE.pop.close(); W.insertCover(cls); } })));
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Built-in' }), g, ONE.menu([{ label:'Remove Current Cover Page', icon:'delete', on:() => { const c = $('.cover', E); if (!c) return ONE.toast('This document has no cover page.'); const nx = c.nextElementSibling; if (nx && nx.classList.contains('pgbreak')) nx.remove(); c.remove(); W.changed(); } }])));
};
W.insertCover = cls => {
  const old = $('.cover', E); if (old) { const nx = old.nextElementSibling; if (nx && nx.classList.contains('pgbreak')) nx.remove(); old.remove(); }
  const t = $('#docTitle').value;
  W.atDocStart(`<div class="cover ${cls}"><p class="cv-kicker">${esc(W.doc.meta.subject || 'Report')}</p><p class="cv-title">${esc(t)}</p><p class="cv-sub">Document subtitle</p><p class="cv-meta">${esc(W.doc.meta.author)} · ${today().toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' })}</p></div><div class="pgbreak" contenteditable="false"></div>`);
};

/* ---------- references ---------- */
P.toc = a => ONE.menuAt(a, [{ title:'Built-in' },
  { label:'Automatic Table 1', sub:'“Contents” with dot leaders and page numbers', icon:'toc', on:() => W.insertToc('Contents', true) },
  { label:'Automatic Table 2', sub:'“Table of Contents” with dot leaders', icon:'toc', on:() => W.insertToc('Table of Contents', true) },
  { label:'Simple', sub:'Headings and page numbers, no leaders', icon:'list', on:() => W.insertToc('Contents', false) }, '-',
  { label:'Remove Table of Contents', icon:'delete', on:() => { const t = $('.toc', E); if (t) { t.remove(); W.changed(); } else ONE.toast('No table of contents in this document.'); } }]);
W.insertToc = (title, dots) => {
  const old = $('.toc', E); const div = document.createElement('div'); div.className = 'toc' + (dots ? '' : ' nodots'); div.contentEditable = 'false'; div.dataset.title = title;
  W.buildToc(div);
  if (old) old.replaceWith(div); else { W.restore(); const b = W.block(); const top = b && [...E.children].find(c => c.contains(b)); if (top) top.before(div); else E.prepend(div); }
  W.changed(); ONE.toast('Table of contents inserted.');
};
W.buildToc = div => {
  const hs = $$('h1:not(.title),h2,h3', E).filter(h => h.textContent.trim());
  hs.forEach(h => { if (!h.id) h.id = 'h-' + ONE.uid(); });
  div.innerHTML = `<p class="toc-h">${esc(div.dataset.title || 'Contents')}</p>` + (hs.length ? hs.map(h => `<a href="#${h.id}" data-h="${h.id}" class="l${h.tagName[1]}"><span>${esc(h.textContent.trim())}</span><span class="dots"></span><span class="pg">${W.pageOfNode(h)}</span></a>`).join('') : '<p>No table of contents entries found. Apply Heading styles to your text.</p>');
};
A.updateToc = () => { const t = $$('.toc', E); if (!t.length) return ONE.toast('Insert a table of contents first (References › Table of Contents).'); t.forEach(W.buildToc); W.changed(); ONE.toast('Table of contents updated.'); };
W.hooks.push(() => $$('.toc a[data-h]', E).forEach(a => { const h = document.getElementById(a.dataset.h); const p = a.querySelector('.pg'); if (h && p) { const n = String(W.pageOfNode(h)); if (p.textContent !== n) p.textContent = n; } }));
P.addText = a => ONE.menuAt(a, [{ label:'Do Not Show in Table of Contents', on:() => W.setStyle('p') }, { label:'Level 1', on:() => W.setStyle('h1') }, { label:'Level 2', on:() => W.setStyle('h2') }, { label:'Level 3', on:() => W.setStyle('h3') }]);
A.endnote = () => {
  if (W.isRO()) return W.roToast();
  const id = ONE.uid(); W.restore();
  document.execCommand('insertHTML', false, `<sup class="fnref" data-id="${id}" contenteditable="false">*</sup>`);
  let list = $('ol.endnotes', E);
  if (!list) { E.insertAdjacentHTML('beforeend', '<hr class="endhr"><ol class="endnotes"></ol>'); list = $('ol.endnotes', E); }
  const li = el('li', { id:'en-' + id }); li.innerHTML = '<br>'; list.append(li);
  W.renumber();
  const r = document.createRange(); r.setStart(li, 0); r.collapse(true); W.select(r); li.scrollIntoView({ block:'center', behavior:'smooth' });
  W.changed(); ONE.toast('Endnote added at the end of the document. Type the note text.');
};
A.nextNote = () => {
  const refs = $$('.fnref', E); if (!refs.length) return ONE.toast('There are no endnotes.');
  const cur = W.saved; const nx = refs.find(r => cur && cur.comparePoint(r, 0) > 0) || refs[0];
  nx.scrollIntoView({ block:'center', behavior:'smooth' }); const r = document.createRange(); r.setStartAfter(nx); r.collapse(true); W.select(r);
};
E.addEventListener('click', e => {
  const f = e.target.closest('.fnref'); if (f) { const li = document.getElementById('en-' + f.dataset.id); li && li.scrollIntoView({ block:'center', behavior:'smooth' }); }
  const t = e.target.closest('.toc a'); if (t) { e.preventDefault(); const h = document.getElementById(t.dataset.h); h && h.scrollIntoView({ block:'start', behavior:'smooth' }); }
});
/* citations */
W.sourceDialog = (src, done) => {
  const s = src || { id:ONE.uid(), type:'Book', author:'', title:'', year:'', publisher:'', url:'' };
  const f = {}; ['author','title','year','publisher','url'].forEach(k => f[k] = ONE.input({ value:s[k] || '' }));
  const type = ONE.select(['Book','Journal Article','Website','Report'], s.type);
  ONE.modal({ title:src ? 'Edit Source' : 'Create Source', width:520, body:el('div', { class:'dlg-col' }, ONE.field('Type of source', type), ONE.field('Author (Last, First)', f.author), ONE.field('Title', f.title), el('div', { class:'grid2' }, ONE.field('Year', f.year), ONE.field('Publisher / Site', f.publisher)), ONE.field('URL (optional)', f.url)),
    actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => { if (!f.author.value.trim() && !f.title.value.trim()) { ONE.toast('Add at least an author or a title.'); return false; } Object.assign(s, { type:type.value }, Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value.trim()]))); if (!src) W.doc.sources.push(s); W.dirty(); done && done(s); } }] });
};
W.citeText = s => `(${(s.author || s.title || 'Anon').split(',')[0].trim()}${s.year ? ', ' + s.year : ''})`;
P.cite = a => ONE.menuAt(a, [...W.doc.sources.map(s => ({ label:W.citeText(s), sub:s.title, icon:'format_quote', on:() => W.insertHTML(`<span class="cite" data-src="${s.id}" contenteditable="false">${esc(W.citeText(s))}</span>&#8203;`) })),
  W.doc.sources.length ? '-' : null, { label:'Add New Source…', icon:'add', on:() => W.sourceDialog(null, s => W.insertHTML(`<span class="cite" data-src="${s.id}" contenteditable="false">${esc(W.citeText(s))}</span>&#8203;`)) }, { label:'Manage Sources…', icon:'library_books', on:A.sources }]);
A.sources = () => {
  const list = el('div', { class:'list' });
  const render = () => { list.innerHTML = ''; if (!W.doc.sources.length) list.append(el('p', { class:'muted', text:'No sources yet. Add one to cite it in your document.' }));
    W.doc.sources.forEach((s, i) => list.append(el('div', { class:'list-item' }, el('span', { class:'grow', html:`<b>${esc(s.title || '(untitled)')}</b><small>${esc(s.author)} ${esc(s.year)} · ${esc(s.type)}</small>` }),
      el('button', { class:'icon-btn', title:'Edit', html:icon('edit'), onclick:() => W.sourceDialog(s, () => { $$(`.cite[data-src="${s.id}"]`, E).forEach(c => c.textContent = W.citeText(s)); render(); W.changed(); }) }),
      el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => { W.doc.sources.splice(i, 1); W.dirty(); render(); } })))); };
  render();
  ONE.modal({ title:'Source Manager', width:560, body:list, actions:[{ label:'New Source…', kind:'text', on:() => { W.sourceDialog(null, render); return false; } }, { label:'Close', kind:'filled' }] });
};
A.bibliography = () => {
  if (!W.doc.sources.length) return ONE.toast('Add a source first (Insert Citation › Add New Source).');
  const src = [...W.doc.sources].sort((a, b) => (a.author || a.title).localeCompare(b.author || b.title));
  const html = `<p class="toc-h" style="font-family:var(--head-font);font-size:16pt;color:var(--h-color)">References</p>` + src.map(s => `<p>${esc(s.author || s.title)}${s.year ? ` (${esc(s.year)})` : ''}. ${s.author ? `<i>${esc(s.title)}</i>. ` : ''}${esc(s.publisher)}${s.url ? '. ' + esc(s.url) : ''}</p>`).join('');
  const old = $('.bib', E);
  if (old) { old.innerHTML = html; W.changed(); return ONE.toast('Bibliography updated.'); }
  W.insertHTML(`<div class="bib" contenteditable="false">${html}</div><p><br></p>`);
};
P.caption = a => ONE.menuAt(a, ['Figure', 'Table', 'Equation'].map(k => ({ label:k, icon:k === 'Table' ? 'table' : k === 'Figure' ? 'image' : 'functions', on:() => { W.insertHTML(`<p class="caption"><span class="capnum" data-kind="${k}" contenteditable="false">${k}</span>: &#8203;</p>`); } })));

/* ---------- design ---------- */
W.setDesign = (k, v) => { W.doc.design[k] = v; W.applyDesign(); W.changed({ history:false }); ONE.ribbon.refresh(); $$('.sset').forEach(s => s.classList.toggle('on', s.dataset.set === W.doc.design.set)); };
P.themeColors = a => ONE.menuAt(a, Object.entries(W.THEMECOLORS).map(([k, c]) => ({ checked:W.doc.design.colors === k, html:`<span style="display:flex;gap:3px;align-items:center">${c.sw.map(s => `<i style="display:block;width:14px;height:14px;border-radius:4px;background:${s}"></i>`).join('')}<span style="margin-left:8px">${c.name}</span></span>`, on:() => W.setDesign('colors', k) })));
P.paraSpacing = a => ONE.menuAt(a, Object.entries(W.PSPACING).map(([k, p]) => ({ label:p[0], sub:k === 'default' ? 'Style set default' : `After ${p[1]}, line ${p[2]}`, checked:W.doc.design.spacing === k, on:() => W.setDesign('spacing', k) })));
P.pageColor = a => ONE.pop.open(a, ONE.colorGrid(c => W.setDesign('pageColor', c && c !== 'none' ? c : ''), { noneLabel:'No Color' }));
P.watermark = a => ONE.menuAt(a, [{ title:'Disclaimers' }, ...['CONFIDENTIAL','DO NOT COPY','DRAFT','SAMPLE','URGENT','ASAP'].map(w => ({ label:w, checked:W.doc.design.watermark === w, on:() => W.setDesign('watermark', w) })), '-',
  { label:'Custom Watermark…', icon:'edit', on:() => { const i = ONE.input({ value:W.doc.design.watermark || '' }); ONE.modal({ title:'Printed Watermark', body:ONE.field('Text', i), actions:[{ label:'Cancel' }, { label:'OK', kind:'filled', on:() => W.setDesign('watermark', i.value.trim().slice(0, 30)) }] }); } },
  { label:'Remove Watermark', icon:'delete', on:() => W.setDesign('watermark', '') }]);
P.pageBorders = a => ONE.menuAt(a, [['','None'],['box','Box'],['double','Double'],['shadow','Shadow'],['art','Dashed accent']].map(([k, n]) => ({ label:n, checked:W.doc.design.border === k, on:() => W.setDesign('border', k) })));

/* ---------- layout pops ---------- */
P.margins = a => ONE.menuAt(a, [...Object.entries(W.MARGINS).map(([k, m]) => ({ label:m.name, sub:m.d, icon:'margin', checked:W.doc.layout.margin === k, on:() => { W.doc.layout.margin = k; W.doc.layout.m = [...m.v]; W.applyLayout(); W.changed({ history:false }); } })), '-', { label:'Custom Margins…', icon:'tune', on:W.marginsDialog }]);
P.orient = a => ONE.menuAt(a, [['portrait','Portrait','crop_portrait'],['landscape','Landscape','crop_landscape']].map(([o, n, i]) => ({ label:n, icon:i, checked:W.doc.layout.orient === o, on:() => { W.doc.layout.orient = o; W.applyLayout(); W.changed({ history:false }); } })));
P.size = a => ONE.menuAt(a, [...Object.entries(W.SIZES).map(([k, s]) => ({ label:s.name, sub:s.d, checked:W.doc.layout.size === k, on:() => { W.doc.layout.size = k; W.applyLayout(); W.changed({ history:false }); } })), '-', { label:'More Paper Sizes…', icon:'tune', on:W.marginsDialog }]);
P.columns = a => ONE.menuAt(a, [...[1, 2, 3].map(n => ({ label:['One','Two','Three'][n - 1], icon:n === 1 ? 'view_agenda' : 'view_column', checked:W.doc.layout.cols === n, on:() => { W.doc.layout.cols = n; W.applyLayout(); W.changed({ history:false }); if (n > 1) ONE.toast('Columns flow across the whole document; page boundaries are approximate while columns are on.'); } })), '-',
  { label:'Line Between Columns', checked:W.doc.layout.colRule, on:() => { W.doc.layout.colRule = !W.doc.layout.colRule; W.applyLayout(); } }]);
P.breaks = a => ONE.menuAt(a, [{ title:'Page breaks' }, { label:'Page', sub:'Start the next text on a new page', icon:'insert_page_break', kbd:'Ctrl+Enter', on:A.pageBreak }, { label:'Column', sub:'Continue in the next column', icon:'view_column', on:A.colBreak }, { label:'Text Wrapping', sub:'Line break inside the paragraph', icon:'wrap_text', kbd:'Shift+Enter', on:() => W.insertHTML('<br>') }]);
P.hyphen = a => ONE.menuAt(a, [{ label:'None', checked:!W.doc.layout.hyph, on:() => { W.doc.layout.hyph = false; W.applyLayout(); } }, { label:'Automatic', checked:!!W.doc.layout.hyph, on:() => { W.doc.layout.hyph = true; W.applyLayout(); } }]);

/* ---------- header & footer ---------- */
W.hfEditing = false;
W.hfEdit = (which = 'header', k = 0) => {
  if (W.isRO()) return W.roToast();
  if (!W.isFlow()) return ONE.toast('Headers and footers show in Print Layout. Switch to it from the View tab.');
  if (W.hfEditing) W.hfClose(true);
  W._pagesSig = ''; W.renderPages(W.pageCount);
  const pg = $$('.pagebg', sheet)[Math.min(k, W.pageCount - 1)]; if (!pg) return;
  W.hfEditing = true; sheet.classList.add('hf-mode');
  ['hdr','ftr'].forEach(c => { const h = pg.querySelector('.' + c); h.contentEditable = 'true'; h.classList.add('editing'); $$('.fld', h).forEach(f => f.contentEditable = 'false'); if (!h.innerHTML.trim()) h.innerHTML = '<p><br></p>'; });
  const t = pg.querySelector(which === 'footer' ? '.ftr' : '.hdr'); t.focus();
  const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); W.select(r);
  pg.scrollIntoView({ block:which === 'footer' ? 'end' : 'start', behavior:'smooth' });
  W.scheduleState(); ONE.ribbon.switchTab('hftab');
};
W.hfClose = silent => {
  if (!W.hfEditing) return;
  const hdr = $('.hf.hdr.editing', sheet), ftr = $('.hf.ftr.editing', sheet);
  const norm = h => { if (!h) return ''; const c = h.cloneNode(true); $$('.fld', c).forEach(f => f.textContent = '#'); const txt = c.textContent.replace(/​/g, '').trim(); return txt || c.querySelector('img') ? c.innerHTML : ''; };
  const first = W.doc.hf.first && hdr && hdr.closest('.pagebg').dataset.page === '0';
  if (!first) { W.doc.hf.header = norm(hdr); W.doc.hf.footer = norm(ftr); }
  W.hfEditing = false; sheet.classList.remove('hf-mode'); W._pagesSig = ''; W.saved = null;
  W.changed({ history:false });
  if (!silent) { ONE.ribbon.setContext('hf', false); E.focus({ preventScroll:true }); }
};
sheet.addEventListener('dblclick', e => {
  if (!W.isFlow()) return;
  if (W.hfEditing) { if (!e.target.closest('.hf.editing')) W.hfClose(); return; }
  if (e.target.closest('img')) return;
  const [pw, ph] = W.dims(), sr = sheet.getBoundingClientRect(), k = sr.width / pw, y = (e.clientY - sr.top) / k, S = ph + W.GAP;
  const p = Math.floor(y / S), yin = y - p * S, [mt, , mb] = W.doc.layout.m;
  if (yin < mt - 4) { e.preventDefault(); W.hfEdit('header', p); } else if (yin > ph - mb + 4 && yin < ph) { e.preventDefault(); W.hfEdit('footer', p); }
});
const fld = f => `<span class="fld" data-f="${f}" contenteditable="false">#</span>`;
W.setHF = (which, html) => { W.doc.hf[which] = html; W._pagesSig = ''; if (W.hfEditing) { W.hfEditing = false; sheet.classList.remove('hf-mode'); } W.changed({ history:false }); };
P.header = a => ONE.menuAt(a, [{ title:'Built-in' },
  { label:'Blank', icon:'short_text', on:() => { W.setHF('header', '<p><br></p>'); W.hfEdit('header', 0); } },
  { label:'Title, right aligned', icon:'format_align_right', on:() => W.setHF('header', `<p style="text-align:right">${fld('title')}</p>`) },
  { label:'Title and date', icon:'view_week', on:() => W.setHF('header', `<p style="display:flex;justify-content:space-between">${fld('title')}${fld('date')}</p>`) },
  { label:'Author, centered', icon:'format_align_center', on:() => W.setHF('header', `<p style="text-align:center">${fld('author')}</p>`) }, '-',
  { label:'Edit Header', icon:'edit', on:() => W.hfEdit('header', 0) }, { label:'Remove Header', icon:'delete', on:() => W.setHF('header', '') }]);
P.footer = a => ONE.menuAt(a, [{ title:'Built-in' },
  { label:'Blank', icon:'short_text', on:() => { W.setHF('footer', '<p><br></p>'); W.hfEdit('footer', 0); } },
  { label:'Page number, centered', icon:'tag', on:() => W.setHF('footer', `<p style="text-align:center">${fld('page')}</p>`) },
  { label:'Title and page', icon:'view_week', on:() => W.setHF('footer', `<p style="display:flex;justify-content:space-between">${fld('title')}<span>Page ${fld('page')} of ${fld('numpages')}</span></p>`) }, '-',
  { label:'Edit Footer', icon:'edit', on:() => W.hfEdit('footer', 0) }, { label:'Remove Footer', icon:'delete', on:() => W.setHF('footer', '') }]);
P.pagenum = a => {
  const pn = (which, align, xy) => W.setHF(which, `<p style="text-align:${align}">${xy ? `Page ${fld('page')} of ${fld('numpages')}` : fld('page')}</p>`);
  ONE.menuAt(a, [{ title:'Top of Page' }, ...['left','center','right'].map(al => ({ label:'Plain Number, ' + al, icon:'vertical_align_top', on:() => pn('header', al) })),
    { title:'Bottom of Page' }, ...['left','center','right'].map(al => ({ label:'Plain Number, ' + al, icon:'vertical_align_bottom', on:() => pn('footer', al) })),
    { label:'Page X of Y, bottom center', icon:'tag', on:() => pn('footer', 'center', true) }, '-',
    { label:'Remove Page Numbers', icon:'delete', on:() => { ['header','footer'].forEach(w => { const t = document.createElement('div'); t.innerHTML = W.doc.hf[w]; $$('.fld[data-f="page"],.fld[data-f="numpages"]', t).forEach(f => f.remove()); W.doc.hf[w] = t.textContent.replace(/Page\s+of/, '').trim() ? t.innerHTML : ''; }); W._pagesSig = ''; W.changed({ history:false }); } }]);
};
A.hfField = f => { if (!W.hfEditing) return; W.restore(); document.execCommand('insertHTML', false, fld(f)); $$('.hf.editing .fld').forEach(x => { x.textContent = { page:1, numpages:W.pageCount, date:today().toLocaleDateString(), title:$('#docTitle').value, author:W.doc.meta.author }[x.dataset.f] ?? '#'; }); };

/* ---------- tables ---------- */
W.tblCells = () => { const r = W.saved; if (!r) return []; const t = W.cell() && W.cell().closest('table'); if (!t) return []; const cs = $$('td,th', t).filter(c => r.intersectsNode(c)); return cs.length ? cs : [W.cell()]; };
const T = () => { const c = W.cell(); if (!c) { ONE.toast('Put the cursor in a table first.'); return null; } return c; };
const newCell = (tag = 'td') => { const c = document.createElement(tag); c.innerHTML = '<br>'; return c; };
A.tblRowAbove = () => { const c = T(); if (!c) return; const tr = c.parentElement, n = document.createElement('tr'); [...tr.cells].forEach(x => { const nc = newCell(x.tagName.toLowerCase()); nc.colSpan = x.colSpan; n.append(nc); }); tr.before(n); if (tr.querySelector('th')) $$('th', tr).forEach(th => { const td = newCell('td'); td.innerHTML = th.innerHTML; td.colSpan = th.colSpan; th.replaceWith(td); }); W.changed(); };
A.tblRowBelow = () => { const c = T(); if (!c) return; const tr = c.parentElement, n = document.createElement('tr'); [...tr.cells].forEach(x => { const nc = newCell('td'); nc.colSpan = x.colSpan; n.append(nc); }); tr.after(n); W.changed(); };
const colIdx = c => { let i = 0; for (const x of c.parentElement.cells) { if (x === c) return i; i += x.colSpan; } return i; };
const cellAt = (tr, idx) => { let i = 0; for (const x of tr.cells) { if (idx < i + x.colSpan) return x; i += x.colSpan; } return tr.cells[tr.cells.length - 1]; };
A.tblColLeft = () => { const c = T(); if (!c) return; const i = colIdx(c); for (const tr of c.closest('table').rows) { const ref = cellAt(tr, i); ref.before(newCell(ref.tagName.toLowerCase())); } W.changed(); };
A.tblColRight = () => { const c = T(); if (!c) return; const i = colIdx(c); for (const tr of c.closest('table').rows) { const ref = cellAt(tr, i); ref.after(newCell(ref.tagName.toLowerCase())); } W.changed(); };
A.tblDelRow = () => { const c = T(); if (!c) return; const t = c.closest('table'); const rows = [...new Set(W.tblCells().map(x => x.parentElement))]; rows.forEach(r => r.remove()); if (!t.rows.length) t.remove(); W.saved = null; W.changed(); };
A.tblDelCol = () => { const c = T(); if (!c) return; const t = c.closest('table'), i = colIdx(c); for (const tr of [...t.rows]) { const x = cellAt(tr, i); if (x.colSpan > 1) x.colSpan--; else x.remove(); if (!tr.cells.length) tr.remove(); } if (!t.rows.length) t.remove(); W.saved = null; W.changed(); };
A.tblDelTable = () => { const c = T(); if (!c) return; const t = c.closest('table'); const p = document.createElement('p'); p.innerHTML = '<br>'; t.replaceWith(p); W.select((() => { const r = document.createRange(); r.setStart(p, 0); r.collapse(true); return r; })()); W.changed(); };
P.tblDelete = a => ONE.menuAt(a, [{ label:'Delete Rows', icon:'table_rows', on:A.tblDelRow }, { label:'Delete Columns', icon:'view_column', on:A.tblDelCol }, { label:'Delete Table', icon:'delete', danger:true, on:A.tblDelTable }]);
A.tblSelect = () => { const c = T(); if (!c) return; const r = document.createRange(); r.selectNodeContents(c.closest('table')); W.select(r); };
A.tblMerge = () => {
  const cells = W.tblCells(); if (cells.length < 2) return ONE.toast('Select two or more cells in a row to merge them.');
  const tr = cells[0].parentElement; if (!cells.every(c => c.parentElement === tr)) return ONE.toast('Merge works on cells in the same row.');
  const first = cells[0]; cells.slice(1).forEach(c => { first.colSpan += c.colSpan; if (c.textContent.trim()) first.append(' ', ...c.childNodes); c.remove(); });
  W.changed();
};
A.tblSplit = () => { const c = T(); if (!c) return; if (c.colSpan < 2) return ONE.toast('Only merged cells can be split here.'); const n = c.colSpan; c.colSpan = 1; for (let i = 1; i < n; i++) c.after(newCell(c.tagName.toLowerCase())); W.changed(); };
A.tblDistribute = () => { const c = T(); if (!c) return; const t = c.closest('table'); t.style.tableLayout = 'fixed'; t.style.width = '100%'; $$('td,th', t).forEach(x => x.style.width = ''); W.changed(); };
P.autofit = a => ONE.menuAt(a, [{ label:'AutoFit Contents', on:() => { const c = T(); if (!c) return; const t = c.closest('table'); t.style.width = 'auto'; t.style.tableLayout = 'auto'; W.changed(); } }, { label:'AutoFit Window', on:() => { const c = T(); if (!c) return; const t = c.closest('table'); t.style.width = '100%'; t.style.tableLayout = 'auto'; W.changed(); } }, { label:'Fixed Column Width', on:A.tblDistribute }]);
W.cellAlign = (h, v) => { const cells = W.tblCells(); if (!cells.length) return ONE.toast('Put the cursor in a table first.'); cells.forEach(c => { if (h) c.style.textAlign = h === 'left' ? '' : h; if (v) c.style.verticalAlign = v === 'top' ? '' : v; }); W.changed(); };
W.tblSort = dir => {
  const c = T(); if (!c) return; const t = c.closest('table'), body = t.tBodies[0] || t, i = colIdx(c);
  const rows = [...body.rows], head = rows[0] && rows[0].querySelector('th') ? rows.shift() : null;
  rows.sort((x, y) => dir * cellAt(x, i).textContent.trim().localeCompare(cellAt(y, i).textContent.trim(), undefined, { numeric:true, sensitivity:'base' })).forEach(r => body.append(r));
  if (head) body.prepend(head); W.changed(); ONE.toast(`Sorted by column ${i + 1}.`);
};
P.tblSort = a => ONE.menuAt(a, [{ label:'Sort Ascending', icon:'arrow_upward', on:() => W.tblSort(1) }, { label:'Sort Descending', icon:'arrow_downward', on:() => W.tblSort(-1) }]);
A.tblToText = () => { const c = T(); if (!c) return; const t = c.closest('table'); const frag = document.createDocumentFragment(); [...t.rows].forEach(r => { const p = document.createElement('p'); p.textContent = [...r.cells].map(x => x.textContent.trim()).join('\t'); frag.append(p); }); t.replaceWith(frag); W.saved = null; W.changed(); };
W.tblToggle = kind => {
  const c = T(); if (!c) return; const t = c.closest('table');
  if (kind === 'header') { const r = t.rows[0], toTh = !r.querySelector('th'); [...r.cells].forEach(x => { const n = document.createElement(toTh ? 'th' : 'td'); n.innerHTML = x.innerHTML; n.colSpan = x.colSpan; n.style.cssText = x.style.cssText; x.replaceWith(n); }); }
  else t.classList.toggle(kind);
  W.changed();
};
W.tblStyle = cls => { const c = T(); if (!c) return; const t = c.closest('table'); t.classList.remove('t-plain','t-accent','t-list','t-shade'); if (cls) t.classList.add(cls); W.changed(); };
P.tblBorders = a => {
  const set = mode => { const c = T(); if (!c) return; const t = c.closest('table'); t.style.border = mode === 'outside' ? '1.5px solid #000' : ''; $$('td,th', t).forEach(x => { x.style.borderColor = mode === 'all' ? '' : 'transparent'; }); W.changed(); };
  ONE.menuAt(a, [{ label:'All Borders', icon:'border_all', on:() => set('all') }, { label:'Outside Borders', icon:'border_outer', on:() => set('outside') }, { label:'No Border', icon:'border_clear', on:() => set('none') }]);
};
W.hooks.push(() => { $$('.cellsel', E).forEach(c => c.classList.remove('cellsel')); const cs = W.tblCells(); if (cs.length > 1) cs.forEach(c => c.classList.add('cellsel')); });

/* ---------- pictures ---------- */
W.selImg = null;
const imgsel = $('#imgsel');
W.posImgSel = () => {
  const i = W.selImg; if (!i || !i.isConnected) { W.selImg = null; imgsel.hidden = true; return; }
  const sr = sheet.getBoundingClientRect(), k = sr.width / sheet.offsetWidth || 1, r = i.getBoundingClientRect();
  Object.assign(imgsel.style, { left:(r.left - sr.left) / k + 'px', top:(r.top - sr.top) / k + 'px', width:r.width / k + 'px', height:r.height / k + 'px' }); imgsel.hidden = false;
};
W.selectImg = img => {
  W.selImg = img;
  if (img) { const r = document.createRange(); r.selectNode(img); W.saved = r.cloneRange(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  W.posImgSel(); W.scheduleState(); if (img) ONE.ribbon.setContext('picture', true);
};
E.addEventListener('mousedown', e => { const img = e.target.closest('img'); if (img && E.contains(img)) { e.preventDefault(); E.focus({ preventScroll:true }); W.selectImg(img); } else if (W.selImg) { W.selectImg(null); } });
E.addEventListener('keydown', e => { if (W.selImg && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); A.imgDelete(); } });
W.hooks.push(W.posImgSel);
$$('.h', imgsel).forEach(h => h.addEventListener('pointerdown', e => {
  const img = W.selImg; if (!img) return; e.preventDefault(); h.setPointerCapture(e.pointerId);
  const sr = sheet.getBoundingClientRect(), k = sr.width / sheet.offsetWidth || 1, sx = e.clientX, w0 = img.getBoundingClientRect().width / k, dir = h.classList.contains('se') || h.classList.contains('ne') ? 1 : -1;
  const max = W.dims()[0] - W.doc.layout.m[1] - W.doc.layout.m[3];
  const mv = ev => { img.style.width = ONE.clamp(w0 + dir * (ev.clientX - sx) / k, 24, max) + 'px'; img.style.height = 'auto'; W.posImgSel(); };
  const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); W.changed(); };
  h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
}));
const I = () => { if (!W.selImg) { ONE.toast('Click a picture to select it first.'); return null; } return W.selImg; };
P.wrap = a => { const i = I(); if (!i) return; const cur = ['wrap-left','wrap-right','wrap-block'].find(c => i.classList.contains(c)) || '';
  const set = c => { i.classList.remove('wrap-left','wrap-right','wrap-block'); if (c) i.classList.add(c); W.changed(); };
  ONE.menuAt(a, [{ label:'In Line with Text', icon:'format_image_left', checked:!cur, on:() => set('') }, { label:'Square, Left', icon:'format_image_left', checked:cur === 'wrap-left', on:() => set('wrap-left') }, { label:'Square, Right', icon:'format_image_right', checked:cur === 'wrap-right', on:() => set('wrap-right') }, { label:'Top and Bottom', icon:'vertical_distribute', checked:cur === 'wrap-block', on:() => set('wrap-block') }]); };
W.imgStyle = cls => { const i = I(); if (!i) return; i.classList.remove('st-round','st-shadow','st-frame','st-circle','st-soft'); if (cls) i.classList.add(cls); W.changed(); };
P.imgFilter = a => { const i = I(); if (!i) return; const set = f => { i.style.filter = f; W.changed(); };
  ONE.menuAt(a, [{ label:'Original', on:() => set('') }, { label:'Grayscale', on:() => set('grayscale(1)') }, { label:'Sepia', on:() => set('sepia(.85)') }, { label:'Washout', on:() => set('brightness(1.35) contrast(.6)') }, { label:'Brighter', on:() => set('brightness(1.2)') }, { label:'More Contrast', on:() => set('contrast(1.35)') }, { label:'Saturate', on:() => set('saturate(1.8)') }, { label:'Blur', on:() => set('blur(2px)') }]); };
P.imgSize = a => { const i = I(); if (!i) return; const max = W.dims()[0] - W.doc.layout.m[1] - W.doc.layout.m[3];
  ONE.menuAt(a, [25, 50, 75, 100].map(p => ({ label:`${p}% of text width`, on:() => { i.style.width = max * p / 100 + 'px'; i.style.height = 'auto'; W.changed(); } }))); };
A.imgRotate = () => { const i = I(); if (!i) return; const r = ((+i.dataset.rot || 0) + 90) % 360; i.dataset.rot = r; i.style.transform = r ? `rotate(${r}deg)` : ''; W.changed(); };
A.imgFlip = () => { const i = I(); if (!i) return; i.dataset.flip = i.dataset.flip ? '' : '1'; i.style.transform = `${i.dataset.rot ? `rotate(${i.dataset.rot}deg)` : ''} ${i.dataset.flip ? 'scaleX(-1)' : ''}`.trim(); W.changed(); };
A.imgReset = () => { const i = I(); if (!i) return; i.removeAttribute('style'); i.className = i.classList.contains('shape') ? 'shape' : ''; delete i.dataset.rot; delete i.dataset.flip; W.changed(); };
A.imgDelete = () => { const i = I(); if (!i) return; W.selImg = null; i.remove(); imgsel.hidden = true; W.changed(); ONE.ribbon.setContext('picture', false); };
A.altText = () => { const i = I(); if (!i) return; const t = el('textarea', { class:'tf', rows:4 }); t.value = i.alt || '';
  ONE.modal({ title:'Alt Text', body:el('div', { class:'dlg-col' }, el('p', { text:'Describe this picture for people who use screen readers (1–2 sentences).' }), t), actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => { i.alt = t.value.trim(); W.changed(); } }] }); };
A.imgAlign = al => { const i = I(); if (!i) return; i.classList.remove('wrap-left','wrap-right'); i.classList.add('wrap-block'); i.style.marginLeft = al === 'left' ? '0' : 'auto'; i.style.marginRight = al === 'right' ? '0' : 'auto'; W.changed(); };
P.imgAlign = a => ONE.menuAt(a, [['left','Align Left','format_align_left'],['center','Align Center','format_align_center'],['right','Align Right','format_align_right']].map(([k, n, ic]) => ({ label:n, icon:ic, on:() => A.imgAlign(k) })));
A.imgReplace = () => { const i = I(); if (!i) return; const inp = el('input', { type:'file', accept:'image/*' }); inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { i.src = r.result; W.changed(); }; r.readAsDataURL(f); }; inp.click(); };

/* ---------- wrapping helper (comments & tracked deletions) ---------- */
W.wrapRange = (range, make) => {
  const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
  const nodes = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) if (range.intersectsNode(n) && n.data.length) nodes.push(n);
  const plan = nodes.map(n => [n, n === range.startContainer ? range.startOffset : 0, n === range.endContainer ? range.endOffset : n.data.length]);
  const made = [];
  plan.forEach(([n, s, e]) => { if (e <= s) return; let t = n; if (e < t.data.length) t.splitText(e); if (s > 0) t = t.splitText(s); const x = make(); t.parentNode.insertBefore(x, t); x.appendChild(t); made.push(x); });
  return made;
};

/* ---------- comments ---------- */
const app = W.app, cpane = $('#cpane');
W.showComments = true;
A.newComment = () => {
  W.restore(); const s = getSelection();
  if (s.isCollapsed && !W.selectWord()) return ONE.toast('Select the text you want to comment on.');
  const id = ONE.uid(), r = getSelection().getRangeAt(0);
  const made = W.wrapRange(r, () => { const x = document.createElement('span'); x.className = 'cmt'; x.dataset.c = id; return x; });
  if (!made.length) return ONE.toast('Select some text to comment on.');
  W.doc.comments[id] = { text:'', author:W.settings.author, t:Date.now(), resolved:false, replies:[] };
  W.showComments = true; app.classList.add('show-comments'); W.changed();
  requestAnimationFrame(() => { W.renderComments(); const ta = $(`.ccard[data-c="${id}"] textarea`); ta && ta.focus(); });
};
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
W.renderComments = () => {
  const ids = Object.keys(W.doc.comments);
  ids.forEach(id => { if (!$(`span.cmt[data-c="${id}"]`, E)) delete W.doc.comments[id]; });
  const live = Object.keys(W.doc.comments);
  const on = W.showComments && live.length > 0 && W.isFlow();
  app.classList.toggle('show-comments', on); E.classList.toggle('no-comments', !W.showComments);
  document.documentElement.style.setProperty('--cpw', on ? '290px' : '0px');
  if (!on) { cpane.innerHTML = ''; return; }
  const sr = sheet.getBoundingClientRect(), k = sr.width / sheet.offsetWidth || 1;
  const items = live.map(id => { const a = $(`span.cmt[data-c="${id}"]`, E); return { id, y:(a.getBoundingClientRect().top - sr.top) / k }; }).sort((a, b) => a.y - b.y);
  const existing = new Map($$('.ccard', cpane).map(c => [c.dataset.c, c]));
  let bottom = 0;
  items.forEach(({ id, y }) => {
    const c = W.doc.comments[id]; let card = existing.get(id);
    if (!card) {
      card = el('div', { class:'ccard', 'data-c':id });
      const ta = el('textarea', { placeholder:'Add a comment…', rows:1, 'aria-label':'Comment' }); ta.value = c.text;
      const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.addEventListener('input', () => { c.text = ta.value; grow(); W.dirty(); layoutSoon(); });
      card.append(el('div', { class:'ch', html:`<span class="cav">${esc((c.author || 'Y').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span><b>${esc(c.author)}</b><small>${ago(c.t)}</small>` }), ta, el('div', { class:'replies' }),
        el('div', { class:'cact' },
          el('button', { class:'icon-btn', title:'Reply', html:icon('reply'), onclick:() => replyBox(card, c) }),
          el('button', { class:'icon-btn', title:c.resolved ? 'Reopen' : 'Resolve', html:icon(c.resolved ? 'undo' : 'check_circle'), onclick:() => { c.resolved = !c.resolved; card.remove(); W.dirty(); W.renderComments(); } }),
          el('button', { class:'icon-btn', title:'Delete comment', html:icon('delete'), onclick:() => W.deleteComment(id) })));
      card.addEventListener('mousedown', () => W.activateComment(id));
      cpane.append(card); requestAnimationFrame(grow);
    }
    card.classList.toggle('resolved', !!c.resolved);
    const reps = card.querySelector('.replies'); reps.innerHTML = c.replies.map(r => `<div class="reply"><b>${esc(r.author)}</b> ${esc(r.text)}</div>`).join('');
    const top = Math.max(y, bottom + 10); card.style.top = top + 'px'; bottom = top + card.offsetHeight;
    existing.delete(id);
  });
  existing.forEach(c => c.remove());
};
let lt; const layoutSoon = () => { clearTimeout(lt); lt = setTimeout(W.renderComments, 60); };
function replyBox(card, c){
  if (card.querySelector('.rbox')) return;
  const i = ONE.input({ placeholder:'Reply…', class:'tf rbox', style:{ height:'34px', marginTop:'6px' } });
  i.addEventListener('keydown', e => { if (e.key === 'Enter' && i.value.trim()) { c.replies.push({ author:W.settings.author, text:i.value.trim(), t:Date.now() }); i.remove(); W.dirty(); W.renderComments(); } if (e.key === 'Escape') i.remove(); });
  card.querySelector('.replies').after(i); i.focus(); layoutSoon();
}
W.activateComment = id => {
  $$('span.cmt.act', E).forEach(x => x.classList.remove('act')); $$('.ccard.act').forEach(x => x.classList.remove('act'));
  if (!id) return;
  $$(`span.cmt[data-c="${id}"]`, E).forEach(x => x.classList.add('act')); const c = $(`.ccard[data-c="${id}"]`); c && c.classList.add('act');
};
E.addEventListener('click', e => { const c = e.target.closest('span.cmt'); W.activateComment(c ? c.dataset.c : null); });
W.deleteComment = id => {
  id = id || ($('.ccard.act') || {}).dataset?.c || (() => { const n = W.saved && (W.saved.startContainer.nodeType === 3 ? W.saved.startContainer.parentElement : W.saved.startContainer); const c = n && n.closest && n.closest('span.cmt'); return c && c.dataset.c; })();
  if (!id) return ONE.toast('Click a comment or its highlighted text first.');
  $$(`span.cmt[data-c="${id}"]`, E).forEach(x => x.replaceWith(...x.childNodes)); delete W.doc.comments[id]; E.normalize(); W.changed();
};
A.deleteAllComments = () => { $$('span.cmt', E).forEach(x => x.replaceWith(...x.childNodes)); W.doc.comments = {}; E.normalize(); W.changed(); ONE.toast('All comments deleted.'); };
W.stepComment = d => {
  const ids = [...new Set($$('span.cmt', E).map(x => x.dataset.c))]; if (!ids.length) return ONE.toast('There are no comments.');
  const cur = ($('.ccard.act') || {}).dataset?.c; let i = ids.indexOf(cur); i = i < 0 ? (d > 0 ? 0 : ids.length - 1) : (i + d + ids.length) % ids.length;
  W.showComments = true; W.renderComments(); W.activateComment(ids[i]);
  const a = $(`span.cmt[data-c="${ids[i]}"]`, E); a.scrollIntoView({ block:'center', behavior:'smooth' });
};
W.hooks.push(W.renderComments);

/* ---------- track changes ---------- */
W.markup = 'all';
const author = () => W.settings.author;
W.markDeleted = range => {
  const made = W.wrapRange(range, () => { const d = document.createElement('del'); d.className = 'tc'; d.dataset.a = author(); d.dataset.t = Date.now(); d.title = `Deleted by ${author()}`; return d; });
  made.forEach(d => { const p = d.parentElement; if (p.closest('ins.tc')) d.remove(); else if (p.closest('del.tc')) d.replaceWith(...d.childNodes); });
  $$('ins.tc', E).forEach(i => { if (!i.textContent) i.remove(); });
  return made.length;
};
W.trackedInsert = text => {
  const s = getSelection(); if (!s.rangeCount) return;
  if (!s.isCollapsed) { const r = s.getRangeAt(0); W.markDeleted(r); s.collapseToEnd(); }
  let r = s.getRangeAt(0), n = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
  const d = n.closest && n.closest('del.tc'); if (d) { r = document.createRange(); r.setStartAfter(d); r.collapse(true); s.removeAllRanges(); s.addRange(r); n = d.parentElement; }
  const ins = n.closest && n.closest('ins.tc');
  if (ins && ins.dataset.a === author()) { document.execCommand('insertText', false, text); return; }
  const x = document.createElement('ins'); x.className = 'tc'; x.dataset.a = author(); x.dataset.t = Date.now(); x.title = `Inserted by ${author()}`; x.textContent = text;
  r.insertNode(x); const nr = document.createRange(); nr.setStart(x.firstChild, text.length); nr.collapse(true); s.removeAllRanges(); s.addRange(nr);
};
W.trackedDelete = (back, word) => {
  const s = getSelection(); if (!s.rangeCount) return;
  if (s.isCollapsed) s.modify('extend', back ? 'backward' : 'forward', word ? 'word' : 'character');
  const r = s.getRangeAt(0); if (r.collapsed) return;
  const n = W.markDeleted(r.cloneRange());
  if (!n) { document.execCommand('delete'); return; }
  back ? s.collapseToStart() : s.collapseToEnd();
};
const changes = () => $$('ins.tc, del.tc', E);
W.resolveChange = (el, accept) => { if ((el.tagName === 'INS') === accept) el.replaceWith(...el.childNodes); else el.remove(); };
W.acceptReject = (accept, all) => {
  let list = changes(); if (!list.length) return ONE.toast('There are no tracked changes.');
  if (!all) { const r = W.saved; list = list.filter(c => r && (r.intersectsNode(c) || c.contains(r.startContainer))); if (!list.length) { W.stepChange(1); return; } }
  list.forEach(c => W.resolveChange(c, accept)); E.normalize(); W.changed();
  ONE.toast(`${accept ? 'Accepted' : 'Rejected'} ${list.length} change${list.length > 1 ? 's' : ''}.`);
};
W.stepChange = d => {
  const list = changes(); if (!list.length) return ONE.toast('There are no tracked changes.');
  const r = W.saved; let i = r ? list.findIndex(c => r.comparePoint(c, 0) > 0 || (d < 0 && false)) : 0;
  if (d < 0) { i = r ? list.map(c => r.comparePoint(c, 0) < 0).lastIndexOf(true) : list.length - 1; if (i < 0) i = list.length - 1; } else if (i < 0) i = 0;
  const c = list[i], nr = document.createRange(); nr.selectNodeContents(c); W.select(nr); c.scrollIntoView({ block:'center', behavior:'smooth' });
};
P.accept = a => ONE.menuAt(a, [{ label:'Accept and Move to Next', icon:'done', on:() => { W.acceptReject(true, false); W.stepChange(1); } }, { label:'Accept This Change', icon:'check', on:() => W.acceptReject(true, false) }, { label:'Accept All Changes', icon:'done_all', on:() => W.acceptReject(true, true) }, { label:'Accept All and Stop Tracking', icon:'done_all', on:() => { W.acceptReject(true, true); W.doc.track = false; W.syncTrack(); } }]);
P.reject = a => ONE.menuAt(a, [{ label:'Reject and Move to Next', icon:'close', on:() => { W.acceptReject(false, false); W.stepChange(1); } }, { label:'Reject This Change', icon:'close', on:() => W.acceptReject(false, false) }, { label:'Reject All Changes', icon:'clear_all', on:() => W.acceptReject(false, true) }]);
P.markup = a => ONE.menuAt(a, [['simple','Simple Markup'],['all','All Markup'],['none','No Markup'],['original','Original']].map(([k, n]) => ({ label:n, checked:W.markup === k, on:() => { W.markup = k; E.classList.remove('mk-simple','mk-none','mk-original'); if (k !== 'all') E.classList.add('mk-' + k); } })));
W.syncTrack = () => { $('#trackInfo').hidden = !W.doc.track; ONE.ribbon.refresh(); };

/* ---------- beforeinput: undo, smart quotes, tracking ---------- */
E.addEventListener('beforeinput', e => {
  const t = e.inputType;
  if (t === 'historyUndo') { e.preventDefault(); return W.undo(); }
  if (t === 'historyRedo') { e.preventDefault(); return W.redo(); }
  if (W.isRO()) { e.preventDefault(); return; }
  if (t === 'insertText' && W.settings.smartQuotes && (e.data === '"' || e.data === "'")) {
    e.preventDefault();
    const s = getSelection(), n = s.anchorNode, o = s.anchorOffset;
    const prev = n && n.nodeType === 3 && o > 0 ? n.data[o - 1] : '';
    const open = !prev || /[\s(\[{“‘—–-]/.test(prev);
    const ch = e.data === '"' ? (open ? '“' : '”') : (open ? '‘' : '’');
    W.doc.track ? W.trackedInsert(ch) : document.execCommand('insertText', false, ch);
    return;
  }
  if (!W.doc.track) return;
  if (t === 'insertText' || t === 'insertReplacementText') { e.preventDefault(); W.trackedInsert(e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || ''); W.changed({ kind:'type' }); }
  else if (/^delete(Content|Word|Soft|Hard)/.test(t) || t === 'deleteByCut') {
    e.preventDefault(); W.trackedDelete(/Backward/.test(t), /Word/.test(t)); if (t === 'deleteByCut') {} W.changed({ kind:'type' });
  }
});

/* ---------- autocorrect & autoformat (after the character lands) ---------- */
const AC = [[/\(c\)$/i, '©'], [/\(r\)$/i, '®'], [/\(tm\)$/i, '™'], [/\.\.\.$/, '…'], [/->$/, '→'], [/<-$/, '←'], [/=>$/, '⇒'], [/:\)$/, '☺'], [/(\S) ?--$/, '$1—']];
E.addEventListener('input', e => {
  if (e.inputType !== 'insertText' || W.doc.track) return;
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return;
  const n = s.anchorNode, o = s.anchorOffset; if (!n || n.nodeType !== 3) return;
  const before = n.data.slice(0, o);
  if (W.settings.autoLists && e.data === ' ') {
    const b = W.block();
    if (b && b.tagName === 'P' && b.textContent.replace(/ /g, ' ') === before.replace(/ /g, ' ')) {
      const m = before.replace(/ /g, ' ').match(/^\s*(\*|-|•|1[.)]|a[.)]|i[.)])\s$/);
      if (m) {
        const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, o); s.removeAllRanges(); s.addRange(r); document.execCommand('delete');
        const k = m[1], ordered = !/[*•-]/.test(k);
        document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
        if (ordered && k[0] !== '1') { const l = W.block() && W.block().closest('ol'); if (l) l.style.listStyleType = k[0] === 'a' ? 'lower-alpha' : 'lower-roman'; }
        ONE.toast(`AutoFormat made a ${ordered ? 'numbered' : 'bulleted'} list.`, { action:'Undo', fn:W.undo });
        return;
      }
    }
  }
  if (!W.settings.autoDashes && !W.settings.smartQuotes) return;
  const probe = e.data === ' ' ? before.slice(0, -1) : before;
  for (const [re, rep] of AC) {
    const m = probe.match(re); if (!m) continue;
    if (re.source.includes('--') && !W.settings.autoDashes) continue;
    const start = probe.length - m[0].length, out = m[0].replace(re, rep);
    const r = document.createRange(); r.setStart(n, start); r.setEnd(n, probe.length); s.removeAllRanges(); s.addRange(r);
    document.execCommand('insertText', false, out);
    if (e.data === ' ') { const s2 = getSelection(); s2.modify('move', 'forward', 'character'); }
    break;
  }
});

/* ---------- paste & drop ---------- */
W.pastePlain = false;
E.addEventListener('paste', e => {
  const cd = e.clipboardData; if (!cd) return;
  e.preventDefault(); if (W.isRO()) return W.roToast();
  const file = [...cd.files].find(f => f.type.startsWith('image/')); if (file) return W.insertImageFile(file);
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  if (W.doc.track || W.pastePlain || !html) { W.pastePlain = false; W.doc.track ? W.trackedInsert(text) : document.execCommand('insertText', false, text); }
  else document.execCommand('insertHTML', false, W.sanitize(html.replace(/<!--[\s\S]*?-->/g, '')));
  W.changed();
});
E.addEventListener('drop', e => { const f = e.dataTransfer && [...e.dataTransfer.files].find(x => x.type.startsWith('image/')); if (f) { e.preventDefault(); const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY); if (r) W.saved = r; W.insertImageFile(f); } });

/* ---------- find (navigation pane) & replace ---------- */
let navTab = 'headings'; W.matches = []; W.curMatch = -1;
const hasHL = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';
W.collect = (q, opt = {}) => {
  const out = []; if (!q) return out;
  let re; try { re = opt.regex ? new RegExp(q, opt.case ? 'g' : 'gi') : new RegExp((opt.whole ? '\\b' : '') + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (opt.whole ? '\\b' : ''), opt.case ? 'g' : 'gi'); } catch { return out; }
  const w = document.createTreeWalker(E, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { if (n.parentElement.closest('.toc,del.tc')) continue; re.lastIndex = 0; let m; while ((m = re.exec(n.data))) { if (!m[0].length) { re.lastIndex++; continue; } const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); out.push(r); } }
  return out;
};
W.paintMatches = () => { if (!hasHL) return; CSS.highlights.set('find', new Highlight(...W.matches)); if (W.matches[W.curMatch]) CSS.highlights.set('findcur', new Highlight(W.matches[W.curMatch])); else CSS.highlights.delete('findcur'); };
W.setNav = on => { $('#nav').hidden = !on; ONE.ribbon.refresh(); if (on) W.renderNav(); };
W.openFind = q => {
  W.setNav(true); const i = $('#navSearch');
  const s = getSelection(); if (q == null && !s.isCollapsed && E.contains(s.anchorNode) && s.toString().length < 80) q = s.toString();
  if (q != null) { i.value = q; W.runSearch(); }
  i.focus(); i.select();
};
W.runSearch = () => {
  const q = $('#navSearch').value; W.matches = W.collect(q); W.curMatch = W.matches.length ? 0 : -1;
  $('#navCount').textContent = q ? (W.matches.length ? `${W.matches.length} result${W.matches.length > 1 ? 's' : ''}` : 'No results') : '';
  if (q) navTab = 'results'; W.renderNav(); W.paintMatches();
  if (W.matches.length) W.matches[0].startContainer.parentElement.scrollIntoView({ block:'center' });
};
W.gotoMatch = i => { W.curMatch = i; W.paintMatches(); const r = W.matches[i]; r.startContainer.parentElement.scrollIntoView({ block:'center', behavior:'smooth' }); W.select(r); W.renderNav(); };
W.renderNav = () => {
  if ($('#nav').hidden) return;
  $$('[data-navtab]').forEach(b => b.classList.toggle('active', b.dataset.navtab === navTab));
  const list = $('#navList'); list.innerHTML = '';
  if (navTab === 'headings') {
    const hs = $$('h1,h2,h3,h4', E).filter(x => x.textContent.trim());
    if (!hs.length) { list.innerHTML = '<div class="nav-empty">Apply a Heading style (Home › Styles) and it shows up here, so you can jump around your document.</div>'; return; }
    const r = W.saved; let cur = null; hs.forEach(h => { if (r && r.comparePoint(h, 0) <= 0) cur = h; });
    hs.forEach((hd, i) => { const lvl = hd.classList.contains('title') ? 0 : +hd.tagName[1];
      const b = el('button', { class:'nav-item l' + lvl + (hd === cur ? ' cur' : ''), text:hd.textContent.trim(), style:{ animationDelay:Math.min(i, 12) * 18 + 'ms' } });
      b.onclick = () => { hd.scrollIntoView({ block:'start', behavior:'smooth' }); const rr = document.createRange(); rr.setStart(hd, 0); rr.collapse(true); W.select(rr); }; list.append(b); });
  } else if (navTab === 'pages') {
    const g = el('div', { class:'pthumbs' }); const cur = parseInt(($('#pageInfo').textContent.match(/\d+/) || [1])[0]);
    for (let k = 0; k < W.pageCount; k++) g.append(el('button', { class:'pthumb' + (k + 1 === cur ? ' cur' : ''), text:k + 1, onclick:() => { const pg = $$('.pagebg', sheet)[k]; pg ? pg.scrollIntoView({ block:'start', behavior:'smooth' }) : 0; } }));
    list.append(g);
  } else {
    if (!W.matches.length) { list.innerHTML = `<div class="nav-empty">${$('#navSearch').value ? 'No results. Check the spelling, or try fewer words.' : 'Search for text, or use Ctrl+H to replace it.'}</div>`; return; }
    W.matches.slice(0, 200).forEach((r, i) => {
      const t = r.startContainer.textContent, a = Math.max(0, r.startOffset - 32), z = Math.min(t.length, r.endOffset + 44);
      list.append(el('button', { class:'nav-item res' + (i === W.curMatch ? ' cur' : ''), html:(a ? '…' : '') + esc(t.slice(a, r.startOffset)) + '<mark>' + esc(t.slice(r.startOffset, r.endOffset)) + '</mark>' + esc(t.slice(r.endOffset, z)) + (z < t.length ? '…' : ''), onclick:() => W.gotoMatch(i) }));
    });
  }
};
$$('[data-navtab]').forEach(b => b.addEventListener('click', () => { navTab = b.dataset.navtab; W.renderNav(); }));
let st; $('#navSearch').addEventListener('input', () => { clearTimeout(st); st = setTimeout(W.runSearch, 140); });
$('#navSearch').addEventListener('keydown', e => { if (e.key === 'Enter' && W.matches.length) { e.preventDefault(); W.gotoMatch((W.curMatch + (e.shiftKey ? -1 : 1) + W.matches.length) % W.matches.length); } });
W.hooks.push(() => { if (!$('#nav').hidden && navTab !== 'results') W.renderNav(); });

W.replaceDialog = () => {
  const s = getSelection(); const pre = !s.isCollapsed && E.contains(s.anchorNode) ? s.toString() : ($('#navSearch').value || '');
  const fi = ONE.input({ value:pre }), wi = ONE.input(), mc = ONE.check('Match case'), ww = ONE.check('Find whole words only'), rx = ONE.check('Use regular expressions');
  const msg = el('div', { class:'muted', style:{ minHeight:'18px' } });
  const opt = () => ({ case:mc.input.checked, whole:ww.input.checked, regex:rx.input.checked });
  const next = () => {
    const ms = W.collect(fi.value, opt()); if (!ms.length) { msg.textContent = 'No matches found.'; return null; }
    const cur = W.saved; let r = ms.find(x => !cur || (x.compareBoundaryPoints(Range.START_TO_START, cur) > 0)) || ms[0];
    W.select(r); r.startContainer.parentElement.scrollIntoView({ block:'center' }); W.matches = ms; W.curMatch = ms.indexOf(r); W.paintMatches();
    msg.textContent = `Match ${W.curMatch + 1} of ${ms.length}`; return r;
  };
  const body = el('div', { class:'dlg-col' }, ONE.field('Find what', fi), ONE.field('Replace with', wi), mc.wrap, ww.wrap, rx.wrap, msg);
  ONE.modal({ title:'Find and Replace', width:480, body, onClose:() => { W.matches = []; W.paintMatches(); }, actions:[
    { label:'Find Next', on:() => { next(); return false; } },
    { label:'Replace', kind:'tonal', on:() => { const cur = W.saved ? W.saved.toString() : ''; const ms = W.collect(fi.value, opt()); const hit = ms.some(m => W.saved && m.compareBoundaryPoints(Range.START_TO_START, W.saved) === 0 && m.toString() === cur); if (hit && cur) { W.restore(); W.doc.track ? W.trackedInsert(wi.value) : document.execCommand('insertText', false, wi.value); W.changed(); } next(); return false; } },
    { label:'Replace All', kind:'filled', on:() => { const ms = W.collect(fi.value, opt()); if (!ms.length) { msg.textContent = 'No matches found.'; return false; } for (let i = ms.length - 1; i >= 0; i--) { W.select(ms[i]); W.doc.track ? W.trackedInsert(wi.value) : document.execCommand('insertText', false, wi.value); } W.changed(); ONE.toast(`All done. ${ms.length} replacement${ms.length > 1 ? 's' : ''}.`); } }] });
};

/* ---------- review: word count, accessibility, read aloud ---------- */
W.wordCountDialog = () => {
  const s = getSelection(); let st, sel = false;
  if (!s.isCollapsed && E.contains(s.anchorNode)) { const d = document.createElement('div'); d.append(s.getRangeAt(0).cloneContents()); st = W.stats(d); sel = true; } else st = W.stats();
  ONE.modal({ title:sel ? 'Word Count (selection)' : 'Word Count', icon:'123', body:`<div class="info" style="color:var(--on-surface)"><span>Pages</span><span>${W.pageCount}</span><span>Words</span><span>${st.words.toLocaleString()}</span><span>Characters (no spaces)</span><span>${st.charsNoSp.toLocaleString()}</span><span>Characters (with spaces)</span><span>${st.chars.toLocaleString()}</span><span>Paragraphs</span><span>${st.paras}</span><span>Reading time</span><span>${Math.max(1, Math.round(st.words / 230))} min</span></div>` });
};
W.a11yIssues = () => {
  const out = [];
  $$('img', E).forEach(i => { if (!i.alt || !i.alt.trim()) out.push({ el:i, t:'Missing alternative text', d:'Describe this picture so screen reader users know what it shows.' }); });
  let last = 0; $$('h1,h2,h3,h4', E).forEach(h => { if (h.classList.contains('title')) return; const l = +h.tagName[1]; if (!h.textContent.trim()) out.push({ el:h, t:'Empty heading', d:'Headings with no text confuse navigation. Remove it or add text.' }); else if (last && l > last + 1) out.push({ el:h, t:`Heading level skipped (H${last} → H${l})`, d:'Use headings in order so the outline makes sense.' }); last = l; });
  $$('table', E).forEach(t => { if (!t.querySelector('th')) out.push({ el:t, t:'Table has no header row', d:'Turn on Header Row (Table Design) so each column is announced.' }); });
  $$('a[href]:not(.bm)', E).forEach(a => { if (/^(click here|here|link|more)$/i.test(a.textContent.trim())) out.push({ el:a, t:'Unclear link text', d:`“${a.textContent.trim()}” doesn’t say where the link goes.` }); });
  $$('[style*="color"]', E).forEach(x => { const c = x.style.color; if (!c) return; const m = rgbHex(getComputedStyle(x).color); const v = parseInt(m.slice(1), 16), L = (.2126 * (v >> 16) + .7152 * ((v >> 8) & 255) + .0722 * (v & 255)) / 255; if (L > .8 && x.textContent.trim()) out.push({ el:x, t:'Hard-to-read text color', d:'Very light text on a light page is hard to read.' }); });
  return out;
};
W.a11yDialog = () => {
  const issues = W.a11yIssues(); const body = el('div', { class:'dlg-col' });
  if (!issues.length) body.append(el('p', { text:'No accessibility issues found. Nice work.' }));
  let m; issues.forEach(i => body.append(el('button', { class:'a11y-item', html:`${icon('error')}<span><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span>`, onclick:() => { m.close(); i.el.scrollIntoView({ block:'center', behavior:'smooth' }); if (i.el.tagName === 'IMG') W.selectImg(i.el); else { const r = document.createRange(); r.selectNodeContents(i.el); W.select(r); } } })));
  m = ONE.modal({ title:'Accessibility', icon:'accessibility_new', width:520, body });
};
let at; W.hooks.push(() => { clearTimeout(at); at = setTimeout(() => { const n = W.a11yIssues().length; const b = $('#a11yInfo'); b.lastChild.textContent = n ? `Accessibility: Investigate (${n})` : 'Accessibility: Good to go'; b.classList.toggle('chip-warn', !!n); }, 1200); });
W.speaking = false;
A.speak = () => {
  if (!('speechSynthesis' in window)) return ONE.toast('Read Aloud isn’t available in this browser.');
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); W.speaking = false; ONE.ribbon.refresh(); return; }
  const s = getSelection(), text = (!s.isCollapsed && E.contains(s.anchorNode)) ? s.toString() : E.innerText;
  const u = new SpeechSynthesisUtterance(text); u.onend = u.onerror = () => { W.speaking = false; ONE.ribbon.refresh(); };
  W.speaking = true; ONE.ribbon.refresh(); speechSynthesis.speak(u);
};
})();
