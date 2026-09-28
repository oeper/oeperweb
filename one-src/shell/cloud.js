/* one — cloud saving to the user's oeper.dev account (only in the build served from oeper.dev/one).
   Off by default. When on and signed in, every document is mirrored to fs.oeper.dev (forum-server/one-sync.js)
   under oneWord/, oneSheet/, oneSlide/, oneIdea/ and onePDF/, which is also where oeper.dev/files shows them.
   The browser copy stays the working copy; sync is last-writer-wins on each document's own "updated" time. */
import { onAccountChange, getCurrentUser, signIn, signOutUser, SERVER_ENDPOINT, ensureProfileLoaded, getProfile, handleOf, uploadFile, db } from '/shared/account.js?v=36';
import { collection, addDoc, serverTimestamp, doc, setDoc, getDoc, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
document.documentElement.classList.add('cloud'); // shows the Share buttons (they don't exist in the standalone build)

const store = ONE.store, el = ONE.el, icon = ONE.icon, esc = ONE.esc;
const SETTINGS = 'one-cloud', STATE = 'one-cloud-state';
const LOCAL = {
  word: { lib:'ow-lib', doc:'ow-doc-', meta:d => ({ title:d.title, updated:d.updated, words:(String(d.html || '').replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length }) },
  sheet: { lib:'os-lib', doc:'os-doc-', meta:d => ({ title:d.title, updated:d.updated, sheets:(d.sheets || []).length || 1 }) },
  slide: { lib:'op-lib', doc:'op-doc-', meta:d => ({ title:d.title, updated:d.updated, slides:(d.slides || []).length, theme:d.theme }) },
  site: { lib:'ob-lib', doc:'ob-doc-', meta:d => ({ title:d.title, updated:d.updated, pages:(d.pages || []).length, palette:d.theme && d.theme.palette }) },
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
  const r = await api('/one-sync/' + app);
  if (r.status === 404) return; // a server that hasn't been updated for this app yet: skip it, keep syncing the rest
  if (!r.ok) throw new Error((await jsonOr(r)).error || 'Server said ' + r.status);
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

/* ---------- open ONE document from the account (links from oeper.dev/files) ----------
   Works whether or not cloud saving is turned on: opening a file from your account is an explicit ask,
   so fetch just that document into this browser instead of requiring "Save my files to my account". */
const localHas = (app, id) => app === 'pdf' ? null : localStorage.getItem(LOCAL[app].doc + id) !== null;
async function fetchOne(app, id) {
  if (!ID_RE.test(id) || !(app === 'pdf' || LOCAL[app])) return false;
  if (!getCurrentUser()) { try { await signIn(); } catch {} }
  if (!getCurrentUser()) { ONE.toast('Sign in to open files from your oeper.dev account.'); return false; }
  const state = store.get(STATE, {});
  try {
    if (app === 'pdf') {
      const db = await pdfDB(); if (!db) return false;
      try {
        const r = await api('/one-sync/pdf'); if (!r.ok) throw new Error((await jsonOr(r)).error || 'Server said ' + r.status);
        const R = ((await r.json()).docs || []).find(d => String(d.id) === id); if (!R) return false;
        await pdfDown(db, id, R, state);
      } finally { db.close(); }
    } else {
      await download(app, id, state);
      if (!localHas(app, id)) return false;
    }
    store.set(STATE, state);
    return true;
  } catch (err) { ONE.toast('Couldn’t open that file: ' + (err.message || err)); return false; }
}

/* ---------- sharing: apps (a link) and files (a public copy), to anyone or to the oeper.dev feed ----------
   A shared FILE is a snapshot uploaded to the sharer's oeper.dev files (public by its unguessable URL, like any
   file shared from there). The link  /one#shared=<app>:<file url>  lets anyone open their OWN COPY of it — the
   sharer's original is never touched. Incoming documents are sanitised before they're saved (see cleanDeep). */
const SHARE_BASE = 'https://oeper.dev/one';
const slug = s => String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
const HTML_RE = /<\/?[a-z][a-z0-9-]*[\s>/]/i;
const BAD_TAGS = 'script,iframe,frame,frameset,object,embed,applet,link,meta,base,form';
const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'poster', 'background'];
function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: nothing in it runs
  doc.querySelectorAll(BAD_TAGS).forEach(n => n.remove());
  doc.querySelectorAll('*').forEach(n => {
    for (const a of [...n.attributes]) {
      const name = a.name.toLowerCase(), v = a.value.replace(/[\u0000-\u0020]/g, '').toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') n.removeAttribute(a.name);
      else if (URL_ATTRS.includes(name) && (/^(javascript|vbscript):/.test(v) || (/^data:/.test(v) && !/^data:image\/(png|jpe?g|gif|webp|avif|bmp)[;,]/.test(v)))) n.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}
// Every string that looks like HTML anywhere in the document gets cleaned; everything else is copied as-is.
function cleanDeep(x) {
  if (typeof x === 'string') return HTML_RE.test(x) ? cleanHtml(x) : x;
  if (Array.isArray(x)) return x.map(cleanDeep);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue; o[k] = cleanDeep(x[k]); } return o; }
  return x;
}
async function snapshot(app, id, title) {
  if (app === 'pdf') {
    const db = await pdfDB(); if (!db) throw new Error('PDF storage isn’t available in this browser');
    try {
      const rec = await idb(db, 'readonly', st => st.get(/^\d+$/.test(id) ? Number(id) : id));
      if (!rec || !rec.data) throw new Error('That PDF couldn’t be found');
      return new File([rec.data instanceof ArrayBuffer ? rec.data : rec.data.buffer], slug(title) + '.pdf', { type:'application/pdf' });
    } finally { db.close(); }
  }
  const d = readDoc(app, id); if (!d) throw new Error('That document couldn’t be found');
  const copy = Object.assign({}, d); delete copy.versions;
  return new File([JSON.stringify({ one:1, app, doc:copy })], slug(title) + '.one-' + app + '.json', { type:'application/json' });
}
const excerptOf = (app, id) => {
  if (app !== 'word') return '';
  const d = readDoc(app, id); if (!d || !d.html) return '';
  const t = (new DOMParser().parseFromString(String(d.html), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > 320 ? t.slice(0, 320).replace(/\s+\S*$/, '') + '…' : t;
};

async function share(t) {
  const isFile = t.kind === 'file';
  const appInfo = (ONE.APPS || []).find(a => a.id === t.app) || { name:t.app };
  const body = el('div', { class:'dlg-col sharebody' });
  const dlg = ONE.modal({ title:isFile ? 'Share “' + t.title + '”' : 'Share ' + appInfo.name, icon:'share', width:500, body, actions:[{ label:'Close' }] });
  let link = null;

  const showLink = () => {
    const box = ONE.input({ readonly:true, value:link });
    box.addEventListener('focus', () => box.select());
    const copy = async () => { try { await navigator.clipboard.writeText(link); } catch { box.select(); document.execCommand('copy'); } ONE.toast('Link copied.'); };
    const row = el('div', { class:'sharerow' },
      el('button', { class:'btn filled', html:icon('content_copy') + 'Copy link', onclick:copy }),
      navigator.share ? el('button', { class:'btn tonal', html:icon('ios_share') + 'Share…', onclick:() => navigator.share({ title:t.title, url:link }).catch(() => {}) }) : null,
      el('button', { class:'btn tonal', html:icon('forum') + 'Post to oeper.dev', onclick:showPost }));
    body.replaceChildren(
      el('p', { class:'muted', text:isFile
        ? 'Anyone with this link can open their own copy of this file. Your original stays private.'
        : 'Anyone with this link can open ' + appInfo.name + '.' }),
      box, row,
      isFile ? el('p', { class:'muted small', text:'A read-only copy was also saved to your oeper.dev files so the link keeps working.' }) : null);
  };

  const showPost = () => {
    const title = ONE.input({ value:isFile ? t.title : appInfo.name, maxlength:150 });
    const msg = el('textarea', { class:'tf', rows:4, maxlength:2000, placeholder:isFile ? 'Say something about it (optional)' : 'Say something about it (optional)' });
    const status = el('p', { class:'muted small' });
    const post = el('button', { class:'btn filled', html:icon('send') + 'Post', onclick:async () => {
      const name = title.value.trim(); if (!name) return title.focus();
      post.disabled = true; status.textContent = 'Posting…';
      try {
        if (!getCurrentUser()) await signIn();
        const u = getCurrentUser(); if (!u) throw new Error('Sign in to post');
        const ex = isFile ? excerptOf(t.app, t.id) : '';
        const text = [msg.value.trim(), ex ? '> ' + ex : '', '[[' + (isFile ? 'Open a copy in one' : 'Open ' + appInfo.name) + ']](' + link + ')'].filter(Boolean).join('\n\n');
        await addDoc(collection(db, 'posts'), {
          title:name.slice(0, 150), body:text.slice(0, 8000), tags:['showcase'], imageUrls:[],
          authorEmail:u.email, authorName:u.displayName || u.email, authorPhoto:u.photoURL || '',
          upvoters:[], downvoters:[], commentCount:0, createdAt:serverTimestamp(),
        });
        dlg.close(); ONE.toast('Posted to the oeper.dev feed.');
      } catch (err) { post.disabled = false; status.textContent = 'Couldn’t post: ' + (err.message || err); }
    } });
    body.replaceChildren(
      el('p', { class:'muted', text:'Posts to the oeper.dev feed with a button that opens ' + (isFile ? 'a copy of the file' : appInfo.name) + '.' }),
      ONE.field('Title', title), ONE.field('Message', msg), status,
      el('div', { class:'sharerow' }, el('button', { class:'btn text', html:icon('arrow_back') + 'Back', onclick:showLink }), post));
    setTimeout(() => title.focus(), 30);
  };

  if (!isFile) { link = SHARE_BASE + '#' + t.app; return showLink(); }
  try {
    if (!getCurrentUser()) { try { await signIn(); } catch {} }
    if (!getCurrentUser()) { body.replaceChildren(el('p', { class:'muted', text:'Sign in to your oeper.dev account to share files.' })); return; }
    body.replaceChildren(el('p', { class:'muted', text:'Making a shareable copy…' }));
    const file = await snapshot(t.app, t.id, t.title);
    const url = await uploadFile(file, '/upload-file', undefined, undefined, 'Sharing ' + t.title);
    if (!url) throw new Error('The upload didn’t return a link');
    link = SHARE_BASE + '#shared=' + t.app + ':' + encodeURIComponent(url);
    showLink();
  } catch (err) {
    if (err && err.cancelled) return dlg.close();
    body.replaceChildren(el('p', { class:'muted', text:'Couldn’t make a shareable copy: ' + (err.message || err) }));
  }
}

// Opens a shared link: fetch the public copy, ask, and save it here as the visitor's OWN document.
async function openShared(app, url) {
  if (!(app === 'pdf' || LOCAL[app])) { ONE.toast('That share link isn’t valid.'); return null; }
  if (!String(url).startsWith(SERVER_ENDPOINT + '/docs/')) { ONE.toast('That share link isn’t from oeper.dev.'); return null; }
  let title, save;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 451 ? 'This file is under review.' : 'It may have been removed.');
    if (app === 'pdf') {
      const bytes = await r.arrayBuffer(); if (bytes.byteLength > 40 * 1048576) throw new Error('It’s too large.');
      title = decodeURIComponent(String(url).split('/').pop() || 'document').replace(/^[a-z0-9]+-/, '').replace(/\.pdf$/i, '') || 'Document';
      save = async () => { const db = await pdfDB(); if (!db) throw new Error('PDF storage isn’t available in this browser'); const rec = { id:Date.now(), name:title, data:bytes, annotations:{}, ts:Date.now() }; try { await idb(db, 'readwrite', st => st.put(rec)); } finally { db.close(); } return String(rec.id); };
    } else {
      const text = await r.text(); if (text.length > 8 * 1048576) throw new Error('It’s too large.');
      const p = JSON.parse(text);
      if (!p || p.one !== 1 || p.app !== app || !p.doc || typeof p.doc !== 'object') throw new Error('That isn’t a shared one file.');
      const d = cleanDeep(p.doc); title = String(d.title || 'Shared document').slice(0, 120);
      save = async () => { d.id = ONE.uid(); d.title = title; d.updated = Date.now(); writeDoc(app, d.id, d); return d.id; };
    }
  } catch (err) { ONE.toast('Couldn’t open that shared file. ' + (err.message || '')); return null; }
  const appName = ((ONE.APPS || []).find(a => a.id === app) || {}).name || app;
  return new Promise(resolve => {
    ONE.modal({ title:'Open a shared file', icon:'download', width:460,
      body:el('div', { class:'dlg-col' }, el('p', { class:'muted', html:'Someone shared <b>' + esc(title) + '</b> (' + esc(appName) + ') with you. Opening it saves your own copy in this browser — changes you make don’t affect theirs.' })),
      onClose:() => resolve(null),
      actions:[{ label:'Cancel' }, { label:'Open a copy', kind:'filled', on:dlg => {
        // Keep the dialog open until the copy is saved (returning false), otherwise closing it reports "cancelled" first.
        save().then(id => resolve({ app, id }), err => { ONE.toast('Couldn’t save it: ' + (err.message || err)); resolve(null); }).then(() => dlg.close());
        return false;
      } }] });
  });
}

/* ---------- collaboration: multiple people editing the SAME document ----------
   Distinct from sharing above (which hands out an independent COPY). Once a document has
   at least one other collaborator, its content lives in Firestore's oneCollab collection
   (owner, collaborators[], content, updatedBy/updatedAt) as well as this browser's own
   copy, and every collaborator can read and write it. Sync is push-based (onSnapshot) and
   last-writer-wins on each write, same trust model as everything else here — there's no
   merge of concurrent edits. A document open in an app frame is never silently overwritten
   by an incoming remote change (same isOpen guard the local<->account sync above already
   uses) — the collaborator just gets a toast telling them to reopen it. */
const COLLAB_MAP = 'one-collab-map', COLLAB_CACHE = 'one-collab-cache';
const mapKey = (app, id) => app + ':' + id;
const collabDocKey = (app, id) => app + '_' + id;
const collabMap = () => store.get(COLLAB_MAP, {});
const collabCache = () => store.get(COLLAB_CACHE, {});
const isCollab = (app, id) => !!collabMap()[mapKey(app, id)];
const collabInfo = (app, id) => collabCache()[mapKey(app, id)] || null;
function markCollab(app, id) { const m = collabMap(); m[mapKey(app, id)] = true; store.set(COLLAB_MAP, m); }
function unmarkCollab(app, id) {
  const m = collabMap(); delete m[mapKey(app, id)]; store.set(COLLAB_MAP, m);
  const c = collabCache(); delete c[mapKey(app, id)]; store.set(COLLAB_CACHE, c);
}
function appAndIdFromDocKey(key) {
  for (const app of Object.keys(LOCAL)) { const p = LOCAL[app].doc; if (key.startsWith(p)) return { app, id:key.slice(p.length) }; }
  return null;
}

const collabUnsubs = new Map(), applyingRemote = new Set();
function stopWatchingCollab(app, id) {
  const mk = mapKey(app, id), u = collabUnsubs.get(mk);
  if (u) { u(); collabUnsubs.delete(mk); }
}
function watchCollabDoc(app, id) {
  const mk = mapKey(app, id); if (collabUnsubs.has(mk)) return;
  const unsub = onSnapshot(doc(db, 'oneCollab', collabDocKey(app, id)), snap => {
    if (!snap.exists()) { unmarkCollab(app, id); stopWatchingCollab(app, id); return; }
    const data = snap.data();
    if (!Array.isArray(data.collaborators) || !getCurrentUser() || !data.collaborators.includes(getCurrentUser().email)) {
      unmarkCollab(app, id); stopWatchingCollab(app, id); return; // removed as a collaborator elsewhere
    }
    const cache = collabCache();
    cache[mk] = { owner:data.owner, collaborators:data.collaborators, title:data.title };
    store.set(COLLAB_CACHE, cache);
    const me = getCurrentUser();
    if (data.updatedBy && data.updatedBy !== me.email && data.content) {
      if (isOpen(app, id)) {
        ONE.toast((data.updatedBy) + ' updated “' + (data.title || 'this document') + '”. Reopen it to see their changes.');
      } else {
        applyingRemote.add(mk);
        try { writeDoc(app, id, cleanDeep(Object.assign({}, data.content, { id }))); } finally { applyingRemote.delete(mk); }
      }
    }
    window.ONE_SHELL_API && window.ONE_SHELL_API.refresh();
  }, () => { unmarkCollab(app, id); stopWatchingCollab(app, id); });
  collabUnsubs.set(mk, unsub);
}
function watchAllCollab() { Object.keys(collabMap()).forEach(mk => { const i = mk.indexOf(':'); watchCollabDoc(mk.slice(0, i), mk.slice(i + 1)); }); }
function stopWatchingAllCollab() { collabUnsubs.forEach(u => u()); collabUnsubs.clear(); }

async function pushCollabUpdate(app, id) {
  const mk = mapKey(app, id); if (applyingRemote.has(mk) || !isCollab(app, id)) return;
  const me = getCurrentUser(); if (!me) return;
  const d = readDoc(app, id); if (!d) return;
  const copy = Object.assign({}, d); delete copy.versions;
  try {
    await setDoc(doc(db, 'oneCollab', collabDocKey(app, id)), { content:copy, title:d.title || 'Untitled', updatedBy:me.email, updatedAt:serverTimestamp() }, { merge:true });
  } catch {} // offline, or removed as a collaborator since the last snapshot — the local copy is still saved either way
}
const pushTimers = {};
function pushCollabSoon(app, id) { const mk = mapKey(app, id); clearTimeout(pushTimers[mk]); pushTimers[mk] = setTimeout(() => pushCollabUpdate(app, id), 1200); }

async function inviteCollaborator(t, email, redraw, input) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { ONE.toast('Enter a valid email address.'); return; }
  const me = getCurrentUser(); if (!me) return;
  if (email === me.email) { ONE.toast('That’s already you.'); return; }
  const ref = doc(db, 'oneCollab', collabDocKey(t.app, t.id));
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const d = readDoc(t.app, t.id); if (!d) throw new Error('That document couldn’t be found');
      const copy = Object.assign({}, d); delete copy.versions;
      await setDoc(ref, { app:t.app, docId:t.id, title:t.title, owner:me.email, collaborators:[me.email, email], content:copy, updatedBy:me.email, updatedAt:serverTimestamp() });
    } else {
      await setDoc(ref, { collaborators:arrayUnion(email), updatedBy:me.email, updatedAt:serverTimestamp() }, { merge:true });
    }
    markCollab(t.app, t.id); watchCollabDoc(t.app, t.id);
    if (input) input.value = '';
    ONE.toast('Invited ' + email + '.');
    redraw();
  } catch (err) { ONE.toast('Couldn’t invite them: ' + (err.message || err)); }
}
async function removeCollaborator(t, email, redraw) {
  const me = getCurrentUser(); if (!me) return;
  try {
    await setDoc(doc(db, 'oneCollab', collabDocKey(t.app, t.id)), { collaborators:arrayRemove(email), updatedBy:me.email, updatedAt:serverTimestamp() }, { merge:true });
    if (email === me.email) { unmarkCollab(t.app, t.id); stopWatchingCollab(t.app, t.id); ONE.toast('You left this shared document.'); return; }
    redraw();
  } catch (err) { ONE.toast('Couldn’t remove them: ' + (err.message || err)); }
}

async function collaborate(t) {
  if (!getCurrentUser()) { try { await signIn(); } catch {} }
  const me = getCurrentUser(); if (!me) { ONE.toast('Sign in to your oeper.dev account to collaborate on files.'); return; }
  const body = el('div', { class:'dlg-col collabbody' });
  ONE.modal({ title:'Collaborate on “' + t.title + '”', icon:'group', width:480, body, actions:[{ label:'Close' }] });
  const draw = async () => {
    body.replaceChildren(el('p', { class:'muted', text:'Loading…' }));
    let data = null;
    if (isCollab(t.app, t.id)) { try { const snap = await getDoc(doc(db, 'oneCollab', collabDocKey(t.app, t.id))); if (snap.exists()) data = snap.data(); } catch {} }
    const collaborators = data ? (data.collaborators || [me.email]) : [me.email];
    const owner = data ? data.owner : me.email;
    const list = el('div', { class:'colist' }, collaborators.map(em => el('div', { class:'corow' },
      el('span', { class:'ms', html:icon('account_circle') }),
      el('span', { class:'grow', text:em + (em === owner ? ' (owner)' : '') }),
      (em !== owner && (em === me.email || owner === me.email))
        ? el('button', { class:'btn text', text:em === me.email ? 'Leave' : 'Remove', onclick:() => removeCollaborator(t, em, draw) }) : null)));
    const input = ONE.input({ placeholder:'person@example.com', type:'email' });
    const invite = el('button', { class:'btn filled', html:icon('person_add') + 'Invite', onclick:() => inviteCollaborator(t, input.value, draw, input) });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); invite.click(); } });
    let linkRow = null;
    if (data) {
      const link = SHARE_BASE + '#collab=' + t.app + ':' + t.id, box = ONE.input({ readonly:true, value:link });
      box.addEventListener('focus', () => box.select());
      const copy = async () => { try { await navigator.clipboard.writeText(link); } catch { box.select(); document.execCommand('copy'); } ONE.toast('Link copied.'); };
      linkRow = el('div', {}, el('p', { class:'muted small', text:'Anyone you invite can open this link to start collaborating (they still need to be on the list above).' }), el('div', { class:'sharerow' }, box, el('button', { class:'btn tonal', html:icon('content_copy') + 'Copy link', onclick:copy })));
    }
    body.replaceChildren(
      el('p', { class:'muted', text:'Everyone below can open, edit and re-share this exact document — changes sync between you automatically while you’re both online. Editing stops updating live while you have it open; reopen it to catch up.' }),
      list, el('div', { class:'sharerow' }, input, invite), linkRow);
  };
  await draw();
}

async function openCollabLink(app, id) {
  if (!ID_RE.test(id) || !LOCAL[app]) { ONE.toast('That collaboration link isn’t valid.'); return null; }
  if (!getCurrentUser()) { try { await signIn(); } catch {} }
  const me = getCurrentUser(); if (!me) { ONE.toast('Sign in to your oeper.dev account to open a shared document.'); return null; }
  let snap;
  try { snap = await getDoc(doc(db, 'oneCollab', collabDocKey(app, id))); } catch (err) { ONE.toast('Couldn’t open that document: ' + (err.message || err)); return null; }
  if (!snap.exists()) { ONE.toast('That shared document doesn’t exist any more.'); return null; }
  const data = snap.data();
  if (!Array.isArray(data.collaborators) || !data.collaborators.includes(me.email)) { ONE.toast('You don’t have access to this document yet — ask ' + (data.owner || 'the owner') + ' to invite ' + me.email + '.'); return null; }
  const d = cleanDeep(Object.assign({}, data.content, { id, title:data.title || (data.content && data.content.title) || 'Shared document' }));
  writeDoc(app, id, d);
  markCollab(app, id); watchCollabDoc(app, id);
  ONE.toast('Opened “' + (d.title || 'shared document') + '” — you’re now a collaborator.');
  return { app, id };
}

/* ---------- when to sync ---------- */
let t; const soon = (ms = 2500) => { clearTimeout(t); t = setTimeout(syncAll, ms); };
addEventListener('storage', e => {
  if (!e.key) return;
  if (/^(ow|os|op|oi)-(doc|lib)/.test(e.key)) soon();
  const info = appAndIdFromDocKey(e.key);
  if (info && isCollab(info.app, info.id)) pushCollabSoon(info.app, info.id);
});
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
  stopWatchingAllCollab();
  if (!u) setStatus({ state:settings().enabled ? 'signedout' : 'off' });
  else if (!settings().enabled) setStatus({ state:'off' });
  else await syncAll();
  if (u) watchAllCollab();
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

// oneSite: put a site online. One published file per site, overwritten in place, served at a stable public link.
async function publishSite(id, title, html) {
  if (!getCurrentUser()) throw new Error('Sign in to your oeper.dev account first.');
  const r = await api('/one-sync/sitepub/' + encodeURIComponent(id), { method:'PUT', headers:{ 'Content-Type':'application/octet-stream', 'X-One-Name':encodeURIComponent(title), 'X-One-Updated':String(Date.now()) }, body:html });
  const j = await jsonOr(r);
  if (r.status === 404 && !j.error) throw new Error('The oeper.dev file server doesn’t know about publishing yet — it needs to be updated and restarted.');
  if (!r.ok) throw new Error(j.error || 'Publishing failed (' + r.status + ')');
  return { url:j.publicUrl || j.url };
}
window.ONE_CLOUD = { ready, syncAll, publishSite, fetchOne, share, openShared, openSettings, enabled:() => settings().enabled, isSynced:(app, id) => app + ':' + id in store.get(STATE, {}),
  collaborate, openCollabLink, isCollab, collabInfo,
  account:() => acct,
  onAccount:cb => { acctListeners.add(cb); cb(acct); return () => acctListeners.delete(cb); },
  signIn:async () => { try { await signIn(); } catch { ONE.toast('Sign-in didn’t finish.'); } },
  signOut:async () => { await signOutUser(); },
};
ONE.mountAvatar(document.getElementById('avatarSlot')); window.ONE_CLOUD.onAccount(() => ONE.renderAvatars());
const slot = document.getElementById('cloudSlot'); if (slot) slot.append(chip);
const gear = document.getElementById('settingsBtn'); if (gear) { gear.hidden = false; gear.onclick = openSettings; }
renderChip();
