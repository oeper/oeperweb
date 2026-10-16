/* oneLang — documents: take a file apart into pieces of text, and put the translated pieces back in the same file.
   DOC.read(file) -> { kind, name, segs:[text…], build(map, target) -> { blob, name, mime }, extra? }   (map: original text -> translation) */
(() => {
'use strict';
const D = window.DOC = {};
const { el } = ONE;
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main', S_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const hasLetters = s => /\p{L}/u.test(s);
const sp = s => E_split(s);
const E_split = s => { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s); return { lead:m[1], core:m[2], trail:m[3] }; };
const tr = (map, s) => { const { lead, core, trail } = sp(s); return core && map.has(core) ? lead + map.get(core) + trail : s; };

D.EXTS = ['txt','md','markdown','srt','vtt','csv','tsv','json','html','htm','docx','pptx','xlsx','pdf'];
D.accept = D.EXTS.map(e => '.' + e).join(',');
D.MAX_BYTES = 12 * 1024 * 1024;
D.MAX_CHARS = 150000;   // a lot of text is a lot of requests (the worker allows about 150 per 10 minutes), so keep a document within one afternoon of limits
const ext = n => (String(n).split('.').pop() || '').toLowerCase();
const baseName = n => String(n).replace(/\.[^.]+$/, '');

let zipP, pdfP;
const loadZip = () => zipP || (zipP = ONE.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').then(() => window.JSZip));
const loadPdf = () => pdfP || (pdfP = ONE.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js').then(() => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js'; return window.pdfjsLib; }));

/* ---------- plain text, Markdown ---------- */
function readText(text, name, kind) {
  const parts = text.split(/(\n{2,})/), segs = [], keep = []; let fence = false;
  parts.forEach(p => {
    if (/^\n{2,}$/.test(p)) { keep.push({ raw:p }); return; }
    const opens = (p.match(/^\s*(```|~~~)/gm) || []).length; const was = fence; if (opens % 2) fence = !fence;
    const code = was || opens > 0;
    if (!code && hasLetters(p) && !(kind === 'md' && /^\s*(---|\*\*\*|___)\s*$/.test(p))) { segs.push(p); keep.push({ seg:p }); } else keep.push({ raw:p });
  });
  return { segs, build:(map) => keep.map(k => k.seg != null ? tr(map, k.seg) : k.raw).join('') };
}

/* ---------- subtitles ---------- */
function readSubs(text, vtt) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/), segs = [], out = [];
  blocks.forEach(b => {
    const lines = b.split('\n'); const ti = lines.findIndex(l => /-->/.test(l));
    if (ti < 0 || /^NOTE\b|^STYLE\b|^WEBVTT/.test(b)) { out.push({ raw:b }); return; }
    const body = lines.slice(ti + 1).join('\n');
    if (body.trim() && hasLetters(body)) { segs.push(body); out.push({ head:lines.slice(0, ti + 1).join('\n'), seg:body }); } else out.push({ raw:b });
  });
  return { segs, build:map => out.map(o => o.raw != null ? o.raw : o.head + '\n' + tr(map, o.seg)).join('\n\n') + '\n' };
}

/* ---------- CSV / TSV ---------- */
function parseCsv(text, d) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && !cur) q = true; else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function readCsv(text, d) {
  const rows = parseCsv(text, d), segs = [];
  const numeric = s => /^[\s\d.,:%$€£¥+\-/()]*$/.test(s);
  rows.forEach(r => r.forEach(c => { if (c.trim() && hasLetters(c) && !numeric(c) && !/^(https?:\/\/|www\.)\S+$|^\S+@\S+\.\S+$/.test(c.trim())) segs.push(c); }));
  const q = c => (c.includes(d) || /["\n\r]/.test(c)) ? '"' + c.replace(/"/g, '""') + '"' : c;
  return { segs, build:map => rows.map(r => r.map(c => q(tr(map, c))).join(d)).join('\n') + '\n' };
}

/* ---------- JSON: string values only ---------- */
function readJson(text) {
  const data = JSON.parse(text), segs = [];
  const skip = s => /^[a-z0-9_.\-:/#@]+$/.test(s) || !hasLetters(s);
  const walk = (v, f) => { if (typeof v === 'string') return f(v); if (Array.isArray(v)) return v.map(x => walk(x, f)); if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k], f); return o; } return v; };
  walk(data, s => { if (!skip(s.trim())) segs.push(s); return s; });
  return { segs, build:map => JSON.stringify(walk(data, s => skip(s.trim()) ? s : tr(map, s)), null, 2) + '\n' };
}

/* ---------- HTML ---------- */
function readHtml(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html'), segs = [], nodes = [], attrs = [];
  const SKIP = /^(script|style|noscript|code|pre|textarea|svg|kbd|samp|template)$/i;
  const walk = n => {
    if (n.nodeType === 3) { if (hasLetters(n.nodeValue)) { segs.push(n.nodeValue); nodes.push(n); } return; }
    if (n.nodeType !== 1 || SKIP.test(n.nodeName)) return;
    for (const a of ['alt', 'title', 'placeholder', 'aria-label']) { const v = n.getAttribute && n.getAttribute(a); if (v && hasLetters(v)) { segs.push(v); attrs.push([n, a, v]); } }
    n.childNodes.forEach(walk);
  };
  walk(doc.documentElement);
  return { segs, build:(map, to) => {
    nodes.forEach(n => { n.nodeValue = tr(map, n.nodeValue); }); attrs.forEach(([n, a, v]) => n.setAttribute(a, tr(map, v)));
    if (to) { doc.documentElement.setAttribute('lang', to.split('-')[0]); if (LANG.rtl(to)) doc.documentElement.setAttribute('dir', 'rtl'); }
    return '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
  } };
}

/* ---------- Office files (zip of XML) ---------- */
const parseXml = s => { const d = new DOMParser().parseFromString(s, 'application/xml'); if (d.getElementsByTagName('parsererror').length) throw new Error('bad xml'); return d; };
const ser = d => XML_HEAD + new XMLSerializer().serializeToString(d).replace(/^<\?xml[^>]*\?>\s*/, '');
/* walk a paragraph in order: w:t / a:t hold text, tabs and line breaks split it into groups that are translated one by one */
function groupsOf(p, ns, tText, tBreaks) {
  const groups = []; let cur = [];
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (c.namespaceURI === ns && c.localName === tText) cur.push(c);
      else if (c.namespaceURI === ns && tBreaks.includes(c.localName)) { if (cur.length) groups.push(cur); cur = []; }
      else if (c.localName === 'instrText' || c.localName === 'fldChar') { /* field codes are not text */ }
      else walk(c);
    }
  };
  walk(p); if (cur.length) groups.push(cur);
  return groups;
}
function xmlParts(files, regex, ns, para, tText, tBreaks) {
  const parts = [];
  for (const [path, xml] of files) {
    if (!regex.test(path)) continue;
    let doc; try { doc = parseXml(xml); } catch { continue; }
    const units = [];
    [...doc.getElementsByTagNameNS(ns, para)].forEach(p => groupsOf(p, ns, tText, tBreaks).forEach(g => { const text = g.map(t => t.textContent).join(''); if (hasLetters(text)) units.push({ g, text }); }));
    parts.push({ path, doc, units });
  }
  return parts;
}
const setGroup = (g, text) => { g.forEach((t, i) => { t.textContent = i === 0 ? text : ''; }); g[0].setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); };
async function readOffice(file, k) {
  const JSZip = await loadZip(); const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const files = []; for (const path of Object.keys(zip.files)) { if (zip.files[path].dir || !/\.xml$/i.test(path)) continue; files.push([path, await zip.files[path].async('string')]); }
  let parts = [];
  if (k === 'docx') parts = xmlParts(files, /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/, W_NS, 'p', 't', ['tab', 'br', 'cr']);
  else if (k === 'pptx') parts = xmlParts(files, /^ppt\/(slides\/slide\d+|notesSlides\/notesSlide\d+|diagrams\/data\d*)\.xml$/, A_NS, 'p', 't', ['br']);
  else {
    // xlsx: the shared strings (every text cell points into this list) and any inline strings in the sheets
    for (const [path, xml] of files) {
      if (!/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(path)) continue;
      let doc; try { doc = parseXml(xml); } catch { continue; }
      const units = [];
      const items = path.endsWith('sharedStrings.xml') ? [...doc.getElementsByTagNameNS(S_NS, 'si')] : [...doc.getElementsByTagNameNS(S_NS, 'is')];
      items.forEach(si => { const g = [...si.getElementsByTagNameNS(S_NS, 't')].filter(t => !(t.parentNode && t.parentNode.localName === 'rPh')); const text = g.map(t => t.textContent).join(''); if (g.length && hasLetters(text)) units.push({ g, text }); });
      if (units.length) parts.push({ path, doc, units });
    }
  }
  const segs = []; parts.forEach(p => p.units.forEach(u => segs.push(u.text)));
  const mime = { docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[k];
  return { segs, mime, build:async (map, to) => {
    parts.forEach(p => { p.units.forEach(u => { const out = tr(map, u.text); if (out !== u.text) setGroup(u.g, out); });
      if (to && LANG.rtl(to) && k === 'docx') [...p.doc.getElementsByTagNameNS(W_NS, 'p')].forEach(par => { let pPr = [...par.children].find(c => c.localName === 'pPr'); if (!pPr) { pPr = p.doc.createElementNS(W_NS, 'w:pPr'); par.insertBefore(pPr, par.firstChild); } if (![...pPr.children].some(c => c.localName === 'bidi')) pPr.appendChild(p.doc.createElementNS(W_NS, 'w:bidi')); });
      zip.file(p.path, ser(p.doc)); });
    return zip.generateAsync({ type:'blob', mimeType:mime, compression:'DEFLATE' });
  } };
}

/* ---------- PDF: text comes out in reading order and goes back as a Word document (a PDF can't be edited in place) ---------- */
async function readPdf(file) {
  const lib = await loadPdf(); const pdf = await lib.getDocument({ data:await file.arrayBuffer() }).promise;
  const paras = [];   // { text, page }
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n), tc = await page.getTextContent();
    const rows = []; // group by baseline
    tc.items.forEach(it => { if (!it.str || !it.str.trim()) return; const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || 10; let r = rows.find(r => Math.abs(r.y - y) < h * .45); if (!r) { r = { y, h, items:[] }; rows.push(r); } r.items.push({ x, s:it.str }); });
    rows.sort((a, b) => b.y - a.y);
    let cur = '', prev = null;
    rows.forEach(r => {
      const line = r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim();
      if (prev && (prev.y - r.y) > prev.h * 1.9 && cur) { paras.push({ text:cur, page:n }); cur = ''; }
      cur = cur ? (/[-‐]$/.test(cur) ? cur.slice(0, -1) + line : cur + ' ' + line) : line; prev = r;
    });
    if (cur) paras.push({ text:cur, page:n });
  }
  if (!paras.length) throw new Error('This PDF has no text I can read. It may be a scan (a picture of a page): use the Images tab for that.');
  const segs = paras.map(p => p.text);
  const docx = async (lines, rtl) => {
    const JSZip = await loadZip(); const z = new JSZip(); let lastPage = 0;
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = lines.map((l, i) => { const br = paras[i].page !== lastPage && lastPage ? '<w:r><w:br w:type="page"/></w:r>' : ''; lastPage = paras[i].page;
      return '<w:p><w:pPr>' + (rtl ? '<w:bidi/>' : '') + '<w:spacing w:after="160"/></w:pPr>' + br + '<w:r>' + (rtl ? '<w:rPr><w:rtl/></w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(l) + '</w:t></w:r></w:p>'; }).join('');
    z.file('[Content_Types].xml', XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/document.xml', XML_HEAD + '<w:document xmlns:w="' + W_NS + '"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');
    return z.generateAsync({ type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression:'DEFLATE' });
  };
  return { segs, pages:pdf.numPages, note:'PDFs can’t be edited in place, so the translation comes back as a Word document (the layout is simplified).',
    mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    build:async (map, to) => docx(paras.map(p => tr(map, p.text)), LANG.rtl(to)),
    text:map => paras.map(p => tr(map, p.text)).join('\n\n') };
}

/* ---------- entry ---------- */
D.read = async file => {
  const k = ext(file.name);
  if (!D.EXTS.includes(k)) throw new Error('That kind of file (.' + k + ') isn’t supported yet. Try ' + D.EXTS.map(e => '.' + e).join(', ') + '.');
  if (file.size > D.MAX_BYTES) throw new Error('That file is over ' + Math.round(D.MAX_BYTES / 1048576) + ' MB. Try a smaller one or split it.');
  let r, outExt = k, mime = 'text/plain';
  if (['docx', 'pptx', 'xlsx'].includes(k)) r = await readOffice(file, k);
  else if (k === 'pdf') { r = await readPdf(file); outExt = 'docx'; }
  else {
    const text = (await file.text()).replace(/^﻿/, '');
    if (k === 'srt') r = readSubs(text, false); else if (k === 'vtt') r = readSubs(text, true);
    else if (k === 'csv') { r = readCsv(text, ','); mime = 'text/csv'; } else if (k === 'tsv') { r = readCsv(text, '\t'); mime = 'text/tab-separated-values'; }
    else if (k === 'json') { r = readJson(text); mime = 'application/json'; }
    else if (k === 'html' || k === 'htm') { r = readHtml(text); mime = 'text/html'; }
    else r = readText(text, file.name, k === 'txt' ? 'txt' : 'md');
  }
  const chars = r.segs.reduce((n, s) => n + s.length, 0);
  return { kind:k, name:file.name, size:file.size, segs:r.segs, chars, note:r.note || '', pages:r.pages || 0, outExt,
    build:async (map, to) => { const out = await r.build(map, to); const blob = out instanceof Blob ? out : new Blob([out], { type:(r.mime || mime) + ';charset=utf-8' }); return { blob, name:baseName(file.name) + ' (' + LANG.name(to) + ').' + outExt, mime:r.mime || mime }; },
    text:r.text };
};
})();
