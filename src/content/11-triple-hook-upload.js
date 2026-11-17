    // =========================================================================
    // Triple-Hook Upload Flag Interception (JSON.stringify + Fetch + XHR)
    // Diadaptasi dari SAMPLE untuk menjamin flags cloud edit & anti-downscale
    // terinjeksi 100% pada semua payload publish TikTok Studio
    // =========================================================================
    const POST_PATH_REGEX = /(?:\/project\/post|\/publish\/|\/aweme\/v1\/create|\/item\/create)/i;
    const EXACT_PROJECT_POST = 'tiktok/web/project/post/v1/';
    const BLOCKED_POST_REGEX = /(?:\/music\/|\/sound\/|[?&]music_id=)/i;

    const isPostPublishRequest = (url) => {
      if (typeof url !== 'string') return false;
      if (url.includes(EXACT_PROJECT_POST)) return true;
      if (BLOCKED_POST_REGEX.test(url)) return false;
      return POST_PATH_REGEX.test(url);
    };

    const isPostPayload = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      return (
        Array.isArray(payload.single_post_req_list) ||
        Array.isArray(payload.item_list) ||
        Array.isArray(payload.text_extra) ||
        Boolean(payload.single_post_feature_info) ||
        Boolean(payload.post_common_info) ||
        Boolean(payload.item_common_info) ||
        Boolean(payload.item_info) ||
        Boolean(payload.publish_info) ||
        Boolean(payload.post_info) ||
        Boolean(payload.enter_post)
      );
    };

    const normalizeUploadPayloadFlags = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      let changed = false;

      const remove = (obj, key) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
          delete obj[key];
          changed = true;
        }
      };

      const setIfDifferent = (obj, key, val) => {
        if (obj && obj[key] !== val) {
          obj[key] = val;
          changed = true;
        }
      };

      // 1. Hapus pemicu kompresi server TikTok yang memaksa re-encode
      ['draft', 'canvas_config', 'vedit_segment_info'].forEach((key) => remove(payload, key));

      // 2. Injeksi bypass flags level root
      setIfDifferent(payload, 'cloud_edit_is_use_video_canvas', false);
      setIfDifferent(payload, 'psg_vsp_aud', true);
      setIfDifferent(payload, 'is_high_quality', true);
      setIfDifferent(payload, 'high_quality_video', 1);
      setIfDifferent(payload, 'disable_auto_bitrate', true);

      if (Object.prototype.hasOwnProperty.call(payload, 'enter_post_page_from')) {
        setIfDifferent(payload, 'enter_post_page_from', 1);
      }

      // 3. Post common info
      if (payload.post_common_info && typeof payload.post_common_info === 'object') {
        setIfDifferent(payload.post_common_info, 'post_type', 3);
        setIfDifferent(payload.post_common_info, 'enter_post_page_from', 1);
        setIfDifferent(payload.post_common_info, 'psg_vsp_aud', true);
        setIfDifferent(payload.post_common_info, 'is_high_quality', true);
      }

      // 4. Feature common info list
      if (Array.isArray(payload.feature_common_info_list)) {
        for (const item of payload.feature_common_info_list) {
          const vedit = item?.vedit_common_info;
          if (!vedit || typeof vedit !== 'object') continue;
          remove(vedit, 'tiktok_snap_shot_lite_params');
          if (Object.prototype.hasOwnProperty.call(vedit, 'application')) {
            setIfDifferent(vedit, 'application', 1);
          }
        }
      }

      // 5. Single post req list (detail per video post)
      if (Array.isArray(payload.single_post_req_list)) {
        for (const req of payload.single_post_req_list) {
          if (!req || typeof req !== 'object') continue;
          setIfDifferent(req, 'psg_vsp_aud', true);

          const info = req.single_post_feature_info;
          if (!info || typeof info !== 'object') continue;

          remove(info, 'vedit_segment_info');
          setIfDifferent(info, 'cloud_edit_is_use_video_canvas', false);
          setIfDifferent(info, 'has_original_audio', 1);
          setIfDifferent(info, 'psg_vsp_aud', true);
          setIfDifferent(info, 'video_quality_score', 1.0);
          setIfDifferent(info, 'is_high_quality', true);
          setIfDifferent(info, 'is_high_quality_video', 1);
          setIfDifferent(info, 'upload_high_quality', true);
          setIfDifferent(info, 'disable_auto_bitrate', true);
          setIfDifferent(info, 'video_fps', 144);
          setIfDifferent(info, 'source_fps', 144);

          if (info.music_info && typeof info.music_info === 'object') {
            if (!info.music_info.music_id_string && info.music_info.id) {
              info.music_info.music_id_string = String(info.music_info.id);
              changed = true;
            }
          }
        }
      }

      // 6. Injeksi atau Bersihkan Watermark pada Caption (+ @mention klikabel via FRYMention)
      // Jika watermark dikosongkan oleh user, caption bersih tanpa titik & tanpa geser ke bawah
      const wm = getBypassWatermark();
      const cleanWm = (typeof wm === 'string') ? wm.trim() : '';

      // window.FRYMention (asset/engines/soundsafe-hook.js) = library resolver @mention.
      // Guard legacy: jika soundsafe versi LAMA (masih memasang hook JSON/fetch/XHR sendiri)
      // terdeteksi, JANGAN injek watermark kartu — biarkan hook legacy bekerja (anti dobel).
      const mentionLib = window.FRYMention;
      const legacySoundSafe = Boolean(window.__soundSafeCoverSafeHooked) && !mentionLib;

      // Handle pada watermark yang dijadikan mention klikabel (UID asli dari API TikTok)
      const wmHandles = (cleanWm && mentionLib && !legacySoundSafe)
        ? mentionLib.extractHandles(cleanWm)
        : [];
      // Riwayat handle yang pernah di-tag: untuk membuka tag <m> watermark LAMA saat user
      // mengganti isi watermark (markup lama tidak boleh menumpuk)
      const taggedHandleHistory = new Set();
      if (wmHandles.length && mentionLib) {
        wmHandles.forEach((h) => taggedHandleHistory.add(h.toLowerCase()));
        try { mentionLib.warm(cleanWm); } catch (_) {} // resolve UID di background
      }

      const stripWatermark = (text) => {
        if (typeof text !== 'string') return '';
        let res = text;
        // Buka balik tag <m id="..">@handle</m> milik watermark kita (watermark lama)
        // menjadi teks polos, agar regex pembersih di bawah bisa mencocokkannya.
        if (taggedHandleHistory.size) {
          taggedHandleHistory.forEach((h) => {
            const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            res = res.replace(new RegExp('<m[^>]*>\\s*@' + esc + '\\s*<\\/m>', 'gi'), '@' + h);
          });
        }
        if (cleanWm) {
          const escaped = cleanWm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          res = res.replace(new RegExp('(?:\\r?\\n\\s*\\.\\s*|\\r?\\n\\s*\\n\\s*)?' + escaped + '$', 'i'), '');
        }
        res = res
          .replace(/(?:\r?\n\s*\.\s*)[^\r\n]*$/g, '')
          .replace(/(?:\r?\n\s*\.\s*|\r?\n\s*\n\s*)?(?:Method (?:from|by)|✦ Ekstension by)[^\r\n]*/gi, '')
          .trimEnd();
        return res;
      };

      const formatCaptionWithWatermark = (originalText) => {
        const base = stripWatermark(originalText);
        if (!cleanWm || legacySoundSafe) return base; // KOSONG / LEGACY: caption asli user saja
        return base ? (base + '\n.\n' + cleanWm) : cleanWm;
      };

      const captionKeys = ['caption', 'desc', 'description', 'title', 'text', 'markup_text'];

      // Terapkan watermark + mention klikabel pada satu node payload (info/req/root).
      // IDEMPOTEN: extras & tag <m> milik watermark lama dibersihkan dulu lalu dibangun
      // ulang dengan offset & tag_id yang sama → aman dipanggil berulang pada payload
      // yang sama (JSON.stringify → fetch → XHR, tiga lapis interceptor yang sama).
      const applyCaptionToNode = (node) => {
        if (!node || typeof node !== 'object') return false;
        let touched = false;

        captionKeys.forEach((k) => {
          if (typeof node[k] === 'string') {
            const nextVal = formatCaptionWithWatermark(node[k]);
            if (node[k] !== nextVal) {
              node[k] = nextVal;
              touched = true;
            }
          }
        });

        if (!mentionLib) return touched;

        const plain = (typeof node.text === 'string' && node.text) ? node.text
          : (typeof node.caption === 'string' && node.caption) ? node.caption : '';
        if (!plain) return touched;

        const base = stripWatermark(plain);
        const wmStart = base ? base.length + 3 : 0; // 3 = panjang separator '\n.\n'

        // Buang text_extra LAMA milik watermark: region [wmStart..] adalah 100% milik
        // kita (di-append oleh formatCaption), jadi SEMUA entri mention (type 0) yang
        // menunjuk ke sana pasti sisa pasangan kami sebelumnya — termasuk dari watermark
        // LAMA yang sudah diganti/dikosongkan. Entri asli TikTok/user selalu berada di
        // bawah wmStart sehingga tidak tersentuh.
        const sourceExtras = (Array.isArray(node.text_extra) ? node.text_extra : []);
        const existingExtras = sourceExtras.filter((e) => {
          if (!e || Number(e.type) !== 0) return true;
          const start = Number(e.start);
          const end = Number(e.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < wmStart) return true;
          return false; // di dalam region watermark = punya kita → rebuild
        });
        if (existingExtras.length !== sourceExtras.length) {
          node.text_extra = existingExtras;
          touched = true;
        }

        if (!wmHandles.length) return touched;

        const built = mentionLib.buildMentionExtras(existingExtras, plain, wmStart, wmHandles);
        if (!built.spans.length) return touched;

        if (JSON.stringify(node.text_extra || []) !== JSON.stringify(built.extras)) {
          node.text_extra = built.extras;
          touched = true;
        }

        // markup_text: ganti suffix watermark polos dengan versi tag <m> (klikabel)
        const currentMarkup = (typeof node.markup_text === 'string') ? node.markup_text : plain;
        if (currentMarkup.endsWith(cleanWm)) {
          const head = currentMarkup.slice(0, currentMarkup.length - cleanWm.length);
          const upgraded = head + mentionLib.buildMarkupRegion(cleanWm, built.spans, wmStart);
          if (node.markup_text !== upgraded) {
            node.markup_text = upgraded;
            touched = true;
          }
        }
        return touched;
      };

      if (Array.isArray(payload.single_post_req_list)) {
        for (const req of payload.single_post_req_list) {
          const info = req?.single_post_feature_info;
          if (info && typeof info === 'object') {
            changed = applyCaptionToNode(info) || changed;
          }
          changed = applyCaptionToNode(req) || changed;
        }
      }

      changed = applyCaptionToNode(payload) || changed;

      return changed;
    };

    // Snapshot cover/thumbnail agar integritas gambar sampul TikTok tetap aman
    const patchPostPayload = (payload) => {
      if (!isPostPayload(payload)) return false;
      const mediaSnapshot = [];
      const snapshot = (node, seen = new WeakSet()) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
          node.forEach((item) => snapshot(item, seen));
          return;
        }
        for (const key of Object.keys(node)) {
          const value = node[key];
          if (/(?:^|_)(?:cover|thumbnail|poster)(?:_|$)/i.test(key)) {
            let copy = value;
            try { copy = JSON.parse(nativeStringify(value)); } catch (_) {}
            mediaSnapshot.push({ owner: node, key, value: copy });
            continue;
          }
          if (value && typeof value === 'object') snapshot(value, seen);
        }
      };

      snapshot(payload);
      let changed = normalizeUploadPayloadFlags(payload);

      for (const item of mediaSnapshot) {
        let next = item.value;
        try { next = JSON.parse(JSON.stringify(item.value)); } catch (_) {}
        if (nativeStringify(item.owner[item.key]) !== JSON.stringify(next)) {
          item.owner[item.key] = next;
          changed = true;
        }
      }

      return changed;
    };

    const patchBodyString = (body) => {
      if (typeof body !== 'string' || !body) return body;
      try {
        const parsed = JSON.parse(body);
        if (patchPostPayload(parsed)) {
          return nativeStringify(parsed);
        }
      } catch (_) {}
      return body;
    };

    // 1. Hook JSON.stringify (Menangkap saat react code TikTok serialisasi payload)
    const nativeStringify = JSON.stringify;
    JSON.stringify = function (value, replacer, space) {
      try {
        if (value && typeof value === 'object' && isBypassUploadEnabled()) {
          patchPostPayload(value);
        }
      } catch (_) {}
      return nativeStringify.call(this, value, replacer, space);
    };

    const isPostListEndpoint = (url) => {
      if (typeof url !== 'string') return false;
      return /(?:\/item\/|\/content\/|\/post\/|\/creator\/|\/aweme\/)/i.test(url);
    };

    // 2. Hook window.fetch
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      try {
        if (isBypassUploadEnabled() && isPostPublishRequest(url)) {
          if (typeof init.body === 'string') {
            init = { ...init, body: patchBodyString(init.body) };
            log('⚡ 1:1 High Quality Flags injected into fetch payload');
          } else if (typeof Request !== 'undefined' && input instanceof Request) {
            const bodyText = await input.clone().text();
            if (bodyText) {
              input = new Request(input, { body: patchBodyString(bodyText) });
              log('⚡ 1:1 High Quality Flags injected into Request stream');
            }
          }
        }
      } catch (err) {
        log('fetch intercept error:', err.message);
      }

      const response = await origFetch.call(this, input, init);

      try {
        if (isPostListEndpoint(url)) {
          response.clone().json().then(json => {
            extractAndStorePosts(json);
          }).catch(() => {});
        }
      } catch (_) {}

      return response;
    };

    // 3. Hook XMLHttpRequest
    const xhrProto = XMLHttpRequest.prototype;
    const origXhrOpen = xhrProto.open;
    const origXhrSend = xhrProto.send;

    xhrProto.open = function (method, url) {
      this.__fishAccUrl = url;
      return origXhrOpen.apply(this, arguments);
    };

    xhrProto.send = function (body) {
      try {
        if (isBypassUploadEnabled() && isPostPublishRequest(this.__fishAccUrl) && typeof body === 'string') {
          body = patchBodyString(body);
          log('⚡ 1:1 High Quality Flags injected into XHR payload');
        }
      } catch (err) {
        log('xhr intercept error:', err.message);
      }

      try {
        if (isPostListEndpoint(this.__fishAccUrl)) {
          this.addEventListener('load', function () {
            try {
              if (this.responseText && this.responseText.startsWith('{')) {
                const json = JSON.parse(this.responseText);
                extractAndStorePosts(json);
              }
            } catch (_) {}
          });
        }
      } catch (_) {}

      return origXhrSend.call(this, body);
    };

    // Pantau dan inject UI card pada upload page & check quality buttons pada post page
    setInterval(() => {
      if (window.location.pathname.includes('/upload')) {
        injectUploadBypassCard();
      } else if (window.location.pathname.includes('/content') || window.location.pathname.includes('/post')) {
        injectCheckQualityButtons();
      }
    }, 700);

    window.addEventListener('popstate', () => {
      setTimeout(applyThemeToAllCharts, 400);
      setTimeout(checkPostGrid, 300);
      setTimeout(injectCheckQualityButtons, 350);
      startGridObserver();
    });

    ['pushState', 'replaceState'].forEach((method) => {
      const original = history[method];
      if (typeof original === 'function') {
        history[method] = function (...args) {
          const res = original.apply(this, args);
          setTimeout(applyThemeToAllCharts, 400);
          setTimeout(checkPostGrid, 300);
          setTimeout(injectCheckQualityButtons, 350);
          startGridObserver();
          return res;
        };
      }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        findEChartsInstances().forEach(inst => {
          try { inst.resize(); } catch (e) {}
        });
      }, 150);
    });
  };
