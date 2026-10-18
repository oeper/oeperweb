// epic AI's Google Docs / Sheets connection (see cf-ai-worker/src/google.js). The worker holds the Google token; the browser only asks
// "connected?", opens Google's sign-in page in a new tab, and can disconnect. The answer is cached so ai.html knows whether to offer the tools.
import { getCurrentUser } from './account.js?v=43';
import { AI_ENDPOINT } from './ai-features.js?v=6';

const KEY = 'oe-google-connected';
export const googleConnectedCached = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = on => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* private window */ } };

async function call(path, method) {
  const u = getCurrentUser();
  if (!u) throw new Error('Sign in first.');
  const r = await fetch(AI_ENDPOINT + path, { method, headers: { Authorization: 'Bearer ' + await u.getIdToken() } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Something went wrong (' + r.status + ').');
  return data;
}

/** { configured, connected, googleEmail } — also refreshes the cached flag. */
export async function googleStatus() {
  const s = await call('/api/google/status', 'GET');
  remember(!!s.connected);
  return s;
}
/** Opens Google's consent page in a new tab; the person comes back and the status is re-read. */
export async function connectGoogle() {
  const { url } = await call('/api/google/connect', 'POST');
  window.open(url, '_blank', 'noopener');
}
export async function disconnectGoogle() {
  await call('/api/google/disconnect', 'POST');
  remember(false);
}
