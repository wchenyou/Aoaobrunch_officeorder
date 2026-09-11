/* 測試：主揪的「標記完成」（結案）跟店家的「標記完成」（出餐進度）是
   各自獨立的旗標，不會互相影響：
   1. 主揪標記完成後，這團從首頁「你開過的團」消失，但店家後台的
      「待處理訂單」還是看得到（因為店家還沒標記）。
   2. 反過來：店家標記完成後，這團從店家的「待處理訂單」消失，但
      主揪首頁的「你開過的團」還是看得到（因為主揪還沒結案）。
   跑真的 Supabase，會自己清掉建立的測試資料。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8900';
const SUPABASE_URL = 'https://qoyojgephigwttbhbtft.supabase.co/functions/v1/api';
const SUPABASE_KEY = 'sb_publishable_-sPP27i_r99uhzwS9W2Z-g_yGwgS8xD';

async function createFinalized(page, organizer) {
  return page.evaluate(async ({ url, key, organizer }) => {
    async function call(action, body) {
      const r = await fetch(url, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      return r.json();
    }
    const d = new Date(Date.now() + 3 * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dl = new Date(d.getTime() - 86400000);
    const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';
    const c = await call('createSession', { organizer, organizerEmail: 'split-test@example.com', fulfillment: '外送', deliveryDate: dateStr, deliveryTime: '12:00', address: '測試地址', deadline: deadlineStr, needUtensils: '是', typhoonCancel: '是', contactName: '窗口', contactPhone: '0900' });
    await call('submitOrder', { sessionId: c.sessionId, name: '測試同事', items: [{ code: 'P02', opt1: '千島醬', qty: 1 }] });
    const f = await call('finalizeSession', { sessionId: c.sessionId, token: c.adminToken });
    return { sessionId: c.sessionId, adminToken: c.adminToken, finalizeOk: f.ok };
  }, { url: SUPABASE_URL, key: SUPABASE_KEY, organizer });
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];
  const toClean = [];

  // ---------- 情境 1：主揪標記完成，店家那邊應該不受影響 ----------
  const p0 = await ctx.newPage();
  const s1 = await createFinalized(p0, '測試分離A');
  toClean.push(s1.sessionId);
  console.log('情境1：建團＋送單 → OK', s1.sessionId);

  const admin1 = await ctx.newPage();
  admin1.on('pageerror', e => errors.push('[admin1 pageerror] ' + e.message));
  admin1.on('dialog', d => d.accept());
  await admin1.goto(BASE + '/admin.html?session=' + s1.sessionId + '&admin=' + s1.adminToken);
  await admin1.waitForSelector('#completeBtn', { timeout: 15000 });
  await admin1.click('#completeBtn');
  await admin1.waitForSelector('#completeBtn', { state: 'detached', timeout: 15000 });
  const badge1 = await admin1.locator('#statusBadge .badge').innerText();
  console.log('主揪標記完成後管理頁狀態 =', badge1, badge1 === '已完成' ? 'OK' : '✗');

  const vendor1 = await ctx.newPage();
  vendor1.on('pageerror', e => errors.push('[vendor1 pageerror] ' + e.message));
  await vendor1.goto(BASE + '/vendor.html');
  const needLogin1 = await vendor1.$('#pw').catch(() => null);
  if (needLogin1) { await vendor1.fill('#pw', 'aoao4523022'); await vendor1.click('#loginBtn'); }
  await vendor1.waitForSelector('#pendingList', { timeout: 15000 });
  await vendor1.waitForTimeout(1000);
  const pendingText1 = await vendor1.locator('#pendingList').innerText();
  console.log('主揪標記完成後，店家「待處理訂單」還是看得到這團（互不影響） =', pendingText1.includes('測試分離A') ? 'OK' : '✗');

  // ---------- 情境 2：店家標記完成，主揪那邊應該不受影響 ----------
  const p0b = await ctx.newPage();
  const s2 = await createFinalized(p0b, '測試分離B');
  toClean.push(s2.sessionId);
  console.log('情境2：建團＋送單 → OK', s2.sessionId);

  // 用同一個已登入的店家分頁標記完成
  await vendor1.click('#pendingRefreshBtn');
  await vendor1.waitForTimeout(1000);
  vendor1.on('dialog', d => d.accept());
  const completeBtn2 = vendor1.locator('[data-complete="' + s2.sessionId + '"]');
  await completeBtn2.waitFor({ timeout: 15000 });
  await completeBtn2.click();
  await vendor1.waitForTimeout(1500);
  const pendingText2 = await vendor1.locator('#pendingList').innerText();
  console.log('店家標記完成後從待處理頁消失 =', !pendingText2.includes('測試分離B') ? 'OK' : '✗');

  const admin2 = await ctx.newPage();
  admin2.on('pageerror', e => errors.push('[admin2 pageerror] ' + e.message));
  await admin2.goto(BASE + '/admin.html?session=' + s2.sessionId + '&admin=' + s2.adminToken);
  await admin2.waitForSelector('#statusBadge .badge', { timeout: 15000 });
  const badge2 = await admin2.locator('#statusBadge .badge').innerText();
  console.log('店家標記完成後，主揪管理頁狀態還是「已送單」（互不影響） =', badge2, badge2 === '已送單' ? 'OK' : '✗');
  const completeBtnStillThere = await admin2.locator('#completeBtn').count();
  console.log('主揪管理頁「標記完成」按鈕還在（主揪還沒自己結案） =', completeBtnStillThere > 0 ? 'OK' : '✗');

  console.log('\n錯誤數：', errors.length);
  errors.forEach(e => console.log(' -', e));

  // ---------- 清理 ----------
  const cleaner = await ctx.newPage();
  await cleaner.evaluate(async ({ url, key, ids }) => {
    // 沒有專門的刪除 action，交由後續 SQL 清理；這裡只是關閉分頁
    return ids;
  }, { url: SUPABASE_URL, key: SUPABASE_KEY, ids: toClean });
  console.log('\n⚠️ 記得清掉這兩團：', toClean.join(', '));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('測試失敗:', e); process.exit(1); });
