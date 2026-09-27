'use strict';
// Storage administration for the personal-file side of upload-server.js
// (files.html): per-user quotas, suspensions, a trash bin with retention, an
// audit log, blocked-file hashes, AI content moderation with quarantine, and
// the owner-only /admin/* API that storage.html is built on.
//
// Everything here is keyed off the same file-owners.json metadata the rest of
// the server already uses (passed in via ctx) — this module adds fields to
// those entries (sha256, mod, quarantined) rather than keeping a second
// index, so /my-files, /move-file, /rename-file etc. keep working unchanged.
// State it owns lives in small gitignored JSON files next to the script, same
// pattern as file-owners.json.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const DEFAULT_SETTINGS = {
  defaultQuotaBytes: 2 * GB,
  // 'off' = never scan, 'flag' = scan and mark but leave files public,
  // 'quarantine' = scan and hide anything flagged until an owner reviews it.
  // Severe hits are quarantined in either scanning mode.
  moderation: { mode: 'quarantine', scanImages: true, scanText: true },
  blockedExtensions: ['exe', 'scr', 'bat', 'cmd', 'com', 'msi', 'vbs', 'ps1', 'jar'],
  trashRetentionDays: 14, // 0 = deleting is immediate and permanent
  autoSuspendStrikes: 0, // 0 = never auto-suspend
  blockedHashes: {}, // sha256 -> { reason, at, by }
};

const IMAGE_EXTS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const TEXT_EXTS = new Set(['txt', 'md', 'csv', 'json', 'log', 'html', 'htm', 'js', 'css', 'py', 'lua', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'rtf', 'tex']);
const KIND_EXTS = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg', 'heic', 'avif', 'ico'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'],
  document: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'csv', 'rtf', 'odt'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'],
  code: ['js', 'ts', 'py', 'lua', 'html', 'css', 'json', 'xml', 'yml', 'yaml', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'sh'],
};
const MAX_IMAGE_SCAN_BYTES = 6 * MB;
const MAX_TEXT_SCAN_BYTES = 200 * 1024;
const MAX_BULK = 80; // express.json is capped at 10kb server-wide; 80 filenames fits

function extOf(name) { return path.extname(String(name || '')).slice(1).toLowerCase(); }
function kindOf(name) {
  const e = extOf(name);
  for (const [k, list] of Object.entries(KIND_EXTS)) if (list.includes(e)) return k;
  return 'other';
}
function fmtBytes(n) {
  if (n >= GB) return (n / GB).toFixed(1) + ' GB';
  if (n >= MB) return (n / MB).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

module.exports = function setupStorageAdmin(app, ctx) {
  const { verifyFirebaseToken, isOwner, USER_FILES_DIR, loadMeta, saveMeta, loadFolders, loadJson, saveJson, publicBaseUrl, dataDir } = ctx;
  const resolvedDir = path.resolve(USER_FILES_DIR);
  const TRASH_DIR = process.env.TRASH_DIR ? path.resolve(process.env.TRASH_DIR) : path.join(resolvedDir, '.oeper-trash');
  const SETTINGS_FILE = path.join(dataDir, 'storage-settings.json');
  const USERS_FILE = path.join(dataDir, 'user-settings.json');
  const TRASH_FILE = path.join(dataDir, 'trash.json');
  const AUDIT_FILE = path.join(dataDir, 'audit-log.jsonl');
  const MODERATION_URL = process.env.MODERATION_URL || null;
  const MODERATION_KEY = process.env.MODERATION_KEY || null;
  const moderationConfigured = !!(MODERATION_URL && MODERATION_KEY);

  // ── Small stores ────────────────────────────────────────────────────
  function getSettings() {
    const s = loadJson(SETTINGS_FILE);
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      moderation: { ...DEFAULT_SETTINGS.moderation, ...(s.moderation || {}) },
      blockedHashes: s.blockedHashes || {},
    };
  }
  const saveSettings = s => saveJson(SETTINGS_FILE, s);
  const loadUsers = () => loadJson(USERS_FILE);
  const saveUsers = u => saveJson(USERS_FILE, u);
  const loadTrash = () => loadJson(TRASH_FILE);
  const saveTrash = t => saveJson(TRASH_FILE, t);
  const userSettings = email => loadUsers()[email] || {};

  function audit(actor, action, target, detail) {
    try {
      try { if (fs.statSync(AUDIT_FILE).size > 5 * MB) fs.renameSync(AUDIT_FILE, AUDIT_FILE + '.1'); } catch {}
      fs.appendFileSync(AUDIT_FILE, JSON.stringify({ t: Date.now(), actor: actor || 'system', action, target: target || null, detail: detail || null }) + '\n');
    } catch (err) { console.error('audit write failed:', err.message); }
  }

  // ── Quota / usage ───────────────────────────────────────────────────
  function quotaFor(email) {
    const q = userSettings(email).quotaBytes;
    return (typeof q === 'number' && q >= 0) ? q : getSettings().defaultQuotaBytes;
  }
  function usageFor(email, meta) {
    let used = 0;
    for (const m of Object.values(meta || loadMeta())) if (m.email === email) used += m.size || 0;
    return used;
  }
  const overQuota = (email, extraBytes) => !isOwner(email) && usageFor(email) + (extraBytes || 0) > quotaFor(email);

  // Runs after optionalAuth on /upload-file. Answers early (before the body
  // is read) when the declared size can't fit; afterUpload's caller does the
  // authoritative check once the real size is known, since Content-Length
  // can be missing or wrong.
  function uploadGate(req, res, next) {
    const email = req.user && req.user.email;
    if (email && !isOwner(email)) {
      const u = userSettings(email);
      if (u.suspended) {
        res.set('Connection', 'close');
        return res.status(403).json({ error: 'Uploads are suspended on your account' + (u.reason ? ': ' + u.reason : '.') });
      }
      // Content-Length includes the multipart framing (boundary + headers,
      // a few hundred bytes), so shave a fixed allowance off rather than
      // rejecting an upload that would actually fit.
      const incoming = Math.max(0, (Number(req.headers['content-length']) || 0) - 1024);
      const used = usageFor(email);
      const limit = quotaFor(email);
      if (used + incoming > limit) {
        res.set('Connection', 'close');
        return res.status(413).json({ error: `Not enough storage — ${fmtBytes(used)} of ${fmtBytes(limit)} used, this upload needs ${fmtBytes(incoming)}.` });
      }
    }
    next();
  }
  // Same suspension check for the sign-in-only upload endpoints that don't
  // go through the personal-file metadata (forum attachments, videos, ...).
  function suspendGuard(req, res, next) {
    const email = req.user && req.user.email;
    if (email && !isOwner(email) && userSettings(email).suspended) {
      res.set('Connection', 'close');
      return res.status(403).json({ error: 'Uploads are suspended on your account.' });
    }
    next();
  }
  function fileFilter(req, file, cb) {
    const email = req.user && req.user.email;
    const ext = extOf(file.originalname);
    if (ext && !(email && isOwner(email)) && getSettings().blockedExtensions.includes(ext)) {
      return cb(new Error(`.${ext} files aren't allowed on this server.`));
    }
    cb(null, true);
  }

  // ── Quarantine: hide flagged files from the public /docs static route ──
  const quarantined = new Set(Object.entries(loadMeta()).filter(([, m]) => m.quarantined).map(([f]) => f));
  app.use('/docs', (req, res, next) => {
    let name;
    try { name = decodeURIComponent(req.path.split('/')[1] || ''); } catch { return next(); }
    if (name && quarantined.has(name)) return res.status(451).type('text/plain').send('This file has been removed pending review.');
    next();
  });

  // ── Hashing + AI moderation pipeline ───────────────────────────────
  function hashFile(file) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
  }

  async function callModerator(body) {
    const res = await fetch(MODERATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Moderation-Key': MODERATION_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  function strike(email, why) {
    if (!email || isOwner(email)) return;
    const users = loadUsers();
    const u = users[email] || (users[email] = {});
    u.strikes = (u.strikes || 0) + 1;
    const limit = getSettings().autoSuspendStrikes;
    if (limit > 0 && u.strikes >= limit && !u.suspended) {
      u.suspended = true;
      u.reason = `Automatically suspended after ${u.strikes} flagged uploads`;
      audit('system', 'auto-suspend', email, { strikes: u.strikes, why });
    }
    saveUsers(users);
  }

  function hardDelete(filename, meta) {
    try { fs.unlinkSync(path.join(resolvedDir, filename)); } catch {}
    delete meta[filename];
    quarantined.delete(filename);
  }

  async function processFile(filename) {
    const file = path.join(resolvedDir, filename);
    let sha;
    try { sha = await hashFile(file); } catch { return; } // file vanished
    const settings = getSettings();

    if (settings.blockedHashes[sha]) {
      const meta = loadMeta();
      const e = meta[filename];
      if (!e) return;
      hardDelete(filename, meta);
      saveMeta(meta);
      strike(e.email, 'blocked-hash');
      audit('system', 'blocked-hash-upload', filename, { email: e.email, name: e.name, sha256: sha });
      return;
    }
    { // synchronous load→modify→save, so it can't interleave with another handler's meta write
      const meta = loadMeta();
      if (!meta[filename]) return;
      meta[filename].sha256 = sha;
      saveMeta(meta);
    }

    const mode = settings.moderation.mode;
    if (mode === 'off' || !moderationConfigured) return;

    const meta0 = loadMeta();
    const entry0 = meta0[filename];
    if (!entry0) return;
    const ext = extOf(entry0.name || filename);
    let body = null;
    let skipReason = 'unsupported file type';
    if (IMAGE_EXTS[ext]) {
      if (!settings.moderation.scanImages) skipReason = 'image scanning is off';
      else if ((entry0.size || 0) > MAX_IMAGE_SCAN_BYTES) skipReason = 'image too large to scan';
      else body = { type: 'image', image: `data:${IMAGE_EXTS[ext]};base64,${fs.readFileSync(file).toString('base64')}` };
    } else if (TEXT_EXTS.has(ext)) {
      if (!settings.moderation.scanText) skipReason = 'text scanning is off';
      else {
        const fd = fs.openSync(file, 'r');
        try {
          const buf = Buffer.alloc(Math.min(entry0.size || MAX_TEXT_SCAN_BYTES, MAX_TEXT_SCAN_BYTES));
          const n = fs.readSync(fd, buf, 0, buf.length, 0);
          body = { type: 'text', text: buf.slice(0, n).toString('utf8') };
        } finally { fs.closeSync(fd); }
      }
    }

    let result = null;
    let error = null;
    if (body) {
      try { result = await callModerator(body); } catch (err) { error = err; }
    }

    const meta = loadMeta();
    const e = meta[filename];
    if (!e) return;
    const scannedAt = Date.now();
    if (!body) {
      e.mod = { status: 'skipped', reason: skipReason, scannedAt };
    } else if (error) {
      e.mod = { status: 'error', reason: String(error.message).slice(0, 200), scannedAt };
    } else {
      e.mod = {
        status: result.flagged ? 'flagged' : 'clean',
        categories: result.categories || [],
        severity: result.severity || 'none',
        reason: result.reason || '',
        scannedAt,
      };
      if (result.flagged) {
        if (settings.moderation.mode === 'quarantine' || result.severity === 'severe') {
          e.quarantined = true;
          quarantined.add(filename);
        }
        strike(e.email, 'moderation');
        audit('system', 'flagged', filename, { email: e.email, categories: e.mod.categories, severity: e.mod.severity, quarantined: !!e.quarantined });
      }
    }
    saveMeta(meta);
  }

  // One job at a time — a phone shouldn't hash and base64 several files at once.
  const queue = [];
  let working = false;
  function enqueue(filename) {
    if (!queue.includes(filename)) queue.push(filename);
    if (working) return;
    working = true;
    (async () => {
      while (queue.length) {
        const next = queue.shift();
        try { await processFile(next); } catch (err) { console.error('processFile failed for', next, err.message); }
      }
      working = false;
    })();
  }

  // Called by /upload-file once the file and its metadata are saved.
  function afterUpload(filename) {
    const meta = loadMeta();
    const e = meta[filename];
    if (!e) return;
    audit(e.email || 'anonymous', 'upload', filename, {
      dest: 'file', name: e.name, size: e.size, folder: e.folder || '', url: `${publicBaseUrl}/docs/${encodeURIComponent(filename)}`,
    });
    if (getSettings().moderation.mode !== 'off' && moderationConfigured) {
      e.mod = { status: 'pending' };
      saveMeta(meta);
    }
    enqueue(filename);
  }
  // Anything left pending by a restart mid-scan gets picked back up.
  for (const [f, m] of Object.entries(loadMeta())) if (m.mod && m.mod.status === 'pending') enqueue(f);

  // ── Trash ───────────────────────────────────────────────────────────
  function moveToTrash(filename, by) {
    const meta = loadMeta();
    const e = meta[filename] || null;
    const days = getSettings().trashRetentionDays;
    const src = path.join(resolvedDir, filename);
    if (days <= 0) {
      hardDelete(filename, meta);
      saveMeta(meta);
      audit(by, 'delete-permanent', filename, { email: e && e.email, name: e && e.name });
      return;
    }
    fs.mkdirSync(TRASH_DIR, { recursive: true });
    const dest = path.join(TRASH_DIR, filename);
    try {
      fs.renameSync(src, dest);
    } catch (err) {
      if (err.code === 'EXDEV') { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
      else if (err.code !== 'ENOENT') throw err; // ENOENT: file already gone, still clear its record
    }
    const now = Date.now();
    const trash = loadTrash();
    trash[filename] = { meta: e, deletedAt: now, deletedBy: by, purgeAt: now + days * 86400000 };
    saveTrash(trash);
    delete meta[filename];
    quarantined.delete(filename);
    saveMeta(meta);
    audit(by, 'delete', filename, { email: e && e.email, name: e && e.name, size: e && e.size });
  }

  function restoreFromTrash(filename, by) {
    const trash = loadTrash();
    const t = trash[filename];
    if (!t) throw new Error('Not in trash');
    const src = path.join(TRASH_DIR, filename);
    const dest = path.join(resolvedDir, filename);
    if (fs.existsSync(dest)) throw new Error('A file with that name already exists');
    fs.renameSync(src, dest);
    const meta = loadMeta();
    const e = t.meta || { email: null, name: filename, size: fs.statSync(dest).size, mtime: Date.now() };
    const owned = e.email ? (loadFolders()[e.email] || []) : [];
    if (e.folder && !owned.includes(e.folder)) e.folder = ''; // its folder was deleted while it sat in trash
    meta[filename] = e;
    if (e.quarantined) quarantined.add(filename);
    saveMeta(meta);
    delete trash[filename];
    saveTrash(trash);
    audit(by, 'restore', filename, { email: e.email, name: e.name });
  }

  function purgeFromTrash(filename, by) {
    const trash = loadTrash();
    if (!trash[filename]) return false;
    try { fs.unlinkSync(path.join(TRASH_DIR, filename)); } catch {}
    const t = trash[filename];
    delete trash[filename];
    saveTrash(trash);
    if (by) audit(by, 'purge', filename, { email: t.meta && t.meta.email, name: t.meta && t.meta.name });
    return true;
  }

  function purgeExpiredTrash() {
    const trash = loadTrash();
    const now = Date.now();
    let changed = false;
    for (const [f, t] of Object.entries(trash)) {
      if (t.purgeAt > now) continue;
      try { fs.unlinkSync(path.join(TRASH_DIR, f)); } catch {}
      delete trash[f];
      changed = true;
    }
    if (changed) saveTrash(trash);
  }
  setInterval(purgeExpiredTrash, 10 * 60 * 1000);
  purgeExpiredTrash();

  // ── Owner-only /admin API ───────────────────────────────────────────
  function requireOwner(req, res, next) {
    if (!isOwner(req.user.email)) return res.status(403).json({ error: 'Owners only' });
    next();
  }
  const admin = [verifyFirebaseToken, requireOwner];

  const fileOut = (filename, m) => ({
    filename,
    name: m.name || filename,
    size: m.size || 0,
    mtime: m.mtime || 0,
    email: m.email || null,
    folder: m.folder || '',
    kind: kindOf(m.name || filename),
    quarantined: !!m.quarantined,
    mod: m.mod || null,
    sha256: m.sha256 || null,
    expiresAt: m.expiresAt || null,
    url: `${publicBaseUrl}/docs/${encodeURIComponent(filename)}`,
  });

  app.get('/admin/overview', ...admin, (req, res) => {
    const meta = loadMeta();
    const byKind = {};
    const perDay = {};
    const emails = new Set();
    let bytes = 0; let files = 0; let flagged = 0; let quarantinedCount = 0; let unscanned = 0;
    const dayCutoff = Date.now() - 14 * 86400000;
    for (const m of Object.values(meta)) {
      files++;
      bytes += m.size || 0;
      if (m.email) emails.add(m.email);
      const k = kindOf(m.name);
      byKind[k] = (byKind[k] || 0) + (m.size || 0);
      if (m.quarantined) quarantinedCount++;
      if (m.quarantined || (m.mod && m.mod.status === 'flagged')) flagged++; // "needs review"
      if (!m.mod && (IMAGE_EXTS[extOf(m.name)] || TEXT_EXTS.has(extOf(m.name)))) unscanned++;
      if (m.mtime >= dayCutoff) {
        const d = new Date(m.mtime).toISOString().slice(0, 10);
        perDay[d] = (perDay[d] || 0) + 1;
      }
    }
    let disk = null;
    try {
      const s = fs.statfsSync(resolvedDir);
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    } catch {}
    const trash = Object.values(loadTrash());
    const settings = getSettings();
    res.json({
      disk,
      files, bytes, users: emails.size, byKind, perDay,
      flagged, quarantined: quarantinedCount, unscanned,
      trash: { files: trash.length, bytes: trash.reduce((n, t) => n + ((t.meta && t.meta.size) || 0), 0) },
      moderation: { configured: moderationConfigured, mode: settings.moderation.mode, queued: queue.length },
      defaultQuotaBytes: settings.defaultQuotaBytes,
    });
  });

  app.get('/admin/users', ...admin, (req, res) => {
    const meta = loadMeta();
    const settings = getSettings();
    const users = loadUsers();
    const rows = new Map();
    const row = email => {
      if (!rows.has(email)) {
        const u = users[email] || {};
        rows.set(email, {
          email, files: 0, bytes: 0, flagged: 0, lastUpload: 0,
          customQuota: typeof u.quotaBytes === 'number' ? u.quotaBytes : null,
          quotaBytes: typeof u.quotaBytes === 'number' ? u.quotaBytes : settings.defaultQuotaBytes,
          suspended: !!u.suspended, reason: u.reason || '', strikes: u.strikes || 0, unlimited: isOwner(email),
        });
      }
      return rows.get(email);
    };
    for (const m of Object.values(meta)) {
      if (!m.email) continue;
      const r = row(m.email);
      r.files++; r.bytes += m.size || 0;
      if (m.mod && m.mod.status === 'flagged') r.flagged++;
      if ((m.mtime || 0) > r.lastUpload) r.lastUpload = m.mtime;
    }
    for (const email of Object.keys(users)) row(email);
    res.json({ users: [...rows.values()].sort((a, b) => b.bytes - a.bytes), defaultQuotaBytes: settings.defaultQuotaBytes });
  });

  app.post('/admin/user', ...admin, (req, res) => {
    const { email, quotaBytes, suspended, reason, resetStrikes } = req.body || {};
    if (typeof email !== 'string' || !email.includes('@') || email.length > 200) return res.status(400).json({ error: 'Invalid email' });
    const users = loadUsers();
    const u = users[email] || (users[email] = {});
    const changes = {};
    if (quotaBytes !== undefined) {
      if (quotaBytes === null) { delete u.quotaBytes; changes.quotaBytes = 'default'; }
      else {
        const n = Number(quotaBytes);
        if (!Number.isFinite(n) || n < 0 || n > 1e14) return res.status(400).json({ error: 'Invalid quota' });
        u.quotaBytes = Math.floor(n); changes.quotaBytes = u.quotaBytes;
      }
    }
    if (suspended !== undefined) {
      u.suspended = !!suspended;
      u.reason = u.suspended ? String(reason || '').slice(0, 200) : '';
      changes.suspended = u.suspended;
    }
    if (resetStrikes) { u.strikes = 0; changes.strikes = 0; }
    u.updatedAt = Date.now();
    saveUsers(users);
    audit(req.user.email, 'user-update', email, changes);
    res.json({ ok: true });
  });

  app.get('/admin/files', ...admin, (req, res) => {
    const { email, q, kind, status, sort } = req.query;
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const needle = String(q || '').toLowerCase().slice(0, 100);
    let list = Object.entries(loadMeta()).map(([f, m]) => fileOut(f, m));
    if (email) list = list.filter(f => (email === '__anon__' ? !f.email : f.email === email));
    if (kind) list = list.filter(f => f.kind === kind);
    if (needle) list = list.filter(f => f.name.toLowerCase().includes(needle) || f.filename.toLowerCase().includes(needle) || (f.email || '').toLowerCase().includes(needle));
    if (status === 'flagged') list = list.filter(f => f.mod && f.mod.status === 'flagged');
    else if (status === 'review') list = list.filter(f => f.quarantined || (f.mod && f.mod.status === 'flagged'));
    else if (status === 'quarantined') list = list.filter(f => f.quarantined);
    else if (status === 'unscanned') list = list.filter(f => !f.mod);
    else if (status === 'error') list = list.filter(f => f.mod && f.mod.status === 'error');
    if (sort === 'size') list.sort((a, b) => b.size - a.size);
    else if (sort === 'oldest') list.sort((a, b) => a.mtime - b.mtime);
    else list.sort((a, b) => b.mtime - a.mtime);
    res.json({ total: list.length, files: list.slice(offset, offset + limit) });
  });

  // Streams a stored (or trashed) file to an owner — the console fetches this
  // with its auth header and shows it via a blob URL, which is how it can
  // preview a quarantined file that /docs refuses to serve.
  app.get('/admin/raw/:filename', ...admin, (req, res) => {
    const base = path.basename(req.params.filename);
    const file = req.query.trash ? path.join(TRASH_DIR, base) : path.join(resolvedDir, base);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'File not found' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(file, { dotfiles: 'allow' });
  });

  async function ensureHash(filename) {
    const meta = loadMeta();
    const e = meta[filename];
    if (!e) return null;
    if (e.sha256) return e.sha256;
    const sha = await hashFile(path.join(resolvedDir, filename));
    const meta2 = loadMeta();
    if (meta2[filename]) { meta2[filename].sha256 = sha; saveMeta(meta2); }
    return sha;
  }

  app.post('/admin/files/action', ...admin, async (req, res) => {
    const { action } = req.body || {};
    const filenames = Array.isArray(req.body && req.body.filenames) ? req.body.filenames.map(f => path.basename(String(f))).slice(0, MAX_BULK) : [];
    if (!filenames.length) return res.status(400).json({ error: 'No files selected' });
    const actor = req.user.email;
    let done = 0;
    const failed = [];
    for (const filename of filenames) {
      try {
        const meta = loadMeta();
        const e = meta[filename];
        if (!e) throw new Error('not found');
        if (action === 'quarantine') {
          e.quarantined = true; quarantined.add(filename); saveMeta(meta);
          audit(actor, 'quarantine', filename, { email: e.email, name: e.name });
        } else if (action === 'release') {
          e.quarantined = false; quarantined.delete(filename);
          if (e.mod && e.mod.status === 'flagged') e.mod = { ...e.mod, status: 'approved', reviewedBy: actor, reviewedAt: Date.now() };
          saveMeta(meta);
          audit(actor, 'release', filename, { email: e.email, name: e.name });
        } else if (action === 'delete') {
          moveToTrash(filename, actor);
        } else if (action === 'rescan') {
          if (!moderationConfigured) throw new Error('moderation not configured');
          e.mod = { status: 'pending' }; saveMeta(meta); enqueue(filename);
        } else if (action === 'ban') {
          // Delete this file and every other copy of the same bytes, and refuse
          // that hash from now on.
          const sha = await ensureHash(filename);
          if (!sha) throw new Error('could not hash file');
          const s = getSettings();
          s.blockedHashes[sha] = { reason: req.body.reason ? String(req.body.reason).slice(0, 200) : 'banned by owner', at: Date.now(), by: actor, name: e.name };
          saveSettings(s);
          const meta2 = loadMeta();
          let removed = 0;
          for (const [f, m] of Object.entries(meta2)) {
            if (f === filename || m.sha256 === sha) { hardDelete(f, meta2); removed++; }
          }
          saveMeta(meta2);
          if (e.email) strike(e.email, 'banned-file');
          audit(actor, 'ban-hash', filename, { sha256: sha, name: e.name, email: e.email, removed });
        } else {
          return res.status(400).json({ error: 'Unknown action' });
        }
        done++;
      } catch (err) {
        failed.push({ filename, error: err.message });
      }
    }
    res.json({ ok: true, done, failed });
  });

  app.post('/admin/scan-unscanned', ...admin, (req, res) => {
    if (!moderationConfigured) return res.status(503).json({ error: 'AI moderation is not configured on this server (set MODERATION_URL and MODERATION_KEY in .env).' });
    if (getSettings().moderation.mode === 'off') return res.status(400).json({ error: 'Moderation is set to off.' });
    const meta = loadMeta();
    let n = 0;
    for (const [f, m] of Object.entries(meta)) {
      if (m.mod) continue;
      const ext = extOf(m.name || f);
      if (!IMAGE_EXTS[ext] && !TEXT_EXTS.has(ext)) continue;
      m.mod = { status: 'pending' };
      enqueue(f);
      n++;
    }
    if (n) saveMeta(meta);
    audit(req.user.email, 'scan-unscanned', null, { queued: n });
    res.json({ ok: true, queued: n });
  });

  app.get('/admin/trash', ...admin, (req, res) => {
    const list = Object.entries(loadTrash()).map(([filename, t]) => ({
      ...(t.meta ? fileOut(filename, t.meta) : { filename, name: filename, size: 0, email: null, kind: kindOf(filename) }),
      deletedAt: t.deletedAt, deletedBy: t.deletedBy, purgeAt: t.purgeAt,
    }));
    list.sort((a, b) => b.deletedAt - a.deletedAt);
    res.json({ files: list, retentionDays: getSettings().trashRetentionDays });
  });

  app.post('/admin/trash/action', ...admin, (req, res) => {
    const { action } = req.body || {};
    let filenames = Array.isArray(req.body && req.body.filenames) ? req.body.filenames.map(f => path.basename(String(f))).slice(0, MAX_BULK) : [];
    if (action === 'empty') filenames = Object.keys(loadTrash());
    if (!filenames.length) return res.status(400).json({ error: 'Nothing selected' });
    let done = 0;
    const failed = [];
    for (const filename of filenames) {
      try {
        if (action === 'restore') restoreFromTrash(filename, req.user.email);
        else if (action === 'purge' || action === 'empty') { if (!purgeFromTrash(filename, req.user.email)) throw new Error('not found'); }
        else return res.status(400).json({ error: 'Unknown action' });
        done++;
      } catch (err) { failed.push({ filename, error: err.message }); }
    }
    res.json({ ok: true, done, failed });
  });

  app.get('/admin/settings', ...admin, (req, res) => {
    const s = getSettings();
    res.json({
      settings: {
        defaultQuotaBytes: s.defaultQuotaBytes,
        moderation: s.moderation,
        blockedExtensions: s.blockedExtensions,
        trashRetentionDays: s.trashRetentionDays,
        autoSuspendStrikes: s.autoSuspendStrikes,
      },
      blockedHashes: Object.entries(s.blockedHashes).map(([sha256, v]) => ({ sha256, ...v })),
      moderationConfigured,
    });
  });

  app.put('/admin/settings', ...admin, (req, res) => {
    const b = req.body || {};
    const s = getSettings();
    const int = (v, lo, hi) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new Error('Value out of range'); return n; };
    try {
      if (b.defaultQuotaBytes !== undefined) s.defaultQuotaBytes = int(b.defaultQuotaBytes, 0, 1e14);
      if (b.trashRetentionDays !== undefined) s.trashRetentionDays = int(b.trashRetentionDays, 0, 365);
      if (b.autoSuspendStrikes !== undefined) s.autoSuspendStrikes = int(b.autoSuspendStrikes, 0, 100);
      if (b.moderation) {
        if (b.moderation.mode !== undefined) {
          if (!['off', 'flag', 'quarantine'].includes(b.moderation.mode)) throw new Error('Invalid moderation mode');
          s.moderation.mode = b.moderation.mode;
        }
        if (b.moderation.scanImages !== undefined) s.moderation.scanImages = !!b.moderation.scanImages;
        if (b.moderation.scanText !== undefined) s.moderation.scanText = !!b.moderation.scanText;
      }
      if (b.blockedExtensions !== undefined) {
        if (!Array.isArray(b.blockedExtensions) || b.blockedExtensions.length > 50) throw new Error('Invalid extension list');
        s.blockedExtensions = [...new Set(b.blockedExtensions.map(e => String(e).toLowerCase().replace(/^\./, '')).filter(e => /^[a-z0-9]{1,10}$/.test(e)))];
      }
    } catch (err) { return res.status(400).json({ error: err.message }); }
    saveSettings(s);
    audit(req.user.email, 'settings-update', null, { keys: Object.keys(b) });
    res.json({ ok: true });
  });

  app.post('/admin/unban-hash', ...admin, (req, res) => {
    const sha = String(req.body && req.body.sha256 || '');
    const s = getSettings();
    if (!s.blockedHashes[sha]) return res.status(404).json({ error: 'Hash not blocked' });
    delete s.blockedHashes[sha];
    saveSettings(s);
    audit(req.user.email, 'unban-hash', sha, null);
    res.json({ ok: true });
  });

  app.get('/admin/audit', ...admin, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const action = req.query.action ? String(req.query.action) : null;
    let lines = [];
    try { lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean); } catch {}
    const out = [];
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      try {
        const rec = JSON.parse(lines[i]);
        if (!action || rec.action === action) out.push(rec);
      } catch {}
    }
    res.json({ entries: out });
  });

  return {
    uploadGate, suspendGuard, fileFilter, afterUpload, overQuota, quotaFor, usageFor,
    moveToTrash, audit, quarantined, moderationConfigured, moderationMode: () => getSettings().moderation.mode,
    trashDir: TRASH_DIR,
  };
};
