#!/usr/bin/env node
/**
 * Fish Acceleration — build script (zero dependencies)
 *
 * 1. Concatenates source parts back into the single files that manifest.json
 *    loads:
 *
 *      src/content/*.js   ->  src/content.js   (MAIN world content script)
 *      src/styles/*.css   ->  src/content.css  (content CSS)
 *
 *    Files are joined in filename order, so the numeric prefixes matter:
 *    00-header, 01-boot, ... 12-footer reconstruct the original IIFE exactly.
 *
 * 2. Packs the loadable extension (manifest, content.js/css, rules.json,
 *    icons/) into build/<name>-v<version>.zip — ready to share or upload to
 *    the Chrome Web Store. ZIP writer below is hand-rolled (deflate via
 *    node:zlib) so the script stays dependency-free.
 *
 * Usage:  node build.mjs
 * Then reload the extension at chrome://extensions.
 *
 * NOTE: src/content.js and src/content.css are GENERATED files — edit the
 * parts, never the generated output.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = dirname(fileURLToPath(import.meta.url));

function concat(dir, outFile, ext) {
  const abs = join(root, dir);
  const files = readdirSync(abs)
    .filter((f) => f.endsWith(ext) && !f.startsWith('.'))
    .sort();
  if (files.length === 0) throw new Error(`No ${ext} parts found in ${dir}/`);
  const out = files.map((f) => readFileSync(join(abs, f), 'utf8')).join('');
  writeFileSync(join(root, outFile), out, 'utf8');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ ${outFile.padEnd(14)} ${String(files.length).padStart(2)} parts  ${kb.padStart(8)} KB`);
}

// ---------------------------------------------------------------------------
// Minimal ZIP writer (store + deflate, no data descriptor, UTF-8-safe names)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function createZip(files) {
  const { time, date } = dosDateTime(new Date());
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const deflated = deflateRawSync(f.data, { level: 9 });
    const useDeflate = deflated.length < f.data.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : f.data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4);         // version needed to extract
    local.writeUInt16LE(0, 6);          // general purpose flags
    local.writeUInt16LE(method, 8);     // 8 = deflate, 0 = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);   // compressed size
    local.writeUInt32LE(f.data.length, 22);    // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);         // extra field length

    chunks.push(local, nameBuf, payload);
    central.push({ name: nameBuf, method, crc, csize: payload.length, usize: f.data.length, offset });
    offset += local.length + nameBuf.length + payload.length;
  }

  const cdStart = offset;
  for (const c of central) {
    const e = Buffer.alloc(46);
    e.writeUInt32LE(0x02014b50, 0); // central directory header signature
    e.writeUInt16LE(20, 4);         // version made by
    e.writeUInt16LE(20, 6);         // version needed to extract
    e.writeUInt16LE(0, 8);          // flags
    e.writeUInt16LE(c.method, 10);
    e.writeUInt16LE(time, 12);
    e.writeUInt16LE(date, 14);
    e.writeUInt32LE(c.crc, 16);
    e.writeUInt32LE(c.csize, 20);
    e.writeUInt32LE(c.usize, 24);
    e.writeUInt16LE(c.name.length, 28);
    // 30-37: extra/comment lengths, disk number, internal attrs — all zero
    e.writeUInt32LE((0o644 << 16) >>> 0, 38); // external attrs: rw-r--r--
    e.writeUInt32LE(c.offset, 42);
    chunks.push(e, c.name);
    offset += e.length + c.name.length;
  }
  const cdSize = offset - cdStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

function packZip() {
  const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
  const slug = String(manifest.name || 'extension')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const zipName = `${slug}-v${manifest.version}.zip`;

  const outDir = join(root, 'build');
  mkdirSync(outDir, { recursive: true });

  // Buang zip versi lama milik build ini supaya tidak menumpuk
  for (const f of readdirSync(outDir)) {
    if (new RegExp(`^${slug}-v[\\d.]+\\.zip$`).test(f) && f !== zipName) {
      unlinkSync(join(outDir, f));
      console.log(`- removed old ${f}`);
    }
  }

  // Hanya file yang dibutuhkan Chrome saat runtime (bukan source parts,
  // bukan _metadata/ — Web Store menolaknya dan Chrome membuatnya ulang)
  const files = [{ name: 'manifest.json', data: readFileSync(join(root, 'src/manifest.json')) }];
  for (const [disk, zip] of [['content.js', 'content.js'], ['content.css', 'content.css'], ['rules.json', 'rules.json']]) {
    files.push({ name: zip, data: readFileSync(join(root, 'src', disk)) });
  }
  for (const icon of readdirSync(join(root, 'src/icons')).filter((f) => !f.startsWith('.'))) {
    files.push({ name: `icons/${icon}`, data: readFileSync(join(root, 'src/icons', icon)) });
  }

  const zipPath = join(outDir, zipName);
  writeFileSync(zipPath, createZip(files));
  const kb = (files.reduce((n, f) => n + f.data.length, 0) / 1024).toFixed(0);
  console.log(`✓ build/${zipName.padEnd(30 - 6 + 6)} ${String(files.length).padStart(2)} files   (${kb} KB uncompressed)`);
}

console.log('Building Fish Acceleration...');
concat('src/content', 'src/content.js', '.js');
concat('src/styles', 'src/content.css', '.css');
packZip();
console.log('Done. Reload the extension in chrome://extensions to apply.');
