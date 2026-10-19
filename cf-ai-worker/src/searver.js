// Private release channel for the Searver Android app (the owner's phone-server app): builds live in a private R2 bucket (binding RELEASES), and EVERY route needs the
// key (worker secret SEARVER_KEY). Without it the routes answer a plain 404, so the channel does not even show up as existing. The channel does not depend on the phone
// server being up, which the old "PC build -> phone server" route did.
//
//   PUT /api/searver/release   Authorization: Bearer <key>   body = the APK
//        headers: x-version-code, x-version-name, x-sha256 (R2 refuses the upload when it does not match), x-notes (URL-encoded, optional)
//   GET /api/searver/latest    -> { versionCode, versionName, size, sha256, notes, at }
//   GET /api/searver/download[?code=N]   -> the APK (default: the latest build)
//
// The three newest builds are kept. The Worker's request body limit is 100 MB, so a bigger APK is refused here with a clear message.

const MAX_BYTES = 95 * 1024 * 1024;
const KEEP = 3;
const enc = new TextEncoder();

async function keyOk(request, env) {
  const want = env.SEARVER_KEY || '';
  if (want.length < 16) return false;
  const h = request.headers.get('Authorization') || '';
  const given = h.startsWith('Bearer ') ? h.slice(7).trim() : (request.headers.get('x-searver-key') || '');
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const notFound = () => jsonRes({ error: 'Not found' }, 404);

export async function handleSearver(request, env, route) {
  if (!env.RELEASES || !(await keyOk(request, env))) return notFound();
  const bucket = env.RELEASES;

  if (route === 'latest' && request.method === 'GET') {
    const o = await bucket.get('latest.json');
    return o ? new Response(o.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }) : jsonRes({ error: 'No build uploaded yet.' }, 404);
  }

  if (route === 'download' && request.method === 'GET') {
    let code = Number(new URL(request.url).searchParams.get('code')) || 0;
    if (!code) { const l = await bucket.get('latest.json'); if (!l) return jsonRes({ error: 'No build uploaded yet.' }, 404); code = (await l.json()).versionCode; }
    const o = await bucket.get('builds/' + code + '.apk');
    if (!o) return jsonRes({ error: 'That build is gone.' }, 404);
    return new Response(o.body, { headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': String(o.size), 'Cache-Control': 'no-store', 'x-sha256': o.customMetadata && o.customMetadata.sha256 || '' } });
  }

  if (route === 'release' && request.method === 'PUT') {
    const code = Number(request.headers.get('x-version-code'));
    const name = String(request.headers.get('x-version-name') || '').slice(0, 60);
    const sha = String(request.headers.get('x-sha256') || '').toLowerCase();
    const len = Number(request.headers.get('content-length'));
    if (!Number.isInteger(code) || code < 1) return jsonRes({ error: 'x-version-code is required.' }, 400);
    if (!/^[0-9a-f]{64}$/.test(sha)) return jsonRes({ error: 'x-sha256 (hex) is required.' }, 400);
    if (!len || len < 1024) return jsonRes({ error: 'Send the APK as the request body.' }, 400);
    if (len > MAX_BYTES) return jsonRes({ error: 'The APK is over 95 MB, more than a Worker request can carry. Shrink the build or add a multipart upload.' }, 413);
    let notes = '';
    try { notes = decodeURIComponent(request.headers.get('x-notes') || '').slice(0, 2000); } catch { /* keep empty */ }
    try {
      await bucket.put('builds/' + code + '.apk', request.body, { sha256: sha, customMetadata: { sha256: sha, name } });
    } catch (e) { return jsonRes({ error: 'Upload refused: ' + (e && e.message || 'checksum mismatch or interrupted') }, 400); }
    // an APK is a zip file (starts with PK): refuse anything else. Checked after the upload on the stored bytes, so the request body is never buffered twice.
    const first = await bucket.get('builds/' + code + '.apk', { range: { offset: 0, length: 2 } });
    const magic = first ? new Uint8Array(await first.arrayBuffer()) : null;
    if (!magic || magic[0] !== 0x50 || magic[1] !== 0x4b) { await bucket.delete('builds/' + code + '.apk'); return jsonRes({ error: 'That is not an APK.' }, 400); }
    const info = { versionCode: code, versionName: name || null, size: len, sha256: sha, notes, at: Date.now() };
    // never move "latest" backwards: a re-upload of an older build keeps the newest as latest
    const cur = await bucket.get('latest.json');
    const curCode = cur ? (await cur.json()).versionCode : 0;
    if (code >= curCode) await bucket.put('latest.json', JSON.stringify(info), { httpMetadata: { contentType: 'application/json' } });
    const all = (await bucket.list({ prefix: 'builds/' })).objects.map(o => ({ key: o.key, code: Number(/builds\/(\d+)\.apk$/.exec(o.key)?.[1]) || 0 })).sort((a, b) => b.code - a.code);
    for (const old of all.slice(KEEP)) await bucket.delete(old.key);
    return jsonRes({ ok: true, ...info });
  }

  return notFound();
}
