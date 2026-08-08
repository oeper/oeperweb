const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// ── Configuration — edit these ──────────────────────────────────
const PORT = process.env.PORT || 8787;

// From your firebaseConfig.projectId (Firebase console → Project settings).
const FIREBASE_PROJECT_ID = 'oepernet-1683535959256';

// Accounts with extra moderation power: can see and delete EVERY user's
// files (not just their own), and moderate the forum. Keep in sync with
// OWNER_EMAILS in shared/account.js and isOwner() in firestore.rules.
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'sanhackerman@gmail.com,taejiding@gmail.com')
  .split(',').map(s => s.trim()).filter(Boolean);

// Max upload size for signed-in accounts (files.html's general file
// storage only — forum/video/project/message attachments have their own
// caps below). No cap — limited only by your phone's storage and upload
// bandwidth through the Cloudflare Tunnel.
const MAX_FILE_BYTES = Infinity;

// Anonymous (not signed in) uploads to files.html are allowed, but capped
// harder: up to ANON_UPLOAD_LIMIT files total per IP address (tracked
// forever in anon-uploads.json, not per-session), each up to this size.
const ANON_MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const ANON_UPLOAD_LIMIT = 10;

// Origins allowed to call this server. Add more if you test from elsewhere.
const ALLOWED_ORIGINS = ['https://oeper.dev', 'http://localhost:8765'];

// The public URL this server is reachable at (your Cloudflare Tunnel address).
// Quick tunnels print a fresh https://xxxx.trycloudflare.com URL every time
// you start cloudflared — update this line (and forum.html's SERVER_ENDPOINT)
// whenever that changes. A named tunnel with a fixed hostname avoids that.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';

// Discord webhook for the forum's Report button. Kept server-side on purpose —
// this URL grants posting rights to your Discord channel to anyone who has it,
// so it must never be embedded in forum.html's public source.
const DISCORD_REPORT_WEBHOOK = process.env.DISCORD_REPORT_WEBHOOK
  || 'https://discord.com/api/webhooks/1534200247218339930/OQcrikaqx3xXssspH5ytq0M0AetTsHZrL_8qGwXTgI2vb71yem4GHPNYM0v48FUpZzM3';

// Minimum seconds between reports from the same signed-in user, to keep one
// person from flooding your Discord channel.
const REPORT_COOLDOWN_SECONDS = 10;

// Where forum post/comment attachments get saved (any signed-in user, via
// /upload). These are never publicly listed as a directory — only reachable
// via the specific URL a post/comment embeds. Needs termux-setup-storage
// (see forum-server/README.md) so Termux can write to shared storage.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : '/storage/emulated/0/Download/forum';

// Where files.html's personal file storage saves uploads — any signed-in
// user, not just owners, plus the occasional anonymous upload. /my-files
// only ever returns entries recorded in file-owners.json below (never a
// raw directory listing), so pointing this at your actual Documents folder
// doesn't expose anything that wasn't deliberately uploaded through the
// tool — except that any file already sitting in this folder becomes
// fetchable at /docs/<its exact filename> if someone knows or guesses it,
// since static serving covers the whole folder. Uploaded files get random
// generated names, so this mainly matters for pre-existing files with
// predictable names.
const USER_FILES_DIR = process.env.USER_FILES_DIR || '/storage/emulated/0/Documents';

// Tiny JSON-file "database" recording who uploaded each file.html file, so
// /my-files can filter to just the requesting account's own uploads.
const META_FILE = process.env.META_FILE || path.join(__dirname, 'file-owners.json');

// Per-user folder trees for files.html — { [email]: ["Docs", "Docs/2024", ...] }.
// Folders are a pure metadata concept (no matching directory on disk — every
// uploaded file still lands flat in USER_FILES_DIR under a random generated
// name; "folder" is just a label on that file's entry in file-owners.json).
// This list is what lets an *empty* folder exist and show up in navigation.
const FOLDERS_FILE = process.env.FOLDERS_FILE || path.join(__dirname, 'user-folders.json');

// Tracks anonymous uploads per IP address (their one free upload).
const ANON_FILE = process.env.ANON_FILE || path.join(__dirname, 'anon-uploads.json');

// Long-form video uploads (videos.html) — its own much higher size cap,
// since actual video files blow past MAX_FILE_BYTES fast. Shares a folder
// with forum attachments by default. Metadata (title/description/votes)
// lives in Firestore; this only stores the raw file and hands back a URL.
const VIDEO_DIR = process.env.VIDEO_DIR || '/storage/emulated/0/Download/forum';
const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES) || 300 * 1024 * 1024; // 300MB

// User-uploaded projects (projects.html) — any signed-in user.
const PROJECT_DIR = process.env.PROJECT_DIR || '/storage/emulated/0/Download/projects';
const MAX_PROJECT_BYTES = Number(process.env.MAX_PROJECT_BYTES) || 100 * 1024 * 1024; // 100MB

// Chat attachments (messages.html) — currently just voice messages, any
// signed-in user, kept small since these are short recordings not files.
const MESSAGE_DIR = process.env.MESSAGE_DIR || '/storage/emulated/0/Download/messages';
const MAX_MESSAGE_BYTES = Number(process.env.MAX_MESSAGE_BYTES) || 20 * 1024 * 1024; // 20MB
// ──────────────────────────────────────────────────────────────

[UPLOAD_DIR, USER_FILES_DIR, VIDEO_DIR, PROJECT_DIR, MESSAGE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const loadMeta = () => loadJson(META_FILE);
const saveMeta = meta => saveJson(META_FILE, meta);
const loadAnon = () => loadJson(ANON_FILE);
const saveAnon = data => saveJson(ANON_FILE, data);
function isOwner(email) { return OWNER_EMAILS.includes(email); }

// { [email]: [path, ...] } — loadJson/saveJson default to {} objects, which
// is also the right empty-state shape here (no keys = no one has folders yet).
const loadFolders = () => loadJson(FOLDERS_FILE);
const saveFolders = data => saveJson(FOLDERS_FILE, data);

// Folder paths are "/"-joined segments (e.g. "Docs/2024"). Each segment:
// letters/numbers/spaces/-_() only, 1-40 chars; max 5 levels deep. Returns
// null for anything invalid rather than trying to guess a "fixed" version.
function sanitizeFolderPath(raw) {
  if (typeof raw !== 'string') return null;
  const segments = raw.split('/').map(s => s.trim()).filter(Boolean);
  if (segments.length === 0 || segments.length > 5) return null;
  for (const seg of segments) {
    if (seg.length > 40 || !/^[A-Za-z0-9 _\-()]+$/.test(seg)) return null;
  }
  return segments.join('/');
}
// Every ancestor of a path, root-to-leaf: "Docs/2024/Q1" -> ["Docs", "Docs/2024", "Docs/2024/Q1"].
function folderAncestors(p) {
  const segments = p.split('/');
  return segments.map((_, i) => segments.slice(0, i + 1).join('/'));
}

const app = express();
app.set('trust proxy', true); // needed so req.ip reflects the real visitor through the Cloudflare Tunnel, not the local tunnel connection
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: '10kb' }));

// Verifies Firebase Auth ID tokens without needing the Admin SDK or any
// service-account secret on the device — just checks the signature against
// Google's public keys for Firebase's token-signing service.
const jwks = jwksClient({
  jwksUri: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
});
function getKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

function verifyFirebaseToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing sign-in token' });
  jwt.verify(token, getKey, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  }, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired sign-in token' });
    req.user = decoded;
    next();
  });
}

// Like verifyFirebaseToken, but a missing/invalid token just means
// req.user stays null instead of rejecting the request — used where
// anonymous access is allowed but signed-in gets different treatment.
function optionalAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) { req.user = null; return next(); }
  jwt.verify(token, getKey, {
    algorithms: ['RS256'],
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
  }, (err, decoded) => {
    req.user = err ? null : decoded;
    next();
  });
}

function makeFilename(originalname) {
  const ext = path.extname(originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

// ── Forum post/comment attachments — any signed-in user, any file type. ──
// Not part of the file-owners.json metadata system and never listed
// publicly — only reachable via the specific URL a post/comment embeds.
const uploadAttachment = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_FILE_BYTES },
});

app.post('/upload', verifyFirebaseToken, (req, res) => {
  uploadAttachment.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/files/${req.file.filename}` });
  });
});

// ── Long-form video uploads (videos.html) — any signed-in user. ──────────
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, VIDEO_DIR),
    filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_VIDEO_BYTES },
});

app.post('/upload-video', verifyFirebaseToken, (req, res) => {
  uploadVideo.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/videos/${req.file.filename}` });
  });
});

// ── Project uploads (projects.html) — any signed-in user. ────────────────
const uploadProject = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, PROJECT_DIR),
    filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_PROJECT_BYTES },
});

app.post('/upload-project', verifyFirebaseToken, (req, res) => {
  uploadProject.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/projects/${req.file.filename}` });
  });
});

// ── Chat attachments (messages.html), e.g. voice messages — any signed-in
// user. ───────────────────────────────────────────────────────────────
const uploadMessageFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, MESSAGE_DIR),
    filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_MESSAGE_BYTES },
});

app.post('/upload-message', verifyFirebaseToken, (req, res) => {
  uploadMessageFile.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/messages-media/${req.file.filename}` });
  });
});

// ── Personal file storage (files.html) — signed-in users get unlimited
// uploads up to MAX_FILE_BYTES each; anonymous visitors get up to
// ANON_UPLOAD_LIMIT uploads (per IP, tracked forever in anon-uploads.json),
// each up to ANON_MAX_FILE_BYTES. ───────────────────────────────────────
const userFileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, USER_FILES_DIR),
  filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
});
const uploadUserFile = multer({ storage: userFileStorage, limits: { fileSize: MAX_FILE_BYTES } });
const uploadAnonFile = multer({ storage: userFileStorage, limits: { fileSize: ANON_MAX_FILE_BYTES } });

app.post('/upload-file', optionalAuth, (req, res) => {
  if (req.user) {
    uploadUserFile.single('file')(req, res, err => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file received' });
      // Folder is optional (root upload if omitted) and only meaningful for
      // signed-in uploads — validated the same way /folders validates a new
      // folder, but an upload into a not-yet-created folder implicitly
      // creates it (and its ancestors), same as most file managers do.
      let folder = '';
      if (req.body.folder) {
        const clean = sanitizeFolderPath(req.body.folder);
        if (clean === null) return res.status(400).json({ error: 'Invalid folder' });
        folder = clean;
        const folders = loadFolders();
        const mine = folders[req.user.email] || [];
        const toAdd = folderAncestors(folder).filter(p => !mine.includes(p));
        if (toAdd.length) { folders[req.user.email] = [...mine, ...toAdd]; saveFolders(folders); }
      }
      const meta = loadMeta();
      meta[req.file.filename] = {
        email: req.user.email,
        name: req.file.originalname,
        size: req.file.size,
        mtime: Date.now(),
        folder,
      };
      saveMeta(meta);
      res.json({ url: `${PUBLIC_BASE_URL}/docs/${req.file.filename}` });
    });
    return;
  }

  // Anonymous: up to ANON_UPLOAD_LIMIT uploads per IP, ever.
  const ip = req.ip;
  const anon = loadAnon();
  if ((anon[ip] || 0) >= ANON_UPLOAD_LIMIT) {
    return res.status(403).json({ error: `Sign in to upload more — anonymous uploads are limited to ${ANON_UPLOAD_LIMIT} files per person.` });
  }
  uploadAnonFile.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    anon[ip] = (anon[ip] || 0) + 1;
    saveAnon(anon);
    const meta = loadMeta();
    meta[req.file.filename] = {
      email: null,
      name: req.file.originalname,
      size: req.file.size,
      mtime: Date.now(),
    };
    saveMeta(meta);
    res.json({ url: `${PUBLIC_BASE_URL}/docs/${req.file.filename}` });
  });
});

// Lists the requesting account's own uploads. Owners see everyone's, since
// they're responsible for managing the phone's storage.
app.get('/my-files', verifyFirebaseToken, (req, res) => {
  const meta = loadMeta();
  const mine = isOwner(req.user.email);
  const seen = new Set();
  const entries = Object.entries(meta)
    .filter(([, m]) => mine || m.email === req.user.email)
    .map(([filename, m]) => {
      seen.add(filename);
      return {
        filename,
        name: m.name || filename,
        size: m.size || 0,
        mtime: m.mtime || 0,
        email: m.email,
        folder: m.folder || '',
        url: `${PUBLIC_BASE_URL}/docs/${encodeURIComponent(filename)}`,
      };
    });

  // Owners also get files that physically exist in USER_FILES_DIR but were
  // never recorded in file-owners.json — e.g. uploaded before tracking
  // existed, dropped in manually, or a write that landed on disk but whose
  // metadata save failed. Without this, those files are invisible forever
  // since /my-files otherwise only ever reads from the JSON.
  if (mine) {
    try {
      const resolvedDir = path.resolve(USER_FILES_DIR);
      for (const filename of fs.readdirSync(resolvedDir)) {
        if (seen.has(filename)) continue;
        let stat;
        try { stat = fs.statSync(path.join(resolvedDir, filename)); } catch { continue; }
        if (!stat.isFile()) continue;
        entries.push({
          filename,
          name: filename,
          size: stat.size,
          mtime: stat.mtimeMs,
          email: null,
          folder: '',
          url: `${PUBLIC_BASE_URL}/docs/${encodeURIComponent(filename)}`,
          untracked: true,
        });
      }
    } catch {}
  }

  entries.sort((a, b) => b.mtime - a.mtime);

  // Folders: { email, path } pairs — just your own unless you're an owner
  // looking at everyone's, in which case every user's folder tree comes
  // back tagged with whose it is, so the client can group per-user.
  const allFolders = loadFolders();
  const folders = mine
    ? Object.entries(allFolders).flatMap(([email, paths]) => paths.map(path => ({ email, path })))
    : (allFolders[req.user.email] || []).map(path => ({ email: req.user.email, path }));

  res.json({ files: entries, folders });
});

// Create a folder (and any missing ancestors) for the requesting account.
app.post('/folders', verifyFirebaseToken, (req, res) => {
  const clean = sanitizeFolderPath(req.body && req.body.path);
  if (clean === null) return res.status(400).json({ error: 'Invalid folder name — letters, numbers, spaces, -_() only, up to 5 levels deep.' });
  const folders = loadFolders();
  const mine = folders[req.user.email] || [];
  const toAdd = folderAncestors(clean).filter(p => !mine.includes(p));
  if (toAdd.length) { folders[req.user.email] = [...mine, ...toAdd]; saveFolders(folders); }
  res.json({ ok: true, path: clean });
});

// Delete a folder — requester's own, or an owner's on anyone's behalf.
// Only succeeds if empty: no files filed under it and no subfolders. This
// matches ordinary file-manager behavior (empty the folder first) instead
// of silently cascading a delete or orphaning files into root.
app.delete('/folders', verifyFirebaseToken, (req, res) => {
  const clean = sanitizeFolderPath(req.body && req.body.path);
  if (clean === null) return res.status(400).json({ error: 'Invalid folder' });
  const targetEmail = (isOwner(req.user.email) && req.body.email) ? req.body.email : req.user.email;
  const folders = loadFolders();
  const mine = folders[targetEmail] || [];
  if (!mine.includes(clean)) return res.status(404).json({ error: 'Folder not found' });

  const hasSubfolder = mine.some(p => p !== clean && p.startsWith(clean + '/'));
  const meta = loadMeta();
  const hasFiles = Object.values(meta).some(m => m.email === targetEmail && m.folder === clean);
  if (hasSubfolder || hasFiles) return res.status(409).json({ error: 'Folder is not empty — move or delete its contents first.' });

  folders[targetEmail] = mine.filter(p => p !== clean);
  saveFolders(folders);
  res.json({ ok: true });
});

// Move a file into a different folder (or back to root with folder: "").
// Own file, or an owner's on anyone's behalf.
app.post('/move-file', verifyFirebaseToken, (req, res) => {
  const filename = path.basename(String(req.body && req.body.filename || ''));
  const meta = loadMeta();
  const entry = meta[filename];
  if (!entry) return res.status(404).json({ error: 'File not found' });
  if (entry.email !== req.user.email && !isOwner(req.user.email)) {
    return res.status(403).json({ error: 'You can only move your own files' });
  }
  const rawTarget = req.body && req.body.folder;
  let target = '';
  if (rawTarget) {
    target = sanitizeFolderPath(rawTarget);
    if (target === null) return res.status(400).json({ error: 'Invalid folder' });
    const folders = loadFolders();
    const owned = folders[entry.email] || [];
    if (!owned.includes(target)) return res.status(404).json({ error: 'Target folder does not exist' });
  }
  entry.folder = target;
  saveMeta(meta);
  res.json({ ok: true });
});

// Rename a file's display name (the random generated filename on disk, and
// its URL, never change — only the human-readable name shown in the UI).
app.post('/rename-file', verifyFirebaseToken, (req, res) => {
  const filename = path.basename(String(req.body && req.body.filename || ''));
  const name = String(req.body && req.body.name || '').trim();
  if (!name || name.length > 200) return res.status(400).json({ error: 'Invalid name' });
  const meta = loadMeta();
  const entry = meta[filename];
  if (!entry) return res.status(404).json({ error: 'File not found' });
  if (entry.email !== req.user.email && !isOwner(req.user.email)) {
    return res.status(403).json({ error: 'You can only rename your own files' });
  }
  entry.name = name;
  saveMeta(meta);
  res.json({ ok: true });
});

// Delete: the file's own uploader, or an owner.
app.delete('/docs/:filename', verifyFirebaseToken, (req, res) => {
  const base = path.basename(req.params.filename);
  if (!base || base !== req.params.filename) return res.status(400).json({ error: 'Invalid filename' });

  const meta = loadMeta();
  const entry = meta[base];
  const owner = isOwner(req.user.email);
  if (entry) {
    if (entry.email !== req.user.email && !owner) {
      return res.status(403).json({ error: 'You can only delete your own files' });
    }
  } else if (!owner) {
    // No metadata for this file and the requester isn't an owner — there's
    // no way to prove they uploaded it, so refuse rather than guess.
    return res.status(404).json({ error: 'File not found' });
  }

  const resolvedDir = path.resolve(USER_FILES_DIR);
  const target = path.join(resolvedDir, base);
  if (!target.startsWith(resolvedDir + path.sep)) return res.status(400).json({ error: 'Invalid filename' });
  try { fs.unlinkSync(target); } catch {}
  delete meta[base];
  saveMeta(meta);
  res.json({ ok: true });
});

const lastReportAt = new Map(); // email -> timestamp, simple per-user cooldown

app.post('/report', verifyFirebaseToken, async (req, res) => {
  const email = req.user.email || req.user.user_id || req.user.sub;
  const now = Date.now();
  const last = lastReportAt.get(email) || 0;
  if (now - last < REPORT_COOLDOWN_SECONDS * 1000) {
    return res.status(429).json({ error: `Please wait a few seconds before reporting again` });
  }

  const { type, reason, postId, commentId, itemId, url } = req.body || {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required' });
  }
  // Every reportable content type on the site: forum posts/comments, long-form
  // videos, Stories, Notes, chat messages/conversations, and profiles.
  if (!['post', 'comment', 'video', 'story', 'note', 'message', 'conversation', 'profile'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  try {
    const discordRes = await fetch(DISCORD_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [
          `**New report** (${type})`,
          `Reported by: ${email}`,
          `Reason: ${reason.trim().slice(0, 1000)}`,
          url ? `Link: ${url}` : null,
          postId ? `Post ID: ${postId}` : null,
          commentId ? `Comment ID: ${commentId}` : null,
          itemId ? `Item ID: ${itemId}` : null,
        ].filter(Boolean).join('\n'),
      }),
    });
    if (!discordRes.ok) throw new Error(`Discord webhook responded ${discordRes.status}`);
    lastReportAt.set(email, now);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: 'Could not deliver report: ' + err.message });
  }
});

app.use('/files', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use('/docs', express.static(USER_FILES_DIR, { maxAge: '30d' }));
app.use('/videos', express.static(VIDEO_DIR, { maxAge: '30d' }));
app.use('/projects', express.static(PROJECT_DIR, { maxAge: '30d' }));
app.use('/messages-media', express.static(MESSAGE_DIR, { maxAge: '30d' }));

app.get('/', (req, res) => res.send('oeperweb forum upload server is running.'));

app.listen(PORT, () => console.log(
  `Upload server listening on port ${PORT} (public base: ${PUBLIC_BASE_URL})\n` +
  `  forum attachments -> ${UPLOAD_DIR}\n` +
  `  personal files     -> ${USER_FILES_DIR}\n` +
  `  videos             -> ${VIDEO_DIR}\n` +
  `  projects           -> ${PROJECT_DIR}\n` +
  `  chat attachments   -> ${MESSAGE_DIR}`
));
