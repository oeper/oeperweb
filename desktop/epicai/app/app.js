// epic AI desktop app: chats, streaming, screen, voice, attachments, account. See ../main.js for the native side.
import * as acct from './acct.js';
import * as api from './api.js';
import { parseAiMarkdown, splitThinking, escHtml } from './md.js';
import { injectCodeBlockStyles, wireCodeBlockCopy, copyToClipboard } from './code-block.js';
import { compactChat, toWireMessages, SCREEN_HINT } from './prompt.js';
import { readFileForAI, isImage } from './ai-files.js';
import { applySection, PROFILE_MAX, GET_TO_KNOW } from './ai-memory.js';

const D = window.epicDesktop;
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const MARK = '<svg viewBox="0 0 381 486" aria-hidden="true"><g fill="currentColor"><rect x="2" width="80" height="300" rx="40"/><rect x="297" width="80" height="300" rx="40"/></g><path d="M40 421C140 454.333 240 454.333 340 421" fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round"/></svg>';
const KEYS = { chats: 'oe-ai-chats', cur: 'oe-ai-current-chat', settings: 'epic-desktop-settings' };
const SUGGESTIONS = [
  ['Explain something simply', 'Explain something simply: how do vaccines work?'],
  ['Help me write something', 'Help me write a short, friendly email asking my teacher for an extension.'],
  ['What is on my screen?', null],
  ['Plan my day', 'Give me a plan for a productive day.'],
];

// ── state ──
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const settings = Object.assign({ screen: 'ask', theme: 'system', notify: true }, JSON.parse(ls.get(KEYS.settings) || '{}'));
const saveSettings = () => ls.set(KEYS.settings, JSON.stringify(settings));
let chats = []; try { chats = JSON.parse(ls.get(KEYS.chats) || '[]'); } catch {}
let curId = ls.get(KEYS.cur);
let user = null, profile = null, selfContext = '', memory = [], memProfile = '', memLearn = true, usage = null;
let unsubChats = null, unsubMemory = null, applyingCloud = false;
let controller = null;                    // the reply being streamed
const pending = { image: null, doc: null, shot: null };   // attachments for the next message
const shots = new WeakMap();              // message -> screenshot, sent once and never stored
let info = { version: '', platform: D.platform };
let memoryListener = null;               // the account dialog's memory list, while it is open

const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const makeChat = () => ({ id: newId(), title: 'new chat', messages: [], updatedAt: Date.now() });
const cur = () => chats.find(c => c.id === curId);
function ensureChat() { if (!cur()) { if (chats.length && chats[0].messages.length === 0) curId = chats[0].id; else { const c = makeChat(); chats.unshift(c); curId = c.id; } } return cur(); }

function save() {
  ls.set(KEYS.chats, JSON.stringify(chats)); ls.set(KEYS.cur, curId || '');
  if (!applyingCloud) acct.pushChats(chats);
}
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms); }

// ── theme and window chrome ──
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  D.setTheme(settings.theme);
  requestAnimationFrame(() => { const cs = getComputedStyle(document.documentElement); D.chromeColors(cs.getPropertyValue('--bg').trim(), cs.getPropertyValue('--text').trim()); });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => settings.theme === 'system' && applyTheme());
document.body.classList.add(D.platform === 'darwin' ? 'mac' : D.platform === 'win32' ? 'win' : 'other');
if (innerWidth < 760) document.body.classList.add('side-closed');

// ── markdown rendering of an answer into a bubble ──
injectCodeBlockStyles();
wireCodeBlockCopy($('messages'));
function renderAnswer(bubble, reasoning, content, done) {
  const { thinking, answer, stillThinking } = splitThinking(reasoning, content, done);
  let block = bubble.querySelector('.thinking-block');
  if (thinking) {
    if (!block) {
      block = el('div', 'thinking-block', '<div class="thinking-summary"><span class="material-symbols-rounded thinking-caret">expand_more</span><span class="thinking-label"></span></div><div class="thinking-content-wrap"><div class="thinking-content-inner"></div></div>');
      block.querySelector('.thinking-summary').addEventListener('click', () => block.classList.toggle('open'));
      bubble.insertBefore(block, bubble.firstChild);
    }
    block.querySelector('.thinking-label').textContent = stillThinking ? 'Thinking…' : 'Show thinking';
    block.querySelector('.thinking-content-inner').textContent = thinking;
  } else if (block) block.remove();
  let a = bubble.querySelector('.answer-content');
  if (answer) { if (!a) { a = el('div', 'answer-content'); bubble.appendChild(a); } a.innerHTML = parseAiMarkdown(answer); }
  else if (a) a.remove();
  return answer;
}

// ── scrolling: follow the end of a streaming answer unless the reader scrolled away ──
const scroller = $('scroll');
let following = true, ownScrollUntil = 0, easing = false;
const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
scroller.addEventListener('scroll', () => { if (performance.now() > ownScrollUntil) following = nearBottom(); });
scroller.addEventListener('wheel', e => { if (e.deltaY < 0) following = false; }, { passive: true });
function follow() {
  if (!following || easing) return;
  easing = true;
  const step = () => {
    const diff = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    if (diff < 1 || !following) { easing = false; return; }
    ownScrollUntil = performance.now() + 60;
    scroller.scrollTop += diff * 0.16 + Math.sign(diff) * 0.4;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function jumpToEnd() { following = true; ownScrollUntil = performance.now() + 80; scroller.scrollTop = scroller.scrollHeight; }

// ── messages ──
const DOC_RE = /\n*<<one:([^>\n]*)>>[\s\S]*?<<\/one>>/;
const splitDoc = c => { const m = DOC_RE.exec(c || ''); return m ? { text: String(c).replace(DOC_RE, '').trim(), title: m[1] } : { text: c, title: null }; };

function actions(...btns) {
  const row = el('div', 'msg-actions');
  for (const [icon, title, fn] of btns) { const b = el('button', 'act', `<span class="ms">${icon}</span>`); b.title = title; b.addEventListener('click', fn); row.appendChild(b); }
  return row;
}
function viewImage(src) { const v = el('div', 'viewer', `<img src="${escHtml(src)}">`); v.addEventListener('click', () => v.remove()); document.body.appendChild(v); }

function userEl(m, i) {
  const wrap = el('div', 'msg user');
  if (m.imageUrl) { const img = el('img', 'attach'); img.src = m.imageUrl; img.addEventListener('click', () => viewImage(m.imageUrl)); wrap.appendChild(img); }
  const shot = shots.get(m);
  if (shot) { const img = el('img', 'shot'); img.src = shot; img.addEventListener('click', () => viewImage(shot)); wrap.appendChild(img); }
  else if (m.screen) wrap.appendChild(el('div', 'shot-tag', '<span class="ms">screenshot_monitor</span>Screen shown (not saved)'));
  const { text, title } = splitDoc(m.content);
  if (text || title) {
    const b = el('div', 'bubble'); b.textContent = text || '';
    if (title) b.appendChild(el('div', 'doc-chip', `<span class="material-symbols-rounded">description</span>${escHtml(title)}`));
    wrap.appendChild(b);
  }
  wrap.appendChild(actions(['content_copy', 'Copy', () => copyToClipboard(text || '').then(() => toast('Copied'))], ['edit', 'Edit', () => editMessage(i)]));
  return wrap;
}
// ── pictures epic AI drew: the picture lives in this app's IndexedDB; the chat only keeps a small note about it ──
const PicStore = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('epic-pictures', 1); r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('p', mode); const out = fn(t.objectStore('p')); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); }); };
  return {
    put: async rec => { try { await run('readwrite', st => st.put(rec)); const keys = await run('readonly', st => st.getAllKeys()); if (keys.length > 80) await run('readwrite', st => { keys.sort().slice(0, keys.length - 80).forEach(k => st.delete(k)); }); } catch (e) { console.warn('picture not stored', e); } },
    get: async id => { try { return await run('readonly', st => st.get(id)); } catch { return null; } },
  };
})();
function picNode(p, rec) {
  const box = el('div');
  const src = 'data:' + (rec.mime || 'image/jpeg') + ';base64,' + rec.data;
  const ext = /png/.test(rec.mime || '') ? 'png' : /webp/.test(rec.mime || '') ? 'webp' : 'jpg';
  box.innerHTML = '<div class="pic"><img alt=""></div><div class="pic-bar"><a class="pic-btn" download="epic-ai-picture.' + ext + '"><span class="ms">download</span>Save</a>' + (p.best ? '<span class="pic-tag">best quality</span>' : '') + '</div>';
  const img = box.querySelector('img'); img.src = src; img.alt = p.prompt || 'picture epic AI drew';
  box.querySelector('a').href = src;
  img.addEventListener('click', () => { const lb = el('div', 'pic-lightbox', '<img alt="">'); lb.querySelector('img').src = src; lb.addEventListener('click', () => lb.remove()); document.body.appendChild(lb); });
  return box;
}
async function fillPic(slot, p) {
  const rec = await PicStore.get(p.id);
  if (!slot.isConnected) return;
  if (rec) slot.replaceChildren(picNode(p, rec));
  else slot.innerHTML = '<div class="pic-missing">This picture is saved on the device where it was made.' + (p.prompt ? ' It was drawn from: “' + escHtml(String(p.prompt).slice(0, 160)) + '”' : '') + '</div>';
}
function assistantEl(m, i, last) {
  const wrap = el('div', 'msg assistant', `<div class="mark">${MARK}</div><div class="col"><div class="bubble"></div></div>`);
  const bubble = wrap.querySelector('.bubble');
  if (m.error) { bubble.classList.add('error'); bubble.textContent = m.content; } else if (m.content) renderAnswer(bubble, '', m.content || '', true); else bubble.remove();
  for (const p of (m.images || [])) { const slot = el('div'); wrap.querySelector('.col').appendChild(slot); fillPic(slot, p); }
  const btns = [['content_copy', 'Copy', () => copyToClipboard(m.content || '').then(() => toast('Copied'))]];
  if (last) btns.push(['refresh', 'Try again', () => regenerate(i)]);
  wrap.querySelector('.col').appendChild(actions(...btns));
  return wrap;
}
function renderChat(keepScroll) {
  const was = scroller.scrollTop;
  const box = $('messages'); box.innerHTML = '';
  const c = cur();
  $('title').textContent = c && c.messages.length ? c.title : 'New chat';
  if (!c || !c.messages.length) {
    const w = el('div', 'hello-wrap', '<div class="hello">Hello</div><div class="hello-sub">How can I help you today?</div><div class="chips"></div>');
    const chips = w.querySelector('.chips');
    for (const [label, q] of SUGGESTIONS) {
      const b = el('button', 'chip'); b.textContent = label;
      b.addEventListener('click', () => q ? (($('input').value = q), send()) : lookAtScreen('What is on my screen right now?'));
      chips.appendChild(b);
    }
    box.appendChild(w);
  } else {
    c.messages.forEach((m, i) => box.appendChild(m.role === 'user' ? userEl(m, i) : assistantEl(m, i, i === c.messages.length - 1)));
  }
  if (keepScroll && !following) { ownScrollUntil = performance.now() + 80; scroller.scrollTop = was; } else jumpToEnd();
}

function editMessage(i) {
  if (controller) return;
  const c = cur(); const m = c.messages[i]; if (!m) return;
  $('input').value = splitDoc(m.content).text || ''; autoGrow();
  c.messages = c.messages.slice(0, i); c.updatedAt = Date.now(); save(); renderChat(); renderList(); $('input').focus();
}
async function regenerate(i) {
  if (controller) return;
  const c = cur(); if (!c || c.messages[i]?.role !== 'assistant') return;
  c.messages = c.messages.slice(0, i); save(); renderChat();
  await sendToModel(c);
}

// ── sending ──
function setSending(on) {
  const b = $('sendBtn'); b.classList.toggle('stop', on); b.querySelector('.ms').textContent = on ? 'stop' : 'arrow_upward'; b.title = on ? 'Stop' : 'Send';
}
function autoGrow() { const t = $('input'); t.style.height = 'auto'; t.style.height = Math.min(200, t.scrollHeight) + 'px'; }

async function send(opts = {}) {
  if (controller) return;
  const input = $('input');
  let text = input.value.trim();
  if (!text && !pending.image && !pending.doc && !pending.shot) return;
  const doc = pending.doc, image = pending.image, shot = pending.shot;
  if (doc) text = (text || 'Summarize this document.') + `\n\n<<one:${doc.title.replace(/[<>\n]/g, ' ')}>>\n${doc.text}\n<</one>>`;
  if (shot && !text) text = 'What is on my screen?';
  pending.image = pending.doc = pending.shot = null; renderAttachments();
  input.value = ''; autoGrow();
  const c = ensureChat();
  const msg = { role: 'user', content: text };
  setSending(true);
  try {
    if (image) {
      try { msg.imageUrl = await api.uploadImage(image); }
      catch (err) { toast('Could not upload the image: ' + err.message); return; }
    }
    if (shot) { msg.screen = true; shots.set(msg, shot); }
    c.messages.push(msg);
    if (c.title === 'new chat' && text) { const t = splitDoc(text).text || text; c.title = t.slice(0, 40) + (t.length > 40 ? '…' : ''); }
    c.updatedAt = Date.now(); save(); renderChat(); renderList();
    await sendToModel(c);
  } finally { if (!controller) setSending(false); }
}

const sessionNote = () => `[Session: you are the epic AI desktop app on the person's ${info.platform === 'darwin' ? 'Mac' : 'Windows PC'}, in your own window. You cannot see their screen unless a screenshot is attached to their message.]`;

async function sendToModel(c, { retried = false } = {}) {
  controller = new AbortController(); setSending(true); following = true;
  const lastUser = [...c.messages].reverse().find(m => m.role === 'user');
  const canLook = settings.screen !== 'off' && !retried && lastUser && !shots.has(lastUser) && !lastUser.imageUrl;
  const box = $('messages');
  const wrap = el('div', 'msg assistant', `<div class="mark">${MARK}</div><div class="col"><div class="status"></div><div class="bubble thinking"></div></div>`);
  const bubble = wrap.querySelector('.bubble'), statusEl = wrap.querySelector('.status');
  box.appendChild(wrap); follow();
  let reasoning = '', content = '', timedOut = false, lastActivity = Date.now(), lastPaint = 0, paintTimer = null, sawText = false;
  const asksScreen = t => canLook && t.trim() && ('<<screen>>'.startsWith(t.trim()) || t.trim().startsWith('<<screen>>'));
  const paint = () => {
    paintTimer = null; lastPaint = Date.now();
    if (asksScreen(content)) { statusEl.textContent = 'Looking at your screen…'; return; }
    statusEl.textContent = '';
    renderAnswer(bubble, reasoning, content); follow();
  };
  const watchdog = setInterval(() => { if (Date.now() - lastActivity > 45000) { timedOut = true; controller.abort(); } }, 5000);
  let answer = '', failed = false;
  const pics = [];
  try {
    const compact = await compactChat(c, () => save());
    const extra = sessionNote() + (canLook ? ' ' + SCREEN_HINT : '');
    const wire = await toWireMessages(compact.msgs, { summary: compact.summary, selfContext, memoryFacts: memory, memoryProfile: memProfile, memoryLearn: memLearn, extra, shots, chats, curId });
    await api.streamChat({
      messages: wire, signal: controller.signal,
      onActivity: () => { lastActivity = Date.now(); },
      onEvent: j => {
        if (j.profile) { if (memLearn) { const next = applySection(memProfile, j.profile.section, j.profile.text); if (next !== memProfile) { memProfile = next; acct.saveProfile(next).catch(() => {}); if (memoryListener) memoryListener(); } } }
        else if (j.remember) { if (memLearn) acct.rememberFact(j.remember); }
        else if (j.updateMemory) { if (memLearn) acct.updateFact(j.updateMemory.old, j.updateMemory.new); }
        else if (j.forget) acct.forgetFact(j.forget);
        else if (j.setFollow) acct.setFollow(j.setFollow.handle, j.setFollow.follow);
        else if (j.image) {
          const im = j.image, id = 'pic_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const note = { id, w: im.w || 0, h: im.h || 0, best: !!im.best, prompt: String(im.prompt || '').slice(0, 400) };
          pics.push(note);
          PicStore.put({ id, mime: im.mime, data: im.data, w: note.w, h: note.h, best: note.best, prompt: note.prompt });
          bubble.classList.remove('thinking'); sawText = true;
          wrap.querySelector('.col').appendChild(picNode(note, { mime: im.mime, data: im.data })); follow();
        }
      },
      onDelta: (cn, rs) => {
        content = cn; reasoning = rs;
        if (!sawText) { sawText = true; bubble.classList.remove('thinking'); }
        const gap = Math.min(600, 100 + Math.floor((rs.length + cn.length) / 150));
        const wait = gap - (Date.now() - lastPaint);
        if (wait <= 0) paint(); else if (!paintTimer) paintTimer = setTimeout(paint, wait);
      },
    });
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = null; }
    bubble.classList.remove('thinking');
    answer = splitThinking(reasoning, content, true).answer;
    if (!(canLook && answer.trim().startsWith('<<screen>>'))) { statusEl.textContent = ''; if (content || reasoning) renderAnswer(bubble, reasoning, content, true); }
  } catch (err) {
    failed = true;
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = null; }
    bubble.classList.remove('thinking'); statusEl.textContent = '';
    if (timedOut) { bubble.textContent = content || 'The connection stalled and never responded. Try again.'; bubble.classList.add('error'); }
    else if (err.name === 'AbortError') { if (!content) bubble.textContent = '(stopped)'; }
    else { bubble.textContent = content || (err.isLimit ? err.message : 'Could not reach epic AI: ' + err.message); bubble.classList.add('error'); }
  } finally {
    clearInterval(watchdog); controller = null; setSending(false);
  }
  // it could not tell what the message refers to: look at the screen (asking first unless allowed) and ask again, once
  if (!failed && canLook && answer.trim().startsWith('<<screen>>')) {
    statusEl.textContent = ''; bubble.remove();
    const col = wrap.querySelector('.col');
    const go = async () => {
      card.remove(); col.appendChild(el('div', 'status', 'Looking at your screen…'));
      const r = await D.captureScreen({ hideWindow: true });
      wrap.remove();
      if (!r.dataUrl) { screenProblem(r.error); return; }
      lastUser.screen = true; shots.set(lastUser, r.dataUrl); save(); renderChat();
      await sendToModel(c, { retried: true });
    };
    const card = el('div', 'ask-screen', '<span class="ms">screenshot_monitor</span><span>epic AI wants to look at your screen to answer.</span>');
    if (settings.screen === 'auto') { col.appendChild(card); go(); return; }
    const yes = el('button', null, 'Show my screen'), no = el('button', 'ghost', 'No thanks');
    yes.addEventListener('click', go);
    no.addEventListener('click', async () => { wrap.remove(); lastUser.noScreen = true; c.messages.push({ role: 'assistant', content: "No problem. Tell me what you mean, or attach what you're looking at, and I'll help." }); save(); renderChat(); });
    card.append(yes, no); col.appendChild(card); follow();
    return;
  }
  const { answer: finalAnswer } = splitThinking(reasoning, content, true);
  if ((finalAnswer || pics.length) && !failed) {
    const reply = { role: 'assistant', content: finalAnswer || '' }; if (pics.length) reply.images = pics;
    c.messages.push(reply); c.updatedAt = Date.now(); save();
    renderChat(true);
    if (settings.notify && !document.hasFocus() && finalAnswer) {
      try { const n = new Notification('epic AI replied', { body: finalAnswer.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 140) }); n.onclick = () => D.focus(); } catch {}
    }
  } else if (!failed && !finalAnswer && (content || reasoning)) { wrap.remove(); }
  renderList(); refreshUsage();
}

// ── screen ──
function screenProblem(code) {
  if (code === 'permission') { toast('Allow epic AI to record the screen in System Settings → Privacy & Security → Screen Recording, then try again.', 6000); D.openScreenSettings(); }
  else toast('Could not capture the screen' + (code && code !== 'empty' ? ': ' + code : '.'));
}
async function lookAtScreen(question) {
  const btn = $('screenBtn'); btn.classList.add('busy');
  try {
    const r = await D.captureScreen({ hideWindow: true });
    if (!r.dataUrl) { screenProblem(r.error); return; }
    pending.shot = r.dataUrl; renderAttachments();
    if (question) { $('input').value = question; send(); } else $('input').focus();
  } finally { btn.classList.remove('busy'); }
}

// ── attachments ──
function renderAttachments() {
  const row = $('attachRow'); row.innerHTML = '';
  const add = (thumb, name, sub, onRemove) => {
    const a = el('div', 'att', `${thumb ? `<img src="${thumb}">` : '<span class="ms">description</span>'}<div><div class="nm">${escHtml(name)}</div><div class="sub">${escHtml(sub || '')}</div></div><button class="x" title="Remove"><span class="ms">close</span></button>`);
    a.querySelector('.x').addEventListener('click', () => { onRemove(); renderAttachments(); });
    row.appendChild(a);
  };
  if (pending.shot) add(pending.shot, 'My screen', 'sent once, not saved', () => { pending.shot = null; });
  if (pending.image) add(URL.createObjectURL(pending.image), 'Image', '', () => { pending.image = null; });
  if (pending.doc) add(null, pending.doc.title, pending.doc.note || '', () => { pending.doc = null; });
}
async function attachFile(file) {
  if (!file) return;
  try {
    if (isImage(file)) { try { pending.image = await api.resizeImage(file); } catch { pending.image = file; } }
    else { const r = await readFileForAI(file, { maxChars: 24000 }); pending.doc = { title: r.title, text: r.text, note: r.note }; }
    renderAttachments(); $('input').focus();
  } catch (err) { toast(err.message || 'Could not read that file'); }
}
$('attachBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; attachFile(f); });
$('input').addEventListener('paste', e => {
  for (const it of e.clipboardData ? e.clipboardData.items : []) if (it.kind === 'file' && it.type.startsWith('image/')) { e.preventDefault(); attachFile(it.getAsFile()); return; }
});
let dragDepth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) attachFile(f); });

// ── voice ──
let rec = null;
async function toggleMic() {
  const b = $('micBtn');
  if (rec) { rec.stop(); return; }
  if (!user) { toast('Sign in to use voice.'); return; }
  if (!(await D.micAccess())) { toast('Allow the microphone for epic AI in your system settings.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('No microphone available.'); return; }
  const chunks = [];
  const mr = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
  rec = mr; b.classList.add('rec'); $('hint').textContent = 'Listening… tap the microphone again when you are done';
  const limit = setTimeout(() => mr.state === 'recording' && mr.stop(), 60000);
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = async () => {
    clearTimeout(limit); stream.getTracks().forEach(t => t.stop()); rec = null; b.classList.remove('rec');
    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
    if (blob.size < 1500) { $('hint').textContent = ''; return; }
    $('hint').textContent = 'Writing that down…';
    try {
      const text = await api.transcribe(blob);
      if (text) { const i = $('input'); i.value = (i.value ? i.value + ' ' : '') + text; autoGrow(); i.focus(); }
      else toast('I did not catch that.');
    } catch (err) { toast(err.message); }
    $('hint').textContent = '';
  };
  mr.start();
}
$('micBtn').addEventListener('click', toggleMic);

// ── composer ──
$('sendBtn').addEventListener('click', () => controller ? controller.abort() : send());
$('input').addEventListener('input', autoGrow);
$('input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!controller) send(); } });
$('screenBtn').addEventListener('click', () => lookAtScreen());
$('newChat').addEventListener('click', newChat);
$('sideToggle').addEventListener('click', () => document.body.classList.toggle('side-closed'));
$('settingsBtn').addEventListener('click', openSettings);
$('acct').addEventListener('click', openAccount);

function newChat() {
  if (controller) controller.abort();
  const c = chats[0];
  if (c && !c.messages.length) curId = c.id; else { const n = makeChat(); chats.unshift(n); curId = n.id; }
  save(); renderChat(); renderList(); $('input').focus();
}

// ── chat list ──
function renderList() {
  const box = $('chatList'), q = $('search').value.trim().toLowerCase();
  box.innerHTML = '';
  const list = chats.filter(c => c.messages.length && (!q || (c.title || '').toLowerCase().includes(q) || c.messages.some(m => (m.content || '').toLowerCase().includes(q))))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (!list.length) { box.appendChild(el('div', 'empty-list', q ? 'No chats match.' : 'Your chats show up here.')); return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = 86400000; let group = '';
  for (const c of list) {
    const t = c.updatedAt || 0;
    const g = t >= today.getTime() ? 'Today' : t >= today.getTime() - day ? 'Yesterday' : t >= today.getTime() - 7 * day ? 'Previous 7 days' : 'Older';
    if (g !== group) { group = g; box.appendChild(el('div', 'chat-group', g)); }
    const it = el('button', 'chat-item' + (c.id === curId ? ' active' : ''), `<span class="name">${escHtml(c.title || 'new chat')}</span><span class="del" title="Delete"><span class="ms">delete</span></span>`);
    it.addEventListener('click', e => {
      if (e.target.closest('.del')) { deleteChat(c.id); return; }
      if (controller) controller.abort();
      curId = c.id; save(); renderChat(); renderList();
      if (innerWidth < 760) document.body.classList.add('side-closed');
    });
    box.appendChild(it);
  }
}
function deleteChat(id) {
  chats = chats.filter(c => c.id !== id);
  if (curId === id) { curId = chats[0] ? chats[0].id : null; }
  save(); renderChat(); renderList();
}
$('search').addEventListener('input', renderList);

// ── dialogs ──
function dialog(html) {
  const o = $('overlay'); o.innerHTML = `<div class="dialog">${html}</div>`; o.classList.add('open');
  const close = () => { o.classList.remove('open'); o.innerHTML = ''; memoryListener = null; };
  o.onclick = e => { if (e.target === o) close(); };
  o.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  return { root: o.firstElementChild, close };
}
addEventListener('keydown', e => { if (e.key === 'Escape') { $('overlay').classList.remove('open'); $('overlay').innerHTML = ''; memoryListener = null; } });
const kfmt = n => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
const planName = u => !u ? 'Guest' : u.plan === 'plus' ? 'oeper+' : u.signedIn === false ? 'Guest' : 'Free';

async function refreshUsage() {
  usage = await api.usage();
  const plan = $('acctPlan');
  if (!usage) { plan.textContent = user ? 'Signed in' : 'Sign in for more'; return; }
  if (!user) plan.textContent = `Guest · ${Math.max(0, usage.messageLimit - usage.messagesUsed)} of ${usage.messageLimit} messages left`;
  else plan.textContent = `${planName(usage)} · ${Math.max(0, 100 - Math.min(100, Math.round(usage.used / usage.limit * 100)))}% left today`;
}

function signInCard() {
  return `<div class="signin-card"><svg class="epic-mark" viewBox="0 0 381 486" aria-hidden="true"><g fill="currentColor"><rect x="2" width="80" height="300" rx="40"/><rect x="297" width="80" height="300" rx="40"/></g><path d="M40 421C140 454.333 240 454.333 340 421" fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round"/></svg>
    <h2>Sign in to epic AI</h2><div class="sub">Your chats and what epic AI remembers follow you between this app, the website and your phone. Signed-in people get a bigger daily allowance and voice input.</div>
    <button class="btn g-btn" id="doSignIn"><span class="ms">login</span>Continue with Google</button>
    <div class="fine">Sign-in opens in your browser. By continuing you agree to the <a data-link="https://oeper.dev/terms">terms</a> and <a data-link="https://oeper.dev/privacy">privacy policy</a>.</div></div>`;
}
function wireLinks(root) { root.querySelectorAll('[data-link]').forEach(a => a.addEventListener('click', () => D.openExternal(a.dataset.link))); }

function openAccount() {
  if (!user) {
    const d = dialog(signInCard() + '<div class="actions"><button class="btn ghost" data-close>Not now</button></div>');
    wireLinks(d.root);
    d.root.querySelector('#doSignIn').addEventListener('click', async e => {
      e.target.closest('button').disabled = true;
      try { await acct.signIn(); d.close(); toast('Signed in'); } catch (err) { toast(err.message || 'Sign-in did not finish'); e.target.closest('button').disabled = false; }
    });
    return;
  }
  const u = usage, pct = u ? Math.min(100, Math.round(u.used / u.limit * 100)) : 0;
  const reset = u ? new Date(u.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const d = dialog(`<h2>${escHtml(profile ? profile.name : 'Account')}</h2><div class="sub">${escHtml(user.email)}${profile && profile.handle ? ' · @' + escHtml(profile.handle) : ''}</div>
    <span class="plan-badge">${planName(u).toUpperCase()}</span>
    ${u ? `<div class="meter"><div style="width:${pct}%"></div></div><div class="sub" style="margin-bottom:6px"><b>${kfmt(Math.min(u.used, u.limit))} of ${kfmt(u.limit)}</b> tokens used today · resets at ${reset}${u.bonus ? `<br><b>${kfmt(u.bonus)}</b> bonus tokens saved up` : ''}</div>` : ''}
    <div class="row"><div style="flex:1"><div class="t">Have a code?</div><input type="text" id="code" placeholder="Enter a code" autocomplete="off" spellcheck="false"><div class="msg-line" id="codeMsg"></div></div><button class="btn" id="redeemBtn">Redeem</button></div>
    <div class="row" style="display:block"><div class="t">Your memory file</div><div class="d">epic AI keeps notes about you here so it can help you better over time. You can read and change anything: what you write is treated as the truth, and it is saved to your account only.</div>
      <label class="memory-learn"><input type="checkbox" id="memLearn"> Let epic AI learn about me as we chat (and ask the odd question to get to know me)</label>
      <textarea id="memFile" class="memory-file" spellcheck="false" placeholder="Nothing here yet. epic AI fills this in as you chat, or write your own notes, e.g.&#10;## About you&#10;- call me Sam&#10;## Preferences&#10;- keep answers short"></textarea>
      <div class="memory-bar"><button class="btn" id="memSave" disabled>Save</button><button class="btn ghost" id="memKnow">Get to know me</button><span style="flex:1"></span><span class="d" id="memCount"></span></div>
      <div class="t" style="margin-top:10px">Quick facts it saved</div><div class="memory-list" id="memList"></div></div>
    <div class="actions"><button class="btn danger" id="signOut">Sign out</button><button class="btn ghost" data-close>Close</button></div>`);
  let memDirty = false;
  const memFile = d.root.querySelector('#memFile'), memSave = d.root.querySelector('#memSave'), memLearnEl = d.root.querySelector('#memLearn'), memCount = d.root.querySelector('#memCount');
  memFile.addEventListener('input', () => { memDirty = true; memSave.disabled = false; memCount.textContent = memFile.value.length + ' / ' + PROFILE_MAX; });
  memSave.addEventListener('click', async () => { memSave.disabled = true; try { await acct.saveProfile(memFile.value); memProfile = memFile.value.slice(0, PROFILE_MAX); memDirty = false; toast('Saved'); } catch { memSave.disabled = false; toast('Could not save'); } });
  memLearnEl.addEventListener('change', () => { memLearn = memLearnEl.checked; acct.setLearn(memLearn); });
  d.root.querySelector('#memKnow').addEventListener('click', () => {
    if (!memLearn) { memLearn = true; acct.setLearn(true); }
    d.close(); newChat(); $('input').value = GET_TO_KNOW; send();
  });
  const renderMem = () => {
    if (!memDirty) { memFile.value = memProfile; memSave.disabled = true; }
    memLearnEl.checked = memLearn; memCount.textContent = memFile.value.length + ' / ' + PROFILE_MAX;
    const l = d.root.querySelector('#memList'); if (!l) return; l.innerHTML = '';
    if (!memory.length) l.appendChild(el('div', 'd', 'Nothing yet.'));
    for (const f of memory) { const r = el('div', 'fact', `<span>${escHtml(f)}</span>`); const x = el('button', 'act', '<span class="ms">close</span>'); x.title = 'Forget this'; x.addEventListener('click', () => acct.forgetFact(f)); r.appendChild(x); l.appendChild(r); }
  };
  renderMem(); memoryListener = renderMem;
  const go = async () => {
    const code = d.root.querySelector('#code').value.trim(), msg = d.root.querySelector('#codeMsg');
    if (!code) return; const b = d.root.querySelector('#redeemBtn'); b.disabled = true; msg.className = 'msg-line'; msg.textContent = '';
    try { const r = await api.redeem(code); msg.className = 'msg-line ok'; msg.textContent = `Redeemed. You got ${r.summary}.`; d.root.querySelector('#code').value = ''; refreshUsage(); }
    catch (err) { msg.className = 'msg-line bad'; msg.textContent = err.message; }
    b.disabled = false;
  };
  d.root.querySelector('#redeemBtn').addEventListener('click', go);
  d.root.querySelector('#code').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  d.root.querySelector('#signOut').addEventListener('click', async () => { await acct.signOutUser(); d.close(); toast('Signed out'); });
}

async function openSettings() {
  const login = await D.getLogin();
  const sw = (id, on) => `<button class="switch${on ? ' on' : ''}" id="${id}" role="switch" aria-checked="${!!on}"></button>`;
  const d = dialog(`<h2>Settings</h2><div class="sub">epic AI ${escHtml(info.version)}</div>
    <div class="row"><div><div class="t">Appearance</div></div><select id="theme"><option value="system">Match system</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
    <div class="row"><div><div class="t">Looking at your screen</div><div class="d">When a message points at something epic AI can't see ("this error", "that window"), it can ask to look at your screen. Screenshots are sent once and never stored.</div></div><select id="screenMode"><option value="ask">Ask me first</option><option value="auto">Look automatically</option><option value="off">Never</option></select></div>
    <div class="row"><div><div class="t">Notify me when an answer is ready</div><div class="d">Only when epic AI isn't the window you're looking at.</div></div>${sw('swNotify', settings.notify)}</div>
    <div class="row"><div><div class="t">Start epic AI when I sign in to my computer</div></div>${sw('swLogin', login)}</div>
    <div class="row"><div><div class="t">Quick entry</div><div class="d">Press ${info.platform === 'darwin' ? '⌘⇧Space' : 'Ctrl+Shift+Space'} anywhere to ask without opening the app. In the box, the screen button adds a screenshot.</div></div></div>
    <div class="row"><div><div class="t">Help</div></div><div><button class="btn ghost" data-link="https://oeper.dev/feedback">Send feedback</button> <button class="btn ghost" data-link="https://oeper.dev/usage">Usage</button></div></div>
    <div class="actions"><button class="btn" data-close>Done</button></div>`);
  wireLinks(d.root);
  d.root.querySelector('#theme').value = settings.theme; d.root.querySelector('#screenMode').value = settings.screen;
  d.root.querySelector('#theme').addEventListener('change', e => { settings.theme = e.target.value; saveSettings(); applyTheme(); });
  d.root.querySelector('#screenMode').addEventListener('change', e => { settings.screen = e.target.value; saveSettings(); });
  const flip = (id, fn) => d.root.querySelector(id).addEventListener('click', e => { const on = !e.currentTarget.classList.contains('on'); e.currentTarget.classList.toggle('on', on); e.currentTarget.setAttribute('aria-checked', on); fn(on); });
  flip('#swNotify', on => { settings.notify = on; saveSettings(); if (on && Notification.permission === 'default') Notification.requestPermission(); });
  flip('#swLogin', on => D.setLogin(on));
}

// ── account state ──
acct.onUser(async u => {
  user = u; profile = null; selfContext = '';
  if (unsubChats) { unsubChats(); unsubChats = null; } if (unsubMemory) { unsubMemory(); unsubMemory = null; }
  memory = []; memProfile = ''; memLearn = true;
  const av = $('acctAvatar');
  if (!u) { $('acctName').textContent = 'Guest'; av.innerHTML = '<span class="ms">person</span>'; refreshUsage(); return; }
  $('acctName').textContent = u.displayName || 'Signed in';
  if (u.photoURL) { av.innerHTML = ''; const im = el('img'); im.src = u.photoURL; im.referrerPolicy = 'no-referrer'; av.appendChild(im); }
  unsubMemory = acct.watchMemory(m => { memory = m.facts; memProfile = m.profile; memLearn = m.learn; if (memoryListener) memoryListener(); });
  unsubChats = acct.watchChats(cloud => {
    const byId = new Map(chats.map(c => [c.id, c]));
    for (const c of cloud) { const e = byId.get(c.id); if (!e || (c.updatedAt || 0) > (e.updatedAt || 0)) byId.set(c.id, c); }
    const merged = [...byId.values()];
    const changed = JSON.stringify(merged) !== JSON.stringify(chats);
    if (!changed) return;
    chats = merged; if (!chats.some(c => c.id === curId) && chats.length) curId = chats[0].id;
    applyingCloud = true; save(); applyingCloud = false;
    if (!controller) renderChat(); renderList();
    acct.pushChats(chats);   // a new device ends up with the merged result on both sides
  });
  profile = await acct.profileOf(u);
  $('acctName').textContent = profile.name;
  selfContext = await acct.selfContextFor(u, profile);
  refreshUsage();
});

// ── from the native side: menu items and the quick-entry window ──
D.onMenu(name => {
  if (name === 'new-chat') newChat();
  else if (name === 'settings') openSettings();
  else if (name === 'sidebar') document.body.classList.toggle('side-closed');
  else if (name === 'search') { document.body.classList.remove('side-closed'); $('search').focus(); }
});
D.onQuick(async p => {
  if (controller) controller.abort();
  const n = makeChat(); chats.unshift(n); curId = n.id; save(); renderChat(); renderList();
  if (p.screenError) screenProblem(p.screenError);
  if (p.screen) pending.shot = p.screen;
  renderAttachments();
  $('input').value = p.text || ''; autoGrow();
  if (p.text || p.screen) send(); else $('input').focus();
});

// ── start ──
(async () => {
  info = (await D.info()) || info;
  applyTheme();
  if (!chats.length) { const c = makeChat(); chats.push(c); }
  if (!cur()) curId = chats[0].id;
  // the chat that was open last stays open; an empty one is reused for the next conversation
  renderChat(); renderList(); refreshUsage();
  if (settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  D.ready();
  $('input').focus();
})();
