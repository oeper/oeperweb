/* oneIdea: study tools. Flashcards made from your own notes (Term :: meaning, Definition tags, vocabulary tables,
   mind map topics) with spaced review, Recall mode for self-testing, key-term highlighting. */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const P = PG, MM = window.MM, ST = window.ST = {};
const pageEl = $('#page'), itemsEl = $('#items');

/* ---------- building the deck ---------- */
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const flat = s => String(s).replace(/\s+/g, ' ').trim();
const own = x => { const c = x.cloneNode(true); c.querySelectorAll('ul,ol').forEach(y => y.remove()); return flat(c.textContent); };
function splitCard(text, tagged) {
  const i = text.indexOf('::');
  if (i > 0) { const f = flat(text.slice(0, i)), b = flat(text.slice(i + 2)); return f && b ? [f, b] : null; }
  if (!tagged) return null;
  const m = /^(.{1,100}?)\s*(?:—|–|\s-\s|:\s)\s*(.+)$/.exec(text); return m ? [flat(m[1]), flat(m[2])] : null;
}
ST.cardsFrom = pages => {
  const cards = [], seen = new Set();
  const add = (front, back, page, kind, node) => { front = flat(front); if (!front || !back) return; const id = hash(front.toLowerCase()); if (seen.has(id)) return; seen.add(id); cards.push({ id, front, back, page, kind, node }); };
  pages.forEach(pg => {
    if (pg.kind === 'map') {
      const walk = x => { const n = x.n, kids = x.c.map(c => c.n.text).filter(Boolean); if (n.text && (n.note || kids.length)) add(n.text, [n.note, kids.length ? kids.map(k => '• ' + k).join('\n') : ''].filter(Boolean).join('\n\n'), pg, 'map', n.id); x.c.forEach(walk); };
      walk(MM.treeOf(pg)); return;
    }
    pg.items.forEach(it => {
      const d = document.createElement('div'); d.innerHTML = it.html;
      d.querySelectorAll('p,li,blockquote,div').forEach(x => {
        if (x.tagName === 'DIV' && x.querySelector('p,li,div,ul,ol,table,blockquote')) return;
        const c = splitCard(own(x), x.dataset && x.dataset.tag === 'definition'); if (c) add(c[0], c[1], pg, 'note');
      });
      d.querySelectorAll('table tr').forEach(r => {
        if ([...r.cells].every(c => c.tagName === 'TH')) return; const cells = [...r.cells].map(c => flat(c.textContent)).filter(Boolean);
        if (cells.length > 1) add(cells[0], cells.slice(1).join(' · '), pg, 'table');
      });
    });
  });
  return cards;
};

/* ---------- progress (kept in the notebook, so it travels with it) ---------- */
const DAY = 864e5, GAPS = [0, 1, 3, 7, 14, 30];
const store = () => (N.nb.study = N.nb.study || { cards:{} });
const prog = c => store().cards[c.id] || { box:0, due:0, seen:0 };
const isDue = c => prog(c).due <= Date.now();
function rate(c, ok) {
  const p = store().cards[c.id] = prog(c); p.seen++;
  if (ok) { p.box = Math.min(5, p.box + 1); p.due = Date.now() + GAPS[p.box] * DAY; } else { p.box = 1; p.due = Date.now(); }
  N.dirty();
}
ST.rate = rate;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- the flashcard screen ---------- */
const SCOPES = [['page', 'This page'], ['section', 'This section'], ['notebook', 'Whole notebook']];
const pagesFor = k => k === 'page' ? [N.page()] : k === 'section' ? N.section().pages : N.nb.sections.flatMap(s => s.pages);
ST.open = (scope = 'section') => {
  if ($('.fc')) return; P.syncAll();
  let deck = [], reverse = false, flipped = false, cur = null, queue = [], total = 0, got = 0, missed = [], retried = new Set();
  const ov = el('div', { class:'fc', tabindex:0, role:'dialog', 'aria-label':'Flashcards' }), body = el('div', { class:'fc-body' });
  const close = () => { document.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(() => ov.remove(), 200); };
  ov.append(el('div', { class:'fc-bar' }, el('b', { text:'Flashcards' }), el('span', { class:'grow' }), el('button', { class:'icon-btn', title:'Close (Esc)', 'aria-label':'Close', html:icon('close'), onclick:close })), body);
  const goTo = c => { close(); N.goPage(c.page.id); if (c.node) setTimeout(() => MM.focusNode(c.node), 120); };

  function start() {
    deck = ST.cardsFrom(pagesFor(scope)); const due = deck.filter(isDue); body.innerHTML = '';
    body.append(el('div', { class:'seg' }, ...SCOPES.map(([k, t]) => el('button', { class:'seg-b' + (scope === k ? ' on' : ''), text:t, onclick:() => { scope = k; start(); } }))));
    if (!deck.length) {
      body.append(el('div', { class:'fc-empty' }, el('span', { class:'ms', html:'style' }), el('h2', { text:'No cards here yet' }), el('p', { text:'Cards come straight from your notes. Any of these makes one:' }),
        el('ul', {}, el('li', { html:'Write <b>Term :: meaning</b> on any line' }), el('li', { html:'Tag a line as <b>Definition</b> (Ctrl+5) and write <b>Term: meaning</b>' }), el('li', { html:'Fill in a two column table, such as the Vocabulary page' }), el('li', { html:'On a mind map, give a topic sub-topics or a note. The topic is the question' }))));
      return;
    }
    const sess = (list, label, primary) => el('button', { class:'btn ' + (primary ? 'filled' : 'tonal'), disabled:!list.length, html:`${icon(primary ? 'play_arrow' : 'shuffle')}${label} (${list.length})`, onclick:() => run(list) });
    body.append(el('div', { class:'fc-stats' }, el('div', {}, el('b', { text:String(deck.length) }), el('small', { text:deck.length === 1 ? 'card' : 'cards' })), el('div', {}, el('b', { text:String(due.length) }), el('small', { text:'due now' })), el('div', {}, el('b', { text:String(deck.filter(c => prog(c).box >= 4).length) }), el('small', { text:'well known' }))),
      el('div', { class:'fc-go' }, sess(due, 'Study what is due', true), sess(deck, 'Study everything', false)),
      ONE.check('Show the meaning first, then guess the term', reverse, { onchange:e => { reverse = e.target.checked; } }).wrap,
      el('p', { class:'muted', text:'Got it pushes a card further away (1, 3, 7, 14, then 30 days). Still learning brings it back right away.' }));
  }
  function run(list) {
    queue = shuffle(list.slice()); total = queue.length; got = 0; missed = []; retried = new Set(); next();
  }
  function next() {
    cur = queue.shift(); flipped = false; body.innerHTML = '';
    if (!cur) return finish();
    const done = total - queue.length - 1, front = reverse ? cur.back : cur.front, back = reverse ? cur.front : cur.back;
    const card = el('button', { class:'fc-card', 'aria-label':'Flip the card' }, el('small', { class:'fc-side', text:reverse ? 'Meaning' : (cur.kind === 'map' ? 'Topic' : 'Term') }), el('div', { class:'fc-text', text:front }));
    const actions = el('div', { class:'fc-actions' });
    const flip = () => { if (flipped) return; flipped = true; card.classList.add('flipped'); card.querySelector('.fc-side').textContent = reverse ? 'Term' : (cur.kind === 'map' ? 'Covers' : 'Meaning'); card.querySelector('.fc-text').textContent = back; card.classList.remove('fcflip'); void card.offsetWidth; card.classList.add('fcflip'); drawActions(); };
    card.onclick = flip; card._flip = flip;
    const drawActions = () => { actions.innerHTML = ''; if (!flipped) actions.append(el('button', { class:'btn filled', html:`Show answer <kbd>Space</kbd>`, onclick:flip })); else actions.append(el('button', { class:'btn outlined', html:`${icon('replay')}Still learning <kbd>1</kbd>`, onclick:() => answer(false) }), el('button', { class:'btn filled', html:`${icon('check')}Got it <kbd>2</kbd>`, onclick:() => answer(true) })); };
    drawActions(); body.append(el('div', { class:'fc-prog' }, el('i', { style:{ width:(done / total * 100) + '%' } })), el('small', { class:'fc-count', text:`Card ${done + 1} of ${total}` }), card, actions,
      el('button', { class:'btn text fc-src', html:`${icon('open_in_new')}From ${esc(cur.page.title || 'Untitled page')}`, onclick:() => goTo(cur) }));
    ov._card = card;
  }
  function answer(ok) {
    if (!flipped || !cur) return; rate(cur, ok);
    if (ok) got++; else { missed.push(cur); if (!retried.has(cur.id)) { retried.add(cur.id); queue.push(cur); total++; } }
    next();
  }
  function finish() {
    const uniqueMissed = [...new Map(missed.map(c => [c.id, c])).values()];
    body.innerHTML = ''; body.append(el('div', { class:'fc-empty' }, el('span', { class:'ms', html:uniqueMissed.length ? 'trending_up' : 'celebration' }), el('h2', { text:uniqueMissed.length ? 'Nice work' : 'All of them. Great job' }),
      el('p', { text:`${got} answered right${uniqueMissed.length ? `, ${uniqueMissed.length} to look at again` : ''}.` }),
      el('div', { class:'fc-go' }, uniqueMissed.length ? el('button', { class:'btn filled', html:`${icon('replay')}Study the ones I missed`, onclick:() => run(uniqueMissed) }) : null, el('button', { class:'btn tonal', text:'Back to the deck', onclick:start }), el('button', { class:'btn text', text:'Close', onclick:close }))));
  }
  const key = e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); return close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') return;
    if (!cur || !ov._card || !ov.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement !== ov) return e.stopPropagation();
    if (e.key === ' ' || e.key === 'Enter') { if (e.target.closest && e.target.closest('button') && e.target.closest('button') !== ov._card) return; e.preventDefault(); e.stopPropagation(); if (!flipped) ov._card._flip(); return; }
    if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) { e.preventDefault(); e.stopPropagation(); answer(false); }
    else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); answer(true); }
    else e.stopPropagation();
  };
  document.addEventListener('keydown', key, true);
  document.body.append(ov); start(); ov.focus();
};

/* ---------- Recall mode: hide what you highlighted or bolded, click to reveal ---------- */
function applyCanvas() {
  const on = N.recall && !MM.active(); pageEl.classList.toggle('recall', on);
  $$('.nc-body', itemsEl).forEach(b => { b.contentEditable = on ? 'false' : 'true'; });
  if (!on) $$('.shown', itemsEl).forEach(x => x.classList.remove('shown'));
}
ST.applyRecall = () => { applyCanvas(); if (MM.active()) MM.applyRecall(); ONE.ribbon.refresh(); };
ST.toggleRecall = () => {
  N.recall = !N.recall; ST.applyRecall();
  ONE.toast(N.recall ? (MM.active() ? 'Recall mode on. Topics two levels down are hidden. Click one to reveal it.' : 'Recall mode on. Highlighted and bold text is hidden. Click it to reveal.') : 'Recall mode off.');
};
itemsEl.addEventListener('click', e => {
  if (!N.recall) return; const h = e.target.closest('b,strong,[style*="background-color"]'); if (!h || !itemsEl.contains(h)) return;
  e.preventDefault(); h.classList.toggle('shown');
}, true);
const baseRender = P.render; P.render = (...a) => { baseRender(...a); applyCanvas(); };

/* ---------- small helpers for the ribbon ---------- */
ST.keyTerm = () => {
  if (MM.active()) return ONE.toast('Key terms are for note pages. On a mind map, mark a topic with Ctrl+2 instead.');
  if (!P.restore() || getSelection().isCollapsed) return ONE.toast('Select the word or phrase first, then press this again.');
  P.exec('hiliteColor', '#FFE14D');
};
ST.cardMark = () => { if (MM.active()) return ONE.toast('On a mind map, give a topic sub-topics or a note. Those become the card.'); P.insertText(' :: '); };
})();
