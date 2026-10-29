import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portfolioAdminCatalog } from '../../src/data/portfolioCatalog.ts';
import sharp from 'sharp';
import { collections, asset } from '../../src/data/design-preview.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(root, '../../public');
const thumbs = await readFile(path.resolve(root, '../../src/data/portfolio-thumbnails.json'), 'utf8')
  .then(JSON.parse).catch((error) => { if (error.code === 'ENOENT') return {}; throw error; });
const seed = await Promise.all(portfolioAdminCatalog.map(async (item) => ({
  id: item.slug, title: item.title, category: item.category, description: item.description, cover: item.cover,
  photos: await Promise.all(item.images.slice(0, 36).map(async (url) => {
    try {
      const meta = await sharp(path.join(publicRoot, decodeURIComponent(url))).metadata();
      return { id: url, url, thumb: thumbs[url] || url, ratio: (meta.width || 2) / (meta.height || 3) };
    } catch { return null; }
  })),
})));
for (const album of seed) album.photos = album.photos.filter(Boolean);
const availableSeed = seed.filter((album) => album.photos.length > 0);
// A fresh checkout can still run the simulation using the committed design assets.
if (!availableSeed.length) {
  for (const collection of collections) {
    const photos = await Promise.all(collection.photos.map(async (file) => {
      const url = asset(file);
      const meta = await sharp(path.join(publicRoot, url)).metadata();
      return { id: url, url, thumb: url, ratio: meta.width / meta.height };
    }));
    availableSeed.push({ id: String(collection.id), title: collection.title, category: collection.id < 8 ? '外拍' : '棚拍', description: '設計預覽示意作品', cover: asset(collection.image), photos });
  }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/seed.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(availableSeed)); return; }
    const base = pathname.startsWith('/assets/') ? publicRoot : root;
    const target = path.resolve(base, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    await stat(target);
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'text/plain', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex' });
    res.end(await readFile(target));
  } catch { res.writeHead(404).end('Not found'); }
}).listen(4328, '127.0.0.1', () => console.log('Admin prototype: http://127.0.0.1:4328'));
