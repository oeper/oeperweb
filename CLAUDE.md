# oeperweb — repo map for Claude

Static website (oeper.dev, deployed via GitHub Pages / Jekyll workflow) plus small
Node services run **on a phone in Termux**, exposed through a Cloudflare Tunnel.
No build step for the site: plain HTML/CSS/JS, one `.html` per page.

## Layout
- Root `*.html` — pages (index, ai, feed, files, messages, videos, chess, admin, storage, …).
  `css.css` / `js.js` are the shared styles/scripts. `eosat.html`, `lds.html` are huge — avoid reading them whole.
- `shared/` — shared JS modules used by pages (account, topnav, footer, ai-*, settings-sync, theme-*, upload-queue, report, …).
- `data/` — `articles.json`, `downloads.json`.
- `forum-server/` — Node/Express server meant for Termux (see its README.md, which is long and authoritative):
  `upload-server.js` (uploads, files, folders, report relay to a Discord *webhook*), `storage-admin.js`
  (quotas/trash/moderation), `ai-proxy.js`, `aio.sh` (interactive Termux menu: pull, .env, start/stop server + cloudflared),
  `shortcuts/start-oeper-server.sh` (Termux:Widget one-tap start). Local JSON "databases" are gitignored (hold user emails).
- `forum-server/dbhosting.js` — Discord bot hosting, mounted by `upload-server.js` under `/dbhosting/api/*` (owner / `DBHOSTING_ALLOWED_EMAILS` only).
  Bots run as child processes (own env, crash backoff, restored on server boot); data in gitignored `dbhosting-bots/` + `dbhosting-state.json`.
  Billing: prepaid hosting credits in gitignored `dbhosting-credits.json` (`added - used` = quota; 0 stops the account's bots, top-up resumes them).
  Metered per minute: slots (1/2/4 × 192 MB) × `DBHOSTING_CREDITS_PER_SLOT_DAY` (10). Owners' bots are free. Users top up by sending oeper.dev credits
  to `DBHOSTING_BILLING_EMAIL` (default first owner); `/credits/claim` verifies via the sender's `users/{email}.lastTransfer*` (rule-validated, unlike the forgeable
  `creditTransfers` log). Owners allocate/approve/revoke accounts from the page (`/admin/*`). Non-owners only see their own bots.
  Per-bot settings (name, auto-restart, Discord status/rotating activities) live in `state[id].settings`; `dbhosting-presence.js` is preloaded into Node bots
  and applies the status to discord.js via a watched `<id>.presence.json` (see README "Settings tab").
  "Bot maker" bots (`kind:'maker'`) are no-code: `bot.config.json` + shared engine in `forum-server/bot-engine/` (`logic.js` validation/presets shared by server
  and engine, `handlers.js` command logic, `index.js` runtime); discord.js installed once in `forum-server/node_modules`. UI = "maker" tab in `dbhosting.html`.
  `GET /dbhosting/api/status` is public (counts only) and feeds a row on `status.html`.
  UI is `dbhosting.html` (oeper.dev/dbhosting). Add any new `/dbhosting/api` route to the router in `dbhosting.js`, not `upload-server.js`.
- `forum-server/app-release.js` — receives new Searver Android APKs from the dev PC (`PUT /app-release`, header `x-release-key` = `RELEASE_KEY` in .env, off when unset); saves to gitignored `app-releases/Searver.apk`, which the Searver app (same phone) reads for updates. `GET /app-release/info` is public (version only).
- `forum-server/remote-proxy.js` — forwards `/searver-remote/*` to the Searver app's remote-control server on `127.0.0.1:8799` (so another phone can control this one through the tunnel). Auth is the app's own HMAC header; this file only proxies and sets `x-real-ip` from `cf-connecting-ip`; 502 JSON when the app isn't answering.
- `cf-ai-worker/` — Cloudflare Worker replacing `ai-proxy.js` (Workers AI); deploy with `npx wrangler deploy`.
  Epic AI tools (offered only with the settings.html "epic AI" switch on): `create_document` (oneWord) and `create_discord_bot` (`botTools: true`) — the worker only streams a
  `createBot` SSE event; `ai.html` `aiCreateBot()` then creates the bot via `/dbhosting/api` (POST /bots, PUT /bots/:id/file, POST /install) as the signed-in user. Token never in code (DISCORD_TOKEN env).
- `one/`, `one-src/` — "One" office suite (`bundle.py` builds `one/index.html` from `one-src/*`). Edit `one-src`, then rebundle.
- `firestore.rules` — Firestore security rules (auth is Firebase; owner accounts = admins).

## Conventions
- Recent history is mostly "epic AI: …" commits touching `ai.html` + `shared/ai-*.js`.
- No tests/linters configured. Check changes by loading the page (`.claude/launch.json` serves statically on :8080).
- Discord is used for the report webhook (`upload-server.js`) and for hosted user bots (`dbhosting.js`); there is no first-party bot.
- Termux one-liners (install deps / run server) were given to the user in chat; the run one mirrors `shortcuts/start-oeper-server.sh` plus `termux-wake-lock`.

## User preferences
- Fix every problem mentioned in a message; pay attention to detail.
- In chat, only say what I want them to do or what I know; keep it short.
- Always push changes directly to `main` (standing permission); PR tools are unavailable in this repo's sessions.
- Keep this file updated so the repo doesn't need re-reading.
