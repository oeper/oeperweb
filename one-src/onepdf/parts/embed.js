
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
  // Account button — same behaviour as the other apps (core.js ONE.mountAvatar): the oeper.dev account kept by
  // the main page at oeper.dev/one, or just a local name in a standalone copy.
  (function account() {
    const av = document.getElementById('acctBtn'); if (!av) return;
    let host = null; try { host = embedded && window.parent.ONE_CLOUD ? window.parent.ONE_CLOUD : null; } catch (e) {}
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const localName = () => { try { return JSON.parse(localStorage.getItem('one-name') || '""') || ''; } catch (e) { return ''; } };
    const initials = n => (n || 'You').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const render = () => {
      const a = host && host.account(), name = (a && a.name) || localName() || 'You';
      av.title = a ? `${a.name} (${a.email})` : host ? 'Sign in to oeper.dev' : name;
      av.classList.toggle('signed-out', !!host && !a);
      av.innerHTML = a && a.photo ? `<img src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : host && !a ? '<span class="ms">account_circle</span>' : esc(initials(name));
    };
    let pop = null; const close = () => { if (pop) { pop.remove(); pop = null; } };
    const openTop = url => { try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; } };
    av.addEventListener('click', () => {
      if (pop) return close();
      const a = host && host.account();
      const items = a ? [['cloud_' + (host.enabled() ? 'done' : 'off'), 'Cloud saving: ' + (host.enabled() ? 'on' : 'off'), () => host.openSettings()], ['folder_open', 'My files on oeper.dev', () => openTop('/files')], ['person', 'My profile', () => openTop(a.profileUrl || '/profile')], ['logout', 'Sign out', () => host.signOut()]]
        : host ? [['login', 'Sign in with your oeper.dev account', () => host.signIn()]] : [['open_in_new', 'Open at oeper.dev/one to sign in', () => openTop('https://oeper.dev/one/')]];
      pop = document.createElement('div'); pop.className = 'seedpop morepop acctpop';
      pop.innerHTML = `<div class="acct-head"><span class="avatar big">${a && a.photo ? `<img src="${esc(a.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials((a && a.name) || localName()))}</span><div class="acct-id"><b>${esc(a ? a.name : localName() || 'You')}</b><small>${esc(a ? a.email : host ? 'Not signed in' : 'Only on this device')}</small></div></div>`;
      items.forEach(([ic, label, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'moreitem'; b.innerHTML = `<span class="ms" aria-hidden="true">${ic}</span>${esc(label)}`; b.onclick = () => { close(); fn(); }; pop.appendChild(b); });
      document.body.appendChild(pop);
      const r = av.getBoundingClientRect(); pop.style.top = (r.bottom + 6) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
    });
    document.addEventListener('mousedown', e => { if (pop && !pop.contains(e.target) && !e.target.closest('#acctBtn')) close(); });
    if (host && host.onAccount) host.onAccount(render);
    addEventListener('storage', e => { if (e.key === 'one-name') render(); });
    render();
  })();
  if (!embedded) { if (btn) btn.hidden = true; return; }
  const ONEMARK = '<svg class="onemark" viewBox="0 0 60 200" aria-hidden="true"><path d="M20 0H40A20 20 0 0 1 60 20V180A20 20 0 0 1 20 180V41A20 20 0 0 1 0 21V20A20 20 0 0 1 20 0Z" fill="currentColor"/></svg>';
  const APPS = [['home', 'Home', '#3f5aa8', null, null], ['word', 'oneWord', '#185abd', 'W'], ['sheet', 'oneSheet', '#107c41', 'S'], ['slide', 'oneSlide', '#c43e1c', 'P'], ['idea', 'oneIdea', '#7719aa', 'I'], ['pdf', 'onePDF', '#c5221f', null, 'picture_as_pdf']];
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  btn.addEventListener('click', () => {
    if (pop) return close();
    pop = document.createElement('div'); pop.className = 'seedpop appspop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Apps');
    pop.innerHTML = '<div class="ttl">Apps</div><div class="appgrid"></div>';
    APPS.forEach(([id, name, color, letter, ic]) => {
      const t = document.createElement('button'); t.type = 'button'; t.className = 'apptile' + (id === 'pdf' ? ' on' : ''); t.style.setProperty('--c', color);
      t.innerHTML = `<span class="apptile-logo">${letter ? letter : ic ? `<span class="ms">${ic}</span>` : ONEMARK}</span><span>${name}</span>`;
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
