/**
 * FRY Mention Library  (dulu: "SoundSafe & CoverSafe + FRY 60fps Watermark Hook")
 * ---------------------------------------------------------------------------
 * DIROMBAK: file ini TIDAK lagi memasang hook JSON.stringify / fetch / XHR.
 * Interceptor payload publish kini 100% milik content script (triple-hook di
 * src/content/11-triple-hook-upload.js) supaya caption tidak pernah dobel —
 * watermark tetap bersumber dari kartu Bypass Upload (fish_acc_bypass_watermark).
 *
 * Yang disimpan & dijadikan library: fitur unik SoundSafe, yaitu @mention
 * KLIKABEL — handle pada watermark di-resolve ke UID TikTok asli via API search,
 * lalu triple-hook membangun text_extra + markup <m id="..">@handle</m>.
 *
 * API publik: window.FRYMention
 *   - extractHandles(text)                     → daftar handle @xxx pada teks
 *   - resolve(handle) / resolveMany([...])     → resolve UID (async, ter-cache)
 *   - getCached(handle)                        → baca UID dari cache (sinkron)
 *   - warm(text|array)                         → pre-resolve di background
 *   - buildMentionExtras(existing, text, regionStart, handles)
 *                                              → { extras, spans } utk text_extra
 *   - buildMarkupRegion(regionText, spans, regionStart)
 *                                              → markup region dgn tag <m>
 */
(() => {
  "use strict";

  if (window.FRYMention) return; // Sudah termuat — jangan dobel
  window.__fryMentionLoaded = true;

  // ================= KONFIGURASI =================
  const SEARCH_ENDPOINTS = [
    (h) => '/api/upload/search/user/?aid=1988&keyword=' + encodeURIComponent(h),
    (h) => '/api/search/user/full/?aid=1988&keyword=' + encodeURIComponent(h)
  ];
  // Deteksi OTOMATIS: setiap "@handle" pada watermark = mention orang.
  // Batas handle = karakter non-username (spasi, tanda baca, ✦, dll):
  // "Method from @cutefishaep" → mention "cutefishaep"; "@user <" → mention "user".
  // Lookbehind mencegah email (user@domain.xyz) ikut terdeteksi sebagai mention.
  const HANDLE_REGEX = /(?<![A-Za-z0-9])@([A-Za-z0-9._]{2,24})/g;

  // ================= CACHE UID =================
  const cache = new Map();   // handle(lower) → { uid, secUid, nickname, handle, at }
  const pending = new Map(); // handle(lower) → Promise in-flight

  const normalizeHandle = (h) => String(h || '').replace(/^@/, '').trim();

  function extractHandles(text) {
    const out = [];
    const re = new RegExp(HANDLE_REGEX.source, 'g');
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
      const h = m[1].replace(/[._]+$/, '');
      if (h && out.indexOf(h) === -1) out.push(h);
    }
    return out;
  }

  async function fetchUserInfo(handle) {
    for (const buildUrl of SEARCH_ENDPOINTS) {
      try {
        const res = await fetch(buildUrl(handle), {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) continue;
        const json = await res.json();
        const userList = json?.user_list || json?.data?.user_list || json?.user_list_info || [];
        let found = null;
        for (const item of userList) {
          const u = item?.user_info || item?.user || item;
          if (String(u?.unique_id || u?.uniqueId || '').toLowerCase() === String(handle).toLowerCase()) {
            found = u;
            break;
          }
        }
        if (found) {
          const uid = found.uid || found.user_id || found.id;
          if (!uid) continue;
          return {
            uid: String(uid),
            secUid: String(found.sec_uid || found.secUid || found.sec_user_id || ''),
            nickname: String(found.nickname || found.screen_name || ''),
            handle: String(found.unique_id || found.uniqueId || handle),
            at: Date.now()
          };
        }
      } catch (_) {}
    }
    return null;
  }

  function resolve(handle) {
    const key = normalizeHandle(handle).toLowerCase();
    if (!key) return Promise.resolve(null);
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const p = fetchUserInfo(key)
      .then((info) => {
        pending.delete(key);
        if (info) {
          cache.set(key, info);
          console.info('[FRY Mention] UID resolved:', info.handle, '→', info.uid);
        }
        return info;
      })
      .catch(() => {
        pending.delete(key);
        return null;
      });
    pending.set(key, p);
    return p;
  }

  function resolveMany(handles) {
    const list = (Array.isArray(handles) ? handles : [handles])
      .map(normalizeHandle).filter(Boolean);
    return Promise.all(list.map((h) => resolve(h)));
  }

  // Pre-resolve di background: input bisa berupa teks watermark atau array handle.
  function warm(input) {
    const list = Array.isArray(input)
      ? input.map(normalizeHandle)
      : extractHandles(input);
    list.filter(Boolean).forEach((h) => { try { resolve(h); } catch (_) {} });
  }

  function getCached(handle) {
    return cache.get(normalizeHandle(handle).toLowerCase()) || null;
  }

  // ================= HELPER STRING =================
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ================= BUILDER text_extra & MARKUP =================
  /**
   * Bangun entri text_extra untuk mention pada watermark.
   * @param {Array} existingExtras - text_extra milik TikTok/user (dipertahankan apa adanya)
   * @param {string} finalText     - teks caption FINAL (watermark sudah ter-append)
   * @param {number} regionStart   - offset awal watermark di finalText
   * @param {Array}  handles       - handle dalam watermark (tanpa @)
   * @returns {{extras: Array, spans: Array}} spans = {handle, mention, start, end, tagId}
   *          Handle yang belum ter-resolve UID-nya dibiarkan jadi teks polos.
   */
  function buildMentionExtras(existingExtras, finalText, regionStart, handles) {
    const extras = (Array.isArray(existingExtras) ? existingExtras : []).slice();
    const used = new Set(extras
      .filter((e) => e && e.tag_id !== undefined && e.tag_id !== null)
      .map((e) => String(e.tag_id)));
    let nextId = 0;
    while (used.has(String(nextId))) nextId++;

    const text = String(finalText || '');
    const start = Math.max(0, Number(regionStart) || 0);
    const spans = [];
    let cursor = start;

    for (const raw of (Array.isArray(handles) ? handles : [])) {
      const h = normalizeHandle(raw);
      if (!h) continue;
      const mention = '@' + h;
      const idx = text.indexOf(mention, cursor);
      if (idx === -1 || idx < start) continue;
      const info = cache.get(h.toLowerCase());
      if (!info || !info.uid) continue; // belum resolve → biarkan teks polos
      const entry = {
        start: idx,
        end: idx + mention.length,
        user_id: String(info.uid),
        type: 0,
        hashtag_name: h,
        tag_id: String(nextId)
      };
      if (info.secUid) entry.sec_uid = String(info.secUid);
      used.add(String(nextId));
      nextId++;
      extras.push(entry);
      spans.push({ handle: h, mention, start: idx, end: entry.end, tagId: entry.tag_id });
      cursor = entry.end;
    }
    return { extras, spans };
  }

  /**
   * Render region watermark sebagai markup: teks di-luar mention di-escape apa
   * adanya, substring mention diganti <m id="tagId">@handle</m> (klikabel).
   * Offset spans bersifat absolut pada caption final; regionStart memotongnya.
   */
  function buildMarkupRegion(regionText, spans, regionStart) {
    const region = String(regionText || '');
    const base = Math.max(0, Number(regionStart) || 0);
    const list = (Array.isArray(spans) ? spans : [])
      .filter((s) => s && s.start >= base && s.end <= base + region.length)
      .sort((a, b) => a.start - b.start);

    let out = '';
    let cursor = 0;
    for (const s of list) {
      const rel = s.start - base;
      if (rel < cursor) continue; // overlap guard
      out += escapeHtml(region.slice(cursor, rel));
      out += '<m id="' + escapeAttr(s.tagId) + '">' + escapeHtml(s.mention) + '</m>';
      cursor = rel + s.mention.length;
    }
    out += escapeHtml(region.slice(cursor));
    return out;
  }

  // ================= EKSPOS API =================
  window.FRYMention = {
    version: '1.0',
    extractHandles,
    resolve,
    resolveMany,
    warm,
    getCached,
    buildMentionExtras,
    buildMarkupRegion,
    get cacheSize() { return cache.size; }
  };

  console.info('[FRY Mention] Library ready — resolver @mention klikabel (tanpa hook jaringan).');
})();
