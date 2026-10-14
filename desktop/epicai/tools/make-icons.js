// Draws the epic AI mark into the PNG / ICO files the app needs. Run with:  npx electron tools/make-icons.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');
const svg = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1700 1700">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcdcdc"/><stop offset="1" stop-color="#767676"/></linearGradient></defs>
  <rect width="1700" height="1700" fill="url(#g)"/>
  <g transform="translate(469 404) scale(2)"><rect x="2" width="80" height="300" rx="40"/><rect x="297" width="80" height="300" rx="40"/><path d="M40 421C140 454.333 240 454.333 340 421" fill="none" stroke="#000" stroke-width="80" stroke-linecap="round"/></g>
</svg>`;

async function render(size) {
  const w = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg(size)}</body></html>`));
  await new Promise(r => setTimeout(r, 300));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  w.destroy();
  return img.toPNG();
}

// an .ico may hold PNG images directly (Windows Vista and later)
function ico(pngs) {   // pngs: [{ size, data }]
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(p => {
    const e = Buffer.alloc(16);
    e.writeUInt8(p.size >= 256 ? 0 : p.size, 0); e.writeUInt8(p.size >= 256 ? 0 : p.size, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(p.data.length, 8); e.writeUInt32LE(offset, 12);
    offset += p.data.length; return e;
  });
  return Buffer.concat([head, ...entries, ...pngs.map(p => p.data)]);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const big = await render(1024);
  fs.writeFileSync(path.join(OUT, 'icon.png'), big);
  const src = nativeImage.createFromBuffer(big);
  const at = s => src.resize({ width: s, height: s, quality: 'best' }).toPNG();
  fs.writeFileSync(path.join(OUT, 'tray.png'), at(64));
  const list = [16, 32, 48, 64, 128, 256].map(s => ({ size: s, data: at(s) }));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(list));
  console.log('icons written to', OUT);
  app.quit();
});
