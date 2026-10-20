#!/usr/bin/env node
'use strict';
// Moving this server to another computer (a mini PC, a laptop, a VPS) without losing anything.
//
//   OLD machine (phone / Searver / Termux)         NEW machine
//   ─────────────────────────────────────────      ─────────────────────────────────────────
//   node migrate.js enable          (opens a key-protected, time-limited door in the running server)
//                                                  node migrate.js pull --from http://PHONE-IP:8787 --key KEY
//                                                  ... repeat any time: only what changed is copied ...
//                                                  node migrate.js pull --from ... --key KEY --final   (pauses the old server, copies the last changes)
//   node migrate.js disable
//
// Everything is plain Node (18+), no packages. `pull` can be stopped and started again at any time: finished files are skipped, half-finished
// files resume. Nothing is ever deleted on either machine, so the old server stays a complete backup.
//
// What is copied: the small JSON "databases" and secrets (file owners, folders, settings, audit log, link secret, bot hosting state and credits),
// the .env (never over an existing one), every Discord bot's folder, Epicenter's hosted apps, Searver APK releases, the files people uploaded
// (only the ones the server tracks in file-owners.json, NOT the rest of a phone's Documents folder), trash, forum/video/project/chat attachments.
// What is not: node_modules (rebuilt here), content-hashes.json (it holds phone paths, rebuilt by itself), logs, the translator model (reinstall with translator/setup.sh),
// and the Minecraft world (a separate thing, see MIGRATION.md).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { parseEnvFile, resolveDirs } = require('./paths');

const ENV_FILE = path.join(__dirname, '.env');
const FREEZE_MAX_MS = 30 * 60 * 1000;     // a pause can never outlive a failed migration
const DATA_FILE_RE = /\.(json|jsonl|txt)(\.\d+)?$/;
const DATA_FILE_SKIP = new Set(['package.json', 'package-lock.json', 'content-hashes.json']);
const WALK_SKIP = new Set(['node_modules', '__pycache__', '.git']);

// ───────────────────────── what exists on this machine ─────────────────────────
/** The roots of a migration: logical name -> folder (or the .env file itself). Names are the same on both machines; folders are each machine's own. */
function roots(dirs) {
  return { env: __dirname, data: dirs.dataDir, bots: dirs.bots, epicenter: dirs.epicenter, releases: dirs.releases, files: dirs.files, trash: dirs.trash, forum: dirs.forum, videos: dirs.videos, projects: dirs.projects, messages: dirs.messages };
}

function* walk(base, rel) {
  let entries;
  try { entries = fs.readdirSync(path.join(base, rel), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!WALK_SKIP.has(e.name)) yield* walk(base, r); continue; }
    if (!e.isFile() || e.name.endsWith('.part')) continue;
    let st; try { st = fs.statSync(path.join(base, r)); } catch { continue; }
    yield [r, st.size, Math.round(st.mtimeMs)];
  }
}
function statEntry(base, rel) {
  try { const st = fs.statSync(path.join(base, rel)); return st.isFile() ? [rel, st.size, Math.round(st.mtimeMs)] : null; } catch { return null; }
}

/** Every file that should move, as [root, rel, size, mtimeMs]. Roots that share a folder (forum + videos by default) are listed once. */
function* manifest(dirs) {
  const R = roots(dirs);
  const seen = new Set();
  const once = (root, e) => { const k = path.resolve(R[root], e[0]); if (seen.has(k)) return null; seen.add(k); return [root, ...e]; };
  const envEntry = statEntry(__dirname, '.env');
  if (envEntry) yield ['env', ...envEntry];
  // small JSON "databases", secrets and logs of the data dir (top level only)
  try {
    for (const e of fs.readdirSync(dirs.dataDir, { withFileTypes: true })) {
      if (!e.isFile() || !DATA_FILE_RE.test(e.name) || DATA_FILE_SKIP.has(e.name) || e.name.includes('.corrupted-') || e.name.endsWith('.tmp')) continue;
      const se = statEntry(dirs.dataDir, e.name); const o = se && once('data', se); if (o) yield o;
    }
  } catch { /* data dir missing */ }
  // the tracked personal files only (file-owners.json), never the rest of a shared folder such as Documents
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(dirs.meta, 'utf8')); } catch { /* none yet */ }
  if (dirs.meta.startsWith(dirs.dataDir) === false) { const se = statEntry(path.dirname(dirs.meta), path.basename(dirs.meta)); if (se) yield ['data-meta', ...se]; }
  for (const name of Object.keys(meta)) {
    if (/[\\/]/.test(name) || name.startsWith('.')) continue;
    const se = statEntry(dirs.files, name); const o = se && once('files', se); if (o) yield o;
  }
  for (const root of ['trash', 'bots', 'epicenter', 'releases', 'forum', 'videos', 'projects', 'messages']) {
    for (const e of walk(R[root], '')) { const o = once(root, e); if (o) yield o; }
  }
}

/** The folder for a root, or null for an unknown one. 'data-meta' is file-owners.json when it lives outside the data dir. */
function baseOf(dirs, root) {
  if (root === 'data-meta') return path.dirname(dirs.meta);
  return roots(dirs)[root] || null;
}
function safeJoin(base, rel) {
  if (!base || typeof rel !== 'string' || !rel || rel.includes('\0') || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return null;
  const full = path.resolve(base, rel);
  return full === base || !full.startsWith(path.resolve(base) + path.sep) ? null : full;
}

// ───────────────────────── server side: the door ─────────────────────────
function mount(app, { dirs, base }) {
  const express = require('express');
  const router = express.Router();
  let frozenUntil = 0;
  const failures = new Map();   // ip -> [timestamps]

  // maintenance mode: everything except /migrate/* answers 503 until unfrozen (or 30 minutes pass)
  app.use((req, res, next) => {
    if (frozenUntil > Date.now() && !req.path.startsWith('/migrate/')) {
      res.set('Retry-After', '600');
      return res.status(503).json({ error: 'This server is being moved to a new computer. It will be back in a few minutes.' });
    }
    next();
  });

  const config = () => {
    const env = parseEnvFile(path.join(base, '.env'));
    const until = Number(env.MIGRATE_UNTIL) || 0;
    return env.MIGRATE_KEY && env.MIGRATE_KEY.length >= 24 && until > Date.now() ? { key: env.MIGRATE_KEY, until } : null;
  };
  const same = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

  router.use(async (req, res, next) => {
    const cfg = config();
    if (!cfg) return next('router');           // closed: behaves like a page that does not exist (the rest of the app answers 404)
    const ip = req.headers['cf-connecting-ip'] || req.ip || 'x';
    const recent = (failures.get(ip) || []).filter(t => Date.now() - t < 10 * 60_000);
    if (recent.length >= 8) return res.status(429).json({ error: 'Too many wrong keys. Wait ten minutes.' });
    const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!given || !same(given, cfg.key)) {
      recent.push(Date.now()); failures.set(ip, recent);
      await new Promise(r => setTimeout(r, 400));
      return res.status(401).json({ error: 'Wrong key.' });
    }
    req.migrate = cfg;
    next();
  });

  router.get('/info', (req, res) => {
    res.json({ ok: true, version: 1, node: process.version, platform: process.platform, until: req.migrate.until, frozen: frozenUntil > Date.now(), roots: Object.keys(roots(dirs)) });
  });
  router.get('/manifest', (req, res) => {
    res.set('Content-Type', 'application/x-ndjson');
    for (const e of manifest(dirs)) res.write(JSON.stringify(e) + '\n');
    res.end();
  });
  router.get('/file', (req, res) => {
    const b = baseOf(dirs, String(req.query.root || ''));
    const full = safeJoin(b, String(req.query.rel || ''));
    if (!full) return res.status(400).json({ error: 'Bad path.' });
    res.sendFile(full, { dotfiles: 'allow', acceptRanges: true, cacheControl: false, lastModified: true }, err => { if (err && !res.headersSent) res.status(404).json({ error: 'No such file.' }); });
  });
  router.get('/hash', (req, res) => {
    const full = safeJoin(baseOf(dirs, String(req.query.root || '')), String(req.query.rel || ''));
    if (!full) return res.status(400).json({ error: 'Bad path.' });
    const h = crypto.createHash('sha256');
    fs.createReadStream(full).on('data', d => h.update(d)).on('end', () => res.json({ sha256: h.digest('hex') })).on('error', () => res.status(404).json({ error: 'No such file.' }));
  });
  router.post('/freeze', (req, res) => { frozenUntil = Date.now() + FREEZE_MAX_MS; res.json({ ok: true, until: frozenUntil }); });
  router.post('/unfreeze', (req, res) => { frozenUntil = 0; res.json({ ok: true }); });
  app.use('/migrate', router);
}

// ───────────────────────── command line ─────────────────────────
const fmtBytes = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? (n / 1e3).toFixed(0) + ' KB' : n + ' B';
const fmtTime = s => s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm' : s >= 60 ? Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's' : Math.round(s) + 's';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function args(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) { const k = t.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[k] = true; else { a[k] = n; i++; } } else a._.push(t);
  }
  return a;
}

function editEnv(mutate) {
  let lines = [];
  try { lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n'); } catch { /* new file */ }
  lines = mutate(lines.filter(l => !/^\s*MIGRATE_(KEY|UNTIL)\s*=/.test(l)));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n');
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

function cmdEnable(a) {
  const hours = Number(a.hours) || 24;
  const key = crypto.randomBytes(24).toString('hex');
  const until = Date.now() + hours * 3600_000;
  editEnv(lines => [...lines, `MIGRATE_KEY=${key}`, `MIGRATE_UNTIL=${until}`]);
  const env = { ...parseEnvFile(ENV_FILE), ...process.env };
  const port = env.PORT || 8787;
  console.log(`Moving is allowed for ${hours} hour(s) (until ${new Date(until).toLocaleString()}). The running server notices by itself; no restart needed.\n`);
  console.log(`Your key (keep it private, it opens all of this server's data):\n  ${key}\n`);
  console.log('On the NEW computer, in forum-server/, run ONE of these (the first is much faster when both are on the same Wi-Fi/network):');
  for (const ip of lanAddresses()) console.log(`  node migrate.js pull --from http://${ip}:${port} --key ${key}`);
  if (env.PUBLIC_BASE_URL && !/localhost/.test(env.PUBLIC_BASE_URL)) console.log(`  node migrate.js pull --from ${env.PUBLIC_BASE_URL} --key ${key}      (works from anywhere, slower)`);
  console.log('\nWhen you are done: node migrate.js disable');
}
function cmdDisable() { editEnv(l => l); console.log('Moving is switched off again (the key was removed from .env).'); }

async function api(from, key, route, opts) {
  const res = await fetch(from.replace(/\/+$/, '') + '/migrate/' + route, { ...(opts || {}), headers: { Authorization: 'Bearer ' + key, ...((opts && opts.headers) || {}) } });
  return res;
}
async function getJson(from, key, route, opts) {
  const res = await api(from, key, route, opts);
  if (res.status === 401) throw new Error('The old server says the key is wrong.');
  if (res.status === 429) throw new Error('Too many wrong keys; wait ten minutes.');
  if (res.status === 404) throw new Error('The old server has moving switched off (or it is an old version without migrate.js). Run "node migrate.js enable" there, and update its code first if needed.');
  if (!res.ok) throw new Error('The old server answered ' + res.status + '.');
  return res.json();
}

function plan(entries, dirs) {
  const R = { ...roots(dirs), 'data-meta': path.dirname(dirs.meta) };
  const seen = new Set();
  const items = [];
  for (const [root, rel, size, mtime] of entries) {
    if (!R[root]) continue;
    const dest = safeJoin(R[root], rel) || (root === 'env' && rel === '.env' ? path.join(__dirname, '.env') : null);
    if (!dest) { console.warn('  skipped an unsafe path:', rel); continue; }
    if (seen.has(dest)) continue; seen.add(dest);
    let have = null; try { const st = fs.statSync(dest); have = st.isFile() ? { size: st.size, mtime: Math.round(st.mtimeMs) } : null; } catch { /* missing */ }
    const done = have && have.size === size && Math.abs(have.mtime - mtime) < 2000;
    items.push({ root, rel, size, mtime, dest, done });
  }
  return items;
}

async function download(from, key, it, onBytes) {
  fs.mkdirSync(path.dirname(it.dest), { recursive: true });
  const part = it.dest + '.part';
  for (let attempt = 1; ; attempt++) {
    try {
      let start = 0; try { start = fs.statSync(part).size; } catch { /* fresh */ }
      if (start > it.size) { fs.rmSync(part); start = 0; }
      if (start < it.size || it.size === 0) {
        const res = await api(from, key, 'file?root=' + encodeURIComponent(it.root) + '&rel=' + encodeURIComponent(it.rel), start ? { headers: { Range: `bytes=${start}-` } } : {});
        if (res.status === 416) { /* already complete */ } else {
          if (!res.ok && res.status !== 206) throw new Error('HTTP ' + res.status);
          if (start && res.status === 200) { fs.rmSync(part, { force: true }); start = 0; }
          const out = fs.createWriteStream(part, { flags: start ? 'a' : 'w' });
          const reader = res.body.getReader();
          for (;;) { const { done, value } = await reader.read(); if (done) break; if (!out.write(value)) await new Promise(r => out.once('drain', r)); onBytes(value.length); }
          await new Promise((r, j) => out.end(e => e ? j(e) : r()));
        }
      }
      if (fs.statSync(part).size !== it.size) throw new Error(`size is ${fs.statSync(part).size}, expected ${it.size}`);
      fs.renameSync(part, it.dest);
      const t = new Date(it.mtime); fs.utimesSync(it.dest, t, t);
      return;
    } catch (e) {
      if (attempt >= 6) throw new Error(`${it.rel}: ${e.message}`);
      await sleep(1000 * attempt);
    }
  }
}

async function cmdPull(a) {
  const from = a.from, key = a.key;
  if (!from || !key) throw new Error('Usage: node migrate.js pull --from http://OLD-ADDRESS:8787 --key KEY [--final] [--skip-bot-install]');
  const dirs = resolveDirs({ ...parseEnvFile(ENV_FILE), ...process.env }, __dirname);
  const info = await getJson(from, key, 'info');
  console.log(`Connected to the old server (Node ${info.node}, ${info.platform}). Moving stays allowed until ${new Date(info.until).toLocaleString()}.`);
  if (a.final) {
    await getJson(from, key, 'freeze', { method: 'POST' });
    console.log('The old server is now paused (visitors see "being moved"). It un-pauses by itself after 30 minutes if something goes wrong.');
  }
  const text = await (await api(from, key, 'manifest')).text();
  const entries = text.split('\n').filter(Boolean).map(l => JSON.parse(l));
  const items = plan(entries, dirs);
  const todo = items.filter(i => !i.done);
  const total = todo.reduce((s, i) => s + i.size, 0);
  console.log(`Old server has ${items.length} files (${fmtBytes(items.reduce((s, i) => s + i.size, 0))}); ${todo.length} need copying (${fmtBytes(total)}).`);
  try { const fs0 = fs.statfsSync(dirs.dataDir); const free = fs0.bavail * fs0.bsize; if (free < total * 1.05) console.warn(`  Warning: only ${fmtBytes(free)} free in ${dirs.dataDir}.`); } catch { /* old Node */ }
  if (!todo.length) console.log('Nothing to copy: this computer is already up to date.');
  const envItem = todo.find(i => i.root === 'env' && fs.existsSync(i.dest));
  if (envItem) envItem.dest = path.join(__dirname, '.env.from-old');   // never overwrite the new machine's own settings

  let doneBytes = 0, doneFiles = 0, failed = [];
  const t0 = Date.now();
  const tick = setInterval(() => {
    const s = (Date.now() - t0) / 1000, rate = doneBytes / Math.max(s, 1);
    process.stdout.write(`\r  ${doneFiles}/${todo.length} files, ${fmtBytes(doneBytes)} of ${fmtBytes(total)}, ${fmtBytes(rate)}/s, about ${fmtTime(rate ? (total - doneBytes) / rate : 0)} left   `);
  }, 1000);
  const queue = todo.slice();
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      try {
        await download(from, key, it, n => { doneBytes += n; });
        if (it.root === 'env') {   // the copy of the old .env: the moving key must not travel along
          const clean = fs.readFileSync(it.dest, 'utf8').split('\n').filter(l => !/^\s*MIGRATE_(KEY|UNTIL)\s*=/.test(l)).join('\n');
          fs.writeFileSync(it.dest, clean);
        }
        doneFiles++;
      } catch (e) { failed.push(e.message); }
    }
  });
  await Promise.all(workers);
  clearInterval(tick);
  console.log(`\r  Copied ${doneFiles}/${todo.length} files (${fmtBytes(doneBytes)}) in ${fmtTime((Date.now() - t0) / 1000)}.                    `);
  if (failed.length) { console.error(`\n${failed.length} file(s) failed (run the same command again to retry just those):`); failed.slice(0, 10).forEach(f => console.error('  ' + f)); }
  if (envItem) console.log('\nThis computer already had a .env, so the old one was saved as .env.from-old. Compare them (TUNNEL_TOKEN, OWNER_EMAILS, RELEASE_KEY, DISCORD_REPORT_WEBHOOK ...) and copy over what you need.');

  if (!a['skip-bot-install']) await installBots(dirs);
  console.log('\nNext:');
  if (!a.final) console.log('  1. You can run this same command again whenever you like; it only copies what changed.\n  2. When you are ready to switch: node migrate.js pull --from ' + from + ' --key ' + key + ' --final');
  else console.log(`  1. Start the server here (node upload-server.js, or the service from the installer) and the tunnel (cloudflared) with the same TUNNEL_TOKEN.\n  2. Check https://your-domain/ answers, then stop the old server's tunnel. The old server stays paused for at most 30 min and keeps all your data as a backup.\n  3. On the old machine: node migrate.js disable`);
  if (failed.length) process.exitCode = 1;
}

async function installBots(dirs) {
  const { spawnSync } = require('child_process');
  let ids = [];
  try { ids = fs.readdirSync(dirs.bots, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return; }
  for (const id of ids) {
    const dir = path.join(dirs.bots, id);
    if (!fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, 'node_modules'))) continue;
    console.log(`  Installing the packages of bot ${id}…`);
    const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'ignore', shell: process.platform === 'win32' });
    if (r.status !== 0) console.warn(`  (npm install failed for bot ${id}; press Install in its page on dbhosting once the server runs)`);
  }
}

async function cmdVerify(a) {
  const from = a.from, key = a.key;
  if (!from || !key) throw new Error('Usage: node migrate.js verify --from URL --key KEY [--sample 100]');
  const dirs = resolveDirs({ ...parseEnvFile(ENV_FILE), ...process.env }, __dirname);
  const text = await (await api(from, key, 'manifest')).text();
  let items = plan(text.split('\n').filter(Boolean).map(l => JSON.parse(l)), dirs).filter(i => i.root !== 'env' && fs.existsSync(i.dest));
  if (a.sample) items = items.sort(() => Math.random() - 0.5).slice(0, Number(a.sample));
  let bad = 0, n = 0;
  for (const it of items) {
    const local = await new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(it.dest).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
    const remote = (await getJson(from, key, 'hash?root=' + encodeURIComponent(it.root) + '&rel=' + encodeURIComponent(it.rel))).sha256;
    n++;
    if (local !== remote) { bad++; console.log('  DIFFERENT:', it.rel); }
    process.stdout.write(`\r  checked ${n}/${items.length}   `);
  }
  console.log(`\n${bad ? bad + ' file(s) differ (they may have changed on the old server since; pull again).' : 'All ' + n + ' checked files are byte-for-byte the same.'}`);
}

async function cmdUnfreeze(a) {
  if (!a.from || !a.key) throw new Error('Usage: node migrate.js unfreeze --from URL --key KEY');
  await getJson(a.from, a.key, 'unfreeze', { method: 'POST' });
  console.log('The old server is back in service.');
}

async function cmdDoctor() {
  const http = require('http');
  const env = { ...parseEnvFile(ENV_FILE), ...process.env };
  const dirs = resolveDirs(env, __dirname);
  const ok = (cond, good, bad) => console.log((cond ? '  ok   ' : '  FIX  ') + (cond ? good : bad));
  console.log(`This machine: ${os.platform()} ${os.arch()}, Node ${process.version}`);
  ok(parseInt(process.version.slice(1), 10) >= 18, 'Node is new enough', 'Install Node 18 or newer (22 LTS recommended).');
  ok(fs.existsSync(ENV_FILE), '.env found', 'No .env here: copy one from the old server (pull does it) or create it. Needs at least PUBLIC_BASE_URL and TUNNEL_TOKEN.');
  ok(fs.existsSync(path.join(__dirname, 'node_modules', 'express')), 'npm packages installed', 'Run: npm install --omit=dev');
  ok(!!env.PUBLIC_BASE_URL && !/localhost/.test(env.PUBLIC_BASE_URL), 'PUBLIC_BASE_URL = ' + env.PUBLIC_BASE_URL, 'Set PUBLIC_BASE_URL=https://fs.oeper.dev in .env');
  ok(!!env.TUNNEL_TOKEN, 'TUNNEL_TOKEN is set (Cloudflare tunnel can run here)', 'Add TUNNEL_TOKEN=... to .env (same token as the old server uses).');
  for (const [name, dir] of [['personal files', dirs.files], ['forum attachments', dirs.forum], ['projects', dirs.projects], ['chat attachments', dirs.messages]]) {
    let w = false; try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); w = true; } catch { /* not writable */ }
    ok(w, `${name} folder is writable: ${dir}`, `${name} folder is not writable: ${dir}`);
  }
  try { const s = fs.statfsSync(dirs.dataDir); console.log(`  info ${fmtBytes(s.bavail * s.bsize)} free on the data drive`); } catch { /* old node */ }
  const port = env.PORT || 8787;
  const up = await new Promise(res => { const r = http.get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, x => { x.resume(); res(x.statusCode === 200); }); r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); });
  ok(up, `the server answers on port ${port}`, `the server is not running on port ${port} (start it: node upload-server.js, or use the installer's service)`);
  if (env.PUBLIC_BASE_URL && !/localhost/.test(env.PUBLIC_BASE_URL)) {
    let pub = false; try { const r = await fetch(env.PUBLIC_BASE_URL + '/', { signal: AbortSignal.timeout(6000) }); pub = r.ok && (await r.text()).includes('upload server is running'); } catch { /* unreachable */ }
    ok(pub, `${env.PUBLIC_BASE_URL} reaches a server (through the tunnel)`, `${env.PUBLIC_BASE_URL} does not reach a running server yet (is the tunnel running? is the old tunnel still taking the traffic?)`);
  }
}

async function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  try {
    if (cmd === 'enable') cmdEnable(a);
    else if (cmd === 'disable') cmdDisable();
    else if (cmd === 'pull') await cmdPull(a);
    else if (cmd === 'verify') await cmdVerify(a);
    else if (cmd === 'unfreeze') await cmdUnfreeze(a);
    else if (cmd === 'doctor') await cmdDoctor();
    else console.log('node migrate.js <command>\n\n  OLD machine:  enable [--hours 24]   |  disable\n  NEW machine:  pull --from URL --key KEY [--final] [--skip-bot-install]\n                verify --from URL --key KEY [--sample 100]\n                unfreeze --from URL --key KEY\n                doctor\n\nSee MIGRATION.md.');
  } catch (e) { console.error('\n' + (e && e.message || e)); process.exitCode = 1; }
}

module.exports = { mount, manifest, roots, safeJoin };
if (require.main === module) main();
