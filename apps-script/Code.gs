/**
 * ⚠️ 已停用（2026-09-11 起）：正式環境的後端已經搬到 Supabase Edge Function，
 * 見 supabase/functions/api/index.ts，docs/config.js 也已經指向新的網址。
 * 這份檔案留著當歷史參考，不要再改它去修正線上的問題。
 * ------------------------------------------------------------
 *
 * 嗷嗷早午餐｜辦公室團購點餐系統 — 後端 API（Apps Script）
 * ------------------------------------------------------------
 * 這一版是「前後端分離」版本：Apps Script 只負責資料（讀寫試算表、
 * 寄通知信），不再自己出前端頁面。前端頁面另外放在 GitHub Pages
 * （見 repo 的 docs/ 資料夾），用 fetch() 呼叫這支程式當 JSON API。
 *
 * 使用方式：
 * 1. 建立一份新的 Google 試算表，把它的時區設成 Asia/Taipei
 *    （檔案 → 設定 → 地區設為台灣）。
 * 2. 擴充功能 → Apps Script，把這個檔案內容整個貼進去（不需要
 *    其他 HTML 檔案了，前端在 GitHub Pages 那邊）。
 * 3. 在編輯器選取 setupSheet 函式，按「執行」一次，會自動建立
 *    「菜單」「訂單」「揪團」「設定」四個工作表並填入預設資料。
 * 4. 打開「設定」工作表，把「店家收單Email」改成真正的收單信箱。
 * 5. 部署 → New deployment → Web app。
 *    執行身分：我，具有存取權的使用者：知道連結的任何人。
 * 6. 把部署後的網址（結尾是 /exec）填進 docs/config.js 的
 *    API_URL，這樣前端才連得到這支 API。
 */

const SHEETS = {
  MENU: '菜單',
  ORDERS: '訂單',
  SESSIONS: '揪團',
  SETTINGS: '設定'
};

const MENU_HEADERS = ['品項代碼', '品項名稱', '分類', '單價M', '單價L', '規格1名稱', '規格1選項', '規格1必選', '規格2名稱', '規格2選項', '規格2必選', '供應中', '備註', '圖片網址'];
const ORDER_HEADERS = ['時間戳記', '揪團編號', '訂單編號', '訂購人', '品項代碼', '品項名稱', '杯型', '規格1選擇', '規格2選擇', '數量', '備註', '單價', '小計', '狀態', '通知Email'];
const SESSION_HEADERS = ['揪團編號', '主揪', '主揪Email', '建立時間', '收單截止時間', '取餐方式', '預訂日期', '期望送達時間', '外送地址', '是否需要餐具', '公司名稱', '統一編號', '聯絡窗口姓名', '聯絡窗口電話', '方便接聽電話時間', '颱風假是否取消', '備註', '狀態', '管理權杖'];

const MENU_IMAGE_BASE = 'https://wchenyou.github.io/Aoaobrunch_officeorder/images/menu/';

const MENU_SEED = [
  ['P01', '嗷飽豬排總匯套餐', '套餐', 188, '', '醬料', '凱薩醬,千島醬,塔塔醬,不要醬', true, '', '', false, true, '', MENU_IMAGE_BASE + 'P01.jpg'],
  ['P02', '美式厚牛漢堡套餐', '套餐', 199, '', '醬料', '凱薩醬,千島醬,塔塔醬,不要醬', true, '', '', false, true, '', MENU_IMAGE_BASE + 'P02.jpg'],
  ['P03', '普羅旺斯烤菇暖沙拉', '沙拉', 158, '', '醬料', '凱薩醬,千島醬,塔塔醬,不要醬', true, '', '', false, true, '', MENU_IMAGE_BASE + 'P03.jpg'],
  ['P04', '鮮嫩舒肥雞胸健康餐', '健康餐', 249, '', '醬料', '凱薩醬,千島醬,塔塔醬,不要醬', true, '雞胸口味', '原味海鹽,泰式酸辣', true, true, '41g蛋白質', MENU_IMAGE_BASE + 'P04.jpg'],
  ['D01', '特調紅茶', '飲料', 30, 35, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D02', '梔子花綠茶', '飲料', 30, 35, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D03', '四季春青茶', '飲料', 35, 40, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D04', '奶香金萱', '飲料', 30, 35, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D05', '熟果烏龍茶', '飲料', 35, 40, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D06', '穀物蕎麥茶', '飲料', 35, 40, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '無咖啡因', ''],
  ['D07', '特調紅茶歐蕾', '飲料', 55, 70, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D08', '梔子花歐蕾', '飲料', 55, 70, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D09', '四季春歐蕾', '飲料', 60, 75, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D10', '熟果烏龍歐蕾', '飲料', 60, 75, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D11', '穀物蕎麥歐蕾', '飲料', 60, 75, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '無咖啡因', ''],
  ['D12', '特調紅奶茶', '飲料', 45, 60, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D13', '梔子花奶綠', '飲料', 45, 60, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D14', '四季春奶青', '飲料', 50, 65, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D15', '熟果烏龍奶茶', '飲料', 50, 65, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D16', '穀物蕎麥奶茶', '飲料', 50, 65, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '無咖啡因', ''],
  ['D17', '豆漿', '飲料', 30, 35, '甜度', '有糖,無糖', true, '', '', false, true, '甜度冰塊固定', ''],
  ['D18', '豆漿紅茶', '飲料', 35, 40, '冰量', '正常冰,少冰,微冰,去冰', true, '甜度', '正常糖,少糖,半糖,微糖,無糖', true, true, '', ''],
  ['D19', '美式黑咖啡', '飲料', 50, '', '', '', false, '', '', false, true, '', ''],
  ['D20', '拿鐵咖啡', '飲料', 70, '', '', '', false, '', '', false, true, '可做熱飲', ''],
  ['D21', '風味拿鐵', '飲料', 80, '', '口味', '黑糖,焦糖,榛果', true, '', '', false, true, '可做熱飲', '']
];

const SETTINGS_SEED = [
  ['店家收單Email', '請填入店家的 email 帳號'],
  ['副本收單Email', 'sunny30248@gmail.com'],
  ['颱風假政策文字', '如遇颱風假，依店家規定為：＿＿＿（請填寫實際內容，會顯示在點餐頁面上）'],
  ['店家外送電話', '04-2452-3022'],
  ['店家地址', '台中市西屯區河南路二段486號（嗷嗷早午餐）'],
  ['低消金額', 1000],
  ['外送範圍公里數', 3],
  ['前端網址', '（選填）GitHub Pages 的網址，例如 https://帳號.github.io/repo/ ；留空的話會用建團當下前端傳來的網址']
];

/* ============ 一次性初始化 ============ */

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Taipei');

  const menu = getOrCreateSheet_(ss, SHEETS.MENU, MENU_HEADERS);
  if (menu.getLastRow() < 2) {
    menu.getRange(2, 1, MENU_SEED.length, MENU_HEADERS.length).setValues(MENU_SEED);
    menu.getRange(2, 8, MENU_SEED.length, 1).insertCheckboxes();
    menu.getRange(2, 11, MENU_SEED.length, 1).insertCheckboxes();
    menu.getRange(2, 12, MENU_SEED.length, 1).insertCheckboxes();
  }

  getOrCreateSheet_(ss, SHEETS.ORDERS, ORDER_HEADERS);
  getOrCreateSheet_(ss, SHEETS.SESSIONS, SESSION_HEADERS);

  const settings = getOrCreateSheet_(ss, SHEETS.SETTINGS, ['設定項', '值']);
  if (settings.getLastRow() < 2) {
    settings.getRange(2, 1, SETTINGS_SEED.length, 2).setValues(SETTINGS_SEED);
  }

  /* 新建的試算表會留一個空的預設分頁，清掉比較整齊 */
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    const isDefault = (name === 'Sheet1' || name === '工作表1');
    if (isDefault && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  SpreadsheetApp.flush();
  Logger.log('初始化完成！請到「設定」工作表，把「店家收單Email」改成真正的收單信箱。');
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    /* 既有的表：如果程式後來新增了欄位，把缺的標題補在最後面，
       既有欄位順序跟資料都不動，舊資料在新欄位就是空白。 */
    const existingCols = sheet.getLastColumn();
    if (existingCols < headers.length) {
      sheet.getRange(1, existingCols + 1, 1, headers.length - existingCols)
        .setValues([headers.slice(existingCols)]);
    }
  }
  return sheet;
}

/* ============ JSON API（給 GitHub Pages 前端用 fetch() 呼叫） ============ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    switch (p.action) {
      case 'getMenu':
        return jsonOut_({ ok: true, menu: getMenuData_(), settings: getSettingsMap_() });
      case 'getOrderPageData':
        return jsonOut_(apiGetOrderPageData_(p));
      case 'getAdminData':
        return jsonOut_(apiGetAdminData_(p));
      default:
        return ContentService
          .createTextOutput('嗷嗷早午餐團購系統 API 運作中。請透過前端頁面（GitHub Pages）使用，不要直接打開這個網址。')
          .setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: '請求格式錯誤' });
  }
  try {
    switch (payload.action) {
      case 'createSession': return jsonOut_(createSession_(payload));
      case 'submitOrder': return jsonOut_(submitOrder_(payload));
      case 'updateOrder': return jsonOut_(updateOrder_(payload));
      case 'cancelOrder': return jsonOut_(cancelOrder_(payload));
      case 'finalizeSession': return jsonOut_(finalizeSession_(payload));
      case 'completeSession': return jsonOut_(completeSession_(payload));
      default: return jsonOut_({ ok: false, error: '未知的操作：' + payload.action });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: err.message });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function apiGetOrderPageData_(p) {
  const session = findSession_(p.session);
  return {
    ok: true,
    session: session,
    menu: getMenuData_(),
    settings: getSettingsMap_(),
    existingOrder: (session && p.edit) ? getOrderByCode_(p.session, p.edit) : []
  };
}

function apiGetAdminData_(p) {
  const session = findSession_(p.session);
  if (!session || session.token !== p.token) throw new Error('連結無效，或管理權杖不正確');
  return {
    ok: true,
    session: session,
    orders: getOrdersForSession_(p.session).filter(o => o.status !== '已取消'),
    settings: getSettingsMap_()
  };
}

/* ============ 資料讀取 ============ */

function getSettingsMap_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SETTINGS);
  const values = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) map[values[i][0]] = values[i][1];
  }
  return map;
}

function getMenuData_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.MENU);
  const values = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[0] || r[11] !== true) continue;
    rows.push({
      code: r[0], name: r[1], category: r[2],
      priceM: r[3] === '' ? null : Number(r[3]),
      priceL: r[4] === '' ? null : Number(r[4]),
      opt1Name: r[5], opt1Choices: r[6] ? String(r[6]).split(',').map(s => s.trim()).filter(Boolean) : [],
      opt1Required: r[7] === true,
      opt2Name: r[8], opt2Choices: r[9] ? String(r[9]).split(',').map(s => s.trim()).filter(Boolean) : [],
      opt2Required: r[10] === true,
      note: r[12] || '',
      imageUrl: r[13] || ''
    });
  }
  return rows;
}

function findSession_(sessionId) {
  if (!sessionId) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SESSIONS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === sessionId) return rowToSessionObj_(values[i]);
  }
  return null;
}

function rowToSessionObj_(r) {
  return {
    id: r[0], organizer: r[1], organizerEmail: r[2], createdAt: r[3],
    deadline: r[4], fulfillment: r[5], deliveryDate: r[6], deliveryTime: formatTimeOfDay_(r[7]),
    address: r[8], needUtensils: r[9], company: r[10], taxId: r[11],
    contactName: r[12], contactPhone: r[13], contactAvailableTime: formatTimeOfDay_(r[14]),
    typhoonCancel: r[15], note: r[16], status: r[17], token: r[18]
  };
}

/**
 * 「期望送達時間」「方便接聽電話時間」是自由輸入的文字，但如果剛好長得像時間
 * （例如「12:30」），Google 試算表會自動把那個儲存格判斷成時間格式，
 * getDataRange().getValues() 讀回來就不是字串而是 Date（序列值 1899-12-30 起算）。
 * 這裡統一轉回 HH:mm 文字，避免前端顯示出 1899-12-30T04:30:00.000Z 這種內部值。
 */
function formatTimeOfDay_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'HH:mm');
  return v || '';
}

function getOrdersForSession_(sessionId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[1] !== sessionId) continue;
    out.push({
      timestamp: r[0], sessionId: r[1], orderCode: r[2], name: r[3],
      itemCode: r[4], itemName: r[5], size: r[6], opt1: r[7], opt2: r[8],
      qty: r[9], note: r[10], price: r[11], subtotal: r[12], status: r[13],
      notifyEmail: r[14] || ''
    });
  }
  return out;
}

function getOrderByCode_(sessionId, orderCode) {
  return getOrdersForSession_(sessionId).filter(o => o.orderCode === orderCode && o.status !== '已取消');
}

/* ============ 建立揪團 ============ */

function createSession_(p) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SESSIONS);

  if (!p.organizer) throw new Error('請填寫主揪姓名');
  if (!p.organizerEmail || p.organizerEmail.indexOf('@') < 0) {
    throw new Error('請填寫主揪 Email，管理連結會寄一份到這個信箱，之後才找得回來');
  }
  if (!p.contactName || !p.contactPhone) throw new Error('請填寫聯絡窗口姓名與電話');
  if (p.fulfillment === '外送' && !p.address) throw new Error('外送需要填寫外送地址');

  const deliveryDate = parseTaipeiDateTime_(p.deliveryDate);
  if (!deliveryDate) throw new Error('請填寫正確的預訂日期');

  // 預訂日期最早只能選明天（用日期字串比較，不受伺服器時區影響）
  const todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const deliveryDateStr = Utilities.formatDate(deliveryDate, 'Asia/Taipei', 'yyyy-MM-dd');
  if (deliveryDateStr <= todayStr) {
    throw new Error('預訂日期最早只能選明天，不能選今天或更早的日期');
  }

  const deadline = parseTaipeiDateTime_(p.deadline);
  if (!deadline) throw new Error('請填寫正確的收單截止時間');
  if (deadline.getTime() <= Date.now()) throw new Error('收單截止時間必須晚於現在');

  // 預訂日期前一天的台北時間 15:00（純用 epoch 毫秒運算，不依賴伺服器預設時區）
  const maxDeadline = new Date(deliveryDate.getTime() - 24 * 3600 * 1000 + 15 * 3600 * 1000);
  if (deadline.getTime() > maxDeadline.getTime()) {
    throw new Error('收單截止時間不能晚於預訂日期前一天的 15:00（店家規定最晚前一日 15:00 前下單）');
  }

  const id = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd') + '-' + Utilities.getUuid().slice(0, 4).toUpperCase();
  const token = Utilities.getUuid().replace(/-/g, '');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.appendRow([
      id, p.organizer, p.organizerEmail || '', new Date(), deadline,
      p.fulfillment, deliveryDate, p.deliveryTime || '', p.address || '',
      p.needUtensils || '', p.company || '', p.taxId || '', p.contactName, p.contactPhone,
      p.contactAvailableTime || '', p.typhoonCancel || '', p.note || '', '收單中', token
    ]);
  } finally {
    lock.releaseLock();
  }

  // 主揪常常貼完連結就把分頁關掉，等收團才回來，
  // 所以建團當下就把管理連結寄一份到他的信箱，換裝置也找得回來。
  let mailed = false;
  try {
    mailed = sendOrganizerLinks_(id, token, p);
  } catch (err) {
    // 寄信失敗不該讓建團整個失敗，前端會提醒主揪自己保存連結
    Logger.log('寄送管理連結失敗：' + err.message);
  }

  // 前端網址由前端自己組（Apps Script 不知道 GitHub Pages 的網址）
  return { ok: true, sessionId: id, adminToken: token, mailed: mailed };
}

/**
 * 建團後寄一封信給主揪，內含點餐連結與管理連結。
 * 網址優先用「設定」工作表裡的「前端網址」，沒填就用前端傳來的 baseUrl。
 */
function sendOrganizerLinks_(id, token, p) {
  const settings = getSettingsMap_();
  let base = String(settings['前端網址'] || '').trim();
  if (base.indexOf('http') !== 0) base = String(p.baseUrl || '').trim();
  if (base.indexOf('http') !== 0) return false;
  if (base.slice(-1) !== '/') base += '/';

  const orderUrl = base + 'order.html?session=' + encodeURIComponent(id);
  const adminUrl = base + 'admin.html?session=' + encodeURIComponent(id) + '&admin=' + encodeURIComponent(token);

  const lines = [
    p.organizer + ' 你好，你的團開好了。',
    '',
    '這封信請留著，之後要收團、送單都靠它。',
    '',
    '── 分享給同事的點餐連結 ──',
    orderUrl,
    '',
    '── 你的管理連結（請勿外流） ──',
    adminUrl,
    '只有這個連結能看到全部訂單、按下送單。',
    '',
    '── 這次的團 ──',
    '公司：' + (p.company || '（未填）'),
    '取餐方式：' + p.fulfillment,
    '預訂日期：' + formatDate_(parseTaipeiDateTime_(p.deliveryDate)) + ' ' + (p.deliveryTime || ''),
    '收單截止：' + Utilities.formatDate(parseTaipeiDateTime_(p.deadline), 'Asia/Taipei', 'M/d HH:mm'),
    '',
    '截止時間一到，同事就不能再點餐或修改，記得回管理連結按送單。'
  ];

  MailApp.sendEmail({
    to: p.organizerEmail,
    subject: '【嗷嗷團購】' + (p.company || p.organizer) + ' 的管理連結（' + formatDate_(parseTaipeiDateTime_(p.deliveryDate)) + '）',
    body: lines.join('\n')
  });
  return true;
}

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 把來自表單的「YYYY-MM-DD」或「YYYY-MM-DDTHH:mm」字串視為台北時間解析成 Date。
 * 用純粹的 epoch 毫秒運算換算，不依賴 Apps Script 伺服器當下的預設時區設定，
 * 避免 new Date(字串) 在不同環境下對「沒有時區資訊的時間字串」解讀不一致的問題。
 */
function parseTaipeiDateTime_(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const hh = m[4] !== undefined ? Number(m[4]) : 0;
  const mi = m[5] !== undefined ? Number(m[5]) : 0;
  const utcMs = Date.UTC(y, mo - 1, d, hh, mi, 0) - TAIPEI_OFFSET_MS;
  const result = new Date(utcMs);
  return isNaN(result.getTime()) ? null : result;
}

/* ============ 送出／修改／取消訂單 ============ */

function submitOrder_(p, forcedOrderCode, actionLabel) {
  const session = findSession_(p.sessionId);
  if (!session) throw new Error('找不到這個揪團，連結可能有誤');
  if (session.status !== '收單中') throw new Error('這個揪團已經截止收單了');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');
  if (!p.name) throw new Error('請填寫姓名');
  if (!p.items || !p.items.length) throw new Error('購物車是空的');

  const menu = getMenuData_();
  const menuMap = {};
  menu.forEach(m => { menuMap[m.code] = m; });

  const rows = [];
  const lineObjs = []; // 給確認信用的明細，跟 rows 一一對應
  const orderCode = forcedOrderCode || Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
  const now = new Date();
  const notifyEmail = String(p.notifyEmail || '').trim();

  p.items.forEach(item => {
    const m = menuMap[item.code];
    if (!m) throw new Error('品項不存在或已下架：' + item.code);
    const qty = Number(item.qty) || 0;
    if (qty <= 0) return;
    if (m.opt1Required && !item.opt1) throw new Error(m.name + ' 需要選擇「' + m.opt1Name + '」');
    if (m.opt2Required && !item.opt2) throw new Error(m.name + ' 需要選擇「' + m.opt2Name + '」');
    const size = item.size || '';
    let price = m.priceM;
    if (size === 'L' && m.priceL) price = m.priceL;
    price = Number(price) || 0;
    rows.push([
      now, session.id, orderCode, p.name, m.code, m.name, size,
      item.opt1 || '', item.opt2 || '', qty, item.note || '', price, price * qty, '正常', notifyEmail
    ]);
    lineObjs.push({
      itemName: m.name, size: size, opt1: item.opt1 || '', opt2: item.opt2 || '',
      qty: qty, note: item.note || '', subtotal: price * qty
    });
  });

  if (!rows.length) throw new Error('沒有有效的品項，請確認數量');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, ORDER_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }

  // 選填：跟團者留了信箱，就補一份明細給他自己，寄送時間可以當作版本依據。
  if (notifyEmail && notifyEmail.indexOf('@') > -1) {
    try {
      sendOrderConfirmation_(session, p.name, lineObjs, orderCode, notifyEmail, actionLabel || '送出', p);
    } catch (err) {
      Logger.log('寄送訂單確認信失敗：' + err.message);
    }
  }

  // 同樣不在這裡組前端網址，回傳 orderCode 讓前端自己組修改連結。
  return { ok: true, orderCode: orderCode };
}

function updateOrder_(p) {
  const session = findSession_(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.status !== '收單中') throw new Error('已經截止收單，無法修改');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');
  if (!p.orderCode) throw new Error('缺少訂單編號');

  removeOrderRows_(session.id, p.orderCode, false);
  const result = submitOrder_(p, p.orderCode, '更新');
  return { ok: true, orderCode: result.orderCode, message: '訂單已更新' };
}

function cancelOrder_(p) {
  const session = findSession_(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.status !== '收單中') throw new Error('已經截止收單，無法取消');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');

  // 取消前先留一份快照：如果訂單有留通知信箱，等等要用裡面的內容跟信箱補寄取消確認信。
  const existing = getOrderByCode_(session.id, p.orderCode);
  const removed = removeOrderRows_(session.id, p.orderCode, true);
  if (!removed) throw new Error('找不到這筆訂單');

  const notifyEmail = existing.length ? existing[0].notifyEmail : '';
  if (notifyEmail && notifyEmail.indexOf('@') > -1) {
    const lineObjs = existing.map(o => ({
      itemName: o.itemName, size: o.size, opt1: o.opt1, opt2: o.opt2, qty: o.qty, note: o.note, subtotal: o.subtotal
    }));
    try {
      sendOrderConfirmation_(session, existing[0].name, lineObjs, p.orderCode, notifyEmail, '取消', p);
    } catch (err) {
      Logger.log('寄送取消確認信失敗：' + err.message);
    }
  }

  return { ok: true, message: '訂單已取消' };
}

/**
 * 選填功能：跟團者送出／更新／取消訂單時，如果留了信箱，就寄一份明細給他自己。
 * 信裡帶「寄送時間」，改了好幾次的話，時間最新的那一封就是目前正確的版本。
 */
function sendOrderConfirmation_(session, name, lineObjs, orderCode, notifyEmail, actionLabel, p) {
  const sentAt = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm:ss');
  const lines = [];
  lines.push('這是你在「' + session.organizer + '」揪的團裡，訂單' + actionLabel + '的明細。');
  lines.push('寄送時間：' + sentAt);
  lines.push('（如果同一筆訂單收到不只一封，時間最新的這封才是目前正確的版本。）');
  lines.push('');
  lines.push('揪團：' + session.organizer + '　預訂日期：' + formatDate_(session.deliveryDate));
  lines.push('訂購人：' + name);
  lines.push('');
  lines.push(actionLabel === '取消' ? '── 取消前的內容（僅供留存） ──' : '── 目前的訂購內容 ──');

  let total = 0;
  lineObjs.forEach(function (l) {
    const specs = [l.size, l.opt1, l.opt2].filter(Boolean).join('／');
    lines.push('・' + l.itemName + (specs ? '（' + specs + '）' : '') + ' x ' + l.qty + '　$' + l.subtotal + (l.note ? '　備註：' + l.note : ''));
    total += Number(l.subtotal) || 0;
  });
  lines.push('');
  lines.push('小計：$' + total);

  if (actionLabel !== '取消') {
    const settings = getSettingsMap_();
    let base = String(settings['前端網址'] || '').trim();
    if (base.indexOf('http') !== 0) base = String((p && p.baseUrl) || '').trim();
    if (base.indexOf('http') === 0) {
      if (base.slice(-1) !== '/') base += '/';
      lines.push('');
      lines.push('截止前想改或想取消，用這個連結：');
      lines.push(base + 'order.html?session=' + encodeURIComponent(session.id) + '&edit=' + encodeURIComponent(orderCode));
    }
  }

  MailApp.sendEmail({
    to: notifyEmail,
    subject: '【嗷嗷團購】你的訂單' + actionLabel + '確認（' + sentAt + '）',
    body: lines.join('\n')
  });
}

function removeOrderRows_(sessionId, orderCode, markCancelled) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.ORDERS);
  const values = sheet.getDataRange().getValues();
  let found = false;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    for (let i = values.length - 1; i >= 1; i--) {
      if (values[i][1] === sessionId && values[i][2] === orderCode) {
        found = true;
        if (markCancelled) {
          sheet.getRange(i + 1, 14).setValue('已取消');
        } else {
          sheet.deleteRow(i + 1);
        }
      }
    }
  } finally {
    lock.releaseLock();
  }
  return found;
}

/* ============ 送單／通知 ============ */

function finalizeSession_(p) {
  const session = findSession_(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.token !== p.token) throw new Error('管理權杖不正確，無法送單');
  if (session.status === '已送單') throw new Error('這個揪團已經送過單了');

  const orders = getOrdersForSession_(session.id).filter(o => o.status !== '已取消');
  if (!orders.length) throw new Error('目前還沒有任何訂單，無法送單');

  markSessionStatus_(session.id, '已送單');

  const settings = getSettingsMap_();
  const emailBody = buildOrderEmail_(session, orders, settings);
  let recipients = [String(settings['店家收單Email'] || ''), String(settings['副本收單Email'] || '')]
    .filter(v => v && v.indexOf('@') > -1);
  if (session.organizerEmail && session.organizerEmail.indexOf('@') > -1) recipients.push(session.organizerEmail);
  recipients = recipients.filter((v, i) => recipients.indexOf(v) === i); // 去重，避免同一信箱收兩封

  if (recipients.length) {
    MailApp.sendEmail({
      to: recipients.join(','),
      subject: '【團購訂單】' + (session.company || session.organizer) + '｜' + formatDate_(session.deliveryDate) + '｜' + session.fulfillment,
      body: emailBody
    });
  }

  return { ok: true, message: recipients.length ? '已送單並寄出通知信' : '已送單，但沒有設定收件信箱，請到「設定」工作表補上店家收單Email', recipients: recipients };
}

/**
 * 店家出餐完成後，主揪回管理頁按「標記已完成」。
 * 標記完之後這團就不會再出現在主揪首頁的「你開過的團」列表——那邊只留還需要主揪關注的團，
 * 已經出完餐的團就不用再一直佔位子。
 */
function completeSession_(p) {
  const session = findSession_(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.token !== p.token) throw new Error('管理權杖不正確，無法標記完成');
  if (session.status !== '已送單') throw new Error('要先送單，店家出餐後才能標記為完成');
  markSessionStatus_(session.id, '已完成');
  return { ok: true, message: '已標記為完成' };
}

function markSessionStatus_(sessionId, status) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.SESSIONS);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === sessionId) {
      sheet.getRange(i + 1, 18).setValue(status);
      return;
    }
  }
}

function buildOrderEmail_(session, orders, settings) {
  const lines = [];
  lines.push('【嗷嗷早午餐｜辦公室團購訂單】');
  lines.push('揪團編號：' + session.id);
  lines.push('主揪：' + session.organizer);
  lines.push('');
  lines.push('── 訂購資訊 ──');
  lines.push('取餐方式：' + session.fulfillment);
  lines.push('預訂日期：' + formatDate_(session.deliveryDate));
  lines.push('期望送達時間：' + session.deliveryTime);
  if (session.fulfillment === '外送') lines.push('外送地址：' + session.address);
  lines.push('是否需要餐具：' + session.needUtensils);
  lines.push('公司名稱：' + (session.company || '（未填）'));
  lines.push('統一編號：' + (session.taxId || '（未填）'));
  lines.push('聯絡窗口：' + session.contactName + '（' + session.contactPhone + '）');
  lines.push('方便接聽電話時間：' + session.contactAvailableTime);
  lines.push('若遇颱風假是否取消：' + session.typhoonCancel);
  if (session.note) lines.push('備註：' + session.note);
  lines.push('');
  lines.push('── 訂購明細（依人員） ──');

  let total = 0;
  const byPerson = {};
  orders.forEach(o => {
    byPerson[o.name] = byPerson[o.name] || [];
    byPerson[o.name].push(o);
    total += Number(o.subtotal) || 0;
  });
  Object.keys(byPerson).forEach(name => {
    lines.push(name + '：');
    byPerson[name].forEach(o => {
      const specs = [o.size, o.opt1, o.opt2].filter(Boolean).join('／');
      lines.push('　・' + o.itemName + (specs ? '（' + specs + '）' : '') + ' x ' + o.qty + '　$' + o.subtotal + (o.note ? '　備註：' + o.note : ''));
    });
  });

  lines.push('');
  lines.push('── 品項彙總（方便店家備餐） ──');
  const byItem = {};
  orders.forEach(o => {
    const key = o.itemName + '｜' + [o.size, o.opt1, o.opt2].filter(Boolean).join('／');
    byItem[key] = (byItem[key] || 0) + Number(o.qty);
  });
  Object.keys(byItem).forEach(key => lines.push('・' + key + '　共 ' + byItem[key] + ' 份'));

  lines.push('');
  lines.push('訂單總金額：$' + total);
  const minOrder = Number(settings['低消金額'] || 0);
  if (session.fulfillment === '外送' && minOrder && total < minOrder) {
    lines.push('⚠️ 尚未達到外送低消 $' + minOrder + '，請確認是否需要加點或改為自取。');
  }
  return lines.join('\n');
}

function formatDate_(d) {
  if (!(d instanceof Date)) d = new Date(d);
  return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy/MM/dd');
}
