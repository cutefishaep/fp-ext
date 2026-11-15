# Fish Acceleration — AGENT.md

> **Note:** If you speak Indonesian when talking to me, please translate to English.

Working guide for AI/agent working on this project. Read this first before touching code. Written so the agent **understands the flow directly** without guessing.

---

## 1. What is this?

**Fish Acceleration** = Chrome extension (Manifest V3) to **enhance TikTok Studio UI**.
Current version is still **experimental** (`src/`). No release yet (`Build/`).

First feature being worked on: **removing promo elements from TikTok Studio UI**:
- Promo banner "1 long video, multiple viral clips" (Smart Split / Try now)
- CapCut Online promo card ("Create high quality videos on CapCut Online" / "Try now")
- Upload page photo upload info card (file formats, size, aspect ratios)

---

## 2. Folder structure (important — don't place wrong)

```
Fish-Method/
├── src/                      # Extension source code. THIS is what you edit & what Chrome loads.
│   ├── manifest.json         # MV3, content script at https://www.tiktok.com/tiktokstudio/*
│   ├── content.js            # MutationObserver + log [fish-acc] to console
│   ├── content.css           # Hiding elements via static CSS (display:none !important)
│   └── icons/                # Placeholder PNG 16/32/48/128
│
├── Build/                    # (DOES NOT EXIST YET) Release snapshot. ONLY created when user explicitly asks.
│                             # DO NOT auto-build / auto-sync every time src/ changes.
│
├── Tools/                    # Dev tooling. NOT included in release. LIVES OUTSIDE src/.
│   ├── package.json          # `npm run pw` → bootstrap Playwright session
│   ├── node_modules/         # (gitignored)
│   └── scripts/
│       ├── pw-session.mjs    # Launch Chrome headed + load src/ + inject cookie + open Studio + CDP
│       └── make-icons.mjs    # Generate placeholder icons
│
├── .pw-profile/              # (gitignored) Persistent Chrome profile → TikTok login stays.
├── .mcp.json                 # Playwright MCP connect to CDP 127.0.0.1:9222
├── .gitignore
└── TK_cookies_cutefishaep.json  # Cookie export (TikTok + Google/YouTube). DO NOT DELETE.
```

### Golden folder rules
- **`src/` = experimental project.** All work & testing here. Free to edit, write brief report at the end.
- **`Build/` = release snapshot.** Only created when user says "build / release". Do not auto-build every edit.
- **`Tools/` = helper tools.** Do not put into extension manifest.

---

## 3. Workflow (this is the core so the agent understands)

### 3.1 How the agent "sees" TikTok Studio page
AI cannot see browser by default. Solution: **Playwright MCP + CDP**.

1. User/browser **runs** `npm run pw` (in `Tools/`) → script:
   - Launch **Chromium headed** (Playwright "Chrome for Testing"),
   - uses **persistent profile** `.pw-profile/` (TikTok login stays),
   - **loads extension from `src/`** (`--load-extension=src`),
   - **injects TikTok cookie** from `TK_cookies_cutefishaep.json` (Google/YouTube cookies IGNORED),
   - opens `https://www.tiktok.com/tiktokstudio`,
   - opens **CDP endpoint `http://127.0.0.1:9222`**.
2. Agent connects **Playwright MCP** to that CDP (via `.mcp.json`) → agent can:
   - `navigate_page` / click / scroll,
   - `take_snapshot` (DOM structure + bounding box, because `--snapshot-boxes`),
   - `evaluate_script` (query element, measure position),
   - `take_screenshot`,
   - `list_console_messages` (read `[fish-acc]` logs).

> **If MCP not connected:** agent may use Playwright API directly via `run_command` (see `Tools/scripts/`), or write a one-off probe script.

> **CRITICAL for Nemotron / Llama models calling `call_mcp_tool`:**
> Parameter `Arguments` MUST ALWAYS be a native JSON Object (`{"action": "list"}` or `{}`), NEVER a stringified JSON string (`"{\"action\": \"list\"}"`). See `.agents/rules/mcp-tool-calling.md`.

### 3.2 "Match element & patch" workflow (main workflow)
User usually pastes block `=== ELEMENT HTML ===` + `=== ELEMENT INFO ===` (class + tag).
Agent **must** follow this flow:

1. **Find element on live page** using selector (class/tag) via `evaluate_script`.
2. If **found**:
   - measure `getBoundingClientRect()` + computed style + relative position to parent,
   - **write patch directly to `src/`** (CSS/JS),
   - reload extension + reload tab (via CDP if possible, otherwise reload tab only),
   - screenshot result → report.
3. If **not found**:
   - **DO NOT modify `src/`**.
   - Report without screenshot. If navigation to another page is needed, **ASK user first for URL/page** (don't just click menus).
   - Possible causes: element on different page / not yet rendered / inside iframe / selector changed (styled-jsx hash).

### 3.3 Verify "extension works"
Every session, check minimally:
1. Extension loaded (`chrome://extensions`),
2. No errors in console (read via `list_console_messages`),
3. UI appears / target element truly removed from DOM Studio.

---

## 4. Technical code principles

- **TikTok Studio uses React** → elements re-render. Because of that:
  - Main hiding via **static CSS** (`content.css`, `display:none !important`) → light & survives re-render.
  - `content.js` only **MutationObserver** to re-hide if React renders back + **log `[fish-acc]`** to console.
  - Class `jsx-*` is styled-jsx hash → can change every TikTok deploy. Current selectors in `content.css` / `content.js`:
  - `.jsx-1195011304.container-new` — Smart Split / Try now promo banner
  - `.jsx-2808274669.card` — CapCut Online promo card
  - `.root-U7qACv` — Upload page photo upload info card
  - `.css-9byods.edss2sz8` — Upload page overflowing flex container (made scrollable instead of hidden)
  If a class changes, agent must update selector in both `content.css` and `content.js`.
- **Layout overflow fix (responsive):** `html`/`body` use `overflow-x: clip` + `max-width: 100vw`. Scroll containers use `overflow-x: auto` so content can scroll instead of overflow. `*` uses `max-width: 100%` + `box-sizing: border-box`. Media queries scale down fonts on screens ≤768px and ≤480px for mobile desktop mode / small monitors. Flex items get `min-width: 0` so they can shrink below content size. Images/media scale with `max-width: 100%` + `height: auto`. Sidebar narrows to 56px (≤768px) / 48px (≤480px). Upload card gets full width + reduced padding on small screens. Primary button goes full width on ≤768px.
- No popup / background / rules.json for now (already agreed). Do not add without being asked.

## Overflow fix notes (berdasarkan computed style asli TikTok Studio)
- `#root`: `min-width: 1280px` (dari computed style asli) → override ke `min-width: 0`, `width: 100%`, `max-width: 100vw` (ROOT CAUSE overflow di layar < 1280px)
- `html`/`body`: `overflow-x: clip` + `max-width: 100vw` (asli: `overflow-x: visible`)
- `*`: `max-width: 100%` + `box-sizing: border-box` + `overflow-wrap: break-word` + `word-break: break-word`
- `img, video, canvas, svg`: `max-width: 100%` + `height: auto`
- Flex children + `[class*="container/layout/wrapper/card/panel"]`: `min-width: 0` agar bisa menyusut
- `.css-9byods.edss2sz8`: `max-width: 100%` + `overflow-x: auto` + `flex-wrap: wrap`
- `ScrollList__listBox`, `ScrollList__root`, `.css-1sadv82.edss2sz9`, `.css-6h4bzt.edss2sz7`: `overflow-x: auto` + `max-width: 100%`
- `.TUXTooltip-tooltip`: `max-width: calc(100vw - 16px)`, `min-width: 0`, `white-space: normal`, `word-break: break-word`
- `@media (max-width: 768px)`: font 14px, buttons 13px/8px padding, sidebar 56px (asli 247px), upload card full width + 12px padding, primary button full width (asli 208px)
- `@media (max-width: 480px)`: font 12px, buttons 12px/6px padding, sidebar 48px, upload card 8px padding

## Floating Bottom Navbar (Material 3)
- Dihapus — tidak 1:1 dengan desain asli TikTok Studio. Fokus sekarang hanya perbaikan overflow dan penyembunyikan promo elemen.

---

## 5. Current status (important — read before continuing)

- TikTok cookie **still valid** (logged in as `cutefishaep`, no login prompt).
- `.pw-profile/` **already saved** → login persistent. Cookie JSON is just fallback.
- **Target banner NOT yet found on Home page** (`/tiktokstudio`).
  On Home there's only sidebar menu "Smart Split" + knowledge card, not promo banner.
- Banner likely appears on: **Upload page** (`/tiktokstudio/upload`), **Smart Split page**, or as **popup/modal** after a few seconds.
- **Next task:** verify on live Upload page that all patched elements are truly hidden, then check for any remaining promo elements.

---

## 6. Quick commands

| Command | Function |
|---|---|
| `npm run pw` (in `Tools/`) | Open headed Playwright session + extension + login + Studio + CDP |
| `npm run pw -- --check` | Same, but verify banner then close browser |
| `node Tools/scripts/make-icons.mjs` | Regenerate placeholder icons |

---

## 7. Notes for other agents

- **DO NOT delete** `TK_cookies_cutefishaep.json` (contains login cookies, already backed up at `/tmp/fish-backup/`).
- **DO NOT auto-build** to `Build/`. Only when user asks.
- **DO NOT inject to all `*.tiktok.com`** — manifest limited to `/tiktokstudio/*`.
- If confused about element position, **ask user** (or ask for annotated screenshot) — do not guess.
