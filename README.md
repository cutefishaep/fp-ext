# Fish Acceleration — Struktur Source

Extension TikTok Studio enhancer (MV3). Memisahkan eksekusi **MAIN world** (hook halaman TikTok & UI Studio), **ISOLATED world** (patching video MP4 lokal di dalam ekstensi sebelum handover ke panel upload), dan **Background Service Worker** (probe metadata video lintas-origin secara aman tanpa menghapus CSP).

## Struktur

```
fp-ext/
├── build.mjs            # build script (zero deps) — node build.mjs (bundle + syntax check + zip)
├── build/               # OUTPUT: fish-acceleration-v<versi>.zip (siap share/upload store)
├── src/
│   ├── manifest.json    # MV3 manifest (MAIN + ISOLATED + background service worker)
│   ├── rules.json       # declarativeNetRequest (Desktop UA only — tanpa strip CSP/CORS wildcard)
│   ├── background.js    # Service worker: TikWM & CDN MP4 probe
│   ├── content/         # ← MAIN WORLD parts (urutan eksekusi by prefix)
│   │   ├── 00-header.js
│   │   ├── 01-boot.js                 # Path guard, React safeguard, SPA route bus, post cache
│   │   ├── 02-ua-override.js          # UA / platform mock (Edge Windows)
│   │   ├── 03-tux-dark-scheme.js      # TUX dark color scheme
│   │   ├── 04-floating-nav.js         # M3 floating nav bar
│   │   ├── 05-nav-autohide-modals.js  # Auto-hide nav + modal styling
│   │   ├── 06-main-world-init.js      # initMainWorldEnhancements()
│   │   ├── 07-video-link-handler.js   # Video link handler + Quality & Ingest Inspector
│   │   ├── 08-tanstack-virtualizer.js # TanStack virtualizer expander
│   │   ├── 09-echarts-theme.js        # ECharts M3 dark matcha theme
│   │   ├── 10-extension-bridge.js     # Bridge MAIN <-> ISOLATED (settings & probe)
│   │   ├── 11-triple-hook-upload.js   # Triple-hook JSON.stringify / Fetch / XHR
│   │   └── 12-footer.js
│   ├── isolated/        # ← ISOLATED WORLD parts (patching & storage aman di ekstensi)
│   │   ├── 00-header.js               # IIFE open + path guard
│   │   ├── 01-storage-bridge.js       # chrome.storage.local + migrasi + bridge
│   │   ├── 02-upload-patcher.js       # Bundled sl-sr & patch.js calibrator + handover
│   │   └── 03-footer.js
│   ├── styles/          # ← EDIT DI SINI (31 part CSS, urut nama file)
│   ├── content.js       # GENERATED — jangan diedit langsung
│   ├── isolated.js      # GENERATED — jangan diedit langsung
│   └── content.css      # GENERATED — jangan diedit langsung
└── asset/engines/       # patch.js, sl-sr.js, soundsafe-hook.js (dibundel lokal saat build)
```

## Workflow

```bash
node build.mjs     # bundle parts & engines -> content.js + isolated.js + content.css + zip
```

Lalu reload extension di `chrome://extensions`.
