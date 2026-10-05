// Keeps a signed-in person's settings the same on every device they use.
//
// The preferences below live in localStorage on each browser. While this is on, a change made on one device is
// copied to the account (Firestore userSettings/{email}) and applied on the others — live if a page is open,
// otherwise the next time it loads. Each setting carries the time it last changed, so the newest change wins
// and a device that was offline can't overwrite a newer change made elsewhere.
//
// Only plain preferences are listed. The custom AI provider and MCP servers hold API keys and stay on the
// device, and so do chat histories and documents.
//
// The switch itself (oe-sync-settings) is per device and on by default. Imported once, by topnav.js, so every
// page of the site gets it. Bump its ?v=N in topnav.js when this file changes.
import { db, onAccountChange } from './account.js?v=37';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const SYNCED_KEYS = [
  'oe-theme', 'oe-theme-flip', 'oe-ai-features', 'oe-search-engine',
  'oe-files-view', 'oe-files-sort', 'oe-files-sort-dir', 'oePlayerVolume', 'oe-pinned-chats',
];
const FLAG = 'oe-sync-settings';   // '0' = off, anything else = on
const TIMES = 'oe-sync-times';     // { key: ms } when each setting last changed on this device
const OWNER = 'oe-sync-owner';     // whose cloud copy the times above belong to
const THEME_KEYS = ['oe-theme', 'oe-theme-flip'];

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const readTimes = () => { try { return JSON.parse(ls.get(TIMES)) || {}; } catch { return {}; } };
const state = window.__oeSettingsSync = window.__oeSettingsSync || { patched: false, applying: false };

export function isSyncEnabled() { return ls.get(FLAG) !== '0'; }

let user = null, unsub = null, timer = null, firstPull = true;
let remote = { values: {}, times: {} };   // the last copy seen in the cloud
const listeners = new Set();
let status = 'off';                        // off | signed-out | syncing | synced | error
function setStatus(s) { status = s; listeners.forEach(cb => { try { cb(s); } catch {} }); }
export function onSyncStatus(cb) { listeners.add(cb); cb(status); return () => listeners.delete(cb); }

export function setSyncEnabled(on) {
  if (on) ls.del(FLAG); else ls.set(FLAG, '0');
  if (on) start(); else stop();
}

function markLocal(key) {
  const t = readTimes(); t[key] = Date.now(); ls.set(TIMES, JSON.stringify(t));
  schedulePush();
}

// Watch writes to the listed keys, wherever on the site they come from.
function patchStorage() {
  if (state.patched) return;
  state.patched = true;
  const set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    set.call(this, k, v);
    if (this === window.localStorage && !state.applying && SYNCED_KEYS.includes(k)) markLocal(k);
  };
  Storage.prototype.removeItem = function (k) {
    del.call(this, k);
    if (this === window.localStorage && !state.applying && SYNCED_KEYS.includes(k)) markLocal(k);
  };
}

function schedulePush() {
  if (!user || !isSyncEnabled()) return;
  clearTimeout(timer);
  timer = setTimeout(push, 800);
}

async function push() {
  if (!user || !isSyncEnabled()) return;
  const times = readTimes(), values = {}, outTimes = {};
  SYNCED_KEYS.forEach(k => {
    if ((times[k] || 0) > (remote.times[k] || 0)) { const v = ls.get(k); values[k] = v === null ? null : v; outTimes[k] = times[k]; }
  });
  if (!Object.keys(outTimes).length) return;
  try {
    await setDoc(doc(db, 'userSettings', user.email), { values, times: outTimes, updatedAt: serverTimestamp() }, { merge: true });
    Object.assign(remote.values, values); Object.assign(remote.times, outTimes);
    setStatus('synced');
  } catch (e) { console.warn('settings sync: could not save', e); setStatus('error'); }
}

// Take whatever the cloud copy has that is newer than this device's, and send anything this device has that is newer.
function reconcile(data) {
  remote = { values: (data && data.values) || {}, times: (data && data.times) || {} };
  const times = readTimes(), changed = [];
  let needPush = false;
  SYNCED_KEYS.forEach(k => {
    const rt = remote.times[k] || 0, lt = times[k] || 0;
    if (rt > lt) {
      const v = remote.values[k];
      if ((ls.get(k) ?? null) !== (v ?? null)) {
        state.applying = true;
        try { if (v == null) ls.del(k); else ls.set(k, String(v)); } finally { state.applying = false; }
        changed.push(k);
      }
      times[k] = rt;
    } else if (lt > rt) needPush = true;
    else if (!rt && ls.get(k) !== null) { times[k] = Date.now(); needPush = true; }   // a value from before syncing existed
  });
  ls.set(TIMES, JSON.stringify(times));
  if (changed.length) applyChanges(changed);
  if (needPush) schedulePush();
  setStatus('synced');
}

function applyChanges(changed) {
  if (changed.some(k => THEME_KEYS.includes(k)) && typeof window.applyOeTheme === 'function') {
    try { window.applyOeTheme(ls.get('oe-theme') || 'material-dark', ls.get('oe-theme-flip') === '1'); } catch {}
  }
  if (changed.includes('oe-ai-features')) window.dispatchEvent(new CustomEvent('oe-ai-features', { detail: ls.get('oe-ai-features') === '1' }));
  window.dispatchEvent(new CustomEvent('oe-settings-synced', { detail: changed }));
  // Pages read most of these once when they load. On the first pull after load, reload once so they show the
  // synced values (the guard stops it ever looping); later changes arrive while the page is open and don't reload.
  const needsReload = firstPull && changed.some(k => !THEME_KEYS.includes(k) && k !== 'oe-ai-features');
  if (needsReload) {
    const last = Number(sessionStorage.getItem('oe-sync-reloaded') || 0);
    if (Date.now() - last > 15000) { sessionStorage.setItem('oe-sync-reloaded', String(Date.now())); location.reload(); }
  }
}

function start() {
  stop(true);
  if (!isSyncEnabled()) return setStatus('off');
  if (!user) return setStatus('signed-out');
  // another account on this browser: its change times mean nothing here, so the cloud copy wins where it has a value
  if (ls.get(OWNER) !== user.email) { ls.set(OWNER, user.email); ls.del(TIMES); }
  setStatus('syncing'); firstPull = true;
  unsub = onSnapshot(doc(db, 'userSettings', user.email), snap => {
    if (snap.metadata.hasPendingWrites) return;
    reconcile(snap.exists() ? snap.data() : null);
    firstPull = false;
  }, e => { console.warn('settings sync: could not read', e); setStatus('error'); });
}

function stop(quiet) {
  if (unsub) { unsub(); unsub = null; }
  clearTimeout(timer);
  if (!quiet) setStatus(user ? 'off' : 'signed-out');
}

patchStorage();
onAccountChange(u => { user = u && u.email ? u : null; start(); });
