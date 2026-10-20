# epic AI for the browser

A Chrome / Edge / Brave extension (Manifest V3, Chrome 116+). Side panel with two modes:

- **Do**: epic AI works in your browser for you (reads the page, clicks, types, scrolls, opens tabs) one step at a time until the goal is done.
- **Ask**: chat about the page you are on ("Use this page" sends its text).

It can also be the *hands* for any MCP app (Claude Code, Claude Desktop, ...) through the local bridge in `mcp-bridge/`.

## Install (unpacked)

1. `chrome://extensions` -> turn on **Developer mode** -> **Load unpacked** -> pick this `epicai-extension` folder.
2. Click the epic AI icon (or Ctrl+Shift+E) to open the side panel -> gear -> **Sign in** (same oeper.dev account as the site and the apps; guests only get 10k tokens a day, an agent run uses a few k per step).

Chrome 137+ branded builds ignore `--load-extension` on the command line, so use the Load unpacked button.

## How "Do" works

`background.js` loops: snapshot the tab (`content.js` lists the visible interactive elements with stable numbers + the visible text) -> ask the epic AI worker (`POST /api/chat`, `quiet:true`, so it costs tokens but not "messages") for ONE JSON action -> run it -> repeat, max 30 steps. Actions: click, type, select, scroll, press, hover, navigate, new_tab, switch_tab, read_text, find, screenshot (sent as a picture next turn), wait, ask_user, confirm, done. Page text is wrapped as untrusted data and the prompt tells the model never to follow instructions found on pages.

Safety, enforced in code (not only in the prompt):
- Password / card / CVV / SSN / one-time-code fields and anything that looks like a card number are refused.
- Risky buttons (buy, pay, send, post, delete, submit, subscribe, accept, ...) and form submits with such a button ask you in the panel first, whatever the model says.
- "Stay out of these sites" list (panel settings) blocks reading and acting on those hosts.
- Only http(s) addresses open; browser pages, the Web Store and the PDF viewer can't be touched. No downloads.
- A glowing border and a **Stop** pill show on the tab being driven. Stop on the pill with nothing running also switches the MCP bridge off.

## MCP bridge

```
MCP app --stdio--> mcp-bridge/server.mjs --WebSocket 127.0.0.1:17615--> extension --> your tab
```

No dependencies (Node 18+). Add it to an MCP app:

```bash
claude mcp add epic-browser -- node C:/path/to/oeperweb/epicai-extension/mcp-bridge/server.mjs
```

First start prints a key and saves it to `~/.epicai-bridge-key`. In the panel: gear -> MCP bridge -> paste the key, tick **Allow the local bridge**. Off by default. Only a `chrome-extension://` origin that knows the key can connect; a second MCP app's copy of the script forwards its calls to the first. Tools: `browser_snapshot, navigate, click, type, select, hover, scroll, press_key, read_text, screenshot, back, forward, reload, wait, tabs, tab_new, tab_select, tab_close`. Risky clicks still need your OK in the open panel (without the panel open they are refused).

## Sign-in

The panel opens `https://oeper.dev/ext-auth.html?state=...`; that page signs in with Google and posts the Firebase refresh token to `auth-bridge.js` (content script on that page only), which hands it to `background.js` (state must match). The service worker refreshes ID tokens itself via `securetoken.googleapis.com`.

## Not done / known limits

- Synthetic events only (no Chrome DevTools-protocol input), so a few sites that check `isTrusted` ignore clicks; cross-origin iframes (captchas, some payment forms) are not seen.
- Sign-in through `ext-auth.html` and a long real run signed in have not been exercised (only a guest run + scripted runs + the bridge were).
- Not on the Chrome Web Store; no Firefox/Safari build.
