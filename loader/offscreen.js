'use strict';

(() => {
  const CHUNK_SIZE = 2 * 1024 * 1024;
  let _worker = null;

  const getWorker = () => {
    if (!_worker) {
      _worker = new Worker(chrome.runtime.getURL('ffmpeg-worker.js'));
    }
    return _worker;
  };

  const uint8ToBase64 = (bytes) => {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(binary);
  };

  const base64ToUint8 = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  };

  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'fa-ffmpeg-compress') return;

    let fileName = 'video.mp4';
    let totalSize = 0;
    let compressConfig = null;
    let incomingChunks = [];

    port.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'INIT') {
        fileName = msg.fileName || 'video.mp4';
        totalSize = Number(msg.totalSize) || 0;
        compressConfig = (msg.compressConfig && typeof msg.compressConfig === 'object') ? msg.compressConfig : null;
        incomingChunks = [];
        return;
      }

      if (msg.type === 'CHUNK' && typeof msg.b64 === 'string') {
        incomingChunks.push(base64ToUint8(msg.b64));
        return;
      }

      if (msg.type === 'COMMIT') {
        const actualLen = incomingChunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(totalSize || actualLen);
        let offset = 0;
        for (const c of incomingChunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        incomingChunks = [];

        const worker = getWorker();
        const onWorkerMsg = (e) => {
          const data = e.data;
          if (!data) return;
          if (data.type === 'PROGRESS') {
            try { port.postMessage(data); } catch (_) {}
            return;
          }
          if (data.type === 'DONE') {
            worker.removeEventListener('message', onWorkerMsg);
            const outBytes = new Uint8Array(data.buffer);
            const totalChunks = Math.max(1, Math.ceil(outBytes.byteLength / CHUNK_SIZE));
            try {
              port.postMessage({
                type: 'RESULT_INIT',
                totalSize: outBytes.byteLength,
                totalChunks,
                origSize: data.origSize,
                outSize: data.outSize,
                skippedLarger: Boolean(data.skippedLarger)
              });
              for (let i = 0; i < totalChunks; i++) {
                const slice = outBytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                port.postMessage({ type: 'RESULT_CHUNK', index: i, b64: uint8ToBase64(slice) });
              }
              port.postMessage({ type: 'RESULT_DONE' });
            } catch (_) {}
            return;
          }
          if (data.type === 'ERROR') {
            worker.removeEventListener('message', onWorkerMsg);
            try { port.postMessage({ type: 'ERROR', error: data.error }); } catch (_) {}
          }
        };

        worker.addEventListener('message', onWorkerMsg);
        worker.postMessage({ type: 'COMPRESS', buffer: merged.buffer, fileName, compressConfig }, [merged.buffer]);
      }
    });
  });
})();
