# 🐟 Fish Acceleration — TikTok Studio Enhancer

> **Ekstensi Chrome Manifest V3** untuk menyulap antarmuka **TikTok Studio** (`https://www.tiktok.com/tiktokstudio/*`) menjadi modern, responsif di HP & PC, bertema **Material 3 Dark Matcha**, serta dilengkapi fitur **Live Auto-Sync dari GitHub (Cukup 1x Pasang Seumur Hidup)**.

---

## ✨ Fitur Unggulan

1. ⚡ **GitHub Live Auto-Sync (1x Pasang Seumur Hidup)**
   - Pengguna cukup memasang ekstensi ini **sekali saja**.
   - Setiap kali author melakukan `git push` pembaruan CSS/styling ke repository GitHub, ekstensi secara otomatis mengunduh (*fetch*) tampilan terbaru di latar belakang.
   - Dilengkapi *instant local caching* (0ms latency, bebas kedip/flicker) dan CDN fallback (`jsdelivr`).

2. 🍵 **Material 3 Dark Theme (Matcha / Green Tea)**
   - Menghilangkan tema putih silau bawaan TikTok Studio.
   - Menggunakan palet warna standar Material Design 3 Dark: Surface Slate Dark (`#111512`), Accent Matcha (`#a3dba7`), serta teks berkontras tinggi yang ramah mata.

3. 📱 **Mobile & Desktop Fully Responsive**
   - **Anti-Redirect**: Meng-override User-Agent agar TikTok Studio dapat dibuka penuh di browser mobile/tablet tanpa dipaksa redirect ke aplikasi TikTok.
   - **Home Page**: Perbaikan thumbnail video proporsional (60x80px), judul video mendatar rapi tanpa teks terlipat per karakter vertikal, serta kartu metrik fleksibel.
   - **Content / Post Page**: Kartu postingan grid modern dan lega (`minmax(250px, 1fr)` di PC, 2-kolom di HP) dengan pemisahan baris statistik angka dan tombol privasi agar tidak saling bertumpuk.
   - **Analytics Page**: Grafik ECharts membentang 100% penuh dengan progress bar *Traffic Source* bertema hijau matcha yang presisi.

4. 🧭 **Material 3 Floating Navigation Bar**
   - Navigasi melayang berbentuk pil modern di bagian bawah layar:
     - 🏠 **Home**
     - 🎬 **Post / Content**
     - ➕ **Upload Shortcut**
     - 📊 **Analytics**
     - 👤 **Profile Switcher**

---

## 🚀 Cara Pemasangan (Untuk Pengguna)

Pengguna **hanya perlu melakukan langkah ini 1 kali saja**:

1. Unduh atau clone repository ini:
   ```bash
   git clone https://github.com/wahyucraft2/Fish-Method.git
   ```
2. Buka Google Chrome / Edge / Kiwi Browser / Chromium lainnya.
3. Kunjungi halaman ekstensi: **`chrome://extensions`**.
4. Aktifkan **Developer mode** (Mode pengembang) di pojok kanan atas.
5. Klik tombol **Load unpacked** (Muat yang belum dibongkar).
6. Pilih folder **`src`** di dalam repositori ini.
7. Selesai! Buka **`https://www.tiktok.com/tiktokstudio`**. Ekstensi akan otomatis aktif dan memperbarui dirinya sendiri setiap kali ada update baru di GitHub.

---

## 📂 Struktur Direktori

```text
Fish-Method/
├── src/                      # Source code ekstensi Chrome (Folder ini yang di-load ke Chrome)
│   ├── manifest.json         # Manifest V3 configuration & permissions
│   ├── content.js            # Main World script (UA override, ECharts hook, Floating Nav)
│   ├── updater.js            # Isolated World script (GitHub Live Auto-Sync engine)
│   ├── content.css           # Material 3 Dark stylesheet & responsive layout
│   ├── rules.json            # DeclarativeNetRequest ruleset (Desktop UA header)
│   ├── config.json           # Konfigurasi repository GitHub
│   └── icons/                # Icon ekstensi (16px, 32px, 48px, 128px)
│
├── Tools/                    # Developer testing & tools (di luar ekstensi)
│   ├── scripts/              # Playwright test scripts & automation
│   └── package.json          # Dependency tooling dev
│
├── .gitignore                # Filter file rahasia & kredensial agar aman di-push
├── AGENT.md                  # Dokumentasi panduan teknis internal
└── README.md                 # Dokumentasi proyek publik
```

---

## 🔒 Keamanan & Privasi
- Ekstensi ini **MURNI 100% HANYA MEMODIFIKASI TAMPILAN (UI/UX)**.
- Ekstensi **TIDAK memiliki izin `cookies`** dan **TIDAK membaca atau menyentuh kredensial login pengguna**.
- Kredensial lokal pribadi telah diamankan di `.gitignore` sehingga tidak akan pernah bocor saat di-push ke GitHub.

---

## 📝 Lisensi
MIT License © 2026 Fish Acceleration.
