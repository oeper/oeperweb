// epic AI's memory file: a short markdown profile of the signed-in person (aiMemory/{email}.profile), kept by the model
// through the update_profile tool and readable / editable by the person themselves. Pure functions only, no DOM or Firebase,
// so the website and the desktop app can share them (the desktop app has its own copy: desktop/epicai/app/ai-memory.js —
// keep the two identical; the Android app mirrors the same logic in Kotlin, see Memory in Chats.kt).

export const PROFILE_MAX = 6000;       // characters in the whole file
export const SECTION_MAX = 1200;       // characters in one section
export const PROMPT_MAX = 3000;        // how much of the file goes into a request
export const SECTIONS = ['About you', 'Interests', 'Preferences', 'Work & study', 'Goals & projects', 'People & places', 'How to help me'];

/** Splits the file into [{ title, body }] in order. Text before the first "## " heading is kept as a section with an empty title. */
export function parseProfile(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { cur = { title: m[1], lines: [] }; out.push(cur); continue; }
    if (!cur) { cur = { title: '', lines: [] }; out.push(cur); }
    cur.lines.push(line);
  }
  return out.map(s => ({ title: s.title, body: s.lines.join('\n').trim() })).filter(s => s.title || s.body);
}

export function buildProfile(sections) {
  return sections.filter(s => s.body || s.title).map(s => (s.title ? `## ${s.title}\n` : '') + s.body).join('\n\n').trim();
}

/** Replaces (or adds, or with empty content removes) one section. Keeps the file under PROFILE_MAX by cutting the new content. */
export function applySection(text, section, content) {
  const name = String(section || '').replace(/[#\n\r]/g, ' ').trim().slice(0, 40);
  if (!name) return String(text || '');
  const body = String(content || '').replace(/\r/g, '').trim().slice(0, SECTION_MAX);
  const sections = parseProfile(text);
  const i = sections.findIndex(s => s.title.toLowerCase() === name.toLowerCase());
  if (!body) { if (i >= 0) sections.splice(i, 1); }
  else if (i >= 0) sections[i] = { title: sections[i].title, body };
  else sections.push({ title: name, body });
  let out = buildProfile(sections);
  if (out.length > PROFILE_MAX) {
    const room = PROFILE_MAX - (out.length - body.length);
    if (room < 80) return String(text || '');   // the file is full: refuse rather than cut the person's own notes
    const j = sections.findIndex(s => s.title.toLowerCase() === name.toLowerCase());
    sections[j] = { title: sections[j].title, body: body.slice(0, room) };
    out = buildProfile(sections);
  }
  return out;
}

export function profileForPrompt(text) {
  const t = String(text || '').trim();
  return t.length > PROMPT_MAX ? t.slice(0, PROMPT_MAX) + '\n[… the rest of the file was left out …]' : t;
}

/** What goes into the system prompt about the memory file. [learn] is the person's "let epic AI learn about me" switch. */
export function profilePrompt(text, learn) {
  const file = profileForPrompt(text);
  let s = '\n\n';
  if (file) s += `Your memory file about this user. They can read and edit it themselves at any time, so whatever it says now is the truth, even if it differs from what you noted before. Use it naturally, the way someone who actually knows them would, and don't recite it back:\n<memory_file>\n${file}\n</memory_file>`;
  else s += 'Your memory file about this user is still empty.';
  if (!learn) return s + '\n\nThe user has switched learning off: do NOT call remember_fact, update_memory or update_profile, and do not ask questions meant to learn about them. Only use what is written above.';
  return s + `

Getting to know them: you are meant to learn who this person is, so that you can help them better every time. Keep the memory file with the update_profile tool (sections such as ${SECTIONS.join(', ')}; the content you send replaces that whole section, so merge what is already there with what you just learned; use "- " bullets). File anything LASTING (who they are, what they study or do, what they like, how they want answers, what they are working towards), not details of one task. Do it quietly, without announcing it. When something changes or they correct you, update it straight away; if they ask you to forget something, remove it at once.
Filling the gaps: when the file is thin and the conversation is relaxed, you may finish an answer with ONE short, friendly question that helps you know them better (what they are studying, what they are working on, how they like explanations), at most once every few messages, never while they are busy with a task, stressed or in a hurry, and never as a list of questions. Skip it when they are not signed in or the file is already rich.
Never ask for or store passwords, ID, card or bank numbers, an exact home address, health, religion, sexuality or political views, or private details about other people. If they volunteer something sensitive, only note it when it clearly helps them and they would want it kept.`;
}

export const GET_TO_KNOW = 'Please get to know me. Ask me a few short questions, one at a time (what I should call you, what I study or do, what I am into, how I like answers explained), wait for my answer each time, and fill in your memory file as we go. Start with the first question.';
