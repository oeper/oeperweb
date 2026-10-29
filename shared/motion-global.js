// Site-wide motion layer, loaded by shared/topnav.js (so every page with the top bar gets it). Nothing here needs wiring on a page:
//   1. every interactive thing (buttons, links, inputs, chips, cards, tabs, switches ...) eases its colour/shadow/opacity changes, and buttons press in
//   2. blocks of a page (sections, cards, headings, tables, forms ...) rise in as they scroll into view, and blocks added later (a render loop) do too
//   3. images fade in when they load, <details> and <dialog> open with a motion, pages cross-fade when you navigate (View Transitions, Chrome/Edge)
//   4. `typePlaceholder(input, phrases)` types example searches into an empty search box (auto for inputs with data-oe-typing="a|b|c")
// Only opacity/transform are animated for movement (GPU), at most MAX_REVEAL blocks per page. It all switches off for prefers-reduced-motion and when
// localStorage 'oe-motion' is 'off'. Every rule uses :where() (zero specificity), so a page's own `transition` / `animation` always wins.
// This file is cached for hours: bump its `?v=N` in topnav.js when it changes.

const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const MAX_REVEAL = 140;

const off = (() => { try { return localStorage.getItem('oe-motion') === 'off'; } catch { return false; } })();
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionOn = !off && !reduced;

const CSS = `
:where(button, a, input, select, textarea, summary, label, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], .icon-btn,
  [class*="btn"], [class*="chip"], [class*="tab"], [class*="card"], [class*="tile"], [class*="toggle"], [class*="switch"], [class*="pill"], [class*="item"]) {
  transition-property: background-color, color, border-color, box-shadow, opacity, filter, fill, stroke;
  transition-duration: 160ms; transition-timing-function: ${EASE};
}
:where(button, [role="button"], .icon-btn, [class*="btn"], [class*="chip"], [class*="pill"]) {
  transition-property: background-color, color, border-color, box-shadow, opacity, filter, transform;
}
:where(button, [role="button"], .icon-btn, [class*="btn"], [class*="chip"], [class*="pill"]):active:not(:disabled):not([aria-disabled="true"]) { transform: scale(0.97); }

@keyframes oe-g-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes oe-g-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes oe-g-pop { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes oe-g-open { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

.oe-g-await { opacity: 0; transform: translateY(14px); }
.oe-g-rise { animation: oe-g-rise 420ms ${EASE} both; }
img.oe-g-img { animation: oe-g-fade 260ms ease both; }

:where(details[open]) > :where(:not(summary)) { animation: oe-g-open 220ms ${EASE} both; }
:where(dialog[open]) { animation: oe-g-pop 200ms ${EASE} both; }
:where(dialog)::backdrop { animation: oe-g-fade 200ms ease both; }
:where([popover]:popover-open) { animation: oe-g-pop 160ms ${EASE} both; }

@view-transition { navigation: auto; }
::view-transition-old(root) { animation: 140ms ease both oe-g-vt-out; }
::view-transition-new(root) { animation: 220ms ease both oe-g-fade; }
@keyframes oe-g-vt-out { to { opacity: 0; } }

@media print { .oe-g-await { opacity: 1; transform: none; } }
`;

let styled = false;
function inject() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'oe-motion-global';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ── blocks rising in ──
const CANDIDATES = 'main > *, .page > *, .wrap > *, .container > *, #content > *, section, article, h1, h2, figure, table, form, blockquote, pre, [class*="card"], [class*="panel"]';
const SKIP = '.oe-nav, nav, header[class*="nav"], dialog, [popover], [hidden], [data-no-motion], .oe-enter, .oe-g-rise, .oe-g-await, .kebab-menu, [class*="modal"], [class*="toast"], [class*="overlay"], [class*="dropdown"], [class*="menu"], [class*="tooltip"], [class*="fab"], script, style';
let budget = MAX_REVEAL;
let order = 0;
let io = null;

function done(el) {
  el.classList.remove('oe-g-rise', 'oe-g-await');
  el.style.animationDelay = '';
}
// A non-none animation-name makes an element its own stacking context, which once hid a card's dropdown behind the next card: the class
// is removed again the moment the animation ends (the end state equals the plain style, so nothing visibly changes).
function play(el, delay) {
  el.classList.remove('oe-g-await');
  el.classList.add('oe-g-rise');
  el.style.animationDelay = delay + 'ms';
  el.addEventListener('animationend', () => done(el), { once: true });
}

function eligible(el) {
  if (!(el instanceof HTMLElement) || budget <= 0) return false;
  if (el.closest(SKIP)) return false;
  if (el.parentElement && el.parentElement.closest('.oe-g-seen')) return false;       // only the outermost block of a nest animates
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.display === 'contents' || cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute') return false;
  if (cs.animationName !== 'none' || cs.opacity === '0') return false;
  const r = el.getBoundingClientRect();
  return r.width > 40 && r.height > 14;
}

function consider(el) {
  // a container whose children are themselves blocks (a grid of cards) does not animate as one lump: its children rise one after another
  // (repeated siblings = same tag and class, so a card's own title/description children do not count)
  if (el.children) {
    const seenKinds = new Map();
    for (const c of el.children) {
      if (!c.matches(CANDIDATES)) continue;
      const k = c.tagName + '.' + c.className;
      seenKinds.set(k, (seenKinds.get(k) || 0) + 1);
      if (seenKinds.get(k) >= 2) return;
    }
  }
  if (!eligible(el)) return;
  budget--;
  el.classList.add('oe-g-seen');
  const r = el.getBoundingClientRect();
  if (r.top < innerHeight * 0.92) {
    play(el, Math.min(order++ * 45, 360));
  } else {
    el.classList.add('oe-g-await');
    io.observe(el);
  }
}

function scan(root) {
  if (!(root instanceof Element)) return;
  if (root.matches && root.matches(CANDIDATES)) consider(root);
  root.querySelectorAll(CANDIDATES).forEach(consider);
}

// ── images ──
function onImgLoad(e) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || img.dataset.oeFade || img.closest('.oe-enter, [data-no-motion]')) return;
  img.classList.add('oe-g-img');
  img.addEventListener('animationend', () => img.classList.remove('oe-g-img'), { once: true });
}

// ── typing ──
/** Types example phrases into an empty, unfocused input's placeholder, one letter at a time. Stops while the person is using the box or the tab is hidden. */
export function typePlaceholder(input, phrases, opts = {}) {
  if (!input || !phrases || !phrases.length || input.dataset.oeTyping === 'on') return;
  input.dataset.oeTyping = 'on';
  const base = input.getAttribute('placeholder') || phrases[0];
  if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', base.replace(/…|\.\.\.|\(.*\)/g, '').trim() || 'search');
  if (!motionOn) return;
  const type = opts.type || 55, erase = opts.erase || 28, hold = opts.hold || 1700;
  let pi = 0, ci = 0, erasing = false, timer = 0;
  const idle = () => document.hidden || document.activeElement === input || input.value;
  const tick = () => {
    if (idle()) { if (!input.value && document.activeElement === input) input.placeholder = base; timer = setTimeout(tick, 600); return; }
    const text = phrases[pi];
    if (!erasing) {
      ci++;
      input.placeholder = text.slice(0, ci) + (ci < text.length ? '▏' : '');
      if (ci >= text.length) { erasing = true; timer = setTimeout(tick, hold); return; }
      timer = setTimeout(tick, type + Math.random() * 40);
    } else {
      ci--;
      input.placeholder = text.slice(0, ci) + '▏';
      if (ci <= 0) { erasing = false; pi = (pi + 1) % phrases.length; timer = setTimeout(tick, 350); return; }
      timer = setTimeout(tick, erase);
    }
  };
  input.addEventListener('blur', () => { clearTimeout(timer); timer = setTimeout(tick, 900); });
  timer = setTimeout(tick, opts.delay || 1400);
}

function autoTyping(root) {
  (root.querySelectorAll ? root.querySelectorAll('input[data-oe-typing]') : []).forEach(i => typePlaceholder(i, (i.dataset.oeTyping || '').split('|').map(s => s.trim()).filter(Boolean)));
}

function start() {
  inject();
  if (!motionOn || /\/ai(\.html)?\/?$/.test(location.pathname)) return;     // /ai has its own message motion
  io =new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      play(e.target, 0);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  const run = () => { scan(document.body); autoTyping(document); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(run), { once: true });
  else requestAnimationFrame(run);
  document.addEventListener('load', onImgLoad, true);
  // blocks a page adds after load (render loops, tabs, lazily built sections)
  let pending = [];
  let queued = false;
  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) pending.push(n); });
    if (pending.length && !queued) {
      queued = true;
      requestAnimationFrame(() => { const list = pending; pending = []; queued = false; list.slice(0, 60).forEach(n => { if (n.isConnected) { scan(n); autoTyping(n); } }); });
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') start();
