// The ledger: promo codes, product keys, who has oeper+, and how many epic AI messages each person has used today.
// One Durable Object (a single instance, "main") holds all of it, so counting and "this key was already used" are exact, never racy.
//
// Two kinds of code, kept apart on purpose:
//   product key  OPD-XXXX-XXXX-XXXX   a random key with a product prefix, made in bulk, normally one use. Unlocks a product (oeper+).
//   promo code   WELCOME50            a word the owner picks, can be used many times (cap, expiry, once per person). Gives a bonus.
// Where a code may be redeemed (scope): "epicai" works on oeper.dev/redeem AND inside the epic AI app, "site" only on oeper.dev.
// What a code gives (grant): plusDays (-1 = for life) of oeper+ and/or bonusTokens (extra tokens, used after the daily allowance runs out)
//
// oeper+ is what people see as the name of the paid plan (in this file it is still called 'plus'): more tokens, more pictures a day, a bigger share of the pool.
// It is given by a code or product key for now (there is no payment processor yet); index.js publishes who has it as users/{email}.plusUntil for the + badge.
//
// Limits are in TOKENS (what the model reads + writes, reasoning included), because that is what Cloudflare bills. Cloudflare's free plan allows 10,000
// "neurons" a day for the whole account; on the Gemma 4 model that is 9,091 neurons per million input tokens and 27,273 per million output tokens, so
// the ledger also keeps a shared daily neuron pool for epic AI, and stops everyone when it is empty, so epic AI can never eat the rest of the allowance.

import { DurableObject } from 'cloudflare:workers';

const DAY_MS = 86400_000;
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L, they get misread
const MAX_FAILS_PER_DAY = 8; // wrong codes per signed-in person per day
const MAX_FAILS_PER_IP = 40; // per network address (many people can share one)

export const DEFAULT_CONFIG = {
  // Tokens per person per day, input + output (guests are counted by network address). A typical epic AI turn is about 3,000 to 4,000 tokens,
  // because the whole chat is read again on every message, so 25,000 is roughly 7 turns.
  limits: { guest: { tokens: 10000, messages: 5 }, free: { tokens: 50000 }, plus: { tokens: 240000 } },
  // Everyone together: how many neurons epic AI may spend per day (Cloudflare's free plan is 10,000 for the whole account, shared with the
  // One suite, study tools and moderation). The last reservePct of the pool is kept for Plus people.
  pool: { neurons: 7000, reservePct: 20 },
  // Pictures. Standard pictures come from FLUX.2 klein 4B on Workers AI, which costs neurons (about 104 for a 1024x1024 one), so they have their own small
  // daily neuron budget (also counted in the shared pool above; the last reservePct of it is kept for oeper+). "Best" pictures come from Google's
  // Nano Banana 2.1 through Cloudflare's billing: they cost real money instead of neurons, so only oeper+ gets them, a few a day, and everyone together
  // is capped (premiumGlobal; 0 turns them off). free / plus = pictures per person per day (the best ones are part of those, not extra).
  images: { free: 4, plus: 15, plusPremium: 3, budget: 2000, premiumGlobal: 20 },
  // What oeper+ costs, in Malaysian ringgit, for plus.html to show (nothing can be bought yet: it is given out with codes and keys).
  shop: { month: { days: 30, priceMYR: 20.99 }, year: { days: 365, priceMYR: 189 } },
  // What the model costs, in neurons per million tokens (Cloudflare's price list for @cf/google/gemma-4-26b-a4b-it).
  rates: { inPerM: 9091, outPerM: 27273 },
  // Product keys: each product has a prefix. A promo code can never look like "<prefix>-xxxx-xxxx-xxxx".
  // (oeper.dev product codes all start with OPD-. Keys made earlier with the old EAI- prefix still redeem: redeeming looks the code up, it never checks the prefix.)
  products: { opd: { name: 'oeper.dev product code', prefix: 'OPD' } },
};

const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const nextMidnight = (t = Date.now()) => Math.floor(t / DAY_MS) * DAY_MS + DAY_MS;
export const normalizeCode = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

function cleanGrant(g) {
  g = g || {};
  const plusDays = g.plusDays === -1 ? -1 : clampInt(g.plusDays, 0, 3650);
  const bonusTokens = clampInt(g.bonusTokens, 0, 1_000_000_000);
  // boost: this many percent more daily tokens for boostDays days ("10% more usage for a month")
  const boostPercent = clampInt(g.boostPercent, 0, 1000);
  const boostDays = boostPercent > 0 ? clampInt(g.boostDays || 30, 1, 3650) : 0;
  return { plusDays, bonusTokens, boostPercent, boostDays };
}
const grantEmpty = g => g.plusDays === 0 && g.bonusTokens === 0 && !g.boostPercent;
export function describeGrant(g) {
  const parts = [];
  if (g.plusDays === -1) parts.push('oeper+ for life');
  else if (g.plusDays > 0) parts.push(`${g.plusDays} day${g.plusDays === 1 ? '' : 's'} of oeper+`);
  if (g.bonusTokens > 0) parts.push(`${g.bonusTokens.toLocaleString('en-US')} extra tokens`);
  if (g.boostPercent > 0) parts.push(`${g.boostPercent}% more usage for ${g.boostDays % 30 === 0 ? (g.boostDays / 30) + ' month' + (g.boostDays === 30 ? '' : 's') : g.boostDays + ' days'}`);
  return parts.join(' + ') || 'nothing';
}

function randomKey(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = [...bytes].map(b => KEY_ALPHABET[b % KEY_ALPHABET.length]);
  return `${prefix}-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}
const looksLikeKey = (code, config) => Object.values(config.products).some(p => code.startsWith(p.prefix + '-') && /^[A-Z0-9]{2,6}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code));

// Promo codes that stay available for a limited time without anyone creating them in promo-admin: made on first use.
const SEED_PROMOS = {
  EAIRELEASE: { grant: { boostPercent: 10, boostDays: 30 }, expiresAt: Date.UTC(2026, 9, 31, 23, 59, 59, 999), note: 'epic AI release: 10% more usage for a month, until the end of October 2026' },
};
/** A person's daily token limit: the plan's, plus any active boost from a code. */
function limitFor(cfg, plan, user, now) {
  const base = (cfg.limits[plan] && cfg.limits[plan].tokens) || 0;
  return user && user.boostUntil > now && user.boostPct > 0 ? Math.round(base * (1 + user.boostPct / 100)) : base;
}
function planOf(user, now = Date.now()) {
  return user && (user.plusUntil === -1 || user.plusUntil > now) ? 'plus' : 'free';
}
function userView(user, now = Date.now()) {
  const u = user || { plusUntil: 0, bonus: 0 };
  return { plan: planOf(u, now), plusUntil: u.plusUntil === -1 ? -1 : (u.plusUntil > now ? u.plusUntil : 0), bonus: u.bonus || 0, marker: u.marker || 0 };
}

export class Ledger extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // shared conversations (public read-only links). SQL rather than key/value because a conversation with pictures is bigger than a key/value entry may be
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT, body TEXT NOT NULL, created INTEGER, updated INTEGER, views INTEGER DEFAULT 0)');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS shares_owner ON shares(owner)');
    // Epicenter (the app store): one row per app id. data = the approved entry (what everyone sees), pending = a submitted change waiting for an owner
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS epicenter (id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT, pending TEXT, status TEXT NOT NULL, note TEXT, created INTEGER, updated INTEGER)');
    // each person's sealed Google connection (see google.js); the worker encrypts it, this only stores the text
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS google (email TEXT PRIMARY KEY, data TEXT NOT NULL)');
  }
  /** [auto]: a site owner's own submission goes live straight away. */
  epicSubmit(email, app, auto, ownerAny) {
    const sql = this.ctx.storage.sql, now = Date.now();
    const row = sql.exec('SELECT owner, data FROM epicenter WHERE id = ?', app.id).toArray()[0];
    if (row && row.owner !== email && !ownerAny) return { ok: false, error: 'That app id already belongs to someone else.' };
    if (!ownerAny) {
      const mine = sql.exec('SELECT count(*) AS n FROM epicenter WHERE owner = ?', email).toArray()[0].n;
      if (!row && mine >= 30) return { ok: false, error: 'You already have 30 apps in Epicenter.' };
      const recent = sql.exec('SELECT count(*) AS n FROM epicenter WHERE owner = ? AND updated > ?', email, now - 86400_000).toArray()[0].n;
      if (recent >= 8) return { ok: false, error: 'Too many submissions today. Try again tomorrow.' };
    }
    const json = JSON.stringify(app);
    if (!row) sql.exec('INSERT INTO epicenter (id, owner, data, pending, status, note, created, updated) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)', app.id, email, auto ? json : null, auto ? null : json, auto ? 'approved' : 'pending', now, now);
    else sql.exec('UPDATE epicenter SET data = ?, pending = ?, status = ?, note = NULL, updated = ? WHERE id = ?', auto ? json : row.data, auto ? null : json, auto ? 'approved' : 'pending', now, app.id);
    return { ok: true, status: auto ? 'approved' : 'pending' };
  }
  epicCatalog() {
    return this.ctx.storage.sql.exec('SELECT id, data, updated FROM epicenter WHERE data IS NOT NULL ORDER BY updated DESC').toArray()
      .map(r => { try { return { ...JSON.parse(r.data), updated: r.updated }; } catch { return null; } }).filter(Boolean);
  }
  epicMine(email) {
    return this.ctx.storage.sql.exec('SELECT id, data, pending, status, note, updated FROM epicenter WHERE owner = ? ORDER BY updated DESC', email).toArray()
      .map(r => ({ id: r.id, status: r.status, note: r.note, updated: r.updated, live: !!r.data, app: JSON.parse(r.pending || r.data) }));
  }
  epicPending() {
    return this.ctx.storage.sql.exec("SELECT id, owner, data, pending, updated FROM epicenter WHERE pending IS NOT NULL ORDER BY updated ASC").toArray()
      .map(r => ({ id: r.id, owner: r.owner, updated: r.updated, isUpdate: !!r.data, app: JSON.parse(r.pending) }));
  }
  epicReview(id, action, note) {
    const sql = this.ctx.storage.sql, row = sql.exec('SELECT data, pending FROM epicenter WHERE id = ?', id).toArray()[0];
    if (!row) return false;
    if (action === 'approve' && row.pending) sql.exec("UPDATE epicenter SET data = pending, pending = NULL, status = 'approved', note = NULL, updated = ? WHERE id = ?", Date.now(), id);
    else if (action === 'reject') sql.exec('UPDATE epicenter SET pending = NULL, status = ?, note = ?, updated = ? WHERE id = ?', row.data ? 'approved' : 'rejected', String(note || '').slice(0, 300), Date.now(), id);
    else return false;
    return true;
  }
  epicRemove(email, id, any) {
    const sql = this.ctx.storage.sql, row = sql.exec('SELECT owner FROM epicenter WHERE id = ?', id).toArray()[0];
    if (!row || (row.owner !== email && !any)) return false;
    sql.exec('DELETE FROM epicenter WHERE id = ?', id);
    return true;
  }
  /** Approved apps that have a file with an update manifest (so the worker can follow new releases by itself). [email]: only that person's. */
  epicTrackable(email) {
    const q = email ? this.ctx.storage.sql.exec('SELECT id, data FROM epicenter WHERE data IS NOT NULL AND owner = ?', email) : this.ctx.storage.sql.exec('SELECT id, data FROM epicenter WHERE data IS NOT NULL');
    const out = [];
    for (const r of q.toArray()) {
      try { const a = JSON.parse(r.data); const m = a.assets.map((x, i) => (x.manifest ? { i, url: x.manifest } : null)).filter(Boolean); if (m.length) out.push({ id: r.id, manifests: m }); } catch { /* skip a broken row */ }
    }
    return out;
  }
  /** Applies freshly fetched manifests to the stored entry (see applyManifests); the entry's "updated" time moves only when something really changed. */
  epicApplyManifests(id, results, apply) {
    const sql = this.ctx.storage.sql, row = sql.exec('SELECT data FROM epicenter WHERE id = ?', id).toArray()[0];
    if (!row || !row.data) return false;
    const { app, changed } = apply(JSON.parse(row.data), results);
    if (changed) sql.exec('UPDATE epicenter SET data = ?, updated = ? WHERE id = ?', JSON.stringify(app), Date.now(), id);
    return changed;
  }
  googleGet(email) { const r = this.ctx.storage.sql.exec('SELECT data FROM google WHERE email = ?', email).toArray()[0]; return r ? r.data : null; }
  googleSet(email, data) { this.ctx.storage.sql.exec('INSERT INTO google (email, data) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET data = excluded.data', email, data); return true; }
  googleDel(email) { this.ctx.storage.sql.exec('DELETE FROM google WHERE email = ?', email); return true; }

  // ── shared conversations ──
  /** Saves a snapshot. With an id the person already owns it is updated in place (same link); otherwise a new link is made. At most 100 links per person. */
  shareSave(email, id, title, body) {
    const sql = this.ctx.storage.sql, now = Date.now();
    if (id) {
      const row = sql.exec('SELECT owner FROM shares WHERE id = ?', id).toArray()[0];
      if (row && row.owner === email) { sql.exec('UPDATE shares SET title = ?, body = ?, updated = ? WHERE id = ?', title, body, now, id); return { ok: true, id, updated: true }; }
    }
    const n = sql.exec('SELECT COUNT(*) AS n FROM shares WHERE owner = ?', email).toArray()[0].n;
    if (n >= 100) return { ok: false, reason: 'limit' };
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const nid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    sql.exec('INSERT INTO shares (id, owner, title, body, created, updated, views) VALUES (?, ?, ?, ?, ?, ?, 0)', nid, email, title, body, now, now);
    return { ok: true, id: nid };
  }
  shareGet(id) {
    const sql = this.ctx.storage.sql;
    const row = sql.exec('SELECT id, title, body, created, updated FROM shares WHERE id = ?', id).toArray()[0];
    if (!row) return null;
    sql.exec('UPDATE shares SET views = views + 1 WHERE id = ?', id);
    return row;
  }
  shareDelete(email, id, any) {
    const sql = this.ctx.storage.sql;
    const row = sql.exec('SELECT owner FROM shares WHERE id = ?', id).toArray()[0];
    if (!row || (row.owner !== email && !any)) return false;
    sql.exec('DELETE FROM shares WHERE id = ?', id);
    return true;
  }
  shareList(email) { return this.ctx.storage.sql.exec('SELECT id, title, created, updated, views FROM shares WHERE owner = ? ORDER BY updated DESC', email).toArray(); }

  async #config() {
    const c = (await this.ctx.storage.get('config')) || {};
    return {
      limits: { ...DEFAULT_CONFIG.limits, ...(c.limits || {}) },
      pool: { ...DEFAULT_CONFIG.pool, ...(c.pool || {}) },
      rates: { ...DEFAULT_CONFIG.rates, ...(c.rates || {}) },
      images: { ...DEFAULT_CONFIG.images, ...(c.images || {}) },
      shop: { ...DEFAULT_CONFIG.shop, ...(c.shop || {}) },
      products: Object.keys(c.products || {}).length ? c.products : DEFAULT_CONFIG.products,
    };
  }
  async #user(email) { return (await this.ctx.storage.get('user:' + email)) || { plusUntil: 0, bonus: 0, history: [] }; }

  async #applyGrant(email, grant, label, source) {
    const now = Date.now();
    const user = await this.#user(email);
    if (grant.plusDays === -1) user.plusUntil = -1;
    else if (grant.plusDays > 0 && user.plusUntil !== -1) user.plusUntil = Math.max(now, user.plusUntil || 0) + grant.plusDays * DAY_MS;
    user.bonus = (user.bonus || 0) + grant.bonusTokens;
    if (grant.boostPercent > 0) {
      const live = user.boostUntil > now;
      user.boostPct = live ? Math.max(user.boostPct || 0, grant.boostPercent) : grant.boostPercent;
      user.boostUntil = (live ? user.boostUntil : now) + grant.boostDays * DAY_MS;
    }
    user.history = [{ code: label, at: now, grant, source }, ...(user.history || [])].slice(0, 30);
    await this.ctx.storage.put('user:' + email, user);
    return user;
  }

  // ── epic AI usage ──

  async #rollDay(day) {
    const prev = await this.ctx.storage.get('meta:day');
    if (prev === day) return;
    const old = await this.ctx.storage.list({ prefix: 'use:' });
    const dead = [...old.keys()].filter(k => !k.startsWith('use:' + day + ':'));
    if (dead.length) await this.ctx.storage.delete(dead.slice(0, 120));
    const oldImg = [...(await this.ctx.storage.list({ prefix: 'img:' })).keys()].filter(k => !k.startsWith('img:' + day + ':'));
    if (oldImg.length) await this.ctx.storage.delete(oldImg.slice(0, 120));
    if (prev) await this.ctx.storage.delete(['pool:' + prev, 'imgpool:' + prev, 'imgprem:' + prev]);
    await this.ctx.storage.put('meta:day', day);
  }
  #subject(email, ip) { return email ? 'u:' + email : 'g:' + ip; }

  /** Before a message: may this person use epic AI right now? Nothing is counted yet; record() counts what was really used. */
  async check(email, ip, countMessage = false) {
    const now = Date.now(), day = dayOf(now), cfg = await this.#config();
    await this.#rollDay(day);
    const user = email ? await this.#user(email) : null;
    const plan = email ? planOf(user, now) : 'guest';
    const limit = limitFor(cfg, plan, user, now);
    const used = (await this.ctx.storage.get('use:' + day + ':' + this.#subject(email, ip))) || 0;
    const bonus = user ? user.bonus || 0 : 0;
    const poolUsed = (await this.ctx.storage.get('pool:' + day)) || 0;
    const poolCap = cfg.pool.neurons * (plan === 'plus' ? 1 : (100 - cfg.pool.reservePct) / 100);
    // people who are not signed in also get a small number of messages a day (steps of a phone task are not messages)
    const msgLimit = plan === 'guest' ? (cfg.limits.guest && cfg.limits.guest.messages != null ? cfg.limits.guest.messages : 5) : 0;
    const msgKey = 'msgs:' + day + ':' + this.#subject(email, ip);
    const msgUsed = plan === 'guest' ? ((await this.ctx.storage.get(msgKey)) || 0) : 0;
    let reason = '';
    if (poolUsed >= poolCap) reason = 'pool';
    else if (plan === 'guest' && countMessage && msgLimit > 0 && msgUsed >= msgLimit) reason = 'messages';
    else if (used >= limit && bonus <= 0) reason = 'person';
    if (!reason && plan === 'guest' && countMessage) await this.ctx.storage.put(msgKey, msgUsed + 1);
    if (reason) {
      const stat = (await this.ctx.storage.get('stat:' + day)) || {};
      stat.denied = (stat.denied || 0) + 1;
      await this.ctx.storage.put('stat:' + day, stat);
    }
    return { ok: !reason, reason, plan, used, limit, bonus, messageLimit: msgLimit, resetsAt: nextMidnight(now), plusUntil: user ? userView(user, now).plusUntil : 0 };
  }

  /** After a message: count the tokens it really used against the person's allowance (then their bonus tokens) and the shared pool. */
  async record(email, ip, inTokens, outTokens) {
    const now = Date.now(), day = dayOf(now), cfg = await this.#config();
    inTokens = clampInt(inTokens, 0, 5_000_000); outTokens = clampInt(outTokens, 0, 5_000_000);
    const total = inTokens + outTokens;
    if (!total) return;
    await this.#rollDay(day);
    const user = email ? await this.#user(email) : null;
    const plan = email ? planOf(user, now) : 'guest';
    const limit = limitFor(cfg, plan, user, now);
    const key = 'use:' + day + ':' + this.#subject(email, ip);
    const used = (await this.ctx.storage.get(key)) || 0;
    const fromDaily = Math.min(total, Math.max(0, limit - used));
    await this.ctx.storage.put(key, used + fromDaily);
    if (user && total > fromDaily) { user.bonus = Math.max(0, (user.bonus || 0) - (total - fromDaily)); await this.ctx.storage.put('user:' + email, user); }
    const neurons = inTokens * cfg.rates.inPerM / 1e6 + outTokens * cfg.rates.outPerM / 1e6;
    await this.ctx.storage.put('pool:' + day, ((await this.ctx.storage.get('pool:' + day)) || 0) + neurons);
    const stat = (await this.ctx.storage.get('stat:' + day)) || {};
    const who = email ? 'signedIn' : 'guests';
    stat.requests = (stat.requests || 0) + 1;
    stat[who] = (stat[who] || 0) + 1;
    stat.tokensIn = (stat.tokensIn || 0) + inTokens; stat.tokensOut = (stat.tokensOut || 0) + outTokens; stat.neurons = (stat.neurons || 0) + neurons;
    await this.ctx.storage.put('stat:' + day, stat);
  }

  // ── pictures ──
  // A picture is reserved BEFORE it is made (so two at once can't both slip under the limit) and released again if making it fails.

  /** May this person make a picture now? wantBest asks for the Nano Banana one (oeper+ only). Returns what was reserved, or why not. */
  async imageReserve(email, wantBest, owner, neurons) {
    if (!email) return { ok: false, reason: 'signin' };
    const now = Date.now(), day = dayOf(now), cfg = await this.#config(), im = cfg.images;
    await this.#rollDay(day);
    const user = await this.#user(email);
    const plan = owner ? 'plus' : planOf(user, now);
    const max = plan === 'plus' ? im.plus : im.free;
    const key = 'img:' + day + ':' + email;
    const mine = (await this.ctx.storage.get(key)) || { n: 0, best: 0 };
    const base = { plan, limit: max, used: mine.n, bestLimit: plan === 'plus' ? im.plusPremium : 0, bestUsed: mine.best, resetsAt: nextMidnight(now) };
    if (!owner && mine.n >= max) return { ok: false, reason: 'limit', ...base };
    // best (Nano Banana): oeper+ only, a few per person, and a cap for everyone together; costs money, not neurons
    const premKey = 'imgprem:' + day;
    const premUsed = (await this.ctx.storage.get(premKey)) || 0;
    const best = !!wantBest && plan === 'plus' && im.premiumGlobal > 0 && (owner || mine.best < im.plusPremium) && premUsed < im.premiumGlobal;
    let spent = 0;
    if (best) await this.ctx.storage.put(premKey, premUsed + 1);
    else {
      const used = (await this.ctx.storage.get('imgpool:' + day)) || 0;
      const cap = im.budget * (plan === 'plus' ? 1 : (100 - cfg.pool.reservePct) / 100);
      const poolUsed = (await this.ctx.storage.get('pool:' + day)) || 0;
      // never take the chat's own allowance dry: stop when the whole pool is used
      if (used + neurons > cap || poolUsed + neurons > cfg.pool.neurons) return { ok: false, reason: 'busy', ...base };
      spent = neurons;
      await this.ctx.storage.put({ ['imgpool:' + day]: used + neurons, ['pool:' + day]: poolUsed + neurons });
    }
    mine.n++; if (best) mine.best++;
    await this.ctx.storage.put(key, mine);
    const stat = (await this.ctx.storage.get('stat:' + day)) || {};
    stat.images = (stat.images || 0) + 1; if (best) stat.bestImages = (stat.bestImages || 0) + 1; stat.neurons = (stat.neurons || 0) + spent;
    await this.ctx.storage.put('stat:' + day, stat);
    return { ok: true, best, spent, wantedBest: !!wantBest, ...base, used: mine.n, bestUsed: mine.best };
  }
  /** Gives back what imageReserve took, when the picture could not be made. */
  async imageRelease(email, r) {
    const day = dayOf();
    const key = 'img:' + day + ':' + email;
    const mine = await this.ctx.storage.get(key);
    if (mine) { mine.n = Math.max(0, mine.n - 1); if (r.best) mine.best = Math.max(0, mine.best - 1); await this.ctx.storage.put(key, mine); }
    if (r.best) await this.ctx.storage.put('imgprem:' + day, Math.max(0, ((await this.ctx.storage.get('imgprem:' + day)) || 0) - 1));
    else if (r.spent) await this.ctx.storage.put({
      ['imgpool:' + day]: Math.max(0, ((await this.ctx.storage.get('imgpool:' + day)) || 0) - r.spent),
      ['pool:' + day]: Math.max(0, ((await this.ctx.storage.get('pool:' + day)) || 0) - r.spent),
    });
    const stat = (await this.ctx.storage.get('stat:' + day)) || {};
    stat.images = Math.max(0, (stat.images || 0) - 1); if (r.best) stat.bestImages = Math.max(0, (stat.bestImages || 0) - 1); stat.neurons = Math.max(0, (stat.neurons || 0) - (r.spent || 0));
    await this.ctx.storage.put('stat:' + day, stat);
  }

  async me(email, ip) {
    const now = Date.now(), day = dayOf(now), cfg = await this.#config();
    const user = email ? await this.#user(email) : null;
    const plan = email ? planOf(user, now) : 'guest';
    const used = (await this.ctx.storage.get('use:' + day + ':' + this.#subject(email, ip))) || 0;
    const v = user ? userView(user, now) : { plusUntil: 0, bonus: 0 };
    const poolUsed = (await this.ctx.storage.get('pool:' + day)) || 0;
    const msgLimit = plan === 'guest' ? (cfg.limits.guest && cfg.limits.guest.messages != null ? cfg.limits.guest.messages : 5) : 0;
    const msgUsed = plan === 'guest' ? ((await this.ctx.storage.get('msgs:' + day + ':' + this.#subject(email, ip))) || 0) : 0;
    const im = cfg.images, mine = email ? (await this.ctx.storage.get('img:' + day + ':' + email)) || { n: 0, best: 0 } : { n: 0, best: 0 };
    return {
      images: { used: mine.n, limit: plan === 'plus' ? im.plus : plan === 'guest' ? 0 : im.free, bestUsed: mine.best, bestLimit: plan === 'plus' && im.premiumGlobal > 0 ? im.plusPremium : 0 },
      shop: cfg.shop,
      plans: { free: { tokens: (cfg.limits.free || {}).tokens || 0, images: im.free }, plus: { tokens: (cfg.limits.plus || {}).tokens || 0, images: im.plus, best: im.premiumGlobal > 0 ? im.plusPremium : 0 } },
      messageLimit: msgLimit, messagesUsed: msgUsed,
      plan, used, limit: limitFor(cfg, plan, user, now), bonus: v.bonus,
      boostPercent: user && user.boostUntil > now ? user.boostPct || 0 : 0, boostUntil: user && user.boostUntil > now ? user.boostUntil : 0, plusUntil: v.plusUntil, marker: v.marker || 0, resetsAt: nextMidnight(now), signedIn: !!email,
      poolPct: cfg.pool.neurons ? Math.min(100, Math.round(poolUsed / cfg.pool.neurons * 100)) : 100, history: user ? (user.history || []).slice(0, 10) : [],
    };
  }

  // ── redeeming ──

  async redeem(email, rawCode, source, ip) {
    const now = Date.now(), day = dayOf(now);
    const failKeys = ['fail:' + day + ':u:' + email, 'fail:' + day + ':g:' + ip];
    const fails = await Promise.all(failKeys.map(k => this.ctx.storage.get(k)));
    if ((fails[0] || 0) >= MAX_FAILS_PER_DAY || (fails[1] || 0) >= MAX_FAILS_PER_IP) return { ok: false, reason: 'locked', error: 'Too many wrong codes today. Try again tomorrow.' };
    const bad = async (reason, error) => {
      if (reason === 'invalid') await Promise.all(failKeys.map((k, i) => this.ctx.storage.put(k, (fails[i] || 0) + 1)));
      return { ok: false, reason, error };
    };
    const code = normalizeCode(rawCode);
    if (!code || code.length > 40) return bad('invalid', "That doesn't look like a code.");
    let rec = await this.ctx.storage.get('code:' + code);
    if (!rec && SEED_PROMOS[code]) {
      const seed = SEED_PROMOS[code];
      rec = { code, kind: 'promo', scope: 'epicai', grant: cleanGrant(seed.grant), maxUses: 0, uses: 0, startsAt: 0, expiresAt: seed.expiresAt, disabled: false, note: seed.note, createdAt: now, createdBy: 'system' };
      await this.ctx.storage.put('code:' + code, rec);
    }
    if (!rec) return bad('invalid', "That code isn't valid. Check it and try again.");
    if (rec.disabled) return bad('inactive', 'That code is no longer active.');
    if (rec.startsAt && rec.startsAt > now) return bad('inactive', "That code isn't active yet.");
    if (rec.expiresAt && rec.expiresAt < now) return bad('expired', 'That code has expired.');
    if (source === 'app' && rec.scope === 'site') return bad('wrong_place', "That's an oeper.dev code. Redeem it at oeper.dev/redeem instead of in the app.");
    if (rec.maxUses > 0 && rec.uses >= rec.maxUses) return bad('used_up', rec.kind === 'key' ? 'That key has already been used.' : 'That code has been used up.');
    if (await this.ctx.storage.get('redeem:' + email + ':' + code)) return bad('already', "You've already used that code.");
    const user = await this.#applyGrant(email, rec.grant, rec.kind === 'key' ? rec.code.slice(0, -4) + '••••' : rec.code, source);
    rec.uses++;
    await this.ctx.storage.put({ ['code:' + code]: rec, ['redeem:' + email + ':' + code]: now });
    return { ok: true, kind: rec.kind, grant: rec.grant, summary: describeGrant(rec.grant), ...userView(user, now) };
  }

  /** Remembers which oeper+ time was last published to the person's public profile (users/{email}.plusUntil), so it is only written when it changes. */
  async setMarker(email, value) { const user = await this.#user(email); user.marker = value; await this.ctx.storage.put('user:' + email, user); }

  // ── owner tools ──

  async adminListCodes() {
    const all = await this.ctx.storage.list({ prefix: 'code:' });
    return [...all.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
  async adminGetConfig() { return this.#config(); }
  async adminSetConfig(patch) {
    const cfg = await this.#config();
    if (patch.limits) for (const plan of ['guest', 'free', 'plus']) if (patch.limits[plan]) cfg.limits[plan] = { tokens: clampInt(patch.limits[plan].tokens, 0, 1_000_000_000), ...(plan === 'guest' ? { messages: clampInt(patch.limits[plan].messages, 0, 100_000) } : {}) };
    if (patch.pool) cfg.pool = { neurons: clampInt(patch.pool.neurons, 0, 100_000_000), reservePct: clampInt(patch.pool.reservePct, 0, 100) };
    if (patch.images) {
      const p = patch.images, im = cfg.images;
      cfg.images = {
        free: clampInt(p.free ?? im.free, 0, 1000), plus: clampInt(p.plus ?? im.plus, 0, 1000), plusPremium: clampInt(p.plusPremium ?? im.plusPremium, 0, 1000),
        budget: clampInt(p.budget ?? im.budget, 0, 1_000_000), premiumGlobal: clampInt(p.premiumGlobal ?? im.premiumGlobal, 0, 100_000),
      };
    }
    if (patch.shop) {
      const out = {};
      for (const k of ['month', 'year']) { const o = patch.shop[k] || cfg.shop[k]; out[k] = { days: clampInt(o.days, 1, 3650), priceMYR: Math.max(0, Math.min(100000, Math.round(Number(o.priceMYR) * 100) / 100 || 0)) }; }
      cfg.shop = out;
    }
    if (patch.rates) cfg.rates = { inPerM: clampInt(patch.rates.inPerM, 1, 10_000_000), outPerM: clampInt(patch.rates.outPerM, 1, 10_000_000) };
    if (patch.products) {
      const products = {};
      for (const [id, p] of Object.entries(patch.products)) {
        const prefix = String((p && p.prefix) || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (/^[a-z0-9_-]{2,20}$/.test(id) && prefix.length >= 2) products[id] = { name: String(p.name || id).slice(0, 40), prefix };
      }
      if (Object.keys(products).length) {
        const prefixes = Object.values(products).map(p => p.prefix);
        if (new Set(prefixes).size !== prefixes.length) throw new Error('Two products share a prefix.');
        cfg.products = products;
      }
    }
    await this.ctx.storage.put('config', cfg);
    return cfg;
  }

  async adminCreatePromo(spec, by) {
    const cfg = await this.#config();
    const code = normalizeCode(spec.code);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code)) throw new Error('A promo code is 3 to 32 letters, numbers, - or _.');
    if (looksLikeKey(code, cfg)) throw new Error('That looks like a product key. Promo codes must not use a product prefix.');
    if (await this.ctx.storage.get('code:' + code)) throw new Error('That code already exists.');
    const grant = cleanGrant(spec.grant);
    if (grantEmpty(grant)) throw new Error('Give it something: Plus days, bonus tokens, or a boost.');
    const rec = {
      code, kind: 'promo', scope: spec.scope === 'site' ? 'site' : 'epicai', grant, maxUses: clampInt(spec.maxUses, 0, 10_000_000), uses: 0,
      startsAt: spec.startsAt ? Number(spec.startsAt) : 0, expiresAt: spec.expiresAt ? Number(spec.expiresAt) : 0,
      disabled: false, note: String(spec.note || '').slice(0, 200), createdAt: Date.now(), createdBy: by,
    };
    await this.ctx.storage.put('code:' + code, rec);
    return rec;
  }

  async adminCreateKeys(spec, by) {
    const cfg = await this.#config();
    const product = cfg.products[spec.product];
    if (!product) throw new Error('Unknown product.');
    const count = clampInt(spec.count, 1, 200);
    const grant = cleanGrant(spec.grant);
    if (grantEmpty(grant)) throw new Error('Give the key something: oeper+ days, bonus tokens or a boost.');
    const keys = [], now = Date.now();
    while (keys.length < count) {
      const code = randomKey(product.prefix);
      if (await this.ctx.storage.get('code:' + code)) continue;
      const rec = {
        code, kind: 'key', product: spec.product, scope: spec.scope === 'site' ? 'site' : 'epicai', grant, maxUses: spec.maxUses === 0 ? 0 : clampInt(spec.maxUses || 1, 1, 10_000_000), uses: 0,
        startsAt: 0, expiresAt: spec.expiresAt ? Number(spec.expiresAt) : 0, disabled: false, note: String(spec.note || '').slice(0, 200), createdAt: now, createdBy: by,
      };
      await this.ctx.storage.put('code:' + code, rec);
      keys.push(code);
    }
    return keys;
  }

  async adminUpdateCode(rawCode, patch) {
    const code = normalizeCode(rawCode), rec = await this.ctx.storage.get('code:' + code);
    if (!rec) throw new Error('No such code.');
    if ('disabled' in patch) rec.disabled = !!patch.disabled;
    if ('maxUses' in patch) rec.maxUses = clampInt(patch.maxUses, 0, 10_000_000);
    if ('expiresAt' in patch) rec.expiresAt = patch.expiresAt ? Number(patch.expiresAt) : 0;
    if ('note' in patch) rec.note = String(patch.note || '').slice(0, 200);
    if ('scope' in patch) rec.scope = patch.scope === 'site' ? 'site' : 'epicai';
    if (patch.grant) { const g = cleanGrant(patch.grant); if (!grantEmpty(g)) rec.grant = g; }
    await this.ctx.storage.put('code:' + code, rec);
    return rec;
  }
  async adminDeleteCode(rawCode) { return this.ctx.storage.delete('code:' + normalizeCode(rawCode)); }

  async adminUser(rawEmail) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email) throw new Error('Give an email.');
    const user = await this.#user(email), now = Date.now();
    const used = (await this.ctx.storage.get('use:' + dayOf(now) + ':u:' + email)) || 0;
    return { email, ...userView(user, now), usedToday: used, history: user.history || [] };
  }
  async adminGrantUser(rawEmail, grantIn, by) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email.includes('@')) throw new Error('Give an email.');
    const grant = cleanGrant(grantIn);
    if (grantEmpty(grant)) throw new Error('Give it something: oeper+ days, bonus tokens or a boost.');
    const user = await this.#applyGrant(email, grant, 'by ' + by, 'admin');
    return { email, ...userView(user) };
  }
  async adminRevokePlus(rawEmail) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const user = await this.#user(email);
    user.plusUntil = 0;
    await this.ctx.storage.put('user:' + email, user);
    return { email, ...userView(user) };
  }
  // ── feedback and bug reports (from the epic AI app and the website) ──
  // Kept here so nothing is lost even when no Discord webhook is set; the owners read them on promo-admin.html. Newest 500 are kept.

  /** Stores one report. At most 5 per hour per person (guests: per network address). Returns {ok, id} or {ok:false, reason}. */
  async addFeedback(entry, ip) {
    const now = Date.now();
    const subject = entry.email ? 'u:' + entry.email : 'g:' + ip;
    const rk = 'fbrate:' + subject;
    const r = (await this.ctx.storage.get(rk)) || { at: now, n: 0 };
    if (now - r.at > 3600_000) { r.at = now; r.n = 0; }
    if (r.n >= 5) return { ok: false, reason: 'rate' };
    r.n++;
    await this.ctx.storage.put(rk, r);
    // forget old rate counters so the address/email of someone who wrote once isn't kept
    const stale = [...(await this.ctx.storage.list({ prefix: 'fbrate:' })).entries()].filter(([, v]) => now - v.at > 3600_000).map(([k]) => k);
    if (stale.length) await this.ctx.storage.delete(stale.slice(0, 120));
    const id = 'fb:' + String(now).padStart(14, '0') + '-' + crypto.randomUUID().slice(0, 4);
    await this.ctx.storage.put(id, { id, at: now, status: 'new', ...entry });
    const all = [...(await this.ctx.storage.list({ prefix: 'fb:' })).keys()];
    if (all.length > 500) await this.ctx.storage.delete(all.slice(0, all.length - 500).slice(0, 120));
    return { ok: true, id };
  }
  async adminFeedback() { return [...(await this.ctx.storage.list({ prefix: 'fb:', reverse: true, limit: 200 })).values()]; }
  async adminFeedbackUpdate(id, patch) {
    if (!String(id).startsWith('fb:')) throw new Error('Not a feedback id');
    const f = await this.ctx.storage.get(id);
    if (!f) throw new Error('No such report');
    if (patch && ['new', 'seen', 'done'].includes(patch.status)) f.status = patch.status;
    await this.ctx.storage.put(id, f);
    return f;
  }
  async adminFeedbackDelete(id) { if (String(id).startsWith('fb:')) await this.ctx.storage.delete(id); }

  async adminStats() {
    const day = dayOf();
    const codes = [...(await this.ctx.storage.list({ prefix: 'code:' })).values()];
    return {
      day, today: { requests: 0, signedIn: 0, guests: 0, denied: 0, tokensIn: 0, tokensOut: 0, neurons: 0, images: 0, bestImages: 0, ...((await this.ctx.storage.get('stat:' + day)) || {}) },
      pool: (await this.#config()).pool,
      codes: codes.length, keys: codes.filter(c => c.kind === 'key').length, redemptions: codes.reduce((n, c) => n + c.uses, 0),
    };
  }
}
