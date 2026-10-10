# SEO／AIEO 圖片效能基準

量測日期：2026-10-10（Asia/Taipei）。這份報告比較 Git HEAD 重建版與本輪隔離候選版。原照保留原位；效能候選使用新增的同照片 WebP 尺寸，不把不同照片換成較小封面。

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
