#!/usr/bin/env bash
# Interactive menu for the server's "all-in-one" startup command — pull, set
# .env, (re)start the Node server and the Cloudflare tunnel, check status,
# and look up recent uploads — instead of retyping the AIO shell one-liner
# every time. Meant to be run ON THE PHONE, in Termux:
#
#   cd ~/oeperweb/forum-server && ./aio.sh
#
# (first time: chmod +x aio.sh)
#
# For a one-tap home-screen icon that runs the same startup sequence
# without opening this menu, see shortcuts/start-oeper-server.sh.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
ENV_FILE="$SERVER_DIR/.env"
LOG_FILE="$SERVER_DIR/server.log"
TUNNEL_LOG_FILE="$SERVER_DIR/cloudflared.log"

# ── small helpers ──────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

# Finds a running process by matching command line text. Prefers pgrep
# (present on Termux); falls back to a plain `ps` scan elsewhere so this
# still works if you try it outside Termux.
pids_matching() {
  if have pgrep; then
    pgrep -f "$1" 2>/dev/null
  else
    ps ax 2>/dev/null | grep -F "$1" | grep -v grep | awk '{print $1}'
  fi
}
is_running() { [ -n "$(pids_matching "$1")" ]; }

env_get() { # env_get KEY -> value from .env, or empty
  [ -f "$ENV_FILE" ] || return 0
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -1)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

pause() { read -r -p "Press Enter to continue… " _; }

# ── actions ─────────────────────────────────────────────────────────────
do_status() {
  echo "── status ──────────────────────────────────────"
  if is_running "upload-server.js"; then
    echo "server:     RUNNING (pid $(pids_matching "upload-server.js" | tr '\n' ' '))"
  else
    echo "server:     not running"
  fi
  if is_running "cloudflared tunnel"; then
    echo "tunnel:     RUNNING (pid $(pids_matching "cloudflared tunnel" | tr '\n' ' '))"
  else
    echo "tunnel:     not running"
  fi
  if [ -f "$ENV_FILE" ]; then
    echo ".env:       found — PUBLIC_BASE_URL=$(env_get PUBLIC_BASE_URL)"
  else
    echo ".env:       MISSING — create one (option e) before starting the server"
  fi
  if have df; then
    echo "disk free:  $(df -h "$SERVER_DIR" 2>/dev/null | awk 'NR==2{print $4" of "$2}')"
  fi
  if [ -f "$LOG_FILE" ]; then
    echo "recent server log:"
    tail -n 6 "$LOG_FILE" | sed 's/^/  /'
  fi
  echo "──────────────────────────────────────────────────"
}

do_pull() {
  echo "Pulling latest code…"
  (cd "$REPO_DIR" && git pull) || echo "git pull failed — check your connection or for local edits."
}

do_start() {
  if is_running "upload-server.js"; then
    echo "Server is already running."
    return
  fi
  if [ ! -f "$ENV_FILE" ]; then
    echo "No .env yet — set PUBLIC_BASE_URL first (option e)."
    return
  fi
  echo "Starting server (logging to $LOG_FILE)…"
  ( cd "$SERVER_DIR" && nohup node upload-server.js >>"$LOG_FILE" 2>&1 & )
  sleep 1
  if is_running "upload-server.js"; then
    echo "Server started."
  else
    echo "Server did not stay up — check $LOG_FILE:"
    tail -n 15 "$LOG_FILE" 2>/dev/null | sed 's/^/  /'
  fi
}

do_stop() {
  if ! is_running "upload-server.js"; then
    echo "Server is not running."
    return
  fi
  pkill -f "upload-server.js"
  sleep 1
  if is_running "upload-server.js"; then echo "Still running — it may need a moment, or check for a stuck process."
  else echo "Server stopped."; fi
}

do_restart() {
  do_pull
  do_stop
  do_start
}

do_tail_log() {
  [ -f "$LOG_FILE" ] || { echo "No log file yet — start the server first."; return; }
  echo "Tailing $LOG_FILE — press Ctrl+C to return to the menu."
  tail -n 40 -f "$LOG_FILE"
}

do_tunnel_start() {
  if is_running "cloudflared tunnel"; then echo "Tunnel is already running."; return; fi
  if ! have cloudflared; then echo "cloudflared isn't installed — 'pkg install cloudflared' first."; return; fi
  local token; token="$(env_get TUNNEL_TOKEN)"
  if [ -n "$token" ]; then
    echo "Starting the named tunnel using TUNNEL_TOKEN from .env (logging to $TUNNEL_LOG_FILE)…"
    ( cd "$SERVER_DIR" && nohup cloudflared tunnel run --token "$token" >>"$TUNNEL_LOG_FILE" 2>&1 & )
    sleep 2
    is_running "cloudflared tunnel" && echo "Tunnel started." || { echo "It didn't stay up — check $TUNNEL_LOG_FILE:"; tail -n 15 "$TUNNEL_LOG_FILE" 2>/dev/null | sed 's/^/  /'; }
  else
    echo "No TUNNEL_TOKEN in .env, so this can't start the tunnel for you."
    echo "Add a line like TUNNEL_TOKEN=eyJ...  to $ENV_FILE (the token from your Cloudflare Zero Trust dashboard),"
    echo "or start it yourself: cloudflared tunnel run --token <your token>"
  fi
}

do_tunnel_stop() {
  if ! is_running "cloudflared tunnel"; then echo "Tunnel is not running."; return; fi
  pkill -f "cloudflared tunnel"
  sleep 1
  is_running "cloudflared tunnel" && echo "Still running." || echo "Tunnel stopped."
}

do_uploads() {
  read -r -p "How many recent uploads? [25] " n
  n="${n:-25}"
  read -r -p "Filter by uploader email (blank for everyone): " who
  if [ -n "$who" ]; then
    node "$SERVER_DIR/view-uploads.js" "$n" --user "$who"
  else
    node "$SERVER_DIR/view-uploads.js" "$n"
  fi
}

do_edit_env() {
  local editor="${EDITOR:-nano}"
  have "$editor" || editor="vi"
  if [ ! -f "$ENV_FILE" ]; then
    printf 'PUBLIC_BASE_URL=https://fs.oeper.dev\n' > "$ENV_FILE"
    echo "Created $ENV_FILE with a default PUBLIC_BASE_URL."
  fi
  "$editor" "$ENV_FILE"
}

# ── menu ────────────────────────────────────────────────────────────────
while true; do
  clear 2>/dev/null || true
  echo "════════════════════════════════════════════════"
  echo "  oeper.dev file server — all-in-one control"
  echo "════════════════════════════════════════════════"
  do_status
  echo
  echo " 1) Start server"
  echo " 2) Stop server"
  echo " 3) Restart (pull latest + restart)"
  echo " 4) Refresh status"
  echo " 5) View live server log"
  echo " 6) Recent uploads (who uploaded what, and where)"
  echo " 7) Start Cloudflare tunnel"
  echo " 8) Stop Cloudflare tunnel"
  echo " 9) Edit .env"
  echo " p) Pull latest code only"
  echo " 0) Exit"
  echo
  read -r -p "Choose: " choice
  case "$choice" in
    1) do_start; pause ;;
    2) do_stop; pause ;;
    3) do_restart; pause ;;
    4) : ;; # just loops back and reprints status
    5) do_tail_log ;;
    6) do_uploads; pause ;;
    7) do_tunnel_start; pause ;;
    8) do_tunnel_stop; pause ;;
    9) do_edit_env ;;
    p|P) do_pull; pause ;;
    0) exit 0 ;;
    *) echo "Not a valid option."; pause ;;
  esac
done
