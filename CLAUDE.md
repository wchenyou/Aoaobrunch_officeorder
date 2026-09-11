# CLAUDE.md

給 Claude Code 的專案脈絡。使用者是台灣人，**請用繁體中文溝通**，程式碼註解也用繁體中文。

**先讀 [SPEC.md](SPEC.md)**：菜單與價格出處、店家的營業規則、資料模型、當初為什麼這樣選、哪些設定是推斷而非確認的，都在那裡。

## 這是什麼

嗷嗷早午餐的辦公室團購點餐系統。主揪開一個團 → 把連結貼到辦公室群組 → 同事各自點餐 → 截止後主揪按「送單」，系統寄一封彙整好的訂單信給店家。店家自己還有一個後台（`vendor.html`）可以看收到的訂單、標記出餐完成、匯出一段期間的資料。

**2026-09-11 搬過一次家**：後端原本是 Google Apps Script + Google 試算表，現在換成 **Supabase（Postgres + Edge Function）**。原因是 Apps Script Web App 的 302 轉址 + 冷啟動讓每次送出訂單都要等好幾秒，換掉之後這個問題直接消失。`apps-script/Code.gs` 跟 `tools/mock-server.js` 還留在 repo 裡當備份／歷史紀錄，**已經不是線上在跑的東西**，不要再改它們當作修正正式環境的手段。

## 架構

```
docs/                  ← GitHub Pages 指向這裡（純靜態，無 build、無套件）
  index.html           發起揪團（主揪）
  order.html           點餐 / 改單 / 取消（全辦公室）
  admin.html           看訂單 / 送單 / 標記完成（主揪）
  vendor.html          店家後台：依日期查訂單（品項彙總、不含姓名）、標記完成、匯出 CSV
  style.css            設計系統：色彩 token、元件、深色模式、RWD
  api.js               apiGet / apiPost，包住 fetch，會帶 Supabase 的 apikey 表頭
  ui.js                共用元件與 localStorage 工具
  config.js            ★ Supabase Edge Function 的網址 + 公開金鑰（anon/publishable key）
  images/menu/          菜單相片
supabase/
  functions/api/index.ts   整個後端：JSON API、Postgres 讀寫、寄信、店家後台邏輯（Deno）
apps-script/            舊版後端，已停用，留著當參考
  Code.gs
tools/                  開發用，不會部署
  mock-server.js        舊版（模擬 Apps Script）的本機假後端，現在多半用不到了
  test-*.js             Playwright 端對端測試——大部分測試改成直接打「真的」Supabase
                         專案（免費、夠快，不用另外裝 Supabase CLI／Docker 跑本機版）
```

前端不直接碰資料庫，一律透過 Supabase Edge Function（`supabase/functions/api/index.ts`）的 JSON API。Postgres 有四張表：**menu_items / orders / sessions / settings**，全部關了 RLS、不對外開放任何直接讀寫——只有 Edge Function（用 service role key）能碰，跟以前「前端只透過後端 API 講話」的原則一致。

`settings` 表身兼兩種設定：一種是原本就有的營業規則（店家收單Email、低消金額…），新增了「**寄信API金鑰**」「**寄件人Email**」（Resend 的設定）跟「**店家後台密碼**」——刻意放在資料表而不是 Supabase 的 Edge Function Secrets，因為 MCP 工具沒有管理 secrets 的權限，而且放資料表剛好符合「不用改程式碼、直接在後台表格改一格」的習慣。要改密碼或補寄信金鑰，去 Supabase 後台的 Table Editor 開 `settings` 表改就好。

## 本機怎麼跑

現在本機測試大多直接打「真的」Supabase 專案（`qoyojgephigwttbhbtft`），因為它免費、夠快，不像以前 Apps Script 要另外做假後端才能測。

```bash
python3 -m http.server 8900 --directory docs      # 純靜態伺服，config.js 本來就指到 Supabase
node tools/test-supabase-live.js                  # 完整流程對真的 Supabase 跑一次（會自己清掉測試資料）
node tools/test-vendor.js                          # 店家後台：登入、品項彙總、標記完成、CSV
node tools/test-menu-zoom.js                        # 查看菜單按鈕、圖片放大、同頁內嵌點餐
```

**改了 `supabase/functions/api/index.ts` 的行為，要重新部署**（透過 Supabase MCP 的 `deploy_edge_function`，或 `supabase functions deploy api`），存檔不會自動生效，這點跟以前的 Apps Script 一樣要記得。

舊的 `tools/mock-server.js` + `test-flow.js`／`test-draft.js`／`test-recover.js` 是對 Apps Script 年代寫的，現在還能跑（純前端邏輯沒變太多），但它們模擬的是舊後端行為，跟真正的 Supabase 已經會慢慢兜不起來，新功能的測試優先寫成直接打 Supabase 的版本。

沒裝 Playwright 瀏覽器的話用 `CHROME_PATH=/path/to/chrome node tools/xxx.js`。

## 動程式碼前要知道的事

**金額一律由後端算。** `submitOrderCore()`（`supabase/functions/api/index.ts`）會重新從 `menu_items` 查單價再乘數量，前端傳來的 price 只用來顯示。不要為了省事改成信任前端。

**時間全部標明 `+08:00` 讓 JS 自己解析。** 見 `parseTaipei()`。這是搬到 Edge Function 之後才能這樣做的——Apps Script 的腳本預設時區不可靠，所以以前得手算 epoch 繞開；Deno 沒有那個問題，直接在字串上標時區就好。`delivery_date` 存的是 Postgres 的純日期型別，顯示時直接字串換分隔符號（`fmtDateStr`），不用再經過 Date。**新增時間相關邏輯時，一樣不要依賴伺服器的預設時區。**

**CORS 由 Edge Function 自己處理，POST 用標準的 `application/json`。** 不像以前 Apps Script 得靠 `text/plain` 繞過壞掉的 CORS 預檢；現在 `docs/api.js` 每個請求都要帶 `apikey` / `Authorization: Bearer <anon key>` 這兩個表頭，Supabase 才會放行（這把金鑰是設計給前端公開用的，不是密碼）。

**收單截止時間有硬規則。** 店家最晚只收到「預訂日期前一天 15:00」，`createSession()` 會擋下更晚的設定。截止後同事不能新增或修改，`submitOrderCore` / `updateOrder` / `cancelOrder` 都會再驗一次，不能只靠前端擋。

**通知只在送單時寄。** 不要改成每筆訂單都發信，會洗版店家信箱。建團時另外寄一封管理連結給主揪，那是找回連結的命脈。**寄信要靠 `settings.寄信API金鑰`（Resend）先設定好**，沒設定的話 `sendEmail()` 會直接跳過、不會讓整支 API 掛掉，但也真的不會寄出去——這是目前唯一還沒接上的一塊，使用者要自己申請 Resend 帳號、把金鑰貼進 Supabase 的 `settings` 表。

**送單後才能標記「已完成」，兩個地方都能標記。** 主揪自己在 `admin.html`（用管理權杖）、店家在 `vendor.html`（用共用密碼）都可以把已送單的團標成「已完成」，背後是同一個狀態欄位。標記完成後這團就不會再出現在主揪首頁「你開過的團」列表。

**店家後台的資料一律不含跟團者姓名。** `vendorOrders()` 只回品項彙總（名稱/規格/數量/小計），CSV 匯出也是同一份資料，不要為了方便加回姓名。

**菜單、店家規定都在 `menu_items` / `settings` 表。** 要加品項或改價格是改 Supabase 的 Table Editor，不是改程式碼。`opt1/opt2` 是通用的客製化欄位（醬料、冰量、甜度、口味都共用同一套邏輯），Postgres 裡存成 `text[]` 陣列。

## 寫碼慣例

- 前端原生 JavaScript，**不要引入框架或建置工具**。使用者要能直接在 GitHub 網頁上編輯檔案。
- 前端用 `function` 宣告和 `var`/`const`，避免太新的語法（同事的手機可能不新）。Edge Function 是 Deno/TypeScript，這條不適用。
- UI 字串、註解、commit message 都用繁體中文，語氣口語一點（「你點的東西」而不是「訂單明細」）。
- 顏色一律用 `style.css` 最上面的 CSS 變數，不要寫死色碼。深色模式靠同一組 token 切換。
- 手機優先。斷點在 600px（平板）和 900px（桌機雙欄）。手機用底部浮動列，桌機用側欄，兩邊的按鈕透過 `data-submit` / `data-finalize` 共用狀態。
- 使用者輸入進 DOM 前一律 `escapeHtml()`。

## 已知限制（不是 bug，是取捨）

完整的決策紀錄與待確認事項見 [SPEC.md](SPEC.md) 第 8、9 節。

- 改訂單的連結只靠 8 碼隨機訂單編號保護，適合辦公室訂午餐的信任程度。店家後台則是單一共用密碼，同樣是「內部信任」等級，不是真的帳號系統。
- 管理頁與店家後台是輪詢／手動重新整理，不是推播。
- localStorage 只在單一裝置有效，換裝置靠信件（前提是寄信服務有設定好）。
- 寄信（Resend）金鑰目前還沒填，`finalizeSession` / `createSession` 等會正常執行但實際上不會寄出信件，只會在回傳訊息裡提醒還沒設定。

## 部署的兩個地雷

改完 `supabase/functions/api/index.ts` 之後要重新部署（Supabase MCP 的 `deploy_edge_function`），存檔不會自動生效。前端（`docs/`）則是 push 上 GitHub 就會自動更新，GitHub Pages 通常幾十秒內生效。
