// Talks to the oeper-ai worker's codes, keys and usage endpoints (cf-ai-worker/src/ledger.js), as the signed-in person.
// Used by redeem.html (everyone) and promo-admin.html (owners).
//
// Local testing only: on localhost, ?api=http://127.0.0.1:8788&as=someone@x.com talks to a local `wrangler dev --var TEST_AUTH:1`
// as that person without signing in. The worker ignores that unless it is running on localhost with TEST_AUTH set, so it does nothing on the live site.
import { getCurrentUser, isOwnerEmail } from './account.js?v=42';

const params = new URLSearchParams(location.search);
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
export const DEV_API = isLocal && params.get('api') ? params.get('api').replace(/\/$/, '') : '';
export const DEV_AS = isLocal && params.get('as') ? params.get('as').toLowerCase() : '';
export const CODES_BASE = DEV_API || 'https://oeper-ai.oeper.workers.dev';

/** The person using the page: { email, getIdToken() } or null. */
export function who() {
  if (DEV_AS) return { email: DEV_AS, getIdToken: async () => '' };
  const u = getCurrentUser();
  return u ? { email: (u.email || '').toLowerCase(), getIdToken: () => u.getIdToken() } : null;
}
export const isOwner = u => !!u && isOwnerEmail(u.email);

async function headers(extra) {
  const u = who();
  const h = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (u) h.Authorization = DEV_AS ? 'Test ' + DEV_AS : 'Bearer ' + await u.getIdToken();
  return h;
}

/** Calls the worker. Resolves to the parsed JSON; rejects with an Error whose message is the server's explanation. */
export async function call(method, path, body) {
  let res;
  try {
    res = await fetch(CODES_BASE + path, { method, headers: await headers(), body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) { const e = new Error((data && data.error) || `Server answered ${res.status}`); e.status = res.status; e.reason = data && data.reason; throw e; }
  return data;
}

export const fmtDate = ms => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export function planLine(me) {
  if (!me) return '';
  if (me.plan === 'plus') return me.plusUntil === -1 ? 'epic AI Plus, for life' : 'epic AI Plus until ' + fmtDate(me.plusUntil);
  return me.signedIn ? 'Free plan' : 'Not signed in (guest)';
}
