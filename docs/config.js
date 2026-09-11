// 後端是 Supabase Edge Function（原本是 Apps Script，已經搬過去了）。
// API_URL 結尾是 /functions/v1/api，SUPABASE_ANON_KEY 是專案的公開金鑰
// （這個金鑰本來就是設計給前端公開使用的，不是密碼，資料表本身沒有
// 對它開放任何直接讀寫權限，一律要透過 Edge Function）。
const API_URL = "https://qoyojgephigwttbhbtft.supabase.co/functions/v1/api";
const SUPABASE_ANON_KEY = "sb_publishable_-sPP27i_r99uhzwS9W2Z-g_yGwgS8xD";
