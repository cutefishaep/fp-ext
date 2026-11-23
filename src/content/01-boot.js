(() => {
  'use strict';

  // STRICT GUARD: Hanya aktif di TikTok Studio (/tiktokstudio*) atau /upload*, JANGAN sentuh consumer page
  const _bootPath = window.location.pathname;
  if (!_bootPath.startsWith('/tiktokstudio') && !_bootPath.startsWith('/upload')) {
    return;
  }

  /* --- 0. React & DOM Reconciliation Safeguard ---
   * Protect against React 18 / Tux crashing with NotFoundError:
   * "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
   * when foreign DOM elements (buttons, modals, cards) are inserted or re-rendered.
   */
  if (typeof Node === 'function' && Node.prototype) {
    const origInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (newNode, refNode) {
      if (refNode && refNode.parentNode !== this) {
        return this.appendChild(newNode);
      }
      return origInsertBefore.call(this, newNode, refNode);
    };

    const origRemoveChild = Node.prototype.removeChild;
    Node.prototype.removeChild = function (child) {
      if (child && child.parentNode !== this) {
        if (child.parentNode) {
          try { return child.parentNode.removeChild(child); } catch (_) {}
        }
        return child;
      }
      return origRemoveChild.call(this, child);
    };
  }

  const LOG = '[fish-acc]';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
  const PLATFORM = 'Windows';

  const log = (...args) => console.log(LOG, ...args);

  // Unified SPA Route-Change Bus (single history hook across all MAIN world modules)
  const _routeListeners = new Set();
  const onRouteChange = (fn) => {
    if (typeof fn === 'function') _routeListeners.add(fn);
  };
  const notifyRouteChange = () => {
    _routeListeners.forEach((fn) => {
      try { fn(); } catch (_) {}
    });
  };
  if (!window.__fishAccHistoryHooked) {
    window.__fishAccHistoryHooked = true;
    ['pushState', 'replaceState'].forEach((method) => {
      const original = history[method];
      if (typeof original === 'function') {
        history[method] = function (...args) {
          const result = original.apply(this, args);
          setTimeout(notifyRouteChange, 100);
          return result;
        };
      }
    });
    window.addEventListener('popstate', () => setTimeout(notifyRouteChange, 100));
  }

  // Settings cache (disinkronkan oleh isolated.js dari chrome.storage.local)
  const DEFAULT_WATERMARK = 'Method from @cutefishaep';
  let _bypassEnabled = document.documentElement?.dataset?.fishBypassEnabled !== 'false';
  let _bypassWatermark = document.documentElement?.dataset?.fishBypassWatermark ?? DEFAULT_WATERMARK;
  const isBypassUploadEnabled = () => _bypassEnabled;
  const getBypassWatermark = () => _bypassWatermark;

  // Global TikTok Post & Video Cache
  window.__fishPostsMap = window.__fishPostsMap || new Map();
  window.__fishPostsList = window.__fishPostsList || [];

  const extractAndStorePosts = (json) => {
    if (!json || typeof json !== 'object') return;
    
    // Cari array list item dari berbagai struktur respon TikTok Studio API
    const findItems = (obj, depth = 0) => {
      if (!obj || depth > 4 || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) {
        if (obj.length > 0 && obj.some(x => x && (x.item_id || x.id || x.aweme_id || (x.video && (x.video.play_addr || x.video.download_addr))))) {
          return obj;
        }
        return null;
      }
      const directCandidates = [
        obj.item_list, obj.itemList, obj.items, obj.aweme_list, obj.post_list,
        obj.data?.item_list, obj.data?.itemList, obj.data?.items, obj.data?.aweme_list,
        obj.data?.data?.item_list, obj.data?.data?.items
      ];
      for (const cand of directCandidates) {
        if (Array.isArray(cand) && cand.length > 0) return cand;
      }
      for (const key of Object.keys(obj)) {
        if (obj[key] && typeof obj[key] === 'object') {
          const res = findItems(obj[key], depth + 1);
          if (res) return res;
        }
      }
      return null;
    };

    const list = findItems(json);
    if (Array.isArray(list) && list.length > 0) {
      list.forEach(item => {
        if (!item) return;
        const id = item.item_id || item.id || item.itemId || item.aweme_id;
        if (id) {
          window.__fishPostsMap.set(String(id), item);
        }
        if (item.desc) {
          window.__fishPostsMap.set('desc:' + item.desc.trim(), item);
        }
        if (item.title) {
          window.__fishPostsMap.set('title:' + item.title.trim(), item);
        }
      });

      if (!window.__fishPostsList || window.__fishPostsList.length === 0) {
        window.__fishPostsList = list;
      } else {
        const idSet = new Set(window.__fishPostsList.map(x => String(x.item_id || x.id || x.aweme_id)));
        list.forEach(it => {
          const cid = String(it.item_id || it.id || it.aweme_id);
          if (!idSet.has(cid)) {
            window.__fishPostsList.push(it);
            idSet.add(cid);
          }
        });
      }
      log(`📦 Cached ${list.length} TikTok Studio posts (Total: ${window.__fishPostsList.length})`);
    }
  };

