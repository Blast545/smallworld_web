// Generates the PWA icons as PNGs with no external dependencies (raw pixel
// buffer -> zlib -> hand-assembled PNG chunks). Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let c = -1;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, draw) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// A stylized cavern: dark backdrop, purple crystal spikes, gold coin.
function draw(x, y, size) {
  const u = x / size;
  const v = y / size;
  let r = 23, g = 18, b = 37; // #171225
  // Crystal spikes.
  const spikes = [
    [0.25, 0.9, 0.16],
    [0.5, 0.95, 0.22],
    [0.75, 0.88, 0.14],
  ];
  for (const [cx, base, w] of spikes) {
    const h = w * 3.4;
    const dx = Math.abs(u - cx);
    if (v > base - h && dx < w * (1 - (base - v) / h) * 0.5) {
      r = 128; g = 90; b = 213; // purple
      if (dx < 0.02) { r = 168; g = 132; b = 240; }
    }
  }
  // Coin.
  const dx = u - 0.5, dy = v - 0.34;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.19) { r = 226; g = 178, b = 63; }
  if (d < 0.19 && d > 0.16) { r = 174; g = 128; b = 32; }
  return [r, g, b];
}

for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), makePng(size, draw));
}
console.error('icons written');
