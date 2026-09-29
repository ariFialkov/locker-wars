// Generates PWA icons (PNG) with no external deps: rasterises a stylised
// roll-up storage door + padlock and encodes it as PNG via zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

function render(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const bg = hex('#12100e'), door = hex('#e8892b'), groove = hex('#b8651a'), lock = hex('#ffd166'), shackle = hex('#d9b25a');
  const pad = maskable ? 0.18 : 0.08; // maskable icons need content inside safe zone
  const r = size * (maskable ? 0 : 0.19);
  const inR = (x, y) => {
    if (r === 0) return true;
    const cx = Math.min(Math.max(x, r), size - r), cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (!inR(x + 0.5, y + 0.5)) { px[i + 3] = 0; continue; }
    let c = bg;
    const u = x / size, v = y / size;
    const dx0 = pad + 0.02, dx1 = 1 - pad - 0.02, dy0 = pad + 0.12, dy1 = 1 - pad - 0.1;
    if (u > dx0 && u < dx1 && v > dy0 && v < dy1) {
      c = door;
      const slat = ((v - dy0) / (dy1 - dy0)) * 7;
      if (slat % 1 < 0.12) c = groove;
      // subtle vertical shading
      const sh = 1 - Math.abs(u - 0.5) * 0.35;
      c = c.map((k) => Math.round(k * sh));
    }
    // padlock body
    const lw = 0.22 * (1 - pad * 1.5), lh = 0.16 * (1 - pad * 1.5), lcx = 0.5, lcy = dy1 - lh * 0.55;
    if (Math.abs(u - lcx) < lw / 2 && Math.abs(v - lcy) < lh / 2) c = lock;
    // shackle
    const sr = lw * 0.36, sy = lcy - lh / 2, d = Math.hypot(u - lcx, v - sy);
    if (v < sy && d < sr && d > sr - 0.035 * (1 - pad)) c = shackle;
    if (v >= sy - 0.001 && v < lcy - lh / 2 + 0.001 && (Math.abs(u - lcx - sr + 0.0175) < 0.0175 || Math.abs(u - lcx + sr - 0.0175) < 0.0175)) c = shackle;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
  return encodePNG(size, size, px);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/pwa-192.png', render(192, { maskable: false }));
writeFileSync('public/pwa-512.png', render(512, { maskable: false }));
writeFileSync('public/pwa-512-maskable.png', render(512, { maskable: true }));
writeFileSync('public/apple-touch-icon.png', render(180, { maskable: true }));
console.log('icons written');
