/**
 * Fish Acceleration Canary — Manifest V2 Persistent Background
 *
 * - webRequestBlocking Desktop Edge UA + Client Hints spoofing
 * - Live Core Auto-Updater (extracts content.css + isolated.js + core-config.json + integrity.json from loader.zip)
 * - Built-in FFmpeg WASM Dedicated Worker host (no offscreen document needed in MV2)
 * - TikWM & CDN MP4 Range probe
 */
'use strict';

const ALLOWED_STREAM_HOST_RE = /(?:^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|akamaized\.net|tiktok\.com|tikwm\.com)$/i;
const ALLOWED_TIKWM_HOST_RE = /(?:^|\.)tikwm\.com$/i;
const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/cutefishaep/fp-ext/releases/latest';
const TIKTOK_STUDIO_URL_RE = /^https:\/\/([^/]+\.)?tiktok\.com\/(tiktokstudio(\/|$|\?|#)|upload(\/|$|\?|#))/i;
const LOCAL_UPDATE_CACHE_KEY = 'fa_update_cache';
const LIVE_CORE_STORAGE_KEY = 'fa_live_core';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const SEC_CH_UA = '"Not/A)Brand";v="8", "Chromium";v="126", "Microsoft Edge";v="126"';
const SEC_CH_UA_FULL = '"Not/A)Brand";v="8.0.0.0", "Chromium";v="126.0.6478.127", "Microsoft Edge";v="126.0.2592.87"';

const verifiedTabs = new Map();

const storageGet = (keys) => new Promise((resolve) => {
  try {
    chrome.storage.local.get(keys, (res) => resolve(res || {}));
  } catch (_) {
    resolve({});
  }
});

const storageSet = (obj) => new Promise((resolve) => {
  try {
    chrome.storage.local.set(obj, () => resolve());
  } catch (_) {
    resolve();
  }
});

// 1. Desktop Edge UA + Client Hints Spoofing (MV2 webRequestBlocking)
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const headers = details.requestHeaders || [];
    const overrides = {
      'user-agent': DESKTOP_UA,
      'sec-ch-ua': SEC_CH_UA,
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-ch-ua-platform-version': '"15.0.0"',
      'sec-ch-ua-full-version-list': SEC_CH_UA_FULL
    };
    const seen = new Set();
    const updated = headers.map((h) => {
      const lower = (h.name || '').toLowerCase();
      if (overrides[lower]) {
        seen.add(lower);
        return { name: h.name, value: overrides[lower] };
      }
      return h;
    });
    for (const [k, v] of Object.entries(overrides)) {
      if (!seen.has(k)) updated.push({ name: k, value: v });
    }
    return { requestHeaders: updated };
  },
  {
    urls: ['*://*.tiktok.com/tiktokstudio*', '*://*.tiktok.com/upload*'],
    types: ['main_frame']
  },
  ['blocking', 'requestHeaders']
);

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
  const stored = await storageGet(LIVE_CORE_STORAGE_KEY);
  const liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;
  const coreVersion = liveCore?.coreVersion || bundledCoreVersion;
  return { loaderVersion, coreVersion, bundledCoreVersion, hasLiveCore: Boolean(liveCore?.css) };
};

const injectLiveCore = async (tabId) => {
  const stored = await storageGet(LIVE_CORE_STORAGE_KEY);
  const liveCore = stored?.[LIVE_CORE_STORAGE_KEY];
  try {
    if (liveCore?.css) {
      chrome.tabs.insertCSS(tabId, { code: liveCore.css, runAt: 'document_start' }, () => void chrome.runtime.lastError);
    } else {
      chrome.tabs.insertCSS(tabId, { file: 'content.css', runAt: 'document_start' }, () => void chrome.runtime.lastError);
    }
  } catch (_) {}
  try {
    if (liveCore?.isolatedJs) {
      chrome.tabs.executeScript(tabId, { code: liveCore.isolatedJs, runAt: 'document_start' }, () => void chrome.runtime.lastError);
    } else {
      chrome.tabs.executeScript(tabId, { file: 'isolated.js', runAt: 'document_start' }, () => void chrome.runtime.lastError);
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

  const { loaderVersion, coreVersion: currentVersion } = await getVersions();
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

  const stored = await storageGet(LIVE_CORE_STORAGE_KEY);
  const liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;

  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const needsDownload = Boolean(
    zipAsset?.browser_download_url &&
    (hasUpdate || !liveCore?.css || !liveCore?.isolatedJs || (expectedZipSha && liveCore?.zipSha256 && liveCore.zipSha256 !== expectedZipSha.toLowerCase()))
  );

  let activeZipSha = liveCore?.zipSha256 || expectedZipSha || '';

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

      emit(84, 'Extracting Live Core...', 'Reading content.css, isolated.js & core-config.json...');
      const entries = await extractZipEntries(zipBuf, ['content.css', 'isolated.js', 'core-config.json', 'integrity.json']);
      const cssBytes = entries['content.css'];
      const isoBytes = entries['isolated.js'];
      const cfgBytes = entries['core-config.json'];
      const intBytes = entries['integrity.json'];

      const integrityData = intBytes ? JSON.parse(new TextDecoder().decode(intBytes)) : null;
      const integrityFiles = integrityData?.files || null;

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

      let isolatedText = '';
      let actualIsoSha = '';
      if (isoBytes) {
        actualIsoSha = await sha256HexBuffer(isoBytes.buffer.slice(isoBytes.byteOffset, isoBytes.byteOffset + isoBytes.byteLength));
        const expectedIsoSha = String(integrityFiles?.['isolated.js'] || '').trim();
        if (expectedIsoSha && actualIsoSha.toLowerCase() !== expectedIsoSha.toLowerCase()) {
          return {
            status: 'sha_mismatch',
            mismatchSource: 'core',
            loaderVersion,
            currentVersion,
            latestVersion,
            expectedSha: expectedIsoSha.toLowerCase(),
            actualSha: actualIsoSha.toLowerCase(),
            mismatchedFiles: ['isolated.js'],
            releaseUrl
          };
        }
        isolatedText = new TextDecoder().decode(isoBytes);
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
      await storageSet({
        [LIVE_CORE_STORAGE_KEY]: {
          coreVersion: latestVersion || currentVersion,
          css: cssText,
          cssSha256: actualCssSha,
          isolatedJs: isolatedText,
          isolatedSha256: actualIsoSha,
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
    emit(70, 'Verifying cached Core...', 'Checking live Core SHA-256...');
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

  emit(100, 'Verification complete', '100%');
  const activeVersion = (needsDownload && latestVersion) ? latestVersion : currentVersion;
  const cachePayload = {
    checkedAt: Date.now(),
    loaderVersion,
    currentVersion: activeVersion,
    latestVersion,
    releaseUrl,
    coreSha256: activeZipSha,
    jsUpdateAvailable: false
  };
  await storageSet({ [LOCAL_UPDATE_CACHE_KEY]: cachePayload });

  return {
    status: hasUpdate ? 'updated' : 'ok',
    ...cachePayload
  };
};

// 2. Per-tab TikTok Studio Pre-Gate
chrome.tabs.onRemoved.addListener((tabId) => {
  verifiedTabs.delete(String(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const isFullLoad = changeInfo.status === 'loading';
  const candidateUrl = changeInfo.url || (isFullLoad ? tab?.url : null);
  if (!candidateUrl || !TIKTOK_STUDIO_URL_RE.test(candidateUrl)) return;

  getVersions().then(({ coreVersion }) => {
    const key = String(tabId);
    const entry = verifiedTabs.get(key);

    if (isFullLoad) {
      if (entry && entry.allowNextLoad && entry.version === coreVersion && (Date.now() - entry.approvedAt < 20000)) {
        entry.allowNextLoad = false;
        entry.spaAllowed = true;
        verifiedTabs.set(key, entry);
        injectLiveCore(tabId);
        return;
      }
      verifiedTabs.delete(key);
      const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(candidateUrl)}`;
      chrome.tabs.update(tabId, { url: gateUrl });
      return;
    }

    if (entry && entry.spaAllowed && entry.version === coreVersion) {
      injectLiveCore(tabId);
      return;
    }

    const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(candidateUrl)}`;
    chrome.tabs.update(tabId, { url: gateUrl });
  });
});

// 3. Built-in FFmpeg WASM Worker Host + Update Port
let _ffmpegWorker = null;
const CHUNK_SIZE = 2 * 1024 * 1024;
const getFfmpegWorker = () => {
  if (!_ffmpegWorker) {
    _ffmpegWorker = new Worker(chrome.runtime.getURL('ffmpeg-worker.js'));
  }
  return _ffmpegWorker;
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
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

chrome.runtime.onConnect.addListener((port) => {
  if (!port) return;

  if (port.name === 'fa-update-check') {
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
    return;
  }

  if (port.name === 'fa-ffmpeg-compress') {
    let fileName = 'video.mp4';
    let totalSize = 0;
    let incomingChunks = [];

    port.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'INIT') {
        fileName = msg.fileName || 'video.mp4';
        totalSize = Number(msg.totalSize) || 0;
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

        const worker = getFfmpegWorker();
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
        worker.postMessage({ type: 'COMPRESS', buffer: merged.buffer, fileName }, [merged.buffer]);
      }
    });
  }
});

// 4. TikWM & CDN MP4 Range Probe
const isAllowedUrl = (rawUrl, hostPattern) => {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && hostPattern.test(parsed.hostname);
  } catch {
    return false;
  }
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
              if (isAllowedUrl(cand, ALLOWED_STREAM_HOST_RE)) resolvedStreamUrl = cand;
            }
          }
        }
      }
    } catch (_) {}
  }

  let totalSizeBytes = tikwmData?.size || 0;
  if (resolvedStreamUrl) {
    try {
      const probeRes = await fetch(resolvedStreamUrl, { headers: { Range: 'bytes=0-2097151' } });
      const cr = probeRes.headers.get('content-range');
      if (cr && cr.includes('/')) {
        const parsed = parseInt(cr.split('/')[1], 10);
        if (!isNaN(parsed) && parsed > 0) totalSizeBytes = parsed;
      }
    } catch (_) {}
  }

  return { tikwmData, streamUrl: resolvedStreamUrl, totalSizeBytes, atomMeta: null };
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
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'APPROVE_SESSION') {
    const tabId = message.tabId || _sender?.tab?.id;
    getVersions().then(({ coreVersion }) => {
      if (tabId) {
        verifiedTabs.set(String(tabId), {
          version: coreVersion,
          allowNextLoad: true,
          spaAllowed: true,
          bypassed: Boolean(message.bypassed),
          approvedAt: Date.now()
        });
      }
      sendResponse({ ok: true });
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
        verifiedTabs.set(String(newTab.id), {
          version: coreVersion,
          allowNextLoad: true,
          spaAllowed: true,
          bypassed: Boolean(message.bypassed),
          approvedAt: Date.now()
        });
        sendResponse({ ok: true, tabId: newTab.id });
      });
    });
    return true;
  }

  return false;
});
