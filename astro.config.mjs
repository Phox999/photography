import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import adminBuildIntegration from './scripts/admin-build.mjs';

const journalDirectory = path.join(process.cwd(), 'src', 'content', 'journal');
const journalLastModified = new Map();
for (const fileName of readdirSync(journalDirectory)) {
  if (!fileName.endsWith('.md')) continue;
  const markdown = readFileSync(path.join(journalDirectory, fileName), 'utf8');
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] ?? '';
  if (/^draft:\s*true\s*$/m.test(frontmatter)) continue;
  const date = frontmatter.match(/^updatedDate:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1]
    ?? frontmatter.match(/^publishDate:\s*(\d{4}-\d{2}-\d{2})\s*$/m)?.[1];
  if (date) journalLastModified.set(fileName.replace(/\.md$/, ''), new Date(`${date}T00:00:00.000Z`));
}

const isPublicSitemapPage = (page) => {
  const pathname = new URL(page).pathname;
  return !/^\/(?:admin|client|cooperation-status)(?:\/|$)/.test(pathname)
    && !/^\/apply(?:\/|$)/.test(pathname)
    && !/^\/projects\/preview(?:\/|$)/.test(pathname)
    && !/^\/404(?:\.html)?\/?$/.test(pathname);
};

export default defineConfig({
  output: 'static',
  site: 'https://phox999.com',
  integrations: [
    sitemap({
      filter: isPublicSitemapPage,
      serialize(item) {
        const slug = new URL(item.url).pathname.match(/^\/journal\/([^/]+)\/$/)?.[1];
        const lastmod = slug ? journalLastModified.get(decodeURIComponent(slug)) : undefined;
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
    adminBuildIntegration(),
  ],
});
