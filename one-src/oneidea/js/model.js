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

N.NOTEBOOK_TEMPLATES = {
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
N.pageText = p => (p.title + ' ' + p.items.map(i => N.text(i.html)).join(' ')).trim();
N.words = p => (p.items.map(i => N.text(i.html)).join(' ').match(/\S+/g) || []).length;
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
