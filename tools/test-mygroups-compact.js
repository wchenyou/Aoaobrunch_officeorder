/* 測試：「你開過的團」改成懸浮在右下角的按鈕＋浮窗（不再一開頁面就
   佔一大塊、也不會把表單往下擠），按鈕本身固定存在（不管有沒有記住
   任何團），數字角標顯示筆數，而且指向已經不存在的舊揪團（換後端
   留下的孤兒資料）會被自動清掉，角標也會跟著消失。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8900';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  // ---------- 1. 塞一筆指向不存在揪團的孤兒資料進 localStorage ----------
  await p.goto(BASE + '/index.html');
  await p.evaluate(() => {
    localStorage.setItem('aoao_my_groups', JSON.stringify([
      { id: 'ghost-9999', token: 'ghost-token', organizer: '幽靈團', company: '', status: '已送單', savedAt: Date.now() },
    ]));
  });
  await p.reload();

  // ---------- 2. 一開頁面：表單應該馬上看得到，不用先滑過一大塊「你開過的團」 ----------
  await p.waitForSelector('#organizer', { timeout: 10000 });
  const formBox = await p.locator('#organizer').boundingBox();
  console.log('主揪姓名欄位在畫面很上面（y < 500） =', formBox.y, formBox.y < 500 ? 'OK' : '✗');

  // ---------- 3. 按鈕存在、浮窗預設不在畫面上（DOM 裡根本沒有）、角標顯示 1 ----------
  await p.waitForSelector('#myGroupsToggle', { timeout: 10000 });
  const existsBefore = await p.$('#myGroups');
  console.log('浮窗預設不存在於畫面上 =', existsBefore === null ? 'OK' : '✗');
  const badgeText = await p.locator('#myGroupsToggle .fab-badge').innerText();
  console.log('角標數字 =', badgeText, badgeText === '1' ? 'OK' : '✗');

  // ---------- 4. 點開才看得到內容，而且是蓋在畫面上的浮窗（fixed 全螢幕背景＋卡片） ----------
  await p.click('#myGroupsToggle');
  await p.waitForSelector('#myGroups .person', { timeout: 5000 });
  console.log('點擊後開啟浮窗 → OK');
  const overlayPosition = await p.evaluate(() => getComputedStyle(document.querySelector('[data-modal]')).position);
  console.log('浮窗背景是 fixed 全螢幕蓋住的 =', overlayPosition === 'fixed' ? 'OK' : '✗');

  // ---------- 5. 點浮窗背景（不是卡片本身）會關掉 ----------
  await p.click('[data-modal]', { position: { x: 5, y: 5 } });
  await p.waitForSelector('[data-modal]', { state: 'detached', timeout: 5000 });
  console.log('點浮窗背景後關閉 → OK');

  // ---------- 6. 等後端查詢回來，孤兒資料應該被自動忘掉，角標消失，但按鈕本身一直都在 ----------
  await p.waitForSelector('#myGroupsToggle .fab-badge', { state: 'detached', timeout: 10000 });
  console.log('孤兒揪團被自動清掉、角標消失 → OK');
  const buttonStillThere = await p.$('#myGroupsToggle');
  console.log('按鈕本身沒有消失，還在 =', buttonStillThere !== null ? 'OK' : '✗');
  const stored = await p.evaluate(() => localStorage.getItem('aoao_my_groups'));
  console.log('localStorage 也清乾淨了 =', stored === '[]' || !stored ? 'OK' : '✗ 還留著：' + stored);

  // ---------- 7. 再點開一次，應該是空狀態（不是又打不開） ----------
  await p.click('#myGroupsToggle');
  await p.waitForSelector('#myGroups .empty', { timeout: 5000 });
  console.log('空狀態下再點開也正常顯示 → OK');

  console.log('\n錯誤數：', errors.length);
  errors.forEach((e) => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('測試失敗:', e); process.exit(1); });
