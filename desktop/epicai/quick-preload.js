// Preload of the quick-entry window (a small prompt box on the global shortcut).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('epicQuick', {
  platform: process.platform,
  submit: (text, screen) => ipcRenderer.send('epic:quick-submit', { text: String(text || ''), screen: !!screen }),
  close: () => ipcRenderer.send('epic:quick-close'),
});
