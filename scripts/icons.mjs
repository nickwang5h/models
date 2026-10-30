// PNG icons for the installed app, drawn from the same lattice as public/icon.svg (no image library needed).
//   node scripts/icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [0x0e, 0x6b, 0x56], INK = [0xff, 0xff, 0xff];   // the site's --accent and --paper (light)
const LINES = [[18, 14, 18, 50], [32, 14, 32, 50], [46, 14, 46, 50], [12, 22, 52, 22], [12, 42, 52, 42]];   // in a 64-unit box, stroke 4, round caps

function crc(buffer) {
  let c = ~0;
  for (const byte of buffer) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
const onLine = (x, y) => LINES.some(([x1, y1, x2, y2]) => {
  const t = Math.max(0, Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2)));
  return Math.hypot(x - (x1 + t * (x2 - x1)), y - (y1 + t * (y2 - y1))) <= 2;
});
function inRounded(x, y, r) {
  const dx = Math.max(r - x, x - (64 - r), 0), dy = Math.max(r - y, y - (64 - r), 0);
  return Math.hypot(dx, dy) <= r;
}
// `rounded`: transparent corners (for a plain icon); otherwise full bleed with the lattice shrunk into the safe zone (maskable, iOS).
function icon(size, rounded, path) {
  const png = draw(size, rounded);
  if (path) writeFileSync(path, png);
  return png;
}
function draw(size, rounded) {
  const S = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const x = (px + (sx + .5) / S) * 64 / size, y = (py + (sy + .5) / S) * 64 / size;
        if (rounded && !inRounded(x, y, 14)) continue;
        const k = rounded ? 1 : .68, color = onLine(32 + (x - 32) / k, 32 + (y - 32) / k) ? INK : BG;
        r += color[0]; g += color[1]; b += color[2]; a += 1;
      }
      const at = py * (size * 4 + 1) + 1 + px * 4;
      if (a) { raw[at] = r / a; raw[at + 1] = g / a; raw[at + 2] = b / a; raw[at + 3] = 255 * a / (S * S); }
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
icon(192, true, 'public/icons/icon-192.png');
icon(512, true, 'public/icons/icon-512.png');
icon(512, false, 'public/icons/icon-maskable-512.png');
icon(180, false, 'public/icons/apple-touch-icon.png');
// /favicon.ico, for whatever still asks for it: one 32px PNG in an ICO wrapper.
const png = icon(32, true);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 32; ico[7] = 32; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync('public/favicon.ico', Buffer.concat([ico, png]));
