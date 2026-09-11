/* 測試：完整菜單直接展開（不用先點一下）、圖片點擊放大、
   以及主揪建團後不跳頁、直接在同一頁內嵌點餐。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];

  // ---------- 1. index.html：完整菜單直接展開 + 圖片可點擊放大 ----------
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errors.push('index [pageerror] ' + e.message));
  await p1.goto(BASE + '/index.html');
  await p1.waitForSelector('.menu-preview', { timeout: 8000 });
  const mpVisibleWithoutClick = await p1.isVisible('.mp-grid');
  console.log('index.html: 菜單預覽區塊不用點擊就直接展開 =', mpVisibleWithoutClick);
  const catCount = await p1.locator('.mp-cat').count();
  console.log('index.html: 菜單分類數 =', catCount);
  const listRows = await p1.locator('.mp-list-row').count();
  console.log('index.html: 無照片品項（文字列表）數 =', listRows);

  // 點第一張圖，確認 lightbox 出現
  await p1.locator('.mp-card img').first().click();
  await p1.waitForSelector('[data-lightbox]', { timeout: 3000 });
  const lightboxVisible = await p1.isVisible('[data-lightbox] img');
  console.log('index.html: 點圖片後 lightbox 出現 =', lightboxVisible);
  // 點空白處關掉
  await p1.locator('[data-lightbox]').click({ position: { x: 5, y: 5 } });
  await p1.waitForSelector('[data-lightbox]', { state: 'detached', timeout: 3000 });
  console.log('index.html: 點空白處後 lightbox 關閉 = true');

  // ---------- 2. 建團 -> 成功畫面應該直接內嵌點餐頁（iframe），不用跳頁 ----------
  async function pick(name, value) { await p1.check('input[name="' + name + '"][value="' + value + '"]'); }
  await p1.fill('#organizer', '測試主揪Zoom');
  await p1.fill('#organizerEmail', 'organizer-zoom@test.com');
  await pick('fulfillment', '外送');
  const tomorrow = new Date(Date.now() + 26 * 3600 * 1000);
  const yyyy = tomorrow.getFullYear(), mm = String(tomorrow.getMonth() + 1).padStart(2, '0'), dd = String(tomorrow.getDate()).padStart(2, '0');
  await p1.fill('#deliveryDate', yyyy + '-' + mm + '-' + dd);
  await p1.fill('#deliveryTime', '12:30');
  await p1.fill('#address', '台中市西屯區某路1號');
  const deadlineDay = new Date(tomorrow.getTime() - 24 * 3600 * 1000);
  const dyyyy = deadlineDay.getFullYear(), dmm = String(deadlineDay.getMonth() + 1).padStart(2, '0'), ddd = String(deadlineDay.getDate()).padStart(2, '0');
  await p1.fill('#deadline', dyyyy + '-' + dmm + '-' + ddd + 'T12:00');
  await pick('needUtensils', '是');
  await pick('typhoonCancel', '是');
  await p1.fill('#contactName', '測試窗口');
  await p1.fill('#contactPhone', '0912345678');
  await p1.fill('#contactAvailableTime', '下午');
  await p1.click('#submitBtn');
  await p1.waitForSelector('.inline-order-frame', { timeout: 8000 });
  console.log('index.html: 建團成功後出現 .inline-order-frame（同一頁內嵌點餐） = true');
  const frameSrc = await p1.getAttribute('.inline-order-frame', 'src');
  console.log('index.html: iframe src =', frameSrc);

  // 確認 iframe 裡面真的載入了點餐頁內容（同一頁不用跳轉）
  const orderFrame = p1.frameLocator('.inline-order-frame');
  await orderFrame.locator('.item').first().waitFor({ timeout: 10000 });
  const itemCountInFrame = await orderFrame.locator('.item').count();
  console.log('index.html: 內嵌的點餐頁裡有品項數 =', itemCountInFrame);
  const thumbInFrame = await orderFrame.locator('.item-thumb').count();
  console.log('index.html: 內嵌點餐頁裡的縮圖數 =', thumbInFrame);

  // ---------- 3. order.html 本身：縮圖可點擊放大，且不會誤觸展開規格面板 ----------
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('order [pageerror] ' + e.message));
  const sessionUrl = frameSrc;
  await p2.goto(sessionUrl);
  await p2.waitForSelector('.item-thumb', { timeout: 8000 });
  await p2.locator('.item-thumb').first().click();
  const lbOpen = await p2.isVisible('[data-lightbox] img');
  console.log('order.html: 點縮圖出現 lightbox =', lbOpen);
  const panelOpened = await p2.locator('.item.open').count();
  console.log('order.html: 點縮圖「沒有」順便展開規格面板（應該是 0） =', panelOpened);
  await p2.keyboard.press('Escape');
  await p2.waitForSelector('[data-lightbox]', { state: 'detached', timeout: 3000 });
  console.log('order.html: 按 Esc 後 lightbox 關閉 = true');

  console.log('\n錯誤數：', errors.length);
  errors.forEach(e => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('測試失敗:', e); process.exit(1); });
