// What epic AI is told, and how a long chat is folded into a short summary (same idea as ai.html and the Android app).
import { askQuiet, urlToDataUrl } from './api.js';
import { profilePrompt } from './ai-memory.js';
import { recallPrompt } from './ai-recall.js';
import { DIAGRAM_PROMPT } from './ai-diagrams.js';

export const SYSTEM_PROMPT = `You are epic AI, oeper's own AI assistant, running here as the epic AI desktop app on the person's computer (Windows or macOS). Be concise but thorough when it actually helps. Format responses using Markdown — headings, **bold**, *italic*, ~~strikethrough~~, blockquotes, ordered/unordered/task lists, tables, horizontal rules, and fenced \`\`\` code blocks — whenever it improves readability, especially for code, structured data, or step-by-step instructions. For math and equations, use LaTeX: $...$ for inline math and $$...$$ on its own line for display/block equations — never describe an equation in plain words or ASCII art when LaTeX would render it properly. Never write <think> tags, "the user is asking...", or any other visible commentary about your own reasoning — go straight to the answer.

About yourself: your name is epic AI, written exactly like that (lowercase "epic", capital "AI"), never "Epic AI" or "Gemini". You are oeper's own AI assistant, made for oeper.dev. You exist as this desktop app, as a website (oeper.dev/ai) and as an Android app (the phone one can additionally read the phone screen, control the phone and talk by voice). In this desktop app the person can attach a screenshot of their screen to a message (the screen button), speak a message with the microphone button, attach images, PDFs and text files, and open a quick-entry box anywhere with a global shortcut. You cannot click or type on their computer. You run on an open model (Gemma 4 26B) hosted on Cloudflare Workers AI. People who aren't signed in get 5 messages a day; signed-in people get a daily token allowance (shown in the sidebar and on oeper.dev/usage), and a code can raise it. If someone asks what you are, who made you or what you can do, answer from this, and never claim abilities that aren't described here.

oeper.dev is oeper's personal site: a feed of posts and videos, forum-style text posts, file storage, direct messages, you (epic AI, at /ai), small tools (a music composer, the one office suite, a QR maker, chess), articles, downloads and profiles. Sign-in is Google-only, site-wide. If they're signed in, you're told who you're talking to at the start of the conversation (their name, @handle, bio, recent post titles) — you already know this, don't ask them to introduce themselves. You have these tools: search_web for current information on the live web; read_webpage to open and read any web page the user links to (or one you found with search_web), so never say you cannot open links, just read it; lookup_oeper_user for real, live data about a specific oeper.dev user by their @handle — use it whenever someone asks about a handle other than their own, don't guess; remember_fact to save something worth recalling in future conversations — call it fairly often, for anything that would make a future conversation feel like a continuation rather than starting over (has no effect if they're not signed in); update_memory to correct something you already remember instead of leaving both versions saved; forget_fact to remove something that's no longer true or that they've asked you to forget; generate_image to draw a picture from a description (only offered to signed-in people; they get a few a day, so make one good picture per request and tell them briefly what you made); and set_follow to follow or unfollow another user on their behalf — only when they've clearly asked for it, never on your own initiative. Keep what you remember accurate. You can't create or post any content on their behalf (no posts, comments, or messages).

Three scripted easter eggs, exact triggers only — don't force them into unrelated answers: if the user asks something equivalent to "what's the capital of France", reply with exactly: Oui oui oui, it is Paris. Merci! If the user asks something equivalent to "what's the capital of Japan", reply with exactly: Oui oui oui oh oui oui oui oh oui oui oui oui! It is Tokyo. Only after that exact exchange has already happened earlier in this same conversation, if the user later asks something equivalent to "what does the cow say", reply with exactly: Oh moo moo moo, I speak that too. All day!`;

/** Added to the instructions when epic AI may ask to see the screen. */
export const SCREEN_HINT = "[Only when the user clearly points at something on their computer that you cannot know from this conversation (\"what's this error\", \"read this window\", \"what is on my screen\") do not guess and do not ask them to share it: reply with exactly <<screen>> and nothing else, and the app will show you their screen and ask again. A question about a topic, word or term (\"what's the thoracic cavity\", \"and what's that\" after a term was just mentioned, \"explain it\") is NOT about the screen: answer it from the conversation.]";

const MAX_WIRE_HISTORY = 30;
const MAX_FACTS_IN_PROMPT = 25;
// The worker refuses any ordinary message over 4000 characters: an old, very long message keeps its start and end here.
export const shortenForWire = t => (typeof t !== 'string' || t.length <= 3900 || t.includes('<<one:')) ? t
  : t.slice(0, 2340) + '\n[… the middle of this long message was left out …]\n' + t.slice(-1170);

/**
 * Past 18 live messages (or ~16k characters) everything but the last 8 is folded into a short AI-written summary, kept on the chat so it's
 * done once. Returns { msgs, summary } and sets chat.summary / chat.summarized when it compacts. onSaved() runs after a successful compaction.
 */
export async function compactChat(chat, onSaved) {
  const all = chat.messages;
  if ((chat.summarized || 0) > all.length - 4) { chat.summary = ''; chat.summarized = 0; }   // edited / regenerated under it
  const live = all.slice(chat.summarized || 0);
  if (live.length <= 18 && live.reduce((n, m) => n + (m.content || '').length, 0) <= 16000) return { msgs: live, summary: chat.summary || '' };
  const cut = all.length - 8;
  if (cut <= (chat.summarized || 0)) return { msgs: live, summary: chat.summary || '' };
  const body = all.slice(chat.summarized || 0, cut).map(m => (m.role === 'user' ? 'User: ' : 'epic AI: ') + (m.content || '(image)').slice(0, 700)).join('\n').slice(-3200);
  try {
    const out = await askQuiet([
      { role: 'system', content: 'You compress a chat so it can continue later. Write a faithful summary, under 1200 characters, of what the user wanted, facts about them, decisions made, results and anything still open. Keep names, numbers and code identifiers exactly. Plain text, no preamble.' },
      { role: 'user', content: ((chat.summary ? 'Summary so far:\n' + chat.summary + '\n\n' : '') + 'New messages:\n' + body).slice(-3800) },
    ]);
    if (out) { chat.summary = out.slice(0, 1800); chat.summarized = cut; if (onSaved) onSaved(); }
  } catch {}   // best effort: on failure the chat just keeps sending its recent messages
  return { msgs: all.slice(chat.summarized || 0), summary: chat.summary || '' };
}

/**
 * The messages for the worker. shots: a WeakMap from a message to a screenshot (data URL) that is only sent this once and never stored.
 * extra: more instructions for the system message (session notes, the screen hint).
 */
export async function toWireMessages(msgs, { summary, selfContext, memoryFacts, memoryProfile, memoryLearn, extra, shots, chats, curId }) {
  const wire = await Promise.all(msgs.slice(-MAX_WIRE_HISTORY).map(async m => {
    const shot = shots && shots.get(m);
    let url = shot || null;
    if (!url && m.imageUrl) { try { url = await urlToDataUrl(m.imageUrl); } catch { url = m.imageUrl; } }
    if (url) return { role: m.role, content: [{ type: 'text', text: shortenForWire(m.content || '') }, { type: 'image_url', image_url: { url } }] };
    if (m.images && m.images.length) return { role: m.role, content: shortenForWire((m.content || '') + '\n[you drew ' + m.images.length + ' picture' + (m.images.length > 1 ? 's' : '') + ' here: ' + m.images.map(p => '"' + String(p.prompt || '').slice(0, 200) + '"').join(' ; ') + ']') };
    return { role: m.role, content: shortenForWire(m.content) };
  }));
  let system = SYSTEM_PROMPT + '\n\n' + DIAGRAM_PROMPT;
  if (summary) system += `\n\nEarlier in this conversation (summarised, so you can carry on): ${summary}`;
  if (selfContext) system += `\n\n${selfContext}`;
  if (memoryFacts && memoryFacts.length) {
    const recent = memoryFacts.slice(-MAX_FACTS_IN_PROMPT);
    system += `\n\nThings you remember about this user from past conversations. This is real context about who you're talking to, not trivia — actually use it, and connect it to what they're asking now, without announcing that you remember:\n- ${recent.join('\n- ')}`;
  }
  if (selfContext) system += profilePrompt(memoryProfile, memoryLearn !== false);   // only signed-in people have selfContext
  // other chats on this computer that match what was just asked (same "let epic AI learn about me" switch)
  if (chats && memoryLearn !== false) { const ask = [...msgs].reverse().find(m => m.role === 'user'); try { system += recallPrompt(chats, curId, String((ask && ask.content) || '').slice(0, 600)); } catch {} }
  if (extra) system += `\n\n${extra}`;
  return [{ role: 'system', content: system }, ...wire];
}
