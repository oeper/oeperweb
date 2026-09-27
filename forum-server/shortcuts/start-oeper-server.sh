#!/usr/bin/env bash
# One-tap home-screen icon for the AIO server startup sequence, via
# Termux:Widget (a separate app from F-Droid — Termux itself only runs it if
# you open it manually).
#
# Setup (one time):
#   1. Install Termux:Widget from F-Droid (same source as Termux — not the
#      Play Store version).
#   2. mkdir -p ~/.shortcuts
#      ln -s ~/oeperweb/forum-server/shortcuts/start-oeper-server.sh ~/.shortcuts/
#      chmod +x ~/oeperweb/forum-server/shortcuts/start-oeper-server.sh
#      (edit REPO_DIR below first if your checkout isn't at ~/oeperweb)
#   3. Long-press your home screen → Widgets → Termux:Widget → drag it on →
#      pick "start-oeper-server.sh". Tapping it now runs steps 4 below.
#
# What it does: pulls the latest code, restarts the Node server, and starts
# the Cloudflare tunnel if it isn't already running and a TUNNEL_TOKEN is
# set in forum-server/.env — the exact same steps as aio.sh's "Restart" plus
# "Start tunnel", just without the menu, so it's a single tap.
set -u

REPO_DIR="$HOME/oeperweb"           # <- change this if your checkout lives elsewhere
SERVER_DIR="$REPO_DIR/forum-server"
ENV_FILE="$SERVER_DIR/.env"
LOG_FILE="$SERVER_DIR/server.log"
TUNNEL_LOG_FILE="$SERVER_DIR/cloudflared.log"

have() { command -v "$1" >/dev/null 2>&1; }
notify() { # notify TITLE MESSAGE — uses Termux:API's notification if installed, falls back to a toast, falls back to nothing
  if have termux-notification; then termux-notification --title "$1" --content "$2" >/dev/null 2>&1
  elif have termux-toast; then termux-toast "$1: $2"
  fi
}

if [ ! -d "$SERVER_DIR" ]; then
  notify "oeper.dev server" "REPO_DIR is wrong — edit start-oeper-server.sh"
  exit 1
fi

cd "$REPO_DIR" && git pull >/dev/null 2>&1

pkill -f "upload-server.js" >/dev/null 2>&1
sleep 1
if [ -f "$ENV_FILE" ]; then
  ( cd "$SERVER_DIR" && nohup node upload-server.js >>"$LOG_FILE" 2>&1 & )
  sleep 1
fi

if ! pgrep -f "cloudflared tunnel" >/dev/null 2>&1 && have cloudflared; then
  token="$(grep -E '^TUNNEL_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -1)"
  token="${token#*=}"
  if [ -n "$token" ]; then
    ( cd "$SERVER_DIR" && nohup cloudflared tunnel run --token "$token" >>"$TUNNEL_LOG_FILE" 2>&1 & )
  fi
fi

sleep 1
if pgrep -f "upload-server.js" >/dev/null 2>&1; then
  notify "oeper.dev server" "Restarted and running."
else
  notify "oeper.dev server" "Didn't stay up — check server.log."
fi
