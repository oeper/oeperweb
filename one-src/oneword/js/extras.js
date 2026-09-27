/* oneWord — extras: Editor checks, readability, Go To, icons, compare versions, Immersive Reader, file export */
(() => {
'use strict';
const { $, $$, esc, el, icon } = ONE;
const E = W.editor, A = W.act, P = W.pops;

/* ---------- readability ---------- */
const syllables = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return m ? m.length : 1; };
W.readability = (text = E.innerText) => {
  const sentences = (text.match(/[^.!?\n]+[.!?]+/g) || []).length || 1, words = text.match(/[A-Za-z’']+/g) || [];
  if (words.length < 10) return null;
  const syl = words.reduce((a, w) => a + syllables(w), 0), wps = words.length / sentences, spw = syl / words.length;
  const ease = Math.round(206.835 - 1.015 * wps - 84.6 * spw), grade = Math.max(1, Math.round(0.39 * wps + 11.8 * spw - 15.59));
  const label = ease >= 80 ? 'Very easy' : ease >= 65 ? 'Easy' : ease >= 50 ? 'Fairly hard' : ease >= 30 ? 'Hard' : 'Very hard';
  return { ease:Math.max(0, Math.min(100, ease)), grade, label, wps:Math.round(wps * 10) / 10 };
};
const origWC = W.wordCountDialog;
W.wordCountDialog = () => {
  origWC();
  const r = W.readability(), m = ONE.topModal(); if (!r || !m) return;
  m.body.append(el('div', { class:'info', style:{ color:'var(--on-surface)', marginTop:'4px' }, html:`<span>Reading ease</span><span>${r.ease} · ${r.label}</span><span>Grade level</span><span>${r.grade}</span><span>Words per sentence</span><span>${r.wps}</span>` }));
};

/* ---------- Editor: grammar-lite and style checks ---------- */
const WORDY = [[/\bin order to\b/gi, 'to'], [/\bdue to the fact that\b/gi, 'because'], [/\bat this point in time\b/gi, 'now'], [/\bin the event that\b/gi, 'if'], [/\ba (large )?number of\b/gi, 'many'], [/\bvery unique\b/gi, 'unique'], [/\bfor the purpose of\b/gi, 'for'], [/\bprior to\b/gi, 'before'], [/\bwith regard to\b/gi, 'about'], [/\bin spite of the fact that\b/gi, 'although']];
W.editorIssues = () => {
  const out = [], w = document.createTreeWalker(E, NodeFilter.SHOW_TEXT);
  const add = (n, i, len, kind, msg, fix) => { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + len); out.push({ r, kind, msg, fix, text:n.data.slice(i, i + len) }); };
  for (let n; (n = w.nextNode());) {
    if (n.parentElement.closest('.toc,del.tc,.fld,.capnum,.cite,.fnref')) continue;
    const t = n.data; let m;
    const rep = /\b(\w+)(\s+)\1\b/gi; while ((m = rep.exec(t))) if (!/^\d+$/.test(m[1])) add(n, m.index, m[0].length, 'Grammar', `Repeated word: “${m[1]}”`, m[1]);
    const ds = /(\S)( {2,})(?=\S)/g; while ((m = ds.exec(t))) add(n, m.index + 1, m[2].length, 'Spacing', 'Extra space between words', ' ');
    const sp = / +([,.;:!?])/g; while ((m = sp.exec(t))) add(n, m.index, m[0].length, 'Punctuation', `Space before “${m[1]}”`, m[1]);
    const cap = /([.!?])(\s+)([a-z])/g; while ((m = cap.exec(t))) add(n, m.index + m[1].length + m[2].length, 1, 'Capitalization', 'Sentences start with a capital letter', m[3].toUpperCase());
    const pv = /\b(is|are|was|were|been|being)\s+(\w+ed)\b(?!\s+(?:to|that))/gi; while ((m = pv.exec(t))) add(n, m.index, m[0].length, 'Clarity', 'Passive voice: consider saying who did it', null);
    WORDY.forEach(([re, rpl]) => { re.lastIndex = 0; while ((m = re.exec(t))) add(n, m.index, m[0].length, 'Conciseness', `Wordy: “${m[0]}” → “${rpl}”`, rpl); });
  }
  $$('p,li', E).forEach(b => { (b.textContent.match(/[^.!?]+[.!?]+/g) || []).forEach(s => { const n = (s.match(/\S+/g) || []).length; if (n > 40) { const r = document.createRange(); r.selectNodeContents(b); out.push({ r, kind:'Clarity', msg:`Long sentence (${n} words): consider splitting it`, fix:null, text:s.trim().slice(0, 60) + '…' }); } }); });
  return out;
};
W.editorPane = () => {
  const issues = W.editorIssues(), rd = W.readability();
  const body = el('div', { class:'dlg-col' });
  const counts = {}; issues.forEach(i => counts[i.kind] = (counts[i.kind] || 0) + 1);
  body.append(el('div', { class:'ed-score', html:`<div class="ed-ring" style="--p:${Math.max(4, 100 - Math.min(96, issues.length * 6))}"><b>${Math.max(0, 100 - Math.min(100, issues.length * 6))}</b></div><div><b>Editor score</b><small>${issues.length ? `${issues.length} suggestion${issues.length > 1 ? 's' : ''}` : 'No suggestions. Nice.'}${rd ? ` · Readability: ${rd.label} (grade ${rd.grade})` : ''}</small><div class="ed-chips">${Object.entries(counts).map(([k, v]) => `<span>${esc(k)} ${v}</span>`).join('')}</div></div>` }));
  let m;
  const list = el('div', { class:'list', style:{ maxHeight:'46vh', overflow:'auto' } });
  issues.slice(0, 150).forEach(it => {
    const row = el('div', { class:'list-item ed-item' }, el('span', { class:'ms', text:{ Grammar:'spellcheck', Spacing:'space_bar', Punctuation:'more_horiz', Capitalization:'match_case', Clarity:'lightbulb', Conciseness:'compress' }[it.kind] || 'edit_note' }),
      el('span', { class:'grow', html:`<b>${esc(it.msg)}</b><small>${esc(it.kind)} · “${esc(it.text)}”</small>` }));
    row.addEventListener('click', e => { if (e.target.closest('button')) return; m.close(); W.select(it.r); it.r.startContainer.parentElement.scrollIntoView({ block:'center', behavior:'smooth' }); });
    if (it.fix != null) row.append(el('button', { class:'btn tonal', text:'Fix', onclick:() => { W.select(it.r); W.doc.track ? W.trackedInsert(it.fix) : document.execCommand('insertText', false, it.fix); W.changed(); row.style.opacity = '.4'; row.querySelector('button').disabled = true; } }));
    list.append(row);
  });
  if (issues.length) body.append(list);
  m = ONE.modal({ title:'Editor', icon:'edit_note', width:560, body, actions:[{ label:'Recheck', kind:'text', on:() => { setTimeout(W.editorPane, 200); } }, { label:'Done', kind:'filled' }] });
};

/* ---------- Go To ---------- */
W.goToDialog = () => {
  const what = ONE.select([['page','Page'],['heading','Heading'],['bookmark','Bookmark'],['comment','Comment'],['table','Table'],['picture','Picture']], 'page');
  const val = ONE.input({ placeholder:'Page number' }), pick = ONE.select([], null); pick.hidden = true;
  const refresh = () => {
    const k = what.value; val.hidden = k !== 'page'; pick.hidden = k === 'page'; pick.innerHTML = '';
    const items = k === 'heading' ? $$('h1,h2,h3,h4', E).filter(h => h.textContent.trim()).map(h => [h, h.textContent.trim().slice(0, 60)]) :
      k === 'bookmark' ? $$('a.bm', E).map(b => [b, b.id.replace(/^bm-/, '')]) : k === 'comment' ? [...new Set($$('span.cmt', E).map(c => c.dataset.c))].map((id, i) => [$(`span.cmt[data-c="${id}"]`, E), `${i + 1}. ${(W.doc.comments[id] || {}).text || '(empty comment)'}`.slice(0, 60)]) :
      k === 'table' ? $$('table', E).map((t, i) => [t, `Table ${i + 1}`]) : k === 'picture' ? $$('img', E).map((t, i) => [t, `Picture ${i + 1}${t.alt ? ': ' + t.alt.slice(0, 40) : ''}`]) : [];
    pick._items = items; items.forEach(([, l], i) => pick.append(el('option', { value:i, text:l })));
    if (k !== 'page' && !items.length) pick.append(el('option', { text:'None in this document', disabled:true }));
  };
  what.onchange = refresh; refresh();
  ONE.modal({ title:'Go To', icon:'arrow_outward', body:el('div', { class:'dlg-col' }, ONE.field('Go to what', what), val, pick), actions:[{ label:'Cancel' }, { label:'Go To', kind:'filled', on:() => {
    if (what.value === 'page') { const n = parseInt(val.value, 10); const pg = $$('.pagebg', W.sheet)[n - 1]; if (!pg) { ONE.toast(`This document has ${W.pageCount} page${W.pageCount > 1 ? 's' : ''}.`); return false; } pg.scrollIntoView({ block:'start', behavior:'smooth' }); return; }
    const it = (pick._items || [])[+pick.value]; if (!it) return false; it[0].scrollIntoView({ block:'center', behavior:'smooth' }); if (it[0].tagName === 'IMG') W.selectImg(it[0]); else { const r = document.createRange(); r.selectNodeContents(it[0]); W.select(r); } } }] });
};

/* ---------- Icons ---------- */
const ICONS = ['lightbulb','eco','local_florist','favorite','star','check_circle','warning','info','schedule','event','location_on','call','mail','home','groups','person','school','savings','trending_up','bar_chart','task_alt','flag','bolt','verified','public','sunny','water_drop','potted_plant','handshake','emoji_events','rocket_launch','psychology'];
P.icons = a => { const g = el('div', { class:'symgrid', style:{ gridTemplateColumns:'repeat(8,36px)' } });
  ICONS.forEach(n => g.append(el('button', { title:n.replace(/_/g, ' '), 'aria-label':n.replace(/_/g, ' '), html:icon(n), onclick:() => { ONE.pop.close(); W.insertHTML(`<span class="ms-doc" contenteditable="false">${n}</span>&#8203;`); } })));
  ONE.pop.open(a, el('div', {}, el('div', { class:'menu-title', text:'Icons' }), g)); };

/* ---------- Compare with a version ---------- */
const words = s => s.match(/\S+|\n/g) || [];
function lcsDiff(a, b) {
  const n = a.length, m = b.length; if (n * m > 4e6) return null;
  const dp = Array.from({ length:n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push(['=', a[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]); }
  while (i < n) out.push(['-', a[i++]]); while (j < m) out.push(['+', b[j++]]);
  return out;
}
const textOf = html => { const d = document.createElement('div'); d.innerHTML = html; $$('p,h1,h2,h3,h4,li,blockquote,tr', d).forEach(b => b.append('\n')); return d.textContent.replace(/​/g, ''); };
W.compareDialog = () => {
  const vs = W.doc.versions; if (!vs.length) return ONE.toast('No saved versions yet. Save (Ctrl+S) to create one, then compare later.');
  const sel = ONE.select(vs.map((v, i) => [i, new Date(v.t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) + ' · ' + v.title]), 0);
  ONE.modal({ title:'Compare', icon:'compare', body:el('div', { class:'dlg-col' }, el('p', { text:'Compare the document as it is now with an earlier saved version.' }), ONE.field('Original version', sel)), actions:[{ label:'Cancel' }, { label:'Compare', kind:'filled', on:() => {
    const a = words(textOf(vs[+sel.value].html)), b = words(textOf(W.cleanHTML())), d = lcsDiff(a, b);
    if (!d) { ONE.toast('These documents are too long to compare word by word here.'); return false; }
    const ins = d.filter(x => x[0] === '+' && x[1] !== '\n').length, del = d.filter(x => x[0] === '-' && x[1] !== '\n').length;
    let html = ''; d.forEach(([k, w]) => { if (w === '\n') { if (k !== '-') html += '<br>'; return; } html += k === '=' ? esc(w) + ' ' : k === '+' ? `<ins class="cmp-ins">${esc(w)}</ins> ` : `<del class="cmp-del">${esc(w)}</del> `; });
    setTimeout(() => ONE.modal({ title:'Compared document', icon:'compare', width:720, body:el('div', { class:'dlg-col' }, el('p', { html:`<b style="color:#1e7c3a">${ins} words added</b> · <b style="color:#b3261e">${del} words removed</b>` }), el('div', { class:'cmp-view', html }))
      , actions:[{ label:'Close', kind:'filled' }] }), 60);
  } }] });
};

/* ---------- Immersive Reader (inside Read Mode) ---------- */
const rb = $('#readbar');
const ir = el('div', { class:'ir-tools' });
const irSel = (label, opts, cls) => { const s = el('select', { class:'combo', 'aria-label':label, title:label }); opts.forEach(([v, t]) => s.append(el('option', { value:v, text:t }))); s.onchange = () => { W.app.classList.remove(...opts.map(o => cls + o[0]).filter(Boolean)); if (s.value) W.app.classList.add(cls + s.value); focusBand(); }; return s; };
ir.append(irSel('Column width', [['', 'Medium column'], ['narrow', 'Narrow column'], ['wide', 'Wide column']], 'ir-col-'), irSel('Page color', [['', 'Default page'], ['sepia', 'Sepia'], ['night', 'Night']], 'ir-pg-'), irSel('Text spacing', [['', 'Normal spacing'], ['wide', 'Wide spacing']], 'ir-sp-'), irSel('Line focus', [['', 'No line focus'], ['1', 'Line focus: 1 line'], ['3', 'Line focus: 3 lines'], ['5', 'Line focus: 5 lines']], 'ir-lf-'));
rb.insertBefore(ir, rb.lastElementChild);
const band = el('div', { class:'lf-band', hidden:true }); document.body.append(band);
let lastY = innerHeight / 2;
function focusBand(){ const m = [...W.app.classList].find(c => c.startsWith('ir-lf-')); const on = m && W.app.classList.contains('readmode'); band.hidden = !on; if (!on) return; const lines = +m.slice(6), lh = 12.5 * 4 / 3 * 1.7 * 1.08; const h = lines * lh; band.style.setProperty('--h', h + 'px'); band.style.setProperty('--y', (lastY - h / 2) + 'px'); }
addEventListener('pointermove', e => { if (band.hidden) return; lastY = e.clientY; focusBand(); }, { passive:true });
new MutationObserver(focusBand).observe(W.app, { attributes:true, attributeFilter:['class'] });

/* ---------- Save real files ---------- */
const docCSS = 'body{font-family:Calibri,Carlito,sans-serif;font-size:11pt;line-height:1.3}h1,h2,h3{color:#2f5496;font-weight:normal}h1.title{font-size:28pt;color:#000}table{border-collapse:collapse}td,th{border:1px solid #000;padding:2pt 5pt}';
W.exportHTML = () => { const c = document.createElement('div'); c.innerHTML = W.cleanHTML(); $$('.toc a .dots', c).forEach(d => d.remove()); $$('[contenteditable]', c).forEach(x => x.removeAttribute('contenteditable')); $$('span.cmt', c).forEach(x => x.replaceWith(...x.childNodes)); $$('.ms-doc', c).forEach(x => x.remove()); return c.innerHTML; };
A.saveDocx = async () => {
  ONE.toast('Building .docx…');
  try { await ONE.loadScript('https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js');
    const L = W.doc.layout, [t, r, b, l] = L.m.map(v => Math.round(v * 15));
    const blob = window.htmlDocx.asBlob(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${docCSS}</style></head><body>${W.exportHTML()}</body></html>`, { orientation:L.orient, margins:{ top:t, right:r, bottom:b, left:l } });
    await ONE.download(($('#docTitle').value.trim() || 'Document') + '.docx', blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  } catch (e) { console.error(e); ONE.toast('Couldn’t build the .docx file. Check your connection and try again.'); }
};
A.saveHtml = () => ONE.download(($('#docTitle').value.trim() || 'Document') + '.html', `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc($('#docTitle').value)}</title><style>${docCSS};max-width:6.5in;margin:1in auto</style></head><body>\n${W.exportHTML()}\n</body></html>`, 'text/html');
/* real printing: one clipped clone per page so paper pages match the screen exactly */
A.print = () => {
  const sheet = W.sheet, [pw, ph] = W.dims(), S = ph + W.GAP, n = W.pageCount;
  const root = el('div', { id:'printRoot' }), st = el('style', { text:`@page{size:${pw}px ${ph}px;margin:0}` });
  for (let p = 0; p < n; p++) {
    const c = sheet.cloneNode(true); c.removeAttribute('id'); $$('[id]', c).forEach(x => x.removeAttribute('id')); $$('[contenteditable]', c).forEach(x => x.setAttribute('contenteditable', 'false')); $$('.imgsel,.lf-band', c).forEach(x => x.remove());
    c.style.cssText += `;animation:none;position:absolute;left:0;top:${-p * S}px;margin:0`;
    root.append(el('div', { class:'print-pg', style:{ width:pw + 'px', height:ph + 'px' } }, c));
  }
  document.head.append(st); document.body.append(root); document.body.classList.add('printing');
  const done = () => { root.remove(); st.remove(); document.body.classList.remove('printing'); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  ONE.backstage.close();
  setTimeout(() => { try { window.print(); } catch { ONE.toast('This page isn’t allowed to print here. Save a .docx and print it from your computer.'); } setTimeout(() => { if (document.body.classList.contains('printing') && !matchMedia('print').matches) done(); }, 1500); }, 150);
};
A.saveTxt = () => ONE.download(($('#docTitle').value.trim() || 'Document') + '.txt', E.innerText, 'text/plain');
})();
