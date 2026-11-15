---
name: real-browser-mcp
description: Panduan lengkap dan fool-proof cara mengendalikan real-browser-mcp tanpa error. Menjelaskan sintaks call_mcp_tool yang benar (Arguments wajib Objek/Record, bukan String JSON), mapping 24 tools, parameter valid, dan trik DOM manipulation/CSS injection/screenshot.
---

# Real Browser MCP: Idiot-Proof Mastery Guide

Skill ini adalah instruksi wajib bagi semua AI agent yang mengendalikan browser nyata pengguna melalui MCP server `real-browser`. Jangan pernah berasumsi atau mengarang nama argumen. Ikuti aturan di bawah ini secara ketat.

---

## ⚠️ ATURAN PALING KRUSIAL (BACA INI DULU ATAU PASTI ERROR!)

### 1. `Arguments` HARUS berupa Dictionary / Object Asli, BUKAN String JSON!
Kesalahan paling fatal yang sering dilakukan AI yang kurang teliti adalah mengubah argumen menjadi JSON string:
* ❌ **SALAH BESAR (Pasti Crash dengan error `expected record, received string`):**
  ```json
  "Arguments": "{\"action\": \"list\"}"
  ```
* ✅ **BENAR (Wajib seperti ini):**
  ```json
  "Arguments": {
    "action": "list"
  }
  ```

### 2. Jangan Mengarang Argumen yang Tidak Ada di Schema
* Pada `browser_evaluate`:
  * ❌ **SALAH:** `{ "script": "...", "tabId": 123 }` (Argumen `script` dan `tabId` TIDAK ADA!)
  * ✅ **BENAR:** `{ "expression": "document.title" }`
* Pada `browser_tabs`:
  * ❌ **SALAH:** `{}` tanpa action
  * ✅ **BENAR:** `{ "action": "list" }`

### 3. Lingkungan Eksekusi di Browser adalah Client-Side (DOM / Window), BUKAN Node.js!
* ❌ **SALAH:** Menjalankan `require('fs')` atau `process.cwd()` di dalam `browser_evaluate` atau `browser_run_action`. Browser tidak memiliki akses filesystem Node.js!
* ✅ **BENAR:** Gunakan Web API standar (`document.querySelector`, `document.createElement`, `fetch`, `window.location`).

---

## 📋 Daftar Lengkap 24 Tools `real-browser` & Contoh Payload

Semua pemanggilan dilakukan melalui tool wrapper:
`call_mcp_tool(ServerName="real-browser", ToolName="<NAMA_TOOL>", Arguments={ ... })`

### A. Tab & Navigasi
| Tool | Deskripsi | Parameter Wajib & Opsional | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_tabs` | Kelola tab Chrome yang sedang terbuka | `action` (wajib): `"list"`, `"create"`, `"close"`, `"focus"`, `"name"`, `"ungroup"`. `tabId` (number, opsional). `url` (string, untuk create). | `{ "action": "list" }`<br>`{ "action": "focus", "tabId": 631646459 }`<br>`{ "action": "create", "url": "https://example.com" }` |
| `browser_navigate` | Navigasi URL pada tab aktif | `url` (string, wajib), `new_tab` (boolean, opsional) | `{ "url": "https://www.tiktok.com/tiktokstudio/upload" }` |

### B. Melihat & Memeriksa Halaman
| Tool | Deskripsi | Parameter | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_screenshot` | Tangkap screenshot tab aktif saat ini | `format` ("png" / "jpeg"), `quality` (0-100) | `{}` *(default format png)* atau `{ "format": "png" }` |
| `browser_snapshot` | Ambil Accessibility Tree elemen & atribut `ref` (`e1`, `e2`, dll) | `compact` (boolean, default true: hanya elemen interaktif), `maxDepth` (number) | `{ "compact": true }` |
| `browser_text` | Ekstrak teks mentah dari halaman atau elemen tertentu | `selector` (string, opsional), `maxLength` (number) | `{ "selector": ".caption-markup" }` |
| `browser_find` | Cari keberadaan elemen berdasarkan CSS selector | `query` (string, wajib: CSS selector) | `{ "query": "input.titleInput-JiU8Rn" }` |

### C. Interaksi Pengguna (Klik, Ketik, Form)
| Tool | Deskripsi | Parameter | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_click` | Klik elemen menggunakan ref dari snapshot atau CSS selector | `ref` (string, e.g. "e5") ATAU `selector` (string). `button` ("left"/"right"/"middle"), `doubleClick` (boolean) | `{ "selector": "button#web-creation-caption-hashtag-button" }` atau `{ "ref": "e5" }` |
| `browser_click_text` | Klik elemen berdasarkan teks yang tampak (sangat ampuh untuk React portal, dropdown, overlay) | `text` (string, wajib), `exact` (boolean, default false), `index` (number) | `{ "text": "Use" }` atau `{ "text": "For You", "exact": true }` |
| `browser_type` | Ketik teks ke input atau contenteditable | `text` (string, wajib). `selector` atau `ref`. `clear` (boolean, default false) | `{ "selector": "input.titleInput-JiU8Rn", "text": "Video Keren", "clear": true }` |
| `browser_fill_form` | Isi banyak input sekaligus dalam satu kali panggil | `fields` (array of `{ selector/ref, value, type }`), `submit` (boolean) | `{ "fields": [{ "selector": "input[name='title']", "value": "Test" }] }` |
| `browser_scroll` | Scroll halaman atau kontainer tertentu | `direction` ("up"/"down"/"left"/"right"), `amount` (pixels), `selector` (opsional) | `{ "direction": "down", "amount": 400 }` |
| `browser_hover` | Arahkan kursor ke elemen (memicu tooltip / hover) | `selector` atau `ref` | `{ "selector": ".photoItem-UG1zR_" }` |
| `browser_select` | Pilih opsi pada elemen `<select>` native | `selector` atau `ref`, `value` (string) | `{ "selector": "select#category", "value": "gaming" }` |
| `browser_press_key` | Kirim tombol keyboard (Enter, Escape, Tab, panah) | `key` (string, wajib) | `{ "key": "Enter" }` atau `{ "key": "Escape" }` |
| `browser_drag` | Drag & drop antar elemen menggunakan event CDP | `startSelector` / `startRef`, `endSelector` / `endRef`, `steps` | `{ "startSelector": "#item1", "endSelector": "#dropzone" }` |
| `browser_upload_file` | Upload file ke `input[type="file"]` (aman dari pembatasan CSP) | `filePath` (string, file lokal tunggal), `files` (array), `selector` (opsional) | `{ "filePath": "/path/to/image.png", "selector": "input[type='file']" }` |

### D. Eksekusi JavaScript & CSP Bypass
| Tool | Deskripsi | Parameter Wajib | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_evaluate` | Jalankan kode JavaScript ekspresi di halaman dan dapatkan return value | `expression` (string, wajib) | `{ "expression": "document.querySelector('.titleItem-pghIph').getBoundingClientRect()" }` |
| `browser_run_action` | Jalankan fungsi JS via CDP (Bypass CSP halaman!) | `code` (string ekspresi objek dengan fungsi `execute(params)`), `actionParams` (objek) | Lihat contoh inject CSS di bawah |

### E. Menunggu & Sinkronisasi SPA
| Tool | Deskripsi | Parameter | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_wait` | Tunggu hingga elemen muncul/hilang atau delay tertentu | `selector` (string), `state` ("visible" / "hidden" / "attached"), `timeout` (ms), `delay` (ms) | `{ "selector": ".MusicPickerView__root", "state": "visible", "timeout": 5000 }` atau `{ "delay": 1000 }` |
| `browser_handle_dialog` | Tangani popup alert/confirm/prompt bawaan browser | `action` ("accept" / "dismiss"), `promptText` | `{ "action": "accept" }` |

### F. Debugging & Console
| Tool | Deskripsi | Parameter | Contoh Pemanggilan `Arguments` |
|---|---|---|---|
| `browser_console` | Baca log console browser (log, warn, error) | `clear` (boolean, default false) | `{ "clear": true }` |
| `browser_network` | Ambil ringkasan request network (fetch/XHR) | `clear` (boolean, default false) | `{}` |

---

## 🚀 Resep Praktis & Contoh Nyata

### Resep 1: Cara Inject CSS Langsung ke Halaman Menggunakan `browser_run_action` (Anti-CSP)
Jika halaman memiliki CSP (Content Security Policy) ketat, gunakan `browser_run_action`:
```json
{
  "code": "({ name: 'inject-style', execute: function(p) { let s = document.getElementById('debug-style'); if (!s) { s = document.createElement('style'); s.id = 'debug-style'; document.head.appendChild(s); } s.textContent = p.css; return { content: [{ type: 'text', text: 'Injected ' + p.css.length + ' chars' }] }; } })",
  "actionParams": {
    "css": "body { background: #111512 !important; }"
  }
}
```

### Resep 2: Cara Mengambil Screenshot Bersih untuk Verifikasi
Jangan kirim argumen kosong bertipe string!
* ✅ **Pemanggilan:**
  ```json
  call_mcp_tool(
    ServerName="real-browser",
    ToolName="browser_screenshot",
    Arguments={}
  )
  ```

### Resep 3: Cara Klik Tombol yang Susah Diseleksi dengan CSS
Gunakan `browser_click_text` yang mencari teks tampak bahkan di dalam React portals:
```json
call_mcp_tool(
  ServerName="real-browser",
  ToolName="browser_click_text",
  Arguments={
    "text": "+ Add sound"
  }
)
```

### Resep 4: Siklus Kerja Lengkap (The Standard Loop)
1. **Cek Tab Aktif:** `browser_tabs` -> pastikan tab yang tepat yang sedang aktif. Jika belum aktif, panggil `{ "action": "focus", "tabId": ... }`.
2. **Lihat Keadaan:** `browser_screenshot` -> periksa visual saat ini.
3. **Ambil Data Interaktif:** `browser_snapshot` -> dapatkan ref ID elemen (`e0`, `e1`, `e2`).
4. **Lakukan Aksi:** `browser_click` / `browser_type` / `browser_run_action`.
5. **Tunggu:** `browser_wait` dengan `delay: 500` atau menunggu selector elemen target.
6. **Verifikasi:** `browser_screenshot` -> pastikan hasil sesuai sebelum melapor ke pengguna.

---
*Dokumentasi ini dibuat otomatis agar AI mana pun dapat berinteraksi dengan real-browser-mcp tanpa gagal validasi format data.*
