# Forum + personal file storage server

A tiny Node server backing `files.html` (personal cloud storage — anyone
signed in can upload; each account only sees its own files; owners see
everyone's for moderation) and the forum:

- **`/upload`** — forum post/comment attachments (any signed-in user, any
  file type, not just images) for `forum.html`. Not part of the per-account
  system below and never listed as a directory — only reachable via the
  exact URL a specific post/comment embeds.
- **`/upload-file`** — personal file uploads, saved into `USER_FILES_DIR`.
  Signed-in users get a 10MB limit and unlimited uploads; who uploaded each
  file is recorded in `file-owners.json` (a small local JSON "database" next
  to the script — gitignored, never committed, since it holds real users'
  emails). You don't have to sign in to use it — anonymous uploads are
  allowed too, capped at 1 file up to 50MB per IP address (tracked in
  `anon-uploads.json`, also gitignored). Anonymous uploads aren't tied to any
  account, so they never show up in `/my-files` — the URL returned at upload
  time is the only way to reach the file again.
- **`/my-files`** — requires sign-in. Returns the requesting account's own
  uploads; owners get everyone's.
- **`DELETE /docs/:name`** — requires sign-in; only the file's own uploader
  or an owner can delete it.
- **`/report`** — relays the forum's Report button to a Discord webhook,
  kept server-side so the webhook URL is never exposed in the site's public
  source (anyone who got hold of it could post arbitrary spam to your
  Discord channel)
- **`/upload-video`** — long-form video uploads for `videos.html`, any
  signed-in user. Saved into `VIDEO_DIR` (default
  `/storage/emulated/0/Download/forum` — same folder as forum attachments)
  and capped by `MAX_VIDEO_BYTES` (default 300MB — much higher than
  `MAX_FILE_BYTES` since actual video blows past 10MB immediately).
  Title/description/votes live in Firestore (`videos` collection); this
  endpoint only stores the raw file and hands back a URL. Uploads run over
  your home connection's upload speed through the Cloudflare Tunnel, so a
  300MB file can take a while — that's a bandwidth reality, not a bug.
- **`/upload-project`** — project uploads for `projects.html`, any
  signed-in user. Saved into `PROJECT_DIR` (default
  `/storage/emulated/0/Download/projects`), capped by `MAX_PROJECT_BYTES`
  (default 100MB).
- **`/upload-message`** — chat attachments for `messages.html` (currently
  just voice messages), any signed-in user. Saved into `MESSAGE_DIR`
  (default `/storage/emulated/0/Download/messages`), capped by
  `MAX_MESSAGE_BYTES` (default 20MB).

**Privacy note:** `USER_FILES_DIR` defaults to `/storage/emulated/0/Documents`
directly. For regular signed-in users, `/my-files` only ever returns entries
recorded in `file-owners.json`, filtered to their own email — never a raw
directory listing. **Owners are the exception:** their `/my-files` response
is topped up with a real `fs.readdirSync` of `USER_FILES_DIR`, so any file
physically sitting in that folder shows up in `files.html`'s "Everyone's"
view even if it was never recorded in `file-owners.json` (uploaded before
tracking existed, dropped in manually, or a write that landed on disk but
whose metadata save failed) — shown with an "Unknown owner" label since
there's no record of who put it there. This is intentional: owners are
responsible for managing the phone's storage and need to actually see
what's on it. The residual risk this creates: `/docs/:filename`
static-serves the whole folder, so a pre-existing file in Documents with a
guessable name would technically be fetchable by URL if someone guessed it
— and now an owner browsing the "Everyone's" view would also see it listed
outright. If that matters to you, point `USER_FILES_DIR` at a dedicated
subfolder instead (see below).

It's meant to run **on your Android phone** via Termux, exposed to the
internet with a Cloudflare Tunnel — no cloud bill, no server to maintain
elsewhere.

**Trade-off to know going in:** uploads, file hosting, and reports only work
while your phone is on, connected, and running this server. If the phone
dies or the app gets killed, forum attachments and hosted file links break,
and reports silently fail (with a clear error shown to whoever tried) until
it's back up.

## 1. Install Termux

Get it from [F-Droid](https://f-droid.org/packages/com.termux/), not the Play
Store version (that one is outdated and no longer updated).

## 2. Install Node.js and git

In the Termux terminal:

```sh
pkg update && pkg upgrade
pkg install nodejs git
```

## 3. Get this folder onto your phone

```sh
git clone https://github.com/oeper/oeperweb.git
cd oeperweb/forum-server
npm install
```

## 4. Install cloudflared and start a tunnel

```sh
pkg install cloudflared
cloudflared tunnel --url http://localhost:8787
```

This prints a random URL like `https://random-words-here.trycloudflare.com`.
That's your public upload endpoint for now. It changes every time you restart
the tunnel — if you want a permanent one instead (e.g. `files.oeper.dev`),
that needs a free Cloudflare account with your domain's DNS on Cloudflare;
ask if you want to set that up later.

## 5. Start the server

In a second Termux session (swipe from the left edge → New session, so the
tunnel keeps running):

```sh
cd oeperweb/forum-server
PUBLIC_BASE_URL=https://random-words-here.trycloudflare.com node upload-server.js
```

Replace the URL with whatever `cloudflared` printed in step 4.

## 6. Wire it into the site

Copy that same tunnel URL and send it — it goes into `SERVER_ENDPOINT` near
the top of `shared/account.js` (currently `https://fs.oeper.dev`, a named
tunnel hostname — see below).

## Storing uploads in shared storage (visible in the Files app)

`UPLOAD_DIR` defaults to `/storage/emulated/0/Download/forum` — regular
shared storage, visible in the Files app, gallery, or a computer plugged in
over USB — rather than Termux's private app storage. This needs a one-time
storage permission grant:

```sh
termux-setup-storage
```

Uploaded attachments then show up at **Internal storage → Download → forum**
in the Files app. Only downside: shared storage is slightly slower to write
to than Termux's own storage, which won't matter at this scale.

Override with an env var if you want it elsewhere:

```sh
UPLOAD_DIR=/storage/emulated/0/Documents/forum PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Who has extra moderation power

`OWNER_EMAILS` in `upload-server.js` defaults to `sanhackerman@gmail.com,taejiding@gmail.com`
— keep it in sync with `OWNER_EMAILS` in `shared/account.js` and `isOwner()`
in `firestore.rules`, since those are the three places this list is
enforced. Owners can see and delete every account's files via `files.html`'s
"Everyone's" toggle; everyone else only sees and manages their own. Override
the list without editing the file:

```sh
OWNER_EMAILS=you@gmail.com,other@gmail.com PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Changing where personal files land

`USER_FILES_DIR` defaults to `/storage/emulated/0/Documents` — see the
privacy note above. You'll need `termux-setup-storage` (see above) so Termux
can write to shared storage at all. Override with an env var:

```sh
USER_FILES_DIR=~/storage/downloads/files PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Anonymous upload limits

Uploads without signing in are capped by two constants in
`upload-server.js`: `ANON_MAX_FILE_BYTES` (default 50MB) and
`ANON_UPLOAD_LIMIT` (default 1 file per IP address, tracked forever in
`anon-uploads.json`). There's no env var for these — edit the constants
directly if you want different limits. Signed-in uploads are separately
capped by `MAX_FILE_BYTES` (10MB, unlimited count, see below).

## Changing the Discord report webhook

`DISCORD_REPORT_WEBHOOK` in `upload-server.js` is hardcoded as a fallback,
but you can override it without editing the file by setting an environment
variable instead:

```sh
DISCORD_REPORT_WEBHOOK=https://discord.com/api/webhooks/... PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Putting it all together

`UPLOAD_DIR` (forum attachments → Download/forum) and `USER_FILES_DIR`
(personal files → Documents) both already default to sensible shared-storage
locations, so most of the time the only thing you need to set is your
current tunnel URL:

```sh
PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## AI proxy (ai.html / ai2.oeper.dev)

`ai-proxy.js` is a **separate script and process** from `upload-server.js` —
run it alongside, not instead of, the upload server. It backs `ai.html`, a
small chat UI that talks to [InferrLM](https://github.com/loomax-labs/InferrLM)
running on a phone on your home network (`AI_UPSTREAM`, default
`http://192.168.88.56:8889`), exposed publicly at `ai2.oeper.dev`.

**This endpoint has no sign-in and no API key, by design** — anyone with the
URL can chat with the model, no account required. That's a deliberate
trade-off, not an oversight. Since the model is small and phone-hosted, the
proxy protects it with a few limits instead of authentication:

- Only one generation in flight at a time — a second request while one is
  running gets a `429` asking it to retry shortly, rather than both crawling
  along together.
- Per-IP rate limit: `RATE_LIMIT_MAX` (default 20) requests per
  `RATE_LIMIT_WINDOW_MS` (default 10 minutes).
- `MAX_MESSAGES` (40) and `MAX_MESSAGE_CHARS` (4000) cap how much a single
  request can contain, and `MAX_TOKENS` (1024) caps how much the model is
  asked to generate back.

These are constants at the top of `ai-proxy.js`, not env vars — edit them
directly if you want different limits.

The model name shown in `ai.html` and sent to InferrLM is forced
server-side via `AI_MODEL` (defaults to the Gemma model already loaded on
the phone) — the client never has to know or guess the exact model id.

### Running it

```sh
cd oeperweb/forum-server
AI_UPSTREAM=http://192.168.88.56:8889 node ai-proxy.js
```

It listens on `PORT` (default `8788`) locally. To reach it from
`AI_UPSTREAM`, the machine running this script needs to be on the same
Wi-Fi network as whatever's running InferrLM — in practice this is easiest
if it's the *same* phone as your upload server, just a different app and
port.

### Exposing it at ai2.oeper.dev

This needs a second **Public Hostname** on the same Cloudflare Tunnel you
already set up for `fs.oeper.dev` (Zero Trust dashboard →
Networks → Tunnels → your tunnel → Public Hostname → Add a public
hostname): hostname `ai2`, domain `oeper.dev`, service
`http://localhost:8788`. One `cloudflared` connector can carry as many
public hostnames as you add this way, so you don't need a second tunnel or
a second `cloudflared` process — the same one already running for the
upload server covers this too.

## Keeping it running

Android will kill background apps to save battery. To reduce that:

- Run `termux-wake-lock` in the Termux session before starting the server
- Keep Termux's notification visible (don't swipe it away)
- Disable battery optimization for Termux in Android settings

## Changing the size limit later

Two places, must match:
- `MAX_FILE_BYTES` in `upload-server.js` (server-side enforcement)
- `MAX_IMAGE_BYTES` in `forum.html` (so the browser rejects oversized files
  before even trying to upload them)

Change both, restart the server, and you're done — no redeploy needed for
the server-side change, but `forum.html` needs to be pushed since it's part
of the static site.
