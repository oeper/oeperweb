// Cloud storage for the "one" office suite (oeper.dev/one) — oneWord, oneSheet,
// oneSlide, oneIdea and onePDF. Off by default; a signed-in user turns it on in
// the suite's Settings, and from then on each document is kept as ONE file on
// this server that gets overwritten in place on every save (unlike
// /upload-file, which always makes a new randomly named file).
//
// Storage reuses files.html's system on purpose: the file lands in
// USER_FILES_DIR with an entry in file-owners.json, filed under a per-app
// folder (oneWord/, oneSheet/, ...), so it shows up in oeper.dev/files, counts
// toward the same quota, respects suspensions, and goes through the same trash
// when deleted from either place. What's extra on the entry:
//   oneApp      'word' | 'sheet' | 'slide' | 'idea' | 'pdf'
//   oneId       the document's id inside the suite
//   oneUpdated  the document's own "last edited" time (ms) — sync is
//               last-writer-wins on this, so an older device can't overwrite a
//               newer save (PUT answers 409 instead)
//   oneExtra    PDFs only: the annotation layer (JSON string), kept beside the
//               untouched original PDF bytes
//
// Content is served back through GET /one-sync/... with no-store, never the
// 30-day-cached /docs static route: a file that changes in place would
// otherwise come back stale.
const fs = require('fs');
const path = require('path');
const express = require('express');

const APPS = {
  word: { folder: 'oneWord', ext: 'oneword', type: 'application/json' },
  sheet: { folder: 'oneSheet', ext: 'onesheet', type: 'application/json' },
  slide: { folder: 'oneSlide', ext: 'oneslide', type: 'application/json' },
  idea: { folder: 'oneIdea', ext: 'oneidea', type: 'application/json' },
  pdf: { folder: 'onePDF', ext: 'pdf', type: 'application/pdf' },
};
const MAX_DOC_BYTES = 50 * 1024 * 1024;   // same as files.html's "kept forever" threshold
const MAX_EXTRA_BYTES = 5 * 1024 * 1024;  // PDF annotations (can hold signature/stamp images)
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

module.exports = function oneSync(app, { verifyFirebaseToken, isOwner, USER_FILES_DIR, loadMeta, saveMeta, loadFolders, saveFolders, storage, makeFilename, publicBaseUrl }) {
  const dir = path.resolve(USER_FILES_DIR);
  const findEntry = (meta, email, oneApp, oneId) => Object.entries(meta).find(([, m]) => m.email === email && m.oneApp === oneApp && m.oneId === oneId);
  const cleanName = raw => {
    let s = ''; try { s = decodeURIComponent(String(raw || '')); } catch { s = String(raw || ''); }
    s = s.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    return s || 'Untitled';
  };
  function params(req, res) {
    const a = APPS[req.params.app];
    if (!a) { res.status(404).json({ error: 'Unknown app' }); return null; }
    if (req.params.id !== undefined && !ID_RE.test(req.params.id)) { res.status(400).json({ error: 'Invalid document id' }); return null; }
    return a;
  }
  function ensureFolder(email, folder) {
    const folders = loadFolders();
    const mine = folders[email] || [];
    if (!mine.includes(folder)) { folders[email] = [...mine, folder]; saveFolders(folders); }
  }
  const noStore = res => res.set('Cache-Control', 'no-store');

  // List the requester's documents for one app (never anyone else's, owners included —
  // this is a personal sync list, not a moderation view).
  app.get('/one-sync/:app', verifyFirebaseToken, (req, res) => {
    const a = params(req, res); if (!a) return;
    const meta = loadMeta();
    const docs = Object.entries(meta)
      .filter(([, m]) => m.email === req.user.email && m.oneApp === req.params.app)
      .map(([filename, m]) => ({ id: m.oneId, name: m.name, updated: m.oneUpdated || m.mtime || 0, size: m.size || 0, filename, hasExtra: !!m.oneExtra, quarantined: !!m.quarantined }));
    noStore(res); res.json({ docs });
  });

  // Fetch one document's content.
  app.get('/one-sync/:app/:id', verifyFirebaseToken, (req, res) => {
    const a = params(req, res); if (!a) return;
    const hit = findEntry(loadMeta(), req.user.email, req.params.app, req.params.id);
    if (!hit) return res.status(404).json({ error: 'Not found' });
    const [filename, m] = hit;
    if (m.quarantined) return res.status(451).json({ error: 'This file is under review.' });
    noStore(res);
    res.set('X-One-Updated', String(m.oneUpdated || 0));
    res.type(a.type);
    res.sendFile(path.join(dir, filename), err => { if (err && !res.headersSent) res.status(404).json({ error: 'Not found' }); });
  });

  // PDFs only: the annotation layer.
  app.get('/one-sync/:app/:id/extra', verifyFirebaseToken, (req, res) => {
    const a = params(req, res); if (!a) return;
    const hit = findEntry(loadMeta(), req.user.email, req.params.app, req.params.id);
    noStore(res);
    res.json({ extra: hit && hit[1].oneExtra ? hit[1].oneExtra : null });
  });
  app.put('/one-sync/:app/:id/extra', verifyFirebaseToken, storage.suspendGuard, express.text({ type: () => true, limit: MAX_EXTRA_BYTES }), (req, res) => {
    const a = params(req, res); if (!a) return;
    const meta = loadMeta();
    const hit = findEntry(meta, req.user.email, req.params.app, req.params.id);
    if (!hit) return res.status(404).json({ error: 'Save the document first' });
    hit[1].oneExtra = typeof req.body === 'string' ? req.body : '';
    saveMeta(meta);
    res.json({ ok: true });
  });

  // Create or overwrite. Headers: X-One-Name (URI-encoded title), X-One-Updated (ms).
  app.put('/one-sync/:app/:id', verifyFirebaseToken, storage.suspendGuard, express.raw({ type: () => true, limit: MAX_DOC_BYTES }), (req, res) => {
    const a = params(req, res); if (!a) return;
    const email = req.user.email;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!body.length) return res.status(400).json({ error: 'Empty document' });
    const updated = Number(req.headers['x-one-updated']) || Date.now();
    const title = cleanName(req.headers['x-one-name']);
    const name = `${title}.${a.ext}`;

    const meta = loadMeta();
    const hit = findEntry(meta, email, req.params.app, req.params.id);
    if (hit && (hit[1].oneUpdated || 0) > updated) {
      return res.status(409).json({ error: 'A newer version is already saved', updated: hit[1].oneUpdated });
    }
    const growth = body.length - (hit ? hit[1].size || 0 : 0);
    if (growth > 0 && storage.overQuota(email, growth)) return res.status(413).json({ error: 'Not enough storage for this document.' });

    const filename = hit ? hit[0] : makeFilename(name);
    const target = path.join(dir, filename);
    if (!target.startsWith(dir + path.sep)) return res.status(400).json({ error: 'Invalid filename' });
    const tmp = target + '.one-tmp';
    try { fs.writeFileSync(tmp, body); fs.renameSync(tmp, target); }
    catch (err) { try { fs.unlinkSync(tmp); } catch {} return res.status(500).json({ error: 'Could not write the file' }); }

    ensureFolder(email, a.folder);
    const fresh = loadMeta(); // re-read: the write above can take a moment on a phone
    const prev = fresh[filename] || {};
    fresh[filename] = Object.assign(prev, {
      email, name, size: body.length, mtime: Date.now(), folder: prev.folder !== undefined && hit ? prev.folder : a.folder,
      expiresAt: null, oneApp: req.params.app, oneId: req.params.id, oneUpdated: updated,
    });
    delete fresh[filename].sha256; // content changed
    saveMeta(fresh);
    if (!hit) storage.afterUpload(filename); // audit + moderation once, not on every autosave
    res.json({ ok: true, filename, updated, url: `${publicBaseUrl}/docs/${encodeURIComponent(filename)}` });
  });

  // Delete (goes to the server's trash, same as deleting it in oeper.dev/files).
  app.delete('/one-sync/:app/:id', verifyFirebaseToken, (req, res) => {
    const a = params(req, res); if (!a) return;
    const hit = findEntry(loadMeta(), req.user.email, req.params.app, req.params.id);
    if (!hit) return res.json({ ok: true, missing: true });
    storage.moveToTrash(hit[0], req.user.email);
    res.json({ ok: true });
  });

  // Lets /my-files point a suite document at the app that opens it.
  return {
    openUrlFor(m) {
      if (!m || !m.oneApp || !APPS[m.oneApp]) return null;
      return `https://oeper.dev/one/#open=${m.oneApp}:${encodeURIComponent(m.oneId)}`;
    },
  };
};
