    /* D. 1:1 Bypass Upload Engine (Bit-by-Bit Sentinel & High-Quality Ingest Interceptor) */
    const isBypassUploadEnabled = () => {
      return localStorage.getItem('fish_acc_bypass_upload') !== 'false';
    };

    const setBypassUploadEnabled = (enabled) => {
      localStorage.setItem('fish_acc_bypass_upload', enabled ? 'true' : 'false');
    };

    // =========================================================================
    // Dynamic GitHub Remote Patcher Loader (https://github.com/cutefishaep/fp-ext)
    // Engine patch.js dan sl-sr.js dimuat secara dinamis dari repository fp-ext
    // =========================================================================
    let _isRemoteLoading = true;
    let _remoteLoadPromise = null;

    const REMOTE_BASE_URLS = [
      'https://raw.githubusercontent.com/cutefishaep/fp-ext/master/asset/engines',
      'https://cdn.jsdelivr.net/gh/cutefishaep/fp-ext@master/asset/engines'
    ];

    const executeRemoteScript = (code, label) => {
      if (!code || typeof code !== 'string') return false;
      try {
        const script = document.createElement('script');
        script.textContent = code;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        log(`✓ Patcher engine [${label}] loaded from fp-ext`);
        return true;
      } catch (e) {
        try {
          new Function(code)();
          log(`✓ Patcher engine [${label}] evaluated`);
          return true;
        } catch (err2) {
          log(`Patcher load error [${label}]:`, err2.message);
          return false;
        }
      }
    };

    const updateCardSkeletonState = () => {
      const card = document.getElementById('m3-bypass-upload-card');
      if (!card) return;
      const skel = card.querySelector('#m3-skeleton-container');
      const real = card.querySelector('#m3-card-real-content');
      if (_isRemoteLoading) {
        card.classList.add('m3-loading');
        if (skel) skel.style.display = 'flex';
        if (real) real.style.display = 'none';
      } else {
        card.classList.remove('m3-loading');
        if (skel) skel.remove();
        if (real) real.style.display = 'block';
      }
    };

    const loadRemoteEngines = () => {
      if (_remoteLoadPromise) return _remoteLoadPromise;

      _isRemoteLoading = true;
      updateCardSkeletonState();

      _remoteLoadPromise = (async () => {
        // soundsafe-hook.js = library window.FRYMention (resolver @mention klikabel,
        // TANPA hook jaringan — interceptor tetap satu-satunya: triple-hook di bawah).
        const engines = ['patch.js', 'sl-sr.js', 'soundsafe-hook.js'];
        const results = await Promise.all(engines.map(async (fileName) => {
          // 1. Cek cache lokal terlebih dahulu untuk kecepatan
          const cached = localStorage.getItem(`fp_ext_${fileName}`);
          let executedFromCache = false;
          if (cached && cached.length > 200) {
            executedFromCache = executeRemoteScript(cached, `${fileName} [cache]`);
          }

          // 2. Fetch versi terbaru dari GitHub.
          //    Cache selalu diperbarui, tapi engine hanya dieksekusi ulang
          //    saat kodenya benar-benar berubah (mencegah eksekusi ganda).
          for (const baseUrl of REMOTE_BASE_URLS) {
            try {
              const res = await fetch(`${baseUrl}/${fileName}?t=${Date.now()}`, { cache: 'no-store' });
              if (res.ok) {
                const code = await res.text();
                if (code && code.length > 200) {
                  const changed = code !== cached;
                  localStorage.setItem(`fp_ext_${fileName}`, code);
                  if (!executedFromCache || changed) {
                    executeRemoteScript(code, `${fileName} [live]`);
                  }
                  return true;
                }
              }
            } catch (_) {}
          }
          return executedFromCache;
        }));

        // Matikan skeleton loading setelah selesai memuat
        setTimeout(() => {
          _isRemoteLoading = false;
          updateCardSkeletonState();
          updateMethodStatusBadge();
          log('✓ GitHub patcher engines ready from fp-ext');
        }, 500);

        return results.every(Boolean);
      })();

      return _remoteLoadPromise;
    };

    // Jalankan pemuatan engine saat script berjalan
    loadRemoteEngines();

    // Unified 1:1 Video Calibrator Pipeline
    const calibrateVideoFile = async (file) => {
      // Pastikan engine dari GitHub fp-ext sudah termuat
      if (_isRemoteLoading && _remoteLoadPromise) {
        await _remoteLoadPromise;
      }

      // 1. Coba Engine 4.0 Direct Patch (sl-sr.js dari fp-ext)
      try {
        if (typeof window.patchSlSr === 'function') {
          log('Calibrating video with sl-sr.js from fp-ext...');
          const patchedBlob = await window.patchSlSr(file);
          if (patchedBlob && patchedBlob.size > 0) {
            log('✓ Video patched successfully via sl-sr.js (size:', patchedBlob.size, ')');
            return new File([patchedBlob], file.name, {
              type: 'video/mp4',
              lastModified: Date.now()
            });
          }
        }
      } catch (errSlSr) {
        log('sl-sr notice (falling back to patch.js):', errSlSr?.message || errSlSr);
      }

      // 2. Fallback ke Engine 5.0 Core (patch.js dari fp-ext)
      try {
        const patcher = window.ADJNMp4Patcher || window.FRYMp4Patcher;
        if (patcher && typeof patcher.quickPatch === 'function') {
          log('Calibrating video with patch.js from fp-ext...');
          const buf = await file.arrayBuffer();
          const patchedU8 = patcher.quickPatch(buf);
          if (patchedU8 && patchedU8.length > 0) {
            log('✓ Video patched successfully via patch.js (size:', patchedU8.length, ')');
            return new File([patchedU8], file.name, {
              type: 'video/mp4',
              lastModified: Date.now()
            });
          }
        }
      } catch (errPatch) {
        log('patch.js notice:', errPatch?.message || errPatch);
      }

      log('Video used untouched as fallback');
      return file;
    };

    // Status Metode Bypass — DINAMIS dari engine (patch.js / sl-sr.js) yang di-fetch
    // dari GitHub fp-ext. Bukan hardcoded: author engine mengganti STATUS di patch.js,
    // badge kartu otomatis mengikuti (WORKING = hijau, selain itu = merah).
    const getMethodStatus = () => {
      const engineApis = [
        window.ADJNMp4Patcher,
        window.FRYMp4Patcher,
        window.FRYOriginalMp4Core,
        window.ADJNOriginalMp4Core,
        window.HazePatch,
      ];
      for (const api of engineApis) {
        if (api && typeof api.status === 'string' && api.status.trim()) {
          return api.status.trim().toUpperCase();
        }
      }
      return _isRemoteLoading ? 'CHECKING' : 'UNKNOWN';
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

    const DEFAULT_WATERMARK = 'Method from @cutefishaep';

    // Penyimpanan Watermark Bypass
    const getBypassWatermark = () => {
      const val = localStorage.getItem('fish_acc_bypass_watermark');
      if (val === null || val === 'Method By cutefish.my.id') {
        return DEFAULT_WATERMARK;
      }
      return val;
    };
    const setBypassWatermark = (val) => {
      localStorage.setItem('fish_acc_bypass_watermark', val);
    };

    // Pre-resolve UID @handle pada watermark via window.FRYMention (soundsafe-hook.js)
    // supaya saat publish, mention watermark langsung klikabel tanpa menunggu API.
    let _lastWarmedWm = null;
    const warmMentionCache = (wmText) => {
      const wm = (typeof wmText === 'string') ? wmText.trim() : '';
      if (!wm || wm === _lastWarmedWm) return;
      const lib = window.FRYMention;
      if (!lib || typeof lib.warm !== 'function') return;
      _lastWarmedWm = wm;
      try { lib.warm(wm); } catch (_) {}
    };

    // UI Card Injector di Halaman Upload
    const injectUploadBypassCard = () => {
      const isUploadPage = window.location.pathname.includes('/upload');
      if (!isUploadPage) {
        const existing = document.getElementById('m3-bypass-upload-card');
        if (existing) existing.remove();
        const existingCredit = document.getElementById('m3-bypass-credit');
        if (existingCredit) existingCredit.remove();
        const existingBack = document.getElementById('m3-upload-page-back-btn');
        if (existingBack) existingBack.remove();
        return;
      }

      const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                        document.querySelector('input[type="file"]');
      const uploadContainer = fileInput?.closest('div[role="button"]') ||
                              document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                              document.querySelector('.upload, [class*="upload"]');
      if (!uploadContainer) return;

      // Refresh badge status metode tiap tick interval (status datang dari engine)
      updateMethodStatusBadge();
      // Panaskan cache UID mention untuk watermark saat ini (sekali per nilai)
      warmMentionCache(getBypassWatermark());

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
        } catch (e) {
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
      card.className = `m3-bypass-card${_isRemoteLoading ? ' m3-loading' : ''}`;

      const isEnabled = isBypassUploadEnabled();
      const currentWm = getBypassWatermark();
      const statusAtRender = getMethodStatus();
      const isWorking = statusAtRender === 'WORKING';

      card.innerHTML = `
        <!-- SKELETON LOADING CONTAINER (Aktif HANYA saat memuat script dari github fp-ext) -->
        ${_isRemoteLoading ? `
        <div class="m3-skeleton-container" id="m3-skeleton-container">
          <div class="m3-skeleton-header">
            <div class="m3-skeleton-left">
              <div class="m3-shimmer m3-skel-switch"></div>
              <div class="m3-shimmer m3-skel-title"></div>
            </div>
            <div class="m3-shimmer m3-skel-badge"></div>
          </div>
          <div class="m3-skeleton-desc">
            <div class="m3-shimmer m3-skel-line" style="width: 90%;"></div>
            <div class="m3-shimmer m3-skel-line" style="width: 65%;"></div>
          </div>
          <div class="m3-skeleton-row">
            <div class="m3-shimmer m3-skel-label"></div>
            <div class="m3-shimmer m3-skel-input"></div>
          </div>
        </div>` : ''}

        <!-- REAL CARD CONTENT (Muncul setelah script github termuat) -->
        <div class="m3-card-real-content" id="m3-card-real-content" style="${_isRemoteLoading ? 'display: none;' : ''}">
          <div class="m3-bypass-header">
            <div class="m3-bypass-title-row">
              <label class="m3-switch" for="m3-bypass-toggle" title="Toggle 1:1 Bypass Upload">
                <input type="checkbox" id="m3-bypass-toggle" ${isEnabled ? 'checked' : ''} />
                <span class="m3-slider"></span>
              </label>
              <span class="m3-bypass-title">Enable bypass upload ?</span>
            </div>
            <div class="m3-status-badge ${isWorking ? 'm3-status-working' : 'm3-status-patched'}" id="m3-bypass-status" title="Method Status: ${statusAtRender}">
              <span class="m3-pulse-dot"></span>
              <span class="m3-status-text">${statusAtRender}</span>
            </div>
          </div>
          <p class="m3-bypass-desc">
            This method is not permanent; TikTok may occasionally patch it. If that occurs, please wait until the status displays "Working".
          </p>
          <div class="m3-watermark-row" id="m3-watermark-row" style="${isEnabled ? '' : 'display: none;'}">
            <label class="m3-watermark-label" for="m3-watermark-input">Watermark</label>
            <input type="text" id="m3-watermark-input" class="m3-watermark-input" value="${String(currentWm).replace(/"/g, '&quot;')}" placeholder="Method from @cutefishaep" />
          </div>
        </div>
      `;

      // Event listener toggle (Badge status TIDAK BERUBAH karena hanya diubah lewat script)
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
          // Resolve UID handle watermark baru di background agar mention siap saat publish
          warmMentionCache(e.target.value);
        });
      }

      // Sisipkan di BAWAH upload container
      try {
        uploadContainer.after(card);
      } catch (e) {
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

      // Tulisan credit di LUAR container
      let credit = document.getElementById('m3-bypass-credit');
      if (!credit) {
        credit = document.createElement('div');
        credit.id = 'm3-bypass-credit';
        credit.className = 'm3-bypass-credit';
        credit.innerHTML = `Thanks for <a href="https://www.tiktok.com/@itsmefachry" target="_blank" rel="noopener noreferrer">fachry</a> to help this method alive!`;
      }
      card.after(credit);

      log('Bypass Upload Card injected below upload container');
    };

    let _activePatching = false;
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
          if (_activePatching) return; // sedang kalibrasi — jangan proses dua file
          if (e.target.files && e.target.files.length) {
            const file = e.target.files[0];
            e.target.value = '';
            processAndCalibrateFile(file);
          }
        });
      }
      return _proxyFileInput;
    };

    // Helper untuk animasi progress bar di container upload saat patching video
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

      // 1. Disable area container dan fade out konten internal
      if (uploadContainer) {
        uploadContainer.classList.add('fish-dropzone-disabled');
        uploadContainer.style.pointerEvents = 'none';
      }

      const innerElements = Array.from(dropCard.children).filter((el) => el.id !== 'fish-upload-progress-overlay');
      innerElements.forEach((el) => el.classList.add('fish-dropzone-fadeout'));

      const videoSgt = uploadContainer ? uploadContainer.querySelector('.video-suggestion') : null;
      if (videoSgt) videoSgt.classList.add('fish-dropzone-fadeout');

      dropCard.style.position = 'relative';

      // 2. Overlay progress minimalis: TANPA blur, TANPA badge — hanya progress bar
      //    yang mengisi penuh area drop (kiri→kanan) + text persen di tengah.
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

      const animateProgress = (from, to, duration) => {
        return new Promise((resolve) => {
          const startTime = performance.now();
          const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const val = Math.round(from + (to - from) * progress);
            if (fillEl) fillEl.style.setProperty('width', val + '%', 'important');
            if (percentEl) percentEl.textContent = val + '%';
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      };

      try {
        log('Auto-calibrating video for 1:1 Ingest:', file.name);

        // Tahap 1: Analisis video tracks & audio
        await animateProgress(0, 35, 300);

        // Tahap 2: Eksekusi patching bitstream (sl-sr / ADJN Core v5.0)
        await animateProgress(35, 80, 400);
        const calibratedFile = await calibrateVideoFile(file);

        // Tahap 3: Finalisasi kalibrasi
        await animateProgress(80, 100, 200);
        await new Promise((r) => setTimeout(r, 200));

        // 3. Bersihkan overlay dan restore tampilan container
        if (overlay) overlay.remove();
        innerElements.forEach((el) => el.classList.remove('fish-dropzone-fadeout'));
        if (videoSgt) videoSgt.classList.remove('fish-dropzone-fadeout');
        if (uploadContainer) {
          uploadContainer.classList.remove('fish-dropzone-disabled');
          uploadContainer.style.pointerEvents = '';
        }

        // 4. Teruskan file ke TikTok
        if (fileInput) {
          fileInput._fishAccProcessing = true;
          const dt = new DataTransfer();
          dt.items.add(calibratedFile);
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          fileInput.dispatchEvent(new Event('input', { bubbles: true }));

          setTimeout(() => {
            fileInput._fishAccProcessing = false;
            _activePatching = false;
          }, 500);
        } else {
          _activePatching = false;
        }
        log('1:1 Bitstream calibration complete:', file.name);
      } catch (err) {
        log('Auto-calibration error:', err.message);
        if (overlay) overlay.remove();
        innerElements.forEach((el) => el.classList.remove('fish-dropzone-fadeout'));
        if (videoSgt) videoSgt.classList.remove('fish-dropzone-fadeout');
        if (uploadContainer) {
          uploadContainer.classList.remove('fish-dropzone-disabled');
          uploadContainer.style.pointerEvents = '';
        }
        _activePatching = false;
      }
    };

    // Anti double-picker: klik ganda / gesture rangkap (pointerdown→click) dalam
    // jendela 700ms hanya membuka picker SATU kali.
    let _lastPickerOpenAt = 0;
    const openProxyPicker = () => {
      const now = Date.now();
      if (now - _lastPickerOpenAt < 700) return;
      _lastPickerOpenAt = now;
      getProxyFileInput().click();
    };

    // Target yang memicu file picker TikTok (dipakai bersama oleh pointerdown/mousedown/click)
    const DROPZONE_SELECTOR = '[data-e2e="select_video_container"], [data-e2e="select_video_button"], .upload-stage-btn';

    // Intersep input file drop & change untuk auto-patch video file
    const setupFileUploadInterceptor = () => {
      // 0. Hentikan listener pointerdown/mousedown milik TikTok pada dropzone.
      //    Beberapa varian dropzone memanggil file input click() DI SINI (bukan di
      //    click) → picker TikTok terbuka di luar kendali kita lalu handler click
      //    kita membuka picker proxy lagi = picker ganda. stopImmediatePropagation
      //    di fase capture memblokirnya; aktivasi native klik tetap berjalan normal.
      ['pointerdown', 'mousedown'].forEach((evtName) => {
        document.addEventListener(evtName, (e) => {
          if (!isBypassUploadEnabled()) return;
          if (!e.target.closest || !e.target.closest(DROPZONE_SELECTOR)) return;
          e.stopImmediatePropagation();
        }, true);
      });

      // 1. Intersep klik pada area select_video_container dan button
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

      // 2. Intersep Drag & Drop ke area upload
      document.addEventListener('dragover', (e) => {
        if (!isBypassUploadEnabled()) return;
        const dropzone = e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
        if (dropzone) e.preventDefault();
      }, true);

      document.addEventListener('drop', (e) => {
        if (!isBypassUploadEnabled()) return;
        const dropzone = e.target.closest('[data-e2e="select_video_container"], .upload, [class*="upload"]');
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

      // 3. Fallback jika input file TikTok terpicu langsung
      document.addEventListener('change', (e) => {
        if (!isBypassUploadEnabled()) return;
        const target = e.target;
        if (target && target.tagName === 'INPUT' && target.type === 'file' && target.id !== 'fish-proxy-file-input') {
          if (target._fishAccProcessing) return;
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

    setupFileUploadInterceptor();

