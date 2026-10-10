export interface PortfolioEditorialPhoto {
  alt: string;
  caption: string;
}

export interface PortfolioEditorialSection {
  heading: string;
  body: string;
}

export interface PortfolioEditorial {
  coverAlt: string;
  introduction: string;
  sections: PortfolioEditorialSection[];
  photos: Record<string, PortfolioEditorialPhoto>;
  relatedArticles: Array<{ href: string; label: string }>;
}

/** Photo descriptions were matched to the displayed WebP files during a visual review. */
export const portfolioEditorial: Record<string, PortfolioEditorial> = {
  '260207_古亭河濱公園 RE': {
    coverAlt: '模特兒穿著深藍與白色服裝，手持花束站在花草旁',
    introduction: '這組作品在古亭河濱公園拍攝，以花草、開闊環境和自然光呈現清新的戶外人像。畫面從人物近景延伸到河岸周邊，適合參考自然、舒展的外拍方向。',
    sections: [
      { heading: '畫面從花草近景延伸到環境', body: '深藍與白色服裝在綠意和花草前形成清楚的色彩對比。部分照片靠近人物與花束，另一些則保留木構、欄杆或周邊空間，讓同一套造型有不同景深和環境比例。' },
      { heading: '適合參考的拍攝方向', body: '如果想拍明亮的自然光人像，可以先想想希望環境占多少畫面，再準備方便走動的服裝。河岸風勢和日照會改變現場感受，集合入口、移動距離和雨備也應在出發前確認。' },
    ],
    photos: {
      '_I7A3755.webp': { alt: '模特兒蹲在河岸花草旁，身體向鏡頭側傾，穿著深藍與白色服裝', caption: '人物蹲在花草旁向鏡頭側傾，深藍與白色造型帶出清爽色彩。' },
      '_I7A4186.webp': { alt: '模特兒手持花束坐在草地旁，背景留有河岸綠意', caption: '手持花束的坐姿近景，背景仍看得到周邊綠意。' },
      '_I7A4408.webp': { alt: '模特兒坐在木構平台上並手持花束，身後可見木樑與花草', caption: '人物坐在木構平台上手持花束，木樑與周邊花草留在背景。' },
      '_I7A4577.webp': { alt: '模特兒站在河岸花圃旁，雙手舉到頭頂附近，穿著粉色上衣', caption: '人物站在花圃旁舉起雙手，粉色上衣與花叢同框。' },
    },
    relatedArticles: [
      { href: '/journal/guting-riverside-portrait-guide/', label: '古亭河濱拍攝準備指南' },
      { href: '/journal/rainy-day-photoshoot/', label: '雨天拍攝備案' },
    ],
  },
  '寶藏嚴': {
    coverAlt: '模特兒穿著淺色上衣站在樹葉與欄杆前',
    introduction: '這組作品以寶藏巖聚落巷弄、石牆和柔和日光構成生活感人像。照片在街巷步行、坐姿和建築細節之間切換，呈現短距離移動也能有不同背景的拍攝方向。',
    sections: [
      { heading: '利用巷弄和建築留下場景層次', body: '淺色上衣和深色下身在石牆、窗框與綠意前保持辨識度。畫面有坐在椅子旁的停留，也有在巷弄行走的姿態；背景紋理成為畫面的一部分，而不是單純的空白。' },
      { heading: '先確認管理規定與通行', body: '寶藏巖是有人居住與工作使用的聚落，拍攝安排要尊重居民和訪客通行。官方將模特兒攝影列為需依規申請及確認費用的拍攝類型，出發前應向管理單位確認申請條件，不要把一般參觀開放時間視為拍攝許可。' },
    ],
    photos: {
      '01.webp': { alt: '模特兒沿著寶藏巖巷道站立，石牆與植物形成前後層次', caption: '巷道與植物形成不同深度，人物站姿融入聚落環境。' },
      '16.webp': { alt: '模特兒穿著淺色服裝靠在欄杆旁，背景有樹木與遠處建築', caption: '人物靠著欄杆停留，樹木與遠處建築延伸至背景。' },
      '32.webp': { alt: '模特兒坐在木椅上，身後是牆面與門口', caption: '木椅、牆面和門口構成簡潔的巷弄場景。' },
      '47.webp': { alt: '模特兒坐在牆邊的紅木椅上，旁邊可見窗框與牆面', caption: '坐在紅木椅上的人物與窗框、牆面同框。' },
    },
    relatedArticles: [
      { href: '/journal/treasure-hill-portrait-guide/', label: '寶藏巖拍攝準備指南' },
      { href: '/journal/first-portrait-shoot/', label: '第一次外拍準備指南' },
    ],
  },
  '260407_師大JK RE': {
    coverAlt: '模特兒穿白色上衣與格紋裙蹲在置物櫃前，旁邊有書本',
    introduction: '這組作品以制服造型和師大周邊街區為背景，將行走、停留和街道建築放在同一組畫面裡。紅磚、室內走廊與開闊街區提供不同場景層次，適合參考日常清新的外拍風格。',
    sections: [
      { heading: '制服造型與街區線條', body: '白色上衣、格紋裙和黑色靴子在紅磚與街區背景中形成明確輪廓。照片包含街道站姿、室內牆面和較高視角的環境構圖，畫面不只依靠近距離人像，也留下場景資訊。' },
      { heading: '規劃方便移動的外拍路線', body: '街區外拍要預留步行和停留時間，並避開店家出入口或狹窄人行空間。若想參考這類方向，可先選方便活動的服裝和鞋子，再依現場人流調整拍攝位置。' },
    ],
    photos: {
      '_I7A4839.webp': { alt: '模特兒穿白色上衣與格紋裙站在紅磚街景前', caption: '紅磚街景和制服色彩相互襯托，呈現日常街區感。' },
      '_I7A5231.webp': { alt: '模特兒站在鋪面空間中抬頭，格紋裙與黑色靴子入鏡', caption: '人物站在開闊鋪面上抬頭，服裝與周邊空間一同入鏡。' },
      '_I7A5464.webp': { alt: '模特兒站著拿書，另一手靠近臉部，身後是淺色牆面', caption: '人物拿著書站立，抬起另一手靠近臉部。' },
      '_I7A5659.webp': { alt: '模特兒站在紅磚走廊的置物櫃旁，穿著白色上衣與格紋裙', caption: '紅磚走廊與置物櫃構成背景，人物以站姿入鏡。' },
    },
    relatedArticles: [
      { href: '/journal/first-portrait-shoot/', label: '第一次外拍準備指南' },
      { href: '/journal/portrait-posing-guide/', label: '人像動作引導指南' },
    ],
  },
  '信義聖誕節': {
    coverAlt: '模特兒穿紅色服裝與泰迪熊合影，背景是信義區節慶燈飾',
    introduction: '這組信義區夜間人像以紅色造型、泰迪熊和節慶燈光呈現冬日氣氛。照片在近距離人物構圖與大型發光裝置之間切換，適合參考如何把節慶環境帶入夜拍。',
    sections: [
      { heading: '用暖色燈光建立節慶感', body: '紅色服裝和暖色燈飾呼應，泰迪熊也成為畫面中可辨認的節慶元素。近景能看清人物神情，較寬的構圖則留下大型裝置與城市夜色，兩種距離讓同一地點有不同閱讀方式。' },
      { heading: '人潮與活動內容每年都會變', body: '信義商圈的活動、裝置和人潮會依季節與主辦活動調整。出發前請查看當季公告，預留替代位置；在商場、私人場域或活動設施拍攝前，先向管理單位確認規則及是否需要同意。' },
    ],
    photos: {
      '01.webp': { alt: '模特兒穿紅色上衣坐在玩偶與禮物旁，背後是聖誕樹', caption: '人物坐在玩偶和禮物旁，聖誕樹燈飾延伸至背景。' },
      '14.webp': { alt: '模特兒把頭靠在木桌上閉眼休息，旁邊可見小提琴玩偶', caption: '人物靠在木桌上閉眼，玩偶與暖色裝飾留在身旁。' },
      '26.webp': { alt: '模特兒坐在聖誕樹旁拿著禮物，穿著紅色上衣與白色長靴', caption: '人物坐在聖誕樹旁手持禮物，紅色上衣和白靴入鏡。' },
      '39.webp': { alt: '模特兒在紅白熱氣球造型裝置旁跳起，身穿紅色上衣與白色裙裝', caption: '人物在紅白熱氣球裝置旁跳起，城市燈光映在背景。' },
    },
    relatedArticles: [
      { href: '/journal/xinyi-night-portrait-guide/', label: '信義區夜間拍攝準備指南' },
      { href: '/journal/studio-or-outdoor/', label: '棚拍和外拍怎麼選' },
    ],
  },
  '學院風棚拍': {
    coverAlt: '模特兒穿深藍與白色學院風服裝，以俯視構圖入鏡',
    introduction: '這組棚拍以學院風服裝、淺色背景和柔和棚燈呈現青春感。站姿、坐姿與氣球等簡單道具在同一棚景中帶來變化，適合參考背景簡潔、造型明確的棚拍方向。',
    sections: [
      { heading: '讓服裝和姿態成為畫面重點', body: '深藍與白色造型在淺色棚景前有清楚對比。照片包含站立、坐姿和不同視線方向，少量氣球道具提供色彩變化，畫面仍以人物和服裝為主。' },
      { heading: '棚拍前先確認場地條件', body: '棚內拍攝較不受戶外天候影響，但需要先確認棚租時段、背景與設備是否包含在費用內，以及更衣和休息安排。造型和道具可在拍攝前討論，不必準備超出主題需要的物品。' },
    ],
    photos: {
      '01.webp': { alt: '模特兒穿深藍與白色學院風服裝全身站立，雙手抬到額前', caption: '全身站姿與抬起的手勢在淺色背景前清楚呈現。' },
      '25.webp': { alt: '模特兒坐在淺色地面上，雙臂向左右伸展', caption: '坐在地面的姿勢和向兩側伸展的手臂形成開展的畫面。' },
      '49.webp': { alt: '模特兒穿學院風服裝側坐在地面，以手臂支撐身體', caption: '人物側坐在地面用手臂支撐身體，這張照片沒有氣球道具。' },
      '74.webp': { alt: '模特兒穿白色服裝坐在低桌旁，周圍有氣球與小型道具', caption: '白色造型、低桌與氣球道具一起構成這張棚拍畫面。' },
    },
    relatedArticles: [
      { href: '/journal/studio-or-outdoor/', label: '棚拍和外拍怎麼選' },
      { href: '/journal/what-is-tfp/', label: '互惠攝影合作條件指南' },
    ],
  },
  '260614_天使與惡魔 RE': {
    coverAlt: '兩位模特兒穿黑白天使與惡魔造型並肩入鏡，翼飾形成明暗對比',
    introduction: '這組雙人主題作品以黑白天使與惡魔造型、翼飾和花束形成對照。照片以兩位模特兒同框為主，草地、階梯與樹木也留在部分畫面中，主題重點是成對造型和明暗變化。',
    sections: [
      { heading: '用成對造型呈現主題對照', body: '白色羽翼與黑色翼飾在同一組照片中建立辨識度，花束和服裝細節則補充角色方向。雙人合照呈現彼此關係，分開取景時可以看到各自造型和光線變化。' },
      { heading: '雙人拍攝先對齊造型與互動方式', body: '若想嘗試成對主題，可以先確認服裝的色彩關係、道具尺寸和彼此可接受的互動方式。構圖會隨人物距離和站位改變，拍攝前預留討論空間，比照著參考圖逐項複製更實際。' },
    ],
    photos: {
      '_I7A0001.webp': { alt: '穿白色與黑色造型的兩位模特兒近距離同框，白色翼飾與紅花髮飾入鏡', caption: '白色翼飾和紅花髮飾在雙人近景中形成色彩對照。' },
      '_I7A0098.webp': { alt: '白色翼飾模特兒手持花束，身旁可見另一位模特兒', caption: '花束成為前景細節，雙人構圖仍保留角色差異。' },
      '_I7A0200.webp': { alt: '穿白色和黑色造型的兩位模特兒靠近入鏡，背景可見草地與階梯', caption: '雙人近距離構圖保留草地、階梯和白色翼飾。' },
      '_I7A0306.webp': { alt: '白色翼飾模特兒手持花束，黑色服裝模特兒靠近她，背景有樹木', caption: '手持花束的白色造型與黑色服裝人物一同入鏡。' },
    },
    relatedArticles: [
      { href: '/journal/studio-or-outdoor/', label: '棚拍和外拍怎麼選' },
      { href: '/journal/first-portrait-shoot/', label: '第一次拍攝準備指南' },
    ],
  },
};
