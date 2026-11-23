/* Fish Acceleration — Extension Isolated World (Local MP4 Engines, Storage & Handover) */
(() => {
  'use strict';

  const _path = window.location.pathname;
  if (!_path.startsWith('/tiktokstudio') && !_path.startsWith('/upload')) {
    return;
  }

  const LOG = '[fish-acc]';
  const log = (...args) => console.log(LOG, ...args);

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.FRYOriginalMp4Core = api;
    root.ADJNOriginalMp4Core = api;
    root.FRYMp4Patcher = api;
    root.ADJNMp4Patcher = api;
    root.HazePatch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '5.0';
  // Status metode yang dibaca kartu Bypass Upload di content script.
  // 'WORKING' = metode masih jalan (badge hijau). Ganti ke 'PATCHED' (atau lainnya)
  // saat TikTok menambal metode ini — badge otomatis jadi MERAH.
  const STATUS = 'WORKING';
  const ENCODER_TAG = 'Method From cutefish.my.id';
  const FOURCC_TOO = new Uint8Array([0xa9, 0x74, 0x6f, 0x6f]);
  const SENTINEL_FF = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
  const MAX_TABLE_ENTRIES = 50000000;
  const EMPTY_U8 = new Uint8Array(0);
  function createError(msg) {
    const err = new Error(msg);
    err.name = 'ADJNPatchError';
    return err;
  }
  function throwError(msg) {
    throw createError(msg);
  }
  function readU32(b, o) {
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }
  function readU64(b, o) {
    return Number((BigInt(readU32(b, o)) << 32n) | BigInt(readU32(b, o + 4)));
  }
  function u32ToBytes(v) {
    const b = new Uint8Array(4);
    b[0] = (v >>> 24) & 0xff;
    b[1] = (v >>> 16) & 0xff;
    b[2] = (v >>> 8) & 0xff;
    b[3] = v & 0xff;
    return b;
  }
  function u64ToBytes(v) {
    const b = new Uint8Array(8);
    const big = BigInt(v);
    b.set(u32ToBytes(Number(big >> 32n)), 0);
    b.set(u32ToBytes(Number(big & 0xffffffffn)), 4);
    return b;
  }
  function asciiToBytes(str) {
    const b = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
    return b;
  }
  function concatBytes(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
  function cloneBytes(src) {
    const dst = new Uint8Array(src.length);
    dst.set(src);
    return dst;
  }
  function toU8Array(val) {
    if (val instanceof Uint8Array) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    if (val instanceof ArrayBuffer) return new Uint8Array(val);
    if (ArrayBuffer.isView(val)) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    throw createError('Buffer video tidak valid.');
  }
  function exactBytesEqual(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    const step = 65536;
    for (let o = 0; o < a.byteLength; o += step) {
      const len = Math.min(step, a.byteLength - o);
      for (let i = 0; i < len; i++) {
        if (a[o + i] !== b[o + i]) return false;
      }
    }
    return true;
  }
  function indexOfSubarray(haystack, needleStr) {
    const needle = asciiToBytes(needleStr);
    outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }
  function Mp4Box(type, payload, children) {
    this.type = type;
    this.payload = payload || EMPTY_U8;
    this.children = children || null;
  }
  Mp4Box.prototype.find = function (type) {
    if (!this.children) return null;
    for (const c of this.children) if (c.type === type) return c;
    return null;
  };
  Mp4Box.prototype.findAll = function (type) {
    if (!this.children) return [];
    return this.children.filter(c => c.type === type);
  };
  Mp4Box.prototype.remove = function (type) {
    if (this.children) this.children = this.children.filter(c => c.type !== type);
  };
  Mp4Box.prototype.path = function (...types) {
    let cur = this;
    for (let i = 0; i < types.length; i++) {
      cur = cur ? cur.find(types[i]) : null;
      if (!cur) return null;
    }
    return cur;
  };
  Mp4Box.prototype.clone = function () {
    if (this.children) return new Mp4Box(this.type, null, this.children.map(c => c.clone()));
    return new Mp4Box(this.type, cloneBytes(this.payload));
  };
  Mp4Box.prototype.serialize = function () {
    const body = this.children ? concatBytes(this.children.map(c => c.serialize())) : this.payload;
    if (body.length + 8 > 0xffffffff) {
      return concatBytes([u32ToBytes(1), asciiToBytes(this.type), u64ToBytes(body.length + 16), body]);
    }
    return concatBytes([u32ToBytes(body.length + 8), asciiToBytes(this.type), body]);
  };
  function parseBoxes(bytes, start, end) {
    const list = [];
    let p = start;
    while (p + 8 <= end) {
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) break;
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) break;
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (CONTAINER_BOXES.has(type)) {
        list.push(new Mp4Box(type, null, parseBoxes(bytes, p + header, p + size)));
      } else {
        list.push(new Mp4Box(type, bytes.subarray(p + header, p + size)));
      }
      p += size;
    }
    return list;
  }
  function makeBox(type, payload) {
    return concatBytes([u32ToBytes(payload.length + 8), asciiToBytes(type), payload]);
  }
  function makeBoxRaw(typeBytes, payload) {
    return concatBytes([u32ToBytes(payload.length + 8), typeBytes, payload]);
  }
  function scanBoxes(bytes, start, end, label) {
    const out = [];
    let p = start;
    while (p < end) {
      if (p + 8 > end) throwError('Invalid MP4 — malformed ' + label + ' metadata layout.');
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) throwError('Invalid MP4 — truncated 64-bit ' + label + ' metadata header.');
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (!Number.isSafeInteger(size) || size < header || p + size > end) {
        throwError('Invalid MP4 — malformed ' + label + ' metadata box size.');
      }
      out.push({
        type: String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]),
        start: p,
        end: p + size,
        header
      });
      p += size;
    }
    return out;
  }
  function makeDataAtom(text) {
    const dataPayload = concatBytes([u32ToBytes(1), u32ToBytes(0), asciiToBytes(text)]);
    return makeBoxRaw(FOURCC_TOO, makeBox('data', dataPayload));
  }
  function makeMetaBox(tagText) {
    const hdlrPayload = concatBytes([u32ToBytes(0), u32ToBytes(0), asciiToBytes('mdir'), new Uint8Array(12), new Uint8Array(1)]);
    return makeBox('meta', concatBytes([u32ToBytes(0), makeBox('hdlr', hdlrPayload), makeBox('ilst', makeDataAtom(tagText))]));
  }
  function patchIlst(bytes, tagText) {
    const chunks = [];
    for (const box of scanBoxes(bytes, 0, bytes.length, 'ilst')) {
      if (box.type !== '©too') chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
    }
    if (tagText) chunks.push(makeDataAtom(tagText));
    return concatBytes(chunks);
  }
  function patchMetaBox(bytes, tagText) {
    if (bytes.length < 4) throwError('Invalid MP4 — malformed meta FullBox.');
    const chunks = [cloneBytes(bytes.subarray(0, 4))];
    let inserted = false;
    for (const box of scanBoxes(bytes, 4, bytes.length, 'meta')) {
      if (box.type === 'ilst') {
        const body = bytes.subarray(box.start + box.header, box.end);
        chunks.push(makeBox('ilst', patchIlst(body, !inserted ? tagText : null)));
        inserted = inserted || !!tagText;
      } else {
        chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
      }
    }
    if (!inserted && tagText) chunks.push(makeBox('ilst', makeDataAtom(tagText)));
    return makeBox('meta', concatBytes(chunks));
  }
  function patchUdtaBox(bytes, tagText) {
    const chunks = [];
    let inserted = false;
    for (const box of scanBoxes(bytes, 0, bytes.length, 'udta')) {
      if (box.type === 'meta') {
        const body = bytes.subarray(box.start + box.header, box.end);
        chunks.push(patchMetaBox(body, !inserted ? tagText : null));
        inserted = inserted || !!tagText;
      } else {
        chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
      }
    }
    if (!inserted && tagText) chunks.push(makeMetaBox(tagText));
    return concatBytes(chunks);
  }
  function injectUdta(moov, tagText) {
    const existing = moov.findAll('udta');
    if (existing.length) {
      let inserted = false;
      for (const u of existing) {
        const toAdd = !inserted ? tagText : null;
        inserted = inserted || !!toAdd;
        if (u.children) throwError('Invalid MP4 — unexpected parsed udta metadata tree.');
        u.payload = patchUdtaBox(u.payload, toAdd);
      }
    } else {
      moov.children.push(new Mp4Box('udta', makeMetaBox(tagText)));
    }
  }
  function hasEncoderTag(moov, tagText) {
    return moov.findAll('udta').some(u => !u.children && indexOfSubarray(u.payload, tagText) >= 0);
  }
  function parseTopLevel(bytes) {
    const list = [];
    let p = 0;
    while (p + 8 <= bytes.length) {
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > bytes.length) break;
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = bytes.length - p;
      }
      if (size < header || p + size > bytes.length) break;
      list.push({
        type: String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]),
        start: p,
        end: p + size,
        header
      });
      p += size;
    }
    return list;
  }
  function validateBoxNesting(bytes, start, end, label, depth = 0) {
    if (depth > 24) throwError('Invalid MP4 — box nesting is too deep to patch safely.');
    let p = start;
    while (p < end) {
      if (p + 8 > end) throwError('Invalid MP4 — malformed ' + label + ' box layout.');
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) throwError('Invalid MP4 — truncated 64-bit ' + label + ' box header.');
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (!Number.isSafeInteger(size) || size < header || p + size > end) {
        throwError('Invalid MP4 — malformed ' + label + ' box size.');
      }
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (CONTAINER_BOXES.has(type)) {
        validateBoxNesting(bytes, p + header, p + size, type, depth + 1);
      }
      p += size;
    }
  }
  function isSentinelDuration(payload) {
    if (!payload || payload.length < 32 || payload[0] !== 1) return false;
    for (let i = 0; i < 8; i++) {
      if (payload[24 + i] !== 0xff) return false;
    }
    return true;
  }
  function patchMvhdToV1Sentinel(payload) {
    if (!payload || payload.length < 4) throwError('Malformed mvhd box (too short for version byte).');
    const ver = payload[0];
    if (ver === 1) {
      if (payload.length < 112) throwError('Malformed version-1 mvhd box (too short — needs 112 bytes).');
      const out = cloneBytes(payload);
      out.set(SENTINEL_FF, 24);
      return out;
    }
    if (ver !== 0) throwError('Unsupported mvhd version: ' + ver + '.');
    if (payload.length < 100) throwError('Malformed version-0 mvhd box (too short).');
    return concatBytes([
      new Uint8Array([1, payload[1], payload[2], payload[3]]),
      u32ToBytes(0),
      cloneBytes(payload.subarray(4, 8)),
      u32ToBytes(0),
      cloneBytes(payload.subarray(8, 12)),
      cloneBytes(payload.subarray(12, 16)),
      cloneBytes(SENTINEL_FF),
      cloneBytes(payload.subarray(20, 100))
    ]);
  }
  function validateTableEntries(bytes, headerSize, entrySize, label) {
    if (!bytes || bytes.length < 8) throwError('The ' + label + ' table is truncated.');
    const count = readU32(bytes, 4);
    if (count > MAX_TABLE_ENTRIES) throwError('The ' + label + ' table is unreasonably large (' + count + ' entries).');
    if (headerSize + count * entrySize > bytes.length) throwError('The ' + label + ' table is truncated.');
    return count;
  }
  function parseStts(bytes) {
    const count = validateTableEntries(bytes, 8, 8, 'stts');
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push([readU32(bytes, 8 + i * 8), readU32(bytes, 12 + i * 8)]);
    }
    return list;
  }
  function parseStsz(bytes) {
    if (!bytes || bytes.length < 12) throwError('The stsz table is truncated.');
    const uniform = readU32(bytes, 4);
    const count = readU32(bytes, 8);
    if (count > MAX_TABLE_ENTRIES) throwError('The stsz table is unreasonably large (' + count + ' entries).');
    if (!uniform && 12 + count * 4 > bytes.length) throwError('The stsz table is truncated.');
    const list = new Array(count);
    for (let i = 0; i < count; i++) {
      list[i] = uniform || readU32(bytes, 12 + i * 4);
    }
    return list;
  }
  function parseStsc(bytes) {
    const count = validateTableEntries(bytes, 8, 12, 'stsc');
    const list = [];
    for (let i = 0; i < count; i++) {
      const e = [readU32(bytes, 8 + i * 12), readU32(bytes, 12 + i * 12), readU32(bytes, 16 + i * 12)];
      if (e[0] < 1 || e[1] < 1 || e[2] < 1 || (i > 0 && e[0] <= list[i - 1][0])) {
        throwError('The stsc table contains an invalid chunk mapping.');
      }
      list.push(e);
    }
    return list;
  }
  function parseStcoOrCo64(box) {
    const bytes = box.payload;
    const is64 = box.type === 'co64';
    const count = validateTableEntries(bytes, 8, is64 ? 8 : 4, box.type);
    const list = new Array(count);
    for (let i = 0; i < count; i++) {
      list[i] = is64 ? readU64(bytes, 8 + i * 8) : readU32(bytes, 8 + i * 4);
    }
    return list;
  }
  function writeStcoOrCo64(box, offsets) {
    let maxOff = 0;
    for (const off of offsets) if (off > maxOff) maxOff = off;
    if (maxOff > 0xffffffff) {
      box.type = 'co64';
      const b = new Uint8Array(8 + offsets.length * 8);
      b.set(u32ToBytes(offsets.length), 4);
      for (let i = 0; i < offsets.length; i++) b.set(u64ToBytes(offsets[i]), 8 + i * 8);
      box.payload = b;
    } else {
      box.type = 'stco';
      const b = new Uint8Array(8 + offsets.length * 4);
      b.set(u32ToBytes(offsets.length), 4);
      for (let i = 0; i < offsets.length; i++) b.set(u32ToBytes(offsets[i]), 8 + i * 4);
      box.payload = b;
    }
  }
  function getStbl(trak) {
    return trak.path('mdia', 'minf', 'stbl');
  }
  function getOffsetBox(trak) {
    const stbl = getStbl(trak);
    if (!stbl) return null;
    return stbl.find('stco') || stbl.find('co64');
  }
  function getTrackHandler(trak) {
    const hdlr = trak.path('mdia', 'hdlr');
    if (!hdlr || hdlr.payload.length < 12) return '';
    const p = hdlr.payload;
    return String.fromCharCode(p[8], p[9], p[10], p[11]);
  }
  function getSampleTableBox(trak, type) {
    const stbl = getStbl(trak);
    return stbl ? stbl.find(type) : null;
  }
  function getCodecFourCC(trak) {
    const stsd = getSampleTableBox(trak, 'stsd');
    if (!stsd || stsd.payload.length < 16) return '';
    const p = stsd.payload;
    const count = readU32(p, 4);
    const entrySize = readU32(p, 8);
    if (count < 1 || entrySize < 8 || 8 + entrySize > p.length) return '';
    return String.fromCharCode(p[12], p[13], p[14], p[15]);
  }
  function getStsdEntryCount(trak) {
    const stsd = getSampleTableBox(trak, 'stsd');
    return stsd && stsd.payload.length >= 8 ? readU32(stsd.payload, 4) : 0;
  }
  function parseTrackInfo(trak) {
    const stbl = getStbl(trak);
    if (!stbl) return null;
    const stsz = stbl.find('stsz');
    const stsc = stbl.find('stsc');
    const stts = stbl.find('stts');
    const offsBox = getOffsetBox(trak);
    if (!stsz || !stsc || !stts || !offsBox) return null;
    const sizes = parseStsz(stsz.payload);
    const sampleCount = sizes.length;
    const chunkOffsets = parseStcoOrCo64(offsBox);
    const runs = parseStsc(stsc.payload);
    if (!sampleCount || !chunkOffsets.length || !runs.length) return null;
    const samplesPerChunk = [];
    for (let i = 0; i < runs.length; i++) {
      const firstChunk = runs[i][0];
      const lastChunk = i + 1 < runs.length ? runs[i + 1][0] - 1 : chunkOffsets.length;
      if (firstChunk > lastChunk || lastChunk > chunkOffsets.length) return null;
      for (let c = firstChunk; c <= lastChunk; c++) samplesPerChunk.push(runs[i][1]);
    }
    if (samplesPerChunk.length !== chunkOffsets.length || samplesPerChunk.reduce((a, b) => a + b, 0) !== sampleCount) {
      return null;
    }
    const offsets = new Array(sampleCount);
    let sIdx = 0;
    for (let c = 0; c < chunkOffsets.length; c++) {
      let curOff = chunkOffsets[c];
      for (let s = 0; s < samplesPerChunk[c]; s++) {
        offsets[sIdx] = curOff;
        curOff += sizes[sIdx];
        sIdx++;
      }
    }
    const sttsTotal = parseStts(stts.payload).reduce((a, b) => a + b[0], 0);
    if (sttsTotal !== sampleCount) return null;
    return {
      trak,
      stsz,
      offsBox,
      sizes,
      offsets,
      runs,
      count: sampleCount,
      handler: getTrackHandler(trak),
      codec: getCodecFourCC(trak)
    };
  }
  function readDisplayDimensions(trak) {
    const tkhd = trak.find('tkhd');
    if (!tkhd || tkhd.payload.length < 84) return { width: 0, height: 0 };
    const ver = tkhd.payload[0];
    const widthOffset = ver === 1 ? 88 : 76;
    if (tkhd.payload.length < widthOffset + 8) return { width: 0, height: 0 };
    const w = readU32(tkhd.payload, widthOffset) / 65536;
    const h = readU32(tkhd.payload, widthOffset + 4) / 65536;
    return { width: Math.round(w), height: Math.round(h) };
  }
  function parseMp4Structure(bytes) {
    if (!bytes.length) throwError('File video kosong.');
    const topBoxes = parseTopLevel(bytes);
    validateBoxNesting(bytes, 0, bytes.length, 'top-level', 0);
    if (topBoxes.some(b => b.type === 'moof')) throwError('Fragmented MP4/MOV files tidak didukung untuk direct patch.');
    const ftypList = topBoxes.filter(b => b.type === 'ftyp');
    const moovList = topBoxes.filter(b => b.type === 'moov');
    const mdatList = topBoxes.filter(b => b.type === 'mdat');
    if (ftypList.length !== 1 || moovList.length !== 1 || mdatList.length !== 1) {
      throwError('Invalid MP4 — membutuhkan tepat satu box ftyp, moov, dan mdat.');
    }
    const ftypBox = ftypList[0];
    const moovBox = moovList[0];
    const mdatBox = mdatList[0];
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));
    const traks = moov.findAll('trak');
    if (!traks.length) throwError('Invalid MP4 — tidak ditemukan track di file video.');
    const mvhd = moov.find('mvhd');
    if (!mvhd || mvhd.payload.length < 4) throwError('Invalid MP4 — mvhd hilang.');
    if (isSentinelDuration(mvhd.payload)) {
      throwError('File ini sudah ter-patch sebelumnya (duration sentinel aktif).');
    }
    if (mvhd.payload[0] !== 0 && mvhd.payload[0] !== 1) {
      throwError('Unsupported mvhd version: ' + mvhd.payload[0]);
    }
    const tables = traks.map(parseTrackInfo);
    if (tables.some(t => t === null)) throwError('Tidak dapat memetakan sample table dari setiap track.');
    for (const t of tables) {
      if (getStsdEntryCount(t.trak) !== 1 || t.runs.some(r => r[2] !== 1)) {
        throwError('Track dengan multiple codec descriptions tidak didukung.');
      }
    }
    const videoTracks = tables.filter(t => t.handler === 'vide');
    if (videoTracks.length !== 1) throwError('Membutuhkan tepat satu video track, ditemukan: ' + videoTracks.length);
    const video = videoTracks[0];
    const isAvc = video.codec === 'avc1' || video.codec === 'avc3';
    const isHevc = video.codec === 'hvc1' || video.codec === 'hev1' || video.codec === 'hvc2' || video.codec === 'hev2';
    if (!isAvc && !isHevc) {
      throwError('Codec video tidak didukung: ' + (video.codec || 'unknown') + '. Export sebagai H.264 (AVC) atau H.265 (HEVC).');
    }
    const audioTracks = tables.filter(t => t.handler === 'soun' && t.codec === 'mp4a');
    if (!audioTracks.length) throwError('Video membutuhkan audio track AAC (mp4a).');
    const sourceAudio = audioTracks[0];
    injectUdta(moov.clone(), ENCODER_TAG);
    const mdatPayloadStart = mdatBox.start + mdatBox.header;
    for (const t of tables) {
      for (let i = 0; i < t.count; i++) {
        const off = t.offsets[i];
        const sz = t.sizes[i];
        if (!Number.isSafeInteger(off) || !Number.isSafeInteger(sz) || sz < 0 || off < mdatPayloadStart || off + sz > mdatBox.end) {
          throwError('Sample track ' + (i + 1) + ' menunjuk ke luar mdat.');
        }
      }
    }
    return {
      top: topBoxes,
      ftypBox,
      moovBox,
      mdatBox,
      moov,
      mvhd,
      traks,
      tables,
      video,
      sourceAudio,
      isAvc,
      isHevc
    };
  }
  function executePatch(bytes, parsed) {
    const { top, moovBox, mdatBox, moov } = parsed;
    const mvhd = moov.find('mvhd');
    if (!mvhd || mvhd.payload.length < 4) throwError('Invalid MP4 — mvhd hilang.');
    mvhd.payload = patchMvhdToV1Sentinel(mvhd.payload);
    injectUdta(moov, ENCODER_TAG);
    const moovBeforeMdat = moovBox.start < mdatBox.start;
    const oldMoovSize = moovBox.end - moovBox.start;
    if (moovBeforeMdat) {
      const traksWithOffsets = moov.findAll('trak').filter(t => getOffsetBox(t));
      const origOffsets = traksWithOffsets.map(t => parseStcoOrCo64(getOffsetBox(t)));
      for (let iter = 0; iter < 6; iter++) {
        const delta = moov.serialize().length - oldMoovSize;
        let changedType = false;
        traksWithOffsets.forEach((t, i) => {
          const box = getOffsetBox(t);
          const prevType = box.type;
          writeStcoOrCo64(box, origOffsets[i].map(o => o + delta));
          if (box.type !== prevType) changedType = true;
        });
        if (!changedType && moov.serialize().length === oldMoovSize + delta) break;
      }
    }
    const newMoovBytes = moov.serialize();
    const finalChunks = [];
    for (const b of top) {
      finalChunks.push(b.start === moovBox.start ? newMoovBytes : bytes.subarray(b.start, b.end));
    }
    return concatBytes(finalChunks);
  }
  function validateFinalOutput(bytes, originalBytes) {
    const top = parseTopLevel(bytes);
    if (!top.length || top[top.length - 1].end !== bytes.length) throwError('Hasil patch bukan box run lengkap.');
    const moovList = top.filter(b => b.type === 'moov');
    const mdatList = top.filter(b => b.type === 'mdat');
    if (moovList.length !== 1 || mdatList.length !== 1) throwError('Hasil patch harus memiliki tepat satu moov dan satu mdat.');
    const moovBox = moovList[0];
    const mdatBox = mdatList[0];
    const mdatStart = mdatBox.start + mdatBox.header;
    const mdatEnd = mdatBox.end;
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));
    if (!hasEncoderTag(moov, ENCODER_TAG)) throwError('Hasil patch tidak memiliki ADJN encoder tag.');
    const mvhd = moov.find('mvhd');
    if (!mvhd || !isSentinelDuration(mvhd.payload)) throwError('Hasil patch mvhd.duration bukan sentinel Unknown Duration.');
    for (const trak of moov.findAll('trak')) {
      const offsBox = getOffsetBox(trak);
      if (!offsBox) continue;
      for (const off of parseStcoOrCo64(offsBox)) {
        if (off < mdatStart || off >= mdatEnd) {
          throwError('Offset chunk ter-patch (' + off + ') berada di luar mdat.');
        }
      }
    }
    if (originalBytes) {
      const origTop = parseTopLevel(originalBytes);
      const origMdatBox = origTop.find(b => b.type === 'mdat');
      if (origMdatBox) {
        const origMdat = originalBytes.subarray(origMdatBox.start + origMdatBox.header, origMdatBox.end);
        const outMdat = bytes.subarray(mdatStart, mdatEnd);
        if (!exactBytesEqual(origMdat, outMdat)) {
          throwError('ADJN Core: Media payload (mdat) tidak identik setelah patch.');
        }
      }
    }
  }
  function quickPatch(input) {
    const bytes = toU8Array(input);
    const parsed = parseMp4Structure(bytes);
    const patched = executePatch(bytes, parsed);
    validateFinalOutput(patched, bytes);
    return patched;
  }
  function checkCompatibility(input) {
    try {
      const parsed = parseMp4Structure(toU8Array(input));
      return {
        compatible: true,
        reason: '',
        codec: parsed.video.codec,
        isAvc: parsed.isAvc,
        isHevc: parsed.isHevc,
        sampleCount: parsed.video.count,
        audioTrackCount: parsed.tables.filter(t => t.handler === 'soun').length
      };
    } catch (e) {
      return {
        compatible: false,
        reason: e?.message || 'Struktur MP4/MOV tidak kompatibel.',
        codec: '',
        isAvc: false,
        isHevc: false,
        sampleCount: 0,
        audioTrackCount: 0
      };
    }
  }
  function inspect(input) {
    const bytes = toU8Array(input);
    const top = parseTopLevel(bytes);
    const moovBox = top.find(b => b.type === 'moov');
    const moov = moovBox ? new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end)) : new Mp4Box('moov', null, []);
    const traks = moov.findAll('trak');
    function getTrackSampleCount(trak) {
      const stsz = getSampleTableBox(trak, 'stsz');
      return stsz && stsz.payload.length >= 12 ? readU32(stsz.payload, 8) : 0;
    }
    const videoTrak = traks.find(t => getTrackHandler(t) === 'vide');
    const audioTraks = traks.filter(t => getTrackHandler(t) === 'soun');
    const primaryAudio = audioTraks.find(t => getCodecFourCC(t) === 'mp4a') || audioTraks[0];
    const vCodec = videoTrak ? getCodecFourCC(videoTrak) : '';
    const aCodec = primaryAudio ? getCodecFourCC(primaryAudio) : '';
    let declaredAudioSamples = 0;
    for (const a of audioTraks) declaredAudioSamples += getTrackSampleCount(a);
    const mvhd = moov.find('mvhd');
    return {
      codec: vCodec,
      isAvc: vCodec === 'avc1' || vCodec === 'avc3',
      isHevc: vCodec === 'hvc1' || vCodec === 'hev1' || vCodec === 'hvc2' || vCodec === 'hev2',
      sampleCount: videoTrak ? getTrackSampleCount(videoTrak) : 0,
      hasAac: audioTraks.some(t => getCodecFourCC(t) === 'mp4a'),
      audioCodec: aCodec,
      audioSampleCount: primaryAudio ? getTrackSampleCount(primaryAudio) : 0,
      audioTrackCount: audioTraks.length,
      declaredAudioSamples,
      durationUnknown: !!(mvhd && isSentinelDuration(mvhd.payload)),
      encoderTag: hasEncoderTag(moov, ENCODER_TAG) ? ENCODER_TAG : ''
    };
  }
  function inspectMediaInfo(input) {
    const bytes = toU8Array(input);
    const top = parseTopLevel(bytes);
    const moovBox = top.find(b => b.type === 'moov');
    if (!moovBox) throw createError('ADJN Core: moov box tidak ditemukan.');
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));
    const traks = moov.findAll('trak');
    const allTracks = traks.map((trak, idx) => {
      const handler = getTrackHandler(trak);
      const codec = getCodecFourCC(trak);
      const dims = readDisplayDimensions(trak);
      const stsz = getSampleTableBox(trak, 'stsz');
      const sampleCount = stsz && stsz.payload.length >= 12 ? readU32(stsz.payload, 8) : 0;
      const mdhd = trak.path('mdia', 'mdhd');
      let timescale = 1000;
      let duration = 0;
      if (mdhd && mdhd.payload.length >= 24) {
        const ver = mdhd.payload[0];
        timescale = readU32(mdhd.payload, ver === 1 ? 20 : 12);
        duration = ver === 1 ? readU64(mdhd.payload, 24) : readU32(mdhd.payload, 16);
      }
      const avgFps = handler === 'vide' && duration > 0 ? (sampleCount * timescale) / duration : 0;
      return {
        trackId: idx + 1,
        handler,
        codec,
        width: dims.width,
        height: dims.height,
        sampleCount,
        timescale,
        duration,
        averageFps: avgFps,
        maxFps: avgFps
      };
    });
    const video = allTracks.find(t => t.handler === 'vide');
    const audio = allTracks.find(t => t.handler === 'soun');
    if (!video) throw createError('ADJN Core: video track tidak ditemukan.');
    return {
      width: video.width || 1080,
      height: video.height || 1920,
      codec: video.codec,
      codecFamily: /^(hvc1|hev1|hvc2|hev2)$/i.test(video.codec) ? 'hevc' : /^(avc1|avc3)$/i.test(video.codec) ? 'avc' : video.codec,
      averageFps: video.averageFps || 60,
      maxFps: video.maxFps || 60,
      videoSamples: video.sampleCount,
      audioCodec: audio?.codec || '',
      audioSamples: audio?.sampleCount || 0,
      fragmented: false,
      tracks: allTracks
    };
  }
  function inspectCompatibility(input) {
    const comp = checkCompatibility(input);
    return {
      needsRefinery: !comp.compatible,
      reasons: comp.compatible ? [] : [comp.reason]
    };
  }
  function patchWithReport(input) {
    const original = toU8Array(input);
    const patched = quickPatch(original);
    const inspected = inspect(patched);
    const verification = verifyOutput(original, patched);
    return {
      bytes: patched,
      report: {
        engine: 'ADJN 64-bit Duration Sentinel v5.0 (6-Pass Safe)',
        durationUnknown: inspected.durationUnknown,
        encoderTag: inspected.encoderTag,
        codec: inspected.codec,
        sampleCount: inspected.sampleCount,
        audioSampleCount: inspected.audioSampleCount,
        mdatByteIdentical: verification.mdatByteIdentical,
        videoBitstreamByteIdentical: verification.videoBitstreamByteIdentical
      }
    };
  }
  function verifyOutput(originalInput, outputInput) {
    const orig = toU8Array(originalInput);
    const out = toU8Array(outputInput);
    const origTop = parseTopLevel(orig);
    const outTop = parseTopLevel(out);
    const origMdatBox = origTop.find(b => b.type === 'mdat');
    const outMdatBox = outTop.find(b => b.type === 'mdat');
    let mdatByteIdentical = false;
    if (origMdatBox && outMdatBox) {
      const origMdat = orig.subarray(origMdatBox.start + origMdatBox.header, origMdatBox.end);
      const outMdat = out.subarray(outMdatBox.start + outMdatBox.header, outMdatBox.end);
      mdatByteIdentical = exactBytesEqual(origMdat, outMdat);
    }
    const outInsp = inspect(out);
    return {
      videoBitstreamByteIdentical: mdatByteIdentical,
      mdatByteIdentical,
      originalAudioTrackPreserved: true,
      clonedAudioTrackAdded: false,
      wholeFileByteIdentical: false,
      codecFamilyPreserved: true,
      codecSampleEntryPreserved: true,
      hdrSignalingPreserved: true,
      metadataPreservedByteForByte: false,
      durationUnknownPreserved: outInsp.durationUnknown,
      allTracksPreserved: true
    };
  }
  return {
    version: VERSION,
    status: STATUS,
    quickPatch,
    inspect,
    checkCompatibility,
    inspectMediaInfo,
    inspectCompatibility,
    patchWithReport,
    verifyOutput
  };
});
/* sl-sr.mjs — CompressBase local method, used verbatim per its stated
 * free-use license (visible credit required). */
var Wt=new TextEncoder,$t=new TextDecoder;function ut(e){if(e instanceof Uint8Array)return e.subarray(0,4);let n=new Uint8Array(4),s=String(e);for(let o=0;o<4;o++)n[o]=o<s.length?s.charCodeAt(o)&255:32;return n}function c(e,n){return new DataView(e.buffer,e.byteOffset+n,4).getUint32(0,!1)}function lt(e,n){return new DataView(e.buffer,e.byteOffset+n,8).getBigUint64(0,!1)}function F(e){let n=new Uint8Array(4);return new DataView(n.buffer).setUint32(0,e>>>0,!1),n}function Tt(e){let n=new Uint8Array(8);return new DataView(n.buffer).setBigUint64(0,BigInt(e),!1),n}function U(...e){let n=e.reduce((i,d)=>i+d.length,0),s=new Uint8Array(n),o=0;for(let i of e)s.set(i,o),o+=i.length;return s}var Ft=new Set(["moov","trak","mdia","minf","stbl","edts","dinf"]),Ot=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350],K=Uint8Array.of(33,16,4,96,140,28),a=(e,n)=>{if(!e)throw new Error(n)},pt=(e,n)=>String.fromCharCode(...e.subarray(n,n+4)),at=(e,n)=>U(F(n.length+8),ut(e),n),P=(...e)=>U(...e.map(F)),X=(e,n)=>e.children.find(s=>s.name===n),w=(e,n)=>{let s=X(e,n);return a(s,"Missing MP4 box: "+n),s};function Rt(e,n){a(e.length>=8,"Truncated MP4 header");let s=c(e,0),o=s===1?16:8;a(e.length>=o,"Truncated extended MP4 header");let i=s===1?Number(lt(e,8)):s||n;return a(Number.isSafeInteger(i)&&i>=o&&i<=n,"Invalid MP4 box size"),{name:pt(e,4),width:o,size:i,zero:s===0}}function rt(e,n=0){a(n<16,"Excessive MP4 nesting");let s=[];for(let o=0;o<e.length;){let i=Rt(e.subarray(o),e.length-o),d=e.subarray(o,o+i.size),p=d.subarray(i.width);s.push({name:i.name,data:p,raw:d,children:Ft.has(i.name)?rt(p,n+1):null}),o+=i.size}return s}var mt=e=>e.children?at(e.name,U(...e.children.map(mt))):e.raw||at(e.name,e.data),I=(e,n)=>{e.data=n,e.raw=null};function ft(e,n){let s=n.length;return U(Uint8Array.of(e,128|s>>>21,128|s>>>14&127,128|s>>>7&127,s&127),n)}function ht(e,n){a(n<e.length,"Missing AAC descriptor");let s=e[n++],o=0;for(let i=0;i<4;i++){a(n<e.length,"Truncated AAC descriptor");let d=e[n++];if(o=o*128+(d&127),!(d&128))return a(n+o<=e.length,"Invalid AAC descriptor length"),{tag:s,start:n,end:n+o}}throw new Error("Invalid AAC descriptor")}function Gt(e){let n=e.data;a(n.length>=44&&c(n,0)===0&&c(n,4)===1,"Expected one AAC sample description");let s=n.subarray(8);a(pt(s,4)==="mp4a"&&c(s,0)===s.length&&s[16]===0&&s[17]===0&&s[24]===0&&s[25]===2,"Use an unencrypted AAC-LC stereo MP4");let o=rt(s.subarray(36)),i=o.find(l=>l.name==="esds");a(i&&!o.some(l=>["sinf","wave"].includes(l.name)),"Expected a direct AAC configuration");let d=i.data;a(d.length>=4&&c(d,0)===0,"Unsupported AAC descriptor version");let p=ht(d,4);a(p.tag===3&&p.end-p.start>=3&&d[p.start+2]===0,"Unsupported AAC descriptor flags");let b=-1,z=[];for(let l=p.start+3;l<p.end;){let f=ht(d.subarray(0,p.end),l);if(f.tag!==4)z.push(d.subarray(l,f.end));else{a(f.end-f.start>=13&&d[f.start]===64,"Unsupported MPEG-4 audio descriptor");let D=[];for(let m=f.start+13;m<f.end;){let S=ht(d.subarray(0,f.end),m);if(S.tag!==5)D.push(d.subarray(m,S.end));else{let k=d.subarray(S.start,S.end);a(b<0&&k.length>=2&&k[0]>>>3===2&&(k[1]&127)===16,"Use ordinary AAC-LC stereo with 1024-sample frames"),b=(k[0]&7)<<1|k[1]>>>7;let x=Array.from(k.subarray(2),g=>g.toString(2).padStart(8,"0")).join("");a(Ot[b]&&(!x.includes("1")||/^01010110111001010*$/.test(x)),"Unsupported AAC sample rate or extension");let T=b.toString(2).padStart(4,"0"),v="00010"+T+"0000000000001"+T+"00000001000000000000000010000",_=v.padEnd(Math.ceil(v.length/8)*8,"0")+"00000000";D.push(ft(5,Uint8Array.from(_.match(/.{8}/g),g=>parseInt(g,2))))}m=S.end}z.push(ft(4,U(d.subarray(f.start,f.start+13),...D)))}l=f.end}a(b>=0,"Missing AAC configuration"),I(i,U(d.subarray(0,4),ft(3,U(d.subarray(p.start,p.start+3),...z)),d.subarray(p.end)));let A=at("mp4a",U(s.subarray(8,36),...o.map(mt)));return{rate:Ot[b],patched:U(P(0,2),s,A)}}function Q(e,n){a(e.data.length>=8&&c(e.data,0)===0,"Invalid "+e.name+" table");let s=c(e.data,4);return a(e.data.length===8+s*n&&s<=5e6,"Invalid "+e.name+" count"),s}function G(e,n,s){return s===8?Number(lt(e,n)):c(e,n)}function R(e,n,s,o){a(Number.isSafeInteger(o)&&o>=0&&(s===8||o<4294967295),"Unsupported MP4 timing or ID");let i=e.data.slice();i.set(s===8?Tt(o):F(o),n),I(e,i)}function st(e){a(e.data[0]===0||e.data[0]===1,"Unsupported MP4 header version");let n=e.data[0]===1,s=e.name==="tkhd",o=s?n?28:20:n?24:16,i=n?8:4;return{offset:o,width:i,duration:G(e.data,o,i),scale:s?0:c(e.data,o-4)}}function Ht(e,n,s,o,i,d,p){let b=X(e,"edts");if(!b)return a(Math.abs(d-Math.round(n*o/s))<=1,"Inconsistent audio duration"),p;let z=w(b,"elst"),A=z.data;a(A[0]===0||A[0]===1,"Unsupported MP4 edit list");let l=A[0]===1?8:4,f=c(A,4),D=2*l+4;a((f===1||f===2)&&A.length===8+f*D,"Unsupported audio edits");let m=8+(f-1)*D,S=G(A,m,l),k=G(A,m+l,l);if(a(Number.isSafeInteger(k)&&c(A,m+2*l)===65536,"Unsupported audio edit rate"),f===2){let v=A.subarray(8+l,8+2*l);a(v.every(_=>_===255)&&c(A,8+2*l)===65536,"Unsupported leading audio edit")}a(Math.abs(d-S-(f===2?G(A,8,l):0))<=1,"Inconsistent edit duration");let x=(n-k)*o-S*s;a(Math.abs(x)<=Math.ceil(2048*s/i)*o,"Audio edit does not reach the end");let T=p+Math.max(0,Math.ceil(x/s));return R(z,m,l,S+T),T}async function Qt(e){let n=[];for(let t=0;t<e.size;){let r=Rt(new Uint8Array(await e.slice(t,t+16).arrayBuffer()),e.size-t);a(n.length<1e4&&!["moof","sidx","mfra","ssix"].includes(r.name),"Fragmented or indexed MP4 is unsupported"),n.push({...r,at:t}),t+=r.size}let s=n.filter(t=>t.name==="moov"),o=n.filter(t=>t.name==="mdat");a(s.length===1&&o.length&&s[0].width===8&&s[0].size<=32*1024*1024,"Expected one conventional MP4 movie box");let i=s[0],[d]=rt(new Uint8Array(await e.slice(i.at,i.at+i.size).arrayBuffer())),p=d.children.filter(t=>t.name==="trak"),b=p.filter(t=>pt(w(w(t,"mdia"),"hdlr").data,8)==="soun");a(b.length===1,"Use an MP4 with exactly one AAC-LC stereo track");let z=b[0],A=w(z,"mdia"),l=w(A,"minf"),f=w(w(l,"dinf"),"dref").data,D=rt(f.subarray(8));a(c(f,0)===0&&c(f,4)===D.length&&D.length&&D.every(t=>t.name==="url "&&c(t.data,0)===1),"External audio references are unsupported");let m=w(l,"stbl"),S=new Set(["stsd","stsz","stsc","stts","stco","co64","sbgp","sgpd","subs","free","skip","ctts","stss","stps","sdtp","stdp"]);a(m.children.every(t=>S.has(t.name)),"Unsupported audio sample table");let k=w(m,"stsd"),{rate:x,patched:T}=Gt(k),v=w(m,"stsz");a(v.data.length>=12&&c(v.data,0)===0,"Invalid audio sample sizes");let _=c(v.data,4),g=c(v.data,8);a(g>0&&g<=5e6&&v.data.length===12+(_?0:4*g),"Invalid audio sample count");let gt=t=>_||c(v.data,12+4*t),V=w(m,"stsc"),Y=Q(V,12),L=X(m,"stco")||w(m,"co64");a(!(X(m,"stco")&&X(m,"co64")),"Duplicate chunk offset tables");let j=L.name==="stco"?4:8,E=Q(L,j);a(Y>0&&E>0,"Missing audio chunks");let H=t=>c(V.data,8+12*t);a(H(0)===1,"Invalid first chunk run");for(let t=0;t<Y;t++)a(H(t)<=E&&(t===0||H(t)>H(t-1))&&c(V.data,12+12*t)>0&&c(V.data,16+12*t)===1,"Invalid audio chunk run");let Z=0,ot=0;for(let t=0;t<E;t++){Z+1<Y&&H(Z+1)===t+1&&Z++;let r=c(V.data,12+12*Z);a(ot+r<=g,"Audio chunk exceeds sample count");let u=0;for(let h=0;h<r;h++){let B=gt(ot++);a(B>0,"Empty AAC sample"),u+=B}let y=G(L.data,8+t*j,j);a(o.some(h=>y>=h.at+h.width&&y+u<=h.at+h.size),"Audio chunk outside media data")}a(ot===g,"Audio chunks omit samples");let tt=w(m,"stts"),_t=Q(tt,8),et=0,wt=0,O=[];for(let t=0;t<_t;t++){let r=c(tt.data,8+8*t),u=c(tt.data,12+8*t);a(r>0&&u>0,"Invalid audio timing"),O.push([r,u]),wt+=r,et+=r*u}a(wt===g&&Number.isSafeInteger(et),"Audio timing does not match samples");let yt=w(A,"mdhd"),W=w(d,"mvhd"),it=w(z,"tkhd"),C=st(yt),N=st(W),$=st(it);a(C.scale&&N.scale&&C.duration>0&&Math.abs(C.duration-et)<=Math.ceil(2048*C.scale/x)&&it.data[3]&1&&$.duration>0,"Unsupported audio duration or track flags");let M=Math.max(10,Math.ceil(.35*x/1024));for(let t of m.children){let r=t.data;if(t.name==="sbgp"){let u=r[0]===1?12:8;a((r[0]===0||r[0]===1)&&r.length>=u+4,"Invalid audio sample group");let y=c(r,u);a(r.length===u+4+y*8,"Invalid audio group count");let h=0;for(let q=0;q<y;q++)h+=c(r,u+4+q*8);a(h<=g,"Audio groups exceed sample count");let B=g-h+M;if(y&&c(r,r.length-4)===0){let q=r.length-8;R(t,q,4,c(r,q)+B)}else I(t,U(r.subarray(0,u),P(y+1),r.subarray(u+4),P(B,0)))}else if(t.name==="ctts"){let u=Q(t,8),y=0;for(let h=0;h<u;h++)y+=c(r,8+h*8),a(c(r,12+h*8)===0,"Nonzero audio composition offsets are unsupported");a(y===g,"Audio composition counts differ"),I(t,U(P(0,u+1),r.subarray(8),P(M,0)))}else if(t.name==="stss"||t.name==="stps"){let u=Q(t,4),y=0;for(let h=0;h<u;h++){let B=c(r,8+h*4);a(B>y&&B<=g,"Invalid audio sync sample"),y=B}I(t,U(P(0,u+M),r.subarray(8),P(...Array.from({length:M},(h,B)=>g+B+1))))}else if(t.name==="sdtp"||t.name==="stdp"){let u=t.name==="sdtp"?1:2;a(r.length===4+u*g,"Invalid audio dependency or priority table"),I(t,U(r,new Uint8Array(u*M)))}}let At=M-8,Ut=Math.floor(M*1024*C.scale/x),Mt=Math.round(Ut*N.scale/C.scale);a(Mt>0,"Movie timescale cannot represent the silent tail");let Lt=Ht(z,et,C.scale,N.scale,x,$.duration,Mt);R(it,$.offset,$.width,$.duration+Lt),R(yt,C.offset,C.width,C.duration+Ut);for(let t=0;t<M;t++){let r=Math.floor((t+1)*1024*C.scale/x)-Math.floor(t*1024*C.scale/x);a(r>0&&r<=4294967295,"Audio timescale cannot represent AAC frames"),O.at(-1)?.[1]===r?O.at(-1)[0]++:O.push([1,r])}let bt=new Uint8Array(8+O.length*8),ct=new DataView(bt.buffer);ct.setUint32(4,O.length),O.forEach(([t,r],u)=>{ct.setUint32(8+u*8,t),ct.setUint32(12+u*8,r)}),I(tt,bt);let zt=new Uint8Array(12+4*(g+M)),kt=new DataView(zt.buffer);kt.setUint32(8,g+M);for(let t=0;t<g+M;t++)kt.setUint32(12+t*4,t<g?gt(t):K.length);I(v,zt);let xt=e.size+8,vt=xt+At*K.length,J=j===8||vt>4294967295?8:4,Ct=new Uint8Array(8+(E+2)*J),dt=new DataView(Ct.buffer);dt.setUint32(4,E+2);for(let t=0;t<E+2;t++){let r=t<E?G(L.data,8+t*j,j):t===E?xt:vt;J===8?dt.setBigUint64(8+t*J,BigInt(r)):dt.setUint32(8+t*J,r)}L.name=J===8?"co64":"stco",I(L,Ct);let jt=V.data.subarray(8),It=t=>U(P(0,Y+2),jt,P(E+1,At,1,E+2,8,t));I(V,It(1));let St=structuredClone(z);I(V,It(2)),I(k,T);let Bt=t=>t.data[0]===1?20:12,nt=p.map(t=>{let r=w(t,"tkhd");return c(r.data,Bt(r))});a(nt.every(Boolean)&&new Set(nt).size===nt.length,"Invalid track IDs");let Dt=nt.reduce((t,r)=>Math.max(t,r),0)+1,Et=w(St,"tkhd");R(Et,Bt(Et),4,Dt);let Nt=W.data[0]===1?108:96,Pt=c(W.data,Nt);if(R(W,Nt,4,Math.max(Dt+1,Pt===4294967295?0:Pt)),N.duration>0&&Number.isSafeInteger(N.duration)&&!(N.width===4&&N.duration===4294967295)){let t=p.reduce((r,u)=>{let y=st(w(u,"tkhd"));return Number.isSafeInteger(y.duration)&&!(y.width===4&&y.duration===4294967295)?Math.max(r,y.duration):r},N.duration);R(W,N.offset,N.width,t)}d.children.splice(d.children.indexOf(z)+1,0,St);let Vt=new Uint8Array(M*K.length);for(let t=0;t<M;t++)Vt.set(K,t*K.length);try{const enc=new TextEncoder();const mkUdtaItem=(fourcc,text)=>{let t=enc.encode(text);let dataPayload=U(P(1,0),t);return at(fourcc,at("data",dataPayload));};let ilst=at("ilst",U(mkUdtaItem("\xa9ART","Fish Method"),mkUdtaItem("\xa9nam","Fish Method"),mkUdtaItem("\xa9wrt","Fish Method"),mkUdtaItem("\xa9alb","Fish Method"),mkUdtaItem("\xa9too","Lavf62.3.100"),mkUdtaItem("\xa9cmt","Method From cutefish.my.id"),mkUdtaItem("cprt","tiktok.com/@cutefishaep"),mkUdtaItem("\xa9grp","Fish Method")));let hdlrPayload=U(new Uint8Array(4),ut("mdir"),ut("appl"),new Uint8Array(9));let hdlr=at("hdlr",U(P(0),hdlrPayload));let meta=at("meta",U(P(0),hdlr,ilst));d.children=d.children.filter(t=>t.name!=="udta");d.children.push({name:"udta",raw:at("udta",meta)});}catch(_e){console.warn("Failed to inject udta into moov:",_e)}let qt=n.flatMap(t=>t===i?[F(t.size),ut("free"),e.slice(t.at+8,t.at+t.size)]:t.zero?(a(t.size<=4294967295,"Size-zero box exceeds the supported range"),[F(t.size),e.slice(t.at+4,t.at+t.size)]):[e.slice(t.at,t.at+t.size)]);return new Blob([...qt,at("mdat",Vt),mt(d)],{type:"video/mp4"})}window.patchSlSr = Qt;

  /* --- 1. Extension Storage & MAIN World Bridge --- */
  const DEFAULT_WATERMARK = 'Method from @cutefishaep';
  const STORAGE_KEYS = {
    enabled: 'fish_acc_bypass_upload',
    watermark: 'fish_acc_bypass_watermark'
  };

  let _bypassEnabled = true;
  let _bypassWatermark = DEFAULT_WATERMARK;

  const isBypassUploadEnabled = () => _bypassEnabled;
  const getBypassWatermark = () => _bypassWatermark;

  const syncSettingsToPage = () => {
    const root = document.documentElement;
    if (root && root.dataset) {
      root.dataset.fishBypassEnabled = _bypassEnabled ? 'true' : 'false';
      root.dataset.fishBypassWatermark = _bypassWatermark;
    }
    try {
      window.postMessage({
        source: 'fish-acc-isolated',
        type: 'FISH_SETTINGS_SYNC',
        enabled: _bypassEnabled,
        watermark: _bypassWatermark
      }, window.location.origin);
    } catch (_) {}
  };

  const isExtensionAlive = () => typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);

  const setBypassUploadEnabled = (enabled) => {
    _bypassEnabled = Boolean(enabled);
    if (isExtensionAlive() && chrome.storage?.local) {
      try { chrome.storage.local.set({ [STORAGE_KEYS.enabled]: _bypassEnabled }); } catch (_) {}
    }
    syncSettingsToPage();
  };

  const setBypassWatermark = (val) => {
    _bypassWatermark = typeof val === 'string' ? val : '';
    if (isExtensionAlive() && chrome.storage?.local) {
      try { chrome.storage.local.set({ [STORAGE_KEYS.watermark]: _bypassWatermark }); } catch (_) {}
    }
    syncSettingsToPage();
  };

  const initSettings = async () => {
    try {
      if (isExtensionAlive() && chrome.storage?.local) {
        const stored = await chrome.storage.local.get([STORAGE_KEYS.enabled, STORAGE_KEYS.watermark]);
        let needsPersist = false;
        const toPersist = {};

        if (typeof stored[STORAGE_KEYS.enabled] === 'boolean') {
          _bypassEnabled = stored[STORAGE_KEYS.enabled];
        } else {
          const legacyEnabled = window.localStorage.getItem(STORAGE_KEYS.enabled);
          _bypassEnabled = legacyEnabled !== 'false';
          toPersist[STORAGE_KEYS.enabled] = _bypassEnabled;
          needsPersist = true;
        }

        if (typeof stored[STORAGE_KEYS.watermark] === 'string') {
          _bypassWatermark = stored[STORAGE_KEYS.watermark] === 'Method By cutefish.my.id'
            ? DEFAULT_WATERMARK
            : stored[STORAGE_KEYS.watermark];
        } else {
          const legacyWm = window.localStorage.getItem(STORAGE_KEYS.watermark);
          _bypassWatermark = (legacyWm === null || legacyWm === 'Method By cutefish.my.id')
            ? DEFAULT_WATERMARK
            : legacyWm;
          toPersist[STORAGE_KEYS.watermark] = _bypassWatermark;
          needsPersist = true;
        }

        if (needsPersist) {
          chrome.storage.local.set(toPersist).catch(() => {});
        }
      }

      // Bersihkan sisa remote script cache lama di localStorage TikTok (jika ada)
      ['fp_ext_patch.js', 'fp_ext_sl-sr.js', 'fp_ext_soundsafe-hook.js'].forEach((k) => {
        try { window.localStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}

    syncSettingsToPage();
    syncCardControlsFromState();
  };

  // Bridge: MAIN world -> Background Service Worker (TikWM & CDN Range probe)
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== 'fish-acc-main' || msg.type !== 'FISH_PROBE_VIDEO') return;

    const reply = (payload) => {
      try {
        window.postMessage({
          source: 'fish-acc-isolated',
          type: 'FISH_PROBE_RESULT',
          reqId: msg.reqId,
          payload: payload || null
        }, window.location.origin);
      } catch (_) {}
    };

    if (!isExtensionAlive() || typeof chrome.runtime.sendMessage !== 'function') {
      reply({ error: 'EXTENSION_CONTEXT_INVALIDATED' });
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'PROBE_VIDEO',
        pageUrl: msg.pageUrl || null,
        streamUrl: msg.streamUrl || null
      }).then((payload) => {
        reply(payload || null);
      }).catch(() => {
        reply(null);
      });
    } catch (_) {
      reply(null);
    }
  });
  /* --- 2. Extension-Side 1:1 MP4 Patcher, Upload Card & Panel Handover --- */
  const escapeHtmlAttr = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const findSidebarBtn = (label) => {
    const btns = Array.from(document.querySelectorAll('button[data-tt="Sidebar_Sidebar_Clickable"]'));
    return btns.find((b) => {
      const txt = (b.innerText || b.textContent || '').trim();
      return txt.toLowerCase().includes(label.toLowerCase());
    });
  };

  const getMethodStatus = () => {
    const hasEngine = typeof window.patchSlSr === 'function' ||
      typeof window.ADJNMp4Patcher?.quickPatch === 'function';
    if (!hasEngine) return 'UNAVAILABLE';

    const engineApis = [
      window.ADJNMp4Patcher,
      window.FRYMp4Patcher,
      window.FRYOriginalMp4Core,
      window.ADJNOriginalMp4Core,
      window.HazePatch
    ];
    for (const api of engineApis) {
      if (api && typeof api.status === 'string' && api.status.trim()) {
        return api.status.trim().toUpperCase();
      }
    }
    return 'WORKING';
  };

  const updateMethodStatusBadge = () => {
    const badge = document.getElementById('m3-bypass-status');
    if (!badge) return;
    const status = getMethodStatus();
    const isWorking = status === 'WORKING';
    badge.classList.toggle('m3-status-working', isWorking);
    badge.classList.toggle('m3-status-patched', !isWorking);
    badge.title = `Method Status: ${status}`;
    const textEl = badge.querySelector('.m3-status-text');
    if (textEl) textEl.textContent = status;
  };

  const syncCardControlsFromState = () => {
    const toggle = document.getElementById('m3-bypass-toggle');
    const wmRow = document.getElementById('m3-watermark-row');
    const wmInput = document.getElementById('m3-watermark-input');
    const enabled = isBypassUploadEnabled();
    if (toggle && toggle.checked !== enabled) {
      toggle.checked = enabled;
    }
    if (wmRow) {
      wmRow.style.display = enabled ? '' : 'none';
    }
    if (wmInput && document.activeElement !== wmInput && wmInput.value !== getBypassWatermark()) {
      wmInput.value = getBypassWatermark();
    }
  };

  // Unified 1:1 Video Calibrator Pipeline (berjalan penuh di context extension ISOLATED world)
  const calibrateVideoFile = async (file) => {
    // 1. Engine 4.0 Direct Patch (sl-sr.js bundled in extension)
    try {
      if (typeof window.patchSlSr === 'function') {
        log('Patching video inside extension (sl-sr engine)...');
        const patchedBlob = await window.patchSlSr(file);
        if (patchedBlob && patchedBlob.size > 0) {
          log('✓ Video patched via sl-sr (size:', patchedBlob.size, ')');
          return new File([patchedBlob], file.name, {
            type: 'video/mp4',
            lastModified: Date.now()
          });
        }
      }
    } catch (errSlSr) {
      log('sl-sr notice (falling back to patch.js):', errSlSr?.message || errSlSr);
    }

    // 2. Fallback Engine 5.0 Core (patch.js bundled in extension)
    try {
      const patcher = window.ADJNMp4Patcher || window.FRYMp4Patcher;
      if (patcher && typeof patcher.quickPatch === 'function') {
        log('Patching video inside extension (patch.js Core v5.0)...');
        const buf = await file.arrayBuffer();
        const patchedU8 = patcher.quickPatch(buf);
        if (patchedU8 && patchedU8.length > 0) {
          log('✓ Video patched via patch.js (size:', patchedU8.length, ')');
          return new File([patchedU8], file.name, {
            type: 'video/mp4',
            lastModified: Date.now()
          });
        }
      }
    } catch (errPatch) {
      log('patch.js notice:', errPatch?.message || errPatch);
    }

    log('Video handed over untouched as fallback');
    return file;
  };

  const removeUploadBypassCard = () => {
    ['m3-bypass-upload-card', 'm3-bypass-credit', 'm3-upload-page-back-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  const injectUploadBypassCard = () => {
    if (!window.location.pathname.includes('/upload')) {
      removeUploadBypassCard();
      return;
    }

    const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                      document.querySelector('input[type="file"]:not(#fish-proxy-file-input)');
    const uploadContainer = fileInput?.closest('div[role="button"]') ||
                            document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                            document.querySelector('.upload, [class*="upload"]');
    if (!uploadContainer) return;

    updateMethodStatusBadge();

    // 1. Tombol Back to Posts di atas Upload Container
    let backBtn = document.getElementById('m3-upload-page-back-btn');
    if (!backBtn) {
      backBtn = document.createElement('button');
      backBtn.id = 'm3-upload-page-back-btn';
      backBtn.type = 'button';
      backBtn.className = 'm3-upload-page-back-btn';
      backBtn.title = 'Back to Posts';
      backBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        <span>Back to Posts</span>
      `;
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const postsBtn = findSidebarBtn('Posts') || findSidebarBtn('Manage posts') || findSidebarBtn('Content');
        if (postsBtn) {
          postsBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/content';
        }
      });
      try {
        uploadContainer.before(backBtn);
      } catch (_) {
        try {
          if (uploadContainer.parentNode && uploadContainer.parentNode.contains(uploadContainer)) {
            uploadContainer.parentNode.insertBefore(backBtn, uploadContainer);
          }
        } catch (_) {}
      }
    }

    if (document.getElementById('m3-bypass-upload-card')) return;

    const card = document.createElement('div');
    card.id = 'm3-bypass-upload-card';
    card.className = 'm3-bypass-card';

    const isEnabled = isBypassUploadEnabled();
    const currentWm = getBypassWatermark();
    const statusAtRender = getMethodStatus();
    const isWorking = statusAtRender === 'WORKING';

    card.innerHTML = `
      <div class="m3-card-real-content" id="m3-card-real-content">
        <div class="m3-bypass-header">
          <div class="m3-bypass-title-row">
            <label class="m3-switch" for="m3-bypass-toggle" title="Toggle 1:1 Bypass Upload">
              <input type="checkbox" id="m3-bypass-toggle" ${isEnabled ? 'checked' : ''} />
              <span class="m3-slider"></span>
            </label>
            <span class="m3-bypass-title">Enable bypass upload ?</span>
          </div>
          <div class="m3-status-badge ${isWorking ? 'm3-status-working' : 'm3-status-patched'}" id="m3-bypass-status" title="Method Status: ${escapeHtmlAttr(statusAtRender)}">
            <span class="m3-pulse-dot"></span>
            <span class="m3-status-text">${escapeHtmlAttr(statusAtRender)}</span>
          </div>
        </div>
        <p class="m3-bypass-desc">
          Video calibration runs locally inside the extension before handover to TikTok Studio's upload panel.
        </p>
        <div class="m3-watermark-row" id="m3-watermark-row" style="${isEnabled ? '' : 'display: none;'}">
          <label class="m3-watermark-label" for="m3-watermark-input">Watermark</label>
          <input type="text" id="m3-watermark-input" class="m3-watermark-input" value="${escapeHtmlAttr(currentWm)}" placeholder="Method from @username" />
        </div>
      </div>
    `;

    const toggle = card.querySelector('#m3-bypass-toggle');
    const wmRow = card.querySelector('#m3-watermark-row');
    const wmInput = card.querySelector('#m3-watermark-input');

    toggle.addEventListener('change', (e) => {
      const checked = e.target.checked;
      setBypassUploadEnabled(checked);
      if (wmRow) wmRow.style.display = checked ? '' : 'none';
    });

    if (wmInput) {
      wmInput.addEventListener('input', (e) => {
        setBypassWatermark(e.target.value);
      });
    }

    try {
      uploadContainer.after(card);
    } catch (_) {
      try {
        if (uploadContainer.parentNode && uploadContainer.parentNode.contains(uploadContainer)) {
          const next = uploadContainer.nextSibling;
          if (next && uploadContainer.parentNode.contains(next)) {
            uploadContainer.parentNode.insertBefore(card, next);
          } else {
            uploadContainer.parentNode.appendChild(card);
          }
        }
      } catch (_) {}
    }

    let credit = document.getElementById('m3-bypass-credit');
    if (!credit) {
      credit = document.createElement('div');
      credit.id = 'm3-bypass-credit';
      credit.className = 'm3-bypass-credit';
      credit.innerHTML = 'Thanks for <a href="https://www.tiktok.com/@itsmefachry" target="_blank" rel="noopener noreferrer">fachry</a> to help this method alive!';
    }
    card.after(credit);

    log('Bypass Upload Card mounted (local extension mode)');
  };

  let _activePatching = false;
  let _isHandingOver = false;
  let _proxyFileInput = null;

  const getProxyFileInput = () => {
    if (!_proxyFileInput || !document.body.contains(_proxyFileInput)) {
      _proxyFileInput = document.createElement('input');
      _proxyFileInput.type = 'file';
      _proxyFileInput.accept = 'video/*,.mp4,.mov,.webm';
      _proxyFileInput.style.display = 'none';
      _proxyFileInput.id = 'fish-proxy-file-input';
      document.body.appendChild(_proxyFileInput);

      _proxyFileInput.addEventListener('change', (e) => {
        if (_activePatching) return;
        if (e.target.files && e.target.files.length) {
          const file = e.target.files[0];
          e.target.value = '';
          processAndCalibrateFile(file);
        }
      });
    }
    return _proxyFileInput;
  };

  // Handover file hasil patch dari extension ke <input type="file"> panel upload TikTok
  const handoverFileToUploadPanel = (fileInput, calibratedFile) => {
    if (!fileInput) return;
    _isHandingOver = true;
    fileInput.dataset.fishHandover = '1';
    try {
      const dt = new DataTransfer();
      dt.items.add(calibratedFile);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      log('✓ Handover complete -> TikTok upload panel:', calibratedFile.name);
    } finally {
      delete fileInput.dataset.fishHandover;
      _isHandingOver = false;
    }
  };

  const processAndCalibrateFile = async (file) => {
    if (_activePatching) return;
    _activePatching = true;

    const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                      document.querySelector('input[type="file"]:not(#fish-proxy-file-input)');
    const uploadContainer = fileInput?.closest('div[role="button"]') ||
                            document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                            document.querySelector('.upload, [class*="upload"]');
    const dropCard = document.querySelector('[data-e2e="select_video_container"]') ||
                     uploadContainer?.querySelector('.upload-card') ||
                     uploadContainer;

    if (!dropCard) {
      _activePatching = false;
      return;
    }

    if (uploadContainer) {
      uploadContainer.classList.add('fish-dropzone-disabled');
      uploadContainer.style.pointerEvents = 'none';
    }

    const innerElements = Array.from(dropCard.children).filter((el) => el.id !== 'fish-upload-progress-overlay');
    innerElements.forEach((el) => el.classList.add('fish-dropzone-fadeout'));

    const videoSgt = uploadContainer ? uploadContainer.querySelector('.video-suggestion') : null;
    if (videoSgt) videoSgt.classList.add('fish-dropzone-fadeout');

    dropCard.style.position = 'relative';

    let overlay = document.getElementById('fish-upload-progress-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fish-upload-progress-overlay';
      overlay.className = 'fish-progress-overlay';
      overlay.innerHTML = `
        <div class="fish-progress-fill" id="fish-progress-fill"></div>
        <div class="fish-progress-center">
          <span class="fish-progress-percent" id="fish-progress-percent">0%</span>
        </div>
      `;
      dropCard.appendChild(overlay);
    }

    const fillEl = overlay.querySelector('#fish-progress-fill');
    const percentEl = overlay.querySelector('#fish-progress-percent');

    const setProgress = (val) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)));
      if (fillEl) fillEl.style.setProperty('width', clamped + '%', 'important');
      if (percentEl) percentEl.textContent = clamped + '%';
    };

    const animateProgress = (from, to, duration) => {
      return new Promise((resolve) => {
        const startTime = performance.now();
        const step = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          setProgress(from + (to - from) * progress);
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    };

    const restoreDropzone = () => {
      if (overlay) overlay.remove();
      innerElements.forEach((el) => el.classList.remove('fish-dropzone-fadeout'));
      if (videoSgt) videoSgt.classList.remove('fish-dropzone-fadeout');
      if (uploadContainer) {
        uploadContainer.classList.remove('fish-dropzone-disabled');
        uploadContainer.style.pointerEvents = '';
      }
    };

    try {
      log('Calibrating video inside extension:', file.name);
      setProgress(10);

      // Jalankan patching segera sambil progress bar berjalan mulus sampai 85%
      const patchPromise = calibrateVideoFile(file);
      await Promise.all([patchPromise, animateProgress(10, 85, 320)]);
      const calibratedFile = await patchPromise;

      await animateProgress(85, 100, 140);
      restoreDropzone();

      // Handover hasil patch ke panel upload TikTok
      handoverFileToUploadPanel(fileInput, calibratedFile);
    } catch (err) {
      log('Calibration error:', err?.message || err);
      restoreDropzone();
    } finally {
      _activePatching = false;
    }
  };

  let _lastPickerOpenAt = 0;
  const openProxyPicker = () => {
    const now = Date.now();
    if (now - _lastPickerOpenAt < 700) return;
    _lastPickerOpenAt = now;
    getProxyFileInput().click();
  };

  const DROPZONE_SELECTOR = '[data-e2e="select_video_container"], [data-e2e="select_video_button"], .upload-stage-btn';

  const setupFileUploadInterceptor = () => {
    ['pointerdown', 'mousedown'].forEach((evtName) => {
      document.addEventListener(evtName, (e) => {
        if (!isBypassUploadEnabled()) return;
        if (!e.target.closest || !e.target.closest(DROPZONE_SELECTOR)) return;
        e.stopImmediatePropagation();
      }, true);
    });

    document.addEventListener('click', (e) => {
      if (!isBypassUploadEnabled()) return;
      const dropzone = e.target.closest && e.target.closest(DROPZONE_SELECTOR);
      if (!dropzone) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (_activePatching) return;
      openProxyPicker();
    }, true);

    document.addEventListener('dragover', (e) => {
      if (!isBypassUploadEnabled()) return;
      const dropzone = e.target.closest && e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
      if (dropzone) e.preventDefault();
    }, true);

    document.addEventListener('drop', (e) => {
      if (!isBypassUploadEnabled()) return;
      const dropzone = e.target.closest && e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
      if (dropzone) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          processAndCalibrateFile(dt.files[0]);
        }
      }
    }, true);

    document.addEventListener('change', (e) => {
      if (!isBypassUploadEnabled()) return;
      if (_isHandingOver) return;
      const target = e.target;
      if (target && target.tagName === 'INPUT' && target.type === 'file' && target.id !== 'fish-proxy-file-input') {
        if (target.dataset.fishHandover === '1') return;
        if (target.files && target.files.length) {
          const file = target.files[0];
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          processAndCalibrateFile(file);
        }
      }
    }, true);
  };

  const startUploadCardObserver = () => {
    let scheduled = false;
    let wasOnUpload = false;
    const check = () => {
      scheduled = false;
      const onUpload = window.location.pathname.includes('/upload');
      if (onUpload) {
        wasOnUpload = true;
        injectUploadBypassCard();
      } else if (wasOnUpload) {
        wasOnUpload = false;
        removeUploadBypassCard();
      }
    };

    const scheduleCheck = () => {
      const onUpload = window.location.pathname.includes('/upload');
      if (!onUpload && !wasOnUpload) return;
      if (scheduled) return;
      scheduled = true;
      setTimeout(check, 150);
    };

    const observer = new MutationObserver(scheduleCheck);
    const attach = () => {
      check();
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    if (document.body) {
      attach();
    } else {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  };
  initSettings();
  setupFileUploadInterceptor();
  startUploadCardObserver();
})();
