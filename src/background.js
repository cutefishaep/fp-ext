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
const SESSION_VERIFIED_KEY = 'fa_verified_session';
const LOCAL_UPDATE_CACHE_KEY = 'fa_update_cache';

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

let _cachedCoreVersion = null;
const getVersions = async () => {
  const loaderVersion = chrome.runtime.getManifest().version;
  if (_cachedCoreVersion) return { loaderVersion, coreVersion: _cachedCoreVersion };
  try {
    const res = await fetch(chrome.runtime.getURL('core-version.json'), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.coreVersion) _cachedCoreVersion = String(data.coreVersion);
    }
  } catch (_) {}
  return { loaderVersion, coreVersion: _cachedCoreVersion || loaderVersion };
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
      return {
        status: 'offline',
        currentVersion,
        error: `GitHub returned HTTP ${res.status}.`
      };
    }
    release = await res.json();
  } catch (err) {
    return {
      status: 'offline',
      currentVersion,
      error: err?.message || 'Unable to reach GitHub Releases.'
    };
  }

  const latestVersion = String(release?.tag_name || '').replace(/^v/i, '');
  const releaseUrl = release?.html_url || 'https://github.com/cutefishaep/fp-ext/releases';
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const zipAsset = assets.find((a) => /\.zip$/i.test(a?.name || ''));
  const integrityAsset = assets.find((a) => a?.name === 'integrity.json');

  let integrityData = null;
  if (integrityAsset?.browser_download_url) {
    emit(18, 'Fetching integrity manifest...', 'Downloading integrity.json...');
    try {
      const intRes = await fetch(integrityAsset.browser_download_url, { cache: 'no-store' });
      if (intRes.ok) integrityData = await intRes.json();
    } catch (_) {}
  }

  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  let actualPkgSha = '';
  let expectedPkgSha = String(zipAsset?.digest || '').replace(/^sha256:/i, '').trim() ||
    String(integrityData?.packages?.zip?.sha256 || '').trim();

  // Hanya download paket .zip jika memang ada versi lebih baru (atau jika integrity.json tidak tersedia)
  if (zipAsset?.browser_download_url && (hasUpdate || !integrityData?.files)) {
    try {
      emit(22, 'Downloading release package...', zipAsset.name || 'Downloading ZIP...');
      const zipRes = await fetch(zipAsset.browser_download_url, { cache: 'no-store' });
      if (!zipRes.ok) {
        return {
          status: 'offline',
          currentVersion,
          latestVersion,
          error: `Failed to download release asset (HTTP ${zipRes.status}).`
        };
      }

      const totalBytes = Number(zipRes.headers.get('content-length')) || Number(zipAsset.size) || 0;
      let buf;
      if (zipRes.body && typeof zipRes.body.getReader === 'function') {
        const reader = zipRes.body.getReader();
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
                ? Math.min(82, 22 + Math.round((loadedBytes / totalBytes) * 60))
                : 52;
              const detail = totalBytes > 0
                ? `${(loadedBytes / 1024).toFixed(1)} / ${(totalBytes / 1024).toFixed(1)} KB`
                : `${(loadedBytes / 1024).toFixed(1)} KB`;
              emit(pct, 'Downloading release package...', detail);
            }
          }
        }
        const merged = new Uint8Array(loadedBytes);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        buf = merged.buffer;
        emit(82, 'Downloading release package...', `${(loadedBytes / 1024).toFixed(1)} KB downloaded`);
      } else {
        buf = await zipRes.arrayBuffer();
        emit(82, 'Downloading release package...', `${(buf.byteLength / 1024).toFixed(1)} KB downloaded`);
      }

      emit(84, 'Verifying package SHA-256...', zipAsset.name || 'Computing SHA-256...');
      actualPkgSha = await sha256HexBuffer(buf);
    } catch (err) {
      return {
        status: 'offline',
        currentVersion,
        latestVersion,
        error: err?.message || 'Failed to download release asset.'
      };
    }

    if (expectedPkgSha && actualPkgSha.toLowerCase() !== expectedPkgSha.toLowerCase()) {
      return {
        status: 'sha_mismatch',
        mismatchSource: 'package',
        currentVersion,
        latestVersion,
        expectedSha: expectedPkgSha.toLowerCase(),
        actualSha: actualPkgSha.toLowerCase(),
        mismatchedFiles: [zipAsset.name],
        zipName: zipAsset.name,
        downloadUrl: zipAsset.browser_download_url,
        releaseUrl
      };
    }
  }

  if (integrityData && integrityData.files && compareVersions(integrityData.version, currentVersion) === 0) {
    const entries = Object.entries(integrityData.files).filter(([, h]) => Boolean(h));
    const totalFiles = entries.length || 1;
    const mismatches = [];
    for (let idx = 0; idx < entries.length; idx++) {
      const [fileName, expectedHash] = entries[idx];
      const pct = 86 + Math.round(((idx + 1) / totalFiles) * 12);
      emit(pct, 'Verifying SHA-256...', `Checking ${fileName} (${idx + 1}/${totalFiles})`);
      try {
        const localRes = await fetch(chrome.runtime.getURL(fileName), { cache: 'no-store' });
        if (!localRes.ok) {
          mismatches.push({ file: fileName, expected: String(expectedHash).toLowerCase(), actual: 'missing' });
          continue;
        }
        const ab = await localRes.arrayBuffer();
        const actualHash = await sha256HexBuffer(ab);
        if (actualHash.toLowerCase() !== String(expectedHash).toLowerCase()) {
          mismatches.push({ file: fileName, expected: String(expectedHash).toLowerCase(), actual: actualHash.toLowerCase() });
        }
      } catch (_) {
        mismatches.push({ file: fileName, expected: String(expectedHash).toLowerCase(), actual: 'unreadable' });
      }
    }

    if (mismatches.length > 0) {
      return {
        status: 'sha_mismatch',
        mismatchSource: 'local',
        currentVersion,
        latestVersion,
        expectedSha: mismatches[0].expected,
        actualSha: mismatches[0].actual,
        mismatchedFiles: mismatches.map((m) => m.file),
        zipName: zipAsset?.name || '',
        downloadUrl: zipAsset?.browser_download_url || '',
        releaseUrl
      };
    }
  }

  emit(100, 'Verification complete', '100%');

  const cachePayload = {
    checkedAt: Date.now(),
    loaderVersion,
    currentVersion,
    latestVersion,
    releaseUrl,
    zipName: zipAsset?.name || '',
    downloadUrl: zipAsset?.browser_download_url || '',
    packageSha256: actualPkgSha || expectedPkgSha || ''
  };
  try {
    await chrome.storage?.local?.set({ [LOCAL_UPDATE_CACHE_KEY]: cachePayload });
  } catch (_) {}

  return {
    status: hasUpdate ? 'update_available' : 'ok',
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

chrome.tabs?.onUpdated?.addListener((tabId, changeInfo, tab) => {
  const candidateUrl = changeInfo.url || (changeInfo.status === 'loading' ? tab?.url : null);
  if (!candidateUrl || !TIKTOK_STUDIO_URL_RE.test(candidateUrl)) return;

  getVersions().then(({ coreVersion }) => {
    chrome.storage?.session?.get(SESSION_VERIFIED_KEY, (data) => {
      const sess = data?.[SESSION_VERIFIED_KEY];
      if (sess && sess.verified && sess.version === coreVersion) return;
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

  if (message.type === 'DOWNLOAD_VERIFIED_ZIP') {
    if (!message.url || !chrome.downloads?.download) {
      sendResponse({ ok: false, error: 'Download API unavailable.' });
      return false;
    }
    chrome.downloads.download({
      url: message.url,
      filename: message.filename || undefined,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    });
    return true;
  }

  if (message.type === 'GET_VERSIONS') {
    getVersions().then((v) => sendResponse(v));
    return true;
  }

  if (message.type === 'APPROVE_SESSION') {
    getVersions().then(({ coreVersion }) => {
      const payload = {
        version: coreVersion,
        verified: true,
        bypassed: Boolean(message.bypassed),
        verifiedAt: Date.now()
      };
      chrome.storage?.session?.set({ [SESSION_VERIFIED_KEY]: payload }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  return false;
});
