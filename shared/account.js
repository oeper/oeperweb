// Shared account system (Firebase Auth + profile) used across every page.
// Import and call mountAccountBar(container) to render sign-in/profile UI.
// feed.html additionally imports auth/db/getProfile/etc. directly for
// posting, voting, moderation — those are forum-specific, not part of the
// public API other pages need.
//
// Whenever this file's exports change, bump the `?v=N` on every
// `from './shared/account.js?v=N'` import across the site (grep for it) —
// otherwise some visitors can get a stale cached copy of this file paired
// with a fresh page that imports something it doesn't export yet.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, deleteField, collection, addDoc,
  query, where, documentId, orderBy,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAs7SP8FaWUDuz7GVp9rG5uZw4oEIWmBUk",
  authDomain: "oepernet-1683535959256.firebaseapp.com",
  projectId: "oepernet-1683535959256",
  storageBucket: "oepernet-1683535959256.firebasestorage.app",
  messagingSenderId: "882911814752",
  appId: "1:882911814752:web:af7c10447ea6ee56c8cf05",
};

// Your Cloudflare Tunnel URL (forum-server/README.md). Used for profile
// photo uploads here, and for forum image uploads + reports in feed.html.
export const SERVER_ENDPOINT = 'https://fs.oeper.dev';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Accounts allowed to manage the site: forum moderation (ban/delete anywhere)
// and admin.html's content editor + file upload tool. Add more emails here
// any time — everywhere that checks ownership imports this same list.
export const OWNER_EMAILS = ['sanhackerman@gmail.com', 'taejiding@gmail.com'];
export function isOwnerEmail(email) { return OWNER_EMAILS.includes(email); }

// A small pill-shaped badge next to a name, Discord-official-message style.
// Owner accounts (the fixed OWNER_EMAILS list) default to a hardcoded
// "OFFICIAL" badge, overridable/hideable via setOwnBadgeOverride below. Any
// other account can be given a custom badge (any label + Material Symbol
// icon) by an owner via the profile page's overflow menu — stored at
// users/{email}.badge. Returns '' for everyone else. Self-contained
// (injects its own tiny stylesheet on first use) so any page can drop this
// inline next to a name without importing extra CSS.
function escBadgeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
let badgeStylesInjected = false;
function ensureBadgeStyles() {
  if (badgeStylesInjected) return;
  badgeStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-badge-official {
      display: inline-flex; align-items: center; gap: 3px; background: var(--md-sys-color-primary, #a8c7fa);
      color: var(--md-sys-color-on-primary, #062e6f); font-size: 10px; font-weight: 600; padding: 2px 7px 2px 5px;
      border-radius: 100px; vertical-align: middle; margin-left: 4px; letter-spacing: 0.2px;
    }
    .oe-badge-official .material-symbols-rounded { font-size: 11px; }
    .oe-badge-official.icon-only { padding: 3px; gap: 0; }
  `;
  document.head.appendChild(style);
}
export function officialBadgeHtml(email) {
  if (isOwnerEmail(email)) {
    // Owners default to the fixed "OFFICIAL" badge, but — unlike everyone
    // else's badge, which is owner-granted — an owner can override or hide
    // their own via badgeOverride (setOwnBadgeOverride below). Absent means
    // "never touched, show the default"; present-but-falsy/hidden means
    // "explicitly hidden", which deleteField() alone can't express since
    // that's indistinguishable from "never touched".
    const override = email && profileCache[email] && profileCache[email].badgeOverride;
    if (override === undefined) {
      ensureBadgeStyles();
      return `<span class="oe-badge-official" title="Official — site owner"><span class="material-symbols-rounded">verified</span>OFFICIAL</span>`;
    }
    if (!override || override.hidden) return '';
    ensureBadgeStyles();
    const icon = override.icon || 'verified';
    const hasLabel = !!override.label;
    return `<span class="oe-badge-official${hasLabel ? '' : ' icon-only'}" title="${escBadgeHtml(override.label || 'Badge')}"><span class="material-symbols-rounded">${escBadgeHtml(icon)}</span>${hasLabel ? escBadgeHtml(override.label.toUpperCase()) : ''}</span>`;
  }
  const badge = email && profileCache[email] && profileCache[email].badge;
  if (!badge) return '';
  ensureBadgeStyles();
  const icon = badge.icon || 'verified';
  const hasLabel = !!badge.label;
  return `<span class="oe-badge-official${hasLabel ? '' : ' icon-only'}" title="${escBadgeHtml(badge.label || 'Badge')}"><span class="material-symbols-rounded">${escBadgeHtml(icon)}</span>${hasLabel ? escBadgeHtml(badge.label.toUpperCase()) : ''}</span>`;
}

// Lets settings.html read an owner's current override (or lack of one) to
// initialize its picker — call ensureProfileLoaded(email) first so this
// isn't reading a still-empty cache.
export function getBadgeOverride(email) {
  return email && profileCache[email] && profileCache[email].badgeOverride;
}

let mentionStylesInjected = false;
function ensureMentionStyles() {
  if (mentionStylesInjected) return;
  mentionStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `.oe-mention { color: var(--md-sys-color-primary, #a8c7fa); font-weight: 500; text-decoration: none; }
    .oe-mention:hover { text-decoration: underline; }`;
  document.head.appendChild(style);
}
// Turns "@handle" into a link to that profile, Instagram/Twitter-style —
// doesn't verify the handle actually exists (that'd mean a Firestore read
// per mention on every render of every post/comment/message); a bad handle
// just 404s on the profile page the same way a bad link anywhere else
// would. Call on text that's ALREADY html-escaped (it emits real <a> tags,
// so running it before escaping would double-escape or get stripped).
// A handle must be preceded by start-of-string/whitespace/open-paren so it
// doesn't match a real email address's @domain part. extraAttrs (e.g.
// `onclick="event.stopPropagation()"`) lets callers embedding this inside
// an already-clickable card stop the mention link from also triggering it.
export function linkifyMentions(escapedHtml, extraAttrs) {
  ensureMentionStyles();
  const attrs = extraAttrs ? ' ' + extraAttrs : '';
  return escapedHtml.replace(/(^|[\s(])@([a-z0-9_.]{3,20})\b/gi, (m, pre, handle) =>
    `${pre}<a class="oe-mention" href="/profile?u=${encodeURIComponent(handle.toLowerCase())}"${attrs}>@${handle}</a>`);
}

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();
// Always show Google's account chooser, even if a session already exists —
// this is what makes signIn() double as "switch account" from Settings:
// calling it again while signed in replaces the current user with whichever
// account gets picked.
provider.setCustomParameters({ prompt: 'select_account' });

let currentUser = null;
let authReady = false;
const profileCache = {}; // email -> { displayName, photoURL } | null
const listeners = new Set();

function notify() { listeners.forEach(cb => cb(currentUser)); }

export function onAccountChange(cb) {
  listeners.add(cb);
  if (authReady) cb(currentUser);
  return () => listeners.delete(cb);
}

export function getCurrentUser() { return currentUser; }

export async function ensureProfileLoaded(email) {
  if (!email || email in profileCache) return profileCache[email];
  try {
    const snap = await getDoc(doc(db, 'users', email));
    profileCache[email] = snap.exists() ? snap.data() : null;
  } catch {
    profileCache[email] = null;
  }
  return profileCache[email];
}

// Resolves the name/photo to show for any author, given the values that
// were stored on their post/comment/etc at creation time as a fallback.
// Never falls back to the raw email — emails are never shown in the UI.
export function getProfile(email, fallbackName, fallbackPhoto) {
  const override = email && profileCache[email];
  return {
    name: (override && override.displayName) || fallbackName || 'User',
    photo: (override && override.photoURL) || fallbackPhoto || '',
    badge: (override && override.badge) || null,
  };
}

// Owner-only: sets or clears a custom badge on any account (see
// officialBadgeHtml above) — pass { label, icon } to set one, or null/
// undefined to clear it. Enforced server-side too — firestore.rules only
// lets an owner touch the `badge` field, nothing else on someone else's
// profile — this check just avoids a doomed round-trip for everyone else.
export async function setUserBadge(email, badge) {
  if (!currentUser || !isOwnerEmail(currentUser.email)) throw new Error('only owners can do this');
  if (badge) {
    await setDoc(doc(db, 'users', email), { badge }, { merge: true });
  } else {
    await setDoc(doc(db, 'users', email), { badge: deleteField() }, { merge: true });
  }
  const next = { ...(profileCache[email] || {}) };
  if (badge) next.badge = badge; else delete next.badge;
  profileCache[email] = next;
  notify();
  sendNotification({ recipientEmail: email, type: 'badge', preview: badge ? badge.label : null });
}

// Self-service, owner accounts only: overrides (or hides) your own default
// "OFFICIAL" badge — the badge everyone else has is granted by an owner via
// setUserBadge above, but that hardcodes OFFICIAL for owners with no way to
// touch it, which is exactly the "can't remove or rename it" complaint this
// exists to fix. Pass { label, icon } for a custom badge, { hidden: true }
// to show nothing, or undefined to go back to the default OFFICIAL badge.
export async function setOwnBadgeOverride(override) {
  if (!currentUser) throw new Error('sign in first');
  if (override === undefined) {
    await setDoc(doc(db, 'users', currentUser.email), { badgeOverride: deleteField() }, { merge: true });
  } else {
    await setDoc(doc(db, 'users', currentUser.email), { badgeOverride: override }, { merge: true });
  }
  const next = { ...(profileCache[currentUser.email] || {}) };
  if (override === undefined) delete next.badgeOverride; else next.badgeOverride = override;
  profileCache[currentUser.email] = next;
  notify();
}

// Who you follow / who follows you, as email sets — used anywhere that
// needs a candidate pool of "people you actually know" without a full
// user-search feature (e.g. picking group chat members).
export async function loadFollowRelationships(email) {
  if (!email) return { following: new Set(), followers: new Set() };
  try {
    const [followingSnap, followersSnap] = await Promise.all([
      getDocs(query(collection(db, 'follows'), where('followerEmail', '==', email))),
      getDocs(query(collection(db, 'follows'), where('followeeEmail', '==', email))),
    ]);
    return {
      following: new Set(followingSnap.docs.map(d => d.data().followeeEmail)),
      followers: new Set(followersSnap.docs.map(d => d.data().followerEmail)),
    };
  } catch {
    return { following: new Set(), followers: new Set() };
  }
}

// Writes a notification doc for the bell icon in topnav.js. Called from
// every place across the site that does something notification-worthy
// (upvote, comment, follow, badge grant) — silently skips signed-out
// visitors and self-notifications (e.g. upvoting your own post) rather
// than making every call site check both. Best-effort: a failure here
// (e.g. rules not yet published) shouldn't block the action that triggered
// it, so callers don't need to await or catch this.
export function sendNotification({ recipientEmail, type, targetKind, targetId, preview }) {
  if (!currentUser || !recipientEmail || recipientEmail === currentUser.email) return;
  addDoc(collection(db, 'notifications'), {
    recipientEmail,
    actorEmail: currentUser.email,
    actorName: currentUser.displayName,
    actorPhoto: currentUser.photoURL,
    type,
    targetKind: targetKind || null,
    targetId: targetId || null,
    preview: preview || null,
    read: false,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}

// The @handle for a profile, if one's been assigned yet (see ensureHandle).
// Used to build /profile?u=<handle> links without ever putting a real
// email in a URL. Returns null if this account hasn't been assigned one
// yet (e.g. they haven't signed in since this feature shipped) — callers
// should render plain, non-linked text in that case rather than guessing.
export function handleOf(email) {
  const p = email && profileCache[email];
  return (p && p.handle) || null;
}

// Assigns a permanent, unique @handle the first time we see an account,
// derived from their display name (falls back to the email's local part
// only as raw material for the slug — never stored or shown as-is).
// handles/{handle} docs are create-only in firestore.rules (first claim
// wins, forever), so collisions just move on to the next candidate.
async function ensureHandle(email, displayName) {
  const profile = await ensureProfileLoaded(email);
  if (profile && profile.handle) return profile.handle;

  const base = (displayName || email.split('@')[0] || 'user')
    .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user';
  let candidate = base;
  for (let i = 2; i <= 50; i++) {
    try {
      const snap = await getDoc(doc(db, 'handles', candidate));
      if (!snap.exists()) break;
    } catch { break; }
    candidate = base + i;
  }

  try {
    await setDoc(doc(db, 'handles', candidate), { email });
    await setDoc(doc(db, 'users', email), { handle: candidate }, { merge: true });
    profileCache[email] = { ...(profileCache[email] || {}), handle: candidate };
    notify();
    return candidate;
  } catch {
    return null; // lost a race to another tab, or a rules hiccup — next sign-in retries
  }
}

// Instagram-style handle rules: lowercase letters, numbers, periods,
// underscores, 3-20 characters.
const HANDLE_PATTERN = /^[a-z0-9_.]{3,20}$/;
export function isValidHandle(h) { return HANDLE_PATTERN.test(h || ''); }

// True if nobody's claimed this handle yet (or it's already yours).
export async function isHandleAvailable(newHandle) {
  if (!isValidHandle(newHandle)) return false;
  if (currentUser && handleOf(currentUser.email) === newHandle) return true;
  try {
    const snap = await getDoc(doc(db, 'handles', newHandle));
    return !snap.exists();
  } catch {
    return false;
  }
}

// Claims a new handle for the signed-in account, Instagram-style (you can
// change it any time, as long as nobody else already has it). The old
// handle's handles/{oldHandle} doc is left in place pointing at the same
// account — harmless, and it means old profile links keep working instead
// of breaking the moment someone renames themselves.
export async function changeHandle(newHandle) {
  if (!currentUser) throw new Error('sign in first');
  if (!isValidHandle(newHandle)) throw new Error('usernames must be 3-20 characters: lowercase letters, numbers, periods, and underscores only.');
  if (handleOf(currentUser.email) === newHandle) return newHandle; // no-op, already yours
  const available = await isHandleAvailable(newHandle);
  if (!available) throw new Error('that username is already taken.');
  await setDoc(doc(db, 'handles', newHandle), { email: currentUser.email });
  await setDoc(doc(db, 'users', currentUser.email), { handle: newHandle }, { merge: true });
  profileCache[currentUser.email] = { ...(profileCache[currentUser.email] || {}), handle: newHandle };
  notify();
  return newHandle;
}

// Stable per-browser id (not per-account — a shared/public computer signed
// into two different accounts should still show as "two devices", one per
// account, not merge into one) used to key the signed-in-devices log below.
function getDeviceId() {
  let id;
  try { id = localStorage.getItem('oe_device_id'); } catch { return null; }
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
    try { localStorage.setItem('oe_device_id', id); } catch { return null; }
  }
  return id;
}
function deviceLabel() {
  const ua = navigator.userAgent;
  let os = 'an unknown OS';
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = 'an unknown browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\//.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return `${browser} on ${os}`;
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    await ensureProfileLoaded(user.email);
    // Awaited (not fire-and-forget): ensureHandle needs displayName to
    // already be present in Firestore for its own write to pass the rules,
    // so profile seeding has to finish first.
    await ensureProfileSeeded(user);
    ensureHandle(user.email, user.displayName);
    // Posts/videos store voters as Firebase Auth uid, not email
    // (arrayUnion(uid) on upvoters/downvoters) — this is the only place
    // that uid gets tied back to an email, so "who liked this" can resolve
    // a name/photo via the normal email-keyed profile system instead of
    // adding a second, uid-keyed profile store. Best-effort, doesn't block
    // sign-in on it.
    setDoc(doc(db, 'uidLookup', user.uid), { email: user.email }, { merge: true }).catch(() => {});
    // Upserts this browser into the signed-in-devices log settings.html
    // shows under Security — fires on every page load with a persisted
    // session (not just a fresh sign-in), which is what makes lastSeenAt
    // actually mean "recently active" rather than just "once signed in".
    const deviceId = getDeviceId();
    if (deviceId) {
      setDoc(doc(db, 'users', user.email, 'sessions', deviceId), {
        label: deviceLabel(), lastSeenAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
  }
  authReady = true;
  notify();
});

// Signed-in-devices log for settings.html's Security section — see the
// upsert above for what gets written and when. Not a remote kill switch:
// removing an entry here only clears it from this list, since revoking an
// actual session would need a server holding the Firebase Admin SDK, which
// this static site doesn't have. Real session control lives on Google's
// side (linked from the same Security section) since sign-in is Google-only.
export async function listSessions(email) {
  try {
    const snap = await getDocs(query(collection(db, 'users', email, 'sessions'), orderBy('lastSeenAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('Could not load sessions:', err.message);
    return [];
  }
}
export function removeSession(email, sessionId) {
  return deleteDoc(doc(db, 'users', email, 'sessions', sessionId));
}
export function getCurrentDeviceId() { return getDeviceId(); }

// Completes a signInWithRedirect() flow (see signIn()'s popup-blocked
// fallback below) — the page fully navigates away to Google and back, so
// this needs to run on every load to pick up the result. onAuthStateChanged
// above already fires with the signed-in user once this resolves; this is
// just here to catch and surface an actual failure (declined consent, a
// genuine auth error) instead of it silently vanishing.
getRedirectResult(auth).catch(err => {
  console.error('Redirect sign-in failed:', err);
});

const uidEmailCache = {}; // uid -> email | null
// Resolves Firebase Auth uids (as stored in upvoters/downvoters arrays) to
// emails, so callers can then use the normal getProfile(email)/
// ensureProfileLoaded(email) machinery. Batches via documentId() `in`
// queries (Firestore's cap is 30 per query) and caches everything.
export async function resolveUidsToEmails(uids) {
  const unique = [...new Set(uids)].filter(Boolean);
  const uncached = unique.filter(u => !(u in uidEmailCache));
  for (let i = 0; i < uncached.length; i += 30) {
    const batch = uncached.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(db, 'uidLookup'), where(documentId(), 'in', batch)));
      const found = new Set();
      snap.docs.forEach(d => { uidEmailCache[d.id] = d.data().email || null; found.add(d.id); });
      batch.forEach(u => { if (!found.has(u)) uidEmailCache[u] = null; });
    } catch {
      batch.forEach(u => { uidEmailCache[u] = null; });
    }
  }
  const out = {};
  unique.forEach(u => { out[u] = uidEmailCache[u] || null; });
  return out;
}

export function signIn() {
  return signInWithPopup(auth, provider).catch(err => {
    // Popup-based sign-in is unreliable on a lot of mobile browsers — either
    // blocked outright, or the popup opens but Chrome-on-Android's window
    // handling loses track of it. Only fall back for errors that actually
    // mean "a popup couldn't happen here", not e.g. the user closing it on
    // purpose (auth/popup-closed-by-user) or a genuine account-picker error.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(err.code)) {
      return signInWithRedirect(auth, provider);
    }
    throw err;
  });
}
export function signOutUser() {
  return signOut(auth);
}

// onProgress (optional): called with a 0-1 fraction as the upload streams,
// via XMLHttpRequest since fetch has no cross-browser upload-progress event.
export async function uploadFile(file, endpointPath, extraFields, onProgress) {
  if (!file) return null;
  if (!SERVER_ENDPOINT) throw new Error('image uploads are not set up yet');
  if (!currentUser) throw new Error('sign in first');
  const idToken = await currentUser.getIdToken();
  const fd = new FormData();
  // Extra text fields (e.g. files.html's target folder) must be appended
  // before the file — multer/busboy parse multipart fields in stream
  // order, so anything appended after 'file' isn't guaranteed to be in
  // req.body by the time the server's upload callback runs.
  if (extraFields) for (const key in extraFields) fd.append(key, extraFields[key]);
  fd.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', SERVER_ENDPOINT + (endpointPath || '/upload'));
    xhr.setRequestHeader('Authorization', 'Bearer ' + idToken);
    if (onProgress) {
      xhr.upload.addEventListener('progress', e => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
    }
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('upload failed — network error'));
    xhr.send(fd);
  }).then(data => data.url);
}

export async function updateProfile({ displayName, photoFile, bio, onProgress }) {
  if (!currentUser) throw new Error('sign in first');
  const patch = { updatedAt: serverTimestamp() };
  const trimmedName = (displayName || '').trim().slice(0, 40);
  patch.displayName = trimmedName || currentUser.displayName || currentUser.email;
  if (bio !== undefined) patch.bio = (bio || '').trim().slice(0, 200);
  if (photoFile) {
    patch.photoURL = await uploadFile(photoFile, undefined, undefined, onProgress);
  }
  await setDoc(doc(db, 'users', currentUser.email), patch, { merge: true });
  profileCache[currentUser.email] = { ...(profileCache[currentUser.email] || {}), ...patch };
  notify();
}

// Seeds a brand-new account's users/{email} doc with a starting displayName,
// photoURL (from their Google account), and createdAt ("member since") —
// all in one write. This has to happen in a single setDoc: firestore.rules
// requires displayName to be present on every write to this collection, and
// for a document that doesn't exist yet, a merge patch containing only
// {createdAt: ...} or {handle: ...} would produce a resulting document with
// no displayName at all and get silently rejected — which is exactly what
// used to happen here, leaving brand-new accounts with no join date, no
// handle, and (since nothing ever copied over their Google photo) a blank
// avatar on their profile page. Safe to call on every sign-in — only writes
// fields that are actually missing.
async function ensureProfileSeeded(user) {
  const profile = await ensureProfileLoaded(user.email);
  const patch = {};
  if (!profile || !profile.displayName) patch.displayName = (user.displayName || user.email).slice(0, 40);
  if ((!profile || !profile.photoURL) && user.photoURL) patch.photoURL = user.photoURL;
  if (!profile || !profile.createdAt) patch.createdAt = serverTimestamp();
  if (Object.keys(patch).length === 0) return;
  // One retry on top of the original attempt — a transient failure here
  // (network blip mid-sign-in, tab closed right after) used to just leave
  // the account permanently missing its join date/handle/avatar until the
  // user happened to sign in again, since nothing else ever retries this
  // write. Two tries in the same page load catches most one-off hiccups
  // without needing a return visit.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await setDoc(doc(db, 'users', user.email), patch, { merge: true });
      delete profileCache[user.email]; // force a fresh read so serverTimestamp-resolved fields populate correctly
      notify();
      return;
    } catch (err) {
      if (attempt === 2) console.error('ensureProfileSeeded failed after retry:', err);
      else await new Promise(r => setTimeout(r, 800));
    }
  }
}

function escHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .oe-acct-bar { display: flex; align-items: center; gap: 10px; }
    .oe-acct-signin {
      display: inline-flex; align-items: center; gap: 8px; background-color: var(--md-sys-color-primary, #a8c7fa);
      color: var(--md-sys-color-on-primary, #062e6f); border: none; border-radius: 100px; padding: 10px 20px;
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); font-size: 14px; font-weight: 500; cursor: pointer;
    }
    .oe-acct-signin:hover { opacity: 0.9; }
    .oe-acct-chip { display: flex; align-items: center; gap: 8px; }
    .oe-acct-profile-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
    .oe-acct-chip img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant, #2f353d); }
    .oe-acct-chip .oe-acct-name { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #c4c7c5); font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); }
    .oe-acct-chip button {
      background: var(--md-sys-color-surface-variant, #2f353d); border: none; color: var(--md-sys-color-on-surface-variant, #c4c7c5);
      border-radius: 100px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .oe-acct-chip button:hover { color: var(--md-sys-color-on-surface, #e2e2e6); }
    .oe-acct-chip .oe-acct-icon-btn { padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .oe-acct-chip .oe-acct-icon-btn .material-symbols-rounded { font-size: 14px; }
    @media (max-width: 600px) {
      .oe-acct-chip .oe-acct-name { display: none; }
    }

    .oe-acct-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
    .oe-acct-overlay.open { opacity: 1; pointer-events: all; }
    .oe-acct-modal {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -48%); width: min(420px, 92vw);
      background-color: var(--md-sys-color-surface, #1a1c22); border-radius: 28px; padding: 28px; z-index: 201;
      opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s;
      font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif); color: var(--md-sys-color-on-surface, #e2e2e6);
    }
    .oe-acct-modal.open { opacity: 1; pointer-events: all; transform: translate(-50%, -50%); }
    .oe-acct-modal h3 { font-size: 20px; font-weight: 400; margin-bottom: 20px; }
    .oe-acct-avatar-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .oe-acct-avatar-row img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant, #2f353d); }
    .oe-acct-avatar-row label {
      display: inline-flex; align-items: center; gap: 6px; background: var(--md-sys-color-surface-variant, #2f353d); border: none;
      border-radius: 10px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: var(--md-sys-color-on-surface-variant, #c4c7c5);
    }
    .oe-acct-avatar-row label:hover { background: var(--md-sys-state-hover); }
    .oe-acct-avatar-row input[type="file"] { display: none; }
    .oe-acct-field { margin-bottom: 20px; }
    .oe-acct-field label { display: block; font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface-variant, #c4c7c5); margin-bottom: 6px; }
    .oe-acct-field input[type="text"], .oe-acct-field textarea {
      width: 100%; background-color: var(--md-sys-color-surface-variant, #2f353d); border: none;
      border-radius: 12px; padding: 12px 14px; color: var(--md-sys-color-on-surface, #e2e2e6); font-size: 14px; font-family: inherit; outline: none;
    }
    .oe-acct-field textarea { resize: vertical; min-height: 60px; }
    .oe-acct-field input[type="text"]:focus, .oe-acct-field textarea:focus { box-shadow: 0 0 0 2px var(--md-sys-color-primary, #a8c7fa); }
    .oe-acct-handle-status { font-size: 12px; margin-top: 6px; min-height: 14px; }
    .oe-acct-handle-status.ok { color: var(--md-sys-color-success, #a6d9a8); }
    .oe-acct-handle-status.bad { color: var(--md-sys-color-error, #ffb4ab); }
    .oe-acct-actions { display: flex; justify-content: space-between; gap: 12px; }
    .oe-acct-btn {
      display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; padding: 10px 18px;
      border-radius: 100px; border: none; background: var(--md-sys-color-surface-variant, #2f353d);
      color: var(--md-sys-color-on-surface, #e2e2e6); cursor: pointer; font-family: inherit;
    }
    .oe-acct-btn:hover { background-color: var(--md-sys-state-hover); }
    .oe-acct-btn.primary { background-color: var(--md-sys-color-primary, #a8c7fa); color: var(--md-sys-color-on-primary, #062e6f); }
    .oe-acct-btn.primary:hover { opacity: 0.9; }
    .oe-acct-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .oe-acct-btn.danger { color: var(--md-sys-color-error, #ffb4ab); background: color-mix(in srgb, var(--md-sys-color-error, #ffb4ab) 18%, transparent); }

    .oe-acct-toast {
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px); background-color: #303034;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); border-radius: 16px; padding: 14px 24px; font-family: var(--oe-font-override, 'Google Sans', 'Product Sans', sans-serif);
      font-size: 14px; color: #e3e2e6; opacity: 0; transition: opacity 0.25s, transform 0.25s; pointer-events: none; z-index: 210; white-space: nowrap;
    }
    .oe-acct-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  `;
  document.head.appendChild(style);
}

function ensureFontsAndIcons() {
  const need = [
    ['https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&display=swap', 'stylesheet'],
    ['https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200', 'stylesheet'],
  ];
  need.forEach(([href]) => {
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
  });
}

let toastEl = null;
function showToast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'oe-acct-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2800);
}

let modalEls = null;
function ensureModal() {
  if (modalEls) return modalEls;
  const overlay = document.createElement('div');
  overlay.className = 'oe-acct-overlay';
  const modal = document.createElement('div');
  modal.className = 'oe-acct-modal';
  modal.innerHTML = `
    <h3>edit profile</h3>
    <div class="oe-acct-avatar-row">
      <img id="oeAcctAvatarPreview" src="" alt="">
      <label>
        <span class="material-symbols-rounded" style="font-size:16px;">photo_camera</span> change photo
        <input type="file" accept="image/*" id="oeAcctPhotoInput">
      </label>
    </div>
    <div class="oe-acct-field">
      <label>display name</label>
      <input type="text" id="oeAcctNameInput" maxlength="40">
    </div>
    <div class="oe-acct-field">
      <label>username</label>
      <input type="text" id="oeAcctHandleInput" maxlength="20" placeholder="lowercase, no spaces">
      <div class="oe-acct-handle-status" id="oeAcctHandleStatus"></div>
    </div>
    <div class="oe-acct-field">
      <label>bio</label>
      <textarea id="oeAcctBioInput" maxlength="200" rows="3" placeholder="say something about yourself…"></textarea>
    </div>
    <div class="oe-acct-actions">
      <button type="button" class="oe-acct-btn danger" id="oeAcctCancel">cancel</button>
      <button type="button" class="oe-acct-btn primary" id="oeAcctSave"><span class="material-symbols-rounded" style="font-size:16px;">check</span> save</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  overlay.addEventListener('click', closeModal);
  modal.querySelector('#oeAcctCancel').addEventListener('click', closeModal);
  modalEls = { overlay, modal };
  return modalEls;
}
function closeModal() {
  if (!modalEls) return;
  modalEls.overlay.classList.remove('open');
  modalEls.modal.classList.remove('open');
}

export function openEditProfileModal() {
  injectStyles();
  ensureFontsAndIcons();
  if (!currentUser) return;
  const { overlay, modal } = ensureModal();
  const profile = getProfile(currentUser.email, currentUser.displayName, currentUser.photoURL);
  const avatarPreview = modal.querySelector('#oeAcctAvatarPreview');
  const nameInput = modal.querySelector('#oeAcctNameInput');
  const handleInput = modal.querySelector('#oeAcctHandleInput');
  const handleStatus = modal.querySelector('#oeAcctHandleStatus');
  const bioInput = modal.querySelector('#oeAcctBioInput');
  const photoInput = modal.querySelector('#oeAcctPhotoInput');
  const saveBtn = modal.querySelector('#oeAcctSave');

  const currentHandle = handleOf(currentUser.email) || '';
  avatarPreview.src = profile.photo || '';
  nameInput.value = profile.name || '';
  handleInput.value = currentHandle;
  handleStatus.textContent = '';
  handleStatus.className = 'oe-acct-handle-status';
  bioInput.value = (profileCache[currentUser.email] && profileCache[currentUser.email].bio) || '';
  photoInput.value = '';
  let pendingFile = null;
  let handleCheckTimer = null;

  photoInput.onchange = () => {
    const f = photoInput.files[0];
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) { showToast(`image must be under ${Math.round(MAX_IMAGE_BYTES/1024/1024)}MB`); return; }
    pendingFile = f;
    avatarPreview.src = URL.createObjectURL(f);
  };

  handleInput.oninput = () => {
    const value = handleInput.value.trim().toLowerCase();
    handleInput.value = value;
    clearTimeout(handleCheckTimer);
    if (value === currentHandle) { handleStatus.textContent = ''; handleStatus.className = 'oe-acct-handle-status'; return; }
    if (!value) { handleStatus.textContent = ''; handleStatus.className = 'oe-acct-handle-status'; return; }
    if (!isValidHandle(value)) {
      handleStatus.textContent = '3-20 characters: lowercase letters, numbers, periods, underscores.';
      handleStatus.className = 'oe-acct-handle-status bad';
      return;
    }
    handleStatus.textContent = 'checking…';
    handleStatus.className = 'oe-acct-handle-status';
    handleCheckTimer = setTimeout(async () => {
      const available = await isHandleAvailable(value);
      if (handleInput.value !== value) return; // stale, they've kept typing
      handleStatus.textContent = available ? 'available' : 'already taken';
      handleStatus.className = 'oe-acct-handle-status ' + (available ? 'ok' : 'bad');
    }, 400);
  };

  saveBtn.onclick = async () => {
    const newHandle = handleInput.value.trim().toLowerCase();
    if (newHandle && newHandle !== currentHandle && !isValidHandle(newHandle)) {
      showToast('fix your username before saving');
      return;
    }
    saveBtn.disabled = true;
    const saveBtnLabel = saveBtn.textContent;
    try {
      await updateProfile({
        displayName: nameInput.value, photoFile: pendingFile, bio: bioInput.value,
        onProgress: pendingFile ? frac => { saveBtn.textContent = `uploading… ${Math.round(frac * 100)}%`; } : undefined,
      });
      if (newHandle && newHandle !== currentHandle) {
        try { await changeHandle(newHandle); }
        catch (err) { showToast('profile saved, but username change failed: ' + err.message); saveBtn.disabled = false; return; }
      }
      closeModal();
      showToast('profile updated');
    } catch (err) {
      showToast('could not update profile: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = saveBtnLabel;
    }
  };

  overlay.classList.add('open');
  modal.classList.add('open');
}

export function mountAccountBar(container) {
  if (!container) return;
  injectStyles();
  ensureFontsAndIcons();

  function render() {
    if (currentUser) {
      const profile = getProfile(currentUser.email, currentUser.displayName, currentUser.photoURL);
      const handle = handleOf(currentUser.email);
      const profileInner = `<img src="${profile.photo || ''}" alt=""><span class="oe-acct-name">${escHtml(profile.name)}</span>`;
      container.innerHTML = `
        <div class="oe-acct-chip">
          ${handle
            ? `<a href="/profile?u=${encodeURIComponent(handle)}" class="oe-acct-profile-link" title="view profile">${profileInner}</a>`
            : `<span class="oe-acct-profile-link">${profileInner}</span>`}
        </div>
      `;
    } else {
      container.innerHTML = `<button class="oe-acct-signin" id="oeAcctSignInBtn"><span class="material-symbols-rounded" style="font-size:18px;">login</span> sign in</button>`;
      container.querySelector('#oeAcctSignInBtn').addEventListener('click', () => {
        signIn().catch(err => showToast('sign-in failed: ' + err.message));
      });
    }
  }

  onAccountChange(render);
}
