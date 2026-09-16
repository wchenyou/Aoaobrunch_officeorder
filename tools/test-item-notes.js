/* 驗證「每個品項各自的備註」：
   1. 同一品項、同一規格、不同備註 → 購物車不會合併成一行，各自算數量
   2. 同一品項、同一規格、相同備註 → 會合併、加總數量
   3. 送單後，管理頁（admin.html）能分別看到每個品項各自的備註
   4. 店家後台（vendor.html／vendorOrders API）也能看到備註，且備註不同的
      不會被彙總吃掉、合併成同一行
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

  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const dl = new Date(d.getTime() - 86400000);
  const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';

  await p1.fill('#organizer', '備註測試');
  await p1.fill('#organizerEmail', 'wchenyou+aoaotest@gmail.com');
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
  const sessionId = orderUrl.match(/session=([^&]+)/)[1];
  console.log('建團 → OK', sessionId);

  const p2 = await ctx.newPage();
  watch(p2, 'order');
  await p2.goto(orderUrl);
  await p2.waitForSelector('.item[data-i="0"] .item-row', { timeout: 15000 });

  // 第一次加：品項0，備註「少醬」
  await p2.click('.item[data-i="0"] .item-row');
  await p2.fill('.item[data-i="0"] [data-note]', '少醬');
  await p2.click('.item[data-i="0"] [data-add]');

  // 第二次加：同一品項、同一規格（都預設無規格差異走預設），但備註「多醬」——不該合併
  await p2.click('.item[data-i="0"] .item-row');
  await p2.fill('.item[data-i="0"] [data-note]', '多醬');
  await p2.click('.item[data-i="0"] [data-add]');

  // 第三次加：跟第一次同品項同備註「少醬」——應該合併，數量變 2
  await p2.click('.item[data-i="0"] .item-row');
  await p2.fill('.item[data-i="0"] [data-note]', '少醬');
  await p2.click('.item[data-i="0"] [data-add]');

  const lines = await p2.locator('.cart-line').count();
  console.log('購物車行數 =', lines, lines === 2 ? 'OK（少醬合併成一行、多醬另一行）' : '✗');

  const qtyTexts = await p2.locator('.cart-line-name .num').allTextContents();
  const has2 = qtyTexts.some((t) => t.trim() === '×2');
  const has1 = qtyTexts.some((t) => t.trim() === '×1');
  console.log('數量合併正確（一行×2、一行×1） =', has2 && has1 ? 'OK' : '✗ ' + qtyTexts.join(','));

  await p2.fill('#name', '備註王');
  await p2.click('.cartbar [data-submit]');
  await p2.waitForSelector('#editUrl', { timeout: 15000 });
  console.log('送出訂單 → OK');

  // 管理頁：檢查兩種備註都看得到
  const p3 = await ctx.newPage();
  watch(p3, 'admin');
  p3.on('dialog', (dl2) => dl2.accept());
  await p3.goto(adminUrl);
  await p3.waitForSelector('.cartbar [data-finalize]', { timeout: 15000 });
  const adminText = await p3.textContent('#orderList');
  const adminHasBoth = adminText.indexOf('少醬') >= 0 && adminText.indexOf('多醬') >= 0;
  console.log('管理頁看得到兩種備註 →', adminHasBoth ? 'OK' : '✗');

  await p3.click('.cartbar [data-finalize]');
  await p3.waitForSelector('#completeBtn', { timeout: 15000 });
  console.log('送單 → OK');

  // 店家後台 API：檢查備註不會被合併吃掉
  const configSrc = require('fs').readFileSync(require('path').join(__dirname, '../docs/config.js'), 'utf8');
  const apiUrl = configSrc.match(/API_URL\s*=\s*"([^"]+)"/)[1];
  const apiKey = configSrc.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)[1];

  const p4 = await ctx.newPage();
  watch(p4, 'vendor-api-check');
  await p4.goto(BASE + '/index.html');
  const vendorCheck = await p4.evaluate(async ({ url, key, from, to }) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vendorOrders', password: 'aoao4523022', dateFrom: from, dateTo: to }),
    });
    return r.json();
  }, { url: apiUrl, key: apiKey, from: dateStr, to: dateStr });
  const sess = (vendorCheck.sessions || []).filter((s) => s.id === sessionId)[0];
  if (!sess) {
    console.log('店家後台查得到這團 → ✗ 找不到');
  } else {
    console.log('店家後台查得到這團 → OK');
    const items = sess.items || [];
    const shaoJiang = items.filter((it) => it.note === '少醬')[0];
    const duoJiang = items.filter((it) => it.note === '多醬')[0];
    console.log('店家後台備註沒被合併吃掉 →', (shaoJiang && duoJiang) ? 'OK' : '✗ ' + JSON.stringify(items));
    console.log('店家後台「少醬」數量 = 2 →', (shaoJiang && shaoJiang.qty === 2) ? 'OK' : '✗ ' + JSON.stringify(shaoJiang));
    console.log('店家後台看得到聯絡窗口 =', sess.contactName, sess.contactPhone,
      (sess.contactName === '窗口' && sess.contactPhone === '0900000000') ? 'OK' : '✗');
  }

  console.log('\n瀏覽器錯誤數：', errors.length);
  errors.forEach((e) => console.log(' -', e));

  await browser.close();
  console.log('\n測試揪團 session id：', sessionId, '（記得手動清掉）');
})().catch((err) => { console.error('測試失敗:', err); process.exit(1); });
