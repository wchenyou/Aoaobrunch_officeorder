/**
 * 呼叫 Apps Script API 的共用小工具。
 *
 * 為什麼 POST 要用 text/plain 而不是 application/json：
 * Apps Script 的 Web App 對「非簡單請求」（例如 Content-Type 是
 * application/json 的 POST）不會正確處理瀏覽器送出的 CORS
 * 預檢（OPTIONS）請求，會導致 fetch 失敗。改用 text/plain
 * 這種「簡單請求」的 Content-Type 就能避開預檢，Apps Script
 * 這邊照樣可以把收到的內容當 JSON 字串解析（e.postData.contents）。
 */

/** config.js 裡的 API_URL 有沒有真的填上去 */
function apiConfigured() {
  return typeof API_URL === 'string' && API_URL.indexOf('http') === 0;
}

function notConfigured() {
  return Promise.reject(new Error('還沒設定後端網址：請打開 docs/config.js，把 API_URL 換成你的 Apps Script Web App 網址（結尾是 /exec）。'));
}

function apiGet(action, params) {
  if (!apiConfigured()) return notConfigured();
  const usp = new URLSearchParams(Object.assign({ action: action }, params || {}));
  return fetch(API_URL + '?' + usp.toString())
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res && res.ok === false) throw new Error(res.error || '發生錯誤');
      return res;
    });
}

function apiPost(action, payload) {
  if (!apiConfigured()) return notConfigured();
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res && res.ok === false) throw new Error(res.error || '發生錯誤');
      return res;
    });
}
