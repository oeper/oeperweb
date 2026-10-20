// oeper.dev site search as a public API (GET /api/search, /api/search/suggest, /api/search/stats). Documented at oeper.dev/search-api.
//
// What is searched (one index, rebuilt in memory every few minutes):
//   pages, tools, articles, downloads and the epic AI docs : https://oeper.dev/search-index.json (written by scripts/build-search-index.py)
//   posts, videos, people                                  : Firestore over its public REST API (those collections are world-readable)
//   apps                                                   : Epicenter, the community catalog (Ledger) + oeper.dev's curated epicenter/index.json
// Nothing private is indexed: no e-mail addresses, no chats, no shared conversations.

const SITE = 'https://oeper.dev';
const PROJECT = 'oepernet-1683535959256';
const FIREBASE_KEY = 'AIzaSyAs7SP8FaWUDuz7GVp9rG5uZw4oEIWmBUk';   // public Firebase web key (same as shared/account.js)
const STATIC_TTL = 10 * 60_000;
const DYNAMIC_TTL = 90_000;
const TYPES = ['page', 'doc', 'post', 'video', 'user', 'app', 'article', 'download'];
const TYPE_WEIGHT = { page: 1.35, app: 1.1, doc: 1.05, article: 1.0, user: 1.0, download: 0.95, video: 0.95, post: 0.9 };

// ───────────────────────── text helpers ─────────────────────────
const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = s => { const n = norm(s); return n ? n.split(' ') : []; };
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; };

function lev(a, b, max) {   // bounded edit distance where swapping two neighbouring letters is one mistake; returns max + 1 when larger than max
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

// ───────────────────────── sources ─────────────────────────
let staticCache = { at: 0, docs: [], built: 0 };
async function loadStatic() {
  if (Date.now() - staticCache.at < STATIC_TTL && staticCache.docs.length) return staticCache.docs;
  try {
    const r = await fetch(SITE + '/search-index.json', { cf: { cacheTtl: 300 } });
    if (r.ok) { const j = await r.json(); staticCache = { at: Date.now(), docs: Array.isArray(j.docs) ? j.docs : [], built: j.built || 0 }; }
  } catch { /* keep the old copy */ }
  staticCache.at = staticCache.at || Date.now() - STATIC_TTL + 30_000;
  return staticCache.docs;
}

const fsVal = v => !v ? undefined : v.stringValue !== undefined ? v.stringValue : v.timestampValue !== undefined ? v.timestampValue : v.integerValue !== undefined ? Number(v.integerValue) : v.arrayValue ? (v.arrayValue.values || []).map(fsVal) : v.booleanValue;
async function firestore(collectionId, n) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery?key=${FIREBASE_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: n } }),
  });
  if (!r.ok) throw new Error('firestore ' + r.status);
  const rows = await r.json();
  return rows.filter(x => x.document).map(x => {
    const f = {};
    for (const [k, v] of Object.entries(x.document.fields || {})) f[k] = fsVal(v);
    f._id = x.document.name.split('/').pop();
    return f;
  });
}
let dynCache = { at: 0, docs: [] };
let dynPending = null;
async function loadDynamic(L) {
  if (Date.now() - dynCache.at < DYNAMIC_TTL) return dynCache.docs;
  if (dynPending) return dynPending;
  dynPending = (async () => {
    const out = [];
    const [posts, videos, users, apps, curated] = await Promise.allSettled([
      firestore('posts', 400), firestore('videos', 300), firestore('users', 400),
      L ? L.epicCatalog() : Promise.resolve([]),
      fetch(SITE + '/epicenter/index.json', { cf: { cacheTtl: 300 } }).then(r => r.json()),
    ]);
    if (posts.status === 'fulfilled') for (const p of posts.value) {
      if (!p.title && !p.body) continue;
      out.push({ id: 'post:' + p._id, type: 'post', title: p.title || clip(p.body, 70), url: '/feed?post=' + encodeURIComponent(p._id), desc: '', body: String(p.body || ''), keywords: Array.isArray(p.tags) ? p.tags : [], by: p.authorName || '', at: Date.parse(p.createdAt) || 0, score: Array.isArray(p.upvoters) ? p.upvoters.length : 0, icon: 'forum' });
    }
    if (videos.status === 'fulfilled') for (const v of videos.value) {
      if (!v.title) continue;
      out.push({ id: 'video:' + v._id, type: 'video', title: v.title, url: '/videos?video=' + encodeURIComponent(v._id), desc: String(v.description || ''), by: v.authorName || '', at: Date.parse(v.createdAt) || 0, score: Array.isArray(v.upvoters) ? v.upvoters.length : 0, icon: 'smart_display' });
    }
    if (users.status === 'fulfilled') for (const u of users.value) {
      if (!u.handle) continue;   // never expose the e-mail address (the document id)
      out.push({ id: 'user:' + u.handle, type: 'user', title: u.displayName || u.handle, url: '/profile?u=' + encodeURIComponent(u.handle), desc: '@' + u.handle + (u.bio ? ' · ' + u.bio : ''), keywords: [u.handle], photo: u.photoURL || '', at: Date.parse(u.createdAt) || 0, icon: 'person' });
    }
    const seen = new Set();
    const add = a => {
      if (!a || !a.id || seen.has(a.id)) return; seen.add(a.id);
      out.push({ id: 'app:' + a.id, type: 'app', title: a.name || a.id, url: '/epicenter#app=' + encodeURIComponent(a.id), desc: String(a.summary || ''), body: String(a.description || ''), keywords: [a.category, a.package].filter(Boolean), icon: 'apps' });
    };
    if (curated.status === 'fulfilled') (curated.value.apps || []).forEach(add);
    if (apps.status === 'fulfilled') (apps.value || []).forEach(add);
    if (out.length || !dynCache.docs.length) dynCache = { at: Date.now(), docs: out };
    else dynCache.at = Date.now() - DYNAMIC_TTL + 15_000;   // all sources failed: keep the old copy, try again soon
    dynPending = null;
    return dynCache.docs;
  })();
  return dynPending;
}

// ───────────────────────── the index ─────────────────────────
let prepared = { key: '', items: [], vocab: new Set() };
async function getIndex(L) {
  const [stat, dyn] = await Promise.all([loadStatic(), loadDynamic(L)]);
  const key = staticCache.at + ':' + dynCache.at;
  if (prepared.key === key) return prepared;
  const items = [], vocab = new Set();
  for (const d of [...stat, ...dyn]) {
    if (!d || !d.title || !d.url) continue;
    const it = {
      d,
      t: norm(d.title), tw: words(d.title),
      kw: words((d.keywords || []).join(' ')),
      kn: norm((d.keywords || []).join(' ')),
      de: norm(d.desc), dw: words(d.desc),
      bo: norm(String(d.body || '').slice(0, 6000)),
    };
    it.bw = it.bo ? it.bo.split(' ') : [];
    for (const w of [...it.tw, ...it.kw]) if (w.length >= 3) vocab.add(w);
    for (const w of it.dw) if (w.length >= 4) vocab.add(w);
    items.push(it);
  }
  prepared = { key, items, vocab };
  return prepared;
}

// ───────────────────────── ranking ─────────────────────────
function fieldScore(q, ws, joined, exact, prefix, sub) {
  let best = 0;
  for (const w of ws) {
    if (w === q) { best = exact; break; }
    if (w.startsWith(q)) best = Math.max(best, prefix);
  }
  if (!best && q.length >= 3 && joined.includes(q)) best = sub;
  return best;
}
function fuzzyIn(q, ws) {
  if (q.length < 4) return false;
  const max = q.length >= 8 ? 2 : 1;
  return ws.some(w => w.length >= 3 && lev(q, w, max) <= max);
}
function scoreItem(it, terms, phrase, now) {
  let sum = 0, matched = 0;
  for (const q of terms) {
    let s = fieldScore(q, it.tw, it.t, 10, 7, 4)
      + fieldScore(q, it.kw, it.kn, 8, 6, 3)
      + (q.length < 3 ? 0 : fieldScore(q, it.dw, it.de, 3, 2, 1.5))
      + (it.bo && q.length >= 3 ? fieldScore(q, it.bw, it.bo, 1.5, 1, 0.6) : 0);
    if (!s && (fuzzyIn(q, it.tw) || fuzzyIn(q, it.kw))) s = 2.5;
    if (s) matched++;
    sum += s;
  }
  const need = Math.max(1, Math.ceil(terms.length * 0.6));
  if (matched < need) return 0;
  let score = sum * (matched / terms.length);
  if (terms.length > 1) {
    if (it.t.includes(phrase)) score += 12;
    if (it.kn.includes(phrase)) score += 8;
    if (it.de.includes(phrase)) score += 5;
    if (it.bo.includes(phrase)) score += 3;
  }
  if (it.t === phrase) score += 25; else if (it.t.startsWith(phrase)) score += 10;
  score *= TYPE_WEIGHT[it.d.type] || 1;
  if (it.d.at) score *= 1 + 0.15 * Math.exp(-Math.max(0, now - it.d.at) / (30 * 86400_000));
  if (it.d.score) score *= 1 + Math.min(0.15, Math.log1p(it.d.score) * 0.04);
  return score;
}

function snippetOf(d, terms) {
  const src = String(d.body || d.desc || '').replace(/\s+/g, ' ').trim();
  if (!src) return '';
  const low = src.toLowerCase();
  let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return clip(d.desc || src, 180);
  const start = Math.max(0, at - 50);
  return (start > 0 ? '…' : '') + clip(src.slice(start, start + 200), 180);
}

function didYouMean(terms, vocab) {
  let changed = false;
  const out = terms.map(q => {
    if (vocab.has(q) || q.length < 4) return q;
    let best = q, bd = 3;
    for (const w of vocab) {
      if (w[0] !== q[0] || Math.abs(w.length - q.length) > 2) continue;
      const d = lev(q, w, 2);
      if (d < bd) { bd = d; best = w; if (d === 1) break; }
    }
    if (best !== q) changed = true;
    return best;
  });
  return changed ? out.join(' ') : '';
}

const view = (it, terms, score) => {
  const d = it.d;
  return { type: d.type, title: d.title, url: d.url, snippet: snippetOf(d, terms), icon: d.icon || '', ...(d.photo ? { photo: d.photo } : {}), ...(d.by ? { by: d.by } : {}), ...(d.at ? { at: d.at } : {}), ...(d.section ? { section: d.section } : {}), score: Math.round(score * 10) / 10 };
};

async function run(L, q, opts) {
  const { type, limit, offset } = opts;
  const idx = await getIndex(L);
  const terms = words(q).slice(0, 8);
  const phrase = terms.join(' ');
  const now = Date.now();
  const want = type && TYPES.includes(type) ? type : '';
  const scored = [];
  const counts = {};
  for (const it of idx.items) {
    const s = scoreItem(it, terms, phrase, now);
    if (s <= 0) continue;
    counts[it.d.type] = (counts[it.d.type] || 0) + 1;
    if (want && it.d.type !== want) continue;
    scored.push([s, it]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const total = scored.length;
  const results = scored.slice(offset, offset + limit).map(([s, it]) => view(it, terms, s));
  const dym = total < 3 ? didYouMean(terms, idx.vocab) : '';
  if (!total && dym && !opts.noCorrect) {   // nothing found, but a corrected spelling does: show that and say so
    const again = await run(L, dym, { type, limit, offset, noCorrect: true });
    if (again.total) return { ...again, corrected: dym, originalQuery: q, didYouMean: '' };
  }
  return { terms, total, counts, results, didYouMean: dym, indexed: idx.items.length };
}

// ───────────────────────── http ─────────────────────────
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60_000) hits.delete(k);
  return list.length > 120;
}
const H = (extra) => ({ 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...(extra || {}) });
const out = (obj, status, cache) => new Response(JSON.stringify(obj), { status: status || 200, headers: H(cache ? { 'Cache-Control': 'public, max-age=' + cache } : { 'Cache-Control': 'no-store' }) });

export async function handleSearch(request, env, route, L) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: H({ 'Access-Control-Max-Age': '86400' }) });
  if (request.method !== 'GET') return out({ error: 'Use GET.' }, 405);
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  if (limited(ip)) return out({ error: 'Too many searches. Try again in a minute.' }, 429);
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const t0 = Date.now();

  if (route === 'stats') {
    const idx = await getIndex(L);
    const by = {}; for (const it of idx.items) by[it.d.type] = (by[it.d.type] || 0) + 1;
    return out({ ok: true, indexed: idx.items.length, byType: by, staticBuilt: staticCache.built, types: TYPES }, 200, 60);
  }

  if (route === 'suggest') {
    const idx = await getIndex(L);
    if (!q) {   // nothing typed yet: the quick links the site's own pages ask to be shown (ordered)
      const quick = idx.items.filter(it => it.d.quick).sort((a, b) => a.d.quick - b.d.quick).slice(0, 8).map(it => view(it, [], 0));
      return out({ ok: true, q, results: quick }, 200, 300);
    }
    const r = await run(L, q, { type: '', limit: 8, offset: 0 });
    return out({ ok: true, q, results: r.results.map(x => ({ type: x.type, title: x.title, url: x.url, icon: x.icon, ...(x.photo ? { photo: x.photo } : {}) })), didYouMean: r.didYouMean, took: Date.now() - t0 }, 200, 30);
  }

  if (route === '' || route === undefined) {
    if (!q) return out({ error: 'Missing q.' }, 400);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 20));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset'), 10) || 0);
    const r = await run(L, q, { type: (url.searchParams.get('type') || '').toLowerCase(), limit, offset, noCorrect: url.searchParams.get('exact') === '1' });
    return out({ ok: true, q, took: Date.now() - t0, ...r }, 200, 30);
  }
  return out({ error: 'Not found.' }, 404);
}
