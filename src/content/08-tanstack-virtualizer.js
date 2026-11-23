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

