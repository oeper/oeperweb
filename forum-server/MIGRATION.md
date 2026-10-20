# Moving the oeper.dev server to another computer

For moving from the phone (Searver / Termux) to a mini PC, a laptop or a VPS. Nothing is ever deleted on the old machine, so it stays a complete
backup until you decide otherwise. You can stop at any step and carry on later.

The idea: the old server opens a **key-protected, time-limited door** (`/migrate/*`). The new machine pulls everything through it, as many
times as you like (only what changed is copied), then does one last pull that briefly pauses the old server, you move the tunnel, done.

## What moves, what does not

| Moves | Does not move |
|---|---|
| file owners, folders, settings, audit log, link secret, bot hosting state and credits (all the JSON "databases") | `node_modules` (rebuilt on the new machine) |
| `.env` (only if the new machine has none; otherwise saved as `.env.from-old`) | `content-hashes.json` (holds phone paths, rebuilds by itself) |
| every Discord bot's folder (and its `node_modules` is reinstalled) | logs |
| Epicenter hosted apps, Searver APK releases | the translator model (reinstall: `translator/setup.sh`) |
| the files people uploaded (only the ones the server tracks, not the rest of the phone's Documents) | the Minecraft world (see the end) |
| trash, forum / video / project / chat attachments | |

## 0. Before you start

- Put the new machine on the **same Wi-Fi/LAN** as the phone if you can: copying over the LAN is much faster than through the tunnel.
- Find the phone's LAN address (Searver shows it on the **Move to another computer** card; or Settings > Wi-Fi). Below it is `PHONE-IP`.
- Get the repo on the new machine: `git clone https://github.com/oeper/oeperweb` (or download the zip) and open a terminal in `oeperweb/forum-server`.

## 1. Open the door on the old server

In the Searver app: **Servers > Move to another computer > Allow moving for 24 hours**. It shows the key and the exact command to paste.

Or by hand in Termux, inside `forum-server`:

```bash
node migrate.js enable --hours 24
```

It prints the key. The door closes by itself when the time is up, and `node migrate.js disable` (or the app's **Stop allowing**) closes it at once.
The server does **not** need a restart (it reads `.env` on every request); if it is an older version, `git pull` and restart it once first.

## 2. Install the server on the new machine

**Windows** (PowerShell as Administrator, in `forum-server\pc`):

```powershell
.\install-windows.ps1 -NeverSleep
```

**Linux** (in `forum-server/pc`):

```bash
./install-linux.sh
```

This installs Node if needed, the packages, creates a `.env`, and sets the server to start at boot and restart if it stops. It does **not** touch
the Cloudflare tunnel yet, so the phone keeps serving the public address. Add `-DryRun` / `--dry-run` to see what it would do first.

## 3. Copy everything over

On the new machine, in `forum-server`:

```bash
node migrate.js pull --from http://PHONE-IP:8787 --key THE-KEY
```

- Safe to stop (Ctrl+C) and run again: finished files are skipped, half-finished ones resume.
- Run it again any time to catch up; only changed files are copied.
- Bots without `node_modules` get `npm install` automatically (`--skip-bot-install` to skip that).
- The old `.env` is copied only if there is none here; otherwise it is saved next to it as `.env.from-old` so you can compare. The `MIGRATE_*` lines are removed from the copy.

Check it:

```bash
node migrate.js verify --from http://PHONE-IP:8787 --key THE-KEY
node migrate.js doctor
```

`verify` compares SHA-256 of every file (add `--sample 100` for a quick spot check). `doctor` checks Node, the folders, `.env`, the port and the tunnel.

## 4. Try it before switching

Start (or restart) the new server and open `http://NEW-PC-IP:8787/` from another device: you should see the same files, bots and accounts' data.
Nothing public changes yet.

## 5. Cut over

1. Make sure nobody is mid-upload. The pause lasts at most 30 minutes and ends by itself.
2. On the new machine do the **final pull**. It pauses the old server (everything except `/migrate` answers 503), copies the last changes:

   ```bash
   node migrate.js pull --from http://PHONE-IP:8787 --key THE-KEY --final
   node migrate.js verify --from http://PHONE-IP:8787 --key THE-KEY
   ```

3. Move the tunnel. Put the **same `TUNNEL_TOKEN`** the phone uses in the new `.env` (or pass it on the command line), then:

   - Windows: `.\install-windows.ps1 -Tunnel` (add `-TunnelToken <token>` if it is not in `.env`)
   - Linux: `./install-linux.sh --tunnel`

   Then **stop the tunnel on the phone** (Searver > Servers > stop tunnel, or stop `cloudflared` in Termux). Two connectors with the same token
   share the traffic, so leaving both on would send some visitors to the paused/old server.
4. Open your public address and check it. Then on the phone: `node migrate.js disable` (or **Stop allowing**).

If anything looks wrong, **roll back**: stop the tunnel on the new machine (`cloudflared service uninstall`, or stop the Windows service), start it on
the phone again, and `node migrate.js unfreeze --from http://PHONE-IP:8787 --key THE-KEY` (or just wait: the pause ends after 30 minutes).
The phone still has everything.

## 6. After the move

- **Sleep:** a server PC must not sleep. Windows: `-NeverSleep` on the installer (or Power options). Linux: `sudo systemctl mask sleep.target suspend.target`.
- **Translator:** `cd translator && ./setup.sh` on the new machine (Linux/WSL); the model is downloaded again.
- **Searver app on the phone:** it is a normal app that also controls Minecraft; it keeps working but its servers card no longer has to run the website. Leave the tunnel off there.
- **`RELEASE_KEY` / app updates:** the Searver update channel through the Cloudflare worker does not depend on the server, so it keeps working.
- **Backups:** the old phone is your backup for now. Once you are happy, copy `forum-server` data folders somewhere else regularly (all state lives in the files listed above).
- **Keys that are in `.env`** (Discord webhook, Firebase, release keys...) came with it. Give them a glance in `.env` on the new machine.

## Minecraft world

The world is not part of this tool. Use Searver's existing world zip export, copy the zip to the new machine and unpack it as the world of the Minecraft server you run there
before starting it. Players need the new machine's address (or the same one once you point it there).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `404` from `/migrate/info` | the door is closed or expired: `enable` again; or the old server is an older version (`git pull` + restart) |
| `401` / "wrong key" | the key changed after `enable`/`disable`: copy the new one |
| `503` from the old server | it is paused by a `--final` pull; `unfreeze` it, or wait up to 30 minutes |
| pull is slow | use the phone's LAN address, not the public one |
| a file is missing | only files the server tracks (`file-owners.json`) move from the files folder; copy anything else by hand |
