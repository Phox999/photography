# 拍攝企劃功能 F01–F07 驗收補修交付

更新日期：2026-10-11

## 本輪狀態

本輪以 `ca4fa48` 為基準完成 F01–F07 本機修正與驗收，來源已提交並推送至 `origin/main`：`dc363c9`（`Repair shoot project acceptance gaps`）。本次提交僅含下列 11 個拍攝企劃來源、測試、migration 與交付文件；保留其他既有修改、未追蹤照片與素材。測試企劃只存在於隔離驗證副本。沒有執行正式 migration 或 deploy。

真實企劃仍維持 `draft`。沒有公開真實企劃照片／條件、資料庫測試連線或 Worker 測試憑證，因此不把靜態建置、Node mock 或正式頁面瀏覽寫成完整送件驗收。

## F01–F07 結果

| 項目 | 本機結果 | 限制 |
|---|---|---|
| F01 文字與 snapshot 驗證 | JavaScript 與新增 SQL validator 都接受 LF、CRLF、TAB，拒絕未支援的 C0／DEL 控制字元；字數按 Unicode code point，snapshot 上限統一為 12,000 UTF-8 bytes。舊 migration 未改，新增修正 migration。 | 新 migration 尚未套用；SQL／pgTAP 尚未連接資料庫執行。 |
| F02 圖片尺寸 | 列表封面、詳情封面與 3–6 張參考圖使用既有 `sharp` metadata helper 在建置時取得原圖尺寸；沒有新增依賴，也沒有把檔案系統／圖片處理帶入 Worker 共用模組。完整公開 fixture 的 SEO 與 strict Worker 驗證都回報 0 張缺尺寸圖片。 | 公開企劃 fixture 使用現有 `/assets/hero.webp` 作測試素材，不代表真實企劃封面。 |
| F03 截止時間 | 首次載入、計時跨截止、`pageshow`、視窗 focus 與頁面恢復時更新狀態。選中企劃和已填資料保留；到期後新申請停用並提示。前端允許同資料的未確認結果重試；API 仍先查既有回條，再驗證新申請當下狀態，寫入前再次檢查截止。 | 以瀏覽器測到跨截止後的 UI 保留與停用；沒有對 Worker API 注入模擬 5xx 的瀏覽器送件，也沒有真實 Worker／DB 端到端送件。 |
| F04 申請頁版面 | 專用模式 class 移到 `Contact.astro` 元件本身；僅該模式隱藏左欄並使用單欄。一般合作表單不套用此 modifier。鍵盤焦點框可見。 | 正式站目前畫面仍顯示左側說明欄，表示本輪本機 CSS 尚未發布。 |
| F05 SQL 測試 | 修正 pgTAP `has_column(schema, table, column, description)` 斷言；SQL 測試新增一般合作 writer、企劃 writer、snapshot 保存、同資料重試、異資料衝突及回條 snapshot 查詢。Node 測試也覆蓋已收件後在草稿／關閉檢查前返回舊回條，以及沒有既有回條時拒絕目前未開放企劃。 | SQL 寫入測試沒有實際執行。資料庫本身不保存公開企劃狀態；關閉後新申請由 Worker 依目前設定拒絕，需在專用資料庫／Worker 環境驗收完整鏈。 |
| F06 空狀態 | 原始草稿資料建置的首頁不輸出企劃 section；`/projects/` 保留空狀態。公開 fixture 在首頁瀏覽期間所有開放企劃截止後即隱藏區塊；列表卡片移至過往企劃組。 | 首頁動態狀態用本機 fixture 與瀏覽器驗證。 |
| F07 發布證據 | 本輪沒有手動部署。唯讀正式站檢查：`https://phox999.com/projects/` 顯示空列表狀態；`/apply/` 有 `noindex, nofollow, noarchive`，顯示無開放企劃訊息與原一般合作表單；首頁沒有企劃區塊，7 個合作 CTA 均連向原 Google 表單。 | 正式部署 commit／Worker 版本沒有可觀察的版本標記，故版本未確認。正式站申請頁目前仍顯示左欄；不能宣稱本輪修正已上線。 |

## 實作與變更檔案

- `shared/shoot-projects.js`：文字控制字元、Unicode 字數和 snapshot byte 上限驗證。
- `supabase/migrations/20261011013815_allow_project_snapshot_text_layout.sql`：增量更新 snapshot validator；沿用白名單、ID／snapshot 配對、RLS 與 RPC 權限。
- `supabase/tests/shoot_projects_security.test.sql`：pgTAP schema／欄位斷言、文字案例與 writer／snapshot／重試測試。
- `tests/shoot-projects.test.js`：LF／CRLF／TAB、非法控制字元、byte 上限，以及 closed／completed／過期新申請拒絕測試。
- `src/pages/projects/index.astro`、`src/pages/projects/[slug].astro`：輸出正確圖片尺寸；加上截止狀態標記與頁面行為。
- `src/components/Contact.astro`、`src/pages/apply/index.astro`：專用單欄樣式、截止選項與重試狀態。
- `src/components/ShootProjectHighlights.astro`：無公開企劃時不輸出首頁區塊，並監看截止更新。
- `src/scripts/shoot-project-deadlines.js`：新增共用、輕量截止更新腳本。
- `docs/SHOOT-PROJECTS-DELIVERY.md`：本報告。

歷史驗收證據保留在 `docs/SHOOT-PROJECTS-ACCEPTANCE-2026-10-11.md`。既存 `.astro`／`dist` 差異、本輪前已存在的素材與其他未追蹤檔均未納入本輪建置或清理。

## 驗證證據

### 自動測試

- 原始資料：`npm.cmd test`，69 passed、0 failed。
- 隔離公開企劃 fixture：以 `NODE_OPTIONS=--experimental-loader=file:///C:/Users/chuaj/OneDrive/Desktop/phox999-site/.shoot-projects-validation-f-20261011-013815/fixture-loader.mjs` 執行 `npm.cmd test`，69 passed、0 failed。Node 24 顯示 loader experimental warning；不影響退出碼。此 loader 與 fixture 都是本輪臨時驗證檔，結束後移除。
- Fixture 含 `open`、建置時尚未截止且瀏覽期間到期、`closed`、`completed`、`draft` 五種狀態；真實設定檔仍保留兩筆 draft。
- `git diff --check` 通過；Git 只提示部分 CRLF/LF 工作目錄格式轉換警告。

### 隔離建置矩陣

主目錄原本有使用者的 `.astro`／`dist` 差異，所有建置與產物檢查都在新建隔離副本執行。照片只透過 hard link 供隔離副本讀取，沒有覆寫、搬動或刪除原照。

| 資料集 | `build:worker` | `verify:seo` | `verify:worker --strict-dist` |
|---|---|---|---|
| 原始兩筆 draft | 通過，57 頁 | 通過；57 HTML、45 sitemap URLs、1,497 internal links、1,223 images、0 missing dimensions、41 schemas、9 篇 Journal、15 llms links | 通過，strictDist=true，0 failures |
| 公開驗收 fixture | 通過，61 頁 | 通過；61 HTML、49 sitemap URLs、1,599 internal links、1,243 images、0 missing dimensions、41 schemas、9 篇 Journal、15 llms links | 通過，strictDist=true，0 failures |

公開 fixture 確認 4 筆公開狀態 route 存在，draft route 和其標題不進入輸出；申請頁維持 noindex，closed／completed 不顯示申請 CTA，圖片尺寸存在。Worker 靜態產物連結 1,219 張現有圖片。Astro 有一則既有 `/assets/icons/external-link.svg` 建置解析 warning，SEO 與 Worker 驗證器仍全部通過。

### 本機瀏覽器

在隔離公開 fixture 的 Astro dev 頁面完成 smoke check，網址 `http://127.0.0.1:4328/`。頁面可開啟；未向 `/api/inquiries` 送件。Astro dev 沒有 Worker bindings，頁面動態讀取的部分 `/api/*` GET 回 404；這些回應沒有當作 Worker 驗收證據。

- 首頁、企劃列表、企劃詳情、企劃申請頁均測量 viewport 390／768／1440 CSS px；各頁 `scrollWidth` 等於 `clientWidth`，沒有水平溢出。
- 申請頁在三種尺寸都是單欄；左側欄位 display 為 none。390 px 下企劃選擇 select 有鍵盤 focus-visible，3 px outline。
- `?project=acceptance-expiring` 預選正確；切換企劃後摘要與 review 標題更新；空白選填說明在 review 顯示「依企劃內容討論。」；返回修改後姓名、聯絡方式、帳號、企劃與勾選狀態保留。
- 瀏覽期間跨截止：被選企劃仍維持選中但 option disabled，通知說明新申請停用並保留同資料重試；確認及繼續按鈕停用，欄位內容保留。
- 首頁兩筆 fixture 企劃原先可見；截止後兩張狀態成為「已截止」，整個首頁企劃 section 隱藏。
- 列表開放組歸空並隱藏，卡片移至「先前企劃」；詳情顯示「已截止」，兩個申請連結隱藏，一般合作連結仍存在。
- 詳情封面與 3 張測試參考圖片均完整載入；fixture 使用的圖片實際尺寸與輸出 width／height 為 5472 × 3648。首頁 Hero 原圖載入完成，naturalWidth 1440。
- 首頁 FAQ 可展開、手機選單可開啟；首頁作品錨點、合作頁 `availability`／`process` 錨點存在；7 個首頁／表單合作 CTA 保持原 Google 表單網址。

此為本機 fixture UI smoke check，不等於 Worker API、Supabase 寫入或正式環境驗收。

### SQL／Worker 實際環境

- 本機沒有可用的 disposable Supabase／pgTAP、Postgres CLI 或 Docker 測試環境，也沒有專用 Worker 測試 bindings／憑證；因此未執行 SQL migration、pgTAP 或瀏覽器 → Worker → Supabase → 私人回條 → 後台篩選的整條流程。
- 新 migration 尚未套用；沒有對正式資料庫寫入，也沒有在正式站送出測試申請。Node mock 和靜態產物結果不替代上述驗證。
- 正式站唯讀瀏覽只證明目前頁面可見狀態，沒有版本 endpoint／commit 可核對。正式 Worker 版本、正式資料庫目前 migration 狀態未由本輪確認。

## 待辦與發布步驟

1. 在專用、可丟棄的測試 Supabase 資料庫套用既有 migration 鏈及新增 `20261011013815_allow_project_snapshot_text_layout.sql`，執行 `supabase/tests/shoot_projects_security.test.sql`。確認一般合作 writer、企劃 writer、snapshot、同資料重試、異 payload 衝突、舊回條重試與 RLS／RPC 權限。
2. 用連到該測試資料庫的 Worker 執行瀏覽器送件，查驗保存 snapshot、私人回條內容與後台企劃分類／篩選；同時驗證 closed／completed／過期新申請拒絕。不要以 Astro dev 的 API route 代替 Worker。
3. 取得並確認真實企劃封面／參考照片使用權與所有合作條件前，兩筆企劃維持 draft。確認內容後提高 revision，才改為 open。
4. 發布前重跑 `npm test`、`npm run build:worker`、`npm run verify:seo`、`npm run verify:worker`。先套用已驗證相容的 migration，再發布 Worker／資產；部署後以 GET 頁面與專用測試環境驗證，記下實際 Worker version／部署 commit。
5. 回復時先部署上一個已知 Worker 版本。新增 migration 不搬移資料；如需在測試環境復原 validator，恢復舊 validator function 定義即可。若未來已有允許換行的 snapshot 資料，回復前先確認舊規則不會阻止必要的後續寫入；不要用刪除欄位或申請資料回復。

本輪已 commit／push 至 `origin/main`（`dc363c9`）；沒有執行正式 migration 或 deploy。搜尋排名、真實申請、使用者 Core Web Vitals 與正式 Worker 版本均未由本輪證實。
