/* oneDraw — model: boards, pages, templates, undo and saving (localStorage od-lib / od-doc-<id>) */
(() => {
'use strict';
const { $, store } = ONE;
const D = window.D = {};
D.hooks = [];

/* ---------- palettes ---------- */
D.INK = ['auto', '#e03131', '#f76707', '#f59f00', '#2f9e44', '#0c8599', '#1971c2', '#6741d9', '#c2255c', '#868e96'];
D.FILL = [null, '#ffc9c9', '#ffd8a8', '#ffec99', '#b2f2bb', '#99e9f2', '#a5d8ff', '#d0bfff', '#fcc2d7', '#dee2e6'];
D.HL = ['#ffd43b', '#ff8787', '#69db7c', '#4dabf7', '#da77f2', '#ffa94d'];
D.STICKY = ['#fff59d', '#f8bbd0', '#c5e1a5', '#81d4fa', '#ffcc80', '#ce93d8'];
D.BGS = [['plain', 'Plain', 'crop_free'], ['dots', 'Dot grid', 'grid_goldenratio'], ['grid', 'Grid', 'grid_4x4'], ['lines', 'Ruled lines', 'format_line_spacing']];
D.PAGE_COLORS = [[null, 'Match the app'], ['#ffffff', 'White'], ['#fff8e1', 'Cream'], ['#e3f2fd', 'Sky'], ['#e8f5e9', 'Mint'], ['#1e1f24', 'Charcoal'], ['#10382b', 'Chalkboard']];
D.FONTS = {
  hand: ['Handwriting', '"Caveat","Segoe Print","Comic Sans MS",cursive'],
  sans: ['Clean', '"Google Sans","Roboto Flex",system-ui,sans-serif'],
  serif: ['Serif', '"EB Garamond",Georgia,serif'],
  mono: ['Code', '"Roboto Mono",ui-monospace,Consolas,monospace']
};
D.SIZES = [16, 20, 28, 36, 48, 64, 96];
D.WIDTHS = [[1, 'Thin'], [2, 'Medium'], [4, 'Bold'], [7, 'Extra bold']];

/* ---------- constructors ---------- */
D.newPage = (name, bg = 'dots', color = null) => ({ id:ONE.uid(), name:name || '', bg, color, els:[], view:{ tx:null, ty:null, k:1 } });
D.newDoc = (title = 'Untitled board', bg = 'dots') => ({ id:ONE.uid(), title, created:Date.now(), updated:Date.now(), pages:[D.newPage('', bg)], cur:0 });
D.sticky = (x, y, text, c, w = 200, h = 170) => ({ id:ONE.uid(), t:'sticky', x, y, w, h, text, c, size:22, font:'hand', op:1 });
D.label = (x, y, text, size = 36, c = 'auto', font = 'sans') => ({ id:ONE.uid(), t:'text', x, y, text, size, font, c, op:1 });
D.box = (t, x, y, w, h, o = {}) => Object.assign({ id:ONE.uid(), t, x, y, w, h, c:'auto', f:null, sw:2, dash:'solid', op:1 }, o);
D.arrow = (x1, y1, x2, y2) => ({ id:ONE.uid(), t:'line', x1, y1, x2, y2, arrow:true, c:'auto', sw:2, dash:'solid', op:1 });
// templates are centred on 0,0; the view is set so that point lands in the middle of whatever size the window is
const centred = (d, k = 1) => { d.pages[0].view = { tx:null, ty:null, k }; return d; };

D.TEMPLATES = {
  blank:{ name:'Blank board', desc:'An empty canvas to think on', icon:'draw', make:() => D.newDoc('Untitled board', 'dots') },
  plain:{ name:'Plain white', desc:'No grid at all', icon:'crop_square', make:() => D.newDoc('Untitled board', 'plain') },
  notes:{ name:'Handwritten notes', desc:'Ruled lines for writing', icon:'edit_note', make:() => { const d = D.newDoc('Handwritten notes', 'lines'); d.pages[0].color = '#fff8e1'; d.pages[0].els.push(D.label(-380, -260, 'Notes', 44, '#1971c2', 'hand')); return centred(d); } },
  brainstorm:{ name:'Brainstorm', desc:'Sticky notes around a question', icon:'lightbulb', make:() => { const d = D.newDoc('Brainstorm', 'dots'), e = d.pages[0].els;
    e.push(D.box('rect', -170, -60, 340, 120, { c:'#1971c2', f:'#a5d8ff', sw:3, text:'What are we trying to solve?', size:28, font:'sans' }));
    [[-460, -260, 0], [-210, -300, 1], [60, -300, 2], [310, -260, 3], [-460, 120, 4], [-210, 160, 5], [60, 160, 0], [310, 120, 1]].forEach(([x, y, c], i) => e.push(D.sticky(x, y, i < 3 ? 'Idea ' + (i + 1) : '', D.STICKY[c])));
    return centred(d, .8); } },
  kanban:{ name:'Kanban board', desc:'To do · Doing · Done', icon:'view_kanban', make:() => { const d = D.newDoc('Kanban board', 'plain'), e = d.pages[0].els;
    [['To do', '#e03131'], ['Doing', '#f59f00'], ['Done', '#2f9e44']].forEach(([n, c], i) => { const x = i * 330 - 495; e.push(D.box('rect', x, -240, 300, 520, { c, sw:2, f:null }), D.label(x + 20, -226, n, 32, c, 'sans')); e.push(D.sticky(x + 50, -150, i === 0 ? 'First task' : '', D.STICKY[i === 0 ? 0 : i === 1 ? 4 : 2], 200, 130)); });
    return centred(d, .75); } },
  flow:{ name:'Flowchart', desc:'Start with a few connected shapes', icon:'account_tree', make:() => { const d = D.newDoc('Flowchart', 'grid'), e = d.pages[0].els;
    e.push(D.box('ellipse', -90, -300, 180, 80, { c:'#2f9e44', f:'#b2f2bb', text:'Start', size:24, font:'sans' }), D.arrow(0, -220, 0, -140),
      D.box('rect', -110, -140, 220, 90, { c:'#1971c2', f:'#a5d8ff', text:'Do something', size:24, font:'sans' }), D.arrow(0, -50, 0, 30),
      D.box('diamond', -130, 30, 260, 150, { c:'#f59f00', f:'#ffec99', text:'Done?', size:24, font:'sans' }), D.arrow(130, 105, 280, 105), D.label(160, 70, 'No', 22, 'auto', 'sans'), D.arrow(0, 180, 0, 260), D.label(10, 200, 'Yes', 22, 'auto', 'sans'),
      D.box('ellipse', -90, 260, 180, 80, { c:'#e03131', f:'#ffc9c9', text:'End', size:24, font:'sans' }));
    return centred(d, .8); } }
};

/* ---------- persistence ---------- */
D.lib = store.get('od-lib', { current:null, docs:{} });
let saveT;
D.dirty = () => { const s = $('#saveState'); if (s) { s.textContent = 'Saving…'; s.classList.add('busy'); } clearTimeout(saveT); saveT = setTimeout(D.save, 700); };
D.clean = doc => JSON.parse(JSON.stringify(doc, (k, v) => k[0] === '_' ? undefined : v));
D.save = () => {
  clearTimeout(saveT); if (!D.doc) return true; D.doc.updated = Date.now();
  const ok = store.set('od-doc-' + D.doc.id, D.clean(D.doc));
  let thumb; try { thumb = window.B && B.thumbURL ? B.thumbURL(D.doc.pages[0], 240, 150) : undefined; } catch {}
  D.lib.docs[D.doc.id] = { title:D.doc.title, updated:D.doc.updated, pages:D.doc.pages.length, thumb }; D.lib.current = D.doc.id; store.set('od-lib', D.lib);
  const st = $('#saveState'); if (st) { st.classList.remove('busy'); st.textContent = ok ? 'Saved' : 'Not saved'; st.title = ok ? 'Saved in this browser' : 'This browser’s storage is full or blocked. Pictures use a lot of space.'; }
  if (!ok) ONE.toast('Couldn’t save: this browser’s storage is full. Remove large pictures or export the board.');
  return ok;
};
D.open = doc => {
  if (D.doc && D.lib.docs[D.doc.id]) D.save();
  D.doc = Object.assign(D.newDoc(), doc);
  if (!Array.isArray(D.doc.pages) || !D.doc.pages.length) D.doc.pages = [D.newPage()];
  D.doc.pages.forEach(p => { p.els = Array.isArray(p.els) ? p.els : []; p.view = p.view || { tx:null, ty:null, k:1 }; p.bg = p.bg || 'dots'; p.id = p.id || ONE.uid(); });
  D.doc.cur = ONE.clamp(D.doc.cur || 0, 0, D.doc.pages.length - 1);
  D.lib.current = D.doc.id; store.set('od-lib', D.lib); D.refresh();
};
D.page = () => D.doc.pages[D.doc.cur];
D.refresh = () => D.hooks.forEach(f => { try { f(); } catch (err) { console.error(err); } });

/* ---------- undo: snapshots of a page's element list. Elements are shallow-copied, so a picture's data is shared, not duplicated.
   Anything that changes a stroke replaces (never edits in place) its points array, so a snapshot stays intact. ---------- */
const hist = new Map();
const H = p => { let h = hist.get(p.id); if (!h) hist.set(p.id, h = { u:[], r:[] }); return h; };
D.snapshot = p => (p || D.page()).els.map(e => Object.assign({}, e));
D.pushUndo = (snap, p) => { const h = H(p || D.page()); h.u.push(snap); if (h.u.length > 100) h.u.shift(); h.r.length = 0; };
D.canUndo = () => !!D.doc && H(D.page()).u.length > 0;
D.canRedo = () => !!D.doc && H(D.page()).r.length > 0;
D.undo = () => { const p = D.page(), h = H(p); if (!h.u.length) return false; h.r.push(D.snapshot(p)); p.els = h.u.pop().map(e => Object.assign({}, e)); return true; };
D.redo = () => { const p = D.page(), h = H(p); if (!h.r.length) return false; h.u.push(D.snapshot(p)); p.els = h.r.pop().map(e => Object.assign({}, e)); return true; };
D.forget = p => hist.delete(p.id);
})();
