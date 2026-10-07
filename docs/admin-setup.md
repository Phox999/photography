# 後台啟用與部署

## 後台入口與功能

- 登入：`/admin/login/`
- 管理頁：合作意向、拍攝檔期、網站內容、操作紀錄、選片交件、合作回饋
- 合作對象私人頁：`/client/`（相簿邀請連結）與 `/cooperation-status/`（合作進度連結）

管理頁不會在靜態 HTML 內輸出合作資料。Cloudflare Pages Functions 會先驗證登入者，再透過 Supabase Auth、管理員名單與資料列安全政策提供資料。

## Cloudflare Pages

請在 Pages 專案根目錄建置並部署整個專案：

- Build command：`npm run build`
- Build output：`dist`
- Functions：保留專案根目錄的 `functions/`，不要只上傳 `dist/`

正式 Pages 環境需設定：

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`（設定成 Cloudflare Secret）

登入與一般管理 API 使用 publishable key 和登入者 session；secret key 僅留在伺服器端供受限資料操作使用。不要在前端程式、`PUBLIC_` 變數或 Git 中加入任何金鑰。

根目錄 `functions/` 也處理公開 SEO HTML：首頁、作品總覽、作品詳情和 `/sitemap.xml` 會從既有公開 RPC 取得已發布資料，再與靜態 Astro 範本合併。作品與首頁公開內容即時輸出，不需新增 migration；動態 HTML 使用 `Cache-Control: no-store`。一般靜態頁面仍由 Astro 預先建置。

## Cloudflare Worker

專案根目錄的 `wrangler.jsonc` 另設定 `worker.js` 為 Worker 入口，並將 `worker-dist/` 作為靜態資產目錄；`/api/*`、首頁、作品頁和 `/sitemap.xml` 由 Worker 先處理。Worker 與 Pages 共用同一份公開 HTML helper。建置與本機預覽指令為：

```bash
npm run build:worker
npx wrangler dev
```

Worker 需要設定與 Pages 相同的 Supabase 變數名稱，secret key 必須使用 Worker Secret。若已確認正式環境採用 Worker，發布指令是 `npx wrangler deploy`；若正式環境採用 Pages，則依 Pages 專案設定發布。僅憑本機設定無法確認 Cloudflare 上目前使用哪個目標，發布前應先核對專案與授權。

## Supabase 啟用

先檢查 Supabase 專案已套用哪些 migration；只補上缺少的檔案，並按檔名順序處理。全新測試專案需套用 `supabase/migrations/` 中完整序列：

- `202609240001_admin.sql`
- `202609240002_client_galleries.sql`
- `202609240003_feedback.sql`
- `202609240004_inquiry_references.sql`
- `202609240005_inquiry_workflow.sql`
- `202609240006_shoot_availability.sql`
- `202609240007_gallery_drafts.sql`
- `202609240008_shoot_confirmations.sql`
- `202609240009_gallery_uploads.sql`
- `202609240010_inquiry_contact_account.sql`
- `202609240011_hero_content.sql`
- `202609260001_hero_carousel_images.sql`
- `202609260002_hero_static_carousel_images.sql`
- `202609260003_portfolio_management.sql`
- `202609270001_portfolio_image_limit.sql`
- `202610010001_portfolio_incremental_updates.sql`
- `202610060001_inquiry_collaboration_types.sql`

不要重新執行已套用的 migration，也不要只套用舊版清單。這些 migration 涵蓋後台、檔期、回饋、合作流程、私人相簿、檔案上傳、首頁內容與公開作品集所需的資料表、RPC、RLS 和 Storage 設定。`202609240010_inquiry_contact_account.sql` 會為舊版合作申請表補上 `contact_account`，並在欄位空白時由既有 Instagram／Email 欄位回填聯絡資料；不會刪除申請或覆寫已填內容。

`202610060001_inquiry_collaboration_types.sql` 會更新舊資料表留下的合作類型 CHECK 限制，接受目前表單的「輕量體驗(2hr)」、「標準方案(3hr)」與「主題合作」，並保留四種歷史類型。若提交 RPC 回傳 SQLSTATE `23514` 並指出 `collaboration_requests_collaboration_type_check`，請檢查此 migration；僅重跑 `CREATE TABLE IF NOT EXISTS` 不會更新既有的限制。

接著在 Supabase Authentication 關閉公開註冊與匿名登入，由專案管理者建立並驗證管理員帳號，最後把該帳號的 UUID 加入管理員名單：

作品集管理頁透過 `/api/admin/portfolio-changes` 提交變更集合，只送新增或修改的作品、刪除的識別名稱和完整順序；資料庫 RPC 會鎖定版本列、合併並驗證最終集合，再以單一更新寫入。新 API 的 JSON 上限是 8 MiB，測試涵蓋 80 組、每組 500 張 UUID 儲存路徑的有效資料；很長的靜態檔名仍可能超過固定上限。舊版 `/api/admin/portfolio` 全量更新端點仍保留相容，限制維持 512 KiB。超過新 API 上限的請求會明確回傳 413。

```sql
insert into public.site_admins (user_id, active)
values ('請換成 Supabase Auth 使用者 UUID'::uuid, true)
on conflict (user_id) do update set active = true;
```

驗證回饋與檔期資料表，以及私人 Storage bucket 都已按 migration 設定完成。不要將私人照片上傳至 `public/`。

## 本機預覽

`npm run dev` 只提供 Astro 頁面，不會執行 Cloudflare Functions。要在本機預覽 Pages Functions，請將 `.dev.vars.example` 的範例值填入 `.dev.vars`。若 `.dev.vars` 已有自己的 Supabase URL 或 secret，保留原值，只補上缺少的 `SUPABASE_PUBLISHABLE_KEY`；不要用範例檔覆蓋既有金鑰。再執行：

```bash
npm run build
npm run check:seo
npx wrangler pages dev dist --port 4321
```

本機 `AUTH_ALLOW_LOCALHOST=true` 只用於 localhost 測試；正式 Cloudflare 環境不要設定。請先停止佔用 4321 的 Astro 開發伺服器，再啟動 Wrangler Pages 預覽。

Worker 預覽使用 `npm run build:worker` 與 `npx wrangler dev`。兩種預覽都須使用合成資料；不要把真實客戶資料複製到測試系統。

SEO 輸出檢查會驗證 canonical、公開頁 JSON-LD、sitemap、私人頁 noindex 和建置產物的本機圖片。動態作品的新增、修改、移除與錯誤狀態另由 `npm test` 的合成資料案例驗證。正式站 Cloudflare 部署模式、代管 robots 規則、搜尋站長工具帳號與部署狀態，仍須依目標帳號檢查；本機建置不代表已發布或已被索引。

目前不新增自訂 `robots.txt`：正式站的 Cloudflare 回應可能包含代管 Content Signals，必須先從正式站和 Cloudflare 專案確認完整規則，避免提交檔案時覆蓋原有控制。這次本機無法讀取正式站該路徑，收到的是 HTTP 403。

## 功能驗收

1. 未登入開啟 `/admin/` 時，只會看見權限確認畫面；登入後管理頁載入合作資料。
2. 新合作表單仍可送出，成功回覆會提供私人合作進度連結。
3. 發布中的公告與 FAQ 會由公開內容 API 顯示；資料庫不可用時，頁面會退回原本的靜態 FAQ。
4. 管理員可新增檔期並由首頁檔期區讀取公開時段。
5. 建立測試相簿後，確認邀請、選片、草稿、確認與交件流程，再撤銷測試邀請。

請依 Cloudflare 專案實際設定選擇 Pages 或 Worker，並分別驗證對應輸出與 `/api/*` 路由。除非已在目標環境建置與預覽，文件步驟不代表部署已驗證。本機修改的建置、登入、Supabase migration、Storage 上傳和資料庫安全測試結果應分開記錄；正式部署需另行批准。
