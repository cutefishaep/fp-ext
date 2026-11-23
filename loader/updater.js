'use strict';

(() => {
  const DEFAULT_STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/content';
  const params = new URLSearchParams(window.location.search);
  const rawTarget = params.get('target') || DEFAULT_STUDIO_URL;

  const isSafeTarget = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && /(?:^|\.)tiktok\.com$/i.test(u.hostname);
    } catch {
      return false;
    }
  };
  const targetUrl = isSafeTarget(rawTarget) ? rawTarget : DEFAULT_STUDIO_URL;

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

  const proceedToStudio = (bypassed = false) => {
    chrome.runtime.sendMessage({ type: 'APPROVE_SESSION', bypassed }, () => {
      window.location.replace(targetUrl);
    });
  };

  const closeCurrentTab = () => {
    chrome.tabs?.getCurrent?.((tab) => {
      if (tab?.id) {
        chrome.tabs.remove(tab.id);
      } else {
        window.close();
      }
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
    statusDesc.textContent = 'Fetching latest Core from GitHub Releases and verifying SHA-256...';
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
      addButton('Open Extension Details', 'm3-btn-secondary', () => {
        chrome.tabs.create({ url: `chrome://extensions/?id=${res.extensionId || chrome.runtime.id}` });
      });
      addButton('Retry', 'm3-btn-primary', runGate);
      return;
    }

    if (!res || res.status === 'offline') {
      statusTitle.textContent = 'Unable to verify update';
      statusDesc.textContent = res?.error || 'Could not connect to GitHub Releases. Please check your connection and retry.';
      addButton('Close', 'm3-btn-secondary', closeCurrentTab);
      addButton('Retry', 'm3-btn-primary', runGate);
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
      if (Array.isArray(res.mismatchedFiles) && res.mismatchedFiles.length) {
        const filesRow = document.createElement('div');
        filesRow.innerHTML = `<span class="m3-sha-label">File(s):</span> ${res.mismatchedFiles.join(', ')}`;
        shaBox.appendChild(filesRow);
      }
      shaBox.classList.remove('hidden');

      addButton('Close', 'm3-btn-secondary', closeCurrentTab);
      addButton("I don't care about that", 'm3-btn-danger', () => proceedToStudio(true));
      return;
    }

    if (res.status === 'updated') {
      const ver = res.latestVersion || res.currentVersion;
      if (versionPill && ver) versionPill.textContent = `Core v${ver}`;
      statusTitle.textContent = `Core updated to v${ver}`;
      statusDesc.textContent = 'SHA-256 verified. Opening TikTok Studio...';
      setTimeout(() => proceedToStudio(false), 300);
      return;
    }

    if (versionPill && res.currentVersion) versionPill.textContent = `Core v${res.currentVersion}`;
    statusTitle.textContent = 'Verified';
    statusDesc.textContent = `Core v${res.currentVersion} matches SHA-256. Opening TikTok Studio...`;
    setTimeout(() => proceedToStudio(false), 250);
  };

  function runGate() {
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

  runGate();
})();
