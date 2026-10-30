import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collections, asset } from '../../src/data/design-preview.ts';
import dimensions from '../../src/data/design-preview-images.json' with { type: 'json' };

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(root, '../..');
const output = path.join(root, '.dev-assets');
await mkdir(output, { recursive: true });
for (const directory of ['_astro', 'design-preview']) {
  await cp(path.join(root, 'dist', directory), path.join(output, directory), { recursive: true });
}
const imageOutput = path.join(output, 'assets/design-preview');
await mkdir(imageOutput, { recursive: true });
for (const file of Object.keys(dimensions)) {
  const webp = file.replace('.png', '.webp');
  await cp(path.join(project, 'public/assets/design-preview', webp), path.join(imageOutput, webp));
}
const { readdir } = await import('node:fs/promises');
for (const file of await readdir(path.join(project, 'public/assets/design-preview'))) {
  if (file.endsWith('.svg')) await cp(path.join(project, 'public/assets/design-preview', file), path.join(imageOutput, file));
}
const adminOutput = path.join(output, 'admin-preview');
await mkdir(adminOutput, { recursive: true });
for (const file of ['app.js', 'styles.css', 'icons']) {
  await cp(path.join(project, 'tools/admin-prototype', file), path.join(adminOutput, file), { recursive: true });
}
const adminHtml = await readFile(path.join(project, 'tools/admin-prototype/index.html'), 'utf8');
await writeFile(path.join(adminOutput, 'index.html'), adminHtml.replace('<head>', '<head><base href="/admin-preview/">'));
const seed = collections.map(collection => ({
  id: String(collection.id), title: collection.title, category: collection.id < 8 ? '外拍' : '棚拍',
  description: '設計預覽示意作品', cover: asset(collection.image),
  photos: collection.photos.map(file => ({
    id: asset(file), url: asset(file), thumb: asset(file),
    ratio: dimensions[file].width / dimensions[file].height,
  })),
}));
await writeFile(path.join(adminOutput, 'seed.json'), JSON.stringify(seed));
await writeFile(path.join(output, '404.html'), '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>找不到頁面</title><h1>找不到此預覽頁面</h1><a href="/">返回首頁</a></html>');
console.log(JSON.stringify({ output, albums: seed.length, photoAssets: Object.keys(dimensions).length }));
