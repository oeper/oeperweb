#!/usr/bin/env node
// Epicenter release helper: writes the update.json for a build and (optionally) publishes the release to Epicenter.
// Zero dependencies, Node 18+.  Docs: https://oeper.dev/epicenter/developers
//
//   node epicenter-release.mjs --file app.apk --version 1.2.0 --code 12 --notes "What is new" [--out update.json]
//   node epicenter-release.mjs --file app.apk --version 1.2.0 --code 12 --id com.example.app --key epk_xxx
//        (uploads the file to oeper.dev, where Epicenter keeps every app, and publishes the release; the first time also give
//         --title "My App" --summary "One line about it" [--category tools,games] [--icon https://…] [--homepage https://…] [--package com.example.app])
//
// Flags
//   --file     the build you are releasing (its size and SHA-256 are measured for you)
//   --version  human version (versionName)          --code   integer version (Android versionCode; required for Android)
//   --notes    what is new (max 800 characters)     --out    where to write update.json (default: ./update.json)
//   --id       your app id: upload + publish        --key    your publish key (or set EPICENTER_KEY)   (--publish <id> works too)
//   --platform / --arch / --label / --minsdk / --name   optional: platform (guessed from the file type), arch, button label, Android min SDK, stored file name
//   --api      override the API address (default https://oeper-ai.oeper.workers.dev)
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : [])));
const die = msg => { console.error('error: ' + msg); process.exit(1); };

if (!args.file) die('--file is required (the build you are releasing)');
if (!args.version && !args.code) die('give --version and/or --code');

const size = (await stat(args.file).catch(() => die(`cannot read ${args.file}`))).size;
const sha256 = await new Promise((resolve, reject) => {
  const h = createHash('sha256');
  createReadStream(args.file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

const manifest = { versionName: args.version, versionCode: args.code ? Number(args.code) : undefined, size, sha256, notes: args.notes ? String(args.notes).slice(0, 800) : undefined };
for (const k of Object.keys(manifest)) if (manifest[k] === undefined) delete manifest[k];
const out = args.out && args.out !== 'true' ? args.out : 'update.json';
await writeFile(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${out}: ${JSON.stringify(manifest)}`);
if (!args.id && !args.publish) console.log('upload it to the address you gave Epicenter as "manifest", or use --id and --key to let Epicenter store the file for you.');

// Upload + publish: the file is stored on oeper.dev's file server (Epicenter keeps every app there), then the release is announced.
const id = args.id || (args.publish !== 'true' ? args.publish : '');
if (id) {
  const key = args.key && args.key !== 'true' ? args.key : process.env.EPICENTER_KEY;
  if (!key) die('--id needs your publish key (--key or EPICENTER_KEY)');
  const api = (args.api || 'https://oeper-ai.oeper.workers.dev').replace(/\/$/, '');
  const files = (args.files || 'https://fs.oeper.dev').replace(/\/$/, '');
  const ext = [['app.zip', 'macos'], ['tar.gz', 'linux'], ['apk', 'android'], ['apks', 'android'], ['xapk', 'android'], ['apkm', 'android'], ['exe', 'windows'], ['msi', 'windows'], ['msix', 'windows'], ['appx', 'windows'],
    ['dmg', 'macos'], ['pkg', 'macos'], ['deb', 'linux'], ['rpm', 'linux'], ['appimage', 'linux'], ['flatpak', 'linux'], ['snap', 'linux'], ['ipa', 'ios'], ['zip', '']]
    .find(([e]) => args.file.toLowerCase().endsWith('.' + e));
  if (!ext) die('cannot tell what kind of app file that is (use .apk .exe .dmg .deb ...)');
  const format = ext[0], platform = args.platform || ext[1];
  if (!platform) die('give --platform (android, windows, macos, linux, ios) for a .zip');
  const name = args.name || ['app', platform, args.arch].filter(Boolean).join('-') + '.' + format;   // a stable name: the link means "newest build"
  const { readFile } = await import('node:fs/promises');
  const up = await fetch(files + '/epicenter/files/' + encodeURIComponent(id) + '/' + name, {
    method: 'PUT', body: await readFile(args.file),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/octet-stream', 'x-version-name': args.version || '', 'x-version-code': args.code || '', 'x-notes': manifest.notes || '' },
  });
  const upBody = await up.json().catch(() => ({}));
  if (!up.ok) die('upload failed (' + up.status + '): ' + (upBody.error || 'unknown error'));
  console.log('uploaded: ' + upBody.url);
  const asset = { platform, format, url: upBody.url, manifest: upBody.manifest, sha256: upBody.sha256, size: upBody.size, arch: args.arch, label: args.label, minSdk: args.minsdk ? Number(args.minsdk) : undefined };
  const app = { id, name: args.title, summary: args.summary, icon: args.icon, homepage: args.homepage, package: args.package, categories: args.category ? String(args.category).split(',') : undefined,
    version: args.version, versionCode: manifest.versionCode, notes: manifest.notes, assets: [asset] };
  for (const o of [app, asset]) for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  const res = await fetch(api + '/api/epicenter/publish', { method: 'PUT', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ app }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`Epicenter said ${res.status}: ${body.error || 'unknown error'}`);
  console.log(`published ${body.id}: ${body.status}`);
}
