// Public proxy in front of Cloudflare Workers AI, replacing the old
// ai-proxy.js (which forwarded to LM Studio running on a home PC over a
// Cloudflare Tunnel). Same request/response contract as that server —
// ai.html only needed its AI_ENDPOINT constant changed, nothing else —
// but this one has no home-network dependency at all: it's Cloudflare's
// own infrastructure end to end, so it doesn't go down when a PC or tunnel
// does.
//
// Web search via a hand-rolled, streaming tool-calling loop, backed by the
// Brave Search API — needs a BRAVE_API_KEY secret (see README). This
// replaces ai-proxy.js's old get_current_datetime/calculate/
// search_oeper_dev loop, which an earlier version of this file deliberately
// left out as "the least-tested, most complex part" of a straight port —
// added back now, search only, once actually asked for.
//
// Originally tried @cloudflare/ai-utils' runWithTools() for the loop —
// abandoned after testing showed it never actually surfaced the tool
// definitions to the model at all (its own reasoning said outright "I do
// not have access to tools by default", even though the exact same tools
// array passed straight to the raw env.AI.run() binding worked correctly).
// A hand-rolled non-streaming loop replaced it next, which worked but lost
// live token-by-token streaming entirely — each round had to be a plain
// response so tool_calls could be read before deciding whether to
// continue, so the whole answer generated silently and arrived as one
// chunk. streamToolLoop() below is the third version: still hand-rolled,
// but now reads each round's response as an actual stream (env.AI.run()
// does support stream:true + tools together, confirmed by testing —
// Cloudflare's docs just don't say either way) and forwards
// reasoning/content deltas to the client AS THEY ARRIVE. Tool-call deltas
// arrive incrementally too (a model can't emit real content and a tool
// call in the same turn, so nothing meaningful is ever thrown away) —
// those get accumulated silently instead of forwarded, since raw partial
// JSON fragments aren't something a viewer should see. Once a round's
// stream ends, either it had no tool calls (answer's already fully
// streamed to the client, done) or it did (execute them, append results,
// start the next round's stream the same way).
//
// One more wrinkle worth flagging: reasoning arrives under different field
// names depending on which backend variant serves the request — some
// responses use delta.reasoning_content, others delta.reasoning. Both get
// normalized to reasoning_content before forwarding, since that's the only
// name ai.html's parser recognizes.
//
// This endpoint is intentionally open to anyone, no sign-in — same as
// before. The limits below exist purely to keep usage (and cost) sane, not
// to gate who can use it.

// Tried 'google/gemini-3.7-flash' — confirmed failing, as expected: Gemini
// isn't in Workers AI's native env.AI catalog (only open-weight models like
// Gemma are), it's a third-party model behind Cloudflare's AI Gateway that
// needs its own provider API key, not just this Worker's env.AI binding.
const MODEL = '@cf/google/gemma-4-26b-a4b-it';

const ALLOWED_ORIGINS = ['https://oeper.dev', 'http://localhost:8765'];

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;
// A user message carrying a one document attached from ai.html (marked <<one:Title>>...<</one>>)
// may be much longer than something a person typed.
const MAX_ATTACHED_DOC_MESSAGE_CHARS = 40000;
// The system message is app-constructed (site description + self-context
// + remembered facts — see ai.html's toWireMessages), not something a
// person is typing, so it doesn't need the same tight cap that exists to
// stop an accidental or malicious huge paste in a user turn. It still
// needs SOME ceiling for cost/abuse reasons, just a far more generous one
// — was sharing MAX_MESSAGE_CHARS with user/assistant turns, which broke
// as soon as self-context + a few remembered facts pushed the base
// ~3.5k-char system prompt over 4000 ("A message is too long" errors
// "sometimes" — exactly for signed-in users with enough context to add).
// 16000 chars is ~4k tokens, trivial against the 256k context window.
const MAX_SYSTEM_MESSAGE_CHARS = 16000;
// Vision messages (ai.html's image attach) carry a base64 data URI instead
// of plain text — sized for one resized image with comfortable margin, not
// a whole conversation's worth.
const MAX_IMAGE_CONTENT_CHARS = 6 * 1024 * 1024;
// Was 1024 — way too small: this model's reasoning alone regularly runs
// several hundred tokens (sometimes over a thousand for anything requiring
// back-and-forth deliberation, e.g. refusal decisions), and max_tokens caps
// reasoning + answer combined per round. Cut off mid-reasoning before any
// real answer, that ate the whole budget. Context window is 256k so there's
// no real ceiling pushing back — chose 4096 as a generous-but-not-reckless
// number for a personal site's usage.
const MAX_TOKENS = 8192; // reasoning + answer; structured notes and mind maps need more than the old 4096
const STALL_MS = 30000; // no upstream data for this long mid-stream = treat as stalled (the browser gives up at 45s)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 20; // requests per IP per window, per isolate

// Best-effort only — a Worker isolate's memory doesn't persist across cold
// starts and isn't shared across Cloudflare's edge locations, so this is
// "keep casual overuse (and its cost) in check," not a hard global limit.
// A proper one would need Durable Objects or KV — not worth the complexity
// for a personal site's AI page.
const rateLimitMap = new Map(); // ip -> { count, windowStart }
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = { Vary: 'Origin' };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  });
}

// Short human line for the "what is it doing" indicator while a tool runs.
function toolStatus(name, args) {
  const clip = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  switch (name) {
    case 'search_web': return args && args.query ? `Searching the web for "${clip(args.query)}"` : 'Searching the web';
    case 'lookup_oeper_user': return args && args.handle ? `Looking up @${clip(String(args.handle).replace(/^@/, ''))}` : 'Looking up a profile';
    case 'create_document': return 'Writing a document';
    case 'remember_fact': case 'update_memory': case 'forget_fact': return 'Updating memory';
    case 'set_follow': return 'Updating who you follow';
    default: return 'Working on it';
  }
}

// Splits a string of back-to-back JSON objects ('{"a":1}{"b":2}') into the
// individual objects, ignoring braces inside strings. Returns [] if nothing
// balanced was found.
function splitJsonObjects(s) {
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}' && depth > 0 && --depth === 0) out.push(s.slice(start, i + 1));
  }
  return out;
}

// The API rejects the next request outright if any assistant tool call has
// arguments that aren't valid JSON, so repair what the stream accumulated:
// valid args pass through, glued-together objects become separate calls, and
// anything unrecoverable becomes '{}' (the tool then just reports a bad query).
function normalizeToolCalls(acc) {
  const out = [], used = new Set(), call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: args } });
  acc.forEach((tc, i) => {
    if (used.has(i)) return;
    const id = tc.id || `call_${i}`, raw = (tc.arguments || '').trim() || '{}';
    let ok = true; try { JSON.parse(raw); } catch { ok = false; }
    if (ok) { out.push(call(id, tc.name, raw)); return; }
    const parts = splitJsonObjects(raw).filter(p => { try { JSON.parse(p); return true; } catch { return false; } });
    if (!parts.length) { out.push(call(id, tc.name, '{}')); return; }
    // Parallel calls sometimes arrive as ONE call holding every argument object
    // and the rest empty. Hand each object to the next empty call of the same
    // tool; anything left over becomes its own call.
    out.push(call(id, tc.name, parts[0]));
    let k = 1;
    for (let j = i + 1; j < acc.length && k < parts.length; j++) {
      if (acc[j] && acc[j].name === tc.name && !(acc[j].arguments || '').trim()) { out.push(call(acc[j].id || `call_${j}`, tc.name, parts[k++])); used.add(j); }
    }
    for (; k < parts.length; k++) out.push(call(`${id}_${k}`, tc.name, parts[k]));
  });
  return out;
}

// Reads one round's raw SSE stream from env.AI.run(), forwarding
// reasoning/content deltas to `send` as they arrive and silently
// accumulating any tool_calls deltas (which stream in fragments — an id +
// name in one chunk, then the arguments string built up piece by piece
// across several more, correlated by `index`) instead of forwarding them.
// Returns { finishedWithToolCalls, toolCalls, assistantContent } once the
// round's stream ends, so the caller can decide whether to execute tools
// and start another round, or stop (the round already streamed its full
// answer to the client if it didn't call any tools).
async function streamOneRound(upstream, send) {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const toolCallAcc = []; // sparse array indexed by the stream's own `index`
  let assistantContent = '';
  let sawToolCall = false;
  let finishReason = null;

  let stalled = false;
  while (true) {
    // If the upstream goes quiet mid-answer (it occasionally does), give up on
    // it here instead of leaving the viewer staring at a half-written reply
    // until the browser's own watchdog fires.
    let stallTimer;
    const stall = new Promise(resolve => { stallTimer = setTimeout(() => resolve({ stalled: true }), STALL_MS); });
    const got = await Promise.race([reader.read(), stall]);
    clearTimeout(stallTimer);
    if (got.stalled) { stalled = true; try { await reader.cancel(); } catch {} break; }
    const { done, value } = got;
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(payload); } catch { continue; }
      const choice = evt.choices && evt.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta || {};

      if (delta.tool_calls) {
        sawToolCall = true;
        for (const tc of delta.tool_calls) {
          let idx = tc.index || 0;
          // Some responses reuse index 0 for every parallel call. A fresh id on a
          // slot that already has a different one means it's really a new call;
          // without this their arguments were glued together into invalid JSON.
          if (tc.id && toolCallAcc[idx] && toolCallAcc[idx].id && toolCallAcc[idx].id !== tc.id) idx = toolCallAcc.length;
          if (!toolCallAcc[idx]) toolCallAcc[idx] = { id: '', name: '', arguments: '' };
          if (tc.id) toolCallAcc[idx].id = tc.id;
          if (tc.function) {
            if (tc.function.name) toolCallAcc[idx].name = tc.function.name;
            if (tc.function.arguments) toolCallAcc[idx].arguments += tc.function.arguments;
          }
        }
        continue;
      }

      // Field name varies by backend — normalize both to reasoning_content,
      // the only name ai.html's client-side parser looks for.
      const reasoning = delta.reasoning_content || delta.reasoning;
      if (reasoning) send({ choices: [{ delta: { reasoning_content: reasoning } }] });
      if (delta.content) {
        assistantContent += delta.content;
        send({ choices: [{ delta: { content: delta.content } }] });
      }
    }
  }

  const finishedWithToolCalls = sawToolCall && toolCallAcc.length > 0;
  // Harmless to the browser (it ignores events it doesn't know) but lets us
  // see in a raw response why a reply ended: 'stop' / 'tool_calls' are normal,
  // anything else (length, null, stalled) is a truncated answer.
  send({ meta: { finish: finishReason, stalled, chars: assistantContent.length } });
  // Ran out of max_tokens (finish_reason 'length') without calling a tool.
  // finish_reason never used to reach the client at all, so a response
  // that got cut off mid-sentence looked identical to a normal, complete
  // one — "the AI gets cut off sometimes, any idea why?" with nothing in
  // the UI hinting it was truncated rather than just... finished talking.
  // Two distinct cases:
  //  - no real answer text at all (the whole budget went to reasoning) —
  //    surface an apologetic placeholder instead of an empty bubble.
  //  - a partial answer that got cut off mid-thought — append a short,
  //    visibly different note so it's clear more was coming, instead of
  //    silently truncating like it used to.
  if (!finishedWithToolCalls && stalled) {
    const note = assistantContent
      ? '\n\n*(cut off. the connection to the model stalled. ask it to continue.)*'
      : '(the model stalled before answering. please try again.)';
    assistantContent += note;
    send({ choices: [{ delta: { content: note } }] });
  } else if (!finishedWithToolCalls && finishReason === 'length') {
    const note = assistantContent
      ? '\n\n*(cut off — hit the response length limit. ask it to continue.)*'
      : "(ran out of room to answer that — could you try rephrasing, or asking something more specific?)";
    assistantContent += note;
    send({ choices: [{ delta: { content: note } }] });
  }

  return {
    finishedWithToolCalls,
    toolCalls: normalizeToolCalls(toolCallAcc.filter(Boolean)),
    assistantContent,
  };
}

// Drives the whole tool-calling conversation: streams each round straight
// to the client, and between rounds — invisibly to the client — executes
// any tool calls the model made and feeds the results back in, up to
// MAX_TOOL_ROUNDS.
function streamToolLoop(env, initialMessages, tools) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = obj => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let workingMessages = initialMessages;
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          // The last round gets no tools at all. Otherwise a model that keeps
          // wanting "one more search" would call a tool on the final round, the
          // loop would stop right there, and the viewer got a half-written
          // answer that just ended (sometimes mid-heading).
          const lastRound = round === MAX_TOOL_ROUNDS;
          const upstream = await env.AI.run(MODEL, lastRound
            ? { messages: workingMessages, stream: true, max_tokens: MAX_TOKENS }
            : { messages: workingMessages, tools: tools || TOOLS, stream: true, max_tokens: MAX_TOKENS });
          const { finishedWithToolCalls, toolCalls, assistantContent } = await streamOneRound(upstream, send);
          if (!finishedWithToolCalls || round === MAX_TOOL_ROUNDS) break;

          workingMessages = [...workingMessages, { role: 'assistant', content: assistantContent, tool_calls: toolCalls }];
          for (const call of toolCalls) {
            const fn = TOOL_FUNCTIONS[call.function.name];
            let toolResult;
            let args = {};
            try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
            // Tell the browser what is happening during the gap while a tool runs
            // (clients that don't know about `status` events just ignore them).
            send({ status: toolStatus(call.function.name, args) });
            // None of the memory tools have anywhere to actually persist to
            // — this Worker has no Firestore write credentials, deliberately
            // (see the firestoreGetDoc comment above: reads work
            // unauthenticated against public-read rules, writes never will
            // without a service account this Worker doesn't hold). Instead
            // of writing anything itself, it streams the change to the
            // client as its own SSE event, and ai.html does the actual
            // write under the signed-in user's own auth — same as every
            // other Firestore write on this site. If nobody's signed in,
            // ai.html just drops the event; the model still gets a normal-
            // looking tool result either way so it doesn't get confused
            // mid-conversation.
            if (call.function.name === 'remember_fact' && args.fact) {
              send({ remember: String(args.fact).slice(0, 300) });
            } else if (call.function.name === 'update_memory' && args.old_fact && args.new_fact) {
              send({ updateMemory: { old: String(args.old_fact).slice(0, 300), new: String(args.new_fact).slice(0, 300) } });
            } else if (call.function.name === 'forget_fact' && args.fact) {
              send({ forget: String(args.fact).slice(0, 300) });
            } else if (call.function.name === 'create_document' && args.title && args.content) {
              send({ createDoc: { title: String(args.title).slice(0, 120), content: String(args.content).slice(0, 60000) } });
            } else if (call.function.name === 'set_follow' && args.handle && typeof args.follow === 'boolean') {
              send({ setFollow: { handle: String(args.handle).replace(/^@/, '').trim().slice(0, 50), follow: args.follow } });
            }
            if (!fn) {
              toolResult = JSON.stringify({ error: 'unknown tool' });
            } else {
              try { toolResult = await fn(args, env); } catch (err) { toolResult = JSON.stringify({ error: err.message }); }
            }
            workingMessages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: toolResult });
          }
        }
      } catch (err) {
        send({ choices: [{ delta: { content: `\n\n[error: ${err.message}]` } }] });
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

const SEARCH_RESULT_COUNT = 5;

async function searchWeb(args, env) {
  if (!env.BRAVE_API_KEY) return JSON.stringify({ error: 'web search is not configured on this deployment' });
  const query = (args && args.query || '').trim();
  if (!query) return JSON.stringify({ error: 'empty query' });
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${SEARCH_RESULT_COUNT}`,
      { headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY } }
    );
    if (!res.ok) return JSON.stringify({ error: `search request failed (HTTP ${res.status})` });
    const data = await res.json();
    const results = ((data.web && data.web.results) || []).slice(0, SEARCH_RESULT_COUNT).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
    return JSON.stringify({ results });
  } catch (err) {
    return JSON.stringify({ error: 'search request failed: ' + err.message });
  }
}

// ── Live oeper.dev user lookups ──────────────────────────────────────
// Firestore's REST API respects the project's own security rules, and
// users/{email} + handles/{handle} are both public-read (allow read: if
// true) — see firestore.rules — so this works with a plain unauthenticated
// GET, no service account or Admin SDK needed. handles/{handle} maps a
// @handle to the email it belongs to; users/{email} is the actual profile.
//
// OWNER_EMAILS mirrors shared/account.js's list of the same name — not a
// secret either way, since that file ships to every browser as plain JS.
// Needed here only to reproduce officialBadgeHtml()'s badge logic (owners
// show badgeOverride, everyone else shows badge) — raw emails are never
// part of what this tool returns to the model, only handle/displayName/
// bio/badge/memberSince, matching the site's own "never show a raw email"
// rule in getProfile().
const FIREBASE_PROJECT_ID = 'oepernet-1683535959256';
const OWNER_EMAILS = ['sanhackerman@gmail.com', 'taejiding@gmail.com'];

function parseFirestoreValue(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return parseFirestoreFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(parseFirestoreValue);
  return null;
}
function parseFirestoreFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = parseFirestoreValue(v);
  return out;
}
async function firestoreGetDoc(path) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore lookup failed (HTTP ${res.status})`);
  const data = await res.json();
  return parseFirestoreFields(data.fields || {});
}

function resolveBadgeLabel(profile, email) {
  if (OWNER_EMAILS.includes(email)) {
    const override = profile.badgeOverride;
    if (override && override.hidden) return null;
    if (override && override.label) return override.label;
    return 'OFFICIAL';
  }
  return (profile.badge && profile.badge.label) || null;
}

async function lookupOeperUser(args) {
  const handle = String((args && args.handle) || '').trim().replace(/^@/, '').toLowerCase();
  if (!handle) return JSON.stringify({ error: 'no handle given' });
  try {
    const handleDoc = await firestoreGetDoc(`handles/${encodeURIComponent(handle)}`);
    if (!handleDoc || !handleDoc.email) return JSON.stringify({ error: `no oeper.dev user found with handle @${handle}` });
    const profile = await firestoreGetDoc(`users/${encodeURIComponent(handleDoc.email)}`);
    if (!profile) return JSON.stringify({ error: `@${handle} exists but has no profile data yet` });
    return JSON.stringify({
      handle,
      displayName: profile.displayName || null,
      bio: profile.bio || null,
      badge: resolveBadgeLabel(profile, handleDoc.email),
      memberSince: profile.createdAt || null,
    });
  } catch (err) {
    return JSON.stringify({ error: 'lookup failed: ' + err.message });
  }
}

// Plain schema only — no executable `function` field. @cloudflare/ai-utils'
// runWithTools() takes tools in that combined shape and is supposed to
// dispatch to the function itself, but empirically it never actually
// surfaced these tool definitions to Gemma at all (the model's own
// reasoning said outright "I do not have access to ... tools by default" —
// tried, confirmed broken). The raw env.AI.run() binding handles tool
// calling correctly on its own, so the loop below drives it directly
// instead: TOOL_FUNCTIONS maps a tool name to its handler for manual
// dispatch once a tool_calls response comes back.
const TOOLS = [
  {
    name: 'search_web',
    description: 'Search the live web for current information — news, recent events, facts that may have changed since training, or anything the user explicitly asks to look up. Returns up to 5 results, each with a title, url, and short snippet.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_oeper_user',
    description: 'Look up real, live data about a specific oeper.dev user by their @handle — display name, bio, badge, and member-since date. Use this whenever someone asks about a specific @handle rather than guessing.',
    parameters: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'The handle to look up, with or without the leading @' },
      },
      required: ['handle'],
    },
  },
  {
    name: 'remember_fact',
    description: "Save something worth recalling in future conversations with this user, so next time you actually remember them instead of starting from zero. Call this fairly often — whenever they mention something that would help you help them better later: a stated preference, an ongoing project or goal, their job/field/studies, technical tools or languages they use, a hobby or interest, a person or pet they've mentioned, a recurring topic, an upcoming event or deadline, or how they'd like you to respond to them. Skip only pure one-off small talk ('the user said hi', 'the user said thanks') — when in doubt, remember it; a slightly-too-eager memory serves them far better than a blank one. Has no effect if nobody's signed in.",
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact to remember, written as a short, self-contained statement (it will be read back to you verbatim in future conversations, with no other context)' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'update_memory',
    description: "Correct or revise something you already remember about this user, in place — the fact changed or you got it wrong the first time (e.g. they were learning Rust, now they've said they've moved on to Zig). old_fact must match one of the facts listed under \"Things you remember about this user\" verbatim, word for word — if you're not certain of the exact wording, use forget_fact and remember_fact separately instead of guessing at a match.",
    parameters: {
      type: 'object',
      properties: {
        old_fact: { type: 'string', description: 'The exact existing fact to replace, copied verbatim from the remembered-facts list' },
        new_fact: { type: 'string', description: 'The corrected/updated fact, written the same way remember_fact expects' },
      },
      required: ['old_fact', 'new_fact'],
    },
  },
  {
    name: 'forget_fact',
    description: 'Remove something you currently remember about this user — it turned out wrong, is no longer true, or they asked you to forget it. fact must match one of the facts listed under "Things you remember about this user" verbatim, word for word.',
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The exact existing fact to remove, copied verbatim from the remembered-facts list' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'set_follow',
    description: "Follow or unfollow another oeper.dev user on this user's behalf. Only call this when they've clearly asked you to (e.g. \"follow @someone for me\", \"unfollow @someone\") — never on your own initiative just because a handle came up in conversation. Has no effect if nobody's signed in, or if the handle doesn't exist.",
    parameters: {
      type: 'object',
      properties: {
        handle: { type: 'string', description: 'The handle to follow/unfollow, with or without the leading @' },
        follow: { type: 'boolean', description: 'true to follow, false to unfollow' },
      },
      required: ['handle', 'follow'],
    },
  },
];
// Only offered when the page says the user switched on epic AI's one integration
// (settings.html › "epic AI"; ai.html sends oneTools: true). Like the memory tools,
// the document is actually written client-side — see streamToolLoop.
const ONE_TOOLS = [
  {
    name: 'create_document',
    description: "Create a new document in the user's oneWord (the word processor at oeper.dev/one) and save it there. Only call this when they've clearly asked you to write/save/draft something as a document. content is the whole document in markdown (headings with #, lists, **bold**, tables). After calling it, tell them briefly what you made — they get an Open button automatically, so don't paste the document into the chat as well.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short document title' },
        content: { type: 'string', description: 'The full document body, in markdown' },
      },
      required: ['title', 'content'],
    },
  },
];
async function createDocument() { return JSON.stringify({ ok: true, note: 'Saved to oneWord. The user sees an Open button under your message.' }); }
// These four tools' actual persistence happens client-side (see the
// streamToolLoop comment above) — these handlers exist only so the
// tool-calling protocol gets a normal result to feed back to the model.
async function rememberFact() { return JSON.stringify({ ok: true }); }
async function updateMemory() { return JSON.stringify({ ok: true }); }
async function forgetFact() { return JSON.stringify({ ok: true }); }
async function setFollow() { return JSON.stringify({ ok: true }); }
const TOOL_FUNCTIONS = {
  search_web: searchWeb,
  lookup_oeper_user: lookupOeperUser,
  remember_fact: rememberFact,
  update_memory: updateMemory,
  forget_fact: forgetFact,
  set_follow: setFollow,
  create_document: createDocument,
};
const MAX_TOOL_ROUNDS = 3;

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400, request);
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages must be a non-empty array' }, 400, request);
  }
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `Too many messages (max ${MAX_MESSAGES})` }, 400, request);
  }
  for (const m of messages) {
    if (!m || !['user', 'assistant', 'system'].includes(m.role)) {
      return json({ error: 'Invalid message shape' }, 400, request);
    }
    if (typeof m.content === 'string') {
      const limit = m.role === 'system' ? MAX_SYSTEM_MESSAGE_CHARS
        : (m.role === 'user' && m.content.includes('<<one:')) ? MAX_ATTACHED_DOC_MESSAGE_CHARS : MAX_MESSAGE_CHARS;
      if (m.content.length > limit) {
        return json({ error: `A message is too long (max ${limit} characters)` }, 400, request);
      }
    } else if (Array.isArray(m.content)) {
      if (m.content.length > 4 || JSON.stringify(m.content).length > MAX_IMAGE_CONTENT_CHARS) {
        return json({ error: 'Message content is too large' }, 400, request);
      }
    } else {
      return json({ error: 'Invalid message shape' }, 400, request);
    }
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) {
    return json({ error: 'Too many requests — please slow down and try again in a few minutes.' }, 429, request);
  }

  const stream = streamToolLoop(env, messages, body.oneTools === true ? [...TOOLS, ...ONE_TOOLS] : TOOLS);

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders(request),
    },
  });
}

// ── Content moderation for the file server ─────────────────────────────
// Called server-to-server by forum-server/storage-admin.js after each
// upload — never from a browser (no CORS headers on purpose), and gated by a
// shared secret (MODERATION_KEY, set with `wrangler secret put MODERATION_KEY`)
// so it can't be used as a free general-purpose classifier by anyone who
// finds the URL. Text goes to Llama Guard (a purpose-built safety
// classifier); images go to the same vision-capable model the chat uses,
// with a strict JSON-only prompt. Returns { flagged, categories, severity, reason }.
const TEXT_GUARD_MODEL = '@cf/meta/llama-guard-3-8b';
const MOD_CATEGORIES = ['nudity_or_sexual', 'sexual_minors', 'graphic_violence', 'hate_or_harassment', 'self_harm', 'illegal_activity', 'weapons', 'spam_or_scam', 'personal_data'];
const GUARD_CATEGORY_MAP = {
  S1: 'violent_crime', S2: 'nonviolent_crime', S3: 'sex_crime', S4: 'sexual_minors', S5: 'defamation',
  S6: 'specialized_advice', S7: 'privacy', S8: 'intellectual_property', S9: 'weapons', S10: 'hate_or_harassment',
  S11: 'self_harm', S12: 'sexual_content', S13: 'elections', S14: 'code_interpreter_abuse',
};
// Only these Llama Guard categories count as a reason to flag — the advice,
// IP, and elections categories are far too noisy for a file host.
const GUARD_FLAG = new Set(['S1', 'S3', 'S4', 'S9', 'S10', 'S11', 'S12']);
const SEVERE = new Set(['sexual_minors', 'sex_crime']);

function aiText(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  if (typeof out.response === 'string') return out.response;
  const c = out.choices && out.choices[0];
  if (c && c.message && typeof c.message.content === 'string') return c.message.content;
  return '';
}

async function moderateText(env, text) {
  const out = await env.AI.run(TEXT_GUARD_MODEL, {
    messages: [{ role: 'user', content: String(text).slice(0, 12000) }],
  });
  // Newer bindings return { response: { safe, categories } }, older ones the
  // raw "safe" / "unsafe\nS1,S9" string — handle both.
  let safe = true;
  let cats = [];
  const r = out && out.response;
  if (r && typeof r === 'object') {
    safe = r.safe !== false;
    cats = Array.isArray(r.categories) ? r.categories : [];
  } else {
    const raw = aiText(out).trim();
    safe = !/^unsafe/i.test(raw);
    cats = raw.match(/S\d{1,2}/g) || [];
  }
  const flaggedCats = cats.filter(c => GUARD_FLAG.has(c));
  const flagged = !safe && flaggedCats.length > 0;
  const names = flaggedCats.map(c => GUARD_CATEGORY_MAP[c] || c);
  return {
    flagged,
    categories: names,
    severity: names.some(n => SEVERE.has(n)) ? 'severe' : (flagged ? 'moderate' : 'none'),
    reason: flagged ? 'Text matched: ' + names.join(', ') : '',
  };
}

const IMAGE_MOD_PROMPT =
  'You are a content-safety classifier for a file-hosting service. Look at the image and decide whether it clearly ' +
  'contains any of these: ' + MOD_CATEGORIES.join(', ') + '. ' +
  'Ordinary photos, art, memes, screenshots, and game footage are fine — only flag content that clearly violates. ' +
  'Reply with ONLY a JSON object, no prose, no code fences: ' +
  '{"flagged": boolean, "categories": [strings from the list], "severity": "none"|"moderate"|"severe", "reason": "one short sentence"}';

async function moderateImage(env, dataUrl) {
  const out = await env.AI.run(MODEL, {
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: IMAGE_MOD_PROMPT },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
    max_tokens: MAX_TOKENS,
  });
  const raw = aiText(out);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Moderation model returned no JSON');
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch { throw new Error('Moderation model returned invalid JSON'); }
  const cats = Array.isArray(parsed.categories) ? parsed.categories.filter(c => MOD_CATEGORIES.includes(c)) : [];
  const flagged = parsed.flagged === true && cats.length > 0;
  return {
    flagged,
    categories: cats,
    severity: !flagged ? 'none' : (cats.includes('sexual_minors') || parsed.severity === 'severe' ? 'severe' : 'moderate'),
    reason: flagged ? String(parsed.reason || '').slice(0, 300) : '',
  };
}

async function handleModerate(request, env) {
  if (!env.MODERATION_KEY) return json({ error: 'Moderation is not configured (MODERATION_KEY secret missing)' }, 503, request);
  if (request.headers.get('X-Moderation-Key') !== env.MODERATION_KEY) return json({ error: 'Forbidden' }, 403, request);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, request); }
  try {
    if (body.type === 'text' && typeof body.text === 'string') return json(await moderateText(env, body.text), 200, request);
    if (body.type === 'image' && typeof body.image === 'string' && body.image.startsWith('data:image/')) {
      return json(await moderateImage(env, body.image), 200, request);
    }
  } catch (err) {
    return json({ error: err.message }, 502, request);
  }
  return json({ error: 'Expected { type: "text", text } or { type: "image", image: <data URL> }' }, 400, request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('oeper.dev AI worker is running.', { headers: corsHeaders(request) });
    }

    if (url.pathname === '/api/model' && request.method === 'GET') {
      return json({ model: MODEL }, 200, request);
    }

    // Workers AI has no "loaded/not-loaded" concept the way a local LM
    // Studio instance does — there's just the one configured model, always
    // available. Kept as an empty list (not removed) so ai.html's existing
    // merge-with-Firestore-config logic for the model dropdown still works
    // unchanged; admin.html can still add extra Workers AI model ids via
    // config/aiModels if you ever want to offer a choice.
    if (url.pathname === '/api/models' && request.method === 'GET') {
      return json({ models: [] }, 200, request);
    }

    if (url.pathname === '/api/moderate' && request.method === 'POST') {
      return handleModerate(request, env);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return json({ error: 'Not found' }, 404, request);
  },
};
