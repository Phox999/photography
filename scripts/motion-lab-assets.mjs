import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { portfolioCatalog } from '../src/data/portfolioCatalog.ts';
const hero = portfolioCatalog.find(p => p.slug === '260201_棚拍 RE');
const works = [hero, ...portfolioCatalog.slice(0, 5)];
const root = 'public/assets/motion-lab-v2';
await mkdir(root, { recursive: true });
const assets = [];
for (const [i, work] of works.entries()) {
  const source = i === 0 ? '/assets/portfolio/260201_棚拍 RE/_I7A0019.webp' : work.cover;
  const input = `public${decodeURIComponent(source)}`;
  const sizes = {};
  let dimensions;
  for (const width of [960, 1600]) {
    const filename = `work-${i}-${width}.webp`;
    const output = await sharp(input).rotate().resize({width, withoutEnlargement:true}).webp({quality:88}).toFile(`${root}/${filename}`);
    sizes[width] = `/assets/motion-lab-v2/${filename}`;
    if (width === 960) dimensions = { width: output.width, height: output.height };
  }
  assets.push({
    slug: work.slug,
    title: work.title,
    category: work.category,
    styles: work.styles,
    href: work.href,
    source,
    sizes,
    dimensions,
  });
}
await writeFile('src/data/motion-lab-assets.json', JSON.stringify(assets, null, 2));
console.log('Generated six works from original sources at 960/1600 px; originals unchanged.');
