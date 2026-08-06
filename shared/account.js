// Shared account system (Firebase Auth + profile) used across every page.
// Import and call mountAccountBar(container) to render sign-in/profile UI.
// forum.html additionally imports auth/db/getProfile/etc. directly for
// posting, voting, moderation — those are forum-specific, not part of the
// public API other pages need.
//
// Whenever this file's exports change, bump the `?v=N` on every
// `from './shared/account.js?v=N'` import across the site (grep for it) —
// otherwise some visitors can get a stale cached copy of this file paired
// with a fresh page that imports something it doesn't export yet.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
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
// photo uploads here, and for forum image uploads + reports in forum.html.
export const SERVER_ENDPOINT = 'https://fs.oeper.dev';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Accounts allowed to manage the site: forum moderation (ban/delete anywhere)
// and admin.html's content editor + file upload tool. Add more emails here
// any time — everywhere that checks ownership imports this same list.
export const OWNER_EMAILS = ['sanhackerman@gmail.com', 'taejiding@gmail.com'];
export function isOwnerEmail(email) { return OWNER_EMAILS.includes(email); }

// True if an owner has granted this account the Official badge via the
// profile page's overflow menu (users/{email}.verified) — separate from
// isOwnerEmail, which is the fixed, hardcoded list of accounts with actual
// site-management permissions. Relies on the profile already being cached
// (ensureProfileLoaded/getProfile's usual call sites already do this before
// rendering a name, which is also when this gets checked).
function isVerifiedEmail(email) { return !!(email && profileCache[email] && profileCache[email].verified); }

// A small "Official" badge for owner accounts, Discord-official-message
// style. Returns '' for everyone else. Self-contained (injects its own
// tiny stylesheet on first use) so any page can drop this inline next to
// a name without importing extra CSS.
let badgeStylesInjected = false;
export function officialBadgeHtml(email) {
  if (!isOwnerEmail(email) && !isVerifiedEmail(email)) return '';
  if (!badgeStylesInjected) {
    badgeStylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .oe-badge-official {
        display: inline-flex; align-items: center; gap: 3px; background: var(--md-sys-color-primary, #a8c7fa);
        color: var(--md-sys-color-on-primary, #062e6f); font-size: 10px; font-weight: 600; padding: 2px 7px 2px 5px;
        border-radius: 100px; vertical-align: middle; margin-left: 4px; letter-spacing: 0.2px;
      }
      .oe-badge-official .material-symbols-rounded { font-size: 11px; }
    `;
    document.head.appendChild(style);
  }
  return `<span class="oe-badge-official" title="Official — site owner"><span class="material-symbols-rounded">verified</span>OFFICIAL</span>`;
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
    verified: !!(override && override.verified),
  };
}

// Owner-only: grants or revokes the Official badge on any account (see
// isVerifiedEmail above). Enforced server-side too — firestore.rules only
// lets an owner touch the `verified` field, nothing else on someone else's
// profile — this check just avoids a doomed round-trip for everyone else.
export async function setVerified(email, verified) {
  if (!currentUser || !isOwnerEmail(currentUser.email)) throw new Error('Only owners can do this');
  await setDoc(doc(db, 'users', email), { verified }, { merge: true });
  profileCache[email] = { ...(profileCache[email] || {}), verified };
  notify();
}

// The @handle for a profile, if one's been assigned yet (see ensureHandle).
// Used to build /profile.html?u=<handle> links without ever putting a real
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
  if (!currentUser) throw new Error('Sign in first');
  if (!isValidHandle(newHandle)) throw new Error('Usernames must be 3-20 characters: lowercase letters, numbers, periods, and underscores only.');
  if (handleOf(currentUser.email) === newHandle) return newHandle; // no-op, already yours
  const available = await isHandleAvailable(newHandle);
  if (!available) throw new Error('That username is already taken.');
  await setDoc(doc(db, 'handles', newHandle), { email: currentUser.email });
  await setDoc(doc(db, 'users', currentUser.email), { handle: newHandle }, { merge: true });
  profileCache[currentUser.email] = { ...(profileCache[currentUser.email] || {}), handle: newHandle };
  notify();
  return newHandle;
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
  }
  authReady = true;
  notify();
});

export function signIn() {
  return signInWithPopup(auth, provider);
}
export function signOutUser() {
  return signOut(auth);
}

export async function uploadFile(file, endpointPath) {
  if (!file) return null;
  if (!SERVER_ENDPOINT) throw new Error('Image uploads are not set up yet');
  if (!currentUser) throw new Error('Sign in first');
  const idToken = await currentUser.getIdToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(SERVER_ENDPOINT + (endpointPath || '/upload'), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + idToken },
    body: fd,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try { message = (await res.json()).error || message; } catch {}
    throw new Error(message);
  }
  return (await res.json()).url;
}

export async function updateProfile({ displayName, photoFile, bio }) {
  if (!currentUser) throw new Error('Sign in first');
  const patch = { updatedAt: serverTimestamp() };
  const trimmedName = (displayName || '').trim().slice(0, 40);
  patch.displayName = trimmedName || currentUser.displayName || currentUser.email;
  if (bio !== undefined) patch.bio = (bio || '').trim().slice(0, 200);
  if (photoFile) {
    patch.photoURL = await uploadFile(photoFile);
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
  try {
    await setDoc(doc(db, 'users', user.email), patch, { merge: true });
    delete profileCache[user.email]; // force a fresh read so serverTimestamp-resolved fields populate correctly
    notify();
  } catch {}
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
      font-family: 'Google Sans', 'Product Sans', sans-serif; font-size: 14px; font-weight: 500; cursor: pointer;
    }
    .oe-acct-signin:hover { opacity: 0.9; }
    .oe-acct-chip { display: flex; align-items: center; gap: 8px; }
    .oe-acct-profile-link { display: flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
    .oe-acct-chip img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant, #2f353d); }
    .oe-acct-chip .oe-acct-name { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #c4c7c5); font-family: 'Google Sans', 'Product Sans', sans-serif; }
    .oe-acct-chip button {
      background: none; border: 1px solid var(--md-sys-color-outline, #43474e); color: var(--md-sys-color-on-surface-variant, #c4c7c5);
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
      font-family: 'Google Sans', 'Product Sans', sans-serif; color: var(--md-sys-color-on-surface, #e2e2e6);
    }
    .oe-acct-modal.open { opacity: 1; pointer-events: all; transform: translate(-50%, -50%); }
    .oe-acct-modal h3 { font-size: 20px; font-weight: 400; margin-bottom: 20px; }
    .oe-acct-avatar-row { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
    .oe-acct-avatar-row img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant, #2f353d); }
    .oe-acct-avatar-row label {
      display: inline-flex; align-items: center; gap: 6px; border: 1px dashed var(--md-sys-color-outline, #43474e);
      border-radius: 10px; padding: 8px 14px; font-size: 13px; cursor: pointer; color: var(--md-sys-color-on-surface-variant, #c4c7c5);
    }
    .oe-acct-avatar-row input[type="file"] { display: none; }
    .oe-acct-field { margin-bottom: 20px; }
    .oe-acct-field label { display: block; font-size: 13px; font-weight: 500; color: var(--md-sys-color-on-surface-variant, #c4c7c5); margin-bottom: 6px; }
    .oe-acct-field input[type="text"], .oe-acct-field textarea {
      width: 100%; background-color: var(--md-sys-color-background, #111318); border: 1px solid var(--md-sys-color-outline, #43474e);
      border-radius: 12px; padding: 12px 14px; color: var(--md-sys-color-on-surface, #e2e2e6); font-size: 14px; font-family: inherit; outline: none;
    }
    .oe-acct-field textarea { resize: vertical; min-height: 60px; }
    .oe-acct-field input[type="text"]:focus, .oe-acct-field textarea:focus { border-color: var(--md-sys-color-primary, #a8c7fa); }
    .oe-acct-handle-status { font-size: 12px; margin-top: 6px; min-height: 14px; }
    .oe-acct-handle-status.ok { color: var(--md-sys-color-success, #a6d9a8); }
    .oe-acct-handle-status.bad { color: var(--md-sys-color-error, #ffb4ab); }
    .oe-acct-actions { display: flex; justify-content: space-between; gap: 12px; }
    .oe-acct-btn {
      display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; padding: 10px 18px;
      border-radius: 100px; border: 1px solid var(--md-sys-color-outline, #43474e); background: transparent;
      color: var(--md-sys-color-on-surface, #e2e2e6); cursor: pointer; font-family: inherit;
    }
    .oe-acct-btn:hover { background-color: rgba(255,255,255,0.06); }
    .oe-acct-btn.primary { background-color: var(--md-sys-color-primary, #a8c7fa); color: var(--md-sys-color-on-primary, #062e6f); border-color: transparent; }
    .oe-acct-btn.primary:hover { opacity: 0.9; }
    .oe-acct-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .oe-acct-btn.danger { color: var(--md-sys-color-error, #ffb4ab); border-color: var(--md-sys-color-error, #ffb4ab); }

    .oe-acct-toast {
      position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%) translateY(20px); background-color: #303034;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); border-radius: 16px; padding: 14px 24px; font-family: 'Google Sans', 'Product Sans', sans-serif;
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
    <h3>Edit profile</h3>
    <div class="oe-acct-avatar-row">
      <img id="oeAcctAvatarPreview" src="" alt="">
      <label>
        <span class="material-symbols-rounded" style="font-size:16px;">photo_camera</span> Change photo
        <input type="file" accept="image/*" id="oeAcctPhotoInput">
      </label>
    </div>
    <div class="oe-acct-field">
      <label>Display name</label>
      <input type="text" id="oeAcctNameInput" maxlength="40">
    </div>
    <div class="oe-acct-field">
      <label>Username</label>
      <input type="text" id="oeAcctHandleInput" maxlength="20" placeholder="lowercase, no spaces">
      <div class="oe-acct-handle-status" id="oeAcctHandleStatus"></div>
    </div>
    <div class="oe-acct-field">
      <label>Bio</label>
      <textarea id="oeAcctBioInput" maxlength="200" rows="3" placeholder="Say something about yourself…"></textarea>
    </div>
    <div class="oe-acct-actions">
      <button type="button" class="oe-acct-btn danger" id="oeAcctCancel">Cancel</button>
      <button type="button" class="oe-acct-btn primary" id="oeAcctSave"><span class="material-symbols-rounded" style="font-size:16px;">check</span> Save</button>
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
    if (f.size > MAX_IMAGE_BYTES) { showToast(`Image must be under ${Math.round(MAX_IMAGE_BYTES/1024/1024)}MB`); return; }
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
    handleStatus.textContent = 'Checking…';
    handleStatus.className = 'oe-acct-handle-status';
    handleCheckTimer = setTimeout(async () => {
      const available = await isHandleAvailable(value);
      if (handleInput.value !== value) return; // stale, they've kept typing
      handleStatus.textContent = available ? 'Available' : 'Already taken';
      handleStatus.className = 'oe-acct-handle-status ' + (available ? 'ok' : 'bad');
    }, 400);
  };

  saveBtn.onclick = async () => {
    const newHandle = handleInput.value.trim().toLowerCase();
    if (newHandle && newHandle !== currentHandle && !isValidHandle(newHandle)) {
      showToast('Fix your username before saving');
      return;
    }
    saveBtn.disabled = true;
    try {
      await updateProfile({ displayName: nameInput.value, photoFile: pendingFile, bio: bioInput.value });
      if (newHandle && newHandle !== currentHandle) {
        try { await changeHandle(newHandle); }
        catch (err) { showToast('Profile saved, but username change failed: ' + err.message); saveBtn.disabled = false; return; }
      }
      closeModal();
      showToast('Profile updated');
    } catch (err) {
      showToast('Could not update profile: ' + err.message);
    } finally {
      saveBtn.disabled = false;
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
            ? `<a href="/profile.html?u=${encodeURIComponent(handle)}" class="oe-acct-profile-link" title="View profile">${profileInner}</a>`
            : `<span class="oe-acct-profile-link">${profileInner}</span>`}
          <button class="oe-acct-icon-btn" id="oeAcctEditBtn" title="Edit profile"><span class="material-symbols-rounded">edit</span></button>
        </div>
      `;
      container.querySelector('#oeAcctEditBtn').addEventListener('click', openEditProfileModal);
    } else {
      container.innerHTML = `<button class="oe-acct-signin" id="oeAcctSignInBtn"><span class="material-symbols-rounded" style="font-size:18px;">login</span> Sign in</button>`;
      container.querySelector('#oeAcctSignInBtn').addEventListener('click', () => {
        signIn().catch(err => showToast('Sign-in failed: ' + err.message));
      });
    }
  }

  onAccountChange(render);
}
