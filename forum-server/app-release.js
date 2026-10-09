// Receives new builds of the Searver Android app straight from the developer's PC, so updating the phone needs no manual upload.
//
//   PUT /app-release            header  x-release-key: <RELEASE_KEY from .env>    body = the APK file
//                               optional x-version-code / x-version-name
//   GET /app-release/info       public: { versionCode, versionName, size, at } — no file, no key needed
//
// The APK lands in app-releases/Searver.apk next to this server, which is where the Searver app (running on the same phone)
// looks for updates (Settings → Updates). Disabled unless RELEASE_KEY is set. The file itself is never served over HTTP.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = Number(process.env.RELEASE_MAX_BYTES) || 250 * 1024 * 1024;

module.exports = function mountAppRelease(app, { dataDir }) {
  const dir = path.join(dataDir, 'app-releases');
  const infoFile = path.join(dir, 'latest.json');

  function keyOk(given) {
    const want = process.env.RELEASE_KEY || '';
    if (want.length < 16) return false; // refuse weak or missing keys outright
    const a = crypto.createHash('sha256').update(String(given || '')).digest();
    const b = crypto.createHash('sha256').update(want).digest();
    return crypto.timingSafeEqual(a, b);
  }

  app.get('/app-release/info', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(JSON.parse(fs.readFileSync(infoFile, 'utf8'))); } catch { res.status(404).json({ error: 'no build uploaded yet' }); }
  });

  app.put('/app-release', (req, res) => {
    if (!process.env.RELEASE_KEY) return res.status(404).json({ error: 'not enabled' });
    if (!keyOk(req.get('x-release-key'))) return res.status(403).json({ error: 'wrong key' });
    const declared = Number(req.get('content-length'));
    if (declared && declared > MAX_BYTES) return res.status(413).json({ error: 'too big' });

    fs.mkdirSync(dir, { recursive: true });
    const part = path.join(dir, 'Searver.apk.part');
    const out = fs.createWriteStream(part);
    let size = 0, magic = Buffer.alloc(0), failed = false;
    const fail = (code, msg) => {
      if (failed) return; failed = true;
      out.destroy(); fs.rm(part, { force: true }, () => {});
      if (!res.headersSent) res.status(code).json({ error: msg });
    };
    req.on('data', chunk => {
      if (magic.length < 4) magic = Buffer.concat([magic, chunk.subarray(0, 4 - magic.length)]);
      size += chunk.length;
      if (size > MAX_BYTES) { req.destroy(); fail(413, 'too big'); }
    });
    req.on('aborted', () => fail(400, 'upload interrupted'));
    req.on('error', () => fail(400, 'upload interrupted'));
    out.on('error', e => fail(500, e.message));
    req.pipe(out);
    out.on('finish', () => {
      if (failed) return;
      // an APK is a zip file: refuse anything else
      if (size < 1024 || magic.toString('latin1', 0, 2) !== 'PK') return fail(400, 'that is not an APK');
      try {
        fs.renameSync(part, path.join(dir, 'Searver.apk'));
        const info = {
          versionCode: Number(req.get('x-version-code')) || null,
          versionName: String(req.get('x-version-name') || '').slice(0, 60) || null,
          size, at: Date.now(),
        };
        fs.writeFileSync(infoFile, JSON.stringify(info));
        res.json({ ok: true, ...info });
      } catch (e) { fail(500, e.message); }
    });
  });

  return { dir };
};
