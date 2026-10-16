// Who may open a file in USER_FILES_DIR (the /docs route, i.e. everything under oeper.dev/files).
//
// A file is PRIVATE or PUBLIC (file-owners.json entry field `access`):
//   private  only opens through a signed link (?exp=<ms>&sig=<hmac>) that the server hands to its owner's own pages
//            (/my-files, /file-link, the upload answer). The browser can't send an Authorization header for an
//            <img>/<video>/<a href>, so a signed, expiring link is what lets previews keep working without making the file
//            guessable-by-URL. The link stops working after a while; the owner just gets a fresh one next time.
//   public   opens at its plain /docs/<name> link, like before ("anyone with the link").
// What counts as which:
//   - new uploads by a signed-in person: private unless the client says `access=public` (files.html sends the person's
//     "new uploads are…" setting; sharing a One document sends public on purpose)
//   - files with no `access` yet (uploaded before this existed): public, so links people already shared don't break;
//     the owner can switch them (one by one or all at once) from oeper.dev/files
//   - anonymous uploads (no account to protect them): public, as before
//   - One-suite cloud documents (`oneApp`) and anything sitting in the folder that was never recorded: ALWAYS private
//     (the suite reads its documents through /one-sync with a sign-in; nothing needs them public)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

module.exports = function fileAccess({ dataDir, loadMeta, publicBaseUrl }) {
  // The signing key: FILE_LINK_SECRET from .env, else a random one created once and kept next to the other data files.
  let secret = process.env.FILE_LINK_SECRET || '';
  if (!secret) {
    const keyFile = path.join(dataDir, 'file-link-secret.txt');
    try { secret = fs.readFileSync(keyFile, 'utf8').trim(); } catch {}
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      try { fs.writeFileSync(keyFile, secret, { mode: 0o600 }); } catch (err) { console.error('Could not save file-link-secret.txt (links will break on restart):', err.message); }
    }
  }

  const DEFAULT_TTL_MS = 12 * 3600 * 1000;       // links on the pages the owner is looking at
  const MAX_TTL_MS = 30 * 24 * 3600 * 1000;      // "copy link" on a private file: up to 30 days

  const sign = (filename, exp) => crypto.createHmac('sha256', secret).update(filename + '\n' + exp).digest('base64url').slice(0, 27);
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

  // file-owners.json is re-read on every request otherwise (a page of thumbnails is dozens of requests)
  let cache = null, cacheAt = 0;
  const meta = () => { const now = Date.now(); if (!cache || now - cacheAt > 2000) { cache = loadMeta(); cacheAt = now; } return cache; };
  const invalidate = () => { cache = null; };

  function accessOf(m) {
    if (!m) return 'private';                           // in the folder but never recorded
    if (m.oneApp) return 'private';                     // One suite cloud documents
    if (m.access === 'public' || m.access === 'private') return m.access;
    return 'public';                                    // uploaded before access existed, or anonymous
  }

  const plainUrl = filename => `${publicBaseUrl}/docs/${encodeURIComponent(filename)}`;
  function signedUrl(filename, ttlMs = DEFAULT_TTL_MS) {
    const exp = Date.now() + Math.min(Math.max(ttlMs, 60000), MAX_TTL_MS);
    return `${plainUrl(filename)}?exp=${exp}&sig=${sign(filename, exp)}`;
  }
  /** The link to hand a page: plain for a public file, signed for a private one. */
  const urlFor = (filename, m, ttlMs) => (accessOf(m) === 'public' ? plainUrl(filename) : signedUrl(filename, ttlMs));

  /** Express middleware for the /docs mount: lets public files and correctly signed links through, hides the rest. */
  function gate(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let name;
    try { name = decodeURIComponent(req.path.split('/')[1] || ''); } catch { return next(); }
    if (!name) return next();
    if (accessOf(meta()[name]) === 'public') return next();
    const exp = Number(req.query.exp);
    if (exp > Date.now() && exp < Date.now() + MAX_TTL_MS + 60000 && same(req.query.sig || '', sign(name, exp))) { res.locals.privateFile = true; return next(); }
    res.status(404).type('text/plain').send('This file is private, or its link has expired. Open it from oeper.dev/files.');
  }

  /** express.static's setHeaders: a private file is never cached publicly (a proxy must not keep it for others). */
  const setHeaders = res => { if (res.locals && res.locals.privateFile) res.setHeader('Cache-Control', 'private, max-age=600'); };

  return { accessOf, urlFor, plainUrl, signedUrl, gate, setHeaders, invalidate, MAX_TTL_MS };
};
