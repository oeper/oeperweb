// Runs only on oeper.dev/ext-auth*: passes the sign-in result from the page to the extension.
window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.epicaiExtAuth !== true || typeof d.state !== 'string') return;
  chrome.runtime.sendMessage({ type: 'auth', state: d.state, rt: d.rt, email: d.email, name: d.name, photo: d.photo });
});
