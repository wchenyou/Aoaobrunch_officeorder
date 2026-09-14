/* 測試店家後台（vendor.html）：密碼登入（含錯誤密碼、記住密碼）、
   待處理訂單頁（不用選日期，品項彙總不含姓名）、依日期查詢頁（狀態篩選、
   CSV 下載）、標記完成。會自己建一團、送單，跑完後清掉。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8900';
const SUPABASE_URL = 'https://qoyojgephigwttbhbtft.supabase.co/functions/v1/api';
const SUPABASE_KEY = 'sb_publishable_-sPP27i_r99uhzwS9W2Z-g_yGwgS8xD';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei', acceptDownloads: true });
  const errors = [];

  // 先用 API 直接建一團 + 送出一筆訂單 + 送單，這樣店家後台才查得到東西
  const p0 = await ctx.newPage();
  const created = await p0.evaluate(async ({ url, key }) => {
    async function call(action, body) {
      const r = await fetch(url, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      return r.json();
    }
    const d = new Date(Date.now() + 3 * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dl = new Date(d.getTime() - 86400000);
    const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';
    const c = await call('createSession', { organizer: '店家後台測試', organizerEmail: 'wchenyou+aoaotest@gmail.com', fulfillment: '外送', deliveryDate: dateStr, deliveryTime: '12:00', address: '測試地址', deadline: deadlineStr, needUtensils: '是', typhoonCancel: '是', contactName: '窗口', contactPhone: '0900' });
    const o = await call('submitOrder', { sessionId: c.sessionId, name: '隱藏姓名王小明', items: [{ code: 'P02', opt1: '千島醬', qty: 1 }] });
    const f = await call('finalizeSession', { sessionId: c.sessionId, token: c.adminToken });
    return { sessionId: c.sessionId, dateStr, orderOk: o.ok, finalizeOk: f.ok, finalizeMsg: f.message || f.error };
  }, { url: SUPABASE_URL, key: SUPABASE_KEY });
  console.log('準備測試資料 → OK', created.sessionId, 'orderOk=' + created.orderOk, 'finalizeOk=' + created.finalizeOk, created.finalizeMsg);
  await p0.close();

  // ---------- 1. 登入頁：錯誤密碼 ----------
  const p1 = await ctx.newPage();
  p1.on('pageerror', (e) => errors.push('vendor [pageerror] ' + e.message));
  await p1.goto(BASE + '/vendor.html');
  await p1.waitForSelector('#pw', { timeout: 10000 });
  await p1.fill('#pw', 'wrong-password');
  await p1.click('#loginBtn');
  await p1.waitForSelector('.notice-warn', { timeout: 10000 });
  console.log('錯誤密碼被擋下 → OK');

  // ---------- 2. 正確密碼登入，預設進到「待處理訂單」頁 ----------
  await p1.fill('#pw', 'aoao4523022');
  await p1.click('#loginBtn');
  await p1.waitForSelector('#vtabPending', { timeout: 10000 });
  console.log('正確密碼登入 → OK');

  // ---------- 3. 待處理訂單：不用選日期，剛剛那筆已送單的團應該在裡面 ----------
  await p1.waitForSelector('#pendingList .card', { timeout: 10000 });
  const pendingText = await p1.locator('#pendingList').innerText();
  console.log('待處理頁查得到剛剛建立的測試團 →', pendingText.includes('店家後台測試') ? 'OK' : '✗');
  console.log('待處理頁沒有洩漏跟團者姓名 →', pendingText.includes('隱藏姓名王小明') ? '✗ 洩漏了！' : 'OK');
  console.log('待處理頁顯示品項名稱 →', pendingText.includes('美式厚牛漢堡套餐') ? 'OK' : '✗');

  // ---------- 4. 依日期查詢頁：切過去、查詢、狀態篩選、CSV 下載 ----------
  // 預設日期是「今天到今天」，測試團的預訂日期是 3 天後，要自己把
  // 區間拉大才查得到——這也順便驗證了「預設不自動查」這個行為。
  await p1.click('label[for="vtabHistory"]');
  await p1.waitForSelector('#dateFrom', { timeout: 10000 });
  const emptyHint = await p1.locator('#historyList').innerText();
  console.log('切到依日期查詢頁，預設不自動查詢 →', emptyHint.includes('選好日期範圍後按「查詢」') ? 'OK' : '✗');
  await p1.fill('#dateTo', created.dateStr);
  await p1.selectOption('#statusFilter', 'false'); // 尚未完成
  await p1.click('#queryBtn');
  await p1.waitForSelector('#historyList .card', { timeout: 10000 });
  const historyText = await p1.locator('#historyList').innerText();
  console.log('依日期查詢也查得到、也不洩漏姓名 →', (historyText.includes('店家後台測試') && !historyText.includes('隱藏姓名王小明')) ? 'OK' : '✗');

  const [download] = await Promise.all([
    p1.waitForEvent('download', { timeout: 10000 }),
    p1.click('#exportBtn'),
  ]);
  console.log('CSV 下載觸發 → OK，檔名 =', download.suggestedFilename());

  // ---------- 5. 重新整理後，記住的密碼會自動登入（回到預設的待處理頁） ----------
  await p1.reload();
  await p1.waitForSelector('#pendingList .card', { timeout: 10000 });
  console.log('重新整理後用記住的密碼自動登入 → OK');

  // ---------- 6. 待處理頁標記完成 ----------
  p1.on('dialog', (d) => d.accept());
  const completeBtn = p1.locator('[data-complete="' + created.sessionId + '"]');
  await completeBtn.click();
  await p1.waitForTimeout(1500);
  const afterText = await p1.locator('#pendingList').innerText();
  console.log('標記完成後從待處理頁消失 →', !afterText.includes('店家後台測試') ? 'OK' : '✗');

  // ---------- 7. 登出後要回到登入畫面，且不會自動帶密碼 ----------
  await p1.click('#logoutBtn');
  await p1.waitForSelector('#pw', { timeout: 10000 });
  console.log('登出後回到登入畫面 → OK');

  console.log('\n錯誤數：', errors.length);
  errors.forEach((e) => console.log(' -', e));

  await browser.close();

  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('測試失敗:', e); process.exit(1); });
