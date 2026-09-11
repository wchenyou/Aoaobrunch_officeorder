/* 共用的小元件與工具 */

const PAW_SVG = '<svg class="paw" viewBox="0 0 64 64" aria-hidden="true">' +
  '<ellipse cx="32" cy="42" rx="15" ry="12"/>' +
  '<ellipse cx="13" cy="27" rx="6.5" ry="8"/>' +
  '<ellipse cx="26" cy="18" rx="6.5" ry="8.5"/>' +
  '<ellipse cx="40" cy="18" rx="6.5" ry="8.5"/>' +
  '<ellipse cx="52" cy="27" rx="6.5" ry="8"/>' +
  '</svg>';

const PAW_MARK = '<svg viewBox="0 0 64 64" aria-hidden="true">' +
  '<ellipse cx="32" cy="42" rx="15" ry="12"/>' +
  '<ellipse cx="13" cy="27" rx="6.5" ry="8"/>' +
  '<ellipse cx="26" cy="18" rx="6.5" ry="8.5"/>' +
  '<ellipse cx="40" cy="18" rx="6.5" ry="8.5"/>' +
  '<ellipse cx="52" cy="27" rx="6.5" ry="8"/>' +
  '</svg>';

function renderTopbar(subtitle) {
  return '<header class="topbar">' +
    '<div class="topbar-inner">' + PAW_SVG +
    '<div><div class="brand">嗷嗷早午餐</div>' +
    '<div class="brand-sub">' + escapeHtml(subtitle || '辦公室團購') + '</div></div>' +
    '</div>' +
    '<svg class="wave" viewBox="0 0 1440 20" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0,20 C240,2 480,2 720,10 C960,18 1200,18 1440,6 L1440,20 Z"/></svg>' +
    '</header>';
}

function renderFoot() {
  return '<div class="foot">' +
    '<strong>嗷嗷早午餐</strong>　台中市西屯區河南路二段486號<br>' +
    '外送專線 04-2452-3022　｜　距離 3 公里內、滿千外送<br>' +
    '最晚請於前一日 15:00 前訂餐' +
    '</div>';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtDate(v) {
  return new Date(v).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short' });
}

function fmtDateTime(v) {
  return new Date(v).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 距離截止還有多久，回傳人看得懂的字串 */
function timeLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return days + ' 天 ' + hours + ' 小時';
  if (hours > 0) return hours + ' 小時 ' + m + ' 分';
  return m + ' 分鐘';
}

/** 把文字複製到剪貼簿，並在按鈕上給短暫回饋 */
function copyText(text, btn) {
  const done = function () {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = '已複製';
    setTimeout(function () { btn.textContent = old; }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(function () { fallback(); });
  } else {
    fallback();
  }
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { alert('請手動複製：' + text); }
    document.body.removeChild(ta);
  }
}

/** 產生一個「連結 + 複製鈕」的區塊 */
function linkBox(url, id) {
  return '<div class="linkbox"><code id="' + id + '">' + escapeHtml(url) + '</code>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-copy="' + id + '">複製</button></div>';
}

document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const el = document.getElementById(btn.getAttribute('data-copy'));
  if (el) copyText(el.textContent, btn);
});

/* ==========================================================================
   查看菜單——發起團購頁、點餐頁共用
   就一顆按鈕，點下去用大圖看店家的完整菜單相片（同一張圖，不用另外維護）。
   ========================================================================== */

const MENU_PHOTO_URL = 'images/menu/full-menu.jpg';

function menuButton() {
  return '<button type="button" class="btn btn-ghost btn-block btn-sm" data-view-menu>📋 查看菜單</button>';
}

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-view-menu]')) openLightbox(MENU_PHOTO_URL, '完整菜單');
});

/* ==========================================================================
   圖片點擊放大——菜單照片、點餐清單縮圖共用
   任何帶 data-zoomable 的 <img> 點下去就蓋一層大圖，點旁邊空白或按 Esc 關掉。
   ========================================================================== */

document.addEventListener('click', function (e) {
  if (e.target.closest('[data-lightbox-close]') || e.target.matches('[data-lightbox]')) {
    closeLightbox();
    return;
  }
  const img = e.target.closest('[data-zoomable]');
  if (img) openLightbox(img.getAttribute('src'), img.getAttribute('alt') || '');
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeLightbox();
});

function openLightbox(src, alt) {
  closeLightbox();
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('data-lightbox', '');
  box.innerHTML =
    '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '">' +
    '<button type="button" class="lightbox-close" data-lightbox-close aria-label="關閉">✕</button>';
  document.body.appendChild(box);
  document.body.classList.add('lightbox-open');
}

function closeLightbox() {
  const box = document.querySelector('[data-lightbox]');
  if (box) box.remove();
  document.body.classList.remove('lightbox-open');
}

/** 整頁的狀態訊息（找不到揪團、載入失敗等） */
function centerMsg(title, desc) {
  return '<div class="center-msg">' + PAW_MARK +
    '<h1>' + escapeHtml(title) + '</h1>' +
    '<p class="muted">' + escapeHtml(desc) + '</p></div>';
}

/* ==========================================================================
   記住主揪自己開過的團
   主揪把連結貼到群組後常常會把分頁關掉，等收團才回來，
   所以在他自己的瀏覽器留一份紀錄，重新打開首頁就能一鍵回到管理頁。
   （localStorage 只存在這台裝置，換裝置要靠建團時寄出的那封信。）
   ========================================================================== */

const MY_GROUPS_KEY = 'aoao_my_groups';
const KEEP_DAYS = 14;

function loadMyGroups() {
  try {
    const raw = localStorage.getItem(MY_GROUPS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 太久以前的就不留了
    const cutoff = Date.now() - KEEP_DAYS * 86400000;
    return list.filter(function (g) { return g && g.id && g.token && (g.savedAt || 0) > cutoff; });
  } catch (e) {
    return [];
  }
}

function saveMyGroup(group) {
  try {
    const list = loadMyGroups().filter(function (g) { return g.id !== group.id; });
    list.unshift(Object.assign({ savedAt: Date.now() }, group));
    localStorage.setItem(MY_GROUPS_KEY, JSON.stringify(list.slice(0, 10)));
  } catch (e) { /* 無痕模式或不給存，就算了 */ }
}

function updateMyGroup(id, patch) {
  try {
    const list = loadMyGroups().map(function (g) {
      return g.id === id ? Object.assign({}, g, patch) : g;
    });
    localStorage.setItem(MY_GROUPS_KEY, JSON.stringify(list));
  } catch (e) { /* 略過 */ }
}

function forgetMyGroup(id) {
  try {
    localStorage.setItem(MY_GROUPS_KEY, JSON.stringify(loadMyGroups().filter(function (g) { return g.id !== id; })));
  } catch (e) { /* 略過 */ }
}

/** 由 sessionId + token 組出這個站台的管理連結 */
function adminUrlFor(id, token) {
  const base = location.href.replace(/[^/]*(\?.*)?$/, '');
  return base + 'admin.html?session=' + encodeURIComponent(id) + '&admin=' + encodeURIComponent(token);
}

/* ==========================================================================
   同事還沒送出的購物車草稿
   選到一半把分頁關掉、或不小心重新整理，回來時不用重選。
   一個揪團一份草稿，只存在這台裝置。
   ========================================================================== */

function cartKey(sessionId) { return 'aoao_cart_' + sessionId; }

function saveCartDraft(sessionId, data) {
  try {
    localStorage.setItem(cartKey(sessionId), JSON.stringify(Object.assign({ savedAt: Date.now() }, data)));
  } catch (e) { /* 無痕模式就算了 */ }
}

function loadCartDraft(sessionId) {
  try {
    const raw = localStorage.getItem(cartKey(sessionId));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || Date.now() - (d.savedAt || 0) > KEEP_DAYS * 86400000) return null;
    return d;
  } catch (e) { return null; }
}

function clearCartDraft(sessionId) {
  try { localStorage.removeItem(cartKey(sessionId)); } catch (e) { /* 略過 */ }
}

/** 「剛剛」「3 分鐘前」這種相對時間 */
function timeAgo(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 45) return '剛剛';
  const min = Math.round(sec / 60);
  if (min < 60) return min + ' 分鐘前';
  return Math.round(min / 60) + ' 小時前';
}

/* ==========================================================================
   還沒設定後端網址時，直接在畫面上講清楚要做什麼
   （三個頁面都會載入 ui.js，所以這裡裝一次就好）
   ========================================================================== */

(function warnIfNotConfigured() {
  if (typeof apiConfigured === 'function' && apiConfigured()) return;
  function show() {
    const bar = document.createElement('div');
    bar.className = 'notice notice-warn';
    bar.style.cssText = 'margin:0;border-radius:0;justify-content:center;text-align:left;';
    bar.innerHTML = '<span class="ico">🔧</span><div><strong>還沒接上後端</strong><br>' +
      '請打開 <code>docs/config.js</code>，把 <code>API_URL</code> 換成你的 Apps Script Web App 網址（結尾是 <code>/exec</code>），' +
      '再重新 commit 一次就會生效。</div>';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
