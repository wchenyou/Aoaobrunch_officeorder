/*
 * 本機用的假後端：把 Code.gs 的 API 行為用 Node 重現一遍，
 * 同時把 docs/ 當靜態站台服務，讓前端不必真的接上 Apps Script 就能開發與測試。
 * 資料只放在記憶體，重開就清空。
 *
 *   node tools/mock-server.js          → http://localhost:8899
 *
 * 注意：這支只模擬「介面行為」，不會重現 Google 那邊的 CORS 與 302 轉址，
 * 所以跨網域相關的問題只能在真的部署之後才驗得到。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8899);
const DOCS = path.join(__dirname, '..', 'docs');

const MENU_IMAGE_BASE = 'https://wchenyou.github.io/Aoaobrunch_officeorder/images/menu/';
const MENU_SEED = [
  ['P01','嗷飽豬排總匯套餐','套餐',188,'','醬料','凱薩醬,千島醬,塔塔醬,不要醬',true,'','',false,true,'',MENU_IMAGE_BASE+'P01.jpg'],
  ['P02','美式厚牛漢堡套餐','套餐',199,'','醬料','凱薩醬,千島醬,塔塔醬,不要醬',true,'','',false,true,'',MENU_IMAGE_BASE+'P02.jpg'],
  ['P03','普羅旺斯烤菇暖沙拉','沙拉',158,'','醬料','凱薩醬,千島醬,塔塔醬,不要醬',true,'','',false,true,'',MENU_IMAGE_BASE+'P03.jpg'],
  ['P04','鮮嫩舒肥雞胸健康餐','健康餐',249,'','醬料','凱薩醬,千島醬,塔塔醬,不要醬',true,'雞胸口味','原味海鹽,泰式酸辣',true,true,'41g蛋白質',MENU_IMAGE_BASE+'P04.jpg'],
  ['D01','特調紅茶','飲料',30,35,'冰量','正常冰,少冰,微冰,去冰',true,'甜度','正常糖,少糖,半糖,微糖,無糖',true,true,'',''],
  ['D06','穀物蕎麥茶','飲料',35,40,'冰量','正常冰,少冰,微冰,去冰',true,'甜度','正常糖,少糖,半糖,微糖,無糖',true,true,'無咖啡因',''],
  ['D07','特調紅茶歐蕾','飲料',55,70,'冰量','正常冰,少冰,微冰,去冰',true,'甜度','正常糖,少糖,半糖,微糖,無糖',true,true,'',''],
  ['D17','豆漿','飲料',30,35,'甜度','有糖,無糖',true,'','',false,true,'甜度冰塊固定',''],
  ['D19','美式黑咖啡','飲料',50,'','','',false,'','',false,true,'',''],
  ['D21','風味拿鐵','飲料',80,'','口味','黑糖,焦糖,榛果',true,'','',false,true,'可做熱飲','']
];

const SETTINGS = {
  '店家收單Email': 'shop@example.com',
  '副本收單Email': 'sunny30248@gmail.com',
  '颱風假政策文字': '如遇颱風假停班停課，本次團購自動取消，不另行通知。',
  '店家外送電話': '04-2452-3022',
  '低消金額': 1000,
  '外送範圍公里數': 3
};

function menuData() {
  return MENU_SEED.filter(r => r[11] === true).map(r => ({
    code: r[0], name: r[1], category: r[2],
    priceM: r[3] === '' ? null : Number(r[3]),
    priceL: r[4] === '' ? null : Number(r[4]),
    opt1Name: r[5], opt1Choices: r[6] ? String(r[6]).split(',') : [], opt1Required: r[7] === true,
    opt2Name: r[8], opt2Choices: r[9] ? String(r[9]).split(',') : [], opt2Required: r[10] === true,
    note: r[12] || '', imageUrl: r[13] || ''
  }));
}

const sentMails = [];  // 模擬寄出的信
const sessions = {};   // id -> session
const orderRows = [];  // rows

const TAIPEI = 8 * 3600 * 1000;
function parseTaipei(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const hh = m[4] !== undefined ? +m[4] : 0, mi = m[5] !== undefined ? +m[5] : 0;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mi, 0) - TAIPEI);
}
/** 把一個代表「台北時間某個瞬間」的 Date 換成 yyyy-MM-dd（台北曆日）字串，方便比較日期 */
function taipeiDateStr(d) {
  return new Date(d.getTime() + TAIPEI).toISOString().slice(0, 10);
}

function createSession(p) {
  if (!p.organizer) throw new Error('請填寫主揪姓名');
  if (!p.organizerEmail || p.organizerEmail.indexOf('@') < 0) throw new Error('請填寫主揪 Email，管理連結會寄一份到這個信箱，之後才找得回來');
  if (!p.contactName || !p.contactPhone) throw new Error('請填寫聯絡窗口姓名與電話');
  if (p.fulfillment === '外送' && !p.address) throw new Error('外送需要填寫外送地址');
  const deliveryDate = parseTaipei(p.deliveryDate);
  if (!deliveryDate) throw new Error('請填寫正確的預訂日期');
  if (taipeiDateStr(deliveryDate) <= taipeiDateStr(new Date())) {
    throw new Error('預訂日期最早只能選明天，不能選今天或更早的日期');
  }
  const deadline = parseTaipei(p.deadline);
  if (!deadline) throw new Error('請填寫正確的收單截止時間');
  if (deadline.getTime() <= Date.now()) throw new Error('收單截止時間必須晚於現在');
  const maxDeadline = new Date(deliveryDate.getTime() - 24 * 3600 * 1000 + 15 * 3600 * 1000);
  if (deadline.getTime() > maxDeadline.getTime()) throw new Error('收單截止時間不能晚於預訂日期前一天的 15:00（店家規定最晚前一日 15:00 前下單）');

  const id = '20260910-' + Object.keys(sessions).length;
  const token = 'tok' + Object.keys(sessions).length;
  sessions[id] = {
    id, organizer: p.organizer, organizerEmail: p.organizerEmail || '', createdAt: new Date(),
    deadline, fulfillment: p.fulfillment, deliveryDate, deliveryTime: p.deliveryTime || '',
    address: p.address || '', needUtensils: p.needUtensils || '', company: p.company || '', taxId: p.taxId || '',
    contactName: p.contactName, contactPhone: p.contactPhone, contactAvailableTime: p.contactAvailableTime || '',
    typhoonCancel: p.typhoonCancel || '', note: p.note || '', status: '收單中', token
  };
  const base = String(p.baseUrl || '');
  const mailed = base.indexOf('http') === 0;
  if (mailed) {
    sentMails.push({ to: p.organizerEmail, adminUrl: base + 'admin.html?session=' + id + '&admin=' + token });
    console.log('[mock mail] →', p.organizerEmail);
  }
  return { ok: true, sessionId: id, adminToken: token, mailed: mailed };
}

function submitOrder(p, forced, actionLabel) {
  const s = sessions[p.sessionId];
  if (!s) throw new Error('找不到這個揪團，連結可能有誤');
  if (s.status !== '收單中') throw new Error('這個揪團已經截止收單了');
  if (Date.now() >= s.deadline.getTime()) throw new Error('已經超過收單截止時間了');
  if (!p.name) throw new Error('請填寫姓名');
  if (!p.items || !p.items.length) throw new Error('購物車是空的');
  const map = {}; menuData().forEach(m => map[m.code] = m);
  const code = forced || ('OC' + (orderRows.length + 1));
  const notifyEmail = String(p.notifyEmail || '').trim();
  let n = 0;
  p.items.forEach(item => {
    const m = map[item.code];
    if (!m) throw new Error('品項不存在或已下架：' + item.code);
    const qty = Number(item.qty) || 0;
    if (qty <= 0) return;
    if (m.opt1Required && !item.opt1) throw new Error(m.name + ' 需要選擇「' + m.opt1Name + '」');
    if (m.opt2Required && !item.opt2) throw new Error(m.name + ' 需要選擇「' + m.opt2Name + '」');
    const size = item.size || '';
    let price = (size === 'L' && m.priceL) ? m.priceL : m.priceM;
    orderRows.push({
      timestamp: new Date(), sessionId: s.id, orderCode: code, name: p.name,
      itemCode: m.code, itemName: m.name, size, opt1: item.opt1 || '', opt2: item.opt2 || '',
      qty, note: item.note || '', price, subtotal: price * qty, status: '正常', notifyEmail
    });
    n++;
  });
  if (!n) throw new Error('沒有有效的品項，請確認數量');
  if (notifyEmail && notifyEmail.indexOf('@') > -1) {
    sentMails.push({ to: notifyEmail, kind: '訂單' + (actionLabel || '送出'), sentAt: new Date(), orderCode: code });
    console.log('[mock mail] 訂單' + (actionLabel || '送出') + '確認 →', notifyEmail);
  }
  return { ok: true, orderCode: code };
}

function handle(action, p) {
  switch (action) {
    case 'getMenu': return { ok: true, menu: menuData(), settings: SETTINGS };
    case '_mails': return { ok: true, mails: sentMails };
    case 'getOrderPageData': {
      const s = sessions[p.session] || null;
      return { ok: true, session: s, menu: menuData(), settings: SETTINGS,
        existingOrder: (s && p.edit) ? orderRows.filter(o => o.orderCode === p.edit && o.status !== '已取消') : [] };
    }
    case 'getAdminData': {
      const s = sessions[p.session];
      if (!s || s.token !== p.token) throw new Error('連結無效，或管理權杖不正確');
      return { ok: true, session: s, orders: orderRows.filter(o => o.sessionId === p.session && o.status !== '已取消'), settings: SETTINGS };
    }
    case 'createSession': return createSession(p);
    case 'submitOrder': return submitOrder(p, null, '送出');
    case 'updateOrder': {
      const s = sessions[p.sessionId];
      if (!s) throw new Error('找不到這個揪團');
      for (let i = orderRows.length - 1; i >= 0; i--) {
        if (orderRows[i].sessionId === s.id && orderRows[i].orderCode === p.orderCode) orderRows.splice(i, 1);
      }
      const r = submitOrder(p, p.orderCode, '更新');
      return { ok: true, orderCode: r.orderCode, message: '訂單已更新' };
    }
    case 'cancelOrder': {
      const existing = orderRows.filter(o => o.orderCode === p.orderCode && o.status !== '已取消');
      let found = false;
      orderRows.forEach(o => { if (o.orderCode === p.orderCode) { o.status = '已取消'; found = true; } });
      if (!found) throw new Error('找不到這筆訂單');
      const notifyEmail = existing.length ? existing[0].notifyEmail : '';
      if (notifyEmail && notifyEmail.indexOf('@') > -1) {
        sentMails.push({ to: notifyEmail, kind: '訂單取消', sentAt: new Date(), orderCode: p.orderCode });
        console.log('[mock mail] 訂單取消確認 →', notifyEmail);
      }
      return { ok: true, message: '訂單已取消' };
    }
    case 'finalizeSession': {
      const s = sessions[p.sessionId];
      if (!s) throw new Error('找不到這個揪團');
      if (s.token !== p.token) throw new Error('管理權杖不正確，無法送單');
      if (s.status === '已送單') throw new Error('這個揪團已經送過單了');
      const rows = orderRows.filter(o => o.sessionId === s.id && o.status !== '已取消');
      if (!rows.length) throw new Error('目前還沒有任何訂單，無法送單');
      s.status = '已送單';
      // 跟 Code.gs 的 finalizeSession_ 一樣：店家 + 副本 + 主揪信箱，去重
      let recipients = [SETTINGS['店家收單Email'], SETTINGS['副本收單Email']].filter(v => v && v.indexOf('@') > -1);
      if (s.organizerEmail && s.organizerEmail.indexOf('@') > -1) recipients.push(s.organizerEmail);
      recipients = recipients.filter((v, i) => recipients.indexOf(v) === i);
      if (recipients.length) {
        sentMails.push({ to: recipients.join(','), kind: '送單通知', sentAt: new Date(), sessionId: s.id });
        console.log('[mock mail] 送單通知 →', recipients.join(', '));
      }
      return {
        ok: true,
        message: recipients.length ? '已送單並寄出通知信' : '已送單，但沒有設定收件信箱，請到「設定」工作表補上店家收單Email',
        recipients
      };
    }
    case 'completeSession': {
      const s = sessions[p.sessionId];
      if (!s) throw new Error('找不到這個揪團');
      if (s.token !== p.token) throw new Error('管理權杖不正確，無法標記完成');
      if (s.status !== '已送單') throw new Error('要先送單，店家出餐後才能標記為完成');
      s.status = '已完成';
      return { ok: true, message: '已標記為完成' };
    }
    default: throw new Error('未知的操作：' + action);
  }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let out;
        try { const p = JSON.parse(body); out = handle(p.action, p); }
        catch (e) { out = { ok: false, error: e.message }; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      });
      return;
    }
    let out;
    try { out = handle(u.searchParams.get('action'), Object.fromEntries(u.searchParams)); }
    catch (e) { out = { ok: false, error: e.message }; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
    return;
  }

  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  if (p === '/config.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    res.end('const API_URL = "http://localhost:8899/api";');
    return;
  }
  const file = path.join(DOCS, p);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
  res.end(fs.readFileSync(file));
}).listen(PORT, () => console.log('假後端 + 靜態站台跑在 http://localhost:' + PORT));
