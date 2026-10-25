# PHOX999 本機畫面預覽

對照 Figma `Ra3AgXrE0xaHhvDKdTcp0d` / `99:393` 的目前首頁。
整頁已同步最新 Hero 字級與文案、12 張系列照片、8 張精選作品、大型引言、合作區、日期標籤與深綠底 footer。桌面四個導覽連結依最後指示使用 13px；Header 在頂部透明，捲動超過 24px 後固定為純白底，回到頂部恢復透明。

## 開啟

在本工作目錄執行：

```powershell
npm run dev:figma
```

瀏覽 http://127.0.0.1:4355/ 。若此埠已使用，請依終端顯示的實際網址開啟。
這個命令直接啟動 Astro，不重建其他 Motion Lab 素材或覆蓋其資料。
`npm run dev -- --config astro.figma-preview.config.mjs --port 4355` 也可使用，但會先執行既有素材產生器。

## 內容與動線

- 首屏海邊照片、四角取景框、中央十字與首頁導覽。
- 兩段精選系列「晴空之下／放課後」，各 6 張照片：桌面垂直捲動帶動影像分別往左、往右移動。
- 精選作品共 8 張，往左滑動，接著回到垂直捲動的大型引言、合作區。
- 平板、手機與減少動態模式使用原生橫向滑動，不攔截觸控。
- 合作區沿用原本 Contact 與 Dates 的驗證、檔期、選取、照片預覽與確認流程。
- 月曆淺色圓形代表可洽詢，深綠圓形代表已選；選取會同步到表單。
- 首頁偏好日期可複選，以可移除的標籤呈現並同步到原表單；其他頁面維持單選。
- Footer 保留大型 PHOX999 字標、四個站內連結與可開啟的隱私設定；手機版改為兩欄連結與直排資訊。

## 修改位置

- `src/components/FigmaHome.astro`：首頁語意結構、圖片、連結。
- `src/components/HomeHeader.astro`、`src/components/HomeFooter.astro`：僅首頁使用的新版導覽與頁尾。
- `src/data/site.ts` 的 `homepageNavigation`：頁首、手機選單與頁尾共用四個連結。
- `src/styles/figma-home.css`：僅限首頁的 Figma 色彩、字型與響應式樣式。
- `src/scripts/figma-home.ts`：橫向捲動、header 白底狀態、Hero 對焦／音效／打字銜接；不新增框架或套件。
- `src/lib/hero-shutter.ts`：用 Web Audio 播放你提供的 MP3，啟用後解碼一次並重複使用。
- `public/assets/audio/kave_msri-camera-shutter-314056.mp3`：提供的原始快門音檔，未裁切或修改。
- `src/components/Icon.astro`、`src/lib/icons.ts`、`src/styles/icons.css`：靜態與動態頁面共用 SVG 圖示，保留按鈕的無障礙名稱與選取狀態。
- `public/assets/icons/`：33 個現成圖示、SVG sprite、官方來源版本與完整授權；Lucide 為主要來源，Instagram 採 Feather，Threads 採 Font Awesome。
- `scripts/build-icon-sprite.mjs`：用已存入的 SVG 重新產生 sprite；不需要安裝套件或連線。
- `src/components/Contact.astro`：新增可選的 `figmaHome` 排版；其他頁面維持原模式。
- `src/components/Dates.astro`：新增可選的 `integrated` 日期同步模式。
- `public/assets/home-figma/`：Figma 原圖的網頁版本與素材清單。
- `astro.figma-preview.config.mjs`：僅供本機預覽的公開讀取代理與獨立建置目錄。

色彩與字型統一於 `body.editorial-shell` 的 CSS variables，對應 Figma 的 Color / Typography collections。
主要色為白色 `--color-bg`、墨綠 `--color-primary`、文字 `--color-text`；
字型為 `--font-heading`（Noto Serif TC）、`--font-body`（Noto Sans TC）、`--font-brand`（Outfit）。

## 驗證與限制

```powershell
npm run build:figma
node --test tests/calendar-range.test.js tests/home-featured-series.test.js tests/inquiry-form.test.js tests/inquiry-references.test.js tests/inquiry-workflow.test.js
```

`npm run build -- --config astro.figma-preview.config.mjs` 已通過，產生 59 頁；建置前後保留既有生成資料，16 個檔案 SHA256 均一致。
21 項相關既有測試通過。桌面 1440、1024，平板 768，手機 390、360 像素均檢查無整頁橫向溢出。

Hero 現在會等待照片解碼完成，再以 3.2 秒由模糊變清晰；白色四角取景框與中央十字接著以 0.7 秒淡出。
開場的 2.4 秒內，取景框與中央十字同步輕晃，之後穩定；照片、文字與選單不晃動。
中央十字的 SVG 顯示區已放大為桌面 40px、手機 36px；取景框與十字維持純白色，不使用混合模式。
四角與十字的實際線寬統一為 1.2px，手機不因縮放而變粗或過細。
喇叭圖示依新版設計移至 Hero 右下角，音效預設開啟；21 KB 的原音檔以 data URL 隨首頁一起傳送，省去獨立下載，解碼完成後立即播放，不等待對焦結束。播放原 MP3 的 0.04–0.50 秒片段，略過前後空白；音量維持最初的四倍（gain 0.96），使用互動低延遲 AudioContext。點喇叭即可靜音，再次開啟會重播對焦與音效。
自動開場音效只在初始化後的 400ms 內啟動，避免解碼或瀏覽器解鎖後補播過時的快門聲。音檔以 atob 直接轉成位元組解碼，不使用 fetch(data:)；沿用正式環境 connect-src 安全政策。瀏覽器若阻擋自動播放，喇叭會顯示未開啟，點一次即可啟用並重播；明確按鈕操作不受自動開場的 400ms 限制。晚到的一般點擊或按鍵只解鎖音訊。減少動態模式直接顯示清晰照片。
Hero 的兩行主文案會等照片由模糊變清晰的 3.2 秒動畫結束後，才逐字出現。每字約 90ms、換行停頓 280ms，配白色方塊游標；完成後游標消失。完整文字與兩行高度保留在原位置，輔助工具可直接讀取完整標題。文字與音效播放狀態無關；靜音或自動播放被阻擋也會在對焦完成後出字。減少動態模式與未啟用 JavaScript 時直接顯示全文。
減少動態模式或未啟用 JavaScript 時直接顯示清晰照片。

SVG 更新包含首頁、共用導覽與聯絡、作品燈箱、合作步驟、選片、後台的功能圖示；品牌標誌、引言裝飾與統計圖表保留。
圖示測試檢查 sprite 實際幾何、主題選取、FAQ、聯絡視窗及手機導覽；沒有對後台或合作表單寫入資料。
全套 `node --test` 結果為 134 通過、1 失敗：`site-analytics-client.test.js` 的測試模擬沒有提供 `window.document`，在 `resolveTabId` 讀取 `addEventListener` 時失敗。此失敗在統計來源檔與 HEAD 相同時已重現；後續僅新增 threads.com 的目的地辨識。

本機從既有 dev 網站讀取公開檔期與網站內容；需要網路，沒有以假資料替代實際檔期。
代理不轉送表單提交；本次驗收到確認內容與返回修改為止，未實際送件。
聯絡區第三個圖示已換成 Threads，使用確認的網址 `https://www.threads.com/@phox999_`。
24 張來源照片已按 Figma 節點重新下載與轉檔，`manifest.json` 記錄來源節點和檔案 SHA-256。主題卡仍保留設計中的風景佔位照片；無法確定既有相簿對應的編輯標題先連至全部作品，不改動原作品資料。

未執行正式站部署。標準靜態建置仍可用 `npm run build`，輸出 `dist/`，沿用既有 Cloudflare 設定；本機預覽建置輸出 `.figma-preview-build/`，不作為正式部署。
