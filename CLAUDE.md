# CLAUDE.md

給 Claude Code 的專案脈絡。使用者是台灣人，**請用繁體中文溝通**，程式碼註解也用繁體中文。

**先讀 [SPEC.md](SPEC.md)**：菜單與價格出處、店家的營業規則、資料模型、當初為什麼這樣選、哪些設定是推斷而非確認的，都在那裡。

## 這是什麼

嗷嗷早午餐的辦公室團購點餐系統。主揪開一個團 → 把連結貼到辦公室群組 → 同事各自點餐 → 截止後主揪按「送單」，系統寄一封彙整好的訂單信給店家。

全部跑在免費服務上：**GitHub Pages（前端）+ Google Apps Script & Google 試算表（後端與資料）**。使用者是產品經理，不是工程師，所以「不用碰程式碼就能改菜單」是刻意的設計目標。

## 架構

```
docs/            ← GitHub Pages 指向這裡（純靜態，無 build、無套件）
  index.html     發起揪團（主揪）
  order.html     點餐 / 改單 / 取消（全辦公室）
  admin.html     看訂單 / 送單（主揪）
  style.css      設計系統：色彩 token、元件、深色模式、RWD
  api.js         apiGet / apiPost，包住 fetch
  ui.js          共用元件與 localStorage 工具
  config.js      ★ 使用者要自己填 Apps Script 的 /exec 網址
apps-script/
  Code.gs        整個後端：JSON API、試算表讀寫、寄信、一次性初始化
tools/           開發用，不會部署
  mock-server.js 本機假後端 + 靜態站台
  test-*.js      Playwright 端對端測試
```

前端不直接碰試算表，一律透過 Apps Script 的 JSON API。試算表有四張工作表：**菜單 / 訂單 / 揪團 / 設定**，由 `setupSheet()` 一次建好。

## 本機怎麼跑

```bash
node tools/mock-server.js          # http://localhost:8899
node tools/test-flow.js            # 完整流程：建團 → 點餐 → 改單 → 送單 → 鎖定
node tools/test-draft.js           # 購物車草稿、送出後重開、管理頁手動更新
node tools/test-recover.js         # 主揪找回管理頁、寄信、換裝置
```

假後端把 `Code.gs` 的 API 行為用 Node 重寫一遍，資料只放記憶體。**改了 `Code.gs` 的 API 行為，`tools/mock-server.js` 要一起改**，否則測試測到的是舊行為。測試之間會共用同一個 mock 實例，跑多組時先重開 server。

沒裝 Playwright 瀏覽器的話用 `CHROME_PATH=/path/to/chrome node tools/test-flow.js`。

## 動程式碼前要知道的事

**金額一律由後端算。** `submitOrder_()` 會重新從「菜單」工作表查單價再乘數量，前端傳來的 price 只用來顯示。不要為了省事改成信任前端。

**時間全部用 epoch 毫秒手算台北時間。** 見 `parseTaipeiDateTime_()`。Apps Script 的 `new Date('2026-09-12T15:00')` 會依腳本時區解讀，不可靠，所以刻意繞開。顯示一律 `Utilities.formatDate(d, 'Asia/Taipei', ...)`，前端則是 `toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })`。**不要改回依賴環境預設時區的寫法。**

**POST 一定要用 `Content-Type: text/plain`。** Apps Script 不會正確回應 CORS 預檢（OPTIONS），改成 `application/json` 會讓跨網域請求直接失敗。後端照樣 `JSON.parse(e.postData.contents)`。細節寫在 `docs/api.js` 開頭。

**收單截止時間有硬規則。** 店家最晚只收到「預訂日期前一天 15:00」，`createSession_()` 會擋下更晚的設定。截止後同事不能新增或修改，`submitOrder_` / `updateOrder_` / `cancelOrder_` 都會再驗一次，不能只靠前端擋。

**通知只在送單時寄。** 不要改成每筆訂單都發信，會洗版店家信箱。建團時另外寄一封管理連結給主揪，那是找回連結的命脈。

**菜單、店家規定、颱風假文字都在試算表。** 要加品項或改價格是改試算表，不是改程式碼。`規格1/規格2` 是通用的客製化欄位（醬料、冰量、甜度、口味都共用同一套邏輯），選項用半形逗號分隔。

## 寫碼慣例

- 原生 JavaScript，**不要引入框架或建置工具**。使用者要能直接在 GitHub 網頁上編輯檔案。
- 前端用 `function` 宣告和 `var`/`const`，避免太新的語法（同事的手機可能不新）。
- UI 字串、註解、commit message 都用繁體中文，語氣口語一點（「你點的東西」而不是「訂單明細」）。
- 顏色一律用 `style.css` 最上面的 CSS 變數，不要寫死色碼。深色模式靠同一組 token 切換。
- 手機優先。斷點在 600px（平板）和 900px（桌機雙欄）。手機用底部浮動列，桌機用側欄，兩邊的按鈕透過 `data-submit` / `data-finalize` 共用狀態。
- 使用者輸入進 DOM 前一律 `escapeHtml()`。

## 已知限制（不是 bug，是取捨）

完整的決策紀錄與待確認事項見 [SPEC.md](SPEC.md) 第 8、9 節。

- 改訂單的連結只靠 8 碼隨機訂單編號保護，適合辦公室訂午餐的信任程度。
- 管理頁是輪詢（20 秒）而非推播，Apps Script 沒有 WebSocket。
- localStorage 只在單一裝置有效，換裝置靠信件。
- **跨網域這件事沒有在真實環境驗證過**：所有測試都對本機假後端跑，Google 的 CORS 與 302 轉址行為沒被涵蓋。第一次真的部署時要特別看 Console。

## 部署的兩個地雷

改完 `Code.gs` 之後，Apps Script 要「部署 → 管理部署作業 → 編輯 → 版本選**新版本**」，否則 `/exec` 還是跑舊程式碼。前端則是 push 上 GitHub 就會自動更新。
