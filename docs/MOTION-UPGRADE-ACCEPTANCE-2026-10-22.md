# Phox999 動效升級：本地交付與驗收

日期：2026-10-22。依 `Phox999_Motion_Luna_Plan_2026-10-22.md` 實作 P0、P1；P2 未實作。

已完成來源實作、隔離建置與本地 Chromium 驗證；**尚未部署或合併主分支**。本次 dev 分支為 `codex/dev-motion-upgrade-20261022`。WebKit、Firefox、實機觸控與正式 Worker 端到端流程仍待驗證，不能將本輪稱為全環境最終驗收通過。

## dev 分支整合驗證

- 分支基於最新 `origin/main`：`1436c55c16bd50510b7f46a5d08e790671f772df`，只移入動效來源、三個測試檔及本文件，共15個檔案。
- 保留main既有的精選作品排序、逐卡箭頭定位、analytics設定面板；箭頭原定位演算法補上reduce立即捲動分支。
- 本地尚未提交的靈感板、後台、照片、dist及其他產物沒有納入。前段的瀏覽器／效能驗證來自原本本地working tree；整合後另重新驗證精確tree，結果如下。
- 精確待推送tree的隔離建置成功：58頁。原本working tree為59頁，包含未納入此分支的本地頁面。
- 整合版測試為136項、135通過、1失敗；新增11項動效測試全數通過。唯一失敗為main既有 `tests/site-analytics-client.test.js`：mock的window未掛載document，`resolveTabId` 讀取window.document的 `addEventListener` 時失敗。`src/lib/site-analytics.ts` 與該測試的Git blob hash均和main完全相同，單獨重跑亦失敗；本輪沒有修改analytics邏輯或其測試。
- 因此，不把原本working tree的145/145結果當成整合分支全部測試通過。整合紀錄僅存在實作機的 `.motion-upgrade-20261022/push-review/`，沒有提交建置或大型測試資產。

## 範圍與保護邊界

- 開始時為 detached HEAD `12e5aec507bdaa55b68c862a1d2e544656e31458`，工作目錄已有大量未提交修改。本輪保留這些修改。
- 沒有更動文案、照片、作品排序、相框比例、欄數、卡片間距、圓角、品牌色、表單欄位、提交 API 或後台。
- 沒有新增套件或修改 package.json／package-lock.json。驗證途中既有 Astro 模組缺失，停止本次 dev 後使用 `npm ci --offline --ignore-scripts --no-audit --no-fund` 依原鎖檔還原依賴。
- 縮圖前置程式回報 2,748 張全部重用、產生 0 張；原始照片沒有修改或刪除。
- 保留既有 Google Form CTA：`https://forms.gle/8V17E3gPVf3NdEaY8`。

## M01–M10 狀態

| 項目 | 交付 | 實作與限制 |
| --- | --- | --- |
| M01 標題遮罩 | 完成 | 單一語意 h1，保留原有換行；560ms 單元遮罩揭露。SSR、照片、CTA 預設可見。晚到文案用 textContent 更新並取消舊包裝，不重播。返回不重播。 |
| M02 Hero 輪播 | 完成 | 替換舊 setInterval，6500ms 停留＋650ms 淡接；成功解碼才切圖。最多目前／下一張兩層，失敗保留當前照片並跳過。可暫停，背景／離屏／reduce 暫停；手動暫停記錄於該 Hero 節點，bfcache 還原時保留。首圖加入既有來源回退。 |
| M03 區塊入場 | 完成 | 作品標題、合作卡片、回饋外框、檔期及 FAQ 標題、作品卡片使用 IntersectionObserver。桌機 20px/560ms、窄視窗 12px/400ms，錯開上限180ms。每節點一次，API 重繪後只註冊子樹；無全站 MutationObserver。 |
| M04 作品卡片 | 完成 | 原控制器／原 CSS 調整為1.04、480ms，遮罩／標題240ms；fine pointer 才懸停縮放，鍵盤使用靜態焦點框，觸控保留常駐標題。分類立即更新 hidden、計數和箭頭，150ms 短淡接可取消。另修正動態首頁計數採精選12組的實際分類數。 |
| M05 圖片載入 | 完成 | 非首屏、非快取 lazy 照片 load 後200ms淡入。載入中不預設透明，失敗時原生錯誤／alt狀態仍可見。沒有新增骨架、圖片或字型。 |
| M06 導覽／按鈕 | 完成 | 底線160ms、按下scale(.98)。固定頁首實際高度＋top＋16px寫入 root scroll-padding，避免與section scroll-margin重複計算。真實href與原生導航保留。 |
| M07 FAQ／表單 | 完成 | 保留原生details，只調240ms圖示／邊角；選取回饋160ms，編輯／確認160ms淡入。保留原表單控制器、焦點、檔案、驗證與提交結果，沒有假成功或新API。 |
| M08 照片燈箱 | 完成 | 靜態作品頁與動態備援相簿共用一個原生dialog控制器。桌機以裁切視窗＋照片等比縮放320ms銜接；手機／圖片未備妥時200ms淡入。換圖180ms，decode競態採世代檢查。ESC、按鈕、背景關閉、返回來源焦點、捲動鎖定與過場清理皆保留／補齊。 |
| M09 輕視差 | 明確停用 | 現有Hero滿版object-fit:cover，沒有額外安全裁切餘量；新增位移會露底或需要再裁切人物。依規劃降級，本輪沒有視差控制器／離屏rAF。設定保留false，單改true不會建立視差；需先另行處理安全裁切。 |
| M10 跨頁過場 | 降級完成 | 保留 Astro 5.18.2 整頁導覽，以原生同源跨文件180ms淡接漸進增強。不支援時正常跳頁。作品詳情是標題＋裁切照片網格，沒有獨立封面區，且另有API動態備援路徑；本輪不重構這些結構來做共享封面配對。沒有新增ClientRouter或攔截點擊。 |

M10 決策查閱了 [Astro 5 過場文件](https://v5.docs.astro.build/en/guides/view-transitions/) 與 [Chrome 原生跨文件過場文件](https://developer.chrome.com/docs/web-platform/view-transitions/cross-document)。沒有複製 Motion Prompt 原始碼。

## 檔案用途

| 檔案 | 用途 |
| --- | --- |
| src/lib/motion-settings.js | 集中 reveal、heroParallax、galleryTransition、pageTransition 設定 |
| src/lib/carousel-clock.js | 單一非重疊輪播排程、暫停／清理世代檢查 |
| src/scripts/site-motion.js | 唯一初始化／清理入口、入場、載入淡入、分類淡接、媒體條件、頁首偏移、bfcache |
| src/scripts/hero-motion.js | 原 Hero 控制器整合標題、API、解碼、兩層淡接、暫停、離屏處理 |
| src/scripts/gallery-motion.js | 共用 dialog、等比裁切過場、競態取消、焦點與捲動清理 |
| src/styles/motion.css | 共用時間／緩動變數、導覽、按鈕、FAQ、表單、reduce與原生跨頁樣式 |
| src/layouts/BaseLayout.astro | 引入共用樣式與入口 |
| src/components/Hero.astro | 保留原首圖響應式來源／優先權，加入播放控制，移出舊輪播 |
| src/components/Portfolio.astro | 原懸停樣式、篩選淡接、動態註冊、reduce箭頭捲動與計數 |
| src/components/PortfolioDetail.astro | 移除重複燈箱控制器，補 dialog 可及名稱及照片計數宣告 |
| src/pages/portfolio/index.astro | 對接共用燈箱、篩選及API重繪；保留原搜尋／排序／靈感板 |
| tests/carousel-clock.test.js | 重複排程、慢解碼、暫停、清理後不再排程 |
| tests/gallery-motion.test.js | 快速換圖競態、關閉後不重繪、原圖失敗、焦點恢復與清理 |
| tests/site-motion.test.js | 重複初始化、即時reduce、bfcache與待入場元素還原 |

## 執行結果

| 檢查 | 結果與證據 |
| --- | --- |
| npm test | 145/145 通過，含新增11項實際競態／生命週期測試；`.motion-upgrade-20261022/tests.log` |
| 建置 | `npm run build -- --config .motion-upgrade-20261022/astro.build.config.mjs`，59頁成功；`build.log` |
| 輸出保護 | 僅寫入`.motion-upgrade-20261022/build/`；停用本次隔離建置的public複製，保留原dirty dist與照片。這是來源編譯驗證，不是可直接部署的完整圖片包。 |
| 桌機／平板／手機視窗 | Chromium 155、Windows，1440×900、900×1000、390×844、360×800，已檢查無整頁水平溢出。手機尺寸為桌機瀏覽器視窗，非實機。 |
| 多圖輪播 | 記錄到9次切換，每次active圖已解碼，切換最多2層；相鄰成功切換約7.17秒。`carousel-five-switches.json` |
| 失敗圖片 | 下一張404時保留當前照片、跳過；`broken-next-switches.json`、`fixture-network.log`。另實測SSR首圖候選失敗仍回退至可用照片，標題及CTA保留。 |
| 慢API／長標題 | API延後3秒時SSR標題／CTA可用；晚到長標題直接更新且無動畫包裝。以標題字級200%測試中文換行，無水平溢出；`long-title-200-mobile.jpg`。這不是全瀏覽器200%縮放驗收。 |
| 無JS／故意初始化失敗 | 本地fixture移除全部script，或故意令Observer初始化失敗；標題及真實CTA可用、待入場透明節點0。 |
| 動態API重繪 | 首頁重建12組、作品索引重建29組後可篩選；首頁棚拍2組、scrollLeft=0、計數一致，平板無溢出。 |
| FAQ／表單 | 原生開合正常；照片選取後進確認、返回編輯再進確認，文字與照片名稱保留，焦點為確認標題。沒有點擊最終送出按鈕。 |
| 燈箱 | 手機開啟、按鈕／方向鍵到3/40、ESC關閉後回來源；桌機記錄等比scale＋crop兩層過場。快速開關及背景關閉後dialog關閉、殘留clone=0、捲動解鎖。 |
| reduce／重複初始化 | 本地測試工具模擬媒體查詢及CSS分支；初始reduce、即時切換後待入場節點0、輪播disabled；連續3次pagehide/pageshow恢復無重複。另有獨立單元測試。尚未測真實OS設定切換。 |
| 導航 | 真實連結、回頁首、直接/#contact不被固定頁首遮住；整頁導航／標題保留。沒有自訂SPA路由。 |

尚待：WebKit／Firefox、實機Safari與觸控手勢、真實OS reduce切換、完整200%瀏覽器縮放、真實背景分頁長時間觀察、新分頁／完整前進返回矩陣、Worker表單最終成功／失敗端到端。背景／離屏條件與清理已有程式及排程單元測試，但不冒充完整實機驗收。

## 效能與限制

同一 Chromium、相同視窗、本機靜態fixture，升級前後交錯各三次；回應no-store，沿用同一瀏覽器與既有字型快取，沒有網路／CPU節流。使用測試頁PerformanceObserver記錄初始載入，不是正式RUM、INP或完整DevTools trace。

| 視窗 | 原版LCP三次 ms | 升級版LCP三次 ms | 中位數前→後 | CLS前後 |
| --- | --- | --- | --- | --- |
| 1440×900 | 296 / 216 / 208 | 232 / 216 / 208 | 216 → 216ms | 0.002648 → 0.002648 |
| 390×844 | 232 / 204 / 196 | 204 / 200 / 200 | 204 → 200ms | 0.014287 → 0.014287 |

資料位於`performance.json`與`performance-mobile.json`。這些本機數字不能推論正式網路或所有手機60fps。初始取樣沒有longtask；輪播觀察紀錄亦未出現持續長任務，仍不等於全裝置效能保證。

新增JS模組與所有改動CSS區塊採保守計算（包含原本就存在的Portfolio／索引樣式）：minify後gzip合計 **8,059 bytes**，小於15KB目標；`budget.json`。沒有新增圖片／影片／字型。

## 本地預覽與後續發布

- 現有來源dev：`npm run dev -- --host 127.0.0.1 --port 4321`，開啟 `http://127.0.0.1:4321/`。
- Astro dev不執行Worker API，因此網站內容／作品／檔期API的404屬此預覽限制；靜態照片和本輪動效仍可檢查。
- 多圖與錯誤情境測試：`node .motion-upgrade-20261022/preview-server.mjs`，升級版 `http://127.0.0.1:4322/?scenario=normal`；基線4323。測試API只使用本地資料，不寫入資料庫。
- 可用情境：normal、single、slow、broken、first-broken、published。`?reduce=1&tools=1`為測試媒體條件，`?js=off`移除腳本，`?fail=1`故意初始化失敗。所有工具只由本地fixture注入，未引入正式來源。
- 正式發布未執行。後續應依目前專案的Cloudflare Worker／Pages既有發布流程，先跑完整`npm run build`（或現有`build:worker`），再驗證完整資產與Worker API；不要將隔離建置資料夾直接部署。

## 關閉及回復

`src/lib/motion-settings.js`可關閉reveal、galleryTransition、pageTransition；heroParallax本輪保留停用。reduce優先於一般設定。關閉動效不改變API、表單或路由。

以下備份及patch只存在原實作機，沒有提交至dev分支。本輪開始前五個既有來源檔的原樣備份在`.motion-upgrade-20261022/src/`。`motion-upgrade.patch`只包含原本本地版本14個來源／測試檔案的改動，沒有混入其他既有修改；已執行下列唯讀檢查通過：

```powershell
git apply --reverse --check .motion-upgrade-20261022/motion-upgrade.patch
```

若日後要回復原實作機的本地版本，先再跑上面的check，確認沒有後續編輯衝突，再於明確要回復時使用`git apply --reverse`。若要回復已發布的dev分支，應針對該動效提交使用`git revert`，避免以舊working tree的patch覆蓋main既有修正。不要對整個工作目錄執行restore/reset，也不要將`.motion-upgrade-20261022/`、編譯產物或照片加入本次提交。

建議下一輪先補WebKit／實機觸控及Worker端到端驗證，再決定是否調整裁切策略啟用M09；不增加P2裝飾效果。
