
/* ============================================================
   SUITE SHELL: app switcher + open requests when running inside one.html
   ============================================================ */
(function () {
  let embedded = false;
  try { embedded = window.parent !== window && !!window.parent.ONE_SHELL; } catch (e) {}
  const btn = document.getElementById('appsBtn');
  const post = (m) => { if (embedded) window.parent.postMessage(Object.assign({ one: true, from: 'pdf' }, m), '*'); };
  const open = (id) => { showView('viewer'); Promise.resolve(window.ensureViewerLoaded && window.ensureViewerLoaded()).then(() => window.viewerLoadFromLib && window.viewerLoadFromLib(id)); };
  // The logo: first click goes to onePDF's home (the Viewer with My Documents), a second click back to the one main page.
  const logo = document.querySelector('.titlebar .logo');
  if (logo) {
    const atHome = () => !document.getElementById('view-viewer').hidden;
    const label = () => { const t = atHome() ? (embedded ? 'Back to one' : 'Home') : 'Home'; logo.title = t; logo.setAttribute('aria-label', t); };
    const go = () => { if (!atHome()) showView('viewer'); else if (embedded) post({ type: 'home' }); label(); };
    logo.setAttribute('role', 'button'); logo.tabIndex = 0; logo.removeAttribute('aria-hidden'); logo.style.cursor = 'pointer';
    logo.addEventListener('click', go); logo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    logo.addEventListener('mouseenter', label); label();
  }
  if (!embedded) { if (btn) btn.hidden = true; return; }
  const APPS = [['home', 'Home', '#3f5aa8', null, 'home'], ['word', 'oneWord', '#185abd', 'W'], ['sheet', 'oneSheet', '#107c41', 'S'], ['slide', 'oneSlide', '#c43e1c', 'P'], ['idea', 'oneIdea', '#7719aa', 'I'], ['pdf', 'onePDF', '#c5221f', null, 'picture_as_pdf']];
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  btn.addEventListener('click', () => {
    if (pop) return close();
    pop = document.createElement('div'); pop.className = 'seedpop appspop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Apps');
    pop.innerHTML = '<div class="ttl">Apps</div><div class="appgrid"></div>';
    APPS.forEach(([id, name, color, letter, ic]) => {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'apptile' + (id === 'pdf' ? ' on' : ''); t.style.setProperty('--c', color);
      t.innerHTML = `<span class="apptile-logo">${letter ? letter : `<span class="ms">${ic}</span>`}</span><span>${name}</span>`;
      t.onclick = () => { close(); if (id === 'home') post({ type: 'home' }); else if (id !== 'pdf') post({ type: 'switch', app: id }); };
      pop.querySelector('.appgrid').appendChild(t);
    });
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  });
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target) && !e.target.closest('#appsBtn')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('message', (e) => { const m = e.data; if (m && m.one && m.to === 'pdf' && m.type === 'open') open(m.id); });
  try { const p = JSON.parse(localStorage.getItem('one-open') || 'null'); if (p && p.app === 'pdf' && Date.now() - p.t < 60000) { localStorage.removeItem('one-open'); setTimeout(() => open(p.id), 300); } } catch (e) {}
  setTimeout(() => post({ type: 'ready' }), 0);
})();
