#!/usr/bin/env node
/**
 * Fish Acceleration — build script (zero dependencies)
 *
 * 1. Bundles source parts and local MP4 engines into runtime extension files:
 *
 *      src/content/*.js + asset/engines/soundsafe-hook.js -> src/content.js   (MAIN world)
 *      src/isolated/*.js + asset/engines/{patch,sl-sr}.js -> src/isolated.js  (ISOLATED world)
 *      src/styles/*.css                                   -> src/content.css  (content CSS)
 *
 * 2. Validates JavaScript syntax of all generated bundles & background.js.
 *
 * 3. Packs the loadable extension (manifest, content.js, isolated.js,
 *    background.js, content.css, rules.json, icons/) into
 *    build/<name>-v<version>.zip — ready for Chrome Web Store or sharing.
 *
 * Usage:  node build.mjs
 * Then reload the extension at chrome://extensions.
 *
 * NOTE: src/content.js, src/isolated.js, and src/content.css are GENERATED files.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createHash, createPrivateKey, createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const readTextLf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function checkJsSyntax(code, label) {
  new vm.Script(code, { filename: label });
}

function writeAndReport(outFile, out, partCount, validateJs = false) {
  if (validateJs) checkJsSyntax(out, outFile);
  writeFileSync(join(root, outFile), out, 'utf8');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ ${outFile.padEnd(16)} ${String(partCount).padStart(2)} parts  ${kb.padStart(8)} KB`);
}

function buildContentJs() {
  const dir = join(root, 'src/content');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.startsWith('.'))
    .sort();
  if (files.length === 0) throw new Error('No .js parts found in src/content/');

  const chunks = [];
  let soundsafeBundled = false;
  for (const f of files) {
    if (f.startsWith('11-') && !soundsafeBundled) {
      chunks.push(readTextLf(join(root, 'asset/engines/soundsafe-hook.js')) + '\n');
      soundsafeBundled = true;
    }
    chunks.push(readTextLf(join(dir, f)));
  }
  if (!soundsafeBundled) {
    chunks.push(readTextLf(join(root, 'asset/engines/soundsafe-hook.js')));
  }

  const out = chunks.join('');
  checkJsSyntax(out, 'core/content.js');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ ${'core/content.js'.padEnd(18)} ${String(files.length + 1).padStart(2)} parts  ${kb.padStart(8)} KB`);
  return out;
}

function buildIsolatedJs() {
  const dir = join(root, 'src/isolated');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.startsWith('.'))
    .sort();
  if (files.length === 0) throw new Error('No .js parts found in src/isolated/');

  const chunks = [];
  let enginesBundled = false;
  for (const f of files) {
    chunks.push(readTextLf(join(dir, f)));
    if (f.startsWith('00-') && !enginesBundled) {
      chunks.push('\n' + readTextLf(join(root, 'asset/engines/patch.js')) + '\n');
      chunks.push(readTextLf(join(root, 'asset/engines/sl-sr.js')) + '\n');
      enginesBundled = true;
    }
  }
  if (!enginesBundled) {
    throw new Error('Expected 00-header.js in src/isolated/ to wrap bundled engines.');
  }

  const out = chunks.join('');
  checkJsSyntax(out, 'core/isolated.js');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ ${'core/isolated.js'.padEnd(18)} ${String(files.length + 2).padStart(2)} parts  ${kb.padStart(8)} KB`);
  return out;
}

function concatCss() {
  const abs = join(root, 'src/styles');
  const files = readdirSync(abs)
    .filter((f) => f.endsWith('.css') && !f.startsWith('.'))
    .sort();
  if (files.length === 0) throw new Error('No .css parts found in src/styles/');
  const out = files.map((f) => readTextLf(join(abs, f))).join('');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`✓ ${'core/content.css'.padEnd(18)} ${String(files.length).padStart(2)} parts  ${kb.padStart(8)} KB`);
  return out;
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
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, payload);
    central.push({ name: nameBuf, method, crc, csize: payload.length, usize: f.data.length, offset });
    offset += local.length + nameBuf.length + payload.length;
  }

  const cdStart = offset;
  for (const c of central) {
    const e = Buffer.alloc(46);
    e.writeUInt32LE(0x02014b50, 0);
    e.writeUInt16LE(20, 4);
    e.writeUInt16LE(20, 6);
    e.writeUInt16LE(0, 8);
    e.writeUInt16LE(c.method, 10);
    e.writeUInt16LE(time, 12);
    e.writeUInt16LE(date, 14);
    e.writeUInt32LE(c.crc, 16);
    e.writeUInt32LE(c.csize, 20);
    e.writeUInt32LE(c.usize, 24);
    e.writeUInt16LE(c.name.length, 28);
    e.writeUInt32LE((0o644 << 16) >>> 0, 38);
    e.writeUInt32LE(c.offset, 42);
    chunks.push(e, c.name);
    offset += e.length + c.name.length;
  }
  const cdSize = offset - cdStart;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(central.length, 8);
  eocd.writeUInt16LE(central.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Minimal CRX3 writer (zero dependencies — official Chrome CRX3 spec)
// ---------------------------------------------------------------------------
function encodeVarint(value) {
  const bytes = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function pbBytes(fieldNum, buf) {
  return Buffer.concat([
    encodeVarint((fieldNum << 3) | 2),
    encodeVarint(buf.length),
    buf
  ]);
}

function loadOrGenerateCrxKey() {
  const envKey = process.env.CRX_PRIVATE_KEY;
  if (envKey && envKey.trim()) {
    const normalized = envKey.includes('\\n') ? envKey.replace(/\\n/g, '\n') : envKey;
    return { key: createPrivateKey(normalized), source: 'env:CRX_PRIVATE_KEY' };
  }
  const localPem = join(root, 'extension.pem');
  if (existsSync(localPem)) {
    return { key: createPrivateKey(readFileSync(localPem, 'utf8')), source: 'extension.pem' };
  }
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { key: privateKey, source: 'ephemeral RSA-2048' };
}

function createCrx3(zipBuffer) {
  const { key: privateKey, source } = loadOrGenerateCrxKey();
  const publicKeyDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });

  // CRX ID = first 16 bytes of SHA-256(publicKeyDer)
  const crxId = createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
  const signedHeaderData = pbBytes(1, crxId);

  // Signature over: "CRX3 SignedData\0" + uint32LE(signedHeaderData.length) + signedHeaderData + zipBuffer
  const prefix = Buffer.from('CRX3 SignedData\0', 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(signedHeaderData.length, 0);

  const signer = createSign('RSA-SHA256');
  signer.update(prefix);
  signer.update(lenBuf);
  signer.update(signedHeaderData);
  signer.update(zipBuffer);
  const signature = signer.sign(privateKey);

  // CrxFileHeader protobuf:
  //   field 2 (sha256_with_rsa): AsymmetricKeyProof { field 1: public_key, field 2: signature }
  //   field 10000 (signed_header_data): SignedData
  const proof = Buffer.concat([pbBytes(1, publicKeyDer), pbBytes(2, signature)]);
  const header = Buffer.concat([pbBytes(2, proof), pbBytes(10000, signedHeaderData)]);

  const preamble = Buffer.alloc(12);
  preamble.write('Cr24', 0, 'ascii');
  preamble.writeUInt32LE(3, 4);
  preamble.writeUInt32LE(header.length, 8);

  return { crxBuffer: Buffer.concat([preamble, header, zipBuffer]), source };
}

function packCoreZip({ contentJs, isolatedJs, contentCss }) {
  const loaderManifest = JSON.parse(readTextLf(join(root, 'loader/manifest.json')));
  const coreMeta = existsSync(join(root, 'src/core-version.json'))
    ? JSON.parse(readTextLf(join(root, 'src/core-version.json')))
    : {};
  const loaderVersion = loaderManifest.version;
  const coreVersion = coreMeta.coreVersion || loaderVersion;

  const outDir = join(root, 'build');
  mkdirSync(outDir, { recursive: true });

  const files = [
    { name: 'content.js', data: Buffer.from(contentJs, 'utf8') },
    { name: 'isolated.js', data: Buffer.from(isolatedJs, 'utf8') },
    { name: 'content.css', data: Buffer.from(contentCss, 'utf8') },
    { name: 'core-config.json', data: Buffer.from(readTextLf(join(root, 'src/core-config.json')), 'utf8') },
    { name: 'core-version.json', data: Buffer.from(readTextLf(join(root, 'src/core-version.json')), 'utf8') }
  ];

  const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');
  const fileHashes = {};
  for (const f of files) {
    fileHashes[f.name] = sha256Hex(f.data);
  }
  const integrity = {
    version: coreVersion,
    loaderVersion,
    generatedAt: new Date().toISOString(),
    files: fileHashes
  };
  files.push({
    name: 'integrity.json',
    data: Buffer.from(JSON.stringify(integrity, null, 2) + '\n', 'utf8')
  });

  const coreZipBuffer = createZip(files);
  const coreZipPath = join(outDir, 'core.zip');
  writeFileSync(coreZipPath, coreZipBuffer);
  const kb = (coreZipBuffer.length / 1024).toFixed(1);
  console.log(`✓ build/${'core.zip'.padEnd(30)} ${String(files.length).padStart(2)} files   (${kb} KB compressed)`);
}

function packLoaderZipAndCrx() {
  const loaderDir = join(root, 'loader');
  const manifest = JSON.parse(readTextLf(join(loaderDir, 'manifest.json')));
  const slug = String(manifest.name || 'extension')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const zipName = 'loader.zip';
  const crxName = 'loader.crx';

  const outDir = join(root, 'build');
  mkdirSync(outDir, { recursive: true });

  for (const f of readdirSync(outDir)) {
    if (new RegExp(`^(${slug}-v[\\d.]+|loader)\\.(zip|crx)$`).test(f) && f !== zipName && f !== crxName) {
      unlinkSync(join(outDir, f));
      console.log(`- removed old ${f}`);
    }
  }

  // Pure Loader files ONLY — zero feature JS/CSS (content.js, isolated.js, content.css are fetched live from core.zip)
  const loaderFiles = [
    'manifest.json',
    'boot-dark.css',
    'background.js',
    'rules.json',
    'ui-m3.css',
    'popup.html',
    'popup.js',
    'updater.html',
    'updater.js',
    'offscreen.html',
    'offscreen.js',
    'ffmpeg-worker.js',
    'vendor/ffmpeg-core.js',
    'assets/allow-user-scripts.png'
  ];

  const files = loaderFiles.map((name) => {
    const fullPath = join(loaderDir, name);
    if (/\.(js|css|html|json)$/i.test(name)) {
      const normalized = readTextLf(fullPath);
      return { name, data: Buffer.from(normalized, 'utf8') };
    }
    return { name, data: readFileSync(fullPath) };
  });

  const iconFiles = new Set(Object.values(manifest.icons || {}));
  for (const iconPath of iconFiles) {
    files.push({ name: iconPath, data: readFileSync(join(loaderDir, iconPath)) });
  }

  const zipBuffer = createZip(files);
  const zipPath = join(outDir, zipName);
  writeFileSync(zipPath, zipBuffer);
  const kb = (zipBuffer.length / 1024).toFixed(1);
  console.log(`✓ build/${zipName.padEnd(30)} ${String(files.length).padStart(2)} files   (${kb} KB compressed, pure loader)`);

  const { crxBuffer, source } = createCrx3(zipBuffer);
  const crxPath = join(outDir, crxName);
  writeFileSync(crxPath, crxBuffer);
  const crxKb = (crxBuffer.length / 1024).toFixed(1);
  console.log(`✓ build/${crxName.padEnd(30)} CRX3      (${crxKb} KB, key: ${source})`);
}

console.log('Building Fish Acceleration (Pure Loader + Core)...');
for (const f of ['background.js', 'popup.js', 'updater.js', 'offscreen.js', 'ffmpeg-worker.js']) {
  checkJsSyntax(readTextLf(join(root, 'loader', f)), `loader/${f}`);
}
const contentJs = buildContentJs();
const isolatedJs = buildIsolatedJs();
const contentCss = concatCss();
packCoreZip({ contentJs, isolatedJs, contentCss });
packLoaderZipAndCrx();
console.log('Done. Pure Loader (loader.zip/loader.crx) & Core (core.zip) built in build/.');
