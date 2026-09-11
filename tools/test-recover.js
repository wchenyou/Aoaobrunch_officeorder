const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8899';
const SHOTS = require('path').join(__dirname, 'screenshots');
const errs = [];
(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  // 「主揪的裝置」＝同一個 context，localStorage 才會跨分頁保留
  const organizer = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });

  const p = await organizer.newPage();
  p.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errs.push('[console] ' + m.text()); });

  await p.goto(BASE + '/index.html');
  await p.waitForTimeout(700);

  // 1. Email 沒填應該擋下來（HTML required）
  const emailRequired = await p.getAttribute('#organizerEmail', 'required');
  console.log('1. 主揪 Email 為必填 →', emailRequired !== null ? 'OK' : '✗');

  const d = new Date(Date.now() + 3 * 86400000);
  const dateStr = d.toISOString().slice(0, 10);
  const deadlineStr = new Date(d.getTime() - 86400000).toISOString().slice(0, 10) + 'T12:00';
  for (const [sel, val] of [['#organizer','Aaron'],['#organizerEmail','aaron@example.com'],
    ['#deliveryDate',dateStr],['#deliveryTime','11:30'],['#address','台中市西屯區某某路 1 號'],
    ['#deadline',deadlineStr],['#company','大真股份有限公司'],['#taxId','12345678'],
    ['#contactName','Aaron'],['#contactPhone','0912345678'],['#contactAvailableTime','下午 2 點後']]) await p.fill(sel, val);
  await p.click('#submitBtn');
  await p.waitForTimeout(900);

  const adminUrl = await p.textContent('#adminUrl');
  const mailNotice = await p.textContent('#result');
  console.log('2. 建團成功 →', adminUrl ? 'OK' : '✗');
  console.log('3. 畫面顯示已寄信 →', mailNotice.includes('已經寄一份到') ? 'OK' : '✗');

  const mails = await p.evaluate(async () => (await (await fetch('/api?action=_mails')).json()).mails);
  console.log('4. 後端實際寄出信件 →', mails.length === 1 ? 'OK（1 封，收件人 ' + mails[0].to + '）' : '✗ ' + mails.length + ' 封');
  console.log('   信裡的管理連結與畫面一致 →', mails[0].adminUrl === adminUrl ? 'OK' : '✗');

  // 5. 關掉分頁（模擬主揪把頁面關掉）
  await p.close();

  // 6. 過一陣子重新打開首頁 → 應該看到「你開過的團」
  const p2 = await organizer.newPage();
  p2.on('pageerror', e => errs.push('[reopen pageerror] ' + e.message));
  await p2.goto(BASE + '/index.html');
  await p2.waitForTimeout(1200);
  const hasBanner = await p2.isVisible('#myGroups .person');
  const bannerText = hasBanner ? (await p2.textContent('#myGroups')) : '';
  console.log('5. 重開首頁看到「你開過的團」→', hasBanner ? 'OK' : '✗ 沒出現');
  console.log('   顯示公司名稱 →', bannerText.includes('大真股份有限公司') ? 'OK' : '✗');
  console.log('   顯示開團中狀態 →', bannerText.includes('開團中') ? 'OK' : '✗');
  await p2.screenshot({ path: SHOTS + '/recover-1-banner.png', fullPage: false });

  // 7. 點「回到管理頁」應該真的進得去
  await p2.click('#myGroups [data-go]');
  await p2.waitForTimeout(1200);
  const onAdmin = p2.url().includes('admin.html');
  const adminLoaded = await p2.isVisible('#stPeople');
  console.log('6. 一鍵回到管理頁 →', onAdmin && adminLoaded ? 'OK' : '✗');
  await p2.screenshot({ path: SHOTS + '/recover-2-admin.png', fullPage: false });

  // 8. 換一台裝置（新 context＝空的 localStorage），只有信裡的連結
  const otherDevice = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const p3 = await otherDevice.newPage();
  await p3.goto(BASE + '/index.html');
  await p3.waitForTimeout(900);
  const emptyBanner = await p3.isVisible('#myGroups .person');
  console.log('7. 換裝置首頁不會看到別人的團 →', emptyBanner ? '✗ 竟然看得到' : 'OK');

  // 用信裡的連結進去，這台裝置也要記起來
  await p3.goto(mails[0].adminUrl);
  await p3.waitForTimeout(1200);
  await p3.goto(BASE + '/index.html');
  await p3.waitForTimeout(1200);
  const nowRemembered = await p3.isVisible('#myGroups .person');
  console.log('8. 用信中連結開過之後，新裝置也記住了 →', nowRemembered ? 'OK' : '✗');

  console.log('\n=== JS 錯誤 ===');
  console.log(errs.length ? errs.join('\n') : '（沒有）');
  await browser.close();
})();
