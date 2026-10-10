# 可直接申請的拍攝企劃：第一版交付

更新日期：2026-10-11

程式與文件已以 commit `a416fbb` 推送至 `origin/main`。這次只推送企劃功能來源、測試、migration 和交付報告；沒有推送原照、`dist`、`.astro` 或其他既有未追蹤內容。正式 Worker 尚未部署。

## 交付狀態

企劃設定、公開頁面、申請 API、不可變 snapshot、舊申請重試相容、後台篩選、回條呈現及資料庫 migration 已實作。兩筆企劃目前都刻意維持 `draft`：尚無已確認的封面與可公開參考照片、申請對象、服裝／準備、拍攝區域與日期、費用、交付及公開標註條件，因此不會出現在正式作品頁、企劃列表或 sitemap，也不能送出企劃申請。

既有一般合作 CTA 仍連至 Google 表單。新企劃使用 `/apply/` 專用站內申請頁；沒有開放企劃時，使用者仍可選擇原有一般合作入口。

## P01–P06 實作範圍

- **P01 共用企劃設定**：`shared/shoot-projects.js` 集中管理 ID、slug、revision、狀態、顯示順序、內容、封面、3–6 張參考照片及相關作品。只有通過完整內容檢核的非草稿項目才可進入公開集合。
- **P02 首頁、列表與詳情**：首頁加入企劃入口元件；`/projects/` 只列出可公開企劃；`/projects/[slug]/` 只產生可公開詳情。草稿僅在 Astro 開發模式提供 `/projects/preview/[slug]/`，頁面會列缺欄並標示本機預覽。
- **P03 專用申請頁**：`/apply/` 使用既有合作表單元件和 `/api/inquiries`，提交企劃 ID／revision。一般合作表單及 Google 表單連結保留。
- **P04 伺服器驗證及重試**：API 不接受客戶端傳入企劃文案或 snapshot；新申請依當下企劃狀態、revision、截止時間驗證，再由伺服器建立 snapshot。重試識別納入企劃 ID／revision，一般申請沿用舊識別。已收件的同一重試會先查原回條，即使企劃後來關閉也回傳原回條；新申請則依當下狀態拒絕。
- **P05 資料庫與後台**：新增 `shoot_project_id`、`shoot_project_snapshot`、配對約束及 snapshot 白名單驗證；writer RPC 的 payload allowlist 和 INSERT 一併支援企劃資料。既有後台清單可篩選企劃申請，申請回條／進度只顯示允許欄位，舊的一般合作資料仍相容。
- **P06 驗收與文件**：新增企劃與送件鏈測試、SQL 安全測試檔，修正 SEO 驗證器以把 noindex 的申請頁排除於 sitemap 完整性檢查，並要求該頁仍有正確事件標記。

## 驗證證據

### 已驗證通過

- `npm.cmd test`：66 tests，66 passed，0 failed。
- 隔離目錄執行 `npm.cmd run build:worker`：成功，輸出 57 個頁面；主目錄現有 `.astro`／`dist` 未被建置覆蓋。
- 同一隔離產物執行 `npm.cmd run verify:seo`：通過，57 HTML pages、45 sitemap URLs、1499 internal links、1223 images checked、0 missing image dimensions、41 schemas、9 published Journal articles、15 llms links，failures 為空。
- 同一隔離產物執行 `npm.cmd run verify:worker`：`strictDist: true`，通過，failures 為空。
- 本機 Astro 開發伺服器瀏覽器 smoke check：`http://127.0.0.1:4322/`，視窗 1280 × 720 CSS px、DPR 1。首頁沒有水平溢出；目前首屏載入的圖片沒有失敗，控制台沒有錯誤或警告；FAQ、導覽及 Google CTA 標記存在。企劃列表顯示空狀態；帶草稿 ID 的申請連結不會默默選中企劃；草稿預覽顯示本機限定與待補欄位。
- Supabase `photography-site` migration 已套用。唯讀確認 migration 版本 `20261010163528`／`shoot_projects`、兩個 nullable 欄位、ID／snapshot 配對約束、snapshot 白名單、有效／無效 payload 判斷及 RPC 權限；anon 無 writer RPC 執行權。沒有建立企劃申請資料列。
- migration 本機檔名已對齊遠端版本：`supabase/migrations/20261010163528_shoot_projects.sql`，避免後續 CLI 把已套用 migration 誤判為另一版。

### 已實作，尚未完成端到端驗收

- 兩筆企劃均為草稿，故沒有真實開放申請可在瀏覽器完成成功送件及回條流程；沒有向正式 API 送出假申請。API 的有效 payload、偽造欄位拒絕、草稿／關閉拒絕、已收件後關閉仍回原回條等行為由 Node 測試覆蓋，但不等於正式資料庫插入驗證。
- SQL／pgTAP 測試檔 `supabase/tests/shoot_projects_security.test.sql` 已加入，這台環境沒有執行本地 Supabase／pgTAP。遠端驗證採唯讀 SQL，未測試實際 RPC 寫入。
- `wrangler dev` 的 Windows `workerd`／資產監看器無法在此環境啟動可連線的本機 Worker port；因此 Worker 執行時及完整 API → Supabase → 回條流程仍待可用的 Worker runtime 驗收。建置和 strict Worker 靜態資產驗證已通過。
- 瀏覽器只量測 1280 × 720、DPR 1；390／768 px 與 DPR 2 未驗。首屏檢查時 16 張圖片中 10 張已載入，其餘為延遲載入，不據此宣稱整頁圖片都已在瀏覽器解碼。

## 待補的企劃事實

在 `shared/shoot-projects.js` 將企劃轉為 `open` 前，請先確認並填好：

1. 真實企劃名稱、摘要與拍攝構想。
2. 封面及 3–6 張可公開使用的參考照片、每張替代文字及肖像／著作使用權。
3. 適合對象、服裝和拍攝前準備。
4. 可公開的拍攝區域、日期／時段、申請截止時間；未定的資料不要先寫成承諾。
5. 費用分攤、照片交付方式與時間、公開作品及標註規則。
6. 若有關聯作品，核對 `relatedPortfolioSlugs` 為現存作品 slug。

資料確認後提高 `revision`，再將 `status` 設為 `open`。重要條件改變時再次提高 revision；將 `open` 改為 `closed` 可阻止新申請，但不撤銷既有回條和 snapshot。此版本沒有企劃編輯後台。

## 本機預覽

已用本機 Astro 開發伺服器完成瀏覽器 smoke check；該伺服器已停止。重新預覽時，因主工作目錄已有使用者的 `.astro`／`dist` 差異，請先使用隔離 checkout，再執行：

```powershell
npm run dev -- --host 127.0.0.1 --port 4322
```

開啟 `/`、`/projects/`、`/apply/`、`/projects/preview/city-night-portrait/` 或 `/projects/preview/uniform-portrait/`。草稿預覽只在開發模式註冊；正式建置不輸出草稿頁。

## 發布順序與回復方式

1. 遠端 Supabase 已先套用 additive migration `20261010163528_shoot_projects`，不需重複套用。
2. 已完成：本次明確列出的原始碼、migration、測試與交付文件已推送至 `origin/main`（`a416fbb`）；不包含 `dist`、`.astro`、臨時建置目錄或未追蹤照片。
3. **正式 Worker 尚未部署**：兩筆企劃仍是草稿，正式頁面會是空列表；本機 Worker runtime 無法在目前 Windows 環境啟動，而且沒有可安全驗證的真實開放企劃送件。Push 不等於正式站已更新。補齊真實企劃事實後，先重跑三項驗證，再部署並以無副作用的頁面檢查確認版本；成功送件要用測試環境或明確核准的測試資料驗證。
4. 真實企劃資訊補齊並確認後，才提高 revision、開啟企劃並重新建置／發布；使用測試環境或明確核准的測試資料驗證成功回條與關閉後重試。
5. 若前端／Worker 發布需回復，部署前一個已知版本即可；保留 additive 欄位和已收件資料，不以刪除資料表／欄位作為一般回復手段。

本地實作、建置與遠端 schema migration 不代表正式 Worker 已部署，也不代表已收到真實申請。搜尋成效、排名與 AI 引用未在此任務量測。
