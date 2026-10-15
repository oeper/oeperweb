// Cross-chat recall for epic AI: before a reply, look through the person's OTHER chats and hand the model the few passages that
// match what they just asked, so "like we talked about yesterday" works. Pure functions (no DOM, no network), shared with the
// desktop app (desktop/epicai/app/ai-recall.js is a copy).
const STOP = new Set(('the and for are but not you your with that this have has had was were what when where who why how can could would should will '
  + 'from about into out get got just like some any all one too very than then them they their there here its it is a an of to in on at by or as be do does did '
  + 'me my we our us him her his she he i am if so no yes please tell give make want need help know think').split(/\s+/));
const words = s => (String(s || '').toLowerCase().match(/[a-z0-9À-ɏ一-鿿][a-z0-9À-ɏ一-鿿'+#.-]*/g) || [])
  .map(w => w.replace(/^[.'-]+|[.'-]+$/g, '')).filter(w => w.length >= 3 && !STOP.has(w));
// asking about the past in general ("what did we talk about", "last time", "in another chat") rather than about a topic
const PAST_RE = /\b(last time|earlier|before|previous(ly)?|other chat|another chat|old chat|past chat|yesterday|remember when|we (talked|discussed|spoke)|did (we|i) (talk|discuss|say|mention|ask)|i (told|mentioned|asked) you)\b/i;
const clip = (s, n) => { s = String(s || '').replace(/<<[^>]*>>|<\/?[a-z]+>/gi, ' ').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const when = t => { const d = Math.floor((Date.now() - (t || 0)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? d + ' days ago' : d < 60 ? Math.round(d / 7) + ' weeks ago' : Math.round(d / 30) + ' months ago'; };

/* chats: the chat list ({id,title,messages:[{role,content}],summary,updatedAt}); query: what the person just typed.
   Returns the text to append to the system prompt, or '' when nothing is relevant. Capped so it can never crowd the prompt. */
export function recallPrompt(chats, currentId, query, max = 1700) {
  const others = (chats || []).filter(c => c && c.id !== currentId && c.messages && c.messages.length);
  if (!others.length) return '';
  const q = [...new Set(words(query))];
  const pastAsk = PAST_RE.test(query || '');
  const scored = [];
  for (const c of others) {
    const parts = [];   // the passages of this chat, each with the words it holds
    if (c.summary) parts.push({ who: 'summary', text: c.summary });
    for (const m of c.messages) if (m.content && !m.error) parts.push({ who: m.role === 'user' ? 'you' : 'epic AI', text: m.content });
    let score = 0; const hit = new Set(); const best = [];
    const tw = new Set(words(c.title));
    q.forEach(w => { if (tw.has(w)) { score += 3; hit.add(w); } });
    for (const p of parts) {
      const pw = new Set(words(p.text.slice(0, 4000)));
      const n = q.filter(w => pw.has(w));
      if (!n.length) continue;
      n.forEach(w => hit.add(w));
      const s = n.length * (p.who === 'you' ? 1.3 : 1);
      score += s; best.push({ p, s });
    }
    // a single shared word is too weak to bring up a whole chat, unless the question itself is one or two words long
    if (hit.size < Math.min(2, q.length)) continue;
    best.sort((a, b) => b.s - a.s);
    scored.push({ c, score: score + Math.min(1, (c.updatedAt || 0) / Date.now()), best: best.slice(0, 2) });
  }
  scored.sort((a, b) => b.score - a.score);
  let out = '';
  const add = s => { if (out.length + s.length <= max) out += s; };
  for (const { c, best } of scored.slice(0, 3)) {
    let block = `\n- Chat "${clip(c.title, 50)}" (${when(c.updatedAt)}):`;
    best.forEach(({ p }) => { block += `\n    ${p.who}: ${clip(p.text, 300)}`; });
    add(block);
  }
  // general "what did we talk about before?" with nothing to match on: list the latest chats by title
  if (!out && pastAsk) {
    others.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 8).forEach(c => add(`\n- "${clip(c.title, 50)}" (${when(c.updatedAt)}): ${clip((c.messages.find(m => m.role === 'user') || {}).content, 90)}`));
  }
  if (!out) return '';
  return '\n\nFrom this person\'s OTHER chats with you (found because they match what they just wrote; they may or may not be relevant). You can use them like your own memory of past conversations, for example "last time you mentioned…". Mention one only when it helps, never recite them, and if a passage looks unrelated, ignore it:' + out;
}
