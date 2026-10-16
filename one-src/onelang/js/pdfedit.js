/* oneLang — translate a PDF in place.
   analyze(): pdf.js finds the text (lines -> paragraphs) and samples each line's background and ink colour from a low-resolution render.
   build():   pdf-lib paints over the old lines with their own background colour and writes the translation in the same place and colour
              (Noto fonts for Latin, Cyrillic and Greek scripts; other scripts are drawn as a transparent picture per page).
   Pictures, vector art and every untouched part of the file stay exactly as they were. */
(() => {
'use strict';
const P = window.PDFT = {};
const PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const FONTKIT = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
const PDFJS_DATA = { cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/cmaps/', cMapPacked:true, standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/standard_fonts/' };
const fontUrl = (fam, sub, w) => `https://cdn.jsdelivr.net/npm/@fontsource/noto-${fam}@5.0.8/files/noto-${fam}-${sub}-${w}-normal.woff`;
const abort = sig => { if (sig && sig.aborted) throw new DOMException('Aborted', 'AbortError'); };
const tick = () => new Promise(r => setTimeout(r, 0));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

/* "1-10, 15, 20-25" -> [1..10, 15, 20..25] (empty = every page) */
P.parseRange = (str, n) => {
  const t = String(str || '').trim(); if (!t || /^all$/i.test(t)) return Array.from({ length:n }, (_, i) => i + 1);
  const set = new Set();
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part); if (!m) throw new Error('I couldn’t read the page range “' + t + '”. Use something like 1-20, 25.');
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
    if (a < 1 || b > n) throw new Error('This PDF has ' + n + ' pages, so ' + part + ' is out of range.');
    for (let i = a; i <= b; i++) set.add(i);
  }
  return [...set].sort((x, y) => x - y);
};

/* ---------- reading ---------- */
const SERIF = /times|serif|roman|garamond|georgia|palatino|book|cambria|minion|century|baskerville|caslon|didot|charter|utopia|cmr|cmbx/i;
function fontStyle(page, styles, fn) {
  let name = ''; try { if (page.commonObjs.has(fn)) { const o = page.commonObjs.get(fn); name = (o && (o.name || o.fontName)) || ''; } } catch {}
  const fam = (styles && styles[fn] && styles[fn].fontFamily) || '';
  return { bold:/bold|black|heavy|demi|semibold|extrabold/i.test(name), serif:fam === 'serif' || (SERIF.test(name) && !/sans/i.test(name)) };
}
function colours(img, sc, vx0, vy1, x0, x1, yb, yt) {
  if (!img) return { bg:[255, 255, 255], fg:[0, 0, 0], ink:0 };
  const W = img.width, H = img.height, d = img.data;
  const px0 = clamp(Math.floor((x0 - vx0) * sc), 0, W - 1), px1 = clamp(Math.ceil((x1 - vx0) * sc), px0 + 1, W);
  const py0 = clamp(Math.floor((vy1 - yt) * sc), 0, H - 1), py1 = clamp(Math.ceil((vy1 - yb) * sc), py0 + 1, H);
  const bins = new Map();     // exact colours: a flat background is one colour, so the most common one is the background (averaging would tint it)
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
    const i = (y * W + x) * 4, k = d[i] << 16 | d[i + 1] << 8 | d[i + 2];
    bins.set(k, (bins.get(k) || 0) + 1);
  }
  let topK = -1, topN = 0; for (const [k, v] of bins) if (v > topN) { topN = v; topK = k; }
  if (topK < 0) return { bg:[255, 255, 255], fg:[0, 0, 0], ink:0 };
  const bg = [topK >> 16, (topK >> 8) & 255, topK & 255];
  let max = 0; const dist = (r, g, b) => (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2;
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { const i = (y * W + x) * 4; const v = dist(d[i], d[i + 1], d[i + 2]); if (v > max) max = v; }
  if (max < 40 * 40) { const lum = .299 * bg[0] + .587 * bg[1] + .114 * bg[2]; return { bg, fg:lum > 140 ? [0, 0, 0] : [255, 255, 255], ink:0 }; }
  let n = 0, R = 0, G = 0, B = 0; const thr = max * .55;
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) { const i = (y * W + x) * 4; if (dist(d[i], d[i + 1], d[i + 2]) >= thr) { n++; R += d[i]; G += d[i + 1]; B += d[i + 2]; } }
  return { bg, fg:n ? [Math.round(R / n), Math.round(G / n), Math.round(B / n)] : [0, 0, 0], ink:n / ((px1 - px0) * (py1 - py0)) };
}

async function analyzePage(pdf, n, canvas, cx) {
  const page = await pdf.getPage(n);
  const [vx0, vy0, vx1, vy1] = page.view, pw = vx1 - vx0, ph = vy1 - vy0;
  const sc = Math.min(1.25, 1800 / Math.max(pw, ph));
  const vp = page.getViewport({ scale:sc, rotation:0 });
  canvas.width = Math.max(1, Math.ceil(vp.width)); canvas.height = Math.max(1, Math.ceil(vp.height));
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, canvas.width, canvas.height);
  let img = null;
  try { await page.render({ canvasContext:cx, viewport:vp }).promise; img = cx.getImageData(0, 0, canvas.width, canvas.height); } catch {}
  const tc = await page.getTextContent({ normalizeWhitespace:true });
  const fcache = {}; const finfo = fn => fcache[fn] || (fcache[fn] = fontStyle(page, tc.styles, fn));

  /* pieces: horizontal text only (turned text is left alone) */
  const pcs = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const t = it.transform, fs = Math.abs(t[3]);
    if (!(fs > 2.5) || !(t[0] > 0) || Math.abs(t[1]) > .03 * t[0] || Math.abs(t[2]) > .4 * fs) continue;
    pcs.push({ x0:t[4], x1:t[4] + it.width, y:t[5], fs, str:it.str, fn:it.fontName });
  }
  pcs.sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const rows = [];
  for (const p of pcs) {
    let r = null; for (let k = rows.length - 1; k >= 0 && k >= rows.length - 2; k--) if (Math.abs(rows[k].y - p.y) < .4 * Math.max(rows[k].fs, p.fs)) { r = rows[k]; break; }
    if (!r) { r = { y:p.y, fs:p.fs, items:[] }; rows.push(r); }
    r.items.push(p); r.fs = Math.max(r.fs, p.fs);
  }
  /* segments = pieces of one row that belong together (a gap of more than ~1.6 em starts a new column or table cell) */
  const segs = [];
  for (const r of rows) {
    r.items.sort((a, b) => a.x0 - b.x0);
    let s = null;
    for (const p of r.items) {
      const gap = s ? p.x0 - s.x1 : 0;
      if (s && gap < -.3 * p.fs && s.text.endsWith(p.str)) continue;      // text drawn twice to fake bold
      if (!s || gap > 1.6 * Math.max(s.fs, p.fs)) { s = { x0:p.x0, x1:p.x1, y:p.y, fs:p.fs, text:p.str, best:p.str.length, bold:0, serif:0, chars:0 }; segs.push(s); }
      else { if (gap > .12 * p.fs && !/\s$/.test(s.text) && !/^\s/.test(p.str)) s.text += ' '; s.text += p.str; s.x1 = Math.max(s.x1, p.x1); if (p.str.length > s.best) { s.best = p.str.length; s.y = p.y; s.fs = p.fs; } }
      const fi = finfo(p.fn); s.chars += p.str.length; if (fi.bold) s.bold += p.str.length; if (fi.serif) s.serif += p.str.length;
    }
  }
  /* paragraphs */
  const paras = [];
  for (const s of segs) {
    let best = null, bestGap = 1e9;
    for (let k = paras.length - 1; k >= 0 && k >= paras.length - 60; k--) {
      const c = paras[k], l = c.last, vgap = l.y - s.y, fm = Math.max(s.fs, l.fs);
      if (vgap <= .25 * s.fs || vgap > 1.9 * fm || Math.abs(s.fs - l.fs) > .16 * fm) continue;
      const ov = Math.min(s.x1, c.x1) - Math.max(s.x0, c.x0), minw = Math.min(s.x1 - s.x0, c.x1 - c.x0);
      if (!(ov > .5 * minw || Math.abs(s.x0 - c.x0) < 2.6 * s.fs || Math.abs(s.x0 - l.x0) < 2.6 * s.fs)) continue;
      if (c.segs.length > 1 && s.x0 > c.x0 + .9 * s.fs && s.x0 < c.x0 + 3.4 * s.fs && l.x1 < c.x1 - 2.2 * s.fs) continue;     // an indented line after a short one starts a new paragraph
      if (vgap < bestGap) { best = c; bestGap = vgap; }
    }
    if (best) { best.segs.push(s); best.last = s; best.x0 = Math.min(best.x0, s.x0); best.x1 = Math.max(best.x1, s.x1); }
    else paras.push({ segs:[s], last:s, x0:s.x0, x1:s.x1 });
  }
  /* blocks */
  const blocks = [];
  for (const c of paras) {
    let text = '';
    for (const s of c.segs) {
      const t = s.text.replace(/\s+/g, ' ').trim(); if (!t) continue;
      if (!text) text = t; else if (/\p{L}[-‐‑]$/u.test(text) && /^\p{Ll}/u.test(t)) text = text.slice(0, -1) + t; else text += ' ' + t;
    }
    const letters = (text.match(/\p{L}/gu) || []).length, vis = text.replace(/\s/g, '').length;
    if (letters < 2 || letters / Math.max(1, vis) < .5 || /^(https?:\/\/|www\.)\S+$/i.test(text)) continue;
    const lines = c.segs.map(s => {
      const top = s.y + .88 * s.fs, bot = s.y - .24 * s.fs, cl = colours(img, sc, vx0, vy1, s.x0, s.x1, bot, top);
      return { x0:s.x0, x1:s.x1, y:s.y, fs:s.fs, bg:cl.bg, fg:cl.fg, ink:cl.ink };
    });
    const tot = c.segs.reduce((a, s) => a + s.chars, 0) || 1, fs = median(c.segs.map(s => s.fs));
    const gaps = []; for (let i = 0; i + 1 < lines.length; i++) gaps.push(lines[i].y - lines[i + 1].y);
    const lh = lines.length > 1 ? clamp(median(gaps), 1.0 * fs, 2.0 * fs) : 1.2 * fs;
    const centers = lines.map(l => (l.x0 + l.x1) / 2), mc = median(centers), w = c.x1 - c.x0;
    let align = 'left';
    if (lines.length > 1) { const spread = Math.max(...centers) - Math.min(...centers), lefts = lines.map(l => l.x0), lspread = Math.max(...lefts) - Math.min(...lefts); if (spread < .02 * pw && lspread > .03 * pw) align = 'center'; }
    else if (c.x0 - vx0 > .15 * pw && Math.abs(mc - (vx0 + pw / 2)) < .025 * pw) align = 'center';
    blocks.push({ text, lines, x0:c.x0, x1:c.x1, w, fs, lh, align, firstIndent:clamp(lines[0].x0 - c.x0, 0, 4 * fs),
      bold:c.segs.reduce((a, s) => a + s.bold, 0) / tot > .5, serif:c.segs.reduce((a, s) => a + s.serif, 0) / tot > .5, fg:lines[0].fg });
  }
  /* weight: the PDF often hides whether a font is bold (same name, or a standard font), so also compare how much ink each block has with the page's usual text */
  const inks = blocks.flatMap(b => b.lines.map(l => l.ink)).filter(v => v > 0), base = median(inks);
  if (base > 0) blocks.forEach(b => { const ink = b.lines.reduce((a, l) => a + l.ink * (l.x1 - l.x0), 0) / (b.lines.reduce((a, l) => a + (l.x1 - l.x0), 0) || 1); if (ink > 1.4 * base && blocks.length > 2) b.bold = true; });
  try { page.cleanup(); } catch {}
  return { n, vx0, vy0, vx1, vy1, pw, ph, blocks, hadText:tc.items.some(i => i.str && i.str.trim()) };
}

/* pages: array of 1-based numbers. Returns { pages:[{n, blocks}], texts:[…unique paragraph strings], chars, textless } */
P.analyze = async (file, pages, { signal, onProgress } = {}) => {
  const lib = await DOC.loadPdf();
  const pdf = await lib.getDocument(Object.assign({ data:new Uint8Array(await file.arrayBuffer()) }, PDFJS_DATA)).promise;
  const canvas = document.createElement('canvas'), cx = canvas.getContext('2d', { willReadFrequently:true });
  const out = { pages:[], textless:0, numPages:pdf.numPages, texts:[], chars:0 };
  try {
    for (let i = 0; i < pages.length; i++) {
      abort(signal);
      let pg; try { pg = await analyzePage(pdf, pages[i], canvas, cx); } catch (err) { if (err.name === 'AbortError') throw err; pg = { n:pages[i], blocks:[], failed:true }; }
      out.pages.push(pg); if (!pg.blocks.length) out.textless++;
      if (onProgress) onProgress(i + 1, pages.length);
      if (i % 2 === 1) await tick();
    }
  } finally { try { pdf.destroy(); } catch {} canvas.width = canvas.height = 1; }
  const seen = new Set();
  out.pages.forEach(pg => pg.blocks.forEach(b => { if (!seen.has(b.text)) { seen.add(b.text); out.texts.push(b.text); out.chars += b.text.length; } }));
  return out;
};

/* ---------- writing ---------- */
let libsP; const loadLibs = () => libsP || (libsP = (async () => { await ONE.loadScript(PDFLIB); await ONE.loadScript(FONTKIT); return { PL:window.PDFLib, fk:window.fontkit }; })());
const bytesCache = new Map();
const getBytes = async url => { if (!bytesCache.has(url)) bytesCache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error('font ' + r.status); return r.arrayBuffer(); }).then(b => new Uint8Array(b))); try { return await bytesCache.get(url); } catch (e) { bytesCache.delete(url); throw e; } };

function subsetsFor(texts) {
  const need = new Set(['latin']);
  for (const t of texts) for (const ch of t) {
    const c = ch.codePointAt(0);
    if ((c >= 0x100 && c <= 0x24F) || (c >= 0x1E00 && c <= 0x1EFF) || (c >= 0x2C60 && c <= 0x2C7F) || (c >= 0xA720 && c <= 0xA7FF) || c === 0x20AB) { need.add('latin-ext'); need.add('vietnamese'); }
    else if (c >= 0x370 && c <= 0x3FF) need.add('greek');
    else if (c >= 0x400 && c <= 0x52F) { need.add('cyrillic'); need.add('cyrillic-ext'); }
  }
  return [...need];
}
const IGNORE = /[­​-‏‪-‮⁠﻿]/g;

class Book {
  constructor(doc, texts) { this.doc = doc; this.subs = subsetsFor(texts); this.sets = new Map(); this.fonts = new Map(); }
  async fontsFor(serif, bold) {
    const key = (serif ? 'serif' : 'sans') + (bold ? 700 : 400);
    if (this.fonts.has(key)) return this.fonts.get(key);
    const list = [];
    for (const sub of this.subs) {
      try { const f = await this.doc.embedFont(await getBytes(fontUrl(serif ? 'serif' : 'sans', sub, bold ? 700 : 400)), { subset:true }); list.push({ f, set:new Set(f.getCharacterSet()) }); } catch {}
    }
    if (!list.length) throw new Error('The fonts for the translation could not be loaded. Check your connection.');
    this.fonts.set(key, list); return list;
  }
  /* can every letter of this text be written with the embedded fonts? */
  covers(list, text) { for (const ch of text.replace(IGNORE, '')) { if (/\s/.test(ch)) continue; const c = ch.codePointAt(0); if (!list.some(x => x.set.has(c)) && /\p{L}|\p{N}/u.test(ch)) return false; } return true; }
}
function runs(list, str) {
  const out = []; let cur = null;
  for (const ch of str.replace(IGNORE, '').replace(/[\n\t]/g, ' ')) {
    const c = ch.codePointAt(0); let f = null; for (const x of list) if (x.set.has(c)) { f = x.f; break; }
    if (!f) { if (/\s/.test(ch)) f = list[0].f; else continue; }
    if (cur && cur.f === f) cur.s += ch; else { cur = { f, s:ch }; out.push(cur); }
  }
  return out;
}
const widthOf = (list, str, size) => runs(list, str).reduce((w, r) => w + r.f.widthOfTextAtSize(r.s, size), 0);

/* greedy wrap; W1 is the width of the first line */
function wrap(text, measure, size, W, W1, noSpace) {
  const words = noSpace && window.Intl && Intl.Segmenter ? [...new Intl.Segmenter(undefined, { granularity:'word' }).segment(text)].map(s => s.segment) : text.replace(/\s+/g, ' ').trim().split(' ');
  const sep = noSpace ? '' : ' ', lines = []; let cur = '';
  for (const w of words) {
    if (!w) continue;
    const t = cur ? cur + sep + w : w, lim = lines.length ? W : W1;
    if (cur && measure(t, size) > lim) { lines.push(cur.trimEnd()); cur = w.trimStart(); } else cur = t;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  return lines.length ? lines : [''];
}
/* find the largest size (down to 50%) at which the translation fits where the original was */
function fit(b, text, measure, pageLimits, noSpace) {
  const ratio = b.lh / b.fs, n0 = b.lines.length;
  let W = b.w + b.fs * .15, x = b.x0, W1 = Math.max(W - b.firstIndent, W * .5);
  if (n0 === 1) {   // a single line (title, caption) may grow sideways before it shrinks
    const room = b.align === 'center' ? 2 * Math.min((b.x0 + b.x1) / 2 - pageLimits.left, pageLimits.right - (b.x0 + b.x1) / 2) : pageLimits.right - b.x0;
    const W2 = Math.max(W, Math.min(W * 1.45, room)); if (b.align === 'center') x = (b.x0 + b.x1) / 2 - W2 / 2; W = W2; W1 = W2;
  }
  let best = null;
  for (let s = 1; s >= .5; s -= .05) {
    const size = b.fs * s, lh = size * ratio, lines = wrap(text, measure, size, W, W1, noSpace);
    best = { size, lh, lines, W, W1, x };
    if ((lines.length - 1) * lh <= (n0 - 1) * b.lh + .45 * b.lh) break;
  }
  return best;
}

const tint = c => c.map(v => v / 255);
/* returns the translated PDF as a Blob. info: result of analyze(); map: Map(paragraph text -> translation) */
P.build = async (file, info, map, to, { keepOnly = false, signal, onProgress } = {}) => {
  const { PL, fk } = await loadLibs(); const { PDFDocument, rgb } = PL;
  const src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), { ignoreEncryption:true, updateMetadata:false });
  let doc = src; const pageOf = {};
  if (keepOnly) {
    doc = await PDFDocument.create(); const idx = info.pages.map(p => p.n - 1);
    const got = await doc.copyPages(src, idx); got.forEach((p, i) => { doc.addPage(p); pageOf[info.pages[i].n] = p; });
  } else info.pages.forEach(p => { pageOf[p.n] = src.getPage(p.n - 1); });
  doc.registerFontkit(fk);
  const done = info.pages.flatMap(p => p.blocks).map(b => map.get(b.text)).filter(Boolean);
  const book = new Book(doc, done);
  const rtl = LANG.rtl(to), noSpace = /^(zh|ja|th|km|lo|my)/.test(to);
  const stats = { blocks:0, picture:0, skipped:0, pages:0 };

  for (let pi = 0; pi < info.pages.length; pi++) {
    abort(signal);
    const pg = info.pages[pi], page = pageOf[pg.n], todo = pg.blocks.filter(b => map.get(b.text));
    if (todo.length) {
      stats.pages++;
      const limits = { left:pg.vx0 + .05 * pg.pw, right:pg.vx1 - .05 * pg.pw };
      let ctx = null, S = 1, canvas = null, cvBlocks = 0;
      const cv = () => { if (!ctx) { S = Math.min(3, 2600 / Math.max(pg.pw, pg.ph)); canvas = document.createElement('canvas'); canvas.width = Math.ceil(pg.pw * S); canvas.height = Math.ceil(pg.ph * S); ctx = canvas.getContext('2d'); } return ctx; };
      for (const b of todo) {
        const text = map.get(b.text).replace(/\s+/g, ' ').trim(); if (!text) continue;
        const list = await book.fontsFor(b.serif, b.bold), canvasPath = rtl || noSpace || !book.covers(list, text);
        const lay = canvasPath ? (() => {
          const c = cv(), face = b.serif ? '"Noto Serif","Times New Roman",serif' : '"Noto Sans","Segoe UI",Arial,sans-serif';
          const font = size => (b.bold ? '700 ' : '400 ') + (size * S) + 'px ' + face;
          const measure = (t, size) => { c.font = font(size); return c.measureText(t).width / S; };
          return Object.assign(fit(b, text, measure, limits, noSpace), { c, font });
        })() : fit(b, text, (t, size) => widthOf(list, t, size), limits, noSpace);
        // 1. paint over the old lines with their own background
        for (const l of b.lines) page.drawRectangle({ x:l.x0 - .12 * l.fs, y:l.y - .24 * l.fs, width:l.x1 - l.x0 + .24 * l.fs, height:1.12 * l.fs, color:rgb(...tint(l.bg)), borderWidth:0 });
        // 2. write the translation
        const y0 = b.lines[0].y, centre = b.align === 'center', cx0 = (b.x0 + b.x1) / 2;
        lay.lines.forEach((line, i) => {
          const y = y0 - i * lay.lh, first = i === 0 && b.lines.length > 1 && !centre && !rtl ? b.firstIndent : 0;
          const lw = canvasPath ? lay.c.measureText(line).width / S : widthOf(list, line, lay.size);
          let x = rtl ? (centre ? cx0 + lw / 2 : b.x1) : centre ? cx0 - lw / 2 : lay.x + first;
          if (b.lines.length === 1 && lay.W > b.w && !centre && !rtl) x = b.x0;
          if (canvasPath) {
            const c = lay.c; c.font = lay.font(lay.size); c.fillStyle = `rgb(${b.fg.join(',')})`; c.direction = rtl ? 'rtl' : 'ltr'; c.textBaseline = 'alphabetic'; c.textAlign = rtl ? 'right' : 'left';
            c.fillText(line, (x - pg.vx0) * S, (pg.vy1 - y) * S);
          } else {
            let px = x; for (const r of runs(list, line)) { page.drawText(r.s, { x:px, y, size:lay.size, font:r.f, color:rgb(...tint(b.fg)) }); px += r.f.widthOfTextAtSize(r.s, lay.size); }
          }
        });
        stats.blocks++; if (canvasPath) { cvBlocks++; stats.picture++; }
      }
      if (cvBlocks) {
        const png = await new Promise(ok => canvas.toBlob(ok, 'image/png')); const im = await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
        page.drawImage(im, { x:pg.vx0, y:pg.vy0, width:pg.pw, height:pg.ph }); canvas.width = canvas.height = 1;
      }
    } else if (pg.blocks.length) stats.skipped++;
    if (onProgress) onProgress(pi + 1, info.pages.length);
    if (pi % 2 === 1) await tick();
  }
  doc.setProducer('oneLang'); try { doc.setTitle(doc.getTitle() || ''); } catch {}
  const bytes = await doc.save({ useObjectStreams:true });
  return { blob:new Blob([bytes], { type:'application/pdf' }), stats };
};
})();
