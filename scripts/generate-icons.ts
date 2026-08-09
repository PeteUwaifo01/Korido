// Run: npx tsx scripts/generate-icons.ts
//
// Generates the home-screen icons from the brand tokens — ink field, mango dot,
// the same mark as the "Korido." wordmark. Written by hand rather than pulled
// from an image library because adding a dependency to draw three squares would
// be a poor trade, and this way the icons regenerate from the tokens if the
// brand colours ever change.
//
// Minimal PNG encoder: IHDR + IDAT (zlib-deflated raw scanlines) + IEND.

import { deflateSync } from "zlib";
import { writeFileSync, mkdirSync } from "fs";

const INK: [number, number, number] = [0x0a, 0x3b, 0x2e];
const MANGO: [number, number, number] = [0xf5, 0xb3, 0x01];

function crc32(buf: Buffer): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Solid ink square with a centred mango disc, antialiased at the edge. */
function render(size: number): Buffer {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.17; // dot radius, proportional to the wordmark's period
  const rows: Buffer[] = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      // 1px feather so the disc does not look jagged at 192px
      const t = Math.max(0, Math.min(1, r + 0.5 - d));
      const px = [
        Math.round(INK[0] + (MANGO[0] - INK[0]) * t),
        Math.round(INK[1] + (MANGO[1] - INK[1]) * t),
        Math.round(INK[2] + (MANGO[2] - INK[2]) * t),
      ];
      row.set(px, 1 + x * 3);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [180, 192, 512]) {
  const png = render(size);
  writeFileSync(`public/icons/icon-${size}.png`, png);
  console.log(`  public/icons/icon-${size}.png  ${(png.length / 1024).toFixed(1)}KB`);
}
console.log("done");
