# SEO 外部設定與驗證步驟

本次沒有 Cloudflare、Search Console、Bing、GA4 或社群帳戶的外部操作授權；沒有建立 redirect rules、提交 sitemap、讀取索引／成效資料、發布貼文或部署。以下內容可交由有相應權限的管理者審查後執行。

## 1. Cloudflare 網域統一

先確認 Cloudflare DNS 中 `phox999.com` apex 與 `www` 記錄都存在且使用 Cloudflare proxy；再到該 Zone 的 **Rules → Redirect Rules** 檢查是否已有相同用途的規則，避免重複轉址或迴圈。建立兩條 Single Redirect：

| 順序 | Request URL（Wildcard pattern） | Target URL | 狀態 | 保留 query string |
| --- | --- | --- | --- | --- |
| 1 | `http*://www.phox999.com/*` | `https://phox999.com/${2}` | 301 | 開啟 |
| 2 | `http://phox999.com/*` | `https://phox999.com/${1}` | 301 | 開啟 |

第一條將 HTTP／HTTPS 的 `www` 主機轉至 HTTPS apex；第二條只處理 apex 的 HTTP。Cloudflare 的 wildcard pattern 以 `*` 擷取路徑，`${1}`／`${2}` 依 pattern 中 wildcard 出現順序替換。啟用前在 Preview 中核對根路徑、巢狀路徑和 query；確認規則套用順序與現有規則不衝突。Cloudflare 官方建立流程說明 301 和 query 保留選項：[建立 Single Redirect](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/)、[跨主機轉址範例](https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-all-different-hostname/)。

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

已知 slug 應 301 到 `/portfolio/<slug>/` 並保留 `utm_source`；未知 slug 不應被導到其他作品或首頁，應留在舊作品集頁由現有找不到內容狀態處理。HTTP／www 的線上狀態在本次無帳戶設定和可靠外部 HTTP 回應可驗證，仍屬待管理者執行後確認。

## 2. Search Console、Bing 與 AI 曝光觀察

1. 在 Search Console 選取已驗證的 `https://phox999.com/` URL-prefix 或相符 Domain property，提交 `https://phox999.com/sitemap-index.xml`。
2. 以 URL Inspection 抽查首頁、作品總覽、六個重點作品頁和九篇 Journal 頁；核對 Google-selected canonical、索引可用性及 robots 狀態。
3. 之後檢查 Pages／Indexing 與 Sitemaps，分辨已索引、重複 canonical、404 與被排除私人路徑；不要把尚未出現的資料寫成零曝光基準。
4. 查看 Search Console 當前提供的生成式 AI／搜尋外觀成效報表與可用篩選。報表名稱和可用性依帳戶、網站及 Google 當期功能而定；沒有看到報表時記為未提供，不推估流量。
5. 在 Bing Webmaster Tools 匯入或驗證同一網站，提交同一 sitemap，檢查 crawl/index 狀態。
6. 以月為週期記錄日期區間、查詢、曝光、點擊、平均排名、落地頁、可見的 AI/Search appearance 篩選和有效合作意向數。將搜尋點擊與 Google Form 收件分開記錄。

## 3. CTA 量測接線

程式已加上可辨識標記 `data-analytics-event="inquiry_click"` 和 `data-analytics-placement`。目前沒有在專案找到已配置的 GA4/GTM provider 或 Measurement ID，所以**接線準備完成，資料收集未啟用**；沒有新增分析 SDK、追蹤程式或帳號設定。

| 欄位 | 規格 |
| --- | --- |
| 事件名稱 | `inquiry_click` |
| 觸發 | 使用者點擊本站導向 Google Form 的合作意向 CTA |
| 參數 | `placement`（如 `hero`、`header-desktop`、`journal-body`）、`page_path` |
| 不得送出 | 姓名、聯絡方式、表單回答、自由文字、可識別個人身分的資料 |
| 轉換解讀 | 只代表離站點擊，不代表表單已送出或收到合作意向 |

有 GA4/GTM 授權後，先在本站唯一全站入口安裝既有 provider，再以單一 listener 將標記送為事件；檢查每次點擊只送一筆，透過 GA4 DebugView／Tag Assistant 和 Network 面板驗證事件、參數和無敏感欄位。不要把 Google Form 到站或點擊事件命名為 `form_success`。只有另有已授權、可確認實際收件的資料來源時，才另設成功轉換。

## 4. 社群與公開引用

可審查的品牌描述：

> Phox999 photography 是攝影師小蔡經營的台北人像攝影作品與合作網站，分享互惠人像、戶外外拍、棚拍與主題創作。作品和拍攝筆記整理於官方網站，合作安排以網站目前公開內容及雙方事前確認為準。

建議官方網站連結：`https://phox999.com/`；作品入口：`https://phox999.com/portfolio/`；拍攝筆記：`https://phox999.com/journal/`。發布前由帳號管理者核對文案、連結和照片使用權；本次沒有向社群、商家或合作夥伴投稿。
