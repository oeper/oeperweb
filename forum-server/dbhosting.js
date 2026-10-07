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

const MAX_BOTS = Number(process.env.DBHOSTING_MAX_BOTS) || 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_EDIT_BYTES = 1024 * 1024;
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_LIST_FILES = 300;
const NODE_MEMORY_MB = Number(process.env.DBHOSTING_NODE_MEMORY_MB) || 192;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const NODE_ENTRIES = ['index.js', 'bot.js', 'main.js', 'app.js', 'src/index.js', 'src/bot.js', 'src/main.js'];
const PY_ENTRIES = ['main.py', 'bot.py', 'index.py', 'app.py', 'src/main.py', 'src/bot.py'];

module.exports = function setupDbHosting(app, ctx) {
  const { verifyFirebaseToken, isOwner, loadJson, saveJson, dataDir } = ctx;
  const allowed = (process.env.DBHOSTING_ALLOWED_EMAILS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const canHost = email => !!email && (isOwner(email) || allowed.includes(email));

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

  // The bot only gets what it needs plus its own .env — never the server's
  // environment, which holds the tunnel token, webhook URL and API keys.
  function botEnv(id) {
    const base = {};
    for (const k of ['PATH', 'HOME', 'TMPDIR', 'PREFIX', 'LANG', 'TERM', 'TZ', 'SSL_CERT_FILE']) if (process.env[k]) base[k] = process.env[k];
    return { ...base, NODE_OPTIONS: `--max-old-space-size=${NODE_MEMORY_MB}`, PYTHONUNBUFFERED: '1', ...readEnv(id) };
  }

  function isAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

  function startBot(id) {
    const r = rt(id);
    if (r.child) return { ok: true, already: true };
    if (r.installing) return { ok: false, error: 'Dependencies are still installing' };
    const entry = detectEntry(id);
    if (!entry) return { ok: false, error: 'No entry file found. Upload an index.js / bot.js / main.py, or a package.json with a start script.' };

    clearTimeout(r.timer);
    r.stopping = false;
    r.crashed = false;
    rotateLog(id);
    let fd;
    try { fd = fs.openSync(logFile(id), 'a'); } catch (e) { return { ok: false, error: 'Cannot open log file: ' + e.message }; }
    appendLog(id, `[host] ${new Date().toISOString()} starting: ${entry.label}\n`);

    let child;
    try {
      child = spawn(entry.cmd, entry.args, { cwd: botDir(id), env: botEnv(id), stdio: ['ignore', fd, fd] });
    } catch (e) {
      fs.closeSync(fd);
      return { ok: false, error: 'Could not start: ' + e.message };
    }
    fs.closeSync(fd);
    r.child = child;
    r.startedAt = Date.now();

    const state = loadState();
    if (state[id]) { state[id].desired = true; state[id].pid = child.pid; saveState(state); }

    child.on('error', err => appendLog(id, `[host] failed to launch ${entry.cmd}: ${err.message} (is it installed? pkg install nodejs python)\n`));
    child.on('exit', (code, signal) => {
      const ranFor = Date.now() - (r.startedAt || Date.now());
      r.child = null;
      r.startedAt = null;
      appendLog(id, `[host] ${new Date().toISOString()} exited (${signal ? 'signal ' + signal : 'code ' + code})\n`);
      const st = loadState();
      if (r.stopping || !st[id] || !st[id].desired) { r.stopping = false; return; }
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
    if (st[id]) { st[id].desired = false; delete st[id].pid; saveState(st); }
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
    if (!ID_PATTERN.test(id) || !loadState()[id]) return res.status(404).json({ error: 'No such bot' });
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
      status: status(id),
      pid: r.child ? r.child.pid : null,
      startedAt: r.startedAt,
      restarts: r.restarts,
      entry: entry ? entry.label : null,
      envKeys: Object.keys(readEnv(id)),
      createdAt: st.createdAt,
    };
  }

  router.get('/bots', (req, res) => {
    const st = loadState();
    const os = require('os');
    res.json({
      bots: Object.keys(st).map(id => describe(id, st[id])),
      maxBots: MAX_BOTS,
      system: { uptime: Math.round(os.uptime()), freeMem: os.freemem(), totalMem: os.totalmem(), load: os.loadavg()[0] },
    });
  });

  router.post('/bots', (req, res) => {
    const name = String((req.body && req.body.name) || '').trim();
    if (!name || name.length > 40) return res.status(400).json({ error: 'Give the bot a name (1–40 characters).' });
    const st = loadState();
    if (Object.keys(st).length >= MAX_BOTS) return res.status(400).json({ error: `Limit of ${MAX_BOTS} bots reached.` });
    let base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'bot';
    let id = base;
    for (let n = 2; st[id]; n++) id = `${base}-${n}`;
    fs.mkdirSync(botDir(id), { recursive: true });
    st[id] = { name, createdAt: Date.now(), desired: false };
    saveState(st);
    res.json(describe(id, st[id]));
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
