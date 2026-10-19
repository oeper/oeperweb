// Epicenter, oeper.dev's app store: the checks on an app entry that someone submits (the store's catalog format, version 1).
// The shared catalog format is the same one epicenter/index.json and any custom source uses; see epicenter/README.md.
// Nothing here fetches the submitted links: they are only stored and shown, after an owner approved the entry.

export const PLATFORMS = ['android', 'ios', 'windows', 'macos', 'linux'];
export const FORMATS = [
  'apk', 'apks', 'xapk', 'apkm',                                  // Android
  'ipa', 'altstore', 'testflight', 'appstore',                    // iOS
  'exe', 'msi', 'msix', 'appx', 'portable',                       // Windows
  'dmg', 'pkg', 'app.zip',                                        // macOS
  'deb', 'rpm', 'appimage', 'flatpak', 'snap', 'tar.gz',          // Linux
  'zip', 'other',
];
export const CATEGORIES = ['ai', 'games', 'tools', 'productivity', 'media', 'social', 'developer', 'education', 'utilities', 'other'];

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,63}$/;
const PACKAGE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);

/** An https URL on a public host, or ''. */
export function cleanUrl(v, max = 500) {
  try {
    const u = new URL(String(v || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^\[/.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || !h.includes('.')) return '';
    const s = u.toString();
    return s.length <= max ? s : '';
  } catch { return ''; }
}

/** Checks and cleans one submitted app. Returns { app } or { error }. [owner]: a site owner may use the reserved ids. */
export function cleanApp(input, owner) {
  const a = input && typeof input === 'object' ? input : {};
  const id = clip(a.id, 64).toLowerCase();
  if (!ID_RE.test(id)) return { error: 'The app id must be 3 to 64 characters: lowercase letters, digits, dots, dashes or underscores (for Android apps use the package name).' };
  if (!owner && /^(dev\.oeper|oeper|epic|epicenter)/.test(id)) return { error: 'That id is reserved.' };
  const name = clip(a.name, 60);
  const summary = clip(a.summary, 140);
  if (name.length < 2) return { error: 'Give the app a name.' };
  if (summary.length < 8) return { error: 'Write a short summary (at least a few words).' };
  const homepage = a.homepage ? cleanUrl(a.homepage) : '';
  if (a.homepage && !homepage) return { error: 'The website must be a public https link.' };
  const icon = a.icon ? cleanUrl(a.icon) : '';
  if (a.icon && !icon) return { error: 'The icon must be a public https link to an image.' };
  const categories = (Array.isArray(a.categories) ? a.categories : []).map(c => clip(c, 20).toLowerCase()).filter(c => CATEGORIES.includes(c)).slice(0, 3);
  if (!categories.length) categories.push('other');
  const screenshots = (Array.isArray(a.screenshots) ? a.screenshots : []).map(u => cleanUrl(u)).filter(Boolean).slice(0, 6);

  const assets = [];
  for (const x of (Array.isArray(a.assets) ? a.assets : []).slice(0, 24)) {
    const platform = clip(x && x.platform, 12).toLowerCase(), format = clip(x && x.format, 12).toLowerCase();
    if (!PLATFORMS.includes(platform)) return { error: `Unknown platform “${platform}”. Use: ${PLATFORMS.join(', ')}.` };
    if (!FORMATS.includes(format)) return { error: `Unknown file format “${format}”. Use: ${FORMATS.join(', ')}.` };
    const url = cleanUrl(x.url);
    if (!url) return { error: `Every download needs a public https link (${platform} ${format}).` };
    const asset = { platform, format, url };
    const arch = clip(x.arch, 20).toLowerCase(); if (arch) asset.arch = arch;
    const sha = clip(x.sha256, 64).toLowerCase(); if (sha) { if (!/^[0-9a-f]{64}$/.test(sha)) return { error: 'A SHA-256 checksum is 64 hex characters.' }; asset.sha256 = sha; }
    const size = Math.floor(Number(x.size)); if (size > 0 && size < 20 * 1024 ** 3) asset.size = size;
    const manifest = x.manifest ? cleanUrl(x.manifest) : ''; if (manifest) asset.manifest = manifest;
    const label = clip(x.label, 40); if (label) asset.label = label;
    const minSdk = Math.floor(Number(x.minSdk)); if (minSdk >= 1 && minSdk <= 99) asset.minSdk = minSdk;
    assets.push(asset);
  }
  if (!assets.length) return { error: 'Add at least one download. Epicenter is for apps you install (apk, exe, dmg ...), not web pages.' };

  const app = { id, name, summary, categories, assets };
  const description = clip(a.description, 4000); if (description) app.description = description;
  if (homepage) app.homepage = homepage;
  if (icon) app.icon = icon;
  if (screenshots.length) app.screenshots = screenshots;
  const version = clip(a.version, 32); if (version) app.version = version;
  const versionCode = Math.floor(Number(a.versionCode)); if (versionCode > 0) app.versionCode = versionCode;
  const notes = clip(a.notes, 800); if (notes) app.notes = notes;
  const author = clip(a.author, 60); if (author) app.author = author;
  const license = clip(a.license, 40); if (license) app.license = license;
  const source = a.source ? cleanUrl(a.source) : ''; if (source) app.source = source;
  if (assets.some(x => x.platform === 'android' && ['apk', 'apks', 'xapk', 'apkm'].includes(x.format))) {
    const pkg = clip(a.package || id, 100);
    if (!PACKAGE_RE.test(pkg)) return { error: 'An Android app needs its package name (like com.example.app) so updates can be detected.' };
    app.package = pkg;
  }
  return { app };
}

/** A small update.json ({versionCode, versionName, size, sha256, notes}) next to a "latest" download link, cleaned. null when it is not one. */
export function parseManifest(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  const name = clip(m.versionName || m.version, 32); if (name) out.version = name;
  const code = Math.floor(Number(m.versionCode)); if (code > 0 && code < 2 ** 31) out.versionCode = code;
  const size = Math.floor(Number(m.size)); if (size > 0 && size < 20 * 1024 ** 3) out.size = size;
  const sha = clip(m.sha256, 64).toLowerCase(); if (/^[0-9a-f]{64}$/.test(sha)) out.sha256 = sha;
  const notes = clip(m.notes, 800); if (notes) out.notes = notes;
  return out.version || out.versionCode ? out : null;
}

export async function fetchManifest(url) {
  // GitHub release links redirect to a storage host and now and then answer slowly or with a 5xx: one more try before giving up
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'oeper-epicenter/1', Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cf: { cacheTtl: 0 } });
      if (!r.ok) { if (r.status < 500) return null; continue; }
      return parseManifest(JSON.parse((await r.text()).slice(0, 20000)));
    } catch { /* retry */ }
  }
  return null;
}

/**
 * Applies fetched manifests to a stored app entry: [results] = [{ i: asset index, m: parsed manifest }].
 * Returns { app, changed }. A new version with no checksum drops the old checksum (it would not match the new file).
 */
export function applyManifests(app, results) {
  const next = JSON.parse(JSON.stringify(app));
  let changed = false;
  const first = results.find(r => (next.assets[r.i] || {}).platform === 'android') || results[0];
  if (!first) return { app: next, changed };
  const set = (obj, key, val) => { if (val === undefined) { if (obj[key] !== undefined) { delete obj[key]; changed = true; } } else if (obj[key] !== val) { obj[key] = val; changed = true; } };
  set(next, 'version', first.m.version);
  if (first.m.versionCode !== undefined) set(next, 'versionCode', first.m.versionCode);
  if (first.m.notes !== undefined) set(next, 'notes', first.m.notes);
  for (const { i, m } of results) {
    const a = next.assets[i]; if (!a) continue;
    if (m.size !== undefined) set(a, 'size', m.size);
    set(a, 'sha256', m.sha256);
  }
  if (changed) next.releasedAt = Date.now();
  return { app: next, changed };
}
