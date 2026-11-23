
  // Bridge: ISOLATED world -> MAIN world (pure web engine + FFmpeg offscreen bridge)
  const execFFmpegViaIsolated = (inputName, inputBytes, args, outputName, onProgress) => new Promise((resolve, reject) => {
    const reqId = 'ff_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMsg);
      reject(new Error('FFmpeg execution timeout.'));
    }, 300000);

    const onMsg = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.source !== 'fish-acc-isolated' || msg.reqId !== reqId) return;
      if (msg.type === 'FISH_FFMPEG_PROGRESS') {
        if (typeof onProgress === 'function') onProgress(msg.percent || 0);
        return;
      }
      if (msg.type === 'FISH_FFMPEG_EXEC_RESULT') {
        window.clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        if (msg.ok && msg.buffer) resolve(new Uint8Array(msg.buffer));
        else reject(new Error(msg.error || 'FFmpeg execution failed.'));
      }
    };

    window.addEventListener('message', onMsg);
    const u8 = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    window.postMessage({
      source: 'fish-acc-main',
      type: 'FISH_FFMPEG_EXEC',
      reqId,
      inputName,
      args,
      outputName,
      buffer: ab
    }, window.location.origin, [ab]);
  });

  const createBridgeFFmpeg = () => {
    const fsMap = new Map();
    const listeners = { progress: [], log: [] };
    return {
      on(evt, fn) {
        if (listeners[evt] && typeof fn === 'function') listeners[evt].push(fn);
      },
      async writeFile(name, data) {
        const clean = String(name || 'input.mp4').replace(/^\/+/, '');
        fsMap.set(clean, data instanceof Uint8Array ? data : new Uint8Array(data));
      },
      async exec(command) {
        const args = Array.isArray(command) ? command.map(String) : [];
        const outputName = String(args[args.length - 1] || 'output.mp4').replace(/^\/+/, '');
        let inputName = 'input.mp4';
        let inputBytes = null;
        for (const [k, v] of fsMap.entries()) {
          if (k !== outputName) {
            inputName = k;
            inputBytes = v;
            break;
          }
        }
        if (!inputBytes) throw new Error('No input file written for FFmpeg.');
        const outU8 = await execFFmpegViaIsolated(inputName, inputBytes, args, outputName, (pct) => {
          listeners.progress.forEach((fn) => {
            try { fn({ progress: (Number(pct) || 0) / 100 }); } catch (_) {}
          });
        });
        fsMap.set(outputName, outU8);
        return 0;
      },
      async readFile(name) {
        const clean = String(name || 'output.mp4').replace(/^\/+/, '');
        const data = fsMap.get(clean);
        if (!data) throw new Error(`File not found: ${clean}`);
        return data;
      },
      async deleteFile(name) {
        fsMap.delete(String(name || '').replace(/^\/+/, ''));
      },
      async terminate() {
        fsMap.clear();
      }
    };
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== 'fish-acc-isolated' || msg.type !== 'FISH_RUN_WEB_PIPELINE') return;

    const reply = (payload) => {
      try {
        const transfer = payload?.buffer instanceof ArrayBuffer ? [payload.buffer] : [];
        window.postMessage({
          source: 'fish-acc-main',
          type: 'FISH_RUN_WEB_PIPELINE_RESULT',
          reqId: msg.reqId,
          ...payload
        }, window.location.origin, transfer);
      } catch (_) {}
    };

    try {
      const eng = window.CutefishMethodEngine;
      if (!eng || typeof eng.runPipeline !== 'function') {
        return reply({ ok: false, error: 'Web engine.js is not loaded in MAIN world.' });
      }

      const emitProgress = (pct, status) => {
        try {
          window.postMessage({
            source: 'fish-acc-main',
            type: 'FISH_PIPELINE_PROGRESS',
            reqId: msg.reqId,
            pct,
            status
          }, window.location.origin);
        } catch (_) {}
      };

      const progFillProxy = { set width(v) { emitProgress(parseInt(String(v), 10) || 0, null); } };
      const _tktkShim = {
        compressConfig: msg.compressConfig || null,
        progressFill: { style: progFillProxy },
        progressPercent: { set textContent(v) { emitProgress(parseInt(String(v), 10) || 0, null); } },
        statusText: { set innerHTML(v) { emitProgress(null, String(v || '').replace(/<[^>]+>/g, '').trim()); } },
        progressText: { set textContent(v) { emitProgress(null, String(v || '')); } },
        log: () => {},
        logSection: () => {},
        logEnd: () => {},
        appendToLogsEl: () => {},
        loadFFmpegLibraries: async () => true,
        toBlobURL: null,
        loadFFmpegHelper: async () => createBridgeFFmpeg(),
        parseFpsFromMp4: eng.parseFpsFromMp4,
        parseResolutionFromMp4: eng.parseResolutionFromMp4,
        computeVideoProcessingOptions: eng.computeVideoProcessingOptions,
        isMobileDevice: () => true
      };
      window._tktk = _tktkShim;
      window.getTranslation = window.getTranslation || ((k) => k);

      const fileObj = { name: msg.fileName || 'video.mp4', size: msg.fileSize || msg.buffer.byteLength, type: msg.fileType || 'video/mp4' };
      const res = await eng.runPipeline({
        file: fileObj,
        buffer: msg.buffer,
        duration: msg.duration || 0,
        methodId: msg.methodId || 'fish',
        compressMode: msg.compressMode || 'off',
        doBypass: msg.doBypass !== false,
        compressCfg: msg.compressConfig || null,
        _tktk: _tktkShim,
        onProgress: emitProgress
      });

      const outAb = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength);
      reply({
        ok: true,
        buffer: outAb,
        origSize: res.origSize,
        outSize: res.outSize,
        skippedLarger: Boolean(res.skippedLarger),
        limits: res.limits || null
      });
    } catch (err) {
      reply({ ok: false, error: err?.message || String(err) });
    }
  });

  // Jalankan langsung di MAIN world (sudah diatur via manifest.json: "world": "MAIN")
  initMainWorldEnhancements();
})();
