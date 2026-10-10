# SEO / AIEO 內容來源與查核紀錄

查核日期：2026-10-10（Asia/Taipei）

## 拍攝合作條件

首頁、合作頁和互惠文章沿用網站目前公開的一般安排：通常拍攝約 2–3 小時、事前確認 1–2 套服裝、交付約 40–80 張，通常約 2–3 週；每次企劃與當月工作量可能不同。一般互惠拍攝不收拍攝費，棚租、場地或道具等額外支出會在拍攝前討論。文章另以「一般 TFP 概念」和本站目前公開條件分欄，並提醒發布、原檔和修圖範圍需逐次確認。

這些數字和條件取自本專案既有公開合作內容；本次沒有寫入正式資料庫或覆蓋管理後台資料。

## 官方場地資料

| 頁面 | 本次使用的資訊 | 限制與查核記錄 |
| --- | --- | --- |
| [古亭河濱公園｜臺北市政府工務局水利工程處](https://heo.gov.taipei/News_Content.aspx?n=E65DBD99C91AEAC4&s=32A53CBA0EEBE107&sms=3A0FD6D3764BFBA7) | 約 27.3 公頃、河岸與自行車動線方向 | 官方頁面標示更新日期 2021-08-04；未列人像拍攝許可條件。文章要求器材／團隊安排先向管理單位確認。查核 2026-10-10。 |
| [寶藏巖參觀資訊](https://www.artistvillage.org/visit.php) | 戶外與室內參觀時段、週一休園、交通資訊 | 開放參觀不等於拍攝許可；出發前重查公告。查核 2026-10-10。 |
| [寶藏巖場地管理與拍攝規則](https://www.artistvillage.org/rent-view.php?c=4&p=2) | 模特兒攝影列為需申請並確認費用的項目 | 頁面標示修訂日期 2024-06-17；須以管理單位最新要求為準。查核 2026-10-10。 |
| [信義商圈｜臺北旅遊網](https://www.travel.taipei/zh-tw/attraction/details/1573) | 商圈包含台北 101、商場與娛樂設施 | 未用此頁推論特定拍攝點允許拍攝；季節活動須看主辦單位當季公告。查核 2026-10-10。 |
| [臺北捷運路網圖](https://english.metro.taipei/cp.aspx?Create=1&n=E6F97A6FF9935E98&s=6E5D7E2CB905D981) | 官方路網查詢入口 | 沒有推估班距、行程時間或即時交通。查核 2026-10-10。 |

新增／補強文章：古亭河濱指南、寶藏巖指南、信義區夜拍指南和台北外拍地點總覽。場地事實及連結也列於各文內。

## 作品集文字與圖片描述

- 以 `src/data/portfolioCatalog.ts` 的 29 組現有 catalog 為覆核範圍。保留每組既有標題、原始 slug 和已有描述；地點僅在現有資料明確時填寫，海岸冬日的現有 SEO 描述明確指出跳石車站，因此補齊相同地點欄位。其他未確認地點維持空白。
- 六組重點作品的封面及代表照片使用本機生成的縮圖聯絡表逐張目視覆核；caption／alt 只描述可見服裝、姿態、背景和光線，沒有推測模特兒姓名、拍攝故事或作品授權。
- 六組解讀分別為：河畔花期、巷弄拾光、校園漫步、聖誕暖意、青澀序曲、羽翼之間。2026-10-10 驗收逐張對照六張封面、24 張代表照片與九篇 Journal 封面後，修正姿勢、場景和道具描述；原有圖庫與原始 WebP／相機檔均保留。對羽翼之間只描述照片可見的雙人造型、翼飾與環境，沒有依照片推斷拍攝類別。
- 圖片 metadata 只連到本站既有作者 ID；未提供虛構 license URL。

## 技術參考

- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)：`serialize` 產生 sitemap 項目的 `lastmod`。
- [Google AI 搜尋指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)：沿用可被索引的一般內容與技術原則，沒有另造 AI 專屬 schema。
- [OpenAI crawler 說明](https://developers.openai.com/api/docs/bots)：未變更 GPTBot 或 OAI-SearchBot 的抓取政策。
- [Cloudflare Static Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/)：限定 legacy 作品清單入口由 Worker 先處理，其餘靜態資產仍由 ASSETS 提供。
