/**
 * 呼叫後端 API 的共用小工具。
 *
 * 後端是 Supabase Edge Function，每個請求都要帶 apikey / Authorization
 * 這兩個表頭（用 config.js 裡的公開金鑰），Supabase 才會放行執行。
 * 這已經不是 Apps Script 那種會被 CORS 預檢搞壞的環境了，所以 POST
 * 直接用標準的 application/json 就好，不用再用 text/plain 繞過預檢。
 */

/** config.js 裡的 API_URL 有沒有真的填上去 */
function apiConfigured() {
  return typeof API_URL === 'string' && API_URL.indexOf('http') === 0;
}

function notConfigured() {
  return Promise.reject(new Error('還沒設定後端網址：請打開 docs/config.js，把 API_URL 換成 Supabase Edge Function 的網址。'));
}

function apiHeaders(extra) {
  const h = Object.assign({
    apikey: typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY : '',
    Authorization: 'Bearer ' + (typeof SUPABASE_ANON_KEY === 'string' ? SUPABASE_ANON_KEY : ''),
  }, extra || {});
  return h;
}

function apiGet(action, params) {
  if (!apiConfigured()) return notConfigured();
  const usp = new URLSearchParams(Object.assign({ action: action }, params || {}));
  return fetch(API_URL + '?' + usp.toString(), { headers: apiHeaders() })
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
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res && res.ok === false) throw new Error(res.error || '發生錯誤');
      return res;
    });
}
