// epic AI page helper: injected on demand into the tab epic AI is working in (never runs by itself on other pages).
// It turns the page into a short numbered list of things you can click/type into, and performs the actions.
(() => {
  if (window.__epic) return;

  const INTERACTIVE = [
    'a[href]', 'button', 'input:not([type=hidden])', 'textarea', 'select', 'summary',
    '[role=button]', '[role=link]', '[role=tab]', '[role=menuitem]', '[role=menuitemcheckbox]', '[role=menuitemradio]', '[role=checkbox]', '[role=radio]',
    '[role=switch]', '[role=option]', '[role=combobox]', '[role=textbox]', '[role=searchbox]', '[role=slider]', '[role=treeitem]',
    '[contenteditable=""]', '[contenteditable=true]', '[onclick]', '[tabindex]:not([tabindex="-1"])', '[class*="btn"]', '[class*="button"]',
  ].join(',');

  // stable numbers: an element keeps its number between snapshots while it stays on the page
  const ids = new WeakMap();
  const byId = new Map();
  let next = 1;
  function idOf(el) {
    let id = ids.get(el);
    if (!id) { id = next++; ids.set(el, id); byId.set(id, new WeakRef(el)); }
    return id;
  }
  function get(id) {
    const w = byId.get(Number(id));
    const el = w && w.deref();
    return el && el.isConnected ? el : null;
  }

  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function deepAll(root, sel, out, depth) {
    out.push(...root.querySelectorAll(sel));
    if (depth > 6) return out;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) deepAll(el.shadowRoot, sel, out, depth + 1);
    return out;
  }

  function visible(el) {
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }
  const nearScreen = r => r.bottom > -innerHeight * 0.5 && r.top < innerHeight * 1.5 && r.right > 0 && r.left < innerWidth;

  function role(el) {
    const r = el.getAttribute('role');
    const t = el.tagName.toLowerCase();
    if (t === 'input') { const ty = (el.type || 'text').toLowerCase(); return ['checkbox', 'radio', 'submit', 'button', 'file'].includes(ty) ? ty : 'input[' + ty + ']'; }
    if (r) return r;
    if (t === 'a') return 'link';
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'textarea' || t === 'select') return t;
    if (el.isContentEditable) return 'editor';
    return t;
  }
  function label(el) {
    const t = el.tagName.toLowerCase();
    let l = el.getAttribute('aria-label');
    if (!l && el.getAttribute('aria-labelledby')) l = clean(el.getAttribute('aria-labelledby').split(/\s+/).map(i => (document.getElementById(i) || {}).innerText || '').join(' '));
    if (!l && el.labels && el.labels[0]) l = el.labels[0].innerText;
    if (!l && t !== 'input' && t !== 'select' && t !== 'textarea') l = el.innerText;
    if (!l && (t === 'input') && ['submit', 'button'].includes(el.type)) l = el.value;
    if (!l) l = el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name');
    if (!l && el.querySelector) { const im = el.querySelector('img[alt]'); if (im) l = im.alt; }
    return cut(clean(l), 70);
  }
  const isPassword = el => el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'password';
  const isSecretField = el => {
    if (isPassword(el)) return true;
    const hint = (el.getAttribute('autocomplete') || '') + ' ' + (el.name || '') + ' ' + (el.id || '');
    return /(^|\s)(cc-|one-time-code)|card.?num|cvv|cvc|security.?code|\bssn\b|social.?security|passw/i.test(hint);
  };

  function line(el) {
    const id = idOf(el), r = role(el), l = label(el);
    let s = `[${id}] ${r}` + (l ? ` "${l}"` : '');
    const t = el.tagName.toLowerCase();
    if (t === 'a') { try { const u = new URL(el.href, location.href); s += ' → ' + cut(u.origin === location.origin ? u.pathname + u.search : u.href, 80); } catch { /* ignore */ } }
    if (t === 'input' || t === 'textarea') {
      if (['checkbox', 'radio'].includes(el.type)) s += el.checked ? ' (checked)' : ' (unchecked)';
      else if (isSecretField(el)) s += ' (secret field: never fill)';
      else if (el.value) s += ` value="${cut(clean(el.value), 60)}"`;
    } else if (t === 'select') {
      const opts = [...el.options].slice(0, 12).map(o => clean(o.text));
      s += ` value="${clean(el.selectedOptions[0] ? el.selectedOptions[0].text : '')}" options=[${opts.map(o => '"' + cut(o, 30) + '"').join(', ')}]`;
    } else if (el.isContentEditable && clean(el.innerText)) s += ` value="${cut(clean(el.innerText), 60)}"`;
    const exp = el.getAttribute('aria-expanded'); if (exp) s += exp === 'true' ? ' (expanded)' : ' (collapsed)';
    const sel = el.getAttribute('aria-selected') || el.getAttribute('aria-checked') || el.getAttribute('aria-pressed'); if (sel === 'true') s += ' (on)';
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') s += ' (disabled)';
    return s;
  }

  function pageText(limit, offset) {
    const main = document.querySelector('main, [role=main], article');
    let t = (main && main.innerText && main.innerText.length > 400 ? main.innerText : document.body.innerText) || '';
    t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    offset = offset || 0;
    const slice = t.slice(offset, offset + limit);
    return slice + (t.length > offset + limit ? `\n…(${t.length - offset - limit} more characters; read_text with offset ${offset + limit} continues)` : '');
  }

  function snapshot(opts) {
    opts = opts || {};
    for (const [id, w] of byId) if (!w.deref() || !w.deref().isConnected) byId.delete(id);
    const all = deepAll(document, INTERACTIVE, [], 0);
    const seen = new Set(), items = [];
    let off = 0;
    const q = opts.query ? String(opts.query).toLowerCase() : '';
    for (const el of all) {
      if (seen.has(el)) continue; seen.add(el);
      if (el.closest('#epic-ai-overlay')) continue;
      // a bare class="btn" wrapper around a real button/link is not a second thing to click
      if (!el.matches('a,button,input,textarea,select,summary,label,[role],[contenteditable],[onclick],[tabindex]') && el.querySelector('a[href],button,input')) continue;
      if (!visible(el)) continue;
      if (!q && !nearScreen(el.getBoundingClientRect())) { off++; continue; }
      const s = line(el);
      if (el.tagName === 'LABEL' && !label(el)) continue;
      if (q && !s.toLowerCase().includes(q)) continue;
      items.push(s);
    }
    const cap = opts.max || 140;
    const shown = items.slice(0, cap);
    const doc = document.documentElement;
    const range = Math.max(1, doc.scrollHeight - innerHeight);
    let out = `URL: ${location.href}\nTitle: ${document.title}\nScroll: ${Math.round((scrollY / range) * 100)}% down (page is ${Math.round(doc.scrollHeight / Math.max(1, innerHeight) * 10) / 10} screens tall)\n`;
    const dlg = document.querySelector('dialog[open], [role=dialog], [aria-modal=true]');
    if (dlg && visible(dlg)) out += 'A dialog/popup is open on top of the page.\n';
    out += `Elements${q ? ` matching "${opts.query}"` : ''}:\n` + (shown.join('\n') || '(none found)');
    if (items.length > cap) out += `\n…and ${items.length - cap} more`;
    if (off) out += `\n(${off} more elements are off-screen; scroll to reach them)`;
    if (!q) out += '\n\nVisible text:\n' + pageText(opts.textLimit || 4500, 0);
    return out;
  }

  // what is behind a number, so the caller can decide whether the click needs the person's OK first
  function info(id) {
    const el = get(id);
    if (!el) return null;
    const form = el.closest('form');
    const submit = form ? [...form.querySelectorAll('button,input[type=submit]')].map(b => label(b)).filter(Boolean) : [];
    return { label: label(el), role: role(el), href: el.href || '', secret: isSecretField(el), type: el.type || '', inForm: !!form, submitLabels: submit.slice(0, 5), host: location.hostname };
  }

  function err(msg) { return { ok: false, error: msg }; }
  const missing = id => err(`No element [${id}] on the page any more. Take a fresh snapshot and use a current number.`);

  function click(id) {
    const el = get(id);
    if (!el) return missing(id);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    let note = '';
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !(top.getRootNode() instanceof ShadowRoot)) note = ` (something else, "${cut(label(top) || top.tagName.toLowerCase(), 40)}", was drawn on top of it)`;
    try { el.focus({ preventScroll: true }); } catch { /* not focusable */ }
    const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', base));
    el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', base));
    el.click();
    return { ok: true, text: `Clicked ${role(el)} "${label(el)}"${note}` };
  }

  function setNative(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function type(id, text, submit, append) {
    const el = get(id);
    if (!el) return missing(id);
    if (isSecretField(el)) return err('That is a password / card / secret field. epic AI never fills those; ask the person to do it.');
    if (/^[\d \-]{13,23}$/.test(text) && luhn(text.replace(/\D/g, ''))) return err('That looks like a card number. epic AI never types card numbers.');
    el.scrollIntoView({ block: 'center' });
    try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      if (['checkbox', 'radio', 'file', 'submit', 'button'].includes(el.type)) return err(`[${id}] is a ${el.type}, not a text box. Use click.`);
      setNative(el, (append ? el.value : '') + text);
    } else if (el.isContentEditable) {
      if (!append) document.execCommand('selectAll', false);
      document.execCommand('insertText', false, text);
    } else return err(`[${id}] is not something you can type into.`);
    let msg = `Typed into ${role(el)} "${label(el)}"`;
    if (submit) msg += '; ' + pressKey('Enter').text;
    return { ok: true, text: msg };
  }
  function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return d.length >= 13 && d.length <= 19 && s % 10 === 0; }

  function select(id, value) {
    const el = get(id);
    if (!el) return missing(id);
    if (el.tagName !== 'SELECT') return err(`[${id}] is not a drop-down list. Click it instead.`);
    const v = String(value).toLowerCase();
    const opt = [...el.options].find(o => o.value.toLowerCase() === v || clean(o.text).toLowerCase() === v) || [...el.options].find(o => clean(o.text).toLowerCase().includes(v));
    if (!opt) return err(`No option "${value}". Options: ${[...el.options].slice(0, 12).map(o => clean(o.text)).join(', ')}`);
    el.value = opt.value;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, text: `Chose "${clean(opt.text)}"` };
  }

  function hover(id) {
    const el = get(id);
    if (!el) return missing(id);
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); const o = { bubbles: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, o) : new MouseEvent(t, o));
    return { ok: true, text: `Hovered "${label(el)}"` };
  }

  function scroller() {
    let best = null, area = 0;
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight <= el.clientHeight + 60) continue;
      const oy = getComputedStyle(el).overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      const r = el.getBoundingClientRect();
      const a = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      if (a > area && a > innerWidth * innerHeight * 0.3) { area = a; best = el; }
    }
    return best;
  }
  function scroll(dir, amount) {
    const box = scroller();
    const s = box || document.scrollingElement || document.documentElement;
    const h = box ? box.clientHeight : innerHeight, w = box ? box.clientWidth : innerWidth;
    const before = s.scrollTop;
    const px = typeof amount === 'number' ? amount : 0.8;
    const dy = (px <= 3 ? px * h : px);
    if (dir === 'down') s.scrollBy({ top: dy, behavior: 'instant' });
    else if (dir === 'up') s.scrollBy({ top: -dy, behavior: 'instant' });
    else if (dir === 'left') s.scrollBy({ left: -(px <= 3 ? px * w : px), behavior: 'instant' });
    else if (dir === 'right') s.scrollBy({ left: px <= 3 ? px * w : px, behavior: 'instant' });
    else if (dir === 'top') s.scrollTo({ top: 0, behavior: 'instant' });
    else if (dir === 'bottom') s.scrollTo({ top: s.scrollHeight, behavior: 'instant' });
    else return err('direction must be up, down, left, right, top or bottom');
    const range = Math.max(1, s.scrollHeight - h);
    return { ok: true, text: `Scrolled ${dir}${box ? ' (inside the page\'s scrolling panel)' : ''}; now ${Math.round((s.scrollTop / range) * 100)}% down` + (s.scrollTop === before && (dir === 'down' || dir === 'up') ? ' (it did not move: already at the end)' : '') };
  }

  const KEYS = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32, Space: 32, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
  function pressKey(key) {
    if (key === 'Space') key = ' ';
    const el = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    const init = { key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, keyCode: KEYS[key] || 0, which: KEYS[key] || 0, bubbles: true, cancelable: true, composed: true };
    const down = el.dispatchEvent(new KeyboardEvent('keydown', init));
    el.dispatchEvent(new KeyboardEvent('keypress', init));
    el.dispatchEvent(new KeyboardEvent('keyup', init));
    // synthetic keys have no default action, so the useful ones are done by hand
    if (down && key === 'Enter') {
      if ((el.tagName === 'INPUT' || el.tagName === 'SELECT') && el.form) { try { el.form.requestSubmit(); return { ok: true, text: 'Pressed Enter (form submitted)' }; } catch { /* fall through */ } }
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') { el.click(); return { ok: true, text: 'Pressed Enter on the focused button' }; }
    }
    if (down && key === 'Tab') {
      const f = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled && visible(e));
      const i = f.indexOf(el); const n = f[(i + 1) % f.length]; if (n) n.focus();
    }
    return { ok: true, text: `Pressed ${key}` };
  }

  function readText(id, offset, limit) {
    if (id) {
      const el = get(id);
      if (!el) return missing(id);
      return { ok: true, text: cut(clean(el.innerText || el.value || el.textContent), limit || 6000) };
    }
    return { ok: true, text: pageText(limit || 9000, offset || 0) };
  }

  // a glow around the page and a Stop pill while epic AI is driving this tab
  function overlay(on, text) {
    let o = document.getElementById('epic-ai-overlay');
    if (!on) { if (o) o.remove(); return { ok: true }; }
    if (!o) {
      o = document.createElement('div');
      o.id = 'epic-ai-overlay';
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-shadow:inset 0 0 0 3px rgba(168,199,250,.85),inset 0 0 40px rgba(168,199,250,.35);font:500 13px system-ui,sans-serif';
      const pill = document.createElement('div');
      pill.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto;display:flex;gap:10px;align-items:center;background:#1a1c22;color:#e2e2e6;border:1px solid #43474e;border-radius:999px;padding:8px 8px 8px 16px;box-shadow:0 4px 18px rgba(0,0,0,.4)';
      const span = document.createElement('span'); span.id = 'epic-ai-overlay-text';
      const b = document.createElement('button');
      b.textContent = 'Stop';
      b.style.cssText = 'all:unset;cursor:pointer;background:#a8c7fa;color:#062e6f;border-radius:999px;padding:6px 14px;font-weight:600';
      b.addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'stop' }); } catch { /* extension reloaded */ } });
      pill.append(span, b); o.append(pill);
      document.documentElement.append(o);
    }
    o.querySelector('#epic-ai-overlay-text').textContent = text || 'epic AI is working on this tab';
    return { ok: true };
  }

  const activeRef = () => (document.activeElement && document.activeElement !== document.body ? idOf(document.activeElement) : 0);

  window.__epic = { snapshot, info, activeRef, click, type, select, hover, scroll, press: pressKey, readText, overlay, pageText };
})();
