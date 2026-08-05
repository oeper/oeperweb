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
export const SERVER_ENDPOINT = 'https://myserverfiles.oeper.dev';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Accounts allowed to manage the site: forum moderation (ban/delete anywhere)
// and admin.html's content editor + file upload tool. Add more emails here
// any time — everywhere that checks ownership imports this same list.
export const OWNER_EMAILS = ['sanhackerman@gmail.com', 'taejiding@gmail.com'];
export function isOwnerEmail(email) { return OWNER_EMAILS.includes(email); }

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

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
export function getProfile(email, fallbackName, fallbackPhoto) {
  const override = email && profileCache[email];
  return {
    name: (override && override.displayName) || fallbackName || email || 'anon',
    photo: (override && override.photoURL) || fallbackPhoto || '',
  };
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) await ensureProfileLoaded(user.email);
  authReady = true;
  notify();
});

export function signIn() {
  return signInWithPopup(auth, provider);
}
export function signOutUser() {
  return signOut(auth);
}

export async function uploadFile(file) {
  if (!file) return null;
  if (!SERVER_ENDPOINT) throw new Error('Image uploads are not set up yet');
  if (!currentUser) throw new Error('Sign in first');
  const idToken = await currentUser.getIdToken();
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(SERVER_ENDPOINT + '/upload', {
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

export async function updateProfile({ displayName, photoFile }) {
  if (!currentUser) throw new Error('Sign in first');
  const patch = { updatedAt: serverTimestamp() };
  const trimmedName = (displayName || '').trim().slice(0, 40);
  patch.displayName = trimmedName || currentUser.displayName || currentUser.email;
  if (photoFile) {
    patch.photoURL = await uploadFile(photoFile);
  }
  await setDoc(doc(db, 'users', currentUser.email), patch, { merge: true });
  profileCache[currentUser.email] = { ...(profileCache[currentUser.email] || {}), ...patch };
  notify();
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
    .oe-acct-chip img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant, #2f353d); }
    .oe-acct-chip .oe-acct-name { font-size: 13px; color: var(--md-sys-color-on-surface-variant, #c4c7c5); font-family: 'Google Sans', 'Product Sans', sans-serif; }
    .oe-acct-chip button {
      background: none; border: 1px solid var(--md-sys-color-outline, #43474e); color: var(--md-sys-color-on-surface-variant, #c4c7c5);
      border-radius: 100px; padding: 6px 14px; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .oe-acct-chip button:hover { color: var(--md-sys-color-on-surface, #e2e2e6); }
    .oe-acct-chip .oe-acct-icon-btn { padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .oe-acct-chip .oe-acct-icon-btn .material-symbols-rounded { font-size: 14px; }

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
    .oe-acct-field input[type="text"] {
      width: 100%; background-color: var(--md-sys-color-background, #111318); border: 1px solid var(--md-sys-color-outline, #43474e);
      border-radius: 12px; padding: 12px 14px; color: var(--md-sys-color-on-surface, #e2e2e6); font-size: 14px; font-family: inherit; outline: none;
    }
    .oe-acct-field input[type="text"]:focus { border-color: var(--md-sys-color-primary, #a8c7fa); }
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

function openEditProfileModal() {
  if (!currentUser) return;
  const { overlay, modal } = ensureModal();
  const profile = getProfile(currentUser.email, currentUser.displayName, currentUser.photoURL);
  const avatarPreview = modal.querySelector('#oeAcctAvatarPreview');
  const nameInput = modal.querySelector('#oeAcctNameInput');
  const photoInput = modal.querySelector('#oeAcctPhotoInput');
  const saveBtn = modal.querySelector('#oeAcctSave');

  avatarPreview.src = profile.photo || '';
  nameInput.value = profile.name || '';
  photoInput.value = '';
  let pendingFile = null;

  photoInput.onchange = () => {
    const f = photoInput.files[0];
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) { showToast(`Image must be under ${Math.round(MAX_IMAGE_BYTES/1024/1024)}MB`); return; }
    pendingFile = f;
    avatarPreview.src = URL.createObjectURL(f);
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      await updateProfile({ displayName: nameInput.value, photoFile: pendingFile });
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
      container.innerHTML = `
        <div class="oe-acct-chip">
          <img src="${profile.photo || ''}" alt="">
          <span class="oe-acct-name">${escHtml(profile.name)}</span>
          <button class="oe-acct-icon-btn" id="oeAcctEditBtn" title="Edit profile"><span class="material-symbols-rounded">edit</span></button>
          <button id="oeAcctSignOutBtn">Sign out</button>
        </div>
      `;
      container.querySelector('#oeAcctEditBtn').addEventListener('click', openEditProfileModal);
      container.querySelector('#oeAcctSignOutBtn').addEventListener('click', () => signOutUser());
    } else {
      container.innerHTML = `<button class="oe-acct-signin" id="oeAcctSignInBtn"><span class="material-symbols-rounded" style="font-size:18px;">login</span> Sign in</button>`;
      container.querySelector('#oeAcctSignInBtn').addEventListener('click', () => {
        signIn().catch(err => showToast('Sign-in failed: ' + err.message));
      });
    }
  }

  onAccountChange(render);
}
