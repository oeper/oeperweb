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

  while (true) {
    const { done, value } = await reader.read();
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
      const delta = choice.delta || {};

      if (delta.tool_calls) {
        sawToolCall = true;
        for (const tc of delta.tool_calls) {
          const idx = tc.index || 0;
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

  return {
    finishedWithToolCalls: sawToolCall && toolCallAcc.length > 0,
    toolCalls: toolCallAcc.filter(Boolean).map((tc, i) => ({
      id: tc.id || `call_${i}`,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    })),
    assistantContent,
  };
}

// Drives the whole tool-calling conversation: streams each round straight
// to the client, and between rounds — invisibly to the client — executes
// any tool calls the model made and feeds the results back in, up to
// MAX_TOOL_ROUNDS.
function streamToolLoop(env, initialMessages) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = obj => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let workingMessages = initialMessages;
      try {
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const upstream = await env.AI.run(MODEL, { messages: workingMessages, tools: TOOLS, stream: true, max_tokens: MAX_TOKENS });
          const { finishedWithToolCalls, toolCalls, assistantContent } = await streamOneRound(upstream, send);
          if (!finishedWithToolCalls || round === MAX_TOOL_ROUNDS) break;

          workingMessages = [...workingMessages, { role: 'assistant', content: assistantContent, tool_calls: toolCalls }];
          for (const call of toolCalls) {
            const fn = TOOL_FUNCTIONS[call.function.name];
            let toolResult;
            if (!fn) {
              toolResult = JSON.stringify({ error: 'unknown tool' });
            } else {
              let args = {};
              try { args = JSON.parse(call.function.arguments || '{}'); } catch {}
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

  const stream = streamToolLoop(env, messages);

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
