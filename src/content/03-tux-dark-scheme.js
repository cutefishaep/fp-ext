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

