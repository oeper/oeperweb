// Public proxy in front of a small local model (LM Studio, running on a PC,
// exposed at ai.oeper.dev via its own Cloudflare Tunnel) so oeper.dev/ai can
// reach it from the internet. Separate process/port from upload-server.js on
// purpose — this one has no auth at all (by design, see README), so keeping
// it isolated means a problem here can't affect file uploads or the forum,
// and either can be restarted independently.
const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
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
// this per-request via the `model` field, see /api/chat below.
const AI_MODEL = process.env.AI_MODEL || 'ggml-org_gemma-3-1b-it-GGUF_gemma-3-1b-it-Q4_K_M';

const ALLOWED_ORIGINS = ['https://oeper.dev', 'http://localhost:8765'];

// This endpoint is intentionally open to anyone, no sign-in — see README.
// These limits exist purely to protect a small phone-hosted model from
// being hammered, not to gate who can use it.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOKENS = 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 20; // requests per IP per window

const app = express();
app.set('trust proxy', true); // req.ip reflects the real visitor through the Cloudflare Tunnel
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '200kb' }));

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

// Real, currently-loaded models from the upstream server (LM Studio's
// OpenAI-compatible /v1/models) — what ai.html's dropdown actually shows,
// since a hand-maintained list (config/aiModels in Firestore) drifts out
// of sync with whatever's actually loaded. That Firestore list still gets
// merged in client-side as extra entries, for models you want offered
// even when not currently loaded.
app.get('/api/models', async (req, res) => {
  try {
    const upstream = await fetch(`${AI_UPSTREAM}/v1/models`, {
      headers: AI_UPSTREAM_API_KEY ? { Authorization: `Bearer ${AI_UPSTREAM_API_KEY}` } : {},
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: `Model server responded ${upstream.status}` });
    }
    const data = await upstream.json();
    const models = Array.isArray(data.data) ? data.data.map(m => ({ id: m.id, label: m.id })) : [];
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the model server: ' + err.message });
  }
});

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
      // upstream model server is what actually interprets these, and
      // ai.html only ever sends an image URL (not base64), so this stays
      // small regardless.
      if (m.content.length > 4 || JSON.stringify(m.content).length > MAX_MESSAGE_CHARS * 2) {
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

  if (!checkRateLimit(req.ip)) {
    return res.status(429).json({ error: 'Too many requests — please slow down and try again in a few minutes.' });
  }
  if (busy) {
    return res.status(429).json({ error: 'The model is busy with another request — try again in a moment.' });
  }
  busy = true;

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
      }),
    });
  } catch (err) {
    busy = false;
    return res.status(502).json({ error: 'Could not reach the model server: ' + err.message });
  }

  if (!upstream.ok || !upstream.body) {
    busy = false;
    let msg = `Model server responded ${upstream.status}`;
    try { msg = (await upstream.text()).slice(0, 300) || msg; } catch {}
    return res.status(502).json({ error: msg });
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const nodeStream = Readable.fromWeb(upstream.body);
  let released = false;
  const release = () => { if (!released) { released = true; busy = false; } };
  nodeStream.on('end', release);
  nodeStream.on('error', release);
  res.on('close', release);
  nodeStream.pipe(res);
});

app.listen(PORT, () => console.log(
  `AI proxy listening on port ${PORT}\n` +
  `  forwarding to -> ${AI_UPSTREAM}\n` +
  `  model          -> ${AI_MODEL}`
));
