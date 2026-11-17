# TikTok 1:1 Bitstream Bypass Method Assets

Folder ini berisi kumpulan aset, engine, dan tools pendukung untuk mekanisme 1:1 Bitstream Ingest Bypass:

```text
asset/
├── branding/       # Aset logo vektor SVG & icons PNG resmi (16px, 32px, 48px, 128px, 512px)
│   ├── logo.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon512.png
│
└── engines/        # Script inti mekanisme kalibrasi 1:1 & network interceptor
    ├── patch.js            # Engine 5.0 Core (64-bit Duration Sentinel & chunk shifter, tanpa komentar)
    ├── sl-sr.js            # Engine 4.0 Direct Patch (dual audio AAC-LC & Lavf metadata)
    └── soundsafe-hook.js   # Library FRYMention — resolver @mention klikabel (UID asli via API TikTok), tanpa hook jaringan
```
