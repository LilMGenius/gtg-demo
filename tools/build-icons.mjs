import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import assert from 'node:assert/strict';

// W3C PNG container: https://www.w3.org/TR/png-3/#5DataRep
// Node zlib supplies compression and CRC; only the two favicon shapes are rasterized.
// This is a format implementation from the specification, not copied third-party code.
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('web/index.html', root), 'utf8');
const svg = decodeURIComponent(html.match(/href="data:image\/svg\+xml,([^"]+)"/)[1]);
const attrs = name => Object.fromEntries([...svg.match(new RegExp('<' + name + '\\b([^>]+)>'))[1].matchAll(/([\w-]+)="([^"]+)"/g)].map(m => [m[1], m[2]]));
const rect = attrs('rect'), circle = attrs('circle');
const size = Number(rect.width), radius = Number(rect.rx);
assert.equal(size, Number(rect.height));
assert.equal(svg.match(/viewBox="([^"]+)"/)[1], `0 0 ${size} ${size}`);
const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
const yellow = rgb(rect.fill), dark = rgb(circle.fill);
const chunk = (type, bytes) => {
  const out = Buffer.alloc(bytes.length + 12);
  out.writeUInt32BE(bytes.length); out.write(type, 4); bytes.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, bytes.length + 8)), bytes.length + 8);
  return out;
};
for (const n of [192, 512]) {
  const raw = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const sum = [0, 0, 0]; let covered = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + 0.5) / 4) * size / n, py = (y + (sy + 0.5) / 4) * size / n;
      const dx = Math.max(radius - px, px - (size - radius), 0);
      const dy = Math.max(radius - py, py - (size - radius), 0);
      if (dx * dx + dy * dy > radius * radius) continue;
      const color = (px - Number(circle.cx)) ** 2 + (py - Number(circle.cy)) ** 2 <= Number(circle.r) ** 2 ? dark : yellow;
      covered++; color.forEach((c, i) => { sum[i] += c; });
    }
    const at = y * (n * 4 + 1) + 1 + x * 4;
    sum.forEach((c, i) => { raw[at + i] = covered ? Math.round(c / covered) : 0; });
    raw[at + 3] = Math.round(covered / 16 * 255);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(n); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  const output = new URL(`web/assets/icon-${n}.png`, root);
  writeFileSync(output, png);
  console.log(`${output.pathname} ${n}x${n} ${png.length} bytes`);
}
