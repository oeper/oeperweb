// Reads the app's own identity out of an APK (package name, versionCode, versionName, minSdk), so nobody has to type it.
// An APK is a zip; AndroidManifest.xml inside is Android's binary XML. No dependencies, reads only the parts it needs.

const fs = require('fs');
const zlib = require('zlib');

function readAt(fd, pos, len) { const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos); return b; }

/** The bytes of one entry of the zip at [file], or null. */
function zipEntry(file, wanted) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557), tail = readAt(fd, size - tailLen, tailLen);
    let e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (e < 0) return null;
    const count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    const cd = readAt(fd, cdOff, cdSize);
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) return null;
      const method = cd.readUInt16LE(p + 10), comp = cd.readUInt32LE(p + 20), nameLen = cd.readUInt16LE(p + 28), extra = cd.readUInt16LE(p + 30), cmt = cd.readUInt16LE(p + 32), local = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      if (name === wanted) {
        const lh = readAt(fd, local, 30);
        const data = readAt(fd, local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28), comp);
        return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
      }
      p += 46 + nameLen + extra + cmt;
    }
    return null;
  } finally { fs.closeSync(fd); }
}

/** Android binary XML: the attributes of the <manifest> and <uses-sdk> elements. */
function manifestAttrs(buf) {
  let off = 8; const strings = []; const out = {};
  const str = i => (i >= 0 && i < strings.length ? strings[i] : '');
  while (off + 8 <= buf.length) {
    const type = buf.readUInt16LE(off), hdr = buf.readUInt16LE(off + 2), size = buf.readUInt32LE(off + 4);
    if (size < 8) break;
    if (type === 0x0001) {                      // string pool
      const n = buf.readUInt32LE(off + 8), flags = buf.readUInt32LE(off + 16), start = buf.readUInt32LE(off + 20), utf8 = (flags & 0x100) !== 0;
      for (let i = 0; i < n; i++) {
        let q = off + start + buf.readUInt32LE(off + hdr + i * 4);
        if (utf8) {
          let l = buf[q++]; if (l & 0x80) l = ((l & 0x7f) << 8) | buf[q++];
          let b = buf[q++]; if (b & 0x80) b = ((b & 0x7f) << 8) | buf[q++];
          strings.push(buf.toString('utf8', q, q + b));
        } else {
          let l = buf.readUInt16LE(q); q += 2; if (l & 0x8000) { l = ((l & 0x7fff) << 16) | buf.readUInt16LE(q); q += 2; }
          strings.push(buf.toString('utf16le', q, q + l * 2));
        }
      }
    } else if (type === 0x0102) {               // start of an element
      const name = str(buf.readInt32LE(off + 20)), attrStart = buf.readUInt16LE(off + 24), attrSize = buf.readUInt16LE(off + 26), attrCount = buf.readUInt16LE(off + 28);
      if (name === 'manifest' || name === 'uses-sdk') {
        for (let i = 0; i < attrCount; i++) {
          const a = off + 16 + attrStart + i * attrSize;
          const key = str(buf.readInt32LE(a + 4)), raw = buf.readInt32LE(a + 8), dtype = buf[a + 15], data = buf.readUInt32LE(a + 16);
          out[name + ':' + key] = raw !== -1 ? str(raw) : dtype === 0x03 ? str(data) : data;
        }
      }
    }
    off += size;
  }
  return out;
}

/** { package, versionCode, versionName, minSdk } of an APK, or null when it is not a readable APK. */
function apkInfo(file) {
  try {
    const m = zipEntry(file, 'AndroidManifest.xml');
    if (!m) return null;
    const a = manifestAttrs(m);
    if (!a['manifest:package']) return null;
    return { package: String(a['manifest:package']), versionCode: Number(a['manifest:versionCode']) || 0, versionName: a['manifest:versionName'] ? String(a['manifest:versionName']) : '', minSdk: Number(a['uses-sdk:minSdkVersion']) || 0 };
  } catch { return null; }
}

module.exports = { apkInfo };
