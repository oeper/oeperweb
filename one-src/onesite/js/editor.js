/* oneSite — the editor: live canvas (the real site in an iframe), click-to-type text, the section toolbar,
   the Pages/Sections panel, the inspector, and the section library with live previews. */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const E = window.ED = { sel:null, device:'desktop', outlines:true };
const frame = $('#frame'), wrap = $('#canvas'), left = $('#left'), right = $('#right');
const DEVICES = { desktop:{ w:1280, label:'Desktop', icon:'desktop_windows' }, tablet:{ w:820, label:'Tablet', icon:'tablet_mac' }, phone:{ w:390, label:'Phone', icon:'smartphone' } };
const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
const set = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); const t = ks.reduce((a, k) => a[k] == null ? (a[k] = /^\d+$/.test(k) ? [] : {}) : a[k], o); t[last] = v; };
const fd = () => frame.contentDocument;

/* ---------- canvas ---------- */
const EDIT_CSS = `
[data-block]{position:relative;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s}
body.outlines [data-block]:hover{outline-color:rgba(66,133,244,.45)}
[data-block].sel{outline-color:#4285f4!important}
[data-k]{cursor:text;border-radius:4px;transition:box-shadow .15s}
[data-k]:hover{box-shadow:0 0 0 2px rgba(66,133,244,.35)}
[data-k][contenteditable]{outline:none;box-shadow:0 0 0 2px #4285f4;cursor:text}
[data-img]{cursor:pointer}[data-img]:hover{outline:3px solid rgba(66,133,244,.6);outline-offset:-3px}
.ed-bar{position:absolute;z-index:1000;display:flex;align-items:center;gap:2px;padding:4px;border-radius:12px;background:#1f2937;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);font:500 12px system-ui,sans-serif}
.ed-bar b{padding:0 8px 0 6px;font-weight:600;white-space:nowrap}
.ed-bar button{all:unset;cursor:pointer;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-family:'Material Symbols Rounded';font-size:18px}
.ed-bar button:hover{background:rgba(255,255,255,.15)}.ed-bar button[disabled]{opacity:.35;pointer-events:none}
.ed-add{position:absolute;z-index:999;left:50%;transform:translate(-50%,-50%);cursor:pointer;border:0;border-radius:999px;background:#4285f4;color:#fff;font:600 12px system-ui,sans-serif;padding:6px 14px 6px 10px;box-shadow:0 4px 14px rgba(66,133,244,.45);display:flex;gap:4px;align-items:center;opacity:0;transition:opacity .15s;pointer-events:none}
.ed-add span{font-family:'Material Symbols Rounded';font-size:16px}
.ed-add.on{opacity:1;pointer-events:auto}
.ed-empty{padding:80px 20px;text-align:center;color:#888;font:500 16px system-ui,sans-serif}
`;
function docFor() {
  const html = SITE.doc(M.site, M.page(), 'edit').replace('<body class="anim">', `<body class="${E.outlines ? 'outlines' : ''}">`).replace('<body class="">', `<body class="${E.outlines ? 'outlines' : ''}">`);
  return html.replace('</head>', `<style>${EDIT_CSS}</style></head>`).replace(/<script>[\s\S]*?<\/script>\s*<\/body>/, '</body>');
}
let keepScroll = 0;
E.render = () => { try { keepScroll = frame.contentWindow.scrollY || 0; } catch {} frame.srcdoc = docFor(); };
frame.addEventListener('load', () => {
  const d = fd(); if (!d || !d.body) return;
  if (!M.page().sections.length) d.querySelector('main').innerHTML = '<div class="ed-empty">This page is empty. Use <b>Add section</b> to start.</div>';
  frame.contentWindow.scrollTo(0, keepScroll);
  hookCanvas(d); E.showSel(); E.fit();
});
// Re-render just one section in place (no flicker, keeps scroll).
E.renderBlock = id => {
  const d = fd(), f = M.find(id); if (!d || !f) return E.render();
  const old = d.querySelector(`[data-block="${id}"]`); if (!old) return E.render();
  const t = d.createElement('template'); t.innerHTML = SITE.section(f.b, SITE.ctx(M.site, M.page(), 'edit')); const nu = t.content.firstElementChild;
  if (!nu) return E.render();
  if (id === E.sel) nu.classList.add('sel');
  old.replaceWith(nu); E.showSel();
};
E.fit = () => {
  const dv = DEVICES[E.device], W = wrap.clientWidth - 24, H = wrap.clientHeight - 24;
  const w = E.device === 'desktop' ? Math.max(1024, Math.min(1440, W)) : dv.w, k = Math.min(1, W / w);
  frame.style.width = w + 'px'; frame.style.height = (H / k) + 'px'; frame.style.transform = `scale(${k})`;
  $('#frameBox').style.width = w * k + 'px'; $('#frameBox').style.height = H + 'px';
  $('#zoomInfo').textContent = `${dv.label} · ${w}px${k < 1 ? ` · ${Math.round(k * 100)}%` : ''}`;
};
new ResizeObserver(() => E.fit()).observe(wrap);
E.setDevice = d => { E.device = d; E.fit(); ONE.ribbon.refresh(); $$('.dev button').forEach(b => b.classList.toggle('on', b.dataset.dev === d)); };

/* ---------- canvas events (delegated inside the iframe) ---------- */
let editing = null, typingT;
function hookCanvas(d) {
  const bar = d.createElement('div'); bar.className = 'ed-bar'; bar.hidden = true; d.body.append(bar);
  const add = d.createElement('button'); add.className = 'ed-add'; add.innerHTML = '<span>add</span>Add section'; d.body.append(add);
  let addAfter = null;
  d.addEventListener('click', e => {
    const a = e.target.closest('a'); if (a && !a.matches('[contenteditable]')) e.preventDefault();
    if (e.target.closest('.ed-bar,.ed-add')) return;
    const k = e.target.closest('[data-k]'), im = e.target.closest('[data-img]'), blk = e.target.closest('[data-block]');
    if (blk) E.select(blk.dataset.block, false);
    if (im && blk) { e.preventDefault(); E.pickImage(blk.dataset.block, im.dataset.img); return; }
    if (k && blk) startEdit(k, blk.dataset.block);
  });
  d.addEventListener('submit', e => e.preventDefault());
  d.addEventListener('mouseover', e => {
    const blk = e.target.closest('[data-block]'); if (!blk || e.target.closest('.ed-add')) return;
    const f = M.find(blk.dataset.block); if (!f || f.b === M.site.header) { add.classList.remove('on'); return; }
    addAfter = f.b === M.site.footer ? null : blk.dataset.block;
    const r = blk.getBoundingClientRect(), y = f.b === M.site.footer ? r.top : r.bottom;
    add.style.top = (y + frame.contentWindow.scrollY) + 'px'; add.classList.add('on');
  });
  d.addEventListener('mouseleave', () => add.classList.remove('on'));
  add.addEventListener('click', e => { e.stopPropagation(); E.openLibrary(addAfter); });
  bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); E.act(b.dataset.a); });
  d.addEventListener('keydown', e => {
    if (!editing) return keyShortcuts(e);
    if (e.key === 'Escape') { e.preventDefault(); stopEdit(); }
    if (e.key === 'Enter' && !e.shiftKey && editing.single) { e.preventDefault(); stopEdit(); }
  });
  d.addEventListener('paste', e => { if (!editing) return; e.preventDefault(); const t = (e.clipboardData.getData('text/plain') || '').replace(/\r/g, ''); d.execCommand('insertText', false, editing.single ? t.replace(/\n+/g, ' ') : t); });
  E._bar = bar;
}
function startEdit(node, id) {
  if (editing && editing.node === node) return;
  stopEdit();
  const f = M.find(id); if (!f) return;
  const path = node.dataset.k;
  // body text, answers, quotes, feature lists and addresses can have several lines; everything else is one line (Enter = done)
  editing = { node, id, path, single:!/(^|\.)(text|a|quote|features|address)$/.test(path) };
  node.setAttribute('contenteditable', 'plaintext-only'); if (node.contentEditable !== 'plaintext-only') node.setAttribute('contenteditable', 'true');
  node.focus();
  const r = fd().createRange(); r.selectNodeContents(node); r.collapse(false); const s = frame.contentWindow.getSelection(); s.removeAllRanges(); s.addRange(r);
  node.addEventListener('input', onType);
  node.addEventListener('blur', stopEdit, { once:true });
}
function onType() {
  if (!editing) return; const f = M.find(editing.id); if (!f) return;
  set(f.b.data, editing.path, editing.node.innerText.replace(/\n$/, ''));
  if (editing.path === 'logo' && f.b === M.site.header) { $('#docTitle').value = editing.node.innerText; }
  M.dirty(); clearTimeout(typingT); typingT = setTimeout(() => { M.record(); E.fillInspector(true); }, 500);
}
function stopEdit() {
  if (!editing) return; const { node } = editing; editing = null;
  node.removeAttribute('contenteditable'); node.removeEventListener('input', onType);
  clearTimeout(typingT); M.record(); E.fillInspector(true);
}

/* ---------- selection ---------- */
E.select = (id, scroll = true) => {
  E.sel = id; E.showSel();
  if (scroll) { const n = fd() && fd().querySelector(`[data-block="${id}"]`); if (n) n.scrollIntoView({ behavior:'smooth', block:'start' }); }
  E.fillInspector(); E.fillOutline(); ONE.ribbon.refresh();
  if (innerWidth < 900 && id) document.getElementById('app').classList.add('show-right');
};
E.showSel = () => {
  const d = fd(); if (!d || !d.body) return;
  $$('[data-block].sel', d).forEach(n => n.classList.remove('sel'));
  const bar = E._bar; if (!bar) return;
  const n = E.sel && d.querySelector(`[data-block="${E.sel}"]`); if (!n) { bar.hidden = true; return; }
  n.classList.add('sel');
  const f = M.find(E.sel), def = BLOCKS[f.b.type], glob = !f.list;
  bar.innerHTML = `<b>${esc(def.name)}</b>` + (glob ? '' : `<button data-a="up" title="Move up" ${f.i === 0 ? 'disabled' : ''}>arrow_upward</button><button data-a="down" title="Move down" ${f.i === f.list.length - 1 ? 'disabled' : ''}>arrow_downward</button><button data-a="dup" title="Duplicate">content_copy</button>`) + `<button data-a="settings" title="Section settings">tune</button>` + (glob ? '' : `<button data-a="del" title="Delete">delete</button>`);
  const r = n.getBoundingClientRect(), sy = frame.contentWindow.scrollY;
  bar.hidden = false; bar.style.top = Math.max(sy + 8, r.top + sy + 10) + 'px'; bar.style.right = '12px';
};
E.act = a => {
  const f = E.sel && M.find(E.sel); if (!f) return;
  if (a === 'settings') { document.getElementById('app').classList.add('show-right'); return; }
  if (!f.list) return;
  if (a === 'up' || a === 'down') { const j = f.i + (a === 'up' ? -1 : 1); if (j < 0 || j >= f.list.length) return; f.list.splice(j, 0, f.list.splice(f.i, 1)[0]); M.changed(true, 'all'); }
  if (a === 'dup') { const c = JSON.parse(JSON.stringify(f.b)); c.id = ONE.uid(); f.list.splice(f.i + 1, 0, c); E.sel = c.id; M.changed(true, 'all'); }
  if (a === 'del') { const gone = f.list.splice(f.i, 1)[0]; E.sel = null; M.changed(true, 'all'); ONE.toast(`${BLOCKS[gone.type].name} deleted.`, { action:'Undo', fn:() => M.go(-1) }); }
};

/* ---------- the Pages / Sections panel ---------- */
E.fillOutline = () => {
  const pages = $('#pages'), secs = $('#sections'); pages.innerHTML = ''; secs.innerHTML = '';
  M.site.pages.forEach((p, i) => {
    const b = el('button', { class:'prow' + (i === M.pi ? ' on' : ''), title:i === 0 ? 'Home page' : p.name }, el('span', { class:'ms', text:i === 0 ? 'home' : 'description' }), el('span', { class:'grow', text:p.name }));
    b.onclick = () => { if (M.pi !== i) { M.pi = i; E.sel = null; M.changed(false, 'all'); } };
    b.ondblclick = () => E.renamePage(i);
    b.oncontextmenu = e => { e.preventDefault(); E.pageMenu(i, { x:e.clientX, y:e.clientY }); };
    pages.append(b);
  });
  const row = (b, label, fixed) => {
    const def = BLOCKS[b.type], r = el('button', { class:'srow' + (b.id === E.sel ? ' on' : '') + (fixed ? ' fixed' : ''), draggable:fixed ? 'false' : 'true', 'data-id':b.id },
      el('span', { class:'ms', text:def.icon }), el('span', { class:'grow', html:`${esc(label || def.name)}<small>${esc(def.variants[b.v] || '')}</small>` }));
    r.onclick = () => E.select(b.id);
    if (!fixed) dnd(r, b.id);
    secs.append(r);
  };
  row(M.site.header, 'Header', true);
  M.page().sections.forEach(b => row(b));
  row(M.site.footer, 'Footer', true);
  secs.append(el('button', { class:'addrow', html:`${icon('add')}<span>Add section</span>`, onclick:() => E.openLibrary(E.sel && M.find(E.sel) && M.find(E.sel).list ? E.sel : null) }));
};
let dragId = null;
function dnd(node, id) {
  node.addEventListener('dragstart', e => { dragId = id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch {} node.classList.add('ghost'); });
  node.addEventListener('dragend', () => { dragId = null; $$('.ghost,.drop-b,.drop-a').forEach(x => x.classList.remove('ghost', 'drop-b', 'drop-a')); });
  node.addEventListener('dragover', e => { if (!dragId || dragId === id) return; e.preventDefault(); const r = node.getBoundingClientRect(); $$('.drop-b,.drop-a').forEach(x => x.classList.remove('drop-b', 'drop-a')); node.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-b' : 'drop-a'); });
  node.addEventListener('drop', e => {
    if (!dragId) return; e.preventDefault(); const list = M.page().sections, from = list.findIndex(b => b.id === dragId); if (from < 0) return;
    const r = node.getBoundingClientRect(); const moved = list.splice(from, 1)[0]; let to = list.findIndex(b => b.id === id); if (e.clientY >= r.top + r.height / 2) to++;
    list.splice(to, 0, moved); M.changed(true, 'all');
  });
}
E.renamePage = i => { const p = M.site.pages[i], inp = ONE.input({ value:p.name }); ONE.modal({ title:'Rename page', icon:'edit', body:ONE.field('Page name (shown in the menu)', inp), actions:[{ label:'Cancel' }, { label:'Rename', kind:'filled', on:() => { p.name = inp.value.trim() || p.name; M.changed(true, 'all'); } }] }); };
E.pageMenu = (i, at) => ONE.menuAt(at, [
  { label:'Rename', icon:'edit', on:() => E.renamePage(i) },
  { label:'Duplicate', icon:'content_copy', on:() => { const c = JSON.parse(JSON.stringify(M.site.pages[i])); c.id = ONE.uid(); c.name += ' copy'; c.sections.forEach(b => b.id = ONE.uid()); M.site.pages.splice(i + 1, 0, c); M.pi = i + 1; M.changed(true, 'all'); } },
  { label:'Make it the home page', icon:'home', disabled:i === 0, on:() => { M.site.pages.unshift(M.site.pages.splice(i, 1)[0]); M.pi = 0; M.changed(true, 'all'); } },
  '-', { label:'Move up', icon:'arrow_upward', disabled:i <= 1, on:() => { const P = M.site.pages; P.splice(i - 1, 0, P.splice(i, 1)[0]); M.pi = i - 1; M.changed(true, 'all'); } },
  { label:'Move down', icon:'arrow_downward', disabled:i === 0 || i === M.site.pages.length - 1, on:() => { const P = M.site.pages; P.splice(i + 1, 0, P.splice(i, 1)[0]); M.pi = i + 1; M.changed(true, 'all'); } },
  '-', { label:'Delete page', icon:'delete', danger:true, disabled:M.site.pages.length === 1, on:() => { const gone = M.site.pages.splice(i, 1)[0]; M.pi = Math.max(0, Math.min(M.pi, M.site.pages.length - 1)); M.changed(true, 'all'); ONE.toast(`“${gone.name}” deleted.`, { action:'Undo', fn:() => M.go(-1) }); } }]);
E.addPage = () => {
  const inp = ONE.input({ value:'New page' }); let tpl = 'blank';
  const g = el('div', { class:'ptpl' }); Object.entries(M.PAGE_TEMPLATES).forEach(([k, t]) => g.append(el('button', { class:'ptpl-b' + (k === tpl ? ' on' : ''), 'data-k':k, html:`${icon(t.icon)}<span>${esc(t.name)}</span>`, onclick:e => { tpl = k; $$('.ptpl-b', g).forEach(x => x.classList.toggle('on', x.dataset.k === k)); if (inp.value === 'New page' || Object.values(M.PAGE_TEMPLATES).some(x => x.name === inp.value)) inp.value = k === 'blank' ? 'New page' : t.name; } })));
  ONE.modal({ title:'Add a page', icon:'note_add', width:520, body:el('div', { class:'dlg-col' }, ONE.field('Name (shown in the menu)', inp), el('div', { class:'field-label', text:'Start with' }), g), actions:[{ label:'Cancel' }, { label:'Add page', kind:'filled', on:() => { M.site.pages.push(M.newPage(inp.value.trim() || 'New page', tpl)); M.pi = M.site.pages.length - 1; E.sel = null; M.changed(true, 'all'); } }] });
};

/* ---------- the section library, with live previews in the current theme ---------- */
E.openLibrary = after => {
  const cats = ['All', ...new Set(BLOCKS.ORDER.map(t => BLOCKS[t].cat))]; let cat = 'All';
  const chips = el('div', { class:'seg' }), grid = el('div', { class:'lib' });
  const draw = () => {
    $$('.seg-b', chips).forEach(b => b.classList.toggle('on', b.textContent === cat)); grid.innerHTML = '';
    BLOCKS.ORDER.filter(t => cat === 'All' || BLOCKS[t].cat === cat).forEach((t, i) => {
      const def = BLOCKS[t], b = BLOCKS.new(t), card = el('button', { class:'libc', style:{ animationDelay:i * 25 + 'ms' } });
      const pv = el('iframe', { class:'libpv', tabindex:'-1', 'aria-hidden':'true', loading:'lazy' });
      const mini = Object.assign({}, M.site, { pages:[{ id:'pv', name:'Home', sections:[b] }] });
      pv.srcdoc = `<!doctype html><html><head>${SITE.fontLink(M.site)}<style>${SITE.css(M.site)}body{pointer-events:none;overflow:hidden}</style></head><body>${SITE.section(b, SITE.ctx(mini, mini.pages[0], 'edit'))}</body></html>`;
      card.append(el('div', { class:'libpv-box' }, pv), el('div', { class:'libc-t', html:`${icon(def.icon)}<span><b>${esc(def.name)}</b><small>${esc(def.desc)}</small></span>` }));
      card.onclick = () => { m.close(); E.insert(t, after); };
      grid.append(card);
    });
  };
  cats.forEach(c => chips.append(el('button', { class:'seg-b', text:c, onclick:() => { cat = c; draw(); } })));
  const m = ONE.modal({ title:'Add a section', icon:'add_box', width:980, body:el('div', { class:'dlg-col' }, chips, grid), actions:[{ label:'Close' }] });
  draw();
};
E.insert = (type, after) => {
  const list = M.page().sections, b = BLOCKS.new(type);
  const at = after ? list.findIndex(x => x.id === after) + 1 : list.length;
  list.splice(at, 0, b); E.sel = b.id; M.changed(true, 'all');
  setTimeout(() => { const n = fd() && fd().querySelector(`[data-block="${b.id}"]`); if (n) n.scrollIntoView({ behavior:'smooth', block:'start' }); }, 250);
};

/* ---------- pictures ---------- */
const readURL = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
E.shrink = async (f, max = 1800) => {
  const url = await readURL(f); if (/gif|svg/.test(f.type)) return url;
  const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; }); if (!im) return url;
  const k = Math.min(1, max / Math.max(im.width, im.height)); if (k === 1 && f.size < 350000) return url;
  const c = el('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .84);
};
E.chooseFile = () => new Promise(ok => { const i = el('input', { type:'file', accept:'image/*' }); i.onchange = () => ok(i.files[0] || null); i.click(); });
E.pickImage = async (id, path) => {
  const f = M.find(id); if (!f) return;
  ONE.menuAt(E.lastPointer || { x:innerWidth / 2, y:innerHeight / 2 }, [
    { label:'Upload a picture…', icon:'upload', on:async () => { const file = await E.chooseFile(); if (!file) return; set(f.b.data, path, await E.shrink(file)); M.changed(true, id); } },
    { label:'Use a link…', icon:'link', on:() => { const i = ONE.input({ placeholder:'https://…/photo.jpg' }); ONE.modal({ title:'Picture from a link', icon:'link', body:ONE.field('Picture address', i), actions:[{ label:'Cancel' }, { label:'Use it', kind:'filled', on:() => { const v = i.value.trim(); if (!/^https?:\/\//.test(v)) { ONE.toast('Paste a link that starts with https://'); return false; } set(f.b.data, path, v); M.changed(true, id); } }] }); } },
    { label:'Describe it (alt text)…', icon:'accessibility_new', on:() => { const i = ONE.input({ value:get(f.b.data, path + 'Alt') || '' }); ONE.modal({ title:'Describe this picture', icon:'accessibility_new', body:ONE.field('What’s in it? (read aloud by screen readers)', i), actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => { set(f.b.data, path + 'Alt', i.value.trim()); M.changed(true, id); } }] }); } },
    { label:'Back to the placeholder', icon:'hide_image', on:() => { set(f.b.data, path, 'ph:' + (path.includes('image') ? 'g' + (path.length % 6 + 1) : 'x')); M.changed(true, id); } }]);
};
document.addEventListener('pointerdown', e => { E.lastPointer = { x:e.clientX, y:e.clientY }; }, true);
frame.addEventListener('load', () => { fd().addEventListener('pointerdown', e => { const r = frame.getBoundingClientRect(), k = r.width / frame.offsetWidth; E.lastPointer = { x:r.left + e.clientX * k, y:r.top + e.clientY * k }; }, true); });

/* ---------- inspector ---------- */
const ICONS = ['star', 'bolt', 'favorite', 'verified', 'rocket_launch', 'eco', 'restaurant', 'wine_bar', 'local_cafe', 'school', 'work', 'palette', 'brush', 'photo_camera', 'music_note', 'fitness_center', 'spa', 'pets', 'home', 'shield', 'lock', 'support_agent', 'chat', 'mail', 'call', 'location_on', 'schedule', 'calendar_month', 'payments', 'savings', 'shopping_bag', 'local_shipping', 'thumb_up', 'emoji_events', 'lightbulb', 'code', 'devices', 'cloud', 'public', 'handshake', 'groups', 'auto_awesome', 'celebration', 'park', 'water_drop', 'sunny', 'diamond', 'build'];
const linkTargets = () => [['', 'Choose…'], ...M.site.pages.map(p => ['page:' + p.id, 'Page: ' + p.name]), ...M.page().sections.map(b => ['#' + (b.anchor || b.type), 'Section: ' + BLOCKS[b.type].name]), ['custom', 'Web address, email or phone…']];
function field(b, id, [key, type, label, opt], base = '') {
  const path = base + key, val = get(b.data, path), upd = (v, rerender = true) => { set(b.data, path, v); M.dirty(); if (rerender) { clearTimeout(E._rt); E._rt = setTimeout(() => { E.renderBlock(id); M.record(); }, 180); } };
  const wrapF = (...kids) => el('div', { class:'ifield' }, el('label', { class:'ilabel', text:label }), ...kids);
  if (type === 'text' || type === 'area') {
    const i = el(type === 'area' ? 'textarea' : 'input', { class:'tf', rows:type === 'area' ? 3 : null }); i.value = val || ''; i.oninput = () => upd(i.value); return wrapF(i);
  }
  if (type === 'toggle') { const c = ONE.check(label, !!val); c.input.onchange = () => upd(c.input.checked); return el('div', { class:'ifield' }, c.wrap); }
  if (type === 'icon') {
    const b2 = el('button', { class:'iconpick', html:`${icon(val || 'star')}<span>${esc(val || 'star')}</span>${icon('expand_more')}` });
    b2.onclick = () => { const g = el('div', { class:'icongrid' }); ICONS.forEach(n => g.append(el('button', { title:n, html:icon(n), class:n === val ? 'on' : '', onclick:() => { ONE.pop.close(); upd(n); b2.innerHTML = `${icon(n)}<span>${esc(n)}</span>${icon('expand_more')}`; } }))); ONE.pop.open(b2, g); };
    return wrapF(b2);
  }
  if (type === 'image') {
    const th = el('button', { class:'ithumb', title:'Change picture', style:{ backgroundImage:`url("${SITE.ctx(M.site, M.page(), 'edit').img(val)}")` } });
    th.onclick = () => E.pickImage(id, path); return wrapF(th);
  }
  if (type === 'link') {
    const v = val || { label:'', url:'' }, lab = el('input', { class:'tf', placeholder:'Button text (empty = no button)' }); lab.value = v.label || '';
    const sel = ONE.select(linkTargets(), '', { class:'tf' }), url = el('input', { class:'tf', placeholder:'https://… · name@email.com · +1 555…' }); url.value = v.url || '';
    const known = linkTargets().some(([k]) => k && k !== 'custom' && k === v.url); sel.value = known ? v.url : v.url ? 'custom' : ''; url.hidden = sel.value !== 'custom';
    const push = () => upd({ label:lab.value, url:sel.value === 'custom' ? url.value.trim() : sel.value });
    lab.oninput = push; url.oninput = push; sel.onchange = () => { url.hidden = sel.value !== 'custom'; if (!url.hidden) url.focus(); push(); };
    return wrapF(lab, sel, url);
  }
  if (type === 'list') {
    const items = get(b.data, path) || [], box = el('div', { class:'ilist' });
    items.forEach((it, i) => {
      const title = it.title || it.name || it.q || it.num || it.caption || `${label.replace(/s$/, '')} ${i + 1}`;
      const d = el('details', { class:'iitem', open:E.openItem === `${id}:${i}` }, el('summary', {}, el('span', { class:'grow', text:String(title) }),
        el('button', { class:'icon-btn', title:'Move up', html:icon('arrow_upward'), disabled:i === 0, onclick:e => { e.preventDefault(); items.splice(i - 1, 0, items.splice(i, 1)[0]); M.changed(true, id); E.fillInspector(); } }),
        el('button', { class:'icon-btn', title:'Remove', html:icon('delete'), onclick:e => { e.preventDefault(); items.splice(i, 1); M.changed(true, id); E.fillInspector(); } })));
      d.ontoggle = () => { if (d.open) E.openItem = `${id}:${i}`; };
      opt.fields.forEach(sub => d.append(field(b, id, sub, `${path}.${i}.`)));
      box.append(d);
    });
    if (items.length < (opt.max || 99)) box.append(el('button', { class:'btn tonal addi', html:`${icon('add')}Add ${label.toLowerCase().replace(/s$/, '')}`, onclick:() => { items.push(opt.make()); set(b.data, path, items); E.openItem = `${id}:${items.length - 1}`; M.changed(true, id); E.fillInspector(); } }));
    return el('div', { class:'ifield' }, el('div', { class:'ilabel', text:label }), box);
  }
  return el('div');
}
const chipRow = (opts, cur, on) => { const r = el('div', { class:'chips' }); opts.forEach(([k, t]) => { const b = el('button', { class:'chip' + (k === cur ? ' on' : ''), text:t }); b.onclick = () => { $$('.chip', r).forEach(c => c.classList.toggle('on', c === b)); on(k); }; r.append(b); }); return r; };
E.fillInspector = (soft = false) => {
  if (soft && right.contains(document.activeElement)) return; // don't yank a field out from under the cursor
  const body = $('#insp'), f = E.sel && M.find(E.sel); body.innerHTML = '';
  if (!f) {
    const p = M.page(), name = ONE.input({ value:p.name }); name.oninput = () => { p.name = name.value || 'Page'; M.dirty(); clearTimeout(E._pn); E._pn = setTimeout(() => { M.changed(true, M.site.header.id); E.fillOutline(); }, 300); };
    body.append(el('h3', { class:'ititle', html:`${icon(M.pi === 0 ? 'home' : 'description')}Page` }), el('div', { class:'ifield' }, el('label', { class:'ilabel', text:'Page name (shown in the menu)' }), name),
      el('p', { class:'ihint', text:'Click any section on the page to change it, or any text to type over it.' }),
      el('button', { class:'btn tonal', html:`${icon('add')}Add section`, onclick:() => E.openLibrary(null) }), el('button', { class:'btn text', html:`${icon('settings')}Site settings`, onclick:() => ED.siteSettings() }));
    return;
  }
  const b = f.b, def = BLOCKS[b.type], id = b.id;
  body.append(el('h3', { class:'ititle', html:`${icon(def.icon)}${esc(def.name)}` }));
  if (Object.keys(def.variants).length > 1) body.append(el('div', { class:'ifield' }, el('div', { class:'ilabel', text:'Layout' }), chipRow(Object.entries(def.variants), b.v, k => { b.v = k; M.changed(true, id); })));
  if (!def.global) {
    body.append(el('div', { class:'ifield' }, el('div', { class:'ilabel', text:'Background' }), chipRow([['default', 'Plain'], ['alt', 'Soft'], ['accent', 'Colour'], ['dark', 'Dark'], ['image', 'Picture']], b.bg || 'default', async k => {
      if (k === 'image' && !b.bgImg) { const file = await E.chooseFile(); if (!file) { E.fillInspector(); return; } b.bgImg = await E.shrink(file, 2200); }
      b.bg = k; M.changed(true, id); E.fillInspector(); })));
    if (b.bg === 'image') body.append(el('button', { class:'btn text', html:`${icon('image')}Change background picture`, onclick:async () => { const file = await E.chooseFile(); if (!file) return; b.bgImg = await E.shrink(file, 2200); M.changed(true, id); } }));
    body.append(el('div', { class:'ifield' }, el('div', { class:'ilabel', text:'Space around it' }), chipRow([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], b.pad || 'm', k => { b.pad = k; M.changed(true, id); })));
  }
  body.append(el('div', { class:'isep', text:'Content' }));
  (def.fields || []).forEach(fl => body.append(field(b, id, fl)));
  if (!def.global) {
    const anc = ONE.input({ value:b.anchor || b.type, placeholder:b.type }); anc.oninput = () => { b.anchor = anc.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') || undefined; M.dirty(); clearTimeout(E._an); E._an = setTimeout(() => M.changed(true, id), 300); };
    body.append(el('div', { class:'isep', text:'Link to this section' }), el('div', { class:'ifield' }, el('label', { class:'ilabel', text:'Name used in links (#…)' }), anc),
      el('div', { class:'irow' }, el('button', { class:'btn text', html:`${icon('content_copy')}Duplicate`, onclick:() => E.act('dup') }), el('button', { class:'btn text danger', html:`${icon('delete')}Delete`, onclick:() => E.act('del') })));
  }
};

/* ---------- keys ---------- */
function keyShortcuts(e) {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); return e.shiftKey ? M.go(1) : M.go(-1); }
  if (mod && k === 'y') { e.preventDefault(); return M.go(1); }
  if (mod && k === 's') { e.preventDefault(); return M.save() && ONE.toast('Saved to this browser.'); }
  if (mod && k === 'd' && E.sel) { e.preventDefault(); return E.act('dup'); }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && E.sel) { e.preventDefault(); return E.act(e.key === 'ArrowUp' ? 'up' : 'down'); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel && !/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || '')) && !e.target.isContentEditable) { e.preventDefault(); return E.act('del'); }
  if (e.key === 'Escape' && E.sel && !ONE.topModal()) { E.select(null, false); }
}
E.keys = keyShortcuts;
})();
