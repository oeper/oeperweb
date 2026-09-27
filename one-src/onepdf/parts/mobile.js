
/* ============================================================
   PHONES: the viewer's hidden actions (undo, redo, fit, print, share) live in a ⋮ menu
   ============================================================ */
(function () {
  const more = document.getElementById('btn-more'); if (!more) return;
  const ITEMS = [['btn-undo', 'undo', 'Undo'], ['btn-redo', 'redo', 'Redo'], ['btn-fit', 'fit_screen', 'Fit to width'], ['btn-print', 'print', 'Print'], ['btn-share', 'share', 'Share']];
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  more.addEventListener('click', () => {
    if (pop) return close();
    pop = document.createElement('div'); pop.className = 'seedpop morepop'; pop.setAttribute('role', 'menu');
    ITEMS.forEach(([id, ic, label]) => {
      const src = document.getElementById(id); if (!src || src.classList.contains('hidden')) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'moreitem'; b.setAttribute('role', 'menuitem'); b.disabled = src.disabled;
      b.innerHTML = `<span class="ms" aria-hidden="true">${ic}</span>${label}`;
      b.onclick = () => { close(); src.click(); };
      pop.appendChild(b);
    });
    document.body.appendChild(pop);
    const r = more.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  });
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('#btn-more')) close(); });
  document.addEventListener('touchstart', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('#btn-more')) close(); }, { passive: true });
  addEventListener('resize', close);
})();
/* On touch screens there is nothing to drag from, so the drop zones say "tap" instead. */
(function () {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const t = n.textContent;
    if (/click to browse/.test(t)) n.textContent = t.replace(/Drag (.+?)(?: here)?, or click to browse/, 'Tap to choose $1').replace(/Drop (.+?) here, or click to browse\.?/, 'Choose $1 from this device.');
  }
})();
