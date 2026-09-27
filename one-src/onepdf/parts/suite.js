/* ============================================================
   SUITE UI: app color (seed), tab indicator, ripple, snackbar,
   dialogs, signature pad — shared look with the other one* apps
   ============================================================ */
const Suite = (function () {
  const SEEDS = [['Crimson','#c5221f'],['Ocean','#185abd'],['Violet','#6750a4'],['Teal','#006a60'],['Moss','#4c662b'],['Amber','#8b5000'],['Rose','#984061'],['Slate','#535f70']];
  const KEY = 'onepdf-seed';

  function colorToHex(c) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillStyle = c; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function probe(v) { const i = document.createElement('i'); i.style.color = `var(${v})`; i.style.display = 'none'; document.body.appendChild(i); const c = getComputedStyle(i).color; i.remove(); return colorToHex(c); }
  function updateFavicon() {
    const bg = probe('--primary'), fg = probe('--on-primary');
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='7' fill='" + bg + "'/><path d='M14 4H8a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 8 20h8a1.5 1.5 0 0 0 1.5-1.5V9z' stroke='" + fg + "' stroke-width='1.6' stroke-linejoin='round' fill='none'/><path d='M14 4v5h5' stroke='" + fg + "' stroke-width='1.6' stroke-linejoin='round' fill='none'/></svg>";
    const href = 'data:image/svg+xml;base64,' + btoa(svg);
    ['favicon-link', 'favicon-link-legacy'].forEach(id => { const l = document.getElementById(id); if (l) l.href = href; });
  }
  function setSeed(c, save) {
    document.documentElement.style.setProperty('--seed', c);
    if (save !== false) { try { localStorage.setItem(KEY, c); } catch (e) { /* storage blocked: colour just won't persist */ } }
    requestAnimationFrame(updateFavicon);
  }
  function currentSeed() { return getComputedStyle(document.documentElement).getPropertyValue('--seed').trim().toLowerCase(); }

  let seedPop = null;
  function closeSeed() { if (seedPop) { seedPop.remove(); seedPop = null; } }
  function openSeedMenu(anchor) {
    if (seedPop) return closeSeed();
    const pop = document.createElement('div'); pop.className = 'seedpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'App color');
    pop.innerHTML = '<div class="ttl">App color</div>';
    const grid = document.createElement('div'); grid.className = 'seedgrid';
    const cur = currentSeed();
    SEEDS.forEach(([n, c]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'seed' + (cur === c ? ' on' : '');
      b.title = n; b.setAttribute('aria-label', n); b.style.setProperty('--c', c); b.innerHTML = '<i></i><i></i><i></i>';
      b.onclick = () => { setSeed(c); closeSeed(); };
      grid.appendChild(b);
    });
    pop.appendChild(grid);
    const lab = document.createElement('label'); lab.className = 'seed-custom';
    lab.innerHTML = '<span class="ms" aria-hidden="true">colorize</span><span style="flex:1">Custom color</span>';
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = /^#/.test(cur) ? cur : '#c5221f'; inp.oninput = () => setSeed(inp.value);
    lab.appendChild(inp); pop.appendChild(lab);
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = (r.bottom + 6) + 'px'; pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
    seedPop = pop;
  }
  document.addEventListener('mousedown', (e) => { if (seedPop && !seedPop.contains(e.target) && !e.target.closest('#seedBtn')) closeSeed(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSeed(); });

  /* ripple on buttons */
  const RIPPLE = '.btn-filled,.btn-tonal,.chip,.tb-btn,.tabs button,.icon-btn,.text-button,.dbtn,#viewer-root .btn-icon,#viewer-root .btn,.pos-cell,.library-item,.sres,.pthumb';
  document.addEventListener('pointerdown', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = e.target.closest(RIPPLE); if (!t || t.disabled) return;
    t.classList.add('rpl');
    const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span'); s.className = 'ripple';
    Object.assign(s.style, { width: d + 'px', height: d + 'px', left: (e.clientX - r.left - d / 2) + 'px', top: (e.clientY - r.top - d / 2) + 'px' });
    t.appendChild(s); setTimeout(() => s.remove(), 650);
  }, { passive: true });

  /* tab indicator */
  function moveTabIndicator() {
    const nav = document.getElementById('mainNav'); if (!nav) return;
    const a = nav.querySelector('button.active'), ind = nav.querySelector('.tab-ind'); if (!a || !ind) return;
    ind.style.left = a.offsetLeft + 'px'; ind.style.width = a.offsetWidth + 'px';
  }
  window.addEventListener('resize', moveTabIndicator);
  if (document.fonts) document.fonts.ready.then(moveTabIndicator);

  /* snackbar */
  let toastTimer;
  function toast(msg, opt) {
    opt = opt || {};
    document.querySelectorAll('.snackbar').forEach(n => n.remove()); clearTimeout(toastTimer);
    const t = document.createElement('div'); t.className = 'snackbar'; t.setAttribute('role', 'status');
    const span = document.createElement('span'); span.textContent = msg; t.appendChild(span);
    if (opt.action) { const b = document.createElement('button'); b.className = 'dbtn text'; b.style.color = 'var(--inverse-primary)'; b.textContent = opt.action; b.onclick = () => { close(); opt.fn && opt.fn(); }; t.appendChild(b); }
    function close() { t.classList.add('out'); setTimeout(() => t.remove(), 200); }
    document.body.appendChild(t); toastTimer = setTimeout(close, opt.ms || 3600);
  }

  /* dialogs (return a promise with the chosen action index, or -1) */
  function dialog(title, body, actions) {
    return new Promise((resolve) => {
      const scrim = document.createElement('div'); scrim.className = 'scrim';
      const box = document.createElement('div'); box.className = 'dialog'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
      const h = document.createElement('h2'); h.textContent = title; box.appendChild(h);
      const b = document.createElement('div'); b.className = 'dlg-body'; if (typeof body === 'string') b.textContent = body; else b.appendChild(body); box.appendChild(b);
      const f = document.createElement('div'); f.className = 'dlg-actions';
      (actions || [{ label: 'OK', kind: 'filled' }]).forEach((a, i) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dbtn ' + (a.kind || 'text'); btn.textContent = a.label;
        btn.onclick = () => { if (a.onClick && a.onClick() === false) return; done(i); };
        f.appendChild(btn);
      });
      box.appendChild(f); scrim.appendChild(box); document.body.appendChild(scrim);
      const first = box.querySelector('input,textarea,select,canvas') || f.lastChild; setTimeout(() => first && first.focus && first.focus(), 40);
      scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) done(-1); });
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(-1); } };
      document.addEventListener('keydown', onKey, true);
      function done(i) { document.removeEventListener('keydown', onKey, true); scrim.classList.add('out'); setTimeout(() => scrim.remove(), 180); resolve(i); }
    });
  }
  function confirmDialog(title, body, okLabel, danger) {
    return dialog(title, body, [{ label: 'Cancel' }, { label: okLabel || 'OK', kind: danger ? 'danger' : 'filled' }]).then(i => i === 1);
  }

  /* signature pad → resolves with a transparent PNG data URL (cropped), or null */
  function signaturePad() {
    const wrap = document.createElement('div');
    const cv = document.createElement('canvas'); cv.className = 'sig-pad'; wrap.appendChild(cv);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap';
    row.innerHTML = '<label style="display:flex;align-items:center;gap:8px;color:var(--on-surface)">Ink <input type="color" value="#1a237e" style="width:34px;height:30px;border:0;padding:0;background:none;box-shadow:none;border-radius:8px"></label><span style="flex:1"></span>';
    const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'dbtn text'; clear.textContent = 'Clear'; row.appendChild(clear);
    wrap.appendChild(row);
    const ink = row.querySelector('input');
    let g, drawing = false, last = null, drawn = false;
    function size() { const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1; cv.width = r.width * d; cv.height = r.height * d; g = cv.getContext('2d'); g.scale(d, d); g.lineCap = 'round'; g.lineJoin = 'round'; }
    setTimeout(size, 50);
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, e.pressure || .5]; };
    cv.addEventListener('pointerdown', (e) => { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pt(e); g.strokeStyle = ink.value; g.lineWidth = 1.6 + p[2] * 2.4; g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(p[0], p[1]); g.stroke(); last = p; drawn = true; });
    cv.addEventListener('pointerup', () => { drawing = false; });
    clear.onclick = () => { g.clearRect(0, 0, cv.width, cv.height); drawn = false; };
    return dialog('Draw your signature', wrap, [{ label: 'Cancel' }, { label: 'Use signature', kind: 'filled', onClick: () => { if (!drawn) { toast('Draw your signature in the box first.'); return false; } } }]).then(i => {
      if (i !== 1) return null;
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      const pad = 8, w = Math.max(1, x1 - x0 + pad * 2), h = Math.max(1, y1 - y0 + pad * 2);
      const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(cv, x0 - pad, y0 - pad, w, h, 0, 0, w, h);
      return out.toDataURL('image/png');
    });
  }

  document.getElementById('seedBtn').addEventListener('click', (e) => openSeedMenu(e.currentTarget));
  requestAnimationFrame(updateFavicon);

  return { toast, dialog, confirmDialog, signaturePad, moveTabIndicator, setSeed };
})();
