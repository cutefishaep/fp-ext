  /* --- 2. Extension-Side 1:1 MP4 Patcher, Upload Card & Panel Handover --- */
  const escapeHtmlAttr = (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const findSidebarBtn = (label) => {
    const btns = Array.from(document.querySelectorAll('button[data-tt="Sidebar_Sidebar_Clickable"]'));
    return btns.find((b) => {
      const txt = (b.innerText || b.textContent || '').trim();
      return txt.toLowerCase().includes(label.toLowerCase());
    });
  };

  const METHOD_STORAGE_KEY = 'fish_acc_selected_method';
  const _webMethodsState = {
    status: 'WORKING',
    defaultMethod: 'fish',
    compress: {
      maxShortSide: 1080,
      maxFps: 60,
      maxBitrateMbps: 50,
      videoCodec: 'libx264',
      preset: 'veryfast',
      crf: '20',
      maxrate: '17M',
      bufsize: '28M',
      pixFmt: 'yuv420p',
      profile: 'high',
      x264Params: 'aq-mode=2',
      audioCodec: 'aac',
      audioBitrate: '192k'
    },
    methods: [{ id: 'fish', name: 'FISH', status: 'WORKING', file: 'fish.js' }],
    loaded: false
  };

  const getSelectedMethodId = () => {
    try {
      const saved = window.localStorage.getItem(METHOD_STORAGE_KEY);
      if (saved && _webMethodsState.methods.some((m) => m.id === saved)) return saved;
    } catch (_) {}
    return _webMethodsState.defaultMethod || 'fish';
  };

  const setSelectedMethodId = (methodId) => {
    const clean = String(methodId || 'fish').trim() || 'fish';
    try { window.localStorage.setItem(METHOD_STORAGE_KEY, clean); } catch (_) {}
  };

  const getMethodStatus = () => {
    const selectedId = getSelectedMethodId();
    const found = _webMethodsState.methods.find((m) => m.id === selectedId);
    const raw = (found && found.status) || _webMethodsState.status || 'WORKING';
    return String(raw).trim().toUpperCase();
  };

  const updateMethodStatusBadge = () => {
    const badge = document.getElementById('m3-bypass-status');
    if (!badge) return;
    const status = getMethodStatus();
    const isWorking = status === 'WORKING';
    badge.classList.toggle('m3-status-working', isWorking);
    badge.classList.toggle('m3-status-patched', !isWorking);
    badge.title = `Method Status: ${status}`;
    const textEl = badge.querySelector('.m3-status-text');
    if (textEl) textEl.textContent = status;
  };

  const syncCardControlsFromState = () => {
    const toggle = document.getElementById('m3-bypass-toggle');
    const compressSwitch = document.getElementById('m3-compress-switch');
    const wmRow = document.getElementById('m3-watermark-row');
    const wmInput = document.getElementById('m3-watermark-input');
    const methodRow = document.getElementById('m3-method-row');
    const methodSwitch = document.getElementById('m3-method-switch');
    const enabled = isBypassUploadEnabled();
    if (toggle && toggle.checked !== enabled) {
      toggle.checked = enabled;
    }
    if (compressSwitch) {
      const curComp = typeof getCompressMode === 'function' ? getCompressMode() : '1080p';
      compressSwitch.querySelectorAll('.m3-method-pill').forEach((btn) => {
        const active = btn.dataset.compressMode === curComp;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }
    if (methodRow) {
      methodRow.style.display = enabled ? '' : 'none';
    }
    if (methodSwitch) {
      const cur = getSelectedMethodId();
      methodSwitch.querySelectorAll('.m3-method-pill').forEach((btn) => {
        const active = btn.dataset.methodId === cur;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    }
    if (wmRow) {
      wmRow.style.display = enabled ? '' : 'none';
    }
    if (wmInput && document.activeElement !== wmInput && wmInput.value !== getBypassWatermark()) {
      wmInput.value = getBypassWatermark();
    }
  };

  const patchViaWebMethodBridge = (arrayBuffer, methodId = 'fish') => new Promise((resolve, reject) => {
    const reqId = 'patch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMsg);
      reject(new Error('Web method patch timeout.'));
    }, 30000);

    const onMsg = (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.source !== 'fish-acc-main' || msg.type !== 'FISH_PATCH_VIDEO_RESULT' || msg.reqId !== reqId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      if (msg.ok && msg.buffer) resolve(msg.buffer);
      else reject(new Error(msg.error || 'Web method patch failed.'));
    };

    window.addEventListener('message', onMsg);
    window.postMessage({
      source: 'fish-acc-isolated',
      type: 'FISH_PATCH_VIDEO',
      reqId,
      methodId,
      buffer: arrayBuffer
    }, window.location.origin, [arrayBuffer]);
  });

  // Unified Video Calibrator Pipeline (fetch method dari cutefish.my.id, eksekusi via MAIN world bridge)
  const calibrateVideoFile = async (file, methodId = 'fish') => {
    try {
      await sendRuntimeMsg({ type: 'SYNC_WEB_METHOD', methodId });
      log('Patching video using web method (' + methodId + ') from cutefish.my.id...');
      const buf = await file.arrayBuffer();
      const patchedAb = await patchViaWebMethodBridge(buf, methodId);
      if (patchedAb && patchedAb.byteLength > 0) {
        log('✓ Video patched via web method ' + methodId + ' (size:', patchedAb.byteLength, ')');
        return new File([patchedAb], file.name, {
          type: 'video/mp4',
          lastModified: Date.now()
        });
      }
    } catch (errWeb) {
      log('web method notice:', errWeb?.message || errWeb);
    }

    log('Video handed over untouched as fallback');
    return file;
  };

  const _uploadVersionState = {
    coreVersion: '',
    latestVersion: '',
    hasUpdate: false,
    updating: false,
    checking: false
  };
  let _lastVersionCheckAt = 0;

  const sendRuntimeMsg = (payload) => new Promise((resolve) => {
    if (!isExtensionAlive() || !chrome.runtime?.sendMessage) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, (res) => {
        if (chrome.runtime?.lastError) {
          resolve(null);
          return;
        }
        resolve(res || null);
      });
    } catch (_) {
      resolve(null);
    }
  });

  const renderUploadVersionBadge = () => {
    const badge = document.getElementById('m3-upload-version-badge');
    if (!badge) return;

    badge.classList.toggle('has-update', Boolean(_uploadVersionState.hasUpdate && !_uploadVersionState.updating));
    badge.classList.toggle('is-updating', Boolean(_uploadVersionState.updating));
    badge.classList.toggle('is-checking', Boolean(_uploadVersionState.checking));
    badge.disabled = Boolean(_uploadVersionState.updating || _uploadVersionState.checking);

    if (_uploadVersionState.updating) {
      badge.title = 'Downloading & verifying update...';
      badge.innerHTML = '<span>Updating...</span>';
      return;
    }

    if (_uploadVersionState.checking) {
      badge.title = 'Checking for updates...';
      badge.innerHTML = '<span>Checking...</span>';
      return;
    }

    if (_uploadVersionState.hasUpdate) {
      const nextVer = _uploadVersionState.latestVersion ? `v${_uploadVersionState.latestVersion}` : 'latest';
      const curVer = _uploadVersionState.coreVersion ? ` (current v${_uploadVersionState.coreVersion})` : '';
      badge.title = `Update available: ${nextVer}${curVer} — Click to update & refresh`;
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M5 20h14v-2H5v2zm14-11h-4V3H9v6H5l7 7 7-7z"/>
        </svg>
        <span>Update</span>
      `;
      return;
    }

    const verLabel = _uploadVersionState.coreVersion ? `v${escapeHtmlAttr(_uploadVersionState.coreVersion)}` : 'v...';
    badge.title = _uploadVersionState.coreVersion
      ? `Fish Acceleration Core v${_uploadVersionState.coreVersion} — Click to check for updates`
      : 'Check for updates';
    badge.innerHTML = `<span>${verLabel}</span>`;
  };

  const refreshUploadVersionBadge = async (force = false) => {
    if (!_uploadVersionState.coreVersion) {
      const ver = await sendRuntimeMsg({ type: 'GET_VERSIONS' });
      if (ver?.coreVersion) {
        _uploadVersionState.coreVersion = String(ver.coreVersion);
        renderUploadVersionBadge();
      }
    }

    const now = Date.now();
    if (!force && _lastVersionCheckAt && (now - _lastVersionCheckAt < 30000)) {
      renderUploadVersionBadge();
      return;
    }
    _lastVersionCheckAt = now;

    const status = await sendRuntimeMsg({ type: 'CHECK_UPDATE_STATUS' });
    if (status) {
      if (status.coreVersion) _uploadVersionState.coreVersion = String(status.coreVersion);
      _uploadVersionState.latestVersion = status.latestVersion ? String(status.latestVersion) : '';
      _uploadVersionState.hasUpdate = Boolean(status.hasUpdate);
      renderUploadVersionBadge();
    }
  };

  const handleUploadVersionBadgeClick = async (e) => {
    e.preventDefault();
    if (_uploadVersionState.updating || _uploadVersionState.checking) return;

    if (_uploadVersionState.hasUpdate) {
      _uploadVersionState.updating = true;
      renderUploadVersionBadge();

      const res = await sendRuntimeMsg({ type: 'CHECK_AND_VERIFY_UPDATE' });
      if (res?.status === 'updated' || res?.status === 'ok') {
        await sendRuntimeMsg({ type: 'APPROVE_SESSION', bypassed: false });
        window.location.reload();
        return;
      }

      if (res?.status === 'sha_mismatch' || res?.status === 'user_scripts_disabled') {
        await sendRuntimeMsg({ type: 'OPEN_UPDATER_GATE', targetUrl: window.location.href });
        return;
      }

      _uploadVersionState.updating = false;
      renderUploadVersionBadge();
      const badge = document.getElementById('m3-upload-version-badge');
      if (badge && res?.error) {
        badge.title = `Update failed: ${res.error} — Click to retry`;
      }
      return;
    }

    _uploadVersionState.checking = true;
    renderUploadVersionBadge();
    await refreshUploadVersionBadge(true);
    _uploadVersionState.checking = false;
    renderUploadVersionBadge();
  };

  const removeUploadBypassCard = () => {
    ['m3-bypass-upload-card', 'm3-bypass-credit', 'm3-upload-top-bar', 'm3-upload-page-back-btn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  };

  const injectUploadBypassCard = () => {
    if (!window.location.pathname.includes('/upload')) {
      removeUploadBypassCard();
      return;
    }

    const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                      document.querySelector('input[type="file"]:not(#fish-proxy-file-input)');
    const uploadContainer = fileInput?.closest('div[role="button"]') ||
                            document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                            document.querySelector('.upload, [class*="upload"]');
    if (!uploadContainer) return;

    updateMethodStatusBadge();

    // 1. Top Bar di atas Upload Container: Back to Posts (kiri) + Version / Update Badge (kanan)
    let topBar = document.getElementById('m3-upload-top-bar');
    if (!topBar) {
      topBar = document.createElement('div');
      topBar.id = 'm3-upload-top-bar';
      topBar.className = 'm3-upload-top-bar';

      const backBtn = document.createElement('button');
      backBtn.id = 'm3-upload-page-back-btn';
      backBtn.type = 'button';
      backBtn.className = 'm3-upload-page-back-btn';
      backBtn.title = 'Back to Posts';
      backBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
        </svg>
        <span>Back to Posts</span>
      `;
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const postsBtn = findSidebarBtn('Posts') || findSidebarBtn('Manage posts') || findSidebarBtn('Content');
        if (postsBtn) {
          postsBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/content';
        }
      });

      const versionBadge = document.createElement('button');
      versionBadge.id = 'm3-upload-version-badge';
      versionBadge.type = 'button';
      versionBadge.className = 'm3-upload-version-badge';
      versionBadge.addEventListener('click', handleUploadVersionBadgeClick);

      topBar.appendChild(backBtn);
      topBar.appendChild(versionBadge);

      try {
        uploadContainer.before(topBar);
      } catch (_) {
        try {
          if (uploadContainer.parentNode && uploadContainer.parentNode.contains(uploadContainer)) {
            uploadContainer.parentNode.insertBefore(topBar, uploadContainer);
          }
        } catch (_) {}
      }

      renderUploadVersionBadge();
      refreshUploadVersionBadge(false);
    }

    if (document.getElementById('m3-bypass-upload-card')) return;

    const card = document.createElement('div');
    card.id = 'm3-bypass-upload-card';
    card.className = 'm3-bypass-card';

    const isEnabled = isBypassUploadEnabled();
    const curCompressMode = typeof getCompressMode === 'function' ? getCompressMode() : '1080p';
    const currentWm = getBypassWatermark();
    const statusAtRender = getMethodStatus();
    const isWorking = statusAtRender === 'WORKING';

    card.innerHTML = `
      <div class="m3-card-real-content" id="m3-card-real-content">
        <div class="m3-bypass-header">
          <div class="m3-bypass-title-row">
            <label class="m3-switch" for="m3-bypass-toggle" title="Toggle Bypass Upload">
              <input type="checkbox" id="m3-bypass-toggle" ${isEnabled ? 'checked' : ''} />
              <span class="m3-slider"></span>
            </label>
            <span class="m3-bypass-title">Bypass Upload</span>
          </div>
          <div class="m3-status-badge ${isWorking ? 'm3-status-working' : 'm3-status-patched'}" id="m3-bypass-status" title="Method Status: ${escapeHtmlAttr(statusAtRender)}">
            <span class="m3-pulse-dot"></span>
            <span class="m3-status-text">${escapeHtmlAttr(statusAtRender)}</span>
          </div>
        </div>
        <div class="m3-field" id="m3-method-row" style="${isEnabled ? '' : 'display: none;'}">
          <span class="m3-field-label">Method</span>
          <div class="m3-method-switch" id="m3-method-switch" role="radiogroup" aria-label="Method">
            ${_webMethodsState.methods.map((m) => {
              const active = m.id === getSelectedMethodId();
              return `<button type="button" class="m3-method-pill ${active ? 'is-active' : ''}" data-method-id="${escapeHtmlAttr(m.id)}" role="radio" aria-checked="${active ? 'true' : 'false'}">${escapeHtmlAttr(m.name || m.id)}</button>`;
            }).join('')}
          </div>
        </div>
        <div class="m3-field" id="m3-compress-field">
          <span class="m3-field-label">Compress Video</span>
          <div class="m3-method-switch" id="m3-compress-switch" role="radiogroup" aria-label="Compress Video">
            <button type="button" class="m3-method-pill ${curCompressMode === 'off' ? 'is-active' : ''}" data-compress-mode="off" id="m3-compress-off-btn" role="radio" aria-checked="${curCompressMode === 'off' ? 'true' : 'false'}">OFF</button>
            <button type="button" class="m3-method-pill ${curCompressMode === '720p' ? 'is-active' : ''}" data-compress-mode="720p" role="radio" aria-checked="${curCompressMode === '720p' ? 'true' : 'false'}">720P</button>
            <button type="button" class="m3-method-pill ${curCompressMode === '1080p' ? 'is-active' : ''}" data-compress-mode="1080p" role="radio" aria-checked="${curCompressMode === '1080p' ? 'true' : 'false'}">1080P</button>
          </div>
          <p class="m3-compress-limit-note" id="m3-compress-limit-note" style="display: none;"></p>
        </div>
        <div class="m3-field" id="m3-watermark-row" style="${isEnabled ? '' : 'display: none;'}">
          <label class="m3-field-label" for="m3-watermark-input">Watermark</label>
          <input type="text" id="m3-watermark-input" class="m3-watermark-input" value="${escapeHtmlAttr(currentWm)}" placeholder="Method from @username" />
        </div>
      </div>
    `;

    const toggle = card.querySelector('#m3-bypass-toggle');
    const compressSwitch = card.querySelector('#m3-compress-switch');
    const methodRow = card.querySelector('#m3-method-row');
    const methodSwitch = card.querySelector('#m3-method-switch');
    const wmRow = card.querySelector('#m3-watermark-row');
    const wmInput = card.querySelector('#m3-watermark-input');

    const bindMethodPills = (container) => {
      if (!container) return;
      container.querySelectorAll('.m3-method-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const nextId = btn.dataset.methodId || 'fish';
          setSelectedMethodId(nextId);
          container.querySelectorAll('.m3-method-pill').forEach((other) => {
            const active = other.dataset.methodId === nextId;
            other.classList.toggle('is-active', active);
            other.setAttribute('aria-checked', active ? 'true' : 'false');
          });
          updateMethodStatusBadge();
          sendRuntimeMsg({ type: 'SYNC_WEB_METHOD', methodId: nextId });
        });
      });
    };

    toggle.addEventListener('change', (e) => {
      const checked = e.target.checked;
      setBypassUploadEnabled(checked);
      if (methodRow) methodRow.style.display = checked ? '' : 'none';
      if (wmRow) wmRow.style.display = checked ? '' : 'none';
    });

    bindMethodPills(methodSwitch);

    if (compressSwitch) {
      compressSwitch.querySelectorAll('.m3-method-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.compressMode || '1080p';
          if (_compressLocked && mode === 'off') return;
          if (typeof setCompressMode === 'function') setCompressMode(mode);
          compressSwitch.querySelectorAll('.m3-method-pill').forEach((other) => {
            const active = other.dataset.compressMode === mode;
            other.classList.toggle('is-active', active);
            other.setAttribute('aria-checked', active ? 'true' : 'false');
          });
        });
      });
    }

    sendRuntimeMsg({ type: 'GET_WEB_METHODS' }).then((res) => {
      const data = res && res.data;
      if (!data || !Array.isArray(data.methods) || !data.methods.length) return;
      _webMethodsState.status = data.status || 'WORKING';
      _webMethodsState.defaultMethod = data.defaultMethod || data.methods[0].id || 'fish';
      if (data.compress && typeof data.compress === 'object') {
        _webMethodsState.compress = { ..._webMethodsState.compress, ...data.compress };
      }
      _webMethodsState.methods = data.methods;
      _webMethodsState.loaded = true;
      const sw = document.getElementById('m3-method-switch');
      if (sw) {
        const cur = getSelectedMethodId();
        sw.innerHTML = data.methods.map((m) => {
          const active = m.id === cur;
          return `<button type="button" class="m3-method-pill ${active ? 'is-active' : ''}" data-method-id="${escapeHtmlAttr(m.id)}" role="radio" aria-checked="${active ? 'true' : 'false'}">${escapeHtmlAttr(m.name || m.id)}</button>`;
        }).join('');
        bindMethodPills(sw);
      }
      updateMethodStatusBadge();
      sendRuntimeMsg({ type: 'SYNC_WEB_METHOD', methodId: getSelectedMethodId() });
    });

    if (compressToggle) {
      compressToggle.addEventListener('change', (e) => {
        if (_compressLocked) {
          e.target.checked = true;
          return;
        }
        setCompressVideoEnabled(e.target.checked);
      });
    }

    if (wmInput) {
      wmInput.addEventListener('input', (e) => {
        setBypassWatermark(e.target.value);
      });
    }

    try {
      uploadContainer.after(card);
    } catch (_) {
      try {
        if (uploadContainer.parentNode && uploadContainer.parentNode.contains(uploadContainer)) {
          const next = uploadContainer.nextSibling;
          if (next && uploadContainer.parentNode.contains(next)) {
            uploadContainer.parentNode.insertBefore(card, next);
          } else {
            uploadContainer.parentNode.appendChild(card);
          }
        }
      } catch (_) {}
    }

    let credit = document.getElementById('m3-bypass-credit');
    if (!credit) {
      credit = document.createElement('div');
      credit.id = 'm3-bypass-credit';
      credit.className = 'm3-bypass-credit';
      credit.innerHTML = 'Thanks for <a href="https://www.tiktok.com/@itsmefachry" target="_blank" rel="noopener noreferrer">fachry</a> to help this method alive!';
    }
    card.after(credit);

    log('Bypass Upload Card mounted (local extension mode)');
  };

  let _activePatching = false;
  let _isHandingOver = false;
  let _proxyFileInput = null;
  let _compressLocked = false;

  const setCompressLimitLock = (locked, reasonText = '') => {
    _compressLocked = Boolean(locked);
    const compressSwitch = document.getElementById('m3-compress-switch');
    const offBtn = document.getElementById('m3-compress-off-btn');
    const noteEl = document.getElementById('m3-compress-limit-note');

    if (offBtn) {
      offBtn.disabled = _compressLocked;
    }
    if (_compressLocked && typeof getCompressMode === 'function' && getCompressMode() === 'off') {
      if (typeof setCompressMode === 'function') setCompressMode('1080p');
      if (compressSwitch) {
        compressSwitch.querySelectorAll('.m3-method-pill').forEach((btn) => {
          const active = btn.dataset.compressMode === '1080p';
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-checked', active ? 'true' : 'false');
        });
      }
    }
    if (noteEl) {
      if (_compressLocked && reasonText) {
        noteEl.textContent = reasonText;
        noteEl.style.display = '';
      } else {
        noteEl.textContent = '';
        noteEl.style.display = 'none';
      }
    }
  };

  const parseFpsFromBytes = (u8) => {
    if (!u8 || u8.length < 32) return 0;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let timescale = 0;
    let sampleDelta = 0;
    for (let i = 0; i < u8.length - 8; i++) {
      if (u8[i] === 0x76 && u8[i + 1] === 0x69 && u8[i + 2] === 0x64 && u8[i + 3] === 0x65) {
        const start = Math.max(0, i - 300);
        const end = Math.min(u8.length - 8, i + 8000);
        for (let j = start; j < end; j++) {
          if (u8[j] === 0x6d && u8[j + 1] === 0x64 && u8[j + 2] === 0x68 && u8[j + 3] === 0x64) {
            const ver = u8[j + 4];
            timescale = ver === 1 ? view.getUint32(j + 24) : view.getUint32(j + 16);
          } else if (u8[j] === 0x73 && u8[j + 1] === 0x74 && u8[j + 2] === 0x74 && u8[j + 3] === 0x73) {
            const cnt = view.getUint32(j + 8);
            if (cnt > 0) sampleDelta = view.getUint32(j + 16);
          }
          if (timescale > 0 && sampleDelta > 0) {
            const fps = Math.round(timescale / sampleDelta);
            if (fps > 0 && fps <= 240) return fps;
          }
        }
      }
    }
    return 0;
  };

  const inspectVideoLimits = async (file) => {
    const meta = await new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      const url = URL.createObjectURL(file);
      const done = (res) => {
        try { URL.revokeObjectURL(url); } catch (_) {}
        resolve(res);
      };
      v.onloadedmetadata = () => done({
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
        duration: Number.isFinite(v.duration) ? v.duration : 0
      });
      v.onerror = () => done({ width: 0, height: 0, duration: 0 });
      v.src = url;
    });

    let fps = 0;
    try {
      const headSize = Math.min(file.size, 1024 * 1024);
      const headBuf = new Uint8Array(await file.slice(0, headSize).arrayBuffer());
      fps = parseFpsFromBytes(headBuf);
      if (!fps && file.size > headSize) {
        const tailStart = Math.max(0, file.size - 1024 * 1024);
        const tailBuf = new Uint8Array(await file.slice(tailStart).arrayBuffer());
        fps = parseFpsFromBytes(tailBuf);
      }
    } catch (_) {}

    const cCfg = _webMethodsState.compress || {};
    const maxShortSide = Number(cCfg.maxShortSide) || 1080;
    const maxFps = Number(cCfg.maxFps) || 60;
    const maxBitrateMbps = Number(cCfg.maxBitrateMbps) || 50;

    const shortSide = Math.min(meta.width, meta.height);
    const bitrateMbps = meta.duration > 0 ? (file.size * 8) / (meta.duration * 1000000) : 0;
    const exceeded = [];
    if (shortSide > maxShortSide) exceeded.push(`${meta.width}x${meta.height} (>${maxShortSide}p)`);
    if (fps > maxFps) exceeded.push(`${fps} FPS (>${maxFps} FPS)`);
    if (bitrateMbps > maxBitrateMbps) exceeded.push(`${bitrateMbps.toFixed(1)} Mbps (>${maxBitrateMbps} Mbps)`);

    return {
      width: meta.width,
      height: meta.height,
      fps,
      bitrateMbps,
      exceedsLimit: exceeded.length > 0,
      reasons: exceeded
    };
  };

  const getProxyFileInput = () => {
    if (!_proxyFileInput || !document.body.contains(_proxyFileInput)) {
      _proxyFileInput = document.createElement('input');
      _proxyFileInput.type = 'file';
      _proxyFileInput.accept = 'video/*,.mp4,.mov,.webm';
      _proxyFileInput.style.display = 'none';
      _proxyFileInput.id = 'fish-proxy-file-input';
      document.body.appendChild(_proxyFileInput);

      _proxyFileInput.addEventListener('change', (e) => {
        if (_activePatching) return;
        if (e.target.files && e.target.files.length) {
          const file = e.target.files[0];
          e.target.value = '';
          processAndCalibrateFile(file);
        }
      });
    }
    return _proxyFileInput;
  };

  // Handover file hasil patch dari extension ke <input type="file"> panel upload TikTok
  const handoverFileToUploadPanel = (fileInput, calibratedFile) => {
    if (!fileInput) return;
    _isHandingOver = true;
    fileInput.dataset.fishHandover = '1';
    try {
      const dt = new DataTransfer();
      dt.items.add(calibratedFile);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      log('✓ Handover complete -> TikTok upload panel:', calibratedFile.name);
    } finally {
      delete fileInput.dataset.fishHandover;
      _isHandingOver = false;
    }
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
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  };

  const compressVideoViaOffscreen = async (file, onProgress = () => {}) => {
    const ensureRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'ENSURE_OFFSCREEN' }, resolve);
    });
    if (!ensureRes?.ok) {
      throw new Error(ensureRes?.error || 'Failed to start FFmpeg offscreen worker.');
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());
    const CHUNK_SIZE = 2 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(inputBytes.byteLength / CHUNK_SIZE));

    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'fa-ffmpeg-compress' });
      let outChunks = [];
      let outTotalSize = 0;
      let resultMeta = {};
      let settled = false;

      port.onDisconnect.addListener(() => {
        if (!settled) {
          settled = true;
          reject(new Error('FFmpeg offscreen connection closed unexpectedly.'));
        }
      });

      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'PROGRESS') {
          onProgress(msg);
          return;
        }
        if (msg.type === 'RESULT_INIT') {
          outChunks = [];
          outTotalSize = Number(msg.totalSize) || 0;
          resultMeta = msg;
          return;
        }
        if (msg.type === 'RESULT_CHUNK' && typeof msg.b64 === 'string') {
          outChunks.push(base64ToUint8(msg.b64));
          return;
        }
        if (msg.type === 'RESULT_DONE') {
          settled = true;
          try { port.disconnect(); } catch (_) {}
          const merged = new Uint8Array(outTotalSize || outChunks.reduce((a, c) => a + c.byteLength, 0));
          let off = 0;
          for (const c of outChunks) {
            merged.set(c, off);
            off += c.byteLength;
          }
          const outName = file.name.replace(/\.[^.]+$/, '') + '.mp4';
          const outFile = new File([merged], outName, { type: 'video/mp4', lastModified: Date.now() });
          resolve({
            file: outFile,
            origSize: resultMeta.origSize || inputBytes.byteLength,
            outSize: merged.byteLength,
            skippedLarger: Boolean(resultMeta.skippedLarger)
          });
          return;
        }
        if (msg.type === 'ERROR') {
          settled = true;
          try { port.disconnect(); } catch (_) {}
          reject(new Error(msg.error || 'FFmpeg compression failed.'));
        }
      });

      port.postMessage({
        type: 'INIT',
        fileName: file.name,
        totalSize: inputBytes.byteLength,
        totalChunks,
        compressConfig: {
          ...(_webMethodsState.compress || {}),
          compressMode: typeof getCompressMode === 'function' ? getCompressMode() : '1080p'
        }
      });
      for (let i = 0; i < totalChunks; i++) {
        const slice = inputBytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        port.postMessage({ type: 'CHUNK', index: i, b64: uint8ToBase64(slice) });
      }
      port.postMessage({ type: 'COMMIT' });
    });
  };

  const processAndCalibrateFile = async (file) => {
    if (_activePatching) return;
    _activePatching = true;

    const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                      document.querySelector('input[type="file"]:not(#fish-proxy-file-input)');
    const uploadContainer = fileInput?.closest('div[role="button"]') ||
                            document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                            document.querySelector('.upload, [class*="upload"]');
    const dropCard = document.querySelector('[data-e2e="select_video_container"]') ||
                     uploadContainer?.querySelector('.upload-card') ||
                     uploadContainer;

    if (!dropCard) {
      _activePatching = false;
      return;
    }

    if (uploadContainer) {
      uploadContainer.classList.add('fish-dropzone-disabled');
      uploadContainer.style.pointerEvents = 'none';
    }

    const innerElements = Array.from(dropCard.children).filter((el) => el.id !== 'fish-upload-progress-overlay');
    innerElements.forEach((el) => el.classList.add('fish-dropzone-fadeout'));

    const videoSgt = uploadContainer ? uploadContainer.querySelector('.video-suggestion') : null;
    if (videoSgt) videoSgt.classList.add('fish-dropzone-fadeout');

    dropCard.style.position = 'relative';

    let overlay = document.getElementById('fish-upload-progress-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fish-upload-progress-overlay';
      overlay.className = 'fish-progress-overlay';
      overlay.innerHTML = `
        <div class="fish-progress-fill" id="fish-progress-fill"></div>
        <div class="fish-progress-center">
          <span class="fish-progress-percent" id="fish-progress-percent">0%</span>
          <span class="fish-progress-sub" id="fish-progress-sub"></span>
        </div>
      `;
      dropCard.appendChild(overlay);
    }

    const fillEl = overlay.querySelector('#fish-progress-fill');
    const percentEl = overlay.querySelector('#fish-progress-percent');
    const subEl = overlay.querySelector('#fish-progress-sub');

    const setProgress = (val, subText = null) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)));
      if (fillEl) fillEl.style.setProperty('width', clamped + '%', 'important');
      if (percentEl) percentEl.textContent = clamped + '%';
      if (subEl && subText !== null) subEl.textContent = subText;
    };

    const animateProgress = (from, to, duration) => {
      return new Promise((resolve) => {
        const startTime = performance.now();
        const step = (now) => {
          const progress = Math.min((now - startTime) / duration, 1);
          setProgress(from + (to - from) * progress);
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    };

    const restoreDropzone = () => {
      if (overlay) overlay.remove();
      innerElements.forEach((el) => el.classList.remove('fish-dropzone-fadeout'));
      if (videoSgt) videoSgt.classList.remove('fish-dropzone-fadeout');
      if (uploadContainer) {
        uploadContainer.classList.remove('fish-dropzone-disabled');
        uploadContainer.style.pointerEvents = '';
      }
    };

    try {
      const limits = await inspectVideoLimits(file);
      if (limits.exceedsLimit) {
        setCompressLimitLock(
          true,
          `Video melebihi batas (maks 1080p, 60 FPS, 50 Mbps): ${limits.reasons.join(', ')}. Compress Video diaktifkan otomatis dan tidak dapat dimatikan.`
        );
      } else {
        setCompressLimitLock(false);
      }

      const doCompress = limits.exceedsLimit || isCompressVideoEnabled();
      const doBypass = isBypassUploadEnabled();
      let workingFile = file;

      if (doCompress) {
        log('Compressing video:', file.name);
        const maxCompressPct = doBypass ? 82 : 98;
        setProgress(2, 'Preparing...');
        const compRes = await compressVideoViaOffscreen(workingFile, (prog) => {
          if (prog.stage === 'wasm') {
            const p = 2 + Math.round((prog.percent / 100) * 20);
            setProgress(p, prog.detail || 'Downloading...');
          } else if (prog.stage === 'compress') {
            const p = 22 + Math.round((prog.percent / 100) * (maxCompressPct - 22));
            setProgress(p, 'Compressing...');
          }
        });
        workingFile = compRes.file;
        log(
          compRes.skippedLarger
            ? `✓ Compression skipped (${(compRes.origSize / 1048576).toFixed(2)} MB)`
            : `✓ Compressed ${(compRes.origSize / 1048576).toFixed(2)} MB -> ${(compRes.outSize / 1048576).toFixed(2)} MB`
        );
      }

      if (doBypass) {
        log('Processing video:', workingFile.name);
        const startPct = doCompress ? 82 : 10;
        setProgress(startPct, doCompress ? 'Processing...' : '');
        const patchPromise = calibrateVideoFile(workingFile, getSelectedMethodId());
        await Promise.all([patchPromise, animateProgress(startPct, 95, 280)]);
        workingFile = await patchPromise;
      }

      await animateProgress(95, 100, 120);
      restoreDropzone();

      // Handover hasil akhir ke panel upload TikTok
      handoverFileToUploadPanel(fileInput, workingFile);
    } catch (err) {
      log('Calibration error:', err?.message || err);
      restoreDropzone();
    } finally {
      _activePatching = false;
    }
  };

  let _lastPickerOpenAt = 0;
  const openProxyPicker = () => {
    const now = Date.now();
    if (now - _lastPickerOpenAt < 700) return;
    _lastPickerOpenAt = now;
    getProxyFileInput().click();
  };

  const DROPZONE_SELECTOR = '[data-e2e="select_video_container"], [data-e2e="select_video_button"], .upload-stage-btn';

  const shouldInterceptUpload = () => isBypassUploadEnabled() || isCompressVideoEnabled();

  const setupFileUploadInterceptor = () => {
    ['pointerdown', 'mousedown'].forEach((evtName) => {
      document.addEventListener(evtName, (e) => {
        if (!shouldInterceptUpload()) return;
        if (!e.target.closest || !e.target.closest(DROPZONE_SELECTOR)) return;
        e.stopImmediatePropagation();
      }, true);
    });

    document.addEventListener('click', (e) => {
      if (!shouldInterceptUpload()) return;
      const dropzone = e.target.closest && e.target.closest(DROPZONE_SELECTOR);
      if (!dropzone) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (_activePatching) return;
      openProxyPicker();
    }, true);

    document.addEventListener('dragover', (e) => {
      if (!shouldInterceptUpload()) return;
      const dropzone = e.target.closest && e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
      if (dropzone) e.preventDefault();
    }, true);

    document.addEventListener('drop', (e) => {
      if (!shouldInterceptUpload()) return;
      const dropzone = e.target.closest && e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
      if (dropzone) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const dt = e.dataTransfer;
        if (dt && dt.files && dt.files.length) {
          processAndCalibrateFile(dt.files[0]);
        }
      }
    }, true);

    document.addEventListener('change', (e) => {
      if (!shouldInterceptUpload()) return;
      if (_isHandingOver) return;
      const target = e.target;
      if (target && target.tagName === 'INPUT' && target.type === 'file' && target.id !== 'fish-proxy-file-input') {
        if (target.dataset.fishHandover === '1') return;
        if (target.files && target.files.length) {
          const file = target.files[0];
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          processAndCalibrateFile(file);
        }
      }
    }, true);
  };

  const startUploadCardObserver = () => {
    let scheduled = false;
    let wasOnUpload = false;
    const check = () => {
      scheduled = false;
      const onUpload = window.location.pathname.includes('/upload');
      if (onUpload) {
        wasOnUpload = true;
        injectUploadBypassCard();
      } else if (wasOnUpload) {
        wasOnUpload = false;
        removeUploadBypassCard();
      }
    };

    const scheduleCheck = () => {
      const onUpload = window.location.pathname.includes('/upload');
      if (!onUpload && !wasOnUpload) return;
      if (scheduled) return;
      scheduled = true;
      setTimeout(check, 150);
    };

    const observer = new MutationObserver(scheduleCheck);
    const attach = () => {
      check();
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    };

    if (document.body) {
      attach();
    } else {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    }
  };
