// epic AI for Windows and macOS: oeper.dev/ai in its own window, with a tray / menu-bar icon, a global shortcut, notifications,
// and sign-in through the system browser (Google refuses sign-in inside embedded browsers).
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, globalShortcut, nativeImage, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SITE = 'https://oeper.dev';
const HOME = SITE + '/ai';
const isMac = process.platform === 'darwin';
const SHORTCUT = 'CommandOrControl+Shift+Space';

let win = null, tray = null, quitting = false;
let pendingSignIn = null;   // { state, resolve, reject, timer }

if (!app.requestSingleInstanceLock()) { app.quit(); }

// epicai:// links (the browser hands the sign-in back this way)
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('epicai', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('epicai');

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } }
function saveBounds() { try { if (win && !win.isMinimized() && !win.isFullScreen()) fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getBounds(), max: win.isMaximized() })); } catch {} }

const isSite = u => { try { return new URL(u).origin === SITE; } catch { return false; } };
const isWeb = u => { try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } };

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function createWindow() {
  const b = loadBounds();
  win = new BrowserWindow({
    width: b.width || 1100, height: b.height || 780, x: b.x, y: b.y, minWidth: 420, minHeight: 520,
    backgroundColor: '#0f0f10', title: 'epic AI', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: 'persist:epicai', spellcheck: true },
  });
  if (b.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL(HOME);

  // the window only ever shows oeper.dev; everything else opens in the person's browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSite(url)) win.loadURL(url); else if (isWeb(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!isSite(url)) { e.preventDefault(); if (isWeb(url)) shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'assets', 'offline.html'), { query: { retry: HOME, why: desc } });
  });

  win.on('resize', saveBounds); win.on('move', saveBounds);
  // closing hides the window (the tray / menu-bar icon and the shortcut bring it back); Quit really quits
  win.on('close', e => { if (!quitting) { e.preventDefault(); saveBounds(); win.hide(); } });
  win.on('closed', () => { win = null; });
}

function makeTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (isMac) img.setTemplateImage(false);
  tray = new Tray(img.resize({ width: 18, height: 18 }));
  tray.setToolTip('epic AI');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open epic AI', click: showWindow },
    { label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit epic AI', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); });
}

function makeMenu() {
  const t = [];
  if (isMac) t.push({ role: 'appMenu' });
  t.push({ role: 'editMenu' });
  t.push({ label: 'View', submenu: [
    { label: 'Reload', accelerator: 'CommandOrControl+R', click: () => win && win.reload() },
    { label: 'New chat', accelerator: 'CommandOrControl+N', click: () => win && win.loadURL(HOME) },
    { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
  ] });
  t.push({ role: 'windowMenu' });
  t.push({ role: 'help', submenu: [
    { label: 'oeper.dev', click: () => shell.openExternal(SITE) },
    { label: 'Send feedback', click: () => shell.openExternal(SITE + '/feedback') },
    { label: 'Get the Android app', click: () => shell.openExternal(SITE + '/tools') },
  ] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

// ── sign-in through the system browser ──
function startSignIn() {
  if (pendingSignIn) { clearTimeout(pendingSignIn.timer); pendingSignIn.reject(new Error('another sign-in was started')); }
  const state = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { if (pendingSignIn && pendingSignIn.state === state) { pendingSignIn = null; reject(new Error('sign-in timed out')); } }, 5 * 60 * 1000);
    pendingSignIn = { state, resolve, reject, timer };
    shell.openExternal(SITE + '/app-auth.html?mode=desktop&state=' + state);
  });
}

function handleDeepLink(raw) {
  let u; try { u = new URL(raw); } catch { return; }
  if (u.protocol !== 'epicai:' || u.hostname !== 'desktop-auth') return;
  const state = u.searchParams.get('state') || '', token = u.searchParams.get('it') || '';
  if (pendingSignIn && state && state === pendingSignIn.state) {
    clearTimeout(pendingSignIn.timer);
    const p = pendingSignIn; pendingSignIn = null;
    if (token) p.resolve(token); else p.reject(new Error('no sign-in came back'));
    showWindow();
  }
}

app.on('second-instance', (_e, argv) => {
  const link = argv.find(a => a.startsWith('epicai://'));
  if (link) handleDeepLink(link);
  showWindow();
});
app.on('open-url', (e, url) => { e.preventDefault(); handleDeepLink(url); });

app.whenReady().then(() => {
  app.setAppUserModelId('dev.oeper.epicai.desktop');
  // notifications from the page are fine; microphone for voice input; nothing else (camera, location, ...)
  const ses = session.fromPartition('persist:epicai');
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(isSite(wc.getURL()) && ['notifications', 'media', 'clipboard-sanitized-write'].includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => !!wc && isSite(wc.getURL()) && ['notifications', 'media', 'clipboard-sanitized-write'].includes(permission));

  ipcMain.handle('epic:sign-in', () => startSignIn());
  ipcMain.on('epic:focus', () => showWindow());

  makeMenu(); makeTray(); createWindow();
  const first = process.argv.find(a => a.startsWith('epicai://')); if (first) handleDeepLink(first);
  try { globalShortcut.register(SHORTCUT, () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); }); } catch {}
  app.on('activate', showWindow);   // mac: clicking the dock icon
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* stays alive in the tray / menu bar */ });
