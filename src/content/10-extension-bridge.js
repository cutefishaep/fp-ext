    /* D. Extension Bridge (MAIN <-> ISOLATED world sync & Background Video Probe) */
    const ORIGIN = window.location.origin;
    const _pendingProbes = new Map();
    let _probeSeq = 0;

    const warmMentionWatermark = (wmText) => {
      const wm = typeof wmText === 'string' ? wmText.trim() : '';
      if (!wm) return;
      const lib = window.FRYMention;
      if (lib && typeof lib.warm === 'function') {
        try { lib.warm(wm); } catch (_) {}
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== ORIGIN) return;
      const msg = event.data;
      if (!msg || msg.source !== 'fish-acc-isolated') return;

      if (msg.type === 'FISH_SETTINGS_SYNC') {
        _bypassEnabled = Boolean(msg.enabled);
        _bypassWatermark = typeof msg.watermark === 'string' ? msg.watermark : DEFAULT_WATERMARK;
        warmMentionWatermark(_bypassWatermark);
      } else if (msg.type === 'FISH_PROBE_RESULT' && msg.reqId !== undefined) {
        const resolver = _pendingProbes.get(msg.reqId);
        if (resolver) {
          _pendingProbes.delete(msg.reqId);
          resolver(msg.payload || null);
        }
      }
    });

    // Warm mention cache saat inisialisasi jika watermark sudah diset
    warmMentionWatermark(_bypassWatermark);

    // Minta isolated.js -> background.js melakukan probe TikWM & CDN stream (bebas CSP & CORS)
    const probeVideoViaExtension = (pageUrl, streamUrl) => {
      return new Promise((resolve) => {
        const reqId = ++_probeSeq;
        const timer = setTimeout(() => {
          _pendingProbes.delete(reqId);
          resolve(null);
        }, 15000);

        _pendingProbes.set(reqId, (result) => {
          clearTimeout(timer);
          resolve(result);
        });

        window.postMessage({
          source: 'fish-acc-main',
          type: 'FISH_PROBE_VIDEO',
          reqId,
          pageUrl: pageUrl || null,
          streamUrl: streamUrl || null
        }, ORIGIN);
      });
    };
