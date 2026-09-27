/* oneSheet — Smart Fill: spots a number pattern in a column and suggests the next values for the new rows
   you've labelled beside it.

     January   2
     February  4
     March     8
     April     16   ← grey suggestion, "Doubles each time (×2)"
     May       32

   A suggestion needs at least 3 numbers in a row in one column, followed by empty cells whose neighbouring
   column (labels, left side preferred) has something in it. Patterns: steady step, steady growth (ratio),
   steady change in the step (1 4 9 16), and "sum of the previous two". Accept with the chip's ✓, Tab on a
   suggested cell, or Ctrl+Enter; dismiss with ✕ or Esc. Switch it off in Home › Fill. */
(() => {
'use strict';
const { el, esc, icon } = ONE;
const A = X.act;
const sh = () => X.sh;
const OFF_KEY = 'os-smartfill-off';
const MIN_RUN = 3, MAX_TARGETS = 200;
let current = null;              // { c, rows:[...], vals:[...], desc, src:{r1,r2}, sig }
const dismissed = new Set();     // signatures the user said no to (until the data changes)

const num = (r, c) => { const v = X.value(r, c); return typeof v === 'number' && isFinite(v) ? v : null; };
const empty = (r, c) => X.raw(sh(), r, c) === '';
const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const fmtN = n => { const r = +n.toFixed(10); return Number.isInteger(r) ? String(r) : String(r); };
const fmtStep = n => (Number.isInteger(+n.toFixed(10)) ? fmtN(Math.abs(n)) : String(+Math.abs(n).toFixed(6)));

// Finds the rule behind a run of numbers; returns { next(k) for k = 1.., desc } or null.
function patternOf(v) {
  const n = v.length, d = v.slice(1).map((x, i) => x - v[i]);
  if (d.every(x => same(x, d[0]))) {
    if (same(d[0], 0)) return null; // a column of the same number isn't a pattern worth suggesting
    return { next:k => v[n - 1] + d[0] * k, desc:d[0] > 0 ? `Goes up by ${fmtStep(d[0])} each time` : `Goes down by ${fmtStep(d[0])} each time` };
  }
  if (v.every(x => x !== 0)) {
    const q = v[1] / v[0];
    if (v.slice(1).every((x, i) => same(x / v[i], q)) && !same(q, 1)) {
      const word = same(q, 2) ? 'Doubles each time' : same(q, 3) ? 'Triples each time' : same(q, 0.5) ? 'Halves each time' : q > 1 ? `Grows ×${fmtStep(q)} each time` : q > 0 ? `Shrinks ×${fmtStep(q)} each time` : `Multiplies by ${fmtStep(q)} each time`;
      return { next:k => v[n - 1] * Math.pow(q, k), desc:`${word} (×${+q.toFixed(6)})` };
    }
  }
  if (n >= 3 && v.slice(2).every((x, i) => same(x, v[i] + v[i + 1]))) {
    return { next:k => { const a = v.slice(-2); for (let i = 0; i < k; i++) a.push(a[a.length - 1] + a[a.length - 2]); return a[a.length - 1]; }, desc:'Each is the sum of the two before it' };
  }
  if (n >= 4) {
    const dd = d.slice(1).map((x, i) => x - d[i]);
    if (dd.every(x => same(x, dd[0])) && !same(dd[0], 0)) {
      return { next:k => { let last = v[n - 1], step = d[d.length - 1]; for (let i = 0; i < k; i++) { step += dd[0]; last += step; } return last; }, desc:`The step grows by ${fmtStep(dd[0])} each time` };
    }
  }
  return null;
}

// Scans the sheet for every place a suggestion fits, then keeps the one nearest the active cell.
function findSuggestion() {
  if (localStorage.getItem(OFF_KEY) === '1' || X.editing || !sh() || sh().protect) return null;
  const s = sh(), R = X.usedRows(s) + 1, C = X.usedCols(s), found = [];
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (num(r, c) === null || (typeof X.raw(s, r, c) === 'string' && X.raw(s, r, c)[0] === '=')) { r++; continue; }
      const r1 = r; while (r < R && num(r, c) !== null) r++;
      const r2 = r - 1; if (r2 - r1 + 1 < MIN_RUN) continue;
      for (const lc of [c - 1, c + 1]) {
        if (lc < 0) continue;
        const rows = []; for (let t = r2 + 1; t < R + 1 && rows.length < MAX_TARGETS && empty(t, c) && !empty(t, lc); t++) rows.push(t);
        if (!rows.length) continue;
        const vals = []; for (let t = r1; t <= r2; t++) vals.push(num(t, c));
        const p = patternOf(vals); if (!p) break;
        const out = rows.map((_, k) => fmtN(p.next(k + 1)));
        if (out.some(x => !isFinite(+x) || Math.abs(+x) > 1e15)) break;
        const sig = `${s.name}|${c}|${r1}-${r2}|${vals.join(',')}|${rows.length}`;
        if (!dismissed.has(sig)) found.push({ c, rows, vals:out, desc:p.desc, src:{ r1, r2 }, sig });
        break;
      }
    }
  }
  if (!found.length) return null;
  const { ar, ac } = X.sel;
  return found.sort((a, b) => (Math.abs(a.rows[0] - ar) + Math.abs(a.c - ac)) - (Math.abs(b.rows[0] - ar) + Math.abs(b.c - ac)))[0];
}

/* ---------- drawing: grey ghost values in the empty cells ---------- */
X.drawSmart = (g2, V) => {
  if (!current) return;
  const first = X.cellRect(current.rows[0], current.c, V), last = X.cellRect(current.rows[current.rows.length - 1], current.c, V);
  g2.save();
  g2.fillStyle = 'rgba(66,133,244,.07)'; g2.fillRect(first.x, first.y, first.w, last.y + last.h - first.y);
  g2.strokeStyle = 'rgba(66,133,244,.7)'; g2.setLineDash([4, 3]); g2.lineWidth = 1; g2.strokeRect(first.x + .5, first.y + .5, first.w - 1, last.y + last.h - first.y - 1);
  g2.setLineDash([]); g2.fillStyle = 'rgba(128,128,128,.9)'; g2.font = 'italic 14.5px Calibri, Carlito, "Segoe UI", sans-serif'; g2.textAlign = 'right'; g2.textBaseline = 'middle';
  current.rows.forEach((r, i) => { const R = X.cellRect(r, current.c, V); if (R.y + R.h < 0 || R.y > V.vh + 200) return; g2.fillText(current.vals[i], R.x + R.w - 5, R.y + R.h / 2); });
  g2.restore();
};

/* ---------- the chip: what it spotted, accept / dismiss ---------- */
const chip = el('div', { class:'sf-chip', hidden:true, role:'status' });
document.getElementById('goverlay').append(chip);
chip.addEventListener('pointerdown', e => e.stopPropagation());
function renderChip() {
  if (!current) { chip.hidden = true; return; }
  const n = current.rows.length;
  chip.innerHTML = `<span class="ms sf-ic" aria-hidden="true">auto_awesome</span><span class="sf-txt"><b>Smart Fill</b><small>${esc(current.desc)} · ${n} value${n === 1 ? '' : 's'}</small></span>`;
  chip.append(
    el('button', { class:'sf-yes', title:'Fill these in (Tab or Ctrl+Enter)', 'aria-label':'Accept Smart Fill', html:icon('check'), onclick:() => accept() }),
    el('button', { class:'sf-no', title:'No thanks (Esc)', 'aria-label':'Dismiss Smart Fill', html:icon('close'), onclick:() => dismiss() }));
  chip.hidden = false;
}
X.hooks.push(V => {
  if (!current || chip.hidden) return;
  const last = X.cellRect(current.rows[current.rows.length - 1], current.c, V), first = X.cellRect(current.rows[0], current.c, V);
  const visible = last.y + last.h > 0 && first.y < V.vh;
  chip.style.visibility = visible ? '' : 'hidden';
  const room = chip.parentElement.clientWidth - chip.offsetWidth - 8; // keep it inside the grid on narrow screens
  chip.style.left = Math.max(4, Math.min(first.x * V.z, room)) + 'px';
  chip.style.top = (last.y + last.h + 6) * V.z + 'px';
});

function refresh() {
  const next = findSuggestion();
  const changed = (next && next.sig) !== (current && current.sig) || (next && current && next.vals.join() !== current.vals.join());
  current = next;
  if (changed) { renderChip(); X.draw(); }
}
function accept() {
  const s = current; if (!s) return;
  const style = sh().cells[s.src.r2 + ',' + s.c] && sh().cells[s.src.r2 + ',' + s.c].s;
  current = null; renderChip();
  X.mutate(() => s.rows.forEach((r, i) => {
    X.setRaw(sh(), r, s.c, s.vals[i]);
    if (style) { const k = r + ',' + s.c; sh().cells[k] = sh().cells[k] || { v:s.vals[i] }; sh().cells[k].s = JSON.parse(JSON.stringify(style)); }
  }));
  ONE.toast(`Smart Fill added ${s.rows.length} value${s.rows.length === 1 ? '' : 's'}. ${s.desc}.`, { action:'Undo', fn:() => X.undo() });
}
function dismiss() { if (!current) return; dismissed.add(current.sig); current = null; renderChip(); X.draw(); }
A.smartFill = () => { refresh(); if (current) accept(); else ONE.toast('No pattern to continue here. Smart Fill needs 3 or more numbers in a column, with new labels next to the empty cells below them.'); };
A.toggleSmartFill = () => { const off = localStorage.getItem(OFF_KEY) === '1'; try { localStorage.setItem(OFF_KEY, off ? '0' : '1'); } catch {} ONE.toast(off ? 'Smart Fill suggestions are on.' : 'Smart Fill suggestions are off.'); refresh(); if (ONE.ribbon) ONE.ribbon.refresh(); };
X.smartFillOn = () => localStorage.getItem(OFF_KEY) !== '1';

let t; X.hooks2.push(() => { clearTimeout(t); t = setTimeout(refresh, 120); });
document.addEventListener('keydown', e => {
  if (!current || X.editing || ONE.topModal() || (ONE.backstage.isOpen && ONE.backstage.isOpen())) return;
  const onGhost = X.sel.ac === current.c && current.rows.includes(X.sel.ar);
  if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || (e.key === 'Tab' && !e.shiftKey && onGhost)) { e.preventDefault(); e.stopImmediatePropagation(); accept(); }
  else if (e.key === 'Escape') dismiss();
}, true);
setTimeout(refresh, 300);
})();
