# Forum + personal file storage server

A tiny Node server backing `files.html` (personal cloud storage — anyone
signed in can upload; each account only sees its own files; owners see
everyone's for moderation) and the forum:

- **`/upload`** — forum post/comment attachments (any signed-in user, any
  file type, not just images) for `forum.html`. Not part of the per-account
  system below and never listed as a directory — only reachable via the
  exact URL a specific post/comment embeds.
- **`/upload-file`** — personal file uploads, any signed-in user, saved into
  `USER_FILES_DIR`. Who uploaded each file is recorded in `file-owners.json`
  (a small local JSON "database" next to the script — gitignored, never
  committed, since it holds real users' emails).
- **`/my-files`** — requires sign-in. Returns the requesting account's own
  uploads; owners get everyone's.
- **`DELETE /docs/:name`** — requires sign-in; only the file's own uploader
  or an owner can delete it.
- **`/report`** — relays the forum's Report button to a Discord webhook,
  kept server-side so the webhook URL is never exposed in the site's public
  source (anyone who got hold of it could post arbitrary spam to your
  Discord channel)

**Privacy note:** `USER_FILES_DIR` defaults to a dedicated subfolder,
`Documents/oeperweb-files` — deliberately *not* your whole Documents folder.
Don't repoint it at a folder with anything else in it.

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

By default, uploaded files live inside Termux's private app storage —
invisible to the Files app, gallery, or a computer plugged in over USB. To
save them in regular "Internal storage / Download" instead:

```sh
termux-setup-storage
```

This prompts for a storage permission and creates a `~/storage/` folder full
of symlinks into shared storage (`~/storage/downloads` → Internal
storage/Download, `~/storage/dcim` → Camera, etc.). One-time setup.

Then start the server with `UPLOAD_DIR` pointing into it — this creates and
uses a `forum` subfolder under Download:

```sh
UPLOAD_DIR=~/storage/downloads/forum PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

Uploaded images will then show up at **Internal storage → Download → forum**
in the Files app. Only downside: shared storage is slightly slower to write
to than Termux's own storage, which won't matter at this scale.

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

`USER_FILES_DIR` defaults to `/storage/emulated/0/Documents/oeperweb-files`
— see the privacy note above before pointing this anywhere else. You'll
need `termux-setup-storage` (see above) so Termux can write to shared
storage at all. Override with an env var:

```sh
USER_FILES_DIR=~/storage/downloads/files PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Changing the Discord report webhook

`DISCORD_REPORT_WEBHOOK` in `upload-server.js` is hardcoded as a fallback,
but you can override it without editing the file by setting an environment
variable instead:

```sh
DISCORD_REPORT_WEBHOOK=https://discord.com/api/webhooks/... PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
```

## Putting it all together

Most of the time you'll want several of these env vars set at once, e.g.
forum attachments in Download/forum, owner files in Documents, and your
current tunnel URL:

```sh
UPLOAD_DIR=~/storage/downloads/forum \
USER_FILES_DIR=/storage/emulated/0/Documents/oeperweb-files \
PUBLIC_BASE_URL=https://your-tunnel-url \
node upload-server.js
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
