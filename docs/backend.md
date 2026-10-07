# 網站與後台資料流

公開合作意向由首頁表單送至 `POST /api/inquiries`，Cloudflare Pages Functions 驗證內容後寫入 Supabase `public.collaboration_requests`，並回傳私人進度連結。現有表單 UI 保留，API 同時支援 3000 版後台使用的收件憑證與私人參考資料流程。

後台頁面位於 `/admin/`，API 位於 `/api/admin/`，登入使用 `/api/auth/`。管理權限由 Supabase Auth 驗證及 `public.site_admins` 管理員名單共同決定。管理頁不直接連接資料庫。

本機 `.dev.vars` 與 Cloudflare Pages Functions 需要 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 和伺服器端 `SUPABASE_SECRET_KEY`。設定與資料庫 migration 步驟請看 [後台啟用與部署](admin-setup.md)。

## 公開頁面與索引

Worker 與 Pages 共用 `server/public-page-routing.js`，首頁、作品列表、單組作品及 sitemap 的 GET／HEAD 回傳相同狀態與標頭，HEAD 不包含正文。公開 HTML 的資料庫讀取設為 4 秒逾時，並中止上游請求；作品資料無法取得時回傳 503，不以空白作品或空白 sitemap 取代。

首頁把已發布內容安全序列化到 `#phox999-public-content`，前端驗證後重用同一份資料，保持正文、FAQ 與搜尋摘要一致。沒有伺服器快照的靜態頁仍使用原本的 API 與預設內容。內部作品範本不依賴本地作品存在，保留公開客服、回頂部與燈箱；直接存取範本仍禁止索引。

## 後台照片選取

在 `/admin/portfolio/` 點選照片可多選，Shift + 點選可選取連續範圍，工具列提供全選、取消選取、批次向前／向後移、設為封面及移除。封面設定限單張；每組至少保留一張照片。移除封面時自動使用第一張保留照片作為封面。

選取狀態以照片路徑維持，排序不會選錯照片；切換作品或重新載入時清除選取。上傳與發布期間鎖定所有照片操作。移除僅修改作品草稿，不刪除 Storage 檔案，仍需按「發布作品集」才會更新公開網站。

驗證：`npm test` 涵蓋前端快照一致性、原生 Cloudflare HTMLRewriter、GET／HEAD、上游失敗與逾時，以及照片區間選取、批次排序、移除封面和操作鎖定。另執行 `npm run build:worker` 及 `npm run check:seo` 驗證建置與輸出範本。
