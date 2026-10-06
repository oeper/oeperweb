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

import { aiFeaturesEnabled, onAiFeaturesChange, askAI } from '/shared/ai-features.js?v=7';
import { readFileForAI, isImage } from '/shared/ai-files.js?v=2';

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
  { label: 'Make study notes', instr: 'Make complete, thorough study notes covering everything in this.', only: 'idea', deep: true },
  { label: 'Improve this page', instr: 'Improve the notes on this page: correct mistakes, fill in missing detail, definitions, examples and key points, and make them clearer. Change this page itself, do not make a new page.', only: 'idea' },
  { label: 'Make flashcards', instr: 'Make flashcards from this.', only: 'idea' },
  { label: 'Make a quiz', instr: 'Make a multiple choice quiz from this with 15 questions.', only: 'idea' },
  { label: 'Quiz me', instr: 'Quiz me on this. Write a quiz of 15 questions, a mix of multiple choice and written answer questions, so it opens in the quiz screen and my written answers are marked.', only: 'idea' },
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
  'You may add one short sentence before or after the tags, such as what you changed. When the user asks a question or wants an explanation or summary, answer it clearly and briefly WITHOUT any tags. This is an ongoing conversation, so use the earlier messages as context. Do not draft or deliberate at length in your thinking: think for at most a few short sentences, then write the answer straight away. Earlier assistant turns may contain a line in square brackets, such as [a notes page was made]: that is a note added by the app to record what was built. You never write such a line yourself. When asked to make or change something, always write the real block or text now, and never answer with only a bracketed line.';

const IDEA_SYSTEM = 'The user is in oneIdea, a note-taking app with real mind maps and free-form notes pages. You can build them directly, so do NOT dump a long plain list into a text answer when a map or structured notes would serve better. ' +
  'MIND MAP: put an indented outline between <<map title="Short title">> and <</map>>. Use "- " bullets with two spaces of indent per level. Aim for 3 to 7 main branches with 2 to 5 sub-topics each, going one or two levels deeper only where it helps. Keep every topic short (1 to 6 words, never a full sentence). A longer explanation goes on its own line directly under its topic, starting with "> " (it becomes that topic\'s note). Prefix a topic with [important], [question], [definition], [idea] or [ ] (a to-do) only when it really fits. ' +
  'The page that is open is shown to you in this same format (a mind map as an outline, a notes page as markdown). If it is a mind map and the user wants it changed, expanded or reorganized, put the COMPLETE updated outline between <<mapedit>> and <</mapedit>> instead. ' +
  'EDITING THE OPEN NOTES PAGE (very important): when a notes page is open and the user wants it changed (improve, fix, correct, expand, add more detail, shorten, rewrite, reorganize, translate, make it better, add examples or questions, "my notes", "this page", "this") do NOT make a new page. Use <<pageedit>> and put the COMPLETE updated markdown of the page between <<pageedit>> and <</pageedit>>: keep everything that should stay (every heading, bullet, table, "Term :: meaning" line and tag line) and change or add only what was asked, in the same markdown format the page is shown in. When they only want something ADDED (more sections, a summary, practice questions, an extra topic), use <<pageadd>> with ONLY the new markdown between <<pageadd>> and <</pageadd>>, which is placed underneath the existing notes. Never copy a "Study status" section into an edit. Use <<notes>> only for a brand new separate page (the user says new page, or there is no notes page to change). ' +
  'STUDY NOTES: put markdown between <<notes title="Short title">> and <</notes>>. Make them THOROUGH, like the complete notes of a top student, never a thin summary. Unless the user asks for brief notes, use 8 to 12 headings for a whole topic or document (every "## Heading" becomes its own box on the page) and under each heading 4 to 10 bullets with indented sub-points, so notes on a chapter or topic run to roughly 800 to 1500 words. Cover EVERYTHING in the source or topic: definitions, how and why things work, formulas with what each symbol means, a worked example for each formula or method, examples, causes and effects, comparisons in a table, common mistakes and exam tips. Use "Term :: meaning" lines for every definition (they become flashcards), "[important] ..." lines for what must be remembered, "[question] ..." lines for open questions and "[ ] task" lines for to-dos, Start every notes block with an "## At a glance" section of 3 to 5 one-line key takeaways, and finish with "## Summary" (2 or 3 sentences) and "## Check yourself" (4 to 6 [question] lines, each followed by an indented bullet holding the answer in **bold**). DIAGRAMS: wherever the material has a process, a cycle, a sequence of steps or a timeline, draw it: put ONE line inside the notes that starts with [diagram] followed by JSON on that same single line, for example [diagram] {"type":"flow","title":"Short title","steps":[{"t":"Step name","d":"short detail"},{"t":"Next step","d":""}]} or [diagram] {"type":"cycle","title":"Short title","steps":["Stage 1","Stage 2","Stage 3"]} or [diagram] {"type":"timeline","title":"Short title","events":[{"when":"1914","what":"War begins"}]}. Use 3 to 6 steps or events, keep every text under 8 words, and only draw things that are really in the material.  When the material is too big for one page, write several <<notes>> blocks (one per chapter or sub-topic) in the same reply. Never write one huge block of bullets and never stop early: finish every section. ' +
  'CHOOSING: requests for a mind map, map, overview, brainstorm or how things connect get <<map>>. Requests for notes, a study guide, a summary in notes form or to organize something get <<notes>>. Write only the kind of block that was asked for, except that a request to make notes from a text, PDF or topic gets BOTH a <<notes>> block and a <<map>> block in the same reply. Use plain text only inside blocks: no LaTeX (write -> for arrows) and no em dashes. STUDY TOOLS (all of these are real features of oneIdea): (a) FLASHCARDS: <<cards title="Topic">> then one card per line written as Term :: short meaning. Use "## Heading" lines to group several topics. Make 10 to 30 cards unless told otherwise, and every card line must contain " :: ". The user can then open the Flashcards screen, which reviews them with spaced repetition. (b) QUIZ: <<quiz title="Topic">> with, for each question, a line "[question] The question?" followed by a line holding the answer in **bold**. Recall mode hides bold text, so the user can test themselves. Mix recall, why/how and application questions. (c) KEY TERMS: <<highlight>> with one key term per line, copied exactly as written on the open page (at most 25), to highlight them on the page. (d) CORNELL NOTES: <<notes title="Cornell: Topic" layout="cornell">> with exactly three headings: "## Cues and questions" (lines starting [question]), "## Notes" (bullets) and "## Summary" (2 or 3 sentences). (e) REVISION SHEET: <<notes title="Revision: Topic">> with the headings Must remember ([remember] lines), Formulas and facts, Key terms (Term :: meaning lines) and Practice questions ([question] lines). The page can end with a "Study status" section listing how many flashcards are due and which ones the user is still learning: use it when they ask what to study or for a quiz on their weak spots, and put those exact terms first. (f) QUIZ SCREEN: <<mcq>> followed by a JSON array then <</mcq>>. Each item is either a multiple choice question {"q":"The question?","options":["A","B","C","D"],"answer":0,"why":"one sentence explaining the right answer"} (exactly 4 options, one right, "answer" is the 0 based index, plausible wrong options from the same topic, no "all of the above") or a written answer question {"q":"Explain why ...?","type":"short","answer":"the model answer in one to three sentences","why":"what a full answer must include"}. Make 12 to 20 questions, about 60 percent multiple choice and 40 percent written answer, mixing recall, understanding and application. They open in the Quiz screen (ribbon: Study, Quiz) where the student answers every question and the AI marks the written answers; there is also an exam mode, a mistakes notebook and scores. QUIZZING: when the user asks to be quizzed (quiz me, test me, ask me questions, examine me), do NOT chat the answers or ask them to rate themselves: write a <<mcq>> block so the quiz screen opens, starting with the topics listed under "Questions still getting wrong" or "Still learning" in the Study status. Only when they say "in the chat" ask exactly ONE question, wait for their typed answer, then mark it yourself (right, partly right or wrong, with the correct answer and a short explanation) before the next one, keeping a running score. ' +
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
      const o = br.context({ send: !!forSend, peek: !forSend });
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
  // one enormous line (30,000 "[" for example) makes every link and emphasis pattern below rescan the rest of it: show it as plain text
  if (String(text).length > 6000) return esc(String(text).replace(/\u0000/g, ''));
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
  .oai-msg.ai .oai-mt{white-space:normal}
  .oai-msg.ai .oai-mt>:first-child{margin-top:0}.oai-msg.ai .oai-mt>:last-child{margin-bottom:0}
  .oai-msg.ai .oai-mt p{margin:0 0 .6em}
  .oai-msg.ai .oai-mt h1,.oai-msg.ai .oai-mt h2,.oai-msg.ai .oai-mt h3,.oai-msg.ai .oai-mt h4{margin:.8em 0 .35em;line-height:1.25;font-weight:600}
  .oai-msg.ai .oai-mt h1{font-size:1.3em}.oai-msg.ai .oai-mt h2{font-size:1.18em}.oai-msg.ai .oai-mt h3,.oai-msg.ai .oai-mt h4{font-size:1.05em}
  .oai-msg.ai .oai-mt ul,.oai-msg.ai .oai-mt ol{margin:.2em 0 .7em;padding-left:1.4em}
  .oai-msg.ai .oai-mt li{margin:.15em 0}
  .oai-msg.ai .oai-mt code{font:12.5px/1.4 "Roboto Mono",ui-monospace,monospace;background:var(--surface-high,#e7e8ee);padding:1px 5px;border-radius:5px}
  .oai-msg.ai .oai-mt pre{background:var(--surface-high,#e7e8ee);padding:8px 10px;border-radius:10px;overflow:auto;margin:.4em 0 .7em}
  .oai-msg.ai .oai-mt pre code{background:none;padding:0}
  .oai-msg.ai .oai-mt blockquote{margin:.4em 0 .7em;padding:.1em 0 .1em 12px;border-left:3px solid var(--primary)}
  .oai-msg.ai .oai-mt table{border-collapse:collapse;margin:.4em 0 .7em;font-size:.95em;display:block;overflow-x:auto}
  .oai-msg.ai .oai-mt th,.oai-msg.ai .oai-mt td{border:1px solid var(--outline-variant,rgba(128,128,128,.4));padding:4px 8px;text-align:left}
  .oai-msg.ai .oai-mt th{background:var(--surface-high,#e7e8ee)}
  .oai-msg.ai .oai-mt a{color:var(--primary)}
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
  try { attach = await readFileForAI(file, { maxChars: 900000, maxPages: 500, onProgress: (n, t) => { if (n % 10 === 0 || n === t) ui.fileName.textContent = 'Reading ' + file.name + ': page ' + n + ' of ' + t + '...'; } }); }
  catch (err) { attach = null; toast(err.message || 'Couldn\'t read that file.'); }
  refresh();
}

const TAG_RE = /<<\/?(?:edit|append)>>/g;
// map / notes blocks are built into the app, so they are not shown as chat text
const MAKE_RE = /<<(map|mapedit|notes|pageedit|pageadd|site|cards|quiz|highlight|cells|sheetedit|slides|slideedit|mcq)(?:\s[^>]*)?>>[\s\S]*?(?:<<\/\1>>|$)/g;
const PH_SRC = '\\[(?:an?|the|some)\\s[^\\]\\n]{2,80}\\s(?:was|were)\\s(?:made|updated|created|added|changed|edited|highlighted|built)\\]';
const PH_RE = new RegExp(PH_SRC, 'gi'), PH_T = new RegExp(PH_SRC, 'i');
const shown = t => String(t || '').replace(MAKE_RE, '').replace(TAG_RE, '').replace(PH_RE, '').replace(/\n{3,}/g, '\n\n').trim();
// "[a notes page was made]": the model sometimes copies the status lines the app puts in its history instead of writing the real thing
const isPlaceholder = t => /^\[[^\]\n]{3,90}\]$/.test(String(t || '').trim()) && /\b(was|were|made|updated|created|added|changed)\b/i.test(String(t));
// an answer that says "I have expanded your notes" (or copies a status line) but holds no block, edit or text: nothing was built
const ACTION_RE = /\b(make|made|update|expand|add|create|write|build|put|turn|edit|improve|fix|change|rewrite|redo|more|continue|extend|include|fill|complete)\b/i;
const CLAIM_RE = /\b(I have|I've|I just|I now)\s+(now\s+|also\s+)?(expanded|updated|added|created|made|written|built|rewritten|extended|included|put)\b|\bYou can now (view|see|find|open|read)\b/i;
const fakeBuild = (reply, instr) => !parseEdit(reply) && !parseMakes(reply).length && ACTION_RE.test(String(instr || '')) && (PH_T.test(reply) || CLAIM_RE.test(shown(reply)) || !shown(reply));
function parseMakes(reply) {
  const out = [], re = /<<(map|mapedit|notes|pageedit|pageadd|site|cards|quiz|highlight|cells|sheetedit|slides|slideedit|mcq)((?:\s[^>]*)?)>>([\s\S]*?)(<<\/\1>>|$)/g;
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
  const b = document.createElement('div'); b.className = 'oai-mt';
  // the AI's answers are markdown (bold, lists, headings, tables): every write to its text is shown formatted
  if (role === 'ai') Object.defineProperty(b, 'textContent', { configurable: true, get() { return this.innerText; }, set(v) { v = v == null ? '' : String(v); this.innerHTML = v.trim() ? mdToHtml(v) : ''; } });
  b.textContent = text; d.append(b);
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
    : m.t.replace(MAKE_RE, (_, k) => k === 'mcq' ? '[a multiple choice quiz was made]' : k === 'cells' || k === 'sheetedit' ? '[the spreadsheet was changed]' : k === 'slides' || k === 'slideedit' ? '[the presentation was changed]' : k === 'site' ? '[the site was changed]' : k === 'cards' ? '[flashcards were made]' : k === 'quiz' ? '[a quiz was made]' : k === 'highlight' ? '[key terms were highlighted]' : k === 'notes' ? '[a notes page was made]' : k === 'pageedit' ? '[the page was updated]' : k === 'pageadd' ? '[sections were added to the page]' : k === 'mapedit' ? '[the mind map was updated]' : '[a mind map was made]')
      .replace(/<<(edit|append)>>[\s\S]*?(?:<<\/\1>>|$)/g, (_, k) => k === 'edit' ? '[the text was edited]' : '[text was added]').slice(0, 3800);
  const prior = hist.slice(-12).filter(m => !(m.r === 'a' && isPlaceholder(m.t))).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: forModel(m) })).filter(m => m.content.trim());
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
        am.b.textContent = shown(t) || (/<<(map|mapedit)/.test(t) ? 'Building the mind map...' : /<<notes/.test(t) ? 'Writing the notes...' : /<<page(edit|add)/.test(t) ? 'Updating the page...' : /<<site/.test(t) ? 'Updating your site...' : /<<(cells|sheetedit)/.test(t) ? 'Updating the spreadsheet...' : /<<(slides|slideedit)/.test(t) ? 'Building the slides...' : /<<mcq/.test(t) ? 'Writing the quiz questions...' : /<<cards/.test(t) ? 'Writing the flashcards...' : /<<quiz/.test(t) ? 'Writing the quiz...' : ''); scrollLog();
      },
    };
    let reply = await askAI(msgs, opts);
    // The model stream sometimes ends before any answer text (a dropped connection): try once more before giving up.
    if (!reply.trim() && !mine.signal.aborted) { th.status('The connection dropped. Trying again...'); reply = await askAI(msgs, opts); }
    if (!reply.trim()) throw new Error('epic AI stopped before it answered. Please try again.');
    if (c.build && fakeBuild(reply, instruction) && !mine.signal.aborted) {
      th.status('That reply did not build anything. Asking again...');
      const again = [...msgs.slice(0, -1), { role: 'user', content: userMsg + '\n\nIMPORTANT: your last answer did not actually build or change anything. Do not describe the result and do not write a bracketed status line. Write the real content now, inside the proper block (<<notes>>, <<pageedit>>, <<pageadd>>, <<mcq>>, <<map>> and so on).' }];
      reply = await askAI(again, opts);
      if (!reply.trim() || fakeBuild(reply, instruction)) throw new Error('epic AI did not build anything that time. Please try again, or ask for it a little differently (for example "add these chapters as new notes").');
    }
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
    let openQuiz = null;
    if (OI) makes.filter(blk => blk.kind !== 'site').forEach(blk => {
      let u = null, w = '';
      OI.lastError = '';
      const o = { inline: mdInline, layout: blk.layout };
      try {
        if (blk.kind === 'mapedit' && (u = OI.setMap(blk.text))) w = 'Updated your mind map.';
        else if (blk.kind === 'pageedit' && !c.truncated && (u = OI.setNotes(blk.text, blk.title, o))) w = 'Updated this page.';
        else if (blk.kind === 'pageadd' && (u = OI.addNotes(blk.text, o))) w = 'Added to this page.';
        else if (blk.kind === 'notes' || blk.kind === 'pageedit' || blk.kind === 'pageadd') { u = OI.newNotes(blk.text, blk.title, o); w = 'Made a notes page.'; }
        else if (blk.kind === 'cards') u = OI.newCards(blk.text, blk.title, o);
        else if (blk.kind === 'quiz') u = OI.newQuiz(blk.text, blk.title, o);
        else if (blk.kind === 'mcq') { u = OI.newMcq(blk.text); if (u && u.actions && u.actions[0] && /\b(quiz|test|examine|question)/i.test(instruction)) openQuiz = u.actions[0]; }
        else if (blk.kind === 'highlight') u = OI.highlight(blk.text);
        else { u = OI.newMap(blk.text, blk.title); w = 'Made a mind map.'; }
      } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push(u.note || w); }
    });
    if (openQuiz) setTimeout(() => { try { openQuiz.run(); } catch (err) { console.error(err); } }, 600);
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
// ANY request to make notes gets the thorough route (plan, then write each section), unless the user asked for something short or for a different kind of study material
const NOTES_ASK = /\b(notes?|study guide|study sheet|summar(y|ies|ise|ize))\b/i;
const NOT_DEEP = /\b(brief|briefly|short|quick|quickly|few|tl;?dr|concise|one page|one-page|a paragraph|one paragraph|cornell|revision sheet|flash ?cards?|quiz|improve|fix|correct|expand|edit|rewrite|shorten|translate|reformat|continue|add (to|more|a|an|some)|tidy|clean up)\b/i;
function wantsDeepNotes(q) { if (!DEEP_RE.test(q) && !(NOTES_ASK.test(q) && !NOT_DEEP.test(q))) return false; try { const fr = activeFrame(); return !!(fr && fr.contentWindow.OIAI); } catch { return false; } }
// The model stream sometimes ends before it has written anything (a dropped connection, or the reply budget spent on thinking): ask again.
async function askRetry(msgs, opts, tries = 3) {
  let reply = '';
  for (let k = 0; k < tries && !reply.trim(); k++) { if (opts.signal && opts.signal.aborted) break; reply = await askAI(msgs, opts); }
  return reply;
}
// Marks a written quiz answer for the quiz screen in oneIdea: it reads the meaning, so any wording that says the same thing counts.
async function gradeAnswer(question, expected, given) {
  const reply = await askRetry([{ role: 'system', content: 'You are a fair, encouraging exam marker. Compare the student answer with the model answer. Accept different wording, order and examples when the meaning matches; be strict about wrong facts and about missing key points. Reply with ONLY JSON, no other text: {"verdict":"correct" or "partial" or "wrong","feedback":"one or two plain sentences: what was right, what was missing or wrong, and the key point to remember"}' }, { role: 'user', content: `Question: ${String(question).slice(0, 600)}\nModel answer: ${String(expected).slice(0, 900)}\nStudent answer: ${String(given).slice(0, 1200)}` }], {}, 1);
  let j = null; try { j = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)); } catch {}
  if (!j || !j.verdict) throw new Error('no verdict');
  const v = String(j.verdict).toLowerCase(), fb = String(j.feedback || '').trim().slice(0, 400);
  return { ok: v === 'correct', feedback: v === 'partial' ? ('Partly right. ' + fb) : fb };
}
const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal && signal.aborted) return rej(Object.assign(new Error('stopped'), { name: 'AbortError' }));
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('stopped'), { name: 'AbortError' })); }, { once: true });
});
// Like askRetry, but when the server says "too many requests" it waits for the limit to reset and carries on
// (a whole textbook is a few hundred requests, so hitting the limit is normal there, not an error).
async function askPatient(msgs, opts, tries, wait) {
  for (let waits = 0; ; waits++) {
    try { return await askRetry(msgs, opts, tries); }
    catch (err) {
      if (err && err.name === 'AbortError') throw err;
      if (!/too many|rate limit|429/i.test((err && err.message) || '') || waits >= 16) throw err;
      for (let s = 60; s > 0; s -= 5) { if (wait) wait(s); await sleep(5000, opts && opts.signal); }
    }
  }
}

const CHUNK = 30000;     // characters of source sent with one request
const BOOK_MIN = 70000;  // more source than this is treated as a book: one section per chapter
const stripPages = t => String(t || '').replace(/^\[Page \d+\]\n?/gm, '');
function chunkOf(full) {
  const chunks = [];
  for (let at = 0; at < full.length;) {
    let end = Math.min(full.length, at + CHUNK);
    if (end < full.length) { const cut = full.lastIndexOf('\n', end); if (cut > at + CHUNK * .6) end = cut; }
    chunks.push(full.slice(at, end)); at = end;
  }
  return chunks;
}
// Cuts a textbook into chapters. Lines like "Chapter 4", "Chapter 4: Cell Biology", "Unit 2" start one; the table of contents (tiny
// pieces) folds into the first real chapter. With no such headings the text is cut into equal parts instead.
const NUMW = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty';
const CH_RE = new RegExp('^\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?(chapter|unit|module|lesson)\\s+(\\d{1,3}|[ivxl]{1,6}|' + NUMW + ')\\b\\s*[:.\\-–—)]*\\s*(.{0,90})$', 'i');
function splitChapters(raw) {
  const lines = raw.split('\n'), marks = []; let off = 0;
  lines.forEach((ln, i) => {
    const m = CH_RE.exec(ln), len = ln.length + 1;
    if (m && !(/[.!?,;]$/.test(ln.trim()) && ln.trim().length > 40) && ln.trim().length <= 110) {
      let name = ln.trim().replace(/^#+\s*/, '').replace(/\*+/g, '');
      if (!m[3].trim()) { for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) { const nx = lines[j].trim(); if (nx) { if (nx.length <= 90 && !CH_RE.test(nx)) name += ': ' + nx; break; } } }
      name = name.replace(/\s+/g, ' ').slice(0, 70);
      const key = name.toLowerCase();
      if (!marks.length || marks[marks.length - 1].key !== key) marks.push({ name, key, start: off });
    }
    off += len;
  });
  let segs = marks.map((mk, i) => ({ name: mk.name, start: mk.start, end: i + 1 < marks.length ? marks[i + 1].start : raw.length }));
  // tiny pieces (the table of contents, running page headers) join the piece after them
  for (let i = 0; i < segs.length - 1;) { if (segs[i].end - segs[i].start < 3000) { segs[i + 1].start = segs[i].start; segs.splice(i, 1); } else i++; }
  if (segs.length > 1 && segs[segs.length - 1].end - segs[segs.length - 1].start < 3000) { segs[segs.length - 2].end = segs[segs.length - 1].end; segs.pop(); }
  if (segs.length >= 2) {
    if (segs[0].start >= 8000) segs.unshift({ name: 'Introduction', start: 0, end: segs[0].start }); else segs[0].start = 0;
    return segs.slice(0, 40).map(g => ({ name: g.name, text: raw.slice(g.start, g.end) }));
  }
  const n = Math.max(2, Math.ceil(raw.length / 60000)), size = Math.ceil(raw.length / n), out = [];
  for (let i = 0; i < n; i++) { let a = i * size, b = Math.min(raw.length, a + size); if (b < raw.length) { const cut = raw.indexOf('\n', b); if (cut > 0 && cut < b + 3000) b = cut; } out.push({ name: 'Part ' + (i + 1), text: raw.slice(a, b) }); }
  return out;
}

/* The writing engine: plan the sections of every chunk of the source, write them (two per request, two requests at a time), and hand each
   finished section to o.onPage in order. Used for one chapter or topic (runDeep) and once per chapter of a textbook (runBook). */
async function deepWrite(o) {
  const { instruction, chunks, sys, signal, label } = o;
  const wrap = (text, body) => body ? `${text}\n\n<<one:${label}>>\n${body}\n<</one>>` : text;
  const ask = (text, tries) => askPatient([{ role: 'system', content: sys }, { role: 'user', content: text }], { signal }, tries, o.wait);
  const nCh = Math.max(1, chunks.length), per = chunks.length ? Math.max(3, Math.min(o.maxPer || 8, Math.ceil(o.wantSecs / nCh))) : 7;
  const planOne = async k => {
    const part = nCh > 1 ? ` This is part ${k + 1} of ${nCh} of the material, so plan only what is in this part.` : '';
    const reply = await ask(wrap(`${instruction}\n\nFirst plan the notes.${part} Reply with ONLY JSON and no other text: {"title":"short title for the whole set","sections":[{"title":"short section title","covers":"one or two sentences listing exactly which topics, terms, facts and examples this section must cover"}]}. Use ${chunks.length ? per : '6 to 8'} sections that together cover EVERYTHING${chunks.length ? ' in the material, leaving nothing out' : ' a student needs on this topic'}, in a sensible teaching order.`, chunks[k] || ''));
    let pl = null; try { const i = reply.indexOf('{'), z = reply.lastIndexOf('}'); pl = JSON.parse(reply.slice(i, z + 1)); } catch {}
    return pl;
  };
  const plans = []; for (let k = 0; k < nCh; k += 2) { const got = await Promise.all([planOne(k), k + 1 < nCh ? planOne(k + 1) : null]); plans.push(...got.filter((_, j) => k + j < nCh)); }
  const sections = [], cap = o.maxSections || 16;
  plans.forEach((pl, k) => { if (pl && Array.isArray(pl.sections)) pl.sections.forEach(x => { const t = String(x && x.title || '').trim().slice(0, 80); if (t && sections.length < cap) sections.push({ title: t, covers: String(x.covers || '').trim().slice(0, 300), ch: k }); }); });
  if (sections.length < 2) throw new Error('could not plan the notes. Please try again.');
  const plan = plans.find(Boolean), setTitle = String((plan && plan.title) || o.title || 'Notes').trim().slice(0, 80), n = sections.length;
  const outline = sections.map((x, i) => `${i + 1}. ${x.title}`).join('; ');
  const need = chunks.length ? Math.max(500, Math.min(900, Math.round(CHUNK / 6 / per * .6))) : 600;
  const results = new Array(n).fill(null), texts = []; let nextJob = 0, applied = 0, finished = 0;
  const apply = () => {
    while (applied < n && results[applied] !== null) {
      const sec = sections[applied], text = results[applied]; applied++;
      if (text) { texts.push(text); try { o.onPage(text, sec.title); } catch (err) { console.error(err); } }
    }
  };
  const progress = () => { if (o.progress) o.progress(finished, n); };
  progress();
  const groups = []; for (let i = 0; i < n;) { let j = i + 1; if (j < n && sections[j].ch === sections[i].ch) j++; groups.push([i, j]); i = j; }
  const worker = async () => {
    while (nextJob < groups.length && !signal.aborted) {
      const [from, to] = groups[nextJob++], part = [];
      for (let i = from; i < to; i++) part.push(`part ${i + 1}, "${sections[i].title}", which must cover: ${sections[i].covers || sections[i].title}`);
      const body = chunks[sections[from].ch] || '';
      const reply = await ask(wrap(`${instruction}\n\nYou are writing a set of notes called "${setTitle}". The parts are: ${outline}. Write ONLY ${to - from > 1 ? 'these ' + (to - from) + ' parts' : 'this part'}: ${part.join('; ')}. Write each part as its own <<notes title="the part title">> block, very thorough (at least ${need} words each, never a short summary) and following the study notes rules, with no other blocks. Include every definition, fact, formula, date, name and example from the material that belongs to the part, explained properly, and draw a [diagram] line for any process, cycle or timeline in it. The other parts are written separately, so do not repeat them.`, body));
      const blocks = parseMakes(reply).filter(b => b.kind === 'notes');
      for (let i = from; i < to; i++) {
        const byTitle = blocks.find(b => sameTitle(b.title, sections[i].title)), mk = byTitle || blocks[i - from];
        results[i] = ((mk ? mk.text : (blocks.length || PH_T.test(reply) ? '' : shown(reply))) || '').trim();
        // a part that came back thin is written again on its own (once), keeping whichever version is longer
        if (results[i].split(/\s+/).length < Math.round(need * .6) && !signal.aborted) {
          try {
            const one = await ask(wrap(`${instruction}\n\nYou are writing a set of notes called "${setTitle}". The parts are: ${outline}. Write ONLY part ${i + 1}, "${sections[i].title}", which must cover: ${sections[i].covers || sections[i].title}. This part must be long and detailed: at least ${need} words, covering every point of the material for it, with definitions, examples and key terms, in one <<notes title="${sections[i].title}">> block and no other blocks.`, body), 1);
            const b2 = parseMakes(one).filter(b => b.kind === 'notes')[0], t2 = ((b2 ? b2.text : '') || '').trim();
            if (t2.split(/\s+/).length > results[i].split(/\s+/).length) results[i] = t2;
          } catch (err) { if (err && err.name === 'AbortError') throw err; }
        }
        finished++;
      }
      apply(); progress();
    }
  };
  await Promise.all([worker(), worker()]);
  if (signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' });
  apply();
  return { setTitle, sections, texts };
}
// Background research for notes that have little to start from: a few short searches, then the plain text of the best Wikipedia articles.
// Only the short search words leave the browser, never the notes themselves.
async function researchText(instruction, hint, sample, signal, say) {
  let queries = [];
  try {
    const r = await askRetry([{ role: 'system', content: 'You help a student research a topic. Reply with ONLY JSON, no other text.' }, { role: 'user', content: `The student asked: "${instruction.slice(0, 300)}"\nTopic hint: ${hint.slice(0, 120)}\nStart of their notes: ${sample.slice(0, 1200)}\n\nGive 4 short, specific search queries (2 to 5 words each) that would find encyclopedia articles covering this topic and its main sub-topics. Reply as {"queries":["...","..."]}` }], { signal }, 1);
    const j = JSON.parse(r.slice(r.indexOf('{'), r.lastIndexOf('}') + 1));
    queries = (j.queries || []).map(q => String(q).trim()).filter(Boolean);
  } catch (err) { if (err && err.name === 'AbortError') throw err; }
  if (!queries.length && hint) queries = [hint];
  const out = [], seen = new Set(); let total = 0;
  const api = 'https://en.wikipedia.org/w/api.php?format=json&origin=*&action=query&';
  for (const q of queries.slice(0, 4)) {
    if (signal.aborted || total > 50000) break;
    if (say) say(`Looking up "${q}" on Wikipedia...`);
    let hits = [];
    try { hits = (((await (await fetch(api + 'list=search&srlimit=2&srsearch=' + encodeURIComponent(q), { signal })).json()).query || {}).search) || []; } catch (err) { if (signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' }); continue; }
    for (const h of hits) {
      if (seen.has(h.pageid) || total > 50000) continue; seen.add(h.pageid);
      try {
        const pg = Object.values((((await (await fetch(api + 'prop=extracts&explaintext=1&exsectionformat=plain&pageids=' + h.pageid, { signal })).json()).query || {}).pages) || {})[0];
        const t = ((pg && pg.extract) || '').replace(/\n{3,}/g, '\n\n').trim();
        if (t.length > 500) { const piece = `# ${pg.title} (Wikipedia)\n${t.slice(0, 14000)}`; out.push(piece); total += piece.length; }
      } catch (err) { if (signal.aborted) throw Object.assign(new Error('stopped'), { name: 'AbortError' }); }
    }
  }
  return out.join('\n\n');
}
// One more request after the notes: a quiz written from them (multiple choice and written answers), saved in the notebook.
async function quizFromNotes(OI, texts, label, signal, wait, sys) {
  const blob = (texts || []).join('\n\n').slice(0, 30000); if (blob.length < 800) return null;
  const reply = await askPatient([{ role: 'system', content: sys }, { role: 'user', content: `Write a quiz of 14 questions from these notes, about 60 percent multiple choice and 40 percent written answer questions, covering every section. Reply with ONLY one <<mcq>> block.\n\n<<one:${label}>>\n${blob}\n<</one>>` }], { signal }, 1, wait);
  const mk = parseMakes(reply).filter(b => b.kind === 'mcq')[0]; if (!mk) return null;
  const u = OI.newMcq(mk.text); if (!u) return null;
  u.count = (/Added (\d+)/.exec(u.note || '') || [])[1] | 0; return u;
}
const planMap = (setTitle, sections) => `- ${setTitle}\n` + sections.map(x => `  - ${x.title}\n    > ${x.covers}`).join('\n');

// the text to write notes from: an attached file, the selection, or the whole open page
function notesSource(OI, c) {
  let full = attach ? attach.text : c.source === 'selection' ? c.text : '';
  if (!attach && c.source === 'document') { try { const o = OI.context({}); full = (o && o.text) || c.text || ''; } catch { full = c.text || ''; } }
  return { full: full.slice(0, 900000), label: (attach ? attach.title : c.source === 'selection' ? 'selection' : 'page').replace(/[<>\n]/g, ' ') };
}

async function runDeep(instruction) {
  let OI = null, frameWin = null;
  try { const fr = activeFrame(); frameWin = fr && fr.contentWindow; OI = frameWin && frameWin.OIAI; } catch {}
  if (!OI) return run(instruction);
  if (busy) busy.abort();
  const c = readContext(true);
  instruction = instruction.slice(0, 1500);
  const { full, label } = notesSource(OI, c);
  if (full.length >= BOOK_MIN) return runBook(instruction, full, label, OI, frameWin);
  let chunks = chunkOf(stripPages(full)), wantSecs = 5;
  const tag = attach ? attach.title : full ? 'document' : '';
  hist.push({ r: 'u', t: instruction, x: tag }); saveHist();
  addMsg('user', instruction, tag ? 'with ' + tag : '');
  lastAnswer = ''; ui.acts.style.display = 'none'; ui.send.disabled = true;
  const am = addMsg('ai', ''), th = makeThink(am.d, am.b);
  busy = new AbortController(); const mine = busy;
  const undos = [], titles = [], extras = { maps: 0, diagrams: 0, questions: 0 }; let stored = false, anchor = null;
  const sys = SYSTEM + ' ' + IDEA_SYSTEM;
  const say = msg => { th.status(msg); am.b.textContent = msg + (titles.length ? '. Pages so far: ' + titles.join(', ') : '') + '.'; scrollLog(); };
  try {
    let source = full;
    if (full.length < 20000) {
      say('Looking for more information...');
      let hint = ''; try { hint = (frameWin.N.page() || {}).title || ''; } catch {}
      let found = ''; try { found = await researchText(instruction, hint, full, mine.signal, say); } catch (err) { if (err && err.name === 'AbortError') throw err; }
      if (found) source = full + (full ? '\n\n' : '') + '=== Background from Wikipedia: use it to add accurate detail, definitions, examples and facts ===\n' + found;
    }
    chunks = chunkOf(stripPages(source)); wantSecs = Math.max(5, Math.min(14, Math.round(source.length / 6 / 600)));
    say('Planning the notes...');
    const r = await deepWrite({
      instruction, chunks, sys, signal: mine.signal, label, wantSecs, title: 'Notes',
      wait: s => say(`The AI's request limit was reached. Continuing in ${s}s`),
      progress: (f, n) => say(`Writing the notes: ${f} of ${n} sections done`),
      onPage: (text, title) => { let u = null; try { OI.lastError = ''; u = OI.newNotes(text, title, { inline: mdInline, flat: true, map: true, after: anchor }); } catch (err) { console.error(err); } if (u) { anchor = u.lastId || anchor; undos.push(u); titles.push(title); extras.maps += u.maps || 0; extras.diagrams += u.diagrams || 0; } },
    });
    // a mind map of the plan, so the whole set can be seen at a glance
    try { const u = OI.newMap(planMap(r.setTitle, r.sections), r.setTitle, { flat: true, after: anchor }); if (u) undos.push(u); } catch (err) { console.error(err); }
    // and a quiz written from these notes (marked written answers included)
    say('Writing a quiz from the notes...');
    try { const u = await quizFromNotes(OI, r.texts, label, mine.signal, s => say(`The AI's request limit was reached. Continuing in ${s}s`), sys); if (u) { undos.push(u); extras.questions += u.count || 0; } } catch (err) { if (err && err.name === 'AbortError') throw err; }
    th.box.hidden = true;
    const bits = [`${titles.length} notes pages`, extras.maps ? `${extras.maps} mind maps` : '', extras.diagrams ? `${extras.diagrams} diagrams` : '', extras.questions ? `a ${extras.questions} question quiz` : ''].filter(Boolean);
    const summary = `Wrote ${bits.join(', ')}: ${titles.join(', ')}.`;
    const missing = r.sections.length - titles.length;
    const warn = missing > 0 ? ` ${missing} of the ${r.sections.length} planned sections could not be written because the AI connection dropped. Run "Make study notes" again to try the rest.` : '';
    am.b.textContent = titles.length ? summary + ' I also added a mind map of the whole set.' + warn : 'Nothing could be written. Please try again.';
    hist.push({ r: 'a', t: summary + warn }); saveHist(); stored = true;
    if (undos.length) doneBar(am, undos, `Added ${bits.join(', ')}.` + (missing > 0 ? ` (${missing} sections missing)` : ''), frameWin, 'section');
  } catch (err) {
    if (!stored) { hist.pop(); saveHist(); }
    if (err.name === 'AbortError') { am.d.remove(); }
    else { am.d.classList.add('err'); th.box.hidden = true; am.b.textContent = (titles.length ? `Stopped after ${titles.length} pages: ` : 'Couldn\'t write the notes: ') + err.message; }
  } finally {
    if (busy === mine) busy = null;
    ui.send.disabled = false; scrollLog(); refresh();
  }
}
// "Undo all / Flashcards / Take a quiz" under a finished set of notes
function doneBar(am, undos, text, frameWin, scope) {
  const bar = document.createElement('div'); bar.className = 'oai-applied';
  bar.innerHTML = '<span class="ms" aria-hidden="true">check_circle</span><span>' + esc(text) + '</span>';
  const extra = [];
  const u = document.createElement('button'); u.type = 'button'; u.textContent = 'Undo all';
  u.onclick = () => { try { undos.slice().reverse().forEach(f => f()); u.disabled = true; u.textContent = 'Undone'; extra.forEach(x => { x.disabled = true; }); toast('Undone.'); } catch { toast('Use Ctrl+Z in the document to undo.'); } };
  bar.append(u);
  [['Flashcards', () => frameWin.ST.open(scope)], ['Take a quiz', () => frameWin.QZ.open({ scope })]].forEach(([label, fn]) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = label; x.onclick = () => { try { fn(); } catch (err) { console.error(err); } }; extra.push(x); bar.append(x); });
  am.d.append(bar);
}

// A textbook: find the chapters, let the user pick which to do, then write every chapter as its own section of the notebook.
async function runBook(instruction, full, label, OI, frameWin) {
  const text = stripPages(full), chapters = splitChapters(text);
  const tag = attach ? attach.title : 'document';
  hist.push({ r: 'u', t: instruction, x: tag }); saveHist();
  addMsg('user', instruction, 'with ' + tag);
  lastAnswer = ''; ui.acts.style.display = 'none'; ui.send.disabled = true;
  const am = addMsg('ai', ''), th = makeThink(am.d, am.b); th.box.hidden = true;
  const have = new Set(); try { frameWin.N.nb.sections.forEach(s => have.add(s.name.toLowerCase())); } catch {}
  const info = chapters.map(ch => { const chunks = chunkOf(ch.text), words = Math.round(ch.text.length / 6), per = Math.max(3, Math.min(6, Math.ceil(Math.max(5, Math.min(24, Math.round(words / 600))) / chunks.length))); return { ch, chunks, words, req: chunks.length * (1 + Math.ceil(per / 2)) }; });
  // 1. ask which chapters
  const picked = await new Promise(resolve => {
    const totalWords = info.reduce((a, x) => a + x.words, 0);
    am.b.textContent = `This looks like a book: about ${totalWords.toLocaleString()} words in ${chapters.length} chapters. Each chapter becomes its own section of your notebook, written in detail one after another. Tick the chapters to do.`;
    const box = document.createElement('div'); box.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin:8px 0;max-height:240px;overflow:auto;font-size:13px';
    const checks = info.map((x, i) => {
      const done = have.has(x.ch.name.toLowerCase());
      const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !done; l.append(cb);
      const sp = document.createElement('span'); sp.textContent = `${x.ch.name} (${x.words.toLocaleString()} words)${done ? ' - already in your notebook' : ''}`; l.append(sp); box.append(l); return cb;
    });
    const est = document.createElement('small'); const upd = () => { const sel = info.filter((_, i) => checks[i].checked), req = sel.reduce((a, x) => a + x.req, 0); est.textContent = sel.length ? `About ${req} AI requests, roughly ${Math.max(1, Math.round(req * 40 / 60 / 2))} minutes. You can keep using oneIdea while it works.` : 'Pick at least one chapter.'; go.disabled = !sel.length; };
    const row = document.createElement('div'); row.className = 'oai-applied';
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Start';
    const no = document.createElement('button'); no.type = 'button'; no.textContent = 'Cancel';
    go.onclick = () => { box.remove(); row.remove(); est.remove(); resolve(info.filter((_, i) => checks[i].checked)); };
    no.onclick = () => { box.remove(); row.remove(); est.remove(); resolve(null); };
    checks.forEach(cb => { cb.onchange = upd; });
    row.append(go, no); am.d.append(box, est, row); upd(); scrollLog();
  });
  if (!picked) { hist.pop(); saveHist(); am.d.remove(); ui.send.disabled = false; refresh(); return; }
  // 2. write them
  if (busy) busy.abort();
  busy = new AbortController(); const mine = busy;
  const handles = [], done = [], failed = []; let pages = 0, maps = 0, dgs = 0, qs = 0, stored = false;
  const stopRow = document.createElement('div'); stopRow.className = 'oai-applied'; const stopB = document.createElement('button'); stopB.type = 'button'; stopB.textContent = 'Stop'; stopB.onclick = () => mine.abort(); stopRow.append(stopB); am.d.append(stopRow);
  const sys = SYSTEM + ' ' + IDEA_SYSTEM;
  let where = '';
  const say = msg => { am.b.textContent = (where ? where + '\n' : '') + msg + (done.length ? `\nDone: ${done.join(', ')}` : ''); scrollLog(); };
  try {
    for (let ci = 0; ci < picked.length; ci++) {
      const x = picked[ci]; where = `Chapter ${ci + 1} of ${picked.length}: ${x.ch.name}`;
      say('Planning...');
      const h = OI.newSection(x.ch.name); if (!h) throw new Error('could not add a section to the notebook.');
      handles.push(h); let n = 0, anchor = null;
      try {
        const words = x.words, r = await deepWrite({
          instruction, chunks: x.chunks, sys, signal: mine.signal, label: x.ch.name, title: x.ch.name, maxPer: 6, maxSections: 30,
          wantSecs: Math.max(5, Math.min(24, Math.round(words / 600))),
          wait: s => say(`The AI's request limit was reached. Continuing in ${s}s`),
          progress: (f, tot) => say(`Writing: ${f} of ${tot} sections`),
          onPage: (t, title) => { let u = null; try { OI.lastError = ''; u = OI.newNotes(t, title, { inline: mdInline, flat: true, map: true, after: anchor }); } catch (err) { console.error(err); } if (u) { anchor = u.lastId || anchor; n++; pages++; maps += u.maps || 0; dgs += u.diagrams || 0; } },
        });
        try { OI.newMap(planMap(x.ch.name, r.sections), x.ch.name + ' map', { flat: true, after: anchor }); } catch (err) { console.error(err); }
        try { say('Writing a quiz for the chapter...'); const q = await quizFromNotes(OI, r.texts, x.ch.name, mine.signal, s => say(`The AI's request limit was reached. Continuing in ${s}s`), sys); if (q) qs += q.count || 0; } catch (err) { if (err && err.name === 'AbortError') throw err; }
        h.finish(); done.push(x.ch.name);
      } catch (err) {
        h.finish();
        if (err && err.name === 'AbortError') throw err;
        failed.push(x.ch.name + (err && err.message ? ' (' + err.message + ')' : ''));
        if (failed.length >= 3 && !done.length) throw new Error(failed[failed.length - 1]);
      }
    }
    const summary = `Wrote ${pages} pages of notes${maps ? ', ' + maps + ' mind maps' : ''}${dgs ? ', ' + dgs + ' diagrams' : ''}${qs ? ' and ' + qs + ' quiz questions' : ''} in ${done.length} chapter${done.length === 1 ? '' : 's'}.` + (failed.length ? ` Not finished: ${failed.join('; ')}. Ask again to redo those.` : '');
    am.b.textContent = summary; hist.push({ r: 'a', t: summary }); saveHist(); stored = true;
    if (handles.length) doneBar(am, handles.map(h => h.undo), `Added ${done.length} chapters (${pages} pages, ${maps} mind maps, ${qs} quiz questions).`, frameWin, 'notebook');
  } catch (err) {
    if (!stored) { hist.pop(); saveHist(); }
    am.d.classList.toggle('err', !(err && err.name === 'AbortError'));
    am.b.textContent = (err && err.name === 'AbortError' ? 'Stopped. ' : 'Couldn\'t finish: ' + ((err && err.message) || '') + ' ') + (done.length ? `${done.length} chapters were written and are kept: ${done.join(', ')}.` : 'Nothing was kept.');
    if (handles.length) doneBar(am, handles.map(h => h.undo), 'Written so far is kept in your notebook.', frameWin, 'notebook');
  } finally {
    stopRow.remove();
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
  window.oneAIGrade = gradeAnswer;
  if (fab) return syncFab();
  build();
  const frames = $('#frames');
  if (frames) new MutationObserver(syncFab).observe(frames, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
  syncFab();
}
function disable() {
  try { delete window.oneAIGrade; } catch {}
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
