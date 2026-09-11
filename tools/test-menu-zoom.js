/* 測試：主揪頁／點餐頁的「📋 查看菜單」按鈕點下去會秀出完整菜單相片（lightbox），
   點餐清單裡的品項縮圖也能點擊放大，
   以及主揪建團後有獨立的「主揪自己也要點餐」按鈕（跳到另一頁 order.html，
   不是內嵌），點餐頁上會出現只有主揪自己裝置看得到的「回到管理頁面」連結。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];

  // ---------- 1. index.html：查看菜單按鈕 -> 秀出完整菜單相片 ----------
  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errors.push('index [pageerror] ' + e.message));
  await p1.goto(BASE + '/index.html');
  await p1.waitForSelector('[data-view-menu]', { timeout: 8000 });
  const mpHiddenBeforeClick = (await p1.locator('[data-lightbox]').count()) === 0;
  console.log('index.html: 一開始沒有 lightbox（不會自動彈出） =', mpHiddenBeforeClick);

  await p1.locator('[data-view-menu]').click();
  await p1.waitForSelector('[data-lightbox]', { timeout: 3000 });
  const src = await p1.locator('[data-lightbox] img').getAttribute('src');
  console.log('index.html: 點「查看菜單」後 lightbox 圖片 src =', src);
  console.log('index.html: 圖片是完整菜單相片 =', src.indexOf('full-menu.jpg') > -1);

  await p1.locator('[data-lightbox]').click({ position: { x: 5, y: 5 } });
  await p1.waitForSelector('[data-lightbox]', { state: 'detached', timeout: 3000 });
  console.log('index.html: 點空白處後 lightbox 關閉 = true');

  // ---------- 2. 建團 -> 成功畫面有獨立的「主揪自己也要點餐」按鈕（跳頁，不內嵌） ----------
  async function pick(name, value) { await p1.check('input[name="' + name + '"][value="' + value + '"]'); }
  await p1.fill('#organizer', '測試主揪Zoom');
  await p1.fill('#organizerEmail', 'organizer-zoom@test.com');
  await pick('fulfillment', '外送');
  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const dl = new Date(d.getTime() - 86400000);
  const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';
  await p1.fill('#deliveryDate', dateStr);
  await p1.dispatchEvent('#deliveryDate', 'change');
  await p1.fill('#deliveryTime', '12:30');
  await p1.fill('#address', '台中市西屯區某路1號');
  await p1.fill('#deadline', deadlineStr);
  await pick('needUtensils', '是');
  await pick('typhoonCancel', '是');
  await p1.fill('#contactName', '測試窗口');
  await p1.fill('#contactPhone', '0912345678');
  await p1.fill('#contactAvailableTime', '下午');
  await p1.click('#submitBtn');
  await p1.waitForSelector('#adminUrl', { timeout: 8000 });
  const ownOrderLink = p1.locator('a', { hasText: '主揪自己也要點餐' });
  await ownOrderLink.waitFor({ timeout: 8000 });
  const ownOrderHref = await ownOrderLink.getAttribute('href');
  console.log('index.html: 建團成功後出現「主揪自己也要點餐」按鈕（跳頁，不內嵌） =', !!ownOrderHref);
  console.log('index.html: 沒有殘留的內嵌 iframe =', (await p1.locator('iframe').count()) === 0);

  // ---------- 3. order.html 本身：主揪自己的裝置點這顆連結過去，應該看得到
  //   「回到管理頁面」，而且縮圖可點擊放大、不會誤觸展開規格面板 ----------
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('order [pageerror] ' + e.message));
  await p2.goto(ownOrderHref);
  await p2.waitForSelector('.item-thumb', { timeout: 8000 });
  const backToAdminLink = await p2.locator('a', { hasText: '回到管理頁面' }).count();
  console.log('order.html: 主揪自己的裝置看得到「回到管理頁面」 =', backToAdminLink > 0 ? 'OK' : '✗');
  await p2.locator('.item-thumb').first().click();
  await p2.waitForTimeout(300);
  const lbOpen = (await p2.locator('[data-lightbox] img').count()) > 0 && await p2.isVisible('[data-lightbox] img');
  console.log('order.html: 點縮圖出現 lightbox =', lbOpen);
  const panelOpened = await p2.locator('.item.open').count();
  console.log('order.html: 點縮圖「沒有」順便展開規格面板（應該是 0） =', panelOpened);
  await p2.keyboard.press('Escape');
  await p2.waitForSelector('[data-lightbox]', { state: 'detached', timeout: 3000 });
  console.log('order.html: 按 Esc 後 lightbox 關閉 = true');

  // 查看菜單按鈕也要在
  await p2.locator('[data-view-menu]').click();
  await p2.waitForSelector('[data-lightbox]', { timeout: 3000 });
  const src2 = await p2.locator('[data-lightbox] img').getAttribute('src');
  console.log('order.html: 查看菜單按鈕也能秀出完整菜單相片 =', src2.indexOf('full-menu.jpg') > -1);

  // ---------- 4. 換一台裝置（全新的瀏覽器 context，沒有主揪的 localStorage）
  //   點同一個點餐連結，不該看到「回到管理頁面」——那是主揪自己才有的捷徑 ----------
  const ctx2 = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const p3 = await ctx2.newPage();
  await p3.goto(ownOrderHref);
  await p3.waitForSelector('.item-thumb', { timeout: 8000 });
  const backToAdminLinkOtherDevice = await p3.locator('a', { hasText: '回到管理頁面' }).count();
  console.log('order.html: 同事的裝置「沒有」看到「回到管理頁面」 =', backToAdminLinkOtherDevice === 0 ? 'OK' : '✗');
  await ctx2.close();

  console.log('\n錯誤數：', errors.length);
  errors.forEach(e => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('測試失敗:', e); process.exit(1); });
