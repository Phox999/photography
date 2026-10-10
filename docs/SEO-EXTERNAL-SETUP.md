# SEO 外部設定與驗證步驟

查核日期：2026-10-10（Asia/Taipei）

本輪補修先在本機完成；未執行 Worker deploy，也沒有修改 Cloudflare DNS／Redirect Rules、Search Console、Bing Webmaster Tools、GA4 或社群帳戶。2026-10-10 17:56（Asia/Taipei）透過唯讀 Wrangler 部署狀態查詢，`photography` Worker 的 100% serving version 為 `18297947-c7fa-44ba-a67a-77c267c68aa4`，部署時間 2026-10-10 09:19:34 UTC；Wrangler 沒有在此結果中提供對應 Git commit，因此不把它歸因到本次未發布的本機補修。公開 API 與第二輪頁面目前確實可讀，不能籠統寫成「尚未部署」。Search Console／Bing／GA4 帳戶資料和正式事件收件仍未取得；以下分列公開端觀察和帳戶待辦，不以本機測試代替正式結果，也不需要升級付費方案。

本次公開網域唯讀檢查（2026-10-10 約 17:54 Asia/Taipei）：apex HTTP 首頁仍回 HTTP 200 且無 `Location`，未導向 HTTPS；HTTPS apex 首頁回 200。`www.phox999.com` DNS 查詢為 `DNS name does not exist`，HTTP／HTTPS www 請求皆無法連線；此結果不代表 Cloudflare 帳戶內規則不存在。HTTPS 首頁、`/journal/what-is-tfp/`、`/sitemap-index.xml`、`/robots.txt`、作品總覽和本次抽查的三個作品頁均回 200。公開 sitemap 可讀不代表已向搜尋引擎帳戶提交或完成索引。首頁 HTML 沒有 `G-...` Measurement ID，也沒有實際 GA／Google Tag `<script src>`；出現的 script URL 是客戶端程式中的字面樣板，不是已載入的 provider 或事件收件證據。`/api/portfolio` 回 200 和 29 組作品，證明正式站已有第二輪公開資料；三個分類修正尚未反映在當時公開靜態作品頁 title，Journal `what-is-tfp` 封面 alt 仍是「雙手抬到額前」。驗證 URL：[`http://phox999.com/`](http://phox999.com/)、[`https://phox999.com/`](https://phox999.com/)、[`http://www.phox999.com/`](http://www.phox999.com/)、[`https://www.phox999.com/`](https://www.phox999.com/)。

Push `6d4429967443c17ba7979cccd808a12f00a8913b` 後的刷新（2026-10-10 10:17–10:18 UTC / 18:17–18:18 Asia/Taipei）仍見 apex HTTP 200、無 `Location`；HTTPS apex 200；www HTTP／HTTPS 仍因 DNS 不存在而失敗。首頁仍無 GA4 Measurement ID 或 Google Analytics script。公開 API 仍回 200，29 組資料的現行分類為敦煌 `棚拍`、天使與惡魔 `外拍`、小桃 `外拍`。唯讀 Wrangler 狀態仍是 `18297947-c7fa-44ba-a67a-77c267c68aa4` 100% serving，建立時間未變；公開學院風詳情及 `what-is-tfp` HTML 仍含舊「雙手抬到額前」描述。故本次程式修正已 push 到 `origin/main`，但這次刷新沒有證據顯示新修正已進入正式 Worker／靜態頁面；沒有執行手動 deploy。正式站已有部分第二輪內容這一點仍成立。

再刷新（2026-10-10，本輪查核；Worker 版本建立於 10:21:58 UTC）確認 GitHub `origin/main` 為 `100850b3e7d98dddfeccf928f0d931b06ba4e8a2`，Worker `c612015b-7983-4818-bea9-925461aea8ac` 服務 100%。公開 `學院風棚拍` 詳情與 `what-is-tfp` 已輸出「雙手自然垂在身側」；敦煌、天使與惡魔、小桃詳情頁都回 200，標題與可見分類分別是棚拍／外拍／外拍。Wrangler 狀態未提供 Git SHA 對照，因此以公開內容核對同步，不推測版本來源。此回查確認本次程式修正已出現在正式站。

這次更新後仍有未完成項目：apex HTTP 依舊 200 且沒有 `Location`；`www` 仍無 DNS；首頁沒有 GA4 Measurement ID／Analytics script。只讀 `wrangler whoami` 顯示 `zone:read`，未提供 DNS／Redirect Rule 寫入權限；未透過不足權限嘗試修改正式設定。Search Console／Bing 的驗證、提交與索引仍無帳戶證據。作品頁已補入攝影師提供的三組第一手案例；`src/components/BehindScenes.astro` 的現場側拍素材仍待整理。合作方／場地外部連結未新增，待取得對方同意。網站側 About／Person 結構資料已有「小蔡」、人像攝影師職稱及 Instagram `sameAs`；Instagram 公開頁本次回傳 cache miss，無法核對當前自介，跨平台文案一致性未驗。

## 1. Cloudflare 網域統一

先在 Cloudflare Zone 核對 apex 記錄及現有規則，再修復或新增 proxied `www` DNS 記錄；本次檢查 `www` 無法解析。Single Redirect 需要請求主機經 Cloudflare proxy。[Cloudflare 操作文件](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/)說明建立方式；目前[官方方案配額表](https://developers.cloudflare.com/rules/url-forwarding/)列出 Free 可用 Single Redirects（每個 Zone 最多 10 條）。先確認既有規則數量，兩條規則可用現有方案完成，**不要升級方案**。

確認 `www` 記錄可經 Cloudflare proxy 後，到該 Zone 的 **Rules → Redirect Rules** 檢查既有規則，避免重複轉址或迴圈。建立兩條 Single Redirect：

| 順序 | Request URL（Wildcard pattern） | Target URL | 狀態 | 保留 query string |
| --- | --- | --- | --- | --- |
| 1 | `http*://www.phox999.com/*` | `https://phox999.com/${2}` | 301 | 開啟 |
| 2 | `http://phox999.com/*` | `https://phox999.com/${1}` | 301 | 開啟 |

第一條將 HTTP／HTTPS 的 `www` 主機轉至 HTTPS apex；第二條只處理 apex 的 HTTP。Cloudflare 的 wildcard pattern 以 `*` 擷取路徑，`${1}`／`${2}` 依 pattern 中 wildcard 出現順序替換。兩條均選 `301` 並開啟 `Preserve query string`；Cloudflare 預設不保留 query，必須在規則中明確開啟。啟用前在 Preview 核對根路徑、巢狀路徑和 query，並確認規則順序不與現有規則衝突。[wildcard pattern 與 query 行為](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/settings/)

在 Windows PowerShell 執行下列命令，確認第一個回應為 301、最後網址是 HTTPS apex，且路徑和參數保留：

```powershell
curl.exe -sS -D - -o NUL "http://www.phox999.com/portfolio/?check=redirect"
curl.exe -sS -L -o NUL -w "%{url_effective} %{http_code}`n" "http://www.phox999.com/portfolio/?check=redirect"
curl.exe -sS -L -o NUL -w "%{url_effective} %{http_code}`n" "http://phox999.com/journal/"
curl.exe -sS -I "https://phox999.com/"
```

部署 Worker 後另檢查作品舊入口：

```powershell
curl.exe -sS -D - -o NUL "https://phox999.com/portfolio/?collection=河畔花期&utm_source=redirect-check"
curl.exe -sS -D - -o NUL "https://phox999.com/portfolio/?collection=slug-that-does-not-exist"
```

已知 slug 應 301 到 `/portfolio/<slug>/` 並保留 `utm_source`；未知 slug 不應被導到其他作品或首頁，應留在舊作品集頁由現有找不到內容狀態處理。完成 DNS／規則後，重新跑上面所有命令並保存第一跳與最終 URL；在此之前 apex HTTP 轉 HTTPS、www DNS 與 www canonical redirect 都列為**外部待辦**。本機 Wrangler preview 已確認已知 slug 的 301 會保留其他 query，未知 slug 回到作品總覽 200；這只證明 Worker 候選，不代表正式站規則已設定。

## 2. Search Console、Bing 與 AI 曝光觀察

1. 在 Search Console 選取已驗證的 `https://phox999.com/` URL-prefix 或相符 Domain property，提交 `https://phox999.com/sitemap-index.xml`。
2. 以 URL Inspection 抽查首頁、作品總覽、六個重點作品頁和九篇 Journal 頁；核對 Google-selected canonical、索引可用性及 robots 狀態。
3. 之後檢查 Pages／Indexing 與 Sitemaps，分辨已索引、重複 canonical、404 與被排除私人路徑；不要把尚未出現的資料寫成零曝光基準。
4. 查看 Search Console 當前提供的生成式 AI／搜尋外觀成效報表與可用篩選。報表名稱和可用性依帳戶、網站及 Google 當期功能而定；沒有看到報表時記為未提供，不推估流量。
5. 在 Bing Webmaster Tools 匯入或驗證同一網站，提交同一 sitemap，檢查 crawl/index 狀態。
6. 以月為週期記錄日期區間、查詢、曝光、點擊、平均排名、落地頁、可見的 AI/Search appearance 篩選和有效合作意向數。將搜尋點擊與 Google Form 收件分開記錄。

目前尚未提供 Search Console／Bing 帳戶讀取證據，索引量、曝光、點擊與排名基準均為「未取得」，不是 0。發布且完成帳戶驗證後，依以下觀察表在第 7 日與第 28 日記錄；不要預填或推估數值：

| 觀察點 | 日期區間 | 索引／sitemap 狀態 | 曝光／點擊／查詢／落地頁 | `inquiry_click` | 可確認有效意向 | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 發布前基準 | 未取得 | 未取得 | 未取得 | 未啟用 | 未取得 | 搜尋帳戶尚未連接。 |
| 發布後第 7 日 | 待填 | 待填 | 待填 | 待填 | 待填 | 檢查抓取與明顯索引錯誤。 |
| 發布後第 28 日 | 待填 | 待填 | 待填 | 待填 | 待填 | 與發布前基準及第 7 日分開比較。 |

## 3. CTA 量測接線

程式已加上可辨識標記 `data-analytics-event="inquiry_click"` 和 `data-analytics-placement`。本機沒有設定 `PUBLIC_GA4_MEASUREMENT_ID`，目前 build 不載入 GA4 provider、也不送事件；`npm test` 驗證缺 ID 時無 script／listener，stub 點擊時只排入一筆去 query 的事件。這是程式接線與本機 stub 驗證，**不是 GA4 正式收件證據**。未新增分析 SDK 或帳號設定。

| 欄位 | 規格 |
| --- | --- |
| 事件名稱 | `inquiry_click` |
| 觸發 | 使用者點擊本站導向 Google Form 的合作意向 CTA |
| 參數 | `placement`（如 `hero`、`header-desktop`、`journal-body`）、`page_path` |
| 不得送出 | 姓名、聯絡方式、表單回答、自由文字、可識別個人身分的資料 |
| 轉換解讀 | 只代表離站點擊，不代表表單已送出或收到合作意向 |

若要啟用 GA4，先在既有 Worker build 環境設定公開的 `PUBLIC_GA4_MEASUREMENT_ID`（格式 `G-...`），再建置並部署；不要在程式碼提交 Measurement ID 或建立新帳戶。此接線只呼叫 `inquiry_click`，送出 `placement` 和清理 query 後的公開 `page_path`；admin、client、cooperation-status 不初始化 provider，`send_page_view` 關閉且 referrer 清空。正式啟用後仍須用 GA4 DebugView／Tag Assistant 及 Network 驗證事件每次只收一筆、參數不含個資，並確認 GA4 自動收集沒有私人頁路徑。不要把 Google Form 到站或 CTA 點擊命名為 `form_success`；除非另有可確認實際收件的資料來源，才另設成功轉換。

## 4. 可重建發布來源與 Worker 設定

本輪程式候選以 `main` 上 Git HEAD 為基底，必要來源另列為本輪明確提交檔案；`public/assets/portfolio/**/*.webp` 由 Git LFS 管理。發布前在乾淨 checkout 確認 LFS checkout 已完成，並檢查下列 Worker 變數／binding **名稱**與現有 Cloudflare Worker 設定一致，不複製 secret 值到文件或 Git：`ASSETS`（靜態資產 binding）、`SUPABASE_URL`、`SUPABASE_ANON_KEY` 或 `SUPABASE_PUBLISHABLE_KEY`；`AUTH_ALLOW_LOCALHOST` 只作 localhost 限制用途核對，不應開啟正式站。`wrangler.jsonc` 目前只宣告 `ASSETS`，其餘值可能由 Dashboard 設定。唯讀 Wrangler 查詢已能識別當前 serving version（本次讀到的 ID 與時間列於本文件開頭），但無法由結果映射 Git SHA。

這個工作目錄已有使用者保留的 `.astro/` 與 `dist/` 差異；**不要在此工作目錄執行會覆寫它們的 `npm run build:worker`**。本輪使用隔離目錄建置、準備 Worker 靜態資產及 strict 驗證。日後若授權正式發布，從乾淨 checkout／worktree checkout 指定 commit，確認 LFS，再執行 `npm ci`、`npm run build:worker`、`npm run verify:worker`、`npx wrangler deploy --dry-run`；核對 binding／secret 名稱後，再由具部署授權者執行 `npx wrangler deploy`。本輪未執行 deploy；本機補修是否進入正式站仍需在發布後對照 Git SHA／Worker version 並重抓公開頁面。

## 5. 社群與公開引用

可審查的品牌描述：

> Phox999 photography 是攝影師小蔡經營的台北人像攝影作品與合作網站，分享互惠人像、戶外外拍、棚拍與主題創作。作品和拍攝筆記整理於官方網站，合作安排以網站目前公開內容及雙方事前確認為準。

建議官方網站連結：`https://phox999.com/`；作品入口：`https://phox999.com/portfolio/`；拍攝筆記：`https://phox999.com/journal/`。發布前由帳號管理者核對文案、連結和照片使用權；本次沒有向社群、商家或合作夥伴投稿。
