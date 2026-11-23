  /* --- 2b. Loader Version Compatibility Guard --- */
  const LOADER_DOWNLOAD_URL = 'https://github.com/cutefishaep/fp-ext/releases/latest/download/loader.zip';

  const compareVersionStr = (a, b) => {
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

  const getRequiredLoaderVersion = () => {
    const cfg = typeof getLiveConfig === 'function' ? getLiveConfig() : null;
    if (!cfg || typeof cfg !== 'object') return '';
    const minVer = typeof cfg.minLoaderVersion === 'string' ? cfg.minLoaderVersion.trim() : '';
    const latestVer = typeof cfg.loaderVersion === 'string' ? cfg.loaderVersion.trim() : '';
    if (minVer && latestVer) {
      return compareVersionStr(minVer, latestVer) >= 0 ? minVer : latestVer;
    }
    return minVer || latestVer || '';
  };

  const showLoaderUpdateModal = ({ currentLoader, requiredLoader, downloadUrl }) => {
    const mount = () => {
      if (!document.body || document.getElementById('m3-loader-update-backdrop')) return;

      const dismissKey = `fa_loader_update_dismissed_${requiredLoader}`;
      const backdrop = document.createElement('div');
      backdrop.id = 'm3-loader-update-backdrop';
      backdrop.className = 'm3-loader-update-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'm3-loader-update-title');

      backdrop.innerHTML = `
        <div class="m3-loader-update-modal">
          <h2 class="m3-loader-update-title" id="m3-loader-update-title">
            Loader UI need to be updated to run this method
          </h2>
          <p class="m3-loader-update-sub">
            Not updating the loader might have some issue with method it self
          </p>
          <div class="m3-loader-update-meta">
            Installed Loader v${escapeHtmlAttr(currentLoader)} &rarr; Required v${escapeHtmlAttr(requiredLoader)}
          </div>
          <div class="m3-loader-update-actions">
            <button type="button" class="m3-loader-btn-secondary" id="m3-loader-not-now-btn">Not now</button>
            <button type="button" class="m3-loader-btn-primary" id="m3-loader-update-btn">Update</button>
          </div>
        </div>
      `;

      const closeModal = (rememberDismiss) => {
        if (rememberDismiss) {
          try { window.sessionStorage.setItem(dismissKey, '1'); } catch (_) {}
        }
        backdrop.remove();
        document.removeEventListener('keydown', onKeyDown, true);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') closeModal(true);
      };

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal(true);
      });

      const notNowBtn = backdrop.querySelector('#m3-loader-not-now-btn');
      const updateBtn = backdrop.querySelector('#m3-loader-update-btn');

      if (notNowBtn) {
        notNowBtn.addEventListener('click', () => closeModal(true));
      }
      if (updateBtn) {
        updateBtn.addEventListener('click', () => {
          window.open(downloadUrl || LOADER_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
          closeModal(false);
        });
      }

      document.addEventListener('keydown', onKeyDown, true);
      document.body.appendChild(backdrop);
    };

    if (document.body) {
      mount();
    } else {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    }
  };

  const checkLoaderVersionCompatibility = async () => {
    try {
      const requiredLoader = getRequiredLoaderVersion();
      if (!requiredLoader) return;

      const ver = await sendBgMessage({ type: 'GET_VERSIONS' });
      const currentLoader = ver?.loaderVersion ? String(ver.loaderVersion).trim() : '';
      if (!currentLoader) return;

      if (compareVersionStr(currentLoader, requiredLoader) >= 0) return;

      const dismissKey = `fa_loader_update_dismissed_${requiredLoader}`;
      try {
        if (window.sessionStorage.getItem(dismissKey) === '1') return;
      } catch (_) {}

      showLoaderUpdateModal({
        currentLoader,
        requiredLoader,
        downloadUrl: LOADER_DOWNLOAD_URL
      });
    } catch (_) {}
  };
