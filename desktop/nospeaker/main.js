// No speaker (desktop). A plain window around ./app/index.html; the sound is all Web Audio (app/synth.js).
// Autoplay is allowed so the audio context never starts suspended.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 880, minWidth: 380, minHeight: 560, backgroundColor: '#111318', title: 'No speaker',
    autoHideMenuBar: true, show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { if (!win.isVisible()) win.show(); }); // ready-to-show has been unreliable in this repo's other app
  // links open in the system browser; the window never navigates away
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}
app.whenReady().then(createWindow);
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) createWindow(); });
