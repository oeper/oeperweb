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

// Accounts allowed to use the owner-only /upload-file tool (admin.html's
// Files tab). Keep in sync with OWNER_EMAILS in shared/account.js — this
// server-side copy is what actually enforces it, the client-side one is
// only for hiding the UI.
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'sanhackerman@gmail.com,taejiding@gmail.com')
  .split(',').map(s => s.trim()).filter(Boolean);

// Max upload size. Change this number any time and restart the server —
// also update MAX_IMAGE_BYTES in forum.html to match so the browser
// rejects oversized files before even trying to upload them.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

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
// /upload). Override with the UPLOAD_DIR env var to save into shared/
// internal storage instead — see forum-server/README.md.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, 'uploads');

// Where files uploaded through admin.html's owner-only Files tool get saved
// (separate from forum attachments on purpose). Defaults to the phone's
// regular Documents folder, visible in the Files app.
const OWNER_FILES_DIR = process.env.OWNER_FILES_DIR || '/storage/emulated/0/Documents';
// ──────────────────────────────────────────────────────────────

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OWNER_FILES_DIR)) fs.mkdirSync(OWNER_FILES_DIR, { recursive: true });

const app = express();
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

function verifyOwnerToken(req, res, next) {
  verifyFirebaseToken(req, res, () => {
    if (!OWNER_EMAILS.includes(req.user.email)) {
      return res.status(403).json({ error: 'This account is not authorized to manage the site' });
    }
    next();
  });
}

function makeFilename(originalname) {
  const ext = path.extname(originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
}

// Forum post/comment attachments — any signed-in user, any file type.
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

// Owner-only general file uploads (admin.html's Files tab) — saved
// separately from forum attachments, into OWNER_FILES_DIR.
const uploadOwnerFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, OWNER_FILES_DIR),
    filename: (req, file, cb) => cb(null, makeFilename(file.originalname)),
  }),
  limits: { fileSize: MAX_FILE_BYTES },
});

app.post('/upload-file', verifyOwnerToken, (req, res) => {
  uploadOwnerFile.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/docs/${req.file.filename}` });
  });
});

const lastReportAt = new Map(); // email -> timestamp, simple per-user cooldown

app.post('/report', verifyFirebaseToken, async (req, res) => {
  const email = req.user.email || req.user.user_id || req.user.sub;
  const now = Date.now();
  const last = lastReportAt.get(email) || 0;
  if (now - last < REPORT_COOLDOWN_SECONDS * 1000) {
    return res.status(429).json({ error: `Please wait a few seconds before reporting again` });
  }

  const { type, reason, postId, commentId, url } = req.body || {};
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'A reason is required' });
  }
  if (!['post', 'comment'].includes(type)) {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  try {
    const discordRes = await fetch(DISCORD_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: [
          `**New forum report** (${type})`,
          `Reported by: ${email}`,
          `Reason: ${reason.trim().slice(0, 1000)}`,
          url ? `Link: ${url}` : null,
          postId ? `Post ID: ${postId}` : null,
          commentId ? `Comment ID: ${commentId}` : null,
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
app.use('/docs', express.static(OWNER_FILES_DIR, { maxAge: '30d' }));

app.get('/', (req, res) => res.send('oeperweb forum upload server is running.'));

app.listen(PORT, () => console.log(
  `Upload server listening on port ${PORT} (public base: ${PUBLIC_BASE_URL})\n` +
  `  forum attachments -> ${UPLOAD_DIR}\n` +
  `  owner files       -> ${OWNER_FILES_DIR}`
));
