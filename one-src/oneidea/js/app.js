/* oneIdea — navigation, ribbon, side panes, Immersive Reader, File backstage, shortcuts, boot */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
const P = PG, A = {}, POP = {};
ONE.boot('oi', 'idea');
const secEl = $('#sections'), pagesEl = $('#pages');

/* ---------- navigation ---------- */
const clone = x => JSON.parse(JSON.stringify(x));
const versionOf = p => ({ t:Date.now(), title:p.title, items:clone(p.items), ink:clone(p.ink), map:p.kind === 'map' ? clone(p.map) : undefined });
const snapshotIfChanged = () => {
  const p = N.page(); if (!p || !P.wasChanged()) return; P.syncAll();
  const last = p.versions[p.versions.length - 1];
  if (!last || Date.now() - last.t > 5 * 60000) { p.versions.push(versionOf(p)); if (p.versions.length > 15) p.versions.shift(); }
};
N.go = (s, p, opt = {}) => {
  snapshotIfChanged(); P.syncAll();
  N.nb.cur = { s:ONE.clamp(s, 0, N.nb.sections.length - 1), p:0 }; N.nb.cur.p = ONE.clamp(p, 0, N.section().pages.length - 1);
  renderNav(); P.render(); N.dirty(); if (opt.focusTitle) setTimeout(() => { if (N.page().kind === 'map') MM.focusRoot(); else $('#ptitle').focus(); }, 30);
  $('#canvaswrap').scrollTo(0, 0); if (innerWidth < 900) $('#app').classList.remove('nav-open');
};
N.goPage = pid => { const f = N.find(pid); if (f) N.go(f.si, f.pi); return f; };

function renderNav(){
  $('#nbName').textContent = N.nb.title; $('#nbDot').style.background = N.nb.color;
  secEl.innerHTML = '';
  N.nb.sections.forEach((s, i) => {
    const b = el('button', { class:'sec' + (i === N.nb.cur.s ? ' active' : ''), style:{ '--sc':s.color, animationDelay:i * 30 + 'ms' }, draggable:'true', 'data-i':i, title:s.name }, el('i'), el('span', { text:s.name }));
    b.onclick = () => N.go(i, 0); b.ondblclick = () => renameSection(i); b.oncontextmenu = e => { e.preventDefault(); sectionMenu(i, { x:e.clientX, y:e.clientY }); };
    dnd(b, 'sec', i); secEl.append(b);
  });
  secEl.append(el('button', { class:'addrow', html:`${icon('add')}<span>Add section</span>`, onclick:A.newSection }));
  renderPages();
}
function renderPages(){
  const s = N.section(); pagesEl.innerHTML = '';
  pagesEl.append(el('div', { class:'pages-head' }, el('b', { text:s.name, style:{ color:'var(--on-surface)' } }), el('button', { class:'icon-btn', title:'Sort pages', html:icon('sort'), onclick:e => ONE.menuAt(e.currentTarget, [{ label:'Sort by title', icon:'sort_by_alpha', on:() => sortPages('title') }, { label:'Sort by date created', icon:'event', on:() => sortPages('created') }, { label:'Sort by date modified', icon:'update', on:() => sortPages('updated') }]) })));
  s.pages.forEach((p, i) => {
    const b = el('button', { class:'pg lv' + (p.level || 0) + (i === N.nb.cur.p ? ' active' : ''), draggable:'true', 'data-i':i, style:{ animationDelay:i * 25 + 'ms' } },
      el('span', { class:'pg-t', html:(p.kind === 'map' ? icon('account_tree', 'pg-ic') : '') + esc(p.title || 'Untitled page') }), el('small', { text:new Date(p.updated).toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' · ' + N.preview(p) }));
    b.onclick = () => N.go(N.nb.cur.s, i); b.oncontextmenu = e => { e.preventDefault(); pageMenu(i, { x:e.clientX, y:e.clientY }); };
    dnd(b, 'pg', i); pagesEl.append(b);
  });
  pagesEl.append(el('button', { class:'addrow', html:`${icon('note_add')}<span>Add page</span>`, onclick:() => A.newPage() }), el('button', { class:'addrow', html:`${icon('account_tree')}<span>Add mind map</span>`, onclick:() => A.newPage('mindmap') }));
}
N.onTitle = () => { const n = pagesEl.querySelector(`.pg[data-i="${N.nb.cur.p}"] .pg-t`); if (n) n.innerHTML = (N.page().kind === 'map' ? icon('account_tree', 'pg-ic') : '') + esc(N.page().title || 'Untitled page'); };
let navT; N.onPageEdited = () => { clearTimeout(navT); navT = setTimeout(() => { const n = pagesEl.querySelector(`.pg[data-i="${N.nb.cur.p}"] small`); if (n) { const p = N.page(); n.textContent = new Date(p.updated).toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' · ' + N.preview(p); } }, 600); };

/* drag to reorder sections and pages (drop a page on a section to move it there) */
let dragging = null;
function dnd(node, kind, i){
  node.addEventListener('dragstart', e => { dragging = { kind, i }; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch {} node.classList.add('ghost'); });
  node.addEventListener('dragend', () => { dragging = null; $$('.ghost,.drop-before,.drop-after,.drop-into').forEach(x => x.classList.remove('ghost', 'drop-before', 'drop-after', 'drop-into')); });
  node.addEventListener('dragover', e => { if (!dragging) return; if (dragging.kind !== kind && !(dragging.kind === 'pg' && kind === 'sec')) return; e.preventDefault(); $$('.drop-before,.drop-after,.drop-into').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into')); if (dragging.kind === 'pg' && kind === 'sec') node.classList.add('drop-into'); else { const r = node.getBoundingClientRect(); node.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); } });
  node.addEventListener('drop', e => {
    if (!dragging) return; e.preventDefault(); P.syncAll(); const d = dragging; dragging = null;
    if (d.kind === 'pg' && kind === 'sec') { if (i === N.nb.cur.s) return; const [pg] = N.section().pages.splice(d.i, 1); pg.level = 0; if (!N.section().pages.length) N.section().pages.push(N.newPage()); N.nb.sections[i].pages.push(pg); N.go(i, N.nb.sections[i].pages.length - 1); ONE.toast(`Moved to ${N.nb.sections[i].name}.`); return; }
    const r = node.getBoundingClientRect(); let to = e.clientY < r.top + r.height / 2 ? i : i + 1; if (d.i < to) to--; if (to === d.i) return renderNav();
    if (kind === 'sec') { const cur = N.section(); const [x] = N.nb.sections.splice(d.i, 1); N.nb.sections.splice(to, 0, x); N.nb.cur.s = N.nb.sections.indexOf(cur); }
    else { const s = N.section(), cur = N.page(); const [x] = s.pages.splice(d.i, 1); s.pages.splice(to, 0, x); N.nb.cur.p = s.pages.indexOf(cur); }
    N.dirty(); renderNav();
  });
}
function sortPages(k){ const s = N.section(), cur = N.page(); s.pages.sort((a, b) => k === 'title' ? (a.title || '').localeCompare(b.title || '') : b[k] - a[k]); s.pages.forEach(p => p.level = 0); N.nb.cur.p = s.pages.indexOf(cur); N.dirty(); renderNav(); }

/* ---------- sections & pages ---------- */
A.newSection = () => { snapshotIfChanged(); const used = N.nb.sections.map(s => s.color); const s = N.newSection('New Section', N.SECTION_COLORS.find(c => !used.includes(c))); N.nb.sections.splice(N.nb.cur.s + 1, 0, s); N.go(N.nb.cur.s + 1, 0); setTimeout(() => renameSection(N.nb.cur.s), 60); };
function renameSection(i){
  const b = secEl.querySelector(`.sec[data-i="${i}"]`); if (!b) return; const s = N.nb.sections[i];
  const inp = el('input', { class:'sec-in', value:s.name, 'aria-label':'Section name' }); b.querySelector('span').replaceWith(inp); inp.focus(); inp.select();
  const done = ok => { if (ok && inp.value.trim()) { s.name = inp.value.trim(); N.dirty(); } renderNav(); P.status(); };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }; inp.onblur = () => done(true); inp.onclick = e => e.stopPropagation();
}
function sectionMenu(i, at){
  const s = N.nb.sections[i];
  ONE.menuAt(at, [{ label:'Rename', icon:'edit', on:() => renameSection(i) }, { label:'Section color', icon:'palette', on:() => ONE.menuAt(at, N.SECTION_COLORS.map(c => ({ html:`<span class="swatch" style="background:${c}"></span>`, label:c, checked:s.color === c, on:() => { s.color = c; N.dirty(); renderNav(); } }))) },
    { label:'New section', icon:'add', on:A.newSection }, '-', { label:'Move up', icon:'arrow_upward', disabled:i === 0, on:() => moveSec(i, -1) }, { label:'Move down', icon:'arrow_downward', disabled:i === N.nb.sections.length - 1, on:() => moveSec(i, 1) }, '-',
    { label:'Export section as Markdown', icon:'markdown', on:() => ONE.download(s.name + '.md', s.pages.map(toMarkdown).join('\n\n---\n\n'), 'text/markdown') },
    { label:'Delete section', icon:'delete', danger:true, on:() => deleteSection(i) }]);
}
function moveSec(i, d){ const cur = N.section(); const [x] = N.nb.sections.splice(i, 1); N.nb.sections.splice(i + d, 0, x); N.nb.cur.s = N.nb.sections.indexOf(cur); N.dirty(); renderNav(); }
function deleteSection(i){
  if (N.nb.sections.length === 1) return ONE.toast('A notebook needs at least one section.');
  const s = N.nb.sections[i];
  ONE.modal({ title:`Delete “${s.name}”?`, icon:'delete', body:`Its ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} will go to the Notebook Recycle Bin, where you can restore them.`, actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { P.syncAll(); s.pages.forEach(p => N.nb.bin.unshift({ page:p, sname:s.name, sid:s.id, t:Date.now() })); N.nb.sections.splice(i, 1); N.go(Math.min(N.nb.cur.s, N.nb.sections.length - 1), 0); refreshSide(); } }] });
}
A.newPage = (tpl = 'blank', sub = false) => {
  snapshotIfChanged(); P.syncAll(); const s = N.section(), p = N.TEMPLATES[tpl].make(); const at = N.nb.cur.p + 1;
  if (sub) p.level = Math.min(2, (N.page().level || 0) + 1); else { let j = at; while (j < s.pages.length && s.pages[j].level > (N.page().level || 0)) j++; s.pages.splice(j, 0, p); return N.go(N.nb.cur.s, j, { focusTitle:true }); }
  s.pages.splice(at, 0, p); N.go(N.nb.cur.s, at, { focusTitle:true });
};
function pageMenu(i, at){
  const s = N.section(), p = s.pages[i];
  ONE.menuAt(at, [{ label:'New page below', icon:'note_add', on:() => { N.go(N.nb.cur.s, i); A.newPage(); } }, { label:'New subpage', icon:'subdirectory_arrow_right', on:() => { N.go(N.nb.cur.s, i); A.newPage('blank', true); } }, '-',
    { label:'Make subpage', icon:'format_indent_increase', disabled:i === 0 || p.level >= 2, on:() => { p.level = Math.min(2, (p.level || 0) + 1); N.dirty(); renderNav(); } },
    { label:'Promote subpage', icon:'format_indent_decrease', disabled:!p.level, on:() => { p.level = Math.max(0, p.level - 1); N.dirty(); renderNav(); } }, '-',
    { label:'Duplicate', icon:'content_copy', on:() => { P.syncAll(); const c = JSON.parse(JSON.stringify(p)); c.id = ONE.uid(); c.title = (p.title || 'Untitled page') + ' (copy)'; c.created = c.updated = Date.now(); c.versions = []; s.pages.splice(i + 1, 0, c); N.go(N.nb.cur.s, i + 1); } },
    { label:'Move to section…', icon:'drive_file_move', on:() => ONE.menuAt(at, N.nb.sections.map((x, j) => ({ label:x.name, disabled:j === N.nb.cur.s, on:() => { P.syncAll(); s.pages.splice(i, 1); p.level = 0; if (!s.pages.length) s.pages.push(N.newPage()); x.pages.push(p); N.go(j, x.pages.length - 1); } }))) },
    { label:'Copy page text', icon:'content_paste', on:() => ONE.copyText(toMarkdown(p)) }, '-',
    { label:'Delete page', icon:'delete', danger:true, on:() => deletePage(i) }]);
}
function deletePage(i){
  P.syncAll(); const s = N.section(), p = s.pages[i];
  s.pages.splice(i, 1); N.nb.bin.unshift({ page:p, sname:s.name, sid:s.id, t:Date.now() }); if (!s.pages.length) s.pages.push(N.newPage());
  N.go(N.nb.cur.s, Math.min(i, s.pages.length - 1)); refreshSide();
  ONE.toast('Page moved to the Recycle Bin.', { action:'Undo', fn:() => restoreFromBin(p.id) });
}
function restoreFromBin(pid){ const k = N.nb.bin.findIndex(b => b.page.id === pid); if (k < 0) return; const [b] = N.nb.bin.splice(k, 1); let si = N.nb.sections.findIndex(s => s.id === b.sid); if (si < 0) { N.nb.sections.push(Object.assign(N.newSection(b.sname), { pages:[] })); si = N.nb.sections.length - 1; } N.nb.sections[si].pages.push(b.page); N.go(si, N.nb.sections[si].pages.length - 1); refreshSide(); }

/* ---------- notebook switcher ---------- */
$('#nbSwitch').onclick = e => {
  const docs = Object.entries(N.lib.docs).sort((a, b) => b[1].updated - a[1].updated);
  ONE.menuAt(e.currentTarget, [{ title:'Notebooks' }, ...docs.map(([id, m]) => ({ html:`<span class="swatch" style="background:${esc(m.color || '#7719aa')}"></span>${esc(m.title)}`, checked:id === N.nb.id, on:() => { if (id !== N.nb.id) openNotebook(store.get('oi-doc-' + id)); } })), '-',
    { label:'Rename notebook', icon:'edit', on:renameNotebook }, { label:'Notebook color', icon:'palette', on:() => ONE.menuAt(e.currentTarget, ['#7719aa', ...N.SECTION_COLORS].map(c => ({ html:`<span class="swatch" style="background:${c}"></span>${c}`, checked:N.nb.color === c, on:() => { N.nb.color = c; N.dirty(); renderNav(); } }))) },
    { label:'New notebook…', icon:'library_add', on:() => ONE.backstage.show('home') }]);
};
function renameNotebook(){ const i = ONE.input({ value:N.nb.title }); ONE.modal({ title:'Rename notebook', icon:'edit', body:ONE.field('Name', i), actions:[{ label:'Cancel' }, { label:'Rename', kind:'filled', on:() => { N.nb.title = i.value.trim() || 'Notebook'; N.save(); renderNav(); } }] }); }
const openNotebook = nb => { if (!nb) return ONE.toast('That notebook could not be found in this browser.'); snapshotIfChanged(); P.syncAll(); N.open(nb); N.save(); ONE.backstage.close(); refreshSide(); };

/* ---------- side panes: Find Tags, search, versions, recycle bin ---------- */
const side = $('#side'); let sideKind = null;
const showSide = (kind, title) => { sideKind = kind; side.hidden = false; $('#sideTitle').textContent = title; side.classList.remove('in'); void side.offsetWidth; side.classList.add('in'); refreshSide(); ONE.ribbon.refresh(); };
A.closeSide = () => { side.hidden = true; sideKind = null; P.highlight(''); ONE.ribbon.refresh(); };
$('#sideClose').onclick = A.closeSide;
let tagScope = 'notebook', hideDone = false, lastQuery = '';
function refreshSide(){
  if (side.hidden) return; const body = $('#sideBody'); body.innerHTML = '';
  if (sideKind === 'tags') {
    const seg = el('div', { class:'seg' }, ...[['notebook', 'Notebook'], ['section', 'This section'], ['page', 'This page']].map(([k, t]) => el('button', { class:'seg-b' + (tagScope === k ? ' on' : ''), text:t, onclick:() => { tagScope = k; refreshSide(); } })));
    const hd = ONE.check('Hide completed to-dos', hideDone, { onchange:e => { hideDone = e.target.checked; refreshSide(); } });
    body.append(seg, hd.wrap);
    P.syncAll(); const found = {};
    N.nb.sections.forEach((s, si) => { if (tagScope !== 'notebook' && si !== N.nb.cur.s) return; s.pages.forEach(p => { if (tagScope === 'page' && p !== N.page()) return;
      if (p.kind === 'map') p.map.nodes.forEach(n => { if (n.tag && P.TAGS[n.tag] && !(hideDone && n.done)) (found[n.tag] = found[n.tag] || []).push({ p, text:n.text || '(empty)', done:!!n.done, node:n.id }); });
      p.items.forEach(it => { const d = document.createElement('div'); d.innerHTML = it.html; d.querySelectorAll('[data-tag]').forEach(t => { if (hideDone && t.hasAttribute('data-done')) return; (found[t.dataset.tag] = found[t.dataset.tag] || []).push({ p, text:t.textContent.trim() || '(empty)', done:t.hasAttribute('data-done'), tid:t.dataset.tid }); }); }); }); });
    const keys = Object.keys(P.TAGS).filter(k => found[k]);
    if (!keys.length) body.append(el('p', { class:'home-empty', text:'No tags here yet. Put your cursor in a line and press Ctrl+1 for a to-do, Ctrl+2 for important…' }));
    keys.forEach(k => { const T = P.TAGS[k]; body.append(el('h4', { class:'side-h', html:`<span class="ms" style="color:${T.color}">${T.icon}</span>${esc(T.label)} <small>${found[k].length}</small>` }));
      found[k].forEach(f => body.append(el('button', { class:'side-item' + (f.done ? ' done' : ''), onclick:() => { if (N.page() !== f.p) N.goPage(f.p.id); setTimeout(() => f.node ? MM.focusNode(f.node) : P.flash(f.tid), 80); } }, el('span', { text:f.text }), el('small', { text:(f.node ? 'Mind map: ' : '') + (f.p.title || 'Untitled page') })))); });
  } else if (sideKind === 'search') {
    const inp = el('input', { class:'tf', placeholder:'Search this notebook', value:lastQuery, 'aria-label':'Search this notebook' }); const res = el('div');
    const run = () => { lastQuery = inp.value.trim(); res.innerHTML = ''; if (!lastQuery) { P.highlight(''); return; } P.syncAll(); const q = lastQuery.toLowerCase(); let n = 0;
      N.nb.sections.forEach(s => s.pages.forEach(p => { const t = N.pageText(p), i = t.toLowerCase().indexOf(q); if (i < 0) return; n++; const a = Math.max(0, i - 40); res.append(el('button', { class:'side-item', onclick:() => { N.goPage(p.id); setTimeout(() => P.highlight(lastQuery), 60); } }, el('span', { html:`<b>${esc(p.title || 'Untitled page')}</b>` }), el('small', { html:`${esc(s.name)} · ${a ? '…' : ''}${esc(t.slice(a, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length, i + q.length + 60))}` }))); }));
      res.prepend(el('p', { class:'muted', text:n ? `${n} page${n === 1 ? '' : 's'} found` : 'No matches.' })); P.highlight(lastQuery); };
    inp.oninput = run; inp.onkeydown = e => e.stopPropagation(); body.append(inp, res); run(); setTimeout(() => inp.focus(), 30);
  } else if (sideKind === 'versions') {
    const p = N.page(); body.append(el('p', { class:'muted', text:'A version is kept when you leave a page you changed (at most one every 5 minutes, the last 15).' }));
    if (!p.versions.length) body.append(el('p', { class:'home-empty', text:'No earlier versions of this page yet.' }));
    [...p.versions].reverse().forEach(v => body.append(el('div', { class:'side-item static' }, el('span', { html:`<b>${new Date(v.t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</b>` }), el('small', { text:(v.title || 'Untitled') + ' · ' + (v.map ? `Mind map, ${v.map.nodes.length} topics` : (N.text(v.items.map(i => i.html).join(' ')).slice(0, 80) || 'Empty')) }),
      el('div', { class:'bs-row' }, el('button', { class:'btn tonal', text:'Restore', onclick:() => { P.syncAll(); p.versions.push(versionOf(p)); p.title = v.title; p.items = clone(v.items); p.ink = clone(v.ink); if (v.map) p.map = clone(v.map); N.dirty(); P.render(); renderNav(); refreshSide(); ONE.toast('Version restored. The page as it was is kept as a version too.'); } })))));
  } else if (sideKind === 'bin') {
    body.append(el('p', { class:'muted', text:'Deleted pages stay here until you empty the bin.' }));
    if (!N.nb.bin.length) body.append(el('p', { class:'home-empty', text:'The Recycle Bin is empty.' }));
    N.nb.bin.forEach(b => body.append(el('div', { class:'side-item static' }, el('span', { html:`<b>${esc(b.page.title || 'Untitled page')}</b>` }), el('small', { text:`From ${b.sname} · deleted ${new Date(b.t).toLocaleDateString()}` }), el('div', { class:'bs-row' }, el('button', { class:'btn tonal', text:'Restore', onclick:() => restoreFromBin(b.page.id) })))));
    if (N.nb.bin.length) body.append(el('button', { class:'btn outlined', html:`${icon('delete_forever')}Empty Recycle Bin`, onclick:() => ONE.modal({ title:'Empty the Recycle Bin?', icon:'delete_forever', body:'These pages will be gone for good.', actions:[{ label:'Cancel' }, { label:'Empty', kind:'filled', on:() => { N.nb.bin = []; N.dirty(); refreshSide(); } }] }) }));
  }
}
N.refreshTagPane = () => { if (sideKind === 'tags') refreshSide(); };

/* ---------- Immersive Reader ---------- */
A.immersive = () => {
  P.syncAll(); const p = N.page();
  const items = [...p.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const ov = el('div', { class:'reader', tabindex:0 }), text = el('article', { class:'reader-text' });
  text.innerHTML = `<h1>${esc(p.title || 'Untitled page')}</h1>` + (p.kind === 'map' ? MM.outlineHTML(p) : items.map(i => i.html).join(''));
  text.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
  let size = 26, theme = 'paper', spacing = false, speaking = false;
  const apply = () => { text.style.fontSize = size + 'px'; ov.dataset.theme = theme; text.classList.toggle('wide', spacing); };
  const bar = el('div', { class:'reader-bar' },
    el('button', { class:'icon-btn', title:'Smaller text', html:icon('text_decrease'), onclick:() => { size = Math.max(16, size - 2); apply(); } }), el('button', { class:'icon-btn', title:'Larger text', html:icon('text_increase'), onclick:() => { size = Math.min(48, size + 2); apply(); } }),
    el('button', { class:'icon-btn', title:'Wider spacing', html:icon('format_letter_spacing_wide'), onclick:() => { spacing = !spacing; apply(); } }),
    ...['paper', 'sepia', 'night'].map(t => el('button', { class:'reader-sw ' + t, title:t[0].toUpperCase() + t.slice(1), onclick:() => { theme = t; apply(); } })),
    el('span', { class:'grow' }),
    'speechSynthesis' in window ? el('button', { class:'btn tonal', html:`${icon('volume_up')}Read aloud`, onclick:e => { if (speaking) { speechSynthesis.cancel(); speaking = false; e.currentTarget.innerHTML = `${icon('volume_up')}Read aloud`; return; } const u = new SpeechSynthesisUtterance(text.innerText); u.onend = () => { speaking = false; }; speechSynthesis.speak(u); speaking = true; e.currentTarget.innerHTML = `${icon('stop')}Stop`; } }) : null,
    el('button', { class:'icon-btn', title:'Close (Esc)', html:icon('close'), onclick:() => close() }));
  const close = () => { try { speechSynthesis.cancel(); } catch {} ov.classList.add('out'); setTimeout(() => ov.remove(), 200); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  ov.append(bar, el('div', { class:'reader-scroll' }, text)); document.body.append(ov); apply(); ov.focus();
};

/* ---------- audio, dictation, links, tables ---------- */
let rec = null;
A.record = async () => {
  if (rec) { rec.stop(); return; }
  if (!navigator.mediaDevices || !window.MediaRecorder) return ONE.toast('This browser can’t record audio.');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio:true }); } catch { return ONE.toast('Microphone access was blocked.'); }
  const chunks = [], t0 = Date.now(); rec = new MediaRecorder(stream);
  const pill = el('button', { class:'recpill', html:`<i></i>Recording 0:00 · Stop`, onclick:() => rec && rec.stop() }); document.body.append(pill);
  const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); pill.innerHTML = `<i></i>Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · Stop`; }, 500);
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = () => { clearInterval(tick); pill.remove(); stream.getTracks().forEach(t => t.stop()); rec = null; ONE.ribbon.refresh();
    const blob = new Blob(chunks, { type:chunks[0] && chunks[0].type || 'audio/webm' }); if (blob.size > 3 * 1048576) return ONE.toast('That recording is over 3 MB, too big to keep in this browser. Try a shorter one.');
    const r = new FileReader(); r.onload = () => { const s = P.freeSpot(); P.newContainerAt(s.x, s.y, `<p><b>Audio note</b> · ${new Date().toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })}</p><p><audio controls src="${r.result}"></audio></p>`, 360); }; r.readAsDataURL(blob); };
  rec.start(); ONE.ribbon.refresh();
};
let dict = null;
A.dictate = () => {
  if (dict) { dict.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return ONE.toast('Dictation isn’t available in this browser. Try Chrome or Edge.');
  if (!P.body()) { const s = P.freeSpot(); P.newContainerAt(s.x, s.y); }
  dict = new SR(); dict.continuous = true; dict.interimResults = false; dict.lang = navigator.language || 'en-US';
  dict.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) P.insertText(e.results[i][0].transcript.trim() + ' '); };
  dict.onend = () => { dict = null; ONE.ribbon.refresh(); ONE.toast('Dictation stopped.'); }; dict.onerror = e => { if (e.error === 'not-allowed') ONE.toast('Microphone access was blocked.'); };
  dict.start(); ONE.ribbon.refresh(); ONE.toast('Listening… speak and your words appear at the cursor.');
};
A.link = () => {
  const b = P.body(), sel = b ? String(getSelection()) : ''; const t = ONE.input({ value:sel, placeholder:'Text to show' }), u = ONE.input({ placeholder:'https://…' });
  ONE.modal({ title:'Link', icon:'link', body:el('div', { class:'dlg-col' }, ONE.field('Text to display', t), ONE.field('Address', u)), actions:[{ label:'Cancel' }, { label:'Insert', kind:'filled', on:() => { let href = u.value.trim(); if (!href) return false; if (!/^[a-z]+:/i.test(href)) href = 'https://' + href; if (/^(javascript|data|vbscript):/i.test(href)) { ONE.toast('That kind of link isn’t allowed.'); return false; } P.insertHTML(`<a href="${esc(href)}">${esc(t.value.trim() || href)}</a>&nbsp;`); } }] });
};
POP.table = a => { const d = el('div', { class:'tblpick' }), lab = el('div', { class:'menu-title', text:'Insert table' }), g = el('div', { class:'tgrid' }); d.append(lab, g);
  for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const cell = el('button', { 'data-r':r, 'data-c':c, 'aria-label':`${c} by ${r}` }); cell.onmouseenter = () => { lab.textContent = `${c} × ${r} table`; $$('button', g).forEach(x => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= c)); }; cell.onclick = () => { ONE.pop.close(); P.insertHTML(`<table>${Array.from({ length:r }, (_, i) => `<tr>${Array.from({ length:c }, () => i === 0 ? '<th><br></th>' : '<td><br></td>').join('')}</tr>`).join('')}</table><p><br></p>`); }; g.append(cell); }
  ONE.pop.open(a, d);
};
POP.tags = a => ONE.menuAt(a, [...Object.entries(P.TAGS).map(([k, t]) => ({ html:`<span class="ms" style="color:${t.color};font-variation-settings:'FILL' 1">${t.icon}</span>${esc(t.label)}`, kbd:t.kbd, on:() => P.tag(k) })), '-', { label:'Remove tag', icon:'label_off', kbd:'Ctrl+0', on:() => P.tag(null) }]);
POP.styles = a => ONE.menuAt(a, [['h1', 'Heading 1', 'Ctrl+Alt+1'], ['h2', 'Heading 2', 'Ctrl+Alt+2'], ['h3', 'Heading 3', 'Ctrl+Alt+3'], ['p', 'Normal', 'Ctrl+Shift+N'], ['blockquote', 'Quote'], ['pre', 'Code']].map(([t, n, k]) => ({ html:`<span class="stylep s-${t}">${n}</span>`, kbd:k, on:() => P.exec('formatBlock', t) })));
POP.fore = a => ONE.pop.open(a, ONE.colorGrid(c => P.exec('foreColor', c || '#000000'), { autoLabel:'Automatic' }));
POP.hilite = a => ONE.pop.open(a, ONE.colorGrid(c => P.exec('hiliteColor', c === 'none' || !c ? 'transparent' : c), { noneLabel:'No color' }));
POP.font = a => ONE.menuAt(a, [['', 'Google Sans (default)'], ['Georgia, serif', 'Georgia'], ['"EB Garamond", Garamond, serif', 'Garamond'], ['Calibri, Carlito, sans-serif', 'Calibri'], ['"Roboto Flex", sans-serif', 'Roboto'], ['"Courier New", monospace', 'Courier New'], ['Caveat, cursive', 'Caveat (handwriting)']].map(([f, n]) => ({ html:`<span style="font-family:${f || 'inherit'}">${n}</span>`, on:() => P.exec('fontName', f || 'Google Sans') })));
POP.size = a => ONE.menuAt(a, [[1, '9'], [2, '11 (default)'], [3, '13'], [4, '16'], [5, '20'], [6, '26'], [7, '36']].map(([v, n]) => ({ label:n, on:() => P.exec('fontSize', v) })));
POP.mmInsert = a => MM.insertMenu(a); POP.mmColor = a => MM.colorMenu(a); POP.mmMark = a => MM.markMenu(a); POP.mmLink = a => MM.linkMenu(a);
POP.pageColor = a => ONE.menuAt(a, N.PAGE_COLORS.map(([c, n]) => ({ html:`<span class="swatch" style="background:${c || 'var(--surface-lowest)'}"></span>${n}`, checked:(N.page().bg || null) === c, on:() => { N.page().bg = c; N.dirty(); P.render(false); } })));
POP.rules = a => ONE.menuAt(a, N.RULES.map(([k, n]) => ({ label:n, checked:(N.page().rules || 'none') === k, on:() => { N.page().rules = k; N.dirty(); P.render(false); } })));
POP.newPage = a => ONE.menuAt(a, [...Object.entries(N.TEMPLATES).map(([k, t]) => ({ label:t.name, icon:t.icon, on:() => A.newPage(k) })), '-', { label:'New subpage', icon:'subdirectory_arrow_right', kbd:'Ctrl+Alt+Shift+N', on:() => A.newPage('blank', true) }]);
POP.template = a => ONE.menuAt(a, Object.entries(N.TEMPLATES).filter(([k]) => k !== 'blank').map(([k, t]) => ({ label:t.name, icon:t.icon, sub:'Adds a new page', on:() => A.newPage(k) })));
const INK_COLORS = ['#1F1F1F', '#D93025', '#1A73E8', '#188038', '#7719AA', '#E37400'], HL_COLORS = ['#FFE14D', '#7CF08A', '#6FD3FF', '#FF8AD8', '#FFB74D'];
POP.penColor = a => ONE.menuAt(a, [{ title:'Pen' }, ...INK_COLORS.map(c => ({ html:`<span class="swatch round" style="background:${c}"></span>${c}`, checked:N.pen.c === c, on:() => { N.pen.c = c; P.setTool('pen'); penBar(); } })), { title:'Thickness' }, ...[[1.5, 'Fine'], [3, 'Medium'], [6, 'Thick'], [10, 'Marker']].map(([w, n]) => ({ label:n, checked:N.pen.w === w, on:() => { N.pen.w = w; P.setTool('pen'); } }))]);
POP.hlColor = a => ONE.menuAt(a, HL_COLORS.map(c => ({ html:`<span class="swatch" style="background:${c}"></span>${c}`, checked:N.hl.c === c, on:() => { N.hl.c = c; P.setTool('hl'); penBar(); } })));
const penBar = () => { const b = $('#barPen'), h = $('#barHl'); if (b) b.style.background = N.pen.c; if (h) h.style.background = N.hl.c; };

/* ---------- exports ---------- */
function toMarkdown(p){
  if (p.kind === 'map') return MM.toMarkdown(p);
  const conv = n => [...n.childNodes].map(c => { if (c.nodeType === 3) return c.textContent; if (c.nodeType !== 1) return ''; if (c.classList.contains('mmemb')) { const f = N.find(c.dataset.map); return f ? '\n' + MM.toMarkdown(f.p).replace(/^# /, '### Mind map: ') + '\n' : ''; } const t = c.tagName, inner = conv(c);
    const tag = c.dataset && c.dataset.tag ? (c.dataset.tag === 'todo' ? (c.hasAttribute('data-done') ? '- [x] ' : '- [ ] ') : `(${(P.TAGS[c.dataset.tag] || {}).label || c.dataset.tag}) `) : '';
    if (/^H[1-6]$/.test(t)) return '\n' + '#'.repeat(+t[1] + 1) + ' ' + inner.trim() + '\n'; if (t === 'P' || t === 'DIV') return '\n' + tag + inner.trim() + '\n';
    if (t === 'LI') return (c.parentElement.tagName === 'OL' ? '1. ' : '- ') + tag + inner.trim() + '\n'; if (t === 'UL' || t === 'OL') return '\n' + inner; if (t === 'B' || t === 'STRONG') return `**${inner}**`; if (t === 'I' || t === 'EM') return `*${inner}*`;
    if (t === 'A') return c.classList.contains('att') ? `[attachment: ${c.getAttribute('download')}]` : `[${inner}](${c.getAttribute('href')})`; if (t === 'IMG') return `![${c.alt || 'picture'}]()`; if (t === 'BR') return '\n'; if (t === 'PRE') return '\n```\n' + c.textContent + '\n```\n'; if (t === 'BLOCKQUOTE') return '\n> ' + inner.trim() + '\n';
    if (t === 'TABLE') { const rows = [...c.rows].map(r => '| ' + [...r.cells].map(x => x.textContent.trim()).join(' | ') + ' |'); if (rows.length) rows.splice(1, 0, '|' + ' --- |'.repeat(c.rows[0].cells.length)); return '\n' + rows.join('\n') + '\n'; }
    return inner; }).join('');
  return `# ${p.title || 'Untitled page'}\n\n` + [...p.items].sort((a, b) => a.y - b.y || a.x - b.x).map(i => { const d = document.createElement('div'); d.innerHTML = i.html; return conv(d).replace(/\n{3,}/g, '\n\n').trim(); }).join('\n\n') + '\n';
}
function pageHTML(p){
  if (p.kind === 'map') return MM.pageHTML(p);
  P.syncAll(); const css = `body{margin:0;font:15px/1.5 "Google Sans",Roboto,system-ui,sans-serif;color:#1f1f1f;background:${p.bg || '#fff'}}.pg{position:relative;min-height:100vh}.t{position:absolute;left:48px;top:28px;font-size:30px;font-weight:500}.d{position:absolute;left:48px;top:78px;color:#666;font-size:13px}.nc{position:absolute}img{max-width:100%;height:auto}.mmemb{margin:.4em 0}.mmemb img{border:1px solid #ddd;border-radius:8px}.mmemb-b{display:none}figcaption{color:#666;font-size:12px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px;min-width:60px}[data-tag]{position:relative;padding-left:26px}[data-tag]::before{position:absolute;left:0;font-family:"Material Symbols Rounded";font-size:20px;line-height:1.2}${Object.entries(P.TAGS).map(([k, t]) => `[data-tag="${k}"]::before{content:"${t.icon}";color:${t.color.startsWith('var') ? '#1a73e8' : t.color}}`).join('')}[data-tag="todo"][data-done]::before{content:"check_box"}[data-tag="todo"][data-done]{text-decoration:line-through;color:#777}[data-tag="remember"]{background:#fff3b0}svg path.hl{opacity:.4}`;
  const inkNode = $('#ink').cloneNode(true); inkNode.removeAttribute('id'); inkNode.setAttribute('style', 'position:absolute;left:0;top:0;pointer-events:none');
  const w = Math.max(900, ...p.items.map(i => i.x + i.w + 40)), h = Math.max(600, ...p.items.map(i => i.y + 400));
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title || 'Untitled page')}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400..700&family=Caveat:wght@500&family=EB+Garamond&display=swap"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0..1,0"><style>${css}</style></head><body><div class="pg" style="width:${w}px;height:${h}px"><div class="t">${esc(p.title || 'Untitled page')}</div><div class="d">${esc(new Date(p.created).toLocaleString())}</div>${p.items.map(i => `<div class="nc" style="left:${i.x}px;top:${i.y}px;width:${i.w}px">${i.html}</div>`).join('')}${p === N.page() ? inkNode.outerHTML : ''}</div></body></html>`;
}
A.printPage = () => {
  const f = el('iframe', { style:{ position:'fixed', right:0, bottom:0, width:0, height:0, border:0 } }); document.body.append(f);
  const d = f.contentDocument; d.open(); d.write(pageHTML(N.page()).replace('</style>', '@page{margin:.4in}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>')); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { ONE.toast('This page isn’t allowed to print here. Export the page as HTML and print that.'); } setTimeout(() => f.remove(), 3000); }, 900);
};
const safeName = s => (s || 'Untitled').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Untitled';

/* ---------- import ---------- */
const sanitize = html => { const d = new DOMParser().parseFromString(html, 'text/html'); d.querySelectorAll('script,style,iframe,object,embed,link,meta,form').forEach(x => x.remove()); d.querySelectorAll('*').forEach(x => [...x.attributes].forEach(a => { if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) x.removeAttribute(a.name); })); return d.body.innerHTML; };
const mdToHTML = md => { const lines = md.split(/\r?\n/); let out = '', list = null; const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[(.+?)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>'); const close = () => { if (list) { out += `</${list}>`; list = null; } };
  lines.forEach(l => { let m; if ((m = /^(#{1,3})\s+(.*)/.exec(l))) { close(); out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; } else if ((m = /^\s*[-*]\s+\[( |x)\]\s*(.*)/i.exec(l))) { close(); out += `<p data-tag="todo" data-tid="${ONE.uid()}"${m[1] !== ' ' ? ' data-done' : ''}>${inline(m[2])}</p>`; } else if ((m = /^\s*[-*]\s+(.*)/.exec(l))) { if (list !== 'ul') { close(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; } else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (list !== 'ol') { close(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; } else if (l.trim()) { close(); out += `<p>${inline(l)}</p>`; } }); close(); return out; };
$('#openInput').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = ''; let pages = 0;
  for (const f of files) {
    try {
      const txt = await f.text(), base = f.name.replace(/\.[^.]+$/, '');
      if (/\.(json|oneidea)$/i.test(f.name)) { const nb = JSON.parse(txt); if (!nb.sections) throw new Error('not a notebook'); nb.id = ONE.uid(); openNotebook(nb); ONE.toast(`Opened notebook “${nb.title}”.`); continue; }
      let html, title = base;
      if (/\.(md|markdown)$/i.test(f.name)) { const m = /^#\s+(.+)$/m.exec(txt); if (m) title = m[1]; html = mdToHTML(m ? txt.replace(m[0], '') : txt); }
      else if (/\.html?$/i.test(f.name)) { const d = new DOMParser().parseFromString(txt, 'text/html'); title = d.title || base; html = sanitize(d.body.innerHTML); }
      else html = txt.split(/\r?\n/).map(l => `<p>${esc(l) || '<br>'}</p>`).join('');
      const p = N.newPage(title, [N.item(48, 130, 680, html)]); N.section().pages.push(p); pages++;
    } catch (err) { console.error(err); ONE.toast(`Couldn’t open ${f.name}.`); }
  }
  if (pages) { N.go(N.nb.cur.s, N.section().pages.length - 1); ONE.backstage.close(); ONE.toast(`Added ${pages} page${pages === 1 ? '' : 's'} to ${N.section().name}.`); }
});

/* ---------- actions ---------- */
Object.assign(A, {
  save:() => ONE.toast(N.save() ? 'Saved to this browser.' : 'Couldn’t save: storage is full or blocked.'), backstage:() => ONE.backstage.show('home'), collapseRibbon:() => ONE.ribbon.setScale(ONE.ribbon.scale || 1, !document.querySelector('.app').classList.contains('ribbon-min')),
  seed:b => ONE.seedMenu(b), apps:b => ONE.appSwitcher(b), shortcuts:() => shortcuts(), undo:() => MM.active() ? MM.undo() : P.exec('undo'), redo:() => MM.active() ? MM.redo() : P.exec('redo'),
  flashcards:() => ST.open(), quiz:() => QZ.open(), hub:() => HUB.open(), focus:() => HUB.open('focus'), revSheet:() => HUB.open('print'), recall:() => ST.toggleRecall(), keyTerm:() => ST.keyTerm(), cardMark:() => ST.cardMark(), definition:() => P.tag('definition'), remember:() => P.tag('remember'),
  newMap:() => A.newPage('mindmap'), pageToMap:() => MM.fromPage(), mapOutline:() => MM.outlineDialog(),
  mmChild:() => MM.addChild(), mmSibling:() => MM.addSibling(), mmEdit:() => MM.editSel(), mmFold:() => MM.foldSel(), mmDelete:() => MM.deleteSel(), mmNote:() => MM.noteSel(), mmFit:() => MM.fit(), mmExpand:() => MM.expandAll(), mmCollapse:() => MM.collapseAll(), mmToNotes:() => MM.toNotes(),
  mmPng:() => MM.png(N.page()), mmSvg:() => ONE.download(safeName(N.page().title) + '.svg', MM.toSVG(N.page()), 'image/svg+xml'), mmMd:() => ONE.download(safeName(N.page().title) + '.md', MM.toMarkdown(N.page()), 'text/markdown'),
  cut:() => P.exec('cut') || ONE.toast('Use Ctrl+X.'), copy:() => { if (!document.execCommand('copy')) ONE.toast('Use Ctrl+C.'); }, pasteHint:() => ONE.toast('Press Ctrl+V to paste. Pictures and files can be pasted or dropped onto the page.'),
  bold:() => P.exec('bold'), italic:() => P.exec('italic'), underline:() => P.exec('underline'), strike:() => P.exec('strikeThrough'), sub:() => P.exec('subscript'), sup:() => P.exec('superscript'), clearFmt:() => P.exec('removeFormat'),
  bullets:() => P.exec('insertUnorderedList'), numbering:() => P.exec('insertOrderedList'), indent:() => P.exec('indent'), outdent:() => P.exec('outdent'), alignL:() => P.exec('justifyLeft'), alignC:() => P.exec('justifyCenter'), alignR:() => P.exec('justifyRight'),
  todo:() => P.tag('todo'), important:() => P.tag('important'), question:() => P.tag('question'),
  findTags:() => sideKind === 'tags' ? A.closeSide() : showSide('tags', 'Tags Summary'), search:() => showSide('search', 'Search'), versions:() => sideKind === 'versions' ? A.closeSide() : showSide('versions', 'Page Versions'), bin:() => sideKind === 'bin' ? A.closeSide() : showSide('bin', 'Recycle Bin'),
  newSub:() => A.newPage('blank', true), newSectionBtn:A.newSection, deletePage:() => deletePage(N.nb.cur.p),
  picture:() => $('#picInput').click(), file:() => $('#fileInput').click(), space:() => { const s = P.freeSpot(); P.newContainerAt(s.x, s.y); },
  date:() => P.insertText(new Date().toLocaleDateString()), time:() => P.insertText(new Date().toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' })), dateTime:() => P.insertText(new Date().toLocaleString(undefined, { dateStyle:'medium', timeStyle:'short' })),
  hr:() => P.insertHTML('<hr><p><br></p>'), symbol:b => ONE.menuAt(b, ['→','←','✓','✗','•','©','®','™','°','±','×','÷','≈','≠','≤','≥','∞','π','Σ','√','€','£','¥','§','¶','…','—','★','♥','☐'].map(s => ({ label:s, on:() => P.insertText(s) }))),
  typeTool:() => P.setTool('type'), penTool:() => P.setTool('pen'), hlTool:() => P.setTool('hl'), eraser:() => P.setTool('eraser'),
  clearInk:() => { const p = N.page(); if (!p.ink.length) return ONE.toast('There’s no ink on this page.'); const old = p.ink; p.ink = []; P.drawInk(); N.dirty(); ONE.toast('Ink cleared.', { action:'Undo', fn:() => { p.ink = old; P.drawInk(); N.dirty(); } }); },
  fullPage:() => { $('#app').classList.toggle('fullpage'); setTimeout(P.layoutSize, 350); ONE.ribbon.refresh(); }, toggleNav:() => { $('#app').classList.toggle(innerWidth < 900 ? 'nav-open' : 'nav-hidden'); setTimeout(P.layoutSize, 350); ONE.ribbon.refresh(); },
  darkPage:() => { $('#page').classList.toggle('darkpage'); store.set('oi-darkpage', $('#page').classList.contains('darkpage')); ONE.ribbon.refresh(); },
  zoomIn:() => P.setZoom(N.k + .1), zoomOut:() => P.setZoom(N.k - .1), zoom100:() => P.setZoom(1), pageWidth:() => { if (MM.active()) return MM.fit(); const p = N.page(); const w = Math.max(700, ...p.items.map(i => i.x + i.w + 60)); P.setZoom(($('#canvaswrap').clientWidth - 24) / w); },
  spell:() => { document.body.classList.toggle('nospell'); $$('.nc-body').forEach(b => b.spellcheck = !document.body.classList.contains('nospell')); ONE.ribbon.refresh(); },
  wordCount:() => { P.syncAll(); const p = N.page(), s = N.section(), wc = x => x.reduce((a, q) => a + N.words(q), 0); ONE.modal({ title:'Word count', icon:'numbers', body:`<div class="info"><span>This page</span><span>${N.words(p)}</span><span>This section</span><span>${wc(s.pages)}</span><span>Whole notebook</span><span>${N.nb.sections.reduce((a, x) => a + wc(x.pages), 0)}</span><span>Pages</span><span>${N.pageCount(N.nb)}</span></div>` }); },
  record:A.record, dictate:A.dictate, link:A.link, immersive:A.immersive, printPage:A.printPage
});
const STATES = { typeTool:() => N.tool === 'type', penTool:() => N.tool === 'pen', hlTool:() => N.tool === 'hl', eraser:() => N.tool === 'eraser', fullPage:() => $('#app').classList.contains('fullpage'), toggleNav:() => !$('#app').classList.contains('nav-hidden'),
  recall:() => N.recall, darkPage:() => $('#page').classList.contains('darkpage'), findTags:() => sideKind === 'tags', versions:() => sideKind === 'versions', bin:() => sideKind === 'bin', spell:() => !document.body.classList.contains('nospell'), record:() => !!rec, dictate:() => !!dict,
  bold:() => q('bold'), italic:() => q('italic'), underline:() => q('underline'), strike:() => q('strikeThrough') };
const q = c => { try { return !!P.body() && document.queryCommandState(c); } catch { return false; } };
N.onSel = () => { clearTimeout(N._st); N._st = setTimeout(() => ONE.ribbon.refresh(), 80); };

/* ---------- ribbon ---------- */
const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Clipboard', items:[['L','content_paste','Paste','pasteHint'], ['C', [['S','content_cut','Cut','cut',{ kbd:'Ctrl+X' }], ['S','content_copy','Copy','copy',{ kbd:'Ctrl+C' }]]]] },
    { label:'Basic Text', items:[['C', [
      ['R', [['ID','font_download','Font','pop:font'], ['ID','format_size','Font Size','pop:size'], ['I','format_list_bulleted','Bullets','bullets',{ kbd:'Ctrl+.' }], ['I','format_list_numbered','Numbering','numbering',{ kbd:'Ctrl+/' }], ['I','format_indent_decrease','Decrease Indent','outdent'], ['I','format_indent_increase','Increase Indent','indent']]],
      ['R', [['I','format_bold','Bold','bold',{ state:'bold', kbd:'Ctrl+B' }], ['I','format_italic','Italic','italic',{ state:'italic', kbd:'Ctrl+I' }], ['I','format_underlined','Underline','underline',{ state:'underline', kbd:'Ctrl+U' }], ['I','format_strikethrough','Strikethrough','strike',{ state:'strike', kbd:'Ctrl+-' }], ['I','subscript','Subscript','sub'], ['I','superscript','Superscript','sup'], ['ID','ink_highlighter','Highlight Color','pop:hilite'], ['ID','format_color_text','Font Color','pop:fore'], ['I','format_align_left','Align Left','alignL'], ['I','format_align_center','Center','alignC'], ['I','format_clear','Clear Formatting','clearFmt']]]]]] },
    { label:'Styles', items:[['LD','title','Styles','pop:styles']] },
    { label:'Tags', items:[['L','check_box','To Do','todo',{ kbd:'Ctrl+1' }], ['C', [['S','star','Important','important',{ kbd:'Ctrl+2' }], ['S','help','Question','question',{ kbd:'Ctrl+3' }], ['SD','sell','More Tags','pop:tags']]], ['L','label','Find Tags','findTags',{ state:'findTags' }]] },
    { label:'Voice', items:[['L','mic','Dictate','dictate',{ state:'dictate' }]] }
  ] },
  { id:'insert', label:'Insert', groups:[
    { label:'Insert', items:[['L','text_fields','Text box','space'], ['LD','table','Table','pop:table']] },
    { label:'Files', items:[['L','attach_file','File','file'], ['L','image','Pictures','picture']] },
    { label:'Links', items:[['L','link','Link','link',{ kbd:'Ctrl+K' }]] },
    { label:'Recording', items:[['L','graphic_eq','Audio','record',{ state:'record' }]] },
    { label:'Time Stamp', items:[['C', [['S','calendar_today','Date','date',{ kbd:'Alt+Shift+D' }], ['S','schedule','Time','time',{ kbd:'Alt+Shift+T' }], ['S','event','Date & Time','dateTime',{ kbd:'Alt+Shift+F' }]]]] },
    { label:'Mind map', items:[['LD','account_tree','Mind Map','pop:mmInsert']] },
    { label:'Pages', items:[['LD','dashboard_customize','Page Templates','pop:template']] },
    { label:'Symbols', items:[['C', [['SD','emoji_symbols','Symbol','symbol'], ['S','horizontal_rule','Divider','hr']]]] }
  ] },
  { id:'study', label:'Study', groups:[
    { label:'Flashcards', items:[['L','style','Flashcards','flashcards'], ['L','quiz','Quiz','quiz'], ['C', [['S','add_card','Make a card','cardMark'], ['S','menu_book','Definition','definition',{ kbd:'Ctrl+5' }]]]] },
    { label:'Remember', items:[['L','ink_highlighter','Key term','keyTerm',{ kbd:'Ctrl+Shift+H' }], ['L','bookmark','Must remember','remember',{ kbd:'Ctrl+4' }]] },
    { label:'Test yourself', items:[['L','visibility_off','Recall mode','recall',{ state:'recall' }]] },
    { label:'Exam prep', items:[['L','event_available','Study hub','hub'], ['L','timer','Focus timer','focus'], ['L','print','Revision sheet','revSheet']] },
    { label:'Mind maps', items:[['L','account_tree','New mind map','newMap'], ['C', [['S','schema','Map from this page','pageToMap'], ['S','segment','Build from outline','mapOutline'], ['SD','picture_in_picture','Put a map in a note','pop:mmInsert']]]] },
    { label:'Review', items:[['L','sell','Tags summary','findTags',{ state:'findTags' }]] }
  ] },
  { id:'draw', label:'Draw', groups:[
    { label:'Tools', items:[['L','text_fields','Type','typeTool',{ state:'typeTool' }], ['L','edit','Pen','penTool',{ state:'penTool', html:`<span class="ic-bar">${icon('edit')}<i id="barPen"></i></span>` }], ['ID','palette','Pen color & thickness','pop:penColor'], ['L','ink_highlighter','Highlighter','hlTool',{ state:'hlTool', html:`<span class="ic-bar">${icon('ink_highlighter')}<i id="barHl"></i></span>` }], ['ID','palette','Highlighter color','pop:hlColor'], ['L','ink_eraser','Eraser','eraser',{ state:'eraser' }]] },
    { label:'Edit', items:[['L','layers_clear','Clear Ink','clearInk']] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Views', items:[['L','fullscreen','Full Page View','fullPage',{ state:'fullPage', kbd:'F11' }], ['L','menu_open','Navigation','toggleNav',{ state:'toggleNav' }], ['L','chrome_reader_mode','Immersive Reader','immersive']] },
    { label:'Page Setup', items:[['LD','format_color_fill','Page Color','pop:pageColor'], ['LD','density_small','Rule Lines','pop:rules'], ['L','dark_mode','Dark Page','darkPage',{ state:'darkPage' }]] },
    { label:'Zoom', items:[['L','zoom_out','Zoom Out','zoomOut'], ['L','zoom_in','Zoom In','zoomIn'], ['C', [['S','crop_free','100%','zoom100'], ['S','fit_width','Page Width','pageWidth']]]] }
  ] },
  { id:'history', label:'History', groups:[
    { label:'Page', items:[['L','history','Page Versions','versions',{ state:'versions' }]] },
    { label:'Notebook', items:[['L','delete_sweep','Recycle Bin','bin',{ state:'bin' }]] }
  ] },
  { id:'review', label:'Review', groups:[
    { label:'Proofing', items:[['L','spellcheck','Spelling','spell',{ state:'spell' }], ['L','numbers','Word Count','wordCount']] },
    { label:'Search', items:[['L','manage_search','Search Notebook','search',{ kbd:'Ctrl+E' }]] }
  ] },
  { id:'mindmap', label:'Mind map', ctx:'map', groups:[
    { label:'Add', items:[['L','subdirectory_arrow_right','Sub-topic','mmChild',{ kbd:'Tab' }], ['L','playlist_add','Sibling','mmSibling',{ kbd:'Enter' }]] },
    { label:'Topic', items:[['L','edit','Edit text','mmEdit',{ kbd:'F2' }], ['LD','palette','Color','pop:mmColor'], ['LD','sell','Mark','pop:mmMark'], ['L','sticky_note_2','Note','mmNote'], ['LD','link','Link','pop:mmLink'], ['L','unfold_less','Fold','mmFold',{ kbd:'Space' }], ['L','delete','Delete','mmDelete',{ kbd:'Del' }]] },
    { label:'View', items:[['L','fit_screen','Fit','mmFit'], ['C', [['S','unfold_more','Unfold all','mmExpand'], ['S','unfold_less','Fold branches','mmCollapse']]]] },
    { label:'Convert', items:[['L','description','Map to notes','mmToNotes'], ['L','segment','From outline','mapOutline']] },
    { label:'Export', items:[['L','image','Picture','mmPng'], ['C', [['S','draw','SVG','mmSvg'], ['S','markdown','Outline','mmMd']]]] },
    { label:'Self-test', items:[['L','visibility_off','Recall mode','recall',{ state:'recall' }], ['L','style','Flashcards','flashcards'], ['L','quiz','Quiz','quiz']] }
  ] }
];
const run = (act, b, e) => { if (!act) return; if (act.startsWith('pop:')) { const p = POP[act.slice(4)]; return p ? p(b) : null; } const f = A[act]; if (f) f(b, e); else console.warn('Unknown action', act); };
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES }); penBar();
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return; if (b.closest('.titlebar,.status,.navfoot')) run(b.dataset.act, b, e); });
$('.qat').addEventListener('mousedown', e => e.preventDefault());
ONE.commandSearch($('#topSearch'), { run, docSearch:q2 => { lastQuery = q2; showSide('search', 'Search'); } });
$('#zoomRange').addEventListener('input', e => P.setZoom(e.target.value / 100));
$('#canvaswrap').addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); P.setZoom(N.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive:false });
$('#picInput').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) P.insertFiles(f); });
$('#fileInput').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) P.insertFiles(f); });

/* ---------- shortcuts ---------- */
function shortcuts(){
  const list = [['New page / subpage','Ctrl+N / Ctrl+Alt+Shift+N'],['New section','Ctrl+T'],['Search the notebook','Ctrl+E'],['To Do / Important / Question tag','Ctrl+1 / 2 / 3'],['Other tags','Ctrl+4 … Ctrl+7'],['Remove tag','Ctrl+0'],['Heading 1 / 2 / 3','Ctrl+Alt+1 / 2 / 3'],['Normal text','Ctrl+Shift+N'],['Bullets / Numbering','Ctrl+. / Ctrl+/'],['Strikethrough','Ctrl+-'],['Link','Ctrl+K'],['Insert date / time / both','Alt+Shift+D / T / F'],['Highlight a key term','Ctrl+Shift+H'],['Flashcard from a line','write Term :: meaning'],['Mind map: sub-topic / sibling','Tab / Enter'],['Quick math','type 12*4= then Space'],['Full page view','F11'],['Pen / Type','Ctrl+Shift+P / Esc'],['Zoom','Ctrl + wheel'],['Print page','Ctrl+P'],['Search commands','Alt+Q']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:560, body:`<div style="display:grid;grid-template-columns:1fr auto;gap:6px 18px;color:var(--on-surface)">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}
document.addEventListener('keydown', e => {
  if (ONE.topModal() || ONE.backstage.isOpen() || $('.reader') || $('.fc')) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); A.save(); } return; }
  if (MM.active() && MM.key(e)) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'F11') { e.preventDefault(); return A.fullPage(); }
  if (e.key === 'F1') { e.preventDefault(); return shortcuts(); }
  if (e.key === 'Escape' && N.tool !== 'type') return P.setTool('type');
  if (e.altKey && e.shiftKey && !mod && ['d', 't', 'f'].includes(k)) { e.preventDefault(); return ({ d:A.date, t:A.time, f:A.dateTime })[k](); }
  if (e.altKey && !mod && k === 'q') { e.preventDefault(); return $('#topSearch').focus(); }
  if (!mod) return;
  if (e.altKey && e.shiftKey && k === 'n') { e.preventDefault(); return A.newPage('blank', true); }
  if (e.altKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); return P.exec('formatBlock', 'h' + e.key); }
  if (e.shiftKey && k === 'n') { e.preventDefault(); return P.exec('formatBlock', 'p'); }
  if (e.shiftKey && k === 'p') { e.preventDefault(); return P.setTool('pen'); }
  if (e.shiftKey && k === 'h') { e.preventDefault(); return ST.keyTerm(); }
  const map = { s:A.save, n:() => A.newPage(), t:A.newSection, e:() => showSide('search', 'Search'), k:A.link, p:A.printPage, '.':A.bullets, '/':A.numbering, '-':A.strike, '0':() => P.tag(null) };
  const tagKeys = ['todo', 'important', 'question', 'remember', 'definition', 'idea', 'critical'];
  if (!e.altKey && /^[1-7]$/.test(e.key)) { e.preventDefault(); return P.tag(tagKeys[+e.key - 1]); }
  if (!e.altKey && !e.shiftKey && map[k]) { e.preventDefault(); map[k](); }
});
$('#page').addEventListener('contextmenu', e => {
  const nc = e.target.closest('.nc'); if (!nc) return; e.preventDefault(); const it = N.page().items.find(i => i.id === nc.dataset.id); if (!it) return;
  ONE.menuAt({ x:e.clientX, y:e.clientY }, [{ label:'Cut', icon:'content_cut', kbd:'Ctrl+X', on:A.cut }, { label:'Copy', icon:'content_copy', kbd:'Ctrl+C', on:A.copy }, '-', { label:'Tag ▸', icon:'sell', on:() => POP.tags({ x:e.clientX, y:e.clientY }) }, { label:'Link…', icon:'link', on:A.link }, '-',
    { label:'Duplicate note', icon:'control_point_duplicate', on:() => { P.syncAll(); const c = N.item(it.x + 24, it.y + 24, it.w, it.html); N.page().items.push(c); P.render(false); } },
    { label:'Delete note', icon:'delete', danger:true, on:() => { const p = N.page(), k = p.items.indexOf(it); p.items.splice(k, 1); P.render(false); N.dirty(); ONE.toast('Note deleted.', { action:'Undo', fn:() => { p.items.splice(k, 0, it); P.render(false); N.dirty(); } }); } }]);
});

/* ---------- backstage ---------- */
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
function recent(max, del, q2, where = 'open'){
  const list = el('div', { class:'list' }); const docs = Object.entries(N.lib.docs).filter(([, m]) => !q2 || m.title.toLowerCase().includes(q2.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) list.append(el('p', { class:'home-empty', text:q2 ? 'No notebooks match that search.' : 'No notebooks yet.' }));
  docs.forEach(([id, m]) => list.append(el('div', { class:'list-item' }, el('span', { class:'nbicon', style:{ background:m.color || '#7719aa' }, html:icon('book_2') }), el('span', { class:'grow', html:`<b>${esc(m.title)}${id === N.nb.id ? ' <small>· open now</small>' : ''}</b><small>${fmtDate(m.updated)} · ${m.sections} section${m.sections === 1 ? '' : 's'} · ${m.pages} page${m.pages === 1 ? '' : 's'}</small>` }),
    el('button', { class:'btn text', text:'Open', onclick:() => openNotebook(store.get('oi-doc-' + id)) }),
    del && id !== N.nb.id ? el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => ONE.modal({ title:`Delete “${m.title}”?`, body:'The whole notebook will be removed from this browser. This can’t be undone.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('oi-doc-' + id); delete N.lib.docs[id]; store.set('oi-lib', N.lib); ONE.backstage.show(where); } }] }) }) : null)));
  return list;
}
ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => { const hr = new Date().getHours(), search = el('input', { placeholder:'Search your notebooks', 'aria-label':'Search your notebooks' });
    b.append(el('div', { class:'home-hero' }, el('h1', { text:hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }), el('label', { class:'home-search', html:icon('search') }, search)), el('h3', { text:'Start a notebook' }));
    const g = el('div', { class:'tpl' }); Object.entries(N.NOTEBOOK_TEMPLATES).forEach(([k, t]) => g.append(el('button', { class:'tpl-card', onclick:() => openNotebook(t.make()) }, el('div', { class:'thumb nbthumb', html:`<span class="nbcover">${icon(t.icon)}</span>` }), el('span', { html:`${esc(t.name)}<small><br>${esc(t.desc)}</small>` }))));
    const holder = el('div'); b.append(g, el('h3', { text:'Your notebooks' }), holder); const draw = () => { holder.innerHTML = ''; holder.append(recent(200, true, search.value, 'home')); }; search.oninput = draw; draw(); } },
  { id:'open', label:'Open', icon:'folder_open', render:b => b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })), el('p', { class:'bs-note', text:'Opens oneIdea notebooks (.json). Markdown, text and web pages (.md, .txt, .html) are added as new pages in the current section.' }), el('h3', { text:'Notebooks in this browser' }), recent(50, true)) },
  { id:'info', label:'Info', icon:'info', render:b => { P.syncAll(); const words = N.nb.sections.reduce((a, s) => a + s.pages.reduce((x, p) => x + N.words(p), 0), 0), tags = N.nb.sections.reduce((a, s) => a + s.pages.reduce((x, p) => x + (p.items.map(i => i.html).join('').match(/data-tag=/g) || []).length, 0), 0);
    const size = (() => { try { return JSON.stringify(N.nb).length; } catch { return 0; } })();
    b.append(el('h1', { text:'Info' }), el('div', { class:'info', html:`<span>Notebook</span><span>${esc(N.nb.title)}</span><span>Sections</span><span>${N.nb.sections.length}</span><span>Pages</span><span>${N.pageCount(N.nb)}</span><span>Words</span><span>${words}</span><span>Tags</span><span>${tags}</span><span>In the Recycle Bin</span><span>${N.nb.bin.length} pages</span><span>Size</span><span>${(size / 1048576).toFixed(2)} MB of about 5 MB this browser allows</span><span>Last saved</span><span>${fmtDate(N.nb.updated)}</span>` }), el('div', { class:'bs-row', style:{ marginTop:'18px' } }, el('button', { class:'btn outlined', html:`${icon('edit')}Rename notebook`, onclick:() => { ONE.backstage.close(); renameNotebook(); } }))); } },
  { id:'print', label:'Print', icon:'print', render:b => b.append(el('h1', { text:'Print' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('print')}Print this page`, onclick:() => { ONE.backstage.close(); A.printPage(); } })), el('p', { class:'bs-note', text:'Prints the current page with its notes and ink. Choose “Save as PDF” in the dialog to make a PDF.' })) },
  { id:'export', label:'Export', icon:'ios_share', render:b => { const p = N.page();
    b.append(el('h1', { text:'Export' }), el('h3', { text:'This page' }), el('div', { class:'list' }, ...[...(p.kind === 'map' ? [['Picture (.png)', 'The whole mind map as an image.', 'image', () => MM.png(p)], ['Vector picture (.svg)', 'Sharp at any size.', 'draw', () => ONE.download(safeName(p.title) + '.svg', MM.toSVG(p), 'image/svg+xml')]] : []), ['Web page (.html)', 'Keeps the layout, pictures, tags and ink.', 'code', () => ONE.download(safeName(p.title) + '.html', pageHTML(p), 'text/html')], ['Markdown (.md)', 'Text, headings, lists, tables and to-dos.', 'markdown', () => ONE.download(safeName(p.title) + '.md', toMarkdown(p), 'text/markdown')], ['Plain text (.txt)', 'Just the words.', 'notes', () => ONE.download(safeName(p.title) + '.txt', N.pageText(p), 'text/plain')]].map(row)),
      el('h3', { text:'Whole notebook' }), el('div', { class:'list' }, ...[['oneIdea notebook (.json)', 'Everything, to reopen here or in another browser with File › Open.', 'data_object', () => { P.syncAll(); ONE.download(safeName(N.nb.title) + '.json', JSON.stringify(N.nb), 'application/json'); }], ['Markdown (.md)', 'Every page, one after another.', 'markdown', () => { P.syncAll(); ONE.download(safeName(N.nb.title) + '.md', N.nb.sections.map(s => `# ${s.name}\n\n` + s.pages.map(x => toMarkdown(x).replace(/^# /, '## ')).join('\n')).join('\n\n'), 'text/markdown'); }]].map(row)));
    function row([t, d, ic, fn]){ return el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn filled', text:'Save', onclick:fn })); } } },
  '-',
  { id:'close', label:'Close', icon:'close', render:() => { N.save(); ONE.backstage.show('home'); } }
]);

/* ---------- boot ---------- */
N.hooks.push(renderNav, () => P.render());
if (store.get('oi-darkpage')) $('#page').classList.add('darkpage');
const first = N.lib.current && store.get('oi-doc-' + N.lib.current);
const pendId = ONE.pendingOpen(), pend = pendId && store.get('oi-doc-' + pendId);
N.open(pend || first || N.NOTEBOOK_TEMPLATES.blank.make());
P.setZoom(1);
if (!pend) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => openNotebook(store.get('oi-doc-' + id));
ONE.onNewRequest = k => openNotebook((N.NOTEBOOK_TEMPLATES[k] || N.NOTEBOOK_TEMPLATES.blank).make());
addEventListener('beforeunload', () => { P.syncAll(); snapshotIfChanged(); N.save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { P.syncAll(); N.save(); } });
if (document.fonts) document.fonts.ready.then(() => P.layoutSize());
})();
