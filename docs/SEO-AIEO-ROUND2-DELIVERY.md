# SEO／AIEO 第二輪交付報告

執行日期：2026-10-10（Asia/Taipei）。依 `docs/SEO-AIEO-NEXT-LUNA-PLAN.md` 完成 R01–R06。本次範圍為程式、內容、衍生圖片、隔離建置與本機驗證；沒有部署 Worker，也沒有修改 Cloudflare、Google、Bing 或社群帳戶設定。

## 結果摘要

| 工作包 | 狀態 | 實際完成與界線 |
| --- | --- | --- |
| R01 可重建來源 | 已完成且重驗 | 對照 HEAD 與工作目錄差異；依精確引用清單加入必要 WebP，不加入原始照片；隔離候選和提交來源都重建、strict 驗證。既有 `dist/`、`worker-dist/`、`.astro/`、hooks 和原照修改未納入本輪提交。 |
| R02 API 封面／作品路由 | 已完成且重驗 | 用 2026-10-10 公開成功 API snapshot 重驗首頁、總覽與 29 組封面；另用清楚標示的合成遠端封面及重排 fixture 覆蓋缺少真實資料的案例。 |
| R03 圖片策略／效能 | 已完成且重驗；CWV 未量測 | Browser 實際 currentSrc 與冷頁圖片 bytes 有前後證據；LCP、CLS、INP 和 field CWV 未量測，沒有以檔案 bytes 推算分數。 |
| R04 內容品質 | 已完成且重驗 | 逐檔對照六組作品封面及 24 張代表照、九篇 Journal 封面；調整與照片不符描述、官方地點事實和搜尋意圖對應，沒有宣稱流量或排名。 |
| R05 SEO／Worker／發布來源 | 本機已完成且重驗；正式站外部待辦 | 55 頁 strict、29 路由、Worker 資產及 dry-run 通過；公開 redirect、DNS、搜尋帳戶和正式部署仍需有權限者操作。 |
| R06 量測接線 | 已實作且本機重驗；正式收件待辦 | 預設無 ID 時停用；stub 只發一筆 query-free `inquiry_click`。沒有 GA4 ID、正式收件或 Search Console／Bing 資料。 |

## R01：HEAD、工作目錄與必要來源

- 起始 HEAD：`01f552d2a085ce994e74ae996aa409a986f77dcf`（`main`）。核對時另區分本輪相關來源、使用者既有 `dist/`／`worker-dist/`／`.astro/` 與 hooks 變更，以及未追蹤原照和圖片素材。
- `astro.config.mjs` 的 Journal sitemap lastmod 優先取 frontmatter `updatedDate`，否則用 `publishDate`；draft 不進公開 sitemap；值固定為文章日期的 UTC 午夜，沒有用建置當天時間更新全站。
- HEAD 追蹤資產、候選引用 manifest、WebP 解碼和 Worker 打包一併核對。完成候選輸出有 3,096 個有效 WebP（約 1.73 GB），0 個 LFS pointer／解碼失敗；Worker 輸出亦為 3,096 個有效 WebP。Worker dry-run 讀取 3,289 個資產檔，0 個上傳。
- 本輪新增清單是 138 個被實際頁面引用的 WebP 衍生檔：112 個 SEO／作品圖片變體，加上 26 個 Hero API 尺寸候選；不把大量未追蹤 JPG／PNG 原照納入發布或 Git。候選全數保留原 API 封面照片身份。原照在工作目錄仍保留。
- 候選 build 在 `.seo-round2-work-20261010/candidate-final-build-hydrated/` 隔離完成；提交來源重建在 `.seo-round2-work-20261010/commit-source/`。兩者不寫入主目錄 `dist/`、`worker-dist/`。根目錄原有差異未覆蓋。

## R02：真實 API、封面與路由

- Fixture：[portfolio-live-2026-10-10.json](../tests/fixtures/portfolio-live-2026-10-10.json) 是唯讀成功 `/api/portfolio` 回應（HTTP 200，29 組；2026-10-10 16:03:43 Asia/Taipei）。18/29 個目前 API 封面與靜態 catalog 不同；總覽首張實際封面是敦煌 `_I7A7401.webp`。
- Fixture：[hero-live-2026-10-10.json](../tests/fixtures/hero-live-2026-10-10.json) 保存公開 Hero API 成功回應（10 個來源）。已建置相同原照 local Hero variants，候選失敗回到該 API 原圖；若原圖也失敗，保持現有首屏圖片。55 項測試包含兩層 fallback。
- 現況公開作品封面都是本站圖片，因此「API 選到遠端 Supabase 公開封面」另以 [portfolio-remote-cover-synthetic-2026-10-10.json](../tests/fixtures/portfolio-remote-cover-synthetic-2026-10-10.json) 明確標示的合成案例驗證；選定遠端 URL 保留、未知變體不替換原照。Supabase image transform 探測回 403／JSON，沒有接入已知不可用的轉圖請求，也沒有聲稱真實 API 當下有遠端封面。
- 成功 fixture 瀏覽器驗證：首頁及作品總覽 hydration 後仍使用 API 所選照片；總覽首張 currentSrc 為同圖 `_I7A7401.seo-640.webp`。完整 29 組 slug→route 映射與 build 後頁面由 `scripts/verify-portfolio-routes.mjs` 通過。
- 重排 fixture 將原先精選以外「兔耳奇遇」放到第一張；卡片直接前往其既有作品頁，頁面 H1 正確且顯示 43 張 gallery 照片。Worker preview 也驗證已知舊 query 301 保留 `utm_source`／其他 query；未知 slug 留在總覽，不猜作品頁。API 失敗和圖片 fallback 另由 `npm test` 涵蓋。
- [SEO-CONTENT-SOURCES.md](./SEO-CONTENT-SOURCES.md) 記錄六組作品及 24 張代表照的精確檔名對照、九篇文章 cover 對照、圖片用途和易變地點資訊的來源／查核日期。

## R03：尺寸策略及量測

- 本機 `sharp` 只為實際引用照片建立 640／960／1280 尺寸及 Hero 960／1600／2560 候選；不放大較小原圖。完整來源／穩定身份與 manifest 對應避免同名碰撞。轉圖端點不支援的遠端圖片保留原 URL fallback。
- CSS viewport 390 × 844／768 × 1024／1440 × 900 的 Chrome smoke 均無水平溢位，Hero 等高於首屏，currentSrc 真正選到候選。當次環境 DPR 1.25，DPR 1 與 2 未獨立測量。
- 前後冷載入圖片原始 bytes、重複次數、中位數及有效範圍見 [SEO-PERFORMANCE-BASELINE.md](./SEO-PERFORMANCE-BASELINE.md)。首頁啟動 Hero 圖片集合 1,273,492 → 75,384 bytes（−94.08%）；作品總覽第一張封面 812,636 → 72,146 bytes（−91.13%）；Journal 封面 142,386 → 63,574 bytes（−55.35%）。是三次相同觀測值的中位數，只代表圖片檔 bytes，不是整頁 bytes 或 CWV。
- LCP、CLS、INP、Lighthouse／DevTools performance trace 及正式 field CWV：**未量測**。學院風作品內頁有可見 640px candidate，但 HEAD 參照產物不完整，無效前後比較不報改善百分比。

## R04：內容與官方事實

- 六組作品共 30 張封面／代表圖，依精確檔名修正可見說明及 alt/caption；保留原照、slug、作品順序。同步核對九篇 Journal 封面，不推測照片無法證明的器材、拍攝經歷、對象或燈光。
- 修改 Treasure Hill 指南的地點資訊與回答方式，附官方來源、查核日期及可能變動的費用提醒；意圖對應表涵蓋首頁、合作條件、棚拍／外拍、姿勢、雨天及地點指南。內容沒有虛構流量、搜尋詞排名或 Google FAQ 展示承諾。
- 驗收清單與前一輪報告保留原樣；本輪結果另見本交付文件及來源文件。

## R05：建置、SEO strict 與 Worker

- 隔離 Astro build：55 HTML pages。`verify-seo.mjs --strict-dist`：44 sitemap URLs、1,449 internal links、1,223 image references、41 schema blocks、9 published Journal、15 llms links；dimensions 缺漏 0、failures 0。Portfolio route check：29 routes／首頁與總覽映射全數一致。
- Worker packaging 已在全新隔離輸出成功；同一 strict 結果、WebP 解碼 0 failure。Wrangler dry-run 讀取 3,289 files、script 129.27 KiB／gzip 29.74 KiB、exit 0，未上傳。Wrangler 曾印出寫入 AppData log 的 EPERM 訊息，但 dry-run 命令完成；此訊息不影響資產讀取結果。
- 隔離 Astro dev 在 `127.0.0.1:4178` 啟動；首頁 GET 200，title、Hero、CTA 存在。Worker preview 已驗舊 query、未知 slug；Astro dev 本身沒有用來代替 Worker API 驗證。
- 公開網域只做 GET：HTTP apex 200 無 Location；HTTPS apex 200；HTTP／HTTPS `www` 因 DNS 無記錄而無法解析。Cloudflare Free 目前官方 Single Redirect 配額為每 Zone 10 條，可用兩條 wildcard rule，不需升級；但沒有修改 DNS／規則，所以 canonical redirect **未完成**。具體 host 設定和驗證命令見 [SEO-EXTERNAL-SETUP.md](./SEO-EXTERNAL-SETUP.md)。
- Search Console／Bing 驗證、sitemap 提交、索引／canonical 檢查與 GA4 DebugView 收件待帳戶權限；Worker 正式 deploy 未執行。沒有宣稱已上線、已索引、排名或 AI 引用改善。

## R06：事件接線

- `PUBLIC_GA4_MEASUREMENT_ID` 未設定時不載入 provider，不發事件；存在時只經單一 click handler 傳 `inquiry_click`、`placement` 和移除 query 的公開 `page_path`。私人頁不初始化 GA4；事件不含表單內容或個資，也不阻止原 CTA 導覽。
- `npm test` 驗證缺 ID、單次 stub event、私人頁排除及 CTA 可用。這不是 GA4 正式收件證明。要完成正式量測需由帳戶管理者提供既有 GA4 Measurement ID 及 Worker build public env，再以 DebugView／Network 確認單筆收件；不要建立新帳戶或把 CTA 點擊當成表單成功。
- Search Console／Bing 的 7／28 日觀察表保留「未取得／待填」，不是 0。下一次觀察待正式部署、驗證網站並提交 sitemap 後開始。

## 程式與文件變更範圍

本輪提交只包含實際需要的程式、來源文件、測試 fixture／測試及其 manifest 列明的 138 個衍生 WebP（112 個 SEO variants＋26 個 Hero variants）。不包含：`docs/SEO-AIEO-NEXT-LUNA-PLAN.md`、歷史驗收／前輪交付文件、主目錄 build 輸出、`.wrangler-preview.log`、`hooks/`、未追蹤 JPG／PNG 原照、使用者既有 icons/process 原始圖。沒有新增套件或升級依賴。

驗證命令：

```text
npm test
npm run dev -- --host 127.0.0.1 --port 4178                 # 隔離候選來源
npm run build                                               # 隔離候選／提交來源
node scripts/verify-portfolio-routes.mjs --dist <isolated-dist>
node scripts/verify-seo.mjs --dist <isolated-dist> --strict-dist
node scripts/prepare-worker-assets.mjs --source <isolated-dist> --output <fresh-isolated-worker-dist>
node scripts/verify-seo.mjs --dist <isolated-worker-dist> --strict-dist
npx wrangler deploy --config <isolated-wrangler-config> --dry-run --outdir <fresh-temp-output>
```

Browser smoke 使用 public success fixture、重排 fixture及實際 Chrome currentSrc；未使用 production API 回應替代正式帳戶驗證。原始記錄與可重建目錄位於忽略的 `.seo-round2-work-20261010/`，不納入提交。

## Git 發布與正式環境狀態

Git 只推送本文件列明的本輪檔案及 WebP 衍生資產到 `origin/main`；提交完成後以遠端 `main` 與本地 HEAD 相同作為推送確認。**Worker deploy 不在本輪執行範圍內**，不應把 GitHub push 說成正式網站發布。Cloudflare DNS／redirect、Search Console、Bing、GA4 正式收件和發布後成效均列外部／發布後待辦。
