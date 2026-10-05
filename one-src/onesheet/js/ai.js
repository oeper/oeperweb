/* oneSheet — what the epic AI assistant (shared/one-ai.js on oeper.dev) sees and can do here.
   window.OXAI: context() describes the workbook as text, apply(block) carries out a <<cells>> or <<sheetedit>> block from
   the AI and returns an undo function (or null, with OXAI.lastError saying why). Everything goes through the same model
   and helpers the ribbon uses (X.setRaw, X.setStyle, X.sortRange, ...), and the whole change is one undo step. */
(() => {
'use strict';
const MAX_CELLS = 6000, MAX_ROWS = 400, MAX_COLS = 40;
const clip = (s, n) => { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const one = v => clip(String(v == null ? '' : v).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/'), 120);

/* ---------- reading ---------- */
const bounds = sh => ({ R:Math.max(1, X.usedRows(sh)), C:Math.max(1, X.usedCols(sh)) });
function dump(sh, rows, cols, from = 0) {
  const R = Math.min(rows, bounds(sh).R - from), C = Math.min(cols, bounds(sh).C), out = [];
  out.push('    | ' + Array.from({ length:C }, (_, c) => X.colName(c)).join(' | '));
  for (let r = from; r < from + R; r++) out.push(String(r + 1).padStart(3) + ' | ' + Array.from({ length:C }, (_, c) => one(X.raw(sh, r, c))).join(' | '));
  return out.join('\n');
}
function context() {
  const wb = X.wb, sh = X.sh, b = bounds(sh), g = X.normSel();
  const empty = !Object.keys(sh.cells).length;
  const lines = [`Workbook "${wb.title}". Sheets: ${wb.sheets.map((s, i) => `"${s.name}"${i === wb.active ? ' (open)' : ''}`).join(', ')}.`,
    empty ? `The open sheet "${sh.name}" is empty.` : `Open sheet "${sh.name}": data in A1:${X.addr(b.R - 1, b.C - 1)} (${b.R} rows, ${b.C} columns).`,
    `The user has selected ${X.rangeStr(g)}.`];
  if (sh.charts.length) lines.push('Charts on this sheet: ' + sh.charts.map(c => `${c.type} of ${c.src}${c.title ? ' titled "' + c.title + '"' : ''}`).join('; ') + '.');
  if (sh.tables.length) lines.push('Tables: ' + sh.tables.map(t => X.rangeStr(t)).join(', ') + '.');
  if (sh.cf.length) lines.push(`${sh.cf.length} conditional formatting rule(s).`);
  if (sh.freeze && (sh.freeze.r || sh.freeze.c)) lines.push(`Frozen: ${sh.freeze.r} row(s), ${sh.freeze.c} column(s).`);
  const names = Object.keys(wb.names || {}); if (names.length) lines.push('Defined names: ' + names.map(n => n + ' = ' + wb.names[n]).join('; ') + '.');
  let text = lines.join('\n');
  let truncated = false;
  if (!empty) {
    truncated = b.R > MAX_ROWS || b.C > MAX_COLS;
    text += `\n\nCells of "${sh.name}" (row numbers on the left, "|" between columns, formulas shown as written${truncated ? `; only the first ${Math.min(b.R, MAX_ROWS)} rows and ${Math.min(b.C, MAX_COLS)} columns are shown` : ''}):\n` + dump(sh, MAX_ROWS, MAX_COLS);
  }
  wb.sheets.forEach(s => { if (s === sh || !Object.keys(s.cells).length) return; const bb = bounds(s); text += `\n\nSheet "${s.name}" (${bb.R} rows, ${bb.C} columns; first rows only):\n` + dump(s, 12, 14); });
  return { kind:'sheet', title:wb.title, text, truncated };
}

/* ---------- the instructions the model gets ---------- */
const SYSTEM = 'The user is in oneSheet, a spreadsheet app. You can change the workbook directly with blocks, so do NOT paste tables into a plain text answer. The open workbook is shown to you as a grid. '
  + 'DATA: <<cells at="A1" sheet="Name">> followed by one row per line, with "|" between the columns, then <</cells>>. "at" is the top-left cell (default A1); "sheet" is optional and a new sheet is created if that name does not exist yet (leave it out to use the open sheet). A cell that starts with = is a formula (use real formulas such as =SUM(B2:B9), =B2*C2, =IF(...), =VLOOKUP(...) rather than typing results). Numbers are plain (1234.5, 12%, $4.50, 2026-03-01). Leave a cell empty for a blank. A blank line is an empty row and counts toward row numbers. Do not write a markdown separator row (---). Write the header row first. The first line of a block is on the row given by "at", so work out the exact row of every cell before you write a formula (a formula must never point at its own cell or at the wrong row). '
  + 'EVERYTHING ELSE: <<sheetedit>> followed by JSON {"sheet":"optional sheet name","ops":[...]} then <</sheetedit>>. Each op has an "op" field: '
  + '{"op":"format","range":"A1:D1","bold":true,"italic":true,"underline":true,"fill":"#1F4E79","color":"#FFFFFF","size":12,"align":"left|center|right","valign":"top|middle","wrap":true,"fmt":"number|currency|accounting|percent|date|time|text|general","dec":2,"symbol":"$","border":"all|outside|bottom|top|none"} (formatting, number formats and borders on a range; give only what you change); '
  + '{"op":"width","cols":"A:C","px":120} and {"op":"height","rows":"1:1","px":32} and {"op":"autofit","cols":"A:F"}; '
  + '{"op":"freeze","rows":1,"cols":0}; {"op":"merge","range":"A1:D1"}; {"op":"clear","range":"A1:D9","what":"all|contents|formats"}; '
  + '{"op":"sort","range":"A1:D20","by":"B","desc":true,"header":true}; {"op":"filter","range":"A1:D20"}; {"op":"table","range":"A1:D20","style":"blue"} (a formatted table with filter buttons); '
  + '{"op":"chart","type":"column|stackcol|bar|line|area|pie|doughnut|scatter","src":"A1:B10","title":"…","at":"F2","w":480,"h":290,"legend":true} (the first column is the labels and the rest are series; src should include the header row); '
  + '{"op":"cf","range":"B2:B20","rule":"gt|lt|between|eq|text|dup|top|bottom|above|below|databar|colorscale","a":50,"b":100,"fill":"#FFC7CE","color":"#9C0006"} (conditional formatting); '
  + '{"op":"validation","range":"C2:C20","type":"list","values":["Yes","No"]} (a drop-down list; or "whole"/"decimal" with "min" and "max"); '
  + '{"op":"note","cell":"B2","text":"…"}; {"op":"insertrows","at":3,"n":2}; {"op":"deleterows","at":3,"n":1}; {"op":"insertcols","at":"C","n":1}; {"op":"deletecols","at":"C","n":1}; '
  + '{"op":"name","name":"Tax","ref":"Sheet1!B1"} (a defined name); {"op":"addsheet","name":"Summary"}; {"op":"renamesheet","from":"Sheet1","to":"Data"}; {"op":"tabcolor","color":"#2E7D32"}. '
  + 'Ranges and cells use A1 notation. Many ops can go in one block. A typical build is a <<cells>> block with the data and formulas, then a <<sheetedit>> block that styles the header, sets number formats, widths, a freeze and a chart. '
  + 'Never add a clear op for cells you have just written with <<cells>>: it would erase them (writing a block already replaces what was in those cells). Use clear only to empty a range the user asked to empty. Add one chart unless asked for more. To analyse or explain the data, or to answer a question about it, just answer in plain text and write no block. Only use the formulas and functions a normal spreadsheet has. '
  + 'Do not use LaTeX and do not use em dashes. After the blocks, write one short sentence saying what you did.';

/* ---------- writing ---------- */
const snap = () => JSON.stringify({ sheets:X.wb.sheets, active:X.wb.active, names:X.wb.names }, (k, v) => k === '_vals' ? undefined : v);
const restore = s => { const o = JSON.parse(s); X.wb.sheets = o.sheets; X.wb.active = Math.min(o.active, o.sheets.length - 1); X.wb.names = o.names || {}; X.renderTabs(); X.renderCharts && X.renderCharts(); X.changed(); };

function splitRow(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes('|')) { let t = line.trim(); if (t[0] === '|') t = t.slice(1); if (t[t.length - 1] === '|' && t[t.length - 2] !== '\\') t = t.slice(0, -1); return t.split('|'); }
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out;
}
const fmtFor = (name, dec, sym) => {
  const d = dec != null && isFinite(dec) ? Math.max(0, Math.min(10, +dec)) : null;
  switch (String(name || '').toLowerCase()) {
    case 'general': return null;
    case 'number': return { type:'number', dec:d ?? 2, sep:true };
    case 'currency': return { type:'currency', sym:sym || '$', dec:d ?? 2 };
    case 'accounting': return { type:'accounting', sym:sym || '$', dec:d ?? 2 };
    case 'percent': case 'percentage': return { type:'percent', dec:d ?? 0 };
    case 'date': return { type:'date', pattern:'short' };
    case 'longdate': return { type:'date', pattern:'long' };
    case 'time': return { type:'time' };
    case 'text': return { type:'text' };
    case 'scientific': return { type:'scientific', dec:d ?? 2 };
    case 'fraction': return { type:'fraction' };
  }
  return undefined;
};
const hex = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim().toUpperCase() : /^#[0-9a-fA-F]{3}$/.test(String(c).trim()) ? '#' + String(c).trim().slice(1).split('').map(x => x + x).join('').toUpperCase() : undefined;
const toCol = s => /^\d+$/.test(String(s)) ? +s - 1 : X.colIndex(String(s).replace(/[^A-Za-z]/g, ''));
const colSpan = v => { const [a, b] = String(v).split(':'); const c1 = toCol(a), c2 = b ? toCol(b) : c1; return [Math.min(c1, c2), Math.max(c1, c2)]; };
const rowSpan = v => { const [a, b] = String(v).split(':'); const r1 = parseInt(a, 10) - 1, r2 = b ? parseInt(b, 10) - 1 : r1; return [Math.min(r1, r2), Math.max(r1, r2)]; };
const rangeOf = v => { const g = X.parseRange(v); if (!g || g.r1 < 0 || g.c1 < 0) throw new Error('"' + v + '" is not a cell range'); return g; };

function sheetFor(name, create) {
  if (!name) return X.wb.sheets.findIndex(s => s === X.sh);
  let i = X.wb.sheets.findIndex(s => s.name.toLowerCase() === String(name).toLowerCase());
  if (i < 0 && create) { const s = X.newSheet(clip(String(name).replace(/[\\/?*[\]:]/g, ' ').trim() || 'Sheet', 31)); X.wb.sheets.push(s); i = X.wb.sheets.length - 1; }
  return i;
}
const use = i => { X.wb.active = i; };

// where the last <<cells>> block wrote, so a clear op in the very next block (models sometimes add one) can't wipe what was just written
let recent = null;
function writeCells(attrs, text) {
  const i = sheetFor(attrs.sheet, true); use(i); const sh = X.sh;
  if (sh.protect) throw new Error('The sheet "' + sh.name + '" is protected.');
  const at = X.parseAddr(attrs.at || 'A1'); if (!at) throw new Error('"' + attrs.at + '" is not a cell address');
  // A blank line is a blank row (the model counts it when it works out its formulas); only markdown separator rows are dropped.
  const rows = text.replace(/^\s*\n+|\n\s*$/g, '').split('\n').filter(l => !/^[\s|:+-]{3,}$/.test(l) || !l.trim()).map(l => l.trim() ? splitRow(l) : []);
  let n = 0;
  rows.forEach((cells, dr) => cells.forEach((raw, dc) => {
    if (++n > MAX_CELLS) throw new Error('That is more than ' + MAX_CELLS + ' cells at once.');
    const r = at.r + dr, c = at.c + dc; let v = raw.trim();
    if (v[0] === '"' && v[v.length - 1] === '"' && v.length > 1 && !/^"/.test(raw.trim().slice(1, -1))) v = v.slice(1, -1);
    if (v === '') return; // a blank in the AI's table leaves whatever is already in that cell
    X.setRaw(sh, r, c, v);
    if (v[0] !== '=') { const p = X.parseInput(v); if (p && p.hint && (!X.styleOf(sh, r, c).fmt || X.styleOf(sh, r, c).fmt.type === 'general')) X.setStyle(sh, r, c, { fmt:p.hint }); }
    else if (/^=\s*(TODAY|NOW|DATE|EDATE|EOMONTH)\(/i.test(v) && (!X.styleOf(sh, r, c).fmt || X.styleOf(sh, r, c).fmt.type === 'general')) X.setStyle(sh, r, c, { fmt:{ type:/^=\s*NOW/i.test(v) ? 'datetime' : 'date', pattern:'short' } });
  }));
  if (rows.length) recent = { t:Date.now(), sheet:sh.id, g:{ r1:at.r, c1:at.c, r2:at.r + rows.length - 1, c2:at.c + Math.max(...rows.map(r => r.length)) - 1 } };
  let bad = 0;
  if (rows.length) { X.invalidate(X.wb); const g = recent.g; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { try { if (X.isErr(X.valueAt(X.wb, sh, r, c))) bad++; } catch { bad++; } } }
  return rows.length ? `wrote ${rows.length} row${rows.length === 1 ? '' : 's'} on "${sh.name}"${bad ? ` (${bad} cell${bad === 1 ? '' : 's'} show formula errors: check the formulas)` : ''}` : '';
}

function doOp(o, defSheet) {
  if (!o || typeof o !== 'object') return '';
  const op = String(o.op || '').toLowerCase();
  const sName = o.sheet || defSheet;
  if (sName) { const i = sheetFor(sName, true); if (i >= 0) use(i); }
  const sh = X.sh;
  if (sh.protect && op !== 'addsheet' && op !== 'renamesheet') throw new Error('The sheet "' + sh.name + '" is protected.');
  switch (op) {
    case 'format': {
      const g = rangeOf(o.range), p = {};
      ['bold', 'italic', 'underline', 'strike', 'wrap'].forEach(k => { if (k in o) p[k] = o[k] ? true : undefined; });
      if ('fill' in o) p.fill = o.fill && o.fill !== 'none' ? hex(o.fill) : undefined;
      if ('color' in o) p.color = o.color && o.color !== 'auto' ? hex(o.color) : undefined;
      if (o.size) p.size = Math.max(6, Math.min(96, +o.size)) === 11 ? undefined : Math.max(6, Math.min(96, +o.size));
      if (o.font) p.font = String(o.font);
      if (['left', 'center', 'right'].includes(o.align)) p.align = o.align;
      if (['top', 'middle'].includes(o.valign)) p.valign = o.valign; else if (o.valign === 'bottom') p.valign = undefined;
      if (o.indent != null) p.indent = Math.max(0, Math.min(10, +o.indent)) || undefined;
      if (o.fmt) { const f = fmtFor(o.fmt, o.dec, o.symbol); if (f !== undefined) p.fmt = f === null ? undefined : f; }
      else if (o.dec != null) { /* decimals on their own change the current number format */ }
      const border = o.border && String(o.border).toLowerCase();
      const R2 = Math.min(g.r2, g.r1 + 5000), C2 = Math.min(g.c2, 200);
      for (let r = g.r1; r <= R2; r++) for (let c = g.c1; c <= C2; c++) {
        const patch = Object.assign({}, p);
        if (o.dec != null && !o.fmt) { const f = X.styleOf(sh, r, c).fmt; if (f && f.type && f.type !== 'general') patch.fmt = Object.assign({}, f, { dec:Math.max(0, Math.min(10, +o.dec)) }); }
        if (border) {
          const b = Object.assign({}, X.styleOf(sh, r, c).border);
          if (border === 'none') patch.border = undefined;
          else {
            if (border === 'all') Object.assign(b, { t:'thin', b:'thin', l:'thin', r:'thin' });
            if (border === 'outside') { if (r === g.r1) b.t = 'thin'; if (r === R2) b.b = 'thin'; if (c === g.c1) b.l = 'thin'; if (c === C2) b.r = 'thin'; }
            if (border === 'bottom' && r === R2) b.b = 'thin'; if (border === 'top' && r === g.r1) b.t = 'thin';
            if (border === 'left' && c === g.c1) b.l = 'thin'; if (border === 'right' && c === C2) b.r = 'thin';
            patch.border = b;
          }
        }
        if (Object.keys(patch).length) X.setStyle(sh, r, c, patch);
      }
      return 'formatted ' + o.range;
    }
    case 'width': { const [a, b] = colSpan(o.cols || o.col); for (let c = a; c <= Math.min(b, 200); c++) sh.colW[c] = Math.max(20, Math.min(800, +o.px || X.DEF_W)); return 'column width'; }
    case 'height': { const [a, b] = rowSpan(o.rows || o.row); for (let r = a; r <= Math.min(b, 2000); r++) sh.rowH[r] = Math.max(10, Math.min(400, +o.px || X.DEF_H)); return 'row height'; }
    case 'autofit': { const [a, b] = colSpan(o.cols || o.col || 'A:' + X.colName(bounds(sh).C - 1)); for (let c = a; c <= Math.min(b, 200); c++) X.autofitCol(c); return 'column width'; }
    case 'freeze': sh.freeze = { r:Math.max(0, Math.min(50, +o.rows || 0)), c:Math.max(0, Math.min(20, +o.cols || 0)) }; return 'freeze panes';
    case 'merge': { const g = rangeOf(o.range); sh.merges = sh.merges.filter(m => !(m.r2 >= g.r1 && m.r1 <= g.r2 && m.c2 >= g.c1 && m.c1 <= g.c2)); if (o.unmerge) return 'unmerge'; if (g.r1 === g.r2 && g.c1 === g.c2) return ''; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) { if (r === g.r1 && c === g.c1) continue; delete sh.cells[r + ',' + c]; } sh.merges.push(g); return 'merged cells'; }
    case 'clear': {
      const g = rangeOf(o.range), what = o.what || 'all';
      if (what !== 'formats' && recent && Date.now() - recent.t < 8000 && recent.sheet === sh.id && g.r2 >= recent.g.r1 && g.r1 <= recent.g.r2 && g.c2 >= recent.g.c1 && g.c1 <= recent.g.c2) return ''; // skipped
      for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 5000); r++) for (let c = g.c1; c <= Math.min(g.c2, 200); c++) {
        const k = r + ',' + c, cell = sh.cells[k]; if (!cell) continue;
        if (what === 'formats') { delete cell.s; if (cell.v === '' || cell.v == null) delete sh.cells[k]; }
        else if (what === 'contents') { if (cell.s) cell.v = ''; else delete sh.cells[k]; }
        else delete sh.cells[k];
      }
      return 'cleared ' + o.range;
    }
    case 'sort': {
      const g = rangeOf(o.range), c = o.by != null ? toCol(o.by) : g.c1;
      if (c < g.c1 || c > g.c2) throw new Error('The sort column is outside ' + o.range);
      const hdr = o.header !== false; X.sortRange(g, [{ c, desc:!!o.desc }], hdr); return 'sorted ' + o.range;
    }
    case 'filter': { const g = rangeOf(o.range); sh.filter = { r:g.r1, c1:g.c1, c2:g.c2, r2:g.r2, crit:{}, hidden:{} }; return 'filter buttons'; }
    case 'table': { const g = rangeOf(o.range); if (g.r1 === g.r2) throw new Error('A table needs a header row and data'); sh.tables = sh.tables.filter(t => !(t.r2 >= g.r1 && t.r1 <= g.r2 && t.c2 >= g.c1 && t.c1 <= g.c2)); sh.tables.push({ ...g, style:o.style || 'blue', header:true }); sh.filter = { r:g.r1, c1:g.c1, c2:g.c2, r2:g.r2, crit:{}, hidden:{} }; return 'table'; }
    case 'chart': {
      const TYPES = ['column', 'stackcol', 'bar', 'line', 'area', 'pie', 'doughnut', 'scatter'];
      const type = TYPES.includes(o.type) ? o.type : 'column', g = rangeOf(o.src);
      if (g.r1 === g.r2 && g.c1 === g.c2) throw new Error('A chart needs a range with several cells');
      const at = o.at ? X.parseAddr(o.at) : { r:g.r1, c:g.c2 + 2 };
      X.layout();
      const ch = { id:ONE.uid(), type, src:X.rangeStr(g), sheet:sh.name, x:X.cx(at.c), y:X.ry(at.r), w:Math.max(200, Math.min(900, +o.w || 480)), h:Math.max(150, Math.min(700, +o.h || 290)), title:o.title ? String(o.title) : null, legend:o.legend !== false, labels:type === 'pie' || type === 'doughnut' };
      sh.charts.push(ch); return 'chart';
    }
    case 'cf': {
      const g = rangeOf(o.range), kind = String(o.rule || o.type || '').toLowerCase();
      const style = { fill:hex(o.fill) || '#FFC7CE', color:hex(o.color) || '#9C0006' };
      const base = { id:ONE.uid(), g };
      if (['gt', 'lt', 'between', 'eq', 'text'].includes(kind)) sh.cf.push(Object.assign(base, { type:kind, a:kind === 'text' || kind === 'eq' ? String(o.a ?? '') : +o.a || 0, b:+o.b || 0, style }));
      else if (['dup', 'above', 'below'].includes(kind)) sh.cf.push(Object.assign(base, { type:kind, style }));
      else if (kind === 'top' || kind === 'bottom') sh.cf.push(Object.assign(base, { type:kind, a:+o.a || 10, style }));
      else if (kind === 'databar') sh.cf.push(Object.assign(base, { type:'bar', color:hex(o.fill) || '#638EC6' }));
      else if (kind === 'colorscale') sh.cf.push(Object.assign(base, { type:'scale', colors:['#F8696B', '#FFEB84', '#63BE7B'] }));
      else throw new Error('Unknown conditional format "' + kind + '"');
      return 'conditional format';
    }
    case 'validation': {
      const g = rangeOf(o.range), type = o.type === 'whole' || o.type === 'decimal' ? o.type : 'list';
      const vk = type === 'list' ? { type, src:(Array.isArray(o.values) ? o.values.map(String).join(', ') : String(o.source || '')), a:0, b:100 } : { type, src:'', a:+o.min || 0, b:+o.max || 100 };
      for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 2000); r++) for (let c = g.c1; c <= Math.min(g.c2, 100); c++) sh.valid[r + ',' + c] = Object.assign({}, vk);
      return 'validation';
    }
    case 'note': { const a = X.parseAddr(o.cell); if (!a) throw new Error('"' + o.cell + '" is not a cell address'); sh.notes[a.r + ',' + a.c] = String(o.text || ''); return 'note'; }
    case 'insertrows': X.shiftAxis('r', Math.max(0, +o.at - 1), Math.max(1, +o.n || 1)); return 'inserted rows';
    case 'deleterows': X.shiftAxis('r', Math.max(0, +o.at - 1), -Math.max(1, +o.n || 1)); return 'deleted rows';
    case 'insertcols': X.shiftAxis('c', toCol(o.at), Math.max(1, +o.n || 1)); return 'inserted columns';
    case 'deletecols': X.shiftAxis('c', toCol(o.at), -Math.max(1, +o.n || 1)); return 'deleted columns';
    case 'name': { const nm = String(o.name || '').toUpperCase().replace(/[^A-Z0-9_.]/g, ''); if (!nm || !o.ref) throw new Error('A defined name needs a name and a ref'); X.wb.names[nm] = String(o.ref).replace(/^=/, ''); return 'name'; }
    case 'addsheet': { const i = sheetFor(o.name || X.uniqueName('Sheet' + (X.wb.sheets.length + 1)), true); use(i); return 'sheet'; }
    case 'renamesheet': { const i = sheetFor(o.from); if (i < 0) throw new Error('There is no sheet "' + o.from + '"'); const old = X.wb.sheets[i].name, nn = clip(String(o.to || '').trim(), 31); if (!nn) return ''; X.wb.sheets[i].name = nn; X.wb.sheets.forEach(s => Object.values(s.cells).forEach(c => { if (typeof c.v === 'string' && c.v[0] === '=') c.v = X.mapRefs(c.v, (ref, raw) => { if (ref.sheet && ref.sheet.toLowerCase() === old.toLowerCase()) { ref.sheet = nn; return X.buildRef(ref); } return raw; }); })); X.wb.sheets.forEach(s => s.charts.forEach(ch => { if (ch.sheet === old) ch.sheet = nn; })); use(i); return 'renamed sheet'; }
    case 'tabcolor': sh.tab = hex(o.color) || ''; return 'tab colour';
  }
  throw new Error('Unknown op "' + (o.op || '') + '"');
}

function parseAttrs(s) { const a = {}; String(s || '').replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { a[k.toLowerCase()] = v; return ''; }); return a; }
function parseJSON(t) {
  t = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), z = t.lastIndexOf('}'); if (a < 0 || z < a) throw new Error('The changes were not valid JSON');
  return JSON.parse(t.slice(a, z + 1));
}

const OXAI = window.OXAI = {
  app:'sheet', kinds:['cells', 'sheetedit'], lastError:'',
  context, system:() => SYSTEM,
  apply(blk) {
    OXAI.lastError = '';
    if (!blk || !blk.text) { OXAI.lastError = 'There was nothing to change.'; return null; }
    if (X.editing) X.commitEdit(null);
    const before = snap(), startActive = X.wb.active, done = [];
    try {
      if (blk.kind === 'cells') { const d = writeCells(blk.attrs || {}, blk.text); if (d) done.push(d); }
      else if (blk.kind === 'sheetedit') {
        const j = parseJSON(blk.text), ops = Array.isArray(j) ? j : Array.isArray(j.ops) ? j.ops : [];
        if (!ops.length) throw new Error('There were no changes in that answer.');
        ops.forEach(o => { const d = doOp(o, j.sheet); if (d) done.push(d); });
      } else return null;
    } catch (err) {
      X.wb.sheets = JSON.parse(before).sheets; X.wb.active = startActive; X.wb.names = JSON.parse(before).names || {}; X.changed(false); X.renderTabs();
      OXAI.lastError = (err && err.message) || 'That change could not be applied.'; return null;
    }
    X.invalidate(X.wb); X.layout(); X.renderTabs(); X.renderCharts && X.renderCharts(); X.changed();
    const undo = () => restore(before);
    const what = [...new Set(done)].slice(0, 6).join(', ');
    undo.note = what ? what[0].toUpperCase() + what.slice(1) + '.' : 'Updated your spreadsheet.';
    return undo;
  },
};
})();
