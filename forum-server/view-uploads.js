#!/usr/bin/env node
// Prints "who uploaded what, where, and its link" from the audit log
// storage-admin.js already keeps (audit-log.jsonl, next to file-owners.json).
// Meant to be run on the phone (`node view-uploads.js`), and is what
// aio.sh's "recent uploads" menu item calls — see that file for the
// interactive wrapper.
//
// Usage: node view-uploads.js [N] [--user email] [--dest forum|video|project|message|file]
// N defaults to 25. With no DATA_DIR override this reads the same
// audit-log.jsonl the running server writes to.

const fs = require('fs');
const path = require('path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const AUDIT_FILE = path.join(DATA_DIR, 'audit-log.jsonl');

const args = process.argv.slice(2);
let limit = 25;
let userFilter = null;
let destFilter = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--user') userFilter = args[++i];
  else if (args[i] === '--dest') destFilter = args[++i];
  else if (/^\d+$/.test(args[i])) limit = Number(args[i]);
}

function readLines(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch { return []; }
}
// Oldest first: the rotated-out file (if any), then the current one.
const lines = [...readLines(AUDIT_FILE + '.1'), ...readLines(AUDIT_FILE)];

const fmtSize = n => {
  n = Number(n) || 0;
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(1) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
};
const DEST_LABEL = { forum: 'forum attachment', video: 'video', project: 'project', message: 'chat attachment', file: 'personal file' };

let rows = [];
for (const line of lines) {
  let rec;
  try { rec = JSON.parse(line); } catch { continue; }
  if (rec.action !== 'upload') continue;
  const d = rec.detail || {};
  if (userFilter && rec.actor !== userFilter) continue;
  if (destFilter && d.dest !== destFilter) continue;
  rows.push(rec);
}
rows = rows.slice(-limit).reverse(); // most recent first

if (!rows.length) {
  console.log(AUDIT_FILE.length && fs.existsSync(AUDIT_FILE) ? 'No uploads recorded yet.' : `No audit log found at ${AUDIT_FILE} — has the server logged any uploads since this feature was added?`);
  process.exit(0);
}

console.log(`Last ${rows.length} upload(s)${userFilter ? ` by ${userFilter}` : ''}${destFilter ? ` to ${destFilter}` : ''}:\n`);
for (const rec of rows) {
  const d = rec.detail || {};
  const when = new Date(rec.t).toLocaleString();
  const where = d.dest ? (DEST_LABEL[d.dest] || d.dest) + (d.folder ? ` (${d.folder})` : '') : 'unknown';
  console.log(`${when}  ${rec.actor || 'unknown'}`);
  console.log(`  ${d.name || rec.target || '(unnamed)'}  ·  ${where}${d.size ? '  ·  ' + fmtSize(d.size) : ''}`);
  if (d.url) console.log(`  ${d.url}`);
  console.log('');
}
