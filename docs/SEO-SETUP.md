# Phox999 SEO 人工設定指南

以下步驟需要在網站外部的 Google 帳戶或服務中完成。網站程式無法代替網域驗證、要求收錄或管理 Google 商家檔案。

## Google Search Console

1. 前往 [Google Search Console](https://search.google.com/search-console/)，新增 `phox999.com` 的 **網域資源**。
2. 依 Google 畫面提供的 DNS 驗證方式，至網域 DNS 服務商新增驗證紀錄。不要把驗證 token 放進這個程式庫。
3. 驗證完成後，在 **Sitemaps** 提交 `https://phox999.com/sitemap-index.xml`。
4. 使用 **網址審查**查看首頁、`/portfolio/`、`/about/`、`/cooperation/`、`/journal/`，以及部分作品和文章頁。需要時可要求重新檢索；是否收錄由 Google 決定。
5. 在 **索引 → 網頁**查看已排除、已檢索但未建立索引等狀態。管理頁、私人相簿和合作狀態頁不會列入 Sitemap，並設有 `noindex`。
6. 在 **成效 → 搜尋結果**持續觀察查詢、曝光、點擊和到達頁面，不要只用單次排名判斷成效。
7. 等 Search Console 收集足夠資料後，再看 **體驗 → 網頁體驗／Core Web Vitals**。Lighthouse 分數不能取代真實使用者欄位資料。

> `robots.txt` 依目前需求封鎖私人路徑。如果某個私人 URL 已經出現在搜尋結果，Google 可能無法重新讀取該頁的 `noindex`；可在 Search Console 檢查該 URL，並依 Google 的移除流程處理。

## Google Business Profile

- 只有在符合 Google 現行資格時，才建立或認領商家檔案。
- 若沒有對外營業的固定工作室，先確認是否適用「服務區域商家」設定；只填寫實際服務的台北、新北區域。
- 不要公開私人住址。只有真實、符合規範且可接待客人的地點，才使用公開地址。
- 商家名稱、類別、服務範圍、營業時間和聯絡方式都應如實填寫，不要在名稱塞入搜尋關鍵字，也不要替沒有實際據點的地區建立商家檔案。

## 社群分享與外部引用

- 分享地點指南時，連到相對應的 Journal 文章；分享一組照片時，連到該作品頁。
- 社群文案以實際拍攝內容為準，並確認作品頁的 Open Graph 預覽圖合適。
- 優先累積有用的外部引用和真實合作，不購買無關或垃圾連結。

## 發布後檢查

- 確認正式站可讀取 `/robots.txt`、`/sitemap-index.xml`，且每個公開頁面的 canonical 指向自身 URL。
- 確認 `/admin/`、`/client/` 和 `/cooperation-status/` 不在 Sitemap，並保留 `noindex`。
- Search Console、商家檔案和搜尋結果都需要時間更新；程式碼不保證排名或特殊搜尋結果。
- FAQ 結構化資料保留供機器理解內容，但一般網站不應預期出現 Google FAQ rich result；Google 對該結果的顯示有限制。

## Cloudflare Worker 本機驗證

本站使用 Cloudflare Worker Static Assets（根目錄 `wrangler.jsonc`），不是 Pages Functions。預覽目前靜態輸出和 Worker 路由時，依序執行：

```powershell
npm run build:worker
npx wrangler dev --local
```

預覽首頁、`/robots.txt`、`/sitemap-index.xml`、`/llms.txt`、一篇 Journal、一組作品與不存在的路徑。確認不存在的路徑回傳 404。若要驗證 `/api/*`，再使用隔離的 `.dev.vars` 設定本機所需環境變數；不要以正式訪客資料做寫入測試。

一般靜態 SEO 檢查則執行：

```powershell
npm run build
npm run verify:seo
```

`verify:seo` 檢查 build HTML、站內連結、圖片參照、JSON-LD、FAQ 初始 schema、robots.txt 和 sitemap。它不取代 Worker 預覽、正式部署驗證、TypeScript 型別檢查或 Lighthouse 效能量測。
