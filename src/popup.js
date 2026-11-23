'use strict';

(() => {
  const STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/content';
  const manifest = chrome.runtime.getManifest();
  const versionPill = document.getElementById('version-pill');
  const statusBox = document.getElementById('status-box');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const progressTrack = document.getElementById('progress-track');
  const warningNote = document.getElementById('warning-note');
  const warningQuestion = document.getElementById('warning-question');
  const shaBox = document.getElementById('sha-box');
  const actionsEl = document.getElementById('actions');

  if (versionPill) versionPill.textContent = `v${manifest.version}`;

  const clearExtras = () => {
    statusBox.classList.remove('is-error');
    warningNote.classList.add('hidden');
    warningQuestion.classList.add('hidden');
    shaBox.classList.add('hidden');
    shaBox.innerHTML = '';
    actionsEl.innerHTML = '';
  };

  const addButton = (label, variant, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `m3-btn ${variant}`;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    actionsEl.appendChild(btn);
    return btn;
  };

  const openStudio = () => {
    chrome.tabs.create({ url: STUDIO_URL });
    window.close();
  };

  const renderChecking = () => {
    clearExtras();
    progressTrack.classList.remove('hidden');
    statusTitle.textContent = 'Checking for updates...';
    statusDesc.textContent = 'Downloading release metadata and verifying SHA-256.';
  };

  const renderResult = (res) => {
    clearExtras();
    progressTrack.classList.add('hidden');

    if (!res || res.status === 'offline') {
      statusTitle.textContent = 'Unable to reach GitHub';
      statusDesc.textContent = res?.error || 'Could not connect to GitHub Releases. Please try again.';
      addButton('Retry', 'm3-btn-primary', runCheck);
      addButton('Close', 'm3-btn-secondary', () => window.close());
      return;
    }

    if (res.status === 'sha_mismatch') {
      const ver = res.latestVersion || res.currentVersion || manifest.version;
      statusBox.classList.add('is-error');
      statusTitle.textContent = `SHA-256 Mismatch (v${ver})`;
      statusDesc.textContent = `The SHA-256 hash for version v${ver} does not match the official GitHub Release.`;

      warningNote.textContent =
        'A SHA-256 difference can occur if this extension\'s files have been modified. Please make sure you downloaded this extension from the official source.';
      warningNote.classList.remove('hidden');

      warningQuestion.textContent = 'Do you want to continue with this update?';
      warningQuestion.classList.remove('hidden');

      const expRow = document.createElement('div');
      expRow.innerHTML = `<span class="m3-sha-label">Expected:</span> ${res.expectedSha || 'N/A'}`;
      const actRow = document.createElement('div');
      actRow.innerHTML = `<span class="m3-sha-label">Actual:</span> ${res.actualSha || 'N/A'}`;
      shaBox.appendChild(expRow);
      shaBox.appendChild(actRow);
      shaBox.classList.remove('hidden');

      addButton('Close', 'm3-btn-secondary', () => window.close());
      addButton("I don't care about that", 'm3-btn-danger', () => {
        chrome.runtime.sendMessage({ type: 'APPROVE_SESSION', bypassed: true }, () => {
          openStudio();
        });
      });
      return;
    }

    if (res.status === 'update_available') {
      statusTitle.textContent = `Update available: v${res.latestVersion}`;
      statusDesc.textContent = 'SHA-256 verified. Downloading update package...';
      if (res.downloadUrl) {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_VERIFIED_ZIP',
          url: res.downloadUrl,
          filename: res.zipName
        }, (dlRes) => {
          if (dlRes?.ok) {
            statusDesc.textContent = `Downloaded ${res.zipName || 'update ZIP'}. Extract it and reload in chrome://extensions.`;
          } else {
            statusDesc.textContent = 'Verified. Click Download Update to save the ZIP package.';
          }
        });
      }
      if (res.packageSha256) {
        shaBox.innerHTML = `<span class="m3-sha-label">SHA-256:</span> ${res.packageSha256}`;
        shaBox.classList.remove('hidden');
      }
      addButton('Download Again', 'm3-btn-secondary', () => {
        if (res.downloadUrl) {
          chrome.runtime.sendMessage({ type: 'DOWNLOAD_VERIFIED_ZIP', url: res.downloadUrl, filename: res.zipName });
        }
      });
      addButton('Open TikTok Studio', 'm3-btn-primary', () => {
        chrome.runtime.sendMessage({ type: 'APPROVE_SESSION', bypassed: false }, openStudio);
      });
      return;
    }

    statusTitle.textContent = 'Up to date';
    statusDesc.textContent = `Version v${res.currentVersion} is verified and ready.`;
    if (res.packageSha256) {
      shaBox.innerHTML = `<span class="m3-sha-label">SHA-256:</span> ${res.packageSha256}`;
      shaBox.classList.remove('hidden');
    }
    addButton('Check Again', 'm3-btn-secondary', runCheck);
    addButton('Open TikTok Studio', 'm3-btn-primary', () => {
      chrome.runtime.sendMessage({ type: 'APPROVE_SESSION', bypassed: false }, openStudio);
    });
  };

  function runCheck() {
    renderChecking();
    chrome.runtime.sendMessage({ type: 'CHECK_AND_VERIFY_UPDATE' }, renderResult);
  }

  runCheck();
})();
