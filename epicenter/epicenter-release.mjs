#!/usr/bin/env node
// Epicenter release helper: writes the update.json for a build and (optionally) publishes the release to Epicenter.
// Zero dependencies, Node 18+.  Docs: https://oeper.dev/epicenter/developers
//
//   node epicenter-release.mjs --file app.apk --version 1.2.0 --code 12 --notes "What is new" [--out update.json]
//   node epicenter-release.mjs --file app.apk --version 1.2.0 --code 12 --publish com.example.app --key epk_xxx
//
// Flags
//   --file     the build you are releasing (its size and SHA-256 are measured for you)
//   --version  human version (versionName)          --code   integer version (Android versionCode; required for Android)
//   --notes    what is new (max 800 characters)     --out    where to write update.json (default: ./update.json)
//   --publish  your app id: also tell Epicenter     --key    your publish key (or set EPICENTER_KEY)
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
console.log('upload it to the address you gave Epicenter as "manifest" (keep that address the same every release).');

if (args.publish) {
  const key = args.key && args.key !== 'true' ? args.key : process.env.EPICENTER_KEY;
  if (!key) die('--publish needs your publish key (--key or EPICENTER_KEY)');
  const api = (args.api || 'https://oeper-ai.oeper.workers.dev').replace(/\/$/, '');
  const app = { id: args.publish, version: args.version, versionCode: manifest.versionCode, notes: manifest.notes };
  for (const k of Object.keys(app)) if (app[k] === undefined) delete app[k];
  const res = await fetch(api + '/api/epicenter/publish', { method: 'PUT', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ app }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`Epicenter said ${res.status}: ${body.error || 'unknown error'}`);
  console.log(`published ${body.id}: ${body.status}`);
}
