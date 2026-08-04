# Forum upload + report server

A tiny Node server for the forum (`forum.html`): accepts image uploads and
serves them back, and relays the Report button to a Discord webhook (kept
server-side so the webhook URL is never exposed in the site's public source —
anyone who got hold of it could post arbitrary spam to your Discord channel).
It's meant to run **on your Android phone** via Termux, exposed to the
internet with a Cloudflare Tunnel — no cloud bill, no server to maintain
elsewhere.

**Trade-off to know going in:** images only load, and reports only send,
while your phone is on, connected, and running this server. If the phone
dies or the app gets killed, forum images break and reports silently fail
(with a clear error shown to whoever tried) until it's back up.

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

## Changing the Discord report webhook

`DISCORD_REPORT_WEBHOOK` in `upload-server.js` is hardcoded as a fallback,
but you can override it without editing the file by setting an environment
variable instead:

```sh
DISCORD_REPORT_WEBHOOK=https://discord.com/api/webhooks/... PUBLIC_BASE_URL=https://your-tunnel-url node upload-server.js
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
