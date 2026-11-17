# Fish Acceleration — Struktur Source

Extension TikTok Studio enhancer (MV3). Manifest tetap memuat **satu file**
`content.js` + `content.css` (dibutuhkan agar semua kode tetap berada di dalam
satu IIFE di MAIN world — aman dari tabrakan global dengan script TikTok).

Source sudah dipecah per-section; build script menggabungkannya kembali
**byte-identik**.

## Struktur

```
fp-ext/
├── build.mjs            # build script (zero deps) — node build.mjs (concat + zip)
├── build/               # OUTPUT: fish-acceleration-v<versi>.zip (siap share/upload store)
├── src/
│   ├── manifest.json    # TIDAK berubah — tetap memuat content.js / content.css
│   ├── rules.json       # declarativeNetRequest (desktop UA)
│   ├── content/         # ← EDIT DI SINI (13 part JS, urut nama file)
│   │   ├── 00-header.js               # judul file
│   │   ├── 01-boot.js                 # IIFE open, 'use strict', STRICT GUARD, React safeguard, post cache
│   │   ├── 02-ua-override.js          # 1. UA / platform mock (Edge Windows)
│   │   ├── 03-tux-dark-scheme.js      # 2. TUX dark color scheme
│   │   ├── 04-floating-nav.js         # 3. M3 floating nav bar
│   │   ├── 05-nav-autohide-modals.js  # 4. Auto-hide nav + cleanup modal
│   │   ├── 06-main-world-init.js      # 5. initMainWorldEnhancements() open + re-entry guard
│   │   ├── 07-video-link-handler.js   # A. Video link handler + quality modal
│   │   ├── 08-tanstack-virtualizer.js # B. TanStack virtualizer expander
│   │   ├── 09-echarts-theme.js        # C. ECharts M3 dark matcha theme
│   │   ├── 10-bypass-upload-engine.js # D. 1:1 bypass engine + remote patcher + card UI
│   │   ├── 11-triple-hook-upload.js   # Triple-hook JSON.stringify / Fetch / XHR
│   │   └── 12-footer.js               # init call + IIFE close
│   ├── styles/          # ← EDIT DI SINI (31 part CSS, urut nama file)
│   │   ├── 00-header.css … 30-bypass-upload-card.css
│   │   └── (satu file per section besar, nama = judul section-nya)
│   ├── content.js       # GENERATED — jangan diedit langsung
│   └── content.css      # GENERATED — jangan diedit langsung
└── asset/engines/       # patch.js, sl-sr.js, soundsafe-hook.js (dimuat remote via GitHub)
```

## Workflow

```bash
node build.mjs     # gabungkan parts -> content.js + content.css + build/<nama>-v<versi>.zip
```

Lalu reload extension di `chrome://extensions`.

Build juga otomatis membuat **zip siap share** di `build/fish-acceleration-v<versi>.zip`
(nama & versi dibaca dari `manifest.json`; zip lama versi berbeda otomatis dihapus).
Isi zip: `manifest.json`, `content.js`, `content.css`, `rules.json`, `icons/` —
tanpa source parts & tanpa `_metadata/` (Chrome membuatnya ulang; Web Store menolaknya).

> ⚠️ `src/content.js` dan `src/content.css` adalah **generated files**.
> Edit part di `src/content/` atau `src/styles/`, bukan file gabungannya.
> Urutan & penomoran nama file menentukan urutan eksekusi — jangan diubah sembarangan.

## Catatan

- `.backup/` berisi snapshot monolith asli (pembukti byte-identik). Boleh dihapus.
- `.gitignore` saat ini hanya men-track `asset/` — source di `src/` tidak masuk git.
  Pertimbangkan whitelist `!/src/` + `!/build.mjs` supaya ter-backup.
