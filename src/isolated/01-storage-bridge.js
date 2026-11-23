  /* --- 1. Extension Storage & MAIN World Bridge --- */
  const DEFAULT_WATERMARK = 'Method from @cutefishaep';
  const STORAGE_KEYS = {
    enabled: 'fish_acc_bypass_upload',
    watermark: 'fish_acc_bypass_watermark'
  };

  let _bypassEnabled = true;
  let _bypassWatermark = DEFAULT_WATERMARK;
  let _liveConfig = null;

  const isBypassUploadEnabled = () => _bypassEnabled;
  const getBypassWatermark = () => _bypassWatermark;
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
        const stored = await chrome.storage.local.get([STORAGE_KEYS.enabled, STORAGE_KEYS.watermark, 'fa_live_core']);
        _liveConfig = stored.fa_live_core?.config || null;
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
