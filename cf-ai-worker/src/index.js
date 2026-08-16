// Public proxy in front of Cloudflare Workers AI, replacing the old
// ai-proxy.js (which forwarded to LM Studio running on a home PC over a
// Cloudflare Tunnel). Same request/response contract as that server —
// ai.html only needed its AI_ENDPOINT constant changed, nothing else —
// but this one has no home-network dependency at all: it's Cloudflare's
// own infrastructure end to end, so it doesn't go down when a PC or tunnel
// does.
//
// Web search via a hand-rolled tool-calling loop, backed by the Brave
// Search API — needs a BRAVE_API_KEY secret (see README). This replaces
// ai-proxy.js's old get_current_datetime/calculate/search_oeper_dev loop,
// which an earlier version of this file deliberately left out as "the
// least-tested, most complex part" of a straight port — added back now,
// search only, once actually asked for.
//
// Originally tried @cloudflare/ai-utils' runWithTools() for this instead of
// hand-rolling it — abandoned after testing showed it never actually
// surfaced the tool definitions to the model at all (its own reasoning
// said outright "I do not have access to tools by default", even though
// the exact same tools array passed straight to the raw env.AI.run()
// binding worked correctly and triggered a real tool_calls response). The
// loop below drives env.AI.run() directly instead: call the model, check
// message.tool_calls, execute anything requested via TOOL_FUNCTIONS, feed
// the result back in as a 'tool' message, repeat.
//
// That loop isn't stream-compatible (each round is a plain non-streaming
// call so the tool_calls / tool-result messages can be read and appended
// before the next round), so unlike the no-tools version this file used to
// be, the model's whole answer is generated up front and then wrapped as a
// single SSE chunk in the same data:{"choices":[{"delta":{"content":...}}]}
// shape a real stream used to send incrementally — ai.html's parser doesn't
// know the difference, it just gets the text as one chunk instead of many.
// Trade-off: no more live token-by-token typing effect, since there's no
// way to reveal a partial answer before generation is fully done anyway
// (it might still trigger another tool call).
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
// Vision messages (ai.html's image attach) carry a base64 data URI instead
// of plain text — sized for one resized image with comfortable margin, not
// a whole conversation's worth.
const MAX_IMAGE_CONTENT_CHARS = 6 * 1024 * 1024;
const MAX_TOKENS = 1024;
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

// Packages one complete answer (plus, if present, its reasoning) as SSE
// chunks in the same shape a real stream:true response from env.AI.run()
// sends incrementally — see the file header for why this can't be
// genuinely progressive when tools are involved. ai.html's reader loop
// (which already separately handles delta.reasoning_content vs
// delta.content, feeding its collapsible "thinking" block) just sees it as
// a very short stream instead of a long one.
function fakeStreamFromMessage(message) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const send = obj => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      if (message.reasoning_content) send({ choices: [{ delta: { reasoning_content: message.reasoning_content } }] });
      send({ choices: [{ delta: { content: message.content || '' } }] });
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
];
const TOOL_FUNCTIONS = { search_web: searchWeb };
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
      if (m.content.length > MAX_MESSAGE_CHARS) {
        return json({ error: `A message is too long (max ${MAX_MESSAGE_CHARS} characters)` }, 400, request);
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

  // Manual tool loop: call the model, and if it asks to call a tool,
  // execute it and feed the result back in as a 'tool' message, repeating
  // until it answers in plain text or MAX_TOOL_ROUNDS is hit (a model stuck
  // calling tools forever shouldn't hang the request indefinitely).
  let workingMessages = messages;
  let message = {};
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await env.AI.run(MODEL, { messages: workingMessages, tools: TOOLS, max_tokens: MAX_TOKENS });
    } catch (err) {
      return json({ error: 'Could not reach the model: ' + err.message }, 502, request);
    }
    message = (result && result.choices && result.choices[0] && result.choices[0].message) || {};
    if (!message.tool_calls || message.tool_calls.length === 0 || round === MAX_TOOL_ROUNDS) break;

    workingMessages = [...workingMessages, { role: 'assistant', content: message.content || '', tool_calls: message.tool_calls }];
    for (const call of message.tool_calls) {
      const fn = TOOL_FUNCTIONS[call.function && call.function.name];
      let toolResult;
      if (!fn) {
        toolResult = JSON.stringify({ error: 'unknown tool' });
      } else {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
        try { toolResult = await fn(args, env); } catch (err) { toolResult = JSON.stringify({ error: err.message }); }
      }
      workingMessages.push({ role: 'tool', tool_call_id: call.id, name: call.function && call.function.name, content: toolResult });
    }
  }
  const stream = fakeStreamFromMessage(message);

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

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    return json({ error: 'Not found' }, 404, request);
  },
};
