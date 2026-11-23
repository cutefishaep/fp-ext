/**
 * Fish Acceleration — MV3 Background Service Worker
 *
 * Menangani network probe lintas-origin (TikWM metadata & CDN MP4 Range probe)
 * menggunakan host_permissions ekstensi sehingga halaman TikTok tidak perlu
 * melepas Content-Security-Policy ataupun menyuntikkan wildcard CORS.
 */
'use strict';

const ALLOWED_STREAM_HOST_RE = /(?:^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|akamaized\.net|tiktok\.com|tikwm\.com)$/i;
const ALLOWED_TIKWM_HOST_RE = /(?:^|\.)tikwm\.com$/i;
const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/cutefishaep/fp-ext/releases/latest';
const TIKTOK_STUDIO_URL_RE = /^https:\/\/([^/]+\.)?tiktok\.com\/(tiktokstudio(\/|$|\?|#)|upload(\/|$|\?|#))/i;
const SESSION_TABS_KEY = 'fa_verified_tabs';
const LOCAL_UPDATE_CACHE_KEY = 'fa_update_cache';
const LIVE_CORE_STORAGE_KEY = 'fa_live_core';

const compareVersions = (a, b) => {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
};

const sha256HexBuffer = async (arrayBuffer) => {
  const hash = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
};

let _cachedBundledCoreVersion = null;
const getBundledCoreVersion = async () => {
  const loaderVersion = chrome.runtime.getManifest().version;
  if (_cachedBundledCoreVersion) return _cachedBundledCoreVersion;
  try {
    const res = await fetch(chrome.runtime.getURL('core-version.json'), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.coreVersion) _cachedBundledCoreVersion = String(data.coreVersion);
    }
  } catch (_) {}
  return _cachedBundledCoreVersion || loaderVersion;
};

const getVersions = async () => {
  const loaderVersion = chrome.runtime.getManifest().version;
  const bundledCoreVersion = await getBundledCoreVersion();
  let liveCore = null;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;
  } catch (_) {}
  const coreVersion = liveCore?.coreVersion || bundledCoreVersion;
  return { loaderVersion, coreVersion, bundledCoreVersion, hasLiveCore: Boolean(liveCore?.css) };
};

const injectLiveCoreCss = async (tabId) => {
  if (!chrome.scripting?.insertCSS) return;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    const liveCore = stored?.[LIVE_CORE_STORAGE_KEY];
    if (liveCore?.css) {
      await chrome.scripting.insertCSS({ target: { tabId }, css: liveCore.css });
    } else {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    }
  } catch (_) {}
};

const streamFetchWithProgress = async (url, expectedSize, startPct, endPct, title, emit) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const totalBytes = Number(res.headers.get('content-length')) || Number(expectedSize) || 0;
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buf = await res.arrayBuffer();
    emit(endPct, title, `${(buf.byteLength / 1024).toFixed(1)} KB`);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loadedBytes = 0;
  let lastEmitAt = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength) {
      chunks.push(value);
      loadedBytes += value.byteLength;
      const now = Date.now();
      if (now - lastEmitAt >= 40) {
        lastEmitAt = now;
        const pct = totalBytes > 0
          ? Math.min(endPct, startPct + Math.round((loadedBytes / totalBytes) * (endPct - startPct)))
          : Math.round((startPct + endPct) / 2);
        const detail = totalBytes > 0
          ? `${(loadedBytes / 1024).toFixed(1)} / ${(totalBytes / 1024).toFixed(1)} KB`
          : `${(loadedBytes / 1024).toFixed(1)} KB`;
        emit(pct, title, detail);
      }
    }
  }
  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  emit(endPct, title, `${(loadedBytes / 1024).toFixed(1)} KB`);
  return merged.buffer;
};

const extractZipEntries = async (arrayBuffer, wantedNames) => {
  const wanted = new Set(wantedNames);
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  let eocdOffset = -1;
  const minOff = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= minOff; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP archive (EOCD not found).');

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');
  const out = {};

  for (let i = 0; i < totalEntries && cdOffset + 46 <= bytes.length; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (!wanted.has(name)) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) continue;

    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      out[name] = compressed;
    } else if (method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const decompressed = await new Response(new Blob([compressed]).stream().pipeThrough(ds)).arrayBuffer();
      out[name] = new Uint8Array(decompressed);
    }
  }
  return out;
};

const handleCheckAndVerifyUpdate = async (onProgress = () => {}) => {
  const emit = (percent, title, detail = '') => {
    try { onProgress({ percent, title, detail }); } catch (_) {}
  };

  const { loaderVersion, coreVersion: currentVersion, bundledCoreVersion } = await getVersions();
  emit(8, 'Checking for updates...', 'Fetching latest release metadata from GitHub...');

  let release;
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!res.ok) {
      return { status: 'offline', loaderVersion, currentVersion, error: `GitHub returned HTTP ${res.status}.` };
    }
    release = await res.json();
  } catch (err) {
    return { status: 'offline', loaderVersion, currentVersion, error: err?.message || 'Unable to reach GitHub Releases.' };
  }

  const latestVersion = String(release?.tag_name || '').replace(/^v/i, '');
  const releaseUrl = release?.html_url || 'https://github.com/cutefishaep/fp-ext/releases';
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const zipAsset = assets.find((a) => a?.name === 'loader.zip') || assets.find((a) => /\.zip$/i.test(a?.name || ''));
  const expectedZipSha = String(zipAsset?.digest || '').replace(/^sha256:/i, '').trim();

  let liveCore = null;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;
  } catch (_) {}

  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const needsDownload = Boolean(
    zipAsset?.browser_download_url &&
    (hasUpdate || !liveCore?.css || (expectedZipSha && liveCore?.zipSha256 && liveCore.zipSha256 !== expectedZipSha.toLowerCase()))
  );

  let activeZipSha = liveCore?.zipSha256 || expectedZipSha || '';
  let integrityFiles = liveCore?.integrityFiles || null;

  if (needsDownload) {
    try {
      const zipBuf = await streamFetchWithProgress(
        zipAsset.browser_download_url,
        zipAsset.size,
        18,
        74,
        'Downloading loader.zip...',
        emit
      );
      emit(78, 'Verifying package SHA-256...', zipAsset.name || 'Computing SHA-256...');
      const actualZipSha = await sha256HexBuffer(zipBuf);

      if (expectedZipSha && actualZipSha.toLowerCase() !== expectedZipSha.toLowerCase()) {
        return {
          status: 'sha_mismatch',
          mismatchSource: 'package',
          loaderVersion,
          currentVersion,
          latestVersion,
          expectedSha: expectedZipSha.toLowerCase(),
          actualSha: actualZipSha.toLowerCase(),
          mismatchedFiles: [zipAsset.name],
          releaseUrl
        };
      }

      emit(82, 'Extracting Core...', 'Reading content.css & core-config.json...');
      const entries = await extractZipEntries(zipBuf, ['content.css', 'core-config.json', 'integrity.json']);
      const cssBytes = entries['content.css'];
      const cfgBytes = entries['core-config.json'];
      const intBytes = entries['integrity.json'];

      const integrityData = intBytes ? JSON.parse(new TextDecoder().decode(intBytes)) : null;
      integrityFiles = integrityData?.files || null;

      let cssText = '';
      let actualCssSha = '';
      if (cssBytes) {
        actualCssSha = await sha256HexBuffer(cssBytes.buffer.slice(cssBytes.byteOffset, cssBytes.byteOffset + cssBytes.byteLength));
        const expectedCssSha = String(integrityFiles?.['content.css'] || '').trim();
        if (expectedCssSha && actualCssSha.toLowerCase() !== expectedCssSha.toLowerCase()) {
          return {
            status: 'sha_mismatch',
            mismatchSource: 'core',
            loaderVersion,
            currentVersion,
            latestVersion,
            expectedSha: expectedCssSha.toLowerCase(),
            actualSha: actualCssSha.toLowerCase(),
            mismatchedFiles: ['content.css'],
            releaseUrl
          };
        }
        cssText = new TextDecoder().decode(cssBytes);
      }

      let configObj = null;
      let actualCfgSha = '';
      if (cfgBytes) {
        actualCfgSha = await sha256HexBuffer(cfgBytes.buffer.slice(cfgBytes.byteOffset, cfgBytes.byteOffset + cfgBytes.byteLength));
        const expectedCfgSha = String(integrityFiles?.['core-config.json'] || '').trim();
        if (expectedCfgSha && actualCfgSha.toLowerCase() !== expectedCfgSha.toLowerCase()) {
          return {
            status: 'sha_mismatch',
            mismatchSource: 'core',
            loaderVersion,
            currentVersion,
            latestVersion,
            expectedSha: expectedCfgSha.toLowerCase(),
            actualSha: actualCfgSha.toLowerCase(),
            mismatchedFiles: ['core-config.json'],
            releaseUrl
          };
        }
        configObj = JSON.parse(new TextDecoder().decode(cfgBytes));
      }

      activeZipSha = actualZipSha;
      await chrome.storage?.local?.set({
        [LIVE_CORE_STORAGE_KEY]: {
          coreVersion: latestVersion || currentVersion,
          css: cssText,
          cssSha256: actualCssSha,
          config: configObj,
          configSha256: actualCfgSha,
          zipSha256: actualZipSha,
          integrityFiles,
          updatedAt: Date.now()
        }
      });
    } catch (err) {
      return {
        status: 'offline',
        loaderVersion,
        currentVersion,
        latestVersion,
        error: err?.message || 'Failed to download & verify loader.zip.'
      };
    }
  } else if (liveCore?.css) {
    emit(60, 'Verifying cached Core...', 'Checking live Core SHA-256...');
    const cachedCssSha = await sha256HexBuffer(new TextEncoder().encode(liveCore.css).buffer);
    if (liveCore.cssSha256 && cachedCssSha.toLowerCase() !== liveCore.cssSha256.toLowerCase()) {
      return {
        status: 'sha_mismatch',
        mismatchSource: 'core',
        loaderVersion,
        currentVersion,
        latestVersion,
        expectedSha: liveCore.cssSha256.toLowerCase(),
        actualSha: cachedCssSha.toLowerCase(),
        mismatchedFiles: ['content.css (cached)'],
        releaseUrl
      };
    }
  }

  let jsUpdateAvailable = false;
  if (integrityFiles) {
    const jsFiles = ['content.js', 'isolated.js', 'background.js'];
    for (let i = 0; i < jsFiles.length; i++) {
      const f = jsFiles[i];
      const expected = integrityFiles[f];
      if (!expected) continue;
      emit(88 + Math.round(((i + 1) / jsFiles.length) * 10), 'Verifying SHA-256...', `Checking ${f} (${i + 1}/${jsFiles.length})`);
      try {
        const localRes = await fetch(chrome.runtime.getURL(f), { cache: 'no-store' });
        if (!localRes.ok) continue;
        const actual = await sha256HexBuffer(await localRes.arrayBuffer());
        if (actual.toLowerCase() !== String(expected).toLowerCase()) {
          if (compareVersions(latestVersion, bundledCoreVersion) === 0) {
            return {
              status: 'sha_mismatch',
              mismatchSource: 'local',
              loaderVersion,
              currentVersion,
              latestVersion,
              expectedSha: String(expected).toLowerCase(),
              actualSha: actual.toLowerCase(),
              mismatchedFiles: [f],
              releaseUrl
            };
          }
          jsUpdateAvailable = true;
        }
      } catch (_) {}
    }
  }

  emit(100, 'Verification complete', '100%');
  const activeVersion = (needsDownload && latestVersion) ? latestVersion : currentVersion;
  const cachePayload = {
    checkedAt: Date.now(),
    loaderVersion,
    currentVersion: activeVersion,
    latestVersion,
    releaseUrl,
    coreSha256: activeZipSha,
    jsUpdateAvailable
  };
  try {
    await chrome.storage?.local?.set({ [LOCAL_UPDATE_CACHE_KEY]: cachePayload });
  } catch (_) {}

  return {
    status: hasUpdate ? 'updated' : 'ok',
    ...cachePayload
  };
};

const isAllowedUrl = (rawUrl, hostPattern) => {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && hostPattern.test(parsed.hostname);
  } catch {
    return false;
  }
};

const isUndetectedMethodStr = (str) => {
  if (!str || typeof str !== 'string') return true;
  let s = str.trim();
  if (!s || s === '—' || s === '-' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'undetected') return true;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return true;
  if (/^(data|stsd|avc1|mp4v|hdlr|meta|mdia|moov|trak|udta|ilst|desc|cmt|vide|soun)$/i.test(s)) return true;
  if (s.startsWith('{') && s.endsWith('}')) return true;
  try {
    if (s.startsWith('{')) { JSON.parse(s); return true; }
  } catch (_) {}
  if (/^(lavf|lavc|ffmpeg|handbrake|libav|x264|x265)/i.test(s)) return true;
  if (/^vid:[a-zA-Z0-9_-]+/i.test(s)) return true;
  if (/^v\d{4,}[a-zA-Z0-9_-]{8,}/i.test(s)) return true;
  if (/^(item_id|video_id|tos_id|aweme_id|music_id|author_id):/i.test(s)) return true;
  if (/^(isom|mp42|dash|iso2|qt|avc1|mp41)$/i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  if (!/[a-zA-Z]/.test(s)) return true;
  return false;
};

const parseMp4MetadataFromBuffer = (buffer) => {
  if (!buffer || buffer.byteLength < 16) return null;
  const raw = buffer.buffer ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let fps = null;
  let width = 0;
  let height = 0;
  let comment = '';
  let durationSec = 0;

  // 1. Resolution & Matrix rotation from tkhd
  for (let i = 0; i < raw.length - 8; i++) {
    if (raw[i] === 0x74 && raw[i + 1] === 0x6B && raw[i + 2] === 0x68 && raw[i + 3] === 0x64) {
      const version = view.getUint8(i + 4);
      const wOffset = version === 1 ? i + 92 : i + 80;
      const hOffset = version === 1 ? i + 96 : i + 84;
      if (hOffset + 4 <= raw.length) {
        let w = Math.round(view.getUint32(wOffset) / 65536);
        let h = Math.round(view.getUint32(hOffset) / 65536);

        const matrixOffset = version === 1 ? (i - 4) + 60 : (i - 4) + 48;
        if (matrixOffset + 36 <= raw.length && w > 0 && h > 0) {
          const m0 = view.getInt32(matrixOffset, false) / 65536;
          const m4 = view.getInt32(matrixOffset + 16, false) / 65536;
          if (Math.abs(m0) < 0.5 && Math.abs(m4) < 0.5) {
            const tmp = w; w = h; h = tmp;
          }
        }
        if (w > 0 && h > 0 && w < 16000 && h < 16000) {
          width = w;
          height = h;
          break;
        }
      }
    }
  }

  // 2. FPS from 'vide' track mdhd & stts
  for (let i = 0; i < raw.length - 8; i++) {
    if (raw[i] === 0x76 && raw[i + 1] === 0x69 && raw[i + 2] === 0x64 && raw[i + 3] === 0x65) {
      const searchStart = Math.max(0, i - 300);
      const searchEnd = Math.min(raw.length, i + 8000);
      let timescale = 0;
      let sampleDelta = 0;
      for (let j = searchStart; j < searchEnd - 8; j++) {
        if (raw[j] === 0x6D && raw[j + 1] === 0x64 && raw[j + 2] === 0x68 && raw[j + 3] === 0x64) {
          const version = view.getUint8(j + 4);
          timescale = version === 1 ? view.getUint32(j + 24) : view.getUint32(j + 16);
          const dur = version === 1 ? view.getUint32(j + 32) : view.getUint32(j + 20);
          if (timescale > 0 && dur > 0) durationSec = Math.round(dur / timescale);
        }
        if (raw[j] === 0x73 && raw[j + 1] === 0x74 && raw[j + 2] === 0x74 && raw[j + 3] === 0x73) {
          const entryCount = view.getUint32(j + 8);
          if (entryCount > 0) {
            sampleDelta = view.getUint32(j + 16);
          }
        }
        if (timescale > 0 && sampleDelta > 0) {
          const calcFps = Math.round(timescale / sampleDelta);
          if (calcFps > 0 && calcFps < 300) {
            fps = calcFps;
            break;
          }
        }
      }
      if (fps) break;
    }
  }

  // 3. Fallback FPS scan if 'vide' atom was displaced
  if (!fps) {
    let timescale = 0;
    let sampleDelta = 0;
    for (let i = 0; i < raw.length - 8; i++) {
      if (raw[i] === 0x6D && raw[i + 1] === 0x64 && raw[i + 2] === 0x68 && raw[i + 3] === 0x64) {
        const version = view.getUint8(i + 4);
        timescale = version === 1 ? view.getUint32(i + 24) : view.getUint32(i + 16);
      }
      if (raw[i] === 0x73 && raw[i + 1] === 0x74 && raw[i + 2] === 0x74 && raw[i + 3] === 0x73) {
        const entryCount = view.getUint32(i + 8);
        if (entryCount > 0) {
          sampleDelta = view.getUint32(i + 16);
        }
      }
      if (timescale > 0 && sampleDelta > 0) {
        const calcFps = Math.round(timescale / sampleDelta);
        if (calcFps > 0 && calcFps < 300) {
          fps = calcFps;
          break;
        }
      }
    }
  }

  // 4. Comment / Ingest Method — iTunes ilst walker (moov -> udta -> meta -> ilst)
  const walkBoxes = (start, end, depth) => {
    const boxes = [];
    if (depth > 5) return boxes;
    let p = start;
    while (p + 8 <= end) {
      let size = view.getUint32(p);
      const type = String.fromCharCode(raw[p + 4], raw[p + 5], raw[p + 6], raw[p + 7]);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) break;
        size = view.getUint32(p + 8) * 4294967296 + view.getUint32(p + 12);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) break;
      boxes.push({ type, payloadStart: p + header, payloadEnd: p + size });
      p += size;
    }
    return boxes;
  };

  const findIlst = (start, end, depth) => {
    for (const b of walkBoxes(start, end, depth)) {
      if (b.type === 'ilst') return b;
      if (b.type === 'moov' || b.type === 'udta') {
        const hit = findIlst(b.payloadStart, b.payloadEnd, depth + 1);
        if (hit) return hit;
      } else if (b.type === 'meta') {
        const hit = findIlst(b.payloadStart, b.payloadEnd, depth + 1) ||
          (b.payloadStart + 4 <= b.payloadEnd ? findIlst(b.payloadStart + 4, b.payloadEnd, depth + 1) : null);
        if (hit) return hit;
      }
    }
    return null;
  };

  const tagMap = {};
  const ilstAtom = findIlst(0, raw.length, 0);
  if (ilstAtom) {
    for (const child of walkBoxes(ilstAtom.payloadStart, ilstAtom.payloadEnd, 2)) {
      const dataBox = walkBoxes(child.payloadStart, child.payloadEnd, 3).find((d) => d.type === 'data');
      if (!dataBox) continue;
      const dataType = view.getUint32(dataBox.payloadStart);
      if (dataType !== 1 && dataType !== 0) continue;
      let s = '';
      for (let k = dataBox.payloadStart + 8; k < dataBox.payloadEnd; k++) {
        const c = raw[k];
        if (c === 0) break;
        if (c >= 0x20 && c <= 0x7E) s += String.fromCharCode(c);
      }
      s = s.trim();
      if (s && !tagMap[child.type]) tagMap[child.type] = s;
    }
  }

  const methodTagOrder = ['\u00A9cmt', 'cprt', '\u00A9des', 'desc', '\u00A9too', 'too', '\u00A9nam', '\u00A9xyz', 'nam'];
  for (const tag of methodTagOrder) {
    const cand = tagMap[tag];
    if (cand && !isUndetectedMethodStr(cand)) {
      comment = cand;
      break;
    }
  }

  return { fps, width, height, comment, duration: durationSec };
};

const handleProbeVideo = async ({ pageUrl, streamUrl }) => {
  let tikwmData = null;
  let resolvedStreamUrl = isAllowedUrl(streamUrl, ALLOWED_STREAM_HOST_RE) ? streamUrl : null;

  if (pageUrl && typeof pageUrl === 'string' && pageUrl.startsWith('https://www.tiktok.com/')) {
    try {
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}`;
      if (isAllowedUrl(apiUrl, ALLOWED_TIKWM_HOST_RE)) {
        const twRes = await fetch(apiUrl);
        if (twRes.ok) {
          const twJson = await twRes.json();
          if (twJson && twJson.code === 0 && twJson.data) {
            tikwmData = twJson.data;
            if (!resolvedStreamUrl) {
              const cand = tikwmData.play || tikwmData.hdplay || (tikwmData.id ? `https://www.tikwm.com/video/media/play/${tikwmData.id}.mp4` : null);
              if (isAllowedUrl(cand, ALLOWED_STREAM_HOST_RE)) {
                resolvedStreamUrl = cand;
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  let totalSizeBytes = tikwmData?.size || 0;
  let atomMeta = null;

  if (resolvedStreamUrl) {
    try {
      const probeRes = await fetch(resolvedStreamUrl, {
        headers: { 'Range': 'bytes=0-2097151' }
      });
      const cr = probeRes.headers.get('content-range');
      if (cr && cr.includes('/')) {
        const parsed = parseInt(cr.split('/')[1], 10);
        if (!isNaN(parsed) && parsed > 0) totalSizeBytes = parsed;
      } else {
        const cl = probeRes.headers.get('content-length');
        if (cl && probeRes.status !== 206) {
          const parsed = parseInt(cl, 10);
          if (!isNaN(parsed) && parsed > 0) totalSizeBytes = parsed;
        }
      }

      if (probeRes.ok || probeRes.status === 206) {
        const ab = await probeRes.arrayBuffer();
        atomMeta = parseMp4MetadataFromBuffer(new Uint8Array(ab));
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

chrome.tabs?.onRemoved?.addListener((tabId) => {
  chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
    const tabs = data?.[SESSION_TABS_KEY];
    if (tabs && tabs[String(tabId)]) {
      delete tabs[String(tabId)];
      chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
    }
  });
});

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  const isFullLoad = changeInfo.status === 'loading';
  const candidateUrl = changeInfo.url || (isFullLoad ? tab?.url : null);
  if (!candidateUrl || !TIKTOK_STUDIO_URL_RE.test(candidateUrl)) return;

  getVersions().then(({ coreVersion }) => {
    chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
      const tabs = data?.[SESSION_TABS_KEY] || {};
      const key = String(tabId);
      const entry = tabs[key];

      if (isFullLoad) {
        if (entry && entry.allowNextLoad && entry.version === coreVersion && (Date.now() - entry.approvedAt < 20000)) {
          entry.allowNextLoad = false;
          entry.spaAllowed = true;
          tabs[key] = entry;
          chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
          injectLiveCoreCss(tabId);
          return;
        }
        if (entry) {
          delete tabs[key];
          chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
        }
        const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(candidateUrl)}`;
        chrome.tabs.update(tabId, { url: gateUrl });
        return;
      }

      if (entry && entry.spaAllowed && entry.version === coreVersion) {
        injectLiveCoreCss(tabId);
        return;
      }

      const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(candidateUrl)}`;
      chrome.tabs.update(tabId, { url: gateUrl });
    });
  });
});

chrome.runtime.onConnect?.addListener((port) => {
  if (!port || port.name !== 'fa-update-check') return;
  port.onMessage.addListener((msg) => {
    if (!msg || msg.type !== 'START') return;
    handleCheckAndVerifyUpdate((prog) => {
      try { port.postMessage({ type: 'progress', ...prog }); } catch (_) {}
    })
      .then((data) => {
        try { port.postMessage({ type: 'result', data }); } catch (_) {}
      })
      .catch((err) => {
        try {
          port.postMessage({
            type: 'result',
            data: {
              status: 'offline',
              currentVersion: chrome.runtime.getManifest().version,
              error: err?.message || 'Unexpected verification error.'
            }
          });
        } catch (_) {}
      });
  });
});

const ensureOffscreenDocument = async () => {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl]
    });
    if (contexts.length > 0) return true;
  } else if (chrome.offscreen?.hasDocument && (await chrome.offscreen.hasDocument())) {
    return true;
  }
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run FFmpeg WASM video compression in a dedicated worker'
  });
  return true;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'PROBE_VIDEO') {
    handleProbeVideo(message)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }

  if (message.type === 'CHECK_AND_VERIFY_UPDATE') {
    handleCheckAndVerifyUpdate()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({
        status: 'offline',
        currentVersion: chrome.runtime.getManifest().version,
        error: err?.message || 'Unexpected verification error.'
      }));
    return true;
  }

  if (message.type === 'GET_VERSIONS') {
    getVersions().then((v) => sendResponse(v));
    return true;
  }

  if (message.type === 'ENSURE_OFFSCREEN') {
    ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Offscreen error' }));
    return true;
  }

  if (message.type === 'APPROVE_SESSION') {
    const tabId = message.tabId || _sender?.tab?.id;
    getVersions().then(({ coreVersion }) => {
      chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
        const tabs = data?.[SESSION_TABS_KEY] || {};
        if (tabId) {
          tabs[String(tabId)] = {
            version: coreVersion,
            allowNextLoad: true,
            spaAllowed: true,
            bypassed: Boolean(message.bypassed),
            approvedAt: Date.now()
          };
        }
        chrome.storage?.session?.set({ [SESSION_TABS_KEY]: tabs }, () => {
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }

  if (message.type === 'OPEN_VERIFIED_STUDIO') {
    const targetUrl = message.url || 'https://www.tiktok.com/tiktokstudio/content';
    getVersions().then(({ coreVersion }) => {
      chrome.tabs.create({ url: targetUrl }, (newTab) => {
        if (!newTab?.id) {
          sendResponse({ ok: false });
          return;
        }
        chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
          const tabs = data?.[SESSION_TABS_KEY] || {};
          tabs[String(newTab.id)] = {
            version: coreVersion,
            allowNextLoad: true,
            spaAllowed: true,
            bypassed: Boolean(message.bypassed),
            approvedAt: Date.now()
          };
          chrome.storage?.session?.set({ [SESSION_TABS_KEY]: tabs }, () => {
            sendResponse({ ok: true, tabId: newTab.id });
          });
        });
      });
    });
    return true;
  }

  return false;
});
