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

