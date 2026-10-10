# SEO / AIEO W01–W10 交付紀錄

執行日期：2026-10-10（Asia/Taipei）

交付範圍：本機程式、內容、圖片衍生檔與驗證；變更在驗證後提交並推送至 origin/main。沒有執行 Cloudflare deploy，也沒有操作外部帳戶、正式資料庫或搜尋引擎。

## 最終摘要

- 修正 A01：六組作品的六張封面與 24 張代表照片逐張比對；九篇 Journal 封面替代文字一併核對。原照片、slug 與作品順序保留。羽翼之間保留 catalog 原拍攝類別，只移除未有紀錄支持的棚內燈光敘述。
- 修正 A02：API 選定的 cover 原樣保留；本機圖片使用 manifest 尺寸與 WebP 候選，符合格式的公開 Supabase portfolio cover 會提供 640、960、1280px transform 候選，候選失敗回到 API 選定的原圖。原 API 成功回應無法在本環境重新取得，因此公開上傳 cover 的實際 ID 與遠端轉檔回應仍未核實。
- 修正 A03：首頁與作品總覽輸出完整 29 組 slug→route map。隔離建置驗證 29 個專頁；重排三組原先不在首頁靜態精選內的作品後，瀏覽器預覽中的卡片直接連到專頁。
- Core Web Vitals（LCP、INP、CLS）未量測；沒有填入推估值。搜尋排名、索引與 AI 引用結果未在本次核實。

## W01–W10 狀態

| 工作包 | 狀態 | 完成內容與限制 |
| --- | --- | --- |
| W01 舊作品入口 | 完成（本機） | 已知作品的舊 collection 入口可轉到靜態專頁；未知 slug 留在總覽處理。首頁與總覽使用完整路由 map，所有 29 個目標頁都通過建置檢查。正式 Worker 尚未部署。 |
| W02 網域與 canonical | 部分完成 | 固定 canonical、metadata、語言、Open Graph、Twitter 圖片、sitemap 與私人頁排除通過本機檢查。Cloudflare HTTP／www redirect 仍需網域帳戶管理者設定與驗證。 |
| W03 作者與品牌實體 | 完成本機檢查 | 作者、服務、文章及作品 schema 使用穩定 ID，文章作者連到攝影師頁。合作條件沿用站上已公開內容；未寫入正式資料庫。 |
| W04 作品內容 | 完成本機內容 | 核對 29 組 catalog；六組完整作品解讀已修正照片描述及相關連結。沒有從照片推測未記錄的拍攝故事或類別。 |
| W05 既有文章 | 完成本機內容 | 六篇既有 Journal 補上準備順序、比較、作品示例、清單與合作連結；封面文字已按實際照片更新。 |
| W06 場地指南 | 完成本機內容 | 古亭河濱、寶藏巖、信義夜拍三篇指南已建置，附官方來源、查核日期與管理限制；正式發布狀態未核實。 |
| W07 圖片描述與載入 | 本機完成；遠端 API 尚待實測 | 補上動態 portfolio cover 候選和尺寸回退；靜態圖片與 Hero 有尺寸／responsive source；strict 套件檢查通過。真實 Supabase API cover 的身份與實際轉檔服務未核實，CWV 未量測。 |
| W08 Sitemap／AI 索引入口 | 完成本機檢查 | Sitemap 有 44 個 URL，9 篇已發布 Journal 使用 frontmatter 日期作 lastmod；llms.txt 連結有效；private／draft 排除檢查通過。 |
| W09 事件與外部設定 | 部分完成 | Google Form CTA 有 inquiry_click 與位置標記，尚無 GA4／GTM provider 或 Measurement ID，因此沒有送出事件。Search Console、Bing Webmaster 與外部 redirect 待有權限者操作。 |
| W10 建置與互動驗證 | 完成（隔離本機） | 48 個 Node 測試通過；Astro 建置 55 頁；route map、strict SEO、strict Worker assets、Wrangler dry-run、首頁／總覽 fixture 與三種尺寸 smoke check 通過。正式 Worker、API bindings、排名和 CWV 不在此本機證據範圍。 |

## A01–A03 修正與重驗

### A01：照片文字

六組作品的封面、24 張代表照片，以及九篇文章封面逐張核對。更新可見的姿勢、服裝、場景和道具描述，包括古亭河岸姿勢、寶藏巖欄杆／座椅／窗框、師大制服照姿勢、信義聖誕照道具、學院風照片姿勢與羽翼之間戶外背景。保留原照片、公開 slug、作品順序及原 catalog 拍攝類別。

### A02：API 圖片

以本機成功回應 fixture 驗證首頁 12 張 API 卡片及總覽 29 張卡片；API 回傳的 cover 路徑在重建卡片後保持不變。可縮小圖片有 srcset，動態圖片載入後取得自然尺寸；遠端 Supabase 儲存路徑有轉檔候選，錯誤時清除候選並回到精確的 API cover。

fixture 由已提交的 portfolioCatalog 建立，資料形狀符合 API response，但不是本次取得的即時公開 API snapshot。公開 API 的實際封面 ID、轉檔是否在該 Supabase 專案啟用，仍待有外部讀取權限時檢查。

### A03：完整作品 route map

首頁和總覽在 SSR 輸出由全部 catalog 建立的 route map。route verifier 確認 29 個 HTML 專頁與兩個 map 一致；單元測試與瀏覽器重排樣本確認「兔耳奇遇」、「晴空旅人」、「海風來信」直接連到建置頁。真正沒有靜態頁的未知 API slug 保留 query fallback，不會猜測不存在的 route。

## 驗證結果

| 檢查 | 實際結果 |
| --- | --- |
| npm test | 48 passed、0 failed，含成功 API fixture、cover 保留、remote candidate fallback、route map 與兩種 Hero 失敗情境 |
| 隔離 Astro build | 成功，55 頁輸出到暫存 validation 目錄；未覆寫根目錄 dist／.astro／worker-dist |
| 作品 routes | 29 個專頁與首頁／總覽 map 全部相符 |
| strict SEO verifier | 55 頁、44 sitemap URLs、1,449 站內連結、1,223 張 HTML 圖片、0 張缺尺寸、41 個 JSON-LD 區塊、9 篇已發布文章、15 個 llms 連結、0 failures |
| strict Worker verifier | 從隔離 worker-dist 驗證，以上頁面／連結／圖片統計一致，0 failures；資產以隔離副本方式複製，不使用可能連到共享原照的 hard link |
| Wrangler deploy dry-run | 使用隔離設定成功；讀取 1,320 個 Worker 靜態資產；Worker script 129.39 KiB（gzip 29.74 KiB）。這是 dry-run，沒有 deploy |
| npm run dev | 隔離設定啟動成功；首頁 HTTP 200，HTML 含 Hero 與 FAQ |
| 成功 API fixture 瀏覽器驗證 | 首頁 12 張、總覽 29 張；重排前 3 組都使用既有專頁 URL；保留 API cover 並有尺寸／候選 |
| 手機 390×844 | Hero 844px；文件寬 375px，無水平溢位 |
| 平板 768×1024 | Hero 1024px；文件寬 753px，無水平溢位 |
| 桌面 1440×900 | Hero 900px；文件寬 1425px，無水平溢位 |
| FAQ／首頁錨點 | FAQ 可展開；首頁精選錨點導向 /#portfolio |
| Hero 失敗路徑 | 候選失敗會回原圖；原圖也失敗時保留已顯示的第一屏媒體，兩種情境均由實際使用的 helper 單元測試覆蓋 |
| Core Web Vitals | 未量測；沒有 Lighthouse／現場數據，不宣稱改善或分數 |

隔離預覽位址為 http://127.0.0.1:4173/；Astro dev 位址為 http://127.0.0.1:4321/。兩個暫存伺服器與 validation 目錄在本次交付結束時清理。重現 build 時請使用新建的隔離輸出目錄，不要指定或清除含既存變更的根目錄 dist、.astro、worker-dist。

## 主要修改檔案

- 作品與圖片：src/data/portfolioEditorial.ts、src/data/portfolioCatalog.ts、src/data/image-variants.json、src/lib/image-variants.ts、src/lib/portfolio-routes.ts、src/components/Portfolio.astro、src/components/PortfolioDetail.astro、src/pages/portfolio/index.astro、src/components/Hero.astro、src/lib/hero-images.ts。
- 文章與 schema：src/content.config.ts、src/content/journal/、src/pages/journal/index.astro、src/pages/journal/[slug].astro、src/pages/about.astro、astro.config.mjs、src/styles/journal.css。
- W01／驗證／Worker：server/portfolio-legacy-redirect.js、worker.js、wrangler.jsonc、scripts/verify-portfolio-routes.mjs、scripts/generate-seo-image-variants.mjs、scripts/verify-seo.mjs、package.json、tests/portfolio-public-content.test.js、tests/portfolio-legacy-redirect.test.js、tests/fixtures/。
- CTA、公開內容和文件：src/components/Contact.astro、Dates.astro、Header.astro、Plans.astro、src/pages/behind-scenes.astro、cooperation.astro、index.astro、public/llms.txt、docs/SEO-AUDIT.md、docs/SEO-SETUP.md、docs/SEO-CONTENT-SOURCES.md、docs/SEO-EXTERNAL-SETUP.md、docs/SEO-AIEO-DELIVERY.md。
- 圖片衍生資產：52 張 1280px SEO WebP variant（共約 6.59 MiB）；既有原圖未覆蓋或刪除。

工作目錄中與本次 SEO 修正無關的 admin feedback 修改、原有 dist／.astro 變更、驗收／規格輸入文件，以及未追蹤原始照片均保留，不納入本次提交。作品集目錄目前仍有 2,238 個未追蹤圖檔（2,174 JPEG、64 PNG），均未納入本次提交；另提交 52 個 SEO 衍生 WebP。需從 GitHub 獨立建置／部署的資產完整性須以正式資產來源或另行授權的資產同步範圍確認。

## 外部待辦與界線

- Cloudflare apex HTTP、www redirect 與正式 Worker 路由需由持有網域帳戶權限者設定，再依 SEO-EXTERNAL-SETUP.md 驗證。
- GA4／GTM provider 尚未設定；目前只加事件標記，沒有收集資料或宣稱轉換。
- Search Console、Bing Webmaster、索引、搜尋排名、AI 搜尋引用與合作轉換尚未查核。正式上線及後續效果不可由本機 build 推論。
- 即時公開 portfolio API fixture 與 Supabase 圖片轉檔服務需要外部 API 可讀取時再核對；本次只證明本機 response fixture 與候選／回退程式路徑。
- 本次變更已推送至 origin/main；沒有執行 Cloudflare deploy。
