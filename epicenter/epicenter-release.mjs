#!/usr/bin/env node
// Epicenter release helper: one command uploads your app file to oeper.dev and publishes the release.  Node 18+, no installs.
// Docs: https://oeper.dev/epicenter/developers
//
//   node epicenter-release.mjs app-release.apk
//
// Your publish key (oeper.dev/epicenter > my apps > publish keys) is read from --key, the EPICENTER_KEY variable, or a file named .epicenter-key
// in this folder or your home folder. An APK tells the script everything (app id, version, version code), so that is all there is to it.
//
//   first release of a new app:  add --title "My App" --summary "One line about it"
//   other files (exe, dmg, deb ...): add --id com.example.app --version 1.2.0
//   optional: --notes "What is new"  --category tools  --icon https://…  --homepage https://…  --platform / --arch / --label
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const args = { _: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const n = process.argv[i + 1]; args[a.slice(2)] = n && !n.startsWith('--') ? (i++, n) : 'true'; } else args._.push(a);
}
const die = msg => { console.error('error: ' + msg); process.exit(1); };
const file = args.file || args._[0];
if (!file) die('give the app file: node epicenter-release.mjs app-release.apk');

let key = args.key && args.key !== 'true' ? args.key : process.env.EPICENTER_KEY;
for (const dir of [process.cwd(), homedir()]) if (!key) key = (await readFile(join(dir, '.epicenter-key'), 'utf8').catch(() => '')).trim();
if (!key) die('no publish key. Make one on oeper.dev/epicenter (my apps > publish keys), then save it in a file named .epicenter-key or pass --key.');

const kinds = [['app.zip', 'macos'], ['tar.gz', 'linux'], ['apk', 'android'], ['apks', 'android'], ['xapk', 'android'], ['apkm', 'android'], ['exe', 'windows'], ['msi', 'windows'], ['msix', 'windows'], ['appx', 'windows'],
  ['dmg', 'macos'], ['pkg', 'macos'], ['deb', 'linux'], ['rpm', 'linux'], ['appimage', 'linux'], ['flatpak', 'linux'], ['snap', 'linux'], ['ipa', 'ios'], ['zip', '']];
const kind = kinds.find(([e]) => file.toLowerCase().endsWith('.' + e));
if (!kind) die('cannot tell what kind of app file that is (use .apk .exe .dmg .deb ...)');
const format = kind[0], platform = args.platform || kind[1];
if (!platform) die('give --platform (android, windows, macos, linux, ios) for a .zip');
const isApk = format === 'apk';
if (!isApk && !args.id) die('this is not an APK, so also give --id com.example.app and --version 1.2.0');

const api = (args.api || 'https://oeper-ai.oeper.workers.dev').replace(/\/$/, '');
const files = (args.files || 'https://fs.oeper.dev').replace(/\/$/, '');
const stored = args.name || ['app', platform, args.arch].filter(Boolean).join('-') + '.' + format;   // one stable name per platform: the link always means "newest build"
const bytes = await readFile(file).catch(() => die('cannot read ' + file));

console.log(`uploading ${basename(file)} (${(bytes.length / 1048576).toFixed(1)} MB) to oeper.dev…`);
const up = await fetch(files + '/epicenter/files/' + (isApk ? '_' : encodeURIComponent(args.id)) + '/' + stored, {
  method: 'PUT', body: bytes,
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/octet-stream', 'x-version-name': args.version || '', 'x-version-code': args.code || '', 'x-notes': args.notes || '' },
});
const u = await up.json().catch(() => ({}));
if (!up.ok) die(`upload failed (${up.status}): ${u.error || 'unknown error'}`);
console.log(`stored: ${u.url}  (${u.id}${u.versionName ? ' ' + u.versionName : ''}${u.versionCode ? ', code ' + u.versionCode : ''})`);

const asset = { platform, format, url: u.url, manifest: u.manifest, sha256: u.sha256, size: u.size, arch: args.arch, label: args.label, minSdk: u.minSdk };
const app = { id: u.id, name: args.title, summary: args.summary, icon: args.icon, homepage: args.homepage, categories: args.category ? String(args.category).split(',') : undefined,
  version: u.versionName || args.version, versionCode: u.versionCode, notes: args.notes, assets: [asset] };
if (isApk) app.package = u.id;
for (const o of [app, asset]) for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
const res = await fetch(api + '/api/epicenter/publish', { method: 'PUT', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ app }) });
const body = await res.json().catch(() => ({}));
if (!res.ok) {
  const e = body.error || 'unknown error';
  die(/name|summary/i.test(e) ? `${e}\nThis looks like the first release of this app: add  --title "My App" --summary "One line about it"  and run it again (the file is already uploaded).` : `Epicenter said ${res.status}: ${e}`);
}
console.log(body.status === 'approved' ? `published ${body.id}: it is live on oeper.dev/epicenter` : `submitted ${body.id}: an owner will approve it, then it is live. Later releases of this app go through the same command.`);
process.exit(0);
