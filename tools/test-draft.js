const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const SHOTS = require('path').join(__dirname, 'screenshots');
const errs = [];
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });

  // 主揪先開一團
  const o = await ctx.newPage();
  await o.goto(BASE + '/index.html');
  await o.waitForTimeout(700);
  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const deadlineStr = new Date(d.getTime() - 86400000).toISOString().slice(0, 10) + 'T12:00';
  for (const [sel, v] of [['#organizer','Aaron'],['#organizerEmail','aaron@example.com'],['#deliveryDate',dateStr],
    ['#deliveryTime','11:30'],['#address','某某路 1 號'],['#deadline',deadlineStr],['#company','大真股份有限公司'],
    ['#taxId','12345678'],['#contactName','Aaron'],['#contactPhone','0912345678'],['#contactAvailableTime','下午2點後']]) await o.fill(sel, v);
  await o.click('#submitBtn');
  await o.waitForTimeout(900);
  const orderUrl = await o.textContent('#orderUrl');
  const adminUrl = await o.textContent('#adminUrl');
  await o.close();

  // ---- 同事：一台獨立裝置 ----
  const staff = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const p = await staff.newPage();
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errs.push('[console] ' + m.text()); });

  await p.goto(orderUrl);
  await p.waitForTimeout(800);
  // 選兩樣、填名字，但「不要送出」
  await p.click('.item[data-i="0"] .item-row'); await p.waitForTimeout(300);
  await p.click('.item[data-i="0"] .chip[data-val="塔塔醬"]');
  await p.click('.item[data-i="0"] [data-add]'); await p.waitForTimeout(200);
  await p.click('.item[data-i="4"] .item-row'); await p.waitForTimeout(300);
  await p.click('.item[data-i="4"] [data-add]'); await p.waitForTimeout(200);
  await p.fill('#name', '小明（4樓）');
  await p.fill('#globalNote', '不要辣');
  await p.waitForTimeout(400);
  const beforeTotal = await p.textContent('#barTotal');
  console.log('1. 選好但不送出，小計 =', beforeTotal);

  // 關掉分頁（草稿應該留著）
  await p.close();

  const p2 = await staff.newPage();
  p2.on('pageerror', e => errs.push('[reopen pageerror] ' + e.message));
  await p2.goto(orderUrl);
  await p2.waitForTimeout(1000);
  const afterTotal = await p2.textContent('#barTotal');
  const restoredName = await p2.inputValue('#name');
  const restoredNote = await p2.inputValue('#globalNote');
  const hint = await p2.textContent('#topNotice');
  console.log('2. 重開連結後購物車還在 →', afterTotal === beforeTotal ? 'OK（' + afterTotal + '）' : '✗ ' + afterTotal);
  console.log('3. 姓名有還原 →', restoredName === '小明（4樓）' ? 'OK' : '✗ ' + restoredName);
  console.log('4. 備註有還原 →', restoredNote === '不要辣' ? 'OK' : '✗');
  console.log('5. 有提示是上次留下的 →', hint.includes('選到一半') ? 'OK' : '✗');
  await p2.screenshot({ path: SHOTS + '/draft-1-restored.png', fullPage: false });

  // 送出
  await p2.click('.cartbar [data-submit]');
  await p2.waitForTimeout(1000);
  console.log('6. 送出訂單 →', (await p2.$('#editUrl')) ? 'OK' : '✗');
  await p2.close();

  // 送出後再重開「原本的點餐連結」（沒有 edit 參數）→ 應該自動進修改模式
  const p3 = await staff.newPage();
  p3.on('pageerror', e => errs.push('[reopen2 pageerror] ' + e.message));
  await p3.goto(orderUrl);
  await p3.waitForTimeout(1100);
  const hint2 = await p3.textContent('#topNotice');
  const btnLabel = await p3.textContent('.cartbar [data-submit]');
  const total2 = await p3.textContent('#barTotal');
  console.log('7. 送出後重開連結會回到修改模式 →', btnLabel.includes('更新') ? 'OK' : '✗ ' + btnLabel);
  console.log('   有提示找到先前的訂單 →', hint2.includes('先前送出的訂單') ? 'OK' : '✗');
  console.log('   金額一致 →', total2 === beforeTotal ? 'OK' : '✗ ' + total2);
  await p3.screenshot({ path: SHOTS + '/draft-2-found.png', fullPage: false });
  await p3.close();

  // ---- 管理頁：手動更新 ----
  const a = await ctx.newPage();
  a.on('pageerror', e => errs.push('[admin pageerror] ' + e.message));
  await a.setViewportSize({ width: 480, height: 1000 });
  await a.goto(adminUrl);
  await a.waitForTimeout(1200);
  const updatedTxt = await a.textContent('#updatedAt');
  console.log('8. 顯示最後更新時間 →', updatedTxt.includes('最後更新') ? 'OK（' + updatedTxt.trim() + '）' : '✗ ' + updatedTxt);
  const before = await a.textContent('#stPeople');

  // 這時另一個同事送出一筆，管理頁不重整、直接按「立即更新」應該看得到
  const p4 = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const q = await p4.newPage();
  await q.goto(orderUrl);
  await q.waitForTimeout(800);
  await q.click('.item[data-i="3"] .item-row'); await q.waitForTimeout(300);
  await q.click('.item[data-i="3"] .chip[data-val="泰式酸辣"]');
  await q.click('.item[data-i="3"] [data-add]'); await q.waitForTimeout(200);
  await q.fill('#name', '小華');
  await q.click('.cartbar [data-submit]');
  await q.waitForTimeout(900);

  await a.click('#refreshBtn2');
  await a.waitForTimeout(1200);
  const after = await a.textContent('#stPeople');
  console.log('9. 按「立即更新」抓到新訂單 →', before === '1' && after === '2' ? 'OK（1 → 2 人）' : '✗ ' + before + ' → ' + after);
  console.log('10. 上方「重新整理」也還在 →', (await a.isVisible('#refreshBtn')) ? 'OK' : '✗');
  await a.screenshot({ path: SHOTS + '/draft-3-admin.png', fullPage: false });

  console.log('\n=== JS 錯誤 ===');
  console.log(errs.length ? errs.join('\n') : '（沒有）');
  await browser.close();
})();
