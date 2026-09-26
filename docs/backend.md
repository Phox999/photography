# 網站與後台資料流

公開合作意向由首頁表單送至 `POST /api/inquiries`，Cloudflare Pages Functions 驗證內容後寫入 Supabase `public.collaboration_requests`，並回傳私人進度連結。現有表單 UI 保留，API 同時支援 3000 版後台使用的收件憑證與私人參考資料流程。

後台頁面位於 `/admin/`，API 位於 `/api/admin/`，登入使用 `/api/auth/`。管理權限由 Supabase Auth 驗證及 `public.site_admins` 管理員名單共同決定。管理頁不直接連接資料庫。

本機 `.dev.vars` 與 Cloudflare Pages Functions 需要 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY` 和伺服器端 `SUPABASE_SECRET_KEY`。設定與資料庫 migration 步驟請看 [後台啟用與部署](admin-setup.md)。
