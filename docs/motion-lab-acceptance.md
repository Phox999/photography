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
