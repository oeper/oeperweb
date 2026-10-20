// epic AI side panel: the chat, the "Do" agent log, and settings. The work itself happens in background.js; this only talks to it over a port.
const $ = id => document.getElementById(id);
const log = $('log'), input = $('input');
let port = null, mode = 'act', busy = false, state = { user: null, bridge: {}, blocked: [] };
let chat = [];            // Ask mode history [{role, content}]
let liveEl = null, statusEl = null, askId = 0;

function connect() {
  port = chrome.runtime.connect({ name: 'panel' });
  port.onMessage.addListener(onMsg);
  port.onDisconnect.addListener(() => { setTimeout(connect, 500); });
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// a small, safe markdown subset (everything is escaped first; only http(s) links)
function md(src) {
  const codeBlocks = [];
  let s = esc(src).replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => { codeBlocks.push(c); return '\u0000' + (codeBlocks.length - 1) + '\u0000'; });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = []; let list = null;
  for (const line of s.split('\n')) {
    const b = /^\s*[-*]\s+(.*)/.exec(line), n = /^\s*\d+[.)]\s+(.*)/.exec(line);
    const want = b ? 'ul' : n ? 'ol' : null;
    if (list && list !== want) { out.push(`</${list}>`); list = null; }
    if (want && !list) { out.push(`<${want}>`); list = want; }
    if (want) out.push(`<li>${(b || n)[1]}</li>`);
    else if (/^#{1,4}\s+/.test(line)) out.push(`<p><strong>${line.replace(/^#+\s+/, '')}</strong></p>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => `<pre>${codeBlocks[i].replace(/\n$/, '')}</pre>`);
}

function add(cls, html, text) {
  clearEmpty();
  const d = document.createElement('div');
  d.className = cls;
  if (text !== undefined) d.textContent = text; else d.innerHTML = html;
  log.append(d); scroll();
  return d;
}
function scroll() { log.scrollTop = log.scrollHeight; }
function clearEmpty() { const e = log.querySelector('.empty'); if (e) e.remove(); }

function showEmpty() {
  log.innerHTML = '';
  const e = document.createElement('div'); e.className = 'empty';
  e.innerHTML = mode === 'act'
    ? '<h2>What should I do?</h2><div>I can click, type and read pages for you. I ask before anything risky.</div><div class="chips"></div>'
    : '<h2>Ask about this page</h2><div>I read the page you are on and answer.</div><div class="chips"></div>';
  const ex = mode === 'act' ? ['Find the cheapest flight to Tokyo next month', 'Summarize the top story on Hacker News', 'Open my unread emails and list who sent them'] : ['Summarize this page', 'What are the key points?', 'Explain this in simple words'];
  for (const t of ex) { const b = document.createElement('button'); b.textContent = t; b.onclick = () => { input.value = t; send(); }; e.querySelector('.chips').append(b); }
  log.append(e);
}

function setBusy(b) {
  busy = b;
  $('send').hidden = b; $('stop').hidden = !b;
  if (!b && statusEl) { statusEl.remove(); statusEl = null; }
}
function setStatus(text) {
  if (!statusEl) { statusEl = document.createElement('div'); statusEl.className = 'status'; }
  statusEl.textContent = text; log.append(statusEl); scroll();
}

function onMsg(m) {
  switch (m.type) {
    case 'state': state = m; renderSettings(); setBusy(!!m.running); break;
    case 'status': setStatus(m.text); break;
    case 'step': { if (statusEl) statusEl.remove(); const d = add('step', ''); d.innerHTML = `<span>${esc(m.text)}${m.thought ? ` <small>— ${esc(m.thought)}</small>` : ''}</span>`; setStatus('Working…'); break; }
    case 'delta': { if (statusEl) { statusEl.remove(); } if (!liveEl) liveEl = add('msg ai', ''); liveEl.innerHTML = md(m.text); scroll(); break; }
    case 'answer': if (liveEl) liveEl.innerHTML = md(m.text); chat.push({ role: 'assistant', content: m.text }); liveEl = null; break;
    case 'final': if (statusEl) statusEl.remove(); add('msg ai', md(m.text)); break;
    case 'error': add('err', '', m.text); break;
    case 'finished': liveEl = null; setBusy(false); break;
    case 'ask': renderAsk(m); break;
    case 'usage': renderUsage(m.usage); break;
  }
}

function renderAsk(m) {
  if (statusEl) statusEl.remove();
  const c = add('card ask', '');
  const p = document.createElement('div'); p.textContent = m.text; c.append(p);
  const row = document.createElement('div'); row.className = 'row';
  const done = v => { port.postMessage({ type: 'answer', id: m.id, value: v }); c.querySelectorAll('button,input').forEach(e => e.disabled = true); setStatus('Working…'); };
  if (m.kind === 'confirm') {
    const a = document.createElement('button'); a.className = 'tonal'; a.textContent = 'Allow'; a.onclick = () => done('allow');
    const d = document.createElement('button'); d.className = 'tonal'; d.textContent = 'Decline'; d.onclick = () => done('decline');
    row.append(a, d);
  } else {
    const i = document.createElement('input'); i.type = 'text'; i.placeholder = 'Your answer'; i.style.cssText = 'flex:1;border:1px solid var(--outline);border-radius:10px;padding:6px 8px';
    const b = document.createElement('button'); b.className = 'tonal'; b.textContent = 'Send';
    b.onclick = () => done(i.value || ''); i.onkeydown = e => { if (e.key === 'Enter') b.click(); };
    row.append(i, b); setTimeout(() => i.focus(), 0);
  }
  c.append(row); scroll();
}

function send() {
  const text = input.value.trim();
  if (!text || busy) return;
  input.value = ''; autosize();
  add('msg user', '', text);
  setBusy(true); setStatus(mode === 'act' ? 'Starting…' : 'Reading the page…');
  if (mode === 'act') port.postMessage({ type: 'run', goal: text });
  else { askId++; port.postMessage({ type: 'ask', id: askId, text, withPage: $('withPage').checked, history: chat }); chat.push({ role: 'user', content: text }); }
}
function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight) + 'px'; }
input.addEventListener('input', autosize);
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
$('send').onclick = send;
$('stop').onclick = () => port.postMessage({ type: 'stop' });
$('newchat').onclick = () => { if (busy) return; chat = []; showEmpty(); };

document.querySelectorAll('#mode button').forEach(b => b.onclick = () => {
  if (busy) return;
  mode = b.dataset.mode;
  document.querySelectorAll('#mode button').forEach(x => x.classList.toggle('on', x === b));
  $('pagectl').hidden = mode !== 'ask';
  input.placeholder = mode === 'act' ? 'What should I do in your browser?' : 'Ask about this page…';
  chat = []; showEmpty();
});

// settings
$('gear').onclick = () => { $('settings').hidden = !$('settings').hidden; if (!$('settings').hidden) port.postMessage({ type: 'usage' }); };
$('closeSettings').onclick = () => { $('settings').hidden = true; };
function renderSettings() {
  const a = $('acct'); a.innerHTML = '';
  if (state.user) {
    if (state.user.photo) { const i = document.createElement('img'); i.src = state.user.photo; i.referrerPolicy = 'no-referrer'; a.append(i); }
    const t = document.createElement('div'); t.style.flex = '1'; t.textContent = state.user.name || state.user.email; a.append(t);
    const b = document.createElement('button'); b.className = 'tonal'; b.textContent = 'Sign out'; b.onclick = () => port.postMessage({ type: 'signout' }); a.append(b);
  } else {
    const t = document.createElement('div'); t.style.flex = '1'; t.className = 'muted'; t.textContent = 'Signed out: guests get a very small daily allowance.'; a.append(t);
    const b = document.createElement('button'); b.className = 'tonal'; b.textContent = 'Sign in'; b.onclick = () => port.postMessage({ type: 'signin' }); a.append(b);
  }
  if (document.activeElement !== $('blocked')) $('blocked').value = (state.blocked || []).join('\n');
  $('bridgeOn').checked = !!(state.bridge && state.bridge.on);
  if (document.activeElement !== $('bridgeToken')) $('bridgeToken').value = (state.bridge && state.bridge.token) || '';
  $('bridgeState').textContent = state.bridge && state.bridge.on ? (state.bridge.connected ? 'Connected to the bridge on this computer.' : 'Waiting for the bridge (run mcp-bridge/server.mjs, see the README).') : 'Off.';
}
function renderUsage(u) {
  $('usage').textContent = u && u.limit ? `Today: ${Math.round((u.used || 0) / 1000)}k of ${u.limit >= 1e9 ? 'unlimited' : Math.round(u.limit / 1000) + 'k'} tokens (${u.plan || 'free'}).` : '';
}
$('saveBlocked').onclick = () => port.postMessage({ type: 'setBlocked', list: $('blocked').value.split('\n') });
const saveBridge = () => port.postMessage({ type: 'setBridge', on: $('bridgeOn').checked, token: $('bridgeToken').value });
$('saveBridge').onclick = saveBridge;
$('bridgeOn').onchange = saveBridge;

connect();
showEmpty();
