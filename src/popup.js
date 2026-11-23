'use strict';

(() => {
  const STUDIO_URL = 'https://www.tiktok.com/tiktokstudio/content';
  const manifest = chrome.runtime.getManifest();
  const versionPill = document.getElementById('version-pill');
  const loaderVersionEl = document.getElementById('loader-version');
  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const userScriptsMockup = document.getElementById('user-scripts-mockup');
  const actionsEl = document.getElementById('actions');

  if (loaderVersionEl) loaderVersionEl.textContent = 'Core';
  if (versionPill) versionPill.textContent = `Core v${manifest.version}`;

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
    chrome.runtime.sendMessage({ type: 'OPEN_VERIFIED_STUDIO', url: STUDIO_URL, bypassed: true }, () => {
      if (chrome.runtime.lastError) {
        chrome.tabs.create({ url: STUDIO_URL });
      }
      window.close();
    });
  };

  const showEnableUserScripts = () => {
    if (statusTitle) statusTitle.textContent = 'Enable User Scripts';
    if (statusDesc) {
      statusDesc.textContent = 'Open Extension Details and turn on "Allow User Scripts", then click Retry.';
    }
    if (userScriptsMockup) {
      userScriptsMockup.innerHTML =
        '<img class="m3-mock-img" src="assets/allow-user-scripts.png" alt="Enable Allow User Scripts in Chrome Extension Details" />';
      userScriptsMockup.classList.remove('hidden');
    }
    if (actionsEl) actionsEl.innerHTML = '';
    addButton('Open Details', 'm3-btn-secondary', () => {
      chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    });
    addButton('Retry', 'm3-btn-primary', bootCorePopup);
  };

  function bootCorePopup() {
    try {
      if (typeof chrome.userScripts !== 'undefined' && typeof chrome.userScripts.getScripts === 'function') {
        chrome.userScripts.getScripts({}, () => {
          if (chrome.runtime.lastError) {
            showEnableUserScripts();
          } else {
            openStudio();
          }
        });
        return;
      }
    } catch (_) {}
    openStudio();
  }

  bootCorePopup();
})();
