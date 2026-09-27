// Epic AI integrations across the site — one switch, OFF until someone turns it
// on (settings.html › "epic AI"). Everything that lets the AI touch other parts
// of the site (the one suite's AI assistant, attaching/saving one documents on
// ai.html, ...) checks aiFeaturesEnabled() first and does nothing otherwise.
//
// The switch is a per-browser preference (localStorage), like the theme.
//
// Also home to the small helpers those integrations share, so ai.html and the
// one suite's assistant read and write one documents the same way.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped on every
// `from './shared/ai-features.js?v=N'` import across the site (grep for it).

export const AI_ENDPOINT = 'https://oeper-ai.oeper.workers.dev';
const KEY = 'oe-ai-features';

export function aiFeaturesEnabled() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function setAiFeaturesEnabled(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch {}
  window.dispatchEvent(new CustomEvent('oe-ai-features', { detail: !!on }));
}
// Fires when the switch changes in THIS tab (event above) or another one (storage).
export function onAiFeaturesChange(cb) {
  window.addEventListener('oe-ai-features', () => cb(aiFeaturesEnabled()));
  window.addEventListener('storage', e => { if (e.key === KEY) cb(aiFeaturesEnabled()); });
}

// ── Talking to the model without a chat UI (the one suite's assistant) ──
// Streams /api/chat and returns the final answer text. Reasoning goes through
// its own delta field (ignored here); any inline <think> block is stripped.
export async function askAI(messages, opts) {
  const res = await fetch(AI_ENDPOINT + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal: opts && opts.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Server error (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const delta = (JSON.parse(payload).choices || [{}])[0].delta || {};
        if (delta.content) {
          text += delta.content;
          if (opts && opts.onText) opts.onText(stripThinking(text));
        }
      } catch {}
    }
  }
  return stripThinking(text).trim();
}
export function stripThinking(s) {
  return String(s).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*?<\/think>/, '').replace(/<think>[\s\S]*$/, '').trimStart();
}

// ── one documents (oneWord) as stored by the one suite in this origin's localStorage ──
// Same shape oneword/js/doc.js uses (W.newDoc + ow-lib bookkeeping), so a
// document made here opens in oneWord and syncs to the account like any other.
const uid = () => Math.random().toString(36).slice(2, 9);
export function listOneDocs() {
  let lib;
  try { lib = JSON.parse(localStorage.getItem('ow-lib') || 'null'); } catch { lib = null; }
  const docs = (lib && lib.docs) || {};
  return Object.entries(docs)
    .filter(([id]) => localStorage.getItem('ow-doc-' + id) !== null)
    .map(([id, m]) => ({ id, title: m.title || 'Untitled', updated: m.updated || 0, words: m.words || 0 }))
    .sort((a, b) => b.updated - a.updated);
}
export function readOneDocText(id) {
  let d;
  try { d = JSON.parse(localStorage.getItem('ow-doc-' + id) || 'null'); } catch { d = null; }
  if (!d) return null;
  return { title: d.title || 'Untitled', text: htmlToText(d.html || '') };
}
export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  doc.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote,pre').forEach(b => b.append('\n'));
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
// Only structural/inline tags survive; everything else (scripts, styles, event
// handlers, the chat UI's wrappers) is dropped, keeping the text.
const KEEP = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'CODE', 'PRE', 'BLOCKQUOTE', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'HR']);
export function sanitizeForOne(html) {
  const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      if (['SCRIPT', 'STYLE', 'BUTTON', 'SVG', 'IFRAME', 'OBJECT'].includes(child.tagName) || child.classList.contains('material-symbols-rounded')) { child.remove(); continue; }
      walk(child);
      if (!KEEP.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
      for (const a of [...child.attributes]) {
        if (child.tagName === 'A' && a.name === 'href' && /^https?:/i.test(a.value)) continue;
        child.removeAttribute(a.name);
      }
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener'); }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}
export function createWordDoc(title, html) {
  const id = uid();
  const now = Date.now();
  const d = {
    id, title: String(title || 'Document').slice(0, 120), html: html || '<p><br></p>', updated: now,
    meta: { author: 'epic AI', subject: '', tags: '', created: now },
    layout: { size: 'letter', orient: 'portrait', margin: 'normal', m: [96, 96, 96, 96], cols: 1, colRule: false, hyph: false },
    design: { set: 'office', colors: 'office', spacing: 'default', pageColor: '', watermark: '', border: '' },
    hf: { header: '', footer: '', first: false }, comments: {}, sources: [], versions: [], readonly: false, final: false, track: false,
  };
  localStorage.setItem('ow-doc-' + id, JSON.stringify(d));
  let lib;
  try { lib = JSON.parse(localStorage.getItem('ow-lib') || 'null'); } catch { lib = null; }
  lib = lib || { current: null, docs: {} };
  lib.docs = lib.docs || {};
  lib.docs[id] = { title: d.title, updated: now, words: (htmlToText(d.html).match(/\S+/g) || []).length };
  localStorage.setItem('ow-lib', JSON.stringify(lib));
  return id;
}
export const oneDocUrl = id => '/one#open=word:' + encodeURIComponent(id);
