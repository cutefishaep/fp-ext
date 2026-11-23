  /* --- 1. Extension Storage & MAIN World Bridge --- */
  const DEFAULT_WATERMARK = 'Method from @cutefishaep';
  const STORAGE_KEYS = {
    enabled: 'fish_acc_bypass_upload',
    watermark: 'fish_acc_bypass_watermark',
    compress: 'fish_acc_compress_video'
  };

  let _bypassEnabled = true;
  let _bypassWatermark = DEFAULT_WATERMARK;
  let _compressMode = '1080p';
  let _liveConfig = null;

  const isBypassUploadEnabled = () => _bypassEnabled;
  const getBypassWatermark = () => _bypassWatermark;
  const getCompressMode = () => _compressMode;
  const isCompressVideoEnabled = () => _compressMode !== 'off';
  const getLiveConfig = () => _liveConfig;

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

  const isExtensionAlive = () =>
    typeof chrome !== 'undefined' &&
    typeof chrome.runtime?.sendMessage === 'function';

  const sendBgMessage = (payload) => new Promise((resolve) => {
    if (!isExtensionAlive()) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, (res) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(res ?? null);
      });
    } catch (_) {
      resolve(null);
    }
  });

  const coreStorageGet = async (keys) => {
    if (isExtensionAlive() && chrome.storage?.local) {
      try { return await chrome.storage.local.get(keys); } catch (_) {}
    }
    const res = await sendBgMessage({ type: 'CORE_STORAGE_GET', keys });
    return (res && typeof res === 'object' && res.data) ? res.data : {};
  };

  const coreStorageSet = (items) => {
    if (isExtensionAlive() && chrome.storage?.local) {
      try { chrome.storage.local.set(items); return; } catch (_) {}
    }
    sendBgMessage({ type: 'CORE_STORAGE_SET', items });
  };

  const setBypassUploadEnabled = (enabled) => {
    _bypassEnabled = Boolean(enabled);
    if (isExtensionAlive()) {
      coreStorageSet({ [STORAGE_KEYS.enabled]: _bypassEnabled });
    }
    syncSettingsToPage();
  };

  const setBypassWatermark = (val) => {
    _bypassWatermark = typeof val === 'string' ? val : '';
    if (isExtensionAlive()) {
      coreStorageSet({ [STORAGE_KEYS.watermark]: _bypassWatermark });
    }
    syncSettingsToPage();
  };

  const setCompressMode = (mode) => {
    const clean = (mode === 'off' || mode === '720p' || mode === '1080p') ? mode : '1080p';
    _compressMode = clean;
    if (isExtensionAlive()) {
      coreStorageSet({ [STORAGE_KEYS.compress]: clean });
    }
  };

  const setCompressVideoEnabled = (enabled) => {
    setCompressMode(enabled ? (_compressMode === 'off' ? '1080p' : _compressMode) : 'off');
  };

  const initSettings = async () => {
    try {
      if (isExtensionAlive()) {
        const stored = await coreStorageGet([STORAGE_KEYS.enabled, STORAGE_KEYS.watermark, STORAGE_KEYS.compress, 'fa_live_core']);
        _liveConfig = stored.fa_live_core?.config || null;
        if (typeof stored[STORAGE_KEYS.compress] === 'string' && ['off', '720p', '1080p'].includes(stored[STORAGE_KEYS.compress])) {
          _compressMode = stored[STORAGE_KEYS.compress];
        } else if (typeof stored[STORAGE_KEYS.compress] === 'boolean') {
          _compressMode = stored[STORAGE_KEYS.compress] ? '1080p' : 'off';
        }
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
          coreStorageSet(toPersist);
        }
      }

      // Bersihkan sisa remote script cache lama di localStorage TikTok (jika ada)
      ['fp_ext_patch.js', 'fp_ext_sl-sr.js', 'fp_ext_soundsafe-hook.js'].forEach((k) => {
        try { window.localStorage.removeItem(k); } catch (_) {}
      });
    } catch (_) {}

    syncSettingsToPage();
    syncCardControlsFromState();
    if (typeof checkLoaderVersionCompatibility === 'function') {
      checkLoaderVersionCompatibility();
    }
  };

  const probeFetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const probeVideoDirect = async ({ pageUrl, streamUrl }) => {
    let tikwmData = null;

    if (pageUrl && typeof pageUrl === 'string' && pageUrl.startsWith('https://www.tiktok.com/')) {
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}&hd=1`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const twRes = await probeFetchWithTimeout(apiUrl, {}, 30000);
          if (twRes.ok) {
            const twJson = await twRes.json();
            if (twJson && twJson.code === 0 && twJson.data) {
              tikwmData = twJson.data;
              break;
            }
            if (twJson && twJson.code === -1 && attempt === 0) {
              await new Promise((r) => setTimeout(r, 1150));
              continue;
            }
          }
          break;
        } catch (_) {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1150));
          }
        }
      }
    }

    const rawCandidates = [
      tikwmData?.hdplay,
      tikwmData?.play,
      tikwmData?.id ? `https://www.tikwm.com/video/media/play/${tikwmData.id}.mp4` : null,
      streamUrl
    ];
    const candidates = [];
    for (const c of rawCandidates) {
      if (typeof c === 'string' && c.startsWith('https://') && !candidates.includes(c)) {
        candidates.push(c);
      }
    }

    let resolvedStreamUrl = candidates[0] || null;
    let totalSizeBytes = tikwmData?.size || 0;
    let atomMeta = null;

    for (const candUrl of candidates) {
      try {
        const fpsApiUrl = `https://www.cutefish.my.id/api/tiktok-fps?url=${encodeURIComponent(candUrl)}`;
        const probeRes = await probeFetchWithTimeout(fpsApiUrl, {}, 20000);
        if (probeRes.ok) {
          const meta = await probeRes.json();
          if (meta && (meta.width || meta.fps || meta.size)) {
            resolvedStreamUrl = candUrl;
            if (meta.size > 0) totalSizeBytes = meta.size;
            atomMeta = {
              fps: meta.fps || 0,
              width: meta.width || 0,
              height: meta.height || 0,
              comment: meta.comment || '',
              duration: meta.duration || 0
            };
            if (atomMeta.width && atomMeta.fps) {
              break;
            }
          }
        }
      } catch (_) {}
    }

    return {
      tikwmData,
      streamUrl: resolvedStreamUrl,
      totalSizeBytes,
      atomMeta
    };
  };

  // Bridge: MAIN world -> Direct OTA probe (tikwm + cutefish.my.id/api/tiktok-fps), fallback to Background
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

    const req = {
      pageUrl: msg.pageUrl || null,
      streamUrl: msg.streamUrl || null
    };

    probeVideoDirect(req)
      .then(async (direct) => {
        if (direct && (direct.tikwmData || (direct.atomMeta && direct.atomMeta.width))) {
          reply(direct);
          return;
        }
        if (isExtensionAlive()) {
          const bg = await sendBgMessage({ type: 'PROBE_VIDEO', ...req });
          if (bg && (bg.tikwmData || (bg.atomMeta && bg.atomMeta.width))) {
            reply(bg);
            return;
          }
        }
        reply(direct || null);
      })
      .catch(() => reply(null));
  });
