    /* A. Buka Link Video TikTok di Tab Baru saat Thumbnail Diklik */
    const getUsername = (itemData) => {
      try {
        const authorHandle = itemData?.author?.unique_id || itemData?.author?.uniqueId || itemData?.author_unique_id;
        if (authorHandle) return String(authorHandle);
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

      return null;
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

    const cleanMethodTag = (comment) => {
      if (!comment || typeof comment !== 'string') return 'Undetected';
      const s = comment.trim().replace(/^["']|["']$/g, '').trim();
      if (!s || s === '-' || s === '\u2014') return 'Undetected';
      if (s.charAt(0) === '{') return 'Undetected';
      if (/^(lavf|lavc|ffmpeg|handbrake|libav|x264|x265|vid:|v\d{4,}|isom|mp42|dash|iso2|qt|avc1|mp41)/i.test(s)) return 'Undetected';
      if (/^\d+$/.test(s) || !/[a-zA-Z]/.test(s)) return 'Undetected';
      return s;
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

    const openQualityCheckerModal = async (itemId, itemData, card) => {
      const existing = document.getElementById('fish-quality-modal-overlay');
      if (existing) existing.remove();

      const username = getUsername(itemData);
      const domStats = extractStatsFromCard(card);
      const displayViews = itemData?.stats?.play_count !== undefined ? formatStatNum(itemData.stats.play_count) : domStats.views;
      const displayLikes = itemData?.stats?.digg_count !== undefined ? formatStatNum(itemData.stats.digg_count) : domStats.likes;
      const displayComments = itemData?.stats?.comment_count !== undefined ? formatStatNum(itemData.stats.comment_count) : domStats.comments;
      const displayShares = itemData?.stats?.share_count !== undefined ? formatStatNum(itemData.stats.share_count) : '—';
      const displaySaves = itemData?.stats?.collect_count !== undefined ? formatStatNum(itemData.stats.collect_count) : '—';
      const displayEngagement = (itemData?.stats?.play_count > 0)
        ? (((Number(itemData.stats.digg_count || 0) + Number(itemData.stats.comment_count || 0) + Number(itemData.stats.share_count || 0) + Number(itemData.stats.collect_count || 0)) / Number(itemData.stats.play_count)) * 100).toFixed(2) + '%'
        : domStats.engagement;

      const pageUrl = itemId
        ? (username ? `https://www.tiktok.com/@${username}/video/${itemId}` : `https://www.tiktok.com/share/video/${itemId}`)
        : null;

      const initialCover = getCoverFromCard(card) || itemData?.video?.cover?.url_list?.[0] || itemData?.video?.origin_cover?.url_list?.[0] || '';
      const initialNickname = itemData?.author?.nickname || username || 'Creator';
      const initialHandle = username ? `@${username}` : '@tiktok';
      const initialCaption = itemData?.desc || itemData?.title || getTitleFromCard(card) || '—';

      const overlay = document.createElement('div');
      overlay.id = 'fish-quality-modal-overlay';
      overlay.innerHTML = `
        <div id="fish-quality-modal" role="dialog" aria-modal="true">
          <div class="fish-qm-header">
            <h2 class="fish-qm-title">TikTok Analytics</h2>
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

          <div class="fish-qm-media-card" id="fish-qm-media-card" style="display:none;">
            <img class="fish-qm-media-thumb" id="fish-qm-media-cover" alt="Cover video" ${initialCover ? `src="${escapeHTML(initialCover)}"` : 'style="display:none;"'}>
            <div class="fish-qm-media-body">
              <div class="fish-qm-media-title" id="fish-qm-media-author">${escapeHTML(initialNickname)}</div>
              <div class="fish-qm-media-sub" id="fish-qm-media-handle">${escapeHTML(initialHandle)}</div>
              <div class="fish-qm-media-caption" id="fish-qm-media-caption">${escapeHTML(initialCaption)}</div>
            </div>
          </div>

          <div class="fish-qm-detail-card" id="fish-qm-detail-card" style="display:none;">
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>Views</span>
              <span class="fish-qm-detail-val is-highlight" id="fish-qm-kv-views">${escapeHTML(displayViews)}</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>Likes</span>
              <span class="fish-qm-detail-val" id="fish-qm-kv-likes">${escapeHTML(displayLikes)}</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>Comments</span>
              <span class="fish-qm-detail-val" id="fish-qm-kv-comments">${escapeHTML(displayComments)}</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>Shares</span>
              <span class="fish-qm-detail-val" id="fish-qm-kv-shares">${escapeHTML(displayShares)}</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>Saves</span>
              <span class="fish-qm-detail-val" id="fish-qm-kv-saves">${escapeHTML(displaySaves)}</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>Engagement</span>
              <span class="fish-qm-detail-val is-highlight" id="fish-qm-kv-engagement">${escapeHTML(displayEngagement)}</span>
            </div>

            <hr class="fish-qm-detail-divider">

            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z"/></svg>Resolution</span>
              <span class="fish-qm-detail-val" id="fish-qm-res">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.28-10.43zM10.59 15.41a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>FPS</span>
              <span class="fish-qm-detail-val" id="fish-qm-fps">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z"/></svg>Bitrate</span>
              <span class="fish-qm-detail-val" id="fish-qm-bitrate">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>Duration</span>
              <span class="fish-qm-detail-val" id="fish-qm-duration">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/></svg>Size</span>
              <span class="fish-qm-detail-val" id="fish-qm-size">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>Method</span>
              <span class="fish-qm-detail-val" id="fish-qm-method">-</span>
            </div>

            <hr class="fish-qm-detail-divider">

            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>Status</span>
              <span class="fish-qm-detail-val is-highlight" id="fish-qm-shadowban">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>Region</span>
              <span class="fish-qm-detail-val" id="fish-qm-region">-</span>
            </div>
            <div class="fish-qm-detail-row">
              <span class="fish-qm-detail-key"><svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>Upload Date</span>
              <span class="fish-qm-detail-val" id="fish-qm-date">-</span>
            </div>
          </div>

          <div class="fish-qm-actions">
            <button type="button" class="fish-qm-btn-subtle" id="fish-qm-copy-stream" style="display:none;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg> Copy Stream URL</button>
            <button type="button" class="fish-qm-btn-primary" id="fish-qm-ok-btn">OK</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      let progressTimer = null;
      let currentPct = 15;
      let targetCeiling = 55;
      let metadataRendered = false;

      const closeModal = () => {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
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
        if (textEl && text) textEl.textContent = text;
      };

      const renderMetadata = (twData) => {
        metadataRendered = true;
        const mediaCardEl = overlay.querySelector('#fish-qm-media-card');
        const detailCardEl = overlay.querySelector('#fish-qm-detail-card');
        if (mediaCardEl) mediaCardEl.style.display = '';
        if (detailCardEl) detailCardEl.style.display = '';

        const mediaCoverEl = overlay.querySelector('#fish-qm-media-cover');
        const mediaAuthorEl = overlay.querySelector('#fish-qm-media-author');
        const mediaHandleEl = overlay.querySelector('#fish-qm-media-handle');
        const mediaCaptionEl = overlay.querySelector('#fish-qm-media-caption');
        if (mediaCoverEl && !initialCover && twData?.cover) {
          mediaCoverEl.src = twData.cover;
          mediaCoverEl.style.display = 'block';
        }
        if (mediaAuthorEl && twData?.author?.nickname) {
          mediaAuthorEl.textContent = twData.author.nickname;
        }
        if (mediaHandleEl && twData?.author?.unique_id) {
          mediaHandleEl.textContent = `@${twData.author.unique_id}`;
        }
        if (mediaCaptionEl && twData?.title) {
          mediaCaptionEl.textContent = twData.title;
        }

        const vCount = twData?.play_count ?? itemData?.stats?.play_count;
        const lCount = twData?.digg_count ?? itemData?.stats?.digg_count;
        const cCount = twData?.comment_count ?? itemData?.stats?.comment_count;
        const sCount = twData?.share_count ?? itemData?.stats?.share_count;
        const svCount = twData?.collect_count ?? itemData?.stats?.collect_count;

        const kvViews = overlay.querySelector('#fish-qm-kv-views');
        const kvLikes = overlay.querySelector('#fish-qm-kv-likes');
        const kvComments = overlay.querySelector('#fish-qm-kv-comments');
        const kvShares = overlay.querySelector('#fish-qm-kv-shares');
        const kvSaves = overlay.querySelector('#fish-qm-kv-saves');
        const kvEng = overlay.querySelector('#fish-qm-kv-engagement');

        if (kvViews && vCount !== undefined && vCount !== null) kvViews.textContent = formatStatNum(vCount);
        if (kvLikes && lCount !== undefined && lCount !== null) kvLikes.textContent = formatStatNum(lCount);
        if (kvComments && cCount !== undefined && cCount !== null) kvComments.textContent = formatStatNum(cCount);
        if (kvShares && sCount !== undefined && sCount !== null) kvShares.textContent = formatStatNum(sCount);
        if (kvSaves && svCount !== undefined && svCount !== null) kvSaves.textContent = formatStatNum(svCount);

        if (kvEng && vCount && Number(vCount) > 0 && lCount !== undefined && lCount !== null) {
          const totalInteractions = Number(lCount) + Number(cCount || 0) + Number(sCount || 0) + Number(svCount || 0);
          kvEng.textContent = ((totalInteractions / Number(vCount)) * 100).toFixed(2) + '%';
        }

        const regionEl = overlay.querySelector('#fish-qm-region');
        const rawRegion = twData?.region || itemData?.region || itemData?.video?.region;
        if (regionEl) regionEl.textContent = rawRegion ? formatRegion(rawRegion) : '—';

        const dateEl = overlay.querySelector('#fish-qm-date');
        const rawEpoch = twData?.create_time || itemData?.create_time || itemData?.createTime;
        if (dateEl) dateEl.textContent = rawEpoch ? formatUploadDate(rawEpoch) : '—';

        const shadowbanEl = overlay.querySelector('#fish-qm-shadowban');
        if (shadowbanEl) {
          const isRestricted = !!(twData?.is_nff_or_nr || itemData?.is_nff_or_nr || itemData?.status === 2 || itemData?.review_status === 2);
          shadowbanEl.classList.toggle('is-highlight', !isRestricted);
          shadowbanEl.classList.toggle('is-warn', isRestricted);
          shadowbanEl.textContent = isRestricted ? 'Shadow Banned' : 'Safe';
        }
      };

      let streamUrl = null;
      if (itemData?.video?.play_addr?.url_list?.length) {
        streamUrl = itemData.video.play_addr.url_list[0];
      } else if (itemData?.video?.download_addr?.url_list?.length) {
        streamUrl = itemData.video.download_addr.url_list[0];
      }

      updateProgress(15, 'Fetching video metadata...');
      progressTimer = setInterval(() => {
        if (currentPct < targetCeiling) {
          currentPct = Math.min(targetCeiling, currentPct + 2);
          updateProgress(currentPct);
        }
      }, 450);

      let probeResult = null;
      try {
        probeResult = await probeVideoViaExtension(pageUrl, streamUrl, (st) => {
          if (!st) return;
          if (st.stage === 'metadata_retry') {
            currentPct = Math.max(currentPct, 35);
            updateProgress(currentPct, st.status || 'Retrying metadata request...');
          } else if (st.stage === 'metadata_ready') {
            currentPct = Math.max(currentPct, 65);
            targetCeiling = 92;
            updateProgress(currentPct, st.status || 'Probing video stream (FPS & resolution)...');
            if (st.tikwmData) {
              renderMetadata(st.tikwmData);
            }
          }
        });
      } finally {
        if (progressTimer) {
          clearInterval(progressTimer);
          progressTimer = null;
        }
      }

      if (probeResult?.error === 'EXTENSION_CONTEXT_INVALIDATED') {
        log('Extension was reloaded — refresh this tab to reconnect stream probe');
      }
      const tikwmData = probeResult?.tikwmData || null;
      if (probeResult?.streamUrl) {
        streamUrl = probeResult.streamUrl;
      }

      if (!metadataRendered || tikwmData) {
        renderMetadata(tikwmData);
      }

      const totalSizeBytes = probeResult?.totalSizeBytes || tikwmData?.size || tikwmData?.hd_size || itemData?.video?.size || 0;
      const atomMeta = probeResult?.atomMeta || null;
      log(`Probe result (${pageUrl || 'no-url'}): tikwm=${Boolean(tikwmData)}, meta=${atomMeta ? `${atomMeta.width}x${atomMeta.height}@${atomMeta.fps}fps (${totalSizeBytes}B)` : 'none'}`);
      updateProgress(100, 'Analysis complete');
      await new Promise(r => setTimeout(r, 250));

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
      const mediaCoverEl = overlay.querySelector('#fish-qm-media-cover');
      const mediaAuthorEl = overlay.querySelector('#fish-qm-media-author');
      const mediaHandleEl = overlay.querySelector('#fish-qm-media-handle');
      const mediaCaptionEl = overlay.querySelector('#fish-qm-media-caption');
      if (mediaCoverEl && !initialCover && tikwmData?.cover) {
        mediaCoverEl.src = tikwmData.cover;
        mediaCoverEl.style.display = 'block';
      }
      if (mediaAuthorEl && tikwmData?.author?.nickname) {
        mediaAuthorEl.textContent = tikwmData.author.nickname;
      }
      if (mediaHandleEl && tikwmData?.author?.unique_id) {
        mediaHandleEl.textContent = `@${tikwmData.author.unique_id}`;
      }
      if (mediaCaptionEl && tikwmData?.title) {
        mediaCaptionEl.textContent = tikwmData.title;
      }

      const resEl = overlay.querySelector('#fish-qm-res');
      const fpsEl = overlay.querySelector('#fish-qm-fps');
      const bitrateEl = overlay.querySelector('#fish-qm-bitrate');
      const durationEl = overlay.querySelector('#fish-qm-duration');
      const sizeEl = overlay.querySelector('#fish-qm-size');
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

      if (resEl) {
        resEl.textContent = (finalW && finalH) ? `${finalW} × ${finalH}` : '—';
      }

      if (fpsEl) {
        fpsEl.textContent = finalFps ? `${finalFps} fps` : '—';
      }

      if (durationEl) {
        durationEl.textContent = finalDuration ? `${finalDuration}s` : '—';
      }

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

      // Patcher Method
      if (methodEl) {
        const methodText = cleanMethodTag(atomMeta?.comment);
        methodEl.textContent = methodText;
        methodEl.title = methodText;
      }

      // Region
      const regionEl = overlay.querySelector('#fish-qm-region');
      const rawRegion = tikwmData?.region || itemData?.region || itemData?.video?.region;
      if (regionEl) {
        regionEl.textContent = rawRegion ? formatRegion(rawRegion) : '—';
      }

      // Upload Date
      const dateEl = overlay.querySelector('#fish-qm-date');
      const rawEpoch = tikwmData?.create_time || itemData?.create_time || itemData?.createTime;
      if (dateEl) {
        dateEl.textContent = rawEpoch ? formatUploadDate(rawEpoch) : '—';
      }

      // Live Stats Update (Using exact numbers from TikWM / TikTok API)
      const vCount = tikwmData?.play_count ?? itemData?.stats?.play_count;
      const lCount = tikwmData?.digg_count ?? itemData?.stats?.digg_count;
      const cCount = tikwmData?.comment_count ?? itemData?.stats?.comment_count;
      const sCount = tikwmData?.share_count ?? itemData?.stats?.share_count;
      const svCount = tikwmData?.collect_count ?? itemData?.stats?.collect_count;

      const kvViews = overlay.querySelector('#fish-qm-kv-views');
      const kvLikes = overlay.querySelector('#fish-qm-kv-likes');
      const kvComments = overlay.querySelector('#fish-qm-kv-comments');
      const kvShares = overlay.querySelector('#fish-qm-kv-shares');
      const kvSaves = overlay.querySelector('#fish-qm-kv-saves');
      const kvEng = overlay.querySelector('#fish-qm-kv-engagement');

      if (kvViews && vCount !== undefined && vCount !== null) kvViews.textContent = formatStatNum(vCount);
      if (kvLikes && lCount !== undefined && lCount !== null) kvLikes.textContent = formatStatNum(lCount);
      if (kvComments && cCount !== undefined && cCount !== null) kvComments.textContent = formatStatNum(cCount);
      if (kvShares && sCount !== undefined && sCount !== null) kvShares.textContent = formatStatNum(sCount);
      if (kvSaves && svCount !== undefined && svCount !== null) kvSaves.textContent = formatStatNum(svCount);

      if (kvEng) {
        if (vCount && Number(vCount) > 0 && lCount !== undefined && lCount !== null) {
          const totalInteractions = Number(lCount) + Number(cCount || 0) + Number(sCount || 0) + Number(svCount || 0);
          kvEng.textContent = ((totalInteractions / Number(vCount)) * 100).toFixed(2) + '%';
        }
      }

      // Shadowban Status
      if (shadowbanEl) {
        const isRestricted = !!(tikwmData?.is_nff_or_nr || itemData?.is_nff_or_nr || itemData?.status === 2 || itemData?.review_status === 2);
        shadowbanEl.classList.toggle('is-highlight', !isRestricted);
        shadowbanEl.classList.toggle('is-warn', isRestricted);
        shadowbanEl.textContent = isRestricted ? 'Shadow Banned' : 'Safe';
      }
    };

    const isCardPublic = (card) => {
      if (!card) return false;
      const privacyBtn = card.querySelector('button[data-tt="components_PrivacyCell_TUXButton"]') ||
                         card.querySelector('div[data-tt="components_RowLayout_FlexRow_4"] button');
      if (privacyBtn) {
        const label = (privacyBtn.querySelector('.TUXButton-label')?.textContent || privacyBtn.textContent || '')
          .trim()
          .toLowerCase();
        if (label) {
          return /^(everyone|public|semua orang|publik)$/i.test(label);
        }
      }

      const item = getItemDataFromCard(card);
      if (item) {
        if (item.privacy_status !== undefined && item.privacy_status !== null) {
          return Number(item.privacy_status) === 0;
        }
        if (item.visibility !== undefined && item.visibility !== null) {
          return /^(everyone|public)$/i.test(String(item.visibility).trim());
        }
      }
      return false;
    };

    const createCheckQualityButton = (card) => {
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
      return btn;
    };

    const syncInReviewOverlay = (card, item) => {
      const infoRow = card.querySelector('div[data-tt="components_PostInfoCell_FlexRow"]');
      const isInReview = Boolean(
        (item && (item.in_review === true || Number(item.status) === 144)) ||
        (infoRow && infoRow.classList.contains('css-1j32rxn'))
      );
      const cover = card.querySelector('div[data-tt="VideoCover_index_VideoCoverContainer"]');

      if (!isInReview) {
        card.classList.remove('fish-in-review');
        const oldOverlay = card.querySelector('.fish-review-overlay');
        if (oldOverlay) oldOverlay.remove();
        card.dataset.fishReviewState = 'normal';
        return;
      }

      card.classList.add('fish-in-review');
      if (cover && !cover.querySelector('.fish-review-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'fish-review-overlay';
        const mainEl = document.createElement('div');
        mainEl.className = 'fish-review-main';
        mainEl.textContent = "Video is on review or if it's been like this for 3 minutes, it got patched";
        const subEl = document.createElement('div');
        subEl.className = 'fish-review-sub';
        subEl.textContent = 'Just delete this video';
        overlay.appendChild(mainEl);
        overlay.appendChild(subEl);
        cover.appendChild(overlay);
      }
      card.dataset.fishReviewState = 'review';
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

        const privacyBtn = card.querySelector('button[data-tt="components_PrivacyCell_TUXButton"]');
        const privacySig = privacyBtn ? (privacyBtn.textContent || '').trim() : '';
        const existingBtn = card.querySelector('.fish-check-btn');
        const reviewState = card.dataset.fishReviewState;
        const reviewReady = reviewState === 'normal' || (reviewState === 'review' && Boolean(card.querySelector('.fish-review-overlay')));

        // Fast-path O(1): lewati React Fiber walk jika teks privasi & status review kartu tidak berubah
        if (card.dataset.fishCqState && reviewReady && card.dataset.fishPrivacySig === privacySig) {
          if (card.dataset.fishCqState === 'priv' && !existingBtn) return;
          if (card.dataset.fishCqState === 'pub' && existingBtn) return;
        }
        card.dataset.fishPrivacySig = privacySig;

        const item = getItemDataFromCard(card);
        syncInReviewOverlay(card, item);

        const isPublic = isCardPublic(card);
        if (!isPublic) {
          if (existingBtn) existingBtn.remove();
          card.classList.remove('fish-has-check');
          card.dataset.fishCqState = 'priv';
          return;
        }
        card.classList.add('fish-has-check');
        if (card.dataset.fishCqState === 'pub' && existingBtn) {
          return;
        }
        card.dataset.fishCqState = 'pub';

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
          const checkBtn = createCheckQualityButton(card);

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
            const btn = createCheckQualityButton(card);
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

    const getItemIdFromCover = (cover) => {
      if (!cover) return null;
      const card = cover.closest('[data-tt="components_RowLayout_FlexRow"]');
      if (card) {
        const item = getItemDataFromCard(card);
        const id = getItemIdFromCard(card, item);
        if (id) return { id, item };
      }
      const fallbackId = getItemIdFromCard(cover, null);
      return fallbackId ? { id: fallbackId, item: null } : null;
    };

    const handleVideoCoverClick = (e) => {
      const cover = e.target.closest('[data-tt="VideoCover_index_VideoCoverContainer"]');
      if (!cover) return;

      const resolved = getItemIdFromCover(cover);
      if (!resolved?.id) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const username = getUsername(resolved.item);
      const videoUrl = username
        ? `https://www.tiktok.com/@${username}/video/${resolved.id}`
        : `https://www.tiktok.com/share/video/${resolved.id}`;

      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    };

    window.addEventListener('click', handleVideoCoverClick, true);
    window.addEventListener('auxclick', (e) => {
      if (e.button === 1) handleVideoCoverClick(e);
    }, true);

