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

