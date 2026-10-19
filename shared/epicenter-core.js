// Epicenter (oeper.dev's app store): the parts that don't touch the page. Catalog format: epicenter/README.md.
export const WORKER = 'https://oeper-ai.oeper.workers.dev';

export const PLATFORMS = [
  { id: 'android', label: 'Android', icon: 'android' },
  { id: 'windows', label: 'Windows', icon: 'desktop_windows' },
  { id: 'macos', label: 'macOS', icon: 'laptop_mac' },
  { id: 'linux', label: 'Linux', icon: 'terminal' },
  { id: 'ios', label: 'iPhone / iPad', icon: 'phone_iphone' },
];
export const PLATFORM = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));

export const FORMATS = {
  apk: 'APK', apks: 'APKS bundle', xapk: 'XAPK bundle', apkm: 'APKM bundle',
  ipa: 'IPA', altstore: 'AltStore source', testflight: 'TestFlight', appstore: 'App Store',
  exe: 'Installer (.exe)', msi: 'Installer (.msi)', msix: 'MSIX', appx: 'APPX', portable: 'Portable (.exe)',
  dmg: 'Disk image (.dmg)', pkg: 'Installer (.pkg)', 'app.zip': 'App (.zip)',
  deb: 'Debian / Ubuntu (.deb)', rpm: 'Fedora / RHEL (.rpm)', appimage: 'AppImage', flatpak: 'Flatpak', snap: 'Snap', 'tar.gz': 'Archive (.tar.gz)',
  zip: 'Archive (.zip)', other: 'File',
};
// which format to put first on a platform
const ORDER = {
  android: ['apk', 'apks', 'xapk', 'apkm'],
  windows: ['exe', 'msi', 'msix', 'appx', 'portable', 'zip'],
  macos: ['dmg', 'pkg', 'app.zip', 'zip'],
  linux: ['appimage', 'deb', 'rpm', 'flatpak', 'snap', 'tar.gz', 'zip'],
  ios: ['appstore', 'testflight', 'altstore', 'ipa'],
};
export const CATEGORIES = [
  { id: 'ai', label: 'AI', icon: 'auto_awesome' }, { id: 'games', label: 'Games', icon: 'sports_esports' },
  { id: 'tools', label: 'Tools', icon: 'build' }, { id: 'productivity', label: 'Productivity', icon: 'work' },
  { id: 'media', label: 'Media', icon: 'movie' }, { id: 'social', label: 'Social', icon: 'forum' },
  { id: 'developer', label: 'Developer', icon: 'code' }, { id: 'education', label: 'Education', icon: 'school' },
  { id: 'utilities', label: 'Utilities', icon: 'handyman' }, { id: 'other', label: 'Other', icon: 'apps' },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const ANDROID_FORMATS = ['apk', 'apks', 'xapk', 'apkm'];

/** The platform of the device that is looking at the page. */
export function detectPlatform(ua = navigator.userAgent, nav = navigator) {
  const p = String(nav.platform || '');
  if (/android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (p === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ios';
  if (/CrOS/i.test(ua)) return 'linux';
  if (/Win/i.test(p) || /Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(p) || /Macintosh/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(p + ua)) return 'linux';
  return 'other';   // not a device Epicenter has apps for
}

/** Where a file from a GitHub release belongs, from its name: { platform, format, arch } or null when it isn't an app file. */
export function classifyFile(name) {
  const n = String(name).toLowerCase();
  const arch = /arm64|aarch64/.test(n) ? 'arm64' : /x64|x86[_-]?64|amd64/.test(n) ? 'x64' : /\b(i[3-6]86|x86|win32|ia32)\b|[-_.](i[3-6]86|x86)[-_.]/.test(n) ? 'x86' : /universal/.test(n) ? 'universal' : '';
  const hint = /mac|darwin|osx|apple/.test(n) ? 'macos' : /win/.test(n) ? 'windows' : /linux|ubuntu|debian/.test(n) ? 'linux' : '';
  const ext = [['.apks', 'android', 'apks'], ['.xapk', 'android', 'xapk'], ['.apkm', 'android', 'apkm'], ['.apk', 'android', 'apk'], ['.ipa', 'ios', 'ipa'],
    ['.msixbundle', 'windows', 'msix'], ['.msix', 'windows', 'msix'], ['.appxbundle', 'windows', 'appx'], ['.appx', 'windows', 'appx'], ['.msi', 'windows', 'msi'],
    ['.dmg', 'macos', 'dmg'], ['.pkg', 'macos', 'pkg'], ['.deb', 'linux', 'deb'], ['.rpm', 'linux', 'rpm'], ['.appimage', 'linux', 'appimage'], ['.flatpak', 'linux', 'flatpak'], ['.snap', 'linux', 'snap'],
  ].find(e => n.endsWith(e[0]));
  if (ext) return { platform: ext[1], format: ext[2], arch };
  if (n.endsWith('.exe')) return { platform: 'windows', format: /portable/.test(n) ? 'portable' : 'exe', arch };
  if (/\.(tar\.gz|tgz|tar\.xz)$/.test(n)) return hint === 'macos' ? { platform: 'macos', format: 'zip', arch } : { platform: 'linux', format: 'tar.gz', arch };
  if (n.endsWith('.zip')) return hint ? { platform: hint, format: hint === 'macos' ? 'app.zip' : 'zip', arch } : null;
  return null;
}

/** A GitHub repo's newest release as one catalog app (so any repo with release files is a source). */
export function githubToApp(repo, release, info) {
  const assets = [];
  for (const a of (release.assets || [])) {
    const c = classifyFile(a.name); if (!c) continue;
    const x = { platform: c.platform, format: c.format, url: a.browser_download_url, size: a.size, label: a.name };
    if (c.arch) x.arch = c.arch;
    const d = /^sha256:([0-9a-f]{64})$/i.exec(a.digest || ''); if (d) x.sha256 = d[1].toLowerCase();
    assets.push(x);
  }
  return {
    id: 'github:' + repo.toLowerCase(), name: info.name || repo.split('/')[1], summary: (info.description || 'From GitHub ' + repo).slice(0, 140),
    description: (release.body || '').slice(0, 4000), homepage: info.html_url, source: info.html_url, author: (info.owner && info.owner.login) || repo.split('/')[0],
    license: info.license && info.license.spdx_id && info.license.spdx_id !== 'NOASSERTION' ? info.license.spdx_id : undefined,
    version: String(release.tag_name || '').replace(/^v/i, ''), notes: (release.body || '').slice(0, 800), categories: ['other'],
    icon: info.owner && info.owner.avatar_url, assets,
    package: undefined, date: release.published_at,
  };
}

/** Accepts "github:owner/repo", "owner/repo" or a github.com link; returns "owner/repo" or ''. */
export function parseRepo(text) {
  const t = String(text || '').trim();
  const m = /^(?:github:|https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/.exec(t);
  return m ? m[1] + '/' + m[2] : '';
}

export const isHttps = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

/** Keeps only what the page can show safely: https links, known platforms and formats. */
export function normalizeCatalog(json, trust, sourceName) {
  const apps = (json && Array.isArray(json.apps)) ? json.apps : [];
  const out = [];
  for (const a of apps) {
    if (!a || typeof a !== 'object' || !a.id || !a.name) continue;
    const assets = (Array.isArray(a.assets) ? a.assets : []).filter(x => x && PLATFORM[x.platform] && FORMATS[x.format] && isHttps(x.url))
      .map(x => ({ ...x, sha256: /^[0-9a-f]{64}$/i.test(x.sha256 || '') ? x.sha256.toLowerCase() : undefined, manifest: isHttps(x.manifest) ? x.manifest : undefined }));
    if (!assets.length) continue;
    out.push({
      ...a, id: String(a.id), name: String(a.name).slice(0, 80), summary: String(a.summary || '').slice(0, 200), assets,
      categories: (Array.isArray(a.categories) ? a.categories : []).filter(c => CATEGORY[c]).slice(0, 3),
      icon: isHttps(a.icon) ? a.icon : '', homepage: isHttps(a.homepage) ? a.homepage : '', source: isHttps(a.source) ? a.source : '',
      screenshots: (Array.isArray(a.screenshots) ? a.screenshots : []).filter(isHttps).slice(0, 6),
      _trust: trust, _source: sourceName || (json && json.name) || '',
    });
  }
  return out;
}

export const platformsOf = app => [...new Set(app.assets.map(a => a.platform))].sort((a, b) => PLATFORMS.findIndex(p => p.id === a) - PLATFORMS.findIndex(p => p.id === b));

/** The files of [app] for [platform], best first (the format a person most likely wants). */
export function assetsFor(app, platform) {
  const order = ORDER[platform] || [];
  const rank = a => { const i = order.indexOf(a.format); return i < 0 ? 99 : i; };
  return app.assets.filter(a => a.platform === platform).sort((a, b) => rank(a) - rank(b));
}

export function fmtSize(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}

/** -1, 0, 1 like a version compare ("1.10" > "1.9"). */
export function compareVersions(a, b) {
  const pa = String(a || '').split(/[.+-]/).map(x => parseInt(x, 10) || 0), pb = String(b || '').split(/[.+-]/).map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

export function matches(app, q) {
  const t = String(q || '').trim().toLowerCase(); if (!t) return true;
  return [app.name, app.summary, app.author, app.id, ...(app.categories || [])].some(s => String(s || '').toLowerCase().includes(t));
}

/** Overrides version / size / checksum from an asset's `manifest` (a small JSON next to a "latest" link, read through the worker because GitHub sends no CORS headers). Best effort. */
export async function resolveManifests(apps) {
  await Promise.all(apps.flatMap(app => app.assets.filter(a => a.manifest).map(async a => {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(WORKER + '/api/epicenter/manifest?url=' + encodeURIComponent(a.manifest), { signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) return;
      const m = await r.json();
      if (m.version) app.version = String(m.version);
      if (m.versionCode) app.versionCode = Number(m.versionCode);
      if (m.size) a.size = Number(m.size);
      if (m.sha256) a.sha256 = m.sha256;
      if (m.notes) app.notes = m.notes;
    } catch { /* leave the catalog's own numbers */ }
  })));
}
