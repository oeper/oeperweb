// Public proxy in front of a small local model (LM Studio, running on a PC,
// exposed at ai.oeper.dev via its own Cloudflare Tunnel) so oeper.dev/ai can
// reach it from the internet. Separate process/port from upload-server.js on
// purpose — this one has no auth at all (by design, see README), so keeping
// it isolated means a problem here can't affect file uploads or the forum,
// and either can be restarted independently.
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Same .env loader as upload-server.js — see that file for why (config
// living in one persistent file beats retyping env vars on every restart,
// which is how AI_UPSTREAM ended up stale after moving the model to a new
// host). Real shell env vars still win over anything in .env.
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const PORT = process.env.PORT || 8788;

// Where the OpenAI-compatible model server is listening. Must be reachable
// from whatever machine runs this proxy — currently a public URL
// (ai.oeper.dev, the PC's own Cloudflare Tunnel to its LM Studio server)
// rather than a LAN IP, since this proxy and the model host aren't
// necessarily on the same network anymore.
const AI_UPSTREAM = process.env.AI_UPSTREAM || 'https://ai.oeper.dev';

// LM Studio's server has its own "Require API Key" setting, worth keeping
// on since AI_UPSTREAM may be a publicly-tunneled address — leaving it off
// would let anyone who finds that URL hit the model directly, unthrottled,
// bypassing every limit this proxy enforces. Set this to whatever key LM
// Studio's Developer → Server Settings shows/lets you set; left blank, no
// Authorization header is sent (fine if the upstream doesn't require one).
const AI_UPSTREAM_API_KEY = process.env.AI_UPSTREAM_API_KEY || '';

// Default/fallback model when a request doesn't specify one — ai.html's
// dropdown (sourced from the config/aiModels Firestore doc) can override
// this per-request via the `model` field, see /api/chat below. This drifts
// out of date whenever the loaded model changes (it did once already) —
// set AI_MODEL in .env instead of editing this if that happens again.
const AI_MODEL = process.env.AI_MODEL || 'google/gemma-4-e2b';

const ALLOWED_ORIGINS = ['https://oeper.dev', 'http://localhost:8765'];

// This endpoint is intentionally open to anyone, no sign-in — see README.
// These limits exist purely to protect a small phone-hosted model from
// being hammered, not to gate who can use it.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;
// Vision messages (ai.html's image attach) carry a base64 data URI instead
// of plain text — sized for one resized image with comfortable margin, not
// a whole conversation's worth (see express.json's limit above).
const MAX_IMAGE_CONTENT_CHARS = 6 * 1024 * 1024;
const MAX_TOKENS = 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 20; // requests per IP per window

const app = express();
app.set('trust proxy', true); // req.ip reflects the real visitor through the Cloudflare Tunnel
app.use(cors({ origin: ALLOWED_ORIGINS }));
// 200kb was fine for plain text chat, but LM Studio's vision support only
// accepts base64-encoded images (not remote URLs, unlike OpenAI's actual
// API) — ai.html sends those inline in the message body, so this needs
// enough headroom for a resized-but-still-substantial image.
app.use(express.json({ limit: '8mb' }));

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

// The model is small and phone-hosted — it can't usefully serve more than
// one generation at a time, so a second request while one is in flight gets
// a friendly 429 instead of both requests crawling along together.
let busy = false;

app.get('/', (req, res) => res.send('oeperweb AI proxy is running.'));

app.get('/api/model', (req, res) => res.json({ model: AI_MODEL }));

// Only models actually loaded into memory right now — NOT the OpenAI-
// compatible /v1/models, which lists the whole downloaded inventory
// regardless of what's using RAM. LM Studio's own extended API
// (/api/v0/models) reports a per-model "state": "loaded" | "not-loaded",
// which is what lets us filter down to just what you've deliberately
// loaded — this proxy never causes a model to load, it only reports
// what's already running. Also drops "embeddings"-type entries, which
// can't serve chat completions even if loaded. config/aiModels
// (Firestore, admin.html-editable) still merges in afterward client-side
// as extra entries, for models worth offering even when not loaded.
app.get('/api/models', async (req, res) => {
  try {
    const upstream = await fetch(`${AI_UPSTREAM}/api/v0/models`, {
      headers: AI_UPSTREAM_API_KEY ? { Authorization: `Bearer ${AI_UPSTREAM_API_KEY}` } : {},
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `Model server responded ${upstream.status}` });
    }
    const data = await upstream.json();
    const list = Array.isArray(data.data) ? data.data : [];
    const models = list
      .filter(m => m.state === 'loaded' && m.type !== 'embeddings')
      .map(m => ({ id: m.id, label: m.id }));
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the model server: ' + err.message });
  }
});

// ── Tool use ─────────────────────────────────────────────────────────
// Small local models have no real sense of "now" and are unreliable at
// arithmetic — these two tools cover the most common cases where that
// actually matters, without giving the model any access to the network,
// filesystem, or anything else on this machine. Whether a given model
// actually calls them depends on its chat template supporting OpenAI-style
// tool calling at all; models that don't support it just ignore the `tools`
// field and answer normally, so this is safe to always send.
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description: "Get the current real-world date and time. Use this whenever the user asks what day, date, or time it is, or needs today's date for something — your training data has no reliable sense of \"now\".",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: 'Evaluate a basic arithmetic expression (+ - * / % and parentheses) and return the numeric result. Use this for any nontrivial math instead of computing it yourself.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: "e.g. '(3 + 4) * 2 / 7'" } },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_oeper_dev',
      description: "Search oeper.dev's own content — forum posts, projects, and articles — for a query. Use this whenever the user asks about something on the site itself (\"is there a post about...\", \"what projects has X made\", \"find the article on...\") instead of guessing from your own training data, which knows nothing about this site.",
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Keywords to search for' } },
        required: ['query'],
      },
    },
  },
];
const MAX_TOOL_ROUNDS = 3;

// Same web config already sitting in plain sight in shared/account.js on
// every page of the site (Firebase web API keys are meant to be public —
// access is actually governed by firestore.rules, not by keeping this
// secret) — reused here so this proxy can read public collections without
// needing its own Firebase Admin credentials.
const FIREBASE_PROJECT_ID = 'oepernet-1683535959256';

// Firestore REST responses wrap every field in a {typeName: value} envelope
// — this only unwraps the handful of types posts/projects actually use.
function unwrapFirestoreFields(fields) {
  const out = {};
  for (const [key, val] of Object.entries(fields || {})) {
    if (val.stringValue !== undefined) out[key] = val.stringValue;
    else if (val.integerValue !== undefined) out[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) out[key] = val.doubleValue;
    else if (val.booleanValue !== undefined) out[key] = val.booleanValue;
    else if (val.timestampValue !== undefined) out[key] = val.timestampValue;
  }
  return out;
}

async function fetchRecentDocs(collectionId, limitN) {
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId }],
            orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
            limit: limitN,
          },
        }),
      }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return rows
      .filter(r => r.document)
      .map(r => ({ id: r.document.name.split('/').pop(), ...unwrapFirestoreFields(r.document.fields) }));
  } catch {
    return [];
  }
}

async function searchOeperDev(queryText) {
  const terms = String(queryText || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return { results: [] };
  const matches = text => {
    const t = (text || '').toLowerCase();
    return terms.some(term => t.includes(term));
  };

  const [posts, projects, articlesData] = await Promise.all([
    fetchRecentDocs('posts', 60),
    fetchRecentDocs('projects', 60),
    fetch('https://oeper.dev/data/articles.json').then(r => r.ok ? r.json() : { articles: [] }).catch(() => ({ articles: [] })),
  ]);

  const results = [];
  for (const p of posts) {
    if (matches(p.title) || matches(p.body)) {
      results.push({ type: 'forum post', title: p.title, snippet: (p.body || '').slice(0, 200), url: `https://oeper.dev/feed/${p.id}` });
    }
  }
  for (const p of projects) {
    if (matches(p.title) || matches(p.description)) {
      results.push({ type: 'project', title: p.title, snippet: (p.description || '').slice(0, 200), url: `https://oeper.dev/projects?project=${p.id}` });
    }
  }
  (articlesData.articles || []).forEach((a, i) => {
    if (matches(a.title) || matches(a.excerpt)) {
      results.push({ type: 'article', title: a.title, snippet: a.excerpt || '', url: `https://oeper.dev/articles?article=${i}` });
    }
  });

  return results.length ? { results: results.slice(0, 8) } : { results: [], note: 'No matches found on oeper.dev for that query.' };
}

async function runTool(name, argsJson) {
  let args;
  try { args = JSON.parse(argsJson || '{}'); } catch { args = {}; }
  if (name === 'get_current_datetime') {
    return { iso: new Date().toISOString() };
  }
  if (name === 'calculate') {
    const expr = String(args.expression || '');
    // Digits/operators/parens/whitespace only — nothing that could reach a
    // global or call another function, so this is safe to hand to Function().
    if (!expr || expr.length > 200 || !/^[0-9+\-*/().%\s]+$/.test(expr)) {
      return { error: 'Invalid expression — only numbers, + - * / % and parentheses are allowed.' };
    }
    try {
      const value = Function('"use strict"; return (' + expr + ')')();
      if (typeof value !== 'number' || !isFinite(value)) return { error: 'Expression did not evaluate to a finite number.' };
      return { result: value };
    } catch {
      return { error: 'Could not evaluate that expression.' };
    }
  }
  if (name === 'search_oeper_dev') {
    return searchOeperDev(args.query);
  }
  return { error: `Unknown tool: ${name}` };
}

// Streams one round of a chat completion to the client, transparently
// looping in further upstream round-trips when the model asks to call a
// tool — the client only ever sees one continuous SSE stream of the kind it
// already knows how to parse (delta.content / delta.reasoning_content).
// Tool-call deltas themselves are never forwarded; the client has no idea
// tool use is even happening.
async function streamChatWithTools(res, messages, model, roundsLeft) {
  let upstream;
  try {
    upstream = await fetch(`${AI_UPSTREAM}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AI_UPSTREAM_API_KEY ? { Authorization: `Bearer ${AI_UPSTREAM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
        frequency_penalty: 0.3,
        presence_penalty: 0.1,
        ...(roundsLeft > 0 ? { tools: TOOLS } : {}),
      }),
    });
  } catch (err) {
    if (!res.headersSent) return res.status(502).json({ error: 'Could not reach the model server: ' + err.message });
    return res.end();
  }

  if (!upstream.ok || !upstream.body) {
    if (!res.headersSent) {
      let msg = `Model server responded ${upstream.status}`;
      try { msg = (await upstream.text()).slice(0, 300) || msg; } catch {}
      return res.status(502).json({ error: msg });
    }
    return res.end();
  }

  if (!res.headersSent) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  const toolCalls = new Map(); // index -> { id, name, arguments }
  let finishReason = null;
  let buf = '';
  const decoder = new TextDecoder();

  for await (const chunk of upstream.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const choice = json.choices && json.choices[0];
      const delta = (choice && choice.delta) || {};
      if (choice && choice.finish_reason) finishReason = choice.finish_reason;

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index || 0;
          const entry = toolCalls.get(idx) || { id: tc.id || `call_${idx}`, name: '', arguments: '' };
          if (tc.id) entry.id = tc.id;
          if (tc.function && tc.function.name) entry.name += tc.function.name;
          if (tc.function && tc.function.arguments) entry.arguments += tc.function.arguments;
          toolCalls.set(idx, entry);
        }
        continue; // never forwarded to the client — not a shape it parses
      }
      if (delta.content || delta.reasoning_content) {
        res.write(`data: ${JSON.stringify(json)}\n\n`);
      }
    }
  }

  if (finishReason === 'tool_calls' && toolCalls.size > 0 && roundsLeft > 0) {
    const calls = [...toolCalls.values()];
    const assistantMsg = {
      role: 'assistant',
      content: null,
      tool_calls: calls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })),
    };
    const toolResultMsgs = await Promise.all(calls.map(async c => ({
      role: 'tool',
      tool_call_id: c.id,
      content: JSON.stringify(await runTool(c.name, c.arguments)),
    })));
    return streamChatWithTools(res, [...messages, assistantMsg, ...toolResultMsgs], model, roundsLeft - 1);
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

app.post('/api/chat', async (req, res) => {
  const messages = req.body && req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }
  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
  }
  for (const m of messages) {
    if (!m || !['user', 'assistant', 'system'].includes(m.role)) {
      return res.status(400).json({ error: 'Invalid message shape' });
    }
    if (typeof m.content === 'string') {
      if (m.content.length > MAX_MESSAGE_CHARS) {
        return res.status(400).json({ error: `A message is too long (max ${MAX_MESSAGE_CHARS} characters)` });
      }
    } else if (Array.isArray(m.content)) {
      // Vision-style multi-part content ([{type:'text',...}, {type:'image_url',...}])
      // — ai.html's image-attach feature. Loosely shape-checked; the
      // upstream model server is what actually interprets these. Sized for
      // a base64 data URI (LM Studio's vision support needs one, not a
      // remote URL like OpenAI's actual API accepts), not just a short URL
      // string — a resized-on-the-client image comfortably fits under this.
      if (m.content.length > 4 || JSON.stringify(m.content).length > MAX_IMAGE_CONTENT_CHARS) {
        return res.status(400).json({ error: 'Message content is too large' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid message shape' });
    }
  }

  // Optional client-picked model (ai.html's dropdown, sourced from the
  // config/aiModels Firestore doc — not validated against that list here,
  // since this proxy has no Firebase access; if the upstream doesn't have
  // the requested model loaded, it just errors, same as any other bad
  // request. Falls back to AI_MODEL when omitted, matching the old
  // single-model behavior.
  const clientModel = typeof req.body.model === 'string' ? req.body.model.trim() : '';
  if (clientModel.length > 200) {
    return res.status(400).json({ error: 'Model id is too long' });
  }
  const model = clientModel || AI_MODEL;

  // Tools are opt-in (client must send `tools: true`), NOT on by default —
  // just including the `tools` field in the upstream request, regardless
  // of whether the model ever actually calls one, was enough to derail this
  // model's <think>-tag instruction-following: it started narrating its
  // tool-use reasoning ("No tool use is necessary...") as plain visible
  // output instead of wrapping it, even with the system prompt explicitly
  // asking for tags. Confirmed by comparing the same prompt with and
  // without `tools` attached — only breaks with it present.
  const useTools = req.body.tools === true;

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests — please slow down and try again in a few minutes.' });
  }
  if (busy) {
    return res.status(429).json({ error: 'The model is busy with another request — try again in a moment.' });
  }
  busy = true;

  let released = false;
  const release = () => { if (!released) { released = true; busy = false; } };
  res.on('close', release);
  try {
    await streamChatWithTools(res, messages, model, useTools ? MAX_TOOL_ROUNDS : 0);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ error: 'Could not reach the model server: ' + err.message });
    else res.end();
  } finally {
    release();
  }
});

app.listen(PORT, () => console.log(
  `AI proxy listening on port ${PORT}\n` +
  `  forwarding to -> ${AI_UPSTREAM}\n` +
  `  model          -> ${AI_MODEL}`
));
