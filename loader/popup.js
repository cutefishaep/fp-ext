'use strict';

(() => {
  const STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/content';
  const manifest = chrome.runtime.getManifest();
  const versionPill = document.getElementById('version-pill');
  const loaderVersionEl = document.getElementById('loader-version');
  if (loaderVersionEl) loaderVersionEl.textContent = `Loader v${manifest.version}`;
  if (versionPill) versionPill.textContent = 'Core —';

  chrome.runtime.sendMessage({ type: 'GET_VERSIONS' }, (v) => {
    if (v?.coreVersion && versionPill) versionPill.textContent = `Core v${v.coreVersion}`;
    if (v?.loaderVersion && loaderVersionEl) loaderVersionEl.textContent = `Loader v${v.loaderVersion}`;
  });

  const statusBox = document.getElementById('status-box');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const progressMeta = document.getElementById('progress-meta');
  const progressDetail = document.getElementById('progress-detail');
  const progressPct = document.getElementById('progress-pct');
  const progressTrack = document.getElementById('progress-track');
  const progressBar = document.getElementById('progress-bar');
  const warningNote = document.getElementById('warning-note');
  const warningQuestion = document.getElementById('warning-question');
  const userScriptsMockup = document.getElementById('user-scripts-mockup');
  const shaBox = document.getElementById('sha-box');
  const actionsEl = document.getElementById('actions');

  const clearExtras = () => {
    statusBox.classList.remove('is-error');
    warningNote.classList.add('hidden');
    warningQuestion.classList.add('hidden');
    if (userScriptsMockup) {
      userScriptsMockup.classList.add('hidden');
      userScriptsMockup.innerHTML = '';
    }
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

  const openStudio = (bypassed = false) => {
    chrome.runtime.sendMessage({ type: 'OPEN_VERIFIED_STUDIO', url: STUDIO_URL, bypassed }, () => {
      window.close();
    });
  };

  const renderChecking = () => {
    clearExtras();
    progressMeta.classList.remove('hidden');
    progressTrack.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressPct.textContent = '0%';
    progressDetail.textContent = 'Starting...';
    statusTitle.textContent = 'Checking for updates...';
    statusDesc.textContent = 'Fetching latest Core from GitHub Releases...';
  };

  const renderResult = (res) => {
    clearExtras();
    progressMeta.classList.add('hidden');
    progressTrack.classList.add('hidden');

    if (res?.status === 'user_scripts_disabled') {
      statusTitle.textContent = 'Enable User Scripts';
      statusDesc.textContent =
        'Open Extension Details and turn on "Allow User Scripts", then click Retry.';
      if (userScriptsMockup) {
        userScriptsMockup.innerHTML =
          '<img class="m3-mock-img" src="assets/allow-user-scripts.png" alt="Enable Allow User Scripts in Chrome Extension Details" />';
        userScriptsMockup.classList.remove('hidden');
      }
      addButton('Open Details', 'm3-btn-secondary', () => {
        chrome.tabs.create({ url: `chrome://extensions/?id=${res.extensionId || chrome.runtime.id}` });
      });
      addButton('Retry', 'm3-btn-primary', runCheck);
      return;
    }

    if (!res || res.status === 'offline') {
      statusTitle.textContent = 'Unable to reach GitHub';
      statusDesc.textContent = res?.error || 'Could not connect to GitHub Releases. Please try again.';
      addButton('Retry', 'm3-btn-primary', runCheck);
      addButton('Close', 'm3-btn-secondary', () => window.close());
      return;
    }

    if (res.status === 'sha_mismatch') {
      const ver = res.latestVersion || res.currentVersion || 'unknown';
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
      addButton("I don't care about that", 'm3-btn-danger', () => openStudio(true));
      return;
    }

    if (res.status === 'updated') {
      const ver = res.latestVersion || res.currentVersion;
      if (versionPill && ver) versionPill.textContent = `Core v${ver}`;
      statusTitle.textContent = `Core updated to v${ver}`;
      statusDesc.textContent = 'Live Core (JS, CSS & config) fetched from GitHub and verified (SHA-256).';
      if (res.coreSha256) {
        shaBox.innerHTML = `<span class="m3-sha-label">SHA-256:</span> ${res.coreSha256}`;
        shaBox.classList.remove('hidden');
      }
      addButton('Check Again', 'm3-btn-secondary', runCheck);
      addButton('Open TikTok Studio', 'm3-btn-primary', () => openStudio(false));
      return;
    }

    if (versionPill && res.currentVersion) versionPill.textContent = `Core v${res.currentVersion}`;
    statusTitle.textContent = 'Up to date';
    statusDesc.textContent = `Core v${res.currentVersion} is verified and ready.`;
    if (res.coreSha256) {
      shaBox.innerHTML = `<span class="m3-sha-label">SHA-256:</span> ${res.coreSha256}`;
      shaBox.classList.remove('hidden');
    }
    addButton('Check Again', 'm3-btn-secondary', runCheck);
    addButton('Open TikTok Studio', 'm3-btn-primary', () => openStudio(false));
  };

  function runCheck() {
    renderChecking();
    const port = chrome.runtime.connect({ name: 'fa-update-check' });
    port.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'progress') {
        const pct = Math.max(0, Math.min(100, Number(msg.percent) || 0));
        if (msg.title) statusTitle.textContent = msg.title;
        if (msg.detail) progressDetail.textContent = msg.detail;
        progressPct.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
      } else if (msg.type === 'result') {
        progressBar.style.width = '100%';
        progressPct.textContent = '100%';
        try { port.disconnect(); } catch (_) {}
        renderResult(msg.data);
      }
    });
    port.postMessage({ type: 'START' });
  }

  runCheck();
})();
