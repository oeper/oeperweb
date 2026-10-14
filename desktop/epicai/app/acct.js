// Sign-in and the signed-in person's data (chats in the cloud, what epic AI remembers about them, who they are), against the same Firebase
// project as the website, so chats and memory are shared with oeper.dev/ai.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove, collection, query, where, serverTimestamp, addDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseApp = initializeApp({
  apiKey: 'AIzaSyAs7SP8FaWUDuz7GVp9rG5uZw4oEIWmBUk',
  authDomain: 'oeper.dev',
  projectId: 'oepernet-1683535959256',
  storageBucket: 'oepernet-1683535959256.firebasestorage.app',
  messagingSenderId: '882911814752',
  appId: '1:882911814752:web:af7c10447ea6ee56c8cf05',
});
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

let current = null, ready = false;
const listeners = new Set();
onAuthStateChanged(auth, u => { current = u; ready = true; listeners.forEach(cb => cb(current)); });

export const getUser = () => current;
export function onUser(cb) { listeners.add(cb); if (ready) cb(current); return () => listeners.delete(cb); }
export const idToken = () => current ? current.getIdToken() : Promise.resolve(null);

/** Signs in through the system browser; resolves once Firebase has the person. */
export async function signIn() {
  const idt = await window.epicDesktop.signIn();
  return signInWithCredential(auth, GoogleAuthProvider.credential(idt));
}
export const signOutUser = () => signOut(auth);

// ── chats (aiChats/{email}: the same document the website syncs) ──
export function watchChats(cb) {
  if (!current) return () => {};
  return onSnapshot(doc(db, 'aiChats', current.email), snap => cb((snap.exists() && snap.data().chats) || []), () => {});
}
export function pushChats(chats) {
  if (!current) return;
  try { setDoc(doc(db, 'aiChats', current.email), { chats }).catch(() => {}); } catch (err) { console.error('could not sync chats', err); }
}

// ── what epic AI remembers (aiMemory/{email}.facts) ──
export function watchMemory(cb) {   // cb({ facts, profile, learn }): the quick facts, the memory file (markdown) and the "let epic AI learn about me" switch
  if (!current) return () => {};
  return onSnapshot(doc(db, 'aiMemory', current.email), snap => {
    const d = snap.exists() ? snap.data() : {};
    cb({ facts: Array.isArray(d.facts) ? d.facts : [], profile: typeof d.profile === 'string' ? d.profile : '', learn: d.learn !== false });
  }, () => cb({ facts: [], profile: '', learn: true }));
}
export async function saveProfile(text) {
  if (!current) return;
  try { await setDoc(doc(db, 'aiMemory', current.email), { profile: String(text || '').slice(0, 6000), profileUpdated: Date.now() }, { merge: true }); } catch (err) { console.error('could not save the memory file', err); throw err; }
}
export async function setLearn(on) {
  if (!current) return;
  try { await setDoc(doc(db, 'aiMemory', current.email), { learn: !!on }, { merge: true }); } catch (err) { console.error('could not save the learning switch', err); }
}
const memRef = () => doc(db, 'aiMemory', current.email);
export async function rememberFact(fact) {
  const f = String(fact || '').trim().slice(0, 300);
  if (!current || !f) return;
  try { await setDoc(memRef(), { facts: arrayUnion(f) }, { merge: true }); } catch (err) { console.error('could not save memory', err); }
}
export async function forgetFact(fact) {
  if (!current || !fact) return;
  try { await setDoc(memRef(), { facts: arrayRemove(fact) }, { merge: true }); } catch (err) { console.error('could not remove memory', err); }
}
export async function updateFact(oldFact, newFact) {
  const f = String(newFact || '').trim().slice(0, 300);
  if (!current || !oldFact || !f) return;
  try {
    await setDoc(memRef(), { facts: arrayRemove(oldFact) }, { merge: true });
    await setDoc(memRef(), { facts: arrayUnion(f) }, { merge: true });
  } catch (err) { console.error('could not update memory', err); }
}

// ── who the person is (told to the model so it never asks) ──
export async function profileOf(user) {
  let p = null;
  try { const s = await getDoc(doc(db, 'users', user.email)); p = s.exists() ? s.data() : null; } catch {}
  return {
    name: (p && p.displayName) || user.displayName || 'User',
    photo: (p && p.photoURL) || user.photoURL || '',
    bio: (p && p.bio) || '',
    handle: (p && p.handle) || null,
  };
}
export async function selfContextFor(user, profile) {
  let postsLine = '';
  try {
    const snap = await getDocs(query(collection(db, 'posts'), where('authorEmail', '==', user.email)));
    const titles = snap.docs
      .map(d => ({ title: d.data().title, date: d.data().createdAt && d.data().createdAt.toDate ? d.data().createdAt.toDate() : new Date(0) }))
      .sort((a, b) => b.date - a.date).slice(0, 5).map(p => p.title).filter(Boolean);
    if (titles.length) postsLine = `Their most recent post title(s), newest first: ${titles.map(t => `"${t}"`).join(', ')}.`;
  } catch {}
  return [
    `You're talking to ${profile.name}${profile.handle ? ` (@${profile.handle} on oeper.dev)` : ''}, who is signed in right now.`,
    profile.bio ? `Their profile bio: "${profile.bio}"` : '',
    postsLine,
  ].filter(Boolean).join(' ');
}

// ── set_follow tool (the model may follow someone only when the person clearly asked) ──
export async function setFollow(handleRaw, follow) {
  if (!current) return;
  const handle = String(handleRaw || '').trim().replace(/^@/, '').toLowerCase();
  if (!handle) return;
  try {
    const hs = await getDoc(doc(db, 'handles', handle));
    if (!hs.exists()) return;
    const followee = hs.data().email;
    if (!followee || followee === current.email) return;
    const ref = doc(db, 'follows', current.email + '__' + followee);
    if (follow) {
      await setDoc(ref, { followerEmail: current.email, followeeEmail: followee, createdAt: serverTimestamp() });
      addDoc(collection(db, 'notifications'), {
        recipientEmail: followee, actorEmail: current.email, actorName: current.displayName, actorPhoto: current.photoURL,
        type: 'follow', targetKind: null, targetId: null, preview: null, read: false, createdAt: serverTimestamp(),
      }).catch(() => {});
    } else await deleteDoc(ref);
  } catch (err) { console.error('could not update follow', err); }
}
