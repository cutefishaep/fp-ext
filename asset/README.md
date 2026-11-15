# TikTok 1:1 Bitstream Bypass Method Assets

Folder ini berisi kumpulan aset, engine, dan tools pendukung untuk mekanisme 1:1 Bitstream Ingest Bypass:

```text
asset/
├── branding/       # Aset logo vektor & icons resmi resolusi 16px - 512px
│   ├── logo.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon512.png
│
├── engines/        # Script inti engine kalibrasi & interceptor bitstream
│   ├── sl-sr.js            # Engine 4.0 Direct Patch (CompressBase - AAC Dual Track & Lavf metadata)
│   ├── adjn-mp4-core.js    # Engine 5.0 Core (64-Bit Duration Sentinel & iterative chunk shifter)
│   └── soundsafe-hook.js   # Script hook network payload upload TikTok Studio
│
└── studio/         # Studio kalibrasi offline mandiri & WebAssembly decoder
    ├── patcher.html        # Patcher Studio web GUI offline
    └── ffmpeg-core.js      # WebAssembly build FFmpeg untuk transcoding lokal
```
