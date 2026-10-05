// Epic AI inside the one suite (oeper.dev/one) — optional, off until switched on in
// settings.html › "epic AI" (see shared/ai-features.js).
//
// Loaded by the oeper.dev build of the suite only (one-src/bundle.py adds the tag),
// so the standalone build never talks to any server. It works from OUTSIDE the apps:
// each app runs in a same-origin iframe inside the suite's shell page, so this reads
// the selection / document text out of the visible frame and writes results back with
// the browser's own editing commands (which every app already autosaves and undoes).
// It therefore needs no changes to oneWord & co. Apps whose content isn't editable
// text (sheet canvas, slides, PDFs) just get the chat side: ask, then copy the answer.
//
// This file is served with a long browser cache lifetime, so any content or
// behavior change needs its `?v=N` bumped where one-src/bundle.py adds the script
// tag (and in the published one/index.html).

import { aiFeaturesEnabled, onAiFeaturesChange, askAI } from '/shared/ai-features.js?v=4';
import { readFileForAI, isImage } from '/shared/ai-files.js?v=1';

const MAX_CONTEXT_CHARS = 12000;
const BUILD_CONTEXT_CHARS = 24000; // oneIdea outlines and oneSite pages are read whole, so they get more room
const ACTIONS = [
  { label: 'Improve writing', instr: 'Improve the writing: clearer, tighter, better flow. Keep the meaning, tone and language.' },
  { label: 'Fix spelling & grammar', instr: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
  { label: 'Make shorter', instr: 'Rewrite this to about half its length, keeping the key points.' },
  { label: 'Expand', instr: 'Expand this with more detail and examples, keeping the tone.' },
  { label: 'Summarize', instr: 'Summarize this in one short paragraph.' },
  { label: 'Continue writing', instr: 'Continue writing from where this text stops, matching its style. Write only the continuation.' },
  { label: 'Make a mind map', instr: 'Turn this into a clear mind map.', only: 'idea' },
  { label: 'Make study notes', instr: 'Turn this into well organized study notes, and also make a mind map of it.', only: 'idea' },
  { label: 'Make flashcards', instr: 'Make flashcards from this.', only: 'idea' },
  { label: 'Full notes (thorough)', instr: 'Make complete, thorough study notes covering everything in this.', only: 'idea', deep: true },
  { label: 'Make a quiz', instr: 'Make a multiple choice quiz from this with 15 questions.', only: 'idea' },
  { label: 'Quiz me in chat', instr: 'Quiz me on this in the chat, one question at a time. Ask the first question now.', only: 'idea' },
  { label: 'Quiz page (self-test)', instr: 'Make a quiz page from this, with the answers in bold so Recall mode can hide them.', only: 'idea' },
  { label: 'Highlight key terms', instr: 'Highlight the key terms on this page so I can test myself in Recall mode.', only: 'page' },
  { label: 'Add totals', instr: 'Add totals and any other useful summary formulas for this data (keep the existing cells).', only: 'sheet' },
  { label: 'Format it nicely', instr: 'Format this sheet professionally: a bold header row with a fill colour, sensible number formats, column widths that fit, borders where they help, and a frozen header row.', only: 'sheet' },
  { label: 'Add a chart', instr: 'Add the most useful chart for this data.', only: 'sheet' },
  { label: 'Check for problems', instr: 'Check this sheet for mistakes: wrong or inconsistent formulas, numbers stored as text, duplicates, empty cells that should be filled. Fix what is clearly wrong and list anything you are unsure about.', only: 'sheet' },
  { label: 'Improve this deck', instr: 'Improve this deck: sharper titles, tighter bullets, a clear story from start to end. Change only what needs it.', only: 'slide' },
  { label: 'Add speaker notes', instr: 'Write speaker notes for every slide that has none (2 to 4 sentences each).', only: 'slide' },
  { label: 'Add a summary slide', instr: 'Add a closing summary slide with the key takeaways, after the last slide.', only: 'slide' },
  { label: 'Add a chart slide', instr: 'Add a slide with a chart that supports the story of this deck (use realistic example numbers and say they are examples in the notes).', only: 'slide' },
  { label: 'Improve this map', instr: 'Improve this mind map: balance the branches, tighten the wording and add any important sub-topics that are missing. Return the complete updated map.', only: 'map' },
  { label: 'Improve the copy', instr: 'Rewrite the text on this page to be clearer, friendlier and more convincing. Keep the same sections and layout.', only: 'site' },
  { label: 'Add a section', instr: 'Add one more useful section to this page that fits the rest of it.', only: 'site' },
  { label: 'Add a page', instr: 'Add a new page that would suit this site (pick a sensible one that is missing), with real content.', only: 'site' },
  { label: 'Fresh look', instr: 'Pick a different colour palette, font and corner style that fit this site.', only: 'site' },
];
const SYSTEM = 'You are epic AI, an assistant built into the one office suite, helping with the user\'s document. Do exactly what the instruction says. ' +
  'You can change the document directly. When the user asks you to rewrite, fix, shorten, expand, translate, reformat or otherwise change their text, put ONLY the new text between <<edit>> and <</edit>>. It replaces the selected text, or the whole document when nothing is selected, so include everything that should remain. ' +
  'When they ask you to continue or add more, put ONLY the new text between <<append>> and <</append>>. It is added after the selection, or at the end. Inside those tags use no quotation marks, no code fences, and simple markdown (# headings, - bullets, **bold**) only if the text already has that structure. Links are written [text](https://address) and a clickable button is [[Label]](https://address); only add them when the user asks or the text already has them. ' +
  'You may add one short sentence before or after the tags, such as what you changed. When the user asks a question or wants an explanation or summary, answer it clearly and briefly WITHOUT any tags. This is an ongoing conversation, so use the earlier messages as context.';

const IDEA_SYSTEM = 'The user is in oneIdea, a note-taking app with real mind maps and free-form notes pages. You can build them directly, so do NOT dump a long plain list into a text answer when a map or structured notes would serve better. ' +
  'MIND MAP: put an indented outline between <<map title="Short title">> and <</map>>. Use "- " bullets with two spaces of indent per level. Aim for 3 to 7 main branches with 2 to 5 sub-topics each, going one or two levels deeper only where it helps. Keep every topic short (1 to 6 words, never a full sentence). A longer explanation goes on its own line directly under its topic, starting with "> " (it becomes that topic\'s note). Prefix a topic with [important], [question], [definition], [idea] or [ ] (a to-do) only when it really fits. ' +
  'The page that is open is shown to you as an outline in this same format. If it is a mind map and the user wants it changed, expanded or reorganized, put the COMPLETE updated outline between <<mapedit>> and <</mapedit>> instead. ' +
  'STUDY NOTES: put markdown between <<notes title="Short title">> and <</notes>>. Make them THOROUGH, like the complete notes of a top student, never a thin summary. Unless the user asks for brief notes, use 8 to 12 headings for a whole topic or document (every "## Heading" becomes its own box on the page) and under each heading 4 to 10 bullets with indented sub-points, so notes on a chapter or topic run to roughly 800 to 1500 words. Cover EVERYTHING in the source or topic: definitions, how and why things work, formulas with what each symbol means, a worked example for each formula or method, examples, causes and effects, comparisons in a table, common mistakes and exam tips. Use "Term :: meaning" lines for every definition (they become flashcards), "[important] ..." lines for what must be remembered, "[question] ..." lines for open questions and "[ ] task" lines for to-dos, and finish with a Summary and a few practice questions. When the material is too big for one page, write several <<notes>> blocks (one per chapter or sub-topic) in the same reply. Never write one huge block of bullets and never stop early: finish every section. ' +
  'CHOOSING: requests for a mind map, map, overview, brainstorm or how things connect get <<map>>. Requests for notes, a study guide, a summary in notes form or to organize something get <<notes>>. Write only the kind of block that was asked for, except that a request to make notes from a text, PDF or topic gets BOTH a <<notes>> block and a <<map>> block in the same reply. Use plain text only inside blocks: no LaTeX (write -> for arrows) and no em dashes. STUDY TOOLS (all of these are real features of oneIdea): (a) FLASHCARDS: <<cards title="Topic">> then one card per line written as Term :: short meaning. Use "## Heading" lines to group several topics. Make 10 to 30 cards unless told otherwise, and every card line must contain " :: ". The user can then open the Flashcards screen, which reviews them with spaced repetition. (b) QUIZ: <<quiz title="Topic">> with, for each question, a line "[question] The question?" followed by a line holding the answer in **bold**. Recall mode hides bold text, so the user can test themselves. Mix recall, why/how and application questions. (c) KEY TERMS: <<highlight>> with one key term per line, copied exactly as written on the open page (at most 25), to highlight them on the page. (d) CORNELL NOTES: <<notes title="Cornell: Topic" layout="cornell">> with exactly three headings: "## Cues and questions" (lines starting [question]), "## Notes" (bullets) and "## Summary" (2 or 3 sentences). (e) REVISION SHEET: <<notes title="Revision: Topic">> with the headings Must remember ([remember] lines), Formulas and facts, Key terms (Term :: meaning lines) and Practice questions ([question] lines). The page can end with a "Study status" section listing how many flashcards are due and which ones the user is still learning: use it when they ask what to study or for a quiz on their weak spots, and put those exact terms first. (f) MULTIPLE CHOICE QUIZ: <<mcq>> followed by a JSON array like [{"q":"The question?","options":["A","B","C","D"],"answer":0,"why":"one sentence explaining the right answer"}] then <</mcq>>. Give each question 4 options with exactly one right ("answer" is the 0 based index of the right option), plausible wrong options from the same topic, no "all of the above", and 10 to 20 questions that mix recall, understanding and application. They are added to the Quiz screen (ribbon: Study, Quiz) which has practice mode, a timed exam mode, a mistakes notebook and scores. CHAT QUIZ: when the user wants to be quizzed in the chat (for example "quiz me"), ask exactly ONE question, wait for the answer, then say whether it was right, explain briefly what was missing or why, and ask the next one. Mix question types, start with the topics listed under "Questions still getting wrong" or "Still learning" in the Study status, keep a running score and give a short summary after 10 questions. Write no block while quizzing. ' +
  'Never put these blocks inside <<edit>> or <<append>>. After the blocks, write one short sentence saying what you made.';
const SITE_SYSTEM = 'The user is in oneSite, a website builder. A site is a list of pages and each page is a stack of sections. You can change the site directly. The open page is shown to you as JSON in exactly the shape you answer with (title, theme, settings, header, footer, page). To change anything, reply with ONE block: <<site>> a JSON object <</site>>. ' +
  'The object may hold any of these keys, and you include ONLY the keys you change: "page" (the COMPLETE new list of sections for the open page, in order; keep the "id" of every section you keep and leave "id" out for new ones; a section you leave out is deleted), "addPages" (a list of {"name","sections"} for new pages), "theme" ({"palette","font","radius","accent"}), "settings" ({"description","favicon"}), "header" and "footer" ({"v","data"}), "title" (the site name). ' +
  'A section is {"id","type","v","bg","pad","data"} and data holds the fields listed below. A picture shown as "(picture kept)" must be copied back exactly. Never invent picture links: use a placeholder such as "ph:g1" or an https link the user gave you. ' +
  'Write real, specific copy for what the user described, never lorem ipsum, in plain text without markdown or HTML (a line break is \\n). Never use <<edit>>, <<append>>, <<map>> or <<notes>> here. When the user only asks a question or for advice, answer without a block. After a block, write one short sentence saying what you changed. ';
const systemFor = c => SYSTEM + (c.kind === 'site' ? ' ' + SITE_SYSTEM + (c.schema || '') : (c.kind === 'sheet' || c.kind === 'slide') ? ' ' + (c.system || '') : c.build ? ' ' + IDEA_SYSTEM : '');

let fab = null;
let panel = null;
let ui = {};
let lastSel = { text: '', range: null, editable: null }; // last selection seen inside the app frame
let busy = null; // AbortController while a request runs
let attach = null; // { title, text, note }: a PDF or text file the user attached to the panel
let lastAnswer = ''; // text of the newest answer; what Replace / Insert below / Copy act on
const HIST_KEY = 'oe-one-ai-chat-v1', HIST_MAX = 40;
let hist = []; // [{ r: 'u' | 'a', t: text, x: what it was run on }], kept in this browser so the chat survives closing the panel and reloads
try { hist = (JSON.parse(localStorage.getItem(HIST_KEY)) || []).filter(m => m && (m.r === 'u' || m.r === 'a') && typeof m.t === 'string').slice(-HIST_MAX); } catch { hist = []; }
const saveHist = () => { hist = hist.slice(-HIST_MAX); try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {} };
let frameDoc = null;
let stopSelWatch = null;

const $ = s => document.querySelector(s);
const toast = msg => { try { window.ONE.toast(msg); } catch { alert(msg); } };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function activeFrame() {
  const frames = $('#frames');
  if (!frames || frames.hidden) return null;
  return [...frames.querySelectorAll('iframe')].find(f => !f.hidden) || null;
}
function docOf(frame) { try { return frame.contentDocument; } catch { return null; } }

// ── what the panel can see ──
function readContext(forSend) {
  const c = readContextCore(), f = activeFrame();
  let w = null;
  try { w = f && f.contentWindow; } catch {}
  const br = w && (w.OIAI ? w.OIAI : w.OSAI ? w.OSAI : w.OXAI ? w.OXAI : null);
  c.build = !!br;
  c.kind = w && w.OIAI ? 'idea' : w && w.OSAI ? 'site' : w && w.OXAI ? w.OXAI.app : '';
  if (c.build && c.source !== 'selection') {
    // oneIdea / oneSite: show the AI the whole open page (an outline, or the site page as JSON), and never treat one box as "the document".
    try {
      const o = br.context({ send: !!forSend });
      if (o) {
        c.idea = o.kind; c.editable = null;
        if (o.text) { c.text = o.text.slice(0, BUILD_CONTEXT_CHARS); c.truncated = o.text.length > BUILD_CONTEXT_CHARS; c.source = 'document'; } else c.source = 'none';
        if (c.kind === 'site') c.schema = w.OSAI.schema();
        if (c.kind === 'sheet' || c.kind === 'slide') c.system = w.OXAI.system();
      }
    } catch {}
  }
  return c;
}
function readContextCore() {
  const f = activeFrame();
  const d = f && docOf(f);
  if (!d) return { app: '', text: '', source: 'none', editable: null };
  const w = f.contentWindow;
  const sel = w.getSelection();
  const selText = sel && !sel.isCollapsed ? sel.toString().trim() : '';
  const node = sel && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  const editable = (node && node.closest && node.closest('[contenteditable]:not([contenteditable="false"])')) || d.querySelector('#editor') || null;
  if (selText) {
    lastSel = { text: selText, range: sel.getRangeAt(0).cloneRange(), editable };
  } else if (!lastSel.text || !d.contains(lastSel.editable) || d.hasFocus()) {
    // (a collapsed selection while the document has focus means the person clicked away; while the panel has focus it is just the panel taking focus)
    lastSel = { text: '', range: null, editable };
  }
  const app = f.title || 'this app';
  if (lastSel.text) return { app, text: lastSel.text.slice(0, MAX_CONTEXT_CHARS), source: 'selection', editable: lastSel.editable };
  if (editable && (editable.innerText || '').trim()) return { app, text: editable.innerText.trim().slice(0, MAX_CONTEXT_CHARS), source: 'document', editable };
  return { app, text: '', source: 'none', editable };
}

// markdown -> HTML for writing into a document. Supports: headings (# and underlined), nested bullet / numbered / task lists, tables (with
// alignment), block quotes, code blocks, rules, links, bare links, buttons ([[Label]](url)), images (kept as links), **bold**, *italic*,
// ~~strike~~, ==highlight==, `code`, \escapes, <br>, simple math like $H_2O$.
const SAFE_URL = /^(?:https?:\/\/|mailto:)[^\s"'<>]+$/i;
const BTN_STYLE = 'display:inline-block;padding:8px 18px;border-radius:8px;background:#1a73e8;color:#fff;text-decoration:none;font-weight:600';
const texPlain = x => x.replace(/\\(?:rightarrow|to|longrightarrow)\b/g, '→').replace(/\\leftarrow\b/g, '←').replace(/\\times\b/g, '×').replace(/\\approx\b/g, '≈').replace(/\\(?:cdot|bullet)\b/g, '·').replace(/\\(?:text|mathrm|mathbf)\{([^}]*)\}/g, '$1')
  .replace(/_\{([^}]*)\}|_(\w)/g, (_, a, b) => '<sub>' + (a || b) + '</sub>').replace(/\^\{([^}]*)\}|\^(\w)/g, (_, a, b) => '<sup>' + (a || b) + '</sup>').replace(/\\([a-zA-Z]+)/g, '$1');
function mdInline(text) {
  const hold = [], keep = h => '\u0000' + (hold.push(h) - 1) + '\u0000';
  const link = (u, label, extra) => `<a href="${esc(u).replace(/"/g, '%22')}" target="_blank" rel="noopener"${extra || ''}>${label}</a>`;
  let x = String(text).replace(/\u0000/g, ''); // a stray NUL in the model's text must not be able to point at a placeholder
  x = x.replace(/\\([\\`*_{}\[\]()#+\-.!~|$=<>])/g, (_, c) => keep(esc(c)));
  x = x.replace(/`([^`]+)`/g, (_, c) => keep('<code>' + esc(c) + '</code>'));
  x = x.replace(/\$([^$\n]+)\$/g, (m, c) => /[\\_^{]/.test(c) ? keep(texPlain(esc(c))) : m);
  x = x.replace(/\[\[([^\]]+)\]\]\(([^\s)]+)\)/g, (m, l, u) => SAFE_URL.test(u) ? keep(link(u, mdInline(l), ` style="${BTN_STYLE}"`)) : m);
  x = x.replace(/!?\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (m, l, u) => SAFE_URL.test(u) ? keep(link(u, mdInline(l || u))) : m);
  x = x.replace(/<((?:https?:\/\/|mailto:)[^\s>]+)>/gi, (m, u) => keep(link(u, esc(u))));
  x = x.replace(/(^|[\s(])(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)'])/g, (m, pre, u) => pre + keep(link(u, esc(u))));
  x = esc(x).replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>');
  while (/\u0000\d+\u0000/.test(x)) x = x.replace(/\u0000(\d+)\u0000/g, (_, i) => hold[+i]);
  return x;
}
function mdList(items) {
  let html = '', stack = [];
  items.forEach(it => {
    while (stack.length && it.ind < stack[stack.length - 1].ind) html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>';
    let top = stack[stack.length - 1];
    if (top && it.ind === top.ind && top.ord !== it.ord) { html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>'; top = stack[stack.length - 1]; } // bullets -> numbers: start a new list
    if (top && it.ind === top.ind) html += '</li>'; else if (!top || it.ind > top.ind) { html += it.ord ? '<ol>' : '<ul>'; stack.push({ ind: it.ind, ord: it.ord }); }
    const tk = /^\[( |x|X)\]\s+(.*)$/.exec(it.text);
    html += '<li>' + (tk ? (tk[1] === ' ' ? '☐ ' : '☑ ') + mdInline(tk[2]) : mdInline(it.text));
  });
  while (stack.length) html += '</li></' + (stack.pop().ord ? 'ol' : 'ul') + '>';
  return html;
}
function mdToHtml(md) {
  const lines = String(md).replace(/\r/g, '').replace(/\t/g, '    ').split('\n'), out = [];
  const cellsOf = l => l.trim().replace(/^\||\|$/g, '').split('|');
  let i = 0, m;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) { const code = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]); i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue; }
    if (/^\s*\|/.test(line)) {
      const rows = []; let al = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (/^[\s|:\-]+$/.test(lines[i])) al = cellsOf(lines[i]).map(c => /^\s*:-+:\s*$/.test(c) ? 'center' : /-:\s*$/.test(c) ? 'right' : '');
        else rows.push(cellsOf(lines[i]).map(c => mdInline(c.trim())));
        i++;
      }
      const st = k => al[k] ? ` style="text-align:${al[k]}"` : '';
      if (rows.length) out.push('<table>' + rows.map((r, k) => '<tr>' + r.map((c, j) => k ? `<td${st(j)}>${c}</td>` : `<th${st(j)}>${c}</th>`).join('') + '</tr>').join('') + '</table>');
      continue;
    }
    if (/^\s*([-*+•]|\d+[.)])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (m = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(lines[i]))) { items.push({ ind: m[1].length, ord: /\d/.test(m[2]), text: m[3].trim() }); i++; }
      out.push(mdList(items)); continue;
    }
    if (/^\s*>/.test(line)) {
      const q = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(mdInline(lines[i++].replace(/^(\s*>\s?)+/, '').trim()));
      out.push('<blockquote>' + q.join('<br>') + '</blockquote>'); continue;
    }
    i++;
    const t = line.trim();
    if ((m = /^(#{1,6})\s+(.*)$/.exec(t))) out.push(`<h${m[1].length}>${mdInline(m[2].replace(/\s+#+$/, ''))}</h${m[1].length}>`);
    else if (/^([-*_])(\s*\1){2,}$/.test(t)) out.push('<hr>');
    else if (i < lines.length && /^=+\s*$/.test(lines[i])) { i++; out.push(`<h1>${mdInline(t)}</h1>`); }
    else if (i < lines.length && /^-{2,}\s*$/.test(lines[i])) { i++; out.push(`<h2>${mdInline(t)}</h2>`); }
    else out.push(`<p>${mdInline(t)}</p>`);
  }
  return out.join('') || '<p><br></p>';
}

// Writes `markdown` into the open document. Returns a function that undoes it, or null if nothing was written.
//   insert     new blocks after the block the selection / caret is in (or at the very end)
//   replace    the selected text (opts.range, or the last selection seen)
//   replaceAll the whole document (refused when it holds pictures or tables, which plain text would destroy)
function applyToDocument(mode, markdown, opts = {}) {
  const say = m => { if (!opts.quiet) toast(m); };
  const f = activeFrame();
  const d = f && docOf(f);
  const ed = lastSel.editable && d && d.contains(lastSel.editable) ? lastSel.editable : d && d.querySelector('#editor');
  if (!d || !ed) { say('This app can\'t take text from epic AI. Copy it instead.'); return null; }
  const w = f.contentWindow;
  w.focus();
  ed.focus();
  const sel = w.getSelection();
  const undoCmd = () => { w.focus(); ed.focus(); d.execCommand('undo'); };

  if (mode === 'insert') {
    // New blocks go BETWEEN the document's blocks, right after the one the selection/caret is in (or at the very end).
    const rng = opts.range && ed.contains(opts.range.endContainer) ? opts.range : lastSel.range;
    let n = rng ? rng.endContainer : (!opts.atEnd && sel.rangeCount && ed.contains(sel.anchorNode) ? sel.anchorNode : null);
    while (n && n !== ed && n.parentNode !== ed) n = n.parentNode;
    if (n === ed) n = null;
    const tpl = d.createElement('template');
    tpl.innerHTML = mdToHtml(markdown);
    const added = [...tpl.content.childNodes];
    ed.insertBefore(tpl.content, n ? n.nextSibling : null);
    ed.dispatchEvent(new w.Event('input', { bubbles: true })); // the app autosaves on input
    lastSel = { text: '', range: null, editable: ed };
    refresh();
    say('Inserted below.');
    return () => { added.forEach(x => x.remove()); ed.dispatchEvent(new w.Event('input', { bubbles: true })); };
  }

  if (mode === 'replaceAll') {
    if (ed.querySelector('img,table,svg,canvas,iframe,video,audio,object')) {
      say('This document has pictures or tables, so it can\'t be replaced in one go. Select the part to change instead.');
      return null;
    }
    const r = d.createRange();
    r.selectNodeContents(ed);
    sel.removeAllRanges();
    sel.addRange(r);
    d.execCommand('insertHTML', false, mdToHtml(markdown));
    lastSel = { text: '', range: null, editable: ed };
    refresh();
    say('Replaced the document. Ctrl+Z undoes it.');
    return undoCmd;
  }

  // Replace the selection using the browser's own editing command, so the app's undo (Ctrl+Z) still works.
  const rng = opts.range && ed.contains(opts.range.commonAncestorContainer) ? opts.range : lastSel.range;
  if (!rng) { say('Select some text to replace first.'); return null; }
  sel.removeAllRanges();
  sel.addRange(rng);
  d.execCommand('insertHTML', false, mdToHtml(markdown));
  lastSel = { text: '', range: null, editable: ed };
  refresh();
  say('Replaced. Ctrl+Z undoes it.');
  return undoCmd;
}

// ── UI ──
function injectStyles() {
  if ($('#oaiStyle')) return;
  const st = document.createElement('style');
  st.id = 'oaiStyle';
  st.textContent = `
  .oai-fab{position:fixed;right:20px;bottom:20px;z-index:40;height:52px;padding:0 20px 0 16px;border:none;border-radius:18px;display:flex;align-items:center;gap:10px;background:var(--primary);color:var(--on-primary);font:600 14px "Google Sans",sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.28);transition:transform .15s,box-shadow .15s}
  .oai-fab:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.32)}
  .oai-fab[hidden],.oai-panel[hidden]{display:none}
  .oai-fab .ms{font-size:22px}
  .oai-panel{position:fixed;top:0;right:0;bottom:0;width:min(400px,100vw);z-index:41;display:flex;flex-direction:column;background:var(--surface-lowest,#fff);color:var(--on-surface,#1b1b1f);box-shadow:-8px 0 30px rgba(0,0,0,.25);font:14px "Google Sans",sans-serif;animation:oaiIn .22s cubic-bezier(.2,0,0,1)}
  @keyframes oaiIn{from{transform:translateX(30px);opacity:0}}
  .oai-head{display:flex;align-items:center;gap:10px;padding:16px 12px 12px 18px}
  .oai-head b{font-size:17px;font-weight:600}.oai-head small{color:var(--on-surface-variant);font-size:12px;margin-left:2px}
  .oai-head .grow{flex:1}
  .oai-x{width:36px;height:36px;border:none;border-radius:50%;background:none;color:inherit;cursor:pointer;display:grid;place-items:center}.oai-x:hover{background:var(--surface-high)}
  .oai-ctx{margin:0 16px;padding:10px 12px;border-radius:14px;background:var(--surface-low,#f3f3f9);color:var(--on-surface-variant);font-size:12.5px;line-height:1.45;display:flex;gap:8px;align-items:flex-start}
  .oai-ctx .ms{font-size:18px;color:var(--primary);flex-shrink:0}
  .oai-chip[hidden]{display:none}
  .oai-chips{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px 4px}
  .oai-chip{border:1px solid var(--outline-variant,#c4c6d0);background:none;color:inherit;font:inherit;font-size:13px;padding:6px 12px;border-radius:10px;cursor:pointer}.oai-chip:hover:not(:disabled){background:var(--surface-high)}.oai-chip:disabled{opacity:.45;cursor:default}
  .oai-ask{display:flex;gap:8px;padding:8px 16px 12px}
  .oai-ask textarea{flex:1;resize:none;height:44px;max-height:120px;border:1px solid var(--outline-variant,#c4c6d0);border-radius:14px;padding:10px 12px;background:var(--surface-lowest,#fff);color:inherit;font:inherit;outline:none}.oai-ask textarea:focus{border-color:var(--primary)}
  .oai-send{width:44px;height:44px;border:none;border-radius:14px;background:var(--primary);color:var(--on-primary);cursor:pointer;display:grid;place-items:center;flex-shrink:0}.oai-send:disabled{opacity:.5}
  .oai-file{margin:8px 16px 0;padding:8px 8px 8px 12px;border-radius:12px;background:var(--secondary-container,#dbe2f3);color:var(--on-secondary-container,#1a2536);display:flex;align-items:center;gap:8px;font-size:12.5px}.oai-file[hidden]{display:none}.oai-file .ms{font-size:18px;flex-shrink:0}.oai-file span.n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.oai-file button{width:28px;height:28px;border:none;border-radius:50%;background:none;color:inherit;cursor:pointer;display:grid;place-items:center}.oai-file button:hover{background:rgba(0,0,0,.08)}
  .oai-clip{width:44px;height:44px;border:none;border-radius:14px;background:var(--surface-high);color:var(--on-surface-variant);cursor:pointer;display:grid;place-items:center;flex-shrink:0}.oai-clip:hover{color:var(--on-surface)}
  .oai-panel.drop{outline:3px dashed var(--primary);outline-offset:-6px}
  .oai-think{margin:8px 16px 0;border-radius:14px;background:var(--surface-low,#f3f3f9);overflow:hidden}.oai-think[hidden]{display:none}
  .oai-think-h{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;border:none;background:none;color:var(--on-surface-variant);font:600 13px "Google Sans",sans-serif;cursor:pointer;text-align:left}
  .oai-think-h .oai-think-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .oai-think-h .ms{font-size:20px;transition:transform .2s}.oai-think-h[aria-expanded="false"] .ms{transform:rotate(-90deg)}
  .oai-think-b{max-height:130px;overflow:auto;padding:0 14px 12px;color:var(--on-surface-variant);font-size:12.5px;line-height:1.5;white-space:pre-wrap;font-style:italic}
  .oai-think-h[aria-expanded="false"]+.oai-think-b,.oai-think-b:empty{display:none}
  .oai-dots{display:inline-flex;gap:3px}.oai-dots i{width:6px;height:6px;border-radius:50%;background:var(--primary);animation:oaiDot 1.1s ease-in-out infinite}.oai-dots i:nth-child(2){animation-delay:.18s}.oai-dots i:nth-child(3){animation-delay:.36s}
  .oai-think.done .oai-dots{display:none}
  @keyframes oaiDot{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}
  @media(prefers-reduced-motion:reduce){.oai-dots i{animation:none;opacity:.7}}
  .oai-result.busy:empty::before{content:""}
  .oai-result{flex:1;min-height:0;margin:0 16px;overflow:auto;padding:12px 14px;border-radius:14px;background:var(--surface-low,#f3f3f9);white-space:pre-wrap;line-height:1.55;font-size:14px}
  .oai-result:empty::before{content:"Pick an action or ask anything.";color:var(--on-surface-variant)}
  .oai-result.err{color:var(--error)}
  .oai-result{display:flex;flex-direction:column;gap:12px;white-space:normal}
  .oai-msg{max-width:94%;display:flex;flex-direction:column;gap:4px;min-width:0}
  .oai-msg small{font-size:11px;color:var(--on-surface-variant)}
  .oai-msg .oai-mt{white-space:pre-wrap;line-height:1.55;overflow-wrap:anywhere}
  .oai-msg.user{align-self:flex-end;align-items:flex-end}
  .oai-msg.user .oai-mt{background:var(--primary);color:var(--on-primary);border-radius:16px 16px 4px 16px;padding:8px 12px}
  .oai-msg.ai{align-self:flex-start}
  .oai-msg.ai .oai-think{margin:0 0 6px;background:var(--surface-high,#e7e8ee)}
  .oai-msg.err .oai-mt{color:var(--error)}
  .oai-applied{display:flex;align-items:center;gap:8px;margin-top:2px;padding:6px 6px 6px 10px;border-radius:12px;background:var(--secondary-container,#dbe2f3);color:var(--on-secondary-container,#1a2536);font-size:12.5px}
  .oai-applied .ms{font-size:18px;color:var(--primary)}.oai-applied span:nth-child(2){flex:1}
  .oai-applied button{border:none;border-radius:100px;padding:5px 12px;background:var(--surface-lowest,#fff);color:inherit;font:600 12px "Google Sans",sans-serif;cursor:pointer}.oai-applied button:disabled{opacity:.5;cursor:default}
  .oai-new{width:36px;height:36px;border:none;border-radius:50%;background:none;color:inherit;cursor:pointer;display:grid;place-items:center}.oai-new:hover{background:var(--surface-high)}
  .oai-ask{padding-top:0}
  .oai-acts{display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px 16px}
  .oai-acts .btn2{border:none;border-radius:100px;padding:9px 16px;font:600 13px "Google Sans",sans-serif;cursor:pointer;background:var(--surface-high);color:inherit;display:inline-flex;align-items:center;gap:6px}.oai-acts .btn2.main{background:var(--primary);color:var(--on-primary)}.oai-acts .btn2:disabled{opacity:.45;cursor:default}.oai-acts .ms{font-size:18px}
  .oai-home{display:inline-grid}
  @media(max-width:560px){.oai-fab span:not(.ms){display:none}.oai-fab{padding:0 16px;right:16px;bottom:calc(72px + env(safe-area-inset-bottom,0px))}
    .oai-panel{width:100vw;height:100vh;height:100dvh;bottom:auto;padding-bottom:env(safe-area-inset-bottom,0px)}
    .oai-ask textarea{font-size:16px}.oai-chip{padding:8px 12px}.oai-x,.oai-new{width:44px;height:44px}}`;
  document.head.append(st);
}

function build() {
  injectStyles();
  fab = document.createElement('button');
  fab.className = 'oai-fab';
  fab.type = 'button';
  fab.hidden = true;
  fab.title = 'Ask epic AI';
  fab.innerHTML = '<span class="ms" aria-hidden="true">auto_awesome</span><span>epic AI</span>';
  // Keep the app's text selection alive when the button is pressed.
  fab.addEventListener('mousedown', e => e.preventDefault());
  fab.addEventListener('click', openPanel);
  document.body.append(fab);

  panel = document.createElement('aside');
  panel.className = 'oai-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="oai-head"><span class="ms" aria-hidden="true" style="color:var(--primary)">auto_awesome</span><b>epic AI</b><small id="oaiApp"></small><span class="grow"></span>
      <button class="oai-new" type="button" id="oaiNew" title="New chat" aria-label="New chat"><span class="ms" aria-hidden="true">add_comment</span></button>
      <button class="oai-x" type="button" id="oaiClose" title="Close"><span class="ms" aria-hidden="true">close</span></button></div>
    <div class="oai-ctx"><span class="ms" aria-hidden="true">article</span><span id="oaiCtx"></span></div>
    <div class="oai-file" id="oaiFile" hidden><span class="ms" aria-hidden="true">description</span><span class="n" id="oaiFileName"></span>
      <button type="button" id="oaiFileX" title="Remove file" aria-label="Remove file"><span class="ms" aria-hidden="true">close</span></button></div>
    <div class="oai-chips" id="oaiChips"></div>
    <div class="oai-result" id="oaiResult" aria-live="polite"></div>
    <div class="oai-acts" id="oaiActs">
      <button class="btn2 main" type="button" id="oaiReplace"><span class="ms" aria-hidden="true">find_replace</span>Replace</button>
      <button class="btn2" type="button" id="oaiInsert"><span class="ms" aria-hidden="true">add</span>Insert below</button>
      <button class="btn2" type="button" id="oaiCopy"><span class="ms" aria-hidden="true">content_copy</span>Copy</button>
    </div>
    <div class="oai-ask"><button class="oai-clip" type="button" id="oaiClip" title="Attach a PDF or text file" aria-label="Attach a PDF or text file"><span class="ms" aria-hidden="true">attach_file</span></button>
      <input type="file" id="oaiFileIn" hidden accept=".pdf,application/pdf,.txt,.md,.csv,.tsv,.json,.log"><textarea id="oaiPrompt" placeholder="Ask epic AI… (Enter to send)" rows="1"></textarea>
      <button class="oai-send" type="button" id="oaiSend" title="Send"><span class="ms" aria-hidden="true">arrow_upward</span></button></div>`;
  document.body.append(panel);
  ui = {
    app: $('#oaiApp'), ctx: $('#oaiCtx'), chips: $('#oaiChips'), prompt: $('#oaiPrompt'), send: $('#oaiSend'), result: $('#oaiResult'),
    replace: $('#oaiReplace'), insert: $('#oaiInsert'), copy: $('#oaiCopy'), acts: $('#oaiActs'),
    file: $('#oaiFile'), fileName: $('#oaiFileName'), fileIn: $('#oaiFileIn'),

  };
  ui.chips.innerHTML = ACTIONS.map((a, i) => `<button class="oai-chip" type="button" data-i="${i}" hidden>${esc(a.label)}</button>`).join('');
  ui.chips.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b && !ui.send.disabled) { const a = ACTIONS[b.dataset.i]; if (a.deep) runDeep(a.instr); else run(a.instr); } });
  $('#oaiClose').onclick = closePanel;
  $('#oaiNew').onclick = () => { if (busy) { busy.abort(); busy = null; } hist = []; saveHist(); renderHistory(); refresh(); ui.prompt.focus(); };
  $('#oaiClip').onclick = () => ui.fileIn.click();
  ui.fileIn.onchange = () => { const f = ui.fileIn.files[0]; ui.fileIn.value = ''; if (f) attachFile(f); };
  $('#oaiFileX').onclick = () => { attach = null; refresh(); };
  panel.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); panel.classList.add('drop'); } });
  panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop'); });
  panel.addEventListener('drop', e => { panel.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); attachFile(f); });
  ui.send.onclick = () => { const q = ui.prompt.value.trim(); if (q && !ui.send.disabled) { ui.prompt.value = ''; if (wantsDeepNotes(q)) runDeep(q); else run(q); } };
  ui.prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ui.send.click(); } });
  ui.replace.onclick = () => applyToDocument('replace', lastAnswer);
  ui.insert.onclick = () => applyToDocument('insert', lastAnswer);
  ui.copy.onclick = async () => { try { await navigator.clipboard.writeText(lastAnswer); toast('Copied.'); } catch { toast('Couldn\'t copy.'); } };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
}

function refresh() {
  if (!panel) return;
  const c = readContext();
  ui.app.textContent = c.app;
  ui.ctx.textContent = c.source === 'selection' ? `Working on your selection (${c.text.length.toLocaleString()} characters).`
    : c.source === 'document' && c.build ? (c.kind === 'site' ? 'Reading this page of your site.' : c.kind === 'sheet' ? 'Reading this workbook. Ask for formulas, formatting, charts or analysis.' : c.kind === 'slide' ? 'Reading this deck. Ask for new slides, edits, notes or a whole presentation from a topic.' : `Reading this ${c.idea === 'map' ? 'mind map' : 'page'}. Select some text to focus on part of it.`)
    : c.source === 'document' ? 'Working on the whole document — select some text to focus on part of it.'
    : 'No text to work on here — you can still ask epic AI anything.';
  if (attach) ui.ctx.textContent += ' The attached file is included too.';
  ui.file.hidden = !attach;
  if (attach) ui.fileName.textContent = attach.title + (attach.note ? ' (' + attach.note + ')' : '');
  const canEdit = !!c.editable;
  ui.chips.querySelectorAll('button').forEach(b => {
    const only = ACTIONS[b.dataset.i].only;
    b.hidden = only === 'idea' ? c.kind !== 'idea' : only === 'page' ? !(c.kind === 'idea' && c.idea === 'page') : only === 'site' ? c.kind !== 'site' : only === 'sheet' ? c.kind !== 'sheet' : only === 'slide' ? c.kind !== 'slide' : only === 'map' ? c.idea !== 'map' : (c.build && c.source !== 'selection');
    b.disabled = c.source === 'none' && !attach;
  });
  ui.replace.disabled = !(canEdit && c.source === 'selection');
  ui.insert.disabled = !canEdit;
  ui.acts.style.display = lastAnswer && !busy ? '' : 'none';
}

async function attachFile(file) {
  if (isImage(file)) return toast('Pictures can\'t be read here yet. Attach a PDF or a text file.');
  ui.file.hidden = false; ui.fileName.textContent = 'Reading ' + file.name + '...';
  try { attach = await readFileForAI(file); }
  catch (err) { attach = null; toast(err.message || 'Couldn\'t read that file.'); }
  refresh();
}

const TAG_RE = /<<\/?(?:edit|append)>>/g;
// map / notes blocks are built into the app, so they are not shown as chat text
const MAKE_RE = /<<(map|mapedit|notes|site|cards|quiz|highlight|cells|sheetedit|slides|slideedit|mcq)(?:\s[^>]*)?>>[\s\S]*?(?:<<\/\1>>|$)/g;
const shown = t => String(t || '').replace(MAKE_RE, '').replace(TAG_RE, '');
function parseMakes(reply) {
  const out = [], re = /<<(map|mapedit|notes|site|cards|quiz|highlight|cells|sheetedit|slides|slideedit|mcq)((?:\s[^>]*)?)>>([\s\S]*?)(<<\/\1>>|$)/g;
  let m;
  while ((m = re.exec(reply || ''))) {
    const text = m[3].replace(/^\n+|\n+$/g, ''); if (!text.trim()) continue;
    const t = /title\s*=\s*"([^"]*)"/.exec(m[2]);
    const lay = /layout\s*=\s*"([^"]*)"/.exec(m[2]);
    const attrs = {}; m[2].replace(/(\w+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k.toLowerCase()] = v; return ''; });
    out.push({ kind: m[1], title: t ? t[1] : '', layout: lay ? lay[1] : '', attrs, text, closed: !!m[4] });
  }
  return out;
}
// Pulls the <<edit>> / <<append>> block out of a reply. A block that never got its closing tag (the stream was cut) still counts.
function parseEdit(reply) {
  reply = String(reply || '').replace(MAKE_RE, ''); // models sometimes nest a map / notes block inside an edit: that is not a text edit
  const m = /<<(edit|append)>>([\s\S]*?)(<<\/\1>>|$)/.exec(reply);
  if (!m) return null;
  const text = m[2].replace(/^\n+|\n+$/g, '');
  if (!text.trim()) return null;
  return { kind: m[1], text, closed: !!m[3], said: shown((reply.slice(0, m.index) + ' ' + reply.slice(m.index + m[0].length)).replace(/\s+/g, ' ')).trim() };
}

// What a saved answer looks like when the chat is reopened: an applied edit shows as its one-line note, not the whole new text.
const saved = t => {
  const e = parseEdit(t), mk = parseMakes(t), said = shown(t).replace(/\s+/g, ' ').trim();
  if (e) return e.said || (e.kind === 'append' ? 'Added to the document.' : 'Edited the document.');
  if (mk.length) return said || (mk[0].kind === 'mcq' ? 'Made a multiple choice quiz.' : mk[0].kind === 'cells' || mk[0].kind === 'sheetedit' ? 'Updated the spreadsheet.' : mk[0].kind === 'slides' || mk[0].kind === 'slideedit' ? 'Updated the presentation.' : mk[0].kind === 'site' ? 'Updated the site.' : mk[0].kind === 'cards' ? 'Made flashcards.' : mk[0].kind === 'quiz' ? 'Made a quiz.' : mk[0].kind === 'highlight' ? 'Highlighted key terms.' : 'Made ' + mk.map(b => b.kind === 'notes' ? 'a notes page' : 'a mind map').join(' and ') + '.');
  return said;
};

function scrollLog() { ui.result.scrollTop = ui.result.scrollHeight; }
function addMsg(role, text, tag) {
  const d = document.createElement('div'); d.className = 'oai-msg ' + role;
  if (tag) { const g = document.createElement('small'); g.textContent = tag; d.append(g); }
  const b = document.createElement('div'); b.className = 'oai-mt'; b.textContent = text; d.append(b);
  ui.result.append(d); scrollLog();
  return { d, b };
}
function renderHistory() {
  ui.result.textContent = '';
  hist.forEach(m => addMsg(m.r === 'u' ? 'user' : 'ai', m.r === 'u' ? m.t : saved(m.t), m.r === 'u' && m.x ? 'with ' + m.x : ''));
  const lastA = [...hist].reverse().find(m => m.r === 'a');
  // only a plain answer can be inserted by hand; an edit / map / notes answer was applied when it arrived
  lastAnswer = lastA && !parseEdit(lastA.t) && !parseMakes(lastA.t).length ? shown(lastA.t) : '';
}
// The "what is it doing" box inside an answer that is still being written: its reasoning as it
// streams, plus what it is searching for when it uses a tool. Collapses to "Thought for Ns".
function makeThink(parent, before) {
  const box = document.createElement('div'); box.className = 'oai-think';
  box.innerHTML = '<button type="button" class="oai-think-h" aria-expanded="true"><span class="oai-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="oai-think-t">Thinking</span><span class="ms" aria-hidden="true">expand_more</span></button><div class="oai-think-b"></div>';
  const head = box.querySelector('.oai-think-h'), title = box.querySelector('.oai-think-t'), body = box.querySelector('.oai-think-b');
  head.onclick = () => head.setAttribute('aria-expanded', head.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  parent.insertBefore(box, before);
  return {
    box,
    thought: t => { body.textContent = t; body.scrollTop = body.scrollHeight; scrollLog(); },
    status: t => { title.textContent = t; },
    answered: (sawThought, secs) => { box.classList.add('done'); if (sawThought) { title.textContent = 'Thought for ' + secs + 's'; head.setAttribute('aria-expanded', 'false'); } else box.hidden = true; },
  };
}

async function run(instruction) {
  if (busy) busy.abort();
  const c = readContext(true);
  const wantsCtx = c.source !== 'none';
  const appLabel = c.build ? c.app + (c.source === 'selection' ? ' selection' : c.idea === 'map' ? ' mind map (outline)' : c.kind === 'site' ? ' site page (JSON)' : c.kind === 'sheet' ? ' workbook (grid)' : c.kind === 'slide' ? ' presentation (outline)' : ' page (outline)') : c.app;
  instruction = instruction.slice(0, 3800);
  let userMsg = wantsCtx ? `${instruction}\n\n<<one:${appLabel.replace(/[<>\n]/g, ' ')}>>\n${c.text}\n<</one>>` : instruction;
  if (attach) userMsg += `\n\n<<one:${attach.title.replace(/[<>\n]/g, ' ')}>>\n${attach.text.slice(0, Math.max(0, 38000 - userMsg.length))}\n<</one>>`;
  const tag = [c.source === 'selection' ? 'selection' : c.source === 'document' ? 'document' : '', attach ? attach.title : ''].filter(Boolean).join(' + ');
  // Earlier turns go back to the model as plain text (the document text is only attached to the newest question, to keep requests small).
  // The server refuses any single earlier message over 4000 characters, and an answer holding a whole notes page + map is longer than that.
  // So earlier turns go back shortened: built blocks and edits become a one-line note, and everything is capped.
  const forModel = m => m.r === 'u' ? m.t.slice(0, 3800)
    : m.t.replace(MAKE_RE, (_, k) => k === 'mcq' ? '[a multiple choice quiz was made]' : k === 'cells' || k === 'sheetedit' ? '[the spreadsheet was changed]' : k === 'slides' || k === 'slideedit' ? '[the presentation was changed]' : k === 'site' ? '[the site was changed]' : k === 'cards' ? '[flashcards were made]' : k === 'quiz' ? '[a quiz was made]' : k === 'highlight' ? '[key terms were highlighted]' : k === 'notes' ? '[a notes page was made]' : k === 'mapedit' ? '[the mind map was updated]' : '[a mind map was made]')
      .replace(/<<(edit|append)>>[\s\S]*?(?:<<\/\1>>|$)/g, (_, k) => k === 'edit' ? '[the text was edited]' : '[text was added]').slice(0, 3800);
  const prior = hist.slice(-12).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: forModel(m) })).filter(m => m.content.trim());
  hist.push({ r: 'u', t: instruction, x: tag }); saveHist();
  addMsg('user', instruction, tag ? 'with ' + tag : '');
  lastAnswer = '';
  ui.acts.style.display = 'none';
  ui.send.disabled = true;
  const runRange = c.source === 'selection' && lastSel.range ? lastSel.range.cloneRange() : null, canEdit = !!c.editable;
  const am = addMsg('ai', ''), th = makeThink(am.d, am.b);
  const t0 = Date.now(); let answering = false, sawThought = false, ok = false, stored = false;
  busy = new AbortController();
  const mine = busy;
  try {
    const msgs = [{ role: 'system', content: systemFor(c) }, ...prior, { role: 'user', content: userMsg }];
    const opts = {
      signal: mine.signal,
      onThinking: t => { if (answering) return; sawThought = true; th.thought(t); },
      onStatus: st => { if (!answering) th.status(st); },
      onText: t => {
        if (!answering && t) { answering = true; th.answered(sawThought, Math.max(1, Math.round((Date.now() - t0) / 1000))); }
        am.b.textContent = shown(t) || (/<<(map|mapedit)/.test(t) ? 'Building the mind map...' : /<<notes/.test(t) ? 'Writing the notes...' : /<<site/.test(t) ? 'Updating your site...' : /<<(cells|sheetedit)/.test(t) ? 'Updating the spreadsheet...' : /<<(slides|slideedit)/.test(t) ? 'Building the slides...' : /<<mcq/.test(t) ? 'Writing the quiz questions...' : /<<cards/.test(t) ? 'Writing the flashcards...' : /<<quiz/.test(t) ? 'Writing the quiz...' : ''); scrollLog();
      },
    };
    let reply = await askAI(msgs, opts);
    // The model stream sometimes ends before any answer text (a dropped connection): try once more before giving up.
    if (!reply.trim() && !mine.signal.aborted) { th.status('The connection dropped. Trying again...'); reply = await askAI(msgs, opts); }
    if (!reply.trim()) throw new Error('epic AI stopped before it answered. Please try again.');
    const final = reply;
    ok = true;
    if (!answering) th.answered(sawThought, Math.max(1, Math.round((Date.now() - t0) / 1000)));
    hist.push({ r: 'a', t: final }); saveHist(); stored = true;
    // If the model wrote an edit, put it into the document straight away (and offer Undo) instead of making the user copy it over.
    // A reply cut off inside a block (the connection dropped, or the model ran out of room) is only half a change: never apply it.
    const edAll = parseEdit(reply), makesAll = c.build ? parseMakes(reply) : [];
    const cutOff = (edAll && !edAll.closed) || makesAll.some(b => !b.closed);
    const ed = cutOff ? null : edAll, makes = cutOff ? [] : makesAll;
    const undos = [], notes = [];
    if (ed && canEdit) {
      let u = null, w = '';
      if (ed.kind === 'append') { u = applyToDocument('insert', ed.text, { quiet: true, range: runRange, atEnd: !runRange }); w = 'Added to your document.'; }
      else if (runRange) { u = applyToDocument('replace', ed.text, { quiet: true, range: runRange }); w = 'Changed your selection.'; }
      else if (c.source === 'none') { u = applyToDocument('insert', ed.text, { quiet: true, atEnd: true }); w = 'Added to your document.'; }
      else if (c.text.length >= MAX_CONTEXT_CHARS) { /* the AI only saw the start, so it must not overwrite everything */ }
      else { u = applyToDocument('replaceAll', ed.text, { quiet: true }); w = 'Changed your document.'; }
      if (u) { undos.push(u); notes.push(w); }
    }
    // oneSheet / oneSlide: cells, formatting, charts, slides
    let OX = null;
    try { const fx = activeFrame(); OX = fx && fx.contentWindow.OXAI; } catch {}
    if (OX) makes.filter(blk => OX.kinds.includes(blk.kind)).forEach(blk => {
      let u = null;
      try { u = OX.apply(blk); } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push(u.note || 'Updated the document.'); }
    });
    // oneIdea: build real mind maps and notes pages
    let OI = null;
    try { const fr = activeFrame(); OI = fr && fr.contentWindow.OIAI; } catch {}
    let OS = null;
    try { const fr2 = activeFrame(); OS = fr2 && fr2.contentWindow.OSAI; } catch {}
    if (OS) makes.filter(blk => blk.kind === 'site').forEach(blk => {
      let u = null;
      try { u = OS.apply(blk.text, { truncated: c.truncated }); } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push('Updated your site.'); }
    });
    if (OI) makes.filter(blk => blk.kind !== 'site').forEach(blk => {
      let u = null, w = '';
      OI.lastError = '';
      const o = { inline: mdInline, layout: blk.layout };
      try {
        if (blk.kind === 'mapedit' && (u = OI.setMap(blk.text))) w = 'Updated your mind map.';
        else if (blk.kind === 'notes') { u = OI.newNotes(blk.text, blk.title, o); w = 'Made a notes page.'; }
        else if (blk.kind === 'cards') u = OI.newCards(blk.text, blk.title, o);
        else if (blk.kind === 'quiz') u = OI.newQuiz(blk.text, blk.title, o);
        else if (blk.kind === 'mcq') u = OI.newMcq(blk.text);
        else if (blk.kind === 'highlight') u = OI.highlight(blk.text);
        else { u = OI.newMap(blk.text, blk.title); w = 'Made a mind map.'; }
      } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push(u.note || w); }
    });
    // oneIdea has no single text to edit, so a plain rewrite becomes a new notes page and the original stays as it is
    if (OI && ed && !canEdit && !undos.length) {
      let u = null;
      try { u = OI.newNotes(ed.text, '', { inline: mdInline }); } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push('Made a new notes page. Your original is unchanged.'); }
    }
    const said = (ed && ed.said) || shown(reply).replace(/\s+/g, ' ').trim();
    if (undos.length) {
      const where = notes.join(' ');
      am.b.textContent = said || where;
      const bar = document.createElement('div'); bar.className = 'oai-applied';
      bar.innerHTML = '<span class="ms" aria-hidden="true">check_circle</span><span>' + esc(where) + '</span>';
      const extra = [];
      const u = document.createElement('button'); u.type = 'button'; u.textContent = 'Undo';
      u.onclick = () => { try { undos.slice().reverse().forEach(f => f()); u.disabled = true; u.textContent = 'Undone'; extra.forEach(x => { x.disabled = true; }); toast('Undone.'); } catch { toast('Use Ctrl+Z in the document to undo.'); } };
      bar.append(u);
      undos.flatMap(f => f.actions || []).forEach(act => { const x = document.createElement('button'); x.type = 'button'; x.textContent = act.label; x.onclick = () => { try { act.run(); } catch (err) { console.error(err); } }; extra.push(x); bar.append(x); });
      am.d.append(bar);
      lastAnswer = '';
    } else {
      am.b.textContent = shown(final) || makesAll.map(blk => blk.text).join('\n\n');
      if (cutOff) { const n = document.createElement('small'); n.textContent = 'This answer was cut off, so nothing was changed. Ask again, or ask it to continue.'; am.d.append(n); }
      if ((ed && canEdit) || makes.length) { const n = document.createElement('small'); n.textContent = makes.length ? (OX && OX.kinds.includes(makes[0].kind) ? (OX.lastError || 'Couldn\'t apply this here.') : makes[0].kind === 'site' ? ((() => { try { return activeFrame().contentWindow.OSAI.lastError; } catch { return ''; } })() || 'Couldn\'t apply this to the site.') : ((() => { try { return activeFrame().contentWindow.OIAI.lastError; } catch { return ''; } })() || 'Couldn\'t build this here. You can copy it instead.')) : 'Couldn\'t apply this automatically. Use the buttons below.'; am.d.append(n); }
      lastAnswer = cutOff ? '' : ed ? ed.text : makes.length ? makes[0].text : reply;
    }
  } catch (err) {
    if (!stored) { hist.pop(); saveHist(); } // the question never got an answer: don't keep it as a dangling turn
    if (err.name === 'AbortError') { am.d.remove(); return; }
    am.d.classList.add('err'); th.box.hidden = true;
    am.b.textContent = 'Couldn\'t reach epic AI: ' + err.message;
  } finally {
    if (busy === mine) busy = null;
    ui.send.disabled = false;
    th.box.classList.add('done');
    if (!sawThought && ok) th.box.hidden = true;
    scrollLog();
    refresh();
  }
}

// A thorough set of notes is far too long for one reply. So it is done in steps: plan the sections, then write each section as its
// own notes page (two at a time), then add a mind map of the plan. Pages appear one by one, in order, while it works.
const DEEP_RE = /\b(full|complete|detailed|thorough|comprehensive|in[- ]depth|extensive)\b[^.?!]{0,40}\b(notes|study guide)\b|\b(notes|study guide)\b[^.?!]{0,40}\b(full|complete|detailed|thorough|comprehensive|in[- ]depth|extensive)\b/i;
const sameTitle = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === String(b || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function wantsDeepNotes(q) { if (!DEEP_RE.test(q)) return false; try { const fr = activeFrame(); return !!(fr && fr.contentWindow.OIAI); } catch { return false; } }
// The model stream sometimes ends before it has written anything (a dropped connection, or the reply budget spent on thinking): ask again.
async function askRetry(msgs, opts, tries = 2) {
  let reply = '';
  for (let k = 0; k < tries && !reply.trim(); k++) { if (opts.signal && opts.signal.aborted) break; reply = await askAI(msgs, opts); }
  return reply;
}
async function runDeep(instruction) {
  let OI = null, frameWin = null;
  try { const fr = activeFrame(); frameWin = fr && fr.contentWindow; OI = frameWin && frameWin.OIAI; } catch {}
  if (!OI) return run(instruction);
  if (busy) busy.abort();
  const c = readContext(true);
  instruction = instruction.slice(0, 1500);
  const src = attach ? attach.text.slice(0, 38000) : c.source !== 'none' ? c.text : '';
  const srcLabel = (attach ? attach.title : c.source === 'selection' ? 'selection' : 'page (outline)').replace(/[<>\n]/g, ' ');
  const withSrc = text => src ? `${text}\n\n<<one:${srcLabel}>>\n${src}\n<</one>>` : text;
  const tag = attach ? attach.title : src ? 'document' : '';
  hist.push({ r: 'u', t: instruction, x: tag }); saveHist();
  addMsg('user', instruction, tag ? 'with ' + tag : '');
  lastAnswer = ''; ui.acts.style.display = 'none'; ui.send.disabled = true;
  const am = addMsg('ai', ''), th = makeThink(am.d, am.b);
  busy = new AbortController(); const mine = busy;
  const undos = [], titles = []; let stored = false;
  const sys = SYSTEM + ' ' + IDEA_SYSTEM;
  try {
    th.status('Planning the notes...'); am.b.textContent = 'Planning the notes...';
    const planReply = await askRetry([{ role: 'system', content: sys }, { role: 'user', content: withSrc(`${instruction}\n\nFirst plan the notes. Reply with ONLY JSON and no other text: {"title":"short title for the whole set","sections":[{"title":"short section title","covers":"one sentence saying exactly what this section must cover"}]}. Use 5 to 8 sections that together cover EVERYTHING${src ? ' in the material' : ' a student needs on this topic'}, in a sensible teaching order.`) }], { signal: mine.signal });
    let plan = null;
    try { const i = planReply.indexOf('{'), z = planReply.lastIndexOf('}'); plan = JSON.parse(planReply.slice(i, z + 1)); } catch {}
    const sections = plan && Array.isArray(plan.sections) ? plan.sections.map(x => ({ title: String(x && x.title || '').trim().slice(0, 80), covers: String(x && x.covers || '').trim().slice(0, 300) })).filter(x => x.title).slice(0, 8) : [];
    if (sections.length < 2) throw new Error('could not plan the notes. Please try again.');
    const setTitle = String(plan.title || 'Notes').trim().slice(0, 80), n = sections.length;
    const outline = sections.map((x, i) => `${i + 1}. ${x.title}`).join('; ');
    const results = new Array(n).fill(null); let nextJob = 0, applied = 0, finished = 0;
    const apply = () => {
      while (applied < n && results[applied] !== null) {
        const sec = sections[applied], text = results[applied]; applied++;
        if (!text) continue;
        let u = null;
        try { OI.lastError = ''; u = OI.newNotes(text, sec.title, { inline: mdInline }); } catch (err) { console.error(err); }
        if (u) { undos.push(u); titles.push(sec.title); }
      }
    };
    const status = () => { const msg = `Writing the notes: ${finished} of ${n} sections done`; th.status(msg); am.b.textContent = msg + (titles.length ? '. Pages so far: ' + titles.join(', ') : '') + '.'; scrollLog(); };
    status();
    const groups = []; for (let i = 0; i < n; i += 2) groups.push([i, Math.min(n, i + 2)]);
    const worker = async () => {
      while (nextJob < groups.length && !mine.signal.aborted) {
        const [from, to] = groups[nextJob++], part = [];
        for (let i = from; i < to; i++) part.push(`part ${i + 1}, "${sections[i].title}", which must cover: ${sections[i].covers || sections[i].title}`);
        const ask = `${instruction}\n\nYou are writing a set of notes called "${setTitle}". The parts are: ${outline}. Write ONLY ${to - from > 1 ? 'these ' + (to - from) + ' parts' : 'this part'}: ${part.join('; ')}. Write each part as its own <<notes title="the part title">> block, thorough (at least 500 words each) and following the study notes rules, with no other blocks. The other parts are written separately, so do not repeat them.`;
        const reply = await askRetry([{ role: 'system', content: sys }, { role: 'user', content: withSrc(ask) }], { signal: mine.signal });
        const blocks = parseMakes(reply).filter(b => b.kind === 'notes');
        for (let i = from; i < to; i++) {
          const byTitle = blocks.find(b => sameTitle(b.title, sections[i].title)), mk = byTitle || blocks[i - from];
          results[i] = ((mk ? mk.text : (blocks.length ? '' : shown(reply))) || '').trim();
          finished++;
        }
        apply(); status();
      }
    };
    await Promise.all([worker(), worker()]);
    if (mine.signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
    apply();
    // a mind map of the plan, so the whole set can be seen at a glance
    try { const out = `- ${setTitle}\n` + sections.map(x => `  - ${x.title}\n    > ${x.covers}`).join('\n'); const u = OI.newMap(out, setTitle); if (u) undos.push(u); } catch (err) { console.error(err); }
    th.box.hidden = true;
    const summary = `Wrote ${titles.length} pages of notes: ${titles.join(', ')}.`;
    am.b.textContent = titles.length ? summary + ' I also added a mind map of the whole set.' : 'Nothing could be written. Please try again.';
    hist.push({ r: 'a', t: summary }); saveHist(); stored = true;
    if (undos.length) {
      const bar = document.createElement('div'); bar.className = 'oai-applied';
      bar.innerHTML = '<span class="ms" aria-hidden="true">check_circle</span><span>' + esc(`Added ${titles.length} notes pages and a mind map.`) + '</span>';
      const extra = [];
      const u = document.createElement('button'); u.type = 'button'; u.textContent = 'Undo all';
      u.onclick = () => { try { undos.slice().reverse().forEach(f => f()); u.disabled = true; u.textContent = 'Undone'; extra.forEach(x => { x.disabled = true; }); toast('Undone.'); } catch { toast('Use Ctrl+Z in the document to undo.'); } };
      bar.append(u);
      [['Flashcards', () => frameWin.ST.open('section')], ['Take a quiz', () => frameWin.QZ.open({ scope: 'section' })]].forEach(([label, fn]) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = label; x.onclick = () => { try { fn(); } catch (err) { console.error(err); } }; extra.push(x); bar.append(x); });
      am.d.append(bar);
    }
  } catch (err) {
    if (!stored) { hist.pop(); saveHist(); }
    if (err.name === 'AbortError') { am.d.remove(); }
    else { am.d.classList.add('err'); th.box.hidden = true; am.b.textContent = (titles.length ? `Stopped after ${titles.length} pages: ` : 'Couldn\'t write the notes: ') + err.message; }
  } finally {
    if (busy === mine) busy = null;
    ui.send.disabled = false; scrollLog(); refresh();
  }
}

function openPanel() {
  if (!panel) return;
  renderHistory();
  panel.hidden = false;
  refresh();
  ui.prompt.focus();
  // Follow the selection while the panel is open.
  const f = activeFrame();
  const d = f && docOf(f);
  if (d && d !== frameDoc) {
    if (stopSelWatch) stopSelWatch();
    let t;
    const onSel = () => { clearTimeout(t); t = setTimeout(refresh, 150); };
    d.addEventListener('selectionchange', onSel);
    frameDoc = d;
    stopSelWatch = () => { try { d.removeEventListener('selectionchange', onSel); } catch {} frameDoc = null; };
  }
}
function closePanel() {
  if (busy) { busy.abort(); busy = null; }
  panel.hidden = true;
  if (stopSelWatch) { stopSelWatch(); stopSelWatch = null; }
}

// The button only makes sense while an app is open (not on the suite's home screen).
function syncFab() {
  if (!fab) return;
  const open = !!activeFrame();
  fab.hidden = !open;
  if (!open && panel && !panel.hidden) closePanel();
}
function enable() {
  if (fab) return syncFab();
  build();
  const frames = $('#frames');
  if (frames) new MutationObserver(syncFab).observe(frames, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
  syncFab();
}
function disable() {
  if (panel && !panel.hidden) closePanel();
  if (fab) fab.hidden = true;
}

// The app switcher inside every app (and a button on the home screen) opens the panel, so it is one tap away on a phone.
function toggleFromMenu() { if (!panel) return; if (panel.hidden) openPanel(); else closePanel(); }
window.addEventListener('message', e => { const m = e.data; if (e.origin === location.origin && m && m.one && m.type === 'ai' && aiFeaturesEnabled()) { if (!panel) enable(); toggleFromMenu(); } });
function syncHomeBtn(on) {
  let b = document.getElementById('oaiHomeBtn');
  const top = document.querySelector('#home .top');
  if (!on || !top) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('button');
  b.id = 'oaiHomeBtn'; b.type = 'button'; b.className = 'tb-btn oai-home'; b.title = 'Ask epic AI'; b.setAttribute('aria-label', 'Ask epic AI');
  b.innerHTML = '<span class="ms" aria-hidden="true">auto_awesome</span>';
  b.addEventListener('click', () => { if (!panel) enable(); toggleFromMenu(); });
  const before = document.getElementById('seedBtn');
  top.insertBefore(b, before && before.parentNode === top ? before : null);
}

function start() {
  if (aiFeaturesEnabled()) enable();
  syncHomeBtn(aiFeaturesEnabled());
  onAiFeaturesChange(on => syncHomeBtn(on));
  onAiFeaturesChange(on => (on ? enable() : disable()));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
