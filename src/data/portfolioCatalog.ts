import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type PortfolioCategory = '外拍' | '棚拍';

interface PortfolioSource {
  slug: string;
  title: string;
  category: PortfolioCategory;
  description: string;
}

export interface PortfolioCollection extends PortfolioSource {
  cover: string;
  href: string;
  images: string[];
  totalImages: number;
}

const portfolioRoot = path.join(process.cwd(), 'public', 'assets', 'portfolio');
const selectionSize = 40;

const sources: PortfolioSource[] = [
  { slug: '260827_敦煌 RE', title: '沙光', category: '外拍', description: '金色光影與異域感造型的戶外人像系列。' },
  { slug: '260712_運動風 RE', title: '躍動', category: '外拍', description: '以動態姿態和俐落節奏構成的運動人像。' },
  { slug: '260621_Y2K RE', title: '千禧熱浪', category: '外拍', description: '帶有千禧年代色彩與街頭感的時尚人像。' },
  { slug: '260614_天使與惡魔 RE', title: '明暗之間', category: '棚拍', description: '以明暗對比展開的雙重角色主題。' },
  { slug: '260530_台博女僕 RE', title: '古典午後', category: '外拍', description: '古典建築場景中的女僕主題人像。' },
  { slug: '260517_中信OL RE', title: '都會節拍', category: '外拍', description: '都會空間與俐落職場造型的結合。' },
  { slug: '260407_師大JK RE', title: '放課之後', category: '外拍', description: '校園街區裡自然輕快的日系寫真。' },
  { slug: '260228_KTM Malaysia+Lalaport RE', title: '南洋途中', category: '外拍', description: '旅行街景與城市光線交織的異地人像。' },
  { slug: '260225_獨立廣場 RE', title: '城市留白', category: '外拍', description: '寬闊城市場景中的旅行人像紀錄。' },
  { slug: '260222_茨厰街 RE', title: '茨廠日光', category: '外拍', description: '老街色彩與生活感交織的城市寫真。' },
  { slug: '260207_古亭河濱公園 RE', title: '河岸微風', category: '外拍', description: '河岸自然光下的清新人像系列。' },
  { slug: '260201_棚拍 RE', title: '靜聽', category: '棚拍', description: '留白、音樂與青春感組成的棚拍系列。' },
  { slug: '260126_兔子天橋 RE', title: '天橋兔影', category: '外拍', description: '城市天橋與可愛造型碰撞的街頭人像。' },
  { slug: '250817_Yune FF COS RE', title: '幻境角色', category: '外拍', description: '角色造型與自然光交織的 Cosplay 系列。' },
  { slug: '6-20海邊jk_', title: '海風制服', category: '外拍', description: '海風、制服與夏日光線的青春寫真。' },
  { slug: '中華娘', title: '東方緋色', category: '外拍', description: '傳統造型與現代城市感交會的人像作品。' },
  { slug: '照片分享', title: '灰階日常', category: '棚拍', description: '柔和室內光與生活感互動的輕寫真。' },
  { slug: '小桃照片', title: '桃色片刻', category: '棚拍', description: '乾淨背景與自然神情構成的室內人像。' },
  { slug: '地雷系', title: '甜酷邊界', category: '外拍', description: '甜酷造型與個性氛圍的主題寫真。' },
  { slug: '🌙', title: '月下低語', category: '外拍', description: '夜色與低光情緒構成的短篇系列。' },
  { slug: 'maid', title: '海線停靠', category: '外拍', description: '海岸車站與冬日光線裡的安靜片刻。' },
  { slug: '信義聖誕節', title: '冬夜霓光', category: '外拍', description: '節慶燈光與城市夜色中的暖色人像。' },
  { slug: '廢土世界', title: '終末之境', category: '外拍', description: '荒涼場景與末日感造型的敘事作品。' },
  { slug: '藍色襯衫', title: '藍調午後', category: '外拍', description: '午後自然光下簡潔清爽的日系人像。' },
  { slug: '學院風棚拍', title: '學院光景', category: '棚拍', description: '制服造型與棚燈層次構成的學院主題。' },
  { slug: '光劍JK', title: '光刃夜行', category: '外拍', description: '夜景、制服與光劍元素的風格創作。' },
  { slug: '午後車站', title: '月台午後', category: '外拍', description: '月台光影與午後情緒的車站寫真。' },
  { slug: '興華天橋', title: '城市縫隙', category: '外拍', description: '城市結構、線條與自然人像的交錯。' },
  { slug: '寶藏嚴', title: '聚落微光', category: '外拍', description: '聚落巷弄與柔和日光中的生活感人像。' },
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

export const portfolioCatalog: PortfolioCollection[] = sources.flatMap((source) => {
  const directory = path.join(portfolioRoot, source.slug);

  if (!existsSync(directory)) return [];

  const files = readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith('.webp') && file.toLowerCase() !== 'cover.webp')
    .sort(naturalSort);

  if (!files.length) return [];

  const selectedFiles = selectEvenly(files, selectionSize);
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

export const portfolioCategories = ['全部', '外拍', '棚拍'] as const;

export const getPortfolioCollection = (slug: string) =>
  portfolioCatalog.find((collection) => collection.slug === slug);
