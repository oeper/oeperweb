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

// Max upload size. Change this number any time and restart the server —
// also update MAX_IMAGE_BYTES in forum.html to match so the browser
// rejects oversized files before even trying to upload them.
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB

// Origins allowed to call this server. Add more if you test from elsewhere.
const ALLOWED_ORIGINS = ['https://oeper.dev', 'http://localhost:8765'];

// The public URL this server is reachable at (your Cloudflare Tunnel address).
// Quick tunnels print a fresh https://xxxx.trycloudflare.com URL every time
// you start cloudflared — update this line (and forum.html's UPLOAD_ENDPOINT)
// whenever that changes. A named tunnel with a fixed hostname avoids that.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:8787';
// ──────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

app.post('/upload', verifyFirebaseToken, (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ url: `${PUBLIC_BASE_URL}/files/${req.file.filename}` });
  });
});

app.use('/files', express.static(UPLOAD_DIR, { maxAge: '30d' }));

app.get('/', (req, res) => res.send('oeperweb forum upload server is running.'));

app.listen(PORT, () => console.log(`Upload server listening on port ${PORT} (public base: ${PUBLIC_BASE_URL})`));
