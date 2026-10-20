#!/usr/bin/env bash
# Sets a Linux mini PC up to run the oeper.dev server (forum-server/): packages, a .env, and a systemd service that starts at boot and
# restarts the server if it stops. The Cloudflare tunnel is a separate, deliberate step (--tunnel) so two machines never answer for
# fs.oeper.dev at the same time.
#
#   cd forum-server/pc
#   ./install-linux.sh                     server only (safe while the phone is still serving)
#   node ../migrate.js pull --from http://PHONE-IP:8787 --key KEY       (copy everything over, see MIGRATION.md)
#   ./install-linux.sh --tunnel            at cutover: installs and starts cloudflared with the TUNNEL_TOKEN from .env
#
# Options: --dry-run   only print what would be done        --tunnel   also install the tunnel service
#          --token T   the tunnel token (saved to .env)
# Needs Node 18+ already installed (apt install nodejs npm, or nvm/fnm for a newer one) and sudo for the service.
set -euo pipefail

DRY=0; TUNNEL=0; TOKEN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;; --tunnel) TUNNEL=1 ;; --token) TOKEN="${2:-}"; shift ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
  shift
done

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER="$(cd "$HERE/.." && pwd)"
ENV_FILE="$SERVER/.env"
RUN_USER="${SUDO_USER:-${USER:-$(id -un)}}"

step() { printf '\n== %s\n' "$1"; }
act() { # act "what" cmd...
  local what="$1"; shift
  if [ "$DRY" = 1 ]; then echo "   [dry run] $what"; else echo "   $what"; "$@"; fi
}
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$DRY" = 0 ] && [ "$(uname -s)" != "Linux" ]; then echo "This script is for Linux with systemd. On Windows use install-windows.ps1."; exit 1; fi
echo "Server folder: $SERVER  (service runs as $RUN_USER)"

step "Node.js"
if have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then echo "   found Node $(node -v)"
elif [ "$DRY" = 1 ]; then echo "   [dry run] Node 18+ would be required"
else echo "   Node 18 or newer is needed. Install it (Debian/Ubuntu: sudo apt install nodejs npm, or use nvm/fnm) and run this again."; exit 1; fi
NODE_BIN="$(command -v node || echo /usr/bin/node)"

step "npm packages"
act "npm install --omit=dev (a minute or two)" bash -c "cd '$SERVER' && npm install --omit=dev --no-audit --no-fund"

step ".env"
if [ -f "$ENV_FILE" ]; then echo "   .env exists, leaving it alone"
else
  if [ "$DRY" = 1 ]; then BASE="https://fs.oeper.dev"; else read -r -p "   Public address of this server [https://fs.oeper.dev]: " BASE; BASE="${BASE:-https://fs.oeper.dev}"; fi
  act "creating .env" bash -c "printf 'PUBLIC_BASE_URL=%s\nPORT=8787\n' '$BASE' > '$ENV_FILE'"
fi
if [ -n "$TOKEN" ]; then
  act "saving TUNNEL_TOKEN to .env" bash -c "grep -v '^[[:space:]]*TUNNEL_TOKEN[[:space:]]*=' '$ENV_FILE' > '$ENV_FILE.tmp' || true; echo 'TUNNEL_TOKEN=$TOKEN' >> '$ENV_FILE.tmp'; mv '$ENV_FILE.tmp' '$ENV_FILE'; chmod 600 '$ENV_FILE'"
fi

step "Start at boot (systemd service oeper-server, restarts if it stops)"
UNIT="[Unit]
Description=oeper.dev server (forum-server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$SERVER
ExecStart=$NODE_BIN upload-server.js
Restart=always
RestartSec=5
StandardOutput=append:$SERVER/server.log
StandardError=append:$SERVER/server.log

[Install]
WantedBy=multi-user.target
"
if [ "$DRY" = 1 ]; then echo "   [dry run] would write /etc/systemd/system/oeper-server.service:"; printf '%s\n' "$UNIT" | sed 's/^/      /'
else
  printf '%s' "$UNIT" | sudo tee /etc/systemd/system/oeper-server.service >/dev/null
  sudo systemctl daemon-reload && sudo systemctl enable --now oeper-server
  sleep 3; curl -fsS http://127.0.0.1:8787/ >/dev/null && echo "   the server answers on port 8787" || echo "   no answer yet: journalctl -u oeper-server, or $SERVER/server.log"
fi

if [ "$TUNNEL" = 1 ]; then
  step "Cloudflare tunnel (this machine starts answering for your public address NOW)"
  T="$TOKEN"
  if [ -z "$T" ] && [ -f "$ENV_FILE" ]; then T="$(grep -E '^[[:space:]]*TUNNEL_TOKEN[[:space:]]*=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"' ")"; fi
  if [ -z "$T" ] && [ "$DRY" = 0 ]; then echo "   No TUNNEL_TOKEN: use --token, or put TUNNEL_TOKEN=... in .env (the same token the phone uses)."; exit 1; fi
  if ! have cloudflared; then
    ARCH="$(uname -m)"; case "$ARCH" in x86_64) A=amd64 ;; aarch64|arm64) A=arm64 ;; *) A=amd64 ;; esac
    act "downloading cloudflared ($A) from Cloudflare's GitHub releases" bash -c "curl -fsSL -o /tmp/cloudflared.bin https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$A && sudo install -m 0755 /tmp/cloudflared.bin /usr/local/bin/cloudflared"
  fi
  if systemctl list-unit-files 2>/dev/null | grep -q '^cloudflared.service'; then echo "   the cloudflared service already exists (to change the token: sudo cloudflared service uninstall, then run this again)"
  else act "cloudflared service install <token>" sudo cloudflared service install "$T"; fi
  echo "   Now stop the tunnel on the OLD machine (Searver > Servers > stop tunnel), then check your public address."
else
  echo; echo "(The tunnel was not touched. When you are ready to switch, run:  ./install-linux.sh --tunnel )"
fi

echo; echo "Done. Check:  node $SERVER/migrate.js doctor"
