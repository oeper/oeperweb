/* oneDraw — handwriting to text. The chosen strokes are drawn into a picture (black on white) and sent to oeper.dev's epic AI,
   which reads them back as text. Nothing is sent until the person agrees once, and only when they ask for a conversion. */
(() => {
'use strict';
const { $, el, icon, store } = ONE;
const INK = window.INK = {};
const ENDPOINT = 'https://oeper-ai.oeper.workers.dev/api/chat';
const PROMPT = 'The picture holds handwriting. Transcribe it exactly as written, correcting nothing. Reply with ONLY the transcribed text: no quotes, no explanation, no markdown. Write maths with plain Unicode symbols (√, ², ³, ×, ÷, ½, π, ≤) and the characters as written, never LaTeX, never dollar signs or backslashes. Keep the line breaks between lines, and keep a list as one item per line. If you cannot read any writing, reply with exactly NO_TEXT.';
let busy = false;

INK.ready = () => !!store.get('od-ink-ok');
INK.consent = () => new Promise(ok => {
  if (INK.ready()) return ok(true);
  ONE.modal({ title:'Turn handwriting into text', icon:'edit_note', width:460,
    body:'<p>To read your handwriting, oneDraw sends <b>a picture of just the writing you convert</b> to oeper.dev’s epic AI, which sends the text back.</p><p class="muted">Nothing is sent until you press convert (or write with Write mode on), and the rest of your board is never shared. You can stop at any time by not using it.</p>',
    actions:[{ label:'Not now', on:() => ok(false) }, { label:'Allow', kind:'filled', on:() => { store.set('od-ink-ok', 1); ok(true); } }], onClose:() => ok(false) });
});


/* the reader sometimes answers maths in LaTeX anyway; turn the common bits back into plain symbols */
const SUP = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' }, SUB = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎' };
const SYM = { times:'×', div:'÷', cdot:'·', pm:'±', mp:'∓', leq:'≤', le:'≤', geq:'≥', ge:'≥', neq:'≠', ne:'≠', approx:'≈', infty:'∞', pi:'π', theta:'θ', alpha:'α', beta:'β', gamma:'γ', delta:'δ', Delta:'Δ', lambda:'λ', mu:'μ', sigma:'σ', Sigma:'Σ', omega:'ω', degree:'°', circ:'°', rightarrow:'→', to:'→', leftarrow:'←', sum:'Σ', int:'∫', ldots:'…', dots:'…' };
INK.unTeX = t => {
  if (!/[$\\]/.test(t)) return t;
  const word = /^[\w.]+$/;
  let o = t.replace(/\$+/g, '').replace(/\\[()[\]]/g, '').replace(/\\(left|right|displaystyle)\b/g, '').replace(/\\[,;:! ]/g, ' ');
  for (let i = 0; i < 6; i++) o = o.replace(/\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (m, a, b) => (word.test(a) ? a : '(' + a + ')') + '/' + (word.test(b) ? b : '(' + b + ')'))
    .replace(/\\sqrt\s*\[3\]\s*\{([^{}]*)\}/g, (m, a) => '∛(' + a + ')').replace(/\\sqrt\s*\{([^{}]*)\}/g, (m, a) => word.test(a) ? '√' + a : '√(' + a + ')');
  o = o.replace(/\^\s*\{([^{}]*)\}|\^\s*([\w+-])/g, (m, a, b) => { const x = a != null ? a : b; return [...x].every(c => SUP[c]) ? [...x].map(c => SUP[c]).join('') : '^(' + x + ')'; })
    .replace(/_\s*\{([^{}]*)\}|_\s*(\d)/g, (m, a, b) => { const x = a != null ? a : b; return [...x].every(c => SUB[c]) ? [...x].map(c => SUB[c]).join('') : '_' + x; });
  o = o.replace(/\\([A-Za-z]+)/g, (m, n) => SYM[n] || n).replace(/[{}]/g, '').replace(/ {2,}/g, ' ');
  return o.trim();
};
const clean = s => {
  let t = String(s || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
  t = t.replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
  if (/^(["“”'`]).*\1$/s.test(t) && t.length > 2 && !/\n/.test(t)) t = t.slice(1, -1).trim();
  return INK.unTeX(t);
};
/* one request to the worker; the answer streams back as server-sent events */
INK.read = async (url, signal) => {
  const body = { quiet:true, messages:[{ role:'user', content:[{ type:'text', text:PROMPT }, { type:'image_url', image_url:{ url } }] }] };
  let res;
  try { res = await fetch(ENDPOINT, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body), signal }); }
  catch (err) { if (err.name === 'AbortError') throw err; throw new Error(navigator.onLine === false ? 'You’re offline.' : 'Handwriting to text works at oeper.dev/one. This copy couldn’t reach the reader.'); }
  if (!res.ok || !res.body) { let m = 'The reader had a problem (' + res.status + ').'; try { m = (await res.json()).error || m; } catch {} throw new Error(m); }
  const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream:true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      const t = l.trim(); if (!t.startsWith('data:')) continue; const p = t.slice(5).trim(); if (!p || p === '[DONE]') continue;
      try { const d = ((JSON.parse(p).choices || [{}])[0].delta || {}); if (d.content) text += d.content; } catch {}
    }
  }
  const out = clean(text); if (/^\[error:/i.test(out)) throw new Error(out.replace(/^\[error:\s*|\]$/gi, '') || 'The reader had a problem.');
  return out;
};

/* convert strokes already on the board and swap them for a text box */
INK.convert = async (ids, opt = {}) => {
  if (busy) return ONE.toast('Still reading the last bit of writing…');
  const page = D.page(), want = new Set(ids || []), strokes = page.els.filter(e => want.has(e.id) && e.t === 'pen' && !e.hl);
  if (!strokes.length) return opt.quiet ? null : ONE.toast('Select some handwriting first (use the Select tool and drag around it).');
  if (!await INK.consent()) { if (opt.auto) B.setTool('pen'); return null; }
  busy = true; ONE.toast('Reading your handwriting…', { ms:20000 });
  const { url, box } = B.strokesImage(strokes); let text = '';
  try { text = await INK.read(url); }
  catch (err) { busy = false; ONE.toast(err.message || 'Couldn’t read that.', { ms:5000 }); return null; }
  busy = false;
  if (!text || /^NO_TEXT\b/i.test(text)) return ONE.toast('I couldn’t find any readable writing there. Try writing a little larger or clearer.');
  if (D.page() !== page) return ONE.toast('You moved to another page, so the writing was left as it is.');
  const present = strokes.filter(s => page.els.includes(s)); if (!present.length) return null;
  const rows = text.split('\n').length, size = Math.max(18, Math.min(72, Math.round(box.h / rows * .62 / 2) * 2));
  const t = { id:ONE.uid(), t:'text', x:box.x, y:box.y, text, size, font:'sans', c:present[0].c, op:1 }, gone = new Set(present.map(s => s.id));
  B.mutate(() => { page.els = page.els.filter(e => !gone.has(e.id)); page.els.push(t); });
  B.select([t.id]); if (!opt.auto && B.tool !== 'select') B.setTool('select');
  ONE.toast('Converted to text.', { action:'Undo', fn:() => A_undo() });
  return t;
};
const A_undo = () => { if (D.undo()) { B.sel = []; B.changed(); B.select([]); } };

/* a writing pad: write on a small canvas, get the text, put it on the board */
INK.pad = async () => {
  if (!await INK.consent()) return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && false;
  const cvs = el('canvas', { class:'padcv' }), result = el('textarea', { class:'tf padout', rows:3, placeholder:'The text will appear here. You can fix it before adding it.', spellcheck:'true' });
  const status = el('span', { class:'padstat muted' });
  const strokes = []; let curS = null, dpr = Math.min(2, devicePixelRatio || 1), W = 560, H = 230;
  const g = cvs.getContext('2d'), paint = () => {
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#d9dbe3'; g.lineWidth = 1; for (let y = 52; y < H; y += 52) { g.beginPath(); g.moveTo(14, y + .5); g.lineTo(W - 14, y + .5); g.stroke(); }
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 3.2; g.lineCap = g.lineJoin = 'round';
    strokes.concat(curS ? [curS] : []).forEach(s => { g.beginPath(); g.moveTo(s[0], s[1]); if (s.length === 2) g.lineTo(s[0] + .01, s[1]); for (let i = 2; i < s.length; i += 2) g.lineTo(s[i], s[i + 1]); g.stroke(); });
    if (!strokes.length && !curS) { g.fillStyle = '#9aa0ad'; g.font = '16px "Google Sans",sans-serif'; g.textAlign = 'center'; g.fillText('Write here with your finger, pen or mouse', W / 2, H / 2 + 5); }
  };
  const fit = () => { W = Math.min(560, Math.max(260, innerWidth - 90)); cvs.width = W * dpr; cvs.height = H * dpr; cvs.style.width = W + 'px'; cvs.style.height = H + 'px'; paint(); };
  const pos = e => { const r = cvs.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cvs.addEventListener('pointerdown', e => { cvs.setPointerCapture(e.pointerId); curS = pos(e); paint(); });
  cvs.addEventListener('pointermove', e => { if (!curS) return; curS.push(...pos(e)); paint(); });
  const up = () => { if (!curS) return; strokes.push(curS); curS = null; paint(); };
  cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
  const go = el('button', { class:'btn filled', html:`${icon('auto_awesome')}Convert to text` }), clearB = el('button', { class:'btn text', text:'Clear' }), undoB = el('button', { class:'btn text', text:'Undo stroke' });
  clearB.onclick = () => { strokes.length = 0; result.value = ''; status.textContent = ''; paint(); }; undoB.onclick = () => { strokes.pop(); paint(); };
  const readBtn = async () => {
    if (!strokes.length) return ONE.toast('Write something first.');
    go.disabled = true; status.textContent = 'Reading…';
    try { const t = await INK.read(cvs.toDataURL('image/png')); if (!t || /^NO_TEXT\b/i.test(t)) { status.textContent = 'I couldn’t read that. Try writing larger.'; } else { result.value = t; status.textContent = ''; } }
    catch (err) { status.textContent = err.message || 'Couldn’t read that.'; }
    go.disabled = false;
  };
  go.onclick = readBtn;
  const body = el('div', { class:'padwrap' }, cvs, el('div', { class:'padbar' }, go, undoB, clearB, status), result);
  const m = ONE.modal({ title:'Writing pad', icon:'edit_note', width:620, body, actions:[
    { label:'Copy text', on:() => { if (result.value.trim()) ONE.copyText(result.value, 'Copied.'); return false; } },
    { label:'Add to board', kind:'filled', on:() => { const t = result.value.trim(); if (!t) { ONE.toast('Convert your writing first.'); return false; } B.addText(t); if (B.tool !== 'select') B.setTool('select'); ONE.toast('Added to the board.'); } },
    { label:'Close' }] });
  fit();
};
})();
