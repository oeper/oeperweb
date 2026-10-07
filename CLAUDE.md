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
- `cf-ai-worker/` — Cloudflare Worker replacing `ai-proxy.js` (Workers AI); deploy with `npx wrangler deploy`.
- `one/`, `one-src/` — "One" office suite (`bundle.py` builds `one/index.html` from `one-src/*`). Edit `one-src`, then rebundle.
- `firestore.rules` — Firestore security rules (auth is Firebase; owner accounts = admins).

## Conventions
- Recent history is mostly "epic AI: …" commits touching `ai.html` + `shared/ai-*.js`.
- No tests/linters configured. Check changes by loading the page (`.claude/launch.json` serves statically on :8080).
- No Discord *bot* code exists yet; Discord is only used for the report webhook.

## User preferences
- Fix every problem mentioned in a message; pay attention to detail.
- In chat, only say what I want them to do or what I know; keep it short.
- Keep this file updated so the repo doesn't need re-reading.
