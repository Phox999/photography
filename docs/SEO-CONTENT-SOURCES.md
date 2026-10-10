# SEO / AIEO 內容來源與查核紀錄

查核日期：2026-10-10（Asia/Taipei）

## 拍攝合作條件

首頁、合作頁和互惠文章沿用網站目前公開的一般安排：通常拍攝約 2–3 小時、事前確認 1–2 套服裝、交付約 40–80 張，通常約 2–3 週；每次企劃與當月工作量可能不同。一般互惠拍攝不收拍攝費，棚租、場地或道具等額外支出會在拍攝前討論。文章另以「一般 TFP 概念」和本站目前公開條件分欄，並提醒發布、原檔和修圖範圍需逐次確認。

這些數字和條件取自本專案既有公開合作內容；本次沒有寫入正式資料庫或覆蓋管理後台資料。

## 官方場地資料

| 頁面 | 本次使用的資訊 | 限制與查核記錄 |
| --- | --- | --- |
| [古亭河濱公園｜臺北市政府工務局水利工程處](https://heo.gov.taipei/News_Content.aspx?n=E65DBD99C91AEAC4&s=32A53CBA0EEBE107&sms=3A0FD6D3764BFBA7) | 約 27.3 公頃、河岸與自行車動線方向 | 官方頁面標示更新日期 2021-08-04；未列人像拍攝許可條件。文章要求器材／團隊安排先向管理單位確認。查核 2026-10-10。 |
| [寶藏巖參觀資訊](https://www.artistvillage.org/visit.php) | 戶外參觀時段為週二至週日 11:00–22:00；室內展覽空間為週二至週日 11:00–18:00；週一休園；公館站 1 號出口步行約 5–7 分鐘 | 開放參觀不等於拍攝許可；出發前重查公告。查核 2026-10-10。 |
| [寶藏巖場地管理與拍攝規則](https://www.artistvillage.org/rent-view.php?c=4&p=2)、[一般平面拍攝申請項目](https://www.artistvillage.org/rent-detail.php?id=214) | 管理規則列出模特兒外拍屬須申請的戶外平面拍攝；一般拍攝申請頁目前列 NT$4,000／日與 NT$5,000 保證金 | 規則頁的修訂紀錄列有 2024-06-17（民國 113/06/17）；申請類別、時段與費用仍依管理單位審核及當時頁面為準，文章不把費用寫成固定承諾。查核 2026-10-10。 |
| [信義商圈｜臺北旅遊網](https://www.travel.taipei/zh-tw/attraction/details/1573) | 商圈包含台北 101、商場與娛樂設施 | 未用此頁推論特定拍攝點允許拍攝；季節活動須看主辦單位當季公告。查核 2026-10-10。 |
| [臺北捷運路網圖](https://english.metro.taipei/cp.aspx?Create=1&n=E6F97A6FF9935E98&s=6E5D7E2CB905D981) | 官方路網查詢入口 | 沒有推估班距、行程時間或即時交通。查核 2026-10-10。 |

新增／補強文章：古亭河濱指南、寶藏巖指南、信義區夜拍指南和台北外拍地點總覽。場地事實及連結也列於各文內。

## 作品集文字與圖片描述

- 以 `src/data/portfolioCatalog.ts` 的 29 組現有 catalog 為覆核範圍。保留每組既有標題、原始 slug 和已有描述；地點僅在現有資料明確時填寫，海岸冬日的現有 SEO 描述明確指出跳石車站，因此補齊相同地點欄位。其他未確認地點維持空白。
- 六組重點作品的封面及代表照片使用本機生成的縮圖聯絡表逐張目視覆核；caption／alt 只描述可見服裝、姿態、背景和光線，沒有推測模特兒姓名、拍攝故事或作品授權。
- 六組解讀分別為：河畔花期、巷弄拾光、校園漫步、聖誕暖意、青澀序曲、羽翼之間。2026-10-10 再次以對照表逐張核對六張封面、24 張代表照片與九篇 Journal 封面；修正古亭河畔 `_I7A4186.webp` 的花束描述、`_I7A4577.webp` 的上衣顏色，以及寶藏巖 `47.webp` 未能確認的椅子顏色。`學院風棚拍/49.webp` 只描述側坐與手臂支撐姿勢。原有圖庫與原始 WebP／相機檔均保留。對羽翼之間只描述照片可見的雙人造型、翼飾與環境，沒有依照片推斷拍攝類別。

六組的實際圖檔清單如下；每張代表照片的 `alt` 與 caption 以同一檔名作為 `portfolioEditorial.photos` key：

| 作品 slug | 封面檔名 | 四張代表照片檔名 | 實圖覆核重點 |
| --- | --- | --- | --- |
| `260207_古亭河濱公園 RE` | `_I7A4511.webp` | `_I7A3755.webp`、`_I7A4186.webp`、`_I7A4408.webp`、`_I7A4577.webp` | 花束、黃色花田、木構平台、深藍上衣與白裙按照片描述。 |
| `寶藏嚴` | `cover.webp` | `01.webp`、`16.webp`、`32.webp`、`47.webp` | 以巷道、欄杆、木椅及窗框可見細節描述；未替 `47.webp` 猜椅子顏色。 |
| `260407_師大JK RE` | `_I7A5558.webp` | `_I7A4839.webp`、`_I7A5231.webp`、`_I7A5464.webp`、`_I7A5659.webp` | 制服、紅磚、鋪面、書本與置物櫃逐張對照。 |
| `信義聖誕節` | `cover.webp` | `01.webp`、`14.webp`、`26.webp`、`39.webp` | 玩偶、禮物、聖誕樹、跳躍姿勢及紅白氣球裝置逐張對照。 |
| `學院風棚拍` | `cover.webp` | `01.webp`、`25.webp`、`49.webp`、`74.webp` | `49.webp` 描述側坐與手臂支撐；`74.webp` 的氣球只用於該張畫面。 |
| `260614_天使與惡魔 RE` | `_I7A0275.webp` | `_I7A0001.webp`、`_I7A0098.webp`、`_I7A0200.webp`、`_I7A0306.webp` | 只描述可見的雙人造型、翼飾、姿態與環境，不推測拍攝類別。 |

- 九篇 Journal 封面逐張核對的來源檔與替代文字：

| Journal slug | 封面檔名 | `coverAlt` 描述 |
| --- | --- | --- |
| `first-portrait-shoot` | `260407_師大JK RE/_I7A4839.webp` | 白色上衣、格紋裙與紅磚街景。 |
| `guting-riverside-portrait-guide` | `260207_古亭河濱公園 RE/_I7A3755.webp` | 河岸花草旁的側傾姿勢、深藍與白色服裝。 |
| `portrait-posing-guide` | `260407_師大JK RE/_I7A4839.webp` | 白色上衣、格紋裙與紅磚街景。 |
| `rainy-day-photoshoot` | `260207_古亭河濱公園 RE/_I7A3755.webp` | 河岸花草旁的側傾姿勢、深藍與白色服裝。 |
| `studio-or-outdoor` | `學院風棚拍/cover.webp` | 深藍與白色學院風服裝及俯視構圖。 |
| `taipei-photo-locations` | `260207_古亭河濱公園 RE/_I7A3755.webp` | 河岸花草旁的側傾姿勢、深藍與白色服裝。 |
| `treasure-hill-portrait-guide` | `寶藏嚴/cover.webp` | 淺色上衣、樹葉與欄杆。 |
| `what-is-tfp` | `學院風棚拍/01.webp` | 全身站姿、學院風服裝與自然垂在身側的雙手。 |
| `xinyi-night-portrait-guide` | `信義聖誕節/cover.webp` | 紅色服裝、泰迪熊與信義區節慶燈飾。 |
- 公開 `/api/portfolio` snapshot（2026-10-10 08:03:43 UTC）含 29 組作品，其中 18 個 API 選定封面和靜態 catalog 封面不同，且這 29 個封面目前全為本站公開路徑。實際頁面驗證了 API 封面保持原照片身分並選用本機尺寸候選；另以明確標示的合成 Supabase URL fixture 測試遠端封面保留原 URL 與原圖 fallback，沒有聲稱該 placeholder object 存在或可存取。
- 2026-10-10 09:54:54 UTC 重新唯讀取得公開 `/api/portfolio`：HTTP 200、29 組作品。對於目前已發布的 slug，API `category` 是分類權威來源；靜態 `portfolioCatalog.ts` 的同名分類只作直接作品頁與 API 失敗時的建置期鏡像，必須依 API 更新。分類不由照片推斷，也不以本地值覆蓋後台資料。API 選定封面、slug、作品標題、有效管理文案與照片順序仍由公開資料保留。
- 此次核對三筆 API `category`：`260827_敦煌 RE`＝棚拍、`260614_天使與惡魔 RE`＝外拍、`小桃照片`＝外拍；靜態目錄的分類、`shootingType`、SEO 標題／描述／關鍵字已同步。API 原始描述對敦煌仍寫「戶外人像」，對小桃仍寫「室內人像」；因本輪明確不修改正式資料庫，這兩段後台文字保持原樣，後續需由有資料權限者檢視，不能把它們當作分類依據。
- 本輪再次以精確檔名目視檢查六張作品封面、24 張代表照片與九張 Journal 封面；未發現其他可由原圖證實的描述錯誤。唯一修正是 `學院風棚拍/01.webp`：照片顯示人物全身站立，雙手自然垂在身側。`portfolioEditorial.ts` 的 alt／caption、`what-is-tfp.md` 的 `coverAlt` 和本表已一致更新。比對縮圖與檔名清單留在隔離目錄 `.seo-round2-work-20261010/repair-evidence/`，僅作本機稽核，不是網站素材。
- Journal 九篇開頭、主題段落、作品引用和下一步連結已逐篇覆核；各篇直接回答標題問題，以準備清單、選擇表或現場確認項目承接，沒有增加虛構經歷或未記錄拍攝規格。寶藏巖的開放時間與申請規則以當日官方頁面重查；管理規則頁可見 2024-06-17（民國 113/06/17）修訂紀錄，但文章不依賴日期或固定費用作拍攝承諾。
- 圖片 metadata 只連到本站既有作者 ID；未提供虛構 license URL。

## 搜尋與提問意圖對應

| 搜尋／提問意圖 | 主要承接頁 | 內容承諾 |
| --- | --- | --- |
| 台北互惠人像攝影、作品風格與合作入口 | 首頁、作品總覽；`/cooperation/` | 先展示作品與合作方式，CTA 指向既有合作意向表單。 |
| 互惠攝影／TFP 是什麼 | `what-is-tfp` | 說明概念並區分一般 TFP 和本站當下公開安排。 |
| 第一次拍人像要準備什麼 | `first-portrait-shoot` | 以可執行的服裝、溝通與拍攝前準備回答新手問題。 |
| 不會擺姿勢怎麼拍 | `portrait-posing-guide` | 提供簡單姿勢提示與攝影現場溝通方式。 |
| 棚拍和外拍怎麼選 | `studio-or-outdoor` | 比較光線、天候、場地和費用等選擇因素。 |
| 外拍遇到下雨怎麼安排 | `rainy-day-photoshoot` | 說明備案與事前確認，不保證場地或天候。 |
| 台北外拍地點怎麼選 | `taipei-photo-locations` | 依場景和規則選擇，再連到各地點指南。 |
| 古亭河濱、寶藏巖或信義區夜拍 | 各自既有地點指南 | 只回答已由官方資料或現有照片支持的資訊；許可和費用需向管理單位確認。 |

## 技術參考

- [Astro sitemap integration](https://docs.astro.build/en/guides/integrations-guide/sitemap/)：`serialize` 產生 sitemap 項目的 `lastmod`。
- [Google AI 搜尋指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)：沿用可被索引的一般內容與技術原則，沒有另造 AI 專屬 schema。
- [OpenAI crawler 說明](https://developers.openai.com/api/docs/bots)：未變更 GPTBot 或 OAI-SearchBot 的抓取政策。
- [Cloudflare Static Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/)：限定 legacy 作品清單入口由 Worker 先處理，其餘靜態資產仍由 ASSETS 提供。
