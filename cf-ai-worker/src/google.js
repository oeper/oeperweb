// Google Docs and Sheets for epic AI. A signed-in person connects their Google account once (OAuth, in a browser tab); the worker keeps the
// refresh token sealed in the ledger (AES-GCM, key derived from the client secret) and runs the tools below with it, so every client
// (website, Android, desktop) gets the same abilities and no Google token ever reaches a device.
//
// Needs two secrets: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Web-application OAuth client in Google Cloud, with the Docs API and Sheets API
// switched on and REDIRECT_URI below listed as an authorised redirect URI). Without them nothing is offered and "configured" is false.
//
// Scopes are Docs + Sheets only (no Drive listing), so the tools take a link or an id: the person pastes the link of the file they mean.

export const REDIRECT_URI = 'https://oeper-ai.oeper.workers.dev/api/google/callback';
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/spreadsheets'];
const STATE_MS = 10 * 60_000;
const MAX_READ_CHARS = 20000;

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = s => b64(enc.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => dec.decode(unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)));

export const googleConfigured = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// ── sealing: the stored record is encrypted so a leaked database row alone is useless ──
async function sealKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(env.GOOGLE_CLIENT_SECRET + ':epicai-google-tokens'));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), enc.encode(JSON.stringify(obj)));
  return b64(iv) + '.' + b64(ct);
}
async function unseal(env, text) {
  try {
    const [iv, ct] = String(text).split('.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await sealKey(env), unb64(ct));
    return JSON.parse(dec.decode(plain));
  } catch { return null; }
}

// ── the sign-in round trip ──
async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.GOOGLE_CLIENT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function makeState(env, email) {
  const body = b64url(JSON.stringify({ e: email, x: Date.now() + STATE_MS }));
  return body + '.' + await hmac(env, body);
}
async function readState(env, state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig || sig !== await hmac(env, body)) return null;
  try { const s = JSON.parse(unb64url(body)); return s.x > Date.now() ? s.e : null; } catch { return null; }
}

/** The Google page to send the person to. */
export async function googleStartUrl(env, email) {
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', login_hint: email, state: await makeState(env, email),
  });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

const page = (title, text, ok) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font-family:system-ui,sans-serif;background:#121212;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center">` +
  `<div style="max-width:380px"><div style="font-size:48px">${ok ? '✅' : '⚠️'}</div><h2>${title}</h2><p style="color:#bbb;line-height:1.5">${text}</p>` +
  `<a href="https://oeper.dev/ai" style="color:#9ecbff">Back to epic AI</a></div>`,
  { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Google sends the person back here with a code. */
export async function googleCallback(env, ledger, url) {
  if (!googleConfigured(env)) return page('Not set up', 'Google is not set up for epic AI yet.', false);
  if (url.searchParams.get('error')) return page('Google was not connected', 'You cancelled, or Google refused. You can try again from epic AI settings.', false);
  const email = await readState(env, url.searchParams.get('state'));
  if (!email) return page('That link expired', 'Start again from epic AI settings (connect Google).', false);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) return page('Google was not connected', 'Google would not give access (' + (t.error_description || t.error || r.status) + ').', false);
  const old = await ledger.googleGet(email).then(x => x && unseal(env, x));
  const refresh = t.refresh_token || (old && old.refresh);
  if (!refresh) return page('Google was not connected', 'Google did not allow lasting access. Remove epic AI at myaccount.google.com/permissions and connect again.', false);
  let googleEmail = '';
  try { googleEmail = JSON.parse(unb64url(String(t.id_token || '').split('.')[1] || '')).email || ''; } catch { /* just a label */ }
  const scope = String(t.scope || '');
  if (!scope.includes('/auth/documents') || !scope.includes('/auth/spreadsheets')) return page('Some access was left out', 'Please allow both Docs and Sheets when Google asks, then connect again.', false);
  await ledger.googleSet(email, await seal(env, { refresh, access: t.access_token, exp: Date.now() + (t.expires_in || 3600) * 1000, googleEmail }));
  return page('Google connected', (googleEmail ? googleEmail + ' is now connected. ' : '') + 'epic AI can read and write your Google Docs and Sheets when you ask. You can close this tab.', true);
}

export async function googleStatus(env, ledger, email) {
  if (!googleConfigured(env)) return { configured: false, connected: false };
  const rec = await ledger.googleGet(email).then(x => x && unseal(env, x));
  return { configured: true, connected: !!rec, googleEmail: rec ? rec.googleEmail || '' : '' };
}

export async function googleDisconnect(env, ledger, email) {
  const rec = await ledger.googleGet(email).then(x => x && unseal(env, x));
  if (rec) { try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: rec.refresh }) }); } catch { /* removing our copy is what matters */ } }
  await ledger.googleDel(email);
  return { ok: true };
}

async function accessToken(env, ledger, email) {
  const rec = await ledger.googleGet(email).then(x => x && unseal(env, x));
  if (!rec) throw new Error('Google is not connected. Tell the user to connect it in epic AI settings.');
  if (rec.access && rec.exp > Date.now() + 60_000) return rec.access;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rec.refresh, grant_type: 'refresh_token' }),
  });
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) {
    if (t.error === 'invalid_grant') { await ledger.googleDel(email); throw new Error('Google access was removed. Tell the user to connect Google again in epic AI settings.'); }
    throw new Error('Google would not refresh access (' + (t.error || r.status) + ').');
  }
  rec.access = t.access_token; rec.exp = Date.now() + (t.expires_in || 3600) * 1000;
  await ledger.googleSet(email, await seal(env, rec));
  return rec.access;
}

async function g(env, ledger, email, url, method = 'GET', body) {
  const token = await accessToken(env, ledger, email);
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (data.error && data.error.message) || '';
    if (/has not been used|is disabled/i.test(m)) throw new Error('The Google Docs / Sheets API is not switched on for epic AI\'s Google project yet. Tell the user the owner has to enable it.');
    if (r.status === 404) throw new Error('That file was not found, or the connected Google account cannot open it.');
    if (r.status === 403) throw new Error('The connected Google account is not allowed to do that to this file (' + m + ').');
    throw new Error('Google said: ' + (m || r.status));
  }
  return data;
}

const idOf = s => { const t = String(s || '').trim(); const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(t); return m ? m[1] : /^[A-Za-z0-9_-]{20,}$/.test(t) ? t : null; };

// ── Markdown -> Docs batchUpdate requests ──
function parseInline(s) {
  let plain = '', spans = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    plain += s.slice(last, m.index);
    const start = plain.length, text = m[1] || m[2] || m[3] || m[4];
    plain += text;
    spans.push({ start, end: plain.length, bold: !!m[1], code: !!m[2], italic: !!m[3], link: m[5] || null });
    last = m.index + m[0].length;
  }
  return { plain: plain + s.slice(last), spans };
}
export function markdownToDocs(md, base) {
  let text = '';
  const paras = [], styles = [], bullets = [];
  let inCode = false, prev = null;
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line.trim())) { inCode = !inCode; continue; }
    const at = base + text.length;
    let body = line, heading = 0, kind = null, mono = inCode, m;
    if (!inCode) {
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { heading = m[1].length; body = m[2]; }
      else if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { kind = 'BULLET_DISC_CIRCLE_SQUARE'; body = m[1]; }
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { kind = 'NUMBERED_DECIMAL_ALPHA_ROMAN'; body = m[1]; }
      else if (/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')) continue;
      else if (/^\s*\|.*\|\s*$/.test(line)) body = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()).join('\t');
      else if (/^(-{3,}|\*{3,})$/.test(line.trim())) continue;
      else if (!line.trim() && prev === '') continue;
    }
    prev = line.trim() ? line : '';
    const { plain, spans } = mono ? { plain: body, spans: [] } : parseInline(body);
    text += plain + '\n';
    const end = base + text.length;
    if (heading) paras.push({ updateParagraphStyle: { range: { startIndex: at, endIndex: end }, paragraphStyle: { namedStyleType: 'HEADING_' + Math.min(heading, 6) }, fields: 'namedStyleType' } });
    if (mono && plain) styles.push({ updateTextStyle: { range: { startIndex: at, endIndex: end - 1 }, textStyle: { weightedFontFamily: { fontFamily: 'Roboto Mono' } }, fields: 'weightedFontFamily' } });
    for (const sp of spans) {
      const ts = {}, fields = [];
      if (sp.bold) { ts.bold = true; fields.push('bold'); }
      if (sp.italic) { ts.italic = true; fields.push('italic'); }
      if (sp.code) { ts.weightedFontFamily = { fontFamily: 'Roboto Mono' }; fields.push('weightedFontFamily'); }
      if (sp.link) { ts.link = { url: sp.link }; fields.push('link'); }
      styles.push({ updateTextStyle: { range: { startIndex: at + sp.start, endIndex: at + sp.end }, textStyle: ts, fields: fields.join(',') } });
    }
    if (kind) {
      const last = bullets[bullets.length - 1];
      if (last && last.kind === kind && last.end === at) last.end = end; else bullets.push({ kind, start: at, end });
    }
  }
  const requests = [{ insertText: { location: { index: base }, text } }];
  if (text.length) {
    requests.push({ updateParagraphStyle: { range: { startIndex: base, endIndex: base + text.length }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } });
    requests.push({ updateTextStyle: { range: { startIndex: base, endIndex: base + text.length }, textStyle: { bold: false, italic: false }, fields: 'bold,italic' } });
  }
  requests.push(...paras, ...styles);
  for (const b of bullets) requests.push({ createParagraphBullets: { range: { startIndex: b.start, endIndex: b.end }, bulletPreset: b.kind } });
  return { text, requests };
}

function docToText(content) {
  let out = '';
  for (const e of content || []) {
    if (e.paragraph) for (const pe of e.paragraph.elements || []) { if (pe.textRun) out += pe.textRun.content; }
    else if (e.table) for (const row of e.table.tableRows || []) out += (row.tableCells || []).map(c => docToText(c.content).trim().replace(/\n+/g, ' ')).join('\t') + '\n';
  }
  return out;
}

const docUrl = id => 'https://docs.google.com/document/d/' + id + '/edit';
const sheetUrl = id => 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
const sheetNote = (title, url, what) => `${what} "${title}". In your reply give the user the link as a button on its own line: [[Open ${title}]](${url})`;
const grid = v => (Array.isArray(v) ? v : []).slice(0, 500).map(r => (Array.isArray(r) ? r : [r]).slice(0, 50).map(c => (c == null ? '' : typeof c === 'number' || typeof c === 'boolean' ? c : String(c).slice(0, 2000))));

export const GOOGLE_TOOLS = [
  {
    name: 'google_doc_create',
    description: "Create a new Google Doc in the user's connected Google account. Only call it when they clearly ask for a Google Doc (not a oneWord document). content is the whole document in markdown (headings #, lists, **bold**, *italic*, links).",
    parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string', description: 'Full body in markdown' } }, required: ['title', 'content'] },
  },
  {
    name: 'google_doc_read',
    description: "Read a Google Doc the user points to. They give a link (or the file id); you cannot search their Drive. Returns its title and text.",
    parameters: { type: 'object', properties: { document: { type: 'string', description: 'Google Docs link or id' } }, required: ['document'] },
  },
  {
    name: 'google_doc_append',
    description: "Add text to the end of a Google Doc the user points to (a link or id). content is markdown. Never overwrites existing text.",
    parameters: { type: 'object', properties: { document: { type: 'string' }, content: { type: 'string' } }, required: ['document', 'content'] },
  },
  {
    name: 'google_sheet_read',
    description: "Read cells from a Google Sheet the user points to (a link or id). Leave range out to read the top-left of the first tab; otherwise A1 notation such as 'Budget!A1:D20'.",
    parameters: { type: 'object', properties: { spreadsheet: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheet'] },
  },
  {
    name: 'google_sheet_write',
    description: "Write cells into a Google Sheet the user points to (a link or id). values is a list of rows, each a list of cells; text starting with = is a formula. With append true the rows are added after the last row of the range's table (range can be just the tab name); otherwise they overwrite the range starting at its first cell.",
    parameters: { type: 'object', properties: { spreadsheet: { type: 'string' }, range: { type: 'string', description: "A1 notation, e.g. 'Sheet1!A1'" }, values: { type: 'array', items: { type: 'array', items: {} } }, append: { type: 'boolean' } }, required: ['spreadsheet', 'range', 'values'] },
  },
  {
    name: 'google_sheet_create',
    description: "Create a new Google Sheet in the user's connected account, optionally filled with values (a list of rows; put a header row first). Only when they ask for a Google Sheet.",
    parameters: { type: 'object', properties: { title: { type: 'string' }, values: { type: 'array', items: { type: 'array', items: {} } } }, required: ['title'] },
  },
];

export const googleToolStatus = name => ({
  google_doc_create: 'Creating a Google Doc', google_doc_read: 'Reading a Google Doc', google_doc_append: 'Adding to a Google Doc',
  google_sheet_read: 'Reading a Google Sheet', google_sheet_write: 'Writing to a Google Sheet', google_sheet_create: 'Creating a Google Sheet',
}[name] || null);

/** Runs one Google tool for the signed-in person; always returns a JSON string for the model. */
export async function runGoogleTool(name, args, env, ledger, who) {
  try {
    if (!who || !who.email) throw new Error('The user is not signed in to epic AI.');
    if (!googleConfigured(env)) throw new Error('Google is not set up for epic AI.');
    const e = who.email, call = (url, method, body) => g(env, ledger, e, url, method, body);
    if (name === 'google_doc_create') {
      const title = String(args.title || 'Untitled').slice(0, 120);
      const doc = await call('https://docs.googleapis.com/v1/documents', 'POST', { title });
      const { requests } = markdownToDocs(String(args.content || '').slice(0, 60000), 1);
      await call(`https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`, 'POST', { requests });
      return JSON.stringify({ ok: true, url: docUrl(doc.documentId), note: sheetNote(title, docUrl(doc.documentId), 'Created the Google Doc') });
    }
    if (name === 'google_doc_read' || name === 'google_doc_append') {
      const id = idOf(args.document); if (!id) throw new Error('That is not a Google Docs link. Ask the user to paste the document link.');
      const doc = await call(`https://docs.googleapis.com/v1/documents/${id}`);
      if (name === 'google_doc_read') {
        const text = docToText(doc.body && doc.body.content);
        return JSON.stringify({ ok: true, title: doc.title, text: text.slice(0, MAX_READ_CHARS), truncated: text.length > MAX_READ_CHARS, url: docUrl(id) });
      }
      const content = doc.body && doc.body.content, endIndex = content && content.length ? content[content.length - 1].endIndex : 2;
      const { requests } = markdownToDocs('\n' + String(args.content || '').slice(0, 60000).replace(/\n+$/, ''), endIndex - 1);
      await call(`https://docs.googleapis.com/v1/documents/${id}:batchUpdate`, 'POST', { requests });
      return JSON.stringify({ ok: true, url: docUrl(id), note: sheetNote(doc.title, docUrl(id), 'Added the text to the end of the Google Doc') });
    }
    if (name === 'google_sheet_create') {
      const title = String(args.title || 'Untitled').slice(0, 120);
      const sh = await call('https://sheets.googleapis.com/v4/spreadsheets', 'POST', { properties: { title } });
      const values = grid(args.values);
      if (values.length) await call(`https://sheets.googleapis.com/v4/spreadsheets/${sh.spreadsheetId}/values/${encodeURIComponent('A1')}?valueInputOption=USER_ENTERED`, 'PUT', { values });
      return JSON.stringify({ ok: true, url: sheetUrl(sh.spreadsheetId), note: sheetNote(title, sheetUrl(sh.spreadsheetId), 'Created the Google Sheet') });
    }
    const id = idOf(args.spreadsheet); if (!id) throw new Error('That is not a Google Sheets link. Ask the user to paste the spreadsheet link.');
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${id}`;
    if (name === 'google_sheet_read') {
      let range = String(args.range || '').trim();
      const meta = await call(base + '?fields=properties.title,sheets.properties.title');
      if (!range) range = ((meta.sheets && meta.sheets[0] && meta.sheets[0].properties.title) || 'Sheet1').replace(/'/g, "''");
      if (!/[!:]/.test(range) && !/^'/.test(range)) range = `'${range.replace(/'/g, "''")}'`;
      const data = await call(`${base}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
      let rows = (data.values || []).slice(0, 200), out = JSON.stringify(rows);
      while (out.length > MAX_READ_CHARS && rows.length > 1) { rows = rows.slice(0, Math.ceil(rows.length * 0.7)); out = JSON.stringify(rows); }
      return JSON.stringify({ ok: true, title: meta.properties && meta.properties.title, range: data.range, rows, cut: (data.values || []).length > rows.length, url: sheetUrl(id) });
    }
    if (name === 'google_sheet_write') {
      const range = String(args.range || '').trim(); if (!range) throw new Error('range is required');
      const values = grid(args.values); if (!values.length) throw new Error('values is empty');
      const r = args.append === true
        ? await call(`${base}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, 'POST', { values })
        : await call(`${base}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, 'PUT', { values });
      const done = r.updates ? r.updates.updatedRange : r.updatedRange;
      return JSON.stringify({ ok: true, updatedRange: done, url: sheetUrl(id), note: sheetNote('the sheet', sheetUrl(id), `Wrote ${values.length} row(s) to ${done} in`) });
    }
    throw new Error('unknown Google tool');
  } catch (err) {
    return JSON.stringify({ ok: false, error: err.message || 'Google failed', note: 'Tell the user what went wrong, briefly and kindly.' });
  }
}
