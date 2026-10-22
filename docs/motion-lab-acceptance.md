# Motion Lab 本機交付與驗收

更新：2026-10-23（台北時間）。此頁仍是獨立開發預覽，並非已發布的首頁。

## 預覽與範圍

- 工作目錄：`C:\Users\chuaj\OneDrive\Desktop\phox999-site\.motion-lab-work`
- 本機分支：`codex/motion-lab-20261022`，以 `origin/main` 的 `1436c55` 為起點。
- `dev` 整合基底：`d481f87`，承接 main 的合作回饋面板背景修復；推送狀態以 Git 遠端紀錄為準。
- 一般預覽：<http://127.0.0.1:4322/lab/motion/>
- 調參與素材資訊：<http://127.0.0.1:4322/lab/motion/?debug=1>
- 明確選擇模式：`?mode=cinematic`、`?mode=max`、`?mode=lite`、`?mode=static`。
- `lock=1` 停用自動效能降級供量測；一般瀏覽不需要此參數。
- CTA 使用目前 main 的 `/#contact`；已實際點擊並確認抵達首頁表單，未送出資料。
- 未修改正式首頁、後台、API、資料庫或照片原檔；此文件記錄本機驗收，未手動部署正式站。

依使用者後續要求，視覺沿用 main 的白底、淺藍底、`#63BADF` / `#3a81a0`、Noto Sans TC / Noto Serif TC / Outfit 與膠囊導覽。一般頁移除英文過場標籤、幕次、素材提示與構圖輔助線，文案精簡成首頁內容。首屏標題取自既有 `defaultHeroContent.title`。Dev 面板和素材資訊僅在 `debug=1` 顯示。

## 實作

- 七幕共用 sticky stage、GSAP/ScrollTrigger 主 timeline 與單一 ticker。
- Cinematic、Max、Lite、Static；手機預設 Lite，系統 reduced motion 預設 Static，明確的模式 query 可覆寫。
- 首頁式導覽、鍵盤可操作的原生連結與按鈕、可逆捲動與章節深連結。
- 六組作品解析既有 `portfolioCatalog` 的標題、alt、路由與已存在的縮圖清單。
- 延遲載入 Three.js、單一 canvas、共用 plane geometry、當前與相鄰 texture 載入；照片以 cover 裁切維持比例。
- FX 互斥、shader、粒子、游標、磁吸內層、CSS fallback；FX12 無 depth map、FX19 未確認字體寬度軸，均停用並說明。
- 視覺參數 query/localStorage、Reset、分享網址、DPR/曝光/色散/粒子/人物位置縮放與模式鎖定。
- Max 平均 tick 間隔持續超過 25 ms 三秒後，依序降低 DPR、關閉景深/粒子、切換 Lite；本次瀏覽不自動升級。
- 分頁隱藏時停止 render；切換模式與離開頁面清除 ticker/listener/observer/texture/material/geometry/renderer；BFCache 返回時重建。
- WebGL import 或 texture 超過 12 秒、初始化失敗、context lost 時回到 CSS 作品列。
- `noindex, nofollow, noarchive` 且不進入 sitemap。

依賴已經使用者同意，lockfile 記錄 `gsap 3.15.0`、`three 0.186.1`。Vite 的 Three.js chunk 警告仍保留；它是延遲載入的獨立 chunk，未調高警告門檻掩蓋。

## 驗證紀錄

| 檢查 | 結果 / 證據 |
| --- | --- |
| `npm run dev -- --host 127.0.0.1 --port 4322` | 可啟動並在瀏覽器操作；排除大量生成縮圖與 `.motion-dist` 的監看後，未再出現 EMFILE |
| `npm run build -- --outDir .motion-dist` | 59 頁建置成功；縮圖 2,748 張全部重用 |
| `verify:seo -- --dist .motion-dist --strict-dist` | 59 頁 / 45 sitemap URL / 1,682 links / 1,230 images，無失敗或缺少尺寸 |
| `verify-portfolio-routes.mjs --dist .motion-dist` | 29 組作品路由與對照表通過 |
| Motion Lab config tests | 3 / 3 通過 |
| 全套測試，序列執行 | 127 / 128；未改動的 `tests/site-analytics-client.test.js` mock 缺少 `addEventListener`，仍失敗 |
| 全套測試，預設並行執行 | 曾出現第二項 analytics lifecycle 時序失敗；單獨及序列重跑通過，記為既有不穩定測試 |
| 七幕深連結與刷新 | 1280 × 720 各幕可到達，展廊 54% 時 1 個活躍 canvas |
| 首頁式導覽與 CTA | 導覽可到共創幕；CTA 抵達 `/#contact` 且找到表單 |
| 瀏覽器主控台 | 測試路徑未擷取到 error |
| FX06 / FX22 | 勾選球體時展廊自動取消；DOM canvas 數維持 1 |
| 模式切換 5 次 | 每次 Static 均 7 幕可讀、0 活躍 WebGL；DOM canvas 數維持 1 |
| 參數與重整 | 人物幅度以鍵盤改為 1.05×，重整保留；Reset 回到 1.00× / 一般預覽 |
| 分享設定 | 按鈕顯示複製成功；剪貼簿內容未由工具成功讀回，不宣稱已驗證實際貼上 |
| Lite | 4 個效果，0 活躍 WebGL，CSS 作品列可見 |
| 橫向溢出 | 836 × 923 與 1280 × 720 檢查未溢出；390 × 844 尚未實際測試 |

這些證據未涵蓋真實手機、Safari/Firefox、OS reduced-motion 切換、無 JS 瀏覽器、強制 context lost 與 CPU throttle。無 JS 的語意內容已在產出 HTML 中保留；不以 Static 測試冒充無 JS 瀏覽器驗收。五次模式切換只證實 canvas 狀態，不代表完整 renderer/trigger/listener 計數或記憶體洩漏驗收。

## 效能補充量測

條件：同一台 Windows 電腦、Codex 內建 Chromium、viewport 1280 × 720、device DPR 1、Cinematic、`lock=1`、展廊進度 54%。每輪重新整理，等 texture 載入後至少 3 秒讀取面板。CPU/GPU 型號未記錄。原始結果見 [performance-samples.json](motion-lab/performance-samples.json)。

此處是 GSAP ticker 最近 120 個回呼的間隔與 callback FPS，**不是 GPU render time、整段捲動 trace 或 Core Web Vitals**。不能直接以 120 fps 判定裝置等級。

| 輪次 | callback FPS | tick p50 | tick p95 | JS heap | 活躍 canvas |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 120 | 8.0 ms | 9.0 ms | 21.8 MB | 1 |
| 2 | 120 | 8.0 ms | 9.0 ms | 22.4 MB | 1 |
| 3 | 120 | 8.0 ms | 9.0 ms | 17.7 MB | 1 |
| 中位 / 最差 | 120 / 120 | 8.0 / 8.0 ms | 9.0 / 9.0 ms | 21.8 / 22.4 MB | 1 / 1 |

沒有同條件的修改前樣本，因此不提供虛構的效能改善百分比。Max 各個 FX 的增量成本、完整捲動、手機 Lite 與前後對照仍待專用追蹤。

產出檔案量測：首屏 entry JS gzip 約 57.9 kB（目標 ≤150 kB，不含延遲 Three.js）；Hero 壓縮圖片 20.9 kB，六組縮圖合計 122.5 kB（均低於 2 MB）。六組來源解碼尺寸為五張 384 × 576 與一張 384 × 256；GPU 使用 cover UV 裁切維持比例。字體沿用 main 的 Google Fonts，另有字體網路成本。已核對正式首頁與 admin 的產出 HTML 都沒有載入實驗頁 entry。

Chrome DevTools MCP 未提供；已讀取的 web-perf skill 規定："If unavailable, STOP—the chrome-devtools MCP server isn't configured." 因此沒有以其他數字冒充該 skill 的正式 trace / CWV 稽核。若要補齊需先提供 Chrome DevTools MCP。

## 七幕截圖

截圖為 1280 × 720 的章節中段，並非規格指定 1440 × 900 / 390 × 844 的邊界驗收。

1. [首屏](motion-lab/scene-01.png)
2. [拍攝理念](motion-lab/scene-02.png)
3. [作品回框](motion-lab/scene-03.png)
4. [作品展廊](motion-lab/scene-04.png)
5. [風格](motion-lab/scene-05.png)
6. [拍攝流程](motion-lab/scene-06.png)
7. [合作邀請](motion-lab/scene-07.png)

## 素材缺口與驗收限制

目前只有完整作品照，沒有同尺寸對位的 `hero-subject.webp`、`hero-background.webp`、人物可見包圍盒與臉部安全區。沒有生成或替換模特身分。前三幕目前移動/縮放的是同一張完整照片；透明人物與背景精確重組、髮絲邊緣、DOM/WebGL 完全一致的投影交接仍屬**部分完成**，不能稱最終人物效果已驗收。

FX17 採遠近照片的多點 blur 與半解析度，而非完整物理鏡頭景深。FX13 是 SVG displacement 過場；FX14 是照片 dissolve shader 搭配程序粒子。尚未量測每項效果的獨立成本。

## 改動檔案與執行

新增：`src/pages/lab/motion/index.astro`、`src/styles/motion-lab.css`、`src/scripts/motion-lab.ts`、`src/lib/motion-lab-config.js`、`test/motion-lab-config.test.js`、本文件與截圖。

修改：`package.json`、`package-lock.json`、`astro.config.mjs`、`scripts/verify-seo.mjs`。SEO verifier 接受 main 現有的 `/#contact` 並檢查 noindex 頁不得出現在 sitemap。

```powershell
Set-Location C:\Users\chuaj\OneDrive\Desktop\phox999-site\.motion-lab-work
npm run dev -- --host 127.0.0.1 --port 4322
```

一般 Cloudflare Pages 流程仍是 `npm run build` / `dist`。此次用獨立 `.motion-dist` 驗證以便本機檢查；隔離目錄內保留建置/cache 產物，提交時只可選上述 reviewed source 路徑，不得整批加入照片、dist、.astro 或工作目錄。未手動部署或更動正式首頁；Git 推送是否觸發自動預覽需另行確認。

下一步優先取得對位素材，完成手機/瀏覽器與正式 performance trace，再決定是否將任何效果導入 main。
