/**
 * Fish Acceleration — Pure MV3 Loader Service Worker
 *
 * ZERO bundled feature files (no content.js, no isolated.js, no content.css).
 * Fetches core.zip (fallback loader.zip) from GitHub Releases, verifies SHA-256
 * of both archive and every extracted core file, caches in chrome.storage.local,
 * and dynamically registers MAIN + USER_SCRIPT cores via chrome.userScripts.
 */
'use strict';

const ALLOWED_STREAM_HOST_RE = /(?:^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokv\.com|byteoversea\.com|akamaized\.net|tiktok\.com|tikwm\.com)$/i;
const ALLOWED_TIKWM_HOST_RE = /(?:^|\.)tikwm\.com$/i;
const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/cutefishaep/fp-ext/releases/latest';
const TIKTOK_STUDIO_URL_RE = /^https:\/\/([^/]+\.)?tiktok\.com\/(tiktokstudio(\/|$|\?|#)|upload(\/|$|\?|#))/i;
const SESSION_TABS_KEY = 'fa_verified_tabs';
const LOCAL_UPDATE_CACHE_KEY = 'fa_update_cache';
const LIVE_CORE_STORAGE_KEY = 'fa_live_core';

const USER_SCRIPT_MAIN_ID = 'fish-acc-core-main';
const USER_SCRIPT_ISOLATED_ID = 'fish-acc-core-isolated';
const STUDIO_MATCHES = [
  '*://*.tiktok.com/tiktokstudio*',
  '*://*.tiktok.com/tiktokstudio',
  '*://*.tiktok.com/upload*'
];

const ALLOWED_CORE_STORAGE_KEYS = new Set([
  'fish_acc_bypass_upload',
  'fish_acc_bypass_watermark',
  'fish_acc_compress_video',
  LIVE_CORE_STORAGE_KEY
]);

const ALLOWED_CORE_WRITE_KEYS = new Set([
  'fish_acc_bypass_upload',
  'fish_acc_bypass_watermark',
  'fish_acc_compress_video'
]);

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

const getVersions = async () => {
  const loaderVersion = chrome.runtime.getManifest().version;
  let liveCore = null;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;
  } catch (_) {}
  const hasLiveCore = Boolean(liveCore?.css && liveCore?.contentJs && liveCore?.isolatedJs);
  const coreVersion = hasLiveCore && liveCore?.coreVersion ? String(liveCore.coreVersion) : '';
  return { loaderVersion, coreVersion, hasLiveCore };
};

const injectLiveCoreCss = async (tabId) => {
  if (!chrome.scripting?.insertCSS) return;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    const liveCore = stored?.[LIVE_CORE_STORAGE_KEY];
    if (liveCore?.css) {
      await chrome.scripting.insertCSS({ target: { tabId }, css: liveCore.css });
    }
  } catch (_) {}
};

const isUserScriptsAvailable = async () => {
  try {
    if (!chrome.userScripts) return false;
    await chrome.userScripts.getScripts({ ids: [USER_SCRIPT_MAIN_ID] });
    return true;
  } catch (_) {
    return false;
  }
};

const upsertUserScript = async (scriptDef) => {
  const existing = await chrome.userScripts.getScripts({ ids: [scriptDef.id] });
  if (existing && existing.length > 0) {
    await chrome.userScripts.update([scriptDef]);
  } else {
    await chrome.userScripts.register([scriptDef]);
  }
};

const syncUserScriptCore = async (explicitContentJs = null, explicitIsolatedJs = null) => {
  if (!(await isUserScriptsAvailable())) return false;

  let contentJs = typeof explicitContentJs === 'string' && explicitContentJs ? explicitContentJs : '';
  let isolatedJs = typeof explicitIsolatedJs === 'string' && explicitIsolatedJs ? explicitIsolatedJs : '';

  if (!contentJs || !isolatedJs) {
    try {
      const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
      const liveCore = stored?.[LIVE_CORE_STORAGE_KEY];
      if (!contentJs) contentJs = liveCore?.contentJs || '';
      if (!isolatedJs) isolatedJs = liveCore?.isolatedJs || '';
    } catch (_) {}
  }

  if (!contentJs && !isolatedJs) return false;

  try {
    if (typeof chrome.userScripts.configureWorld === 'function') {
      await chrome.userScripts.configureWorld({ messaging: true });
    }

    if (contentJs) {
      await upsertUserScript({
        id: USER_SCRIPT_MAIN_ID,
        matches: STUDIO_MATCHES,
        js: [{ code: contentJs }],
        world: 'MAIN',
        runAt: 'document_start'
      });
    }

    if (isolatedJs) {
      await upsertUserScript({
        id: USER_SCRIPT_ISOLATED_ID,
        matches: STUDIO_MATCHES,
        js: [{ code: isolatedJs }],
        world: 'USER_SCRIPT',
        runAt: 'document_start'
      });
    }

    return true;
  } catch (_) {
    return false;
  }
};

const WEB_METHODS_BASE = 'https://www.cutefish.my.id/assets/vendor/tiktok-method/';
const WEB_METHOD_SCRIPT_ID = 'fp-ext-web-method';
const WEB_METHODS_JSON_URL = WEB_METHODS_BASE + 'methods.json';

const fetchWebMethodsConfig = async () => {
  const storageKey = 'fp_ext_web_methods_json';
  try {
    const res = await fetch(WEB_METHODS_JSON_URL, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.methods)) {
        await chrome.storage?.local?.set({ [storageKey]: data });
        return { ok: true, data };
      }
    }
  } catch (_) {}
  try {
    const stored = await chrome.storage?.local?.get(storageKey);
    if (stored?.[storageKey]) return { ok: true, data: stored[storageKey] };
  } catch (_) {}
  return {
    ok: false,
    data: null
  };
};

const syncWebMethodUserScript = async (methodId = 'fish', tabId = null, methodFile = '') => {
  const cleanId = String(methodId || 'fish').replace(/[^a-z0-9_-]/gi, '') || 'fish';
  const safeFile = (typeof methodFile === 'string' && /^[a-z0-9_.-]+\.js$/i.test(methodFile) && !methodFile.includes('..'))
    ? methodFile
    : `${cleanId}.js`;
  const storageKey = `fp_ext_web_method_${cleanId}`;
  let code = '';
  try {
    const res = await fetch(`${WEB_METHODS_BASE}${safeFile}`, { cache: 'no-store' });
    if (res.ok) {
      code = await res.text();
      if (code) await chrome.storage?.local?.set({ [storageKey]: code });
    }
  } catch (_) {}
  if (!code) {
    try {
      const stored = await chrome.storage?.local?.get(storageKey);
      code = stored?.[storageKey] || '';
    } catch (_) {}
  }
  if (!code) return { ok: false, methodId: cleanId, error: 'Failed to fetch method script from cutefish.my.id.' };
  if (await isUserScriptsAvailable()) {
    try {
      await upsertUserScript({
        id: `fp-ext-web-${cleanId}`,
        matches: STUDIO_MATCHES,
        js: [{ code }],
        world: 'MAIN',
        runAt: 'document_start'
      });
      if (tabId && typeof chrome.userScripts.execute === 'function') {
        try {
          await chrome.userScripts.execute({ target: { tabId }, world: 'MAIN', js: [{ code }] });
        } catch (_) {}
      }
    } catch (_) {}
  }
  return { ok: true, methodId: cleanId };
};

chrome.runtime?.onInstalled?.addListener(() => {
  syncUserScriptCore();
  syncWebMethodUserScript('fish');
});
chrome.runtime?.onStartup?.addListener(() => {
  syncUserScriptCore();
  syncWebMethodUserScript('fish');
});

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

const verifyExtractedEntry = async (bytes, name, integrityFiles, meta) => {
  if (!bytes) return { text: '', sha: '' };
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const actualSha = await sha256HexBuffer(ab);
  const expectedSha = String(integrityFiles?.[name] || '').trim();
  if (expectedSha && actualSha.toLowerCase() !== expectedSha.toLowerCase()) {
    return {
      mismatch: {
        status: 'sha_mismatch',
        mismatchSource: 'core',
        loaderVersion: meta.loaderVersion,
        currentVersion: meta.currentVersion,
        latestVersion: meta.latestVersion,
        expectedSha: expectedSha.toLowerCase(),
        actualSha: actualSha.toLowerCase(),
        mismatchedFiles: [name],
        releaseUrl: meta.releaseUrl
      }
    };
  }
  return { text: new TextDecoder().decode(bytes), sha: actualSha };
};

const handleCheckAndVerifyUpdate = async (onProgress = () => {}) => {
  const emit = (percent, title, detail = '') => {
    try { onProgress({ percent, title, detail }); } catch (_) {}
  };

  const { loaderVersion, coreVersion: currentVersion, hasLiveCore } = await getVersions();
  if (!(await isUserScriptsAvailable())) {
    return {
      status: 'user_scripts_disabled',
      loaderVersion,
      currentVersion,
      extensionId: chrome.runtime.id
    };
  }
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
  const coreAsset =
    assets.find((a) => a?.name === 'core.zip') ||
    assets.find((a) => a?.name === 'loader.zip') ||
    assets.find((a) => /\.zip$/i.test(a?.name || ''));
  const expectedZipSha = String(coreAsset?.digest || '').replace(/^sha256:/i, '').trim();

  let liveCore = null;
  try {
    const stored = await chrome.storage?.local?.get(LIVE_CORE_STORAGE_KEY);
    liveCore = stored?.[LIVE_CORE_STORAGE_KEY] || null;
  } catch (_) {}

  const hasUpdate = Boolean(latestVersion && (!currentVersion || compareVersions(latestVersion, currentVersion) > 0));
  const needsDownload = Boolean(
    coreAsset?.browser_download_url &&
    (
      hasUpdate ||
      !hasLiveCore ||
      (expectedZipSha && liveCore?.zipSha256 && liveCore.zipSha256 !== expectedZipSha.toLowerCase())
    )
  );

  let activeZipSha = liveCore?.zipSha256 || expectedZipSha || '';

  if (needsDownload) {
    try {
      const assetLabel = coreAsset.name || 'core.zip';
      const zipBuf = await streamFetchWithProgress(
        coreAsset.browser_download_url,
        coreAsset.size,
        16,
        74,
        `Downloading ${assetLabel}...`,
        emit
      );
      emit(78, 'Verifying package SHA-256...', `${assetLabel} · Computing SHA-256...`);
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
          mismatchedFiles: [assetLabel],
          releaseUrl
        };
      }

      emit(84, 'Extracting Core...', 'Reading content.js, isolated.js, content.css & config...');
      const entries = await extractZipEntries(zipBuf, [
        'content.css',
        'content.js',
        'isolated.js',
        'core-config.json',
        'integrity.json'
      ]);

      const integrityData = entries['integrity.json']
        ? JSON.parse(new TextDecoder().decode(entries['integrity.json']))
        : null;
      const integrityFiles = integrityData?.files || null;
      const meta = { loaderVersion, currentVersion, latestVersion, releaseUrl };

      emit(90, 'Verifying Core SHA-256...', 'Checking content.css, content.js & isolated.js...');
      const cssCheck = await verifyExtractedEntry(entries['content.css'], 'content.css', integrityFiles, meta);
      if (cssCheck.mismatch) return cssCheck.mismatch;

      const mainCheck = await verifyExtractedEntry(entries['content.js'], 'content.js', integrityFiles, meta);
      if (mainCheck.mismatch) return mainCheck.mismatch;

      const isoCheck = await verifyExtractedEntry(entries['isolated.js'], 'isolated.js', integrityFiles, meta);
      if (isoCheck.mismatch) return isoCheck.mismatch;

      const cfgCheck = await verifyExtractedEntry(entries['core-config.json'], 'core-config.json', integrityFiles, meta);
      if (cfgCheck.mismatch) return cfgCheck.mismatch;

      if (!mainCheck.text || !isoCheck.text || !cssCheck.text) {
        return {
          status: 'offline',
          loaderVersion,
          currentVersion,
          latestVersion,
          error: `Release package (${assetLabel}) is missing required Core files.`
        };
      }

      const configObj = cfgCheck.text ? JSON.parse(cfgCheck.text) : null;
      activeZipSha = actualZipSha;

      emit(96, 'Registering live Core...', 'Activating User Scripts & styles...');
      await chrome.storage?.local?.set({
        [LIVE_CORE_STORAGE_KEY]: {
          coreVersion: latestVersion || currentVersion || '0.0.0',
          css: cssCheck.text,
          cssSha256: cssCheck.sha,
          contentJs: mainCheck.text,
          contentJsSha256: mainCheck.sha,
          isolatedJs: isoCheck.text,
          isolatedJsSha256: isoCheck.sha,
          config: configObj,
          configSha256: cfgCheck.sha,
          zipSha256: actualZipSha,
          integrityFiles,
          updatedAt: Date.now()
        }
      });

      const synced = await syncUserScriptCore(mainCheck.text, isoCheck.text);
      if (!synced) {
        return {
          status: 'user_scripts_disabled',
          loaderVersion,
          currentVersion: latestVersion || currentVersion,
          extensionId: chrome.runtime.id
        };
      }
    } catch (err) {
      return {
        status: 'offline',
        loaderVersion,
        currentVersion,
        latestVersion,
        error: err?.message || 'Failed to download & verify Core package.'
      };
    }
  } else if (hasLiveCore) {
    emit(55, 'Verifying cached Core...', 'Checking live Core SHA-256...');
    const cachedChecks = [
      { key: 'css', shaKey: 'cssSha256', label: 'content.css (cached)' },
      { key: 'contentJs', shaKey: 'contentJsSha256', label: 'content.js (cached)' },
      { key: 'isolatedJs', shaKey: 'isolatedJsSha256', label: 'isolated.js (cached)' }
    ];
    for (const item of cachedChecks) {
      const text = liveCore?.[item.key];
      const expected = liveCore?.[item.shaKey];
      if (text && expected) {
        const actual = await sha256HexBuffer(new TextEncoder().encode(text).buffer);
        if (actual.toLowerCase() !== String(expected).toLowerCase()) {
          return {
            status: 'sha_mismatch',
            mismatchSource: 'core',
            loaderVersion,
            currentVersion,
            latestVersion,
            expectedSha: String(expected).toLowerCase(),
            actualSha: actual.toLowerCase(),
            mismatchedFiles: [item.label],
            releaseUrl
          };
        }
      }
    }
    await syncUserScriptCore(liveCore.contentJs, liveCore.isolatedJs);
  } else {
    return {
      status: 'offline',
      loaderVersion,
      currentVersion,
      latestVersion,
      error: 'No downloadable Core package found on the latest GitHub Release.'
    };
  }

  emit(100, 'Verification complete', '100%');
  const activeVersion = (needsDownload && latestVersion) ? latestVersion : currentVersion;
  const cachePayload = {
    checkedAt: Date.now(),
    loaderVersion,
    currentVersion: activeVersion,
    latestVersion,
    releaseUrl,
    coreSha256: activeZipSha
  };
  try {
    await chrome.storage?.local?.set({ [LOCAL_UPDATE_CACHE_KEY]: cachePayload });
  } catch (_) {}

  return {
    status: hasUpdate ? 'updated' : 'ok',
    ...cachePayload
  };
};

const handleCheckUpdateStatus = async () => {
  const { loaderVersion, coreVersion, hasLiveCore } = await getVersions();
  let latestVersion = '';
  let releaseUrl = 'https://github.com/cutefishaep/fp-ext/releases';
  try {
    const res = await fetch(GITHUB_LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (res.ok) {
      const release = await res.json();
      latestVersion = String(release?.tag_name || '').replace(/^v/i, '');
      releaseUrl = release?.html_url || releaseUrl;
    }
  } catch (_) {}

  if (!latestVersion) {
    try {
      const stored = await chrome.storage?.local?.get(LOCAL_UPDATE_CACHE_KEY);
      const cached = stored?.[LOCAL_UPDATE_CACHE_KEY];
      if (cached?.latestVersion) {
        latestVersion = String(cached.latestVersion).replace(/^v/i, '');
      }
    } catch (_) {}
  }

  const hasUpdate = Boolean(latestVersion && (!hasLiveCore || !coreVersion || compareVersions(latestVersion, coreVersion) > 0));
  return {
    ok: true,
    loaderVersion,
    coreVersion,
    latestVersion,
    hasUpdate,
    releaseUrl
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

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const handleProbeVideo = async ({ pageUrl, streamUrl }) => {
  let tikwmData = null;

  if (pageUrl && typeof pageUrl === 'string' && pageUrl.startsWith('https://www.tiktok.com/')) {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}&hd=1`;
    if (isAllowedUrl(apiUrl, ALLOWED_TIKWM_HOST_RE)) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const twRes = await fetchWithTimeout(apiUrl, {}, 30000);
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
  }

  const rawCandidates = [
    tikwmData?.play,
    tikwmData?.hdplay,
    tikwmData?.id ? `https://www.tikwm.com/video/media/play/${tikwmData.id}.mp4` : null,
    streamUrl
  ];
  const candidates = [];
  for (const c of rawCandidates) {
    if (c && isAllowedUrl(c, ALLOWED_STREAM_HOST_RE) && !candidates.includes(c)) {
      candidates.push(c);
    }
  }

  let resolvedStreamUrl = candidates[0] || null;
  let totalSizeBytes = tikwmData?.size || tikwmData?.hd_size || 0;
  let atomMeta = null;
  let bestComment = '';

  for (const candUrl of candidates) {
    try {
      const fpsApiUrl = `https://www.cutefish.my.id/api/tiktok-fps?url=${encodeURIComponent(candUrl)}`;
      const probeRes = await fetchWithTimeout(fpsApiUrl, {}, 20000);
      if (probeRes.ok) {
        const meta = await probeRes.json();
        if (meta && meta.comment && !bestComment) {
          bestComment = meta.comment;
        }
        if (meta && (meta.width || meta.fps || meta.size)) {
          resolvedStreamUrl = candUrl;
          if (meta.size > 0) totalSizeBytes = meta.size;
          atomMeta = {
            fps: meta.fps || 0,
            width: meta.width || 0,
            height: meta.height || 0,
            comment: meta.comment || bestComment || '',
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
  const tabUrl = tab?.url || '';
  if (changeInfo.status === 'complete' && TIKTOK_STUDIO_URL_RE.test(tabUrl)) {
    chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
      const tabs = data?.[SESSION_TABS_KEY] || {};
      const key = String(tabId);
      const entry = tabs[key];
      if (entry) {
        entry.allowNextLoad = false;
        entry.spaAllowed = true;
        entry.lastUrl = tabUrl;
        tabs[key] = entry;
        chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
      }
    });
    return;
  }

  const isFullLoad = changeInfo.status === 'loading';
  const candidateUrl = changeInfo.url || (isFullLoad ? tabUrl : null);
  if (!candidateUrl || !TIKTOK_STUDIO_URL_RE.test(candidateUrl)) return;

  getVersions().then(({ coreVersion, hasLiveCore }) => {
    chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
      const tabs = data?.[SESSION_TABS_KEY] || {};
      const key = String(tabId);
      const entry = tabs[key];

      if (!hasLiveCore && !(entry && entry.bypassed && (entry.allowNextLoad || entry.spaAllowed))) {
        if (entry) {
          delete tabs[key];
          chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
        }
        const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(candidateUrl)}`;
        chrome.tabs.update(tabId, { url: gateUrl });
        return;
      }

      if (isFullLoad) {
        const isAllowedInitial = entry && entry.allowNextLoad && entry.version === coreVersion && (Date.now() - entry.approvedAt < 20000);
        const isInternalStudioNav = Boolean(changeInfo.url && entry && entry.spaAllowed && entry.version === coreVersion && changeInfo.url !== entry.lastUrl);
        if (isAllowedInitial || isInternalStudioNav) {
          if (isInternalStudioNav) {
            entry.lastUrl = candidateUrl;
            tabs[key] = entry;
            chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
          }
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

      if (entry && (entry.spaAllowed || entry.allowNextLoad) && entry.version === coreVersion) {
        entry.lastUrl = candidateUrl;
        tabs[key] = entry;
        chrome.storage.session.set({ [SESSION_TABS_KEY]: tabs });
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
              currentVersion: '',
              error: err?.message || 'Unexpected verification error.'
            }
          });
        } catch (_) {}
      });
  });
});

chrome.runtime.onUserScriptConnect?.addListener((usPort) => {
  if (!usPort || usPort.name !== 'fa-ffmpeg-compress') return;
  let offPort = null;
  try {
    offPort = chrome.runtime.connect({ name: 'fa-ffmpeg-compress' });
  } catch (_) {
    try { usPort.disconnect(); } catch (_) {}
    return;
  }

  usPort.onMessage.addListener((msg) => {
    try { offPort.postMessage(msg); } catch (_) {}
  });
  offPort.onMessage.addListener((msg) => {
    try { usPort.postMessage(msg); } catch (_) {}
  });
  usPort.onDisconnect.addListener(() => {
    try { offPort.disconnect(); } catch (_) {}
  });
  offPort.onDisconnect.addListener(() => {
    try { usPort.disconnect(); } catch (_) {}
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

const handleRuntimeMessage = (message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'GET_WEB_METHODS') {
    fetchWebMethodsConfig()
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, data: null }));
    return true;
  }

  if (message.type === 'SYNC_WEB_METHOD') {
    syncWebMethodUserScript(message.methodId || 'fish', sender?.tab?.id || null, message.methodFile || '')
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Sync web method failed.' }));
    return true;
  }

  if (message.type === 'PROBE_VIDEO') {
    handleProbeVideo(message)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse(null));
    return true;
  }

  if (message.type === 'CORE_STORAGE_GET') {
    const requested = Array.isArray(message.keys) ? message.keys : [message.keys];
    const safeKeys = requested.filter((k) => typeof k === 'string' && ALLOWED_CORE_STORAGE_KEYS.has(k));
    if (!safeKeys.length) {
      sendResponse({ ok: true, data: {} });
      return false;
    }
    chrome.storage?.local?.get(safeKeys, (stored) => {
      const out = {};
      for (const k of safeKeys) {
        if (k === LIVE_CORE_STORAGE_KEY) {
          out[k] = stored?.[k]?.config ? { config: stored[k].config, coreVersion: stored[k].coreVersion } : null;
        } else if (stored && k in stored) {
          out[k] = stored[k];
        }
      }
      sendResponse({ ok: true, data: out });
    });
    return true;
  }

  if (message.type === 'CORE_STORAGE_SET') {
    const items = message.items && typeof message.items === 'object' ? message.items : {};
    const filtered = {};
    for (const [k, v] of Object.entries(items)) {
      if (ALLOWED_CORE_WRITE_KEYS.has(k)) filtered[k] = v;
    }
    if (!Object.keys(filtered).length) {
      sendResponse({ ok: true });
      return false;
    }
    chrome.storage?.local?.set(filtered, () => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'CHECK_AND_VERIFY_UPDATE') {
    handleCheckAndVerifyUpdate()
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({
        status: 'offline',
        currentVersion: '',
        error: err?.message || 'Unexpected verification error.'
      }));
    return true;
  }

  if (message.type === 'GET_VERSIONS') {
    getVersions().then((v) => sendResponse(v));
    return true;
  }

  if (message.type === 'CHECK_UPDATE_STATUS') {
    handleCheckUpdateStatus()
      .then((result) => sendResponse(result))
      .catch(() => getVersions().then((v) => sendResponse({
        ok: false,
        loaderVersion: v.loaderVersion,
        coreVersion: v.coreVersion,
        latestVersion: '',
        hasUpdate: false
      })));
    return true;
  }

  if (message.type === 'OPEN_UPDATER_GATE') {
    const tabId = message.tabId || sender?.tab?.id;
    const targetUrl = message.targetUrl || sender?.tab?.url || 'https://www.tiktok.com/tiktokstudio/upload';
    if (!tabId) {
      sendResponse({ ok: false });
      return false;
    }
    chrome.storage?.session?.get(SESSION_TABS_KEY, (data) => {
      const tabs = data?.[SESSION_TABS_KEY] || {};
      delete tabs[String(tabId)];
      chrome.storage?.session?.set({ [SESSION_TABS_KEY]: tabs }, () => {
        const gateUrl = `${chrome.runtime.getURL('updater.html')}?target=${encodeURIComponent(targetUrl)}`;
        chrome.tabs.update(tabId, { url: gateUrl }, () => {
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }

  if (message.type === 'ENSURE_OFFSCREEN') {
    ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Offscreen error' }));
    return true;
  }

  if (message.type === 'APPROVE_SESSION') {
    const tabId = message.tabId || sender?.tab?.id;
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
};

chrome.runtime.onMessage.addListener(handleRuntimeMessage);
chrome.runtime.onUserScriptMessage?.addListener(handleRuntimeMessage);
