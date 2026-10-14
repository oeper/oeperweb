// Writing to Firestore as the project itself (a service account), for the one thing the site's own rules can't allow a visitor to do:
// publish who has oeper+ (users/{email}.plusUntil, read by the site to show the + badge). Rules stop everyone else from writing that field.
//
// Setup (once): Firebase console › Project settings › Service accounts › Generate new private key, then
//   cd cf-ai-worker && npx wrangler secret put FIREBASE_SERVICE_ACCOUNT      (paste the whole downloaded JSON file)
// Without the secret everything still works; the + badge just doesn't appear for anyone.

const PROJECT_ID = 'oepernet-1683535959256';

export const serviceAccountConfigured = env => !!(env && env.FIREBASE_SERVICE_ACCOUNT);

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlText = s => b64url(new TextEncoder().encode(s));

let cached = null; // { token, exp }
async function accessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  let sa;
  try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT has no client_email / private_key');
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlText(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claims));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + header + '.' + claims + '.' + b64url(sig),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error('Google sign-in for the service account failed: ' + (j.error_description || j.error || res.status));
  cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cached.token;
}

/** Publishes whether (and until when) someone has oeper+ on their public profile (users/{email}.plusUntil: 0 none, -1 for life, else a time in ms). */
export async function setPlusUntil(env, email, plusUntil) {
  if (!serviceAccountConfigured(env)) throw new Error('not set up');
  const token = await accessToken(env);
  const name = `projects/${PROJECT_ID}/databases/(default)/documents/users/${email}`;
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name, fields: { plusUntil: { integerValue: String(Math.floor(plusUntil) || 0) } } }, updateMask: { fieldPaths: ['plusUntil'] } }] }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error('Firestore refused the oeper+ marker (' + res.status + ') ' + t.slice(0, 160)); }
}
