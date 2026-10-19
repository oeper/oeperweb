// Floating "ask epic AI" button for every page that has the top bar. Only shown when the epic AI features switch is on (settings > epic AI),
// and never on the pages that already own that corner (messages, videos, feed, ai itself, the desktop sign-in hand-off, the one suite).
// Sending does not talk to the model here: it leaves a hand-off note in localStorage (`oe-ai-handoff`) and opens /ai, which starts a new chat with it.
const KEY = 'oe-ai-features', HANDOFF = 'oe-ai-handoff';
const SKIP = /^\/(messages|videos|feed|ai|app-auth|one|eosat|lds)(\.html|\/|$)/;
const MARK = '<svg viewBox="0 0 381 486" aria-hidden="true"><g fill="currentColor"><rect x="2" width="80" height="300" rx="40"/><rect x="297" width="80" height="300" rx="40"/></g><path d="M40 421C140 454.333 240 454.333 340 421" fill="none" stroke="currentColor" stroke-width="80" stroke-linecap="round"/></svg>';

const enabled = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
let root = null;

function pageText() {
  const sel = String(window.getSelection ? window.getSelection() : '').trim();
  if (sel.length > 20) return { text: sel.slice(0, 6000), what: 'selected text' };
  const main = (document.querySelector('main') || document.body).cloneNode(true);
  main.querySelectorAll('nav, header, footer, script, style, noscript, .oe-navbar, .oe-nav-backdrop, .efab, .material-symbols-rounded').forEach(n => n.remove());
  return { text: (main.textContent || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000), what: 'this page' };
}

function build() {
  if (root) return;
  if (!document.getElementById('efabStyle')) {
  const style = document.createElement('style'); style.id = 'efabStyle';
  style.textContent = `
    .efab{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:900;font-family:inherit}
    @media (max-width:820px){.efab{bottom:calc(86px + env(safe-area-inset-bottom))}}
    .efab-btn{display:flex;align-items:center;gap:8px;height:48px;padding:0 18px 0 14px;border:0;border-radius:24px;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;
      background:var(--md-sys-color-primary-container,#335);color:var(--md-sys-color-on-primary-container,#fff);box-shadow:0 3px 12px rgba(0,0,0,.3);
      -webkit-backdrop-filter:blur(var(--oe-glass-blur,0px));backdrop-filter:blur(var(--oe-glass-blur,0px))}
    .efab-btn svg{width:22px;height:22px}
    .efab-card{position:absolute;right:0;bottom:60px;width:min(340px,calc(100vw - 36px));box-sizing:border-box;padding:12px;border-radius:18px;display:none;gap:8px;
      background:var(--md-sys-color-surface-container-high,#2a2a2e);color:var(--md-sys-color-on-surface,#fff);box-shadow:0 8px 28px rgba(0,0,0,.4);
      border:1px solid var(--md-sys-color-outline-variant,rgba(255,255,255,.12));-webkit-backdrop-filter:blur(var(--oe-glass-blur,0px));backdrop-filter:blur(var(--oe-glass-blur,0px))}
    .efab.open .efab-card{display:grid}
    .efab-card textarea{width:100%;min-height:70px;resize:none;box-sizing:border-box;border-radius:12px;border:1px solid var(--md-sys-color-outline,#888);background:transparent;color:inherit;padding:9px 11px;font-size:14px;line-height:1.4;font-family:inherit}
    .efab-card label{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--md-sys-color-on-surface-variant,#bbb);cursor:pointer}
    .efab-row{display:flex;gap:8px;justify-content:flex-end}
    .efab-row button{border:0;border-radius:18px;height:36px;padding:0 16px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer}
    .efab-send{background:var(--md-sys-color-primary,#8ab4f8);color:var(--md-sys-color-on-primary,#000)}
    .efab-open{background:transparent;color:var(--md-sys-color-primary,#8ab4f8)}
    @media print{.efab{display:none}}
    @media (prefers-reduced-motion:no-preference){.efab-btn{transition:transform .15s}.efab-btn:hover{transform:translateY(-2px)}}`;
  document.head.append(style);
  }
  root = document.createElement('div');
  root.className = 'efab';
  root.innerHTML = `<div class="efab-card" role="dialog" aria-label="Ask epic AI">
      <textarea id="efabQ" maxlength="1000" placeholder="Ask epic AI…"></textarea>
      <label><input type="checkbox" id="efabCtx"> include <span id="efabWhat">this page</span></label>
      <div class="efab-row"><button type="button" class="efab-open">open epic AI</button><button type="button" class="efab-send">ask</button></div>
    </div>
    <button type="button" class="efab-btn" aria-label="Ask epic AI">${MARK}<span>epic AI</span></button>`;
  document.body.append(root);
  const q = root.querySelector('#efabQ'), ctx = root.querySelector('#efabCtx');
  const go = withQuestion => {
    let text = withQuestion ? q.value.trim() : '';
    if (withQuestion && !text) { q.focus(); return; }
    if (text && ctx.checked) {
      const p = pageText();
      if (p.text) text += '\n\n<<one:' + (document.title || location.pathname).replace(/[<>\n]/g, ' ').slice(0, 80) + '>>\n' + p.text + '\n<</one>>';
    }
    try { if (text) localStorage.setItem(HANDOFF, JSON.stringify({ text, t: Date.now() })); } catch { /* storage blocked: /ai just opens empty */ }
    location.href = '/ai';
  };
  root.querySelector('.efab-btn').addEventListener('click', () => {
    root.classList.toggle('open');
    if (root.classList.contains('open')) {
      const p = pageText();
      root.querySelector('#efabWhat').textContent = p.what;
      ctx.checked = p.what === 'selected text';
      q.focus();
    }
  });
  root.querySelector('.efab-send').addEventListener('click', () => go(true));
  root.querySelector('.efab-open').addEventListener('click', () => go(false));
  q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(true); } if (e.key === 'Escape') root.classList.remove('open'); });
}

function sync() {
  if (SKIP.test(location.pathname) || !enabled()) { if (root) { root.remove(); root = null; } return; }
  build();
}

export function mountEpicFab() {
  const run = () => { sync(); window.addEventListener('oe-ai-features', sync); window.addEventListener('storage', e => { if (e.key === KEY) sync(); }); };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
}
