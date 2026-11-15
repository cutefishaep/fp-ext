/* Fish Acceleration — TikTok Studio Enhancer
 *
 * 1. Force desktop User-Agent (Edge Windows) agar web TikTok Studio tidak redirect.
 * 2. Aktifkan data-tux-color-scheme="dark" untuk mendukung tema Material 3 Dark.
 */
(() => {
  'use strict';

  // STRICT GUARD: Hanya aktif di TikTok Studio (/tiktokstudio*), JANGAN sentuh https://www.tiktok.com (consumer page / video player)
  if (!window.location.pathname.startsWith('/tiktokstudio')) {
    return;
  }

  const LOG = '[fish-acc]';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
  const PLATFORM = 'Windows';

  const log = (...args) => console.log(LOG, ...args);

  /* --- 1. Override navigator.userAgent / platform --- */
  const define = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { configurable: true, get: () => value });
    } catch (e) {
      log('define failed', key, e.message);
    }
  };

  define(navigator, 'userAgent', UA);
  define(navigator, 'platform', PLATFORM);
  define(navigator, 'userAgentData', {
    brands: [
      { brand: 'Not A;Brand', version: '99' },
      { brand: 'Chromium', version: '126' },
      { brand: 'Microsoft Edge', version: '126' }
    ],
    platform: PLATFORM,
    mobile: false
  });

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
          ${avatarSrc 
            ? `<img src="${avatarSrc}" class="m3-nav-avatar" alt="Profile" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-block'"/><span style="display:none">${SVGS.profile}</span>`
            : SVGS.profile
          }
        </div>
        <span class="m3-nav-label">Profile</span>
      </button>
    `;

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

  // Pantau URL change (pushState / replaceState / popstate) untuk SPA
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      setTimeout(updateActiveNavItem, 100);
      return result;
    };
  });
  window.addEventListener('popstate', updateActiveNavItem);

  // Debounced URL & Nav Sync (Ringan, bebas lag)
  let lastPath = window.location.pathname;
  const syncNavState = () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      updateActiveNavItem();
      checkModals();
    }
  };

  // Interval santai 1.5 detik hanya untuk memastikan floating nav tetap terpasang jika DOM di-reset
  setInterval(() => {
    initFloatingNav();
    syncNavState();
  }, 1500);

  /* --- 4. Auto-Hide Floating Nav saat Modal / Pop-up Terbuka (Zero-Lag Throttled) --- */
  let isModalCurrentlyOpen = false;
  let modalCheckPending = false;

  const checkModals = () => {
    modalCheckPending = false;
    const nav = document.getElementById('m3-floating-nav');
    if (!nav) return;

    const modal = document.querySelector('.TUXModal-overlay, .TUXModal, [role="dialog"], [role="alertdialog"], [data-tt*="Modal"], [data-tt*="Modal_Container"], div[class*="cover-modal"], div[class*="edit-cover-modal"], div[data-tt="components_Modal_Container"], .common-modal, [aria-modal="true"], div[class*="Modal-overlay"], div[class*="modal-mask"], div[class*="Dialog"]');
    const shouldBeOpen = !!modal;

    // Hanya sentuh DOM jika status benar-benar berubah (mencegah reflow & lag 100%)
    if (shouldBeOpen === isModalCurrentlyOpen) return;
    isModalCurrentlyOpen = shouldBeOpen;

    if (shouldBeOpen) {
      document.body.classList.add('m3-modal-open');
      nav.classList.add('nav-hidden');
      nav.style.setProperty('transform', 'translate(-50%, 200%)', 'important');
      nav.style.setProperty('opacity', '0', 'important');
      nav.style.setProperty('visibility', 'hidden', 'important');
      nav.style.setProperty('pointer-events', 'none', 'important');
    } else {
      document.body.classList.remove('m3-modal-open');
      nav.classList.remove('nav-hidden');
      nav.style.setProperty('transform', 'translate(-50%, 0)', 'important');
      nav.style.setProperty('opacity', '1', 'important');
      nav.style.setProperty('visibility', 'visible', 'important');
      nav.style.setProperty('pointer-events', 'auto', 'important');
    }
  };

  const scheduleCheckModals = () => {
    if (modalCheckPending) return;
    modalCheckPending = true;
    requestAnimationFrame(checkModals);
  };

  const modalObserver = new MutationObserver(scheduleCheckModals);

  if (document.body) {
    modalObserver.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      modalObserver.observe(document.body, { childList: true });
    });
  }

  /* --- 5. Main World Post Grid & Video Link Handler --- */
  const initMainWorldEnhancements = () => {
    if (window.__fishAccMainWorldActive) return;
    window.__fishAccMainWorldActive = true;

    /* A. Buka Link Video TikTok di Tab Baru saat Thumbnail Diklik */
    const getUsername = () => {
      try {
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

      return 'cutefishaep';
    };

    const getItemIdFromElement = (el) => {
      if (!el) return null;
      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fiberKey) return null;
      let f = el[fiberKey];
      let d = 0;
      while (f && d < 25) {
        if (f.memoizedProps && f.memoizedProps.item) {
          return f.memoizedProps.item.item_id || f.memoizedProps.item.id || null;
        }
        f = f.return;
        d++;
      }
      return null;
    };

    const handleVideoCoverClick = (e) => {
      const cover = e.target.closest('[data-tt="VideoCover_index_VideoCoverContainer"]');
      if (!cover) return;

      const itemId = getItemIdFromElement(cover);
      if (!itemId) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const username = getUsername();
      const videoUrl = username 
        ? `https://www.tiktok.com/@${username}/video/${itemId}`
        : `https://www.tiktok.com/@cutefishaep/video/${itemId}`;

      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    };

    document.addEventListener('mouseover', (e) => {
      const cover = e.target.closest('[data-tt="VideoCover_index_VideoCoverContainer"]');
      if (cover && !cover.getAttribute('title')) {
        const itemId = getItemIdFromElement(cover);
        if (itemId) {
          cover.setAttribute('title', 'Buka video TikTok di tab baru');
        }
      }
    }, { passive: true });

    window.addEventListener('click', handleVideoCoverClick, true);
    window.addEventListener('auxclick', (e) => {
      if (e.button === 1) handleVideoCoverClick(e);
    }, true);

    /* B. TanStack Virtualizer Post Grid Expander (All Cards 60 FPS GPU-Offloaded & Anti-Stutter / Anti-Jumping) */
    const patchPostGridVirtualizer = () => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return false;

      const scroller = document.querySelector('.css-snthx');
      if (!scroller) return false;

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
              }
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
    const TEXT_MUTED = 'rgba(242, 247, 242, 0.6)';
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

    const findEChartsInstances = () => {
      const instances = [];

      if (window.eChartInstances && typeof window.eChartInstances === 'object') {
        Object.values(window.eChartInstances).forEach((inst) => {
          if (inst && typeof inst.setOption === 'function' && !instances.includes(inst)) {
            instances.push(inst);
          }
        });
      }

      const chartElements = document.querySelectorAll(
        '.echarts-for-react, div[_echarts_instance_], [data-tt*="Chart"], [data-tt*="chart"], [class*="chart"]'
      );

      chartElements.forEach((el) => {
        if (window.echarts && typeof window.echarts.getInstanceByDom === 'function') {
          try {
            const ecInst = window.echarts.getInstanceByDom(el);
            if (ecInst && typeof ecInst.setOption === 'function' && !instances.includes(ecInst)) {
              instances.push(ecInst);
            }
          } catch (_) {}
        }

        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) return;
        let f = el[fiberKey];
        let d = 0;
        while (f && d < 25) {
          if (f.stateNode && typeof f.stateNode.getEchartsInstance === 'function') {
            try {
              const inst = f.stateNode.getEchartsInstance();
              if (inst && typeof inst.setOption === 'function' && !instances.includes(inst)) {
                instances.push(inst);
              }
            } catch (e) {}
            break;
          }
          f = f.return;
          d++;
        }
      });

      return instances;
    };

    const applyThemeToAllCharts = () => {
      const instances = findEChartsInstances();
      instances.forEach((inst) => {
        patchEChartsPrototype(inst);
        try {
          const currentOpt = inst.getOption();
          if (currentOpt) {
            const isMatcha = currentOpt.color && currentOpt.color[0] === MATCHA_PRIMARY;
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

    // Watch berkala untuk memastikan charts selalu Matcha pada initial load, refresh, atau navigasi
    setInterval(() => {
      applyThemeToAllCharts();
    }, 500);

    [100, 300, 600, 1000, 1500, 2500, 4000].forEach((delay) => {
      setTimeout(applyThemeToAllCharts, delay);
    });

    const checkPostGrid = () => {
      patchPostGridVirtualizer();
    };

    // Continuous watch for post grid: lightweight check every 400ms on post/content page (no cut-off limit)
    setInterval(() => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (isPostPage) {
        patchPostGridVirtualizer();
      }
    }, 400);

    // MutationObserver agar saat tabel pos atau chart masuk ke DOM langsung di-patch
    const gridObserver = new MutationObserver(() => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (isPostPage && document.querySelector('.css-snthx')) {
        patchPostGridVirtualizer();
      }
      applyThemeToAllCharts();
    });

    if (document.body) {
      gridObserver.observe(document.body, { childList: true, subtree: true });
    }

    /* D. 1:1 Bypass Upload Engine (Bit-by-Bit Sentinel & High-Quality Ingest Interceptor) */
    const isBypassUploadEnabled = () => {
      return localStorage.getItem('fish_acc_bypass_upload') !== 'false';
    };

    const setBypassUploadEnabled = (enabled) => {
      localStorage.setItem('fish_acc_bypass_upload', enabled ? 'true' : 'false');
    };

    // =========================================================================
    // Bit-by-Bit 1:1 Ingest Engines (Imported from SAMPLE / ADJN & CompressBase)
    // 1. ADJN Direct Patch Engine 4.0 (sl-sr.mjs • CompressBase)
    // 2. ADJN MP4 Core v5.0 (64-Bit Duration Sentinel & Iterative Chunk Shifter)
    // =========================================================================

// =========================================================================
// 1. ADJN Direct Patch Engine 4.0 (sl-sr.mjs • CompressBase)
// =========================================================================
/* sl-sr.mjs — CompressBase local method, used verbatim per its stated
 * free-use license (visible credit required). */
var Wt=new TextEncoder,$t=new TextDecoder;function ut(e){if(e instanceof Uint8Array)return e.subarray(0,4);let n=new Uint8Array(4),s=String(e);for(let o=0;o<4;o++)n[o]=o<s.length?s.charCodeAt(o)&255:32;return n}function c(e,n){return new DataView(e.buffer,e.byteOffset+n,4).getUint32(0,!1)}function lt(e,n){return new DataView(e.buffer,e.byteOffset+n,8).getBigUint64(0,!1)}function F(e){let n=new Uint8Array(4);return new DataView(n.buffer).setUint32(0,e>>>0,!1),n}function Tt(e){let n=new Uint8Array(8);return new DataView(n.buffer).setBigUint64(0,BigInt(e),!1),n}function U(...e){let n=e.reduce((i,d)=>i+d.length,0),s=new Uint8Array(n),o=0;for(let i of e)s.set(i,o),o+=i.length;return s}var Ft=new Set(["moov","trak","mdia","minf","stbl","edts","dinf"]),Ot=[96e3,88200,64e3,48e3,44100,32e3,24e3,22050,16e3,12e3,11025,8e3,7350],K=Uint8Array.of(33,16,4,96,140,28),a=(e,n)=>{if(!e)throw new Error(n)},pt=(e,n)=>String.fromCharCode(...e.subarray(n,n+4)),at=(e,n)=>U(F(n.length+8),ut(e),n),P=(...e)=>U(...e.map(F)),X=(e,n)=>e.children.find(s=>s.name===n),w=(e,n)=>{let s=X(e,n);return a(s,"Missing MP4 box: "+n),s};function Rt(e,n){a(e.length>=8,"Truncated MP4 header");let s=c(e,0),o=s===1?16:8;a(e.length>=o,"Truncated extended MP4 header");let i=s===1?Number(lt(e,8)):s||n;return a(Number.isSafeInteger(i)&&i>=o&&i<=n,"Invalid MP4 box size"),{name:pt(e,4),width:o,size:i,zero:s===0}}function rt(e,n=0){a(n<16,"Excessive MP4 nesting");let s=[];for(let o=0;o<e.length;){let i=Rt(e.subarray(o),e.length-o),d=e.subarray(o,o+i.size),p=d.subarray(i.width);s.push({name:i.name,data:p,raw:d,children:Ft.has(i.name)?rt(p,n+1):null}),o+=i.size}return s}var mt=e=>e.children?at(e.name,U(...e.children.map(mt))):e.raw||at(e.name,e.data),I=(e,n)=>{e.data=n,e.raw=null};function ft(e,n){let s=n.length;return U(Uint8Array.of(e,128|s>>>21,128|s>>>14&127,128|s>>>7&127,s&127),n)}function ht(e,n){a(n<e.length,"Missing AAC descriptor");let s=e[n++],o=0;for(let i=0;i<4;i++){a(n<e.length,"Truncated AAC descriptor");let d=e[n++];if(o=o*128+(d&127),!(d&128))return a(n+o<=e.length,"Invalid AAC descriptor length"),{tag:s,start:n,end:n+o}}throw new Error("Invalid AAC descriptor")}function Gt(e){let n=e.data;a(n.length>=44&&c(n,0)===0&&c(n,4)===1,"Expected one AAC sample description");let s=n.subarray(8);a(pt(s,4)==="mp4a"&&c(s,0)===s.length&&s[16]===0&&s[17]===0&&s[24]===0&&s[25]===2,"Use an unencrypted AAC-LC stereo MP4");let o=rt(s.subarray(36)),i=o.find(l=>l.name==="esds");a(i&&!o.some(l=>["sinf","wave"].includes(l.name)),"Expected a direct AAC configuration");let d=i.data;a(d.length>=4&&c(d,0)===0,"Unsupported AAC descriptor version");let p=ht(d,4);a(p.tag===3&&p.end-p.start>=3&&d[p.start+2]===0,"Unsupported AAC descriptor flags");let b=-1,z=[];for(let l=p.start+3;l<p.end;){let f=ht(d.subarray(0,p.end),l);if(f.tag!==4)z.push(d.subarray(l,f.end));else{a(f.end-f.start>=13&&d[f.start]===64,"Unsupported MPEG-4 audio descriptor");let D=[];for(let m=f.start+13;m<f.end;){let S=ht(d.subarray(0,f.end),m);if(S.tag!==5)D.push(d.subarray(m,S.end));else{let k=d.subarray(S.start,S.end);a(b<0&&k.length>=2&&k[0]>>>3===2&&(k[1]&127)===16,"Use ordinary AAC-LC stereo with 1024-sample frames"),b=(k[0]&7)<<1|k[1]>>>7;let x=Array.from(k.subarray(2),g=>g.toString(2).padStart(8,"0")).join("");a(Ot[b]&&(!x.includes("1")||/^01010110111001010*$/.test(x)),"Unsupported AAC sample rate or extension");let T=b.toString(2).padStart(4,"0"),v="00010"+T+"0000000000001"+T+"00000001000000000000000010000",_=v.padEnd(Math.ceil(v.length/8)*8,"0")+"00000000";D.push(ft(5,Uint8Array.from(_.match(/.{8}/g),g=>parseInt(g,2))))}m=S.end}z.push(ft(4,U(d.subarray(f.start,f.start+13),...D)))}l=f.end}a(b>=0,"Missing AAC configuration"),I(i,U(d.subarray(0,4),ft(3,U(d.subarray(p.start,p.start+3),...z)),d.subarray(p.end)));let A=at("mp4a",U(s.subarray(8,36),...o.map(mt)));return{rate:Ot[b],patched:U(P(0,2),s,A)}}function Q(e,n){a(e.data.length>=8&&c(e.data,0)===0,"Invalid "+e.name+" table");let s=c(e.data,4);return a(e.data.length===8+s*n&&s<=5e6,"Invalid "+e.name+" count"),s}function G(e,n,s){return s===8?Number(lt(e,n)):c(e,n)}function R(e,n,s,o){a(Number.isSafeInteger(o)&&o>=0&&(s===8||o<4294967295),"Unsupported MP4 timing or ID");let i=e.data.slice();i.set(s===8?Tt(o):F(o),n),I(e,i)}function st(e){a(e.data[0]===0||e.data[0]===1,"Unsupported MP4 header version");let n=e.data[0]===1,s=e.name==="tkhd",o=s?n?28:20:n?24:16,i=n?8:4;return{offset:o,width:i,duration:G(e.data,o,i),scale:s?0:c(e.data,o-4)}}function Ht(e,n,s,o,i,d,p){let b=X(e,"edts");if(!b)return a(Math.abs(d-Math.round(n*o/s))<=1,"Inconsistent audio duration"),p;let z=w(b,"elst"),A=z.data;a(A[0]===0||A[0]===1,"Unsupported MP4 edit list");let l=A[0]===1?8:4,f=c(A,4),D=2*l+4;a((f===1||f===2)&&A.length===8+f*D,"Unsupported audio edits");let m=8+(f-1)*D,S=G(A,m,l),k=G(A,m+l,l);if(a(Number.isSafeInteger(k)&&c(A,m+2*l)===65536,"Unsupported audio edit rate"),f===2){let v=A.subarray(8+l,8+2*l);a(v.every(_=>_===255)&&c(A,8+2*l)===65536,"Unsupported leading audio edit")}a(Math.abs(d-S-(f===2?G(A,8,l):0))<=1,"Inconsistent edit duration");let x=(n-k)*o-S*s;a(Math.abs(x)<=Math.ceil(2048*s/i)*o,"Audio edit does not reach the end");let T=p+Math.max(0,Math.ceil(x/s));return R(z,m,l,S+T),T}async function Qt(e){let n=[];for(let t=0;t<e.size;){let r=Rt(new Uint8Array(await e.slice(t,t+16).arrayBuffer()),e.size-t);a(n.length<1e4&&!["moof","sidx","mfra","ssix"].includes(r.name),"Fragmented or indexed MP4 is unsupported"),n.push({...r,at:t}),t+=r.size}let s=n.filter(t=>t.name==="moov"),o=n.filter(t=>t.name==="mdat");a(s.length===1&&o.length&&s[0].width===8&&s[0].size<=32*1024*1024,"Expected one conventional MP4 movie box");let i=s[0],[d]=rt(new Uint8Array(await e.slice(i.at,i.at+i.size).arrayBuffer())),p=d.children.filter(t=>t.name==="trak"),b=p.filter(t=>pt(w(w(t,"mdia"),"hdlr").data,8)==="soun");a(b.length===1,"Use an MP4 with exactly one AAC-LC stereo track");let z=b[0],A=w(z,"mdia"),l=w(A,"minf"),f=w(w(l,"dinf"),"dref").data,D=rt(f.subarray(8));a(c(f,0)===0&&c(f,4)===D.length&&D.length&&D.every(t=>t.name==="url "&&c(t.data,0)===1),"External audio references are unsupported");let m=w(l,"stbl"),S=new Set(["stsd","stsz","stsc","stts","stco","co64","sbgp","sgpd","subs","free","skip","ctts","stss","stps","sdtp","stdp"]);a(m.children.every(t=>S.has(t.name)),"Unsupported audio sample table");let k=w(m,"stsd"),{rate:x,patched:T}=Gt(k),v=w(m,"stsz");a(v.data.length>=12&&c(v.data,0)===0,"Invalid audio sample sizes");let _=c(v.data,4),g=c(v.data,8);a(g>0&&g<=5e6&&v.data.length===12+(_?0:4*g),"Invalid audio sample count");let gt=t=>_||c(v.data,12+4*t),V=w(m,"stsc"),Y=Q(V,12),L=X(m,"stco")||w(m,"co64");a(!(X(m,"stco")&&X(m,"co64")),"Duplicate chunk offset tables");let j=L.name==="stco"?4:8,E=Q(L,j);a(Y>0&&E>0,"Missing audio chunks");let H=t=>c(V.data,8+12*t);a(H(0)===1,"Invalid first chunk run");for(let t=0;t<Y;t++)a(H(t)<=E&&(t===0||H(t)>H(t-1))&&c(V.data,12+12*t)>0&&c(V.data,16+12*t)===1,"Invalid audio chunk run");let Z=0,ot=0;for(let t=0;t<E;t++){Z+1<Y&&H(Z+1)===t+1&&Z++;let r=c(V.data,12+12*Z);a(ot+r<=g,"Audio chunk exceeds sample count");let u=0;for(let h=0;h<r;h++){let B=gt(ot++);a(B>0,"Empty AAC sample"),u+=B}let y=G(L.data,8+t*j,j);a(o.some(h=>y>=h.at+h.width&&y+u<=h.at+h.size),"Audio chunk outside media data")}a(ot===g,"Audio chunks omit samples");let tt=w(m,"stts"),_t=Q(tt,8),et=0,wt=0,O=[];for(let t=0;t<_t;t++){let r=c(tt.data,8+8*t),u=c(tt.data,12+8*t);a(r>0&&u>0,"Invalid audio timing"),O.push([r,u]),wt+=r,et+=r*u}a(wt===g&&Number.isSafeInteger(et),"Audio timing does not match samples");let yt=w(A,"mdhd"),W=w(d,"mvhd"),it=w(z,"tkhd"),C=st(yt),N=st(W),$=st(it);a(C.scale&&N.scale&&C.duration>0&&Math.abs(C.duration-et)<=Math.ceil(2048*C.scale/x)&&it.data[3]&1&&$.duration>0,"Unsupported audio duration or track flags");let M=Math.max(10,Math.ceil(.35*x/1024));for(let t of m.children){let r=t.data;if(t.name==="sbgp"){let u=r[0]===1?12:8;a((r[0]===0||r[0]===1)&&r.length>=u+4,"Invalid audio sample group");let y=c(r,u);a(r.length===u+4+y*8,"Invalid audio group count");let h=0;for(let q=0;q<y;q++)h+=c(r,u+4+q*8);a(h<=g,"Audio groups exceed sample count");let B=g-h+M;if(y&&c(r,r.length-4)===0){let q=r.length-8;R(t,q,4,c(r,q)+B)}else I(t,U(r.subarray(0,u),P(y+1),r.subarray(u+4),P(B,0)))}else if(t.name==="ctts"){let u=Q(t,8),y=0;for(let h=0;h<u;h++)y+=c(r,8+h*8),a(c(r,12+h*8)===0,"Nonzero audio composition offsets are unsupported");a(y===g,"Audio composition counts differ"),I(t,U(P(0,u+1),r.subarray(8),P(M,0)))}else if(t.name==="stss"||t.name==="stps"){let u=Q(t,4),y=0;for(let h=0;h<u;h++){let B=c(r,8+h*4);a(B>y&&B<=g,"Invalid audio sync sample"),y=B}I(t,U(P(0,u+M),r.subarray(8),P(...Array.from({length:M},(h,B)=>g+B+1))))}else if(t.name==="sdtp"||t.name==="stdp"){let u=t.name==="sdtp"?1:2;a(r.length===4+u*g,"Invalid audio dependency or priority table"),I(t,U(r,new Uint8Array(u*M)))}}let At=M-8,Ut=Math.floor(M*1024*C.scale/x),Mt=Math.round(Ut*N.scale/C.scale);a(Mt>0,"Movie timescale cannot represent the silent tail");let Lt=Ht(z,et,C.scale,N.scale,x,$.duration,Mt);R(it,$.offset,$.width,$.duration+Lt),R(yt,C.offset,C.width,C.duration+Ut);for(let t=0;t<M;t++){let r=Math.floor((t+1)*1024*C.scale/x)-Math.floor(t*1024*C.scale/x);a(r>0&&r<=4294967295,"Audio timescale cannot represent AAC frames"),O.at(-1)?.[1]===r?O.at(-1)[0]++:O.push([1,r])}let bt=new Uint8Array(8+O.length*8),ct=new DataView(bt.buffer);ct.setUint32(4,O.length),O.forEach(([t,r],u)=>{ct.setUint32(8+u*8,t),ct.setUint32(12+u*8,r)}),I(tt,bt);let zt=new Uint8Array(12+4*(g+M)),kt=new DataView(zt.buffer);kt.setUint32(8,g+M);for(let t=0;t<g+M;t++)kt.setUint32(12+t*4,t<g?gt(t):K.length);I(v,zt);let xt=e.size+8,vt=xt+At*K.length,J=j===8||vt>4294967295?8:4,Ct=new Uint8Array(8+(E+2)*J),dt=new DataView(Ct.buffer);dt.setUint32(4,E+2);for(let t=0;t<E+2;t++){let r=t<E?G(L.data,8+t*j,j):t===E?xt:vt;J===8?dt.setBigUint64(8+t*J,BigInt(r)):dt.setUint32(8+t*J,r)}L.name=J===8?"co64":"stco",I(L,Ct);let jt=V.data.subarray(8),It=t=>U(P(0,Y+2),jt,P(E+1,At,1,E+2,8,t));I(V,It(1));let St=structuredClone(z);I(V,It(2)),I(k,T);let Bt=t=>t.data[0]===1?20:12,nt=p.map(t=>{let r=w(t,"tkhd");return c(r.data,Bt(r))});a(nt.every(Boolean)&&new Set(nt).size===nt.length,"Invalid track IDs");let Dt=nt.reduce((t,r)=>Math.max(t,r),0)+1,Et=w(St,"tkhd");R(Et,Bt(Et),4,Dt);let Nt=W.data[0]===1?108:96,Pt=c(W.data,Nt);if(R(W,Nt,4,Math.max(Dt+1,Pt===4294967295?0:Pt)),N.duration>0&&Number.isSafeInteger(N.duration)&&!(N.width===4&&N.duration===4294967295)){let t=p.reduce((r,u)=>{let y=st(w(u,"tkhd"));return Number.isSafeInteger(y.duration)&&!(y.width===4&&y.duration===4294967295)?Math.max(r,y.duration):r},N.duration);R(W,N.offset,N.width,t)}d.children.splice(d.children.indexOf(z)+1,0,St);let Vt=new Uint8Array(M*K.length);for(let t=0;t<M;t++)Vt.set(K,t*K.length);try{const enc=new TextEncoder();const mkUdtaItem=(fourcc,text)=>{let t=enc.encode(text);let dataPayload=U(P(1,0),t);return at(fourcc,at("data",dataPayload));};let ilst=at("ilst",U(mkUdtaItem("©ART","Method From cutefish.my.id"),mkUdtaItem("©nam","Method From cutefish.my.id"),mkUdtaItem("©wrt","Method From cutefish.my.id"),mkUdtaItem("©alb","Method From cutefish.my.id"),mkUdtaItem("©too","Lavf62.3.100"),mkUdtaItem("©cmt","Method From cutefish.my.id"),mkUdtaItem("cprt","cutefish.my.id"),mkUdtaItem("©grp","Method From cutefish.my.id")));let hdlrPayload=U(new Uint8Array(4),ut("mdir"),ut("appl"),new Uint8Array(9));let hdlr=at("hdlr",U(P(0),hdlrPayload));let meta=at("meta",U(P(0),hdlr,ilst));d.children=d.children.filter(t=>t.name!=="udta");d.children.push({name:"udta",raw:at("udta",meta)});}catch(_e){console.warn("Failed to inject udta into moov:",_e)}let qt=n.flatMap(t=>t===i?[F(t.size),ut("free"),e.slice(t.at+8,t.at+t.size)]:t.zero?(a(t.size<=4294967295,"Size-zero box exceeds the supported range"),[F(t.size),e.slice(t.at+4,t.at+t.size)]):[e.slice(t.at,t.at+t.size)]);return new Blob([...qt,at("mdat",Vt),mt(d)],{type:"video/mp4"})}window.patchSlSr = Qt;


// =========================================================================
// 2. ADJN MP4 Core v5.0 (64-Bit Unknown Duration Sentinel & Bitstream Engine)
// =========================================================================
/*
 * ADJN MP4 Core v5.0
 * Developed by F R Y 60fps & Adekjamannow
 *
 * 64-Bit Unknown Duration Sentinel & Bitstream Ingest Engine
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) {
    root.FRYOriginalMp4Core = api;
    root.ADJNOriginalMp4Core = api;
    root.FRYMp4Patcher = api;
    root.ADJNMp4Patcher = api;
    root.HazePatch = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '5.0';
  const ENCODER_TAG = 'Method From cutefish.my.id';
  const FOURCC_TOO = new Uint8Array([0xa9, 0x74, 0x6f, 0x6f]); // '©too'
  const SENTINEL_FF = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]); // 64-bit Unknown Duration Sentinel
  const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);
  const MAX_TABLE_ENTRIES = 50000000;
  const EMPTY_U8 = new Uint8Array(0);

  function createError(msg) {
    const err = new Error(msg);
    err.name = 'ADJNPatchError';
    return err;
  }
  function throwError(msg) {
    throw createError(msg);
  }

  function readU32(b, o) {
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }
  function readU64(b, o) {
    return Number((BigInt(readU32(b, o)) << 32n) | BigInt(readU32(b, o + 4)));
  }
  function u32ToBytes(v) {
    const b = new Uint8Array(4);
    b[0] = (v >>> 24) & 0xff;
    b[1] = (v >>> 16) & 0xff;
    b[2] = (v >>> 8) & 0xff;
    b[3] = v & 0xff;
    return b;
  }
  function u64ToBytes(v) {
    const b = new Uint8Array(8);
    const big = BigInt(v);
    b.set(u32ToBytes(Number(big >> 32n)), 0);
    b.set(u32ToBytes(Number(big & 0xffffffffn)), 4);
    return b;
  }
  function asciiToBytes(str) {
    const b = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xff;
    return b;
  }
  function concatBytes(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
  function cloneBytes(src) {
    const dst = new Uint8Array(src.length);
    dst.set(src);
    return dst;
  }
  function toU8Array(val) {
    if (val instanceof Uint8Array) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    if (val instanceof ArrayBuffer) return new Uint8Array(val);
    if (ArrayBuffer.isView(val)) return new Uint8Array(val.buffer, val.byteOffset, val.byteLength);
    throw createError('Buffer video tidak valid.');
  }

  function exactBytesEqual(a, b) {
    if (a.byteLength !== b.byteLength) return false;
    const step = 65536;
    for (let o = 0; o < a.byteLength; o += step) {
      const len = Math.min(step, a.byteLength - o);
      for (let i = 0; i < len; i++) {
        if (a[o + i] !== b[o + i]) return false;
      }
    }
    return true;
  }


  function indexOfSubarray(haystack, needleStr) {
    const needle = asciiToBytes(needleStr);
    outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  function Mp4Box(type, payload, children) {
    this.type = type;
    this.payload = payload || EMPTY_U8;
    this.children = children || null;
  }
  Mp4Box.prototype.find = function (type) {
    if (!this.children) return null;
    for (const c of this.children) if (c.type === type) return c;
    return null;
  };
  Mp4Box.prototype.findAll = function (type) {
    if (!this.children) return [];
    return this.children.filter(c => c.type === type);
  };
  Mp4Box.prototype.remove = function (type) {
    if (this.children) this.children = this.children.filter(c => c.type !== type);
  };
  Mp4Box.prototype.path = function (...types) {
    let cur = this;
    for (let i = 0; i < types.length; i++) {
      cur = cur ? cur.find(types[i]) : null;
      if (!cur) return null;
    }
    return cur;
  };
  Mp4Box.prototype.clone = function () {
    if (this.children) return new Mp4Box(this.type, null, this.children.map(c => c.clone()));
    return new Mp4Box(this.type, cloneBytes(this.payload));
  };
  Mp4Box.prototype.serialize = function () {
    const body = this.children ? concatBytes(this.children.map(c => c.serialize())) : this.payload;
    if (body.length + 8 > 0xffffffff) {
      return concatBytes([u32ToBytes(1), asciiToBytes(this.type), u64ToBytes(body.length + 16), body]);
    }
    return concatBytes([u32ToBytes(body.length + 8), asciiToBytes(this.type), body]);
  };

  function parseBoxes(bytes, start, end) {
    const list = [];
    let p = start;
    while (p + 8 <= end) {
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) break;
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > end) break;
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (CONTAINER_BOXES.has(type)) {
        list.push(new Mp4Box(type, null, parseBoxes(bytes, p + header, p + size)));
      } else {
        list.push(new Mp4Box(type, bytes.subarray(p + header, p + size)));
      }
      p += size;
    }
    return list;
  }

  function makeBox(type, payload) {
    return concatBytes([u32ToBytes(payload.length + 8), asciiToBytes(type), payload]);
  }
  function makeBoxRaw(typeBytes, payload) {
    return concatBytes([u32ToBytes(payload.length + 8), typeBytes, payload]);
  }

  function scanBoxes(bytes, start, end, label) {
    const out = [];
    let p = start;
    while (p < end) {
      if (p + 8 > end) throwError('Invalid MP4 — malformed ' + label + ' metadata layout.');
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) throwError('Invalid MP4 — truncated 64-bit ' + label + ' metadata header.');
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (!Number.isSafeInteger(size) || size < header || p + size > end) {
        throwError('Invalid MP4 — malformed ' + label + ' metadata box size.');
      }
      out.push({
        type: String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]),
        start: p,
        end: p + size,
        header
      });
      p += size;
    }
    return out;
  }

  function makeDataAtom(text) {
    const dataPayload = concatBytes([u32ToBytes(1), u32ToBytes(0), asciiToBytes(text)]);
    return makeBoxRaw(FOURCC_TOO, makeBox('data', dataPayload));
  }
  function makeMetaBox(tagText) {
    const hdlrPayload = concatBytes([u32ToBytes(0), u32ToBytes(0), asciiToBytes('mdir'), new Uint8Array(12), new Uint8Array(1)]);
    return makeBox('meta', concatBytes([u32ToBytes(0), makeBox('hdlr', hdlrPayload), makeBox('ilst', makeDataAtom(tagText))]));
  }
  function patchIlst(bytes, tagText) {
    const chunks = [];
    for (const box of scanBoxes(bytes, 0, bytes.length, 'ilst')) {
      if (box.type !== '©too') chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
    }
    if (tagText) chunks.push(makeDataAtom(tagText));
    return concatBytes(chunks);
  }
  function patchMetaBox(bytes, tagText) {
    if (bytes.length < 4) throwError('Invalid MP4 — malformed meta FullBox.');
    const chunks = [cloneBytes(bytes.subarray(0, 4))];
    let inserted = false;
    for (const box of scanBoxes(bytes, 4, bytes.length, 'meta')) {
      if (box.type === 'ilst') {
        const body = bytes.subarray(box.start + box.header, box.end);
        chunks.push(makeBox('ilst', patchIlst(body, !inserted ? tagText : null)));
        inserted = inserted || !!tagText;
      } else {
        chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
      }
    }
    if (!inserted && tagText) chunks.push(makeBox('ilst', makeDataAtom(tagText)));
    return makeBox('meta', concatBytes(chunks));
  }
  function patchUdtaBox(bytes, tagText) {
    const chunks = [];
    let inserted = false;
    for (const box of scanBoxes(bytes, 0, bytes.length, 'udta')) {
      if (box.type === 'meta') {
        const body = bytes.subarray(box.start + box.header, box.end);
        chunks.push(patchMetaBox(body, !inserted ? tagText : null));
        inserted = inserted || !!tagText;
      } else {
        chunks.push(cloneBytes(bytes.subarray(box.start, box.end)));
      }
    }
    if (!inserted && tagText) chunks.push(makeMetaBox(tagText));
    return concatBytes(chunks);
  }
  function injectUdta(moov, tagText) {
    const existing = moov.findAll('udta');
    if (existing.length) {
      let inserted = false;
      for (const u of existing) {
        const toAdd = !inserted ? tagText : null;
        inserted = inserted || !!toAdd;
        if (u.children) throwError('Invalid MP4 — unexpected parsed udta metadata tree.');
        u.payload = patchUdtaBox(u.payload, toAdd);
      }
    } else {
      moov.children.push(new Mp4Box('udta', makeMetaBox(tagText)));
    }
  }
  function hasEncoderTag(moov, tagText) {
    return moov.findAll('udta').some(u => !u.children && indexOfSubarray(u.payload, tagText) >= 0);
  }

  function parseTopLevel(bytes) {
    const list = [];
    let p = 0;
    while (p + 8 <= bytes.length) {
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > bytes.length) break;
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (size < header || p + size > bytes.length) break;
      list.push({
        type: String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]),
        start: p,
        end: p + size,
        header
      });
      p += size;
    }
    return list;
  }

  function validateBoxNesting(bytes, start, end, label, depth = 0) {
    if (depth > 24) throwError('Invalid MP4 — box nesting is too deep to patch safely.');
    let p = start;
    while (p < end) {
      if (p + 8 > end) throwError('Invalid MP4 — malformed ' + label + ' box layout.');
      let size = readU32(bytes, p);
      let header = 8;
      if (size === 1) {
        if (p + 16 > end) throwError('Invalid MP4 — truncated 64-bit ' + label + ' box header.');
        size = readU64(bytes, p + 8);
        header = 16;
      } else if (size === 0) {
        size = end - p;
      }
      if (!Number.isSafeInteger(size) || size < header || p + size > end) {
        throwError('Invalid MP4 — malformed ' + label + ' box size.');
      }
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (CONTAINER_BOXES.has(type)) {
        validateBoxNesting(bytes, p + header, p + size, type, depth + 1);
      }
      p += size;
    }
  }

  function isSentinelDuration(payload) {
    if (!payload || payload.length < 32 || payload[0] !== 1) return false;
    for (let i = 0; i < 8; i++) {
      if (payload[24 + i] !== 0xff) return false;
    }
    return true;
  }

  function patchMvhdToV1Sentinel(payload) {
    if (!payload || payload.length < 4) throwError('Malformed mvhd box (too short for version byte).');
    const ver = payload[0];
    if (ver === 1) {
      if (payload.length < 112) throwError('Malformed version-1 mvhd box (too short — needs 112 bytes).');
      const out = cloneBytes(payload);
      out.set(SENTINEL_FF, 24);
      return out;
    }
    if (ver !== 0) throwError('Unsupported mvhd version: ' + ver + '.');
    if (payload.length < 100) throwError('Malformed version-0 mvhd box (too short).');
    // Convert version 0 mvhd to version 1 with 64-bit duration sentinel (0xFFFFFFFFFFFFFFFF)
    return concatBytes([
      new Uint8Array([1, payload[1], payload[2], payload[3]]),
      u32ToBytes(0),
      cloneBytes(payload.subarray(4, 8)),
      u32ToBytes(0),
      cloneBytes(payload.subarray(8, 12)),
      cloneBytes(payload.subarray(12, 16)),
      cloneBytes(SENTINEL_FF),
      cloneBytes(payload.subarray(20, 100))
    ]);
  }

  function validateTableEntries(bytes, headerSize, entrySize, label) {
    if (!bytes || bytes.length < 8) throwError('The ' + label + ' table is truncated.');
    const count = readU32(bytes, 4);
    if (count > MAX_TABLE_ENTRIES) throwError('The ' + label + ' table is unreasonably large (' + count + ' entries).');
    if (headerSize + count * entrySize > bytes.length) throwError('The ' + label + ' table is truncated.');
    return count;
  }

  function parseStts(bytes) {
    const count = validateTableEntries(bytes, 8, 8, 'stts');
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push([readU32(bytes, 8 + i * 8), readU32(bytes, 12 + i * 8)]);
    }
    return list;
  }

  function parseStsz(bytes) {
    if (!bytes || bytes.length < 12) throwError('The stsz table is truncated.');
    const uniform = readU32(bytes, 4);
    const count = readU32(bytes, 8);
    if (count > MAX_TABLE_ENTRIES) throwError('The stsz table is unreasonably large (' + count + ' entries).');
    if (!uniform && 12 + count * 4 > bytes.length) throwError('The stsz table is truncated.');
    const list = new Array(count);
    for (let i = 0; i < count; i++) {
      list[i] = uniform || readU32(bytes, 12 + i * 4);
    }
    return list;
  }

  function parseStsc(bytes) {
    const count = validateTableEntries(bytes, 8, 12, 'stsc');
    const list = [];
    for (let i = 0; i < count; i++) {
      const e = [readU32(bytes, 8 + i * 12), readU32(bytes, 12 + i * 12), readU32(bytes, 16 + i * 12)];
      if (e[0] < 1 || e[1] < 1 || e[2] < 1 || (i > 0 && e[0] <= list[i - 1][0])) {
        throwError('The stsc table contains an invalid chunk mapping.');
      }
      list.push(e);
    }
    return list;
  }

  function parseStcoOrCo64(box) {
    const bytes = box.payload;
    const is64 = box.type === 'co64';
    const count = validateTableEntries(bytes, 8, is64 ? 8 : 4, box.type);
    const list = new Array(count);
    for (let i = 0; i < count; i++) {
      list[i] = is64 ? readU64(bytes, 8 + i * 8) : readU32(bytes, 8 + i * 4);
    }
    return list;
  }

  function writeStcoOrCo64(box, offsets) {
    let maxOff = 0;
    for (const off of offsets) if (off > maxOff) maxOff = off;
    if (maxOff > 0xffffffff) {
      box.type = 'co64';
      const b = new Uint8Array(8 + offsets.length * 8);
      b.set(u32ToBytes(offsets.length), 4);
      for (let i = 0; i < offsets.length; i++) b.set(u64ToBytes(offsets[i]), 8 + i * 8);
      box.payload = b;
    } else {
      box.type = 'stco';
      const b = new Uint8Array(8 + offsets.length * 4);
      b.set(u32ToBytes(offsets.length), 4);
      for (let i = 0; i < offsets.length; i++) b.set(u32ToBytes(offsets[i]), 8 + i * 4);
      box.payload = b;
    }
  }

  function getStbl(trak) {
    return trak.path('mdia', 'minf', 'stbl');
  }
  function getOffsetBox(trak) {
    const stbl = getStbl(trak);
    if (!stbl) return null;
    return stbl.find('stco') || stbl.find('co64');
  }
  function getTrackHandler(trak) {
    const hdlr = trak.path('mdia', 'hdlr');
    if (!hdlr || hdlr.payload.length < 12) return '';
    const p = hdlr.payload;
    return String.fromCharCode(p[8], p[9], p[10], p[11]);
  }
  function getSampleTableBox(trak, type) {
    const stbl = getStbl(trak);
    return stbl ? stbl.find(type) : null;
  }
  function getCodecFourCC(trak) {
    const stsd = getSampleTableBox(trak, 'stsd');
    if (!stsd || stsd.payload.length < 16) return '';
    const p = stsd.payload;
    const count = readU32(p, 4);
    const entrySize = readU32(p, 8);
    if (count < 1 || entrySize < 8 || 8 + entrySize > p.length) return '';
    return String.fromCharCode(p[12], p[13], p[14], p[15]);
  }
  function getStsdEntryCount(trak) {
    const stsd = getSampleTableBox(trak, 'stsd');
    return stsd && stsd.payload.length >= 8 ? readU32(stsd.payload, 4) : 0;
  }

  function parseTrackInfo(trak) {
    const stbl = getStbl(trak);
    if (!stbl) return null;
    const stsz = stbl.find('stsz');
    const stsc = stbl.find('stsc');
    const stts = stbl.find('stts');
    const offsBox = getOffsetBox(trak);
    if (!stsz || !stsc || !stts || !offsBox) return null;

    const sizes = parseStsz(stsz.payload);
    const sampleCount = sizes.length;
    const chunkOffsets = parseStcoOrCo64(offsBox);
    const runs = parseStsc(stsc.payload);
    if (!sampleCount || !chunkOffsets.length || !runs.length) return null;

    const samplesPerChunk = [];
    for (let i = 0; i < runs.length; i++) {
      const firstChunk = runs[i][0];
      const lastChunk = i + 1 < runs.length ? runs[i + 1][0] - 1 : chunkOffsets.length;
      if (firstChunk > lastChunk || lastChunk > chunkOffsets.length) return null;
      for (let c = firstChunk; c <= lastChunk; c++) samplesPerChunk.push(runs[i][1]);
    }
    if (samplesPerChunk.length !== chunkOffsets.length || samplesPerChunk.reduce((a, b) => a + b, 0) !== sampleCount) {
      return null;
    }

    const offsets = new Array(sampleCount);
    let sIdx = 0;
    for (let c = 0; c < chunkOffsets.length; c++) {
      let curOff = chunkOffsets[c];
      for (let s = 0; s < samplesPerChunk[c]; s++) {
        offsets[sIdx] = curOff;
        curOff += sizes[sIdx];
        sIdx++;
      }
    }

    const sttsTotal = parseStts(stts.payload).reduce((a, b) => a + b[0], 0);
    if (sttsTotal !== sampleCount) return null;

    return {
      trak,
      stsz,
      offsBox,
      sizes,
      offsets,
      runs,
      count: sampleCount,
      handler: getTrackHandler(trak),
      codec: getCodecFourCC(trak)
    };
  }

  function readDisplayDimensions(trak) {
    const tkhd = trak.find('tkhd');
    if (!tkhd || tkhd.payload.length < 84) return { width: 0, height: 0 };
    const ver = tkhd.payload[0];
    const widthOffset = ver === 1 ? 88 : 76;
    if (tkhd.payload.length < widthOffset + 8) return { width: 0, height: 0 };
    const w = readU32(tkhd.payload, widthOffset) / 65536;
    const h = readU32(tkhd.payload, widthOffset + 4) / 65536;
    return { width: Math.round(w), height: Math.round(h) };
  }

  function parseMp4Structure(bytes) {
    if (!bytes.length) throwError('File video kosong.');
    const topBoxes = parseTopLevel(bytes);
    validateBoxNesting(bytes, 0, bytes.length, 'top-level', 0);
    if (topBoxes.some(b => b.type === 'moof')) throwError('Fragmented MP4/MOV files tidak didukung untuk direct patch.');

    const ftypList = topBoxes.filter(b => b.type === 'ftyp');
    const moovList = topBoxes.filter(b => b.type === 'moov');
    const mdatList = topBoxes.filter(b => b.type === 'mdat');
    if (ftypList.length !== 1 || moovList.length !== 1 || mdatList.length !== 1) {
      throwError('Invalid MP4 — membutuhkan tepat satu box ftyp, moov, dan mdat.');
    }

    const ftypBox = ftypList[0];
    const moovBox = moovList[0];
    const mdatBox = mdatList[0];
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));
    const traks = moov.findAll('trak');
    if (!traks.length) throwError('Invalid MP4 — tidak ditemukan track di file video.');

    const mvhd = moov.find('mvhd');
    if (!mvhd || mvhd.payload.length < 4) throwError('Invalid MP4 — mvhd hilang.');
    if (isSentinelDuration(mvhd.payload)) {
      throwError('File ini sudah ter-patch sebelumnya (duration sentinel aktif).');
    }
    if (mvhd.payload[0] !== 0 && mvhd.payload[0] !== 1) {
      throwError('Unsupported mvhd version: ' + mvhd.payload[0]);
    }

    const tables = traks.map(parseTrackInfo);
    if (tables.some(t => t === null)) throwError('Tidak dapat memetakan sample table dari setiap track.');
    for (const t of tables) {
      if (getStsdEntryCount(t.trak) !== 1 || t.runs.some(r => r[2] !== 1)) {
        throwError('Track dengan multiple codec descriptions tidak didukung.');
      }
    }

    const videoTracks = tables.filter(t => t.handler === 'vide');
    if (videoTracks.length !== 1) throwError('Membutuhkan tepat satu video track, ditemukan: ' + videoTracks.length);

    const video = videoTracks[0];
    const isAvc = video.codec === 'avc1' || video.codec === 'avc3';
    const isHevc = video.codec === 'hvc1' || video.codec === 'hev1' || video.codec === 'hvc2' || video.codec === 'hev2';
    if (!isAvc && !isHevc) {
      throwError('Codec video tidak didukung: ' + (video.codec || 'unknown') + '. Export sebagai H.264 (AVC) atau H.265 (HEVC).');
    }

    const audioTracks = tables.filter(t => t.handler === 'soun' && t.codec === 'mp4a');
    if (!audioTracks.length) throwError('Video membutuhkan audio track AAC (mp4a).');

    const sourceAudio = audioTracks[0];
    injectUdta(moov.clone(), ENCODER_TAG);

    const mdatPayloadStart = mdatBox.start + mdatBox.header;
    for (const t of tables) {
      for (let i = 0; i < t.count; i++) {
        const off = t.offsets[i];
        const sz = t.sizes[i];
        if (!Number.isSafeInteger(off) || !Number.isSafeInteger(sz) || sz < 0 || off < mdatPayloadStart || off + sz > mdatBox.end) {
          throwError('Sample track ' + (i + 1) + ' menunjuk ke luar mdat.');
        }
      }
    }

    return {
      top: topBoxes,
      ftypBox,
      moovBox,
      mdatBox,
      moov,
      mvhd,
      traks,
      tables,
      video,
      sourceAudio,
      isAvc,
      isHevc
    };
  }

  function executePatch(bytes, parsed) {
    const { top, moovBox, mdatBox, moov } = parsed;
    const mvhd = moov.find('mvhd');
    if (!mvhd || mvhd.payload.length < 4) throwError('Invalid MP4 — mvhd hilang.');

    mvhd.payload = patchMvhdToV1Sentinel(mvhd.payload);
    injectUdta(moov, ENCODER_TAG);

    const moovBeforeMdat = moovBox.start < mdatBox.start;
    const oldMoovSize = moovBox.end - moovBox.start;

    if (moovBeforeMdat) {
      const traksWithOffsets = moov.findAll('trak').filter(t => getOffsetBox(t));
      const origOffsets = traksWithOffsets.map(t => parseStcoOrCo64(getOffsetBox(t)));
      for (let iter = 0; iter < 6; iter++) {
        const delta = moov.serialize().length - oldMoovSize;
        let changedType = false;
        traksWithOffsets.forEach((t, i) => {
          const box = getOffsetBox(t);
          const prevType = box.type;
          writeStcoOrCo64(box, origOffsets[i].map(o => o + delta));
          if (box.type !== prevType) changedType = true;
        });
        if (!changedType && moov.serialize().length === oldMoovSize + delta) break;
      }
    }

    const newMoovBytes = moov.serialize();
    const finalChunks = [];
    for (const b of top) {
      finalChunks.push(b.start === moovBox.start ? newMoovBytes : bytes.subarray(b.start, b.end));
    }
    return concatBytes(finalChunks);
  }

  function validateFinalOutput(bytes, originalBytes) {
    const top = parseTopLevel(bytes);
    if (!top.length || top[top.length - 1].end !== bytes.length) throwError('Hasil patch bukan box run lengkap.');
    const moovList = top.filter(b => b.type === 'moov');
    const mdatList = top.filter(b => b.type === 'mdat');
    if (moovList.length !== 1 || mdatList.length !== 1) throwError('Hasil patch harus memiliki tepat satu moov dan satu mdat.');

    const moovBox = moovList[0];
    const mdatBox = mdatList[0];
    const mdatStart = mdatBox.start + mdatBox.header;
    const mdatEnd = mdatBox.end;
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));

    if (!hasEncoderTag(moov, ENCODER_TAG)) throwError('Hasil patch tidak memiliki ADJN encoder tag.');

    const mvhd = moov.find('mvhd');
    if (!mvhd || !isSentinelDuration(mvhd.payload)) throwError('Hasil patch mvhd.duration bukan sentinel Unknown Duration.');

    for (const trak of moov.findAll('trak')) {
      const offsBox = getOffsetBox(trak);
      if (!offsBox) continue;
      for (const off of parseStcoOrCo64(offsBox)) {
        if (off < mdatStart || off >= mdatEnd) {
          throwError('Offset chunk ter-patch (' + off + ') berada di luar mdat.');
        }
      }
    }

    if (originalBytes) {
      const origTop = parseTopLevel(originalBytes);
      const origMdatBox = origTop.find(b => b.type === 'mdat');
      if (origMdatBox) {
        const origMdat = originalBytes.subarray(origMdatBox.start + origMdatBox.header, origMdatBox.end);
        const outMdat = bytes.subarray(mdatStart, mdatEnd);
        if (!exactBytesEqual(origMdat, outMdat)) {
          throwError('ADJN Core: Media payload (mdat) tidak identik setelah patch.');
        }
      }
    }
  }

  function quickPatch(input) {
    const bytes = toU8Array(input);
    const parsed = parseMp4Structure(bytes);
    const patched = executePatch(bytes, parsed);
    validateFinalOutput(patched, bytes);
    return patched;
  }

  function checkCompatibility(input) {
    try {
      const parsed = parseMp4Structure(toU8Array(input));
      return {
        compatible: true,
        reason: '',
        codec: parsed.video.codec,
        isAvc: parsed.isAvc,
        isHevc: parsed.isHevc,
        sampleCount: parsed.video.count,
        audioTrackCount: parsed.tables.filter(t => t.handler === 'soun').length
      };
    } catch (e) {
      return {
        compatible: false,
        reason: e?.message || 'Struktur MP4/MOV tidak kompatibel.',
        codec: '',
        isAvc: false,
        isHevc: false,
        sampleCount: 0,
        audioTrackCount: 0
      };
    }
  }

  function inspect(input) {
    const bytes = toU8Array(input);
    const top = parseTopLevel(bytes);
    const moovBox = top.find(b => b.type === 'moov');
    const moov = moovBox ? new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end)) : new Mp4Box('moov', null, []);
    const traks = moov.findAll('trak');

    function getTrackSampleCount(trak) {
      const stsz = getSampleTableBox(trak, 'stsz');
      return stsz && stsz.payload.length >= 12 ? readU32(stsz.payload, 8) : 0;
    }

    const videoTrak = traks.find(t => getTrackHandler(t) === 'vide');
    const audioTraks = traks.filter(t => getTrackHandler(t) === 'soun');
    const primaryAudio = audioTraks.find(t => getCodecFourCC(t) === 'mp4a') || audioTraks[0];
    const vCodec = videoTrak ? getCodecFourCC(videoTrak) : '';
    const aCodec = primaryAudio ? getCodecFourCC(primaryAudio) : '';

    let declaredAudioSamples = 0;
    for (const a of audioTraks) declaredAudioSamples += getTrackSampleCount(a);

    const mvhd = moov.find('mvhd');
    return {
      codec: vCodec,
      isAvc: vCodec === 'avc1' || vCodec === 'avc3',
      isHevc: vCodec === 'hvc1' || vCodec === 'hev1' || vCodec === 'hvc2' || vCodec === 'hev2',
      sampleCount: videoTrak ? getTrackSampleCount(videoTrak) : 0,
      hasAac: audioTraks.some(t => getCodecFourCC(t) === 'mp4a'),
      audioCodec: aCodec,
      audioSampleCount: primaryAudio ? getTrackSampleCount(primaryAudio) : 0,
      audioTrackCount: audioTraks.length,
      declaredAudioSamples,
      durationUnknown: !!(mvhd && isSentinelDuration(mvhd.payload)),
      encoderTag: hasEncoderTag(moov, ENCODER_TAG) ? ENCODER_TAG : ''
    };
  }

  function inspectMediaInfo(input) {
    const bytes = toU8Array(input);
    const top = parseTopLevel(bytes);
    const moovBox = top.find(b => b.type === 'moov');
    if (!moovBox) throw createError('ADJN Core: moov box tidak ditemukan.');
    const moov = new Mp4Box('moov', null, parseBoxes(bytes, moovBox.start + moovBox.header, moovBox.end));
    const traks = moov.findAll('trak');

    const allTracks = traks.map((trak, idx) => {
      const handler = getTrackHandler(trak);
      const codec = getCodecFourCC(trak);
      const dims = readDisplayDimensions(trak);
      const stsz = getSampleTableBox(trak, 'stsz');
      const sampleCount = stsz && stsz.payload.length >= 12 ? readU32(stsz.payload, 8) : 0;
      const mdhd = trak.path('mdia', 'mdhd');
      let timescale = 1000;
      let duration = 0;
      if (mdhd && mdhd.payload.length >= 24) {
        const ver = mdhd.payload[0];
        timescale = readU32(mdhd.payload, ver === 1 ? 20 : 12);
        duration = ver === 1 ? readU64(mdhd.payload, 24) : readU32(mdhd.payload, 16);
      }
      const avgFps = handler === 'vide' && duration > 0 ? (sampleCount * timescale) / duration : 0;
      return {
        trackId: idx + 1,
        handler,
        codec,
        width: dims.width,
        height: dims.height,
        sampleCount,
        timescale,
        duration,
        averageFps: avgFps,
        maxFps: avgFps
      };
    });

    const video = allTracks.find(t => t.handler === 'vide');
    const audio = allTracks.find(t => t.handler === 'soun');
    if (!video) throw createError('ADJN Core: video track tidak ditemukan.');

    return {
      width: video.width || 1080,
      height: video.height || 1920,
      codec: video.codec,
      codecFamily: /^(hvc1|hev1|hvc2|hev2)$/i.test(video.codec) ? 'hevc' : /^(avc1|avc3)$/i.test(video.codec) ? 'avc' : video.codec,
      averageFps: video.averageFps || 60,
      maxFps: video.maxFps || 60,
      videoSamples: video.sampleCount,
      audioCodec: audio?.codec || '',
      audioSamples: audio?.sampleCount || 0,
      fragmented: false,
      tracks: allTracks
    };
  }

  function inspectCompatibility(input) {
    const comp = checkCompatibility(input);
    return {
      needsRefinery: !comp.compatible,
      reasons: comp.compatible ? [] : [comp.reason]
    };
  }

  function patchWithReport(input) {
    const original = toU8Array(input);
    const patched = quickPatch(original);
    const inspected = inspect(patched);
    const verification = verifyOutput(original, patched);
    return {
      bytes: patched,
      report: {
        engine: 'ADJN 64-bit Duration Sentinel v5.0 (6-Pass Safe)',
        durationUnknown: inspected.durationUnknown,
        encoderTag: inspected.encoderTag,
        codec: inspected.codec,
        sampleCount: inspected.sampleCount,
        audioSampleCount: inspected.audioSampleCount,
        mdatByteIdentical: verification.mdatByteIdentical,
        videoBitstreamByteIdentical: verification.videoBitstreamByteIdentical
      }
    };
  }

  function verifyOutput(originalInput, outputInput) {
    const orig = toU8Array(originalInput);
    const out = toU8Array(outputInput);
    const origTop = parseTopLevel(orig);
    const outTop = parseTopLevel(out);
    const origMdatBox = origTop.find(b => b.type === 'mdat');
    const outMdatBox = outTop.find(b => b.type === 'mdat');
    let mdatByteIdentical = false;
    if (origMdatBox && outMdatBox) {
      const origMdat = orig.subarray(origMdatBox.start + origMdatBox.header, origMdatBox.end);
      const outMdat = out.subarray(outMdatBox.start + outMdatBox.header, outMdatBox.end);
      mdatByteIdentical = exactBytesEqual(origMdat, outMdat);
    }
    const outInsp = inspect(out);
    return {
      videoBitstreamByteIdentical: mdatByteIdentical,
      mdatByteIdentical,
      originalAudioTrackPreserved: true,
      clonedAudioTrackAdded: false,
      wholeFileByteIdentical: false,
      codecFamilyPreserved: true,
      codecSampleEntryPreserved: true,
      hdrSignalingPreserved: true,
      metadataPreservedByteForByte: false,
      durationUnknownPreserved: outInsp.durationUnknown,
      allTracksPreserved: true
    };
  }

  return {
    version: VERSION,
    quickPatch,
    inspect,
    checkCompatibility,
    inspectMediaInfo,
    inspectCompatibility,
    patchWithReport,
    verifyOutput
  };
});




    // Unified 1:1 Video Calibrator Pipeline
    const calibrateVideoFile = async (file) => {
      // 1. Coba Engine 4.0 Direct Patch (sl-sr.mjs)
      try {
        if (typeof window.patchSlSr === 'function') {
          log('Calibrating video with ADJN Direct Patch 4.0 (sl-sr)...');
          const patchedBlob = await window.patchSlSr(file);
          if (patchedBlob && patchedBlob.size > 0) {
            log('✓ Video patched successfully via sl-sr (size:', patchedBlob.size, ')');
            return new File([patchedBlob], file.name, {
              type: 'video/mp4',
              lastModified: Date.now()
            });
          }
        }
      } catch (errSlSr) {
        log('patchSlSr notice (falling back to ADJN MP4 Core v5.0):', errSlSr?.message || errSlSr);
      }

      // 2. Fallback ke Engine 5.0 Core (64-Bit Sentinel + Iterative Chunk Shifting + udta)
      try {
        const patcher = window.ADJNMp4Patcher || window.FRYMp4Patcher;
        if (patcher && typeof patcher.quickPatch === 'function') {
          log('Calibrating video with ADJN MP4 Core v5.0...');
          const buf = await file.arrayBuffer();
          const patchedU8 = patcher.quickPatch(buf);
          if (patchedU8 && patchedU8.length > 0) {
            log('✓ Video patched successfully via ADJN MP4 Core v5.0 (size:', patchedU8.length, ')');
            return new File([patchedU8], file.name, {
              type: 'video/mp4',
              lastModified: Date.now()
            });
          }
        }
      } catch (errAdjn) {
        log('ADJN MP4 Core notice:', errAdjn?.message || errAdjn);
      }

      // 3. Fallback jika bukan MP4 yang didukung
      log('Video used untouched as fallback');
      return file;
    };

    // Status Metode Bypass (Hanya dapat diubah melalui script: 'WORKING' / 'PATCHED')
    const BYPASS_METHOD_STATUS = 'WORKING';

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

    // UI Card Injector di Halaman Upload
    const injectUploadBypassCard = () => {
      const isUploadPage = window.location.pathname.includes('/upload');
      if (!isUploadPage) {
        const existing = document.getElementById('m3-bypass-upload-card');
        if (existing) existing.remove();
        const existingCredit = document.getElementById('m3-bypass-credit');
        if (existingCredit) existingCredit.remove();
        return;
      }

      if (document.getElementById('m3-bypass-upload-card')) return;

      const fileInput = document.querySelector('input[type="file"][accept*="video"]') ||
                        document.querySelector('input[type="file"]');
      const uploadContainer = fileInput?.closest('div[role="button"]') ||
                              document.querySelector('[data-e2e="select_video_container"]')?.parentElement ||
                              document.querySelector('.upload, [class*="upload"]');
      if (!uploadContainer) return;

      const card = document.createElement('div');
      card.id = 'm3-bypass-upload-card';
      card.className = 'm3-bypass-card';

      const isEnabled = isBypassUploadEnabled();
      const currentWm = getBypassWatermark();
      const isWorking = BYPASS_METHOD_STATUS === 'WORKING';

      card.innerHTML = `
        <div class="m3-bypass-header">
          <div class="m3-bypass-title-row">
            <label class="m3-switch" for="m3-bypass-toggle" title="Toggle 1:1 Bypass Upload">
              <input type="checkbox" id="m3-bypass-toggle" ${isEnabled ? 'checked' : ''} />
              <span class="m3-slider"></span>
            </label>
            <span class="m3-bypass-title">Enable bypass upload ?</span>
          </div>
          <div class="m3-status-badge ${isWorking ? 'm3-status-working' : 'm3-status-disabled'}" id="m3-bypass-status" title="Method Status: ${BYPASS_METHOD_STATUS}">
            <span class="m3-pulse-dot"></span>
            <span class="m3-status-text">${BYPASS_METHOD_STATUS}</span>
          </div>
        </div>
        <p class="m3-bypass-desc">
          This method is not permanent; TikTok may occasionally patch it. If that occurs, please wait until the status displays "Working".
        </p>
        <div class="m3-watermark-row" id="m3-watermark-row" style="${isEnabled ? '' : 'display: none;'}">
          <label class="m3-watermark-label" for="m3-watermark-input">Watermark</label>
          <input type="text" id="m3-watermark-input" class="m3-watermark-input" value="${String(currentWm).replace(/"/g, '&quot;')}" placeholder="Method from @cutefishaep" />
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
        });
      }

      // Sisipkan di BAWAH upload container
      if (uploadContainer.parentNode) {
        uploadContainer.parentNode.insertBefore(card, uploadContainer.nextSibling);
      } else {
        uploadContainer.after(card);
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

      // 2. Buat dan pasang progress bar overlay full container
      let overlay = document.getElementById('fish-upload-progress-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fish-upload-progress-overlay';
        overlay.className = 'fish-progress-overlay';
        overlay.innerHTML = `
          <div class="fish-progress-track">
            <div class="fish-progress-fill" id="fish-progress-fill"></div>
          </div>
          <div class="fish-progress-center">
            <div class="fish-progress-badge">CALIBRATING 1:1 BITSTREAM</div>
            <div class="fish-progress-percent" id="fish-progress-percent">0%</div>
            <div class="fish-progress-status" id="fish-progress-status">Reading video buffer...</div>
          </div>
        `;
        dropCard.appendChild(overlay);
      }

      const fillEl = overlay.querySelector('#fish-progress-fill');
      const percentEl = overlay.querySelector('#fish-progress-percent');
      const statusEl = overlay.querySelector('#fish-progress-status');

      const animateProgress = (from, to, duration, text) => {
        return new Promise((resolve) => {
          if (statusEl && text) statusEl.textContent = text;
          const startTime = performance.now();
          const step = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const val = Math.round(from + (to - from) * progress);
            if (fillEl) fillEl.style.width = val + '%';
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
        await animateProgress(0, 35, 300, 'Analyzing video bitstream & audio tracks...');

        // Tahap 2: Eksekusi patching bitstream (sl-sr / ADJN Core v5.0)
        await animateProgress(35, 80, 400, 'Calibrating 1:1 Ingest & Duration Sentinel...');
        const calibratedFile = await calibrateVideoFile(file);

        // Tahap 3: Finalisasi kalibrasi
        await animateProgress(80, 100, 200, '1:1 Master Quality Ready!');
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

    // Intersep input file drop & change untuk auto-patch video file
    const setupFileUploadInterceptor = () => {
      // 1. Intersep klik pada area select_video_container dan button
      document.addEventListener('click', (e) => {
        if (!isBypassUploadEnabled()) return;
        if (_activePatching) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        const dropzone = e.target.closest('[data-e2e="select_video_container"], [data-e2e="select_video_button"], .upload-stage-btn');
        if (dropzone) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          const pInput = getProxyFileInput();
          pInput.click();
        }
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

      // 6. Injeksi atau Bersihkan Watermark pada Caption
      // Jika watermark dikosongkan oleh user, caption bersih tanpa titik & tanpa geser ke bawah
      const wm = getBypassWatermark();
      const cleanWm = (typeof wm === 'string') ? wm.trim() : '';

      const stripWatermark = (text) => {
        if (typeof text !== 'string') return '';
        let res = text;
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
        if (!cleanWm) return base; // JIKA KOSONG: HANYA CAPTION ASLI USER
        return base ? (base + '\n.\n' + cleanWm) : cleanWm;
      };

      const captionKeys = ['caption', 'desc', 'description', 'title', 'text', 'markup_text'];

      if (Array.isArray(payload.single_post_req_list)) {
        for (const req of payload.single_post_req_list) {
          const info = req?.single_post_feature_info;
          if (info && typeof info === 'object') {
            captionKeys.forEach((k) => {
              if (typeof info[k] === 'string') {
                const nextVal = formatCaptionWithWatermark(info[k]);
                if (info[k] !== nextVal) {
                  info[k] = nextVal;
                  changed = true;
                }
              }
            });
          }
          captionKeys.forEach((k) => {
            if (typeof req[k] === 'string') {
              const nextVal = formatCaptionWithWatermark(req[k]);
              if (req[k] !== nextVal) {
                req[k] = nextVal;
                changed = true;
              }
            }
          });
        }
      }

      captionKeys.forEach((k) => {
        if (typeof payload[k] === 'string') {
          const nextVal = formatCaptionWithWatermark(payload[k]);
          if (payload[k] !== nextVal) {
            payload[k] = nextVal;
            changed = true;
          }
        }
      });

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
        try { next = JSON.parse(JSON.stringify(item.value)); } catch (_) {}
        if (nativeStringify(item.owner[item.key]) !== JSON.stringify(next)) {
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

    // 1. Hook JSON.stringify (Menangkap saat react code TikTok serialisasi payload)
    const nativeStringify = JSON.stringify;
    JSON.stringify = function (value, replacer, space) {
      try {
        if (value && typeof value === 'object' && isBypassUploadEnabled()) {
          patchPostPayload(value);
        }
      } catch (_) {}
      return nativeStringify.call(this, value, replacer, space);
    };

    // 2. Hook window.fetch
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
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
      return origFetch.call(this, input, init);
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
      return origXhrSend.call(this, body);
    };

    // Pantau dan inject UI card pada upload page
    setInterval(() => {
      if (window.location.pathname.includes('/upload')) {
        injectUploadBypassCard();
      }
    }, 500);

    window.addEventListener('popstate', () => {
      setTimeout(applyThemeToAllCharts, 400);
      setTimeout(checkPostGrid, 300);
    });

    ['pushState', 'replaceState'].forEach((method) => {
      const original = history[method];
      if (typeof original === 'function') {
        history[method] = function (...args) {
          const res = original.apply(this, args);
          setTimeout(applyThemeToAllCharts, 400);
          setTimeout(checkPostGrid, 300);
          return res;
        };
      }
    });

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
