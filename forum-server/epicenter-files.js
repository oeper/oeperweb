// Epicenter's file store: the apps listed in Epicenter (oeper.dev/epicenter) are kept HERE, on oeper.dev's file server, not on third-party hosts.
//
//   PUT    /epicenter/files/<app id>/<file name>   body = the file (raw bytes)
//          header  Authorization: Bearer <Firebase ID token>   or   Bearer epk_… (a publish key from "my apps")
//          optional  x-version-name, x-version-code, x-notes   (written into the file's update manifest; an APK supplies its own)
//          -> { id, url, manifest, sha256, size, versionName, versionCode, minSdk }   (the manifest is <file name>.json next to the file, created for you)
//          For an APK the app id may be "_": the id, version and version code are read from the APK itself (its package name is the id).
//          The site owner's RELEASE_KEY (header x-release-key) is accepted instead of Authorization.
//   GET    /epicenter/files/<app id>/<file name>   public download (and the .json manifest, with CORS open)
//   DELETE /epicenter/files/<app id>/<file name>   same Authorization as PUT; removes the file and its manifest
//
// Who may store files for an app id is decided by the Epicenter worker (POST /api/epicenter/upload-check, called with the
// uploader's own credentials): the id must be free or already theirs; ids reserved for oeper.dev are owners-only.
// Keeping the same file name replaces the file, so a stable link (like app-android.apk) always means "the newest build".
// Config (.env): EPICENTER_API (worker base URL), EPICENTER_MAX_BYTES (per file, default 100 MB: Cloudflare's own upload limit is the same),
// EPICENTER_APP_MAX_BYTES (per app id, default 1 GB), PUBLIC_BASE_URL (this server's public address, https://fs.oeper.dev).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { apkInfo } = require('./apkinfo');

const API = (process.env.EPICENTER_API || 'https://oeper-ai.oeper.workers.dev').replace(/\/$/, '');
const MAX_FILE = Number(process.env.EPICENTER_MAX_BYTES) || 100 * 1024 * 1024;
const MAX_APP = Number(process.env.EPICENTER_APP_MAX_BYTES) || 1024 * 1024 * 1024;
const ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const EXTS = ['apk', 'apks', 'xapk', 'apkm', 'ipa', 'exe', 'msi', 'msix', 'appx', 'dmg', 'pkg', 'deb', 'rpm', 'appimage', 'flatpak', 'snap', 'zip', 'gz', 'tgz'];

module.exports = function mountEpicenterFiles(app, { dataDir, publicBaseUrl }) {
  const root = path.join(dataDir, 'epicenter-files');
  const base = (publicBaseUrl || 'http://localhost:8787').replace(/\/$/, '') + '/epicenter/files';

  const ok = (id, name) => ID_RE.test(id) && NAME_RE.test(name) && name.indexOf('..') < 0 && EXTS.includes(name.split('.').pop().toLowerCase());
  const dirOf = id => path.join(root, id);
  const usedBy = (id, except) => {
    try { return fs.readdirSync(dirOf(id)).filter(f => f !== except && f !== '.owner' && !f.endsWith('.part')).reduce((n, f) => n + fs.statSync(path.join(dirOf(id), f)).size, 0); } catch { return 0; }
  };

  // the first uploader of an id keeps it (even before the app is submitted); owners of the site may always act
  const holderOf = id => { try { return fs.readFileSync(path.join(dirOf(id), '.owner'), 'utf8').trim(); } catch { return ''; } };

  // asks the worker whether this caller may store files for this app id; { email, owner } or { error, status }
  async function allowed(req, id) {
    const rk = req.get('x-release-key');
    if (rk) {   // the site owner's own key (the same RELEASE_KEY the Searver / epic AI builds use)
      const want = process.env.RELEASE_KEY || '';
      const h = v => crypto.createHash('sha256').update(String(v)).digest();
      return want.length >= 16 && crypto.timingSafeEqual(h(rk), h(want)) ? { ok: true, email: 'owner', owner: true } : { status: 403, error: 'Wrong release key.' };
    }
    const auth = req.get('authorization');
    if (!auth) return { status: 401, error: 'Sign in, or send a publish key.' };
    try {
      const r = await fetch(API + '/api/epicenter/upload-check', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok && !j.owner) { const h = holderOf(id); if (h && h !== j.email) return { status: 403, error: 'That app id belongs to someone else.' }; }
      return r.ok && j.ok ? j : { status: r.status === 401 ? 401 : 403, error: j.error || 'Not allowed.' };
    } catch { return { status: 502, error: 'Could not reach Epicenter to check your permission. Try again.' }; }
  }

  app.put('/epicenter/files/:id/:name', async (req, res) => {
    const given = String(req.params.id).toLowerCase(), name = req.params.name;
    const auto = given === '_' && name.toLowerCase().endsWith('.apk');   // the APK itself says which app it is
    if (auto ? !NAME_RE.test(name) : !ok(given, name)) return res.status(400).json({ error: 'Bad app id or file name (use letters, digits, dot, dash, underscore; an app file type like .apk or .exe).' });
    if (!req.get('authorization') && !req.get('x-release-key')) { req.resume(); return res.status(401).json({ error: 'Sign in, or send a publish key.' }); }
    // a known id is checked before the bytes are accepted; an "_" upload is staged and checked once the APK has named itself
    let who = auto ? { owner: false } : await allowed(req, given);
    if (who.error) { req.resume(); return res.status(who.status).json({ error: who.error }); }
    const limit = who.owner ? Math.max(MAX_FILE, 500 * 1024 * 1024) : MAX_FILE;
    const declared = Number(req.get('content-length'));
    if (declared && declared > limit) { req.resume(); return res.status(413).json({ error: 'That file is too big (limit ' + Math.round(limit / 1048576) + ' MB).' }); }
    const room = auto || who.owner ? Infinity : MAX_APP - usedBy(given, name) - usedBy(given, name + '.json');
    if (declared && declared > room) { req.resume(); return res.status(413).json({ error: 'This app has used its storage (' + Math.round(MAX_APP / 1048576) + ' MB). Delete old files first.' }); }

    const stage = auto ? path.join(root, '.incoming') : dirOf(given);
    fs.mkdirSync(stage, { recursive: true });
    const part = path.join(stage, (auto ? crypto.randomBytes(8).toString('hex') + '-' : '') + name + '.part');
    const out = fs.createWriteStream(part);
    const hash = crypto.createHash('sha256');
    let size = 0, magic = Buffer.alloc(0), failed = false;
    const fail = (code, msg) => { if (failed) return; failed = true; out.destroy(); fs.rm(part, { force: true }, () => { if (!auto) fs.rmdir(stage, () => {}); }); if (!res.headersSent) res.status(code).json({ error: msg }); };
    req.on('data', chunk => {
      if (magic.length < 4) magic = Buffer.concat([magic, chunk.subarray(0, 4 - magic.length)]);
      hash.update(chunk); size += chunk.length;
      if (size > limit || size > room) { req.destroy(); fail(413, 'That file is too big.'); }
    });
    req.on('aborted', () => fail(400, 'Upload interrupted.'));
    req.on('error', () => fail(400, 'Upload interrupted.'));
    out.on('error', e => fail(500, e.message));
    req.pipe(out);
    out.on('finish', async () => {
      if (failed) return;
      const ext = name.split('.').pop().toLowerCase();
      if (size < 1024) return fail(400, 'That file is too small to be an app.');
      if (['apk', 'apks', 'xapk', 'apkm', 'ipa', 'zip', 'msix', 'appx'].includes(ext) && magic.toString('latin1', 0, 2) !== 'PK') return fail(400, 'That is not a valid .' + ext + ' file.');
      try {
        let id = given, info = null;
        if (ext === 'apk') {
          info = apkInfo(part);
          if (!info) return fail(400, 'That is not a readable Android app (.apk).');
          if (auto) id = info.package.toLowerCase();
          else if (id !== info.package.toLowerCase()) return fail(400, "The app id must be the APK's package name: " + info.package + '.');
          if (!ID_RE.test(id)) return fail(400, "This app's package name (" + info.package + ') cannot be used as an Epicenter id.');
        }
        if (auto) {
          who = await allowed(req, id);
          if (who.error) return fail(who.status, who.error);
          if (!who.owner && MAX_APP - usedBy(id, name) - usedBy(id, name + '.json') < size) return fail(413, 'This app has used its storage (' + Math.round(MAX_APP / 1048576) + ' MB). Delete old files first.');
        }
        fs.mkdirSync(dirOf(id), { recursive: true });
        if (!holderOf(id)) fs.writeFileSync(path.join(dirOf(id), '.owner'), who.email);
        const final = path.join(dirOf(id), name);
        fs.renameSync(part, final);
        const sha256 = hash.digest('hex');
        const code = info ? info.versionCode : Math.floor(Number(req.get('x-version-code'))) || 0;
        const versionName = (info ? info.versionName : String(req.get('x-version-name') || '').slice(0, 32)) || undefined;
        const manifest = { versionName, versionCode: code > 0 ? code : undefined, size, sha256, notes: String(req.get('x-notes') || '').slice(0, 800) || undefined };
        fs.writeFileSync(final + '.json', JSON.stringify(manifest));
        res.json({ ok: true, id, url: base + '/' + id + '/' + name, manifest: base + '/' + id + '/' + name + '.json', sha256, size, versionName, versionCode: code || undefined, minSdk: info && info.minSdk || undefined });
      } catch (e) { fail(500, e.message); }
    });
  });

  app.delete('/epicenter/files/:id/:name', async (req, res) => {
    const id = String(req.params.id).toLowerCase(), name = req.params.name;
    if (!ok(id, name)) return res.status(400).json({ error: 'Bad app id or file name.' });
    const who = await allowed(req, id);
    if (who.error) return res.status(who.status).json({ error: who.error });
    for (const f of [name, name + '.json']) fs.rmSync(path.join(dirOf(id), f), { force: true });
    res.json({ ok: true });
  });

  // public downloads: files are never cached for long because the same name is replaced by the next release
  app.get('/epicenter/files/:id/:name', (req, res) => {
    const id = String(req.params.id).toLowerCase(), name = req.params.name;
    const manifest = name.endsWith('.json');
    if (!ok(id, manifest ? name.slice(0, -5) : name)) return res.status(404).json({ error: 'Not found.' });
    const f = path.join(dirOf(id), name);
    if (!fs.existsSync(f)) return res.status(404).json({ error: 'Not found.' });
    res.set('Access-Control-Allow-Origin', '*');
    if (manifest) { res.set({ 'Cache-Control': 'no-cache', 'Content-Type': 'application/json' }); return res.sendFile(f); }
    res.set({ 'Cache-Control': 'no-cache', 'Content-Disposition': 'attachment; filename="' + name + '"', 'X-Content-Type-Options': 'nosniff', 'Content-Type': 'application/octet-stream' });
    res.sendFile(f);
  });
};
