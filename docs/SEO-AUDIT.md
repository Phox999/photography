# Phox999 SEO 實作檢查紀錄

實作日期：2026-10-08；內容覆核：2026-10-09

## 專案與檢查範圍

網站以 Astro 靜態產生頁面，再由 Cloudflare Worker 的 Static Assets 提供頁面與 `/api/*` 路由。正式設定在根目錄 `wrangler.jsonc`；`npm run build:worker` 會先建置 `dist/`，再整理 Worker 使用的 `worker-dist/`。

```powershell
npm run dev
npm run build
npm run verify:seo
npm run build:worker
npx wrangler dev --local
```

`verify:seo` 需要先有 `dist/`。它檢查輸出頁面的 title、description、canonical、H1、圖片 alt、站內連結及錨點、圖片來源、JSON-LD、FAQ 初始內容與 schema 是否一致、robots.txt 和 sitemap。圖片可從 build 輸出或來源 `public/` 查找。也可用 `node scripts/verify-seo.mjs --dist <建置目錄> --public <public目錄>` 檢查隔離建置。

`npm run build:worker` 會重建 `dist/` 和 `worker-dist/`。在包含使用者未提交產物的工作目錄執行前，先確認這兩個輸出目錄可安全重建。Worker 本機預覽可驗證靜態路由與 404；若要驗證 API，需提供隔離的本機測試設定。不要把正式資料庫寫入當成預覽測試。

## 本輪修正

- FAQ 初始 HTML、動態畫面和 FAQPage JSON-LD 共用同一個 schema 產生器；空 FAQ 會隱藏區塊並移除 schema。
- 首頁 Hero、靜態 fallback 和舊版預設資料共用新文案；只有與舊預設值完全相同的 API 文案會轉成新預設，其他後台自訂文案仍保留。
- Markdown 清單粗體標記已補上分隔空格。
- Hero、作品集圖庫與封面、Behind Scenes、Journal 列表與文章封面，以及合作方案圖示，都在建置時讀取實際圖片尺寸並寫入 `width` 和 `height`，讓瀏覽器預留版面空間。
- Worker 靜態資產設定使用自訂 `404.html` 處理不存在的資產路徑。
- Portfolio 描述移除面向編輯者的「地點未記錄／不推測」說明，改以作品主題、服裝、光線和已記錄場景撰寫。
- 六篇 Journal 導言加入與本站公開合作流程一致的第一人稱說明，並保留實際作品連結；沒有加入未核實的拍攝故事。
- 互惠攝影指南補上目前公開的一般互惠規格：拍攝時長、服裝套數、交件數量與時間，並連回合作方式頁；文章更新日期同步標記為 2026-10-09。
- Google Fonts 樣式表從 `global.css` 的 `@import` 移至 HTML `<head>` 的 stylesheet link，讓瀏覽器讀取頁面時就能發現字體請求。
- Hero 加入 `srcset`／`sizes`，為 960、1440、2560px 螢幕提供對應 WebP；資料庫輪播指向原始 `/assets/hero.webp` 時也會改用響應式副本。原始照片和 OG 圖片路徑保留不動。

## 驗證結果

本輪使用隔離副本建置與預覽，沒有重建工作目錄裡既有的 `dist/`、`.astro/` 或 `worker-dist/`，也沒有變更作品照片。

隔離建置的 `publicDir` 刻意排除大型 `assets/portfolio/` 照片樹，避免複製或改寫原始照片；SEO 檢查器直接對照來源 `public/` 驗證這些圖片路徑。因此本次 build 驗證 Astro 頁面與標記，不是可直接部署的完整資產包。

| 檢查 | 結果 |
| --- | --- |
| Astro production build | 成功，輸出 52 個 HTML 頁面，含 29 個 Portfolio 與 6 篇 Journal |
| `npm run verify:seo` | 通過，52 頁、41 個 sitemap URL、1,317 個站內連結、1,217 張圖片參照、38 個 JSON-LD 區塊；靜態圖片尺寸缺漏 0 項 |
| Journal 內容覆核 | 六篇文章有明確問題導向、分段建議、相關文章／作品連結與合作入口；Roadmap 首批三篇各超過 1,000 個中文字元 |
| 合作 CTA | 所有「填寫合作意向／開始討論拍攝」連結都指向指定的 Google 表單 |
| FAQ | 本機瀏覽器點開第一題後，答案正常顯示 |
| 首頁與 Hero | 本機瀏覽器預覽首屏填滿視窗；Hero 圖有 `fetchpriority="high"`，CTA 使用合作意向表單網址 |
| 手機／平板／桌機 | 390×844、768×1024、1440×900 視窗皆無文件水平溢位；Hero 高度分別為 844、1024、900px。390px DPR 1 載入 960px 圖，DPR 3 載入 1440px 圖；1440px 桌機載入 1440px 圖 |
| Hero 圖片大小 | 原始 `hero.webp` 為 1,061,654 bytes；新增 960px／1440px／2560px 副本分別為 22,818／49,448／211,838 bytes。原始檔保留 |
| `npm run dev` | 隔離預覽已 ready；首頁與 `/assets/hero-960.webp` 都回傳 HTTP 200。Vite 同時印出 `aria-query`／`axobject-query` 模組解析錯誤；此項目未影響 production build，但本機 dev 診斷仍有環境限制 |
| 變更過的 TypeScript 資料模組 | 以已安裝的 `tsc --noEmit` 檢查通過 |

前一輪檢查發現 1,206 個圖片標記沒有 `width`／`height`；本階段已在 1,217 個靜態圖片參照中補齊，SEO 檢查器現在會把尺寸缺漏列為失敗。作品總覽的互動圖庫在瀏覽器端才建立圖片節點，不計入靜態 HTML 數量；其格線使用固定列高。無頭瀏覽器的 Google Fonts 外部請求被此執行環境拒絕，因此這次只能確認 stylesheet link 已輸出，不能確認 Google 字型實際下載；未執行 Lighthouse，也沒有正式流量的 CrUX 資料，所以沒有可報告的 CWV 效能分數。未在 Worker runtime 驗證正式 404 或 API 行為。檔期選取值會留在本頁供使用者參照；因為目前沒有 Google Form 預填欄位 ID，CTA 不能自動帶入日期，頁面已提示使用者在表單中註明。

Astro 的 `dev` 和 `build` 不執行 TypeScript 型別檢查。目前專案未直接安裝 `@astrojs/check`；因此 build 成功不代表型別檢查通過。性能分數也必須附上實際 Lighthouse 報告，不能由靜態 HTML 檢查推定。

## 發布後檢查

- Worker 發布後確認 `/robots.txt`、`/sitemap-index.xml` 和 `/llms.txt` 可讀取。
- 抽查首頁、Journal 與作品頁的 canonical、OG 圖片和圖片回應。
- 確認 `/admin/`、`/client/`、`/cooperation-status/` 不在 sitemap，並保留 `noindex`。
- 用不存在的路徑確認回應狀態為 404，且顯示自訂 404 頁。
- 以 Search Console 觀察檢索和索引；收錄、排名與 rich result 不由本機程式檢查保證。
