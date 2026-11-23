/* Fish Acceleration — TikTok Studio Enhancer
 *
 * 1. Force desktop User-Agent (Edge Windows) agar web TikTok Studio tidak redirect.
 * 2. Aktifkan data-tux-color-scheme="dark" untuk mendukung tema Material 3 Dark.
 */
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

  /* --- 1. Override navigator.userAgent / platform (High-Entropy Safe Mock) --- */
  const define = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { configurable: true, get: () => value });
    } catch (e) {
      log('define failed', key, e.message);
    }
  };

  define(navigator, 'userAgent', UA);
  define(navigator, 'platform', PLATFORM);

  if (navigator.userAgentData) {
    const origGetHighEntropyValues = typeof navigator.userAgentData.getHighEntropyValues === 'function'
      ? navigator.userAgentData.getHighEntropyValues.bind(navigator.userAgentData)
      : null;

    const mockUAData = {
      brands: [
        { brand: 'Not A;Brand', version: '99' },
        { brand: 'Chromium', version: '126' },
        { brand: 'Microsoft Edge', version: '126' }
      ],
      platform: PLATFORM,
      mobile: false,
      getHighEntropyValues: async function (hints = []) {
        let orig = {};
        if (origGetHighEntropyValues) {
          try { orig = await origGetHighEntropyValues(hints); } catch (_) {}
        }
        return {
          ...orig,
          platform: 'Windows',
          platformVersion: '10.0.0',
          architecture: 'x86',
          model: '',
          mobile: false,
          brands: [
            { brand: 'Not A;Brand', version: '99' },
            { brand: 'Chromium', version: '126' },
            { brand: 'Microsoft Edge', version: '126' }
          ]
        };
      },
      toJSON: function () {
        return {
          brands: this.brands,
          mobile: this.mobile,
          platform: this.platform
        };
      }
    };

    define(navigator, 'userAgentData', mockUAData);
  }

  log('UA override active:', UA);

  /* --- 2. TUX Dark Color Scheme --- */
  const applyDarkScheme = () => {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-tux-color-scheme', 'dark');
      document.documentElement.style.setProperty('background-color', '#0f1511', 'important');
      document.documentElement.style.setProperty('min-height', '100vh', 'important');
    }
    if (document.body) {
      document.body.style.setProperty('background-color', '#0f1511', 'important');
      document.body.style.setProperty('min-height', '100vh', 'important');
    }
  };

  applyDarkScheme();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDarkScheme, { once: true });
  }

  /* --- 3. Material 3 Floating Navigation Bar --- */
  const SVGS = {
    home: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    posts: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zm-8-2.5l5.5-3.5-5.5-3.5v7z"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z"/></svg>'
  };

  const findSidebarBtn = (label) => {
    const btns = Array.from(document.querySelectorAll('button[data-tt="Sidebar_Sidebar_Clickable"]'));
    return btns.find(b => {
      const txt = (b.innerText || b.textContent || '').trim();
      return txt.toLowerCase().includes(label.toLowerCase());
    });
  };

  const getAvatarSrc = () => {
    const img = document.querySelector('button[data-tt="Header_NewHeader_Clickable"] img');
    return (img && img.src && !img.src.includes('data:image/svg')) ? img.src : null;
  };

  const updateActiveNavItem = () => {
    const nav = document.getElementById('m3-floating-nav');
    if (!nav) return;

    const path = window.location.pathname.toLowerCase();
    let currentId = 'home';

    if (path.includes('/upload')) {
      currentId = 'upload';
    } else if (path.includes('/content') || path.includes('/post')) {
      currentId = 'posts';
    } else if (path.includes('/analytics')) {
      currentId = 'analytics';
    } else if (path === '/tiktokstudio' || path === '/tiktokstudio/') {
      currentId = 'home';
    }

    nav.querySelectorAll('.m3-nav-item').forEach(btn => {
      const id = btn.getAttribute('data-id');
      if (id === currentId && id !== 'upload') {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update avatar image jika belum ada / berubah
    const avatarImg = nav.querySelector('.m3-nav-avatar');
    const newSrc = getAvatarSrc();
    if (newSrc && avatarImg && avatarImg.src !== newSrc) {
      avatarImg.src = newSrc;
    }
  };

  const handleNavClick = (id) => {
    switch (id) {
      case 'home': {
        const homeBtn = findSidebarBtn('Home');
        if (homeBtn) {
          homeBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/';
        }
        break;
      }
      case 'posts': {
        const postsBtn = findSidebarBtn('Posts');
        if (postsBtn) {
          postsBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/content';
        }
        break;
      }
      case 'upload': {
        const uploadBtn = document.querySelector('[data-tt="Sidebar_UploadEntrance_WideButton"]') ||
                          document.querySelector('[data-tt="Sidebar_UploadEntrance_Button"]');
        if (uploadBtn) {
          uploadBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/upload';
        }
        break;
      }
      case 'analytics': {
        const analyticsBtn = findSidebarBtn('Analytics');
        if (analyticsBtn) {
          analyticsBtn.click();
        } else {
          window.location.href = 'https://www.tiktok.com/tiktokstudio/analytics';
        }
        break;
      }
      case 'profile': {
        const avatarBtn = document.querySelector('button[data-tt="Header_NewHeader_Clickable"][aria-haspopup="dialog"]');
        if (avatarBtn) {
          avatarBtn.click();
        }
        break;
      }
    }
    setTimeout(updateActiveNavItem, 150);
  };

  const initFloatingNav = () => {
    if (document.getElementById('m3-floating-nav')) {
      updateActiveNavItem();
      return;
    }

    if (!document.body) return;

    const nav = document.createElement('nav');
    nav.id = 'm3-floating-nav';
    nav.className = 'm3-floating-nav';

    const avatarSrc = getAvatarSrc();

    nav.innerHTML = `
      <button class="m3-nav-item" data-id="home" type="button" aria-label="Home">
        <div class="m3-nav-indicator">${SVGS.home}</div>
        <span class="m3-nav-label">Home</span>
      </button>

      <button class="m3-nav-item" data-id="posts" type="button" aria-label="Posts">
        <div class="m3-nav-indicator">${SVGS.posts}</div>
        <span class="m3-nav-label">Post</span>
      </button>

      <button class="m3-nav-item m3-nav-fab" data-id="upload" type="button" aria-label="Upload">
        <div class="m3-nav-fab-inner">${SVGS.upload}</div>
      </button>

      <button class="m3-nav-item" data-id="analytics" type="button" aria-label="Analytics">
        <div class="m3-nav-indicator">${SVGS.analytics}</div>
        <span class="m3-nav-label">Analytics</span>
      </button>

      <button class="m3-nav-item" data-id="profile" type="button" aria-label="Profile">
        <div class="m3-nav-indicator ${avatarSrc ? 'm3-nav-avatar-indicator' : ''}">
          <img class="m3-nav-avatar" alt="Profile" style="${avatarSrc ? '' : 'display:none'}" />
          <span class="m3-nav-avatar-fallback" style="${avatarSrc ? 'display:none' : 'display:inline-block'}">${SVGS.profile}</span>
        </div>
        <span class="m3-nav-label">Profile</span>
      </button>
    `;

    const avatarImg = nav.querySelector('.m3-nav-avatar');
    const avatarFallback = nav.querySelector('.m3-nav-avatar-fallback');
    if (avatarImg) {
      avatarImg.addEventListener('error', () => {
        avatarImg.style.display = 'none';
        if (avatarFallback) avatarFallback.style.display = 'inline-block';
      });
      if (avatarSrc) avatarImg.src = avatarSrc;
    }

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.m3-nav-item');
      if (btn) {
        const id = btn.getAttribute('data-id');
        handleNavClick(id);
      }
    });

    document.body.appendChild(nav);
    updateActiveNavItem();
  };

  // Jalankan saat load & pantau navigasi SPA
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingNav, { once: true });
  } else {
    initFloatingNav();
  }

  // Pantau URL change lewat unified SPA route bus
  let lastPath = window.location.pathname;
  const syncNavState = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      updateActiveNavItem();
      checkModals();
    }
  };

  onRouteChange(() => {
    updateActiveNavItem();
    syncNavState();
  });

  // Fallback ringan 2000ms hanya untuk memastikan floating nav tetap ada jika React me-remount body
  setInterval(() => {
    if (!document.getElementById('m3-floating-nav')) {
      initFloatingNav();
    }
    syncNavState();
  }, 2000);

  /* --- 4. Auto-Hide Floating Nav saat Modal / Pop-up Terbuka (Zero-Lag Throttled) --- */
  let isModalCurrentlyOpen = false;
  let modalCheckPending = false;

  const isElementVisible = (el) => {
    if (!el || !document.body.contains(el)) return false;
    // Elemen upload dropzone atau upload card bukan modal pop-up!
    if (el.closest('.upload, [class*="upload-stage"], #m3-bypass-upload-card, div[data-e2e="select_video_container"]')) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    if (parseFloat(style.opacity || '1') < 0.1) return false;
    return true;
  };

  /* --- 4b. Auto-Dismiss Tutorial Tooltip: klik "Got it" seketika muncul --- */
  const removeTutorialTooltip = (tip) => {
    // Naik ke pembungkus terluar yang "murni wrapper" (tanpa id, class jsx-* saja,
    // maksimal 2 anak) supaya panah <svg> & padding ikut terhapus.
    let target = tip;
    let cursor = tip.parentElement;
    for (let depth = 0; cursor && cursor !== document.body && depth < 4; depth++) {
      const cls = Array.from(cursor.classList);
      const isPureWrapper = !cursor.id && cls.every(c => /^jsx-/.test(c)) && cursor.children.length <= 2;
      if (!isPureWrapper) break;
      target = cursor;
      cursor = cursor.parentElement;
    }
    target.remove();
  };

  const autoDismissTutorials = () => {
    const tips = document.querySelectorAll('.tutorial-tooltip');
    if (!tips.length) return;
    tips.forEach(tip => {
      // Fallback: kalau tooltip masih ada 5 detik tanpa berhasil diklik, hapus paksa.
      if (!tip.dataset.fishFallback) {
        tip.dataset.fishFallback = '1';
        setTimeout(() => {
          if (tip.isConnected) {
            removeTutorialTooltip(tip);
            log('Tutorial tooltip force-removed (no "Got it" button)');
          }
        }, 5000);
      }

      const btn = tip.querySelector('.tutorial-tooltip__footer button');
      if (!btn) return;
      if (btn.dataset.fishGotIt) return; // sudah pernah diklik, tunggu React unmount
      btn.dataset.fishGotIt = '1';
      try {
        btn.click();
        log('Tutorial tooltip dismissed via "Got it" auto-click');
      } catch (_) {
        removeTutorialTooltip(tip);
      }
    });
  };

  let modalObserver = null;

  const cleanModalWrappers = () => {
    const modalContainers = document.querySelectorAll(
      'div[data-tt="components_Modal_Container"].css-ee0r8k, ' +
      'div[data-tt="components_Modal_Container"]:has(> div[data-tt="components_Modal_ButtonContainer"]), ' +
      'div[data-tt="components_Modal_Container"]:has(> [data-tt="components_Modal_TUXModalTitle"]), ' +
      'div[data-tt="components_Modal_Container"]:has(> ._TUXModalTitle), ' +
      'div[role="dialog"]:not(:has(div[data-tt="components_Modal_Container"])), ' +
      'div[role="alertdialog"]:not(:has(div[data-tt="components_Modal_Container"])), ' +
      '.TUXModal:not(:has(div[data-tt="components_Modal_Container"])), ' +
      '.common-modal:not(:has(div[data-tt="components_Modal_Container"])), ' +
      'div[class*="confirm-modal"]:not(:has(div[data-tt="components_Modal_Container"])), ' +
      'div[class*="delete-modal"]:not(:has(div[data-tt="components_Modal_Container"])), ' +
      'div[class*="ConfirmModal"]:not(:has(div[data-tt="components_Modal_Container"]))'
    );

    modalContainers.forEach(container => {
      // Abaikan floating nav, quality checker modal, atau nested container di dalam modal lain
      if (container.id === 'fish-quality-modal' || container.closest('#m3-floating-nav')) return;
      if (container.parentElement?.closest('div[data-tt="components_Modal_Container"], div[role="dialog"], div[role="alertdialog"], .TUXModal, .common-modal')) return;
      if (container.dataset.fishModalStyled === '1') return;
      container.dataset.fishModalStyled = '1';

      container.style.setProperty('background', 'var(--m3-surface-container, #1a221c)', 'important');
      container.style.setProperty('background-color', 'var(--m3-surface-container, #1a221c)', 'important');
      container.style.setProperty('color', '#f2f7f2', 'important');

      // Bersihkan semua background putih di dalam modal dialog
      container.querySelectorAll('div, section, footer, header, p, span').forEach(el => {
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('background', 'transparent', 'important');
      });

      // Mask / Backdrop (berhenti saat menyentuh overlay/mask layar penuh)
      let p = container.parentElement;
      while (p && p !== document.body) {
        const dt = p.getAttribute('data-tt') || '';
        const isMask = p.classList.contains('TUXModal-mask') ||
          p.classList.contains('common-modal-mask') ||
          dt.includes('Mask') ||
          dt.includes('Backdrop');
        const isOverlay = p.classList.contains('TUXModal-overlay') ||
          dt.includes('Overlay') ||
          window.getComputedStyle(p).position === 'fixed';

        if (isMask) {
          p.style.setProperty('background', 'rgba(0, 0, 0, 0.72)', 'important');
          break;
        }
        if (isOverlay) {
          const hasMask = Boolean(p.querySelector('.TUXModal-mask, .common-modal-mask, [data-tt*="Mask"], [data-tt*="Backdrop"]'));
          if (!hasMask) {
            p.style.setProperty('background', 'rgba(0, 0, 0, 0.72)', 'important');
            p.style.setProperty('pointer-events', 'auto', 'important');
          }
          break;
        }
        p.style.setProperty('background', 'transparent', 'important');
        p.style.setProperty('background-color', 'transparent', 'important');
        p.style.setProperty('box-shadow', 'none', 'important');
        p.style.setProperty('border', 'none', 'important');
        p = p.parentElement;
      }

      // Title & Text
      const titles = container.querySelectorAll('h1, h2, h3, ._TUXModalTitle, [data-tt*="Title"], [class*="title"]');
      titles.forEach(t => t.style.setProperty('color', '#f2f7f2', 'important'));

      const descs = container.querySelectorAll('span, p, [data-tt*="Text"], [class*="desc"]');
      descs.forEach(d => {
        if (!d.closest('button')) d.style.setProperty('color', '#cfdacd', 'important');
      });

      // Tombol Aksi Delete / Confirm (Material 3 Coral Destructive Pill)
      const buttons = Array.from(container.querySelectorAll('button'));
      buttons.forEach(btn => {
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (txt.includes('delete') || txt.includes('hapus') || txt.includes('remove') || txt.includes('discard') || btn.classList.contains('css-y1m958')) {
          btn.style.setProperty('background-color', '#ffb4ab', 'important');
          btn.style.setProperty('background', '#ffb4ab', 'important');
          btn.style.setProperty('color', '#690005', 'important');
          btn.style.setProperty('border', 'none', 'important');
          btn.style.setProperty('border-radius', '9999px', 'important');
          btn.style.setProperty('font-weight', '600', 'important');
          btn.querySelectorAll('*').forEach(c => c.style.setProperty('color', '#690005', 'important'));
        } else if (txt.includes('cancel') || txt.includes('batal') || btn.classList.contains('css-35jbna')) {
          btn.style.setProperty('background-color', 'transparent', 'important');
          btn.style.setProperty('background', 'transparent', 'important');
          btn.style.setProperty('color', '#f2f7f2', 'important');
          btn.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.28)', 'important');
          btn.style.setProperty('border-radius', '9999px', 'important');
          btn.style.setProperty('font-weight', '600', 'important');
          btn.querySelectorAll('*').forEach(c => c.style.setProperty('color', '#f2f7f2', 'important'));
        }
      });
    });

    // Buang mutation records yang dihasilkan oleh inline styling kita sendiri (cegah feedback loop)
    if (modalObserver) {
      modalObserver.takeRecords();
    }
  };

  const checkModals = () => {
    modalCheckPending = false;
    const nav = document.getElementById('m3-floating-nav');
    if (!nav) return;

    // Cari modal tanpa selector CSS :has() agar bebas style/DOM query lag saat popover filter/privacy dibuka
    const rawModals = document.querySelectorAll(
      'div[data-tt="components_Modal_Container"], ' +
      '.common-modal, ' +
      '.common-modal-confirm-modal, ' +
      'div[class*="confirm-modal"]:not(#m3-floating-nav), ' +
      'div[class*="ConfirmModal"]:not(#m3-floating-nav), ' +
      'div[class*="delete-modal"]:not(#m3-floating-nav), ' +
      'div[class*="pickerModal"], ' +
      'div[class*="cover-modal"], ' +
      '.cover-modal-content, ' +
      '#fish-quality-modal-overlay'
    );

    let shouldBeOpen = false;
    for (let i = 0; i < rawModals.length; i++) {
      const el = rawModals[i];
      if (el.getAttribute('data-tt') === 'components_Modal_Container') {
        const isOuterDialog = el.classList.contains('css-ee0r8k') ||
          Boolean(el.querySelector('div[data-tt="components_Modal_ButtonContainer"], ._TUXModalTitle'));
        if (!isOuterDialog) continue;
      }
      if (isElementVisible(el)) {
        shouldBeOpen = true;
        break;
      }
    }

    if (shouldBeOpen === isModalCurrentlyOpen) {
      if (shouldBeOpen) cleanModalWrappers();
      return;
    }
    isModalCurrentlyOpen = shouldBeOpen;

    if (shouldBeOpen) {
      document.body.classList.add('m3-modal-open');
      nav.classList.add('nav-hidden');
      nav.style.setProperty('transform', 'translate(-50%, 200%)', 'important');
      nav.style.setProperty('opacity', '0', 'important');
      nav.style.setProperty('visibility', 'hidden', 'important');
      nav.style.setProperty('pointer-events', 'none', 'important');
      cleanModalWrappers();
    } else {
      document.body.classList.remove('m3-modal-open');
      nav.classList.remove('nav-hidden');
      nav.style.setProperty('transform', 'translateX(-50%)', 'important');
      nav.style.setProperty('opacity', '1', 'important');
      nav.style.setProperty('visibility', 'visible', 'important');
      nav.style.setProperty('pointer-events', 'auto', 'important');
    }
  };

  let _mentionAnchorBound = false;
  const anchorMentionPopovers = () => {
    const popovers = document.querySelectorAll('.mention-list-popover, div[class*="mention-list-popover"]');
    if (!popovers.length) return;

    const editor =
      document.activeElement?.closest?.('.caption-markup, .caption-editor, .DraftEditor-root') ||
      document.querySelector('.public-DraftEditor-content[aria-expanded="true"]')?.closest?.('.caption-markup, .caption-editor, .DraftEditor-root') ||
      document.querySelector('.caption-markup, .caption-editor');
    if (!editor) return;

    const editorRect = editor.getBoundingClientRect();
    if (!editorRect || editorRect.width < 40) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw <= 768;

    popovers.forEach((pop) => {
      const style = window.getComputedStyle(pop);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const targetWidth = isMobile
        ? Math.min(Math.max(editorRect.width, 260), vw - 24)
        : Math.min(Math.max(pop.offsetWidth || 320, 300), vw - 24);
      const left = Math.max(12, Math.min(editorRect.left, vw - targetWidth - 12));

      const rawHeight = pop.scrollHeight || pop.offsetHeight || 200;
      const spaceBelow = vh - editorRect.bottom - 96;
      const spaceAbove = editorRect.top - 16;

      let top;
      let maxH;
      if (spaceBelow >= Math.min(rawHeight, 160) || spaceBelow >= spaceAbove) {
        maxH = Math.max(130, Math.min(280, spaceBelow));
        top = Math.max(12, Math.min(editorRect.bottom + 6, vh - Math.min(rawHeight, maxH) - 92));
      } else {
        maxH = Math.max(130, Math.min(280, spaceAbove));
        const usedH = Math.min(rawHeight, maxH);
        top = Math.max(12, editorRect.top - usedH - 6);
      }

      pop.style.setProperty('position', 'fixed', 'important');
      pop.style.setProperty('left', `${Math.round(left)}px`, 'important');
      pop.style.setProperty('top', `${Math.round(top)}px`, 'important');
      pop.style.setProperty('right', 'auto', 'important');
      pop.style.setProperty('bottom', 'auto', 'important');
      pop.style.setProperty('width', `${Math.round(targetWidth)}px`, 'important');
      pop.style.setProperty('max-height', `${Math.round(maxH)}px`, 'important');
      pop.style.setProperty('transform', 'none', 'important');
      pop.style.setProperty('margin', '0', 'important');
    });

    if (!_mentionAnchorBound) {
      _mentionAnchorBound = true;
      const reanchor = () => requestAnimationFrame(anchorMentionPopovers);
      window.addEventListener('scroll', reanchor, { capture: true, passive: true });
      window.addEventListener('resize', reanchor, { passive: true });
    }

    if (modalObserver) modalObserver.takeRecords();
  };

  let _lastModalSweepAt = 0;
  const MODAL_RELEVANT_RE = /Modal|modal|dialog|confirm|delete|cover|tutorial|mention|pickerModal/i;

  const isNodeModalRelevant = (n) => {
    if (!n || n.nodeType !== 1) return false;
    if (n.id === 'fish-quality-modal-overlay' || n.id === 'fish-quality-modal') return true;
    const cls = typeof n.className === 'string' ? n.className : '';
    const dt = n.getAttribute('data-tt') || '';
    const role = n.getAttribute('role') || '';
    // Abaikan tooltip & popover ringan (Settings menu, filter, privacy)
    if (role === 'tooltip' || dt.includes('Popover') || dt.includes('ActionCell')) return false;
    if (role === 'dialog' || role === 'alertdialog') return true;
    if (MODAL_RELEVANT_RE.test(cls) || MODAL_RELEVANT_RE.test(dt)) return true;
    if (n.firstElementChild && n.querySelector &&
        n.querySelector('[role="dialog"], [role="alertdialog"], [data-tt*="Modal"], .common-modal, .TUXModal, .tutorial-tooltip, .mention-list-popover')) {
      return true;
    }
    return false;
  };

  const isMutationRelevant = (mutations) => {
    if (!Array.isArray(mutations) || !mutations.length) return true;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      if (m.type === 'childList') {
        if (isModalCurrentlyOpen && m.removedNodes.length) {
          for (let j = 0; j < m.removedNodes.length; j++) {
            if (isNodeModalRelevant(m.removedNodes[j])) return true;
          }
        }
        if (m.addedNodes.length) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            if (isNodeModalRelevant(m.addedNodes[j])) return true;
          }
        }
      } else if (m.type === 'attributes') {
        if (isModalCurrentlyOpen) return true;
        if (isNodeModalRelevant(m.target)) return true;
      }
    }
    return false;
  };

  const scheduleCheckModals = (mutations) => {
    if (mutations && !isMutationRelevant(mutations)) return;
    if (modalCheckPending) return;
    const now = performance.now();
    if (now - _lastModalSweepAt < 90) {
      modalCheckPending = true;
      setTimeout(() => {
        modalCheckPending = false;
        _lastModalSweepAt = performance.now();
        autoDismissTutorials();
        checkModals();
        anchorMentionPopovers();
      }, 90);
      return;
    }
    modalCheckPending = true;
    requestAnimationFrame(() => {
      _lastModalSweepAt = performance.now();
      autoDismissTutorials();
      checkModals();
      anchorMentionPopovers();
    });
  };

  modalObserver = new MutationObserver(scheduleCheckModals);

  if (document.body) {
    modalObserver.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] 
    });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      modalObserver.observe(document.body, { 
        childList: true, 
        subtree: true, 
        attributes: true, 
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] 
      });
    });
  }

  /* --- 5. Main World Post Grid & Video Link Handler --- */
  const initMainWorldEnhancements = () => {
    if (window.__fishAccMainWorldActive) return;
    window.__fishAccMainWorldActive = true;

    /* A. Buka Link Video TikTok di Tab Baru saat Thumbnail Diklik */
    const getUsername = (itemData) => {
      try {
        const authorHandle = itemData?.author?.unique_id || itemData?.author?.uniqueId || itemData?.author_unique_id;
        if (authorHandle) return String(authorHandle);
        if (window.__Creator_Center_Context__?.uploadUserProfile?.user?.unique_id) {
          return window.__Creator_Center_Context__.uploadUserProfile.user.unique_id;
        }
        if (window.__Creator_Center_Context__?.commonAppContext?.user?.uniqueId) {
          return window.__Creator_Center_Context__.commonAppContext.user.uniqueId;
        }
      } catch (e) {}

      try {
        const profileLink = document.querySelector('a[href*="/@"]');
        if (profileLink && profileLink.href) {
          const match = profileLink.href.match(/@([^/?#]+)/);
          if (match && match[1]) return match[1];
        }
      } catch (e) {}

      return null;
    };

    const escapeHTML = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const extractStatsFromCard = (card) => {
      if (!card) return { views: '—', likes: '—', comments: '—', engagement: '—' };

      // 1. Selector resmi dari komponen TikTok Studio (FlexRow_6 = Views, 7 = Likes, 8 = Comments)
      const vEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_6"]');
      const lEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_7"]');
      const cEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_8"]');

      const getVal = (el) => {
        if (!el) return '';
        // Cari span teks murni yang tidak memiliki child element
        const leafSpans = Array.from(el.querySelectorAll('span, p, div'))
          .filter(s => s.children.length === 0)
          .map(s => s.textContent.trim())
          .filter(t => /^\d+[\d.,]*[KMBkmb]?$/.test(t));
        if (leafSpans.length > 0) {
          return leafSpans[0];
        }
        const raw = el.textContent.trim();
        const m = raw.match(/\b\d+[\d.,]*[KMBkmb]?\b/);
        return m ? m[0] : '';
      };

      let views = getVal(vEl);
      let likes = getVal(lEl);
      let comments = getVal(cEl);

      // 2. Fallback: cari leaf span terpisah di dalam card jika selector di atas tidak ada
      if (!views || !likes) {
        const allLeafSpans = Array.from(card.querySelectorAll('span'))
          .filter(s => s.children.length === 0)
          .map(s => s.textContent.trim())
          .filter(t => /^\d+[\d.,]*[KMBkmb]?$/.test(t));

        if (allLeafSpans.length >= 3) {
          views = views || allLeafSpans[0];
          likes = likes || allLeafSpans[1];
          comments = comments || allLeafSpans[2];
        }
      }

      views = views || '—';
      likes = likes || '—';
      comments = comments || '—';

      const parseNum = (str) => {
        if (!str || str === '—') return 0;
        let s = str.toUpperCase().replace(/,/g, '');
        let m = 1;
        if (s.endsWith('K')) { m = 1000; s = s.slice(0, -1); }
        else if (s.endsWith('M')) { m = 1000000; s = s.slice(0, -1); }
        else if (s.endsWith('B')) { m = 1000000000; s = s.slice(0, -1); }
        return (parseFloat(s) || 0) * m;
      };

      const vNum = parseNum(views);
      const lNum = parseNum(likes);
      const cNum = parseNum(comments);
      let engStr = '—';
      if (vNum > 0 && (lNum > 0 || cNum > 0)) {
        engStr = (((lNum + cNum) / vNum) * 100).toFixed(2) + '%';
      }

      return { views, likes, comments, engagement: engStr };
    };

    const getTitleFromCard = (card) => {
      if (!card) return 'TikTok Video';
      const titleEl = card.querySelector('[data-tt*="PostInfo"] span, div[data-tt*="PostInfo"] span, .css-1rk2x63 span, span[class*="title"], h1, h2, h3, a');
      if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();
      const allSpans = Array.from(card.querySelectorAll('span')).map(s => s.textContent.trim()).filter(t => t.length > 2 && !/^\d+[\d.,]*[KMBkmb]?$/.test(t) && !t.includes(':') && t !== 'Everyone' && t !== 'Only me' && t !== 'Friends');
      return allSpans[0] || 'TikTok Video';
    };

    const getCoverFromCard = (card) => {
      if (!card) return '';
      const img = card.querySelector('img');
      return img ? img.src : '';
    };

    const getItemDataFromCard = (card) => {
      if (!card) return null;

      // 1. Check React Fiber on card and its descendants
      const candidateEls = [
        card,
        card.querySelector('[data-tt*="VideoCover"]'),
        card.querySelector('[data-tt*="PostInfo"]'),
        card.querySelector('img'),
        card.querySelector('button')
      ].filter(Boolean);

      for (const el of candidateEls) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let f = el[fiberKey];
        let d = 0;
        while (f && d < 35) {
          if (f.memoizedProps) {
            const p = f.memoizedProps;
            const candidate = p.item || p.record || p.videoInfo || p.post || p.row || (p.data && (p.data.id || p.data.item_id) ? p.data : null);
            if (candidate && (candidate.item_id || candidate.id || candidate.desc || candidate.video)) {
              return candidate;
            }
            if (p.id || p.item_id) {
              const mapped = window.__fishPostsMap?.get(String(p.item_id || p.id));
              if (mapped) return mapped;
            }
          }
          f = f.return;
          d++;
        }
      }

      // 2. Match from DOM text / title against __fishPostsMap
      const title = getTitleFromCard(card);
      if (title && window.__fishPostsMap?.has('desc:' + title)) {
        return window.__fishPostsMap.get('desc:' + title);
      }

      // 3. Match from cover image URL against __fishPostsMap
      const imgSrc = getCoverFromCard(card);
      if (imgSrc && window.__fishPostsList?.length) {
        const found = window.__fishPostsList.find(p => {
          const c = p.video?.cover?.url_list?.[0] || p.video?.origin_cover?.url_list?.[0] || p.cover || '';
          return c && imgSrc.includes(c.split('?')[0]);
        });
        if (found) return found;
      }

      // 4. Match by index of card in grid against __fishPostsList
      const allCards = Array.from(document.querySelectorAll('[data-tt="components_RowLayout_FlexRow"]'))
        .filter(r => !r.closest('[data-tt*="Header"]') && !r.querySelector('[data-tt*="Header"]'));
      const cardIdx = allCards.indexOf(card);
      if (cardIdx !== -1 && window.__fishPostsList?.[cardIdx]) {
        return window.__fishPostsList[cardIdx];
      }

      return null;
    };

    const getItemIdFromCard = (card, itemData) => {
      if (itemData?.item_id) return String(itemData.item_id);
      if (itemData?.id) return String(itemData.id);
      if (!card) return null;

      const a = card.querySelector('a[href*="/video/"]');
      if (a && a.href) {
        const match = a.href.match(/\/video\/(\d+)/);
        if (match) return match[1];
      }

      const candidateEls = [card, card.querySelector('img'), card.querySelector('[data-tt*="VideoCover"]')].filter(Boolean);
      for (const el of candidateEls) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let f = el[fiberKey];
        let d = 0;
        while (f && d < 35) {
          if (f.memoizedProps) {
            const p = f.memoizedProps;
            const cid = p.item?.item_id || p.item?.id || p.record?.item_id || p.record?.id || p.videoInfo?.id || p.id || p.item_id;
            if (cid && String(cid).length > 8) return String(cid);
          }
          f = f.return;
          d++;
        }
      }

      const title = getTitleFromCard(card);
      if (title && window.__fishPostsMap?.has('desc:' + title)) {
        const itm = window.__fishPostsMap.get('desc:' + title);
        if (itm?.item_id || itm?.id) return String(itm.item_id || itm.id);
      }

      const allCards = Array.from(document.querySelectorAll('[data-tt="components_RowLayout_FlexRow"]'))
        .filter(r => !r.closest('[data-tt*="Header"]') && !r.querySelector('[data-tt*="Header"]'));
      const idx = allCards.indexOf(card);
      if (idx !== -1 && window.__fishPostsList?.[idx]) {
        const itm = window.__fishPostsList[idx];
        if (itm?.item_id || itm?.id) return String(itm.item_id || itm.id);
      }

      return null;
    };

    const isUndetectedMethodStr = (str) => {
      if (!str || typeof str !== 'string') return true;
      let s = str.trim();
      if (!s || s === '—' || s === '-' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'undetected') return true;
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      if (!s) return true;
      // Filter out internal MP4 atom names & technical box tags
      if (/^(data|stsd|avc1|mp4v|hdlr|meta|mdia|moov|trak|udta|ilst|desc|cmt|vide|soun)$/i.test(s)) return true;
      if (s.startsWith('{') && s.endsWith('}')) return true;
      try {
        if (s.startsWith('{')) { JSON.parse(s); return true; }
      } catch (_) {}
      if (/^(lavf|lavc|ffmpeg|handbrake|libav|x264|x265)/i.test(s)) return true;
      if (/^vid:[a-zA-Z0-9_-]+/i.test(s)) return true;
      if (/^v\d{4,}[a-zA-Z0-9_-]{8,}/i.test(s)) return true;
      if (/^(item_id|video_id|tos_id|aweme_id|music_id|author_id):/i.test(s)) return true;
      if (/^(isom|mp42|dash|iso2|qt|avc1|mp41)$/i.test(s)) return true;
      if (/^\d+$/.test(s)) return true;
      if (!/[a-zA-Z]/.test(s)) return true;
      return false;
    };

    const COUNTRY_NAMES_ID = {
      'ID': 'Indonesia', 'MY': 'Malaysia', 'SG': 'Singapura', 'US': 'Amerika Serikat',
      'TH': 'Thailand', 'VN': 'Vietnam', 'PH': 'Filipina', 'JP': 'Jepang',
      'KR': 'Korea Selatan', 'GB': 'Inggris', 'AU': 'Australia', 'BR': 'Brasil',
      'DE': 'Jerman', 'FR': 'Prancis', 'IN': 'India', 'RU': 'Rusia',
      'CA': 'Kanada', 'MX': 'Meksiko', 'IT': 'Italia', 'ES': 'Spanyol',
      'NL': 'Belanda', 'TR': 'Turki', 'SA': 'Arab Saudi', 'AE': 'Uni Emirat Arab',
      'CN': 'Tiongkok', 'TW': 'Taiwan', 'HK': 'Hong Kong'
    };

    const formatRegion = (code) => {
      if (!code) return '—';
      const upper = String(code).toUpperCase().trim();
      const name = COUNTRY_NAMES_ID[upper];
      return name ? `${name} (${upper})` : upper;
    };

    const formatUploadDate = (epoch) => {
      if (!epoch || isNaN(epoch)) return '—';
      try {
        const d = new Date(Number(epoch) * 1000);
        return d.toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return '—';
      }
    };

    const formatStatNum = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '—';
      try { return new Intl.NumberFormat().format(num); } catch { return String(num); }
    };

    const openQualityCheckerModal = async (itemId, itemData, card) => {
      const existing = document.getElementById('fish-quality-modal-overlay');
      if (existing) existing.remove();

      const username = getUsername(itemData);
      const domStats = extractStatsFromCard(card);
      const displayViews = itemData?.stats?.play_count !== undefined ? formatStatNum(itemData.stats.play_count) : domStats.views;
      const displayLikes = itemData?.stats?.digg_count !== undefined ? formatStatNum(itemData.stats.digg_count) : domStats.likes;
      const displayComments = itemData?.stats?.comment_count !== undefined ? formatStatNum(itemData.stats.comment_count) : domStats.comments;
      const displayShares = itemData?.stats?.share_count !== undefined ? formatStatNum(itemData.stats.share_count) : '—';
      const displaySaves = itemData?.stats?.collect_count !== undefined ? formatStatNum(itemData.stats.collect_count) : '—';
      const displayEngagement = (itemData?.stats?.play_count > 0)
        ? (((Number(itemData.stats.digg_count || 0) + Number(itemData.stats.comment_count || 0) + Number(itemData.stats.share_count || 0) + Number(itemData.stats.collect_count || 0)) / Number(itemData.stats.play_count)) * 100).toFixed(2) + '%'
        : domStats.engagement;

      const pageUrl = itemId
        ? (username ? `https://www.tiktok.com/@${username}/video/${itemId}` : `https://www.tiktok.com/share/video/${itemId}`)
        : null;

      const overlay = document.createElement('div');
      overlay.id = 'fish-quality-modal-overlay';
      overlay.innerHTML = `
        <div id="fish-quality-modal" role="dialog" aria-modal="true">
          <div class="fish-qm-header">
            <div class="fish-qm-title-row">
              <div class="fish-qm-badge-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12H9.5v-2h-2v2H6V9h1.5v2.5h2V9H11v6zm7-1c0 .55-.45 1-1 1h-4c-.55 0-1-.45-1-1V10c0-.55.45-1 1-1h4c.55 0 1 .45 1 1v4zm-1.5-.5v-3h-2.5v3h2.5z"/>
                </svg>
              </div>
              <div class="fish-qm-header-texts">
                <h2 class="fish-qm-title">Quality & Ingest Inspector</h2>
                <span class="fish-qm-subtitle">Live Stream Atom Probe • Independent</span>
              </div>
            </div>
            <button type="button" class="fish-qm-close-btn" id="fish-qm-close" title="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <div class="fish-qm-progress-box" id="fish-qm-progress-box">
            <div class="fish-qm-progress-status-row">
              <span id="fish-qm-progress-text">Connecting to TikTok video stream...</span>
              <span id="fish-qm-progress-pct">15%</span>
            </div>
            <div class="fish-qm-progress-bar-wrap">
              <div class="fish-qm-progress-bar-fill" id="fish-qm-progress-fill" style="width: 15%;"></div>
            </div>
          </div>

          <div class="fish-qm-bento">
            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>
                Resolution
              </span>
              <span class="fish-qm-card-val" id="fish-qm-res"><span class="fish-qm-shimmer">Probing...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-res-sub">Reading video header</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.28-10.43zM10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>
                Framerate
              </span>
              <span class="fish-qm-card-val" id="fish-qm-fps"><span class="fish-qm-shimmer">Measuring...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-fps-sub">Calculating timescale</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
                Bitrate
              </span>
              <span class="fish-qm-card-val" id="fish-qm-bitrate"><span class="fish-qm-shimmer">Calculating...</span></span>
              <span class="fish-qm-card-sub">CDN Stream Ingest</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/></svg>
                File Size
              </span>
              <span class="fish-qm-card-val" id="fish-qm-size"><span class="fish-qm-shimmer">Fetching stream...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-dur-sub">Connecting CDN</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                Region
              </span>
              <span class="fish-qm-card-val" id="fish-qm-region"><span class="fish-qm-shimmer">Detecting...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-region-sub">Server location</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
                Upload Date
              </span>
              <span class="fish-qm-card-val" id="fish-qm-date"><span class="fish-qm-shimmer">Checking...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-date-sub">Video publish time</span>
            </div>

            <div class="fish-qm-card fish-qm-card-wide">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
                Patcher Method
              </span>
              <div class="fish-qm-method-wrap" id="fish-qm-method-wrap">
                <span class="fish-qm-method-val" id="fish-qm-method">Probing...</span>
              </div>
            </div>

            <div class="fish-qm-card fish-qm-card-wide">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                Shadowban Status
              </span>
              <div class="fish-qm-safety-val" id="fish-qm-shadowban">
                <span class="fish-qm-shimmer">Checking...</span>
              </div>
            </div>
          </div>

          <div class="fish-qm-stats-row">
            <div class="fish-qm-stat-chip" id="fish-qm-chip-views">Views: <strong>${escapeHTML(displayViews)}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-likes">Likes: <strong>${escapeHTML(displayLikes)}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-comments">Comments: <strong>${escapeHTML(displayComments)}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-shares">Shares: <strong>${escapeHTML(displayShares)}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-saves">Saves: <strong>${escapeHTML(displaySaves)}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-eng">Engagement: <strong>${escapeHTML(displayEngagement)}</strong></div>
          </div>

          <div class="fish-qm-actions">
            <button type="button" class="fish-qm-btn-subtle" id="fish-qm-copy-stream" style="display:none;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> Copy Stream URL</button>
            <button type="button" class="fish-qm-btn-primary" id="fish-qm-ok-btn">OK</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const closeModal = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
        checkModals();
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') closeModal();
      };
      document.addEventListener('keydown', handleEsc);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      const closeBtn = overlay.querySelector('#fish-qm-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      const okBtn = overlay.querySelector('#fish-qm-ok-btn');
      if (okBtn) okBtn.addEventListener('click', closeModal);

      const updateProgress = (pct, text) => {
        const fill = overlay.querySelector('#fish-qm-progress-fill');
        const textEl = overlay.querySelector('#fish-qm-progress-text');
        const pctEl = overlay.querySelector('#fish-qm-progress-pct');
        if (fill) fill.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (textEl) textEl.textContent = text;
      };

      // Step 1: Resolve stream URL & probe MP4 atoms via extension background worker (CSP & CORS safe)
      updateProgress(25, 'Resolving CDN media stream URL & metadata...');
      let streamUrl = null;
      if (itemData?.video?.play_addr?.url_list?.length) {
        streamUrl = itemData.video.play_addr.url_list[0];
      } else if (itemData?.video?.download_addr?.url_list?.length) {
        streamUrl = itemData.video.download_addr.url_list[0];
      }

      updateProgress(55, 'Probing MP4 stream & atom headers via extension...');
      const probeResult = await probeVideoViaExtension(pageUrl, streamUrl);
      if (probeResult?.error === 'EXTENSION_CONTEXT_INVALIDATED') {
        log('Extension was reloaded — refresh this tab to reconnect stream probe');
      }
      const tikwmData = probeResult?.tikwmData || null;
      if (!streamUrl && probeResult?.streamUrl) {
        streamUrl = probeResult.streamUrl;
      }

      const totalSizeBytes = probeResult?.totalSizeBytes || tikwmData?.size || itemData?.video?.size || 0;
      const atomMeta = probeResult?.atomMeta || null;
      updateProgress(85, 'Decoding timescale, framerate & atom metadata...');

      updateProgress(100, 'Quality & Ingest Analysis Complete!');
      await new Promise(r => setTimeout(r, 350));

      const progressBox = overlay.querySelector('#fish-qm-progress-box');
      if (progressBox) {
        progressBox.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
        progressBox.style.opacity = '0';
        progressBox.style.maxHeight = '0px';
        progressBox.style.marginBottom = '0px';
        progressBox.style.paddingTop = '0px';
        progressBox.style.paddingBottom = '0px';
        progressBox.style.overflow = 'hidden';
        setTimeout(() => { try { progressBox.remove(); } catch (_) {} }, 400);
      }

      // Update UI elements with REAL probed data (ZERO DUMMY DATA)
      const resEl = overlay.querySelector('#fish-qm-res');
      const resSubEl = overlay.querySelector('#fish-qm-res-sub');
      const fpsEl = overlay.querySelector('#fish-qm-fps');
      const fpsSubEl = overlay.querySelector('#fish-qm-fps-sub');
      const bitrateEl = overlay.querySelector('#fish-qm-bitrate');
      const sizeEl = overlay.querySelector('#fish-qm-size');
      const durSubEl = overlay.querySelector('#fish-qm-dur-sub');
      const methodEl = overlay.querySelector('#fish-qm-method');
      const shadowbanEl = overlay.querySelector('#fish-qm-shadowban');
      const copyStreamBtn = overlay.querySelector('#fish-qm-copy-stream');

      if (copyStreamBtn && streamUrl) {
        copyStreamBtn.style.display = 'inline-flex';
        copyStreamBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(streamUrl).then(() => {
            copyStreamBtn.textContent = 'Copied!';
            setTimeout(() => { copyStreamBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> Copy Stream URL'; }, 1200);
          });
        });
      }

      const finalW = atomMeta?.width || itemData?.video?.width || tikwmData?.w || null;
      const finalH = atomMeta?.height || itemData?.video?.height || tikwmData?.h || null;
      const finalFps = atomMeta?.fps || (itemData?.video?.fps ? Math.round(itemData.video.fps) : null);
      const finalDuration = Math.round(atomMeta?.duration || itemData?.video?.duration || tikwmData?.duration || 0);

      // Resolution (No dummy values!)
      if (resEl) {
        if (finalW && finalH) {
          resEl.textContent = `${finalW} × ${finalH}`;
          if (resSubEl) resSubEl.textContent = finalW >= 1080 ? '1080p FHD (9:16 Vertical)' : `${finalW}p HD`;
        } else {
          resEl.textContent = '—';
          if (resSubEl) resSubEl.textContent = 'Stream probe pending';
        }
      }

      // Framerate (No dummy values!)
      if (fpsEl) {
        if (finalFps) {
          fpsEl.textContent = `${finalFps} FPS`;
          if (fpsSubEl) fpsSubEl.textContent = finalFps >= 59 ? 'High Framerate (60 fps)' : `${finalFps} fps Stream`;
        } else {
          fpsEl.textContent = '—';
          if (fpsSubEl) fpsSubEl.textContent = 'Timescale delta pending';
        }
      }

      if (durSubEl && finalDuration) durSubEl.textContent = `Duration: ${finalDuration}s`;

      // File Size
      if (sizeEl) {
        if (totalSizeBytes > 0) {
          sizeEl.textContent = `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
        } else if (itemData?.video?.size) {
          sizeEl.textContent = `${(itemData.video.size / (1024 * 1024)).toFixed(2)} MB`;
        } else {
          sizeEl.textContent = '—';
        }
      }

      // Bitrate
      if (bitrateEl) {
        if (totalSizeBytes > 0 && finalDuration > 0) {
          const bps = (totalSizeBytes * 8) / finalDuration;
          bitrateEl.textContent = bps >= 1000000 ? `${(bps / 1000000).toFixed(2)} Mbps` : `${Math.round(bps / 1000)} kbps`;
        } else if (itemData?.video?.bit_rate || itemData?.video?.bitrate) {
          const bps = itemData.video.bit_rate || itemData.video.bitrate;
          bitrateEl.textContent = bps >= 1000000 ? `${(bps / 1000000).toFixed(2)} Mbps` : `${Math.round(bps / 1000)} kbps`;
        } else {
          bitrateEl.textContent = '—';
        }
      }

      // Patcher Method (Plain text, auto-scroll jika panjang, no hyperbolic badge)
      if (methodEl) {
        let cleanComment = (atomMeta?.comment || '').trim();
        if ((cleanComment.startsWith('"') && cleanComment.endsWith('"')) || (cleanComment.startsWith("'") && cleanComment.endsWith("'"))) {
          cleanComment = cleanComment.slice(1, -1).trim();
        }

        if (!cleanComment || isUndetectedMethodStr(cleanComment)) {
          methodEl.textContent = 'Undetected';
        } else {
          methodEl.textContent = cleanComment;
        }

        const wrap = overlay.querySelector('#fish-qm-method-wrap');
        if (wrap) {
          setTimeout(() => {
            const diff = methodEl.scrollWidth - wrap.clientWidth;
            if (diff > 4) {
              wrap.style.overflowX = 'auto';
              wrap.style.whiteSpace = 'nowrap';
              methodEl.style.display = 'inline-block';
            }
          }, 60);
        }
      }

      // Region
      const regionEl = overlay.querySelector('#fish-qm-region');
      const regionSubEl = overlay.querySelector('#fish-qm-region-sub');
      const rawRegion = tikwmData?.region || itemData?.region || itemData?.video?.region;
      if (regionEl) {
        if (rawRegion) {
          regionEl.textContent = formatRegion(rawRegion);
          if (regionSubEl) regionSubEl.textContent = 'Server location';
        } else {
          regionEl.textContent = '—';
          if (regionSubEl) regionSubEl.textContent = 'Region not available';
        }
      }

      // Upload Date
      const dateEl = overlay.querySelector('#fish-qm-date');
      const dateSubEl = overlay.querySelector('#fish-qm-date-sub');
      const rawEpoch = tikwmData?.create_time || itemData?.create_time || itemData?.createTime;
      if (dateEl) {
        if (rawEpoch) {
          dateEl.textContent = formatUploadDate(rawEpoch);
          if (dateSubEl) dateSubEl.textContent = 'Published timestamp';
        } else {
          dateEl.textContent = '—';
          if (dateSubEl) dateSubEl.textContent = 'Date not available';
        }
      }

      // Live Stats Update (Using exact numbers from TikWM / TikTok API)
      const vCount = tikwmData?.play_count ?? itemData?.stats?.play_count;
      const lCount = tikwmData?.digg_count ?? itemData?.stats?.digg_count;
      const cCount = tikwmData?.comment_count ?? itemData?.stats?.comment_count;
      const sCount = tikwmData?.share_count ?? itemData?.stats?.share_count;
      const svCount = tikwmData?.collect_count ?? itemData?.stats?.collect_count;

      const chipViews = overlay.querySelector('#fish-qm-chip-views');
      const chipLikes = overlay.querySelector('#fish-qm-chip-likes');
      const chipComments = overlay.querySelector('#fish-qm-chip-comments');
      const chipShares = overlay.querySelector('#fish-qm-chip-shares');
      const chipSaves = overlay.querySelector('#fish-qm-chip-saves');
      const chipEng = overlay.querySelector('#fish-qm-chip-eng');

      if (chipViews && vCount !== undefined && vCount !== null) chipViews.innerHTML = `Views: <strong>${escapeHTML(formatStatNum(vCount))}</strong>`;
      if (chipLikes && lCount !== undefined && lCount !== null) chipLikes.innerHTML = `Likes: <strong>${escapeHTML(formatStatNum(lCount))}</strong>`;
      if (chipComments && cCount !== undefined && cCount !== null) chipComments.innerHTML = `Comments: <strong>${escapeHTML(formatStatNum(cCount))}</strong>`;
      if (chipShares && sCount !== undefined && sCount !== null) chipShares.innerHTML = `Shares: <strong>${escapeHTML(formatStatNum(sCount))}</strong>`;
      if (chipSaves && svCount !== undefined && svCount !== null) chipSaves.innerHTML = `Saves: <strong>${escapeHTML(formatStatNum(svCount))}</strong>`;

      if (chipEng) {
        if (vCount && Number(vCount) > 0 && lCount !== undefined && lCount !== null) {
          const totalInteractions = Number(lCount) + Number(cCount || 0) + Number(sCount || 0) + Number(svCount || 0);
          const engPct = ((totalInteractions / Number(vCount)) * 100).toFixed(2);
          chipEng.innerHTML = `Engagement: <strong>${engPct}%</strong>`;
        }
      }

      // Shadowban Status (Cukup 'Safe' atau 'Shadow Banned', no hyperbole)
      if (shadowbanEl) {
        const isRestricted = !!(tikwmData?.is_nff_or_nr || itemData?.is_nff_or_nr || itemData?.status === 2 || itemData?.review_status === 2);
        shadowbanEl.innerHTML = isRestricted
          ? `<span class="fish-qm-status-val warn">Shadow Banned</span>`
          : `<span class="fish-qm-status-val safe">Safe</span>`;
      }
    };

    const isCardPublic = (card) => {
      if (!card) return false;
      const privacyBtn = card.querySelector('button[data-tt="components_PrivacyCell_TUXButton"]') ||
                         card.querySelector('div[data-tt="components_RowLayout_FlexRow_4"] button');
      if (privacyBtn) {
        const label = (privacyBtn.querySelector('.TUXButton-label')?.textContent || privacyBtn.textContent || '')
          .trim()
          .toLowerCase();
        if (label) {
          return /^(everyone|public|semua orang|publik)$/i.test(label);
        }
      }

      const item = getItemDataFromCard(card);
      if (item) {
        if (item.privacy_status !== undefined && item.privacy_status !== null) {
          return Number(item.privacy_status) === 0;
        }
        if (item.visibility !== undefined && item.visibility !== null) {
          return /^(everyone|public)$/i.test(String(item.visibility).trim());
        }
      }
      return false;
    };

    const createCheckQualityButton = (card) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fish-check-btn';
      btn.textContent = 'Check';
      btn.title = 'Check Quality';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const item = getItemDataFromCard(card);
        const itemId = getItemIdFromCard(card, item);
        openQualityCheckerModal(itemId, item, card);
      });
      return btn;
    };

    const injectCheckQualityButtons = () => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return;

      const rows = document.querySelectorAll('div[data-tt="components_RowLayout_FlexRow"]');
      rows.forEach((card) => {
        // Abaikan table header secara mutlak
        if (
          card.closest('[data-tt*="Header"]') || 
          card.querySelector('[data-tt*="Header"]') || 
          card.className.includes('Header') ||
          card.closest('.css-hvkpcx > div:first-child')
        ) {
          return;
        }

        const privacyBtn = card.querySelector('button[data-tt="components_PrivacyCell_TUXButton"]');
        const privacySig = privacyBtn ? (privacyBtn.textContent || '').trim() : '';
        const existingBtn = card.querySelector('.fish-check-btn');
        // Fast-path O(1): lewati React Fiber walk jika teks privasi kartu tidak berubah
        if (card.dataset.fishCqState && card.dataset.fishPrivacySig === privacySig) {
          if (card.dataset.fishCqState === 'priv' && !existingBtn) return;
          if (card.dataset.fishCqState === 'pub' && existingBtn) return;
        }
        card.dataset.fishPrivacySig = privacySig;

        const isPublic = isCardPublic(card);
        if (!isPublic) {
          if (existingBtn) existingBtn.remove();
          card.classList.remove('fish-has-check');
          card.dataset.fishCqState = 'priv';
          return;
        }
        card.classList.add('fish-has-check');
        if (card.dataset.fishCqState === 'pub' && existingBtn) {
          return;
        }
        card.dataset.fishCqState = 'pub';

        // Hapus sisa badge cover lama jika masih tersisa di DOM
        const oldCoverBadge = card.querySelector('.fish-cover-cq-badge');
        if (oldCoverBadge) oldCoverBadge.remove();

        // Tombol Text "Check" di sebelah tombol Settings Gear
        const actionRow = card.querySelector('div[data-tt="components_RowLayout_FlexRow_9"]') || 
                          card.querySelector('div[data-tt="components_ActionCell_FlexRow_7"]') ||
                          card.querySelector('div[data-tt*="ActionCell"]');

        const gearBtn = card.querySelector('button[data-tt="components_ActionCell_Clickable"]') ||
                        card.querySelector('button[aria-label*="More"]') ||
                        card.querySelector('button[data-tt*="more"]');

        const targetContainer = actionRow || (gearBtn ? gearBtn.parentElement : null);

        if (targetContainer && !targetContainer.querySelector('.fish-check-btn')) {
          const checkBtn = createCheckQualityButton(card);

          if (gearBtn && gearBtn.parentElement === targetContainer) {
            try {
              targetContainer.insertBefore(checkBtn, gearBtn);
            } catch (_) {
              try { targetContainer.prepend(checkBtn); } catch (_) {}
            }
          } else {
            try {
              targetContainer.prepend(checkBtn);
            } catch (_) {
              try { targetContainer.appendChild(checkBtn); } catch (_) {}
            }
          }
        } else if (!targetContainer && !card.querySelector('.fish-check-btn')) {
          const lastCell = card.lastElementChild;
          if (lastCell) {
            const btn = createCheckQualityButton(card);
            try {
              lastCell.appendChild(btn);
            } catch (_) {}
          }
        }
      });
    };

    let _injectCheckQualityTimer = null;
    const scheduleInjectCheckQualityButtons = () => {
      if (_injectCheckQualityTimer) return;
      _injectCheckQualityTimer = setTimeout(() => {
        _injectCheckQualityTimer = null;
        injectCheckQualityButtons();
      }, 200);
    };

    const getItemIdFromCover = (cover) => {
      if (!cover) return null;
      const card = cover.closest('[data-tt="components_RowLayout_FlexRow"]');
      if (card) {
        const item = getItemDataFromCard(card);
        const id = getItemIdFromCard(card, item);
        if (id) return { id, item };
      }
      const fallbackId = getItemIdFromCard(cover, null);
      return fallbackId ? { id: fallbackId, item: null } : null;
    };

    const handleVideoCoverClick = (e) => {
      const cover = e.target.closest('[data-tt="VideoCover_index_VideoCoverContainer"]');
      if (!cover) return;

      const resolved = getItemIdFromCover(cover);
      if (!resolved?.id) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const username = getUsername(resolved.item);
      const videoUrl = username
        ? `https://www.tiktok.com/@${username}/video/${resolved.id}`
        : `https://www.tiktok.com/share/video/${resolved.id}`;

      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    };

    window.addEventListener('click', handleVideoCoverClick, true);
    window.addEventListener('auxclick', (e) => {
      if (e.button === 1) handleVideoCoverClick(e);
    }, true);

    /* B. TanStack Virtualizer Post Grid Expander (All Cards 60 FPS GPU-Offloaded & Anti-Stutter / Anti-Jumping) */
    const patchPostGridVirtualizer = () => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return false;

      const scroller = document.querySelector('.css-snthx') || 
                       document.querySelector('[data-tt*="components_PostTable_Container"]');
      if (!scroller) return false;
      if (scroller._fishAccPatched) return true; // Cukup sekali patch! Anti-looping & 100% hemat CPU

      const fiberKey = Object.keys(scroller).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fiberKey) return false;

      let f = scroller[fiberKey];
      let d = 0;
      while (f && d < 30) {
        if (f.memoizedState) {
          let hook = f.memoizedState;
          while (hook) {
            const s = hook.memoizedState;
            if (s && typeof s === 'object' && typeof s.getVirtualItems === 'function' && typeof s.calculateRange === 'function') {
              if (!s._isGridExpanded) {
                s._isGridExpanded = true;
                scroller._fishAccPatched = true;

                const applyRange = (inst) => {
                  inst.calculateRange = function() {
                    const count = this.options ? (this.options.count || 0) : 0;
                    return { startIndex: 0, endIndex: Math.max(0, count - 1) };
                  };
                  inst.scrollToOffset = function() {};
                  inst._scrollToOffset = function() {};
                  inst.scrollBy = function() {};
                  inst.scrollToIndex = function() {};
                  inst._measureElement = function() {};
                  inst.measureElement = function() {};
                  inst.scrollAdjustments = 0;
                };

                applyRange(s);

                // KUNCI ANTI-HANCUR / ANTI-PINDAH-PINDAH: Hook setOptions agar saat batch video baru masuk (load video baru), calculateRange & scroll neutralization TIDAK PERNAH reset ke default!
                if (typeof s.setOptions === 'function') {
                  const origSetOptions = s.setOptions;
                  s.setOptions = function(newOpts) {
                    const r = origSetOptions.call(this, newOpts);
                    applyRange(this);
                    return r;
                  };
                }

                if (typeof s._willUpdate === 'function') s._willUpdate();
                if (typeof s.options.onChange === 'function') s.options.onChange(s);
                else if (typeof s.notify === 'function') s.notify();
                window.__fishAccTanStackPatched = true;
                log('TanStack Virtualizer permanently locked to full range + scroll neutralized (zero-stutter infinite scroll)');
              } else {
                scroller._fishAccPatched = true;
              }

              if (!scroller._cqScrollBound) {
                scroller._cqScrollBound = true;
                scroller.addEventListener('scroll', scheduleInjectCheckQualityButtons, { passive: true });
              }
              injectCheckQualityButtons();
              return true;
            }
            hook = hook.next;
          }
        }
        f = f.return;
        d++;
      }
      return false;
    };

    /* C. Material 3 Dark Matcha Theme Engine untuk ECharts */
    const MATCHA_PRIMARY = '#a3dba7';
    const MATCHA_ACCENT = '#78c67d';
    const MATCHA_SECONDARY = '#c2ecc4';
    const MATCHA_MUTED = '#58975d';
    const TEXT_MUTED = 'rgba(242, 247, 242, 0.72)';
    const BORDER_SUBTLE = 'rgba(255, 255, 255, 0.1)';
    const GRID_LINE = 'rgba(255, 255, 255, 0.06)';

    const transformEChartsOption = (opt) => {
      if (!opt || typeof opt !== 'object') return opt;

      try {
        opt.backgroundColor = 'transparent';

        // X Axis
        if (opt.xAxis) {
          const xAxes = Array.isArray(opt.xAxis) ? opt.xAxis : [opt.xAxis];
          xAxes.forEach(x => {
            if (!x) return;
            x.axisLine = x.axisLine || {};
            x.axisLine.lineStyle = { ...(x.axisLine.lineStyle || {}), color: BORDER_SUBTLE, width: 1 };
            x.axisTick = x.axisTick || {};
            x.axisTick.lineStyle = { ...(x.axisTick.lineStyle || {}), color: BORDER_SUBTLE };
            x.axisLabel = x.axisLabel || {};
            x.axisLabel.color = TEXT_MUTED;
            if (x.splitLine) {
              x.splitLine.lineStyle = { ...(x.splitLine.lineStyle || {}), color: GRID_LINE, type: 'dashed' };
            }
          });
        }

        // Y Axis
        if (opt.yAxis) {
          const yAxes = Array.isArray(opt.yAxis) ? opt.yAxis : [opt.yAxis];
          yAxes.forEach(y => {
            if (!y) return;
            y.axisLine = y.axisLine || {};
            y.axisLine.lineStyle = { ...(y.axisLine.lineStyle || {}), color: BORDER_SUBTLE };
            y.axisLabel = y.axisLabel || {};
            y.axisLabel.color = TEXT_MUTED;
            if (y.splitLine) {
              y.splitLine.lineStyle = { ...(y.splitLine.lineStyle || {}), color: GRID_LINE, type: 'dashed' };
            }
          });
        }

        // Tooltip (Garis bantu axisPointer Matcha, popover HTML diatur via content.css)
        if (opt.tooltip) {
          const tooltips = Array.isArray(opt.tooltip) ? opt.tooltip : [opt.tooltip];
          tooltips.forEach(t => {
            if (!t) return;
            if (t.axisPointer && t.axisPointer.lineStyle) {
              t.axisPointer.lineStyle.color = MATCHA_PRIMARY;
            }
          });
        }

        // Series
        if (opt.series && Array.isArray(opt.series)) {
          const colors = [MATCHA_PRIMARY, MATCHA_SECONDARY, MATCHA_ACCENT, MATCHA_MUTED];
          opt.series.forEach((s, idx) => {
            if (!s) return;
            const strokeColor = colors[idx % colors.length];

            // Line chart
            if (s.type === 'line' || !s.type) {
              s.lineStyle = {
                ...(s.lineStyle || {}),
                color: strokeColor,
                width: 2.5
              };
              s.itemStyle = {
                ...(s.itemStyle || {}),
                color: '#161b17',
                borderColor: strokeColor,
                borderWidth: 2
              };
              if (s.areaStyle) {
                s.areaStyle = {
                  color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: 'rgba(163, 219, 167, 0.35)' },
                      { offset: 0.5, color: 'rgba(163, 219, 167, 0.12)' },
                      { offset: 1, color: 'rgba(163, 219, 167, 0.0)' }
                    ],
                    global: false
                  }
                };
              }
            } else if (s.type === 'bar') {
              s.itemStyle = {
                ...(s.itemStyle || {}),
                color: strokeColor,
                borderRadius: [4, 4, 0, 0]
              };
            }
          });
        }

        // Global Palette
        opt.color = [MATCHA_PRIMARY, MATCHA_SECONDARY, MATCHA_ACCENT, MATCHA_MUTED];
      } catch (err) {
        log('Error transforming ECharts option:', err);
      }

      return opt;
    };

    const patchEChartsPrototype = (instance) => {
      if (!instance) return false;
      const proto = Object.getPrototypeOf(instance);
      if (!proto || proto._isMatchaThemePatched || typeof proto.setOption !== 'function') return false;

      proto._isMatchaThemePatched = true;
      const originalSetOption = proto.setOption;

      proto.setOption = function(option, notMerge, lazyUpdate) {
        const themed = transformEChartsOption(option);
        return originalSetOption.call(this, themed, notMerge, lazyUpdate);
      };

      log('ECharts prototype patched with Material 3 Dark Matcha theme');
      return true;
    };

    const hookGlobalEcharts = () => {
      const hookEc = (ec) => {
        if (!ec || ec._isFishMatchaHooked) return;
        ec._isFishMatchaHooked = true;
        if (typeof ec.init === 'function') {
          const origInit = ec.init;
          ec.init = function (...args) {
            const chart = origInit.apply(this, args);
            if (chart) {
              patchEChartsPrototype(chart);
              setTimeout(() => {
                try {
                  const opt = chart.getOption();
                  if (opt) chart.setOption(transformEChartsOption(opt), true);
                } catch (_) {}
              }, 50);
            }
            return chart;
          };
        }
      };

      if (window.echarts) {
        hookEc(window.echarts);
      } else {
        let _ec = undefined;
        try {
          Object.defineProperty(window, 'echarts', {
            configurable: true,
            enumerable: true,
            get() { return _ec; },
            set(val) {
              _ec = val;
              hookEc(val);
            }
          });
        } catch (_) {}
      }
    };

    hookGlobalEcharts();

    const extractEChartsFromFiber = (el) => {
      if (!el) return null;
      const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fiberKey) return null;
      let f = el[fiberKey];
      let d = 0;
      while (f && d < 30) {
        if (f.stateNode) {
          if (typeof f.stateNode.getEchartsInstance === 'function') {
            try {
              const inst = f.stateNode.getEchartsInstance();
              if (inst && typeof inst.setOption === 'function') return inst;
            } catch (_) {}
          }
          if (f.stateNode.echartsInstance && typeof f.stateNode.echartsInstance.setOption === 'function') {
            return f.stateNode.echartsInstance;
          }
        }
        let hook = f.memoizedState;
        let hSteps = 0;
        while (hook && hSteps < 15) {
          const ms = hook.memoizedState;
          const cand = (ms && typeof ms === 'object' && typeof ms.setOption === 'function' && typeof ms.getOption === 'function')
            ? ms
            : (ms && ms.current && typeof ms.current === 'object' && typeof ms.current.setOption === 'function' && typeof ms.current.getOption === 'function')
              ? ms.current
              : null;
          if (cand) return cand;
          hook = hook.next;
          hSteps++;
        }
        f = f.return;
        d++;
      }
      return null;
    };

    const findEChartsInstances = () => {
      const instances = [];
      const addInst = (inst) => {
        if (inst && typeof inst.setOption === 'function' && !instances.includes(inst)) {
          instances.push(inst);
        }
      };

      if (window.eChartInstances && typeof window.eChartInstances === 'object') {
        Object.values(window.eChartInstances).forEach(addInst);
      }

      const chartElements = document.querySelectorAll(
        '[_echarts_instance_], .echarts-for-react, [data-tt*="Chart"], [data-tt*="chart"], canvas'
      );

      chartElements.forEach((rawEl) => {
        const el = rawEl.tagName === 'CANVAS'
          ? (rawEl.closest('[_echarts_instance_]') || rawEl.parentElement?.parentElement || rawEl.parentElement)
          : rawEl;
        if (!el) return;

        if (window.echarts && typeof window.echarts.getInstanceByDom === 'function') {
          try { addInst(window.echarts.getInstanceByDom(el)); } catch (_) {}
        }
        addInst(extractEChartsFromFiber(el));
      });

      return instances;
    };

    const applyThemeToAllCharts = () => {
      const p = window.location.pathname;
      if (p.includes('/content') || p.includes('/post') || p.includes('/upload')) return;

      const instances = findEChartsInstances();
      instances.forEach((inst) => {
        patchEChartsPrototype(inst);
        try {
          const currentOpt = inst.getOption();
          if (currentOpt) {
            const firstStroke = currentOpt.series?.[0]?.lineStyle?.color;
            const isMatcha = currentOpt.color && currentOpt.color[0] === MATCHA_PRIMARY &&
              (!firstStroke || firstStroke === MATCHA_PRIMARY);
            if (!isMatcha || !inst._hasMatchaThemeApplied) {
              inst._hasMatchaThemeApplied = true;
              inst.setOption(transformEChartsOption(currentOpt), true);
            }
          }
        } catch (e) {
          log('applyThemeToAllCharts error:', e.message);
        }
      });
    };

    let chartObserver = null;
    let chartApplyTimer = null;

    const scheduleApplyThemeToCharts = () => {
      if (chartApplyTimer) return;
      chartApplyTimer = setTimeout(() => {
        chartApplyTimer = null;
        applyThemeToAllCharts();
      }, 120);
    };

    const stopChartObserver = () => {
      if (chartObserver) {
        chartObserver.disconnect();
        chartObserver = null;
      }
      if (chartApplyTimer) {
        clearTimeout(chartApplyTimer);
        chartApplyTimer = null;
      }
    };

    const startChartObserver = () => {
      const p = window.location.pathname;
      if (p.includes('/content') || p.includes('/post') || p.includes('/upload')) {
        stopChartObserver();
        return;
      }
      if (chartObserver || !document.body) return;

      chartObserver = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
          const m = mutations[i];
          if (m.type === 'attributes' && m.attributeName === '_echarts_instance_') {
            scheduleApplyThemeToCharts();
            return;
          }
          if (m.type === 'childList' && m.addedNodes.length) {
            for (let j = 0; j < m.addedNodes.length; j++) {
              const n = m.addedNodes[j];
              if (n && n.nodeType === 1) {
                if (n.tagName === 'CANVAS' || n.hasAttribute?.('_echarts_instance_') ||
                    n.querySelector?.('canvas, [_echarts_instance_]')) {
                  scheduleApplyThemeToCharts();
                  return;
                }
              }
            }
          }
        }
      });

      chartObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['_echarts_instance_']
      });
    };

    if (document.body) {
      startChartObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startChartObserver, { once: true });
    }

    // Initial load checks (hanya beberapa saat awal halaman dibuka)
    [300, 800, 1500, 2800].forEach((delay) => {
      setTimeout(() => {
        applyThemeToAllCharts();
        checkPostGrid();
        injectCheckQualityButtons();
      }, delay);
    });

    let gridObserver = null;
    let gridObserverAttempts = 0;

    const checkPostGrid = () => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return;
      injectCheckQualityButtons();
      const patched = patchPostGridVirtualizer();
      if (patched && gridObserver) {
        gridObserver.disconnect();
        gridObserver = null;
      }
    };

    const startGridObserver = () => {
      if (gridObserver) return;
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return;

      gridObserverAttempts = 0;
      let scheduled = false;

      gridObserver = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          gridObserverAttempts++;
          const patched = patchPostGridVirtualizer();
          if (patched || gridObserverAttempts > 15) {
            if (gridObserver) {
              gridObserver.disconnect();
              gridObserver = null;
            }
          }
        }, 200);
      });

      if (document.body) {
        gridObserver.observe(document.body, { childList: true, subtree: true });
      }
    };

    startGridObserver();

    /* D. Extension Bridge (MAIN <-> ISOLATED world sync & Background Video Probe) */
    const ORIGIN = window.location.origin;
    const _pendingProbes = new Map();
    let _probeSeq = 0;

    const warmMentionWatermark = (wmText) => {
      const wm = typeof wmText === 'string' ? wmText.trim() : '';
      if (!wm) return;
      const lib = window.FRYMention;
      if (lib && typeof lib.warm === 'function') {
        try { lib.warm(wm); } catch (_) {}
      }
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== ORIGIN) return;
      const msg = event.data;
      if (!msg || msg.source !== 'fish-acc-isolated') return;

      if (msg.type === 'FISH_SETTINGS_SYNC') {
        _bypassEnabled = Boolean(msg.enabled);
        _bypassWatermark = typeof msg.watermark === 'string' ? msg.watermark : DEFAULT_WATERMARK;
        warmMentionWatermark(_bypassWatermark);
      } else if (msg.type === 'FISH_PROBE_RESULT' && msg.reqId !== undefined) {
        const resolver = _pendingProbes.get(msg.reqId);
        if (resolver) {
          _pendingProbes.delete(msg.reqId);
          resolver(msg.payload || null);
        }
      }
    });

    // Warm mention cache saat inisialisasi jika watermark sudah diset
    warmMentionWatermark(_bypassWatermark);

    // Minta isolated.js -> background.js melakukan probe TikWM & CDN stream (bebas CSP & CORS)
    const probeVideoViaExtension = (pageUrl, streamUrl) => {
      return new Promise((resolve) => {
        const reqId = ++_probeSeq;
        const timer = setTimeout(() => {
          _pendingProbes.delete(reqId);
          resolve(null);
        }, 15000);

        _pendingProbes.set(reqId, (result) => {
          clearTimeout(timer);
          resolve(result);
        });

        window.postMessage({
          source: 'fish-acc-main',
          type: 'FISH_PROBE_VIDEO',
          reqId,
          pageUrl: pageUrl || null,
          streamUrl: streamUrl || null
        }, ORIGIN);
      });
    };
/**
 * FRY Mention Library  (dulu: "SoundSafe & CoverSafe + FRY 60fps Watermark Hook")
 * ---------------------------------------------------------------------------
 * DIROMBAK: file ini TIDAK lagi memasang hook JSON.stringify / fetch / XHR.
 * Interceptor payload publish kini 100% milik content script (triple-hook di
 * src/content/11-triple-hook-upload.js) supaya caption tidak pernah dobel —
 * watermark tetap bersumber dari kartu Bypass Upload (fish_acc_bypass_watermark).
 *
 * Yang disimpan & dijadikan library: fitur unik SoundSafe, yaitu @mention
 * KLIKABEL — handle pada watermark di-resolve ke UID TikTok asli via API search,
 * lalu triple-hook membangun text_extra + markup <m id="..">@handle</m>.
 *
 * API publik: window.FRYMention
 *   - extractHandles(text)                     → daftar handle @xxx pada teks
 *   - resolve(handle) / resolveMany([...])     → resolve UID (async, ter-cache)
 *   - getCached(handle)                        → baca UID dari cache (sinkron)
 *   - warm(text|array)                         → pre-resolve di background
 *   - buildMentionExtras(existing, text, regionStart, handles)
 *                                              → { extras, spans } utk text_extra
 *   - buildMarkupRegion(regionText, spans, regionStart)
 *                                              → markup region dgn tag <m>
 */
(() => {
  "use strict";

  if (window.FRYMention) return; // Sudah termuat — jangan dobel
  window.__fryMentionLoaded = true;

  // ================= KONFIGURASI =================
  const SEARCH_ENDPOINTS = [
    (h) => '/api/upload/search/user/?aid=1988&keyword=' + encodeURIComponent(h),
    (h) => '/api/search/user/full/?aid=1988&keyword=' + encodeURIComponent(h)
  ];
  // Deteksi OTOMATIS: setiap "@handle" pada watermark = mention orang.
  // Batas handle = karakter non-username (spasi, tanda baca, ✦, dll):
  // "Method from @cutefishaep" → mention "cutefishaep"; "@user <" → mention "user".
  // Lookbehind mencegah email (user@domain.xyz) ikut terdeteksi sebagai mention.
  const HANDLE_REGEX = /(?<![A-Za-z0-9])@([A-Za-z0-9._]{2,24})/g;

  // ================= CACHE UID =================
  const cache = new Map();   // handle(lower) → { uid, secUid, nickname, handle, at }
  const pending = new Map(); // handle(lower) → Promise in-flight

  const normalizeHandle = (h) => String(h || '').replace(/^@/, '').trim();

  function extractHandles(text) {
    const out = [];
    const re = new RegExp(HANDLE_REGEX.source, 'g');
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
      const h = m[1].replace(/[._]+$/, '');
      if (h && out.indexOf(h) === -1) out.push(h);
    }
    return out;
  }

  async function fetchUserInfo(handle) {
    for (const buildUrl of SEARCH_ENDPOINTS) {
      try {
        const res = await fetch(buildUrl(handle), {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) continue;
        const json = await res.json();
        const userList = json?.user_list || json?.data?.user_list || json?.user_list_info || [];
        let found = null;
        for (const item of userList) {
          const u = item?.user_info || item?.user || item;
          if (String(u?.unique_id || u?.uniqueId || '').toLowerCase() === String(handle).toLowerCase()) {
            found = u;
            break;
          }
        }
        if (found) {
          const uid = found.uid || found.user_id || found.id;
          if (!uid) continue;
          return {
            uid: String(uid),
            secUid: String(found.sec_uid || found.secUid || found.sec_user_id || ''),
            nickname: String(found.nickname || found.screen_name || ''),
            handle: String(found.unique_id || found.uniqueId || handle),
            at: Date.now()
          };
        }
      } catch (_) {}
    }
    return null;
  }

  function resolve(handle) {
    const key = normalizeHandle(handle).toLowerCase();
    if (!key) return Promise.resolve(null);
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const p = fetchUserInfo(key)
      .then((info) => {
        pending.delete(key);
        if (info) {
          cache.set(key, info);
          console.info('[FRY Mention] UID resolved:', info.handle, '→', info.uid);
        }
        return info;
      })
      .catch(() => {
        pending.delete(key);
        return null;
      });
    pending.set(key, p);
    return p;
  }

  function resolveMany(handles) {
    const list = (Array.isArray(handles) ? handles : [handles])
      .map(normalizeHandle).filter(Boolean);
    return Promise.all(list.map((h) => resolve(h)));
  }

  // Pre-resolve di background: input bisa berupa teks watermark atau array handle.
  function warm(input) {
    const list = Array.isArray(input)
      ? input.map(normalizeHandle)
      : extractHandles(input);
    list.filter(Boolean).forEach((h) => { try { resolve(h); } catch (_) {} });
  }

  function getCached(handle) {
    return cache.get(normalizeHandle(handle).toLowerCase()) || null;
  }

  // ================= HELPER STRING =================
  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ================= BUILDER text_extra & MARKUP =================
  /**
   * Bangun entri text_extra untuk mention pada watermark.
   * @param {Array} existingExtras - text_extra milik TikTok/user (dipertahankan apa adanya)
   * @param {string} finalText     - teks caption FINAL (watermark sudah ter-append)
   * @param {number} regionStart   - offset awal watermark di finalText
   * @param {Array}  handles       - handle dalam watermark (tanpa @)
   * @returns {{extras: Array, spans: Array}} spans = {handle, mention, start, end, tagId}
   *          Handle yang belum ter-resolve UID-nya dibiarkan jadi teks polos.
   */
  function buildMentionExtras(existingExtras, finalText, regionStart, handles) {
    const extras = (Array.isArray(existingExtras) ? existingExtras : []).slice();
    const used = new Set(extras
      .filter((e) => e && e.tag_id !== undefined && e.tag_id !== null)
      .map((e) => String(e.tag_id)));
    let nextId = 0;
    while (used.has(String(nextId))) nextId++;

    const text = String(finalText || '');
    const start = Math.max(0, Number(regionStart) || 0);
    const spans = [];
    let cursor = start;

    for (const raw of (Array.isArray(handles) ? handles : [])) {
      const h = normalizeHandle(raw);
      if (!h) continue;
      const mention = '@' + h;
      const idx = text.indexOf(mention, cursor);
      if (idx === -1 || idx < start) continue;
      const info = cache.get(h.toLowerCase());
      if (!info || !info.uid) continue; // belum resolve → biarkan teks polos
      const entry = {
        start: idx,
        end: idx + mention.length,
        user_id: String(info.uid),
        type: 0,
        hashtag_name: h,
        tag_id: String(nextId)
      };
      if (info.secUid) entry.sec_uid = String(info.secUid);
      used.add(String(nextId));
      nextId++;
      extras.push(entry);
      spans.push({ handle: h, mention, start: idx, end: entry.end, tagId: entry.tag_id });
      cursor = entry.end;
    }
    return { extras, spans };
  }

  /**
   * Render region watermark sebagai markup: teks di-luar mention di-escape apa
   * adanya, substring mention diganti <m id="tagId">@handle</m> (klikabel).
   * Offset spans bersifat absolut pada caption final; regionStart memotongnya.
   */
  function buildMarkupRegion(regionText, spans, regionStart) {
    const region = String(regionText || '');
    const base = Math.max(0, Number(regionStart) || 0);
    const list = (Array.isArray(spans) ? spans : [])
      .filter((s) => s && s.start >= base && s.end <= base + region.length)
      .sort((a, b) => a.start - b.start);

    let out = '';
    let cursor = 0;
    for (const s of list) {
      const rel = s.start - base;
      if (rel < cursor) continue; // overlap guard
      out += escapeHtml(region.slice(cursor, rel));
      out += '<m id="' + escapeAttr(s.tagId) + '">' + escapeHtml(s.mention) + '</m>';
      cursor = rel + s.mention.length;
    }
    out += escapeHtml(region.slice(cursor));
    return out;
  }

  // ================= EKSPOS API =================
  window.FRYMention = {
    version: '1.0',
    extractHandles,
    resolve,
    resolveMany,
    warm,
    getCached,
    buildMentionExtras,
    buildMarkupRegion,
    get cacheSize() { return cache.size; }
  };

  console.info('[FRY Mention] Library ready — resolver @mention klikabel (tanpa hook jaringan).');
})();

    // =========================================================================
    // Triple-Hook Upload Flag Interception (JSON.stringify + Fetch + XHR)
    // Diadaptasi dari SAMPLE untuk menjamin flags cloud edit & anti-downscale
    // terinjeksi 100% pada semua payload publish TikTok Studio
    // =========================================================================
    const POST_PATH_REGEX = /(?:\/project\/post|\/publish\/|\/aweme\/v1\/create|\/item\/create)/i;
    const EXACT_PROJECT_POST = 'tiktok/web/project/post/v1/';
    const BLOCKED_POST_REGEX = /(?:\/music\/|\/sound\/|[?&]music_id=)/i;

    const isPostPublishRequest = (url) => {
      if (typeof url !== 'string') return false;
      if (url.includes(EXACT_PROJECT_POST)) return true;
      if (BLOCKED_POST_REGEX.test(url)) return false;
      return POST_PATH_REGEX.test(url);
    };

    const isPostPayload = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      return (
        Array.isArray(payload.single_post_req_list) ||
        Array.isArray(payload.item_list) ||
        Array.isArray(payload.text_extra) ||
        Boolean(payload.single_post_feature_info) ||
        Boolean(payload.post_common_info) ||
        Boolean(payload.item_common_info) ||
        Boolean(payload.item_info) ||
        Boolean(payload.publish_info) ||
        Boolean(payload.post_info) ||
        Boolean(payload.enter_post)
      );
    };

    const normalizeUploadPayloadFlags = (payload) => {
      if (!payload || typeof payload !== 'object') return false;
      let changed = false;

      const remove = (obj, key) => {
        if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
          delete obj[key];
          changed = true;
        }
      };

      const setIfDifferent = (obj, key, val) => {
        if (obj && obj[key] !== val) {
          obj[key] = val;
          changed = true;
        }
      };

      // 1. Hapus pemicu kompresi server TikTok yang memaksa re-encode
      ['draft', 'canvas_config', 'vedit_segment_info'].forEach((key) => remove(payload, key));

      // 2. Injeksi bypass flags level root
      setIfDifferent(payload, 'cloud_edit_is_use_video_canvas', false);
      setIfDifferent(payload, 'psg_vsp_aud', true);
      setIfDifferent(payload, 'is_high_quality', true);
      setIfDifferent(payload, 'high_quality_video', 1);
      setIfDifferent(payload, 'disable_auto_bitrate', true);

      if (Object.prototype.hasOwnProperty.call(payload, 'enter_post_page_from')) {
        setIfDifferent(payload, 'enter_post_page_from', 1);
      }

      // 3. Post common info
      if (payload.post_common_info && typeof payload.post_common_info === 'object') {
        setIfDifferent(payload.post_common_info, 'post_type', 3);
        setIfDifferent(payload.post_common_info, 'enter_post_page_from', 1);
        setIfDifferent(payload.post_common_info, 'psg_vsp_aud', true);
        setIfDifferent(payload.post_common_info, 'is_high_quality', true);
      }

      // 4. Feature common info list
      if (Array.isArray(payload.feature_common_info_list)) {
        for (const item of payload.feature_common_info_list) {
          const vedit = item?.vedit_common_info;
          if (!vedit || typeof vedit !== 'object') continue;
          remove(vedit, 'tiktok_snap_shot_lite_params');
          if (Object.prototype.hasOwnProperty.call(vedit, 'application')) {
            setIfDifferent(vedit, 'application', 1);
          }
        }
      }

      // 5. Single post req list (detail per video post)
      if (Array.isArray(payload.single_post_req_list)) {
        for (const req of payload.single_post_req_list) {
          if (!req || typeof req !== 'object') continue;
          setIfDifferent(req, 'psg_vsp_aud', true);

          const info = req.single_post_feature_info;
          if (!info || typeof info !== 'object') continue;

          remove(info, 'vedit_segment_info');
          setIfDifferent(info, 'cloud_edit_is_use_video_canvas', false);
          setIfDifferent(info, 'has_original_audio', 1);
          setIfDifferent(info, 'psg_vsp_aud', true);
          setIfDifferent(info, 'video_quality_score', 1.0);
          setIfDifferent(info, 'is_high_quality', true);
          setIfDifferent(info, 'is_high_quality_video', 1);
          setIfDifferent(info, 'upload_high_quality', true);
          setIfDifferent(info, 'disable_auto_bitrate', true);
          setIfDifferent(info, 'video_fps', 144);
          setIfDifferent(info, 'source_fps', 144);

          if (info.music_info && typeof info.music_info === 'object') {
            if (!info.music_info.music_id_string && info.music_info.id) {
              info.music_info.music_id_string = String(info.music_info.id);
              changed = true;
            }
          }
        }
      }

      // 6. Injeksi atau Bersihkan Watermark pada Caption (+ @mention klikabel via FRYMention)
      // Jika watermark dikosongkan oleh user, caption bersih tanpa titik & tanpa geser ke bawah
      const wm = getBypassWatermark();
      const cleanWm = (typeof wm === 'string') ? wm.trim() : '';

      // window.FRYMention (asset/engines/soundsafe-hook.js) = library resolver @mention.
      // Guard legacy: jika soundsafe versi LAMA (masih memasang hook JSON/fetch/XHR sendiri)
      // terdeteksi, JANGAN injek watermark kartu — biarkan hook legacy bekerja (anti dobel).
      const mentionLib = window.FRYMention;
      const legacySoundSafe = Boolean(window.__soundSafeCoverSafeHooked) && !mentionLib;

      // Handle pada watermark yang dijadikan mention klikabel (UID asli dari API TikTok)
      const wmHandles = (cleanWm && mentionLib && !legacySoundSafe)
        ? mentionLib.extractHandles(cleanWm)
        : [];
      // Riwayat handle yang pernah di-tag: untuk membuka tag <m> watermark LAMA saat user
      // mengganti isi watermark (markup lama tidak boleh menumpuk)
      const taggedHandleHistory = new Set();
      if (wmHandles.length && mentionLib) {
        wmHandles.forEach((h) => taggedHandleHistory.add(h.toLowerCase()));
        try { mentionLib.warm(cleanWm); } catch (_) {} // resolve UID di background
      }

      const stripWatermark = (text) => {
        if (typeof text !== 'string') return '';
        let res = text;
        // Buka balik tag <m id="..">@handle</m> milik watermark kita (watermark lama)
        // menjadi teks polos, agar regex pembersih di bawah bisa mencocokkannya.
        if (taggedHandleHistory.size) {
          taggedHandleHistory.forEach((h) => {
            const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            res = res.replace(new RegExp('<m[^>]*>\\s*@' + esc + '\\s*<\\/m>', 'gi'), '@' + h);
          });
        }
        if (cleanWm) {
          const escaped = cleanWm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          res = res.replace(new RegExp('(?:\\r?\\n\\s*\\.\\s*|\\r?\\n\\s*\\n\\s*)?' + escaped + '$', 'i'), '');
        }
        res = res
          .replace(/(?:\r?\n\s*\.\s*)[^\r\n]*$/g, '')
          .replace(/(?:\r?\n\s*\.\s*|\r?\n\s*\n\s*)?(?:Method (?:from|by)|✦ Ekstension by)[^\r\n]*/gi, '')
          .trimEnd();
        return res;
      };

      const formatCaptionWithWatermark = (originalText) => {
        const base = stripWatermark(originalText);
        if (!cleanWm || legacySoundSafe) return base; // KOSONG / LEGACY: caption asli user saja
        return base ? (base + '\n.\n' + cleanWm) : cleanWm;
      };

      const captionKeys = ['caption', 'desc', 'description', 'title', 'text', 'markup_text'];

      // Terapkan watermark + mention klikabel pada satu node payload (info/req/root).
      // IDEMPOTEN: extras & tag <m> milik watermark lama dibersihkan dulu lalu dibangun
      // ulang dengan offset & tag_id yang sama → aman dipanggil berulang pada payload
      // yang sama (JSON.stringify → fetch → XHR, tiga lapis interceptor yang sama).
      const applyCaptionToNode = (node) => {
        if (!node || typeof node !== 'object') return false;
        let touched = false;

        captionKeys.forEach((k) => {
          if (typeof node[k] === 'string') {
            const nextVal = formatCaptionWithWatermark(node[k]);
            if (node[k] !== nextVal) {
              node[k] = nextVal;
              touched = true;
            }
          }
        });

        if (!mentionLib) return touched;

        const plain = (typeof node.text === 'string' && node.text) ? node.text
          : (typeof node.caption === 'string' && node.caption) ? node.caption : '';
        if (!plain) return touched;

        const base = stripWatermark(plain);
        const wmStart = base ? base.length + 3 : 0; // 3 = panjang separator '\n.\n'

        // Buang text_extra LAMA milik watermark: region [wmStart..] adalah 100% milik
        // kita (di-append oleh formatCaption), jadi SEMUA entri mention (type 0) yang
        // menunjuk ke sana pasti sisa pasangan kami sebelumnya — termasuk dari watermark
        // LAMA yang sudah diganti/dikosongkan. Entri asli TikTok/user selalu berada di
        // bawah wmStart sehingga tidak tersentuh.
        const sourceExtras = (Array.isArray(node.text_extra) ? node.text_extra : []);
        const existingExtras = sourceExtras.filter((e) => {
          if (!e || Number(e.type) !== 0) return true;
          const start = Number(e.start);
          const end = Number(e.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start < wmStart) return true;
          return false; // di dalam region watermark = punya kita → rebuild
        });
        if (existingExtras.length !== sourceExtras.length) {
          node.text_extra = existingExtras;
          touched = true;
        }

        if (!wmHandles.length) return touched;

        const built = mentionLib.buildMentionExtras(existingExtras, plain, wmStart, wmHandles);
        if (!built.spans.length) return touched;

        if (nativeStringify(node.text_extra || []) !== nativeStringify(built.extras)) {
          node.text_extra = built.extras;
          touched = true;
        }

        // markup_text: ganti suffix watermark polos dengan versi tag <m> (klikabel)
        const currentMarkup = (typeof node.markup_text === 'string') ? node.markup_text : plain;
        if (currentMarkup.endsWith(cleanWm)) {
          const head = currentMarkup.slice(0, currentMarkup.length - cleanWm.length);
          const upgraded = head + mentionLib.buildMarkupRegion(cleanWm, built.spans, wmStart);
          if (node.markup_text !== upgraded) {
            node.markup_text = upgraded;
            touched = true;
          }
        }
        return touched;
      };

      if (Array.isArray(payload.single_post_req_list)) {
        for (const req of payload.single_post_req_list) {
          const info = req?.single_post_feature_info;
          if (info && typeof info === 'object') {
            changed = applyCaptionToNode(info) || changed;
          }
          changed = applyCaptionToNode(req) || changed;
        }
      }

      changed = applyCaptionToNode(payload) || changed;

      return changed;
    };

    // Snapshot cover/thumbnail agar integritas gambar sampul TikTok tetap aman
    const patchPostPayload = (payload) => {
      if (!isPostPayload(payload)) return false;
      const mediaSnapshot = [];
      const snapshot = (node, seen = new WeakSet()) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
          node.forEach((item) => snapshot(item, seen));
          return;
        }
        for (const key of Object.keys(node)) {
          const value = node[key];
          if (/(?:^|_)(?:cover|thumbnail|poster)(?:_|$)/i.test(key)) {
            let copy = value;
            try { copy = JSON.parse(nativeStringify(value)); } catch (_) {}
            mediaSnapshot.push({ owner: node, key, value: copy });
            continue;
          }
          if (value && typeof value === 'object') snapshot(value, seen);
        }
      };

      snapshot(payload);
      let changed = normalizeUploadPayloadFlags(payload);

      for (const item of mediaSnapshot) {
        let next = item.value;
        try { next = JSON.parse(nativeStringify(item.value)); } catch (_) {}
        if (nativeStringify(item.owner[item.key]) !== nativeStringify(next)) {
          item.owner[item.key] = next;
          changed = true;
        }
      }

      return changed;
    };

    const patchBodyString = (body) => {
      if (typeof body !== 'string' || !body) return body;
      try {
        const parsed = JSON.parse(body);
        if (patchPostPayload(parsed)) {
          return nativeStringify(parsed);
        }
      } catch (_) {}
      return body;
    };

    // 1. Hook JSON.stringify (Hanya aktif di halaman upload/edit agar nol overhead di halaman lain)
    const nativeStringify = JSON.stringify;
    JSON.stringify = function (value, replacer, space) {
      try {
        if (value && typeof value === 'object' && isBypassUploadEnabled()) {
          const p = window.location.pathname;
          if (p.includes('/upload') || p.includes('/edit')) {
            patchPostPayload(value);
          }
        }
      } catch (_) {}
      return nativeStringify.call(this, value, replacer, space);
    };

    const isPostListEndpoint = (url) => {
      if (typeof url !== 'string') return false;
      return /(?:\/item\/|\/content\/|\/post\/|\/creator\/|\/aweme\/)/i.test(url);
    };

    // 2. Hook window.fetch
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      try {
        if (isBypassUploadEnabled() && isPostPublishRequest(url)) {
          if (typeof init.body === 'string') {
            init = { ...init, body: patchBodyString(init.body) };
            log('⚡ 1:1 High Quality Flags injected into fetch payload');
          } else if (typeof Request !== 'undefined' && input instanceof Request) {
            const bodyText = await input.clone().text();
            if (bodyText) {
              input = new Request(input, { body: patchBodyString(bodyText) });
              log('⚡ 1:1 High Quality Flags injected into Request stream');
            }
          }
        }
      } catch (err) {
        log('fetch intercept error:', err.message);
      }

      const response = await origFetch.call(this, input, init);

      try {
        if (isPostListEndpoint(url)) {
          response.clone().json().then(json => {
            extractAndStorePosts(json);
          }).catch(() => {});
        }
      } catch (_) {}

      return response;
    };

    // 3. Hook XMLHttpRequest
    const xhrProto = XMLHttpRequest.prototype;
    const origXhrOpen = xhrProto.open;
    const origXhrSend = xhrProto.send;

    xhrProto.open = function (method, url) {
      this.__fishAccUrl = url;
      return origXhrOpen.apply(this, arguments);
    };

    xhrProto.send = function (body) {
      try {
        if (isBypassUploadEnabled() && isPostPublishRequest(this.__fishAccUrl) && typeof body === 'string') {
          body = patchBodyString(body);
          log('⚡ 1:1 High Quality Flags injected into XHR payload');
        }
      } catch (err) {
        log('xhr intercept error:', err.message);
      }

      try {
        if (isPostListEndpoint(this.__fishAccUrl)) {
          this.addEventListener('load', function () {
            try {
              if (this.responseText && this.responseText.startsWith('{')) {
                const json = JSON.parse(this.responseText);
                extractAndStorePosts(json);
              }
            } catch (_) {}
          });
        }
      } catch (_) {}

      return origXhrSend.call(this, body);
    };

    // Pantau route change via unified SPA bus (tanpa double-hook history atau interval duplikat)
    onRouteChange(() => {
      setTimeout(applyThemeToAllCharts, 300);
      setTimeout(checkPostGrid, 250);
      setTimeout(injectCheckQualityButtons, 300);
      startChartObserver();
      startGridObserver();
    });

    // Pastikan tombol Check Quality tetap muncul saat tabel post render/berubah privasi
    // HANYA bereaksi pada mutasi di dalam PostTable (abaikan total popover/tooltip/menu di body)
    let _cqNavObserverScheduled = false;
    const cqObserver = new MutationObserver((mutations) => {
      const p = window.location.pathname;
      if (!p.includes('/content') && !p.includes('/post')) return;
      if (_cqNavObserverScheduled) return;

      let relevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const t = m.target;
        const el = t && t.nodeType === 1 ? t : t?.parentElement;
        if (!el) continue;
        if (el.closest('[role="tooltip"], .TUXPopover-popover, .Dropdown__content, [data-tt*="Popover"], [data-tt*="ActionCell"], #m3-floating-nav, #fish-quality-modal-overlay')) {
          continue;
        }
        // Hanya relevan jika mutasi terjadi di dalam PostTable atau menambahkan PostTable/RowLayout baru
        if (el.closest('[data-tt="components_PostTable_Container"]')) {
          relevant = true;
          break;
        }
        if (m.type === 'childList' && m.addedNodes.length) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const n = m.addedNodes[j];
            if (n && n.nodeType === 1) {
              const dt = n.getAttribute('data-tt') || '';
              if (dt.includes('PostTable') || dt.includes('RowLayout') ||
                  (n.querySelector && n.querySelector('[data-tt="components_RowLayout_FlexRow"]'))) {
                relevant = true;
                break;
              }
            }
          }
          if (relevant) break;
        }
      }
      if (!relevant) return;

      _cqNavObserverScheduled = true;
      setTimeout(() => {
        _cqNavObserverScheduled = false;
        injectCheckQualityButtons();
      }, 250);
    });
    if (document.body) {
      cqObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        cqObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
      }, { once: true });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        findEChartsInstances().forEach(inst => {
          try { inst.resize(); } catch (e) {}
        });
      }, 150);
    });
  };

  // Jalankan langsung di MAIN world (sudah diatur via manifest.json: "world": "MAIN")
  initMainWorldEnhancements();
})();
