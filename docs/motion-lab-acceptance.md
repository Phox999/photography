# Motion Lab 修正回合驗收紀錄

更新：2026-10-23（台北時間）。這是獨立 Dev 實驗頁，不替換正式首頁。工作目錄為 `C:\Users\chuaj\OneDrive\Desktop\phox999-site\.motion-lab-work`；修正分支以目前 `dev` 的 `a714a87` 為基底，分支與修正 commit 見本次交接。

## 預覽與範圍

- 路由：`/lab/motion/`；Cinematic 預覽：<http://127.0.0.1:4323/lab/motion/?mode=cinematic>。
- 執行 `npm run dev -- --host 127.0.0.1 --port 4322` 時，4322 已被其他程序占用，Astro 自動選用 4323。伺服器曾回報 ready；Codex 內建瀏覽器連線至 4323 逾時，所以本回合沒有取得最新畫面截圖，也沒有視覺驗收證據。使用自己的本機瀏覽器開啟上方網址。
- 不改正式首頁、後台、API、資料庫或原始照片。Motion Lab 有 noindex，並從 sitemap 排除；建置 HTML 確認首頁及 admin 未載入 Motion Lab bundle。
- 模式網址：`?mode=cinematic`、`?mode=max`、`?mode=lite`、`?mode=static`。Dev 面板：`?debug=1`。

## 本回合修正

- 作品素材處理器從現有原照輸出 960 與 1600 寬度 WebP，使用 `withoutEnlargement` 和 quality 88，寫入各圖實際輸出尺寸。前端 `srcset/sizes`、首屏 responsive preload、展廊與風格圖片尺寸都共用該資訊；生成檔忽略於 Git，dev/build 會從原始作品重建。原照片沒有修改。
- 前版 Hero 縮圖為 384 × 576 / 20.9 kB；目前 960px Hero 是 960 × 1440 / 47,362 bytes，1600px Hero 是 1600 × 2400 / 101,524 bytes，皆由 3648 × 5472 原照縮小輸出。六張 1600 變體合計 1,771,846 bytes；12 張 960/1600 變體合計 2,573,118 bytes。Windows 本機單次完整轉檔約 2,635 ms（含 Node 啟動）。這不是捲動或 GPU 效能數據，也沒有同條件的前版轉檔時間可比較。
- GSAP timeline 的實際呈現進度驅動畫面文字、場景、DOM/WebGL、攝影機與作品位置；攝影機往六個深度點移動。DOM fallback 使用量測後的相框與視角資料；texture 未載入並完成繪製時保留 DOM 相片。
- 目前人物分層仍阻塞。曾用你的藍色襯衫原照嘗試生成透明人物；輸出改變了裁切與手臂姿勢，無法精確疊回乾淨背景，因此未採用，`approved` 保持 `false`。目前仍是完整照片的受控 fallback，沒有把它列為人物跨幕動畫完成。素材接入契約見 `src/data/motion-lab-layers.json`。

## 自動驗證結果

| 檢查 | 結果 |
| --- | --- |
| `npm run build -- --outDir .motion-dist` | 通過，59 個頁面建置完成；Vite 仍提示延遲載入的 Three.js chunk 較大 |
| `node scripts/verify-seo.mjs --dist .motion-dist --strict-dist` | 通過；59 HTML、45 sitemap URL、1,688 links、1,240 images，0 缺尺寸或失敗 |
| `node scripts/verify-portfolio-routes.mjs --dist .motion-dist` | 通過；29 個作品路由 |
| `node --test test/motion-lab-config.test.js` | 通過，6/6；涵蓋場景邊界、預設效果、展廊進度反向數學、人物回位狀態與 cover UV |
| `npm test -- --test-concurrency=1` | 130/131；唯一失敗為既有 `tests/site-analytics-client.test.js` 測試 mock 缺少 `addEventListener`，錯誤在 `src/lib/site-analytics.ts:178`，未改動該 analytics 程式 |
| 輸出隔離與圖片標記 | 通過；Hero preload 有 responsive sources，6 張 DOM 展廊圖都有 width/height，首頁/admin 沒有實驗 bundle，noindex 存在 |

## 尚未通過的視覺／互動驗收

| 條件 | 狀態 |
| --- | --- |
| 1440 × 900 桌面、390 × 844 手機 | 未測；沒有可用截圖 |
| 首三幕各轉場 0/25/50/75/100%，人物與文字中段碰撞 | 未測；而人物素材未完成，跨幕人物體驗明確阻塞 |
| 正反向連續捲動五次、快速拖曳、章節跳轉、中段刷新 | 未測 |
| DOM/WebGL 對位、閃爍／重影、CSS fallback、風格場景不空 | 僅有程式與狀態數學檢查；沒有目視驗收 |
| CTA 與六個作品連結 | 靜態產出與內部路由檢查通過；未送出表單 |
| Lite、Static、OS 減少動態、WebGL 失敗、離頁後資源釋放 | 未做本回合瀏覽器 runtime 驗收 |
| 真實手機、Safari、Firefox、GPU frame time、完整捲動 trace / Core Web Vitals | 未測；GSAP ticker callback 不能代表 GPU 效能 |

只有建置與靜態檢查通過，不能據此標示整體視覺驗收完成。後續要解除核心阻塞，需取得同裁切／同尺寸的透明人物與移除人物補景，再在瀏覽器逐幕目視，留存連續捲動或關鍵轉場序列截圖。

## 日系首頁與動效修正補記（2026-10-23）

本次在獨立 worktree `C:\Users\chuaj\OneDrive\Desktop\phox999-site\.motion-lab-japan-work` 的 `codex/motion-lab-japan-20261023` 分支實作，基於 `8c1a8d8`。Dev 預覽為 <http://127.0.0.1:4325/lab/motion/?mode=cinematic>；未修改正式首頁、後台、API、資料庫或正式資料，也未推送或部署。

- Motion Lab 改為暖白、淺藍與霧綠底色，使用品牌字體、較大的圓角和半透明導覽／訊息卡；桌面主視覺與手機版各自排版。Cinematic 是預設展示；Max 的液態效果只在使用者選取該模式後提供。
- 場景與影像位置由同一個實際 scrub 進度更新。展廊以六個深度點推進鏡頭，DOM 相片 fallback 依量測後的投影框持續銜接，WebGL texture 就緒以前保留 DOM 圖像。新增 gallery 相機越過前一張作品的距離檢查與對應回歸測試。
- 風格幕使用主作品加兩張不同作品；交叉轉換採遮罩揭露以避免兩張臉重疊。Static／系統減少動態模式額外提供靜態三圖版面，避免主圖留在長頁首端而風格幕只有文字。
- 手機版導覽為可聚焦的單鍵選單，Escape 可關閉並把焦點還給按鈕；Lite 展廊保留單張主作品，不把整個故事換成小縮圖格。
- 人物去背素材仍未解除阻塞。生成輸出無法沿用原照的同一姿勢／裁切，沒有使用；目前 Hero 還是完整照片卡片的受控 fallback。因此「同一去背人物跨幕移動」仍未完成，也不能用整張照片平移宣稱完成。

### 實際畫面檢查

| 條件 | 結果 |
| --- | --- |
| 桌面 1440 × 900 Cinematic Hero | 通過目視；首屏主圖、主標題與 CTA 清楚，沒有水平溢出。 |
| 桌面理念幕（約 27%） | 通過目視；左側文案與右側相片保有閱讀空間。 |
| 桌面展廊（約 51.5%） | 通過目視；第一張作品與 DOM/WebGL 交接後相框連續，沒有重複的同圖或空場。 |
| 桌面風格幕（約 70.5%） | 通過目視；主圖及風格作品持續可見，標題沒有不自然的單字斷行。 |
| 手機 390 × 844 Static 風格幕 | 通過目視；三張圖和文案均在風格幕可見，卡片不互相覆蓋。 |
| 手機 390 × 844 Lite 展廊 | 通過目視；單張作品及標題可見；未在實體手機測試。 |
| 平板 768 × 1024 Cinematic | 通過目視；主圖與文字分區，無水平溢出。 |
| 五次連續往返、每段 0/25/50/75/100% 截圖、快速拖曳 | 未完整逐點驗收；現有證據是上述代表進度畫面與狀態數學測試。 |
| Safari／Firefox、實體手機、WebGL 故障注入、GPU frame time | 未測。GSAP ticker 不作為 GPU 效能數字。 |

### 本分支檢查結果

| 檢查 | 結果 |
| --- | --- |
| `node --test test/motion-lab-config.test.js` | 通過，7/7。 |
| `git diff --check`（限本次原始碼） | 通過。 |
| 全套 `node --test --test-concurrency=1` | 130/132；一項既有縮圖測試找不到 `423055bc110a53eb366187f3-384.webp`，另一項既有 site analytics 測試 mock 缺少 `addEventListener`（`src/lib/site-analytics.ts:178`），都不在本次變更。 |
| `npm test`／`npm run dev` 的前置產圖 | 被未水合的 Git LFS 原圖阻擋：Sharp 將 pointer 檔視為 unsupported image。已存在的高解析產物可供本地 Dev 預覽，直接啟動 Astro server 可瀏覽；標準前置流程和完整 build 尚未通過。 |
| Astro build | Vite 產生 Motion Lab 路由後，Windows 程序在產生作品頁期間異常終止；不得標示建置通過。 |

素材效能舊測量仍是：Hero 由 384 × 576 改用 960 × 1440（47,362 bytes），1600 × 2400 原尺寸變體為 101,524 bytes；完整六圖轉檔單次約 2,635 ms。沒有相同條件舊版轉檔時間、GPU 效能或瀏覽器長捲動 trace，不能比較成效百分比。以上瀏覽器檢查是在桌面瀏覽器設定指定 viewport 完成，未代表實機驗收。整體 Motion Lab 仍因人物分層未完成而不能列為完整通過。
