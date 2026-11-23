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

  const getMethodStatus = () => {
    const hasEngine = typeof window.patchSlSr === 'function' ||
      typeof window.ADJNMp4Patcher?.quickPatch === 'function';
    if (!hasEngine) return 'UNAVAILABLE';

    const engineApis = [
      window.ADJNMp4Patcher,
      window.FRYMp4Patcher,
      window.FRYOriginalMp4Core,
      window.ADJNOriginalMp4Core,
      window.HazePatch
    ];
    for (const api of engineApis) {
      if (api && typeof api.status === 'string' && api.status.trim()) {
        return api.status.trim().toUpperCase();
      }
    }
    return 'WORKING';
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
    const wmRow = document.getElementById('m3-watermark-row');
    const wmInput = document.getElementById('m3-watermark-input');
    const enabled = isBypassUploadEnabled();
    if (toggle && toggle.checked !== enabled) {
      toggle.checked = enabled;
    }
    if (wmRow) {
      wmRow.style.display = enabled ? '' : 'none';
    }
    if (wmInput && document.activeElement !== wmInput && wmInput.value !== getBypassWatermark()) {
      wmInput.value = getBypassWatermark();
    }
  };

  // Unified 1:1 Video Calibrator Pipeline (berjalan penuh di context extension ISOLATED world)
  const calibrateVideoFile = async (file) => {
    // 1. Engine 4.0 Direct Patch (sl-sr.js bundled in extension)
    try {
      if (typeof window.patchSlSr === 'function') {
        log('Patching video inside extension (sl-sr engine)...');
        const patchedBlob = await window.patchSlSr(file);
        if (patchedBlob && patchedBlob.size > 0) {
          log('✓ Video patched via sl-sr (size:', patchedBlob.size, ')');
          return new File([patchedBlob], file.name, {
            type: 'video/mp4',
            lastModified: Date.now()
          });
        }
      }
    } catch (errSlSr) {
      log('sl-sr notice (falling back to patch.js):', errSlSr?.message || errSlSr);
    }

    // 2. Fallback Engine 5.0 Core (patch.js bundled in extension)
    try {
      const patcher = window.ADJNMp4Patcher || window.FRYMp4Patcher;
      if (patcher && typeof patcher.quickPatch === 'function') {
        log('Patching video inside extension (patch.js Core v5.0)...');
        const buf = await file.arrayBuffer();
        const patchedU8 = patcher.quickPatch(buf);
        if (patchedU8 && patchedU8.length > 0) {
          log('✓ Video patched via patch.js (size:', patchedU8.length, ')');
          return new File([patchedU8], file.name, {
            type: 'video/mp4',
            lastModified: Date.now()
          });
        }
      }
    } catch (errPatch) {
      log('patch.js notice:', errPatch?.message || errPatch);
    }

    log('Video handed over untouched as fallback');
    return file;
  };

  const removeUploadBypassCard = () => {
    ['m3-bypass-upload-card', 'm3-bypass-credit', 'm3-upload-page-back-btn'].forEach((id) => {
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

    // 1. Tombol Back to Posts di atas Upload Container
    let backBtn = document.getElementById('m3-upload-page-back-btn');
    if (!backBtn) {
      backBtn = document.createElement('button');
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
      try {
        uploadContainer.before(backBtn);
      } catch (_) {
        try {
          if (uploadContainer.parentNode && uploadContainer.parentNode.contains(uploadContainer)) {
            uploadContainer.parentNode.insertBefore(backBtn, uploadContainer);
          }
        } catch (_) {}
      }
    }

    if (document.getElementById('m3-bypass-upload-card')) return;

    const card = document.createElement('div');
    card.id = 'm3-bypass-upload-card';
    card.className = 'm3-bypass-card';

    const isEnabled = isBypassUploadEnabled();
    const currentWm = getBypassWatermark();
    const statusAtRender = getMethodStatus();
    const isWorking = statusAtRender === 'WORKING';

    card.innerHTML = `
      <div class="m3-card-real-content" id="m3-card-real-content">
        <div class="m3-bypass-header">
          <div class="m3-bypass-title-row">
            <label class="m3-switch" for="m3-bypass-toggle" title="Toggle 1:1 Bypass Upload">
              <input type="checkbox" id="m3-bypass-toggle" ${isEnabled ? 'checked' : ''} />
              <span class="m3-slider"></span>
            </label>
            <span class="m3-bypass-title">Enable bypass upload ?</span>
          </div>
          <div class="m3-status-badge ${isWorking ? 'm3-status-working' : 'm3-status-patched'}" id="m3-bypass-status" title="Method Status: ${escapeHtmlAttr(statusAtRender)}">
            <span class="m3-pulse-dot"></span>
            <span class="m3-status-text">${escapeHtmlAttr(statusAtRender)}</span>
          </div>
        </div>
        <p class="m3-bypass-desc">
          Video calibration runs locally inside the extension before handover to TikTok Studio's upload panel.
        </p>
        <div class="m3-watermark-row" id="m3-watermark-row" style="${isEnabled ? '' : 'display: none;'}">
          <label class="m3-watermark-label" for="m3-watermark-input">Watermark</label>
          <input type="text" id="m3-watermark-input" class="m3-watermark-input" value="${escapeHtmlAttr(currentWm)}" placeholder="Method from @username" />
        </div>
      </div>
    `;

    const toggle = card.querySelector('#m3-bypass-toggle');
    const wmRow = card.querySelector('#m3-watermark-row');
    const wmInput = card.querySelector('#m3-watermark-input');

    toggle.addEventListener('change', (e) => {
      const checked = e.target.checked;
      setBypassUploadEnabled(checked);
      if (wmRow) wmRow.style.display = checked ? '' : 'none';
    });

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
        </div>
      `;
      dropCard.appendChild(overlay);
    }

    const fillEl = overlay.querySelector('#fish-progress-fill');
    const percentEl = overlay.querySelector('#fish-progress-percent');

    const setProgress = (val) => {
      const clamped = Math.max(0, Math.min(100, Math.round(val)));
      if (fillEl) fillEl.style.setProperty('width', clamped + '%', 'important');
      if (percentEl) percentEl.textContent = clamped + '%';
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
      log('Calibrating video inside extension:', file.name);
      setProgress(10);

      // Jalankan patching segera sambil progress bar berjalan mulus sampai 85%
      const patchPromise = calibrateVideoFile(file);
      await Promise.all([patchPromise, animateProgress(10, 85, 320)]);
      const calibratedFile = await patchPromise;

      await animateProgress(85, 100, 140);
      restoreDropzone();

      // Handover hasil patch ke panel upload TikTok
      handoverFileToUploadPanel(fileInput, calibratedFile);
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

  const setupFileUploadInterceptor = () => {
    ['pointerdown', 'mousedown'].forEach((evtName) => {
      document.addEventListener(evtName, (e) => {
        if (!isBypassUploadEnabled()) return;
        if (!e.target.closest || !e.target.closest(DROPZONE_SELECTOR)) return;
        e.stopImmediatePropagation();
      }, true);
    });

    document.addEventListener('click', (e) => {
      if (!isBypassUploadEnabled()) return;
      const dropzone = e.target.closest && e.target.closest(DROPZONE_SELECTOR);
      if (!dropzone) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (_activePatching) return;
      openProxyPicker();
    }, true);

    document.addEventListener('dragover', (e) => {
      if (!isBypassUploadEnabled()) return;
      const dropzone = e.target.closest && e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
      if (dropzone) e.preventDefault();
    }, true);

    document.addEventListener('drop', (e) => {
      if (!isBypassUploadEnabled()) return;
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
      if (!isBypassUploadEnabled()) return;
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
