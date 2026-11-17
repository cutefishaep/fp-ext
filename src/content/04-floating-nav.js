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

  // Interval cepat 500ms untuk memastikan status modal & floating nav sinkron tanpa delay
  setInterval(() => {
    initFloatingNav();
    syncNavState();
    checkModals();
  }, 500);

