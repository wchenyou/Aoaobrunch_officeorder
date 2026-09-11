const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8899';
const SHOTS = require('path').join(__dirname, 'screenshots');
const errors = [];
const log = (...a) => console.log(...a);

function watch(pageObj, label) {
  pageObj.on('console', m => { if (m.type() === 'error') errors.push(label + ' [console] ' + m.text()); });
  pageObj.on('pageerror', e => errors.push(label + ' [pageerror] ' + e.message));
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });

  /* ---------- 1. 建立揪團 ---------- */
  const p1 = await ctx.newPage();
  watch(p1, 'index');
  await p1.goto(BASE + '/index.html');
  await p1.waitForTimeout(900);
  await p1.screenshot({ path: SHOTS + '/shot-1-new.png', fullPage: true });

  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const dl = new Date(d.getTime() - 86400000);
  const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';

  await p1.fill('#organizer', 'Aaron');
  await p1.fill('#organizerEmail', 'aaron@example.com');
  await p1.fill('#deliveryDate', dateStr);
  await p1.dispatchEvent('#deliveryDate', 'change');
  await p1.fill('#deliveryTime', '11:30');
  await p1.fill('#address', '台中市西屯區某某路 1 號 5 樓');
  await p1.fill('#deadline', deadlineStr);
  await p1.fill('#company', '大真股份有限公司');
  await p1.fill('#taxId', '12345678');
  await p1.fill('#contactName', 'Aaron');
  await p1.fill('#contactPhone', '0912345678');
  await p1.fill('#contactAvailableTime', '下午 2 點後');
  await p1.waitForTimeout(200);
  await p1.screenshot({ path: SHOTS + '/shot-2-filled.png', fullPage: true });

  await p1.click('#submitBtn');
  await p1.waitForTimeout(900);
  const orderUrl = await p1.textContent('#orderUrl').catch(() => null);
  const adminUrl = await p1.textContent('#adminUrl').catch(() => null);
  log('建立揪團 →', orderUrl ? 'OK' : '失敗');
  log('  order:', orderUrl);
  log('  admin:', adminUrl);
  await p1.screenshot({ path: SHOTS + '/shot-3-created.png', fullPage: true });
  if (!orderUrl) { log('ERRORS:', errors); process.exit(1); }

  /* ---------- 2. 同事點餐 ---------- */
  const p2 = await ctx.newPage();
  watch(p2, 'order');
  await p2.goto(orderUrl);
  await p2.waitForTimeout(900);
  await p2.screenshot({ path: SHOTS + '/shot-4-order.png', fullPage: true });

  // 展開第一個品項（豬排總匯），選塔塔醬，數量 2，加入
  await p2.click('.item[data-i="0"] .item-row');
  await p2.waitForTimeout(350);
  await p2.screenshot({ path: SHOTS + '/shot-5-panel.png', fullPage: true });
  await p2.click('.item[data-i="0"] .chip[data-val="塔塔醬"]');
  await p2.click('.item[data-i="0"] [data-step="1"]');
  const sumTxt = await p2.textContent('.item[data-i="0"] [data-sum]');
  log('豬排 x2 小計顯示 =', sumTxt, sumTxt === '376' ? 'OK' : '✗ 應為 376');
  await p2.click('.item[data-i="0"] [data-add]');
  await p2.waitForTimeout(250);

  // 飲料：紅茶歐蕾 L 微糖
  await p2.click('.item[data-i="6"] .item-row');
  await p2.waitForTimeout(300);
  await p2.click('.item[data-i="6"] .chip[data-val="L"]');
  const sum2 = await p2.textContent('.item[data-i="6"] [data-sum]');
  log('紅茶歐蕾 L 單價 =', sum2, sum2 === '70' ? 'OK' : '✗ 應為 70');
  await p2.click('.item[data-i="6"] .chip[data-val="微糖"]');
  await p2.click('.item[data-i="6"] [data-add]');
  await p2.waitForTimeout(250);

  const barTotal = await p2.textContent('#barTotal');
  log('購物車總計 =', barTotal, barTotal === '446' ? 'OK' : '✗ 應為 446 (376+70)');
  await p2.screenshot({ path: SHOTS + '/shot-6-cart.png', fullPage: true });

  // 沒填姓名先送出 → 應該擋下來
  await p2.click('.cartbar [data-submit]');
  await p2.waitForTimeout(400);
  const warned = await p2.$('.notice-warn');
  log('未填姓名擋下 →', warned ? 'OK' : '✗ 沒擋');

  await p2.fill('#name', '小明（4樓）');
  await p2.fill('#globalNote', '不要辣');
  await p2.click('.cartbar [data-submit]');
  await p2.waitForTimeout(900);
  const editUrl = await p2.textContent('#editUrl').catch(() => null);
  log('送出訂單 →', editUrl ? 'OK' : '✗ 失敗');
  await p2.screenshot({ path: SHOTS + '/shot-7-submitted.png', fullPage: true });

  /* ---------- 3. 第二個人點餐（另一台裝置，各自的 localStorage） ---------- */
  const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const p3 = await ctx2.newPage();
  watch(p3, 'order2');
  await p3.goto(orderUrl);
  await p3.waitForTimeout(800);
  await p3.click('.item[data-i="3"] .item-row');   // 舒肥雞胸 $249（兩個必選規格）
  await p3.waitForTimeout(300);
  await p3.click('.item[data-i="3"] .chip[data-val="泰式酸辣"]');
  await p3.click('.item[data-i="3"] [data-add]');
  await p3.waitForTimeout(200);
  await p3.click('.item[data-i="8"] .item-row');   // 美式黑咖啡（無規格、僅 M）
  await p3.waitForTimeout(300);
  await p3.click('.item[data-i="8"] [data-add]');
  await p3.waitForTimeout(200);
  await p3.fill('#name', '小華');
  await p3.click('.cartbar [data-submit]');
  await p3.waitForTimeout(900);
  const ok2 = await p3.$('#editUrl');
  log('第二人送出 →', ok2 ? 'OK' : '✗ 失敗');

  /* ---------- 4. 小明用修改連結回來改單 ---------- */
  const ctx3 = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const p4 = await ctx3.newPage();
  watch(p4, 'edit');
  await p4.goto(editUrl);
  await p4.waitForTimeout(900);
  const preName = await p4.inputValue('#name');
  const preTotal = await p4.textContent('#barTotal');
  log('修改模式帶回姓名 =', preName, preName === '小明（4樓）' ? 'OK' : '✗');
  log('修改模式帶回金額 =', preTotal, preTotal === '446' ? 'OK' : '✗ 應為 446');
  await p4.screenshot({ path: SHOTS + '/shot-8-edit.png', fullPage: true });
  // 移除一項後更新
  await p4.click('[data-rm="1"]');
  await p4.waitForTimeout(200);
  await p4.click('.cartbar [data-submit]');
  await p4.waitForTimeout(900);
  log('更新訂單 →', (await p4.$('#editUrl')) ? 'OK' : '✗ 失敗');

  /* ---------- 5. 管理頁 ---------- */
  const p5 = await ctx.newPage();
  watch(p5, 'admin');
  await p5.setViewportSize({ width: 480, height: 1000 });
  await p5.goto(adminUrl);
  await p5.waitForTimeout(1000);
  const people = await p5.textContent('#stPeople');
  const items = await p5.textContent('#stItems');
  const total = await p5.textContent('#stTotal');
  log('管理頁統計 → 人數', people, '份數', items, '金額', total);
  log('  人數應為 2 →', people === '2' ? 'OK' : '✗');
  await p5.screenshot({ path: SHOTS + '/shot-9-admin.png', fullPage: true });

  // 送單
  p5.on('dialog', d => d.accept());
  await p5.click('.cartbar [data-finalize]');
  await p5.waitForTimeout(1000);
  const finalized = await p5.textContent('.cartbar [data-finalize]');
  log('送單後按鈕 =', finalized, finalized === '已送單' ? 'OK' : '✗');
  await p5.screenshot({ path: SHOTS + '/shot-10-finalized.png', fullPage: true });

  /* ---------- 6. 送單後同事還能不能點 ---------- */
  const p6 = await ctx.newPage();
  watch(p6, 'closed');
  await p6.goto(orderUrl);
  await p6.waitForTimeout(900);
  const closedNotice = await p6.$('.notice-warn');
  log('送單後點餐頁鎖定 →', closedNotice ? 'OK' : '✗ 沒鎖');
  await p6.screenshot({ path: SHOTS + '/shot-11-closed.png', fullPage: true });

  /* ---------- 7. 桌機寬度 ---------- */
  const p7 = await ctx.newPage();
  await p7.setViewportSize({ width: 1280, height: 900 });
  await p7.goto(orderUrl.replace(/\?.*/, '') + '?session=' + orderUrl.split('session=')[1]);
  await p7.waitForTimeout(800);
  await p7.screenshot({ path: SHOTS + '/shot-12-desktop.png', fullPage: false });

  log('\n=== JS 錯誤 ===');
  log(errors.length ? errors.join('\n') : '（沒有）');

  await browser.close();
})();
