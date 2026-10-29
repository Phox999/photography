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
Output directory：`tools/frontend-preview/dist`。本次尚未部署。
