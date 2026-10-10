# SEO／AIEO 第二輪驗收補修交付

查核日期：2026-10-10（Asia/Taipei）
基準 Git HEAD：`2cc74f0439d61a322ddb70d26b63ffd7a11b2190` (`main`)
範圍：本機內容、分類鏡像、來源／效能紀錄和隔離驗證；沒有修改正式作品資料庫、Cloudflare DNS／設定、GA4、Search Console 或 Bing。未執行手動 Worker deploy。

## 狀態摘要

| 項目 | 狀態 | 證據與限制 |
| --- | --- | --- |
| 學院風照片 alt／caption／文章封面 | **已驗證通過** | 直接檢視 `public/assets/portfolio/學院風棚拍/01.webp`；人物全身站立、雙手自然垂在身側。作品頁及 Journal 頁輸出新 alt，圖片均載入。六張封面、24 張代表照、九篇 Journal 封面按來源精確檔名重新檢查，未發現其他有原圖證據的錯誤。 |
| 三筆作品分類與靜態頁文字 | **已實作、隔離頁面驗證通過** | 以成功公開 API `category` 作已發布 slug 的權威值；列表／離線 fallback／直接詳情頁使用一致分類。slug、封面、照片順序、標題及其他有效後台文案保留。公開 API 的兩段說明文仍與分類用語衝突，因不修改正式資料庫而保持原樣，見下方外部待辦。 |
| 頁面 LCP／CLS／資源鏈效能比較 | **未量測／待驗** | 本工作階段沒有 Chrome DevTools MCP trace、network waterfall／timing 或 HAR 工具。未取得四頁各三次冷載入原始值／中位數、LCP 元素、總傳輸量或 DPR 1／2 currentSrc；沒有以圖片 bytes 代替效能證據。 |
| 兔子作品數量 | **已驗證通過** | 本機原圖 139 張 JPG；有相同檔名的 139 張非衍生 WebP。公開 API 的 `totalImages` 與 `images.length` 都是 139。靜態詳情頁 `selectionSize=40`，依既有均勻取樣選 40 張。4 張 `.seo-*` 是尺寸衍生圖，不算新增照片。先前「43 張 gallery」不能代表原圖總量或實際頁面選圖，已按此口徑更正。 |
| `d1c9ae5` 管理頁連結 | **範圍已查明、保留** | 只將 `src/pages/admin/feedback.astro` 的「查看前台」href 從 `/feedback/` 改為 `/#feedback`；公開回饋區實際位於首頁 `id="feedback"`，專案沒有公開 `/feedback/` 路由。此為導向既有前台區塊的路徑修正，未改管理行為。本對話已有完成工作及直接 push 的使用者授權；未回滾或改動此檔。 |

## B01：照片描述修正

更正位置：

- `src/data/portfolioEditorial.ts`：`學院風棚拍` 的 `01.webp` alt 與 caption。
- `src/content/journal/what-is-tfp.md`：封面 `coverAlt`。
- `docs/SEO-CONTENT-SOURCES.md`：代表照與 Journal 封面核對紀錄。

三處均描述「模特兒全身站立，雙手自然垂在身側」。隔離 build 後，作品詳情頁及 Journal 封面兩者皆實際輸出新 alt，選用的 `01.seo-640.webp` 載入成功。另 30 張重點代表／封面影像依文件表列檔名目視覆核，只有 `01.webp` 有可證實的描述錯誤。原照片沒有被改寫、搬移或刪除。

## A02：公開分類規則與本地鏡像

2026-10-10 09:54:54 UTC 唯讀 GET `https://phox999.com/api/portfolio` 回 HTTP 200、29 組作品。對已發布 slug，公開 API 的 `category` 是權威分類；`src/data/portfolioCatalog.ts` 的分類是靜態詳情頁與 API 離線畫面的建置期鏡像，須依 API 更新。分類不從照片猜測，也不以本地值反寫正式資料庫。

| slug | API `category` | 本地詳情分類 | 更新後 SEO／可見分類 |
| --- | --- | --- | --- |
| `260827_敦煌 RE` | 棚拍 | 棚拍 | 「棚拍人像」；標題為異域造型棚拍人像；分類相關描述不再寫戶外。 |
| `260614_天使與惡魔 RE` | 外拍 | 外拍 | 「戶外人像」；標題由棚拍改為主題外拍；保留既有雙人主題描述。 |
| `小桃照片` | 外拍 | 外拍 | 「戶外人像」；分類由室內改為外拍，SEO 描述移除室內分類斷言。 |

隔離 dev 預覽的作品列表 badge／`data-category` 與三個直接詳情頁標籤、title、description 一致。後台原始 API copy 仍有兩處未修正的分類詞句：敦煌描述稱「戶外人像」，小桃描述稱「室內人像」。本輪保留這些公開 API 欄位，不改資料庫；有正式資料權限者仍需決定是否只修正文案而不動分類、封面或順序。

## B03：整頁效能

本輪未啟用 Chrome DevTools trace。四頁（首頁、作品列表、重點詳情、Journal）的三次冷載入中位數、LCP／CLS／LCP 元素、請求鏈／傳輸量及 DPR 1／2 currentSrc 均**未量測**。響應式 smoke check 是版面檢查，不是效能資料。

`docs/SEO-PERFORMANCE-BASELINE.md` 保留較早的指定圖片 bytes 歷史，並明確將它與本輪整頁指標分開。完成 trace 需先取得完整 Git LFS 素材、確認原圖與衍生 WebP 非 pointer 並可解碼，再於同一瀏覽器／成功 API fixture 對四頁各清快取載入至少三次，保存 trace 和原始值／中位數。具體欄位及重現步驟已列在該文件。實驗室結果不能代表真實使用者 INP／完整 CWV、搜尋排名或 AI 引用成效。

## B04：照片數量與既有管理差異

兔子專輯 `260126_兔子天橋 RE` 本機來源有 139 張 JPG，非衍生 WebP 一一對應 139 張；公開 API 的 `totalImages` 和 `images` 陣列也是 139。`portfolioCatalog.ts` 的 `selectionSize` 為 40，因此靜態詳情頁只呈現 40 張等距抽樣。4 張 SEO WebP 尺寸檔不是額外照片。舊交付的 43 張數字不再用作原圖或頁面選圖數。

`d1c9ae5` 中 `src/pages/admin/feedback.astro` 一行 href 差異已核對：`/feedback/` 改成 `/#feedback`。`src/pages/feedback.astro` 不存在，而 `src/components/Feedback.astro` 的公開區塊 id 為 `feedback`，所以新 href 導至現有首頁公開回饋區。這是單一連結目標修正，不是管理頁／回饋權限變更。對話先前已直接授權完成及 push 本次工作；此檔保留原樣，不回滾。

## 驗證

建置來源為基準 HEAD 的隔離 worktree：`.seo-round2-work-20261010/repair-build/`；將本次 6 個既有來源／紀錄檔覆入該 checkout 驗證。建置只寫入隔離 `.astro/`、`dist/`、`worker-dist/`，根目錄既有產物與照片不受影響。

- `npm.cmd test`：55 passed、0 failed。
- `npm.cmd run build:worker`：成功；Astro 產生 55 頁並完成 Worker asset preparation。
- `npm.cmd run verify:seo`：成功；55 HTML pages、44 sitemap URLs、1,449 links、1,223 images、41 schemas、9 Journal articles、0 failures。
- `npm.cmd run verify:worker`：strict dist 成功；相同頁面／資產計數、0 failures。
- `npm.cmd run dev -- --host 127.0.0.1 --port 4179 --strictPort`：隔離 dev server 啟動。
- Chrome in-app browser smoke：首頁、作品列表、學院風詳情、`what-is-tfp` Journal 在 390×844、768×1024、1440×900 CSS px 共 12 組載入；`scrollWidth` 等於 `clientWidth`，無水平溢位；首屏可見圖片均載入且沒有圖片錯誤。
- CTA：首頁 7 個 Google Form CTA 都指向 `https://forms.gle/8V17E3gPVf3NdEaY8`。頁內 anchor 目標存在；5 個 FAQ 問題可見，點開第一項後答案顯示。
- 作品分類：列表 API 離線 fallback badge 與三個直接詳情頁輸出相符。`npm test` 另覆蓋公開 API route mapping、失敗回原圖、Hero 候選與原圖都失敗時保留既有首屏等既有行為。
- 圖片檢查：封面／代表照檢視由 Sharp 解碼成功；`01.webp` 詳情與文章實際載入 `01.seo-640.webp`。8 個舊效能範例素材（靜態 Hero 原圖、API Hero 1600／2560、敦煌原圖／640、寶藏巖原圖／640／1280）均大於 LFS pointer 並成功解碼為 WebP；舊 bytes 保留作歷史圖片紀錄，不作新的整頁比較。

有一次受限執行的 Astro build 遇到 worktree `realpath` EPERM；改在獲准的隔離路徑執行後 build 與兩項 verify 均通過。Astro 顯示有新版提示；未安裝、未升級任何套件。

dev server 可啟動並提供頁面；本機 Astro dev 對 Worker-only `/api/site-content` 回 404（靜態頁 FAQ fallback 仍可展開），且共用根目錄的 Astro dev-toolbar 檔案位於隔離 Vite allow-list 外。此 smoke 不作 Cloudflare Worker runtime 證明；Worker 功能依 Node tests、build 與 strict asset scan 驗證。

## 正式站與外部待辦

2026-10-10 約 17:54–17:56 Asia/Taipei 的唯讀檢查結果記於 `docs/SEO-EXTERNAL-SETUP.md`：

- Apex HTTPS 首頁、作品列表、三個重點作品、Journal、`sitemap-index.xml`、`robots.txt` 和公開 API 都回 200；公開 API 有 29 組。這表示第二輪已有部分資料／頁面可在正式站讀取，不代表本次補修已發布；當時正式詳情頁 title 仍含舊分類詞，Journal cover alt 仍寫「雙手抬到額前」。
- Apex HTTP 首頁仍回 200 且沒有 `Location`；`www.phox999.com` DNS 不存在，HTTP／HTTPS www 無法連線。
- 首頁 HTML 沒有 GA4 `G-...` Measurement ID，也沒有實際 Google Analytics `<script src>`；未讀取 GA4 DebugView／Network 收件資料，事件接收未驗。
- Search Console／Bing 帳戶驗證、sitemap 提交、URL inspection／索引證據均未取得；公開 sitemap 200 不是提交或索引證明。
- 唯讀 Wrangler 報告當時 serving version `18297947-c7fa-44ba-a67a-77c267c68aa4`，100% traffic，建立於 2026-10-10 09:19:34 UTC；結果沒有對應 Git SHA，不能歸因本次補修。沒有手動 deploy。

待辦是：Cloudflare proxied `www` DNS 與 HTTP→HTTPS／www→apex redirects；既有 GA4 ID 的環境接線與 DebugView 單筆事件驗收；Search Console／Bing 的既有帳戶驗證、提交 sitemap 和索引抽查；取得 Chrome DevTools MCP 後完成效能 trace；由有權限的人檢視 API 中敦煌／小桃兩段分類詞句。未建立帳號、升級付費方案、修改正式資料庫或送出合作表單。

外部資料讀取命令依 [Cloudflare Wrangler deployments 文件](https://developers.cloudflare.com/workers/wrangler/commands/workers/)的唯讀 `wrangler deployments status`／`list` 用法；未執行部署命令。
