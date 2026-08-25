// Shared fenced ```lang code block rendering: a lightweight, language-
// agnostic syntax highlighter (no external library — same spirit as the
// chess engine, a hand-rolled approximation rather than a real per-
// language grammar) plus copy-to-clipboard. Used anywhere a page renders
// markdown that can contain fenced code blocks (currently ai.html's chat
// and feed.html's post bodies).
//
// Whenever this file's exports or CSS change, bump the `?v=N` on every
// `from './shared/code-block.js?v=N'` import across the site (grep for it).

function escHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

const HL_KEYWORDS = new Set([
  'function','return','if','else','elif','elseif','for','while','do','until','repeat','switch','case',
  'default','break','continue','class','extends','implements','interface','import','from','export',
  'const','let','var','new','delete','typeof','instanceof','in','of','try','catch','finally','throw',
  'async','await','def','lambda','pass','yield','with','as','global','nonlocal','raise','except',
  'public','private','protected','static','void','int','float','double','char','bool','string','local',
  'true','false','null','none','nil','undefined','self','this','super','struct','enum','namespace',
  'package','module','fn','mut','impl','trait','match','use','pub','func','defer','go','chan','select',
  'and','or','not','end','then','type','goto',
]);
// The Lua block-comment alternative (--[[...]]) has to come before the
// plain line-comment one (--[^\n]*) — alternation tries left-to-right at
// each position, and the line-comment branch would otherwise match just
// the opening "--[[" and stop at the first newline, leaving the rest of
// a multi-line block to get tokenized as if it were code.
const HL_TOKEN_RE = /(\/\/[^\n]*|--\[\[[\s\S]*?\]\]|--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)(\s*\()?/g;

// A block comment (C-style /* */ or Lua's --[[ ]]) whose text opens with
// a callout keyword reads as a "note" left in the code for whoever runs
// it — e.g. a disclaimer before a loadstring — rather than an ordinary
// inline comment, so it renders as its own callout box instead of plain
// italic comment text. Single-line // — # comments never qualify, since
// a one-liner isn't really the "note before the code" pattern this is
// for.
const NOTE_TYPES = [
  { type: 'danger', icon: 'report', re: /^\s*(danger|caution)\b/i },
  { type: 'warning', icon: 'warning', re: /^\s*warning\b/i },
  { type: 'tip', icon: 'lightbulb', re: /^\s*tip\b/i },
  { type: 'info', icon: 'info', re: /^\s*(note|info)\b/i },
];
function noteTypeFor(commentText) {
  const isBlock = /^\/\*/.test(commentText) || /^--\[\[/.test(commentText);
  if (!isBlock) return null;
  const inner = commentText.replace(/^\/\*|\*\/$/g, '').replace(/^--\[\[|\]\]$/g, '');
  for (const nt of NOTE_TYPES) {
    if (nt.re.test(inner)) return nt;
  }
  return null;
}

// Comments/strings first (greedy alternation, tried left-to-right at each
// position), then numbers, then identifiers — checked against the shared
// keyword set, or flagged as a "function" when immediately followed by
// an opening paren.
export function highlightCode(code) {
  let out = '', last = 0, m;
  HL_TOKEN_RE.lastIndex = 0;
  while ((m = HL_TOKEN_RE.exec(code))) {
    out += escHtml(code.slice(last, m.index));
    if (m[1]) {
      const isComment = /^(\/\/|--|#|\/\*)/.test(m[1]);
      const note = isComment ? noteTypeFor(m[1]) : null;
      if (note) {
        out += `<span class="tok-note tok-note-${note.type}"><span class="material-symbols-rounded tok-note-icon">${note.icon}</span>${escHtml(m[1])}</span>`;
      } else {
        out += `<span class="${isComment ? 'tok-comment' : 'tok-string'}">${escHtml(m[1])}</span>`;
      }
    } else if (m[2]) {
      out += `<span class="tok-number">${escHtml(m[2])}</span>`;
    } else if (m[3]) {
      const cls = HL_KEYWORDS.has(m[3]) ? 'tok-keyword' : (m[4] ? 'tok-function' : null);
      out += cls ? `<span class="${cls}">${escHtml(m[3])}</span>` : escHtml(m[3]);
      if (m[4]) out += escHtml(m[4]);
    }
    last = HL_TOKEN_RE.lastIndex;
  }
  out += escHtml(code.slice(last));
  return out;
}

export function codeBlockHtml(lang, code) {
  return `<div class="code-block-wrap">
      <div class="code-block-header">
        <span class="code-block-lang">${escHtml(lang || 'text')}</span>
        <button type="button" class="code-block-copy-btn" data-copy-code><span class="material-symbols-rounded">content_copy</span>copy</button>
      </div>
      <pre class="code-block"><code>${highlightCode(code)}</code></pre>
    </div>`;
}

// navigator.clipboard.writeText() can silently reject (most commonly
// "Document is not focused"), so this falls back to the older
// execCommand('copy') — synchronous, fired straight off the same click,
// no focus requirement — and reports real success/failure either way.
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

// Delegated click handler for any [data-copy-code] button under
// `container` — safe to call once per container even if its content is
// fully replaced/re-rendered later, since it's delegated rather than
// attached per-button.
export function wireCodeBlockCopy(container) {
  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-copy-code]');
    if (!btn) return;
    const wrap = btn.closest('.code-block-wrap');
    if (!wrap) return;
    const code = wrap.querySelector('code').textContent;
    const original = btn.innerHTML;
    copyToClipboard(code).then(ok => {
      btn.innerHTML = ok
        ? '<span class="material-symbols-rounded">check</span>copied'
        : '<span class="material-symbols-rounded">error</span>couldn\'t copy';
      setTimeout(() => { btn.innerHTML = original; }, 1500);
    });
  });
}

let stylesInjected = false;
// A semi-transparent black overlay (rather than an absolute color) so
// this reads correctly whether it's sitting on a message bubble, a post
// card, or any other background it ends up used against.
export function injectCodeBlockStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .code-block-wrap { background: rgba(0,0,0,0.32); border-radius: 8px; margin: 8px 0; overflow: hidden; }
    .code-block-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 6px 8px 6px 14px; background: rgba(0,0,0,0.22); font-size: 12px;
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
    }
    .code-block-lang { opacity: 0.6; text-transform: lowercase; }
    .code-block-copy-btn {
      display: inline-flex; align-items: center; gap: 4px; border: none; background: none; color: inherit;
      opacity: 0.7; cursor: pointer; font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 6px;
    }
    .code-block-copy-btn:hover { opacity: 1; background: rgba(127,127,127,0.2); }
    .code-block-copy-btn .material-symbols-rounded { font-size: 15px; }
    pre.code-block {
      padding: 12px 14px; margin: 0; overflow-x: auto; font-size: 13px; line-height: 1.5;
      font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
      tab-size: 2;
    }
    pre.code-block code { background: none; padding: 0; }
    pre.code-block .tok-keyword { color: #c586c0; }
    pre.code-block .tok-string { color: #ce9178; }
    pre.code-block .tok-comment { color: #6a9955; font-style: italic; }
    pre.code-block .tok-number { color: #b5cea8; }
    pre.code-block .tok-function { color: #dcdcaa; }
    pre.code-block .tok-note {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 2px 0 8px; padding: 8px 12px; border-radius: 6px;
      border-left: 3px solid #7f848e; background: rgba(255,255,255,0.05);
      font-style: normal; white-space: pre-wrap; color: #abb2bf;
    }
    pre.code-block .tok-note-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    pre.code-block .tok-note-warning { border-left-color: #e5c07b; background: rgba(229,192,123,0.1); color: #e5c07b; }
    pre.code-block .tok-note-danger { border-left-color: #e06c75; background: rgba(224,108,117,0.1); color: #e06c75; }
    pre.code-block .tok-note-info { border-left-color: #61afef; background: rgba(97,175,239,0.1); color: #61afef; }
    pre.code-block .tok-note-tip { border-left-color: #98c379; background: rgba(152,195,121,0.1); color: #98c379; }
  `;
  document.head.appendChild(style);
}
