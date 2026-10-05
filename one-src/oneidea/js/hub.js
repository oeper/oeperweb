/* oneIdea: study hub. Exam dates with a countdown and a daily plan, progress per section, a focus timer that logs study time,
   and a printable revision sheet. Everything is kept in the notebook (N.nb.hub), so it travels with it. */
(() => {
'use strict';
const { $, $$, el, esc, icon } = ONE;
const P = PG, ST = window.ST, QZ = window.QZ, HUB = window.HUB = {};
const DAY = 864e5;

const hub = () => (N.nb.hub = Object.assign({ exams:[], days:{}, work:25, brk:5 }, N.nb.hub || {}));
const dkey = (t = Date.now()) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const day = k => { const h = hub(); return h.days[k] || (h.days[k] = { min:0, items:0 }); };
const fmtClock = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* ---------- activity log (feeds the streak) ---------- */
HUB.tick = () => { try { day(dkey()).items++; clearTimeout(HUB._t); HUB._t = setTimeout(() => N.dirty(), 1500); } catch {} };
const addMinutes = m => { if (m <= 0) return; day(dkey()).min += m; N.dirty(); };
const streak = () => { const h = hub(); let n = 0, t = Date.now(); if (!(h.days[dkey(t)] && (h.days[dkey(t)].items || h.days[dkey(t)].min))) t -= DAY; for (;;) { const d = h.days[dkey(t)]; if (d && (d.items || d.min)) { n++; t -= DAY; } else break; } return n; };

/* ---------- numbers per section ---------- */
const secPages = s => s.pages;
function secStats(s) {
  const cards = ST.cardsFrom(secPages(s)), prog = (N.nb.study && N.nb.study.cards) || {}, now = Date.now();
  const known = cards.filter(c => prog[c.id] && prog[c.id].box >= 4).length, due = cards.filter(c => !prog[c.id] || prog[c.id].due <= now).length;
  const ids = new Set(s.pages.map(p => p.id)), miss = Object.values(QZ.data().missed).filter(x => ids.has(x.q.page)).length;
  const hist = QZ.data().history.filter(h => h.sec === s.id), avg = hist.length ? Math.round(hist.slice(-5).reduce((a, h) => a + h.correct / h.total, 0) / Math.min(5, hist.length) * 100) : null;
  return { cards:cards.length, known, due, miss, avg, learn:cards.length - known };
}
const examDays = e => Math.ceil((new Date(e.date + 'T09:00:00').getTime() - Date.now()) / DAY);
const goSection = id => { const i = N.nb.sections.findIndex(s => s.id === id); if (i >= 0) N.go(i, 0); };

/* ---------- focus timer (lives outside the screen, so it keeps running while you study) ---------- */
const T = HUB.timer = { mode:'work', running:false, end:0, left:null, tag:'' };
const chip = el('button', { class:'hub-chip', hidden:true, title:'Focus timer. Click to open the study hub', onclick:() => HUB.open('focus') });
document.body.append(chip);
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .08; o.start(); setTimeout(() => { o.stop(); a.close(); }, 350); } catch {} }
const totalSecs = () => (T.mode === 'work' ? hub().work : hub().brk) * 60;
const remaining = () => T.running ? Math.max(0, (T.end - Date.now()) / 1000) : (T.left != null ? T.left : totalSecs());
let ticker = null;
function drawChip() { const on = T.running || (T.left != null && T.left < totalSecs()); chip.hidden = !on; chip.innerHTML = `${icon(T.mode === 'work' ? 'timer' : 'free_breakfast')}<b>${fmtClock(remaining())}</b>`; chip.classList.toggle('brk', T.mode !== 'work'); }
function finishPhase() {
  const worked = T.mode === 'work';
  if (worked) { addMinutes(hub().work); ONE.toast(`Focus session done: ${hub().work} minutes logged. Take a break.`); } else ONE.toast('Break over. Ready for the next focus session?');
  beep(); T.mode = worked ? 'brk' : 'work'; T.running = false; T.left = null; clearInterval(ticker); ticker = null; drawChip(); HUB.redraw && HUB.redraw();
}
function tickTimer() { if (T.running && remaining() <= 0) return finishPhase(); drawChip(); HUB.redrawClock && HUB.redrawClock(); }
HUB.start = () => { T.end = Date.now() + remaining() * 1000; T.running = true; T.left = null; if (!ticker) ticker = setInterval(tickTimer, 500); drawChip(); };
HUB.pause = () => { T.left = remaining(); T.running = false; clearInterval(ticker); ticker = null; drawChip(); };
HUB.reset = () => { if (T.mode === 'work' && T.left != null) { const done = Math.floor((totalSecs() - T.left) / 60); if (done >= 1) addMinutes(done); } T.running = false; T.left = null; clearInterval(ticker); ticker = null; drawChip(); };

/* ---------- printable revision sheet ---------- */
function revisionHTML(secs) {
  const parts = [];
  secs.forEach(s => {
    const cards = ST.cardsFrom(s.pages), must = [], tagged = [];
    s.pages.forEach(pg => { if (pg.kind === 'map') return; pg.items.forEach(it => { const d = document.createElement('div'); d.innerHTML = it.html; d.querySelectorAll('[data-tag]').forEach(x => { const t = x.dataset.tag, text = x.textContent.replace(/\s+/g, ' ').trim(); if (!text) return; if (t === 'remember' || (t === 'important' && text.length <= 200)) must.push(text.length > 240 ? text.slice(0, 239) + '…' : text); else if (t === 'formula') tagged.push(text); }); }); });
    if (!cards.length && !must.length && !tagged.length) return;
    parts.push(`<section><h2>${esc(s.name)}</h2>` +
      (must.length ? `<h3>Must remember</h3><ul>${must.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (tagged.length ? `<h3>Formulas</h3><ul>${tagged.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
      (cards.length ? `<h3>Key terms</h3><dl>${cards.map(c => `<dt>${esc(c.front)}</dt><dd>${esc(c.back).replace(/\n/g, '<br>')}</dd>`).join('')}</dl>` : '') + '</section>');
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Revision sheet</title><style>
    @page{size:A4;margin:12mm}body{font:11px/1.35 "Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0}
    h1{font-size:18px;margin:0 0 6px}section{break-inside:avoid-column;margin:0 0 10px}.cols{columns:2;column-gap:18px}
    h2{font-size:14px;margin:0 0 4px;padding-bottom:2px;border-bottom:2px solid #333}h3{font-size:11px;margin:6px 0 2px;text-transform:uppercase;letter-spacing:.06em;color:#555}
    ul{margin:0;padding-left:16px}li{margin:1px 0}dl{margin:0}dt{font-weight:700;margin-top:3px}dd{margin:0 0 1px 0;color:#222}
    </style></head><body><h1>Revision sheet: ${esc(N.nb.title || N.nb.name || 'Notebook')}</h1><div class="cols">${parts.join('') || '<p>Nothing to print yet. Add Term :: meaning lines, Must remember points or formulas to your notes.</p>'}</div></body></html>`;
}
HUB.printSheet = secs => {
  const w = window.open('', '_blank'); if (!w) return ONE.toast('Allow pop-ups for this page, then try again.');
  w.document.open(); w.document.write(revisionHTML(secs)); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400);
};

/* ---------- the screen ---------- */
HUB.open = (tab = 'today') => {
  const old = $('.fc.hubscr'); if (old) { old._show && old._show(tab); return; }
  if ($('.fc')) return; P.syncAll();
  let cur = tab;
  const ov = el('div', { class:'fc hubscr', tabindex:0, role:'dialog', 'aria-label':'Study hub' }), body = el('div', { class:'fc-body hub-body' });
  const close = () => { HUB.redraw = null; HUB.redrawClock = null; document.removeEventListener('keydown', key, true); ov.classList.add('out'); setTimeout(() => ov.remove(), 200); };
  ov.append(el('div', { class:'fc-bar' }, el('b', { text:'Study hub' }), el('span', { class:'grow' }), el('button', { class:'icon-btn', title:'Close (Esc)', 'aria-label':'Close', html:icon('close'), onclick:close })), body);
  const TABS = [['today', 'Today'], ['exams', 'Exams'], ['progress', 'Progress'], ['focus', 'Focus'], ['print', 'Print']];
  const bar = () => el('div', { class:'seg' }, ...TABS.map(([k, t]) => el('button', { class:'seg-b' + (cur === k ? ' on' : ''), text:t, onclick:() => { cur = k; draw(); } })));
  const go = (fn) => () => { close(); setTimeout(fn, 230); };
  const stat = (n, label) => el('div', {}, el('b', { text:String(n) }), el('small', { text:label }));

  function today() {
    const h = hub(), t = h.days[dkey()] || { min:0, items:0 }, up = h.exams.filter(e => examDays(e) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    body.append(el('div', { class:'fc-stats' }, stat(streak(), streak() === 1 ? 'day streak' : 'day streak'), stat(t.items, 'answered today'), stat(t.min, 'minutes focused')));
    if (!up.length) {
      body.append(el('div', { class:'fc-empty' }, el('span', { class:'ms', html:'event' }), el('h2', { text:'No exams added yet' }), el('p', { text:'Add your exam dates and I will work out what to study each day.' }), el('button', { class:'btn filled', text:'Add an exam', onclick:() => { cur = 'exams'; draw(); } })));
      const all = N.nb.sections.map(secStats), due = all.reduce((a, x) => a + x.due, 0), miss = all.reduce((a, x) => a + x.miss, 0);
      body.append(el('div', { class:'fc-go' }, el('button', { class:'btn tonal', disabled:!due, html:`${icon('style')} Cards due (${due})`, onclick:go(() => ST.open('notebook')) }), el('button', { class:'btn tonal', html:`${icon('quiz')} Quick quiz`, onclick:go(() => QZ.open({ scope:'notebook' })) }), el('button', { class:'btn tonal', disabled:!miss, html:`${icon('replay')} Mistakes (${miss})`, onclick:go(() => QZ.open({ scope:'notebook' })) })));
      return;
    }
    up.forEach(e => {
      const d = examDays(e), secs = N.nb.sections.filter(s => e.sections.includes(s.id)), st = secs.map(s => [s, secStats(s)]);
      const learn = st.reduce((a, [, x]) => a + x.learn, 0), perDay = Math.ceil(learn / Math.max(1, d)), miss = st.reduce((a, [, x]) => a + x.miss, 0);
      const advice = d <= 0 ? 'The exam is today. Do a last timed quiz and then rest.' : d <= 3 ? 'Final stretch: take a timed exam on each section, redo your mistakes and read your revision sheet.' : d <= 10 ? `Aim for about ${plural(perDay, 'card')} a day, plus a practice quiz every other day.` : `Plenty of time. About ${plural(perDay, 'card')} a day and one quiz per section each week keeps you on track.`;
      const card = el('div', { class:'hub-exam' }, el('div', { class:'hub-days' }, el('b', { text:d <= 0 ? 'Today' : String(d) }), el('small', { text:d <= 0 ? '' : d === 1 ? 'day left' : 'days left' })), el('div', { class:'hub-exam-main' }, el('h3', { text:e.name }), el('small', { class:'muted', text:new Date(e.date + 'T09:00:00').toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' }) }), el('p', { text:advice })));
      st.forEach(([s, x]) => card.querySelector('.hub-exam-main').append(el('div', { class:'hub-sec' }, el('span', { class:'hub-dot', style:{ background:s.color } }), el('span', { class:'grow', text:s.name }), el('small', { class:'muted', text:`${x.known}/${x.cards} known` + (x.miss ? `, ${x.miss} mistakes` : '') }),
        el('button', { class:'btn text', disabled:!x.cards, text:`Cards${x.due ? ' (' + x.due + ')' : ''}`, onclick:go(() => { goSection(s.id); ST.open('section'); }) }), el('button', { class:'btn text', text:'Quiz', onclick:go(() => { goSection(s.id); QZ.open({ scope:'section' }); }) }))));
      if (miss) card.querySelector('.hub-exam-main').append(el('small', { class:'muted', text:`${plural(miss, 'mistake')} to redo in these sections.` }));
      body.append(card);
    });
  }

  function exams() {
    const h = hub(), f = { name:'', date:'', sections:new Set() };
    const name = el('input', { class:'tf', type:'text', placeholder:'Exam name, for example Biology final', maxlength:60 }), date = el('input', { class:'tf', type:'date', min:dkey() });
    const secs = el('div', { class:'qz-types' }, ...N.nb.sections.map(s => ONE.check(s.name, false, { onchange:e => { e.target.checked ? f.sections.add(s.id) : f.sections.delete(s.id); } }).wrap));
    const add = el('button', { class:'btn filled', html:`${icon('add')} Add exam`, onclick:() => {
      if (!name.value.trim() || !date.value) return ONE.toast('Give the exam a name and a date.');
      if (!f.sections.size) return ONE.toast('Tick the sections it covers.');
      h.exams.push({ id:ONE.uid(), name:name.value.trim(), date:date.value, sections:[...f.sections] }); N.dirty(); cur = 'today'; draw();
    } });
    body.append(el('div', { class:'hub-form' }, el('small', { text:'New exam' }), name, date, el('small', { text:'Covers these sections' }), secs, add));
    if (h.exams.length) body.append(el('div', { class:'hub-list' }, el('small', { text:'Your exams' }), ...h.exams.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => el('div', { class:'hub-row' }, el('span', { class:'grow', html:`<b>${esc(e.name)}</b> <small class="muted">${new Date(e.date + 'T09:00:00').toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })}${examDays(e) < 0 ? ' (passed)' : ''}</small>` }), el('button', { class:'icon-btn', title:'Remove', 'aria-label':'Remove', html:icon('delete'), onclick:() => { h.exams = h.exams.filter(x => x.id !== e.id); N.dirty(); draw(); } })))));
  }

  function progress() {
    const h = hub(), rows = N.nb.sections.map(s => [s, secStats(s)]);
    const totalMin = Object.values(h.days).reduce((a, d) => a + d.min, 0), totalItems = Object.values(h.days).reduce((a, d) => a + d.items, 0);
    body.append(el('div', { class:'fc-stats' }, stat(Math.round(totalMin / 6) / 10, 'hours focused'), stat(totalItems, 'answers given'), stat(QZ.data().history.length, 'quizzes taken')));
    // the last two weeks
    const bars = el('div', { class:'hub-bars' }); let max = 1; const days = []; for (let i = 13; i >= 0; i--) { const k = dkey(Date.now() - i * DAY), d = h.days[k] || { items:0, min:0 }; days.push([k, d]); max = Math.max(max, d.items + d.min); }
    days.forEach(([k, d]) => bars.append(el('div', { class:'hub-bar', title:`${k}: ${d.items} answers, ${d.min} minutes` }, el('i', { style:{ height:Math.max(3, (d.items + d.min) / max * 64) + 'px' } }), el('small', { text:k.slice(8) }))));
    body.append(el('div', { class:'hub-list' }, el('small', { text:'Last 14 days' }), bars));
    body.append(el('div', { class:'hub-list' }, el('small', { text:'By section' }), ...rows.map(([s, x]) => el('div', { class:'hub-prog' }, el('div', { class:'hub-prog-h' }, el('span', { class:'hub-dot', style:{ background:s.color } }), el('b', { text:s.name }), el('small', { class:'muted grow', text:x.cards ? `${x.known} of ${x.cards} cards known` : 'no flashcards yet' }), x.avg != null ? el('small', { text:`quiz ${x.avg}%` }) : null),
      el('div', { class:'hub-meter' }, el('i', { style:{ width:(x.cards ? x.known / x.cards * 100 : 0) + '%' } })), x.due || x.miss ? el('small', { class:'muted', text:[x.due ? plural(x.due, 'card') + ' due' : '', x.miss ? plural(x.miss, 'mistake') : ''].filter(Boolean).join(', ') }) : null))));
    const weak = QZ.weakTopics(); if (weak.length) body.append(el('div', { class:'hub-list' }, el('small', { text:'Still getting wrong' }), ...weak.map(w => el('div', { class:'hub-row', text:w }))));
  }

  function focus() {
    const h = hub(), clock = el('div', { class:'hub-clock', text:fmtClock(remaining()) });
    HUB.redrawClock = () => { clock.textContent = fmtClock(remaining()); };
    const mk = (label, key) => { const i = el('input', { class:'tf', type:'number', min:1, max:120, value:h[key], 'aria-label':label }); i.onchange = () => { h[key] = Math.max(1, Math.min(120, +i.value || h[key])); T.left = null; N.dirty(); draw(); }; return el('label', { class:'hub-num' }, el('span', { text:label }), i); };
    body.append(el('div', { class:'hub-timer' }, el('small', { text:T.mode === 'work' ? 'Focus' : 'Break' }), clock,
      el('div', { class:'fc-go' }, T.running ? el('button', { class:'btn tonal', html:`${icon('pause')} Pause`, onclick:() => { HUB.pause(); draw(); } }) : el('button', { class:'btn filled', html:`${icon('play_arrow')} ${T.left != null && T.left < totalSecs() ? 'Resume' : 'Start'}`, onclick:() => { HUB.start(); draw(); } }),
        el('button', { class:'btn text', text:'Reset', onclick:() => { HUB.reset(); draw(); } }),
        el('button', { class:'btn text', text:T.mode === 'work' ? 'Skip to break' : 'Skip break', onclick:() => { HUB.reset(); T.mode = T.mode === 'work' ? 'brk' : 'work'; draw(); } })),
      el('div', { class:'qz-opts' }, mk('Focus minutes', 'work'), mk('Break minutes', 'brk')),
      el('p', { class:'muted', text:'The timer keeps running while you study. Finished focus sessions are added to your study time. Close this screen and a small timer stays in the corner.' })));
  }

  function print() {
    let which = 'section';
    const draw2 = () => {
      const sw = el('div', { class:'seg' }, ...[['section', 'This section'], ['notebook', 'Whole notebook']].map(([k, t]) => el('button', { class:'seg-b' + (which === k ? ' on' : ''), text:t, onclick:() => { which = k; draw(); } })));
      return sw;
    };
    const secs = which === 'section' ? [N.section()] : N.nb.sections;
    body.append(el('div', { class:'fc-empty' }, el('span', { class:'ms', html:'print' }), el('h2', { text:'Revision sheet' }), el('p', { text:'A compact two column cheat sheet: your Must remember points, formulas and every Term :: meaning line. Use your browser’s Save as PDF to keep a copy.' }), draw2(),
      el('button', { class:'btn filled', html:`${icon('print')} Print the sheet`, onclick:() => HUB.printSheet(secs) })));
    which = which; // keeps the choice while the screen is open
  }

  function draw() { body.innerHTML = ''; body.append(bar()); ({ today, exams, progress, focus, print })[cur](); HUB.redraw = ov.isConnected ? draw : null; }
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); return close(); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') return; if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return e.stopPropagation(); e.stopPropagation(); };
  ov._show = t => { cur = t; draw(); };
  document.addEventListener('keydown', key, true);
  document.body.append(ov); draw(); ov.focus();
};
})();
