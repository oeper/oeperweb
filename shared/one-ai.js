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

import { aiFeaturesEnabled, onAiFeaturesChange, askAI } from '/shared/ai-features.js?v=2';
import { readFileForAI, isImage } from '/shared/ai-files.js?v=1';

const MAX_CONTEXT_CHARS = 12000;
const ACTIONS = [
  { label: 'Improve writing', instr: 'Improve the writing: clearer, tighter, better flow. Keep the meaning, tone and language.' },
  { label: 'Fix spelling & grammar', instr: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
  { label: 'Make shorter', instr: 'Rewrite this to about half its length, keeping the key points.' },
  { label: 'Expand', instr: 'Expand this with more detail and examples, keeping the tone.' },
  { label: 'Summarize', instr: 'Summarize this in one short paragraph.' },
  { label: 'Continue writing', instr: 'Continue writing from where this text stops, matching its style. Write only the continuation.' },
  { label: 'Make a mind map', instr: 'Turn this into a clear mind map.', only: 'build' },
  { label: 'Make study notes', instr: 'Turn this into well organized study notes, and also make a mind map of it.', only: 'build' },
  { label: 'Improve this map', instr: 'Improve this mind map: balance the branches, tighten the wording and add any important sub-topics that are missing. Return the complete updated map.', only: 'map' },
];
const SYSTEM = 'You are epic AI, an assistant built into the one office suite, helping with the user\'s document. Do exactly what the instruction says. ' +
  'You can change the document directly. When the user asks you to rewrite, fix, shorten, expand, translate, reformat or otherwise change their text, put ONLY the new text between <<edit>> and <</edit>>. It replaces the selected text, or the whole document when nothing is selected, so include everything that should remain. ' +
  'When they ask you to continue or add more, put ONLY the new text between <<append>> and <</append>>. It is added after the selection, or at the end. Inside those tags use no quotation marks, no code fences, and simple markdown (# headings, - bullets, **bold**) only if the text already has that structure. ' +
  'You may add one short sentence before or after the tags, such as what you changed. When the user asks a question or wants an explanation or summary, answer it clearly and briefly WITHOUT any tags. This is an ongoing conversation, so use the earlier messages as context.';

const IDEA_SYSTEM = 'The user is in oneIdea, a note-taking app with real mind maps and free-form notes pages. You can build them directly, so do NOT dump a long plain list into a text answer when a map or structured notes would serve better. ' +
  'MIND MAP: put an indented outline between <<map title="Short title">> and <</map>>. Use "- " bullets with two spaces of indent per level. Aim for 3 to 7 main branches with 2 to 5 sub-topics each, going one or two levels deeper only where it helps. Keep every topic short (1 to 6 words, never a full sentence). A longer explanation goes on its own line directly under its topic, starting with "> " (it becomes that topic\'s note). Prefix a topic with [important], [question], [definition], [idea] or [ ] (a to-do) only when it really fits. ' +
  'The page that is open is shown to you as an outline in this same format. If it is a mind map and the user wants it changed, expanded or reorganized, put the COMPLETE updated outline between <<mapedit>> and <</mapedit>> instead. ' +
  'STUDY NOTES: put markdown between <<notes title="Short title">> and <</notes>>. Every "## Heading" becomes its own box on the page, so group the material under 3 to 6 meaningful headings (for example Overview, Key terms, How it works, Examples, Summary). Under them use short bullets (indent two spaces for sub-points), a table when comparing things, "Term :: meaning" lines for definitions (they become flashcards), "[ ] task" lines for to-dos, and "[important] ..." or "[question] ..." lines for key points and open questions. Never write one huge block of bullets. ' +
  'CHOOSING: requests for a mind map, map, overview, brainstorm or how things connect get <<map>>. Requests for notes, a study guide, a summary in notes form or to organize something get <<notes>>. Write only the kind of block that was asked for, except that a request to make notes from a text, PDF or topic gets BOTH a <<notes>> block and a <<map>> block in the same reply. Use plain text only inside blocks: no LaTeX (write -> for arrows) and no em dashes. After the blocks, write one short sentence saying what you made.';
const systemFor = c => SYSTEM + (c.build ? ' ' + IDEA_SYSTEM : '');

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
function readContext() {
  const c = readContextCore(), f = activeFrame();
  let w = null;
  try { w = f && f.contentWindow; } catch {}
  c.build = !!(w && w.OIAI);
  if (c.build && c.source !== 'selection') {
    // oneIdea: show the AI the whole open page (or map) as an outline, and never treat one note box as "the document".
    try { const o = w.OIAI.context(); if (o) { c.idea = o.kind; c.editable = null; if (o.text) { c.text = o.text.slice(0, MAX_CONTEXT_CHARS); c.source = 'document'; } else c.source = 'none'; } } catch {}
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
  } else if (!lastSel.text || !d.contains(lastSel.editable)) {
    lastSel = { text: '', range: null, editable };
  }
  const app = f.title || 'this app';
  if (lastSel.text) return { app, text: lastSel.text.slice(0, MAX_CONTEXT_CHARS), source: 'selection', editable: lastSel.editable };
  if (editable && (editable.innerText || '').trim()) return { app, text: editable.innerText.trim().slice(0, MAX_CONTEXT_CHARS), source: 'document', editable };
  return { app, text: '', source: 'none', editable };
}

// tiny markdown -> HTML for inserting into a document
function mdToHtml(md) {
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push('<ul>' + list.map(i => `<li>${inline(i)}</li>`).join('') + '</ul>'); list = null; } };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { (list = list || []).push(m[1]); continue; }
    flush();
    if (!line.trim()) continue;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
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
  @media(max-width:560px){.oai-fab span:not(.ms){display:none}.oai-fab{padding:0 16px;bottom:16px;right:16px}}`;
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
  ui.chips.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b && !ui.send.disabled) run(ACTIONS[b.dataset.i].instr); });
  $('#oaiClose').onclick = closePanel;
  $('#oaiNew').onclick = () => { if (busy) { busy.abort(); busy = null; } hist = []; saveHist(); renderHistory(); refresh(); ui.prompt.focus(); };
  $('#oaiClip').onclick = () => ui.fileIn.click();
  ui.fileIn.onchange = () => { const f = ui.fileIn.files[0]; ui.fileIn.value = ''; if (f) attachFile(f); };
  $('#oaiFileX').onclick = () => { attach = null; refresh(); };
  panel.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); panel.classList.add('drop'); } });
  panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop'); });
  panel.addEventListener('drop', e => { panel.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); attachFile(f); });
  ui.send.onclick = () => { const q = ui.prompt.value.trim(); if (q && !ui.send.disabled) { ui.prompt.value = ''; run(q); } };
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
    : c.source === 'document' && c.build ? `Reading this ${c.idea === 'map' ? 'mind map' : 'page'}. Select some text to focus on part of it.`
    : c.source === 'document' ? 'Working on the whole document — select some text to focus on part of it.'
    : 'No text to work on here — you can still ask epic AI anything.';
  if (attach) ui.ctx.textContent += ' The attached file is included too.';
  ui.file.hidden = !attach;
  if (attach) ui.fileName.textContent = attach.title + (attach.note ? ' (' + attach.note + ')' : '');
  const canEdit = !!c.editable;
  ui.chips.querySelectorAll('button').forEach(b => {
    const only = ACTIONS[b.dataset.i].only;
    b.hidden = only === 'build' ? !c.build : only === 'map' ? c.idea !== 'map' : (c.build && c.source !== 'selection');
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
const MAKE_RE = /<<(map|mapedit|notes)(?:\s[^>]*)?>>[\s\S]*?(?:<<\/\1>>|$)/g;
const shown = t => String(t || '').replace(MAKE_RE, '').replace(TAG_RE, '');
function parseMakes(reply) {
  const out = [], re = /<<(map|mapedit|notes)((?:\s[^>]*)?)>>([\s\S]*?)(?:<<\/\1>>|$)/g;
  let m;
  while ((m = re.exec(reply || ''))) {
    const text = m[3].replace(/^\n+|\n+$/g, ''); if (!text.trim()) continue;
    const t = /title\s*=\s*"([^"]*)"/.exec(m[2]);
    out.push({ kind: m[1], title: t ? t[1] : '', text });
  }
  return out;
}
// Pulls the <<edit>> / <<append>> block out of a reply. A block that never got its closing tag (the stream was cut) still counts.
function parseEdit(reply) {
  const m = /<<(edit|append)>>([\s\S]*?)(?:<<\/\1>>|$)/.exec(reply || '');
  if (!m) return null;
  const text = m[2].replace(/^\n+|\n+$/g, '');
  if (!text.trim()) return null;
  return { kind: m[1], text, said: shown((reply.slice(0, m.index) + ' ' + reply.slice(m.index + m[0].length)).replace(/\s+/g, ' ')).trim() };
}

// What a saved answer looks like when the chat is reopened: an applied edit shows as its one-line note, not the whole new text.
const saved = t => {
  const e = parseEdit(t), mk = parseMakes(t), said = shown(t).replace(/\s+/g, ' ').trim();
  if (e) return e.said || (e.kind === 'append' ? 'Added to the document.' : 'Edited the document.');
  if (mk.length) return said || 'Made ' + mk.map(b => b.kind === 'notes' ? 'a notes page' : 'a mind map').join(' and ') + '.';
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
  lastAnswer = lastA ? (parseEdit(lastA.t) || { text: shown(lastA.t) }).text : '';
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
  const c = readContext();
  const wantsCtx = c.source !== 'none';
  const appLabel = c.build ? c.app + (c.source === 'selection' ? ' selection' : c.idea === 'map' ? ' mind map (outline)' : ' page (outline)') : c.app;
  let userMsg = wantsCtx ? `${instruction}\n\n<<one:${appLabel.replace(/[<>\n]/g, ' ')}>>\n${c.text}\n<</one>>` : instruction;
  if (attach) userMsg += `\n\n<<one:${attach.title.replace(/[<>\n]/g, ' ')}>>\n${attach.text}\n<</one>>`;
  const tag = [c.source === 'selection' ? 'selection' : c.source === 'document' ? 'document' : '', attach ? attach.title : ''].filter(Boolean).join(' + ');
  // Earlier turns go back to the model as plain text (the document text is only attached to the newest question, to keep requests small).
  const prior = hist.slice(-12).map(m => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }));
  hist.push({ r: 'u', t: instruction, x: tag }); saveHist();
  addMsg('user', instruction, tag ? 'with ' + tag : '');
  lastAnswer = '';
  ui.acts.style.display = 'none';
  ui.send.disabled = true;
  const runRange = c.source === 'selection' && lastSel.range ? lastSel.range.cloneRange() : null, canEdit = !!c.editable;
  const am = addMsg('ai', ''), th = makeThink(am.d, am.b);
  const t0 = Date.now(); let answering = false, sawThought = false, ok = false;
  busy = new AbortController();
  const mine = busy;
  try {
    const reply = await askAI([{ role: 'system', content: systemFor(c) }, ...prior, { role: 'user', content: userMsg }], {
      signal: mine.signal,
      onThinking: t => { if (answering) return; sawThought = true; th.thought(t); },
      onStatus: st => { if (!answering) th.status(st); },
      onText: t => {
        if (!answering && t) { answering = true; th.answered(sawThought, Math.max(1, Math.round((Date.now() - t0) / 1000))); }
        am.b.textContent = shown(t) || (/<<(map|mapedit)/.test(t) ? 'Building the mind map...' : /<<notes/.test(t) ? 'Writing the notes...' : ''); scrollLog();
      },
    });
    const final = reply || '(no answer)';
    ok = true;
    if (!answering) th.answered(sawThought, Math.max(1, Math.round((Date.now() - t0) / 1000)));
    hist.push({ r: 'a', t: final }); saveHist();
    // If the model wrote an edit, put it into the document straight away (and offer Undo) instead of making the user copy it over.
    const ed = parseEdit(reply), makes = c.build ? parseMakes(reply) : [];
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
    // oneIdea: build real mind maps and notes pages
    let OI = null;
    try { const fr = activeFrame(); OI = fr && fr.contentWindow.OIAI; } catch {}
    if (OI) makes.forEach(blk => {
      let u = null, w = '';
      try {
        if (blk.kind === 'mapedit' && (u = OI.setMap(blk.text))) w = 'Updated your mind map.';
        else if (blk.kind === 'notes') { u = OI.newNotes(blk.text, blk.title); w = 'Made a notes page.'; }
        else { u = OI.newMap(blk.text, blk.title); w = 'Made a mind map.'; }
      } catch (err) { console.error(err); }
      if (u) { undos.push(u); notes.push(w); }
    });
    const said = (ed && ed.said) || shown(reply).replace(/\s+/g, ' ').trim();
    if (undos.length) {
      const where = notes.join(' ');
      am.b.textContent = said || where;
      const bar = document.createElement('div'); bar.className = 'oai-applied';
      bar.innerHTML = '<span class="ms" aria-hidden="true">check_circle</span><span>' + esc(where) + '</span>';
      const u = document.createElement('button'); u.type = 'button'; u.textContent = 'Undo';
      u.onclick = () => { try { undos.slice().reverse().forEach(f => f()); u.disabled = true; u.textContent = 'Undone'; toast('Undone.'); } catch { toast('Use Ctrl+Z in the document to undo.'); } };
      bar.append(u); am.d.append(bar);
      lastAnswer = '';
    } else {
      am.b.textContent = shown(final) || makes.map(blk => blk.text).join('\n\n');
      if ((ed && canEdit) || makes.length) { const n = document.createElement('small'); n.textContent = makes.length ? 'Couldn\'t build this here. You can copy it instead.' : 'Couldn\'t apply this automatically. Use the buttons below.'; am.d.append(n); }
      lastAnswer = ed ? ed.text : makes.length ? makes[0].text : reply;
    }
  } catch (err) {
    hist.pop(); saveHist(); // the question never got an answer: don't keep it as a dangling turn
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

function start() {
  if (aiFeaturesEnabled()) enable();
  onAiFeaturesChange(on => (on ? enable() : disable()));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
