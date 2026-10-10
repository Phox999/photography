# SEO／AIEO 圖片效能基準

量測日期：2026-10-10（Asia/Taipei）。這份報告比較 Git HEAD 重建版與本輪隔離候選版。原照保留原位；效能候選使用新增的同照片 WebP 尺寸，不把不同照片換成較小封面。

## 第二輪補修驗收狀態（2026-10-10）

本次檢查可用工具時，工作階段沒有 Chrome DevTools MCP 的 `performance_start_trace`、network request waterfall／timing 或 HAR 擷取能力。依 `web-perf` 技能規則，未啟動 DevTools trace，也沒有用靜態圖片大小或一般頁面載入代替 LCP／CLS。首頁、作品列表、重點作品詳情及 Journal 各三次冷載入的前後比較：**未量測／待驗**；viewport／DPR 下 `currentSrc` 與請求鏈也未取得。沒有新增套件或付費服務。

隔離候選內重新檢查八個舊圖片 bytes 範例檔（靜態 Hero 原圖及 API Hero 1600／2560 候選、敦煌原圖與 640 候選、寶藏巖原圖與 640／1280 候選）：檔案大小大於 LFS pointer、Sharp 可解碼為 WebP，尺寸符合檔名。這只證明這些特定素材完整；沒有將它們轉為四頁完整效能比較，也不代表遠端 API 原圖以外的所有歷史輸入都已驗證。

本節之前的表格只保留為 2026-10-10 較早的「指定圖片檔案 bytes」紀錄，不是本次要求的四頁效能證據或 Core Web Vitals 基準。它們不包含每頁 LCP／CLS、LCP 元素、完整請求時序／總傳輸量、DPR 1／2 交叉檢查或使用者 INP；任何缺少來源素材的 HEAD 頁面比較均不採作有效前後結論。請勿將舊圖片 bytes 的百分比改寫成頁面速度／排名成效。

可重現步驟：先取得本次同一 commit 的完整 Git LFS 資產，核對原圖與衍生 WebP 可完整解碼、不是 LFS pointer；以同一瀏覽器版本、網路條件和成功 API fixture 啟動隔離的基準／候選站；對 `/`、`/portfolio/`、一個重點 `/portfolio/<slug>/` 與 `/journal/<slug>/` 各執行至少三次清除快取後重載，記錄原始 trace 與每頁中位數、CSS viewport、DPR、LCP／CLS、LCP DOM 元素、圖片 `currentSrc` 和尺寸、request initiator／時間鏈、請求數及傳輸 bytes。若要稱作真實使用者 CWV，另須取 Search Console／field provider 的足量樣本；INP、排名與 AI 引用需分別由真實互動或帳戶資料驗證。

## 方法與限制

- 瀏覽器：Chrome，Windows；CSS viewport 390 × 844、DPR 1.25。成功 API fixture 相同，無快取靜態 fixture server 對圖片回應 `Cache-Control: no-store`。
- HEAD 版本由 HEAD 來源加已追蹤圖片重建；候選版由本輪明確列出的來源與衍生圖在隔離目錄建置。每個比較頁面做 3 次冷頁載入；下表列出每次觀測值，三次相同，因此中位數等於該值。
- bytes 是瀏覽器實際選中圖片檔案的磁碟位元組數，不含 HTTP 標頭，也不是完整頁面傳輸量。首頁的基準列加總原本靜態首圖與 API 選圖原圖，因 HEAD 版在 hydration 後另下載 API 原圖；候選版同一張 API Hero 照片映射到已解碼的本機候選，啟動時只請求一次。
- LCP、CLS、INP、完整 Lighthouse／DevTools trace 及正式訪客 CWV **未量測**。本機載入或圖片 bytes 不能代替現場 Core Web Vitals。

## 冷載入圖片證據

| 頁面／觀測 | HEAD：每次（1／2／3） | 候選：每次（1／2／3） | 中位數 bytes（HEAD → 候選） | 變化 |
| --- | --- | --- | --- | --- |
| 首頁啟動 Hero 圖片集合 | `hero-2560.webp` 211,838 + API 原圖 1,061,654 = **1,273,492** | API Hero 本機 `hero-api/ce98…-1600.webp` = **75,384** | 1,273,492 → 75,384 | 減少 1,198,108 bytes（94.08%） |
| 作品總覽首張 API 封面 | `_I7A7401.webp` **812,636** | `_I7A7401.seo-640.webp` **72,146** | 812,636 → 72,146 | 減少 740,490 bytes（91.13%） |
| Journal「寶藏巖人像外拍指南」封面 | `cover.seo-1280.webp` **142,386** | `cover.seo-640.webp` **63,574** | 142,386 → 63,574 | 減少 78,812 bytes（55.35%） |

候選首頁的重複來源檢查記錄一次 75,384-byte Hero 請求，輪播其餘照片尚未設定 `src`，依原本切換時序才載入。瀏覽器在 390 × 844 實際選到 Hero 1600 候選；768 × 1024 和 1440 × 900 實際選到 2560 候選。三個指定 viewport 都沒有水平溢位，Hero 高度等於首屏高度。此時 Chrome 的實際 DPR 為 1.25，故本次沒有 DPR 1 與 DPR 2 的獨立 currentSrc 比較。

作品總覽上的 API 首圖對應公開 snapshot 中敦煌作品 API 選定的 `_I7A7401.webp`；候選保留同一檔名與照片，只選擇較小變體。全體 29 組公開封面中 18 組和靜態 catalog 封面不同，成功 fixture 的首頁與作品總覽重驗沒有以 catalog 圖覆蓋 API 選圖。Supabase Image Transformations 試探回覆 403／JSON，因此本輪沒有把該轉圖端點接入使用者請求。

## 作品內頁與剩餘瓶頸

「學院風棚拍」內頁在候選 390 × 844 首屏實際選到 640px 衍生圖；後續 gallery 仍有原尺寸照片，並依 lazy-load 門檻載入。HEAD clean build 對部分 `.seo-640.webp` 引用缺少相應產物，無法形成同一張圖片的有效前後原始 bytes 比較，因此不報該頁百分比。候選版本的 strict asset scan 通過，WebP 全部可解碼。

這些數據證明指定冷頁載入的圖片檔 bytes 降低，不證明 LCP 或使用者體驗分數已達門檻。後續若要補 CWV，需對同一發布版本在 DevTools／Lighthouse 記錄至少三次 LCP、CLS 與資源 trace，另以 Search Console 或其他實際 field provider 查看正式訪客資料；INP 需有足夠真實互動樣本。未取得資料前維持「未量測／未取得」。
