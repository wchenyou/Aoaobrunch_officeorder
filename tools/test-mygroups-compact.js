/* 測試：「你開過的團」改成收合式按鈕＋浮窗（不再一開頁面就佔一大塊、
   也不會把表單往下擠），而且指向已經不存在的舊揪團（換後端留下的孤兒
   資料）會被自動清掉。 */
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

  // ---------- 3. 收合按鈕存在、浮窗預設不在畫面上（DOM 裡根本沒有） ----------
  await p.waitForSelector('#myGroupsToggle', { timeout: 10000 });
  const existsBefore = await p.$('#myGroups');
  console.log('浮窗預設不存在於畫面上 =', existsBefore === null ? 'OK' : '✗');
  const toggleText = await p.locator('#myGroupsToggle').innerText();
  console.log('收合按鈕文字 =', JSON.stringify(toggleText));

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

  // ---------- 6. 再打開一次，等後端查詢回來，孤兒資料應該被自動忘掉，按鈕跟浮窗都跟著消失 ----------
  await p.click('#myGroupsToggle');
  await p.waitForSelector('#myGroupsToggle', { state: 'detached', timeout: 10000 });
  console.log('孤兒揪團被自動清掉、收合按鈕消失 → OK');
  const stored = await p.evaluate(() => localStorage.getItem('aoao_my_groups'));
  console.log('localStorage 也清乾淨了 =', stored === '[]' || !stored ? 'OK' : '✗ 還留著：' + stored);

  console.log('\n錯誤數：', errors.length);
  errors.forEach((e) => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('測試失敗:', e); process.exit(1); });
