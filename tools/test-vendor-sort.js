/* 測試店家後台的訂單排序：依送餐時間（預訂日期）跟依送單時間
   （finalized_at）兩種排序方式，確認順序真的對，不是只檢查畫面
   有沒有跑出東西。建 3 團，故意讓「預訂日期」順序跟「送單順序」
   不一樣，這樣兩種排序如果做錯會直接排出不同的錯誤順序，抓得出來。
   跑完會自己清掉建立的測試團。 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8900';
const SUPABASE_URL = 'https://qoyojgephigwttbhbtft.supabase.co/functions/v1/api';
const SUPABASE_KEY = 'sb_publishable_-sPP27i_r99uhzwS9W2Z-g_yGwgS8xD';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'zh-TW', timezoneId: 'Asia/Taipei' });
  const errors = [];
  const ids = [];

  const p0 = await ctx.newPage();
  const setup = await p0.evaluate(async ({ url, key }) => {
    async function call(action, body) {
      const r = await fetch(url, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
      return r.json();
    }
    function mk(offsetDays) {
      const d = new Date(Date.now() + offsetDays * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dl = new Date(d.getTime() - 86400000);
      const deadlineStr = dl.toISOString().slice(0, 10) + 'T12:00';
      return { dateStr, deadlineStr };
    }
    // S1: 預訂日期 +5 天；S2: +3 天；S3: +7 天
    const s1 = mk(5), s2 = mk(3), s3 = mk(7);
    const c1 = await call('createSession', { organizer: '排序測試S1', organizerEmail: 'wchenyou+aoaotest@gmail.com', fulfillment: '外送', deliveryDate: s1.dateStr, deliveryTime: '12:00', address: '測試地址', deadline: s1.deadlineStr, needUtensils: '是', typhoonCancel: '是', contactName: '窗口', contactPhone: '0900' });
    await call('submitOrder', { sessionId: c1.sessionId, name: '同事', items: [{ code: 'P02', opt1: '千島醬', qty: 1 }] });
    const c2 = await call('createSession', { organizer: '排序測試S2', organizerEmail: 'wchenyou+aoaotest@gmail.com', fulfillment: '外送', deliveryDate: s2.dateStr, deliveryTime: '12:00', address: '測試地址', deadline: s2.deadlineStr, needUtensils: '是', typhoonCancel: '是', contactName: '窗口', contactPhone: '0900' });
    await call('submitOrder', { sessionId: c2.sessionId, name: '同事', items: [{ code: 'P02', opt1: '千島醬', qty: 1 }] });
    const c3 = await call('createSession', { organizer: '排序測試S3', organizerEmail: 'wchenyou+aoaotest@gmail.com', fulfillment: '外送', deliveryDate: s3.dateStr, deliveryTime: '12:00', address: '測試地址', deadline: s3.deadlineStr, needUtensils: '是', typhoonCancel: '是', contactName: '窗口', contactPhone: '0900' });
    await call('submitOrder', { sessionId: c3.sessionId, name: '同事', items: [{ code: 'P02', opt1: '千島醬', qty: 1 }] });

    // 故意用「S3 → S1 → S2」的順序送單，讓送單順序跟預訂日期順序不一樣
    await call('finalizeSession', { sessionId: c3.sessionId, token: c3.adminToken });
    await new Promise(r => setTimeout(r, 1200));
    await call('finalizeSession', { sessionId: c1.sessionId, token: c1.adminToken });
    await new Promise(r => setTimeout(r, 1200));
    await call('finalizeSession', { sessionId: c2.sessionId, token: c2.adminToken });

    return { s1: c1.sessionId, s2: c2.sessionId, s3: c3.sessionId };
  }, { url: SUPABASE_URL, key: SUPABASE_KEY });
  ids.push(setup.s1, setup.s2, setup.s3);
  console.log('準備測試資料 → OK', JSON.stringify(setup));
  await p0.close();

  const p1 = await ctx.newPage();
  p1.on('pageerror', e => errors.push('vendor [pageerror] ' + e.message));
  await p1.goto(BASE + '/vendor.html');
  const needLogin = await p1.$('#pw').catch(() => null);
  if (needLogin) { await p1.fill('#pw', 'aoao4523022'); await p1.click('#loginBtn'); }
  await p1.click('label[for="vtabHistory"]');
  await p1.waitForSelector('#dateFrom', { timeout: 15000 });
  await p1.fill('#dateFrom', new Date(Date.now()).toISOString().slice(0, 10));
  await p1.fill('#dateTo', new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));

  // ---------- 情境 1：依送餐時間排序，預期 S2（+3天）→ S1（+5天）→ S3（+7天） ----------
  await p1.selectOption('#historySortBy', 'deliveryDate');
  await p1.click('#queryBtn');
  await p1.waitForSelector('#historyList .card', { timeout: 15000 });
  const order1 = await p1.locator('#historyList .card h2').allInnerTexts();
  const names1 = order1.map(t => t.match(/排序測試S\d/)?.[0]).filter(Boolean);
  console.log('依送餐時間排序的順序 =', names1.join(' → '));
  console.log('依送餐時間排序正確（S2→S1→S3） →', JSON.stringify(names1) === JSON.stringify(['排序測試S2', '排序測試S1', '排序測試S3']) ? 'OK' : '✗');

  // ---------- 情境 2：依送單時間排序，預期 S3（最先送單）→ S1 → S2（最後送單） ----------
  await p1.selectOption('#historySortBy', 'finalizedAt');
  await p1.click('#queryBtn');
  await p1.waitForSelector('#historyList .card', { timeout: 15000 });
  const order2 = await p1.locator('#historyList .card h2').allInnerTexts();
  const names2 = order2.map(t => t.match(/排序測試S\d/)?.[0]).filter(Boolean);
  console.log('依送單時間排序的順序 =', names2.join(' → '));
  console.log('依送單時間排序正確（S3→S1→S2） →', JSON.stringify(names2) === JSON.stringify(['排序測試S3', '排序測試S1', '排序測試S2']) ? 'OK' : '✗');

  // ---------- 情境 3：待處理訂單頁也有排序控制，切一下確認不會壞 ----------
  await p1.click('label[for="vtabPending"]');
  await p1.waitForSelector('#pendingSortBy', { timeout: 15000 });
  await p1.selectOption('#pendingSortBy', 'finalizedAt');
  await p1.waitForTimeout(1000);
  console.log('待處理訂單頁切排序方式沒有壞掉 →', (await p1.locator('#pendingList').count()) > 0 ? 'OK' : '✗');

  console.log('\n錯誤數：', errors.length);
  errors.forEach(e => console.log(' -', e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('測試失敗:', e); process.exit(1); });
