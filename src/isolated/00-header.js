/* Fish Acceleration — Extension Isolated World (Local MP4 Engines, Storage & Handover) */
(() => {
  'use strict';

  const _path = window.location.pathname;
  if (!_path.startsWith('/tiktokstudio') && !_path.startsWith('/upload')) {
    return;
  }

  const LOG = '[fish-acc]';
  const log = (...args) => console.log(LOG, ...args);
