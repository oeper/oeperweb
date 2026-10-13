// Runs in the oeper.dev page (the window never leaves oeper.dev). Gives the site a tiny, fixed API: sign in through the system browser,
// and bring the window forward (from a notification). Nothing else of Electron or Node is reachable from the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('epicDesktop', {
  platform: process.platform,
  /** Opens oeper.dev's sign-in in the system browser (Google blocks sign-in inside embedded windows); resolves with a Google ID token. */
  signIn: () => ipcRenderer.invoke('epic:sign-in'),
  focus: () => ipcRenderer.send('epic:focus'),
});
