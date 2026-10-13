// Runs in the app's own window. A small, fixed API; nothing else of Electron or Node is reachable from the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('epicDesktop', {
  platform: process.platform,
  info: () => ipcRenderer.invoke('epic:info'),
  /** Opens oeper.dev's sign-in in the system browser (Google blocks sign-in inside embedded windows); resolves with a Google ID token. */
  signIn: () => ipcRenderer.invoke('epic:sign-in'),
  focus: () => ipcRenderer.send('epic:focus'),
  /** A screenshot of the display the cursor is on: { dataUrl } or { error }. hideWindow hides epic AI while it is taken. */
  captureScreen: opts => ipcRenderer.invoke('epic:capture', opts || {}),
  openScreenSettings: () => ipcRenderer.send('epic:open-screen-settings'),
  micAccess: () => ipcRenderer.invoke('epic:mic-access'),
  getLogin: () => ipcRenderer.invoke('epic:get-login'),
  setLogin: on => ipcRenderer.send('epic:set-login', !!on),
  setTheme: mode => ipcRenderer.send('epic:set-theme', mode),
  chromeColors: (bg, fg) => ipcRenderer.send('epic:chrome-colors', { bg, fg }),
  openExternal: url => ipcRenderer.send('epic:open-external', String(url)),
  /** Called once the UI is ready to receive prompts from the quick-entry window. */
  ready: () => ipcRenderer.send('epic:ready'),
  onQuick: cb => ipcRenderer.on('epic:quick', (_e, p) => cb(p)),
  onMenu: cb => ipcRenderer.on('epic:menu', (_e, name) => cb(name)),
});
