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

## Supabase 啟用

先檢查 Supabase 專案已套用哪些 migration；只補上缺少的檔案，按編號由 `202609240001_admin.sql` 到 `202609240010_inquiry_contact_account.sql` 依序執行。這批 migration 會新增後台、檔期、回饋、合作流程、私人相簿與檔案上傳所需的資料表、RPC、RLS 和私人 Storage bucket。`010` 會為舊版合作申請表補上 `contact_account`，並在欄位空白時由既有 Instagram／Email 欄位回填聯絡資料；不會刪除申請或覆寫已填內容。

接著在 Supabase Authentication 關閉公開註冊與匿名登入，由專案管理者建立並驗證管理員帳號，最後把該帳號的 UUID 加入管理員名單：

```sql
insert into public.site_admins (user_id, active)
values ('請換成 Supabase Auth 使用者 UUID'::uuid, true)
on conflict (user_id) do update set active = true;
```

驗證回饋與檔期資料表，以及私人 Storage bucket 都已按 migration 設定完成。不要將私人照片上傳至 `public/`。

## 本機預覽

`npm run dev` 只提供 Astro 頁面，不會執行 Cloudflare Pages Functions。要在本機測後台 API，請將 `.dev.vars.example` 的範例值填入 `.dev.vars`。若 `.dev.vars` 已有自己的 Supabase URL 或 secret，保留原值，只補上缺少的 `SUPABASE_PUBLISHABLE_KEY`；不要用範例檔覆蓋既有金鑰。再執行：

```bash
npm run build
npx wrangler pages dev dist --port 4321
```

本機 `AUTH_ALLOW_LOCALHOST=true` 只用於 localhost 測試；正式 Cloudflare 環境不要設定。請先停止佔用 4321 的 Astro 開發伺服器，再啟動 Wrangler Pages 預覽。

## 功能驗收

1. 未登入開啟 `/admin/` 時，只會看見權限確認畫面；登入後管理頁載入合作資料。
2. 新合作表單仍可送出，成功回覆會提供私人合作進度連結。
3. 發布中的公告與 FAQ 會由公開內容 API 顯示；資料庫不可用時，頁面會退回原本的靜態 FAQ。
4. 管理員可新增檔期並由首頁檔期區讀取公開時段。
5. 建立測試相簿後，確認邀請、選片、草稿、確認與交件流程，再撤銷測試邀請。

本次已確認 Astro 靜態建置；實際登入、Cloudflare 部署、Supabase migration、Storage 上傳和資料庫安全測試仍需在設定完成的測試專案驗收。
