/* oneLang — the app: text, documents, pictures, websites, conversation; history and saved phrases. */
(() => {
'use strict';
const { $, $$, el, esc, icon, store } = ONE;
ONE.boot('ol', 'lang');

/* ---------- state ---------- */
const KEY = 'ol-state';
const defTo = (() => { const n = LANG.norm((navigator.language || 'en').split('-')[0]); return n && n !== 'en' ? n : 'es'; })();
const S = Object.assign({ from:LANG.AUTO, to:defTo, tone:'standard', engine:'auto', instant:true, recent:[], hist:[], saved:[], talkVoice:true }, store.get(KEY, {}));
if (!['auto', 'ai', 'server'].includes(S.engine)) S.engine = 'auto';
ENG.mode = S.engine;
if (S.from !== LANG.AUTO && !LANG.by[S.from]) S.from = LANG.AUTO;
if (!LANG.by[S.to]) S.to = defTo;
const keep = () => { S.hist = S.hist.slice(0, 200); S.saved = S.saved.slice(0, 1000); S.recent = S.recent.slice(0, 6); store.set(KEY, S); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const say = m => ONE.toast(m);
const nameOf = c => c === LANG.AUTO ? 'Detect language' : LANG.name(c);
let detected = null;      // language the text turned out to be in (auto mode)
let tab = 'text';

const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { const a = el('textarea', { style:{ position:'fixed', opacity:0 } }); a.value = t; document.body.append(a); a.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} a.remove(); return ok; } };
const when = t => { const d = Date.now() - t; if (d < 60000) return 'Just now'; if (d < 3600000) return Math.floor(d / 60000) + ' min ago'; if (d < 86400000) return Math.floor(d / 3600000) + ' h ago'; return new Date(t).toLocaleDateString(undefined, { month:'short', day:'numeric' }); };
const errText = err => err.limit ? err.message + ' You can try again later, or get more with oeper+ (oeper.dev/plus).' : err.message || 'Something went wrong.';
const srcLang = () => S.from === LANG.AUTO ? detected : S.from;

/* ---------- language bar ---------- */
function renderLangs(){
  $('#fromName').textContent = S.from === LANG.AUTO && detected ? LANG.name(detected) + ' – detected' : nameOf(S.from);
  $('#toName').textContent = LANG.name(S.to);
  $('#tone').value = S.tone;
  const dir = LANG.rtl(srcLang() || '') ? 'rtl' : 'auto'; $('#src').dir = dir;
  $('#out').dir = LANG.rtl(S.to) ? 'rtl' : 'ltr';
  $('#swapBtn').disabled = S.from === LANG.AUTO && !detected;
  $('#micAName').textContent = LANG.name(talkLangs().a); $('#micBName').textContent = LANG.name(talkLangs().b); $('#talkSendAName').textContent = LANG.name(talkLangs().a);
  $('#outLabel').textContent = LANG.name(S.to);
  keep();
}
function setFrom(c){ S.from = c; detected = null; if (c !== LANG.AUTO) bump(c); $('#detected').hidden = true; renderLangs(); retranslate(); }
function setTo(c){ if (c === S.from && S.from !== LANG.AUTO) { swap(); return; } S.to = c; bump(c); renderLangs(); retranslate(); }
function bump(c){ S.recent = [c, ...S.recent.filter(x => x !== c)].slice(0, 6); }
function swap(){
  let nf = S.from; if (nf === LANG.AUTO) { if (!detected) return say('Type something first so the language can be detected.'); nf = detected; }
  const oldTo = S.to, outT = lastResult && lastResult.text ? lastResult.text : '';
  S.from = oldTo; S.to = nf; detected = null; $('#detected').hidden = true;
  const b = $('#swapBtn'); b.classList.add('spin'); setTimeout(() => b.classList.remove('spin'), 350);
  if (outT) $('#src').value = outT;
  renderLangs(); onInput(true);
}

/* picker */
let pickFor = null;
function openPicker(which){
  pickFor = which; const pk = $('#picker'); pk.hidden = false; $('#pkIn').value = ''; drawPicker(); setTimeout(() => $('#pkIn').focus(), 30);
}
function closePicker(){ $('#picker').hidden = true; pickFor = null; }
function drawPicker(){
  const q = $('#pkIn').value.trim().toLowerCase(), cur = pickFor === 'from' ? S.from : S.to, body = $('#pkBody'); body.innerHTML = '';
  const match = l => !q || l.name.toLowerCase().includes(q) || l.own.toLowerCase().includes(q) || l.code.toLowerCase() === q;
  const item = (code, label, own) => { const b = el('button', { class:'pk-item' + (code === cur ? ' cur' : ''), 'data-code':code, onclick:() => { closePicker(); pickFor === 'from' ? setFrom(code) : setTo(code); } },
    el('span', { class:'ms', html:code === cur ? 'check' : '' }), el('span', { text:label }), own && own !== label ? el('small', { text:own }) : null); return b; };
  const sec = (t, items) => { if (!items.length) return; body.append(el('div', { class:'pk-sec', text:t }), el('div', { class:'pk-grid' }, items)); };
  if (pickFor === 'from' && (!q || 'detect language'.includes(q))) sec('', [item(LANG.AUTO, 'Detect language')]);
  if (!q) sec('Recent', S.recent.filter(c => LANG.by[c]).map(c => item(c, LANG.name(c), LANG.by[c].own)));
  const all = LANG.list.filter(match);
  sec(q ? 'Languages' : 'All languages', all.map(l => item(l.code, l.name, l.own)));
  if (!body.children.length) body.append(el('div', { class:'empty', text:'No language matches “' + $('#pkIn').value + '”.' }));
  const first = $('.pk-item', body); if (q && first) first.classList.add('kb');
}
$('#pkIn').addEventListener('input', drawPicker);
$('#pkIn').addEventListener('keydown', e => { if (e.key === 'Enter') { const k = $('#pkBody .pk-item.kb') || $('#pkBody .pk-item'); if (k) k.click(); } });
$('#pkClose').onclick = closePicker;
$('#picker').addEventListener('mousedown', e => { if (e.target === $('#picker')) closePicker(); });
$('#fromBtn').onclick = () => openPicker('from'); $('#toBtn').onclick = () => openPicker('to'); $('#swapBtn').onclick = swap;
$('#tone').onchange = e => { S.tone = e.target.value; keep(); retranslate(); };
/* translator: auto / epic AI / the free server (NLLB on oeper's own machine) */
const serverLikely = () => S.engine !== 'ai' && ENG.srvCan(S.from, S.to);
async function checkServer(force){
  await ENG.srvCheck(force);
  const sel = $('#engine'); if (!sel) return;
  const off = !ENG.srv.online, o = sel.options;
  o[0].text = 'Auto' + (off ? '' : ' (free server for documents)'); o[1].text = 'epic AI (best quality)'; o[2].text = 'Free server (unlimited)' + (off ? ' – offline' : '');
  sel.value = S.engine;
}
$('#engine').value = S.engine;
$('#engine').onchange = e => { S.engine = e.target.value; ENG.mode = S.engine; keep(); if (S.engine !== 'ai') checkServer(true).then(() => { if (S.engine === 'server' && !ENG.srv.online) say('The free translator is offline right now, so epic AI will be used.'); }); retranslate(); };
const byNote = r => { if (!r) return ''; const a = r.byServer || 0, b = r.byAI || 0; return a && b ? a.toLocaleString() + ' pieces by the free translator, ' + b.toLocaleString() + ' by epic AI.' : a ? 'Translated by the free translator (no epic AI usage).' : ''; };

/* ---------- tabs ---------- */
function showTab(t){
  tab = t; $$('.tab').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  ['text', 'docs', 'image', 'web', 'talk'].forEach(k => { $('#p-' + k).hidden = k !== t; });
  $('#langbar').hidden = false; $('#tone').closest('label').hidden = t === 'talk';
  if (t === 'talk') renderLangs();
  if (t === 'text') setTimeout(() => $('#src').focus(), 30);
}
$$('.tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));

/* ---------- text translation ---------- */
let lastResult = null, ctl = null, timer = null, histTimer = null, extrasCtl = null, seq = 0;
const srcEl = $('#src'), outEl = $('#out');
function autosize(){ srcEl.style.height = 'auto'; srcEl.style.height = Math.max(150, Math.min(srcEl.scrollHeight, 520)) + 'px'; }
function onInput(now){
  const t = srcEl.value; $('#count').textContent = t.length.toLocaleString() + ' / 5,000'; $('#count').classList.toggle('warn', t.length > 4800);
  $('#clearBtn').hidden = !t; autosize();
  if (S.from === LANG.AUTO) { const g = LANG.guess(t); if (g) { detected = g; renderLangs(); } else if (!t.trim()) { detected = null; renderLangs(); } }
  clearTimeout(timer);
  if (!t.trim()) { cancel(); clearOut(); return; }
  $('#goBtn').hidden = S.instant;
  if (S.instant) timer = setTimeout(run, now === true ? 0 : 500);
}
function cancel(){ if (ctl) { ctl.abort(); ctl = null; } if (extrasCtl) { extrasCtl.abort(); extrasCtl = null; } $('#busy').hidden = true; outEl.classList.remove('streaming'); }
function clearOut(){ outEl.textContent = ''; lastResult = null; $('#err').hidden = true; $('#didyou').hidden = true; $('#extras').hidden = true; $('#srcRom').hidden = true; $('#outRom').hidden = true; $('#detected').hidden = true; $('#saveBtn').classList.remove('starred'); }
function retranslate(){ if (tab === 'text' && srcEl.value.trim()) { clearTimeout(timer); timer = setTimeout(run, 80); } }
async function run(){
  const text = srcEl.value.trim(); if (!text) return;
  cancel(); const my = ++seq; ctl = new AbortController();
  $('#err').hidden = true; $('#busy').hidden = false; outEl.classList.add('streaming'); $('#extras').hidden = true;
  try {
    const r = await ENG.translate(text, S.from, S.to, { tone:S.tone, signal:ctl.signal, onPartial:p => { if (my !== seq) return; outEl.textContent = p.text; if (p.lang && S.from === LANG.AUTO) { detected = p.lang; $('#fromName').textContent = LANG.name(p.lang) + ' – detected'; } } });
    if (my !== seq) return;
    lastResult = { text:r.text, from:S.from === LANG.AUTO ? (r.lang || detected) : S.from, to:S.to, src:text };
    if (S.from === LANG.AUTO && r.lang) { detected = r.lang; }
    outEl.textContent = r.text; outEl.classList.remove('streaming'); $('#busy').hidden = true; ctl = null; $('#outLabel').textContent = LANG.name(S.to) + (r.by === 'server' ? ' · free translator' : '');
    renderLangs(); showFix(r.fix, text); markSaved(); scheduleHistory(); loadExtras(text, r.text, my);
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (my !== seq) return;
    outEl.classList.remove('streaming'); $('#busy').hidden = true; ctl = null;
    const box = $('#err'); box.hidden = false; box.textContent = errText(err); box.append(el('button', { text:'Try again', onclick:run }));
  }
}
function showFix(fix, text){
  const d = $('#didyou'); if (!fix || fix.trim() === text.trim()) { d.hidden = true; return; }
  d.hidden = false; d.innerHTML = 'Did you mean: '; d.append(el('button', { text:fix, onclick:() => { srcEl.value = fix; onInput(true); } }));
}
function scheduleHistory(){
  clearTimeout(histTimer); const snap = lastResult; if (!snap) return;
  histTimer = setTimeout(() => { if (!lastResult || lastResult.src !== snap.src) return; addHistory(snap); }, 2500);
}
function addHistory(r){
  S.hist = S.hist.filter(h => !(h.src === r.src && h.to === r.to));
  S.hist.unshift({ id:uid(), src:r.src, out:r.text, from:r.from || LANG.AUTO, to:r.to, t:Date.now() }); keep(); if (!$('#side').hidden) drawSide();
}
const isSaved = r => !!r && S.saved.some(s => s.src === r.src && s.to === r.to);
function markSaved(){ $('#saveBtn').classList.toggle('starred', isSaved(lastResult)); }

/* dictionary, examples and romanization: only for short phrases / non-Latin scripts */
async function loadExtras(src, out, my){
  const f = srcLang(), words = src.trim().split(/\s+/).length, short = src.length <= 40 && words <= 2 && !/\n/.test(src);
  const srcRom = !!f && LANG.nonLatin(f) && src.length <= 400, outRom = LANG.nonLatin(S.to) && out.length <= 400;
  $('#srcRom').hidden = !srcRom; $('#outRom').hidden = !outRom; $('#srcRom').textContent = ''; $('#outRom').textContent = '';
  if (!short && !srcRom && !outRom) return;
  const box = $('#extras');
  if (short) { box.hidden = false; box.innerHTML = '<div class="skel" style="width:40%"></div><div class="skel" style="width:90%"></div><div class="skel" style="width:70%"></div>'; }
  extrasCtl = new AbortController();
  try {
    const x = await ENG.extras(src, out, S.from === LANG.AUTO ? (f || LANG.AUTO) : S.from, S.to, { dict:short, srcRom, outRom, signal:extrasCtl.signal });
    if (my !== seq) return;
    if (x && srcRom && x.src_rom) { $('#srcRom').textContent = x.src_rom; }
    if (x && outRom && x.out_rom) { $('#outRom').textContent = x.out_rom; }
    $('#srcRom').hidden = !($('#srcRom').textContent); $('#outRom').hidden = !($('#outRom').textContent);
    if (short) drawExtras(x, src);
  } catch (err) { if (err.name !== 'AbortError' && short && my === seq) box.hidden = true; }
}
function drawExtras(x, src){
  const box = $('#extras'); box.innerHTML = '';
  const poss = x && x.dict && Array.isArray(x.dict.pos) ? x.dict.pos : [];
  const exs = x && Array.isArray(x.examples) ? x.examples.filter(e => e && e.src) : [];
  if (!poss.length && !exs.length) { box.hidden = true; return; }
  poss.slice(0, 3).forEach(p => {
    const sec = el('div', {}, el('h3', { text:'Translations of ' + src.trim() }), el('div', { class:'pos', text:String(p.pos || '') }));
    (p.translations || []).slice(0, 5).forEach(t => {
      const n = Math.max(1, Math.min(3, Number(t.freq) || 1));
      sec.append(el('div', { class:'tr-row' }, el('b', { text:String(t.word || '') }), el('span', { class:'back', text:(t.back || []).slice(0, 3).join(', ') }),
        el('span', { class:'bars', title:['Uncommon', 'Common', 'Very common'][n - 1] }, [1, 2, 3].map(i => el('i', { class:i <= n ? 'on' : '' })))));
    });
    (p.meanings || []).slice(0, 2).forEach(m => sec.append(el('div', { class:'def' }, document.createTextNode(String(m.def || '')), m.example ? el('q', { text:String(m.example) }) : null, m.syn && m.syn.length ? el('span', { class:'syn', text:'Synonyms: ' + m.syn.slice(0, 4).join(', ') }) : null)));
    box.append(sec);
  });
  if (exs.length) { const s = el('div', {}, el('h3', { text:'Examples' })); exs.slice(0, 3).forEach(e => s.append(el('div', { class:'ex' }, el('span', { text:String(e.src) }), el('span', { text:String(e.tgt || '') })))); box.append(s); }
  box.hidden = false;
}

srcEl.addEventListener('input', () => onInput());
srcEl.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); clearTimeout(timer); run(); } });
$('#goBtn').onclick = () => { clearTimeout(timer); run(); };
$('#instant').checked = S.instant; $('#goBtn').hidden = S.instant;
$('#instant').onchange = e => { S.instant = e.target.checked; $('#goBtn').hidden = S.instant; keep(); if (S.instant && srcEl.value.trim()) run(); };
$('#clearBtn').onclick = () => { srcEl.value = ''; onInput(); srcEl.focus(); detected = null; renderLangs(); };
$('#redoBtn').onclick = () => { if (srcEl.value.trim()) { const l = ENG.cacheKey(srcEl.value.trim(), S.from, S.to, S.tone); ENG.forget && ENG.forget(l); run(); } };
$('#copyBtn').onclick = async () => { if (!lastResult) return; say(await copyText(lastResult.text) ? 'Translation copied.' : 'Couldn’t copy.'); };
$('#saveBtn').onclick = () => {
  if (!lastResult) return; const i = S.saved.findIndex(s => s.src === lastResult.src && s.to === lastResult.to);
  if (i >= 0) { S.saved.splice(i, 1); say('Removed from saved.'); } else { S.saved.unshift({ id:uid(), src:lastResult.src, out:lastResult.text, from:lastResult.from || LANG.AUTO, to:lastResult.to, t:Date.now() }); say('Saved to your phrasebook.'); }
  keep(); markSaved(); if (!$('#side').hidden) drawSide();
};
$('#shareBtn').onclick = async () => {
  if (!lastResult) return; const t = lastResult.text;
  if (navigator.share) { try { await navigator.share({ text:t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  say(await copyText(t) ? 'Translation copied. Paste it where you want to share it.' : 'Couldn’t share.');
};
$('#outListen').onclick = e => listenBtn(e.currentTarget, lastResult && lastResult.text, S.to);
$('#srcListen').onclick = e => listenBtn(e.currentTarget, srcEl.value.trim(), srcLang());
function listenBtn(btn, text, lang){
  if (!text) return;
  if (btn.classList.contains('on')) { VOICE.stop(); return; }
  $$('.icon-btn.on').forEach(b => b.classList.remove('on')); VOICE.stop();
  if (!lang) return say('Language not detected yet.');
  if (!VOICE.canSpeak) return say('This browser can’t read text aloud.');
  const ok = VOICE.speak(text, lang, { onEnd:() => btn.classList.remove('on') });
  if (!ok) return say('This device has no ' + LANG.name(lang) + ' voice.');
  btn.classList.add('on');
}
/* voice input */
let micOn = false;
$('#micBtn').onclick = () => {
  const b = $('#micBtn');
  if (micOn) { VOICE.stopListening(); return; }
  if (!VOICE.canListen) return say('This browser can’t listen. Try Chrome, Edge or Safari.');
  micOn = true; b.classList.add('rec'); const before = srcEl.value ? srcEl.value.trimEnd() + ' ' : '';
  VOICE.listen(S.from, { onText:(t) => { srcEl.value = before + t; onInput(true); }, onEnd:() => { micOn = false; b.classList.remove('rec'); clearTimeout(timer); if (srcEl.value.trim()) run(); }, onError:e => say(e.message) });
};
/* handwriting */
const hw = { strokes:[], cur:null, t:null, text:'' };
(() => {
  const cv = $('#hwCanvas'), cx = cv.getContext('2d');
  const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--on-surface') || '#000';
  const redraw = () => { cx.clearRect(0, 0, cv.width, cv.height); cx.lineWidth = 5; cx.lineCap = cx.lineJoin = 'round'; cx.strokeStyle = getComputedStyle(cv).color || '#000'; hw.strokes.forEach(s => { cx.beginPath(); s.forEach((p, i) => i ? cx.lineTo(p[0], p[1]) : cx.moveTo(p[0], p[1])); if (s.length === 1) cx.lineTo(s[0][0] + .1, s[0][1]); cx.stroke(); }); };
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); clearTimeout(hw.t); hw.cur = [pt(e)]; hw.strokes.push(hw.cur); redraw(); });
  cv.addEventListener('pointermove', e => { if (!hw.cur) return; hw.cur.push(pt(e)); redraw(); });
  const end = () => { if (!hw.cur) return; hw.cur = null; clearTimeout(hw.t); hw.t = setTimeout(read, 1300); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  async function read(){
    if (!hw.strokes.length) return;
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height; const o = off.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, off.width, off.height);
    o.strokeStyle = '#000'; o.lineWidth = 7; o.lineCap = o.lineJoin = 'round'; hw.strokes.forEach(s => { o.beginPath(); s.forEach((p, i) => i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1])); if (s.length === 1) o.lineTo(s[0][0] + .1, s[0][1]); o.stroke(); });
    $('#hwHint').textContent = 'Reading…';
    try { const t = await ENG.ocr(off.toDataURL('image/png')); hw.text = t; $('#hwHint').textContent = t ? '“' + t.slice(0, 120) + '”' : 'I couldn’t read that. Try writing bigger.'; $('#hwUse').disabled = !t; }
    catch (err) { $('#hwHint').textContent = errText(err); }
  }
  $('#hwClear').onclick = () => { hw.strokes = []; hw.text = ''; redraw(); $('#hwUse').disabled = true; $('#hwHint').textContent = 'Write with your finger, a pen or the mouse. It is read when you stop.'; };
  $('#hwClose').onclick = () => { $('#hw').hidden = true; };
  $('#hwUse').onclick = () => { if (!hw.text) return; srcEl.value = (srcEl.value ? srcEl.value.trimEnd() + ' ' : '') + hw.text; $('#hw').hidden = true; $('#hwClear').click(); onInput(true); srcEl.focus(); };
  $('#hwBtn').onclick = () => { $('#hw').hidden = false; redraw(); };
  $('#hw').addEventListener('mousedown', e => { if (e.target === $('#hw')) $('#hw').hidden = true; });
  new MutationObserver(redraw).observe(document.documentElement, { attributes:true });
})();

/* recent translations under the cards */
function drawRecent(){
  const box = $('#recentText'); box.innerHTML = '';
  S.hist.slice(0, 4).forEach(h => box.append(el('button', { class:'rchip', title:'Open', onclick:() => openEntry(h) }, el('span', { text:h.src }), el('small', { text:h.out }))));
}
function openEntry(h){
  showTab('text'); S.from = h.from && LANG.by[h.from] ? h.from : LANG.AUTO; S.to = h.to; detected = null; srcEl.value = h.src; renderLangs(); onInput(true);
  if (innerWidth <= 860) $('#side').hidden = true;
}

/* ---------- side panel: history + saved ---------- */
let sideTab = 'hist';
function toggleSide(force){ const s = $('#side'); s.hidden = force == null ? !s.hidden : !force; if (!s.hidden) drawSide(); }
function drawSide(){
  const q = $('#sideSearch').value.trim().toLowerCase(), list = (sideTab === 'hist' ? S.hist : S.saved).filter(h => !q || h.src.toLowerCase().includes(q) || h.out.toLowerCase().includes(q));
  const body = $('#sideBody'); body.innerHTML = '';
  $$('#sideTabs button').forEach(b => b.classList.toggle('on', b.dataset.s === sideTab));
  if (!list.length) { body.append(el('div', { class:'empty', text:q ? 'Nothing matches.' : sideTab === 'hist' ? 'Your translations will show up here.' : 'Tap the star under a translation to keep it here.' })); return; }
  list.forEach(h => {
    const x = el('span', { class:'x', role:'button', tabindex:0, title:'Delete', 'aria-label':'Delete', html:icon('close'), onclick:e => { e.stopPropagation(); const arr = sideTab === 'hist' ? S.hist : S.saved; arr.splice(arr.indexOf(h), 1); keep(); markSaved(); drawSide(); drawRecent(); } });
    body.append(el('div', { class:'hi', role:'button', tabindex:0, onclick:() => openEntry(h), onkeydown:e => { if (e.key === 'Enter') openEntry(h); } },
      el('span', { class:'gr' }, el('small', { text:(h.from === LANG.AUTO ? 'Detected' : LANG.name(h.from)) + ' → ' + LANG.name(h.to) + ' · ' + when(h.t) }), el('span', { class:'t', text:h.src }), el('span', { class:'s', text:h.out })), x));
  });
}
$$('#sideTabs button').forEach(b => b.onclick = () => { sideTab = b.dataset.s; drawSide(); });
$('#sideSearch').addEventListener('input', drawSide);
$('#sideClose').onclick = () => toggleSide(false);
$('#sideMenu').onclick = e => ONE.menuAt(e.currentTarget, [
  { label:'Download saved phrases (.csv)', icon:'download', disabled:!S.saved.length, on:() => {
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const rows = [['Original', 'Translation', 'From', 'To', 'Saved'], ...S.saved.map(s => [s.src, s.out, LANG.name(s.from), LANG.name(s.to), new Date(s.t).toISOString()])];
    ONE.download('oneLang saved phrases.csv', '﻿' + rows.map(r => r.map(q).join(',')).join('\n'), 'text/csv'); } },
  '-',
  { label:'Clear history', icon:'delete', danger:true, disabled:!S.hist.length, on:() => { S.hist = []; keep(); drawSide(); drawRecent(); } },
  { label:'Clear saved', icon:'delete_forever', danger:true, disabled:!S.saved.length, on:() => { S.saved = []; keep(); markSaved(); drawSide(); } },
]);

/* ---------- documents ---------- */
const docJob = $('#docJob'); let docCtl = null;
const sizeOf = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
$('#docPick').onclick = e => { e.stopPropagation(); $('#docInput').accept = DOC.accept; $('#docInput').click(); };
$('#docDrop').onclick = () => $('#docPick').click();
$('#docDrop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#docPick').click(); } });
$('#docInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadDoc(f); };
wireDrop($('#docDrop'), fs => fs[0] && loadDoc(fs[0]));
function wireDrop(zone, cb){
  ['dragenter', 'dragover'].forEach(n => zone.addEventListener(n, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(n => zone.addEventListener(n, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => { const fs = [...(e.dataTransfer && e.dataTransfer.files || [])]; if (fs.length) cb(fs); });
}
/* remembered translations: a document stopped by the daily limit (or cancelled) picks up where it left off, and the same sentence is never paid for twice */
const Cache = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise(ok => { try { const r = indexedDB.open('onelang', 1); r.onupgradeneeded = () => r.result.createObjectStore('tr'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch { ok(null); } }));
  return {
    async getMany(keys) {
      const db = await open(), out = new Map(); if (!db || !keys.length) return out;
      await new Promise(done => { const st = db.transaction('tr').objectStore('tr'); let left = keys.length; keys.forEach(k => { const q = st.get(k); q.onsuccess = () => { if (q.result != null) out.set(k, q.result); if (!--left) done(); }; q.onerror = () => { if (!--left) done(); }; }); });
      return out;
    },
    async putMany(entries) {
      const db = await open(); if (!db || !entries.length) return;
      await new Promise(done => { const tx = db.transaction('tr', 'readwrite'), st = tx.objectStore('tr'); entries.forEach(([k, v]) => st.put(v, k)); tx.oncomplete = tx.onerror = tx.onabort = () => done(); });
    },
    async clear() { const db = await open(); if (!db) return; await new Promise(done => { const tx = db.transaction('tr', 'readwrite'); tx.objectStore('tr').clear(); tx.oncomplete = tx.onerror = () => done(); }); },
  };
})();
/* translate many pieces: what was translated before comes from the cache, the rest goes to the translator (which waits out "too many requests" by itself) */
async function translateAll(segs, { signal, onProgress, onWait } = {}) {
  const from = S.from, to = S.to, tone = S.tone, kf = c => from + '|' + to + '|' + tone + '|' + S.engine + '|' + c;
  const cores = [...new Set(segs.map(s => ENG.splitSpace(s).core).filter(c => c && /\p{L}/u.test(c)))];
  const have = await Cache.getMany(cores.map(kf)), map = new Map(), todo = [];
  cores.forEach(c => { const v = have.get(kf(c)); if (v != null) map.set(c, v); else todo.push(c); });
  const cached = map.size, saved = new Set(map.keys());
  const flush = async () => { const add = []; for (const [c, v] of map) if (!saved.has(c)) { saved.add(c); add.push([kf(c), v]); } if (add.length) await Cache.putMany(add); };
  if (onProgress) onProgress({ done:cached, total:cores.length, cached, failed:0 });
  let res = { limited:false, failed:0, message:'' };
  try {
    res = await ENG.segments(todo, from, to, { tone, signal, map, concurrency:4, onWait, onProgress:r => { if (onProgress) onProgress({ done:cached + r.done, total:cores.length, cached, failed:r.failed }); if (map.size - saved.size >= 15) flush(); } });
  } catch (err) { await flush(); throw err; }
  await flush();
  return { map, res, total:cores.length, cached };
}
const confirmBox = (title, html, okLabel) => new Promise(ok => ONE.modal({ title, body:html, width:460, actions:[{ label:'Cancel', on:() => ok(false) }, { label:okLabel, kind:'filled', on:() => ok(true) }], onClose:() => ok(false) }));
const tokensFor = chars => Math.round(chars / 1.6 / 1000) * 1000;
const waitText = s => 'Too many requests at once. Waiting ' + s + ' s, then carrying on…';
const progressText = (r, unit) => 'Translated ' + r.done.toLocaleString() + ' of ' + r.total.toLocaleString() + ' ' + unit + (r.cached ? ' · ' + r.cached.toLocaleString() + ' remembered from before' : '') + (r.failed ? ' · ' + r.failed + ' skipped' : '');

async function loadDoc(file){
  if (docCtl) docCtl.abort();
  docJob.hidden = false; docJob.className = 'job';
  docJob.innerHTML = ''; docJob.append(jobHead(file, 'Reading…'), el('div', { class:'prog ind' }, el('i')));
  let doc;
  try { doc = await DOC.read(file); } catch (err) {
    const msg = err && err.name === 'PasswordException' ? 'This PDF is password-protected. Remove the password first, then try again.' : (err.message || String(err));
    docJob.innerHTML = ''; docJob.append(jobHead(file, 'Can’t open this file'), el('div', { class:'warnbox', text:msg }), el('div', { class:'job-actions' }, el('button', { class:'btn tonal', text:'Choose another file', onclick:() => $('#docPick').click() }))); return;
  }
  doc.pdf ? showPdf(doc) : showDoc(doc);
}
function jobHead(file, sub){
  const e = (String(file.name).split('.').pop() || '').slice(0, 5);
  return el('div', { class:'job-head' }, el('span', { class:'fileicon', text:e }), el('div', { class:'grow' }, el('b', { text:file.name }), el('small', { text:sub })));
}
function showDoc(doc){
  const reqs = Math.max(1, Math.ceil(doc.chars / 2500)), over = doc.chars > DOC.MAX_CHARS;
  docJob.innerHTML = '';
  docJob.append(jobHead(doc, sizeOf(doc.size) + ' · ' + doc.segs.length.toLocaleString() + ' pieces of text · ' + doc.chars.toLocaleString() + ' characters' + (doc.pages ? ' · ' + doc.pages + ' pages' : '')));
  if (!doc.segs.length) { docJob.append(el('div', { class:'warnbox', text:'I couldn’t find any text to translate in this file.' })); return; }
  if (doc.note) docJob.append(el('div', { class:'okbox', text:doc.note }));
  if (over) { docJob.append(el('div', { class:'warnbox', text:'This document has ' + doc.chars.toLocaleString() + ' characters. One translation can handle up to ' + DOC.MAX_CHARS.toLocaleString() + '. Split it into parts and translate each.' })); return; }
  docJob.append(el('div', { class:'muted', text:serverLikely() ? 'Translating into ' + LANG.name(S.to) + ' with the free translator: no epic AI usage, but it is one machine, so a long document takes a while. Change the languages above first if you need to.' : 'Translating into ' + LANG.name(S.to) + ' takes about ' + reqs + ' request' + (reqs === 1 ? '' : 's') + ' to epic AI and counts toward your daily epic AI usage (roughly ' + tokensFor(doc.chars).toLocaleString() + ' tokens). Change the languages above first if you need to.' }));
  docJob.append(el('div', { class:'job-actions' }, el('button', { class:'btn filled', html:icon('translate') + 'Translate to ' + esc(LANG.name(S.to)), onclick:() => runDoc(doc) }), el('button', { class:'btn text', text:'Choose another file', onclick:() => $('#docPick').click() })));
}
async function runDoc(doc){
  if (doc.chars > 150000 && !doc.confirmed && !serverLikely()) { if (!await confirmBox('A long document', '<p>This is about <b>' + doc.chars.toLocaleString() + '</b> characters, roughly <b>' + tokensFor(doc.chars).toLocaleString() + ' tokens</b> of your daily epic AI allowance. If you run out, what is done is kept and you can continue later (or tomorrow).</p>', 'Translate')) return; doc.confirmed = true; }
  docCtl = new AbortController(); const to = S.to;
  const bar = el('i'), label = el('small', { text:'Starting…' });
  docJob.innerHTML = ''; docJob.append(el('div', { class:'job-head' }, el('span', { class:'fileicon', text:doc.kind }), el('div', { class:'grow' }, el('b', { text:doc.name }), label)), el('div', { class:'prog' }, bar),
    el('div', { class:'job-actions' }, el('button', { class:'btn tonal', text:'Cancel', onclick:() => docCtl && docCtl.abort() })));
  let tr;
  try {
    tr = await translateAll(doc.segs, { signal:docCtl.signal, onWait:s => { label.textContent = waitText(s); }, onProgress:r => { bar.style.width = Math.round((r.total ? r.done / r.total : 1) * 100) + '%'; label.textContent = progressText(r, 'pieces'); } });
  } catch (err) { if (err.name === 'AbortError') { showDoc(doc); say('Cancelled. What was translated is remembered.'); return; } docJob.append(el('div', { class:'warnbox', text:errText(err) })); return; }
  docCtl = null; const { map, res, total } = tr;
  if (!map.size) { docJob.innerHTML = ''; docJob.append(jobHead(doc, 'Nothing was translated'), el('div', { class:'warnbox', text:(res.limited ? errText({ limit:true, message:res.message || 'You’ve used today’s epic AI allowance.' }) : res.message || 'The translator didn’t answer.') }), el('div', { class:'job-actions' }, el('button', { class:'btn filled', text:'Try again', onclick:() => runDoc(doc) }))); return; }
  let out;
  try { out = await doc.build(map, to); } catch (err) { docJob.append(el('div', { class:'warnbox', text:'The translated file couldn’t be put together: ' + (err.message || err) })); return; }
  docJob.innerHTML = '';
  docJob.append(jobHead({ name:out.name }, sizeOf(out.blob.size) + ' · ' + map.size.toLocaleString() + ' of ' + total.toLocaleString() + ' pieces translated'));
  const partial = map.size < total;
  if (partial) docJob.append(el('div', { class:'warnbox', text:(res.limited ? errText({ limit:true, message:'The daily limit was reached, so the rest was left in the original language. Everything done so far is remembered: press “Translate the rest” later and it continues from here.' }) : 'Some pieces could not be translated and were left as they were.') }));
  else docJob.append(el('div', { class:'okbox', text:'Done. The layout, styles and pictures of the original are kept.' }));
  if (byNote(res) || res.serverNote) docJob.append(el('div', { class:'muted', text:[byNote(res), res.serverNote].filter(Boolean).join(' ') }));
  const pv = el('div', { class:'preview' }); let n = 0;
  for (const s of doc.segs) { const { core } = ENG.splitSpace(s); if (!map.has(core)) continue; pv.append(el('div', { text:core }), el('div', { class:'t', dir:LANG.rtl(to) ? 'rtl' : 'auto', text:map.get(core) })); if (++n >= 6) break; }
  if (n) docJob.append(pv);
  docJob.append(el('div', { class:'job-actions' },
    el('button', { class:'btn filled', html:icon('download') + 'Download', onclick:() => ONE.download(out.name, out.blob, out.mime) }),
    doc.text ? el('button', { class:'btn tonal', html:icon('content_copy') + 'Copy text', onclick:async () => say(await copyText(doc.text(map)) ? 'Text copied.' : 'Couldn’t copy.') }) : null,
    partial ? el('button', { class:'btn tonal', text:'Translate the rest', onclick:() => runDoc(doc) }) : null,
    el('button', { class:'btn text', text:'Another document', onclick:() => $('#docPick').click() })));
}

/* ---------- PDFs: translated in place ---------- */
function showPdf(doc, problem){
  docJob.innerHTML = '';
  docJob.append(jobHead(doc, sizeOf(doc.size) + ' · ' + doc.pages.toLocaleString() + ' page' + (doc.pages === 1 ? '' : 's')));
  if (problem) docJob.append(el('div', { class:'warnbox', text:problem }));
  const range = el('input', { class:'tf', placeholder:'All pages', 'aria-label':'Pages to translate', value:doc.range || '', autocomplete:'off' });
  const keep = ONE.check('Keep only the translated pages in the new PDF', doc.keepOnly !== false);
  docJob.append(el('div', { class:'rangebox' }, ONE.field('Pages', range, doc.pages > 40 ? 'Like 1-30, 45. A whole textbook is fine, but a chapter at a time is gentler on your daily allowance.' : 'Leave empty for every page, or type something like 1-5, 8.'), keep.wrap));
  docJob.append(el('div', { class:'okbox', text:'Each page keeps its layout, pictures and colours. The old text is painted over and the translation is written in the same place, size and colour. Scanned pages (a picture of text) have no text to translate.' }));
  docJob.append(el('div', { class:'job-actions' },
    el('button', { class:'btn filled', html:icon('translate') + 'Translate to ' + esc(LANG.name(S.to)), onclick:() => { doc.range = range.value; doc.keepOnly = keep.input.checked; runPdf(doc); } }),
    el('button', { class:'btn tonal', html:icon('description') + 'Editable Word copy instead', title:'Pulls the text out into a .docx you can edit', onclick:async () => { docJob.innerHTML = ''; docJob.append(jobHead(doc, 'Reading the text…'), el('div', { class:'prog ind' }, el('i'))); try { const w = await doc.toWord(); showDoc(w); } catch (err) { showPdf(doc, err.message || String(err)); } } }),
    el('button', { class:'btn text', text:'Choose another file', onclick:() => $('#docPick').click() })));
}
async function runPdf(doc, info){
  let pages; try { pages = PDFT.parseRange(doc.range, doc.pages); } catch (err) { return showPdf(doc, err.message); }
  docCtl = new AbortController(); const sig = docCtl.signal, to = S.to;
  const bar = el('i'), label = el('small', { text:'Starting…' });
  const frame = () => { docJob.innerHTML = ''; docJob.append(el('div', { class:'job-head' }, el('span', { class:'fileicon', text:'pdf' }), el('div', { class:'grow' }, el('b', { text:doc.name }), label)), el('div', { class:'prog' }, bar), el('div', { class:'job-actions' }, el('button', { class:'btn tonal', text:'Cancel', onclick:() => docCtl && docCtl.abort() }))); };
  frame();
  try {
    if (!info) {
      info = await PDFT.analyze(doc.file, pages, { signal:sig, onProgress:(i, n) => { bar.style.width = Math.round(i / n * 20) + '%'; label.textContent = 'Reading the text… page ' + i + ' of ' + n; } });
      if (!info.texts.length) { docCtl = null; return showPdf(doc, 'I couldn’t find any text on ' + (pages.length === 1 ? 'that page' : 'those pages') + '. If this PDF is a scan (a picture of each page), there is no text to replace.'); }
      if (info.chars > 150000 && !serverLikely() && !await confirmBox('A long document', '<p>About <b>' + info.chars.toLocaleString() + '</b> characters of text on <b>' + pages.length + '</b> pages, roughly <b>' + tokensFor(info.chars) .toLocaleString() + ' tokens</b> of your daily epic AI allowance. If you run out, what is done is kept and you can continue later.</p><p class="muted">It takes a while: a few minutes per hundred pages.</p>', 'Translate')) { docCtl = null; return showPdf(doc); }
    }
    bar.style.width = '20%';
    const tr = await translateAll(info.texts, { signal:sig, onWait:s => { label.textContent = waitText(s); }, onProgress:r => { bar.style.width = (20 + Math.round((r.total ? r.done / r.total : 1) * 60)) + '%'; label.textContent = progressText(r, 'paragraphs'); } });
    if (!tr.map.size) { docCtl = null; return showPdf(doc, tr.res.limited ? errText({ limit:true, message:tr.res.message || 'You’ve used today’s epic AI allowance.' }) : tr.res.message || 'The translator didn’t answer.'); }
    label.textContent = 'Putting the translation into the PDF…'; bar.style.width = '82%';
    const keepOnly = !!doc.keepOnly && pages.length < doc.pages;
    const built = await PDFT.build(doc.file, info, tr.map, to, { keepOnly, signal:sig, onProgress:(i, n) => { bar.style.width = (82 + Math.round(i / n * 18)) + '%'; label.textContent = 'Writing page ' + i + ' of ' + n + '…'; } });
    docCtl = null;
    const name = String(doc.name).replace(/\.[^.]+$/, '') + ' (' + LANG.name(to) + ').pdf', partial = tr.map.size < tr.total;
    docJob.innerHTML = ''; docJob.append(jobHead({ name }, sizeOf(built.blob.size) + ' · ' + built.stats.blocks.toLocaleString() + ' paragraphs on ' + built.stats.pages + ' page' + (built.stats.pages === 1 ? '' : 's')));
    if (partial) docJob.append(el('div', { class:'warnbox', text:(tr.res.limited ? errText({ limit:true, message:'The daily limit was reached, so the rest of the text was left in the original language. Everything done so far is remembered: press “Translate the rest” later and it continues from here.' }) : 'Some paragraphs could not be translated and were left as they were.') }));
    else docJob.append(el('div', { class:'okbox', text:'Done. Check the pages below, then download.' }));
    if (byNote(tr.res) || tr.res.serverNote) docJob.append(el('div', { class:'muted', text:[byNote(tr.res), tr.res.serverNote].filter(Boolean).join(' ') }));
    if (info.textless) docJob.append(el('div', { class:'muted', text:info.textless + ' of ' + pages.length + ' page' + (pages.length === 1 ? ' has' : 's have') + ' no text I could translate (pictures, scans or maths only) and ' + (info.textless === 1 ? 'was' : 'were') + ' left as is.' }));
    const prev = el('div', { class:'pvpages' }); docJob.append(prev);
    docJob.append(el('div', { class:'job-actions' },
      el('button', { class:'btn filled', html:icon('download') + 'Download PDF', onclick:() => ONE.download(name, built.blob, 'application/pdf') }),
      partial ? el('button', { class:'btn tonal', text:'Translate the rest', onclick:() => runPdf(doc, info) }) : null,
      el('button', { class:'btn text', text:'Another document', onclick:() => $('#docPick').click() })));
    previewPdf(built.blob, prev, keepOnly ? 1 : (info.pages.find(p => p.blocks.length) || info.pages[0]).n);
  } catch (err) {
    docCtl = null;
    if (err.name === 'AbortError') { showPdf(doc); say('Cancelled. What was translated is remembered.'); return; }
    showPdf(doc, errText(err));
  }
}
/* show a page of the result so the person can check it before downloading */
async function previewPdf(blob, box, n){
  try {
    const lib = await DOC.loadPdf(), pdf = await lib.getDocument({ data:new Uint8Array(await blob.arrayBuffer()) }).promise;
    const pg = await pdf.getPage(clampN(n, pdf.numPages)), base = pg.getViewport({ scale:1 }), sc = Math.min(1.6, 760 / base.width), vp = pg.getViewport({ scale:sc });
    const c = el('canvas', { class:'pvcanvas', width:Math.ceil(vp.width), height:Math.ceil(vp.height), 'aria-label':'Preview of a translated page' });
    c.getContext('2d').fillStyle = '#fff'; c.getContext('2d').fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext:c.getContext('2d'), viewport:vp }).promise; box.append(c); try { pdf.destroy(); } catch {}
  } catch {}
}
const clampN = (n, max) => Math.min(max, Math.max(1, n));

/* ---------- pictures ---------- */
const imgJob = $('#imgJob'); let imgCtl = null;
$('#imgPick').onclick = e => { e.stopPropagation(); $('#imgInput').click(); };
$('#imgCam').onclick = e => { e.stopPropagation(); $('#camInput').click(); };
$('#imgDrop').onclick = () => $('#imgInput').click();
$('#imgDrop').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#imgInput').click(); } });
$('#imgInput').onchange = $('#camInput').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadImage(f); };
wireDrop($('#imgDrop'), fs => { const f = fs.find(x => x.type.startsWith('image/')); if (f) loadImage(f); else say('That isn’t a picture.'); });
addEventListener('paste', e => { const it = [...(e.clipboardData && e.clipboardData.items || [])].find(i => i.type.startsWith('image/')); if (!it || !document.activeElement || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) && tab !== 'image') return; const f = it.getAsFile(); if (f) { e.preventDefault(); showTab('image'); loadImage(f); } });
function shrink(file, max = 1600){
  return new Promise((ok, bad) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c.toDataURL('image/jpeg', .88)); };
    im.onerror = () => { URL.revokeObjectURL(u); bad(new Error('That picture can’t be opened.')); }; im.src = u;
  });
}
async function loadImage(file){
  if (imgCtl) imgCtl.abort(); imgCtl = new AbortController(); const sig = imgCtl.signal;
  imgJob.hidden = false; imgJob.className = 'job'; imgJob.innerHTML = '';
  let url; try { url = await shrink(file); } catch (err) { imgJob.append(el('div', { class:'warnbox', text:err.message })); return; }
  const status = el('div', { class:'muted', text:'Reading the text in the picture…' }), outBox = el('div', { class:'imgout' }, status, el('div', { class:'prog ind' }, el('i')));
  imgJob.append(el('div', { class:'imgrow' }, el('img', { src:url, alt:'Your picture' }), outBox));
  try {
    const text = await ENG.ocr(url, { signal:sig });
    if (!text) { outBox.innerHTML = ''; outBox.append(el('div', { class:'warnbox', text:'I couldn’t find any text in this picture.' }), el('div', { class:'job-actions' }, el('button', { class:'btn tonal', text:'Choose another', onclick:() => $('#imgInput').click() }))); return; }
    status.textContent = 'Translating…';
    const r = await ENG.translate(text.slice(0, 5000), S.from, S.to, { tone:S.tone, signal:sig });
    outBox.innerHTML = '';
    const lang = S.from === LANG.AUTO ? r.lang : S.from;
    outBox.append(el('small', { class:'muted', text:(lang ? LANG.name(lang) : 'Original') }), el('div', { class:'imgtext', text:text }),
      el('small', { class:'muted', text:LANG.name(S.to) }), el('div', { class:'imgtext t', dir:LANG.rtl(S.to) ? 'rtl' : 'auto', text:r.text }),
      el('div', { class:'job-actions' },
        el('button', { class:'btn filled', html:icon('content_copy') + 'Copy', onclick:async () => say(await copyText(r.text) ? 'Translation copied.' : 'Couldn’t copy.') }),
        el('button', { class:'btn tonal', html:icon('volume_up') + 'Listen', onclick:() => { if (!VOICE.speak(r.text, S.to)) say('This device has no ' + LANG.name(S.to) + ' voice.'); } }),
        el('button', { class:'btn tonal', html:icon('translate') + 'Open in Text', onclick:() => { showTab('text'); srcEl.value = text.slice(0, 5000); onInput(true); } }),
        el('button', { class:'btn text', text:'Another picture', onclick:() => $('#imgInput').click() })));
    addHistory({ src:text.replace(/\s+/g, ' ').slice(0, 300), text:r.text.replace(/\s+/g, ' ').slice(0, 300), from:lang || LANG.AUTO, to:S.to });
  } catch (err) { if (err.name === 'AbortError') return; outBox.innerHTML = ''; outBox.append(el('div', { class:'warnbox', text:errText(err) }), el('div', { class:'job-actions' }, el('button', { class:'btn tonal', text:'Try again', onclick:() => loadImage(file) }))); }
}

/* ---------- websites ---------- */
const webJob = $('#webJob'); let webCtl = null;
$('#urlForm').addEventListener('submit', e => { e.preventDefault(); let u = $('#urlIn').value.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; loadWeb(u); });
async function loadWeb(url){
  if (webCtl) webCtl.abort(); webCtl = new AbortController(); const sig = webCtl.signal, to = S.to, from = S.from;
  webJob.hidden = false; webJob.innerHTML = '';
  const status = el('div', { class:'muted', text:'Opening the page…' }), bar = el('i');
  webJob.append(status, el('div', { class:'prog' }, bar));
  try {
    let first = await ENG.readPage(url, 0, { signal:sig }), text = first.text || '', off = text.length, calls = 1;
    while (off < (first.textLength || 0) && calls < 5) { status.textContent = 'Reading the page…'; const nx = await ENG.readPage(first.url || url, off, { signal:sig }); if (!nx.text) break; text += nx.text; off += nx.text.length; calls++; }
    const more = off < (first.textLength || 0);
    const paras = text.split(/\n{2,}|\n(?=- |#)/).map(s => s.trim()).filter(Boolean);
    status.textContent = 'Translating…';
    const res = await ENG.segments(paras, from, to, { tone:S.tone, signal:sig, onProgress:r => { bar.style.width = (r.total ? Math.round(r.done / r.total * 100) : 0) + '%'; status.textContent = 'Translating… ' + r.done + ' of ' + r.total; } });
    const title = first.title ? (res.map.size ? await ENG.translate(first.title, from, to, { tone:S.tone, signal:sig }).then(r => r.text).catch(() => first.title) : first.title) : '';
    webJob.innerHTML = '';
    const page = el('div', { class:'webpage', dir:LANG.rtl(to) ? 'rtl' : 'auto' });
    if (title) page.append(el('h2', { text:title }));
    let host = ''; try { host = new URL(first.url || url).hostname; } catch {}
    page.append(el('p', {}, el('small', {}, document.createTextNode(host + ' · translated into ' + LANG.name(to) + ' · '), el('a', { href:first.url || url, target:'_blank', rel:'noopener noreferrer', text:'Open the original' }))));
    paras.forEach(p => {
      const out = res.map.get(p), h = /^(#{1,3}) /.exec(p), li = /^- /.test(p);
      const strip = s => s.replace(/^#{1,3} /, '');
      const node = el(h ? 'h3' : 'p', {}, document.createTextNode((li && out && !/^- /.test(out) ? '• ' : '') + strip(out || p)));
      if (out) node.append(el('span', { class:'orig', text:strip(p) })); page.append(node);
    });
    if (res.limited) page.append(el('div', { class:'warnbox', text:errText({ limit:true, message:'The daily limit was reached part-way; the rest of the page is shown in the original language.' }) }));
    if (more) page.append(el('div', { class:'okbox', text:'This page is long, so only the first part is translated.' }));
    webJob.append(page, el('div', { class:'job-actions', style:{ marginTop:'12px' } },
      el('button', { class:'btn tonal', html:icon('content_copy') + 'Copy translation', onclick:async () => say(await copyText(paras.map(p => (res.map.get(p) || p).replace(/^#{1,3} /, '')).join('\n\n')) ? 'Copied.' : 'Couldn’t copy.') }),
      el('button', { class:'btn tonal', html:icon('compare') + 'Show original', onclick:e => { page.classList.toggle('both'); e.currentTarget.lastChild.textContent = page.classList.contains('both') ? 'Hide original' : 'Show original'; } }),
      el('button', { class:'btn text', html:icon('download') + 'Save as .html', onclick:() => ONE.download('translated page.html', '<!doctype html><meta charset="utf-8"><title>' + esc(title || host) + '</title><body style="font:16px/1.6 system-ui;max-width:760px;margin:2rem auto;padding:0 1rem">' + page.innerHTML.replace(/<span class="orig"[^>]*>[\s\S]*?<\/span>/g, ''), 'text/html') })));
  } catch (err) {
    if (err.name === 'AbortError') return;
    webJob.innerHTML = ''; webJob.append(el('div', { class:'warnbox', text:errText(err) }));
  }
}

/* ---------- conversation ---------- */
function talkLangs(){ return { a:S.from === LANG.AUTO ? (detected || 'en') : S.from, b:S.to }; }
const talkLog = $('#talkLog');
async function talkSay(text, side){
  text = text.trim(); if (!text) return; const { a, b } = talkLangs(), from = side === 'a' ? a : b, to = side === 'a' ? b : a;
  const out = el('div', { class:'t', dir:LANG.rtl(to) ? 'rtl' : 'auto', text:'…' });
  const bub = el('div', { class:'bub ' + side }, el('div', { class:'o', text:text }), out, el('div', { class:'bl' },
    el('button', { title:'Listen', 'aria-label':'Listen', html:icon('volume_up'), onclick:() => { if (!VOICE.speak(out.textContent, to)) say('This device has no ' + LANG.name(to) + ' voice.'); } }),
    el('button', { title:'Copy', 'aria-label':'Copy', html:icon('content_copy'), onclick:async () => say(await copyText(out.textContent) ? 'Copied.' : 'Couldn’t copy.') })));
  talkLog.append(bub); bub.scrollIntoView({ block:'nearest', behavior:'smooth' });
  try { const r = await ENG.translate(text, from, to, { tone:S.tone }); out.textContent = r.text; if (S.talkVoice) VOICE.speak(r.text, to); addHistory({ src:text, text:r.text, from, to }); bub.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
  catch (err) { out.textContent = errText(err); }
}
let talkMic = null;
function talkListen(side){
  const btn = side === 'a' ? $('#micA') : $('#micB');
  if (talkMic) { VOICE.stopListening(); if (talkMic === side) return; }
  if (!VOICE.canListen) return say('This browser can’t listen. Try Chrome, Edge or Safari.');
  const lang = side === 'a' ? talkLangs().a : talkLangs().b; let last = '';
  talkMic = side; btn.classList.add('rec');
  VOICE.listen(lang, { onText:t => { last = t; }, onEnd:t => { btn.classList.remove('rec'); talkMic = null; talkSay(t || last, side); }, onError:e => { btn.classList.remove('rec'); talkMic = null; say(e.message); } });
}
$('#micA').onclick = () => talkListen('a'); $('#micB').onclick = () => talkListen('b');
$('#talkForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#talkIn').value; $('#talkIn').value = ''; talkSay(v, 'a'); });
$('#talkClear').onclick = () => { talkLog.innerHTML = ''; VOICE.stop(); };
const tv = $('#talkAuto'); const syncTv = () => { tv.setAttribute('aria-pressed', S.talkVoice); tv.classList.toggle('on', S.talkVoice); tv.firstChild.textContent = S.talkVoice ? 'volume_up' : 'volume_off'; };
tv.onclick = () => { S.talkVoice = !S.talkVoice; if (!S.talkVoice) VOICE.stop(); keep(); syncTv(); };

/* ---------- chrome ---------- */
$$('[data-act]').forEach(b => b.addEventListener('click', () => {
  const a = b.dataset.act;
  if (a === 'apps') ONE.appSwitcher(b); else if (a === 'seed') ONE.seedMenu(b); else if (a === 'history') toggleSide();
}));
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#picker').hidden) closePicker(); else if (!$('#hw').hidden) $('#hw').hidden = true; else if (VOICE.speaking()) VOICE.stop(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); swap(); }
});
addEventListener('pagehide', () => { VOICE.stop(); });
syncTv(); renderLangs(); drawRecent(); autosize(); showTab('text');
checkServer(true); setInterval(() => checkServer(), 60000);
})();
