// Draws the "one" mark (a rounded 1: a capsule plus a half disc on its upper left) into PNG app icons, with no dependencies.
// Run: node one-src/pwa/make-icons.js   (writes one/icons/*.png)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.join(__dirname, '..', '..', 'one', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// the mark lives in a 60 x 200 box: capsule x 20..60 (centre line x = 40, radius 20, y 20..180) + left half disc (centre 20,20.5, radius 20)
const inMark = (x, y) => {
  const cy = Math.min(180, Math.max(20, y)), dx = x - 40, dy = y - cy;
  if (dx * dx + dy * dy <= 400) return true;
  return x <= 20 && (x - 20) ** 2 + (y - 20.5) ** 2 <= 400;
};
const roundedRect = (x, y, w, h, r) => {
  const cx = Math.min(Math.max(x, r), w - r), cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, { bg, fg, corner, markH }) {
  const S = 3, raw = Buffer.alloc((size * 4 + 1) * size), scale = markH / 200, ox = size / 2 - 30 * scale, oy = (size - markH) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let a = 0, f = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + .5) / S, py = y + (sy + .5) / S;
        if (corner < 0 || roundedRect(px, py, size, size, corner)) { a++; if (inMark((px - ox) / scale, (py - oy) / scale)) f++; }
      }
      const n = S * S, o = y * (size * 4 + 1) + 1 + x * 4, t = a ? f / a : 0;
      raw[o] = Math.round(bg[0] + (fg[0] - bg[0]) * t); raw[o + 1] = Math.round(bg[1] + (fg[1] - bg[1]) * t); raw[o + 2] = Math.round(bg[2] + (fg[2] - bg[2]) * t); raw[o + 3] = Math.round(255 * a / n);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const BLUE = [63, 90, 168], WHITE = [255, 255, 255];
const jobs = [
  ['icon-192.png', 192, { bg:BLUE, fg:WHITE, corner:192 * .22, markH:192 * .58 }],
  ['icon-512.png', 512, { bg:BLUE, fg:WHITE, corner:512 * .22, markH:512 * .58 }],
  ['icon-maskable-512.png', 512, { bg:BLUE, fg:WHITE, corner:-1, markH:512 * .46 }],   // full bleed, mark inside the 80% safe zone
  ['apple-touch-icon.png', 180, { bg:BLUE, fg:WHITE, corner:-1, markH:180 * .56 }]       // iOS rounds the corners itself
];
for (const [name, size, o] of jobs) { fs.writeFileSync(path.join(OUT, name), png(size, o)); console.log(name, size); }
