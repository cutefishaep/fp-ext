
  // Bridge: ISOLATED world -> MAIN world (patch video using method fetched from cutefish.my.id)
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== 'fish-acc-isolated' || msg.type !== 'FISH_PATCH_VIDEO') return;

    const reply = (ok, buffer, error) => {
      try {
        const transfer = buffer instanceof ArrayBuffer ? [buffer] : [];
        window.postMessage({
          source: 'fish-acc-main',
          type: 'FISH_PATCH_VIDEO_RESULT',
          reqId: msg.reqId,
          ok,
          buffer: buffer || null,
          error: error || ''
        }, window.location.origin, transfer);
      } catch (_) {}
    };

    try {
      const targetId = String(msg.methodId || 'fish').toLowerCase();
      const items = (window.TikTokMethods && Array.isArray(window.TikTokMethods._items))
        ? window.TikTokMethods._items
        : [];
      const methodObj = items.find((m) =>
        m.id === targetId || (Array.isArray(m.aliases) && m.aliases.includes(targetId))
      );

      let outBytes = null;
      if (methodObj && typeof methodObj.patch === 'function') {
        outBytes = await methodObj.patch(new Uint8Array(msg.buffer), { mode: 'off', log: () => {} });
      } else if (typeof window.patchMp4Fish === 'function') {
        outBytes = window.patchMp4Fish(new Uint8Array(msg.buffer));
      } else {
        return reply(false, null, 'Web method "' + targetId + '" is not loaded in MAIN world.');
      }

      const u8 = outBytes instanceof Uint8Array ? outBytes : new Uint8Array(outBytes);
      const outAb = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
      reply(true, outAb, '');
    } catch (err) {
      reply(false, null, err?.message || String(err));
    }
  });

  // Jalankan langsung di MAIN world (sudah diatur via manifest.json: "world": "MAIN")
  initMainWorldEnhancements();
})();
