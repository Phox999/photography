import { readFile, readdir, writeFile } from 'node:fs/promises';
const root = new URL('../public/assets/icons/', import.meta.url);
const symbols = [];
for (const library of ['lucide', 'feather', 'fontawesome']) {
  for (const file of (await readdir(new URL(`${library}/`, root))).filter(name => name.endsWith('.svg')).sort()) {
    const source = await readFile(new URL(`${library}/${file}`, root), 'utf8');
    const content = source.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
    if (!content || /<(?:script|foreignObject)\b/i.test(content)) throw new Error(`Invalid icon ${file}`);
    const viewBox = source.match(/viewBox="([\d.\s-]+)"/)?.[1] ?? '0 0 24 24';
    const brandPaint = library === 'fontawesome' ? ' fill="currentColor" stroke="none"' : '';
    symbols.push(`<symbol id="${file.slice(0, -4)}" viewBox="${viewBox}"${brandPaint}>${content.trim()}</symbol>`);
  }
}
await writeFile(new URL('sprite.svg', root), `<svg xmlns="http://www.w3.org/2000/svg"><!-- Lucide / Feather / Font Awesome: see adjacent LICENSE files and source.json -->${symbols.join('')}\n</svg>\n`);
console.log(`Built ${symbols.length} official SVG symbols.`);
