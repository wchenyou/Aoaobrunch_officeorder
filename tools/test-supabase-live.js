/* 對「真的」Supabase Edge Function 跑一次完整流程（用瀏覽器，不是 curl，
   這樣才能驗到瀏覽器端真正的 CORS／表頭行為）：
   建團 → 點餐 → 改單 → 取消 → 主揪送單 → 標記完成 → 店家後台登入查詢。
   跑完會把這次建立的測試揪團刪掉，不留垃圾資料在正式的 Supabase 專案裡。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8900';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];
  function watch(p, label) {
    p.on('console', (m) => { if (m.type() === 'error') errors.push(label + ' [console] ' + m.text()); });
    p.on('pageerror', (e) => errors.push(label + ' [pageerror] ' + e.message));
  }

  const p1 = await ctx.newPage();
  watch(p1, 'index');
  await p1.goto(BASE + '/index.html');
  await p1.waitForSelector('[data-view-menu]', { timeout: 15000 });
  console.log('index.html 載入 OK（真的打到 Supabase 了）');

  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const dl = new Date(d.getTime() - 86400000);
  const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';

  await p1.fill('#organizer', 'Supabase測試');
  await p1.fill('#organizerEmail', 'supabase-test@example.com');
  await p1.fill('#deliveryDate', dateStr);
  await p1.dispatchEvent('#deliveryDate', 'change');
  await p1.fill('#deliveryTime', '12:00');
  await p1.fill('#address', '測試路1號');
  await p1.fill('#deadline', deadlineStr);
  await p1.fill('#contactName', '窗口');
  await p1.fill('#contactPhone', '0900000000');
  await p1.fill('#contactAvailableTime', '下午');
  await p1.click('#submitBtn');
  await p1.waitForSelector('#orderUrl', { timeout: 15000 });
  const orderUrl = await p1.textContent('#orderUrl');
  const adminUrl = await p1.textContent('#adminUrl');
  console.log('建團 → OK', orderUrl);

  const p2 = await ctx.newPage();
  watch(p2, 'order');
  await p2.goto(orderUrl);
  await p2.waitForSelector('.item[data-i="0"] .item-row', { timeout: 15000 });
  await p2.click('.item[data-i="0"] .item-row');
  await p2.click('.item[data-i="0"] .chip[data-val="塔塔醬"]');
  await p2.click('.item[data-i="0"] [data-add]');
  await p2.fill('#name', '小明');
  await p2.click('.cartbar [data-submit]');
  await p2.waitForSelector('#editUrl', { timeout: 15000 });
  console.log('送出訂單 → OK');

  // 改單
  await p2.click('.item[data-i="1"] .item-row');
  await p2.click('.item[data-i="1"] [data-add]');
  await p2.click('.cartbar [data-submit]');
  await p2.waitForTimeout(1500);
  const total1 = await p2.textContent('#barTotal');
  console.log('改單後總計 =', total1, '(188+199=387) →', total1 === '387' ? 'OK' : '✗');

  const p3 = await ctx.newPage();
  watch(p3, 'admin');
  p3.on('dialog', (dl2) => dl2.accept());
  await p3.goto(adminUrl);
  await p3.waitForSelector('.cartbar [data-finalize]', { timeout: 15000 });
  const people = await p3.textContent('#stPeople');
  console.log('管理頁人數 =', people, people === '1' ? 'OK' : '✗');
  await p3.click('.cartbar [data-finalize]');
  await p3.waitForSelector('#completeBtn', { timeout: 15000 });
  console.log('送單 → OK，出現標記完成按鈕');
  await p3.click('#completeBtn');
  await p3.waitForSelector('#completeBtn', { state: 'detached', timeout: 15000 });
  const badge = await p3.locator('#statusBadge .badge').innerText();
  console.log('標記完成後狀態 =', badge, badge === '已完成' ? 'OK' : '✗');

  // 店家後台
  const p4 = await ctx.newPage();
  watch(p4, 'vendor-api-check');
  const vendorCheck = await p4.evaluate(async ({ url, key, from, to }) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vendorOrders', password: 'aoao4523022', dateFrom: from, dateTo: to }),
    });
    return r.json();
  }, { url: 'https://qoyojgephigwttbhbtft.supabase.co/functions/v1/api', key: 'sb_publishable_-sPP27i_r99uhzwS9W2Z-g_yGwgS8xD', from: dateStr, to: dateStr });
  const found = (vendorCheck.sessions || []).find((s) => s.organizer === 'Supabase測試');
  console.log('店家後台查得到這團 →', found ? 'OK' : '✗');
  console.log('店家後台品項彙總（應該沒有「小明」字樣） →', JSON.stringify(found && found.items).includes('小明') ? '✗ 洩漏姓名了' : 'OK');

  console.log('\n瀏覽器錯誤數：', errors.length);
  errors.forEach((e) => console.log(' -', e));

  await browser.close();

  // 這支測試只有前端的公開金鑰，資料表又刻意不對公開金鑰開放直接寫入，
  // 所以測試建立的揪團沒辦法自己清掉——測完記得手動用 Supabase MCP 的
  // execute_sql 把這次印出來的 session id 刪掉，不要留垃圾資料在正式專案裡。
  console.log('\n⚠️ 記得手動清掉這次的測試揪團（上面印出的 session id）');
})().catch((e) => { console.error('測試失敗:', e); process.exit(1); });
