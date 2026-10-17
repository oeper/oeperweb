// Pins, notebooks and share links for the desktop app: the same things the website's /ai page and the Android app have.
// They are kept on this computer only (like the website keeps them in its browser); the chats themselves sync through the account.
import * as api from './api.js';
import { splitThinking, escHtml } from './md.js';

export const SHARE_BASE = 'https://oeper.dev/share?c=';
const KEY = 'oe-ai-shelf';
export const shelf = (() => {
  let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  return { pinned: Array.isArray(o.pinned) ? o.pinned : [], notebooks: Array.isArray(o.notebooks) ? o.notebooks : [], shares: o.shares && typeof o.shares === 'object' ? o.shares : {} };
})();
export const saveShelf = () => { try { localStorage.setItem(KEY, JSON.stringify(shelf)); } catch {} };

let host = null;   // { dialog, toast, user, picGet, copy, onChange }
export const init = h => { host = h; };

/** A deleted chat must not stay in a notebook, pinned, or readable through a link. */
export function forgetChat(id) {
  const sid = shelf.shares[id];
  if (sid && host.user()) api.workerCall('DELETE', '/api/share/' + sid).catch(() => {});
  shelf.pinned = shelf.pinned.filter(x => x !== id);
  shelf.notebooks.forEach(n => { n.chats = n.chats.filter(x => x !== id); });
  delete shelf.shares[id];
  saveShelf();
}

// ── pop-up menu ──
let openMenuEl = null;
export function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; } }
document.addEventListener('pointerdown', e => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
export function showMenu(anchor, title, items) {
  closeMenu();
  const m = document.createElement('div'); m.className = 'oe-menu';
  if (title) { const t = document.createElement('div'); t.className = 'menu-title'; t.textContent = title; m.append(t); }
  for (const it of items) {
    const b = document.createElement('button'); b.type = 'button'; if (it.danger) b.className = 'danger';
    b.innerHTML = '<span class="ms"></span><span></span>';
    b.firstChild.textContent = it.icon; b.lastChild.textContent = it.label;
    b.addEventListener('click', e => { e.stopPropagation(); if (!it.keepOpen) closeMenu(); it.fn(); });
    m.append(b);
  }
  document.body.append(m); openMenuEl = m;
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.right - mw; if (x < 8) x = Math.min(r.left, innerWidth - mw - 8); x = Math.max(8, Math.min(x, innerWidth - mw - 8));
  let y = r.bottom + 4; if (y + mh > innerHeight - 8) y = r.top - mh - 4; y = Math.max(8, Math.min(y, innerHeight - mh - 8));
  m.style.left = x + 'px'; m.style.top = y + 'px';
}

/** A one-line question in a dialog; resolves the text, or null when cancelled. */
export function askText(title, { defaultValue = '', placeholder = '', maxLength = 60, ok = 'Save' } = {}) {
  return new Promise(res => {
    const d = host.dialog(`<h2>${escHtml(title)}</h2><input type="text" id="askText" maxlength="${maxLength}" placeholder="${escHtml(placeholder)}" autocomplete="off" spellcheck="false"><div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="askOk">${escHtml(ok)}</button></div>`);
    const input = d.root.querySelector('#askText'); input.value = defaultValue; input.focus(); input.select();
    let done = false;
    const finish = v => { if (done) return; done = true; d.close(); res(v); };
    d.root.querySelector('#askOk').addEventListener('click', () => finish(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(input.value); });
    d.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => finish(null)));
    document.getElementById('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') finish(null); }, { once: true });
  });
}
function askConfirm(title, text, ok) {
  return new Promise(res => {
    const d = host.dialog(`<h2>${escHtml(title)}</h2><div class="sub">${escHtml(text)}</div><div class="actions"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" id="askOk">${escHtml(ok)}</button></div>`);
    let done = false; const finish = v => { if (done) return; done = true; d.close(); res(v); };
    d.root.querySelector('#askOk').addEventListener('click', () => finish(true));
    d.root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => finish(false)));
  });
}

// ── notebooks ──
export async function newNotebook(addChatId) {
  const t = await askText('Name your notebook', { placeholder: 'Untitled notebook', maxLength: 40, ok: 'Create' });
  if (t === null) return;
  shelf.notebooks.push({ id: 'n' + Date.now().toString(36), name: t.trim().slice(0, 40) || 'Untitled notebook', chats: addChatId ? [addChatId] : [] });
  saveShelf(); host.onChange();
}
export function openNotebookPicker(chat, anchor) {
  showMenu(anchor, 'Add to notebook', [
    ...shelf.notebooks.map(n => ({
      icon: n.chats.includes(chat.id) ? 'check_box' : 'check_box_outline_blank', label: n.name, keepOpen: true,
      fn: () => { n.chats = n.chats.includes(chat.id) ? n.chats.filter(x => x !== chat.id) : [...n.chats, chat.id]; saveShelf(); host.onChange(); openNotebookPicker(chat, anchor); },
    })),
    { icon: 'add', label: 'New notebook', fn: () => newNotebook(chat.id) },
  ]);
}
export function openNotebookMenu(id, anchor, onDelete) {
  const n = shelf.notebooks.find(x => x.id === id); if (!n) return;
  showMenu(anchor, n.name, [
    { icon: 'edit', label: 'Rename', fn: async () => { const t = await askText('Rename this notebook', { defaultValue: n.name, maxLength: 40 }); if (t && t.trim()) { n.name = t.trim().slice(0, 40); saveShelf(); host.onChange(); } } },
    { icon: 'delete', label: 'Delete notebook (keeps the chats)', danger: true, fn: () => { shelf.notebooks = shelf.notebooks.filter(x => x !== n); saveShelf(); if (onDelete) onDelete(id); host.onChange(); } },
  ]);
}
export async function renameChat(chat) {
  const t = await askText('Rename this chat', { defaultValue: chat.title, maxLength: 60 });
  if (!t || !t.trim()) return false;
  chat.title = t.trim().slice(0, 60); chat.updatedAt = Date.now();
  return true;
}

// ── sharing: a public, read-only copy of the conversation (or one answer and its question) at oeper.dev/share?c=ID, made by the worker ──
const DOC_RE = /\n*<<one:([^>\n]*)>>[\s\S]*?<<\/one>>/;
const picSrc = rec => 'data:' + (rec.mime || 'image/jpeg') + ';base64,' + rec.data;
async function shrinkPicture(rec) {
  if (!rec || !rec.data) return null;
  if (rec.data.length < 300000) return { mime: rec.mime || 'image/jpeg', data: rec.data };
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1024 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
      res({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.8).split(',')[1] });
    };
    im.onerror = () => res(null);
    im.src = picSrc(rec);
  });
}
async function shareMessages(chat, from, to) {
  const out = []; let pics = 0;
  for (const m of chat.messages.slice(from, to)) {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const raw = String(m.content || '');
    const text = (role === 'user' ? raw.replace(DOC_RE, '').trim() : splitThinking('', raw, true).answer) || '';
    const o = { role, text: String(text).trim() };
    if (role === 'assistant' && m.images && m.images.length) {
      const imgs = [];
      for (const p of m.images) {
        if (pics >= 6) break;
        const rec = await shrinkPicture(await host.picGet(p.id));
        if (rec) { imgs.push({ mime: rec.mime, data: rec.data, w: p.w, h: p.h, prompt: p.prompt }); pics++; }
      }
      if (imgs.length) o.images = imgs;
    }
    if (o.text || o.images) out.push(o);
  }
  return out;
}
export function openShare(chat, from, to) {
  if (!host.user()) { host.toast('Sign in to share a conversation. The link belongs to your account, so you can switch it off again later.', 5000); return; }
  if (!chat.messages.length) { host.toast('Send a message first, then there is something to share.'); return; }
  const whole = from == null, key = whole ? chat.id : null;
  let id = key ? shelf.shares[key] || null : null;
  const d = host.dialog(`<h2>${whole ? 'Share conversation' : 'Share this answer'}</h2><div class="sub">${whole
    ? 'Anyone with the link can read this conversation as it is now (including pictures), but not change it. Messages you send later stay private until you update the link.'
    : 'Anyone with the link can read this answer and the question before it, but not change it.'}</div><div id="shBody"></div><div class="actions"><button class="btn ghost" data-close>Close</button></div>`);
  const body = d.root.querySelector('#shBody');
  const say = (t, err) => { body.innerHTML = '<div class="sub"></div>'; const x = body.firstChild; x.textContent = t; if (err) x.style.color = 'var(--error)'; };
  const paintNone = () => { body.innerHTML = '<div class="sub">This is not shared right now.</div><div class="actions" style="margin-top:0"><button class="btn" data-act="make">Create link</button></div>'; };
  const paintLink = note => {
    body.innerHTML = '<input type="text" readonly class="share-link"><div class="actions" style="margin-top:8px"><button class="btn" data-act="copy">Copy link</button><button class="btn ghost" data-act="open">Open</button>'
      + (whole ? '<button class="btn ghost" data-act="update">Update with new messages</button>' : '') + '<button class="btn danger" data-act="stop">Stop sharing</button></div><div class="sub" data-note style="margin:10px 0 0"></div>';
    body.querySelector('input').value = SHARE_BASE + id; body.querySelector('[data-note]').textContent = note || '';
  };
  async function make(update) {
    say(update ? 'Updating the link…' : 'Making the link…');
    try {
      const msgs = await shareMessages(chat, whole ? 0 : from, whole ? undefined : to);
      const firstQ = (msgs.find(m => m.role === 'user') || {}).text || '';
      const r = await api.workerCall('POST', '/api/share', { id: update ? id : undefined, title: whole ? chat.title : (firstQ.slice(0, 80) || chat.title), messages: msgs, app: 'desktop' });
      id = r.id; if (key) { shelf.shares[key] = id; saveShelf(); }
      paintLink(update ? 'The link now shows the conversation as it is.' : 'Copy it and send it to anyone.');
    } catch (e) { say(e.message || 'Could not make the link.', true); body.insertAdjacentHTML('beforeend', '<div class="actions" style="margin-top:0"><button class="btn" data-act="make">Try again</button></div>'); }
  }
  body.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]'); if (!act) return;
    const w = act.dataset.act;
    if (w === 'make') make(false);
    else if (w === 'update') make(true);
    else if (w === 'copy') { const ok = await host.copy(SHARE_BASE + id); body.querySelector('[data-note]').textContent = ok ? 'Link copied.' : 'Could not copy: select the link and copy it by hand.'; }
    else if (w === 'open') host.openExternal(SHARE_BASE + id);
    else if (w === 'stop') {
      d.close();
      if (!await askConfirm('Stop sharing?', 'The link will stop working for everyone who has it.', 'Stop sharing')) return;
      try { await api.workerCall('DELETE', '/api/share/' + id); } catch (er) { if (er.status !== 404) { host.toast(er.message || 'Could not stop sharing right now.'); return; } }
      if (key) { delete shelf.shares[key]; saveShelf(); }
      host.toast('Sharing stopped.');
    }
  });
  if (id) paintLink('This conversation is already shared. Update the link if you want it to show your newer messages.'); else make(false);
}
