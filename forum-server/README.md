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

**Privacy note:** `USER_FILES_DIR` defaults to `/storage/emulated/0/Documents`
directly. This is safe from casually exposing everything in that folder
because `/my-files` only ever returns entries recorded in
`file-owners.json` — never a raw directory listing. The one residual risk:
`/docs/:filename` static-serves the whole folder, so a pre-existing file in
Documents with a guessable name would technically be fetchable by URL if
someone guessed it. If that matters to you, point `USER_FILES_DIR` at a
dedicated subfolder instead (see below).

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
the top of `forum.html`'s script.

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
