# S／A 預約合作流程

本次整合既有 SEO／AIEO、收件代碼與作品收藏分支，並完成以下流程。這是程式與本機驗證記錄；正式資料庫與通知供應商尚未啟用。

|項目|使用方式|
|---|---|
|預約後續中心|`/cooperation-status/` 用收件代碼或私人連結登入，集中查看申請、確認單、準備與相簿。|
|自動通知|Email 驗證、LINE 綁定後，狀態、確認單、相簿、取消與保留到期會產生通知。|
|暫留檔期|送出申請後在中心選擇開放時段；保留 24 小時，最晚到拍攝開始。同一申請 24 小時內只接受一次新暫留。|
|修改／取消|未安排時直接修改想法；已有安排時提出調整請求。取消會釋放檔期並關閉中心相簿入口，開始拍攝後改為直接聯繫。|
|Checklist|六項準備清單保存在本次申請，可跨裝置恢復。|
|收藏／Moodboard|沿用 #6：最多 12 張公開作品，帶入申請、前後台與 Brief。|
|方案推薦|合作頁三題問卷，推薦現有一般互惠或主題企劃，帶入表單。|
|收件完成頁|首頁成功摘要及 `/cooperation-received/` 提供代碼、下一步、回覆提醒、複製及下載私人回條。|
|拍攝 Brief|前後台按當次申請、收藏、已發布確認單自動整理為文字檔；缺少資訊保留待確認。|
|選片強化|中心連結既有私人相簿；愛心、已選篩選、張數、備註、草稿與最終鎖定。跨裝置使用同一邀請紀錄，重開不會重設已確認清單。|

## 資料庫與安全

先確認既有 migration，再依序套用尚未執行的：

1. `202610050001_inquiry_reference_lookup.sql`
2. `202610050002_portfolio_favorites.sql`
3. `202610050003_cooperation_center.sql`

003 依賴既有管理員、合作收件、檔期、確認單、私人相簿與草稿 migration。不要只套用 003 到空專案。新私有資料表啟用 RLS 並撤銷直接存取；訪客功能只允許伺服器角色執行窄範圍 RPC，管理員操作需登入與名單驗證。

PHOX 代碼與私人連結都是管理本次合作的憑證。代碼不放 query，token 只放 fragment／Authorization；頁面讀取後移除 fragment，操作 session 有效一小時並只保存在記憶體。更新進度可重新取得 session。撤銷收件憑證後，中心 session 與由中心發行的相簿 session 都無法再使用。私人頁面排除 sitemap、禁止索引與快取。

檔期寫入先鎖申請，再按 UUID 順序鎖檔期；確認、取消、管理員改期與訪客暫留共用鎖定規則。公開檔期讀取直接判斷過期，不依賴排程才釋放。管理員不能覆蓋仍有效的其他客戶暫留；草稿確認單的既有人工保留不會被 24 小時清理誤釋放。

客戶調整請求需管理員聯繫、必要時更新確認單，再按「已聯繫並處理調整請求」。相簿需在後台建立與上傳後連結；草稿相簿不向客戶開放。開始拍攝後不允許自助取消／改期，避免抹去已發生的安排。

提交表單使用固定收件識別；同一頁對相同內容的重試使用同一憑證，避免連線中斷重複送件。舊申請若沒有私人收件回條，後台會提示沿用原聯絡方式。

## 正式通知設定

部署目標使用 Cloudflare Worker；`wrangler.jsonc` 已加入每 5 分鐘 Cron。Pages 單獨部署不會執行 Worker Cron，需另設受信任的排程執行環境。

|Worker 設定|用途|
|---|---|
|`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`|沿用現有資料庫設定；secret 僅伺服器使用。|
|`RESEND_API_KEY`|Worker secret，寄送 Email。|
|`NOTIFICATION_FROM`|Resend 已驗證網域的寄件地址，可設為 Worker var。|
|`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`|Worker secrets，推播與驗證 webhook HMAC。|
|`LINE_BOT_URL`|官方帳號加入好友的 `https://line.me/...` URL。|

LINE Developers 設定 webhook：`https://phox999.com/api/cooperation/line-webhook`，啟用接收 webhook。客戶在中心取得 20 分鐘有效的一次性綁定碼，再以一對一訊息傳給官方帳號；不接受任意手動 userId。Email 驗證碼 20 分鐘有效，最多五次嘗試、五分鐘內不能重寄；驗證完成前不寄送私人合作內容。

通知佇列與狀態寫入同一交易。排程最多領取 10 件，使用五分鐘租約；失敗逐次退避、最多六次，23 小時後停止自動重試；保留 30 天後清除。Resend 使用固定 `Idempotency-Key`，LINE 使用固定 `X-Line-Retry-Key`，防止重送。停止通知會取消尚未寄出的工作；供應商已接收的寄送無法撤回。後台提供通道與待寄／已寄／失敗張數，失敗需檢查憑證與供應商記錄；不在前台顯示 secret 或目的地址。

未設定通道時，中心清楚顯示尚未啟用並保留原聯絡方式；不宣稱已寄送。資料庫 migration 必須先於前端／Worker 部署，否則中心 RPC 無法使用。正式套用、供應商實寄與部署需在目標環境另行驗證。

官方介接文件：[Resend Send Email](https://resend.com/docs/api-reference/emails/send-email)、[LINE Messaging API](https://developers.line.biz/en/reference/messaging-api/)、[LINE webhook signature](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)。

## 已完成的驗證

- `npm test`：79 項，包括原生 Worker 及 PGlite 真實 PostgreSQL 語法／交易驗證。新增涵蓋 migration 重跑、角色授權、收件隔離、競爭時段、過期／取消、樂觀版本、驗證次數、LINE 重放、通知租約及跨 session 選片鎖定。
- `npm run build:worker`：46 頁建置與 Worker 靜態資產準備通過。
- `npm run check:seo`：34 可索引頁面／sitemap URL，私人頁排除與本地圖片路徑通過。
- 生產建置瀏覽器測試以模擬 API 執行：320／393／600／760／1440 寬度、代碼／token 查詢、保留、Checklist 恢復、衝突保留輸入、Email／LINE 設定、Brief 下載、收件頁、推薦帶入、相簿與取消、後台相簿連結及調整處理；未呼叫正式通知供應商。
