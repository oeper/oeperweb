'use strict';
// Content-addressed de-duplication for uploaded files — if the exact same
// bytes have already been uploaded anywhere on this server (a forum
// attachment, a video, a project, a chat attachment, or a personal file),
// a hard link is used instead of writing a second copy, so attaching the
// same image to two feed posts, or the same voice clip to two chats,
// doesn't cost extra disk space.
//
// Whether this actually saves space depends on the filesystem: a hard link
// only works within the same filesystem/mount, and Android's shared
// storage (/storage/emulated/0, the default for every *_DIR in
// upload-server.js) is commonly a FUSE mount that refuses hard links
// outright. When linking fails for any reason this falls back to leaving
// the file as a normal, fully-duplicated copy — every upload endpoint
// keeps working identically either way; this only ever changes how much
// disk space a duplicate costs, never whether the upload succeeds.
//
// The index (content-hashes.json, next to the other small JSON "databases"
// this server keeps) maps a sha256 to the path of one real file known to
// hold those bytes — not every copy, just one usable source to link from.
// Deleting that particular copy later (a personal-file delete, a
// moderation ban, ...) is always safe for whatever it's linked to: that's
// what a hard link IS at the filesystem level — the bytes are only
// actually freed once every directory entry pointing at them is gone, and
// the OS tracks that itself. Nothing else in this codebase needs to know
// or reference-count that.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function setupDedupe(dataDir) {
  const INDEX_FILE = path.join(dataDir, 'content-hashes.json');

  function loadIndex() {
    try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); } catch { return {}; }
  }
  function saveIndex(idx) {
    const tmp = INDEX_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 2));
    fs.renameSync(tmp, INDEX_FILE);
  }

  function sha256File(filePath) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(filePath)
        .on('data', d => h.update(d))
        .on('end', () => resolve(h.digest('hex')))
        .on('error', reject);
    });
  }

  // Logged once, the first time we actually learn whether hard links work
  // here — more useful than guessing in the startup banner, since it
  // depends on where *_DIR ends up pointing, not just the OS.
  let announced = false;
  function announce(working) {
    if (announced) return;
    announced = true;
    console.log(working
      ? 'dedupe: hard links work here — duplicate uploads reuse existing files instead of using extra space.'
      : 'dedupe: hard links are not available on this filesystem (common on Android shared storage) — duplicate uploads still work, but each one uses its own disk space.');
  }

  // Call once a file has finished being written to its final destination
  // (multer already did that — this is req.file.path). Returns
  // { hash, reused }; on success the file at filePath is guaranteed to
  // still exist with the right bytes whether or not de-duplication
  // actually happened, so callers never need to branch on the result.
  async function dedupeUpload(filePath, size) {
    let hash;
    try {
      hash = await sha256File(filePath);
    } catch (err) {
      console.error('dedupe: could not hash', filePath, err.message);
      return { hash: null, reused: false };
    }

    const idx = loadIndex();
    const existing = idx[hash];
    if (existing && existing.path !== filePath && fs.existsSync(existing.path)) {
      try {
        fs.unlinkSync(filePath);
        fs.linkSync(existing.path, filePath);
        announce(true);
        return { hash, reused: true };
      } catch (err) {
        try { fs.copyFileSync(existing.path, filePath); } catch (copyErr) {
          console.error('dedupe: fallback copy failed for', filePath, copyErr.message);
        }
        announce(false);
        return { hash, reused: false };
      }
    }

    // First time we've seen this hash, or the previous canonical copy is
    // gone (deleted/trashed/banned since it was recorded) — this upload
    // becomes the new canonical copy other duplicates can link from.
    idx[hash] = { path: filePath, size };
    saveIndex(idx);
    return { hash, reused: false };
  }

  return { dedupeUpload };
};
