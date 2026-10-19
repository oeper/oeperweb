// Firebase sign-in for the worker: checks the ID token the site / the epic AI app already has, using Google's public keys. Nothing is stored.
// Returns { email, uid } for a valid token and null otherwise (a missing, expired or forged token is simply "not signed in").

export const FIREBASE_PROJECT_ID = 'oepernet-1683535959256';
// Keep in sync with OWNER_EMAILS in shared/account.js and the isOwner() list in firestore.rules.
export const OWNER_EMAILS = ['sanhackerman@gmail.com', 'taejiding@gmail.com'];

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let keyCache = { at: 0, keys: new Map() };

function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlToJson = s => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function getKey(kid) {
  const fresh = Date.now() - keyCache.at < 3600_000;
  if (fresh && keyCache.keys.has(kid)) return keyCache.keys.get(kid);
  if (!fresh || !keyCache.keys.has(kid)) {
    const res = await fetch(JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!res.ok) throw new Error('could not load Google signing keys');
    const { keys } = await res.json();
    const map = new Map();
    for (const jwk of keys || []) {
      try { map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])); } catch { /* skip a key we can't read */ }
    }
    keyCache = { at: Date.now(), keys: map };
  }
  return keyCache.keys.get(kid) || null;
}

/** Verifies a Firebase ID token. [now] and [loadKey] exist so the check can be tested without Google. */
export async function verifyIdToken(token, now = Date.now(), loadKey = getKey) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const header = b64urlToJson(parts[0]);
    const claims = b64urlToJson(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;
    const t = Math.floor(now / 1000);
    if (claims.aud !== FIREBASE_PROJECT_ID || claims.iss !== 'https://securetoken.google.com/' + FIREBASE_PROJECT_ID) return null;
    if (!claims.sub || typeof claims.exp !== 'number' || claims.exp <= t || (claims.iat || 0) > t + 300) return null;
    const key = await loadKey(header.kid);
    if (!key) return null;
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const email = String(claims.email || '').toLowerCase();
    if (!email) return null;
    // oeper+ needs a verified phone: Firebase puts phone_number in the token once a phone is linked (the number itself is not kept)
    return { email, uid: claims.sub, phone: !!claims.phone_number, name: String(claims.name || '').slice(0, 60) };
  } catch {
    return null;
  }
}

/** Who is calling: from "Authorization: Bearer <id token>". Local testing only: "Authorization: Test <email>" when TEST_AUTH=1 and the host is localhost. */
export async function userFromRequest(request, env) {
  const h = request.headers.get('Authorization') || '';
  if (/^Bearer /i.test(h)) return verifyIdToken(h.slice(7).trim());
  if (/^Test /i.test(h) && env.TEST_AUTH === '1') {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') { const [email, flag] = h.slice(5).trim().toLowerCase().split(/\s+/); return { email, uid: 'test', phone: flag === 'phone' }; }
  }
  return null;
}

export const isOwner = u => !!u && OWNER_EMAILS.includes(u.email);
