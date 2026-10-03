/* oneIdea — model: notebooks, sections, pages, templates, persistence */
(() => {
'use strict';
const { $, esc, store } = ONE;
const N = window.N = {};
N.hooks = [];

N.SECTION_COLORS = ['#4472C4','#ED7D31','#70AD47','#FFC000','#7030A0','#E0457B','#00A3A3','#8B5CF6','#C0504D','#5B9BD5'];
N.PAGE_COLORS = [[null,'None'],['#FFF8E1','Yellow'],['#FDECEA','Pink'],['#E8F5E9','Green'],['#E3F2FD','Blue'],['#F3E5F5','Purple'],['#FFF3E0','Orange'],['#ECEFF1','Gray']];
N.RULES = [['none','None'],['narrow','Narrow Ruled'],['college','College Ruled'],['wide','Wide Ruled'],['gridS','Small Grid'],['gridM','Medium Grid'],['gridL','Large Grid']];

/* ---------- constructors ---------- */
N.newPage = (title = '', items = [], level = 0) => ({ id:ONE.uid(), title, created:Date.now(), updated:Date.now(), level, bg:null, rules:'none', items, ink:[], versions:[] });
N.newSection = (name = 'New Section', color) => ({ id:ONE.uid(), name, color:color || N.SECTION_COLORS[Math.floor(Math.random() * N.SECTION_COLORS.length)], pages:[N.newPage()] });
N.item = (x, y, w, html) => ({ id:ONE.uid(), x, y, w, html });

/* ---------- mind maps ----------
   A page with kind:'map' is a mind map instead of a free-form canvas. map.nodes is a flat list (the order of a
   node's siblings is their order in the list); the root has parent:null and its text is the page title. */
N.MAP_COLORS = ['#4472C4','#ED7D31','#70AD47','#E0457B','#7030A0','#00A3A3','#C0504D','#E0A800'];
N.newMap = (root = 'Central topic') => { const r = { id:ONE.uid(), parent:null, text:root }; return { nodes:[r], view:null, sel:r.id }; };
N.newMapPage = (title = 'Mind map', level = 0) => Object.assign(N.newPage(title, [], level), { kind:'map', map:N.newMap(title) });
// outline: [{ depth, text, note?, tag?, done? }] in reading order; depth 1 hangs off the root, a jump deeper attaches to the last node above.
N.mapFromOutline = (title, outline, level = 0) => {
  const pg = N.newMapPage(title || 'Mind map', level), m = pg.map, root = m.nodes[0], stack = [root], top = [];
  outline.forEach(o => {
    const text = String(o.text || '').trim(); if (!text) return;
    const d = Math.max(1, Math.min(o.depth || 1, stack.length));
    const n = { id:ONE.uid(), parent:stack[d - 1].id, text };
    if (o.note) n.note = o.note; if (o.tag) n.tag = o.tag; if (o.done) n.done = true;
    if (d === 1) { n.color = N.MAP_COLORS[top.length % N.MAP_COLORS.length]; n.side = top.length % 2 ? -1 : 1; top.push(n); }
    m.nodes.push(n); stack[d] = n; stack.length = d + 1;
  });
  return pg;
};
N.mapFromTree = (tree, level = 0) => {
  const out = []; const walk = (kids, d) => (kids || []).forEach(k => { out.push({ depth:d, text:k.t, note:k.note, tag:k.tag }); walk(k.c, d + 1); });
  walk(tree.c, 1); return N.mapFromOutline(tree.t, out, level);
};
N.mapText = p => p.map.nodes.map(n => n.text + (n.note ? ' ' + n.note : '')).join(' ');
N.preview = p => p.kind === 'map' ? `Mind map · ${p.map.nodes.length} node${p.map.nodes.length === 1 ? '' : 's'}` : (N.text(p.items.map(x => x.html).join(' ')).slice(0, 60) || 'Empty');
N.newNotebook = (title = 'My Notebook') => ({ id:ONE.uid(), title, color:'#7719aa', updated:Date.now(), sections:[], bin:[], cur:{ s:0, p:0 } });

/* ---------- page templates ---------- */
const day = () => new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
const todo = t => `<p data-tag="todo" data-tid="${ONE.uid()}">${t}</p>`;
N.TEMPLATES = {
  blank:{ name:'Blank', icon:'draft', make:() => N.newPage() },
  meeting:{ name:'Meeting notes', icon:'groups', make:() => N.newPage('Meeting: ', [
    N.item(48, 130, 560, `<h3>Details</h3><p><b>Date:</b> ${day()}</p><p><b>Attendees:</b> </p><p><b>Goal:</b> </p>`),
    N.item(48, 300, 560, `<h3>Agenda</h3><ol><li>Updates</li><li>Decisions needed</li><li>Next steps</li></ol>`),
    N.item(660, 130, 420, `<h3>Action items</h3>${todo('Owner — task — due date')}${todo('')}`),
    N.item(660, 330, 420, `<h3>Notes</h3><p></p>`)]) },
  todo:{ name:'To-do list', icon:'checklist', make:() => N.newPage('To do', [N.item(48, 130, 520, `<h3>Today</h3>${todo('')}${todo('')}${todo('')}<h3>This week</h3>${todo('')}${todo('')}<h3>Someday</h3>${todo('')}`)]) },
  lecture:{ name:'Lecture notes', icon:'school', make:() => N.newPage('Lecture: ', [
    N.item(48, 130, 300, `<h3>Key terms</h3><p data-tag="definition" data-tid="${ONE.uid()}">Term — meaning</p>`),
    N.item(380, 130, 620, `<h3>Notes</h3><ul><li></li></ul>`),
    N.item(380, 380, 620, `<h3>Summary</h3><p></p><p data-tag="question" data-tid="${ONE.uid()}">Questions to ask:</p>`)]) },
  project:{ name:'Project overview', icon:'rocket_launch', make:() => N.newPage('Project: ', [
    N.item(48, 130, 520, `<h3>Why</h3><p></p><h3>What “done” looks like</h3><ul><li></li></ul>`),
    N.item(620, 130, 460, `<h3>Milestones</h3><table><tr><th>Milestone</th><th>Date</th><th>Status</th></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></table>`),
    N.item(620, 330, 460, `<h3>Risks</h3><p data-tag="critical" data-tid="${ONE.uid()}"></p>`)]) },
  journal:{ name:'Journal', icon:'auto_stories', make:() => N.newPage(day(), [N.item(48, 130, 620, `<h3>Three good things</h3><ol><li></li><li></li><li></li></ol><h3>On my mind</h3><p></p><h3>Tomorrow</h3>${todo('')}`)]) },
  recipe:{ name:'Recipe', icon:'restaurant', make:() => N.newPage('Recipe: ', [
    N.item(48, 130, 340, `<h3>Ingredients</h3><ul><li></li><li></li><li></li></ul><p><b>Serves:</b> </p><p><b>Time:</b> </p>`),
    N.item(420, 130, 560, `<h3>Steps</h3><ol><li></li><li></li><li></li></ol>`)]) },
  brainstorm:{ name:'Brainstorm', icon:'lightbulb', make:() => N.newPage('Ideas', [
    N.item(420, 260, 260, `<h2 style="text-align:center">Big idea</h2>`),
    N.item(80, 140, 260, `<p data-tag="idea" data-tid="${ONE.uid()}"></p>`), N.item(760, 140, 260, `<p data-tag="idea" data-tid="${ONE.uid()}"></p>`),
    N.item(80, 420, 260, `<p data-tag="idea" data-tid="${ONE.uid()}"></p>`), N.item(760, 420, 260, `<p data-tag="idea" data-tid="${ONE.uid()}"></p>`)]) }
};

/* study templates: no bold labels (Recall mode hides bold text), "Term :: meaning" lines become flashcards */
const q = t => `<p data-tag="question" data-tid="${ONE.uid()}">${t}</p>`;
const T = N.TEMPLATES;
T.mindmap = { name:'Mind map', icon:'account_tree', make:() => N.newMapPage('Mind map') };
T.cornell = { name:'Cornell notes', icon:'view_sidebar', make:() => N.newPage('Cornell: ', [
  N.item(48, 130, 952, `<p>Course: &nbsp;&nbsp;&nbsp; Date: ${day()}</p>`),
  N.item(48, 190, 250, `<h3>Cues and questions</h3>${q('')}${q('')}${q('')}`),
  N.item(330, 190, 670, `<h3>Notes</h3><ul><li></li></ul>`),
  N.item(48, 600, 952, `<h3>Summary</h3><p>Write 2 or 3 sentences that sum up this page.</p>`)]) };
T.reading = { name:'Reading notes', icon:'import_contacts', make:() => N.newPage('Reading: ', [
  N.item(48, 130, 460, `<h3>Source</h3><p>Title, author, pages</p><h3>Main argument</h3><p></p>`),
  N.item(48, 360, 460, `<h3>Key quotes</h3><blockquote></blockquote><blockquote></blockquote>`),
  N.item(560, 130, 440, `<h3>Key terms</h3><p data-tag="definition" data-tid="${ONE.uid()}">Term :: meaning</p>`),
  N.item(560, 330, 440, `<h3>My thoughts</h3><p></p>${q('Questions I still have')}`)]) };
T.revision = { name:'Revision sheet', icon:'fact_check', make:() => N.newPage('Revision: ', [
  N.item(48, 130, 440, `<h3>Must remember</h3><p data-tag="remember" data-tid="${ONE.uid()}"></p><p data-tag="remember" data-tid="${ONE.uid()}"></p>`),
  N.item(48, 330, 440, `<h3>Formulas and facts</h3><ul><li></li><li></li></ul>`),
  N.item(540, 130, 460, `<h3>Key terms</h3><p data-tag="definition" data-tid="${ONE.uid()}">Term :: meaning</p><p data-tag="definition" data-tid="${ONE.uid()}">Term :: meaning</p>`),
  N.item(540, 360, 460, `<h3>Practice questions</h3>${q('')}${q('')}`)]) };
T.vocab = { name:'Vocabulary table', icon:'translate', make:() => N.newPage('Vocabulary: ', [
  N.item(48, 130, 720, `<p>Fill in a term and its meaning on each row. Every row becomes a flashcard.</p><table><tr><th>Term</th><th>Meaning</th><th>Example</th></tr>${'<tr><td><br></td><td><br></td><td><br></td></tr>'.repeat(6)}</table>`)]) };
// New-page menu order: study pages first
{ const order = ['blank', 'mindmap', 'cornell', 'lecture', 'reading', 'revision', 'vocab', 'todo', 'meeting', 'project', 'brainstorm', 'journal', 'recipe']; N.TEMPLATES = Object.fromEntries(order.map(k => [k, T[k]])); }

N.studyNotebook = () => {
  const n = N.newNotebook('Study'); n.color = '#107c41';
  const guide = N.newPage('How this notebook works', [
    N.item(48, 130, 560, `<h3>Mind maps</h3><p>Open the Photosynthesis map. Click a branch, press <i>Tab</i> for a sub-topic and <i>Enter</i> for a sibling. Drag a branch onto another to move it.</p><h3>Notes</h3><p>Use Cornell pages for lectures. Press Ctrl+4 to tag what to remember and Ctrl+5 for a definition.</p>`),
    N.item(660, 130, 420, `<h3>Flashcards</h3><p>Write a line like this and it becomes a card:</p><p data-tag="definition" data-tid="${ONE.uid()}">Chlorophyll :: the green pigment that absorbs light</p><p>Then open Study > Flashcards.</p>`),
    N.item(48, 420, 560, `<h3>Test yourself</h3><p>Highlight key terms (Ctrl+Shift+H), then turn on Recall mode in the Study tab. Highlighted and bold text hides until you click it.</p>`)]);
  const map = N.mapFromTree({ t:'Photosynthesis', c:[
    { t:'Light reactions', note:'Happen in the thylakoid membranes and need light.', c:[{ t:'Split water, release oxygen' }, { t:'Make ATP and NADPH' }, { t:'Chlorophyll absorbs light', tag:'definition' }] },
    { t:'Calvin cycle', note:'Happens in the stroma and does not need light directly.', c:[{ t:'Fixes carbon dioxide' }, { t:'Uses ATP and NADPH' }, { t:'Makes glucose' }] },
    { t:'Inputs', c:[{ t:'Water' }, { t:'Carbon dioxide' }, { t:'Light energy' }] },
    { t:'Outputs', c:[{ t:'Glucose' }, { t:'Oxygen', tag:'important' }] }] }, 0);
  const cornell = Object.assign(T.cornell.make(), { title:'Cornell: Photosynthesis' });
  cornell.items[1].html = `<h3>Cues and questions</h3>${q('Where do the light reactions happen?')}${q('What does the Calvin cycle need?')}`;
  cornell.items[2].html = `<h3>Notes</h3><ul><li>Light reactions: <b>thylakoid membranes</b></li><li>Calvin cycle: <b>stroma</b></li></ul><p data-tag="definition" data-tid="${ONE.uid()}">Stroma :: the fluid space inside a chloroplast</p>`;
  const course = name => Object.assign(N.newSection(name, N.SECTION_COLORS[n.sections.length % N.SECTION_COLORS.length]), { pages:[N.newMapPage(name + ' map'), Object.assign(T.cornell.make(), { title:'Lecture 1' })] });
  n.sections = [Object.assign(N.newSection('Start here', '#7030A0'), { pages:[guide, map, cornell] })];
  n.sections.push(course('Course 1'), course('Course 2'), Object.assign(N.newSection('Exam prep', '#E0457B'), { pages:[T.revision.make(), T.vocab.make()] }));
  return n;
};

N.NOTEBOOK_TEMPLATES = {
  tour:{ name:'Getting started', desc:'A quick tour of oneIdea', icon:'tour', make:() => N.sample() },
  study:{ name:'Study', desc:'Mind maps, Cornell notes, flashcards', icon:'psychology', make:() => N.studyNotebook() },
  blank:{ name:'Blank notebook', desc:'One empty section', icon:'book', make:() => { const n = N.newNotebook('My Notebook'); n.sections = [N.newSection('Quick Notes', '#4472C4')]; return n; } },
  personal:{ name:'Personal', desc:'Quick Notes, Journal, Recipes', icon:'favorite', make:() => { const n = N.newNotebook('Personal'); n.sections = [N.newSection('Quick Notes', '#4472C4'), Object.assign(N.newSection('Journal', '#E0457B'), { pages:[N.TEMPLATES.journal.make()] }), Object.assign(N.newSection('Recipes', '#ED7D31'), { pages:[N.TEMPLATES.recipe.make()] })]; return n; } },
  work:{ name:'Work', desc:'Meetings, Projects, To do', icon:'work', make:() => { const n = N.newNotebook('Work'); n.color = '#185abd'; n.sections = [Object.assign(N.newSection('Meetings', '#4472C4'), { pages:[N.TEMPLATES.meeting.make()] }), Object.assign(N.newSection('Projects', '#70AD47'), { pages:[N.TEMPLATES.project.make()] }), Object.assign(N.newSection('To do', '#FFC000'), { pages:[N.TEMPLATES.todo.make()] })]; return n; } },
  school:{ name:'School', desc:'A section per class', icon:'school', make:() => { const n = N.newNotebook('School'); n.color = '#107c41'; n.sections = ['Math', 'Science', 'History', 'English'].map((s, i) => Object.assign(N.newSection(s, N.SECTION_COLORS[i]), { pages:[Object.assign(N.TEMPLATES.lecture.make(), { title:'Lecture 1' })] })); return n; } }
};

N.sample = () => {
  const n = N.newNotebook('Getting started');
  const welcome = N.newPage('Welcome to oneIdea', [
    N.item(48, 130, 520, `<p>This page is a <b>free-form canvas</b>. Click anywhere to start typing, and a note container appears right there.</p><ul><li>Drag a container by its top bar to move it.</li><li>Drag its right edge to make it wider.</li><li>Draw with a pen or highlighter from the <b>Draw</b> tab.</li></ul>`),
    N.item(620, 130, 420, `<h3>Try tags</h3><p data-tag="todo" data-tid="${ONE.uid()}">Click the box to check me off</p><p data-tag="important" data-tid="${ONE.uid()}">Press Ctrl+2 to mark something important</p><p data-tag="question" data-tid="${ONE.uid()}">Ctrl+3 asks a question</p><p>Open <b>Home › Find Tags</b> to see every tag in the notebook.</p>`),
    N.item(48, 400, 520, `<h3>Quick math</h3><p>Type a sum followed by = and a space, like 12*4+3= and it's worked out for you.</p>`),
    N.item(620, 400, 420, `<h3>Keyboard</h3><p>Ctrl+N new page · Ctrl+T new section · Ctrl+E search · Ctrl+1 to-do · Alt+Shift+D today’s date · F11 full page</p>`)]);
  welcome.ink = [{ c:'#E0457B', w:3, pts:[[600, 108], [680, 96], [770, 100], [850, 110]] }];
  const s1 = Object.assign(N.newSection('Quick Notes', '#7719aa'), { pages:[welcome, N.TEMPLATES.todo.make(), Object.assign(N.TEMPLATES.brainstorm.make(), { level:1 })] });
  const s2 = Object.assign(N.newSection('Meetings', '#4472C4'), { pages:[N.TEMPLATES.meeting.make()] });
  n.sections = [s1, s2]; return n;
};

/* ---------- state ---------- */
N.nb = null;
N.section = () => N.nb.sections[N.nb.cur.s];
N.page = () => { const s = N.section(); return s && s.pages[N.nb.cur.p]; };
N.find = pid => { for (const [si, s] of N.nb.sections.entries()) { const pi = s.pages.findIndex(p => p.id === pid); if (pi >= 0) return { si, pi, s, p:s.pages[pi] }; } return null; };
N.text = html => { const d = document.createElement('div'); d.innerHTML = (html || '').replace(/<\/(p|div|li|h[1-6]|tr|td|th|blockquote|pre)>|<br\s*\/?>/gi, '$& '); return d.textContent.replace(/\s+/g, ' ').trim(); };
N.pageText = p => (p.title + ' ' + (p.kind === 'map' ? N.mapText(p) : p.items.map(i => N.text(i.html)).join(' '))).trim();
N.words = p => ((p.kind === 'map' ? N.mapText(p) : p.items.map(i => N.text(i.html)).join(' ')).match(/\S+/g) || []).length;
N.pageCount = nb => nb.sections.reduce((a, s) => a + s.pages.length, 0);

/* ---------- persistence ---------- */
N.lib = store.get('oi-lib', { current:null, docs:{} });
let saveT;
N.dirty = () => { const s = $('#saveState'); if (s) { s.textContent = 'Saving…'; s.classList.add('busy'); } clearTimeout(saveT); saveT = setTimeout(N.save, 700); };
N.save = () => {
  clearTimeout(saveT); if (!N.nb) return true; N.nb.updated = Date.now();
  const ok = store.set('oi-doc-' + N.nb.id, N.nb);
  N.lib.docs[N.nb.id] = { title:N.nb.title, updated:N.nb.updated, sections:N.nb.sections.length, pages:N.pageCount(N.nb), color:N.nb.color }; N.lib.current = N.nb.id; store.set('oi-lib', N.lib);
  const st = $('#saveState'); if (st) { st.classList.remove('busy'); st.textContent = ok ? 'Saved' : 'Not saved'; st.title = ok ? 'Saved in this browser' : 'This browser’s storage is full or blocked. Large pictures and recordings use a lot of space.'; }
  if (!ok) ONE.toast('Couldn’t save: this browser’s storage is full. Remove large pictures or recordings, or export the notebook.');
  return ok;
};
N.open = nb => {
  if (N.nb && N.lib.docs[N.nb.id]) N.save();
  N.nb = Object.assign(N.newNotebook(), nb); N.nb.bin = N.nb.bin || [];
  if (!N.nb.sections.length) N.nb.sections.push(N.newSection('Quick Notes', '#4472C4'));
  N.nb.sections.forEach(s => { if (!s.pages.length) s.pages.push(N.newPage()); });
  const c = N.nb.cur || {}; N.nb.cur = { s:ONE.clamp(c.s || 0, 0, N.nb.sections.length - 1), p:0 }; N.nb.cur.p = ONE.clamp(c.p || 0, 0, N.section().pages.length - 1);
  N.lib.current = N.nb.id; store.set('oi-lib', N.lib); N.refresh();
};
N.refresh = () => N.hooks.forEach(f => { try { f(); } catch (err) { console.error(err); } });
})();
