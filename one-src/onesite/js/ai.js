/* oneSite: bridge for the epic AI panel (shared/one-ai.js, optional and off unless switched on in settings).
   The panel reads the open page as JSON (context) plus the section schema (schema), and applies the model's <<site>> reply (apply) as ONE
   undoable change. Everything the model writes is checked against the real section definitions first: unknown types, layouts, icons and
   unsafe links are dropped, and pictures are never invented (only "ph:" placeholders or https links). */
(() => {
'use strict';
const B = BLOCKS, R = SITE, KEEP = '(picture kept)';
const OSAI = window.OSAI = { lastError:'' };
const str = (v, n = 4000) => String(v == null ? '' : v).slice(0, n);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = v => JSON.parse(JSON.stringify(v));
// pictures the user uploaded are data: URIs; the model only ever sees a marker and must copy it back
const slim = v => typeof v === 'string' ? (v.startsWith('data:') ? KEEP : v) : Array.isArray(v) ? v.map(slim) : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'bgImg').map(([k, x]) => [k, slim(x)])) : v;
// the save timer rewrites site.updated a moment after every change, so it is left out when comparing
const state = () => JSON.stringify({ site:M.site, pi:M.pi }, (k, v) => k === 'updated' ? undefined : v);

/* ---------- what the model sees ---------- */
OSAI.context = () => {
  const s = M.site, pg = s && M.page(); if (!s || !pg) return null;
  const sec = b => ({ id:b.id, type:b.type, v:b.v, bg:b.bg || 'default', pad:b.pad || 'm', data:slim(b.data) });
  // shown in the same shape the model answers with, because models copy the shape they were given
  return { kind:'site', title:pg.name, text:JSON.stringify({
    title:s.title, theme:s.theme, settings:{ description:s.settings.description || '' },
    header:{ v:s.header.v, data:slim(s.header.data) }, footer:{ v:s.footer.v, data:slim(s.footer.data) },
    openPageName:pg.name, otherPages:s.pages.filter(p => p !== pg).map(p => p.name),
    page:pg.sections.map(sec) }) };
};
const doc = fl => {
  const kind = fl[1], opt = fl[3];
  if (kind === 'link') return '{label,url}|null';
  if (kind === 'image') return 'picture';
  if (kind === 'icon') return 'icon';
  if (kind === 'toggle') return 'true|false';
  if (kind === 'choice') return opt.map(o => o[0]).join('|');
  if (kind === 'list') return '[' + shape(opt.fields) + ']';
  if (kind === 'elements') return '[element]';
  return 'text';
};
const shape = fields => '{' + fields.map(fl => fl[0] + ':' + doc(fl)).join(',') + '}';
OSAI.schema = () => [
  'Section types (type, layouts v, data fields):',
  ...B.ORDER.map(t => `${t} (v: ${Object.keys(B[t].variants).join('|')}) ${shape(B[t].fields)}`),
  'Elements of a "custom" section: items is a list of {"kind":...} plus the fields of that kind:',
  ...Object.entries(B.ELEMENTS).map(([k, e]) => `${k} ${shape(e.fields)}`),
  `header (v: ${Object.keys(B.nav.variants).join('|')}) ${shape(B.nav.fields)}`,
  `footer (v: ${Object.keys(B.footer.variants).join('|')}) ${shape(B.footer.fields)}`,
  'bg is default|alt|accent|dark, pad is s|m|l. Pictures: "ph:g1" to "ph:g12" (any scene), "ph:p1" to "ph:p6" (a person), or an https link.',
  'palette: ' + Object.keys(R.PALETTES).join('|') + '. font: ' + Object.keys(R.FONTS).join('|') + '. radius: ' + Object.keys(R.RADII).join('|') + '. accent: a #rrggbb colour or null.',
  'icon: ' + (window.ED && ED.ICONS ? ED.ICONS.join(', ') : 'star, bolt, favorite, verified') + '.',
].join('\n');

/* ---------- checking what the model wrote ---------- */
const okUrl = u => { u = str(u, 500).trim(); return /^(javascript|data|vbscript):/i.test(u) ? '#' : u; };
function normData(fields, raw, old, base) {
  const out = copy(old || base);
  if (!isObj(raw)) return out;
  fields.forEach(fl => {
    const key = fl[0], kind = fl[1], opt = fl[3];
    if (!(key in raw)) return;
    const x = raw[key], prev = out[key];
    if (kind === 'text' || kind === 'area') { if (x != null && typeof x !== 'object') out[key] = str(x); }
    else if (kind === 'link') { if (x === null) out[key] = null; else if (isObj(x)) out[key] = { label:str(x.label, 120), url:okUrl(x.url) }; }
    else if (kind === 'image') { if (typeof x === 'string' && x !== KEEP && (/^ph:[\w-]{1,20}$/.test(x) || /^https:\/\/\S+$/.test(x))) out[key] = x; }
    else if (kind === 'icon') { if (typeof x === 'string' && /^[a-z0-9_]{2,40}$/.test(x)) out[key] = x; }
    else if (kind === 'choice') { if (opt.some(o => o[0] === x)) out[key] = x; }
    else if (kind === 'toggle') { if (typeof x === 'boolean') out[key] = x; }
    else if (kind === 'list') {
      if (Array.isArray(x)) out[key] = x.slice(0, opt.max || 30).filter(isObj).map((it, i) => normData(opt.fields, it, Array.isArray(prev) && prev[i] ? prev[i] : null, opt.make()));
    } else if (kind === 'elements') {
      if (Array.isArray(x)) out[key] = x.slice(0, 40).filter(it => isObj(it) && B.ELEMENTS[it.kind]).map((it, i) => {
        const E1 = B.ELEMENTS[it.kind], p = Array.isArray(prev) && prev[i] && prev[i].kind === it.kind ? prev[i] : null;
        return Object.assign({ kind:it.kind }, normData(E1.fields, it, p, E1.make()));
      });
    }
  });
  return out;
}
function normSection(raw, olds, used) {
  if (!isObj(raw) || !B.ORDER.includes(raw.type)) return null;
  const def = B[raw.type], old = raw.id && olds.get(raw.id), o = old && old.type === raw.type ? old : null;
  const s = o ? copy(o) : B.new(raw.type);
  if (used.has(s.id)) s.id = ONE.uid();
  used.add(s.id);
  if (Object.keys(def.variants).includes(raw.v)) s.v = raw.v;
  if (['default', 'alt', 'accent', 'dark'].includes(raw.bg) || (raw.bg === 'image' && s.bgImg)) s.bg = raw.bg;
  if (['s', 'm', 'l'].includes(raw.pad)) s.pad = raw.pad;
  s.data = normData(def.fields, raw.data, o ? o.data : null, def.make());
  return s;
}
function normGlobal(cur, raw, def) {
  if (!isObj(raw)) return false;
  if (Object.keys(def.variants).includes(raw.v)) cur.v = raw.v;
  cur.data = normData(def.fields, raw.data, cur.data, def.make());
  return true;
}
const sections = (list, olds) => { const used = new Set(); return (Array.isArray(list) ? list : []).slice(0, 40).map(r => normSection(r, olds, used)).filter(Boolean); };

/* ---------- applying it ---------- */
// text: the model's JSON. opts.truncated: the model only saw part of this page, so it must not replace the whole page.
OSAI.apply = (text, opts) => {
  OSAI.lastError = '';
  const fail = m => { OSAI.lastError = m; return null; };
  let j;
  try { const t = String(text).replace(/```(?:json)?/gi, ''); j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return fail('The reply was not valid JSON.'); }
  if (!isObj(j)) return fail('The reply was not a site change.');
  // tolerate the model answering in the older "site / sections" shape
  if (j.page === undefined && Array.isArray(j.sections)) j.page = j.sections;
  if (isObj(j.site)) { if (j.title === undefined && j.site.title) j.title = j.site.title; if (j.theme === undefined && j.site.theme) j.theme = j.site.theme; if (j.settings === undefined && j.site.description != null) j.settings = { description:j.site.description }; }
  if (j.page !== undefined && opts && opts.truncated) return fail('This page is too long for epic AI to see all of it, so it was not replaced. Ask for one section at a time, or add a new page instead.');
  const before = state(), oldSite = M.site, oldPi = M.pi, draft = copy(M.site), pg = draft.pages[M.pi] || draft.pages[0];
  let pi = M.pi;
  if (j.page !== undefined) {
    const list = sections(j.page, new Map(pg.sections.map(b => [b.id, b])));
    if (!list.length) return fail('The new page had no valid sections.');
    pg.sections = list;
  }
  if (Array.isArray(j.addPages)) {
    const first = draft.pages.length;
    j.addPages.slice(0, 8).forEach(p => {
      if (!isObj(p)) return;
      const list = sections(p.sections, new Map());
      if (!list.length) return;
      let name = str(p.name, 40).trim() || 'New page', k = 2;
      while (draft.pages.some(x => x.name.toLowerCase() === name.toLowerCase())) name = str(p.name, 36).trim() + ' ' + k++;
      draft.pages.push({ id:ONE.uid(), name, sections:list });
    });
    if (draft.pages.length > first && j.page === undefined) pi = first;
  }
  if (isObj(j.theme)) {
    const t = draft.theme;
    if (R.PALETTES[j.theme.palette]) { t.palette = j.theme.palette; if (j.theme.accent === undefined) t.accent = null; }
    if (R.FONTS[j.theme.font]) t.font = j.theme.font;
    if (R.RADII[j.theme.radius]) t.radius = j.theme.radius;
    if (j.theme.accent === null) t.accent = null; else if (typeof j.theme.accent === 'string' && /^#[0-9a-f]{6}$/i.test(j.theme.accent)) t.accent = j.theme.accent;
  }
  if (isObj(j.settings)) {
    if (j.settings.description != null) draft.settings.description = str(j.settings.description, 300);
    if (typeof j.settings.favicon === 'string' && j.settings.favicon.trim()) draft.settings.favicon = [...j.settings.favicon.trim()].slice(0, 2).join('');
  }
  normGlobal(draft.header, j.header, B.nav);
  normGlobal(draft.footer, j.footer, B.footer);
  if (typeof j.title === 'string' && j.title.trim()) { draft.title = str(j.title, 60).trim(); const inp = document.getElementById('docTitle'); if (inp) inp.value = draft.title; }
  M.site = draft; M.pi = Math.min(pi, draft.pages.length - 1);
  if (state() === before) { M.site = oldSite; M.pi = oldPi; return fail('Nothing was different, so nothing changed.'); }
  if (window.ED) ED.sel = null;
  M.changed(true, 'all');
  const after = state();
  // M.changed records one step in the app's own undo history, so undoing is the app's undo, as long as nothing else was edited since
  return () => { if (state() !== after) throw new Error('The site changed since.'); M.go(-1); };
};
})();
