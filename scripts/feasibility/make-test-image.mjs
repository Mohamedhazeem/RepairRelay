#!/usr/bin/env node
// Generates a synthetic test image for the S0 AI vision probe: a stylized phone with a drawn crack.
// Dependency-free minimal PNG encoder (RGB, filter 0).
// Usage: node scripts/feasibility/make-test-image.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 640;
const H = 854; // portrait phone-like aspect
const raw = Buffer.alloc(H * (1 + W * 3));

function setPx(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter type: none
  const o = rowStart + 1 + x * 3;
  raw[o] = r;
  raw[o + 1] = g;
  raw[o + 2] = b;
}

// dark screen background
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) setPx(x, y, 21, 34, 56);
}
// light frame border
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const border = x < 56 || x >= W - 56 || y < 56 || y >= H - 56;
    if (border) setPx(x, y, 226, 232, 240);
  }
}
// notch bar
for (let y = 80; y < 96; y++) for (let x = 250; x < 390; x++) setPx(x, y, 66, 88, 122);
// jagged crack lines
const lines = [
  [70, 520, 560, 210],
  [150, 640, 470, 130],
  [210, 760, 430, 320],
];
for (const [x1, y1, x2, y2] of lines) {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x1 + ((x2 - x1) * i) / n + Math.sin(i / 3) * 7);
    const y = Math.round(y1 + ((y2 - y1) * i) / n);
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [1, 1]]) setPx(x + dx, y + dy, 240, 244, 248);
  }
}

// CRC-32 (PNG)
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: RGB

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("tests/fixtures/ai", { recursive: true });
writeFileSync("tests/fixtures/ai/sample-device.png", png);
console.log(`wrote tests/fixtures/ai/sample-device.png (${W}x${H}, ${png.length} bytes) — synthetic test image, never user-facing`);
