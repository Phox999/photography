import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type PortfolioCategory = '外拍' | '棚拍';

interface PortfolioSource {
  slug: string;
  title: string;
  category: PortfolioCategory;
  description: string;
  location?: string;
  styles: string[];
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
  shootingType: string;
  date?: string;
}

export interface PortfolioCollection extends PortfolioSource {
  cover: string;
  href: string;
  images: string[];
  totalImages: number;
}

const portfolioRoot = path.join(process.cwd(), 'public', 'assets', 'portfolio');
const selectionSize = 40;
const adminSelectionSize = 500;

// Published category rule: for a slug present in /api/portfolio, its public
// category is canonical. Keep this build-time mirror aligned for static detail
// routes and API-offline fallback; do not infer category from photos or replace
// admin-authored titles, descriptions, slugs, covers, or image order.
// SEO copy stays tied to existing collection names, descriptions, and known
// locations. Unknown shoot locations are intentionally left unset.
const sources: PortfolioSource[] = [
  { slug: '260827_敦煌 RE', title: '敦煌幻境', category: '棚拍', date: '2026-08-27', styles: ['異域造型', '金色光影'], keywords: ['棚拍人像', '異域風格'], shootingType: '棚拍人像', seoTitle: '敦煌幻境｜異域造型棚拍人像攝影｜Phox999', seoDescription: '以金色光影與異域造型呈現主題，畫面保留服裝輪廓與人物姿態，讓角色感成為人像作品的重點。', description: '金色光影與異域感造型是這組作品的主軸。畫面保留服裝輪廓與人物姿態，讓主題自然融入人像作品。' },
  { slug: '260712_運動風 RE', title: '街頭節拍', category: '外拍', date: '2026-07-12', styles: ['運動風', '街頭'], keywords: ['運動人像', '街頭人像'], shootingType: '戶外人像', seoTitle: '街頭節拍｜運動風街頭人像攝影｜Phox999', seoDescription: '以運動風造型和街頭場景拍攝人像，利用動作、姿態與畫面節奏呈現俐落感。作品保留自然活動的張力，也讓服裝與人物個性成為視覺重點。', description: '這組作品以運動風造型和街頭場景拍攝人像，透過動作、姿態與構圖節奏呈現俐落感。畫面保留活動時的張力，也讓服裝與人物個性成為重點。' },
  { slug: '260621_Y2K RE', title: '千禧街色', category: '外拍', date: '2026-06-21', styles: ['Y2K', '街頭時尚'], keywords: ['Y2K人像', '街頭攝影'], shootingType: '戶外人像', seoTitle: '千禧街色｜Y2K 街頭人像攝影｜Phox999', seoDescription: '以千禧年代色彩和街頭時尚為方向，透過造型與城市環境建立鮮明視覺。畫面在人物特寫和場景線條之間切換，呈現輕快、有個性的戶外人像。', description: '以千禧年代色彩和街頭時尚為方向，透過造型與城市環境建立鮮明視覺。人物神情、服裝細節和街景線條相互呼應，呈現輕快而有個性的戶外人像。' },
  { slug: '260614_天使與惡魔 RE', title: '羽翼之間', category: '外拍', date: '2026-06-14', styles: ['天使與惡魔', '明暗對比'], keywords: ['外拍人像', '主題攝影'], shootingType: '戶外人像', seoTitle: '羽翼之間｜天使與惡魔主題外拍｜Phox999', seoDescription: '天使與惡魔雙人主題以黑白服裝、羽翼和花束拉開角色差異，透過雙人同框、近距離構圖與人物互動串連草地、階梯與樹木場景。', description: '這次以天使與惡魔的角色對比為企劃核心，搭配黑白服裝、羽翼和花束。雙人同框、近距離構圖與人物互動，分別帶入草地、階梯和樹木等環境。' },
  { slug: '260530_台博女僕 RE', title: '古館女僕', category: '外拍', date: '2026-05-30', location: '國立臺灣博物館周邊', styles: ['女僕造型', '古典建築'], keywords: ['台北人像攝影', '女僕外拍'], shootingType: '戶外人像', seoTitle: '古館女僕｜臺灣博物館古典風格人像｜Phox999', seoDescription: '女僕造型搭配國立臺灣博物館周邊的古典建築，服裝輪廓、建築線條與自然光一起構成帶有故事感的戶外人像。', description: '女僕造型與古典建築並置，服裝輪廓沿著建築線條展開。人物姿態和自然光讓畫面保有故事感，作品場景位於國立臺灣博物館周邊。' },
  { slug: '260517_中信OL RE', title: '都會步調', category: '外拍', date: '2026-05-17', styles: ['職場造型', '都會'], keywords: ['都會人像', '職場風格'], shootingType: '戶外人像', seoTitle: '都會步調｜職場造型都會人像攝影｜Phox999', seoDescription: '俐落職場造型與都會空間帶出沉穩節奏，人物姿態、服裝線條和街景共同呈現成熟而自在的人像風格。', description: '俐落職場造型與都會空間形成安定的畫面節奏。服裝線條和人物姿態融入周遭街景，呈現沉穩、自在的城市人像。' },
  { slug: '260407_師大JK RE', title: '校園漫步', category: '外拍', date: '2026-04-07', location: '師大周邊', styles: ['制服', '日系清新'], keywords: ['師大人像外拍', '制服人像'], shootingType: '戶外人像', seoTitle: '校園漫步｜師大制服人像外拍｜Phox999', seoDescription: '以制服造型和師大周邊街區為背景，記錄輕鬆自然的校園風人像。畫面保留街巷與人物互動的生活感，適合參考日常、清新的外拍方向。', description: '這組作品以制服造型和師大周邊街區為背景，記錄輕鬆自然的校園風人像。街巷、行走姿態與人物神情保留生活感，呈現日常而清新的外拍方向。' },
  { slug: '260228_KTM Malaysia+Lalaport RE', title: '異地漫遊', category: '外拍', date: '2026-02-28', location: '吉隆坡，馬來西亞', styles: ['旅行街景', '城市光線'], keywords: ['吉隆坡人像攝影', '旅行人像'], shootingType: '城市外拍', seoTitle: '異地漫遊｜吉隆坡城市旅行人像｜Phox999', seoDescription: '在馬來西亞吉隆坡以旅行街景和城市光線拍攝人像，記錄異地行走時的節奏。作品保留街道環境與人物互動，呈現不同於台北日常場景的城市面貌。', description: '這組作品在馬來西亞吉隆坡拍攝，以旅行街景和城市光線記錄異地行走的節奏。畫面保留街道環境與人物互動，呈現不同於台北日常場景的城市面貌。' },
  { slug: '260225_獨立廣場 RE', title: '廣場日光', category: '外拍', date: '2026-02-25', location: '吉隆坡，馬來西亞', styles: ['城市廣場', '旅行人像'], keywords: ['吉隆坡外拍', '城市人像'], shootingType: '城市外拍', seoTitle: '廣場日光｜吉隆坡城市廣場人像｜Phox999', seoDescription: '在吉隆坡獨立廣場，以自然光、開闊空間和城市建築呈現旅行人像。場景尺度與人物位置交錯，留下鮮明的城市輪廓。', description: '吉隆坡獨立廣場的開闊空間與建築輪廓，為人物留下充足的環境比例。自然光勾勒旅行中的人像，也保留廣場本身的城市尺度。' },
  { slug: '260222_茨厰街 RE', title: '茨廠街散步', category: '外拍', date: '2026-02-22', location: '吉隆坡茨廠街', styles: ['老街', '城市生活'], keywords: ['茨廠街人像', '吉隆坡外拍'], shootingType: '城市外拍', seoTitle: '茨廠街散步｜吉隆坡老街人像外拍｜Phox999', seoDescription: '在吉隆坡茨廠街以老街色彩和城市生活感拍攝人像，讓街道紋理、招牌與人物步伐自然進入構圖。作品記錄旅行中的街區氛圍與日常片刻。', description: '這組作品在吉隆坡茨廠街拍攝，以老街色彩和城市生活感為主軸。街道紋理、招牌與人物步伐自然進入構圖，留下旅行途中帶有日常感的人像片刻。' },
  { slug: '260207_古亭河濱公園 RE', title: '河畔花期', category: '外拍', date: '2026-02-07', location: '古亭河濱公園', styles: ['河岸自然光', '清新'], keywords: ['古亭河濱人像', '台北外拍'], shootingType: '河濱外拍', seoTitle: '河畔花期｜古亭河濱公園人像外拍｜Phox999', seoDescription: '這組清新人像在古亭河濱公園拍攝，以深藍、白色服裝和花束為造型線索。河岸自然光、花草與木構場景，以及站姿、坐姿和蹲姿，呈現人物與環境的不同互動。', description: '我以清新自然為企劃方向，在古亭河濱公園搭配深藍、白色服裝和花束拍攝。作品包含站姿、坐姿與蹲姿，也把河岸自然光、花草和木構場景留進畫面。' },
  { slug: '260201_棚拍 RE', title: '耳機白日', category: '棚拍', date: '2026-02-01', styles: ['音樂主題', '青春感'], keywords: ['耳機棚拍', '室內人像'], shootingType: '棚拍人像', seoTitle: '耳機白日｜音樂主題青春棚拍人像｜Phox999', seoDescription: '以耳機、音樂和青春感為主題，透過棚拍留白與人物互動建立輕鬆氛圍。畫面保留簡潔背景，讓神情、手勢和造型成為觀看重點。', description: '耳機與音樂是這組青春感棚拍的主題線索。畫面透過簡潔留白、人物神情和手勢建立輕鬆氛圍，讓造型與互動成為觀看重點。' },
  { slug: '260126_兔子天橋 RE', title: '兔耳奇遇', category: '外拍', date: '2026-01-26', styles: ['兔耳造型', '城市街景'], keywords: ['造型人像', '城市外拍'], shootingType: '城市外拍', seoTitle: '兔耳奇遇｜兔耳造型城市人像外拍｜Phox999', seoDescription: '兔耳造型與城市天橋形成輕巧對比，人物姿態和街道結構帶出趣味感，呈現一組有角色氣氛的戶外人像。', description: '兔耳造型和城市天橋形成輕巧對比。人物姿態與街道結構帶出趣味，讓角色感自然融入城市外拍。' },
  { slug: '250817_Yune FF COS RE', title: '晴空旅人', category: '外拍', date: '2025-08-17', styles: ['Cosplay', '自然光'], keywords: ['Cosplay人像', '角色外拍'], shootingType: '角色外拍', seoTitle: '晴空旅人｜Yune 角色造型戶外人像｜Phox999', seoDescription: '以 Yune 角色造型搭配戶外自然光拍攝，讓服裝細節、人物姿態和環境光線共同呈現角色氣質。作品保留角色扮演的辨識度，也呈現自然的人像表情。', description: '這組戶外 Cosplay 作品以 Yune 角色造型搭配自然光拍攝，讓服裝細節、人物姿態與環境光線共同呈現角色氣質，也保留自然的人像表情。' },
  { slug: '6-20海邊jk_', title: '海風來信', category: '外拍', styles: ['制服', '海邊'], keywords: ['海邊制服外拍', '青春人像'], shootingType: '海邊外拍', seoTitle: '海風來信｜海邊制服人像外拍｜Phox999', seoDescription: '制服與海邊光線構成清爽的青春人像，人物動作和風吹起的衣角帶出輕盈節奏。', description: '制服、海風和明亮的海岸光線構成清爽的畫面。人物動作讓衣角與背景一起流動，留下輕盈的青春感。' },
  { slug: '中華娘', title: '華裳夜行', category: '外拍', styles: ['傳統服飾', '城市氛圍'], keywords: ['傳統服飾人像', '主題外拍'], shootingType: '主題外拍', seoTitle: '華裳夜行｜傳統服飾城市人像攝影｜Phox999', seoDescription: '傳統服飾走進現代城市氛圍，透過衣袖輪廓、人物姿態與環境線條呈現古今交會的主題人像。', description: '傳統服飾與現代城市景物在畫面裡相遇。衣袖輪廓、人物姿態和街景線條並置，呈現古今交會的主題感。' },
  { slug: '照片分享', title: '靜白日常', category: '棚拍', styles: ['柔和室內光', '生活感'], keywords: ['生活感棚拍', '自然人像'], shootingType: '室內人像', seoTitle: '靜白日常｜柔和室內光生活感人像｜Phox999', seoDescription: '以柔和室內光和生活感互動拍攝人像，透過簡潔背景保留人物神情與日常姿態。作品不依賴繁複場景，適合參考自然、安靜的室內拍攝方向。', description: '柔和室內光與生活感互動是這組人像的主要方向。簡潔背景保留人物神情和日常姿態，畫面不依賴繁複場景，呈現自然、安靜的室內拍攝氛圍。' },
  { slug: '小桃照片', title: '樓梯晴光', category: '外拍', styles: ['樓梯線條', '自然神情'], keywords: ['外拍人像', '樓梯人像'], shootingType: '戶外人像', seoTitle: '樓梯晴光｜樓梯線條與自然神情的人像外拍｜Phox999', seoDescription: '以樓梯線條和乾淨背景呈現人物自然神情；構圖在環境線條與留白之間保留層次。', description: '這組人像以樓梯線條和乾淨背景呈現人物自然神情。環境線條與人物留白互相平衡，讓簡單場景也保有層次。' },
  { slug: '地雷系', title: '甜酷霓虹', category: '外拍', styles: ['地雷系造型', '甜酷'], keywords: ['地雷系人像', '主題外拍'], shootingType: '主題外拍', seoTitle: '甜酷霓虹｜地雷系造型主題人像｜Phox999', seoDescription: '地雷系造型和甜酷氣質交織成鮮明主題，服裝層次、人物神情與環境色彩共同建立個性。', description: '地雷系造型與甜酷氣質形成鮮明個性。服裝層次、人物神情和環境色彩彼此呼應，凸顯主題人像的角色感。' },
  { slug: '🌙', title: '月下回眸', category: '外拍', styles: ['夜色', '低光情緒'], keywords: ['夜景人像', '低光攝影'], shootingType: '夜間外拍', seoTitle: '月下回眸｜夜色低光情緒人像攝影｜Phox999', seoDescription: '以夜色和低光拍攝短篇人像，暗部、光線落點與回望神情營造安靜氛圍。', description: '夜色和低光為這組短篇人像定下安靜基調。暗部、光線落點與人物回望的神情留住畫面情緒。' },
  { slug: 'maid', title: '海岸冬日', category: '外拍', location: '跳石車站', styles: ['海岸車站', '冬日光線'], keywords: ['海岸人像', '車站外拍'], shootingType: '海岸外拍', seoTitle: '海岸冬日｜跳石車站冬日人像外拍｜Phox999', seoDescription: '跳石車站的海岸環境和冬日光線，讓站體、海景與人物姿態共同構成安靜的人像畫面。', description: '站體、海岸環境和人物姿態一同進入畫面，冬日光線為這組車站人像帶出安靜的氣氛。' },
  { slug: '信義聖誕節', title: '聖誕暖意', category: '外拍', location: '信義區', styles: ['聖誕燈光', '城市夜景'], keywords: ['信義區人像', '節慶外拍'], shootingType: '夜間外拍', seoTitle: '聖誕暖意｜信義區聖誕燈光人像外拍｜Phox999', seoDescription: '以信義區的節慶燈光和城市夜色拍攝人像，透過暖色光源呈現冬日氣氛。作品保留人物與街景之間的距離感，記錄節慶時節的城市畫面。', description: '這組作品在信義區以節慶燈光和城市夜色拍攝人像，透過暖色光源呈現冬日氣氛。人物與街景保留適當距離，記錄節慶時節的城市畫面。' },
  { slug: '廢土世界', title: '末日微光', category: '外拍', styles: ['廢土感', '敘事造型'], keywords: ['末日主題人像', '風格外拍'], shootingType: '主題外拍', seoTitle: '末日微光｜廢土風格敘事人像攝影｜Phox999', seoDescription: '廢土造型與荒涼氛圍建立敘事人像，人物姿態、服裝細節和環境留白共同呈現末日主題。', description: '廢土感造型與荒涼氛圍建立敘事基調。人物姿態、服裝細節和環境留白共同把主題帶進畫面。' },
  { slug: '藍色襯衫', title: '藍色片刻', category: '外拍', styles: ['藍色襯衫', '午後自然光'], keywords: ['日系人像', '自然光外拍'], shootingType: '戶外人像', seoTitle: '藍色片刻｜午後自然光日系人像外拍｜Phox999', seoDescription: '藍色襯衫與午後自然光呈現清爽的人像風格，人物神情和環境留白讓畫面保持輕鬆。', description: '藍色襯衫和午後自然光帶出清爽簡潔的氛圍。人物神情與環境留白互相襯托，讓畫面保持輕鬆。' },
  { slug: '學院風棚拍', title: '青澀序曲', category: '棚拍', styles: ['學院風', '制服'], keywords: ['學院風棚拍', '制服人像'], shootingType: '棚拍人像', seoTitle: '青澀序曲｜學院風制服棚拍人像｜Phox999', seoDescription: '以學院風制服和棚燈層次呈現青春主題，透過服裝輪廓、人物神情與光線變化建立畫面。簡潔棚景讓視線留在人物和造型細節上。', description: '這組學院風棚拍以制服造型和棚燈層次呈現青春主題。服裝輪廓、人物神情與光線變化共同建立畫面，簡潔棚景讓視線回到人物和造型細節。' },
  { slug: '光劍JK', title: '銀光少女', category: '外拍', styles: ['制服', '光劍主題'], keywords: ['光劍人像', '夜景制服外拍'], shootingType: '主題外拍', seoTitle: '銀光少女｜制服與光劍主題人像外拍｜Phox999', seoDescription: '制服、夜色與光劍元素構成風格創作，利用光源和人物姿態突顯主題辨識度，呈現帶有角色感的夜間人像。', description: '制服、夜色與光劍元素構成這組風格創作。光源和人物姿態突顯主題辨識度，帶出鮮明的角色感。' },
  { slug: '午後車站', title: '午後候車', category: '外拍', styles: ['車站', '午後光影'], keywords: ['車站人像', '午後外拍'], shootingType: '車站外拍', seoTitle: '午後候車｜車站午後光影人像外拍｜Phox999', seoDescription: '車站月台和午後光影帶出等待時的安靜情緒，空間線條、光線方向與人物姿態形成畫面節奏。', description: '月台空間線條與午後光影構成安靜的候車情境。人物姿態留在光線之中，讓畫面帶有等待時的節奏。' },
  { slug: '興華天橋', title: '天橋晴日', category: '外拍', styles: ['城市結構', '自然光'], keywords: ['天橋人像', '城市外拍'], shootingType: '城市外拍', seoTitle: '天橋晴日｜城市天橋自然光人像｜Phox999', seoDescription: '城市天橋的結構線條搭配自然光，人物位置和空間比例共同呈現清爽的城市人像。', description: '天橋結構線條與自然光構成俐落的城市畫面。人物位置和空間比例保留開闊感，讓場景成為人像的一部分。' },
  { slug: '寶藏嚴', title: '巷弄拾光', category: '外拍', location: '寶藏巖', styles: ['聚落巷弄', '生活感'], keywords: ['寶藏巖人像', '台北外拍地點'], shootingType: '巷弄外拍', seoTitle: '巷弄拾光｜寶藏巖聚落人像外拍｜Phox999', seoDescription: '寶藏巖生活感人像以石牆、窗框、階梯和聚落巷弄為場景，記錄行走、倚靠欄杆與木椅坐姿。不同場景深度和人物姿態，讓日常細節一起進入作品。', description: '我以日常生活感為主題，在寶藏巖沿石牆、窗框、階梯與聚落巷弄取景。這組作品拍下巷道行走、倚靠欄杆和木椅坐姿，讓場景深度隨人物姿態改變。' },
];

const naturalSort = (left: string, right: string) =>
  left.localeCompare(right, 'zh-Hant', { numeric: true, sensitivity: 'base' });

const selectEvenly = (files: string[], limit: number) => {
  if (files.length <= limit) return files;

  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.round((index * (files.length - 1)) / (limit - 1));
    return files[sourceIndex];
  });
};

const assetUrl = (slug: string, file: string) =>
  encodeURI(`/assets/portfolio/${slug}/${file}`);

const buildCatalog = (limit: number): PortfolioCollection[] => sources.flatMap((source) => {
  const directory = path.join(portfolioRoot, source.slug);

  if (!existsSync(directory)) return [];

  const files = readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith('.webp')
      && file.toLowerCase() !== 'cover.webp'
      && !/\.seo-\d+\.webp$/i.test(file))
    .sort(naturalSort);

  if (!files.length) return [];

  const selectedFiles = selectEvenly(files, limit);
  const customCover = path.join(directory, 'cover.webp');
  const fallbackCover = selectedFiles[Math.floor(selectedFiles.length * 0.45)] ?? selectedFiles[0];

  return [{
    ...source,
    cover: assetUrl(source.slug, existsSync(customCover) ? 'cover.webp' : fallbackCover),
    href: encodeURI(`/portfolio/${source.slug}/`),
    images: selectedFiles.map((file) => assetUrl(source.slug, file)),
    totalImages: files.length,
  }];
});

export const portfolioCatalog = buildCatalog(selectionSize);
export const portfolioAdminCatalog = buildCatalog(adminSelectionSize);

export const portfolioCategories = ['全部', '外拍', '棚拍'] as const;

export const getPortfolioCollection = (slug: string) =>
  portfolioCatalog.find((collection) => collection.slug === slug);

export const getRelatedPortfolioCollections = (slug: string, limit = 3) => {
  const current = getPortfolioCollection(slug);
  if (!current) return [];

  return portfolioCatalog
    .filter((collection) => collection.slug !== slug)
    .map((collection, index) => {
      const sharedStyles = collection.styles.filter((style) => current.styles.includes(style)).length;
      const sameLocation = Boolean(current.location && current.location === collection.location);
      const score = (collection.category === current.category ? 2 : 0) + sharedStyles * 3 + (sameLocation ? 4 : 0);
      return { collection, index, score };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map(({ collection }) => collection);
};
