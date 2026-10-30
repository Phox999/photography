# PHOX999 前台設計預覽

從專案根目錄執行：

`node node_modules/astro/astro.js dev --root tools/frontend-preview`

開啟 http://127.0.0.1:4329/design-preview/

建置：`node node_modules/astro/astro.js build --root tools/frontend-preview`

共用元件在 src/components/design-preview，樣式在 src/styles/design-preview.css，
互動在 src/scripts/design-preview.js，預覽資料在 src/data/design-preview.ts。
此預覽不會傳送合作表單；正式表單連結會另開 Google Form。
首頁與一起創作頁共用表單。日期為本機日曆示意，不代表實際可預約日期。
作品 10–20 是容量示意；原有八個封面只有單張照片，僵尸偶像系列包含 20 張。
關於我的個人照片保持設計中的待替換狀態。

詳細照片依原始比例排列，圖片間距為 4px；作品數量增加時會繼續產生新列。
Lightbox 支援左右按鍵、縮圖跳轉、Esc 關閉與觸控滑動。

2026-10-30 檢查：24 個靜態路由建置完成；45 個 WebP 素材皆存在。
393px 手機寬度下，各頁沒有橫向溢出；合作日期與主題可帶入確認摘要。
正式站台的根目錄建置曾遇到 dist 寫入權限問題，本預覽使用上述獨立建置命令。

若需要發布這個設計預覽至 Cloudflare Pages，Build command：
`node node_modules/astro/astro.js build --root tools/frontend-preview`
Output directory：`tools/frontend-preview/dist`。目前 Dev 使用下方的 Worker 版本預覽流程。

## Dev 線上預覽

2026-10-30 已更新既有 Dev alias：
https://dev-photography.andrewtan088.workers.dev/

- /portfolio/：新版作品集
- /cooperation/：合作與檔期
- /admin/：後台互動模擬（示意資料，不連接正式管理操作）
- /design-preview/：原預覽路徑仍可使用

Dev 版本 c52208f0-7af1-4c1b-bece-a33800c2d3c7。正式流量仍使用原版本，未切換。
Dev API 沿用 origin/dev 的既有 handlers，秘密值由版本上傳保留。

重新發布（從專案根目錄執行，先確認 origin/dev 是要保留的 API 基底）：

```powershell
node node_modules/astro/astro.js build --root tools/frontend-preview
New-Item -ItemType Directory -Force tools/frontend-preview/.release-server | Out-Null
git archive origin/dev worker.js functions server src/lib shared | tar -xf - -C tools/frontend-preview/.release-server
node tools/frontend-preview/prepare-dev-assets.mjs
node node_modules/wrangler/bin/wrangler.js versions upload --config tools/frontend-preview/wrangler.dev.jsonc --preview-alias dev --keep-vars
```

僅使用 versions upload 更新 Dev alias；不要執行 versions deploy 或一般 deploy。
發布素材僅包含前台頁面、後台模擬與 design-preview WebP/SVG，不上傳原始照片庫。

2026-10-31 首頁保留規則：
- 使用者確認首頁及 Header 以固定版本 193ebb30 為準。
- dev-worker.mjs 僅代理該版本首頁及缺少的靜態素材；內頁仍由本地 preview assets 提供。
- 不要再將 / 或 /design-preview/ 改寫到簡化版首頁。
- 此為 Dev 整合過渡方案，依賴該固定版本；合併正式程式時需移植其原始首頁元件。
