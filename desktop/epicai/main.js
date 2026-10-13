// epic AI for Windows and macOS. The window shows the app's own bundled UI (./app), not the website: it is served to the window as
// https://oeper.dev/__epic/* from the app's files, so the UI runs with oeper.dev's origin (the AI worker, the upload server and Firebase all
// already accept that origin) while every other request goes out to the network untouched.
// Native pieces: sign-in through the system browser (Google refuses embedded browsers), screen capture ("look at my screen"),
// a quick-entry window on a global shortcut, microphone access for voice input, a tray / menu-bar icon and notifications.
const { app, BrowserWindow, Tray, Menu, shell, ipcMain, globalShortcut, nativeImage, nativeTheme, session, desktopCapturer, screen, systemPreferences, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SITE = 'https://oeper.dev';
const APP_PREFIX = '/__epic/';
const APP_DIR = path.join(__dirname, 'app');
const HOME = SITE + APP_PREFIX + 'index.html';
const QUICK = SITE + APP_PREFIX + 'quick.html';
const PARTITION = 'persist:epicai';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const SHORTCUT = 'CommandOrControl+Shift+Space';

let win = null, quickWin = null, tray = null, quitting = false;
let pendingSignIn = null;     // { state, resolve, reject, timer }
let rendererReady = false;    // the main window's UI has started and listens for quick-entry prompts
let queuedQuick = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }

// epicai:// links (the browser hands the sign-in back this way)
if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient('epicai', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('epicai');

const stateFile = () => path.join(app.getPath('userData'), 'window.json');
function loadBounds() { try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; } }
function saveBounds() { try { if (win && !win.isMinimized() && !win.isFullScreen()) fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getBounds(), max: win.isMaximized() })); } catch {} }

const isSite = u => { try { return new URL(u).origin === SITE; } catch { return false; } };
const isOurPage = u => { try { const x = new URL(u); return x.origin === SITE && x.pathname.startsWith(APP_PREFIX); } catch { return false; } };
const isWeb = u => { try { return ['https:', 'http:'].includes(new URL(u).protocol); } catch { return false; } };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

// https://oeper.dev/__epic/* is answered from the app's own files; everything else is forwarded as it was
function installProtocol(ses) {
  ses.protocol.handle('https', async req => {
    let u; try { u = new URL(req.url); } catch { return net.fetch(req, { bypassCustomProtocolHandlers: true }); }
    if (u.hostname === 'oeper.dev' && u.pathname.startsWith(APP_PREFIX)) {
      let rel; try { rel = decodeURIComponent(u.pathname.slice(APP_PREFIX.length)); } catch { return new Response('bad request', { status: 400 }); }
      const file = path.normalize(path.join(APP_DIR, rel || 'index.html'));
      if (!file.startsWith(APP_DIR + path.sep)) return new Response('forbidden', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
      } catch { return new Response('not found', { status: 404 }); }
    }
    return net.fetch(req, { bypassCustomProtocolHandlers: true });
  });
}

function showWindow() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function webPrefs(preload) {
  return { preload: path.join(__dirname, preload), contextIsolation: true, sandbox: true, nodeIntegration: false, partition: PARTITION, spellcheck: true, backgroundThrottling: false };
}

function createWindow() {
  const b = loadBounds();
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: b.width || 1100, height: b.height || 780, x: b.x, y: b.y, minWidth: 420, minHeight: 520,
    backgroundColor: dark ? '#111318' : '#f7f8fb', title: 'epic AI', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // the app draws its own title area; the system buttons sit on top of it (Windows) or beside it (macOS)
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isWin ? { titleBarOverlay: { color: dark ? '#111318' : '#f7f8fb', symbolColor: dark ? '#e2e2e6' : '#1a1c22', height: 44 } } : {}),
    webPreferences: webPrefs('preload.js'),
  });
  rendererReady = false;
  if (b.max) win.maximize();
  // shown once the first frame is ready; the fallback covers a page that is slow to paint
  const reveal = () => { if (win && !win.isVisible() && !app.commandLine.hasSwitch('hidden')) win.show(); };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', () => setTimeout(reveal, 400));
  win.loadURL(HOME);

  // only the app's own pages ever load here; every other link opens in the person's browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (isWeb(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!isOurPage(url)) { e.preventDefault(); if (isWeb(url)) shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'assets', 'offline.html'), { query: { retry: HOME, why: desc } });
  });

  win.on('resize', saveBounds); win.on('move', saveBounds);
  // closing hides the window (the tray / menu-bar icon and the shortcut bring it back); Quit really quits
  win.on('close', e => { if (!quitting) { e.preventDefault(); saveBounds(); win.hide(); } });
  win.on('closed', () => { win = null; rendererReady = false; });
}

// ── quick entry: a small prompt box on a global shortcut, like Claude's ──
function openQuick() {
  if (quickWin && !quickWin.isDestroyed()) { quickWin.focus(); return; }
  const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const w = 640, h = 132;
  quickWin = new BrowserWindow({
    width: w, height: h, x: Math.round(disp.workArea.x + (disp.workArea.width - w) / 2), y: Math.round(disp.workArea.y + disp.workArea.height * 0.2),
    frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false,
    title: 'epic AI quick entry', webPreferences: webPrefs('quick-preload.js'),
  });
  quickWin.setAlwaysOnTop(true, 'screen-saver');
  quickWin.loadURL(QUICK);
  quickWin.once('ready-to-show', () => { quickWin.show(); quickWin.focus(); });
  quickWin.on('blur', () => { if (quickWin && !quickWin.isDestroyed() && !quickWin.webContents.isDevToolsOpened()) quickWin.close(); });
  quickWin.on('closed', () => { quickWin = null; });
  quickWin.webContents.on('will-navigate', e => e.preventDefault());
  quickWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}
function closeQuick() { if (quickWin && !quickWin.isDestroyed()) quickWin.close(); }

function toMain(payload) {
  showWindow();
  if (win && rendererReady) win.webContents.send('epic:quick', payload);
  else queuedQuick = payload;
}

// ── "look at my screen": a screenshot of the display the cursor is on ──
async function captureScreen({ hideWindow } = {}) {
  if (isMac && systemPreferences.getMediaAccessStatus('screen') === 'denied') return { error: 'permission' };
  const wasShown = !!(win && win.isVisible() && !win.isMinimized());
  if (hideWindow && wasShown) { win.hide(); await new Promise(r => setTimeout(r, isMac ? 450 : 250)); }
  try {
    const disp = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sf = disp.scaleFactor || 1;
    const k = Math.min(1, 1600 / Math.max(disp.size.width * sf, disp.size.height * sf));
    const thumbnailSize = { width: Math.round(disp.size.width * sf * k), height: Math.round(disp.size.height * sf * k) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const src = sources.find(s => s.display_id === String(disp.id)) || sources[0];
    if (!src || src.thumbnail.isEmpty()) return { error: isMac ? 'permission' : 'empty' };
    return { dataUrl: 'data:image/jpeg;base64,' + src.thumbnail.toJPEG(82).toString('base64') };
  } catch (err) {
    return { error: String(err && err.message || err) };
  } finally {
    if (hideWindow && wasShown && win) { win.show(); win.focus(); }
  }
}

function makeTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (isMac) img.setTemplateImage(false);
  tray = new Tray(img.resize({ width: 18, height: 18 }));
  tray.setToolTip('epic AI');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open epic AI', click: showWindow },
    { label: 'Quick entry', accelerator: SHORTCUT, click: openQuick },
    { label: 'Start at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked }) },
    { type: 'separator' },
    { label: 'Quit epic AI', click: () => { quitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', () => { if (win && win.isVisible() && win.isFocused()) win.hide(); else showWindow(); });
}

function sendToWin(channel) { showWindow(); if (win) win.webContents.send('epic:menu', channel); }
function makeMenu() {
  const t = [];
  if (isMac) t.push({ role: 'appMenu' });
  t.push({ label: 'File', submenu: [
    { label: 'New chat', accelerator: 'CommandOrControl+N', click: () => sendToWin('new-chat') },
    { label: 'Quick entry', accelerator: SHORTCUT, click: openQuick },
    { label: 'Search chats', accelerator: 'CommandOrControl+K', click: () => sendToWin('search') },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => sendToWin('settings') },
    ...(isMac ? [] : [{ type: 'separator' }, { label: 'Quit epic AI', click: () => { quitting = true; app.quit(); } }]),
  ] });
  t.push({ role: 'editMenu' });
  t.push({ label: 'View', submenu: [
    { label: 'Reload', accelerator: 'CommandOrControl+R', click: () => win && win.reload() },
    { label: 'Toggle sidebar', accelerator: 'CommandOrControl+B', click: () => sendToWin('sidebar') },
    { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
  ] });
  t.push({ role: 'windowMenu' });
  t.push({ role: 'help', submenu: [
    { label: 'oeper.dev', click: () => shell.openExternal(SITE) },
    { label: 'Send feedback', click: () => shell.openExternal(SITE + '/feedback') },
    { label: 'Usage and codes', click: () => shell.openExternal(SITE + '/usage') },
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

// IPC from a page is accepted only when it comes from one of the app's own pages
const fromApp = e => !!e.senderFrame && isOurPage(e.senderFrame.url);

app.whenReady().then(() => {
  app.setAppUserModelId('dev.oeper.epicai.desktop');
  const ses = session.fromPartition(PARTITION);
  installProtocol(ses);
  // microphone (voice input) and notifications for the app's own pages; nothing else (camera, location, ...)
  const allowed = ['notifications', 'media', 'clipboard-sanitized-write'];
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(isOurPage(wc.getURL()) && allowed.includes(permission)));
  ses.setPermissionCheckHandler((wc, permission) => !!wc && isOurPage(wc.getURL()) && allowed.includes(permission));

  ipcMain.handle('epic:sign-in', e => fromApp(e) ? startSignIn() : Promise.reject(new Error('not allowed')));
  ipcMain.on('epic:focus', e => { if (fromApp(e)) showWindow(); });
  ipcMain.on('epic:ready', e => {
    if (!fromApp(e)) return;
    rendererReady = true;
    if (queuedQuick) { win.webContents.send('epic:quick', queuedQuick); queuedQuick = null; }
  });
  ipcMain.handle('epic:capture', (e, opts) => fromApp(e) ? captureScreen(opts || {}) : { error: 'not allowed' });
  ipcMain.handle('epic:mic-access', async e => {
    if (!fromApp(e)) return false;
    if (isMac) { try { return await systemPreferences.askForMediaAccess('microphone'); } catch { return false; } }
    return true;
  });
  ipcMain.on('epic:open-screen-settings', e => {
    if (!fromApp(e)) return;
    if (isMac) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  });
  ipcMain.handle('epic:get-login', e => fromApp(e) ? app.getLoginItemSettings().openAtLogin : false);
  ipcMain.on('epic:set-login', (e, on) => { if (fromApp(e)) app.setLoginItemSettings({ openAtLogin: !!on }); });
  ipcMain.on('epic:set-theme', (e, mode) => {
    if (!fromApp(e)) return;
    nativeTheme.themeSource = ['light', 'dark'].includes(mode) ? mode : 'system';
  });
  ipcMain.on('epic:chrome-colors', (e, c) => {
    if (!fromApp(e) || !isWin || !win || !c) return;
    try { win.setTitleBarOverlay({ color: String(c.bg), symbolColor: String(c.fg), height: 44 }); } catch {}
  });
  ipcMain.handle('epic:info', e => fromApp(e) ? { version: app.getVersion(), platform: process.platform, shortcut: SHORTCUT } : null);
  ipcMain.on('epic:open-external', (e, url) => { if (fromApp(e) && isWeb(url)) shell.openExternal(url); });
  ipcMain.on('epic:quick-submit', async (e, p) => {
    if (!fromApp(e) || !p) return;
    const text = String(p.text || '').slice(0, 8000);
    let shot = null, shotError = null;
    if (p.screen) {
      closeQuick();
      await new Promise(r => setTimeout(r, isMac ? 250 : 120));
      const r = await captureScreen({ hideWindow: false });
      if (r.dataUrl) shot = r.dataUrl; else shotError = r.error || 'empty';
    } else closeQuick();
    toMain({ text, screen: shot, screenError: shotError });
  });
  ipcMain.on('epic:quick-close', e => { if (fromApp(e)) closeQuick(); });

  makeMenu(); makeTray(); createWindow();
  const first = process.argv.find(a => a.startsWith('epicai://')); if (first) handleDeepLink(first);
  try { globalShortcut.register(SHORTCUT, () => { if (quickWin && !quickWin.isDestroyed()) closeQuick(); else openQuick(); }); } catch {}
  app.on('activate', showWindow);   // mac: clicking the dock icon
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { /* stays alive in the tray / menu bar */ });
