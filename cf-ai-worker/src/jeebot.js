// jeebot hub: the meeting point between the jeebot WhatsApp bot (a Node program, see jeebot-wa) and the epic AI app's jb screen. OWNERS ONLY.
//
//   bot  -> worker   /api/jb/bot/*   protected by the JB_KEY secret (header X-JB-Key). The bot reports every message that called jb, every reply it sent and
//                                    every DRAFT it proposes, and polls /bot/outbox for replies the owner approved in the app (or typed there).
//   app  -> worker   /api/jb/*       Firebase sign-in, owner emails only: the list of conversations, approve / edit / dismiss a draft, send a message,
//                                    switch jeebot on/off, choose Draft or Auto, pause it, per-chat modes.
//
// Only messages that STARTED with the wake word ever reach this (the bot drops everything else on arrival). Rows live in the Ledger Durable Object's SQLite
// (tables below), newest 1500 events / 60 days kept.
import { userFromRequest, isOwner } from './auth.js';

export const JB_TABLES = [
  // kind: in (a message that called jb) | draft (a reply waiting for the owner) | out (a reply or message that was / is being sent)
  // status: for draft: pending | sending | sent | dismissed | failed; for out: sending | sent | failed; for in: ok
  'CREATE TABLE IF NOT EXISTS jb_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, chat TEXT NOT NULL, chat_name TEXT, sender TEXT, kind TEXT NOT NULL, text TEXT, status TEXT, ref INTEGER, msg_id TEXT, media INTEGER DEFAULT 0)',
  'CREATE INDEX IF NOT EXISTS jb_events_chat ON jb_events(chat, id)',
  'CREATE TABLE IF NOT EXISTS jb_config (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
];

const DEFAULT_CFG = { enabled: true, mode: 'draft', chatModes: {}, pausedUntil: 0 };
const MAX_EVENTS = 1500, MAX_AGE = 60 * 86400_000, MAX_TEXT = 2000;
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

function getCfg(sql) {
  const row = sql.exec("SELECT v FROM jb_config WHERE k = 'cfg'").toArray()[0];
  let c = {}; try { c = row ? JSON.parse(row.v) : {}; } catch { c = {}; }
  return { ...DEFAULT_CFG, ...c, chatModes: { ...(c.chatModes || {}) } };
}
function setCfg(sql, patch) {
  const c = getCfg(sql);
  if (typeof patch.enabled === 'boolean') c.enabled = patch.enabled;
  if (patch.mode === 'draft' || patch.mode === 'auto') c.mode = patch.mode;
  if (Number.isFinite(patch.pausedUntil)) c.pausedUntil = Math.max(0, Math.floor(patch.pausedUntil));
  if (patch.chatModes && typeof patch.chatModes === 'object') {
    for (const [k, v] of Object.entries(patch.chatModes)) {
      if (v === '' || v === null) delete c.chatModes[k];
      else if (v === 'off' || v === 'draft' || v === 'auto') c.chatModes[clip(k, 120)] = v;
    }
    const keys = Object.keys(c.chatModes); if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete c.chatModes[k];
  }
  sql.exec("INSERT INTO jb_config (k, v) VALUES ('cfg', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(c));
  return c;
}
const touchBot = sql => sql.exec("INSERT INTO jb_config (k, v) VALUES ('botSeen', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", String(Date.now()));
const botSeen = sql => { const r = sql.exec("SELECT v FROM jb_config WHERE k = 'botSeen'").toArray()[0]; return r ? Number(r.v) : 0; };

function prune(sql) {
  sql.exec('DELETE FROM jb_events WHERE ts < ?', Date.now() - MAX_AGE);
  const n = sql.exec('SELECT count(*) AS n FROM jb_events').toArray()[0].n;
  if (n > MAX_EVENTS) sql.exec('DELETE FROM jb_events WHERE id IN (SELECT id FROM jb_events ORDER BY id ASC LIMIT ?)', n - MAX_EVENTS);
}
function insert(sql, e) {
  const r = sql.exec('INSERT INTO jb_events (ts, chat, chat_name, sender, kind, text, status, ref, msg_id, media) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    e.ts || Date.now(), clip(e.chat, 120), clip(e.chatName, 80), clip(e.sender, 80), e.kind, clip(e.text, MAX_TEXT), e.status || null, Number.isFinite(e.ref) ? e.ref : null, clip(e.msgId, 80), e.media ? 1 : 0).toArray()[0];
  return r.id;
}

/** All the database work, run inside the Ledger Durable Object (see Ledger.jb). */
export function runJb(sql, op, a = {}) {
  switch (op) {
    case 'config': return getCfg(sql);
    case 'setConfig': return setCfg(sql, a);
    case 'botIn': { touchBot(sql); const id = insert(sql, { ts: a.ts, chat: a.chat, chatName: a.chatName, sender: a.sender, kind: 'in', text: a.text, status: 'ok', msgId: a.msgId, media: a.media }); prune(sql); return { id, config: getCfg(sql) }; }
    case 'botDraft': { touchBot(sql); return { id: insert(sql, { chat: a.chat, chatName: a.chatName, kind: 'draft', text: a.text, status: 'pending', ref: a.ref, msgId: a.msgId }) }; }
    case 'botOut': { touchBot(sql); return { id: insert(sql, { chat: a.chat, chatName: a.chatName, kind: 'out', text: a.text, status: a.status === 'failed' ? 'failed' : 'sent', ref: a.ref }) }; }
    case 'outbox': {
      touchBot(sql);
      return sql.exec("SELECT id, chat, chat_name AS chatName, text, ref, msg_id AS msgId FROM jb_events WHERE status = 'sending' AND kind IN ('draft','out') ORDER BY id ASC LIMIT 10").toArray();
    }
    case 'ack': { sql.exec("UPDATE jb_events SET status = ? WHERE id = ? AND status = 'sending'", a.ok ? 'sent' : 'failed', a.id); return { ok: true }; }
    case 'events': {
      const lim = Math.max(1, Math.min(400, Number(a.limit) || 200));
      const rows = sql.exec('SELECT id, ts, chat, chat_name AS chatName, sender, kind, text, status, ref, media FROM jb_events ORDER BY id DESC LIMIT ?', lim).toArray().reverse();
      return { events: rows, config: getCfg(sql), botSeen: botSeen(sql), now: Date.now() };
    }
    case 'draftAction': {
      const row = sql.exec('SELECT id, kind, status FROM jb_events WHERE id = ?', a.id).toArray()[0];
      if (!row || row.kind !== 'draft') return { ok: false, error: 'No such draft.' };
      if (row.status !== 'pending') return { ok: false, error: 'That draft was already handled.' };
      if (a.action === 'dismiss') { sql.exec("UPDATE jb_events SET status = 'dismissed' WHERE id = ?", a.id); return { ok: true }; }
      if (a.action === 'approve') {
        const text = clip(a.text, MAX_TEXT).trim();
        if (text) sql.exec("UPDATE jb_events SET status = 'sending', text = ? WHERE id = ?", text, a.id);
        else sql.exec("UPDATE jb_events SET status = 'sending' WHERE id = ?", a.id);
        return { ok: true };
      }
      return { ok: false, error: 'Unknown action.' };
    }
    case 'send': {
      const text = clip(a.text, MAX_TEXT).trim();
      if (!text || !a.chat) return { ok: false, error: 'Nothing to send.' };
      return { ok: true, id: insert(sql, { chat: a.chat, chatName: a.chatName, kind: 'out', text, status: 'sending' }) };
    }
    case 'clearChat': { sql.exec('DELETE FROM jb_events WHERE chat = ?', a.chat); return { ok: true }; }
    default: return { ok: false, error: 'Unknown op.' };
  }
}

const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
async function body(request) { try { const t = await request.text(); return t ? JSON.parse(t) : {}; } catch { return {}; } }
function sameKey(a, b) { // constant-time-ish compare of two secrets
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !a.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** /api/jb/... ; [L] is the Ledger Durable Object stub. */
export async function handleJeebot(request, env, path, L) {
  const m = request.method;
  try {
    if (path.startsWith('bot/')) {
      if (!env.JB_KEY) return reply({ error: 'jeebot hub is not configured (JB_KEY secret missing)' }, 503);
      if (!sameKey(request.headers.get('X-JB-Key'), env.JB_KEY)) return reply({ error: 'Forbidden' }, 403);
      const p = path.slice(4);
      if (p === 'config' && m === 'GET') return reply(await L.jb('config'));
      if (p === 'in' && m === 'POST') return reply(await L.jb('botIn', await body(request)));
      if (p === 'draft' && m === 'POST') return reply(await L.jb('botDraft', await body(request)));
      if (p === 'out' && m === 'POST') return reply(await L.jb('botOut', await body(request)));
      if (p === 'outbox' && m === 'GET') return reply({ items: await L.jb('outbox') });
      if (p === 'ack' && m === 'POST') return reply(await L.jb('ack', await body(request)));
      return reply({ error: 'Not found' }, 404);
    }
    const user = await userFromRequest(request, env);
    if (!user) return reply({ error: 'Sign in first.' }, 401);
    if (!isOwner(user)) return reply({ error: 'Owners only.' }, 403);
    if (path === 'events' && m === 'GET') return reply(await L.jb('events', { limit: new URL(request.url).searchParams.get('limit') }));
    if (path === 'config' && m === 'PUT') return reply(await L.jb('setConfig', await body(request)));
    if (path === 'send' && m === 'POST') { const r = await L.jb('send', await body(request)); return reply(r, r.ok ? 200 : 400); }
    if (path === 'chat/clear' && m === 'POST') return reply(await L.jb('clearChat', await body(request)));
    const d = /^draft\/(\d+)$/.exec(path);
    if (d && m === 'POST') { const b = await body(request); const r = await L.jb('draftAction', { id: Number(d[1]), action: b.action, text: b.text }); return reply(r, r.ok ? 200 : 400); }
  } catch (err) {
    return reply({ error: 'jeebot hub error: ' + (err && err.message || err) }, 500);
  }
  return reply({ error: 'Not found' }, 404);
}
