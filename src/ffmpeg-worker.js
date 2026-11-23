'use strict';

importScripts('vendor/ffmpeg-core.js');

const WASM_CACHE_NAME = 'fa-ffmpeg-wasm-v1';
const WASM_URLS = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
];
const WASM_EXPECTED_SHA256 = '2390efa7fb66e7e42dbae15427571a5ffc96b829480904c30f471f0a78967f61';

let _coreInstance = null;

const sha256Hex = async (buffer) => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

const getVerifiedWasmBinary = async (emitProgress) => {
  const cache = await caches.open(WASM_CACHE_NAME);
  const cached = await cache.match(WASM_URLS[0]);
  if (cached) {
    const buf = await cached.arrayBuffer();
    const hash = await sha256Hex(buf);
    if (hash === WASM_EXPECTED_SHA256) {
      return new Uint8Array(buf);
    }
    await cache.delete(WASM_URLS[0]);
  }

  let lastErr = null;
  for (const url of WASM_URLS) {
    try {
      emitProgress('wasm', 0, 'Downloading FFmpeg...');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const total = Number(res.headers.get('content-length')) || 32129114;
      let buf;
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        let lastEmitAt = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength) {
            chunks.push(value);
            loaded += value.byteLength;
            const now = Date.now();
            if (now - lastEmitAt >= 80) {
              lastEmitAt = now;
              const pct = Math.min(99, Math.round((loaded / total) * 100));
              emitProgress('wasm', pct, `${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`);
            }
          }
        }
        const merged = new Uint8Array(loaded);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        buf = merged.buffer;
      } else {
        buf = await res.arrayBuffer();
      }

      emitProgress('wasm', 100, 'Verifying...');
      const hash = await sha256Hex(buf);
      if (hash !== WASM_EXPECTED_SHA256) {
        throw new Error(`FFmpeg WASM SHA-256 mismatch (${hash.slice(0, 12)}...)`);
      }

      await cache.put(
        WASM_URLS[0],
        new Response(buf.slice(0), { headers: { 'Content-Type': 'application/wasm' } })
      );
      return new Uint8Array(buf);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to download FFmpeg WASM.');
};

const ensureCore = async (emitProgress) => {
  if (_coreInstance) return _coreInstance;
  const wasmBinary = await getVerifiedWasmBinary(emitProgress);
  _coreInstance = await createFFmpegCore({ wasmBinary });
  return _coreInstance;
};

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'COMPRESS') return;

  const emitProgress = (stage, percent, detail = '') => {
    self.postMessage({ type: 'PROGRESS', stage, percent, detail });
  };

  try {
    const core = await ensureCore(emitProgress);
    const inputBytes = new Uint8Array(msg.buffer);
    const origSize = inputBytes.byteLength;

    try { core.FS.unlink('/input.mp4'); } catch (_) {}
    try { core.FS.unlink('/output.mp4'); } catch (_) {}

    core.FS.writeFile('/input.mp4', inputBytes);

    let lastProgressAt = 0;
    core.setProgress(({ progress }) => {
      const now = Date.now();
      if (now - lastProgressAt < 100) return;
      lastProgressAt = now;
      const pct = Math.max(0, Math.min(99, Math.round((progress || 0) * 100)));
      emitProgress('compress', pct, 'Compressing...');
    });

    const baseArgs = [
      '-y', '-i', '/input.mp4',
      '-map', '0:v:0', '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-x264-params', 'aq-mode=2',
      '-movflags', '+faststart'
    ];

    let ret = core.exec(...baseArgs, '-c:a', 'copy', '/output.mp4');
    if (ret !== 0) {
      try { core.FS.unlink('/output.mp4'); } catch (_) {}
      core.reset();
      ret = core.exec(...baseArgs, '-c:a', 'aac', '-b:a', '192k', '/output.mp4');
    }

    if (ret !== 0) {
      throw new Error(`FFmpeg exited with code ${ret}`);
    }

    const outBytes = core.FS.readFile('/output.mp4');
    try { core.FS.unlink('/input.mp4'); } catch (_) {}
    try { core.FS.unlink('/output.mp4'); } catch (_) {}
    core.reset();

    if (outBytes.byteLength >= origSize) {
      const origCopy = inputBytes.slice().buffer;
      self.postMessage({
        type: 'DONE',
        buffer: origCopy,
        origSize,
        outSize: origSize,
        skippedLarger: true
      }, [origCopy]);
      return;
    }

    const outBuf = outBytes.slice().buffer;
    self.postMessage({
      type: 'DONE',
      buffer: outBuf,
      origSize,
      outSize: outBytes.byteLength,
      skippedLarger: false
    }, [outBuf]);
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err?.message || 'FFmpeg compression failed.' });
  }
};
