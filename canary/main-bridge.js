'use strict';

(() => {
  if (window.__fishCanaryMainInjected) return;
  window.__fishCanaryMainInjected = true;

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('content.js');
  s.async = false;
  s.onload = () => {
    try { s.remove(); } catch (_) {}
  };
  (document.head || document.documentElement).appendChild(s);
})();
