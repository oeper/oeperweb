'use strict';
// Discord bot hosting for oeper.dev/dbhosting — runs bots as child processes
// of the upload server, so the existing Termux start/restart commands and the
// Cloudflare tunnel (fs.oeper.dev) cover it with no extra service or hostname.
//
// All routes live under /dbhosting/api and need a signed-in owner (or an email
// in DBHOSTING_ALLOWED_EMAILS) — hosting a bot means running arbitrary code on
// the phone, so it is never open to ordinary accounts.
//
// Layout on disk (both gitignored):
//   dbhosting-bots/<id>/        the bot's files; .env holds its secrets
//   dbhosting-bots/<id>.log     its combined stdout/stderr
//   dbhosting-state.json        { [id]: { name, createdAt, desired } }
//   `desired` is true while the bot should be running, so a server restart
//   brings it back up.

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const multer = require('multer');
const express = require('express');

const MAX_BOTS = Number(process.env.DBHOSTING_MAX_BOTS) || 15;
const MAX_BOTS_PER_USER = Number(process.env.DBHOSTING_MAX_BOTS_PER_USER) || 3;
// A "slot" is one bot-sized chunk of the phone's RAM (NODE_MEMORY_MB below).
// MAX_SLOTS is how many can run at once across everyone; SLOT_CREDITS_PER_DAY
// is the price of one running slot. Bot size is 1, 2 or 4 slots.
const MAX_SLOTS = Number(process.env.DBHOSTING_MAX_SLOTS) || 20;
const SLOT_CREDITS_PER_DAY = Number(process.env.DBHOSTING_CREDITS_PER_SLOT_DAY) || 10;
const SIZES = [1, 2, 4];
const TICK_MS = Number(process.env.DBHOSTING_TICK_MS) || 60 * 1000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EDIT_BYTES = 1024 * 1024;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_LIST_FILES = 300;
const NODE_MEMORY_MB = Number(process.env.DBHOSTING_NODE_MEMORY_MB) || 192;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Per-bot settings (state[id].settings). `presence` is applied by dbhosting-presence.js, which is preloaded into Node bots.
// forward slashes: backslashes inside NODE_OPTIONS are read as escapes (a Windows path would break)
const PRESENCE_SHIM = path.join(__dirname, 'dbhosting-presence.js').replace(/\\/g, '/');
const PRESENCE_STATUSES = ['online', 'idle', 'dnd', 'invisible'];
const ACTIVITY_TYPES = ['playing', 'watching', 'listening', 'competing', 'streaming', 'custom'];
const MAX_ACTIVITIES = 10;

const NODE_ENTRIES = ['index.js', 'bot.js', 'main.js', 'app.js', 'src/index.js', 'src/bot.js', 'src/main.js'];
const PY_ENTRIES = ['main.py', 'bot.py', 'index.py', 'app.py', 'src/main.py', 'src/bot.py'];

module.exports = function setupDbHosting(app, ctx) {
  const { verifyFirebaseToken, isOwner, loadJson, saveJson, dataDir, billingEmail, firebaseProjectId } = ctx;
  const allowed = (process.env.DBHOSTING_ALLOWED_EMAILS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  // Hosting credits are tracked here, not in Firestore: this server has no
  // Firebase admin access, so it can't spend a user's oeper.dev balance. A
  // user "tops up" by sending oeper.dev credits to billingEmail; /credits/claim
  // verifies that transfer and adds it to their ledger entry. Owners can also
  // allocate credits directly. `added - used` is the account's remaining
  // quota — when it runs out their bots are stopped.
  //   { [email]: { approved, added, used, lastClaimKey, history: [...] } }
  const ledgerFile = path.join(dataDir, 'dbhosting-credits.json');
  const loadLedger = () => loadJson(ledgerFile);
  const saveLedger = l => saveJson(ledgerFile, l);
  const round4 = n => Math.round(n * 10000) / 10000;
  const acctOf = (led, email) => led[email] || (led[email] = { approved: false, added: 0, used: 0, lastClaimKey: null, history: [] });
  const remainingOf = a => round4(((a && a.added) || 0) - ((a && a.used) || 0));
  const slotsOf = st => (st && SIZES.includes(st.slots) ? st.slots : 1);
  const perDayOf = st => slotsOf(st) * SLOT_CREDITS_PER_DAY;
  // Owner-created bots (and any from before billing existed) are free.
  const isFree = st => !st || !st.owner || isOwner(st.owner);
  function pushHistory(a, entry) {
    a.history = (a.history || []).concat({ at: Date.now(), ...entry }).slice(-50);
  }
  const canHost = email => {
    if (!email) return false;
    if (isOwner(email) || allowed.includes(email)) return true;
    const a = loadLedger()[email];
    return !!(a && a.approved);
  };

  const botsDir = process.env.DBHOSTING_DIR ? path.resolve(process.env.DBHOSTING_DIR) : path.join(dataDir, 'dbhosting-bots');
  const stateFile = path.join(dataDir, 'dbhosting-state.json');
  fs.mkdirSync(botsDir, { recursive: true });

  const loadState = () => loadJson(stateFile);
  const saveState = s => saveJson(stateFile, s);
  const botDir = id => path.join(botsDir, id);
  const logFile = id => path.join(botsDir, id + '.log');

  // id -> { child, startedAt, restarts, quickCrashes, timer, installing, stopping, crashed }
  const runtime = new Map();
  const rt = id => {
    if (!runtime.has(id)) runtime.set(id, { child: null, startedAt: null, restarts: 0, quickCrashes: 0, timer: null, installing: false, stopping: false, crashed: false });
    return runtime.get(id);
  };

  function appendLog(id, text) {
    try { fs.appendFileSync(logFile(id), text); } catch {}
  }
  function rotateLog(id) {
    try {
      if (fs.statSync(logFile(id)).size > MAX_LOG_BYTES) fs.renameSync(logFile(id), logFile(id) + '.old');
    } catch {}
  }

  // ── .env handling ────────────────────────────────────────────────
  function readEnv(id) {
    const out = {};
    let raw = '';
    try { raw = fs.readFileSync(path.join(botDir(id), '.env'), 'utf8'); } catch { return out; }
    for (const rawLine of raw.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (ENV_KEY_PATTERN.test(key)) out[key] = value;
    }
    return out;
  }
  function writeEnv(id, vars) {
    const body = Object.entries(vars).map(([k, v]) => `${k}=${JSON.stringify(String(v))}`).join('\n') + '\n';
    const file = path.join(botDir(id), '.env');
    fs.writeFileSync(file, body, { mode: 0o600 });
  }

  // ── what to run ──────────────────────────────────────────────────
  // Returns { cmd, args, label } or null if nothing runnable was found.
  function detectEntry(id) {
    const dir = botDir(id);
    const exists = rel => { try { return fs.statSync(path.join(dir, rel)).isFile(); } catch { return false; } };
    if (exists('package.json')) {
      let pkg = {};
      try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch {}
      if (pkg.scripts && pkg.scripts.start) return { cmd: 'npm', args: ['start', '--silent'], label: 'npm start' };
      if (pkg.main && typeof pkg.main === 'string' && exists(pkg.main)) return { cmd: 'node', args: [pkg.main], label: 'node ' + pkg.main };
    }
    for (const f of NODE_ENTRIES) if (exists(f)) return { cmd: 'node', args: [f], label: 'node ' + f };
    for (const f of PY_ENTRIES) if (exists(f)) return { cmd: 'python3', args: ['-u', f], label: 'python3 ' + f };
    return null;
  }

  // ── per-bot settings ─────────────────────────────────────────────
  const presenceFile = id => path.join(botsDir, id + '.presence.json');
  function settingsOf(st) {
    const s = (st && st.settings) || {};
    const p = s.presence || {};
    return {
      autoRestart: s.autoRestart !== false,
      presence: {
        enabled: !!p.enabled,
        status: PRESENCE_STATUSES.includes(p.status) ? p.status : 'online',
        intervalSec: Math.min(3600, Math.max(20, Number(p.intervalSec) || 60)),
        activities: Array.isArray(p.activities) ? p.activities.slice(0, MAX_ACTIVITIES) : [],
      },
    };
  }
  // Returns { settings } or { error } for an untrusted request body.
  function parseSettings(body) {
    const b = body || {};
    const out = { autoRestart: b.autoRestart !== false, presence: {} };
    const p = b.presence || {};
    if (!PRESENCE_STATUSES.includes(p.status || 'online')) return { error: 'Pick a status: online, idle, do not disturb or invisible.' };
    const acts = Array.isArray(p.activities) ? p.activities : [];
    if (acts.length > MAX_ACTIVITIES) return { error: `At most ${MAX_ACTIVITIES} statuses.` };
    const activities = [];
    for (const a of acts) {
      const text = String((a && a.text) || '').trim();
      if (!text) continue;
      if (!ACTIVITY_TYPES.includes(a.type)) return { error: 'Unknown activity type: ' + a.type };
      if (text.length > 128) return { error: 'A status can be at most 128 characters.' };
      const item = { type: a.type, text };
      if (a.type === 'streaming') {
        const url = String(a.url || '').trim();
        if (!/^https?:\/\/[^\s]{3,190}$/i.test(url)) return { error: 'A "streaming" status needs a Twitch or YouTube link (https://…).' };
        item.url = url;
      }
      activities.push(item);
    }
    out.presence = {
      enabled: !!p.enabled,
      status: p.status || 'online',
      intervalSec: Math.min(3600, Math.max(20, Number(p.intervalSec) || 60)),
      activities,
    };
    return { settings: out };
  }
  function writePresence(id) {
    try { fs.writeFileSync(presenceFile(id), JSON.stringify(settingsOf(loadState()[id]).presence), { mode: 0o600 }); } catch {}
  }
  function appliedPresence(id) {
    try { return JSON.parse(fs.readFileSync(presenceFile(id) + '.applied', 'utf8')); } catch { return null; }
  }

  // The bot only gets what it needs plus its own .env — never the server's
  // environment, which holds the tunnel token, webhook URL and API keys.
  // `forRun` is false for dependency installs, which shouldn't load the presence helper.
  function botEnv(id, forRun) {
    const base = {};
    for (const k of ['PATH', 'HOME', 'TMPDIR', 'PREFIX', 'LANG', 'TERM', 'TZ', 'SSL_CERT_FILE']) if (process.env[k]) base[k] = process.env[k];
    const settings = settingsOf(loadState()[id]);
    const pr = settings.presence;
    const first = pr.activities[0];
    // Every bot (any language) can read these; Node/discord.js bots also get the status applied for them.
    const presenceVars = {
      DBHOSTING_PRESENCE_FILE: presenceFile(id),
      BOT_STATUS: pr.status,
      BOT_ACTIVITY_TYPE: first ? first.type : '',
      BOT_ACTIVITY_TEXT: first ? first.text : '',
      BOT_ACTIVITIES: JSON.stringify(pr.activities),
    };
    const memory = `--max-old-space-size=${NODE_MEMORY_MB * slotsOf(loadState()[id])}`;
    return { ...base, NODE_OPTIONS: forRun ? `${memory} --require "${PRESENCE_SHIM}"` : memory, PYTHONUNBUFFERED: '1', ...(forRun ? presenceVars : {}), ...readEnv(id) };
  }

  function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

  function startBot(id) {
    const r = rt(id);
    if (r.child) return { ok: true, already: true };
    if (r.installing) return { ok: false, error: 'Dependencies are still installing' };
    const entry = detectEntry(id);
    if (!entry) return { ok: false, error: 'No entry file found. Upload an index.js / bot.js / main.py, or a package.json with a start script.' };

    const botState = loadState()[id] || {};
    if (!isFree(botState)) {
      const need = perDayOf(botState) / 24; // at least one hour must be affordable
      if (remainingOf(loadLedger()[botState.owner]) < need) {
        // Remember it, so topping up starts it again without a click.
        const st = loadState();
        if (st[id]) { st[id].desired = false; st[id].autoResume = true; delete st[id].pid; saveState(st); }
        appendLog(id, `[host] ${new Date().toISOString()} not started: out of hosting credits\n`);
        return { ok: false, error: 'Not enough hosting credits. Top up and it will start automatically.' };
      }
    }
    let slotsRunning = 0;
    for (const [oid, orr] of runtime) if (orr.child && oid !== id) slotsRunning += slotsOf(loadState()[oid]);
    if (slotsRunning + slotsOf(botState) > MAX_SLOTS) return { ok: false, error: 'The server is full right now — try again later.' };

    clearTimeout(r.timer);
    r.stopping = false;
    r.crashed = false;
    rotateLog(id);
    let fd;
    try { fd = fs.openSync(logFile(id), 'a'); } catch (e) { return { ok: false, error: 'Cannot open log file: ' + e.message }; }
    appendLog(id, `[host] ${new Date().toISOString()} starting: ${entry.label}\n`);

    let child;
    writePresence(id);
    try {
      child = spawn(entry.cmd, entry.args, { cwd: botDir(id), env: botEnv(id, true), stdio: ['ignore', fd, fd] });
    } catch (e) {
      fs.closeSync(fd);
      return { ok: false, error: 'Could not start: ' + e.message };
    }
    fs.closeSync(fd);
    r.child = child;
    r.startedAt = Date.now();

    const state = loadState();
    if (state[id]) { state[id].desired = true; delete state[id].autoResume; state[id].pid = child.pid; saveState(state); }

    child.on('error', err => appendLog(id, `[host] failed to launch ${entry.cmd}: ${err.message} (is it installed? pkg install nodejs python)\n`));
    child.on('exit', (code, signal) => {
      const ranFor = Date.now() - (r.startedAt || Date.now());
      r.child = null;
      r.startedAt = null;
      appendLog(id, `[host] ${new Date().toISOString()} exited (${signal ? 'signal ' + signal : 'code ' + code})\n`);
      const st = loadState();
      if (r.stopping || !st[id] || !st[id].desired) { r.stopping = false; return; }
      if (!settingsOf(st[id]).autoRestart) {
        st[id].desired = false;
        delete st[id].pid;
        saveState(st);
        r.crashed = true;
        appendLog(id, '[host] exited and auto-restart is off in this bot\'s settings — not restarting.\n');
        return;
      }
      // Crashed on its own: restart with backoff, give up after a streak of
      // quick crashes so a broken bot can't spin forever eating battery.
      r.quickCrashes = ranFor > 60000 ? 0 : r.quickCrashes + 1;
      if (r.quickCrashes >= 8) {
        r.crashed = true;
        st[id].desired = false;
        delete st[id].pid;
        saveState(st);
        appendLog(id, '[host] crashed 8 times in a row — not restarting. Fix the bot and press start.\n');
        return;
      }
      const delay = Math.min(30000, 1000 * 2 ** r.quickCrashes);
      r.restarts++;
      appendLog(id, `[host] restarting in ${Math.round(delay / 1000)}s\n`);
      r.timer = setTimeout(() => { if (loadState()[id]) startBot(id); }, delay);
    });
    return { ok: true };
  }

  function stopBot(id, cb) {
    const r = rt(id);
    clearTimeout(r.timer);
    const st = loadState();
    if (st[id]) { st[id].desired = false; delete st[id].autoResume; delete st[id].pid; saveState(st); }
    r.quickCrashes = 0;
    r.crashed = false;
    const child = r.child;
    if (!child) return cb && cb();
    r.stopping = true;
    child.once('exit', () => cb && cb());
    child.kill('SIGTERM');
    setTimeout(() => { if (r.child === child) child.kill('SIGKILL'); }, 5000).unref();
  }

  // After a hard kill of the server (SIGKILL, crash), bots it spawned can be
  // left running as orphans. Before restoring anything, stop leftovers whose
  // working directory proves they're ours (guards against recycled pids).
  function killStale(id, pid) {
    if (!pid || !isAlive(pid)) return;
    try {
      if (fs.readlinkSync(`/proc/${pid}/cwd`) !== botDir(id)) return;
      process.kill(pid, 'SIGTERM');
    } catch {}
  }

  function status(id) {
    const r = rt(id);
    if (r.installing) return 'installing';
    if (r.child) return 'running';
    if (r.timer && loadState()[id] && loadState()[id].desired) return 'restarting';
    const s0 = loadState()[id];
    if (s0 && s0.autoResume) return 'nocredits';
    if (r.crashed) return 'crashed';
    return 'stopped';
  }

  function listFiles(id) {
    const root = botDir(id);
    const out = [];
    (function walk(dir, rel) {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= MAX_LIST_FILES) return;
        if (e.name === 'node_modules' || e.name === '__pycache__' || e.name === '.git' || e.name === '.env') continue;
        const r2 = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r2);
        else if (e.isFile()) {
          let size = 0; try { size = fs.statSync(path.join(dir, e.name)).size; } catch {}
          out.push({ path: r2, size });
        }
      }
    })(root, '');
    return out;
  }

  // Resolves a user-supplied relative path inside a bot's folder, or null if
  // it escapes it or touches .env (which has its own API so secrets are never
  // echoed back).
  function safePath(id, rel) {
    if (typeof rel !== 'string' || !rel || rel.includes('\0')) return null;
    const root = botDir(id);
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) return null;
    const relNorm = path.relative(root, full);
    if (relNorm.split(path.sep)[0] === '.env' || path.basename(full) === '.env') return null;
    return full;
  }

  // ── auth + lookup ────────────────────────────────────────────────
  const gate = (req, res, next) => {
    verifyFirebaseToken(req, res, () => {
      if (!canHost(req.user && req.user.email)) return res.status(403).json({ error: 'Bot hosting is limited to approved accounts.' });
      next();
    });
  };
  const withBot = (req, res, next) => {
    const id = req.params.id;
    const st = loadState()[id];
    // Owners can manage every bot; everyone else only their own (404, not
    // 403, so other people's bot ids aren't confirmable).
    if (!ID_PATTERN.test(id) || !st || (!isOwner(req.user.email) && st.owner !== req.user.email)) return res.status(404).json({ error: 'No such bot' });
    req.botId = id;
    next();
  };

  const router = express.Router();
  router.use(gate);

  function describe(id, st) {
    const r = rt(id);
    const entry = detectEntry(id);
    return {
      id,
      name: st.name,
      owner: st.owner || null,
      status: status(id),
      pid: r.child ? r.child.pid : null,
      startedAt: r.startedAt,
      restarts: r.restarts,
      entry: entry ? entry.label : null,
      envKeys: Object.keys(readEnv(id)),
      createdAt: st.createdAt,
      slots: slotsOf(st),
      perDay: isFree(st) ? 0 : perDayOf(st),
      free: isFree(st),
    };
  }

  // What this account is spending right now: only its running (or about to
  // be restarted) bots count, and free bots cost nothing.
  function accountInfo(email) {
    const st = loadState();
    const a = loadLedger()[email];
    const exempt = isOwner(email);
    let burn = 0;
    for (const [id, s] of Object.entries(st)) {
      if (s.owner !== email || isFree(s)) continue;
      if (rt(id).child || s.desired) burn += perDayOf(s);
    }
    const remaining = remainingOf(a);
    return {
      email,
      exempt,
      remaining,
      added: round4((a && a.added) || 0),
      used: round4((a && a.used) || 0),
      perDay: burn,
      hoursLeft: !exempt && burn > 0 ? Math.max(0, remaining / (burn / 24)) : null,
      history: ((a && a.history) || []).slice(-5).reverse(),
    };
  }

  router.get('/bots', (req, res) => {
    const email = req.user.email;
    const all = isOwner(email);
    const st = loadState();
    const os = require('os');
    let usedSlots = 0;
    for (const [id, s] of Object.entries(st)) if (rt(id).child) usedSlots += slotsOf(s);
    res.json({
      bots: Object.keys(st).filter(id => all || st[id].owner === email).map(id => describe(id, st[id])),
      maxBots: all ? MAX_BOTS : MAX_BOTS_PER_USER,
      maxSlots: MAX_SLOTS,
      usedSlots,
      account: accountInfo(email),
      isOwner: all,
      billingEmail: billingEmail || null,
      rates: { slotPerDay: SLOT_CREDITS_PER_DAY, slotMemoryMB: NODE_MEMORY_MB, sizes: SIZES },
      system: { uptime: Math.round(os.uptime()), freeMem: os.freemem(), totalMem: os.totalmem(), load: os.loadavg()[0] },
    });
  });

  router.post('/bots', (req, res) => {
    const email = req.user.email;
    const name = String((req.body && req.body.name) || '').trim();
    if (!name || name.length > 40) return res.status(400).json({ error: 'Give the bot a name (1–40 characters).' });
    const slots = req.body && req.body.slots != null ? Number(req.body.slots) : 1;
    if (!SIZES.includes(slots)) return res.status(400).json({ error: 'Pick a size: small, medium or large.' });
    const st = loadState();
    if (Object.keys(st).length >= MAX_BOTS) return res.status(400).json({ error: `The server's limit of ${MAX_BOTS} bots is reached.` });
    if (!isOwner(email) && Object.values(st).filter(s => s.owner === email).length >= MAX_BOTS_PER_USER) {
      return res.status(400).json({ error: `Limit of ${MAX_BOTS_PER_USER} bots per account reached.` });
    }
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'bot';
    let id = base;
    for (let n = 2; st[id]; n++) id = `${base}-${n}`;
    fs.mkdirSync(botDir(id), { recursive: true });
    st[id] = { name, owner: email, slots, createdAt: Date.now(), desired: false };
    saveState(st);
    res.json(describe(id, st[id]));
  });

  // Changing size changes the price and (for Node bots) the memory cap, both
  // from the next start.
  router.post('/bots/:id/size', withBot, (req, res) => {
    const slots = Number(req.body && req.body.slots);
    if (!SIZES.includes(slots)) return res.status(400).json({ error: 'Pick a size: small, medium or large.' });
    const st = loadState();
    st[req.botId].slots = slots;
    saveState(st);
    res.json({ ok: true, restartNeeded: !!rt(req.botId).child });
  });

  // ── settings: name, auto-restart, and the bot's Discord status ────
  // A changed status reaches a running discord.js bot within a few seconds (the helper watches the file); anything
  // else reads the BOT_* variables the next time it starts.
  router.get('/bots/:id/settings', withBot, (req, res) => {
    const st = loadState()[req.botId];
    res.json({ name: st.name, settings: settingsOf(st), applied: appliedPresence(req.botId), running: !!rt(req.botId).child });
  });
  router.put('/bots/:id/settings', withBot, (req, res) => {
    const parsed = parseSettings(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const st = loadState();
    const entry = st[req.botId];
    if (req.body && typeof req.body.name === 'string') {
      const name = req.body.name.trim();
      if (!name || name.length > 40) return res.status(400).json({ error: 'Give the bot a name (1–40 characters).' });
      entry.name = name;
    }
    entry.settings = parsed.settings;
    saveState(st);
    writePresence(req.botId);
    res.json({ name: entry.name, settings: settingsOf(entry), applied: appliedPresence(req.botId), running: !!rt(req.botId).child });
  });

  // ── hosting credits ──────────────────────────────────────────────
  // Verifies the caller's latest oeper.dev credit transfer to billingEmail and
  // adds it to their hosting balance. Trust comes from firestore.rules: the
  // sender's users/{email} doc can only gain lastTransfer* fields in the same
  // atomic write that actually moves the credits, so (unlike the
  // creditTransfers log) they can't be forged. Only the latest transfer is
  // visible there, so the page claims right after every top-up.
  router.post('/credits/claim', async (req, res) => {
    const email = req.user.email;
    if (!billingEmail) return res.status(503).json({ error: 'Top-ups are not configured on this server.' });
    let doc;
    try {
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/users/${encodeURIComponent(email)}`,
        { headers: { Authorization: req.headers.authorization }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      doc = await r.json();
    } catch (e) {
      return res.status(502).json({ error: "Couldn't check your transfers: " + e.message });
    }
    const f = doc.fields || {};
    const num = v => (v ? Number(v.integerValue != null ? v.integerValue : v.doubleValue) : NaN);
    const to = f.lastTransferTo && f.lastTransferTo.stringValue;
    const net = num(f.lastTransferNet);
    const at = f.lastTransferAt && f.lastTransferAt.timestampValue;
    // Everything from here to the save is synchronous, so two claims for the
    // same transfer can't both pass the key check.
    const led = loadLedger();
    const a = acctOf(led, email);
    let added = 0;
    if (to === billingEmail && Number.isFinite(net) && net > 0 && at) {
      const key = `${at}|${net}`;
      if (a.lastClaimKey !== key) {
        a.lastClaimKey = key;
        a.added = round4((a.added || 0) + net);
        pushHistory(a, { type: 'top-up', amount: net });
        saveLedger(led);
        added = net;
      }
    }
    res.json({ added, remaining: remainingOf(a) });
    if (added) resumeCredited(email);
  });

  // Owner-only: allocate (or take back) hosting credits and approve accounts.
  const ownerOnly = (req, res, next) => (isOwner(req.user.email) ? next() : res.status(403).json({ error: 'Owners only.' }));
  const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

  router.get('/admin/accounts', ownerOnly, (req, res) => {
    const led = loadLedger();
    const st = loadState();
    res.json({
      accounts: Object.entries(led).map(([email, a]) => ({
        email,
        approved: !!a.approved,
        added: round4(a.added || 0),
        used: round4(a.used || 0),
        remaining: remainingOf(a),
        bots: Object.values(st).filter(s => s.owner === email).length,
      })),
    });
  });
  router.post('/admin/allocate', ownerOnly, (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const amount = Number(req.body && req.body.amount);
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!Number.isFinite(amount) || Math.abs(amount) > 1e6) return res.status(400).json({ error: 'Enter a number of credits (negative takes credits back).' });
    const led = loadLedger();
    const a = acctOf(led, email);
    a.approved = true;
    a.added = Math.max(0, round4((a.added || 0) + amount));
    if (amount) pushHistory(a, { type: 'allocation', amount, by: req.user.email });
    saveLedger(led);
    if (remainingOf(a) <= 0) stopForCredits(email); else if (amount > 0) resumeCredited(email);
    res.json({ email, approved: true, remaining: remainingOf(a) });
  });
  router.post('/admin/revoke', ownerOnly, (req, res) => {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const led = loadLedger();
    if (!led[email]) return res.status(404).json({ error: 'No such account.' });
    led[email].approved = false;
    saveLedger(led);
    for (const [id, s] of Object.entries(loadState())) if (s.owner === email) stopBot(id);
    res.json({ ok: true });
  });

  router.delete('/bots/:id', withBot, (req, res) => {
    const id = req.botId;
    stopBot(id, () => {
      const st = loadState();
      delete st[id];
      saveState(st);
      runtime.delete(id);
      try { fs.rmSync(botDir(id), { recursive: true, force: true }); } catch {}
      try { fs.rmSync(logFile(id), { force: true }); fs.rmSync(logFile(id) + '.old', { force: true }); } catch {}
      try { fs.unwatchFile(presenceFile(id)); fs.rmSync(presenceFile(id), { force: true }); fs.rmSync(presenceFile(id) + '.applied', { force: true }); } catch {}
      res.json({ ok: true });
    });
  });

  router.post('/bots/:id/start', withBot, (req, res) => {
    const out = startBot(req.botId);
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ ok: true });
  });
  router.post('/bots/:id/stop', withBot, (req, res) => stopBot(req.botId, () => res.json({ ok: true })));
  router.post('/bots/:id/restart', withBot, (req, res) => {
    stopBot(req.botId, () => {
      const out = startBot(req.botId);
      if (!out.ok) return res.status(400).json({ error: out.error });
      res.json({ ok: true });
    });
  });

  // Installs dependencies (npm for package.json, pip for requirements.txt),
  // streaming output to the bot's log. Returns immediately; poll status.
  router.post('/bots/:id/install', withBot, (req, res) => {
    const id = req.botId;
    const r = rt(id);
    if (r.installing) return res.status(409).json({ error: 'Already installing' });
    const dir = botDir(id);
    const steps = [];
    if (fs.existsSync(path.join(dir, 'package.json'))) steps.push(['npm', ['install', '--omit=dev', '--no-audit', '--no-fund']]);
    if (fs.existsSync(path.join(dir, 'requirements.txt'))) steps.push(['python3', ['-m', 'pip', 'install', '-r', 'requirements.txt']]);
    if (!steps.length) return res.status(400).json({ error: 'No package.json or requirements.txt to install from.' });
    r.installing = true;
    res.json({ ok: true });
    rotateLog(id);
    const run = i => {
      if (i >= steps.length) { r.installing = false; appendLog(id, '[host] install finished\n'); return; }
      const [cmd, args] = steps[i];
      appendLog(id, `[host] ${new Date().toISOString()} running: ${cmd} ${args.join(' ')}\n`);
      let fd;
      try { fd = fs.openSync(logFile(id), 'a'); } catch { r.installing = false; return; }
      const p = spawn(cmd, args, { cwd: dir, env: botEnv(id), stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      p.on('error', err => { appendLog(id, `[host] ${cmd} failed to launch: ${err.message}\n`); r.installing = false; });
      p.on('exit', code => {
        if (code !== 0) { appendLog(id, `[host] ${cmd} exited with code ${code} — install stopped\n`); r.installing = false; return; }
        run(i + 1);
      });
    };
    run(0);
  });

  router.get('/bots/:id/logs', withBot, (req, res) => {
    const want = Math.min(Math.max(Number(req.query.bytes) || 32768, 1024), 262144);
    let text = '';
    try {
      const fd = fs.openSync(logFile(req.botId), 'r');
      const size = fs.fstatSync(fd).size;
      const len = Math.min(size, want);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch {}
    res.json({ text });
  });
  router.delete('/bots/:id/logs', withBot, (req, res) => {
    try { fs.writeFileSync(logFile(req.botId), ''); } catch {}
    res.json({ ok: true });
  });

  // ── env (secrets): keys come back, values never do ───────────────
  router.get('/bots/:id/env', withBot, (req, res) => res.json({ keys: Object.keys(readEnv(req.botId)) }));
  router.put('/bots/:id/env', withBot, (req, res) => {
    const set = (req.body && req.body.set) || {};
    const remove = Array.isArray(req.body && req.body.remove) ? req.body.remove : [];
    const vars = readEnv(req.botId);
    for (const [k, v] of Object.entries(set)) {
      if (!ENV_KEY_PATTERN.test(k)) return res.status(400).json({ error: `Invalid variable name: ${k}` });
      if (typeof v !== 'string' || v.length > 4000) return res.status(400).json({ error: `Invalid value for ${k}` });
      vars[k] = v;
    }
    for (const k of remove) delete vars[k];
    writeEnv(req.botId, vars);
    res.json({ keys: Object.keys(vars) });
  });

  // ── files ────────────────────────────────────────────────────────
  router.get('/bots/:id/files', withBot, (req, res) => res.json({ files: listFiles(req.botId) }));

  router.get('/bots/:id/file', withBot, (req, res) => {
    const full = safePath(req.botId, req.query.path);
    if (!full) return res.status(400).json({ error: 'Bad path' });
    try {
      const st = fs.statSync(full);
      if (!st.isFile() || st.size > MAX_EDIT_BYTES) return res.status(400).json({ error: 'Not an editable text file (max 1 MB).' });
      res.json({ content: fs.readFileSync(full, 'utf8') });
    } catch { res.status(404).json({ error: 'No such file' }); }
  });
  // text/plain body so it isn't caught by the server-wide 10 KB JSON limit.
  router.put('/bots/:id/file', withBot, express.text({ type: '*/*', limit: MAX_EDIT_BYTES }), (req, res) => {
    const full = safePath(req.botId, req.query.path);
    if (!full) return res.status(400).json({ error: 'Bad path' });
    // express.text leaves {} when the body is empty (saving a blank file).
    const content = typeof req.body === 'string' ? req.body : '';
    try {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  router.delete('/bots/:id/file', withBot, (req, res) => {
    const full = safePath(req.botId, req.query.path);
    if (!full) return res.status(400).json({ error: 'Bad path' });
    try { fs.rmSync(full, { recursive: true, force: true }); } catch {}
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, botDir(req.botId)),
      filename: (req, file, cb) => {
        const name = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
        cb(null, name || 'file');
      },
    }),
    limits: { fileSize: MAX_FILE_BYTES, files: 30 },
  });
  router.post('/bots/:id/upload', withBot, (req, res) => {
    upload.array('files', 30)(req, res, err => {
      if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'A file is over 50 MB.' : err.message });
      const dir = botDir(req.botId);
      const notes = [];
      for (const f of req.files || []) {
        if (!/\.zip$/i.test(f.filename)) continue;
        // Extract into a scratch folder first, so a zip with one wrapping
        // folder (the usual "download as zip" shape) can be flattened.
        const tmp = path.join(dir, '.unzip-tmp');
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp);
        const out = spawnSync('unzip', ['-o', '-q', f.path, '-d', tmp], { timeout: 60000 });
        if (out.error || out.status !== 0) {
          notes.push(`${f.filename}: could not extract (${out.error ? 'unzip is not installed — pkg install unzip' : 'bad zip file'})`);
          fs.rmSync(tmp, { recursive: true, force: true });
          continue;
        }
        let src = tmp;
        const kids = fs.readdirSync(tmp).filter(n => n !== '__MACOSX');
        if (kids.length === 1 && fs.statSync(path.join(tmp, kids[0])).isDirectory()) src = path.join(tmp, kids[0]);
        for (const name of fs.readdirSync(src)) {
          if (name === '.env' || name === '__MACOSX') continue;
          fs.cpSync(path.join(src, name), path.join(dir, name), { recursive: true, force: true });
        }
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.rmSync(f.path, { force: true });
        notes.push(`${f.filename}: extracted`);
      }
      res.json({ ok: true, notes });
    });
  });

  app.use('/dbhosting/api', router);

  // ── metering ─────────────────────────────────────────────────────
  // Once a minute, bill every non-free bot that has been running: slots ×
  // price per day, pro-rated by the time actually run since the last tick
  // (never before it started). An account that hits zero has all its bots
  // stopped; they restart on their own once credits are added.
  let lastTick = Date.now();
  function stopForCredits(email) {
    for (const [id, s] of Object.entries(loadState())) {
      if (s.owner !== email || isFree(s)) continue;
      if (!rt(id).child && !s.desired) continue;
      appendLog(id, `[host] ${new Date().toISOString()} out of hosting credits — stopping. Add credits and it starts again by itself.\n`);
      stopBot(id, () => {
        const st = loadState();
        if (st[id]) { st[id].autoResume = true; saveState(st); }
      });
    }
  }
  function resumeCredited(email) {
    for (const [id, s] of Object.entries(loadState())) {
      if (s.owner !== email || !s.autoResume || rt(id).child) continue;
      if (remainingOf(loadLedger()[email]) < perDayOf(s) / 24) continue;
      startBot(id);
    }
  }
  function tick() {
    const now = Date.now();
    const st = loadState();
    const led = loadLedger();
    const billed = new Set();
    for (const [id, r] of runtime) {
      const s = st[id];
      if (!r.child || !s || isFree(s)) continue;
      const hours = Math.max(0, now - Math.max(lastTick, r.startedAt || now)) / 3600000;
      const a = acctOf(led, s.owner);
      a.used = round4((a.used || 0) + hours * perDayOf(s) / 24);
      billed.add(s.owner);
    }
    lastTick = now;
    if (!billed.size) return;
    saveLedger(led);
    for (const email of billed) if (remainingOf(led[email]) <= 0) stopForCredits(email);
  }
  setInterval(tick, TICK_MS).unref();

  // ── lifecycle ────────────────────────────────────────────────────
  // Bring back every bot that was running when the server last went down.
  const initial = loadState();
  let restored = 0;
  for (const [id, st] of Object.entries(initial)) {
    killStale(id, st.pid);
    if (st.desired && ID_PATTERN.test(id) && fs.existsSync(botDir(id))) {
      const out = startBot(id);
      if (out.ok) restored++;
    }
  }

  function shutdown() {
    try { tick(); } catch {} // bill the partial minute before everything stops
    for (const [id, r] of runtime) {
      clearTimeout(r.timer);
      if (r.child) { r.stopping = true; try { r.child.kill('SIGTERM'); } catch {} }
    }
  }
  // `desired` stays true across a shutdown on purpose, so the next boot
  // restores these bots — only the explicit stop route clears it.
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });
  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('exit', shutdown);

  return {
    botsDir,
    restored,
    allowedCount: allowed.length,
  };
};
