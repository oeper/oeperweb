/* one — cloud saving to the user's oeper.dev account (only in the build served from oeper.dev/one).
   Off by default. When on and signed in, every document is mirrored to fs.oeper.dev (forum-server/one-sync.js)
   under oneWord/, oneSheet/, oneSlide/, oneIdea/ and onePDF/, which is also where oeper.dev/files shows them.
   The browser copy stays the working copy; sync is last-writer-wins on each document's own "updated" time. */
import { onAccountChange, getCurrentUser, signIn, signOutUser, SERVER_ENDPOINT, ensureProfileLoaded, getProfile, handleOf } from '/shared/account.js?v=36';

const store = ONE.store, el = ONE.el, icon = ONE.icon, esc = ONE.esc;
const SETTINGS = 'one-cloud', STATE = 'one-cloud-state';
const LOCAL = {
  word: { lib:'ow-lib', doc:'ow-doc-', meta:d => ({ title:d.title, updated:d.updated, words:(String(d.html || '').replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length }) },
  sheet: { lib:'os-lib', doc:'os-doc-', meta:d => ({ title:d.title, updated:d.updated, sheets:(d.sheets || []).length || 1 }) },
  slide: { lib:'op-lib', doc:'op-doc-', meta:d => ({ title:d.title, updated:d.updated, slides:(d.slides || []).length, theme:d.theme }) },
  idea: { lib:'oi-lib', doc:'oi-doc-', meta:d => ({ title:d.title, updated:d.updated, sections:(d.sections || []).length, pages:(d.sections || []).reduce((a, s) => a + (s.pages || []).length, 0), color:d.color }) },
};
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const settings = () => store.get(SETTINGS, { enabled:false });
let user = null, status = { state:'off', at:0, error:'' }, running = null, again = false;
const listeners = new Set();
const setStatus = s => { status = Object.assign({}, status, s); listeners.forEach(f => { try { f(status); } catch {} }); };

async function api(path, opt = {}) {
  const u = getCurrentUser(); if (!u) throw new Error('Signed out');
  const token = await u.getIdToken();
  const r = await fetch(SERVER_ENDPOINT + path, Object.assign({}, opt, { headers:Object.assign({ Authorization:'Bearer ' + token }, opt.headers || {}) }));
  return r;
}
const jsonOr = async r => { try { return await r.json(); } catch { return {}; } };

/* ---------- local stores ---------- */
function localDocs(app) {
  const L = LOCAL[app], lib = store.get(L.lib, { docs:{} }), ids = new Set(Object.keys(lib.docs || {}));
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(L.doc)) ids.add(k.slice(L.doc.length)); }
  const out = {};
  ids.forEach(id => { if (localStorage.getItem(L.doc + id) === null) return; const m = (lib.docs || {})[id]; out[id] = { updated:m && m.updated || 0, title:m && m.title }; });
  return out;
}
function readDoc(app, id) { return store.get(LOCAL[app].doc + id); }
function writeDoc(app, id, d) {
  const L = LOCAL[app];
  if (!store.set(L.doc + id, d)) throw new Error('This browser’s storage is full');
  const lib = store.get(L.lib, { current:null, docs:{} }); lib.docs = lib.docs || {}; lib.docs[id] = L.meta(d); store.set(L.lib, lib);
}
function removeDoc(app, id) {
  const L = LOCAL[app]; store.del(L.doc + id);
  const lib = store.get(L.lib, { current:null, docs:{} }); if (lib.docs) delete lib.docs[id]; if (lib.current === id) lib.current = null; store.set(L.lib, lib);
}
// A document open in a running app keeps its in-memory copy and would overwrite whatever we write under it.
const isOpen = (app, id) => { const f = window.ONE_SHELL_API && window.ONE_SHELL_API.frameLoaded(app); return !!f && store.get(LOCAL[app].lib, {}).current === id; };

function pdfDB() {
  return new Promise(ok => { try {
    const r = indexedDB.open('PdfToolsViewerDB'); r.onerror = () => ok(null);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs', { keyPath:'id' }); };
    r.onsuccess = () => ok(r.result);
  } catch { ok(null); } });
}
const idb = (db, mode, fn) => new Promise((ok, bad) => { const tx = db.transaction('pdfs', mode), st = tx.objectStore('pdfs'); const req = fn(st); tx.oncomplete = () => ok(req && req.result); tx.onerror = () => bad(tx.error); });

/* ---------- sync ---------- */
async function syncApp(app, state) {
  const r = await api('/one-sync/' + app); if (!r.ok) throw new Error((await jsonOr(r)).error || 'Server said ' + r.status);
  const remote = Object.fromEntries(((await r.json()).docs || []).map(d => [d.id, d]));
  const local = localDocs(app);
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (!ID_RE.test(id)) continue;
    const key = app + ':' + id, L = local[id], R = remote[id], seen = state[key];
    if (L && R) {
      if (R.updated > L.updated) { if (!isOpen(app, id)) await download(app, id, state); }
      else if (L.updated > R.updated) await upload(app, id, state);
      else state[key] = L.updated;
    } else if (L) {
      if (seen != null) { if (!isOpen(app, id)) { removeDoc(app, id); delete state[key]; } }   // deleted in oeper.dev/files or on another device
      else await upload(app, id, state);
    } else if (R) {
      if (seen != null) { await api(`/one-sync/${app}/${id}`, { method:'DELETE' }); delete state[key]; } // deleted here
      else await download(app, id, state);
    }
  }
}
async function upload(app, id, state) {
  const d = readDoc(app, id); if (!d) return;
  const r = await api(`/one-sync/${app}/${id}`, { method:'PUT', headers:{ 'Content-Type':'application/octet-stream', 'X-One-Name':encodeURIComponent(d.title || 'Untitled'), 'X-One-Updated':String(d.updated || Date.now()) }, body:JSON.stringify(d) });
  if (r.status === 409) { if (!isOpen(app, id)) await download(app, id, state); return; }
  if (!r.ok) throw new Error((await jsonOr(r)).error || 'Upload failed (' + r.status + ')');
  state[app + ':' + id] = d.updated || 0;
}
async function download(app, id, state) {
  const r = await api(`/one-sync/${app}/${id}`); if (!r.ok) return;
  const d = JSON.parse(await r.text()); if (!d || typeof d !== 'object') return;
  d.id = id; writeDoc(app, id, d); state[app + ':' + id] = d.updated || 0;
}
async function syncPDFs(state) {
  const db = await pdfDB(); if (!db) return;
  try {
    const r = await api('/one-sync/pdf'); if (!r.ok) throw new Error((await jsonOr(r)).error || 'Server said ' + r.status);
    const remote = Object.fromEntries(((await r.json()).docs || []).map(d => [d.id, d]));
    const recs = (await idb(db, 'readonly', st => st.getAll())) || [];
    const local = Object.fromEntries(recs.map(x => [String(x.id), x]));
    for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      if (!ID_RE.test(id)) continue;
      const key = 'pdf:' + id, L = local[id], R = remote[id], seen = state[key];
      if (L && R) {
        if (R.updated > (L.ts || 0)) await pdfDown(db, id, R, state);
        else if ((L.ts || 0) > R.updated) await pdfUp(L, state);
        else state[key] = L.ts || 0;
      } else if (L) {
        if (seen != null) { await idb(db, 'readwrite', st => st.delete(L.id)); delete state[key]; }
        else await pdfUp(L, state);
      } else if (R) {
        if (seen != null) { await api('/one-sync/pdf/' + id, { method:'DELETE' }); delete state[key]; }
        else await pdfDown(db, id, R, state);
      }
    }
  } finally { db.close(); }
}
async function pdfUp(rec, state) {
  const id = String(rec.id), bytes = rec.data instanceof ArrayBuffer ? rec.data : rec.data && rec.data.buffer ? rec.data.buffer : null; if (!bytes) return;
  const r = await api('/one-sync/pdf/' + id, { method:'PUT', headers:{ 'Content-Type':'application/octet-stream', 'X-One-Name':encodeURIComponent(rec.name || 'Document'), 'X-One-Updated':String(rec.ts || Date.now()) }, body:bytes });
  if (r.status === 409) return;
  if (!r.ok) throw new Error((await jsonOr(r)).error || 'Upload failed (' + r.status + ')');
  await api(`/one-sync/pdf/${id}/extra`, { method:'PUT', headers:{ 'Content-Type':'text/plain' }, body:JSON.stringify(rec.annotations || {}) });
  state['pdf:' + id] = rec.ts || 0;
}
async function pdfDown(db, id, R, state) {
  const r = await api('/one-sync/pdf/' + id); if (!r.ok) return;
  const data = await r.arrayBuffer();
  let annotations = {}; try { const x = await (await api(`/one-sync/pdf/${id}/extra`)).json(); if (x.extra) annotations = JSON.parse(x.extra); } catch {}
  const rec = { id:/^\d+$/.test(id) ? Number(id) : id, name:String(R.name || 'Document').replace(/\.pdf$/i, ''), data, annotations, ts:R.updated };
  await idb(db, 'readwrite', st => st.put(rec));
  state['pdf:' + id] = R.updated;
}

async function syncAll() {
  if (!settings().enabled || !getCurrentUser()) return;
  if (running) { again = true; return running; }
  setStatus({ state:'syncing', error:'' });
  running = (async () => {
    const state = store.get(STATE, {});
    try {
      for (const app of Object.keys(LOCAL)) await syncApp(app, state);
      await syncPDFs(state);
      store.set(STATE, state); setStatus({ state:'synced', at:Date.now() });
    } catch (err) { store.set(STATE, state); setStatus({ state:'error', error:err.message || String(err) }); }
    running = null;
    window.ONE_SHELL_API && window.ONE_SHELL_API.refresh();
    if (again) { again = false; syncAll(); }
  })();
  return running;
}

/* ---------- when to sync ---------- */
let t; const soon = (ms = 2500) => { clearTimeout(t); t = setTimeout(syncAll, ms); };
addEventListener('storage', e => { if (e.key && /^(ow|os|op|oi)-(doc|lib)/.test(e.key)) soon(); });
addEventListener('focus', () => soon(300));
document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(300); });
setInterval(() => soon(0), 60000); // also picks up onePDF saves, which IndexedDB doesn't announce

let resolveReady; const ready = new Promise(r => resolveReady = r);
// The account as the apps show it: oeper.dev profile name/photo (falls back to the Google ones).
let acct = null; const acctListeners = new Set();
async function loadAccount(u) {
  if (!u) return null;
  try { await ensureProfileLoaded(u.email); } catch {}
  const p = getProfile(u.email, u.displayName, u.photoURL), h = handleOf(u.email);
  return { email:u.email, name:p.name, photo:p.photo, profileUrl:h ? '/profile?u=' + encodeURIComponent(h) : '/profile' };
}
onAccountChange(async u => {
  acct = await loadAccount(u);
  acctListeners.forEach(f => { try { f(acct); } catch { acctListeners.delete(f); } });
})
onAccountChange(async u => {
  user = u;
  if (!u) setStatus({ state:settings().enabled ? 'signedout' : 'off' });
  else if (!settings().enabled) setStatus({ state:'off' });
  else await syncAll();
  resolveReady(); renderChip();
});
setTimeout(() => resolveReady(), 8000); // never hold "open from oeper.dev/files" hostage to a slow sign-in check

/* ---------- UI: status chip + Settings ---------- */
const chip = el('button', { class:'cloudchip', id:'cloudChip', type:'button', onclick:() => openSettings() });
function renderChip() {
  const s = settings(), st = status.state;
  const [ic, text] = !s.enabled ? ['cloud_off', 'Only in this browser'] : !user ? ['person', 'Sign in to save to oeper.dev'] :
    st === 'syncing' ? ['sync', 'Saving to oeper.dev…'] : st === 'error' ? ['cloud_alert', 'Couldn’t reach oeper.dev'] : ['cloud_done', 'Saved to oeper.dev'];
  chip.className = 'cloudchip ' + (s.enabled && user ? st : 'off');
  chip.innerHTML = `${icon(ic)}<span>${esc(text)}</span>`;
  chip.title = st === 'error' ? status.error : status.at ? 'Last synced ' + new Date(status.at).toLocaleTimeString() : '';
}
listeners.add(renderChip);
function openSettings() {
  const s = settings(), u = getCurrentUser();
  const sw = ONE.check('Save my files to my oeper.dev account', s.enabled);
  const acct = el('div', { class:'acct' });
  const drawAcct = () => { const cu = getCurrentUser(); acct.innerHTML = '';
    if (cu) acct.append(el('span', { html:`${icon('account_circle')}Signed in as <b>${esc(cu.email || cu.displayName || 'you')}</b>` }), el('button', { class:'btn text', text:'Sign out', onclick:async () => { await signOutUser(); drawAcct(); renderChip(); } }));
    else acct.append(el('span', { html:`${icon('account_circle')}Not signed in` }), el('button', { class:'btn tonal', text:'Sign in', onclick:async () => { try { await signIn(); } catch (e) { ONE.toast('Sign-in didn’t finish.'); } drawAcct(); } }));
  };
  drawAcct();
  const body = el('div', { class:'dlg-col cloudset' },
    el('p', { class:'muted', html:'Keeps a copy of your documents in your oeper.dev account so they’re on every device you sign in on. They appear in <a href="/files" target="_blank" rel="noopener">oeper.dev/files</a>, in the <b>oneWord</b>, <b>oneSheet</b>, <b>oneSlide</b>, <b>oneIdea</b> and <b>onePDF</b> folders, and count toward your storage there.' }),
    sw.wrap, acct,
    el('p', { class:'muted small', text:'Deleting a document here also deletes it from your account (and the other way round). Turning this off stops syncing but keeps both copies.' }));
  ONE.modal({ title:'Settings', icon:'settings', width:520, body, actions:[
    s.enabled && u ? { label:'Sync now', on:() => { syncAll(); return false; } } : null,
    { label:'Done', kind:'filled', on:async () => {
      const on = sw.input.checked; store.set(SETTINGS, { enabled:on });
      if (on && !getCurrentUser()) { try { await signIn(); } catch { ONE.toast('Sign in to your oeper.dev account to turn on cloud saving.'); } }
      if (!on) setStatus({ state:'off' }); else if (getCurrentUser()) { ONE.toast('Cloud saving is on. Your files are being copied to oeper.dev.'); syncAll(); }
      renderChip();
    } }].filter(Boolean) });
}

window.ONE_CLOUD = { ready, syncAll, openSettings, enabled:() => settings().enabled, isSynced:(app, id) => app + ':' + id in store.get(STATE, {}),
  account:() => acct,
  onAccount:cb => { acctListeners.add(cb); cb(acct); return () => acctListeners.delete(cb); },
  signIn:async () => { try { await signIn(); } catch { ONE.toast('Sign-in didn’t finish.'); } },
  signOut:async () => { await signOutUser(); },
};
ONE.mountAvatar(document.getElementById('avatarSlot')); window.ONE_CLOUD.onAccount(() => ONE.renderAvatars());
const slot = document.getElementById('cloudSlot'); if (slot) slot.append(chip);
const gear = document.getElementById('settingsBtn'); if (gear) { gear.hidden = false; gear.onclick = openSettings; }
renderChip();
