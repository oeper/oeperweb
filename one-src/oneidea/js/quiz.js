/* oneIdea: quizzes. Builds questions straight from your notes (flashcard lines, bold and highlighted key terms, [question] lines
   with their bold answers, and multiple choice questions the AI added), then runs them as a practice quiz (feedback after every
   answer) or a timed exam (marked at the end). Wrong answers go to a mistakes notebook that comes back until they are right. */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const P = PG, MM = window.MM, ST = window.ST, QZ = window.QZ = {};

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const flat = s => String(s).replace(/\s+/g, ' ').trim();
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clip = (s, n) => { s = flat(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const sameText = (a, b) => flat(a).toLowerCase() === flat(b).toLowerCase();

/* ---------- saved quiz data (in the notebook, so it travels with it) ---------- */
const data = () => (N.nb.quiz = N.nb.quiz || { bank:[], missed:{}, history:[] });
QZ.data = data;

/* ---------- checking a typed answer ---------- */
const norm = s => flat(String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\b(the|a|an)\b/g, ' '));
const lev = (a, b) => { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let prev = Array.from({ length:n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
QZ.matches = (given, answer) => {
  const g = norm(given), a = norm(answer); if (!g) return false; if (g === a) return true;
  return a.length >= 5 && lev(g, a) <= Math.max(1, Math.floor(a.length * .12));
};

// A written answer is right when it carries most of the model answer's key words (any wording, any order).
const STOP = new Set('the and for with from into than then such can may will would could should not yes also but their there they them his her our your you are was were been its this that these those which who whom what when where why how'.split(' '));
const keys = s => norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w));
const stem = w => w.replace(/(ing|ed|es|s)$/, '');
QZ.looseMatch = (given, answer) => {
  const g = [...new Set(keys(given).map(stem))], a = [...new Set(keys(answer).map(stem))];
  if (!g.length || !a.length) return false;
  const hit = a.filter(w => g.includes(w) || g.some(x => x.length > 4 && w.length > 4 && lev(x, w) <= 1)).length;
  return hit / a.length >= (a.length <= 3 ? .99 : .55);
};
// Marks a written answer: with the epic AI panel's marker when there is one (it reads the meaning), otherwise by key words.
QZ.grade = async (q, given) => {
  const local = QZ.looseMatch(given, q.text) || QZ.matches(given, q.text);
  let g = null; try { g = window.parent && window.parent !== window ? window.parent.oneAIGrade : null; } catch {}
  if (g) { try { const r = await g(q.prompt, q.text, given); if (r && typeof r.ok === 'boolean') return r; } catch {} }
  return { ok:local, feedback:'' };
};

/* ---------- building questions from the notes ---------- */
const own = x => { const c = x.cloneNode(true); c.querySelectorAll('ul,ol').forEach(y => y.remove()); return flat(c.textContent); };
function distractors(correct, pool, n = 3) {
  const seen = new Set([norm(correct)]), out = [];
  const ranked = shuffle(pool.slice()).sort((a, b) => Math.abs(a.length - correct.length) - Math.abs(b.length - correct.length) + (Math.random() - .5) * 18);
  for (const p of ranked) { const k = norm(p); if (!k || seen.has(k)) continue; seen.add(k); out.push(p); if (out.length === n) break; }
  return out;
}
const mcq = (id, prompt, answer, pool, extra) => { const d = distractors(answer, pool); if (d.length < 2) return null; const options = shuffle([answer, ...d]); return Object.assign({ id, type:'mc', prompt, options, answer:options.indexOf(answer), text:answer }, extra); };

QZ.questionsFrom = (pages, types) => {
  const want = k => !types || types[k] !== false;
  const out = [], cards = ST.cardsFrom(pages), fronts = cards.map(c => c.front), backs = cards.map(c => clip(c.back, 140));
  // 1. one question per flashcard line: pick one of multiple choice (either way round), type the term, or true/false
  cards.forEach(c => {
    const opts = [];
    if (want('mc')) { opts.push(() => mcq('c' + c.id + 'a', `Which of these matches “${clip(c.front, 120)}”?`, clip(c.back, 140), backs, { page:c.page.id, card:c.id, explain:`${c.front}: ${clip(c.back, 220)}` })); if (c.front.length <= 60) opts.push(() => mcq('c' + c.id + 'b', `Which term fits this? ${clip(c.back, 200)}`, c.front, fronts, { page:c.page.id, card:c.id, explain:`${c.front}: ${clip(c.back, 220)}` })); }
    if (want('type') && c.front.length <= 50 && c.kind !== 'map') opts.push(() => ({ id:'c' + c.id + 't', type:'type', prompt:`Type the term for: ${clip(c.back, 220)}`, text:c.front, page:c.page.id, card:c.id, explain:`${c.front}: ${clip(c.back, 220)}` }));
    if (want('tf') && backs.length > 2 && c.back.length <= 140) opts.push(() => { const truth = Math.random() < .5, other = backs.filter(b => !sameText(b, clip(c.back, 140))); if (!truth && !other.length) return null; const shownBack = truth ? clip(c.back, 140) : other[Math.floor(Math.random() * other.length)]; return { id:'c' + c.id + 'f' + (truth ? 1 : 0), type:'tf', prompt:`“${clip(c.front, 100)}” means “${shownBack}”.`, answer:truth, text:truth ? 'True' : 'False', page:c.page.id, card:c.id, explain:`${c.front}: ${clip(c.back, 220)}` }; });
    const q = shuffle(opts).map(f => f()).find(Boolean); if (q) out.push(q);
  });
  // 2. key terms (bold or highlighted) inside a sentence become fill-in-the-blank questions; [question] lines with a bold answer become self-check questions
  const terms = [];
  const sentences = [];
  pages.forEach(pg => {
    if (pg.kind === 'map') return;
    pg.items.forEach(it => {
      const d = document.createElement('div'); d.innerHTML = it.html;
      d.querySelectorAll('p,li,blockquote,div').forEach(x => {
        if (x.tagName === 'DIV' && x.querySelector('p,li,div,ul,ol,table,blockquote')) return;
        const tag = x.dataset && x.dataset.tag;
        if (tag === 'question') {
          if (!want('self')) return;
          let q = own(x), a = '';
          const b = x.querySelector('b,strong'); if (b && flat(q.replace(b.textContent, '')).length > 8) { a = flat(b.textContent); q = flat(q.replace(b.textContent, '')); }
          else { const nx = x.nextElementSibling; if (nx) { const bb = nx.querySelector('b,strong'); if (bb) a = flat(nx.textContent); } }
          if (q && a) out.push({ id:'q' + hash(q), type:'self', prompt:q, text:a, page:pg.id, explain:'' });
          return;
        }
        const text = own(x); if (text.length < 30 || text.length > 320 || text.includes('::')) return;
        x.querySelectorAll('b,strong,[style*="background-color"]').forEach(h => { const t = flat(h.textContent); if (t.length >= 2 && t.length <= 60 && text.length - t.length >= 20 && !h.closest('table')) { terms.push(t); sentences.push({ text, term:t, page:pg.id }); } });
      });
    });
  });
  if (want('cloze') || want('mc')) {
    const pool = [...new Set(terms)], used = new Set();
    shuffle(sentences).forEach(s => {
      if (used.has(s.text) || s.text.split(s.term).length !== 2) return; used.add(s.text);
      const blank = s.text.replace(s.term, '_____'), id = 'k' + hash(s.text + s.term);
      const q = pool.length >= 4 && want('mc') ? mcq(id, `Fill in the blank: ${blank}`, s.term, pool, { page:s.page, explain:s.text }) : null;
      out.push(q || (want('cloze') ? { id, type:'type', prompt:`Fill in the blank: ${blank}`, text:s.term, page:s.page, explain:s.text } : null));
    });
  }
  return out.filter(Boolean);
};
// multiple choice questions the AI wrote (kept in the notebook)
QZ.bankFor = pages => { const ids = new Set(pages.map(p => p.id)); return data().bank.filter(b => !b.page || ids.has(b.page) || !N.find(b.page)).map(b => Object.assign({}, b)); };
QZ.addBank = (items, pageId) => {
  const d = data(), added = [];
  (Array.isArray(items) ? items : []).forEach(it => {
    const q = flat(it.q || it.question || ''), opts = (it.options || it.choices || []).map(o => flat(o)).filter(Boolean);
    // a written-answer question: the AI gives a model answer, and the student's own answer is marked against it
    if (it.type === 'short' || it.type === 'written' || (!opts.length && typeof it.answer === 'string' && it.answer.length > 1)) {
      const ans = flat(typeof it.answer === 'string' ? it.answer : (it.model || it.a || '')), wid = 'w' + hash(q);
      if (!q || ans.length < 2 || d.bank.some(b => b.id === wid)) return;
      const w = { id:wid, type:'self', prompt:q, text:ans, explain:flat(it.why || it.explain || it.explanation || ''), page:pageId || null, ai:true }; d.bank.push(w); added.push(w); return;
    }
    let a = typeof it.answer === 'number' ? it.answer : opts.findIndex(o => sameText(o, it.answer)); if (typeof it.answer === 'string' && /^[A-Da-d]$/.test(it.answer.trim())) a = it.answer.trim().toUpperCase().charCodeAt(0) - 65;
    if (!q || opts.length < 2 || opts.length > 6 || !(a >= 0 && a < opts.length)) return;
    const id = 'b' + hash(q); if (d.bank.some(b => b.id === id)) return;
    const x = { id, type:'mc', prompt:q, options:opts, answer:a, text:opts[a], explain:flat(it.why || it.explain || it.explanation || ''), page:pageId || null, ai:true }; d.bank.push(x); added.push(x);
  });
  if (added.length) N.dirty();
  return added;
};
QZ.removeBank = ids => { const d = data(); d.bank = d.bank.filter(b => !ids.includes(b.id)); N.dirty(); };

/* ---------- progress ---------- */
function record(q, ok) {
  const d = data(), m = d.missed; if (window.HUB && !q.card) HUB.tick();
  if (q.card && ST.rate) ST.rate({ id:q.card }, ok);
  if (ok) { const x = m[q.id]; if (x) { x.streak = (x.streak || 0) + 1; if (x.streak >= 2) delete m[q.id]; } }
  else { const x = m[q.id] = m[q.id] || { q:Object.assign({}, q), n:0 }; x.n++; x.streak = 0; x.q = Object.assign({}, q); x.last = Date.now(); }
}
QZ.stats = () => { const d = data(), h = d.history.slice(-5); return { missed:Object.keys(d.missed).length, attempts:d.history.length, recent:h, bank:d.bank.length }; };
QZ.weakTopics = () => Object.values(data().missed).sort((a, b) => b.n - a.n).slice(0, 8).map(x => clip(x.q.text || x.q.prompt, 60));

/* ---------- the quiz screen ---------- */
const SCOPES = [['page', 'This page'], ['section', 'This section'], ['notebook', 'Whole notebook']];
const pagesFor = k => k === 'page' ? [N.page()] : k === 'section' ? N.section().pages : N.nb.sections.flatMap(s => s.pages);
const TYPES = [['mc', 'Multiple choice'], ['type', 'Type the answer'], ['tf', 'True / false'], ['cloze', 'Fill the blank'], ['self', 'Self-check']];
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

QZ.open = (opts = {}) => {
  if ($('.fc')) return; P.syncAll();
  let scope = opts.scope || 'section', mode = opts.mode || 'practice', count = opts.count || 10, types = Object.assign({ mc:true, type:true, tf:true, cloze:true, self:true }, opts.types), minutes = 0;
  let session = null, timer = null;
  const ov = el('div', { class:'fc qz', tabindex:0, role:'dialog', 'aria-label':'Quiz' }), body = el('div', { class:'fc-body' });
  const bar = el('div', { class:'fc-bar' }, el('b', { text:'Quiz' }), el('span', { class:'grow' }));
  const clock = el('span', { class:'qz-clock', hidden:true }); bar.append(clock);
  const close = () => { clearInterval(timer); document.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(() => ov.remove(), 200); };
  bar.append(el('button', { class:'icon-btn', title:'Close (Esc)', 'aria-label':'Close', html:icon('close'), onclick:close })); ov.append(bar, body);
  const goTo = q => { if (!q.page || !N.find(q.page)) return; close(); N.goPage(q.page); };

  function pool() {
    const pgs = pagesFor(scope).filter(Boolean), ok = q => types[q.type === 'mc' && q.ai ? 'mc' : q.type === 'type' && /^k/.test(q.id) ? 'cloze' : q.type] !== false;
    return [...QZ.questionsFrom(pgs, types), ...QZ.bankFor(pgs)].filter(ok);
  }
  function start() {
    clearInterval(timer); clock.hidden = true; session = null; body.innerHTML = '';
    const all = pool(), d = data(), st = QZ.stats(), missedN = st.missed;
    body.append(el('div', { class:'seg' }, ...SCOPES.map(([k, t]) => el('button', { class:'seg-b' + (scope === k ? ' on' : ''), text:t, onclick:() => { scope = k; start(); } }))));
    body.append(el('div', { class:'fc-stats' }, el('div', {}, el('b', { text:String(all.length) }), el('small', { text:'questions ready' })), el('div', {}, el('b', { text:String(missedN) }), el('small', { text:'in mistakes' })), el('div', {}, el('b', { text:st.recent.length ? Math.round(st.recent.reduce((a, h) => a + h.correct / h.total, 0) / st.recent.length * 100) + '%' : '-' }), el('small', { text:'recent score' }))));
    if (!all.length && !missedN) {
      body.append(el('div', { class:'fc-empty' }, el('span', { class:'ms', html:'quiz' }), el('h2', { text:'Not enough to quiz on yet' }), el('p', { text:'Questions are made from your notes. Any of these gives the quiz something to work with:' }),
        el('ul', {}, el('li', { html:'Lines written as <b>Term :: meaning</b> (several of them, so wrong options can be made)' }), el('li', { html:'Key terms in <b>bold</b> or highlighted, inside full sentences' }), el('li', { html:'Lines tagged <b>Question</b> followed by the answer in bold' }), el('li', { html:'Ask epic AI to “make a multiple choice quiz” from this page' }))));
      return;
    }
    const seg = (items, cur, set) => el('div', { class:'seg' }, ...items.map(([k, t]) => el('button', { class:'seg-b' + (cur === k ? ' on' : ''), text:t, onclick:() => { set(k); start(); } })));
    body.append(el('div', { class:'qz-opts' },
      el('div', {}, el('small', { text:'Style' }), seg([['practice', 'Practice'], ['exam', 'Timed exam']], mode, v => { mode = v; })),
      el('div', {}, el('small', { text:'Questions' }), seg([[5, '5'], [10, '10'], [20, '20'], [999, 'All']], count, v => { count = v; }))));
    if (mode === 'exam') {
      const n = Math.min(count, all.length) || 1, def = Math.max(1, Math.round(n * 1)), inp = el('input', { type:'number', class:'tf', min:1, max:240, value:minutes || def, 'aria-label':'Minutes' });
      inp.oninput = () => { minutes = +inp.value || def; };
      body.append(el('div', { class:'qz-time' }, el('span', { text:'Time limit' }), inp, el('span', { text:'minutes. Answers are marked at the end, like a real exam.' })));
    }
    const chk = el('div', { class:'qz-types' }, ...TYPES.map(([k, t]) => ONE.check(t, types[k] !== false, { onchange:e => { types[k] = e.target.checked; const a = pool().length; go.disabled = !a; go.lastChild.nodeValue = ` Start (${Math.min(count, a)})`; } }).wrap));
    body.append(chk);
    const go = el('button', { class:'btn filled', html:`${icon('play_arrow')} Start (${Math.min(count, all.length)})`, disabled:!all.length, onclick:() => run(shuffle(pool()).slice(0, count), false) });
    const mis = el('button', { class:'btn tonal', disabled:!missedN, html:`${icon('replay')} Redo my mistakes (${missedN})`, onclick:() => run(shuffle(Object.values(d.missed).map(x => Object.assign({}, x.q))).slice(0, count), true) });
    body.append(el('div', { class:'fc-go' }, go, mis));
    if (d.bank.length) body.append(el('p', { class:'muted', html:`${d.bank.length} AI written question${d.bank.length === 1 ? '' : 's'} saved in this notebook. ` }, el('button', { class:'btn text', text:'Clear them', onclick:() => { QZ.removeBank(d.bank.map(b => b.id)); start(); } })));
    if (st.recent.length) body.append(el('div', { class:'qz-hist' }, el('small', { text:'Recent attempts' }), ...st.recent.slice().reverse().map(h => el('div', { class:'qz-h' }, el('span', { text:new Date(h.t).toLocaleDateString(undefined, { month:'short', day:'numeric' }) + ' · ' + (h.mode === 'exam' ? 'exam' : h.mistakes ? 'mistakes' : 'practice') }), el('b', { text:`${h.correct}/${h.total}` }), el('i', {}, el('u', { style:{ width:(h.correct / h.total * 100) + '%' } }))))));
  }

  function run(list, mistakes) {
    if (!list.length) return;
    session = { list, i:0, answers:[], mode:mode === 'exam' && !mistakes ? 'exam' : 'practice', mistakes, t0:Date.now(), limit:0 };
    if (session.mode === 'exam') { session.limit = (minutes || Math.max(1, list.length)) * 60; clock.hidden = false; tick(); timer = setInterval(tick, 500); }
    show();
  }
  function tick() { if (!session) return; const left = session.limit - (Date.now() - session.t0) / 1000; clock.textContent = fmt(left); clock.classList.toggle('low', left < 60); if (left <= 0) { clearInterval(timer); finish(true); } }

  function show() {
    const q = session.list[session.i]; body.innerHTML = '';
    if (!q) return finish(false);
    const n = session.list.length, last = session.i === n - 1, exam = session.mode === 'exam';
    body.append(el('div', { class:'fc-prog' }, el('i', { style:{ width:(session.i / n * 100) + '%' } })), el('small', { class:'fc-count', text:`Question ${session.i + 1} of ${n}` }));
    const card = el('div', { class:'qz-card' }, el('small', { class:'fc-side', text:{ mc:'Multiple choice', type:'Type the answer', tf:'True or false', self:'Written answer' }[q.type] || '' }), el('div', { class:'fc-text', text:q.prompt }));
    const area = el('div', { class:'qz-area' }), foot = el('div', { class:'fc-actions' });
    body.append(card, area, foot);
    let locked = false;
    const submit = (given, ok) => {
      if (locked) return; locked = true;
      session.answers.push({ q, given, ok });
      if (!exam) record(q, ok);
      if (exam) return advance();
      feedback(ok);
    };
    const advance = () => { session.i++; show(); };
    const nextBtn = () => el('button', { class:'btn filled', html:`${last ? 'See results' : 'Next'} <kbd>Enter</kbd>`, onclick:advance });
    const feedback = ok => {
      card.classList.add(ok ? 'right' : 'wrong');
      const msg = el('div', { class:'qz-fb ' + (ok ? 'ok' : 'no') }, el('span', { class:'ms', html:ok ? 'check_circle' : 'cancel' }), el('div', {}, el('b', { text:ok ? 'Correct' : 'Not quite' }), !ok ? el('div', { text:'Answer: ' + (q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.text) }) : null, q.explain ? el('small', { text:q.explain }) : null));
      area.append(msg); foot.innerHTML = ''; foot.append(nextBtn());
      if (q.page && N.find(q.page)) foot.append(el('button', { class:'btn text', html:`${icon('open_in_new')}Open the note`, onclick:() => goTo(q) }));
      const nb = foot.querySelector('.btn.filled'); nb && nb.focus();
    };
    if (q.type === 'mc') {
      q.options.forEach((o, k) => {
        const b = el('button', { class:'qz-opt', 'data-k':k }, el('kbd', { text:String(k + 1) }), el('span', { text:o }));
        b.onclick = () => { if (locked) return; const ok = k === q.answer; if (!exam) { $$('.qz-opt', area).forEach((x, j) => { x.disabled = true; x.classList.toggle('right', j === q.answer); if (j === k && !ok) x.classList.add('wrong'); }); } else b.classList.add('picked'); submit(o, ok); };
        area.append(b);
      });
    } else if (q.type === 'tf') {
      [true, false].forEach((v, k) => { const b = el('button', { class:'qz-opt', 'data-k':k }, el('kbd', { text:String(k + 1) }), el('span', { text:v ? 'True' : 'False' })); b.onclick = () => { if (locked) return; const ok = v === q.answer; if (!exam) $$('.qz-opt', area).forEach((x, j) => { x.disabled = true; x.classList.toggle('right', (j === 0) === q.answer); if (j === k && !ok) x.classList.add('wrong'); }); else b.classList.add('picked'); submit(v ? 'True' : 'False', ok); }; area.append(b); });
    } else if (q.type === 'type' && q.text.length <= 40) {
      const inp = el('input', { class:'tf qz-input', type:'text', placeholder:'Type your answer', autocomplete:'off', spellcheck:'false', 'aria-label':'Your answer' });
      const go = el('button', { class:'btn filled', text:exam ? (last ? 'Finish' : 'Next') : 'Check', onclick:() => { if (locked) return; const g = inp.value; const ok = QZ.matches(g, q.text); inp.disabled = true; submit(g, ok); } });
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go.click(); } };
      area.append(inp); foot.append(go); setTimeout(() => inp.focus(), 30);
    } else {
      // a written answer: the student writes it, and it is marked (by the AI when the panel is there, otherwise by key words)
      const inp = el('textarea', { class:'tf qz-input', rows:4, placeholder:'Write your answer in your own words', 'aria-label':'Your answer' });
      const check = el('button', { class:'btn filled', text:exam ? (last ? 'Finish' : 'Next') : 'Check my answer', onclick:async () => {
        if (locked) return; const g = inp.value.trim();
        if (!g) return ONE.toast('Write an answer first. If you do not know it, press I do not know.');
        if (exam) { locked = true; inp.disabled = true; const ok = QZ.looseMatch(g, q.text) || QZ.matches(g, q.text); session.answers.push({ q, given:g, ok }); return advance(); }
        locked = true; inp.disabled = true; check.disabled = true; check.textContent = 'Marking...';
        const r = await QZ.grade(q, g);
        locked = false; submit(g, r.ok);
        // submit() showed the right / not quite box: add the marker's comment inside it
        const fb = area.querySelector('.qz-fb > div'); if (fb && r.feedback) fb.append(el('div', { class:'qz-note', text:r.feedback }));
      } });
      const idk = el('button', { class:'btn text', text:'I do not know', onclick:() => { if (locked) return; locked = true; inp.disabled = true; session.answers.push({ q, given:'', ok:false }); record(q, false); exam ? advance() : feedback(false); } });
      area.append(inp); foot.append(check, idk); setTimeout(() => inp.focus(), 30);
    }
    if (exam) foot.append(el('button', { class:'btn text', text:'Skip', onclick:() => { if (locked) return; locked = true; session.answers.push({ q, given:'', ok:false, skipped:true }); advance(); } }));
    ov._q = { q, submit, locked:() => locked, advance, exam };
  }

  function finish(timeUp) {
    clearInterval(timer); clock.hidden = true;
    const s = session; if (!s) return;
    // anything unanswered when time ran out counts as wrong
    while (s.answers.length < s.list.length) s.answers.push({ q:s.list[s.answers.length], given:'', ok:false, skipped:true });
    if (s.mode === 'exam') s.answers.forEach(a => record(a.q, a.ok));
    const correct = s.answers.filter(a => a.ok).length, total = s.list.length, secs = (Date.now() - s.t0) / 1000;
    data().history.push({ t:Date.now(), scope, sec:scope === 'section' ? N.section().id : null, mode:s.mode, mistakes:!!s.mistakes, total, correct, secs:Math.round(secs) }); if (data().history.length > 60) data().history.shift(); N.dirty();
    const pct = Math.round(correct / total * 100), wrong = s.answers.filter(a => !a.ok);
    body.innerHTML = '';
    body.append(el('div', { class:'fc-empty' }, el('div', { class:'qz-score', style:{ '--p':pct } }, el('b', { text:pct + '%' })), el('h2', { text:pct >= 90 ? 'Excellent' : pct >= 70 ? 'Good work' : pct >= 50 ? 'Getting there' : 'Keep going' }),
      el('p', { text:`${correct} of ${total} right in ${fmt(secs)}${timeUp ? '. Time ran out' : ''}.` + (wrong.length ? ' The ones you missed are saved in your mistakes.' : '') }),
      el('div', { class:'fc-go' }, wrong.length ? el('button', { class:'btn filled', html:`${icon('replay')}Retry the ones I missed`, onclick:() => run(shuffle(wrong.map(a => Object.assign({}, a.q))), true) }) : null, el('button', { class:'btn tonal', text:'New quiz', onclick:start }), el('button', { class:'btn text', text:'Close', onclick:close }))));
    const list = el('div', { class:'qz-review' });
    s.answers.forEach((a, i) => { const q = a.q; list.append(el('div', { class:'qz-r ' + (a.ok ? 'ok' : 'no') }, el('span', { class:'ms', html:a.ok ? 'check_circle' : 'cancel' }), el('div', {}, el('b', { text:`${i + 1}. ${q.prompt}` }), el('div', { class:'muted', text:a.ok ? 'Your answer: ' + (a.given || 'right') : (a.skipped ? 'Skipped' : 'Your answer: ' + (a.given || 'not sure')) }), a.ok ? null : el('div', { text:'Answer: ' + (q.type === 'tf' ? (q.answer ? 'True' : 'False') : q.text) }), q.explain ? el('small', { class:'muted', text:q.explain }) : null, q.page && N.find(q.page) ? el('button', { class:'btn text', html:`${icon('open_in_new')}Open the note`, onclick:() => goTo(q) }) : null))); });
    body.append(list); session = null;
  }

  const key = e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); return close(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') return;
    if (!ov.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement !== ov) return e.stopPropagation();
    const c = session && ov._q; const typing = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (c && !typing) {
      if (/^[1-6]$/.test(e.key) && !c.locked()) { const b = $(`.qz-opt[data-k="${+e.key - 1}"]`, ov); if (b) { e.preventDefault(); e.stopPropagation(); b.click(); return; } }
      if (e.key === 'Enter' && c.locked() && !c.exam) { const nb = $('.fc-actions .btn.filled', ov); if (nb) { e.preventDefault(); e.stopPropagation(); nb.click(); return; } }
    }
    e.stopPropagation();
  };
  document.addEventListener('keydown', key, true);
  document.body.append(ov); start(); ov.focus();
  // opened straight from the AI: begin with exactly the questions it just wrote
  if (opts.ids) { const list = data().bank.filter(b => opts.ids.includes(b.id)).map(b => Object.assign({}, b)); if (list.length) run(shuffle(list), false); }
};
})();
