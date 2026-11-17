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

  const cleanModalWrappers = () => {
    const modalContainers = document.querySelectorAll(
      'div[role="dialog"], ' +
      'div[role="alertdialog"], ' +
      '.TUXModal, ' +
      '.common-modal, ' +
      'div[data-tt="components_Modal_Container"], ' +
      'div[class*="confirm-modal"], ' +
      'div[class*="delete-modal"], ' +
      'div[class*="ConfirmModal"]'
    );

    modalContainers.forEach(container => {
      // Abaikan floating nav dan quality checker modal kita sendiri
      if (container.id === 'fish-quality-modal' || container.closest('#m3-floating-nav')) return;

      container.style.setProperty('background', '#1a221c', 'important');
      container.style.setProperty('background-color', '#1a221c', 'important');
      container.style.setProperty('border-radius', '28px', 'important');
      container.style.setProperty('border', '1px solid rgba(163, 219, 167, 0.25)', 'important');
      container.style.setProperty('box-shadow', '0 24px 64px rgba(0, 0, 0, 0.85)', 'important');
      container.style.setProperty('overflow', 'hidden', 'important');
      container.style.setProperty('color', '#f2f7f2', 'important');

      // Bersihkan semua background putih di dalam modal dialog
      container.querySelectorAll('div, section, footer, header, p, span').forEach(el => {
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('background', 'transparent', 'important');
      });

      // Mask / Backdrop
      let p = container.parentElement;
      while (p && p !== document.body) {
        if (p.classList.contains('TUXModal-mask') || (p.getAttribute('data-tt') || '').includes('Mask') || p.classList.contains('common-modal-mask')) {
          p.style.setProperty('background', 'rgba(0, 0, 0, 0.72)', 'important');
          p.style.setProperty('backdrop-filter', 'blur(6px)', 'important');
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
  };

  const checkModals = () => {
    modalCheckPending = false;
    const nav = document.getElementById('m3-floating-nav');
    if (!nav) return;

    // HANYA cari modal yang benar-benar TERLIHAT dan AKTIF (Kecualikan halaman upload & inline cards)
    const candidateModals = document.querySelectorAll(
      'div[data-tt="components_Modal_Container"].css-ee0r8k, ' +
      'div[data-tt="components_Modal_Container"]:has(div[data-tt="components_Modal_ButtonContainer"]), ' +
      'div[data-tt="components_Modal_Container"]:has(._TUXModalTitle), ' +
      '.common-modal-confirm-modal, ' +
      'div[class*="confirm-modal"]:not(#m3-floating-nav), ' +
      'div[class*="ConfirmModal"]:not(#m3-floating-nav), ' +
      'div[class*="delete-modal"]:not(#m3-floating-nav), ' +
      '.cover-modal-content, ' +
      '#fish-quality-modal-overlay'
    );

    let shouldBeOpen = false;
    for (let i = 0; i < candidateModals.length; i++) {
      if (isElementVisible(candidateModals[i])) {
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

  const scheduleCheckModals = () => {
    autoDismissTutorials();
    if (modalCheckPending) return;
    modalCheckPending = true;
    requestAnimationFrame(checkModals);
  };

  const modalObserver = new MutationObserver(scheduleCheckModals);

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

