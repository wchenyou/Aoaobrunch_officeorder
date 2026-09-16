/**
 * 嗷嗷早午餐｜辦公室團購點餐系統 — 後端 API（Supabase Edge Function）
 * ------------------------------------------------------------
 * 這是原本 apps-script/Code.gs 的替代品，邏輯幾乎逐一對應搬過來，
 * 差別只在「資料庫」從 Google 試算表換成 Supabase 的 Postgres。
 *
 * 前端（docs/ 資料夾，GitHub Pages）不變，只是 config.js 裡的 API_URL
 * 換成這支函式的網址，呼叫方式（action + 參數）維持原本的 api.js 合約。
 *
 * 資料表都關了 RLS、不開放任何公開存取，前端一律透過這支函式（用
 * service role）讀寫，跟原本「前端只透過後端 API 講話」的架構一致。
 *
 * 寄信改用 Gmail SMTP（不是 Resend——Resend 的共用測試網域只能寄給
 * 自己，要寄給別人得先買網域驗證，太麻煩）。直接用一個真的 Gmail
 * 帳號（settings.寄件人Email）+ 應用程式密碼（settings.寄信Gmail應用
 * 程式密碼）登入 smtp.gmail.com 寄信，效果等同用那個 Gmail 帳號本人
 * 寄信，收件人沒有限制。帳號、密碼、寄件人名稱都放在 settings 資料
 * 表，不是環境變數——這樣之後要換寄信帳號不用重新部署程式碼，直接在
 * Supabase 後台的 Table Editor 改一格就好，跟以前改 Google 試算表的
 * 「設定」分頁是同一種習慣。密碼欄位是空的的話就跳過寄信，不會讓
 * 整支 API 掛掉。
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return json({ ok: false, error: message });
}

/* ============ 台北時間小工具 ============
   用 +08:00 明確時區字串讓 JS 自己解析／格式化，不用像 Apps Script
   那樣手算 epoch 繞開「腳本預設時區不可靠」的問題——Edge Function
   沒有那個問題，直接標明時區就好。 */

function pad(n: number) { return String(n).padStart(2, '0'); }

function taipeiParts(d: Date) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, day: t.getUTCDate(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}
function taipeiDateStr(d: Date) { const p = taipeiParts(d); return `${p.y}-${pad(p.mo)}-${pad(p.day)}`; }
function fmtDate(d: Date) { const p = taipeiParts(d); return `${p.y}/${pad(p.mo)}/${pad(p.day)}`; }
/** delivery_date 存的是純日期字串（無時間、無時區），直接字串換分隔符號就好，不用經過 Date */
function fmtDateStr(s: string) { return String(s || '').replace(/-/g, '/'); }
function fmtDateTime(d: Date) { const p = taipeiParts(d); return `${p.mo}/${p.day} ${pad(p.h)}:${pad(p.mi)}`; }
function fmtStamp(d: Date) { const p = taipeiParts(d); return `${p.y}/${pad(p.mo)}/${pad(p.day)} ${pad(p.h)}:${pad(p.mi)}:${pad(0)}`; }

function parseTaipei(s?: string | null): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const hh = m[4] ?? '00', mi = m[5] ?? '00';
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${hh}:${mi}:00+08:00`);
  return isNaN(d.getTime()) ? null : d;
}

function genSessionId() {
  const p = taipeiParts(new Date());
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase();
  return `${p.y}${pad(p.mo)}${pad(p.day)}-${rand}`;
}
function genToken() { return crypto.randomUUID().replace(/-/g, ''); }
function genOrderCode() { return crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase(); }

/* ============ 設定 / 菜單 讀取 ============ */

async function getSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  (data || []).forEach((r: any) => { map[r.key] = r.value; });
  return map;
}

function mapMenuRow(r: any) {
  return {
    code: r.code, name: r.name, category: r.category,
    priceM: r.price_m === null ? null : Number(r.price_m),
    priceL: r.price_l === null ? null : Number(r.price_l),
    opt1Name: r.opt1_name, opt1Choices: r.opt1_choices || [], opt1Required: r.opt1_required,
    opt2Name: r.opt2_name, opt2Choices: r.opt2_choices || [], opt2Required: r.opt2_required,
    note: r.note, imageUrl: r.image_url,
  };
}

async function getMenu() {
  const { data, error } = await supabase.from('menu_items').select('*').eq('available', true).order('sort_order');
  if (error) throw new Error(error.message);
  return (data || []).map(mapMenuRow);
}

/* ============ 揪團 / 訂單 讀取 ============ */

function mapSessionRow(r: any) {
  return {
    id: r.id, organizer: r.organizer, organizerEmail: r.organizer_email, createdAt: r.created_at,
    deadline: r.deadline, fulfillment: r.fulfillment, deliveryDate: r.delivery_date, deliveryTime: r.delivery_time,
    address: r.address, needUtensils: r.need_utensils, company: r.company, taxId: r.tax_id,
    contactName: r.contact_name, contactPhone: r.contact_phone, contactAvailableTime: r.contact_available_time,
    typhoonCancel: r.typhoon_cancel, note: r.note, status: r.status, token: r.token,
    /* 「已完成」原本是主揪、店家共用同一個 status 值，誰先標記就把另一邊
       的畫面也改掉，語意搞混。拆成兩個各自獨立的旗標：vendorDone 是店家
       自己在準備/出餐上的進度，organizerClosed 是主揪自己有沒有結案、
       要不要讓這團從首頁「你開過的團」消失，兩邊互不影響。 */
    vendorDone: !!r.vendor_done, organizerClosed: !!r.organizer_closed,
    /* 主揪按下送單的時間，店家後台排序用（依送單時間 vs 依送餐時間）。
       收單中的團還沒送單，這欄是 null。 */
    finalizedAt: r.finalized_at,
  };
}

async function findSession(sessionId?: string | null) {
  if (!sessionId) return null;
  const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSessionRow(data) : null;
}

function mapOrderRow(r: any) {
  return {
    timestamp: r.created_at, sessionId: r.session_id, orderCode: r.order_code, name: r.name,
    itemCode: r.item_code, itemName: r.item_name, size: r.size, opt1: r.opt1, opt2: r.opt2,
    qty: r.qty, note: r.note, price: Number(r.price), subtotal: Number(r.subtotal), status: r.status,
    notifyEmail: r.notify_email || '',
  };
}

async function getOrdersForSession(sessionId: string, includeCancelled = false) {
  let q = supabase.from('orders').select('*').eq('session_id', sessionId);
  if (!includeCancelled) q = q.neq('status', '已取消');
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(mapOrderRow);
}

async function getOrderByCode(sessionId: string, orderCode: string) {
  const rows = await getOrdersForSession(sessionId, false);
  return rows.filter((o: any) => o.orderCode === orderCode);
}

/* ============ 寄信（Gmail SMTP，帳號密碼放在 settings 表） ============
   原本用 denomailer 組信，結果組出來的 MIME 結構壞掉——收件人看到的
   不是正常的信件內容，而是整段沒被解析的原始 MIME 原始碼（Content-Type、
   boundary 這些本來該是信件標頭的東西，整包被當成內文文字塞進信裡）。
   2026-09-14 換成 nodemailer（Node 生態圈最成熟、最多人在用的寄信套件，
   MIME 組信這塊踩過的坑早就被修完了），透過 Deno 的 npm: 相容層引入，
   跟這支檔案已經在用的 npm:web-push 是同一套做法。 */

async function sendEmail(settings: Record<string, string>, to: string, subject: string, body: string) {
  const gmailUser = (settings['寄件人Email'] || '').trim();
  const gmailPass = (settings['寄信Gmail應用程式密碼'] || '').trim();
  if (!gmailUser || !gmailPass) {
    console.log('[email 略過：尚未在設定填「寄件人Email」或「寄信Gmail應用程式密碼」]', to, subject);
    return false;
  }
  const fromName = (settings['寄件人名稱'] || '').trim();
  const from = fromName ? `${fromName} <${gmailUser}>` : gmailUser;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });
  try {
    await transporter.sendMail({
      from,
      to: to.split(',').map((s: string) => s.trim()).filter(Boolean).join(', '),
      subject,
      text: body,
    });
  } catch (err) {
    throw new Error('寄信失敗：' + (err instanceof Error ? err.message : String(err)));
  } finally {
    transporter.close();
  }
  return true;
}

/* ============ 建立揪團 ============ */

async function createSession(p: any) {
  if (!p.organizer) throw new Error('請填寫主揪姓名');
  if (!p.organizerEmail || String(p.organizerEmail).indexOf('@') < 0) {
    throw new Error('請填寫主揪 Email，管理連結會寄一份到這個信箱，之後才找得回來');
  }
  if (!p.contactName || !p.contactPhone) throw new Error('請填寫聯絡窗口姓名與電話');
  if (p.fulfillment === '外送' && !p.address) throw new Error('外送需要填寫外送地址');

  const deliveryDate = parseTaipei(p.deliveryDate);
  if (!deliveryDate) throw new Error('請填寫正確的預訂日期');

  const todayStr = taipeiDateStr(new Date());
  const deliveryDateStr = taipeiDateStr(deliveryDate);
  if (deliveryDateStr <= todayStr) throw new Error('預訂日期最早只能選明天，不能選今天或更早的日期');

  const deadline = parseTaipei(p.deadline);
  if (!deadline) throw new Error('請填寫正確的收單截止時間');
  if (deadline.getTime() <= Date.now()) throw new Error('收單截止時間必須晚於現在');

  const maxDeadline = new Date(deliveryDate.getTime() - 24 * 3600 * 1000 + 15 * 3600 * 1000);
  if (deadline.getTime() > maxDeadline.getTime()) {
    throw new Error('收單截止時間不能晚於預訂日期前一天的 15:00（店家規定最晚前一日 15:00 前下單）');
  }

  const id = genSessionId();
  const token = genToken();

  const { error } = await supabase.from('sessions').insert({
    id, organizer: p.organizer, organizer_email: p.organizerEmail || '',
    deadline: deadline.toISOString(), fulfillment: p.fulfillment,
    delivery_date: deliveryDateStr, delivery_time: p.deliveryTime || '', address: p.address || '',
    need_utensils: p.needUtensils || '', company: p.company || '', tax_id: p.taxId || '',
    contact_name: p.contactName, contact_phone: p.contactPhone,
    contact_available_time: p.contactAvailableTime || '', typhoon_cancel: p.typhoonCancel || '',
    note: p.note || '', status: '收單中', token,
  });
  if (error) throw new Error(error.message);

  let mailed = false;
  try { mailed = await sendOrganizerLinks(id, token, p); } catch (err) { console.log('寄送管理連結失敗：', err); }

  return { ok: true, sessionId: id, adminToken: token, mailed };
}

async function sendOrganizerLinks(id: string, token: string, p: any) {
  const settings = await getSettings();
  let base = String(settings['前端網址'] || '').trim();
  if (base.indexOf('http') !== 0) base = String(p.baseUrl || '').trim();
  if (base.indexOf('http') !== 0) return false;
  if (base.slice(-1) !== '/') base += '/';

  const orderUrl = base + 'order.html?session=' + encodeURIComponent(id);
  const adminUrl = base + 'admin.html?session=' + encodeURIComponent(id) + '&admin=' + encodeURIComponent(token);
  const deadline = parseTaipei(p.deadline)!;

  const lines = [
    p.organizer + ' 你好，你的團開好了。', '',
    '這封信請留著，之後要收團、送單都靠它。', '',
    '── 分享給同事的點餐連結 ──', orderUrl, '',
    '── 你的管理連結（請勿外流） ──', adminUrl,
    '只有這個連結能看到全部訂單、按下送單。', '',
    '── 這次的團 ──',
    '公司：' + (p.company || '（未填）'),
    '取餐方式：' + p.fulfillment,
    '預訂日期：' + fmtDateStr(p.deliveryDate) + ' ' + (p.deliveryTime || ''),
    '收單截止：' + fmtDateTime(deadline), '',
    '截止時間一到，同事就不能再點餐或修改，記得回管理連結按送單。',
  ];
  return await sendEmail(settings, p.organizerEmail, '【嗷嗷團購】' + (p.company || p.organizer) + ' 的管理連結（' + fmtDateStr(p.deliveryDate) + '）', lines.join('\n'));
}

/* ============ 送出／修改／取消訂單 ============ */

async function submitOrderCore(p: any, forcedOrderCode?: string, actionLabel?: string) {
  const session = await findSession(p.sessionId);
  if (!session) throw new Error('找不到這個揪團，連結可能有誤');
  if (session.status !== '收單中') throw new Error('這個揪團已經截止收單了');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');
  if (!p.name) throw new Error('請填寫姓名');
  if (!p.items || !p.items.length) throw new Error('購物車是空的');

  const menu = await getMenu();
  const menuMap: Record<string, any> = {};
  menu.forEach((m: any) => { menuMap[m.code] = m; });

  const rows: any[] = [];
  const lineObjs: any[] = [];
  const orderCode = forcedOrderCode || genOrderCode();
  const notifyEmail = String(p.notifyEmail || '').trim();

  for (const item of p.items) {
    const m = menuMap[item.code];
    if (!m) throw new Error('品項不存在或已下架：' + item.code);
    const qty = Number(item.qty) || 0;
    if (qty <= 0) continue;
    if (m.opt1Required && !item.opt1) throw new Error(m.name + ' 需要選擇「' + m.opt1Name + '」');
    if (m.opt2Required && !item.opt2) throw new Error(m.name + ' 需要選擇「' + m.opt2Name + '」');
    const size = item.size || '';
    let price = m.priceM;
    if (size === 'L' && m.priceL) price = m.priceL;
    price = Number(price) || 0;
    rows.push({
      session_id: session.id, order_code: orderCode, name: p.name,
      item_code: m.code, item_name: m.name, size,
      opt1: item.opt1 || '', opt2: item.opt2 || '', qty, note: item.note || '',
      price, subtotal: price * qty, status: '正常', notify_email: notifyEmail,
    });
    lineObjs.push({ itemName: m.name, size, opt1: item.opt1 || '', opt2: item.opt2 || '', qty, note: item.note || '', subtotal: price * qty });
  }
  if (!rows.length) throw new Error('沒有有效的品項，請確認數量');

  const { error } = await supabase.from('orders').insert(rows);
  if (error) throw new Error(error.message);

  if (notifyEmail && notifyEmail.indexOf('@') > -1) {
    try { await sendOrderConfirmation(session, p.name, lineObjs, orderCode, notifyEmail, actionLabel || '送出', p); }
    catch (err) { console.log('寄送訂單確認信失敗：', err); }
  }
  return { ok: true, orderCode };
}

async function updateOrder(p: any) {
  const session = await findSession(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.status !== '收單中') throw new Error('已經截止收單，無法修改');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');
  if (!p.orderCode) throw new Error('缺少訂單編號');

  /* 原本是「先刪舊的、再寫新的」，如果新的寫失敗（例如訂單裡有品項
     這期間被店家下架、或單純網路斷一下），舊訂單已經被刪掉、新的
     又沒寫進去，整筆訂單就憑空消失了——這是真的會發生的資料遺失，
     不是理論風險。改成先記住舊資料列的 id，等新的確定寫成功了，
     再用 id 精準刪掉舊的（不是照 order_code 刪，不然會連剛寫進去的
     新資料一起刪掉）。萬一刪舊的這步失敗，最壞情況是舊資料多留了
     一份沒清掉，而不是憑空消失，風險方向完全不同。 */
  const { data: oldRows, error: oldErr } = await supabase.from('orders')
    .select('id').eq('session_id', session.id).eq('order_code', p.orderCode);
  if (oldErr) throw new Error(oldErr.message);
  const oldIds = (oldRows || []).map((r: any) => r.id);

  const result = await submitOrderCore(p, p.orderCode, '更新');

  if (oldIds.length) {
    const { error: delErr } = await supabase.from('orders').delete().in('id', oldIds);
    if (delErr) throw new Error(delErr.message);
  }
  return { ok: true, orderCode: result.orderCode, message: '訂單已更新' };
}

async function cancelOrder(p: any) {
  const session = await findSession(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.status !== '收單中') throw new Error('已經截止收單，無法取消');
  if (Date.now() >= new Date(session.deadline).getTime()) throw new Error('已經超過收單截止時間了');

  const existing = await getOrderByCode(session.id, p.orderCode);
  const removed = await removeOrderRows(session.id, p.orderCode, true);
  if (!removed) throw new Error('找不到這筆訂單');

  const notifyEmail = existing.length ? existing[0].notifyEmail : '';
  if (notifyEmail && notifyEmail.indexOf('@') > -1) {
    const lineObjs = existing.map((o: any) => ({ itemName: o.itemName, size: o.size, opt1: o.opt1, opt2: o.opt2, qty: o.qty, note: o.note, subtotal: o.subtotal }));
    try { await sendOrderConfirmation(session, existing[0].name, lineObjs, p.orderCode, notifyEmail, '取消', p); }
    catch (err) { console.log('寄送取消確認信失敗：', err); }
  }
  return { ok: true, message: '訂單已取消' };
}

async function removeOrderRows(sessionId: string, orderCode: string, markCancelled: boolean) {
  if (markCancelled) {
    const { data, error } = await supabase.from('orders').update({ status: '已取消' })
      .eq('session_id', sessionId).eq('order_code', orderCode).select('id');
    if (error) throw new Error(error.message);
    return (data || []).length > 0;
  }
  const { data, error } = await supabase.from('orders').delete()
    .eq('session_id', sessionId).eq('order_code', orderCode).select('id');
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}

async function sendOrderConfirmation(session: any, name: string, lineObjs: any[], orderCode: string, notifyEmail: string, actionLabel: string, p: any) {
  const settings = await getSettings();
  const sentAt = fmtStamp(new Date());
  const lines: string[] = [];
  lines.push('這是你在「' + session.organizer + '」揪的團裡，訂單' + actionLabel + '的明細。');
  lines.push('寄送時間：' + sentAt);
  lines.push('（如果同一筆訂單收到不只一封，時間最新的這封才是目前正確的版本。）');
  lines.push('');
  lines.push('揪團：' + session.organizer + '　預訂日期：' + fmtDateStr(session.deliveryDate));
  lines.push('訂購人：' + name);
  lines.push('');
  lines.push(actionLabel === '取消' ? '── 取消前的內容（僅供留存） ──' : '── 目前的訂購內容 ──');
  let total = 0;
  lineObjs.forEach((l) => {
    const specs = [l.size, l.opt1, l.opt2].filter(Boolean).join('／');
    lines.push('・' + l.itemName + (specs ? '（' + specs + '）' : '') + ' x ' + l.qty + '　$' + l.subtotal + (l.note ? '　備註：' + l.note : ''));
    total += Number(l.subtotal) || 0;
  });
  lines.push('');
  lines.push('小計：$' + total);
  if (actionLabel !== '取消') {
    let base = String(settings['前端網址'] || '').trim();
    if (base.indexOf('http') !== 0) base = String(p?.baseUrl || '').trim();
    if (base.indexOf('http') === 0) {
      if (base.slice(-1) !== '/') base += '/';
      lines.push('');
      lines.push('截止前想改或想取消，用這個連結：');
      lines.push(base + 'order.html?session=' + encodeURIComponent(session.id) + '&edit=' + encodeURIComponent(orderCode));
    }
  }
  await sendEmail(settings, notifyEmail, '【嗷嗷團購】你的訂單' + actionLabel + '確認（' + sentAt + '）', lines.join('\n'));
}

/* ============ 送單／通知（主揪按送單） ============ */

async function finalizeSession(p: any) {
  const session = await findSession(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.token !== p.token) throw new Error('管理權杖不正確，無法送單');
  if (session.status !== '收單中') throw new Error('這個揪團已經送過單或已經完成了');

  const orders = await getOrdersForSession(session.id, false);
  if (!orders.length) throw new Error('目前還沒有任何訂單，無法送單');

  const { error } = await supabase.from('sessions')
    .update({ status: '已送單', finalized_at: new Date().toISOString() }).eq('id', session.id);
  if (error) throw new Error(error.message);

  const settings = await getSettings();
  const emailBody = buildOrderEmail(session, orders, settings);
  let recipients = [String(settings['店家收單Email'] || ''), String(settings['副本收單Email'] || '')].filter((v) => v && v.indexOf('@') > -1);
  if (session.organizerEmail && session.organizerEmail.indexOf('@') > -1) recipients.push(session.organizerEmail);
  recipients = recipients.filter((v, i) => recipients.indexOf(v) === i);

  let mailed = false;
  if (recipients.length) {
    try {
      mailed = await sendEmail(settings, recipients.join(','), '【團購訂單】' + (session.company || session.organizer) + '｜' + fmtDateStr(session.deliveryDate) + '｜' + session.fulfillment, emailBody);
    } catch (err) { console.log('送單通知寄送失敗：', err); }
  }

  /* 送單這一刻就是這團在店家後台「待處理訂單」裡冒出來的時間點，
     順手推播一下。推播失敗（沒設定 VAPID 金鑰、店家還沒訂閱過…）
     不能讓送單本身失敗，包一層 try/catch。 */
  try {
    const total = orders.reduce((s, o) => s + (Number(o.subtotal) || 0), 0);
    await sendPushToVendors(settings, {
      title: '📬 有新訂單送來了',
      body: (session.company || session.organizer) + '｜' + fmtDateStr(session.deliveryDate) + '　共 $' + total,
      url: 'vendor.html',
    });
  } catch (err) { console.log('店家後台推播失敗：', err); }

  return {
    ok: true,
    message: !recipients.length
      ? '已送單，但沒有設定收件信箱，請到「設定」補上店家收單Email'
      : (mailed ? '已送單並寄出通知信' : '已送單，但目前尚未設定寄信服務，請到「設定」補上「寄信Gmail應用程式密碼」'),
    recipients,
  };
}

function buildOrderEmail(session: any, orders: any[], settings: Record<string, string>) {
  const lines: string[] = [];
  lines.push('【嗷嗷早午餐｜辦公室團購訂單】');
  lines.push('揪團編號：' + session.id);
  lines.push('主揪：' + session.organizer);
  lines.push('');
  lines.push('── 訂購資訊 ──');
  lines.push('取餐方式：' + session.fulfillment);
  lines.push('預訂日期：' + fmtDateStr(session.deliveryDate));
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
  const byPerson: Record<string, any[]> = {};
  orders.forEach((o) => { (byPerson[o.name] = byPerson[o.name] || []).push(o); total += Number(o.subtotal) || 0; });
  Object.keys(byPerson).forEach((name) => {
    lines.push(name + '：');
    byPerson[name].forEach((o) => {
      const specs = [o.size, o.opt1, o.opt2].filter(Boolean).join('／');
      lines.push('　・' + o.itemName + (specs ? '（' + specs + '）' : '') + ' x ' + o.qty + '　$' + o.subtotal + (o.note ? '　備註：' + o.note : ''));
    });
  });
  lines.push('');
  lines.push('── 品項彙總（方便店家備餐） ──');
  const byItem: Record<string, number> = {};
  orders.forEach((o) => {
    const key = o.itemName + '｜' + [o.size, o.opt1, o.opt2].filter(Boolean).join('／');
    byItem[key] = (byItem[key] || 0) + Number(o.qty);
  });
  Object.keys(byItem).forEach((key) => lines.push('・' + key + '　共 ' + byItem[key] + ' 份'));
  lines.push('');
  lines.push('訂單總金額：$' + total);
  const minOrder = Number(settings['低消金額'] || 0);
  if (session.fulfillment === '外送' && minOrder && total < minOrder) {
    lines.push('⚠️ 尚未達到外送低消 $' + minOrder + '，請確認是否需要加點或改為自取。');
  }
  return lines.join('\n');
}

/** 主揪自己結案：跟店家端的 vendor_done 是各自獨立的旗標，主揪結算完
 *  （例如跟同事收完錢）就可以標記，不需要等店家也標記過。標記後這團
 *  就不會再出現在首頁「你開過的團」列表。 */
async function completeSession(p: any) {
  const session = await findSession(p.sessionId);
  if (!session) throw new Error('找不到這個揪團');
  if (session.token !== p.token) throw new Error('管理權杖不正確，無法標記完成');
  if (session.status !== '已送單') throw new Error('要先送單才能標記完成');
  const { error } = await supabase.from('sessions').update({ organizer_closed: true }).eq('id', session.id);
  if (error) throw new Error(error.message);
  return { ok: true, message: '已標記為完成' };
}

/* ============ 店家後台（不用主揪的權杖，用單一共用密碼） ============
   密碼放在 settings 表的「店家後台密碼」，要換密碼直接在 Supabase
   後台的 Table Editor 改，不用重新部署程式碼。 */

async function checkVendorPassword(password: string, settings?: Record<string, string>) {
  const s = settings || (await getSettings());
  const real = s['店家後台密碼'] || '';
  if (!real || password !== real) throw new Error('密碼不正確');
}

/* ============ 店家後台：新訂單瀏覽器推播（Web Push） ============
   VAPID 金鑰放在 settings 表（網頁推播VAPID公鑰／網頁推播VAPID私鑰），
   跟寄信帳密、店家後台密碼同一套習慣——這把金鑰不是密碼，是這支後端
   的身分憑證，用來跟瀏覽器的推播服務（Google/Mozilla/Apple 的伺服器）
   證明「這則推播真的是這個網站發的」。公鑰會回給前端去訂閱，私鑰只
   留在後端簽章用，不會外流。

   訂閱資訊（哪些瀏覽器/裝置要收推播）存在 push_subscriptions 表，
   一列一個裝置，用 endpoint（瀏覽器推播服務給的專屬網址）當主鍵。 */

async function vendorSubscribePush(p: any) {
  await checkVendorPassword(String(p.password || ''));
  const sub = p.subscription || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new Error('推播訂閱資訊不完整');
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    { onConflict: 'endpoint' },
  );
  if (error) throw new Error(error.message);
  return { ok: true, message: '這台裝置已經開啟新訂單通知' };
}

async function vendorUnsubscribePush(p: any) {
  await checkVendorPassword(String(p.password || ''));
  if (!p.endpoint) throw new Error('缺少要取消的訂閱');
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', p.endpoint);
  if (error) throw new Error(error.message);
  return { ok: true, message: '已關閉這台裝置的新訂單通知' };
}

/** 送單那一刻推播給「所有」訂閱過的裝置（可能不只一支手機）。VAPID
 *  金鑰沒設定、或根本沒有人訂閱過，就安靜跳過，不影響送單本身。
 *  推播端點失效（使用者清過瀏覽器資料、解除授權…）會收到 404/410，
 *  順手把那筆訂閱刪掉，下次就不會再白跑一次。 */
async function sendPushToVendors(settings: Record<string, string>, payload: { title: string; body: string; url?: string }) {
  const publicKey = settings['網頁推播VAPID公鑰'] || '';
  const privateKey = settings['網頁推播VAPID私鑰'] || '';
  if (!publicKey || !privateKey) return;

  const { data, error } = await supabase.from('push_subscriptions').select('*');
  if (error) { console.log('讀取推播訂閱失敗：', error.message); return; }
  const subs = data || [];
  if (!subs.length) return;

  webpush.setVapidDetails(settings['前端網址'] || 'mailto:admin@example.com', publicKey, privateKey);
  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (s: any) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (err: any) {
      const code = err && (err.statusCode || err.status);
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else {
        console.log('推播失敗：', s.endpoint, err && err.message);
      }
    }
  }));
}

async function vendorLogin(p: any) {
  const settings = await getSettings();
  await checkVendorPassword(String(p.password || ''), settings);
  /* 公鑰不是密碼，給前端拿去訂閱推播用；沒設定的話就回空字串，
     前端看到空字串就知道還沒開放這功能，不會硬要訂閱。 */
  return { ok: true, vapidPublicKey: settings['網頁推播VAPID公鑰'] || '' };
}

/** 依日期區間（可省略＝不限日期）＋店家自己的完成狀態列出揪團，每團的
 *  訂單依品項彙總（不含跟團者姓名）。店家後台只在乎「已經送單過」的團
 *  （status='已送單'，收單中的團跟店家無關，一律不列），vendorDone 才是
 *  店家自己勾的進度——p.vendorDone 不給就是全部都要（「待處理」頁固定
 *  傳 false，「依日期查詢」頁日期＋完成與否都可以自己選）。 */
async function vendorOrders(p: any) {
  await checkVendorPassword(String(p.password || ''));
  const from = p.dateFrom || '1900-01-01';
  const to = p.dateTo || '2999-12-31';

  /* 排序方式：依「送餐時間」（delivery_date，預訂日期，也就是店家實際
     把餐點送到訂購者手上的時間）或依「送單時間」（finalized_at，主揪
     按下送單、把這團交給店家處理的時間）。預設送餐時間，兩種都是
     越早排越上面。 */
  const sortCol = p.sortBy === 'finalizedAt' ? 'finalized_at' : 'delivery_date';
  let q = supabase.from('sessions').select('*')
    .eq('status', '已送單')
    .gte('delivery_date', from)
    .lte('delivery_date', to)
    .order(sortCol, { ascending: true });
  if (p.vendorDone === true) q = q.eq('vendor_done', true);
  else if (p.vendorDone === false) q = q.eq('vendor_done', false);

  const { data: sessionsData, error: sErr } = await q;
  if (sErr) throw new Error(sErr.message);

  const sessions = (sessionsData || []).map(mapSessionRow);
  const out: any[] = [];
  for (const s of sessions) {
    const orders = await getOrdersForSession(s.id, false);
    /* 備註也算進分組鍵——同一品項規格但備註不同（少冰／不要蔥）代表
       出餐做法不一樣，不能合併成一行，不然備註會被蓋掉不見。 */
    const byKey: Record<string, any> = {};
    let total = 0;
    orders.forEach((o: any) => {
      const key = [o.itemName, o.size, o.opt1, o.opt2, o.note || ''].join('｜');
      if (!byKey[key]) byKey[key] = { itemName: o.itemName, size: o.size, opt1: o.opt1, opt2: o.opt2, note: o.note || '', qty: 0, subtotal: 0 };
      byKey[key].qty += Number(o.qty);
      byKey[key].subtotal += Number(o.subtotal);
      total += Number(o.subtotal);
    });
    out.push({
      id: s.id, company: s.company, organizer: s.organizer,
      deliveryDate: s.deliveryDate, deliveryTime: s.deliveryTime, fulfillment: s.fulfillment,
      address: s.address, vendorDone: s.vendorDone, finalizedAt: s.finalizedAt,
      /* 店家需要的訂購資訊：統編（開發票）、聯絡窗口姓名/電話/方便接聽
         時間（外送前致電確認要用）、要不要附餐具、主揪 Email、颱風假
         是否取消——都不含跟團者姓名，這些是主揪自己填的、整團共用的
         資料，不是個別同事的資訊。 */
      taxId: s.taxId, contactName: s.contactName, contactPhone: s.contactPhone,
      contactAvailableTime: s.contactAvailableTime, needUtensils: s.needUtensils,
      organizerEmail: s.organizerEmail, typhoonCancel: s.typhoonCancel,
      items: Object.values(byKey), total,
    });
  }
  return { ok: true, sessions: out };
}

/** 店家自己標記出餐/處理完成：只動 vendor_done，不影響主揪端的 organizer_closed。 */
async function vendorComplete(p: any) {
  await checkVendorPassword(String(p.password || ''));
  const { data, error: findErr } = await supabase.from('sessions').select('status').eq('id', p.sessionId).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!data) throw new Error('找不到這個揪團');
  if (data.status !== '已送單') throw new Error('要先送單才能標記完成');
  const { error } = await supabase.from('sessions').update({ vendor_done: true }).eq('id', p.sessionId);
  if (error) throw new Error(error.message);
  return { ok: true, message: '已標記為完成' };
}

/* ============ 主 Router ============ */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      const action = url.searchParams.get('action');
      const p = Object.fromEntries(url.searchParams.entries());
      switch (action) {
        case 'getMenu': {
          const [menu, settings] = await Promise.all([getMenu(), getSettings()]);
          return json({ ok: true, menu, settings });
        }
        case 'getOrderPageData': {
          const session = await findSession(p.session);
          const [menu, settings] = await Promise.all([getMenu(), getSettings()]);
          const existingOrder = session && p.edit ? await getOrderByCode(p.session, p.edit) : [];
          return json({ ok: true, session, menu, settings, existingOrder });
        }
        case 'getAdminData': {
          const session = await findSession(p.session);
          if (!session || session.token !== p.token) throw new Error('連結無效，或管理權杖不正確');
          const [orders, settings] = await Promise.all([getOrdersForSession(p.session, false), getSettings()]);
          return json({ ok: true, session, orders, settings });
        }
        default:
          return json({ ok: false, error: '未知的操作：' + action });
      }
    }

    if (req.method === 'POST') {
      let payload: any = {};
      try { payload = await req.json(); } catch { throw new Error('請求格式錯誤'); }
      switch (payload.action) {
        case 'createSession': return json(await createSession(payload));
        case 'submitOrder': return json(await submitOrderCore(payload));
        case 'updateOrder': return json(await updateOrder(payload));
        case 'cancelOrder': return json(await cancelOrder(payload));
        case 'finalizeSession': return json(await finalizeSession(payload));
        case 'completeSession': return json(await completeSession(payload));
        case 'vendorLogin': return json(await vendorLogin(payload));
        case 'vendorOrders': return json(await vendorOrders(payload));
        case 'vendorComplete': return json(await vendorComplete(payload));
        case 'vendorSubscribePush': return json(await vendorSubscribePush(payload));
        case 'vendorUnsubscribePush': return json(await vendorUnsubscribePush(payload));
        default: return json({ ok: false, error: '未知的操作：' + payload.action });
      }
    }

    return json({ ok: false, error: '不支援的方法' }, 405);
  } catch (err) {
    return fail(err);
  }
});
