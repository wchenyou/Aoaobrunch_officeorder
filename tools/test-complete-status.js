/* 測試：
   1. 首頁「你開過的團」狀態文字是「開團中」而不是「收單中」。
   2. 送單後管理頁出現「✅ 店家已出餐，標記完成」按鈕，點下去狀態變成「已完成」。
   3. 標記完成後，這團就不會再出現在首頁「你開過的團」列表。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];

  // ---------- 1. 建團 ----------
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errors.push('index [pageerror] ' + e.message));
  await p1.goto(BASE + '/index.html');
  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const dl = new Date(d.getTime() - 86400000);
  const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';
  await p1.fill('#organizer', '測試主揪完成');
  await p1.fill('#organizerEmail', 'complete@test.com');
  await p1.fill('#deliveryDate', dateStr);
  await p1.dispatchEvent('#deliveryDate', 'change');
  await p1.fill('#deliveryTime', '12:00');
  await p1.fill('#address', '某路1號');
  await p1.fill('#deadline', deadlineStr);
  await p1.fill('#contactName', '窗口');
  await p1.fill('#contactPhone', '0900000000');
  await p1.fill('#contactAvailableTime', '下午');
  await p1.click('#submitBtn');
  await p1.waitForSelector('#orderUrl', { timeout: 8000 });
  const orderUrl = await p1.textContent('#orderUrl');
  const adminUrl = await p1.textContent('#adminUrl');
  console.log('建團 → OK', adminUrl);

  // ---------- 2. 重新整理首頁，確認狀態文字是「開團中」 ----------
  await p1.goto(BASE + '/index.html');
  await p1.waitForSelector('#myGroupsToggle', { timeout: 8000 });
  await p1.click('#myGroupsToggle');
  await p1.waitForSelector('#myGroups .badge', { timeout: 8000 });
  const badgeText = await p1.locator('#myGroups .badge').first().innerText();
  console.log('首頁狀態文字 =', badgeText, badgeText === '開團中' ? 'OK' : '✗ 應為「開團中」');

  // ---------- 3. 同事點一筆，主揪送單 ----------
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('order [pageerror] ' + e.message));
  await p2.goto(orderUrl);
  await p2.waitForSelector('.item[data-i="0"] .item-row', { timeout: 8000 });
  await p2.click('.item[data-i="0"] .item-row');
  await p2.click('.item[data-i="0"] [data-add]');
  await p2.fill('#name', '測試同事');
  await p2.click('.cartbar [data-submit]');
  await p2.waitForSelector('#editUrl', { timeout: 8000 });
  console.log('同事送出訂單 → OK');

  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errors.push('admin [pageerror] ' + e.message));
  p3.on('dialog', d => d.accept());
  await p3.goto(adminUrl);
  await p3.waitForSelector('.cartbar [data-finalize]', { timeout: 8000 });
  await p3.click('.cartbar [data-finalize]');
  await p3.waitForSelector('#completeBtn', { timeout: 8000 });
  const badgeAfterSend = await p3.locator('#statusBadge .badge').innerText();
  console.log('送單後管理頁狀態 =', badgeAfterSend, badgeAfterSend === '已送單' ? 'OK' : '✗');

  // ---------- 4. 標記完成 ----------
  await p3.click('#completeBtn');
  await p3.waitForSelector('#completeBtn', { state: 'detached', timeout: 8000 });
  const badgeAfterComplete = await p3.locator('#statusBadge .badge').innerText();
  console.log('標記完成後管理頁狀態 =', badgeAfterComplete, badgeAfterComplete === '已完成' ? 'OK' : '✗');

  // ---------- 5. 首頁「你開過的團」不再出現這團（唯一一團被標記完成後，整個區塊就是空的） ----------
  await p1.goto(BASE + '/index.html');
  await p1.waitForTimeout(1500); // 給非同步同步一點時間
  const myGroupsHtml = await p1.locator('#myGroups').innerHTML();
  console.log('標記完成後首頁「你開過的團」區塊 =', myGroupsHtml.trim() === '' ? 'OK（已清空）' : '✗ 還留著：' + myGroupsHtml.slice(0, 200));

  console.log('\n錯誤數：', errors.length);
  errors.forEach(e => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('測試失敗:', e); process.exit(1); });
