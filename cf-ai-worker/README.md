# oeper-ai-worker

Replaces `forum-server/ai-proxy.js` (LM Studio on a home PC, reached over a
Cloudflare Tunnel) with a Cloudflare Worker calling Workers AI directly.
Same request/response contract, so `ai.html` only needs its `AI_ENDPOINT`
constant pointed at this Worker's URL — nothing else about the page changes.

The main upside over the old setup: this has no home-network dependency at
all. It doesn't go down when your PC or tunnel does.

## One-time setup

1. **Log into Wrangler** (Cloudflare's CLI) — this opens a browser window to
   authorize:

   ```bash
   cd cf-ai-worker
   npx wrangler login
   ```

2. **Deploy:**

   ```bash
   npx wrangler deploy
   ```

   This prints a URL like `https://oeper-ai.<your-subdomain>.workers.dev` —
   that's your new `AI_ENDPOINT`.

3. **(Optional) Custom domain.** In the Cloudflare dashboard: Workers &
   Pages → `oeper-ai` → Settings → Domains & Routes → Add → Custom Domain.
   Since `oeper.dev` is already on Cloudflare, you can point something like
   `ai3.oeper.dev` at this Worker with a couple of clicks — no separate
   tunnel needed, unlike the old `ai.oeper.dev` setup. If you do this,
   uncomment the `routes` block in `wrangler.toml` to match, and redeploy.

4. **Point `ai.html` at it** — update the `AI_ENDPOINT` constant (see the
   comment near the top of the script in `ai.html`) to whatever URL you got
   from step 2 or 3, then commit/push as usual.

## Local dev

```bash
npx wrangler dev
```

Runs the Worker locally against real Workers AI (it still calls Cloudflare's
actual AI service, not a local model) — useful for testing changes to
`src/index.js` before deploying.

## What's different from ai-proxy.js

- **No home-network dependency** — this is Cloudflare's own infrastructure
  end to end.
- **No single-flight "busy" lock** — the old proxy only let one request
  through at a time because the local model could only usefully serve one
  generation at a time. Workers AI handles real concurrency fine, so that
  restriction is gone.
- **`/api/models` always returns an empty list** — Workers AI doesn't have
  a "currently loaded" concept the way LM Studio does; there's just the one
  configured model (see `MODEL` at the top of `src/index.js`), always
  available. `ai.html`'s model dropdown still works — it just won't show
  anything beyond what's manually added to the `config/aiModels` Firestore
  document in admin.html, plus the default.
- **Rate limiting is best-effort** — an in-memory `Map` inside the Worker,
  same idea as before, but a Worker isolate's memory isn't shared across
  Cloudflare's edge locations or preserved across cold starts, so this is
  "keep casual overuse in check," not a hard global limit. Fine for a
  personal site's AI page; would need Durable Objects or KV for anything
  stronger.
- **No tool use.** ai-proxy.js had a get_current_datetime / calculate /
  search_oeper_dev tool-calling loop; this is a deliberately minimal
  prompt-in, response-out relay instead — no multi-round tool loop, no
  translation of the model's output at all, `/api/chat` just pipes
  `env.AI.run()`'s stream straight back to the client. Can be added back
  later if wanted, but it was the least-tested, most complex part of the
  old proxy and wasn't worth carrying over on a straight port.
