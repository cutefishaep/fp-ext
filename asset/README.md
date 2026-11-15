# TikTok 1:1 Bitstream Bypass Method Assets

Folder ini berisi kumpulan script inti yang mengimplementasikan mekanisme 1:1 Ingest bypass TikTok:

1. **`sl-sr.js`**
   - Engine ADJN Direct Patch 4.0 (CompressBase).
   - Memodifikasi container MP4, menyuntikkan secondary silent/bypass audio track, kalkulasi ulang `stsc`/`stsz`/`stts`/`stco`/`co64`, serta injeksi metadata `Lavf` & watermark identitas.

2. **`adjn-mp4-core.js`**
   - Engine ADJN MP4 Core v5.0.
   - Melakukan injeksi 64-Bit Unknown Duration Sentinel (`0xffffffffffffffff`) pada atom `mvhd`, 6-stage iterative chunk offset shifting, dan verifikasi bit-by-bit `mdat` agar media payload 100% utuh tanpa re-encoding.

3. **`soundsafe-hook.js`**
   - Script interceptor network payload TikTok Studio (`JSON.stringify`, `fetch`, dan `XMLHttpRequest`).
   - Menginjeksi upload flags (`cloud_edit_is_use_video_canvas: false`, `disable_auto_bitrate: true`, `is_high_quality: true`, `video_fps: 144`, dll.) dan membersihkan pemicu kompresi server TikTok (`canvas_config`, `draft`, `vedit_segment_info`).

4. **`patcher.html`**
   - Studio Patcher offline mandiri berbasis HTML & WebAssembly.

5. **`ffmpeg-core.js`**
   - WebAssembly build FFmpeg untuk transcoding/remuxing lokal tanpa server eksternal.
