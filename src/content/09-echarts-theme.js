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
      // Post page & Upload page TIDAK memiliki ECharts — lewati agar nol lag dan CPU hemat!
      const isPostOrUpload = window.location.pathname.includes('/content') || 
                             window.location.pathname.includes('/post') || 
                             window.location.pathname.includes('/upload');
      if (isPostOrUpload) return;

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

