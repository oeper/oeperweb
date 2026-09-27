/* oneWord — document core: state, selection, formatting primitives, history, pagination, persistence */
(() => {
'use strict';
const { $, $$, store } = ONE;
const W = window.W = {};
const editor = W.editor = $('#editor'), sheet = W.sheet = $('#sheet'), canvas = W.canvas = $('#canvas'), zoomer = W.zoomer = $('#zoomer'), pagesEl = $('#pages'), app = W.app = $('#app');
W.GAP = 24;
W.hooks = [];

W.SIZES = { letter:{ name:'Letter', d:'8.5" × 11"', w:816, h:1056 }, legal:{ name:'Legal', d:'8.5" × 14"', w:816, h:1344 }, a4:{ name:'A4', d:'8.27" × 11.69"', w:794, h:1123 }, a5:{ name:'A5', d:'5.83" × 8.27"', w:559, h:794 }, exec:{ name:'Executive', d:'7.25" × 10.5"', w:696, h:1008 } };
W.MARGINS = { normal:{ name:'Normal', d:'Top 1"  Bottom 1"  Left 1"  Right 1"', v:[96,96,96,96] }, narrow:{ name:'Narrow', d:'Top 0.5"  Bottom 0.5"  Left 0.5"  Right 0.5"', v:[48,48,48,48] }, moderate:{ name:'Moderate', d:'Top 1"  Bottom 1"  Left 0.75"  Right 0.75"', v:[96,72,96,72] }, wide:{ name:'Wide', d:'Top 1"  Bottom 1"  Left 2"  Right 2"', v:[96,192,96,192] }, mirrored:{ name:'Mirrored', d:'Top 1"  Bottom 1"  Inside 1.25"  Outside 1"', v:[96,96,96,120] } };
W.FONTS = [
  ['Calibri','Calibri, Carlito, sans-serif'], ['Calibri Light','"Calibri Light", Calibri, Carlito, sans-serif'], ['Cambria','Cambria, Caladea, Georgia, serif'], ['Aptos','Aptos, Calibri, Carlito, sans-serif'],
  ['Arial','Arial, Helvetica, sans-serif'], ['Arial Black','"Arial Black", Arial, sans-serif'], ['Book Antiqua','"Book Antiqua", Palatino, serif'], ['Candara','Candara, Calibri, Carlito, sans-serif'],
  ['Century Gothic','"Century Gothic", Futura, sans-serif'], ['Comic Sans MS','"Comic Sans MS", "Comic Sans", cursive'], ['Consolas','Consolas, "Courier New", monospace'], ['Constantia','Constantia, Georgia, serif'],
  ['Corbel','Corbel, Calibri, sans-serif'], ['Courier New','"Courier New", Courier, monospace'], ['Franklin Gothic','"Franklin Gothic Medium", Arial, sans-serif'], ['Garamond','Garamond, "EB Garamond", Georgia, serif'],
  ['Georgia','Georgia, serif'], ['Impact','Impact, "Arial Black", sans-serif'], ['Lucida Console','"Lucida Console", monospace'], ['Palatino Linotype','"Palatino Linotype", Palatino, serif'],
  ['Segoe Print','"Segoe Print", Caveat, cursive'], ['Segoe UI','"Segoe UI", system-ui, sans-serif'], ['Tahoma','Tahoma, Verdana, sans-serif'], ['Times New Roman','"Times New Roman", Times, serif'],
  ['Trebuchet MS','"Trebuchet MS", sans-serif'], ['Verdana','Verdana, sans-serif']
];
W.SIZES_PT = [8,9,10,10.5,11,12,14,16,18,20,22,24,26,28,36,48,72];

/* design presets (Design tab) */
W.STYLESETS = {
  office:{ name:'Office', body:'Calibri, Carlito, "Segoe UI", sans-serif', head:'"Calibri Light", Calibri, Carlito, sans-serif', weight:400, transform:'none', rule:'none' },
  classic:{ name:'Classic', body:'Cambria, Caladea, Georgia, serif', head:'Cambria, Caladea, Georgia, serif', weight:700, transform:'none', rule:'none' },
  modern:{ name:'Modern', body:'Aptos, "Segoe UI", "Roboto Flex", sans-serif', head:'Aptos, "Segoe UI", "Roboto Flex", sans-serif', weight:600, transform:'none', rule:'none' },
  elegant:{ name:'Elegant', body:'Georgia, serif', head:'Garamond, "EB Garamond", Georgia, serif', weight:400, transform:'uppercase', rule:'none' },
  lines:{ name:'Lines', body:'Arial, Helvetica, sans-serif', head:'Arial, Helvetica, sans-serif', weight:700, transform:'none', rule:'1.5px solid var(--accent)' },
  casual:{ name:'Casual', body:'"Trebuchet MS", sans-serif', head:'"Trebuchet MS", sans-serif', weight:700, transform:'none', rule:'none' },
  mono:{ name:'Typewriter', body:'"Courier New", Courier, monospace', head:'"Courier New", Courier, monospace', weight:700, transform:'uppercase', rule:'none' }
};
W.THEMECOLORS = {
  office:{ name:'Office', h:'#2f5496', h3:'#1f3763', a:'#4472c4', sw:['#44546A','#4472C4','#ED7D31','#A5A5A5','#FFC000','#5B9BD5'] },
  blue2:{ name:'Blue II', h:'#1f6391', h3:'#15425f', a:'#335b74', sw:['#335B74','#1CADE4','#2683C6','#27CED7','#42BA97','#3E8853'] },
  green:{ name:'Green', h:'#4e7a2e', h3:'#34511f', a:'#70ad47', sw:['#455F51','#549E39','#8AB833','#C0CF3A','#029676','#4AB5C4'] },
  orange:{ name:'Orange', h:'#b35511', h3:'#773a0b', a:'#ed7d31', sw:['#637052','#E48312','#BD582C','#865640','#9B8357','#C2BC80'] },
  red:{ name:'Red', h:'#a5300f', h3:'#6e200a', a:'#d34817', sw:['#696464','#A5300F','#D55816','#E19825','#B19C7D','#7F5F52'] },
  violet:{ name:'Violet', h:'#5f3c8f', h3:'#3f285f', a:'#7e57c2', sw:['#373545','#AD84C6','#8784C7','#5D739A','#6997AF','#84ACB6'] },
  gray:{ name:'Grayscale', h:'#404040', h3:'#262626', a:'#7f7f7f', sw:['#000000','#DDDDDD','#B2B2B2','#969696','#808080','#5F5F5F'] }
};
W.PSPACING = { default:['Default', '8pt', 1.3], none:['No Paragraph Space', '0', 1.2], compact:['Compact', '4pt', 1.2], tight:['Tight', '6pt', 1.15], open:['Open', '10pt', 1.45], relaxed:['Relaxed', '6pt', 1.6], double:['Double', '8pt', 2.4] };

W.settings = Object.assign({ author:'You', smartQuotes:true, autoLists:true, autoDashes:true, autoCaps:false, miniToolbar:true, autosave:true }, store.get('ow-settings', {}));
W.saveSettings = () => store.set('ow-settings', W.settings);
W.initials = () => (W.settings.author || 'You').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
W.newDoc = (html = '<p><br></p>', title = 'Document') => ({
  id:ONE.uid(), title, html, updated:Date.now(),
  meta:{ author:W.settings.author, subject:'', tags:'', created:Date.now() },
  layout:{ size:'letter', orient:'portrait', margin:'normal', m:[96,96,96,96], cols:1, colRule:false, hyph:false },
  design:{ set:'office', colors:'office', spacing:'default', pageColor:'', watermark:'', border:'' },
  hf:{ header:'', footer:'', first:false }, comments:{}, sources:[], versions:[], readonly:false, final:false, track:false
});
W.doc = W.newDoc();

/* ---------- dimensions & layout ---------- */
W.dims = () => { const s = W.SIZES[W.doc.layout.size] || W.SIZES.letter; return W.doc.layout.orient === 'landscape' ? [s.h, s.w] : [s.w, s.h]; };
W.isFlow = () => !app.classList.contains('weblayout') && !app.classList.contains('readmode');
W.applyLayout = () => {
  const L = W.doc.layout, [w, h] = W.dims(), [t, r, b, l] = L.m;
  const st = document.documentElement.style;
  st.setProperty('--pw', w + 'px'); st.setProperty('--ph', h + 'px');
  [['--mt', t], ['--mr', r], ['--mb', b], ['--ml', l]].forEach(([k, v]) => st.setProperty(k, v + 'px'));
  editor.style.columnCount = L.cols > 1 ? L.cols : '';
  editor.style.columnGap = L.cols > 1 ? '.5in' : '';
  editor.style.columnRule = L.cols > 1 && L.colRule ? '1px solid #999' : '';
  editor.classList.toggle('hyph', !!L.hyph);
  W.buildRuler(); W.applyDesign(); W._pagesSig = ''; W.schedule();
};
W.applyDesign = () => {
  const D = W.doc.design, s = W.STYLESETS[D.set] || W.STYLESETS.office, c = W.THEMECOLORS[D.colors] || W.THEMECOLORS.office, p = W.PSPACING[D.spacing] || W.PSPACING.default;
  const v = { '--body-font':s.body, '--head-font':s.head, '--title-font':s.head, '--h-weight':s.weight, '--h-transform':s.transform, '--h-rule':s.rule,
    '--h-color':c.h, '--h3-color':c.h3, '--accent':c.a, '--pspace':p[1], '--lh':p[2], '--page':D.pageColor || '#fff' };
  for (const k in v) sheet.style.setProperty(k, v[k]);
  W._pagesSig = '';
};
W.buildRuler = () => {
  const [w] = W.dims(), [, r, , l] = W.doc.layout.m, el = $('#ruler');
  let html = `<div class="rm" style="left:0;width:${l}px"></div><div class="rm" style="right:0;width:${r}px"></div><i class="ind" id="rulerInd" style="left:${l}px"></i>`;
  for (let x = 12; x < w; x += 12) {
    const rel = x - l; if (Math.abs(rel) < 1) continue;
    if (rel % 96 === 0) html += `<span class="num" style="left:${x}px">${Math.abs(rel / 96)}</span>`;
    else html += `<span class="tk" style="left:${x}px;height:${rel % 48 === 0 ? 6 : 3}px"></span>`;
  }
  el.innerHTML = html;
};

/* ---------- selection ---------- */
W.saved = null;
const hostOf = n => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return e ? e.closest('#editor, .hf.editing') : null; };
W.hostOf = hostOf;
document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (s.rangeCount && hostOf(s.anchorNode)) { W.saved = s.getRangeAt(0).cloneRange(); W.scheduleState(); }
});
W.host = () => (W.saved && hostOf(W.saved.startContainer)) || editor;
W.restore = () => {
  const h = W.host();
  if (document.activeElement !== h) h.focus({ preventScroll:true });
  if (W.saved && h.contains(W.saved.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(W.saved); }
  return h;
};
W.select = r => { W.saved = r.cloneRange(); W.restore(); };
W.isRO = () => W.doc.readonly || W.doc.final || app.classList.contains('readmode');
W.roToast = () => ONE.toast(W.doc.final ? 'This document is marked as final. Turn it off in File › Info to edit.' : 'Editing is restricted. Turn off Review › Restrict Editing to make changes.');
const INLINE_CMDS = ['bold','italic','underline','strikeThrough','subscript','superscript'];
W.exec = (cmd, val = null) => {
  if (W.isRO() && !['copy','selectAll'].includes(cmd)) return W.roToast();
  W.restore();
  document.execCommand('styleWithCSS', false, !INLINE_CMDS.includes(cmd));
  const ok = document.execCommand(cmd, false, val);
  if (!['copy','selectAll'].includes(cmd)) W.changed();
  return ok;
};
const BLOCK = 'p,h1,h2,h3,h4,h5,h6,blockquote,li,pre';
W.BLOCK = BLOCK;
W.block = () => {
  const r = W.saved; if (!r) return null;
  let n = r.startContainer; if (n.nodeType === 3) n = n.parentElement;
  const b = n && n.closest(BLOCK); return b && W.host().contains(b) ? b : null;
};
W.blocks = () => {
  const r = W.saved; if (!r) return [];
  let list = $$(BLOCK, W.host()).filter(b => r.intersectsNode(b));
  list = list.filter(b => !list.some(o => o !== b && b.contains(o)));
  if (!list.length) { const b = W.block(); if (b) list = [b]; }
  return list;
};
W.ensureBlock = () => { if (!W.block()) { W.restore(); document.execCommand('formatBlock', false, '<p>'); W.saved = getSelection().rangeCount ? getSelection().getRangeAt(0).cloneRange() : W.saved; } };
W.cell = () => { const r = W.saved; if (!r) return null; let n = r.startContainer; if (n.nodeType === 3) n = n.parentElement; const c = n && n.closest('td,th'); return c && editor.contains(c) ? c : null; };
W.selectWord = () => {
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false;
  const n = s.anchorNode, o = s.anchorOffset; if (!n || n.nodeType !== 3) return false;
  const re = /[\p{L}\p{N}_'’-]/u; let a = o, b = o;
  while (a > 0 && re.test(n.data[a - 1])) a--;
  while (b < n.data.length && re.test(n.data[b])) b++;
  if (a === o || b === o) return false;
  const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); s.removeAllRanges(); s.addRange(r); W.saved = r.cloneRange(); return true;
};

/* Apply inline CSS to the selection (marker trick keeps multi-block selections working). */
W.applyInline = (styles, opt = {}) => {
  if (W.isRO()) return W.roToast();
  const host = W.restore(), s = getSelection(); if (!s.rangeCount) return;
  if (s.isCollapsed && !W.selectWord()) {
    const span = document.createElement('span'); Object.assign(span.style, styles); span.textContent = '​';
    const r = s.getRangeAt(0); r.insertNode(span);
    const nr = document.createRange(); nr.setStart(span.firstChild, 1); nr.collapse(true); s.removeAllRanges(); s.addRange(nr); W.saved = nr.cloneRange();
    W.changed(); return;
  }
  $$('[style]', host).forEach(e => { if (e.style.fontFamily) e.dataset.ff = e.style.fontFamily; });
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('fontName', false, 'owmark');
  const props = [...Object.keys(styles), ...(opt.clear || [])];
  const marks = $$('[style*="owmark"], font[face="owmark"]', host).map(m => {
    let e = m;
    if (m.tagName === 'FONT') { e = document.createElement('span'); while (m.firstChild) e.appendChild(m.firstChild); m.replaceWith(e); }
    e.style.fontFamily = e.dataset.ff || '';
    $$('[style]', e).forEach(d => props.forEach(p => { d.style[p] = ''; }));
    (opt.clear || []).forEach(p => { e.style[p] = ''; });
    for (const k in styles) e.style[k] = styles[k];
    return e;
  });
  $$('[data-ff]', host).forEach(e => delete e.dataset.ff);
  $$('span', host).forEach(e => { if (!e.attributes.length) e.replaceWith(...e.childNodes); else if (e.getAttribute('style') === '') e.removeAttribute('style'); });
  const live = marks.filter(m => m.isConnected);
  if (live.length) { const r = document.createRange(); r.setStartBefore(live[0]); r.setEndAfter(live[live.length - 1]); s.removeAllRanges(); s.addRange(r); W.saved = r.cloneRange(); }
  W.changed();
};
W.setBlockStyle = (b, prop, val) => {
  if (prop === 'marginTop' && b.dataset.push) b.dataset.mt = val;
  b.style[prop] = val;
};

/* ---------- history (snapshots — also covers our own DOM edits) ---------- */
const H = W.history = { stack:[], i:-1, last:0, kind:'' };
W.cleanHTML = (root = editor) => {
  const c = root.cloneNode(true);
  $$('[data-push]', c).forEach(e => { e.style.marginTop = e.dataset.mt || ''; delete e.dataset.push; delete e.dataset.mt; if (e.getAttribute('style') === '') e.removeAttribute('style'); });
  $$('.cellsel', c).forEach(e => e.classList.remove('cellsel'));
  $$('span.cmt.act', c).forEach(e => e.classList.remove('act'));
  $$('[class=""]', c).forEach(e => e.removeAttribute('class'));
  return c.innerHTML;
};
W.caretOffsets = () => {
  const s = getSelection(); if (!s.rangeCount || !editor.contains(s.anchorNode)) return null;
  const r = s.getRangeAt(0), off = (node, o) => { const x = document.createRange(); x.selectNodeContents(editor); try { x.setEnd(node, o); } catch { return 0; } return x.toString().length; };
  return [off(r.startContainer, r.startOffset), off(r.endContainer, r.endOffset)];
};
W.rangeFromOffsets = (a, b) => {
  const w = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT); let pos = 0, r = document.createRange(), sa = false, n, last = null;
  while ((n = w.nextNode())) {
    const len = n.data.length; last = n;
    if (!sa && a <= pos + len) { r.setStart(n, a - pos); sa = true; }
    if (sa && b <= pos + len) { r.setEnd(n, b - pos); return r; }
    pos += len;
  }
  if (last) { if (!sa) r.setStart(last, last.data.length); r.setEnd(last, last.data.length); } else { r.selectNodeContents(editor); r.collapse(true); }
  return r;
};
H.snap = () => ({ html:W.cleanHTML(), caret:W.caretOffsets() });
H.record = (kind = 'cmd') => {
  const s = H.snap(), now = Date.now();
  if (H.i >= 0 && H.stack[H.i].html === s.html) { H.stack[H.i].caret = s.caret; return; }
  if (kind === 'type' && H.kind === 'type' && now - H.last < 900 && H.i === H.stack.length - 1 && H.i > 0) H.stack[H.i] = s;
  else { H.stack.splice(H.i + 1); H.stack.push(s); if (H.stack.length > 300) H.stack.shift(); H.i = H.stack.length - 1; }
  H.last = now; H.kind = kind;
};
H.reset = () => { H.stack = []; H.i = -1; H.kind = ''; H.record('init'); };
H.go = d => {
  if (W.isRO()) return W.roToast();
  const j = H.i + d; if (j < 0 || j >= H.stack.length) return ONE.toast(d < 0 ? 'Nothing to undo.' : 'Nothing to redo.');
  H.i = j; H.kind = 'nav'; const s = H.stack[j];
  editor.innerHTML = s.html;
  if (s.caret) { const r = W.rangeFromOffsets(s.caret[0], s.caret[1]); editor.focus({ preventScroll:true }); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); W.saved = r.cloneRange(); const e = r.startContainer.parentElement; e && e.scrollIntoView({ block:'nearest' }); }
  W.changed({ history:false });
};
W.undo = () => H.go(-1); W.redo = () => H.go(1);

/* ---------- change pipeline ---------- */
W.changed = (o = {}) => {
  if (!editor.firstChild) editor.innerHTML = '<p><br></p>';
  if (o.history !== false) H.record(o.kind || 'cmd');
  W.dirty(); W.schedule();
};
const flush = () => { cancelAnimationFrame(W._raf); clearTimeout(W._rt); W._raf = W._rt = 0; W.renumber(); W.paginate(); W.updateState(); W.hooks.forEach(f => { try { f(); } catch (err) { console.error(err); } }); };
W.schedule = () => { if (W._raf || W._rt) return; W._raf = requestAnimationFrame(flush); W._rt = setTimeout(flush, 80); };
W.flush = flush;
W.scheduleState = () => { clearTimeout(W._sraf); W._sraf = setTimeout(W.updateState, 16); };
W.renumber = () => {
  const counts = {};
  $$('.capnum', editor).forEach(c => { const k = c.dataset.kind || 'Figure'; counts[k] = (counts[k] || 0) + 1; c.textContent = `${k} ${counts[k]}`; });
  const refs = $$('.fnref', editor), list = $('ol.endnotes', editor);
  refs.forEach((r, i) => r.textContent = i + 1);
  if (list) {
    refs.forEach(r => { const li = list.querySelector(`#en-${r.dataset.id}`); if (li) list.append(li); });
    $$('li', list).forEach(li => { if (!refs.some(r => 'en-' + r.dataset.id === li.id)) li.remove(); });
    if (!list.children.length) { const hr = $('.endhr', editor); hr && hr.remove(); list.remove(); }
  }
};

/* ---------- pagination: push blocks off page boundaries so every page has real margins ---------- */
W.pageCount = 1;
function units(){
  const out = [];
  for (const c of editor.children) {
    const cs = getComputedStyle(c);
    if (cs.float !== 'none' || cs.display === 'none') continue;
    if (c.matches('ul,ol')) { for (const li of c.children) out.push(li); continue; }
    out.push(c);
  }
  return out;
}
W.paginate = () => {
  const [pw, ph] = W.dims(), [mt, , mb] = W.doc.layout.m, S = ph + W.GAP;
  $$('[data-push]', editor).forEach(e => { e.style.marginTop = e.dataset.mt || ''; delete e.dataset.push; delete e.dataset.mt; if (e.getAttribute('style') === '') e.removeAttribute('style'); });
  if (!W.isFlow()) { sheet.style.minHeight = ''; W.pageCount = Math.max(1, Math.ceil(editor.offsetHeight / (ph - mt - mb))); W.renderPages(0); return; }
  const sTop = sheet.getBoundingClientRect().top, k = sheet.getBoundingClientRect().width / pw || 1;
  const Y = r => (r - sTop) / k;
  if (W.doc.layout.cols === 1) {
    const contentH = ph - mt - mb; let force = null;
    for (const u of units()) {
      const r = u.getBoundingClientRect(), top = Y(r.top), bot = Y(r.bottom);
      const p = Math.max(0, Math.floor(top / S)); let target = null;
      if (force !== null) { target = (force + 1) * S + mt; force = null; }
      else if (u.dataset.pbb && top > p * S + mt + 1) target = (p + 1) * S + mt;
      else if (top < p * S + mt - .5) target = p * S + mt;
      else if (top > p * S + ph - mb) target = (p + 1) * S + mt;
      else if (bot > p * S + ph - mb + .5 && bot - top <= contentH) target = (p + 1) * S + mt;
      if (target !== null && target > top + .5) {
        if (!u.dataset.push) { u.dataset.mt = u.style.marginTop; u.dataset.push = '1'; }
        const base = parseFloat(getComputedStyle(u).marginTop) || 0;
        u.style.marginTop = (base + target - top) + 'px';
        const nt = Y(u.getBoundingClientRect().top);
        if (Math.abs(nt - target) > .5) u.style.marginTop = (base + target - top + target - nt) + 'px';
      }
      if (u.classList.contains('pgbreak')) force = Math.floor(Y(u.getBoundingClientRect().top) / S);
    }
  }
  const edBot = Y(editor.getBoundingClientRect().bottom);
  const n = Math.max(1, Math.floor((edBot - 1) / S) + 1);
  W.pageCount = n; sheet.style.minHeight = (n * S - W.GAP) + 'px';
  W.renderPages(n);
};
W.fields = (html, k, n) => {
  if (!html) return '';
  const t = document.createElement('div'); t.innerHTML = html;
  $$('.fld', t).forEach(f => { const v = { page:k + 1, numpages:n, date:new Date().toLocaleDateString(), title:$('#docTitle').value, author:W.doc.meta.author }[f.dataset.f]; f.textContent = v ?? ''; });
  return t.innerHTML;
};
W.renderPages = n => {
  if (W.hfEditing) return;
  const D = W.doc.design, hf = W.doc.hf, S = W.dims()[1] + W.GAP;
  const sig = [n, hf.header, hf.footer, hf.first, D.watermark, D.border, S, $('#docTitle').value].join('|');
  if (sig === W._pagesSig) return;
  const prev = pagesEl.children.length; W._pagesSig = sig;
  pagesEl.innerHTML = '';
  for (let k = 0; k < n; k++) {
    const pg = ONE.el('div', { class:'pagebg' + (k >= prev && prev ? ' new' : '') + (D.border ? ' b-' + D.border : ''), style:{ top:(k * S) + 'px' }, 'data-page':k });
    const blank = hf.first && k === 0;
    pg.append(ONE.el('div', { class:'hf hdr', 'data-label':'Header', html:blank ? '' : W.fields(hf.header, k, n) }), ONE.el('div', { class:'hf ftr', 'data-label':'Footer', html:blank ? '' : W.fields(hf.footer, k, n) }));
    if (D.watermark) pg.append(ONE.el('div', { class:'wm', text:D.watermark }));
    pagesEl.append(pg);
  }
};
W.pageOfNode = node => {
  const e = node.nodeType === 1 ? node : node.parentElement; if (!e) return 1;
  const [pw, ph] = W.dims(), sr = sheet.getBoundingClientRect(), k = sr.width / pw || 1;
  const y = (e.getBoundingClientRect().top - sr.top) / k;
  return W.isFlow() ? Math.min(W.pageCount, Math.max(1, Math.floor(y / (ph + W.GAP)) + 1)) : 1;
};

/* ---------- stats ---------- */
W.stats = (root = editor) => {
  const clone = root.cloneNode(true); $$('del.tc, .toc', clone).forEach(e => e.remove());
  const text = clone.textContent.replace(/​/g, '');
  const words = (text.match(/[^\s]+/g) || []).length;
  return { words, chars:text.replace(/\n/g, '').length, charsNoSp:text.replace(/\s/g, '').length,
    paras:$$('p,h1,h2,h3,h4,li,blockquote', root).filter(e => e.textContent.trim()).length,
    lines:Math.max(1, Math.round(root.offsetHeight / 19)) };
};

/* ---------- zoom ---------- */
W.zoom = 1;
W.setZoom = z => {
  W.zoom = ONE.clamp(Math.round(z * 100) / 100, .1, 5); zoomer.style.zoom = W.zoom;
  $('#zoomRange').value = Math.round(W.zoom * 100); $('#zoomPct').textContent = Math.round(W.zoom * 100) + '%';
  W.hooks.forEach(f => { try { f(); } catch {} });
};
W.fitWidth = () => { const extra = app.classList.contains('show-comments') && Object.keys(W.doc.comments).length ? 290 : 0; return (canvas.clientWidth - 40) / (W.dims()[0] + extra); };

/* ---------- ribbon state sync ---------- */
W.updateState = () => {
  const s = getSelection(), inDoc = s.rangeCount && hostOf(s.anchorNode);
  if (inDoc) {
    const node = s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode;
    const cs = getComputedStyle(node);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    const fsel = $('#fontName');
    if (fsel && document.activeElement !== fsel) { const f = W.FONTS.find(([n, st]) => n.toLowerCase() === fam || st.split(',')[0].replace(/["']/g, '').trim().toLowerCase() === fam); fsel.value = f ? f[0] : fsel.value; }
    const size = $('#fontSize'); if (size && document.activeElement !== size) size.value = Math.round(parseFloat(cs.fontSize) * .75 * 2) / 2;
    const b = W.block();
    let key = 'p';
    if (b) { const t = b.tagName.toLowerCase(); key = t + (b.classList.contains('title') ? '.title' : b.classList.contains('subtitle') ? '.subtitle' : b.classList.contains('nospace') ? '.nospace' : b.classList.contains('quote') ? '.quote' : ''); if (t === 'li') key = 'li'; }
    $$('.sty[data-style]').forEach(x => x.classList.toggle('on', x.dataset.style === key));
    const bs = b ? getComputedStyle(b) : null;
    const ind = $('#rulerInd'); if (ind && bs) ind.style.left = (W.doc.layout.m[3] + parseFloat(bs.marginLeft) + (b.tagName === 'LI' ? 48 : 0)) + 'px';
    const setv = (id, v) => { const i = $(id); if (i && document.activeElement !== i) i.value = v; };
    if (bs) {
      setv('#indL', +(parseFloat(bs.marginLeft) / 96).toFixed(2)); setv('#indR', +(parseFloat(bs.marginRight) / 96).toFixed(2));
      let mtPx = parseFloat(bs.marginTop) || 0;
      if (b.dataset.push) { const v = b.dataset.mt || ''; mtPx = v ? parseFloat(v) * (v.endsWith('pt') ? 4 / 3 : v.endsWith('in') ? 96 : 1) : 0; }
      setv('#spB', Math.round(mtPx * .75)); setv('#spA', Math.round(parseFloat(bs.marginBottom) * .75));
    }
    ONE.ribbon.setContext('table', !!W.cell());
    $('#pageInfo').textContent = `Page ${W.pageOfNode(s.anchorNode)} of ${W.pageCount}`;
  } else $('#pageInfo').textContent = `Page ${Math.min(W.pageCount, parseInt(($('#pageInfo').textContent.match(/\d+/) || [1])[0]))} of ${W.pageCount}`;
  ONE.ribbon.setContext('picture', !!W.selImg);
  ONE.ribbon.setContext('hf', !!W.hfEditing);
  ONE.ribbon.refresh();
  W.updateWords();
};
W.updateWords = () => {
  const s = getSelection(), total = W.stats().words;
  let t = `${total.toLocaleString()} word${total === 1 ? '' : 's'}`;
  if (s.rangeCount && !s.isCollapsed && editor.contains(s.anchorNode)) t = `${(s.toString().match(/[^\s]+/g) || []).length} of ${total.toLocaleString()} words`;
  $('#wordInfo').textContent = t;
};

/* ---------- persistence: a small document library in this browser ---------- */
W.lib = store.get('ow-lib', { current:null, docs:{} });
let saveT;
W.dirty = () => {
  $('#saveState').textContent = 'Saving…'; $('#saveState').classList.add('busy');
  clearTimeout(saveT); saveT = setTimeout(() => W.save(false), 900);
};
W.save = explicit => {
  clearTimeout(saveT);
  const d = W.doc; d.html = W.cleanHTML(); d.title = $('#docTitle').value.trim() || 'Document';
  // W.pristine: set for the blank document shown on a first visit, so opening the app doesn't create a file
  if (!explicit && W.pristine) { if (W.pristine === d.title + '\u0000' + d.html) { const st = $('#saveState'); st.classList.remove('busy'); st.textContent = 'Saved'; return true; } W.pristine = null; }
  W.pristine = null; d.updated = Date.now();
  const lastV = d.versions[0];
  if (explicit || !lastV || Date.now() - lastV.t > 5 * 60e3) { if (!lastV || lastV.html !== d.html) { d.versions.unshift({ t:Date.now(), html:d.html, title:d.title }); d.versions = d.versions.slice(0, 12); } }
  const ok = store.set('ow-doc-' + d.id, d);
  W.lib.docs[d.id] = { title:d.title, updated:d.updated, words:W.stats().words }; W.lib.current = d.id; store.set('ow-lib', W.lib);
  const st = $('#saveState'); st.classList.remove('busy'); st.textContent = ok ? 'Saved' : 'Not saved';
  st.title = ok ? 'Saved in this browser' : 'This browser blocked local storage, so changes are not kept.';
  return ok;
};
W.open = d => {
  W.doc = Object.assign(W.newDoc(), d);
  W.doc.layout = Object.assign(W.newDoc().layout, d.layout || {}); W.doc.design = Object.assign(W.newDoc().design, d.design || {}); W.doc.hf = Object.assign(W.newDoc().hf, d.hf || {});
  $('#docTitle').value = W.doc.title;
  editor.innerHTML = W.doc.html || '<p><br></p>';
  stripWS(editor);
  W.selImg = null; W.saved = null;
  editor.contentEditable = String(!(W.doc.readonly || W.doc.final));
  W.applyLayout(); H.reset(); W.changed({ history:false });
  W.hooks.forEach(f => { try { f(); } catch {} });
  W.lib.current = W.doc.id; store.set('ow-lib', W.lib);
};
function stripWS(root){
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), dead = [];
  for (let n; (n = w.nextNode());) if (!n.data.trim() && /^(DIV|UL|OL|TABLE|TBODY|THEAD|TR|SECTION)$/.test(n.parentNode.nodeName)) dead.push(n);
  dead.forEach(n => n.remove());
}
W.stripWS = stripWS;
W.sanitize = html => {
  const d = new DOMParser().parseFromString(html, 'text/html');
  $$('script,style,iframe,object,embed,link,meta,form,input,button,noscript,svg', d).forEach(n => n.remove());
  $$('*', d.body).forEach(e => [...e.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*(javascript|vbscript):/i.test(a.value)) || a.name === 'contenteditable') e.removeAttribute(a.name); }));
  $$('[class^="Mso"],[class*=" Mso"]', d.body).forEach(e => e.removeAttribute('class'));
  return d.body.innerHTML;
};
})();
