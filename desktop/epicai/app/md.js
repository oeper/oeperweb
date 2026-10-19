// Markdown + reasoning splitting for epic AI replies: copied from ai.html (lines "escHtml" … "splitThinking"), so the desktop app renders
// answers exactly like the website. If the parser changes there, copy it again. KaTeX is loaded as a global by index.html.
import { codeBlockHtml } from './code-block.js';
import { diagramPlaceholder, isDiagramKind } from './ai-diagrams.js';

export function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

const EMOJI_SHORTCODES = {
  smile: '😄', laugh: '😂', wink: '😉', heart: '❤️', fire: '🔥', thumbsup: '👍',
  thumbsdown: '👎', clap: '👏', wave: '👋', thinking: '🤔', eyes: '👀', tada: '🎉',
  rocket: '🚀', check: '✅', x: '❌', star: '⭐', warning: '⚠️', 100: '💯',
};
function expandShortcodes(text) {
  return text.replace(/:([a-z0-9_+-]+):/g, (m, name) => EMOJI_SHORTCODES[name] || m);
}

// Renders a LaTeX expression via KaTeX (loaded in <head>, see the comment
// there) into ready-to-embed HTML. Falls back to showing the raw $...$/
// $$...$$ source, escaped, rather than throwing or silently eating the
// text — both if KaTeX hasn't loaded yet for some reason and if the LaTeX
// itself is malformed (throwOnError: false already covers the latter, but
// katex.renderToString can still throw for a few edge cases it doesn't
// consider "parse errors").
const mathCache = new Map(); // a streamed answer is re-rendered over and over, so each expression is typeset once
function renderMathOrFallback(expr, display) {
  const raw = display ? `$$${expr}$$` : `$${expr}$`;
  if (typeof katex === 'undefined') return escHtml(raw);
  const key = (display ? 'd' : 'i') + expr;
  if (mathCache.has(key)) return mathCache.get(key);
  let html;
  try {
    html = katex.renderToString(expr.trim(), { throwOnError: false, displayMode: display, output: 'htmlAndMathml', maxSize: 20, maxExpand: 500 });
  } catch {
    html = escHtml(raw);
  }
  if (mathCache.size > 300) mathCache.clear();
  mathCache.set(key, html);
  return html;
}

// Inline formatting: bold/italic (incl. combined ***bold italic***),
// strikethrough, images, the [[Button]](url) styled-link syntax, links,
// and bare autolinks. Applied to already-HTML-escaped text (entities and
// stashed placeholders only) coming out of a single block's content, so
// none of this ever sees raw < > & from the model's own output.
function parseInline(text) {
  // a single enormous line (30,000 "[" for example) makes every emphasis and link pattern rescan the rest of the line: for those only the cheap rules run
  if (text.length > 8000) return text.replace(/(?<!["'>])(https?:\/\/[^\s<]{1,2000}[^\s<.,:;!?'")\]])/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  return text
    .replace(/&lt;(https?:\/\/[^\s<>&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)__(.+?)__(?!_)/g, '<strong>$1</strong>')
    .replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img class="md-img" src="$2" alt="$1" loading="lazy">')
    .replace(/\[\[([^\]]+)\]\]\((https?:\/\/[^)]+)\)/g, '<a class="md-btn" href="$2" target="_blank" rel="noopener"><span class="material-symbols-rounded">arrow_forward</span>$1</a>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(?<!["'>])(https?:\/\/[^\s<]+[^\s<.,:;!?'")\]])/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

// Groups consecutive '- '/'* '/'+ ' or '1. ' lines (tracking indentation
// depth in units of 2 spaces) into a real, possibly-nested <ul>/<ol> tree.
// '- [ ] '/'- [x] ' items render as disabled checkboxes instead of bullets.
// Returns null if `lines` isn't actually a list so the block parser can
// fall through to its other block types.
function parseListBlock(lines) {
  const itemRe = /^([ \t]*)(?:([-*+])|(\d+)[.)])[ \t]+(.*)$/;
  if (!itemRe.test(lines[0])) return null;
  let i = 0;
  function parseAt(indentLevel) {
    const items = [];
    let ordered = null, start = 1;
    while (i < lines.length) {
      const m = lines[i].match(itemRe);
      if (!m) break;
      const indent = m[1].replace(/\t/g, '  ').length;
      if (indent !== indentLevel) break; // shallower: belongs to caller. deeper: consumed by the recursive call below, never seen here.
      if (ordered === null) { ordered = m[3] !== undefined; if (ordered) start = Math.max(0, parseInt(m[3], 10) || 1); }
      else if ((m[3] !== undefined) !== ordered) break; // bullets turned into numbers (or back): that is a new list
      i++;
      let content = m[4];
      let checkbox = '';
      const task = content.match(/^\[( |x|X)\][ \t]+(.*)$/);
      if (task) {
        checkbox = `<input type="checkbox" class="md-task-checkbox" disabled ${task[1] !== ' ' ? 'checked' : ''}> `;
        content = task[2];
      }
      let sub = '';
      if (i < lines.length) {
        const nextM = lines[i].match(itemRe);
        const nextIndent = nextM ? nextM[1].replace(/\t/g, '  ').length : -1;
        if (nextM && nextIndent > indent) sub = parseAt(nextIndent);
      }
      items.push(`<li>${checkbox}${parseInline(content)}${sub}</li>`);
    }
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${items.join('')}</${tag}>`;
  }
  let html = '';
  while (i < lines.length) {
    const before = i, m = lines[i].match(itemRe);
    html += parseAt(m ? m[1].replace(/\t/g, '  ').length : 0);
    if (i === before) break;
  }
  return html;
}

// Splits already-placeholder-stashed, HTML-escaped text into blocks
// (headings, horizontal rules, blockquotes, lists, tables, paragraphs) and
// runs parseInline() over each block's own text. This is a real line-based
// block parser rather than one flat regex chain — needed once lists can
// nest and blockquotes can span multiple lines, since those don't compose
// cleanly as independent global replaces.
function parseBlocks(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Stashed placeholder (code block / math block) sitting alone on its
    // own line — emit as-is, not wrapped in a paragraph.
    if (/^\u0000\d+\u0000$/.test(line.trim())) { out.push(line.trim()); i++; continue; }

    const heading = line.match(/^(#{1,6})[ \t]+(.+)$/);
    if (heading) {
      out.push(`<h${heading[1].length}>${parseInline(heading[2])}</h${heading[1].length}>`);
      i++; continue;
    }

    if (/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) {
      out.push('<hr>'); i++; continue;
    }

    // '>' shows up here as '&gt;' — this text has already been through
    // escHtml() by the time parseBlocks sees it (has to be, so raw prose
    // is never unescaped HTML), so every block-syntax check needs to
    // match the escaped form. '#', '-', '*', '+', '|', digits and '.'
    // aren't touched by escHtml, so only this one needs it.
    if (/^[ \t]*&gt;[ \t]?/.test(line)) {
      // A non-quote line is allowed to continue the quote as long as it's
      // non-blank and we're already inside one ("lazy continuation") —
      // a blank line always ends it.
      const quoteLines = [];
      while (i < lines.length && (/^[ \t]*&gt;[ \t]?/.test(lines[i]) || (lines[i].trim() && quoteLines.length))) {
        quoteLines.push(lines[i].replace(/^[ \t]*&gt;[ \t]?/, ''));
        i++;
      }
      out.push(`<blockquote>${parseBlocks(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // only lines that start with "|" can be a table, so only those are joined (joining the whole rest of the reply for every line made long answers quadratic)
    let tj = i; while (tj < lines.length && lines[tj].charAt(0) === '|') tj++;
    const tableMatch = line.charAt(0) !== '|' ? null : lines.slice(i, tj + 1).join('\n').match(/^(\|.+\|)\n(\|[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?)\n((?:\|.*\|\n?)*)/);
    if (tableMatch && tableMatch.index === 0) {
      const [full, headerLine, , bodyLines] = tableMatch;
      const splitRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const headers = splitRow(headerLine);
      const rows = bodyLines.trim().split('\n').filter(Boolean).map(splitRow);
      const thead = `<tr>${headers.map(h => `<th>${parseInline(h)}</th>`).join('')}</tr>`;
      const tbody = rows.map(r => `<tr>${r.map(c => `<td>${parseInline(c)}</td>`).join('')}</tr>`).join('');
      out.push(`<table class="md-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`);
      i += full.split('\n').length;
      continue;
    }

    if (/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/.test(line)) {
      // Only actual "- "/"1. " item lines are collected here — a plain
      // indented continuation line wouldn't match parseListBlock's itemRe
      // and would otherwise get silently dropped rather than rendered, so
      // it's better left for the next paragraph to pick up.
      const listLines = [], itemTest = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/;
      while (i < lines.length) {
        if (itemTest.test(lines[i])) { listLines.push(lines[i]); i++; continue; }
        // A "loose" list (blank line between items, which models do all the time) stays one list so numbering does not restart at 1.
        let j = i; while (j < lines.length && !lines[j].trim()) j++;
        if (j > i && j < lines.length && listLines.length && itemTest.test(lines[j])) { i = j; continue; }
        break;
      }
      out.push(parseListBlock(listLines));
      continue;
    }

    // Paragraph: a run of plain, non-blank lines. Single \n between them
    // becomes a soft <br> (this block output goes through .answer-content,
    // which is white-space: normal — unlike raw chat bubbles, real block
    // HTML here means bare newlines would otherwise just collapse away).
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^\u0000\d+\u0000$/.test(lines[i].trim())
      && !/^(#{1,6})[ \t]+/.test(lines[i]) && !/^[ \t]*&gt;[ \t]?/.test(lines[i])
      && !/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/.test(lines[i]) && !/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(lines[i])) {
      paraLines.push(lines[i]); i++;
    }
    if (paraLines.length) out.push(`<p>${parseInline(paraLines.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('');
}

// Markdown for assistant replies — the full common set: headings, bold/
// italic/bold-italic, strikethrough, blockquotes, ordered/unordered/task
// lists (nested), tables, horizontal rules, images, links, the
// [[Button]](url) styled-link syntax, emoji shortcodes, fenced ``` code
// blocks, and $...$/$$...$$ LaTeX math via KaTeX. Code blocks and math are
// pulled out into stashed placeholders before anything else runs, so
// nothing downstream (escaping, emphasis, list/table parsing) ever
// touches their contents — LaTeX especially is full of _, *, {, } that
// would otherwise get mangled by the emphasis passes.
export function parseAiMarkdown(text) {
  const stash = [];
  const hold = html => { stash.push(html); return `\u0000${stash.length - 1}\u0000`; };

  let src = String(text || '').replace(/\r\n/g, '\n');

  src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => hold(isDiagramKind(lang) && code.trim() ? diagramPlaceholder(lang.toLowerCase(), code.replace(/\n$/, '')) : codeBlockHtml(lang, code.replace(/\n$/, ''))));

  // $ must hug its content (no space right inside) so ordinary prose like
  // "$5 and $10" is never misread as the start of a math span.
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (m, expr) => hold(`<div class="math-block">${renderMathOrFallback(expr, true)}</div>`));
  // the two alternatives cannot match the same character (a backslash pair, or anything that is not $, \ or a newline), so a stray run of $ and \ cannot backtrack for ever
  src = src.replace(/\$(?!\s)((?:\\[^\n]|[^$\\\n])+?)(?<!\s)\$/g, (m, expr) => hold(`<span class="math-inline">${renderMathOrFallback(expr, false)}</span>`));

  src = src.replace(/`([^`\n]+)`/g, (m, code) => hold(`<code>${escHtml(code)}</code>`));

  src = expandShortcodes(escHtml(src));

  const html = parseBlocks(src);
  return html.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[Number(i)]);
}

// The small local model occasionally repeats its entire answer verbatim
// right after finishing it (e.g. "Hello! ...oeper.dev?\nHello! ...oeper.dev?")
// instead of stopping. Collapse exact, consecutive duplicate lines in the
// final answer rather than showing/saving the repeat — only touches lines
// that are identical to the one directly before them, so it can't affect
// legitimately repeated words/phrases within otherwise-different lines.
function dedupeRepeatedLines(text) {
  const lines = text.split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && out.length && out[out.length - 1].trim() === t) continue;
    out.push(line);
  }
  return out.join('\n');
}

// Splits a raw assistant reply into "thinking" (reasoning-model output,
// either a separate reasoning_content stream field or an inline <think>
// tag) and the real answer, so the UI can show reasoning as a collapsible
// "Show thinking" block instead of dumping it inline with the answer.
export function splitThinking(reasoningBuf, contentBuf, done) {
  if (reasoningBuf) {
    // Reasoning is already covered by the native reasoning_content channel
    // above — but the model occasionally also writes a redundant
    // <think>...</think> block as plain text inside content on top of
    // that (see the system-prompt comment for why). Strip it out entirely
    // rather than let raw reasoning text leak into the visible answer.
    const openIdx = contentBuf.indexOf('<think>');
    if (openIdx === -1) {
      return { thinking: reasoningBuf, answer: contentBuf, stillThinking: contentBuf.length === 0 };
    }
    const closeIdx = contentBuf.indexOf('</think>', openIdx);
    if (closeIdx === -1) {
      // Still mid-block — hide it rather than show a partial raw dump.
      return { thinking: reasoningBuf, answer: contentBuf.slice(0, openIdx), stillThinking: true };
    }
    const answer = (contentBuf.slice(0, openIdx) + contentBuf.slice(closeIdx + 8)).trim();
    return { thinking: reasoningBuf, answer, stillThinking: answer.length === 0 };
  }
  const openIdx = contentBuf.indexOf('<think>');
  if (openIdx === -1) {
    const answer = contentBuf.replace(/<\/?think>/g, '').trim();
    return { thinking: '', answer: done ? dedupeRepeatedLines(answer) : answer, stillThinking: false };
  }
  const closeIdx = contentBuf.indexOf('</think>', openIdx);
  if (closeIdx === -1) {
    // The small local model sometimes never emits a closing </think> and
    // just rambles until it runs out of tokens without ever giving a real
    // answer. While still streaming we can't tell the difference from a
    // slow thinker, so keep showing it as reasoning. Once the stream is
    // actually done, don't dump that raw rambling in as if it were the
    // answer — it reads as broken (an earlier version of this did exactly
    // that, and it looked like the AI wasn't responding at all). Keep it
    // tucked behind "Show thinking" like normal, and give a plain fallback
    // answer instead, since there's no real answer to show.
    if (done) {
      return {
        thinking: contentBuf.slice(openIdx + 7).trim(),
        answer: "(Didn't quite finish that thought — mind trying again?)",
        stillThinking: false,
      };
    }
    return { thinking: contentBuf.slice(openIdx + 7), answer: contentBuf.slice(0, openIdx), stillThinking: true };
  }
  const rawAnswer = (contentBuf.slice(0, openIdx) + contentBuf.slice(closeIdx + 8)).replace(/<\/?think>/g, '').trim();
  return {
    thinking: contentBuf.slice(openIdx + 7, closeIdx).trim(),
    // The small local model occasionally emits a stray extra </think> after
    // the real answer (<think>...</think>Hello!</think>) — only the first
    // </think> is the real close, so strip any leftover tag text instead of
    // letting it leak into the visible reply. It also sometimes repeats the
    // whole answer verbatim right after finishing — dedupeRepeatedLines()
    // collapses that once the stream is done.
    answer: done ? dedupeRepeatedLines(rawAnswer) : rawAnswer,
    stillThinking: false,
  };
}

