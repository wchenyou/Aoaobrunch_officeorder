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

/** 整頁的狀態訊息（找不到揪團、載入失敗等） */
function centerMsg(title, desc) {
  return '<div class="center-msg">' + PAW_MARK +
    '<h1>' + escapeHtml(title) + '</h1>' +
    '<p class="muted">' + escapeHtml(desc) + '</p></div>';
}
