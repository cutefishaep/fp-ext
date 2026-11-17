    /* A. Buka Link Video TikTok di Tab Baru saat Thumbnail Diklik */
    const getUsername = () => {
      try {
        if (window.__Creator_Center_Context__?.uploadUserProfile?.user?.unique_id) {
          return window.__Creator_Center_Context__.uploadUserProfile.user.unique_id;
        }
        if (window.__Creator_Center_Context__?.commonAppContext?.user?.uniqueId) {
          return window.__Creator_Center_Context__.commonAppContext.user.uniqueId;
        }
      } catch (e) {}

      try {
        const profileLink = document.querySelector('a[href*="/@"]');
        if (profileLink && profileLink.href) {
          const match = profileLink.href.match(/@([^/?#]+)/);
          if (match && match[1]) return match[1];
        }
      } catch (e) {}

      return 'cutefishaep';
    };

    const escapeHTML = (str) => {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    const extractStatsFromCard = (card) => {
      if (!card) return { views: '—', likes: '—', comments: '—', engagement: '—' };

      // 1. Selector resmi dari komponen TikTok Studio (FlexRow_6 = Views, 7 = Likes, 8 = Comments)
      const vEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_6"]');
      const lEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_7"]');
      const cEl = card.querySelector('[data-tt="components_RowLayout_FlexRow_8"]');

      const getVal = (el) => {
        if (!el) return '';
        // Cari span teks murni yang tidak memiliki child element
        const leafSpans = Array.from(el.querySelectorAll('span, p, div'))
          .filter(s => s.children.length === 0)
          .map(s => s.textContent.trim())
          .filter(t => /^\d+[\d.,]*[KMBkmb]?$/.test(t));
        if (leafSpans.length > 0) {
          return leafSpans[0];
        }
        const raw = el.textContent.trim();
        const m = raw.match(/\b\d+[\d.,]*[KMBkmb]?\b/);
        return m ? m[0] : '';
      };

      let views = getVal(vEl);
      let likes = getVal(lEl);
      let comments = getVal(cEl);

      // 2. Fallback: cari leaf span terpisah di dalam card jika selector di atas tidak ada
      if (!views || !likes) {
        const allLeafSpans = Array.from(card.querySelectorAll('span'))
          .filter(s => s.children.length === 0)
          .map(s => s.textContent.trim())
          .filter(t => /^\d+[\d.,]*[KMBkmb]?$/.test(t));

        if (allLeafSpans.length >= 3) {
          views = views || allLeafSpans[0];
          likes = likes || allLeafSpans[1];
          comments = comments || allLeafSpans[2];
        }
      }

      views = views || '—';
      likes = likes || '—';
      comments = comments || '—';

      const parseNum = (str) => {
        if (!str || str === '—') return 0;
        let s = str.toUpperCase().replace(/,/g, '');
        let m = 1;
        if (s.endsWith('K')) { m = 1000; s = s.slice(0, -1); }
        else if (s.endsWith('M')) { m = 1000000; s = s.slice(0, -1); }
        else if (s.endsWith('B')) { m = 1000000000; s = s.slice(0, -1); }
        return (parseFloat(s) || 0) * m;
      };

      const vNum = parseNum(views);
      const lNum = parseNum(likes);
      const cNum = parseNum(comments);
      let engStr = '—';
      if (vNum > 0 && (lNum > 0 || cNum > 0)) {
        engStr = (((lNum + cNum) / vNum) * 100).toFixed(2) + '%';
      }

      return { views, likes, comments, engagement: engStr };
    };

    const getTitleFromCard = (card) => {
      if (!card) return 'TikTok Video';
      const titleEl = card.querySelector('[data-tt*="PostInfo"] span, div[data-tt*="PostInfo"] span, .css-1rk2x63 span, span[class*="title"], h1, h2, h3, a');
      if (titleEl && titleEl.textContent.trim()) return titleEl.textContent.trim();
      const allSpans = Array.from(card.querySelectorAll('span')).map(s => s.textContent.trim()).filter(t => t.length > 2 && !/^\d+[\d.,]*[KMBkmb]?$/.test(t) && !t.includes(':') && t !== 'Everyone' && t !== 'Only me' && t !== 'Friends');
      return allSpans[0] || 'TikTok Video';
    };

    const getCoverFromCard = (card) => {
      if (!card) return '';
      const img = card.querySelector('img');
      return img ? img.src : '';
    };

    const getItemDataFromCard = (card) => {
      if (!card) return null;

      // 1. Check React Fiber on card and its descendants
      const candidateEls = [
        card,
        card.querySelector('[data-tt*="VideoCover"]'),
        card.querySelector('[data-tt*="PostInfo"]'),
        card.querySelector('img'),
        card.querySelector('button')
      ].filter(Boolean);

      for (const el of candidateEls) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let f = el[fiberKey];
        let d = 0;
        while (f && d < 35) {
          if (f.memoizedProps) {
            const p = f.memoizedProps;
            const candidate = p.item || p.record || p.videoInfo || p.post || p.row || (p.data && (p.data.id || p.data.item_id) ? p.data : null);
            if (candidate && (candidate.item_id || candidate.id || candidate.desc || candidate.video)) {
              return candidate;
            }
            if (p.id || p.item_id) {
              const mapped = window.__fishPostsMap?.get(String(p.item_id || p.id));
              if (mapped) return mapped;
            }
          }
          f = f.return;
          d++;
        }
      }

      // 2. Match from DOM text / title against __fishPostsMap
      const title = getTitleFromCard(card);
      if (title && window.__fishPostsMap?.has('desc:' + title)) {
        return window.__fishPostsMap.get('desc:' + title);
      }

      // 3. Match from cover image URL against __fishPostsMap
      const imgSrc = getCoverFromCard(card);
      if (imgSrc && window.__fishPostsList?.length) {
        const found = window.__fishPostsList.find(p => {
          const c = p.video?.cover?.url_list?.[0] || p.video?.origin_cover?.url_list?.[0] || p.cover || '';
          return c && imgSrc.includes(c.split('?')[0]);
        });
        if (found) return found;
      }

      // 4. Match by index of card in grid against __fishPostsList
      const allCards = Array.from(document.querySelectorAll('[data-tt="components_RowLayout_FlexRow"]'))
        .filter(r => !r.closest('[data-tt*="Header"]') && !r.querySelector('[data-tt*="Header"]'));
      const cardIdx = allCards.indexOf(card);
      if (cardIdx !== -1 && window.__fishPostsList?.[cardIdx]) {
        return window.__fishPostsList[cardIdx];
      }

      return null;
    };

    const getItemIdFromCard = (card, itemData) => {
      if (itemData?.item_id) return String(itemData.item_id);
      if (itemData?.id) return String(itemData.id);
      if (!card) return null;

      const a = card.querySelector('a[href*="/video/"]');
      if (a && a.href) {
        const match = a.href.match(/\/video\/(\d+)/);
        if (match) return match[1];
      }

      const candidateEls = [card, card.querySelector('img'), card.querySelector('[data-tt*="VideoCover"]')].filter(Boolean);
      for (const el of candidateEls) {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;
        let f = el[fiberKey];
        let d = 0;
        while (f && d < 35) {
          if (f.memoizedProps) {
            const p = f.memoizedProps;
            const cid = p.item?.item_id || p.item?.id || p.record?.item_id || p.record?.id || p.videoInfo?.id || p.id || p.item_id;
            if (cid && String(cid).length > 8) return String(cid);
          }
          f = f.return;
          d++;
        }
      }

      const title = getTitleFromCard(card);
      if (title && window.__fishPostsMap?.has('desc:' + title)) {
        const itm = window.__fishPostsMap.get('desc:' + title);
        if (itm?.item_id || itm?.id) return String(itm.item_id || itm.id);
      }

      const allCards = Array.from(document.querySelectorAll('[data-tt="components_RowLayout_FlexRow"]'))
        .filter(r => !r.closest('[data-tt*="Header"]') && !r.querySelector('[data-tt*="Header"]'));
      const idx = allCards.indexOf(card);
      if (idx !== -1 && window.__fishPostsList?.[idx]) {
        const itm = window.__fishPostsList[idx];
        if (itm?.item_id || itm?.id) return String(itm.item_id || itm.id);
      }

      return null;
    };

    const isUndetectedMethodStr = (str) => {
      if (!str || typeof str !== 'string') return true;
      let s = str.trim();
      if (!s || s === '—' || s === '-' || s.toLowerCase() === 'unknown' || s.toLowerCase() === 'undetected') return true;
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
      }
      if (!s) return true;
      // Filter out internal MP4 atom names & technical box tags
      if (/^(data|stsd|avc1|mp4v|hdlr|meta|mdia|moov|trak|udta|ilst|desc|cmt|vide|soun)$/i.test(s)) return true;
      if (s.startsWith('{') && s.endsWith('}')) return true;
      try {
        if (s.startsWith('{')) { JSON.parse(s); return true; }
      } catch (_) {}
      if (/^(lavf|lavc|ffmpeg|handbrake|libav|x264|x265)/i.test(s)) return true;
      if (/^vid:[a-zA-Z0-9_-]+/i.test(s)) return true;
      if (/^v\d{4,}[a-zA-Z0-9_-]{8,}/i.test(s)) return true;
      if (/^(item_id|video_id|tos_id|aweme_id|music_id|author_id):/i.test(s)) return true;
      if (/^(isom|mp42|dash|iso2|qt|avc1|mp41)$/i.test(s)) return true;
      if (/^\d+$/.test(s)) return true;
      if (!/[a-zA-Z]/.test(s)) return true;
      return false;
    };

    const COUNTRY_NAMES_ID = {
      'ID': 'Indonesia', 'MY': 'Malaysia', 'SG': 'Singapura', 'US': 'Amerika Serikat',
      'TH': 'Thailand', 'VN': 'Vietnam', 'PH': 'Filipina', 'JP': 'Jepang',
      'KR': 'Korea Selatan', 'GB': 'Inggris', 'AU': 'Australia', 'BR': 'Brasil',
      'DE': 'Jerman', 'FR': 'Prancis', 'IN': 'India', 'RU': 'Rusia',
      'CA': 'Kanada', 'MX': 'Meksiko', 'IT': 'Italia', 'ES': 'Spanyol',
      'NL': 'Belanda', 'TR': 'Turki', 'SA': 'Arab Saudi', 'AE': 'Uni Emirat Arab',
      'CN': 'Tiongkok', 'TW': 'Taiwan', 'HK': 'Hong Kong'
    };

    const formatRegion = (code) => {
      if (!code) return '—';
      const upper = String(code).toUpperCase().trim();
      const name = COUNTRY_NAMES_ID[upper];
      return name ? `${name} (${upper})` : upper;
    };

    const formatUploadDate = (epoch) => {
      if (!epoch || isNaN(epoch)) return '—';
      try {
        const d = new Date(Number(epoch) * 1000);
        return d.toLocaleDateString('id-ID', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return '—';
      }
    };

    const formatStatNum = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '—';
      try { return new Intl.NumberFormat().format(num); } catch { return String(num); }
    };

    // Robust In-Browser MP4 Atom Byte Scanner (Exact logic from web-tools tiktok-quality-tool.js)
    const parseMp4MetadataFromBuffer = (buffer) => {
      if (!buffer || buffer.byteLength < 16) return null;
      const raw = buffer.buffer ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      let fps = null;
      let width = 0;
      let height = 0;
      let comment = '';
      let durationSec = 0;

      // 1. Resolution & Matrix rotation from tkhd
      for (let i = 0; i < raw.length - 8; i++) {
        if (raw[i] === 0x74 && raw[i+1] === 0x6B && raw[i+2] === 0x68 && raw[i+3] === 0x64) { // 'tkhd'
          const version = view.getUint8(i + 4);
          const wOffset = version === 1 ? i + 92 : i + 80;
          const hOffset = version === 1 ? i + 96 : i + 84;
          if (hOffset + 4 <= raw.length) {
            let w = Math.round(view.getUint32(wOffset) / 65536);
            let h = Math.round(view.getUint32(hOffset) / 65536);

            const matrixOffset = version === 1 ? (i - 4) + 60 : (i - 4) + 48;
            if (matrixOffset + 36 <= raw.length && w > 0 && h > 0) {
              const m0 = view.getInt32(matrixOffset, false) / 65536;
              const m4 = view.getInt32(matrixOffset + 16, false) / 65536;
              if (Math.abs(m0) < 0.5 && Math.abs(m4) < 0.5) {
                const tmp = w; w = h; h = tmp;
              }
            }
            if (w > 0 && h > 0 && w < 16000 && h < 16000) {
              width = w;
              height = h;
              break;
            }
          }
        }
      }

      // 2. FPS from 'vide' track mdhd & stts
      for (let i = 0; i < raw.length - 8; i++) {
        if (raw[i] === 0x76 && raw[i+1] === 0x69 && raw[i+2] === 0x64 && raw[i+3] === 0x65) { // 'vide'
          const searchStart = Math.max(0, i - 300);
          const searchEnd = Math.min(raw.length, i + 8000);
          let timescale = 0;
          let sampleDelta = 0;
          for (let j = searchStart; j < searchEnd - 8; j++) {
            if (raw[j] === 0x6D && raw[j+1] === 0x64 && raw[j+2] === 0x68 && raw[j+3] === 0x64) {
              const version = view.getUint8(j + 4);
              timescale = version === 1 ? view.getUint32(j + 24) : view.getUint32(j + 16);
              const dur = version === 1 ? view.getUint32(j + 32) : view.getUint32(j + 20);
              if (timescale > 0 && dur > 0) durationSec = Math.round(dur / timescale);
            }
            if (raw[j] === 0x73 && raw[j+1] === 0x74 && raw[j+2] === 0x74 && raw[j+3] === 0x73) {
              const entryCount = view.getUint32(j + 8);
              if (entryCount > 0) {
                sampleDelta = view.getUint32(j + 16);
              }
            }
            if (timescale > 0 && sampleDelta > 0) {
              const calcFps = Math.round(timescale / sampleDelta);
              if (calcFps > 0 && calcFps < 300) {
                fps = calcFps;
                break;
              }
            }
          }
          if (fps) break;
        }
      }

      // 3. Fallback FPS scan if 'vide' atom was displaced
      if (!fps) {
        let timescale = 0;
        let sampleDelta = 0;
        for (let i = 0; i < raw.length - 8; i++) {
          if (raw[i] === 0x6D && raw[i+1] === 0x64 && raw[i+2] === 0x68 && raw[i+3] === 0x64) {
            const version = view.getUint8(i + 4);
            timescale = version === 1 ? view.getUint32(i + 24) : view.getUint32(i + 16);
          }
          if (raw[i] === 0x73 && raw[i+1] === 0x74 && raw[i+2] === 0x74 && raw[i+3] === 0x73) {
            const entryCount = view.getUint32(i + 8);
            if (entryCount > 0) {
              sampleDelta = view.getUint32(i + 16);
            }
          }
          if (timescale > 0 && sampleDelta > 0) {
            const calcFps = Math.round(timescale / sampleDelta);
            if (calcFps > 0 && calcFps < 300) {
              fps = calcFps;
              break;
            }
          }
        }
      }

      // 4. Comment / Ingest Method — iTunes ilst walker (moov → udta → meta → ilst)
      // BUKAN blind byte-scan: scan mentah bisa menangkap byte acak di dalam mdat
      // (data video terkompresi) dan menampilkan teks sampah seperti "d?F".
      // Kedua engine (sl-sr.js & patch.js) menulis metadata di moov/udta/meta/ilst.
      const walkBoxes = (start, end, depth) => {
        const boxes = [];
        if (depth > 5) return boxes;
        let p = start;
        while (p + 8 <= end) {
          let size = view.getUint32(p);
          const type = String.fromCharCode(raw[p + 4], raw[p + 5], raw[p + 6], raw[p + 7]);
          let header = 8;
          if (size === 1) {
            if (p + 16 > end) break;
            size = view.getUint32(p + 8) * 4294967296 + view.getUint32(p + 12);
            header = 16;
          } else if (size === 0) {
            size = end - p;
          }
          if (size < header || p + size > end) break;
          boxes.push({ type, payloadStart: p + header, payloadEnd: p + size });
          p += size;
        }
        return boxes;
      };

      const findIlst = (start, end, depth) => {
        for (const b of walkBoxes(start, end, depth)) {
          if (b.type === 'ilst') return b;
          if (b.type === 'moov' || b.type === 'udta') {
            const hit = findIlst(b.payloadStart, b.payloadEnd, depth + 1);
            if (hit) return hit;
          } else if (b.type === 'meta') {
            // 'meta' bisa fullbox (4 byte version/flags, gaya iTunes) atau box biasa
            const hit = findIlst(b.payloadStart, b.payloadEnd, depth + 1) ||
              (b.payloadStart + 4 <= b.payloadEnd ? findIlst(b.payloadStart + 4, b.payloadEnd, depth + 1) : null);
            if (hit) return hit;
          }
        }
        return null;
      };

      const tagMap = {};
      const ilstAtom = findIlst(0, raw.length, 0);
      if (ilstAtom) {
        for (const child of walkBoxes(ilstAtom.payloadStart, ilstAtom.payloadEnd, 2)) {
          const dataBox = walkBoxes(child.payloadStart, child.payloadEnd, 3).find((d) => d.type === 'data');
          if (!dataBox) continue;
          const dataType = view.getUint32(dataBox.payloadStart);
          if (dataType !== 1 && dataType !== 0) continue; // 13/14 = binary (jpeg/png)
          let s = '';
          for (let k = dataBox.payloadStart + 8; k < dataBox.payloadEnd; k++) {
            const c = raw[k];
            if (c === 0) break;
            if (c >= 0x20 && c <= 0x7E) s += String.fromCharCode(c);
          }
          s = s.trim();
          if (s && !tagMap[child.type]) tagMap[child.type] = s;
        }
      }

      // Prioritas tag metode: cmt ("Method from @cutefishaep" — sl-sr) → cprt → des →
      // too ("Method From cutefish.my.id" — patch.js; "Lavf…" otomatis terfilter)
      const methodTagOrder = ['\u00A9cmt', 'cprt', '\u00A9des', 'desc', '\u00A9too', 'too', '\u00A9nam', '\u00A9xyz', 'nam'];
      for (const tag of methodTagOrder) {
        const cand = tagMap[tag];
        if (cand && !isUndetectedMethodStr(cand)) {
          comment = cand;
          break;
        }
      }

      return { fps, width, height, comment, duration: durationSec };
    };

    const openQualityCheckerModal = async (itemId, itemData, card) => {
      const existing = document.getElementById('fish-quality-modal-overlay');
      if (existing) existing.remove();

      const username = getUsername() || 'cutefishaep';
      const initialTitle = itemData?.desc || itemData?.title || getTitleFromCard(card);
      const initialCover = itemData?.video?.cover?.url_list?.[0] || 
                           itemData?.video?.origin_cover?.url_list?.[0] || 
                           itemData?.cover || 
                           getCoverFromCard(card);

      const domStats = extractStatsFromCard(card);
      const displayViews = itemData?.stats?.play_count !== undefined ? formatStatNum(itemData.stats.play_count) : domStats.views;
      const displayLikes = itemData?.stats?.digg_count !== undefined ? formatStatNum(itemData.stats.digg_count) : domStats.likes;
      const displayComments = itemData?.stats?.comment_count !== undefined ? formatStatNum(itemData.stats.comment_count) : domStats.comments;
      const displayShares = itemData?.stats?.share_count !== undefined ? formatStatNum(itemData.stats.share_count) : '—';
      const displaySaves = itemData?.stats?.collect_count !== undefined ? formatStatNum(itemData.stats.collect_count) : '—';
      const displayEngagement = (itemData?.stats?.play_count > 0)
        ? (((Number(itemData.stats.digg_count || 0) + Number(itemData.stats.comment_count || 0) + Number(itemData.stats.share_count || 0) + Number(itemData.stats.collect_count || 0)) / Number(itemData.stats.play_count)) * 100).toFixed(2) + '%'
        : domStats.engagement;

      const isOnlyMe = itemData?.privacy_status === 1 || itemData?.visibility === 'private';
      const pageUrl = itemId ? `https://www.tiktok.com/@${username}/video/${itemId}` : null;

      const overlay = document.createElement('div');
      overlay.id = 'fish-quality-modal-overlay';
      overlay.innerHTML = `
        <div id="fish-quality-modal" role="dialog" aria-modal="true">
          <div class="fish-qm-header">
            <div class="fish-qm-title-row">
              <div class="fish-qm-badge-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 12H9.5v-2h-2v2H6V9h1.5v2.5h2V9H11v6zm7-1c0 .55-.45 1-1 1h-4c-.55 0-1-.45-1-1V10c0-.55.45-1 1-1h4c.55 0 1 .45 1 1v4zm-1.5-.5v-3h-2.5v3h2.5z"/>
                </svg>
              </div>
              <div class="fish-qm-header-texts">
                <h2 class="fish-qm-title">Quality & Ingest Inspector</h2>
                <span class="fish-qm-subtitle">Live Stream Atom Probe • Independent</span>
              </div>
            </div>
            <button type="button" class="fish-qm-close-btn" id="fish-qm-close" title="Close">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>

          <div class="fish-qm-progress-box" id="fish-qm-progress-box">
            <div class="fish-qm-progress-status-row">
              <span id="fish-qm-progress-text">Connecting to TikTok video stream...</span>
              <span id="fish-qm-progress-pct">15%</span>
            </div>
            <div class="fish-qm-progress-bar-wrap">
              <div class="fish-qm-progress-bar-fill" id="fish-qm-progress-fill" style="width: 15%;"></div>
            </div>
          </div>

          <div class="fish-qm-bento">
            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>
                Resolution
              </span>
              <span class="fish-qm-card-val" id="fish-qm-res"><span class="fish-qm-shimmer">Probing...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-res-sub">Reading video header</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.28-10.43zM10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>
                Framerate
              </span>
              <span class="fish-qm-card-val" id="fish-qm-fps"><span class="fish-qm-shimmer">Measuring...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-fps-sub">Calculating timescale</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>
                Bitrate
              </span>
              <span class="fish-qm-card-val" id="fish-qm-bitrate"><span class="fish-qm-shimmer">Calculating...</span></span>
              <span class="fish-qm-card-sub">CDN Stream Ingest</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"/></svg>
                File Size
              </span>
              <span class="fish-qm-card-val" id="fish-qm-size"><span class="fish-qm-shimmer">Fetching stream...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-dur-sub">Connecting CDN</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                Region
              </span>
              <span class="fish-qm-card-val" id="fish-qm-region"><span class="fish-qm-shimmer">Detecting...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-region-sub">Server location</span>
            </div>

            <div class="fish-qm-card">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
                Upload Date
              </span>
              <span class="fish-qm-card-val" id="fish-qm-date"><span class="fish-qm-shimmer">Checking...</span></span>
              <span class="fish-qm-card-sub" id="fish-qm-date-sub">Video publish time</span>
            </div>

            <div class="fish-qm-card fish-qm-card-wide">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
                Patcher Method
              </span>
              <div class="fish-qm-method-wrap" id="fish-qm-method-wrap">
                <span class="fish-qm-method-val" id="fish-qm-method">Probing...</span>
              </div>
            </div>

            <div class="fish-qm-card fish-qm-card-wide">
              <span class="fish-qm-card-label">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                Shadowban Status
              </span>
              <div class="fish-qm-safety-val" id="fish-qm-shadowban">
                <span class="fish-qm-shimmer">Checking...</span>
              </div>
            </div>
          </div>

          <div class="fish-qm-stats-row">
            <div class="fish-qm-stat-chip" id="fish-qm-chip-views">Views: <strong>${displayViews}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-likes">Likes: <strong>${displayLikes}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-comments">Comments: <strong>${displayComments}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-shares">Shares: <strong>${displayShares}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-saves">Saves: <strong>${displaySaves}</strong></div>
            <div class="fish-qm-stat-chip" id="fish-qm-chip-eng">Engagement: <strong>${displayEngagement}</strong></div>
          </div>

          <div class="fish-qm-actions">
            <button type="button" class="fish-qm-btn-subtle" id="fish-qm-copy-stream" style="display:none;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> Copy Stream URL</button>
            <button type="button" class="fish-qm-btn-primary" id="fish-qm-ok-btn">OK</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const closeModal = () => {
        overlay.remove();
        document.removeEventListener('keydown', handleEsc);
        checkModals();
      };

      const handleEsc = (e) => {
        if (e.key === 'Escape') closeModal();
      };
      document.addEventListener('keydown', handleEsc);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });

      const closeBtn = overlay.querySelector('#fish-qm-close');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);

      const okBtn = overlay.querySelector('#fish-qm-ok-btn');
      if (okBtn) okBtn.addEventListener('click', closeModal);

      const updateProgress = (pct, text) => {
        const fill = overlay.querySelector('#fish-qm-progress-fill');
        const textEl = overlay.querySelector('#fish-qm-progress-text');
        const pctEl = overlay.querySelector('#fish-qm-progress-pct');
        if (fill) fill.style.width = `${pct}%`;
        if (pctEl) pctEl.textContent = `${pct}%`;
        if (textEl) textEl.textContent = text;
      };

      // Step 1: Resolve stream URL & video metadata
      updateProgress(25, 'Resolving CDN media stream URL & metadata...');
      let streamUrl = null;
      let tikwmData = null;

      // Prioritas 1: Langsung dari data API TikTok Studio
      if (itemData?.video?.play_addr?.url_list?.length) {
        streamUrl = itemData.video.play_addr.url_list[0];
      } else if (itemData?.video?.download_addr?.url_list?.length) {
        streamUrl = itemData.video.download_addr.url_list[0];
      }

      // Fetch metadata lengkap (Region, Date, Shares, Saves, Stream) via TikWM jika pageUrl ada
      if (pageUrl) {
        try {
          const twRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}`);
          if (twRes.ok) {
            const twJson = await twRes.json();
            if (twJson && twJson.code === 0 && twJson.data) {
              tikwmData = twJson.data;
              if (!streamUrl) {
                streamUrl = tikwmData.play || tikwmData.hdplay || (tikwmData.id ? `https://www.tikwm.com/video/media/play/${tikwmData.id}.mp4` : null);
              }
            }
          }
        } catch (e) {
          log('TikWM resolve note:', e.message);
        }
      }

      updateProgress(55, 'Downloading MP4 stream & atom headers...');
      await new Promise(r => setTimeout(r, 220));

      let totalSizeBytes = tikwmData?.size || itemData?.video?.size || 0;
      let atomMeta = null;

      if (streamUrl) {
        try {
          updateProgress(75, 'Decoding timescale, framerate & atom metadata...');
          const probeRes = await fetch(streamUrl, {
            headers: { 'Range': 'bytes=0-2097151' }
          });
          const cr = probeRes.headers.get('content-range');
          if (cr && cr.includes('/')) {
            const parsed = parseInt(cr.split('/')[1], 10);
            if (!isNaN(parsed) && parsed > 0) totalSizeBytes = parsed;
          } else {
            const cl = probeRes.headers.get('content-length');
            if (cl && probeRes.status !== 206) {
              const parsed = parseInt(cl, 10);
              if (!isNaN(parsed) && parsed > 0) totalSizeBytes = parsed;
            }
          }

          if (probeRes.ok || probeRes.status === 206) {
            const ab = await probeRes.arrayBuffer();
            atomMeta = parseMp4MetadataFromBuffer(new Uint8Array(ab));
          }
        } catch (e) {
          log('Stream range probe note:', e.message);
        }
      }

      updateProgress(100, 'Quality & Ingest Analysis Complete!');
      await new Promise(r => setTimeout(r, 350));

      const progressBox = overlay.querySelector('#fish-qm-progress-box');
      if (progressBox) {
        progressBox.style.transition = 'opacity 0.4s ease, max-height 0.4s ease, margin 0.4s ease, padding 0.4s ease';
        progressBox.style.opacity = '0';
        progressBox.style.maxHeight = '0px';
        progressBox.style.marginBottom = '0px';
        progressBox.style.paddingTop = '0px';
        progressBox.style.paddingBottom = '0px';
        progressBox.style.overflow = 'hidden';
        setTimeout(() => { try { progressBox.remove(); } catch (_) {} }, 400);
      }

      // Update UI elements with REAL probed data (ZERO DUMMY DATA)
      const resEl = overlay.querySelector('#fish-qm-res');
      const resSubEl = overlay.querySelector('#fish-qm-res-sub');
      const fpsEl = overlay.querySelector('#fish-qm-fps');
      const fpsSubEl = overlay.querySelector('#fish-qm-fps-sub');
      const bitrateEl = overlay.querySelector('#fish-qm-bitrate');
      const sizeEl = overlay.querySelector('#fish-qm-size');
      const durSubEl = overlay.querySelector('#fish-qm-dur-sub');
      const methodEl = overlay.querySelector('#fish-qm-method');
      const shadowbanEl = overlay.querySelector('#fish-qm-shadowban');
      const copyStreamBtn = overlay.querySelector('#fish-qm-copy-stream');

      if (copyStreamBtn && streamUrl) {
        copyStreamBtn.style.display = 'inline-flex';
        copyStreamBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(streamUrl).then(() => {
            copyStreamBtn.textContent = 'Copied!';
            setTimeout(() => { copyStreamBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> Copy Stream URL'; }, 1200);
          });
        });
      }

      const finalW = atomMeta?.width || itemData?.video?.width || tikwmData?.w || null;
      const finalH = atomMeta?.height || itemData?.video?.height || tikwmData?.h || null;
      const finalFps = atomMeta?.fps || (itemData?.video?.fps ? Math.round(itemData.video.fps) : null);
      const finalDuration = Math.round(atomMeta?.duration || itemData?.video?.duration || tikwmData?.duration || 0);

      // Resolution (No dummy values!)
      if (resEl) {
        if (finalW && finalH) {
          resEl.textContent = `${finalW} × ${finalH}`;
          if (resSubEl) resSubEl.textContent = finalW >= 1080 ? '1080p FHD (9:16 Vertical)' : `${finalW}p HD`;
        } else {
          resEl.textContent = '—';
          if (resSubEl) resSubEl.textContent = 'Stream probe pending';
        }
      }

      // Framerate (No dummy values!)
      if (fpsEl) {
        if (finalFps) {
          fpsEl.textContent = `${finalFps} FPS`;
          if (fpsSubEl) fpsSubEl.textContent = finalFps >= 59 ? 'High Framerate (60 fps)' : `${finalFps} fps Stream`;
        } else {
          fpsEl.textContent = '—';
          if (fpsSubEl) fpsSubEl.textContent = 'Timescale delta pending';
        }
      }

      if (durSubEl && finalDuration) durSubEl.textContent = `Duration: ${finalDuration}s`;

      // File Size
      if (sizeEl) {
        if (totalSizeBytes > 0) {
          sizeEl.textContent = `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
        } else if (itemData?.video?.size) {
          sizeEl.textContent = `${(itemData.video.size / (1024 * 1024)).toFixed(2)} MB`;
        } else {
          sizeEl.textContent = '—';
        }
      }

      // Bitrate
      if (bitrateEl) {
        if (totalSizeBytes > 0 && finalDuration > 0) {
          const bps = (totalSizeBytes * 8) / finalDuration;
          bitrateEl.textContent = bps >= 1000000 ? `${(bps / 1000000).toFixed(2)} Mbps` : `${Math.round(bps / 1000)} kbps`;
        } else if (itemData?.video?.bit_rate || itemData?.video?.bitrate) {
          const bps = itemData.video.bit_rate || itemData.video.bitrate;
          bitrateEl.textContent = bps >= 1000000 ? `${(bps / 1000000).toFixed(2)} Mbps` : `${Math.round(bps / 1000)} kbps`;
        } else {
          bitrateEl.textContent = '—';
        }
      }

      // Patcher Method (Plain text, auto-scroll jika panjang, no hyperbolic badge)
      if (methodEl) {
        let cleanComment = (atomMeta?.comment || '').trim();
        if ((cleanComment.startsWith('"') && cleanComment.endsWith('"')) || (cleanComment.startsWith("'") && cleanComment.endsWith("'"))) {
          cleanComment = cleanComment.slice(1, -1).trim();
        }

        if (!cleanComment || isUndetectedMethodStr(cleanComment)) {
          methodEl.textContent = 'Undetected';
        } else {
          methodEl.textContent = cleanComment;
        }

        const wrap = overlay.querySelector('#fish-qm-method-wrap');
        if (wrap) {
          setTimeout(() => {
            const diff = methodEl.scrollWidth - wrap.clientWidth;
            if (diff > 4) {
              wrap.style.overflowX = 'auto';
              wrap.style.whiteSpace = 'nowrap';
              methodEl.style.display = 'inline-block';
            }
          }, 60);
        }
      }

      // Region
      const regionEl = overlay.querySelector('#fish-qm-region');
      const regionSubEl = overlay.querySelector('#fish-qm-region-sub');
      const rawRegion = tikwmData?.region || itemData?.region || itemData?.video?.region;
      if (regionEl) {
        if (rawRegion) {
          regionEl.textContent = formatRegion(rawRegion);
          if (regionSubEl) regionSubEl.textContent = 'Server location';
        } else {
          regionEl.textContent = '—';
          if (regionSubEl) regionSubEl.textContent = 'Region not available';
        }
      }

      // Upload Date
      const dateEl = overlay.querySelector('#fish-qm-date');
      const dateSubEl = overlay.querySelector('#fish-qm-date-sub');
      const rawEpoch = tikwmData?.create_time || itemData?.create_time || itemData?.createTime;
      if (dateEl) {
        if (rawEpoch) {
          dateEl.textContent = formatUploadDate(rawEpoch);
          if (dateSubEl) dateSubEl.textContent = 'Published timestamp';
        } else {
          dateEl.textContent = '—';
          if (dateSubEl) dateSubEl.textContent = 'Date not available';
        }
      }

      // Live Stats Update (Using exact numbers from TikWM / TikTok API)
      const vCount = tikwmData?.play_count ?? itemData?.stats?.play_count;
      const lCount = tikwmData?.digg_count ?? itemData?.stats?.digg_count;
      const cCount = tikwmData?.comment_count ?? itemData?.stats?.comment_count;
      const sCount = tikwmData?.share_count ?? itemData?.stats?.share_count;
      const svCount = tikwmData?.collect_count ?? itemData?.stats?.collect_count;

      const chipViews = overlay.querySelector('#fish-qm-chip-views');
      const chipLikes = overlay.querySelector('#fish-qm-chip-likes');
      const chipComments = overlay.querySelector('#fish-qm-chip-comments');
      const chipShares = overlay.querySelector('#fish-qm-chip-shares');
      const chipSaves = overlay.querySelector('#fish-qm-chip-saves');
      const chipEng = overlay.querySelector('#fish-qm-chip-eng');

      if (chipViews && vCount !== undefined && vCount !== null) chipViews.innerHTML = `Views: <strong>${formatStatNum(vCount)}</strong>`;
      if (chipLikes && lCount !== undefined && lCount !== null) chipLikes.innerHTML = `Likes: <strong>${formatStatNum(lCount)}</strong>`;
      if (chipComments && cCount !== undefined && cCount !== null) chipComments.innerHTML = `Comments: <strong>${formatStatNum(cCount)}</strong>`;
      if (chipShares && sCount !== undefined && sCount !== null) chipShares.innerHTML = `Shares: <strong>${formatStatNum(sCount)}</strong>`;
      if (chipSaves && svCount !== undefined && svCount !== null) chipSaves.innerHTML = `Saves: <strong>${formatStatNum(svCount)}</strong>`;

      if (chipEng) {
        if (vCount && Number(vCount) > 0 && lCount !== undefined && lCount !== null) {
          const totalInteractions = Number(lCount) + Number(cCount || 0) + Number(sCount || 0) + Number(svCount || 0);
          const engPct = ((totalInteractions / Number(vCount)) * 100).toFixed(2);
          chipEng.innerHTML = `Engagement: <strong>${engPct}%</strong>`;
        }
      }

      // Shadowban Status (Cukup 'Safe' atau 'Shadow Banned', no hyperbole)
      if (shadowbanEl) {
        const isRestricted = !!(tikwmData?.is_nff_or_nr || itemData?.is_nff_or_nr || itemData?.status === 2 || itemData?.review_status === 2);
        shadowbanEl.innerHTML = isRestricted
          ? `<span class="fish-qm-status-val warn">Shadow Banned</span>`
          : `<span class="fish-qm-status-val safe">Safe</span>`;
      }
    };

    const injectCheckQualityButtons = () => {
      const isPostPage = window.location.pathname.includes('/content') || window.location.pathname.includes('/post');
      if (!isPostPage) return;

      const rows = document.querySelectorAll('div[data-tt="components_RowLayout_FlexRow"]');
      rows.forEach((card) => {
        // Abaikan table header secara mutlak
        if (
          card.closest('[data-tt*="Header"]') || 
          card.querySelector('[data-tt*="Header"]') || 
          card.className.includes('Header') ||
          card.closest('.css-hvkpcx > div:first-child')
        ) {
          return;
        }

        // Hapus sisa badge cover lama jika masih tersisa di DOM
        const oldCoverBadge = card.querySelector('.fish-cover-cq-badge');
        if (oldCoverBadge) oldCoverBadge.remove();

        // Tombol Text "Check" di sebelah tombol Settings Gear
        const actionRow = card.querySelector('div[data-tt="components_RowLayout_FlexRow_9"]') || 
                          card.querySelector('div[data-tt="components_ActionCell_FlexRow_7"]') ||
                          card.querySelector('div[data-tt*="ActionCell"]');

        const gearBtn = card.querySelector('button[data-tt="components_ActionCell_Clickable"]') ||
                        card.querySelector('button[aria-label*="More"]') ||
                        card.querySelector('button[data-tt*="more"]');

        const targetContainer = actionRow || (gearBtn ? gearBtn.parentElement : null);

        if (targetContainer && !targetContainer.querySelector('.fish-check-btn')) {
          const checkBtn = document.createElement('button');
          checkBtn.type = 'button';
          checkBtn.className = 'fish-check-btn';
          checkBtn.textContent = 'Check';
          checkBtn.title = 'Check Quality';
          checkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            const item = getItemDataFromCard(card);
            const itemId = getItemIdFromCard(card, item);
            openQualityCheckerModal(itemId, item, card);
          });

          if (gearBtn && gearBtn.parentElement === targetContainer) {
            try {
              targetContainer.insertBefore(checkBtn, gearBtn);
            } catch (_) {
              try { targetContainer.prepend(checkBtn); } catch (_) {}
            }
          } else {
            try {
              targetContainer.prepend(checkBtn);
            } catch (_) {
              try { targetContainer.appendChild(checkBtn); } catch (_) {}
            }
          }
        } else if (!targetContainer && !card.querySelector('.fish-check-btn')) {
          const lastCell = card.lastElementChild;
          if (lastCell) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fish-check-btn';
            btn.textContent = 'Check';
            btn.title = 'Check Quality';
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              const item = getItemDataFromCard(card);
              const itemId = getItemIdFromCard(card, item);
              openQualityCheckerModal(itemId, item, card);
            });
            try {
              lastCell.appendChild(btn);
            } catch (_) {}
          }
        }
      });
    };

    let _injectCheckQualityTimer = null;
    const scheduleInjectCheckQualityButtons = () => {
      if (_injectCheckQualityTimer) return;
      _injectCheckQualityTimer = setTimeout(() => {
        _injectCheckQualityTimer = null;
        injectCheckQualityButtons();
      }, 200);
    };

    const handleVideoCoverClick = (e) => {
      const cover = e.target.closest('[data-tt="VideoCover_index_VideoCoverContainer"]');
      if (!cover) return;

      const itemId = getItemIdFromElement(cover);
      if (!itemId) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const username = getUsername();
      const videoUrl = username 
        ? `https://www.tiktok.com/@${username}/video/${itemId}`
        : `https://www.tiktok.com/@cutefishaep/video/${itemId}`;

      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    };

    window.addEventListener('click', handleVideoCoverClick, true);
    window.addEventListener('auxclick', (e) => {
      if (e.button === 1) handleVideoCoverClick(e);
    }, true);

