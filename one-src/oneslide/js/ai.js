/* oneSlide — what the epic AI assistant (shared/one-ai.js on oeper.dev) sees and can do here.
   window.OXAI: context() describes the deck as text, apply(block) carries out a <<slides>> or <<slideedit>> block from the
   AI and returns an undo function (or null, with OXAI.lastError saying why). It builds real slides from the deck's own
   layouts, charts and tables, and the whole change is one undo step. */
(() => {
'use strict';
const { esc } = ONE;
const clip = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const LAYOUT_KEYS = () => Object.keys(S.LAYOUTS);

/* ---------- reading ---------- */
const plain = html => String(html || '').replace(/<\/(li|p|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{2,}/g, '\n').trim();
function slideText(s, i) {
  const out = [], by = role => s.els.filter(e => e.role === role);
  const title = by('title')[0]; out.push(`Slide ${i + 1}${i === S.cur ? ' (open)' : ''}, layout "${s.layout}"${s.hidden ? ', hidden' : ''}:`);
  if (title && plain(title.html)) out.push('  title: ' + clip(plain(title.html), 160));
  by('subtitle').forEach((e, k) => { if (plain(e.html)) out.push(`  subtitle${k ? ' ' + (k + 1) : ''}: ` + clip(plain(e.html), 160)); });
  by('body').forEach((e, k) => { const t = plain(e.html); if (t) out.push(`  body${by('body').length > 1 ? ' ' + (k + 1) : ''}:\n` + t.split('\n').map(l => '    - ' + clip(l, 160)).join('\n')); });
  s.els.filter(e => !e.role).forEach(e => {
    if (e.type === 'chart') out.push(`  chart (${e.kind}) "${e.title || ''}": ${(e.data && e.data.series || []).map(x => x.name).join(', ')} over ${(e.data && e.data.cats || []).join(', ')}`);
    else if (e.type === 'table') out.push(`  table ${e.rows.length}x${(e.rows[0] || []).length}: ` + clip(e.rows.map(r => r.join(' / ')).join(' ; '), 300));
    else if (e.type === 'image') out.push('  image' + (e.alt ? ': ' + clip(e.alt, 80) : ''));
    else if (e.type === 'shape' || e.type === 'text') { const t = plain(e.html); if (t) out.push('  text box: ' + clip(t, 160)); }
  });
  if (s.notes) out.push('  speaker notes: ' + clip(s.notes, 300));
  return out.join('\n');
}
function context() {
  const d = S.deck, head = `Presentation "${d.title}": ${d.slides.length} slides, theme "${d.theme}" (${S.THEMES[d.theme] ? S.THEMES[d.theme].name : d.theme}), ${d.ratio}. The user has slide ${S.cur + 1} open.`;
  const text = head + (d.footer && (d.footer.text || d.footer.num) ? ` Footer: ${d.footer.text || ''}${d.footer.num ? ' (slide numbers on)' : ''}.` : '') + '\n\n' + d.slides.map(slideText).join('\n\n');
  return { kind:'deck', title:d.title, text };
}

/* ---------- the instructions the model gets ---------- */
const SYSTEM = () => 'The user is in oneSlide, a presentation app. You can build and change the deck directly with blocks, so do NOT write slide content out in a plain text answer. The open deck is shown to you slide by slide. '
  + 'NEW SLIDES: <<slides>> followed by JSON then <</slides>>. The JSON is {"theme":"optional theme key","slides":[...],"at":"end|after|start|replace"} where each slide is '
  + '{"layout":"title|content|section|two|compare|titleonly|quote|bignum|blank","title":"…","subtitle":"…","body":["bullet one","bullet two"],"body2":["…"],"subtitle2":"…","notes":"speaker notes","transition":"fade|push|wipe|split|none","chart":{"kind":"column|bar|line|area|pie|doughnut","title":"…","cats":["Q1","Q2"],"series":[{"name":"2025","vals":[1,2]}]},"table":{"rows":[["Header","Header"],["cell","cell"]]},"bg":"#112233"}. '
  + '"at" says where the new slides go: "end" (default), "after" the open slide, "start", or "replace" to rebuild the whole deck. Use layout "title" for the first slide (title and subtitle), "section" for dividers, "content" for a title with bullets, "two" for two columns (body and body2), "compare" for a side by side (subtitle, body, subtitle2, body2), "quote" (title is the quote, subtitle the author), "bignum" (title is the big number, subtitle explains it), and "titleonly" with a chart or table. '
  + 'Write 3 to 5 short bullets per slide (under 12 words each), real specific content rather than placeholders, and speaker notes on most slides. You can put **bold** around a few key words. A chart or table replaces the body of its slide. Themes: ' + Object.keys(S.THEMES).join(', ') + '. '
  + 'CHANGES: <<slideedit>> followed by JSON {"ops":[...]} then <</slideedit>>. Slide numbers start at 1. Ops: '
  + '{"op":"update","slide":3,"title":"…","subtitle":"…","body":["…"],"body2":["…"],"notes":"…","layout":"content","chart":{…},"table":{…}} (only the fields you give are changed); '
  + '{"op":"delete","slide":5}; {"op":"move","slide":4,"to":2}; {"op":"duplicate","slide":2}; {"op":"theme","name":"midnight","variant":0}; {"op":"footer","text":"Company","numbers":true}; '
  + '{"op":"transition","slide":"all","type":"fade"}; {"op":"hide","slide":6,"hidden":true}. '
  + 'To only discuss, outline or critique the deck, answer in plain text and write no block. Do not use LaTeX and do not use em dashes. After the blocks, write one short sentence saying what you did.';

/* ---------- writing ---------- */
const snap = () => JSON.stringify({ slides:S.deck.slides, theme:S.deck.theme, variant:S.deck.variant, ratio:S.deck.ratio, footer:S.deck.footer, cur:S.cur });
const restore = (j, rec = true) => { const s = JSON.parse(j); Object.assign(S.deck, { slides:s.slides, theme:s.theme, variant:s.variant, ratio:s.ratio, footer:s.footer }); S.cur = Math.min(s.cur, s.slides.length - 1); S.sel = []; S.changed(rec); };

const inline = t => esc(String(t)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const bullets = arr => { const a = (Array.isArray(arr) ? arr : String(arr || '').split('\n')).map(x => String(x).replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean); return a.length ? '<ul>' + a.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>' : ''; };
const line = t => inline(String(t == null ? '' : t).replace(/\s*\n\s*/g, ' ').trim());
const num = v => { const n = parseFloat(String(v).replace(/[^0-9.eE+-]/g, '')); return isFinite(n) ? n : 0; };
const TRANS = () => S.TRANS ? S.TRANS.map(t => t[0]) : ['none', 'fade', 'push', 'wipe'];

function chartEl(c, W) {
  const kinds = ['column', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter', 'stackcol'];
  const cats = (c.cats || c.labels || []).map(String);
  let series = (c.series || []).map(s => ({ name:String(s.name || ''), vals:(s.vals || s.values || []).map(num) }));
  if (!series.length && Array.isArray(c.values)) series = [{ name:String(c.title || 'Series'), vals:c.values.map(num) }];
  if (!cats.length || !series.length) throw new Error('A chart needs categories and at least one series');
  series.forEach(s => { while (s.vals.length < cats.length) s.vals.push(0); s.vals.length = cats.length; });
  return { id:S.newId(), mid:S.newId(), type:'chart', kind:kinds.includes(c.kind) ? c.kind : 'column', title:c.title ? String(c.title) : '', x:110, y:180, w:W - 220, h:470, rot:0, style:{}, alt:c.title ? String(c.title) : 'Chart', data:{ cats, series } };
}
function tableEl(t, W) {
  const rows = (t.rows || []).map(r => (Array.isArray(r) ? r : String(r).split('|')).map(c => String(c == null ? '' : c).trim())).filter(r => r.length);
  if (rows.length < 1) throw new Error('A table needs rows');
  const cols = Math.max(...rows.map(r => r.length)); rows.forEach(r => { while (r.length < cols) r.push(''); });
  return { id:S.newId(), mid:S.newId(), type:'table', x:110, y:190, w:W - 220, h:Math.min(470, 60 * rows.length), rot:0, header:t.header !== false, banded:true, style:{ size:rows.length > 7 ? 18 : 22 }, rows };
}

function fill(s, spec) {
  const by = role => s.els.filter(e => e.role === role);
  const set = (e, html) => { if (e) e.html = html; };
  if ('title' in spec) set(by('title')[0], line(spec.title));
  if ('subtitle' in spec) set(by('subtitle')[0], line(spec.subtitle));
  if ('subtitle2' in spec) set(by('subtitle')[1], line(spec.subtitle2));
  const bodies = by('body'), many = bodies.length > 1 || s.layout === 'two' || s.layout === 'content' || s.layout === 'compare';
  const asHtml = v => many ? bullets(v) : line(Array.isArray(v) ? v.join(' ') : v);
  if ('body' in spec) set(bodies[0], asHtml(spec.body));
  if ('body2' in spec) set(bodies[1], asHtml(spec.body2));
  if ('notes' in spec) s.notes = String(spec.notes || '');
  if (spec.bg && /^#[0-9a-fA-F]{6}$/.test(spec.bg)) s.bg = spec.bg;
  if (spec.transition && TRANS().includes(spec.transition)) s.transition = Object.assign({}, s.transition, { type:spec.transition });
  if (spec.chart || spec.table) {
    s.els = s.els.filter(e => !(e.role === 'body' && !plain(e.html))); // the empty text placeholder makes room for it
    s.els = s.els.filter(e => e.type !== 'chart' || !spec.chart).filter(e => e.type !== 'table' || !spec.table);
    if (spec.chart) s.els.push(chartEl(spec.chart, S.W()));
    if (spec.table) s.els.push(tableEl(spec.table, S.W()));
  }
}
const pickLayout = spec => {
  const L = String(spec.layout || '').toLowerCase();
  if (LAYOUT_KEYS().includes(L)) return L;
  if (spec.chart || spec.table) return 'titleonly';
  if (spec.body2) return 'two';
  if (spec.subtitle && !spec.body) return 'section';
  return 'content';
};
const build = spec => { if (!spec || typeof spec !== 'object') throw new Error('A slide must be an object'); const s = S.newSlide(pickLayout(spec)); fill(s, spec); return s; };

function parseJSON(t) {
  t = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = Math.min(...['{', '['].map(c => { const i = t.indexOf(c); return i < 0 ? Infinity : i; })), z = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (!isFinite(a) || z < a) throw new Error('The changes were not valid JSON');
  return JSON.parse(t.slice(a, z + 1));
}
const slideIdx = v => { const n = parseInt(v, 10) - 1; if (!(n >= 0 && n < S.deck.slides.length)) throw new Error('There is no slide ' + v); return n; };
const setTheme = (name, variant) => { if (name && S.THEMES[name]) S.deck.theme = name; else if (name) throw new Error('Unknown theme "' + name + '"'); if (variant != null) S.deck.variant = Math.max(0, Math.min(S.VARIANTS.length - 1, +variant || 0)); };

function runSlides(j) {
  const list = Array.isArray(j) ? j : Array.isArray(j.slides) ? j.slides : [];
  if (!list.length) throw new Error('There were no slides in that answer.');
  if (list.length > 40) throw new Error('That is more than 40 slides at once.');
  if (!Array.isArray(j)) { if (j.theme) setTheme(j.theme, j.variant); if (j.ratio === '4:3' || j.ratio === '16:9') S.deck.ratio = j.ratio; }
  const made = list.map(build), at = !Array.isArray(j) && j.at || 'end';
  if (at === 'replace') { S.deck.slides = made; S.cur = 0; }
  else { const i = at === 'start' ? 0 : at === 'after' ? S.cur + 1 : S.deck.slides.length; S.deck.slides.splice(i, 0, ...made); S.cur = i; }
  return `${at === 'replace' ? 'rebuilt the deck with' : 'added'} ${made.length} slide${made.length === 1 ? '' : 's'}`;
}
function runOp(o) {
  const op = String(o.op || '').toLowerCase(), d = S.deck;
  switch (op) {
    case 'update': {
      const i = slideIdx(o.slide), s = d.slides[i];
      if (o.layout && LAYOUT_KEYS().includes(o.layout) && o.layout !== s.layout) { // switch the layout, keeping the text that is already there
        const keep = { title:plain((s.els.find(e => e.role === 'title') || {}).html), body:(s.els.filter(e => e.role === 'body')[0] || {}).html };
        const extras = s.els.filter(e => !e.role), n = S.newSlide(o.layout);
        n.id = s.id; n.notes = s.notes; n.bg = s.bg; n.hidden = s.hidden; n.transition = s.transition; n.els.push(...extras);
        const t = n.els.find(e => e.role === 'title'), b = n.els.find(e => e.role === 'body'); if (t) t.html = line(keep.title); if (b && keep.body) b.html = keep.body;
        d.slides[i] = n; fill(n, o); S.cur = i; return 'updated a slide';
      }
      fill(s, o); S.cur = i; return 'updated a slide';
    }
    case 'add': { const s = build(o); const i = o.at != null ? Math.max(0, Math.min(d.slides.length, parseInt(o.at, 10) - 1)) : d.slides.length; d.slides.splice(i, 0, s); S.cur = i; return 'added a slide'; }
    case 'delete': { if (d.slides.length === 1) throw new Error('A presentation needs at least one slide'); const i = slideIdx(o.slide); d.slides.splice(i, 1); S.cur = Math.min(S.cur, d.slides.length - 1); return 'deleted a slide'; }
    case 'move': { const i = slideIdx(o.slide), j = Math.max(0, Math.min(d.slides.length - 1, parseInt(o.to, 10) - 1)); const [s] = d.slides.splice(i, 1); d.slides.splice(j, 0, s); S.cur = j; return 'moved a slide'; }
    case 'duplicate': { const i = slideIdx(o.slide), c = JSON.parse(JSON.stringify(d.slides[i])); c.id = S.newId(); c.els.forEach(e => { e.id = S.newId(); }); d.slides.splice(i + 1, 0, c); S.cur = i + 1; return 'duplicated a slide'; }
    case 'theme': setTheme(o.name || o.theme, o.variant); return 'theme';
    case 'footer': d.footer = Object.assign({ text:'', num:false, date:false }, d.footer, 'text' in o ? { text:String(o.text || '') } : {}, 'numbers' in o ? { num:!!o.numbers } : {}, 'date' in o ? { date:!!o.date } : {}); return 'footer';
    case 'transition': { if (!TRANS().includes(o.type)) throw new Error('Unknown transition "' + o.type + '"'); const apply = s => { s.transition = Object.assign({}, s.transition, { type:o.type }); }; if (o.slide === 'all' || o.slide == null) d.slides.forEach(apply); else apply(d.slides[slideIdx(o.slide)]); return 'transitions'; }
    case 'hide': d.slides[slideIdx(o.slide)].hidden = o.hidden !== false; return 'hidden slide';
  }
  throw new Error('Unknown op "' + (o.op || '') + '"');
}

const OXAI = window.OXAI = {
  app:'slide', kinds:['slides', 'slideedit'], lastError:'',
  context, system:SYSTEM,
  apply(blk) {
    OXAI.lastError = '';
    if (!blk || !blk.text) { OXAI.lastError = 'There was nothing to change.'; return null; }
    try { S.commitText(); } catch {}
    const before = snap(), done = [];
    try {
      const j = parseJSON(blk.text);
      if (blk.kind === 'slides') done.push(runSlides(j));
      else if (blk.kind === 'slideedit') {
        const ops = Array.isArray(j) ? j : Array.isArray(j.ops) ? j.ops : [];
        if (!ops.length) throw new Error('There were no changes in that answer.');
        ops.forEach(o => { const t = runOp(o); if (t) done.push(t); });
      } else return null;
    } catch (err) {
      restore(before, false); OXAI.lastError = (err && err.message) || 'That change could not be applied.'; return null;
    }
    S.sel = []; S.changed();
    const undo = () => restore(before);
    const what = [...new Set(done)].slice(0, 6).join(', ');
    undo.note = what ? 'Done: ' + what + '.' : 'Updated your presentation.';
    return undo;
  },
};
})();
