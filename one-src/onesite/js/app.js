/* oneSite — ribbon, Design controls, File backstage (Home with templates), preview/export/publish, boot. */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
ONE.boot('ob', 'site');
const E = ED, A = {}, P = {};

/* ---------- design controls ---------- */
const paletteGallery = () => {
  const g = el('div', { class:'palgal', role:'listbox', 'aria-label':'Colours' });
  Object.entries(SITE.PALETTES).forEach(([k, p]) => g.append(el('button', { class:'pal', 'data-k':k, title:p.name, 'aria-label':p.name, style:{ '--a':p.accent, '--b':p.bg, '--s':p.surface, '--t':p.text }, html:'<i></i><i></i><i></i>', onclick:() => { M.site.theme.palette = k; M.site.theme.accent = null; M.changed(true, 'all'); syncDesign(); } })));
  return g;
};
const syncDesign = () => { $$('.pal').forEach(b => b.classList.toggle('on', b.dataset.k === M.site.theme.palette)); ONE.ribbon.refresh(); };
P.fonts = a => ONE.menuAt(a, Object.entries(SITE.FONTS).map(([k, f]) => ({ html:`<span style="font-family:'${f.head}',serif;font-weight:${f.w}">${esc(f.name)}</span><small>${esc(f.head)}${f.head !== f.body ? ' + ' + esc(f.body) : ''}</small>`, checked:M.site.theme.font === k, on:() => { M.site.theme.font = k; M.changed(true, 'all'); } })));
P.corners = a => ONE.menuAt(a, Object.entries(SITE.RADII).map(([k, r]) => ({ label:r[0], icon:{ sharp:'crop_square', soft:'rounded_corner', round:'circle' }[k], checked:M.site.theme.radius === k, on:() => { M.site.theme.radius = k; M.changed(true, 'all'); } })));
P.accent = a => ONE.pop.open(a, ONE.colorGrid(c => { M.site.theme.accent = c; M.changed(true, 'all'); }, { autoLabel:'Palette colour', autoColor:SITE.PALETTES[M.site.theme.palette].accent }));
// fonts preview in the Fonts menu needs the fonts themselves
(() => { const fams = [...new Set(Object.values(SITE.FONTS).map(f => f.head))].map(n => 'family=' + n.replace(/ /g, '+') + ':wght@400;600;700').join('&'); document.head.append(el('link', { rel:'stylesheet', href:`https://fonts.googleapis.com/css2?${fams}&display=swap` })); })();

/* ---------- preview, export, publish ---------- */
const siteName = () => (M.site.title || 'My Site').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'My Site';
A.preview = () => { M.save(); const url = URL.createObjectURL(new Blob([SITE.doc(M.site, null, 'single')], { type:'text/html' })); const w = window.open(url, '_blank', 'noopener'); if (!w) ONE.toast('Your browser blocked the preview tab. Allow pop-ups for this site and try again.'); setTimeout(() => URL.revokeObjectURL(url), 60000); };
A.exportHtml = () => ONE.download(siteName() + '.html', SITE.doc(M.site, null, 'single'), 'text/html');
A.exportZip = async () => {
  try {
    await ONE.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const z = new JSZip(); M.site.pages.forEach((p, i) => z.file(SITE.slug(p, i) + '.html', SITE.doc(M.site, p, 'multi')));
    z.file('README.txt', `${M.site.title}\n\nUpload every .html file to any web host (GitHub Pages, Netlify, Cloudflare Pages, your own server…).\nindex.html is the home page. Made with oneSite.\n`);
    ONE.download(siteName() + '.zip', await z.generateAsync({ type:'blob' }), 'application/zip');
  } catch (err) { console.error(err); ONE.toast('Couldn’t build the ZIP. Check your connection and try again.'); }
};
A.publish = async () => {
  const h = ONE.accountHost(), a = h && h.account && h.account();
  if (!h || !h.publishSite) return ONE.modal({ title:'Publish your site', icon:'public', body:el('div', { class:'dlg-col' }, el('p', { html:'Publishing puts your site online with its own link. It works at <b>oeper.dev/one</b> while signed in to your oeper.dev account.' }), el('p', { class:'muted', text:'You can also download your site and put it on any web host (GitHub Pages, Netlify, Cloudflare Pages…).' })), actions:[{ label:'Download .zip', on:() => A.exportZip() }, { label:'Open oeper.dev/one', kind:'filled', on:() => window.open('https://oeper.dev/one/', '_blank', 'noopener') }] });
  if (!a) return ONE.modal({ title:'Sign in to publish', icon:'public', body:'Publishing puts your site online with its own link, saved in your oeper.dev account. Sign in first.', actions:[{ label:'Cancel' }, { label:'Sign in', kind:'filled', on:() => h.signIn() }] });
  M.save(); ONE.toast('Publishing…');
  try {
    const r = await h.publishSite(M.site.id, M.site.title || 'My Site', SITE.doc(M.site, null, 'single'));
    M.site.published = { url:r.url, at:Date.now() }; M.changed(false, 'none');
    publishedDialog(true);
  } catch (err) { ONE.modal({ title:'Couldn’t publish', icon:'error', body:esc(err.message || String(err)) + '<p class="muted">If this keeps happening, the oeper.dev file server may be offline or not updated yet.</p>' }); }
};
const publishedDialog = fresh => {
  const u = M.site.published && M.site.published.url; if (!u) return A.publish();
  const inp = el('input', { class:'tf', value:u, readonly:true, onclick:() => inp.select() });
  ONE.modal({ title:fresh ? 'Your site is live' : 'Published site', icon:'public', width:520, body:el('div', { class:'dlg-col' }, el('p', { text:fresh ? 'Anyone with this link can see it. Publish again whenever you make changes — the link stays the same.' : `Last published ${new Date(M.site.published.at).toLocaleString()}.` }), inp),
    actions:[{ label:'Copy link', on:() => { ONE.copyText(u, 'Link copied.'); return false; } }, { label:'Open site', kind:'filled', on:() => window.open(u, '_blank', 'noopener') }] });
};
A.siteLink = () => publishedDialog(false);

A.siteSettings = ED.siteSettings = () => {
  const s = M.site, t = ONE.input({ value:s.title }), d = el('textarea', { class:'tf', rows:3, placeholder:'One or two sentences that describe your site — shown in search results and link previews.' }); d.value = s.settings.description || '';
  const fav = ONE.input({ value:s.settings.favicon || '', maxlength:4, style:{ width:'80px' } }), an = ONE.check('Fade sections in as visitors scroll', s.settings.anim !== false);
  ONE.modal({ title:'Site settings', icon:'settings', width:520, body:el('div', { class:'dlg-col' }, ONE.field('Site name', t), ONE.field('Description', d), ONE.field('Tab icon (an emoji)', fav), an.wrap),
    actions:[{ label:'Cancel' }, { label:'Save', kind:'filled', on:() => { s.title = t.value.trim() || 'My Site'; $('#docTitle').value = s.title; s.settings.description = d.value.trim(); s.settings.favicon = fav.value.trim(); s.settings.anim = an.input.checked; M.changed(true, 'all'); } }] });
};

/* ---------- ribbon ---------- */
Object.assign(A, {
  save:() => ONE.toast(M.save() ? 'Saved to this browser.' : 'Couldn’t save — storage is full.'), undo:() => M.go(-1), redo:() => M.go(1),
  backstage:() => ONE.backstage.show('home'), collapseRibbon:() => ONE.ribbon.setScale(ONE.ribbon.scale || 1, !document.querySelector('.app').classList.contains('ribbon-min')),
  seed:b => ONE.seedMenu(b), apps:b => ONE.appSwitcher(b), shortcuts:() => shortcuts(),
  addSection:() => E.openLibrary(E.sel && M.find(E.sel) && M.find(E.sel).list ? E.sel : null), addPage:() => E.addPage(), pageMenu:b => E.pageMenu(M.pi, b),
  up:() => E.act('up'), down:() => E.act('down'), dup:() => E.act('dup'), del:() => E.act('del'),
  desktop:() => E.setDevice('desktop'), tablet:() => E.setDevice('tablet'), phone:() => E.setDevice('phone'),
  outlines:() => { E.outlines = !E.outlines; E.render(); ONE.ribbon.refresh(); },
  anim:() => { M.site.settings.anim = M.site.settings.anim === false; M.changed(true, 'none'); ONE.ribbon.refresh(); ONE.toast(M.site.settings.anim !== false ? 'Sections fade in as visitors scroll.' : 'Scroll animations are off.'); },
  leftPanel:() => $('#app').classList.toggle(innerWidth < 900 ? 'show-left' : 'hide-left'), rightPanel:() => $('#app').classList.toggle(innerWidth < 900 ? 'show-right' : 'hide-right')
});
const hasSel = () => { const f = E.sel && M.find(E.sel); return !!(f && f.list); };
const STATES = { desktop:() => E.device === 'desktop', tablet:() => E.device === 'tablet', phone:() => E.device === 'phone', outlines:() => E.outlines, anim:() => M.site && M.site.settings.anim !== false,
  leftPanel:() => !$('#app').classList.contains('hide-left'), rightPanel:() => !$('#app').classList.contains('hide-right') };
const SPEC = [
  { id:'home', label:'Home', groups:[
    { label:'Add', items:[['L', 'add_box', 'Add section', 'addSection'], ['L', 'note_add', 'Add page', 'addPage']] },
    { label:'Section', items:[['C', [['S', 'arrow_upward', 'Move up', 'up', { kbd:'Alt+↑' }], ['S', 'arrow_downward', 'Move down', 'down', { kbd:'Alt+↓' }]]], ['C', [['S', 'content_copy', 'Duplicate', 'dup', { kbd:'Ctrl+D' }], ['S', 'delete', 'Delete', 'del', { kbd:'Del' }]]]] },
    { label:'Page', items:[['LD', 'description', 'This page', 'pageMenu'], ['L', 'settings', 'Site settings', 'siteSettings']] },
    { label:'Share', items:[['L', 'visibility', 'Preview', 'preview'], ['L', 'public', 'Publish', 'publish']] }
  ] },
  { id:'design', label:'Design', groups:[
    { label:'Colours', items:[['X', paletteGallery], ['LD', 'colorize', 'Accent', 'pop:accent']] },
    { label:'Style', items:[['LD', 'text_fields', 'Fonts', 'pop:fonts'], ['LD', 'rounded_corner', 'Corners', 'pop:corners'], ['L', 'animation', 'Scroll animation', 'anim', { state:'anim' }]] }
  ] },
  { id:'view', label:'View', groups:[
    { label:'Device', items:[['L', 'desktop_windows', 'Desktop', 'desktop', { state:'desktop' }], ['L', 'tablet_mac', 'Tablet', 'tablet', { state:'tablet' }], ['L', 'smartphone', 'Phone', 'phone', { state:'phone' }]] },
    { label:'Show', items:[['L', 'select', 'Outlines', 'outlines', { state:'outlines' }], ['L', 'side_navigation', 'Pages panel', 'leftPanel', { state:'leftPanel' }], ['L', 'tune', 'Edit panel', 'rightPanel', { state:'rightPanel' }]] }
  ] },
  { id:'publish', label:'Publish', groups:[
    { label:'Look', items:[['L', 'visibility', 'Preview', 'preview']] },
    { label:'Put it online', items:[['L', 'public', 'Publish', 'publish'], ['L', 'link', 'Site link', 'siteLink']] },
    { label:'Download', items:[['L', 'html', 'One file (.html)', 'exportHtml'], ['L', 'folder_zip', 'All pages (.zip)', 'exportZip']] }
  ] }
];
const run = (act, b, e) => { if (!act) return; if (act.startsWith('pop:')) { const p = P[act.slice(4)]; return p ? p(b) : null; } const f = A[act]; if (f) f(b, e); else console.warn('Unknown action', act); };
ONE.ribbon.build(SPEC, { tabsEl:$('#tabs'), ribbonEl:$('#ribbon'), run, states:STATES });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.closest('#ribbon,#tabs,.pop')) return; if (b.closest('.titlebar,.status,.work')) run(b.dataset.act, b, e); });
$('.qat').addEventListener('mousedown', e => e.preventDefault());
ONE.commandSearch($('#topSearch'), { run });
$('#docTitle').addEventListener('input', () => { M.site.title = $('#docTitle').value; M.dirty(); });
// renaming the site also renames it in the header
$('#docTitle').addEventListener('change', () => { M.site.header.data.logo = M.site.title || M.site.header.data.logo; M.changed(true, M.site.header.id); });
$$('.dev button').forEach(b => b.onclick = () => E.setDevice(b.dataset.dev));
document.addEventListener('keydown', e => { if (ONE.topModal() || ONE.backstage.isOpen() || e.target.closest('input,textarea,select,[contenteditable]')) return; E.keys(e); });

function shortcuts(){
  const list = [['Type over any text', 'Click it'], ['Finish typing', 'Enter (or Esc)'], ['New line in longer text', 'Enter'], ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'], ['Duplicate section', 'Ctrl+D'], ['Move section', 'Alt+↑ / Alt+↓'], ['Delete section', 'Delete'], ['Deselect', 'Esc'], ['Save', 'Ctrl+S'], ['Search commands', 'Alt+Q']];
  ONE.modal({ title:'Keyboard shortcuts', icon:'keyboard', width:520, body:`<div style="display:grid;grid-template-columns:1fr auto;gap:6px 18px">${list.map(([a, k]) => `<span>${esc(a)}</span><kbd>${esc(k)}</kbd>`).join('')}</div>` });
}

/* ---------- model → screen ---------- */
M.hooks.push(what => {
  if (what === 'none') { ONE.ribbon.refresh(); return; }
  if (what === 'open' || what === 'all') { if (E.sel && !M.find(E.sel)) E.sel = null; E.render(); E.fillOutline(); E.fillInspector(); syncDesign(); }
  else { E.renderBlock(what); E.fillOutline(); }
  $('#pageInfo').textContent = `${M.page().name} · ${M.page().sections.length} section${M.page().sections.length === 1 ? '' : 's'}`;
  ONE.ribbon.refresh();
});

/* ---------- backstage ---------- */
const fmtDate = t => new Date(t).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
const openSite = s => { if (!s) return ONE.toast('That site could not be found in this browser.'); M.open(s); M.save(); ONE.backstage.close(); };
function recent(max, del, q, where = 'open'){
  const list = el('div', { class:'list' }), docs = Object.entries(M.lib.docs).filter(([, m]) => !q || m.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b[1].updated - a[1].updated).slice(0, max);
  if (!docs.length) list.append(el('p', { class:'home-empty', text:q ? 'No sites match that search.' : 'No sites yet. Pick a template above to start.' }));
  docs.forEach(([id, m]) => list.append(el('div', { class:'list-item' }, el('span', { class:'ms', text:'web', style:{ color:(SITE.PALETTES[m.palette] || SITE.PALETTES.ocean).accent } }), el('span', { class:'grow', html:`<b>${esc(m.title)}${id === M.site.id && !M.pristine ? ' <small>· open now</small>' : ''}</b><small>${fmtDate(m.updated)} · ${m.pages} page${m.pages === 1 ? '' : 's'}</small>` }),
    el('button', { class:'btn text', text:'Open', onclick:() => openSite(store.get('ob-doc-' + id)) }),
    del && id !== M.site.id ? el('button', { class:'icon-btn', title:'Delete', html:icon('delete'), onclick:() => ONE.modal({ title:`Delete “${m.title}”?`, body:'It will be removed from this browser. A published copy stays online until you delete it in oeper.dev/files.', actions:[{ label:'Cancel' }, { label:'Delete', kind:'filled', on:() => { store.del('ob-doc-' + id); delete M.lib.docs[id]; store.set('ob-lib', M.lib); ONE.backstage.show(where); } }] }) }) : null)));
  return list;
}
const tplCard = (k, t) => {
  const site = t.make(), card = el('button', { class:'tpl-card site-tpl' }), pv = el('iframe', { class:'tplpv', tabindex:'-1', 'aria-hidden':'true', loading:'lazy' });
  pv.srcdoc = SITE.doc(site, null, 'edit').replace(/<script>[\s\S]*?<\/script>/, '').replace('<body class="anim">', '<body>').replace('</head>', '<style>body{pointer-events:none;overflow:hidden}</style></head>');
  card.append(el('div', { class:'thumb', style:{ padding:0 } }, pv), el('span', { html:`${esc(t.name)}<small><br>${esc(t.desc)}</small>` }));
  card.onclick = () => openSite(t.make()); return card;
};
ONE.backstage([
  { id:'home', label:'Home', icon:'home', render:b => { const hr = new Date().getHours(), search = el('input', { placeholder:'Search your sites', 'aria-label':'Search your sites' });
    b.append(el('div', { class:'home-hero' }, el('h1', { text:hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening' }), el('label', { class:'home-search', html:icon('search') }, search)), el('h3', { text:'Start a website' }));
    const g = el('div', { class:'tpl' }); Object.entries(M.TEMPLATES).forEach(([k, t]) => g.append(tplCard(k, t)));
    const holder = el('div'); b.append(g, el('h3', { text:'Your sites' }), holder); const draw = () => { holder.innerHTML = ''; holder.append(recent(200, true, search.value, 'home')); }; search.oninput = draw; draw(); } },
  { id:'open', label:'Open', icon:'folder_open', render:b => b.append(el('h1', { text:'Open' }), el('div', { class:'bs-row' }, el('button', { class:'btn filled', html:`${icon('upload_file')}Browse this device…`, onclick:() => $('#openInput').click() })), el('p', { class:'bs-note', text:'Opens oneSite files (.onesite or .json) saved from the Export page.' }), el('h3', { text:'Sites in this browser' }), recent(50, true)) },
  { id:'info', label:'Info', icon:'info', render:b => { const s = M.site, n = s.pages.reduce((a, p) => a + p.sections.length, 0), size = JSON.stringify(s).length;
    b.append(el('h1', { text:'Info' }), el('div', { class:'info', html:`<span>Site</span><span>${esc(s.title)}</span><span>Pages</span><span>${s.pages.length}</span><span>Sections</span><span>${n}</span><span>Theme</span><span>${esc(SITE.PALETTES[s.theme.palette].name)} · ${esc(SITE.FONTS[s.theme.font].name)}</span><span>Published</span><span>${s.published ? `<a href="${esc(s.published.url)}" target="_blank" rel="noopener">${esc(s.published.url)}</a>` : 'Not yet'}</span><span>Size</span><span>${(size / 1048576).toFixed(2)} MB</span><span>Last saved</span><span>${fmtDate(s.updated)}</span>` }),
      el('div', { class:'bs-row', style:{ marginTop:'18px' } }, el('button', { class:'btn outlined', html:`${icon('settings')}Site settings`, onclick:() => { ONE.backstage.close(); A.siteSettings(); } }))); } },
  { id:'export', label:'Export', icon:'ios_share', render:b => { const row = ([t, d, ic, fn]) => el('div', { class:'list-item' }, el('span', { class:'ms', text:ic }), el('span', { class:'grow', html:`<b>${t}</b><small>${d}</small>` }), el('button', { class:'btn filled', text:'Save', onclick:fn }));
    b.append(el('h1', { text:'Export' }), el('div', { class:'list' }, ...[['Website, one file (.html)', 'Every page in a single file — the easiest to upload anywhere.', 'html', A.exportHtml], ['Website, one file per page (.zip)', 'index.html plus a file for each page. Upload them all to your host.', 'folder_zip', A.exportZip], ['oneSite project (.onesite)', 'To open and keep editing here or in another browser.', 'data_object', () => ONE.download(siteName() + '.onesite', JSON.stringify(M.site), 'application/json')]].map(row))); } },
  '-',
  { id:'close', label:'Close', icon:'close', render:() => { M.save(); ONE.backstage.show('home'); } }
]);
$('#openInput').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { const s = JSON.parse(await f.text()); if (!s.pages || !s.header) throw new Error('not a site'); s.id = ONE.uid(); openSite(s); } catch { ONE.toast('That isn’t a oneSite file.'); } });

/* ---------- boot ---------- */
const first = M.lib.current && store.get('ob-doc-' + M.lib.current);
const pendId = ONE.pendingOpen(), pend = pendId && store.get('ob-doc-' + pendId);
if (pend || first) M.open(pend || first); else M.open(M.TEMPLATES.business.make(), true); // a first visit shows a finished example, saved only once you change it
if (innerWidth < 760) E.setDevice('phone');
if (!pend) setTimeout(() => ONE.backstage.show('home'), 60);
ONE.onOpenRequest = id => openSite(store.get('ob-doc-' + id));
ONE.onNewRequest = k => openSite((M.TEMPLATES[k] || M.TEMPLATES.blank).make());
addEventListener('beforeunload', () => M.save());
document.addEventListener('visibilitychange', () => { if (document.hidden) M.save(); });
})();
