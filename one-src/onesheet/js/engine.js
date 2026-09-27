/* oneSheet — formula engine: tokenizer, parser, evaluator, ~120 functions, number formats, input parsing */
(() => {
'use strict';
const X = window.X = {};

/* ---------- addresses ---------- */
X.colName = c => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
X.colIndex = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
X.addr = (r, c) => X.colName(c) + (r + 1);
X.parseAddr = s => { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(s).trim()); return m ? { r:+m[2] - 1, c:X.colIndex(m[1]) } : null; };
X.parseRange = s => {
  const [a, b] = String(s).replace(/^.*!/, '').split(':'); const p = X.parseAddr(a), q = b ? X.parseAddr(b) : p;
  if (!p || !q) return null;
  return { r1:Math.min(p.r, q.r), c1:Math.min(p.c, q.c), r2:Math.max(p.r, q.r), c2:Math.max(p.c, q.c) };
};
X.rangeStr = g => g.r1 === g.r2 && g.c1 === g.c2 ? X.addr(g.r1, g.c1) : X.addr(g.r1, g.c1) + ':' + X.addr(g.r2, g.c2);
X.key = (r, c) => r + ',' + c;

/* ---------- values ---------- */
const E = code => ({ err:code });
const isErr = v => v != null && typeof v === 'object' && 'err' in v;
const isRng = v => v != null && typeof v === 'object' && v.rng;
X.E = E; X.isErr = isErr; X.isRng = isRng;
const EPOCH = Date.UTC(1899, 11, 30);
X.toSerial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5 + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
X.fromSerial = n => { const ms = Math.round(n * 864e5) + EPOCH; const d = new Date(ms); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()); };

/* ---------- tokenizer ---------- */
const TOK = [
  ['ws', /^\s+/], ['str', /^"(?:[^"]|"")*"/],
  ['ref', /^(?:(?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(?:\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![\w(!])/],
  ['num', /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/], ['bool', /^(?:TRUE|FALSE)(?![\w(.])/i],
  ['err', /^#(?:DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!|CIRC!)/], ['func', /^[A-Za-z_][\w.]*(?=\s*\()/], ['name', /^[A-Za-z_][\w.]*/],
  ['op', /^(?:<>|<=|>=|[-+*/^&=<>%])/], ['(', /^\(/], [')', /^\)/], [',', /^[,;]/], ['bad', /^./]
];
X.tokenize = src => { const out = []; let s = src; while (s.length) { for (const [t, re] of TOK) { const m = re.exec(s); if (m) { out.push({ t, v:m[0] }); s = s.slice(m[0].length); break; } } } return out; };

/* ---------- ref helpers ---------- */
const unq = n => n.startsWith("'") ? n.slice(1, -1).replace(/''/g, "'") : n;
X.parseRef = text => {
  let sheet = null, body = text; const bang = text.lastIndexOf('!');
  if (bang > 0) { sheet = unq(text.slice(0, bang)); body = text.slice(bang + 1); }
  const part = p => { const m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(p); return m ? { ac:!!m[1], c:m[2] ? X.colIndex(m[2]) : null, ar:!!m[3], r:m[4] ? +m[4] - 1 : null } : null; };
  const [a, b] = body.split(':'); return { sheet, a:part(a), b:b ? part(b) : null };
};
const qs = n => /^[A-Za-z_][\w.]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
X.buildRef = ref => {
  const p = x => (x.c != null ? (x.ac ? '$' : '') + X.colName(x.c) : '') + (x.r != null ? (x.ar ? '$' : '') + (x.r + 1) : '');
  return (ref.sheet ? qs(ref.sheet) + '!' : '') + p(ref.a) + (ref.b ? ':' + p(ref.b) : '');
};
X.mapRefs = (f, fn) => '=' + X.tokenize(f.slice(1)).map(t => t.t === 'ref' ? fn(X.parseRef(t.v), t.v) : t.v).join('');
X.shiftFormula = (f, dr, dc) => X.mapRefs(f, ref => {
  let bad = false;
  [ref.a, ref.b].forEach(x => { if (!x) return; if (x.r != null && !x.ar) { x.r += dr; if (x.r < 0) bad = true; } if (x.c != null && !x.ac) { x.c += dc; if (x.c < 0) bad = true; } });
  return bad ? '#REF!' : X.buildRef(ref);
});
/* insert/delete rows or columns: shift refs pointing at/after `at` on sheet `name` */
X.adjustRefs = (f, name, curSheet, axis, at, n) => X.mapRefs(f, (ref, raw) => {
  const same = (ref.sheet || curSheet).toLowerCase() === name.toLowerCase(); if (!same) return raw;
  const k = axis === 'r' ? 'r' : 'c'; let dead = false;
  const ends = [ref.a, ref.b].filter(Boolean);
  if (n < 0) {
    const d0 = at, d1 = at - n - 1;
    if (ref.b && ref.a[k] != null && ref.b[k] != null) {
      const lo = ref.a[k], hi = ref.b[k];
      if (lo >= d0 && hi <= d1) dead = true;
      else { ref.a[k] = lo < d0 ? lo : lo > d1 ? lo + n : d0; ref.b[k] = hi < d0 ? hi : hi > d1 ? hi + n : d0 - 1; }
    } else ends.forEach(x => { if (x[k] == null) return; if (x[k] >= d0 && x[k] <= d1) dead = true; else if (x[k] > d1) x[k] += n; });
  } else ends.forEach(x => { if (x[k] != null && x[k] >= at) x[k] += n; });
  return dead ? '#REF!' : X.buildRef(ref);
});

/* ---------- parser ---------- */
const PREC = { '=':1, '<>':1, '<':1, '>':1, '<=':1, '>=':1, '&':2, '+':3, '-':3, '*':4, '/':4, '^':5 };
const cache = new Map();
X.parse = src => {
  if (cache.has(src)) return cache.get(src);
  const toks = X.tokenize(src).filter(t => t.t !== 'ws'); let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const fail = () => { throw new Error('parse'); };
  const expect = t => { const k = next(); if (!k || k.t !== t) fail(); return k; };
  const primary = () => {
    const k = next(); if (!k) fail();
    switch (k.t) {
      case 'num': return { n:'num', v:parseFloat(k.v) };
      case 'str': return { n:'str', v:k.v.slice(1, -1).replace(/""/g, '"') };
      case 'bool': return { n:'bool', v:k.v.toUpperCase() === 'TRUE' };
      case 'err': return { n:'err', v:k.v };
      case 'ref': return { n:'ref', v:k.v };
      case 'name': return { n:'name', v:k.v };
      case 'func': {
        expect('('); const args = [];
        if (peek() && peek().t !== ')') {
          for (;;) { if (peek() && (peek().t === ',' || peek().t === ')')) args.push({ n:'empty' }); else args.push(expr(0)); if (peek() && peek().t === ',') { next(); continue; } break; }
        }
        expect(')'); return { n:'fn', f:k.v.toUpperCase().replace(/^_XLFN\./, ''), args };
      }
      case '(': { const e = expr(0); expect(')'); return e; }
      case 'op': if (k.v === '-' || k.v === '+') { const e = expr(6); return k.v === '-' ? { n:'neg', e } : e; }
    }
    fail();
  };
  function expr(min){
    let left = primary();
    for (;;) {
      const k = peek(); if (!k || k.t !== 'op') break;
      if (k.v === '%') { next(); left = { n:'pct', e:left }; continue; }
      const p = PREC[k.v]; if (p === undefined || p < min) break;
      next(); left = { n:'bin', op:k.v, a:left, b:expr(k.v === '^' ? p : p + 1) };
    }
    return left;
  }
  let ast; try { ast = expr(0); if (i < toks.length) fail(); } catch { ast = { n:'err', v:'#NAME?', bad:true }; }
  if (cache.size > 5000) cache.clear(); cache.set(src, ast); return ast;
};

/* ---------- coercion ---------- */
const num = v => { if (isRng(v)) v = scalar(v); if (v == null || v === '') return 0; if (typeof v === 'number') return v; if (typeof v === 'boolean') return v ? 1 : 0; if (isErr(v)) return v; const p = X.parseInput(String(v)); return typeof p.v === 'number' ? p.v : E('#VALUE!'); };
const str = v => { if (isRng(v)) v = scalar(v); if (v == null) return ''; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'; if (typeof v === 'number') return X.generalNum(v); if (isErr(v)) return v; return String(v); };
const bool = v => { if (isRng(v)) v = scalar(v); if (v == null) return false; if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0; if (isErr(v)) return v; const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return E('#VALUE!'); };
let CTX = null;
const scalar = v => { if (!isRng(v)) return v; const { vals } = v; if (vals.length === 1 && vals[0].length === 1) return vals[0][0]; if (CTX && vals[0].length === 1 && CTX.r >= v.g.r1 && CTX.r <= v.g.r2) return vals[CTX.r - v.g.r1][0]; if (CTX && vals.length === 1 && CTX.c >= v.g.c1 && CTX.c <= v.g.c2) return vals[0][CTX.c - v.g.c1]; return E('#VALUE!'); };
const flat = args => { const out = []; args.forEach(a => { if (isRng(a)) a.vals.forEach(r => r.forEach(x => out.push({ v:x, rng:true }))); else out.push({ v:a, rng:false }); }); return out; };
const nums = args => { const out = []; for (const { v, rng } of flat(args)) { if (isErr(v)) throw v; if (rng) { if (typeof v === 'number') out.push(v); } else if (v != null && v !== '') { const n = num(v); if (isErr(n)) throw n; out.push(n); } } return out; };
X.num = num; X.str = str;
const cmp = (a, b) => {
  const rank = v => v == null ? 0 : typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 4;
  if (a == null) a = typeof b === 'string' ? '' : 0; if (b == null) b = typeof a === 'string' ? '' : 0;
  const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
  if (typeof a === 'string') return a.localeCompare(b, undefined, { sensitivity:'accent' });
  return a < b ? -1 : a > b ? 1 : 0;
};
X.cmp = cmp;
const wild = s => new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
const crit = c => {
  if (typeof c === 'number' || typeof c === 'boolean') return v => cmp(v, c) === 0 && typeof v === typeof c;
  const m = /^(<>|>=|<=|=|>|<)?(.*)$/s.exec(str(c)); const op = m[1] || '=', rhs = m[2];
  const n = rhs !== '' && !isNaN(+rhs) ? +rhs : null;
  if (n !== null) return v => { if (typeof v !== 'number') return op === '<>'; return { '=':v === n, '<>':v !== n, '>':v > n, '<':v < n, '>=':v >= n, '<=':v <= n }[op]; };
  if (op === '=' || op === '<>') { if (rhs === '') return v => (v == null || v === '') === (op === '='); const re = wild(rhs); return v => re.test(str(v)) === (op === '='); }
  return v => { if (typeof v !== 'string') return false; const r = v.localeCompare(rhs, undefined, { sensitivity:'accent' }); return { '>':r > 0, '<':r < 0, '>=':r >= 0, '<=':r <= 0 }[op]; };
};

/* ---------- evaluation ---------- */
X.evalFormula = (src, ctx) => {
  const prev = CTX; CTX = ctx;
  try { const v = ev(X.parse(src.slice(1)), ctx); return isRng(v) ? (v.vals.length === 1 && v.vals[0].length === 1 ? v.vals[0][0] : v) : v; }
  catch (e) { return isErr(e) ? e : E('#VALUE!'); }
  finally { CTX = prev; }
};
function ev(node, ctx){
  switch (node.n) {
    case 'num': case 'str': case 'bool': return node.v;
    case 'err': return E(node.v);
    case 'empty': return null;
    case 'ref': return refVal(node.v, ctx);
    case 'name': { const nm = ctx.wb.names && ctx.wb.names[node.v.toUpperCase()]; if (nm == null) return E('#NAME?'); return /^=/.test(nm) ? X.evalFormula(nm, ctx) : refVal(nm, ctx); }
    case 'neg': { const v = num(ev(node.e, ctx)); return isErr(v) ? v : -v; }
    case 'pct': { const v = num(ev(node.e, ctx)); return isErr(v) ? v : v / 100; }
    case 'bin': {
      let a = ev(node.a, ctx), b = ev(node.b, ctx);
      if (isRng(a) || isRng(b)) { const A = isRng(a) ? a.vals : null, B = isRng(b) ? b.vals : null, R = (A || B).length, C = (A || B)[0].length;
        const vals = Array.from({ length:R }, (_, i) => Array.from({ length:C }, (_, j) => binop(node.op, A ? (A[i] || [])[j] : a, B ? (B[i] || [])[j] : b)));
        return { rng:true, vals, g:(isRng(a) ? a : b).g }; }
      return binop(node.op, a, b);
    }
    case 'fn': {
      const f = FN[node.f]; if (!f) return E('#NAME?');
      if (f.lazy) return f(node.args.map(a => () => ev(a, ctx)), ctx);
      const args = node.args.map(a => ev(a, ctx));
      try { return f(args, ctx); } catch (e) { if (isErr(e)) return e; return E('#VALUE!'); }
    }
  }
  return E('#VALUE!');
}
function binop(op, a, b){
  if (isErr(a)) return a; if (isErr(b)) return b;
  if (op === '&') { const x = str(a), y = str(b); return isErr(x) ? x : isErr(y) ? y : x + y; }
  if (['=','<>','<','>','<=','>='].includes(op)) { const c = cmp(a, b); return { '=':c === 0, '<>':c !== 0, '<':c < 0, '>':c > 0, '<=':c <= 0, '>=':c >= 0 }[op]; }
  const x = num(a), y = num(b); if (isErr(x)) return x; if (isErr(y)) return y;
  switch (op) { case '+': return x + y; case '-': return x - y; case '*': return x * y; case '/': return y === 0 ? E('#DIV/0!') : x / y; case '^': { const r = Math.pow(x, y); return isFinite(r) ? r : E('#NUM!'); } }
  return E('#VALUE!');
}
function refVal(text, ctx){
  const ref = X.parseRef(text), sh = ref.sheet ? X.sheetByName(ctx.wb, ref.sheet) : ctx.sheet;
  if (!sh) return E('#REF!');
  const a = ref.a, b = ref.b || ref.a;
  let r1 = a.r, c1 = a.c, r2 = b.r, c2 = b.c;
  if (r1 == null) { r1 = 0; r2 = Math.max(0, X.usedRows(sh) - 1); }
  if (c1 == null) { c1 = 0; c2 = Math.max(0, X.usedCols(sh) - 1); }
  const g = { r1:Math.min(r1, r2), c1:Math.min(c1, c2), r2:Math.max(r1, r2), c2:Math.max(c1, c2) };
  if (!ref.b && a.r != null && a.c != null) return X.valueAt(ctx.wb, sh, g.r1, g.c1);
  const vals = []; for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let c = g.c1; c <= g.c2; c++) row.push(X.valueAt(ctx.wb, sh, r, c)); vals.push(row); }
  return { rng:true, vals, g, sheet:sh };
}
X.sheetByName = (wb, n) => wb.sheets.find(s => s.name.toLowerCase() === String(n).toLowerCase());
X.usedRows = sh => { let m = 0; for (const k in sh.cells) { const r = +k.split(',')[0]; if (sh.cells[k].v !== '' && sh.cells[k].v != null && r + 1 > m) m = r + 1; } return m; };
X.usedCols = sh => { let m = 0; for (const k in sh.cells) { const c = +k.split(',')[1]; if (sh.cells[k].v !== '' && sh.cells[k].v != null && c + 1 > m) m = c + 1; } return m; };

/* computed value cache — cleared by X.invalidate() after every edit */
const computing = new Set();
X.invalidate = wb => { wb.sheets.forEach(s => { s._vals = new Map(); }); };
X.valueAt = (wb, sh, r, c) => {
  if (!sh._vals) sh._vals = new Map();
  const k = r + ',' + c; if (sh._vals.has(k)) return sh._vals.get(k);
  const cell = sh.cells[k]; let v = null;
  if (cell && cell.v != null && cell.v !== '') {
    const raw = String(cell.v);
    if (raw[0] === '=' && raw.length > 1) {
      const ck = sh.id + '!' + k;
      if (computing.has(ck)) return E('#CIRC!');
      computing.add(ck); try { v = X.evalFormula(raw, { wb, sheet:sh, r, c }); } finally { computing.delete(ck); }
      if (isRng(v)) v = v.vals[0][0];
      if (typeof v === 'number' && !isFinite(v)) v = E('#NUM!');
    } else v = X.parseInput(raw, cell.s && cell.s.fmt && cell.s.fmt.type === 'text').v;
  }
  sh._vals.set(k, v); return v;
};

/* ---------- functions ---------- */
const FN = X.FN = {};
const def = (names, f, lazy) => names.split(' ').forEach(n => { FN[n] = f; if (lazy) f.lazy = true; });
const agg = f => args => { const n = nums(args); return f(n); };
def('SUM', agg(n => n.reduce((a, b) => a + b, 0)));
def('AVERAGE', agg(n => n.length ? n.reduce((a, b) => a + b, 0) / n.length : E('#DIV/0!')));
def('MIN', agg(n => n.length ? Math.min(...n) : 0)); def('MAX', agg(n => n.length ? Math.max(...n) : 0));
def('PRODUCT', agg(n => n.reduce((a, b) => a * b, 1)));
def('COUNT', args => flat(args).filter(({ v, rng }) => typeof v === 'number' || (!rng && v != null && !isErr(v) && typeof num(v) === 'number' && typeof v !== 'string')).length);
def('COUNTA', args => flat(args).filter(({ v }) => v != null && v !== '').length);
def('COUNTBLANK', args => flat(args).filter(({ v }) => v == null || v === '').length);
def('MEDIAN', agg(n => { if (!n.length) return E('#NUM!'); const s = [...n].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }));
def('MODE MODE.SNGL', agg(n => { const f = new Map(); let best = null, bc = 1; n.forEach(x => { const c = (f.get(x) || 0) + 1; f.set(x, c); if (c > bc) { bc = c; best = x; } }); return best == null ? E('#N/A') : best; }));
const variance = (n, s) => { if (n.length < 1 + s) return E('#DIV/0!'); const m = n.reduce((a, b) => a + b, 0) / n.length; return n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - s); };
def('VAR VAR.S', agg(n => variance(n, 1))); def('VARP VAR.P', agg(n => variance(n, 0)));
def('STDEV STDEV.S', agg(n => { const v = variance(n, 1); return isErr(v) ? v : Math.sqrt(v); })); def('STDEVP STDEV.P', agg(n => { const v = variance(n, 0); return isErr(v) ? v : Math.sqrt(v); }));
def('LARGE', ([a, k]) => { const n = nums([a]).sort((x, y) => y - x), i = num(k) - 1; return n[i] ?? E('#NUM!'); });
def('SMALL', ([a, k]) => { const n = nums([a]).sort((x, y) => x - y), i = num(k) - 1; return n[i] ?? E('#NUM!'); });
def('RANK RANK.EQ', ([v, a, o]) => { const x = num(v), n = nums([a]); if (!n.includes(x)) return E('#N/A'); const s = [...n].sort((p, q) => bool(o || 0) === true ? p - q : q - p); return s.indexOf(x) + 1; });
def('SUMPRODUCT', args => { const arrs = args.map(a => isRng(a) ? a.vals.flat() : [a]); const L = arrs[0].length; if (arrs.some(a => a.length !== L)) return E('#VALUE!'); let s = 0; for (let i = 0; i < L; i++) s += arrs.reduce((p, a) => p * (typeof a[i] === 'number' ? a[i] : typeof a[i] === 'boolean' ? +a[i] : 0), 1); return s; });
const ifs = (range, test) => { const out = []; if (!isRng(range)) return out; range.vals.forEach((row, i) => row.forEach((v, j) => { if (test(v)) out.push([i, j]); })); return out; };
def('COUNTIF', ([r, c]) => ifs(r, crit(scalar(c))).length);
def('SUMIF', ([r, c, s]) => { const t = s || r, hits = ifs(r, crit(scalar(c))); return hits.reduce((a, [i, j]) => a + (typeof (t.vals[i] || [])[j] === 'number' ? t.vals[i][j] : 0), 0); });
def('AVERAGEIF', ([r, c, s]) => { const t = s || r, hits = ifs(r, crit(scalar(c))).map(([i, j]) => (t.vals[i] || [])[j]).filter(v => typeof v === 'number'); return hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : E('#DIV/0!'); });
const multi = (args, off) => { const pairs = []; for (let i = off; i < args.length; i += 2) pairs.push([args[i], crit(scalar(args[i + 1]))]); const base = pairs[0][0]; const hits = []; base.vals.forEach((row, i) => row.forEach((_, j) => { if (pairs.every(([rg, t]) => t(((rg.vals || [])[i] || [])[j]))) hits.push([i, j]); })); return hits; };
def('COUNTIFS', args => multi(args, 0).length);
def('SUMIFS', args => multi(args, 1).reduce((a, [i, j]) => a + (typeof (args[0].vals[i] || [])[j] === 'number' ? args[0].vals[i][j] : 0), 0));
def('AVERAGEIFS', args => { const h = multi(args, 1).map(([i, j]) => (args[0].vals[i] || [])[j]).filter(v => typeof v === 'number'); return h.length ? h.reduce((a, b) => a + b, 0) / h.length : E('#DIV/0!'); });
def('MAXIFS', args => { const h = multi(args, 1).map(([i, j]) => args[0].vals[i][j]).filter(v => typeof v === 'number'); return h.length ? Math.max(...h) : 0; });
def('MINIFS', args => { const h = multi(args, 1).map(([i, j]) => args[0].vals[i][j]).filter(v => typeof v === 'number'); return h.length ? Math.min(...h) : 0; });
/* math */
const n1 = f => ([a, b]) => { const x = num(a); if (isErr(x)) return x; const y = b === undefined ? undefined : num(b); if (isErr(y)) return y; const r = f(x, y); return typeof r === 'number' && !isFinite(r) ? E('#NUM!') : r; };
def('ABS', n1(Math.abs)); def('SQRT', n1(x => x < 0 ? E('#NUM!') : Math.sqrt(x))); def('INT', n1(Math.floor)); def('SIGN', n1(Math.sign));
def('EXP', n1(Math.exp)); def('LN', n1(x => x <= 0 ? E('#NUM!') : Math.log(x))); def('LOG10', n1(x => x <= 0 ? E('#NUM!') : Math.log10(x))); def('LOG', n1((x, b) => x <= 0 ? E('#NUM!') : Math.log(x) / Math.log(b === undefined ? 10 : b)));
def('POWER', n1((x, y) => Math.pow(x, y))); def('MOD', n1((x, y) => y === 0 ? E('#DIV/0!') : x - y * Math.floor(x / y)));
const rnd = (x, d, f) => { const p = Math.pow(10, d || 0); return f(x * p * (1 + Math.sign(x) * 1e-15)) / p; };
def('ROUND', n1((x, d) => rnd(x, d, v => Math.sign(v) * Math.round(Math.abs(v)))));
def('ROUNDUP', n1((x, d) => rnd(x, d, v => Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9)))); def('ROUNDDOWN TRUNC', n1((x, d) => rnd(x, d || 0, v => Math.trunc(v))));
def('CEILING CEILING.MATH', n1((x, s) => { s = s || 1; return Math.ceil(x / s) * s; })); def('FLOOR FLOOR.MATH', n1((x, s) => { s = s || 1; return Math.floor(x / s) * s; }));
def('MROUND', n1((x, m) => m ? Math.round(x / m) * m : 0)); def('EVEN', n1(x => { const r = Math.ceil(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; })); def('ODD', n1(x => { let r = Math.ceil(Math.abs(x)); if (r % 2 === 0) r++; return x < 0 ? -r : r; }));
def('PI', () => Math.PI); def('RAND', () => Math.random()); def('RANDBETWEEN', n1((a, b) => Math.floor(Math.random() * (Math.floor(b) - Math.ceil(a) + 1)) + Math.ceil(a)));
def('SIN', n1(Math.sin)); def('COS', n1(Math.cos)); def('TAN', n1(Math.tan)); def('ASIN', n1(Math.asin)); def('ACOS', n1(Math.acos)); def('ATAN', n1(Math.atan)); def('ATAN2', n1((x, y) => Math.atan2(y, x))); def('DEGREES', n1(x => x * 180 / Math.PI)); def('RADIANS', n1(x => x * Math.PI / 180));
def('FACT', n1(x => { if (x < 0) return E('#NUM!'); let r = 1; for (let i = 2; i <= Math.floor(x); i++) r *= i; return r; }));
def('GCD', agg(n => n.reduce((a, b) => { a = Math.abs(Math.floor(a)); b = Math.abs(Math.floor(b)); while (b) [a, b] = [b, a % b]; return a; }, 0)));
def('LCM', agg(n => n.reduce((a, b) => { const g = (x, y) => y ? g(y, x % y) : x; return a && b ? Math.abs(a * b) / g(a, b) : 0; }, 1)));
def('COMBIN', n1((n, k) => { if (k > n || k < 0) return E('#NUM!'); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }));
def('QUOTIENT', n1((a, b) => b === 0 ? E('#DIV/0!') : Math.trunc(a / b)));
def('SUMSQ', agg(n => n.reduce((a, b) => a + b * b, 0)));
/* logic */
def('IF', ([c, a, b]) => { const t = bool(c()); if (isErr(t)) return t; return t ? (a ? a() : true) : (b ? b() : false); }, true);
def('IFERROR', ([v, alt]) => { const x = v(); return isErr(x) ? alt() : x; }, true);
def('IFNA', ([v, alt]) => { const x = v(); return isErr(x) && x.err === '#N/A' ? alt() : x; }, true);
def('IFS', args => { for (let i = 0; i < args.length; i += 2) { const t = bool(args[i]()); if (isErr(t)) return t; if (t) return args[i + 1](); } return E('#N/A'); }, true);
def('SWITCH', args => { const v = args[0](); for (let i = 1; i + 1 < args.length; i += 2) if (cmp(v, args[i]()) === 0) return args[i + 1](); return args.length % 2 === 0 ? args[args.length - 1]() : E('#N/A'); }, true);
def('CHOOSE', args => { const i = num(args[0]()); if (isErr(i)) return i; return i >= 1 && i < args.length ? args[Math.floor(i)]() : E('#VALUE!'); }, true);
def('AND', args => { const b = flat(args).filter(x => x.v != null && typeof x.v !== 'string').map(x => bool(x.v)); const e = b.find(isErr); return e || (b.length ? b.every(Boolean) : E('#VALUE!')); });
def('OR', args => { const b = flat(args).filter(x => x.v != null && typeof x.v !== 'string').map(x => bool(x.v)); const e = b.find(isErr); return e || (b.length ? b.some(Boolean) : E('#VALUE!')); });
def('XOR', args => flat(args).map(x => bool(x.v)).filter(x => x === true).length % 2 === 1);
def('NOT', ([a]) => { const b = bool(a); return isErr(b) ? b : !b; });
def('TRUE', () => true); def('FALSE', () => false); def('NA', () => E('#N/A'));
def('ISBLANK', ([a]) => { a = scalar(a); return a == null || a === ''; }); def('ISNUMBER', ([a]) => typeof scalar(a) === 'number'); def('ISTEXT', ([a]) => typeof scalar(a) === 'string');
def('ISERROR', ([a]) => isErr(scalar(a))); def('ISNA', ([a]) => { a = scalar(a); return isErr(a) && a.err === '#N/A'; }); def('ISLOGICAL', ([a]) => typeof scalar(a) === 'boolean');
def('ISEVEN', n1(x => Math.floor(Math.abs(x)) % 2 === 0)); def('ISODD', n1(x => Math.floor(Math.abs(x)) % 2 === 1)); def('N', ([a]) => { a = scalar(a); return typeof a === 'number' ? a : typeof a === 'boolean' ? +a : 0; });
/* text */
const s1 = f => ([a, ...r]) => { const s = str(a); if (isErr(s)) return s; return f(s, ...r); };
def('LEN', s1(s => s.length)); def('UPPER', s1(s => s.toUpperCase())); def('LOWER', s1(s => s.toLowerCase()));
def('PROPER', s1(s => s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())));
def('TRIM', s1(s => s.trim().replace(/ {2,}/g, ' '))); def('CLEAN', s1(s => s.replace(/[\x00-\x1f]/g, '')));
def('LEFT', s1((s, n) => s.slice(0, n === undefined ? 1 : num(n)))); def('RIGHT', s1((s, n) => { const k = n === undefined ? 1 : num(n); return k ? s.slice(-k) : ''; }));
def('MID', s1((s, a, n) => s.substr(num(a) - 1, num(n))));
def('CONCAT CONCATENATE', args => flat(args).map(x => str(x.v)).join(''));
def('TEXTJOIN', ([d, ig, ...rest]) => { const delim = str(d), skip = bool(ig); return flat(rest).map(x => str(x.v)).filter(s => !skip || s !== '').join(delim); });
def('SUBSTITUTE', s1((s, a, b, n) => { const f = str(a), t = str(b); if (!f) return s; if (n === undefined) return s.split(f).join(t); let i = -1, k = num(n); while (k-- > 0) { i = s.indexOf(f, i + 1); if (i < 0) return s; } return s.slice(0, i) + t + s.slice(i + f.length); }));
def('REPLACE', s1((s, a, n, t) => s.slice(0, num(a) - 1) + str(t) + s.slice(num(a) - 1 + num(n))));
def('FIND', ([f, s, st]) => { const i = str(s).indexOf(str(f), (st === undefined ? 1 : num(st)) - 1); return i < 0 ? E('#VALUE!') : i + 1; });
def('SEARCH', ([f, s, st]) => { const re = wild(str(f)).source.slice(1, -1); const m = new RegExp(re, 'i'); const off = (st === undefined ? 1 : num(st)) - 1; const r = m.exec(str(s).slice(off)); return r ? r.index + off + 1 : E('#VALUE!'); });
def('REPT', s1((s, n) => s.repeat(Math.max(0, num(n))))); def('EXACT', ([a, b]) => str(a) === str(b));
def('VALUE', ([a]) => num(a)); def('CHAR', n1(x => String.fromCharCode(x))); def('CODE', s1(s => s.charCodeAt(0) || E('#VALUE!'))); def('T', ([a]) => typeof scalar(a) === 'string' ? scalar(a) : '');
def('TEXT', ([v, f]) => { const x = scalar(v); return X.formatPattern(x, str(f)); });
def('FIXED', n1((x, d) => X.format(x, { type:'number', dec:d === undefined ? 2 : d, sep:true })));
def('DOLLAR', n1((x, d) => X.format(x, { type:'currency', dec:d === undefined ? 2 : d, sym:'$' })));
/* dates */
const d1 = f => ([a, ...r]) => { const n = num(a); if (isErr(n)) return n; return f(X.fromSerial(n), ...r); };
def('TODAY', () => Math.floor(X.toSerial(new Date()))); def('NOW', () => X.toSerial(new Date()));
def('DATE', ([y, m, d]) => { const Y = num(y), M = num(m), D = num(d); return X.toSerial(new Date(Y < 1900 ? Y + 1900 : Y, M - 1, D)); });
def('TIME', ([h, m, s]) => (num(h) * 3600 + num(m) * 60 + num(s || 0)) / 86400 % 1);
def('YEAR', d1(d => d.getFullYear())); def('MONTH', d1(d => d.getMonth() + 1)); def('DAY', d1(d => d.getDate()));
def('HOUR', n1(x => Math.floor((x % 1) * 24 + 1e-9))); def('MINUTE', n1(x => Math.floor(((x % 1) * 1440 + 1e-9) % 60))); def('SECOND', n1(x => Math.round(((x % 1) * 86400) % 60)));
def('WEEKDAY', ([a, t]) => { const d = X.fromSerial(num(a)).getDay(), ty = t === undefined ? 1 : num(t); return ty === 2 ? (d + 6) % 7 + 1 : ty === 3 ? (d + 6) % 7 : d + 1; });
def('WEEKNUM', d1(d => { const s = new Date(d.getFullYear(), 0, 1); return Math.floor(((d - s) / 864e5 + s.getDay()) / 7) + 1; }));
def('EDATE', ([a, m]) => { const d = X.fromSerial(num(a)); return Math.floor(X.toSerial(new Date(d.getFullYear(), d.getMonth() + num(m), d.getDate()))); });
def('EOMONTH', ([a, m]) => { const d = X.fromSerial(num(a)); return Math.floor(X.toSerial(new Date(d.getFullYear(), d.getMonth() + num(m) + 1, 0))); });
def('DAYS', ([e, s]) => Math.floor(num(e)) - Math.floor(num(s)));
def('DATEDIF', ([s, e, u]) => { const a = X.fromSerial(num(s)), b = X.fromSerial(num(e)), U = str(u).toUpperCase(); if (b < a) return E('#NUM!'); const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0); return U === 'Y' ? Math.floor(months / 12) : U === 'M' ? months : U === 'D' ? Math.floor(num(e)) - Math.floor(num(s)) : E('#NUM!'); });
def('NETWORKDAYS', ([s, e]) => { let a = Math.floor(num(s)), b = Math.floor(num(e)), n = 0; const st = a <= b ? 1 : -1; for (let d = a; st > 0 ? d <= b : d >= b; d += st) { const w = X.fromSerial(d).getDay(); if (w && w < 6) n++; } return n * st; });
def('DATEVALUE', ([a]) => { const p = X.parseInput(str(a)); return typeof p.v === 'number' ? Math.floor(p.v) : E('#VALUE!'); });
/* lookup */
const col = (rg, j) => rg.vals.map(r => r[j]);
const matchIdx = (v, arr, type) => {
  if (type === 0) { const t = typeof v === 'string' ? (x => typeof x === 'string' && wild(v).test(x)) : (x => cmp(x, v) === 0); return arr.findIndex(t); }
  let best = -1; for (let i = 0; i < arr.length; i++) { if (arr[i] == null) continue; const c = cmp(arr[i], v); if (type > 0 ? c <= 0 : c >= 0) best = i; else if (type > 0) break; } return best;
};
def('VLOOKUP', ([v, rg, ci, rl]) => { v = scalar(v); if (!isRng(rg)) return E('#N/A'); const j = num(ci) - 1; if (j < 0 || j >= rg.vals[0].length) return E('#REF!'); const approx = rl === undefined || rl === null ? true : bool(rl); const i = matchIdx(v, col(rg, 0), approx ? 1 : 0); return i < 0 ? E('#N/A') : rg.vals[i][j]; });
def('HLOOKUP', ([v, rg, ri, rl]) => { v = scalar(v); if (!isRng(rg)) return E('#N/A'); const j = num(ri) - 1; const approx = rl === undefined || rl === null ? true : bool(rl); const i = matchIdx(v, rg.vals[0], approx ? 1 : 0); return i < 0 || !rg.vals[j] ? E('#N/A') : rg.vals[j][i]; });
def('MATCH', ([v, rg, t]) => { v = scalar(v); const arr = rg.vals.length === 1 ? rg.vals[0] : col(rg, 0); const i = matchIdx(v, arr, t === undefined ? 1 : num(t)); return i < 0 ? E('#N/A') : i + 1; });
def('INDEX', ([rg, r, c]) => { if (!isRng(rg)) return rg; let R = num(r || 0), C = c === undefined ? 1 : num(c); if (rg.vals.length === 1 && c === undefined) { C = R; R = 1; } if (R === 0 && rg.vals[0].length === 1) R = 1; const row = rg.vals[R - 1]; return row && row[C - 1] !== undefined ? row[C - 1] : E('#REF!'); });
def('XLOOKUP', ([v, look, ret, nf, mm]) => { v = scalar(v); const arr = look.vals.length === 1 ? look.vals[0] : col(look, 0); const m = mm === undefined ? 0 : num(mm); let i = m === 0 ? matchIdx(v, arr, 0) : m === -1 ? matchIdx(v, arr, 1) : arr.findIndex(x => cmp(x, v) >= 0); if (i < 0) return nf !== undefined ? scalar(nf) : E('#N/A'); return ret.vals.length === 1 ? ret.vals[0][i] : ret.vals[i][0]; });
def('LOOKUP', ([v, a, b]) => { v = scalar(v); const arr = a.vals.length === 1 ? a.vals[0] : col(a, 0); const i = matchIdx(v, arr, 1); if (i < 0) return E('#N/A'); const r = b || a; return r.vals.length === 1 ? r.vals[0][i] : r.vals[i][r.vals[0].length - 1]; });
def('ROW', ([r], ctx) => r ? (isRng(r) ? r.g.r1 + 1 : E('#VALUE!')) : ctx.r + 1); def('COLUMN', ([r], ctx) => r ? (isRng(r) ? r.g.c1 + 1 : E('#VALUE!')) : ctx.c + 1);
def('ROWS', ([r]) => isRng(r) ? r.vals.length : 1); def('COLUMNS', ([r]) => isRng(r) ? r.vals[0].length : 1);
def('ADDRESS', ([r, c, a]) => { const t = a === undefined ? 1 : num(a); const cc = X.colName(num(c) - 1), rr = num(r); return (t === 1 || t === 3 ? '$' : '') + cc + (t === 1 || t === 2 ? '$' : '') + rr; });
/* finance */
def('PMT', ([r, n, pv, fv, t]) => { const R = num(r), N = num(n), P = num(pv), F = num(fv || 0), T = num(t || 0); if (R === 0) return -(P + F) / N; const q = Math.pow(1 + R, N); return -(R * (P * q + F)) / ((1 + R * T) * (q - 1)); });
def('FV', ([r, n, pmt, pv, t]) => { const R = num(r), N = num(n), M = num(pmt), P = num(pv || 0), T = num(t || 0); if (R === 0) return -(P + M * N); const q = Math.pow(1 + R, N); return -(P * q + M * (1 + R * T) * (q - 1) / R); });
def('PV', ([r, n, pmt, fv, t]) => { const R = num(r), N = num(n), M = num(pmt), F = num(fv || 0), T = num(t || 0); if (R === 0) return -(F + M * N); const q = Math.pow(1 + R, N); return -(F + M * (1 + R * T) * (q - 1) / R) / q; });
def('NPV', ([r, ...cf]) => { const R = num(r); return nums(cf).reduce((a, v, i) => a + v / Math.pow(1 + R, i + 1), 0); });
def('IRR', ([cf, g]) => { const c = nums([cf]); let r = g === undefined ? .1 : num(g); for (let k = 0; k < 60; k++) { let f = 0, d = 0; c.forEach((v, i) => { f += v / Math.pow(1 + r, i); d -= i * v / Math.pow(1 + r, i + 1); }); const nr = r - f / d; if (Math.abs(nr - r) < 1e-10) return nr; r = nr; } return E('#NUM!'); });
def('NPER', ([r, pmt, pv, fv]) => { const R = num(r), M = num(pmt), P = num(pv), F = num(fv || 0); if (R === 0) return -(P + F) / M; return Math.log((M - F * R) / (M + P * R)) / Math.log(1 + R); });

X.FN_INFO = {
  Math:['SUM','PRODUCT','ROUND','ROUNDUP','ROUNDDOWN','INT','ABS','SQRT','POWER','MOD','CEILING','FLOOR','MROUND','PI','RAND','RANDBETWEEN','SUMPRODUCT','SUMIF','SUMIFS','SUMSQ','EXP','LN','LOG','LOG10','FACT','GCD','LCM','QUOTIENT','SIGN','TRUNC','EVEN','ODD','COMBIN','SIN','COS','TAN','DEGREES','RADIANS'],
  Statistical:['AVERAGE','AVERAGEIF','AVERAGEIFS','COUNT','COUNTA','COUNTBLANK','COUNTIF','COUNTIFS','MAX','MAXIFS','MIN','MINIFS','MEDIAN','MODE','LARGE','SMALL','RANK','STDEV','STDEVP','VAR','VARP'],
  Logical:['IF','IFS','IFERROR','IFNA','AND','OR','NOT','XOR','SWITCH','TRUE','FALSE'],
  Text:['CONCAT','TEXTJOIN','LEFT','RIGHT','MID','LEN','UPPER','LOWER','PROPER','TRIM','SUBSTITUTE','REPLACE','FIND','SEARCH','TEXT','VALUE','REPT','EXACT','CHAR','CODE','FIXED','DOLLAR','CLEAN'],
  'Date & Time':['TODAY','NOW','DATE','TIME','YEAR','MONTH','DAY','HOUR','MINUTE','SECOND','WEEKDAY','WEEKNUM','EDATE','EOMONTH','DAYS','DATEDIF','NETWORKDAYS','DATEVALUE'],
  'Lookup & Reference':['XLOOKUP','VLOOKUP','HLOOKUP','INDEX','MATCH','LOOKUP','CHOOSE','ROW','COLUMN','ROWS','COLUMNS','ADDRESS'],
  Financial:['PMT','FV','PV','NPV','IRR','NPER'],
  Information:['ISBLANK','ISNUMBER','ISTEXT','ISERROR','ISNA','ISLOGICAL','ISEVEN','ISODD','N','NA']
};
X.FN_HELP = {
  SUM:['SUM(number1, [number2], …)','Adds all the numbers in a range of cells.'], AVERAGE:['AVERAGE(number1, [number2], …)','Returns the average (arithmetic mean) of its arguments.'],
  COUNT:['COUNT(value1, [value2], …)','Counts the cells that contain numbers.'], COUNTA:['COUNTA(value1, …)','Counts the cells that are not empty.'], MAX:['MAX(number1, …)','Returns the largest value.'], MIN:['MIN(number1, …)','Returns the smallest value.'],
  IF:['IF(logical_test, [value_if_true], [value_if_false])','Returns one value if a condition is TRUE and another if it is FALSE.'], IFERROR:['IFERROR(value, value_if_error)','Returns value_if_error if the expression is an error.'],
  IFS:['IFS(test1, value1, [test2, value2], …)','Checks conditions in order and returns the value for the first TRUE one.'], AND:['AND(logical1, …)','TRUE if all arguments are TRUE.'], OR:['OR(logical1, …)','TRUE if any argument is TRUE.'],
  SUMIF:['SUMIF(range, criteria, [sum_range])','Adds the cells that meet a condition, like ">100" or "Apples".'], COUNTIF:['COUNTIF(range, criteria)','Counts the cells that meet a condition.'], AVERAGEIF:['AVERAGEIF(range, criteria, [average_range])','Averages the cells that meet a condition.'],
  SUMIFS:['SUMIFS(sum_range, criteria_range1, criteria1, …)','Adds cells that meet several conditions.'], COUNTIFS:['COUNTIFS(criteria_range1, criteria1, …)','Counts cells that meet several conditions.'],
  VLOOKUP:['VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])','Looks for a value in the first column of a table and returns a value in the same row. Use FALSE for an exact match.'],
  XLOOKUP:['XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode])','Searches a range and returns the matching item from another range.'], INDEX:['INDEX(array, row_num, [column_num])','Returns the value at a row and column in a range.'], MATCH:['MATCH(lookup_value, lookup_array, [match_type])','Returns the position of a value in a range.'],
  ROUND:['ROUND(number, num_digits)','Rounds a number to a number of digits.'], CONCAT:['CONCAT(text1, …)','Joins several text items into one.'], TEXTJOIN:['TEXTJOIN(delimiter, ignore_empty, text1, …)','Joins text with a delimiter between items.'],
  LEFT:['LEFT(text, [num_chars])','Returns characters from the start of a text string.'], RIGHT:['RIGHT(text, [num_chars])','Returns characters from the end of a text string.'], MID:['MID(text, start_num, num_chars)','Returns characters from the middle of a text string.'], LEN:['LEN(text)','Returns the number of characters in a text string.'],
  TEXT:['TEXT(value, format_text)','Formats a number as text, e.g. TEXT(A1,"0.00") or TEXT(A1,"mmm d, yyyy").'], TODAY:['TODAY()','Returns today’s date.'], NOW:['NOW()','Returns the current date and time.'], DATE:['DATE(year, month, day)','Returns the serial number of a date.'],
  PMT:['PMT(rate, nper, pv, [fv], [type])','Calculates the payment for a loan with constant payments and interest rate.'], NPV:['NPV(rate, value1, …)','Net present value of an investment.'], IRR:['IRR(values, [guess])','Internal rate of return for a series of cash flows.'],
  MEDIAN:['MEDIAN(number1, …)','Returns the middle number.'], RANK:['RANK(number, ref, [order])','Returns the rank of a number in a list.'], LARGE:['LARGE(array, k)','Returns the k-th largest value.'], SMALL:['SMALL(array, k)','Returns the k-th smallest value.'],
  SUMPRODUCT:['SUMPRODUCT(array1, [array2], …)','Multiplies ranges element by element and adds the results.'], DATEDIF:['DATEDIF(start_date, end_date, unit)','Days ("D"), months ("M") or years ("Y") between two dates.'], EOMONTH:['EOMONTH(start_date, months)','Last day of the month, some months away.'],
  UPPER:['UPPER(text)','Converts text to uppercase.'], LOWER:['LOWER(text)','Converts text to lowercase.'], PROPER:['PROPER(text)','Capitalizes each word.'], TRIM:['TRIM(text)','Removes extra spaces.'], SUBSTITUTE:['SUBSTITUTE(text, old_text, new_text, [instance])','Replaces existing text with new text.']
};
X.fnHelp = n => X.FN_HELP[n] || [`${n}(…)`, `The ${n} function.`];
X.FN_LIST = Object.keys(FN).filter(n => !/\./.test(n) || /^(STDEV|VAR|MODE|RANK|CEILING|FLOOR)\./.test(n)).sort();

/* ---------- input parsing & formats ---------- */
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
X.parseInput = (raw, asText) => {
  if (raw == null) return { v:null }; const s = String(raw);
  if (asText) return { v:s };
  const t = s.trim(); if (t === '') return { v:null };
  if (t[0] === "'") return { v:s.slice(1) };
  let m;
  if ((m = /^([-+]?)(\$|€|£)?\s?([\d,]*\.?\d+(?:[eE][-+]?\d+)?)(%?)$/.exec(t)) && (!m[3].includes(',') || /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(m[3]))) {
    let v = parseFloat(m[3].replace(/,/g, '')); if (m[1] === '-') v = -v; if (m[4]) v /= 100;
    return { v, hint:m[4] ? { type:'percent', dec:(m[3].split('.')[1] || '').length } : m[2] ? { type:'currency', sym:m[2], dec:2 } : m[3].includes(',') ? { type:'number', sep:true, dec:(m[3].split('.')[1] || '').length } : null };
  }
  if ((m = /^\(\$?([\d,]*\.?\d+)\)$/.exec(t))) return { v:-parseFloat(m[1].replace(/,/g, '')), hint:t.includes('$') ? { type:'currency', sym:'$', dec:2 } : null };
  if (/^(true|false)$/i.test(t)) return { v:t.toLowerCase() === 'true' };
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return { v:X.toSerial(new Date(+m[1], +m[2] - 1, +m[3])), hint:{ type:'date', pattern:'iso' } };
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t))) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[1] - 1, +m[2]); if (d.getMonth() === +m[1] - 1) return { v:X.toSerial(d), hint:{ type:'date', pattern:'short' } }; }
  if ((m = /^(\d{1,2})[/-](\d{1,2})$/.exec(t))) { const d = new Date(new Date().getFullYear(), +m[1] - 1, +m[2]); if (d.getMonth() === +m[1] - 1) return { v:X.toSerial(d), hint:{ type:'date', pattern:'short' } }; }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) { const mi = MONTHS.findIndex(x => x.startsWith(m[1].toLowerCase().slice(0, 3))); if (mi >= 0) return { v:X.toSerial(new Date(+m[3], mi, +m[2])), hint:{ type:'date', pattern:'long' } }; }
  if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t))) { let h = +m[1]; if (m[4]) { h %= 12; if (/pm/i.test(m[4])) h += 12; } return { v:(h * 3600 + +m[2] * 60 + +(m[3] || 0)) / 86400, hint:{ type:'time' } }; }
  return { v:s };
};
X.generalNum = v => { if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v); const a = Math.abs(v); if (a !== 0 && (a >= 1e11 || a < 1e-9)) return v.toExponential(5).replace(/\.?0+e/, 'E').replace('e', 'E'); return String(+v.toPrecision(11)); };
const group = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fixed = (v, d, sep) => { const [i, f] = Math.abs(v).toFixed(d).split('.'); return (sep ? group(i) : i) + (f ? '.' + f : ''); };
const WD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
X.format = (v, f) => {
  if (v == null) return ''; if (isErr(v)) return v.err; if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v !== 'number') return String(v);
  const t = (f && f.type) || 'general', d = f && f.dec != null ? f.dec : 2;
  switch (t) {
    case 'number': return (v < 0 ? '-' : '') + fixed(v, d, f.sep);
    case 'currency': return (v < 0 ? (f.neg === 'paren' ? '(' : '-') : '') + (f.sym || '$') + fixed(v, d, true) + (v < 0 && f.neg === 'paren' ? ')' : '');
    case 'accounting': return v === 0 ? (f.sym || '$') + ' -  ' : (v < 0 ? '(' : '') + (f.sym || '$') + ' ' + fixed(v, d, true) + (v < 0 ? ')' : ' ');
    case 'percent': return (v * 100).toFixed(f.dec != null ? f.dec : 0) + '%';
    case 'scientific': return v.toExponential(d).toUpperCase().replace(/E\+?/, 'E+').replace('E+-', 'E-');
    case 'fraction': { const w = Math.trunc(v), fr = Math.abs(v - w); let best = [0, 1]; for (let q = 1; q <= 16; q++) { const p = Math.round(fr * q); if (Math.abs(fr - p / q) < Math.abs(fr - best[0] / best[1])) best = [p, q]; } return (w || (best[0] ? '' : '0')) + (best[0] && best[0] !== best[1] ? (w ? ' ' : '') + best[0] + '/' + best[1] : best[0] === best[1] ? '' : ''); }
    case 'date': { const dt = X.fromSerial(v); const p = f.pattern || 'short';
      if (p === 'long') return `${WD[dt.getDay()]}, ${MN[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
      if (p === 'iso') return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (p === 'mdy') return `${MN[dt.getMonth()].slice(0, 3)} ${dt.getDate()}, ${dt.getFullYear()}`;
      if (p === 'my') return `${MN[dt.getMonth()].slice(0, 3)}-${String(dt.getFullYear()).slice(2)}`;
      return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`; }
    case 'time': { const s = Math.round((v % 1 + 1) % 1 * 86400), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
    case 'datetime': return X.format(v, { type:'date' }) + ' ' + X.format(v, { type:'time' });
    case 'text': return X.generalNum(v);
  }
  return X.generalNum(v);
};
/* TEXT() patterns: 0, 0.00, #,##0, 0%, $#,##0.00, dates like yyyy-mm-dd, mmm d, dddd, h:mm AM/PM */
X.formatPattern = (v, p) => {
  if (isErr(v)) return v; if (typeof v !== 'number') { const n = num(v); if (typeof n !== 'number') return str(v); v = n; }
  if (/[ymdhs]/i.test(p) && !/[0#]/.test(p)) {
    const d = X.fromSerial(v), H = d.getHours(), ampm = /AM\/PM/i.test(p);
    return p.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|AM\/PM/gi, t => {
      switch (t.toLowerCase()) { case 'yyyy': return d.getFullYear(); case 'yy': return String(d.getFullYear()).slice(2); case 'mmmm': return MN[d.getMonth()]; case 'mmm': return MN[d.getMonth()].slice(0, 3);
        case 'mm': return /h/i.test(p) ? String(d.getMinutes()).padStart(2, '0') : String(d.getMonth() + 1).padStart(2, '0'); case 'm': return d.getMonth() + 1; case 'dddd': return WD[d.getDay()]; case 'ddd': return WD[d.getDay()].slice(0, 3);
        case 'dd': return String(d.getDate()).padStart(2, '0'); case 'd': return d.getDate(); case 'hh': return String(ampm ? H % 12 || 12 : H).padStart(2, '0'); case 'h': return ampm ? H % 12 || 12 : H; case 'ss': return String(d.getSeconds()).padStart(2, '0'); case 'am/pm': return H < 12 ? 'AM' : 'PM'; }
      return t; });
  }
  const pct = p.includes('%'); if (pct) v *= 100;
  const m = /([#0,]*)(?:\.([0#]+))?/.exec(p.replace(/[^#0,.]/g, '')) || [];
  const dec = (m[2] || '').length, sep = (m[1] || '').includes(',');
  const pre = (p.match(/^[^#0.,]*/) || [''])[0].replace(/"/g, ''), post = (p.match(/[^#0.,%]*%?[^#0.,]*$/) || [''])[0].replace(/"/g, '');
  return (v < 0 ? '-' : '') + pre + fixed(v, dec, sep) + (pct && !post.includes('%') ? '%' : '') + post;
};
})();
